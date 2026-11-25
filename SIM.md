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
| nur Angriff | nein | 100 % | 88 % | 38 % | 5.3 |
| nur Angriff | mit Proviant (3) | 100 % | 100 % | 99 % | 1.8 |
| nur Angriff | immer voll | 100 % | 100 % | 99 % | 1.8 |
| klug | nein | 100 % | 100 % | 98 % | 1.4 |
| klug | mit Proviant (3) | 100 % | 100 % | 100 % | 0.4 |
| klug | immer voll | 100 % | 100 % | 100 % | 0.4 |

## C) Ganze Kampagne (Testgewölbe → Blutgruft), natürliche Stufen, Beute, Rast, Einkauf
Annahmen stehen in sim.js über `campaign`. „1. Versuch“ = Sieg ohne vorherige Niederlage gegen diesen Gegner. Schaden = Anteil der Max-LP der Gruppe, den die Gegner im 1. Versuch abziehen.
600 Läufe je Strategie.

| Strategie | Kampagne geschafft | Ø Stufe am Ende | Niederlagen je Lauf |
|---|---|---|---|
| nur Angriff | 0 % | 4.2 | 3.8 |
| klug | 32 % | 11.4 | 4.1 |
| klug + Schmied (gibt Gold bei Brann aus) | 38 % | 11.8 | 3.9 |

Hinweis: Die Zeile „klug + Schmied“ zeigt, ob Aufwertungen für Gold die Kampagne spürbar leichter machen. Körperteile, Küche und Kampftränke sind nicht simuliert.

