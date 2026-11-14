# HANDOVER – Die Schatten von Eldermoor

Autor: eldermoor-dev · Stand: Phase 2 Schritt 0 bis 2 auf dem Gerät getestet; 3a teilweise auf dem Gerät (Laden alter Stände, Anzeige); 3b auf dem Gerät bestätigt; 3c nur Node/Headless getestet, Version 0.4.0

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
| BALANCE.md | Balancetabelle (EP, Rassen, Berufe, Werte je Stufe), **erzeugt**, nicht von Hand ändern. Neu erzeugen: `node -e "import('./logic.js').then(async L=>{const fs=await import('node:fs');fs.writeFileSync('BALANCE.md',L.balanceMarkdown(JSON.parse(fs.readFileSync('game.json','utf8'))))})"`. Der Test prüft, dass sie zu game.json passt. Nicht im Offline-Cache. |
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
- `enemies.<kind>`: `hp, atk, def, init, gold, xp` (EP je Held, der nach dem Sieg nicht bewusstlos ist)
- `progression`: `maxLevel` (10), `xp[]` = kumulative EP für Stufe 2 bis 10 (100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200). **Vorläufig**, Feinabstimmung in Schritt 4.
- `races.<id>`: `name, desc, mods{maxHp,atk,def,init}` (Mensch, Elf, Zwerg, Ork, Gnom). **Zahlen sind vorläufig** (vom Assistenten gesetzt, nicht vom Nutzer vorgegeben), Feinabstimmung in Schritt 2/4.
- `classes.<id>`: `name, desc, row (Standardreihe), ranged, healer? (Priester: keine Warnung bei Hinterreihe), base{maxHp,atk,def,init}, growth{maxHp,atk,def,init}` (Wachstum in **Zehnteln je Stufe**) (warrior, rogue, priest, mage, ranger). Waldläufer-Werte (24/7/2/6, hinten, Fernkampf) ebenfalls vorläufig.
- `quickParty[]`: `name, race, cls` (Schnellstart-Gruppe; ergibt exakt die Werte der festen Gruppe aus 0.1.5: Berenn/Sira/Odalys/Ivo, alle Mensch).
- Kampfwerte eines Helden = `classes.base + races.mods + floor((Stufe−1) × growth / 10)`, Untergrenzen maxHp 1, atk 1, def 0, init 0 (`deriveStats(data, race, cls, level)` in logic.js). Stufe 1 ergibt exakt die Werte aus 0.2.0. Die vier Kampfwerte (LP, Angriff, Verteidigung, Initiative) sind die „Attribute“; Mana kommt mit den Runenzaubern (Schritt 5).
- Held im Spielstand: `id, name, race, cls, role (Berufsname, Anzeige), level (1–10), xp (EP, bei Stufe 10 bei 3200 gedeckelt), row, maxHp, atk, def, init, ranged, look (Porträt-Startwert), hp`. Name 1–12 Zeichen, Namen der Gruppe verschieden (ohne Groß/Kleinschreibung).

**Spielstand (Version 3)**: `{format:'eldermoor-save', v:3, savedAt, state}`; `state` = `rng, levelId, player, heroes, inv, gold, flags, objs, seen, notes, steps` (`combat` wird nie gespeichert).
Migration: `MIGRATIONS[n]` wandelt Version n → n+1 (`logic.js`); beim Laden wird bis `SAVE_VERSION` verkettet.
**Migration v1→v2 (erläutert):** v1-Helden hatten nur `role`. Die Migration ergänzt je Held `race: 'human'`, `cls` (Krieger→warrior, Schurke→rogue, Priester→priest, Magier→mage) und `look = Index*7+3` (genau der bisherige Porträt-Startwert, Aussehen bleibt gleich). **Nichts anderes wird verändert**: LP, Kampfwerte, Position, Gold, Inventar, Objekte, Karte, Notizen, Zufallszustand bleiben bitgleich. „Mensch“ hat Modifikatoren 0, die gespeicherten Werte entsprechen daher genau Mensch + Beruf. Unbekannter Beruf in einem v1-Stand → Ladefehler mit Meldung. Die Eingabedatei wird nicht verändert; erst beim nächsten Speichern entsteht v2. v1-Stände bleiben dauerhaft ladbar. Neuere Spielstände werden abgelehnt. Geladene Stände werden validiert (`validateState`).
**Migration v2→v3 (erläutert):** Helden bekommen `level: 1` und `xp: 0`. Sonst wird nichts verändert (Stufe 1 hat kein Wachstum, die gespeicherten Kampfwerte bleiben genau gleich; LP, Position, Gold, Inventar, Objekte, Karte bleiben bitgleich). v1-Stände laufen die Kette v1→v2→v3. Die Eingabe wird nicht verändert; erst beim nächsten Speichern entsteht v3. Gültigkeit beim Laden: Stufe ganzzahlig 1..10, EP ganzzahlig ≥ 0. **Migration v3→v4 (0.3.0):** Helden bekommen `maxMp` und `mp` (voll) nach `classes.<id>.res` und Stufe (`deriveMp`). Die Migration bekommt die Spieldaten als zweites Argument (`migrate(save, migrations, target, data)`). Gültigkeit: `maxMp` ganzzahlig ≥ 0, `0 ≤ mp ≤ maxMp`. **Hinweis:** Der geplante Schritt „Mehrere Gebiete“ braucht damit Spielstand **v5** (Migration v4→v5).
Erfahrung: Nach einem Sieg bekommt jeder Held mit LP > 0 die EP-Summe der besiegten Gegner (`grantXp`). Bewusstlose gehen leer aus. Aufstieg setzt die Kampfwerte neu; die LP steigen nur um den Zuwachs der Max-LP (keine Vollheilung). Bei Stufe 10 werden EP gedeckelt.
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

