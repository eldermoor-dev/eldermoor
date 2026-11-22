# HANDOVER – Die Schatten von Eldermoor

Autor: eldermoor-dev · Stand: Version 0.34.1 (22.11.2026). Auf dem Galaxy S25 vom Nutzer bestätigt: 0.16.3, die Testliste 0.16.4–0.16.7 („passt“) und nach Gerätetest am 16.11.2026 auch 0.16.8–0.16.13 („Es passt alles“, Gesamtmeldung, siehe Abschnitt „Gerätetest 0.16.8–0.16.13“). Versionsübersicht: CHANGELOG.md. Ältere Einträge unten sind chronologisch, neueste am Ende.

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
| sim.js | Balance-Simulation (Node, `node sim.js 3000 --write` schreibt SIM.md). Nicht im Offline-Cache. |
| SIM.md | Ergebnis der Simulation (`node sim.js 3000 --write`), seit 0.16.7 mit Abschnitt C: ganze Kampagne. Nach jeder Änderung an Gegner- oder Heldenwerten neu erzeugen. |

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

## 0.10.0 (Phase 3, Schritt 3: Beutesystem, Speicherstand v6)
- `SAVE_VERSION = 6`, Migration 5→6 (`MIGRATIONS[5]`): `gear: {}`, `uid: 0`. Neu im Stand: `gear` = { uid: Gegenstandsdefinition }, erzeugte Ausrüstung liegt mit Anzahl 1 in `inv[uid]`; `hero.equip[slot]` darf eine uid sein.
- `itemDef(state, data, id)` löst feste (`data.items`) und erzeugte Gegenstände auf. `gearBonus/heroAtk/heroDef/canEquip` nehmen jetzt `state` als letztes Argument; neu `heroInit` (Initiative aus Ausrüstung, nur in `buildOrder`).
- game.json: `lootBases`, `quality` (Gewöhnlich 55 / Gut 28 / Selten 14 / Episch 3; Bonus Hauptwert, Zahl der Eigenschaften), `affixes` (atk/def/init, je Platz), Unikate als normale Gegenstände mit `q: "unique"` (Schratdorn, Wurzelstab), `enemies.<id>.gearDrop {chance, boost?, slot?}` und `drops [{item | pick:[ids], chance}]` (Unikate nur, solange nicht im Besitz, auch nicht getragen). Truhenbeute `{gear:{boost,slot}}`.
- `rollGear` (RNG: Grundgegenstand, Qualität, Eigenschaften), `addGear`, `rollDrops` (läuft in `finishVictory` nach der Erfahrung; danach ändert sich der Zufallsverlauf nachfolgender Kämpfe).
- Obergrenzen in `validateState`: atk/def ≤ 20, init ≤ 20; Namen/Platz/Grundgegenstand müssen stimmen.
- UI: Inventar sortiert (Verbrauchbares, Vorrat, Quest, Ausrüstung), Qualitätsfarben, Vergleich „· Angriff +1“ beim Ausrüsten, Initiativebonus im Charakterbild, Toast bei „Beute von …“.
- Nicht enthalten: Handel/Verkaufen, Ausrüstung wegwerfen (Inventar wächst), maxHP-Eigenschaften, Elementeigenschaften.
- BALANCE.md hat Abschnitt „Beute“. Tests 59.

## 0.11.0 (Phase 3, Schritt 4: Fehlerlog und Verkaufen)
- Fehlerlog (Menü → Fehlerlog (n)): `window.onerror`/`unhandledrejection` und die Fehler beim Laden/Importieren landen via `logError` in `ERR.list` (max. 40, gleiche Fehler werden gezählt), gespeichert unter dem Schlüssel `errlog` in IndexedDB. Anzeige mit lokaler Zeit, Version, Gebiet/Position/Kampf-Kontext; Knöpfe Kopieren (Zwischenablage, Rückfall `execCommand`), Leeren. Reine Logik: `pushError`, `formatErrorLog`, `ERRLOG_MAX` in logic.js. Kein Spielstand-Bestandteil.
- Verkaufen (Inventar → „Verkaufen (n G)“ mit Rückfrage): `itemWorth`/`sellPrice`/`sellItem` in logic.js. `items.<id>.value` in game.json; erzeugte Ausrüstung: Wert × (1 + 0,5 je Qualitätsstufe) + 4 je Punkt Zufallseigenschaft; Verkaufspreis = Hälfte, min. 1. Nicht verkäuflich: Quest, Unikate (`q: unique`), `noSell`. Nicht im Kampf. Getragene Ausrüstung muss erst abgelegt werden. Verkauf überall möglich (Händler folgt später; dessen Kaufpreis = voller Wert).
- Speicherstand weiter v6. Tests 61.

## 0.12.0 (Phase 3, Schritt 5: Händlerin und Siedlung am Moorrand)
- game.json: `shops.<id> = {name, owner, greeting, stock:[{item}]}` (feste, unbegrenzte Ware); neues Gebiet `moorrand` („Siedlung am Moorrand“, 12×6) mit Händlerin `merchant_hedda` (Objekt `type: "merchant"`, `shop`) und Treppe `stairs_back`; in `test1` neue Treppe `stairs_moor` bei (1,4). Ware: Heiltrank, Proviant, Eisenschwert, Eichenstab, Lederharnisch, Kettenhemd.
- logic.js: `merchant` blockiert wie eine Truhe, `interact` liefert `{shop}`; `shopStock`, `buyPrice` (voller Wert), `buyItem`. Verkaufen (`sellItem`, halber Wert) ist in der UI jetzt nur noch im Handelsfenster; die Logik selbst prüft keinen Händler (UI-Regel).
- main.js: `openShop` (Reiter Kaufen/Verkaufen, seltene und epische Ausrüstung verlangt zweiten Tipp), Inventar ohne Verkaufsknopf (Hinweis „Verkaufen kannst du bei einer Händlerin“), Kartensymbol „$“.
- render.js: Händlerin-Sprite `genMerchant` (vorläufig, prozedural; Stand durch die Bildschirmleiste teils verdeckt).
- Speicherstand weiter v6. Tests 63.

## 0.13.0 (Inhaltsphase, Schritt 1: Moorpfad, Hinweistafeln, Moorlicht, Auftrag)
- Plan der Inhaltsphase (Vorschlag, Namen/Story vom Assistenten): Siedlung → Moorpfad (0.13) → Kultgruft mit Zwischenboss (0.14) → Schratgruben (0.15) → Nebelturm mit Endboss „Nebelhüter“ (0.16) → Balance über das ganze Spiel (0.17). Startgebiet bleibt vorerst `test1` (Debug-/Testgewölbe); Umstellung auf die Siedlung als Start erst später.
- game.json: neues Gebiet `moorpfad` (24×9, Palette `moor`, 3 Hinweistafeln, 4 Kampfgruppen, 4 Truhen, Schlüsseltruhe `chest_pfad_key` vor dem Tor `door_gruft`, Ende `exit_pfad`), Treppe `stairs_pfad` in der Siedlung (10,3) und `stairs_pfad_west` im Moorpfad. Neue Palette `moor` (Siedlung nutzt sie jetzt auch), neuer Gegner `moorlicht` (18 LP, Initiative 10, zielt auf die Hinterreihe, 40 % Verlangsamung, Feuer +50 % Resist, Blitz −50 %), Questgegenstand `gruft_key`.
- logic.js: Objekttyp `sign {text}` (blockiert wie eine Truhe, `interact` liefert `{msg, long}`); `merchant.talk {flag, text}` liefert beim ersten Gespräch den Auftragstext (Flag `talk_hedda`).
- main.js: lange Texte als Toast, Auftragstext im Handelsfenster; `exit`-Objekte können `say`, `title`, `text` mitbringen (bisher fest „Testgewölbe“); Kartensymbol für Tafeln.
- render.js: Sprites `wisp` (Moorlicht, je Gruppenmitglied nach `kinds[i]`) und `sign` (Tafel). Alle anderen Gegner nutzen weiter das vorläufige Schrat-Bild.
- logic.js `syncStatic(state, data)` (läuft in `deserialize`): ergänzt fehlende Objekte und gleicht Treppen, Tafeln, Händler und Ausgänge aller bekannten Gebiete mit game.json ab, ohne Speicherversion. Truhen, Türen, Gegner behalten ihren Zustand. Damit bekommen Stände aus 0.12.0 die neue Treppe und den Auftrag.
- Speicherstand weiter v6.
- Tests 65.

## 0.14.0 (Inhaltsphase, Schritt 2: Kultgruft, Zwischenboss, neue Treppen)
- Treppen: `stairs.look` = `down` | `up` | `path` (Abstieg dunkel mit Stufen, Aufstieg hell, Durchgang aus Holz); ohne `look` bleibt das Portal-Bild. Runenstein (`exit`) bleibt das Portal. `render.js`: `genStairs`, `genArch`.
- Neues Gebiet `kultgruft` (27×13): Eingang mit Treppe (1,6), Gang mit 2 Skeletten, Haupthalle, Kapelle (Tür `door_chapel`, Kultwächter + Kultist, Truhe `chest_g1` mit `gruft_siegel`), Zellen (Tür `door_cells`, 3 Gegner, Beutetruhe), Gang zum Siegeltor `door_boss` (Schlüssel `gruft_siegel`), Boss `en_boss` in 1 Feld breitem Gang, danach Kammer mit Truhe und `exit_gruft` (Meldung: Weg zu den Schratgruben noch eingestürzt; wird in 0.15.0 eine Treppe).
- Moorpfad: `exit_pfad` ist durch die Treppe `stairs_gruft` (22,4) ersetzt; Rückweg `stairs_gruft_up`.
- Neue Gegner: `skeleton` (24 LP, Eis +50 % Resist, Feuer −25 %), `kultwaechter` (34 LP, Def 5, Schildstoß alle 4 Züge ×150 %, zielt auf die Hinterreihe), Boss `hauptmann` (130 LP, Def 5, 35 % Schwäche, Richtspruch alle 3 Züge ×160 %; Phase „Kultruf“ ≤ 65 %: Angriff 14, Richtspruch alle 2 Züge; Phase „Letzte Bastion“ ≤ 30 %: Angriff 16, Def 4, Richtspruch ×190 %). Beute: Siegelpanzer (Rüstung +4 Def) oder Nebelmantel (+3 Def, +1 Init), jeweils einmalig, dazu erzeugte Ausrüstung mit Boost 2. Neue Sprites `genSkeleton`, `genGuard` (Wächter und Hauptmann); Hauptmann größer/dunkler.
- logic.js: `syncStatic` entfernt jetzt auch veraltete feste Objekte (z. B. alten Ausgang) und gleicht `look` ab; alte Stände aus 0.13.0 bekommen die Treppe.
- Balance (Ad-hoc-Simulation, Stufe 1 Start, nur Moorpfad+Gruft, ohne Ausrüstung, 200 Läufe, **nicht** in SIM.md): „klug“ gewinnt den Boss in 99 % der Läufe, „nur Angriff“ gesamt 68 % (21 % der Läufe scheitern bereits an der Gruppe `en_p3` im Moorpfad). Wirkliche Spielerdaten fehlen noch; Feinabstimmung in 0.17.0.
- Tests 66. Speicherstand weiter v6.

## 0.14.1 (Treppen neu gezeichnet)
- Nutzer: Treppen 0.14.0 sahen nicht wie Treppen aus, der hölzerne Durchgang wirkte wie eine Klappe, der Aufstieg hatte einen goldenen Block. Neu in `render.js`: `genStairs('down')` mit heller Einfassung, hellen Trittflächen und dunklen Kanten; `genStairs('up')` mit hellen Stufen und dunklem Durchgang oben; `genArch` als runder Steinbogen mit nebligem Gang dahinter. Keine Änderung an Daten, Logik oder Speicherstand.
- Lob des Nutzers: Humor/Ironie der Moorpfad-Tafel (Irrlichter, „folgt keinem Licht“); diesen Ton für weitere Tafeln beibehalten.

## 0.14.2 (Hinweistafeln: Antippen und schärferes Bild)
- Nutzer: Tafeln sollen sich durch Antippen lesen lassen und waren zu unscharf. `main.js` `readSignByTap`: Tippen auf eine sichtbare Tafel (freie Sicht, bis 7 Felder, Trefferbreite wächst mit der Nähe) zeigt den Text sofort als Meldung und Hinweisfenster; Tippen daneben tut nichts. Gilt nur außerhalb von Kampf und Fenstern.
- `render.js` `genSign`: größeres Schild, helles Holz, dunkle Schriftblöcke in 4 Zeilen, ohne Hochskalieren (scharf), Maßstab 0,7.
- Offen (Zusage an Nutzer): geöffnete Truhen begehbar machen (0.15.0).
- Tests 66, keine Daten-/Speicheränderung.

## 0.14.3 (Fix: Gruppenbild im Kampf)
- Fehler (Nutzer-Screenshot): In gemischten Gruppen (Kultist + 2 Skelette) zeigte das Bild nach dem Tod des Kultisten noch den Kultisten und nur ein Skelett, weil die Bilder nach Platz statt nach Art gewählt wurden. `main.js` `aliveMap()` liefert jetzt je Gruppe die Arten der lebenden Gegner, `render.js` `buildSprites` nimmt Liste oder Zahl. Neuer Test, 67.

## 0.14.4 (Bestiarium: Elementtexte eindeutig)
- Nutzer: „Feuer: Schwäche“ ist nicht eindeutig (Schwäche ist auch ein Statuseffekt) und zwei Doppelpunkte stören. Bestiarium zeigt jetzt „Elemente: anfällig für Feuer (+25 % Schaden), resistent gegen Eis (−50 % Schaden)“, bei 100 % „immun gegen …“. Kampfmeldung bei Zaubern: „Anfällig!“ statt „Schwäche!“ („Resistent.“ unverändert). Statuseffekt „Schwäche“ behält seinen Namen.

## 0.14.5 (Tafeln: höchstens 2 Felder Abstand)
- Nutzer: Tafeln nur aus höchstens 2 Feldern lesbar, dann per Antippen der Tafel oder Interagieren-Knopf. `logic.js` `interact`: liegt die Tafel genau 2 Felder voraus und das Feld davor ist frei, liefert Interagieren ihren Text (statt „Geh näher heran.“). `main.js` `readSignByTap`: Reichweite von 7 auf 2,6 Felder. Test 68. Keine Daten-/Speicheränderung.

## 0.14.6 (Grafik: schärfer und glatter, Moos neu, Wandfackeln)
- Nutzer: Grafik insgesamt schärfer/glatter, Moos sieht seltsam aus, ab und zu eine Fackel, nicht flackernd.
- `render.js`: Wände (Stein, Moos, Fackel) entstehen im Modus „Scharf“ in 256×256, Boden/Decke in 128×128 direkt aus dem 64er-Raster (kontinuierlich abgetastet, weiches Rauschen, schwaches Pixelkorn, Lichtkanten, jeder Stein mit eigener Grundhelligkeit, abgerundete Steine) statt per Scale2x hochskaliert. Im Modus „Retro“ bleibt es 64×64. Texturgrößen müssen Zweierpotenzen bleiben (Maskierung im Raycaster).
- Moos (`genMoss`): wächst an Fugen und Oberkanten, nach unten dünner, weiche Ränder, höchstens Helligkeit 4,6.
- Fackel: neues Wandfeld `T` im Kartentext (`WALL_TORCH`, `genTorch`), feste Flamme ohne Flackern, Halterung, warmer Lichtschein auf dem Stein. Material `glow` wird vom Nebel nur halb abgedunkelt (leuchtet in der Ferne weiter). Fackeln gesetzt: Kultgruft 8, Moorpfad 3, Siedlung 2. `T` zählt wie `#` als Wand.
- Palette `moor`: `glow` jetzt warm (255,200,110) statt grünlich; Moorlicht-Kern nutzt `flesh` (bleibt grün).
- Texturerzeugung ~150 ms in Node (Startzeit auf dem Handy messen: Einstellungen → Debug → „Start→1. Bild“).
- Das globale „Fackelflackern“ (Einstellung) bleibt unverändert und betrifft nur die Helligkeit der ganzen Szene.

## 0.14.7
- Treppen-Sprites neu (`genStairs`): Steinbogen wie beim Pfad, darin Treppe (hoch: Stufen mit Licht oben, runter: Stufen verschwinden im Schwarz). Nur render.js; Logik unverändert.

## 0.14.8
- Pfeil im Schlussstein entfernt (Nutzer: unnötig). Sonst wie 0.14.7.

## 0.15.0
- Bedienung: Top-Leiste entfernt. Feld 6 des rechten Blocks = „Menü“ (☰); das Menü-Fenster enthält jetzt auch „Karte“ (und „Debug“ bei aktivem Debug-Modus). Kompass (`#compass`, Overlay oben rechts im Bild, Zifferblatt dreht sich mit der Blickrichtung; `renderCompass`, aufgerufen in `renderAll` und `doTurn`). Knopfbeschriftung 8 px, damit „Interagieren“ passt.
- Geöffnete Truhen sind begehbar (`blockerAt`: nur `!o.open`).
- Text vereinheitlicht: „X verteidigt.“, „½ Verteidigung“, „verteidigt: halber Schaden“.
- Boss-Balance: Hauptmann 160 LP, Angriff 13 (Vorschlag war 180; Simulation: bei reinem Angriff 44 % statt 18 % Siegquote, klug 97 %). Neuer Boss `grubenschrat` (Name „Moorschrat“, 190 LP, 200 EP, 40 Gold, Phasen wie `schrat`); `schrat` (80 LP) bleibt der Test-Boss in test1.
- Neues Level `schratgruben` (35×15, Palette `grube`, Wandzeichen `r` = Höhlenfels, `o` = Fels mit Flechten, `#`/`T` Mauer/Fackel am Eingang). Treppe `stairs_gruft_down` in der Kultgruft (ersetzt das Portal `exit_gruft`) ↔ `stairs_gruben_up`. Schlüssel `gruben_schluessel` in `chest_s_key` (Südhöhle, bewacht von en_s3), Tor `door_grube` (27,7), Boss `en_sboss` im Lager, `exit_gruben` als Platzhalter (Nebelturm folgt in 0.16).
- Neuer Gegner `erzkaefer` (34 LP, Angriff 11, Vert. 4, Feuer −25 %, Blitz +25 %) mit eigenem Sprite (`genKaefer`).
- Render: `genRock` (Voronoi-Felsbrocken, optional Flechten), `WALL_ROCK = 6`, `WALL_LICHEN = 7`.
- Simulation (camp.mjs, nicht im Repo): klug ≈ 97 % Boss-Siege, Stufe vor Schratgruben-Boss Ø 6,7; reines Angreifen Ø 5,9.
- Offen: „Rasten“-Knopf als eigene Taste entfällt, Rasten steht im Menü.

## 0.15.1
- Auftritt: neues Overlay `#event` (Titel + Satz, 3,4 s, blockiert keine Eingaben), Funktion `showEvent`/`introOnce` in main.js; Marke im Spielstand `flags['intro:<objId>']` (Boss) bzw. `flags['area:<levelId>']` (Gebiet), also nur beim ersten Mal. Daten: `enemies.<id>.intro {title,text}` (hauptmann, grubenschrat, schrat), `levels.<id>.intro` (moorpfad, kultgruft, schratgruben). Neuer Sound `sting` (audio.js). Beim Boss ersetzt er den „miss“-Ton beim Kampfbeginn.
- Neue Objekte: `gate` (Fallgitter, `open`, optional `hint`, Wandtextur `WALL_GATE = 8`, `buildGrid`, Karte) und `lever` (Wandhebel, `gate` = Gitter-Id, `used`, Sprites `leverUp/leverDown`). Beide sind Blocker; `freshObj` setzt `open=false`/`used=false`; `analyzeLevel` öffnet Gitter, wenn ein Hebel erreichbar ist.
- Schratgruben: Nordstollen (Halle B, Gitter `gate_s1` bei (21,4)) mit en_s4 und `chest_s2` ist optional; Hebel `lever_s1` am Westende der Südhöhle (16,12); Hinweise: Gitter selbst, Schild `sign_s5`, Meldung beim Gitter. Karte: Nordhöhle und Nordosthöhle sind bei x=17 durch Fels getrennt.
- Neue Gegenstände: `oelflasche` (`throw`: 14 Feuerschaden, trifft immer, Elementfaktor wie bei Zaubern, 60 % Brennen) und `gegengift` (`cure: poison`), nur im Kampf (`heroAction`, type `item`, Parameter `target` bzw. `hero`). Kampfleiste: Zeilen nur, wenn etwas geht. Hedda verkauft beide; Beute in chest_s1 / chest_s2. `useItemOutside` heilt nur Gegenstände mit `heal`.
- `?dev`: `S.fn.startCombatUI`, `S.fn.showEvent` für Tests.
- Nicht umgesetzt (bewusst): Geheimräume, Schurken-Schlösser, Rollenlabel im Bestiarium. Simulation (camp.mjs) kennt die neuen Gegenstände nicht.

## 0.15.2
- Berührung: gegen Tür, Truhe, Hebel oder Gitter laufen (Vor-Taste) benutzt sie (`tryMove` meldet `blocker`, `doMove` ruft `act('interact')`). Tippen im Bild auf Tür/Truhe/Hebel/Gitter (`tapUseByTap`, bis 2,6 Felder): steht das Objekt direkt vor dir, wird es benutzt, sonst „Geh näher heran.“
- Boss-Sprite: `genSchratBoss` (192×192, breiter Baumriese mit Geweih, Zähnen, glühenden Brustrissen und Augen); gilt für `schrat` und `grubenschrat`; Bosse werden größer gezeichnet (`bossScale`: Schrat 1,2, Hauptmann 1,0). Wolf und Kultist nutzen weiter den alten Schrat-Sprite (echte Sprites offen).

## 0.15.3
- Ausgänge (`exit`) zeichnen keinen Goldring mehr: ohne `look` ein Runenstein (`genRuneStone`, Steinplatte mit leuchtenden Runen), mit `look` (`up`/`down`/`path`) wie Treppen/Bogen. `exit_gruben` hat `look: up`. Das Portal-Sprite (`sprites.portal`) wird nirgends mehr verwendet.

## 0.15.4
- Händler- und Inventarzeilen: Knopf steht immer rechts (`.row.nw`, kein Umbruch, einheitliche Mindestbreite). Symbole vor Gegenständen (`itemIcon`): ⚔ Waffe, 🛡 Rüstung, 🧪 Heiltrank, 💧 Gegengift, 🔥 Ölflasche, 🍞 Proviant, 🗝 Quest; optional `icon` im Item. `S.fn.openShop` unter ?dev.

## 0.15.5
- Schilder tragen lesbare Titel: `sign.title` (Zeilen mit `|` getrennt, max. 2 Zeilen à 8 Zeichen, Großbuchstaben, Ziffern, `.:!?-→`, Ä Ö Ü) wird mit einer 5×7-Pixelschrift (`FONT`, `genSign(seed, title)`) auf das Schild gezeichnet, darunter angedeutete Textzeilen; ein Sprite je Titel (`signTex`, Cache in `tex.signs`). Ohne `title` bleiben die dunklen Wortblöcke. Volltext weiter per Tippen/◉. Alle 10 Schilder haben Titel.

## 0.15.6
- Monster-Sprites (Skelett, Wächter, Hauptmann, Irrlicht, Erzkäfer) und Händler: im Modus „Scharf“ per `smoothSprite` (bilinear, 64→256) geglättet statt roher 64-px-Blöcke. Retro-Modus unverändert.

## 0.15.7
- Karte passt ohne Scrollen: Canvas begrenzt auf Viewporthöhe (max-height 100dvh-120px), Hinweistext und Schließen-Knopf in einer Zeile.

## 0.15.8
- Sprechende NPCs: Rede im Händlerfenster als große, mittige Sprechblase mit Name (speechHtml), Begrüßung darunter klein.

## 0.15.9
- Schilder: Platzhalter-Linien unter dem Titel entfernt; Schrift per smoothSprite (64→256) geglättet statt grober Pixelblöcke.

## 0.15.10
- Kampf: Gegenstände (Heiltrank, Gegengift) nutzt nur der Held, der gerade dran ist, nur an sich selbst (Logik erzwingt es, UI zeigt je einen Knopf). Ölflasche wirft weiter auf Gegner. Zauber (Priester-Heilung) unverändert.

## 0.15.11
- Einstellung „Helligkeit der Umgebung“ (settings.bright: 1 Original / 1.35 Hell = neuer Standard / 1.8 Sehr hell): weniger Distanznebel (fogK/bright), Paletten-Anhebung (buildPalette lift) und Mindesthelligkeit je Material. Raycaster.bright, setPalette() ohne Argument nutzt letzte Palette.

## 0.15.12
- Karte: Türen als Balken quer zum Gang (orange = zu, rot = verschlossen, grün mit Lücke = offen) statt brauner Quadrate (Verwechslung mit Truhe).

## 0.15.13
- Kampf: Knopf „Gegenstand“ zeigt bei nichts Nutzbarem einen Hinweistext (statt leerer Liste). Folge der Regel aus 0.15.10 (Items nur für den aktiven Helden).

