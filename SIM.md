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
| nur Angriff | 0 % | 5.6 | 4.3 |
| klug | 49 % | 13.0 | 3.3 |

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
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.9 | 100 % | 2.0 | 0.0 | 12 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.3 | 0.0 | 9 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 3.0 | 100 % | 3.7 | 1.1 | 34 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 3.0 | 0.4 | 32 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.5 | 100 % | 2.7 | 0.0 | 14 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.8 | 100 % | 2.0 | 0.0 | 8 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.8 | 100 % | 3.3 | 0.8 | 26 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 2.1 | 0.2 | 14 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 4.0 | 99 % | 5.0 | 1.5 | 47 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.3 | 100 % | 2.8 | 0.4 | 23 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.3 | 100 % | 4.0 | 0.4 | 27 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.8 | 100 % | 2.3 | 0.0 | 8 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.6 | 51 % | 7.2 | 3.0 | 83 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 4.9 | 100 % | 3.5 | 0.5 | 32 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 86 % | 4.8 | 76 % | 6.1 | 1.9 | 51 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.5 | 100 % | 2.5 | 0.1 | 11 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 85 % | 5.4 | 9 % | 9.4 | 3.8 | 81 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 5.9 | 100 % | 6.8 | 0.3 | 43 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 28 % | 5.7 | 58 % | 5.3 | 2.5 | 45 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.7 | 100 % | 2.5 | 0.0 | 20 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 28 % | 6.0 | 100 % | 3.1 | 0.6 | 21 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.8 | 100 % | 2.0 | 0.0 | 7 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 28 % | 6.1 | 95 % | 5.4 | 1.4 | 56 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 6.9 | 100 % | 3.1 | 0.2 | 27 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 28 % | 6.3 | 87 % | 5.1 | 1.4 | 46 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 6.9 | 100 % | 2.6 | 0.0 | 17 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 28 % | 6.4 | 93 % | 4.5 | 1.4 | 40 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.8 | 0.1 | 23 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 28 % | 6.6 | 2 % | 7.9 | 4.0 | 64 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.6 | 100 % | 4.9 | 0.1 | 28 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 6 % | 6.9 | 54 % | 4.8 | 2.7 | 43 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 7.9 | 100 % | 2.3 | 0.1 | 19 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 6 % | 7.1 | 100 % | 9.0 | 0.7 | 49 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 7.9 | 100 % | 4.0 | 0.0 | 15 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 6 % | 7.3 | 0 % | 7.3 | 4.0 | 103 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.2 | 89 % | 7.9 | 0.8 | 74 % |
| Nebelturm | en_t4 | nur Angriff | 0 % | – | – | – | – | – |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 8.7 | 100 % | 3.2 | 0.2 | 32 % |
| Nebelturm | en_tboss | nur Angriff | 0 % | – | – | – | – | – |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 8.9 | 88 % | 10.4 | 0.7 | 112 % |
| Moorfestung – Vorburg | en_f1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 9.4 | 100 % | 2.3 | 0.0 | 10 % |
| Moorfestung – Vorburg | en_f2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Brandmagier | klug | 100 % | 9.7 | 97 % | 4.8 | 0.3 | 57 % |
| Moorfestung – Vorburg | en_f3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Nebelgeist + Brandmagier | klug | 100 % | 9.8 | 100 % | 2.6 | 0.0 | 21 % |
| Moorfestung – Vorburg | en_f4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Nebelgeist | klug | 100 % | 9.9 | 100 % | 4.4 | 0.2 | 46 % |
| Moorfestung – Vorburg | en_f5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Erzkäfer + Kultwächter + Erzkäfer | klug | 100 % | 10.0 | 100 % | 2.7 | 0.0 | 18 % |
| Moorfestung – Vorburg | en_f6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Brandmagier + Turmwache | klug | 100 % | 10.4 | 100 % | 3.9 | 0.1 | 40 % |
| Moorfestung – Kellergewölbe | en_k_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter + Gruftskelett + Gruftskelett | klug | 100 % | 10.7 | 100 % | 2.2 | 0.0 | 7 % |
| Moorfestung – Kellergewölbe | en_k_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Kultwächter | klug | 100 % | 10.8 | 100 % | 2.4 | 0.0 | 13 % |
| Moorfestung – Kellergewölbe | en_k_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier + Turmwache | klug | 100 % | 10.9 | 23 % | 7.2 | 3.3 | 143 % |
| Moorfestung – Kellergewölbe | en_k_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier | klug | 63 % | 11.0 | 100 % | 2.5 | 0.1 | 18 % |
| Moorfestung – Kellergewölbe | en_k_o1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Kultwächter | klug | 63 % | 11.1 | 100 % | 2.0 | 0.0 | 6 % |
| Moorfestung – Kellergewölbe | en_k_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Gruftskelett | klug | 63 % | 11.4 | 100 % | 2.0 | 0.0 | 4 % |
| Moorfestung – Kellergewölbe | en_k_c3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Erzkäfer + Erzkäfer + Nebelgeist | klug | 63 % | 11.6 | 100 % | 3.1 | 0.0 | 26 % |
| Moorfestung – Kellergewölbe | en_k_c5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Brandmagier + Turmwache | klug | 63 % | 11.8 | 99 % | 3.9 | 0.2 | 40 % |
| Moorfestung – Kellergewölbe | en_k_c6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier + Brandmagier | klug | 63 % | 11.9 | 96 % | 4.2 | 0.5 | 50 % |
| Moorfestung – Kellergewölbe | en_k_s2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier | klug | 63 % | 11.9 | 98 % | 4.2 | 0.2 | 44 % |
| Moorfestung – Kellergewölbe | en_k_e | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Turmwache + Brandmagier | klug | 63 % | 12.0 | 30 % | 7.3 | 3.1 | 127 % |
| Moorfestung – Kellergewölbe | en_k_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter-Hauptmann + Kultwächter + Kultwächter (Boss) | klug | 50 % | 12.3 | 100 % | 7.1 | 0.2 | 32 % |
| Moorfestung – Blutgruft | en_b_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Blutdiener | klug | 50 % | 12.6 | 97 % | 6.6 | 0.4 | 56 % |
| Moorfestung – Blutgruft | en_b_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Gruftskelett | klug | 50 % | 12.8 | 100 % | 4.1 | 0.1 | 26 % |
| Moorfestung – Blutgruft | en_b_n2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Vampirbrut + Blutdiener | klug | 50 % | 12.9 | 100 % | 5.8 | 0.3 | 46 % |
| Moorfestung – Blutgruft | en_b_n3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut | klug | 50 % | 13.0 | 99 % | 5.3 | 0.2 | 40 % |
| Moorfestung – Blutgruft | en_b_n4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 50 % | 13.2 | 100 % | 2.3 | 0.0 | 8 % |
| Moorfestung – Blutgruft | en_b_g1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Blutdiener + Blutdiener | klug | 50 % | 13.3 | 100 % | 4.0 | 0.2 | 31 % |
| Moorfestung – Blutgruft | en_b_g2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener | klug | 50 % | 13.5 | 100 % | 3.7 | 0.1 | 19 % |
| Moorfestung – Blutgruft | en_b_g5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut + Brandmagier | klug | 50 % | 13.7 | 88 % | 8.6 | 0.9 | 81 % |
| Moorfestung – Blutgruft | en_b_m3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Vampirbrut | klug | 50 % | 13.8 | 84 % | 9.1 | 1.2 | 93 % |
| Moorfestung – Blutgruft | en_b_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 50 % | 13.9 | 100 % | 2.5 | 0.0 | 10 % |
| Moorfestung – Blutgruft | en_b_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Nebelgeist | klug | 50 % | 14.0 | 100 % | 4.1 | 0.1 | 27 % |
| Moorfestung – Blutgruft | en_b_boss | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutgräfin + Vampirbrut + Vampirbrut (Boss) | klug | 50 % | 14.1 | 64 % | 13.9 | 1.9 | 153 % |
| Spinnenhöhle | en_s_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 49 % | 14.6 | 100 % | 4.0 | 0.1 | 20 % |
| Spinnenhöhle | en_s_a2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 49 % | 14.7 | 100 % | 3.1 | 0.0 | 14 % |
| Spinnenhöhle | en_s_b1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne + Brutspinne | klug | 49 % | 14.8 | 100 % | 3.9 | 0.0 | 22 % |
| Spinnenhöhle | en_s_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter | klug | 49 % | 14.8 | 100 % | 4.7 | 0.1 | 32 % |
| Spinnenhöhle | en_s_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Netzwächter | klug | 49 % | 14.9 | 100 % | 4.8 | 0.1 | 35 % |
| Spinnenhöhle | en_s_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 49 % | 14.9 | 100 % | 3.4 | 0.0 | 16 % |
| Spinnenhöhle | en_s_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 49 % | 14.9 | 100 % | 4.7 | 0.1 | 32 % |
| Spinnenhöhle | en_s_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter + Brutspinne | klug | 49 % | 14.9 | 100 % | 5.7 | 0.2 | 44 % |
| Spinnenhöhle | en_s_k1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 49 % | 15.0 | 100 % | 2.9 | 0.0 | 13 % |
| Spinnenhöhle | en_s_k2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 49 % | 15.0 | 100 % | 5.1 | 0.1 | 36 % |
| Spinnenhöhle | en_s_l1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 49 % | 15.0 | 100 % | 2.9 | 0.0 | 13 % |
| Spinnenhöhle | en_s_l2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 49 % | 15.0 | 100 % | 3.0 | 0.0 | 14 % |
| Spinnenhöhle | en_s_boss | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Spinnenkönigin (Boss) | klug | 49 % | 15.0 | 100 % | 9.0 | 0.0 | 61 % |
| Die Gießerei | en_g_n1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Brandmagier | klug | 49 % | 15.0 | 100 % | 2.5 | 0.0 | 17 % |
| Die Gießerei | en_g_n1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Erzkäfer | klug | 49 % | 15.0 | 100 % | 3.6 | 0.1 | 37 % |
| Die Gießerei | en_g_n2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter + Erzkäfer | klug | 49 % | 15.0 | 98 % | 4.3 | 0.3 | 58 % |
| Die Gießerei | en_g_n2b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Schlackenwächter | klug | 49 % | 15.0 | 100 % | 4.6 | 0.0 | 38 % |
| Die Gießerei | en_g_n3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Schlackenwächter | klug | 49 % | 15.0 | 99 % | 5.4 | 0.3 | 62 % |
| Die Gießerei | en_g_n3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Gruftskelett + Gruftskelett | klug | 49 % | 15.0 | 100 % | 1.9 | 0.0 | 4 % |
| Die Gießerei | en_g_s1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Erzkäfer | klug | 49 % | 15.0 | 100 % | 2.1 | 0.0 | 9 % |
| Die Gießerei | en_g_s1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer | klug | 49 % | 15.0 | 100 % | 3.0 | 0.0 | 19 % |
| Die Gießerei | en_g_s2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter | klug | 49 % | 15.0 | 99 % | 4.0 | 0.2 | 43 % |
| Die Gießerei | en_g_s3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Schlackenwächter + Erzkäfer | klug | 49 % | 15.0 | 100 % | 4.2 | 0.1 | 35 % |
| Die Gießerei | en_g_s3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Brandmagier + Erzkäfer | klug | 49 % | 15.0 | 97 % | 4.8 | 0.4 | 64 % |
| Die Gießerei | en_g_boss | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Gießmeister Harkon + Schlackenwächter (Boss) | klug | 49 % | 15.0 | 76 % | 12.8 | 1.3 | 127 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
