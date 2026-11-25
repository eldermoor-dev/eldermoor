# CHANGELOG – Die Schatten von Eldermoor

Quelle: HANDOVER.md (Stand 0.19.4, 16.11.2026). Neueste Version oben. Ausführliche Begründungen und Datenformate stehen in HANDOVER.md.
Status: „Gerät“ = vom Nutzer auf dem Galaxy S25 bestätigt. „headless“ = Node/Desktop-Chrome, nicht auf Gerät getestet. 0.16.8–0.16.13: Gesamtmeldung „Es passt alles“ am 16.11.2026.

## 0.47.9 (25.11.2026, headless, nicht auf Gerät getestet)
- Entfluchte Gegenstände (Ysolde) wirken nur noch halb: positive Boni (Angriff/Verteidigung/Initiative, Lebensraub, Ausweichen, Krit, Widerstand, Gold) halbiert, gerundet, mindestens 1; Beschreibung angepasst (Zornklinge +7 → +4). Spieldaten unverändert, wirkt auch in alten Ständen. Preis weiter 100 Gold + mittlerer Heiltrank.
- Taverne „Zum goldenen Eber“: Tür in der Siedlung verschlossen („Wegen Umbau geschlossen“), bis die Schratgruben (3. Gebiet nach dem Moorpfad: Moorpfad, Kultgruft, Schratgruben) betreten wurden. Alte Stände, die die Taverne schon kennen, bleiben offen. Entscheidung des Assistenten (Zählung des 3. Gebiets war nicht eindeutig).
- Händler: begrenzter Vorrat je Gegenstand (Proviant 3, kleine Tränke 3, mittlere 2, große 1, Ausrüstung 1, übrige 2). Nachschub erst 1 Stunde echte Zeit nach dem ersten Verkauf (Zeitstempel im Spielstand, `state.shops`, optional, kein Versionssprung). Anzeige „Vorrat“, „Ausverkauft“ und Restzeit.
- Tests 176 grün. Keine Gegner- oder Heldenwerte geändert; BALANCE.md bleibt, SIM.md erst mit 0.47.10 neu (die Simulation kauft jetzt begrenzt).

## 0.47.8 (25.11.2026, headless, nicht auf Gerät getestet)
- Schriften auf Wänden und Türen: Ursachen belegt am Screenshot „MOORPFAD → GRUFT“ aus der Nähe: (1) Striche waren breiter als das Raster und verschmolzen (M wirkte wie H), (2) dunkle Schrift auf grauem Stein ohne Abhebung, (3) 192-Bild grob vergrößert.
- Jetzt: Wandschilder in 384×384 (statt 192), Strichbreite genau ein Rasterpunkt, helle Schrift (Bernstein oder Eisweiß je Stil) mit dunkler 3-Punkt-Kontur auf dunkler Platte mit hellem Rand und runden Ecken. Türtitel: helle Schrift mit dunkler Kontur (ohne Platte, bleibt auf dem Türsturz). Als Bilder gerendert und angesehen (fünf Stile), nicht auf Gerät.
- Noch offen aus Punkt 14/15/16/17: Schilder von der Decke / am Boden / auf Holzpfosten, Treppenschilder mit Zielebene, Wanddeko, Hebel, Hintergrundgeräusche → 0.48.0.
- Nummerierung: Struktur (7–9) = 0.47.9, Balance (10–13) = 0.47.10, Rest Lesbarkeit/Stimmung = 0.48.0.

## 0.47.7 (25.11.2026, headless, nicht auf Gerät getestet)
- Sumpfwolf: kleiner (Faktor 1,65 → 1,3) und wolfähnlicher neu gezeichnet. Vorher Block-Rumpf, Stelzenbeine und Kamm-Zacken an den Schultern, die wie Hände wirkten (Nutzer: „zu groß und unfertig, wolfähnlicher gestalten“). Jetzt schmale Brust, zottige Halskrause, dünnere Vorderläufe, Hinterkeulen seitlich. Als Bild gerendert und angesehen (Moorpalette), nicht auf Gerät. Werte unverändert.
- Nummerierung: Struktur (7–9) = 0.47.8, Balance (10–13) = 0.47.9, Lesbarkeit (14–17) = 0.48.0.

## 0.47.6 (25.11.2026, headless, nicht auf Gerät getestet)
- Treppen/Ausgänge: Der Gebietswechsel entsteht ausschließlich beim geraden Schritt vom Zugangsfeld auf das Treppenfeld in Eintrittsrichtung. Entfernt: Wechsel durch „Vor“ gegen die Treppenwand, wenn die Gruppe schon (z. B. seitlich) auf dem Treppenfeld steht (aus 0.47.3). Das ist eine VERMUTETE Ursache für das gemeldete „seitliche Hereinziehen“ (Nutzer: besteht weiter bei allen Aufgängen); ein anderer Auslöser ließ sich in der Logik nicht finden (Tests: alle 82 Zugänge × 4 Richtungen).
- Nummerierung: Struktur (7–9) = 0.47.7, Balance (10–13) = 0.47.8, Lesbarkeit (14–17) = 0.48.0.

## 0.47.5 (25.11.2026, headless, nicht auf Gerät getestet)
- Fallen: unentdeckte Falle nochmals unauffälliger (Gerätetest 0.47.4: „immer noch zu leicht erkennbar“). Ursache nachgestellt: Spur war im Material „Stein“ gezeichnet (hebt sich von der Bodenfarbe ab) und als Rechteck (wirkt wie eine Platte). Jetzt Material des Bodens, kein Rechteck, nur zwei kurze unregelmäßige Haarrisse und wenige Staubpunkte (36 Bildpunkte). Als Bild gegen die Bodentextur gerendert und angesehen (Kultgruft-Palette), nicht auf Gerät.
- Nummerierung: Struktur (7–9) = 0.47.6, Balance (10–13) = 0.47.7, Lesbarkeit (14–17) = 0.48.0.

## 0.47.4 (25.11.2026, headless, nicht auf Gerät getestet)
- Fallen: unentdeckte Falle deutlich unauffälliger. 0.47.3 hatte die Platte sichtbarer gemacht (Fehler, Screenshot des Nutzers bestätigt die helle Platte mit Lichtkante). Jetzt keine gefüllte Platte und keine Lichtkante mehr, nur feine, unterbrochene Fugen, zwei kurze Risse und wenig Staub (Fläche transparent). Entdeckte Falle (roter Bodenring) unverändert.
- Nummerierung verschoben: Struktur (7–9) = 0.47.5, Balance (10–13) = 0.47.6, Lesbarkeit (14–17) = 0.48.0.

