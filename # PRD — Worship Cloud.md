# PRD — Worship Cloud

# 1. Obiettivo

Creare una web app cloud per chiese e worship team che permetta di gestire:

* servizi e culti;
* team e turnazioni;
* canti;
* testi biblici;
* slide;
* immagini, video e audio;
* presentazione live;
* più monitor e layout;
* stage display / gobbo;
* countdown e orologio;
* output HTML fullscreen tramite URL;
* overlay HTML trasparenti per software di produzione esterni;
* controllo simultaneo da più dispositivi.

Il prodotto deve essere semplice da usare durante il culto, ma adatto anche a regia e streaming professionali.

Worship Cloud è **web-first**. Il sistema distribuisce contenuto e stato realtime; ogni destinazione è una pagina web che effettua localmente il rendering.

La piattaforma non produce frame video e non include motori di rendering video proprietari, agenti locali o dipendenze native.

---

# 2. Tipologie di utenti

### Admin

Gestisce:

* organizzazione;
* sedi;
* utenti;
* ruoli;
* libreria;
* impostazioni;
* output;
* dispositivi.

### Worship Leader / Responsabile

Può:

* creare servizi;
* creare scalette;
* inserire canti;
* organizzare il team;
* assegnare turni.

### Operatore Regia

Può:

* avviare una sessione live;
* selezionare cue;
* mandare slide in onda;
* gestire media;
* countdown;
* output web della Live Session.

### Membro Team

Può:

* vedere i propri turni;
* accettare/rifiutare;
* vedere informazioni del servizio.

### Stage / Prompter

Client web con accesso solo visualizzazione alla Live Session.

---

# 3. Dashboard

La dashboard principale mostra:

* prossimo servizio;
* servizi recenti;
* turni da confermare;
* utenti mancanti;
* media recenti;
* ultimi canti;
* pulsante `Prepare Live`;
* pulsante `Start Live`.

Menu principale:

```text
Dashboard
Services
Songs
Bible
Media
Team
Live
Library
Settings
```

---

# 4. Services

Un Service rappresenta un culto o evento.

Esempio:

```text
Culto Domenica
20 Settembre 2026
10:30
```

Contiene:

* titolo;
* data;
* orario;
* sede;
* responsabile;
* team;
* scaletta;
* note.

---

# 5. Scaletta

Ogni servizio contiene una lista ordinabile tramite drag & drop.

Esempio:

```text
Countdown
Welcome Video

Song
Grande sei Signore

Song
Santo per sempre

Bible
Giovanni 3:16-18

Sermon
La grazia

Announcements

Closing
```

Tipi di elemento:

```text
Song
Bible
Slide
Image
Video
Audio
Countdown
Clock
Sermon
Text
Blank
```

---

# 6. Songs

Libreria centralizzata dei canti.

Ogni canto contiene:

* titolo;
* autore;
* copyright;
* CCLI;
* tonalità;
* BPM;
* testo;
* sezioni.

Esempio:

```text
Verse 1
Verse 2
Pre-Chorus
Chorus
Bridge
Tag
Ending
```

Shortcut durante il Live:

```text
1 → Verse 1
2 → Verse 2
C → Chorus
B → Bridge
P → Pre-Chorus
T → Tag
```

Possibilità di creare arrangiamenti diversi dello stesso canto.

---

# 7. Importazione canti

Supportare inizialmente:

* OpenLyrics XML;
* OpenSong;
* TXT;
* copia/incolla.

Successivamente:

* API esterne;
* SongSelect / CCLI;
* import da altri software worship.

---

# 8. Bibbia

La sezione Bible permette di cercare:

```text
Giovanni 3:16
Salmo 23
Romani 8:1-4
```

Funzioni:

* ricerca libro;
* capitolo;
* versetto;
* intervallo di versetti;
* scelta traduzione;
* invio diretto a Preview;
* aggiunta alla scaletta.

Import:

* XML;
* OSIS;
* Zefania;
* API Bible.

---

# 9. Media Library

Gestione centralizzata di:

