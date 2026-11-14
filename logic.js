// Die Schatten von Eldermoor – Spiellogik (ohne DOM, in Node testbar)
// Autor: eldermoor-dev

export const SAVE_VERSION = 6;
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

// ---------- Helden: Rasse + Beruf (Werte stehen in game.json → races, classes) ----------
export const NAME_MAX = 12;       // längster Name im Editor
const NAME_MAX_LOAD = 24;         // beim Laden großzügiger, damit spätere Änderungen alte Stände nicht ungültig machen
export const PARTY_SIZE = 4;
export const STAT_KEYS = ['maxHp', 'atk', 'def', 'init'];
const STAT_MIN = { maxHp: 1, atk: 1, def: 0, init: 0 };
const has = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const BAD_NAME_CHARS = /[\u0000-\u001f\u007f]/;

// ---------- Stufen und Erfahrung ----------
export const maxLevel = (data) => (data.progression && data.progression.maxLevel) || 1;
// Erfahrung (kumulativ), die für Stufe n+2 nötig ist, steht in data.progression.xp[n]
export function levelForXp(data, xp) {
  const t = (data.progression && data.progression.xp) || [];
  let lvl = 1;
  while (lvl < maxLevel(data) && lvl - 1 < t.length && xp >= t[lvl - 1]) lvl++;
  return lvl;
}
export function xpForNext(data, hero) {
  const t = (data.progression && data.progression.xp) || [];
  return hero.level >= maxLevel(data) ? null : t[hero.level - 1];
}

// Kampfwerte = Berufswerte + Rassenmodifikator + Wachstum je Stufe, nach unten begrenzt.
// Wachstum: classes.<id>.growth in Zehnteln pro Stufe (ganzzahlig, damit nichts durch Rundung abweicht):
// Zuwachs = floor((Stufe − 1) × Zehntel / 10). Stufe 1 ergibt exakt die alten Werte.
export function deriveStats(data, race, cls, level = 1) {
  if (!has(data.races, race)) throw new Error(`Unbekannte Rasse: ${race}`);
  if (!has(data.classes, cls)) throw new Error(`Unbekannter Beruf: ${cls}`);
  if (!Number.isInteger(level) || level < 1 || level > maxLevel(data)) throw new Error(`Ungültige Stufe: ${level}`);
  const r = data.races[race], c = data.classes[cls];
  const out = {};
  for (const k of STAT_KEYS) {
    const g = (c.growth && c.growth[k]) || 0;
    out[k] = Math.max(STAT_MIN[k], c.base[k] + ((r.mods && r.mods[k]) || 0) + Math.floor(((level - 1) * g) / 10));
  }
  return out;
}

// Ressource (Mana/Ausdauer): classes.<id>.res = { name, base, growth (Zehntel je Stufe) }; Rassen ändern sie nicht.
export function deriveMp(data, cls, level = 1) {
  const r = data.classes[cls] && data.classes[cls].res;
  if (!r) return 0;
  return Math.max(0, r.base + Math.floor(((level - 1) * (r.growth || 0)) / 10));
}
export const MP_REGEN = 1; // Angriff oder Verteidigen schenkt so viele Punkte zurück

// Verteilt Erfahrung an alle nicht bewusstlosen Helden; Stufenaufstieg erhöht Werte, LP steigen um den Zuwachs der Max-LP.
// Bewusstlose (LP 0) gehen leer aus. Rückgabe: Liste der Aufstiege.
export function grantXp(state, data, amount, msgs = []) {
  const ups = [];
  const t = (data.progression && data.progression.xp) || [];
  const cap = t.length ? t[Math.min(maxLevel(data) - 1, t.length) - 1] : Infinity; // bei Höchststufe wird nicht weitergezählt
  if (!(amount > 0)) return ups;
  for (const h of state.heroes) {
    if (h.hp <= 0) continue;
    h.xp = Math.min(cap, h.xp + amount);
    const to = levelForXp(data, h.xp);
    if (to > h.level) {
      const st = deriveStats(data, h.race, h.cls, to);
      const dHp = Math.max(0, st.maxHp - h.maxHp);
      h.level = to;
      for (const k of STAT_KEYS) h[k] = st[k];
      h.hp = Math.min(h.maxHp, h.hp + dHp);
      const nMp = deriveMp(data, h.cls, to), dMp = Math.max(0, nMp - h.maxMp);
      h.maxMp = nMp; h.mp = Math.min(nMp, h.mp + dMp);
      ups.push({ hero: h.name, level: to });
      msgs.push(`${h.name} steigt auf Stufe ${to} auf!`);
    }
  }
  return ups;
}

// spec: { name, race, cls, row? (Standard: Reihe des Berufs), look? (Porträt-Startwert) }
export function validateParty(data, specs) {
  if (!Array.isArray(specs) || specs.length !== PARTY_SIZE) return [`Die Gruppe braucht genau ${PARTY_SIZE} Helden`];
  const err = [];
  const names = new Set();
  specs.forEach((s, i) => {
    const n = `Held ${i + 1}`;
    if (!s || typeof s !== 'object') { err.push(`${n}: ungültig`); return; }
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (!name) err.push(`${n}: Name fehlt`);
    else if (name.length > NAME_MAX) err.push(`${n}: Name länger als ${NAME_MAX} Zeichen`);
    else if (BAD_NAME_CHARS.test(name)) err.push(`${n}: Name enthält Steuerzeichen`);
    else {
      const key = name.toLowerCase();
      if (names.has(key)) err.push(`${n}: Name „${name}“ ist doppelt`);
      names.add(key);
    }
    if (!has(data.races, s.race)) err.push(`${n}: Rasse unbekannt`);
    if (!has(data.classes, s.cls)) err.push(`${n}: Beruf unbekannt`);
    if (s.row != null && s.row !== 'front' && s.row !== 'back') err.push(`${n}: Reihe ungültig`);
  });
  return err;
}

export function createHero(data, spec, index) {
  const c = data.classes[spec.cls];
  const st = deriveStats(data, spec.race, spec.cls);
  return {
    id: 'h' + (index + 1), name: spec.name.trim(), race: spec.race, cls: spec.cls, role: c.name, level: 1, xp: 0,
    row: spec.row || c.row, maxHp: st.maxHp, atk: st.atk, def: st.def, init: st.init, ranged: !!c.ranged,
    look: Number.isInteger(spec.look) ? spec.look : index * 7 + 3, hp: st.maxHp,
    maxMp: deriveMp(data, spec.cls, 1), mp: deriveMp(data, spec.cls, 1)
  };
}

// Würfelt Rasse und Beruf für vier Helden (rand: Funktion 0 ≤ x < 1, für Tests austauschbar).
// Mindestens ein Held steht vorn (sonst wäre die Vorderreihe leer): Held 1 wird dann auf einen Vorderreihen-Beruf gesetzt.
export function randomParty(data, names, rand = Math.random) {
  const races = Object.keys(data.races), classes = Object.keys(data.classes);
  const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
  const out = names.slice(0, PARTY_SIZE).map((name) => {
    const cls = pick(classes);
    return { name, race: pick(races), cls, row: data.classes[cls].row };
  });
  if (!out.some((h) => h.row === 'front')) {
    const front = classes.find((c) => data.classes[c].row === 'front');
    if (front && out.length) { out[0].cls = front; out[0].row = 'front'; }
  }
  return out;
}

export function buildParty(data, specs = data.quickParty) {
  const err = validateParty(data, specs);
  if (err.length) throw new Error('Gruppe ungültig: ' + err.join('; '));
  return specs.map((s, i) => createHero(data, s, i));
}

// Frischer Zustand eines Gebiets (Objekte, Erkundung, Notizen)
function freshObj(data, o) {
  const c = clone(o);
  if (o.type === 'door') c.open = false;
  if (o.type === 'chest') c.open = false;
  if (o.type === 'enemy') { c.hp = data.enemies[o.kind].hp; c.dead = false; }
  return c;
}
function freshArea(data, levelId) {
  const lvl = data.levels[levelId];
  const objs = lvl.objects.map((o) => freshObj(data, o));
  return { objs, seen: new Array(lvl.map[0].length * lvl.map.length).fill(0), notes: [] };
}