## 0.47.3 (25.11.2026, headless, nicht auf Gerät getestet)
- Treppen/Ausgänge: Ursache des seitlichen Hereinziehens nachgestellt (Vorwärtsgang parallel zur Wand durch das Treppenfeld; 45 von 82 Zugängen, jetzt 0). Betreten nur noch frontal (`passEntryDirs`); seitlich/parallel gilt als Wand.
- Gefangener Tilo sitzt in eigener 1×1-Zelle (Gittertür, Schild „ZELLE“).
- Alle Steinhaufen („schutt“) ersatzlos entfernt.
- Fallen: entdeckte Falle = flache rote Bodenmarkierung (Ring + liegendes „!“) statt hohem Zeichen in Bildmitte; unentdeckte Platte etwas sichtbarer.
- Rast im Dungeon: neues Bild „Nachtlager im Gang“ (Decken auf dem Boden, Laterne, keine Betten); Taverne behält ihre Zimmerbilder.
- Schatzkarten bei Marga schon im Erstgespräch kaufbar.

## 0.47.2 (25.11.2026, headless, nicht auf Gerät getestet)
- Taverne: Ankunft von der Siedlung jetzt bei (7,6) mit Blick durch den freien Mittelgang zur Wirtin (vorher (5,3) mit Blick auf Tresen/Stühle).

## 0.47.1 (25.11.2026, headless, nicht auf Gerät getestet)
- Kampf: Der ≡-Knopf in der Mitte ist entfernt (mehr Bild). Das Kampfprotokoll steht jetzt im Menü („Kampfprotokoll“).

## 0.47.0 (25.11.2026, headless, nicht auf Gerät getestet)
- Vorgeschichte: Pergamentseite „Eine verlorene Wette“ (Magister Quillon) direkt beim ersten Bild nach „Neues Spiel“ (nicht beim Laden). Text in game.json `story.intro`.
- Neues Gebiet „Moorlichtung“ zwischen Testgewölbe und Siedlung (Treppe hinauf). Der Moorschrat steht jetzt dort in einer Nische abseits des Wegs (umgehbar, Test per Pfadsuche).
- Runenstein im Testgewölbe: Geschichte des Labyrinths als Pergamentseite beim ersten Berühren, danach Kurztext; Eintrag im Notizbuch.
- Hedda wiederholt Marga nicht mehr, greift die Wette auf und gibt Hinweise auf Quillon und die Gruft.
- Balance nach höchstem erreichten Akt (game.json `balance`): Akt 1 Gold ×0,9 / EP ×0,95 / Preise ×1,15; Akt 2 ×0,75 / ×0,85 / ×1,35; Akt 3 ×0,6 / ×0,75 / ×1,6. Preise nur beim Kaufen. Simulation (1000 Läufe): „klug“ schafft die Kampagne 58 % (vorher 72 %), Ø Stufe 13,8 (vorher 14,5).
- Tests/Sim: Standardgegner en1 wird nachgerüstet; neuer Test für Staffelung, Lichtung, Runenseite, Vorgeschichte (173 grün).

## 0.46.5 (25.11.2026, headless)
- Taverne: Der Kamin war eingemauert (Vase bei 12,3 plus Hexe bei 12,5 versperrten alle Zugänge). Vase nach 12,2 versetzt; Kamin und alle Gäste sind jetzt von der Tür aus erreichbar. Neuer Test prüft die Erreichbarkeit.

## 0.46.4 (25.11.2026, headless)
- Taverne-Gäste neu geschrieben: Fuhrmann Jorn, Schwester Ilka, Händler Dorn, Alchemistin Brisa, Söldner Karn. Eigene Geschichten, Kosten (Krug, Rat), Gegengift-Geschenk, Einträge ins Notizbuch mit Spielhinweisen, die Marga nicht nennt. Jeder Gast erinnert sich (zweites Gespräch kürzer).

## 0.46.3 (25.11.2026, headless)
- Taverne: Die fünf Gäste und der Kamin lassen sich mit ◉/Antippen ansprechen (kurze Gespräche mit wahren Spielhinweisen: Aushangbrett, Flüche/Hexe, Schatzkarten, Geheimwände, Rasten). Alte Spielstände werden umgestellt.

## 0.46.2 (25.11.2026, headless)
- Schilder „SCHLEUSE“ (Zisterne) und „ESSE“ (Gießerei) liegen nicht mehr auf einer Wandfackel (je zwei Felder versetzt). Alle anderen Schilder geprüft: keine weitere Überdeckung.

## 0.46.1 (25.11.2026, headless)
- Kampfleiste: Knopf „Protokoll“ ist jetzt ein kleines ≡-Symbol (36 px) statt einer ganzen Zeile.

## 0.46.0 (25.11.2026, headless)
- Sechs neue verfluchte Gegenstände in Truhen (Zornklinge, Stab der leeren Kammer, Panzer der Schwere, Witwenschleier, Ring des Hungers, Aschenamulett).
- Hexe Ysolde in der Taverne entflucht bekannte Gegenstände für 100 Gold und einen mittleren Heiltrank; der Nutzen bleibt.
- Gefangener: Wunsch „Wissen: Karte der Gruft“ gibt zusätzlich eine Skizze, die einen Geheimraum in der Blutgruft zeigt; er sagt „Gute Wahl“ und erklärt es.
- Treppen lösen nur noch beim frontalen Betreten aus, nicht beim seitlichen Vorbeigehen.
- Brum hat eine eigene Figur (Schmied mit rotem Bart).

## 0.45.0 (25.11.2026, headless)
- „Valdis' Waffenstand“ heißt jetzt „Valdis' Waffenkammer“. Sortiment: Tränke, Gegengift, Proviant und nur noch fünf Meisterwaffen (Orkspalter, Steinherzstab, Mondsilberbogen, Tüftlerstab, Lichtbringer), je nur für eine Rasse-Klasse-Kombination, 1300–1600 Gold.
- Neue Regel `races` bei Gegenständen: Spezialwaffen lassen sich nur von der passenden Rasse und Klasse anlegen.

