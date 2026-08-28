# Fatture & Incassi Pro

Applicazione web e desktop per acquisire fotografie di fatture e incassi, revisionare i dati estratti e calcolare il venit per punto vendita.

## Fase 1

- interfaccia responsive scura ciano/viola;
- desktop Windows, macOS e Linux con Electron;
- accesso email/password e Google quando Firebase è configurato;
- anteprima locale per titolare e contabile;
- una società con più punti vendita;
- una venditrice responsabile per punto vendita;
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

Il backend WhatsApp/Viber, l'OCR, Google Drive e il connettore Contabilità Pro vengono implementati nelle fasi successive.
