# HANDOVER – Die Schatten von Eldermoor

Autor: eldermoor-dev · Stand: Phase 1 (Prototyp), Version 0.1.5

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

## Änderungen 0.1.2
Einstellungen: Schrittgeräusche und Hintergrundgeräusche einzeln abschaltbar (`steps`, `ambient`). Kampf: gelber/roter Zugbalken („Am Zug: …“), Zugansage pro Zug, Begründung in den Meldungen (Reihe, Deckung, halber Schaden), Knopf „Protokoll“ (Kampfprotokoll mit Rundentrennern, nur im Speicher, nicht im Spielstand).

## Änderungen 0.1.3
Layout: `fitStack()` misst die Knopfblöcke und passt Meldungen/Aktionsleiste/Heldenkarten dazwischen ein (Fehler: Überlappung mit Steuerknöpfen bei Sicherheitsrand am Display, vom Nutzer gemeldet).

## Änderungen 0.1.4
Monster-Sprite neu: `genSchrat` erzeugt 160×160 statt 64×64 (Borke, Moos, Geweih, Klauen, Wurzelbeine, schräge Augen). Sprites können jetzt eigene Größe haben (`tex.w`); Wand-/Bodentexturen bleiben 64×64. Bildauflösung bleibt 480×270. Oberfläche (Kampfanzeige, Leiste, Karten) skaliert über `--hs` mit dem Spielbild (kleiner, wenn nur 3× passt, z. B. mit Adressleiste).

## Änderungen 0.1.5
Neue Einstellung **Bildschärfe**: Scharf (960×540, Texturen auf 128 verdoppelt mit Scale2x + Korn) ist jetzt Standard, Retro (480×270, wie in der Vorgabe) bleibt wählbar. Auf Nutzerwunsch („zu verpixelt“). Technik: `setResolution(r)` ändert die live exportierten `W`/`H` in render.js, `buildRenderer()` in main.js baut Renderer, Texturen, Canvas und ImageData neu; die Bühne bleibt ein ganzzahliges Vielfaches von 480×270. Bei nicht ganzzahligem Verhältnis (z. B. 3×/2 = 1,5) glättet der Browser (`image-rendering:auto`), bei ganzzahligem bleibt es pixelig-scharf. Messung der Renderzeit auf dem Gerät: Debug-Modus.

## Entscheidungen des Nutzers für Phase 2 (Stand 13.11.2026)
- Gruppe: 4 Helden **frei erstellbar** (Rasse + Beruf), dazu Schnellstart-Gruppe.
- **Rassen (5):** Mensch, Elf, Zwerg, Ork, Gnom.
- **Berufe (5):** Krieger, Schurke, Priester, Magier, Waldläufer.
- Magie: Runenzauber mit **Mana**.
- Tod: Helden werden **bewusstlos**, kein Dauer-Tod; nach Rast wieder einsatzbereit.
- Schwierigkeit: **fair**, wählbar (Einstellung).
- Gegner pro Kampf: bis zu **3** in Phase 2.
- Hunger/Nahrung: **mild**.
- Töne: **Schrittgeräusche standardmäßig aus** (noch umzusetzen: `DEFAULTS.steps = false`), Hintergrund an, **keine Musik**.
- Erster Inhalt nach den Systemen: **Testdungeon** (12–18 Räume, mindestens 2 Geheimnisse, 1 Rätsel, Endgegner, 30–45 Min.), danach Kapitel 1 Graufurt.
- Neue Monster: Aussehen und Namen frei erfunden, Nutzer prüft per Screenshot.
- Externer Auftrag (ChatGPT, „Version 0.2“) wurde gesichtet: Kampf (Initiative, Angriff/Verteidigung/Spezial/Gegenstand, Status Gift/Betäubung/Schutz, Ressourcen, transparente Schadensberechnung, einfache KI) und Charakterentwicklung (XP, Attribute, Klassenfähigkeiten, Ausrüstung, Rassen/Berufe, dauerhafte Speicherung) werden **zusammen** in Phase 2 umgesetzt. Sicherung der laufenden Version: GitHub „Neue Version erstellen“ (v0.1.5) vor Beginn.
- Spielstand: Migration v1→v2 ausdrücklich erläutern; v1-Stände müssen ladbar bleiben.

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
- **Gemessen auf dem Galaxy S25 (Screenshot des Nutzers, 13.11.2026, Version 0.1.5, Scharf 960×540, Grafik Hoch, Vollbild, Skalierung 4×):** FPS 60, Renderzeit 5,1 ms, Start→1. Bild 127 ms.
- **Vom Nutzer bestätigt:** Offline-Betrieb funktioniert („ohne WLAN geht“); Spielstand speichern (Slot 1) funktioniert; Durchlauf bis zum Runenstein („Gebiet abgeschlossen“) funktioniert; Update auf 0.1.5 über GitHub Pages funktioniert (Titelbild zeigt 0.1.5).
- Offen (Nutzer hat nicht geantwortet): ob das „wackelnde Schatten“-Problem bei Fackelflackern „Aus“ weg ist; ob der Hinweis der Debug-Zeile (liegt hinter der oberen Knopfleiste) stört (kosmetisch, Debug-Modus).
- FPS-Ziel 60 auf dem S25. Messung: Debug-Modus (Einstellungen → Debug) zeigt FPS und Renderzeit. Die Schleife ist auf ~60 FPS gedrosselt.