## Änderungen 0.4.1 (Korrektur zu 0.4.0, auf dem Gerät gefunden)
- **Fehler:** Die Zielwahl nutzte `S.target`, das schon das Kamera-Ziel ist; nach dem ersten Kampf stand dort eine Zahl, jede Bewegung warf `TypeError` („Cannot create property 'x' on number '0'“), das Spiel war nicht mehr bewegbar. Behoben: Kampfziel heißt jetzt `S.foe`. Lehre: Zustandsfelder in `S` vor dem Anlegen auf Namenskonflikte prüfen; Test „nach dem Kampf wieder bewegen“ fehlte (nur Headless-Browser-Skript, nicht in tests.js).
- Gruppen zeigen jetzt eine Gestalt je Gegner (nebeneinander, `buildSprites(objs, tex, time, angle)`); weiterhin alle mit dem Moorschrat-Sprite.
- `VERSION` 0.4.1.

## Änderungen 0.4.0 (Phase 2, Schritt 3c: mehrere Gegner)
- Gegnergruppen bis 3: Karten-Objekt `{type:'enemy', kind, kinds:[…]}` (`kind` = erste Art, bestimmt das Sprite; **alle Arten nutzen vorerst das Moorschrat-Sprite**, eigene Grafiken fehlen). Gleiche Arten werden A, B, C genannt. Einzelgegner verhalten sich wie vorher (LP aus dem Objekt).
- Zielwahl: Gegnerzeile antippen (markiert), Angriff und Fähigkeit gehen auf das Ziel; fällt es aus, rückt das nächste nach. **„Alle“** (`heroAction` Typ `sweep`, `SWEEP_MULT` 60 %): trifft jeden lebenden Gegner mit 60 % Schaden, kostenlos, nur bei mindestens 2 Gegnern. **Annahme (nicht gesichert):** Die Ideenliste sagte nur „Alle angreifen“; ich habe es so gedeutet.
- Neue Gegner: Sumpfwolf (`ai: weakest`, 60 % Ziel schwächster Held), Moorkultist (`ai: backline`, 75 % Hinterreihe, Treffer 35 % Schwäche). Moorschrat: `heavy {every:3, mult:170}` = jeder dritte Zug ein **angekündigter** Schwerer Schlag (Ansage im Zug davor, ⚠ in der Gegnerzeile; Verteidigen halbiert). Daten: `ai`, `heavy`, `onHit`.
- Rechenweg: `calcDamage(…, {trace})` und `explain(trace)`; Meldungen tragen den Rechenweg nach `SEP` (U+241F). Das HUD zeigt nur den Text davor, das **Kampfprotokoll** die Rechnung („Angriff 8 + Wurf 2 − Rüstung 1 = 9“).
- Nach dem Sieg stehen bewusstlose Helden mit 1 LP auf (nach der EP-Vergabe, also ohne EP); vorläufig bis zur Rast (Schritt 5).
- Heilende Hand wirkt auch bei vollen LP, wenn der Held vergiftet ist.
- Testdungeon: `en2` (2 Wölfe) im ersten Raum, `en3` (Wolf + 2 Kultisten) versperrt den Gang vor der Eisentür. **Alte Spielstände enthalten diese Gruppen nicht** (Objekte liegen im Stand), neue Spiele schon.
- Behoben auf dem Gerät/Headless: `#enemybox` bekam Tipps nicht durch (Canvas fing sie ab) → `pointer-events:auto`.
- Tests: 38 Node. Neu: Gruppen, Zielwahl, Rechenweg, Alle, Schwerer Schlag, KI, Aufstehen, Entgiften bei vollen LP, Daten. `VERSION` 0.4.0. Noch **nicht** auf dem Gerät geprüft. Offen aus 3: 3d (Pause zwischen Zügen, Doppeltipps ignorieren).

