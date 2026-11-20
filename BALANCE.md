# Balancetabelle – Die Schatten von Eldermoor

Wird aus `game.json` erzeugt (`balanceMarkdown` in logic.js), nicht von Hand ändern. Alle Zahlen sind **vorläufig** (vom Assistenten gesetzt, nicht im Spiel mit Spielern gemessen). Feinabstimmung in Schritt 4 (Balance-Simulation).

Kampfwerte = Berufswert + Rassenmodifikator + Wachstum je Stufe: `floor((Stufe − 1) × Wachstum / 10)`, Wachstum in Zehnteln pro Stufe. Untergrenzen: LP 1, Angriff 1, Verteidigung 0, Initiative 0.

## Erfahrung

| Stufe | EP gesamt | EP für diese Stufe |
|---|---|---|
| 1 | 0 | – |
| 2 | 100 | 100 |
| 3 | 250 | 150 |
| 4 | 450 | 200 |
| 5 | 700 | 250 |
| 6 | 1000 | 300 |
| 7 | 1400 | 400 |
| 8 | 1900 | 500 |
| 9 | 2500 | 600 |
| 10 | 3200 | 700 |
| 11 | 4000 | 800 |
| 12 | 5000 | 1000 |
| 13 | 6200 | 1200 |
| 14 | 7600 | 1400 |
| 15 | 9200 | 1600 |

Gegner (EP: jeder Held, der nach dem Kampf nicht bewusstlos ist, bekommt die volle Summe):

| Gegner | LP | Angriff | Verteidigung | Initiative | EP | Gold | Verhalten |
|---|---|---|---|---|---|---|---|
| Moorschrat | 80 | 13 | 3 | 5 | 120 | 15 | Schweren Schlag jeden 3. Zug, angekündigt (170 %); Treffer: Gift 30 %; Boss, Phasen: Wutrausch ab ≤ 60 % LP (Angriff 15), Letzte Kraft ab ≤ 25 % LP (Angriff 17) |
| Sumpfwolf | 26 | 9 | 1 | 8 | 35 | 6 | zielt auf den schwächsten Helden; Raserei, wenn ein Verbündeter fällt (+25 % Angriff); Treffer: Blutung 25 % |
| Moorkultist | 20 | 7 | 2 | 4 | 30 | 8 | zielt bevorzugt auf Heiler; Treffer: Schwach 35 % |
| Moorlicht | 18 | 6 | 0 | 10 | 28 | 5 | zielt auf die Hinterreihe; Treffer: Verlangsamt 40 % |
| Gruftskelett | 24 | 9 | 2 | 6 | 40 | 6 | zielt auf den schwächsten Helden |
| Kultwächter | 34 | 10 | 5 | 3 | 55 | 14 | zielt auf die Hinterreihe; Wache: deckt Verbündete (−25 % Schaden); Schildstoß jeden 4. Zug, angekündigt (150 %) |
| Kultwächter-Hauptmann | 160 | 13 | 5 | 5 | 220 | 40 | zielt auf den schwächsten Helden; Richtspruch jeden 3. Zug, angekündigt (160 %); Treffer: Schwach 35 %; Boss, Phasen: Kultruf ab ≤ 65 % LP (Angriff 14), Letzte Bastion ab ≤ 30 % LP (Angriff 16) |
| Erzkäfer | 34 | 11 | 4 | 7 | 45 | 7 | Raserei, wenn ein Verbündeter fällt (+25 % Angriff) |
| Moorschrat | 190 | 13 | 3 | 5 | 200 | 40 | Schweren Schlag jeden 3. Zug, angekündigt (170 %); Treffer: Gift 30 %; Boss, Phasen: Wutrausch ab ≤ 60 % LP (Angriff 15), Letzte Kraft ab ≤ 25 % LP (Angriff 17) |
| Nebelgeist | 62 | 16 | 3 | 9 | 70 | 10 | zielt auf die Hinterreihe; Zaubert: Frosthauch (jeden 2. Zug) |
| Kultpriester | 80 | 13 | 4 | 5 | 85 | 16 | Zaubert: Dunkler Segen (jeden 2. Zug), Fluch der Schwäche (jeden 3. Zug) |
| Turmwache | 95 | 17 | 8 | 4 | 100 | 18 | zielt auf die Hinterreihe; Wache: deckt Verbündete (−25 % Schaden); Schildstoß jeden 3. Zug, angekündigt (160 %); Treffer: Verflucht 30 % |
| Nebelhüter | 480 | 26 | 8 | 6 | 320 | 80 | Zaubert: Nebelspeer (jeden 3. Zug, angekündigt); Boss, Phasen: Nebelwand ab ≤ 66 % LP (Angriff 27), Sturm der Schleier ab ≤ 33 % LP (Angriff 28) |
| Truhenmaul | 60 | 12 | 5 | 7 | 120 | 45 | Zuschnappen jeden 3. Zug, angekündigt (170 %); Treffer: Blutung 30 % |
| Brandmagier | 70 | 17 | 3 | 7 | 110 | 20 | zielt auf die Hinterreihe; Zaubert: Feuerball (jeden 4. Zug, angekündigt), Feuerpfeil (jeden 2. Zug) |
| Blutdiener | 60 | 15 | 3 | 6 | 75 | 14 | zielt auf den schwächsten Helden; Treffer: Blutung 30 % |
| Vampirbrut | 95 | 18 | 5 | 8 | 125 | 24 | zielt auf den schwächsten Helden; Zaubert: Blutbiss (jeden 3. Zug) |
| Blutgräfin | 230 | 16 | 7 | 9 | 420 | 160 | Zaubert: Blutbiss (jeden 2. Zug); Boss, Phasen: Blutrausch ab ≤ 66 % LP (Angriff 17), Fledermausschwarm ab ≤ 33 % LP (Angriff 18) |
| Riesenspinne | 80 | 14 | 4 | 9 | 160 | 70 | zielt auf den schwächsten Helden; Giftbiss jeden 3. Zug, angekündigt (160 %); Treffer: Gift 60 % |
| Teufel | 100 | 14 | 5 | 8 | 300 | 150 | zielt auf den schwächsten Helden; Treffer: Verflucht 25 %; Zaubert: Höllenfeuer (jeden 3. Zug, angekündigt); Boss, Phasen: Alles auf Rot ab ≤ 50 % LP (Angriff 17) |

