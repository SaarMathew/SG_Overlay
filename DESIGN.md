# SaarGaming Broadcast-Overlay – Design

Stand: 24.10.2026 · Ergebnis von Phase 1 (Design). Grundlage für Phase 2 (Implementierung).
Mockups: [`mockups/index.html`](mockups/index.html)

---

## 1. Ziel und Rahmen

Ein Broadcast-Overlay für die Prime-League-Matches von SaarGaming e.V. in League of Legends. Das Tool läuft auf dem **Observer-PC (Windows)**. Auf diesem PC laufen auch der League-Client im Zuschauermodus und **OBS Studio**. Das Tool liest die lokalen Riot-APIs, zeigt die Daten als Overlays in OBS an und wechselt die Szenen automatisch.

**Eine Person** übernimmt am Spieltag Observer, Stream und Admin. Deshalb muss alles, was automatisch gehen kann, automatisch laufen. Den Rest erledigt man per Hotkey.

**Harte Grenzen:**
- Kein Memory-Reading und nichts, was mit Vanguard oder Riots Richtlinien kollidiert. Erlaubt sind LCU-API, Live Client Data API, Replay-API, Data Dragon und Pixel aus der OBS-Aufnahme.
- Riots Web-API (Match-V5) liefert unsere Custom Games nicht. Alles läuft lokal.

## 2. Festgelegte Entscheidungen

| Thema | Entscheidung |
|---|---|
| Sprache im Overlay | Englisch |
| Stil | minimalistisch, dunkle Flächen, Lila-/Magenta-Akzente, Inter |
| Teams | SaarGaming ist standardmäßig fest gesetzt, im Admin-Panel abschaltbar. Der Gegner ist pro Match frei einstellbar. |
| Teamfarben | SaarGaming lila, Gegner standardmäßig rot, beide änderbar. Die Farben richten sich nach dem Team, nicht nach Blue/Red-Seite. |
| Spielernamen | Ingame-Name (Riot ID) **ohne** `#TAG` |
| Draft | läuft auf der Prime-League-Draft-Website. Im Client wird blind gepickt. Den Draft zeigen wir als eigene OBS-Szene mit dem Zuschauer-Link der Draft-Seite. |
| Bans | erscheinen **nicht** in unseren Overlays |
| Fearless | ja. Gespielte Champions sind **für beide Teams** gesperrt und werden automatisch gesammelt. |
| Riot-HUD ingame | Teamframes und Minimap bleiben. Die Score-Bar oben und das Scoreboard unten bleiben **gerendert** (Quelle für die Gold-Erkennung), werden aber von unseren Elementen **deckend überlagert**. |
| Gold | **echtes Gold pro Spieler** per OCR aus Riots Scoreboard. Item-Gold aus Data Dragon nur als Ersatz. |
| Head-to-Head | ingame **nur per Hotkey**, dazu im Lineup Reveal (Matchup-Übersicht) und im Post-Game |
| Post-Game-Seiten | Wechsel **nur per Hotkey** |
| Szenenwechsel in OBS | automatisch über obs-websocket, im Admin-Panel abschaltbar |
| Caster | einer. Das Webcam-Overlay existiert schon, wir bauen keine Caster-Szene. |

## 3. Szenen und OBS-Setup

Jedes Overlay ist eine eigene URL auf dem lokalen Backend (Port `3210`). Jede wird in OBS als **Browser-Source mit 1920×1080** eingebunden. Wichtig sind „Shutdown source when not visible" **aus** und „Refresh browser when scene becomes active" **aus**, damit Animationen und Zustand erhalten bleiben.

| OBS-Szene | Inhalt | Browser-Source-URL | Hintergrund |
|---|---|---|---|
| Starting Soon | Logo, Countdown, Matchup, Caster, Socials | `/overlay/starting-soon` | deckend (eigene Szene) |
| Draft | Zuschauer-Link der Prime-League-Draft-Seite, optional mit unserem Rahmen | *(PL-Link)* + `/overlay/draft-frame` (optional) | deckend |
| Lineup | Lineup Reveal mit Fearless-Liste | `/overlay/lineup` | deckend |
| Ingame | Game Capture + Overlay + Webcam-Overlay | `/overlay/ingame` | **transparent** |
| Post-Game | Übersicht und Lane-Head-to-Head (2 Seiten) | `/overlay/postgame` | deckend |
| Pause | Technische Pause / Pause | `/overlay/pause` | deckend *(Mockup folgt, Stil wie Starting Soon)* |

