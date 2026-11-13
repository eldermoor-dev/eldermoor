// Die Schatten von Eldermoor – Logiktests
// Autor: eldermoor-dev
// Node:    node tests.js        (im Ordner mit game.json)
// Handy:   Einstellungen → Selbsttest (läuft dieselbe Testsuite im Browser)

import * as L from './logic.js';
import { makeTextures, Raycaster, buildGrid, buildSprites, setResolution, drawPortrait, W, H } from './render.js';

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
        assert(L.cellChar(lvl, o.x, o.y) === '.', `${id}: ${o.id} liegt nicht auf Boden`);
        if (o.type === 'door' && o.locked) assert(data.items[o.key], `${id}: ${o.id} Schlüssel ${o.key} unbekannt`);
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
    assert(r.sfx === 'chest' && s.inv.iron_key === 1 && s.inv.potion === 4 && s.gold === 32, 'Truhenbeute: ' + JSON.stringify([s.inv, s.gold]));
    assert(/leer/.test(L.interact(s, data).msg), 'zweites Öffnen leer');
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
    assert(L.SAVE_VERSION === 3 && typeof L.MIGRATIONS[1] === 'function' && typeof L.MIGRATIONS[2] === 'function', 'echte Migrationen 1→2 und 2→3 müssen vorhanden sein');
  });

  // ---- Phase 2, Schritt 1: Rassen, Berufe, Gruppe, Migration v1→v2 ----
  const CUSTOM = [
    { name: ' Gorm ', race: 'ork', cls: 'warrior' }, { name: 'Lia', race: 'elf', cls: 'ranger' },
    { name: 'Pip', race: 'gnome', cls: 'mage', row: 'front' }, { name: 'Dura', race: 'dwarf', cls: 'priest' }
  ];
  // Echter Spielstand, erzeugt mit dem Code von Version 0.1.5 (Spielstandformat 1): Berenn 30/34 LP, Position 8/3, 20 Gold, 1 Trank, Tür A offen, 1 Notiz
  const V1_SAVE = '{"format":"eldermoor-save","v":1,"savedAt":"2026-11-12T20:15:00.000Z","state":{"rng":4242,"levelId":"test1","player":{"x":8,"y":3,"dir":1},"heroes":[{"id":"h1","name":"Berenn","role":"Krieger","row":"front","maxHp":34,"atk":8,"def":5,"init":4,"ranged":false,"hp":30},{"id":"h2","name":"Sira","role":"Schurke","row":"front","maxHp":24,"atk":7,"def":3,"init":7,"ranged":false,"hp":24},{"id":"h3","name":"Odalys","role":"Priester","row":"back","maxHp":26,"atk":5,"def":3,"init":3,"ranged":false,"hp":26},{"id":"h4","name":"Ivo","role":"Magier","row":"back","maxHp":18,"atk":8,"def":1,"init":5,"ranged":true,"hp":18}],"inv":{"potion":1},"gold":20,"flags":{},"objs":[{"id":"door_a","type":"door","x":6,"y":3,"locked":false,"open":true},{"id":"chest_a","type":"chest","x":12,"y":1,"loot":[{"item":"iron_key","n":1},{"item":"potion","n":2},{"gold":12}],"open":false},{"id":"door_b","type":"door","x":12,"y":7,"locked":true,"key":"iron_key","open":false},{"id":"en1","type":"enemy","x":16,"y":7,"kind":"schrat","hp":80,"dead":false},{"id":"exit1","type":"exit","x":19,"y":7}],"seen":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"notes":[70],"combat":null,"steps":5}}';

  await test('Rassen und Berufe: Tabellen vollständig, alle 25 Kombinationen gültig', () => {
    eq(Object.keys(data.races), ['human', 'elf', 'dwarf', 'ork', 'gnome'], 'Rassen');
    eq(Object.keys(data.classes), ['warrior', 'rogue', 'priest', 'mage', 'ranger'], 'Berufe');
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
      ['Odalys', 'Priester', 'back', 26, 5, 3, 3, false], ['Ivo', 'Magier', 'back', 18, 8, 1, 5, true]];
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
    eq(g.heroes.map((h) => h.role), ['Krieger', 'Waldläufer', 'Magier', 'Priester'], 'Berufsnamen');
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

  await test('Spielstand v3: eigene Gruppe überlebt Speichern/Laden, ungültige Heldendaten werden abgelehnt', () => {
    const s = L.newGame(data, 9, CUSTOM);
    s.heroes[1].hp = 5; s.heroes[0].hp = 0;
    const save = L.serialize(s);
    eq(save.v, 3, 'Version');
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

  await test('Migration v1→v2→v3: echter Spielstand aus Version 0.1.5 lädt, nichts geht verloren', () => {
    const v1 = JSON.parse(V1_SAVE);
    eq(v1.v, 1, 'Fixture ist v1');
    assert(!('race' in v1.state.heroes[0]), 'Fixture darf noch keine Rasse haben');
    const st = L.deserialize(V1_SAVE, data);
    st.heroes.forEach((h, i) => {
      const o = v1.state.heroes[i];
      for (const k of Object.keys(o)) eq(h[k], o[k], `Held ${i + 1}.${k} geändert`);
      eq([h.race, h.look, h.level, h.xp], ['human', i * 7 + 3, 1, 0], `Held ${i + 1}: neue Felder`);
      const dv = L.deriveStats(data, h.race, h.cls);
      eq([h.maxHp, h.atk, h.def, h.init], [dv.maxHp, dv.atk, dv.def, dv.init], `Held ${i + 1}: Werte = Mensch + Beruf`);
    });
    eq(st.heroes.map((h) => h.cls), ['warrior', 'rogue', 'priest', 'mage'], 'Berufe');
    eq(st.heroes[0].hp, 30, 'LP erhalten');
    const rest = (x) => JSON.stringify({ ...x, heroes: 0, combat: 0 });
    assert(rest(st) === rest(v1.state), 'übriger Zustand (Position, Gold, Inventar, Objekte, Karte, Notizen, Zufall) unverändert');
    const obj = JSON.parse(V1_SAVE); L.deserialize(obj, data);
    assert(obj.v === 1 && !('race' in obj.state.heroes[0]), 'Eingabe wird nicht verändert');
    assert(L.tryMove(st, data, 'f').moved, 'Spiel läuft weiter');
    const again = L.serialize(st);
    eq(again.v, 3, 'neu gespeichert als v3');
    eq(L.deserialize(JSON.stringify(again), data).player, st.player, 'erneut ladbar');
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
    eq(pr.maxLevel, 10, 'Höchststufe');
    eq(pr.xp.length, 9, 'Schwellen für Stufe 2 bis 10');
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
    let threw = false; try { L.deriveStats(data, 'human', 'warrior', 11); } catch { threw = true; }
    assert(threw, 'Stufe 11 abgelehnt');
    threw = false; try { L.deriveStats(data, 'human', 'warrior', 1.5); } catch { threw = true; }
    assert(threw, 'Stufe 1,5 abgelehnt');
  });

  await test('Erfahrung: Schwellen, Aufstieg, LP-Zuwachs, Bewusstlose gehen leer aus, Höchststufe begrenzt', () => {
    eq([0, 99, 100, 249, 250, 3199, 3200, 99999].map((x) => L.levelForXp(data, x)), [1, 1, 2, 2, 3, 9, 10, 10], 'levelForXp');
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
    eq([s.heroes[0].level, s.heroes[0].xp], [10, 3200], 'Höchststufe 10, EP gedeckelt');
    const st10 = L.deriveStats(data, b.race, b.cls, 10);
    eq(s.heroes[0].maxHp, st10.maxHp, 'Stufe-10-Werte');
    eq(L.xpForNext(data, s.heroes[0]), null, 'keine nächste Stufe');
    eq(L.xpForNext(data, s.heroes[1]), null, 'auch Sira auf Stufe 10');
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
    bad((h) => { h.level = 11; }, /Stufe ungültig/);
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
      for (const v of t.data) assert(v < 64 || (allowTransparent && v === 255), `${name}: ungültiger Palettenindex ${v}`);
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
      assert(colors.size > 12 && colors.size <= 64, `${q}: Farbanzahl ${colors.size} (erwartet 13..64, feste Palette)`);
    }
    return 'Renderzeit in Node (nur Orientierung, nicht Gerät): ' + info.join(', ');
  });

  await test('Grafik: Scharf-Modus (960×540, Texturen 128) rendert ohne Fehler', () => {
    const prevRes = W / 480; // aktuelle Auflösung merken (das laufende Spiel nutzt dieselbe Moduleinstellung)
    setResolution(2);
    try {
      const tex = makeTextures(2);
      assert(W === 960 && H === 540, 'Auflösung');
      assert(tex.wall[1].w === 128 && tex.sprites.schrat.w === 160, 'Texturgrößen');
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

  const failed = results.filter((r) => !r.ok).length;
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