## Rassen (Modifikatoren)

| Rasse | LP | Angriff | Verteidigung | Initiative |
|---|---|---|---|---|
| Mensch | 0 | 0 | 0 | 0 |
| Elf | -2 | 0 | 0 | +2 |
| Zwerg | +4 | 0 | +1 | -1 |
| Ork | +3 | +1 | 0 | -1 |
| Gnom | -3 | 0 | 0 | +1 |

## Berufe (Basis auf Stufe 1, Wachstum in Zehnteln je Stufe)

| Beruf | Reihe | Fernkampf | LP | Angriff | Verteidigung | Initiative | Wachstum LP/Ang/Vert/Init |
|---|---|---|---|---|---|---|---|
| Krieger | vorn | nein | 34 | 8 | 5 | 4 | 60/8/7/3 |
| Schurke | vorn | nein | 24 | 7 | 3 | 7 | 40/8/4/5 |
| Kleriker | hinten | nein | 26 | 5 | 3 | 3 | 45/5/4/3 |
| Magier | hinten | ja | 18 | 8 | 1 | 5 | 30/9/2/4 |
| Waldläufer | hinten | ja | 24 | 7 | 2 | 6 | 40/8/3/5 |
| Alchemist | hinten | ja | 22 | 6 | 2 | 5 | 36/7/3/4 |

## Fähigkeiten und Ressource (vorläufig, Schritt 3a)

Angriff und Verteidigen schenken 1 Punkt Ressource zurück; nach jedem Kampf ist sie voll.

| Beruf | Ressource (Stufe 1 / Stufe 15) | Fähigkeit | Kosten | Wirkung |
|---|---|---|---|---|
| Krieger | Ausdauer 10 / 38 | Wuchtschlag | 4 | 160 % Schaden, 35 % Chance auf Betäubung (Gegner setzt 1 Zug aus). |
| Schurke | Ausdauer 10 / 38 | Hinterhalt | 4 | Trifft immer, 140 % Schaden, vergiftet 3 Runden (2 Schaden je Runde). |
| Kleriker | Mana 12 / 54 | Heilende Hand | 5 | Heilt einen Helden um 20 LP und nimmt Gift und Blutung. |
| Magier | Mana 12 / 54 | Feuerblitz | 5 | Magischer Treffer: 180 % Schaden. 40 % Chance auf Brennen (3 Runden, 3 Schaden je Runde). |
| Waldläufer | Ausdauer 10 / 38 | Gezielter Schuss | 4 | Trifft immer, 150 % Schaden, schwächt 2 Runden (−25 % Angriff). |
| Alchemist | Mana 12 / 48 | Brandflasche | 4 | Wurf mit Feuerschaden: 130 %. 50 % Chance auf Brennen (3 Runden, 2 Schaden je Runde). |

