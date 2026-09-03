const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL =
  'https://openidconnect.googleapis.com/v1/userinfo'
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME = 'Fatture & Incassi Pro'
const PAIRING_TTL_SECONDS = 900

const encoder = new TextEncoder()
const decoder = new TextDecoder()

class HttpError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function withCors(response) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(corsHeaders())) {
    headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function requireConfiguration(env) {
  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.TOKEN_ENCRYPTION_KEY ||
    !env.APP_SECRET
  ) {
    throw new HttpError(503, 'Servizio Google Drive non configurato')
  }
}

function configured(env) {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.TOKEN_ENCRYPTION_KEY &&
      env.APP_SECRET,
  )
}

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  )
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function encryptionKey(env) {
  requireConfiguration(env)
  let keyBytes
  try {
    keyBytes = fromBase64Url(env.TOKEN_ENCRYPTION_KEY)
  } catch {
    throw new HttpError(503, 'Chiave di cifratura non valida')
  }
  if (keyBytes.length !== 32) {
    throw new HttpError(503, 'Chiave di cifratura non valida')
  }
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encrypt(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(env),
    encoder.encode(value),
  )
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`
}

async function decrypt(value, env) {
  try {
    const [ivValue, encryptedValue] = value.split('.', 2)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivValue) },
      await encryptionKey(env),
      fromBase64Url(encryptedValue),
    )
    return decoder.decode(decrypted)
  } catch {
    throw new HttpError(401, 'Ricollega l’account Google')
  }
}

async function hmacKey(env) {
  requireConfiguration(env)
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(env.APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function createState(pairingId, env) {
  const expiresAt = Math.floor(Date.now() / 1000) + PAIRING_TTL_SECONDS
  const payload = `${pairingId}.${expiresAt}`
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(env),
    encoder.encode(payload),
  )
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

async function verifyState(state, env) {
  const parts = state.split('.')
  if (parts.length !== 3) {
    throw new HttpError(400, 'Stato OAuth non valido')
  }
  const [pairingId, expiresAtValue, signatureValue] = parts
  const expiresAt = Number(expiresAtValue)
  const payload = `${pairingId}.${expiresAtValue}`
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(env),
    fromBase64Url(signatureValue),
    encoder.encode(payload),
  )
  if (
    !Number.isInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000) ||
    !valid
  ) {
    throw new HttpError(400, 'Stato OAuth scaduto')
  }
  return pairingId
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return toBase64Url(new Uint8Array(digest))
}

function randomToken(byteLength = 48) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'Richiesta non valida')
  }
}

async function readKvJson(env, key) {
  return env.PROCONT_KV.get(key, 'json')
}

async function writeKvJson(env, key, value, options) {
  await env.PROCONT_KV.put(key, JSON.stringify(value), options)
}

function pairingKey(pairingId) {
  return `pairing:${pairingId}`
}

function accountKey(accountId) {
  return `account:${accountId}`
}

function deviceKey(tokenHash) {
  return `device:${tokenHash}`
}

function bearerToken(request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Dispositivo non collegato')
  }
  return authorization.slice('Bearer '.length).trim()
}

async function deviceAccount(request, env) {
  const deviceToken = bearerToken(request)
  const hash = await sha256(deviceToken)
  const device = await readKvJson(env, deviceKey(hash))
  if (!device) {
    throw new HttpError(401, 'Collegamento dispositivo non valido')
  }
  const account = await readKvJson(env, accountKey(device.accountId))
  if (!account) {
    throw new HttpError(401, 'Collegamento dispositivo non valido')
  }
  await writeKvJson(env, deviceKey(hash), {
    ...device,
    lastSeenAt: Math.floor(Date.now() / 1000),
  })
  return { account, deviceToken, hash }
}

async function googleTokenRequest(parameters) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
  })
  if (!response.ok) {
    throw new HttpError(401, 'Autorizzazione Google scaduta: ricollega l’account')
  }
  return response.json()
}

async function refreshAccessToken(account, env) {
  const refreshToken = await decrypt(account.refreshToken, env)
  const tokenData = await googleTokenRequest({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  return tokenData.access_token
}

async function driveRequest(method, url, accessToken, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(url, { ...options, method, headers })
  if (!response.ok) {
    throw new HttpError(502, 'Google Drive non raggiungibile')
  }
  return response
}

function driveQueryValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function ensureDriveFolder(account, accessToken, env) {
  if (account.driveFolderId) return account.driveFolderId
  const query = [
    `name = '${driveQueryValue(FOLDER_NAME)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')
  const listUrl = new URL(`${DRIVE_API_URL}/files`)
  listUrl.search = new URLSearchParams({
    q: query,
    spaces: 'drive',
    fields: 'files(id,name)',
  })
  const listResponse = await driveRequest(
    'GET',
    listUrl.toString(),
    accessToken,
  )
  const files = (await listResponse.json()).files ?? []
  let folderId = files[0]?.id
  if (!folderId) {
    const createUrl = new URL(`${DRIVE_API_URL}/files`)
    createUrl.searchParams.set('fields', 'id')
    const createResponse = await driveRequest(
      'POST',
      createUrl.toString(),
      accessToken,
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      },
    )
    folderId = (await createResponse.json()).id
  }
  account.driveFolderId = folderId
  account.updatedAt = Math.floor(Date.now() / 1000)
  await writeKvJson(env, accountKey(account.id), account)
  return folderId
}