## 0.44.0 (25.11.2026, headless)
- Fässer in den Dungeons lassen sich mit ◉ zerschlagen. Inhalt zufällig: leer, Proviant oder Trank, Gold, Ausrüstung, Monster (Kampf), Explosion, Teleport, Giftnebel oder Heilwein. Taverne-Fässer bleiben Einrichtung.
- Erzkäfer neu gezeichnet: Dornenpanzer, vier rote Augen, große Zangen, kräftige Beine.

## 0.43.1 (25.11.2026, headless)
- Taverne außen: keine Holzfassade im Raum mehr, nur noch eine Tür in der Wand mit Holztäfelung und Namensschild „GOLDENER EBER“.

## 0.43.0 (25.11.2026, headless)
- Schatzkarten: höchstens 3 je Besuch; neuer Besuch erst eine Stunde (Echtzeit) nach dem ersten Kauf. Marga weist darauf hin.
- Marga erklärt beim ersten Gespräch Rast, Zimmer, Ausgang und das Kartenlimit.
- Rast zeigt ca. 5 s ein animiertes Bild der Schlafkammer in Margas Herberge mit den schlafenden Helden (vier Zimmer im Wechsel, neue Datei scene.js). Tippen überspringt.

## 0.42.0 (25.11.2026, headless)
- Aushang in der Taverne: viele verschieden große, schiefe Zettel mit Nadeln und Siegeln statt des Schriftzugs „AUS-HANG“.
- Wirtin Marga bekommt ein eigenes Bild (Haarknoten, Schürze, Bierkrug) statt des Händlerbilds.

## 0.41.0 (25.11.2026, headless)
- Elitegegner: etwa 12 % der normalen Gegner (nie Bosse, nie Truhenmaul) sind Elite (★ vor dem Namen) mit einer Eigenschaft: wütend, zäh, flink oder giftig. Doppelte EP und Gold. Auswahl fest je Gegnerobjekt, Weglaufen ändert nichts.
- Bestiarium: Meisterschaft je Gegnerart (10 und 25 Siege, einmalig Bonus-EP). Neu im Menü: Erfolge (Extraräume, Karten, Steckbriefe, Elite, Meisterschaft), je drei Stufen, abgeleitet aus dem Spielstand.
- SIM.md neu erzeugt (Elite fließen in die Simulation ein).

## 0.40.0 (25.11.2026, headless)
- Schatzkarten: Wirtin Marga verkauft je besuchtem Gebiet eine Karte (150–400 Gold, zehn Gebiete: Moorpfad bis Festung 6). Mit Karte zeigt die Gebietskarte ein rotes Kreuz an einer Wand; ◉ öffnet sie. Dahinter liegt ein Extraraum mit Truhe (bessere Ausrüstung, Tränke, Gold). Ohne Karte ist die Wand eine gewöhnliche Mauer.
- Steckbriefe: Aushangbrett in der Taverne (Tafel an der Westwand und Wahl bei Marga). Drei Zettel gleichzeitig, 17 Aufträge (Gegner erlegen, Trophäe beschaffen, seltene Waffe/Rüstung abgeben). Belohnung: Erfahrung für alle wachen Helden, dazu etwas Gold. Neue Zettel nach etwa 60 Schritten; Abreißen möglich.
- Moorpfad: fünf Mauerzeilen unten angefügt (Platz für den Extraraum); alte Spielstände bleiben gültig.

## 0.39.0 (25.11.2026, headless)
- Taverne „Zum goldenen Eber“: Holzfassade in der Siedlung, größere Schankstube mit Tresen, Weinregalen, Weinfässern und Gästen an Tischen, Zimmer gegen Gold (heilt auch die Reserve).

## 0.38.1 (25.11.2026, headless)
- Hindernis-Meldungen: Einrichtung (Fass, Schutt, Tisch usw.) heißt nicht mehr „Ein Gegner steht im Weg“.

## 0.38.0 (25.11.2026, headless)
- Zisterne: Flutkampf an der Mittelinsel (Wasser steigt je Runde, Pumpenhahn im Pumpenhaus schaltet ihn ab), Schleusenwart vor dem Pumpenhaus (zahlen, überreden oder kämpfen), Runentruhe im Pumpenkeller (drei Wandplatten in fester Reihenfolge).

## 0.37.6 (24.11.2026, headless)
- Karte: Tippen auf ein Feld nennt den Raumnamen (bisher nur in der Zisterne beschriftet).

## 0.37.5 (24.11.2026, headless)
- Bossbeute stärker: Blutgräfin, Spinnenkönigin, Teufel würfeln aus Stahl-/Runen-/Schuppen-/Plattenausrüstung (mind. Gut), Gießmeister und Quellhüterin aus vier neuen Stücken (Kriegsklinge, Arkanstab, Bollwerkpanzer, Schattenschuppe, mind. Selten).

## 0.37.4 (24.11.2026, headless)
- Schlackenwächter bekommt ein eigenes Bild (Schlackengolem mit Hammer), nicht mehr das der Turmwache.

## 0.37.3 (24.11.2026, headless)
- Truhenmaul ist immun gegen Blutung (neues Feld `immune` an Gegnern).

## 0.37.2 (24.11.2026, headless)
- Hüterstatuen (Zisterne): Satz wird beim Ansprechen automatisch ins Notizbuch eingetragen, Hinweis „✔ Im Notizbuch eingetragen“ im Dialog; Wahl „Den Satz merken“ entfällt.

## 0.37.1 (24.11.2026, headless)
- Gießmeister Harkon hat ein eigenes Bild: Gießer im silbernen Hitzeschutzanzug mit goldorangem Gesichtsschild und rotglühender Eisenstange (vorher Hauptmann-Figur mit blauem Ring). Keine Wertänderung.

## 0.37.0 (24.11.2026, headless)
- Neues Gebiet „Die Zisterne“ (Akt 2, Keller 6, 100×64): Wasserhalle mit Stegen und vier Hüterstatuen, Pumpenhaus, Schleusen, Wächter- und Kerkerkammer, Archiv, Kanalnetz (Labyrinth) und Sickerhalle. Erreicht über die Treppe am Ende der Gießerei (ersetzt den Platzhalter-Ausgang).
- Rätsel: vier Statuen, genau eine lügt; ihre Hand gibt den Quellschlüssel zur Quellkammer. Hebel öffnet Schleusengitter, Fackelschalter öffnet Geheimkammer, zwei Illusionswände, falsche Truhen.
- Neuer Boss Quellhüterin Maris (angekündigte Flutwelle, Heilung, Phasen), neuer Ring der Tiefe, neue Palette „zisterne“. Lösbarkeitsprüfung zählt Schlüssel aus Gesprächen. Werte: BALANCE.md/SIM.md neu erzeugt. Spielstände unverändert gültig (v6).

