# HANDOVER – Die Schatten von Eldermoor

Autor: eldermoor-dev · Stand: Phase 2 Schritt 0 und 1 umgesetzt und auf dem Gerät getestet, Version 0.2.1

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
- `races.<id>`: `name, desc, mods{maxHp,atk,def,init}` (Mensch, Elf, Zwerg, Ork, Gnom). **Zahlen sind vorläufig** (vom Assistenten gesetzt, nicht vom Nutzer vorgegeben), Feinabstimmung in Schritt 2/4.
- `classes.<id>`: `name, desc, row (Standardreihe), ranged, base{maxHp,atk,def,init}` (warrior, rogue, priest, mage, ranger). Waldläufer-Werte (24/7/2/6, hinten, Fernkampf) ebenfalls vorläufig.
- `quickParty[]`: `name, race, cls` (Schnellstart-Gruppe; ergibt exakt die Werte der festen Gruppe aus 0.1.5: Berenn/Sira/Odalys/Ivo, alle Mensch).
- Kampfwerte eines Helden = `classes.base + races.mods`, Untergrenzen maxHp 1, atk 1, def 0, init 0 (`deriveStats` in logic.js).
- Held im Spielstand: `id, name, race, cls, role (Berufsname, Anzeige), row, maxHp, atk, def, init, ranged, look (Porträt-Startwert), hp`. Name 1–12 Zeichen, Namen der Gruppe verschieden (ohne Groß/Kleinschreibung).

**Spielstand (Version 2)**: `{format:'eldermoor-save', v:2, savedAt, state}`; `state` = `rng, levelId, player, heroes, inv, gold, flags, objs, seen, notes, steps` (`combat` wird nie gespeichert).
Migration: `MIGRATIONS[n]` wandelt Version n → n+1 (`logic.js`); beim Laden wird bis `SAVE_VERSION` verkettet.
**Migration v1→v2 (erläutert):** v1-Helden hatten nur `role`. Die Migration ergänzt je Held `race: 'human'`, `cls` (Krieger→warrior, Schurke→rogue, Priester→priest, Magier→mage) und `look = Index*7+3` (genau der bisherige Porträt-Startwert, Aussehen bleibt gleich). **Nichts anderes wird verändert**: LP, Kampfwerte, Position, Gold, Inventar, Objekte, Karte, Notizen, Zufallszustand bleiben bitgleich. „Mensch“ hat Modifikatoren 0, die gespeicherten Werte entsprechen daher genau Mensch + Beruf. Unbekannter Beruf in einem v1-Stand → Ladefehler mit Meldung. Die Eingabedatei wird nicht verändert; erst beim nächsten Speichern entsteht v2. v1-Stände bleiben dauerhaft ladbar. Neuere Spielstände werden abgelehnt. Geladene Stände werden validiert (`validateState`).
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

## Änderungen 0.2.1
- Gerätetest 0.2.0 (Galaxy S25, 13.11.2026): Update, Schnellstart, Debug-Zeile ohne Überlappung (60 FPS), Laden eines echten v0.1.5-Spielstands (Migration v1→v2, LP erhalten, „Mensch · Beruf“), Selbsttest 29/29, Schrittgeräusche aus, Namenseingabe mit Bildschirmtastatur (Querformat) funktionieren.
- Fund: Dialoge, die höher als der sichtbare Bereich sind (Einstellungen, Selbsttest, Gruppeneditor), wurden im Browser mit Adressleiste oben abgeschnitten. Änderung: `#modal-box{max-height:100%}` statt `94vh`. Ursache nur vermutet (vh ohne Adressleiste), im Vollbild trat der Fehler nicht auf. Auf dem Gerät noch zu bestätigen.
- Charakteransicht: Zeilen umbrechen sauber (Rasse · Beruf / Reihe / Angriff / Verteidigung je eigene Zeile), kein loser Punkt mehr.
- Neu: Knopf „Zufällige Gruppe“ im Editor (`randomParty` in logic.js). Würfelt Rasse und Beruf, behält die Namen, sorgt dafür, dass mindestens ein Held vorn steht. Schnellstart bleibt die feste Menschen-Gruppe.
- Tests: 30. Keine neuen Dateien. `VERSION` = 0.2.1 in main.js und sw.js.