export function newGame(data, seed = 20260101, party = null) {
  const lvl = data.levels[data.startLevel];
  const a = freshArea(data, data.startLevel);
  const state = {
    rng: seed >>> 0,
    levelId: data.startLevel,
    player: { x: lvl.start.x, y: lvl.start.y, dir: lvl.start.dir },
    heroes: buildParty(data, party || data.quickParty),
    inv: clone(data.startInv),
    gold: data.startGold,
    flags: {},
    objs: a.objs,
    seen: a.seen,
    notes: a.notes,
    gear: {}, // erzeugte Ausrüstung: { uid: Gegenstandsdefinition }, liegt mit Anzahl 1 in inv[uid]
    uid: 0,
    areas: {}, // besuchte, aktuell nicht aktive Gebiete: { id: { objs, seen, notes } }
    combat: null,
    steps: 0
  };
  markSeen(state, data);
  return state;
}

// Gebietswechsel über ein Treppen-Objekt (type 'stairs', to: {level, x, y, dir}) im aktuellen Gebiet
export function changeArea(state, data, stairsId) {
  const st = state.objs.find((o) => o.id === stairsId && o.type === 'stairs');
  if (!st || !st.to) return { ok: false, msg: 'Hier führt nichts weiter.' };
  const to = st.to, target = data.levels[to.level];
  if (!target) return { ok: false, msg: 'Das Ziel ist unbekannt.' };
  if (cellChar(target, to.x, to.y) !== '.') return { ok: false, msg: 'Der Weg ist versperrt.' };
  state.areas = state.areas || {};
  state.areas[state.levelId] = { objs: state.objs, seen: state.seen, notes: state.notes };
  const a = state.areas[to.level] || freshArea(data, to.level);
  delete state.areas[to.level];
  state.levelId = to.level;
  state.objs = a.objs; state.seen = a.seen; state.notes = a.notes || [];
  state.player = { x: to.x, y: to.y, dir: to.dir };
  markSeen(state, data);
  return { ok: true, msg: st.msg || `Du erreichst: ${target.name}.`, levelName: target.name };
}

