# Balance-Simulation

Balance-Simulation, 3000 Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)

## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)
| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |
|---|---|---|---|---|---|
| 2 Sumpfwölfe | nur Angriff | 100 % | 3.0 | 0.9 | 35.0 |
| 2 Sumpfwölfe | klug | 100 % | 2.2 | 0.3 | 25.4 |
| Wolf + 2 Moorkultisten | nur Angriff | 100 % | 3.7 | 0.5 | 38.9 |
| Wolf + 2 Moorkultisten | klug | 100 % | 2.8 | 0.1 | 31.6 |
| Moorschrat | nur Angriff | 97 % | 4.3 | 0.9 | 47.9 |
| Moorschrat | klug | 100 % | 2.5 | 0.1 | 21.0 |

## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat
Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). „Immer voll“: volle LP/Mana zwischen den Kämpfen. „Mit Proviant“: echte Rast (restParty) nach jedem Sieg, Startvorrat 3.
| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |
|---|---|---|---|---|---|
| nur Angriff | nein | 100 % | 74 % | 30 % | 5.5 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 99 % | 2.1 |
| nur Angriff | immer voll | 100 % | 100 % | 99 % | 2.1 |
| klug | nein | 100 % | 100 % | 99 % | 1.5 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.4 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.4 |

## C) Ganze Kampagne (Testgewölbe → Nebelturm), natürliche Stufen, Beute, Rast, Einkauf
Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.
600 Läufe je Strategie.

| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |
|---|---|---|---|
| nur Angriff | 0 % | 6.5 | 4.1 |
| klug | 100 % | 9.7 | 0.1 |

| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |
|---|---|---|---|---|---|---|---|---|
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | nur Angriff | 100 % | 1.0 | 100 % | 3.0 | 0.9 | 34 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | klug | 100 % | 1.0 | 100 % | 2.2 | 0.3 | 24 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | nur Angriff | 100 % | 1.0 | 100 % | 3.5 | 0.4 | 36 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | klug | 100 % | 1.0 | 100 % | 2.8 | 0.1 | 31 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | nur Angriff | 100 % | 1.7 | 100 % | 3.5 | 0.4 | 32 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | klug | 100 % | 1.9 | 100 % | 2.2 | 0.0 | 14 % |
| Untere Gruft | Moorkultist + Moorkultist | nur Angriff | 100 % | 2.6 | 100 % | 2.0 | 0.0 | 5 % |
| Untere Gruft | Moorkultist + Moorkultist | klug | 100 % | 2.9 | 100 % | 1.4 | 0.0 | 3 % |
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.9 | 100 % | 1.2 | 0.0 | 6 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 3.0 | 100 % | 1.0 | 0.0 | 5 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.9 | 100 % | 2.0 | 0.0 | 12 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.3 | 0.0 | 9 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 3.0 | 100 % | 3.7 | 1.2 | 35 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 2.9 | 0.4 | 32 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.6 | 100 % | 2.6 | 0.0 | 13 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.9 | 100 % | 2.0 | 0.0 | 8 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.9 | 100 % | 3.2 | 0.8 | 23 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 2.1 | 0.1 | 12 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 4.4 | 100 % | 4.6 | 1.2 | 37 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.8 | 100 % | 2.6 | 0.3 | 19 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.6 | 100 % | 3.2 | 0.0 | 17 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.9 | 100 % | 2.1 | 0.0 | 6 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.7 | 96 % | 6.6 | 1.9 | 61 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 5.0 | 100 % | 3.4 | 0.4 | 30 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 100 % | 5.1 | 100 % | 3.9 | 0.5 | 25 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.7 | 100 % | 2.3 | 0.0 | 9 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 100 % | 5.6 | 24 % | 10.0 | 3.5 | 86 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 5.9 | 100 % | 6.2 | 0.2 | 38 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 58 % | 6.0 | 67 % | 5.1 | 2.1 | 43 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.8 | 100 % | 2.4 | 0.0 | 18 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 58 % | 6.2 | 100 % | 2.9 | 0.6 | 18 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.9 | 100 % | 2.0 | 0.0 | 7 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 58 % | 6.3 | 98 % | 5.2 | 1.4 | 52 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 6.9 | 100 % | 3.1 | 0.2 | 26 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 58 % | 6.4 | 99 % | 4.0 | 0.5 | 32 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.5 | 0.0 | 15 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 58 % | 6.5 | 98 % | 4.2 | 0.9 | 38 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.8 | 0.1 | 23 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 58 % | 6.8 | 10 % | 8.5 | 3.8 | 69 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.7 | 100 % | 4.9 | 0.1 | 28 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 24 % | 7.1 | 64 % | 4.7 | 2.6 | 42 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 7.9 | 100 % | 2.3 | 0.1 | 17 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 24 % | 7.2 | 99 % | 8.9 | 0.7 | 48 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 8.0 | 100 % | 3.9 | 0.0 | 15 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 24 % | 7.5 | 5 % | 7.9 | 3.9 | 102 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.7 | 100 % | 5.6 | 0.1 | 41 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | nur Angriff | 2 % | 7.8 | 38 % | 5.2 | 3.2 | 62 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 8.9 | 100 % | 3.1 | 0.1 | 29 % |
| Nebelturm | Nebelhüter (Boss) | nur Angriff | 2 % | 8.0 | 0 % | 7.1 | 4.0 | 59 % |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 8.9 | 87 % | 10.1 | 0.7 | 109 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