## Änderungen 0.3.2 (Korrektur)
- Bewusstlose Helden verlieren ihre Statuswirkungen (auf dem Gerät aufgefallen: ☠ blieb bei bewusstloser Sira stehen). `VERSION` 0.3.2.

## Änderungen 0.3.1 (Phase 2, Schritt 3b: Statuswirkungen und Kartenlayout; auf dem Gerät bestätigt: Gift, Anzeige, Layout)
- `data.statuses`: Gift ☠, Betäubt ✸, Schwach ▼. Zustand nur im Kampf in `state.combat.status['h0'|'e0']` (`{poison:{t,p}, stun:{t}, weak:{t}}`), **nicht gespeichert**, Spielstand bleibt v4.
- Regeln: Gift schadet am **Ende des eigenen Zugs** (Held bleibt dabei mindestens bei 1 LP, Gegner kann sterben → Sieg). Betäubung: nächster Zug entfällt (`skipStunned`, die Oberfläche ruft sie in `runEnemyTurns` auf, auch für Helden). Schwäche: Angriff ×0,75 abgerundet, min. 1. Dauer sinkt am Ende des eigenen Zugs; erneutes Auflegen nimmt die längere Dauer/stärkere Wirkung.
- Quellen (vorläufig): Wuchtschlag 35 % Betäubung (1 Zug), Hinterhalt Gift 3 Runden à 2, Gezielter Schuss Schwäche 2 Runden, Heilende Hand nimmt Gift, Moorschrat vergiftet getroffene Helden mit 30 % (3 Runden à 2). Daten: `ability.inflict`, `ability.cleanse`, `enemies.<id>.onHit`.
- **Schutz** ist kein eigener Status: „Verteidigen“ (halber Schaden bis zum nächsten eigenen Zug) deckt das ab. Falls später gewünscht (z. B. Zauber „Schutz“ auf Verbündete), nachziehen.
- Layout: Heldenkarte zeigt „Name · vorn/hinten“ und Statussymbole in der Namenszeile, darunter nur `LP · Ressource`; Gegnerkarte zeigt Statussymbole neben dem Namen.
- Charakteransicht zeigt Ressource (x/y) und die Fähigkeit mit Kosten und Beschreibung (auf dem Gerät aufgefallen: fehlte in 0.3.0).
- Tests: 37 Node (Neu: Statuswirkungen). `VERSION` 0.3.1. Noch **nicht** auf dem Gerät geprüft.

## Änderungen 0.3.0 (Phase 2, Schritt 3a: Ressource und Fähigkeiten)
- Schritt 3 wird in Teile geteilt, die einzeln auf dem Handy getestet werden: **3a** Ressource + eine Fähigkeit je Beruf (diese Version), **3b** Statuswirkungen, **3c** bis zu 3 Gegner (Zielwahl, „Alle angreifen“, angekündigte Aktionen, einfache KI, Schadensdetail, neue Gegnertypen), **3d** Pause zwischen Zügen, schnelle Doppeltipps ignorieren.
- `classes.<id>.res = { name, base, growth }` (Mana oder Ausdauer, Wachstum in Zehnteln je Stufe, Rassen ändern es nicht) und `classes.<id>.ability = { id, name, kind: damage|heal, cost, mult (Prozent) | heal, sure?, desc }`. Krieger Wuchtschlag (160 %), Schurke Hinterhalt (140 %, trifft immer), Priester Heilende Hand (+20 LP, Zielwahl), Magier Feuerblitz (180 %), Waldläufer Gezielter Schuss (150 %, trifft immer). Zahlen **vorläufig**, siehe BALANCE.md.
- Regeln: Fähigkeit kostet Ressource; Angriff und Verteidigen geben 1 Punkt zurück (`MP_REGEN`); nach Sieg und nach Niederlage ist die Ressource voll (vorläufig, bis Rast in Schritt 5). **Keine Abklingzeit** in 3a (die Kosten begrenzen den Einsatz); falls Abklingzeit gewünscht, später nachziehen. Normalangriff bleibt unverändert, Fähigkeiten sind also stärker.
- `calcDamage(state, atk, def, {mult, sure})`: gleiche Zufallsfolge wie vorher (der Trefferwurf wird auch bei `sure` verbraucht). `heroAction` Typ `ability` (Fehler `no-mp`, `no-ability`, `bad-target`).
- Oberfläche: Button „✦ Name (Kosten Ressource)“ statt des gesperrten „Zaubern“; Priester wählt Ziel; Heldenkarte zeigt `x/y MP` oder `AU`; Touch-Knopf „Fähigkeit“ (nur im Kampf). Spielstand v4 (siehe oben). BALANCE.md um Fähigkeitentabelle erweitert.
- Tests: 36 Node. Neu: Fähigkeiten (Kosten, zu wenig Ressource, Rückgewinn, Heilung, Sieg füllt auf, Migration v3→v4, Datenprüfung). `VERSION` 0.3.0. Noch **nicht** auf dem Gerät geprüft.