export function blockerAt(state, x, y) {
  for (const o of state.objs) {
    if (o.x !== x || o.y !== y) continue;
    if (o.type === 'door' && !o.open) return o;
    if (o.type === 'chest') return o;
    if (o.type === 'merchant' || o.type === 'sign') return o;
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
  if (b.type === 'merchant') return 'Der Stand der Händlerin versperrt den Weg.';
  if (b.type === 'sign') return 'Eine Hinweistafel steht im Weg.';
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
  const stairs = state.objs.find((o) => o.type === 'stairs' && o.x === nx && o.y === ny);
  if (stairs) { res.events.push({ type: 'stairs', id: stairs.id }); return res; }
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
    if (e.gear) {
      const inst = rollGear(state, data, e.gear);
      if (inst) { addGear(state, data, inst); const q = data.quality.find((x) => x.id === inst.q); parts.push(`${inst.name}${inst.q !== 'common' ? ` [${q.name}]` : ''}`); }
      continue;
    }
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
  if (o.type === 'sign') return { msg: o.text, sfx: 'ui', long: true };
  if (o.type === 'merchant') {
    const r = { shop: o.shop, merchant: o.id };
    if (o.talk && !state.flags[o.talk.flag]) { state.flags[o.talk.flag] = true; r.msg = o.talk.text; r.changed = true; }
    return r;
  }
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

// ---------- Zauber (Schritt 5c) ----------
// Bekannte Zauber eines Helden: die Berufsfähigkeit (ab Stufe 1) plus data.spells nach classes.<id>.spells[{id, level}].
export function knownSpells(data, h) {
  const c = data.classes[h.cls], out = [];
  if (c.ability) out.push({ ...c.ability, level: 1 });
  for (const s of c.spells || []) if (h.level >= s.level && data.spells[s.id]) out.push({ id: s.id, level: s.level, ...data.spells[s.id] });
  return out;
}

// ---------- Ausrüstung (Schritt 5b) ----------
// hero.equip = { weapon: itemId|null, armor: itemId|null } (optional; fehlt es, ist nichts angelegt).
// Die gespeicherten Werte atk/def bleiben die Grundwerte; Boni werden beim Rechnen addiert.
export const SLOTS = ['weapon', 'armor'];
// Gegenstandsdefinition: erzeugte Ausrüstung (state.gear) hat Vorrang vor den festen Gegenständen (data.items)
export const itemDef = (state, data, id) => (state && state.gear && state.gear[id]) || data.items[id];
export function gearBonus(data, h, state) {
  const b = { atk: 0, def: 0, init: 0 };
  for (const s of SLOTS) { const it = h.equip && h.equip[s] && itemDef(state, data, h.equip[s]); if (it && it.kind === 'equip') { b.atk += it.atk || 0; b.def += it.def || 0; b.init += it.init || 0; } }
  return b;
}
export const heroAtk = (data, h, state) => h.atk + gearBonus(data, h, state).atk;
export const heroDef = (data, h, state) => h.def + gearBonus(data, h, state).def;
export const heroInit = (data, h, state) => h.init + gearBonus(data, h, state).init;
export function canEquip(data, h, itemId, state) {
  const it = itemDef(state, data, itemId);
  return !!it && it.kind === 'equip' && SLOTS.includes(it.slot) && (!it.classes || it.classes.includes(h.cls));
}
export function equipItem(state, data, itemId, heroIdx) {
  if (state.combat) return { error: 'in-combat' };
  const h = state.heroes[heroIdx];
  if (!h || !(state.inv[itemId] > 0)) return { error: 'no-item' };
  if (!canEquip(data, h, itemId, state)) return { error: 'not-allowed' };
  const it = itemDef(state, data, itemId);
  h.equip = h.equip || { weapon: null, armor: null };
  const old = h.equip[it.slot];
  state.inv[itemId]--;
  if (old) state.inv[old] = (state.inv[old] || 0) + 1;
  h.equip[it.slot] = itemId;
  for (const k of Object.keys(state.inv)) if (state.inv[k] === 0 && itemDef(state, data, k).kind === 'equip') delete state.inv[k];
  return { msg: `${h.name} legt ${it.name} an${old ? ` (${itemDef(state, data, old).name} zurück ins Inventar)` : ''}.`, sfx: 'ui' };
}
export function unequipItem(state, data, heroIdx, slot) {
  if (state.combat) return { error: 'in-combat' };
  const h = state.heroes[heroIdx];
  if (!h || !SLOTS.includes(slot) || !h.equip || !h.equip[slot]) return { error: 'empty' };
  const id = h.equip[slot];
  state.inv[id] = (state.inv[id] || 0) + 1;
  h.equip[slot] = null;
  return { msg: `${h.name} legt ${itemDef(state, data, id).name} ab.`, sfx: 'ui' };
}

// ---------- Beute: Qualität, Zufallseigenschaften, Unikate, Gegner-Drops (Phase 3, Schritt 3) ----------
// Erzeugt eine Ausrüstung aus einem Grundgegenstand (data.lootBases): Qualität nach Gewichten (boost = so oft neu gewürfelt, bestes zählt),
// Qualität gibt +statBonus auf den Hauptwert (Waffe: Angriff, Rüstung: Verteidigung) und affixes Zufallseigenschaften (data.affixes).
export function rollGear(state, data, opts = {}) {
  const bases = (data.lootBases || []).filter((id) => data.items[id] && data.items[id].kind === 'equip' && (!opts.slot || data.items[id].slot === opts.slot));
  if (!bases.length) return null;
  const base = data.items[bases[randInt(state, 0, bases.length - 1)]], baseId = bases.find((id) => data.items[id] === base);
  const Q = data.quality, total = Q.reduce((n, q) => n + q.weight, 0);
  const pick = () => { let r = rand(state) * total; for (let i = 0; i < Q.length; i++) { r -= Q[i].weight; if (r < 0) return i; } return 0; };
  let qi = pick();
  for (let b = 0; b < (opts.boost || 0); b++) qi = Math.max(qi, pick());
  const q = Q[qi];
  const inst = { kind: 'equip', base: baseId, slot: base.slot, q: q.id, atk: base.atk || 0, def: base.def || 0, init: 0, classes: base.classes ? [...base.classes] : null, name: base.name };
  inst[base.slot === 'weapon' ? 'atk' : 'def'] += q.statBonus;
  const pool = (data.affixes || []).filter((a) => a.slots.includes(base.slot));
  const used = [];
  for (let i = 0; i < q.affixes && pool.length; i++) {
    const free = pool.filter((a) => !used.includes(a));
    if (!free.length) break;
    const a = free[randInt(state, 0, free.length - 1)];
    used.push(a);
    inst[a.stat] += randInt(state, a.min, a.max);
  }
  if (used.length) inst.name = `${base.name} ${used.map((a) => a.name).join(' und ')}`;
  inst.affixes = used.map((a) => a.id);
  inst.desc = gearDesc(data, inst);
  return inst;
}
export function gearDesc(data, it) {
  const parts = [];
  if (it.atk) parts.push(`+${it.atk} Angriff`);
  if (it.def) parts.push(`+${it.def} Verteidigung`);
  if (it.init) parts.push(`+${it.init} Initiative`);
  const cls = it.classes ? ' Für ' + it.classes.map((c) => data.classes[c].name).join(', ') + '.' : ' Für alle Berufe.';
  return `${data.slots[it.slot]}. ${parts.join(', ') || 'keine Boni'}.${cls}`;
}
export function addGear(state, data, inst) {
  state.gear = state.gear || {};
  const uid = 'g' + (state.uid = (state.uid || 0) + 1);
  state.gear[uid] = inst;
  state.inv[uid] = 1;
  return uid;
}
export const ownsItem = (state, id) => (state.inv[id] || 0) > 0 || state.heroes.some((h) => h.equip && SLOTS.some((s) => h.equip[s] === id));
export const qualityOf = (state, data, id) => { const it = itemDef(state, data, id); return it && it.q ? (it.q === 'unique' ? { id: 'unique', name: 'Einzigartig', color: '#ffb347' } : data.quality.find((q) => q.id === it.q)) : null; };
// Beute nach einem Sieg: je Gegnerart data.enemies.<id>.drops (feste Gegenstände, einmalig) und gearDrop {chance, boost, slot?}
function rollDrops(state, data, enemies, msgs) {
  for (const e of enemies) {
    const en = data.enemies[e.kind];
    for (const d of en.drops || []) { // { item | pick: [ids], chance }: Unikate fallen nur, solange sie noch nicht im Besitz sind
      const cand = (d.pick || [d.item]).filter((id) => data.items[id] && !ownsItem(state, id));
      if (!cand.length || !(rand(state) * 100 < (d.chance ?? 100))) continue;
      const id = cand[cand.length === 1 ? 0 : randInt(state, 0, cand.length - 1)];
      state.inv[id] = (state.inv[id] || 0) + 1;
      msgs.push(`Beute von ${e.name}: ${data.items[id].name} (einzigartig)!`);
    }
    const g = en.gearDrop;
    if (g && rand(state) * 100 < g.chance) {
      const inst = rollGear(state, data, g);
      if (inst) { addGear(state, data, inst); const q = data.quality.find((x) => x.id === inst.q); msgs.push(`Beute von ${e.name}: ${inst.name}${inst.q !== 'common' ? ` [${q.name}]` : ''}.`); }
    }
  }
}

// ---------- Verkaufen (Phase 3, Schritt 4) ----------
// Wert = data.items[grundgegenstand].value, erzeugte Ausrüstung: × (1 + 0,5 je Qualitätsstufe) + 4 je Punkt Zufallseigenschaft.
// Verkaufspreis = Hälfte des Werts (mindestens 1). Questgegenstände, Unikate und Gegenstände ohne value sind nicht verkäuflich.
export function itemWorth(state, data, id) {
  const it = itemDef(state, data, id);
  if (!it || it.kind === 'quest' || it.q === 'unique' || it.noSell) return null;
  const base = it.base ? data.items[it.base] : it;
  if (!base || !(base.value > 0)) return null;
  if (!it.base) return base.value;
  const qi = Math.max(0, data.quality.findIndex((q) => q.id === it.q)), q = data.quality[qi];
  const extra = Math.max(0, (it.atk || 0) + (it.def || 0) + (it.init || 0) - (base.atk || 0) - (base.def || 0) - (q ? q.statBonus : 0));
  return Math.floor(base.value * (1 + 0.5 * qi)) + 4 * extra;
}
export const sellPrice = (state, data, id) => { const w = itemWorth(state, data, id); return w == null ? null : Math.max(1, Math.floor(w / 2)); };
export function sellItem(state, data, id) {
  if (state.combat) return { error: 'in-combat' };
  if (!(state.inv[id] > 0)) return { error: 'no-item' };
  const p = sellPrice(state, data, id);
  if (p == null) return { error: 'not-sellable' };
  const it = itemDef(state, data, id);
  state.inv[id]--;
  if (state.inv[id] === 0) { delete state.inv[id]; if (state.gear && state.gear[id]) delete state.gear[id]; }
  state.gold += p;
  return { msg: `${it.name} verkauft: +${p} Gold.`, price: p, sfx: 'chest' };
}

// ---------- Handel (Phase 3, Schritt 5) ----------
// data.shops.<id> = { name, owner, greeting, stock: [{ item }] } (feste Ware, unbegrenzt). Kaufpreis = voller Wert, Verkauf = Hälfte (siehe sellPrice).
export const shopStock = (data, shopId) => ((data.shops && data.shops[shopId] && data.shops[shopId].stock) || []).filter((e) => data.items[e.item]);
export const buyPrice = (state, data, id) => itemWorth(state, data, id);
export function buyItem(state, data, shopId, itemId) {
  if (state.combat) return { error: 'in-combat' };
  if (!shopStock(data, shopId).some((e) => e.item === itemId)) return { error: 'not-in-stock' };
  const p = buyPrice(state, data, itemId), it = data.items[itemId];
  if (p == null) return { error: 'not-for-sale' };
  if (state.gold < p) return { error: 'no-gold', price: p };
  state.gold -= p;
  state.inv[itemId] = (state.inv[itemId] || 0) + 1;
  return { msg: `${it.name} gekauft: −${p} Gold.`, price: p, sfx: 'chest' };
}

// ---------- Fehlerlog (Phase 3, Schritt 4; rein, damit testbar) ----------
// Einträge { t: ISO-Zeit, v: Version, where, msg, stack?, n } – gleiche aufeinanderfolgende Fehler werden gezählt statt wiederholt.
export const ERRLOG_MAX = 40;
export function pushError(list, e, max = ERRLOG_MAX) {
  const entry = { t: e.t || new Date().toISOString(), v: e.v || '', where: String(e.where || '').slice(0, 60), msg: String(e.msg || 'Unbekannter Fehler').slice(0, 300), n: 1 };
  if (e.stack) entry.stack = String(e.stack).slice(0, 700);
  const last = list[list.length - 1];
  if (last && last.msg === entry.msg && last.where === entry.where) { last.n = (last.n || 1) + 1; last.t = entry.t; return list; }
  list.push(entry);
  while (list.length > max) list.shift();
  return list;
}
export function formatErrorLog(list, meta = '') {
  const head = `Eldermoor Fehlerlog${meta ? ' – ' + meta : ''} (${list.length} Einträge)`;
  return [head, ...list.slice().reverse().map((e) => `[${e.t}] v${e.v} ${e.where}${e.n > 1 ? ` (×${e.n})` : ''}: ${e.msg}${e.stack ? '\n' + e.stack : ''}`)].join('\n\n');
}

// ---------- Rast (Schritt 5a) ----------
// Mit Proviant: alle Helden (auch bewusstlose) voll bei LP und Ressource, 1 Proviant weg.
// Ohne Proviant („hungrig“): jeder Held erholt sich nur um data.rest.hungryPct % von LP und Ressource.
// Nicht im Kampf und nicht, wenn ein lebender Gegner näher als data.rest.enemyDistance Felder ist.
export function restParty(state, data) {
  if (state.combat) return { error: 'in-combat' };
  const cfg = data.rest || { hungryPct: 30, enemyDistance: 3 };
  const near = state.objs.some((o) => o.type === 'enemy' && !o.dead && Math.max(Math.abs(o.x - state.player.x), Math.abs(o.y - state.player.y)) < cfg.enemyDistance);
  if (near) return { error: 'enemy-near' };
  if (state.heroes.every((h) => h.hp >= h.maxHp && h.mp >= h.maxMp)) return { error: 'nothing-to-do' };
  const fed = (state.inv.ration || 0) > 0;
  if (fed) state.inv.ration--;
  for (const h of state.heroes) {
    if (fed) { h.hp = h.maxHp; h.mp = h.maxMp; }
    else {
      h.hp = Math.min(h.maxHp, h.hp + Math.max(1, Math.ceil(h.maxHp * cfg.hungryPct / 100)));
      h.mp = Math.min(h.maxMp, h.mp + Math.ceil(h.maxMp * cfg.hungryPct / 100));
    }
  }
  return { fed, msg: fed ? `Die Gruppe rastet und isst (Proviant übrig: ${state.inv.ration}). Alle sind wieder bei Kräften.` : `Kein Proviant: Die Gruppe rastet hungrig und erholt sich nur zu ${cfg.hungryPct} %.`, sfx: 'heal' };
}

// ---------- Kampf ----------
const combatAlive = (state, e) => e.side === 'h' ? state.heroes[e.idx].hp > 0 : state.combat.enemies[e.idx].hp > 0;

function buildOrder(state, data) {
  const c = state.combat;
  const list = [];
  const slowed = (side, i) => (c.status[side + i] && c.status[side + i].slow ? -100 : 0);
  state.heroes.forEach((h, i) => { if (h.hp > 0) list.push({ side: 'h', idx: i, key: heroInit(data, h, state) + rand(state) * 4 + 0.5 + slowed('h', i) }); });
  c.enemies.forEach((e, i) => { if (e.hp > 0) list.push({ side: 'e', idx: i, key: enemyOf(data, e).init + rand(state) * 4 + slowed('e', i) }); });
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

// Gegnergruppe (bis zu 3): obj.kinds oder obj.kind; gleiche Arten bekommen Buchstaben (A, B, C)
const MAX_ENEMIES = 3;
function group(data, obj) {
  const kinds = (Array.isArray(obj.kinds) && obj.kinds.length ? obj.kinds : [obj.kind]).slice(0, MAX_ENEMIES);
  const total = {}, seen = {};
  kinds.forEach((k) => { total[k] = (total[k] || 0) + 1; });
  return kinds.map((k) => {
    const en = data.enemies[k];
    seen[k] = (seen[k] || 0) + 1;
    return { objId: obj.id, kind: k, name: total[k] > 1 ? `${en.name} ${'ABC'[seen[k] - 1]}` : en.name, hp: kinds.length === 1 ? obj.hp : en.hp, maxHp: en.hp, cd: 0, intent: null };
  });
}
// Gegnerwerte mit eingetretenen Bossphasen: phases[i].set überschreibt Felder (atk, def, init, heavy, onHit, ai, resist)
export function enemyOf(data, e) {
  const en = data.enemies[e.kind];
  if (!e.phase || !en.phases) return en;
  let m = en;
  for (let i = 0; i < e.phase && i < en.phases.length; i++) m = { ...m, ...(en.phases[i].set || {}) };
  return m;
}
// Bossphasen: unter einer LP-Schwelle (Prozent der Höchst-LP) wechselt der Gegner einmalig in die nächste Phase
function checkPhases(state, data, msgs) {
  const c = state.combat;
  for (const e of c.enemies) {
    const en = data.enemies[e.kind];
    if (!en.phases || e.hp <= 0) continue;
    while ((e.phase || 0) < en.phases.length && e.hp * 100 <= en.phases[e.phase || 0].below * e.maxHp) {
      const ph = en.phases[e.phase || 0];
      e.phase = (e.phase || 0) + 1;
      e.intent = null; e.cd = 0; // neues Angriffsmuster beginnt von vorn
      msgs.push(`${e.name} – Phase ${e.phase + 1}: ${ph.name}! ${ph.msg || ''}`.trim());
      noteBestiary(state, e.kind, 'phase', e.phase);
    }
  }
}

// Bestiarium: state.bestiary[art] = { seen, won, phase, heavy, onHit, resist: {element: true} } – fehlende Felder = unbekannt
function noteBestiary(state, kind, what, val) {
  const b = (state.bestiary = state.bestiary || {});
  const r = (b[kind] = b[kind] || { seen: 0, won: 0 });
  if (what === 'seen') r.seen++;
  else if (what === 'won') r.won++;
  else if (what === 'phase') r.phase = Math.max(r.phase || 0, val);
  else if (what === 'resist') { r.resist = r.resist || {}; r.resist[val] = true; }
  else r[what] = true;
}

export function startCombat(state, data, enemyObj) {
  state.combat = {
    enemies: group(data, enemyObj),
    order: [], pos: 0, round: 1, defending: {}, status: {}, over: null
  };
  for (const e of state.combat.enemies) noteBestiary(state, e.kind, 'seen');
  buildOrder(state, data);
  normalizeTurn(state, data);
  return state.combat;
}

export function currentActor(state) {
  const c = state.combat;
  return c && !c.over ? c.order[c.pos] : null;
}

// Trefferchance 90 %, Schaden = Angriff + 0..2 − Verteidigung/2 (min. 1), danach Faktor, Hinterreihe, Deckung.
// opts.trace (Objekt) wird mit der Rechnung gefüllt, damit das Protokoll sie zeigen kann.
export const SEP = '\u241F'; // trennt Meldungstext und Rechenweg in msgs
export const SWEEP_MULT = 60; // „Alle angreifen“: Prozent Schaden je Gegner
export function calcDamage(state, atk, def, opts = {}) {
  const roll = rand(state);
  if (!opts.sure && roll >= 0.9) return 0;
  const r = randInt(state, 0, 2), red = Math.floor(def / 2);
  let d = Math.max(1, atk + r - red);
  if (opts.mult) d = Math.max(1, Math.floor((d * opts.mult) / 100));
  if (opts.elem) d = Math.max(1, Math.floor((d * (100 + opts.elem)) / 100));
  if (opts.backMelee) d = Math.ceil(d / 2);
  if (opts.defending) d = Math.max(1, Math.floor(d / 2));
  if (opts.trace) Object.assign(opts.trace, { atk, roll: r, red, mult: opts.mult || 0, elem: opts.elem || 0, elemName: opts.elemName || '', back: !!opts.backMelee, def: !!opts.defending, total: d });
  return d;
}
export function explain(tr) {
  return `Angriff ${tr.atk} + Wurf ${tr.roll} − Rüstung ${tr.red}${tr.mult ? ` · ${tr.mult} %` : ''}${tr.elem ? ` · ${tr.elemName} ${tr.elem > 0 ? '+' : ''}${tr.elem} %` : ''}${tr.back ? ' · ½ Hinterreihe' : ''}${tr.def ? ' · ½ Deckung' : ''} = ${tr.total}`;
}

// ---------- Statuswirkungen (nur im Kampf, werden nicht gespeichert) ----------
// c.status['h0' | 'e0'] = { poison: {t, p}, stun: {t}, weak: {t} }
const skey = (side, idx) => side + idx;
const actorName = (state, side, idx) => (side === 'h' ? state.heroes[idx].name : state.combat.enemies[idx].name);
export function statusOf(state, side, idx) { return (state.combat && state.combat.status[skey(side, idx)]) || {}; }
function addStatus(state, data, side, idx, inf, msgs) {
  if (!inf) return;
  if (inf.chance < 100 && rand(state) * 100 >= inf.chance) return;
  const c = state.combat, k = skey(side, idx);
  const st = c.status[k] || (c.status[k] = {});
  const cur = st[inf.status];
  st[inf.status] = { t: Math.max(cur ? cur.t : 0, inf.turns), p: Math.max(cur ? cur.p || 0 : 0, inf.power || 0) };
  const nm = data.statuses[inf.status].name;
  msgs.push(`${actorName(state, side, idx)}: ${nm}${(inf.status === 'poison' || inf.status === 'burn') ? ` (${inf.turns} Runden, ${inf.power} Schaden je Runde)` : (inf.status === 'weak' || inf.status === 'slow') ? ` (${inf.turns} Runden)` : ''}.`);
}
const effAtk = (state, side, idx, atk) => (statusOf(state, side, idx).weak ? Math.max(1, Math.floor((atk * 3) / 4)) : atk);

// Ende des eigenen Zugs: Gift wirkt, Dauer sinkt. Rückgabe: true, wenn danach alle Gegner besiegt sind.
function endOfTurn(state, data, side, idx, msgs) {
  const c = state.combat, k = skey(side, idx), st = c.status[k];
  if (!st) return false;
  const tgt = side === 'h' ? state.heroes[idx] : c.enemies[idx];
  for (const [n, label] of [['poison', 'Giftschaden'], ['burn', 'Brandschaden']]) {
    if (st[n] && tgt.hp > 0) {
      const before = tgt.hp;
      tgt.hp = Math.max(side === 'h' ? 1 : 0, tgt.hp - st[n].p);
      const lost = before - tgt.hp;
      if (lost > 0) msgs.push(`${tgt.name} erleidet ${lost} ${label}.`);
      if (side === 'e' && tgt.hp === 0) msgs.push(`${tgt.name} bricht zusammen.`);
    }
  }
  for (const n of ['poison', 'burn', 'weak', 'slow']) if (st[n] && --st[n].t <= 0) { delete st[n]; msgs.push(`${tgt.name}: ${data.statuses[n].name} klingt ab.`); }
  return c.enemies.every((e) => e.hp <= 0);
}

// Betäubter Akteur am Zug setzt aus. Rückgabe null, wenn der Akteur nicht betäubt ist.
export function skipStunned(state, data) {
  const c = state.combat, a = currentActor(state);
  if (!c || !a) return null;
  const st = c.status[skey(a.side, a.idx)];
  if (!st || !st.stun) return null;
  delete st.stun;
  const msgs = [`${actorName(state, a.side, a.idx)} ist betäubt und setzt aus.`];
  if (endOfTurn(state, data, a.side, a.idx, msgs)) { finishVictory(state, data, msgs); return { msgs, sfx: 'miss', over: 'victory' }; }
  checkPhases(state, data, msgs);
  advance(state, data);
  return { msgs, sfx: 'miss', over: null };
}

function advance(state, data) {
  state.combat.pos++;
  normalizeTurn(state, data);
}

function finishVictory(state, data, msgs) {
  const c = state.combat;
  let gold = 0, xp = 0;
  for (const e of c.enemies) {
    gold += data.enemies[e.kind].gold;
    xp += data.enemies[e.kind].xp || 0;
    noteBestiary(state, e.kind, 'won');
    const obj = state.objs.find((o) => o.id === e.objId);
    if (obj) { obj.dead = true; obj.hp = 0; }
  }
  state.gold += gold;
  msgs.push(`Sieg! Beute: ${gold} Gold.`);
  if (xp > 0) { msgs.push(`Erfahrung: +${xp} EP für jeden Helden, der noch steht.`); grantXp(state, data, xp, msgs); }
  rollDrops(state, data, c.enemies, msgs);
  for (const h of state.heroes) if (h.hp <= 0) { h.hp = 1; msgs.push(`${h.name} kommt mit 1 LP wieder zu sich.`); } // vorläufig, bis die Rast kommt (Schritt 5)
  state.combat = null;
  return gold;
}

function regen(h, msgs) {
  if (h.mp < h.maxMp) h.mp = Math.min(h.maxMp, h.mp + MP_REGEN);
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
    const tr = {};
    const d = calcDamage(state, effAtk(state, 'h', a.idx, heroAtk(data, h, state)), enemyOf(data, e).def, { backMelee: h.row === 'back' && !h.ranged, trace: tr });
    if (d === 0) { msgs.push(`${h.name} verfehlt ${e.name}.`); sfx = 'miss'; }
    else {
      e.hp = Math.max(0, e.hp - d);
      const note = h.row === 'back' && !h.ranged ? ' (Hinterreihe, Nahkampf: halber Schaden)' : '';
      msgs.push(`${h.name} trifft ${e.name} für ${d} Schaden${note}.${SEP}${explain(tr)}`);
      sfx = 'hit';
      if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`);
    }
    regen(h, msgs);
  } else if (act.type === 'ability' || act.type === 'spell') {
    const ab = act.type === 'spell' ? knownSpells(data, h).find((s) => s.id === act.spell) : data.classes[h.cls].ability;
    if (!ab) return { error: 'no-ability' };
    if (h.mp < ab.cost) return { error: 'no-mp' };
    const rn = data.classes[h.cls].res.name;
    if (ab.kind === 'heal') {
      const targets = ab.all ? state.heroes.map((x, i) => i).filter((i) => state.heroes[i].hp > 0 && state.heroes[i].hp < state.heroes[i].maxHp) : [act.target];
      if (ab.all) { if (!targets.length) return { error: 'full-hp' }; }
      else {
        const t = state.heroes[act.target];
        const stT = c.status['h' + act.target];
        if (!t || t.hp <= 0 || (t.hp >= t.maxHp && !(ab.cleanse && stT && stT[ab.cleanse]))) return { error: 'bad-target' };
      }
      h.mp -= ab.cost;
      const parts = [];
      for (const ti of targets) {
        const t = state.heroes[ti], stT = c.status['h' + ti];
        const gain = Math.min(ab.heal, t.maxHp - t.hp);
        t.hp += gain;
        parts.push(`${t.name}${gain > 0 ? ` +${gain}` : ''}`);
        if (ab.cleanse && stT && stT[ab.cleanse]) { delete stT[ab.cleanse]; msgs.push(`${t.name}: ${data.statuses[ab.cleanse].name} wird genommen.`); }
      }
      msgs.push(`${h.name} wirkt ${ab.name}: ${parts.join(', ')} LP (−${ab.cost} ${rn}).`);
      sfx = 'heal';
    } else {
      let list;
      if (ab.all) list = c.enemies.map((e, i) => i).filter((i) => c.enemies[i].hp > 0);
      else {
        let ti = act.target;
        if (ti == null || !c.enemies[ti] || c.enemies[ti].hp <= 0) ti = c.enemies.findIndex((e) => e.hp > 0);
        list = [ti];
      }
      h.mp -= ab.cost;
      let hit = false;
      for (const ti of list) {
        const e = c.enemies[ti];
        const tr = {};
        const el = ab.element ? ((enemyOf(data, e).resist || {})[ab.element] || 0) : 0;
        if (el !== 0) noteBestiary(state, e.kind, 'resist', ab.element);
        const d = calcDamage(state, effAtk(state, 'h', a.idx, heroAtk(data, h, state)), enemyOf(data, e).def, { backMelee: h.row === 'back' && !h.ranged, mult: ab.mult, sure: !!ab.sure, elem: el, elemName: ab.element && data.elements[ab.element].name, trace: tr });
        if (d === 0) { msgs.push(`${h.name} setzt ${ab.name} ein, verfehlt aber ${e.name}${list.length === 1 ? ` (−${ab.cost} ${rn})` : ''}.`); continue; }
        hit = true;
        e.hp = Math.max(0, e.hp - d);
        const note = el > 0 ? ' Schwäche!' : el < 0 ? ' Resistent.' : '';
        msgs.push(`${h.name} setzt ${ab.name} ein: ${d} Schaden an ${e.name}${list.length === 1 ? ` (−${ab.cost} ${rn})` : ''}.${note}${SEP}${explain(tr)}`);
        if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`);
        else addStatus(state, data, 'e', ti, ab.inflict, msgs);
      }
      if (list.length > 1) msgs.push(`(−${ab.cost} ${rn})`);
      sfx = hit ? 'hit' : 'miss';
    }
  } else if (act.type === 'sweep') {
    const live = c.enemies.filter((e) => e.hp > 0);
    if (live.length < 2) return { error: 'bad-target' };
    let hit = false;
    for (const e of live) {
      const tr = {};
      const d = calcDamage(state, effAtk(state, 'h', a.idx, heroAtk(data, h, state)), enemyOf(data, e).def, { backMelee: h.row === 'back' && !h.ranged, mult: SWEEP_MULT, trace: tr });
      if (d === 0) { msgs.push(`${h.name} verfehlt ${e.name}.`); continue; }
      hit = true; e.hp = Math.max(0, e.hp - d);
      msgs.push(`${h.name} trifft ${e.name} für ${d} Schaden.${SEP}${explain(tr)}`);
      if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`);
    }
    sfx = hit ? 'hit' : 'miss';
    regen(h, msgs);
  } else if (act.type === 'defend') {
    c.defending[a.idx] = true;
    msgs.push(`${h.name} geht in Deckung.`);
    sfx = 'defend';
    regen(h, msgs);
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
  checkPhases(state, data, msgs);
  endOfTurn(state, data, 'h', a.idx, msgs);
  advance(state, data);
  return { msgs, sfx, over };
}

// Zielwahl der Gegner: random (75 % Vorderreihe), weakest (60 % der Held mit den wenigsten LP), backline (75 % Hinterreihe)
function pickTarget(state, en) {
  const front = [], back = [], all = [];
  state.heroes.forEach((h, i) => { if (h.hp > 0) { all.push(i); (h.row === 'front' ? front : back).push(i); } });
  const ai = en.ai || 'random';
  if (ai === 'weakest' && rand(state) < 0.6) return all.reduce((b, i) => (state.heroes[i].hp < state.heroes[b].hp ? i : b), all[0]);
  if (ai === 'backline' && back.length && rand(state) < 0.75) return back[randInt(state, 0, back.length - 1)];
  const pool = front.length && (rand(state) < 0.75 || !back.length) ? front : (back.length ? back : front);
  return pool[randInt(state, 0, pool.length - 1)];
}

export function enemyStep(state, data, opts = {}) {
  const c = state.combat;
  if (!c || c.over) return { error: 'no-combat' };
  const a = currentActor(state);
  if (!a || a.side !== 'e') return { error: 'not-enemy-turn' };
  const e = c.enemies[a.idx];
  const en = enemyOf(data, e);
  const msgs = [];
  const ti = pickTarget(state, en);
  const t = state.heroes[ti];
  const hv = en.heavy, heavy = !!hv && e.intent === 'heavy';
  const tr = {};
  const d = calcDamage(state, effAtk(state, 'e', a.idx, en.atk), heroDef(data, t, state), { defending: !!c.defending[ti], mult: heavy ? hv.mult : 0, trace: tr });
  let sfx = 'miss';
  const why = `${t.row === 'front' ? 'Vorderreihe' : 'Hinterreihe'}${c.defending[ti] ? ', in Deckung: halber Schaden' : ''}`;
  if (heavy) { msgs.push(`${e.name} setzt ${hv.name} ein!`); noteBestiary(state, e.kind, 'heavy'); }
  if (d === 0) msgs.push(`${e.name} greift ${t.name} an (${why}) und verfehlt.`);
  else if (opts.god) { msgs.push(`${e.name} trifft ${t.name}, doch Debug-Unverwundbarkeit hält.`); sfx = 'hurt'; }
  else {
    t.hp = Math.max(0, t.hp - d);
    msgs.push(`${e.name} trifft ${t.name} für ${d} Schaden (${why}).${SEP}${explain(tr)}`);
    sfx = 'hurt';
    if (t.hp === 0) { msgs.push(`${t.name} sinkt bewusstlos zu Boden.`); delete c.status['h' + ti]; }
    else { addStatus(state, data, 'h', ti, en.onHit, msgs); if (en.onHit) noteBestiary(state, e.kind, 'onHit'); }
  }
  if (hv) { // angekündigter Schlag: jeder dritte Zug, eine Runde vorher wird er angesagt
    if (heavy) { e.intent = null; e.cd = 0; }
    else if (++e.cd >= hv.every - 1) { e.intent = 'heavy'; msgs.push(`${e.name} holt zum ${hv.name} aus! Verteidigen halbiert den Schaden.`); }
  }
  if (state.heroes.every((h) => h.hp <= 0)) {
    c.over = 'defeat';
    msgs.push('Die Gruppe ist gefallen.');
    return { msgs, sfx, over: 'defeat' };
  }
  if (endOfTurn(state, data, 'e', a.idx, msgs)) { const gold = finishVictory(state, data, msgs); return { msgs, sfx, over: 'victory', gold }; }
  checkPhases(state, data, msgs);
  advance(state, data);
  return { msgs, sfx, over: null };
}

// Preis der Niederlage: zurück zum Eingang, halbe LP, 25 % Gold weg, Gegner erholt sich
export function applyDefeat(state, data) {
  const lvl = getLevel(data, state);
  state.player = { x: lvl.start.x, y: lvl.start.y, dir: lvl.start.dir };
  state.heroes.forEach((h) => { h.hp = Math.max(1, Math.ceil(h.maxHp / 2)); h.mp = h.maxMp; });
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
// MIGRATIONS[n]: Spielstand Version n -> n+1
// v1 -> v2: Helden bekommen Rasse, Beruf-Schlüssel und Porträt-Wert. Alle Kampfwerte, LP und der übrige Zustand bleiben unverändert.
// Alle v1-Helden werden zu „Mensch“: dessen Modifikatoren sind 0, die gespeicherten Werte entsprechen also genau Rasse + Beruf.
const V1_ROLE_TO_CLS = { Krieger: 'warrior', Schurke: 'rogue', Priester: 'priest', Magier: 'mage' };
export const MIGRATIONS = {
  1: (save) => {
    const st = save.state;
    if (!st || !Array.isArray(st.heroes)) throw new Error('Spielstand v1: Gruppe fehlt');
    const heroes = st.heroes.map((h, i) => {
      if (!h || !has(V1_ROLE_TO_CLS, h.role)) throw new Error(`Spielstand v1: unbekannter Beruf „${h && h.role}“`);
      return { ...h, race: 'human', cls: V1_ROLE_TO_CLS[h.role], look: i * 7 + 3 }; // look = bisheriger Porträt-Startwert (i*7+3)
    });
    return { ...save, v: 2, state: { ...st, heroes } };
  },
  // v2 -> v3: Helden bekommen Stufe 1 und 0 Erfahrung. Kampfwerte und LP bleiben unverändert (Stufe 1 hat kein Wachstum).
  2: (save) => {
    const st = save.state;
    if (!st || !Array.isArray(st.heroes)) throw new Error('Spielstand v2: Gruppe fehlt');
    return { ...save, v: 3, state: { ...st, heroes: st.heroes.map((h) => ({ ...h, level: 1, xp: 0 })) } };
  },
  // v3 -> v4: Helden bekommen Mana/Ausdauer (voll) passend zu Beruf und Stufe. Alles andere bleibt.
  // Braucht die Spieldaten (Beruf -> Ressource); die Migration bekommt sie über das zweite Argument.
  3: (save, data) => {
    const st = save.state;
    if (!st || !Array.isArray(st.heroes)) throw new Error('Spielstand v3: Gruppe fehlt');
    return { ...save, v: 4, state: { ...st, heroes: st.heroes.map((h) => {
      if (!data || !has(data.classes, h.cls)) throw new Error(`Spielstand v3: Beruf „${h && h.cls}“ unbekannt`);
      const m = deriveMp(data, h.cls, Number.isInteger(h.level) ? h.level : 1);
      return { ...h, maxMp: m, mp: m };
    }) } };
  },
  // v4 -> v5: Mehrere Gebiete. Bisher gab es nur das aktuelle Gebiet; besuchte andere Gebiete (areas) beginnen leer.
  // Neue feste Objekte des aktuellen Gebiets (z. B. Treppen), die der alte Stand nicht kennt, werden ergänzt; vorhandene bleiben unverändert.
  4: (save, data) => {
    const st = save.state;
    if (!st || typeof st !== 'object' || !Array.isArray(st.objs)) throw new Error('Spielstand v4: Zustand fehlt');
    const lvl = data && data.levels[st.levelId];
    const have = new Set(st.objs.map((o) => o && o.id));
    const added = lvl ? lvl.objects.filter((o) => !have.has(o.id)).map((o) => freshObj(data, o)) : [];
    return { ...save, v: 5, state: { ...st, objs: [...st.objs, ...added], areas: {}, notes: Array.isArray(st.notes) ? st.notes : [] } };
  },
  // v5 -> v6: erzeugte Ausrüstung (Beutesystem). Bisher gab es keine; alles andere bleibt.
  5: (save) => {
    const st = save.state;
    if (!st || typeof st !== 'object') throw new Error('Spielstand v5: Zustand fehlt');
    return { ...save, v: 6, state: { ...st, gear: {}, uid: 0 } };
  }
};

export function serialize(state) {
  return { format: SAVE_FORMAT, v: SAVE_VERSION, savedAt: new Date().toISOString(), state: clone(state) };
}

export function migrate(save, migrations = MIGRATIONS, target = SAVE_VERSION, data = null) {
  let s = save;
  while (s.v < target) {
    const m = migrations[s.v];
    if (!m) throw new Error(`Keine Migration von Version ${s.v}`);
    const next = m(s, data);
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
    const n = `Held ${i + 1}`;
    if (!hh || typeof hh !== 'object') { err.push(`${n}: ungültig`); return; }
    if (typeof hh.name !== 'string' || !hh.name.trim() || hh.name.length > NAME_MAX_LOAD) err.push(`${n}: Name ungültig`);
    if (!has(data.races, hh.race)) err.push(`${n}: Rasse ungültig`);
    if (!has(data.classes, hh.cls)) err.push(`${n}: Beruf ungültig`);
    if (typeof hh.role !== 'string') err.push(`${n}: Berufsname ungültig`);
    if (hh.row !== 'front' && hh.row !== 'back') err.push(`${n}: Reihe ungültig`);
    if (typeof hh.ranged !== 'boolean') err.push(`${n}: Kampfart ungültig`);
    for (const k of STAT_KEYS) if (!Number.isInteger(hh[k]) || hh[k] < STAT_MIN[k]) err.push(`${n}: ${k} ungültig`);
    if (!Number.isInteger(hh.look)) err.push(`${n}: Aussehen ungültig`);
    if (!Number.isInteger(hh.level) || hh.level < 1 || hh.level > maxLevel(data)) err.push(`${n}: Stufe ungültig`);
    if (!Number.isInteger(hh.xp) || hh.xp < 0) err.push(`${n}: Erfahrung ungültig`);
    if (!Number.isInteger(hh.maxMp) || hh.maxMp < 0) err.push(`${n}: Max-Ressource ungültig`);
    else if (!Number.isInteger(hh.mp) || hh.mp < 0 || hh.mp > hh.maxMp) err.push(`${n}: Ressource ungültig`);
    if (typeof hh.hp !== 'number' || hh.hp < 0 || hh.hp > hh.maxHp) err.push(`${n}: LP ungültig`);
    if (hh.equip != null) {
      if (typeof hh.equip !== 'object') err.push(`${n}: Ausrüstung ungültig`);
      else for (const s of SLOTS) { const id = hh.equip[s]; if (id != null && !(itemDef(state, data, id) && itemDef(state, data, id).kind === 'equip' && itemDef(state, data, id).slot === s)) err.push(`${n}: Ausrüstung ${s} ungültig`); }
    }
  });
  if (!state.inv || typeof state.inv !== 'object') err.push('Inventar ungültig');
  else for (const [k, v] of Object.entries(state.inv)) if (!itemDef(state, data, k) || !Number.isInteger(v) || v < 0) err.push(`Inventar: ${k} ungültig`);
  if (!Number.isInteger(state.gold) || state.gold < 0) err.push('Gold ungültig');
  if (!Array.isArray(state.objs)) err.push('Objekte ungültig');
  if (!Array.isArray(state.seen) || state.seen.length !== w * h) err.push('Karte ungültig');
  if (!Number.isInteger(state.rng)) err.push('Zufallszustand ungültig');
  if (state.gear != null) {
    if (typeof state.gear !== 'object' || Array.isArray(state.gear)) err.push('Ausrüstungsliste ungültig');
    else for (const [k, g] of Object.entries(state.gear)) {
      if (!/^g\d+$/.test(k) || !g || g.kind !== 'equip' || !SLOTS.includes(g.slot) || !data.items[g.base] || typeof g.name !== 'string' || !g.name
        || !['atk', 'def', 'init'].every((x) => Number.isInteger(g[x]) && g[x] >= 0 && g[x] <= 20)) err.push(`Ausrüstung ${k} ungültig`);
    }
    if (!Number.isInteger(state.uid) || state.uid < 0) err.push('Zähler für Ausrüstung ungültig');
  }
  if (state.bestiary != null) {
    if (typeof state.bestiary !== 'object' || Array.isArray(state.bestiary)) err.push('Bestiarium ungültig');
    else for (const [k, v] of Object.entries(state.bestiary)) if (!data.enemies[k] || !v || !Number.isInteger(v.seen) || !Number.isInteger(v.won)) err.push(`Bestiarium: ${k} ungültig`);
  }
  if (!state.areas || typeof state.areas !== 'object' || Array.isArray(state.areas)) err.push('Gebiete ungültig');
  else for (const [id, a] of Object.entries(state.areas)) {
    const l2 = data.levels[id];
    if (!l2) { err.push(`Gebiet ${id}: unbekannt`); continue; }
    if (id === state.levelId) err.push(`Gebiet ${id}: doppelt (aktiv und gespeichert)`);
    if (!a || !Array.isArray(a.objs)) err.push(`Gebiet ${id}: Objekte ungültig`);
    if (!a || !Array.isArray(a.seen) || a.seen.length !== l2.map[0].length * l2.map.length) err.push(`Gebiet ${id}: Karte ungültig`);
    if (!a || !Array.isArray(a.notes)) err.push(`Gebiet ${id}: Notizen ungültig`);
  }
  return err;
}

// Gleicht feste Objekte (Treppen, Tafeln, Händler, Ausgänge) und neu hinzugekommene Objekte aller bekannten Gebiete mit game.json ab.
// So bekommen alte Spielstände Neuerungen (z. B. eine neue Treppe) ohne neue Speicherversion. Truhen, Türen und Gegner behalten ihren Zustand.
const STATIC_TYPES = new Set(['stairs', 'sign', 'merchant', 'exit']);
export function syncStatic(state, data) {
  const areas = [{ id: state.levelId, objs: state.objs }, ...Object.entries(state.areas || {}).map(([id, a]) => ({ id, objs: a.objs }))];
  let n = 0;
  for (const a of areas) {
    const lvl = data.levels[a.id];
    if (!lvl || !Array.isArray(a.objs)) continue;
    for (const o of lvl.objects) {
      const i = a.objs.findIndex((x) => x && x.id === o.id);
      if (i < 0) { a.objs.push(freshObj(data, o)); n++; }
      else if (STATIC_TYPES.has(o.type) && a.objs[i].type === o.type && JSON.stringify(a.objs[i]) !== JSON.stringify(o)) { a.objs[i] = clone(o); n++; }
    }
  }
  return n;
}

export function deserialize(input, data, migrations = MIGRATIONS) {
  let save = input;
  if (typeof input === 'string') {
    try { save = JSON.parse(input); } catch { throw new Error('Datei ist kein gültiges JSON'); }
  }
  if (!save || save.format !== SAVE_FORMAT || !Number.isInteger(save.v) || save.v < 1) throw new Error('Keine Eldermoor-Spielstanddatei');
  if (save.v > SAVE_VERSION) throw new Error('Spielstand stammt aus einer neueren Version – bitte Spiel aktualisieren');
  const m = migrate(save, migrations, SAVE_VERSION, data);
  const errors = validateState(m.state, data);
  if (errors.length) throw new Error('Spielstand ungültig: ' + errors.join('; '));
  syncStatic(m.state, data);
  m.state.combat = null; // Kämpfe werden nie mitten im Kampf gespeichert/geladen
  return m.state;
}

// ---------- Balancetabelle (erzeugt BALANCE.md; Befehl siehe HANDOVER.md) ----------
export function balanceMarkdown(data) {
  const L = [];
  const mx = maxLevel(data), xp = data.progression.xp;
  const sg = (n) => (n > 0 ? '+' + n : String(n));
  L.push('# Balancetabelle – Die Schatten von Eldermoor', '');
  L.push('Wird aus `game.json` erzeugt (`balanceMarkdown` in logic.js), nicht von Hand ändern. Alle Zahlen sind **vorläufig** (vom Assistenten gesetzt, nicht im Spiel mit Spielern gemessen). Feinabstimmung in Schritt 4 (Balance-Simulation).', '');
  L.push('Kampfwerte = Berufswert + Rassenmodifikator + Wachstum je Stufe: `floor((Stufe − 1) × Wachstum / 10)`, Wachstum in Zehnteln pro Stufe. Untergrenzen: LP 1, Angriff 1, Verteidigung 0, Initiative 0.', '');
  L.push('## Erfahrung', '', '| Stufe | EP gesamt | EP für diese Stufe |', '|---|---|---|', '| 1 | 0 | – |');
  for (let lv = 2; lv <= mx; lv++) L.push(`| ${lv} | ${xp[lv - 2]} | ${xp[lv - 2] - (lv > 2 ? xp[lv - 3] : 0)} |`);
  L.push('', 'Gegner (EP: jeder Held, der nach dem Kampf nicht bewusstlos ist, bekommt die volle Summe):', '', '| Gegner | LP | Angriff | Verteidigung | Initiative | EP | Gold | Verhalten |', '|---|---|---|---|---|---|---|---|');
  const aiName = { weakest: 'zielt auf den schwächsten Helden', backline: 'zielt auf die Hinterreihe' };
  for (const e of Object.values(data.enemies)) L.push(`| ${e.name} | ${e.hp} | ${e.atk} | ${e.def} | ${e.init} | ${e.xp || 0} | ${e.gold || 0} | ${[aiName[e.ai], e.heavy && `${e.heavy.name} jeden ${e.heavy.every}. Zug, angekündigt (${e.heavy.mult} %)`, e.onHit && `Treffer: ${data.statuses[e.onHit.status].name} ${e.onHit.chance} %`, e.phases && `Boss, Phasen: ${e.phases.map((p) => `${p.name} ab ≤ ${p.below} % LP${p.set && p.set.atk ? ` (Angriff ${p.set.atk})` : ''}`).join(', ')}`].filter(Boolean).join('; ') || '–'} |`);
  L.push('', '## Rassen (Modifikatoren)', '', '| Rasse | LP | Angriff | Verteidigung | Initiative |', '|---|---|---|---|---|');
  for (const r of Object.values(data.races)) L.push(`| ${r.name} | ${sg(r.mods.maxHp)} | ${sg(r.mods.atk)} | ${sg(r.mods.def)} | ${sg(r.mods.init)} |`);
  L.push('', '## Berufe (Basis auf Stufe 1, Wachstum in Zehnteln je Stufe)', '', '| Beruf | Reihe | Fernkampf | LP | Angriff | Verteidigung | Initiative | Wachstum LP/Ang/Vert/Init |', '|---|---|---|---|---|---|---|---|');
  for (const c of Object.values(data.classes)) L.push(`| ${c.name} | ${c.row === 'front' ? 'vorn' : 'hinten'} | ${c.ranged ? 'ja' : 'nein'} | ${c.base.maxHp} | ${c.base.atk} | ${c.base.def} | ${c.base.init} | ${c.growth.maxHp}/${c.growth.atk}/${c.growth.def}/${c.growth.init} |`);
  L.push('', '## Fähigkeiten und Ressource (vorläufig, Schritt 3a)', '', `Angriff und Verteidigen schenken ${MP_REGEN} Punkt Ressource zurück; nach jedem Kampf ist sie voll.`, '', '| Beruf | Ressource (Stufe 1 / Stufe ' + mx + ') | Fähigkeit | Kosten | Wirkung |', '|---|---|---|---|---|');
  for (const [cid, c] of Object.entries(data.classes)) { const a = c.ability; if (a) L.push(`| ${c.name} | ${c.res.name} ${deriveMp(data, cid, 1)} / ${deriveMp(data, cid, mx)} | ${a.name} | ${a.cost} | ${a.desc} |`); }
  L.push('', '## Werte je Stufe (Mensch, keine Rassenmodifikatoren)', '');
  for (const [cid, c] of Object.entries(data.classes)) {
    L.push(`### ${c.name}`, '', '| Stufe | LP | Angriff | Verteidigung | Initiative |', '|---|---|---|---|---|');
    for (let lv = 1; lv <= mx; lv++) { const st = deriveStats(data, 'human', cid, lv); L.push(`| ${lv} | ${st.maxHp} | ${st.atk} | ${st.def} | ${st.init} |`); }
    L.push('');
  }
  L.push('## Alle 25 Kombinationen auf Stufe 1 und Stufe ' + mx, '', '| Rasse | Beruf | Stufe 1 (LP/Ang/Vert/Init) | Stufe ' + mx + ' (LP/Ang/Vert/Init) |', '|---|---|---|---|');
  for (const [rid, r] of Object.entries(data.races)) for (const [cid, c] of Object.entries(data.classes)) {
    const a = deriveStats(data, rid, cid, 1), b = deriveStats(data, rid, cid, mx);
    L.push(`| ${r.name} | ${c.name} | ${a.maxHp}/${a.atk}/${a.def}/${a.init} | ${b.maxHp}/${b.atk}/${b.def}/${b.init} |`);
  }
  L.push('');
  if (data.quality) {
    const tot = data.quality.reduce((n, q) => n + q.weight, 0);
    L.push('## Beute', '', 'Erzeugte Ausrüstung: Grundgegenstand zufällig aus ' + (data.lootBases || []).map((id) => data.items[id].name).join(', ') + '. Qualität nach Gewicht; „Boost“ würfelt so oft neu und nimmt die beste.', '');
    L.push('| Qualität | Gewicht | Anteil | Bonus Hauptwert | Zufallseigenschaften |', '|---|---|---|---|---|');
    for (const q of data.quality) L.push(`| ${q.name} | ${q.weight} | ${(100 * q.weight / tot).toFixed(0)} % | +${q.statBonus} | ${q.affixes} |`);
    L.push('', '| Eigenschaft | Wirkung | Platz |', '|---|---|---|');
    const sn = { atk: 'Angriff', def: 'Verteidigung', init: 'Initiative' };
    for (const a of data.affixes) L.push(`| ${a.name} | +${a.min}${a.max > a.min ? '–' + a.max : ''} ${sn[a.stat]} | ${a.slots.map((x) => data.slots[x]).join(', ')} |`);
    L.push('', '| Gegner | Ausrüstung | Unikat |', '|---|---|---|');
    for (const e of Object.values(data.enemies)) if (e.gearDrop || e.drops) L.push(`| ${e.name} | ${e.gearDrop ? `${e.gearDrop.chance} %${e.gearDrop.boost ? `, Boost ${e.gearDrop.boost}` : ''}` : '–'} | ${(e.drops || []).map((d) => `${(d.pick || [d.item]).map((id) => data.items[id].name).join(' oder ')} (${d.chance ?? 100} %, nur einmal)`).join('; ') || '–'} |`);
    L.push('');
  }
  return L.join('\n');
}

// ---------- Level-Analyse (Softlock-Prüfung) ----------
export function analyzeLevel(data, levelId) {
  const lvl = data.levels[levelId];
  const doors = lvl.objects.filter((o) => o.type === 'door');
  const chests = lvl.objects.filter((o) => o.type === 'chest');
  const exits = lvl.objects.filter((o) => o.type === 'exit' || o.type === 'stairs'); // Ausgang = Runenstein oder Treppe
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
