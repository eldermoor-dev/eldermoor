# CHANGELOG – Die Schatten von Eldermoor

Quelle: HANDOVER.md (Stand 0.19.4, 16.11.2026). Neueste Version oben. Ausführliche Begründungen und Datenformate stehen in HANDOVER.md.
Status: „Gerät“ = vom Nutzer auf dem Galaxy S25 bestätigt. „headless“ = Node/Desktop-Chrome, nicht auf Gerät getestet. 0.16.8–0.16.13: Gesamtmeldung „Es passt alles“ am 16.11.2026.

## 0.16.x (Inhaltsphase, Nebelturm und Nacharbeiten)
| Version | Änderungen | Status |
|---|---|---|
| 0.30.1 | Inventar bleibt offen, wenn „Rasten“ gesperrt ist (Gegner nah); Meldung nur nach Tipp auf Rasten | headless, Gerät offen |
| 0.30.0 | Ausrüstungsübersicht „Wer trägt was“, im Inventar „Besser für: …“, ▲/▼ und „trägt X“ beim Ausrüsten (Flüche bleiben verborgen) | headless, Gerät offen |
| 0.29.0 | Ringe und Amulette (je Held 1+1, einzigartig, nur Boss/Rätsel), verfluchte Stücke mit Talent-Erkennung, Gefangener mit Wunsch + Ring in der Blutgruft, Waffenhändler Valdis | headless, Gerät offen |
| 0.28.0 | Moorsee: Fluss mit Brücke, See mit Steg, Fuhrmann (20 Gold) zur Schatzinsel, Gnom mit Würfelspiel (gerade Glücksamulett, ungerade Riesenspinne), Wasser/Bohlen im Raycaster und auf der Karte | headless, Gerät offen |
| 0.27.0 | Keller 2 „Blutgruft“: rote Palette, größere Ebene, Vampire (Diener, Brut, Gräfin), Zauberart Blutbiss (Lebensraub), Treppe aus dem Keller; sim.js bis Blutgruft | headless, Gerät offen |
| 0.26.7 | Kellertreppe „Tiefe“ steht an der Ostwand statt frei im Raum | headless, Gerät offen |
| 0.26.6 | Standpfeil auf der Karte größer, mit schwarzem Rand | headless, Gerät offen |
| 0.26.5 | Gegnergruppen stehen enger zusammen | headless, Gerät offen |
| 0.26.4 | Unentdeckte Falle im Bild dezenter (kleiner, kontrastärmer) | headless, Gerät offen |
| 0.26.3 | Gegner im Gang mit einer Wand: zwei nebeneinander, dritter dahinter; Bram: Bart neu; Wundkultist: Strich im Gesicht weg | headless, Gerät offen |
| 0.26.2 | Türen lassen sich aus 2 Feldern Abstand per Antippen öffnen (nicht Riegeltüren); Tests 126 | headless, Gerät offen |
| 0.26.1 | Eigene Bilder für Begegnungspersonen (Torfstecher Bram, Wachmann Gerwin, Wundkultist), nicht mehr Händlerin oder Gegnerbilder; Tests 125 | headless, Gerät offen |
| 0.19.18 | Truhen neu gezeichnet (gewölbter Deckel, Eisenbänder mit Nieten, Goldschloss, Maserung, 128 px, scharf); Beute in Truhen gekürzt (weniger Gold und Tränke, weniger Ausrüstung, niedrigere Qualitätsstufen); Bodenspur der Fallen dezenter; Tests 103 | headless, Gerät offen |
| 0.19.22 | Nebelhüter neu (Nutzer: „zu sehr Strichmännchen“): breiter Geisterkönig mit Eiszackenkrone, Stachelschultern, Rippen und leuchtendem Siegel in der Brust, Knochenklauen, Kristallstab, gezackter Mantelsaum, hoher Dornenthron mit Schädeln; Tests 103 | headless, Gerät offen |
| 0.19.21 | Nebelturm: Moos an den Wänden jetzt dunkelgrün statt blassblau-weiß (sah wie eine schlecht gemachte Geheimtür aus); Tests 103 | headless, Gerät offen |
| 0.19.20 | Turmwache neu (Vollplatte, Gitterhelm mit Flügeln, Stachelschultern, Turmschild mit Dellen/Nieten, Speer, Blutspuren, zerrissener Umhang) und Kultpriester neu (Spitzhaube mit drittem Auge, Goldsaum, rote Stola mit Zeichen, schwebendes Zauberbuch, Schädelstab mit Frostkugel, Räuchergefäß); Tests 103 | headless, Gerät offen |
| 0.19.19 | Hauptmann: Schwert sichtbar in der Faust (dunkler Handschuh, helle Fingerglieder, Daumen, Stulpe); andere Hand hält drohend einen blauen Ring hoch (Arm gereckt); Tests 103 | headless, Gerät offen |
| 0.19.17 | Hauptmann: goldener Ring auf der Brust (Mitte) entfernt; Tests 103 | headless, Gerät offen |
| 0.19.16 | Totenschädel im Siegelkreis am Schwertknauf bekommt blaue Augen; Tests 103 | headless, Gerät offen |
| 0.19.15 | Hauptmann-Schwert sieht wie ein Schwert aus (Spitze, Hohlkehle, helle Schneide, gebogene Parierstange, umwickelter Griff); Tests 103 | headless, Gerät offen |
| 0.19.14 | Hauptmann: Augen blau (neues Palettenmaterial `ice`, 80 Farben); Tests 103 | headless, Gerät offen |
| 0.19.13 | Hauptmann: Schwert kleiner, Totenschädel im Siegelkreis am Knauf, Boss insgesamt kleiner (Faktor 1,12); Schrift im Türrahmen (Türschwelle) jetzt ebenfalls Blutrot statt Gold; Blutschrift weniger verzerrt; Tests 103 | headless, Gerät offen |
| 0.19.12 | Hauptmann bleibt gepanzert; Siegelzeichen auf der Klinge jetzt Totenschädel mit gekreuzten Knochen (Deutung der Nutzerangabe); Tests 103 | headless, Gerät offen |
| 0.19.11 | Ausrüsten: gewählte Zeile hervorgehoben, Abfrage mit Qualität im Namen, Auswahl schließt nach dem Anlegen; Hauptmann (Siegel-Boss) größer mit Dornenkrone, Hörnern, Schulterdornen, Ketten, Siegel auf der Klinge, zerfetztem Umhang, Blut; Blutschrift von Hand geschmiert mit Tropfen; Tests 103 | headless, Gerät offen |
| 0.19.10 | Heller: Standard-Helligkeit „Sehr hell“ (1,8), neue Stufe „Maximal“ (2,4); bestehende Einstellung unter 1,8 wird einmalig auf 1,8 angehoben (Einstellungen v3); Tests 103 | headless, Gerät offen |
| 0.19.9 | Fallen früher erkennbar: Bodenspur als graue, rissige Platte mit Staub (vorher kaum sichtbar); zwei Entdeckungswürfe je Falle (2 Felder und 1 Feld Abstand, für alle Gruppen), Grundchance 35 → 45 %; Tests 103 | headless, Gerät offen |
| 0.19.8 | Schriftzüge in Blutrot mit dunkler Kontur statt dunkelbraun (neues Palettenmaterial `blood`, 72 Farben); Tests 103 | headless, Gerät offen |
| 0.19.7 | Gegnergruppen im engen Gang bleiben zwischen den Wänden (Seitenabstand begrenzt, äußere Figuren gestaffelt); Tests 103 | headless, Gerät offen |
| 0.19.6 | Meldungsfeld: außerhalb des Kampfes max. 2 Meldungen à 2 Zeilen, blenden nach 3–6 s aus (Blick auf den Gang frei); Tests 103 | headless, Gerät offen |
| 0.19.5 | Wölfe größer; Schriftzug düster (klein, rostbraun, abgeplatzt, Laufspuren); Karte zoom- und verschiebbar per Fingergeste; Tests 103 | headless, Gerät offen |
| 0.19.4 | Weniger Truhen am Anfang, Starttruhe bescheidener, Truhen- und Gegnerbeute seltener hochwertig; besondere Truhen bleiben stark | headless, Gerät offen |
| 0.19.3 | Wölfe größer, Zweiergruppen weiter auseinander | headless, Gerät offen |
| 0.19.2 | Sumpfwolf von vorn, Gegnergruppen ohne Überschneidung (kleiner, neue Abstände) | headless, Gerät offen |
| 0.19.1 | Heldenleiste: Namen nicht mehr abgeschnitten, Reihe unter dem Porträt, Werte einzeilig (Mana blau, Ausdauer gelb) | headless, Gerät offen |
| 0.19.0 | Bewegliche Steine (schieben, ziehen), Druckplatten, Rätselraum in den Schratgruben, Geheimkammer in der Kultgruft; Tests 103 | headless, Gerät offen |
| 0.18.0 | Blutung und Fluch, sechs Kombinationsangriffe, Fallen (entdecken, untersuchen, entschärfen, Talent), fünf Fallen mit Wandhinweis; Tests 102 | headless, Gerät offen |
| 0.17.0 | Talente (72, Stufe 15), Alchemist, Schwierigkeit Normal/Schwer, mittlere Gebiete schwerer, Bosse ganz im Bild, Nebelhüter mit Thron; Tests 99 | headless, Gerät offen |
| 0.16.17 | Kampfbild: Blick zum Boden geneigt + Größenanpassung; Eck-Treppen nur ein Bogen; Gegnergruppen auch im Gang nebeneinander; Tests 93 | headless, Gerät offen |
| 0.16.16 | Moorkultist neu (192 px: Widderhörner, Reißzähne, Sägedolch, Zauberhand, Augen-Siegel) und Moorlicht neu (Flamme mit Geistergesicht, Greifarme, Funken); Tests 93 | headless, Gerät offen |
| 0.16.15 | Kampfdistanz wieder 1 Feld (nur gerade Nachbarfelder, Kamera weicht im Kampf nicht mehr zurück); Treppen/Bögen/Ausgänge an Wänden als Wand-Abziehbild statt frontalem Bild; Tests 93 | headless, Gerät offen |
| 0.16.14 | Schilder schärfer: Schrift bei allen Schriftarten dicker, einzeilige Titel bis Faktor 4, Tafelbreite begrenzt; Fix: Türen aus alten Spielständen übernehmen `style` und `title` aus game.json (vorher Zufallsstil); Tests 93 | headless, Gerät offen |
| 0.16.13 | Sumpfwolf neu (vierbeinig, schwarz, grüne Moosflecken, 1,3× größer); Gruppe wendet sich beim Kampfstart dem Gegner zu; Sperrmeldung beim Drehen nennt die Kampfknöpfe; „kann nicht angreifen“ nicht nachstellbar (Ursache offen); Tests 91 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.12 | Neue Kampffiguren: Skelett, Kultwächter, Turmwache, Hauptmann, Sumpfwolf, Moorkultist (128×128, Umriss, leuchtende Augen); Tests 90 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.11 | Schilder, Türschilder, Türrahmen scharf (192×192); 9 Stile (Holz, dunkel, Stein, Eisen, Moos, Pfeil, Bogen, Banner, klein); Tests 89 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.10 | Gegner entdecken die Gruppe (Sichtlinie bis 2 Felder, Überfall wenn nicht in Blickrichtung, keine Ausnahmen); Tests 89 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.9 | Ankunftsrichtung: nach Übergängen kein Blick gegen die Wand (`arrivalDir`) | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.8 | Wandtafeln als Abziehbild an der Wand (`face`), lesbar per Tippen/◉; Türschilder (8 Türen); offene Tür bleibt als Rahmen mit Türblatt; Tore drehen sich nicht mehr beim Vorbeigehen (`axis`); Abziehbilder gespiegelt (keine Spiegelschrift); Tests 87 | Gerät: „passt“ (Gesamtmeldung) |
| 0.16.7 | Kampagnen-Simulation (sim.js Abschnitt C); Nebelgeist, Kultpriester, Nebelhüter schwerer; neuer Gegner Turmwache; Debug „Dieses Gebiet zurücksetzen“; Tests 86 | Gerät: „passt“ (Nebelhüter) |
| 0.16.6 | Kartenlegende neben bzw. unter der Karte, kein eigenes Fenster | Gerät: „passt“ |
| 0.16.5 | Gruppen im engen Gang gestaffelt; offene Truhe neu gezeichnet; Runenstein im Testgewölbe (`runestone`); Hedda per Antippen; Tests 84 | Gerät: „passt“ |
| 0.16.4 | Fix Kopf antippen (`#party` pointer-events); Monster/Truhen größer über der Leiste (Horizont-Verschiebung); Bossphasen als Banner; Rast-Regel (Sicht, 10 Schritte Weglänge); Kartenlegende; Truhen-Wächter (`chest.guard`); Hinweis beim erneuten Betreten des Ausgangs; Tests 83 | Gerät: „passt“ |
| 0.16.3 | Hedda neu gezeichnet | Gerät: ok |
| 0.16.2 | Charakterkopf antippen (Zaubern/Heilen); Gegnerzauber-Schaden begrenzt (50 %/40 % der Max-LP); Debug: Gebiet wechseln, Alle +1 Stufe | Gerät: Kopf-Tipp ging nicht (behoben in 0.16.4) |
| 0.16.1 | Geheimwand-Prototyp (`secret`), versteckter Schalterstein; Nebelturm-Kammer südlich des Archivs; Tests 78 | Gerät: ok |
| 0.16.0 | Priester heißt Kleriker; Gegnerzauber (`cast`, angekündigt/unangekündigt); Nebelturm mit Nebelhüter (3 Phasen); Tests 77 | Gerät: ok |