| Gebiet | Gegner | Strategie | erreicht | Ø Stufe | Sieg 1. Versuch | Runden | KO-Helden | Schaden |
|---|---|---|---|---|---|---|---|---|
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | nur Angriff | 100 % | 1.0 | 100 % | 3.0 | 0.8 | 31 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Sumpfwolf | klug | 100 % | 1.0 | 100 % | 2.2 | 0.3 | 24 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | nur Angriff | 100 % | 1.0 | 100 % | 3.4 | 0.3 | 33 % |
| Testgewölbe (Phase 1) | Sumpfwolf + Moorkultist + Moorkultist | klug | 100 % | 1.0 | 100 % | 2.8 | 0.1 | 30 % |
| Untere Gruft | Moorkultist + Moorkultist | nur Angriff | 100 % | 2.0 | 100 % | 2.4 | 0.0 | 11 % |
| Untere Gruft | Moorkultist + Moorkultist | klug | 100 % | 2.0 | 100 % | 2.0 | 0.0 | 6 % |
| Moorpfad | Sumpfwolf | nur Angriff | 100 % | 2.5 | 100 % | 1.8 | 0.2 | 10 % |
| Moorpfad | Sumpfwolf | klug | 100 % | 2.9 | 100 % | 1.2 | 0.0 | 7 % |
| Moorpfad | Moorlicht + Moorlicht | nur Angriff | 100 % | 2.7 | 100 % | 2.2 | 0.1 | 15 % |
| Moorpfad | Moorlicht + Moorlicht | klug | 100 % | 2.9 | 100 % | 1.7 | 0.0 | 11 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | nur Angriff | 100 % | 2.9 | 97 % | 5.1 | 1.8 | 52 % |
| Moorpfad | Sumpfwolf + Moorlicht + Sumpfwolf | klug | 100 % | 3.0 | 100 % | 3.7 | 0.7 | 44 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | nur Angriff | 100 % | 3.0 | 100 % | 3.4 | 0.1 | 24 % |
| Moorpfad | Moorkultist + Moorkultist + Moorlicht | klug | 100 % | 3.3 | 100 % | 2.3 | 0.0 | 14 % |
| Kultgruft | Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.3 | 100 % | 4.0 | 1.2 | 35 % |
| Kultgruft | Gruftskelett + Gruftskelett | klug | 100 % | 3.8 | 100 % | 2.5 | 0.3 | 20 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | nur Angriff | 100 % | 3.6 | 96 % | 6.1 | 2.0 | 60 % |
| Kultgruft | Moorkultist + Gruftskelett + Gruftskelett | klug | 100 % | 3.9 | 100 % | 3.2 | 0.4 | 30 % |
| Kultgruft | Kultwächter + Moorkultist | nur Angriff | 100 % | 3.6 | 92 % | 5.1 | 1.2 | 42 % |
| Kultgruft | Kultwächter + Moorkultist | klug | 100 % | 4.0 | 100 % | 2.7 | 0.1 | 17 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | nur Angriff | 100 % | 4.0 | 13 % | 6.3 | 3.8 | 84 % |
| Kultgruft | Gruftskelett + Kultwächter + Gruftskelett | klug | 100 % | 4.7 | 100 % | 4.2 | 0.7 | 42 % |
| Kultgruft | Kultwächter + Kultwächter | nur Angriff | 36 % | 4.2 | 24 % | 5.8 | 3.5 | 53 % |
| Kultgruft | Kultwächter + Kultwächter | klug | 100 % | 4.8 | 100 % | 3.4 | 0.2 | 21 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | nur Angriff | 31 % | 4.7 | 0 % | 8.2 | 4.0 | 72 % |
| Kultgruft | Kultwächter-Hauptmann (Boss) | klug | 100 % | 5.6 | 99 % | 8.5 | 0.7 | 62 % |
| Schratgruben | Erzkäfer + Erzkäfer | nur Angriff | 1 % | 5.3 | 60 % | 5.2 | 2.2 | 51 % |
| Schratgruben | Erzkäfer + Erzkäfer | klug | 100 % | 5.8 | 100 % | 3.2 | 0.1 | 29 % |
| Schratgruben | Gruftskelett + Gruftskelett | nur Angriff | 1 % | 5.5 | 100 % | 4.0 | 1.4 | 25 % |
| Schratgruben | Gruftskelett + Gruftskelett | klug | 100 % | 5.9 | 100 % | 2.2 | 0.1 | 12 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | nur Angriff | 1 % | 5.5 | 20 % | 5.6 | 3.8 | 67 % |
| Schratgruben | Gruftskelett + Erzkäfer + Gruftskelett | klug | 100 % | 6.1 | 100 % | 4.9 | 0.4 | 50 % |
| Schratgruben | Kultwächter + Erzkäfer | nur Angriff | 0 % | 5.8 | 0 % | 3.0 | 4.0 | 38 % |
| Schratgruben | Kultwächter + Erzkäfer | klug | 100 % | 6.7 | 100 % | 3.3 | 0.1 | 26 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | nur Angriff | 0 % | 6.0 | 100 % | 5.0 | 1.0 | 34 % |
| Schratgruben | Moorlicht + Moorlicht + Erzkäfer | klug | 100 % | 6.8 | 100 % | 3.2 | 0.2 | 30 % |
| Schratgruben | Moorschrat (Boss) | nur Angriff | 0 % | 6.5 | 0 % | 8.0 | 4.0 | 67 % |
| Schratgruben | Moorschrat (Boss) | klug | 100 % | 6.9 | 97 % | 6.9 | 0.5 | 53 % |
| Nebelturm | en_t1 | nur Angriff | 0 % | – | – | – | – | – |
| Nebelturm | Nebelgeist + Nebelgeist | klug | 100 % | 7.5 | 100 % | 2.8 | 0.2 | 26 % |
| Nebelturm | en_t2 | nur Angriff | 0 % | – | – | – | – | – |
| Nebelturm | Turmwache + Kultpriester | klug | 100 % | 7.7 | 100 % | 6.8 | 0.2 | 36 % |
| Nebelturm | en_t3 | nur Angriff | 0 % | – | – | – | – | – |
| Nebelturm | Turmwache + Kultpriester + Nebelgeist | klug | 100 % | 7.8 | 56 % | 9.9 | 2.1 | 119 % |
| Nebelturm | en_t4 | nur Angriff | 0 % | – | – | – | – | – |
| Nebelturm | Nebelgeist + Nebelgeist + Nebelgeist | klug | 98 % | 8.1 | 74 % | 5.3 | 1.7 | 69 % |
| Nebelturm | en_tboss | nur Angriff | 0 % | – | – | – | – | – |
| Nebelturm | Nebelhüter (Boss) | klug | 98 % | 8.4 | 35 % | 15.3 | 2.9 | 173 % |
| Moorfestung – Vorburg | en_f1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Gruftskelett + Kultwächter + Gruftskelett | klug | 93 % | 8.7 | 100 % | 2.6 | 0.1 | 12 % |
| Moorfestung – Vorburg | en_f2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Brandmagier | klug | 93 % | 8.8 | 100 % | 4.3 | 0.1 | 47 % |
| Moorfestung – Vorburg | en_f3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Nebelgeist + Brandmagier | klug | 93 % | 9.0 | 100 % | 3.0 | 0.1 | 25 % |
| Moorfestung – Vorburg | en_f4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Turmwache + Nebelgeist | klug | 93 % | 9.3 | 99 % | 4.1 | 0.2 | 39 % |
| Moorfestung – Vorburg | en_f5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Erzkäfer + Kultwächter + Erzkäfer | klug | 93 % | 9.5 | 100 % | 2.5 | 0.0 | 15 % |
| Moorfestung – Vorburg | en_f6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Vorburg | Brandmagier + Turmwache | klug | 93 % | 9.6 | 100 % | 4.8 | 0.2 | 50 % |
| Moorfestung – Kellergewölbe | en_k_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter + Gruftskelett + Gruftskelett | klug | 93 % | 9.8 | 100 % | 2.3 | 0.0 | 10 % |
| Moorfestung – Kellergewölbe | en_k_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Kultwächter | klug | 93 % | 9.9 | 100 % | 3.0 | 0.0 | 17 % |
| Moorfestung – Kellergewölbe | en_k_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier + Turmwache | klug | 93 % | 10.1 | 17 % | 7.4 | 3.5 | 137 % |
| Moorfestung – Kellergewölbe | en_k_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier | klug | 32 % | 10.5 | 99 % | 2.6 | 0.3 | 14 % |
| Moorfestung – Kellergewölbe | en_k_o1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Kultwächter | klug | 32 % | 10.7 | 100 % | 2.2 | 0.1 | 9 % |
| Moorfestung – Kellergewölbe | en_k_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Gruftskelett + Gruftskelett + Gruftskelett | klug | 32 % | 10.8 | 100 % | 1.9 | 0.0 | 4 % |
| Moorfestung – Kellergewölbe | en_k_c3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Erzkäfer + Erzkäfer + Nebelgeist | klug | 32 % | 10.9 | 100 % | 2.7 | 0.0 | 23 % |
| Moorfestung – Kellergewölbe | en_k_c5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Brandmagier + Turmwache | klug | 32 % | 11.1 | 99 % | 3.4 | 0.1 | 30 % |
| Moorfestung – Kellergewölbe | en_k_c6 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Nebelgeist + Brandmagier + Brandmagier | klug | 32 % | 11.3 | 100 % | 3.4 | 0.2 | 39 % |
| Moorfestung – Kellergewölbe | en_k_s2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Brandmagier | klug | 32 % | 11.5 | 100 % | 3.0 | 0.1 | 24 % |
| Moorfestung – Kellergewölbe | en_k_e | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Turmwache + Turmwache + Brandmagier | klug | 32 % | 11.6 | 84 % | 6.1 | 1.2 | 92 % |
| Moorfestung – Kellergewölbe | en_k_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Kellergewölbe | Kultwächter-Hauptmann + Kultwächter + Kultwächter (Boss) | klug | 32 % | 11.8 | 100 % | 5.3 | 0.1 | 22 % |
| Moorfestung – Blutgruft | en_b_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Blutdiener | klug | 32 % | 12.0 | 99 % | 5.0 | 0.3 | 42 % |
| Moorfestung – Blutgruft | en_b_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Gruftskelett | klug | 32 % | 12.3 | 98 % | 7.2 | 0.4 | 55 % |
| Moorfestung – Blutgruft | en_b_n2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Vampirbrut + Blutdiener | klug | 32 % | 12.5 | 99 % | 5.2 | 0.4 | 42 % |
| Moorfestung – Blutgruft | en_b_n3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut | klug | 32 % | 12.6 | 99 % | 5.0 | 0.2 | 37 % |
| Moorfestung – Blutgruft | en_b_n4 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 32 % | 12.7 | 100 % | 2.2 | 0.0 | 7 % |
| Moorfestung – Blutgruft | en_b_g1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutdiener + Blutdiener + Blutdiener | klug | 32 % | 12.7 | 100 % | 3.4 | 0.2 | 26 % |
| Moorfestung – Blutgruft | en_b_g2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener | klug | 32 % | 12.8 | 100 % | 3.3 | 0.1 | 18 % |
| Moorfestung – Blutgruft | en_b_g5 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Vampirbrut + Brandmagier | klug | 32 % | 13.0 | 92 % | 7.3 | 0.7 | 69 % |
| Moorfestung – Blutgruft | en_b_m3 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Blutdiener + Vampirbrut | klug | 32 % | 13.3 | 96 % | 6.4 | 0.6 | 60 % |
| Moorfestung – Blutgruft | en_b_m1 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Gruftskelett + Blutdiener + Gruftskelett | klug | 32 % | 13.5 | 100 % | 2.2 | 0.1 | 10 % |
| Moorfestung – Blutgruft | en_b_m2 | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Vampirbrut + Nebelgeist | klug | 32 % | 13.7 | 100 % | 3.0 | 0.1 | 18 % |
| Moorfestung – Blutgruft | en_b_boss | nur Angriff | 0 % | – | – | – | – | – |
| Moorfestung – Blutgruft | Blutgräfin + Vampirbrut + Vampirbrut (Boss) | klug | 32 % | 13.8 | 75 % | 12.4 | 1.5 | 135 % |
| Spinnenhöhle | en_s_a1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 32 % | 14.1 | 100 % | 3.9 | 0.1 | 17 % |
| Spinnenhöhle | en_s_a2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 32 % | 14.2 | 100 % | 2.7 | 0.0 | 11 % |
| Spinnenhöhle | en_s_b1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne + Brutspinne | klug | 32 % | 14.3 | 100 % | 3.9 | 0.0 | 23 % |
| Spinnenhöhle | en_s_c1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter | klug | 32 % | 14.4 | 100 % | 5.7 | 0.1 | 33 % |
| Spinnenhöhle | en_s_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Netzwächter | klug | 32 % | 14.5 | 100 % | 4.4 | 0.1 | 29 % |
| Spinnenhöhle | en_s_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Brutspinne + Brutspinne | klug | 32 % | 14.6 | 100 % | 3.5 | 0.0 | 16 % |
| Spinnenhöhle | en_s_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 32 % | 14.7 | 100 % | 4.0 | 0.1 | 24 % |
| Spinnenhöhle | en_s_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Riesenspinne + Netzwächter + Brutspinne | klug | 32 % | 14.7 | 100 % | 4.7 | 0.1 | 33 % |
| Spinnenhöhle | en_s_k1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 32 % | 14.8 | 100 % | 2.3 | 0.0 | 9 % |
| Spinnenhöhle | en_s_k2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Riesenspinne | klug | 32 % | 14.8 | 100 % | 4.7 | 0.0 | 30 % |
| Spinnenhöhle | en_s_l1 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 32 % | 14.8 | 100 % | 2.4 | 0.0 | 10 % |
| Spinnenhöhle | en_s_l2 | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Netzwächter + Brutspinne | klug | 32 % | 14.9 | 100 % | 2.7 | 0.0 | 11 % |
| Spinnenhöhle | en_s_boss | nur Angriff | 0 % | – | – | – | – | – |
| Spinnenhöhle | Spinnenkönigin (Boss) | klug | 32 % | 14.9 | 100 % | 7.0 | 0.0 | 42 % |
| Die Gießerei | en_g_n1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Brandmagier | klug | 32 % | 14.9 | 100 % | 2.4 | 0.0 | 21 % |
| Die Gießerei | en_g_n1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Erzkäfer | klug | 32 % | 15.0 | 100 % | 3.2 | 0.0 | 29 % |
| Die Gießerei | en_g_n2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter + Erzkäfer | klug | 32 % | 15.0 | 100 % | 3.4 | 0.1 | 41 % |
| Die Gießerei | en_g_n2b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Schlackenwächter | klug | 32 % | 15.0 | 100 % | 4.1 | 0.1 | 33 % |
| Die Gießerei | en_g_n3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer + Schlackenwächter | klug | 32 % | 15.0 | 84 % | 7.3 | 1.0 | 99 % |
| Die Gießerei | en_g_n3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Gruftskelett + Gruftskelett | klug | 32 % | 15.0 | 100 % | 1.7 | 0.0 | 5 % |
| Die Gießerei | en_g_s1a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Erzkäfer + Erzkäfer + Erzkäfer | klug | 32 % | 15.0 | 100 % | 2.0 | 0.0 | 11 % |
| Die Gießerei | en_g_s1b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Erzkäfer | klug | 32 % | 15.0 | 100 % | 2.5 | 0.0 | 17 % |
| Die Gießerei | en_g_s2a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Brandmagier + Schlackenwächter | klug | 32 % | 15.0 | 100 % | 3.2 | 0.0 | 29 % |
| Die Gießerei | en_g_s3a | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Kultwächter + Schlackenwächter + Erzkäfer | klug | 32 % | 15.0 | 100 % | 3.4 | 0.0 | 26 % |
| Die Gießerei | en_g_s3b | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Schlackenwächter + Brandmagier + Erzkäfer | klug | 32 % | 15.0 | 99 % | 3.9 | 0.2 | 52 % |
| Die Gießerei | en_g_boss | nur Angriff | 0 % | – | – | – | – | – |
| Die Gießerei | Gießmeister Harkon + Schlackenwächter (Boss) | klug | 32 % | 15.0 | 95 % | 8.8 | 0.3 | 76 % |
| Die Zisterne | en_z_h1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Nebelgeist + Kultpriester | klug | 32 % | 15.0 | 96 % | 6.6 | 0.3 | 42 % |
| Die Zisterne | en_z_h2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Kultwächter + Gruftskelett | klug | 32 % | 15.0 | 100 % | 1.9 | 0.0 | 5 % |
| Die Zisterne | en_z_h3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Nebelgeist + Schlackenwächter | klug | 32 % | 15.0 | 100 % | 5.3 | 0.2 | 44 % |
| Die Zisterne | en_z_h4 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Nebelgeist + Nebelgeist | klug | 32 % | 15.0 | 99 % | 3.1 | 0.1 | 28 % |
| Die Zisterne | en_z_n1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Kultpriester | klug | 32 % | 15.0 | 100 % | 3.7 | 0.0 | 17 % |
| Die Zisterne | en_z_n2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Gruftskelett + Nebelgeist | klug | 32 % | 15.0 | 100 % | 3.1 | 0.1 | 31 % |
| Die Zisterne | en_z_n3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultpriester + Nebelgeist | klug | 32 % | 15.0 | 100 % | 3.7 | 0.0 | 18 % |
| Die Zisterne | en_z_s1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Kultwächter + Gruftskelett | klug | 32 % | 15.0 | 100 % | 1.9 | 0.0 | 7 % |
| Die Zisterne | en_z_s2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Nebelgeist | klug | 32 % | 15.0 | 100 % | 3.4 | 0.1 | 33 % |
| Die Zisterne | en_z_wn1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Gruftskelett + Gruftskelett | klug | 32 % | 15.0 | 100 % | 1.9 | 0.0 | 6 % |
| Die Zisterne | en_z_wn2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Nebelgeist | klug | 32 % | 15.0 | 100 % | 3.2 | 0.0 | 12 % |
| Die Zisterne | en_z_ws1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Gruftskelett + Kultwächter | klug | 32 % | 15.0 | 100 % | 1.9 | 0.0 | 8 % |
| Die Zisterne | en_z_ws2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 32 % | 15.0 | 100 % | 4.5 | 0.1 | 32 % |
| Die Zisterne | en_z_en1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Schlackenwächter + Nebelgeist | klug | 32 % | 15.0 | 87 % | 7.2 | 0.8 | 78 % |
| Die Zisterne | en_z_en2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultpriester | klug | 32 % | 15.0 | 100 % | 2.4 | 0.0 | 7 % |
| Die Zisterne | en_z_es1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Nebelgeist + Kultwächter | klug | 32 % | 15.0 | 100 % | 3.1 | 0.0 | 29 % |
| Die Zisterne | en_z_es2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Gruftskelett + Kultpriester | klug | 32 % | 15.0 | 100 % | 4.7 | 0.0 | 26 % |
| Die Zisterne | en_z_k1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 32 % | 15.0 | 100 % | 4.3 | 0.1 | 31 % |
| Die Zisterne | en_z_k2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Schlackenwächter + Kultwächter | klug | 32 % | 15.0 | 100 % | 3.3 | 0.0 | 25 % |
| Die Zisterne | en_z_k3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultwächter + Nebelgeist | klug | 32 % | 15.0 | 100 % | 2.6 | 0.0 | 20 % |
| Die Zisterne | en_z_k4 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Gruftskelett + Schlackenwächter | klug | 32 % | 15.0 | 100 % | 4.9 | 0.0 | 27 % |
| Die Zisterne | en_z_kk1 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Kultwächter + Nebelgeist | klug | 32 % | 15.0 | 100 % | 3.1 | 0.1 | 32 % |
| Die Zisterne | en_z_kk2 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultpriester + Gruftskelett + Schlackenwächter | klug | 32 % | 15.0 | 99 % | 5.5 | 0.1 | 36 % |
| Die Zisterne | en_z_kk3 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Nebelgeist | klug | 32 % | 15.0 | 100 % | 4.2 | 0.1 | 31 % |
| Die Zisterne | en_z_h5 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Kultwächter + Nebelgeist + Kultpriester | klug | 32 % | 15.0 | 100 % | 3.7 | 0.0 | 16 % |
| Die Zisterne | en_z_h6 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Gruftskelett + Schlackenwächter + Gruftskelett | klug | 32 % | 15.0 | 100 % | 2.8 | 0.0 | 22 % |
| Die Zisterne | en_z_h7 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Nebelgeist + Kultpriester + Kultwächter | klug | 32 % | 15.0 | 100 % | 3.5 | 0.0 | 16 % |
| Die Zisterne | en_z_h8 | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Schlackenwächter + Nebelgeist | klug | 32 % | 15.0 | 100 % | 3.4 | 0.1 | 33 % |
| Die Zisterne | en_z_boss | nur Angriff | 0 % | – | – | – | – | – |
| Die Zisterne | Quellhüterin Maris + Nebelgeist (Boss) | klug | 32 % | 15.0 | 98 % | 9.6 | 0.2 | 88 % |

Hinweis: Die Simulation nutzt die echten Regeln, aber nur zwei feste Strategien. Ein echter Spieler liegt dazwischen.
