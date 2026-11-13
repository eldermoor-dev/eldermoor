// Die Schatten von Eldermoor – Spielsteuerung, Oberfläche, Eingabe
// Autor: eldermoor-dev
import {
  DIRS, DIR_NAMES, newGame, tryMove, turn, interact, useItemOutside, startCombat, currentActor,
  heroAction, enemyStep, applyDefeat, serialize, deserialize, markSeen, getLevel, cellChar, blockerAt,
  buildParty, deriveStats, skipStunned, statusOf, validateParty, randomParty, xpForNext, NAME_MAX
} from './logic.js';
import { Raycaster, makeTextures, buildGrid, buildSprites, drawPortrait, setResolution, W, H, BASE_W, BASE_H } from './render.js';
import { Sfx } from './audio.js';
import { store } from './store.js';

const VERSION = '0.3.1';
const $ = (s, r = document) => r.querySelector(s);
const hasKey = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// settingsV 2 (v0.2.0): Schrittgeräusche standardmäßig aus (Nutzerentscheidung 13.11.2026)
const SETTINGS_V = 2;
const DEFAULTS = { volume: 0.7, muted: false, quality: 'medium', vibration: true, fontScale: 1, colorblind: false, debug: false, flicker: 0.35, steps: false, ambient: true, sharp: 'scharf', settingsV: SETTINGS_V };
const REPEAT = new Set(['fwd', 'back', 'sl', 'sr', 'tl', 'tr']);
const SLOT_KEYS = ['auto', 'slot1', 'slot2', 'slot3'];
const SLOT_NAMES = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

const S = {
  data: null, game: null, lvl: null, settings: { ...DEFAULTS }, tex: null, rc: null, ctx: null, img: null,
  sfx: new Sfx(), cam: { x: 0, y: 0, a: 0 }, target: { x: 0, y: 0, a: 0 }, tween: null,
  held: [], queued: null, nextAllowed: 0, lock: false, modal: null, started: false, log: [],
  debug: { god: false }, itemMode: false, abMode: false, invUse: null, draft: null, fps: 60, frameMs: 0, lastRender: 0,
  installEvent: null, loadMs: null, hadController: false
};

// ---------------------------------------------------------------- Start
async function boot() {
  try {
    S.data = await (await fetch('./game.json')).json();
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;z-index:99;background:#000;padding:20px">Spieldaten konnten nicht geladen werden. Bitte online einmal neu laden.</div>');
    return;
  }
  S.game = newGame(S.data, 1);
  S.lvl = getLevel(S.data, S.game);
  S.ctx = $('#view').getContext('2d', { alpha: false });
  await loadSettings();
  buildRenderer();
  applySettings();
  bindUI();
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  document.addEventListener('visibilitychange', () => { if (document.hidden) S.sfx.suspend(); else S.sfx.resume(); });
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest || !e.target.closest('input')) e.preventDefault(); });
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('#modal-box')) e.preventDefault(); }, { passive: false });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvent = e; });
  snapCam();
  renderAll();
  await showTitle();
  registerSW();
  requestAnimationFrame(frame);
}

function startGame(state) {
  S.game = state;
  S.lvl = getLevel(S.data, state);
  S.rc.setPalette(S.data.palettes[S.lvl.palette]);
  S.held = []; S.queued = null; S.lock = false; S.itemMode = false; S.abMode = false; S.log = [];
  S.started = true;
  snapCam();
  closeModal();
  $('#title').hidden = true;
  document.body.classList.remove('on-title');
  S.sfx.unlock();
  if (S.settings.ambient !== false) S.sfx.startAmbient();
  renderAll();
}

// ---------------------------------------------------------------- Einstellungen
async function loadSettings() {
  try {
    const s = await store.get('settings');
    if (s && typeof s === 'object') {
      S.settings = { ...DEFAULTS, ...s };
      // Einmalig: bestehende Einstellungen (vor 0.2.0) auf den neuen Standard „Schrittgeräusche aus“ setzen; wieder einschaltbar
      if (!(s.settingsV >= SETTINGS_V)) { S.settings.steps = false; S.settings.settingsV = SETTINGS_V; saveSettings(); }
    }
  } catch { /* Standardwerte */ }
}
function saveSettings() { store.set('settings', S.settings); }
function applySettings() {
  const s = S.settings;
  S.sfx.setVolume(s.volume);
  S.sfx.setMuted(s.muted);
  S.sfx.stepsOn = s.steps !== false;
  if (S.started) { if (s.ambient !== false) S.sfx.startAmbient(); else S.sfx.stopAmbient(); }
  if (S.rc) { buildRenderer(); }
  S.rc.quality = s.quality;
  S.rc.flicker = s.flicker;
  document.documentElement.style.setProperty('--fs', String(s.fontScale));
  document.body.classList.toggle('cb', !!s.colorblind);
  $('#debugbtn').hidden = !s.debug;
  $('#fps').hidden = !s.debug;
}
function vib(ms) {
  if (!S.settings.vibration || !navigator.vibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // Chrome blockiert Vibration vor der ersten Berührung
  navigator.vibrate(ms);
}

// ---------------------------------------------------------------- Layout (ganzzahlige Skalierung)
// Renderer in der gewählten Auflösung (Retro 480×270 oder Scharf 960×540) neu aufbauen
function buildRenderer() {
  const res = S.settings.sharp === 'retro' ? 1 : 2;
  if (S.res === res && S.rc) return;
  const old = S.rc;
  S.res = res;
  setResolution(res);
  S.tex = makeTextures(res);
  S.rc = new Raycaster(S.tex, S.data.palettes[S.lvl.palette]);
  if (old) { S.rc.quality = old.quality; S.rc.flicker = old.flicker; }
  const cv = $('#view'); cv.width = W; cv.height = H;
  S.img = new ImageData(new Uint8ClampedArray(S.rc.buf.buffer), W, H);
  layout();
}
function layout() {
  const dpr = window.devicePixelRatio || 1;
  // 2 Gerätepixel Toleranz: 411 CSS-px × 2,625 = 1079 Gerätepixel würden sonst 3× statt 4× ergeben
  // Die Bühne bleibt ein ganzzahliges Vielfaches von 480×270; Scharf rendert intern mit doppelter Auflösung
  const scale = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr + 2) / BASE_W, (window.innerHeight * dpr + 2) / BASE_H)));
  const st = $('#stage');
  st.style.width = (BASE_W * scale / dpr) + 'px';
  st.style.height = (BASE_H * scale / dpr) + 'px';
  const ratio = scale / (S.res || 1);
  $('#view').style.imageRendering = Number.isInteger(ratio) ? 'pixelated' : 'auto';
  S.scale = scale;
  // Oberfläche schrumpft mit dem Spielbild (z. B. 3× statt 4× mit sichtbarer Adressleiste)
  S.hs = Math.max(0.6, Math.min(1, (BASE_H * scale / dpr) / 400));
  document.documentElement.style.setProperty('--hs', String(S.hs));
  fitStack();
}
// Meldungen, Aktionsleiste und Heldenkarten passen genau zwischen die beiden Knopfblöcke (auch mit Sicherheitsrand am Display)
function fitStack() {
  const st = $('#stage'), stack = $('#stack');
  if (!st || !stack) return;
  const sr = st.getBoundingClientRect(), lp = $('#ctl-left').getBoundingClientRect(), rp = $('#ctl-right').getBoundingClientRect();
  const left = Math.max(sr.left, lp.right + 6), right = Math.min(sr.right, rp.left - 6);
  if (right - left < 240) { stack.style.left = ''; stack.style.width = ''; stack.style.transform = ''; return; }
  const hs = S.hs || 1;
  stack.style.left = ((left - sr.left) / hs) + 'px';
  stack.style.width = ((right - left) / hs) + 'px';
  stack.style.transform = 'none';
}