async function findDriveFile(folderId, key, accessToken) {
  const filename = `${key}.json`
  const listUrl = new URL(`${DRIVE_API_URL}/files`)
  listUrl.search = new URLSearchParams({
    q: [
      `name = '${driveQueryValue(filename)}'`,
      `'${driveQueryValue(folderId)}' in parents`,
      'trashed = false',
    ].join(' and '),
    spaces: 'drive',
    fields: 'files(id,name,md5Checksum,modifiedTime,headRevisionId)',
  })
  const response = await driveRequest(
    'GET',
    listUrl.toString(),
    accessToken,
  )
  const files = (await response.json()).files ?? []
  return files[0] ?? null
}

function validateStorageKey(key) {
  if (!key || key.length > 140 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new HttpError(400, 'Nome archivio non valido')
  }
  return key
}

function revision(driveFile) {
  return driveFile?.md5Checksum ?? driveFile?.modifiedTime ?? null
}

async function createPairing(request, env, origin) {
  requireConfiguration(env)
  const body = await readJson(request)
  const deviceName =
    typeof body.device_name === 'string' ? body.device_name.trim() : ''
  if (!deviceName || deviceName.length > 100) {
    throw new HttpError(422, 'Nome dispositivo non valido')
  }
  const pairingId = crypto.randomUUID().replaceAll('-', '')
  const expiresAt = Math.floor(Date.now() / 1000) + PAIRING_TTL_SECONDS
  await writeKvJson(
    env,
    pairingKey(pairingId),
    {
      deviceName,
      status: 'pending',
      expiresAt,
    },
    { expirationTtl: PAIRING_TTL_SECONDS },
  )
  return jsonResponse({
    pairing_id: pairingId,
    authorization_url: `${origin}/oauth/google/start?${new URLSearchParams({
      pairing_id: pairingId,
    })}`,
    expires_at: expiresAt,
  })
}