## Änderungen 0.2.0 (Phase 2, Schritt 0 und 1)
- Schritt 0: `DEFAULTS.steps = false`. Einstellungen haben jetzt `settingsV` (2): bestehende Einstellungen ohne `settingsV` werden **einmalig** auf `steps=false` gesetzt (sonst bliebe der gespeicherte alte Standard `true`); danach bleibt eine bewusste Wahl erhalten. Debug-Zeile (FPS) liegt jetzt als eigenes Element links unter der Knopfleiste (fest am Bildschirmrand, vierzeilig) statt in der Bühne; in Node/Headless auf Überlappung geprüft (4× und 3×, mit und ohne Kampf).
- Schritt 1: `heroes` aus game.json entfernt → `races`, `classes`, `quickParty`. „Neues Spiel“ öffnet Dialog: Schnellstart-Gruppe oder Gruppeneditor (Name, Rasse, Beruf, Reihe je Held, Werte-Vorschau, Porträt-Vorschau). Reihe folgt dem Beruf, bis sie manuell geändert wird. Neuer Beruf Waldläufer (Porträt neu), Rassenmerkmale im Porträt (Elf Ohren, Zwerg Bart, Ork grüne Haut/Hauer, Gnom Nase). Charakteransicht zeigt Rasse. Fix: Tastaturbefehle (W, A, S, D, Q, E, Leertaste …) werden in Eingabefeldern ignoriert, sonst wären Namen nicht tippbar. Spielstandformat 2 mit Migration (siehe oben). Neuer Spielstand zeigt Version „Phase 2 (in Arbeit)“.
- Keine neuen Dateien; `ASSETS` unverändert. `VERSION` in main.js und sw.js = 0.2.0.
- Tests: 29 (vorher 20), neu u. a. echter v1-Spielstand (mit dem Code von 0.1.5 erzeugt, in tests.js eingebettet), Gruppenvalidierung, 25 Rasse×Beruf-Kombinationen, Gleichheit Schnellstart = alte Gruppe, Porträts, Standard `steps=false`.

## Entscheidungen des Nutzers für Phase 2 (Stand 13.11.2026)
- Gruppe: 4 Helden **frei erstellbar** (Rasse + Beruf), dazu Schnellstart-Gruppe.
- **Rassen (5):** Mensch, Elf, Zwerg, Ork, Gnom.
- **Berufe (5):** Krieger, Schurke, Priester, Magier, Waldläufer.
- Magie: Runenzauber mit **Mana**.
- Tod: Helden werden **bewusstlos**, kein Dauer-Tod; nach Rast wieder einsatzbereit.
- Schwierigkeit: **fair**, wählbar (Einstellung).
- Gegner pro Kampf: bis zu **3** in Phase 2.
- Hunger/Nahrung: **mild**.
- Töne: **Schrittgeräusche standardmäßig aus** (umgesetzt in 0.2.0), Hintergrund an, **keine Musik**.
- Erster Inhalt nach den Systemen: Testdungeon = Kapitel 1 (siehe „Designentscheidungen 13.11.2026“). Frühere Vorgaben „30–45 Min.“ und „Kapitel 1 Graufurt“ sind durch die Entscheidung vom 13.11.2026 (Spielzeit und Kapitel legt der Assistent fest) ersetzt.
- Neue Monster: Aussehen und Namen frei erfunden, Nutzer prüft per Screenshot.
- Externer Auftrag (ChatGPT, „Version 0.2“) wurde gesichtet: Kampf (Initiative, Angriff/Verteidigung/Spezial/Gegenstand, Status Gift/Betäubung/Schutz, Ressourcen, transparente Schadensberechnung, einfache KI) und Charakterentwicklung (XP, Attribute, Klassenfähigkeiten, Ausrüstung, Rassen/Berufe, dauerhafte Speicherung) werden **zusammen** in Phase 2 umgesetzt. Sicherung der laufenden Version: GitHub „Neue Version erstellen“ (v0.1.5) vor Beginn.
- Spielstand: Migration v1→v2 ausdrücklich erläutern; v1-Stände müssen ladbar bleiben (umgesetzt, siehe „Spielstand (Version 2)“).

