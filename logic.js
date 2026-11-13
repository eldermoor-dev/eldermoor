// Die Schatten von Eldermoor – Spiellogik (ohne DOM, in Node testbar)
// Autor: eldermoor-dev

export const SAVE_VERSION = 1;
export const SAVE_FORMAT = 'eldermoor-save';
export const DIRS = [
  { dx: 0, dy: -1 }, // 0 Norden
  { dx: 1, dy: 0 },  // 1 Osten
  { dx: 0, dy: 1 },  // 2 Süden
  { dx: -1, dy: 0 }  // 3 Westen
];
export const DIR_NAMES = ['Norden', 'Osten', 'Süden', 'Westen'];

export const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- Zufall (Zustand liegt im Spielstand, damit Laden reproduzierbar ist) ----------
export function rand(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function randInt(state, a, b) {
  return a + Math.floor(rand(state) * (b - a + 1));
}

// ---------- Level-Helfer ----------
export function getLevel(data, state) { return data.levels[state.levelId]; }
export function cellChar(lvl, x, y) {
  const r = lvl.map[y];
  if (!r || x < 0 || x >= r.length) return '#';
  return r[x];
}
export const isWallChar = (c) => c !== '.';

export function newGame(data, seed = 20260101) {
  const lvl = data.levels[data.startLevel];
  const objs = lvl.objects.map((o) => {
    const c = clone(o);
    if (o.type === 'door') c.open = false;
    if (o.type === 'chest') c.open = false;
    if (o.type === 'enemy') { c.hp = data.enemies[o.kind].hp; c.dead = false; }
    return c;
  });
  const w = lvl.map[0].length, h = lvl.map.length;
  const state = {
    rng: seed >>> 0,
    levelId: data.startLevel,
    player: { x: lvl.start.x, y: lvl.start.y, dir: lvl.start.dir },
    heroes: data.heroes.map((h2) => ({ ...clone(h2), hp: h2.maxHp })),
    inv: clone(data.startInv),
    gold: data.startGold,
    flags: {},
    objs,
    seen: new Array(w * h).fill(0),
    notes: [],
    combat: null,
    steps: 0
  };
  markSeen(state, data);
  return state;
}

export function blockerAt(state, x, y) {
  for (const o of state.objs) {
    if (o.x !== x || o.y !== y) continue;
    if (o.type === 'door' && !o.open) return o;
    if (o.type === 'chest') return o;
    if (o.type === 'enemy' && !o.dead) return o;
  }
  return null;
}

export function frontCell(state) {
  const p = state.player;
  return { x: p.x + DIRS[p.dir].dx, y: p.y + DIRS[p.dir].dy };
}
export function enemyInFront(state) {
  const f = frontCell(state);
  const b = blockerAt(state, f.x, f.y);
  return b && b.type === 'enemy' ? b : null;
}

export function markSeen(state, data) {
  const lvl = getLevel(data, state);
  const w = lvl.map[0].length, h = lvl.map.length;
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) state.seen[y * w + x] = 1; };
  const { x, y, dir } = state.player;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy);
  let cx = x, cy = y;
  for (let i = 0; i < 14; i++) {
    cx += DIRS[dir].dx; cy += DIRS[dir].dy;
    set(cx, cy);
    if (isWallChar(cellChar(lvl, cx, cy))) break;
    const b = blockerAt(state, cx, cy);
    if (b && b.type === 'door') break;
  }
}

// ---------- Bewegung ----------
function blockedText(b) {
  if (b.type === 'door') return b.locked ? 'Die Tür ist verschlossen.' : 'Die Tür ist geschlossen.';
  if (b.type === 'chest') return 'Eine Truhe versperrt den Weg.';
  return 'Ein Gegner steht im Weg.';
}