## 0.15.x
| Version | Änderungen |
|---|---|
| 0.15.17 | Eigene Sprites für Moorschrat und Grubenschrat |
| 0.15.16 | Händler: Rede groß und mittig, danach Shop direkt; Schrat-Bosse geglättet |
| 0.15.15 | Heilziel per Heldenkopf (Inventar, Kampf) |
| 0.15.14 | Angekündigte schwere Angriffe treffen nur die Vorderreihe, solange dort jemand steht |
| 0.15.13 | Kampf: Hinweistext beim Knopf „Gegenstand“, wenn nichts nutzbar ist |
| 0.15.12 | Karte: Türen als Balken quer zum Gang |
| 0.15.11 | Einstellung „Helligkeit der Umgebung“ (Standard Hell) |
| 0.15.10 | Kampf: Gegenstände nur für den aktiven Helden, nur an sich selbst |
| 0.15.9 | Schilder: Platzhalter-Linien entfernt, Schrift geglättet |
| 0.15.8 | Sprechende NPCs: große Sprechblase |
| 0.15.7 | Karte passt ohne Scrollen |
| 0.15.6 | Monster-Sprites im Modus Scharf geglättet |
| 0.15.5 | Schilder mit lesbaren Titeln (5×7-Pixelschrift) |
| 0.15.4 | Händler-/Inventarzeilen: Knopf rechts, Symbole vor Gegenständen |
| 0.15.3 | Ausgänge als Runenstein statt Goldring |
| 0.15.2 | Gegenlaufen/Antippen benutzt Tür, Truhe, Hebel, Gitter; Boss-Sprite Schrat |
| 0.15.1 | Auftrittsbanner (Boss/Gebiet); Fallgitter und Hebel; Ölflasche, Gegengift |
| 0.15.0 | Bedienung: Top-Leiste entfernt, Menü-Feld, Kompass; geöffnete Truhen begehbar; Hauptmann 160 LP; Gebiet Schratgruben; Erzkäfer; Boss Grubenschrat |