## Designentscheidungen 13.11.2026 (Nutzer delegiert an den Assistenten; Anlass: EOB2-Ideenliste von Gemini)
- Vorgaben des Nutzers: keine festen Gefährten, keine feste Spieldauer, keine Kapitelvorgabe; Dauer und Kapitel legt der Assistent fest. Zielfenster **Gesamtspielzeit 3 bis 5 Stunden**.
- **Kampf bleibt rundenbasiert** (kein Echtzeit/Step-Dance). Vom Nutzer am 13.11.2026 bestätigt, **vorläufig**: kann später geändert werden (Kampflogik bleibt deshalb von der Oberfläche getrennt). Gründe: gebaut und in Node getestet; Einschätzung (nicht gemessen): Ausweichen in Echtzeit ist mit zwei Daumen auf dem S25 schwerer. Cooldowns werden als Runden-Abklingzeit bei Fähigkeiten umgesetzt (Schritt 3).
- **Keine Musik** bleibt (Entscheidung des Nutzers hat Vorrang vor der Gemini-Liste; am 13.11.2026 bestätigt, **vorläufig**, kann später geändert werden). Fokus auf Geräusche (Ambient, später Monsterlaute in der Ferne, Schalter, Wind draußen).
- Übernommen aus der Ideenliste: „Alle angreifen“ (Schritt 3), Stangenwaffen aus der Hinterreihe über Waffenreichweite (Schritt 5), Automap ohne Geheimnisse mit eigenen Markern (vorhanden; Geheimwände bleiben bis zur Entdeckung Wand), Rätsel nur mit Hinweisen in der Welt (Wandinschriften, Dialoge), Zauberleiste ohne Blättern (Schritt 5), faire Schwierigkeit. Bodengegenstände auf Touch per Antippen statt Ziehen.
- Gruppe: 4 Helden (`PARTY_SIZE`); bis 6 mit NPC-Rekruten erst Phase 4 (Platz der Heldenkarten in der Leiste vorher prüfen).
- **Neuer Schritt vor dem Testdungeon: „Mehrere Gebiete“ (vom Nutzer am 13.11.2026 bestätigt).** Grund (aus dem Code belegt): `state.objs`, `state.seen`, `state.notes` gehören heute einem Level, `applyDefeat` kehrt zum Start dieses Levels zurück, `exit` setzt nur ein Flag. Nötig: Übergänge (Treppe/Ausgang → Gebiet + Position), Zustand je Gebiet, Spielstand v3 mit Migration v2→v3 (v1/v2-Stände bleiben ladbar).
- **Kampagnenplan (Vorschlag des Assistenten, Zeiten sind Schätzungen, erst der Testdungeon liefert Messwerte):**

| Kap. | Ort / Biom | Schwerpunkt | Schätzung |
|---|---|---|---|
| 1 | Gewölbe unter Eldermoor (Testdungeon, Keller) | Tutorial aller Systeme, 12–18 Räume, mind. 2 Geheimnisse, 1 Rätsel, Endgegner | 30–40 Min. |
| 2 | Moor und Dorf Graufurt (Außen) | Hub, NPC-Dialoge, Moor-Gegner, erste Rekruten optional | 40–50 Min. |
| 3 | Tempelanlage | Druckplatten, Teleporter, Hinweise an Wänden, Zwischenboss | 50–60 Min. |
| 4 | Katakomben | eng, Ressourcenmanagement, Rast/Nahrung, Geheimnisse | 50–60 Min. |
| 5 | Schattenturm (mehrere Stockwerke) | vertikal, Rätselkette, Endboss | 50–60 Min. |
| | Summe | | ca. 3,7 bis 4,5 Std. |

- Phasen neu: Phase 2 (Schritt 2–6) → **Phase 3: Mehrere Gebiete, Welt-Mechaniken, Dialogfenster, Kapitel 1** → Phase 4: Kapitel 2–5 mit Außenbiom, NPCs → Phase 5: Gamepad, Fernseher, Balance-Feinschliff, Geräte-Performance. Story-Details je Kapitel werden erst vor deren Bau festgelegt.

