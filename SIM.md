# Balance-Simulation

Balance-Simulation, 3000 Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)

## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)
| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |
|---|---|---|---|---|---|
| 2 Sumpfwölfe | nur Angriff | 100 % | 3.0 | 0.9 | 33.2 |
| 2 Sumpfwölfe | klug | 100 % | 2.2 | 0.3 | 23.6 |
| Wolf + 2 Moorkultisten | nur Angriff | 100 % | 4.1 | 0.9 | 42.3 |
| Wolf + 2 Moorkultisten | klug | 100 % | 2.8 | 0.2 | 29.6 |
| Moorschrat | nur Angriff | 97 % | 4.3 | 0.9 | 47.9 |
| Moorschrat | klug | 100 % | 2.5 | 0.1 | 21.0 |

## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat
Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). „Immer voll“: volle LP/Mana zwischen den Kämpfen. „Mit Proviant“: echte Rast (restParty) nach jedem Sieg, Startvorrat 3.
| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |
|---|---|---|---|---|---|
| nur Angriff | nein | 100 % | 70 % | 30 % | 5.5 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 99 % | 2.4 |
| nur Angriff | immer voll | 100 % | 100 % | 99 % | 2.4 |
| klug | nein | 100 % | 100 % | 98 % | 1.6 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.6 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.6 |

## C) Ganze Kampagne (Testgewölbe → Nebelturm), natürliche Stufen, Beute, Rast, Einkauf
Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.
600 Läufe je Strategie.

| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |
|---|---|---|---|
| nur Angriff | 0 % | 7.8 | 4.5 |
| klug | 100 % | 9.8 | 0.2 |

| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |
|---|---|---|---|---|---|---|---|---|
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | nur Angriff | 100 % | 1.0 | 100 % | 3.0 | 0.9 | 32 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | klug | 100 % | 1.0 | 100 % | 2.2 | 0.3 | 23 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | nur Angriff | 100 % | 1.0 | 100 % | 3.8 | 0.8 | 39 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | klug | 100 % | 1.0 | 100 % | 2.8 | 0.2 | 29 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | nur Angriff | 100 % | 1.7 | 100 % | 3.7 | 0.5 | 35 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | klug | 100 % | 1.9 | 100 % | 2.3 | 0.0 | 16 % |
| Untere Gruft | Moorkultist + Moorkultist | nur Angriff | 100 % | 2.6 | 100 % | 2.0 | 0.0 | 7 % |
| Untere Gruft | Moorkultist + Moorkultist | klug | 100 % | 2.9 | 100 % | 1.5 | 0.0 | 4 % |
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.8 | 100 % | 1.3 | 0.0 | 7 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 3.0 | 100 % | 1.1 | 0.0 | 6 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.9 | 100 % | 2.0 | 0.0 | 13 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.4 | 0.0 | 10 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 3.0 | 100 % | 3.8 | 1.1 | 37 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 3.0 | 0.3 | 31 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.5 | 100 % | 2.9 | 0.1 | 18 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.9 | 100 % | 2.2 | 0.0 | 13 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.8 | 100 % | 2.8 | 0.5 | 19 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 2.0 | 0.0 | 10 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 4.4 | 100 % | 3.8 | 0.7 | 29 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.8 | 100 % | 2.3 | 0.1 | 16 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.5 | 100 % | 2.8 | 0.1 | 15 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.9 | 100 % | 2.1 | 0.0 | 6 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.7 | 100 % | 4.5 | 1.0 | 37 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 5.0 | 100 % | 2.9 | 0.0 | 18 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 100 % | 5.2 | 100 % | 3.6 | 0.6 | 20 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.8 | 100 % | 2.3 | 0.0 | 8 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 100 % | 5.7 | 57 % | 8.9 | 2.7 | 68 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 6.0 | 100 % | 5.5 | 0.1 | 30 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 89 % | 6.0 | 91 % | 4.4 | 1.3 | 28 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.8 | 100 % | 2.2 | 0.0 | 14 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 89 % | 6.2 | 100 % | 2.5 | 0.2 | 13 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.9 | 100 % | 2.0 | 0.0 | 5 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 89 % | 6.4 | 100 % | 4.6 | 0.8 | 35 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 7.0 | 100 % | 3.0 | 0.1 | 19 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 89 % | 6.5 | 100 % | 3.5 | 0.1 | 22 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.4 | 0.0 | 11 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 89 % | 6.7 | 100 % | 3.5 | 0.2 | 24 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.5 | 0.0 | 16 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 89 % | 7.0 | 41 % | 9.0 | 3.1 | 66 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.8 | 100 % | 4.2 | 0.0 | 19 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 80 % | 7.3 | 92 % | 3.6 | 1.0 | 28 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 8.0 | 100 % | 2.1 | 0.0 | 15 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 80 % | 7.4 | 100 % | 6.3 | 0.1 | 27 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 8.0 | 100 % | 3.5 | 0.0 | 14 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 80 % | 7.8 | 59 % | 9.7 | 2.8 | 83 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.8 | 100 % | 4.6 | 0.0 | 23 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | nur Angriff | 66 % | 8.1 | 78 % | 5.2 | 2.0 | 52 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 9.0 | 100 % | 3.1 | 0.1 | 29 % |
| Nebelturm | Nebelhüter (Boss) | nur Angriff | 65 % | 8.3 | 0 % | 9.1 | 4.0 | 69 % |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 9.0 | 84 % | 10.2 | 0.9 | 103 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
