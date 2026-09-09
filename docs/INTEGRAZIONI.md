# Configurazione integrazioni

Non inserire token, chiavi o credenziali nel repository, nel browser o nel
backup JSON.

## Google Drive

Google Drive è l'archivio sincronizzato dell'applicazione. Non serve un
backend: Google Drive Desktop sincronizza la cartella tra i PC.

### Collegamento dei dispositivi

1. Installa Google Drive Desktop e attendi che la cartella sia sincronizzata.
2. Apri **Impostazioni → Modalità dati**.
3. Premi **Scegli cartella** e seleziona la cartella dei JSON.
4. Seleziona **Google Drive** per usare quei file come archivio principale.
5. Ripeti la scelta su ogni nuovo PC.

L'EXE accede direttamente al filesystem. Il sito può usare la stessa cartella
solo dopo un gesto esplicito dell'utente e su un browser desktop compatibile
con File System Access API. Se il browser non supporta questa funzione,
l'applicazione mostra un errore e resta disponibile l'import/export manuale.

I file sono:

- `workspace.json`, con configurazione e elenco aziende;
- `company-<id>.json`, uno per ciascuna azienda.

Le scritture dell'EXE sono atomiche. La cartella `Backup json` contiene copie
progressive e immutabili separate dalla sorgente principale.

Procedura iniziale se i dati corretti sono ancora nell'archivio locale:

1. Apri **Impostazioni → Modalità dati**.
2. Scegli la cartella Google Drive.
3. Usa **Copia dati locali nella cartella** e conferma due volte.
4. Da quel momento usa la modalità **Google Drive**.

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