## Änderungen 0.2.2 (Phase 2, Schritt 2)
- Stufen 1 bis 10, EP-Tabelle, Wachstum je Beruf (`growth`), `deriveStats` mit Stufe, `grantXp`, EP-Vergabe nach dem Sieg (Moorschrat 120 EP: alle vier Helden steigen auf Stufe 2 auf). Spielstand v3 mit Migration v2→v3 (siehe oben). Charakteransicht zeigt Stufe und „EP x / y“.
- `BALANCE.md` (erzeugt aus game.json). Alle Zahlen **vorläufig** (vom Assistenten gesetzt, nicht gespielt/gemessen).
- Kleinigkeiten aus 0.2.1: Priester im Gruppeneditor ohne Hinterreihen-Warnung (`healer`), Werte-Zeile im Editor als Flex-Liste (kein loser Punkt).
- Nicht geändert: Kampfregeln, Gegnerwerte. Mit Stufe 10 wird die Gruppe sehr stark; das wird in Schritt 3/4 (Gegner, Simulation) angepasst. Im aktuellen Testdungeon gibt es nur einen Gegner, die Stufen wirken dort erst nach dem Sieg.
- Tests: 35 Node (34 im Selbsttest im Browser, die Dateiprüfungen laufen nur in Node). Neu: Stufen/Wachstum, EP, Sieg bringt EP, Migration v2→v3, BALANCE.md aktuell. `VERSION` 0.2.2.
- **Nicht auf Gerät getestet.** Testplan: (1) Titel zeigt 0.2.2. (2) „Fortsetzen“ mit altem Stand (v2): Helden unverändert, Charakteransicht zeigt „Stufe 1“, „EP 0 / 100“. (3) Editor: Priester hinten ohne rote Warnung, Krieger hinten mit Warnung. (4) Moorschrat besiegen: Meldungen „Erfahrung: +120“ und vier Aufstiege, danach Stufe 2 in der Charakteransicht, LP-Balken noch nicht voll. (5) Speichern, Laden.

## Änderungen 0.2.1
- Gerätetest 0.2.0 (Galaxy S25, 13.11.2026): Update, Schnellstart, Debug-Zeile ohne Überlappung (60 FPS), Laden eines echten v0.1.5-Spielstands (Migration v1→v2, LP erhalten, „Mensch · Beruf“), Selbsttest 29/29, Schrittgeräusche aus, Namenseingabe mit Bildschirmtastatur (Querformat) funktionieren.
- Fund: Dialoge, die höher als der sichtbare Bereich sind (Einstellungen, Selbsttest, Gruppeneditor), wurden im Browser mit Adressleiste oben abgeschnitten. Änderung: `#modal-box{max-height:100%}` statt `94vh`. Ursache nur vermutet (vh ohne Adressleiste), im Vollbild trat der Fehler nicht auf. Auf dem Gerät noch zu bestätigen.
- Charakteransicht: Zeilen umbrechen sauber (Rasse · Beruf / Reihe / Angriff / Verteidigung je eigene Zeile), kein loser Punkt mehr.
- Neu: Knopf „Zufällige Gruppe“ im Editor (`randomParty` in logic.js). Würfelt Rasse und Beruf, behält die Namen, sorgt dafür, dass mindestens ein Held vorn steht. Schnellstart bleibt die feste Menschen-Gruppe.
- Tests: 30. Keine neuen Dateien. `VERSION` = 0.2.1 in main.js und sw.js.
- Vorgemerkt am 13.11.2026 (Nutzer stimmte zu), umgesetzt in 0.2.2: Warnung beim Priester entfällt; Werte-Zeile im Editor ohne losen Punkt.