// rel: 'f' vor, 'b' zurück, 'l' seitwärts links, 'r' seitwärts rechts
export function tryMove(state, data, rel) {
  const lvl = getLevel(data, state);
  const p = state.player;
  const d = rel === 'f' ? p.dir : rel === 'b' ? (p.dir + 2) % 4 : rel === 'l' ? (p.dir + 3) % 4 : (p.dir + 1) % 4;
  const nx = p.x + DIRS[d].dx, ny = p.y + DIRS[d].dy;
  if (isWallChar(cellChar(lvl, nx, ny))) return { moved: false, wall: true };
  const b = blockerAt(state, nx, ny);
  if (b) {
    if (b.type === 'enemy' && rel === 'f') return { moved: false, encounter: b };
    return { moved: false, msg: blockedText(b) };
  }
  p.x = nx; p.y = ny;
  state.steps++;
  markSeen(state, data);
  const res = { moved: true, events: [] };
  const ex = state.objs.find((o) => o.type === 'exit' && o.x === nx && o.y === ny);
  if (ex && !state.flags[ex.id]) {
    state.flags[ex.id] = true;
    res.events.push({ type: 'exit', id: ex.id });
  }
  res.encounter = enemyInFront(state);
  return res;
}

export function turn(state, data, delta) {
  state.player.dir = (state.player.dir + delta + 4) % 4;
  markSeen(state, data);
  return { encounter: enemyInFront(state) };
}

// ---------- Interaktion ----------
function addLoot(state, data, loot) {
  const parts = [];
  for (const e of loot || []) {
    if (e.gold) { state.gold += e.gold; parts.push(`${e.gold} Gold`); continue; }
    const it = data.items[e.item];
    const n = e.n || 1;
    if (it.kind === 'quest') state.inv[e.item] = 1; // Questgegenstände nie mehrfach, nie verbrauchbar
    else state.inv[e.item] = (state.inv[e.item] || 0) + n;
    parts.push(it.kind === 'quest' ? it.name : `${n}× ${it.name}`);
  }
  return parts.join(', ');
}

export function interact(state, data) {
  const f = frontCell(state);
  const o = blockerAt(state, f.x, f.y);
  if (!o) {
    const p = state.player, f2 = { x: f.x + DIRS[p.dir].dx, y: f.y + DIRS[p.dir].dy };
    const b2 = blockerAt(state, f2.x, f2.y);
    if (b2 && cellChar(getLevel(data, state), f.x, f.y) === '.') return { msg: 'Geh näher heran.' };
    return { msg: 'Hier gibt es nichts zu tun.' };
  }
  if (o.type === 'enemy') return { encounter: o };
  if (o.type === 'door') {
    if (o.locked) {
      if ((state.inv[o.key] || 0) > 0) {
        o.locked = false; o.open = true;
        return { msg: 'Der Schlüssel dreht sich im Schloss. Die Tür schwingt auf.', sfx: 'unlock', changed: true };
      }
      return { msg: 'Die Tür ist verschlossen. Das Schloss ist aus Eisen.', sfx: 'bump' };
    }
    o.open = true;
    return { msg: 'Die Tür öffnet sich knarrend.', sfx: 'door', changed: true };
  }
  if (o.type === 'chest') {
    if (o.open) return { msg: 'Die Truhe ist leer.' };
    o.open = true;
    const txt = addLoot(state, data, o.loot);
    return { msg: `Truhe geöffnet: ${txt}.`, sfx: 'chest', changed: true };
  }
  return { msg: 'Hier gibt es nichts zu tun.' };
}

export function useItemOutside(state, data, itemId, heroIdx) {
  const it = data.items[itemId];
  const h = state.heroes[heroIdx];
  if (!it || it.kind !== 'consumable' || !(state.inv[itemId] > 0)) return { error: 'no-item' };
  if (!h || h.hp <= 0) return { error: 'bad-target' };
  if (h.hp >= h.maxHp) return { error: 'full-hp' };
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + it.heal);
  state.inv[itemId]--;
  return { msg: `${h.name} erhält ${h.hp - before} LP zurück.`, sfx: 'heal' };
}

// ---------- Kampf ----------
const combatAlive = (state, e) => e.side === 'h' ? state.heroes[e.idx].hp > 0 : state.combat.enemies[e.idx].hp > 0;