### Automatischer Szenenwechsel

Das Backend verfolgt den Gameflow-Status der LCU und die Erreichbarkeit der Live-API und schaltet die OBS-Szene über obs-websocket v5 um. Das Plugin ist ab OBS 28 eingebaut.

| Auslöser | Wechsel nach |
|---|---|
| LCU-Phase `ChampSelect` beginnt (Blind Pick im Client) | Lineup |
| Live-API antwortet und `gameTime > 0` | Ingame |
| Live-API ist weg bzw. Spiel beendet (Phase `PreEndOfGame`/`EndOfGame`) | Post-Game (mit ca. 3 s Verzögerung) |
| alles andere | kein Wechsel. Starting Soon, Draft und Pause schaltest du manuell. |

Ein Schalter im Admin-Panel deaktiviert den Automatismus. Jeder manuelle Wechsel in OBS hat Vorrang: Danach wartet die Automatik bis zum nächsten Phasenwechsel. *Zu prüfen: Welche Gameflow-Phasen meldet der Client als **Zuschauer**?*

### Verbindung nach einem Refresh

Jede Overlay-Seite baut beim Laden eine WebSocket-Verbindung zum Backend auf und bekommt sofort den **vollständigen aktuellen Zustand**. Bricht die Verbindung ab, versucht sie es automatisch erneut (1 s, 2 s, 5 s, dann alle 5 s). Ein Refresh der Browser-Source in OBS ist dadurch jederzeit gefahrlos.

## 4. Ingame-Layout (1920×1080)

Die Maße stammen aus echten Spectator-Screenshots (`mockups/assets/spectator-*.webp`). Im Mockup blendet die Taste **Z** die vermessenen Riot-Bereiche ein.

| Unser Element | Position (x, y, B×H) | Liegt über | Hinweis |
|---|---|---|---|
| Top-Bar | 378, 0, 1164×104 | Riots Score-Bar + Uhr (397–1537, 0–100) | **muss deckend sein** |
| Objective-Timer | zentriert, y 116, H 30 | – | nächster Drache (mit Typ), Baron, Buff-Restzeit |
| Event-Popup | zentriert, y 162, 540×70 | – | erscheint ca. 5 s |
| Scoreboard | 455, 841, 1010×239 | Riots Scoreboard (600–1330, 848–1080) | **muss deckend sein** |
| Head-to-Head | 16, 810, 420×242 | Kamera-/Einheiten-Panel | nur per Hotkey |
| Riot-Teamframes | 0/1832, 135, 88×500 | – | bleiben sichtbar (HP, Ult, Summoners) |
| Riot-Minimap | 1612, 800, 280×280 | – | bleibt sichtbar |

**Was im Spiel ausgeblendet sein muss**, weil es sonst im Stream zu sehen ist:
- **Replay-Steuerleiste** über dem Scoreboard
- **Kamera-Panel** („Manuelle Kamera", „Nebel des Krieges") und das **Panel der ausgewählten Einheit** unten links
- **FPS- und Ping-Anzeige** oben rechts, per Spieleinstellung
- **Riots Objective-Timer** rechts über der Minimap, unsere ersetzen sie

Steuerung über die Replay-API (`EnableReplayApi=1` in `Config/game.cfg`, `POST /replay/render` mit den `interface*`-Flags), sonst per Spectator-Hotkey. *Welche Flags welches Element steuern, prüfen wir zu Beginn von Phase 2 am Client.*

**Feste Spieleinstellungen auf dem Observer-PC:** 1920×1080, gleiche HUD-Skalierung an jedem Spieltag *(Wert noch offen)*, Spieleinstellungen in der Sprache, die zu den OCR-Vorlagen passt.

### Ingame-Elemente im Detail

- **Top-Bar:**
  - pro Team: Logo, Kürzel, Name, Gold, Türme, Kills
  - Mitte: Spielzeit, Serienstand als Punkte, „GAME n · BOn"
  - zweite Zeile: Drachen nach Typ (4 Plätze), Grubs, Barons, Gold-Differenz
- **Scoreboard, gespiegelt nach Lane:**
  - pro Spieler: Champion mit Level, Summoner Spells, Name, KDA, CS, 6 Items und Trinket
  - Mitte: Rolle, **Anteil am Gesamtvorsprung in %**, Gold-Differenz der Lane und **Trichter**, siehe Abschnitt 6
  - Tote Spieler werden ausgegraut und bekommen einen Respawn-Countdown.
  - Die Lane, die gerade im Head-to-Head läuft, wird hervorgehoben.