## Werte je Stufe (Mensch, keine Rassenmodifikatoren)

### Krieger

| Stufe | LP | Angriff | Verteidigung | Initiative |
|---|---|---|---|---|
| 1 | 34 | 8 | 5 | 4 |
| 2 | 40 | 8 | 5 | 4 |
| 3 | 46 | 9 | 6 | 4 |
| 4 | 52 | 10 | 7 | 4 |
| 5 | 58 | 11 | 7 | 5 |
| 6 | 64 | 12 | 8 | 5 |
| 7 | 70 | 12 | 9 | 5 |
| 8 | 76 | 13 | 9 | 6 |
| 9 | 82 | 14 | 10 | 6 |
| 10 | 88 | 15 | 11 | 6 |
| 11 | 94 | 16 | 12 | 7 |
| 12 | 100 | 16 | 12 | 7 |
| 13 | 106 | 17 | 13 | 7 |
| 14 | 112 | 18 | 14 | 7 |
| 15 | 118 | 19 | 14 | 8 |

### Schurke

| Stufe | LP | Angriff | Verteidigung | Initiative |
|---|---|---|---|---|
| 1 | 24 | 7 | 3 | 7 |
| 2 | 28 | 7 | 3 | 7 |
| 3 | 32 | 8 | 3 | 8 |
| 4 | 36 | 9 | 4 | 8 |
| 5 | 40 | 10 | 4 | 9 |
| 6 | 44 | 11 | 5 | 9 |
| 7 | 48 | 11 | 5 | 10 |
| 8 | 52 | 12 | 5 | 10 |
| 9 | 56 | 13 | 6 | 11 |
| 10 | 60 | 14 | 6 | 11 |
| 11 | 64 | 15 | 7 | 12 |
| 12 | 68 | 15 | 7 | 12 |
| 13 | 72 | 16 | 7 | 13 |
| 14 | 76 | 17 | 8 | 13 |
| 15 | 80 | 18 | 8 | 14 |

### Kleriker

| Stufe | LP | Angriff | Verteidigung | Initiative |
|---|---|---|---|---|
| 1 | 26 | 5 | 3 | 3 |
| 2 | 30 | 5 | 3 | 3 |
| 3 | 35 | 6 | 3 | 3 |
| 4 | 39 | 6 | 4 | 3 |
| 5 | 44 | 7 | 4 | 4 |
| 6 | 48 | 7 | 5 | 4 |
| 7 | 53 | 8 | 5 | 4 |
| 8 | 57 | 8 | 5 | 5 |
| 9 | 62 | 9 | 6 | 5 |
| 10 | 66 | 9 | 6 | 5 |
| 11 | 71 | 10 | 7 | 6 |
| 12 | 75 | 10 | 7 | 6 |
| 13 | 80 | 11 | 7 | 6 |
| 14 | 84 | 11 | 8 | 6 |
| 15 | 89 | 12 | 8 | 7 |

### Magier

| Stufe | LP | Angriff | Verteidigung | Initiative |
|---|---|---|---|---|
| 1 | 18 | 8 | 1 | 5 |
| 2 | 21 | 8 | 1 | 5 |
| 3 | 24 | 9 | 1 | 5 |
| 4 | 27 | 10 | 1 | 6 |
| 5 | 30 | 11 | 1 | 6 |
| 6 | 33 | 12 | 2 | 7 |
| 7 | 36 | 13 | 2 | 7 |
| 8 | 39 | 14 | 2 | 7 |
| 9 | 42 | 15 | 2 | 8 |
| 10 | 45 | 16 | 2 | 8 |
| 11 | 48 | 17 | 3 | 9 |
| 12 | 51 | 17 | 3 | 9 |
| 13 | 54 | 18 | 3 | 9 |
| 14 | 57 | 19 | 3 | 10 |
| 15 | 60 | 20 | 3 | 10 |

### Waldläufer

