# HANDOVER – Die Schatten von Eldermoor

Autor: eldermoor-dev · Stand: Version 0.19.5 (17.11.2026). Auf dem Galaxy S25 vom Nutzer bestätigt: 0.16.3, die Testliste 0.16.4–0.16.7 („passt“) und nach Gerätetest am 16.11.2026 auch 0.16.8–0.16.13 („Es passt alles“, Gesamtmeldung, siehe Abschnitt „Gerätetest 0.16.8–0.16.13“). Versionsübersicht: CHANGELOG.md. Ältere Einträge unten sind chronologisch, neueste am Ende.

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
