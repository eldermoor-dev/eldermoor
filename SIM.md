# Balance-Simulation

Balance-Simulation, 3000 Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)

## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)
| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |
|---|---|---|---|---|---|
| 2 Sumpfwölfe | nur Angriff | 100 % | 3.0 | 0.8 | 31.9 |
| 2 Sumpfwölfe | klug | 100 % | 2.2 | 0.3 | 24.6 |
| Wolf + 2 Moorkultisten | nur Angriff | 100 % | 3.5 | 0.3 | 35.4 |
| Wolf + 2 Moorkultisten | klug | 100 % | 2.7 | 0.1 | 30.4 |
| Moorschrat | nur Angriff | 97 % | 4.3 | 0.9 | 47.9 |
| Moorschrat | klug | 100 % | 2.5 | 0.1 | 21.0 |

## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat
Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). „Immer voll“: volle LP/Mana zwischen den Kämpfen. „Mit Proviant“: echte Rast (restParty) nach jedem Sieg, Startvorrat 3.
| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |
|---|---|---|---|---|---|
| nur Angriff | nein | 100 % | 88 % | 39 % | 5.2 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 99 % | 1.8 |
| nur Angriff | immer voll | 100 % | 100 % | 99 % | 1.8 |
| klug | nein | 100 % | 100 % | 99 % | 1.3 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.4 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.4 |

## C) Ganze Kampagne (Testgewölbe → Blutgruft), natürliche Stufen, Beute, Rast, Einkauf
Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.
600 Läufe je Strategie.

| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |
|---|---|---|---|
| nur Angriff | 0 % | 5.8 | 4.5 |
| klug | 72 % | 14.5 | 3.6 |

| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |
|---|---|---|---|---|---|---|---|---|
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | nur Angriff | 100 % | 1.0 | 100 % | 3.0 | 0.8 | 31 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | klug | 100 % | 1.0 | 100 % | 2.2 | 0.3 | 24 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | nur Angriff | 100 % | 1.0 | 100 % | 3.4 | 0.3 | 33 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | klug | 100 % | 1.0 | 100 % | 2.8 | 0.1 | 30 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | nur Angriff | 100 % | 1.7 | 100 % | 3.6 | 0.4 | 32 % |
| Testgewölbe (Phase 1) | Moorschrat (Boss) | klug | 100 % | 1.9 | 100 % | 2.3 | 0.0 | 14 % |
| Untere Gruft | Moorkultist + Moorkultist | nur Angriff | 100 % | 2.5 | 100 % | 2.0 | 0.0 | 5 % |
| Untere Gruft | Moorkultist + Moorkultist | klug | 100 % | 2.9 | 100 % | 1.4 | 0.0 | 3 % |
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.8 | 100 % | 1.2 | 0.0 | 6 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 3.0 | 100 % | 1.0 | 0.0 | 5 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.9 | 100 % | 2.0 | 0.0 | 11 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.3 | 0.0 | 9 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 3.0 | 100 % | 3.6 | 1.1 | 33 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 2.9 | 0.5 | 31 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.5 | 100 % | 2.6 | 0.0 | 13 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.8 | 100 % | 2.0 | 0.0 | 8 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.8 | 100 % | 3.3 | 0.8 | 24 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 2.2 | 0.2 | 13 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 4.0 | 100 % | 4.9 | 1.4 | 45 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.3 | 100 % | 2.8 | 0.4 | 23 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.4 | 100 % | 4.0 | 0.4 | 26 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.8 | 100 % | 2.2 | 0.0 | 8 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.6 | 54 % | 7.3 | 2.9 | 82 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 4.9 | 100 % | 3.5 | 0.4 | 30 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 88 % | 4.8 | 77 % | 6.1 | 1.9 | 51 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.4 | 100 % | 2.6 | 0.1 | 12 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 88 % | 5.4 | 13 % | 9.4 | 3.7 | 80 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 5.9 | 100 % | 6.2 | 0.2 | 38 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 35 % | 5.8 | 61 % | 5.0 | 2.3 | 45 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.7 | 100 % | 2.4 | 0.0 | 19 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 35 % | 6.0 | 100 % | 2.9 | 0.6 | 19 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.8 | 100 % | 2.0 | 0.0 | 7 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 35 % | 6.2 | 72 % | 7.1 | 2.4 | 78 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 6.9 | 100 % | 3.7 | 0.1 | 31 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 32 % | 6.5 | 79 % | 4.8 | 1.6 | 44 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 7.5 | 100 % | 2.5 | 0.0 | 14 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 32 % | 6.7 | 94 % | 4.2 | 1.2 | 37 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.8 | 100 % | 2.6 | 0.1 | 19 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 32 % | 6.9 | 7 % | 8.2 | 3.8 | 67 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.9 | 100 % | 4.6 | 0.1 | 25 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 11 % | 7.2 | 65 % | 4.7 | 2.4 | 43 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 7.9 | 100 % | 2.3 | 0.1 | 18 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 11 % | 7.4 | 96 % | 10.4 | 1.2 | 61 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 8.0 | 100 % | 4.4 | 0.0 | 20 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 11 % | 7.6 | 7 % | 8.1 | 3.8 | 101 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.8 | 100 % | 5.3 | 0.1 | 37 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | nur Angriff | 2 % | 8.1 | 20 % | 4.2 | 3.5 | 57 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 8.9 | 100 % | 3.1 | 0.1 | 29 % |
| Nebelturm | Nebelhüter (Boss) | nur Angriff | 2 % | 8.3 | 0 % | 8.2 | 4.0 | 63 % |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 9.2 | 94 % | 8.8 | 0.4 | 89 % |
| Moorfestung – Vorburg | en_f1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 9.8 | 100 % | 2.2 | 0.0 | 9 % |
| Moorfestung – Vorburg | en_f2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Brandmagier | klug | 100 % | 9.9 | 99 % | 4.4 | 0.2 | 49 % |
| Moorfestung – Vorburg | en_f3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Nebelgeist + Brandmagier | klug | 100 % | 9.9 | 100 % | 2.9 | 0.0 | 23 % |
| Moorfestung – Vorburg | en_f4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Nebelgeist | klug | 100 % | 10.5 | 100 % | 3.6 | 0.1 | 34 % |
| Moorfestung – Vorburg | en_f5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Erzkäfer + Kultwächter + Erzkäfer | klug | 100 % | 10.7 | 100 % | 2.3 | 0.0 | 13 % |
| Moorfestung – Vorburg | en_f6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Brandmagier + Turmwache | klug | 100 % | 10.9 | 99 % | 4.4 | 0.2 | 41 % |
| Moorfestung – Kellergewölbe | en_k_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter + Gruftskelett + Gruftskelett | klug | 100 % | 10.9 | 100 % | 2.1 | 0.0 | 7 % |
| Moorfestung – Kellergewölbe | en_k_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Kultwächter | klug | 100 % | 11.0 | 100 % | 3.1 | 0.0 | 17 % |
| Moorfestung – Kellergewölbe | en_k_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier + Turmwache | klug | 100 % | 11.4 | 30 % | 7.1 | 3.0 | 136 % |
| Moorfestung – Kellergewölbe | en_k_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier | klug | 88 % | 11.7 | 100 % | 2.3 | 0.0 | 16 % |
| Moorfestung – Kellergewölbe | en_k_o1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Kultwächter | klug | 88 % | 11.9 | 100 % | 2.2 | 0.0 | 10 % |
| Moorfestung – Kellergewölbe | en_k_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Gruftskelett | klug | 88 % | 12.0 | 100 % | 2.0 | 0.0 | 4 % |
| Moorfestung – Kellergewölbe | en_k_c3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Erzkäfer + Erzkäfer + Nebelgeist | klug | 88 % | 12.3 | 100 % | 2.8 | 0.0 | 25 % |
| Moorfestung – Kellergewölbe | en_k_c5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Brandmagier + Turmwache | klug | 88 % | 12.5 | 100 % | 3.5 | 0.1 | 33 % |
| Moorfestung – Kellergewölbe | en_k_c6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier + Brandmagier | klug | 88 % | 12.7 | 99 % | 3.6 | 0.3 | 42 % |
| Moorfestung – Kellergewölbe | en_k_s2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier | klug | 88 % | 12.9 | 100 % | 3.4 | 0.1 | 28 % |
| Moorfestung – Kellergewölbe | en_k_e | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Turmwache + Brandmagier | klug | 88 % | 12.9 | 76 % | 6.9 | 1.5 | 103 % |
| Moorfestung – Kellergewölbe | en_k_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter-Hauptmann + Kultwächter + Kultwächter (Boss) | klug | 87 % | 13.2 | 100 % | 5.6 | 0.0 | 23 % |
| Moorfestung – Blutgruft | en_b_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Blutdiener | klug | 87 % | 13.6 | 99 % | 5.3 | 0.3 | 44 % |
| Moorfestung – Blutgruft | en_b_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Gruftskelett | klug | 87 % | 13.7 | 100 % | 5.3 | 0.1 | 38 % |
| Moorfestung – Blutgruft | en_b_n2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Vampirbrut + Blutdiener | klug | 87 % | 13.9 | 99 % | 5.3 | 0.3 | 45 % |
| Moorfestung – Blutgruft | en_b_n3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut | klug | 87 % | 14.0 | 99 % | 4.5 | 0.2 | 37 % |
| Moorfestung – Blutgruft | en_b_n4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 87 % | 14.2 | 100 % | 2.2 | 0.0 | 8 % |
| Moorfestung – Blutgruft | en_b_g1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Blutdiener + Blutdiener | klug | 87 % | 14.3 | 100 % | 3.4 | 0.1 | 26 % |
| Moorfestung – Blutgruft | en_b_g2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener | klug | 87 % | 14.5 | 100 % | 3.1 | 0.0 | 17 % |
| Moorfestung – Blutgruft | en_b_g5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut + Brandmagier | klug | 87 % | 14.7 | 93 % | 7.0 | 0.7 | 69 % |
| Moorfestung – Blutgruft | en_b_m3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Vampirbrut | klug | 87 % | 14.8 | 87 % | 7.5 | 1.0 | 78 % |
| Moorfestung – Blutgruft | en_b_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 87 % | 14.9 | 100 % | 2.3 | 0.0 | 11 % |
| Moorfestung – Blutgruft | en_b_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Nebelgeist | klug | 87 % | 14.9 | 100 % | 3.4 | 0.1 | 24 % |
| Moorfestung – Blutgruft | en_b_boss | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutgräfin + Vampirbrut + Vampirbrut (Boss) | klug | 87 % | 15.0 | 59 % | 12.3 | 2.1 | 145 % |
| Spinnenhöhle | en_s_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 87 % | 15.0 | 100 % | 4.1 | 0.1 | 22 % |
| Spinnenhöhle | en_s_a2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 87 % | 15.0 | 100 % | 3.0 | 0.0 | 14 % |
| Spinnenhöhle | en_s_b1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne + Brutspinne | klug | 87 % | 15.0 | 100 % | 4.0 | 0.0 | 24 % |
| Spinnenhöhle | en_s_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter | klug | 87 % | 15.0 | 100 % | 5.7 | 0.1 | 36 % |
| Spinnenhöhle | en_s_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Netzwächter | klug | 87 % | 15.0 | 100 % | 4.4 | 0.1 | 33 % |
| Spinnenhöhle | en_s_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 87 % | 15.0 | 100 % | 3.5 | 0.0 | 17 % |
| Spinnenhöhle | en_s_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 87 % | 15.0 | 100 % | 4.5 | 0.1 | 33 % |
| Spinnenhöhle | en_s_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter + Brutspinne | klug | 87 % | 15.0 | 100 % | 5.3 | 0.1 | 44 % |
| Spinnenhöhle | en_s_k1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 87 % | 15.0 | 100 % | 2.8 | 0.0 | 13 % |
| Spinnenhöhle | en_s_k2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 87 % | 15.0 | 100 % | 4.9 | 0.1 | 35 % |
| Spinnenhöhle | en_s_l1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 87 % | 15.0 | 100 % | 2.9 | 0.0 | 14 % |
| Spinnenhöhle | en_s_l2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 87 % | 15.0 | 100 % | 2.9 | 0.0 | 14 % |
| Spinnenhöhle | en_s_boss | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Spinnenkönigin (Boss) | klug | 87 % | 15.0 | 100 % | 8.2 | 0.0 | 57 % |
| Die Gießerei | en_g_n1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Brandmagier | klug | 87 % | 15.0 | 100 % | 2.8 | 0.1 | 28 % |
| Die Gießerei | en_g_n1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Erzkäfer | klug | 87 % | 15.0 | 100 % | 3.8 | 0.1 | 42 % |
| Die Gießerei | en_g_n2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter + Erzkäfer | klug | 87 % | 15.0 | 98 % | 4.2 | 0.4 | 59 % |
| Die Gießerei | en_g_n2b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Schlackenwächter | klug | 87 % | 15.0 | 100 % | 4.5 | 0.1 | 41 % |
| Die Gießerei | en_g_n3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Schlackenwächter | klug | 87 % | 15.0 | 53 % | 8.3 | 2.4 | 129 % |
| Die Gießerei | en_g_n3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Gruftskelett + Gruftskelett | klug | 76 % | 15.0 | 100 % | 2.0 | 0.0 | 7 % |
| Die Gießerei | en_g_s1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Erzkäfer | klug | 76 % | 15.0 | 100 % | 2.0 | 0.0 | 13 % |
| Die Gießerei | en_g_s1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer | klug | 76 % | 15.0 | 100 % | 2.9 | 0.0 | 21 % |
| Die Gießerei | en_g_s2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter | klug | 76 % | 15.0 | 100 % | 3.8 | 0.1 | 45 % |
| Die Gießerei | en_g_s3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Schlackenwächter + Erzkäfer | klug | 76 % | 15.0 | 100 % | 4.0 | 0.1 | 37 % |
| Die Gießerei | en_g_s3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Brandmagier + Erzkäfer | klug | 76 % | 15.0 | 96 % | 4.3 | 0.4 | 65 % |
| Die Gießerei | en_g_boss | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Gießmeister Harkon + Schlackenwächter (Boss) | klug | 76 % | 15.0 | 82 % | 11.4 | 0.9 | 114 % |
| Die Zisterne | en_z_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Nebelgeist + Kultpriester | klug | 76 % | 15.0 | 82 % | 8.3 | 1.0 | 60 % |
| Die Zisterne | en_z_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Kultwächter + Gruftskelett | klug | 76 % | 15.0 | 100 % | 2.0 | 0.0 | 7 % |
| Die Zisterne | en_z_h3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Nebelgeist + Schlackenwächter | klug | 76 % | 15.0 | 98 % | 6.2 | 0.3 | 65 % |
| Die Zisterne | en_z_h4 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Nebelgeist + Nebelgeist | klug | 76 % | 15.0 | 100 % | 3.2 | 0.2 | 34 % |
| Die Zisterne | en_z_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Kultpriester | klug | 76 % | 15.0 | 100 % | 3.9 | 0.0 | 22 % |
| Die Zisterne | en_z_n2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Gruftskelett + Nebelgeist | klug | 76 % | 15.0 | 100 % | 3.5 | 0.2 | 38 % |
| Die Zisterne | en_z_n3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultpriester + Nebelgeist | klug | 76 % | 15.0 | 100 % | 4.2 | 0.0 | 24 % |
| Die Zisterne | en_z_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Kultwächter + Gruftskelett | klug | 76 % | 15.0 | 100 % | 2.0 | 0.0 | 7 % |
| Die Zisterne | en_z_s2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Nebelgeist | klug | 76 % | 15.0 | 100 % | 3.9 | 0.1 | 44 % |
| Die Zisterne | en_z_wn1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Gruftskelett + Gruftskelett | klug | 76 % | 15.0 | 100 % | 2.0 | 0.0 | 9 % |
| Die Zisterne | en_z_wn2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Nebelgeist | klug | 76 % | 15.0 | 100 % | 3.7 | 0.0 | 16 % |
| Die Zisterne | en_z_ws1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Gruftskelett + Kultwächter | klug | 76 % | 15.0 | 100 % | 2.1 | 0.0 | 11 % |
| Die Zisterne | en_z_ws2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 76 % | 15.0 | 100 % | 5.3 | 0.1 | 40 % |
| Die Zisterne | en_z_en1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Schlackenwächter + Nebelgeist | klug | 76 % | 15.0 | 66 % | 8.9 | 1.8 | 110 % |
| Die Zisterne | en_z_en2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultpriester | klug | 72 % | 15.0 | 100 % | 3.1 | 0.0 | 9 % |
| Die Zisterne | en_z_es1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Nebelgeist + Kultwächter | klug | 72 % | 15.0 | 100 % | 3.5 | 0.2 | 39 % |
| Die Zisterne | en_z_es2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Gruftskelett + Kultpriester | klug | 72 % | 15.0 | 100 % | 6.0 | 0.1 | 35 % |
| Die Zisterne | en_z_k1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 72 % | 15.0 | 100 % | 5.2 | 0.1 | 37 % |
| Die Zisterne | en_z_k2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Schlackenwächter + Kultwächter | klug | 72 % | 15.0 | 100 % | 4.0 | 0.1 | 36 % |
| Die Zisterne | en_z_k3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultwächter + Nebelgeist | klug | 72 % | 15.0 | 100 % | 2.7 | 0.0 | 25 % |
| Die Zisterne | en_z_k4 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Gruftskelett + Schlackenwächter | klug | 72 % | 15.0 | 100 % | 5.5 | 0.0 | 32 % |
| Die Zisterne | en_z_kk1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultwächter + Nebelgeist | klug | 72 % | 15.0 | 100 % | 3.5 | 0.1 | 38 % |
| Die Zisterne | en_z_kk2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Gruftskelett + Schlackenwächter | klug | 72 % | 15.0 | 99 % | 7.1 | 0.2 | 52 % |
| Die Zisterne | en_z_kk3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 72 % | 15.0 | 100 % | 5.3 | 0.1 | 36 % |
| Die Zisterne | en_z_h5 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Nebelgeist + Kultpriester | klug | 72 % | 15.0 | 100 % | 4.2 | 0.0 | 21 % |
| Die Zisterne | en_z_h6 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Schlackenwächter + Gruftskelett | klug | 72 % | 15.0 | 100 % | 3.6 | 0.0 | 34 % |
| Die Zisterne | en_z_h7 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Kultwächter | klug | 72 % | 15.0 | 100 % | 4.0 | 0.0 | 21 % |
| Die Zisterne | en_z_h8 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Nebelgeist | klug | 72 % | 15.0 | 100 % | 3.7 | 0.1 | 40 % |
| Die Zisterne | en_z_boss | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Quellhüterin Maris + Nebelgeist (Boss) | klug | 72 % | 15.0 | 89 % | 12.2 | 0.7 | 119 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