| Stufe | LP | Angriff | Verteidigung | Initiative |
|---|---|---|---|---|
| 1 | 24 | 7 | 2 | 6 |
| 2 | 28 | 7 | 2 | 6 |
| 3 | 32 | 8 | 2 | 7 |
| 4 | 36 | 9 | 2 | 7 |
| 5 | 40 | 10 | 3 | 8 |
| 6 | 44 | 11 | 3 | 8 |
| 7 | 48 | 11 | 3 | 9 |
| 8 | 52 | 12 | 4 | 9 |
| 9 | 56 | 13 | 4 | 10 |
| 10 | 60 | 14 | 4 | 10 |
| 11 | 64 | 15 | 5 | 11 |
| 12 | 68 | 15 | 5 | 11 |
| 13 | 72 | 16 | 5 | 12 |
| 14 | 76 | 17 | 5 | 12 |
| 15 | 80 | 18 | 6 | 13 |

### Alchemist

| Stufe | LP | Angriff | Verteidigung | Initiative |
|---|---|---|---|---|
| 1 | 22 | 6 | 2 | 5 |
| 2 | 25 | 6 | 2 | 5 |
| 3 | 29 | 7 | 2 | 5 |
| 4 | 32 | 8 | 2 | 6 |
| 5 | 36 | 8 | 3 | 6 |
| 6 | 40 | 9 | 3 | 7 |
| 7 | 43 | 10 | 3 | 7 |
| 8 | 47 | 10 | 4 | 7 |
| 9 | 50 | 11 | 4 | 8 |
| 10 | 54 | 12 | 4 | 8 |
| 11 | 58 | 13 | 5 | 9 |
| 12 | 61 | 13 | 5 | 9 |
| 13 | 65 | 14 | 5 | 9 |
| 14 | 68 | 15 | 5 | 10 |
| 15 | 72 | 15 | 6 | 10 |

## Alle 25 Kombinationen auf Stufe 1 und Stufe 15

| Rasse | Beruf | Stufe 1 (LP/Ang/Vert/Init) | Stufe 15 (LP/Ang/Vert/Init) |
|---|---|---|---|
| Mensch | Krieger | 34/8/5/4 | 118/19/14/8 |
| Mensch | Schurke | 24/7/3/7 | 80/18/8/14 |
| Mensch | Kleriker | 26/5/3/3 | 89/12/8/7 |
| Mensch | Magier | 18/8/1/5 | 60/20/3/10 |
| Mensch | Waldläufer | 24/7/2/6 | 80/18/6/13 |
| Mensch | Alchemist | 22/6/2/5 | 72/15/6/10 |
| Elf | Krieger | 32/8/5/6 | 116/19/14/10 |
| Elf | Schurke | 22/7/3/9 | 78/18/8/16 |
| Elf | Kleriker | 24/5/3/5 | 87/12/8/9 |
| Elf | Magier | 16/8/1/7 | 58/20/3/12 |
| Elf | Waldläufer | 22/7/2/8 | 78/18/6/15 |
| Elf | Alchemist | 20/6/2/7 | 70/15/6/12 |
| Zwerg | Krieger | 38/8/6/3 | 122/19/15/7 |
| Zwerg | Schurke | 28/7/4/6 | 84/18/9/13 |
| Zwerg | Kleriker | 30/5/4/2 | 93/12/9/6 |
| Zwerg | Magier | 22/8/2/4 | 64/20/4/9 |
| Zwerg | Waldläufer | 28/7/3/5 | 84/18/7/12 |
| Zwerg | Alchemist | 26/6/3/4 | 76/15/7/9 |
| Ork | Krieger | 37/9/5/3 | 121/20/14/7 |
| Ork | Schurke | 27/8/3/6 | 83/19/8/13 |
| Ork | Kleriker | 29/6/3/2 | 92/13/8/6 |
| Ork | Magier | 21/9/1/4 | 63/21/3/9 |
| Ork | Waldläufer | 27/8/2/5 | 83/19/6/12 |
| Ork | Alchemist | 25/7/2/4 | 75/16/6/9 |
| Gnom | Krieger | 31/8/5/5 | 115/19/14/9 |
| Gnom | Schurke | 21/7/3/8 | 77/18/8/15 |
| Gnom | Kleriker | 23/5/3/4 | 86/12/8/8 |
| Gnom | Magier | 15/8/1/6 | 57/20/3/11 |
| Gnom | Waldläufer | 21/7/2/7 | 77/18/6/14 |
| Gnom | Alchemist | 19/6/2/6 | 69/15/6/11 |

## Beute

