# Configurazione integrazioni

Queste integrazioni richiedono un backend pubblico HTTPS sempre attivo. Non
inserire token, chiavi o credenziali nel repository, nel browser o nel backup
JSON.

## Google Drive

Google Drive è l'archivio sincronizzato dell'applicazione. Il servizio
`drive_sync` conserva il refresh token cifrato lato server; i dispositivi
ricevono soltanto un token di dispositivo revocabile, mai salvato nel JSON
contabile.

### Configurazione Google Cloud

1. Crea un progetto su https://console.cloud.google.com/.
2. Abilita **Google Drive API**.
3. Configura la schermata di consenso OAuth e aggiungi l'account proprietario
   come utente autorizzato.
4. Crea una credenziale **ID client OAuth → Applicazione web**.
5. Come URI di reindirizzamento inserisci
   `https://SERVIZIO/oauth/google/callback`.
6. Annota `client_id` e `client_secret`.

### Avvio del servizio

Segreti richiesti dal servizio:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PUBLIC_BASE_URL`
- `TOKEN_ENCRYPTION_KEY` (chiave Fernet)
- `APP_SECRET`

Il frontend richiede solo `VITE_DRIVE_SYNC_URL` con l'indirizzo pubblico del
servizio.

### Collegamento dei dispositivi

1. Apri **Impostazioni → Modalità dati**.
2. Premi **Accedi con Google Drive**.
3. Autorizza l'account Google nella pagina che si apre.
4. Torna nell'applicazione: il collegamento viene rilevato automaticamente.
5. Seleziona **Cloud** per usare Drive come archivio principale.
6. Ripeti la procedura una volta su ogni dispositivo (PC, Android, iPhone,
   tablet): l'account Google resta lo stesso e i dati sono condivisi.

I file vengono creati nella cartella Drive `Fatture Incassi Pro`, con un JSON
per ogni azienda più l'archivio comune. Il salvataggio verifica la revisione
del file e blocca la scrittura se un altro dispositivo ha già aggiornato i
dati.

La cartella locale di Google Drive per desktop resta disponibile come backup
aggiuntivo nell'EXE.

Documentazione:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/drive/api/guides/manage-uploads

## WhatsApp Business Cloud API

1. Crea o usa un Meta Business Portfolio verificato.
2. In Meta for Developers crea un'app di tipo Business e aggiungi il prodotto
   WhatsApp.
3. Collega il WhatsApp Business Account e il numero business che riceverà le
   fotografie.
4. Annota `PHONE_NUMBER_ID` e `WHATSAPP_BUSINESS_ACCOUNT_ID`.
5. Per produzione crea un system user e un token permanente con i permessi
   minimi necessari, tra cui `whatsapp_business_messaging` e, quando richiesto
   dalla gestione dell'account, `whatsapp_business_management`.
6. Pubblica due endpoint HTTPS:
   - `GET /webhooks/whatsapp` per restituire `hub.challenge` dopo aver
     verificato `hub.verify_token`;
   - `POST /webhooks/whatsapp` per ricevere i callback.
7. Nella configurazione Webhooks dell'app inserisci URL e verify token, poi
   sottoscrivi il campo `messages` per il WhatsApp Business Account.
8. Per un messaggio immagine leggi `messages[].from` e l'ID media. Risolvi il
   mittente tramite la gerarchia ragazza → bar → azienda.
9. Richiedi i metadati media con `GET /MEDIA_ID`, quindi scarica subito l'URL
   temporaneo con header `Authorization: Bearer ...` e conserva l'originale
   nello storage documentale.
10. Se il mittente è sconosciuto o ambiguo, invia il documento alla coda di
    revisione senza assegnarlo automaticamente.
11. Dopo il salvataggio rispondi tramite `/{PHONE_NUMBER_ID}/messages` con
    “ricevuto correttamente” oppure con la richiesta di una nuova fotografia.

Segreti backend consigliati:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`

Documentazione:
- https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/
- https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/

## Viber Bot API

Dal 5 febbraio 2024 i nuovi bot Viber sono disponibili solo a condizioni
commerciali, direttamente tramite Rakuten Viber o un partner ufficiale.

1. Richiedi e attiva un chatbot Viber commerciale.
2. Recupera il token del bot dall'account amministratore.
3. Pubblica `POST /webhooks/viber` su HTTPS con certificato valido; Viber non
   accetta certificati autofirmati.
4. Chiama `https://chatapi.viber.com/pa/set_webhook` con header
   `X-Viber-Auth-Token` e un corpo contenente l'URL pubblico e l'evento
   `message`.
5. L'endpoint deve rispondere HTTP 200 anche al callback iniziale di verifica.
6. Nei messaggi immagine scarica subito il contenuto dal riferimento media,
   verifica tipo e dimensione e conserva la fotografia originale.
7. Viber espone `sender.id`, non il numero telefonico. Al primo messaggio,
   copia questo valore nel campo **ID utente Viber** della venditrice corretta
   nella pagina **Punti vendita**; da quel momento il routing determina bar e
   azienda.
8. Mittenti non collegati o duplicati devono restare nella coda di revisione.
9. Il webhook deve rispondere entro 5 secondi; OCR e analisi vanno eseguiti in
   coda asincrona.

Segreto backend consigliato:
- `VIBER_BOT_TOKEN`

Documentazione:
- https://developers.viber.com/docs/api/rest-bot-api/

## Flusso comune

Entrambi i canali devono convergere nello stesso processo:

1. verifica firma/autenticità del webhook;
2. deduplicazione dell'evento;
3. download immediato della foto;
4. risoluzione mittente;
5. archiviazione nell'azienda e nel bar corretti;
6. OCR e classificazione;
7. revisione manuale per dati incerti o documento non riconosciuto;
8. registrazione contabile solo dopo le regole di approvazione;
9. backup periodico su Google Drive.
