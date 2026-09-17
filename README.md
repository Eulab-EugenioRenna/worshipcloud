# Worship Cloud

Worship Cloud è un sistema web per preparare un servizio, costruire la scaletta
e controllare in tempo reale i contenuti mostrati durante una celebrazione.

Il prodotto attuale è un MVP operativo full stack. Non genera un flusso video:
pubblica stato e contenuti semantici verso pagine browser dedicate, che possono
essere aperte su un display, su un computer di palco oppure come Browser Input
in software come vMix.

## Cosa comprende oggi

Il flusso principale è lineare:

1. un utente crea o apre la propria organizzazione;
2. prepara librerie, canzoni, passi biblici, slide, media e countdown;
3. crea un servizio e ordina le cue nella lineup;
4. assegna layout globali alle quattro View di uscita;
5. avvia una Live Session e controlla Preview e Program;
6. ogni output riceve lo stesso stato live e lo renderizza secondo la propria
   View.

```text
Angular Control Room
        │ REST + Socket.IO
        ▼
NestJS API ─── PostgreSQL
        │          └─ dati, sessioni live, eventi e notifiche
        ├────── Redis (distribuzione realtime)
        └────── Browser outputs
                ├─ Preview
                ├─ Main
                ├─ Stage
                ├─ Prompter
                └─ Alpha
```

### Autenticazione e organizzazioni

- registrazione, login, refresh token con rotazione e logout;
- bootstrap automatico di organizzazione e prima location;
- ruoli `Owner`, `Admin`, `Leader`, `Operator`, `Member` e `Viewer`;
- gestione di membri, ruoli e location;
- autorizzazioni applicate sia alle API sia al controllo Live.

### Pianificazione dei servizi

- servizi con data, ora, location, responsabile, note e stato;
- readiness separata per team, media, presentazione e output;
- lineup ordinabile, modificabile e duplicabile;
- cue supportate: Song, Bible, Slide, Image, Video, Audio, Countdown, Clock,
  Sermon, Text e Blank;
- viste specifiche della cue collegate ai layout globali, senza duplicare la
  sorgente originale.

### Team, eventi e notifiche

- assegnazioni di servizio con ruolo operativo, nota e stato;
- stati Pending, Accepted, Declined, Unavailable e Replacement Requested;
- vista personale degli incarichi ricevuti;
- eventi di dominio persistiti e distribuiti in tempo reale tramite Redis e
  SSE autenticato;
- notifiche personali, conteggio non letti e marcatura singola o completa come
  letta.

### Canzoni

- creazione, modifica, eliminazione e import JSON;
- sezioni, arrangiamenti, traduzioni e generazione tramite LibreTranslate;
- import da endpoint HTTPS conformi al DTO condiviso;
- `SongStep` canonici usati da tutti gli output;
- modifica manuale degli step, valida fino alla sincronizzazione successiva;
- rigenerazione automatica al salvataggio del testo o delle sezioni da Edit
  Song, all'inserimento nella lineup e al Go Live;
- pagine Main, Stage, Prompter e Alpha derivate dagli stessi step senza perdere
  righe o spezzare uno step canonico;
- scelta di un layout globale per output, senza override locale nascosto del
  numero di righe.

La precedenza delle regole è:

1. `stepGenerator` della View Alpha: crea la sequenza canonica degli step;
2. `stepsPerSlide` della singola View globale: decide quanti step mostrare
   insieme su quell'output;
3. Edit Song: sceglie il layout e mostra l'anteprima, ma non sostituisce le
   regole globali.

### Bibbia

- import JSON canonico e file Zefania `XMLBIBLE`;
- sorgente pubblica GetBible.net v2 inclusa;
- import incrementale che aggiorna i versi forniti senza eliminare gli altri;
- ricerca per riferimento, inclusi formati compatti come `Gv3` e `Gv3:16`;
- creazione di cue per un verso, un intervallo o un capitolo;
- traduzioni di supporto generate tramite LibreTranslate;
- avanzamento Live di un verso per step, con riferimento esplicito.

### Libreria e View

- registro di media remoti per URL: immagini, video, audio, motion background,
  logo e countdown video;
- slide testuali e canvas visuali;
- countdown a durata oppure con orario obiettivo;
- layout globali per tipo di contenuto e output;
- quattro Default protetti: Main, Stage, Prompter e Alpha;
- duplicazione, modifica del canvas, anteprima e ripristino dei Default;
- propagazione di una modifica globale alle viste derivate e alle sessioni Live
  attive.

### Live Control

Il modello Live distingue sempre:

- **Preview**: cue preparata dall'operatore;
- **Program**: cue effettivamente in onda;
- **Take**: promuove Preview a Program;
- **Clear**: rimuove Program conservando Preview;
- **Blackout**: copre Main e Alpha senza distruggere la selezione corrente.

Sono inoltre disponibili:

- navigazione tra cue e step visuali;
- scorciatoie per Verse e sezioni musicali;
- richiesta, accettazione e rilascio del controllo Program tra operatori;
- messaggi operatore per Stage e Prompter;
- countdown Start, Pause, Resume e Reset, con nome e tempo aggiornato;
- preparazione della cue successiva alla fine dell'ultimo step;
- chiusura e riapertura ripetibile di una Live Session sullo stesso servizio.

Scorciatoie principali:

- `←` / `→`: step visuale precedente o successivo;
- all'ultimo step, il primo `→` prepara la cue successiva e il secondo la
  seleziona;
- `↑` / `↓`: cambia cue senza eseguire Take;
- `Esc`: Clear del Program;
- `1`–`9`: Verse 1–9;
- `I`, `P`, `C`, `B`, `T`, `E`: Intro, Pre-Chorus, Chorus, Bridge, Tag ed
  Ending.

### Output browser

Ogni Live Session produce URL distinti per:

- Control;
- Preview;
- Main;
- Stage;
- Prompter;
- Alpha.

Gli output leggono uno stato iniziale protetto da access key e ricevono gli
aggiornamenti successivi via Socket.IO. Main è adatto a browser fullscreen o
HDMI; Stage e Prompter mostrano informazioni dedicate; Alpha è pensato per un
Browser Input di vMix.

## Limiti attuali

- Alpha è previsto dal dominio e il canvas Default usa uno sfondo trasparente,
  ma il CSS globale e il contenitore del canvas applicano ancora nero. La
  trasparenza nativa dell'app resta da correggere. Nel campo CSS del Browser
  Input di vMix si può usare temporaneamente:

  ```css
  html,
  body,
  app-root,
  app-live-output-page,
  main.alpha,
  worship-live-canvas,
  .canvas {
    background: transparent !important;
    background-image: none !important;
  }
  ```

- La libreria media registra URL e metadati: non effettua upload, transcoding o
  distribuzione dei file.
- Non esiste un motore video proprietario, né output NDI/SDI interno. L'uscita è
  HTML renderizzato dal browser; eventuali compositing e trasmissione restano a
  vMix o ad altri strumenti esterni.
- GetBible è integrato direttamente; provider musicali commerciali richiedono
  un gateway configurato lato server che restituisca il contratto canonico.
- La traduzione automatica dipende dalla disponibilità del container
  LibreTranslate.
- Lo stack Docker fornito è orientato allo sviluppo locale; hardening,
  osservabilità e deployment di produzione non sono ancora descritti come
  soluzione completa.

## Architettura del workspace

- `apps/web`: frontend Angular e output browser;
- `apps/api`: API NestJS, autorizzazione e runtime Live;
- `packages/shared/ui`: componenti Angular condivisi;
- `packages/shared/dto`: contratti Zod condivisi tra frontend e backend;
- `prisma`: schema PostgreSQL e migrazioni;
- `scripts`: verifiche runtime, import ed E2E;
- `docker/nginx`: reverse proxy per applicazione, API e WebSocket.

PostgreSQL è la sorgente di verità per dominio, eventi, notifiche e sessioni
Live. Redis è disponibile per il runtime, ma non sostituisce i dati persistenti.

## Avvio con Docker

L'intera applicazione gira in Docker usando l'immagine ufficiale Node. Il
workspace è montato nei container e `node_modules` vive in un volume
persistente; non viene costruita un'immagine applicativa.

```sh
cp .env.example .env
npm run infra:up
```

Indirizzi locali:

- applicazione: `http://localhost:8080`;
- health check API: `http://localhost:8080/api/v1/health`;
- LibreTranslate: `http://localhost:5001`.

`infra:up` installa le dipendenze nel volume quando cambia il lockfile, applica
le migrazioni, avvia NestJS e mantiene Angular in watch mode. Per fermare lo
stack:

```sh
npm run infra:down
```

I volumi nominati conservano dipendenze, PostgreSQL, Redis e dati di
LibreTranslate.

## Import remoti

Le sorgenti private o commerciali si configurano solo nell'API tramite
`IMPORT_SOURCES_JSON`. URL e credenziali non vengono restituiti al browser.

```dotenv
SONG_PROVIDER_TOKEN=replace_me
IMPORT_SOURCES_JSON=[{"id":"licensed-songs","name":"Licensed songs","kind":"Song","adapter":"canonical-json","urlTemplate":"https://provider.example/api/catalogs/{resource}","headers":{"authorization":"Bearer ${SONG_PROVIDER_TOKEN}"}}]
```

Una sorgente può usare un endpoint fisso o il placeholder `{resource}`. Gli URL
ad hoc devono usare HTTPS e vengono rifiutati se risolvono verso reti private.

## Sviluppo e verifica

Per eseguire Nx sull'host usare la versione Node dichiarata in `.nvmrc`.

```sh
npm run typecheck
npm run build
npm run test:canvas-runtime
npm run test:import-boundaries
npm run test:bible-xml

# richiede lo stack Docker attivo
npm run test:e2e:core
```

L'E2E core copre autenticazione, organizzazione, import, paginazione canonica
delle canzoni, Restore Layout, lineup, Live State, output, countdown,
notifiche e rotazione/revoca delle sessioni.