## 0.36.0 (23.11.2026, headless)
- Neues Gebiet „Die Gießerei“ (Akt 2, Keller 5, 84×60, größer als die Spinnenhöhle): Hallenbauart mit langer Säulenhalle, drei Kammern im Norden und drei im Süden. Erreicht über die Spalttreppe am Ende der Spinnenhöhle (ersetzt den Platzhalter-Ausgang).
- Rätselkette: Ofenschlüssel (Süd 1) → Schmelzerkammer (Nord 3) → Gießmeisterschlüssel → Tor zum Gießmeister. Hebel in Nord 1 öffnet das Gitter zur Schatzkammer, Fackelschalter in Nord 2 öffnet eine Geheimkammer, Süd 2 ist ein falscher Schatzraum (Truhe ist Monster).
- Händler Brum (Werkbank) am Eingang. Neue Gegner: Schlackenwächter, Boss Gießmeister Harkon (Phasen, Ruf, angekündigte Glutwelle/Gussflut). Neuer Ring der Esse. Neue Palette „glut“.
- Spielstände unverändert gültig (v6). Werte: BALANCE.md/SIM.md neu erzeugt.

## 0.35.1 (22.11.2026, headless)
- Talente: Die zweiten Wege der 18 ★-Talente haben jetzt eigene Grundwerte (statt derselben wie Weg A), z. B. Giftklinge statt Glückspilz-Werte, Rauchbombe mit Initiative statt Leben. Weg A bleibt unverändert. Werte geschätzt, nicht simuliert.

## 0.35.0 (22.11.2026, headless)
- Neues Notizbuch im Menü (über dem Bestiarium): Tafeln, Inschriften, Runenstein, Risse in Wänden, Gitter-Hinweise, Händler- und Murmel-Hinweise sowie Alders Rat werden beim Lesen/Hören automatisch eingetragen, je Gebiet geordnet, jeder Hinweis nur einmal.
- Händler: Die Warenliste springt beim Kaufen und Verkaufen nicht mehr nach oben, man kann direkt weiterkaufen.
- Hinweis-Toast nennt „Ins Notizbuch eingetragen“. Alte Spielstände laden (Notizbuch leer). Enthält 0.34.2. Werte unverändert.

## 0.34.2 (22.11.2026, headless)
- Treppen neu gezeichnet: Stufen in Perspektive mit Wangen, Trittflächen und Setzstufen; hinab dunkel, hinauf mit Licht.
- Nebelturm: Treppe zur Vorburg liegt vor der Ostwand (25,12) und erscheint als Wandbild statt als dünne Platte; Rückweg landet bei (24,12).
- Gegnerfiguren atmen nicht mehr (kein Größerwerden/Wackeln). Werte unverändert.

## 0.34.1 (22.11.2026, headless)
- Kampfleiste: nicht verfügbare Aktionen (Fähigkeit ohne Mana/Ausdauer, Gegenstand ohne Vorrat, Heilung bei vollen LP) sind gedämpft und nennen beim Antippen den Grund. Kein Zug wird verbraucht.
- Im Kampf sind Drehen, Vor, Zurück, Seitwärts und Interagieren gedämpft (Funktion unverändert, Hinweis beim Antippen bleibt).
- Aktionsleiste etwas höher (36 statt 28 px, vor Skalierung), bessere Treffsicherheit.
- Kommentar zur Wiederbelebung nach dem Sieg korrigiert. Keine Regel- und Wertänderung, Spielstände unverändert.

## 0.34.0 (22.11.2026, headless)
- Neue Taverne „Zum Letzten Licht“ in der Siedlung (Treppe links unten), Wirtin Marga verwaltet die Gruppe.
- Bis zu vier Reservehelden; sie bekommen 50 % der Erfahrung. Heldentausch jederzeit außerhalb von Kämpfen, Ausrüstung des Gehenden landet im Beutel. Mindestens ein Held bleibt in der Vorderreihe.
- Neue Helden anwerben (Name, Rasse, Beruf, auch Alchemist): Kosten 40 + 20 × Durchschnittsstufe Gold, Stufe = Durchschnitt der Gruppe. Reservehelden lassen sich verabschieden.
- Alders Rat wirkt: Die Spinnenkönigin ist mit dem Hinweis anfälliger für Feuer und ruft seltener Brut.
- Tests: 147 (zwei neue). Werte unverändert, BALANCE.md/SIM.md unverändert.

## 0.33.0 (21.11.2026, headless)
- Neues Gebiet unter der Blutgruft: Spinnenhöhle (76×54) mit durchtrennbaren Netzen, Netzwächtern, Brutspinnen, Boss Spinnenkönigin und drei eingesponnenen Menschen (Händler, Kultbruder, Heilerin) mit unterschiedlichen Folgen.
- Gefangener Tilo in der Kultgruft: erzählt sein Leben im Gewölbe, kann befreit werden, dankt und bleibt ansprechbar.
- Kämpfe: manche Gegner fliehen bei wenig LP (keine Beute), manche holen Verstärkung (bis drei Gegner).
- Deko in jedem Gebiet: Abflussrohre, kniehohe Gitterschächte, leere Wandnischen, Fässer in großen Hallen, Geröllhaufen an Gangenden. Gemälde in den Gängen entfernt.
- Gegner/Balance: neue Gegner Brutspinne, Netzwächter, Spinnenkönigin; BALANCE.md und SIM.md neu.