## Änderungen 0.2.0 (Phase 2, Schritt 0 und 1)
- Schritt 0: `DEFAULTS.steps = false`. Einstellungen haben jetzt `settingsV` (2): bestehende Einstellungen ohne `settingsV` werden **einmalig** auf `steps=false` gesetzt (sonst bliebe der gespeicherte alte Standard `true`); danach bleibt eine bewusste Wahl erhalten. Debug-Zeile (FPS) liegt jetzt als eigenes Element links unter der Knopfleiste (fest am Bildschirmrand, vierzeilig) statt in der Bühne; in Node/Headless auf Überlappung geprüft (4× und 3×, mit und ohne Kampf).
- Schritt 1: `heroes` aus game.json entfernt → `races`, `classes`, `quickParty`. „Neues Spiel“ öffnet Dialog: Schnellstart-Gruppe oder Gruppeneditor (Name, Rasse, Beruf, Reihe je Held, Werte-Vorschau, Porträt-Vorschau). Reihe folgt dem Beruf, bis sie manuell geändert wird. Neuer Beruf Waldläufer (Porträt neu), Rassenmerkmale im Porträt (Elf Ohren, Zwerg Bart, Ork grüne Haut/Hauer, Gnom Nase). Charakteransicht zeigt Rasse. Fix: Tastaturbefehle (W, A, S, D, Q, E, Leertaste …) werden in Eingabefeldern ignoriert, sonst wären Namen nicht tippbar. Spielstandformat 2 mit Migration (siehe oben). Neuer Spielstand zeigt Version „Phase 2 (in Arbeit)“.
- Keine neuen Dateien; `ASSETS` unverändert. `VERSION` in main.js und sw.js = 0.2.0.
- Tests: 29 (vorher 20), neu u. a. echter v1-Spielstand (mit dem Code von 0.1.5 erzeugt, in tests.js eingebettet), Gruppenvalidierung, 25 Rasse×Beruf-Kombinationen, Gleichheit Schnellstart = alte Gruppe, Porträts, Standard `steps=false`.

## Entscheidungen des Nutzers für Phase 2 (Stand 13.11.2026)
- **Bewusstlose Helden bekommen keine Erfahrung** (Nutzer, 13.11.2026). Sie bleiben bei 0 LP, bis eine Rast (Schritt 5) sie mit 1 LP zurückholt. So ist es schon umgesetzt (`grantXp`).
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
- **Neuer Schritt vor dem Testdungeon: „Mehrere Gebiete“ (vom Nutzer am 13.11.2026 bestätigt).** Grund (aus dem Code belegt): `state.objs`, `state.seen`, `state.notes` gehören heute einem Level, `applyDefeat` kehrt zum Start dieses Levels zurück, `exit` setzt nur ein Flag. Nötig: Übergänge (Treppe/Ausgang → Gebiet + Position), Zustand je Gebiet, Spielstand **v5** mit Migration v4→v5 (v1 bis v4 bleiben ladbar; v4 ist seit 0.3.0 vergeben).
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
- Mehrere Gebiete/Stockwerke (Spielstand v5), Hebel, Druckplatten, Teleporter, Geheimwände, Wandinschriften, Bodengegenstände, Dialogfenster, Falle, mehrere Gegnertypen → Phase 3, danach Kapitel 1 (Testdungeon)
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
2. **Erledigt (0.2.2, nur Node/Headless getestet):** Attribute und abgeleitete Kampfwerte, XP/Stufen bis 10, Ausbalancierungstabelle als Datei (`BALANCE.md`).
3. Kampf erweitern: Spezialfähigkeiten je Beruf mit Mana/Ausdauer, Statuswirkungen (Gift, Betäubung, Schutz, Schwäche), Gegner-Muster mit **angekündigten** Aktionen (z. B. schwerer Schlag; Verteidigen/Betäuben lohnt), einfache Gegner-KI, bis zu 3 Gegner mit Rollen, Schwächen/Resistenzen, transparente Schadensberechnung (Detailansicht), kurze Pause zwischen Zügen, schnelle Doppeltipps ignorieren. Normalangriff schwächer als Fähigkeiten.
4. Balance messen (Node-Simulation): „nur Angriff“ muss deutlich schlechter abschneiden als kluges Spielen. Aktueller Stand zum Vergleich: nur Angriff 400/400 Siege (zu leicht, Nutzer bestätigt den Eindruck).
5. Inventar/Ausrüstung, Runenzauber (Runenfolgen, eigenes Namensschema), Rast/Nahrung (mild).
6. Tests in `tests.js` erweitern (Zauber, Rast, Status, Migration v1→v2, Balance).
Danach Phase 3 (siehe „Designentscheidungen 13.11.2026“). Monster-Verbesserung (Animation, Trefferblitz, Varianten) in Phase 3/4.
Arbeitsregel: nichts als getestet bezeichnen, was nicht geprüft wurde; Gerätetests meldet der Nutzer.


