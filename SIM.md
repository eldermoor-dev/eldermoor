# Balance-Simulation

Balance-Simulation, 3000 Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)

## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)
| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |
|---|---|---|---|---|---|
| 2 Sumpfwölfe | nur Angriff | 100 % | 3.1 | 0.9 | 33.5 |
| 2 Sumpfwölfe | klug | 100 % | 2.2 | 0.3 | 24.3 |
| Wolf + 2 Moorkultisten | nur Angriff | 100 % | 4.1 | 0.9 | 42.2 |
| Wolf + 2 Moorkultisten | klug | 100 % | 2.7 | 0.2 | 28.9 |
| Moorschrat | nur Angriff | 100 % | 4.3 | 0.7 | 44.5 |
| Moorschrat | klug | 100 % | 3.2 | 0.1 | 25.5 |

## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat
Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). Mit Rast: volle LP/Mana zwischen den Kämpfen.
| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |
|---|---|---|---|---|---|
| nur Angriff | nein | 100 % | 71 % | 36 % | 5.4 |
| nur Angriff | ja | 100 % | 100 % | 100 % | 2.3 |
| klug | nein | 100 % | 100 % | 100 % | 1.0 |
| klug | ja | 100 % | 100 % | 100 % | 0.6 |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
