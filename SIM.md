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
| nur Angriff | nein | 100 % | 74 % | 29 % | 5.5 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 99 % | 2.0 |
| nur Angriff | immer voll | 100 % | 100 % | 99 % | 2.0 |
| klug | nein | 100 % | 100 % | 99 % | 1.5 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.4 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.4 |

## C) Ganze Kampagne (Testgewölbe → Nebelturm), natürliche Stufen, Beute, Rast, Einkauf
Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.
600 Läufe je Strategie.

| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |
|---|---|---|---|
| nur Angriff | 0 % | 6.3 | 4.0 |
| klug | 100 % | 10.8 | 0.2 |

| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |
|---|---|---|---|---|---|---|---|---|
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | nur Angriff | 100 % | 1.0 | 100 % | 3.0 | 0.9 | 34 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | klug | 100 % | 1.0 | 100 % | 2.2 | 0.3 | 24 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | nur Angriff | 100 % | 1.0 | 100 % | 3.5 | 0.4 | 36 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | klug | 100 % | 1.0 | 100 % | 2.8 | 0.1 | 31 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | nur Angriff | 100 % | 1.7 | 100 % | 3.6 | 0.4 | 32 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | klug | 100 % | 1.9 | 100 % | 2.3 | 0.0 | 14 % |
| Untere Gruft | Moorkultist + Moorkultist | nur Angriff | 100 % | 2.6 | 100 % | 2.0 | 0.0 | 6 % |
| Untere Gruft | Moorkultist + Moorkultist | klug | 100 % | 2.9 | 100 % | 1.4 | 0.0 | 3 % |
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.9 | 100 % | 1.3 | 0.0 | 7 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 3.0 | 100 % | 1.0 | 0.0 | 5 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.9 | 100 % | 2.0 | 0.0 | 12 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.3 | 0.0 | 9 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 3.0 | 100 % | 3.8 | 1.2 | 36 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 3.0 | 0.4 | 33 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.6 | 100 % | 2.7 | 0.0 | 14 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.9 | 100 % | 2.1 | 0.0 | 9 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.9 | 100 % | 3.3 | 0.8 | 24 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 2.1 | 0.2 | 14 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 4.4 | 100 % | 4.8 | 1.3 | 40 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.8 | 100 % | 2.6 | 0.3 | 20 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.6 | 100 % | 3.2 | 0.1 | 18 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.9 | 100 % | 2.1 | 0.0 | 7 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.7 | 94 % | 6.7 | 1.9 | 64 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 5.0 | 100 % | 3.4 | 0.4 | 31 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 100 % | 5.1 | 100 % | 4.0 | 0.5 | 26 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.7 | 100 % | 2.3 | 0.0 | 9 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 100 % | 5.6 | 22 % | 10.0 | 3.5 | 86 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 5.9 | 100 % | 6.4 | 0.2 | 39 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 49 % | 6.0 | 65 % | 5.1 | 2.1 | 45 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.7 | 100 % | 2.5 | 0.0 | 19 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 49 % | 6.1 | 100 % | 2.9 | 0.6 | 19 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.8 | 100 % | 2.0 | 0.0 | 7 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 49 % | 6.3 | 97 % | 5.4 | 1.5 | 55 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 6.9 | 100 % | 3.2 | 0.2 | 27 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 49 % | 6.4 | 99 % | 4.0 | 0.6 | 33 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.5 | 0.0 | 15 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 49 % | 6.6 | 97 % | 4.3 | 1.0 | 39 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.9 | 0.1 | 24 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 49 % | 6.8 | 8 % | 8.6 | 3.8 | 69 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.7 | 100 % | 5.0 | 0.1 | 28 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 19 % | 7.1 | 58 % | 4.8 | 2.8 | 47 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 7.9 | 100 % | 2.4 | 0.1 | 19 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 19 % | 7.2 | 97 % | 8.6 | 0.7 | 49 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 8.0 | 100 % | 4.0 | 0.0 | 15 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 19 % | 7.6 | 5 % | 7.6 | 3.9 | 102 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.7 | 100 % | 5.8 | 0.1 | 43 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | nur Angriff | 2 % | 7.9 | 20 % | 5.0 | 3.6 | 67 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 8.9 | 100 % | 3.1 | 0.2 | 30 % |
| Nebelturm | Nebelhüter (Boss) | nur Angriff | 1 % | 8.1 | 0 % | 6.8 | 4.0 | 55 % |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 8.9 | 87 % | 10.4 | 0.7 | 113 % |
| Moorfestung – Vorburg | en_f1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 9.7 | 100 % | 2.3 | 0.0 | 10 % |
| Moorfestung – Vorburg | en_f2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Brandmagier | klug | 100 % | 9.8 | 98 % | 5.0 | 0.3 | 59 % |
| Moorfestung – Vorburg | en_f3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Nebelgeist + Brandmagier | klug | 100 % | 9.9 | 100 % | 2.6 | 0.0 | 21 % |
| Moorfestung – Vorburg | en_f4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Nebelgeist | klug | 100 % | 10.0 | 99 % | 4.6 | 0.2 | 49 % |
| Moorfestung – Vorburg | en_f5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Erzkäfer + Kultwächter + Erzkäfer | klug | 100 % | 10.0 | 100 % | 2.7 | 0.0 | 18 % |
| Moorfestung – Vorburg | en_f6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Brandmagier + Turmwache | klug | 100 % | 10.7 | 99 % | 3.7 | 0.1 | 35 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