## 0.14.x
| Version | Änderungen |
|---|---|
| 0.14.8 | Pfeil im Schlussstein der Treppen entfernt |
| 0.14.7 | Treppen-Sprites neu (Steinbogen mit Treppe) |
| 0.14.6 | Grafik schärfer/glatter (256er Wände, 128er Boden/Decke), Moos neu, Wandfackeln |
| 0.14.5 | Tafeln: höchstens 2 Felder Abstand |
| 0.14.4 | Bestiarium: Elementtexte „anfällig/resistent“ |
| 0.14.3 | Fix Gruppenbild im Kampf (Bild nach Art, nicht nach Platz) |
| 0.14.2 | Tafeln per Antippen lesbar, schärferes Schild |
| 0.14.1 | Treppen neu gezeichnet |
| 0.14.0 | Kultgruft mit Zwischenboss Hauptmann; neue Gegner Skelett, Kultwächter; Treppenarten |

## 0.13.0 – 0.5.0
| Version | Änderungen |
|---|---|
| 0.13.0 | Moorpfad, Hinweistafeln, Moorlicht, Auftrag bei Hedda; `syncStatic` für alte Stände |
| 0.12.0 | Händlerin Hedda und Siedlung am Moorrand |
| 0.11.0 | Fehlerlog, Verkaufen |
| 0.10.0 | Beutesystem, Speicherstand v6 |
| 0.9.1 | Warnung vor Schwerem Schlag (Balken, Ton, Vibration) |
| 0.9.0 | Bossphasen, Bestiarium |
| 0.8.0 | Mehrere Gebiete, Treppen, Speicherstand v5 |
| 0.7.1 | Tests erweitert (46) |
| 0.7.0 | Runenzauber, Elemente, Brennen/Verlangsamt |
| 0.6.0 | Ausrüstung (Waffe, Rüstung) |
| 0.5.0 | Rast und Proviant |

