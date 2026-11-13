# HANDOVER – Die Schatten von Eldermoor

Autor: eldermoor-dev · Stand: Phase 1 (Prototyp), Version 0.1.1

## Statuslegende
- **getestet (Node)**: durch `node tests.js` bzw. Selbsttest im Spiel geprüft
- **getestet (Desktop-Chrome headless)**: in einem Chrome-Testlauf auf dem Entwicklungsrechner des Assistenten gesehen, nicht auf dem Galaxy S25
- **nicht auf Gerät getestet**: noch nicht vom Nutzer auf dem Handy bestätigt
- **geplant**: noch nicht gebaut

## Dateiliste (alles flach im Wurzelordner des Repositories, keine Unterordner)
| Datei | Inhalt |
|---|---|
| index.html | Oberfläche, CSS, Touch-Buttons, Titel, Dialog-Container |
| main.js | Spielsteuerung, Eingabe, Dialoge, Kamera, Speichern/Laden-Oberfläche, Debug, SW-Anmeldung. Enthält `VERSION` |
| logic.js | Reine Spiellogik ohne DOM: Zustand, Bewegung, Interaktion, Kampf, Speicherformat, Migration, Level-Analyse |
| render.js | Raycaster (eigener Pixelpuffer), prozedurale Texturen/Sprites, Palette, Porträts |
| audio.js | Prozedurale Geräusche per Web Audio (keine Musik) |
| store.js | IndexedDB (Datenbank `eldermoor-dev`, Store `kv`) mit Arbeitsspeicher-Rückfall |
| game.json | Daten: Level, Objekte, Gegner, Items, Helden, Paletten |
| tests.js | Testsuite (Node: `node tests.js`; im Spiel: Einstellungen → Selbsttest) |
| sw.js | Service Worker, Cache `eldermoor-<VERSION>`. Enthält `VERSION` und `ASSETS` |
| manifest.webmanifest | PWA-Manifest (fullscreen, landscape) |
| icon-192.png, icon-512.png | Prozedural erzeugte Icons |
| HANDOVER.md | Diese Datei |

**Regel:** Wird eine Spieldatei geändert, `VERSION` in `main.js` UND `sw.js` erhöhen (der Test prüft Gleichheit). Neue Dateien in `ASSETS` (sw.js) eintragen.

## Architektur
- `logic.js` kennt kein DOM und keinen Renderer. Zustand = ein JSON-fähiges Objekt (`newGame`), Zufall über `state.rng` (mulberry-artig), dadurch reproduzierbar.
- `render.js` rendert in `Uint32Array(480×270)`. `main.js` legt `ImageData` über denselben Puffer, `putImageData` auf Canvas 480×270, CSS skaliert ganzzahlig (`layout()`), `image-rendering: pixelated`.
- Palette: 8 Materialien × 8 Helligkeiten = 64 Farben je Palette (`game.json → palettes`). Texturen speichern Palettenindizes, Nebel/Tiefe = Helligkeitsstufen abziehen. Neues Kapitel = neue Palette, keine Engine-Änderung. 255 = transparent.
- Texturen: 64×64, prozedural. Externe Bilder später: `makeTextures()` liefert `{w,h,data}`; ein Lader müsste Bilder in Palettenindizes umrechnen (nicht gebaut).
- Eingabe: Pointer-Events auf `[data-a]`-Buttons, Multitouch, Halten wiederholt Bewegung (`S.held`), Tippen löst immer mindestens einen Schritt aus (`S.queued`).
- HUD ist DOM (skalierbare Schrift über `--fs`), nur die 3D-Ansicht ist Canvas.
- Karte: `state.seen` (Array 0/1 je Zelle), Notizen `state.notes` (Zellindizes).

## Datenformate
**game.json (Auszug)**
- `levels.<id>`: `map` (Zeilen; `#` Stein, `m` Moos, `.` Boden), `start {x,y,dir}` (dir 0=N,1=O,2=S,3=W), `palette`, `objects[]`
- Objekte: `door {locked,key}`, `chest {loot[{item,n}|{gold}]}`, `enemy {kind}`, `exit`. Türen/Truhen/Gegner stehen auf Bodenzellen.
- `items.<id>`: `kind` = `consumable` | `quest`. Questgegenstände werden nie verbraucht und nie mehrfach vergeben.
- `enemies.<kind>`: `hp, atk, def, init, gold`
- `heroes[]`: `name, role, row (front|back), maxHp, atk, def, init, ranged` (feste Vorgabe, Phase 2 ersetzt das)