function buildOrder(state, data) {
  const c = state.combat;
  const list = [];
  state.heroes.forEach((h, i) => { if (h.hp > 0) list.push({ side: 'h', idx: i, key: h.init + rand(state) * 4 + 0.5 }); });
  c.enemies.forEach((e, i) => { if (e.hp > 0) list.push({ side: 'e', idx: i, key: data.enemies[e.kind].init + rand(state) * 4 }); });
  list.sort((a, b) => b.key - a.key);
  c.order = list.map(({ side, idx }) => ({ side, idx }));
  c.pos = 0;
}

function normalizeTurn(state, data) {
  const c = state.combat;
  for (let guard = 0; guard < 20; guard++) {
    while (c.pos < c.order.length && !combatAlive(state, c.order[c.pos])) c.pos++;
    if (c.pos < c.order.length) break;
    c.round++;
    buildOrder(state, data);
  }
  const a = c.order[c.pos];
  if (a && a.side === 'h') delete c.defending[a.idx];
}

export function startCombat(state, data, enemyObj) {
  const en = data.enemies[enemyObj.kind];
  state.combat = {
    enemies: [{ objId: enemyObj.id, kind: enemyObj.kind, name: en.name, hp: enemyObj.hp, maxHp: en.hp }],
    order: [], pos: 0, round: 1, defending: {}, over: null
  };
  buildOrder(state, data);
  normalizeTurn(state, data);
  return state.combat;
}

export function currentActor(state) {
  const c = state.combat;
  return c && !c.over ? c.order[c.pos] : null;
}

// Trefferchance 90 %, Schaden = Angriff + 0..2 − Verteidigung/2 (min. 1)
export function calcDamage(state, atk, def, opts = {}) {
  if (rand(state) >= 0.9) return 0;
  let d = Math.max(1, atk + randInt(state, 0, 2) - Math.floor(def / 2));
  if (opts.backMelee) d = Math.ceil(d / 2);
  if (opts.defending) d = Math.max(1, Math.floor(d / 2));
  return d;
}

function advance(state, data) {
  state.combat.pos++;
  normalizeTurn(state, data);
}

function finishVictory(state, data, msgs) {
  const c = state.combat;
  let gold = 0;
  for (const e of c.enemies) {
    gold += data.enemies[e.kind].gold;
    const obj = state.objs.find((o) => o.id === e.objId);
    if (obj) { obj.dead = true; obj.hp = 0; }
  }
  state.gold += gold;
  msgs.push(`Sieg! Beute: ${gold} Gold.`);
  state.combat = null;
  return gold;
}