// ---------------------------------------------------------------- Kamera
function snapCam() {
  const p = S.game.player;
  S.cam = { x: p.x + 0.5, y: p.y + 0.5, a: p.dir * Math.PI / 2 };
  S.target = { ...S.cam };
  S.tween = null;
}
function beginTween(dur = 190) { S.tween = { from: { ...S.cam }, to: { ...S.target }, t0: performance.now(), dur }; }
function updateTween(now) {
  const t = S.tween;
  if (!t) return;
  const k = Math.min(1, (now - t.t0) / t.dur);
  const e = k * k * (3 - 2 * k);
  S.cam = { x: t.from.x + (t.to.x - t.from.x) * e, y: t.from.y + (t.to.y - t.from.y) * e, a: t.from.a + (t.to.a - t.from.a) * e };
  if (k >= 1) { S.cam = { ...t.to }; S.tween = null; }
}

// ---------------------------------------------------------------- Hauptschleife
function frame(now) {
  requestAnimationFrame(frame);
  if (now - S.lastRender < 1000 / 60 - 1.5) return; // 120-Hz-Display: auf ~60 FPS begrenzen
  const dt = now - S.lastRender;
  S.lastRender = now;
  if (dt > 0 && dt < 250) S.fps = S.fps * 0.92 + (1000 / dt) * 0.08;
  if (!S.started) { S.cam = { x: 3.5, y: 3.5, a: now * 0.00018 }; }
  else {
    updateTween(now);
    if (!S.tween && !S.modal && !S.lock && S.game) {
      if (S.queued) { const n = S.queued; S.queued = null; act(n); }
      else if (S.held.length && now >= S.nextAllowed) act(S.held[S.held.length - 1].name);
    }
  }
  const t0 = performance.now();
  const { grid, gw, gh } = buildGrid(S.lvl, S.game.objs);
  S.rc.render({ px: S.cam.x, py: S.cam.y, angle: S.cam.a, grid, gw, gh, sprites: buildSprites(S.game.objs, S.tex, now / 1000), time: now / 1000 });
  S.ctx.putImageData(S.img, 0, 0);
  S.frameMs = S.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  if (S.loadMs == null) S.loadMs = Math.round(performance.now());
  if (S.settings.debug && (Math.floor(now / 500) !== S.lastFpsTick)) {
    S.lastFpsTick = Math.floor(now / 500);
    $('#fps').textContent = `FPS ${S.fps.toFixed(0)}\nRender ${S.frameMs.toFixed(1)} ms\n${S.settings.quality} · ${S.scale}× · ${W}×${H}\nStart→1. Bild ${S.loadMs} ms`;
  }
}

// ---------------------------------------------------------------- Eingabe
function press(name, id) {
  if (REPEAT.has(name)) { S.held.push({ name, id }); S.queued = name; }
  else act(name);
}
function release(id) { S.held = S.held.filter((h) => h.id !== id); }
function bindHold(el, name) {
  const down = (e) => {
    e.preventDefault();
    S.sfx.unlock();
    el.classList.add('down');
    try { el.setPointerCapture(e.pointerId); } catch { /* ignorieren */ }
    press(name, e.pointerId);
  };
  const up = (e) => { el.classList.remove('down'); release(e.pointerId); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}
function bindUI() {
  document.querySelectorAll('[data-a]').forEach((el) => bindHold(el, el.dataset.a));
  $('#modal-box').addEventListener('click', onModalClick);
  $('#modal-box').addEventListener('input', onModalInput);
  $('#modal-box').addEventListener('change', onModalInput);
  $('#actionbar').addEventListener('click', onActionBar);
  $('#title').addEventListener('click', onTitleClick);
  $('#importfile').addEventListener('change', onImportFile);
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && e.target.closest && e.target.closest('input,select,textarea')) return; // Tippen in Eingabefeldern (Namen) darf nicht als Steuerung gelten
    const map = { ArrowUp: 'fwd', w: 'fwd', ArrowDown: 'back', s: 'back', ArrowLeft: 'tl', ArrowRight: 'tr', a: 'sl', d: 'sr', q: 'tl', e: 'tr', ' ': 'interact', f: 'attack', Escape: 'menu', i: 'inv', m: 'map' };
    const n = map[e.key]; if (!n) return;
    e.preventDefault(); S.sfx.unlock();
    press(n, 'k' + e.key);
  });
  window.addEventListener('keyup', (e) => release('k' + e.key));
}

