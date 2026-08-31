# Fatture & Incassi Pro

Applicazione web e desktop per acquisire fotografie di fatture e incassi, revisionare i dati estratti e calcolare il venit per punto vendita.

Ogni punto vendita appartiene a una sola azienda contabile e ha una sola
venditrice responsabile. WhatsApp usa il numero telefonico come chiave
univoca; Viber usa l'identificativo utente fornito dal bot e collegato alla
venditrice. Il futuro backend userà queste chiavi per instradare ogni documento
verso l'azienda e il punto vendita corretti.

## Funzioni disponibili

- interfaccia responsive scura ciano/viola;
- desktop Windows, macOS e Linux con Electron;
- accesso email/password e Google quando Firebase è configurato;
- anteprima locale per titolare e contabile;
- punti vendita con una venditrice responsabile;
- gestione compatibile di più aziende contabili storiche;
- inserimento manuale, modifica e cancellazione di fatture e incassi;
- acconti, saldi e distribuzione a cascata dei pagamenti fornitore;
- pagina fatture pagate con ricerca per fornitore o numero;
- incassi cash, POS, ritiri e totale reale comprensivo del non dichiarato;
- anagrafiche venditori e fornitori;
- affitti, fatture del contabile, stipendi, tasse e altre spese;
- spese fisse mensili ripartite nel periodo selezionato;
- situazione settimanale, mensile e annuale;
- utile ufficiale/reale, IVA a credito/debito e venit stock;
- statistiche venditori/fornitori e pronostico di fine stagione;
- importazione senza perdita del JSON v5 di Contabilità Pro;
- backup JSON completo e compatibile, export Excel/CSV e stampa PDF;
- archivio Locale su IndexedDB/web o file applicativo/desktop;
- archivio Cloud su Google Drive con collegamento OAuth per dispositivo;
- base per foto in arrivo, revisione e sincronizzazione.

## Sviluppo

```bash
nvm use
cp .env.example .env.local
npm install
npm run dev
```

## Verifiche

```bash
npm run lint
npm run build
npm run desktop:pack
```

## Google Drive

La build di produzione usa il Cloudflare Worker configurato in
`.env.production`. Per lo sviluppo si può sovrascrivere
`VITE_DRIVE_SYNC_URL` in `.env.local`. Senza servizio configurato
l'applicazione resta in modalità locale. Il collegamento si esegue una volta
per dispositivo da
**Impostazioni → Accedi con Google Drive**; il refresh token resta cifrato nel
servizio e non viene mai scritto nel backup contabile.

Firebase resta utilizzabile solo per l'accesso email/password esistente.

Il backend WhatsApp/Viber, l'OCR e il collegamento Google Drive vengono
implementati nelle fasi successive. Contabilità Pro può già essere importata
dalle Impostazioni usando il backup JSON v5; l'esportazione compatibile
permette anche di mantenere una copia riapribile nel programma precedente.

La procedura operativa per predisporre Google Drive, WhatsApp Business Cloud
API e Viber Bot API è in [docs/INTEGRAZIONI.md](docs/INTEGRAZIONI.md).