* immagini;
* video;
* audio;
* motion background;
* loghi;
* countdown video.

Ogni file contiene:

* nome;
* tipo;
* durata;
* dimensioni;
* thumbnail;
* categoria;
* tag.

Drag & drop per il caricamento.

Immagini, audio e video vengono salvati nello storage e consumati dal browser tramite URL.

```text
Storage
→ asset URL
→ HTML <img>, <video>, <audio>
```

Il backend gestisce metadati, permessi e URL. Non decodifica media e non genera video server-side.

---

# 10. Slide Editor

Editor visuale semplice.

Possibilità di aggiungere:

* testo;
* immagini;
* video;
* forme;
* logo;
* scripture;
* lyrics;
* timer;
* clock.

Gli elementi possono essere:

* spostati;
* ridimensionati;
* allineati;
* cambiati di font;
* cambiati di colore;
* animati.

---

# 11. Template

Possibilità di creare template per:

```text
Song
Bible
Sermon
Announcement
Lower Third
Countdown
```

Esempio:

```text
Song Template

Background
Font
Font size
Text position
Animation
Logo
```

Il contenuto cambia automaticamente mantenendo lo stesso design.

CONTENT e LAYOUT devono restare separati. Il contenuto non conosce dimensioni, posizione o stile specifici di un output.

Ogni pagina Live applica al medesimo contenuto il proprio template o layout.

---

# 12. Live Session web

Ogni Live Session espone pagine HTML temporanee o permanenti raggiungibili tramite URL.

```text
/live/:sessionId/control
/live/:sessionId/preview
/live/:sessionId/main
/live/:sessionId/stage
/live/:sessionId/prompter
/live/:sessionId/alpha
```

Tutte le destinazioni leggono lo stesso Live State. Nessuna route riceve un flusso video prodotto dalla piattaforma.

Il Live State resta un unico aggregato e distingue solo il contenuto preparato da quello pubblicato. TAKE promuove il contenuto preparato a pubblicato.

---

# 13. Control

Route:

```text
/live/:sessionId/control
```

È la console dell'operatore.

Permette:

* gestione scaletta;
* selezione cue;
* Verse / Chorus / Bridge;
* Preview;
* TAKE;
* Previous / Next;
* Clear;
* Blackout;
* countdown;
* clock;
* controllo della Live Session.

Flusso operativo:

```text
Select Cue
↓
Preview
↓
TAKE
↓
Program
```

---

# 14. Preview e Main

## Preview

Route:

```text
/live/:sessionId/preview
```

Mostra il contenuto preparato che verrà mandato in Program con TAKE.

`Program` indica lo stato pubblicato dalla regia. Non è un flusso video e non richiede un motore di output.

## Main

Route:

```text
/live/:sessionId/main
```

È una pagina HTML fullscreen destinata al pubblico.

Supporta:

* lyrics;
* Bibbia;
* slide;
* immagini;
* video HTML;
* audio;
* countdown;
* clock.

Il Main può essere aperto direttamente in un browser sul monitor collegato tramite HDMI.

```text
Main URL
→ Browser fullscreen
→ HDMI
→ Proiettore / LED / TV
```

---

# 15. Multi Output e Multi Layout

Lo stesso contenuto può essere aperto su più pagine e interpretato con layout differenti.

```text
Live State
├─ Main → testo completo e background
├─ Stage → current e next
├─ Prompter → testo e note
└─ Alpha → overlay trasparente
```

CONTENT e LAYOUT sono separati.

Il contenuto contiene dati semantici. Ogni output possiede un proprio template con dimensioni, posizione, tipografia, colori e animazioni.

---

# 16. Stage

Route:

```text
/live/:sessionId/stage
```

È un client web destinato a worship team e musicisti.

Può mostrare:

* testo corrente;
* testo successivo;
* cue corrente;
* cue successivo;
* sezione corrente;
* prossima sezione;
* clock;
* countdown;
* prossimo elemento della scaletta;
* messaggi inviati dalla regia.

