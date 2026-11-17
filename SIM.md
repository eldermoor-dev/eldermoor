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
| nur Angriff | 0 % | 7.5 | 4.3 |
| klug | 100 % | 9.0 | 0.2 |

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
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.8 | 100 % | 1.3 | 0.0 | 8 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 3.0 | 100 % | 1.1 | 0.0 | 6 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.9 | 100 % | 2.0 | 0.1 | 13 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.4 | 0.0 | 10 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 3.0 | 100 % | 3.8 | 1.1 | 36 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 3.0 | 0.4 | 31 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.5 | 100 % | 2.9 | 0.1 | 18 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.9 | 100 % | 2.2 | 0.0 | 13 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.8 | 100 % | 2.8 | 0.5 | 19 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 2.0 | 0.1 | 11 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 4.4 | 100 % | 3.9 | 0.8 | 30 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.8 | 100 % | 2.4 | 0.1 | 16 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.5 | 100 % | 2.9 | 0.1 | 15 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.9 | 100 % | 2.1 | 0.0 | 6 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.7 | 100 % | 4.6 | 1.0 | 38 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 5.0 | 100 % | 2.9 | 0.0 | 19 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 100 % | 5.2 | 100 % | 3.6 | 0.6 | 20 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.8 | 100 % | 2.3 | 0.0 | 8 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 100 % | 5.5 | 76 % | 8.8 | 2.3 | 71 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 5.9 | 100 % | 5.5 | 0.1 | 31 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 93 % | 5.6 | 86 % | 4.5 | 1.4 | 32 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.0 | 100 % | 2.3 | 0.0 | 16 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 93 % | 6.0 | 100 % | 2.5 | 0.2 | 13 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.8 | 100 % | 2.0 | 0.0 | 5 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 93 % | 6.2 | 100 % | 4.7 | 0.8 | 37 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 6.9 | 100 % | 3.0 | 0.1 | 20 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 93 % | 6.3 | 100 % | 3.6 | 0.1 | 23 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.4 | 0.0 | 11 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 93 % | 6.5 | 100 % | 3.6 | 0.2 | 26 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.6 | 0.0 | 17 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 93 % | 6.6 | 42 % | 9.4 | 3.1 | 73 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.0 | 100 % | 4.2 | 0.0 | 21 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 80 % | 7.0 | 96 % | 3.6 | 0.8 | 29 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 7.9 | 100 % | 2.1 | 0.0 | 14 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 80 % | 7.3 | 100 % | 6.6 | 0.1 | 29 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 8.0 | 100 % | 3.5 | 0.0 | 14 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 80 % | 7.5 | 49 % | 9.6 | 3.0 | 86 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.0 | 100 % | 4.9 | 0.0 | 27 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | nur Angriff | 61 % | 7.8 | 70 % | 5.3 | 2.3 | 55 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 8.9 | 100 % | 3.1 | 0.1 | 28 % |
| Nebelturm | Nebelhüter (Boss) | nur Angriff | 60 % | 8.0 | 0 % | 8.7 | 4.0 | 66 % |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 9.0 | 83 % | 10.1 | 0.9 | 99 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