- **Head-to-Head:** Lane, beide Spieler mit Champion, Level, Items, KDA, CS/min. Dazu die Differenzen bei CS, Gold, Level und Kill-Beteiligung.
- **Event-Popups:** Drache (mit Typ, Soul), Baron, Grubs, Atakhan *(falls im aktuellen Patch)*, Inhibitor, Ace, Multikills ab Triple, First Blood. Bei Objectives: Team und Gold-Änderung.

## 5. Datenquellen pro Feld

**Legende:**
- **LCU** = League-Client-API (`https://127.0.0.1:<port>`, Zugangsdaten aus `lockfile`, REST + WebSocket)
- **LIVE** = Live Client Data API (`https://127.0.0.1:2999/liveclientdata/allgamedata`, Abfrage jede Sekunde)
- **OCR** = Pixel aus der OBS-Game-Capture
- **DD** = Data Dragon / CommunityDragon
- **ADMIN** = Eingabe im Admin-Panel
- **CALC** = im Backend berechnet

| Feld | Quelle | Details |
|---|---|---|
| Teamnamen, Kürzel, Logos, Farben | ADMIN | Logo-Upload. SaarGaming ist vorbelegt. |
| Kader (Riot ID → Rolle, Anzeigename) | ADMIN | SaarGaming dauerhaft gespeichert, Gegner pro Match |
| Liga-Zeile, Format (Bo1/2/3/5), Serienstand, Spielnummer | ADMIN | Der Serienstand wird nach dem Post-Game automatisch hochgezählt und lässt sich korrigieren. |
| Countdown, Caster-Name, Socials | ADMIN | |
| Picks im Lineup (Champion, Spieler, Summoner Spells, Lock-Status) | LCU | `/lol-champ-select/v1/session` (WebSocket-Event). *Ob der Zuschauer-Client alles sieht, ist zu prüfen.* |
| Rolle | ADMIN (Kader) | `position` ist in Custom Games oft leer. Ersatz: Reihenfolge der Picks. |
| Loading-Art, Icons für Champions, Items und Spells | DD | Version aus `/api/versions.json`, lokal zwischengespeichert |
| Fearless-Liste | CALC | Champions aller abgeschlossenen Spiele der Serie, im Admin-Panel bearbeitbar |
| Spielzeit | LIVE | `gameData.gameTime` |
| Champion, Level, Items, KDA, CS, Wardscore, Summoner Spells | LIVE | `allPlayers[]` |
| Tot / Respawn-Timer | LIVE | `isDead`, `respawnTimer` |
| **Gold pro Spieler** (aktuell und gesamt) | **OCR** | Riots Scoreboard zeigt `aktuell(gesamt)`, z. B. `215(716)` |
| Teamgold | CALC aus OCR | Summe der Gesamtgold-Werte. Stimmt mit Riots „4.6k" überein. |
| Item-Gold (Ersatz) | LIVE + DD | Summe von `gold.total` der Items × Anzahl |
| Kills pro Team | LIVE | Summe der Kills bzw. `ChampionKill`-Events |
| Türme, Inhibitoren | LIVE | Events `TurretKilled`/`InhibKilled`. Das Team ergibt sich aus dem Turm-Namen (`T1`/`T2`). |
| Drachen (Typ), Soul, Elder | LIVE | `DragonKill` (`DragonType`, `Stolen`, `KillerName`) |
| Grubs, Herald, Baron, Atakhan | LIVE | `HordeKill`, `HeraldKill`, `BaronKill`, … *(Event-Namen am aktuellen Patch prüfen)* |
| Objective-Timer | CALC | Kill-Zeitpunkt + Respawn-Regeln aus einer Konfigurationsdatei, damit Patch-Änderungen ohne Code-Änderung gehen |
| Baron-Buff-Restzeit | CALC | Baron-Kill + Buff-Dauer (Konfiguration) |
| Kill-Beteiligung (KP) | CALC | (K + A) / Kills des Teams |
| Gold-Differenz pro Lane, Trichter, % | CALC aus OCR | siehe Abschnitt 6 |
| Gold @15, Gold-Graph | CALC aus OCR | Das Backend speichert jede Sekunde den Goldstand und für den Graph jede Minute einen Punkt. |
| Post-Game-Statistiken | CALC | letzter LIVE-Stand + OCR-Verlauf + Events. Der End-of-Game-Block der LCU ist für Zuschauer wahrscheinlich leer und dient nur als Bonus, falls vorhanden. |
| Gewinner | CALC + ADMIN | wird anhand der letzten Events vorgeschlagen und **per Klick bestätigt** |