## 0.4.6 (Schritt 3d)
- Zielwahl auf Gerät bestätigt (13.11.2026, 'Klappt').
- Doppeltipp-Schutz: nach jeder Heldenaktion und nach jeder Gegnerphase 450 ms Sperre (TAP_COOL, S.coolUntil) für heroAct; Test headless (Doppelklick -> nur 1 Aktion). Pausen zwischen Zügen waren schon da (550/450 ms).
- Schritt 3 damit abgeschlossen, nächster: Schritt 4 Balance-Simulation.

## 0.4.5
- Gegnerfigur im Bild antippen wählt das Ziel (onViewTap, Projektion wie Raycaster).

## 0.4.4
- Gegnerfenster links statt mittig, schmaler, halbtransparent, Zugleiste ohne tote/bewusstlose Teilnehmer (Fenster verdeckte die Gegner, Nutzer 13.11.).

## 0.4.3
- Zielwahl: Gegnerzeilen größer (Tippfläche), Hinweis 'Gegner antippen = Ziel' in der Kopfzeile. Auf dem Gerät meldete der Nutzer, Wechsel per Tippen gehe nicht (Ursache nicht gesichert, Verdacht: zu kleine Tippfläche).

## 0.4.2
- Fix: Gruppenfiguren zeigen nur lebende Gegner (buildSprites bekommt alive-Map aus dem Kampf).
- Geräte-Test 0.4.1 (13.11.2026, Nutzer-Screenshots): Bewegung nach Sieg OK, 2er-/3er-Gruppe sichtbar, Zielwahl, Alle 60 %, Rechenweg, Gift OK. Offen: Schwerer Schlag, Betäubung, Schwäche, Entgiftung. Beobachtung: tote Gegner als Figur sichtbar (behoben), Zugreihenfolge-Leiste zeigt evtl. tote Gegner (ungeprüft).
- Balance-Verdacht: Wölfe 9-10 Schaden/Treffer, Ivo im 2. Kampf bewusstlos -> Schritt 4.


## Schritt 4: Balance-Simulation (13.11.2026)
- Neu: `sim.js` (Node, `node sim.js 3000 --write` erzeugt SIM.md), nutzt die echte Spiellogik. Strategien: "nur Angriff" und "klug". Kein Spielcode geändert, Version bleibt 0.4.6.
- Ergebnis (3000 Läufe): Einzelkämpfe werden von beiden Strategien zu 100 % gewonnen. Nur Angriff: 0,7-0,9 bewusstlose Helden und 34-45 Schaden pro Kampf; klug: 0,1-0,3 KO und 24-29 Schaden. Kampagne Wölfe -> Gang -> Schrat ohne Rast: nur Angriff schafft 71 % (Gang) bzw. 36 % (Schrat), klug 100 %. Mit Rast schafft auch nur Angriff 100 %.
- Schluss: Rast/Verpflegung (Schritt 5) ist der eigentliche Balance-Hebel. Werte erst danach anfassen und Simulation wiederholen. Grenzen: nur zwei feste Strategien, kein Fliehen, nur Stufe-1-Start mit natürlichem XP-Gewinn.


