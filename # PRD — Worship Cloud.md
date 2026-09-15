# PRD — Worship Cloud

## 1. Obiettivo

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
* output video professionali come NDI;
* controllo simultaneo da più dispositivi.

Il prodotto deve essere semplice da usare durante il culto, ma avere funzionalità professionali per regia e streaming.

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
* output video.

### Membro Team

Può:

* vedere i propri turni;
* accettare/rifiutare;
* vedere informazioni del servizio.

### Stage / Gobbo

Accesso solo visualizzazione.

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

---

# 12. Live Mode

Schermata principale usata durante il culto.

Layout:

```text
SERVICE        CUES               PROGRAM

Countdown      Verse 1            Main Preview
Welcome        Verse 2
Song           Chorus
Bible          Bridge
Sermon
Closing
```

Azioni principali:

```text
Previous
Next
Take
Clear
Blackout
Logo
Pause
```

---

# 13. Preview / Program

Due stati separati.

### Preview

Contenuto che l'operatore sta preparando.

### Program

Contenuto attualmente visibile al pubblico.

Flusso:

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

# 14. Multi Monitor

Possibilità di configurare più output.

Esempio:

```text
Main Screen
Stage Screen
Streaming
Lobby
Confidence Monitor
```

Ogni output può avere un layout differente.

---

# 15. Multi Layout

Lo stesso contenuto può essere visualizzato in modo diverso.

Esempio canto.

### Main Screen

```text
Testo completo
Background
```

### Stage

```text
CURRENT

testo corrente

NEXT

testo successivo
```

### Streaming

```text
testo

sfondo trasparente
```

---

# 16. Stage Display

Schermata per worship team e palco.

Può mostrare:

* ora;
* timer;
* testo corrente;
* testo successivo;
* prossimo elemento;
* messaggi regia.

Esempio:

```text
10:42

CURRENT
Grande sei Signore

NEXT
Degno di ogni lode

Next Cue
BRIDGE
```

---

# 17. Gobbo

Modalità dedicata al pastore o relatore.

Mostra:

* testo predicazione;
* slide corrente;
* slide successiva;
* note;
* countdown;
* orologio.

Accessibile anche da tablet tramite browser.

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
→ Program Control

MacBook
→ Producer

Tablet palco
→ Stage Display

iPad Pastore
→ Gobbo

Laptop Streaming
→ Observer
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

# 22. Output video

Output supportati progressivamente:

```text
Browser Display
HDMI / Display
Fullscreen Window
NDI
NDI Alpha
WebRTC
SRT
RTMP
```

---

# 23. Alpha Channel

Possibilità di generare output trasparente.

Utile per:

* OBS;
* vMix;
* streaming;
* lower third.

Esempio:

```text
Lyrics
+
Transparent Background
```

senza green screen.

---

# 24. Local Engine

Il sistema avrà un piccolo software installabile sul computer della regia.

Funzioni:

* gestione monitor;
* fullscreen;
* NDI;
* alpha;
* media locali;
* codec video;
* cache;
* offline mode.

Il Cloud controlla.

Il Local Engine esegue.

---

# 25. Offline Mode

Prima del culto:

```text
Prepare Live
```

Il computer scarica:

* canti;
* Bibbia;
* slide;
* template;
* immagini;
* audio;
* video.

Se Internet cade durante il culto, il servizio continua normalmente.

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

# 30. Stack indicativo

```text
Frontend
Angular
Tailwind

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

Storage
S3

Media
FFmpeg

Local Engine
Rust

Desktop
Tauri
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
* Live Mode;
* Preview;
* Program;
* Stage Display;
* multi-device;
* template base.

### Fuori dal primo MVP

Possono arrivare dopo:

```text
NDI
Alpha Channel
SRT
RTMP
OSC
MIDI
Stream Deck
ATEM
DMX
AI
```

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

Lo stesso canto, versetto o media deve poter essere mandato contemporaneamente a **Main Screen, Stage, Gobbo e Streaming**, ognuno con il proprio layout.