// ---------------------------------------------------------------- Aktionen
function say(msg) {
  if (!msg) return;
  if (!S.game.combat && S.log.length && S.log[S.log.length - 1] === msg) return; // gleiche Meldung nicht wiederholen (nicht im Kampf)
  S.log.push(msg); if (S.log.length > 60) S.log.shift(); renderLog(); }
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms);
}
function flash() { const v = $('#view'); v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit'); }

function act(name) {
  if (!S.started) return;
  const menuLike = { map: openMap, save: () => openSlots('save'), load: () => openSlots('load'), settings: openSettings, menu: openMenu, inv: openInventory, char: openCharacter, debug: openDebug };
  if (menuLike[name]) { if (!S.modal) menuLike[name](); return; }
  if (S.modal || S.lock) return;
  const g = S.game;
  switch (name) {
    case 'fwd': case 'back': case 'sl': case 'sr': doMove({ fwd: 'f', back: 'b', sl: 'l', sr: 'r' }[name]); break;
    case 'tl': doTurn(-1); break;
    case 'tr': doTurn(1); break;
    case 'interact': {
      if (g.combat) { say('Im Kampf stehen die Aktionsknöpfe zur Verfügung.'); break; }
      const r = interact(g, S.data);
      if (r.encounter) { startCombatUI(r.encounter); break; }
      say(r.msg); if (r.sfx) S.sfx.play(r.sfx);
      if (r.changed) vib(20);
      renderAll();
      break;
    }
    case 'attack':
      if (g.combat) heroAct({ type: 'attack' });
      else { const f = frontEnemy(); if (f) startCombatUI(f); else say('Kein Gegner in Reichweite.'); }
      break;
    case 'cast': if (g.combat && !S.lock) useAbility(); else say(g.combat ? 'Warte, bis du dran bist.' : 'Fähigkeiten gibt es nur im Kampf.'); break;
    default: break;
  }
}
function frontEnemy() {
  const p = S.game.player, f = { x: p.x + DIRS[p.dir].dx, y: p.y + DIRS[p.dir].dy };
  const b = blockerAt(S.game, f.x, f.y);
  return b && b.type === 'enemy' ? b : null;
}
function doMove(rel) {
  const g = S.game;
  if (g.combat) { say('Im Kampf kannst du dich nicht bewegen.'); S.held = []; return; }
  const r = tryMove(g, S.data, rel);
  if (r.moved) {
    S.sfx.play('step'); vib(8);
    S.target.x = g.player.x + 0.5; S.target.y = g.player.y + 0.5;
    beginTween();
    (r.events || []).forEach(onEvent);
    if (r.encounter) startCombatUI(r.encounter);
  } else if (r.encounter) startCombatUI(r.encounter);
  else {
    S.sfx.play('bump'); vib(15);
    if (r.msg) say(r.msg);
    S.nextAllowed = performance.now() + 300;
  }
}
function doTurn(d) {
  const g = S.game;
  if (g.combat) { say('Im Kampf kannst du dich nicht drehen.'); S.held = []; return; }
  const r = turn(g, S.data, d);
  S.target.a += d * Math.PI / 2;
  beginTween(170);
  S.sfx.play('step');
  if (r.encounter) startCombatUI(r.encounter);
}
async function onEvent(ev) {
  if (ev.type !== 'exit') return;
  say('Ein Runenstein glimmt auf. Das Zielgebiet des Prototyps ist erreicht.');
  S.held = [];
  await saveSlot('auto', true);
  openModal(`<h2>Gebiet abgeschlossen</h2><p>Du hast den Runenstein am Ende des Testgewölbes erreicht. Das ist das Ziel von Phase 1.</p><p class="muted">Autosave wurde angelegt (Gebietswechsel).</p><div class="acts"><button class="mb primary" data-m="close">Weiterspielen</button><button class="mb" data-m="title">Zum Titel</button></div>`, 'exit');
}

// ---------------------------------------------------------------- Kampf
function startCombatUI(enemyObj) {
  if (S.game.combat) return;
  S.held = []; S.queued = null;
  startCombat(S.game, S.data, enemyObj);
  S.clog = []; S.annKey = null;
  const name = S.data.enemies[enemyObj.kind].name;
  say(`${name} greift an!`);
  S.sfx.play('miss'); vib(40);
  renderAll();
  runEnemyTurns();
}
function showResult(r) {
  (r.msgs || []).forEach((m) => { say(m); clogAdd(m); });
  if (r.sfx) S.sfx.play(r.sfx);
  if (r.sfx === 'hit' || r.sfx === 'hurt') { flash(); vib(r.sfx === 'hurt' ? 60 : 30); }
}
async function runEnemyTurns() {
  S.lock = true;
  renderAll();
  try {
    while (S.game.combat && !S.game.combat.over) {
      const a = currentActor(S.game);
      if (!a) break;
      const sk = statusOf(S.game, a.side, a.idx).stun ? skipStunned(S.game, S.data) : null;
      if (sk) {
        await sleep(550);
        showResult(sk); renderAll();
        if (sk.over === 'victory') { vib([40, 60, 40]); break; }
        await sleep(450);
        continue;
      }
      if (a.side === 'h') break;
      await sleep(550);
      const r = enemyStep(S.game, S.data, { god: S.debug.god });
      if (r.error) break;
      showResult(r);
      renderAll();
      if (r.over === 'victory') { vib([40, 60, 40]); break; }
      if (r.over === 'defeat') { await sleep(500); showGameOver(); break; }
      await sleep(450);
    }
  } finally { S.lock = false; renderAll(); }
}
async function heroAct(a) {
  if (S.lock || !S.game.combat) return;
  const r = heroAction(S.game, S.data, a);
  if (r.error) {
    const t = { 'full-hp': 'Dieser Held hat volle LP.', 'no-item': 'Kein Heiltrank mehr.', 'bad-target': 'Das Ziel kann nicht geheilt werden.', 'not-available': 'Noch nicht verfügbar.', 'no-mp': 'Zu wenig Mana oder Ausdauer.', 'no-ability': 'Dieser Held hat keine Fähigkeit.' }[r.error];
    if (t) say(t);
    return;
  }
  S.itemMode = false; S.abMode = false;
  showResult(r);
  renderAll();
  if (r.over === 'victory') { vib([40, 60, 40]); return; }
  await runEnemyTurns();
}
function onActionBar(e) {
  const b = e.target.closest('[data-c]');
  if (!b || b.disabled) return;
  S.sfx.unlock();
  const c = b.dataset.c;
  if (c === 'attack') heroAct({ type: 'attack' });
  else if (c === 'defend') heroAct({ type: 'defend' });
  else if (c === 'item') { S.itemMode = !S.itemMode; S.abMode = false; renderCombat(); }
  else if (c === 'spell') useAbility();
  else if (c.startsWith('abheal:')) { S.abMode = false; heroAct({ type: 'ability', target: +c.slice(7) }); }
  else if (c === 'log') openCombatLog();
  else if (c.startsWith('heal:')) heroAct({ type: 'item', item: 'potion', hero: +c.slice(5) });
}
// Fähigkeit des Helden am Zug: Schadensfähigkeit wirkt sofort, Heilung fragt nach dem Ziel
function useAbility() {
  const a = currentActor(S.game);
  if (!a || a.side !== 'h') return;
  const h = S.game.heroes[a.idx], ab = S.data.classes[h.cls].ability;
  if (!ab) return;
  if (h.mp < ab.cost) { say(`Zu wenig ${S.data.classes[h.cls].res.name} (${h.mp}/${ab.cost}).`); return; }
  if (ab.kind === 'heal') { S.abMode = !S.abMode; S.itemMode = false; renderCombat(); }
  else heroAct({ type: 'ability' });
}
function showGameOver() {
  S.sfx.play('defeat');
  openModal(`<h2>Die Gruppe ist gefallen</h2><p>Du kannst zum Eingang des Gebiets zurückkehren oder einen Spielstand laden.</p><p class="muted">Preis der Rückkehr: alle Helden mit halben LP, 25&nbsp;% des Goldes gehen verloren. Der Gegner erholt sich.</p><div class="acts"><button class="mb primary" data-m="return">Zum Eingang zurückkehren</button><button class="mb" data-m="gameover-load">Spielstand laden</button></div>`, 'gameover');
}

// ---------------------------------------------------------------- HUD
function clogAdd(t, cls) { if (S.clog) S.clog.push({ t, cls: cls || '' }); }
// Zugansage: einmal pro Zug und Runde ins Kampfprotokoll und in die Meldungen
function announceTurn() {
  const c = S.game.combat;
  if (!c || c.over) return;
  const a = currentActor(S.game);
  if (!a) return;
  const key = c.round + ':' + c.pos;
  if (S.annKey === key) return;
  if (!S.annKey || S.annKey.split(':')[0] !== String(c.round)) clogAdd(`Runde ${c.round}`, 'rd');
  S.annKey = key;
  const nm = a.side === 'h' ? S.game.heroes[a.idx].name : c.enemies[a.idx].name;
  const t = a.side === 'h' ? `${nm} ist am Zug.` : `${nm} (Gegner) ist am Zug.`;
  clogAdd(t, 'turn');
  say(t);
}
function openCombatLog() {
  const rows = (S.clog || []).map((l) => `<div class="cl ${l.cls}">${esc(l.t)}</div>`).join('') || '<p class="muted">Noch nichts passiert.</p>';
  openModal(`<h2>Kampfprotokoll</h2><div class="clog">${rows}</div><div class="acts">${closeBtn}</div>`, 'clog');
  const box = $('#modal-box .clog'); if (box) box.scrollTop = box.scrollHeight;
}
function renderAll() { announceTurn(); renderParty(); renderCombat(); renderLog(); }
function renderLog() { $('#log').innerHTML = S.log.slice(S.game && S.game.combat ? -2 : -3).map((m) => `<div>${esc(m)}</div>`).join(''); }
function makePortrait(h) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  drawPortrait(cv.getContext('2d'), h.role, h.look, h.race);
  return cv;
}
const stIcons = (side, idx) => Object.keys(statusOf(S.game, side, idx)).map((k) => S.data.statuses[k].icon).join('');
function renderParty() {
  const g = S.game, box = $('#party');
  const cur = g.combat && !g.combat.over ? currentActor(g) : null;
  box.innerHTML = '';
  g.heroes.forEach((h, i) => {
    const pct = Math.round(100 * h.hp / h.maxHp);
    const card = document.createElement('div');
    card.className = 'card' + (h.hp <= 0 ? ' dead' : '') + (cur && cur.side === 'h' && cur.idx === i ? ' act' : '');
    card.append(makePortrait(h));
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    info.innerHTML = `<div class="nm">${esc(h.name)} <span class="rw">· ${h.row === 'front' ? 'vorn' : 'hinten'}</span> ${stIcons('h', i)}</div><div class="bar${pct <= 30 ? ' low' : ''}"><i style="width:${pct}%"></i></div><div class="hp">${h.hp}/${h.maxHp} · ${h.mp}/${h.maxMp} ${esc(S.data.classes[h.cls].res.name === 'Mana' ? 'MP' : 'AU')}</div>`;
    card.append(info);
    box.append(card);
  });
}
function renderCombat() {
  const c = S.game.combat, eb = $('#enemybox'), ab = $('#actionbar');
  if (!c) { eb.hidden = true; ab.hidden = true; return; }
  eb.hidden = false;
  const cur = c.over ? null : currentActor(S.game);
  const curName = cur ? (cur.side === 'h' ? S.game.heroes[cur.idx].name : c.enemies[cur.idx].name) : '';
  eb.innerHTML = (cur ? `<div class="turnbar ${cur.side === 'h' ? 'hero' : 'foe'}">${cur.side === 'h' ? 'Am Zug: ' + esc(curName) : 'Gegner am Zug: ' + esc(curName)}</div>` : '') + c.enemies.map((e) => {
    const pct = Math.round(100 * e.hp / e.maxHp);
    return `<div class="en"><b>${esc(e.name)} ${stIcons('e', S.game.combat.enemies.indexOf(e))}</b><span>${e.hp}/${e.maxHp} LP</span><div class="bar${pct <= 30 ? ' low' : ''}"><i style="width:${pct}%"></i></div></div>`;
  }).join('') + `<div class="order">Runde ${c.round}: ` + c.order.map((o, i) => {
    const nm = o.side === 'h' ? S.game.heroes[o.idx].name : c.enemies[o.idx].name;
    return `<span class="${(i === c.pos ? 'now' : i < c.pos ? 'done' : '') + (o.side === 'e' ? ' foe' : '')}">${esc(nm)}</span>`;
  }).join('') + '</div>';
  ab.hidden = false;
  const a = currentActor(S.game);
  if (c.over || !a) { ab.hidden = true; return; }
  if (a.side !== 'h' || S.lock) { ab.innerHTML = `<div class="wait">${a.side === 'h' ? esc(S.game.heroes[a.idx].name) + ' ist gleich dran …' : 'Gegner ist am Zug …'}</div><button class="ab" data-c="log" style="flex:0 0 auto">Protokoll</button>`; return; }
  const potions = S.game.inv.potion || 0;
  const ch = S.game.heroes[a.idx], cab = S.data.classes[ch.cls].ability, cres = S.data.classes[ch.cls].res;
  const abBtn = cab ? `<button class="ab" data-c="spell" ${ch.mp >= cab.cost ? '' : 'disabled'}>✦ ${esc(cab.name)} (${cab.cost} ${esc(cres.name)})</button>` : '';
  let html = `<button class="ab" data-c="attack">⚔ Angriff</button><button class="ab" data-c="defend">⛨ Verteidigen</button><button class="ab" data-c="item" ${potions ? '' : 'disabled'}>Gegenstand (${potions})</button>${abBtn}<button class="ab" data-c="log">Protokoll</button>`;
  if (S.itemMode) {
    html += '<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">' + S.game.heroes.map((h, i) =>
      `<button class="ab" data-c="heal:${i}" ${h.hp > 0 && h.hp < h.maxHp ? '' : 'disabled'}>Heiltrank → ${esc(h.name)}</button>`).join('') + '</div>';
  }
  if (S.abMode && cab && cab.kind === 'heal') {
    html += '<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">' + S.game.heroes.map((h, i) =>
      `<button class="ab" data-c="abheal:${i}" ${h.hp > 0 && h.hp < h.maxHp ? '' : 'disabled'}>${esc(cab.name)} → ${esc(h.name)}</button>`).join('') + '</div>';
  }
  ab.innerHTML = html;
}