## Nicht enthalten / geplant
- Charaktereditor, Rassen, Berufe, Attribute, XP/Stufen, Ausrüstung, Runenzauber, Rast/Nahrung → Phase 2
- Mehrere Gebiete/Stockwerke (Spielstand v3), Hebel, Druckplatten, Teleporter, Geheimwände, Wandinschriften, Bodengegenstände, Dialogfenster, Falle, mehrere Gegnertypen → Phase 3, danach Kapitel 1 (Testdungeon)
- Kapitel 2 bis 5, Außenbiom (Himmel, Bäume), rekrutierbare NPCs, Gruppe bis 6 → Phase 4
- Gamepad (Einstellung ist nur ein Hinweistext), Fernseher-Optimierung, Performance-Messung auf dem Gerät, Balance-Feinschliff → Phase 5
- Echte Icons für Buttons (aktuell Textsymbole)

## Offene Punkte / bekannte Einschränkungen
- **0.2.0 nicht auf Gerät getestet.** Testplan Galaxy S25: (1) Update auf 0.2.0 über GitHub Pages, Titel zeigt 0.2.0. (2) „Fortsetzen“ mit altem Spielstand: Helden Berenn/Sira/Odalys/Ivo als „Mensch · Beruf“, LP wie vorher. (3) Einstellungen: Schrittgeräusche aus. (4) Debug an: FPS-Zeile links unter der Knopfleiste, nichts überdeckt. (5) Neues Spiel → Eigene Gruppe: Namen tippen (Bildschirmtastatur im Querformat, verdeckt sie Felder?), Rasse/Beruf/Reihe ändern, Spiel starten, kurzer Kampf. (6) Speichern in Slot, Laden.
- Risiko ohne Gerätetest: Bildschirmtastatur im Querformat beim Namenseingeben (Scrollverhalten des Dialogs).
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
0. **Erledigt (0.2.0)**: `DEFAULTS.steps = false`, Debug-Zeile verschoben. Offen beim Nutzer: GitHub-Version `v0.1.5` als Sicherung anlegen (vor dem Hochladen von 0.2.0; kann der Assistent nicht prüfen).
1. **Erledigt (0.2.0, nur Node und Desktop-Chrome headless getestet, nicht auf dem Gerät):** `heroes` aus dem Code lösen: Charaktereditor (4 Helden frei, Rasse + Beruf), Rassen- und Berufstabellen in `game.json`, Schnellstart-Gruppe. Spielstand-Migration v1→v2 (Heldenfelder erweitern), ausdrücklich erläutern; alte Stände müssen ladbar bleiben.
2. Attribute und abgeleitete Kampfwerte, XP/Stufen bis 10, Ausbalancierungstabelle als Datei.
3. Kampf erweitern: Spezialfähigkeiten je Beruf mit Mana/Ausdauer, Statuswirkungen (Gift, Betäubung, Schutz, Schwäche), Gegner-Muster mit **angekündigten** Aktionen (z. B. schwerer Schlag; Verteidigen/Betäuben lohnt), einfache Gegner-KI, bis zu 3 Gegner mit Rollen, Schwächen/Resistenzen, transparente Schadensberechnung (Detailansicht), kurze Pause zwischen Zügen, schnelle Doppeltipps ignorieren. Normalangriff schwächer als Fähigkeiten.
4. Balance messen (Node-Simulation): „nur Angriff“ muss deutlich schlechter abschneiden als kluges Spielen. Aktueller Stand zum Vergleich: nur Angriff 400/400 Siege (zu leicht, Nutzer bestätigt den Eindruck).
5. Inventar/Ausrüstung, Runenzauber (Runenfolgen, eigenes Namensschema), Rast/Nahrung (mild).
6. Tests in `tests.js` erweitern (Zauber, Rast, Status, Migration v1→v2, Balance).
Danach Phase 3 (siehe „Designentscheidungen 13.11.2026“). Monster-Verbesserung (Animation, Trefferblitz, Varianten) in Phase 3/4.
Arbeitsregel: nichts als getestet bezeichnen, was nicht geprüft wurde; Gerätetests meldet der Nutzer.
