# Fatture & Incassi Pro

Applicazione web e desktop per acquisire fotografie di fatture e incassi, revisionare i dati estratti e calcolare il venit per punto vendita.

Ogni punto vendita appartiene a una sola azienda contabile e ha una sola
venditrice responsabile. Il numero WhatsApp/Viber della venditrice costituisce
la chiave univoca usata dal futuro backend per instradare ogni documento verso
l'azienda e il punto vendita corretti.

## Funzioni disponibili

- interfaccia responsive scura ciano/viola;
- desktop Windows, macOS e Linux con Electron;
- accesso email/password e Google quando Firebase è configurato;
- anteprima locale per titolare e contabile;
- punti vendita con una venditrice responsabile;
- gestione compatibile di più aziende contabili storiche;
- inserimento manuale, modifica e cancellazione di fatture e incassi;
- acconti, saldi e distribuzione a cascata dei pagamenti fornitore;
- incassi cash, POS, ritiri e totale reale comprensivo del non dichiarato;
- anagrafiche venditori e fornitori;
- affitti, fatture del contabile, stipendi e tasse;
- situazione settimanale, mensile e annuale;
- utile ufficiale/reale, IVA a credito/debito e venit stock;
- statistiche venditori/fornitori e pronostico di fine stagione;
- importazione senza perdita del JSON v5 di Contabilità Pro;
- backup JSON completo e compatibile, export Excel/CSV e stampa PDF;
- archivio Locale su IndexedDB/web o file applicativo/desktop;
- archivio Cloud su Firestore con passaggio protetto tra modalità;
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

## Firebase

Compilare `.env.local` con la configurazione web Firebase. Senza configurazione, l'app offre una modalità di anteprima locale e mantiene disabilitato l'archivio cloud.

Il backend WhatsApp/Viber, l'OCR e il collegamento Google Drive vengono
implementati nelle fasi successive. Contabilità Pro può già essere importata
dalle Impostazioni usando il backup JSON v5; l'esportazione compatibile
permette anche di mantenere una copia riapribile nel programma precedente.
