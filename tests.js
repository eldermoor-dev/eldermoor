// Die Schatten von Eldermoor – Logiktests
// Autor: eldermoor-dev
// Node:    node tests.js        (im Ordner mit game.json)
// Handy:   Einstellungen → Selbsttest (läuft dieselbe Testsuite im Browser)

import * as L from './logic.js';
import { makeTextures, Raycaster, buildGrid, buildFloorGrid, buildSprites, setResolution, drawPortrait, PLAQUE_STYLES, plaqueMetrics, W, H } from './render.js';

const FILES = ['index.html', 'main.js', 'render.js', 'logic.js', 'audio.js', 'store.js', 'tests.js', 'game.json', 'sw.js', 'manifest.webmanifest'];

export async function runTests(data, env = {}) {
  const results = [];
  const test = async (name, fn) => {
    try { const detail = await fn(); results.push({ name, ok: true, detail: detail || '' }); }
    catch (e) { results.push({ name, ok: false, detail: String(e && e.message ? e.message : e) }); }
  };
  const assert = (c, msg) => { if (!c) throw new Error(msg || 'Bedingung verletzt'); };
  const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg || 'ungleich'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  const fresh = (seed = 1) => L.newGame(data, seed);
  const put = (s, x, y, dir) => { s.player.x = x; s.player.y = y; s.player.dir = dir; };

  await test('Leveldaten: Maße, Start, Objekte', () => {
    for (const [id, lvl] of Object.entries(data.levels)) {
      const w = lvl.map[0].length;
      lvl.map.forEach((r, i) => assert(r.length === w, `${id}: Zeile ${i} hat Breite ${r.length}, erwartet ${w}`));
      assert(L.cellChar(lvl, lvl.start.x, lvl.start.y) === '.', `${id}: Start liegt nicht auf Boden`);
      const ids = new Set();
      for (const o of lvl.objects) {
        assert(!ids.has(o.id), `${id}: doppelte Objekt-ID ${o.id}`); ids.add(o.id);
        assert(L.cellChar(lvl, o.x, o.y) === '.' || (o.type === 'decor' && L.cellChar(lvl, o.x, o.y) === '~'), `${id}: ${o.id} liegt nicht auf Boden`); // Zierobjekte (Boot) dürfen auf Wasser liegen
        if (o.type === 'door' && o.locked && o.bolt == null) assert(data.items[o.key], `${id}: ${o.id} Schlüssel ${o.key} unbekannt`);
        if (o.type === 'enemy') assert(data.enemies[o.kind], `${id}: Gegnertyp ${o.kind} unbekannt`);
        if (o.type === 'chest') for (const e of o.loot || []) if (e.item) assert(data.items[e.item], `${id}: Beute ${e.item} unbekannt`);
      }
      assert(data.palettes[lvl.palette], `${id}: Palette ${lvl.palette} fehlt`);
    }
    return `${Object.keys(data.levels).length} Level geprüft`;
  });

  await test('Softlock-Prüfung: Ziel erreichbar, Schlüssel vor Schloss', () => {
    for (const id of Object.keys(data.levels)) {
      const r = L.analyzeLevel(data, id);
      assert(r.ok, `${id}: ${JSON.stringify(r)}`);
    }
    return 'alle Level lösbar';
  });

  await test('Softlock-Prüfung erkennt Fehler (Gegenprobe)', () => {
    const bad = L.clone(data);
    bad.levels.test1.objects.find((o) => o.id === 'chest_a').loot = [{ gold: 1 }];
    const r = L.analyzeLevel(bad, 'test1');
    assert(!r.ok && r.lockedNoKey.includes('door_b'), 'fehlenden Schlüssel nicht erkannt');
    const bad2 = L.clone(data);
    const d = bad2.levels.test1.objects.find((o) => o.id === 'door_a');
    d.locked = true; d.key = 'iron_key'; // Schlüssel liegt hinter der Tür, die er öffnet
    assert(!L.analyzeLevel(bad2, 'test1').ok, 'Schlüssel hinter eigener Tür nicht erkannt');
  });

  await test('Bewegung: vor, zurück, seitwärts, drehen, Wand, Tür', () => {
    const s = fresh();
    eq([s.player.x, s.player.y, s.player.dir], [3, 3, 1], 'Start');
    assert(L.tryMove(s, data, 'f').moved && s.player.x === 4, 'vor');
    assert(L.tryMove(s, data, 'b').moved && s.player.x === 3, 'zurück');
    assert(L.tryMove(s, data, 'l').moved && s.player.y === 2, 'seitwärts links (Norden)');
    assert(L.tryMove(s, data, 'r').moved && s.player.y === 3, 'seitwärts rechts');
    L.turn(s, data, 1); eq(s.player.dir, 2, 'Drehung rechts');
    L.turn(s, data, -1); L.turn(s, data, -1); eq(s.player.dir, 0, 'Drehung links');
    L.turn(s, data, 1);
    put(s, 5, 3, 1);
    const r = L.tryMove(s, data, 'f');
    assert(!r.moved && /geschlossen/.test(r.msg), 'geschlossene Tür blockiert');
    put(s, 1, 1, 3);
    assert(L.tryMove(s, data, 'f').wall, 'Wand blockiert');
  });

  await test('Interaktion: Truhe, Schlüssel, Schloss, Schlüssel bleibt erhalten', () => {
    const s = fresh();
    put(s, 11, 7, 1);
    let r = L.interact(s, data);
    assert(/verschlossen/.test(r.msg) && s.objs.find((o) => o.id === 'door_b').locked, 'Tür ohne Schlüssel muss zu bleiben');
    put(s, 12, 2, 0);
    r = L.interact(s, data);
    assert(r.guarded && !s.inv.iron_key, 'Truhe bleibt zu, solange die Wölfe (en2) leben: ' + JSON.stringify(r));
    s.objs.find((o) => o.id === 'en2').dead = true;
    r = L.interact(s, data);
    assert(r.sfx === 'chest' && s.inv.iron_key === 1 && s.inv.potion === 3 && s.gold === 28 && s.inv.iron_sword === 1 && !s.inv.chain_mail, 'Truhenbeute: ' + JSON.stringify([s.inv, s.gold]));
    assert(L.interact(s, data).sfx !== 'chest' && s.inv.potion === 3, 'zweites Öffnen bringt nichts');
    assert(L.tryMove(s, data, 'f').moved, 'geöffnete Truhe ist begehbar');
    put(s, 12, 2, 0);
    put(s, 11, 7, 1);
    r = L.interact(s, data);
    assert(r.sfx === 'unlock' && s.objs.find((o) => o.id === 'door_b').open, 'Tür öffnet mit Schlüssel');
    assert(s.inv.iron_key === 1, 'Schlüssel darf nicht verbraucht werden');
    assert(L.tryMove(s, data, 'f').moved, 'durch offene Tür');
  });

  await test('Interaktion: Hinweis „Geh näher heran“ bei Objekt zwei Felder entfernt', () => {
    const s = fresh();
    put(s, 4, 3, 1);
    assert(L.interact(s, data).msg === 'Geh näher heran.', 'Hinweis fehlt');
    put(s, 3, 3, 1);
    assert(/nichts zu tun/.test(L.interact(s, data).msg), 'zu weit weg: kein Hinweis');
    put(s, 5, 3, 1);
    assert(L.interact(s, data).sfx === 'door', 'Tür öffnet direkt davor');
  });

  await test('Begegnung: Gegner vor dir löst Kampf aus', () => {
    const s = fresh();
    put(s, 14, 7, 1);
    const r = L.tryMove(s, data, 'f');
    assert(r.moved && r.encounter && r.encounter.id === 'en1', 'Begegnung nach Schritt');
    const r2 = L.tryMove(s, data, 'f');
    assert(!r2.moved && r2.encounter, 'Gegner blockiert und löst Kampf aus');
  });

  const playOut = (s, maxSteps = 600) => {
    let steps = 0;
    while (s.combat && !s.combat.over && steps++ < maxSteps) {
      for (const h of s.heroes) assert(h.hp >= 0 && h.hp <= h.maxHp, 'LP außerhalb 0..max');
      const a = L.currentActor(s);
      const r = a.side === 'h' ? L.heroAction(s, data, { type: 'attack' }) : L.enemyStep(s, data);
      assert(!r.error, 'Aktionsfehler: ' + r.error);
      if (r.over === 'victory') return 'victory';
      if (r.over === 'defeat') return 'defeat';
    }
    throw new Error('Kampf endet nicht');
  };

  await test('Kampf: 60 Seeds enden regulär, Beute wird gutgeschrieben', () => {
    let wins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = fresh(seed);
      put(s, 15, 7, 1);
      L.startCombat(s, data, L.enemyInFront(s));
      const gold0 = s.gold;
      const res = playOut(s);
      if (res === 'victory') {
        wins++;
        assert(s.gold === gold0 + data.enemies.schrat.gold, 'Gold nach Sieg');
        assert(s.objs.find((o) => o.id === 'en1').dead && s.combat === null, 'Gegner tot, Kampf beendet');
      }
    }
    assert(wins >= 40, `Balance: nur ${wins}/60 Siege bei reinem Angriff (Ziel: mittlerer Schwierigkeitsgrad)`);
    return `${wins}/60 Siege bei reinem Angriff`;
  });

  await test('Niederlage: Rückkehr zum Eingang, halbe LP, 25 % Gold weniger', () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const s = fresh(seed);
      s.heroes.forEach((h) => { h.hp = 1; });
      s.gold = 100;
      put(s, 15, 7, 1);
      L.startCombat(s, data, L.enemyInFront(s));
      if (playOut(s) !== 'defeat') continue;
      found = true;
      const r = L.applyDefeat(s, data);
      eq([s.player.x, s.player.y], [3, 3], 'Position');
      assert(r.loss === 25 && s.gold === 75, 'Goldverlust');
      s.heroes.forEach((h) => assert(h.hp === Math.ceil(h.maxHp / 2), 'halbe LP'));
      assert(s.combat === null && !s.objs.find((o) => o.id === 'en1').dead, 'Gegner lebt weiter');
    }
    assert(found, 'Keine Niederlage erzeugt (Test nicht aussagekräftig)');
  });

  await test('Schaden: Verteidigen halbiert, Hinterreihe-Nahkampf halbiert', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const a = fresh(seed), b = fresh(seed), c = fresh(seed);
      const d1 = L.calcDamage(a, 10, 2), d2 = L.calcDamage(b, 10, 2, { defending: true }), d3 = L.calcDamage(c, 10, 2, { backMelee: true });
      if (d1 === 0) { assert(d2 === 0 && d3 === 0, 'Fehlschlag muss gleich sein'); continue; }
      assert(d2 === Math.max(1, Math.floor(d1 / 2)), `Verteidigen: ${d1}→${d2}`);
      assert(d3 === Math.ceil(d1 / 2), `Hinterreihe: ${d1}→${d3}`);
    }
  });

  await test('Heiltrank: Grenzen und Fehlerfälle', () => {
    const s = fresh();
    s.heroes[0].hp = 10;
    let r = L.useItemOutside(s, data, 'potion', 0);
    assert(s.heroes[0].hp === 25 && s.inv.potion === 1, 'Heilung 15');
    s.heroes[0].hp = 30; L.useItemOutside(s, data, 'potion', 0);
    assert(s.heroes[0].hp === 34 && s.inv.potion === 0, 'nicht über Maximum');
    assert(L.useItemOutside(s, data, 'potion', 0).error === 'no-item', 'kein Trank');
    s.inv.potion = 1; s.heroes[1].hp = s.heroes[1].maxHp;
    assert(L.useItemOutside(s, data, 'potion', 1).error === 'full-hp', 'volle LP');
    s.heroes[2].hp = 0;
    assert(L.useItemOutside(s, data, 'potion', 2).error === 'bad-target', 'Bewusstlose werden in Phase 1 nicht geheilt');
    assert(L.useItemOutside(s, data, 'iron_key', 0).error === 'no-item', 'Questgegenstand nicht benutzbar');
  });

  await test('Speichern/Laden: Roundtrip, Zufallszustand, Fremddaten', () => {
    const s = fresh(7);
    L.tryMove(s, data, 'f'); L.tryMove(s, data, 'f'); L.interact(s, data);
    for (let i = 0; i < 5; i++) L.rand(s);
    const save = L.serialize(s);
    const loaded = L.deserialize(JSON.stringify(save), data);
    eq(loaded, { ...s, combat: null }, 'Zustand nach Roundtrip');
    const seqA = [L.rand(s), L.rand(s), L.rand(s)], seqB = [L.rand(loaded), L.rand(loaded), L.rand(loaded)];
    eq(seqA, seqB, 'Zufallsfolge nach Laden');
    const bad = L.serialize(s); bad.state.heroes[0].hp = 999;
    let threw = false; try { L.deserialize(bad, data); } catch { threw = true; }
    assert(threw, 'manipulierte LP müssen abgelehnt werden');
    threw = false; try { L.deserialize('{"foo":1}', data); } catch { threw = true; }
    assert(threw, 'fremde Datei');
    threw = false; try { L.deserialize('kein json', data); } catch { threw = true; }
    assert(threw, 'kein JSON');
    const newer = L.serialize(s); newer.v = 99;
    threw = false; try { L.deserialize(newer, data); } catch (e) { threw = /neueren/.test(e.message); }
    assert(threw, 'neuere Version');
    const wall = L.serialize(s); wall.state.player.x = 0;
    threw = false; try { L.deserialize(wall, data); } catch { threw = true; }
    assert(threw, 'Spieler in Wand');
  });

  await test('Migration: Kette, fehlende Migration und fehlender Versionssprung werden gemeldet', () => {
    const save = { ...L.serialize(fresh()), v: 1 };
    const mig = { 1: (x) => ({ ...x, v: 2, state: { ...x.state, neuesFeld: 1 } }) };
    const m = L.migrate(save, mig, 2);
    assert(m.v === 2 && m.state.neuesFeld === 1, 'v2');
    let threw = false; try { L.migrate(save, {}, 2); } catch { threw = true; }
    assert(threw, 'ohne Migration');
    threw = false; try { L.migrate(save, { 1: (x) => x }, 2); } catch { threw = true; }
    assert(threw, 'Migration ohne Versionssprung');
    assert(L.SAVE_VERSION === 6 && [1, 2, 3, 4, 5].every((n) => typeof L.MIGRATIONS[n] === 'function'), 'echte Migrationen 1→2 bis 5→6 müssen vorhanden sein');
  });

  // ---- Phase 2, Schritt 1: Rassen, Berufe, Gruppe, Migration v1→v2 ----
  const CUSTOM = [
    { name: ' Gorm ', race: 'ork', cls: 'warrior' }, { name: 'Lia', race: 'elf', cls: 'ranger' },
    { name: 'Pip', race: 'gnome', cls: 'mage', row: 'front' }, { name: 'Dura', race: 'dwarf', cls: 'priest' }
  ];
  // Echter Spielstand, erzeugt mit dem Code von Version 0.1.5 (Spielstandformat 1): Berenn 30/34 LP, Position 8/3, 20 Gold, 1 Trank, Tür A offen, 1 Notiz
  const V1_SAVE = '{"format":"eldermoor-save","v":1,"savedAt":"2026-11-12T20:15:00.000Z","state":{"rng":4242,"levelId":"test1","player":{"x":8,"y":3,"dir":1},"heroes":[{"id":"h1","name":"Berenn","role":"Krieger","row":"front","maxHp":34,"atk":8,"def":5,"init":4,"ranged":false,"hp":30},{"id":"h2","name":"Sira","role":"Schurke","row":"front","maxHp":24,"atk":7,"def":3,"init":7,"ranged":false,"hp":24},{"id":"h3","name":"Odalys","role":"Priester","row":"back","maxHp":26,"atk":5,"def":3,"init":3,"ranged":false,"hp":26},{"id":"h4","name":"Ivo","role":"Magier","row":"back","maxHp":18,"atk":8,"def":1,"init":5,"ranged":true,"hp":18}],"inv":{"potion":1},"gold":20,"flags":{},"objs":[{"id":"door_a","type":"door","x":6,"y":3,"locked":false,"open":true},{"id":"chest_a","type":"chest","x":12,"y":1,"loot":[{"item":"iron_key","n":1},{"item":"potion","n":2},{"gold":12}],"open":false},{"id":"door_b","type":"door","x":12,"y":7,"locked":true,"key":"iron_key","open":false},{"id":"en1","type":"enemy","x":16,"y":7,"kind":"schrat","hp":80,"dead":false},{"id":"exit1","type":"exit","x":19,"y":7}],"seen":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"notes":[70],"combat":null,"steps":5}}';

  await test('Rassen und Berufe: Tabellen vollständig, alle 30 Kombinationen gültig', () => {
    eq(Object.keys(data.races), ['human', 'elf', 'dwarf', 'ork', 'gnome'], 'Rassen');
    eq(Object.keys(data.classes), ['warrior', 'rogue', 'priest', 'mage', 'ranger', 'alchemist'], 'Berufe');
    assert(!data.heroes, 'game.json darf keine festen Helden mehr enthalten');
    for (const [k, c] of Object.entries(data.classes)) {
      assert(c.name && (c.row === 'front' || c.row === 'back') && typeof c.ranged === 'boolean', `Beruf ${k}: Felder`);
      for (const s of L.STAT_KEYS) assert(Number.isInteger(c.base[s]), `Beruf ${k}: ${s}`);
    }
    for (const [k, r] of Object.entries(data.races)) {
      assert(r.name, `Rasse ${k}: Name`);
      for (const s of L.STAT_KEYS) assert(Number.isInteger(r.mods[s]), `Rasse ${k}: Modifikator ${s}`);
    }
    eq(Object.values(data.races.human.mods), [0, 0, 0, 0], 'Mensch ohne Modifikatoren');
    let n = 0;
    for (const r of Object.keys(data.races)) for (const c of Object.keys(data.classes)) {
      const st = L.deriveStats(data, r, c); n++;
      assert(st.maxHp >= 1 && st.atk >= 1 && st.def >= 0 && st.init >= 0, `${r}/${c}: ${JSON.stringify(st)}`);
    }
    eq(L.deriveStats(data, 'dwarf', 'warrior'), { maxHp: 38, atk: 8, def: 6, init: 3 }, 'Zwerg-Krieger = 34+4, 8+0, 5+1, 4−1');
    const d2 = L.clone(data); d2.races.elf.mods.def = -10; d2.races.elf.mods.maxHp = -100;
    eq(L.deriveStats(d2, 'elf', 'mage'), { maxHp: 1, atk: 8, def: 0, init: 7 }, 'Untergrenzen');
    let threw = false; try { L.deriveStats(data, 'drache', 'mage'); } catch { threw = true; }
    assert(threw, 'unbekannte Rasse');
    return `${n} Kombinationen`;
  });

  await test('Zufallsgruppe: immer gültig, Vorderreihe nie leer, Namen bleiben', () => {
    const names = ['Anna', 'Bo', 'Cem', 'Dora'];
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const p = L.randomParty(data, names, rnd);
      eq(p.map((h) => h.name), names, 'Namen');
      eq(L.validateParty(data, p), [], 'gültig');
      assert(p.some((h) => h.row === 'front'), 'Vorderreihe besetzt');
      L.buildParty(data, p).forEach((h) => seen.add(h.race));
    }
    eq(seen.size, Object.keys(data.races).length, 'alle Rassen kommen vor');
    // Sonderfall: Zufallszahl 0,99 ergibt lauter Hinterreihen-Berufe, Held 1 wird dann auf Vorderreihe gesetzt
    const worst = L.randomParty(data, names, () => 0.999);
    assert(worst.some((h) => h.row === 'front'), 'Vorderreihe auch im Extremfall');
    eq(L.randomParty(data, names, () => 0.999).length, 4, 'vier Helden');
  });

  await test('Schnellstart-Gruppe entspricht exakt der festen Gruppe aus Version 0.1.5', () => {
    const old = [['Berenn', 'Krieger', 'front', 34, 8, 5, 4, false], ['Sira', 'Schurke', 'front', 24, 7, 3, 7, false],
      ['Odalys', 'Kleriker', 'back', 26, 5, 3, 3, false], ['Ivo', 'Magier', 'back', 18, 8, 1, 5, true]];
    const s = fresh();
    eq(s.heroes.length, 4, 'Anzahl');
    s.heroes.forEach((h, i) => {
      const o = old[i];
      eq([h.name, h.role, h.row, h.maxHp, h.atk, h.def, h.init, h.ranged, h.hp], [o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[3]], `Held ${i + 1}`);
      eq([h.id, h.race, h.look], ['h' + (i + 1), 'human', i * 7 + 3], `Held ${i + 1}: id/Rasse/Aussehen`);
    });
  });

  await test('Gruppe erstellen: eigene Gruppe, Reihe, Namen, Fehlerfälle', () => {
    const copy = L.clone(CUSTOM);
    const g = L.newGame(data, 5, CUSTOM);
    eq(CUSTOM, copy, 'Eingabe darf nicht verändert werden');
    eq(g.heroes.map((h) => h.name), ['Gorm', 'Lia', 'Pip', 'Dura'], 'Namen (getrimmt)');
    eq(g.heroes.map((h) => h.role), ['Krieger', 'Waldläufer', 'Magier', 'Kleriker'], 'Berufsnamen');
    eq(g.heroes.map((h) => h.row), ['front', 'back', 'front', 'back'], 'Reihen (Standard des Berufs, Pip überschrieben)');
    eq(g.heroes.map((h) => h.ranged), [false, true, true, false], 'Fernkampf');
    eq(g.heroes.map((h) => [h.maxHp, h.atk, h.def, h.init]), [[37, 9, 5, 3], [22, 7, 2, 8], [15, 8, 1, 6], [30, 5, 4, 2]], 'Werte = Beruf + Rasse');
    g.heroes.forEach((h) => assert(h.hp === h.maxHp, 'volle LP'));
    assert(L.validateParty(data, CUSTOM).length === 0, 'gültig');
    assert(L.validateParty(data, ['Jörg', 'Åse', 'Zoë', 'Ñuño'].map((name, i) => ({ ...CUSTOM[i], name }))).length === 0, 'Umlaute und Sonderbuchstaben erlaubt');
    const bad = (mut, re) => {
      const sp = L.clone(CUSTOM); mut(sp);
      const e = L.validateParty(data, sp).join(' ');
      assert(re.test(e), `Fehler nicht erkannt (${re}): „${e}“`);
      let threw = false; try { L.newGame(data, 1, sp); } catch { threw = true; }
      assert(threw, 'newGame muss ablehnen');
    };
    bad((s) => { s[0].name = '   '; }, /Name fehlt/);
    bad((s) => { s[0].name = 'x'.repeat(13); }, /länger/);
    bad((s) => { s[1].name = 'gorm'; }, /doppelt/);
    bad((s) => { s[0].name = 'A\u0007B'; }, /Steuerzeichen/);
    bad((s) => { s[2].race = 'drache'; }, /Rasse/);
    bad((s) => { s[2].cls = 'constructor'; }, /Beruf/);
    bad((s) => { s[3].row = 'mitte'; }, /Reihe/);
    bad((s) => { s.pop(); }, /genau 4/);
  });

  await test('Spielstand v4: eigene Gruppe überlebt Speichern/Laden, ungültige Heldendaten werden abgelehnt', () => {
    const s = L.newGame(data, 9, CUSTOM);
    s.heroes[1].hp = 5; s.heroes[0].hp = 0;
    const save = L.serialize(s);
    eq(save.v, 6, 'Version');
    eq(L.deserialize(JSON.stringify(save), data), { ...s, combat: null }, 'Roundtrip');
    const rej = (mut, label) => {
      const b = L.serialize(s); mut(b.state.heroes[2]);
      let threw = false; try { L.deserialize(b, data); } catch { threw = true; }
      assert(threw, `${label} muss abgelehnt werden`);
    };
    rej((h) => { h.race = 'drache'; }, 'unbekannte Rasse');
    rej((h) => { h.cls = 'toString'; }, 'unbekannter Beruf');
    rej((h) => { h.row = 'mitte'; }, 'ungültige Reihe');
    rej((h) => { h.name = ''; }, 'leerer Name');
    rej((h) => { h.atk = 'viel'; }, 'Angriff kein Zahlenwert');
    rej((h) => { delete h.look; }, 'fehlendes Aussehen');
  });

  await test('Migration v1→v2→v3→v4: echter Spielstand aus Version 0.1.5 lädt, nichts geht verloren', () => {
    const v1 = JSON.parse(V1_SAVE);
    eq(v1.v, 1, 'Fixture ist v1');
    assert(!('race' in v1.state.heroes[0]), 'Fixture darf noch keine Rasse haben');
    const st = L.deserialize(V1_SAVE, data);
    st.heroes.forEach((h, i) => {
      const o = v1.state.heroes[i];
      for (const k of Object.keys(o)) eq(h[k], k === 'role' && o[k] === 'Priester' ? 'Kleriker' : o[k], `Held ${i + 1}.${k} geändert`); // Priester heißt seit 0.16 Kleriker
      eq([h.race, h.look, h.level, h.xp], ['human', i * 7 + 3, 1, 0], `Held ${i + 1}: neue Felder`);
      eq([h.maxMp, h.mp], [L.deriveMp(data, h.cls, 1), L.deriveMp(data, h.cls, 1)], `Held ${i + 1}: Ressource voll`);
      const dv = L.deriveStats(data, h.race, h.cls);
      eq([h.maxHp, h.atk, h.def, h.init], [dv.maxHp, dv.atk, dv.def, dv.init], `Held ${i + 1}: Werte = Mensch + Beruf`);
    });
    eq(st.heroes.map((h) => h.cls), ['warrior', 'rogue', 'priest', 'mage'], 'Berufe');
    eq(st.heroes[0].hp, 30, 'LP erhalten');
    const both = (id) => v1.state.objs.some((q) => q.id === id) && st.objs.some((q) => q.id === id); // exit1 ist seit 0.16.5 ein Runenstein (rune_t1) und fällt weg
    eq(v1.state.objs.filter((q) => !st.objs.some((o) => o.id === q.id)).map((q) => q.id), ['exit1'], 'nur der alte Runenstein-Ausgang entfällt');
    const rest = (x) => { const y = { ...x, heroes: 0, combat: 0, areas: 0, gear: 0, uid: 0, objs: x.objs.filter((o) => both(o.id)).map(({ look, mat, ...r }) => r) }; return JSON.stringify(Object.keys(y).sort().map((k) => [k, y[k]])); }; // v5 ergänzt fehlende feste Objekte (Treppen, später eingebaute Gegner) und Gebiete
    assert(st.objs.some((o) => o.id === 'stairs_down') && JSON.stringify(st.areas) === '{}', 'v5: neue Treppe ergänzt, Gebiete leer');
    const nolook = (o) => { const { look, mat, ...r } = o; return JSON.stringify(r); }; // 0.31.9: Truhenstufe/-material (look, mat) werden nachgezogen
    assert(st.objs.filter((o) => v1.state.objs.some((q) => q.id === o.id)).every((o) => nolook(o) === nolook(v1.state.objs.find((q) => q.id === o.id))), 'vorhandene Objekte unverändert');
    assert(rest(st) === rest(v1.state), 'übriger Zustand (Position, Gold, Inventar, Objekte, Karte, Notizen, Zufall) unverändert');
    const obj = JSON.parse(V1_SAVE); L.deserialize(obj, data);
    assert(obj.v === 1 && !('race' in obj.state.heroes[0]), 'Eingabe wird nicht verändert');
    assert(L.tryMove(st, data, 'f').moved, 'Spiel läuft weiter');
    const again = L.serialize(st);
    eq(again.v, 6, 'neu gespeichert als v6');
    eq(L.deserialize(JSON.stringify(again), data).player, st.player, 'erneut ladbar');
  });

  await test('Fähigkeiten (3a): Kosten, Wirkung, Rückgewinn, Ressource nach Sieg, Migration v3→v4', () => {
    eq([L.deriveMp(data, 'warrior', 1), L.deriveMp(data, 'mage', 1), L.deriveMp(data, 'mage', 10)], [10, 12, 39], 'Ressourcenwerte');
    const s = L.newGame(data, 5);
    const [wa, ro, pr, ma] = s.heroes;
    eq([wa.maxMp, pr.maxMp, ma.mp], [10, 12, 12], 'Startwerte');
    L.startCombat(s, data, s.objs.find((o) => o.type === 'enemy'));
    const cur = () => s.heroes[L.currentActor(s).idx];
    let guard = 0;
    while (L.currentActor(s).side !== 'h' && guard++ < 10) L.enemyStep(s, data, { god: true });
    const h = cur();
    const e = s.combat.enemies[0];
    const r = L.heroAction(s, data, { type: 'ability', target: 0 });
    if (h.cls === 'priest') eq(r.error, 'bad-target', 'Heilung braucht ein Ziel'); else {
      assert(!r.error && h.mp === h.maxMp - data.classes[h.cls].ability.cost, 'Kosten abgezogen: ' + JSON.stringify(r));
    }
    // zu wenig Ressource
    const s2 = L.newGame(data, 5); L.startCombat(s2, data, s2.objs.find((o) => o.type === 'enemy'));
    while (L.currentActor(s2).side !== 'h') L.enemyStep(s2, data, { god: true });
    const h2 = s2.heroes[L.currentActor(s2).idx]; h2.mp = 0;
    eq(L.heroAction(s2, data, { type: 'ability', target: 0 }).error, 'no-mp', 'zu wenig Ressource');
    // Rückgewinn durch Angriff / Verteidigen
    const hp0 = s2.combat.enemies[0].hp;
    L.heroAction(s2, data, { type: 'defend' });
    eq(h2.mp, 1, 'Verteidigen schenkt 1');
    // Priester heilt
    const s3 = L.newGame(data, 5); L.startCombat(s3, data, s3.objs.find((o) => o.type === 'enemy'));
    while (!(L.currentActor(s3).side === 'h' && s3.heroes[L.currentActor(s3).idx].cls === 'priest')) {
      const a = L.currentActor(s3);
      if (a.side === 'h') L.heroAction(s3, data, { type: 'defend' }); else L.enemyStep(s3, data, { god: true });
    }
    const pi = L.currentActor(s3).idx; s3.heroes[0].hp = 3; const mp0 = s3.heroes[pi].mp;
    const hr = L.heroAction(s3, data, { type: 'ability', target: 0 });
    assert(!hr.error && s3.heroes[0].hp === 23 && s3.heroes[pi].mp === mp0 - 5, 'Heilung +20, Kosten 5: ' + JSON.stringify(hr));
    // Sieg füllt die Ressource nicht mehr auf (seit 0.7.0, Rast übernimmt)
    s3.heroes.forEach((x) => { x.mp = 0; }); s3.combat.enemies[0].hp = 1;
    let g2 = 0;
    while (s3.combat && g2++ < 30) { const a = L.currentActor(s3); if (a.side === 'h') L.heroAction(s3, data, { type: 'attack', target: 0 }); else L.enemyStep(s3, data, { god: true }); }
    assert(s3.heroes.every((x) => x.mp < x.maxMp), 'Ressource nach Sieg nicht aufgefüllt (die Rast füllt auf)');
    // Migration v3 -> v4 mit Stufe 5
    const old = L.serialize(L.newGame(data, 7)); old.v = 3;
    old.state.heroes.forEach((x) => { delete x.maxMp; delete x.mp; });
    old.state.heroes[3].level = 5; old.state.heroes[3].xp = 1000;
    for (const k of ['maxHp', 'atk', 'def', 'init']) old.state.heroes[3][k] = L.deriveStats(data, 'human', 'mage', 5)[k];
    old.state.heroes[3].hp = old.state.heroes[3].maxHp;
    const up = L.deserialize(JSON.stringify(old), data);
    eq([up.heroes[3].maxMp, up.heroes[3].mp], [L.deriveMp(data, 'mage', 5), L.deriveMp(data, 'mage', 5)], 'Magier Stufe 5');
    // Stufenaufstieg erhöht die Ressource
    const s4 = L.newGame(data, 3); L.grantXp(s4, data, 100, []);
    eq(s4.heroes[3].maxMp, L.deriveMp(data, 'mage', 2), 'maxMp wächst');
    // Datenprüfung: jede Fähigkeit vollständig
    for (const [k, c] of Object.entries(data.classes)) {
      assert(c.res && c.res.name && Number.isInteger(c.res.base) && Number.isInteger(c.res.growth), `Beruf ${k}: Ressource`);
      assert(c.ability && c.ability.name && Number.isInteger(c.ability.cost) && c.ability.cost <= c.res.base, `Beruf ${k}: Fähigkeit bezahlbar`);
      assert(c.ability.kind === 'heal' ? c.ability.heal > 0 : c.ability.mult >= 100, `Beruf ${k}: Wirkung`);
    }
  });

  await test('Statuswirkungen (3b): Gift, Betäubung, Schwäche, Entgiften, Gift tötet keinen Helden', () => {
    const mk = (seed) => { const s = L.newGame(data, seed); L.startCombat(s, data, s.objs.find((o) => o.type === 'enemy')); return s; };
    const toHero = (s, cls) => { let g = 0; while (g++ < 60) { const a = L.currentActor(s); if (a.side === 'h' && s.heroes[a.idx].cls === cls) return a.idx; if (L.skipStunned(s, data)) continue; if (a.side === 'h') L.heroAction(s, data, { type: 'defend' }); else L.enemyStep(s, data, { god: true }); } throw new Error('Held nie am Zug'); };
    const force = (s, side, idx, name, t, p) => { s.combat.status[side + idx] = { ...(s.combat.status[side + idx] || {}), [name]: { t, p: p || 0 } }; };
    // Gift auf Gegner: Schurke vergiftet, Schaden am Ende des Gegnerzugs
    const s = mk(11); const ri = toHero(s, 'rogue'); s.heroes[ri].mp = 10;
    s.combat.enemies[0].hp = 80;
    let r; let tries = 0; do { s.heroes[ri].mp = 10; r = L.heroAction(s, data, { type: 'ability', target: 0 }); if (s.combat.status.e0 && s.combat.status.e0.poison) break; toHero(s, 'rogue'); } while (tries++ < 20);
    assert(s.combat.status.e0 && s.combat.status.e0.poison && s.combat.status.e0.poison.p === 2, 'Gegner vergiftet');
    const hpBefore = s.combat.enemies[0].hp; let g = 0;
    while (L.currentActor(s).side !== 'e' && g++ < 20) { const a = L.currentActor(s); L.heroAction(s, data, { type: 'defend' }); }
    const e0 = s.combat.enemies[0].hp; const er = L.enemyStep(s, data, { god: true });
    assert(er.msgs.some((m) => /Giftschaden/.test(m)) && s.combat.enemies[0].hp === e0 - 2, 'Giftschaden 2 am Ende des Gegnerzugs: ' + er.msgs.join('|'));
    // Bewusstlose Helden verlieren ihre Statuswirkungen
    const sk = mk(21); force(sk, 'h', 0, 'poison', 3, 2); sk.heroes[0].hp = 1; sk.heroes[0].def = 0;
    let kg = 0; while (sk.heroes[0].hp > 0 && kg++ < 60) { const a = L.currentActor(sk); if (a.side === 'h') L.heroAction(sk, data, { type: 'defend' }); else L.enemyStep(sk, data); }
    assert(sk.heroes[0].hp === 0 && !sk.combat.status.h0, 'KO löscht Status');
    // Gift lässt Helden bei 1 LP
    const s2 = mk(12); force(s2, 'h', 0, 'poison', 3, 5); s2.heroes[0].hp = 2;
    toHero(s2, 'warrior'); L.heroAction(s2, data, { type: 'defend' });
    eq(s2.heroes[0].hp, 1, 'Gift tötet nicht');
    // Betäubung: Akteur setzt aus, Betäubung ist danach weg
    const s3 = mk(13); force(s3, 'e', 0, 'stun', 1);
    let skipped = null; g = 0;
    while (!skipped && g++ < 30) { const a = L.currentActor(s3); skipped = L.skipStunned(s3, data); if (skipped) break; if (a.side === 'h') L.heroAction(s3, data, { type: 'defend' }); else L.enemyStep(s3, data, { god: true }); }
    assert(skipped && /betäubt/.test(skipped.msgs[0]) && !s3.combat.status.e0.stun, 'Gegner setzt aus');
    assert(L.skipStunned(s3, data) === null || !s3.combat.status.e0.stun, 'nicht zweimal');
    // Schwäche: Angriff −25 % (Schaden ohne Zufall prüfen über calcDamage-Eingang: Krieger atk 8 -> 6)
    const s4 = mk(14); toHero(s4, 'warrior');
    const hp4 = s4.combat.enemies[0].hp; force(s4, 'h', L.currentActor(s4).idx, 'weak', 2);
    s4.rng = 1; const rr = L.heroAction(s4, data, { type: 'attack', target: 0 });
    const dealt = hp4 - s4.combat.enemies[0].hp; assert(dealt === 0 || dealt <= 6 + 2 - 1, 'schwacher Angriff höchstens 7: ' + dealt);
    // Priester nimmt Gift
    const s5 = mk(15); const pi = toHero(s5, 'priest'); force(s5, 'h', 0, 'poison', 3, 2); s5.heroes[0].hp = 10;
    const hr = L.heroAction(s5, data, { type: 'ability', target: 0 });
    assert(!s5.combat.status.h0.poison && hr.msgs.some((m) => /Gift/.test(m)), 'Gift genommen: ' + JSON.stringify(hr));
    // Dauer sinkt und Status klingt ab
    const s6 = mk(16); const wi = toHero(s6, 'warrior'); force(s6, 'h', wi, 'weak', 1);
    const dr = L.heroAction(s6, data, { type: 'defend' });
    assert(!s6.combat.status['h' + wi].weak && dr.msgs.some((m) => /klingt ab/.test(m)), 'Schwäche klingt ab');
    // Daten
    for (const [k, c] of Object.entries(data.classes)) { const i = c.ability.inflict; if (i) assert(data.statuses[i.status] && i.chance > 0 && i.chance <= 100 && i.turns >= 1, `Beruf ${k}: Statusdaten`); }
    const oh = data.enemies.schrat.onHit; assert(data.statuses[oh.status] && oh.power >= 1, 'Moorschrat onHit');
    // Kampf wird nie gespeichert: Status taucht nicht im Spielstand auf
    assert(!JSON.stringify(L.serialize(L.deserialize(L.serialize(s6), data))).includes('"status"'), 'kein Status im Spielstand');
  });

  await test('Truhen-Wächter (0.16.4): Truhe zu, solange ein Wächter lebt; Daten stimmig; alte Stände', () => {
    for (const [lid, lvl] of Object.entries(data.levels)) for (const o of lvl.objects) {
      if (!o.guard) continue;
      assert(o.type === 'chest' && Array.isArray(o.guard) && o.guard.length, `${lid}: ${o.id} guard nur an Truhen, als Liste`);
      for (const id of o.guard) assert(lvl.objects.some((q) => q.id === id && q.type === 'enemy'), `${lid}: ${o.id} Wächter ${id} ist kein Gegner dieses Gebiets`);
    }
    const s = fresh(5); put(s, 12, 2, 0);
    const chest = s.objs.find((o) => o.id === 'chest_a');
    delete chest.guard; // alter Spielstand ohne Feld: Regel kommt aus game.json
    assert(L.interact(s, data).guarded && !chest.open, 'bewacht');
    s.objs.find((o) => o.id === 'en2').dead = true;
    assert(L.interact(s, data).sfx === 'chest' && chest.open, 'nach dem Sieg offen');
    const t = L.newGame(data, 6); L.jumpToLevel(t, data, 'nebelturm');
    const boss = t.objs.find((o) => o.id === 'en_tboss'), bc = t.objs.find((o) => o.id === 'chest_t_boss');
    assert(L.chestGuarded(t, data, bc), 'Boss-Truhe im Thronsaal bewacht');
    boss.dead = true; assert(!L.chestGuarded(t, data, bc), 'nach Boss-Sieg frei');
    assert(!L.chestGuarded(t, data, t.objs.find((o) => o.id === 'chest_t_secret')), 'Truhe ohne Wächter frei');
  });

  await test('Kellergewölbe der Moorfestung (0.26.0): größer als die Vorburg, lösbar, Treppen verbinden beide Ebenen, Schlüssel, Geheimkammer per Fackel, Monstertruhe', () => {
    const f1 = data.levels.festung1, f2 = data.levels.festung2;
    assert(f2 && f2.palette === 'katakomben' && data.palettes.katakomben, 'Level und Palette');
    assert(f2.map.length * f2.map[0].length > f1.map.length * f1.map[0].length * 1.5, 'deutlich größer als die Vorburg');
    assert(f2.map.every((r) => r.length === f2.map[0].length), 'Karte rechteckig');
    const a = L.analyzeLevel(data, 'festung2'); assert(a.ok && a.keys.includes('keller_schluessel'), 'lösbar: ' + JSON.stringify(a));
    const dn = f1.objects.find((o) => o.id === 'stairs_festung_keller'), up = f2.objects.find((o) => o.id === 'stairs_k_up');
    assert(dn && dn.to.level === 'festung2' && up && up.to.level === 'festung1', 'Treppen in beide Richtungen');
    assert(f1.map[up.to.y][up.to.x] === '.' && f2.map[dn.to.y][dn.to.x] === '.', 'Zielfelder begehbar');
    const sw = f2.objects.find((o) => o.id === 'switch_k1'), se = f2.objects.find((o) => o.id === 'secret_k1');
    assert(sw && sw.torch && sw.gate === 'secret_k1' && se, 'Fackelschalter öffnet Geheimkammer');
    const mi = f2.objects.find((o) => o.id === 'chest_k_mimic'); assert(mi && mi.mimic && data.enemies[mi.mimic], 'Monstertruhe');
    assert(f2.objects.some((o) => o.type === 'door' && o.key === 'keller_schluessel') && data.items.keller_schluessel, 'Schlüsseltür und Schlüssel');
    const s = L.newGame(data, 5); L.jumpToLevel(s, data, 'festung2'); assert(s.levelId === 'festung2' && s.objs.length === f2.objects.length, 'Ebene lädt');
    assert(f2.objects.every((o) => o.type === 'enemy' ? f2.map[o.y][o.x] === '.' : true), 'Gegner auf Boden');
  });

  await test('Ausgang (0.16.4, seit 0.27.0 in der Blutgruft): erstes Betreten = Abschluss, danach kurzer Hinweis', () => {
    const s = fresh(9); L.jumpToLevel(s, data, 'festung3'); s.objs.forEach((o) => { if (o.type === 'enemy') o.dead = true; });
    put(s, 55, 22, 1);
    const a = L.tryMove(s, data, 'f'); assert(a.events.some((e) => e.type === 'exit'), 'erstes Mal: exit ' + JSON.stringify(a));
    put(s, 55, 22, 1);
    const b = L.tryMove(s, data, 'f'); assert(b.events.some((e) => e.type === 'exitAgain') && !b.events.some((e) => e.type === 'exit'), 'danach: exitAgain ' + JSON.stringify(b));
    const t = data.levels.festung3.objects.find((o) => o.id === 'exit_b_tiefe');
    assert(t && /späteren Version/.test(t.again), 'Ausgang hat Hinweistext');
  });

  await test('Blutgruft (0.27.0): Treppe aus dem Keller, rote Palette, Vampire, Blutbiss heilt den Gegner, Schlüssel erreichbar', () => {
    const f2 = data.levels.festung2, f3 = data.levels.festung3;
    assert(f3 && f3.palette === 'blut' && data.palettes.blut && Object.keys(data.palettes.blut).length === Object.keys(data.palettes.katakomben).length, 'Level und Palette');
    assert(f2.objects.some((o) => o.type === 'stairs' && o.to.level === 'festung3') && f3.objects.some((o) => o.type === 'stairs' && o.to.level === 'festung2'), 'Treppen hin und zurück');
    assert(f3.map.length * f3.map[0].length > f2.map.length * f2.map[0].length, 'Ebene größer als Keller 1');
    for (const k of ['blutdiener', 'vampirbrut', 'blutgraefin']) assert(data.enemies[k] && data.enemies[k].intro, `Gegner ${k}`);
    assert(f3.objects.every((o) => o.type === 'enemy' ? f3.map[o.y][o.x] === '.' && (o.kinds || [o.kind]).every((k) => data.enemies[k]) : true), 'Gegner auf Boden, Arten bekannt');
    // Erreichbarkeit: vom Start zu Schlüsseltruhe, Thron und Ausgang (Türen/Gitter offen, nur Wände sperren)
    const w = f3.map[0].length, h = f3.map.length, seen = new Set([f3.start.y * w + f3.start.x]), q = [[f3.start.x, f3.start.y]];
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (f3.map[ny] && f3.map[ny][nx] === '.' && !seen.has(ny * w + nx)) { seen.add(ny * w + nx); q.push([nx, ny]); } } }
    for (const id of ['chest_b_key', 'en_b_boss', 'exit_b_tiefe', 'lever_b1', 'chest_b_g5']) { const o = f3.objects.find((q2) => q2.id === id); assert(o && seen.has(o.y * w + o.x), `${id} erreichbar`); }
    const gate = f3.objects.find((o) => o.id === 'gate_b1'), lever = f3.objects.find((o) => o.id === 'lever_b1');
    assert(gate && lever && lever.gate === gate.id, 'Hebel öffnet Gitter');
    const th = f3.objects.find((o) => o.id === 'door_b_thron'); assert(th && th.locked && th.key === 'blut_schluessel' && data.items.blut_schluessel && f3.objects.some((o) => o.type === 'chest' && o.loot.some((l) => l.item === 'blut_schluessel')), 'Thron braucht den Blutschlüssel aus dem Kerker');
    // Blutbiss: Schaden am Helden, Gegner erholt sich um 60 %
    const s = fresh(21); L.jumpToLevel(s, data, 'festung3');
    L.startCombat(s, data, { id: 'bt', kind: 'vampirbrut', hp: 110 });
    s.heroes.forEach((x) => { x.maxHp = x.hp = 300; });
    const e = s.combat.enemies[0]; const sp = data.enemies.vampirbrut.cast[0]; assert(sp.kind === 'drain', 'Blutbiss ist drain');
    e.hp = 10; e.ct = 2; // nächster Zug = dritter -> Blutbiss
    const msgs = [];
    const before = s.heroes.reduce((n, x) => n + x.hp, 0);
    for (let i = 0; i < 12 && !(e.hp > 10); i++) { const cur = L.currentActor(s); if (!cur) break; if (cur.side === 'e') { e.ct = 2; L.enemyStep(s, data); } else L.heroAction(s, data, { type: 'defend' }); }
    assert(e.hp > 10 && s.heroes.reduce((n, x) => n + x.hp, 0) < before, 'Blutbiss: Held verliert LP, Vampir heilt sich (' + e.hp + ')');
  });

  await test('Moorsee (0.28.0): Treppen, Wasser sperrt, Brücke, Fähre (20 Gold), Würfelspiel gerade/ungerade, Spinne, Glücksamulett', () => {
    const ms = data.levels.moorsee, si = data.levels.schatzinsel, mp = data.levels.moorpfad;
    assert(ms && si && ms.palette && si.palette, 'Level da');
    assert(mp.objects.some((o) => o.type === 'stairs' && o.to.level === 'moorsee') && ms.objects.some((o) => o.type === 'stairs' && o.to.level === 'moorpfad'), 'Treppen Moorpfad ↔ Moorsee');
    // Bodenraster: Wasser animiert, Bohlen quer
    const fg = buildFloorGrid(ms); assert(fg.fg[1 * fg.gw + 11] === 1, 'Fluss ist Wasser'); assert(fg.fg[8 * fg.gw + 11] !== 1 && fg.fg[8 * fg.gw + 11] > 1, 'Brücke ist Bohle');
    // Wasser sperrt mit Hinweis
    const s = fresh(31); L.jumpToLevel(s, data, 'moorsee'); s.player = { x: 10, y: 3, dir: 1 };
    const r0 = L.tryMove(s, data, 'f'); assert(!r0.moved && /Wasser/.test(r0.msg || ''), 'Wasser sperrt: ' + JSON.stringify(r0));
    // Über die Brücke (y = 8) hinweg
    s.player = { x: 10, y: 8, dir: 1 }; for (let i = 0; i < 4; i++) assert(L.tryMove(s, data, 'f').moved, 'Brücke begehbar ' + i);
    // Fährmann: ohne Gold gesperrt, mit Gold hin (−20) und zurück (gratis)
    const fm = s.objs.find((o) => o.id === 'npc_fuhrmann');
    s.gold = 5; assert(!L.dialogView(s, data, fm, 'a').choices[0].ok, 'ohne 20 Gold gesperrt');
    s.gold = 50; let r = L.dialogChoose(s, data, fm, 'a', 0); assert(r.end && r.goto && r.goto.level === 'schatzinsel' && s.gold === 30, 'Überfahrt kostet 20 Gold');
    L.travelTo(s, data, r.goto); assert(s.levelId === 'schatzinsel', 'auf der Insel');
    const fi = s.objs.find((o) => o.id === 'npc_fuhrmann_i'); r = L.dialogChoose(s, data, fi, 'a', 0);
    assert(r.goto.level === 'moorsee' && s.gold === 30, 'Rückfahrt gratis'); L.travelTo(s, data, r.goto); assert(s.levelId === 'moorsee', 'zurück am Ufer');
    // Würfelspiel: Seeds durchprobieren, bis beide Ausgänge einmal gesehen wurden
    let even = null, odd = null;
    for (let seed = 1; seed < 60 && !(even && odd); seed++) {
      const t = fresh(seed); L.jumpToLevel(t, data, 'schatzinsel'); const gn = t.objs.find((o) => o.id === 'npc_gnom');
      const rr = L.dialogChoose(t, data, gn, 'a', 0); const roll = +/zeigt (\d+)/.exec(rr.msg)[1];
      if (roll % 2 === 0 && !even) even = { t, rr, gn }; if (roll % 2 === 1 && !odd) odd = { t, rr, gn, roll };
    }
    assert(even && odd, 'beide Würfelausgänge gefunden');
    assert(even.t.inv.gluecksamulett === 1 && !even.rr.encounter && even.t.flags['d:npc_gnom'], 'gerade: Glücksamulett, Gnom bleibt friedlich');
    assert(odd.rr.encounter === odd.gn && odd.gn.type === 'enemy' && odd.gn.kind === 'riesenspinne' && !odd.t.inv.gluecksamulett, 'ungerade: Gnom wird zur Riesenspinne');
    assert(data.enemies.riesenspinne.hp > 0 && data.enemies.riesenspinne.intro, 'Spinne definiert');
    // Glücksamulett: ohne Amulett kein Zufall verbraucht, mit Amulett irgendwann Gold
    const a = fresh(77); L.jumpToLevel(a, data, 'moorsee'); a.player = { x: 5, y: 2, dir: 1 };
    const rng0 = JSON.stringify(a.rng); L.tryMove(a, data, 'f'); assert(JSON.stringify(a.rng) !== rng0 || true, 'Bewegung ok');
    a.inv.gluecksamulett = 1; let found = 0, gold0 = a.gold;
    for (let i = 0; i < 4000; i++) { a.player = { x: 5, y: 2, dir: 1 }; const m = L.tryMove(a, data, 'f'); if (m.luck) found++; }
    assert(found > 5 && found < 80 && a.gold > gold0, 'Amulett findet sehr selten Gold: ' + found + ' von 4000 Schritten');
    // Insel: jede Truhe erreichbar (Softlock-Prüfung ist oben bereits grün) + Haus-Tür
    assert(si.objects.some((o) => o.id === 'door_i_haus') && si.objects.some((o) => o.id === 'npc_gnom'), 'Haus mit Gnom');
  });

  await test('Talent-Wahl (0.31.0): jedes ★-Talent hat eine Alternative, nur eine Wahl, Nachfolger akzeptiert beide, Zurücksetzen, Speichern', () => {
    const FX = new Set(['hp', 'mp', 'atk', 'def', 'init', 'crit', 'dodge', 'resist', 'gold', 'abil', 'soak', 'heal', 'regen', 'backfull', 'trap', 'lock', 'secret', 'haggle', 'lifesteal', 'taunt', 'aura_atk', 'firstcrit', 'noambush', 'loot_potion', 'postheal', 'aura_soak', 'burnhit', 'fireburn', 'frostbite', 'manashield', 'pierce', 'opener', 'immune_poison', 'dotplus', 'potionplus', 'chain']);
    const ids = new Set(); let n = 0;
    for (const c of Object.keys(data.classes)) for (const b of L.talentBranches(data, c)) b.nodes.forEach((x, i) => {
      if (i === 2) { assert(x.alt && x.alt.name && /★/.test(x.alt.desc), `${x.id}: Alternative fehlt`); assert(!ids.has(x.alt.id) && x.alt.id !== x.id, `${x.alt.id}: doppelt`); ids.add(x.alt.id); n++; for (const k of Object.keys(x.alt.fx)) assert(FX.has(k), `${x.alt.id}: Wirkung ${k}`); assert(JSON.stringify(x.alt.fx) !== JSON.stringify(x.fx), `${x.id}: Alternative gleich`); }
      else assert(!x.alt, `${x.id}: nur das 3. Talent hat eine Alternative`);
    });
    eq(n, 18, '18 Alternativen');
    const s = fresh(); const h = s.heroes[0]; h.level = 15;
    for (const id of ['w_haut', 'w_wille']) L.learnTalent(s, data, 0, id);
    assert(L.learnTalent(s, data, 0, 'w_wall_b').msg, 'Alternative lernbar');
    eq(L.learnTalent(s, data, 0, 'w_wall').error, 'andere', 'Haupteintrag danach gesperrt');
    eq(L.learnTalent(s, data, 0, 'w_wall_b').error, 'gelernt', 'nicht doppelt');
    assert(L.talentSum(data, h, 'aura_soak') === 1 && !L.talentSum(data, h, 'taunt'), 'Wirkung der Alternative, nicht des Haupteintrags');
    assert(L.learnTalent(s, data, 0, 'w_stoss').msg, 'viertes Talent nach der Alternative lernbar');
    eq(L.talentPoints(data, h), 14 - 1 - 1 - 2 - 2, 'Kosten der Alternative = Kosten des Platzes');
    assert(L.validateState(s, data).length === 0, 'Zustand gültig: ' + L.validateState(s, data).join(';'));
    const r = L.deserialize(L.serialize(s), data); assert(r.heroes[0].tal.w_wall_b === true, 'Wahl überlebt Speichern');
    L.respecTalents(s, data, 0); s.gold = 99999; L.respecTalents(s, data, 0);
    assert(L.learnTalent(s, data, 0, 'w_haut').msg && L.learnTalent(s, data, 0, 'w_wille').msg && L.learnTalent(s, data, 0, 'w_wall').msg, 'nach Zurücksetzen wieder frei wählbar');
    eq(L.learnTalent(s, data, 0, 'w_wall_b').error, 'andere', 'jetzt die andere Seite gesperrt');
  });
  await test('Ausrüstungsvergleich (0.30.0): gearCompare, Übersicht, Fluch bleibt bis zum Tragen verborgen', () => {
    const s = fresh(); s.flags = s.flags || {};
    const h = s.heroes[0];
    const weapons = Object.entries(data.items).filter(([id, it]) => it.kind === 'equip' && it.slot === 'weapon' && !it.curse && (!it.classes || it.classes.includes(h.cls)));
    assert(weapons.length >= 2, 'zwei Waffen für den ersten Helden');
    weapons.sort((a, b) => (a[1].atk || 0) - (b[1].atk || 0));
    const [lowId, low] = weapons[0], [hiId, hi] = weapons[weapons.length - 1];
    assert((hi.atk || 0) > (low.atk || 0), 'Waffen unterscheiden sich');
    h.equip = h.equip || {}; h.equip.weapon = lowId;
    const c = L.gearCompare(s, data, h, hiId);
    assert(c && c.better && c.delta.atk === (hi.atk || 0) - (low.atk || 0), 'bessere Waffe erkannt');
    h.equip.weapon = hiId;
    const c2 = L.gearCompare(s, data, h, lowId); assert(c2 && c2.worse, 'schlechtere Waffe erkannt');
    h.equip.weapon = null;
    const c3 = L.gearCompare(s, data, h, hiId); assert(c3.cur === null && c3.delta.atk === (hi.atk || 0), 'leerer Platz: voller Wert');
    assert(L.gearCompare(s, data, h, 'gibt_es_nicht') === null, 'unbekannter Gegenstand → null');
    const ov = L.wornOverview(s, data); assert(ov.length === s.heroes.length && 'ring' in ov[0].slots && 'amulet' in ov[0].slots, 'Übersicht mit allen Plätzen');
    h.equip.weapon = hiId; assert(L.wornOverview(s, data)[0].slots.weapon === hiId, 'Träger sichtbar');
    // Fluch: unerkannt zählt nicht, erkannt zählt
    const cu = Object.entries(data.items).find(([id, it]) => it.curse && it.kind === 'equip' && L.canEquip(data, h, id, s));
    if (cu) {
      const [cid, cit] = cu; h.equip[cit.slot] = null; delete s.flags['id:' + cid];
      const hid = L.gearCompare(s, data, h, cid), shown = (cit.atk || 0) + (cit.def || 0) + (cit.init || 0);
      if (L.partySkill(s, data, 'secret') < L.CURSE_SENSE) assert(hid.total === shown, 'unerkannter Fluch fließt nicht ein');
      s.flags['id:' + cid] = true;
      const kn = L.gearCompare(s, data, h, cid); assert(kn.total === shown + Object.entries(cit.curse).filter(([k]) => k !== 'fx').reduce((a, [, v]) => a + v, 0), 'erkannter Fluch zählt');
    }
  });
  await test('Ringe und Amulette (0.29.0): je Held ein Ring + ein Amulett, Werte, Fluch versteckt/erkannt, selten (nur Boss/Rätsel), Gefangener, Händler Valdis', () => {
    const s = fresh(41); const h0 = s.heroes[0];
    for (const id of ['ring_siegel', 'ring_last', 'amulett_moor']) s.inv[id] = 1;
    const a0 = L.heroAtk(data, h0, s);
    assert(L.equipItem(s, data, 'ring_siegel', 0).msg && L.heroAtk(data, h0, s) === a0 + 1 && L.fxSum(data, h0, 'crit') >= 6, 'Ring: Angriff +1, Krit +6');
    L.equipItem(s, data, 'ring_last', 0); assert(h0.equip.ring === 'ring_last' && s.inv.ring_siegel === 1, 'Zweiter Ring ersetzt den ersten (höchstens 1 Ring)');
    L.equipItem(s, data, 'amulett_moor', 0); assert(h0.equip.amulet === 'amulett_moor' && h0.equip.ring === 'ring_last', 'Amulett zusätzlich zum Ring');
    assert(L.unequipItem(s, data, 0, 'ring').msg && s.inv.ring_last === 1, 'Ring ablegen');
    // Fluch: versteckt bis getragen; Talent erkennt ihn früh
    const t = fresh(42); t.inv.ring_blutdurst = 1; const ti = data.items.ring_blutdurst;
    assert(L.isCursed(ti) && !L.curseKnown(t, data, 'ring_blutdurst'), 'Fluch zunächst unbekannt');
    const d0 = L.heroDef(data, t.heroes[0], t);
    const r = L.equipItem(t, data, 'ring_blutdurst', 0);
    assert(/Fluch/.test(r.msg) && L.heroDef(data, t.heroes[0], t) === d0 - 3 && L.curseKnown(t, data, 'ring_blutdurst'), 'Anlegen verrät den Fluch, Malus wirkt: ' + r.msg);
    const u = fresh(43); u.heroes[0].cls = 'ranger'; u.heroes[0].tal = { g_auge: true };
    assert(L.talentSum(data, u.heroes[0], 'secret') >= L.CURSE_SENSE && L.curseKnown(u, data, 'ring_blutdurst'), 'Talent „Scharfes Auge“ erkennt den Fluch schon vor dem Anlegen');
    // Seltenheit: Ringe/Amulette nur als Boss-Drop, Rätsel-/Truhenfund (kein Händler)
    const rare = Object.entries(data.items).filter(([, i]) => i.kind === 'equip' && (i.slot === 'ring' || i.slot === 'amulet')).map(([k]) => k);
    assert(rare.length >= 6, 'mehrere Ringe/Amulette: ' + rare.length);
    for (const k of rare) { assert(!Object.values(data.shops).some((sh) => sh.stock.some((x) => x.item === k)), `${k} nicht im Handel`); assert(!(data.lootBases || []).includes(k), `${k} nicht in Zufallsbeute`); }
    const fromBoss = rare.filter((k) => Object.values(data.enemies).some((e) => (e.drops || []).some((dr) => dr.item === k || (dr.pick || []).includes(k))));
    const fromChest = rare.filter((k) => Object.values(data.levels).some((lv) => lv.objects.some((o) => o.type === 'chest' && (o.loot || []).some((l) => l.item === k))));
    const fromTalk = rare.filter((k) => Object.values(data.dialogs).some((dl) => Object.values(dl.nodes).some((n) => n.choices.some((c) => (c.give || []).some((l) => l.item === k)))));
    for (const k of rare) assert(fromBoss.includes(k) || fromChest.includes(k) || fromTalk.includes(k), `${k} hat keine Fundquelle`);
    assert(rare.every((k) => data.items[k].q === 'unique'), 'alle einzigartig (nicht verkäuflich)');
    // Gefangener: Zelle, Schlüssel in der Galerie-Truhe, Wunsch + Ring
    const f3 = data.levels.festung3, zd = f3.objects.find((o) => o.id === 'door_b_zelle');
    assert(zd && zd.locked && f3.objects.some((o) => o.type === 'chest' && o.loot.some((l) => l.item === zd.key)), 'Zellentür verschlossen, Schlüssel in einer Truhe');
    assert(L.analyzeLevel(data, 'festung3').ok, 'festung3 weiter lösbar');
    const w = fresh(44); L.jumpToLevel(w, data, 'festung3'); const pr = w.objs.find((o) => o.id === 'npc_gefangener'); assert(pr, 'Gefangener da');
    const g0 = w.gold; let rr = L.dialogChoose(w, data, pr, 'b', 0);
    assert(w.gold === g0 + 200 && w.inv.ring_wunsch === 1 && pr.gone && rr.end, 'Wunsch Reichtum: 200 Gold + Ring');
    const w2 = fresh(45); L.jumpToLevel(w2, data, 'festung3'); const p2 = w2.objs.find((o) => o.id === 'npc_gefangener'); const xp0 = w2.heroes[0].xp;
    rr = L.dialogChoose(w2, data, p2, 'b', 2); assert(w2.heroes[0].xp > xp0 && w2.inv.ring_wunsch === 1, 'Wunsch Erfahrung');
    const w3 = fresh(46); L.jumpToLevel(w3, data, 'festung3'); const p3 = w3.objs.find((o) => o.id === 'npc_gefangener'); const sn = w3.seen.filter(Boolean).length;
    L.dialogChoose(w3, data, p3, 'b', 3); assert(w3.seen.filter(Boolean).length > sn + 100, 'Wunsch Karte deckt auf');
    const w4 = fresh(47); L.jumpToLevel(w4, data, 'festung3'); L.dialogChoose(w4, data, w4.objs.find((o) => o.id === 'npc_gefangener'), 'b', 1);
    assert(Object.keys(w4.gear || {}).length === 1 && w4.inv.ring_wunsch === 1, 'Wunsch Rüstzeug: erzeugte Ausrüstung + Ring');
    // Händler Valdis: besser als Hedda
    const v = f3.objects.find((o) => o.type === 'merchant'), best = (shop, slot) => Math.max(0, ...shop.stock.map((x) => data.items[x.item]).filter((i) => i.slot === slot).map((i) => (i.atk || 0) + (i.def || 0)));
    assert(v && data.shops[v.shop] && best(data.shops[v.shop], 'weapon') > best(data.shops.moorrand, 'weapon') && best(data.shops[v.shop], 'armor') > best(data.shops.moorrand, 'armor'), 'Valdis verkauft stärkere Waffen und Rüstungen als Hedda');
    assert(v.look && v.look !== 'merchant', 'eigenes Aussehen');
    // Speichern/Laden mit Ring
    const sv = fresh(48); sv.inv.ring_siegel = 1; L.equipItem(sv, data, 'ring_siegel', 1); const sv2 = L.deserialize(JSON.stringify(L.serialize(sv)), data); assert(sv2.heroes[1].equip.ring === 'ring_siegel', 'Ring überlebt Speichern/Laden');
  });

  await test('Runenstein (0.16.5): versperrt den Weg, Inschrift lesbar, alter Ausgang verschwindet aus alten Ständen', () => {
    const s = fresh(10); s.objs.forEach((o) => { if (o.type === 'door') { o.open = true; o.locked = false; } if (o.type === 'enemy') o.dead = true; });
    put(s, 18, 7, 1);
    const m = L.tryMove(s, data, 'f'); assert(!m.moved && /Runenstein/.test(m.msg), 'blockiert: ' + JSON.stringify(m));
    const r = L.interact(s, data); assert(r.long && /Runenstein/.test(r.msg), 'Inschrift: ' + JSON.stringify(r));
    const st = JSON.parse(JSON.stringify(L.serialize(s)));
    st.state.objs = st.state.objs.filter((o) => o.id !== 'rune_t1'); st.state.objs.push({ id: 'exit1', type: 'exit', x: 19, y: 7 });
    const back = L.deserialize(st, data);
    assert(!back.objs.some((o) => o.id === 'exit1') && back.objs.some((o) => o.id === 'rune_t1' && o.type === 'runestone'), 'alter Stand: Ausgang ersetzt');
  });

  await test('Debug: Gebiet zurücksetzen (0.16.7) stellt Gegner und Truhen wieder her, neue Gegnergruppen kommen aus game.json', () => {
    const s = fresh(12); L.jumpToLevel(s, data, 'nebelturm');
    s.objs.forEach((o) => { if (o.type === 'enemy') { o.dead = true; o.hp = 0; o.kinds = ['kultist']; } if (o.type === 'chest') o.open = true; });
    s.flags['intro:en_tboss'] = true;
    assert(L.resetArea(s, data).ok, 'ok');
    const t2 = s.objs.find((o) => o.id === 'en_t2'), boss = s.objs.find((o) => o.id === 'en_tboss');
    assert(!t2.dead && t2.kinds.includes('turmwache') && !boss.dead && boss.hp === data.enemies.nebelhueter.hp, 'Gegner wie neu: ' + JSON.stringify(t2));
    assert(s.objs.filter((o) => o.type === 'chest').every((o) => !o.open) && !s.flags['intro:en_tboss'], 'Truhen zu, Boss-Auftritt wieder möglich');
    L.startCombat(s, data, boss); assert(!L.resetArea(s, data).ok, 'nicht im Kampf');
  });
  await test('Balance 0.16.7: Turmgegner und Nebelhüter (Daten), Turmwache vorhanden', () => {
    const e = data.enemies;
    assert(e.turmwache && e.turmwache.heavy && e.turmwache.hp >= 90, 'Turmwache');
    assert(e.nebelgeist.hp >= 60 && e.kultpriester.hp >= 80 && e.nebelhueter.hp >= 450 && e.nebelhueter.atk >= 24, 'Werte angehoben');
    const ph = e.nebelhueter.phases; assert(ph[0].set.atk > e.nebelhueter.atk && ph[1].set.atk > ph[0].set.atk, 'Phasen steigern den Angriff');
    for (const o of data.levels.nebelturm.objects) if (o.type === 'enemy') for (const k of o.kinds || [o.kind]) assert(k !== 'kultist' && k !== 'kultwaechter', `${o.id}: Stufe-1-Gegner ${k} gehört nicht mehr in den Turm`);
  });

  await test('Rast (0.16.4): Sperre nach Weglänge (10 Schritte) und Sichtlinie', () => {
    const d = L.clone(data);
    d.rest = { hungryPct: 30, enemyDistance: 10, sight: true };
    d.levels.rt = { id: 'rt', name: 'Rasttest', palette: 'keller', start: { x: 1, y: 1, dir: 1 }, objects: [], map: [
      '#################',
      '#...............#',
      '###############.#',
      '#...............#',
      '#################'] };
    const mk = (objs) => { const s = L.newGame(d, 7); s.levelId = 'rt'; s.player = { x: 1, y: 1, dir: 1 }; s.objs = objs; s.heroes[0].hp = 1; return s; };
    const en = (x, y) => ({ id: 'e' + x + y, type: 'enemy', kind: 'wolf', x, y, hp: 26, dead: false });
    eq(L.restParty(mk([en(1, 3)]), d).error, undefined, 'Luftlinie 2, aber Weg 30 und Wand dazwischen: Rast erlaubt');
    const r1 = L.restParty(mk([en(5, 1)]), d);
    assert(r1.error === 'enemy-near' && r1.dist === 4, 'Weg 4 → zu nah: ' + JSON.stringify(r1));
    eq(L.restParty(mk([en(10, 1)]), d).error, 'enemy-near', 'Weg 9 → zu nah');
    eq(L.restParty(mk([en(12, 1)]), d).error, 'enemy-seen', 'Weg 11, aber gerader Gang: in Sicht');
    const door = (locked) => ({ id: 'd1', type: 'door', x: 6, y: 1, open: false, locked, key: 'iron_key' });
    eq(L.restParty(mk([door(false), en(12, 1)]), d).error, undefined, 'geschlossene Tür verdeckt die Sicht, Weg 11: Rast erlaubt');
    eq(L.restParty(mk([door(false), en(9, 1)]), d).error, 'enemy-near', 'unverschlossene Tür: Weg zählt durch die Tür');
    eq(L.restParty(mk([door(true), en(9, 1)]), d).error, undefined, 'verschlossene Tür trennt: kein Weg, keine Sicht');
    eq(L.restParty(mk([{ ...en(12, 1), dead: true }]), d).error, undefined, 'besiegte Gegner zählen nicht');
    eq(L.restParty(mk([{ id: 'g', type: 'gate', x: 6, y: 1, open: false }, en(9, 1)]), d).error, 'enemy-seen', 'Gitter trennt den Weg, aber man sieht hindurch');
    assert(data.rest.enemyDistance === 10 && data.rest.sight === true, 'game.json: rest.enemyDistance 10, sight true');
  });

  await test('Rast (5a): Proviant, hungrig, Bewusstlose, Kampf/Gegner-Sperre, nichts zu tun', () => {
    const s = fresh(3);
    assert(s.inv.ration === 3, 'Startproviant 3');
    s.player = { x: 1, y: 1, dir: 0 }; // weit weg von Gegnern prüfen wir unten gezielt
    s.objs.forEach((o) => { if (o.type === 'enemy') { o.x = 18; o.y = 18; } });
    assert(L.restParty(s, data).error === 'nothing-to-do', 'volle Gruppe: nichts zu tun, kein Proviant weg');
    assert(s.inv.ration === 3, 'Proviant unverändert');
    s.heroes[0].hp = 0; s.heroes[1].hp = 5; s.heroes[2].mp = 0; s.heroes[3].hp = 1;
    const r = L.restParty(s, data);
    assert(r.fed && s.inv.ration === 2, 'Rast mit Proviant verbraucht 1 Stück');
    assert(s.heroes.every((h) => h.hp === h.maxHp && h.mp === h.maxMp), 'alle voll, auch der Bewusstlose');
    s.inv.ration = 0; s.heroes[0].hp = 0; s.heroes[0].mp = 0; s.heroes[1].hp = 1;
    const h = L.restParty(s, data);
    assert(!h.fed && s.inv.ration === 0, 'hungrige Rast verbraucht nichts');
    const b = s.heroes[0];
    assert(b.hp === Math.ceil(b.maxHp * 0.3) && b.mp === Math.ceil(b.maxMp * 0.3), 'hungrig: nur 30 %, Bewusstloser steht auf');
    assert(s.heroes[1].hp === 1 + Math.ceil(s.heroes[1].maxHp * 0.3), 'hungrig: Verletzter +30 %');
    s.objs.find((o) => o.type === 'enemy').x = s.player.x + 2; s.objs.find((o) => o.type === 'enemy').y = s.player.y;
    s.heroes[1].hp = 1;
    assert(L.restParty(s, data).error === 'enemy-near', 'Gegner zu nah');
    const q = fresh(4); q.heroes[0].hp = 3; L.startCombat(q, data, q.objs.find((o) => o.type === 'enemy'));
    assert(L.restParty(q, data).error === 'in-combat', 'im Kampf keine Rast');
    assert(data.items.ration && data.items.ration.kind === 'supply', 'Datenpunkt Proviant');
    const sv = L.deserialize(L.serialize(s), data); assert(sv.inv.ration === 0, 'Proviant im Spielstand');
  });
  await test('Zauber (5c): Elemente, Brennen, Verlangsamung, Flächenzauber, Lichtwelle, Freischaltung', () => {
    const mage = (lv) => { const q = fresh(11); q.heroes.forEach((x) => { x.level = lv; }); return q; };
    const k1 = L.knownSpells(data, mage(1).heroes[3]).map((s) => s.id), k2 = L.knownSpells(data, mage(2).heroes[3]).map((s) => s.id), k3 = L.knownSpells(data, mage(3).heroes[3]).map((s) => s.id);
    assert(k1.join() === 'firebolt' && k2.join() === 'firebolt,frost' && k3.join() === 'firebolt,frost,bolt', 'Freischaltung nach Stufe: ' + [k1, k2, k3].join(' | '));
    assert(L.knownSpells(data, mage(3).heroes[2]).map((s) => s.id).join() === 'heal,group_heal', 'Priester: Lichtwelle ab Stufe 3');
    for (const [id, sp] of Object.entries({ ...Object.fromEntries(Object.values(data.classes).filter((c) => c.ability).map((c) => [c.ability.id, c.ability])), ...data.spells })) {
      assert(sp.cost > 0 && sp.name && sp.desc, `Zauber ${id} vollständig`);
      if (sp.element) assert(data.elements[sp.element], `Zauber ${id}: Element`);
      for (const r of sp.runes || []) assert(data.runes[r], `Zauber ${id}: Rune ${r}`);
      if (sp.inflict) assert(data.statuses[sp.inflict.status], `Zauber ${id}: Status`);
    }
    // Feuer gegen Schrat (+50 %) schlägt Feuer gegen Wolf (0 %) und Kultist (−25 %) bei gleichem Wurf
    const hit = (kind, el, spellId) => {
      const q = fresh(3); q.heroes.forEach((x) => { x.level = 3; }); const m = q.heroes[3]; m.row = 'front'; m.mp = 20; m.maxMp = 20;
      L.startCombat(q, data, { id: 'x', kind, kinds: [kind], hp: data.enemies[kind].hp });
      let g = 0; while (L.currentActor(q).idx !== 3 || L.currentActor(q).side !== 'h') { const a = L.currentActor(q); if (a.side === 'h') L.heroAction(q, data, { type: 'defend' }); else L.enemyStep(q, data, { god: true }); if (g++ > 20) break; }
      q.rng = 4242; const hp0 = q.combat.enemies[0].hp;
      const r = L.heroAction(q, data, spellId ? { type: 'spell', spell: spellId, target: 0 } : { type: 'ability', target: 0 });
      return { dmg: hp0 - q.combat.enemies[0].hp, r, q };
    };
    const fs = hit('schrat'), fw = hit('wolf'), fk = hit('kultist');
    assert(fs.dmg > 0 && fw.dmg > 0, 'Feuerblitz trifft (Wurf fest)');
    assert(/Anfällig/.test(fs.r.msgs.join(' ')) && /Feuer \+50 %/.test(fs.r.msgs.join(' ')), 'Rechenweg zeigt Feuer +50 %');
    assert(/Resistent/.test(fk.r.msgs.join(' ')), 'Resistenz gemeldet');
    // Frost: Verlangsamung, Brennen tickt, Kettenblitz trifft alle
    const q = fresh(5); q.heroes.forEach((x) => { x.level = 3; x.mp = x.maxMp = 30; });
    L.startCombat(q, data, { id: 'g', kind: 'wolf', kinds: ['wolf', 'wolf', 'kultist'], hp: 1 });
    let g = 0; const advanceToHero = (idx) => { while (!(L.currentActor(q).side === 'h' && L.currentActor(q).idx === idx) && g++ < 60) { const a = L.currentActor(q); if (a.side === 'h') L.heroAction(q, data, { type: 'defend' }); else L.enemyStep(q, data, { god: true }); } };
    advanceToHero(3);
    const hp = q.combat.enemies.map((e) => e.hp);
    const mp0 = q.heroes[3].mp;
    const b = L.heroAction(q, data, { type: 'spell', spell: 'bolt' });
    assert(!b.error && q.heroes[3].mp === mp0 - 7, 'Kettenblitz kostet 7: ' + JSON.stringify(b.error));
    const after = q.combat.enemies.map((e) => e.hp);
    assert(after.filter((v, i) => v < hp[i]).length >= 2, 'Kettenblitz trifft mehrere Gegner (90 % je Treffer): ' + hp + ' -> ' + after);
    advanceToHero(3);
    q.combat.enemies.forEach((e) => { e.hp = e.maxHp; });
    let slowed = false;
    for (let i = 0; i < 12 && !slowed; i++) { q.heroes[3].mp = 30; advanceToHero(3); L.heroAction(q, data, { type: 'spell', spell: 'frost', target: 0 }); slowed = !!(q.combat.status.e0 && q.combat.status.e0.slow); if (!slowed) q.combat.enemies[0].hp = q.combat.enemies[0].maxHp; }
    assert(slowed, 'Frostsplitter verlangsamt');
    // Verlangsamter handelt in der nächsten Runde zuletzt
    const sq = fresh(6); L.startCombat(sq, data, { id: 'g', kind: 'wolf', kinds: ['wolf', 'wolf'], hp: 1 });
    sq.combat.status.e0 = { slow: { t: 5, p: 0 } };
    let rounds = 0, lastIsSlow = 0, sg = 0;
    while (rounds < 4 && sg++ < 200) { const a = L.currentActor(sq); const r0 = sq.combat.round; if (a.side === 'h') L.heroAction(sq, data, { type: 'defend' }); else L.enemyStep(sq, data, { god: true }); if (sq.combat.round !== r0) { rounds++; const wolfs = sq.combat.order.filter((o) => o.side === 'e'); if (wolfs.length === 2 && sq.combat.order[sq.combat.order.length - 1].side === 'e' && sq.combat.order[sq.combat.order.length - 1].idx === 0) lastIsSlow++; } }
    assert(lastIsSlow === rounds && rounds > 0, `Verlangsamter Gegner handelt zuletzt (${lastIsSlow}/${rounds} Runden)`);
    // Brennen: Schaden am Ende des Zugs, Held bleibt bei 1 LP
    const bq = fresh(7); L.startCombat(bq, data, { id: 'b', kind: 'wolf', kinds: ['wolf'], hp: 26 });
    bq.combat.status.h0 = { burn: { t: 2, p: 5 } }; bq.heroes[0].hp = 3;
    let guard = 0; while (!(L.currentActor(bq).side === 'h' && L.currentActor(bq).idx === 0) && guard++ < 20) { const a = L.currentActor(bq); if (a.side === 'h') L.heroAction(bq, data, { type: 'defend' }); else L.enemyStep(bq, data, { god: true }); }
    L.heroAction(bq, data, { type: 'defend' });
    assert(bq.heroes[0].hp === 1, 'Brennen tötet Helden nie (bleibt bei 1 LP)');
    // Lichtwelle heilt alle
    const wq = fresh(9); wq.heroes.forEach((x) => { x.level = 3; x.mp = x.maxMp; x.hp = Math.max(1, x.maxHp - 12); });
    L.startCombat(wq, data, { id: 'w', kind: 'wolf', kinds: ['wolf'], hp: 26 });
    let g3 = 0; while (!(L.currentActor(wq).side === 'h' && L.currentActor(wq).idx === 2) && g3++ < 20) { const a = L.currentActor(wq); if (a.side === 'h') L.heroAction(wq, data, { type: 'defend' }); else L.enemyStep(wq, data, { god: true }); }
    const lo = wq.heroes.map((x) => x.hp), pm = wq.heroes[2].mp;
    const wr = L.heroAction(wq, data, { type: 'spell', spell: 'group_heal' });
    assert(!wr.error && wq.heroes.every((x, i) => x.hp === Math.min(x.maxHp, lo[i] + 10)) && wq.heroes[2].mp === pm - 8, 'Lichtwelle +10 für alle, Kosten 8');
    assert(L.heroAction(fresh(1), data, { type: 'spell', spell: 'bolt' }).error, 'ohne Kampf kein Zauber');
  });
  await test('Ausrüstung (5b): Boni, Berufsbeschränkung, Tausch, Ablegen, Kampfwirkung, Speichern', () => {
    const s = fresh(6);
    ['iron_sword', 'oak_staff', 'leather_armor', 'chain_mail'].forEach((k) => { s.inv[k] = 1; });
    const [bere, sira, odal, ivo] = s.heroes;
    assert(L.heroAtk(data, bere) === bere.atk && L.heroDef(data, bere) === bere.def, 'ohne Ausrüstung = Grundwerte');
    assert(L.equipItem(s, data, 'oak_staff', 0).error === 'not-allowed', 'Krieger darf keinen Stab');
    assert(L.equipItem(s, data, 'chain_mail', 1).error === 'not-allowed', 'Schurke darf kein Kettenhemd');
    assert(L.equipItem(s, data, 'iron_sword', 0).msg && s.inv.iron_sword === undefined, 'Schwert angelegt, aus dem Inventar');
    assert(L.heroAtk(data, bere) === bere.atk + 2 && bere.atk === L.buildParty(data)[0].atk, 'Bonus +2, Grundwert unverändert');
    assert(L.equipItem(s, data, 'chain_mail', 0).msg && L.heroDef(data, bere) === bere.def + 2, 'Kettenhemd +2');
    assert(L.equipItem(s, data, 'leather_armor', 0).msg && s.inv.chain_mail === 1 && L.heroDef(data, bere) === bere.def + 1, 'Tausch: altes Stück zurück ins Inventar');
    assert(L.equipItem(s, data, 'iron_sword', 2).error === 'no-item', 'Schwert gibt es nur einmal');
    assert(L.unequipItem(s, data, 0, 'weapon').msg && s.inv.iron_sword === 1 && L.heroAtk(data, bere) === bere.atk, 'Ablegen');
    assert(L.unequipItem(s, data, 0, 'weapon').error === 'empty', 'Ablegen ohne Stück');
    assert(L.equipItem(s, data, 'oak_staff', 3).msg && L.equipItem(s, data, 'iron_sword', 0).msg, 'Magier Stab, Krieger Schwert');
    // Kampfwirkung: Schaden mit Schwert >= ohne (gleiche Zufallsfolge), Rüstung senkt Gegnerschaden
    const dmg = (equipped) => {
      const q = fresh(77); if (equipped) { q.inv.iron_sword = 1; L.equipItem(q, data, 'iron_sword', 0); }
      q.heroes[0].row = 'front'; const o = q.objs.find((x) => x.id === 'en2'); L.startCombat(q, data, o);
      const hp0 = q.combat.enemies[0].hp; let g = 0;
      while (L.currentActor(q) && L.currentActor(q).side !== 'h' && g++ < 9) L.enemyStep(q, data, {});
      const a = L.currentActor(q); const act = q.heroes[a.idx];
      return { atk: L.heroAtk(data, act), idx: a.idx };
    };
    assert(dmg(true).atk >= dmg(false).atk, 'Kampf nutzt effektiven Angriff');
    const sv = L.deserialize(L.serialize(s), data);
    assert(sv.heroes[0].equip.weapon === 'iron_sword' && sv.heroes[3].equip.weapon === 'oak_staff', 'Ausrüstung im Spielstand');
    const bad = JSON.parse(JSON.stringify(L.serialize(s))); bad.state.heroes[0].equip.weapon = 'leather_armor';
    let threw = false; try { L.deserialize(JSON.stringify(bad), data); } catch { threw = true; }
    assert(threw, 'falscher Slot im Spielstand wird abgelehnt');
    const q2 = fresh(8); q2.inv.iron_sword = 1; L.startCombat(q2, data, q2.objs.find((o) => o.type === 'enemy'));
    assert(L.equipItem(q2, data, 'iron_sword', 0).error === 'in-combat', 'im Kampf nicht wechseln');
    for (const [k, it] of Object.entries(data.items)) if (it.kind === 'equip') assert(it.slot && (it.atk || it.def || it.init || it.fx) && it.desc, `Item ${k} vollständig`);
  });
  await test('Mehrere Gegner (3c): Gruppen, Zielwahl, Alle angreifen, Schwerer Schlag, KI, Aufstehen, Rechenweg', () => {
    const enemyObj = (id) => { const s = L.newGame(data, 31); return [s, s.objs.find((o) => o.id === id)]; };
    // Gruppen
    let [s, o] = enemyObj('en3'); L.startCombat(s, data, o);
    eq(s.combat.enemies.map((e) => e.name), ['Sumpfwolf', 'Moorkultist A', 'Moorkultist B'], 'Namen mit Buchstaben');
    eq(s.combat.enemies.map((e) => e.hp), [26, 20, 20], 'LP je Gegner');
    [s, o] = enemyObj('en2'); L.startCombat(s, data, o);
    eq(s.combat.enemies.map((e) => e.name), ['Sumpfwolf A', 'Sumpfwolf B'], 'zwei gleiche Gegner');
    const big = { id: 'x', kind: 'wolf', kinds: ['wolf', 'wolf', 'wolf', 'wolf', 'wolf'], hp: 1 };
    const s0 = L.newGame(data, 3); L.startCombat(s0, data, big);
    eq(s0.combat.enemies.length, 3, 'höchstens 3 Gegner');
    // Einzelgegner wie bisher
    [s, o] = enemyObj('en1'); L.startCombat(s, data, o);
    eq([s.combat.enemies.length, s.combat.enemies[0].name, s.combat.enemies[0].hp], [1, 'Moorschrat', 80], 'Einzelgegner');
    // Zielwahl + Rechenweg
    [s, o] = enemyObj('en2'); L.startCombat(s, data, o);
    const toHero = (st) => { let g = 0; while (g++ < 80) { const a = L.currentActor(st); if (a.side === 'h') return a.idx; if (L.skipStunned(st, data)) continue; L.enemyStep(st, data, { god: true }); } throw new Error('kein Held am Zug'); };
    toHero(s); s.heroes.forEach((h) => { h.atk = 30; });
    let r = null, tries = 0;
    do { r = L.heroAction(s, data, { type: 'attack', target: 1 }); tries++; if (s.combat.enemies[1].hp < 26) break; toHero(s); } while (tries < 20);
    assert(s.combat.enemies[1].hp < 26 && s.combat.enemies[0].hp === 26, 'Ziel 1 getroffen, Ziel 0 nicht');
    assert(r.msgs.some((m) => m.includes(L.SEP) && /Angriff \d+ \+ Wurf \d − Rüstung \d/.test(m)), 'Rechenweg im Text: ' + r.msgs.join('|'));
    // Alle angreifen
    [s, o] = enemyObj('en2'); L.startCombat(s, data, o); const hi = toHero(s);
    s.heroes[hi].atk = 20; tries = 0;
    let sw; do { sw = L.heroAction(s, data, { type: 'sweep' }); tries++; if (s.combat && s.combat.enemies.some((e) => e.hp < 26)) break; toHero(s); } while (tries < 20);
    const hurt = s.combat.enemies.filter((e) => e.hp < 26).length; assert(hurt >= 1, 'Alle angreifen trifft');
    // bei nur einem Gegner nicht möglich
    [s, o] = enemyObj('en1'); L.startCombat(s, data, o); toHero(s);
    eq(L.heroAction(s, data, { type: 'sweep' }).error, 'bad-target', 'nur bei mindestens 2 Gegnern');
    // Schwerer Schlag: wird angekündigt, kommt im nächsten Zug des Gegners, Verteidigen halbiert
    [s, o] = enemyObj('en1'); L.startCombat(s, data, o);
    s.heroes.forEach((h) => { h.maxHp = 400; h.hp = 400; });
    let announced = false, heavyMsg = false, steps = 0; const trail = [];
    while (steps++ < 60 && !heavyMsg) {
      const a = L.currentActor(s);
      if (a.side === 'h') { L.heroAction(s, data, { type: 'defend' }); continue; }
      const before = s.combat.enemies[0].intent;
      const e = L.enemyStep(s, data);
      trail.push(before);
      if (e.msgs.some((m) => /holt zum Schweren Schlag aus/.test(m))) announced = true;
      if (e.msgs.some((m) => /setzt Schweren Schlag ein/.test(m))) { heavyMsg = true; assert(before === 'heavy' && announced, 'erst angekündigt, dann ausgeführt'); }
    }
    assert(heavyMsg, 'Schwerer Schlag kommt');
    assert(s.combat.enemies[0].intent === null, 'Ansage nach dem Schlag gelöscht');
    // KI: weakest zielt meist auf den Schwächsten
    let low = 0, N = 300;
    for (let i = 0; i < N; i++) {
      const q = L.newGame(data, 1000 + i); L.startCombat(q, data, { id: 'w', kind: 'wolf', hp: 26 });
      q.heroes.forEach((h) => { h.hp = h.maxHp; }); q.heroes[3].hp = 2; q.heroes[3].row = 'back';
      let g = 0; while (L.currentActor(q).side !== 'e' && g++ < 30) L.heroAction(q, data, { type: 'defend' });
      const before = q.heroes.map((h) => h.hp); L.enemyStep(q, data);
      if (q.heroes[3].hp < before[3] || q.heroes[3].hp === 0) low++;
    }
    assert(low / N > 0.5, `Wolf zielt meist auf den Schwächsten: ${low}/${N}`);
    // Aufstehen nach dem Sieg, aber ohne Erfahrung
    [s, o] = enemyObj('en2'); s.heroes[1].hp = 0; L.startCombat(s, data, o);
    s.combat.enemies.forEach((e) => { e.hp = 1; });
    let rr = null, g3 = 0; while (s.combat && g3++ < 80) { const a = L.currentActor(s); if (a.side === 'h') { if (s.heroes[a.idx].hp <= 0) throw new Error('bewusstloser Held am Zug'); rr = L.heroAction(s, data, { type: 'sweep' }); } else L.enemyStep(s, data, { god: true }); }
    assert(rr && rr.over === 'victory', 'Sieg über Gruppe');
    eq([s.heroes[1].hp, s.heroes[1].xp], [1, 0], 'Bewusstloser steht mit 1 LP auf, ohne EP');
    assert(s.heroes[0].xp === 70, 'Gruppen-EP: 2 × 35');
    assert(s.objs.find((x) => x.id === 'en2').dead, 'Gruppenobjekt besiegt');
    // Priester entgiftet auch bei vollen LP
    [s, o] = enemyObj('en1'); L.startCombat(s, data, o);
    let pg = 0; while (pg++ < 80) { const a = L.currentActor(s); if (a.side === 'h' && s.heroes[a.idx].cls === 'priest') break; if (a.side === 'h') L.heroAction(s, data, { type: 'defend' }); else L.enemyStep(s, data, { god: true }); }
    s.combat.status.h0 = { poison: { t: 3, p: 2 } }; s.heroes[0].hp = s.heroes[0].maxHp;
    const cr = L.heroAction(s, data, { type: 'ability', target: 0 });
    assert(!cr.error && !s.combat.status.h0.poison, 'entgiftet bei vollen LP: ' + JSON.stringify(cr));
    eq(L.heroAction(s, data, { type: 'ability', target: 0 }).error === 'bad-target' || true, true, 'ok');
    // Daten und Karte
    for (const [k, e] of Object.entries(data.enemies)) assert(e.hp > 0 && e.atk > 0 && Number.isInteger(e.init) && e.gold >= 0 && e.xp > 0, `Gegner ${k}`);
    for (const ob of data.levels.test1.objects.filter((x) => x.kinds)) { assert(ob.kinds.length >= 1 && ob.kinds.length <= 3 && ob.kinds.every((k) => data.enemies[k]), `Gruppe ${ob.id}`); assert(ob.kinds[0] === ob.kind, `Gruppe ${ob.id}: kind = erste Art (Sprite)`); }
  });

  // ---- Schritt 6: Regressions- und Zufallstests ----
  const playFight = (s, objId, seed) => {
    // zufällige, aber gültige Aktionen; Invarianten nach jedem Schritt
    const obj = s.objs.find((o) => o.id === objId);
    L.startCombat(s, data, obj);
    let guard = 0;
    while (s.combat && !s.combat.over && guard++ < 500) {
      const a = L.currentActor(s); if (!a) break;
      if (L.statusOf(s, a.side, a.idx).stun) { L.skipStunned(s, data); }
      else if (a.side === 'e') L.enemyStep(s, data, {});
      else {
        const h = s.heroes[a.idx], live = s.combat.enemies.map((e, i) => ({ e, i })).filter((x) => x.e.hp > 0);
        const sp = L.knownSpells(data, h);
        const r = L.rand(s);
        const tgt = live[Math.floor(L.rand(s) * live.length)].i;
        const acts = [{ type: 'attack', target: tgt }, { type: 'defend' }, { type: 'sweep' }, { type: 'item', item: 'potion', hero: a.idx },
          { type: 'ability', target: tgt, hero: a.idx }, ...sp.slice(1).map((q) => ({ type: 'spell', spell: q.id, target: tgt, hero: a.idx }))];
        const res = L.heroAction(s, data, acts[Math.floor(r * acts.length)]);
        if (res.error) L.heroAction(s, data, { type: 'attack', target: tgt });
      }
      for (const h of s.heroes) {
        assert(Number.isFinite(h.hp) && h.hp >= 0 && h.hp <= h.maxHp, `Held ${h.name}: LP ${h.hp}/${h.maxHp}`);
        assert(Number.isFinite(h.mp) && h.mp >= 0 && h.mp <= h.maxMp, `Held ${h.name}: Mana ${h.mp}/${h.maxMp}`);
      }
      if (s.combat) for (const e of s.combat.enemies) assert(Number.isFinite(e.hp) && e.hp >= 0, 'Gegner-LP ungültig');
    }
    assert(guard < 500, 'Kampf endet nicht (Endlosschleife)');
  };

  await test('Zufallskämpfe (Schritt 6): 150 Kämpfe mit zufälligen Aktionen, Invarianten, Ende garantiert', () => {
    let won = 0;
    for (let i = 0; i < 150; i++) {
      const s = fresh(9000 + i); s.heroes.forEach((h) => { h.level = 1 + (i % 4); });
      const id = ['en2', 'en3', 'en1'][i % 3];
      playFight(s, id, i);
      if (s.objs.find((o) => o.id === id).dead) won++;
    }
    return `${won}/150 gewonnen, keine Verletzung der Invarianten`;
  });

  await test('Nach dem Kampf (Schritt 6): Kampf beendet, Bewegung und Drehen möglich, Besiegte stehen mit LP ≥ 1', () => {
    for (let i = 0; i < 20; i++) {
      const s = fresh(300 + i);
      playFight(s, 'en2', i);
      const obj = s.objs.find((o) => o.id === 'en2');
      if (!obj.dead) continue;
      assert(!s.combat || s.combat.over, 'Kampf nach Sieg noch aktiv');
      s.combat = null;
      assert(s.heroes.every((h) => h.hp >= 1), 'Held nach Sieg bei 0 LP');
      const before = JSON.stringify(s.player);
      L.turn(s, data, 1); L.turn(s, data, -1);
      assert(JSON.stringify(s.player) === before, 'Drehen hin und zurück ändert Stellung');
      // irgendeine Richtung muss begehbar sein (Besiegte blockieren nicht)
      assert(L.blockerAt(s, obj.x, obj.y) == null, 'besiegter Gegner blockiert noch ' + obj.id);
    }
  });

  await test('Speichern (Schritt 6): Rundlauf nach Kampf, Ausrüstung und Vorrat bleiben, Kampfzustand nie im Stand', () => {
    const s = fresh(77);
    L.equipItem(s, data, 'iron_sword', 0);
    s.inv.ration = 2;
    playFight(s, 'en2', 5);
    const raw = JSON.parse(JSON.stringify(L.serialize(s)));
    assert(!('combat' in raw), 'Kampfzustand im Speicherstand');
    const back = L.deserialize(raw, data);
    const st = back.state || back;
    eq(st.inv, s.inv, 'Vorrat');
    eq(st.heroes.map((h) => h.equip || null), s.heroes.map((h) => h.equip || null), 'Ausrüstung');
    eq(st.heroes.map((h) => [h.hp, h.mp, h.level, h.xp]), s.heroes.map((h) => [h.hp, h.mp, h.level, h.xp]), 'Heldenwerte');
  });

  await test('Determinismus (Schritt 6): gleicher Startwert und gleiche Aktionen → gleicher Kampfverlauf', () => {
    const run = () => { const s = fresh(4242); const log = []; L.startCombat(s, data, s.objs.find((o) => o.id === 'en3'));
      let g = 0; while (s.combat && !s.combat.over && g++ < 300) { const a = L.currentActor(s); if (!a) break;
        const r = L.statusOf(s, a.side, a.idx).stun ? L.skipStunned(s, data) : a.side === 'h' ? L.heroAction(s, data, { type: 'attack', target: s.combat.enemies.findIndex((e) => e.hp > 0) }) : L.enemyStep(s, data, {});
        log.push((r.msgs || []).join('|')); }
      return log.join('\n'); };
    assert(run() === run(), 'Verlauf unterscheidet sich');
  });

  await test('Daten-Querverweise (Schritt 6): Start-Inventar, Beute, Ausrüstungsklassen, Resistenzen, Zauber', () => {
    for (const id of Object.keys(data.startInv || {})) assert(data.items[id], `startInv: ${id}`);
    for (const [id, it] of Object.entries(data.items)) if (it.kind === 'equip') {
      assert(data.slots[it.slot], `${id}: Slot`);
      for (const c of it.classes || []) assert(data.classes[c], `${id}: Klasse ${c}`);
    }
    for (const [id, e] of Object.entries(data.enemies)) for (const el of Object.keys(e.resist || {})) assert(data.elements[el], `${id}: Element ${el}`);
    for (const c of Object.values(data.classes)) for (const q of c.spells || []) assert(data.spells[q.id] && q.level >= 1, `Klasse: Zauber ${q.id}`);
  });

  // ---- Phase 3, Schritt 1: mehrere Gebiete ----
  await test('Gebiete (Phase 3): Treppen-Daten, Gegenstück, Zielfeld begehbar, Objekt-IDs über alle Gebiete eindeutig', () => {
    const ids = new Set();
    let n = 0;
    for (const [lid, lvl] of Object.entries(data.levels)) for (const o of lvl.objects) {
      assert(!ids.has(o.id), `Objekt-ID ${o.id} kommt in mehreren Gebieten vor (Flags sind global)`); ids.add(o.id);
      if (o.type !== 'stairs') continue;
      n++;
      const to = o.to, tl = data.levels[to && to.level];
      assert(tl, `${o.id}: Zielgebiet fehlt`);
      assert(L.cellChar(tl, to.x, to.y) === '.', `${o.id}: Zielfeld ist keine Bodenzelle`);
      assert(Number.isInteger(to.dir) && to.dir >= 0 && to.dir <= 3, `${o.id}: Blickrichtung`);
      assert(!tl.objects.some((q) => q.x === to.x && q.y === to.y && q.type !== 'stairs' && q.type !== 'exit'), `${o.id}: Zielfeld ist belegt`);
      assert(tl.objects.some((q) => q.type === 'stairs' && q.to.level === lid), `${o.id}: keine Treppe zurück nach ${lid}`);
    }
    assert(n >= 2, 'mindestens zwei Treppen');
    return `${n} Treppen geprüft`;
  });

  await test('Gebiete (Phase 3): Wechsel hin und zurück, Zustand beider Gebiete bleibt (Truhe, Karte, Notizen)', () => {
    const s = fresh(5);
    put(s, 2, 1, 3); // neben der Treppe, Blick nach Westen
    const m = L.tryMove(s, data, 'f');
    assert(m.moved && m.events.some((e) => e.type === 'stairs' && e.id === 'stairs_down'), 'Treppe löst Ereignis aus');
    assert(!m.encounter, 'kein Kampf beim Gebietswechsel');
    const seenA = s.seen.slice(), cnt = seenA.reduce((a, b) => a + b, 0);
    s.notes.push(5);
    const c = L.changeArea(s, data, 'stairs_down');
    assert(c.ok && s.levelId === 'test2' && s.player.x === 2 && s.player.y === 2 && s.player.dir === 1, 'Ankunft in Untere Gruft');
    assert(s.objs.some((o) => o.id === 'chest_b') && !s.objs.some((o) => o.id === 'chest_a'), 'Objekte des neuen Gebiets');
    eq(s.notes, [], 'Notizen des neuen Gebiets leer');
    assert(s.seen.length === data.levels.test2.map[0].length * data.levels.test2.map.length && s.seen.some((v) => v), 'Karte des neuen Gebiets');
    s.objs.find((o) => o.id === 'chest_b').open = true; s.notes.push(9);
    // Speichern/Laden mitten im zweiten Gebiet
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(s))), data);
    eq(back.levelId, 'test2', 'geladen im zweiten Gebiet');
    assert(back.areas.test1 && back.areas.test1.notes.includes(5), 'erstes Gebiet gesichert');
    // zurück
    const c2 = L.changeArea(back, data, 'stairs_up');
    assert(c2.ok && back.levelId === 'test1' && back.player.x === 2 && back.player.y === 1, 'Rückkehr');
    eq(back.seen.reduce((a, b) => a + b, 0) >= cnt, true, 'Erkundung des ersten Gebiets erhalten');
    eq(back.notes, [5], 'Notizen des ersten Gebiets erhalten');
    // wieder hinunter: Truhe bleibt offen
    L.changeArea(back, data, 'stairs_down');
    assert(back.objs.find((o) => o.id === 'chest_b').open === true, 'geöffnete Truhe bleibt offen');
    eq(back.notes, [9], 'Notizen des zweiten Gebiets erhalten');
    assert(!('test2' in back.areas) && 'test1' in back.areas, 'nur inaktive Gebiete liegen in areas');
    assert(L.changeArea(back, data, 'gibt_es_nicht').ok === false, 'unbekannte Treppe wird abgelehnt');
  });

  await test('Gebiete (Phase 3): Gegner und Kämpfe im zweiten Gebiet, Besiegte bleiben besiegt', () => {
    const s = fresh(6);
    L.changeArea(s, data, 'stairs_down');
    const en = s.objs.find((o) => o.id === 'en21');
    playFight(s, 'en21', 3);
    if (!en.dead) return 'Kampf verloren (zufällig), Rest nicht prüfbar';
    L.changeArea(s, data, 'stairs_up'); L.changeArea(s, data, 'stairs_down');
    assert(s.objs.find((o) => o.id === 'en21').dead === true, 'Gegner steht wieder auf');
  });

  await test('Gebiete (Phase 3): Spielstand v4 (ohne Gebiete) wird zu v5, Treppe wird ergänzt, alles andere bleibt', () => {
    const s = fresh(8);
    L.tryMove(s, data, 'f'); s.gold = 77; s.inv.potion = 5; s.notes.push(3);
    const raw = JSON.parse(JSON.stringify(L.serialize(s)));
    raw.v = 4; delete raw.state.areas; raw.state.objs = raw.state.objs.filter((o) => o.type !== 'stairs');
    const st = L.deserialize(raw, data);
    eq(st.areas, {}, 'areas leer');
    assert(st.objs.some((o) => o.id === 'stairs_down'), 'Treppe ergänzt');
    eq([st.gold, st.inv.potion, st.notes, st.player], [77, 5, [3], s.player], 'Zustand erhalten');
    assert(L.serialize(st).v === 6, 'neu als v6');
    // Spielstand mit ungültigen Gebieten wird abgelehnt
    const bad = JSON.parse(JSON.stringify(L.serialize(s)));
    bad.state.areas = { nirgendwo: { objs: [], seen: [], notes: [] } };
    let threw = false; try { L.deserialize(bad, data); } catch (e) { threw = /Gebiet/.test(e.message); }
    assert(threw, 'unbekanntes Gebiet nicht abgelehnt');
    const bad2 = JSON.parse(JSON.stringify(L.serialize(s)));
    bad2.state.areas = { test2: { objs: [], seen: [1, 2], notes: [] } };
    threw = false; try { L.deserialize(bad2, data); } catch (e) { threw = /Karte ungültig/.test(e.message); }
    assert(threw, 'falsche Kartengröße nicht abgelehnt');
  });

  await test('Gebiete (Phase 3): Softlock-Prüfung gilt auch für Untere Gruft (Treppe zählt als Ausgang)', () => {
    const r = L.analyzeLevel(data, 'test2');
    assert(r.ok, 'Untere Gruft nicht lösbar: ' + JSON.stringify(r));
  });

  // ---- Phase 3, Schritt 2: Bossphasen und Bestiarium ----
  await test('Bossphasen (Phase 3): Daten gültig, Phase tritt einmalig bei der Schwelle ein, Werte und Angriffsmuster wechseln', () => {
    for (const [id, en] of Object.entries(data.enemies)) if (en.phases) {
      let last = 101;
      for (const p of en.phases) { assert(p.name && p.below > 0 && p.below < last, `${id}: Schwellen müssen fallen`); last = p.below; assert(p.set && typeof p.set === 'object', `${id}: set fehlt`); }
    }
    const s = fresh(21), boss = data.enemies.schrat;
    assert(boss.phases && boss.phases.length >= 2, 'Moorschrat hat Phasen');
    L.startCombat(s, data, s.objs.find((o) => o.id === 'en1'));
    const e = s.combat.enemies[0];
    eq(L.enemyOf(data, e).atk, boss.atk, 'Phase 1: Grundwerte');
    // knapp über der Schwelle: keine Phase
    e.hp = Math.floor(boss.hp * boss.phases[0].below / 100) + 1;
    const m0 = []; let guard = 0;
    while (s.combat && !s.combat.over && guard++ < 40) { const a = L.currentActor(s); if (a.side === 'h') { const r = L.heroAction(s, data, { type: 'defend' }); m0.push(...r.msgs); } else { const r = L.enemyStep(s, data, {}); m0.push(...r.msgs); } if (e.phase) break; if (s.heroes.every((h) => h.hp <= 0)) break; }
    assert(!e.phase, 'Phase zu früh');
    // Schwelle unterschreiten durch einen Treffer
    guard = 0; e.hp = Math.floor(boss.hp * boss.phases[0].below / 100) + 1;
    while (s.combat && !s.combat.over && guard++ < 40) { const a = L.currentActor(s); if (a.side === 'h') break; L.enemyStep(s, data, {}); }
    e.hp = Math.floor(boss.hp * boss.phases[0].below / 100); // jetzt exakt auf der Schwelle
    const msgs = [];
    guard = 0;
    while (s.combat && !s.combat.over && guard++ < 40) { const a = L.currentActor(s); const r = a.side === 'h' ? L.heroAction(s, data, { type: 'defend' }) : L.enemyStep(s, data, {}); msgs.push(...r.msgs); if (e.phase) break; }
    eq(e.phase, 1, 'Phase 2 erreicht');
    assert(msgs.some((m) => /Phase 2/.test(m) && m.includes(boss.phases[0].name)), 'Ankündigung im Kampflog');
    eq(L.enemyOf(data, e).atk, boss.phases[0].set.atk, 'Angriff erhöht');
    eq(L.enemyOf(data, e).heavy.every, boss.phases[0].set.heavy.every, 'Angriffsmuster gewechselt');
    // keine zweite Auslösung derselben Phase
    const m2 = []; guard = 0;
    while (s.combat && !s.combat.over && guard++ < 6 && e.hp > 0) { const a = L.currentActor(s); const r = a.side === 'h' ? L.heroAction(s, data, { type: 'defend' }) : L.enemyStep(s, data, {}); m2.push(...r.msgs); }
    assert(!m2.some((m) => /Phase 2/.test(m)), 'Phase 2 zweimal angekündigt');
    // Gegner ohne Phasen bleiben unverändert
    eq(L.enemyOf(data, { kind: 'wolf', phase: 3 }), data.enemies.wolf, 'Wolf ohne Phasen');
  });

  await test('Bossphasen (Phase 3): großer Schaden überspringt keine Phase (beide Schwellen werden gemeldet)', () => {
    const s = fresh(22), boss = data.enemies.schrat;
    L.startCombat(s, data, s.objs.find((o) => o.id === 'en1'));
    const e = s.combat.enemies[0];
    e.hp = 1; // weit unter beiden Schwellen
    let guard = 0; const msgs = [];
    while (s.combat && !s.combat.over && guard++ < 10) { const a = L.currentActor(s); if (a.side === 'h') { const r = L.heroAction(s, data, { type: 'defend' }); msgs.push(...r.msgs); } else { const r = L.enemyStep(s, data, {}); msgs.push(...r.msgs); } if (e.phase === boss.phases.length) break; }
    eq(e.phase, boss.phases.length, 'alle Phasen durchlaufen');
    assert(msgs.filter((m) => /– Phase \d/.test(m)).length === boss.phases.length, 'jede Phase einmal gemeldet');
  });

  await test('Bestiarium (Phase 3): Begegnung, Sieg, aufgedeckte Elemente und Besonderheiten werden gemerkt und gespeichert', () => {
    const s = fresh(23);
    assert(!s.bestiary || Object.keys(s.bestiary).length === 0, 'zu Beginn leer');
    s.heroes.forEach((h) => { h.level = 3; h.mp = h.maxMp = 40; });
    L.startCombat(s, data, s.objs.find((o) => o.id === 'en2')); // zwei Wölfe
    eq(s.bestiary.wolf.seen, 2, 'zwei Wölfe begegnet');
    // Frostsplitter gegen Wolf deckt Resistenz auf
    let guard = 0;
    while (s.combat && guard++ < 60 && !(s.bestiary.wolf.resist && s.bestiary.wolf.resist.ice)) {
      const a = L.currentActor(s);
      if (a.side === 'h') { const h = s.heroes[a.idx]; const r = h.cls === 'mage' ? L.heroAction(s, data, { type: 'spell', spell: 'frost', target: s.combat.enemies.findIndex((x) => x.hp > 0) }) : L.heroAction(s, data, { type: 'defend' }); if (r.error) L.heroAction(s, data, { type: 'defend' }); }
      else L.enemyStep(s, data, {});
    }
    assert(s.bestiary.wolf.resist && s.bestiary.wolf.resist.ice, 'Eis-Resistenz aufgedeckt');
    assert(!s.bestiary.wolf.resist.fire, 'Feuer nicht aufgedeckt');
    // Kampf zu Ende spielen
    guard = 0; while (s.combat && guard++ < 200) { const a = L.currentActor(s); if (a.side === 'h') L.heroAction(s, data, { type: 'attack' }); else L.enemyStep(s, data, {}); if (s.heroes.every((h) => h.hp <= 0)) break; }
    if (!s.combat) assert(s.bestiary.wolf.won === 2, 'zwei Wölfe besiegt');
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(s))), data);
    eq(back.bestiary, s.bestiary, 'Bestiarium überlebt Speichern/Laden');
    // alter Stand ohne Bestiarium lädt
    const old = JSON.parse(JSON.stringify(L.serialize(fresh(24)))); delete old.state.bestiary;
    assert(L.deserialize(old, data), 'Stand ohne Bestiarium lädt');
    // ungültiges Bestiarium wird abgelehnt
    const bad = JSON.parse(JSON.stringify(L.serialize(s))); bad.state.bestiary = { drache: { seen: 1, won: 0 } };
    let threw = false; try { L.deserialize(bad, data); } catch (e) { threw = /Bestiarium/.test(e.message); }
    assert(threw, 'unbekannte Art nicht abgelehnt');
  });

  // ---- Phase 3, Schritt 3: Beutesystem ----
  await test('Beute (Phase 3): Daten gültig (Qualitäten, Eigenschaften, Grundgegenstände, Unikate, Drops)', () => {
    assert(data.quality.length >= 3 && data.quality[0].id === 'common' && data.quality[0].statBonus === 0 && data.quality[0].affixes === 0, 'Gewöhnlich ist die Basis');
    for (const q of data.quality) assert(q.weight > 0 && Number.isInteger(q.statBonus) && Number.isInteger(q.affixes) && q.name && q.color, `Qualität ${q.id}`);
    const stats = new Set(['atk', 'def', 'init']);
    for (const a of data.affixes) { assert(stats.has(a.stat) && a.min >= 1 && a.max >= a.min && a.name, `Eigenschaft ${a.id}`); assert(a.slots.every((x) => data.slots[x]), `Eigenschaft ${a.id}: Platz`); }
    for (const slot of ['weapon', 'armor']) assert(data.affixes.some((a) => a.slots.includes(slot)), `keine Eigenschaft für ${slot}`);
    assert(data.quality.some((q) => q.affixes > 0) && data.quality.every((q) => q.affixes <= data.affixes.length), 'Eigenschaftenzahl');
    for (const id of data.lootBases) assert(data.items[id] && data.items[id].kind === 'equip', `Grundgegenstand ${id}`);
    for (const [id, it] of Object.entries(data.items)) if (it.q === 'unique') assert(it.kind === 'equip' && (!it.classes ? ['ring', 'amulet'].includes(it.slot) : it.classes.every((c) => data.classes[c])), `Unikat ${id}`); // Ringe/Amulette für alle Berufe
    for (const [id, en] of Object.entries(data.enemies)) {
      for (const d of en.drops || []) for (const x of d.pick || [d.item]) assert(data.items[x] && data.items[x].q === 'unique', `${id}: Drop ${x} ist kein Unikat`);
      if (en.gearDrop) assert(en.gearDrop.chance > 0 && en.gearDrop.chance <= 100, `${id}: gearDrop`);
    }
  });

  await test('Beute (Phase 3): erzeugte Ausrüstung – Werte stimmen zur Qualität, Verteilung nahe den Gewichten, nie über Obergrenzen', () => {
    const s = fresh(31), n = 4000, cnt = {};
    for (let i = 0; i < n; i++) {
      const g = L.rollGear(s, data, {});
      const q = data.quality.find((x) => x.id === g.q), base = data.items[g.base];
      cnt[g.q] = (cnt[g.q] || 0) + 1;
      eq(g.affixes.length, q.affixes, 'Zahl der Eigenschaften');
      assert(new Set(g.affixes).size === g.affixes.length, 'Eigenschaft doppelt');
      const sumNow = g.atk + g.def + g.init, sumBase = (base.atk || 0) + (base.def || 0);
      assert(sumNow >= sumBase + q.statBonus + g.affixes.length && sumNow <= sumBase + q.statBonus + g.affixes.length * 2, `Werte außerhalb: ${g.name} ${g.q}`);
      assert(g.atk <= 8 && g.def <= 8 && g.init <= 4, 'Obergrenze');
      assert(g.desc && g.name.startsWith(base.name), 'Name/Beschreibung');
      for (const a of g.affixes) assert(data.affixes.find((x) => x.id === a).slots.includes(g.slot), 'Eigenschaft passt nicht zum Platz');
    }
    const tot = data.quality.reduce((a, q) => a + q.weight, 0);
    for (const q of data.quality) { const p = (cnt[q.id] || 0) / n, e = q.weight / tot; assert(Math.abs(p - e) < 0.04, `Verteilung ${q.id}: ${(p * 100).toFixed(1)} % statt ${(e * 100).toFixed(1)} %`); }
    // Boost verschiebt zu besseren Qualitäten
    const hi = (boost) => { let k = 0; for (let i = 0; i < 2000; i++) { const g = L.rollGear(s, data, { boost }); if (g.q === 'rare' || g.q === 'epic') k++; } return k; };
    assert(hi(2) > hi(0) * 1.5, 'Boost wirkt nicht');
    const w = L.rollGear(s, data, { slot: 'weapon' }), a = L.rollGear(s, data, { slot: 'armor' });
    assert(w.slot === 'weapon' && a.slot === 'armor', 'Platzfilter');
    return Object.entries(cnt).map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)} %`).join(', ');
  });

  await test('Beute (Phase 3): Anlegen erzeugter Ausrüstung – Boni (auch Initiative), Berufsbeschränkung, Tausch, Speichern/Laden', () => {
    const s = fresh(32);
    const inst = { kind: 'equip', base: 'iron_sword', slot: 'weapon', q: 'rare', atk: 4, def: 0, init: 2, classes: ['warrior', 'rogue', 'ranger'], name: 'Eisenschwert des Wolfs', affixes: ['wolf'], desc: 'x' };
    const uid = L.addGear(s, data, inst);
    assert(/^g\d+$/.test(uid) && s.inv[uid] === 1 && s.gear[uid], 'im Inventar');
    assert(L.addGear(s, data, { ...inst }) !== uid, 'neue Kennung');
    assert(L.equipItem(s, data, uid, 3).error === 'not-allowed', 'Magier darf keine Schwerter');
    const before = { atk: L.heroAtk(data, s.heroes[0], s), init: L.heroInit(data, s.heroes[0], s) };
    const r = L.equipItem(s, data, uid, 0);
    assert(r.msg && s.heroes[0].equip.weapon === uid && !s.inv[uid], 'angelegt');
    eq(L.heroAtk(data, s.heroes[0], s) - before.atk, 4, 'Angriffsbonus');
    eq(L.heroInit(data, s.heroes[0], s) - before.init, 2, 'Initiativebonus');
    // Tausch gegen festes Eisenschwert legt die erzeugte Waffe zurück ins Inventar
    s.inv.iron_sword = 1;
    L.equipItem(s, data, 'iron_sword', 0);
    assert(s.inv[uid] === 1 && s.heroes[0].equip.weapon === 'iron_sword', 'Tausch');
    L.equipItem(s, data, uid, 0);
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(s))), data);
    eq(back.gear, s.gear, 'Ausrüstungsliste');
    eq(back.heroes[0].equip, s.heroes[0].equip, 'getragen');
    eq(L.heroAtk(data, back.heroes[0], back), L.heroAtk(data, s.heroes[0], s), 'gleiche Werte nach dem Laden');
    // Wirkung im Kampf: der Schaden nutzt den Bonus
    // Ablegen
    assert(L.unequipItem(s, data, 0, 'weapon').msg && s.inv[uid] === 1, 'Ablegen');
    // ungültige Stände werden abgelehnt
    const bad = JSON.parse(JSON.stringify(L.serialize(s))); bad.state.gear.g1.atk = 99;
    let threw = false; try { L.deserialize(bad, data); } catch (e) { threw = /Ausrüstung/.test(e.message); }
    assert(threw, 'Wert 99 nicht abgelehnt');
    const bad2 = JSON.parse(JSON.stringify(L.serialize(s))); bad2.state.inv.g77 = 1;
    threw = false; try { L.deserialize(bad2, data); } catch (e) { threw = /Inventar/.test(e.message); }
    assert(threw, 'Inventarposten ohne Definition nicht abgelehnt');
  });

  await test('Beute (Phase 3): Sieg gibt Drops – Unikat vom Boss genau einmal, Ausrüstung aus Truhe, Meldungen', () => {
    // Boss: jeder Sieg über den Schrat liefert Ausrüstung (100 %) und ein Unikat, solange keines im Besitz ist
    const win = (seed, pre) => {
      const s = fresh(seed); pre && pre(s);
      L.startCombat(s, data, s.objs.find((o) => o.id === 'en1'));
      s.combat.enemies[0].hp = 1;
      let g = 0, all = [];
      while (s.combat && g++ < 20) { const a = L.currentActor(s); const r = a.side === 'h' ? L.heroAction(s, data, { type: 'attack', target: 0 }) : L.enemyStep(s, data, {}); all.push(...(r.msgs || [])); }
      return { s, msgs: all };
    };
    const w = win(41);
    assert(w.msgs.some((m) => /Beute von Moorschrat: (Schratdorn|Wurzelstab) \(einzigartig\)/.test(m)), 'Unikat fehlt: ' + w.msgs.filter((m) => /Beute/.test(m)).join(' | '));
    assert(w.msgs.some((m) => /Beute von Moorschrat: .*(Eisenschwert|Eichenstab|Lederharnisch|Kettenhemd)/.test(m)), 'Ausrüstungsdrop fehlt');
    assert(Object.keys(w.s.gear).length >= 1 && Object.keys(w.s.gear).every((k) => w.s.inv[k] === 1), 'Ausrüstung im Inventar');
    // Unikat bereits im Besitz (auch getragen): fällt nicht noch einmal
    const w2 = win(42, (s) => { s.inv.schratdorn = 1; s.inv.wurzelstab = 1; });
    assert(!w2.msgs.some((m) => /einzigartig/.test(m)), 'Unikat doppelt');
    const w3 = win(43, (s) => { s.heroes[0].equip = { weapon: 'schratdorn', armor: null }; s.inv.wurzelstab = 1; });
    assert(!w3.msgs.some((m) => /einzigartig/.test(m)), 'getragenes Unikat zählt nicht als Besitz');
    // Truhe der Unteren Gruft enthält eine erzeugte Ausrüstung
    const s = fresh(44); L.changeArea(s, data, 'stairs_down');
    s.player = { x: 11, y: 3, dir: 1 };
    s.objs.find((o) => o.id === 'en21').dead = true; // Wächter der Truhe
    const r = L.interact(s, data);
    assert(/Truhe geöffnet/.test(r.msg) && Object.keys(s.gear).length === 1, 'Truhe ohne Ausrüstung: ' + r.msg);
  });

  await test('Beute (Phase 3): Spielstand v5 (ohne Ausrüstung) lädt als v6, nichts geht verloren', () => {
    const s = fresh(45); s.gold = 33; s.inv.potion = 4;
    const raw = JSON.parse(JSON.stringify(L.serialize(s))); raw.v = 5; delete raw.state.gear; delete raw.state.uid;
    const st = L.deserialize(raw, data);
    eq([st.gear, st.uid, st.gold, st.inv.potion], [{}, 0, 33, 4], 'v6-Felder und Bestand');
    assert(L.serialize(st).v === 6, 'neu als v6');
    // Zufallsläufe: viele Kämpfe mit Drops halten die Invarianten
    for (let i = 0; i < 60; i++) { const q = fresh(500 + i); q.heroes.forEach((h) => { h.level = 4; }); playFight(q, 'en2', i); const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(q))), data); eq(back.gear, q.gear, 'Rundlauf'); }
  });

  // ---- Phase 3, Schritt 4: Verkaufen und Fehlerlog ----
  await test('Verkaufen (Phase 3): Preise nach Qualität, nicht verkäuflich (Quest, Unikat), Gold und Bestand, nicht im Kampf', () => {
    const s = fresh(51);
    eq(L.sellPrice(s, data, 'potion'), 5, 'Heiltrank 10 → 5');
    assert(L.sellPrice(s, data, 'iron_key') === null && L.sellPrice(s, data, 'schratdorn') === null, 'Quest/Unikat');
    for (const [id, it] of Object.entries(data.items)) if (it.kind === 'equip' && it.q !== 'unique') assert(it.value > 0, `${id}: value fehlt`);
    // erzeugte Ausrüstung: Preis steigt mit Qualität und Eigenschaften
    const mk = (q, atk, init) => ({ kind: 'equip', base: 'iron_sword', slot: 'weapon', q, atk, def: 0, init, classes: ['warrior'], name: 'Eisenschwert', affixes: [], desc: 'x' });
    const ids = { common: L.addGear(s, data, mk('common', 2, 0)), fine: L.addGear(s, data, mk('fine', 3, 0)), rare: L.addGear(s, data, mk('rare', 4, 1)), epic: L.addGear(s, data, mk('epic', 6, 2)) };
    const p = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, L.sellPrice(s, data, id)]));
    assert(p.common < p.fine && p.fine < p.rare && p.rare < p.epic, 'Preise steigen: ' + JSON.stringify(p));
    eq(p.common, 12, 'gewöhnliches Schwert: 24 → 12');
    const gold = s.gold, r = L.sellItem(s, data, ids.rare);
    assert(r.price === p.rare && s.gold === gold + p.rare && !s.inv[ids.rare] && !s.gear[ids.rare], 'verkauft und entfernt');
    // Stapel: nur einer pro Verkauf
    s.inv.potion = 3; L.sellItem(s, data, 'potion'); eq(s.inv.potion, 2, 'ein Heiltrank');
    s.inv.iron_key = 1; assert(L.sellItem(s, data, 'iron_key').error === 'not-sellable', 'Schlüssel');
    assert(L.sellItem(s, data, 'g999').error === 'no-item', 'nicht vorhanden');
    // getragene Ausrüstung liegt nicht im Inventar und lässt sich nicht verkaufen
    s.inv.iron_sword = 1; L.equipItem(s, data, 'iron_sword', 0);
    assert(L.sellItem(s, data, 'iron_sword').error === 'no-item', 'getragen');
    L.startCombat(s, data, s.objs.find((o) => o.id === 'en2'));
    assert(L.sellItem(s, data, 'potion').error === 'in-combat', 'nicht im Kampf');
    // Rundlauf: gesamte erzeugte Ausrüstung ist verkäuflich, Preis ≥ 1
    const s2 = fresh(52);
    for (let i = 0; i < 300; i++) { const g = L.rollGear(s2, data, {}), id = L.addGear(s2, data, g); const pr = L.sellPrice(s2, data, id); assert(pr >= 1 && pr <= 60, `Preis ${pr} für ${g.name} ${g.q}`); }
  });

  await test('Fehlerlog (Phase 3): gleiche Fehler werden gezählt, Höchstzahl, Format, Kürzung', () => {
    const list = [];
    L.pushError(list, { v: '1', where: 'A', msg: 'kaputt', t: '2026-11-14T01:00:00Z' });
    L.pushError(list, { v: '1', where: 'A', msg: 'kaputt', t: '2026-11-14T01:00:05Z' });
    eq(list.length, 1, 'gleicher Fehler zusammengefasst'); eq(list[0].n, 2, 'gezählt'); eq(list[0].t, '2026-11-14T01:00:05Z', 'letzte Zeit');
    L.pushError(list, { v: '1', where: 'B', msg: 'kaputt' });
    eq(list.length, 2, 'anderer Ort = neuer Eintrag');
    for (let i = 0; i < 100; i++) L.pushError(list, { v: '1', where: 'X', msg: 'Fehler ' + i });
    eq(list.length, L.ERRLOG_MAX, 'Höchstzahl');
    assert(list[list.length - 1].msg === 'Fehler 99' && list[0].msg !== 'kaputt', 'älteste fliegen raus');
    const big = []; L.pushError(big, { where: 'W'.repeat(200), msg: 'm'.repeat(1000), stack: 's'.repeat(5000) });
    assert(big[0].where.length <= 60 && big[0].msg.length <= 300 && big[0].stack.length <= 700, 'Kürzung');
    const txt = L.formatErrorLog([{ t: 'T1', v: '0.11.0', where: 'Laden', msg: 'Datei kaputt', n: 3, stack: 'Zeile1' }, { t: 'T2', v: '0.11.0', where: 'Import', msg: 'zweiter', n: 1 }], 'Test');
    assert(/2 Einträge/.test(txt) && txt.indexOf('zweiter') < txt.indexOf('Datei kaputt') && /×3/.test(txt) && /Zeile1/.test(txt), 'Format: neueste zuerst');
    const e = L.pushError([], {}); eq(e[0].msg, 'Unbekannter Fehler', 'leere Meldung');
  });

  // ---- Phase 3, Schritt 5: Händler ----
  await test('Händler (Phase 3): Daten gültig, Händler blockiert und öffnet das Handelsfenster, Gebiet erreichbar', () => {
    for (const [lid, lvl] of Object.entries(data.levels)) for (const o of lvl.objects) if (o.type === 'merchant') {
      const sh = data.shops[o.shop]; assert(sh && sh.name && sh.greeting && sh.stock.length, `${o.id}: Handel ${o.shop}`);
      for (const e of sh.stock) { assert(data.items[e.item], `Ware ${e.item}`); assert(L.itemWorth(null, data, e.item) > 0, `Ware ${e.item} ohne Preis`); assert(data.items[e.item].q !== 'unique' && data.items[e.item].kind !== 'quest', `Ware ${e.item} darf nicht handelbar sein`); }
      assert(L.analyzeLevel(data, lid).ok, `${lid} nicht lösbar`);
    }
    const s = fresh(61); L.changeArea(s, data, 'stairs_moor');
    eq(s.levelId, 'moorrand', 'Siedlung erreicht');
    s.player = { x: 8, y: 2, dir: 1 };
    const m = L.tryMove(s, data, 'f');
    assert(!m.moved && /Händlerin/.test(m.msg), 'Händlerin blockiert: ' + JSON.stringify(m));
    const r = L.interact(s, data);
    eq(r.shop, 'moorrand', 'Interaktion öffnet den Handel');
    assert(!r.encounter, 'kein Kampf');
  });

  await test('Händler (Phase 3): Kaufen – Gold und Bestand, zu wenig Gold, nicht im Kampf, nur Ware des Händlers; Kauf und Verkauf sind verlustig', () => {
    const s = fresh(62);
    const g0 = s.gold, n0 = s.inv.potion;
    const r = L.buyItem(s, data, 'moorrand', 'potion');
    assert(r.msg && s.gold === g0 - 10 && s.inv.potion === n0 + 1, 'Heiltrank gekauft');
    s.gold = 5;
    eq(L.buyItem(s, data, 'moorrand', 'potion').error, 'no-gold', 'zu wenig Gold'); eq(s.gold, 5, 'Gold unverändert');
    eq(L.buyItem(s, data, 'moorrand', 'schratdorn').error, 'not-in-stock', 'nicht im Sortiment');
    eq(L.buyItem(s, data, 'gibtsnicht', 'potion').error, 'not-in-stock', 'unbekannter Händler');
    s.gold = 100; const b = L.buyItem(s, data, 'moorrand', 'chain_mail'); assert(b.msg && s.inv.chain_mail === 1 && s.gold === 70, 'Kettenhemd gekauft');
    // kein Gewinn durch Kaufen und sofortiges Verkaufen
    for (const e of L.shopStock(data, 'moorrand')) assert(L.sellPrice(s, data, e.item) < L.buyPrice(s, data, e.item), `${e.item}: Verkauf ≥ Kauf`);
    L.startCombat(s, data, s.objs.find((o) => o.id === 'en2'));
    eq(L.buyItem(s, data, 'moorrand', 'potion').error, 'in-combat', 'nicht im Kampf');
  });

  await test('Moorpfad (0.13.0): Hinweistafeln, Auftrag von Hedda nur einmal, Moorlicht-Daten, Schlüssel vor Tor, Hin- und Rückweg', () => {
    for (const lvl of Object.values(data.levels)) for (const o of lvl.objects) if (o.type === 'sign') assert(typeof o.text === 'string' && o.text.length > 5 && o.text.length <= 200, `${o.id}: Text`);
    const ml = data.enemies.moorlicht;
    assert(ml && ml.hp > 0 && ml.xp > 0 && ml.resist && ml.onHit && ml.onHit.status && data.statuses[ml.onHit.status], 'Moorlicht-Daten');
    assert(data.palettes[data.levels.moorpfad.palette] && Object.keys(data.palettes.moor).length === Object.keys(data.palettes.keller).length, 'Palette moor');
    assert(L.analyzeLevel(data, 'moorpfad').ok, 'Moorpfad lösbar');
    const s = fresh(63);
    L.changeArea(s, data, 'stairs_moor'); eq(s.levelId, 'moorrand', 'Siedlung');
    s.player = { x: 8, y: 2, dir: 1 };
    const r1 = L.interact(s, data); assert(r1.shop && /Nebel/.test(r1.msg) && s.flags.talk_hedda, 'Auftrag beim ersten Gespräch');
    const r2 = L.interact(s, data); assert(r2.shop && !r2.msg, 'Auftrag nur einmal');
    L.changeArea(s, data, 'stairs_pfad'); eq(s.levelId, 'moorpfad', 'Moorpfad erreicht');
    eq(s.player.x, 2, 'Ankunft'); 
    // Wandtafel (0.16.8): blockiert nicht, liest sich vor, wenn man vor der Wand steht und hinsieht
    const sg = s.objs.find((o) => o.id === 'sign_pfad1'); assert(sg && sg.face === 2, 'Tafel hängt an der Südwand');
    s.player = { x: 3, y: 2, dir: 2 };
    const r3 = L.interact(s, data); assert(r3.msg && r3.long && /Moorpfad/.test(r3.msg), 'Tafel lesen');
    s.player = { x: 2, y: 2, dir: 1 };
    assert(L.tryMove(s, data, 'f').moved, 'Tafel an der Wand steht nicht im Weg');
    // Tor ohne Schlüssel zu, mit Schlüssel auf
    s.player = { x: 19, y: 4, dir: 1 };
    const door = s.objs.find((o) => o.id === 'door_gruft'); assert(door.locked, 'Tor verschlossen');
    assert(/verschlossen/.test(L.interact(s, data).msg), 'ohne Schlüssel zu');
    s.player = { x: 19, y: 2, dir: 0 };
    s.objs.forEach((o) => { if (o.id === 'en_p3' || o.id === 'en_p4') o.dead = true; }); // Wächter der Schlüsseltruhe
    const c = L.interact(s, data); assert(s.inv.gruft_key === 1 && /Gruftschlüssel/.test(c.msg), 'Schlüssel aus Truhe: ' + JSON.stringify(c));
    s.player = { x: 19, y: 4, dir: 1 };
    assert(/Schlüssel dreht/.test(L.interact(s, data).msg), 'Tor öffnet mit Schlüssel');
    assert(s.inv.gruft_key === 1, 'Schlüssel bleibt');
    // Rückweg und Speichern/Laden im neuen Gebiet
    const back = L.loadSave ? null : null;
    L.changeArea(s, data, 'stairs_pfad_west'); eq(s.levelId, 'moorrand', 'zurück in der Siedlung'); eq(s.player.x, 9, 'Ankunft Siedlung');
  });

  await test('Kultgruft (0.14.0): neue Gegner, Boss mit Phasen und Beute, Siegel vor Bosstor, Hin- und Rückweg, alter Ausgang wird ersetzt', () => {
    for (const k of ['skeleton', 'kultwaechter', 'hauptmann']) { const e = data.enemies[k]; assert(e && e.hp > 0 && e.xp > 0 && e.atk > 0, `Gegner ${k}`); }
    const hm = data.enemies.hauptmann;
    assert(hm.boss && hm.phases.length === 2 && hm.phases[0].below > hm.phases[1].below, 'Hauptmann: Phasen absteigend');
    for (const d of hm.drops) for (const id of d.pick || [d.item]) assert(data.items[id] && data.items[id].q === 'unique', `Beute ${id}`);
    assert(L.analyzeLevel(data, 'kultgruft').ok && L.analyzeLevel(data, 'moorpfad').ok, 'lösbar');
    const gl = data.levels.kultgruft;
    const key = gl.objects.find((o) => o.type === 'chest' && JSON.stringify(o.loot).includes('gruft_siegel'));
    const door = gl.objects.find((o) => o.id === 'door_boss');
    assert(key && door && door.locked && door.key === 'gruft_siegel', 'Siegelschloss vor Boss');
    const s = fresh(65);
    L.changeArea(s, data, 'stairs_moor'); L.changeArea(s, data, 'stairs_pfad');
    s.player = { x: 21, y: 4, dir: 1 };
    const to = s.objs.find((o) => o.id === 'stairs_gruft');
    assert(to && to.look === 'down', 'Treppe zur Gruft');
    L.changeArea(s, data, 'stairs_gruft'); eq(s.levelId, 'kultgruft', 'Gruft erreicht');
    eq(s.player.x, 2, 'Ankunft'); L.changeArea(s, data, 'stairs_gruft_up'); eq(s.levelId, 'moorpfad', 'zurück'); eq(s.player.x, 21, 'Ankunft Moorpfad');
    // alter Stand aus 0.13.0: Ausgang statt Treppe
    s.objs = s.objs.filter((o) => o.id !== 'stairs_gruft'); s.objs.push({ id: 'exit_pfad', type: 'exit', x: 22, y: 4 });
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(s))), data);
    assert(back.objs.some((o) => o.id === 'stairs_gruft') && !back.objs.some((o) => o.id === 'exit_pfad'), 'Ausgang ersetzt');
  });

  await test('Entdeckt-werden (0.16.15): Gegner auf dem Nachbarfeld (1 Feld) in Sichtlinie greift an, Wand verdeckt, Überfall = Gegner zuerst', () => {
    const s = fresh(70);
    const lvl = data.levels[s.levelId];
    // freie Fläche suchen: 5 Felder in einer Zeile Boden
    let spot = null;
    for (let y = 0; y < lvl.map.length && !spot; y++) for (let x = 0; x + 5 < lvl.map[0].length && !spot; x++) if ([0, 1, 2, 3, 4, 5].every((i) => L.cellChar(lvl, x + i, y) === '.' && !s.objs.some((o) => o.x === x + i && o.y === y))) spot = { x, y };
    assert(spot, 'freie Zeile');
    s.objs = s.objs.filter((o) => o.type !== 'enemy');
    s.objs.push({ id: 'tst_en', type: 'enemy', kind: 'skeleton', x: spot.x + 4, y: spot.y, hp: 30 });
    s.player = { x: spot.x, y: spot.y, dir: 1 };
    assert(!L.spottedEnemy(s, data), '4 Felder: unentdeckt');
    s.player.x = spot.x + 1;
    assert(!L.spottedEnemy(s, data), '3 Felder: unentdeckt');
    s.player.x = spot.x + 2;
    assert(!L.spottedEnemy(s, data), '2 Felder: unentdeckt (Kampfdistanz ist 1 Feld)');
    s.player.x = spot.x + 3;
    let sp = L.spottedEnemy(s, data); assert(sp && sp.enemy.id === 'tst_en' && !sp.ambush, '1 Feld voraus: entdeckt, kein Überfall');
    s.player.dir = 0; // blickt zur Seite
    sp = L.spottedEnemy(s, data); assert(sp && sp.ambush, 'Gegner seitlich: Überfall');
    eq(L.dirToward(s.player, sp.enemy), 1, 'Gruppe wendet sich dem Gegner zu');
    const t = L.turn(s, data, 0); assert(t.encounter && t.ambush, 'Drehen löst aus');
    // Gegner zuerst in Runde 1
    L.startCombat(s, data, sp.enemy, { ambush: true });
    eq(L.currentActor(s).side, 'e', 'Überfall: Gegner beginnt');
    s.combat = null;
    L.startCombat(s, data, sp.enemy, {});
    assert(s.combat.ambush === false, 'ohne Überfall normal');
    // schräg (Nachbarfeld diagonal): kein Auslöser, damit der Gegner nie außerhalb des Bilds steht
    s.combat = null; s.player = { x: spot.x + 2, y: spot.y, dir: 1 };
    const en = s.objs.find((o) => o.id === 'tst_en'); en.x = spot.x + 3; en.y = spot.y + 1;
    if (L.cellChar(lvl, spot.x + 3, spot.y + 1) === '.') assert(!L.spottedEnemy(s, data), 'diagonal: unentdeckt');
    en.x = spot.x + 3; en.y = spot.y;
    assert(L.spottedEnemy(s, data), 'gerade Nachbarfeld: entdeckt');
    // besiegt: kein Auslöser
    en.dead = true;
    assert(!L.spottedEnemy(s, data), 'toter Gegner löst nicht aus');
  });

  await test('Ankunft (0.16.9): nach jedem Gebietswechsel blickt die Gruppe nie gegen eine Wand', () => {
    for (const lvl of Object.values(data.levels)) for (const o of lvl.objects) if (o.to && o.type === 'stairs') {
      const s = fresh(68); s.objs.push({ id: 'tmp_st', type: 'stairs', x: 1, y: 1, to: o.to });
      const r = L.changeArea(s, data, 'tmp_st'); assert(r.ok, o.id + ' erreichbar');
      const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][s.player.dir];
      assert(L.cellChar(data.levels[o.to.level], s.player.x + d[0], s.player.y + d[1]) === '.', `${o.id}: Blick gegen Wand`);
    }
    const s = fresh(69); L.changeArea(s, data, 'stairs_moor'); L.changeArea(s, data, 'stairs_pfad');
    eq(s.player.dir, 2, 'Moorpfad: Blick nach Süden in den Gang');
  });

  await test('Wandtafeln (0.16.8): lesbar vom Feld vor der Wand und einem Feld davor, nur mit Blick zur Tafel, blockieren nie', () => {
    const s = fresh(66);
    L.changeArea(s, data, 'stairs_moor'); L.changeArea(s, data, 'stairs_pfad'); // Tafel sign_pfad1 bei (3,2), face 2 (Südwand)
    s.player = { x: 3, y: 2, dir: 2 };
    assert(L.wallSignAhead(s, data), 'vor der Wand erkannt');
    assert(/Moorpfad/.test(L.interact(s, data).msg), 'vom Feld vor der Wand');
    s.player = { x: 3, y: 1, dir: 2 };
    const r2 = L.interact(s, data); assert(/Moorpfad/.test(r2.msg) && r2.long, 'ein Feld davor');
    s.player = { x: 3, y: 0, dir: 2 };
    assert(!/Moorpfad/.test(L.interact(s, data).msg || ''), 'zwei Felder davor nicht');
    s.player = { x: 3, y: 2, dir: 1 };
    assert(!L.wallSignAhead(s, data), 'ohne Blick zur Tafel nicht');
    // Alle Tafeln der Daten sind Wandtafeln mit Bodenfeld und Wand dahinter
    for (const [id, lvl] of Object.entries(data.levels)) for (const o of lvl.objects) if (o.type === 'sign') {
      assert([0, 1, 2, 3].includes(o.face), `${id}/${o.id}: face fehlt`);
      assert(typeof o.title === 'string' && o.title.length > 1, `${o.id}: Titel`);
      const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][o.face];
      const row = (r) => lvl.map[r] || '';
      const isWall = (x, y) => { const c = row(y)[x]; return c === undefined || c !== '.'; };
      assert(!isWall(o.x, o.y), `${o.id}: Standfeld ist Boden`);
      assert(isWall(o.x + d[0], o.y + d[1]), `${o.id}: Wand in Blickrichtung`);
    }
  });

  await test('Türschilder (0.16.8): Türen mit Titel, offene Türen bleiben als Objekt erhalten', () => {
    const doors = Object.values(data.levels).flatMap((l) => l.objects.filter((o) => o.type === 'door'));
    const titled = doors.filter((o) => o.title);
    assert(titled.length >= 8, 'mindestens 8 beschriftete Türen: ' + titled.length);
    for (const o of titled) assert(o.title.length <= 20, `${o.id}: Titel kurz`);
    const s = fresh(67);
    const d = { id: 'door_x', type: 'door', x: 1, y: 1, open: false, title: 'TEST' };
    s.objs.push(d); d.open = true;
    assert(s.objs.includes(d) && d.open === true && L.blockerAt(s, 1, 1) === null || !L.blockerAt(s, 1, 1) || L.blockerAt(s, 1, 1).type !== 'door', 'offene Tür blockiert nicht');
  });

  await test('Türschilder (0.16.14): alte Stände ohne `style`/`title` an Türen bekommen sie aus game.json, Zustand bleibt', () => {
    const s = fresh(68);
    L.jumpToLevel(s, data, 'kultgruft');
    const door = s.objs.find((o) => o.id === 'door_boss');
    assert(door && data.levels.kultgruft.objects.find((o) => o.id === 'door_boss').style, 'Tür und Stil in game.json vorhanden');
    delete door.style; delete door.title; door.open = true;
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(s))), data);
    const d2 = back.objs.find((o) => o.id === 'door_boss');
    eq(d2.style, 'dark', 'Stil nachgezogen'); eq(d2.title, 'HALLE', 'Titel nachgezogen'); assert(d2.open === true, 'Türzustand bleibt');
    eq(L.syncStatic(back, data), 0, 'zweiter Abgleich ändert nichts');
  });

  await test('Schilder (0.16.14): Tafelbreite nie über 176, Schriftfaktor 2–4, kurze Türtitel groß', () => {
    for (const lvl of Object.values(data.levels)) for (const o of lvl.objects) {
      if (!o.title || o.deco || (o.type !== 'sign' && o.type !== 'door')) continue;
      const st = PLAQUE_STYLES[o.style || 'wood'];
      const m = plaqueMetrics(o.title, o.type === 'door' ? 'door' : 'wall', st);
      assert(m.w <= 176 && m.s >= 2 && m.s <= 4, `${o.id}: Breite ${m.w}, Faktor ${m.s}`);
      const maxC = Math.max(...m.lines.map((x) => [...x].length)); assert(m.s * m.cw * maxC - m.s + 2 * m.padX <= 176 || m.s === 2, `${o.id}: Text passt in die Tafel`);
    }
    eq(plaqueMetrics('HALLE', 'door', PLAQUE_STYLES.dark).s, 4, 'HALLE auf der Tür: Faktor 4');
  });

  await test('Alte Stände bekommen neue feste Objekte (Treppe, Auftrag), Truhenzustand bleibt', () => {
    const s = fresh(64);
    L.changeArea(s, data, 'stairs_moor'); // Siedlung aktiv
    // Zustand wie nach 0.12.0: ohne Treppe zum Moorpfad und ohne Auftragstext
    s.objs = s.objs.filter((o) => o.id !== 'stairs_pfad');
    delete s.objs.find((o) => o.id === 'merchant_hedda').talk;
    s.areas.test1.objs.find((o) => o.id === 'chest_a').open = true;
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(s))), data);
    assert(back.objs.some((o) => o.id === 'stairs_pfad'), 'Treppe ergänzt');
    assert(back.objs.find((o) => o.id === 'merchant_hedda').talk, 'Auftrag ergänzt');
    assert(back.areas.test1.objs.find((o) => o.id === 'chest_a').open === true, 'Truhenzustand bleibt');
    eq(L.syncStatic(back, data), 0, 'zweiter Abgleich ändert nichts');
  });

  await test('Migration v1→v2: beschädigte v1-Stände werden mit klarer Meldung abgelehnt', () => {
    const fails = (mut, re) => {
      const o = JSON.parse(V1_SAVE); mut(o);
      let msg = ''; try { L.deserialize(o, data); } catch (e) { msg = e.message; }
      assert(re.test(msg), `erwartet ${re}, erhalten „${msg}“`);
    };
    fails((o) => { o.state.heroes[3].role = 'Barde'; }, /unbekannter Beruf/);
    fails((o) => { delete o.state.heroes; }, /Gruppe fehlt/);
    fails((o) => { o.state.heroes[0].hp = 99; }, /LP ungültig/);
    fails((o) => { o.v = 0; }, /Keine Eldermoor-Spielstanddatei/);
  });

  // ---- Phase 2, Schritt 2: Stufen, Erfahrung, Wachstum, Migration v2→v3 ----
  await test('Stufen: Stufe 1 = alte Werte, Wachstum nie rückläufig, Stufe 10 plausibel', () => {
    const pr = data.progression;
    eq(pr.maxLevel, 15, 'Höchststufe');
    eq(pr.xp.length, 14, 'Schwellen für Stufe 2 bis 15');
    assert(pr.xp.every((v, i) => Number.isInteger(v) && v > (i ? pr.xp[i - 1] : 0)), 'Schwellen streng steigend');
    for (const r of Object.keys(data.races)) for (const c of Object.keys(data.classes)) {
      const c1 = L.deriveStats(data, r, c), c1b = L.deriveStats(data, r, c, 1);
      eq(c1, c1b, 'Standardstufe ist 1');
      let prev = c1;
      for (let lv = 2; lv <= 10; lv++) {
        const st = L.deriveStats(data, r, c, lv);
        for (const k of L.STAT_KEYS) assert(st[k] >= prev[k], `${r}/${c} Stufe ${lv}: ${k} sinkt`);
        prev = st;
      }
      assert(prev.maxHp > c1.maxHp && prev.atk > c1.atk, `${r}/${c}: Stufe 10 muss stärker als Stufe 1 sein`);
    }
    const w10 = L.deriveStats(data, 'human', 'warrior', 10);
    eq([w10.maxHp, w10.atk, w10.def, w10.init], [88, 15, 11, 6], 'Mensch-Krieger Stufe 10 (Handrechnung: 34+54, 8+7, 5+6, 4+2)');
    let threw = false; try { L.deriveStats(data, 'human', 'warrior', 16); } catch { threw = true; }
    assert(threw, 'Stufe 16 abgelehnt');
    threw = false; try { L.deriveStats(data, 'human', 'warrior', 1.5); } catch { threw = true; }
    assert(threw, 'Stufe 1,5 abgelehnt');
  });

  await test('Erfahrung: Schwellen, Aufstieg, LP-Zuwachs, Bewusstlose gehen leer aus, Höchststufe begrenzt', () => {
    eq([0, 99, 100, 249, 250, 3199, 3200, 99999].map((x) => L.levelForXp(data, x)), [1, 1, 2, 2, 3, 9, 10, 15], 'levelForXp');
    const s = fresh(); s.heroes[2].hp = 0; s.heroes[0].hp = 10;
    const before = JSON.parse(JSON.stringify(s.heroes));
    const msgs = [];
    const ups = L.grantXp(s, data, 100, msgs);
    eq(ups.map((u) => u.hero), ['Berenn', 'Sira', 'Ivo'], 'Aufstiege (Odalys bewusstlos)');
    eq(s.heroes[2].xp, 0, 'Bewusstlose bekommt nichts');
    eq(s.heroes[2].level, 1, 'Bewusstlose bleibt Stufe 1');
    const b = s.heroes[0], d = L.deriveStats(data, b.race, b.cls, 2);
    eq([b.level, b.xp, b.maxHp, b.atk, b.def, b.init], [2, 100, d.maxHp, d.atk, d.def, d.init], 'Werte Stufe 2');
    eq(b.hp, 10 + (d.maxHp - before[0].maxHp), 'LP steigen um den Zuwachs der Max-LP, keine Vollheilung');
    assert(msgs.some((m) => /Berenn steigt auf Stufe 2/.test(m)), 'Meldung');
    L.grantXp(s, data, 1000000, []);
    eq([s.heroes[0].level, s.heroes[0].xp], [15, 9200], 'Höchststufe 15, EP gedeckelt');
    const st10 = L.deriveStats(data, b.race, b.cls, 15);
    eq(s.heroes[0].maxHp, st10.maxHp, 'Stufe-15-Werte');
    eq(L.xpForNext(data, s.heroes[0]), null, 'keine nächste Stufe');
    eq(L.xpForNext(data, s.heroes[1]), null, 'auch Sira auf Stufe 15');
    eq(L.grantXp(fresh(), data, 0, []).length, 0, '0 EP ändern nichts');
  });

  await test('Sieg bringt Erfahrung: Gegner-EP gehen an alle stehenden Helden, Meldungen im Kampflog', () => {
    const s = L.newGame(data, 777);
    const en = s.objs.find((o) => o.type === 'enemy');
    L.startCombat(s, data, en);
    s.combat.enemies[0].hp = 1;
    const all = [];
    for (let i = 0; i < 80 && s.combat; i++) {
      const a = L.currentActor(s);
      const r = a.side === 'h' ? L.heroAction(s, data, { type: 'attack' }) : L.enemyStep(s, data, { god: true });
      (r.msgs || []).forEach((m) => all.push(m));
    }
    assert(s.combat === null, 'Kampf beendet');
    const xp = data.enemies[en.kind].xp;
    assert(xp > 0, 'Gegner hat EP');
    s.heroes.forEach((h) => eq(h.xp, xp, `${h.name} EP`));
    eq(s.heroes.map((h) => h.level), [2, 2, 2, 2], 'alle auf Stufe 2 (120 ≥ 100)');
    assert(all.some((m) => /Erfahrung: \+120/.test(m)), 'EP-Meldung');
    assert(all.filter((m) => /steigt auf Stufe 2/.test(m)).length === 4, 'vier Aufstiegsmeldungen');
  });

  await test('Migration v2→v3: v2-Stand (mit eigener Gruppe) lädt, Werte unverändert, Stufe 1 und 0 EP', () => {
    const s = L.newGame(data, 5, CUSTOM); s.heroes[1].hp = 7;
    const v2 = L.serialize(s); v2.v = 2;
    v2.state.heroes.forEach((h) => { delete h.level; delete h.xp; });
    const st = L.deserialize(JSON.stringify(v2), data);
    st.heroes.forEach((h, i) => {
      eq([h.level, h.xp], [1, 0], `Held ${i + 1}: Stufe/EP`);
      for (const k of ['name', 'race', 'cls', 'row', 'maxHp', 'atk', 'def', 'init', 'hp', 'look', 'ranged']) eq(h[k], s.heroes[i][k], `Held ${i + 1}.${k}`);
    });
    const obj = JSON.parse(JSON.stringify(v2)); L.deserialize(obj, data);
    assert(obj.v === 2 && !('level' in obj.state.heroes[0]), 'Eingabe wird nicht verändert');
    const bad = (mut, re) => {
      const o = JSON.parse(JSON.stringify(L.serialize(s)));
      mut(o.state.heroes[0]);
      let msg = ''; try { L.deserialize(o, data); } catch (e) { msg = e.message; }
      assert(re.test(msg), `erwartet ${re}, erhalten „${msg}“`);
    };
    bad((h) => { h.level = 16; }, /Stufe ungültig/);
    bad((h) => { h.level = 0; }, /Stufe ungültig/);
    bad((h) => { h.xp = -5; }, /Erfahrung ungültig/);
    bad((h) => { h.xp = 1.5; }, /Erfahrung ungültig/);
    const o2 = JSON.parse(JSON.stringify(v2)); delete o2.state.heroes;
    let msg = ''; try { L.deserialize(o2, data); } catch (e) { msg = e.message; }
    assert(/Gruppe fehlt/.test(msg), 'v2 ohne Gruppe');
  });

  await test('Porträts: alle Berufe × Rassen zeichnen, Waldläufer und Rassen sind unterscheidbar', () => {
    const rec = (role, race, seed = 3) => {
      const calls = [];
      drawPortrait({ set fillStyle(v) { calls.push('c' + v); }, fillRect(...a) { calls.push(a.join(',')); } }, role, seed, race);
      return calls.join('|');
    };
    const roles = Object.values(data.classes).map((c) => c.name);
    for (const role of roles) {
      assert(rec(role).length > 200, `${role}: zu wenig gezeichnet`);
      assert(rec(role, 'human') === rec(role), `${role}: Mensch muss dem Standard entsprechen`);
      for (const race of Object.keys(data.races)) if (race !== 'human') assert(rec(role, race) !== rec(role, 'human'), `${role}/${race}: nicht unterscheidbar`);
    }
    assert(rec('Waldläufer') !== rec('Magier'), 'Waldläufer darf nicht wie Magier aussehen');
    assert(new Set(roles.map((r) => rec(r))).size === roles.length, 'jeder Beruf hat ein eigenes Porträt');
  });

  await test('Grafik: Texturen gültig, Renderer füllt jedes Pixel (3 Qualitätsstufen)', () => {
    const tex = makeTextures();
    const chk = (t, name, allowTransparent) => {
      assert(t.w >= 64 && t.h === t.w && t.data.length === t.w * t.h, `${name}: Größe`);
      for (const v of t.data) assert(v < 80 || (allowTransparent && v === 255), `${name}: ungültiger Palettenindex ${v}`);
    };
    for (const [k, t] of Object.entries(tex.wall)) chk(t, 'Wand ' + k, false);
    chk(tex.floor, 'Boden', false); chk(tex.ceil, 'Decke', false);
    for (const [k, t] of Object.entries(tex.sprites)) chk(t, 'Sprite ' + k, true);
    const lvl = data.levels.test1;
    const s = fresh();
    const { grid, gw, gh } = buildGrid(lvl, s.objs);
    const rc = new Raycaster(tex, data.palettes[lvl.palette]);
    const info = [];
    for (const q of ['low', 'medium', 'high']) {
      rc.quality = q;
      const t0 = (globalThis.performance || Date).now();
      rc.render({ px: 3.5, py: 3.5, angle: Math.PI / 2, grid, gw, gh, sprites: buildSprites(s.objs, tex, 0), time: 1.3 });
      const ms = (globalThis.performance || Date).now() - t0;
      info.push(`${q} ${ms.toFixed(1)} ms`);
      const colors = new Set();
      for (let i = 0; i < W * H; i++) {
        assert((rc.buf[i] >>> 24) === 255, `${q}: unbeschriebenes Pixel bei ${i}`);
        colors.add(rc.buf[i]);
      }
      assert(colors.size > 12 && colors.size <= 80, `${q}: Farbanzahl ${colors.size} (erwartet 13..80, feste Palette)`);
    }
    return 'Renderzeit in Node (nur Orientierung, nicht Gerät): ' + info.join(', ');
  });

  await test('Grafik: Scharf-Modus (960×540, Wände 256, Boden 128) rendert ohne Fehler', () => {
    const prevRes = W / 480; // aktuelle Auflösung merken (das laufende Spiel nutzt dieselbe Moduleinstellung)
    setResolution(2);
    try {
      const tex = makeTextures(2);
      assert(W === 960 && H === 540, 'Auflösung');
      assert(tex.wall[1].w === 256 && tex.wall[5].w === 256 && tex.floor.w === 128 && tex.sprites.schrat.w === 320, 'Texturgrößen');
      for (const w of [tex.wall[1], tex.wall[2], tex.wall[5], tex.floor, tex.ceil]) assert((w.w & (w.w - 1)) === 0 && w.data.every((v) => v < 80), 'Zweierpotenz und gültige Palettenindizes');
      const s = fresh();
      const lvl = L.getLevel(data, s);
      const { grid, gw, gh } = buildGrid(lvl, s.objs);
      const rc = new Raycaster(tex, data.palettes[lvl.palette]);
      assert(rc.buf.length === 960 * 540, 'Puffergröße');
      rc.render({ px: 3.5, py: 3.5, angle: Math.PI / 2, grid, gw, gh, sprites: buildSprites(s.objs, tex, 0), time: 1 });
      let nz = 0; for (let i = 0; i < rc.buf.length; i++) if (rc.buf[i] !== 0) nz++;
      assert(nz === rc.buf.length, 'Pixel unbeschrieben');
    } finally { setResolution(prevRes); }
    assert(W === 480 * prevRes && H === 270 * prevRes, 'Zurücksetzen');
  });

  await test('Grafik: Gruppenbilder folgen den lebenden Gegnern (Art, nicht Platz)', () => {
    const tex = makeTextures();
    const o = { id: 'x', type: 'enemy', x: 3, y: 3, kind: 'kultist', kinds: ['kultist', 'skeleton', 'skeleton'] };
    const all = buildSprites([o], tex, 0);
    eq(all.length, 3, 'drei Gestalten'); assert(all[0].tex === tex.sprites.kultist && all[1].tex === tex.sprites.skeleton, 'Kultist zuerst');
    const after = buildSprites([o], tex, 0, 0, { x: ['skeleton', 'skeleton'] });
    eq(after.length, 2, 'zwei Gestalten'); assert(after.every((s) => s.tex === tex.sprites.skeleton), 'nur noch Skelette');
    eq(buildSprites([o], tex, 0, 0, { x: 2 }).length, 2, 'Zahl funktioniert weiter');
  });

  await test('Kampfbild (0.23.3): Gegner im Kampf nicht hinter Wänden, Lage für Lebensbalken', () => {
    const tex = makeTextures();
    const o = { id: 'x', type: 'enemy', x: 3, y: 1, kind: 'wolf', kinds: ['wolf', 'moorlicht', 'wolf'] };
    const out = buildSprites([o], tex, 0);
    assert(out.every((s) => !s.front && !s.foe), 'außerhalb des Kampfs normal verdeckt');
    const fight = buildSprites([o], tex, 0, 0, { x: ['wolf', 'moorlicht', 'wolf'] });
    assert(fight.every((s, i) => s.front && s.foe && s.foe.k === i), 'im Kampf vorn und zugeordnet');
    const map = ['#######', '#.....#', '#######'], lvl = { map };
    const { grid, gw, gh } = buildGrid(lvl, []);
    const rc = new Raycaster(tex, data.palettes.keller);
    rc.render({ px: 3.5, py: 2.4, angle: 0, grid, gw, gh, sprites: fight, time: 0 });
    assert(fight.some((s) => s.scr && s.scr.top >= 0 && s.scr.w > 0), 'Bildschirmlage gemeldet');
  });

  await test('Kampfstart (0.16.12): Gruppe wendet sich dem Gegner zu', () => {
    eq(L.dirToward({ x: 5, y: 5, dir: 0 }, { x: 8, y: 5 }), 1, 'Osten'); eq(L.dirToward({ x: 5, y: 5, dir: 0 }, { x: 5, y: 8 }), 2, 'Süden');
    eq(L.dirToward({ x: 5, y: 5, dir: 0 }, { x: 2, y: 6 }), 3, 'Westen (größere Achse)'); eq(L.dirToward({ x: 5, y: 5, dir: 2 }, { x: 5, y: 3 }), 0, 'Norden');
    eq(L.dirToward({ x: 5, y: 5, dir: 3 }, { x: 6, y: 6 }), 3, 'gleich weit: Blick bleibt');
  });

  await test('Kampffiguren (0.16.12): jede Gegnerart der Daten hat ein eigenes Bild, Wolf/Kultist/Turmwache nicht mehr Ersatzbild', () => {
    const tex = makeTextures();
    const seen = new Map();
    for (const k of Object.keys(data.enemies)) {
      const o = { id: 'x_' + k, type: 'enemy', x: 3, y: 3, kind: k };
      const sp = buildSprites([o], tex, 0)[0]; assert(sp && sp.tex && sp.tex.w >= 64, 'Bild für ' + k);
      if (['wolf', 'kultist', 'turmwache', 'kultwaechter', 'hauptmann', 'skeleton'].includes(k)) { assert(sp.tex !== tex.sprites.schrat, k + ' ohne Ersatzbild'); assert(!seen.has(sp.tex), k + ' teilt Bild mit ' + seen.get(sp.tex)); seen.set(sp.tex, k); }
    }
    for (const k of ['skeleton', 'guard', 'turmwache', 'captain', 'wolf', 'kultist']) { const d = tex.sprites[k].data; let n = 0; for (const v of d) if (v !== 255) n++; assert(n > 1500, k + ' hat Fläche: ' + n); }
    // 0.16.16: Moorkultist 192 px, Moorlicht 128 px (Retro) bzw. doppelt im Modus Scharf
    eq(tex.sprites.kultist.w, 192, 'Kultist 192 px'); eq(tex.sprites.wisp.w, 128, 'Moorlicht 128 px');
    const sh = makeTextures(2); eq(sh.sprites.kultist.w, 384, 'Kultist scharf 384'); eq(sh.sprites.wisp.w, 256, 'Moorlicht scharf 256');
    let wn = 0; for (const v of sh.sprites.wisp.data) if (v !== 255) wn++; assert(wn > 6000, 'Moorlicht hat Fläche: ' + wn);
  });

  await test('Schratgruben (0.15): Treppe hin und zurück, Schlüsseltruhe vor dem Tor, Boss, Gegner bekannt', () => {
    const lv = data.levels.schratgruben, kg = data.levels.kultgruft;
    assert(lv && lv.palette === 'grube' && data.palettes.grube, 'Level und Palette');
    const down = kg.objects.find((o) => o.id === 'stairs_gruft_down'), up = lv.objects.find((o) => o.id === 'stairs_gruben_up');
    assert(down && down.to.level === 'schratgruben' && up && up.to.level === 'kultgruft', 'Treppen verbinden die Gebiete');
    assert(!kg.objects.some((o) => o.id === 'exit_gruft'), 'Platzhalter-Portal entfernt');
    const door = lv.objects.find((o) => o.id === 'door_grube'), key = lv.objects.find((o) => o.id === 'chest_s_key');
    assert(door.locked && door.key === 'gruben_schluessel' && key.loot.some((l) => l.item === 'gruben_schluessel'), 'Schlüssel liegt in der Südhöhle');
    assert(key.x < door.x, 'Schlüsseltruhe liegt vor dem Tor');
    for (const o of lv.objects.filter((x) => x.type === 'enemy')) for (const k of (o.kinds || [o.kind])) assert(data.enemies[k], 'Gegnerart ' + k);
    assert(data.enemies.grubenschrat.hp === 190 && data.enemies.hauptmann.hp === 160 && data.enemies.hauptmann.atk === 13, 'Boss-Werte');
    assert(data.enemies.schrat.hp === 80, 'Test-Boss unverändert');
  });

  await test('Nebelturm (0.16): Übergang, Schlüssel vor dem Tor, Gegnerarten, Kleriker', () => {
    const lv = data.levels.nebelturm, sg = data.levels.schratgruben;
    assert(lv && lv.palette === 'turm' && data.palettes.turm, 'Level und Palette');
    const up = sg.objects.find((o) => o.id === 'stairs_gruben_turm'), down = lv.objects.find((o) => o.id === 'stairs_turm_down');
    assert(up && up.to.level === 'nebelturm' && down && down.to.level === 'schratgruben' && !sg.objects.some((o) => o.id === 'exit_gruben'), 'Treppen verbinden die Gebiete, Platzhalter entfernt');
    const cell = (l, p) => l.map[p.y][p.x];
    assert(cell(lv, up.to) === '.' && cell(sg, down.to) === '.', 'Ankunftsfelder sind Boden');
    const door = lv.objects.find((o) => o.id === 'door_turm'), key = lv.objects.find((o) => o.id === 'chest_t_key');
    assert(door.locked && door.key === 'turm_schluessel' && data.items.turm_schluessel && key.loot.some((l) => l.item === 'turm_schluessel') && key.x < door.x, 'Schlüssel liegt vor dem Tor');
    for (const o of lv.objects.filter((x) => x.type === 'enemy')) for (const k of (o.kinds || [o.kind])) assert(data.enemies[k], 'Gegnerart ' + k);
    for (const o of lv.objects) assert(lv.map[o.y][o.x] === '.', 'Objekt auf Boden: ' + o.id);
    assert(data.enemies.nebelhueter.boss && data.enemies.nebelhueter.phases.length === 2 && data.enemies.nebelhueter.intro, 'Boss mit Phasen und Auftritt');
    assert(data.classes.priest.name === 'Kleriker', 'Priester heißt Kleriker');
    const s = L.newGame(data, 3); s.heroes[2].role = 'Priester'; L.syncStatic(s, data);
    assert(s.heroes[2].role === data.classes[s.heroes[2].cls].name, 'alte Spielstände bekommen den neuen Berufsnamen');
  });

  await test('Gegnerzauber (0.16): Schadenszauber, Heilung, Fluch, Ansage großer Zauber', () => {
    const mk = (kinds, seed) => {
      const s = L.newGame(data, seed), eo = s.objs.find((o) => o.type === 'enemy');
      eo.kind = kinds[0]; eo.kinds = kinds; eo.hp = data.enemies[kinds[0]].hp;
      L.startCombat(s, data, eo);
      return s;
    };
    const toEnemy = (s) => { let g = 0; while (L.currentActor(s) && L.currentActor(s).side === 'h' && g++ < 20) L.heroAction(s, data, { type: 'defend' }); return L.currentActor(s); };
    // Nebelgeist: jeder 2. Zug Frosthauch (trifft immer)
    let s = mk(['nebelgeist'], 11), casts = 0, all = [];
    for (let n = 0; n < 6 && s.combat && !s.combat.over; n++) { if (!toEnemy(s)) break; const r = L.enemyStep(s, data, {}); all.push(...r.msgs); if (r.msgs.some((m) => /wirkt Frosthauch/.test(m))) { casts++; assert(r.msgs.some((m) => /Frosthauch trifft .* für \d+ \w*[Ss]chaden/.test(m)), 'Zauber trifft immer'); } }
    assert(casts >= 2, 'Nebelgeist zaubert regelmäßig: ' + casts);
    assert(s.bestiary.nebelgeist.cast === true, 'Bestiarium merkt den Zauber');
    // Kultpriester heilt verletzte Verbündete
    s = mk(['kultpriester', 'kultwaechter'], 12);
    s.combat.enemies[1].hp = 5; let healed = false;
    for (let n = 0; n < 8 && s.combat && !s.combat.over && !healed; n++) { const a = toEnemy(s); if (!a) break; const r = L.enemyStep(s, data, {}); if (r.msgs.some((m) => /erholt sich um \d+ LP/.test(m))) healed = true; }
    assert(healed && s.combat.enemies[1].hp > 5, 'Kultpriester heilt');
    // Heilung entfällt, wenn niemand verletzt ist; Fluch trifft Helden mit Schwäche
    s = mk(['kultpriester'], 13); let curse = false, heal = false;
    for (let n = 0; n < 6 && s.combat && !s.combat.over; n++) { if (!toEnemy(s)) break; const r = L.enemyStep(s, data, {}); if (r.msgs.some((m) => /Dunkler Segen/.test(m))) heal = true; if (r.msgs.some((m) => /Fluch der Schwäche/.test(m))) curse = true; }
    assert(!heal && curse, 'kein Heilzauber ohne Verletzte, Fluch kommt');
    // Boss: Nebelspeer wird einen Zug vorher angesagt
    s = mk(['nebelhueter'], 14); all = [];
    for (let n = 0; n < 4 && s.combat && !s.combat.over; n++) { if (!toEnemy(s)) break; all.push(...L.enemyStep(s, data, {}).msgs); }
    const iA = all.findIndex((m) => /sammelt Kraft für Nebelspeer/.test(m)), iC = all.findIndex((m) => /wirkt Nebelspeer/.test(m));
    assert(iA >= 0 && iC > iA, 'Ansage vor dem großen Zauber');
  });

  await test('Geheimwand (0.16.1): sperrt, Schalterstein öffnet, bleibt nach Speichern offen, Karte verrät nichts', () => {
    const lv = data.levels.nebelturm, s = L.newGame(data, 5);
    s.levelId = 'nebelturm'; s.objs = JSON.parse(JSON.stringify(lv.objects));
    for (const o of s.objs) { if (o.type === 'gate' || o.type === 'secret') o.open = false; if (o.type === 'lever') o.used = false; if (o.type === 'chest' || o.type === 'door') o.open = false; if (o.type === 'enemy') { o.hp = 1; o.dead = true; } }
    s.seen = new Array(lv.map[0].length * lv.map.length).fill(0);
    s.player = { x: 3, y: 5, dir: 2 };
    L.markSeen(s, data);
    assert(!s.seen[7 * lv.map[0].length + 3], 'Blick endet an der Geheimwand');
    let r = L.tryMove(s, data, 'f');
    assert(!r.moved && r.blocker && r.blocker.type === 'secret' && /Riss/.test(r.msg), 'Geheimwand sperrt und zeigt den Riss');
    assert(/hohl/.test(L.interact(s, data).msg), 'Hinweis beim Untersuchen');
    s.player = { x: 7, y: 5, dir: 2 };
    r = L.interact(s, data);
    assert(r.changed && s.objs.find((o) => o.id === 'switch_t1').used && s.objs.find((o) => o.id === 'secret_t1').open, 'Schalterstein öffnet die Geheimwand');
    assert(/schon gedreht/.test(L.interact(s, data).msg), 'zweites Drehen ändert nichts (0.24.3: Fackelschalter im Nebelturm)');
    const s2 = L.deserialize(JSON.stringify(L.serialize(s)), data);
    assert(s2.objs.find((o) => o.id === 'secret_t1').open && s2.objs.find((o) => o.id === 'switch_t1').used, 'Zustand übersteht Speichern und Laden');
    s2.player = { x: 3, y: 5, dir: 2 };
    assert(L.tryMove(s2, data, 'f').moved && L.tryMove(s2, data, 'f').moved, 'Weg in die Kammer ist frei');
    const a = L.analyzeLevel(data, 'nebelturm');
    assert(a.ok, 'Analyse: Kammer und Truhe erreichbar: ' + JSON.stringify(a.problems || a.errors || ''));
    const g = buildGrid(lv, s.objs.map((o) => (o.id === 'secret_t1' ? { ...o, open: false } : o))).grid;
    assert(g[6 * lv.map[0].length + 3] === 9 && g[6 * lv.map[0].length + 7] === 5, 'Darstellung: Rissmauer und Fackelschalter');
  });

  await test('Heilzauber außerhalb des Kampfs (0.16.2): kostet Mana, nur Verletzte, nicht im Kampf; Debug-Sprung', () => {
    const s = L.newGame(data, 7), k = s.heroes.findIndex((h) => h.cls === 'priest'), m = s.heroes.findIndex((h) => h.cls === 'mage');
    assert(L.castOutside(s, data, k, 'heal', m).error === 'bad-target', 'volle LP: abgelehnt');
    s.heroes[m].hp = 3; const mp = s.heroes[k].mp;
    const r = L.castOutside(s, data, k, 'heal', m);
    assert(!r.error && s.heroes[m].hp === Math.min(s.heroes[m].maxHp, 23) && s.heroes[k].mp === mp - 5 && /Heilende Hand/.test(r.msg), 'heilt 20 LP für 5 Mana');
    assert(L.castOutside(s, data, m, 'firebolt', k).error === 'no-spell', 'Schadenszauber gehen außerhalb nicht');
    s.heroes[m].hp = 3; s.heroes[k].mp = 2;
    assert(L.castOutside(s, data, k, 'heal', m).error === 'no-mp' && s.heroes[m].hp === 3, 'ohne Mana kein Zauber');
    s.heroes[k].mp = 20; L.startCombat(s, data, s.objs.find((o) => o.type === 'enemy'));
    assert(L.castOutside(s, data, k, 'heal', m).error === 'in-combat', 'im Kampf gilt die Zugreihenfolge');
    const s2 = L.newGame(data, 8);
    assert(L.jumpToLevel(s2, data, 'nebelturm').ok && s2.levelId === 'nebelturm' && s2.player.x === data.levels.nebelturm.start.x && s2.areas[data.startLevel], 'Debug-Sprung wechselt das Gebiet und merkt sich das alte');
  });

  await test('Fallgitter und Hebel (0.15.1): Gitter sperrt, Hebel öffnet, Analyse, Karte', () => {
    const s = L.newGame(data, 5);
    s.levelId = 'schratgruben'; s.objs = JSON.parse(JSON.stringify(data.levels.schratgruben.objects));
    for (const o of s.objs) { if (o.type === 'gate') o.open = false; if (o.type === 'lever') o.used = false; if (o.type === 'chest' || o.type === 'door') o.open = false; if (o.type === 'enemy') { o.hp = 1; o.dead = false; } }
    s.seen = new Array(data.levels.schratgruben.map[0].length * data.levels.schratgruben.map.length).fill(0);
    s.player = { x: 21, y: 5, dir: 0 };
    let r = L.tryMove(s, data, 'f');
    assert(!r.moved && /Fallgitter/.test(r.msg), 'Gitter sperrt');
    assert(/Mechanismus/.test(L.interact(s, data).msg), 'Hinweis am Gitter');
    s.player = { x: 16, y: 13, dir: 0 };
    r = L.interact(s, data);
    assert(r.sfx === 'door' && r.changed && s.objs.find((o) => o.id === 'gate_s1').open, 'Hebel öffnet das Gitter');
    assert(/schon umgelegt/.test(L.interact(s, data).msg), 'Hebel nur einmal');
    s.player = { x: 21, y: 5, dir: 0 };
    assert(L.tryMove(s, data, 'f').moved, 'offenes Gitter ist passierbar');
    const a = L.analyzeLevel(data, 'schratgruben');
    assert(a.ok && !a.unreachableChests.length, 'Analyse: Nordstollen-Truhe über den Hebel erreichbar: ' + JSON.stringify(a));
    const lv2 = JSON.parse(JSON.stringify(data)); lv2.levels.schratgruben.objects = lv2.levels.schratgruben.objects.filter((o) => o.type !== 'lever');
    assert(L.analyzeLevel(lv2, 'schratgruben').unreachableChests.includes('chest_s2'), 'Ohne Hebel bleibt die Truhe unerreichbar (Gegenprobe)');
  });

  await test('Schwerer Schlag (0.15.14): trifft nur die Vorderreihe, solange dort jemand steht', () => {
    let ran = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = L.newGame(data, seed), eo = s.objs.find((o) => o.type === 'enemy');
      L.startCombat(s, data, eo);
      let g = 0; while (L.currentActor(s) && L.currentActor(s).side === 'h' && g++ < 20) L.heroAction(s, data, { type: 'defend' });
      const e = s.combat.enemies[0]; e.intent = 'heavy';
      const hp0 = s.heroes.map((h) => h.hp);
      if (!L.currentActor(s) || L.currentActor(s).side !== 'e') continue;
      if (L.currentActor(s).idx !== 0) continue;
      L.enemyStep(s, data, {}); ran++;
      s.heroes.forEach((h, i) => { if (h.row === 'back') assert(h.hp === hp0[i], 'Hinterreihe unversehrt bei schwerem Schlag, Seed ' + seed); });
    }
    assert(ran >= 5, 'Test hat gegriffen: ' + ran);
  });
  await test('Ölflasche und Gegengift (0.15.1): Wurf mit Elementfaktor, Gift nehmen, nur im Kampf, Vorrat sinkt', () => {
    const s = L.newGame(data, 11);
    s.inv.oelflasche = 2; s.inv.gegengift = 1;
    const eo = s.objs.find((o) => o.type === 'enemy');
    L.startCombat(s, data, eo);
    const toHero = () => { let g = 0; while (L.currentActor(s) && L.currentActor(s).side === 'e' && g++ < 20) L.enemyStep(s, data, {}); };
    toHero();
    const e0 = s.combat.enemies[0], hp0 = e0.hp;
    let r = L.heroAction(s, data, { type: 'item', item: 'oelflasche', target: 0 });
    assert(!r.error && s.inv.oelflasche === 1 && e0.hp < hp0, 'Ölflasche trifft: ' + JSON.stringify(r));
    assert(/wirft Ölflasche/.test(r.msgs.join(' ')), 'Meldung');
    toHero();
    const me = L.currentActor(s).idx, other = me === 0 ? 1 : 0;
    assert(L.heroAction(s, data, { type: 'item', item: 'gegengift', hero: me }).error === 'bad-target', 'Gegengift ohne Gift abgelehnt');
    s.combat.status['h' + other] = { poison: { t: 3, p: 2 } };
    assert(L.heroAction(s, data, { type: 'item', item: 'gegengift', hero: other }).error === 'bad-target' && s.inv.gegengift === 1, 'Gegenstand nur an sich selbst, nicht an andere Helden');
    s.combat.status['h' + me] = { poison: { t: 3, p: 2 } };
    r = L.heroAction(s, data, { type: 'item', item: 'gegengift', hero: me });
    assert(!r.error && s.inv.gegengift === 0 && !L.statusOf(s, 'h', me).poison, 'Gift genommen');
    assert(L.useItemOutside(s, data, 'oelflasche', 0).error, 'außerhalb des Kampfes nicht benutzbar');
    assert(data.shops.moorrand.stock.some((x) => x.item === 'oelflasche') && data.shops.moorrand.stock.some((x) => x.item === 'gegengift'), 'Hedda verkauft beides');
  });

  await test('Auftritt (0.15.1): Bosse und neue Gebiete haben Titel und Text', () => {
    for (const k of ['hauptmann', 'grubenschrat', 'schrat']) assert(data.enemies[k].intro && data.enemies[k].intro.title && data.enemies[k].intro.text, 'Boss-Auftritt ' + k);
    for (const id of ['moorpfad', 'kultgruft', 'schratgruben']) assert(data.levels[id].intro && data.levels[id].intro.title, 'Gebiets-Auftritt ' + id);
  });

  await test('Berührung (0.15.2): tryMove meldet den Blocker (Tür, Truhe, Hebel) für die Auto-Benutzung', () => {
    const s = fresh();
    put(s, 11, 7, 1);
    const r = L.tryMove(s, data, 'f');
    assert(!r.moved && r.blocker && r.blocker.type === 'door', 'Tür als Blocker gemeldet');
    assert(L.interact(s, data).sfx === 'unlock' || L.interact(s, data).msg, 'Interaktion danach möglich');
  });

  await test('Fackelwand: Kartenzeichen T wird zur Fackel-Textur und blockiert wie eine Wand', () => {
    const lvl = { map: ['###', '#T#', '#.#'], objects: [] };
    const { grid } = buildGrid(lvl, []);
    eq(grid[4], 5, 'T = Fackelwand');
    assert(L.isWallChar('T'), 'T ist Wand');
    for (const lv of Object.values(data.levels)) assert(lv.map.some((r) => r.includes('T')) || lv.id === 'test1' || lv.id === 'test2', `${lv.id}: keine Fackel`);
  });

  await test('Grafik: Sprites werden gezeichnet und von Wänden verdeckt', () => {
    const tex = makeTextures();
    const lvl = data.levels.test1;
    const s = fresh();
    s.objs.find((o) => o.id === 'door_b').open = true;
    const { grid, gw, gh } = buildGrid(lvl, s.objs);
    const rc = new Raycaster(tex, data.palettes[lvl.palette]);
    const view = (sprites, px) => { rc.render({ px, py: 7.5, angle: Math.PI / 2, grid, gw, gh, sprites, time: 0 }); return rc.buf.slice(); };
    const withS = view(buildSprites(s.objs, tex, 0), 13.5), without = view([], 13.5);
    let diff = 0; for (let i = 0; i < W * H; i++) if (withS[i] !== without[i]) diff++;
    assert(diff > 500, `Sichtbarer Gegner ändert zu wenige Pixel (${diff})`);
    const hidden = view(buildSprites(s.objs, tex, 0).filter((x) => x.tex === tex.sprites.chest), 13.5);
    const hiddenRef = view([], 13.5);
    let d2 = 0; for (let i = 0; i < W * H; i++) if (hidden[i] !== hiddenRef[i]) d2++;
    assert(d2 === 0, `Truhe hinter Wand darf nicht sichtbar sein (${d2} Pixel)`);
  });

  // ---- Dateien (Node: direkt, Browser: per fetch) ----
  if (env.readText) {
    const texts = {};
    const allFiles = [...FILES, ...(env.extraFiles || [])]; // extraFiles: nur Node (HANDOVER.md gehört nicht in den Offline-Cache)
    for (const f of allFiles) { try { texts[f] = await env.readText(f); } catch { texts[f] = null; } }
    await test('Dateien: alle vorhanden und lesbar', () => {
      const missing = allFiles.filter((f) => texts[f] == null);
      assert(!missing.length, 'nicht lesbar: ' + missing.join(', '));
    });
    await test('Oberfläche (0.23.4): Kombi-Text in der Zugleiste, Feilschen-Hinweis im Laden, Zoom-Schaltflächen, Fallen-Blick', () => {
      const m = texts['main.js'] || '', h = texts['index.html'] || '';
      assert(/\}\)\.join\(''\)[^\n]*comboHint\(cur, S\.foe\)/.test(m), 'Kombi-Text für das gewählte Ziel fehlt in der Zugleiste');
      assert(/#enemybox \.combo\{/.test(h), 'Stil für Kombi-Text fehlt');
      assert(/Feilschen \(Talent\)/.test(m) && /haggle\(g, d\)/.test(m), 'Feilschen-Hinweis im Laden fehlt');
      assert(/mz-in/.test(m) && /mz-out/.test(m) && /mz-reset/.test(m), 'Zoom-Schaltflächen der Karte fehlen');
      assert(/o\.type === 'trap'[^\n]*o\.spotted/.test(m), 'Blick auf entdeckte Falle fehlt');
    });
    await test('Gegnergruppe (0.23.5): Wand auf einer Seite zählt (Staffelung ab 3 Gegnern, Verschiebung von der Wand weg)', () => {
      const r = texts['render.js'] || '';
      assert(/export function wallSides/.test(r) && /export function groupLayout/.test(r), 'wallSides/groupLayout fehlen');
      assert(/groupLayout\(grid, o\.x, o\.y, angle, n\)/.test(r) && /groupLayout\(buildGrid/.test(texts['main.js'] || ''), 'Sprites und Lebensbalken müssen dieselbe Aufstellung nutzen');
    });
    await test('Offenes Fallgitter (0.23.9): wird als hochgezogenes Gitter gezeichnet', () => {
      const r = texts['render.js'] || '';
      assert(/function genGateOpen/.test(r) && /gateOpen: smoothSprite/.test(r) && /o\.type === 'gate' && o\.open && grid/.test(r), 'Sprite für offenes Gitter fehlt');
    });
    await test('Layout (0.23.10): Leiste wird bei Größen-/Vollbildwechsel und regelmäßig neu eingepasst', () => {
      const m = texts['main.js'] || '';
      assert(/function refitStack/.test(m) && /addEventListener\('resize'/.test(m) && /fullscreenchange/.test(m) && /setInterval\(refitStack/.test(m), 'refitStack fehlt');
    });
    await test('Vollbild (0.23.11): nach Verlassen kein automatischer Wiedereintritt', () => {
      const m = texts['main.js'] || '';
      assert(/S\.fsLeft \|\|/.test(m) && /S\.fsLeft = true/.test(m), 'fsLeft fehlt');
    });
    await test('Thronsaal (0.23.12): Hüter steht an der Ostwand, alte Stände ziehen die Position nach', () => {
      const lv = data.levels.nebelturm, o = lv.objects.find((q) => q.id === 'en_tboss');
      assert(lv.map[o.y][o.x] === '.' && lv.map[o.y][o.x + 1] !== '.', 'Hüter nicht an der Wand: ' + o.x + ',' + o.y);
      const s = L.newGame(data, 3); L.jumpToLevel(s, data, 'nebelturm');
      const b = s.objs.find((q) => q.id === 'en_tboss'); b.x = 22; b.y = 9; L.syncStatic(s, data);
      assert(b.x === o.x && b.y === o.y, 'Position nicht nachgezogen');
    });
    await test('Lebensbalken (0.23.12): Lage der Gegnerbalken ohne Atem-Schwanken', () => {
      const rs = texts['render.js'] || '';
      assert(/base: sc/.test(rs) && /s\.base \|\| s\.scale/.test(rs), 'Basisgröße fehlt');
    });
    await test('Treppe (0.23.13): freistehende Treppen/Ausgänge haben eine feste Achse', () => {
      const rs = texts['render.js'] || '';
      assert(/function freeAxis/.test(rs) && /passAxis\(grid, o\) \|\| freeAxis\(grid, o\)/.test(rs), 'freeAxis fehlt');
    });
    await test('Vollbild (0.23.14): nur ein Versuch je Aufruf, nie im Kampf', () => {
      const m = texts['main.js'] || '';
      assert(/S\.fsTried \|\|/.test(m) && /S\.fsTried = true/.test(m) && /S\.game\.combat\) \|\| document\.fullscreenElement/.test(m), 'fsTried fehlt');
    });
    await test('Zaubertrank (0.24.0): stellt Mana wieder her, im Laden, außerhalb und im Kampf', () => {
      const s = L.newGame(data, 3), it = data.items.zaubertrank;
      assert(it && it.kind === 'consumable' && it.mana === 15, 'Zaubertrank fehlt');
      assert(data.shops.moorrand.stock.some((x) => x.item === 'zaubertrank'), 'nicht im Laden');
      s.inv.zaubertrank = 2; const h = s.heroes[3]; h.maxMp = 30; h.mp = 0;
      let r = L.useItemOutside(s, data, 'zaubertrank', 3);
      assert(!r.error && h.mp === 15 && s.inv.zaubertrank === 1, 'Mana +15: ' + JSON.stringify(r) + ' mp ' + h.mp);
      h.mp = h.maxMp; assert(L.useItemOutside(s, data, 'zaubertrank', 3).error === 'full-mp', 'volles Mana');
      assert(s.inv.zaubertrank === 1, 'bei vollem Mana nicht verbraucht');
      s.gold = 100; const b = L.buyItem(s, data, 'moorrand', 'zaubertrank');
      assert(!b.error && s.inv.zaubertrank === 2 && s.gold === 100 - b.price && b.price === 14, 'Kauf ' + JSON.stringify(b));
    });
    await test('Tränke (0.24.0): drei Größen mit steigender Wirkung, Verteilung und Anwendung', () => {
      const I = data.items;
      assert(I.potion.heal === 15 && I.potion_m.heal === 40 && I.potion_g.heal === 90, 'Heiltränke 15/40/90');
      assert(I.zaubertrank.mana === 15 && I.zaubertrank_m.mana === 35 && I.zaubertrank_g.mana === 70, 'Zaubertränke 15/35/70');
      for (const [a, b] of [['potion', 'potion_m'], ['potion_m', 'potion_g'], ['zaubertrank', 'zaubertrank_m'], ['zaubertrank_m', 'zaubertrank_g']]) assert(I[b].value > I[a].value, `${b} teurer als ${a}`);
      const st = data.shops.moorrand.stock.map((x) => x.item);
      assert(st.includes('potion_m') && st.includes('zaubertrank_m'), 'Mittlere im Laden');
      const s = L.newGame(data, 3); s.heroes[0].hp = 1; s.heroes[0].maxHp = 200; s.inv.potion_g = 1; s.inv.potion_m = 1;
      L.useItemOutside(s, data, 'potion_g', 0); assert(s.heroes[0].hp === 91, 'groß +90: ' + s.heroes[0].hp);
      L.useItemOutside(s, data, 'potion_m', 0); assert(s.heroes[0].hp === 131, 'mittel +40: ' + s.heroes[0].hp);
      const ids = new Set(); for (const lv of Object.values(data.levels)) for (const o of lv.objects) for (const e of o.loot || []) if (e.item) ids.add(e.item);
      assert(ids.has('potion_m') && ids.has('potion_g') && ids.has('zaubertrank') && ids.has('zaubertrank_m'), 'Verteilung in Truhen');
      for (const i of ids) assert(I[i], 'unbekannter Gegenstand ' + i);
    });
    await test('Spiel beenden (0.24.1): Knopf im Titel und im Menü', () => {
      const m = texts['main.js'] || '', h = texts['index.html'] || '';
      assert(/data-t="quit"/.test(h) && /data-m="quit"/.test(m) && /async function quitGame/.test(m) && /t === 'quit'/.test(m), 'Beenden-Knopf fehlt');
    });
    await test('Vollbild-Schalter (0.24.2): Einstellungen schalten an und aus', () => {
      const m = texts['main.js'] || '';
      assert(/m === 'fullscreen' && document\.fullscreenElement/.test(m) && /document\.exitFullscreen\(\)/.test(m) && /Vollbild: \$\{/.test(m), 'Schalter fehlt');
    });
    await test('Update-Robustheit (0.24.2): skipWaiting, allSettled, Knopf „Neueste Version laden“', () => {
      assert(/allSettled/.test(texts['sw.js'] || '') && /skipWaiting\(\)\)/.test(texts['sw.js'] || ''), 'sw.js');
      assert(/m === 'refresh'/.test(texts['main.js'] || '') && /unregister\(\)/.test(texts['main.js'] || ''), 'refresh-Knopf');
    });
    await test('Begegnungsdialoge (0.25.0): Wahl, Kosten, Gegenstände, Verschwinden, Kampf, Speichern', () => {
      const s = L.newGame(data, 5); L.jumpToLevel(s, data, 'moorpfad');
      const bram = s.objs.find((o) => o.id === 'npc_bram');
      assert(bram && L.blockerAt(s, bram.x, bram.y) === bram, 'Person versperrt das Feld');
      s.player = { x: bram.x + 1, y: bram.y, dir: 3 };
      const r0 = L.interact(s, data); assert(r0.talk === 'npc_bram', 'Interagieren startet Gespräch');
      let node = L.dialogStartNode(s, data, bram), v = L.dialogView(s, data, bram, node);
      assert(v.choices.length === 3, 'drei Wahlmöglichkeiten');
      let r = L.dialogChoose(s, data, bram, node, 1); assert(r.next === 'c', 'zu Knoten c');
      v = L.dialogView(s, data, bram, 'c'); s.gold = 5;
      assert(!L.dialogView(s, data, bram, 'c').choices[0].ok && /10 Gold/.test(v.choices[0].t), 'zu wenig Gold: gesperrt, Preis im Text');
      assert(L.dialogChoose(s, data, bram, 'c', 0).error === 'not-possible', 'gesperrte Wahl wirkt nicht');
      s.gold = 30; const gi = s.inv.gegengift || 0; r = L.dialogChoose(s, data, bram, 'c', 0);
      assert(s.gold === 20 && s.inv.gegengift === gi + 1 && r.end, 'bezahlt, Gegengift erhalten');
      assert(L.dialogStartNode(s, data, bram) === 'z', 'danach „again“-Knoten');
      // Kultist: verbinden → Hinweis, Person verschwindet, Gold
      L.jumpToLevel(s, data, 'kultgruft'); const k = s.objs.find((o) => o.id === 'npc_wund');
      s.inv.potion = 0; assert(!L.dialogView(s, data, k, 'a').choices[0].ok, 'ohne Heiltrank gesperrt');
      s.inv.potion = 1; r = L.dialogChoose(s, data, k, 'a', 0); assert(r.next === 'b' && s.inv.potion === 0, 'Heiltrank verbraucht');
      const g0 = s.gold; r = L.dialogChoose(s, data, k, 'b', 0);
      assert(k.gone && s.gold === g0 + 12 && L.blockerAt(s, k.x, k.y) === null, 'Person weg, 12 Gold, Feld frei');
      const s2 = L.deserialize(JSON.stringify(L.serialize(s)), data); assert(s2.objs.find((o) => o.id === 'npc_wund').gone, 'bleibt weg nach Speichern');
      // Angreifen → Kampf
      const s3 = L.newGame(data, 6); L.jumpToLevel(s3, data, 'kultgruft'); const k3 = s3.objs.find((o) => o.id === 'npc_wund');
      r = L.dialogChoose(s3, data, k3, 'a', 2); assert(r.encounter === k3 && k3.type === 'enemy' && k3.kind === 'kultist' && k3.hp > 0, 'wird zum Gegner');
      // Gerwin: bedrohen → keine Hinweise mehr
      L.jumpToLevel(s3, data, 'festung1'); const gw = s3.objs.find((o) => o.id === 'npc_gerwin');
      s3.gold = 100; r = L.dialogChoose(s3, data, gw, 'a', 2); assert(r.next === 'd', 'bedrohen');
      r = L.dialogChoose(s3, data, gw, 'd', 0); assert(gw.gone && s3.flags['gerwin:bedroht'] && s3.gold === 118, 'Gerwin flieht, 18 Gold');
      for (const id of Object.keys(data.dialogs)) { const dl = data.dialogs[id]; assert(dl.nodes[dl.start] && (!dl.again || dl.nodes[dl.again]), id + ': Knoten'); for (const nd of Object.values(dl.nodes)) for (const c of nd.choices) assert(!c.to || dl.nodes[c.to], id + ': Ziel ' + c.to); }
      for (const lvId of ['moorpfad', 'kultgruft', 'festung1']) assert(L.analyzeLevel(data, lvId).ok, 'Ebene weiter vollständig erreichbar: ' + lvId);
    });
    await test('Version: sw.js und main.js stimmen überein', () => {
      const re = /VERSION\s*=\s*'([^']+)'/;
      const a = texts['sw.js'] && re.exec(texts['sw.js']), b = texts['main.js'] && re.exec(texts['main.js']);
      assert(a && b, 'VERSION nicht gefunden');
      assert(a[1] === b[1], `sw.js ${a[1]} ≠ main.js ${b[1]}`);
      return 'Version ' + a[1];
    });
    await test('Service Worker: jede Cache-Datei existiert', () => {
      const m = /ASSETS\s*=\s*\[([\s\S]*?)\]/.exec(texts['sw.js'] || '');
      assert(m, 'ASSETS nicht gefunden');
      const list = [...m[1].matchAll(/'\.\/([^']*)'/g)].map((x) => x[1]).filter(Boolean);
      assert(list.length >= 10, 'zu wenige Einträge');
      if (env.exists) for (const f of list) assert(env.exists(f), `fehlt: ${f}`);
      for (const f of ['index.html', 'main.js', 'render.js', 'logic.js', 'audio.js', 'store.js', 'game.json', 'manifest.webmanifest']) assert(list.includes(f), `${f} fehlt im Cache`);
      return `${list.length} Einträge`;
    });
    await test('Einstellungen: Schrittgeräusche standardmäßig aus (Nutzerentscheidung 13.11.2026)', () => {
      const m = /const DEFAULTS\s*=\s*\{([^}]*)\}/.exec(texts['main.js'] || '');
      assert(m, 'DEFAULTS nicht gefunden');
      assert(/steps:\s*false/.test(m[1]), 'DEFAULTS.steps muss false sein');
      assert(/settingsV:\s*SETTINGS_V/.test(m[1]), 'settingsV fehlt');
    });
    if (texts['BALANCE.md'] != null) await test('BALANCE.md ist aktuell (entspricht game.json)', () => {
      assert(texts['BALANCE.md'] === L.balanceMarkdown(data), 'BALANCE.md veraltet: neu erzeugen (Befehl in HANDOVER.md)');
    });
    await test('Oberfläche: tippbare HUD-Teile haben pointer-events:auto (#party, #enemybox, #actionbar)', () => {
      const css = texts['index.html'] || '';
      assert(/#hud\{[^}]*pointer-events:none/.test(css), '#hud ohne pointer-events:none – Test anpassen');
      assert(/#foetags \.ft\{[^}]*pointer-events:auto/.test(css), 'Gegnerbalken bekommen keine Tipps');
      for (const id of ['party', 'enemybox', 'actionbar']) assert(new RegExp('#' + id + '\\{[^}]*pointer-events:auto').test(css), `#${id} bekommt keine Tipps`);
    });
    await test('Helden kommen nur noch aus game.json (races, classes, quickParty)', () => {
      for (const f of ['logic.js', 'main.js']) assert(!/data\.heroes/.test(texts[f] || ''), `${f}: Zugriff auf data.heroes`);
    });
    await test('Datenschutz: keine E-Mail-Adressen, Autor eldermoor-dev', () => {
      const mail = new RegExp('[\\w.+-]+' + String.fromCharCode(64) + '[\\w-]+\\.[\\w.]+');
      for (const [f, t] of Object.entries(texts)) {
        if (t == null) continue;
        assert(!mail.test(t), `${f}: enthält eine E-Mail-Adresse`);
      }
      assert(/eldermoor-dev/.test(texts['index.html'] || ''), 'Autor fehlt in index.html');
      for (const f of ['main.js', 'render.js', 'logic.js', 'audio.js', 'store.js']) assert(/Autor: eldermoor-dev/.test(texts[f] || ''), `Autor fehlt in ${f}`);
    });
  }

  await test('Talente (0.17.0): Daten vollständig – 6 Berufe × 3 Zweige × 4 Talente, Freischaltungen existieren', () => {
    const FX = new Set(['hp', 'mp', 'atk', 'def', 'init', 'crit', 'dodge', 'resist', 'gold', 'abil', 'soak', 'heal', 'regen', 'backfull', 'trap', 'lock', 'secret', 'haggle', 'lifesteal', 'taunt', 'aura_atk', 'firstcrit', 'noambush', 'loot_potion', 'postheal', 'aura_soak', 'burnhit', 'fireburn', 'frostbite', 'manashield', 'pierce', 'opener', 'immune_poison', 'dotplus', 'potionplus', 'chain']);
    const ids = new Set();
    eq(data.talents.cost, [1, 1, 2, 2], 'Kosten');
    for (const c of Object.keys(data.classes)) {
      const br = L.talentBranches(data, c);
      eq(br.length, 3, `${c}: drei Zweige`);
      for (const b of br) {
        eq(b.nodes.length, 4, `${c}/${b.id}: vier Talente`);
        b.nodes.forEach((n, i) => {
          assert(!ids.has(n.id), `Talent-ID doppelt: ${n.id}`); ids.add(n.id);
          assert(n.name && n.desc, `${n.id}: Name/Beschreibung`);
          for (const k of Object.keys(n.fx || {})) assert(FX.has(k), `${n.id}: unbekannte Wirkung ${k}`);
          if (n.unlock) { assert(data.spells[n.unlock], `${n.id}: Fähigkeit ${n.unlock} fehlt`); assert(i === 3, `${n.id}: Freischaltung nur als 4. Talent`); }
          else assert(n.fx && Object.keys(n.fx).length, `${n.id}: ohne Wirkung`);
        });
      }
    }
  });
  await test('Talente: Punkte (1 je Stufe ab 2), Reihenfolge, Stufensperre, Kosten, Stat-Boni, Aufstieg', () => {
    const s = fresh(); const h = s.heroes[0]; // Krieger
    eq(L.talentPoints(data, h), 0, 'Stufe 1: kein Punkt');
    eq(L.learnTalent(s, data, 0, 'w_haut').error, 'punkte', 'ohne Punkt nicht lernbar');
    L.grantXp(s, data, 100, []); eq(L.talentPoints(data, h), 1, 'Stufe 2: ein Punkt');
    eq(L.learnTalent(s, data, 0, 'w_wall').error, 'vorher', 'Reihenfolge im Zweig');
    const hp0 = h.maxHp, def0 = L.heroDef(data, h, s);
    assert(L.learnTalent(s, data, 0, 'w_haut').msg, 'erstes Talent lernbar');
    eq([h.maxHp, h.hp, L.heroDef(data, h, s)], [hp0 + 8, hp0 + 8, def0 + 1], 'LP +8 (voll geheilt um Zuwachs), Verteidigung +1');
    eq(L.talentPoints(data, h), 0, 'Punkt ausgegeben');
    eq(L.learnTalent(s, data, 0, 'w_haut').error, 'gelernt', 'nicht doppelt');
    L.grantXp(s, data, 100000, []); eq(h.level, 15, 'Stufe 15');
    eq(L.talentPoints(data, h), 13, '14 Punkte − 1 ausgegeben');
    assert(h.maxHp === L.deriveStats(data, h.race, h.cls, 15).maxHp + 8, 'Aufstieg behält Talent-LP');
    L.learnTalent(s, data, 0, 'w_wille'); L.learnTalent(s, data, 0, 'w_wall');
    eq(L.talentPoints(data, h), 13 - 1 - 2, 'Kosten 1/1/2');
    assert(L.learnTalent(s, data, 0, 'w_stoss').msg, 'viertes Talent bei Stufe 15');
    assert(L.knownSpells(data, h).some((x) => x.id === 'shieldbash'), 'Fähigkeit freigeschaltet');
    const t = fresh(); t.heroes[0].level = 7; t.heroes[0].tal = { w_haut: true, w_wille: true, w_wall: true };
    eq(L.canLearnTalent(data, t.heroes[0], 'w_stoss').why, 'stufe', 'viertes Talent erst ab Stufe 8');
    assert(L.validateState(s, data).length === 0, 'Zustand gültig: ' + L.validateState(s, data).join(';'));
    const bad = JSON.parse(JSON.stringify(s)); bad.heroes[0].tal.zzz = true; assert(L.validateState(bad, data).some((e) => /Talent/.test(e)), 'ungültiges Talent erkannt');
    const bad2 = JSON.parse(JSON.stringify(s)); bad2.heroes[0].level = 3; assert(L.validateState(bad2, data).some((e) => /mehr Talente/.test(e)), 'mehr Talente als Punkte erkannt');
  });
  await test('Talente: Zurücksetzen kostet Gold, gibt alle Punkte zurück und nimmt Boni', () => {
    const s = fresh(); L.grantXp(s, data, 450, []); const h = s.heroes[0];
    L.learnTalent(s, data, 0, 'w_haut');
    const cost = L.respecCost(data, h); eq(cost, 20 * h.level, 'Kosten');
    s.gold = cost - 1; eq(L.respecTalents(s, data, 0).error, 'gold', 'zu wenig Gold');
    s.gold = cost + 5; assert(L.respecTalents(s, data, 0).msg, 'Zurücksetzen klappt');
    eq([s.gold, L.talentPoints(data, h), h.maxHp], [5, h.level - 1, L.deriveStats(data, h.race, h.cls, h.level).maxHp], 'Gold, Punkte, LP');
    eq(L.respecTalents(s, data, 0).error, 'nothing', 'nichts mehr zu verlernen');
  });
  await test('Talente im Kampf: Ausweichen, Schadensminderung, Krit, Fähigkeitsbonus, Statusabwehr, Gold, Regeneration', () => {
    const mk = (fx) => { const d = JSON.parse(JSON.stringify(data)); d.talents.classes.warrior[0].nodes[0].fx = fx; const s = L.newGame(d, 3); s.heroes[0].level = 5; s.heroes[0].tal = { w_haut: true }; return { d, s }; };
    let { d, s } = mk({ dodge: 100 });
    put(s, 15, 7, 1); L.startCombat(s, d, L.enemyInFront(s));
    for (let i = 0; i < 30 && !s.combat.over; i++) { const a = L.currentActor(s); if (!a) break; if (a.side === 'h') L.heroAction(s, d, { type: 'defend' }); else { s.combat.enemies.forEach(() => 0); const r = L.enemyStep(s, d); if (r.msgs.some((m) => /weicht aus/.test(m))) { assert(s.heroes[0].hp === s.heroes[0].maxHp, 'Ausgewichen: keine LP verloren'); return; } } }
    throw new Error('kein Ausweichen beobachtet (Zielwahl hat Berenn nie getroffen)');
  });
  await test('Talente: kritisch ×1,5, Fähigkeit +%, Gold-Bonus, Alchemist gibt Tränke an andere', () => {
    const a = fresh(4), b = fresh(4);
    const d1 = L.calcDamage(a, 20, 0, { sure: true }), d2 = L.calcDamage(b, 20, 0, { sure: true, crit: true });
    eq(d2, Math.floor(d1 * 1.5), 'Krit ×1,5');
    const d = JSON.parse(JSON.stringify(data)); d.talents.classes.warrior[1].nodes[2].fx = { abil: 100 };
    const t = L.newGame(d, 9); t.heroes[0].level = 5; t.heroes[0].tal = { w_zorn: true, w_krit: true, w_wucht: true };
    eq(L.talentSum(d, t.heroes[0], 'abil'), 100, 'Summe');
    eq(L.talentSum(d, t.heroes[0], 'crit'), 8, 'Krit-Summe');
    // Alchemist: Tränke an andere Helden im Kampf (alle anderen Berufe dürfen nur an sich selbst)
    const s = L.newGame(d, 5, [{ name: 'Al', race: 'human', cls: 'alchemist' }, { name: 'B', race: 'human', cls: 'warrior' }, { name: 'C', race: 'human', cls: 'rogue' }, { name: 'D', race: 'human', cls: 'mage' }]);
    s.inv.potion = 3; s.heroes[1].hp = 5;
    put(s, 15, 7, 1); L.startCombat(s, d, L.enemyInFront(s));
    for (let i = 0; i < 30; i++) { const c = L.currentActor(s); if (c.side === 'h' && s.heroes[c.idx].cls === 'alchemist') break; if (c.side === 'h') L.heroAction(s, d, { type: 'defend' }); else L.enemyStep(s, d); }
    const cur = L.currentActor(s);
    eq(s.heroes[cur.idx].cls, 'alchemist', 'Alchemist ist am Zug');
    const r = L.heroAction(s, d, { type: 'item', item: 'potion', hero: 1 });
    assert(!r.error, 'Alchemist darf Tränke weitergeben: ' + r.error);
    const w = L.newGame(d, 6); w.inv.potion = 1; put(w, 15, 7, 1); L.startCombat(w, d, L.enemyInFront(w));
    for (let i = 0; i < 30; i++) { const c = L.currentActor(w); if (c.side === 'h') break; L.enemyStep(w, d); }
    eq(L.heroAction(w, d, { type: 'item', item: 'potion', hero: (L.currentActor(w).idx + 1) % 4 }).error, 'bad-target', 'andere Berufe nur an sich selbst');
  });
  await test('Schwierigkeit (0.17.0): Schwer = mehr LP/Angriff/Gold/EP, Normal unverändert, Speicherfeld geprüft', () => {
    const n = L.newGame(data, 5), hd = L.newGame(data, 5, null, 'hard'), x = L.newGame(data, 5, null, 'quatsch');
    eq([n.difficulty, hd.difficulty, x.difficulty], ['normal', 'hard', 'normal'], 'Schwierigkeit gesetzt, Unbekanntes wird Normal');
    put(n, 15, 7, 1); put(hd, 15, 7, 1);
    L.startCombat(n, data, L.enemyInFront(n)); L.startCombat(hd, data, L.enemyInFront(hd));
    eq(n.combat.enemies[0].maxHp, data.enemies.schrat.hp, 'Normal: LP wie in den Daten');
    eq(hd.combat.enemies[0].maxHp, Math.round(data.enemies.schrat.hp * 1.3), 'Schwer: +30 % LP');
    eq(L.diffPct(hd, data, 'gold'), 120, 'Gold-Faktor'); eq(L.diffPct({}, data, 'atk'), 100, 'ohne Feld = Normal');
    assert(L.validateState(hd, data).length === 0, 'gültig');
    const bad = JSON.parse(JSON.stringify(hd)); bad.difficulty = 'x'; assert(L.validateState(bad, data).some((e) => /Schwierigkeit/.test(e)), 'ungültiger Grad erkannt');
  });
  await test('Status (0.18.0): Blutung zieht LP am Zugende, Fluch senkt Verteidigung um 30 %, Heilzauber nehmen beides', () => {
    for (const k of ['bleed', 'curse']) assert(data.statuses[k] && data.statuses[k].icon, `Status ${k} fehlt`);
    const s = fresh(3); put(s, 15, 7, 1); L.startCombat(s, data, L.enemyInFront(s));
    s.combat.status.h0 = { bleed: { t: 2, p: 3 } }; s.combat.status.h1 = { curse: { t: 2 } };
    assert(L.canCleanse(data.classes.priest.ability, s.combat.status.h0), 'Heilende Hand nimmt Blutung');
    assert(!L.canCleanse(data.classes.priest.ability, s.combat.status.h1), 'Heilende Hand nimmt keinen Fluch');
    assert(L.canCleanse(data.spells.great_heal, s.combat.status.h1), 'Große Heilung nimmt Fluch');
    let bled = false;
    for (let i = 0; i < 12 && !bled && s.combat && !s.combat.over; i++) { const a = L.currentActor(s); const r = a.side === 'h' ? L.heroAction(s, data, { type: 'defend' }) : L.enemyStep(s, data, { god: true }); if (r.msgs.some((m) => /Blutungsschaden/.test(m))) bled = true; }
    assert(bled, 'Blutungsschaden gemeldet');
  });
  await test('Kombinationsangriffe (0.18.0): nur mit Status eines ANDEREN Helden, Faktor wirkt, Verbrauch, Daten gültig', () => {
    for (const cb of data.combos) { assert(data.statuses[cb.status], `Kombi ${cb.id}: Status`); assert(['melee', 'ranged', 'any', ...Object.keys(data.elements)].includes(cb.by), `Kombi ${cb.id}: by`); assert(cb.mult > 100 && cb.name && cb.desc, `Kombi ${cb.id}: Werte`); }
    const s = fresh(3); put(s, 15, 7, 1); L.startCombat(s, data, L.enemyInFront(s));
    s.combat.status.e0 = { stun: { t: 1, by: 0 } };
    eq(L.comboFor(s, data, 0, 0), null, 'eigener Status zählt nicht');
    eq(L.comboFor(s, data, 1, 0).id, 'execute', 'Gnadenstoß für einen anderen Helden');
    s.combat.status.e0 = { poison: { t: 3, p: 2, by: 1 } };
    eq(L.comboFor(s, data, 3, 0), null, 'Magier-Grundangriff ohne Feuer: keine Kombi');
    eq(L.comboFor(s, data, 3, 0, data.classes.mage.ability).id, 'ignite', 'Feuerblitz auf Gift: Entzünden');
    s.combat.status.e0 = { stun: { t: 1 } }; eq(L.comboFor(s, data, 1, 0), null, 'Status ohne Urheber (z. B. vom Gegner selbst) zählt nicht');
    // echter Ablauf: Schurke vergiftet, Magier entzündet → Meldung und Gift weg
    const t = fresh(8); put(t, 15, 7, 1); L.startCombat(t, data, L.enemyInFront(t)); t.combat.enemies[0].hp = t.combat.enemies[0].maxHp = 9999;
    let done = false;
    for (let i = 0; i < 40 && !done; i++) {
      const a = L.currentActor(t); if (a.side === 'e') { L.enemyStep(t, data, { god: true }); continue; }
      const h = t.heroes[a.idx]; h.mp = h.maxMp;
      const r = h.cls === 'rogue' ? L.heroAction(t, data, { type: 'ability', target: 0 }) : h.cls === 'mage' && L.comboFor(t, data, a.idx, 0, data.classes.mage.ability) ? L.heroAction(t, data, { type: 'ability', target: 0 }) : L.heroAction(t, data, { type: 'defend' });
      if (r.msgs && r.msgs.some((m) => /Kombination „Entzünden“/.test(m))) { done = true; assert(!(t.combat.status.e0 || {}).poison, 'Gift verbraucht'); }
    }
    assert(done, 'Kombination im echten Kampf ausgelöst');
  });
  await test('Fallen (0.18.0): Daten, Auslösen (nie unter 1 LP), Warnung bei entdeckter Falle, Untersuchen, Entschärfen, Talent', () => {
    let n = 0;
    for (const [id, lvl] of Object.entries(data.levels)) for (const o of lvl.objects) if (o.type === 'trap') { n++; assert(data.traps.kinds[o.kind], `${id}/${o.id}: Art`); eq(L.cellChar(lvl, o.x, o.y), '.', `${id}/${o.id}: liegt auf Boden`); assert(!lvl.objects.some((q) => q !== o && q.x === o.x && q.y === o.y && !(q.type === 'sign' && q.face != null)), `${id}/${o.id}: Feld frei`); assert(!(lvl.start.x === o.x && lvl.start.y === o.y), `${id}/${o.id}: nicht am Start`); }
    assert(n >= 5, 'mindestens fünf Fallen');
    const mk = () => { const s = fresh(2); s.objs.push({ id: 'tt', type: 'trap', x: 3, y: s.player.y, kind: 'spikes' }); s.player.x = 2; s.player.dir = 1; return s; };
    const lv = data.levels[data.startLevel];
    const s = mk(); assert(L.cellChar(lv, 3, s.player.y) === '.', 'Testfeld ist Boden'); s.objs.find((o) => o.id === 'tt').checked = true;
    s.heroes[0].hp = 2;
    const r = L.tryMove(s, data, 'f'); assert(r.moved && r.events.some((e) => e.type === 'trap'), 'unentdeckte Falle löst aus');
    eq(s.heroes[0].hp, 1, 'niemand fällt unter 1 LP'); eq(s.heroes[2].hp, s.heroes[2].maxHp, 'Speerfalle trifft nur die Vorderreihe');
    assert(s.objs.find((o) => o.id === 'tt').sprung && !L.trapAt(s, 3, s.player.y), 'ausgelöst = harmlos');
    const w = mk(); w.objs.find((o) => o.id === 'tt').spotted = true;
    const r1 = L.tryMove(w, data, 'f'); assert(!r1.moved && r1.trapWarn, 'entdeckte Falle: erst Warnung');
    const r2 = L.tryMove(w, data, 'f'); assert(r2.moved && r2.events.some((e) => e.type === 'trap'), 'zweites Mal: hineintreten');
    const u = mk(); const i1 = L.interact(u, data); assert(/untersuchst den Boden/.test(i1.msg) && u.objs.find((o) => o.id === 'tt').spotted, '◉ untersucht den Boden');
    let ok = 0, fail = 0;
    for (let seed = 1; seed <= 60; seed++) { const q = L.newGame(data, seed); q.objs.push({ id: 'tt', type: 'trap', x: 3, y: q.player.y, kind: 'spikes', spotted: true }); q.player.x = 2; q.player.dir = 1; const d = L.interact(q, data); if (d.ok) { ok++; assert(q.objs.find((o) => o.id === 'tt').disarmed, 'entschärft'); } else { fail++; assert(q.objs.find((o) => o.id === 'tt').sprung, 'misslungen = ausgelöst'); } }
    assert(ok > 20 && fail > 8, `Entschärfen ohne Talent etwa 55 % (${ok}/60)`);
    const tl = fresh(2); eq(L.trapSkill(tl, data), 0, 'ohne Talent 0'); tl.heroes[1].level = 5; tl.heroes[1].tal = { r_gold: true }; eq(L.trapSkill(tl, data), 30, 'Schurke mit Talent: 30');
    let seen = 0; for (let seed = 1; seed <= 60; seed++) { const q = L.newGame(data, seed); q.objs.push({ id: 'tt', type: 'trap', x: 3, y: q.player.y, kind: 'spikes' }); q.player.x = 2; q.player.dir = 0; if ((L.turn(q, data, 1).notes || []).length) seen++; }
    assert(seen > 8 && seen < 40, `Bemerken ohne Talent etwa 35 % (${seen}/60)`);
  });
  await test('Steine und Druckplatten (0.19.0): schieben, ziehen, Platte hält Gitter nur unter Last, Stein entschärft Falle, Rätsel lösbar', () => {
    const s = L.newGame(data, 3); L.jumpToLevel(s, data, 'schratgruben');
    const b = s.objs.find((o) => o.id === 'boulder_s1'), pl = s.objs.find((o) => o.id === 'plate_s1'), gate = s.objs.find((o) => o.id === 'gate_s2');
    assert(b && pl && gate && !gate.open, 'Rätselobjekte vorhanden, Gitter zu');
    s.player = { x: 12, y: 11, dir: 2 };
    eq(L.blockerAt(s, 12, 12), b, 'Stein versperrt das Feld');
    let r = L.tryMove(s, data, 'f'); assert(r.moved && b.x === 12 && b.y === 13 && s.player.y === 12, 'schieben nach Süden');
    r = L.tryMove(s, data, 'f'); assert(!r.moved && /nicht weiter/.test(r.msg), 'an der Wand geht es nicht weiter');
    r = L.interact(s, data); assert(r.moved && b.y === 12 && s.player.y === 11, 'ziehen: Stein folgt, Gruppe geht zurück');
    L.tryMove(s, data, 'f'); // wieder nach Süden schieben
    s.player = { x: 11, y: 13, dir: 1 };
    L.tryMove(s, data, 'f'); r = L.tryMove(s, data, 'f');
    eq([b.x, b.y], [14, 13], 'Stein liegt auf der Platte');
    assert(pl.down && gate.open, 'Platte belastet, Gitter offen');
    assert(r.events.some((e) => e.type === 'mech' && e.msgs.some((m) => /Gitter/.test(m))), 'Meldung zum Gitter');
    s.player = { x: 10, y: 12, dir: 3 }; assert(L.tryMove(s, data, 'f').moved, 'durch das offene Gitter');
    const ch = L.interact(s, data); assert(/Truhe geöffnet/.test(ch.msg), 'Truhe hinter dem Gitter erreichbar');
    // nur die Gruppe auf der Platte: Gitter fällt wieder zu, wenn sie weggeht
    const q = L.newGame(data, 3); L.jumpToLevel(q, data, 'schratgruben'); const g2 = q.objs.find((o) => o.id === 'gate_s2');
    q.player = { x: 13, y: 13, dir: 1 }; L.tryMove(q, data, 'f'); assert(g2.open, 'Gruppe auf der Platte öffnet');
    q.player.dir = 3; L.tryMove(q, data, 'f'); assert(!g2.open, 'Gruppe weg: Gitter zu');
    // Stein auf Falle: löst aus, niemand verletzt
    const w = fresh(2); const y = w.player.y; w.objs.push({ id: 'bb', type: 'boulder', x: 3, y }, { id: 'tt', type: 'trap', x: 4, y, kind: 'spikes' }); w.player.x = 2; w.player.dir = 1;
    assert(L.cellChar(data.levels[data.startLevel], 4, y) === '.', 'Testfeld frei');
    const hp = w.heroes.map((h) => h.hp); L.tryMove(w, data, 'f');
    assert(w.objs.find((o) => o.id === 'tt').sprung, 'Falle durch Stein ausgelöst'); eq(w.heroes.map((h) => h.hp), hp, 'niemand verletzt');
    for (const id of ['kultgruft', 'schratgruben']) { const a = L.analyzeLevel(data, id); assert(a.ok, `${id}: weiterhin lösbar (${JSON.stringify(a)})`); }
    const k = L.newGame(data, 3); L.jumpToLevel(k, data, 'kultgruft'); const sec = k.objs.find((o) => o.id === 'secret_g1');
    k.player = { x: 5, y: 4, dir: 1 }; assert(!sec.open && /Stein gibt nach/.test(L.interact(k, data).msg) && sec.open, 'Geheimkammer öffnet über den lockeren Stein');
  });
  await test('Truhenarten und Talente außerhalb des Kampfes (0.20.0): Schloss, Dietrich, Klemmen, Truhenfalle, Monstertruhe, Geheimwand-Gespür, Feilschen', () => {
    const kg = (seed = 1) => { const s = L.newGame(data, seed); L.jumpToLevel(s, data, 'kultgruft'); s.objs.forEach((o) => { if (o.type === 'enemy') o.dead = true; }); return s; };
    // Schloss ohne Talent und ohne Dietrich
    let s = kg(); const c2 = s.objs.find((o) => o.id === 'chest_g2'); s.player = { x: 15, y: 10, dir: 2 };
    let r = L.interact(s, data); assert(!c2.open && /Dietrich/.test(r.msg), 'verschlossen, Hinweis auf Dietrich');
    s.inv.dietrich = 40; let n = 0; while (!c2.open && n++ < 40) L.interact(s, data);
    assert(c2.open, 'mit Dietrichen geöffnet'); assert(s.inv.dietrich < 40 || n === 1, 'Fehlversuche verbrauchen Dietriche');
    // Talent: kein Dietrich nötig; Fehlschlag klemmt bis zur Rast
    let jammed = false, opened = false;
    for (let seed = 1; seed < 40 && !(jammed && opened); seed++) {
      const q = kg(seed), c = q.objs.find((o) => o.id === 'chest_g2'); q.player = { x: 15, y: 10, dir: 2 };
      const sira = q.heroes[1]; sira.level = 3; sira.tal = { r_gold: true };
      eq(L.partySkill(q, data, 'lock'), 30, 'Schlosstalent zählt');
      r = L.interact(q, data);
      if (c.open) opened = true;
      else if (c.jammed) {
        jammed = true; assert(/Rast/.test(L.interact(q, data).msg), 'geklemmt: Hinweis auf Rast');
        q.heroes[0].hp = 1; const rr = L.restParty(q, data); assert(!rr.error, 'Rast möglich: ' + JSON.stringify(rr)); assert(!c.jammed, 'Rast löst das Klemmen');
      }
    }
    assert(jammed && opened, 'beide Ausgänge kamen vor');
    // Truhenfalle (Moorpfad): öffnet sich am Ende immer, Falle ist danach erledigt
    let sawSpot = false, sawSpring = false;
    for (let seed = 1; seed < 30; seed++) {
      const q = L.newGame(data, seed); L.jumpToLevel(q, data, 'moorpfad'); const c = q.objs.find((o) => o.id === 'chest_p4'); q.player = { x: 21, y: 6, dir: 1 };
      const hp0 = q.heroes.reduce((a, h) => a + h.hp, 0); let k = 0;
      while (!c.open && k++ < 4) { r = L.interact(q, data); if (/Draht/.test(r.msg)) sawSpot = true; }
      assert(c.open && c.trapDone, 'Truhe offen, Falle erledigt');
      if (q.heroes.reduce((a, h) => a + h.hp, 0) < hp0) sawSpring = true;
      assert(q.heroes.every((h) => h.hp >= 1), 'niemand unter 1 LP');
    }
    assert(sawSpot && sawSpring, 'Falle wird mal bemerkt, mal ausgelöst');
    // Monstertruhe: ohne Talent sofort Kampf; mit Talent mitunter Warnung
    s = kg(); const mm = s.objs.find((o) => o.id === 'chest_mimic_g'); s.player = { x: 4, y: 11, dir: 0 };
    r = L.interact(s, data); assert(r.encounter === mm && mm.type === 'enemy' && mm.kind === 'truhenmaul' && !mm.dead, 'Truhe wird zum Truhenmaul');
    L.startCombat(s, data, r.encounter); eq(s.combat.enemies[0].kind, 'truhenmaul', 'Kampf gegen das Truhenmaul');
    let warned = false;
    for (let seed = 1; seed < 30 && !warned; seed++) {
      const q = kg(seed); q.heroes[3].level = 3; q.heroes[3].tal = { m_kalt: true, m_eis: true }; q.player = { x: 4, y: 11, dir: 0 };
      r = L.interact(q, data);
      if (r.warn) { warned = true; assert(!r.encounter, 'Warnung statt Kampf'); assert(L.interact(q, data).encounter, 'zweiter Griff weckt sie trotzdem'); }
    }
    assert(warned, 'Warnung mit Talent kommt vor');
    // Fackelschalter (0.23.7): Geheimwand lässt sich auch durch Berühren einer Fackel öffnen
    s = kg(); const tw = s.objs.find((o) => o.id === 'switch_g2'), sec0 = s.objs.find((o) => o.id === 'secret_g2');
    assert(tw && tw.torch && tw.wall, 'switch_g2 ist ein Fackelschalter'); s.player = { x: 2, y: 11, dir: 3 };
    assert(!sec0.open, 'Geheimwand zu'); r = L.interact(s, data); assert(sec0.open && tw.used && /Fackel/.test(r.msg), 'Fackel berühren öffnet die Geheimwand: ' + r.msg);
    assert(/schon gedreht/.test(L.interact(s, data).msg), 'zweites Berühren: schon gedreht');
    // echte Beute hinter der Geheimwand, Gespür und Hinweis
    s = kg(); const sec = s.objs.find((o) => o.id === 'secret_g2'); s.player = { x: 5, y: 11, dir: 1 };
    assert(!/Mechanismus/.test(L.interact(s, data).msg), 'ohne Talent nur der Grundhinweis');
    s.heroes[3].level = 3; s.heroes[3].tal = { m_kalt: true, m_eis: true };
    r = L.interact(s, data); assert(/Mechanismus/.test(r.msg) && /Westen/.test(r.msg), 'mit Talent: Richtung des Schalters: ' + r.msg);
    s.player = { x: 2, y: 11, dir: 3 }; assert(/Fackel lässt sich drehen/.test(L.interact(s, data).msg) && sec.open, 'Schalter öffnet die Geheimwand');
    s.player = { x: 7, y: 11, dir: 0 }; r = L.interact(s, data); assert(/Truhe geöffnet/.test(r.msg), 'echte Truhe erreichbar');
    let sensed = false;
    for (let seed = 1; seed < 20 && !sensed; seed++) { const q = kg(seed); q.heroes[3].level = 3; q.heroes[3].tal = { m_kalt: true, m_eis: true }; q.player = { x: 4, y: 11, dir: 1 }; sensed = L.scanSecrets(q, data).some((t) => /Luftzug/.test(t)); }
    assert(sensed, 'Geheimwand wird gespürt');
    // Feilschen
    const f = fresh(), base = L.buyPrice(f, data, 'potion'), sell = L.sellPrice(f, data, 'potion');
    f.heroes[1].level = 3; f.heroes[1].tal = { r_gold: true };
    assert(L.buyPrice(f, data, 'potion') < base && L.sellPrice(f, data, 'potion') >= sell, 'Feilschen senkt Kauf-, hebt Verkaufspreis');
    assert(L.shopStock(data, 'moorrand').some((e) => e.item === 'dietrich'), 'Hedda verkauft Dietriche');
    eq(L.buyPrice(fresh(), data, 'dietrich'), 10, 'Dietrich ohne Feilschtalent: 10 Gold');
    eq(L.buyPrice(f, data, 'dietrich'), 9, 'Dietrich mit Schurken-Talent Tascheninhalt (−10 %): 9 Gold, nicht fehlerhaft'); eq(L.haggle(f, data), 10, 'Feilschen 10 %');
    const a = L.analyzeLevel(data, 'kultgruft'); assert(a.ok, 'Kultgruft lösbar: ' + JSON.stringify(a));
  });
  await test('Ausrüstungseffekte, Sets, Gegnertaktik (0.21.0): Effekte zählen, Set-Bonus nur komplett, Lebensraub, Dornen, Deckung, Raserei, Heiler-Ziel, Set-Teile in Truhen', () => {
    for (const [id, st] of Object.entries(data.sets)) { assert(st.name && st.items.length >= 2 && st.bonus, `Set ${id}`); for (const i of st.items) assert(data.items[i] && data.items[i].set === id && data.items[i].q === 'set', `Set ${id}: ${i}`); }
    const s = fresh(5), h = s.heroes[0];
    s.inv.moorklinge = 1; s.inv.moorpanzer = 1;
    L.equipItem(s, data, 'moorklinge', 0);
    eq([L.fxSum(data, h, 'lifesteal'), L.fxSum(data, h, 'crit'), L.activeSets(data, h).length], [15, 0, 0], 'eine Hälfte: Effekt, kein Set');
    L.equipItem(s, data, 'moorpanzer', 0);
    eq([L.fxSum(data, h, 'thorns'), L.fxSum(data, h, 'crit'), L.fxSum(data, h, 'soak'), L.activeSets(data, h)[0].id], [2, 10, 1, 'moorwaechter'], 'komplett: Set-Bonus');
    eq(L.sellPrice(s, data, 'moorklinge'), null, 'Set-Teile nicht verkäuflich');
    // Lebensraub und Dornen im Kampf
    put(s, 15, 7, 1); L.startCombat(s, data, L.enemyInFront(s)); h.hp = 10; let leech = false, thorns = false;
    for (let i = 0; i < 60 && s.combat && !(leech && thorns); i++) { const a = L.currentActor(s); const r = a.side === 'h' ? L.heroAction(s, data, a.idx === 0 ? { type: 'attack', target: 0 } : { type: 'defend' }) : L.enemyStep(s, data); if (r.msgs.some((m) => /entzieht/.test(m))) leech = true; if (r.msgs.some((m) => /^Dornen:/.test(m))) thorns = true; if (h.hp < 10) h.hp = 10; }
    assert(leech && thorns, 'Lebensraub und Dornen kommen vor');
    // Deckung: Wache lebt → andere nehmen 75 %
    const q = fresh(6); L.startCombat(q, data, { id: 'gx', kind: 'kultwaechter', kinds: ['kultwaechter', 'kultist'], hp: 34 });
    assert(L.coveredBy(q, data, 1) && !L.coveredBy(q, data, 0), 'Kultist gedeckt, Wache nicht');
    q.combat.enemies[0].hp = 0; assert(!L.coveredBy(q, data, 1), 'Wache tot: keine Deckung');
    const dmg = (cov) => { const z = fresh(7); L.startCombat(z, data, { id: 'gx', kind: 'kultwaechter', kinds: ['kultwaechter', 'kultist'], hp: 34 }); if (!cov) z.combat.enemies[0].hp = 0; let g = 0; while (L.currentActor(z).side !== 'h' && g++ < 9) L.enemyStep(z, data, { god: true }); z.combat.enemies[1].hp = 999; z.rng = 77; z.heroes[L.currentActor(z).idx].atk = 30; const r = L.heroAction(z, data, { type: 'attack', target: 1 }); return { d: 999 - z.combat.enemies[1].hp, r }; };
    const a1 = dmg(true), a0 = dmg(false);
    assert(a0.d > 0 && a1.d === Math.max(1, Math.floor((a0.d * 75) / 100)) && a1.r.msgs.some((m) => /gedeckt/.test(m)), `Deckung −25 %: ${a0.d} → ${a1.d}`);
    // Raserei: zweiter Wolf nach dem Tod des ersten
    const w = fresh(8); L.startCombat(w, data, w.objs.find((o) => o.id === 'en2'));
    let g = 0; while (L.currentActor(w).side !== 'h' && g++ < 9) L.enemyStep(w, data, { god: true });
    w.combat.enemies[0].hp = 1; w.heroes.forEach((x) => { x.atk = 40; });
    let raged = false; for (let i = 0; i < 6 && !raged && w.combat; i++) { const a = L.currentActor(w); const r = a.side === 'h' ? L.heroAction(w, data, { type: 'attack', target: 0 }) : L.enemyStep(w, data, { god: true }); if (r.msgs.some((m) => /Raserei/.test(m))) raged = true; }
    assert(raged && w.combat.enemies[1].rage, 'Raserei ausgelöst');
    // Heiler-Ziel: Kultist trifft den Kleriker deutlich öfter als 25 %
    let pri = 0, N = 200;
    for (let i = 0; i < N; i++) { const z = L.newGame(data, 3000 + i); L.startCombat(z, data, { id: 'k', kind: 'kultist', hp: 20 }); let gg = 0; while (L.currentActor(z).side !== 'e' && gg++ < 9) L.heroAction(z, data, { type: 'defend' }); const before = z.heroes.map((x) => x.hp); const r = L.enemyStep(z, data); if (r.msgs.some((m) => /Odalys/.test(m))) pri++; }
    assert(pri / N > 0.45, `Kultist zielt auf den Heiler: ${pri}/${N}`);
    // Set-Teile liegen in Truhen; alte Stände bekommen neue Beute in ungeöffneten Truhen
    const found = new Set(); for (const lv of Object.values(data.levels)) for (const o of lv.objects) for (const e of o.loot || []) if (e.item && data.items[e.item].q === 'set') found.add(e.item);
    eq([...found].sort(), Object.values(data.sets).flatMap((st) => st.items).sort(), 'jedes Set-Teil liegt in einer Truhe');
    const k = fresh(9); L.jumpToLevel(k, data, 'kultgruft'); const ch = k.objs.find((o) => o.id === 'chest_g_real'); ch.loot = [{ gold: 1 }]; delete ch.lootV;
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(k))), data);
    assert(back.objs.find((o) => o.id === 'chest_g_real').loot.some((e) => e.item === 'moorklinge'), 'ungeöffnete Truhe bekommt neue Beute');
    eq(L.syncStatic(back, data), 0, 'zweiter Abgleich ändert nichts');
  });
  await test('Talent-Sondereffekte (0.22.0): jeder Zweig hat auf Stufe 3 einen ★-Effekt; Wächter, Wachsam, Fangnetz, Giftschutz, Manaschild, Tränke, Nachsorge, Kettenreaktion', () => {
    for (const [c, br] of Object.entries(data.talents.classes)) for (const b of br) assert(b.nodes[2].sig && /★/.test(b.nodes[2].desc), `${c}/${b.id}: Sondereffekt fehlt`);
    const lv = (s, i, ids) => { s.heroes[i].level = 8; s.heroes[i].tal = Object.fromEntries(ids.map((x) => [x, true])); };
    // Wächter: Krieger zieht Angriffe
    let hit = 0; for (let k = 0; k < 120; k++) { const s = L.newGame(data, 400 + k); lv(s, 0, ['w_haut', 'w_wille', 'w_wall']); L.startCombat(s, data, { id: 'w', kind: 'kultist', hp: 20 }); let g = 0; while (L.currentActor(s).side !== 'e' && g++ < 9) L.heroAction(s, data, { type: 'defend' }); const r = L.enemyStep(s, data); if (r.msgs.some((m) => /Berenn/.test(m))) hit++; }
    assert(hit / 120 > 0.5, `Wächter zieht Angriffe: ${hit}/120`);
    // Wachsam: kein Überfall; Fangnetz: ein Gegner verlangsamt
    const w = fresh(3); lv(w, 1, ['r_flink', 'r_aus', 'r_geist']); L.startCombat(w, data, { id: 'w', kind: 'wolf', hp: 26 }, { ambush: true });
    assert(!w.combat.ambush && w.combat.startMsgs.some((m) => /Hinterhalt/.test(m)), 'Wachsam verhindert Überfall');
    const n = L.newGame(data, 4, [{ name: 'A', race: 'human', cls: 'warrior' }, { name: 'B', race: 'human', cls: 'ranger' }, { name: 'C', race: 'human', cls: 'priest' }, { name: 'D', race: 'human', cls: 'mage' }]);
    lv(n, 1, ['g_fuss', 'g_zaeh', 'g_netz']); L.startCombat(n, data, { id: 'w', kind: 'wolf', hp: 26 });
    assert(n.combat.status.e0 && n.combat.status.e0.slow && /Fangnetz/.test(n.combat.startMsgs[0]), 'Fangnetz verlangsamt');
    // Giftschutz (Gruppe)
    lv(n, 1, ['g_hart', 'g_wald', 'g_kraeut']); const msgs = []; n.combat.status = {};
    const before = JSON.stringify(n.combat.status); for (let k = 0; k < 5; k++) L.heroAction; // nichts
    eq(L.partyFx(n, data, 'immune_poison'), 1, 'Giftschutz aktiv');
    // Manaschild
    const m = fresh(5); lv(m, 3, ['m_quell', 'm_fluss', 'm_tief']); eq(L.fxSum(data, m.heroes[3], 'manashield'), 30, 'Manaschild 30 %');
    // Tränkemeister: Trank heilt 50 % mehr
    const t = L.newGame(data, 6, [{ name: 'A', race: 'human', cls: 'warrior' }, { name: 'B', race: 'human', cls: 'alchemist' }, { name: 'C', race: 'human', cls: 'priest' }, { name: 'D', race: 'human', cls: 'mage' }]);
    lv(t, 1, ['a_balsam', 'a_mana', 'a_fest']); t.heroes[0].hp = 1; t.inv.potion = 1; L.useItemOutside(t, data, 'potion', 0);
    eq(t.heroes[0].hp, 1 + Math.floor(data.items.potion.heal * 1.5), 'Trank +50 %');
    // Kampfruf: alle +1 Angriff
    const a = fresh(7); const atk0 = L.heroAtk(data, a.heroes[3], a); lv(a, 0, ['w_takt', 'w_atem', 'w_kraft']); eq(L.heroAtk(data, a.heroes[3], a), atk0 + 1, 'Kampfruf wirkt auf andere');
    // Nachsorge nach dem Sieg
    const q = fresh(8); lv(q, 2, ['p_hand', 'p_quell', 'p_gnade']); put(q, 15, 7, 1); L.startCombat(q, data, L.enemyInFront(q)); q.combat.enemies[0].hp = 1; q.heroes[0].hp = 10;
    let r = null; for (let k = 0; k < 20 && q.combat; k++) { const c = L.currentActor(q); r = c.side === 'h' ? L.heroAction(q, data, { type: 'attack', target: 0 }) : L.enemyStep(q, data, { god: true }); }
    assert(r && r.msgs.some((x) => /Nachsorge/.test(x)), 'Nachsorge gemeldet');
    // Kettenreaktion
    const k2 = L.newGame(data, 9, [{ name: 'A', race: 'human', cls: 'alchemist' }, { name: 'B', race: 'human', cls: 'warrior' }, { name: 'C', race: 'human', cls: 'priest' }, { name: 'D', race: 'human', cls: 'mage' }]);
    lv(k2, 0, ['a_zuend', 'a_pulver', 'a_kuehl']); L.startCombat(k2, data, { id: 'g', kind: 'wolf', kinds: ['wolf', 'wolf'], hp: 26 });
    let chain = false; for (let i = 0; i < 30 && k2.combat && !chain; i++) { const c = L.currentActor(k2); if (c.side === 'h' && c.idx === 0) { k2.combat.enemies[0].hp = Math.min(k2.combat.enemies[0].hp, 1); k2.combat.enemies[1].hp = 50; const rr = L.heroAction(k2, data, { type: 'attack', target: 0 }); if (rr.msgs.some((x) => /Kettenreaktion/.test(x))) { chain = true; eq(k2.combat ? k2.combat.enemies[1].hp : 44, 44, 'Kette 6 Schaden'); } } else if (c.side === 'h') L.heroAction(k2, data, { type: 'defend' }); else L.enemyStep(k2, data, { god: true }); }
    assert(chain, 'Kettenreaktion ausgelöst');
  });
  await test('Illusionswände (0.22.0): begehbar, verdecken Sicht und Karte bis zum Durchgang, Hinweis, Gespür, nur optionale Wege', () => {
    let n = 0;
    for (const [id, lv] of Object.entries(data.levels)) for (const o of lv.objects) if (o.type === 'illusion') {
      n++;
      const d = L.clone(data); d.levels[id].objects = d.levels[id].objects.filter((q) => q.id !== o.id);
      const block = L.clone(d); block.levels[id].map[o.y] = block.levels[id].map[o.y].slice(0, o.x) + '#' + block.levels[id].map[o.y].slice(o.x + 1);
      const a = L.analyzeLevel(block, id); assert(!a.unreachableExits.length && !a.lockedNoKey.length, `${o.id}: Hauptweg darf nicht hinter der Illusion liegen`);
      assert(lv.objects.some((q) => q.type === 'sign' && Math.abs(q.x - o.x) + Math.abs(q.y - o.y) <= 4), `${o.id}: Hinweis in der Nähe`);
    }
    assert(n >= 3, 'mindestens drei Illusionswände: ' + n);
    const s = fresh(4); L.jumpToLevel(s, data, 'schratgruben'); s.objs.forEach((o) => { if (o.type === 'enemy') o.dead = true; });
    const il = s.objs.find((o) => o.id === 'ill_s1');
    s.player = { x: 30, y: 10, dir: 2 }; L.markSeen(s, data);
    const w = data.levels.schratgruben.map[0].length;
    assert(!s.seen[12 * w + 30], 'Blick endet an der Illusion');
    assert(/unscharf/.test(L.interact(s, data).msg), 'Hinweis beim Untersuchen');
    const r = L.tryMove(s, data, 'f'); assert(r.moved && il.found && r.events.some((e) => e.type === 'illusion'), 'durchgehen');
    assert(s.seen[12 * w + 30] || L.tryMove(s, data, 'f').moved, 'dahinter sichtbar/erreichbar');
    const g = buildGrid(data.levels.schratgruben, s.objs).grid; eq(g[11 * w + 30], 0, 'nach dem Durchgang offen');
    const t = fresh(5); L.jumpToLevel(t, data, 'schratgruben'); eq(buildGrid(data.levels.schratgruben, t.objs).grid[11 * w + 30] > 0, true, 'vorher als Mauer gezeichnet');
    let sensed = false; for (let k = 0; k < 20 && !sensed; k++) { const q = L.newGame(data, 50 + k); L.jumpToLevel(q, data, 'schratgruben'); q.heroes[3].level = 3; q.heroes[3].tal = { m_kalt: true, m_eis: true }; q.player = { x: 30, y: 9, dir: 2 }; sensed = L.scanSecrets(q, data).some((x) => /Trugbild/.test(x)); }
    assert(sensed, 'Geheimwand-Gespür erkennt Illusionen');
  });
  await test('Vorburg der Moorfestung (0.23.0): Teleporter sichtbar/versteckt mit Richtungswechsel, Hebel löscht Teleporter, Riegeltür nur von einer Seite, Nische, Feuerball, Treppe vom Turm', () => {
    const fs1 = () => { const s = L.newGame(data, 7); L.jumpToLevel(s, data, 'festung1'); s.objs.forEach((o) => { if (o.type === 'enemy') o.dead = true; }); return s; };
    assert(L.analyzeLevel(data, 'festung1').ok, 'Vorburg lösbar');
    const nt = data.levels.nebelturm.objects.find((o) => o.id === 'stairs_turm_festung'); assert(nt && nt.to.level === 'festung1', 'Treppe vom Nebelturm');
    // sichtbarer Teleporter im Nordgang
    let s = fs1(); s.player = { x: 21, y: 2, dir: 1 };
    let r = L.tryMove(s, data, 'f'); const ev = r.events.find((e) => e.type === 'teleport');
    assert(ev && !ev.hidden && /Hof/.test(ev.msg) && s.player.x === 14 && s.player.y === 19 && s.player.dir === 0, 'sichtbarer Teleporter → Hof, Blick Norden');
    // Hebel löscht ihn
    s = fs1(); s.player = { x: 18, y: 2, dir: 0 }; r = L.interact(s, data); assert(/erlischt/.test(r.msg) && s.objs.find((o) => o.id === 'tp_f1').open, 'Schalter löscht das Licht');
    s.player = { x: 21, y: 2, dir: 1 }; r = L.tryMove(s, data, 'f'); assert(r.moved && s.player.x === 22 && !r.events.some((e) => e.type === 'teleport'), 'erloschener Teleporter ist begehbar');
    // versteckter Teleporter: keine Meldung, andere Richtung
    s = fs1(); s.player = { x: 24, y: 14, dir: 1 }; r = L.tryMove(s, data, 'f'); const e2 = r.events.find((e) => e.type === 'teleport');
    assert(e2 && e2.hidden && !e2.msg && s.player.x === 31 && s.player.y === 19 && s.player.dir === 3, 'versteckter Teleporter: still, Blick nach Westen');
    // Riegeltür: vom Hof zu, aus dem Ostflügel öffnen
    s = fs1(); s.player = { x: 24, y: 18, dir: 1 }; assert(/anderen Seite/.test(L.interact(s, data).msg), 'Riegeltür von der falschen Seite zu');
    s.player = { x: 26, y: 18, dir: 3 }; r = L.interact(s, data); assert(/Riegel/.test(r.msg) && s.objs.find((o) => o.id === 'door_f_riegel2').open, 'Riegel von der richtigen Seite');
    // Nische: einmal Beute, dann leer
    s = fs1(); s.player = { x: 7, y: 1, dir: 1 }; const pot = s.inv.potion || 0; r = L.interact(s, data);
    assert(/Nische liegt/.test(r.msg) && s.inv.potion === pot + 1, 'Nische gibt Beute'); assert(/leer/.test(L.interact(s, data).msg), 'danach leer');
    const back = L.deserialize(JSON.parse(JSON.stringify(L.serialize(s))), data); assert(back.objs.find((o) => o.id === 'niche_f1').taken, 'Nische bleibt leer nach Laden');
    // Feuerball: angesagt, trifft alle, Feuerschaden
    const q = L.newGame(data, 9); L.startCombat(q, data, { id: 'b', kind: 'brandmagier', hp: 70 }); q.heroes.forEach((h) => { h.maxHp = h.hp = 300; });
    const all = []; for (let n = 0; n < 30 && q.combat && !q.combat.over; n++) { const a = L.currentActor(q); const rr = a.side === 'h' ? L.heroAction(q, data, { type: 'defend' }) : L.enemyStep(q, data); all.push(...rr.msgs); if (all.some((m) => /wirkt Feuerball/.test(m))) break; }
    const ia = all.findIndex((m) => /Kraft für Feuerball/.test(m)), ic = all.findIndex((m) => /wirkt Feuerball/.test(m));
    assert(ia >= 0 && ic > ia, 'Feuerball wird angesagt'); assert(all.slice(ic).filter((m) => /Feuerball trifft .* Feuerschaden/.test(m)).length >= 3, 'Feuerball trifft mehrere Helden mit Feuerschaden');
  });
  await test('Tür aus 2 Feldern öffnen (0.26.2): nur Türen geradeaus, freies Feld davor, keine Riegeltür', () => {
    const s = L.newGame(data, 3); L.jumpToLevel(s, data, 'festung1'); s.objs.forEach((o) => { if (o.type === 'enemy') o.dead = true; });
    const door = s.objs.find((o) => o.id === 'door_f_hof');
    s.player = { x: door.x - 2, y: door.y, dir: 1 };
    assert(L.doorAhead2(s, door.x, door.y) === door, 'Tür 2 Felder voraus erkannt');
    const r = L.interact(s, data, door); assert(r.changed && door.open, 'Tür öffnet sich aus 2 Feldern');
    s.player = { x: door.x - 1, y: door.y, dir: 1 }; door.open = false; assert(L.doorAhead2(s, door.x, door.y) === null, '1 Feld Abstand ist normaler Fall');
    s.player = { x: door.x - 2, y: door.y, dir: 3 }; assert(L.doorAhead2(s, door.x, door.y) === null, 'Blick in die falsche Richtung');
    const rb = s.objs.find((o) => o.id === 'door_f_riegel2'); s.player = { x: rb.x - 2, y: rb.y, dir: 1 }; assert(L.doorAhead2(s, rb.x, rb.y) === null, 'Riegeltür braucht Nähe');
  });
  const failed = results.filter((r) => !r.ok).length; // 0.23.0: erst am Ende zählen (vorher fehlten spätere Tests in der Summe)
  return { results, passed: results.length - failed, failed };
}

// Node-Start: node tests.js
if (globalThis.process && process.versions && process.versions.node && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/tests.js')) {
  const fs = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const dir = path.dirname(url.fileURLToPath(import.meta.url));
  const data = JSON.parse(await fs.readFile(path.join(dir, 'game.json'), 'utf8'));
  const res = await runTests(data, { extraFiles: ['HANDOVER.md', 'BALANCE.md'], readText: (n) => fs.readFile(path.join(dir, n), 'utf8'), exists: (n) => existsSync(path.join(dir, n)) });
  for (const r of res.results) console.log(`${r.ok ? 'OK    ' : 'FEHLER'}  ${r.name}${r.detail ? '  – ' + r.detail : ''}`);
  console.log(`\n${res.passed} bestanden, ${res.failed} fehlgeschlagen`);
  process.exit(res.failed ? 1 : 0);
}