## 0.32.2 (20.11.2026, headless)
- Entdeckte Falle: Warnzeichen kleiner (ca. 55 %), rot statt gelb, Warnstreifen darunter entfernt.
- Glücksamulett spürt nur noch versteckte Truhen (hinter Geheim- oder Trugwand, Flag `hidden`) und vergrabene Schätze; normale Truhen lösen nichts aus.
- Schratgruben verwinkelter: Hallen mit Mauerblöcken zu Knicken umgebaut, Hauptgang mit Umweg (U-Knick bei x15–18), Sackgassen-Nische oben rechts; alle Objekte weiter erreichbar (Test grün).
- Nebelturm: Tür zum Thronsaal ohne rote Schrift (doppelt zum Wegweiser links).
- Geöffnete Türen lassen sich per ◉/Antippen wieder schließen (nicht, wenn ein Gegner oder eine Person im Türfeld steht).
- Türen: offene Tür im Material der geschlossenen (Steintür bleibt grau, Eisentür eisern; vorher immer braunes Holz). Tippen auf die offene Tür davor schließt sie wie das Öffnen. Türtitel größer, Schriften kräftiger, wackelige Schrift ruhiger.
- Offener Türrahmen zeigt bei `textless`-Türen (Thronsaal) keine rote Schrift mehr.
- Festung 2: Tür „Knochengänge“ zeigt einen Totenkopf statt kaum lesbarer Schrift.
- Inventar: Nach „Ausrüsten“ scrollt das Fenster automatisch zur Heldenauswahl.

## 0.32.1 (20.11.2026, headless)
- Sechs neue Türvarianten (Eisen, Stein, Bogen, Gold, Gitter, morsch) und acht Schriftarten für Schilder und Türtitel, auf die Gebiete verteilt.
- Hütte: Satteldach mit Giebeldreieck statt flachem Dachstreifen.
- Moorsee: Steg zwei Felder breit (in Flucht mit der Brücke); Wasser-Hinweis auf den Fuhrmann.
- Brücke: Steinboden, steinerne Brüstung, Fackeln an den Eckpfosten; drei Hinweisschilder zur Schatzinsel.
- Moorsee: Fluss mäandriert statt gerade (Brücke bleibt).
- Hütte von außen mit rotem Schindeldach.
- Brücke: dichteres, helleres Geländer, hellere Bohlen, Schild „BRÜCKE“ hell und größer, Ü-Punkte lesbar.
- Moorsee-Karte zeigt die besuchte Schatzinsel als Ausschnitt im See.
- Hängematte als echte Strecke zwischen den Palmen gezeichnet (perspektivisch pro Spalte), von jeder Seite an den Stämmen befestigt.
- Verwandlung in den Teufel/Spielsalon jetzt bei der ersten Niederlage ab dem 2. Spiel (vorher nur genau im 2. Spiel).
- Hängematte fest zwischen den Palmen verankert und tiefer gehängt (headless geprüft).
- Schatzinsel: Kakteen versetzt, alle Inselfelder erreichbar (Test neu); Stuhl der Hütte versetzt.
- Hängematte tiefer; Blockhüttenwand heller (innen nicht mehr schwarz).
- Murmel: Hinweistext nach dem ersten Sieg nennt das Glücksamulett und weckt Neugier.
- Hütte kleiner (3×4) und wohnlich: Küchenecke, Vase, Teppich, drei Wandbilder.
- Glücksamulett ausrüstbar: Krit +4 %, Fallen erkennen +10, spürt Truhen und Vergrabenes (3 Felder, Karte). Kein Gold mehr.
- Menü: Einstellungen und Bestiarium getauscht.
- Haustür schließt sich hinter der Gruppe, Würfelsymbol auf der Tür. Boot neu gezeichnet. Wege hinter der Hütte breiter.

## 0.32.0 (20.11.2026, headless)
- Würfelspiel mit Murmel (Einsatz, drei Würfel, einen neu werfen, Best of 3); Glücksamulett erst nach dem 2. Sieg; Niederlage im 2. Spiel verwandelt Murmel in einen Teufel und die Hütte in einen Spielsalon. Insel mit Kakteen und Hängematte zwischen zwei Palmen.

## 0.31.14 (20.11.2026, headless)
- Fuhrmann am Moorsee: ab der zweiten Überfahrt anderer Text, Preis 10 statt 20 Gold, mit Spruch.

## 0.31.13 (20.11.2026, headless)
- Würfelhaus: Schild mit zwei weißen Würfeln statt Text, Namensschild entfernt; Insel 19×19, Hütte mit 5×5-Innenraum, Holzboden und Möbeln (Bett, Kamin, Regal, Tisch, Stuhl, Fässer); Alt-Spielstände werden repariert.

## 0.31.12 (20.11.2026, headless)
- Spielstand lädt wieder, wenn die Gruppe auf der umgebauten Insel stand (Gruppe kommt zum Start).

## 0.31.11 (20.11.2026, headless)
- Schatzinsel: Sandboden, Palmen, vergrabener Schatz (Schurke/Alchemist bemerken ihn); Brückengeländer steht jetzt längs der Brücke.

## 0.31.10 (20.11.2026, headless)
- Schatzinsel: dunkelbraune Blockhütte (Innenraum 1 Feld), Insel entsprechend kleiner, Schilder in Kreideschrift.

## 0.31.9 (20.11.2026, headless)
- Truhen sehen je Gebiet verschieden aus (Material) und zeigen drei Wertstufen (einfach, gut, selten).

## 0.31.8 (20.11.2026, headless)
- Gnom auf der Schatzinsel heißt Murmel, Namensschild neben der Haustür.

## 0.31.7 (20.11.2026, headless)
- Schatzinsel: doppelt hohe Decke, Häuschen in normaler Höhe als Fachwerkhaus (5 × 5); Türschriftzug entfernt.

## 0.31.6 (20.11.2026, headless)
- Schriftfarbe je Schildstil, Symbole (Brücke, Fähre, Sarg, Kerker), Geländer an der Moorsee-Brücke.

## 0.31.5 (20.11.2026, headless)
- Schild „HOLZTOR“ entfernt; alle Wand-/Türschriften schwarz, eckige Druckbuchstaben, ohne Tropfen.

## 0.31.4 (20.11.2026, headless)
- Tipp auf „Inventar“ löst keine Rast mehr aus (Schutzzeit 350 ms gegen durchgereichte Tipps in neuen Fenstern).

## 0.31.3 (20.11.2026, headless)
- Gegnergruppen stehen mittig im Bild, auch neben einer Wand.

## 0.31.2 (20.11.2026, headless)
- Wandschrift „EISENTOR“ am Moorpfad-Tor zu „HOLZTOR“ (es ist eine Holztür).

## 0.31.1 (20.11.2026, headless)
- Tränke im Kampf auch über Inventar → „Benutzen“ (Held am Zug).