export function heroAction(state, data, act) {
  const c = state.combat;
  if (!c || c.over) return { error: 'no-combat' };
  const a = currentActor(state);
  if (!a || a.side !== 'h') return { error: 'not-hero-turn' };
  const h = state.heroes[a.idx];
  const msgs = [];
  let sfx = null;
  if (act.type === 'attack') {
    let ti = act.target;
    if (ti == null || !c.enemies[ti] || c.enemies[ti].hp <= 0) ti = c.enemies.findIndex((e) => e.hp > 0);
    const e = c.enemies[ti];
    const d = calcDamage(state, h.atk, data.enemies[e.kind].def, { backMelee: h.row === 'back' && !h.ranged });
    if (d === 0) { msgs.push(`${h.name} verfehlt ${e.name}.`); sfx = 'miss'; }
    else {
      e.hp = Math.max(0, e.hp - d);
      const note = h.row === 'back' && !h.ranged ? ' (Hinterreihe, Nahkampf: halber Schaden)' : '';
      msgs.push(`${h.name} trifft ${e.name} für ${d} Schaden${note}.`);
      sfx = 'hit';
      if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`);
    }
  } else if (act.type === 'defend') {
    c.defending[a.idx] = true;
    msgs.push(`${h.name} geht in Deckung.`);
    sfx = 'defend';
  } else if (act.type === 'item') {
    const r = useItemOutside(state, data, act.item || 'potion', act.hero);
    if (r.error) return r;
    msgs.push(r.msg);
    sfx = 'heal';
  } else {
    return { error: 'not-available' };
  }
  let over = null;
  if (c.enemies.every((e) => e.hp <= 0)) {
    const gold = finishVictory(state, data, msgs);
    return { msgs, sfx, over: 'victory', gold };
  }
  advance(state, data);
  return { msgs, sfx, over };
}

export function enemyStep(state, data, opts = {}) {
  const c = state.combat;
  if (!c || c.over) return { error: 'no-combat' };
  const a = currentActor(state);
  if (!a || a.side !== 'e') return { error: 'not-enemy-turn' };
  const e = c.enemies[a.idx];
  const en = data.enemies[e.kind];
  const msgs = [];
  const front = [], back = [];
  state.heroes.forEach((h, i) => { if (h.hp > 0) (h.row === 'front' ? front : back).push(i); });
  const pool = front.length && (rand(state) < 0.75 || !back.length) ? front : (back.length ? back : front);
  const ti = pool[randInt(state, 0, pool.length - 1)];
  const t = state.heroes[ti];
  const d = calcDamage(state, en.atk, t.def, { defending: !!c.defending[ti] });
  let sfx = 'miss';
  const why = `${t.row === 'front' ? 'Vorderreihe' : 'Hinterreihe'}${c.defending[ti] ? ', in Deckung: halber Schaden' : ''}`;
  if (d === 0) msgs.push(`${e.name} greift ${t.name} an (${why}) und verfehlt.`);
  else if (opts.god) { msgs.push(`${e.name} trifft ${t.name}, doch Debug-Unverwundbarkeit hält.`); sfx = 'hurt'; }
  else {
    t.hp = Math.max(0, t.hp - d);
    msgs.push(`${e.name} trifft ${t.name} für ${d} Schaden (${why}).`);
    sfx = 'hurt';
    if (t.hp === 0) msgs.push(`${t.name} sinkt bewusstlos zu Boden.`);
  }
  if (state.heroes.every((h) => h.hp <= 0)) {
    c.over = 'defeat';
    msgs.push('Die Gruppe ist gefallen.');
    return { msgs, sfx, over: 'defeat' };
  }
  advance(state, data);
  return { msgs, sfx, over: null };
}

// Preis der Niederlage: zurück zum Eingang, halbe LP, 25 % Gold weg, Gegner erholt sich
export function applyDefeat(state, data) {
  const lvl = getLevel(data, state);
  state.player = { x: lvl.start.x, y: lvl.start.y, dir: lvl.start.dir };
  state.heroes.forEach((h) => { h.hp = Math.max(1, Math.ceil(h.maxHp / 2)); });
  const loss = Math.floor(state.gold * 0.25);
  state.gold -= loss;
  if (state.combat) {
    for (const e of state.combat.enemies) {
      const obj = state.objs.find((o) => o.id === e.objId);
      if (obj && !obj.dead) obj.hp = data.enemies[obj.kind].hp;
    }
  }
  state.combat = null;
  markSeen(state, data);
  return { loss };
}

// ---------- Speichern / Laden ----------
export const MIGRATIONS = {}; // MIGRATIONS[n]: Spielstand Version n -> n+1 (noch leer, weil es erst Version 1 gibt)

export function serialize(state) {
  return { format: SAVE_FORMAT, v: SAVE_VERSION, savedAt: new Date().toISOString(), state: clone(state) };
}

export function migrate(save, migrations = MIGRATIONS, target = SAVE_VERSION) {
  let s = save;
  while (s.v < target) {
    const m = migrations[s.v];
    if (!m) throw new Error(`Keine Migration von Version ${s.v}`);
    const next = m(s);
    if (!next || !(next.v > s.v)) throw new Error('Migration hat die Version nicht erhöht');
    s = next;
  }
  return s;
}

export function validateState(state, data) {
  const err = [];
  const lvl = state && data.levels[state.levelId];
  if (!lvl) return ['Unbekanntes Gebiet'];
  const w = lvl.map[0].length, h = lvl.map.length;
  const p = state.player;
  if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !Number.isInteger(p.dir) || p.dir < 0 || p.dir > 3) err.push('Spielerposition ungültig');
  else if (isWallChar(cellChar(lvl, p.x, p.y))) err.push('Spieler steht in einer Wand');
  if (!Array.isArray(state.heroes) || state.heroes.length !== 4) err.push('Gruppe ungültig');
  else state.heroes.forEach((hh, i) => {
    if (typeof hh.hp !== 'number' || hh.hp < 0 || hh.hp > hh.maxHp) err.push(`Held ${i + 1}: LP ungültig`);
  });
  if (!state.inv || typeof state.inv !== 'object') err.push('Inventar ungültig');
  else for (const [k, v] of Object.entries(state.inv)) if (!data.items[k] || !Number.isInteger(v) || v < 0) err.push(`Inventar: ${k} ungültig`);
  if (!Number.isInteger(state.gold) || state.gold < 0) err.push('Gold ungültig');
  if (!Array.isArray(state.objs)) err.push('Objekte ungültig');
  if (!Array.isArray(state.seen) || state.seen.length !== w * h) err.push('Karte ungültig');
  if (!Number.isInteger(state.rng)) err.push('Zufallszustand ungültig');
  return err;
}

export function deserialize(input, data, migrations = MIGRATIONS) {
  let save = input;
  if (typeof input === 'string') {
    try { save = JSON.parse(input); } catch { throw new Error('Datei ist kein gültiges JSON'); }
  }
  if (!save || save.format !== SAVE_FORMAT || !Number.isInteger(save.v) || save.v < 1) throw new Error('Keine Eldermoor-Spielstanddatei');
  if (save.v > SAVE_VERSION) throw new Error('Spielstand stammt aus einer neueren Version – bitte Spiel aktualisieren');
  const m = migrate(save, migrations);
  const errors = validateState(m.state, data);
  if (errors.length) throw new Error('Spielstand ungültig: ' + errors.join('; '));
  m.state.combat = null; // Kämpfe werden nie mitten im Kampf gespeichert/geladen
  return m.state;
}

// ---------- Level-Analyse (Softlock-Prüfung) ----------
export function analyzeLevel(data, levelId) {
  const lvl = data.levels[levelId];
  const doors = lvl.objects.filter((o) => o.type === 'door');
  const chests = lvl.objects.filter((o) => o.type === 'chest');
  const exits = lvl.objects.filter((o) => o.type === 'exit');
  const have = new Set();
  const opened = new Set();
  const bfs = () => {
    const seen = new Set([`${lvl.start.x},${lvl.start.y}`]);
    const q = [[lvl.start.x, lvl.start.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy, k = `${nx},${ny}`;
        if (seen.has(k) || cellChar(lvl, nx, ny) !== '.') continue;
        const door = doors.find((o) => o.x === nx && o.y === ny);
        if (door && door.locked && !have.has(door.key)) continue;
        if (chests.some((o) => o.x === nx && o.y === ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const reach = bfs();
    for (const c of chests) {
      if (opened.has(c.id)) continue;
      if (DIRS.some((d) => reach.has(`${c.x + d.dx},${c.y + d.dy}`))) {
        opened.add(c.id); changed = true;
        for (const e of c.loot || []) if (e.item && data.items[e.item].kind === 'quest') have.add(e.item);
      }
    }
  }
  const reach = bfs();
  const unreachableExits = exits.filter((o) => !reach.has(`${o.x},${o.y}`)).map((o) => o.id);
  const unreachableChests = chests.filter((c) => !opened.has(c.id)).map((c) => c.id);
  const lockedNoKey = doors.filter((d) => d.locked && !have.has(d.key)).map((d) => d.id);
  return {
    ok: exits.length > 0 && !unreachableExits.length && !unreachableChests.length && !lockedNoKey.length,
    reachable: reach.size, unreachableExits, unreachableChests, lockedNoKey, keys: [...have]
  };
}
