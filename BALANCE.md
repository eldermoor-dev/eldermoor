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

Gegner (EP: jeder Held, der nach dem Kampf nicht bewusstlos ist, bekommt die volle Summe):

| Gegner | LP | Angriff | Verteidigung | Initiative | EP | Gold | Verhalten |
|---|---|---|---|---|---|---|---|
| Moorschrat | 80 | 13 | 3 | 5 | 120 | 15 | Schweren Schlag jeden 3. Zug, angekündigt (170 %); Treffer: Gift 30 %; Boss, Phasen: Wutrausch ab ≤ 60 % LP (Angriff 15), Letzte Kraft ab ≤ 25 % LP (Angriff 17) |
| Sumpfwolf | 26 | 9 | 1 | 8 | 35 | 6 | zielt auf den schwächsten Helden |
| Moorkultist | 20 | 7 | 2 | 4 | 30 | 8 | zielt auf die Hinterreihe; Treffer: Schwach 35 % |
| Moorlicht | 18 | 6 | 0 | 10 | 28 | 5 | zielt auf die Hinterreihe; Treffer: Verlangsamt 40 % |
| Gruftskelett | 24 | 9 | 2 | 6 | 40 | 6 | zielt auf den schwächsten Helden |
| Kultwächter | 34 | 10 | 5 | 3 | 55 | 14 | zielt auf die Hinterreihe; Schildstoß jeden 4. Zug, angekündigt (150 %) |
| Kultwächter-Hauptmann | 160 | 13 | 5 | 5 | 220 | 40 | zielt auf den schwächsten Helden; Richtspruch jeden 3. Zug, angekündigt (160 %); Treffer: Schwach 35 %; Boss, Phasen: Kultruf ab ≤ 65 % LP (Angriff 14), Letzte Bastion ab ≤ 30 % LP (Angriff 16) |
| Erzkäfer | 34 | 11 | 4 | 7 | 45 | 7 | – |
| Moorschrat | 190 | 13 | 3 | 5 | 200 | 40 | Schweren Schlag jeden 3. Zug, angekündigt (170 %); Treffer: Gift 30 %; Boss, Phasen: Wutrausch ab ≤ 60 % LP (Angriff 15), Letzte Kraft ab ≤ 25 % LP (Angriff 17) |
| Nebelgeist | 62 | 16 | 3 | 9 | 70 | 10 | zielt auf die Hinterreihe; Zaubert: Frosthauch (jeden 2. Zug) |
| Kultpriester | 80 | 13 | 4 | 5 | 85 | 16 | Zaubert: Dunkler Segen (jeden 2. Zug), Fluch der Schwäche (jeden 3. Zug) |
| Turmwache | 95 | 17 | 8 | 4 | 100 | 18 | zielt auf die Hinterreihe; Schildstoß jeden 3. Zug, angekündigt (160 %) |
| Nebelhüter | 480 | 26 | 8 | 6 | 320 | 80 | Zaubert: Nebelspeer (jeden 3. Zug, angekündigt); Boss, Phasen: Nebelwand ab ≤ 66 % LP (Angriff 27), Sturm der Schleier ab ≤ 33 % LP (Angriff 28) |

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

## Fähigkeiten und Ressource (vorläufig, Schritt 3a)

Angriff und Verteidigen schenken 1 Punkt Ressource zurück; nach jedem Kampf ist sie voll.

| Beruf | Ressource (Stufe 1 / Stufe 10) | Fähigkeit | Kosten | Wirkung |
|---|---|---|---|---|
| Krieger | Ausdauer 10 / 28 | Wuchtschlag | 4 | 160 % Schaden, 35 % Chance auf Betäubung (Gegner setzt 1 Zug aus). |
| Schurke | Ausdauer 10 / 28 | Hinterhalt | 4 | Trifft immer, 140 % Schaden, vergiftet 3 Runden (2 Schaden je Runde). |
| Kleriker | Mana 12 / 39 | Heilende Hand | 5 | Heilt einen Helden um 20 LP und nimmt Gift. |
| Magier | Mana 12 / 39 | Feuerblitz | 5 | Magischer Treffer: 180 % Schaden. 40 % Chance auf Brennen (3 Runden, 3 Schaden je Runde). |
| Waldläufer | Ausdauer 10 / 28 | Gezielter Schuss | 4 | Trifft immer, 150 % Schaden, schwächt 2 Runden (−25 % Angriff). |

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