// ---------------------------------------------------------------- Dialoge
function openModal(html, kind = 'generic') {
  $('#modal-box').innerHTML = html;
  $('#modal').hidden = false;
  S.modal = kind;
  S.held = [];
  $('#modal-box').scrollTop = 0;
}
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; S.modal = null; S.invUse = null; }
const closeBtn = '<button class="mb" data-m="close">Schließen</button>';

function openMenu() {
  openModal(`<h2>Menü</h2><div class="acts" style="flex-direction:column;align-items:stretch">
    <button class="mb primary" data-m="close">Weiterspielen</button>
    <button class="mb" data-m="save">Speichern</button>
    <button class="mb" data-m="load">Laden</button>
    <button class="mb" data-m="export">Spielstand exportieren (Datei)</button>
    <button class="mb" data-m="import">Spielstand importieren (Datei)</button>
    <button class="mb" data-m="settings">Einstellungen</button>
    <button class="mb" data-m="help">Steuerung &amp; Info</button>
    <button class="mb" data-m="title">Zum Titelbild</button></div>`, 'menu');
}
function helpHtml() {
  return `<h2>Steuerung &amp; Info</h2>
  <h3>Links: Bewegung</h3><p>↑ Vor, ↓ Zurück, ← → seitwärts, ↶ ↷ um 90° drehen. Gedrückt halten wiederholt die Bewegung.</p>
  <h3>Rechts: Aktionen</h3><p>◉ Interagieren (Türen, Truhen, Gegner ansprechen), ⚔ Angriff, ✦ Fähigkeit (nur im Kampf, kostet Mana oder Ausdauer), ▣ Inventar, ☻ Charakter.</p>
  <h3>Oben</h3><p>Karte (auf eine erkundete Zelle tippen setzt oder entfernt eine Notiz), Speichern, Laden, Einstellungen, Menü.</p>
  <h3>Kampf</h3><p>Rundenbasiert. Die Zugreihenfolge steht oben. Hinterreihe-Helden ohne Fernkampf treffen nur halb so hart.</p>
  <h3>Ziel des Prototyps</h3><p>Truhe im Nebenraum öffnen, Eisenschlüssel nehmen, die Eisentür aufschließen, den Moorschrat besiegen und den Runenstein erreichen.</p>
  <p class="muted">Prototyp Phase 2 (in Arbeit) · Version ${VERSION} · Autor: eldermoor-dev. Alle Grafiken und Geräusche entstehen im Spiel selbst (prozedural). Keine Musik.</p>
  <div class="acts">${closeBtn}</div>`;
}
function openHelp() { openModal(helpHtml(), 'help'); }

