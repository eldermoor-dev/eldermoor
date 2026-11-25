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
// 0.32.0: Gebiete können nach einem Ereignis (Marke state.flags[alt.flag]) umgebaut sein: lvl.alt = { flag, patch (Felder des Gebiets), remove: [Objekt-IDs], objects: [neue Objekte] }
const altCache = new WeakMap();
export function levelFor(data, id, flags) {
  const lvl = data.levels[id];
  if (!lvl || !lvl.alt || !flags) return lvl;
  const alts = (Array.isArray(lvl.alt) ? lvl.alt : [lvl.alt]).filter((a) => flags[a.flag]); // 0.48.1: auch mehrere Umbauten (Liste, spätere gewinnen)
  if (!alts.length) return lvl;
  const key = alts.map((a) => a.flag).join('|');
  let c = altCache.get(lvl); if (!c) { c = new Map(); altCache.set(lvl, c); }
  let m = c.get(key);
  if (!m) { m = lvl; for (const a of alts) { const rm = new Set(a.remove || []); m = Object.assign({}, m, a.patch || {}, { objects: m.objects.filter((o) => !rm.has(o.id)).concat(a.objects || []) }); } c.set(key, m); }
  return m;
}
export function getLevel(data, state) { return levelFor(data, state.levelId, state.flags); }
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
      h.level = to;
      refreshHeroStats(data, h); // Beruf + Rasse + Stufe + Talentboni
      ups.push({ hero: h.name, level: to });
      msgs.push(`${h.name} steigt auf Stufe ${to} auf!${talentPoints(data, h) > 0 && data.talents ? ' Neuer Talentpunkt!' : ''}`);
    }
  }
  { // 0.34.0: Reservehelden in der Taverne lernen mit (data.tavern.reserveXp Prozent), auch wenn sie bewusstlos sind; die Gruppe bekommt die Meldung nur bei Aufstieg
    const pct = (data.tavern && data.tavern.reserveXp) || 0, share = Math.floor((amount * pct) / 100);
    if (share > 0) for (const h of state.reserve || []) {
      h.xp = Math.min(cap, h.xp + share);
      const to = levelForXp(data, h.xp);
      if (to > h.level) { h.level = to; refreshHeroStats(data, h); msgs.push(`${h.name} (Reserve) steigt auf Stufe ${to} auf!`); }
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

// ---------- Taverne (0.34.0): Reservehelden, Heldentausch, Anwerben ----------
// state.reserve = [Held, …] (höchstens RESERVE_MAX, gleiche Felder wie state.heroes; fehlt das Feld, ist die Reserve leer).
// data.tavern = { reserveXp (Prozent der Gruppen-EP), recruitBase, recruitPerLevel (Gold), names[] }
export const RESERVE_MAX = 4;
export function partyAvgLevel(state) { return Math.max(1, Math.floor(state.heroes.reduce((n, h) => n + h.level, 0) / state.heroes.length)); }
export function recruitCost(state, data) { const t = data.tavern || {}; return (t.recruitBase || 40) + (t.recruitPerLevel || 20) * partyAvgLevel(state); }
const nameTaken = (state, name) => [...state.heroes, ...(state.reserve || [])].some((h) => h.name.toLowerCase() === name.toLowerCase());
// Getragene Ausrüstung kommt zurück ins Inventar, bevor ein Held die Gruppe verlässt (nichts geht verloren)
function stripGear(state, h) {
  if (!h.equip) return;
  for (const k of Object.keys(h.equip)) if (h.equip[k]) { state.inv[h.equip[k]] = (state.inv[h.equip[k]] || 0) + 1; h.equip[k] = null; }
}
export function recruitHero(state, data, spec) {
  if (state.combat) return { error: 'in-combat' };
  const res = (state.reserve = state.reserve || []);
  if (res.length >= RESERVE_MAX) return { error: 'full' };
  const name = typeof spec.name === 'string' ? spec.name.trim() : '';
  if (!name) return { error: 'name' };
  if (name.length > NAME_MAX || BAD_NAME_CHARS.test(name)) return { error: 'name-bad' };
  if (nameTaken(state, name)) return { error: 'name-taken' };
  if (!has(data.races, spec.race) || !has(data.classes, spec.cls)) return { error: 'spec' };
  const cost = recruitCost(state, data);
  if (state.gold < cost) return { error: 'gold', cost };
  state.gold -= cost;
  const h = createHero(data, { name, race: spec.race, cls: spec.cls, look: randInt(state, 0, 99) }, 0);
  state.hid = (state.hid || 0) + 1; h.id = 'n' + state.hid;
  const lv = partyAvgLevel(state), t = (data.progression && data.progression.xp) || [];
  h.xp = lv > 1 ? t[lv - 2] : 0; h.level = lv;
  refreshHeroStats(data, h); h.hp = h.maxHp; h.mp = h.maxMp;
  res.push(h);
  return { msg: `${h.name} (${h.role}, Stufe ${h.level}) wartet nun in der Taverne. Kosten: ${cost} Gold.`, sfx: 'ui', hero: h };
}
// Tauscht Gruppenplatz pi mit Reserveplatz ri. Der Neue behält Reihe und Werte; Ausrüstung des Gehenden geht ins Inventar.
export function swapHero(state, data, pi, ri) {
  if (state.combat) return { error: 'in-combat' };
  const res = state.reserve || [], out = state.heroes[pi], inn = res[ri];
  if (!out || !inn) return { error: 'bad-index' };
  const front = state.heroes.some((h, i) => i !== pi && h.row === 'front') || inn.row === 'front';
  if (!front) return { error: 'no-front' };
  stripGear(state, out);
  state.heroes[pi] = inn; res[ri] = out;
  return { msg: `${inn.name} kommt in die Gruppe, ${out.name} wartet in der Taverne. (Ausrüstung von ${out.name} liegt im Beutel.)`, sfx: 'ui' };
}
export function dismissReserve(state, data, ri) {
  if (state.combat) return { error: 'in-combat' };
  const res = state.reserve || [], h = res[ri];
  if (!h) return { error: 'bad-index' };
  stripGear(state, h);
  res.splice(ri, 1);
  return { msg: `${h.name} verlässt die Taverne. (Ausrüstung liegt im Beutel.)`, sfx: 'ui' };
}

// Frischer Zustand eines Gebiets (Objekte, Erkundung, Notizen)
function freshObj(data, o) {
  const c = clone(o);
  if (o.type === 'door') c.open = false;
  if (o.type === 'chest') c.open = false;
  if (o.type === 'gate' || o.type === 'secret') c.open = false;
  if (o.type === 'lever') c.used = false;
  if (o.type === 'enemy') { c.hp = data.enemies[o.kind].hp; c.dead = false; }
  return c;
}
function freshArea(data, levelId) {
  const lvl = data.levels[levelId];
  const objs = lvl.objects.map((o) => freshObj(data, o));
  return { objs, seen: new Array(lvl.map[0].length * lvl.map.length).fill(0), notes: [] };
}

// Debug (0.16.7): aktuelles Gebiet auf den Ausgangszustand setzen (Gegner, Truhen, Türen, Hebel wie neu; Karte und Notizen bleiben).
// Dient zum erneuten Testen, z. B. nach geänderten Gegnerwerten. Nicht im Kampf.
export function resetArea(state, data) {
  if (state.combat) return { ok: false };
  state.objs = freshArea(data, state.levelId).objs;
  for (const k of Object.keys(state.flags)) if (k.startsWith('intro:') && state.objs.some((o) => 'intro:' + o.id === k)) delete state.flags[k];
  const lvl = getLevel(data, state);
  state.player = { x: lvl.start.x, y: lvl.start.y, dir: lvl.start.dir };
  markSeen(state, data);
  return { ok: true };
}
export function newGame(data, seed = 20260101, party = null, difficulty = 'normal') {
  const lvl = data.levels[data.startLevel];
  const a = freshArea(data, data.startLevel);
  const state = {
    rng: seed >>> 0,
    difficulty: data.difficulty && data.difficulty[difficulty] ? difficulty : 'normal',
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
// Ankunftsrichtung (0.16.9): Blick nie direkt gegen eine Wand. Ist das Feld vor dem Spieler Wand, wird zur Richtung mit dem längsten freien Weg gedreht.
export function arrivalDir(target, to) {
  const run = (d) => { let n = 0, x = to.x, y = to.y; while (n < 30 && cellChar(target, x += DIRS[d].dx, y += DIRS[d].dy) === '.') n++; return n; };
  if (run(to.dir) > 0) return to.dir;
  let best = to.dir, bn = 0;
  for (let d = 0; d < 4; d++) { const n = run(d); if (n > bn) { bn = n; best = d; } }
  return best;
}
// 0.47.3 (Nutzer: Seitliches Hereinziehen an Treppen/Durchgängen „weiterhin nicht gelöst“). Ursache (nachgestellt, 45 von 82 Eintritten): 0.46.0 sperrte nur Seitwärtsgehen;
// wer VORWÄRTS parallel zur Wand mit dem Treppenbild über das Treppenfeld lief, löste den Wechsel trotzdem aus. Jetzt zählt die Bewegungsrichtung:
// Treppe/Ausgang an einer Wand → nur Richtung dieser Wand (Ecke: Wand am Ende des längsten freien Gangs, wie render.js passFaces); Durchgang zwischen zwei gegenüberliegenden
// Wänden → nur entlang des Gangs; frei stehend → entlang der Spriteachse (wie render.js freeAxis). Optional `enter: [Richtungen]` am Objekt überschreibt.
export function passEntryDirs(lvl, o) {
  if (Array.isArray(o.enter)) return o.enter;
  const w = (x, y) => isWallChar(cellChar(lvl, x, y));
  const W = [0, 1, 2, 3].map((d) => w(o.x + DIRS[d].dx, o.y + DIRS[d].dy));
  if (W[1] && W[3]) return [0, 2];
  if (W[0] && W[2]) return [1, 3];
  const faces = [0, 1, 2, 3].filter((d) => W[d]);
  if (faces.length === 1) return faces;
  if (faces.length > 1) { // Ecke
    const run = (d) => { let n = 0; while (n < 40 && !w(o.x - DIRS[d].dx * (n + 1), o.y - DIRS[d].dy * (n + 1))) n++; return n; };
    return [faces.reduce((a, b) => (run(b) > run(a) ? b : a))];
  }
  const run = (dx, dy) => { let n = 0; while (n < 12 && !w(o.x + dx * (n + 1), o.y + dy * (n + 1))) n++; return n; }; // frei stehend
  const ns = Math.min(run(0, -1), run(0, 1)), ew = Math.min(run(-1, 0), run(1, 0));
  return ns <= ew ? [0, 2] : [1, 3];
}
// 0.47.9: Die Taverne erscheint erst, wenn die Schratgruben (3. Gebiet nach dem Moorpfad) betreten wurden: Marke 'taverne_offen' baut die Siedlung um (moorrand.alt fügt die Tür hinzu). Alte Stände, die die Taverne schon kennen, behalten sie.
export const TAVERN_FLAG = 'taverne_offen', TAVERN_AREA = 'schratgruben';
function unlockWorld(state) {
  state.flags = state.flags || {};
  if (state.flags[TAVERN_FLAG]) return false;
  const seen = (id) => state.levelId === id || !!(state.areas && state.areas[id]);
  if (seen(TAVERN_AREA) || seen('taverne')) { state.flags[TAVERN_FLAG] = true; return true; }
  return false;
}
export function changeArea(state, data, stairsId) {
  const st = state.objs.find((o) => o.id === stairsId && o.type === 'stairs');
  if (!st || !st.to) return { ok: false, msg: 'Hier führt nichts weiter.' };
  return travelTo(state, data, st.to, st.msg);
}
// Gebietswechsel zu einem Ziel { level, x, y, dir } (Treppe oder Fähre, 0.28.0)
export function travelTo(state, data, to, msg) {
  const target = data.levels[to.level];
  if (!target) return { ok: false, msg: 'Das Ziel ist unbekannt.' };
  if (cellChar(target, to.x, to.y) !== '.') return { ok: false, msg: 'Der Weg ist versperrt.' };
  state.areas = state.areas || {};
  state.areas[state.levelId] = { objs: state.objs, seen: state.seen, notes: state.notes };
  const a = state.areas[to.level] || freshArea(data, to.level);
  delete state.areas[to.level];
  state.levelId = to.level;
  state.objs = a.objs; state.seen = a.seen; state.notes = a.notes || [];
  state.player = { x: to.x, y: to.y, dir: arrivalDir(target, to) };
  if (unlockWorld(state)) syncStatic(state, data);
  markSeen(state, data);
  return { ok: true, msg: msg || `Du erreichst: ${target.name}.`, levelName: target.name };
}

// Truhen-Wächter (0.16.4): game.json → chest.guard = [Gegner-Objekt-IDs im selben Gebiet]. Solange einer davon lebt, bleibt die Truhe zu.
// Gelesen aus den Spieldaten (nicht aus dem Spielstand), damit alte Stände die Regel ohne Migration bekommen.
export function chestGuards(state, data, o) {
  const def = (getLevel(data, state).objects || []).find((q) => q.id === o.id);
  return (def && def.guard) || o.guard || [];
}
export function chestGuarded(state, data, o) {
  const g = chestGuards(state, data, o);
  return g.some((id) => { const e = state.objs.find((q) => q.id === id); return e && e.type === 'enemy' && !e.dead; });
}
// 0.32.1: Türen mit `autoClose` (Haustür der Schatzinsel) fallen hinter der Gruppe zu: beim Verlassen des Türfelds, sonst ab 3 Feldern Abstand.
function autoCloseDoors(state, ox, oy) {
  const msgs = [], p = state.player;
  for (const o of state.objs) {
    if (o.type !== 'door' || !o.autoClose || !o.open) continue;
    const left = o.x === ox && o.y === oy && !(p.x === o.x && p.y === o.y), far = Math.abs(o.x - p.x) + Math.abs(o.y - p.y) >= 3;
    if (left || far) { o.open = false; if (left) msgs.push('Die Tür fällt hinter euch ins Schloss.'); }
  }
  return msgs;
}
export function blockerAt(state, x, y) {
  for (const o of state.objs) {
    if (o.x !== x || o.y !== y) continue;
    if (o.type === 'door' && !o.open) return o;
    if (o.type === 'chest' && !o.open) return o; // geöffnete Truhen sind begehbar
    if ((o.type === 'gate' || o.type === 'secret') && !o.open) return o; // secret = Geheimwand: sieht aus wie Mauer mit feinem Riss
    if (o.type === 'lever' || o.type === 'boulder') return o; // boulder = beweglicher Stein (0.19.0)
    if (o.type === 'npc' && !o.gone) return o; // 0.25.0: Begegnungsperson
    if (o.type === 'decor') return o; // 0.28.0: feste Dekoration (Boot)
    if (o.type === 'barrel' && !o.broken) return o; // 0.44.0: zerschlagbares Fass; Trümmer sind begehbar
    if (o.type === 'merchant' || o.type === 'runestone' || (o.type === 'sign' && o.face == null)) return o; // Tafel mit face hängt an der Wand und versperrt nichts (0.16.8)
    if (o.type === 'enemy' && !o.dead && !o.lurk) return o; // 0.47.17: verborgener Gegner (lurk) steht noch nicht im Raum
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

// Entdeckt-werden (0.16.10, Nutzerwunsch): ein lebender Gegner in Sichtlinie und höchstens data.spot.range Feldern Abstand (0.16.15: 1 Feld, nur gerade Nachbarfelder) greift an.
// Steht er nicht in Blickrichtung (gleiche Zeile/Spalte vor der Gruppe), ist es ein Überfall: die Gegner ziehen in Runde 1 zuerst.
// Himmelsrichtung (0=N,1=O,2=S,3=W) vom Spieler zum Gegner: die Achse mit dem größeren Abstand
export function dirToward(p, o) {
  const dx = o.x - p.x, dy = o.y - p.y;
  if (dx === 0 && dy === 0) return p.dir;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 2 : 0) : p.dir;
}
export function spottedEnemy(state, data) {
  const range = (data.spot && data.spot.range) || 1;
  const lvl = getLevel(data, state), p = state.player, d = DIRS[p.dir];
  const at = (x, y) => state.objs.filter((o) => o.x === x && o.y === y);
  const blocked = (x, y) => isWallChar(cellChar(lvl, x, y)) || at(x, y).some((o) => (o.type === 'door' && !o.open) || (o.type === 'secret' && !o.open) || (o.type === 'lever' && o.wall) || (o.type === 'illusion' && !o.found));
  let best = null, bd = 99;
  for (const o of state.objs) {
    if (o.type !== 'enemy' || o.dead || o.lurk) continue;
    const dx = o.x - p.x, dy = o.y - p.y, dist = Math.abs(dx) + Math.abs(dy); // Feldabstand in Schritten (0.16.15: nur gerade Nachbarfelder, nie schräg – sonst steht der Gegner außerhalb des Bilds)
    if (dist === 0 || dist > range || dist >= bd) continue;
    const ax = p.x + 0.5, ay = p.y + 0.5, n = Math.ceil(Math.hypot(dx, dy) * 10);
    let seen = true;
    for (let i = 1; i < n && seen; i++) {
      const cx = Math.floor(ax + dx * i / n), cy = Math.floor(ay + dy * i / n);
      if ((cx === p.x && cy === p.y) || (cx === o.x && cy === o.y)) continue;
      if (blocked(cx, cy)) seen = false;
    }
    if (seen) { best = o; bd = dist; }
  }
  if (!best) return null;
  const ahead = (best.x - p.x) * d.dy === 0 && (best.y - p.y) * d.dx === 0 && ((best.x - p.x) * d.dx + (best.y - p.y) * d.dy) > 0;
  return { enemy: best, ambush: !ahead };
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
    if (b && (b.type === 'door' || b.type === 'secret' || (b.type === 'lever' && b.wall))) break;
    if (illusionAt(state, cx, cy)) break; // Illusionswand verdeckt wie eine Mauer
  }
}
// Illusionswand (0.22.0): { type: 'illusion', x, y } auf einer Bodenzelle; sieht aus wie Mauer, ist begehbar. found = einmal durchschritten (danach offen sichtbar).
// Teleportfeld (0.23.0): { type: 'teleport', x, y, to: {x, y, dir?}, look: 'visible'|'hidden', open? } – open = abgeschaltet (z. B. per Hebel). Versperrt nichts.
export const teleportAt = (state, x, y) => state.objs.find((o) => o.type === 'teleport' && !o.open && o.x === x && o.y === y) || null;
export const illusionAt = (state, x, y) => state.objs.find((o) => o.type === 'illusion' && !o.found && o.x === x && o.y === y) || null;

// ---------- Bewegung ----------
function blockedText(b) {
  if (b.type === 'door') return b.locked ? 'Die Tür ist verschlossen.' : 'Die Tür ist geschlossen.';
  if (b.type === 'chest') return 'Eine Truhe versperrt den Weg.';
  if (b.type === 'merchant') return 'Der Stand der Händlerin versperrt den Weg.';
  if (b.type === 'npc') return `${b.name || 'Jemand'} steht im Weg. Mit ◉ sprichst du an.`;
  if (b.type === 'sign') return 'Eine Hinweistafel steht im Weg.';
  if (b.type === 'runestone') return 'Ein Runenstein. Die Zeichen glimmen schwach.';
  if (b.type === 'gate') return b.look ? 'Eine schwere Steinplatte versperrt den Weg.' : 'Ein Fallgitter versperrt den Weg.';
  if (b.type === 'secret' && b.needs) return 'Die Wand stimmt mit dem Kreuz auf eurer Schatzkarte überein. ◉ untersucht sie.';
  if (b.type === 'secret') return 'Eine Wand. Durch die Fugen läuft ein feiner Riss.';
  if (b.type === 'lever') return b.torch ? 'Eine Wandfackel. Ihre Halterung sitzt locker.' : b.wall ? 'Ein Stein in der Wand sitzt locker.' : 'Ein Wandhebel steht im Weg.';
  if (b.type === 'barrel') return 'Ein Fass versperrt den Weg. ◉ zerschlägt es.';
  if (b.type === 'decor') return DECOR_TEXT[b.look] || 'Hier steht etwas im Weg.'; // 0.38.1: Einrichtung hieß fälschlich „Gegner“
  if (b.type === 'enemy') return 'Ein Gegner steht im Weg.';
  return 'Hier steht etwas im Weg.';
}
const DECOR_TEXT = { feuerschale: 'Eine Feuerschale steht im Weg.', fass: 'Ein Fass versperrt den Weg.', schutt: 'Ein Schutthaufen versperrt den Weg.', palme: 'Eine Palme steht im Weg.', kaktus: 'Ein Kaktus steht im Weg.', tisch: 'Ein Tisch steht im Weg.', stuhl: 'Ein Stuhl steht im Weg.', boot: 'Ein Boot liegt im Weg.', kamin: 'Ein Kamin versperrt den Weg.', regal: 'Ein Regal versperrt den Weg.', bett: 'Ein Bett steht im Weg.', haengematte: 'Eine Hängematte hängt im Weg.', kueche: 'Der Herd versperrt den Weg.', vase: 'Eine Vase steht im Weg.', tresen: 'Der Tresen versperrt den Weg.', weinregal: 'Ein Weinregal versperrt den Weg.', weinfass: 'Ein Weinfass versperrt den Weg.', gast0: 'Ein Gast sitzt im Weg.', gast1: 'Ein Gast sitzt im Weg.', gast2: 'Ein Gast sitzt im Weg.' };

// rel: 'f' vor, 'b' zurück, 'l' seitwärts links, 'r' seitwärts rechts
export function tryMove(state, data, rel) {
  const lvl = getLevel(data, state);
  const p = state.player;
  const d = rel === 'f' ? p.dir : rel === 'b' ? (p.dir + 2) % 4 : rel === 'l' ? (p.dir + 3) % 4 : (p.dir + 1) % 4;
  const nx = p.x + DIRS[d].dx, ny = p.y + DIRS[d].dy;
  { const cc = cellChar(lvl, nx, ny); if (cc === '~') return { moved: false, wall: true, msg: lvl.waterMsg || 'Das Wasser ist tief und kalt. Hier kommt ihr nicht durch.' };
    if (isWallChar(cc)) { // 0.49.7 (Nutzer-Freigabe, Rückfrage zu 0.47.6): steht die Gruppe schon auf dem Treppenfeld (z. B. seitlich hineingekommen) und geht „Vor“ in Richtung der Treppenwand, löst das den Wechsel aus
      const st0 = rel === 'f' && state.objs.find((o) => o.type === 'stairs' && o.x === p.x && o.y === p.y);
      if (st0 && passEntryDirs(lvl, st0).includes(d)) return { moved: false, wall: true, stairsHere: st0.id };
      return { moved: false, wall: true }; }
  } // 0.47.6: sonst bleibt Wand voraus nur Wand
  let b = blockerAt(state, nx, ny);
  const pushNotes = [];
  if (b && b.type === 'boulder') {
    if (rel !== 'f') return { moved: false, msg: 'Ein schwerer Stein. Von vorn dagegenlaufen schiebt ihn, ◉ zieht ihn.', blocker: b };
    const tx = nx + DIRS[d].dx, ty = ny + DIRS[d].dy;
    if (!freeFor(state, data, tx, ty)) return { moved: false, msg: 'Der Stein lässt sich nicht weiter schieben. ◉ zieht ihn zurück.', blocker: b };
    moveBoulder(state, data, b, tx, ty, pushNotes);
    pushNotes.unshift('Der Stein schabt ein Feld weiter.');
    b = null;
  }
  if (b) {
    if (b.type === 'secret' && b.needs && !hasMap(state, b)) return { moved: false, wall: true }; // 0.40.0: Kartenwand ohne Karte = gewöhnliche Mauer
    if (b.type === 'enemy' && rel === 'f') return { moved: false, encounter: b };
    return { moved: false, msg: blockedText(b), blocker: b };
  }
  const tr0 = trapAt(state, nx, ny);
  if (tr0 && tr0.spotted && state.trapAsk !== tr0.id) { state.trapAsk = tr0.id; return { moved: false, msg: `Vor dir liegt eine Falle (${data.traps.kinds[tr0.kind].name}). ◉ entschärfen – oder noch einmal gehen, um hineinzutreten.`, trapWarn: true }; }
  state.trapAsk = null;
  const ox = p.x, oy = p.y;
  p.x = nx; p.y = ny;
  const closeMsgs = autoCloseDoors(state, ox, oy);
  state.steps++;
  const ill = illusionAt(state, nx, ny);
  if (ill) ill.found = true;
  markSeen(state, data);
  const res = { moved: true, events: [] };
  if (ill) res.events.push({ type: 'illusion', id: ill.id, msg: ill.msg || 'Ihr geht durch die Wand hindurch – sie war nur ein Trugbild!' });
  const tp = teleportAt(state, nx, ny);
  if (tp) { // 0.23.0: Teleportfeld – sichtbar (Lichtkreis, Meldung) oder versteckt (keine Meldung, nur andere Umgebung/Kompass)
    tp.used = true;
    p.x = tp.to.x; p.y = tp.to.y; if (tp.to.dir != null) p.dir = tp.to.dir;
    markSeen(state, data);
    res.events.push({ type: 'teleport', id: tp.id, hidden: tp.look === 'hidden', msg: tp.look === 'hidden' ? '' : tp.msg || 'Ein Sog erfasst euch – plötzlich steht ihr woanders!' });
  }
  if (tr0) res.events.push({ type: 'trap', id: tr0.id, msgs: springTrap(state, data, tr0) });
  const pm = [...pushNotes, ...updatePlates(state, data), ...closeMsgs];
  if (pushNotes.length || pm.length) res.events.push({ type: 'mech', msgs: pm, push: true });
  const exAny = state.objs.find((o) => o.type === 'exit' && o.x === nx && o.y === ny);
  const ex = exAny && passEntryDirs(lvl, exAny).includes(d) ? exAny : null; // 0.47.3: auch Ausgänge nur beim Betreten in Durchgangsrichtung
  if (ex && !state.flags[ex.id]) {
    state.flags[ex.id] = true;
    res.events.push({ type: 'exit', id: ex.id });
  } else if (ex) res.events.push({ type: 'exitAgain', id: ex.id }); // 0.16.4: erneutes Betreten zeigt einen kurzen Hinweis
  const stairs = state.objs.find((o) => o.type === 'stairs' && o.x === nx && o.y === ny);
  if (stairs && rel === 'f' && passEntryDirs(lvl, stairs).includes(d)) { res.events.push({ type: 'stairs', id: stairs.id }); return res; } // 0.46.0: nur frontales Betreten löst den Gebietswechsel aus, seitliches Vorbeigehen nicht
  roomMark(state, data);
  const scn = sceneCheck(state, data);
  if (scn) { res.events.push({ type: 'scene', id: scn.id, title: scn.title, text: scn.text, slam: scn.slam }); res.encounter = scn.enemy; res.ambush = false; return res; }
  res.encounter = enemyInFront(state);
  if (!res.encounter) { const sp = spottedEnemy(state, data); if (sp) { res.encounter = sp.enemy; res.ambush = sp.ambush; } }
  if (!res.encounter) { const notes = [...scanTraps(state, data), ...scanSecrets(state, data), ...scanBuried(state, data), ...scanLuck(state, data)]; if (notes.length) res.notes = notes; }
  return res;
}

// 0.48.1: Marke `kammer` solange die Gruppe in/vor dem Raum der Szene steht (Palette „schwarzmoos“ über lvl.alt); erweiterte Zone = Szenenzone + 2 Felder davor
function roomMark(state, data) {
  const sc = getLevel(data, state).scene, p = state.player;
  if (!sc || !sc.door || !sc.room) return;
  const z = sc.room, on = p.x >= z.x1 && p.x <= z.x2 && p.y >= z.y1 && p.y <= z.y2;
  if (!!state.flags.kammer !== on) state.flags.kammer = on;
}
// ---------- Auftritt in einem Gebiet (0.47.17) ----------
// levels.<id>.scene = { id, enemy: <Objekt-ID>, zone: {x1,y1,x2,y2}, title, text, endMsg }; der Gegner trägt in game.json `lurk: true` (unsichtbar, nicht entdeckbar, versperrt nichts).
// Betritt die Gruppe die Zone, erscheint er 2 (sonst 3, 1) Felder vor ihr (sonst seitlich/hinten), Marke state.flags[scene.id] = true (Gebietsumbau `alt` mit dieser Marke), dann beginnt der Kampf.
// Nach dem Sieg endet der Albtraum: Marke false (finishVictory).
const SC_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export function sceneCheck(state, data) {
  const lvl = getLevel(data, state), sc = lvl && lvl.scene;
  if (!sc || state.combat) return null;
  const en = state.objs.find((o) => o.id === sc.enemy && o.type === 'enemy');
  if (!en || en.dead || !en.lurk) return null;
  const p = state.player, z = sc.zone;
  if (p.x < z.x1 || p.x > z.x2 || p.y < z.y1 || p.y > z.y2) return null;
  const clearLine = (d, k) => { for (let j = 1; j <= k; j++) { const x = p.x + SC_DIRS[d][0] * j, y = p.y + SC_DIRS[d][1] * j; if (cellChar(lvl, x, y) !== '.' || (j < k && blockerAt(state, x, y)) || (j === k && !freeFor(state, data, x, y))) return false; } return true; };
  let spot = null;
  if (sc.spot && freeFor(state, data, sc.spot.x, sc.spot.y)) spot = { x: sc.spot.x, y: sc.spot.y }; // 0.48.1: fester Platz im Raum (der Schrat bleibt, wo er war)
  if (!spot) for (const d of [p.dir, (p.dir + 1) % 4, (p.dir + 3) % 4, (p.dir + 2) % 4]) { for (const k of [2, 3, 1]) if (clearLine(d, k)) { spot = { x: p.x + SC_DIRS[d][0] * k, y: p.y + SC_DIRS[d][1] * k }; break; } if (spot) break; }
  if (!spot) return null;
  en.x = spot.x; en.y = spot.y; en.lurk = false;
  if (sc.door) { const dr = state.objs.find((o) => o.id === sc.door && o.type === 'door'); if (dr) { dr.open = false; dr.locked = true; dr.sealed = true; dr.bolt = null; } } // 0.48.1: Tür fällt zu und bleibt zu, bis der Albtraum endet
  state.flags[sc.id] = true;
  state.flags['intro:' + en.id] = true; // der Auftritt ersetzt die Boss-Ansage
  return { type: 'scene', id: sc.id, title: sc.title, text: sc.text, enemy: en, slam: !!sc.door };
}

// ---------- Druckplatten und bewegliche Steine (0.19.0) ----------
// plate: { id, type: 'plate', x, y, gate: <Gitter/Geheimwand>, hold? } – versperrt nichts. Belastet durch die Gruppe oder einen Stein.
//   hold: true = das Ziel ist nur offen, solange die Platte belastet ist (Stein draufschieben); sonst rastet es beim ersten Betreten ein.
// boulder: { id, type: 'boulder', x, y } – versperrt das Feld. Dagegenlaufen schiebt ihn ein Feld weiter, ◉ zieht ihn (Gruppe geht einen Schritt zurück).
//   Ein Stein löst eine Falle aus, ohne dass jemand Schaden nimmt.
const freeFor = (state, data, x, y) => !isWallChar(cellChar(getLevel(data, state), x, y)) && !blockerAt(state, x, y) && !state.objs.some((o) => o.x === x && o.y === y && (o.type === 'stairs' || o.type === 'exit' || (o.type === 'chest')));
export function updatePlates(state, data) {
  const msgs = [], p = state.player;
  for (const pl of state.objs) {
    if (pl.type !== 'plate') continue;
    const down = (p.x === pl.x && p.y === pl.y) || state.objs.some((o) => o.type === 'boulder' && o.x === pl.x && o.y === pl.y);
    const gate = state.objs.find((o) => o.id === pl.gate);
    if (down && !pl.down) msgs.push('Die Steinplatte sinkt mit einem Knirschen ein.');
    if (!down && pl.down && pl.hold) msgs.push('Die Platte hebt sich wieder.');
    pl.down = down;
    if (!gate) continue;
    if (pl.hold) {
      const want = down || (p.x === gate.x && p.y === gate.y); // niemand wird eingeklemmt
      if (want !== !!gate.open) { gate.open = want; msgs.push(want ? 'In der Nähe hebt sich ein Gitter.' : 'Das Gitter fällt rasselnd wieder zu.'); }
    } else if (down && !gate.open) { gate.open = true; pl.latched = true; msgs.push('Etwas rastet ein. In der Nähe öffnet sich ein Durchgang.'); }
  }
  return msgs;
}
function moveBoulder(state, data, b, x, y, msgs) {
  b.x = x; b.y = y;
  const t = trapAt(state, x, y);
  if (t) { t.sprung = true; t.spotted = true; msgs.push(`Der Stein rollt auf eine Falle (${data.traps.kinds[t.kind].name}). Sie löst aus, ohne jemanden zu treffen.`); }
}
export function pullBoulder(state, data, b) {
  const p = state.player, back = (p.dir + 2) % 4, bx = p.x + DIRS[back].dx, by = p.y + DIRS[back].dy;
  if (!freeFor(state, data, bx, by)) return { msg: 'Hinter euch ist kein Platz, um den Stein zu ziehen. Dagegenlaufen schiebt ihn.', sfx: 'bump' };
  const ox = p.x, oy = p.y, msgs = ['Ihr zieht den Stein ein Feld zurück.'];
  p.x = bx; p.y = by; state.steps++;
  const t = trapAt(state, bx, by);
  if (t) msgs.push(...springTrap(state, data, t));
  moveBoulder(state, data, b, ox, oy, msgs);
  markSeen(state, data);
  msgs.push(...updatePlates(state, data));
  return { msg: msgs.join(' '), sfx: 'door', changed: true, moved: true };
}

// ---------- Fallen (0.18.0) ----------
// Objekt: { id, type: 'trap', x, y, kind } mit Zustand spotted (entdeckt), sprung (ausgelöst), disarmed (entschärft). Versperrt nichts.
// data.traps = { spot: Grundchance %, disarm: Grundchance %, kinds: { <art>: { name, pct (Schaden in % der Max-LP), rows: 'front'|'all', mp?, text } } }
// Entdecken: (1) automatisch mit Wurf, wenn die Falle geradeaus liegt: je ein Wurf bei 2 Feldern und bei 1 Feld Abstand; (2) immer durch ◉ auf das Feld davor (Boden untersuchen);
// (3) der Spieler sieht die feine Spur am Boden oder liest einen Hinweis. Talent „trap“ (Prozent, bester lebender Held) erhöht Entdecken und Entschärfen.
export const trapSkill = (state, data) => Math.max(0, ...state.heroes.map((h) => (h.hp > 0 ? fxSum(data, h, 'trap') : 0))); // 0.32.1: auch Ausrüstung (Glücksamulett)
const trapLive = (o) => o && o.type === 'trap' && !o.sprung && !o.disarmed;
export const trapAt = (state, x, y) => state.objs.find((o) => trapLive(o) && o.x === x && o.y === y) || null;
export function scanTraps(state, data) {
  const out = [], cfg = data.traps;
  if (!cfg) return out;
  const lvl = getLevel(data, state), p = state.player, d = DIRS[p.dir], skill = trapSkill(state, data);
  // 0.19.9: zwei unabhängige Würfe je Falle (bei 2 Feldern Abstand und noch einmal direkt davor), für alle Gruppen – vorher meist erst nach dem Auslösen bemerkt.
  for (let k = 1; k <= 2; k++) {
    const x = p.x + d.dx * k, y = p.y + d.dy * k;
    if (isWallChar(cellChar(lvl, x, y)) || blockerAt(state, x, y)) break;
    const t = trapAt(state, x, y);
    if (!t || t.spotted || t.checked) continue;
    if (k === 2) { if (t.far) continue; t.far = true; } else t.checked = true;
    if (rand(state) * 100 < (cfg.spot || 35) + skill) {
      t.spotted = true;
      const who = state.heroes.filter((h) => h.hp > 0).sort((a, b) => talentSum(data, b, 'trap') - talentSum(data, a, 'trap'))[0];
      out.push(`${who ? who.name : 'Jemand'} bemerkt eine Falle ${k === 1 ? 'direkt voraus' : 'zwei Schritte voraus'}: ${cfg.kinds[t.kind].name}. ◉ entschärft sie.`);
      break;
    }
  }
  return out;
}
// Auslösen: Schaden in Prozent der Max-LP (Vorderreihe oder alle), niemand fällt unter 1 LP. factor < 1 z. B. bei misslungenem Entschärfen.
export function springTrap(state, data, t, factor = 1) {
  const k = data.traps.kinds[t.kind], msgs = [`${k.text}`], parts = [];
  t.sprung = true; t.spotted = true;
  state.heroes.forEach((h) => {
    if (h.hp <= 0 || (k.rows === 'front' && h.row !== 'front' && state.heroes.some((x) => x.hp > 0 && x.row === 'front'))) return;
    const dmg = Math.max(1, Math.round((h.maxHp * k.pct * factor) / 100)), before = h.hp;
    h.hp = Math.max(1, h.hp - dmg);
    if (k.mp) h.mp = Math.max(0, h.mp - k.mp);
    parts.push(`${h.name} −${before - h.hp}`);
  });
  msgs.push(`${k.name}: ${parts.join(', ')} LP${k.mp ? `, alle Getroffenen −${k.mp} Mana/Ausdauer` : ''}.`);
  return msgs;
}
export function disarmTrap(state, data, t) {
  const chance = Math.min(95, (data.traps.disarm || 55) + trapSkill(state, data));
  if (rand(state) * 100 < chance) { t.disarmed = true; return { msg: `Die Falle (${data.traps.kinds[t.kind].name}) ist entschärft.`, sfx: 'ui', ok: true }; }
  const msgs = springTrap(state, data, t, 0.5);
  return { msg: `Das Entschärfen misslingt! ${msgs.join(' ')}`, sfx: 'hurt', ok: false, long: true };
}

export function turn(state, data, delta) {
  state.player.dir = (state.player.dir + delta + 4) % 4;
  markSeen(state, data);
  const front = enemyInFront(state);
  if (front) return { encounter: front };
  const sp = spottedEnemy(state, data);
  if (sp) return { encounter: sp.enemy, ambush: sp.ambush };
  const notes = [...scanTraps(state, data), ...scanSecrets(state, data), ...scanBuried(state, data), ...scanLuck(state, data)];
  return notes.length ? { encounter: null, notes } : { encounter: null };
}

// 0.22.1 (Nutzerwunsch): neu erhaltene Gegenstände tragen im Inventar „● neu“, bis das Inventar wieder geschlossen wird.
// state.newItems = { <itemId|uid>: true } (optional, fehlt bei alten Ständen).
export function markNew(state, id) { (state.newItems = state.newItems || {})[id] = true; }
export function clearNew(state) { if (state.newItems) state.newItems = {}; }
export const isNew = (state, id) => !!(state.newItems && state.newItems[id] && (state.inv[id] || 0) > 0);

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
    markNew(state, e.item);
    parts.push(it.kind === 'quest' ? it.name : `${n}× ${it.name}`);
  }
  return parts.join(', ');
}

// ---------- Truhenarten und Talente außerhalb des Kampfes (0.20.0) ----------
// Truhe in game.json: lock (Schwierigkeit in Prozentpunkten), key (Schlüssel-Item), trap (Fallenart aus data.traps.kinds), mimic (Gegnerart: die Truhe ist ein Monster), look ('prunk').
// Gelesen aus den Spieldaten wie chest.guard, damit alte Spielstände die Arten ohne Migration bekommen. Zustand (unlocked, jammed, trapSeen, trapDone, warned) liegt im Objekt.
// data.chests = { pick: Grundchance Schloss %, trapSpot: Grundchance Falle bemerken %, mimicWarn: Grundchance Monster bemerken % (nur mit Talent) }.
// Talente: lock (Schlösser), secret (Geheimwände spüren), haggle (Händlerpreise), trap (Fallen) – jeweils der beste wache Held zählt.
export const partySkill = (state, data, key) => Math.max(0, ...state.heroes.map((h) => (h.hp > 0 ? talentSum(data, h, key) : 0)));
const bestAt = (state, data, key) => state.heroes.filter((h) => h.hp > 0).sort((a, b) => talentSum(data, b, key) - talentSum(data, a, key))[0] || null;
export function chestCfg(state, data, o) {
  const def = (getLevel(data, state).objects || []).find((q) => q.id === o.id) || {};
  const out = {};
  for (const k of ['lock', 'key', 'trap', 'mimic', 'look']) { const v = def[k] !== undefined ? def[k] : o[k]; if (v !== undefined) out[k] = v; }
  return out;
}
const chestRules = (data) => ({ pick: 40, trapSpot: 30, mimicWarn: 25, ...(data.chests || {}) });
export function pickChest(state, data, o, cfg) {
  if (cfg.key && (state.inv[cfg.key] || 0) > 0) { o.unlocked = true; return { ok: true, msg: 'Der Schlüssel passt.' }; }
  if (o.jammed) return { msg: 'Das Schloss klemmt nach dem letzten Versuch. Nach einer Rast könnt ihr es noch einmal versuchen.', sfx: 'bump' };
  const skill = partySkill(state, data, 'lock'), tools = state.inv.dietrich || 0, who = bestAt(state, data, 'lock');
  if (!cfg.lock) return { msg: 'Die Truhe ist verschlossen. Irgendwo muss der passende Schlüssel sein.', sfx: 'bump' };
  if (skill <= 0 && tools <= 0) return { msg: 'Die Truhe ist verschlossen. Ohne Dietrich oder geübte Hand geht hier nichts. Hedda verkauft Dietriche.', sfx: 'bump' };
  const chance = Math.max(5, Math.min(95, chestRules(data).pick + skill - cfg.lock));
  const ok = rand(state) * 100 < chance;
  if (skill > 0) {
    if (ok) { o.unlocked = true; return { ok: true, msg: `${who.name} knackt das Schloss.`, changed: true }; }
    if (tools > 0) { state.inv.dietrich--; return { msg: `${who.name} rutscht ab, der Dietrich bricht. ◉ versucht es noch einmal (Dietriche übrig: ${state.inv.dietrich}).`, sfx: 'bump', changed: true }; }
    o.jammed = true;
    return { msg: `${who.name} rutscht ab. Das Schloss klemmt – erst nach einer Rast neu versuchen, oder mit einem Dietrich.`, sfx: 'bump', changed: true };
  }
  if (ok) { o.unlocked = true; return { ok: true, msg: 'Mit dem Dietrich springt das Schloss auf.', changed: true }; }
  state.inv.dietrich--;
  return { msg: `Der Dietrich bricht ab.${state.inv.dietrich > 0 ? ` ◉ versucht es mit dem nächsten (übrig: ${state.inv.dietrich}).` : ' Keine Dietriche mehr.'}`, sfx: 'bump', changed: true };
}
// Falle an der Truhe: erster Griff = Wurf auf Bemerken (Grundchance + Fallentalent). Bemerkt: ◉ entschärft (wie Bodenfallen). Unbemerkt: sie löst aus, die Truhe öffnet sich trotzdem.
export function chestTrap(state, data, o, cfg) {
  const k = data.traps.kinds[cfg.trap], skill = partySkill(state, data, 'trap');
  if (o.trapSeen) {
    const chance = Math.min(95, (data.traps.disarm || 55) + skill);
    o.trapDone = true;
    if (rand(state) * 100 < chance) return { stop: true, msg: `Die Falle an der Truhe (${k.name}) ist entschärft. ◉ öffnet sie.`, sfx: 'ui', changed: true };
    return { stop: true, msg: `Das Entschärfen misslingt! ${springTrap(state, data, { kind: cfg.trap }, 0.5).join(' ')} ◉ öffnet die Truhe.`, sfx: 'hurt', long: true, changed: true };
  }
  if (!o.trapChk) {
    o.trapChk = true;
    if (rand(state) * 100 < chestRules(data).trapSpot + skill) {
      o.trapSeen = true;
      const who = bestAt(state, data, 'trap');
      return { stop: true, msg: `${who ? who.name : 'Jemand'} bemerkt einen dünnen Draht am Deckel: ${k.name}. ◉ entschärft sie.`, sfx: 'ui', changed: true };
    }
  }
  o.trapDone = true;
  return { msg: springTrap(state, data, { kind: cfg.trap }).join(' ') };
}
// Monstertruhe: mit Fallen- oder Geheimtalent einmalige Warnung, sonst (und beim zweiten Griff) erwacht sie und wird zum Gegner.
export function wakeMimic(state, data, o, cfg) {
  const skill = Math.max(partySkill(state, data, 'trap'), partySkill(state, data, 'secret'));
  if (!o.warnChk) {
    o.warnChk = true;
    if (skill > 0 && rand(state) * 100 < chestRules(data).mimicWarn + skill) {
      const who = state.heroes.filter((h) => h.hp > 0).sort((a, b) => Math.max(talentSum(data, b, 'trap'), talentSum(data, b, 'secret')) - Math.max(talentSum(data, a, 'trap'), talentSum(data, a, 'secret')))[0];
      return { msg: `${who.name} hält inne: Das Holz der Truhe ist warm, und der Deckel hebt sich ganz leicht – als würde sie atmen. ◉ öffnet sie trotzdem.`, sfx: 'ui', long: true, changed: true, warn: true };
    }
  }
  const en = data.enemies[cfg.mimic];
  Object.assign(o, { type: 'enemy', kind: cfg.mimic, hp: en.hp, dead: false, awake: true });
  delete o.open; delete o.loot;
  return { msg: 'Der Deckel klafft auf – Zähne! Die Truhe lebt!', encounter: o, sfx: 'hurt', changed: true };
}
// Geheimwand untersuchen: Hinweis aus den Daten; mit Talent „secret“ zusätzlich die Richtung des Mechanismus.
export function secretHint(state, data, o) {
  const base = o.hint || 'Die Wand klingt hohl. Der Riss ist zu gerade für einen Zufall.';
  const skill = partySkill(state, data, 'secret'), sw = state.objs.find((q) => q.type === 'lever' && q.gate === o.id && !q.used);
  if (skill <= 0 || !sw) return { msg: base, sfx: 'bump' };
  const p = state.player, dx = sw.x - p.x, dy = sw.y - p.y, n = Math.abs(dx) + Math.abs(dy);
  const dir = [dy < 0 && 'Norden', dy > 0 && 'Süden', dx > 0 && 'Osten', dx < 0 && 'Westen'].filter(Boolean);
  const who = bestAt(state, data, 'secret');
  return { msg: `${base} ${who.name} tastet die Fugen ab: Der Mechanismus muss ${n <= 1 ? 'direkt nebenan' : `etwa ${n} Schritte weiter im ${dir.join('-')}`} liegen${sw.torch ? ', eine Fackel mit lockerer Halterung' : sw.wall ? ', ein lockerer Stein' : ''}.`, sfx: 'ui', long: true };
}
// Geheimwände spüren: nach Schritt/Drehung je Geheimwand geradeaus (1–2 Felder) ein Wurf, nur mit Talent „secret“ (Chance 30 + Talent).
// 0.31.11: Vergrabener Schatz (Objekt { type: 'buried', x, y, loot, text, spotBy? }): nur Schurken und Alchemisten (spotBy, Standard) bemerken die aufgewühlte Stelle,
// wenn die Gruppe höchstens 3 Felder entfernt ist. Danach ist ein Hügel sichtbar; ◉ auf dem Feld davor gräbt aus. Alle anderen Gruppen sehen nichts.
export function scanBuried(state, data) {
  const out = [], p = state.player;
  for (const o of state.objs) {
    if (o.type !== 'buried' || o.dug || o.sensed || Math.abs(o.x - p.x) + Math.abs(o.y - p.y) > 3) continue;
    const lucky = luckWearer(state), who = state.heroes.find((h) => h.hp > 0 && (o.spotBy || ['rogue', 'alchemist']).includes(h.cls));
    if (!who && !lucky) continue;
    o.sensed = true; luckMark(state, data, o);
    out.push(who ? `${who.name} bemerkt im Sand eine Stelle, die jemand aufgewühlt hat. ◉ zum Graben.` : `Das Glücksamulett von ${lucky.name} kribbelt: Im Sand liegt etwas vergraben. ◉ zum Graben.`);
  }
  return out;
}
// 0.32.1: Glücksamulett = „Schatzspürer“. Wer es trägt, spürt VERSTECKTE Truhen (o.hidden; 0.32.2: normale Truhen nicht) und vergrabene Schätze im Umkreis von 3 Feldern; sie erscheinen auf der Karte, Vergrabenes wird sichtbar.
export const luckWearer = (state) => state.heroes.find((h) => h.hp > 0 && h.equip && h.equip.amulet === 'gluecksamulett') || null;
function luckMark(state, data, o) { const w = getLevel(data, state).map[0].length; state.seen[o.y * w + o.x] = 1; }
export function scanLuck(state, data) {
  const out = [], p = state.player, lucky = luckWearer(state);
  if (!lucky) return out;
  for (const o of state.objs) {
    if (o.type !== 'chest' || !o.hidden || o.open || o.felt || Math.abs(o.x - p.x) + Math.abs(o.y - p.y) > 3) continue;
    if (chestCfg(state, data, o).mimic) continue; // falsche Truhen bleiben ein Rätsel
    o.felt = true; luckMark(state, data, o);
    out.push(`Das Glücksamulett von ${lucky.name} kribbelt: Eine Truhe ist ganz in der Nähe.`);
  }
  return out;
}
export function scanSecrets(state, data) {
  const skill = partySkill(state, data, 'secret');
  if (skill <= 0) return [];
  const lvl = getLevel(data, state), p = state.player, d = DIRS[p.dir];
  for (let k = 1; k <= 2; k++) {
    const x = p.x + d.dx * k, y = p.y + d.dy * k;
    const sc = state.objs.find((o) => ((o.type === 'secret' && !o.open && !o.needs) || (o.type === 'illusion' && !o.found)) && o.x === x && o.y === y);
    if (sc) {
      if (sc.sensed || sc.sn) return [];
      sc.sn = true;
      if (rand(state) * 100 < 30 + skill) { sc.sensed = true; const who = bestAt(state, data, 'secret'); return [sc.type === 'illusion' ? `${who.name} sieht die Wand ${k === 1 ? 'vor euch' : 'dort vorn'} flimmern – sie ist nur ein Trugbild.` : `${who.name} spürt einen kalten Luftzug: Die Wand ${k === 1 ? 'vor euch' : 'dort vorn'} ist nicht echt.`]; }
      return [];
    }
    if (isWallChar(cellChar(lvl, x, y)) || blockerAt(state, x, y)) return [];
  }
  return [];
}

// Wandtafel (sign.face = Richtung vom Bodenfeld zur Wand, 0=N 1=O 2=S 3=W): lesbar, wenn die Gruppe auf dem Feld vor der Wand
// oder ein Feld dahinter steht und zur Tafel blickt.
export function wallSignAhead(state, data) {
  const p = state.player, d = DIRS[p.dir], lvl = getLevel(data, state);
  const at = (x, y) => state.objs.find((o) => o.type === 'sign' && o.face === p.dir && o.x === x && o.y === y);
  const here = at(p.x, p.y);
  if (here) return here;
  const fx = p.x + d.dx, fy = p.y + d.dy;
  if (isWallChar(cellChar(lvl, fx, fy)) || blockerAt(state, fx, fy)) return null;
  return at(fx, fy) || null;
}
// 0.47.13: Lesefeld (Nutzer: „Alle Schriften Lesbarkeiten sehen immer noch schlecht aus – letzte Chance, optimale Lösung für alle Fälle“).
// Wandschilder und Türtitel sind auf 480×270 bei schrägem Blick oder Abstand nie sicher lesbar. Das Lesefeld zeigt den Text des nächsten Schilds/Türtitels
// entlang des Gangs (bis 4 Felder voraus, Seitenwände und Stirnwand) in echter Schrift. Pfeile werden aus Sicht der Gruppe gerechnet: ↑ voraus, ↓ zurück, ← links, → rechts.
// Schilder: Pfeil „→“ gilt für den Leser, der zur Wand schaut (rechts = (face+1)%4), „←“ links = (face+3)%4.
export function readHint(state, data) {
  if (!state || state.combat || !state.player) return null;
  const p = state.player, lvl = getLevel(data, state), dirs = ['↑', '→', '↓', '←'];
  const L = (p.dir + 3) % 4, R = (p.dir + 1) % 4;
  const sign = (x, y, f) => state.objs.find((o) => o.type === 'sign' && o.face === f && o.x === x && o.y === y && o.title && !o.textless);
  const GO = { hinab: 'HINAB', hinauf: 'HINAUF', weg: 'WEG' }; // 0.47.15: Wegweiser an Treppen: „HINAB: KULT-GRUFT“
  const fmt0 = (o, face) => String(o.title).split('|').map((ln) => ln.replace(/[→←]/g, (c) => dirs[(((c === '→' ? (face + 1) : (face + 3)) % 4) - p.dir + 4) % 4])).reduce((acc, ln) => (acc === '' ? ln : acc + (acc.endsWith('-') ? '' : ' · ') + ln), ''); // 0.47.14: Zeile auf „-“ endet = Wort geht weiter (KULT-GRUFT)
  const fmt = (o, face) => (o.go && GO[o.go] ? GO[o.go] + ': ' : '') + fmt0(o, face);
  let x = p.x, y = p.y;
  for (let i = 0; i <= 4; i++) {
    const side = sign(x, y, L) || sign(x, y, R); if (side) return { text: fmt(side, side.face), kind: 'sign', id: side.id };
    const fr = sign(x, y, p.dir); if (fr) return { text: fmt(fr, fr.face), kind: 'sign', id: fr.id };
    const nx = x + DIRS[p.dir].dx, ny = y + DIRS[p.dir].dy;
    const dr = state.objs.find((o) => o.type === 'door' && o.title && !o.textless && o.x === nx && o.y === ny); if (dr) return { text: String(dr.title).split('|').reduce((acc, ln) => (acc === '' ? ln : acc + (acc.endsWith('-') ? '' : ' · ') + ln), ''), kind: 'door', id: dr.id };
    if (isWallChar(cellChar(lvl, nx, ny)) || blockerAt(state, nx, ny)) break;
    x = nx; y = ny;
  }
  return null;
}
// 0.35.0: Notizbuch – state.journal = [{ id, lv, title, text }]; Hinweise werden beim Lesen/Hören eingetragen (je id einmal), Reihenfolge = Fundreihenfolge
export function noteClue(state, id, title, text) {
  if (!id || !text) return false;
  const j = (state.journal = Array.isArray(state.journal) ? state.journal : []);
  if (j.some((e) => e.id === id)) return false;
  j.push({ id, lv: state.levelId, title: title || 'Hinweis', text });
  return true;
}
const isClueSign = (o) => o && o.type === 'sign' && o.text && !/^(dk_|deco_|tw_)/.test(o.id); // tw_ = Wegweiser an Treppen (0.47.15): kein Notizbucheintrag
const signClue = (state, o) => { if (o.board) return { board: true, sfx: 'ui' }; const r = { msg: o.text, sfx: 'ui', long: true }; if (isClueSign(o) && noteClue(state, o.id, String(o.title || 'Tafel').replace(/\|/g, ' '), o.text)) r.newNote = true; return r; };
const recClue = (state, id, title, text, r) => { if (noteClue(state, id, title, text)) r.newNote = true; return r; };
function runePlate(state, o) {
  const ch = state.objs.find((x) => x.id === o.seq.chest), plates = state.objs.filter((x) => x.type === 'lever' && x.seq && x.seq.chest === o.seq.chest);
  if (!ch || ch.runesOk) return { msg: 'Die Rune ist erloschen. Das Siegel der Truhe ist längst gelöst.', sfx: 'ui' };
  if (o.used) return { msg: 'Diese Platte ist schon eingedrückt.', sfx: 'ui' };
  const want = (ch.prog || 0) + 1;
  if (o.seq.n !== want) { ch.prog = 0; for (const p of plates) p.used = false; return { msg: 'Die Platte sinkt ein. Ein Zischen läuft durch den Boden, und alle Platten springen zurück. Von vorn.', sfx: 'bump', changed: true }; }
  o.used = true; ch.prog = want;
  if (want >= plates.length) { ch.runesOk = true; return { msg: 'Die letzte Rune leuchtet auf. Weit im Süden des Raums knackt ein Siegel.', sfx: 'unlock', changed: true, long: true }; }
  return { msg: `Die Platte rastet ein, die Rune glimmt (${want} von ${plates.length}).`, sfx: 'door', changed: true };
}
// ---------- Zerschlagbare Fässer (0.44.0) ----------
// Objekt { type: 'barrel', look: 'fass', broken }: ◉ zerschlägt das Fass, der Inhalt wird gewürfelt (data.barrels.outcomes, Gewichte w):
// leer · beute (Vorrat/Trank) · gold · ausruestung · monster (Art aus den Gegnern dieses Gebiets, keine Bosse; fehlt eine, zählt es als leer) ·
// explosion (Falle „blast“) · teleport (zufälliges erreichbares Feld mit Mindestabstand) · gift (Falle „gas“) · wein (Heilung der Wachen).
function barrelKinds(state, data) { // Gegnerarten des Gebiets ohne Bosse
  const out = new Set();
  for (const o of state.objs) if (o.type === 'enemy' && data.enemies[o.kind] && !data.enemies[o.kind].boss && !o.elite) out.add(o.kind);
  return [...out];
}
function reachableFrom(state, data, minDist) {
  const lvl = getLevel(data, state), w = lvl.map[0].length, h = lvl.map.length, p = state.player;
  const dist = new Int16Array(w * h).fill(-1), q = [p.y * w + p.x]; dist[q[0]] = 0;
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !isWallChar(cellChar(lvl, x, y)) && cellChar(lvl, x, y) !== '~' && !blockerAt(state, x, y);
  for (let i = 0; i < q.length; i++) { const c = q[i], cx = c % w, cy = (c - cx) / w; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (!free(nx, ny) || dist[ny * w + nx] >= 0) continue; dist[ny * w + nx] = dist[c] + 1; q.push(ny * w + nx); } }
  return q.filter((c) => dist[c] >= minDist).map((c) => ({ x: c % w, y: (c - (c % w)) / w })).filter((c) => !state.objs.some((o) => o.x === c.x && o.y === c.y && (o.type === 'stairs' || o.type === 'exit' || o.type === 'teleport' || o.type === 'plate' || o.type === 'trap')));
}
export function smashBarrel(state, data, o) {
  if (state.combat) return { msg: 'Im Kampf ist dafür keine Zeit.' };
  const cfg = data.barrels || { outcomes: [{ id: 'leer', w: 1 }] };
  const total = cfg.outcomes.reduce((n, e) => n + e.w, 0);
  let r = rand(state) * total, pick = cfg.outcomes[0];
  for (const e of cfg.outcomes) { r -= e.w; if (r < 0) { pick = e; break; } }
  let id = pick.id;
  const kinds = id === 'monster' ? barrelKinds(state, data) : [];
  if (id === 'monster' && !kinds.length) id = 'leer';
  const cells = id === 'teleport' ? reachableFrom(state, data, cfg.teleportMin || 6) : [];
  if (id === 'teleport' && !cells.length) id = 'leer';
  o.broken = true;
  const head = 'Ihr schlagt das Fass in Stücke.';
  if (id === 'leer') return { msg: `${head} Nur Dauben und ein Schwall alter Brühe.`, sfx: 'bump', changed: true };
  if (id === 'beute') { const e = pick.loot[randInt(state, 0, pick.loot.length - 1)]; return { msg: `${head} Zwischen den Dauben: ${addLoot(state, data, [e])}.`, sfx: 'chest', changed: true }; }
  if (id === 'gold') { const g = randInt(state, 5, 14) + 2 * partyAvgLevel(state); return { msg: `${head} Im Boden klimpert es: ${addLoot(state, data, [{ gold: g }])}.`, sfx: 'chest', changed: true }; }
  if (id === 'ausruestung') { const txt = addLoot(state, data, [{ gear: { boost: 0 } }]); return { msg: `${head} Unter einem Lumpen liegt: ${txt}.`, sfx: 'chest', changed: true, long: true }; }
  if (id === 'monster') {
    const kind = kinds[randInt(state, 0, kinds.length - 1)], en = data.enemies[kind];
    Object.assign(o, { type: 'enemy', kind, hp: en.hp, dead: false }); delete o.broken; delete o.look;
    return { encounter: o, msg: `${head} Etwas springt heraus: ${en.name}!`, sfx: 'hurt', changed: true };
  }
  if (id === 'explosion' || id === 'gift') { const msgs = springTrap(state, data, { kind: id === 'explosion' ? 'blast' : 'gas' }); return { msg: msgs.join(' '), sfx: 'hurt', changed: true, long: true }; }
  if (id === 'teleport') {
    const c = cells[randInt(state, 0, cells.length - 1)];
    state.player.x = c.x; state.player.y = c.y;
    return { msg: `${head} Ein Wirbel aus bunten Funken packt die Gruppe. Als er verfliegt, steht ihr an einem anderen Ort.`, sfx: 'door', changed: true, long: true, teleported: true };
  }
  if (id === 'wein') {
    for (const h of state.heroes) if (h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + Math.ceil((h.maxHp * (cfg.wineHeal || 25)) / 100));
    return { msg: `${head} Das Fass war voller Wein. Jeder, der noch steht, nimmt einen Schluck: +${cfg.wineHeal || 25} % LP.`, sfx: 'heal', changed: true, long: true };
  }
  return { msg: head, changed: true };
}
export function interact(state, data, target = null) { // target (0.26.2): Objekt, das aus 2 Feldern Abstand benutzt wird (nur Türen)
  const f = frontCell(state);
  const o = target || blockerAt(state, f.x, f.y);
  if (!o) {
    // 0.32.2: Geöffnete Tür vor der Gruppe per ◉/Antippen wieder schließen (nicht, wenn etwas im Türfeld steht)
    const od = state.objs.find((q) => q.type === 'door' && q.open && q.x === f.x && q.y === f.y);
    if (od && !state.objs.some((q) => q !== od && q.x === f.x && q.y === f.y && (q.type === 'enemy' ? !q.dead : q.type === 'npc' && !q.gone))) { od.open = false; return { msg: 'Ihr schließt die Tür.', sfx: 'ui', changed: true }; }
    const bu = state.objs.find((q) => q.type === 'buried' && q.sensed && !q.dug && q.x === f.x && q.y === f.y);
    if (bu) { bu.dug = true; return { msg: `${bu.text || 'Ihr grabt im Sand.'} Ihr findet: ${addLoot(state, data, bu.loot)}.`, sfx: 'chest', changed: true, long: true }; }
    const il = illusionAt(state, f.x, f.y);
    if (il) { const sk = partySkill(state, data, 'secret'); il.sensed = il.sensed || sk > 0; const ir = { msg: il.hint || (sk > 0 ? `${bestAt(state, data, 'secret').name}: „Das ist keine Mauer. Das Licht bricht sich falsch darin.“` : 'Die Steine wirken seltsam unscharf, als läge ein Schleier darüber.'), sfx: 'ui' }; return il.hint ? recClue(state, il.id, 'Flimmernde Wand', il.hint, ir) : ir; }
    const tr = trapAt(state, f.x, f.y);
    if (tr && tr.spotted) return disarmTrap(state, data, tr);
    if (tr) { tr.spotted = true; tr.checked = true; return { msg: `Du untersuchst den Boden: eine Falle (${data.traps.kinds[tr.kind].name})! Noch einmal ◉ entschärft sie.`, sfx: 'ui' }; }
    const nc = state.objs.find((q) => q.type === 'niche' && q.face === state.player.dir && q.x === state.player.x && q.y === state.player.y); // 0.23.0: Wandnische vor der Nase
    if (nc) { if (nc.taken || !(nc.loot || []).length) return { msg: nc.empty || 'Die Nische ist leer. Nur Staub und Spinnweben.', sfx: 'ui' }; nc.taken = true; return { msg: `${nc.text ? nc.text + ' ' : ''}In der Nische liegt: ${addLoot(state, data, nc.loot)}.`, sfx: 'chest', changed: true, long: true }; }
    const ws = wallSignAhead(state, data);
    if (ws) return signClue(state, ws);
    const hs = state.objs.find((q) => q.type === 'sign' && q.face != null && q.x === state.player.x && q.y === state.player.y); // 0.22.1: Tafel am eigenen Feld (seitlich) ist auch lesbar
    if (hs && !blockerAt(state, f.x, f.y)) return signClue(state, hs);
    const p = state.player, f2 = { x: f.x + DIRS[p.dir].dx, y: f.y + DIRS[p.dir].dy };
    const b2 = blockerAt(state, f2.x, f2.y);
    if (b2 && b2.type === 'sign' && cellChar(getLevel(data, state), f.x, f.y) === '.') return signClue(state, b2); // Tafeln lassen sich aus bis zu 2 Feldern Abstand lesen
    if (b2 && cellChar(getLevel(data, state), f.x, f.y) === '.') return { msg: 'Geh näher heran.' };
    return { msg: 'Hier gibt es nichts zu tun.' };
  }
  if (o.type === 'enemy') return { encounter: o };
  if (o.type === 'barrel') return smashBarrel(state, data, o); // 0.44.0
  if (o.type === 'npc') return { talk: o.id, sfx: 'ui' };
  if (o.type === 'sign') return signClue(state, o);
  if (o.type === 'runestone' && o.story) { // 0.47.0: Erzählseite beim ersten Berühren (Pergament), danach Kurztext; die Geschichte bleibt im Notizbuch
    const first = noteClue(state, o.id, o.title || 'Runenstein', o.story);
    return first ? { msg: o.story, page: { title: o.title || 'Runenstein', text: o.story }, newNote: true, sfx: 'ui' } : { msg: o.text, sfx: 'ui', long: true };
  }
  if (o.type === 'runestone') return recClue(state, o.id, 'Runenstein', o.text, { msg: o.text, sfx: 'ui', long: true }); // 0.16.5: Inschrift übersetzt (später Reisenetz)
  if (o.type === 'merchant') {
    const r = { shop: o.shop, merchant: o.id };
    if (o.talk && !state.flags[o.talk.flag]) { state.flags[o.talk.flag] = true; r.msg = o.talk.text; r.changed = true; recClue(state, 'talk:' + o.id, o.name || 'Händler', o.talk.text, r); }
    return r;
  }
  if (o.type === 'door') {
    if (o.locked && o.bolt != null) { // 0.23.0: Riegeltür – nur von der Riegelseite zu öffnen (Abkürzung zurück)
      const p = state.player, side = p.x - o.x === DIRS[o.bolt].dx && p.y - o.y === DIRS[o.bolt].dy;
      if (!side) return { msg: 'Die Tür ist von der anderen Seite verriegelt. Kein Schloss, kein Griff – nur Holz.', sfx: 'bump' };
      o.locked = false; o.open = true;
      return { msg: 'Ihr schiebt den schweren Riegel zurück. Die Tür bleibt nun offen – ein kurzer Weg zurück.', sfx: 'unlock', changed: true };
    }
    if (o.sealed) return { msg: 'Die Tür sitzt fest. Kein Schloss, kein Griff – sie rührt sich nicht.', sfx: 'bump' }; // 0.48.1: zugefallen, bis der Albtraum endet
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
  if (o.type === 'boulder') return pullBoulder(state, data, o);
  if (o.type === 'gate' && o.web) { o.open = true; const w = state.heroes.find((h) => h.hp > 0 && (h.row === 'front')) || state.heroes.find((h) => h.hp > 0); return { msg: o.cutMsg || `${w ? w.name : 'Jemand'} durchtrennt das zähe Netz. Die Fäden zucken noch einen Augenblick nach.`, sfx: 'door', changed: true }; } // 0.33.0: Spinnennetz – mit ◉ oder Dagegenlaufen durchtrennen
  if (o.type === 'gate') { const gr = { msg: o.hint || 'Das Gitter sitzt fest. Es muss einen Hebel geben.', sfx: 'bump' }; return o.hint ? recClue(state, o.id, o.hintTitle || 'Gitter', o.hint, gr) : gr; }
  if (o.type === 'lever') { // wall: true = versteckter Schalter (lockerer Stein in der Mauer); Ziel ist ein Gitter oder eine Geheimwand
    if (o.seq) return runePlate(state, o); // 0.38.0: Runenplatten in fester Reihenfolge
    const gate = state.objs.find((x) => x.id === o.gate);
    if (o.used) return { msg: o.torch ? 'Die Fackel ist schon gedreht.' : o.wall ? 'Der Stein ist schon eingedrückt.' : 'Der Hebel ist schon umgelegt.', sfx: 'ui' };
    o.used = true;
    if (gate) gate.open = true;
    for (const f of o.set || []) state.flags[f] = true; // 0.38.0: Hebel kann Marken setzen (Pumpenhahn)
    return { msg: o.msg || (o.torch ? 'Die Fackel lässt sich drehen. In der Nähe schabt Stein über Stein.' : o.wall ? 'Der Stein gibt nach. In der Nähe schabt Stein über Stein.' : 'Der Hebel rastet ein. Irgendwo rasselt eine Kette.'), sfx: 'door', changed: true };
  }
  if (o.type === 'chest') {
    if (o.open) return { msg: 'Die Truhe ist leer.' };
    if (chestGuarded(state, data, o)) return { msg: 'Die Truhe ist bewacht. Erst die Gegner in diesem Raum besiegen.', sfx: 'bump', guarded: true };
    if (o.runes && !o.runesOk) return { msg: 'Die Truhe ist mit Runen versiegelt. Die Platten an der Nordwand gehören dazu.', sfx: 'bump' }; // 0.38.0
    const cfg = chestCfg(state, data, o), pre = [];
    if (cfg.mimic) return wakeMimic(state, data, o, cfg);
    if (cfg.trap && !o.trapDone) { const r = chestTrap(state, data, o, cfg); if (r.stop) return r; pre.push(r.msg); }
    if ((cfg.lock || cfg.key) && !o.unlocked) { const r = pickChest(state, data, o, cfg); if (!r.ok) return pre.length ? { ...r, msg: pre.join(' ') + ' ' + r.msg, long: true, changed: true } : r; pre.push(r.msg); }
    o.open = true;
    const txt = addLoot(state, data, o.loot);
    return { msg: `${pre.length ? pre.join(' ') + ' ' : ''}Truhe geöffnet: ${txt}.`, sfx: 'chest', changed: true, long: pre.length > 0 };
  }
  if (o.type === 'secret' && o.needs) { // 0.40.0: Kartenwand – nur mit der passenden Schatzkarte
    if (!hasMap(state, o)) return { msg: 'Hier gibt es nichts zu tun.' };
    o.open = true;
    return { msg: o.msg || 'Die Karte stimmt: Eine schmale Fuge, ein Druck – die Wand gleitet zur Seite. Dahinter liegt ein kleiner Raum.', sfx: 'unlock', changed: true, long: true };
  }
  if (o.type === 'secret') return recClue(state, o.id, 'Rissige Wand', o.hint || 'Die Wand klingt hohl. Der Riss ist zu gerade für einen Zufall.', secretHint(state, data, o));
  return { msg: 'Hier gibt es nichts zu tun.' };
}

// ---------- Begegnungsdialoge (0.25.0) ----------
// data.dialogs.<id> = { name, start, again, nodes: { <id>: { text, choices: [ { t, to, if, cost, take, give, set, done, leave, attack, msg } ] } } }
// to: nächster Knoten (fehlt = Gespräch endet) · if: { flag, noflag, item } (sonst Wahl nicht sichtbar) · cost: { gold } / take: { item, n } (Wahl gesperrt, wenn nicht vorhanden)
// give: Beute wie bei Truhen · set: Marken (state.flags) · done: Gespräch gilt als geführt (dann `again`) · leave: Person verschwindet · attack: Person wird zum Gegner dieser Art
// 0.28.0: goto: { level, x, y, dir } = Gebietswechsel (Fähre) · dice: { even: {…}, odd: {…} } = Zufallszahl 1–10, gerade/ungerade wählt die Folge (Felder wie bei einer Wahl)
function dlgOf(data, npc) { return npc && data.dialogs && data.dialogs[npc.dialog]; }
export function dialogStartNode(state, data, npc) {
  const dl = dlgOf(data, npc);
  if (!dl) return null;
  for (const r of dl.startBy || []) if ((!r.if || !r.if.flag || state.flags[r.if.flag]) && (!r.if || !r.if.noflag || !state.flags[r.if.noflag])) return r.node; // 0.32.0: Startknoten nach Marken (Murmel)
  return state.flags['d:' + npc.id] && dl.again ? dl.again : dl.start;
}
// 0.39.0: Zimmer in der Taverne – kostet innBase + innPerLevel × Durchschnittsstufe, stellt LP/MP von Gruppe UND Reserve her, weckt Bewusstlose
export function innCost(state, data) { const t = data.tavern || {}; return (t.innBase || 15) + (t.innPerLevel || 5) * partyAvgLevel(state); }
const innNeeded = (state) => [...state.heroes, ...(state.reserve || [])].some((h) => h.hp < h.maxHp || h.mp < h.maxMp);
export function dialogView(state, data, npc, nodeId) {
  const dl = dlgOf(data, npc), nd = dl && dl.nodes[nodeId];
  if (!nd) return null;
  const choices = [];
  nd.choices.forEach((c, i) => {
    const f = c.if || {};
    if ((f.flag && !state.flags[f.flag]) || (f.noflag && state.flags[f.noflag]) || (f.item && !((state.inv[f.item] || 0) > 0))) return;
    let ok = true, suffix = '';
    if (c.cost && c.cost.gold) { suffix += ` (${c.cost.gold} Gold)`; if (state.gold < c.cost.gold) ok = false; }
    if (c.inn) { const p = innCost(state, data); if (!innNeeded(state)) { suffix += ' (alle ausgeruht)'; ok = false; } else { suffix += ` (${p} Gold)`; if (state.gold < p) ok = false; } }
    if (c.take) { const it = data.items[c.take.item]; suffix += ` (${it ? it.name : c.take.item})`; if (!((state.inv[c.take.item] || 0) >= (c.take.n || 1))) ok = false; }
    choices.push({ i, t: c.t + suffix, ok });
  });
  return { name: npc.name || dl.name, text: nd.text, choices };
}
// 0.37.2: Knoten mit note/noteTitle tragen ihren Text beim Betreten ins Notizbuch ein (je Gesprächspartner einmal; gleiche Kennung wie früher „Den Satz merken“)
export function dialogEnter(state, data, npc, nodeId) {
  const dl = dlgOf(data, npc), nd = dl && dl.nodes[nodeId];
  if (!nd || !nd.note) return { newNote: false };
  return { newNote: noteClue(state, 'dlg:' + npc.id + ':x', nd.noteTitle || npc.name || 'Gespräch', nd.note) };
}
// 0.37.6: Raumname für die Karte – levels.<id>.rooms = [{name, x0, y0, x1, y1}] (Rechtecke inklusive, erster Treffer gilt, spezielle vor allgemeinen); ohne Treffer 'Gang', ohne rooms-Liste null
export function roomAt(lvl, x, y) {
  if (!lvl || !Array.isArray(lvl.rooms) || !lvl.rooms.length) return null;
  const r = lvl.rooms.find((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  return r ? r.name : 'Gang';
}
// ---------- Würfelspiel mit Murmel (0.32.0) ----------
// data.dicegame = { stakes, rules, amulet, devilKind, devilGame, intro:{...}, hint, amuletLine, devilLine, murmelLoses[], murmelWins[], roundWin[], roundLose[] }
// Ablauf: Jede Runde würfeln beide drei Würfel (Murmels liegen offen). Die Gruppe darf einen eigenen Würfel einmal neu werfen, danach wirft Murmel seinen niedrigsten
// Würfel neu, wenn er unter 3 zeigt. Höhere Summe gewinnt die Runde, Gleichstand = Runde wird wiederholt. Wer zuerst 2 Runden hat, gewinnt das Spiel.
// Marken: gnom:g1/g2 = 1./2. Spiel gespielt · gnom:w1/w2 = 1./2. Sieg (2. Sieg = Glücksamulett) · gnom:teufel = Verwandlung (erste Niederlage ab dem 2. Spiel, 0.32.1: vorher nur im genau 2. Spiel).
export const DICE_WIN_ROUNDS = 2;
const dsum = (a) => a.reduce((x, y) => x + y, 0);
const d6 = (state) => randInt(state, 1, 6);
function normalizeMurmel(state) { const f = state.flags; if (f['gnom:gewonnen']) { f['gnom:w1'] = true; f['gnom:w2'] = true; f['gnom:g1'] = true; } } // Altstände: Amulett wurde nach den alten Regeln gewonnen
export function diceGameNumber(state) { normalizeMurmel(state); const f = state.flags; return f['gnom:g2'] ? 3 : f['gnom:g1'] ? 2 : 1; }
export function diceNew(state, data, stake) {
  const cfg = data.dicegame;
  if (!cfg || !cfg.stakes.includes(stake)) return { error: 'bad-stake' };
  if (state.gold < stake) return { error: 'gold' };
  state.gold -= stake; // Einsatz sofort; Gewinn zahlt das Doppelte aus
  return { g: { stake, round: 1, pw: 0, mw: 0, phase: 'roll', p: [], m: [], res: null, rerolled: null, mrerolled: null, history: [], won: null } };
}
export function diceRoll(state, g) {
  if (g.phase !== 'roll') return g;
  g.p = [d6(state), d6(state), d6(state)]; g.m = [d6(state), d6(state), d6(state)];
  g.res = null; g.rerolled = null; g.mrerolled = null; g.phase = 'keep';
  return g;
}
// idx = Würfel der Gruppe, der neu geworfen wird (0..2) oder null = behalten
export function diceKeep(state, g, idx) {
  if (g.phase !== 'keep') return g;
  if (idx !== null && idx !== undefined) { if (!(idx >= 0 && idx < 3)) return g; g.p[idx] = d6(state); g.rerolled = idx; }
  const lo = Math.min(...g.m), mi = g.m.indexOf(lo);
  if (lo < 3) { g.m[mi] = d6(state); g.mrerolled = mi; }
  const ps = dsum(g.p), ms = dsum(g.m);
  g.res = ps > ms ? 'p' : ps < ms ? 'm' : 'tie';
  if (g.res === 'p') g.pw++; else if (g.res === 'm') g.mw++;
  g.history.push({ p: g.p.slice(), m: g.m.slice(), res: g.res });
  g.phase = 'show';
  return g;
}
export function diceNext(g) {
  if (g.phase !== 'show') return g;
  if (g.pw >= DICE_WIN_ROUNDS || g.mw >= DICE_WIN_ROUNDS) { g.won = g.pw >= DICE_WIN_ROUNDS; g.phase = 'end'; return g; }
  if (g.res !== 'tie') g.round++;
  g.phase = 'roll';
  return g;
}
const pick = (state, arr) => arr[randInt(state, 0, arr.length - 1)];
export const diceRoundLine = (state, data, g) => { const c = data.dicegame; return g.res === 'tie' ? 'Gleichstand – die Runde wird wiederholt.' : g.res === 'p' ? pick(state, c.roundWin) : pick(state, c.roundLose); };
// Abschluss: Auszahlung, Marken, Amulett, Verwandlung. npc = Murmel (Objekt). Aufgeben (g.won === false) zählt als Niederlage.
export function diceFinish(state, data, npc, g) {
  const cfg = data.dicegame, f = state.flags, msgs = [], n = diceGameNumber(state);
  if (n === 1) f['gnom:g1'] = true; else if (n === 2) f['gnom:g2'] = true;
  if (g.won) {
    if (g.stake) { state.gold += g.stake * 2; msgs.push(`Gewinn: +${g.stake} Gold.`); }
    msgs.push(pick(state, cfg.murmelLoses));
    if (!f['gnom:w1']) { f['gnom:w1'] = true; msgs.push(cfg.hint); noteClue(state, 'dice:hint', 'Murmels Versprechen', cfg.hint); }
    else if (!f['gnom:w2']) { f['gnom:w2'] = true; f['gnom:gewonnen'] = true; msgs.push(cfg.amuletLine, `Erhalten: ${addLoot(state, data, [{ item: cfg.amulet, n: 1 }])}.`); }
    return { won: true, msg: msgs.join(' '), changed: true };
  }
  if (g.stake) msgs.push(`Einsatz verloren: −${g.stake} Gold.`);
  if (n >= cfg.devilGame && !f['gnom:teufel'] && npc && npc.type === 'npc') { // Verwandlung: Murmel wird zum Teufel, die Hütte zum Spielsalon
    f['gnom:teufel'] = true;
    const en = data.enemies[cfg.devilKind];
    Object.assign(npc, { type: 'enemy', kind: cfg.devilKind, hp: en.hp, dead: false });
    syncStatic(state, data); // Raum umbauen (lvl.alt)
    msgs.push(cfg.devilLine);
    return { won: false, devil: true, encounter: npc, msg: msgs.join(' '), changed: true };
  }
  msgs.push(pick(state, cfg.murmelWins));
  return { won: false, msg: msgs.join(' '), changed: true };
}

export function dialogChoose(state, data, npc, nodeId, idx) {
  const dl = dlgOf(data, npc), nd = dl && dl.nodes[nodeId], c = nd && nd.choices[idx];
  if (!c) return { error: 'bad-choice' };
  const view = dialogView(state, data, npc, nodeId), ch = view && view.choices.find((x) => x.i === idx);
  if (!ch || !ch.ok) return { error: 'not-possible' };
  if (c.game) return { end: true, game: c.game, npc, changed: false }; // 0.32.0: öffnet das Würfelspiel (Oberfläche)
  if (c.maps) return { end: true, maps: true, npc, changed: false }; // 0.40.0: Schatzkarten des Wirts (Oberfläche)
  if (c.board) return { end: true, board: true, npc, changed: false }; // 0.40.0: Aushangbrett (Oberfläche)
  if (c.exorcise) return { end: true, exorcise: true, npc, changed: false }; // 0.46.0: Hexe entfernt Flüche (Oberfläche)
  if (c.tavern) return { end: true, tavern: true, npc, changed: false }; // 0.34.0: öffnet die Gruppenverwaltung der Taverne (Oberfläche)
  const msgs = [];
  if (c.cost && c.cost.gold) state.gold -= c.cost.gold;
  if (c.inn) { const p = innCost(state, data); state.gold -= p; for (const h of [...state.heroes, ...(state.reserve || [])]) { h.hp = h.maxHp; h.mp = h.maxMp; } for (const o of state.objs) if (o.jammed) delete o.jammed; msgs.push(`Ihr schlaft in warmen Betten (${p} Gold). Alle sind ausgeruht, auch die Reserve.`); }
  if (c.take) state.inv[c.take.item] = (state.inv[c.take.item] || 0) - (c.take.n || 1);
  let eff = c, next = c.to || null;
  if (c.dice) { // 0.28.0: Würfel – Zahl 1–10; gerade → dice.even, ungerade → dice.odd (Felder wie bei einer Wahl: give, set, done, leave, attack, goto, msg, to)
    const roll = randInt(state, 1, 10);
    eff = Object.assign({}, c.dice[roll % 2 === 0 ? 'even' : 'odd']);
    if (!c.noRoll) msgs.push(`Der Würfel zeigt ${roll}.`); // 0.38.0: noRoll = Zufall ohne Würfeltext (Überreden)
    next = eff.to || null;
    if (c.msg) msgs.push(c.msg);
  }
  if (eff.look) { npc.look = eff.look; npc.lookSet = true; } // 0.33.0: Aussehen wechselt (befreiter Gefangener); lookSet schützt vor dem Zurücksetzen durch syncStatic
  if (eff.heal) { for (const h of state.heroes) if (h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + Math.ceil((h.maxHp * eff.heal) / 100)); msgs.push(`Wunden werden versorgt: alle wachen Helden +${eff.heal} % LP.`); } // 0.33.0
  if (eff.give) msgs.push(`Erhalten: ${addLoot(state, data, eff.give)}.`);
  if (eff.xp) { const um = []; grantXp(state, data, eff.xp, um); msgs.push(`Erfahrung: +${eff.xp} EP.`, ...um); } // 0.29.0: Wunsch „Erfahrung“
  if (eff.reveal) { const lv = getLevel(data, state); (lv.map || []).forEach((row, y) => [...row].forEach((ch, x) => { if (!state.objs.some((o) => (o.type === 'secret' || o.type === 'illusion') && o.x === x && o.y === y)) state.seen[y * row.length + x] = 1; })); msgs.push('Die Karte dieses Gebiets ist euch nun bekannt.'); } // 0.29.0: Wunsch „Karte“
  for (const f of eff.set || []) state.flags[f] = true;
  if (eff.note && noteClue(state, 'dlg:' + npc.id + ':' + (eff.set && eff.set[eff.set.length - 1] || 'x'), eff.noteTitle || npc.name || 'Gespräch', eff.note)) msgs.push('Ins Notizbuch eingetragen.'); // 0.35.0
  if (eff.done || c.done) state.flags['d:' + npc.id] = true;
  if (eff.msg) msgs.push(eff.msg);
  if (c.msg && !c.dice) msgs.unshift(c.msg);
  if (eff.leave) npc.gone = true;
  if (eff.goto) return { end: true, goto: eff.goto, msg: msgs.join(' '), changed: true, sfx: 'ui' };
  if (eff.attack) {
    const en = data.enemies[eff.attack];
    Object.assign(npc, { type: 'enemy', kind: eff.attack, hp: en.hp, dead: false });
    return { end: true, encounter: npc, msg: msgs.join(' '), changed: true };
  }
  return { end: !next, next, msg: msgs.join(' '), changed: true, sfx: c.inn ? 'heal' : eff.give ? 'chest' : 'ui', inn: !!c.inn };
}

export function useItemOutside(state, data, itemId, heroIdx) {
  const it = data.items[itemId];
  const h = state.heroes[heroIdx];
  if (!it || it.kind !== 'consumable' || !(it.heal || it.mana) || !(state.inv[itemId] > 0)) return { error: 'no-item' };
  if (!h || h.hp <= 0) return { error: 'bad-target' };
  if (it.mana) { // 0.24.0: Zaubertrank – Mana bzw. Ausdauer
    if (h.mp >= h.maxMp) return { error: 'full-mp' };
    const mb = h.mp;
    h.mp = Math.min(h.maxMp, h.mp + Math.floor((it.mana * (100 + Math.min(100, partyFx(state, data, 'potionplus')))) / 100));
    state.inv[itemId]--;
    return { msg: `${h.name} erhält ${h.mp - mb} ${data.classes[h.cls].res.name} zurück.`, sfx: 'heal' };
  }
  if (h.hp >= h.maxHp) return { error: 'full-hp' };
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + Math.floor((it.heal * (100 + Math.min(100, partyFx(state, data, 'potionplus')))) / 100)); // Tränkemeister (0.22.0)
  state.inv[itemId]--;
  return { msg: `${h.name} erhält ${h.hp - before} LP zurück.`, sfx: 'heal' };
}

// Heilzauber außerhalb des Kampfs: nur Zauber der Art 'heal', kostet Mana wie im Kampf, Mana kommt nur durch Rasten zurück.
export function castOutside(state, data, casterIdx, spellId, targetIdx) {
  if (state.combat) return { error: 'in-combat' };
  const h = state.heroes[casterIdx];
  if (!h || h.hp <= 0) return { error: 'bad-caster' };
  const sp = knownSpells(data, h).find((s) => s.id === spellId && s.kind === 'heal');
  if (!sp) return { error: 'no-spell' };
  if (h.mp < sp.cost) return { error: 'no-mp' };
  const hurt = (x) => x && x.hp > 0 && x.hp < x.maxHp;
  const targets = sp.all ? state.heroes.filter(hurt) : [state.heroes[targetIdx]];
  if (!targets.length || !targets.every(hurt)) return { error: sp.all ? 'full-hp' : 'bad-target' };
  h.mp -= sp.cost;
  const parts = targets.map((t) => { const before = t.hp; t.hp = Math.min(t.maxHp, t.hp + sp.heal); return `${t.name} +${t.hp - before} LP`; });
  return { msg: `${h.name} wirkt ${sp.name}: ${parts.join(', ')}.`, sfx: 'heal' };
}
// Debug: direkt zum Start eines Gebiets springen (Zustand des alten Gebiets bleibt wie bei einer Treppe erhalten)
export function jumpToLevel(state, data, levelId) {
  const target = data.levels[levelId];
  if (!target || state.combat) return { ok: false };
  if (levelId !== state.levelId) {
    state.areas = state.areas || {};
    state.areas[state.levelId] = { objs: state.objs, seen: state.seen, notes: state.notes };
    const a = state.areas[levelId] || freshArea(data, levelId);
    delete state.areas[levelId];
    state.levelId = levelId;
    state.objs = a.objs; state.seen = a.seen; state.notes = a.notes || [];
  }
  state.player = { x: target.start.x, y: target.start.y, dir: target.start.dir };
  if (unlockWorld(state)) syncStatic(state, data);
  markSeen(state, data);
  return { ok: true };
}

// ---------- Zauber (Schritt 5c) ----------
// Bekannte Zauber eines Helden: die Berufsfähigkeit (ab Stufe 1) plus data.spells nach classes.<id>.spells[{id, level}].
export function knownSpells(data, h) {
  const c = data.classes[h.cls], out = [];
  if (c.ability) out.push({ ...c.ability, level: 1 });
  for (const s of c.spells || []) if (h.level >= s.level && data.spells[s.id]) out.push({ id: s.id, level: s.level, ...data.spells[s.id] });
  for (const n of learnedTalents(data, h)) if (n.unlock && data.spells[n.unlock]) out.push({ id: n.unlock, level: 1, talent: n.id, ...data.spells[n.unlock] });
  return out;
}

// ---------- Talente (0.17.0) ----------
// data.talents = { cost: [1,1,2,2], gateLevel: 8, gateNode: 4, respecPerLevel: 20, classes: { <beruf>: [ { id, name, desc, nodes: [ {id, name, desc, fx?, unlock?} ×4 ] } ×3 ] } }
// hero.tal = { <nodeId>: true } (fehlt bei alten Ständen = nichts gelernt). Talentpunkte: 1 je Stufe ab Stufe 2, abzüglich Kosten der gelernten Talente (nicht gespeichert, daher keine Migration).
// Wirkungen (fx): hp, mp, atk, def, init (Werte), crit/dodge/resist/gold/abil/trap/lock/secret/haggle (Prozent; trap = Fallen entdecken und entschärfen, lock = Schlösser, secret = Geheimwände spüren, haggle = Preise), soak (Schaden gegen dich −x), heal (Heilzauber +x), regen (Ressource extra), backfull (Nahkampf aus der Hinterreihe ohne Abzug).
// Zweige sind der Reihe nach zu lernen; der vierte Eintrag braucht Stufe gateLevel.
export const talentBranches = (data, cls) => (data.talents && data.talents.classes && data.talents.classes[cls]) || [];
// 0.31.0: Ein ★-Talent kann eine Alternative haben (`alt` = { id, name, desc, fx }). Beide Wege stehen als eigene Einträge in der Liste (`altOf` = ID des Haupteintrags); gelernt wird einer von beiden, der Nachfolger im Zweig akzeptiert beide.
export const talentNodes = (data, cls) => { const out = [], cost = (data.talents && data.talents.cost) || [1, 1, 2, 2]; talentBranches(data, cls).forEach((b, bi) => b.nodes.forEach((n, ni) => { const { alt, ...main } = n; out.push({ ...main, branch: b.id, bi, ni, cost: cost[ni] || 1, altId: alt ? alt.id : null }); if (alt) out.push({ ...alt, branch: b.id, bi, ni, cost: cost[ni] || 1, altOf: n.id, altId: n.id }); })); return out; };
const nodeHeld = (h, n) => !!(h.tal && (h.tal[n.id] || (n.alt && h.tal[n.alt.id])));
export const learnedTalents = (data, h) => (h.tal ? talentNodes(data, h.cls).filter((n) => h.tal[n.id]) : []);
export const talentSpent = (data, h) => learnedTalents(data, h).reduce((a, n) => a + n.cost, 0);
export const talentPoints = (data, h) => Math.max(0, h.level - 1 - talentSpent(data, h));
export const talentSum = (data, h, key) => { if (!h || !h.tal) return 0; let v = 0; for (const n of learnedTalents(data, h)) if (n.fx && n.fx[key]) v += n.fx[key]; return v; };
export function canLearnTalent(data, h, nodeId) {
  const n = talentNodes(data, h.cls).find((x) => x.id === nodeId);
  if (!n) return { ok: false, why: 'unbekannt' };
  if (h.tal && h.tal[nodeId]) return { ok: false, why: 'gelernt' };
  if (n.altId && h.tal && h.tal[n.altId]) return { ok: false, why: 'andere', node: n }; // 0.31.0: die andere Wahl dieses Platzes ist schon gelernt
  if (n.ni > 0 && !nodeHeld(h, talentBranches(data, h.cls)[n.bi].nodes[n.ni - 1])) return { ok: false, why: 'vorher', node: n };
  const gate = data.talents.gateLevel || 8;
  if (n.ni + 1 >= (data.talents.gateNode || 4) && h.level < gate) return { ok: false, why: 'stufe', node: n, need: gate };
  if (talentPoints(data, h) < n.cost) return { ok: false, why: 'punkte', node: n };
  return { ok: true, node: n };
}
// Kampfwerte aus Beruf/Rasse/Stufe plus Talentboni (LP, Ressource); Verhältnisse der aktuellen LP/Ressource bleiben: Zuwachs wird gutgeschrieben.
export function refreshHeroStats(data, h) {
  const st = deriveStats(data, h.race, h.cls, h.level);
  const maxHp = st.maxHp + talentSum(data, h, 'hp'), maxMp = deriveMp(data, h.cls, h.level) + talentSum(data, h, 'mp');
  const dHp = Math.max(0, maxHp - h.maxHp), dMp = Math.max(0, maxMp - h.maxMp);
  for (const k of STAT_KEYS) h[k] = st[k];
  h.maxHp = maxHp; h.hp = Math.min(maxHp, h.hp + dHp);
  h.maxMp = maxMp; h.mp = Math.min(maxMp, h.mp + dMp);
}
export function learnTalent(state, data, heroIdx, nodeId) {
  if (state.combat) return { error: 'in-combat' };
  const h = state.heroes[heroIdx];
  if (!h) return { error: 'no-hero' };
  const r = canLearnTalent(data, h, nodeId);
  if (!r.ok) return { error: r.why, need: r.need };
  h.tal = h.tal || {};
  h.tal[nodeId] = true;
  refreshHeroStats(data, h);
  return { msg: `${h.name} lernt „${r.node.name}“.`, sfx: 'ui' };
}
export const respecCost = (data, h) => ((data.talents && data.talents.respecPerLevel) || 20) * h.level;
export function respecTalents(state, data, heroIdx) {
  if (state.combat) return { error: 'in-combat' };
  const h = state.heroes[heroIdx];
  if (!h || !h.tal || !Object.keys(h.tal).length) return { error: 'nothing' };
  const cost = respecCost(data, h);
  if (state.gold < cost) return { error: 'gold', cost };
  state.gold -= cost;
  h.tal = {};
  const hp = h.hp;
  refreshHeroStats(data, h);
  h.maxHp = Math.max(1, h.maxHp); h.hp = Math.min(hp, h.maxHp); h.mp = Math.min(h.mp, h.maxMp);
  return { msg: `${h.name} verlernt alle Talente (−${cost} Gold).`, sfx: 'ui' };
}
const backPen = (data, h) => h.row === 'back' && !h.ranged && !talentSum(data, h, 'backfull');

// ---------- Ausrüstungseffekte und Sets (0.21.0) ----------
// Feste Gegenstände (data.items) dürfen fx tragen: dieselben Schlüssel wie Talente (crit, dodge, resist, soak, regen, heal, abil, gold, trap, lock, secret, haggle)
// plus lifesteal (Prozent des verursachten Schadens als LP) und thorns (Schaden zurück an den Angreifer, wenn der Träger getroffen wird).
// Sets: data.sets.<id> = { name, items: [ids], bonus: { fx }, desc } – Bonus gilt, wenn ALLE Teile getragen werden. Erzeugte Beute (g1, g2 …) hat keine Effekte.
export function activeSets(data, h) {
  if (!data.sets || !h || !h.equip) return [];
  const worn = new Set(SLOTS.map((s) => h.equip[s]).filter(Boolean));
  return Object.entries(data.sets).filter(([, st]) => st.items.every((i) => worn.has(i))).map(([id, st]) => ({ id, ...st }));
}
export function gearFx(data, h, key) {
  if (!h || !h.equip) return 0;
  let v = 0;
  for (const s of SLOTS) { const it = h.equip[s] && data.items[h.equip[s]]; if (it && it.fx && it.fx[key]) v += it.fx[key]; }
  for (const st of activeSets(data, h)) if (st.bonus && st.bonus[key]) v += st.bonus[key];
  return v;
}
export const fxSum = (data, h, key) => talentSum(data, h, key) + gearFx(data, h, key);
// 0.22.0: Gruppenwirkungen (Aura) – Summe über alle wachen Helden
export const partyFx = (state, data, key) => (state && state.heroes ? state.heroes.reduce((a, h) => a + (h.hp > 0 ? fxSum(data, h, key) : 0), 0) : 0);
// Manaschild (Arkanist): ein Teil des Schadens geht aufs Mana
function manaShield(data, t, d, msgs) {
  const ms = fxSum(data, t, 'manashield');
  if (!(ms > 0) || !(d > 0) || !(t.mp > 0)) return d;
  const ab = Math.min(t.mp, Math.floor((d * ms) / 100));
  if (ab <= 0) return d;
  t.mp -= ab; msgs.push(`Manaschild: ${t.name} fängt ${ab} Schaden mit Mana ab.`);
  return d - ab;
}
function leech(data, h, d, msgs) {
  const ls = fxSum(data, h, 'lifesteal');
  if (!(ls > 0) || !(d > 0) || h.hp <= 0) return;
  const g = Math.min(h.maxHp - h.hp, Math.max(1, Math.floor((d * ls) / 100)));
  if (g > 0) { h.hp += g; msgs.push(`${h.name} entzieht ${g} LP.`); }
}

// ---------- Gegnertaktik (0.21.0) ----------
// guard: Solange ein Gegner mit guard lebt, sind seine Verbündeten gedeckt (−25 % Schaden durch Helden). Tipp: zuerst die Wache.
// enrage: Fällt ein Verbündeter, gerät der Gegner in Raserei (+25 % Angriff, einmalig).
// ai 'healer': 60 % der Angriffe gehen auf einen Helden mit Heilerberuf (classes.<id>.healer).
export const COVER_PCT = 75, RAGE_PCT = 125;
export function coveredBy(state, data, ti) {
  const c = state.combat, e = c && c.enemies[ti];
  if (!e || enemyOf(data, e).guard) return null;
  return c.enemies.find((x, i) => i !== ti && x.hp > 0 && enemyOf(data, x).guard) || null;
}
function cover(state, data, ti, d, tr) {
  if (!(d > 0) || !coveredBy(state, data, ti)) return d;
  const nd = Math.max(1, Math.floor((d * COVER_PCT) / 100));
  if (tr) { tr.cover = true; tr.total = nd; }
  noteBestiary(state, coveredBy(state, data, ti).kind, 'guard');
  return nd;
}
function checkRage(state, data, msgs) {
  const c = state.combat;
  if (!c) return;
  for (const e of c.enemies) if (e.hp <= 0 && !e.down) {
    e.down = true;
    for (const x of c.enemies) if (x !== e && x.hp > 0 && !x.rage && enemyOf(data, x).enrage) { x.rage = true; msgs.push(`${x.name} gerät in Raserei! (+25 % Angriff)`); noteBestiary(state, x.kind, 'enrage'); }
  }
}

// ---------- Ausrüstung (Schritt 5b) ----------
// hero.equip = { weapon: itemId|null, armor: itemId|null } (optional; fehlt es, ist nichts angelegt).
// Die gespeicherten Werte atk/def bleiben die Grundwerte; Boni werden beim Rechnen addiert.
export const SLOTS = ['weapon', 'armor', 'ring', 'amulet']; // 0.29.0: Ring und Amulett (je Held höchstens eines)
// Flüche (0.29.0): item.curse = { atk, def, init, fx } – verstecktes Malus, wirkt immer. Erkannt, wenn der Gegenstand einmal getragen wurde (flags['id:<id>']) oder ein wacher Held Geheimwände spüren kann (Talent 'secret' >= CURSE_SENSE).
export const CURSE_SENSE = 25;
export const isCursed = (it) => !!(it && it.curse);
export const curseKnown = (state, data, id) => !!(state.flags && state.flags['id:' + id]) || partySkill(state, data, 'secret') >= CURSE_SENSE;
export function curseText(it) {
  const c = it && it.curse; if (!c) return '';
  const n = { atk: 'Angriff', def: 'Verteidigung', init: 'Initiative' };
  return Object.entries(c).filter(([k, v]) => k !== 'fx' && v).map(([k, v]) => `${n[k] || k} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(', ');
}
// Gegenstandsdefinition: erzeugte Ausrüstung (state.gear) hat Vorrang vor den festen Gegenständen (data.items)
const _clean = new WeakMap();
// 0.47.9: Entflucht heißt nicht „wie neu“: positive Boni (atk/def/init, fx-Zahlen) halbiert, gerundet, mindestens 1. Beschreibungszahlen werden angepasst.
export const halfBonus = (v) => (typeof v === 'number' && v > 0 ? Math.max(1, Math.round(v * 0.5)) : v);
export function cleansedDef(b) {
  const c = { ...b, cleansed: true }; delete c.curse;
  let desc = b.desc || '';
  for (const [k, lab] of [['atk', 'Angriff'], ['def', 'Verteidigung'], ['init', 'Initiative']]) {
    if (typeof b[k] === 'number' && b[k] > 0) { c[k] = halfBonus(b[k]); desc = desc.replace(new RegExp(`\\+${b[k]} ${lab}`), `+${c[k]} ${lab}`); }
  }
  if (b.fx) {
    c.fx = { ...b.fx };
    const pats = { lifesteal: (v, n) => [`Lebensraub ${v} %`, `Lebensraub ${n} %`], gold: (v, n) => [`Gold +${v} %`, `Gold +${n} %`], dodge: (v, n) => [`Ausweichen +${v} %`, `Ausweichen +${n} %`], crit: (v, n) => [`Krit +${v} %`, `Krit +${n} %`], resist: (v, n) => [`Widerstand +${v} %`, `Widerstand +${n} %`] };
    for (const k of Object.keys(c.fx)) {
      const v = c.fx[k]; if (typeof v !== 'number' || v <= 0) continue;
      const n = halfBonus(v); c.fx[k] = n;
      if (pats[k]) { const [a, z] = pats[k](v, n); desc = desc.replace(a, z); }
    }
  }
  c.desc = desc + ' Von Ysolde entflucht: nur noch halbe Wirkung.';
  return c;
}

export const itemDef = (state, data, id) => {
  const g = state && state.gear && state.gear[id]; if (g) return g;
  const b = data.items[id];
  if (b && b.curse && state && state.flags && state.flags['ent:' + id]) { // 0.46.0: von Ysolde entflucht (Flagge, kein Eintrag in state.gear – dessen Schlüssel sind g<Zahl>)
    if (!_clean.has(b)) { const c = cleansedDef(b); _clean.set(b, c); }
    return _clean.get(b);
  }
  return b;
};

// 0.46.0: Hexe Ysolde (Taverne) nimmt Flüche von Gegenständen. Gegenleistung: EXORCISE.gold Gold und EXORCISE.item (ein mittlerer Heiltrank).
// Sie nimmt nur den Malus (item.curse), nie den Nutzen. Feste Gegenstände werden dafür als Kopie ohne Fluch in state.gear abgelegt (itemDef hat dort Vorrang).
export const EXORCISE = { gold: 100, item: 'potion_m' };
export function cursedOwned(state, data) {
  const all = [...(state.heroes || []), ...(state.reserve || [])];
  const ids = new Set(Object.keys(state.inv || {}).filter((k) => (state.inv[k] || 0) > 0));
  for (const h of all) for (const s of SLOTS) if (h && h.equip && h.equip[s]) ids.add(h.equip[s]);
  return [...ids].filter((id) => { const it = itemDef(state, data, id); return it && it.kind === 'equip' && it.curse && curseKnown(state, data, id); }).map((id) => {
    const it = itemDef(state, data, id), worn = all.find((h) => h && h.equip && SLOTS.some((s) => h.equip[s] === id));
    return { id, name: it.name, curse: curseText(it), worn: worn ? worn.name : null, ok: state.gold >= EXORCISE.gold && (state.inv[EXORCISE.item] || 0) > 0 };
  });
}
export function exorcise(state, data, id) {
  if (state.combat) return { error: 'in-combat' };
  const o = cursedOwned(state, data).find((x) => x.id === id);
  if (!o) return { error: 'unknown' };
  if (state.gold < EXORCISE.gold) return { error: 'gold', cost: EXORCISE.gold };
  if (!((state.inv[EXORCISE.item] || 0) > 0)) return { error: 'item', item: data.items[EXORCISE.item].name };
  const it = itemDef(state, data, id);
  state.gold -= EXORCISE.gold; state.inv[EXORCISE.item]--; if (state.inv[EXORCISE.item] <= 0) delete state.inv[EXORCISE.item];
  state.flags['ent:' + id] = true;
  return { msg: `Ysolde murmelt über ${it.name}, der Sud zischt. Der Fluch (${curseText(it)}) ist fort. Kosten: ${EXORCISE.gold} Gold und ${data.items[EXORCISE.item].name}.`, sfx: 'unlock', changed: true };
}
export function gearBonus(data, h, state) {
  const b = { atk: 0, def: 0, init: 0 };
  for (const s of SLOTS) { const it = h.equip && h.equip[s] && itemDef(state, data, h.equip[s]); if (it && it.kind === 'equip') { b.atk += (it.atk || 0) + ((it.curse && it.curse.atk) || 0); b.def += (it.def || 0) + ((it.curse && it.curse.def) || 0); b.init += (it.init || 0) + ((it.curse && it.curse.init) || 0); } }
  return b;
}
export const heroAtk = (data, h, state) => h.atk + gearBonus(data, h, state).atk + talentSum(data, h, 'atk') + Math.min(3, partyFx(state, data, 'aura_atk')); // aura_atk (0.22.0): Kampfruf der Anführer
export const heroDef = (data, h, state) => h.def + gearBonus(data, h, state).def + talentSum(data, h, 'def');
export const heroInit = (data, h, state) => h.init + gearBonus(data, h, state).init + talentSum(data, h, 'init');
export function canEquip(data, h, itemId, state) {
  const it = itemDef(state, data, itemId);
  return !!it && it.kind === 'equip' && SLOTS.includes(it.slot) && (!it.classes || it.classes.includes(h.cls)) && (!it.races || it.races.includes(h.race)); // 0.45.0: races = nur diese Rassen (Spezialwaffen)
}
// 0.30.0: Vergleich „Was brächte dieser Gegenstand diesem Helden?“ gegenüber dem aktuell getragenen Stück im selben Platz.
// Ein unerkannter Fluch fließt NICHT ein (sonst würde er verraten); erkannte Flüche zählen mit ihrem Malus.
export function gearCompare(state, data, h, itemId) {
  const it = itemDef(state, data, itemId);
  if (!it || it.kind !== 'equip' || !canEquip(data, h, itemId, state)) return null;
  const curId = h.equip && h.equip[it.slot] || null, cur = curId ? itemDef(state, data, curId) : null;
  const val = (x, id, k) => !x ? 0 : (x[k] || 0) + (x.curse && curseKnown(state, data, id) ? (x.curse[k] || 0) : 0);
  const d = {}; let total = 0;
  for (const k of ['atk', 'def', 'init']) { d[k] = val(it, itemId, k) - val(cur, curId, k); total += d[k]; }
  return { slot: it.slot, cur: curId, delta: d, total, better: total > 0, worse: total < 0 };
}
// Wer trägt gerade welchen Gegenstand? [{hero, idx, slots:{weapon:id|null,...}}]
export function wornOverview(state, data) {
  return state.heroes.map((h, idx) => ({ hero: h, idx, slots: Object.fromEntries(SLOTS.map((s) => [s, h.equip && h.equip[s] || null])) }));
}
export function equipItem(state, data, itemId, heroIdx) {
  if (state.combat) return { error: 'in-combat' };
  const h = state.heroes[heroIdx];
  if (!h || !(state.inv[itemId] > 0)) return { error: 'no-item' };
  if (!canEquip(data, h, itemId, state)) return { error: 'not-allowed' };
  const it = itemDef(state, data, itemId);
  h.equip = h.equip || { weapon: null, armor: null };
  const old = h.equip[it.slot];
  const setsBefore = activeSets(data, h).map((x) => x.id);
  state.inv[itemId]--;
  if (old) state.inv[old] = (state.inv[old] || 0) + 1;
  h.equip[it.slot] = itemId;
  let curseMsg = '';
  if (it.curse && !(state.flags['id:' + itemId])) { state.flags['id:' + itemId] = true; curseMsg = ` Ein Fluch! ${it.name}: ${curseText(it)}.`; }
  for (const k of Object.keys(state.inv)) if (state.inv[k] === 0 && itemDef(state, data, k).kind === 'equip') delete state.inv[k];
  const setNew = activeSets(data, h).filter((x) => !setsBefore.includes(x.id)).map((x) => ` Set „${x.name}“ vollständig! ${x.desc}`).join(''); // 0.47.18: Meldung bei Vollendung
  return { msg: `${h.name} legt ${it.name} an${old ? ` (${itemDef(state, data, old).name} zurück ins Inventar)` : ''}.${curseMsg}${setNew}`, sfx: setNew ? 'sting' : 'ui' };
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
  const bases = (opts.bases || data.lootBases || []).filter((id) => data.items[id] && data.items[id].kind === 'equip' && (!opts.slot || data.items[id].slot === opts.slot));
  if (!bases.length) return null;
  const base = data.items[bases[randInt(state, 0, bases.length - 1)]], baseId = bases.find((id) => data.items[id] === base);
  const Q = data.quality, total = Q.reduce((n, q) => n + q.weight, 0);
  const pick = () => { let r = rand(state) * total; for (let i = 0; i < Q.length; i++) { r -= Q[i].weight; if (r < 0) return i; } return 0; };
  let qi = pick();
  for (let b = 0; b < (opts.boost || 0); b++) qi = Math.max(qi, pick());
  qi = Math.max(qi, Math.min(Q.length - 1, opts.minQ || 0)); // 0.37.5: Mindestqualität (Index) für Bosse
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
  markNew(state, uid);
  return uid;
}
export const ownsItem = (state, id) => (state.inv[id] || 0) > 0 || state.heroes.some((h) => h.equip && SLOTS.some((s) => h.equip[s] === id));
export const qualityOf = (state, data, id) => { const it = itemDef(state, data, id); return it && it.q ? (it.q === 'unique' ? { id: 'unique', name: 'Einzigartig', color: '#ffb347' } : it.q === 'set' ? { id: 'set', name: 'Set', color: '#6fdc8c' } : it.q === 'meister' ? { id: 'meister', name: 'Meisterwerk', color: '#e8a0ff' } : data.quality.find((q) => q.id === it.q)) : null; };
// Beute nach einem Sieg: je Gegnerart data.enemies.<id>.drops (feste Gegenstände, einmalig) und gearDrop {chance, boost, slot?}
function rollDrops(state, data, enemies, msgs) {
  for (const e of enemies) {
    const en = data.enemies[e.kind];
    for (const d of en.drops || []) { // { item | pick: [ids], chance }: Unikate fallen nur, solange sie noch nicht im Besitz sind
      const cand = (d.pick || [d.item]).filter((id) => data.items[id] && !ownsItem(state, id));
      if (!cand.length || !(rand(state) * 100 < (d.chance ?? 100))) continue;
      const id = cand[cand.length === 1 ? 0 : randInt(state, 0, cand.length - 1)];
      state.inv[id] = (state.inv[id] || 0) + 1; markNew(state, id);
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
  if (!it || it.kind === 'quest' || it.q === 'unique' || it.q === 'set' || it.noSell) return null;
  const base = it.base ? data.items[it.base] : it;
  if (!base || !(base.value > 0)) return null;
  if (!it.base) return base.value;
  const qi = Math.max(0, data.quality.findIndex((q) => q.id === it.q)), q = data.quality[qi];
  const extra = Math.max(0, (it.atk || 0) + (it.def || 0) + (it.init || 0) - (base.atk || 0) - (base.def || 0) - (q ? q.statBonus : 0));
  return Math.floor(base.value * (1 + 0.5 * qi)) + 4 * extra;
}
export const haggle = (state, data) => Math.min(30, partySkill(state, data, 'haggle')); // 0.20.0: Talent „Feilschen“ (Prozent, höchstens 30)
export const sellPrice = (state, data, id) => { const w = itemWorth(state, data, id); return w == null ? null : Math.max(1, Math.floor((w / 2) * (100 + haggle(state, data)) / 100)); };
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
// 0.47.9: Begrenzter Bestand je Gegenstand (stock[].n, Standard 1). state.shops[shopId] = { t: Zeitpunkt des ersten Verkaufs seit dem letzten Nachschub (ms), sold: { item: Anzahl } }.
// Nachschub erst nach SHOP_RESTOCK_MS echter Zeit (1 Stunde) nach diesem ersten Verkauf; dann ist alles wieder da. Optionales Feld, keine Speicher-Migration nötig.
export const SHOP_RESTOCK_MS = 60 * 60 * 1000;
export function shopRestock(state, shopId, now = Date.now()) {
  const r = state.shops && state.shops[shopId];
  if (r && r.t && now - r.t >= SHOP_RESTOCK_MS) delete state.shops[shopId];
}
export function shopLeft(state, data, shopId, itemId, now = Date.now()) {
  shopRestock(state, shopId, now);
  const e = shopStock(data, shopId).find((x) => x.item === itemId); if (!e) return 0;
  const r = state.shops && state.shops[shopId];
  return Math.max(0, (e.n == null ? 1 : e.n) - ((r && r.sold && r.sold[itemId]) || 0));
}
export const shopRestockIn = (state, shopId, now = Date.now()) => { const r = state.shops && state.shops[shopId]; return r && r.t ? Math.max(0, SHOP_RESTOCK_MS - (now - r.t)) : 0; };
export const buyPrice = (state, data, id) => { const w = itemWorth(state, data, id); return w == null ? null : Math.max(1, Math.ceil((w * balancePct(state, data, 'price') / 100 * (100 - haggle(state, data))) / 100)); }; // 0.47.0: Aufschlag je Akt
export function buyItem(state, data, shopId, itemId, now = Date.now()) {
  if (state.combat) return { error: 'in-combat' };
  if (!shopStock(data, shopId).some((e) => e.item === itemId)) return { error: 'not-in-stock' };
  if (shopLeft(state, data, shopId, itemId, now) < 1) return { error: 'sold-out' };
  const p = buyPrice(state, data, itemId), it = data.items[itemId];
  if (p == null) return { error: 'not-for-sale' };
  if (state.gold < p) return { error: 'no-gold', price: p };
  state.gold -= p;
  state.shops = state.shops || {};
  const r = state.shops[shopId] || (state.shops[shopId] = { t: now, sold: {} });
  r.sold[itemId] = (r.sold[itemId] || 0) + 1;
  state.inv[itemId] = (state.inv[itemId] || 0) + 1;
  markNew(state, itemId);
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
// Nicht im Kampf, nicht bei Gegnern in Sicht oder näher als data.rest.enemyDistance Schritte (restThreat).
// Rast-Sperre (0.16.4, Nutzerwunsch): kein lebender Gegner näher als cfg.enemyDistance SCHRITTE (Weglänge, Wände zählen)
// und keiner in Sichtlinie (beliebig weit; Mauern, geschlossene Türen und Geheimwände verdecken, Gitter nicht).
// Weglänge: geschlossene, unverschlossene Türen gelten als begehbar (die Gruppe kann sie öffnen); verschlossene Türen,
// geschlossene Gitter und Geheimwände trennen. Truhen, Tafeln usw. zählen nicht als Hindernis (man geht drumherum).
export function restThreat(state, data, cfg = data.rest || {}) {
  const lvl = getLevel(data, state), w = lvl.map[0].length, h = lvl.map.length;
  const D = cfg.enemyDistance == null ? 10 : cfg.enemyDistance;
  const foes = state.objs.filter((o) => o.type === 'enemy' && !o.dead && !o.lurk && o.x >= 0 && o.y >= 0 && o.x < w && o.y < h);
  if (!foes.length) return { near: 0, seen: false };
  const at = (x, y) => state.objs.filter((o) => o.x === x && o.y === y);
  const pathBlocked = (x, y) => isWallChar(cellChar(lvl, x, y)) || at(x, y).some((o) => (o.type === 'door' && !o.open && o.locked) || ((o.type === 'gate' || o.type === 'secret') && !o.open) || (o.type === 'lever' && o.wall));
  const sightBlocked = (x, y) => isWallChar(cellChar(lvl, x, y)) || at(x, y).some((o) => (o.type === 'door' && !o.open) || (o.type === 'secret' && !o.open) || (o.type === 'lever' && o.wall) || (o.type === 'illusion' && !o.found));
  const foeAt = new Set(foes.map((o) => o.y * w + o.x));
  const { x: px, y: py } = state.player;
  const dist = new Int16Array(w * h).fill(-1), q = [py * w + px];
  dist[py * w + px] = 0;
  let near = 0;
  for (let i = 0; i < q.length && !near; i++) {
    const c = q[i], cx = c % w, cy = (c - cx) / w, d = dist[c];
    if (d >= D) continue;
    if (foeAt.has(c) && d > 0) { near = d; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[n] >= 0) continue;
      if (foeAt.has(n)) { if (d + 1 < D) { near = d + 1; break; } continue; }
      if (pathBlocked(nx, ny)) continue;
      dist[n] = d + 1; q.push(n);
    }
  }
  if (near) return { near, seen: false };
  if (cfg.sight === false) return { near: 0, seen: false };
  const los = (tx, ty) => { // Sichtlinie Mitte zu Mitte, Abtastung in Zehntelfeldern
    const ax = px + 0.5, ay = py + 0.5, dx = tx + 0.5 - ax, dy = ty + 0.5 - ay, n = Math.ceil(Math.hypot(dx, dy) * 10);
    for (let k = 1; k < n; k++) {
      const cx = Math.floor(ax + dx * k / n), cy = Math.floor(ay + dy * k / n);
      if ((cx === px && cy === py) || (cx === tx && cy === ty)) continue;
      if (sightBlocked(cx, cy)) return false;
    }
    return true;
  };
  return { near: 0, seen: foes.some((o) => los(o.x, o.y)) };
}
export function restParty(state, data) {
  if (state.combat) return { error: 'in-combat' };
  const cfg = data.rest || { hungryPct: 30, enemyDistance: 10, sight: true };
  const th = restThreat(state, data, cfg);
  if (th.near) return { error: 'enemy-near', dist: th.near };
  if (th.seen) return { error: 'enemy-seen' };
  if (state.heroes.every((h) => h.hp >= h.maxHp && h.mp >= h.maxMp)) return { error: 'nothing-to-do' };
  const fed = (state.inv.ration || 0) > 0;
  if (fed) state.inv.ration--;
  for (const o of state.objs) if (o.jammed) delete o.jammed; // 0.20.0: verklemmte Truhenschlösser lassen sich nach der Rast wieder versuchen
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
  c.enemies.forEach((e, i) => { if (e.hp > 0) list.push({ side: 'e', idx: i, key: enemyOf(data, e).init + rand(state) * 4 + slowed('e', i) + (c.ambush && c.round === 1 ? 1000 : 0) }); });
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
  let m = en;
  if (e.phase && en.phases) for (let i = 0; i < e.phase && i < en.phases.length; i++) m = { ...m, ...(en.phases[i].set || {}) };
  if (e.elite && data.elites) { // 0.41.0: Elitegegner – Zuschläge aus data.elites.list
    const el = data.elites.list.find((x) => x.id === e.elite);
    if (el) { m = { ...m, atk: Math.round(m.atk * (100 + (el.atkPct || 0)) / 100), def: m.def + (el.def || 0), init: m.init + (el.init || 0) }; if (el.onHit && !m.onHit) m.onHit = el.onHit; }
  }
  if (e.fx) { // 0.34.0: Wirkung von Hinweisen (en.flagFx, beim Kampfbeginn in e.fx übernommen): resist = Zuschlag je Element, callChance = Zuschlag auf die Hilferuf-Chance
    m = { ...m };
    if (e.fx.resist) { m.resist = { ...(m.resist || {}) }; for (const [el, v] of Object.entries(e.fx.resist)) m.resist[el] = Math.max(-100, Math.min(100, (m.resist[el] || 0) + v)); }
    if (e.fx.callChance && m.tactic && m.tactic.call) m.tactic = { ...m.tactic, call: { ...m.tactic.call, chance: Math.max(0, m.tactic.call.chance + e.fx.callChance) } };
  }
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

export function startCombat(state, data, enemyObj, opts = {}) {
  const en = group(data, enemyObj), hp = diffPct(state, data, 'hp');
  if (hp !== 100) for (const e of en) { e.hp = Math.max(1, Math.round((e.hp * hp) / 100)); e.maxHp = Math.max(1, Math.round((e.maxHp * hp) / 100)); }
  applyElites(state, data, en, enemyObj);
  state.combat = {
    enemies: en,
    order: [], pos: 0, round: 1, defending: {}, status: {}, over: null, ambush: !!opts.ambush, startMsgs: [], struck: {}
  };
  const c0 = state.combat;
  for (const e of en) if (e.elite) { const el = data.elites.list.find((x) => x.id === e.elite); c0.startMsgs.push(`${e.name} ist ein Elitegegner: ${el.desc}`); }
  { const lo = (getLevel(data, state).objects || []).find((q) => q.id === enemyObj.id), fl = lo && lo.flood; // 0.38.0: Flutkampf; `off` = Marke, die der Pumpenhahn setzt
    if (fl) { c0.flood = { on: !state.flags[fl.off] }; c0.startMsgs.push(c0.flood.on ? 'Die Pumpen laufen noch: das Wasser steigt mit jeder Runde. Wer lange kämpft, steht bald bis zur Brust im Wasser.' : 'Die Pumpen stehen still. Das Wasser bleibt unten.'); } }
  for (const e of c0.enemies) for (const fx of data.enemies[e.kind].flagFx || []) if (state.flags[fx.flag]) { // 0.34.0: z. B. Alders Rat (spinne:schwaeche)
    e.fx = { resist: { ...((e.fx || {}).resist || {}), ...(fx.resist || {}) }, callChance: ((e.fx || {}).callChance || 0) + (fx.callChance || 0) };
    if (fx.msg && !c0.startMsgs.includes(fx.msg)) c0.startMsgs.push(fx.msg);
  }
  if (c0.ambush) { const w = state.heroes.find((h) => h.hp > 0 && fxSum(data, h, 'noambush') > 0); if (w) { c0.ambush = false; c0.startMsgs.push(`${w.name} hat den Hinterhalt kommen sehen – kein Überfall.`); } } // Schatten (0.22.0)
  { const n = state.heroes.find((h) => h.hp > 0 && fxSum(data, h, 'opener') > 0); if (n) { const live = c0.enemies.map((e, i) => i); const ti = live[randInt(state, 0, live.length - 1)]; addStatus(state, data, 'e', ti, { status: 'slow', chance: 100, turns: 1 }, c0.startMsgs, state.heroes.indexOf(n)); c0.startMsgs.unshift(`${n.name} wirft ein Fangnetz.`); } } // Fallensteller (0.22.0)
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
  if (opts.crit) d = Math.floor((d * 3) / 2);
  if (opts.trace) Object.assign(opts.trace, { crit: !!opts.crit, atk, roll: r, red, mult: opts.mult || 0, elem: opts.elem || 0, elemName: opts.elemName || '', back: !!opts.backMelee, def: !!opts.defending, total: d });
  return d;
}
export function explain(tr) {
  return `Angriff ${tr.atk} + Wurf ${tr.roll} − Rüstung ${tr.red}${tr.mult ? ` · ${tr.mult} %` : ''}${tr.elem ? ` · ${tr.elemName} ${tr.elem > 0 ? '+' : ''}${tr.elem} %` : ''}${tr.back ? ' · ½ Hinterreihe' : ''}${tr.def ? ' · ½ Verteidigung' : ''}${tr.crit ? ' · kritisch ×1,5' : ''}${tr.cover ? ' · gedeckt −25 %' : ''} = ${tr.total}`;
}

// ---------- Statuswirkungen (nur im Kampf, werden nicht gespeichert) ----------
// c.status['h0' | 'e0'] = { poison: {t, p}, stun: {t}, weak: {t} }
const skey = (side, idx) => side + idx;
const actorName = (state, side, idx) => (side === 'h' ? state.heroes[idx].name : state.combat.enemies[idx].name);
export function statusOf(state, side, idx) { return (state.combat && state.combat.status[skey(side, idx)]) || {}; }
export function addStatus(state, data, side, idx, inf, msgs, src = null) {
  if (!inf) return;
  if (inf.chance < 100 && rand(state) * 100 >= inf.chance) return;
  if (side === 'h') { const rs = fxSum(data, state.heroes[idx], 'resist'); if (rs > 0 && rand(state) * 100 < rs) { msgs.push(`${state.heroes[idx].name} wehrt ${data.statuses[inf.status].name} ab.`); return; } }
  if (side === 'e') { const ie = enemyOf(data, state.combat.enemies[idx]); if (ie && (ie.immune || []).includes(inf.status)) { msgs.push(`${actorName(state, side, idx)} ist immun gegen ${data.statuses[inf.status].name}.`); return; } } // 0.37.3: enemies.<art>.immune = [Status]
  if (side === 'h' && inf.status === 'poison' && partyFx(state, data, 'immune_poison') > 0) { msgs.push(`${state.heroes[idx].name} ist gegen Gift gefeit (Kräuterkunde).`); return; } // Naturkundiger (0.22.0)
  if (side === 'e' && src != null && (inf.status === 'poison' || inf.status === 'burn' || inf.status === 'bleed')) { const dp = fxSum(data, state.heroes[src], 'dotplus'); if (dp > 0) inf = { ...inf, power: (inf.power || 0) + dp }; } // Giftmischer
  const c = state.combat, k = skey(side, idx);
  const st = c.status[k] || (c.status[k] = {});
  const cur = st[inf.status];
  st[inf.status] = { t: Math.max(cur ? cur.t : 0, inf.turns), p: Math.max(cur ? cur.p || 0 : 0, inf.power || 0) };
  if (src != null) st[inf.status].by = src; // welcher Held den Status gesetzt hat (für Kombinationsangriffe)
  const nm = data.statuses[inf.status].name;
  msgs.push(`${actorName(state, side, idx)}: ${nm}${(inf.status === 'poison' || inf.status === 'burn' || inf.status === 'bleed') ? ` (${inf.turns} Runden, ${inf.power} Schaden je Runde)` : (inf.status === 'weak' || inf.status === 'slow' || inf.status === 'curse') ? ` (${inf.turns} Runden)` : ''}.`);
}
// 0.47.0: Beute und Preise nach Spielfortschritt. data.balance.acts[akt] = { gold, xp, price } in Prozent; data.balance.levels[gebiet] = Akt (Standard 1).
// Maßgeblich ist der höchste bisher erreichte Akt (aktuelles Gebiet + besuchte), damit Zurückgehen keine Beute-Landwirtschaft ermöglicht.
export function reachedAct(state, data) {
  const lv = (data.balance && data.balance.levels) || {};
  let a = lv[state.levelId] || 1;
  for (const id of Object.keys(state.areas || {})) a = Math.max(a, lv[id] || 1);
  return a;
}
export const balancePct = (state, data, key) => { const b = data.balance && data.balance.acts && data.balance.acts[reachedAct(state, data)]; return b && b[key] != null ? b[key] : 100; };
// Schwierigkeit (0.17.0): data.difficulty[state.difficulty] = { name, hp, atk, gold, xp } in Prozent; fehlt es, gilt Normal (100 %).
// Gebietszuschlag (0.17.0): data.levels.<id>.foe = { hp, atk } in Prozent (Gegner der mittleren Gebiete sind stärker), wirkt zusätzlich zum Schwierigkeitsgrad.
const areaPct = (state, data, key) => { const l = state && data.levels[state.levelId]; return (l && l.foe && l.foe[key]) || 100; };
export const diffPct = (state, data, key) => {
  const d = ((data.difficulty && data.difficulty[(state && state.difficulty) || 'normal']) || {})[key] || 100;
  return key === 'hp' || key === 'atk' ? Math.round((d * areaPct(state, data, key)) / 100) : d;
};
const rageAtk = (e, atk) => (e && e.rage ? Math.round((atk * RAGE_PCT) / 100) : atk);
const foeAtk = (state, data, atk) => { const p = diffPct(state, data, 'atk'); return p === 100 ? atk : Math.max(1, Math.round((atk * p) / 100)); };
const pierceDef = (data, h, def) => { const p = fxSum(data, h, 'pierce'); return p > 0 ? Math.floor((def * (100 - Math.min(90, p))) / 100) : def; }; // Scharfschütze (0.22.0)
const effDef = (state, side, idx, def) => (statusOf(state, side, idx).curse ? Math.floor((def * 7) / 10) : def); // Fluch: Verteidigung −30 %
const effAtk = (state, side, idx, atk) => (statusOf(state, side, idx).weak ? Math.max(1, Math.floor((atk * 3) / 4)) : atk);

// Ende des eigenen Zugs: Gift wirkt, Dauer sinkt. Rückgabe: true, wenn danach alle Gegner besiegt sind.
function endOfTurn(state, data, side, idx, msgs) {
  const c = state.combat, k = skey(side, idx), st = c.status[k];
  if (!st) return false;
  const tgt = side === 'h' ? state.heroes[idx] : c.enemies[idx];
  for (const [n, label] of [['poison', 'Giftschaden'], ['burn', 'Brandschaden'], ['bleed', 'Blutungsschaden']]) {
    if (st[n] && tgt.hp > 0) {
      const before = tgt.hp;
      tgt.hp = Math.max(side === 'h' ? 1 : 0, tgt.hp - st[n].p);
      const lost = before - tgt.hp;
      if (lost > 0) msgs.push(`${tgt.name} erleidet ${lost} ${label}.`);
      if (side === 'e' && tgt.hp === 0) msgs.push(`${tgt.name} bricht zusammen.`);
    }
  }
  for (const n of ['poison', 'burn', 'bleed', 'weak', 'slow', 'curse']) if (st[n] && --st[n].t <= 0) { delete st[n]; msgs.push(`${tgt.name}: ${data.statuses[n].name} klingt ab.`); }
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
  checkRage(state, data, msgs);
  checkPhases(state, data, msgs);
  advance(state, data, msgs);
  return { msgs, sfx: 'miss', over: null };
}

function advance(state, data, msgs) {
  const c = state.combat, r0 = c.round;
  c.pos++;
  normalizeTurn(state, data);
  if (msgs && c.flood && c.flood.on && c.round > r0) floodTick(state, c, msgs);
}
// 0.38.0: Flutkampf – steigt das Wasser (Gruppe mit `flood`, Pumpen laufen noch), verlieren alle wachen Helden ab Runde 3 Lebenspunkte; sie sinken nie unter 1
const FLOOD_LABEL = ['das Wasser steigt', 'knöchelhoch', 'kniehoch', 'hüfthoch', 'brusthoch'], FLOOD_PCT = [0, 0, 5, 8, 12];
export function floodLabel(c) { return c && c.flood && c.flood.on ? FLOOD_LABEL[Math.min(4, c.round - 1)] : ''; }
function floodTick(state, c, msgs) {
  const lv = Math.min(4, c.round - 1), pct = FLOOD_PCT[lv];
  if (!pct) { msgs.push(`Die Flut: ${FLOOD_LABEL[lv]}.`); return; }
  for (const h of state.heroes) if (h.hp > 0) h.hp = Math.max(1, h.hp - Math.max(1, Math.ceil((h.maxHp * pct) / 100)));
  msgs.push(`Die Flut steht ${FLOOD_LABEL[lv]}: alle wachen Helden verlieren ${pct} % ihrer Höchst-LP.`);
}

function finishVictory(state, data, msgs) {
  const c = state.combat;
  let gold = 0, xp = 0;
  for (const e of c.enemies) {
    if (e.fled) { const o = state.objs.find((q) => q.id === e.objId); if (o) { o.dead = true; o.hp = 0; } continue; } // Geflohene: keine Beute, keine EP
    const eli = e.elite && data.elites ? data.elites.list.find((x) => x.id === e.elite) : null, em = eli ? data.elites.rewardPct / 100 : 1; // 0.41.0: Elite zahlen mehr
    gold += Math.round(data.enemies[e.kind].gold * em);
    xp += Math.round((data.enemies[e.kind].xp || 0) * em);
    if (eli) state.eliteKills = (state.eliteKills || 0) + 1;
    noteBestiary(state, e.kind, 'won');
    state.kills = state.kills || {}; state.kills[e.kind] = (state.kills[e.kind] || 0) + 1; // 0.40.0: Abschüsse für Steckbriefe
    { const ms = masteryStep(state, data, e.kind); if (ms) { xp += ms.xp; msgs.push(ms.msg); } } // 0.41.0: Meisterschaft im Bestiarium
    const obj = state.objs.find((o) => o.id === e.objId);
    if (obj) { obj.dead = true; obj.hp = 0; const sc = getLevel(data, state).scene; if (sc && sc.enemy === obj.id && state.flags[sc.id]) { state.flags[sc.id] = false; if (sc.door) { const dr = state.objs.find((o) => o.id === sc.door && o.type === 'door'); if (dr) { dr.locked = false; dr.sealed = false; dr.open = true; } } if (sc.endMsg) msgs.push(sc.endMsg); } } // 0.47.17: Albtraum endet mit dem Sieg
  }
  rollTrophies(state, data, c.enemies.filter((x) => !x.fled), msgs);
  const dg = diffPct(state, data, 'gold'), dx = diffPct(state, data, 'xp');
  if (dg !== 100) gold = Math.floor((gold * dg) / 100);
  if (dx !== 100) xp = Math.floor((xp * dx) / 100);
  { const bg = balancePct(state, data, 'gold'), bx = balancePct(state, data, 'xp'); if (bg !== 100) gold = Math.floor((gold * bg) / 100); if (bx !== 100) xp = Math.floor((xp * bx) / 100); } // 0.47.0
  const gp = Math.min(60, state.heroes.reduce((a, h) => a + (h.hp > 0 ? fxSum(data, h, 'gold') : 0), 0));
  if (gp > 0 && gold > 0) gold += Math.floor((gold * gp) / 100);
  state.gold += gold;
  msgs.push(`Sieg! Beute: ${gold} Gold${gp > 0 ? ` (Talente +${gp} %)` : ''}.`);
  if (xp > 0) { msgs.push(`Erfahrung: +${xp} EP für jeden Helden, der noch steht.`); grantXp(state, data, xp, msgs); }
  rollDrops(state, data, c.enemies.filter((x) => !x.fled), msgs);
  { const ph = Math.min(25, partyFx(state, data, 'postheal')); if (ph > 0) { for (const h of state.heroes) if (h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + Math.ceil((h.maxHp * ph) / 100)); msgs.push(`Nachsorge: alle wachen Helden +${ph} % LP.`); } } // Heiler (0.22.0)
  { const lp = state.heroes.reduce((m, h) => Math.max(m, h.hp > 0 ? fxSum(data, h, 'loot_potion') : 0), 0); if (lp > 0 && rand(state) * 100 < lp) { state.inv.potion = (state.inv.potion || 0) + 1; markNew(state, 'potion'); msgs.push('Glückspilz: Ihr findet einen Heiltrank bei den Gegnern.'); } } // Gauner
  for (const h of state.heroes) if (h.hp <= 0) { h.hp = 1; msgs.push(`${h.name} kommt mit 1 LP wieder zu sich.`); } // bewusstlos statt tot (Entscheidung des Nutzers): nach dem Sieg stehen Besiegte mit 1 LP auf; Heilung über Rast/Tränke
  state.combat = null;
  return gold;
}

function regen(h, msgs, data) {
  if (h.mp < h.maxMp) h.mp = Math.min(h.maxMp, h.mp + MP_REGEN + (data ? fxSum(data, h, 'regen') : 0));
}
// Klingentänzer (0.22.0): der erste Treffer jedes Helden im Kampf ist kritisch
const firstCrit = (state, data, h, idx) => { const c = state.combat; if (!c || c.struck[idx] || !(fxSum(data, h, 'firstcrit') > 0)) return false; c.struck[idx] = true; return true; };
const rollCrit = (state, data, h) => { const c = fxSum(data, h, 'crit'); return c > 0 && rand(state) * 100 < c; };

// ---------- Kombinationsangriffe (0.18.0) ----------
// data.combos = [{ id, name, status, by: melee|ranged|fire|ice|lightning|any, mult, consume?, desc }]. Automatisch: trifft ein Held einen Gegner,
// der einen passenden Status von einem ANDEREN Helden trägt, zählt der Treffer mit dem Kombi-Faktor. Nicht bei „Alle angreifen“.
export function comboFor(state, data, heroIdx, enemyIdx, ab = null) {
  const c = state.combat, h = state.heroes[heroIdx];
  if (!c || !h || !data.combos) return null;
  const st = c.status['e' + enemyIdx];
  if (!st) return null;
  const el = ab && ab.element;
  for (const cb of data.combos) {
    const s0 = st[cb.status];
    if (!s0 || s0.by == null || s0.by === heroIdx) continue;
    const ok = cb.by === 'any' || (cb.by === 'melee' && !h.ranged && !el) || (cb.by === 'ranged' && h.ranged && !el) || (el && cb.by === el);
    if (ok) return cb;
  }
  return null;
}
function comboDone(state, data, cb, h, ei, msgs) {
  const c = state.combat, e = c.enemies[ei], st = c.status['e' + ei];
  const by = st && st[cb.status] && state.heroes[st[cb.status].by];
  msgs.push(`Kombination „${cb.name}“${by ? ` (${by.name} + ${h.name})` : ''}: ${cb.mult - 100} % mehr Schaden!`);
  if (cb.consume && st) delete st[cb.status];
  c.combos = (c.combos || 0) + 1;
}

// Heilzauber nehmen Statuswirkungen: ab.cleanse = 'poison' oder ['poison', 'bleed', …]
export const cleanseList = (ab) => (ab && ab.cleanse ? [].concat(ab.cleanse) : []);
export const canCleanse = (ab, st) => !!st && cleanseList(ab).some((k) => st[k]);

export function heroAction(state, data, act) {
  const c = state.combat;
  if (!c || c.over) return { error: 'no-combat' };
  const a = currentActor(state);
  if (!a || a.side !== 'h') return { error: 'not-hero-turn' };
  const h = state.heroes[a.idx];
  const msgs = [];
  const aliveBefore = c.enemies.map((e) => e.hp > 0);
  let sfx = null;
  if (act.type === 'attack') {
    let ti = act.target;
    if (ti == null || !c.enemies[ti] || c.enemies[ti].hp <= 0) ti = c.enemies.findIndex((e) => e.hp > 0);
    const e = c.enemies[ti];
    const tr = {};
    const cb = comboFor(state, data, a.idx, ti);
    let d = calcDamage(state, effAtk(state, 'h', a.idx, heroAtk(data, h, state)), pierceDef(data, h, effDef(state, 'e', ti, enemyOf(data, e).def)), { backMelee: backPen(data, h), crit: firstCrit(state, data, h, a.idx) || rollCrit(state, data, h), mult: cb ? cb.mult : 0, trace: tr });
    d = cover(state, data, ti, d, tr);
    if (d === 0) { msgs.push(`${h.name} verfehlt ${e.name}.`); sfx = 'miss'; }
    else {
      if (cb) comboDone(state, data, cb, h, ti, msgs);
      e.hp = Math.max(0, e.hp - d);
      leech(data, h, d, msgs);
      const note = (backPen(data, h) ? ' (Hinterreihe, Nahkampf: halber Schaden)' : '') + (tr.cover ? ' (gedeckt)' : '');
      msgs.push(`${h.name} trifft ${e.name} für ${d} Schaden${note}.${SEP}${explain(tr)}`);
      sfx = 'hit';
      if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`);
      else { const bh = fxSum(data, h, 'burnhit'); if (bh > 0) addStatus(state, data, 'e', ti, { status: 'burn', chance: bh, turns: 2, power: 3 }, msgs, a.idx); } // Eiferer (0.22.0)
    }
    regen(h, msgs, data);
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
        if (!t || t.hp <= 0 || (t.hp >= t.maxHp && !canCleanse(ab, stT))) return { error: 'bad-target' };
      }
      h.mp -= ab.cost;
      const parts = [];
      for (const ti of targets) {
        const t = state.heroes[ti], stT = c.status['h' + ti];
        const gain = Math.min(ab.heal + fxSum(data, h, 'heal'), t.maxHp - t.hp);
        t.hp += gain;
        parts.push(`${t.name}${gain > 0 ? ` +${gain}` : ''}`);
        for (const cl of cleanseList(ab)) if (stT && stT[cl]) { delete stT[cl]; msgs.push(`${t.name}: ${data.statuses[cl].name} wird genommen.`); }
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
        const cb = comboFor(state, data, a.idx, ti, ab);
        let d = calcDamage(state, effAtk(state, 'h', a.idx, heroAtk(data, h, state)), pierceDef(data, h, effDef(state, 'e', ti, enemyOf(data, e).def)), { backMelee: backPen(data, h), mult: Math.floor((ab.mult * (100 + fxSum(data, h, 'abil')) * (cb ? cb.mult : 100)) / 10000), crit: firstCrit(state, data, h, a.idx) || rollCrit(state, data, h), sure: !!ab.sure, elem: el, elemName: ab.element && data.elements[ab.element].name, trace: tr });
        d = cover(state, data, ti, d, tr);
        if (d === 0) { msgs.push(`${h.name} setzt ${ab.name} ein, verfehlt aber ${e.name}${list.length === 1 ? ` (−${ab.cost} ${rn})` : ''}.`); continue; }
        hit = true;
        if (cb) comboDone(state, data, cb, h, ti, msgs);
        e.hp = Math.max(0, e.hp - d);
        leech(data, h, d, msgs);
        const note = (el > 0 ? ' Anfällig!' : el < 0 ? ' Resistent.' : '') + (tr.cover ? ' (gedeckt)' : '');
        msgs.push(`${h.name} setzt ${ab.name} ein: ${d} Schaden an ${e.name}${list.length === 1 ? ` (−${ab.cost} ${rn})` : ''}.${note}${SEP}${explain(tr)}`);
        if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`);
        else addStatus(state, data, 'e', ti, ab.inflict && ab.element === 'fire' && fxSum(data, h, 'fireburn') > 0 ? { ...ab.inflict, chance: 100 } : ab.inflict, msgs, a.idx); // Feuer-Zweig: Feuer brennt immer
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
      let d = calcDamage(state, effAtk(state, 'h', a.idx, heroAtk(data, h, state)), pierceDef(data, h, effDef(state, 'e', c.enemies.indexOf(e), enemyOf(data, e).def)), { backMelee: backPen(data, h), mult: SWEEP_MULT, trace: tr });
      d = cover(state, data, c.enemies.indexOf(e), d, tr);
      if (d === 0) { msgs.push(`${h.name} verfehlt ${e.name}.`); continue; }
      hit = true; e.hp = Math.max(0, e.hp - d);
      leech(data, h, d, msgs);
      msgs.push(`${h.name} trifft ${e.name} für ${d} Schaden${tr.cover ? ' (gedeckt)' : ''}.${SEP}${explain(tr)}`);
      if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`);
    }
    sfx = hit ? 'hit' : 'miss';
    regen(h, msgs, data);
  } else if (act.type === 'defend') {
    c.defending[a.idx] = true;
    msgs.push(`${h.name} verteidigt.`);
    sfx = 'defend';
    regen(h, msgs, data);
  } else if (act.type === 'item') {
    const iid = act.item || 'potion', it = data.items[iid];
    if (it && !it.throw && act.hero !== a.idx && !data.classes[h.cls].potionGiver) return { error: 'bad-target' }; // Gegenstände nutzt nur der Held, der gerade dran ist, an sich selbst
    if (it && it.cure) { // Gegengift: nimmt einen Status von einem Helden
      const t = state.heroes[act.hero], st = statusOf(state, 'h', act.hero);
      if (!(state.inv[iid] > 0) || !t || t.hp <= 0 || !st[it.cure]) return { error: 'bad-target' };
      delete st[it.cure]; state.inv[iid]--;
      msgs.push(`${t.name} nimmt ${it.name}: ${data.statuses[it.cure].name} wird genommen.`);
      sfx = 'heal';
    } else if (it && it.throw) { // Wurfgegenstand: trifft immer, Elementfaktor wie bei Zaubern
      const ti = act.target, e = c.enemies[ti];
      if (!(state.inv[iid] > 0) || !e || e.hp <= 0) return { error: 'bad-target' };
      const el = it.throw.element ? ((enemyOf(data, e).resist || {})[it.throw.element] || 0) : 0;
      if (el !== 0) noteBestiary(state, e.kind, 'resist', it.throw.element);
      const tr = {};
      const d = calcDamage(state, it.throw.atk, 0, { sure: true, elem: el, elemName: it.throw.element && data.elements[it.throw.element].name, trace: tr });
      state.inv[iid]--; e.hp = Math.max(0, e.hp - d);
      msgs.push(`${h.name} wirft ${it.name}: ${d} Schaden an ${e.name}.${el > 0 ? ' Anfällig!' : el < 0 ? ' Resistent.' : ''}${SEP}${explain(tr)}`);
      if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`); else addStatus(state, data, 'e', ti, it.throw.inflict, msgs, a.idx);
      sfx = 'hit';
    } else {
      const r = useItemOutside(state, data, iid, act.hero);
      if (r.error) return r;
      msgs.push(r.msg);
      sfx = 'heal';
    }
  } else {
    return { error: 'not-available' };
  }
  const ch = fxSum(data, h, 'chain'); // Sprengmeister (0.22.0): Kettenreaktion, wenn ein Gegner durch diesen Helden fällt
  if (ch > 0 && c.enemies.some((e, i) => e.hp <= 0 && aliveBefore[i])) {
    const rest = c.enemies.filter((e) => e.hp > 0);
    if (rest.length) { msgs.push(`Kettenreaktion! ${ch} Schaden an allen übrigen Gegnern.`); for (const e of rest) { e.hp = Math.max(0, e.hp - ch); if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`); } }
  }
  let over = null;
  if (c.enemies.every((e) => e.hp <= 0)) {
    const gold = finishVictory(state, data, msgs);
    return { msgs, sfx, over: 'victory', gold };
  }
  checkRage(state, data, msgs);
  checkPhases(state, data, msgs);
  endOfTurn(state, data, 'h', a.idx, msgs);
  advance(state, data, msgs);
  return { msgs, sfx, over };
}