## 0.4.x und älter
| Version | Änderungen |
|---|---|
| 0.4.6 | Doppeltipp-Schutz (450 ms); Schritt 3 abgeschlossen |
| 0.4.5 | Gegnerfigur antippen wählt das Ziel |
| 0.4.4 | Gegnerfenster links, halbtransparent |
| 0.4.3 | Zielwahl: größere Tippflächen |
| 0.4.2 | Gruppenfiguren zeigen nur lebende Gegner |
| 0.4.1 | Fix Zielwahl (`S.target` → `S.foe`) |
| 0.4.0 | Gegnergruppen bis 3, Zielwahl, „Alle“, neue Gegner, Rechenweg |
| 0.3.2 | Bewusstlose verlieren Statuswirkungen |
| 0.3.1 | Statuswirkungen Gift, Betäubt, Schwach |
| 0.3.0 | Ressourcen und Fähigkeiten je Beruf |
| 0.2.2 | Stufen, EP, BALANCE.md |
| 0.2.1 | Charakteransicht, Zufällige Gruppe |
| 0.2.0 | Gruppeneditor, Rassen und Berufe, Spielstand v2 |
| 0.1.5 | Bildschärfe Scharf/Retro |
| 0.1.4 | Monster-Sprite neu |
| 0.1.3 | Layout `fitStack()` |
| 0.1.2 | Kampfprotokoll, Zugbalken, Geräusche einzeln abschaltbar |
| 0.1.1 | Fackelflackern als Einstellung |

Detailwerte und Begründungen stehen nur in HANDOVER.md. Plan: 0.16.17 Nebelhüter neu + Thron, 0.16.18 mittlere Gebiete schwerer, 0.17 Talente.
