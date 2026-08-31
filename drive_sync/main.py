import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
DRIVE_API_URL = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
FOLDER_NAME = "Fatture & Incassi Pro"
PAIRING_TTL_SECONDS = 900

DATABASE_PATH = Path(
    os.getenv("DATABASE_PATH", "/data/drive-sync.sqlite3")
)
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY", "")
APP_SECRET = os.getenv("APP_SECRET", "")

app = FastAPI(title="Fatture & Incassi Pro Drive Sync")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class PairingRequest(BaseModel):
    device_name: str = Field(min_length=1, max_length=100)


class StorageWrite(BaseModel):
    content: dict[str, Any]
    expected_revision: str | None = None


def require_configuration() -> None:
    if not all(
        (
            PUBLIC_BASE_URL,
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            TOKEN_ENCRYPTION_KEY,
            APP_SECRET,
        )
    ):
        raise HTTPException(
            status_code=503,
            detail="Servizio Google Drive non configurato",
        )


def cipher() -> Fernet:
    require_configuration()
    try:
        return Fernet(TOKEN_ENCRYPTION_KEY.encode())
    except (ValueError, TypeError) as error:
        raise HTTPException(
            status_code=503,
            detail="Chiave di cifratura non valida",
        ) from error


@contextmanager
def database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
              id TEXT PRIMARY KEY,
              email TEXT NOT NULL,
              refresh_token BLOB NOT NULL,
              drive_folder_id TEXT,
              updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS devices (
              id TEXT PRIMARY KEY,
              account_id TEXT NOT NULL,
              token_hash TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              last_seen_at INTEGER NOT NULL,
              FOREIGN KEY(account_id) REFERENCES accounts(id)
            );
            CREATE TABLE IF NOT EXISTS pairings (
              id TEXT PRIMARY KEY,
              device_name TEXT NOT NULL,
              status TEXT NOT NULL,
              account_id TEXT,
              device_token BLOB,
              email TEXT,
              expires_at INTEGER NOT NULL
            );
            """
        )
        yield connection
        connection.commit()
    finally:
        connection.close()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def state_signature(payload: str) -> str:
    return hmac.new(
        APP_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()


def create_state(pairing_id: str) -> str:
    expires_at = int(time.time()) + PAIRING_TTL_SECONDS
    payload = f"{pairing_id}.{expires_at}"
    return f"{payload}.{state_signature(payload)}"


def verify_state(state: str) -> str:
    try:
        pairing_id, expires_at_text, signature = state.split(".", 2)
        payload = f"{pairing_id}.{expires_at_text}"
        expires_at = int(expires_at_text)
    except (ValueError, TypeError) as error:
        raise HTTPException(status_code=400, detail="Stato OAuth non valido") from error
    if expires_at < int(time.time()) or not hmac.compare_digest(
        signature,
        state_signature(payload),
    ):
        raise HTTPException(status_code=400, detail="Stato OAuth scaduto")
    return pairing_id


def bearer_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Dispositivo non collegato")
    return authorization.removeprefix("Bearer ").strip()


def device_account(device_token: str = Depends(bearer_token)) -> sqlite3.Row:
    with database() as connection:
        row = connection.execute(
            """
            SELECT accounts.*
            FROM devices
            JOIN accounts ON accounts.id = devices.account_id
            WHERE devices.token_hash = ?
            """,
            (token_hash(device_token),),
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=401,
                detail="Collegamento dispositivo non valido",
            )
        connection.execute(
            "UPDATE devices SET last_seen_at = ? WHERE token_hash = ?",
            (int(time.time()), token_hash(device_token)),
        )
        return row


async def refresh_access_token(account: sqlite3.Row) -> str:
    try:
        refresh_token = cipher().decrypt(account["refresh_token"]).decode()
    except InvalidToken as error:
        raise HTTPException(
            status_code=401,
            detail="Ricollega l'account Google",
        ) from error
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=401,
            detail="Autorizzazione Google scaduta: ricollega l'account",
        )
    return response.json()["access_token"]


async def drive_request(
    method: str,
    url: str,
    access_token: str,
    **kwargs: Any,
) -> httpx.Response:
    headers = {
        **kwargs.pop("headers", {}),
        "Authorization": f"Bearer {access_token}",
    }
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.request(
            method,
            url,
            headers=headers,
            **kwargs,
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail="Google Drive non raggiungibile",
        )
    return response


async def ensure_drive_folder(
    account: sqlite3.Row,
    access_token: str,
) -> str:
    if account["drive_folder_id"]:
        return account["drive_folder_id"]
    query = (
        f"name = '{FOLDER_NAME}' and "
        "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    response = await drive_request(
        "GET",
        f"{DRIVE_API_URL}/files",
        access_token,
        params={
            "q": query,
            "spaces": "drive",
            "fields": "files(id,name)",
        },
    )
    files = response.json().get("files", [])
    if files:
        folder_id = files[0]["id"]
    else:
        response = await drive_request(
            "POST",
            f"{DRIVE_API_URL}/files",
            access_token,
            headers={"Content-Type": "application/json"},
            json={
                "name": FOLDER_NAME,
                "mimeType": "application/vnd.google-apps.folder",
            },
            params={"fields": "id"},
        )
        folder_id = response.json()["id"]
    with database() as connection:
        connection.execute(
            "UPDATE accounts SET drive_folder_id = ? WHERE id = ?",
            (folder_id, account["id"]),
        )
    return folder_id


async def find_drive_file(
    folder_id: str,
    key: str,
    access_token: str,
) -> dict[str, Any] | None:
    filename = f"{key}.json"
    response = await drive_request(
        "GET",
        f"{DRIVE_API_URL}/files",
        access_token,
        params={
            "q": (
                f"name = '{filename}' and '{folder_id}' in parents "
                "and trashed = false"
            ),
            "spaces": "drive",
            "fields": "files(id,name,md5Checksum,modifiedTime)",
        },
    )
    files = response.json().get("files", [])
    return files[0] if files else None


def validate_storage_key(key: str) -> str:
    if not key or len(key) > 140 or any(
        character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
        for character in key
    ):
        raise HTTPException(status_code=400, detail="Nome archivio non valido")
    return key


@app.get("/health")
def health():
    return {"ok": True, "configured": all(
        (
            PUBLIC_BASE_URL,
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            TOKEN_ENCRYPTION_KEY,
            APP_SECRET,
        )
    )}


@app.post("/v1/pairings")
def create_pairing(request: PairingRequest):
    require_configuration()
    pairing_id = uuid.uuid4().hex
    expires_at = int(time.time()) + PAIRING_TTL_SECONDS
    with database() as connection:
        connection.execute(
            """
            INSERT INTO pairings(id, device_name, status, expires_at)
            VALUES (?, ?, 'pending', ?)
            """,
            (pairing_id, request.device_name.strip(), expires_at),
        )
    return {
        "pairing_id": pairing_id,
        "authorization_url": (
            f"{PUBLIC_BASE_URL}/oauth/google/start?"
            f"{urlencode({'pairing_id': pairing_id})}"
        ),
        "expires_at": expires_at,
    }


@app.get("/oauth/google/start")
def google_start(pairing_id: str):
    require_configuration()
    with database() as connection:
        pairing = connection.execute(
            "SELECT * FROM pairings WHERE id = ?",
            (pairing_id,),
        ).fetchone()
    if pairing is None or pairing["expires_at"] < int(time.time()):
        raise HTTPException(status_code=404, detail="Collegamento scaduto")
    query = urlencode(
        {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": f"{PUBLIC_BASE_URL}/oauth/google/callback",
            "response_type": "code",
            "scope": f"openid email {DRIVE_SCOPE}",
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": create_state(pairing_id),
        }
    )
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}")


@app.get("/oauth/google/callback", response_class=HTMLResponse)
async def google_callback(code: str, state: str):
    require_configuration()
    pairing_id = verify_state(state)
    with database() as connection:
        pairing = connection.execute(
            "SELECT * FROM pairings WHERE id = ?",
            (pairing_id,),
        ).fetchone()
    if pairing is None or pairing["expires_at"] < int(time.time()):
        raise HTTPException(status_code=404, detail="Collegamento scaduto")
    async with httpx.AsyncClient(timeout=30) as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": f"{PUBLIC_BASE_URL}/oauth/google/callback",
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code >= 400:
            raise HTTPException(
                status_code=400,
                detail="Autorizzazione Google non riuscita",
            )
        token_data = token_response.json()
        user_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={
                "Authorization": f"Bearer {token_data['access_token']}"
            },
        )
    if user_response.status_code >= 400:
        raise HTTPException(
            status_code=400,
            detail="Account Google non leggibile",
        )
    user = user_response.json()
    account_id = str(user["sub"])
    email = str(user.get("email", "Account Google"))
    device_token = secrets.token_urlsafe(48)
    encrypted_device_token = cipher().encrypt(device_token.encode())
    refresh_token = token_data.get("refresh_token")
    now = int(time.time())
    with database() as connection:
        existing = connection.execute(
            "SELECT refresh_token FROM accounts WHERE id = ?",
            (account_id,),
        ).fetchone()
        encrypted_refresh_token = (
            cipher().encrypt(refresh_token.encode())
            if refresh_token
            else existing["refresh_token"] if existing else None
        )
        if encrypted_refresh_token is None:
            raise HTTPException(
                status_code=400,
                detail="Google non ha restituito il rinnovo automatico",
            )
        connection.execute(
            """
            INSERT INTO accounts(id, email, refresh_token, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              email = excluded.email,
              refresh_token = excluded.refresh_token,
              updated_at = excluded.updated_at
            """,
            (account_id, email, encrypted_refresh_token, now),
        )
        connection.execute(
            """
            INSERT INTO devices(
              id, account_id, token_hash, name, created_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                uuid.uuid4().hex,
                account_id,
                token_hash(device_token),
                pairing["device_name"],
                now,
                now,
            ),
        )
        connection.execute(
            """
            UPDATE pairings
            SET status = 'ready', account_id = ?, device_token = ?, email = ?
            WHERE id = ?
            """,
            (
                account_id,
                encrypted_device_token,
                email,
                pairing_id,
            ),
        )
    return HTMLResponse(
        f"""
        <!doctype html>
        <html lang="it">
          <head><meta charset="utf-8"><title>Google Drive collegato</title></head>
          <body style="font-family:system-ui;padding:40px;background:#080b14;color:#fff">
            <h1>Google Drive collegato</h1>
            <p>{escape(email)}</p>
            <p>Puoi chiudere questa pagina e tornare a Fatture &amp; Incassi Pro.</p>
          </body>
        </html>
        """
    )