**Bewusst nicht dabei:** Schaden (nur über End-of-Game-Stats verfügbar), Bans (Entscheidung), Lebens- und Manabalken sowie Cooldowns (Riots Teamframes bleiben).

## 6. Berechnungen

**Gold-Differenz pro Lane** = Gesamtgold SG-Spieler − Gesamtgold Gegner-Spieler der gleichen Rolle.

**Anteil am Gesamtvorsprung** (Trichter im Scoreboard):
- Anteil = Differenz der Lane ÷ Summe aller Lane-Differenzen. Die Anteile ergeben zusammen 100 %.
- Lanes gegen das führende Team haben einen negativen Anteil. Einzelne Lanes können dadurch über 100 % liegen, der Trichter ist dann voll ausgefahren.
- Unter 500 Gold Gesamtvorsprung werden die Prozente ausgeblendet, weil sie dort stark schwanken. Die Trichter richten sich dann nach der größten Lane-Differenz.
- Der Trichter ist an der Mittellinie schmal und wird zum führenden Team hin breiter, in dessen Farbe.

**Gold-OCR:**
1. Das Backend holt sich über obs-websocket (`GetSourceScreenshot` der Game-Capture, PNG) jede Sekunde ein Bild.
2. Es schneidet die 10 Goldfelder aus Riots Scoreboard aus. Die Positionen stehen in einer Konfiguration und lassen sich im Admin-Panel kalibrieren.
3. Die Ziffern erkennt es per **Template-Matching**. Die Vorlagen für 0–9, `(`, `)`, `.` und `k` werden einmalig aufgenommen.
4. **Plausibilitätsprüfung:** Gesamtgold darf nicht sinken, und Sprünge über ca. 1.500 pro Sekunde werden verworfen. Ist der Wert ungültig, gilt der letzte gute Wert. Fällt die Erkennung länger als 10 s aus, springt das Item-Gold ein und das Admin-Panel zeigt eine Warnung.
5. **Zuordnung Zeile → Spieler:** über die Champion-Icons bzw. die feste Reihenfolge. *Ob die Reihenfolge stabil ist, ist zu prüfen.*

## 7. Architektur

```
League Client (LCU) ──REST/WS──┐
Live Client API :2999 ─poll 1s─┤
Replay API :2999 ──────────────┤      ┌──────────── Backend (Node.js/TS) ────────────┐
OBS (obs-websocket) ───────────┼────▶ │ Adapter → State-Store → Calculators → WS-Hub │
Data Dragon (HTTP, Cache) ─────┘      │ Recorder/Replay · Hotkeys · Szenen-Steuerung │
                                      └───────────────┬───────────────────────────────┘
                                         WebSocket    │   HTTP (statische Seiten, Assets)
                         ┌────────────────────────────┼─────────────────────────┐
                    Overlays (OBS Browser-Sources)               Admin-Panel (Browser)
```

- **Adapter**: je eine Quelle (LCU, Live, Replay, OBS, DD). Alle hängen an einer gemeinsamen Schnittstelle, deshalb lassen sie sich für Tests durch **Replay-Adapter** ersetzen.
- **State-Store**: ein zentraler, serialisierbarer Zustand (Match, Serie, Lineup, Ingame, Post-Game, UI-Zustand wie Head-to-Head-Lane und Post-Game-Seite). Er bleibt auf der Festplatte erhalten (`data/state.json`), damit nach einem Neustart Serienstand und Fearless-Liste noch da sind.
- **Calculators**: reine Funktionen (Gold-Differenzen, Timer, KP, Fearless, Gewinner-Vorschlag). Sie sind einfach zu testen.
- **WS-Hub**: Bei Verbindung schickt er den vollständigen Zustand. Danach verschickt er Änderungen (Patches) pro Thema mit höchstens 4 Updates pro Sekunde. Overlays abonnieren nur ihre Themen.
- **Hotkeys**: global, also auch wenn OBS oder das Spiel im Vordergrund ist. Sie sind im Admin-Panel konfigurierbar. Zusätzlich gibt es HTTP-Endpunkte (`POST /api/action/...`) für ein Stream Deck.