Stage non riceve video. Riceve dati Live tramite WebSocket e li renderizza localmente nel browser.

---

# 17. Prompter

Route:

```text
/live/:sessionId/prompter
```

È il gobbo web per pastore o relatore.

Supporta:

* testo della predicazione;
* note;
* versetti;
* current section;
* next section;
* clock;
* countdown;
* messaggi regia;
* scroll manuale;
* eventuale auto-scroll.

Prompter è esclusivamente HTML + WebSocket ed è accessibile anche da tablet.

---

# 18. Countdown

Possibilità di creare countdown.

Esempio:

```text
10:00
```

Configurazioni:

* durata;
* orario target;
* start;
* pause;
* reset;
* fine automatica;
* cambio cue automatico.

---

# 19. Clock

Widget con:

* ora;
* data;
* tempo servizio;
* tempo elemento corrente.

---

# 20. Multi Access

Più dispositivi possono entrare nella stessa Live Session.

Esempio:

```text
PC Regia
→ /control

MacBook
→ /preview

Tablet palco
→ /stage

iPad Pastore
→ /prompter

Laptop Streaming
→ /alpha in vMix Web Browser Input
```

---

# 21. Program Owner

Solo un dispositivo può controllare direttamente il Program.

Gli altri possono chiedere il controllo.

Esempio:

```text
Andrea wants Program Control

Reject
Accept
```

---

# 22. Output web

Gli output della piattaforma sono esclusivamente pagine HTML raggiungibili tramite URL.

```text
URL → Browser fullscreen → HDMI
URL → vMix Web Browser Input
URL → browser su tablet o computer
```

La piattaforma distribuisce dati e stato realtime. Non distribuisce video e non produce frame.

---

# 23. Alpha e integrazione vMix

Route:

```text
/live/:sessionId/alpha
```

È una pagina HTML con background trasparente.

Può visualizzare:

* lyrics;
* scripture;
* lower third;
* nome speaker;
* titoli;
* grafiche overlay.

L'integrazione principale con vMix usa Web Browser Input.

```text
Camere
→ ATEM Blackmagic
→ vMix

Worship /alpha URL
→ vMix Web Browser Input
→ overlay sopra le camere
```

Questa integrazione non usa NDI.

---

# 24. Realtime e Live State

Il backend mantiene un unico Live State per sessione.

Il modello contiene solo i dati necessari a Preview e Program. Non duplica contenuti o layout per ogni destinazione.

Quando l'operatore esegue TAKE:

```text
Control
→ NestJS
→ aggiornamento Live State
→ Redis Pub/Sub
→ WebSocket
→ Main / Stage / Prompter / Alpha / Preview
```

Il backend distribuisce dati e stato, non video.

Esempio di Live State:

```json
{
  "type": "song",
  "title": "Hosanna",
  "section": "chorus",
  "lines": [
    "Osanna, Osanna",
    "Osanna nell'alto dei cieli"
  ]
}
```

Ogni output interpreta lo stesso dato con il proprio layout.

```text
Main → testo completo con background
Stage → current + next
Prompter → testo + note
Alpha → testo trasparente in lower third
```

---

# 25. Continuità operativa web

`Prepare Live` verifica che contenuti, template e URL media siano disponibili prima del culto.

La continuità può usare cache browser, Service Worker e storage web standard. Non richiede software locale installabile o agenti nativi.

Una modalità offline completa è un'estensione web successiva e deve mantenere le stesse route e lo stesso modello dati.

---

# 26. Team e turni

Ogni servizio può avere team.

Esempio:

```text
Worship

Worship Leader
Voice
Guitar
Bass
Keyboard
Drums
```

```text
Media

Audio FOH
Presentation
Streaming
Camera
Lights
```

Ogni membro può:

```text
Accept
Reject
Unavailable
Request Replacement
```

---

# 27. Stato del servizio

Ogni servizio può mostrare:

```text
Draft
Planning
Ready
Live
Completed
```

Con indicatori:

```text
Team Ready ✓
Media Ready ✓
Presentation Ready ✓
Outputs Ready ✓
```