## Nächste Schritte (Phase 2) – zusammengeführt aus Nutzerwünschen und externem Auftrag
Reihenfolge, jeweils kleiner, einzeln testbarer Schritt mit Testplan für das Smartphone:
0. Vor Beginn: GitHub-Version `v0.1.5` als Sicherung anlegen (Nutzer). `DEFAULTS.steps = false`; Debug-Zeile (FPS) nicht hinter die obere Knopfleiste legen.
1. `heroes` aus dem Code lösen: Charaktereditor (4 Helden frei, Rasse + Beruf), Rassen- und Berufstabellen in `game.json`, Schnellstart-Gruppe. Spielstand-Migration v1→v2 (Heldenfelder erweitern), ausdrücklich erläutern; alte Stände müssen ladbar bleiben.
2. Attribute und abgeleitete Kampfwerte, XP/Stufen bis 10, Ausbalancierungstabelle als Datei.
3. Kampf erweitern: Spezialfähigkeiten je Beruf mit Mana/Ausdauer, Statuswirkungen (Gift, Betäubung, Schutz, Schwäche), Gegner-Muster mit **angekündigten** Aktionen (z. B. schwerer Schlag; Verteidigen/Betäuben lohnt), einfache Gegner-KI, bis zu 3 Gegner mit Rollen, Schwächen/Resistenzen, transparente Schadensberechnung (Detailansicht), kurze Pause zwischen Zügen, schnelle Doppeltipps ignorieren. Normalangriff schwächer als Fähigkeiten.
4. Balance messen (Node-Simulation): „nur Angriff“ muss deutlich schlechter abschneiden als kluges Spielen. Aktueller Stand zum Vergleich: nur Angriff 400/400 Siege (zu leicht, Nutzer bestätigt den Eindruck).
5. Inventar/Ausrüstung, Runenzauber (Runenfolgen, eigenes Namensschema), Rast/Nahrung (mild).
6. Tests in `tests.js` erweitern (Zauber, Rast, Status, Migration v1→v2, Balance).
Danach Phase 3: Testdungeon (12–18 Räume, 2 Geheimnisse, Rätsel, Endgegner, 30–45 Min.). Monster-Verbesserung (Animation, Trefferblitz, Varianten) in Phase 3/4.
Arbeitsregel: nichts als getestet bezeichnen, was nicht geprüft wurde; Gerätetests meldet der Nutzer.