async function googleStart(url, env, origin) {
  requireConfiguration(env)
  const pairingId = url.searchParams.get('pairing_id') ?? ''
  const pairing = await readKvJson(env, pairingKey(pairingId))
  if (!pairing || pairing.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new HttpError(404, 'Collegamento scaduto')
  }
  const query = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: `${origin}/oauth/google/callback`,
    response_type: 'code',
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: await createState(pairingId, env),
  })
  return Response.redirect(`${GOOGLE_AUTH_URL}?${query}`, 302)
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function googleCallback(url, env, origin) {
  requireConfiguration(env)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    throw new HttpError(400, 'Autorizzazione Google non riuscita')
  }
  const pairingId = await verifyState(state, env)
  const pairing = await readKvJson(env, pairingKey(pairingId))
  if (!pairing || pairing.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new HttpError(404, 'Collegamento scaduto')
  }
  const tokenData = await googleTokenRequest({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: `${origin}/oauth/google/callback`,
    grant_type: 'authorization_code',
  })
  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!userResponse.ok) {
    throw new HttpError(400, 'Account Google non leggibile')
  }
  const user = await userResponse.json()
  const accountId = String(user.sub)
  const email = String(user.email ?? 'Account Google')
  const existingAccount = await readKvJson(env, accountKey(accountId))
  let encryptedRefreshToken = existingAccount?.refreshToken
  if (tokenData.refresh_token) {
    encryptedRefreshToken = await encrypt(tokenData.refresh_token, env)
  }
  if (!encryptedRefreshToken) {
    throw new HttpError(
      400,
      'Google non ha restituito il rinnovo automatico',
    )
  }
  const now = Math.floor(Date.now() / 1000)
  await writeKvJson(env, accountKey(accountId), {
    id: accountId,
    email,
    refreshToken: encryptedRefreshToken,
    driveFolderId: existingAccount?.driveFolderId ?? null,
    updatedAt: now,
  })
  const deviceToken = randomToken()
  const hash = await sha256(deviceToken)
  await writeKvJson(env, deviceKey(hash), {
    accountId,
    name: pairing.deviceName,
    createdAt: now,
    lastSeenAt: now,
  })
  await writeKvJson(
    env,
    pairingKey(pairingId),
    {
      ...pairing,
      status: 'ready',
      accountId,
      deviceToken: await encrypt(deviceToken, env),
      email,
    },
    { expirationTtl: PAIRING_TTL_SECONDS },
  )
  return new Response(
    `<!doctype html>
<html lang="it">
  <head><meta charset="utf-8"><title>Google Drive collegato</title></head>
  <body style="font-family:system-ui;padding:40px;background:#080b14;color:#fff">
    <h1>Google Drive collegato</h1>
    <p>${escapeHtml(email)}</p>
    <p>Puoi chiudere questa pagina e tornare a Fatture &amp; Incassi Pro.</p>
  </body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

async function pairingStatus(pairingId, env) {
  requireConfiguration(env)
  const pairing = await readKvJson(env, pairingKey(pairingId))
  if (!pairing || pairing.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new HttpError(404, 'Collegamento scaduto')
  }
  if (pairing.status !== 'ready') return jsonResponse({ status: 'pending' })
  return jsonResponse({
    status: 'ready',
    email: pairing.email,
    device_token: await decrypt(pairing.deviceToken, env),
  })
}

async function session(request, env) {
  const { account } = await deviceAccount(request, env)
  return jsonResponse({ connected: true, email: account.email })
}

async function revokeSession(request, env) {
  const token = bearerToken(request)
  await env.PROCONT_KV.delete(deviceKey(await sha256(token)))
  return jsonResponse({ connected: false })
}

async function readStorage(request, env, key) {
  key = validateStorageKey(key)
  const { account } = await deviceAccount(request, env)
  const accessToken = await refreshAccessToken(account, env)
  const folderId = await ensureDriveFolder(account, accessToken, env)
  const driveFile = await findDriveFile(folderId, key, accessToken)
  if (!driveFile) {
    throw new HttpError(404, 'Archivio non presente')
  }
  const mediaUrl = new URL(`${DRIVE_API_URL}/files/${driveFile.id}`)
  mediaUrl.searchParams.set('alt', 'media')
  const response = await driveRequest(
    'GET',
    mediaUrl.toString(),
    accessToken,
  )
  let content
  try {
    content = await response.json()
  } catch {
    throw new HttpError(502, 'Archivio Drive non valido')
  }
  return jsonResponse({ content, revision: revision(driveFile) })
}

async function listStorageRevisions(request, env, key) {
  key = validateStorageKey(key)
  const { account } = await deviceAccount(request, env)
  const accessToken = await refreshAccessToken(account, env)
  const folderId = await ensureDriveFolder(account, accessToken, env)
  const driveFile = await findDriveFile(folderId, key, accessToken)
  if (!driveFile) {
    throw new HttpError(404, 'Archivio non presente')
  }
  const revisionsUrl = new URL(
    `${DRIVE_API_URL}/files/${driveFile.id}/revisions`,
  )
  revisionsUrl.search = new URLSearchParams({
    pageSize: '100',
    fields:
      'revisions(id,modifiedTime,size,keepForever,md5Checksum)',
  })
  const response = await driveRequest(
    'GET',
    revisionsUrl.toString(),
    accessToken,
  )
  const revisions = ((await response.json()).revisions ?? [])
    .map((item) => ({
      id: item.id,
      modified_time: item.modifiedTime,
      size: Number(item.size ?? 0),
      keep_forever: Boolean(item.keepForever),
      checksum: item.md5Checksum ?? null,
    }))
    .sort((left, right) =>
      String(right.modified_time).localeCompare(String(left.modified_time)),
    )
  return jsonResponse({
    current_revision: revision(driveFile),
    current_revision_id: driveFile.headRevisionId ?? null,
    revisions,
  })
}

function validateRevisionId(revisionId) {
  if (
    !revisionId ||
    revisionId.length > 140 ||
    !/^[A-Za-z0-9_-]+$/.test(revisionId)
  ) {
    throw new HttpError(400, 'Versione archivio non valida')
  }
  return revisionId
}

async function keepDriveRevision(fileId, revisionId, accessToken) {
  const keepUrl = new URL(
    `${DRIVE_API_URL}/files/${fileId}/revisions/${revisionId}`,
  )
  keepUrl.searchParams.set('fields', 'id,keepForever')
  await driveRequest('PATCH', keepUrl.toString(), accessToken, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keepForever: true }),
  })
}

async function createDriveBackupCopy(
  driveFile,
  folderId,
  key,
  accessToken,
) {
  const backupUrl = new URL(
    `${DRIVE_API_URL}/files/${driveFile.id}/copy`,
  )
  backupUrl.searchParams.set('fields', 'id,name')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const response = await driveRequest(
    'POST',
    backupUrl.toString(),
    accessToken,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `backup-${key}-${timestamp}.json`,
        parents: [folderId],
      }),
    },
  )
  return response.json()
}

async function restoreStorageRevision(request, env, key, revisionId) {
  key = validateStorageKey(key)
  revisionId = validateRevisionId(revisionId)
  const payload = await readJson(request)
  const { account } = await deviceAccount(request, env)
  const accessToken = await refreshAccessToken(account, env)
  const folderId = await ensureDriveFolder(account, accessToken, env)
  const driveFile = await findDriveFile(folderId, key, accessToken)
  if (!driveFile) {
    throw new HttpError(404, 'Archivio non presente')
  }
  if (payload.expected_revision !== revision(driveFile)) {
    throw new HttpError(
      409,
      'Archivio aggiornato da un altro dispositivo: ricarica le versioni',
    )
  }
  const backupFile = await createDriveBackupCopy(
    driveFile,
    folderId,
    key,
    accessToken,
  )
  await keepDriveRevision(driveFile.id, revisionId, accessToken)
  const revisionUrl = new URL(
    `${DRIVE_API_URL}/files/${driveFile.id}/revisions/${revisionId}`,
  )
  revisionUrl.searchParams.set('alt', 'media')
  const revisionResponse = await driveRequest(
    'GET',
    revisionUrl.toString(),
    accessToken,
  )
  let content
  try {
    content = await revisionResponse.json()
  } catch {
    throw new HttpError(502, 'Versione Cloud non leggibile')
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new HttpError(502, 'Versione Cloud non valida')
  }
  const updateUrl = new URL(`${DRIVE_UPLOAD_URL}/files/${driveFile.id}`)
  updateUrl.search = new URLSearchParams({
    uploadType: 'media',
    fields: 'id,md5Checksum,modifiedTime,headRevisionId',
  })
  const response = await driveRequest(
    'PATCH',
    updateUrl.toString(),
    accessToken,
    {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(content),
    },
  )
  const restoredFile = await response.json()
  return jsonResponse({
    backup_name: backupFile.name,
    revision: revision(restoredFile),
    revision_id: restoredFile.headRevisionId ?? null,
  })
}

async function writeStorage(request, env, key) {
  key = validateStorageKey(key)
  const payload = await readJson(request)
  if (
    !payload.content ||
    typeof payload.content !== 'object' ||
    Array.isArray(payload.content)
  ) {
    throw new HttpError(422, 'Archivio non valido')
  }
  const { account } = await deviceAccount(request, env)
  const accessToken = await refreshAccessToken(account, env)
  const folderId = await ensureDriveFolder(account, accessToken, env)
  const driveFile = await findDriveFile(folderId, key, accessToken)
  const currentRevision = revision(driveFile)
  if (
    driveFile &&
    payload.expected_revision !== currentRevision
  ) {
    throw new HttpError(
      409,
      'Archivio aggiornato da un altro dispositivo',
    )
  }
  const content = JSON.stringify(payload.content)
  let response
  if (driveFile) {
    const updateUrl = new URL(
      `${DRIVE_UPLOAD_URL}/files/${driveFile.id}`,
    )
    updateUrl.search = new URLSearchParams({
      uploadType: 'media',
      fields: 'id,md5Checksum,modifiedTime',
    })
    response = await driveRequest(
      'PATCH',
      updateUrl.toString(),
      accessToken,
      {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: content,
      },
    )
  } else {
    const boundary = `fip-${crypto.randomUUID()}`
    const metadata = JSON.stringify({
      name: `${key}.json`,
      parents: [folderId],
      mimeType: 'application/json',
    })
    const multipart =
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      `${metadata}\r\n--${boundary}\r\n` +
      `Content-Type: application/json; charset=utf-8\r\n\r\n` +
      `${content}\r\n--${boundary}--\r\n`
    const createUrl = new URL(`${DRIVE_UPLOAD_URL}/files`)
    createUrl.search = new URLSearchParams({
      uploadType: 'multipart',
      fields: 'id,md5Checksum,modifiedTime',
    })
    response = await driveRequest(
      'POST',
      createUrl.toString(),
      accessToken,
      {
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    )
  }
  return jsonResponse({ revision: revision(await response.json()) })
}

async function route(request, env) {
  const url = new URL(request.url)
  const origin = url.origin
  const method = request.method

  if (method === 'OPTIONS') return new Response(null, { status: 204 })
  if (method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ ok: true, configured: configured(env) })
  }
  if (method === 'POST' && url.pathname === '/v1/pairings') {
    return createPairing(request, env, origin)
  }
  if (method === 'GET' && url.pathname === '/oauth/google/start') {
    return googleStart(url, env, origin)
  }
  if (method === 'GET' && url.pathname === '/oauth/google/callback') {
    return googleCallback(url, env, origin)
  }
  const pairingMatch = url.pathname.match(/^\/v1\/pairings\/([^/]+)$/)
  if (method === 'GET' && pairingMatch) {
    return pairingStatus(decodeURIComponent(pairingMatch[1]), env)
  }
  if (url.pathname === '/v1/session' && method === 'GET') {
    return session(request, env)
  }
  if (url.pathname === '/v1/session' && method === 'DELETE') {
    return revokeSession(request, env)
  }
  const storageMatch = url.pathname.match(/^\/v1\/storage\/([^/]+)$/)
  if (storageMatch && method === 'GET') {
    return readStorage(
      request,
      env,
      decodeURIComponent(storageMatch[1]),
    )
  }
  if (storageMatch && method === 'PUT') {
    return writeStorage(
      request,
      env,
      decodeURIComponent(storageMatch[1]),
    )
  }
  const revisionsMatch = url.pathname.match(
    /^\/v1\/storage\/([^/]+)\/revisions$/,
  )
  if (revisionsMatch && method === 'GET') {
    return listStorageRevisions(
      request,
      env,
      decodeURIComponent(revisionsMatch[1]),
    )
  }
  const restoreRevisionMatch = url.pathname.match(
    /^\/v1\/storage\/([^/]+)\/revisions\/([^/]+)\/restore$/,
  )
  if (restoreRevisionMatch && method === 'POST') {
    return restoreStorageRevision(
      request,
      env,
      decodeURIComponent(restoreRevisionMatch[1]),
      decodeURIComponent(restoreRevisionMatch[2]),
    )
  }
  throw new HttpError(404, 'Risorsa non trovata')
}

export default {
  async fetch(request, env) {
    try {
      return withCors(await route(request, env))
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ detail: error.detail }, error.status)
      }
      console.error(error)
      return jsonResponse({ detail: 'Errore interno del servizio' }, 500)
    }
  },
}
