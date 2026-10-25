# SaarGaming Broadcast-Overlay

OBS-Overlays für die Prime-League-Matches von SaarGaming e.V. (League of Legends). Design und Entscheidungen: [DESIGN.md](DESIGN.md).

## Installation auf dem Observer-PC

`npm run package` erzeugt `release/SG-Overlay.zip` (inkl. Node.js, nichts weiter zu installieren). ZIP an einen kurzen Pfad entpacken, z. B. `C:\SG-Overlay` oder den Desktop – nicht in einen tief verschachtelten Ordner (Windows-Pfadlänge).

## Update (Repo-Version mit installiertem Node.js)

1. **Alle SG-Overlay-Konsolenfenster schließen** (läuft noch ein altes, bleibt die alte Version aktiv).
2. `git pull`
3. `start-with-recording.bat` starten – installiert geänderte Abhängigkeiten und baut die Overlays automatisch neu.

Die aktuelle Version steht im Admin-Panel oben links (z. B. `v0d468c4`). Passen Seite und Server nicht zusammen, zeigt das Admin-Panel eine rote Warnung. OBS lädt die Overlay-Quellen beim Verbinden automatisch neu.

## Spieltag

1. OBS starten (Szenen siehe unten), League-Client mit dem Zuschauer-Account öffnen.
2. `start.bat` doppelklicken (bzw. `start-with-recording.bat` zum Aufzeichnen) → Admin-Panel öffnet sich unter http://127.0.0.1:3210/admin/
3. Im Admin-Panel: Status-Lämpchen prüfen, Gegner/Kader/Format eintragen, speichern.
4. Starting Soon → Draft (manuell) → Lineup, Ingame, Post-Game schalten automatisch → nach jedem Spiel den Gewinner bestätigen.

Einmalig: im Admin-Panel „Enable Replay API (game.cfg)“ klicken und die OBS-Verbindung unter „Settings“ eintragen (OBS → Tools → WebSocket Server Settings).

## OBS-Szenen

Jede Szene bekommt eine Browser-Source mit 1920×1080, „Shutdown source when not visible“ und „Refresh browser when scene becomes active“ **aus**.

| Szene (Name in OBS) | Browser-Source |
|---|---|
| Starting Soon | `http://127.0.0.1:3210/overlay/starting-soon/` |
| Draft | `http://127.0.0.1:3210/overlay/draft/` – zeigt die drafter.lol-Stream-Ansicht (Pick & Ban) auf unserem Hintergrund; den drafter.lol-Link im Admin-Panel unter **Match** eintragen |
| Lineup | `http://127.0.0.1:3210/overlay/lineup/` |
| Ingame | Game Capture (Name wie in Settings, Standard „Game Capture“) + `http://127.0.0.1:3210/overlay/ingame/` + Webcam-Overlay |
| Post-Game | `http://127.0.0.1:3210/overlay/postgame/` |
| Pause | `http://127.0.0.1:3210/overlay/pause/` |

Die Szenennamen sind im Admin-Panel unter „Settings“ anpassbar.

## Hotkeys (global, auch wenn das Spiel im Vordergrund ist)

| Aktion | Hotkey |
|---|---|
| Head-to-Head Top/Jgl/Mid/Bot/Sup (nochmal = aus) | `Strg+Alt+1` … `5` |
| Head-to-Head aus | `Strg+Alt+0` |
| Post-Game-Seite umschalten | `Strg+Alt+P` |
| Szenen-Automatik an/aus | `Strg+Alt+A` |
| Pause-Szene | `Strg+Alt+F9` |

Stream Deck: `POST http://127.0.0.1:3210/api/action/<name>` mit JSON-Body, z. B. `ui:h2h` `{"lane":"TOP"}`, `ui:postgamePage`, `ui:scene` `{"scene":"pause"}`.

## Gold-OCR einrichten (einmalig, mit laufendem Zuschauer-Spiel)

Admin-Panel → „Gold OCR calibration“ → „Refresh crops“. Für ein paar Zeilen genau eintippen, was der Ausschnitt zeigt (z. B. `215(716)`), und „Learn“ drücken, bis alle Ziffern 0–9 und beide Klammern bekannt sind. Liegen die Ausschnitte daneben, die Regionen in `data/settings.json` (`ocr.order` / `ocr.chaos`) anpassen. Bis dahin zeigt das Overlay automatisch Item-Gold.

## Entwicklung

```bash
npm install
npm run build          # Overlays + Admin bauen (dist/web)
npm run mock           # simuliertes Match, ohne League-Client
npm run dev            # Mock + Neu-Bauen bei Änderungen
npm test               # Unit- und Pipeline-Tests
npm run typecheck
```

- Aufnahme eines echten Spiels: `start.bat --record` oder im Admin-Panel „Start recording“ → `data/recordings/<zeit>/`
- Wiedergabe: `npx tsx server/main.ts --replay data/recordings/<zeit> --speed 4 [--from 600]`
- Aufnahme prüfen: `node scripts/inspect-recording.mjs <aufnahme>` (Zeitachse, Lücken) und `npx tsx scripts/replay-check.ts <aufnahme>` (was Post-Game/Graph zeigen würden)
- Gold-OCR neu trainieren: gelabelte Ausschnitte nach `tests/fixtures/ocr/<n>_<wert>.png`, dann `npx tsx scripts/ocr-train.ts --write`
- Ingame-Overlay über dem Spectator-Screenshot ansehen: `http://127.0.0.1:3210/overlay/ingame/?bg`
- Objective-Timer (patchabhängig): `config/objectives.json`