## 0.31.0 (20.11.2026, headless)
- Talentwahl: jedes ★-Talent hat zwei Wege (18 Alternativen), nur einer lernbar. Autospeichern alle 10 Minuten (nicht im Kampf).

## 0.16.x (Inhaltsphase, Nebelturm und Nacharbeiten)
| Version | Änderungen | Status |
|---|---|---|
| 0.30.1 | Inventar bleibt offen, wenn „Rasten“ gesperrt ist (Gegner nah); Meldung nur nach Tipp auf Rasten | headless, Gerät offen |
| 0.30.0 | Ausrüstungsübersicht „Wer trägt was“, im Inventar „Besser für: …“, ▲/▼ und „trägt X“ beim Ausrüsten (Flüche bleiben verborgen) | headless, Gerät offen |
| 0.29.0 | Ringe und Amulette (je Held 1+1, einzigartig, nur Boss/Rätsel), verfluchte Stücke mit Talent-Erkennung, Gefangener mit Wunsch + Ring in der Blutgruft, Waffenhändler Valdis | headless, Gerät offen |
| 0.28.0 | Moorsee: Fluss mit Brücke, See mit Steg, Fuhrmann (20 Gold) zur Schatzinsel, Gnom mit Würfelspiel (gerade Glücksamulett, ungerade Riesenspinne), Wasser/Bohlen im Raycaster und auf der Karte | headless, Gerät offen |
| 0.27.0 | Keller 2 „Blutgruft“: rote Palette, größere Ebene, Vampire (Diener, Brut, Gräfin), Zauberart Blutbiss (Lebensraub), Treppe aus dem Keller; sim.js bis Blutgruft | headless, Gerät offen |
| 0.26.7 | Kellertreppe „Tiefe“ steht an der Ostwand statt frei im Raum | headless, Gerät offen |
| 0.26.6 | Standpfeil auf der Karte größer, mit schwarzem Rand | headless, Gerät offen |
| 0.26.5 | Gegnergruppen stehen enger zusammen | headless, Gerät offen |
| 0.26.4 | Unentdeckte Falle im Bild dezenter (kleiner, kontrastärmer) | headless, Gerät offen |
| 0.26.3 | Gegner im Gang mit einer Wand: zwei nebeneinander, dritter dahinter; Bram: Bart neu; Wundkultist: Strich im Gesicht weg | headless, Gerät offen |
| 0.26.2 | Türen lassen sich aus 2 Feldern Abstand per Antippen öffnen (nicht Riegeltüren); Tests 126 | headless, Gerät offen |
| 0.26.1 | Eigene Bilder für Begegnungspersonen (Torfstecher Bram, Wachmann Gerwin, Wundkultist), nicht mehr Händlerin oder Gegnerbilder; Tests 125 | headless, Gerät offen |
| 0.19.18 | Truhen neu gezeichnet (gewölbter Deckel, Eisenbänder mit Nieten, Goldschloss, Maserung, 128 px, scharf); Beute in Truhen gekürzt (weniger Gold und Tränke, weniger Ausrüstung, niedrigere Qualitätsstufen); Bodenspur der Fallen dezenter; Tests 103 | headless, Gerät offen |
| 0.19.22 | Nebelhüter neu (Nutzer: „zu sehr Strichmännchen“): breiter Geisterkönig mit Eiszackenkrone, Stachelschultern, Rippen und leuchtendem Siegel in der Brust, Knochenklauen, Kristallstab, gezackter Mantelsaum, hoher Dornenthron mit Schädeln; Tests 103 | headless, Gerät offen |
| 0.19.21 | Nebelturm: Moos an den Wänden jetzt dunkelgrün statt blassblau-weiß (sah wie eine schlecht gemachte Geheimtür aus); Tests 103 | headless, Gerät offen |
| 0.19.20 | Turmwache neu (Vollplatte, Gitterhelm mit Flügeln, Stachelschultern, Turmschild mit Dellen/Nieten, Speer, Blutspuren, zerrissener Umhang) und Kultpriester neu (Spitzhaube mit drittem Auge, Goldsaum, rote Stola mit Zeichen, schwebendes Zauberbuch, Schädelstab mit Frostkugel, Räuchergefäß); Tests 103 | headless, Gerät offen |
| 0.19.19 | Hauptmann: Schwert sichtbar in der Faust (dunkler Handschuh, helle Fingerglieder, Daumen, Stulpe); andere Hand hält drohend einen blauen Ring hoch (Arm gereckt); Tests 103 | headless, Gerät offen |
| 0.19.17 | Hauptmann: goldener Ring auf der Brust (Mitte) entfernt; Tests 103 | headless, Gerät offen |
| 0.19.16 | Totenschädel im Siegelkreis am Schwertknauf bekommt blaue Augen; Tests 103 | headless, Gerät offen |
| 0.19.15 | Hauptmann-Schwert sieht wie ein Schwert aus (Spitze, Hohlkehle, helle Schneide, gebogene Parierstange, umwickelter Griff); Tests 103 | headless, Gerät offen |
| 0.19.14 | Hauptmann: Augen blau (neues Palettenmaterial `ice`, 80 Farben); Tests 103 | headless, Gerät offen |
| 0.19.13 | Hauptmann: Schwert kleiner, Totenschädel im Siegelkreis am Knauf, Boss insgesamt kleiner (Faktor 1,12); Schrift im Türrahmen (Türschwelle) jetzt ebenfalls Blutrot statt Gold; Blutschrift weniger verzerrt; Tests 103 | headless, Gerät offen |
| 0.19.12 | Hauptmann bleibt gepanzert; Siegelzeichen auf der Klinge jetzt Totenschädel mit gekreuzten Knochen (Deutung der Nutzerangabe); Tests 103 | headless, Gerät offen |
| 0.19.11 | Ausrüsten: gewählte Zeile hervorgehoben, Abfrage mit Qualität im Namen, Auswahl schließt nach dem Anlegen; Hauptmann (Siegel-Boss) größer mit Dornenkrone, Hörnern, Schulterdornen, Ketten, Siegel auf der Klinge, zerfetztem Umhang, Blut; Blutschrift von Hand geschmiert mit Tropfen; Tests 103 | headless, Gerät offen |
| 0.19.10 | Heller: Standard-Helligkeit „Sehr hell“ (1,8), neue Stufe „Maximal“ (2,4); bestehende Einstellung unter 1,8 wird einmalig auf 1,8 angehoben (Einstellungen v3); Tests 103 | headless, Gerät offen |
| 0.19.9 | Fallen früher erkennbar: Bodenspur als graue, rissige Platte mit Staub (vorher kaum sichtbar); zwei Entdeckungswürfe je Falle (2 Felder und 1 Feld Abstand, für alle Gruppen), Grundchance 35 → 45 %; Tests 103 | headless, Gerät offen |
| 0.19.8 | Schriftzüge in Blutrot mit dunkler Kontur statt dunkelbraun (neues Palettenmaterial `blood`, 72 Farben); Tests 103 | headless, Gerät offen |
| 0.19.7 | Gegnergruppen im engen Gang bleiben zwischen den Wänden (Seitenabstand begrenzt, äußere Figuren gestaffelt); Tests 103 | headless, Gerät offen |
| 0.19.6 | Meldungsfeld: außerhalb des Kampfes max. 2 Meldungen à 2 Zeilen, blenden nach 3–6 s aus (Blick auf den Gang frei); Tests 103 | headless, Gerät offen |
| 0.19.5 | Wölfe größer; Schriftzug düster (klein, rostbraun, abgeplatzt, Laufspuren); Karte zoom- und verschiebbar per Fingergeste; Tests 103 | headless, Gerät offen |
| 0.19.4 | Weniger Truhen am Anfang, Starttruhe bescheidener, Truhen- und Gegnerbeute seltener hochwertig; besondere Truhen bleiben stark | headless, Gerät offen |
| 0.19.3 | Wölfe größer, Zweiergruppen weiter auseinander | headless, Gerät offen |
| 0.19.2 | Sumpfwolf von vorn, Gegnergruppen ohne Überschneidung (kleiner, neue Abstände) | headless, Gerät offen |
| 0.19.1 | Heldenleiste: Namen nicht mehr abgeschnitten, Reihe unter dem Porträt, Werte einzeilig (Mana blau, Ausdauer gelb) | headless, Gerät offen |
| 0.19.0 | Bewegliche Steine (schieben, ziehen), Druckplatten, Rätselraum in den Schratgruben, Geheimkammer in der Kultgruft; Tests 103 | headless, Gerät offen |
| 0.18.0 | Blutung und Fluch, sechs Kombinationsangriffe, Fallen (entdecken, untersuchen, entschärfen, Talent), fünf Fallen mit Wandhinweis; Tests 102 | headless, Gerät offen |
| 0.17.0 | Talente (72, Stufe 15), Alchemist, Schwierigkeit Normal/Schwer, mittlere Gebiete schwerer, Bosse ganz im Bild, Nebelhüter mit Thron; Tests 99 | headless, Gerät offen |
| 0.16.17 | Kampfbild: Blick zum Boden geneigt + Größenanpassung; Eck-Treppen nur ein Bogen; Gegnergruppen auch im Gang nebeneinander; Tests 93 | headless, Gerät offen |
| 0.16.16 | Moorkultist neu (192 px: Widderhörner, Reißzähne, Sägedolch, Zauberhand, Augen-Siegel) und Moorlicht neu (Flamme mit Geistergesicht, Greifarme, Funken); Tests 93 | headless, Gerät offen |
| 0.16.15 | Kampfdistanz wieder 1 Feld (nur gerade Nachbarfelder, Kamera weicht im Kampf nicht mehr zurück); Treppen/Bögen/Ausgänge an Wänden als Wand-Abziehbild statt frontalem Bild; Tests 93 | headless, Gerät offen |
| 0.16.14 | Schilder schärfer: Schrift bei allen Schriftarten dicker, einzeilige Titel bis Faktor 4, Tafelbreite begrenzt; Fix: Türen aus alten Spielständen übernehmen `style` und `title` aus game.json (vorher Zufallsstil); Tests 93 | headless, Gerät offen |
| 0.16.13 | Sumpfwolf neu (vierbeinig, schwarz, grüne Moosflecken, 1,3× größer); Gruppe wendet sich beim Kampfstart dem Gegner zu; Sperrmeldung beim Drehen nennt die Kampfknöpfe; „kann nicht angreifen“ nicht nachstellbar (Ursache offen); Tests 91 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.12 | Neue Kampffiguren: Skelett, Kultwächter, Turmwache, Hauptmann, Sumpfwolf, Moorkultist (128×128, Umriss, leuchtende Augen); Tests 90 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.11 | Schilder, Türschilder, Türrahmen scharf (192×192); 9 Stile (Holz, dunkel, Stein, Eisen, Moos, Pfeil, Bogen, Banner, klein); Tests 89 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.10 | Gegner entdecken die Gruppe (Sichtlinie bis 2 Felder, Überfall wenn nicht in Blickrichtung, keine Ausnahmen); Tests 89 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.9 | Ankunftsrichtung: nach Übergängen kein Blick gegen die Wand (`arrivalDir`) | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.8 | Wandtafeln als Abziehbild an der Wand (`face`), lesbar per Tippen/◉; Türschilder (8 Türen); offene Tür bleibt als Rahmen mit Türblatt; Tore drehen sich nicht mehr beim Vorbeigehen (`axis`); Abziehbilder gespiegelt (keine Spiegelschrift); Tests 87 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.7 | Kampagnen-Simulation (sim.js Abschnitt C); Nebelgeist, Kultpriester, Nebelhüter schwerer; neuer Gegner Turmwache; Debug „Dieses Gebiet zurücksetzen“; Tests 86 | Gerät: „passt“ (Nebelhüter) |
| 0.16.6 | Kartenlegende neben bzw. unter der Karte, kein eigenes Fenster | Gerät: „passt“ |
| 0.16.5 | Gruppen im engen Gang gestaffelt; offene Truhe neu gezeichnet; Runenstein im Testgewölbe (`runestone`); Hedda per Antippen; Tests 84 | Gerät: „passt“ |
| 0.16.4 | Fix Kopf antippen (`#party` pointer-events); Monster/Truhen größer über der Leiste (Horizont-Verschiebung); Bossphasen als Banner; Rast-Regel (Sicht, 10 Schritte Weglänge); Kartenlegende; Truhen-Wächter (`chest.guard`); Hinweis beim erneuten Betreten des Ausgangs; Tests 83 | Gerät: „passt“ |
| 0.16.3 | Hedda neu gezeichnet | Gerät: ok |
| 0.16.2 | Charakterkopf antippen (Zaubern/Heilen); Gegnerzauber-Schaden begrenzt (50 %/40 % der Max-LP); Debug: Gebiet wechseln, Alle +1 Stufe | Gerät: Kopf-Tipp ging nicht (behoben in 0.16.4) |
| 0.16.1 | Geheimwand-Prototyp (`secret`), versteckter Schalterstein; Nebelturm-Kammer südlich des Archivs; Tests 78 | Gerät: ok |
| 0.16.0 | Priester heißt Kleriker; Gegnerzauber (`cast`, angekündigt/unangekündigt); Nebelturm mit Nebelhüter (3 Phasen); Tests 77 | Gerät: ok |