## 0.5.0 (Schritt 5a: Rast und Proviant)
- Neu: Item `ration` (Proviant, kind `supply`), Startvorrat 3, +1 in Truhe `chest_a`. `game.json: rest {hungryPct: 30, enemyDistance: 3}`.
- `restParty(state, data)` (logic.js): nicht im Kampf, nicht bei lebendem Gegner näher als 3 Felder (Chebyshev), nicht bei voller Gruppe. Mit Proviant: alle Helden (auch Bewusstlose) voll LP und Ressource, 1 Proviant weg. Ohne: je Held +30 % LP und Ressource (Bewusstlose stehen auf, mindestens 1 LP). Kein Zeitdruck, kein Hungertimer ("mild").
- UI: Menü -> "Rasten (Proviant: n)", im Inventar beim Proviant "Rasten", Hilfetext ergänzt.
- Spielstand: **keine neue Version nötig**: `inv` ist eine Zuordnung, fehlender Proviant zählt als 0 (alte Stände starten ohne Vorrat; hungrige Rast geht immer).
- Der Sieg-Aufstehen mit 1 LP bleibt als Rückfall bestehen.
- Tests: 39 (neu: Rast). Simulation: mit Proviant (3) schafft auch "nur Angriff" 100 % (siehe SIM.md). Gerätetest offen.


## 0.6.0 (Schritt 5b: Ausrüstung)
- Geräte-Test 0.5.0 (14.11.2026, Screenshots): Rast mit Proviant (3 -> 2, alle voll, Bewusstloser steht auf), "Alle sind bereits bei Kräften", "Ein Gegner ist zu nah" bestätigt.
- Neu: 2 Plätze je Held (`data.slots`: weapon, armor). Items `kind: equip` mit `slot`, `atk`/`def`, optional `classes`. Vorhanden: Eisenschwert (+2 Angriff; Krieger, Schurke, Waldläufer), Eichenstab (+2; Magier, Priester), Lederharnisch (+1 Vert.; alle), Kettenhemd (+2; Krieger, Priester, Waldläufer). Alle vier liegen in Truhe `chest_a`.
- `hero.equip = {weapon, armor}` optional; gespeicherte `atk`/`def` bleiben Grundwerte (Stufenaufstieg überschreibt sie), Boni addieren `heroAtk`/`heroDef`/`gearBonus` (logic.js) beim Rechnen. Funktionen: `equipItem`, `unequipItem`, `canEquip`. Nicht im Kampf. Tausch legt altes Stück ins Inventar zurück.
- Spielstand: **keine neue Version** (fehlendes `equip` = nichts angelegt); `validateState` prüft Slot und Item-Art. v5 bleibt für "Mehrere Gebiete" reserviert.
- UI: Inventar -> "Ausrüsten" -> Held wählen (nicht erlaubte ausgegraut); Charakteransicht zeigt Waffe/Rüstung, Bonus "(+2)", "Ablegen".
- Noch offen in 5b-Umfang: Qualitätsstufen, Zufallseigenschaften, Einzigartiges, Spezialeffekte (kommt mit Beutesystem, Phase 3); Gegner-Beute.
- Tests: 40. Gerätetest offen.

## 0.7.0 (Schritt 5c: Runenzauber)
- game.json: `statuses.burn/slow`, `elements`, `runes`, `spells` (frost, bolt, group_heal), `classes.mage/priest.spells`, `enemies.*.resist`.
- logic.js: `knownSpells(data,h)` (Klassenfähigkeit = Index 0, dazu `data.spells` nach Stufe); Zauber mit `all` treffen alle; Element-Schwäche/Resistenz als Prozent nach `mult`, Meldung „Schwäche!“/„Resistent.“; Brennen (Schaden/Runde wie Gift, Held min. 1 LP), Verlangsamt (handelt nächste Runde zuletzt).
- Wichtig: Mana wird nach Sieg NICHT mehr aufgefüllt (nur Rast). Speicherversion bleibt 4.
- main.js: Aktionsleiste „✦ Zauber (n)“, Zauberliste, Runen im Charakterbild. `window.__S` nur mit `?dev`.
- sim.js: `decideSmart` nutzt Zauber. SIM.md neu (3000 Läufe).
- Ungeprüft: Runenzeichen (ᚲᛁᚦᛊᚨ) auf Android-Schrift (evtl. Kästchen).
- Tests: 41.

## 0.7.1 (Schritt 6: Tests erweitert)
- Nur tests.js neu (+ Versionsnummer, damit der Service Worker die Datei neu lädt). Spielverhalten unverändert.
- Neue Tests (46 gesamt): 150 Zufallskämpfe mit Invarianten (LP/Mana in Grenzen, Kampf endet), Zustand nach Kampf (Bewegung, Besiegte blockieren nicht, LP ≥ 1), Speicher-Rundlauf (Ausrüstung, Vorrat, kein Kampfzustand), Determinismus, Daten-Querverweise.

