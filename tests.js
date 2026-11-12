// Die Schatten von Eldermoor – Logiktests
// Autor: eldermoor-dev
// Node:    node tests.js        (im Ordner mit game.json)
// Handy:   Einstellungen → Selbsttest (läuft dieselbe Testsuite im Browser)

import * as L from './logic.js';
import { makeTextures, Raycaster, buildGrid, buildSprites, W, H } from './render.js';

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

  await test('Migration: Kette v1→v2, fehlende Migration wird gemeldet', () => {
    const save = L.serialize(fresh());
    const mig = { 1: (x) => ({ ...x, v: 2, state: { ...x.state, neuesFeld: 1 } }) };
    const m = L.migrate(save, mig, 2);
    assert(m.v === 2 && m.state.neuesFeld === 1, 'v2');
    let threw = false; try { L.migrate(save, {}, 2); } catch { threw = true; }
    assert(threw, 'ohne Migration');
    threw = false; try { L.migrate(save, { 1: (x) => x }, 2); } catch { threw = true; }
    assert(threw, 'Migration ohne Versionssprung');
  });

  await test('Grafik: Texturen gültig, Renderer füllt jedes Pixel (3 Qualitätsstufen)', () => {
    const tex = makeTextures();
    const chk = (t, name, allowTransparent) => {
      assert(t.w === 64 && t.h === 64 && t.data.length === 4096, `${name}: Größe`);
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
  const res = await runTests(data, { extraFiles: ['HANDOVER.md'], readText: (n) => fs.readFile(path.join(dir, n), 'utf8'), exists: (n) => existsSync(path.join(dir, n)) });
  for (const r of res.results) console.log(`${r.ok ? 'OK    ' : 'FEHLER'}  ${r.name}${r.detail ? '  – ' + r.detail : ''}`);
  console.log(`\n${res.passed} bestanden, ${res.failed} fehlgeschlagen`);
  process.exit(res.failed ? 1 : 0);
}