## 0.15.x
| Version | Änderungen |
|---|---|
| 0.15.17 | Eigene Sprites für Moorschrat und Grubenschrat |
| 0.15.16 | Händler: Rede groß und mittig, danach Shop direkt; Schrat-Bosse geglättet |
| 0.15.15 | Heilziel per Heldenkopf (Inventar, Kampf) |
| 0.15.14 | Angekündigte schwere Angriffe treffen nur die Vorderreihe, solange dort jemand steht |
| 0.15.13 | Kampf: Hinweistext beim Knopf „Gegenstand“, wenn nichts nutzbar ist |
| 0.15.12 | Karte: Türen als Balken quer zum Gang |
| 0.15.11 | Einstellung „Helligkeit der Umgebung“ (Standard Hell) |
| 0.15.10 | Kampf: Gegenstände nur für den aktiven Helden, nur an sich selbst |
| 0.15.9 | Schilder: Platzhalter-Linien entfernt, Schrift geglättet |
| 0.15.8 | Sprechende NPCs: große Sprechblase |
| 0.15.7 | Karte passt ohne Scrollen |
| 0.15.6 | Monster-Sprites im Modus Scharf geglättet |
| 0.15.5 | Schilder mit lesbaren Titeln (5×7-Pixelschrift) |
| 0.15.4 | Händler-/Inventarzeilen: Knopf rechts, Symbole vor Gegenständen |
| 0.15.3 | Ausgänge als Runenstein statt Goldring |
| 0.15.2 | Gegenlaufen/Antippen benutzt Tür, Truhe, Hebel, Gitter; Boss-Sprite Schrat |
| 0.15.1 | Auftrittsbanner (Boss/Gebiet); Fallgitter und Hebel; Ölflasche, Gegengift |
| 0.15.0 | Bedienung: Top-Leiste entfernt, Menü-Feld, Kompass; geöffnete Truhen begehbar; Hauptmann 160 LP; Gebiet Schratgruben; Erzkäfer; Boss Grubenschrat |