// Zielwahl der Gegner: random (75 % Vorderreihe), weakest (60 % der Held mit den wenigsten LP), backline (75 % Hinterreihe)
function pickTarget(state, en, data = null) {
  const front = [], back = [], all = [];
  state.heroes.forEach((h, i) => { if (h.hp > 0) { all.push(i); (h.row === 'front' ? front : back).push(i); } });
  const ai = en.ai || 'random';
  if (data) { const tn = all.filter((i) => fxSum(data, state.heroes[i], 'taunt') > 0); if (tn.length && rand(state) * 100 < fxSum(data, state.heroes[tn[0]], 'taunt')) return tn[0]; } // Bollwerk (0.22.0): Wächter zieht Angriffe auf sich
  if (ai === 'healer' && data && rand(state) < 0.6) { const hs = all.filter((i) => data.classes[state.heroes[i].cls].healer); if (hs.length) return hs[randInt(state, 0, hs.length - 1)]; }
  if (ai === 'weakest' && rand(state) < 0.6) return all.reduce((b, i) => (state.heroes[i].hp < state.heroes[b].hp ? i : b), all[0]);
  if (ai === 'backline' && back.length && rand(state) < 0.75) return back[randInt(state, 0, back.length - 1)];
  const pool = front.length && (rand(state) < 0.75 || !back.length) ? front : (back.length ? back : front);
  return pool[randInt(state, 0, pool.length - 1)];
}