@app.get("/v1/pairings/{pairing_id}")
def pairing_status(pairing_id: str):
    require_configuration()
    with database() as connection:
        pairing = connection.execute(
            "SELECT * FROM pairings WHERE id = ?",
            (pairing_id,),
        ).fetchone()
    if pairing is None or pairing["expires_at"] < int(time.time()):
        raise HTTPException(status_code=404, detail="Collegamento scaduto")
    if pairing["status"] != "ready":
        return {"status": "pending"}
    return {
        "status": "ready",
        "email": pairing["email"],
        "device_token": cipher().decrypt(pairing["device_token"]).decode(),
    }


@app.get("/v1/session")
def session(account: sqlite3.Row = Depends(device_account)):
    return {"connected": True, "email": account["email"]}


@app.delete("/v1/session")
def revoke_session(device_token: str = Depends(bearer_token)):
    with database() as connection:
        connection.execute(
            "DELETE FROM devices WHERE token_hash = ?",
            (token_hash(device_token),),
        )
    return {"connected": False}


@app.get("/v1/storage/{key}")
async def read_storage(
    key: str,
    account: sqlite3.Row = Depends(device_account),
):
    key = validate_storage_key(key)
    access_token = await refresh_access_token(account)
    folder_id = await ensure_drive_folder(account, access_token)
    drive_file = await find_drive_file(folder_id, key, access_token)
    if drive_file is None:
        raise HTTPException(status_code=404, detail="Archivio non presente")
    response = await drive_request(
        "GET",
        f"{DRIVE_API_URL}/files/{drive_file['id']}",
        access_token,
        params={"alt": "media"},
    )
    try:
        content = response.json()
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502,
            detail="Archivio Drive non valido",
        ) from error
    return {
        "content": content,
        "revision": drive_file.get("md5Checksum")
        or drive_file.get("modifiedTime"),
    }