function openInventory() {
  const g = S.game, d = S.data;
  const items = Object.entries(g.inv).filter(([, n]) => n > 0);
  let html = `<h2>Inventar</h2><p>Gold: <b>${g.gold}</b></p>`;
  html += items.length ? items.map(([id, n]) => {
    const it = d.items[id];
    const use = it.kind === 'consumable' && !g.combat ? `<button class="mb" data-m="use:${id}">Benutzen</button>` : '';
    return `<div class="row"><div><b>${esc(it.name)}</b>${it.kind === 'quest' ? ' <span class="muted">(Questgegenstand)</span>' : ` × ${n}`}<div class="muted">${esc(it.desc)}</div></div>${use}</div>`;
  }).join('') : '<p class="muted">Nichts dabei.</p>';
  if (S.invUse) {
    html += `<h3>${esc(d.items[S.invUse].name)} an wem anwenden?</h3><div class="acts">` + g.heroes.map((h, i) =>
      `<button class="mb" data-m="heal:${i}" ${h.hp > 0 && h.hp < h.maxHp ? '' : 'disabled'}>${esc(h.name)} (${h.hp}/${h.maxHp})</button>`).join('') + '</div>';
  }
  if (g.combat) html += '<p class="muted">Im Kampf: Gegenstände über den Knopf „Gegenstand“ benutzen.</p>';
  html += `<div class="acts">${closeBtn}</div>`;
  openModal(html, 'inventory');
}
function xpLine(h) {
  const need = xpForNext(S.data, h);
  return need == null ? `EP ${h.xp} · Höchststufe` : `EP ${h.xp} / ${need}`;
}
function charAbility(h) {
  const c = S.data.classes[h.cls], ab = c.ability;
  if (!ab) return '';
  return `<div>${esc(c.res.name)} ${h.mp}/${h.maxMp}</div><div style="margin-top:3px">✦ ${esc(ab.name)} (${ab.cost})</div><div class="muted" style="font-size:.72em">${esc(ab.desc)}</div>`;
}
function openCharacter() {
  const g = S.game;
  openModal(`<h2>Charaktere</h2><div class="grid4">` + g.heroes.map((h) =>
    `<div class="hc"><b>${esc(h.name)}</b><div class="muted">${esc(raceName(h.race))} · ${esc(h.role)}</div><div class="muted">${h.row === 'front' ? 'Vorderreihe' : 'Hinterreihe'}</div>
    <div>Stufe ${h.level}</div><div class="muted">${xpLine(h)}</div>
    <div>LP ${h.hp}/${h.maxHp}</div><div>Angriff ${h.atk}</div><div>Verteidigung ${h.def}</div><div>Initiative ${h.init}</div><div>${h.ranged ? 'Fernkampf' : 'Nahkampf'}</div>${charAbility(h)}</div>`).join('') +
    `</div><p class="muted">Ausrüstung folgt in einem der nächsten Schritte von Phase 2.</p><div class="acts">${closeBtn}</div>`, 'character');
}