// Gegnerzauber: enemies.<art>.cast = [{ name, kind: 'bolt' | 'heal' | 'curse', every, mult, all, inflict, heal, announce }]
// every = jeder n-te eigene Zug. announce: großer Zauber, wird einen Zug vorher angesagt (wie der schwere Schlag).
// bolt: Zauberschaden, trifft immer, halbe Rüstung, bevorzugt die Hinterreihe · drain (0.27.0): Biss mit voller Rüstung auf den Schwächsten, heilt den Gegner um leech % des Schadens · heal: heilt den am stärksten verletzten Gegner · curse: Statuswirkung auf alle Helden
function pickCast(state, e, en, msgs) {
  if (!en.cast || !en.cast.length) return null;
  e.ct = (e.ct || 0) + 1;
  let now = null;
  for (const sp of en.cast) {
    if (!now && e.ct % sp.every === 0 && !(sp.kind === 'heal' && !state.combat.enemies.some((x) => x.hp > 0 && x.hp < x.maxHp * 0.75))) now = sp;
    else if (sp.announce && (e.ct + 1) % sp.every === 0) msgs.push(`${e.name} sammelt Kraft für ${sp.name}! Verteidigen halbiert den Schaden.`);
  }
  return now;
}
function enemyCast(state, data, ei, e, en, sp, msgs, opts) {
  const c = state.combat;
  msgs.push(`${e.name} wirkt ${sp.name}!`);
  noteBestiary(state, e.kind, 'cast');
  if (sp.kind === 'heal') {
    const t = c.enemies.filter((x) => x.hp > 0).reduce((b, x) => (x.hp / x.maxHp < b.hp / b.maxHp ? x : b));
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + sp.heal);
    msgs.push(`${t.name} erholt sich um ${t.hp - before} LP.`);
    return 'heal';
  }
  const alive = state.heroes.map((h, i) => (h.hp > 0 ? i : -1)).filter((i) => i >= 0);
  const targets = sp.all || sp.kind === 'curse' ? alive : [pickTarget(state, { ai: sp.kind === 'drain' ? 'weakest' : 'backline' })]; // drain (0.27.0): Blutbiss trifft den Schwächsten
  let sfx = 'miss';
  for (const ti of targets) {
    const t = state.heroes[ti];
    if (opts.god) { msgs.push(`${sp.name} trifft ${t.name}, doch Debug-Unverwundbarkeit hält.`); sfx = 'hurt'; continue; }
    if (sp.kind === 'bolt' || sp.kind === 'drain') {
      const tr = {};
      let d = calcDamage(state, effAtk(state, 'e', ei, rageAtk(e, foeAtk(state, data, en.atk))), sp.kind === 'drain' ? effDef(state, 'h', ti, heroDef(data, t, state)) : Math.floor(heroDef(data, t, state) / 2), { sure: true, defending: !!c.defending[ti], mult: sp.mult, trace: tr });
      const cap = Math.max(1, Math.ceil(t.maxHp * (sp.all ? 0.4 : 0.5))); // ein Zauber nimmt höchstens die Hälfte der Max-LP (schützt den Magier)
      if (d > cap) { d = cap; tr.total = d; tr.cap = cap; }
      d = manaShield(data, t, d, msgs);
      t.hp = Math.max(0, t.hp - d);
      if (sp.kind === 'drain') {
        msgs.push(`${sp.name} trifft ${t.name} für ${d} Schaden${c.defending[ti] ? ' (verteidigt: halber Schaden)' : ''}.${SEP}${explain(tr)}`);
        const gain = d > 0 && e.hp > 0 ? Math.min(e.maxHp - e.hp, Math.round(d * (sp.leech || 50) / 100)) : 0;
        if (gain > 0) { e.hp += gain; msgs.push(`${e.name} trinkt und erholt sich um ${gain} LP.`); }
      } else msgs.push(`${sp.name} trifft ${t.name} für ${d} ${sp.element && data.elements[sp.element] ? data.elements[sp.element].name + 'schaden' : 'Schaden'} (Zauber: halbe Rüstung${c.defending[ti] ? ', verteidigt: halber Schaden' : ''}).${SEP}${explain(tr)}`);
      sfx = 'hurt';
      if (t.hp === 0) { msgs.push(`${t.name} sinkt bewusstlos zu Boden.`); delete c.status['h' + ti]; continue; }
    }
    addStatus(state, data, 'h', ti, sp.inflict, msgs);
  }
  return sfx;
}