@app.put("/v1/storage/{key}")
async def write_storage(
    key: str,
    payload: StorageWrite,
    account: sqlite3.Row = Depends(device_account),
):
    key = validate_storage_key(key)
    access_token = await refresh_access_token(account)
    folder_id = await ensure_drive_folder(account, access_token)
    drive_file = await find_drive_file(folder_id, key, access_token)
    current_revision = (
        drive_file.get("md5Checksum") or drive_file.get("modifiedTime")
        if drive_file
        else None
    )
    if (
        drive_file
        and payload.expected_revision
        and payload.expected_revision != current_revision
    ):
        raise HTTPException(
            status_code=409,
            detail="Archivio aggiornato da un altro dispositivo",
        )
    content = json.dumps(
        payload.content,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    if drive_file:
        response = await drive_request(
            "PATCH",
            f"{DRIVE_UPLOAD_URL}/files/{drive_file['id']}",
            access_token,
            headers={"Content-Type": "application/json; charset=utf-8"},
            content=content,
            params={
                "uploadType": "media",
                "fields": "id,md5Checksum,modifiedTime",
            },
        )
    else:
        boundary = f"fip-{secrets.token_hex(16)}"
        metadata = json.dumps(
            {
                "name": f"{key}.json",
                "parents": [folder_id],
                "mimeType": "application/json",
            },
            separators=(",", ":"),
        ).encode()
        multipart = (
            f"--{boundary}\r\nContent-Type: application/json\r\n\r\n".encode()
            + metadata
            + f"\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n".encode()
            + content
            + f"\r\n--{boundary}--\r\n".encode()
        )
        response = await drive_request(
            "POST",
            f"{DRIVE_UPLOAD_URL}/files",
            access_token,
            headers={
                "Content-Type": f"multipart/related; boundary={boundary}"
            },
            content=multipart,
            params={
                "uploadType": "multipart",
                "fields": "id,md5Checksum,modifiedTime",
            },
        )
    result = response.json()
    return {
        "revision": result.get("md5Checksum")
        or result.get("modifiedTime")
    }
