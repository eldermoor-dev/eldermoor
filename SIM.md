# Balance-Simulation

Balance-Simulation, 1000 Läufe je Zeile, Spiellogik aus logic.js, Startgruppe = Schnellgruppe (Stufe 1)

## A) Einzelkampf, frische Gruppe (volle LP/Mana, Startvorrat Heiltränke)
| Kampf | Strategie | Sieg | Runden | KO-Helden | Schaden durch Gegner (Gruppe) |
|---|---|---|---|---|---|
| 2 Sumpfwölfe | nur Angriff | 100 % | 3.0 | 0.8 | 31.6 |
| 2 Sumpfwölfe | klug | 100 % | 2.2 | 0.3 | 24.3 |
| Wolf + 2 Moorkultisten | nur Angriff | 100 % | 3.5 | 0.3 | 35.2 |
| Wolf + 2 Moorkultisten | klug | 100 % | 2.7 | 0.1 | 30.4 |
| Moorschrat | nur Angriff | 98 % | 4.3 | 0.9 | 48.0 |
| Moorschrat | klug | 100 % | 2.5 | 0.1 | 21.4 |

## B) Kampagnenfolge Wölfe → Kultisten-Gang → Moorschrat
Ohne Rast: LP bleiben, besiegte Helden stehen mit 1 LP auf (aktuelle Übergangsregel). „Immer voll“: volle LP/Mana zwischen den Kämpfen. „Mit Proviant“: echte Rast (restParty) nach jedem Sieg, Startvorrat 3.
| Strategie | Rast | Wölfe gewonnen | + Gang gewonnen | + Schrat gewonnen | KO-Helden gesamt |
|---|---|---|---|---|---|
| nur Angriff | nein | 100 % | 88 % | 38 % | 5.2 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 99 % | 1.8 |
| nur Angriff | immer voll | 100 % | 100 % | 99 % | 1.8 |
| klug | nein | 100 % | 100 % | 99 % | 1.3 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.4 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.4 |

## C) Ganze Kampagne (Testgewölbe → Blutgruft), natürliche Stufen, Beute, Rast, Einkauf
Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.
200 Läufe je Strategie.

| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |
|---|---|---|---|
| nur Angriff | 0 % | 5.5 | 4.3 |
| klug | 58 % | 13.8 | 4.1 |

| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |
|---|---|---|---|---|---|---|---|---|
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | nur Angriff | 100 % | 1.0 | 100 % | 2.9 | 0.8 | 31 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | klug | 100 % | 1.0 | 100 % | 2.2 | 0.3 | 24 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | nur Angriff | 100 % | 1.0 | 100 % | 3.4 | 0.3 | 33 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | klug | 100 % | 1.0 | 100 % | 2.8 | 0.1 | 30 % |
| Untere Gruft | Moorkultist + Moorkultist | nur Angriff | 100 % | 2.3 | 100 % | 2.0 | 0.0 | 6 % |
| Untere Gruft | Moorkultist + Moorkultist | klug | 100 % | 2.7 | 100 % | 1.4 | 0.0 | 3 % |
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.7 | 100 % | 1.2 | 0.0 | 6 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 3.0 | 100 % | 1.0 | 0.0 | 5 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.8 | 100 % | 2.0 | 0.0 | 12 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 3.0 | 100 % | 1.3 | 0.0 | 9 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 2.9 | 100 % | 3.6 | 1.1 | 33 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 2.9 | 0.4 | 30 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.3 | 100 % | 2.7 | 0.0 | 14 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.7 | 100 % | 2.0 | 0.0 | 8 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.7 | 100 % | 3.4 | 0.8 | 25 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 3.9 | 100 % | 2.1 | 0.2 | 14 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.8 | 100 % | 5.0 | 1.4 | 46 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 4.0 | 100 % | 3.0 | 0.4 | 25 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 4.2 | 100 % | 4.1 | 0.5 | 27 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.7 | 100 % | 2.3 | 0.0 | 8 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.5 | 61 % | 7.5 | 2.8 | 82 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 4.9 | 100 % | 3.5 | 0.4 | 32 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 88 % | 4.6 | 78 % | 6.1 | 1.8 | 52 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 5.0 | 100 % | 2.9 | 0.1 | 15 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 87 % | 5.3 | 9 % | 9.3 | 3.8 | 81 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 5.9 | 100 % | 6.4 | 0.2 | 40 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 28 % | 5.7 | 55 % | 5.3 | 2.6 | 48 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 6.2 | 100 % | 2.5 | 0.0 | 21 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 28 % | 5.8 | 100 % | 3.1 | 0.6 | 20 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 6.7 | 100 % | 2.0 | 0.0 | 7 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 28 % | 6.1 | 57 % | 7.6 | 2.8 | 85 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 6.8 | 100 % | 3.8 | 0.2 | 32 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 25 % | 6.2 | 69 % | 5.0 | 2.1 | 45 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 7.0 | 100 % | 2.6 | 0.0 | 16 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 25 % | 6.5 | 86 % | 4.5 | 1.5 | 39 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 7.5 | 100 % | 2.6 | 0.0 | 20 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 25 % | 6.7 | 6 % | 7.6 | 3.9 | 62 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 7.8 | 100 % | 4.6 | 0.1 | 25 % |
| Nebelturm | Nebelgeist + Nebelgeist | nur Angriff | 8 % | 7.0 | 40 % | 4.7 | 3.3 | 43 % |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 7.9 | 100 % | 2.3 | 0.1 | 18 % |
| Nebelturm | Turmwache + Kultpriester | nur Angriff | 8 % | 7.2 | 93 % | 10.8 | 1.2 | 60 % |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 8.0 | 100 % | 4.5 | 0.0 | 20 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | nur Angriff | 8 % | 7.4 | 7 % | 7.5 | 3.9 | 99 % |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 8.6 | 97 % | 6.1 | 0.3 | 47 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | nur Angriff | 1 % | 8.0 | 50 % | 5.0 | 3.0 | 60 % |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 100 % | 8.8 | 100 % | 3.1 | 0.1 | 30 % |
| Nebelturm | Nebelhüter (Boss) | nur Angriff | 1 % | 8.0 | 0 % | 10.0 | 4.0 | 67 % |
| Nebelturm | Nebelhüter (Boss) | klug | 100 % | 8.9 | 92 % | 9.3 | 0.5 | 96 % |
| Moorfestung – Vorburg | en_f1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 9.5 | 100 % | 2.3 | 0.0 | 10 % |
| Moorfestung – Vorburg | en_f2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Brandmagier | klug | 100 % | 9.7 | 100 % | 4.5 | 0.2 | 50 % |
| Moorfestung – Vorburg | en_f3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Nebelgeist + Brandmagier | klug | 100 % | 9.8 | 100 % | 2.9 | 0.1 | 24 % |
| Moorfestung – Vorburg | en_f4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Nebelgeist | klug | 100 % | 9.9 | 100 % | 4.3 | 0.2 | 46 % |
| Moorfestung – Vorburg | en_f5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Erzkäfer + Kultwächter + Erzkäfer | klug | 100 % | 10.1 | 100 % | 2.5 | 0.0 | 16 % |
| Moorfestung – Vorburg | en_f6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Brandmagier + Turmwache | klug | 100 % | 10.4 | 100 % | 4.6 | 0.1 | 45 % |
| Moorfestung – Kellergewölbe | en_k_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter + Gruftskelett + Gruftskelett | klug | 100 % | 10.8 | 100 % | 2.2 | 0.0 | 9 % |
| Moorfestung – Kellergewölbe | en_k_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Kultwächter | klug | 100 % | 10.9 | 100 % | 3.1 | 0.1 | 18 % |
| Moorfestung – Kellergewölbe | en_k_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier + Turmwache | klug | 100 % | 10.9 | 27 % | 7.0 | 3.2 | 139 % |
| Moorfestung – Kellergewölbe | en_k_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier | klug | 76 % | 11.0 | 100 % | 2.3 | 0.0 | 17 % |
| Moorfestung – Kellergewölbe | en_k_o1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Kultwächter | klug | 76 % | 11.5 | 100 % | 2.2 | 0.0 | 11 % |
| Moorfestung – Kellergewölbe | en_k_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Gruftskelett | klug | 76 % | 11.8 | 100 % | 2.0 | 0.0 | 4 % |
| Moorfestung – Kellergewölbe | en_k_c3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Erzkäfer + Erzkäfer + Nebelgeist | klug | 76 % | 11.9 | 100 % | 2.9 | 0.0 | 28 % |
| Moorfestung – Kellergewölbe | en_k_c5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Brandmagier + Turmwache | klug | 76 % | 11.9 | 99 % | 3.8 | 0.2 | 38 % |
| Moorfestung – Kellergewölbe | en_k_c6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier + Brandmagier | klug | 76 % | 12.0 | 97 % | 4.1 | 0.5 | 54 % |
| Moorfestung – Kellergewölbe | en_k_s2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier | klug | 76 % | 12.1 | 98 % | 3.8 | 0.3 | 40 % |
| Moorfestung – Kellergewölbe | en_k_e | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Turmwache + Brandmagier | klug | 76 % | 12.3 | 42 % | 6.8 | 2.7 | 117 % |
| Moorfestung – Kellergewölbe | en_k_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter-Hauptmann + Kultwächter + Kultwächter (Boss) | klug | 70 % | 12.7 | 100 % | 5.7 | 0.1 | 24 % |
| Moorfestung – Blutgruft | en_b_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Blutdiener | klug | 70 % | 12.9 | 98 % | 5.7 | 0.4 | 50 % |
| Moorfestung – Blutgruft | en_b_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Gruftskelett | klug | 70 % | 13.0 | 99 % | 5.5 | 0.2 | 43 % |
| Moorfestung – Blutgruft | en_b_n2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Vampirbrut + Blutdiener | klug | 70 % | 13.2 | 99 % | 5.9 | 0.5 | 52 % |
| Moorfestung – Blutgruft | en_b_n3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut | klug | 70 % | 13.4 | 100 % | 4.4 | 0.2 | 35 % |
| Moorfestung – Blutgruft | en_b_n4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 70 % | 13.6 | 100 % | 2.3 | 0.0 | 9 % |
| Moorfestung – Blutgruft | en_b_g1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Blutdiener + Blutdiener | klug | 70 % | 13.7 | 100 % | 3.7 | 0.1 | 29 % |
| Moorfestung – Blutgruft | en_b_g2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener | klug | 70 % | 13.8 | 100 % | 3.5 | 0.1 | 21 % |
| Moorfestung – Blutgruft | en_b_g5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut + Brandmagier | klug | 70 % | 13.9 | 86 % | 8.4 | 1.0 | 87 % |
| Moorfestung – Blutgruft | en_b_m3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Vampirbrut | klug | 70 % | 14.0 | 75 % | 8.4 | 1.6 | 92 % |
| Moorfestung – Blutgruft | en_b_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 70 % | 14.3 | 100 % | 2.5 | 0.1 | 14 % |
| Moorfestung – Blutgruft | en_b_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Nebelgeist | klug | 70 % | 14.5 | 100 % | 3.4 | 0.1 | 23 % |
| Moorfestung – Blutgruft | en_b_boss | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutgräfin + Vampirbrut + Vampirbrut (Boss) | klug | 70 % | 14.7 | 58 % | 13.2 | 2.2 | 152 % |
| Spinnenhöhle | en_s_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 69 % | 14.8 | 100 % | 4.2 | 0.0 | 22 % |
| Spinnenhöhle | en_s_a2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 69 % | 14.9 | 100 % | 2.9 | 0.0 | 14 % |
| Spinnenhöhle | en_s_b1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne + Brutspinne | klug | 69 % | 14.9 | 100 % | 3.9 | 0.0 | 24 % |
| Spinnenhöhle | en_s_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter | klug | 69 % | 14.9 | 100 % | 5.6 | 0.1 | 36 % |
| Spinnenhöhle | en_s_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Netzwächter | klug | 69 % | 14.9 | 100 % | 4.4 | 0.1 | 33 % |
| Spinnenhöhle | en_s_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 69 % | 14.9 | 100 % | 3.6 | 0.0 | 17 % |
| Spinnenhöhle | en_s_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 69 % | 15.0 | 100 % | 4.5 | 0.1 | 32 % |
| Spinnenhöhle | en_s_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter + Brutspinne | klug | 69 % | 15.0 | 100 % | 5.6 | 0.2 | 46 % |
| Spinnenhöhle | en_s_k1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 69 % | 15.0 | 100 % | 2.7 | 0.0 | 13 % |
| Spinnenhöhle | en_s_k2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 69 % | 15.0 | 100 % | 4.9 | 0.1 | 35 % |
| Spinnenhöhle | en_s_l1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 69 % | 15.0 | 100 % | 2.8 | 0.0 | 14 % |
| Spinnenhöhle | en_s_l2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 69 % | 15.0 | 100 % | 2.9 | 0.0 | 15 % |
| Spinnenhöhle | en_s_boss | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Spinnenkönigin (Boss) | klug | 69 % | 15.0 | 100 % | 7.8 | 0.0 | 54 % |
| Die Gießerei | en_g_n1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Brandmagier | klug | 69 % | 15.0 | 100 % | 2.7 | 0.0 | 26 % |
| Die Gießerei | en_g_n1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Erzkäfer | klug | 69 % | 15.0 | 100 % | 3.7 | 0.1 | 40 % |
| Die Gießerei | en_g_n2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter + Erzkäfer | klug | 69 % | 15.0 | 97 % | 4.0 | 0.4 | 57 % |
| Die Gießerei | en_g_n2b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Schlackenwächter | klug | 69 % | 15.0 | 100 % | 4.5 | 0.1 | 41 % |
| Die Gießerei | en_g_n3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Schlackenwächter | klug | 69 % | 15.0 | 54 % | 8.2 | 2.4 | 127 % |
| Die Gießerei | en_g_n3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Gruftskelett + Gruftskelett | klug | 61 % | 15.0 | 100 % | 1.9 | 0.0 | 6 % |
| Die Gießerei | en_g_s1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Erzkäfer | klug | 61 % | 15.0 | 100 % | 2.0 | 0.0 | 13 % |
| Die Gießerei | en_g_s1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer | klug | 61 % | 15.0 | 100 % | 3.0 | 0.0 | 21 % |
| Die Gießerei | en_g_s2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter | klug | 61 % | 15.0 | 99 % | 3.8 | 0.1 | 42 % |
| Die Gießerei | en_g_s3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Schlackenwächter + Erzkäfer | klug | 61 % | 15.0 | 100 % | 3.9 | 0.1 | 34 % |
| Die Gießerei | en_g_s3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Brandmagier + Erzkäfer | klug | 61 % | 15.0 | 100 % | 4.1 | 0.2 | 61 % |
| Die Gießerei | en_g_boss | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Gießmeister Harkon + Schlackenwächter (Boss) | klug | 61 % | 15.0 | 84 % | 11.7 | 1.0 | 121 % |
| Die Zisterne | en_z_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Nebelgeist + Kultpriester | klug | 61 % | 15.0 | 76 % | 8.0 | 1.2 | 62 % |
| Die Zisterne | en_z_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Kultwächter + Gruftskelett | klug | 61 % | 15.0 | 100 % | 2.0 | 0.0 | 6 % |
| Die Zisterne | en_z_h3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Nebelgeist + Schlackenwächter | klug | 61 % | 15.0 | 96 % | 6.0 | 0.4 | 65 % |
| Die Zisterne | en_z_h4 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Nebelgeist + Nebelgeist | klug | 61 % | 15.0 | 100 % | 3.2 | 0.2 | 36 % |
| Die Zisterne | en_z_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Kultpriester | klug | 61 % | 15.0 | 100 % | 3.8 | 0.0 | 21 % |
| Die Zisterne | en_z_n2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Gruftskelett + Nebelgeist | klug | 61 % | 15.0 | 100 % | 3.4 | 0.1 | 37 % |
| Die Zisterne | en_z_n3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultpriester + Nebelgeist | klug | 61 % | 15.0 | 99 % | 4.4 | 0.0 | 26 % |
| Die Zisterne | en_z_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Kultwächter + Gruftskelett | klug | 61 % | 15.0 | 100 % | 2.0 | 0.0 | 6 % |
| Die Zisterne | en_z_s2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Nebelgeist | klug | 61 % | 15.0 | 98 % | 3.6 | 0.2 | 41 % |
| Die Zisterne | en_z_wn1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Gruftskelett + Gruftskelett | klug | 61 % | 15.0 | 100 % | 2.0 | 0.0 | 9 % |
| Die Zisterne | en_z_wn2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Nebelgeist | klug | 61 % | 15.0 | 100 % | 3.9 | 0.0 | 17 % |
| Die Zisterne | en_z_ws1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Gruftskelett + Kultwächter | klug | 61 % | 15.0 | 100 % | 2.1 | 0.0 | 11 % |
| Die Zisterne | en_z_ws2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 61 % | 15.0 | 99 % | 5.5 | 0.2 | 42 % |
| Die Zisterne | en_z_en1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Schlackenwächter + Nebelgeist | klug | 61 % | 15.0 | 60 % | 9.2 | 2.1 | 114 % |
| Die Zisterne | en_z_en2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultpriester | klug | 58 % | 15.0 | 100 % | 3.2 | 0.1 | 10 % |
| Die Zisterne | en_z_es1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Nebelgeist + Kultwächter | klug | 58 % | 15.0 | 100 % | 3.6 | 0.3 | 38 % |
| Die Zisterne | en_z_es2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Gruftskelett + Kultpriester | klug | 58 % | 15.0 | 99 % | 5.8 | 0.1 | 34 % |
| Die Zisterne | en_z_k1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 58 % | 15.0 | 99 % | 5.3 | 0.2 | 38 % |
| Die Zisterne | en_z_k2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Schlackenwächter + Kultwächter | klug | 58 % | 15.0 | 100 % | 3.9 | 0.1 | 36 % |
| Die Zisterne | en_z_k3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultwächter + Nebelgeist | klug | 58 % | 15.0 | 100 % | 2.8 | 0.0 | 26 % |
| Die Zisterne | en_z_k4 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Gruftskelett + Schlackenwächter | klug | 58 % | 15.0 | 100 % | 5.9 | 0.1 | 35 % |
| Die Zisterne | en_z_kk1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultwächter + Nebelgeist | klug | 58 % | 15.0 | 99 % | 3.6 | 0.2 | 40 % |
| Die Zisterne | en_z_kk2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Gruftskelett + Schlackenwächter | klug | 58 % | 15.0 | 98 % | 7.1 | 0.2 | 52 % |
| Die Zisterne | en_z_kk3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 58 % | 15.0 | 100 % | 5.3 | 0.1 | 37 % |
| Die Zisterne | en_z_h5 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Nebelgeist + Kultpriester | klug | 58 % | 15.0 | 100 % | 4.1 | 0.0 | 21 % |
| Die Zisterne | en_z_h6 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Schlackenwächter + Gruftskelett | klug | 58 % | 15.0 | 100 % | 3.6 | 0.0 | 35 % |
| Die Zisterne | en_z_h7 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Kultwächter | klug | 58 % | 15.0 | 100 % | 3.9 | 0.0 | 20 % |
| Die Zisterne | en_z_h8 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Nebelgeist | klug | 58 % | 15.0 | 100 % | 3.7 | 0.1 | 40 % |
| Die Zisterne | en_z_boss | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Quellhüterin Maris + Nebelgeist (Boss) | klug | 58 % | 15.0 | 93 % | 12.2 | 0.6 | 118 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