function openMap() {
  const w = S.lvl.map[0].length, h = S.lvl.map.length;
  const cs = Math.max(8, Math.min(Math.floor(560 / w), Math.floor(230 / h)));
  openModal(`<h2>Karte – ${esc(S.lvl.name)}</h2><canvas id="mapcv" width="${cs * w}" height="${cs * h}"></canvas>
  <p class="muted">Blickrichtung: ${DIR_NAMES[S.game.player.dir]}. Auf eine erkundete Zelle tippen setzt oder löscht eine Notiz (◆).</p><div class="acts">${closeBtn}</div>`, 'map');
  const cv = $('#mapcv');
  cv.dataset.cs = cs;
  drawMap();
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * cv.width / r.width / cs), y = Math.floor((e.clientY - r.top) * cv.height / r.height / cs);
    const idx = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || !S.game.seen[idx] || cellChar(S.lvl, x, y) !== '.') return;
    const i = S.game.notes.indexOf(idx);
    if (i >= 0) S.game.notes.splice(i, 1); else S.game.notes.push(idx);
    S.sfx.play('ui');
    drawMap();
  });
}
function drawMap() {
  const cv = $('#mapcv'), c = cv.getContext('2d'), cs = +cv.dataset.cs, g = S.game, lvl = S.lvl;
  const w = lvl.map[0].length, h = lvl.map.length;
  c.fillStyle = '#0a0806'; c.fillRect(0, 0, cv.width, cv.height);
  const seen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && g.seen[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (cellChar(lvl, x, y) === '.') { if (seen(x, y)) { c.fillStyle = '#4a4034'; c.fillRect(x * cs, y * cs, cs, cs); } }
    else {
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cellChar(lvl, x + dx, y + dy) === '.' && seen(x + dx, y + dy)) near = true;
      if (near) { c.fillStyle = '#8a7a5e'; c.fillRect(x * cs, y * cs, cs, cs); }
    }
  }
  for (const o of g.objs) {
    if (!seen(o.x, o.y)) continue;
    const cx = o.x * cs + cs / 2, cy = o.y * cs + cs / 2;
    if (o.type === 'door') { c.fillStyle = o.open ? '#6b5a3a' : (o.locked ? '#b8472f' : '#a0703a'); c.fillRect(o.x * cs + 2, o.y * cs + 2, cs - 4, cs - 4); }
    else if (o.type === 'chest') { c.fillStyle = o.open ? '#7a6a3a' : '#e0b040'; c.fillRect(cx - cs * 0.25, cy - cs * 0.2, cs * 0.5, cs * 0.4); }
    else if (o.type === 'exit') { c.strokeStyle = '#7fd4ff'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, cs * 0.3, 0, 7); c.stroke(); }
    else if (o.type === 'enemy' && !o.dead) { c.fillStyle = '#d05040'; c.font = `bold ${cs}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('×', cx, cy); }
  }
  c.fillStyle = '#ffe066';
  for (const idx of g.notes) { const x = idx % w, y = Math.floor(idx / w); c.beginPath(); c.moveTo(x * cs + cs / 2, y * cs + 3); c.lineTo(x * cs + cs - 3, y * cs + cs / 2); c.lineTo(x * cs + cs / 2, y * cs + cs - 3); c.lineTo(x * cs + 3, y * cs + cs / 2); c.fill(); }
  const p = g.player, px = p.x * cs + cs / 2, py = p.y * cs + cs / 2, a = p.dir * Math.PI / 2, r = cs * 0.38;
  c.fillStyle = '#ffffff'; c.beginPath();
  c.moveTo(px + Math.sin(a) * r, py - Math.cos(a) * r);
  c.lineTo(px + Math.sin(a + 2.5) * r, py - Math.cos(a + 2.5) * r);
  c.lineTo(px + Math.sin(a - 2.5) * r, py - Math.cos(a - 2.5) * r);
  c.fill();
}

function openSettings() {
  const s = S.settings;
  const sel = (key, opts) => `<select data-s="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const chk = (key) => `<input type="checkbox" data-s="${key}" ${s[key] ? 'checked' : ''}>`;
  openModal(`<h2>Einstellungen</h2>
  <div class="row"><label>Lautstärke</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-s="volume"></div>
  <div class="row"><label>Ton stumm (alles)</label>${chk('muted')}</div>
  <div class="row"><label>Schrittgeräusche</label>${chk('steps')}</div>
  <div class="row"><label>Hintergrundgeräusche (Wind, Tropfen, Fackel)</label>${chk('ambient')}</div>
  <div class="row"><label>Grafikqualität</label>${sel('quality', [['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']])}</div>
  <div class="row"><label>Bildschärfe</label>${sel('sharp', [['scharf', 'Scharf (960×540)'], ['retro', 'Retro (480×270)']])}</div>
  <div class="row"><label>Fackelflackern</label>${sel('flicker', [[0, 'Aus'], [0.35, 'Schwach'], [1, 'Normal']])}</div>
  <div class="row"><label>Vibration</label>${chk('vibration')}</div>
  <div class="row"><label>Schriftgröße</label>${sel('fontScale', [[0.9, 'Klein'], [1, 'Normal'], [1.15, 'Groß'], [1.3, 'Sehr groß']])}</div>
  <div class="row"><label>Farbenblind-Modus (Blau/Orange statt Grün/Rot)</label>${chk('colorblind')}</div>
  <div class="row"><label>Debug-Modus</label>${chk('debug')}</div>
  <div class="row muted">Gamepad-Unterstützung: geplant (Phase 5), noch nicht enthalten.</div>
  <div class="acts"><button class="mb" data-m="fullscreen">Vollbild</button><button class="mb" data-m="install">App installieren</button><button class="mb" data-m="selftest">Selbsttest</button>${closeBtn}</div>
  <p class="muted">Version ${VERSION}. Speicher: ${store.persistent ? 'IndexedDB' : 'nur temporär (IndexedDB nicht verfügbar)'}.</p>`, 'settings');
}
function onModalInput(e) {
  const del = e.target.closest('[data-h]');
  if (del) { onDraftInput(del, e.type); return; }
  const el = e.target.closest('[data-s]');
  if (!el) return;
  const k = el.dataset.s;
  const v = el.type === 'checkbox' ? el.checked : (el.type === 'range' || k === 'fontScale' || k === 'flicker') ? parseFloat(el.value) : el.value;
  S.settings[k] = v;
  applySettings();
  saveSettings();
  if (k === 'volume' && e.type === 'change') S.sfx.play('ui');
  if (k === 'debug') { /* Debug-Knopf wird in applySettings umgeschaltet */ }
}

async function slotMeta(key) {
  const raw = await store.get(key);
  if (!raw || !raw.state) return null;
  const st = raw.state;
  const when = raw.savedAt ? new Date(raw.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '?';
  return { raw, text: `${S.data.levels[st.levelId] ? S.data.levels[st.levelId].name : st.levelId} · ${st.gold} Gold · ${st.steps} Schritte · ${when}` };
}
async function openSlots(mode) {
  const keys = mode === 'save' ? SLOT_KEYS.filter((k) => k !== 'auto') : SLOT_KEYS;
  const metas = await Promise.all(keys.map(slotMeta));
  const rows = keys.map((k, i) => {
    const m = metas[i];
    return `<div class="row"><div><b>${SLOT_NAMES[k]}</b><div class="muted">${m ? esc(m.text) : 'leer'}</div></div>
      <button class="mb" data-m="${mode}:${k}" ${mode === 'load' && !m ? 'disabled' : ''}>${mode === 'save' ? 'Speichern' : 'Laden'}</button></div>`;
  }).join('');
  openModal(`<h2>${mode === 'save' ? 'Speichern' : 'Laden'}</h2>${mode === 'save' && S.game.combat ? '<p class="bad">Im Kampf kann nicht gespeichert werden.</p>' : ''}${rows}
  <div class="acts">${S.started || mode === 'save' ? closeBtn : '<button class="mb" data-m="title-close">Zurück</button>'}</div>`, 'slots-' + mode);
}
async function saveSlot(key, silent) {
  if (S.game.combat) { toast('Im Kampf kann nicht gespeichert werden.'); return false; }
  await store.set(key, serialize(S.game));
  if (!silent) toast(`Gespeichert: ${SLOT_NAMES[key]}`);
  if (!store.persistent) toast('Achtung: Browser-Speicher nicht verfügbar, Spielstand nur temporär.', 4000);
  return true;
}
async function loadSlot(key) {
  const raw = await store.get(key);
  if (!raw) { toast('Slot ist leer.'); return; }
  try { startGame(deserialize(raw, S.data)); say('Spielstand geladen.'); }
  catch (e) { toast('Laden fehlgeschlagen: ' + e.message, 4500); }
}
function exportSave() {
  if (S.game.combat) { toast('Im Kampf kann nicht exportiert werden.'); return; }
  const blob = new Blob([JSON.stringify(serialize(S.game))], { type: 'application/json' });
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const name = `eldermoor-spielstand-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Datei exportiert (meist im Ordner „Download“). Zur Sicherung z. B. in Google Drive hochladen.', 5000);
}
async function onImportFile(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { startGame(deserialize(await f.text(), S.data)); say('Spielstand importiert. Zum Behalten in einem Slot speichern.'); toast('Spielstand importiert.'); }
  catch (err) { toast('Import fehlgeschlagen: ' + err.message, 4500); }
}

// ---------------------------------------------------------------- Debug und Selbsttest
function teleportTo(id) {
  const g = S.game;
  if (g.combat) { toast('Im Kampf nicht möglich.'); return; }
  if (id === 'start') { g.player = { ...S.lvl.start }; }
  else {
    const o = g.objs.find((x) => x.id === id);
    if (!o) return;
    let ok = false;
    for (let d = 0; d < 4 && !ok; d++) {
      const nx = o.x - DIRS[d].dx, ny = o.y - DIRS[d].dy;
      if (cellChar(S.lvl, nx, ny) === '.' && !blockerAt(g, nx, ny)) { g.player = { x: nx, y: ny, dir: d }; ok = true; }
    }
    if (!ok) { toast('Kein freies Feld neben dem Ziel.'); return; }
  }
  markSeen(g, S.data); snapCam(); closeModal(); say('Debug: Teleport.');
}
function openDebug() {
  const g = S.game;
  const status = g.objs.map((o) => {
    const st = o.type === 'door' ? (o.open ? 'offen' : o.locked ? 'verschlossen' : 'geschlossen') : o.type === 'chest' ? (o.open ? 'geöffnet' : 'zu') : o.type === 'enemy' ? (o.dead ? 'besiegt' : `${o.hp} LP`) : (g.flags[o.id] ? 'erreicht' : 'offen');
    return `<div>${esc(o.id)} (${o.type}) · ${st}</div>`;
  }).join('');
  openModal(`<h2>Debug</h2>
  <h3>Teleport</h3><div class="acts" style="margin-top:0">${['start', 'door_a', 'chest_a', 'door_b', 'en1', 'exit1'].map((id) => `<button class="mb" data-m="tp:${id}">${id}</button>`).join('')}</div>
  <h3>Cheats</h3><div class="acts" style="margin-top:0">
    <button class="mb" data-m="god">Unverwundbar: ${S.debug.god ? 'AN' : 'aus'}</button>
    <button class="mb" data-m="dbg-key">Schlüssel geben</button>
    <button class="mb" data-m="dbg-potions">+5 Heiltränke</button>
    <button class="mb" data-m="dbg-heal">Alle heilen</button>
    <button class="mb" data-m="dbg-doors">Alle Türen öffnen</button>
    <button class="mb" data-m="dbg-kill">Gegner besiegen</button></div>
  <h3>Rätsel- und Objektstatus</h3><div class="muted">${status}</div><p class="muted">Phase 1 hat kein eigenes Rätsel, nur die Kette Truhe → Schlüssel → Eisentür.</p>
  <div class="acts">${closeBtn}</div>`, 'debug');
}
async function openSelfTest() {
  openModal('<h2>Selbsttest</h2><p>Läuft …</p>', 'selftest');
  try {
    const { runTests } = await import('./tests.js');
    const res = await runTests(S.data, { readText: async (n) => { const r = await fetch('./' + n, { cache: 'no-store' }); if (!r.ok) throw new Error(n); return r.text(); } });
    openModal(`<h2>Selbsttest</h2><p class="${res.failed ? 'bad' : 'ok'}"><b>${res.passed} bestanden, ${res.failed} fehlgeschlagen</b></p>` +
      res.results.map((r) => `<div class="row"><div><span class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'}</span> ${esc(r.name)}<div class="muted">${esc(r.detail)}</div></div></div>`).join('') +
      `<p class="muted">Hinweis: Renderzeiten hier sind Messwerte dieses Geräts (Browser). Dateitests laufen gegen die ausgelieferten Dateien.</p><div class="acts">${closeBtn}</div>`, 'selftest');
  } catch (e) { openModal(`<h2>Selbsttest</h2><p class="bad">Fehler: ${esc(e.message)}</p><div class="acts">${closeBtn}</div>`, 'selftest'); }
}