**Spielstand (Version 1)**: `{format:'eldermoor-save', v:1, savedAt, state}`; `state` = `rng, levelId, player, heroes, inv, gold, flags, objs, seen, notes, steps` (`combat` wird nie gespeichert).
Migration: `MIGRATIONS[n]` wandelt Version n → n+1 (`logic.js`); beim Laden wird bis `SAVE_VERSION` verkettet. Neuere Spielstände werden abgelehnt. Geladene Stände werden validiert (`validateState`).
Slots in IndexedDB: Schlüssel `auto`, `slot1`, `slot2`, `slot3`, `settings`.

## Kampfregeln (Phase 1)
Initiative = `init + Zufall(0–4)` (Helden +0,5), Reihenfolge je Runde neu. Treffer 90 %. Schaden = `atk + 0..2 − floor(def/2)`, min. 1. Hinterreihe ohne Fernkampf: halber Schaden (aufgerundet). Verteidigen: halber Schaden bis zum eigenen nächsten Zug. Gegner zielt zu 75 % auf die Vorderreihe. Niederlage: Rückkehr zum Eingang, halbe LP, 25 % Gold weg, Gegner erholt sich. Kein Speichern im Kampf.
Balance-Messung (Node, 400 Seeds, Spieler greift nur an, Moorschrat 80 LP/Angriff 13): 400/400 Siege, im Schnitt 61 % der Gruppen-LP übrig, 0,5 bewusstlose Helden pro Sieg. Mit Verteidigen/Tränken leichter, mit Fehlentscheidungen sind Niederlagen möglich. Wert ist eine Simulation, kein Spieltest.

## Umgesetzt (Phase 1)
Startbildschirm, begehbares Raycasting-Gewölbe (Rasterbewegung, 90°-Drehung, Tween), Touch-Steuerung (Vor/Zurück/Seitwärts/Drehen, Angriff, Zaubern-Platzhalter, Interagieren, Inventar, Charakter, Karte, Menü, Speichern, Laden, Einstellungen), Tür, verschlossene Tür + Schlüssel, Truhe, ein Gegner, Rundenkampf mit sichtbarer Zugreihenfolge, Heiltrank, Auto-Karte mit Notizen, 3 Slots + Autosave (am Zielpunkt), Export/Import als Datei, Einstellungen (Lautstärke, Stumm, Qualität, Vibration, Schrift, Farbenblind), Debug-Modus, Selbsttest, Service Worker + Manifest, Update-Hinweis.

## Änderungen 0.1.1
Fackelflackern als Einstellung (Aus/Schwach/Normal, Standard Schwach); Hinweis „Geh näher heran“; gleiche Meldungen außerhalb des Kampfs nicht wiederholt; Steuerung hinter dem Titelbild ausgeblendet.

## Nicht enthalten / geplant
- Charaktereditor, Rassen, Berufe, Attribute, XP/Stufen, Ausrüstung, Runenzauber, Rast/Nahrung → Phase 2
- Falle, Geheimraum, mehrere Gegnertypen, Zwischenboss, Dorf/Wald → Phase 3
- Weitere Kapitel → Phase 4
- Gamepad (Einstellung ist nur ein Hinweistext), Fernseher-Optimierung, Performance-Messung auf dem Gerät, Balance-Feinschliff → Phase 5
- Echte Icons für Buttons (aktuell Textsymbole)

## Offene Punkte / bekannte Einschränkungen
- Alles Gerätespezifische (Touch, Vollbild, Installation, Audio, Vibration, 60 FPS auf dem S25) ist **nicht auf Gerät getestet**.
- IndexedDB-Wrapper (`store.js`) ist in Node nicht testbar; nur im Browser geprüft.
- `screen.orientation.lock` funktioniert vermutlich nur im Vollbild/installiert (nicht geprüft). Das Manifest verlangt Querformat; zusätzlich zeigt die Seite im Hochformat einen Hinweis.
- Ladezeit-Ziel (Ziel, nicht gemessen): erster Start online < 3 s, danach offline < 1,5 s. Messung: Debug-Modus zeigt „Start→1. Bild“.
- FPS-Ziel 60 auf dem S25. Messung: Debug-Modus (Einstellungen → Debug) zeigt FPS und Renderzeit. Die Schleife ist auf ~60 FPS gedrosselt.

## Nächste Schritte (Phase 2)
1. `heroes` aus dem Code-Datensatz lösen: Charaktereditor, Rassen/Berufe-Tabellen in `game.json`, Spielstand-Migration v1→v2 (Heldenfelder erweitern).
2. Attribute + abgeleitete Werte, XP/Stufen bis 10, Ausbalancierungstabelle als Datei.
3. Inventar/Ausrüstung, Runenzauber (Runenfolgen, eigenes Namensschema), Rast/Nahrung.
4. Tests in `tests.js` erweitern (Zauber, Rast, Migration v1→v2).