export function enemyStep(state, data, opts = {}) {
  const c = state.combat;
  if (!c || c.over) return { error: 'no-combat' };
  const a = currentActor(state);
  if (!a || a.side !== 'e') return { error: 'not-enemy-turn' };
  const e = c.enemies[a.idx];
  const en = enemyOf(data, e);
  const msgs = [];
  { // Taktik (0.33.0): en.tactic = { flee: { below, chance }, call: { below, chance, kind } } – nie bei Bossen; Flucht/Ruf ersetzt den Angriff
    const tac = en.tactic, pct = (e.hp * 100) / e.maxHp;
    if (tac && e.hp > 0) {
      if (tac.call && (e.calls || 0) < (tac.call.max || 1) && pct <= tac.call.below && data.enemies[tac.call.kind] && rand(state) * 100 < tac.call.chance) {
        let slot = c.enemies.findIndex((x) => x.hp <= 0);
        if (slot < 0 && c.enemies.length < MAX_ENEMIES) slot = c.enemies.length;
        e.calls = (e.calls || 0) + 1;
        if (slot >= 0) {
          const k = data.enemies[tac.call.kind], hpP = diffPct(state, data, 'hp');
          const n = c.enemies.filter((x) => x.kind === tac.call.kind).length;
          const ne = { objId: e.objId, kind: tac.call.kind, name: n ? `${k.name} ${'BCD'[Math.min(2, n - 1)]}` : k.name, hp: Math.max(1, Math.round((k.hp * hpP) / 100)), maxHp: Math.max(1, Math.round((k.hp * hpP) / 100)), cd: 0, intent: null, called: true };
          c.enemies[slot] = ne; delete c.status['e' + slot];
          noteBestiary(state, ne.kind, 'seen');
          msgs.push(`${e.name} schreit nach Hilfe – ${ne.name} kommt dazu!`);
          if (!c.order.some((o, i) => i > c.pos && o.side === 'e' && o.idx === slot)) c.order.splice(c.pos + 1, 0, { side: 'e', idx: slot }); // Neuer kommt noch in dieser Runde dran
          advance(state, data, msgs);
          return { msgs, sfx: 'miss', over: null };
        }
      } else if (tac.flee && !data.enemies[e.kind].boss && pct <= tac.flee.below && rand(state) * 100 < tac.flee.chance) {
        e.hp = 0; e.fled = true; delete c.status['e' + a.idx];
        msgs.push(`${e.name} verliert den Mut und flieht in die Dunkelheit!`);
        noteBestiary(state, e.kind, 'fled');
        if (c.enemies.every((x) => x.hp <= 0)) { checkRage(state, data, msgs); const gold = finishVictory(state, data, msgs); return { msgs, sfx: 'miss', over: 'victory', gold }; }
        checkRage(state, data, msgs);
        advance(state, data, msgs);
        return { msgs, sfx: 'miss', over: null };
      }
    }
  }
  const hv = en.heavy, heavy = !!hv && e.intent === 'heavy';
  let ti = pickTarget(state, en, data);
  if (heavy) { // schwerer Nahkampfschlag trifft nur die Vorderreihe, solange dort jemand steht (kein Ein-Treffer-Tod für Magier hinten)
    const fr = state.heroes.map((h, i) => (h.hp > 0 && h.row === 'front' ? i : -1)).filter((i) => i >= 0);
    if (fr.length && !fr.includes(ti)) ti = fr[randInt(state, 0, fr.length - 1)];
  }
  const t = state.heroes[ti];
  let sfx = 'miss';
  const sp = heavy ? null : pickCast(state, e, en, msgs);
  if (sp) sfx = enemyCast(state, data, a.idx, e, en, sp, msgs, opts);
  else {
    const tr = {};
    let d = calcDamage(state, effAtk(state, 'e', a.idx, rageAtk(e, foeAtk(state, data, en.atk))), effDef(state, 'h', ti, heroDef(data, t, state)), { defending: !!c.defending[ti], mult: heavy ? hv.mult : 0, trace: tr });
    let dodged = false;
    if (d > 0) { // Talente: Ausweichen (Zufall nur bei Talent, damit alte Läufe gleich bleiben) und Schadensminderung
      const dg = fxSum(data, t, 'dodge');
      if (dg > 0 && rand(state) * 100 < dg) { d = 0; dodged = true; }
      else { const sk = fxSum(data, t, 'soak') + Math.min(2, partyFx(state, data, 'aura_soak')); if (sk > 0) { d = Math.max(1, d - sk); tr.soak = sk; } }
    }
    const why = `${t.row === 'front' ? 'Vorderreihe' : 'Hinterreihe'}${c.defending[ti] ? ', verteidigt: halber Schaden' : ''}`;
    if (heavy) { msgs.push(`${e.name} setzt ${hv.name} ein!`); noteBestiary(state, e.kind, 'heavy'); }
    if (d === 0) msgs.push(dodged ? `${e.name} greift ${t.name} an, doch ${t.name} weicht aus.` : `${e.name} greift ${t.name} an (${why}) und verfehlt.`);
    else if (opts.god) { msgs.push(`${e.name} trifft ${t.name}, doch Debug-Unverwundbarkeit hält.`); sfx = 'hurt'; }
    else {
      d = manaShield(data, t, d, msgs);
      t.hp = Math.max(0, t.hp - d);
      msgs.push(`${e.name} trifft ${t.name} für ${d} Schaden (${why}).${SEP}${explain(tr)}`);
      { const fb = t.hp > 0 ? fxSum(data, t, 'frostbite') : 0; if (fb > 0 && e.hp > 0) addStatus(state, data, 'e', a.idx, { status: 'slow', chance: fb, turns: 1 }, msgs, ti); } // Frostpanzer (0.22.0)
      sfx = 'hurt';
      if (t.hp === 0) { msgs.push(`${t.name} sinkt bewusstlos zu Boden.`); delete c.status['h' + ti]; }
      else { addStatus(state, data, 'h', ti, en.onHit, msgs); if (en.onHit) noteBestiary(state, e.kind, 'onHit'); }
      const th = t.hp > 0 ? fxSum(data, t, 'thorns') : 0; // Dornen (0.21.0): Schaden zurück an den Angreifer
      if (th > 0 && e.hp > 0) { const b = e.hp; e.hp = Math.max(0, e.hp - th); msgs.push(`Dornen: ${e.name} erleidet ${b - e.hp} Schaden.`); if (e.hp === 0) msgs.push(`${e.name} bricht zusammen.`); }
    }
  }
  if (c.enemies.every((x) => x.hp <= 0)) { checkRage(state, data, msgs); const gold = finishVictory(state, data, msgs); return { msgs, sfx, over: 'victory', gold }; }
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
  checkRage(state, data, msgs);
  checkPhases(state, data, msgs);
  advance(state, data, msgs);
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
  const checkHero = (hh, n) => {
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
    if (hh.tal != null) {
      if (typeof hh.tal !== 'object' || Array.isArray(hh.tal)) err.push(`${n}: Talente ungültig`);
      else {
        const ids = new Set(talentNodes(data, hh.cls).map((x) => x.id));
        for (const k of Object.keys(hh.tal)) if (!ids.has(k) || hh.tal[k] !== true) err.push(`${n}: Talent ${k} ungültig`);
        if (talentSpent(data, hh) > hh.level - 1) err.push(`${n}: mehr Talente als Punkte`);
      }
    }
    if (hh.equip != null) {
      if (typeof hh.equip !== 'object') err.push(`${n}: Ausrüstung ungültig`);
      else for (const s of SLOTS) { const id = hh.equip[s]; if (id != null && !(itemDef(state, data, id) && itemDef(state, data, id).kind === 'equip' && itemDef(state, data, id).slot === s)) err.push(`${n}: Ausrüstung ${s} ungültig`); }
    }
  };
  if (!Array.isArray(state.heroes) || state.heroes.length !== 4) err.push('Gruppe ungültig');
  else state.heroes.forEach((hh, i) => checkHero(hh, `Held ${i + 1}`));
  if (state.reserve != null) {
    if (!Array.isArray(state.reserve) || state.reserve.length > RESERVE_MAX) err.push('Reserve ungültig');
    else state.reserve.forEach((hh, i) => checkHero(hh, `Reserve ${i + 1}`));
  }
  if (!state.inv || typeof state.inv !== 'object') err.push('Inventar ungültig');
  else for (const [k, v] of Object.entries(state.inv)) if (!itemDef(state, data, k) || !Number.isInteger(v) || v < 0) err.push(`Inventar: ${k} ungültig`);
  if (state.difficulty != null && !(data.difficulty && data.difficulty[state.difficulty])) err.push('Schwierigkeitsgrad ungültig');
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
  if (state.journal != null) {
    if (!Array.isArray(state.journal) || state.journal.some((e) => !e || typeof e.id !== 'string' || typeof e.text !== 'string' || typeof e.title !== 'string' || !data.levels[e.lv])) err.push('Notizbuch ungültig');
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
// So bekommen alte Spielstände Neuerungen (z. B. eine neue Treppe) ohne neue Speicherversion. Truhen, Türen und Gegner behalten ihren Zustand (nur `title` und `style` werden aus game.json nachgezogen).
const STATIC_TYPES = new Set(['stairs', 'sign', 'merchant', 'exit', 'runestone', 'decor', 'rail']);
export function syncStatic(state, data) {
  unlockWorld(state);
  for (const h of state.heroes || []) if (h && data.classes[h.cls] && h.role !== data.classes[h.cls].name) h.role = data.classes[h.cls].name; // umbenannte Berufe (Priester → Kleriker)
  const areas = [{ id: state.levelId, objs: state.objs }, ...Object.entries(state.areas || {}).map(([id, a]) => ({ id, objs: a.objs }))];
  let n = 0;
  for (const a of areas) {
    const lvl = levelFor(data, a.id, state.flags);
    if (!lvl || !Array.isArray(a.objs)) continue;
    const ids = new Set(lvl.objects.map((o) => o.id));
    for (let k = a.objs.length - 1; k >= 0; k--) if (a.objs[k] && STATIC_TYPES.has(a.objs[k].type) && !ids.has(a.objs[k].id)) { a.objs.splice(k, 1); n++; } // veraltete feste Objekte (z. B. ersetzter Ausgang)
    for (const o of lvl.objects) {
      const i = a.objs.findIndex((x) => x && x.id === o.id);
      if (i < 0) { a.objs.push(freshObj(data, o)); n++; }
      else if ((o.type === 'barrel' || o.type === 'npc') && a.objs[i].type === 'decor') { a.objs[i] = freshObj(data, o); n++; } // 0.46.3: Taverne – Gäste und Kamin sind ansprechbar // 0.44.0: altes Dekorationsfass wird zerschlagbar
      else if (STATIC_TYPES.has(o.type) && a.objs[i].type === o.type && JSON.stringify(a.objs[i]) !== JSON.stringify(o)) { a.objs[i] = clone(o); n++; }
      else if (o.type === 'chest' && o.lootV && a.objs[i].type === 'chest' && !a.objs[i].open && a.objs[i].lootV !== o.lootV) { a.objs[i].loot = clone(o.loot); a.objs[i].lootV = o.lootV; n++; } // 0.21.0: neue Beute (z. B. Set-Teile) auch in ungeöffneten Truhen alter Stände
      else if (o.type === 'enemy' && o.lurk && a.objs[i].type === 'enemy' && !a.objs[i].dead && a.objs[i].lurk == null && !(state.combat && state.combat.enemies.some((e) => e.objId === o.id)) && !(lvl.scene && lvl.scene.enemy === o.id && state.flags[lvl.scene.id])) { a.objs[i].lurk = true; a.objs[i].x = o.x; a.objs[i].y = o.y; n++; } // 0.47.17: alter Stand mit lebendem Schrat bekommt den Auftritt
      else if (o.type === 'enemy' && a.objs[i].type === 'enemy' && !a.objs[i].dead && (a.objs[i].x !== o.x || a.objs[i].y !== o.y) && !(a.id === state.levelId && state.player.x === o.x && state.player.y === o.y)) { a.objs[i].x = o.x; a.objs[i].y = o.y; n++; } // 0.23.12: Gegnerplatz (z. B. Hüter am Thron) auch in alten Ständen nachziehen
      else if (!STATIC_TYPES.has(o.type)) for (const k of o.type === 'chest' ? ['title', 'style', 'torch', 'msg', 'look', 'mat', 'x', 'y'] : o.type === 'npc' || o.type === 'door' || (o.type === 'buried' && !a.objs[i].dug) ? ['title', 'style', 'torch', 'msg', 'x', 'y', 'sym', 'textless', 'autoClose', 'look', 'font'] : ['title', 'style', 'torch', 'msg']) if (o[k] !== undefined && a.objs[i][k] !== o[k] && !(k === 'look' && a.objs[i].lookSet)) { a.objs[i][k] = o[k]; n++; } // 0.31.9: Truhenstufe (look) nachziehen // 0.16.14: Beschriftung/Stil von Türen u. a. nachziehen (alte Stände ohne `style` zeigten einen Zufallsstil)
    }
  }
  const cur = getLevel(data, state), pc = cur && state.player ? cellChar(cur, state.player.x, state.player.y) : '.';
  if (cur && (isWallChar(pc) || pc === '~' || blockerAt(state, state.player.x, state.player.y)) && cur.start) { state.player = { x: cur.start.x, y: cur.start.y, dir: cur.start.dir }; n++; } // 0.31.11: Gebiet wurde umgebaut, Gruppe steckt in Wand oder Wasser
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
  { // 0.31.11: Gebiet wurde seit dem Speichern umgebaut (z. B. Schatzinsel): Gruppe steht jetzt in Wand oder Wasser → zurück zum Gebietsstart, statt den Stand abzulehnen
    const st = m.state, cur = st && data.levels[st.levelId], p = st && st.player;
    const fixSeen = (area, lvl) => { if (area && lvl && Array.isArray(area.seen) && area.seen.length !== lvl.map[0].length * lvl.map.length) area.seen = new Array(lvl.map[0].length * lvl.map.length).fill(0); }; // Karte eines umgebauten Gebiets neu beginnen
    fixSeen(st, cur); if (st && st.areas && typeof st.areas === 'object') for (const [id, a] of Object.entries(st.areas)) fixSeen(a, data.levels[id]);
    if (cur && cur.start && p && Number.isInteger(p.x) && Number.isInteger(p.y) && isWallChar(cellChar(cur, p.x, p.y))) st.player = { x: cur.start.x, y: cur.start.y, dir: cur.start.dir };
  }
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
  const aiName = { weakest: 'zielt auf den schwächsten Helden', backline: 'zielt auf die Hinterreihe', healer: 'zielt bevorzugt auf Heiler' };
  for (const e of Object.values(data.enemies)) L.push(`| ${e.name} | ${e.hp} | ${e.atk} | ${e.def} | ${e.init} | ${e.xp || 0} | ${e.gold || 0} | ${[aiName[e.ai], e.guard && 'Wache: deckt Verbündete (−25 % Schaden)', e.enrage && 'Raserei, wenn ein Verbündeter fällt (+25 % Angriff)', e.heavy && `${e.heavy.name} jeden ${e.heavy.every}. Zug, angekündigt (${e.heavy.mult} %)`, e.onHit && `Treffer: ${data.statuses[e.onHit.status].name} ${e.onHit.chance} %`, e.cast && `Zaubert: ${e.cast.map((c) => `${c.name} (jeden ${c.every}. Zug${c.announce ? ', angekündigt' : ''})`).join(', ')}`, e.phases && `Boss, Phasen: ${e.phases.map((p) => `${p.name} ab ≤ ${p.below} % LP${p.set && p.set.atk ? ` (Angriff ${p.set.atk})` : ''}`).join(', ')}`].filter(Boolean).join('; ') || '–'} |`);
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
  const fxName = { lifesteal: 'Lebensraub %', thorns: 'Dornen', crit: 'Krit %', trap: 'Fallen erkennen', dodge: 'Ausweichen %', resist: 'Statusabwehr %', soak: 'Schaden −', regen: 'Ressource +', heal: 'Heilung +', abil: 'Fähigkeiten %' };
  const fxTxt = (fx) => Object.entries(fx || {}).map(([k, v]) => `${fxName[k] || k} ${v}`).join(', ') || '–';
  const fxItems = Object.values(data.items).filter((it) => it.fx);
  if (fxItems.length) {
    L.push('## Ausrüstungseffekte und Sets', '', '| Gegenstand | Platz | Werte | Effekt | Set |', '|---|---|---|---|---|');
    for (const it of fxItems) L.push(`| ${it.name} | ${data.slots[it.slot]} | ${[it.atk && `Angriff +${it.atk}`, it.def && `Vert. +${it.def}`, it.init && `Init +${it.init}`].filter(Boolean).join(', ')} | ${fxTxt(it.fx)} | ${it.set && data.sets && data.sets[it.set] ? data.sets[it.set].name : '–'} |`);
    if (data.sets) { L.push('', '| Set | Teile | Bonus (alle Teile) |', '|---|---|---|'); for (const st of Object.values(data.sets)) L.push(`| ${st.name} | ${st.items.map((i) => data.items[i].name).join(', ')} | ${fxTxt(st.bonus)} |`); }
    L.push('');
  }
  return L.join('\n');
}

// ---------- Elitegegner (0.41.0) ----------
// data.elites = { chance (Prozent je Gegner), rewardPct (EP/Gold in Prozent), list: [{ id, name, desc, hpPct, atkPct, def, init, onHit }] }.
// Auswahl deterministisch aus Objektkennung (kein state.rng): Weglaufen und Wiederkommen ändert nichts. Keine Bosse, keine Truhenmäuler.
const strHash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; };
function applyElites(state, data, en, obj) {
  const cfg = data.elites;
  if (!cfg || !cfg.list || !cfg.list.length) return;
  en.forEach((e, i) => {
    const d = data.enemies[e.kind];
    if (d.boss || d.noElite) return;
    const h = mix32(strHash(obj.id) + i * 7919 + (state.eliteSalt || 0));
    if (h % 100 >= cfg.chance) return;
    const el = cfg.list[(h >>> 8) % cfg.list.length];
    e.elite = el.id; e.name = `★ ${e.name}`;
    e.maxHp = Math.round((e.maxHp * el.hpPct) / 100); e.hp = Math.min(e.maxHp, Math.round((e.hp * el.hpPct) / 100));
  });
}
// Meisterschaft: bei data.mastery.at[i] Siegen über eine Art (keine Bosse) einmalig EP = Art-EP × data.mastery.xpMult[i]
export const masteryLevel = (state, data, kind) => { const n = (state.kills && state.kills[kind]) || 0; return (data.mastery ? data.mastery.at : []).filter((t) => n >= t).length; };
function masteryStep(state, data, kind) { // nach dem Zählen aufrufen
  const m = data.mastery, d = data.enemies[kind];
  if (!m || d.boss) return null;
  const n = state.kills[kind], i = m.at.indexOf(n);
  if (i < 0) return null;
  return { xp: Math.round((d.xp || 0) * m.xpMult[i]), msg: `Meisterschaft ${'I'.repeat(i + 1)} gegen ${d.name}: ${m.names[i]}! Bonus-EP.` };
}
// Erfolge: abgeleitet aus dem Spielstand (kein eigener Speicher)
export function achievements(state, data) {
  const areas = [state.objs, ...Object.values(state.areas || {}).map((a) => a.objs)];
  const rooms = areas.reduce((n, os) => n + os.filter((o) => o.type === 'secret' && o.needs && o.open).length, 0);
  const masters = Object.keys(data.enemies).filter((k) => masteryLevel(state, data, k) >= 1).length;
  const maps = Object.entries(data.maps || {}).filter(([id, m]) => (state.inv[m.item] || 0) > 0 || (state.flags && state.flags['karte:' + id])).length;
  const list = [
    ['rooms', 'Schatzsucher', 'Extraräume geöffnet', rooms, [1, 5, 10]],
    ['maps', 'Kartenzeichner', 'Schatzkarten gekauft', maps, [1, 5, 10]],
    ['bounties', 'Gildenheld', 'Steckbriefe erledigt', (state.board && state.board.done.length) || 0, [1, 5, 12]],
    ['elite', 'Eliteschlächter', 'Elitegegner besiegt', state.eliteKills || 0, [1, 5, 15]],
    ['masters', 'Bestiarium-Meister', 'Arten mit Meisterschaft', masters, [1, 5, 12]]
  ];
  return list.map(([id, name, what, n, steps]) => ({ id, name, what, n, steps, tier: steps.filter((t) => n >= t).length, next: steps.find((t) => n < t) || null }));
}

// ---------- Schatzkarten (0.40.0) ----------
// data.maps = { <gebiet>: { item, price } }: Die Wirtin verkauft je besuchtem Gebiet eine Karte (Quest-Gegenstand, einmalig). Ein Extraraum
// des Gebiets ist durch eine Kartenwand (type 'secret' mit needs = Kartengegenstand) verschlossen: ohne Karte gewöhnliche Mauer, mit Karte
// zeigt die Karte ein Kreuz, ◉ öffnet die Wand. Beute der Truhe darin: bessere Ausrüstung.
export const hasMap = (state, o) => !o.needs || (state.inv[o.needs] || 0) > 0;
// 0.43.0: Kartenlimit – höchstens MAP_MAX Karten je Besuch; der Besuch beginnt mit dem ersten Kauf (state.mapBuy = { t0, n }, Echtzeit in ms).
// Erst MAP_WAIT_MS nach diesem ersten Kauf zählt ein neuer Besuch (Entscheidung des Assistenten: Echtzeit, auch bei geschlossener App).
export const MAP_MAX = 3, MAP_WAIT_MS = 3600000;
export function mapQuota(state, now = Date.now()) {
  const b = state.mapBuy;
  if (!b || !(now - b.t0 < MAP_WAIT_MS) || b.t0 > now) return { left: MAP_MAX, waitMs: 0 }; // kein Besuch offen, abgelaufen oder Uhr zurückgestellt
  return { left: Math.max(0, MAP_MAX - b.n), waitMs: Math.max(0, b.t0 + MAP_WAIT_MS - now) };
}
export function mapOffers(state, data, now = Date.now()) {
  const q = mapQuota(state, now);
  const seen = new Set([state.levelId, ...Object.keys(state.areas || {})]);
  return Object.entries(data.maps || {}).filter(([id]) => seen.has(id)).map(([id, c]) => {
    const owned = (state.inv[c.item] || 0) > 0 || !!(state.flags && state.flags['karte:' + id]);
    return { id, item: c.item, name: data.items[c.item].name, area: data.levels[id].name, price: c.price, owned, ok: !owned && state.gold >= c.price && q.left > 0 };
  });
}
export function buyMap(state, data, id, now = Date.now()) {
  if (state.combat) return { error: 'in-combat' };
  const o = mapOffers(state, data, now).find((x) => x.id === id);
  if (!o) return { error: 'unknown' };
  if (o.owned) return { error: 'owned' };
  const q = mapQuota(state, now);
  if (q.left <= 0) return { error: 'limit', waitMs: q.waitMs };
  if (state.gold < o.price) return { error: 'gold', cost: o.price };
  if (!state.mapBuy || q.left === MAP_MAX) state.mapBuy = { t0: now, n: 0 };
  state.mapBuy.n++;
  state.gold -= o.price; state.flags['karte:' + id] = true; state.inv[o.item] = 1; markNew(state, o.item);
  return { msg: `${o.name} gekauft (${o.price} Gold). Auf der Gebietskarte erscheint dort ein Kreuz.`, sfx: 'chest', changed: true };
}

// ---------- Steckbriefe am Aushangbrett (0.40.0) ----------
// data.bounties = [{ id, lvl (Gebiet, das besucht sein muss), title, text, xp, gold, type: 'kill' (enemy, n) | 'trophy' (item, enemies, chance, from) | 'gear' (slot, minQ), from: [Gebiete mit Gegnern] }]
// state.board = { slots: [{ id, base }], done: [id], skip: [id], next }, state.kills = { <Gegnerart>: Anzahl }. Belohnung: Erfahrung für alle wachen Helden (+ wenig Gold).
export const BOARD_SLOTS = 3, BOARD_WAIT = 60;
const mix32 = (n) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 15), 0x45d9f3b); return (n ^ (n >>> 16)) >>> 0; }; // Würfel ohne state.rng zu verändern
const bountyOf = (data, id) => (data.bounties || []).find((b) => b.id === id);
const boardOf = (state) => state.board || (state.board = { slots: [], done: [], skip: [], next: 0 });
function livingSources(state, data, b) {
  const kinds = b.type === 'kill' ? [b.enemy] : b.enemies || [];
  let n = 0;
  for (const id of b.from || []) {
    const objs = id === state.levelId ? state.objs : state.areas && state.areas[id] ? state.areas[id].objs : data.levels[id].objects;
    for (const o of objs) if (o.type === 'enemy' && !o.dead && kinds.includes(o.kind)) n++;
  }
  return n;
}
const gearFor = (state, b) => { // unausgerüstete erzeugte Ausrüstung ab Mindestgüte (niedrigste passende zuerst)
  const Q = ['common', 'fine', 'rare', 'epic'];
  return Object.keys(state.inv).filter((u) => state.inv[u] > 0 && state.gear && state.gear[u] && state.gear[u].slot === b.slot && Q.indexOf(state.gear[u].q) >= b.minQ).sort((a, c) => Q.indexOf(state.gear[a].q) - Q.indexOf(state.gear[c].q))[0] || null;
};
export function boardRefill(state, data) {
  const bd = boardOf(state), all = data.bounties || [];
  const seen = new Set([state.levelId, ...Object.keys(state.areas || {})]);
  while (bd.slots.length < BOARD_SLOTS && state.steps >= bd.next) {
    const live = all.filter((b) => !bd.done.includes(b.id) && !bd.slots.some((s) => s.id === b.id) && seen.has(b.lvl) && (b.type === 'gear' || livingSources(state, data, b) >= (b.type === 'kill' ? b.n : 1)));
    const fresh = live.filter((b) => !bd.skip.includes(b.id));
    const pool = fresh.length ? fresh : live;
    if (!pool.length) break;
    if (!fresh.length) bd.skip = [];
    const b = pool[mix32(state.steps * 31 + bd.done.length * 7919 + bd.slots.length * 101 + (bd.skip.length + 1) * 13) % pool.length];
    bd.slots.push({ id: b.id, base: b.type === 'kill' ? (state.kills && state.kills[b.enemy]) || 0 : 0 });
  }
}
export function boardView(state, data) {
  boardRefill(state, data);
  const bd = boardOf(state);
  return bd.slots.map((s) => {
    const b = bountyOf(data, s.id);
    let have = 0, need = 1;
    if (b.type === 'kill') { need = b.n; have = Math.min(need, ((state.kills && state.kills[b.enemy]) || 0) - s.base); }
    else if (b.type === 'trophy') have = (state.inv[b.item] || 0) > 0 ? 1 : 0;
    else have = gearFor(state, b) ? 1 : 0;
    return { id: b.id, title: b.title, text: b.text, xp: b.xp, gold: b.gold || 0, type: b.type, have, need, ready: have >= need, item: b.item ? data.items[b.item].name : null };
  });
}
export function boardTurnIn(state, data, id) {
  if (state.combat) return { error: 'in-combat' };
  const bd = boardOf(state), i = bd.slots.findIndex((s) => s.id === id), v = boardView(state, data).find((x) => x.id === id);
  if (i < 0 || !v) return { error: 'unknown' };
  if (!v.ready) return { error: 'not-ready' };
  const b = bountyOf(data, id);
  if (b.type === 'trophy') delete state.inv[b.item];
  else if (b.type === 'gear') { const u = gearFor(state, b); delete state.inv[u]; if (state.gear) delete state.gear[u]; }
  bd.slots.splice(i, 1); bd.done.push(id); bd.next = state.steps + BOARD_WAIT;
  const msgs = [`Auftrag erledigt: ${b.title}.`];
  if (b.gold) { state.gold += b.gold; msgs.push(`Lohn: ${b.gold} Gold.`); }
  msgs.push(`Erfahrung: +${b.xp} EP für jeden Helden, der noch steht.`);
  grantXp(state, data, b.xp, msgs);
  return { msg: msgs.join(' '), sfx: 'chest', changed: true };
}
export function boardDismiss(state, data, id) {
  const bd = boardOf(state), i = bd.slots.findIndex((s) => s.id === id);
  if (i < 0) return { error: 'unknown' };
  bd.slots.splice(i, 1); bd.skip.push(id); bd.next = state.steps + BOARD_WAIT;
  return { msg: 'Der Zettel ist abgerissen. Später hängt vielleicht ein anderer da.', sfx: 'ui', changed: true };
}
function rollTrophies(state, data, enemies, msgs) { // Trophäen fallen nur, solange ein Steckbrief sie verlangt; bei den letzten Gegnern der Art sicher
  const bd = state.board;
  if (!bd) return;
  enemies.forEach((e, idx) => {
    for (const s of bd.slots) {
      const b = bountyOf(data, s.id);
      if (!b || b.type !== 'trophy' || !b.enemies.includes(e.kind) || (state.inv[b.item] || 0) > 0) continue;
      const chance = livingSources(state, data, b) <= 1 ? 100 : b.chance || 50;
      if (mix32(state.rng + idx * 977 + ((state.kills && state.kills[e.kind]) || 0) * 131) % 100 >= chance) continue;
      state.inv[b.item] = 1; markNew(state, b.item);
      msgs.push(`Trophäe von ${e.name}: ${data.items[b.item].name} (für den Steckbrief „${b.title}“).`);
    }
  });
}