### Hotkeys (Vorschlag, konfigurierbar)

| Aktion | Hotkey |
|---|---|
| Head-to-Head Top / Jgl / Mid / Bot / Sup | `Strg+Alt+1` … `5` |
| Head-to-Head ausblenden | `Strg+Alt+0` |
| Post-Game Seite umschalten | `Strg+Alt+P` |
| Automatischen Szenenwechsel an/aus | `Strg+Alt+A` |
| Pause-Szene | `Strg+Alt+F9` (die Pause-Taste kennt die Hotkey-Bibliothek nicht) |

## 8. Technologie-Stack und Projektstruktur

- **Backend:** Node.js 22 LTS + TypeScript, Fastify (HTTP) + `ws`, `obs-websocket-js` (v5), `pngjs` für die Gold-Erkennung (reines JavaScript, keine nativen Module) und `uiohook-napi` für globale Hotkeys.
- **Frontend:** Svelte 5 + Vite, jeweils eigene Einstiegsseiten für die Overlays und das Admin-Panel. Gemeinsame Design-Tokens kommen aus `mockups/shared.css`.
- **Gemeinsame Typen** für Zustand und Nachrichten nutzen Backend und Frontend zusammen.
- **Tests:** Vitest für die Calculators und die Gold-Erkennung (mit aufgenommenen Vorlagen) sowie Replay-Tests mit aufgezeichneten Sessions.

```
sg-overlay/
├─ server/
│  ├─ adapters/        lcu, live, replay-api, obs, ddragon, + replay/mock-Varianten
│  ├─ ocr/             Crop-Regionen, Template-Matching, Plausibilität
│  ├─ calc/            gold, timers, fearless, winner, kp
│  ├─ state/           Store, Persistenz, Patches
│  ├─ hub/             WebSocket-Hub, Topics
│  ├─ scenes/          OBS-Szenenautomatik
│  ├─ hotkeys/
│  └─ recorder/        Aufnahme + Wiedergabe
├─ shared/             Typen, Konstanten (Objective-Regeln, Rollen)
├─ web/
│  ├─ overlays/        starting-soon, lineup, ingame, postgame, pause
│  ├─ admin/
│  └─ lib/             WS-Client mit Auto-Reconnect, Komponenten, Tokens
├─ config/             objectives.json, ocr-regions.json, hotkeys.json
├─ data/               state.json, Logos, Aufnahmen (git-ignored)
└─ mockups/            Phase-1-Mockups (Referenz)
```

## 9. Admin-Panel

Es ist eine eigene lokale Seite (`/admin`) und im Stream nicht sichtbar.
- **Status-Leiste:** LCU, Live-API, Replay-API, OBS, Gold-Erkennung (grün/gelb/rot) und aktuelle Szene.
- **Match:** Gegner (Name, Kürzel, Logo, Farbe), SaarGaming-Schalter, Liga-Zeile, Format, Serienstand, Spielnummer, Countdown-Ziel, Caster, Socials.
- **Kader:** Riot ID → Anzeigename und Rolle, für beide Teams.
- **Serie:** Fearless-Liste ansehen und bearbeiten, Gewinner bestätigen, nächstes Spiel starten.
- **Steuerung:** Szenen-Automatik an/aus, Szenen manuell schalten, Buttons für Head-to-Head und Post-Game-Seite (zusätzlich zu den Hotkeys).
- **Gold-Erkennung kalibrieren:** zeigt den aktuellen Ausschnitt mit den erkannten Werten. Die Regionen lassen sich verschieben.
- **Einstellungen:** Hotkeys und OBS-Verbindung (Host, Port, Passwort, Name der Game-Capture-Quelle).

## 10. Entwickeln und Testen ohne laufendes Spiel

1. **Mock-Modus:** Ein Szenario-Generator erzeugt einen plausiblen Spielverlauf mit Picks, Kills, Objectives und Goldkurven. Damit lassen sich alle Overlays ohne Client entwickeln.
2. **Recorder:** Auf dem Observer-PC schreibt er alle LCU-Events, Live-API-Antworten (1 Hz) und alle 5 s einen PNG-Ausschnitt der Goldfelder in `data/recordings/<datum>/`, als JSONL mit Zeitstempeln.
3. **Replay-Modus:** Er spielt eine Aufnahme in 1×, 4× oder 16× ab, inklusive Springen an eine Spielminute. Die Replay-Adapter ersetzen dabei die echten Adapter.
4. **Erste Aufnahme:** ein Custom Game gegen Bots mit einem zweiten Account als Zuschauer, so wie bei den Screenshots. Daraus kommen auch die Vorlagen für die Gold-Erkennung.

