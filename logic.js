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
      h.level = to;
      refreshHeroStats(data, h); // Beruf + Rasse + Stufe + Talentboni
      ups.push({ hero: h.name, level: to });
      msgs.push(`${h.name} steigt auf Stufe ${to} auf!${talentPoints(data, h) > 0 && data.talents ? ' Neuer Talentpunkt!' : ''}`);
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
  state.player = { x: to.x, y: to.y, dir: arrivalDir(target, to) };
  markSeen(state, data);
  return { ok: true, msg: st.msg || `Du erreichst: ${target.name}.`, levelName: target.name };
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
export function blockerAt(state, x, y) {
  for (const o of state.objs) {
    if (o.x !== x || o.y !== y) continue;
    if (o.type === 'door' && !o.open) return o;
    if (o.type === 'chest' && !o.open) return o; // geöffnete Truhen sind begehbar
    if ((o.type === 'gate' || o.type === 'secret') && !o.open) return o; // secret = Geheimwand: sieht aus wie Mauer mit feinem Riss
    if (o.type === 'lever' || o.type === 'boulder') return o; // boulder = beweglicher Stein (0.19.0)
    if (o.type === 'npc' && !o.gone) return o; // 0.25.0: Begegnungsperson
    if (o.type === 'merchant' || o.type === 'runestone' || (o.type === 'sign' && o.face == null)) return o; // Tafel mit face hängt an der Wand und versperrt nichts (0.16.8)
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
    if (o.type !== 'enemy' || o.dead) continue;
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
  if (b.type === 'gate') return 'Ein Fallgitter versperrt den Weg.';
  if (b.type === 'secret') return 'Eine Wand. Durch die Fugen läuft ein feiner Riss.';
  if (b.type === 'lever') return b.torch ? 'Eine Wandfackel. Ihre Halterung sitzt locker.' : b.wall ? 'Ein Stein in der Wand sitzt locker.' : 'Ein Wandhebel steht im Weg.';
  return 'Ein Gegner steht im Weg.';
}

// rel: 'f' vor, 'b' zurück, 'l' seitwärts links, 'r' seitwärts rechts
export function tryMove(state, data, rel) {
  const lvl = getLevel(data, state);
  const p = state.player;
  const d = rel === 'f' ? p.dir : rel === 'b' ? (p.dir + 2) % 4 : rel === 'l' ? (p.dir + 3) % 4 : (p.dir + 1) % 4;
  const nx = p.x + DIRS[d].dx, ny = p.y + DIRS[d].dy;
  if (isWallChar(cellChar(lvl, nx, ny))) return { moved: false, wall: true };
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
    if (b.type === 'enemy' && rel === 'f') return { moved: false, encounter: b };
    return { moved: false, msg: blockedText(b), blocker: b };
  }
  const tr0 = trapAt(state, nx, ny);
  if (tr0 && tr0.spotted && state.trapAsk !== tr0.id) { state.trapAsk = tr0.id; return { moved: false, msg: `Vor dir liegt eine Falle (${data.traps.kinds[tr0.kind].name}). ◉ entschärfen – oder noch einmal gehen, um hineinzutreten.`, trapWarn: true }; }
  state.trapAsk = null;
  p.x = nx; p.y = ny;
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
  const pm = [...pushNotes, ...updatePlates(state, data)];
  if (pushNotes.length || pm.length) res.events.push({ type: 'mech', msgs: pm, push: true });
  const ex = state.objs.find((o) => o.type === 'exit' && o.x === nx && o.y === ny);
  if (ex && !state.flags[ex.id]) {
    state.flags[ex.id] = true;
    res.events.push({ type: 'exit', id: ex.id });
  } else if (ex) res.events.push({ type: 'exitAgain', id: ex.id }); // 0.16.4: erneutes Betreten zeigt einen kurzen Hinweis
  const stairs = state.objs.find((o) => o.type === 'stairs' && o.x === nx && o.y === ny);
  if (stairs) { res.events.push({ type: 'stairs', id: stairs.id }); return res; }
  res.encounter = enemyInFront(state);
  if (!res.encounter) { const sp = spottedEnemy(state, data); if (sp) { res.encounter = sp.enemy; res.ambush = sp.ambush; } }
  if (!res.encounter) { const notes = [...scanTraps(state, data), ...scanSecrets(state, data)]; if (notes.length) res.notes = notes; }
  return res;
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
export const trapSkill = (state, data) => Math.max(0, ...state.heroes.map((h) => (h.hp > 0 ? talentSum(data, h, 'trap') : 0)));
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
  const notes = [...scanTraps(state, data), ...scanSecrets(state, data)];
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
export function scanSecrets(state, data) {
  const skill = partySkill(state, data, 'secret');
  if (skill <= 0) return [];
  const lvl = getLevel(data, state), p = state.player, d = DIRS[p.dir];
  for (let k = 1; k <= 2; k++) {
    const x = p.x + d.dx * k, y = p.y + d.dy * k;
    const sc = state.objs.find((o) => ((o.type === 'secret' && !o.open) || (o.type === 'illusion' && !o.found)) && o.x === x && o.y === y);
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
export function interact(state, data, target = null) { // target (0.26.2): Objekt, das aus 2 Feldern Abstand benutzt wird (nur Türen)
  const f = frontCell(state);
  const o = target || blockerAt(state, f.x, f.y);
  if (!o) {
    const il = illusionAt(state, f.x, f.y);
    if (il) { const sk = partySkill(state, data, 'secret'); il.sensed = il.sensed || sk > 0; return { msg: il.hint || (sk > 0 ? `${bestAt(state, data, 'secret').name}: „Das ist keine Mauer. Das Licht bricht sich falsch darin.“` : 'Die Steine wirken seltsam unscharf, als läge ein Schleier darüber.'), sfx: 'ui' }; }
    const tr = trapAt(state, f.x, f.y);
    if (tr && tr.spotted) return disarmTrap(state, data, tr);
    if (tr) { tr.spotted = true; tr.checked = true; return { msg: `Du untersuchst den Boden: eine Falle (${data.traps.kinds[tr.kind].name})! Noch einmal ◉ entschärft sie.`, sfx: 'ui' }; }
    const nc = state.objs.find((q) => q.type === 'niche' && q.face === state.player.dir && q.x === state.player.x && q.y === state.player.y); // 0.23.0: Wandnische vor der Nase
    if (nc) { if (nc.taken || !(nc.loot || []).length) return { msg: nc.empty || 'Die Nische ist leer. Nur Staub und Spinnweben.', sfx: 'ui' }; nc.taken = true; return { msg: `${nc.text ? nc.text + ' ' : ''}In der Nische liegt: ${addLoot(state, data, nc.loot)}.`, sfx: 'chest', changed: true, long: true }; }
    const ws = wallSignAhead(state, data);
    if (ws) return { msg: ws.text, sfx: 'ui', long: true };
    const hs = state.objs.find((q) => q.type === 'sign' && q.face != null && q.x === state.player.x && q.y === state.player.y); // 0.22.1: Tafel am eigenen Feld (seitlich) ist auch lesbar
    if (hs && !blockerAt(state, f.x, f.y)) return { msg: hs.text, sfx: 'ui', long: true };
    const p = state.player, f2 = { x: f.x + DIRS[p.dir].dx, y: f.y + DIRS[p.dir].dy };
    const b2 = blockerAt(state, f2.x, f2.y);
    if (b2 && b2.type === 'sign' && cellChar(getLevel(data, state), f.x, f.y) === '.') return { msg: b2.text, sfx: 'ui', long: true }; // Tafeln lassen sich aus bis zu 2 Feldern Abstand lesen
    if (b2 && cellChar(getLevel(data, state), f.x, f.y) === '.') return { msg: 'Geh näher heran.' };
    return { msg: 'Hier gibt es nichts zu tun.' };
  }
  if (o.type === 'enemy') return { encounter: o };
  if (o.type === 'npc') return { talk: o.id, sfx: 'ui' };
  if (o.type === 'sign') return { msg: o.text, sfx: 'ui', long: true };
  if (o.type === 'runestone') return { msg: o.text, sfx: 'ui', long: true }; // 0.16.5: Inschrift übersetzt (später Reisenetz)
  if (o.type === 'merchant') {
    const r = { shop: o.shop, merchant: o.id };
    if (o.talk && !state.flags[o.talk.flag]) { state.flags[o.talk.flag] = true; r.msg = o.talk.text; r.changed = true; }
    return r;
  }
  if (o.type === 'door') {
    if (o.locked && o.bolt != null) { // 0.23.0: Riegeltür – nur von der Riegelseite zu öffnen (Abkürzung zurück)
      const p = state.player, side = p.x - o.x === DIRS[o.bolt].dx && p.y - o.y === DIRS[o.bolt].dy;
      if (!side) return { msg: 'Die Tür ist von der anderen Seite verriegelt. Kein Schloss, kein Griff – nur Holz.', sfx: 'bump' };
      o.locked = false; o.open = true;
      return { msg: 'Ihr schiebt den schweren Riegel zurück. Die Tür bleibt nun offen – ein kurzer Weg zurück.', sfx: 'unlock', changed: true };
    }
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
  if (o.type === 'gate') return { msg: o.hint || 'Das Gitter sitzt fest. Es muss einen Hebel geben.', sfx: 'bump' };
  if (o.type === 'lever') { // wall: true = versteckter Schalter (lockerer Stein in der Mauer); Ziel ist ein Gitter oder eine Geheimwand
    const gate = state.objs.find((x) => x.id === o.gate);
    if (o.used) return { msg: o.torch ? 'Die Fackel ist schon gedreht.' : o.wall ? 'Der Stein ist schon eingedrückt.' : 'Der Hebel ist schon umgelegt.', sfx: 'ui' };
    o.used = true;
    if (gate) gate.open = true;
    return { msg: o.msg || (o.torch ? 'Die Fackel lässt sich drehen. In der Nähe schabt Stein über Stein.' : o.wall ? 'Der Stein gibt nach. In der Nähe schabt Stein über Stein.' : 'Der Hebel rastet ein. Irgendwo rasselt eine Kette.'), sfx: 'door', changed: true };
  }
  if (o.type === 'chest') {
    if (o.open) return { msg: 'Die Truhe ist leer.' };
    if (chestGuarded(state, data, o)) return { msg: 'Die Truhe ist bewacht. Erst die Gegner in diesem Raum besiegen.', sfx: 'bump', guarded: true };
    const cfg = chestCfg(state, data, o), pre = [];
    if (cfg.mimic) return wakeMimic(state, data, o, cfg);
    if (cfg.trap && !o.trapDone) { const r = chestTrap(state, data, o, cfg); if (r.stop) return r; pre.push(r.msg); }
    if ((cfg.lock || cfg.key) && !o.unlocked) { const r = pickChest(state, data, o, cfg); if (!r.ok) return pre.length ? { ...r, msg: pre.join(' ') + ' ' + r.msg, long: true, changed: true } : r; pre.push(r.msg); }
    o.open = true;
    const txt = addLoot(state, data, o.loot);
    return { msg: `${pre.length ? pre.join(' ') + ' ' : ''}Truhe geöffnet: ${txt}.`, sfx: 'chest', changed: true, long: pre.length > 0 };
  }
  if (o.type === 'secret') return secretHint(state, data, o);
  return { msg: 'Hier gibt es nichts zu tun.' };
}

// ---------- Begegnungsdialoge (0.25.0) ----------
// data.dialogs.<id> = { name, start, again, nodes: { <id>: { text, choices: [ { t, to, if, cost, take, give, set, done, leave, attack, msg } ] } } }
// to: nächster Knoten (fehlt = Gespräch endet) · if: { flag, noflag, item } (sonst Wahl nicht sichtbar) · cost: { gold } / take: { item, n } (Wahl gesperrt, wenn nicht vorhanden)
// give: Beute wie bei Truhen · set: Marken (state.flags) · done: Gespräch gilt als geführt (dann `again`) · leave: Person verschwindet · attack: Person wird zum Gegner dieser Art
function dlgOf(data, npc) { return npc && data.dialogs && data.dialogs[npc.dialog]; }
export function dialogStartNode(state, data, npc) {
  const dl = dlgOf(data, npc);
  if (!dl) return null;
  return state.flags['d:' + npc.id] && dl.again ? dl.again : dl.start;
}
export function dialogView(state, data, npc, nodeId) {
  const dl = dlgOf(data, npc), nd = dl && dl.nodes[nodeId];
  if (!nd) return null;
  const choices = [];
  nd.choices.forEach((c, i) => {
    const f = c.if || {};
    if ((f.flag && !state.flags[f.flag]) || (f.noflag && state.flags[f.noflag]) || (f.item && !((state.inv[f.item] || 0) > 0))) return;
    let ok = true, suffix = '';
    if (c.cost && c.cost.gold) { suffix += ` (${c.cost.gold} Gold)`; if (state.gold < c.cost.gold) ok = false; }
    if (c.take) { const it = data.items[c.take.item]; suffix += ` (${it ? it.name : c.take.item})`; if (!((state.inv[c.take.item] || 0) >= (c.take.n || 1))) ok = false; }
    choices.push({ i, t: c.t + suffix, ok });
  });
  return { name: npc.name || dl.name, text: nd.text, choices };
}
export function dialogChoose(state, data, npc, nodeId, idx) {
  const dl = dlgOf(data, npc), nd = dl && dl.nodes[nodeId], c = nd && nd.choices[idx];
  if (!c) return { error: 'bad-choice' };
  const view = dialogView(state, data, npc, nodeId), ch = view && view.choices.find((x) => x.i === idx);
  if (!ch || !ch.ok) return { error: 'not-possible' };
  const msgs = [];
  if (c.cost && c.cost.gold) state.gold -= c.cost.gold;
  if (c.take) state.inv[c.take.item] = (state.inv[c.take.item] || 0) - (c.take.n || 1);
  if (c.give) msgs.push(`Erhalten: ${addLoot(state, data, c.give)}.`);
  for (const f of c.set || []) state.flags[f] = true;
  if (c.done) state.flags['d:' + npc.id] = true;
  if (c.msg) msgs.unshift(c.msg);
  if (c.leave) npc.gone = true;
  if (c.attack) {
    const en = data.enemies[c.attack];
    Object.assign(npc, { type: 'enemy', kind: c.attack, hp: en.hp, dead: false });
    return { end: true, encounter: npc, msg: msgs.join(' '), changed: true };
  }
  return { end: !c.to, next: c.to || null, msg: msgs.join(' '), changed: true, sfx: c.give ? 'chest' : 'ui' };
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
export const talentNodes = (data, cls) => { const out = [], cost = (data.talents && data.talents.cost) || [1, 1, 2, 2]; talentBranches(data, cls).forEach((b, bi) => b.nodes.forEach((n, ni) => out.push({ ...n, branch: b.id, bi, ni, cost: cost[ni] || 1 }))); return out; };
export const learnedTalents = (data, h) => (h.tal ? talentNodes(data, h.cls).filter((n) => h.tal[n.id]) : []);
export const talentSpent = (data, h) => learnedTalents(data, h).reduce((a, n) => a + n.cost, 0);
export const talentPoints = (data, h) => Math.max(0, h.level - 1 - talentSpent(data, h));
export const talentSum = (data, h, key) => { if (!h || !h.tal) return 0; let v = 0; for (const n of learnedTalents(data, h)) if (n.fx && n.fx[key]) v += n.fx[key]; return v; };
export function canLearnTalent(data, h, nodeId) {
  const n = talentNodes(data, h.cls).find((x) => x.id === nodeId);
  if (!n) return { ok: false, why: 'unbekannt' };
  if (h.tal && h.tal[nodeId]) return { ok: false, why: 'gelernt' };
  if (n.ni > 0 && !(h.tal && h.tal[talentBranches(data, h.cls)[n.bi].nodes[n.ni - 1].id])) return { ok: false, why: 'vorher', node: n };
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
export const SLOTS = ['weapon', 'armor'];
// Gegenstandsdefinition: erzeugte Ausrüstung (state.gear) hat Vorrang vor den festen Gegenständen (data.items)
export const itemDef = (state, data, id) => (state && state.gear && state.gear[id]) || data.items[id];
export function gearBonus(data, h, state) {
  const b = { atk: 0, def: 0, init: 0 };
  for (const s of SLOTS) { const it = h.equip && h.equip[s] && itemDef(state, data, h.equip[s]); if (it && it.kind === 'equip') { b.atk += it.atk || 0; b.def += it.def || 0; b.init += it.init || 0; } }
  return b;
}
export const heroAtk = (data, h, state) => h.atk + gearBonus(data, h, state).atk + talentSum(data, h, 'atk') + Math.min(3, partyFx(state, data, 'aura_atk')); // aura_atk (0.22.0): Kampfruf der Anführer
export const heroDef = (data, h, state) => h.def + gearBonus(data, h, state).def + talentSum(data, h, 'def');
export const heroInit = (data, h, state) => h.init + gearBonus(data, h, state).init + talentSum(data, h, 'init');
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
  markNew(state, uid);
  return uid;
}
export const ownsItem = (state, id) => (state.inv[id] || 0) > 0 || state.heroes.some((h) => h.equip && SLOTS.some((s) => h.equip[s] === id));
export const qualityOf = (state, data, id) => { const it = itemDef(state, data, id); return it && it.q ? (it.q === 'unique' ? { id: 'unique', name: 'Einzigartig', color: '#ffb347' } : it.q === 'set' ? { id: 'set', name: 'Set', color: '#6fdc8c' } : data.quality.find((q) => q.id === it.q)) : null; };
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
export const buyPrice = (state, data, id) => { const w = itemWorth(state, data, id); return w == null ? null : Math.max(1, Math.ceil((w * (100 - haggle(state, data))) / 100)); };
export function buyItem(state, data, shopId, itemId) {
  if (state.combat) return { error: 'in-combat' };
  if (!shopStock(data, shopId).some((e) => e.item === itemId)) return { error: 'not-in-stock' };
  const p = buyPrice(state, data, itemId), it = data.items[itemId];
  if (p == null) return { error: 'not-for-sale' };
  if (state.gold < p) return { error: 'no-gold', price: p };
  state.gold -= p;
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
  const foes = state.objs.filter((o) => o.type === 'enemy' && !o.dead && o.x >= 0 && o.y >= 0 && o.x < w && o.y < h);
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

export function startCombat(state, data, enemyObj, opts = {}) {
  const en = group(data, enemyObj), hp = diffPct(state, data, 'hp');
  if (hp !== 100) for (const e of en) { e.hp = Math.max(1, Math.round((e.hp * hp) / 100)); e.maxHp = Math.max(1, Math.round((e.maxHp * hp) / 100)); }
  state.combat = {
    enemies: en,
    order: [], pos: 0, round: 1, defending: {}, status: {}, over: null, ambush: !!opts.ambush, startMsgs: [], struck: {}
  };
  const c0 = state.combat;
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
function addStatus(state, data, side, idx, inf, msgs, src = null) {
  if (!inf) return;
  if (inf.chance < 100 && rand(state) * 100 >= inf.chance) return;
  if (side === 'h') { const rs = fxSum(data, state.heroes[idx], 'resist'); if (rs > 0 && rand(state) * 100 < rs) { msgs.push(`${state.heroes[idx].name} wehrt ${data.statuses[inf.status].name} ab.`); return; } }
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
  const dg = diffPct(state, data, 'gold'), dx = diffPct(state, data, 'xp');
  if (dg !== 100) gold = Math.floor((gold * dg) / 100);
  if (dx !== 100) xp = Math.floor((xp * dx) / 100);
  const gp = Math.min(60, state.heroes.reduce((a, h) => a + (h.hp > 0 ? fxSum(data, h, 'gold') : 0), 0));
  if (gp > 0 && gold > 0) gold += Math.floor((gold * gp) / 100);
  state.gold += gold;
  msgs.push(`Sieg! Beute: ${gold} Gold${gp > 0 ? ` (Talente +${gp} %)` : ''}.`);
  if (xp > 0) { msgs.push(`Erfahrung: +${xp} EP für jeden Helden, der noch steht.`); grantXp(state, data, xp, msgs); }
  rollDrops(state, data, c.enemies, msgs);
  { const ph = Math.min(25, partyFx(state, data, 'postheal')); if (ph > 0) { for (const h of state.heroes) if (h.hp > 0) h.hp = Math.min(h.maxHp, h.hp + Math.ceil((h.maxHp * ph) / 100)); msgs.push(`Nachsorge: alle wachen Helden +${ph} % LP.`); } } // Heiler (0.22.0)
  { const lp = state.heroes.reduce((m, h) => Math.max(m, h.hp > 0 ? fxSum(data, h, 'loot_potion') : 0), 0); if (lp > 0 && rand(state) * 100 < lp) { state.inv.potion = (state.inv.potion || 0) + 1; markNew(state, 'potion'); msgs.push('Glückspilz: Ihr findet einen Heiltrank bei den Gegnern.'); } } // Gauner
  for (const h of state.heroes) if (h.hp <= 0) { h.hp = 1; msgs.push(`${h.name} kommt mit 1 LP wieder zu sich.`); } // vorläufig, bis die Rast kommt (Schritt 5)
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
  advance(state, data);
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
// bolt: Zauberschaden, trifft immer, halbe Rüstung, bevorzugt die Hinterreihe · heal: heilt den am stärksten verletzten Gegner · curse: Statuswirkung auf alle Helden
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
  const targets = sp.all || sp.kind === 'curse' ? alive : [pickTarget(state, { ai: 'backline' })];
  let sfx = 'miss';
  for (const ti of targets) {
    const t = state.heroes[ti];
    if (opts.god) { msgs.push(`${sp.name} trifft ${t.name}, doch Debug-Unverwundbarkeit hält.`); sfx = 'hurt'; continue; }
    if (sp.kind === 'bolt') {
      const tr = {};
      let d = calcDamage(state, effAtk(state, 'e', ei, rageAtk(e, foeAtk(state, data, en.atk))), Math.floor(heroDef(data, t, state) / 2), { sure: true, defending: !!c.defending[ti], mult: sp.mult, trace: tr });
      const cap = Math.max(1, Math.ceil(t.maxHp * (sp.all ? 0.4 : 0.5))); // ein Zauber nimmt höchstens die Hälfte der Max-LP (schützt den Magier)
      if (d > cap) { d = cap; tr.total = d; tr.cap = cap; }
      d = manaShield(data, t, d, msgs);
      t.hp = Math.max(0, t.hp - d);
      msgs.push(`${sp.name} trifft ${t.name} für ${d} ${sp.element && data.elements[sp.element] ? data.elements[sp.element].name + 'schaden' : 'Schaden'} (Zauber: halbe Rüstung${c.defending[ti] ? ', verteidigt: halber Schaden' : ''}).${SEP}${explain(tr)}`);
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
  });
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
const STATIC_TYPES = new Set(['stairs', 'sign', 'merchant', 'exit', 'runestone']);
export function syncStatic(state, data) {
  for (const h of state.heroes || []) if (h && data.classes[h.cls] && h.role !== data.classes[h.cls].name) h.role = data.classes[h.cls].name; // umbenannte Berufe (Priester → Kleriker)
  const areas = [{ id: state.levelId, objs: state.objs }, ...Object.entries(state.areas || {}).map(([id, a]) => ({ id, objs: a.objs }))];
  let n = 0;
  for (const a of areas) {
    const lvl = data.levels[a.id];
    if (!lvl || !Array.isArray(a.objs)) continue;
    const ids = new Set(lvl.objects.map((o) => o.id));
    for (let k = a.objs.length - 1; k >= 0; k--) if (a.objs[k] && STATIC_TYPES.has(a.objs[k].type) && !ids.has(a.objs[k].id)) { a.objs.splice(k, 1); n++; } // veraltete feste Objekte (z. B. ersetzter Ausgang)
    for (const o of lvl.objects) {
      const i = a.objs.findIndex((x) => x && x.id === o.id);
      if (i < 0) { a.objs.push(freshObj(data, o)); n++; }
      else if (STATIC_TYPES.has(o.type) && a.objs[i].type === o.type && JSON.stringify(a.objs[i]) !== JSON.stringify(o)) { a.objs[i] = clone(o); n++; }
      else if (o.type === 'chest' && o.lootV && a.objs[i].type === 'chest' && !a.objs[i].open && a.objs[i].lootV !== o.lootV) { a.objs[i].loot = clone(o.loot); a.objs[i].lootV = o.lootV; n++; } // 0.21.0: neue Beute (z. B. Set-Teile) auch in ungeöffneten Truhen alter Stände
      else if (o.type === 'enemy' && a.objs[i].type === 'enemy' && !a.objs[i].dead && (a.objs[i].x !== o.x || a.objs[i].y !== o.y) && !(a.id === state.levelId && state.player.x === o.x && state.player.y === o.y)) { a.objs[i].x = o.x; a.objs[i].y = o.y; n++; } // 0.23.12: Gegnerplatz (z. B. Hüter am Thron) auch in alten Ständen nachziehen
      else if (!STATIC_TYPES.has(o.type)) for (const k of ['title', 'style', 'torch', 'msg']) if (o[k] !== undefined && a.objs[i][k] !== o[k]) { a.objs[i][k] = o[k]; n++; } // 0.16.14: Beschriftung/Stil von Türen u. a. nachziehen (alte Stände ohne `style` zeigten einen Zufallsstil)
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
  const fxName = { lifesteal: 'Lebensraub %', thorns: 'Dornen', crit: 'Krit %', dodge: 'Ausweichen %', resist: 'Statusabwehr %', soak: 'Schaden −', regen: 'Ressource +', heal: 'Heilung +', abil: 'Fähigkeiten %' };
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

// ---------- Level-Analyse (Softlock-Prüfung) ----------
export function analyzeLevel(data, levelId) {
  const lvl = data.levels[levelId];
  const doors = lvl.objects.filter((o) => o.type === 'door');
  const chests = lvl.objects.filter((o) => o.type === 'chest');
  const exits = lvl.objects.filter((o) => o.type === 'exit' || o.type === 'stairs'); // Ausgang = Runenstein oder Treppe
  const have = new Set();
  const opened = new Set();
  const gatesOpen = new Set(); // Gitter, deren Hebel erreichbar ist
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
        if (lvl.objects.some((o) => (o.type === 'lever' || ((o.type === 'gate' || o.type === 'secret') && !gatesOpen.has(o.id))) && o.x === nx && o.y === ny)) continue;
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