## 0.15.14
- Kampf: angekündigte schwere Angriffe (heavy) treffen nur die Vorderreihe, solange dort ein Held steht (Magier hinten wurde durch Schweren Schlag 25+ Schaden sofort getötet). Test ergänzt (75 Tests). Weiterhin möglich: Ein-Treffer-Tod eines unverteidigten Vorderreihe-Helden in Phase 3 (Wurzelhieb 200 
## 0.15.14
- Kampf: angekündigte schwere Angriffe (heavy) treffen nur die Vorderreihe, solange dort ein Held steht (Magier hinten wurde durch den Schweren Schlag sofort getötet). Test ergänzt (75 Tests). Weiterhin möglich: Ein-Treffer-Tod eines unverteidigten Vorderreihe-Helden in Phase 3 (Wurzelhieb 200 Prozent, ATK 17).

## 0.15.15
- Heilziel per Kopf: Inventar „Benutzen“ zeigt Heldenköpfe (Porträt, Name, LP) als Knöpfe; im Kampf zählt ein Tipp auf die Heldenkarte unten als Auswahl des Heilziels, solange die Zielauswahl eines Heilzaubers offen ist (löst den Knopf abheal:i aus).

## 0.15.16
- Händler: erstes Ansprechen zeigt die Rede groß und mittig mit „Weiter“ (data-m=shopgo), danach öffnet sich der Shop direkt mit den Waren (kein Scrollen mehr bis zur Ware).
- Schrat-Bosse (schratBoss wird von schrat UND grubenschrat genutzt, genSchrat von Wolf/Kultist u. a.): Rinde mit feinen senkrechten Furchen statt Tarnflecken, Moos nur als kleine Büschel (Schultern, Kopf, Arme, Füße), beide Sprites im Modus Scharf 2× geglättet (sm2: 192→384, 160→320). Test Texturgröße schrat=320.
- Offen: Grubenschrat und Moorschrat teilen weiter dasselbe Sprite (nur Palette unterscheidet sich).

## 0.15.17
- Eigene Sprites für die Schrat-Bosse (genSchratBoss(seed, variant), sprites.moorschrat / sprites.grubenschrat; spriteFor: schrat → moorschrat, grubenschrat → grubenschrat):
  - Moorschrat: grünlich mit Algen/Moos und fauligen Holzstellen, nass (Perlen + hängende Tropfen), kahler Schädel ohne Geweih/Ohren, kleine Augen.
  - Grubenschrat: schmutzige Rinde mit Dreckflecken, lange schwarze Zottelhaare (Strähnen aus Wellenlinien), fahles Gesicht, große schwarze Augen mit Glanzpunkt, glühende Brustrisse.
- Geweih beider Bosse entfernt. Party-Erstellung hatte bereits Namensfelder (Held 1–4, maxlength NAME_MAX).

## Plan ab 0.16 (Entscheidungen des Nutzers, 15.11.2026)
- Welt: Eldermoor bleibt. Reihenfolge: Nebelturm (0.16) → Talente (Stufe 12, Kosten 1/1/2/2, 4. Talent ab Stufe 8, 6 Berufe inkl. Alchemist, Priester heißt Kleriker) → Moorfestung mit 4–5 Kellerebenen als Schlussgebiet.
- Der Nutzer will das Ende der Geschichte NICHT erfahren: keine Spoiler im Chat oder in Testanleitungen; Story-Notizen hier nur unter einer Überschrift „SPOILER“.
- Gegnerzauber: kleine Zauber überraschend, große Boss-/Flächenzauber eine Runde vorher angesagt.
- Alchemist darf als einziger Tränke an andere Helden geben (Ausnahme von der Regel aus 0.15.10).
- Geheimtüren: feiner Riss in der Wand + Hinweis in der Nähe (Schild, Inschrift, Geräusch). Kein Fortschritt durch blindes Absuchen.
- Kombinationsangriffe: automatisch bei erfüllten Bedingungen, Anzeige im Protokoll + Symbol am Gegner.
- Heldentausch in der Siedlung (neuer Held auf gleicher Stufe), damit der Alchemist in laufende Gruppen kommt.
- Übernommen aus dem Ideenpapier: Geheimtüren (Schalter, Geräusch, späterer Gegenstand), mehrstufiges Rätsel, Gewichtsplatten (braucht „Gegenstand ablegen“), veränderliche Räume, wiederkehrender Gegner, 3 Artefakte (Schwert, Bogen, Amulett), geheime Spezialisierungen (max. 2 Fähigkeiten), alternative Enden.
- NICHT weiterverfolgen (Nutzer bestätigt): neuer Titel/12 neue Ebenen, festes Ziel 5–8 Stunden, drehbare Räume, Wassersteuerung, echte APK, Chronomant „letzte Aktion wiederholen“.

## 0.16.0 – Nebelturm, Gegnerzauber, Kleriker
- Priester heißt Kleriker (classes.priest.name; interner Schlüssel bleibt `priest`). syncStatic gleicht `hero.role` alter Spielstände an. Porträt akzeptiert beide Namen.
- Gegnerzauber: `enemies.<art>.cast = [{ name, kind: bolt|heal|curse, every, mult, all, inflict, heal, announce }]` (logic.js pickCast/enemyCast, Zähler `e.ct`). bolt: trifft immer, halbe Rüstung, bevorzugt Hinterreihe, Verteidigen halbiert. heal: heilt den am stärksten verletzten Gegner, entfällt wenn niemand unter 75 % LP. curse: Status auf alle Helden. announce: Ansage einen Zug vorher. Phasen können `cast` überschreiben. Bestiarium zeigt „Zaubert: …“, BALANCE.md führt die Zauber.
- Neue Gegner: nebelgeist (Frosthauch), kultpriester (Dunkler Segen, Fluch der Schwäche), Boss nebelhueter (280 LP, 2 Phasenwechsel = 3 Phasen; Nebelspeer angesagt, später Schleier der Schwäche, Schleiersturm auf alle, Nebel sammeln).
- Neues Gebiet `nebelturm` (27×15, Palette `turm`: blauer Stein, roter Teppich, kaltes Licht): Eingang → Gang → Halle → Schreibsaal → Archiv (Turmschlüssel, Hebel) → Schatzkammer hinter Gitter; Thronsaal hinter verschlossenem Tor. Schratgruben: `exit_gruben` ersetzt durch Treppe `stairs_gruben_turm`.
- Sprites: genRobed(seed, 'geist'|'priester'|'hueter'), 128 px, im Modus Scharf 2× geglättet.
- Kampagnen-Simulation (Scratchpad camp.mjs, 300 Läufe, nicht im Repo): Stufe vor dem Turmboss Ø 8,0; Nebelhüter: kluge Spielweise ca. 98 % Sieg, reines Angreifen ca. 47 % (jeweils der Gruppen, die ihn erreichen).
- Tests: 77 (neu: Nebelturm, Gegnerzauber).
- Offen: eigener Wandtyp „Marmor“ (bisher nur Palette), Kultist nutzt weiter das alte Schrat-Sprite, kein Blinken des Verteidigen-Knopfs bei angesagtem Zauber, Geheimtür-Prototyp (für 0.16.1 geplant).
- Nachtrag 15.11.2026: Nutzer übernimmt zusätzlich alle neun offenen Ideen: falscher Schatzraum, vier Statuen (eine lügt), verfluchte Waffe, sechs Siegel (+ drittes Ende), Elementarfackeln, Positionsaktion im Kampf, Dialoge mit Entscheidungen, Abkürzungen zu besuchten Gebieten, Fallen. Verteilung vor allem auf die Kellerebenen der Moorfestung (je Ebene ein bis zwei).
- Feinplanung 15.11.2026 (Antworten des Nutzers):
  - Fallen: Hinweis am Boden, an der Wand, auf einem Schild oder durch Hinweise anderer Charaktere (NPCs). Gruppenmitglieder mit passendem Talent erkennen Fallen eher (deutlicher/früher). Keine Klasse zwingend.
  - Positionsaktion: Platztausch mit einem Helden der anderen Reihe KOSTET DEN ZUG (ersetzt Angriff/Verteidigung).
  - Dialoge: wenige Entscheidungen mit spürbaren Folgen (Belohnungen, einzelne Kämpfe, mögliches Ende).
  - Verfluchte Waffe: hoher Schaden, Träger verliert bei jedem Angriff LP; Fluch per versteckter Aufgabe lösbar.
  - Sechs Siegel: über ALLE Gebiete verteilt (auch Moorpfad, Kultgruft, Schratgruben, Nebelturm).
  - Abkürzungen: Runensteine als Reisenetz zwischen besuchten Gebieten UND Türen/Gitter, die nur von der Rückseite entriegelt werden.
  - Falscher Schatzraum: die auffällige Truhe ist ein Monster (erwacht beim Öffnen), echter Schatz hinter unscheinbarer Wand.
  - Rätselhilfe: Hinweis gegen Gold bei Hedda oder anderem NPC; ungefragt kein Spoiler.
- Umfang 15.11.2026 (Nutzer: keine Einschränkung der Spieldauer):
  - Drei Akte, ca. 13 Gebiete: Akt 1 Moor (vorhanden: Siedlung, Moorpfad, Kultgruft, Schratgruben, Nebelturm), Akt 2 Moorfestung (Oberburg + 4–5 Keller), Akt 3 letzter Abschnitt mit 2–3 Gebieten.
  - Maximalstufe 15 (statt 12): 14 Talentpunkte bei 18 möglichen (Kosten 1/1/2/2). EP-Tabelle bis 15 und Stufengate für das 4. Talent neu festlegen.
  - Siedlung wächst mit: Schmied, Taverne (Heldentausch + bis zu vier Reservehelden, die langsamer mit aufsteigen), Alchemistenküche; neue Bewohner nach Ereignissen.
  - Nebenaufgaben: Aushangbrett, zwei bis drei gute je Akt mit eigener kleiner Geschichte.
  - Neue Ebenen ALLE deutlich größer (doppelte bis dreifache Fläche). Folge: Karte muss zoomen/verschieben können, Leistung der Wegprüfung/Tests prüfen.
  - Besiegte Gegner bleiben weg; nach Ereignissen ziehen neue, stärkere Gegner in alte Gebiete ein.
  - Zwei Schwierigkeitsgrade (Normal, Schwer) beim Spielstart wählbar.

## 0.16.1 – Geheimwand-Prototyp
- Neuer Objekttyp `secret` (Geheimwand): liegt auf einer Bodenzelle, wird als Steinmauer mit feinem Riss gezeichnet (WALL_SECRET 9), sperrt bis `open`. Untersuchen/Dagegenlaufen gibt Hinweistext.
- Versteckter Schalter: `lever` mit `wall: true` = lockerer Stein in der Mauer (WALL_SWITCH 10, eingedrückt WALL_SWITCH_ON 11), öffnet über `gate: <id>` Gitter ODER Geheimwand. Kein Hebel-Sprite.
- markSeen: Blick endet an Geheimwand/Schalterstein. Karte zeichnet beide als Mauer (drawMap: wallObj, cellCharRaw), geöffnete Geheimwand = normaler Boden. analyzeLevel behandelt `secret` wie ein Gitter.
- Zustand liegt wie bei Türen/Gittern im Objekt (objs/areas), übersteht Speichern/Laden (Test). Alte Spielstände bekommen die neuen Objekte über syncStatic/freshObj.
- Nebelturm: Kammer südlich des Archivs (Felder 2–4/7–8), Geheimwand (3,6), Schalterstein (7,6), Truhe (3,8), Hinweisschild „ARCHIV“ (6,5).
- Texturen bisher nur für Steinmauer (`#`); Fels-/Moosvarianten fehlen. Tests: 78.

## 0.16.2
- Charakterkopf antippen (Karte unten): außerhalb des Kampfs öffnet "<Name> zaubert" mit Heilzaubern und Zielköpfen (`castOutside`); im Kampf: aktiver Held öffnet Fähigkeiten/Zauber, sonst Heilmenü. Ohne Zauber öffnet der Tipp den Charakterbogen.
- Gegnerzauber (bolt) verursachen höchstens 50 % der Max-LP des Ziels (Flächenzauber 40 %) – Magier fällt nicht mehr durch 1–2 Treffer.
- Debug (?dev): Gebiet wechseln, Alle +1 Stufe.

## 0.16.3
- Hedda (Händlerin) neu gezeichnet: Frau mit Kopftuch, langen Haaren/Zöpfen, Gesicht mit Wimpern und Lippen, Schürze, Laterne, hinter dem Tresen; 128-px-Sprite (sm2), warmer Hautton statt Palette-Grün.

## 0.16.4 – Fixes aus dem Gerätetest 0.16.3 (15.11.2026)
**Gerätetest 0.16.3 (Nutzer, Galaxy S25):** ok: Update/Start, Kleriker-Beschriftung, Hedda, Treppe in den Turm, Hebel, Gitter, Schatzkammer, Geheimwand (Riss, Öffnen, Karte, Speichern/Laden), Thronsaal-Tor nur mit Schlüssel, Abschlussfenster, Speichern/Laden nach dem Boss, Fehlerlog leer. Fehler: Charakterkopf antippen ging nicht. Auftrittstext Nebelturm kam nicht (vermutlich, weil der Turm im Spielstand schon früher betreten wurde; nicht gesichert). Phasenwechsel des Bosses nicht bemerkt. Nebelhüter und Turmgegner zu leicht (ohne Debug, Gruppe Stufe 8–9).
- **Fix Kopf antippen:** `#party` hatte kein `pointer-events:auto` (erbte `none` von `#hud`), Tipps gingen aufs Bild. Betraf 0.15.15/0.16.2 (Heilziel per Kopf, Zaubern per Kopf). Test prüft jetzt `#party`, `#enemybox`, `#actionbar`. Headless-Gegenprobe: in 0.16.3 erreicht der Klick die Karte nicht, in 0.16.4 öffnet er „Odalys zaubert“.
- **Monster und Truhen größer und über der Leiste:** Renderer kann den Horizont verschieben (`view.horizon` in Pixeln, Boden/Decke zeilenweise, Wände und Sprites danach). `main.js` `viewTarget/updateViewAdjust`: im Kampf (ohne Boss) weicht die Kamera 0,45 Feld zurück (`VIEW_BACK`) und neigt den Blick so, dass die Füße knapp über der Leiste (`#stack`, alle 200 ms gemessen) stehen; reicht der Platz nicht, bleibt der Kopf im Bild. Bosskämpfe unverändert (formatfüllend). Vor einer geschlossenen Truhe senkt sich der Blick. Weicher Übergang (~140 ms). Gruppenfiguren 0,62 → 0,78 (`GROUP_SCALE`), Abstand 0,36 → 0,44, Einzelgegner 0,85 → 0,9, Truhe 0,5 → 0,62 (`CHEST_SCALE`). `onViewTap` nutzt dieselbe Kamera (`viewCam`). Headless-Vorher/Nachher geprüft (Wölfe, 3er-Gruppe, Boss, Truhe), auf dem Gerät offen.
- **Bossphasen groß angesagt:** `announcePhases` zeigt beim Phasenwechsel das Ereignisbanner (Name + Satz), Ton `sting`, Vibration.
- **Rast-Regel (Nutzer):** gesperrt, wenn ein lebender Gegner in Sichtlinie ist (beliebig weit; Mauer, geschlossene Tür, Geheimwand, Schalterstein verdecken, Gitter nicht) oder näher als 10 **Schritte Weglänge** (`restThreat` in logic.js, BFS; unverschlossene Türen gelten als begehbar, verschlossene Türen/Gitter/Geheimwände trennen). `game.json → rest {enemyDistance: 10, sight: true}`. Meldungen: „zu nah (n Schritte, nötig sind 10)“ / „in Sichtweite“. Folge (gemessen, alle Gegner lebend): Kultgruft 0 Rastfelder, nach der ersten Skelettgruppe 16; Moorpfad 15, Nebelturm 14, Schratgruben 4. Simulation (sim.js) unverändert lauffähig.
- **Kartenlegende:** Knopf „Legende“ im Kartenfenster; zeigt nur Zeichen, die im Gebiet schon gesehen wurden, plus Grundzeichen. Kartensymbole aus einer Quelle (`mapSymKind`, `drawMapSym`, `MAP_LEGEND`).
- **Truhen-Wächter (Nutzer):** `chest.guard = [Gegner-IDs]` in game.json. Solange einer lebt: „Die Truhe ist bewacht. Erst die Gegner in diesem Raum besiegen.“ Gelesen aus game.json (`chestGuards`), daher ohne Migration auch für alte Stände. Zuordnung: test1 chest_a←en2; test2 chest_b←en21; Moorpfad chest_p1/chest_p2←en_p3, chest_pfad_key←en_p3+en_p4 (offenes Gelände: nächste Gruppe nach Weglänge); Kultgruft chest_g1←en_g3, chest_g2←en_g4, chest_g3←en_boss; Schratgruben chest_s1←en_s5, chest_s_key←en_s3, chest_s2←en_s4, chest_s_boss←en_sboss; Nebelturm chest_t_key←en_t4, chest_t_boss←en_tboss. Ohne Wächter: chest_p3, chest_p4, chest_g4, chest_t2, chest_t_secret, Siedlung. Bereits geöffnete Truhen bleiben offen.
- **Ausgang erneut betreten:** Ereignis `exitAgain`, zeigt `exit.again` (Turm: „Hier geht es in einer späteren Version weiter.“).
- Speicherstand weiter v6. Tests 83.

## Plan nach 0.16.4 (vom Nutzer am 15.11.2026 festgelegt bzw. bestätigt)
- **0.16.7 Balance (erledigt, siehe Abschnitt 0.16.7):** Kampagnen-Simulation neu (das frühere `camp.mjs` liegt nicht im Repo), Nebelhüter und Turmgegner schwerer. Vorschlag Zielwerte (Annahme des Assistenten, nicht vom Nutzer festgelegt): Nebelhüter bei Stufe 8 „klug“ ca. 75–85 % Siege, „nur Angriff“ unter 30 %. Neue Rast-Regel und Truhen-Wächter in die Simulation übernehmen.
- **0.16.8 Türen und Schilder:** Türen bleiben geöffnet sichtbar (Rahmen + aufgeklapptes Türblatt statt verschwinden). Raumnamen (ZELLEN, ARCHIV …) über/auf den Türen; längere Texte als Tafel **an der Wand** (sichtbar, Lesen per Tippen/◉); keine Schilder mehr mitten im Raum. Kartenlegende anpassen.
- **0.16.9 Figuren:** Skelett größer/bedrohlicher (Vorschlag: breitere Schultern, Schwert, glühende Augen); Hauptmann eigenes Sprite 128–192 px; Nebelhüter neu (192 px, Unterkörper aus Nebel, kalte Krone, kein Brust-Symbol) **sitzend auf einem Thron an der Ostwand** des Thronsaals (Option A, Nutzer 15.11.2026), Saal so, dass Truhe/Ausgang erreichbar bleiben.
- Danach 0.17: Talente (siehe Plan ab 0.16).
- Rätselhilfe an den Nutzer im Chat: gestuft (erst sanfter Hinweis, konkreter nur auf Nachfrage).

## 0.16.5 – Funde zu 0.16.4 (Nutzer-Screenshots 15.11.2026)
- **Gruppen im engen Gang:** Seitliche Figuren ragten in die Wände (Gang 1 Feld breit). `render.js` `groupOffsets(n, narrow)` und `isNarrowAt(grid, x, y, angle)`: sind beide Nachbarfelder quer zur Blickrichtung Wand, stehen die Gegner gestaffelt (vorn Mitte, dahinter ±0,22 seitlich, 0,42 tiefer). `buildSprites` bekommt dafür das Raster (6. Argument), `onViewTap` nutzt dieselbe Aufstellung. Headless geprüft (test1, Gang vor der Eisentür).
- **Offene Truhe sah aus wie ein Stuhl** (Deckel schwebte mit Lücke über dem Kasten). `genChest(true)`: Öffnung als Trapez mit dunklem, leerem Innenraum und hellem Rand, Deckel hängt ohne Lücke an der Hinterkante, nach hinten geklappt (oben schmaler, Bretterfugen, Eisenbänder, Scharnierleiste). Der Blick senkt sich jetzt vor jeder Truhe (auch geöffnet).
- **Runenstein im Testgewölbe** (früher Phase-1-Ziel `exit1`, begehbar, ohne Funktion): neuer Objekttyp `runestone {text}` (`rune_t1`), versperrt den Weg, Inschrift per Antippen/◉ als Text (Hinweis „hinauf“ = Treppe zur Siedlung, kein Story-Spoiler). `exit1` entfällt; `syncStatic` entfernt ihn aus alten Ständen und ergänzt den Runenstein (`runestone` in `STATIC_TYPES`). Kartenzeichen + Legende „Runenstein“. Hilfe: „Ziel des Prototyps“ ersetzt durch „Weg“. Debug-Teleport `exit1` → `rune_t1`. Geplant: Runensteine als Reisenetz (siehe Plan ab 0.16).
- **Hedda antippen** startet das Gespräch bzw. den Handel, wenn sie direkt vor dir steht (`tapUseByTap` kennt `merchant`); sonst wie bei Truhen „Geh näher heran.“ (bis 2,6 Felder).
- Migrationstest: der v1-Stand verliert genau `exit1` (geprüft), alles andere bleibt gleich.
- Speicherstand weiter v6. Tests 84.

## 0.16.6 – Legende neben der Karte
- Nutzer: Legende direkt neben oder unter die Karte statt eigenes Fenster. Kartenfenster ist breiter (`#modal-box[data-kind=map]`, `openModal` setzt `data-kind`), Legende rechts neben der Karte (`mapLegendHtml`, `paintLegend`), ab 11 Einträgen zweispaltig, auf schmalen Bildschirmen (< 520 px) unter der Karte. Weiterhin nur bereits gesehene Zeichen. Knopf „Legende“ und `openMapLegend` entfallen. Texte gekürzt. Headless ohne Scrollen geprüft (915×360, 915×330, 780×340; Nebelturm, Testgewölbe, Schratgruben).
- Tests 84, Speicherstand v6.

## 0.16.7 – Balance Nebelturm, Kampagnen-Simulation
- **sim.js Abschnitt C (neu, ersetzt das verlorene camp.mjs):** ganze Kampagne Testgewölbe → Untere Gruft → Moorpfad → Kultgruft → Schratgruben → Nebelturm mit der echten Logik: alle Gegner je Gebiet (Boss zuletzt), Truhen nach Wächter-Regel, Ausrüstung automatisch, Rast nach Bedarf (Proviant, sonst hungrig), Einkauf bei Hedda vor jedem Gebiet (bis 4 Heiltränke, 3 Proviant), Niederlage nach Spielregel und bis zu 3 Versuche. Annahmen stehen im Code über `campaign`. Nicht simuliert: Rückweg zum Rastplatz (neue Rast-Regel), Verkaufen, Fliehen. „klug“ trinkt Tränke jetzt nach der Regel aus 0.15.10 (nur der Held am Zug), verteidigt bei angesagtem Zauber, wirft Ölflaschen auf Bosse. Tabelle zeigt je Gegnergruppe: erreicht, Ø Stufe, Sieg im 1. Versuch, Runden, KO, Schaden.
- **Befund vor der Änderung (100 Läufe):** Ab der Unteren Gruft gewann auch „nur Angriff“ jeden Kampf im 1. Versuch; „klug“ verlor je Kampf meist unter 10 % der Gruppen-LP. Nebelhüter (280 LP, Angriff 15): beide Strategien 100 %. Deckt sich mit dem Gerätetest des Nutzers („zu leicht“, Gruppe Stufe 8–9). Die frühere Angabe „nur Angriff ca. 47 %“ (0.16.0) stammte aus einem Lauf ohne Testgewölbe-EP/Ausrüstung/Einkauf und ist überholt.
- **Neue Werte (alle vorläufig, nur simuliert):** Nebelgeist 62 LP / Angriff 16 / Vert. 3 / Init 9, Frosthauch 125 % (vorher 30/10/2/8, 115 %). Kultpriester 80 LP / Angriff 13 / Vert. 4, Dunkler Segen heilt 28 (vorher 40/8/3, 16). Neuer Gegner **Turmwache** (95 LP, Angriff 17, Vert. 8, Init 4, zielt auf die Hinterreihe, Schildstoß jeden 3. Zug 160 %, 100 EP, 18 Gold; Bild vorerst das des Kultwächters). Turmgruppen: en_t2 = Turmwache + Kultpriester (vorher Kultist + Kultpriester + Kultist), en_t3 = Turmwache + Kultpriester + Nebelgeist (vorher Kultwächter statt Turmwache). Nebelhüter 480 LP / Angriff 26 / Vert. 8 (vorher 280/15/5), Phasen Angriff 27 und 28, „Nebel sammeln“ heilt 28 (vorher 18).
- **Ergebnis (SIM.md, 600 Läufe):** Gruppe erreicht den Turm mit Ø Stufe 8, den Boss mit Ø Stufe 9. Turmgruppen „klug“: 100 % Siege, 14–28 % der Gruppen-LP Schaden je Kampf; „nur Angriff“: 63–100 % im 1. Versuch, bis 79 % Schaden. Nebelhüter „klug“: 78 % im 1. Versuch, Ø 11,6 Runden, 1,1 KO; „nur Angriff“: 0 %.
- **Offen / Warnung:** Es entsteht eine Schwierigkeitsstufe: Moorpfad, Kultgruft und Schratgruben sind laut Simulation weiterhin sehr leicht (Hauptmann und Grubenschrat: beide Strategien 100 % im 1. Versuch), der Turm ist jetzt deutlich härter. Vorschlag: die mittleren Gebiete in einer eigenen Version stufenweise anheben. Vom Nutzer noch nicht entschieden.
- **Alte Spielstände:** Gegnergruppen liegen im Spielstand. Wer den Turm schon betreten hat, behält die alten Gruppen (Werte der Arten gelten aber neu). Zum Testen: neues Debug-Werkzeug **„Dieses Gebiet zurücksetzen“** (Menü → Debug; `resetArea` in logic.js: Gegner, Truhen, Türen, Hebel wie neu, Boss-Auftritt wieder möglich, Karte bleibt).
- Tests 86. BALANCE.md und SIM.md neu erzeugt. Speicherstand v6.


## 0.16.8 – Türen und Tafeln (16.11.2026)
Nutzerwünsche (15.11.): Schilder nur an der Wand statt im Raum, Raumnamen über den Türen, offene Türen bleiben sichtbar. Entscheidung 3 (Nebelhüter-Schwierigkeit) vom Nutzer nach Test von 0.16.7 bestätigt: Kampf bis Runde 9, keine Tränke, keiner bewusstlos, „passend“ – Werte bleiben. Der Rest der Testliste 0.16.4–0.16.7 vom Nutzer als „passt“ gemeldet (Stufe im Kampf nur geschätzt, „muss nicht stimmen“).
- **Wandtafeln:** Jedes Schild hat `face` (0=N,1=O,2=S,3=W = Richtung vom Bodenfeld zur Wand) und hängt als Abziehbild an der Wand (`buildDecals`, `genPlaque`). Blockiert nicht mehr. Lesbar mit Blick zur Tafel vom Feld davor oder einem Feld dahinter (`wallSignAhead`), auch durch Gegenlaufen oder Antippen. Alle 14 Schilder neu platziert; Titel in `title` (`|` = Zeilenumbruch).
- **Türschilder:** Alle 8 Türen haben `title` (z. B. „KULT-|GRUFT“), sichtbar über geschlossener Tür (Abziehbild) und im Rahmen der offenen Tür.
- **Offene Tür:** bleibt als Rahmen mit aufgeklapptem Türblatt stehen (`genDoorFrame`).
- **Fund des Nutzers (16.11.):** Tore drehten sich beim Vorbeigehen um 90°, weil Sprites zur Kamera zeigen. Jetzt haben Türen, Treppen und Ausgänge eine `axis` (aus Nachbarwänden, `passAxis`); die Breite folgt dem Blickwinkel zur Durchgangsachse (min. 12 %).
- Abziehbilder werden gegenüber der Wandtextur gespiegelt gezeichnet (sonst Spiegelschrift auf allen vier Seiten). Hinweis: die Spiegelung der normalen Wandtexturen ist vermutlich auf allen Seiten umgekehrt, fällt aber bei Rauschtexturen nicht auf (Vermutung, nicht geprüft).
- Tests: 87 grün (Wandtafel-Lesbarkeit/Daten, Türtitel; zwei alte Tafel-Tests ersetzt). Optik headless geprüft; Gerätetest steht aus.
- Plan unverändert: 0.16.9 Figuren (Skelett, Hauptmann, Nebelhüter auf Thron, Turmwache), 0.16.10 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.9 – Ankunftsrichtung (16.11.2026)
Nutzerfund: Durch das Tor hinter Hedda (Moorrand → Moorpfad) stand die Gruppe mit Blick gegen die Wand. Neu: `arrivalDir` in `changeArea` – ist das Feld vor der Ankunft Wand, dreht die Gruppe zur Richtung mit dem längsten freien Weg (Moorpfad: Süden). Alle 12 Übergänge per Test geprüft (kein Blick gegen Wand). Alles andere wie 0.16.8; Gerätetest steht aus.
- Plan verschoben: 0.16.10 Figuren (Skelett, Hauptmann, Nebelhüter auf Thron, Turmwache), 0.16.11 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.10 – Gegner entdecken die Gruppe (16.11.2026)
Nutzerwunsch: Man darf nicht einfach an Monstern vorbeigehen. Entscheidungen des Nutzers: Auslöser = Gegner in Sichtlinie bis 2 Felder; keine Ausnahmen (auch Bosse/Wächter); Überfall = Gegner beginnen mit Angriff.
- `spottedEnemy` (logic.js): nach jedem Schritt und jeder Drehung löst der nächste lebende Gegner mit Chebyshev-Abstand ≤ `game.json → spot.range` (2) und freier Sichtlinie (Wand, geschlossene Tür, Geheimwand verdecken) den Kampf aus. Steht er nicht in Blickrichtung (gleiche Zeile/Spalte vor der Gruppe), ist es ein Überfall: `startCombat(..., {ambush:true})`, in Runde 1 haben die Gegner den ersten Zug (`buildOrder`). Meldung „… greifen aus dem Hinterhalt an!“.
- Kein Rückzug möglich (Flucht gibt es nicht): jede Bewegung/Drehung nahe an einem lebenden Gegner löst aus.
- Bekannt, nicht geändert: Ankunftsfelder liegen bei Boss Kultgruft (en_boss, Abstand 2 vom Ankunftsfeld aus Schratgruben) und Schratgruben-Boss (Abstand 2 vom Ankunftsfeld aus Nebelturm) nahe; relevant nur, wenn der Boss noch lebt.
- Balance (BALANCE.md/SIM.md) unverändert; ein Überfall verschlechtert die Lage der Gruppe, Einfluss nicht simuliert.
- Tests: 89 grün. Gerätetest steht aus. Plan: 0.16.11 Figuren, 0.16.12 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.11 – Schilder scharf und abwechslungsreich (16.11.2026)
Nutzerwunsch: Schilder zu unscharf; sollen in Farbe, Form, Größe, Schriftart und Schriftzug wechseln.
- Tafeln, Türschilder und Türrahmen werden in 192×192 (3× Grundtextur) ohne Weichzeichnen gemalt (`paintPlaque`, `genPlaque`, `genDoorFrame`).
- 9 Stile (`PLAQUE_STYLES` in render.js): wood, dark (Gold auf dunklem Holz), stone (Platte), iron (Nieten, goldene Schrift), moss (bemoost, Schrägschrift), arrow (Pfeilbrett), arch (Grabstein-Bogen), banner (Banner), small (kleine Tafel). Form, Material, Schriftfarbe, Schriftart (block, bold, wide, slant, shadow) und Größe folgen dem Stil und der Textlänge. Zuordnung per `style` an jedem Schild/jeder Tür in game.json; ohne Eintrag wählt `styleFor` einen festen Stil aus der Objekt-ID.
- Farben folgen der Gebietspalette (Nebelturm wirkt bläulich).
- Tests: 89 grün; Optik headless geprüft; Gerätetest steht aus.
- Plan: 0.16.12 Figuren, 0.16.13 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.12 – Neue Kampffiguren (16.11.2026)
Nutzerwunsch: Monster besser und gefährlicher aussehen lassen, auch die Skelette.
- Neu gezeichnet (128×128, `paintFigure` mit kontinuierlicher Abtastung, dunkler Umriss, leuchtende Augen): **Skelett** (Rosthelm, Rippen, Rostschwert, Rundschild), **Kultwächter** (Panzer, Hörner, Hellebarde), **Turmwache** (eigenes Bild: Turmschild, Speer, Kamm), **Hauptmann** (Umhang, Zweihänder, große Hörner, Siegel), **Sumpfwolf** und **Moorkultist** (beide hatten bisher das Ersatzbild des Moorschrats; jetzt eigene Bilder).
- Unverändert: Erzkäfer, Moorlicht, Nebelgeist, Kultpriester, Bosse Moorschrat/Grubenschrat/Nebelhüter. Nebelhüter auf dem Thron und Neuzeichnung des Hüters bleiben offen (Plan: 0.16.13).
- Farben folgen der Gebietspalette (Gruft grau, Gruben bräunlich, Turm bläulich).
- Test: jede Gegnerart hat ein Bild; Wolf/Kultist/Turmwache/Kultwächter/Hauptmann/Skelett teilen kein Bild. 90 Tests grün; Optik headless geprüft; Gerätetest steht aus.
- Plan: 0.16.13 Nebelhüter neu + Thron, 0.16.14 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.13 – Wolf neu, Blick zum Gegner (16.11.2026)
Nutzerfund (Gerät, Sumpfwolf): „kann mich nicht bewegen und nicht angreifen“; Wolf sieht albern aus, soll vierbeinig und hundeähnlich sein, schwarz mit grünen Moosflecken.
- **Angriff:** Das gemeldete „kann nicht angreifen“ ließ sich im Testbrowser NICHT nachstellen (Angriff per Klick und per Touch-Tipp, Überfall und normaler Start, mehrere Runden). Ursache nicht gesichert. Vermutung (nicht geprüft): Der Wolf stand seitlich außerhalb des Bildes und die Drehung ist im Kampf gesperrt. Maßnahmen: Die Gruppe wendet sich beim Kampfstart dem Gegner zu (`dirToward`, Achse mit größerem Abstand); die Sperrmeldung nennt jetzt die Kampfknöpfe (Angriff, Verteidigen, Gegenstand, Fähigkeit). Bitte beim nächsten Test genau notieren: welcher Knopf, welche Meldung, wessen Zug.
- **Sumpfwolf:** neues Bild im Profil auf vier Beinen, schwarzes Fell, grüne Moosflecken, gesträubter Rücken, gelbe Augen, gefletschte Zähne; im Bild 1,3× größer (`spriteScale`).
- Tests: 91 grün. Gerätetest steht aus.
- Plan: 0.16.14 Nebelhüter neu + Thron, 0.16.15 mittlere Gebiete schwerer, 0.17 Talente.

## Gerätetest 0.16.8–0.16.13 (Nutzer, Galaxy S25, 16.11.2026)
- Ablauf: Spielstand Slot 3 (Moorpfad) geladen, Testliste (31 Punkte) abgegangen, Screenshots aus der Kultgruft (Türschilder KAPELLE, HALLE; Schild „NUR MIT SIEGEL“; Kampf gewonnen, Stufe 5). Abschlussmeldung des Nutzers: **„Es passt alles“** (Gesamtaussage; Einzelpunkte wie Wolfkampf Nr. 13 und Boss-Rückweg Nr. 31 wurden nicht einzeln gemeldet).
- Das gemeldete „kann nicht angreifen“ (Sumpfwolf) trat im Test nicht mehr auf; die Ursache bleibt ungeklärt (nicht nachstellbar, 0.16.13 enthält Gegenmaßnahmen).
- **Nutzerwunsch (16.11.):** Schrift auf Türschildern/Tafeln lesbar, aber „geht noch schärfer“ (HALLE aus 3–4 Feldern Abstand schwer lesbar).
  - Befund und Umsetzung: siehe Abschnitt 0.16.14.
- Plan (Nutzer sagte „Bauen“): **0.16.14 Schilder schärfer** (gebaut), 0.16.15 Nebelhüter neu + Thron, 0.16.16 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.14 – Schilder schärfer (16.11.2026)
Nutzerwunsch: Schrift auf Türschildern „geht noch schärfer“ (HALLE aus 3–4 Feldern schwer lesbar, dünn und schräg wirkend).
- **Ursache (aus dem Code belegt, am Spielstand des Nutzers nicht geprüft):** Türen sind keine festen Objekte (`STATIC_TYPES`), `syncStatic` zog `title` und `style` nicht nach. Ein Spielstand aus der Zeit vor 0.16.11 hat Türen ohne `style`; `styleFor` wählt dann einen Zufallsstil aus der Objekt-ID (z. B. Schrägschrift „moss“ statt „dark“ für HALLE). Das passt zu den Bildern des Nutzers (HALLE dunkel und schräg, KAPELLE als Holztafel statt Steinplatte). Tafeln an Wänden waren nicht betroffen (feste Objekte). In einem frischen Spiel sah HALLE im Testbrowser schon scharf aus (gold auf dunklem Holz).
- **Fix 1 (`syncStatic`, logic.js):** zieht `title` und `style` aller nicht festen Objekte aus game.json nach (Türzustand, Truhen, Gegner unverändert). Ohne Speicherversionswechsel. Neuer Test mit alter Tür ohne Stil.
- **Fix 2 (render.js):** Strichstärke bei allen Schriftarten `max(1, s>>1)` (vorher nur bold/shadow-Verbreiterung nur bei bold); einzeilige Titel bis Faktor 4 (Tür und Wand), zweizeilige wie vorher; Tafelbreite darf 176 nicht überschreiten (Faktor wird sonst gesenkt). `plaqueMetrics` ist exportiert (Test). HALLE: Faktor 3 → 4.
- Nebenwirkung: Schriftarten „block“, „wide“, „slant“ und „bold“ unterscheiden sich in der Strichstärke nicht mehr (Form, Farbe, Material bleiben). Nicht gebaut: zweite, verkleinerte Fassung für große Abstände (erst prüfen, ob es nötig ist).
- Tests: 93 grün (2 neu). Optik headless vorher/nachher im Testbrowser verglichen (Kultgruft, Tür HALLE aus 4 Feldern). **Nicht auf Gerät getestet.**
- Plan: 0.16.15 Nebelhüter neu + Thron, 0.16.16 mittlere Gebiete schwerer, 0.17 Talente.

## Gerätetest 0.16.14 (Nutzer, Galaxy S25, 16.11.2026, Screenshots 23:30/23:31)
- Ergebnis „Schildertest“: Text der Meldung kam leer an (nur „Ergebnis Schildertest:“), nicht ausgewertet.
- Fund 1: „Türen immer noch falsch“. Screenshot Moorpfad-Eingang: der Steinbogen (`stairs_pfad_west`) stand als frontales Bild vor der Westwand statt in der Wand. Ursache (aus dem Code belegt): alle 13 Treppen/Ausgänge liegen vor genau einer Wand (oder in einer Ecke); `passAxis` liefert dort `null`, das Sprite hat keine Perspektive. Ob der Nutzer mit „Türen“ nur diesen Bogen oder auch echte Türen meint, ist **nicht gesichert** (echte Türen nicht erneut geprüft).
- Fund 2: „Bei Kampf immer noch nicht der Gegner zu sehen, war vorher besser“. Screenshot: Kampf mit zwei Moorlichtern, Blick gegen eine Wand, kein Gegner im Bild. Ursachen: `spot.range` 2 mit Chebyshev-Abstand (Gegner konnte schräg stehen, die Gruppe dreht sich nur zur größeren Achse) und `VIEW_BACK` 0,45 (Kamera wich im Kampf zurück).
- Nutzerwunsch: Kampfdistanz wieder 1 Feld.

## 0.16.15 – Kampfdistanz 1 Feld, Bögen in der Wand (16.11.2026)
- **Kampfdistanz:** `game.json → spot.range` 2 → 1; `spottedEnemy` misst jetzt in Schritten (|dx|+|dy|), also nur gerade Nachbarfelder, nie schräg. Damit steht der Gegner bei Kampfbeginn immer auf dem Nachbarfeld und die Gruppe blickt ihn an (`dirToward` exakt). Überfall bleibt (Gegner seitlich/hinten neben der Gruppe: Gegner beginnen). Hinweis: Wer an einem Gegner schräg vorbeigeht, löst erst auf dem geraden Nachbarfeld aus.
- **Kamera im Kampf:** `VIEW_BACK` 0,45 → 0 (Gegner genau 1 Feld entfernt wie vor 0.16.4); die Blickneigung (`view.horizon`) bleibt, damit Köpfe/Füße nach Möglichkeit sichtbar sind. Bosse unverändert. Bei sehr großen Figuren (Skelett) liegen die Füße teils hinter der Meldungsleiste (Headless-Bild), das ist der Preis der kürzeren Distanz.
- **Bögen/Treppen/Ausgänge in der Wand:** neue Funktion `passFaces` (render.js). Liegt ein `stairs`/`exit` an einer Wand (oder Ecke), wird sein Bild als Wand-Abziehbild auf die Wandfläche gelegt (richtige Perspektive, `buildDecals`), das Sprite entfällt. Zwei gegenüberliegende Wände (Durchgang) und frei stehende Felder behalten das Sprite mit Achse. Freistehend bleiben: `stairs_gruft_down` (Kultgruft), `exit_turm`. Ecken (`stairs_moor`, `stairs_down`, `stairs_gruben_up`): Bild auf beiden Wänden.
- Tests: 93 grün (Test „Entdeckt-werden“ auf 1 Feld umgeschrieben, Diagonale neu). Optik im Testbrowser (Desktop-Chrome headless) geprüft: Bogen Moorpfad, Kampf Moorlicht/Skelett. **Nicht auf Gerät getestet.** BALANCE.md/SIM.md unverändert (keine Werte geändert); der Einfluss der Distanz auf die Balance ist nicht simuliert.
- Plan: 0.16.16 Nebelhüter neu + Thron, 0.16.17 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.16 – Moorkultist und Moorlicht neu (16.11.2026)
Nutzer (Gerät, Screenshot 23:33, Kampf mit 2 Moorkultisten + Moorlicht): „Sehen doof aus. Viel detailreicher und gefährlicher.“ Zugleich sinngemäß: Zugriff im Projekt auch schreibend gestattet (Projektdateien werden von mir geschrieben; Schreibzugriff auf das GitHub-Repo ließ sich nicht herstellen, „GitHub-Konto verknüpfen“ fehlt – Upload bleibt beim Nutzer).
- **Moorkultist** (`genKultist`, jetzt 192 px, im Modus Scharf 384): Spitzkapuze, eingerollte Widderhörner, leere Gesichtshöhle mit schrägen leuchtenden Augen und finsteren Brauen, Maul mit unregelmäßigen Reißzähnen, Knochenzacken am Schulterkragen, erhobener Sägedolch mit glühendem Gift und Tropfen, linke Hand mit grüner Flamme und Krallen, Brustsiegel (offenes Auge), Gürtel mit Schnalle und Schädeln an Ketten, zerfetzter glimmender Saum mit Rissen.
- **Moorlicht** (`genWisp`, jetzt 128 px ohne Umriss, scharf 256): lodernde Flamme mit schreiendem Geistergesicht (Brauen, schwarze Augen mit Glutpupillen, Maul mit Zähnen), zwei wellige Greifarme mit Krallen, Schweif, Funken. Bild jetzt `sm2` statt `sm`.
- `paintFigure(seed, build, SN = 128, outline = true)`: Auflösung und Umriss wählbar.
- Bekannt/offen: Das Moorlicht wirkt im Testbild noch etwas wolkig (Flammenrand durch Rauschen); Feinschliff nach Gerätetest. Alle Kultisten teilen dasselbe Bild (Seed 311), keine Varianten. Kultpriester, Nebelgeist, Erzkäfer, Bosse unverändert.
- Tests 93 grün (Test „Kampffiguren“ um Größen erweitert). Optik im Testbrowser (Desktop-Chrome headless), **nicht auf Gerät getestet**. Keine Werte geändert, BALANCE.md/SIM.md unverändert.
- Plan: 0.16.17 Nebelhüter neu + Thron, 0.16.18 mittlere Gebiete schwerer, 0.17 Talente.

## 0.16.17 – Kampfbild und Bögen (16.11.2026)
Nutzerwünsche: „Beim Monsterkampf wieder wie bei der Truhe Blick leicht runter, damit die Monster ganz zu sehen sind“; „4 Bögen??“ (Eck-Treppen); „Monster nebeneinander, sonst verdecken sie sich“; „Moorlicht sieht gut aus“ (Gerätemeldung, keine weitere Politur nötig).
- main.js `viewTarget`: im Kampf Horizont zum Boden der Figuren geneigt plus `fit` (verkleinert nur zu große Figuren, min. 0,55, Boss mit n≤1 ausgenommen); render.js `setCombatFit`, wirkt in `buildSprites`.
- render.js `passFaces`: Treppen/Ausgänge in Ecken bekommen nur EIN Wandbild (Wand am Ende des längsten freien Gangs). Headless in test1 geprüft: eine Treppe = ein Bogen.
- render.js `groupOffsets`: auch im engen Gang stehen Gegner nebeneinander (Abstand 0,34), nicht mehr gestaffelt.
- Tests 93 grün (Node). Alles nur headless (Chrome/Playwright) gesehen, **nicht auf Gerät getestet**.
- Offene Gerätetests: Kampfbild bei Einzelgegner, Zweier-/Dreiergruppe im engen Gang und im Freien; Eck-Treppen in test1/Moorrand; ob echte Türen noch falsch wirken.
- Plan unverändert: Paket A Talente (0.17.0, Start auf „Bauen“), Paket B Nebelhüter + Thron, mittlere Gebiete schwerer, Balance; Paket C Moorfestung.
- Nachtrag 0.16.17 (Nutzer: „Undeutlich, besser wieder nur Schriftzug, Schilder unnötig“): Wandtafeln und Türschilder sind **abgeschafft**; `genPlaque` malt nur noch Schrift (helle Buchstaben, dunkle Kontur) direkt auf Wand bzw. Tür. `PLAQUE_STYLES`/`style` in game.json bleiben vorerst bestehen, werden aber nicht mehr gezeichnet. Headless gesehen, **nicht auf Gerät getestet**. Offen: Schrift am Bildrand wird bei Nahsicht angeschnitten (Perspektive, kein Fehler der Textur) – bei Störung melden.
- Bestätigt (Gerät): Moorkultist und Moorlicht sehen gut aus.

## 0.17.0 – Talente, Alchemist, Stufe 15, Schwierigkeit, Gebietsstärke, Thron (17.11.2026)
Nutzer: „Bauen. Erstmal möglichst viel bauen, dann teste ich einzeln; nicht jedes Mal eine neue Version zum Testen, sondern warten.“ Alles unten ist nur headless geprüft (Node 99 Tests, Chrome/Playwright), **nicht auf Gerät getestet**.
- **Stufe 15**: `progression.maxLevel` 15, EP-Schwellen bis 9200 kumulativ (…, 3200, 4000, 5000, 6200, 7600, 9200).
- **Talente** (`data.talents`): 6 Berufe × 3 Zweige × 4 Talente = 72. Kosten 1/1/2/2, das 4. Talent ab Stufe 8, Reihenfolge im Zweig. Punkte = Stufe − 1 − ausgegeben (nicht gespeichert, daher keine Speicher-Migration). `hero.tal = {id: true}`. Wirkungen `fx`: hp, mp, atk, def, init (Werte), crit/dodge/resist/gold/abil (Prozent), soak, heal, regen, backfull; `unlock` = neue Fähigkeit (4. Talent jedes Zweigs, 18 neue Zähler in `data.spells`, erscheinen im Zauber-Menü). Rechnen: `talentSum`, `heroAtk/Def/Init`, `refreshHeroStats` (LP/Ressource), `learnTalent`, `respecTalents` (kostet 20 Gold × Stufe), Krit ×1,5 in `calcDamage` (Würfel nur bei Krit-Talent, damit alte Läufe gleich bleiben), Ausweichen/Schadensminderung in `enemyStep`, Statusabwehr in `addStatus`, Gold-Bonus in `finishVictory`. Oberfläche: Charakterfenster → „Talente“ je Held (Tabs, drei Spalten, Tippen = lernen, Zurücksetzen).
- **Alchemist** (sechster Beruf, `potionGiver`): Hinterreihe, Fernkampf, Brandflasche; gibt als Einziger im Kampf Tränke/Gegengift an andere (Knopfzeilen je Held). Porträt, Ausrüstungslisten (Magier-Stäbe) ergänzt. Wirkt noch nicht in der Simulation (sim.js nutzt die Schnellgruppe).
- **Schwierigkeit** (`data.difficulty`, `state.difficulty`, Auswahl im Neues-Spiel-Fenster): Normal; Schwer = Gegner +30 % LP, +15 % Angriff, Beute +20 % Gold, +15 % EP. Feld optional → alte Stände = Normal.
- **Mittlere Gebiete schwerer** (`levels.<id>.foe` in Prozent): Moorpfad 125/115, Kultgruft 150/130, Schratgruben 175/145 (LP/Angriff), wirkt zusätzlich zur Schwierigkeit. SIM.md neu (3000 Läufe): „klug“ schafft die Kampagne weiter zu 100 %, „nur Angriff“ 0 %; Schaden je Kampf bei „klug“ ca. 5–30 %, Bosse 24–31 %.
- **Kampfbild**: auch Bosse werden jetzt ganz ins Bild gesetzt (Kopf war abgeschnitten). **Nebelhüter** sitzt vor einem Steinthron (Lehne mit Spitzbogen, Armlehnen, Stufen).
- Tests: 99 grün (neu: Talentdaten, Punkte/Reihenfolge/Stufensperre, Zurücksetzen, Ausweichen, Krit/Alchemist, Schwierigkeit). BALANCE.md und SIM.md neu erzeugt.
- Offen/nicht gebaut: Moorfestung (Akt 2), Aushangbrett/Taverne/Heldentausch/Reservehelden, Fallen, Siegel, Runen-Reisenetz, Alchemisten-Küche in der Siedlung. Die Simulation berücksichtigt Talente nicht (Spieler mit Talenten sind stärker als die Simulation zeigt).
- Offene Gerätetests 0.16.17 + 0.17.0 (Nutzer testet gesammelt): Kampfbild (Einzel, Gruppe, Boss), Eck-Treppen, Schriftzug statt Tafeln, Talente lernen/zurücksetzen, neue Fähigkeiten im Kampf, Alchemist (Neues Spiel → Eigene Gruppe) mit Trankgabe, Schwer-Start, Nebelhüter mit Thron.

## ChatGPT-Liste (42 Vorschläge, 17.11.2026) – Einordnung und Plan
Der Nutzer legte 42 Ergänzungsvorschläge vor. Abgleich mit dem Code: vorhanden waren angekündigte Angriffe, Elementschwächen, Bossphasen, Karte mit Notizen, Statusanzeige, Rechenweg, kompatible Spielstände; teilweise Gegner-KI (3 Zielmuster), Status, Geheimwand (1), Hebel/Gitter, Unikate/Qualitäten, Paletten, Rastregel; offen Kombinationen, Fallen, Druckplatten, Truhenarten, Sets, Talente außerhalb des Kampfes, Ereignisse.
Plan (Reihenfolge vom Assistenten vorgeschlagen; der Nutzer sagte ohne Antwort auf die Rückfragen „Weiter bauen“): 0.18.0 Status + Kombinationen + Fallen (gebaut) → 0.19 Druckplatten, bewegliche Steine, mehr Geheimtüren → 0.20 Truhenarten, Geheimräume, Talente außerhalb des Kampfes → 0.21 Ausrüstungseffekte, Sets, Gegnertaktik, Gruppensimulation mit Talenten → 0.22 Ereignisse, Geräusche, Begegnungen, Rast-Risiko → 0.23 ff. Moorfestung in Etappen.
Unbeantwortete Fragen an den Nutzer (bis zur Antwort gelten die Vorschläge des Assistenten): Rast-Überfall nur in tiefen Gebieten mit Vorwarnung; Zufallsereignisse mit seltenen Hinterhalten; Sets nur als feste Funde; Bildrate auf dem S25 unbekannt (keine Messung).

## 0.18.0 – Blutung/Fluch, Kombinationsangriffe, Fallen (17.11.2026)
Alles nur headless geprüft (Node 102 Tests, Chrome/Playwright), **nicht auf Gerät getestet**.
- **Status**: `bleed` (Blutung, Schaden am Zugende wie Gift) und `curse` (Verflucht, Verteidigung −30 %, `effDef`). Quellen: Sumpfwolf (Treffer 25 % Blutung), Turmwache (Treffer 30 % Fluch), Zornhieb/Meucheln (Blutung), Arkanes Geschoss (Fluch). Heilen: `cleanse` darf eine Liste sein (`cleanseList`, `canCleanse`); Heilende Hand nimmt Gift + Blutung, Große Heilung/Reinigendes Licht/Elixier zusätzlich Fluch.
- **Kombinationsangriffe** (`data.combos`, `comboFor`, `comboDone`): automatisch, wenn der Gegner einen passenden Status von einem ANDEREN Helden trägt (`status.by` = Heldenindex, wird in `addStatus` gemerkt). Zerschmettern (verlangsamt + Nahkampf, +50 %, verbraucht), Entzünden (Gift + Feuer, +50 %, verbraucht), Gnadenstoß (betäubt, +40 %), Offene Wunde (Blutung + Fernkampf, +35 %), Verdammnis (Fluch + Nahkampf, +30 %), Blöße (Schwäche + Nahkampf, +25 %). Nicht bei „Alle angreifen“. Anzeige: „✚ Kombi: Name (Angriff/Fähigkeit)“ am Gegner, Meldung im Protokoll, Liste in der Hilfe.
- **Fallen** (Objekt `trap`, `data.traps`): Speerfalle (Vorderreihe 25 % Max-LP), Giftnebel (alle 15 %), Runenfalle (alle 18 %, −3 Mana/Ausdauer); niemand fällt unter 1 LP. Entdecken: Wurf 35 % + Talent, wenn die Falle geradeaus liegt (1 Feld, mit Talent ≥ 40 zwei Felder, ein Wurf je Falle, `scanTraps` nach Schritt und Drehung); immer durch ◉ auf das Feld davor; sonst feine Spur am Boden und Warnschrift an der Wand. Entdeckte Falle: erster Schritt warnt nur, zweiter tritt hinein; ◉ entschärft (55 % + Talent, max. 95 %, Fehlschlag = halber Schaden). Talent-Wirkung `trap` bei Schurke (Gauner), Waldläufer (Fallensteller), Alchemist (Sprengmeister). Karte zeigt entdeckte Fallen („!“). Fünf Fallen mit Wandhinweis: Moorpfad (14,7), Kultgruft (16,6), Schratgruben (8,7) und (12,3), Nebelturm (6,12). Alte Spielstände bekommen sie über `syncStatic`.
- Dev-Haken `S.fn.renderCombat` ergänzt. Tests 102 (neu: Status, Kombinationen, Fallen). BALANCE.md und SIM.md neu (klug 100 %, nur Angriff 0 %).
- Offene Gerätetests zusätzlich: Blutung/Fluch sichtbar, Kombi-Hinweis und -Meldung, je eine Falle (übersehen, bemerken, untersuchen, entschärfen), Fallen auf der Karte.

## 0.19.0 – Druckplatten, bewegliche Steine, Geheimkammer (17.11.2026)
Nur headless geprüft (Node 103 Tests, Chrome/Playwright), **nicht auf Gerät getestet**.
- **Beweglicher Stein** (`boulder`): versperrt das Feld. Von vorn dagegenlaufen schiebt ihn ein Feld (`tryMove`), ◉ zieht ihn (`pullBoulder`: Gruppe geht einen Schritt zurück, Stein folgt) – dadurch keine Sackgassen. Nicht auf Treppen, Ausgänge, Truhen, andere Blocker. Rollt er auf eine Falle, löst sie ohne Schaden aus (zweiter Lösungsweg für Fallen).
- **Druckplatte** (`plate`, `gate`, `hold`): belastet durch Gruppe oder Stein (`updatePlates` nach jedem Schritt/Zug). `hold: true` = Ziel nur offen, solange belastet (niemand wird eingeklemmt: steht die Gruppe im Gitter, bleibt es offen); ohne `hold` rastet es ein. Ereignis `mech` in main.js (Meldung, Ton).
- **Schratgruben**: neuer Rätselraum südlich der Mittelhalle (Eingang (12,10), Raum x 10–14, y 11–13): Stein (12,12) auf Platte (14,13) schieben → Gitter (9,12) → Truhe (8,12). Hinweis „LAST HALT“ an der Wand.
- **Kultgruft**: Geheimkammer (x 2–5, y 1–2) hinter Geheimwand (5,3); lockerer Stein (6,4) in der Ostwand des Startraums öffnet sie; Hinweis „AUGE“ an der Nordwand; Truhe (2,1).
- `analyzeLevel` kennt Druckplatten (erreichbar = Ziel offen). Karte/Legende: Platte, belastete Platte, Stein. Hilfe-Abschnitt „Steine und Druckplatten“.
- Tests 103 (neu: Schieben, Ziehen, Platte/Gitter, Stein auf Falle, Geheimkammer, Lösbarkeit).
- Offene Gerätetests zusätzlich: Stein schieben/ziehen (Bedienung mit Daumen, Kamera beim Ziehen), Platte/Gitter, Geheimkammer finden.
- Nächster Schritt laut Plan: 0.20 Truhenarten, Geheimräume/falscher Schatz, Talente außerhalb des Kampfes.

## 0.19.1 – Heldenleiste (17.11.2026)
- Gerätefoto des Nutzers (0.19.0 installiert, ohne Text): in der Heldenleiste waren Namen abgeschnitten („Berenn · vo…“, „Odalys · hi…“) und die Werte brachen in eine dritte Zeile um. Behoben: „vorn/hinten“ steht klein unter dem Porträt, die Einheit entfällt (LP · Ressource; Mana blau, Ausdauer gelb), Wertezeile ohne Umbruch. Headless bei 780×360 gesehen, **nicht auf Gerät getestet**.
- Auf demselben Foto, NICHT geändert (unklar, ob es stört – nachgefragt): außerhalb des Kampfes verdecken sich die drei Gegner einer Gruppe im engen Gang; im Protokoll steht eine Rast, während Gegner sichtbar sind (ob die Rast an dieser Stelle stattfand, ist nicht belegt; `restThreat` prüft Sicht und 10 Pfadfelder). Geklärt 17.11.2026: Nutzer hat dort nicht gerastet (Meldung stammte von früher) – kein Fehler der Rastregel.

## 0.19.2 – Gegnergruppen (17.11.2026)
- Nutzer zum Gerätefoto von 0.19.0: „Gegner überschneiden sich und sehen in unterschiedliche Richtungen.“
- Sumpfwolf neu von vorn gezeichnet (`genWolf`: gesenkter Kopf, glühende Augen, Fänge, gesträubte Schultern, Moos), vorher Profil nach links. Alle Gegner blicken jetzt zur Gruppe.
- Gruppen kleiner je nach Größe (`GROUP_SIZE` 2: 0,72, 3: 0,6; Wolf ×1,25) und Abstände neu (`groupOffsets`: eng 0,38/0,31, offen 0,46/0,42). Headless im Moorpfad (Wolf–Moorlicht–Wolf) in Erkundung und Kampf ohne Überschneidung gesehen, **nicht auf Gerät getestet**. Risiko: Gruppen wirken kleiner (Nutzer fand Gruppen in 0.16.4 zu klein).
- Nutzerwunsch (17.11.2026): im Chat keine Codeblöcke mehr (z. B. Testlisten), nur auf Aufforderung; sonst Stichwortlisten.
- Gerätetests laufen über die abhakbare Seite „Eldermoor Testliste“ (Artifact https://claude.ai/artifact/XeP4NUhR6ckPcZZtTbyjYv, Quelle im Scratchpad testliste.html). Punkt antippen = ok (verschwindet), ✗ = Fehler mit Notiz. Ergebnisse stehen in der Artifact-Datenbank, Sammlung `results` (Dokument-ID = Testpunkt-ID, Felder s = ok|fail, note, t) und sind per ArtifactData lesbar. Neue Testpunkte: Seite mit neuen IDs neu veröffentlichen (gleiche URL); erledigte IDs bleiben erhalten.
- Nutzerwunsch (17.11.2026, grundsätzlich): Testfragen und Testanleitungen immer als Stichwortliste in sinnvoller Abarbeitungsreihenfolge, wenn möglich zum Abhaken (Kästchen), ohne Codeblock.

## 0.19.3 – Wölfe größer (17.11.2026)
- Nutzer (Gerätefoto 0.19.2, Testgewölbe, zwei Sumpfwölfe): „Wölfe etwas zu klein“. Wolf-Faktor 1,25 → 1,45, Zweiergruppen weiter auseinander (eng 0,48, offen 0,5), Rumpf des Wolfs etwas schmaler. Headless gesehen (Testgewölbe 2 Wölfe, Moorpfad Wolf–Moorlicht–Wolf), **nicht auf Gerät getestet**. Bestätigt durch das Foto: Wölfe blicken nach vorn, überschneiden sich nicht.
- Beobachtung auf demselben Foto (nicht geändert, Nutzer gefragt): Ivo (Magier, 18 LP) war in Runde 1 bewusstlos, bevor er handeln konnte. Ursache laut Daten: Sumpfwolf hat `ai: weakest` (greift den Helden mit den wenigsten LP an), zwei Wölfe × 9 Angriff. SIM.md: im Testgewölbe gegen zwei Wölfe im Schnitt 0,3 (klug) bis 0,9 (nur Angriff) Bewusstlose je Kampf.

## 0.19.4 – Truhen seltener und wertvoller (17.11.2026)
- Nutzer: „Anfänglich zu viele Truhen und teilweise zu hochwertige Schätze. Soll etwas Besonderes bleiben.“ Entscheidung delegiert, umgesetzt:
  - Starttruhe Testgewölbe: nur noch Schlüssel, 1 Heiltrank, 8 Gold, 1 Proviant, Eisenschwert, Lederrüstung (vorher zusätzlich Eichenstab, Kettenhemd, 2 Tränke, 12 Gold). Stab und Kettenhemd gibt es weiter beim Händler.
  - Untere Gruft: 1 Trank, 10 Gold, gewöhnliche Ausrüstung (Boost 0).
  - Truhen entfernt: Moorpfad `chest_p1`, `chest_p3`; Kultgruft `chest_g4`. Moorpfad 5 → 3, Kultgruft 5 → 4 Truhen.
  - Ausrüstung in Truhen schwächer: Moorpfad p4 Boost 1→0, p2 ohne Ausrüstung; Kultgruft g2 1→0, g3 2→1; Schratgruben s2 1→0; Nebelturm t2 2→1. Besondere Truhen (Geheimkammern, Rätsel, Bosse) bleiben stark.
  - Ausrüstung von gewöhnlichen Gegnern seltener (etwa halbiert): Wolf 8 %, Kultist 10 %, Moorlicht 5 %, Skelett 8 %, Kultwächter/Kultpriester/Turmwache 15 %, Nebelgeist 8 %.
- SIM.md neu: klug weiter 100 % Kampagne, Nebelhüter beim ersten Versuch 83 % (Gruppe schwächer ausgerüstet), nur Angriff 0 %. Tests 103.
- Alte Spielstände: entfernte Truhen bleiben dort vorhanden, falls schon im Spielstand (nicht geprüft, ob `syncStatic` sie entfernt).

## Gerätetest 0.17.0–0.19.4 (Nutzer, Galaxy S25, 17.11.2026, abhakbare Testliste)
- **ok (Einzelpunkte):** Ivo in Runde 1 bewusstlos = passt; Wölfe schauen nach vorn; Kampfbild; Heldenleiste; Treppen (1 Bogen); echte Türen; Starttruhe, wenige/bescheidene Truhen; Talente: Kosten/Reihenfolge; Hilfe lesbar; Moorpfad: Gruppe, Stärke, Schild „VORSICHT“, Falle laufen; Kultgruft: Hinweis + Geheimkammer; Schratgruben: Rätselraum, Stein schieben/ziehen, Platte, Halten; alter Spielstand: neue Fallen/Räume, geöffnete Truhen bleiben offen; Texte lesbar; Selbsttest grün.
- **Fehler gemeldet:** (1) Wölfe „noch etwas größer“ (Test lief nach „Neu laden 0.19.4“); (2) Schriftzug „zu leuchtend groß, eher dungeonmäßig mysteriös, evtl. blutig, unheimlich, atmosphärisch“; (3) Karte „besser bei Berührung zoombar“.
- **Noch nicht gemeldet (offen):** Talente öffnen/Stufensperre 4. Talent/Zurücksetzen/neue Fähigkeit/Stufe 15; Blutung/Fluch, Heilende Hand nimmt Blutung, Kombiangriff; Fallen ◉ untersuchen/entschärfen; Nebelhüter mit Thron; Schwer-Start; Alchemist (Gruppe, Trankgabe); alter Spielstand lädt; Bildrate.

## 0.19.5 – Wolf, Schriftzug, Kartenzoom (17.11.2026)
Nur headless geprüft (Node 103 Tests grün), **nicht auf Gerät getestet**.
- **Wolf:** Faktor 1,45 → 1,65 (`spriteScale`). Risiko: Überschneidung in Dreiergruppen (Wolf–Moorlicht–Wolf); bitte prüfen.
- **Schriftzug (`genPlaque`):** höchstens Faktor 3 (vorher 5/4), keine leuchtende Farbe mehr; verwitterte dunkelbraune Farbe (`wood` Stufe ~1,7–2,5, Palette hat kein Rot), 12 % Abplatzer, Laufspuren unter Buchstaben, Kontur 1 px. Ob „blutig“ ausreichend wirkt, ist offen (Rot bräuchte ein eigenes Palettenmaterial).
- **Karte:** zweifache Fingergeste = Zoom (1–8×), Ziehen = Verschieben, Mausrad am Desktop; Tippen auf Zelle = Notiz bleibt, nach Ziehen/Zoomen wird keine Notiz gesetzt (400 ms). Karte intern in dreifacher Auflösung (`cs` × 3), Größe wird per `fitMapView` eingepasst; Hülle `#mapvp`. Reine Anzeige, Spielstand unverändert.
- Testliste (Artifact) auf 0.19.5 aktualisiert; die drei Fehlerpunkte haben neue IDs (`tg-wolfsize5`, `tg-sign5`, `mp-map5`).
- Plan unverändert: 0.20 Truhenarten, Geheimräume/falscher Schatz, Talente außerhalb des Kampfes → 0.21 Ausrüstungseffekte, Sets, Gegnertaktik → 0.22 Ereignisse → 0.23 ff. Moorfestung. Nutzerwunsch 16.11.: größere Pakete statt Einzelkorrekturen; nicht für jeden Test eine neue Version.

## 0.19.6 – Meldungsfeld (17.11.2026)
Nutzer (Foto 0.19.5, Moorpfad-Eingang, drei Meldungen inkl. langem Text von Hedda): „Der viele Text versperrt den Blick auf den Gang.“ Nur headless geprüft (Node 103 Tests), **nicht auf Gerät getestet**.
- `renderLog` (main.js): außerhalb des Kampfes höchstens 2 Meldungen (vorher 3), je höchstens 2 Zeilen (`#log.calm`, CSS line-clamp), Ausblenden nach 3–6 s (3 s + 40 ms je Zeichen, max. 6 s; `S.logTs` = Zeitstempel). Im Kampf unverändert (letzte 2). `S.log` und Protokoll bleiben vollständig. Lange Texte (Hedda) stehen weiter im Händlerfenster/Toast.
- 0.19.5 war vom Nutzer als geladen bestätigt („V5 steht“); die Einzelpunkte der Testliste sind noch offen.
- **Nachtrag 0.19.6 (Nutzer, Foto Kampf Moorpfad: „Spielfläche kaum noch zu sehen“):** Kampfoberfläche kompakter, nur CSS: Gegnerfenster schmaler (30 %/250 px, Schrift .66, Zeilen 24 statt 30 px, Zugreihenfolge kleiner), Aktionsleiste niedriger (28 statt 36 px, Schrift .7), Meldungen im Kampf kleiner (.74, enger), Abstand im Stack 2 px. Zahl der Zeilen unverändert. Nicht auf Gerät getestet; Lesbarkeit der kleineren Schrift offen. Falls es noch zu voll ist: Zugreihenfolge ausblendbar oder Aktionsleiste in eine Zeile.

## 0.19.7 – Gegnergruppen im engen Gang (17.11.2026)
Nutzer (Foto 0.19.6, Moorkultist A+B und Moorlicht im 1 Feld breiten Gang): „Gegner in der Wand“. Ursache (aus dem Code belegt): `groupOffsets` setzte die Seitenfiguren bei 0,32 Seitenabstand, die Figur ist aber ~0,45 breit (Maßstab 0,6 × 76 %), sie ragte über die Gangbreite (±0,5) und wurde von den Wandspalten abgeschnitten. Fix in `buildSprites`: im engen Gang Seitenabstand auf `0,47 − 0,38 × Maßstab` begrenzt, äußere Figuren (bei 3 beide Außenfiguren, bei 2 die zweite) 0,3 Felder nach hinten gestaffelt. Offene Fläche unverändert. Nur headless geprüft (Tests 103), **nicht auf Gerät getestet**. Offen: Einzelner großer Wolf im engen Gang (Maßstab ~1,5) kann auch breiter als der Gang sein; nicht gemeldet. Überlappung der Figuren untereinander steigt dadurch leicht (Nutzerwunsch 0.16.17: nebeneinander).

## 0.19.8 – Schriftzug rot und lesbar (17.11.2026)
Nutzer (Foto 0.19.7 / „NUR MIT SIEGEL“ aus der Nähe): „Schrift nicht lesbar, Blutschrift“ – die dunkelbraune Schrift von 0.19.5 verschwand auf grauem Stein. Nur headless geprüft (Tests 103, Screenshot Kultgruft), **nicht auf Gerät getestet**.
- **Palette erweitert:** 9. Material `blood` (`MATS`, `M.blood = 8`, `PAL_N = 72`); Paletten in game.json brauchen keinen Eintrag (Standard `BLOOD_DEFAULT` 206/38/32). Schattentabelle (`shadeTbl`) und Palettenpuffer auf `PAL_N`. Tests: Palettenindex < 72, Farbanzahl ≤ 72 (vorher 64). **Die Doku „8 Materialien × 8 Stufen = 64 Farben“ oben gilt damit nicht mehr; jetzt 9 × 8 = 72.**
- `genPlaque`: Schrift in Blutrot (Stufe 5,4–7) mit dunkler Kontur (`ol = max(1, s>>1)`), 5 % Abplatzer, Laufspuren; Größe wie 0.19.5 (Faktor ≤ 3).
- Dev-Hook `S.fn.gotoArea(id)` (nur `?dev`) für Bildprüfungen.


## 0.19.9 (17.11.2026) – Fallen früher erkennbar
Nutzermeldung: „Ich erkenne Fallen erst nach Auslösung“; nur Wandschrift + 2× ◉ funktionierte. Ursachen (belegt am Code): Bodenspur `genTrap('faint')` war nur 1–2 Pixelreihen hoch; Entdeckung nur durch einen einzigen Wurf (35 % + Talent) und nur 1 Feld voraus (2 Felder erst mit Talent ≥ 40).
- `genTrap('faint')` (render.js): leicht eingesunkene graue Platte mit Rissen und Staub davor, ohne Ausrufezeichen (das gibt es erst bei „entdeckt“). Im Screenshot ab 2–3 Feldern gut sichtbar; direkt davor (1 Feld) verdeckt die Heldenleiste den Boden.
- `scanTraps` (logic.js): für alle Gruppen zwei unabhängige Würfe je Falle (2 Felder: `t.far`, 1 Feld: `t.checked`). `data.traps.spot` 35 → 45. Rechnerisch ohne Talent ca. 70 % Entdeckung vor dem Auslösen (1 − 0,55²), Vermutung über das Spielgefühl: Rest bleibt über Bodenspur und ◉ erkennbar.
- Tests 103 grün. Nur headless geprüft, **nicht auf Gerät getestet**. Offen: Bewertung auf dem S25, ob Platte und Chance passen.


## 0.19.10 (17.11.2026) – Helligkeit
Nutzermeldung (Screenshot Schratgruben-Gang, Rast-Meldung sichtbar): „Zu dunkel“. Unbekannt (nicht gesichert), welche Helligkeitsstufe in den Einstellungen gewählt war; bisheriger Standard war „Hell“ (1,35).
- Einstellung „Helligkeit der Umgebung“: Original 1 · Hell 1,35 · Sehr hell 1,8 · **Maximal 2,4 (neu)**. `render.js` `setPalette`: Mindeststufe `minS` 3 ab 2,4.
- Neuer Standard 1,8. Einstellungen-Version `SETTINGS_V = 3`: bestehende Einstellung unter 1,8 wird einmalig auf 1,8 angehoben (danach wieder frei wählbar).
- Headless-Vergleich Schratgruben bei 1,35 / 1,8 / 2,4: deutliche Stufen, Wände und Gegner in der Tiefe erkennbar. **Nicht auf Gerät getestet.** Offen: ob 1,8 reicht oder ob einzelne Gebiete (Palette `grube`, `keller`) selbst heller werden sollen.


## 0.19.11 (17.11.2026) – Ausrüsten, Siegel-Boss, Blutschrift
Nutzerwünsche (Screenshot Inventar): (1) beim Ausrüsten nicht erkennbar, welches Schwert gemeint ist; (2) nach dem Anlegen ließ sich der Gegenstand oben erneut ausrüsten; (3) „Kult-Siegel-Boss mit 501 HP“ gefährlicher; (4) Blutschrift gruseliger, keine Druckschrift; (5) rote Schrift werde beim Näherkommen gelblich. Antworten auf meine Rückfragen: nur Hervorhebung; Liste aktualisieren; Boss größer + Hörner/Dornen/zerrissene Robe + Siegelketten/Blutspuren + Schwert mit Siegelzeichen auf der Klinge; Schrift von Hand verschmiert, tropfend, bleibt rot.
- **Inventar** (`main.js`, `index.html`): gewählte Zeile `.row.sel` (goldener Rahmen); Überschrift „<Name [Qualität]> an wen?“ per `qTag`; nach `eq:` wird `S.invEquip = null` (Ursache: der zurückgelegte alte Gegenstand hatte dieselbe Basis, die Abfrage blieb offen).
- **Hauptmann** (`genGuard(…,'haupt')`, `render.js`): Glutaugen größer, Dornenkrone, dickere Hörner, Schulterdornen, gekreuzte Siegelketten, Siegelzeichen (Ring, Kreuz, Raute) auf der Klinge, zerfetzter Umhang mit Rissen, Blutspritzer (Material `blood`); `bossScale('hauptmann')` 1 → 1,3.
- **Blutschrift** (`genPlaque`): Buchstaben leicht gedreht/geschert/versetzt, Striche aus runden Pinselflecken, dicke Tropfen mit Kuppe, dunkle Gerinnsel, feuchte Lichter; gleiche Buchstabenraster.
- **Zuordnung (Vermutung):** „Siegel-Boss“ = Kultwächter-Hauptmann (`en_boss`, kultgruft, 160 LP, bei Schwer 208). Die Zahl 501 finde ich in den Daten nicht (Nebelhüter hat 480, bei Schwer 624): **nicht gesichert**, welchen Gegner der Nutzer meint.
- **Gelb beim Näherkommen:** im Headless-Test (Moorpfad „VORSICHT“, 1–4 Felder) bleibt der Text rot (Mittelwert ca. R125 G34 B33); das gelbe Bild dort ist die Fallenmarkierung. **Nicht nachgestellt**, Rückfrage an den Nutzer, welches Schild.
- Nur headless geprüft, **nicht auf Gerät getestet**. Tests 103 grün.


## 0.19.12 (17.11.2026) – Hauptmann: Schädel auf der Klinge
Nutzerantwort zu 0.19.11: „1 gepanzert bleiben; der Siegel auf der Klinge des Schwertes soll mit reinen Skelett frisiert sein“. Deutung (**Vermutung, nicht gesichert**): Hauptmann bleibt gepanzert, das Siegelzeichen auf der Klinge soll ein Skelett-Motiv sein.
- `genGuard` (haupt): statt Ring/Kreuz/Raute jetzt Totenschädel (Augenhöhlen, Nase, Kiefer mit Zähnen) und gekreuzte Knochen, Material `glow`. Rüstung unverändert.
- Offen: Augenfarbe (gelb) – Rückfrage „rot?“ blieb unbeantwortet, unverändert. Nur headless, **nicht auf Gerät getestet**. Tests 103 grün.


## 0.19.13 (17.11.2026) – Schwert, Boss-Größe, gelbe Schrift auf der Türschwelle
Nutzermeldung (Screenshot Kampf gegen den Hauptmann): Schwert unten zu groß; Totenkopf unten am Griff, in einem Kreis; Boss insgesamt zu groß; „Schrift ist bei betretenen Räumen rot, auf der Türschwelle wird sie gelb“.
- **Ursache Gelb (belegt am Code, im Screenshot bestätigt):** Der Türrahmen-Sprite (`genDoorFrame`, erscheint, wenn man im Durchgang steht) malte den Raumnamen per `paintPlaque` mit der Tafelfarbe (Stile `dark`/`iron`/`banner` = `glow`, also Gold). Die geschlossene Tür nutzt dagegen `genPlaque` (Blutrot). Jetzt: Goldschrift im Rahmen wird übermalt und `genPlaque(title,'door',style,133)` darübergelegt (gleiche Blutschrift, `PLQ` = 192 = Rahmenauflösung).
- **Hauptmann** (`genGuard` haupt): Klinge y 8–36 (vorher −1–49), Parierstange y 36,6 (Breite 9), Griff bis y 46; Siegelkreis (Ring, dunkle Füllung, Totenschädel mit Zähnen) am Knauf bei (50,5 / 51); keine gekreuzten Knochen mehr. `bossScale('hauptmann')` 1,3 → 1,12.
- Blutschrift: Drehung, Scherung, Versatz und Fleckengröße verringert (Lesbarkeit bei großen Türschriften).
- Nur headless geprüft (Screenshots Boss und Kapelle), **nicht auf Gerät getestet**. Tests 103 grün.


## 0.19.14 (17.11.2026) – blaue Augen des Hauptmanns
Nutzer: „Augen nicht gelb, da schon so viel anderes gelb ist“, danach (nach meinem Rot-Versuch) „Blaue Augen“.
- Palette erweitert: 10. Material `ice` (`MATS`, `M.ice = 9`, `PAL_N = 80`, Standard `ICE_DEFAULT` 96/176/255; Paletten in game.json brauchen keinen Eintrag). **Die Angaben „9 × 8 = 72 Farben“ (0.19.8) gelten nicht mehr; jetzt 10 × 8 = 80.** Tests: Palettenindex < 80, Farbanzahl ≤ 80.
- `genGuard` (haupt): Augen `['ice', 7]`. Andere Wächter unverändert (gelbe Augen). Siegelring und Schädelkreis bleiben golden.
- Nur headless geprüft, **nicht auf Gerät getestet**. Tests 103 grün.


## 0.19.15 (17.11.2026) – Schwert statt Eisenstange
Nutzer: „Schwert sieht aus wie eine Eisenstange“. Ursache: die Klinge war eine gerade Kapsel gleicher Breite.
- `genGuard` (haupt): Klinge y 3,6–36 mit Spitze (Verjüngung bis y 9,5), Breite 4,6, Hohlkehle in der Mitte, helle Schneide links, Schatten rechts; Parierstange mit nach unten gebogenen Enden; Griff mit Wicklung (abwechselnd hell/dunkel); Totenschädel im Siegelkreis am Knauf wie in 0.19.13.
- Nur headless geprüft (Screenshot), **nicht auf Gerät getestet**. Tests 103 grün.

## 0.19.16 (17.11.2026) – blaue Augen im Siegel-Schädel
Nutzer: „Siegel Totenkopf soll auch blaue Augen bekommen“. `genGuard` (haupt): Augenhöhlen des Schädels am Knauf jetzt Material `ice` (Radius 0,95 statt 0,7). Nur headless geprüft, **nicht auf Gerät getestet**. Tests 103 grün.

## 0.19.17 (17.11.2026) – Brustring entfernt
Nutzer: „Der runde Kreis in der Mitte weg“. Deutung (**Vermutung, nicht gesichert**): der goldene Siegelring auf der Brust des Hauptmanns (`genGuard` haupt, `hypot(dx, py-32)`). Der Siegelkreis mit Schädel am Knauf bleibt. Falls der Knauf-Kreis gemeint war: Rückmeldung. Nur headless (Screenshot), **nicht auf Gerät getestet**. Tests 103 grün.

## 0.19.18 (17.11.2026) – Truhen schöner, weniger Beute, Fallenspur dezenter
Nutzer: „Truhen optisch ansprechender, schärfer. Nicht zu viel Beute, zu viel zu wertvoll“; „Stein bei der Giftfalle jetzt zu deutlich“.
- **Grafik:** `genChest2` (render.js, 128 px, `sm2` → 256 px im Modus Scharf): gewölbter Deckel, Eisenbänder mit Nieten, Goldschloss mit Schlüsselloch, Eckbeschläge, Holzmaserung; offen: dunkle Öffnung, aufgeklappte Deckel-Innenseite. Alte `genChest` bleibt ungenutzt im Code.
- **Beute (game.json, nur Truhen):** Gold etwa halbiert, Heiltränke je Truhe meist 1 (Boss 2), Ausrüstung entfernt aus `chest_g2` und `chest_s2`, Boost in Geheim-/Rätsel-/Bosstruhen um 1 gesenkt (Turmtruhe `chest_t2` 0). Unverändert: Starttruhe `chest_a` (Test hängt daran), `chest_b`, Schlüssel- und Questgegenstände. Werte vom Assistenten gesetzt, nicht simuliert; BALANCE.md/SIM.md nicht neu erzeugt (Gegner- und Heldenwerte unverändert). Spieler haben dadurch weniger Gold/Tränke als die Simulation annimmt (Simulation kauft ohnehin bei Hedda ein).
- **Falle:** Bodenspur (`genTrap('faint')`) kleiner, kaum dunkler als der Boden, wenige feine Risse. Entdeckungswürfe unverändert (45 % je Wurf). Der Wunsch bezog sich laut Wortlaut auf die Giftfalle; die Spur ist bei allen Fallenarten gleich.
- Alte Spielstände: geöffnete oder bereits angelegte Truhen behalten ihren gespeicherten Inhalt (Beute liegt im Spielstand); die Kürzung wirkt nur für ungeöffnete Truhen in neuen Gebieten/Spielen (nicht geprüft, Vermutung aus dem Speicherformat).
- Nur headless geprüft (Screenshots geschlossene und offene Truhe), **nicht auf Gerät getestet**. Tests 103 grün.

## 0.19.19 (17.11.2026) – Hauptmann hält Schwert und Ring
Nutzerwunsch: Schwert deutlicher in den Händen, Ring drohend in der anderen Hand hochhalten, andere Farbe.
- render.js genGuard (haupt): Schwertfaust als dunkler Lederhandschuh mit hellen Fingergliedern, Daumen und Stulpe; zweiter Arm gereckt, darüber ein blauer Ring (`ice`) mit Stein.
- Deutung (Vermutung): „Ring“ = Siegelring in der erhobenen Hand, Farbe Blau passend zu den Augen. Der goldene Schädelkreis am Knauf blieb unverändert; falls er gemeint war, ändern/entfernen.
- VERSION 0.19.19 (main.js, sw.js). Tests 103 grün. Nur headless geprüft, nicht auf Gerät getestet.

## 0.19.20 (17.11.2026) – Turmwache und Kultpriester neu
Nutzer (Screenshot Nebelturm-Kampf, Turmwache + Kultpriester): „Beide gefährlicher und interessanter machen.“
- render.js: neue Funktionen `genTurmwache` (128 px) und `genPriester` (192 px, beide per `sm2` geglättet). Turmwache: Gitterhelm mit Flügeln und Kamm, Stachelschultern mit Lamellen, Brustpanzer mit Kreuz, Turmschild mit Rand/Nieten/Buckel/Dellen, Speer mit Wimpel, Umhang, Blutspritzer. Kultpriester: Spitzhaube mit drittem Auge, Goldsaum, Perlenkette, rote Stola mit goldenen Zeichen, schwebendes Zauberbuch, Schädelstab mit blauer Kugel, Räuchergefäß, zerrissener Saum mit Zeichen.
- Die Variante `'turm'` in `genGuard` und `'priester'` in `genRobed` bleiben im Code, werden aber nicht mehr verwendet.
- Keine Werte geändert (BALANCE.md/SIM.md unverändert). VERSION 0.19.20. Tests 103 grün. Nur headless geprüft, **nicht auf Gerät getestet**.

## 0.19.21 (17.11.2026) – Moos im Nebelturm
Nutzer (Screenshot Nebelturm-Wand, 23:28): „Sieht komisch aus. Wie schlecht gemachte Geheimtür.“
- Ursache (aus den Daten belegt): Palette `turm` hatte `moss` = [172,196,232], also fast weiß. Die zwölf Moos-Wandfelder (`m`) im Nebelturm erschienen als helle, fleckige Quadrate in der blauen Mauer. Dass genau diese Felder gemeint waren, ist aus dem Screenshot erschlossen (Vermutung, Position nicht belegt).
- Fix: `game.json → palettes.turm.moss` = [62,112,96] (dunkles, leicht bläuliches Grün). Nur Farbe; Wandtextur, Karte und Logik unverändert. Headless-Screenshot (Nebelturm, Moosfeld) zeigt dunkles Moos auf Stein. Palette wirkt auch auf Material `moss` in Sprites (Nebelturm), dort nur Farbänderung.
- VERSION 0.19.21, Tests 103 grün. Nur headless geprüft, **nicht auf Gerät getestet**.

## 0.19.23 (17.11.2026) – Knauf kleiner
- Nutzer: Goldener Schädelkreis am Schwertknauf des Hauptmanns bleibt, aber kleiner → in render.js auf Faktor 0,62 skaliert (Koordinatentransformation qx/qy).
- Die gemeldeten „501 LP“ waren laut Nutzer ein Irrtum, kein Fehler im Spiel.
- Tests 103 grün; headless, nicht auf Gerät getestet.

## 0.19.22 (17.11.2026) – Nebelhüter neu gezeichnet
- Anlass: Nutzer „Nebelhüter sieht nicht gefährlich genug aus. Zu sehr Strichmännchen“.
- render.js: neue `genHueter(seed)` (192 px, `sprites.hueter: sm2(genHueter(261))`): Eiszackenkrone, Kapuze mit Frostsaum, leuchtende Schrägaugen, Fangzähne, Stachelschultern, Brustriss mit Rippen und Siegel, Knochenklauen, Kristallstab, gezackter Mantelsaum, Dornenthron. Alte `genRobed 'hueter'`-Variante bleibt ungenutzt.
- Keine Wertänderungen, BALANCE.md/SIM.md unverändert. VERSION 0.19.22, Tests 103 grün. Nur headless geprüft, **nicht auf Gerät getestet**.
- Offen: Gerätetest (Wirkung im Kampf im Turmpalette-Look, Thron sichtbar, Boss im Bild).

## 0.19.24 (17.11.2026) – Moos ohne harte Kante
Nutzer (Screenshot Nebelturm, 23:41): „Abgeschnitten look“. Deutung (Vermutung): Moosfeld endete an der Zellgrenze mit gerader senkrechter Kante und anderem Steinmuster als die Nachbarwand.
- `genMoss` (render.js): Basis jetzt dieselbe Steinmauer wie normale Wände (`genStone(11)`, Fugen passen), Moosbewuchs läuft zu den Seitenkanten der Textur aus (smoothstep über 10 von 64 px). Gilt für alle Paletten mit Moos-Wand (Moorpfad, Kultgruft …).
- Tests 103 grün; headless gesehen, **nicht auf Gerät getestet**.

## 0.19.25 (17.11.2026) – Truhe: Farben und Form
Nutzer (Foto Nebelturm, Truhe vor Moosfeld): „Sieht komisch aus“; auf Rückfrage: Farben und Form/Größe der Truhe.
- Ursache Farben (belegt): Palette `turm` hat `wood` lila und `glow` eisblau, die Truhe nutzt diese Materialien (lila Holz, blaues Schloss).
- `game.json → palettes.turm.wood` = [128,88,56] (warmes Braun; wirkt auch auf andere Holzteile im Turm). `genChest2`: Schloss aus hellem Holzton (Messing) statt `glow`, in allen Paletten; Truhe vertikal um Faktor 1,35 gestaucht (niedriger, breiter), `CHEST_SCALE` 0,62 → 0,58.
- Tests 103 grün; Screenshots geschlossen und offen headless gesehen, **nicht auf Gerät getestet**. Offen: ob Größe/Form so passt (Nutzer hat nur „Form/Größe“ genannt, nicht ob zu groß oder zu hoch – Deutung nicht gesichert).

## 0.20.0 (18.11.2026) – Truhenarten, falscher Schatzraum, Talente außerhalb des Kampfes
Nutzer: „Restbestände später. Weiter bauen“ → Plan-Schritt 0.20. Nur headless geprüft (Node 104 Tests, Chrome/Playwright-Screenshots), **nicht auf Gerät getestet**.
- **Truhenarten** (Felder an der Truhe in game.json, gelesen wie `guard` aus den Spieldaten → alte Stände ohne Migration): `lock` (Schwierigkeit), `key`, `trap` (Fallenart), `mimic` (Gegnerart), `look: 'prunk'`. Regeln in `data.chests` (pick 40, trapSpot 30, mimicWarn 25). Logik: `chestCfg`, `pickChest`, `chestTrap`, `wakeMimic` (logic.js).
  - Schloss: Chance = 40 + Schlosstalent − Schwierigkeit (5–95 %). Ohne Talent braucht es einen **Dietrich** (neues Item, Art `tool`, 10 Gold bei Hedda), der beim Fehlversuch bricht. Mit Talent kein Dietrich nötig; Fehlschlag = Schloss klemmt bis zur nächsten Rast (`restParty` löscht `jammed`), mit Dietrich sofort neuer Versuch.
  - Falle an der Truhe: erster Griff = Wurf auf Bemerken (30 + Fallentalent). Bemerkt → ◉ entschärft (wie Bodenfallen, Fehlschlag halber Schaden); unbemerkt → löst aus, Truhe öffnet sich trotzdem.
  - Monstertruhe: verwandelt sich beim Öffnen in den Gegner (Objekt wird `type: 'enemy'`). Mit Fallen- oder Geheimtalent einmalig Warnung („atmet“), zweiter Griff weckt sie trotzdem.
  - Verteilt: Kultgruft `chest_g2` Schloss 15, Nebelturm `chest_t2` Schloss 35, Moorpfad `chest_p4` Speerfalle, Schratgruben `chest_s2` Giftnebel.
- **Neuer Gegner Truhenmaul** (`truhenmaul`: 60 LP, Angriff 12, Vert. 5, Init 7, Zuschnappen jeden 3. Zug 170 %, Blutung 30 %, Feuer +25 %, 45 Gold, 120 EP, sichere Ausrüstung Boost 1, Auftrittsbanner „Gier hat Zähne.“). In der Kultgruft wirkt der Gebietsfaktor (150/130 %). Sprite `genMimic` (Prunktruhe mit Kiefer, Zähnen, Zunge, roten Augen, Krallenbeinen); Prunktruhe `genChest2(…, prunk)` mit Goldbeschlägen und Rubinen.
- **Falscher Schatzraum** (Kultgruft, neu, Felder x 1–7, y 9–11): Tür `door_schatz` „SCHATZ-KAMMER“ im Südwand des Startraums (2,9); Prunktruhe = Truhenmaul (4,10); Wandschrift „GIER FRISST“ (1,10); lockerer Stein (1,11) öffnet Geheimwand (6,11); dahinter echte Truhe `chest_g_real` (7,10): 30 Gold, Heiltrank, Ausrüstung Boost 2.
- **Talente außerhalb des Kampfes** (neue Wirkungen, an bestehende Talente angehängt, Beschreibung ergänzt): `lock` – Tascheninhalt +30, Glückspilz +25, Scharfe Säure +25; `secret` – Scharfes Auge +35, Eisblick +25; `haggle` – Tascheninhalt 10, Reiche Vorräte 10 (Kauf −, Verkauf +, max. 30 %). `secret`: nach Schritt/Drehung ein Wurf je Geheimwand 1–2 Felder voraus (30 + Talent) → Meldung „kalter Luftzug“; ◉ an der Geheimwand nennt mit Talent Richtung und Abstand des Mechanismus (`secretHint`, `scanSecrets`). Es zählt der beste wache Held (`partySkill`).
- Hilfe: Abschnitte „Truhen“ und „Talente außerhalb des Kampfes“. BALANCE.md und SIM.md neu (Simulation öffnet Truhen per ◉; verschlossene ohne Dietrich bleiben zu, die Monstertruhe wird nicht bekämpft – Truhenmaul nicht simuliert).
- Offene Gerätetests: Schloss mit/ohne Dietrich, Klemmen + Rast, Truhenfalle bemerken/entschärfen/auslösen, Schatzraum (Truhenmaul, Kampfbild, Schalter, echte Truhe), Talent-Meldungen, Preise mit Feilschen, Talentbeschreibungen lesbar.

## 0.21.0 (18.11.2026) – Ausrüstungseffekte, Sets, Gegnertaktik, Simulation mit Talenten
Nutzer: „Mach direkt 21.0, ich teste danach alles zusammen.“ Nur headless geprüft (Node 105 Tests, Chrome/Playwright-Screenshots Charakterbogen und Kampf), **nicht auf Gerät getestet**.
- **Ausrüstungseffekte:** feste Gegenstände tragen `fx` (gleiche Schlüssel wie Talente) plus neu `lifesteal` (Prozent des Schadens als LP, Angriff/Fähigkeit/Alle) und `thorns` (Schaden zurück an den Angreifer, kann töten → Sieg). `fxSum = talentSum + gearFx` ersetzt talentSum bei crit, dodge, soak, resist, gold, abil, heal, regen. Erzeugte Beute hat keine Effekte. Unikate bekommen Effekte: Schratdorn Lebensraub 10, Wurzelstab Ressource +1, Siegelpanzer Dornen 3, Nebelmantel Ausweichen 8.
- **Sets** (`data.sets`, Qualität `set`, grün, nicht verkäuflich): „Moorwächter“ = Moorklinge (Angriff +3, Lebensraub 15) + Moorpanzer (Vert. +3, Dornen 2), Bonus Krit +10, Schaden −1; „Nebelweber“ = Nebelstab (Angriff +3, Fähigkeiten +10 %) + Nebelrobe (Vert. +2, Ressource +1), Bonus Heilung +6, Statusabwehr 25. Fundorte: Moorklinge = echte Truhe im falschen Schatzraum (Kultgruft), Nebelstab = Geheimkammer Kultgruft, Moorpanzer = Rätseltruhe Schratgruben (Platte), Nebelrobe = Geheimkammer Nebelturm. Truhen mit `lootV: 2`: `syncStatic` ersetzt die Beute in UNGEÖFFNETEN Truhen alter Stände (geöffnete bleiben).
- **Gegnertaktik:** `guard` (Kultwächter, Turmwache) deckt Verbündete (−25 % Schaden durch Helden, Anzeige „🛡 gedeckt“); `enrage` (Sumpfwolf, Erzkäfer) +25 % Angriff, wenn ein Verbündeter fällt (einmalig, „🔥 Raserei“); `ai: 'healer'` (Moorkultist, vorher `backline`) zielt zu 60 % auf Helden mit Heilerberuf. Bestiarium zeigt Wache/Raserei nach dem ersten Auftreten. BALANCE.md führt Effekte, Sets und Taktik.
- **Charakterbogen:** Effekte unter jedem Gegenstand, aktives Set in Grün. Hilfe: Abschnitte „Gegnertaktik“ und „Ausrüstungseffekte und Sets“.
- **Simulation:** „klug“ lernt in der Kampagne jetzt Talente (nach jedem Kampf, Zweige der Reihe nach) und greift Wachen zuerst an. Ergebnis (SIM.md, 600 Läufe): klug 100 %, Ø Stufe 9,8, Nebelhüter im 1. Versuch 100 % (vorher ohne Talente 83 %), Schaden 37 % (vorher 99 %). **Befund (nicht geändert):** Mit Talenten wird das Spiel laut Simulation deutlich leichter; der Nutzer hatte den Nebelhüter (0.16.7, noch ohne Talente) als „passend“ bestätigt. Gegenwerte anheben ist eine offene Entscheidung des Nutzers.
- **Gruppenauswertung (Auftrag des Nutzers 18.11.2026, Skript im Scratchpad, nicht im Repo):** Alle 126 Berufskombinationen (Mensch, ohne Talente, Strategie „klug“, Kampagne bis Nebelhüter) – stärkste: 3 Krieger + Waldläufer, dann 2 Krieger + Magier + Waldläufer; Schnellgruppe (Krieger, Schurke, Kleriker, Magier) Rang 37 von 126; Gruppen mit 3–4 Klerikern oder Alchemisten scheitern. Rassen wirken kaum (Unterschiede im Rauschen). Grenzen: feste Strategie, Simulation ohne Talente und ohne Ausrüstungseffekte, Kleriker wird von der Strategie nur zum Heilen genutzt.

## 0.21.1 (18.11.2026) – Talente nachgeschärft, Gegner schwerer (mit Talenten kalibriert)
Nutzer: „Ja schwerer und/oder welchen Optimierungsbedarf siehst du bei den Talenten“. Nur Simulation/Node, **nicht auf Gerät getestet**. Tests 105 grün.
- **Talentanalyse (Simulation, je Held ein Zweig zuerst, 150 Läufe):** Die Zweige unterscheiden sich kaum (Boss-Schaden 31–44 %); schwächster Zweig Arkanist (Magier), Erste-Stufe-Talente „+1 Angriff“ kaum spürbar. Befund (Einschätzung, nicht gemessen): Talente wirken als viele kleine Zahlen; echte Entscheidungen entstehen erst mit dem 4. Talent.
- **Änderungen:** Wut, Scharfe Klinge, Streitkolben +1 → +2 Angriff; Kalte Hände +5 % Zauberschaden; Fluss +2 statt +1 Mana; Tiefe Quelle zusätzlich +10 % Zauberschaden; Arkanes Geschoss kostet 7 statt 8.
- **Simulation:** beide Strategien lernen jetzt Talente (jeder Spieler verteilt Punkte).
- **Gebietsfaktoren (LP/Angriff in %):** Kultgruft 150/130 → 200/160, Schratgruben 175/145 → 245/195, Nebelturm neu 155/140 (Moorpfad unverändert 125/115). Wirkt zusätzlich zu „Schwer“.
- **Ergebnis (SIM.md, 600 Läufe):** klug 100 % Kampagne; Hauptmann 100 % im 1. Versuch, 38 % Schaden; Grubenschrat 100 %, 28 %; Nebelhüter 91 % im 1. Versuch, 93 % Schaden (Zielbild: wie der vom Nutzer als „passend“ bestätigte Stand 0.16.7: 78–83 %, 99 %). Nur Angriff 0 % (scheitert ab Kultgruft-Boss häufig).
- **Offen:** Talentzweige deutlicher unterscheiden (z. B. ein spürbarer Sondereffekt je Zweig auf Stufe 3) – Vorschlag, nicht gebaut. Illusionswände: Nutzerfrage 18.11.2026, siehe Antwort im Chat (Vorschlag: nur für optionale Geheimnisse, Hinweis per Talent/Inschrift).

## 0.22.0 (18.11.2026) – Talent-Sondereffekte und Illusionswände
Nutzer: „Vorschlag umsetzen. Überlegungen zu magischen Wänden umsetzen.“ Nur headless geprüft (Node 107 Tests, Screenshots), **nicht auf Gerät getestet**. Der frühere Plan-Schritt „0.22 Ereignisse“ rückt nach hinten.
- **★-Sondereffekte** (3. Talent jedes Zweigs, Feld `sig: true`, Beschreibung mit „★“; neue fx-Schlüssel): Krieger – Wächter (`taunt` 50: Gegner greifen zu 50 % ihn an), Blutdurst (`lifesteal` 10), Kampfruf (`aura_atk` 1: ganze Gruppe +1 Angriff, max. 3); Schurke – Erster Stich (`firstcrit`: erster Angriff im Kampf kritisch), Wachsam (`noambush`: kein Überfall), Plündern (`loot_potion` 25); Kleriker – Nachsorge (`postheal` 10: nach Sieg alle +10 % LP, max. 25), Schutzschild (`aura_soak` 1, max. 2), Heiliger Zorn (`burnhit` 25); Magier – Zündfunke (`fireburn`: Feuerzauber brennen immer), Frostpanzer (`frostbite` 30: Angreifer verlangsamt), Manaschild (`manashield` 30); Waldläufer – Schwachstelle (`pierce` 50: halbe Rüstung), Fangnetz (`opener`: ein Gegner zu Kampfbeginn verlangsamt), Kräuterkunde (`immune_poison`: Gruppe giftimmun); Alchemist – Ätzend (`dotplus` 2), Kräftige Tränke (`potionplus` 50), Kettenreaktion (`chain` 6). Gruppenwirkungen über `partyFx`. Kampfbeginn-Meldungen über `combat.startMsgs`.
- **Illusionswände** (Objekt `illusion` auf Bodenzelle): gezeichnet wie die benachbarte Mauer, begehbar; Sicht, Gegner-Entdeckung und Rast-Sicht enden daran; Karte zeigt Mauer, bis man hindurchgeht (`found`, danach dauerhaft offen, Meldung). Hinweise: Inschrift in der Nähe (Test erzwingt ≤ 4 Felder), ◉ davor („seltsam unscharf“), Talent „Geheimwände spüren“ meldet Flimmern. Nie auf dem Hauptweg (Test: Level bleibt mit Mauer statt Illusion lösbar). Gebaut: Kultgruft (16,2) → Truhe `chest_g_ill`, Hinweis „NICHT ALLES“; Schratgruben (30,11) → `chest_s_ill` (Boost 2), „FELS LÜGT“; Schratgruben (7,1) → `chest_s_ill2`, „HOHL“.
- Hilfe: Abschnitte „Illusionswände“ und „Talent-Sondereffekte (★)“.
- SIM.md neu: klug 100 %, Nebelhüter 87 % im 1. Versuch (Schadenssumme 109 % inkl. Heilung), Balance damit wie 0.21.1. BALANCE.md neu.
- **Dungeongröße (Nutzerfrage):** Die bisherigen Gebiete bleiben klein (größtes: Schratgruben 35×15). Größere Ebenen (doppelte bis dreifache Fläche) kommen mit der Moorfestung (Akt 2) ab 0.23 laut Plan.

## 0.22.1 (18.11.2026) – Rückmeldungen vom Gerät (Inventar, Kampfleiste, Fallen, Schrift, Gegnergröße)
Nutzer-Screenshots 17:22–17:26. Nur headless geprüft (Node 107 Tests, Screenshots), **nicht auf Gerät getestet**.
- **„● neu“ im Inventar** (Wunsch): `state.newItems` (optional, keine Migration), gesetzt bei Truhe, Beute, Kauf, Plündern (`markNew`); neue Gegenstände stehen oben mit gelbem „● neu“, Inventar-Knopf trägt einen gelben Punkt; Schließen des Inventars löscht die Markierung.
- **Kampfleiste** (Fund: „Moorschrat ist betäubt und setzt aus“ war nur im Protokoll zu sehen, weil Brandschaden und „X ist am Zug“ die zwei Zeilen füllten): Während des Kampfs steht ein ganzer Zug als EINE Zeile (bis 3 Zeilen hoch), das Protokoll bleibt einzeln. Headless nachgestellt und behoben.
- **Fallenbild je Art** (Fund: „Stahlspeere statt wie angekündigt Gift“): Ausgelöste Fallen zeigten immer Speere, auch beim Giftnebel (Schratgruben 12,3 hinter „GIFT“). Jetzt Giftnebel = grüne Schwaden, Runenfalle = leuchtender Runenkreis, Speerfalle wie bisher. Die Falle selbst war richtig (Giftnebel), nur das Bild falsch (Vermutung zum Spielgeschehen: der Nutzer sah das Bild; der Text war „Grüner Nebel“).
- **Schriftzüge:** ruhigere Blutschrift (weniger Drehung/Versatz, gleichmäßigere Striche, seltener Abplatzer/Gerinnsel, kürzere Tropfen, nie in die nächste Zeile) – Fund „aus der Nähe zu undeutlich“; Türsturz der offenen Tür schneidet Schrift und Tropfen an der Unterkante ab – Fund „Schrift verläuft ins Leere“ (KAPELLE). Wandtafeln lassen sich jetzt auch schräg antippen (sobald ihre Vorderseite sichtbar ist) und mit ◉ vom eigenen Feld aus lesen.
- **Gegnergröße** (Fund: im 1-Feld-Gang werden Gruppen klein, beim Tod eines Gegners größer): Alle Figuren haben jetzt dieselbe Größe wie Einzelgegner. Offene Fläche: nebeneinander (Abstand 0,62 / 0,56). Enger Gang: zwei vorn versetzt, die dritte dahinter; leichte Vergrößerung der hinteren gleicht die Perspektive aus. `GROUP_SIZE` ist ungenutzt.
- Beobachtung (nicht geändert): Im Inventar-Screenshot standen viele gleiche „Eichenstab [Gut]“ einzeln. Erzeugte Beute stapelt nicht (jedes Stück eigene Kennung). Zusammenfassen gleicher Stücke wäre möglich.

## 0.22.2 (18.11.2026) – Beute stapeln, gute Beute seltener
Nutzer: „Stapeln und zu viel gute Beute. Besondere Ausrüstung sollte Ausnahme sein.“ Nur headless geprüft (107 Tests, Screenshot Inventar), **nicht auf Gerät getestet**.
- **Stapeln (nur Anzeige):** Inventar und Verkaufsliste fassen gleiche erzeugte Stücke (gleicher Name, Qualität, Werte, Berufe) zu einer Zeile „× n“ zusammen (`stackedInv` in main.js); Ausrüsten/Verkaufen nimmt das erste Stück. Spielstand unverändert (jedes Stück behält seine Kennung).
- **Qualität:** Gewichte Gewöhnlich/Gut/Selten/Episch 55/28/14/3 → 74/19/6/1.
- **Gegnerbeute halbiert:** Wolf 4 %, Kultist 5 %, Moorlicht 3 %, Skelett 4 %, Nebelgeist 4 %, Kultwächter/Kultpriester/Turmwache 8 %. Bosse: Boost 2 → 1 (Moorschrat, Hauptmann, Grubenschrat), Nebelhüter 3 → 2. Truhen: Illusionstruhe Schratgruben und Thronsaal-Truhe Boost 2 → 1.
- SIM.md/BALANCE.md neu: klug 100 %, Nebelhüter 87 % im 1. Versuch (unverändert gegenüber 0.22.1).

## 0.23.0 (18.11.2026) – Moorfestung: Vorburg, Teleporter, Riegeltüren, Gegner-Feuerzauber, Wandschmuck
Nutzerwünsche (EOB2-Vorbild, Screenshots): große Dungeons mit verschiedenen Rätseln und Monstern, Einbahntüren als Abkürzung zurück, Teleportfelder (sichtbar, per Inschrift angedeutet oder unbemerkt – nur an Umgebung und Kompass erkennbar), Gegner zaubern (Feuerball u. a.), gelegentlich Wandnischen und Gemälde/Graffiti. Nur headless geprüft (Node 108 Tests, Screenshots), **nicht auf Gerät getestet**.
- **Teleportfeld** (`teleport`: `to {x, y, dir?}`, `look: visible|hidden`, `open` = erloschen): sichtbar = leuchtender Wirbel am Boden + Meldung/Ton; versteckt = kein Bild, keine Meldung, nur neuer Ort und ggf. neue Blickrichtung (Kompass). Ein Hebel (`lever.gate` = Teleporter-ID) löscht ihn. Karte: sichtbare immer, versteckte erst nach Benutzung. `analyzeLevel` folgt Teleportern. Nur innerhalb eines Gebiets.
- **Riegeltür** (`door.locked` + `bolt` = Richtung zur Riegelseite): nur von der Riegelseite zu öffnen, danach dauerhaft offen (Abkürzung zurück). Von der anderen Seite: „von der anderen Seite verriegelt“. `analyzeLevel` berücksichtigt sie.
- **Neue Ebene `festung1` „Moorfestung – Vorburg“** (36×22, Palette `festung`, Gebietsfaktor 250/200 % – Simulation: Kämpfe 9–59 % Schaden, „klug“ 100 %): Eingangshalle → Hof (Säulen, Gemälde) → Kaserne (zwei Räume, Gasfalle vor der Riegeltür zurück zur Eingangshalle, Nische mit Trank/Gegengift) → Nordgalerie (sichtbarer Teleporter wirft in den Hof zurück; Inschrift „WER EILT KEHRT UM“, loser Stein in der Nische davor löscht ihn) → Schlüsselkammer (Festungsschlüssel) → Nische „KALTER ZUG“ im Hof = versteckter Teleporter in den Ostflügel (Blick danach nach Westen) → Ostflügel (Riegeltür zurück in den Hof) → Kellertür (Schlüssel) → Ausgang „Keller“ (Platzhalter für die Kellerebenen). Nebelturm: Ausgang durch Treppe zur Vorburg ersetzt (`stairs_turm_festung`).
- **Gegnerzauber mit Element:** `cast.element` (Meldung „Feuerschaden“/„Eisschaden“); Frosthauch (Nebelgeist) ist jetzt Eis. Neuer Gegner **Brandmagier** (70 LP, Angriff 17, Feuer +50 %, Eis −25 %): Feuerpfeil (jeder 2. Zug, Brennen 40 %), **Feuerball** (alle Helden, angesagt, jeder 4. Zug, Brennen 50 %). Bild vorläufig: alte Robenfigur (`genRobed 'priester'`), eigenes Bild offen.
- **Wandschmuck (selten):** `niche` (Wandnische, ◉ mit Blick zur Wand: Beute einmal, danach leer; Zustand im Spielstand), `sign.deco` = `painting` | `graffiti` (Bild statt Schrift, Text per Antippen/◉). Gesetzt: Nische Kaserne, Gemälde Vorburg-Hof und Nebelturm, Kritzelei Kultgruft.
- Testsuite: Fehlerzählung erst am Ende (vorher zählten spätere Tests nicht in die Summe; Fehler wurden aber angezeigt).
- **Nächster Nutzerwunsch (17:50, noch nicht gebaut):** Begegnungen mit Personen/Kreaturen, die etwas erzählen (Hinweise zur Aufgabe, Drohungen, Zwischenquests), mit Auswahl wie EOB2 (Nachfragen / Angreifen / Gehen). Plan: 0.24 Begegnungs-Dialoge (Porträt groß, Text, Antwortknöpfe, Folgen: Hinweis, Gegenstand, Kampf, Auftrag), erste Begegnungen in der Vorburg.

## 0.23.1 (18.11.2026) – Vollbild: Hinweise sofort ausblenden
Nutzer: „Beim Wechsel auf Vollbild die Dauer der darauf folgenden Informationen drastisch kürzen. Verdeckt sonst Bereiche.“ Nicht nachgestellt (Vollbild headless nicht prüfbar); welche Information gemeint ist, ist **nicht gesichert**.
- Einstellungen → „Vollbild“ schließt jetzt das Fenster; bei jedem Wechsel in/aus dem Vollbild (`fullscreenchange`) werden Meldungsleiste, Hinweis-Toast und Auftrittsbanner sofort ausgeblendet (`calmScreen`). Das Protokoll bleibt vollständig.
- Grenze: Den Hinweis von Chrome selbst („Zum Beenden … wischen“) kann die Seite nicht verkürzen.
- Tests 108 grün; nicht auf Gerät getestet.

## 0.23.2 (18.11.2026) – Talentpunkt-Anzeige, Vollbild beim Start
Nutzer: gelber Inventar-Punkt „gut sichtbar“ (bestätigt auf dem Gerät); Wunsch: gleiches für freie Talentpunkte (lila); „Spiel grundsätzlich im Vollbildmodus starten“. Nur headless geprüft, **nicht auf Gerät getestet**.
- **Lila Punkt** am Charakter-Knopf, solange ein Held freie Talentpunkte hat (`updateTalBadge`); im Charakterbogen „Talente ● n frei“. Beide Punkte werden zusätzlich alle 0,7 s aktualisiert.
- **Vollbild beim Start:** neue Einstellung „Beim Start Vollbild“ (Standard an, `autoFs`). Browser erlauben Vollbild nur nach einem Tipp: es wird beim ersten Tipp im Titelbild (Neues Spiel, Fortsetzen …) und bei jedem Tipp im Spiel angefordert, falls nicht schon aktiv. Als installierte App ohnehin Vollbild (manifest). Headless nicht prüfbar (Vermutung: Chrome auf Android erlaubt es nach dem Tipp).

## 0.23.3 (18.11.2026) – Kampfbild: Gegner frei, Lebensbalken über den Gegnern
Nutzer (Screenshots): „Kasten oben links verdeckt Gegner“, dann „Gegner teilweise hinter Wand. Anders lösen.“ Nachgestellt headless (Kultgruft-Dreiergruppe, enger Gang test1). Nur headless geprüft, **nicht auf Gerät getestet**.
- **Gegner im laufenden Kampf werden nicht mehr von Wänden verdeckt** (Sprite-Flag `front`, render.js überspringt dafür den Tiefenpuffer). Seitlich stehende Gegner im engen Gang ragen jetzt sichtbar über die Seitenwand statt in ihr zu verschwinden. Außerhalb des Kampfs bleibt alles wie bisher.
- **Gegnerkasten entfällt.** Statt dessen über jedem Gegner ein schmaler Lebensbalken mit Buchstabe (A/B/C) und Symbolen (Status, ⚠ schwerer Schlag, 🛡 gedeckt, 🔥 Raserei, ✚ Kombi). Ziel = goldener Rahmen am Balken. Balken oder Gegner antippen wählt das Ziel. Lage kommt aus dem Raycaster (`s.scr`, oberste deckende Zeile des Bildes `tex.opTop`), main.js `placeFoeTags` jedes Bild.
- **Zugreihenfolge** als einzeilige Leiste oben mittig („Runde n“ + Namen, aktiver golden). „Gegner antippen = Ziel“ nur noch in Runde 1. Warnung vor großem Gegnerzauber bleibt darüber.
- LP als Zahl: nicht mehr im Kampfbild (Bestiarium). Falls vermisst: Rückmeldung.
- Tests 109 grün (neu: Kampfbild 0.23.3, pointer-events der Balken).

## 0.23.4 (18.11.2026) – Fehlerpaket aus dem Gerätetest (nicht auf Gerät getestet)
| Meldung des Nutzers | Befund | Änderung |
|---|---|---|
| Dietrich kostet 9 statt 10 Gold | Code belegt: Feilschtalent (Schurke „Tascheninhalt“, Alchemist) gibt −10 % → ceil(10·0,9) = 9. Ob das in der Gruppe des Nutzers die Ursache ist, nicht gesichert | Laden zeigt „Feilschen (Talent): Preise −X %, Verkauf +X %“; Test für 10 und 9 Gold |
| Rote Schrift aus der Nähe zu groß | Headless-Screenshot bestätigt: Textblock bis ca. 75 % der Wandbreite | `genPlaque`: Maßstab 1,7–2,3 (Block höchstens ca. 50 %), weniger Tropfen; Stil bleibt |
| Kombi-Anzeige fehlte | Ursache belegt: Stil `.combo` galt nur für die seit 0.23.3 entfernten Gegnerzeilen, der Text wurde nicht mehr ausgegeben | Text „✚ Kombi: Name (Angriff/Zauber)“ unter der Zugleiste für das gewählte Ziel; Symbol am Gegner „✚ Kombi“ |
| Fallenspur nicht erkennbar | Screenshot: Spur sehr schwach, bei 1 Feld Abstand hinter der Leiste | Spur höher/kontrastreicher (bleibt dezenter als die rote entdeckte Falle); Blick senkt sich, wenn eine ENTDECKTE Falle das nächste Feld ist (nicht bei unentdeckten, sonst Verrat) |
| Kartenzoom ohne Wirkung | **Nicht nachgestellt**: Zwei-Finger-Zoom funktioniert in headless Chromium (Faktor 5, keine Notiz) | Zusätzlich Schaltflächen ＋ / − / 1:1 unter der Karte. Genaues Verhalten auf dem Gerät erfragen, falls weiter ohne Wirkung |
| Grauer Infobalken nur 3 s | Der Balken im Screenshot ist die Android-Systemmeldung zum Vollbild – von der App nicht steuerbar | In-Game-Infoleiste jetzt fest 3 s (vorher 3–6 s) |

Tests 110 grün (Node). BALANCE.md/SIM.md unverändert (keine Werte geändert). Dev-Hook `S.fn.openMap` für Headless-Tests ergänzt.

## 0.23.5 (18.11.2026) – Monster in der Wand (nicht auf Gerät getestet)
- Meldung des Nutzers (Screenshot Moorpfad, Kultisten + Moorlicht): Moorlicht steckt halb in der rechten Wand.
- Ursache (Headless-Screenshot nachgestellt, Zelle 18/4 mit Moosmauer 17/4): `isNarrowAt` staffelte die Gruppe nur, wenn LINKS und RECHTS Wand war; bei nur einer Wand rutschte der äußere Gegner (Versatz −0,56) in diese Wand.
- Fix: `wallSides`/`groupLayout` (render.js), genutzt von Sprites (`buildSprites`) und Lebensbalken (main.js `placeFoeTags`). Wand auf einer Seite: bei 3 Gegnern gestaffelte Aufstellung, bei 2 Gegnern Verschiebung von der Wand weg. Beide Wände: wie bisher.
- Geprüft: Moorpfad 18/3 Blick Süd und 19/4 Blick West – keine Figur in der Wand. Weitere Orte nicht durchgesehen.
- Tests 111 grün (Node). Testpunkt `wall-235`.

## 0.23.6 (18.11.2026) – Türsturz-Schrift (nicht auf Gerät getestet)
- Meldung: „Schrift“ (Screenshot Kultgruft, offene Tür „SCHATZ-KAMMER“ aus der Nähe: Schrift größer als das Schild, Zeilen am Rand abgeschnitten, schlecht lesbar).
- Befund (Headless nachgestellt): auch mit 0.23.5 war die Türschrift etwas breiter als das Schild.
- Fix: `genPlaque` für `kind === 'door'` Maßstab 1,5–2,0 (Faktor 80 statt 100); Wandschrift unverändert. Danach liegt der Text im Schild.
- Grenze: Aus 1 Feld Abstand ragt der obere Türsturz ohnehin über den Bildrand; das liegt an der Kamerahöhe und ist nicht geändert.
- Tests 111 grün.

## 0.23.7 (18.11.2026) – Fackelschalter für Geheimwände (nicht auf Gerät getestet)
- Nutzerwunsch: Geheimtüren sollen auch durch Berühren einer Fackel aufgehen.
- Umsetzung: `lever` mit `wall: true, torch: true` wird als gewöhnliche Wandfackel gezeichnet (render.js `buildGrid`), ◉/Antippen dreht sie und öffnet das Ziel (`gate`). Texte in logic.js (Hinweis, „schon gedreht“, Talent-Hinweis „Fackel mit lockerer Halterung“). `syncStatic` zieht `torch` und `msg` in alte Stände nach.
- Eingesetzt: Kultgruft, Geheimkammer „GIER FRISST“ (`switch_g2` bei 1/11, vorher lockerer Stein). Hinweis an `secret_g2` ergänzt: „… lässt sich drehen, nicht nur drücken.“ Die anderen Geheimwände (Auge, Archiv, Vorburg) bleiben bei losen Steinen.
- Spoiler-Bezug: keiner.
- Tests 111 grün (neu: Fackel öffnet Geheimwand, zweites Berühren; alter Test auf neue Meldung angepasst). Headless-Screenshot: Fackel von einer normalen nicht unterscheidbar.
- Offen/Entscheidung des Nutzers: weitere Geheimwände auf Fackeln umstellen? Empfehlung: ja, 1 pro Ebene, damit „locker sitzt“ nicht der einzige Weg bleibt.

## 0.23.8 (18.11.2026) – Skelette an der Wand (nicht auf Gerät getestet)
- Meldung: „Skelett teilweise in der Wand“ (Screenshot Schratgruben, braune Steinwände, Blick Ost, Wand links, zwei Gruftskelette mit Schild).
- Ursache nicht eindeutig belegt; wahrscheinlich Einwand-Lage (alter Stand vor 0.23.5) bzw. breite Figuren mit Schild: Nach 0.23.5 ragte der Schild noch knapp an die Wand.
- Fix: Mindestabstand zur Wand vergrößert (`groupOffsets`: Wandseite ±0,12 statt ±0,2; enger Gang 2 Gegner −0,15/+0,17, 3 Gegner −0,13/+0,14). Headless: Schratgruben 10/1 Ost und Kultgruft 6/6 Ost – Schilde berühren die Wand nicht mehr; im 1-breiten Gang überlappen sich die zwei Skelette leicht (Platzgrenze).
- Tests 111 grün.

## 0.23.9 (18.11.2026) – Offenes Fallgitter sichtbar (nicht auf Gerät getestet)
- Meldung: Nach dem Einsinken der Steinplatte (Schratgruben) war das geöffnete Gitter im Bild nicht zu sehen.
- Befund (Code): Offene Gitter (`gate.open`) wurden gar nicht gezeichnet; der Durchgang war einfach leer. Offene Türen hatten dagegen einen Rahmen.
- Fix: neues Sprite `gateOpen` (Pfosten, Querbalken, hochgezogene Stäbe mit Spitzen), wie der Türrahmen mit Achse nur beim Blick längs des Durchgangs. Gilt für alle Gitter (Schratgruben 2×, Nebelturm). Headless: Gitter 9/12 aus 1 und 3 Feldern sichtbar.
- Grenze: Aus der Seite (quer zum Gang) wird das offene Gitter nicht gezeichnet, wie beim Türrahmen.
- Tests 112 grün.

## 0.23.10 (18.11.2026) – Leiste überlappt die Tasten (nicht auf Gerät getestet)
- Meldung: „Überlappt“ (Screenshot Kampf, Nebelturm: Aktionsleiste und Heldenkarte von Berenn liegen unter den linken Tasten „Rechts drehen“/„Seitwärts“).
- Nachgestellt (Headless 780×360 CSS-px, Faktor 3, linker Tastenblock 41 px vom Rand statt 6 px wie auf dem S25-Screenshot): `fitStack` lief nur beim Layout; verschieben sich die Tastenblöcke danach (Display-Rand, Vollbild), blieb die Leiste an der alten Stelle. Ursache auf dem Gerät nicht gemessen, passt aber zu Screenshot (Leiste beginnt 553 px, Tasten enden 637 px).
- Fix: `refitStack` misst Tastenblöcke, Bühne und Zoom und passt bei Änderung neu ein; zusätzlich bei `resize`, `fullscreenchange` und alle 400 ms.
- Geprüft: Headless-Screenshot mit Rand-Simulation: Leiste liegt zwischen den Tasten, Aktionsknöpfe brechen in eine zweite Zeile um.
- Tests 113 grün.

## 0.23.11 (18.11.2026) – Vollbild-Meldung nicht jedes Mal (nicht auf Gerät getestet)
- Meldung: graue Android-Systemmeldung („zum Beenden des Vollbildmodus …“) erscheint jedes Mal nach kurzem Verlassen der App.
- Ursache (aus Code belegt): `autoFullscreen` trat bei jedem Tipp wieder ins Vollbild ein; die Meldung selbst stammt von Android und ist nicht steuerbar.
- Fix: Wurde das Vollbild verlassen (`fullscreenchange`), setzt `S.fsLeft` – kein automatischer Wiedereintritt mehr. Manuell weiter über Einstellungen/Vollbild-Knopf. Nach App-Neustart wieder automatisch.
- Offen: „Türen öffnen auch beim Antippen aus zwei Feldern“ – Headless nicht nachgestellt (Kultgruft, Kapellentür: 1 Feld öffnet, 2 und 3 Felder nur „Geh näher heran“). Nutzer soll Ebene/Tür und Ablauf nennen.

## 0.23.12 (18.11.2026) – Thron, Lebensbalken (nicht auf Gerät getestet)
- Meldung 1: „Erkennt man nicht als Thron. Sollte an der Wand stehen“ (Nebelturm, Thronsaal, Hüter stand mitten im Raum, Thron nur als dünner Bogen sichtbar).
- Änderung: Hüter `en_tboss` von (22,9) nach (25,10) an die Ostwand (Blick von der Tür geradeaus). `syncStatic` zieht Positionen lebender Gegner in alten Ständen nach (nicht, wenn der Spieler auf dem Feld steht). Thron-Sprite breiter (Lehne ±27 px, Seitentürme, Schädel, Stufen), dunkle Lehne mit hellen Kanten. Headless-Screenshot geprüft.
- Meldung 2: „Balken der Lebensanzeige wackelt, schwankt“. Ursache (aus Code): Balkenlage und -breite folgten der Atem-Animation des Sprites (±2 % Größe). Fix: `scr` aus `base`-Größe ohne Atmen. Headless: Balkenposition über 25 Bilder konstant.
- Offen aus 0.23.11: Tür öffnet sich beim Antippen aus 2 Feldern – nicht nachgestellt, Angaben des Nutzers abwarten.
- Tests 116 grün.

## 0.23.13 (18.11.2026) – Treppe dreht sich bei Annäherung (nicht auf Gerät getestet)
- Meldung: „Bei Annäherung dreht sich das Tor um 90 Grad“ (Screenshots: Treppe mit Bogen im Thronsaal, Nebelturm (24,12)). Das offene Fallgitter war nicht betroffen (Headless geprüft).
- Ursache (aus Code belegt): Treppen/Ausgänge im offenen Raum hatten keine Achse (`passAxis` = null) und wurden wie ein Aufsteller zur Kamera gedreht.
- Fix: `freeAxis` – feste Achse parallel zur nächsten Wand (Gleichstand: Nord-Süd-Blick). Von der Seite erscheint das Bauteil nun schmal (Kante), wie ein flaches Objekt im Raum. Headless-Screenshots aus 6 Positionen geprüft.
- Tests 117 grün.

## 0.23.14 (18.11.2026) – Systemmeldung mitten im Kampf (nicht auf Gerät getestet)
- Meldung: graue Android-Vollbildmeldung „plötzlich im Kampf ohne Grund“ (Screenshot, Kampf Runde 3).
- Vermutung (nicht gesichert): erster Tipp nach dem Laden/Neustart der Seite löste `autoFullscreen` aus, zufällig im Kampf. Ob der Nutzer bereits 0.23.11 hatte, ist nicht bekannt.
- Fix: höchstens ein automatischer Versuch je Seitenaufruf (`S.fsTried`) und nie im Kampf. Vollbild weiter manuell möglich.
- Tests 118 grün.

## 0.24.0 (18.11.2026) – Zaubertränke, Tränke in drei Größen (nicht auf Gerät getestet)
- Aufträge des Nutzers: „Zaubertrank einführen“; „Unterschiedliche Größen Heiltränke, auch unterschiedliche Größen mit entsprechenden Wiederherstellungspunkten“. Zaubertrank = Manatrank (Entscheidung des Assistenten: gibt Mana bzw. Ausdauer zurück, nutzt dieselbe `res` wie der Beruf; Annahme: Größen sollen auch für Zaubertränke gelten).
- Gegenstände (game.json): Heiltrank klein `potion` 15 LP (10 G), mittel `potion_m` 40 LP (28 G), groß `potion_g` 90 LP (60 G); Zaubertrank klein `zaubertrank` 15 (14 G), mittel `zaubertrank_m` 35 (32 G), groß `zaubertrank_g` 70 (66 G). `potion` heißt jetzt „Kleiner Heiltrank“ (ID unverändert, alte Stände kompatibel).
- Verteilung (Entscheidung des Assistenten): Hedda verkauft klein + mittel (beide Arten); groß nur als Beute (Truhe des Turmwächters). Mittlere Tränke u. a. in Schratgruben-Bosstruhe, Turm-Geheimtruhe, Festung 1; kleiner Zaubertrank in Kultgruft-Geheimtruhe und Festung (f3). Bestehende Spielstände behalten ihre bisherige Truhenbeute.
- Logik: `useItemOutside` kennt `mana` (Fehler `full-mp`, Tränkemeister-Bonus gilt auch hier). Kampf: je Art eine Zeile mit Größen („Heiltrank klein (2)“ …), Alchemist: Zeile je Held. Inventar: „Benutzen“ für beide Arten.
- Nicht angefasst: Gegner-/Heldenwerte (BALANCE.md/SIM.md unverändert, Sim nutzt nur kleinen Heiltrank). Offen: Siedlungsläden später mit großen Tränken.
- Tests 120 grün; Headless-Kampf geprüft (Zaubertrank groß gibt Mana).

## 0.24.1 / 0.24.2 (19.11.2026) – Beenden, Vollbild-Schalter, Update-Robustheit (nicht auf Gerät getestet)
- „Button Spiel beenden einfügen“: Titelbild (6. Knopf) und Menü. `quitGame`: Bestätigung, Autospeicherstand (nicht im Kampf), Vollbild verlassen, `window.close()` versuchen, danach Hinweis (Android lässt Web-Apps oft nicht selbst schließen – ob `window.close()` auf dem Gerät greift: nicht gesichert).
- „Vollbildmodus an/aus in den Einstellungen“: Knopf zeigt den Zustand und schaltet um; Ausschalten setzt `S.fsLeft` (kein automatischer Wiedereintritt). Nutzer meldete: Vollbild ließ sich nicht mehr beenden, Grund unklar (nicht nachgestellt; Android-Systemmeldung stammt nicht vom Spiel).
- Meldung des Nutzers: neue Version lässt sich nicht installieren; Titelbild zeigt weiter „Version 0.23.3“ (zwei Screenshots, 19.11.). Ursache nicht gesichert (Live-Seite von hier nicht abrufbar). Maßnahmen: sw.js mit `skipWaiting` und `allSettled` (fehlende Einzeldatei bricht Installation nicht mehr ab), Einstellungen: „Neueste Version laden“ (Service Worker und Cache `eldermoor-*` entfernen, Spielstände bleiben). Prüfpunkt für den Nutzer: GitHub → sw.js → Zeile VERSION; Live-Seite im normalen Chrome-Tab öffnen.
- Tests 123 grün.

## 0.24.3 (19.11.2026) – Fackelschalter im Nebelturm (nicht auf Gerät getestet)
- Auftrag „A“ des Nutzers (Empfehlung: je Ebene eine weitere Geheimwand per Fackel): Kultgruft hatte schon `switch_g2` (Fackel), neu: Nebelturm `switch_t1` mit `torch: true`, Text „Die Fackel lässt sich drehen …“, Hinweis an `secret_t1`. `switch_g1` (Kultgruft) bleibt ein Stein, `switch_f1` (Festung, Teleporter) unverändert (keine Geheimwand).
- Test angepasst (zweites Drehen: „schon gedreht“; Darstellung Fackel statt Stein). Alte Stände ziehen `torch`/`msg` über `syncStatic` nach.
- Tests 123 grün.

## 0.25.0 (19.11.2026) – Begegnungsdialoge mit Folgen (nicht auf Gerät getestet)
- Auftrag „B“ des Nutzers (Dialoge mit spürbaren Folgen). Neues Dialogsystem, rein in logic.js (ohne DOM), Oberfläche in main.js (`openDialog`, `dialogPick`, Modal-Art `dialog`, Knöpfe `data-m="dlg:<i>"`).
- Schema in game.json: `dialogs.<id> = { name, start, again, nodes: { <id>: { text, choices: [ { t, to, if:{flag,noflag,item}, cost:{gold}, take:{item,n}, give:[…], set:[Flags], done, leave, attack, msg } ] } } }`. `done` merkt sich das Gespräch (`flags['d:'+npc.id]`), danach startet der `again`-Knoten. `attack` wandelt die Person in einen Gegner und startet den Kampf.
- Personen (Objekttyp `npc`, blockiert das Feld, per ◉ oder Antippen ansprechbar): Torfstecher Bram (moorpfad 10,7; Hilfe gegen Gold, Gegengift), Wundkultist (kultgruft 4,8), Wachmann Gerwin (festung1 13,15). Inhalte und Folgen stehen in game.json (Entscheidung des Assistenten: wenige, klar unterscheidbare Folgen; Story-Bezüge nur indirekt).
- Weitere Änderungen: `tapUseByTap` erkennt NPCs, `syncStatic` zieht lebende Gegnerpositionen nach, Render-Sprite für NPCs (`look`).
- Prüfung: Tests 124 grün (inkl. Erreichbarkeit der drei Personen); Headless-Test (Playwright): Bram per ◉ ansprechen, „Um Hilfe bitten“ → „Bezahlen“: Gold 40→30, 1 Gegengift. Kultist-/Gerwin-Dialog nur in der Logik getestet, nicht in der Oberfläche.
- Offen: Gerätetest durch den Nutzer; weitere Personen später über dasselbe Schema (nur game.json). BALANCE.md/SIM.md unverändert (keine Gegner-/Heldenwerte geändert, außer Wundkultist-Angriff nur als Kampfoption).
- Nächster Schritt: C (0.26.0) Moorfestung in Stufen.

## 0.26.0 (19.11.2026) – Moorfestung: Kellergewölbe (Keller 1) (nicht auf Gerät getestet)
- Auftrag „C“ des Nutzers (Moorfestung in Stufen). Neue Ebene `festung2` „Moorfestung – Kellergewölbe“, 52×38 Felder (Vorburg: 36×22), eigene Palette `katakomben` (kühles Grau-Blau, Knochenton), Gebietszuschlag `foe` LP 280 % / Angriff 215 % (Annahme des Assistenten: ein Schritt über der Vorburg 250/200; **nicht simuliert**, sim.js reicht nur bis Nebelturm).
- Bauart (anders als die Vorburg mit Sälen und Höfen): Ankunftskammer → Knochengänge (Labyrinth mit Schleifen, Wand „Fels“) → Säulenhalle (Wand „Flechten“, Pfeilerraster) → Ossuarium (langer Gang) → sechs Gruftkammern → Westgang mit Gitter → Sperrhalle → Tür „TIEFE“ → Treppe nach unten (vorläufig `exit`, Hinweis „in einer späteren Version“).
- Rätsel/Inhalte: Hebel in Kammer 3 öffnet das Gitter `gate_k1` zur Sperrhalle; Fackelschalter `switch_k1` in Kammer 4 öffnet die Geheimkammer 5 (Hinweis am Riss), dort Truhe mit `keller_schluessel` (Wächter); Schlüsseltür `door_k_ende` zur Tiefe; Monstertruhe (Truhenmaul) in Kammer 2; Fallen (Speer, Gas, Rune, Gas); Nische mit Tränken, Wandtafeln, 5 Truhen. Gegner nur bekannte Arten (Skelett, Kultwächter, Erzkäfer, Nebelgeist, Turmwache, Brandmagier, Hauptmann).
- Verknüpfung: in `festung1` wurde `exit_festung` durch Treppe `stairs_festung_keller` ersetzt (Ziel festung2 3/5); Rückweg `stairs_k_up` → festung1 31/7. Alte Spielstände: Ausgang erscheint über `syncStatic` als Treppe (nicht auf Gerät getestet; Vermutung, dass ein alter `exit_festung`-Zustand ohne Wirkung bleibt).
- Tests 125 grün (neu: Kellergewölbe, Ausgangstest auf festung2 umgestellt). Headless: Ebene lädt, Sichten aus 6 Positionen ohne Fehler. `analyzeLevel` ok (alle Truhen/Ausgänge erreichbar).
- Offen: Balance der Gegner im Keller (Gerätetest/Simulation), Keller 2 bis 5 (jeweils größer, wieder andere Bauart), Runenstein-Abkürzungen, Siegel, falsche Statuen.

## 0.26.1 (19.11.2026) – Eigene Bilder für die Begegnungspersonen (nicht auf Gerät getestet)
Nutzer: Die anderen Personen sollen nicht wie die Händlerin aussehen, sondern unterschiedlich. Bram nutzte das Händlerinnen-Bild (`look: merchant`), Wundkultist und Gerwin teilten sich Bilder mit Gegnern.
- `genPerson(seed, kind)` (render.js, 128 px, `paintFigure`, warmer Hautton über Material `glow`): `torf` (Torfstecher Bram: Schlapphut, grauer Bart, grüner Rock, Spaten), `wache` (Wachmann Gerwin: Rundhelm mit Nasenschutz, Kettenhemd, roter Wappenrock, Speer), `wund` (Wundkultist: Kapuze, Kopf- und Brustverband, Blutflecken, gebeugt, zerrissener Saum). In game.json `look` der drei Personen entsprechend gesetzt.
- Tests 125 grün. Bilder headless im Vergleich zu Händlerin, Kultist und Wächter gesehen (Ausgabe als Bild), **nicht auf Gerät getestet**. Keine Werte geändert, BALANCE.md/SIM.md unverändert.
- Arbeitsweise (Nutzer 19.11.): Claude lädt neue Versionen selbst ins Repo hoch (Push auf `main`); Testlisten immer als Abhakliste mit ✓ und ✗; beides ohne erneute Aufforderung anbieten.

## 0.26.2 (19.11.2026) – Türen aus 2 Feldern öffnen (nicht auf Gerät getestet)
Nutzer: Türen sollen schon aus 2 Feldern Abstand durch Antippen aufgehen.
- `doorAhead2(state, x, y)` (logic.js): Tür genau 2 Felder in Blickrichtung, Feld davor frei, Tür zu, keine Riegeltür (Riegelseite braucht Nähe). `interact(state, data, target)` nimmt ein Zielobjekt entgegen. main.js `tapUseByTap`: Tippen auf eine solche Tür öffnet sie sofort (Schloss/Schlüssel wie sonst); Gruppe bleibt stehen. Andere Objekte weiter „Geh näher heran.“
- Tests 126 grün (neu: Tür aus 2 Feldern). Keine Werte geändert.

## 0.26.3 (19.11.2026) – Aufstellung im breiten Gang, Personenbilder (nicht auf Gerät getestet)
Nutzer: „Im breiten Gang könnten sich die Gegner nebeneinander stellen“, „Bart sieht komisch aus“, „Strich im Gesicht weg“.
- render.js `groupOffsets/groupLayout`: Wand nur auf einer Seite und drei Gegner → zwei vorn nebeneinander (lat ±0.1/0.7 weg von der Wand), dritter mittig dahinter (dep 0.62, grow 1.32). Vorher: alle fast übereinander gestaffelt. Beidseitig Wand (enger Gang) unverändert gestaffelt; zwei Gegner mit einer Wand wie bisher.
- genPerson: Bram mit V-förmigem Bart, Schnurrbart, Nase, Brauen, kleineren Augen, spitz auslaufend; Wundkultist ohne schrägen Verbandsstrich im Gesicht. Tests 126 grün.
- Offen: Gerät prüfen, ob die Außenfigur bei lat 0.7 noch ganz im Bild ist (Kultgruft en_g4, Blick nach Osten).

## 0.26.4 (19.11.2026) – unentdeckte Falle dezenter (nicht auf Gerät getestet)
Nutzer: „Fallen viel zu offensichtlich sichtbar“. genTrap('faint'): Platte nur noch x 20–44/y 57–63 (vorher 14–50/54–63), Kontrast zum Boden deutlich geringer, nur 2 feine Risse, kaum Staub. Erkennung über Talent/Untersuchen unverändert. Gegenspiel zu 0.23.4 (damals „ohne Schurken nicht erkennbar“) – falls jetzt gar nicht mehr sichtbar, Wert in render.js nachziehen. Tests 126 grün.

## 0.26.5 (19.11.2026) – Gegner näher beieinander (nicht auf Gerät getestet)
Nutzer: „Stehen zu weit auseinander“ (zwei Gegner im offenen Raum). groupOffsets: Abstand frei stehend 2 Gegner 0.62→0.42, 3 Gegner 0.56→0.5; Dreieck mit einer Wand 0.1/0.7→0.1/0.6. Tests 126 grün. Gerät prüfen: überlappen breite Figuren (Schild) zu stark?

## 0.26.6 (19.11.2026) – Standpfeil auf der Karte größer (nicht auf Gerät getestet)
Nutzer: eigener Standpfeil größer. main.js drawMapSym 'player': Radius 0.38→0.9 Feldbreiten auf der Karte (Legende 0.45), schwarzer Rand für Kontrast. Tests grün.

## 0.26.7 (19.11.2026) – Kellertreppe „Tiefe“ an die Wand (nicht auf Gerät getestet)
Nutzer: „Tür in der Mitte des Raums“ (letzter Raum vor dem neuen Bereich). Gemeint war vermutlich die frei stehende Treppe exit_k_tiefe (festung2, vorher 48/32, von der Seite als schmale Platte sichtbar). Jetzt 49/32 direkt an der Ostwand → wird als Wand-Abziehbild gezeichnet. Test angepasst (Spieler auf 48/32). Tür „TIEFE“ (41/32) unverändert. Nachfrage an Nutzer: stimmt die Deutung? Tests grün.

## 0.27.0 (19.11.2026) – Keller 2: Blutgruft, Vampire (nicht auf Gerät getestet)
Nutzer: „Nächstes Level mit roter Grundfarbe und gruseligen Vampiren“.
- **Neues Gebiet `festung3` „Moorfestung – Blutgruft“** (60×44, größer als Keller 1 mit 52×38), Palette `blut` (rote Wände, Boden, Decke). Bauart anders als Keller 1: Vorhalle → Blutpforte → **Hauptschiff** mit Säulenreihen, fünf **Grüfte** nördlich (Hebel in Gruft II, Monstertruhe in Gruft III, Falle/Nische in IV, Wächtertruhe in V), **Ahnengalerie** nordwestlich, **Kerker-Labyrinth** südlich hinter Gitter (Hebel), dort der **Blutschlüssel** (`blut_schluessel`), **Thronsaal** ostwärts hinter Eisentür. Foe-Zuschlag 300 % LP / 225 % Angriff.
- **Verbindung:** `exit_k_tiefe` in festung2 ist jetzt `stairs_k_tiefe` (49/32, Wand) → festung3 (3/22); Rückweg `stairs_b_up` (2/22) → festung2 (48/32). Der Abschluss-Ausgang `exit_b_tiefe` (56/22, „späteren Version“) liegt jetzt im Thronsaal.
- **Gegner:** `blutdiener` (60 LP, Blutung), `vampirbrut` (95 LP, Blutbiss), `blutgraefin` (Boss 230 LP, Phasen Blutrausch/Fledermausschwarm). Schwach gegen Feuer (−50 %), Eis +25 %.
- **Neu in logic.js:** Zauberart `drain` (Blutbiss): trifft den Schwächsten mit voller Rüstung, heilt den Gegner um `leech` % des Schadens. In der Doku-Zeile über `pickCast` ergänzt.
- **render.js:** `genVampire` (diener/brut/graefin), Sprites `diener`, `brut`, `graefin`, `spriteFor`, Boss größer.
- **Balance:** sim.js CAMPAIGN enthält jetzt festung2 und festung3; BALANCE.md/SIM.md neu erzeugt (3000 Läufe). Boss Gräfin: ca. 57 % Sieg im 1. Versuch (klug), Normalkämpfe meist 84–100 %. Die Kampagne insgesamt bleibt für „nur Angriff“ sehr schwer (0 %), „klug“ 56 % – Altlast aus Keller 1, nicht neu.
- Tests 127 grün. Offen: Gerätetest (Blutgruft, Vampirbilder, Blutbiss-Meldungen), Balance durch Spielen prüfen.

## 0.28.0 (19.11.2026) – Moorsee, Fähre, Schatzinsel (nicht auf Gerät getestet)
Nutzer: Flusslauf mit Brücke, See mit Boot und Fuhrmann (Fahrt gegen Gold) zur Schatzinsel mit Haus; Gnom mit Würfelspiel (1–10; ungerade → schwarze Riesenspinne, gerade → Glücksamulett).
- **Gebiete:** `moorsee` (34×19; Fluss x=11..13 mit Bohlenbrücke y=8..9, See im Osten, Steg x=20..23 y=8, Fuhrmann `npc_fuhrmann` 23/8, Boot als Zierobjekt) und `schatzinsel` (15×14; Haus mit Tür `door_i_haus`, Gnom `npc_gnom`, drei Truhen, Rückfahrt-Fuhrmann `npc_fuhrmann_i`). Zugang: `stairs_pfad_see` (Moorpfad 22/7) → Moorsee 2/8; Rückweg `stairs_see_back` (1/8).
- **Entscheidungen (von mir getroffen):** Anbindung über den Moorpfad; keine Bootssteuerung, Überfahrt per Dialog (`goto`, 20 Gold hin, zurück gratis); Wasser ist Bodenfeld `~` und sperrt mit Meldung. Würfel: gerade → Glücksamulett, ungerade → Gnom wird `riesenspinne` (Wortlaut des Nutzers so gedeutet). Spinne gibt EP/Gold/Ausrüstung, kein Amulett; wer verliert, kann das Amulett nicht mehr bekommen (Gnom ist dann Gegner). Amulett: ca. 0,6 % pro Schritt, 3–14 Gold.
- **Neu in logic.js:** `travelTo` (Gebietswechsel ohne Treppe), Dialogfelder `goto` und `dice {even, odd}`, `decor` (blockiert, statisch), Glücksamulett-Wurf in `tryMove` (RNG nur mit Amulett verbraucht → alte Seeds unverändert), `analyzeLevel` zählt Fuhrmann-Dialog mit `goto` als Ausgang.
- **render.js:** Boden-Raster `buildFloorGrid` (Wasser animiert, Bohlen quer/längs), Sprites Fuhrmann, Boot, Gnom, Riesenspinne; Karte (main.js drawMap): Wasser blau, Bohlen braun.
- **Daten:** Objekt-IDs im Moorsee heißen `en_see1`, `en_see2`, `chest_see1`, `chest_see2` (IDs müssen über alle Gebiete eindeutig sein).
- Tests 128 grün, BALANCE.md neu (Riesenspinne). SIM.md nicht neu: bestehende Werte unverändert, Riesenspinne nicht in der Kampagne.
- Offen: Gerätetest (Fähre, Wasserdarstellung, Würfel gerade/ungerade, Spinnenkampf, Amulett, Karte).

## 0.29.0 (19.11.2026) – Ringe, Amulette, Flüche, Gefangener, Händler Valdis (nicht auf Gerät getestet)
Nutzer: Ringe/Amulette gibt es von Anfang an, extrem selten (nur nach schweren Rätseln oder Bosskämpfen), je Held höchstens 1 Ring und 1 Amulett; Gefangener mit Wunsch + magischem Ring; Flüche, früh durch Eigenschaften erkennbar; besserer Händler in der Blutgruft.
- **Slots:** `data.slots` hat jetzt `ring` und `amulet` (SLOTS in logic.js). Gleicher Mechanismus wie Waffe/Rüstung (ein Stück je Platz, Tausch legt das alte zurück). Alle Berufe dürfen tragen. Charakterbogen zeigt vier Plätze, Inventar-Symbole 💍 und 📿.
- **Gegenstände (alle einzigartig, nicht verkäuflich, nicht im Handel):** Ringe: Siegelring des Hauptmanns (Boss Hauptmann; +1 Angriff, Krit 6 %), Ring der Last (Plattenrätsel Schratgruben, `chest_s_plate`; +1 Vert., Schaden −1), Ring der Blutgräfin (Boss; +1 Init., Lebensraub 12 %), Ring des Befreiten (Gefangener; +1 Init., Ausweichen 8 %, +1 Ressource), **Ring des Blutdurstes (verflucht)**. Amulette: Moorstein-Amulett (Boss Grubenschrat; +1 Vert., Statusabwehr 25 %), Nebeltränen-Amulett (Boss Nebelhüter; Ausweichen 6 %, Fähigkeiten +10 %), **Kette der Gier (verflucht)**. Fundorte der verfluchten: Blutdurst in `chest_b_g5` (optionale Gruft V), Gier im echten Schatz des falschen Schatzraums (Kultgruft). Truhen mit `lootV` ziehen alte Stände nach, Boss-Drops nur für Bosse, die noch nicht besiegt sind.
- **Flüche:** `item.curse = {atk, def, init}` (Malus wirkt immer, Werte in `gearBonus`). Sichtbar erst, wenn der Gegenstand einmal getragen wurde (`flags['id:<id>']`, beim Anlegen Meldung „Ein Fluch! …“) **oder** ein wacher Held Geheimwände spüren kann (Talent `secret` ≥ 25: Waldläufer „Scharfes Auge“, Magier „Eisblick“; Konstante `CURSE_SENSE`). Dann steht ⚠ im Inventar und am Bogen. **Entscheidung:** Verfluchtes lässt sich jederzeit wieder ablegen (kein Festkleben); der Reiz ist der Malus gegen den Nutzen.
- **Gefangener:** kleine Zelle (Kellerebene Blutgruft, Ahnengalerie, Tür `door_b_zelle` bei 6/3, Schlüssel `zellenschluessel` in der bewachten Truhe `chest_b_a`). Bild `genPrisoner`. Wunsch (genau einer): Reichtum (200 Gold), Rüstzeug (erzeugte Ausrüstung, Boost 3), Erfahrung (400 EP je Held), Wissen (Karte der Ebene aufgedeckt, ohne Geheimwände). Den Ring des Befreiten gibt es immer dazu. Neue Dialogwirkungen `xp` und `reveal`.
- **Händler Valdis** (`merchant_valdis`, 7/24, Vorhalle der Blutgruft, Shop `blutgruft`): Stahlschwert (+4), Runenstab (+4), Schuppenpanzer (+3), Plattenpanzer (+4), große Tränke; Hedda hat höchstens +2. Bild `genVendor2` (kahl, Augenklappe, Narbe, Eisenschultern, Zweihänder). Händler können jetzt `look` haben (Standard weiter Hedda-Bild).
- Tests 129 grün (neu: Ringe/Amulette, Fluch, Seltenheit, Gefangener (alle vier Wünsche), Valdis, Speichern). BALANCE.md neu. Simulation nutzt Ringe nicht (Boss Gräfin weiter ca. 61 %). Nicht auf Gerät getestet.
- Offen: Gerätetest, Gefühl für Stärke der Ringe, ob ein Fluch fester wirken soll.

## 0.30.0 (20.11.2026) – Ausrüstungsübersicht „Wer trägt was“ (nicht auf Gerät getestet)
Nutzer: „Es wäre auch noch gut, wenn bei dem Spiel man sehen könnte, wer was trägt oder was welches schon verbessern würde.“ (Deutung von mir: Übersicht der getragenen Stücke + Vergleich je Held; nicht vom Nutzer bestätigt.)
- **logic.js:** `gearCompare(state,data,h,itemId)` → {slot, cur, delta{atk,def,init}, total, better, worse} oder null (nicht tragbar). Unerkannte Flüche fließen NICHT ein (kein Verrat), erkannte zählen mit Malus. `wornOverview(state,data)` → je Held die Plätze (weapon/armor/ring/amulet).
- **main.js:** `gearDelta` nutzt gearCompare (▲ besser / ▼ schlechter, „trägt X“ oder „Platz frei“ im Heldenknopf beim Ausrüsten). Inventarzeilen von Ausrüstung zeigen „▲ Besser für: Name (Werte)“ bzw. „Verbessert niemanden“ (`betterFor`). Neues Fenster `openGearOverview` (Knopf „Ausrüstung“ im Inventar, „Wer trägt was?“ bei den Charakteren): je Held alle Plätze mit Werten, darunter Ausrüstung im Inventar mit „Besser für“.
- „Besser“ = Summe aus Angriff+Verteidigung+Initiative steigt. Effekte (fx, Sets) fließen nicht in den Vergleich ein (Entscheidung: einfach und nachvollziehbar; Effekte stehen weiter in der Beschreibung).
- Keine neue Datei, kein Speicherstand-Wechsel, keine Wertänderung (BALANCE/SIM unverändert). Tests 130 grün (neu: Ausrüstungsvergleich).
- Entscheidung Nutzer (20.11.2026): Vergleich zählt nur Werte (Angriff/Verteidigung/Initiative), Effekte und Set-Boni NICHT. Deutung des Wunsches vom Nutzer nicht ausdrücklich bestätigt, nicht widersprochen.
- Offen: Gerätetest (Layout auf dem S25, Lesbarkeit der Zeilen).

## 0.30.1 (20.11.2026) – Inventar bleibt bei gesperrter Rast offen (nicht auf Gerät getestet)
Nutzer (Screenshot Moorpfad/Gang, 16:01): Im Inventar erscheint die Rastmeldung („Gegner zu nah“) und man kommt nicht ins Inventar; die Rastmeldung soll nur kommen, wenn man selbst auf „Rasten“ tippt (Proviant essen).
- Befund (aus dem Code belegt): Das Öffnen des Inventars prüft keine Gegner. Der Knopf „Rasten“ (neben Proviant) rief bei gesperrter Rast `closeModal()` auf, das ganze Inventar schloss sich. Dass der Nutzer genau so in die Lage kam (Tipp auf „Rasten“), ist **Vermutung**; Auslöser per versehentlichem Tipp nicht ausgeschlossen.
- Änderung (main.js, `m === 'rest'`): Bei Fehler (Gegner nah/in Sicht, Kampf, nichts zu tun) bleibt das Inventar offen, Meldung nur als Hinweis (3,2 s) und im Protokoll. Erfolgreiche Rast schließt das Fenster wie bisher.
- Headless nachgestellt (Gegner 3 Schritte entfernt, Inventar → Rasten): Inventar bleibt offen, Meldung sichtbar. Nicht auf Gerät getestet.
- Missverständnis-Risiko: Satz „dass man auf 5 Schritten nicht in sein Inventar gehen kann“ deute ich als „auch bei 5 Schritten Abstand soll man ins Inventar kommen“. Rastregel (10 Pfadfelder, Sichtlinie) unverändert.

## 0.31.0 (20.11.2026) – Talentwahl bei den ★-Talenten, Autospeichern (nicht auf Gerät getestet)
Nutzer: „Alternativen für Talent“ → aus meiner Liste (A–F) wählte er **A** („Ok A“); „den Rest später, erinnere mich zu gegebener Zeit“. Dazu: „Autospeichern alle 10 min“.
- **Talentwahl (A):** Das 3. Talent jedes Zweigs (★) hat jetzt zwei Wege: `nodes[2].alt = {id, name, desc, fx, sig}` in game.json (18 Alternativen, IDs `<id>_b`). Beide Wege haben dieselben Grundwerte, nur der ★-Effekt unterscheidet sich (nur bereits gebaute fx-Schlüssel, keine neue Kampflogik). Gelernt wird einer von beiden (`canLearnTalent` → `andere`), Kosten wie der Platz (2), der 4. Platz akzeptiert beide (`nodeHeld`). Zurücksetzen gibt die Wahl frei. `talentNodes` liefert beide Wege als eigene Einträge (`altOf`/`altId`). Speicherstand v6 unverändert (`hero.tal[<id>] = true`, validateState prüft über talentNodes); alte Stände behalten ihre Haupt-Talente.
- Oberfläche: im Talentfenster zwei Knöpfe in einem gestrichelten Rahmen „Wahl: ein Weg“.
- Balance: sim.js lernt immer den ersten lernbaren Eintrag (Haupteintrag), SIM.md bleibt gültig; die Alternativen sind nicht simuliert. BALANCE.md unverändert.
- **Autospeichern:** alle 10 Minuten in Slot „auto“ (nicht im Kampf, nur wenn ein Spiel läuft), kurze Meldung „Automatisch gespeichert.“ (1,4 s).
- Tests 131 grün (neu: Talent-Wahl). Headless-Screenshot des Talentfensters gesehen.
- **Später (vom Nutzer zurückgestellt, bei passender Gelegenheit erinnern, z. B. beim Taverne-Bau bzw. nach den Gerätetests):** B weniger, stärkere Talente (kleine Zahlentalente zusammenlegen); C Haltungen im Kampf; D Lehrer in der Taverne; E Gruppentalente; F günstigeres Umlernen. Empfehlung des Assistenten: B als Nächstes, D mit der Taverne, C erst nach gemessener Balance.

## 0.31.1 (20.11.2026) – Tränke im Kampf aus dem Inventar (nicht auf Gerät getestet)
Nutzer: „Tränke sollen während des Kampfes nutzbar sein“; Rückfrage per Auswahl: gewünscht ist „Inventar im Kampf mit ‚Benutzen‘“ (die Regel aus 0.15.10 bleibt).
- Vorher ging es nur über den Kampfknopf „Gegenstand“; im Inventar fehlte „Benutzen“ im Kampf (main.js `openInventory`, `!g.combat`).
- Jetzt: Inventar zeigt im Kampf „Benutzen“ bei Heil- und Zaubertränken. Held am Zug trinkt für sich (`heroAct({type:'item'})`, Fenster schließt, Zug läuft normal); Alchemist wählt den Helden; nicht am Zug: Meldung „Gerade ist kein Held am Zug.“. Fehlermeldungen (volle LP/Mana) kommen als Kampfmeldung. Kein Spielstand-/Wertwechsel.
- Headless geprüft (Kampf, Inventar → Benutzen: Trank −1, LP des Helden am Zug +), Tests 131 grün.

## 0.31.2 (20.11.2026) – Wandschrift „Eisentor“ → „Holztor“ (nicht auf Gerät getestet)
Nutzer (Screenshot Moorpfad, Holztür „KULT-GRUFT“, daneben Schrift „EISENTOR“): „Es handelt sich um eine Holztür.“ Befund: Wandtafel `sign_pfad3` (Moorpfad 19/5) trug Titel „EISENTOR“ und Text „Das Eisentor …“; die Tür `door_gruft` ist Holz. Geändert: Titel „HOLZTOR“, Text „Das Holztor der Kultgruft. Das Schloss ist neu, das Holz drumherum alt.“, Schlüsselbeschreibung `gruft_key` „… Holztor am Ende des Moorpfads“. Nur Texte, Tests 131 grün. In anderen Texten kommt „Eisentor“ nicht mehr vor (game.json durchsucht).

## 0.31.3 (20.11.2026) – Gegnergruppe mittig (nicht auf Gerät getestet)
Nutzer (Screenshot Moorpfad, 2 Moorkultisten + Moorlicht, Wand links): „Monster sollen mittig stehen.“ Befund (aus dem Code belegt): `groupOffsets` rückte Gruppen neben einer Wand von der Wand weg (0.23.x/0.26.3), dadurch stand das Paar rechts von der Bildmitte.
- Änderung (render.js): Drei Gegner neben einer Wand: zwei vorn bei ±0,28, der dritte mittig dahinter (vorher 0,1/0,6 von der Wand weg). Zwei und frei stehende Gruppen: kein Verschieben von der Wand mehr, Mitte = Feldmitte. Enger Gang (Wand beidseitig) unverändert.
- Risiko (Vermutung, nicht auf dem Gerät gesehen): breite Figuren mit Schild können neben einer Wand wieder leicht hineinragen (Anlass der früheren Verschiebung). Falls ja: melden, dann Mittelweg.
- Headless gesehen (Moorpfad, Wolf+Moorlicht, Wand links): Gruppe zentriert. Tests 131 grün.

## 0.31.4 (20.11.2026) – Tipp auf „Inventar“ löste Rast aus (nicht auf Gerät getestet)
Nutzer (Screenshot Moorpfad, 19:19): „Sobald ich auf Inventar drücke, rastet die Gruppe.“ Das ist vermutlich die eigentliche Ursache der Meldung von 0.30.1 (dort nur die Folge behandelt).
- Ursache (Mechanismus im Testbrowser belegt): Die Steuerknöpfe lösen schon bei `pointerdown` aus. Das Inventar öffnet sich, das Finger-Loslassen erzeugt danach einen Klick auf das Element, das jetzt unter dem Finger liegt, also im neuen Fenster. Liegt dort der Knopf „Rasten“ (Proviant-Zeile) oder ein anderer Knopf, wird er ausgelöst. Im Test traf der Klick auf dem 780×360-Schirm das Fenster (DIV); welcher Knopf auf deinem S25 getroffen wurde, ist nicht gemessen (hängt von der Inventarlänge ab).
- Fix (main.js): `openModal` merkt die Öffnungszeit (nur wenn vorher kein Fenster offen war), `onModalClick` ignoriert Klicks in den ersten 350 ms. Gilt für alle Fenster. Zwischen Fenstern (z. B. Charakter → Talente) greift sie nicht.
- Headless: Klick 100 ms nach Öffnen wird ignoriert (kein Toast), Klick nach 0,8 s funktioniert. Tests 131 grün. Nicht auf Gerät getestet.

## 0.31.5 (20.11.2026) – Schrift schwarz, Druckbuchstaben (nicht auf Gerät getestet)
Nutzer (Screenshot Kultgruft-Tür): „Schriftzug Holztür weg. Andere Schrift schwarz, nicht verlaufend, Druckbuchstaben.“
- Wandschild `sign_pfad3` („HOLZTOR“) entfernt (game.json). Der Schlüsseltext nennt weiter das Holztor am Ende des Moorpfads.
- `genPlaque` (render.js): Schrift jetzt schwarz (`ceil` 0), eckige Pixel statt Pinselflecken, kein Schiefstand, keine Tropfen/Gerinnsel; helle Kontur (`stone` 6), damit Schwarz auf Holz/Stein lesbar bleibt. Gilt für ALLE Schriftzüge auf Wänden und Türen (Annahme: „andere Schrift“ = alle übrigen). Falls nur die Tür gemeint war, ist das ein kleiner Rückbau.
- Headless-Screenshot geprüft (Tür Moorpfad), 131 Tests grün. Nicht auf Gerät getestet.

## 0.31.6 (20.11.2026) – Schriften unterschiedlich, Symbole, Brückengeländer (nicht auf Gerät getestet)
Nutzer: „Schriftzüge unterschiedlich. Bei Brücke z. B. mit Symbol“ und „Brücke ist noch gar keine Brücke, sondern flach“.
- Schrift (render.js `INKS`, `INK_OF`): Farbe je Schildstil, weiter eckige Druckbuchstaben ohne Tropfen: wood/arrow schwarz, dark dunkelrot, stone/arch gemeißelt (dunkelgrau), iron/small Kreide (hell), moss dunkelgrün, banner Gold. Schilder ohne Stil bekamen den Stil bisher per Hash der ID; Warn-/Rätsel-/Fallenschilder (ID enthält trap, _ill, secret, plate) sind jetzt `style: dark` (rot). Annahme: „unterschiedlich“ = Farbe/Art je Ort; falls gemeint war, dass jedes Schild individuell aussieht, bitte melden.
- Symbole: Objektfeld `sym` (render.js `SYMS`): bruecke (BRÜCKE), faehre (FÄHRE), schaedel (SARG I–III), schluessel (KERKER). Weitere Symbole = Eintrag in `SYMS` plus `sym` am Schild.
- Brücke (Moorsee, x 11–13, y 8–9): neuer Objekttyp `rail` (Sprite-Ebene längs der Bahn an den Kanten, Felder `dx`,`dy`,`ax`), nicht blockierend, in `STATIC_TYPES` (alte Spielstände bekommen es). Sechs Stück: rail_n11–13 und rail_s11–13. Echte Erhöhung/Bogen gibt der Raycaster nicht her; nur Pfosten und Holme. Der Steg bei der Fähre (x 20–23) hat noch kein Geländer.
- Headless-Screenshots (Schilder, Brücke), 131 Tests grün. Nicht auf Gerät getestet.

## 0.31.7 (20.11.2026) – Schatzinsel mit hoher Decke, Fachwerkhäuschen (nicht auf Gerät getestet)
Nutzer: „Schriftzug weg. Der Bereich soll in einem Bereich liegen, in dem die Decken doppelt so hoch sind (Grundfläche 5 × 5), so dass ein richtiges Haus zu sehen ist, Höhe normale Deckenhöhe.“
- Schriftzug „HÄUS-CHEN“ an der Tür entfernt (`title: ""`, damit alte Spielstände ihn auch verlieren).
- Neu im Renderer: Gebietsfeld `hall: { h, low: [x0,y0,x1,y1] }`. `h` = Deckenhöhe in Wandhöhen (2 = doppelt), `low` = Rechteck mit normaler Höhe (Haus samt Wänden). Wände außerhalb von `low` sind `h`-mal so hoch (Textur wiederholt sich), Wände in `low` normal hoch; hinter einer niedrigen Wand ragt die hohe darüber (Mehrfachtreffer je Bildspalte, von hinten nach vorn gezeichnet). Decke je Pixel: erst Ebene Höhe 1 (nur über `low`), sonst Ebene Höhe `h`. Nur in Gebieten mit `hall`; alle anderen unverändert. Niedrige Grafikqualität zeigt flache Decke (nicht geprüft).
- Neue Wand `h` (Fachwerk, `WALL_HOUSE` = 12). Schatzinsel: Haus jetzt 5 × 5 (x 5–9, y 4–8, Innenraum 3 × 3, Tür unten, Fackel oben), `hall: {h:2, low:[5,4,9,8]}`. Schilder (Abziehbilder) werden nur auf normal hohen Wänden gezeichnet.
- Grenzen/Vermutungen: Dach von außen nicht sichtbar (Blickhöhe liegt unter der Dachkante); Texturdichte der hohen Wände nicht beurteilt; Leistung auf dem S25 nicht gemessen (Mehrfachtreffer nur auf diesem Gebiet).
- Headless-Screenshots, 131 Tests grün. Nicht auf Gerät getestet.

## 0.31.8 (20.11.2026) – Namensschild und Name des Gnoms (nicht auf Gerät getestet)
Nutzer: „Es soll ein Türschild neben dem Eingangstor sein, darauf der Name des Gnoms (denk dir was aus). Der Gnom soll im Verlauf dann auch so heißen.“
- Name (Entscheidung des Assistenten, delegiert): **Murmel**. Passt zum Gnomenstil, kurz genug fürs Schild.
- Neues Schild `sign_i_name` (Schatzinsel, 8/9, Wand rechts neben der Haustür, Titel „MURMEL“, Holzstil); das Würfel-Schild links bleibt. Name im NPC (`npc_gnom.name`), im Dialog (`dialogs.gnom.name`) und in den Erzähltexten (Dialog, Kampfeinleitung, Gerüchtetext) von „Der Gnom“ auf „Murmel“ umgestellt. Rasse „Gnom“ (Heldenrasse) unberührt.
- Headless-Screenshot: Schrift liegt teils über einem Holzbalken (lesbar, aber nicht ideal); 131 Tests grün. Nicht auf Gerät getestet.

## 0.31.9 (20.11.2026) – Truhen: Material je Gebiet (A) und Wertstufen (B) (nicht auf Gerät getestet)
Nutzer: „Truhen sollen unterschiedlich aussehen“ → Vorschläge A (Material je Gebiet), B (Wertstufen), C (Sondertruhen); gewählt: A und B jetzt, **C später** (Erinnerung nötig, siehe unten).
- A, Körper je Gebiet (`mat` am Truhenobjekt): moder (Moor, Moorsee, Schatzinsel, Test: vermoost), stein (Kultgruft), erz (Schratgruben: dunkles Eisen, Holzbänder), nebel (Nebelturm: blassblaue Bohlen), eiche (Festung 1/2), blut (Blutgruft: dunkelrot).
- B, Stufe (`look`): ohne = einfach (Eisenbänder), `eisen` = gut (breitere helle Bänder, Mittelbänder), `edel` = selten (blaue Silberbänder, rote Edelsteine, blaues Schloss). Gold (`prunk`) bleibt dem Truhenmaul (Lockvogel) vorbehalten, damit „golden = Falle“ nicht verraten wird.
- Zuordnung der Stufen (Regel, Assistent entschieden): selten, wenn Gegenstand mit Aufwertung ≥ 2, Gold ≥ 50 oder ein benannter Einzelfund (Waffe/Rüstung/Ring/Amulett/Stab); gut, wenn Gold ≥ 30, Aufwertung 1 oder Mana-/Großtrank; Schlüsseltruhen höchstens „gut“. Ergebnis: 9 selten, 15 gut, 16 einfach (Liste in dieser Datei nicht geführt; im game.json am Feld `look`).
- Technik: `chestTex` (render.js) zeichnet je Material/Stufe/offen erst bei Bedarf und legt es im Cache ab; `genChest2(open, seed, style, mat)`. Alte Spielstände bekommen `look`/`mat` über `syncStatic` (Truhen ziehen jetzt auch `look` und `mat` nach). Test „Migration“ ignoriert diese beiden Felder.
- Headless-Screenshots aller Materialien; 131 Tests grün. Nicht auf Gerät getestet.
- **Später (vom Nutzer zurückgestellt): C Sondertruhen** (falscher Schatzraum mit Merkmalen wie schiefer Deckel/Zähne am Schloss, verfluchte Truhe mit Schimmer, Rätseltruhe mit Runen). Beim Abschluss der Gerätetests erinnern, gemeinsam mit den Talent-Alternativen B–F.

## 0.31.10 (20.11.2026) – Blockhütte 1×1, Insel angepasst (nicht auf Gerät getestet)
Nutzer (Screenshot Insel): „Hauswand anders. Aus dunkelbraunen Holzbalken, Holzhütte. Größe der Hütte nur 1×1, Rest der Insel entsprechend anpassen.“
- Wand `h` (`genHouseWall`): jetzt waagerechte dunkelbraune Rundstämme mit Fugen, Maserung, Astlöchern (vorher Fachwerk, zu hell/orange).
- Auslegung (Annahme: „1×1“ = Innenraum, Wände zusätzlich): Hütte 3×3 Felder (x 6–8, y 4–6), Innenraum 1 Feld (7,5) mit Murmel, Tür unten (7,6), Fackel oben. `hall.low = [6,4,8,6]`. Falls die ganze Hütte nur ein Feld groß sein sollte, bitte melden.
- Insel verkleinert (Land x 3–11 in Hüttenhöhe, Steg-Streifen x 5–9, y 8–10). Truhen jetzt (4,3), (10,3), (11,5); Fuhrmann (8,10), Boot (7,11); Ankunft (7,10) unverändert; Schilder (6,7) „WÜRFEL HAUS“ und (8,7) „MURMEL“ jetzt in Kreideschrift (`small`), da schwarz auf Dunkelbraun unleserlich.
- Headless-Screenshots, 131 Tests grün. Nicht auf Gerät getestet.

## 0.31.11 (20.11.2026) – Insel: Sand, Palmen, vergrabener Schatz; Brückengeländer korrigiert (nicht auf Gerät getestet)
Nutzer: „Der Boden der Insel ist aus Sand. Vereinzelt Palmen. An einer Stelle ist ein Schatz im Sand vergraben. Schurken und Alchemisten bemerken das.“ Dazu: „Brücke fehlerhaft“ (Screenshot zeigte die Insel-Anlegestelle, keine Brücke; Ursache siehe unten, vermutet).
- Sandboden: Gebietsfeld `floorTex: 'sand'` (render.js `genSand`, `view.floorTex`). Nur Schatzinsel.
- Palmen: `decor` mit `look: 'palme'`, `scale: 1.45` (blockieren das Feld), fünf Stück: (5,2), (3,6), (11,4), (9,9), (10,7).
- Vergrabener Schatz: neuer Objekttyp `buried` (`spotBy` Standard `["rogue","alchemist"]`, `loot`, `text`, Zustand `sensed`, `dug`), Schatzinsel (4,5): 80 Gold + Aufwertungsteil. Ein wacher Schurke oder Alchemist bemerkt die aufgewühlte Stelle automatisch (kein Würfelwurf), sobald die Gruppe höchstens 3 Felder (Manhattan) entfernt ist; dann erscheint ein Sandhügel (Sprite `mound`), ◉ auf dem Feld davor gräbt aus. Gruppen ohne diese Berufe sehen nichts (Absicht laut Nutzer; Entscheidung: kein Notweg). `scanBuried` läuft mit den Fallen-/Geheimtür-Scans.
- Brückengeländer (Fehler aus 0.31.6): `axis` des Sprites ist die Flächennormale, nicht die Laufrichtung; die Geländer standen deshalb beim Blick entlang der Brücke wie große Torrahmen quer. Jetzt Normale quer zur Bahn: längs der Brücke schmale Pfosten, von der Seite durchgehendes Geländer. Ob der Nutzer genau das meinte, ist nicht gesichert (Screenshot zeigte die Insel).
- Alte Spielstände: `syncStatic` zieht jetzt auch Position (x, y) von Truhen, NPCs und Türen nach (Insel wurde umgebaut) und setzt die Gruppe auf den Gebietsstart, wenn sie in Wand oder Wasser steht.
- Neuer Test (132 grün): Schatz, Berufe, einmaliges Graben, Entfernung, Umbau-Schutz. Headless-Screenshots (Sand, Palmen, Geländer). Nicht auf Gerät getestet.

## 0.31.12 (20.11.2026) – Laden eines Stands nach Umbau der Insel (nicht auf Gerät getestet)
Nutzer (Screenshot 19:51): „Laden fehlgeschlagen: Spielstand ungültig: Spieler steht in einer Wand.“ Folge meines Inselumbaus (0.31.10/0.31.11): Die Prüfung lief vor dem Nachziehen der Daten, mein Schutz in `syncStatic` kam zu spät.
- `deserialize` (logic.js): vor `validateState` wird die Gruppe auf den Gebietsstart gesetzt, wenn ihre Zelle Wand/Wasser ist. Am Ende von `syncStatic` zusätzlich, wenn ein Hindernis (NPC, Palme) auf ihrer Zelle steht.
- Tests: Altstand mit dem Insel-Layout von 0.31.9 (Gruppe im alten Haus) lädt jetzt; der alte Test „Spieler in Wand wird abgelehnt“ gilt nur noch für ungültige Koordinaten. 132 grün.
- Lehre für künftige Gebietsumbauten: Altstände prüfen (Datei mit altem `game.json` erzeugen, mit neuem laden).
- Nicht auf Gerät getestet.

## Änderungen 0.31.13 (20.11.2026, headless, nicht auf Gerät getestet)
- Würfelhaus-Schild: abgeschnittener Text entfernt; Schild ohne Text zeigt zwei elfenbeinfarbene Würfel (Symbol `wuerfel`, Feld `textless`). Namensschild „Murmel“ entfernt (sign_i_name gelöscht); Name nur noch im NPC/Dialog – Auslegung der Nutzerbitte „Namen weglassen“, bei Bedarf zurücknehmen.
- Insel 19×19, Hütte 7×7 mit 5×5-Innenraum (x7–11, y5–9), Holzdielenboden, Halle h=2 über Hütte (`low:[6,4,12,10]`).
- Möbel (Typ `decor`, neue Sprites via genFurn): m_bett, m_kamin, m_regal, m_tisch, m_stuhl, m_fass1, m_fass2. Gnom bei (9,6).
- Alt-Spielstände: `seen`-Größe wird bei Kartenwechsel repariert, vergrabene Schätze übernehmen x/y.
- Tests angepasst (Kartengröße-Reparatur); `node tests.js`: 132 bestanden, 0 fehlgeschlagen.
- OFFEN (Nutzerwunsch): Gnom-Spiel zu einem richtigen Würfelspiel mit Würfeln beider Seiten (ca. 1 min) ausbauen; Vorschläge im Chat, Entscheidung des Nutzers ausstehend. Außerdem Vorschläge Insel/Gnom-Interaktion.
- Spätere Erinnerungen: Talent-Alternativen B–F; Truhen-Option C (Sondertruhen).

## Änderungen 0.31.14 (20.11.2026, headless, nicht auf Gerät getestet)
- Nutzer: „Bei erneutem Wunsch auf die Insel anderer Text. Man kennt sich ja. Preis dann nur noch 10 mit lustigem Spruch.“
- Dialog `fuhrmann_ufer`: Die erste Überfahrt (beide „Übersetzen“-Wahlen) setzt `done` → Folgegespräche starten im Knoten `w` („Stammkunde“): neuer Text, Überfahrt 10 Gold, Spruch beim Ablegen. Alte Spielstände ohne erste Überfahrt sehen den Erstkontakt einmal (20 Gold). Rückfahrt gratis wie bisher.
- Test erweitert (132 grün). Offen unverändert: Würfelspiel-Ausbau (Vorschläge im Chat), Insel-/Murmel-Ideen.

## Änderungen 0.32.0 (20.11.2026, headless, nicht auf Gerät getestet)
Nutzerwünsche: Würfelspiel Variante B mit Murmel; Glücksamulett erst nach wiederholtem Sieg (Murmel deutet es an); Siegesspruch/Niederlagenspruch; 1. Spiel verloren = nur Geld weg; Niederlage im 2. Spiel = Gnom wird Teufel, Raum wird „böses Las Vegas“; dazu Kakteen und Hängematte zwischen zwei Palmen.
- **Spiel (logic.js `diceNew/diceRoll/diceKeep/diceNext/diceFinish`, Daten `data.dicegame`):** Einsatz 0/10/30 Gold (sofort abgezogen, Gewinn = doppelter Einsatz). Jede Runde 3 Würfel je Seite (Murmels liegen offen), Gruppe darf einen eigenen Würfel einmal neu werfen, dann wirft Murmel seinen niedrigsten neu, wenn er unter 3 liegt. Höhere Summe gewinnt die Runde, Gleichstand = wiederholen, 2 Runden gewinnen das Spiel (ca. 1 Min.). Aufgeben = Niederlage. Zufall über `state.rng`.
- **Marken:** `gnom:g1/g2` (1./2. Spiel gespielt), `gnom:w1/w2` (1./2. Sieg), `gnom:teufel`, `gnom:gewonnen` (Amulett erhalten). 1. Sieg = Hinweis („Wer mich ein zweites Mal schlägt …“), 2. Sieg = Glücksamulett (nur einmal), später nur Gold. Murmel kommentiert jede Niederlage mit Spruch (`murmelLoses`), Siege mit `murmelWins`. Altstände mit `gnom:gewonnen` gelten als 2 Siege (kein zweites Amulett).
- **Verwandlung:** Niederlage im 2. Spiel (egal ob 1. gewonnen oder verloren; auch Aufgeben) → Murmel wird `teufel` (Gegner: 100 LP, Angriff 14, Verteidigung 5, Feuer 75 % resistent, Eis +25 %; Höllenfeuer alle 3 Züge angekündigt, Pechsträhne (Fluch) 25 %, Phase „Alles auf Rot“ ab 50 %; Gebietsfaktor Insel 150/130; Beute 150 Gold, 300 EP, sichere Ausrüstung Boost 2). Das Glücksamulett gibt der Teufel NICHT.
- **Raum-Umbau:** Gebietsfeld `alt = {flag, patch, remove, objects}`; `levelFor/getLevel` liefern bei gesetzter Marke den umgebauten Stand (Wand `v` = Spielsalon-Tapete mit Neonband, Teppich-Boden `+`, Möbel getauscht: Roulette, drei Spielautomaten, zwei Pokertische; Kamin und Stuhl bleiben). `syncStatic` zieht den Umbau auch in Altständen nach. Original bleibt in `data.levels` unverändert.
- **Oberfläche (main.js):** Gesprächsknopf „Würfeln“ (`game: 'wuerfel'`) öffnet das Würfelfenster (Einsatzwahl → Würfeln → eigenen Würfel antippen oder „Behalten“ → Ergebnis → Weiter). Autospeichern ist während des Spiels gesperrt. Dev-Hook `S.fn.openDice`.
- **Insel:** fünf Kakteen, Hängematte (`haengematte_i`, 4/9) zwischen zwei neuen Palmen (3/9 und 5/9, Sprite zweifach breit), neue Sprites `kaktus`, `haengematte`, `spielautomat`, `roulette`, `kartentisch`, `teufel`, Wand `v`, Bodenzeichen `+`.
- Dialog Murmel: `startBy` (Gesprächsanfang nach Marken), Knoten a/e/b/c/r; die alte Zufallszahl-Regel (gerade/ungerade, Riesenspinne) ist entfernt. `riesenspinne` bleibt als ungenutzter Gegner in den Daten.
- Tests: 133 grün (neu: Würfelspiel komplett inkl. Teufel, Amulett, Altstand, Speichern). BALANCE.md neu. SIM.md unverändert (Teufel nicht in der Kampagne). Nicht auf Gerät getestet.
- Offen: Gerätetest, Teufel-Balance (Schätzung des Assistenten, nicht simuliert), weitere Ideen (Murmels Gerüchte, Würfelrangliste, Buch im Regal, zweiter Schatz) nicht gebaut.

## 0.32.1 (20.11.2026) – Insel begehbar, Hängematte tiefer, Hüttenwand heller, Murmels Hinweis (headless, nicht auf Gerät getestet)
- Meldung 1 („Zwischen Kaktus und Palme kann man nicht durchgehen“): Nachgestellt per Kartenprüfung. Kaktus (6,11)/Palme (5,12) und Kaktus (12,11)/Palme (13,12) standen diagonal; optisch Luft, im Raster zu. Vom Anlegeplatz aus waren nur Hütte und Südstrand erreichbar, Westen, Norden, Osten und alle drei Truhen nicht. Fix: Kaktus 1 → (4,11), Kaktus 2 → (14,11). Neuer Test: alle begehbaren Inselfelder vom Start erreichbar (Türen gelten als passierbar); der Test schlägt mit dem alten game.json fehl. Stuhl der Hütte (8,7) → (8,8), weil er mit Bett, Tisch und Murmel eine unerreichbare Ecke bildete.
- Meldung 2 („Matratze zu hoch“): Gedeutet als Hängematte (Liegefläche hing auf Kopfhöhe). Sprite `haengematte`: Durchhang jetzt bei Zeile 46–54 statt 31–45, Seile angepasst. Vermutung: gemeint war die Hängematte, nicht das Bett in der Hütte.
- Meldung 3 („Hintergrund sieht komisch aus“, Screenshot Murmel in der Hütte): Nachgestellt. Die Blockhüttenwand nutzte nur Helligkeitsstufen 0–3 und erschien innen wie außen fast schwarz (Steinwände: 3–5). `genHouseWall`: Stufe +2,8 (max 6,2). Ob das genau der Eindruck war, ist nicht gesichert.
- Meldung 4 (Amulett): Frischer Spielstand im Code geprüft (headless): 1. Sieg gibt nur Gold und Hinweis, Amulett erst beim 2. Sieg. Das Amulett nach dem ersten Spiel ließ sich nicht nachstellen. Vermutung: Spielstand mit `gnom:gewonnen` aus der alten Regel (Amulett vor 0.32.0); dann sagt Murmel „Das Amulett habt ihr“. Nicht belegt. Hinweistext nach dem 1. Sieg neu: nennt das Glücksamulett ausdrücklich, macht neugierig (Gold-Anziehung), Amulett erst nach dem 2. Sieg.
- Offen: Dialogtitel zeigt „Gnom“ statt „Murmel“ (Screenshot 21:39); noch nicht geändert.
- Tests 135 grün.
- Hütte (Nutzer: „zu groß, Bilder an der Wand, Teppich, Vase mit Blume, wohnlicher, Küchenecke“): Innenraum 5×5 → 3×4 (Wände x7–11, y4–9, Tür 9/9, Murmel 9/6). Neu: Küchenecke (`kueche`, Topf mit Dampf, Kelle, Pfanne), Blumenvase (`vase`), Wohnteppich (Bodenzeichen `r`, 3×3 in der Mitte), drei Wandbilder (`bildSee`, `bildGnom`, `bildWuerfel` als `sign` mit `deco`, antippbar). Möbel neu gesetzt; zweites Fass entfernt. Spielsalon-Umbau (alt) auf die neue Größe angepasst (Möbelliste, Objektplätze). Alle freien Felder erreichbar (Test). Headless-Bilder geprüft, nicht auf Gerät. Wandstärke/Möblierung der Hütte bleiben Geschmackssache des Nutzers.
- Glücksamulett (Nutzer: „lässt sich nicht ausrüsten“): war `kind: quest`. Jetzt `equip`, Platz Amulett, `passive: true`; Goldeffekt gilt im Beutel und angelegt. Zwischenlösung (Nutzer: „generiert viel zu oft Gold“): Wahrscheinlichkeit je Schritt 0,6 % → 0,12 %. OFFEN: Nutzer will andere Fähigkeiten für das Amulett (Vorschläge im Chat, Entscheidung steht aus).
- Offen: Dialogtitel „Gnom“ statt „Murmel“; Screenshot Insel-Südrand (Backsteinwand hinter dem Wasser, Boot halb im Wasser) ohne Text, Anliegen unklar.
- Tests 136 grün.

### 0.32.1 – Nachtrag (20.11.2026, 21:50; headless, nicht auf Gerät getestet)
- Boot (Nutzer: „sieht nicht aus wie ein Boot“): Sprite `boot` neu: geschwungener Rumpf mit spitzem Bug/Heck, hochgezogenen Steven, Klinkerplanken, Sitzbank, Ruder. Bildprüfung headless.
- Glücksamulett (Nutzer: Variante A + D): Krit +4 %, Fallen erkennen +10 (`fx.trap`, jetzt auch Ausrüstung in `trapSkill`; Interpretation von „Ausweichen bei Fallen“: Erkennungschance, nicht Ausweichwurf). Schatzspürer: wer es trägt, spürt Truhen (nicht Mimiken) und vergrabene Schätze bis 3 Felder Manhattan-Abstand; Meldung einmal je Objekt, Feld erscheint auf der Karte, Vergrabenes wird sichtbar (Symbol Truhe). Goldfund entfernt. Wirkt nur getragen.
- Haustür der Schatzinsel (Nutzer: „vor und nach Betreten geschlossen, Würfel auf die Tür“): `autoClose`: fällt beim Verlassen des Türfelds zu (Meldung), sonst ab 3 Feldern Abstand. Würfelsymbol jetzt auf der Tür (Tür mit `sym` + `textless`), Schild `sign_i_haus` entfernt.
- Insel (Nutzer: „komme beidseitig nicht hinter die Hütte“): Nachstellung per Karte: West-Durchgang nur 1 Feld breit (zwischen Palme 5/9 und Hüttenwand), Osten durch Kakteen 13/8 und 14/5 zweigeteilt. Hängematte samt Palmen auf Reihe 10, Kakteen an den Rand/Süden. Westen 3 Felder, Osten 3 Felder breit. Nicht auf Gerät geprüft.
- BALANCE.md neu erzeugt (Amulettdaten). Tests 137 grün.

### 0.32.1 – Nachtrag 2 (20.11.2026, 22:00; headless, nicht auf Gerät getestet)
- Nutzer: „Hängematte in der Luft“. Ursache (Vermutung, per Render bestätigt): Billboard-Sprite hing auf Kopfhöhe und drehte sich mit der Kamera, Enden trafen die Palmenstämme nicht.
- Fix: Hängematte hat feste Ebene (`axis [0,1]` im Decor-Push, nur für `look: haengematte`), Aufhängung/Durchhang tiefer (`sag = 53 + 6 * (1 - u*u)`, Seile bei y≈48–52). Aus Ost/West (Kantenansicht) wird sie schmal/unsichtbar – bewusst, da Ebene zwischen den Palmen.
- Screenshot 21:57 (Würfelhaus mit Schrift „WÜRFELHA“, offene Tür) entspricht dem Stand vor dem Tür-Fix; vermutlich alte gecachte Version – bei Nutzer nachfragen, ob Titelbild 0.32.1 zeigt.

### 0.32.1 – Nachtrag 3 (20.11.2026, 22:10; headless, nicht auf Gerät getestet)
- Nutzer: „Trotz absichtlich verlieren kommt es nicht zur Verwandlung von Gnom und Spielumgebung.“ Ursache (aus Code belegt): Teufel kam nur bei einer Niederlage im **genau** 2. Spiel (`n === devilGame`). Wer das 2. Spiel gewonnen oder nach Altstand/Mehrfachspielen schon im 3.+ Spiel verliert, sah ihn nie.
- Entscheidung (Assistent): Verwandlung bei der **ersten Niederlage ab dem 2. Spiel** (`n >= devilGame`, nur einmal, `gnom:teufel` noch nicht gesetzt). Gilt auch für Aufgeben. Nachteil: Wer im 2. Spiel verliert, bekommt das Amulett nicht mehr (Murmel ist dann Gegner) – wie bisher.
- Ob beim Nutzer ein Altstand oder ein anderer Fall vorlag, ist nicht gesichert; falls es weiter ausbleibt: Spielnummer/Meldung nennen.

### 0.32.1 – Nachtrag 4 (20.11.2026, 22:20; headless, nicht auf Gerät getestet)
- Nutzer (2 Screenshots 22:00): „Nur von einer Seite gut.“ Ursache: Auch mit fester Ebene (Nachtrag 2) war die Hängematte ein flaches Rechteck in einer einzigen Tiefe; von schräg oder von der Seite passten Enden und Stämme nicht zusammen (Enden schwebten).
- Fix: Decor-Sprites mit `span` ([dx,dy]) werden als Strecke im Raum gezeichnet (render.js, Sprite-Schleife): jede Texturspalte wird einzeln perspektivisch projiziert (eigene Tiefe, eigene Höhe, Zbuffer-Test). Hängematte: `span [1,0]`, Enden bei ±1 Feld = Stammmitte der Palmen (3,10)/(5,10). Achtung: Sprite-Texturen sind hochskaliert (TN = 128), Umrechnung `tx * 64 / TN`.
- Headless aus sechs Blickwinkeln gerendert (Süd, Südost, Ost, Nordost, Südwest, Nord): Enden sitzen überall an den Stämmen. Nicht auf Gerät getestet.

### 0.32.1 – Nachtrag 5 (20.11.2026, 22:20; headless, nicht auf Gerät getestet)
- Nutzer: „Brückengelände verbessern. Schriftzug Brücke kaum lesbar. Heller.“ → `genRail` neu (Pfosten alle 16 px, Handleiste, Mittel- und Fußleiste, Pfostenkappen, hellere Hölzer), `genPlanks` Grundhelligkeit 2.6→3.2 (gilt für alle Bohlenböden, auch Hütte/Steg), Brückenschild `style: iron` (helle Kreideschrift mit dunkler Kontur statt grauer Meißelschrift auf Stein), Wandtitel kurzer Wörter größer (`s` bis 2.9 statt 2.3). Ursache „BRICKE“: Ü-Punkte (Spalten 1/3) verschmolzen mit dem Buchstaben; jetzt Spalten 0/4 plus Leerzeile (Ä, Ö, Ü).
- Nutzer: „Keine eigene Schatzinselkarte, soll hier zu sehen sein.“ Entscheidung des Nutzers (Rückfrage): besuchte Insel als Ausschnitt (halbe Zellgröße, ab Feld 24/3) im See der Moorsee-Karte; auf der Insel bleibt die Inselkarte. Umsetzung `drawMap` (main.js) über `g.areas.schatzinsel.seen`. Nicht auf Gerät geprüft, Canvas nicht headless gerendert (nur Syntax und Tests).
- Nutzer: Teufel-Verwandlung siehe Nachtrag 3; Hängematte siehe Nachtrag 4. Frage „Wann Überfall“ beantwortet (nur Position/Blickrichtung des Gegners, kein Zufall).

### 0.32.1 – Nachtrag 6 (20.11.2026, 22:35; headless, nicht auf Gerät getestet)
- Nutzer (Screenshot Würfelhaus von außen): „Hütte optimieren, hat kein Dach.“ Der Raycaster hat keine Dachgeometrie (Decke nur von innen sichtbar). Lösung: in `drawWall` (render.js) wird für niedrige Wände im Bereich `hall.low` bei Blick von außen (`viewIn` = Spieler nicht in `hall.low`) über der Wandkante ein Dachstreifen gemalt: Höhe ≈ halbe Wandhöhe, rote Schindeln (`blood`), versetzte Reihen, hellerer First, Traufschatten. Gilt auch für den Spielsalon. Kein echtes 3D-Dach (kein Giebel, keine Schräge); von sehr nah oder aus der Ecke wirkt es als Streifen. Headless aus vier Blickwinkeln gerendert.

### 0.32.1 – Nachtrag 7 (20.11.2026, 22:40; headless, nicht auf Gerät getestet)
- Nutzer (Kartenbild Moorsee): „Fluss nicht gerade durch das Bild.“ Deutung (Vermutung): Der Fluss verlief als 3 Felder breites, senkrechtes Band (x 11–13). Jetzt mäandriert er (linke Kante je Zeile 1–17: 12,12,13,13,12,11,11,[11,11 Brücke],11,10,9,9,10,11,12,12); Brücke (Zeilen 8–9, x 11–13) und Schilder/Geländer unverändert, Breite 3, Reihen verbunden. Erreichbarkeit per Skript geprüft (alle 341 Bodenfelder verbunden), Objekte liegen nicht im Wasser. Test „Moorsee“ an neue Koordinaten angepasst (Wasser (12,1), Spieler (12,3)). Alte Spielstände: erkundete Felder bleiben gespeichert, Karte kann an neuen Ufern kleine Lücken zeigen.

### 0.32.1 – Nachtrag 8 (20.11.2026, 22:50; headless, nicht auf Gerät getestet)
- Nutzer: „Geländer sieht immer noch schlecht aus. Brückenboden aus Stein. Geländer mit Fackel ausstatten.“ → Bodenart `s` (floorGrid 6, `genPaving`, Steinplatten 2×2 je Feld, Karte grau `#77705f`); Moorsee-Brücke (Zeilen 8–9, x 11–13) hat Steinboden, der Steg der Fähre bleibt aus Holz. `genRail` neu: steinerne Brüstung mit Deckplatte und Fugen (`railBlock`); Rail-Objekte mit `torch: true` (rail_n11, rail_s11, rail_n13, rail_s13) nutzen `genRailTorch` (hoher Pfosten mit Fackelschale und Flamme, Sprite-Maßstab 1.0, nicht animiert). Hinweis: Fackel-Flamme flackert nicht (Sprite).
- Nutzer: „Hinweisschilder zur Schatzinsel.“ (Bild: Steingang, Ort nicht gesichert, vermutlich Moorpfad). Drei Wandschilder, Stil `iron` (helle Kreideschrift; Stil `arrow` mit schwarzer Schrift war auf Moos/Stein unlesbar): `sign_pfad_insel` (Moorpfad 21/6, Westwand, „SEE → INSEL“), `sign_s_insel1` (Moorsee 4/7, „INSEL →“), `sign_s_insel2` (Moorsee 15/8, „INSEL →“). Weitere Orte (z. B. Stadt, Eingang Moorpfad) nach Wunsch.

### 0.32.1 – Nachtrag 9 (20.11.2026, 23:00; headless, nicht auf Gerät getestet)
- Nutzer: „Fuhrmann ist nicht gerade in einer Flucht zur Brücke.“ Deutung (**Vermutung**): Brücke ist 2 Felder breit (Zeilen 8–9), der Steg war nur 1 Feld (Zeile 8) → Versatz um ein halbes Feld. Jetzt Steg x 20–22 auch in Zeile 9 (Bohlen); Fuhrmann bleibt (23,8), Boot (23,9) im Wasser. Falls etwas anderes gemeint war (z. B. Fuhrmann mittig im Blick), Foto/Stelle erfragen.
- Nutzer: Beim Versuch ins Wasser zu gehen soll ein Hinweis erscheinen, dass man nur anders auf die Insel kommt. Neues Gebietsfeld `waterMsg` (logic.js `tryMove`): Moorsee: „… Zur Schatzinsel kommt man nicht durchs Wasser: Der Fuhrmann am Steg im Osten setzt euch über.“ Gilt für das ganze Wasser im Moorsee (auch Fluss); übrige Gebiete behalten den Standardtext. Test ergänzt.

### 0.32.1 – Nachtrag 10 (20.11.2026, 23:10; headless, nicht auf Gerät getestet)
- Nutzer: „Haus sieht aus wie ein Bungalow. Soll Spitzdach haben.“ Das Dach aus Nachtrag 6 (flacher Streifen) ist jetzt ein Satteldach (render.js `drawWall`): Wände längs der x-Achse (Nord/Süd) zeigen ein Giebeldreieck (Höhe bis 1,25 Wandhöhen in der Mitte der Hütte `hall.low`, Spitze mittig, senkrechte Bretter, rotes Randbrett), Ost/West-Wände zeigen die Dachfläche (rote Schindeln), deren sichtbare Höhe mit dem Blickwinkel steigt (`|rdx|/|rd|`; von der Seite bis zum First, in Längsrichtung kaum). First hell. Kein echtes 3D: Dachflächen sind Spaltenbänder; aus extremen Winkeln und aus der Nähe können Kanten ungenau wirken. Hütte ist 5 Felder breit (x 7–11), 6 tief (y 4–9) – die Firstrichtung (Ost-West-Wand = Giebel) ist fest.

### 0.32.1 – Nachtrag 11 (20.11.2026, 23:30; headless, nicht auf Gerät getestet)
- Nutzer (Screenshot Tür „HALLE“): „Mehr Türvarianten und unterschiedliche Schriftarten im Spiel.“ Deutung (**Vermutung**): Türen und Wand-/Türtitel in der 3D-Welt, nicht die Oberflächenschrift (Menüs/Dialoge, CSS) – falls auch die gemeint ist, bitte melden.
- Türvarianten: Objektfeld `look` an Türen (`DOOR_LOOKS` in render.js: plank = klassisch, eisen, stein, bogen, gold, gitter, morsch). Wand-IDs `20 + 2·Index (+1 verschlossen)`, Funktion `doorWall(o)`, Texturen `genDoorV`, Karte/Spiel unverändert (Typ `door`). 30 Türen in game.json zugewiesen (Moorpfad-Gruft Stein; Kultgruft Bogen/Gitter/Gold; Schratgrube morsch; Nebelturm Bogen/Stein/Gold; Festung 1 Eisen; Festung 2 Mix; Festung 3 Gold/Stein/morsch/Gitter/Bogen). Offene Tür (Rahmen-Sprite) bleibt einheitlich Holz. Die Moos-Flecken der morschen Tür erscheinen je Palette teils bräunlich (Beobachtung im Test, nicht korrigiert).
- Schriften: `FONTMODES` (block, bold, thin, slant, wide, tall, wavy, shadow); Schildstil `font` oder Objektfeld `font` (Türen/Schilder) wählt die Schrift in `genPlaque`; je Gebiet zugewiesen (Moorpfad/Kultgruft breit, Schratgrube dünn, Nebelturm schräg, Festung 1 fett, Festung 2 wackelig, Festung 3 hoch; einzelne Türen fett/dünn). `shadow` sieht aktuell wie `block` mit dickeren Strichen aus. `syncStatic` zieht `look`/`font` für alte Spielstände nach. Test ergänzt (138 grün).

## 0.32.2 (20.11.2026, 23:00; headless, nicht auf Gerät getestet)
- Inventar: „Ausrüsten“ öffnet die Heldenauswahl unter der Liste; main.js scrollt jetzt per scrollIntoView dorthin (Handler `eqsel:`). VERSION in main.js und sw.js 0.32.2. Tests 138 grün.
- Offen auf Gerät: Scrollt das Fenster nach „Ausrüsten“ so, dass die Heldenknöpfe sichtbar sind?
- Kette der Gier (amulett_gier, Einzigartig): Fluch laut game.json Verteidigung −2, Angriff −1 (wirkt immer, Anzeige erst nach erstem Tragen oder Talent „Geheimes“ ≥ 25); Nutzen Gold +40 % aus Kämpfen.
- Entdeckte Falle (genTrap 'seen' in render.js): Ausrufezeichen ca. 7×20 statt 13×35 Pixel, Farbe blood (rot), Warnstreifen am Boden entfernt. Deutung von „Querelen ganz weg“ = Querbalken/Streifen: Vermutung. Offen auf Gerät: passt Größe/Farbe?
- Glücksamulett: scanLuck reagiert nur auf Truhen mit `hidden: true`. Gesetzt (nach Lage hinter secret-/illusion-Objekten, teils Vermutung bei Trugwand-Truhen): chest_g_secret, chest_g_real, chest_g_ill (kultgruft), chest_t_secret (nebelturm), chest_s_ill, chest_s_ill2 (schratgruben). Nicht gesetzt: chest_s_plate (Zugang unklar). Neue versteckte Truhen brauchen `hidden: true`. Beschreibung des Amuletts angepasst; Test erweitert.
- Schratgruben (Nutzer: „Gänge verwinkelter“, Umfang: nur Schratgruben): 29 Felder zu Wand, 4 Felder (15–18,8) als Umgehung der Mittelachse geöffnet; kein Objekt verschoben. Erreichbarkeit aller Objekte per Skript geprüft, tests.js und analyzeLevel grün. Der Kopfschnitt-Render war nicht aussagekräftig; Sicht im Spiel nicht geprüft, nicht auf Gerät getestet. Offen: Kultgruft, Nebelturm, Festung nicht angefasst.
- Nebelturm door_turm: `textless: true`, die rote Türschrift entfällt, der Wegweiser (sign) bleibt.
- Türen schließen: interact() schließt eine geöffnete Tür im Feld vor der Gruppe (`open=false`), außer Gegner/Person steht darin. Deutung von „bekomme ich auch wieder durch anrippen zu“ als Wunsch: Vermutung. Neuer Test, 139 grün.
- Offene Türen: genDoorFrame(title, style, seed, look) nutzt Material je look (stein→stone, eisen/gitter→iron, sonst Holz). Tippen auf eine offene Tür im Feld vor der Gruppe (tapUseByTap) = schließen. Türtitel s 1.8–2.6 (vorher 1.5–2), FONTMODES-rad ca. +0.1, wavy wave 0.5. Nicht auf Gerät getestet; Headless-Render der Archivtür war nicht aussagekräftig (Blickwinkel).
- Fix: genDoorFrame (offene Tür) bekam den Titel trotz `textless`; jetzt leer. Gold-Tür offen bleibt Holz mit Eisenband (Frame-Material nur stein/eisen/gitter abweichend). Nicht auf Gerät getestet.
- festung2 door_k_gaenge: `sym: schaedel` + `textless` statt Text „KNOCHEN-|GÄNGE“ (gleicher Weg wie die Würfeltür). Nicht auf Gerät getestet; Headless-Bild nicht aussagekräftig.

## 0.33.0 (21.11.2026; headless, nicht auf Gerät getestet)
Auftrag des Nutzers (21.11.2026): Gefangener in der Zelle, fliehende/rufende Gegner, Deko in den Gängen und Hallen (in jedem Gebiet), neues Spinnengebiet. VERSION in main.js und sw.js 0.33.0. Keine neuen Dateien (ASSETS unverändert). Tests 145 grün. BALANCE.md und SIM.md neu erzeugt (sim.js kennt Flucht/Verstärkung nicht und unterschätzt die neuen Gegner daher leicht; CAMPAIGN enthält festung4).
Deutungen (Vermutungen, vom Nutzer nicht bestätigt): „dwe Zellen“ = „der Zelle“ (ein Gefangener in einer Zelle der Kultgruft); „Kopfhörer“ = „Kopfhöhe“ (Wandnischen) und wurde nicht als Gerät umgesetzt; „Keine Bilder mehr in den Gängen“ = die zwei Gemälde-Dekos entfernt, Kratzbild (graffiti) in der Kultgruft bleibt; Deko „in jedem Gebiet“ beantwortet vom Nutzer, aber selten.
- **Gefangener Tilo** (Kultgruft, `npc_zelle` (10,11), Dialog `zellengast`): erzählt sein Leben als Gruftknecht und warum er in der Zelle sitzt (Ewiglicht-Kerze ausgeblasen), Befreiung per „Riegel zurückschieben“ (der Zellenraum ist durch das Skelett `en_g4` bewacht), kleines Dankeschön (Brot, kleiner Trank, 15 Gold), danach `again`-Gespräch (Leben in der Gruft, Kult). Neuer Dialog-Effekt `look` (npc.look + `lookSet`, damit `syncStatic` das Aussehen nicht zurücksetzt) und `heal` (Prozent LP für wache Helden).
- **Kampftaktik** (`enemies.<id>.tactic = { flee: {below, chance}, call: {below, chance, kind, max?} }`, Prozent der Höchst-LP): Flucht ersetzt den Zug, der Gegner hat 0 LP und `fled`, bringt weder Gold, EP noch Beute, zählt als besiegt (löst Raserei der anderen aus); Bosse fliehen nie. Ruf holt `kind` in einen freien/toten Platz (höchstens drei Einträge), der Neue kommt in derselben Runde direkt nach dem Rufer dran; `max` (Standard 1) Rufe je Gegner. Belegt: Wolf, Kultist, Moorlicht, Brandmagier, Blutdiener (fliehen); Kultwächter (ruft Skelett), Kultpriester (Moorlicht), Vampirbrut (Blutdiener), Riesenspinne/Netzwächter (Brutspinne), Spinnenkönigin (Brutspinne, bis 3×). Bestiarium merkt `fled`.
- **Deko** (Skript, Objekt-IDs `dk_<gebiet>_…`): Wandschmuck als `sign` mit `deco` = `rohr`, `gitter` (kniehoher Gitterschacht), `nischeleer` (neue genDeco-Arten), Fässer (`decor` fass) in großen Hallen, Geröllhaufen (`decor` schutt, neuer Sprite) an Gangenden. Nicht auf Start-/Treppenzielen, nicht neben Objekten, Verbindungen bleiben erhalten (Test). Gemälde `deco_t1` (Nebelturm), `deco_f1` (Festung 1) entfernt.
- **Spinnenhöhle** (`festung4`, 76×54, Palette `spinne`, `foe` 330/240): erreicht über die neue Treppe `stairs_b_spinne` (Blutgruft (56,22), ersetzt den Platzhalter `exit_b_tiefe`) / `stairs_s_up`. Höhlenbauart (Blobs, Tunnel, Säulen, Flechten), sechs Netze: Objekt `gate` mit `web: true` (Wand WALL_WEB, Gitter-Logik, durch Dagegenlaufen/◉ durchtrennt; `analyzeLevel` zählt Netze als öffenbar). Netze sind Engpässe (Test). Gegner: Brutspinne, Netzwächter (neu), Riesenspinne, Boss Spinnenkönigin (`en_s_boss`, Phasen Brutwelle/Raserei, ruft Brut, Gifthauch angekündigt). Drei Eingesponnene (Sprite `kokon`): Orwin (Händler, Dank), Bruder Alder (Kultbruder: freilassen mit EP und Rat „Feuer“ — Flag `spinne:schwaeche` nur als Marke, noch ohne Wirkung — oder hängen lassen, später umentscheidbar), Selka (Heilerin, bleibt, heilt einmal 60 % und einmal 40 %). Ausgang am Ende: `exit_s_tiefe` (Platzhalter „späteren Version“, ersetzt den alten Ausgang der Blutgruft; der Abschluss-Test prüft jetzt diesen).
- Offen auf Gerät (nichts bestätigt): (1) Zelle in der Kultgruft: Tilo erzählen, befreien, Dank. (2) Kämpfe: Flucht-/Hilferuf-Meldung, Anzeige bei 3 Gegnern nach Ruf. (3) Deko: Rohr/Gitter/Nische an der Wand sichtbar, Fässer in Hallen, Geröll am Gangende, Gänge ohne Bilder. (4) Treppe Blutgruft → Spinnenhöhle, Netz durchtrennen, Eingesponnene, Königin. (5) Sieht Geröll/Kokon/Königin gut aus? (6) Kampfschwierigkeit der Höhle.
- Offen/Ideen: Flag `spinne:schwaeche` ist noch ohne Spielwirkung; Fackeln der Höhle spärlich; Deko-Anzahl nach Gefühl nachstellen.

## 0.34.0 (22.11.2026; headless, nicht auf Gerät getestet)
Auftrag des Nutzers (21.11.2026): „Baue jetzt schonmal nächste version mit Taverne, etc.“ VERSION in main.js und sw.js 0.34.0. Keine neuen Dateien (ASSETS unverändert). Tests 147 grün. Playwright-Rauchtest (nicht auf Gerät): Taverne öffnen, anwerben, tauschen ohne Fehlermeldung. Gegner-/Heldenwerte unverändert, BALANCE.md/SIM.md deshalb nicht neu erzeugt.
Entscheidungen des Assistenten (vom Nutzer delegiert, hier begründet): Reserve bekommt 50 % der Gruppen-EP (`data.tavern.reserveXp`; „langsamer“ wie gewünscht, aber noch lohnend); Anwerben kostet 40 + 20 × Durchschnittsstufe Gold; der Neue kommt mit Durchschnittsstufe (abgerundet) und den EP dieser Stufe in die Reserve (Talentpunkte unverteilt); Taverne als eigenes Gebiet (`taverne`, 11×6) über Treppe `stairs_taverne` (Siedlung (3,4)); Reservehelden heilen nicht von selbst (kein Gratis-Heilen durch Tauschen).
- **Taverne „Zum Letzten Licht“** (`taverne`, Palette `festung`, Wirtin Marga `npc_wirt` mit Sprite `haendler2`, Dialog `wirt`, Deko Kamin/Regal/Fässer/Tische/Stühle aus vorhandenen Sprites). Dialogwahl-Feld `tavern: true` öffnet die Gruppenverwaltung (`openTavern` in main.js).
- **Reserve** (`state.reserve`, höchstens `RESERVE_MAX` = 4, gleiche Heldenfelder; fehlt das Feld = leer, Altstände bleiben gültig, kein Versionssprung). `validateState` prüft Reserve wie die Gruppe (gemeinsame Funktion `checkHero`). `grantXp` gibt der Reserve `data.tavern.reserveXp` % (auch bei bewusstloser Gruppe, Meldung nur bei Aufstieg).
- **Logik** (logic.js): `recruitCost`, `partyAvgLevel`, `recruitHero` (Fehler: in-combat, full, name, name-bad, name-taken, spec, gold; Namen eindeutig über Gruppe + Reserve, Groß-/Kleinschreibung egal; Neue haben id `n<Zähler>` über `state.hid`), `swapHero` (Ausrüstung des Gehenden geht ins Inventar; mindestens ein Held muss vorn stehen, sonst `no-front`), `dismissReserve` (Verabschieden, Ausrüstung ins Inventar). Alle nicht im Kampf.
- **Oberfläche**: Fenster „Taverne – Gruppe verwalten“: Gruppe („Tauschen“ wählt Platz), Reserve („Einwechseln“, „Verabschieden“ mit zweitem Tipp „Wirklich?“), Anwerben (Name, Rasse, Beruf inkl. Alchemist, Preis). Bildlauf bleibt nach Aktionen erhalten; Speicherstand „auto“ nach jeder Änderung. Dev-Hook `S.fn.openTavern` (nur `?dev`).
- **Alders Rat wirkt**: `enemies.<id>.flagFx = [{flag, resist:{element:±n}, callChance:±n, msg}]`; `startCombat` kopiert aktive Einträge in `e.fx`, `enemyOf` rechnet sie ein (Spieldaten bleiben unverändert). Belegt: Spinnenkönigin mit `spinne:schwaeche`: Feuer-Widerstand −30 (also noch anfälliger), Hilferuf-Chance −25 (40 → 15 %), Startmeldung im Kampf.
- Offen auf Gerät (nichts bestätigt): (1) Treppe in der Siedlung zur Taverne und zurück. (2) Wirtin ansprechen, Fenster lesbar auf dem Handy (Bildlauf, Tastatur beim Namen). (3) Anwerben, Reserve, Einwechseln/Tauschen inkl. Ausrüstung im Beutel. (4) Reserve bekommt EP nach einem Kampf. (5) Speichern/Laden mit Reserve. (6) Spinnenkönigin nach Alders Rat: Startmeldung, Feuer wirkt stärker, weniger Rufe.
- Offen/Ideen: Aushangbrett und Schmied noch nicht gebaut; Talent-Lehrer in der Taverne (Alternative D) bewusst nicht gebaut; Reserve heilt nicht (Idee: Bett gegen Gold); Wirtin-Sprite ist der Händler (eigener Sprite möglich); Taverne-Palette/Optik nicht auf Gerät gesehen. Erinnerung an zurückgestellte Talent-Alternativen B–F: B als Nächstes, D mit Lehrer in der Taverne, C erst nach Balance.

## 0.34.1 (22.11.2026; headless, nicht auf Gerät getestet)
Auftrag des Nutzers: Analyse des bestehenden Spiels (Prüf- und Optimierungsauftrag), danach „Freigabe 1 bis 4“ und „Ja gebietsstart“ (Rückkehr nach Niederlage bleibt am Gebietsstart). VERSION in main.js und sw.js 0.34.1. Keine neuen Dateien. Tests 147 grün, Playwright-Rauchtest (nicht auf Gerät getestet): Kampf startet, Leiste zeigt Grund, Zug wird nicht verbraucht, keine Konsolenfehler.
- **F1 Gründe**: Kampfleiste nutzt statt `disabled` das Attribut `data-why` (+ `aria-disabled`); `onActionBar` zeigt den Text und führt nichts aus. Gründe: zu wenig Mana/Ausdauer (x/y), keine Tränke, volle LP/volles Mana, bewusstlos, nicht vergiftet, Gegner besiegt. `heroAction` unverändert.
- **F2 Dämpfen**: `body.incombat` (gesetzt in `renderLog`) dämpft `#ctl-left .btn` und `.btn[data-a=interact]` auf 35 %. Funktion unverändert. ⚔/✦ rechts bleiben (Daumenreichweite).
- **F3 Leistenhöhe**: `#actionbar .ab` min-height 36 px (vorher 28). Auf dem Gerät noch prüfen: Verdeckung der Gegner.
- **Kommentar** zu `finishVictory` (Wiederbelebung mit 1 LP) korrigiert.
- Entscheidung des Nutzers: Rückkehr nach Niederlage bleibt am Gebietsstart (F5 erledigt, keine Änderung).
- Offen auf Gerät (nichts bestätigt): (1) Fähigkeit ohne Mana antippen: Meldung, Zug bleibt. (2) Bewegungsknöpfe im Kampf gedämpft, danach wieder normal. (3) Leiste höher, Gegner nicht stärker verdeckt (Foto). (4) Gegenstand ohne Vorrat, Heilzauber auf vollen Helden: Grund erscheint.
- Offen/Ideen aus der Analyse: F4 Proviantverbrauch je Gebiet messen (Proviant 6 Gold unbegrenzt in Moorrand und Blutgruft); F6 Kampfspitzen (Turmwache-Gruppen, Blutgruft-Boss laut SIM.md) und Stufenkurve für Akt 3 beachten (Ø Stufe 14,6 beim Betreten der Spinnenhöhle, Simulation); F8 Beschriftung LP/Ausdauer auf der aktiven Heldenkarte (zurückgestellt); Wirkung der Fähigkeit vor dem Einsatz nicht sichtbar (Idee).
- **Gerätetest 22.11.2026 (Nutzer, Galaxy S25):** Selbsttest im Spiel 146 bestanden, 0 fehlgeschlagen (bestätigt auf Nachfrage). 146 statt 147 ist erwartet: der Test „BALANCE.md ist aktuell“ läuft nur in Node. Welche Version geladen war, hat der Nutzer nicht genannt (Titelbild 0.34.1 nicht ausdrücklich bestätigt). Übrige Punkte der Testliste 0.34.1 und 0.34.0 noch offen.
