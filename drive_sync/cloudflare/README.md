# Cloudflare Worker

Il Worker espone la stessa API del servizio FastAPI e usa Google Drive come
archivio. Cloudflare KV conserva soltanto refresh token cifrati, dispositivi e
pairing OAuth.

Configurazione richiesta:

- binding KV `PROCONT_KV`;
- secret `GOOGLE_OAUTH_CLIENT_ID`;
- secret `GOOGLE_OAUTH_CLIENT_SECRET`;
- secret `TOKEN_ENCRYPTION_KEY` (32 byte in Base64);
- secret `APP_SECRET`.

L'URI OAuth Google è:

```text
https://procont-drive-sync.procont-bpcall.workers.dev/oauth/google/callback
```