---

# 28. Permessi

Ruoli iniziali:

```text
Owner
Admin
Leader
Operator
Member
Viewer
```

Permessi granulari successivamente.

---

# 29. Design

Stile:

* dark mode principale;
* minimal;
* premium;
* orientato a software broadcast;
* pochi colori;
* forte contrasto;
* pannelli semplici.

Colori indicativi:

```text
Background #090B0F

Surface
#11141A

Text
#FFFFFF

Accent
Indigo / Violet

Live
Red

Success
Green
```

---

# 30. Architettura e stack core

L'architettura segue un unico flusso web end-to-end:

```text
Control / pagine Live Angular
→ NestJS
→ PostgreSQL per dati persistenti
→ Redis Pub/Sub per propagazione realtime
→ WebSocket
→ pagine Live Angular

Storage per file e media
→ asset URL
→ pagine Live Angular
```

Angular renderizza contenuto e media nel browser. NestJS gestisce API, autorizzazioni e Live State.

PostgreSQL è la fonte persistente. Redis supporta la distribuzione realtime e non sostituisce il database.

## Requisiti tecnici

* richieste, risposte, eventi e Live State usano DTO condivisi tra Angular e NestJS;
* nessuna pagina definisce copie locali o tipi isolati dello stesso contratto;
* il backend distribuisce solo dati, stato e URL media;
* ogni pagina esegue il rendering HTML localmente nel browser.

```text
Frontend
Angular

Backend
NestJS

Database
PostgreSQL

ORM
Prisma

Realtime
WebSocket

Cache
Redis

Storage per file e media
```

Il core non include Output Engine, agenti Rust o Python, NDI SDK, renderer nativi, framebuffer, generazione video server-side o servizi che producono frame.

## Estensioni future opzionali e non core

Un worker media separato potrà usare FFmpeg solo per transcoding, thumbnail, proxy video o normalizzazione media.

NDI resta una possibilità esterna e opzionale. Worship Cloud non implementa direttamente NDI né include NDI SDK.

```text
HTML URL
→ HTML-to-NDI Bridge esterno
→ NDI
```

Lo stesso output HTML rimane riutilizzabile:

```text
URL → Browser → HDMI
URL → vMix Web Browser Input
URL → eventuale HTML-to-NDI tool esterno → NDI
```

---

# 31. MVP

La prima versione deve contenere:

* login;
* organizzazioni;
* utenti;
* servizi;
* scaletta;
* canti;
* Bibbia;
* immagini;
* video;
* slide;
* countdown;
* Live Session e Live State unico;
* Control `/live/:sessionId/control`;
* Preview `/live/:sessionId/preview`;
* Main `/live/:sessionId/main`;
* Stage `/live/:sessionId/stage`;
* Prompter `/live/:sessionId/prompter`;
* Alpha `/live/:sessionId/alpha`;
* Redis Pub/Sub e WebSocket;
* multi-device;
* template base.

### Fuori dal primo MVP

Possono arrivare dopo:

```text
OSC
MIDI
Stream Deck
ATEM
DMX
AI
offline web completo
worker media opzionale
bridge HTML-to-NDI esterno
```

SRT, RTMP e ogni produzione o trasporto video restano responsabilità di software esterni come vMix o OBS.

---

# Risultato atteso

Il flusso principale deve essere estremamente semplice:

```text
CREA SERVIZIO

↓

AGGIUNGI TEAM

↓

CREA SCALETTA

↓

AGGIUNGI
CANTI
BIBBIA
MEDIA
SLIDE

↓

PREPARE LIVE

↓

START LIVE

↓

PREVIEW → TAKE → PROGRAM
```

Il principio centrale del prodotto è:

**un solo contenuto, più destinazioni.**

Lo stesso canto, versetto o media deve alimentare **Preview, Main, Stage, Prompter e Alpha**, ognuno con il proprio layout HTML.

**Il sistema non distribuisce video. Distribuisce contenuto e stato realtime; ogni destinazione è una pagina web che effettua localmente il rendering.**
