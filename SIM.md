# Balance-Simulation

Balance-Simulation, 3000 Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)

## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)
| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |
|---|---|---|---|---|---|
| 2 Sumpfwölfe | nur Angriff | 100 % | 3.1 | 0.9 | 33.5 |
| 2 Sumpfwölfe | klug | 100 % | 2.2 | 0.3 | 24.1 |
| Wolf + 2 Moorkultisten | nur Angriff | 100 % | 4.1 | 0.9 | 42.2 |
| Wolf + 2 Moorkultisten | klug | 100 % | 2.9 | 0.2 | 31.7 |
| Moorschrat | nur Angriff | 97 % | 4.3 | 0.9 | 47.9 |
| Moorschrat | klug | 100 % | 2.7 | 0.1 | 22.3 |

## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat
Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). „Immer voll“: volle LP/Mana zwischen den Kämpfen. „Mit Proviant“: echte Rast (restParty) nach jedem Sieg, Startvorrat 3.
| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |
|---|---|---|---|---|---|
| nur Angriff | nein | 100 % | 72 % | 30 % | 5.6 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 99 % | 2.4 |
| nur Angriff | immer voll | 100 % | 100 % | 99 % | 2.4 |
| klug | nein | 100 % | 100 % | 99 % | 1.6 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.6 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.6 |

## C) Ganze Kampagne (Testgewölbe → Nebelturm), natürliche Stufen, Beute, Rast, Einkauf
Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.
600 Läufe je Strategie.

| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |
|---|---|---|---|
| nur Angriff | 0 % | 8.5 | 3.5 |
| klug | 100 % | 9.0 | 0.2 |

| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |
|---|---|---|---|---|---|---|---|---|
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | nur Angriff | 100 % | 1.0 | 100 % | 3.0 | 0.8 | 33 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | klug | 100 % | 1.0 | 100 % | 2.1 | 0.3 | 23 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | nur Angriff | 100 % | 1.0 | 100 % | 3.6 | 0.7 | 36 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | klug | 100 % | 1.0 | 100 % | 2.8 | 0.2 | 29 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | nur Angriff | 100 % | 1.7 | 100 % | 3.6 | 0.4 | 33 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | klug | 100 % | 1.9 | 100 % | 2.4 | 0.0 | 15 % |
| Untere Gruft | Moorkultist + Moorkultist | nur Angriff | 100 % | 2.6 | 100 % | 2.0 | 0.0 | 6 % |
| Untere Gruft | Moorkultist + Moorkultist | klug | 100 % | 2.9 | 100 % | 1.4 | 0.0 | 4 % |
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.8 | 100 % | 1.1 | 0.0 | 6 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 3.0 | 100 % | 1.0 | 0.0 | 5 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.9 | 100 % | 1.6 | 0.0 | 9 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.2 | 0.0 | 7 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 3.0 | 100 % | 3.0 | 0.6 | 25 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 2.5 | 0.2 | 23 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.7 | 100 % | 2.3 | 0.0 | 11 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.9 | 100 % | 1.8 | 0.0 | 7 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.9 | 100 % | 2.0 | 0.1 | 9 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 1.4 | 0.0 | 6 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 4.5 | 100 % | 2.6 | 0.3 | 14 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.8 | 100 % | 2.0 | 0.0 | 8 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.7 | 100 % | 2.1 | 0.0 | 5 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 5.0 | 100 % | 1.6 | 0.0 | 3 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.9 | 100 % | 3.1 | 0.2 | 16 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 5.0 | 100 % | 2.2 | 0.0 | 10 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 100 % | 5.5 | 100 % | 2.3 | 0.0 | 6 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.8 | 100 % | 2.0 | 0.0 | 3 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 100 % | 5.8 | 100 % | 4.8 | 0.5 | 26 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 6.0 | 100 % | 3.9 | 0.0 | 14 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 100 % | 5.9 | 100 % | 2.2 | 0.0 | 10 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.0 | 100 % | 1.5 | 0.0 | 5 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 6.5 | 100 % | 1.9 | 0.0 | 4 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.8 | 100 % | 1.2 | 0.0 | 2 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 100 % | 6.7 | 100 % | 2.7 | 0.0 | 11 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 7.0 | 100 % | 2.0 | 0.0 | 6 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 100 % | 6.8 | 100 % | 2.2 | 0.0 | 6 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.0 | 0.0 | 3 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 100 % | 6.9 | 100 % | 2.2 | 0.0 | 9 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.0 | 0.0 | 5 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 100 % | 6.9 | 100 % | 4.5 | 0.1 | 20 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.0 | 100 % | 2.5 | 0.0 | 6 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 100 % | 7.7 | 100 % | 3.2 | 0.2 | 25 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 8.0 | 100 % | 2.1 | 0.0 | 15 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 100 % | 7.8 | 100 % | 6.0 | 0.1 | 23 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 8.0 | 100 % | 3.6 | 0.0 | 14 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 100 % | 7.9 | 63 % | 9.3 | 2.6 | 79 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.0 | 100 % | 5.1 | 0.0 | 28 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | nur Angriff | 92 % | 8.4 | 85 % | 5.2 | 1.7 | 50 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 9.0 | 100 % | 3.1 | 0.1 | 28 % |
| Nebelturm | Nebelhüter (Boss) | nur Angriff | 92 % | 8.5 | 0 % | 9.5 | 4.0 | 73 % |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 9.0 | 78 % | 11.6 | 1.1 | 117 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
