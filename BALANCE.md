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

Gegner-EP (jeder Held, der nach dem Kampf nicht bewusstlos ist, bekommt die volle Summe):

| Gegner | EP | Gold |
|---|---|---|
| Moorschrat | 120 | 15 |

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
| Priester | hinten | nein | 26 | 5 | 3 | 3 | 45/5/4/3 |
| Magier | hinten | ja | 18 | 8 | 1 | 5 | 30/9/2/4 |
| Waldläufer | hinten | ja | 24 | 7 | 2 | 6 | 40/8/3/5 |

## Fähigkeiten und Ressource (vorläufig, Schritt 3a)

Angriff und Verteidigen schenken 1 Punkt Ressource zurück; nach jedem Kampf ist sie voll.

| Beruf | Ressource (Stufe 1 / Stufe 10) | Fähigkeit | Kosten | Wirkung |
|---|---|---|---|---|
| Krieger | Ausdauer 10 / 28 | Wuchtschlag | 4 | Schwerer Hieb: 160 % Schaden. |
| Schurke | Ausdauer 10 / 28 | Hinterhalt | 4 | Trifft immer, 140 % Schaden. |
| Priester | Mana 12 / 39 | Heilende Hand | 5 | Heilt einen Helden um 20 LP. |
| Magier | Mana 12 / 39 | Feuerblitz | 5 | Magischer Treffer: 180 % Schaden. |
| Waldläufer | Ausdauer 10 / 28 | Gezielter Schuss | 4 | Trifft immer, 150 % Schaden. |

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

### Priester

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
| Mensch | Priester | 26/5/3/3 | 66/9/6/5 |
| Mensch | Magier | 18/8/1/5 | 45/16/2/8 |
| Mensch | Waldläufer | 24/7/2/6 | 60/14/4/10 |
| Elf | Krieger | 32/8/5/6 | 86/15/11/8 |
| Elf | Schurke | 22/7/3/9 | 58/14/6/13 |
| Elf | Priester | 24/5/3/5 | 64/9/6/7 |
| Elf | Magier | 16/8/1/7 | 43/16/2/10 |
| Elf | Waldläufer | 22/7/2/8 | 58/14/4/12 |
| Zwerg | Krieger | 38/8/6/3 | 92/15/12/5 |
| Zwerg | Schurke | 28/7/4/6 | 64/14/7/10 |
| Zwerg | Priester | 30/5/4/2 | 70/9/7/4 |
| Zwerg | Magier | 22/8/2/4 | 49/16/3/7 |
| Zwerg | Waldläufer | 28/7/3/5 | 64/14/5/9 |
| Ork | Krieger | 37/9/5/3 | 91/16/11/5 |
| Ork | Schurke | 27/8/3/6 | 63/15/6/10 |
| Ork | Priester | 29/6/3/2 | 69/10/6/4 |
| Ork | Magier | 21/9/1/4 | 48/17/2/7 |
| Ork | Waldläufer | 27/8/2/5 | 63/15/4/9 |
| Gnom | Krieger | 31/8/5/5 | 85/15/11/7 |
| Gnom | Schurke | 21/7/3/8 | 57/14/6/12 |
| Gnom | Priester | 23/5/3/4 | 63/9/6/6 |
| Gnom | Magier | 15/8/1/6 | 42/16/2/9 |
| Gnom | Waldläufer | 21/7/2/7 | 57/14/4/11 |