// ---------------------------------------------------------------- Dialog-Klicks
async function onModalClick(e) {
  const b = e.target.closest('[data-m]');
  if (!b || b.disabled) return;
  S.sfx.unlock();
  S.sfx.play('ui');
  const m = b.dataset.m;
  const g = S.game;
  if (m === 'close') closeModal();
  else if (m === 'title-close') { closeModal(); }
  else if (m === 'title') { if (S.started && !confirm('Zum Titelbild? Nicht gespeicherter Fortschritt geht verloren.')) return; closeModal(); await showTitle(); }
  else if (m === 'save') openSlots('save');
  else if (m === 'load') openSlots('load');
  else if (m === 'settings') openSettings();
  else if (m === 'help') openHelp();
  else if (m === 'export') exportSave();
  else if (m === 'import') $('#importfile').click();
  else if (m === 'fullscreen') {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }
    catch { toast('Vollbild wird von diesem Browser nicht unterstützt oder wurde abgelehnt.'); }
  } else if (m === 'install') {
    if (S.installEvent) { S.installEvent.prompt(); S.installEvent = null; }
    else toast('Chrome-Menü (⋮) → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.', 5000);
  } else if (m === 'selftest') openSelfTest();
  else if (m === 'party-quick') startNewGame(null);
  else if (m === 'party-edit' || m === 'party-reset') openPartyEditor(true);
  else if (m === 'party-back') openNewGame();
  else if (m === 'party-random') {
    if (!S.draft) initDraft();
    const rs = randomParty(S.data, S.draft.map((h) => h.name));
    S.draft = rs.map((r) => ({ name: r.name, race: r.race, cls: r.cls, row: r.row, rowSet: false }));
    openPartyEditor(false);
  }
  else if (m === 'party-start') {
    const specs = (S.draft || []).map((h) => ({ name: h.name, race: h.race, cls: h.cls, row: h.row }));
    const err = validateParty(S.data, specs);
    if (err.length) { const pe = $('#party-err'); if (pe) pe.textContent = err.join(' · '); return; }
    S.draft = null;
    startNewGame(specs);
  }
  else if (m.startsWith('save:')) {
    const key = m.slice(5);
    const existing = await store.get(key);
    if (existing && !confirm(`${SLOT_NAMES[key]} überschreiben?`)) return;
    if (await saveSlot(key)) openSlots('save');
  } else if (m.startsWith('load:')) { await loadSlot(m.slice(5)); }
  else if (m === 'gameover-load') openSlots('load');
  else if (m === 'return') { applyDefeat(g, S.data); S.lock = false; snapCam(); closeModal(); say('Du erwachst am Eingang. Die Gruppe ist angeschlagen.'); renderAll(); }
  else if (m.startsWith('use:')) { S.invUse = m.slice(4); openInventory(); }
  else if (m.startsWith('heal:')) {
    const r = useItemOutside(g, S.data, S.invUse || 'potion', +m.slice(5));
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); }
    if ((g.inv.potion || 0) <= 0) S.invUse = null;
    renderAll(); openInventory();
  }
  else if (m.startsWith('tp:')) teleportTo(m.slice(3));
  else if (m === 'god') { S.debug.god = !S.debug.god; openDebug(); }
  else if (m === 'dbg-key') { g.inv.iron_key = 1; toast('Schlüssel erhalten.'); }
  else if (m === 'dbg-potions') { g.inv.potion = (g.inv.potion || 0) + 5; toast('+5 Heiltränke'); }
  else if (m === 'dbg-heal') { g.heroes.forEach((h) => { h.hp = h.maxHp; }); renderAll(); toast('Alle geheilt.'); }
  else if (m === 'dbg-doors') { g.objs.forEach((o) => { if (o.type === 'door') { o.locked = false; o.open = true; } }); toast('Alle Türen offen.'); }
  else if (m === 'dbg-kill') { g.objs.forEach((o) => { if (o.type === 'enemy') { o.dead = true; o.hp = 0; } }); g.combat = null; renderAll(); toast('Gegner besiegt.'); }
}

