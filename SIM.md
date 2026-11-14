# Balance-Simulation

Balance-Simulation, 3000 Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)

## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)
| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |
|---|---|---|---|---|---|
| 2 Sumpfwölfe | nur Angriff | 100 % | 3.1 | 0.9 | 33.5 |
| 2 Sumpfwölfe | klug | 100 % | 2.2 | 0.3 | 24.2 |
| Wolf + 2 Moorkultisten | nur Angriff | 100 % | 4.1 | 0.9 | 42.2 |
| Wolf + 2 Moorkultisten | klug | 100 % | 2.9 | 0.2 | 32.0 |
| Moorschrat | nur Angriff | 100 % | 4.3 | 0.7 | 44.5 |
| Moorschrat | klug | 100 % | 2.5 | 0.0 | 18.7 |

## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat
Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). „Immer voll“: volle LP/Mana zwischen den Kämpfen. „Mit Proviant“: echte Rast (restParty) nach jedem Sieg, Startvorrat 3.
| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |
|---|---|---|---|---|---|
| nur Angriff | nein | 100 % | 71 % | 36 % | 5.4 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 100 % | 2.3 |
| nur Angriff | immer voll | 100 % | 100 % | 100 % | 2.3 |
| klug | nein | 100 % | 100 % | 100 % | 1.4 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.6 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.6 |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