Erzeugte Ausrüstung: Grundgegenstand zufällig aus Eisenschwert, Eichenstab, Lederharnisch, Kettenhemd. Qualität nach Gewicht; „Boost“ würfelt so oft neu und nimmt die beste.

| Qualität | Gewicht | Anteil | Bonus Hauptwert | Zufallseigenschaften |
|---|---|---|---|---|
| Gewöhnlich | 74 | 74 % | +0 | 0 |
| Gut | 19 | 19 % | +1 | 0 |
| Selten | 6 | 6 % | +1 | 1 |
| Episch | 1 | 1 % | +2 | 2 |

| Eigenschaft | Wirkung | Platz |
|---|---|---|
| des Wolfs | +1–2 Angriff | Waffe |
| des Zorns | +1 Angriff | Rüstung |
| des Falken | +1–2 Initiative | Waffe, Rüstung |
| des Bären | +1–2 Verteidigung | Rüstung |
| des Wächters | +1 Verteidigung | Waffe |

| Gegner | Ausrüstung | Unikat |
|---|---|---|
| Moorschrat | 100 %, Boost 1 | Schratdorn oder Wurzelstab (100 %, nur einmal) |
| Sumpfwolf | 4 % | – |
| Moorkultist | 5 % | – |
| Moorlicht | 3 % | – |
| Gruftskelett | 4 % | – |
| Kultwächter | 8 % | – |
| Kultwächter-Hauptmann | 100 %, Boost 1 | Siegelpanzer oder Nebelmantel (100 %, nur einmal); Siegelring des Hauptmanns (100 %, nur einmal) |
| Moorschrat | 100 %, Boost 1 | Schratdorn oder Wurzelstab (100 %, nur einmal); Moorstein-Amulett (100 %, nur einmal) |
| Nebelgeist | 4 % | – |
| Kultpriester | 8 % | – |
| Turmwache | 8 % | – |
| Nebelhüter | 100 %, Boost 2 | Nebeltränen-Amulett (100 %, nur einmal) |
| Truhenmaul | 100 %, Boost 1 | – |
| Brandmagier | 8 % | – |
| Blutdiener | 6 % | – |
| Vampirbrut | 9 % | – |
| Blutgräfin | 100 %, Boost 2 | Ring der Blutgräfin (100 %, nur einmal) |
| Riesenspinne | 100 %, Boost 1 | – |
| Teufel | 100 %, Boost 2 | – |

## Ausrüstungseffekte und Sets

| Gegenstand | Platz | Werte | Effekt | Set |
|---|---|---|---|---|
| Schratdorn | Waffe | Angriff +4, Init +1 | Lebensraub % 10 | – |
| Wurzelstab | Waffe | Angriff +4, Init +1 | Ressource + 1 | – |
| Siegelpanzer | Rüstung | Vert. +4 | Dornen 3 | – |
| Nebelmantel | Rüstung | Vert. +3, Init +1 | Ausweichen % 8 | – |
| Moorklinge | Waffe | Angriff +3 | Lebensraub % 15 | Moorwächter |
| Moorpanzer | Rüstung | Vert. +3 | Dornen 2 | Moorwächter |
| Nebelstab | Waffe | Angriff +3 | Fähigkeiten % 10 | Nebelweber |
| Nebelrobe | Rüstung | Vert. +2 | Ressource + 1 | Nebelweber |
| Glücksamulett | Amulett |  | Krit % 4, Fallen erkennen 10 | – |
| Siegelring des Hauptmanns | Ring | Angriff +1 | Krit % 6 | – |
| Ring der Last | Ring | Vert. +1 | Schaden − 1 | – |
| Ring der Blutgräfin | Ring | Init +1 | Lebensraub % 12 | – |
| Ring des Befreiten | Ring | Init +1 | Ausweichen % 8, Ressource + 1 | – |
| Ring des Blutdurstes | Ring | Angriff +3 | Lebensraub % 10 | – |
| Moorstein-Amulett | Amulett | Vert. +1 | Statusabwehr % 25 | – |
| Nebeltränen-Amulett | Amulett |  | Ausweichen % 6, Fähigkeiten % 10 | – |
| Kette der Gier | Amulett |  | gold 40 | – |

| Set | Teile | Bonus (alle Teile) |
|---|---|---|
| Moorwächter | Moorklinge, Moorpanzer | Krit % 10, Schaden − 1 |
| Nebelweber | Nebelstab, Nebelrobe | Heilung + 6, Statusabwehr % 25 |