// ---------- Level-Analyse (Softlock-Prüfung) ----------
export function analyzeLevel(data, levelId) {
  const lvl = data.levels[levelId];
  const doors = lvl.objects.filter((o) => o.type === 'door');
  const chests = lvl.objects.filter((o) => o.type === 'chest');
  const hasGoto = (o) => o.type === 'npc' && o.dialog && Object.values(data.dialogs?.[o.dialog]?.nodes || {}).some((n) => (n.choices || []).some((c) => c.goto));
  const exits = lvl.objects.filter((o) => o.type === 'exit' || o.type === 'stairs' || hasGoto(o)); // Ausgang = Runenstein, Treppe oder Fährmann (Dialog mit goto)
  const have = new Set();
  const opened = new Set();
  const gatesOpen = new Set(); // Gitter, deren Hebel erreichbar ist
  for (const o of lvl.objects) if (o.type === 'gate' && o.web) gatesOpen.add(o.id); // Netze lassen sich durchtrennen
  const boltOpen = new Set(); // Riegeltüren, deren Riegelseite erreicht wurde
  const bfs = () => {
    const seen = new Set([`${lvl.start.x},${lvl.start.y}`]);
    const q = [[lvl.start.x, lvl.start.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy, k = `${nx},${ny}`;
        if (seen.has(k) || cellChar(lvl, nx, ny) !== '.') continue;
        const door = doors.find((o) => o.x === nx && o.y === ny);
        if (door && door.locked && door.bolt != null) { if (!boltOpen.has(door.id) && !(x - nx === DIRS[door.bolt].dx && y - ny === DIRS[door.bolt].dy)) continue; }
        else if (door && door.locked && !have.has(door.key)) continue;
        const tp = lvl.objects.find((o) => o.type === 'teleport' && o.x === nx && o.y === ny && !gatesOpen.has(o.id));
        if (tp) { const tk = `${tp.to.x},${tp.to.y}`; seen.add(k); if (!seen.has(tk)) { seen.add(tk); q.push([tp.to.x, tp.to.y]); } continue; }
        if (chests.some((o) => o.x === nx && o.y === ny)) continue;
        if (lvl.objects.some((o) => (o.type === 'lever' || ((o.type === 'gate' || (o.type === 'secret' && !o.needs)) && !gatesOpen.has(o.id))) && o.x === nx && o.y === ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const reach = bfs();
    for (const lv of lvl.objects.filter((o) => o.type === 'lever')) {
      if (!gatesOpen.has(lv.gate) && DIRS.some((d) => reach.has(`${lv.x + d.dx},${lv.y + d.dy}`))) { gatesOpen.add(lv.gate); changed = true; }
    }
    for (const d of doors.filter((o) => o.locked && o.bolt != null)) { if (!boltOpen.has(d.id) && reach.has(`${d.x + DIRS[d.bolt].dx},${d.y + DIRS[d.bolt].dy}`)) { boltOpen.add(d.id); changed = true; } }
    for (const pl of lvl.objects.filter((o) => o.type === 'plate')) { // Druckplatte: erreichbar = Ziel lässt sich öffnen (Steine sind schieb- und ziehbar)
      if (!gatesOpen.has(pl.gate) && reach.has(`${pl.x},${pl.y}`)) { gatesOpen.add(pl.gate); changed = true; }
    }
    for (const c of chests) {
      if (opened.has(c.id)) continue;
      if (DIRS.some((d) => reach.has(`${c.x + d.dx},${c.y + d.dy}`))) {
        opened.add(c.id); changed = true;
        for (const e of c.loot || []) if (e.item && data.items[e.item].kind === 'quest') have.add(e.item);
      }
    }
    for (const np of lvl.objects.filter((o) => o.type === 'npc' && o.dialog)) { // 0.37.0: Schlüssel aus Gesprächen (z. B. Hüterstatuen der Zisterne)
      if (opened.has(np.id) || !DIRS.some((d) => reach.has(`${np.x + d.dx},${np.y + d.dy}`))) continue;
      opened.add(np.id); changed = true;
      for (const nd of Object.values(data.dialogs?.[np.dialog]?.nodes || {})) for (const c of nd.choices || []) for (const e of c.give || []) if (e.item && data.items[e.item]?.kind === 'quest') have.add(e.item);
    }
  }
  const reach = bfs();
  const unreachableExits = exits.filter((o) => !reach.has(`${o.x},${o.y}`)).map((o) => o.id);
  const unreachableChests = chests.filter((c) => !opened.has(c.id)).map((c) => c.id);
  const lockedNoKey = doors.filter((d) => d.locked && d.bolt == null && !have.has(d.key)).map((d) => d.id);
  return {
    ok: exits.length > 0 && !unreachableExits.length && !unreachableChests.length && !lockedNoKey.length,
    reachable: reach.size, unreachableExits, unreachableChests, lockedNoKey, keys: [...have]
  };
}

// 0.26.2: Tür 2 Felder voraus (freie Sicht, Feld davor frei) – Antippen öffnet sie schon dort. Riegeltüren brauchen die Nähe (Seitenprüfung).
export function doorAhead2(state, x, y) {
  const p = state.player, d = DIRS[p.dir], f = { x: p.x + d.dx, y: p.y + d.dy };
  const o = state.objs.find((q) => q.type === 'door' && q.x === x && q.y === y);
  if (!o || o.open || o.bolt != null) return null;
  if (x !== f.x + d.dx || y !== f.y + d.dy) return null;
  if (blockerAt(state, f.x, f.y)) return null;
  return o;
}