## 0.8.0 (Phase 3, Schritt 1: mehrere Gebiete, Speicherstand v5)
- `SAVE_VERSION = 5`. Neu im Stand: `areas` = { Gebiets-ID: { objs, seen, notes } } nur für besuchte, gerade INAKTIVE Gebiete. Aktives Gebiet bleibt wie bisher in `state.objs/seen/notes` (so änderte sich fast kein Code).
- Migration 4→5 (`MIGRATIONS[4]`, braucht data): `areas: {}`, ergänzt feste Objekte des aktuellen Gebiets, die der alte Stand nicht kennt (z. B. neue Treppe), vorhandene Objekte bleiben unverändert.
- Neues Objekt `type: "stairs"` mit `to: {level, x, y, dir}` und optional `msg`. Betreten löst Ereignis `stairs` aus (tryMove), main.js ruft `changeArea(state, data, id)`: Zustand des alten Gebiets wird gesichert, neues geladen (oder frisch erzeugt), Palette gewechselt, Autosave.
- Objekt-IDs müssen über ALLE Gebiete eindeutig sein (Flags sind global); Test prüft das. Jede Treppe braucht ein Gegenstück zurück; Zielfeld muss Boden und frei sein.
- `analyzeLevel`: Treppe zählt wie Runenstein als Ausgang.
- game.json: Treppe `stairs_down` in test1 bei (1,1); neues Gebiet `test2` „Untere Gruft“ (Truhe, 2 Kultisten, Treppe `stairs_up`).
- Darstellung: Treppe = Portal-Sprite (vorläufig), Karte: blaues Dreieck. Kartennotizen und Erkundung gelten je Gebiet.
- Debug-Teleportliste ist noch auf test1 fest verdrahtet.
- Tests: 51 (5 neue: Treppendaten, Wechsel hin/zurück mit Zustand, Kampf im 2. Gebiet, Migration v4→v5 und Ablehnung ungültiger Gebiete, Softlock test2).

## 0.9.0 (Phase 3, Schritt 2: Bossphasen und Bestiarium)
- game.json: `enemies.<id>.phases: [{below, name, msg, set}]` (below = LP-Schwelle in %, fallend; `set` überschreibt atk/def/init/heavy/onHit/ai/resist), `boss: true`. Moorschrat: Wutrausch (≤ 60 %: Angriff 15, Schwerer Schlag alle 2 Züge), Letzte Kraft (≤ 25 %: Angriff 17, Wurzelhieb ×2,0).
- logic.js: `enemyOf(data, e)` liefert Werte inkl. eingetretener Phasen (überall statt `data.enemies[kind]` bei def/resist/init/Angriff). `checkPhases` läuft nach jeder Aktion vor `advance`; jede Phase einmal, mehrere Schwellen in einem Zug werden alle gemeldet; Muster (intent/cd) beginnt neu. Phase wird nur im Kampf gehalten (nie gespeichert); fliehen/verlieren setzt zurück.
- Bestiarium: `state.bestiary[art] = {seen, won, phase?, heavy?, onHit?, resist?{element}}`, fehlend = unbekannt. Kein Versionssprung (v5 bleibt). Werte erst nach dem ersten Sieg sichtbar; Elemente beim ersten Treffer mit Schwäche/Resistenz; Besonderheiten beim ersten Auftreten. Menü → Bestiarium.
- validateState prüft `bestiary` (optional).
- BALANCE.md zeigt Bossphasen. SIM.md neu (3000 Läufe): Schrat „nur Angriff“ 97 %, „klug“ 100 % – Boss ist mit Stufe-1-Gruppe weiterhin leicht (vorläufig, nicht angepasst).
- Tests: 54.

## 0.9.1 (Warnung vor Schwerem Schlag)
- Auslöser: Nutzer verlor gegen den Boss, weil die Ankündigung „Schwerer Schlag“ übersehen wurde (nur Protokoll/kleine Zeile).
- main.js `renderCombat`: roter, pulsierender Warnbalken im Gegnerfenster, Knopf „Verteidigen“ leuchtet (`.pulse`), Warnton (`audio.js` Fall `warn`) und Vibration [90,60,90] einmal je Ankündigung (`S.warnKey`). Name des Angriffs über `enemyOf` (Phasen können ihn ändern).
- index.html: CSS `.heavywarn`, `.ab.pulse`; bei „reduzierte Bewegung“ ohne Animation.
- Spielwerte unverändert. Tests 54 (reine Anzeige, per Headless-Browser geprüft).