## 0.14.x
| Version | Änderungen |
|---|---|
| 0.14.8 | Pfeil im Schlussstein der Treppen entfernt |
| 0.14.7 | Treppen-Sprites neu (Steinbogen mit Treppe) |
| 0.14.6 | Grafik schärfer/glatter (256er Wände, 128er Boden/Decke), Moos neu, Wandfackeln |
| 0.14.5 | Tafeln: höchstens 2 Felder Abstand |
| 0.14.4 | Bestiarium: Elementtexte „anfällig/resistent“ |
| 0.14.3 | Fix Gruppenbild im Kampf (Bild nach Art, nicht nach Platz) |
| 0.14.2 | Tafeln per Antippen lesbar, schärferes Schild |
| 0.14.1 | Treppen neu gezeichnet |
| 0.14.0 | Kultgruft mit Zwischenboss Hauptmann; neue Gegner Skelett, Kultwächter; Treppenarten |

## 0.13.0 – 0.5.0
| Version | Änderungen |
|---|---|
| 0.13.0 | Moorpfad, Hinweistafeln, Moorlicht, Auftrag bei Hedda; `syncStatic` für alte Stände |
| 0.12.0 | Händlerin Hedda und Siedlung am Moorrand |
| 0.11.0 | Fehlerlog, Verkaufen |
| 0.10.0 | Beutesystem, Speicherstand v6 |
| 0.9.1 | Warnung vor Schwerem Schlag (Balken, Ton, Vibration) |
| 0.9.0 | Bossphasen, Bestiarium |
| 0.8.0 | Mehrere Gebiete, Treppen, Speicherstand v5 |
| 0.7.1 | Tests erweitert (46) |
| 0.7.0 | Runenzauber, Elemente, Brennen/Verlangsamt |
| 0.6.0 | Ausrüstung (Waffe, Rüstung) |
| 0.5.0 | Rast und Proviant |

## 0.4.x und älter
| Version | Änderungen |
|---|---|
| 0.4.6 | Doppeltipp-Schutz (450 ms); Schritt 3 abgeschlossen |
| 0.4.5 | Gegnerfigur antippen wählt das Ziel |
| 0.4.4 | Gegnerfenster links, halbtransparent |
| 0.4.3 | Zielwahl: größere Tippflächen |
| 0.4.2 | Gruppenfiguren zeigen nur lebende Gegner |
| 0.4.1 | Fix Zielwahl (`S.target` → `S.foe`) |
| 0.4.0 | Gegnergruppen bis 3, Zielwahl, „Alle“, neue Gegner, Rechenweg |
| 0.3.2 | Bewusstlose verlieren Statuswirkungen |
| 0.3.1 | Statuswirkungen Gift, Betäubt, Schwach |
| 0.3.0 | Ressourcen und Fähigkeiten je Beruf |
| 0.2.2 | Stufen, EP, BALANCE.md |
| 0.2.1 | Charakteransicht, Zufällige Gruppe |
| 0.2.0 | Gruppeneditor, Rassen und Berufe, Spielstand v2 |
| 0.1.5 | Bildschärfe Scharf/Retro |
| 0.1.4 | Monster-Sprite neu |
| 0.1.3 | Layout `fitStack()` |
| 0.1.2 | Kampfprotokoll, Zugbalken, Geräusche einzeln abschaltbar |
| 0.1.1 | Fackelflackern als Einstellung |

Detailwerte und Begründungen stehen nur in HANDOVER.md. Plan: 0.16.17 Nebelhüter neu + Thron, 0.16.18 mittlere Gebiete schwerer, 0.17 Talente.