## Alle 25 Kombinationen auf Stufe 1 und Stufe 10

| Rasse | Beruf | Stufe 1 (LP/Ang/Vert/Init) | Stufe 10 (LP/Ang/Vert/Init) |
|---|---|---|---|
| Mensch | Krieger | 34/8/5/4 | 88/15/11/6 |
| Mensch | Schurke | 24/7/3/7 | 60/14/6/11 |
| Mensch | Kleriker | 26/5/3/3 | 66/9/6/5 |
| Mensch | Magier | 18/8/1/5 | 45/16/2/8 |
| Mensch | Waldläufer | 24/7/2/6 | 60/14/4/10 |
| Elf | Krieger | 32/8/5/6 | 86/15/11/8 |
| Elf | Schurke | 22/7/3/9 | 58/14/6/13 |
| Elf | Kleriker | 24/5/3/5 | 64/9/6/7 |
| Elf | Magier | 16/8/1/7 | 43/16/2/10 |
| Elf | Waldläufer | 22/7/2/8 | 58/14/4/12 |
| Zwerg | Krieger | 38/8/6/3 | 92/15/12/5 |
| Zwerg | Schurke | 28/7/4/6 | 64/14/7/10 |
| Zwerg | Kleriker | 30/5/4/2 | 70/9/7/4 |
| Zwerg | Magier | 22/8/2/4 | 49/16/3/7 |
| Zwerg | Waldläufer | 28/7/3/5 | 64/14/5/9 |
| Ork | Krieger | 37/9/5/3 | 91/16/11/5 |
| Ork | Schurke | 27/8/3/6 | 63/15/6/10 |
| Ork | Kleriker | 29/6/3/2 | 69/10/6/4 |
| Ork | Magier | 21/9/1/4 | 48/17/2/7 |
| Ork | Waldläufer | 27/8/2/5 | 63/15/4/9 |
| Gnom | Krieger | 31/8/5/5 | 85/15/11/7 |
| Gnom | Schurke | 21/7/3/8 | 57/14/6/12 |
| Gnom | Kleriker | 23/5/3/4 | 63/9/6/6 |
| Gnom | Magier | 15/8/1/6 | 42/16/2/9 |
| Gnom | Waldläufer | 21/7/2/7 | 57/14/4/11 |

## Beute

Erzeugte Ausrüstung: Grundgegenstand zufällig aus Eisenschwert, Eichenstab, Lederharnisch, Kettenhemd. Qualität nach Gewicht; „Boost“ würfelt so oft neu und nimmt die beste.

| Qualität | Gewicht | Anteil | Bonus Hauptwert | Zufallseigenschaften |
|---|---|---|---|---|
| Gewöhnlich | 55 | 55 % | +0 | 0 |
| Gut | 28 | 28 % | +1 | 0 |
| Selten | 14 | 14 % | +1 | 1 |
| Episch | 3 | 3 % | +2 | 2 |

| Eigenschaft | Wirkung | Platz |
|---|---|---|
| des Wolfs | +1–2 Angriff | Waffe |
| des Zorns | +1 Angriff | Rüstung |
| des Falken | +1–2 Initiative | Waffe, Rüstung |
| des Bären | +1–2 Verteidigung | Rüstung |
| des Wächters | +1 Verteidigung | Waffe |

| Gegner | Ausrüstung | Unikat |
|---|---|---|
| Moorschrat | 100 %, Boost 2 | Schratdorn oder Wurzelstab (100 %, nur einmal) |
| Sumpfwolf | 15 % | – |
| Moorkultist | 20 % | – |
| Moorlicht | 10 % | – |
| Gruftskelett | 15 % | – |
| Kultwächter | 25 % | – |
| Kultwächter-Hauptmann | 100 %, Boost 2 | Siegelpanzer oder Nebelmantel (100 %, nur einmal) |
| Moorschrat | 100 %, Boost 2 | Schratdorn oder Wurzelstab (100 %, nur einmal) |
| Nebelgeist | 15 % | – |
| Kultpriester | 25 % | – |
| Turmwache | 25 % | – |
| Nebelhüter | 100 %, Boost 3 | – |