## 11. Ablauf am Spieltag

**Start:** Doppelklick auf `SG-Overlay.exe`. Das Ziel ist eine einzelne .exe über Node SEA, als Notlösung gibt es einen portablen Ordner mit `start.bat`. Das Programm:
1. startet das Backend,
2. prüft `game.cfg` (`EnableReplayApi=1`) und bietet an, das zu setzen,
3. verbindet sich mit OBS und dem League-Client und versucht es automatisch erneut, falls einer davon noch nicht läuft,
4. öffnet das Admin-Panel im Browser.

**Checkliste:**
1. OBS starten, die Szenen aus Abschnitt 3 sind eingerichtet. Eine **Szenen-Sammlung zum Import** liefern wir mit.
2. `SG-Overlay.exe` starten und im Admin-Panel prüfen, dass alle Status-Lämpchen grün sind.
3. Match-Daten eintragen: Gegner, Logo, Kader, Format.
4. Starting Soon → Draft (manuell) → Lineup, Ingame und Post-Game laufen automatisch → nächstes Spiel.

## 12. Design-Tokens

| Token | Wert | Verwendung |
|---|---|---|
| `--sg` | `#9b4dff` | SaarGaming-Teamfarbe (Lila aus dem Logo) |
| `--sg-glow` | `#e8429a` | Magenta-Akzent („GAMING"-Schriftzug) |
| `--opp` | `#e5484d` | Gegner (Standard) |
| `--bg` | `#0b0714` | Hintergrund der Vollbild-Szenen |
| `--cover` / `--cover-2` | `#100a1c` / `#1e1430` | **deckende** Flächen über Riot-HUD-Elementen |
| `--panel` | `rgba(16,10,28,.9)` | Panels über dem Spielbild |
| `--text` / `--muted` / `--dim` | `#f5f5f7` / `#a1a1aa` / `#6b6b78` | Textstufen |

- **Schrift:** Inter 400–900 mit Ziffern fester Breite (`tnum`).
- **Animationen:** 300–500 ms für Ein- und Ausblenden und kurzes Aufsteigen. Beim Lineup erscheinen die Karten nacheinander.
- **Logo:** `mockups/assets/saargaming-logo.png`, aus dem Original freigestellt.

## 13. Offene Punkte und Risiken (zu Beginn von Phase 2 prüfen)

| # | Punkt | Wie wir es klären |
|---|---|---|
| 1 | Welche **HUD-Skalierung** gilt am Spieltag? | Wert vom Team. Danach Positionen und Vorlagen für die Gold-Erkennung festlegen. |
| 2 | Sieht der **Zuschauer-Client den Champ Select** (Session, Lock-Status, Spells)? | Erste Aufnahme |
| 3 | Welche **Gameflow-Phasen** meldet die LCU beim Zuschauen? | Erste Aufnahme |
| 4 | Welche **Replay-API-Flags** blenden Replay-Leiste, Kamera-Panel und Riots Timer aus? | Test am Client |
| 5 | **Event-Namen** im aktuellen Patch (Grubs, Atakhan, …) | Erste Aufnahme |
| 6 | **Gold-Erkennung:** Vorlagen, Reihenfolge der Zeilen, Verhalten bei 4- und 5-stelligen Werten | Aufnahme + Testreihe |
| 7 | **Gewinner-Erkennung** für Zuschauer | Vorschlag aus den Events, Bestätigung per Klick |
| 8 | **Pause-Szene** | erledigt (Phase 2), Stil wie Starting Soon |
| 9 | **Gegner-Logos**: Format und Quelle | Upload im Admin-Panel (PNG/SVG, transparent) |
| 10 | **Logo-Original** mit transparentem Hintergrund (das freigestellte hat leichte Kanten im Glow) | Datei vom Team, falls vorhanden |
| 11 | **Einzel-.exe** über Node SEA mit globalen Hotkeys (natives Modul) | Machbarkeit testen, sonst portabler Ordner |