// ---------------------------------------------------------------- Neues Spiel: Schnellstart-Gruppe oder Charaktereditor
const raceName = (k) => (hasKey(S.data.races, k) ? S.data.races[k].name : k);
const rowName = (r) => (r === 'front' ? 'Vorderreihe' : 'Hinterreihe');
function paintCanvases(attr, heroes) {
  document.querySelectorAll(`#modal-box canvas[${attr}]`).forEach((cv) => {
    const h = heroes[+cv.getAttribute(attr)];
    if (h) drawPortrait(cv.getContext('2d'), h.role, h.look, h.race);
  });
}
function startNewGame(specs) {
  const st = newGame(S.data, (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0, specs);
  startGame(st);
  say('Du stehst im Testgewölbe. Vor dir liegt eine Tür. Mit ◉ Interagieren öffnest du sie.');
}
function openNewGame() {
  const party = buildParty(S.data);
  const rows = party.map((h, i) => `<div class="qp"><canvas data-q="${i}" width="32" height="32"></canvas><div><b>${esc(h.name)}</b><div class="muted">${esc(raceName(h.race))} · ${esc(h.role)} · ${rowName(h.row)} · LP ${h.maxHp}</div></div></div>`).join('');
  openModal(`<h2>Neues Spiel</h2><h3>Schnellstart-Gruppe</h3>${rows}
    <div class="acts"><button class="mb primary" data-m="party-quick">Mit dieser Gruppe beginnen</button><button class="mb" data-m="party-edit">Eigene Gruppe erstellen</button><button class="mb" data-m="close">Zurück</button></div>`, 'newgame');
  paintCanvases('data-q', party);
}
function initDraft() {
  S.draft = S.data.quickParty.map((q) => ({ name: q.name, race: q.race, cls: q.cls, row: S.data.classes[q.cls].row, rowSet: false }));
}
function openPartyEditor(reset) {
  if (reset || !S.draft) initDraft();
  const d = S.data, box = $('#modal-box'), keep = box.scrollTop;
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  const cards = S.draft.map((h, i) => {
    const st = deriveStats(d, h.race, h.cls), c = d.classes[h.cls], r = d.races[h.race];
    const warn = h.row === 'back' && !c.ranged && !c.healer ? '<div class="bad">Hinterreihe, Nahkampf: halber Schaden</div>' : '';
    return `<div class="hc"><div class="top"><canvas class="pv" data-p="${i}" width="32" height="32"></canvas>
      <div style="flex:1;min-width:0"><b>Held ${i + 1}</b><input type="text" maxlength="${NAME_MAX}" placeholder="Name" autocomplete="off" autocapitalize="words" spellcheck="false" data-h="${i}:name" value="${esc(h.name)}"></div></div>
      <div class="row"><label>Rasse</label><select data-h="${i}:race">${opt(d.races, h.race)}</select></div>
      <div class="row"><label>Beruf</label><select data-h="${i}:cls">${opt(d.classes, h.cls)}</select></div>
      <div class="row"><label>Reihe</label><select data-h="${i}:row"><option value="front" ${h.row === 'front' ? 'selected' : ''}>Vorderreihe</option><option value="back" ${h.row === 'back' ? 'selected' : ''}>Hinterreihe</option></select></div>
      <div class="muted">${esc(r.desc)} ${esc(c.desc)}</div>
      <div class="stats"><span>LP ${st.maxHp}</span><span>Angriff ${st.atk}</span><span>Verteidigung ${st.def}</span><span>Initiative ${st.init}</span><span>${c.ranged ? 'Fernkampf' : 'Nahkampf'}</span></div>${warn}</div>`;
  }).join('');
  openModal(`<h2>Gruppe erstellen</h2><p class="muted">Vier Helden. Rasse und Beruf bestimmen die Werte (vorläufige Zahlen). Die Reihe folgt dem Beruf, lässt sich aber ändern.</p>
    <div class="grid4" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${cards}</div><p class="bad" id="party-err"></p>
    <div class="acts"><button class="mb primary" data-m="party-start">Spiel starten</button><button class="mb" data-m="party-random">Zufällige Gruppe</button><button class="mb" data-m="party-reset">Schnellstart-Werte laden</button><button class="mb" data-m="party-back">Zurück</button></div>`, 'party');
  box.scrollTop = keep;
  paintCanvases('data-p', S.draft.map((h, i) => ({ role: d.classes[h.cls].name, race: h.race, look: i * 7 + 3 })));
}
function onDraftInput(el, type) {
  if (!S.draft) return;
  const [is, field] = el.dataset.h.split(':');
  const h = S.draft[+is];
  if (!h) return;
  if (field === 'name') { if (type === 'input') h.name = el.value; return; } // Namen nur speichern, nicht neu zeichnen (Tastatur bleibt offen)
  if (type !== 'change') return;
  const v = el.value;
  if (field === 'race' && hasKey(S.data.races, v)) h.race = v;
  else if (field === 'cls' && hasKey(S.data.classes, v)) { h.cls = v; if (!h.rowSet) h.row = S.data.classes[v].row; }
  else if (field === 'row' && (v === 'front' || v === 'back')) { h.row = v; h.rowSet = true; }
  else return;
  openPartyEditor(false);
}

// ---------------------------------------------------------------- Titelbild
async function showTitle() {
  S.started = false;
  S.sfx.stopAmbient();
  S.held = []; S.queued = null;
  S.game = newGame(S.data, 1);
  S.lvl = getLevel(S.data, S.game);
  $('#ver').textContent = `Prototyp Phase 2 (in Arbeit) · Version ${VERSION}`;
  const latest = await latestSave();
  $('#btn-continue').disabled = !latest;
  $('#title').hidden = false;
  document.body.classList.add('on-title');
  renderAll();
}
async function latestSave() {
  let best = null;
  for (const k of SLOT_KEYS) {
    const raw = await store.get(k);
    if (raw && raw.savedAt && (!best || raw.savedAt > best.raw.savedAt)) best = { key: k, raw };
  }
  return best;
}
async function onTitleClick(e) {
  const b = e.target.closest('[data-t]');
  if (!b || b.disabled) return;
  S.sfx.unlock();
  S.sfx.play('ui');
  const t = b.dataset.t;
  if (t === 'new') openNewGame();
  else if (t === 'continue') { const l = await latestSave(); if (l) await loadSlot(l.key); }
  else if (t === 'load') { S.started = false; await openSlots('load'); }
  else if (t === 'settings') openSettings();
  else if (t === 'help') openHelp();
}

// ---------------------------------------------------------------- Service Worker
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  S.hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw); });
    });
  }).catch(() => { /* Offline-Modus nicht verfügbar, Spiel läuft trotzdem */ });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!S.hadController || reloading) return;
    reloading = true; location.reload();
  });
}
function showUpdate(worker) {
  const b = $('#banner');
  b.hidden = false;
  b.innerHTML = '<span>Neue Version verfügbar. Bitte zuerst speichern.</span><button class="mb" id="upd-go">Jetzt aktualisieren</button><button class="mb" id="upd-later">Später</button>';
  $('#upd-go').onclick = () => worker.postMessage({ type: 'SKIP_WAITING' });
  $('#upd-later').onclick = () => { b.hidden = true; };
}

boot();
