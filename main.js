// Die Schatten von Eldermoor – Spielsteuerung, Oberfläche, Eingabe
// Autor: eldermoor-dev
import {
  DIRS, DIR_NAMES, dirToward, frontCell, newGame, tryMove, turn, interact, useItemOutside, startCombat, currentActor,
  heroAction, enemyStep, applyDefeat, serialize, deserialize, markSeen, getLevel, cellChar, blockerAt,
  buildParty, deriveStats, skipStunned, restParty, enemyOf, sellItem, sellPrice, buyItem, buyPrice, shopStock, pushError, formatErrorLog, itemDef, qualityOf, changeArea, castOutside, jumpToLevel, resetArea, wallSignAhead, grantXp, knownSpells, canCleanse, comboFor, talentBranches, talentPoints, talentSum, learnedTalents, canLearnTalent, learnTalent, respecTalents, respecCost, equipItem, unequipItem, canEquip, gearBonus, statusOf, SEP, SWEEP_MULT, validateParty, randomParty, xpForNext, NAME_MAX
} from './logic.js';
import { Raycaster, makeTextures, buildGrid, buildSprites, buildDecals, drawPortrait, setResolution, W, H, BASE_W, BASE_H, spriteScale, setCombatFit, groupOffsets, isNarrowAt } from './render.js';
import { Sfx } from './audio.js';
import { store } from './store.js';

const VERSION = '0.19.12';
const cellCharRaw = cellChar; // unverfälschte Kartenzelle (die Karte blendet Geheimwände als Mauer ein)
const $ = (s, r = document) => r.querySelector(s);
const hasKey = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// settingsV 2 (v0.2.0): Schrittgeräusche standardmäßig aus (Nutzerentscheidung 13.11.2026)
const SETTINGS_V = 3;
// settingsV 3 (v0.19.9): Nutzer „Zu dunkel“ – Standard-Helligkeit 1,8 („Sehr hell“), neue Stufe „Maximal“ (2,4); alte Einstellung unter 1,8 wird einmalig angehoben
const DEFAULTS = { volume: 0.7, muted: false, quality: 'medium', vibration: true, fontScale: 1, colorblind: false, debug: false, flicker: 0.35, bright: 1.8, steps: false, ambient: true, sharp: 'scharf', settingsV: SETTINGS_V };
const REPEAT = new Set(['fwd', 'back', 'sl', 'sr', 'tl', 'tr']);
const SLOT_KEYS = ['auto', 'slot1', 'slot2', 'slot3'];
const SLOT_NAMES = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

const S = {
  data: null, game: null, lvl: null, settings: { ...DEFAULTS }, tex: null, rc: null, ctx: null, img: null,
  sfx: new Sfx(), cam: { x: 0, y: 0, a: 0 }, target: { x: 0, y: 0, a: 0 }, tween: null,
  held: [], queued: null, nextAllowed: 0, lock: false, modal: null, started: false, log: [],
  debug: { god: false }, itemMode: false, abMode: false, spMode: false, spSel: 0, foe: 0, invUse: null, draft: null, fps: 60, frameMs: 0, lastRender: 0,
  installEvent: null, loadMs: null, hadController: false
};
if (new URLSearchParams(location.search).has('dev')) { window.__S = S; S.snapCam = () => snapCam(); S.fn = { renderCombat: () => renderCombat(), startCombatUI: (o) => startCombatUI(o), showEvent: (a, b) => showEvent(a, b), openShop: (id) => openShop(id, true), gotoArea: (id) => { jumpToLevel(S.game, S.data, id); S.lvl = getLevel(S.data, S.game); S.rc.setPalette(S.data.palettes[S.lvl.palette]); S.held = []; S.queued = null; snapCam(); renderAll(); } }; } // nur für automatische Tests (?dev)

// ---------------------------------------------------------------- Fehlerlog
const ERR = { list: [], saveT: 0 };
function logError(where, err, extra) {
  try {
    const msg = err && err.message ? err.message : String(err);
    const g = S.game, ctx = g ? ` [Gebiet ${g.levelId}, Pos ${g.player.x}/${g.player.y}${g.combat ? ', im Kampf' : ''}]` : '';
    pushError(ERR.list, { v: VERSION, where, msg: msg + ctx + (extra ? ' ' + extra : ''), stack: err && err.stack });
    clearTimeout(ERR.saveT);
    ERR.saveT = setTimeout(() => { try { store.set('errlog', ERR.list); } catch { /* Log ist best effort */ } }, 300);
  } catch { /* nie selbst Fehler werfen */ }
}
window.addEventListener('error', (e) => logError('Fenster', e.error || e.message, e.filename ? `(${String(e.filename).split('/').pop()}:${e.lineno})` : ''));
window.addEventListener('unhandledrejection', (e) => logError('Versprechen', e.reason));

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
  S.held = []; S.queued = null; S.lock = false; S.itemMode = false; S.abMode = false; S.spMode = false; S.log = []; S.logTs = [];
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
    try { const el = await store.get('errlog'); if (Array.isArray(el)) ERR.list = el.concat(ERR.list).slice(-40); } catch { /* ohne alten Log */ }
    const s = await store.get('settings');
    if (s && typeof s === 'object') {
      S.settings = { ...DEFAULTS, ...s };
      // Einmalig: bestehende Einstellungen (vor 0.2.0) auf den neuen Standard „Schrittgeräusche aus“ setzen; wieder einschaltbar
      if (!(s.settingsV >= SETTINGS_V)) { if (!(s.settingsV >= 2)) S.settings.steps = false; if (!(S.settings.bright >= 1.8)) S.settings.bright = 1.8; S.settings.settingsV = SETTINGS_V; saveSettings(); }
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
  if (S.rc.bright !== s.bright) { S.rc.bright = s.bright; S.rc.setPalette(S.data.palettes[S.lvl.palette]); }
  document.documentElement.style.setProperty('--fs', String(s.fontScale));
  document.body.classList.toggle('cb', !!s.colorblind);
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
  S.rc.bright = S.settings.bright || 1; S.rc.setPalette(S.data.palettes[S.lvl.palette]);
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

// ---------------------------------------------------------------- Blickanpassung (0.16.4)
// Die Leiste unten (Meldungen, Aktionen, Heldenkarten) deckt das untere Bilddrittel ab. Damit Gegner und Truhen nicht dahinter
// verschwinden: im Kampf weicht die Kamera einen halben Schritt zurück und neigt den Blick so, dass die Füße über der Leiste stehen
// (Bosse: unverändert nah und formatfüllend). Vor einer Truhe senkt sich der Blick.
const VIEW_BACK = 0; // 0.16.15: Gegner stehen wieder genau 1 Feld vor der Gruppe (vorher 0,45 Feld zurückgewichen = zu weit weg); nur der Blick neigt sich
function viewCam() {
  const a = S.cam.a, b = S.vb || 0;
  return { x: S.cam.x - Math.sin(a) * b, y: S.cam.y + Math.cos(a) * b, a };
}
function hudTopPx(now) { // Oberkante der Leiste in Bildpixeln (H), höchstens alle 200 ms gemessen
  if (S.hudAt && now - S.hudAt < 200) return S.hudTop;
  S.hudAt = now;
  const v = $('#view'), st = $('#stack');
  const vr = v && v.getBoundingClientRect(), sr = st && st.getBoundingClientRect();
  S.hudTop = vr && sr && vr.height > 0 && sr.height > 0 ? Math.max(0, Math.min(H, (sr.top - vr.top) / vr.height * H)) : H * 0.7;
  return S.hudTop;
}
function viewTarget(now) {
  const g = S.game, f = S.rc.focal;
  if (!g || !S.started) return { back: 0, hz: 0.5 };
  const c = g.combat;
  if (c && !c.over) {
    const hud = hudTopPx(now), tY = 1 + VIEW_BACK, floor = 0.5 * f / tY;
    // 0.17.0: auch Bosse werden ganz ins Bild gesetzt (Kopf war oben abgeschnitten); sie bleiben dank Skalierung 1,0–1,2 trotzdem die größten Figuren
    const groups = {};
    c.enemies.forEach((e) => { if (e.hp > 0) (groups[e.objId] = groups[e.objId] || []).push(e.kind); });
    let maxS = 0.5;
    for (const ks of Object.values(groups)) for (const k of ks) maxS = Math.max(maxS, spriteScale(k, ks.length));
    const hMax = f / tY * maxS;
    // 0.16.17 (Nutzer): Blick wie bei der Truhe leicht nach unten – die Füße stehen knapp über der Leiste, passt die Figur nicht, wird sie verkleinert (Kopf bleibt im Bild)
    const feetY = hud - H * 0.015, avail = feetY - H * 0.03, fit = Math.max(0.5, Math.min(1, avail / hMax));
    return { back: VIEW_BACK, hz: Math.max(0.08, Math.min(0.62, (feetY - floor) / H)), fit };
  }
  if (!S.tween) {
    const p = g.player, d = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.dir];
    const ch = g.objs.find((o) => o.type === 'chest' && o.x === p.x + d[0] && o.y === p.y + d[1]); // auch geöffnete Truhe (Inhalt/Deckel sichtbar)
    if (ch) {
      const hz = hudTopPx(now) - H * 0.015 - 0.5 * f; // Unterkante der Truhe knapp über der Leiste
      return { back: 0, hz: Math.max(0.28, Math.min(0.5, hz / H)) };
    }
  }
  return { back: 0, hz: 0.5 };
}
function updateViewAdjust(now) {
  const t = viewTarget(now), dt = Math.min(100, now - (S.vAt || now));
  S.vAt = now;
  if (S.vh == null) { S.vh = t.hz; S.vb = t.back; S.vfit = t.fit || 1; setCombatFit(S.vfit); return; }
  const k = Math.min(1, dt / 140);
  S.vh += (t.hz - S.vh) * k; S.vb += (t.back - S.vb) * k;
  S.vfit = (S.vfit || 1) + ((t.fit || 1) - (S.vfit || 1)) * k; setCombatFit(S.vfit);
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
  updateViewAdjust(now);
  const vc = viewCam();
  S.rc.render({ px: vc.x, py: vc.y, angle: vc.a, horizon: S.vh * H, grid, gw, gh, decals: buildDecals(S.lvl, S.game.objs, S.tex), sprites: buildSprites(S.game.objs, S.tex, now / 1000, S.cam.a, aliveMap(), { grid, gw, gh }), time: now / 1000 });
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
  $('#enemybox').addEventListener('click', onEnemyBox);
  $('#view').addEventListener('click', onViewTap);
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
  S.log.push(msg); (S.logTs = S.logTs || []).push(Date.now()); if (S.log.length > 60) { S.log.shift(); S.logTs.shift(); } renderLog(); }
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
      if (r.shop) { if (r.msg) say(r.msg); S.shopTalk = r.msg || null; S.held = []; S.shopTab = 'buy'; S.shopSure = null; openShop(r.shop, true); break; }
      say(r.msg); if (r.sfx) S.sfx.play(r.sfx);
      if (r.moved) { S.target.x = g.player.x + 0.5; S.target.y = g.player.y + 0.5; beginTween(); toast(r.msg, 5000); } // Stein gezogen: Gruppe steht ein Feld weiter hinten
      if (r.long) toast(r.msg, 8000);
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
  if (g.combat) { say('Im Kampf geht das nicht. Nutze unten Angriff, Verteidigen, Gegenstand oder Fähigkeit.'); S.held = []; return; }
  const r = tryMove(g, S.data, rel);
  if (r.moved) {
    S.sfx.play('step'); vib(8);
    S.target.x = g.player.x + 0.5; S.target.y = g.player.y + 0.5;
    beginTween();
    (r.events || []).forEach(onEvent);
    if (r.notes) { S.held = []; r.notes.forEach((t) => { say(t); toast(t, 5000); }); S.sfx.play('warn'); vib([40, 40, 40]); S.nextAllowed = performance.now() + 500; }
    if (r.encounter) startCombatUI(r.encounter, r.ambush);
  } else if (r.encounter) startCombatUI(r.encounter);
  else if (r.trapWarn) { S.held = []; S.queued = null; S.nextAllowed = performance.now() + 700; say(r.msg); toast(r.msg, 5000); S.sfx.play('warn'); }
  else if (rel === 'f' && r.blocker && ['door', 'chest', 'lever', 'gate', 'secret'].includes(r.blocker.type) && !r.msg) { // gegen Tür, Truhe, Hebel laufen = benutzen
    S.held = []; S.nextAllowed = performance.now() + 350;
    act('interact');
  } else if (rel === 'f' && r.wall && wallSignAhead(g, S.data) && wallSignAhead(g, S.data).x === g.player.x && wallSignAhead(g, S.data).y === g.player.y) { // gegen die Wand mit Tafel laufen = lesen
    S.held = []; S.nextAllowed = performance.now() + 350;
    act('interact');
  } else {
    S.sfx.play('bump'); vib(15);
    if (r.msg) say(r.msg);
    S.nextAllowed = performance.now() + 300;
  }
}
function doTurn(d) {
  const g = S.game;
  if (g.combat) { say('Im Kampf geht das nicht. Nutze unten Angriff, Verteidigen, Gegenstand oder Fähigkeit.'); S.held = []; return; }
  const r = turn(g, S.data, d);
  renderCompass();
  S.target.a += d * Math.PI / 2;
  beginTween(170);
  S.sfx.play('step');
  if (r.notes) { r.notes.forEach((t) => { say(t); toast(t, 5000); }); S.sfx.play('warn'); vib([40, 40, 40]); }
  if (r.encounter) startCombatUI(r.encounter, r.ambush);
}
async function onEvent(ev) {
  if (ev.type === 'stairs') {
    const r = changeArea(S.game, S.data, ev.id);
    if (!r.ok) { say(r.msg); return; }
    S.lvl = getLevel(S.data, S.game);
    S.rc.setPalette(S.data.palettes[S.lvl.palette]);
    S.held = []; S.queued = null;
    snapCam();
    say(r.msg);
    renderAll();
    introOnce('area:' + S.game.levelId, S.lvl.intro);
    await saveSlot('auto', true);
    return;
  }
  if (ev.type === 'mech') { // Stein geschoben / Druckplatte
    S.held = []; S.nextAllowed = performance.now() + 350;
    if (ev.msgs.length) { ev.msgs.forEach(say); toast(ev.msgs.join(' '), 5000); }
    S.sfx.play('door'); vib(25);
    renderAll();
    return;
  }
  if (ev.type === 'trap') { // Falle ausgelöst: Meldung groß, Erschütterung, Leisten neu
    S.held = []; S.queued = null; S.nextAllowed = performance.now() + 900;
    ev.msgs.forEach(say); toast(ev.msgs.join(' '), 7000);
    S.sfx.play('hurt'); vib([120, 60, 120]);
    renderAll();
    return;
  }
  if (ev.type === 'exitAgain') {
    const ex = S.game.objs.find((o) => o.id === ev.id) || {}, def = (S.lvl.objects || []).find((o) => o.id === ev.id) || {};
    const t = def.again || ex.again || 'Hier geht es nicht weiter.';
    say(t); toast(t); return;
  }
  if (ev.type !== 'exit') return;
  const exo = S.game.objs.find((o) => o.id === ev.id) || {};
  say(exo.say || 'Ein Runenstein glimmt auf. Das Zielgebiet des Prototyps ist erreicht.');
  S.held = [];
  await saveSlot('auto', true);
  openModal(`<h2>${esc(exo.title || 'Gebiet abgeschlossen')}</h2><p>${esc(exo.text || 'Du hast den Runenstein am Ende des Testgewölbes erreicht. Das ist das Ziel von Phase 1.')}</p><p class="muted">Autosave wurde angelegt (Gebietswechsel).</p><div class="acts"><button class="mb primary" data-m="close">Weiterspielen</button><button class="mb" data-m="title">Zum Titel</button></div>`, 'exit');
}

// ---------------------------------------------------------------- Kampf
function showEvent(title, text, ms = 3400) {
  const e = $('#event'); if (!e) return;
  e.querySelector('b').textContent = title; e.querySelector('span').textContent = text || '';
  e.hidden = false; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
  clearTimeout(showEvent.h); showEvent.h = setTimeout(() => { e.hidden = true; }, ms);
}
function introOnce(key, intro) { // Auftritt nur beim ersten Mal (Marke im Spielstand)
  const g = S.game;
  if (!intro || g.flags[key]) return false;
  g.flags[key] = true; showEvent(intro.title, intro.text); S.sfx.play('sting'); return true;
}
// Bossphasen groß ansagen (0.16.4: Wechsel ging in der Meldungszeile unter)
function announcePhases(c) {
  c.enemies.forEach((e, i) => {
    const en = S.data.enemies[e.kind], ph = e.phase || 0, key = i + ':' + ph;
    if (!en.phases || !ph || e.hp <= 0 || (S.phaseShown || {})[key]) return;
    (S.phaseShown = S.phaseShown || {})[key] = true;
    const p = en.phases[ph - 1];
    showEvent(p.name, p.msg || ''); S.sfx.play('sting'); vib([60, 40, 60]);
  });
}
function startCombatUI(enemyObj, ambush) {
  if (S.game.combat) return;
  S.held = []; S.queued = null;
  startCombat(S.game, S.data, enemyObj, { ambush: !!ambush });
  { // Die Gruppe wendet sich dem Gegner zu (0.16.12): bei Entdeckung von der Seite blickt sie in seine Richtung
    const nd = dirToward(S.game.player, enemyObj), od = S.game.player.dir, dd = ((nd - od + 5) % 4) - 1;
    if (dd !== 0) { S.game.player.dir = nd; S.target.a += dd * Math.PI / 2; beginTween(220); renderCompass(); }
  }
  S.clog = []; S.annKey = null; S.phaseShown = {};
  S.foe = 0;
  const name = S.game.combat.enemies.map((e) => e.name).join(', ');
  say(`${name} ${S.game.combat.enemies.length > 1 ? 'greifen' : 'greift'} ${ambush ? 'aus dem Hinterhalt ' : ''}an!`);
  if (!introOnce('intro:' + enemyObj.id, S.data.enemies[enemyObj.kind] && S.data.enemies[enemyObj.kind].intro)) S.sfx.play('miss');
  vib(40);
  renderAll();
  runEnemyTurns();
}
function showResult(r) {
  (r.msgs || []).forEach((m) => { const [t, dt] = m.split(SEP); say(t); clogAdd(dt ? `${t} [${dt}]` : t); if (/^Beute von /.test(t)) toast(t, 3600); });
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
  } finally { S.lock = false; S.coolUntil = performance.now() + TAP_COOL; renderAll(); }
}
const TAP_COOL = 450; // ms: schnelle Doppeltipps nach einer Aktion werden ignoriert
async function heroAct(a) {
  if (S.lock || !S.game.combat) return;
  if (performance.now() < (S.coolUntil || 0)) return;
  if (a.target == null && (a.type === 'attack' || a.type === 'ability' || a.type === 'spell')) a.target = S.foe;
  const r = heroAction(S.game, S.data, a);
  if (r.error) {
    const t = { 'full-hp': 'Dieser Held hat volle LP.', 'no-item': 'Kein Heiltrank mehr.', 'bad-target': 'Das Ziel kann nicht geheilt werden.', 'not-available': 'Noch nicht verfügbar.', 'no-mp': 'Zu wenig Mana oder Ausdauer.', 'no-ability': 'Dieser Held hat keine Fähigkeit.' }[r.error];
    if (t) say(t);
    return;
  }
  S.coolUntil = performance.now() + TAP_COOL;
  S.itemMode = false; S.abMode = false; S.spMode = false;
  showResult(r);
  renderAll();
  if (r.over === 'victory') { vib([40, 60, 40]); return; }
  await runEnemyTurns();
}
// Gegnerfigur im Bild antippen = Ziel (Bildschirmposition wie im Raycaster berechnet)
// Tippen auf eine Hinweistafel liest sie, wenn man höchstens 2 Felder davor steht (freie Sicht).
function readSignByTap(e) {
  const g = S.game;
  if (!g || g.combat || S.lock || !$('#modal').hidden) return false;
  const lvl = S.data.levels[g.levelId];
  const r = $('#view').getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const a = S.cam.a, dirX = Math.sin(a), dirY = -Math.cos(a), plX = Math.cos(a) * 0.8, plY = Math.sin(a) * 0.8;
  const inv = 1 / (plX * dirY - dirX * plY);
  const open = (x, y) => { const row = lvl.map[Math.floor(y)]; return row && row[Math.floor(x)] === '.'; };
  let best = null, bd = 1;
  for (const o of g.objs) {
    if (o.type !== 'sign' && o.type !== 'runestone') continue;
    const fd = o.type === 'sign' && o.face != null ? [[0, -1], [1, 0], [0, 1], [-1, 0]][o.face] : [0, 0]; // Wandtafel: Mitte der Wandfläche
    const sx = o.x + 0.5 + fd[0] * 0.45 - S.cam.x, sy = o.y + 0.5 + fd[1] * 0.45 - S.cam.y;
    const tX = inv * (dirY * sx - dirX * sy), tY = inv * (-plY * sx + plX * sy);
    if (tY <= 0.3 || tY > 2.6) continue;
    if (fd[0] * dirX + fd[1] * dirY < 0.5 && (fd[0] || fd[1])) continue; // Wandtafel nur, wenn man auf sie blickt
    const d = Math.abs(0.5 * (1 + tX / tY) - fx), tol = 0.06 + 0.25 / tY;
    if (d > tol || d >= bd) continue;
    let clear = true;
    const dist = Math.hypot(sx, sy), steps = Math.ceil(dist / 0.2);
    for (let i = 1; i < steps; i++) { const k = i / steps; if (!open(S.cam.x + sx * k, S.cam.y + sy * k)) { clear = false; break; } }
    if (clear) { best = o; bd = d; }
  }
  if (!best) return false;
  say(best.text); toast(best.text, 8000); if (S.sfx) S.sfx.play('ui');
  return true;
}

// Tippen auf Tür, Truhe, Hebel oder Gitter im Bild: steht das Objekt direkt vor dir, wird es benutzt, sonst „Geh näher heran.“
function tapUseByTap(e) {
  const g = S.game;
  if (!g || g.combat || S.lock || !$('#modal').hidden) return false;
  const lvl = S.data.levels[g.levelId];
  const r = $('#view').getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const a = S.cam.a, dirX = Math.sin(a), dirY = -Math.cos(a), plX = Math.cos(a) * 0.8, plY = Math.sin(a) * 0.8;
  const inv = 1 / (plX * dirY - dirX * plY);
  const open = (x, y) => { const row = lvl.map[Math.floor(y)]; return row && row[Math.floor(x)] === '.'; };
  const f = frontCell(g);
  let best = null, bt = 1e9;
  for (const o of g.objs) {
    const big = o.type === 'door' || o.type === 'gate' || o.type === 'secret' || (o.type === 'lever' && o.wall);
    if (!(big ? !o.open : o.type === 'chest' ? !o.open : o.type === 'lever' || o.type === 'merchant')) continue; // 0.16.5: Händlerin antippen = ansprechen
    const sx = o.x + 0.5 - S.cam.x, sy = o.y + 0.5 - S.cam.y;
    const tX = inv * (dirY * sx - dirX * sy), tY = inv * (-plY * sx + plX * sy);
    if (tY <= 0.3 || tY > 2.6 || tY >= bt) continue;
    const tol = big ? 0.31 / tY + 0.02 : o.type === 'merchant' ? 0.26 / tY + 0.03 : 0.16 / tY + 0.04;
    if (Math.abs(0.5 * (1 + tX / tY) - fx) > tol) continue;
    let clear = true;
    const dist = Math.hypot(sx, sy), steps = Math.ceil(dist / 0.2);
    for (let i = 1; i < steps - 1; i++) { const k = i / steps; if (!open(S.cam.x + sx * k, S.cam.y + sy * k)) { clear = false; break; } }
    if (clear) { best = o; bt = tY; }
  }
  if (!best) return false;
  if (best.x === f.x && best.y === f.y) act('interact'); else { say('Geh näher heran.'); toast('Geh näher heran.', 1500); }
  return true;
}

function onViewTap(e) {
  if (readSignByTap(e)) return;
  if (tapUseByTap(e)) return;
  const c = S.game && S.game.combat;
  if (!c || c.over) return;
  const alive = c.enemies.map((x, i) => i).filter((i) => c.enemies[i].hp > 0);
  if (alive.length < 2) return;
  const r = $('#view').getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const vc = viewCam(), a = vc.a, dirX = Math.sin(a), dirY = -Math.cos(a), plX = Math.cos(a) * 0.8, plY = Math.sin(a) * 0.8;
  const inv = 1 / (plX * dirY - dirX * plY);
  const byObj = {};
  alive.forEach((i) => { (byObj[c.enemies[i].objId] = byObj[c.enemies[i].objId] || []).push(i); });
  let best = -1, bd = 0.09; // höchstens ~9 % der Bildbreite Abstand
  for (const id of Object.keys(byObj)) {
    const o = S.game.objs.find((q) => String(q.id) === id);
    if (!o) continue;
    const list = byObj[id], n = list.length;
    list.forEach((ei, k) => {
      const { lat, dep } = groupOffsets(n, n > 1 && isNarrowAt(buildGrid(S.lvl, S.game.objs), o.x, o.y, a))[k];
      const sx = o.x + Math.cos(a) * lat + dirX * dep + 0.5 - vc.x, sy = o.y + Math.sin(a) * lat + dirY * dep + 0.5 - vc.y;
      const tX = inv * (dirY * sx - dirX * sy), tY = inv * (-plY * sx + plX * sy);
      if (tY <= 0.15) return;
      const d = Math.abs(0.5 * (1 + tX / tY) - fx);
      if (d < bd) { bd = d; best = ei; }
    });
  }
  if (best >= 0) { S.foe = best; renderCombat(); }
}
// Kombinationsangriff möglich? (aktueller Held gegen diesen Gegner, mit Angriff oder einer bekannten Fähigkeit)
function comboHint(cur, ei) {
  const c = S.game.combat;
  if (!cur || cur.side !== 'h' || !c.enemies[ei] || c.enemies[ei].hp <= 0) return '';
  const h = S.game.heroes[cur.idx];
  let cb = comboFor(S.game, S.data, cur.idx, ei), via = 'Angriff';
  if (!cb) for (const sp of knownSpells(S.data, h)) { if (sp.kind !== 'damage') continue; const x = comboFor(S.game, S.data, cur.idx, ei, sp); if (x) { cb = x; via = sp.name; break; } }
  return cb ? `<em class="combo">✚ Kombi: ${esc(cb.name)} (${esc(via)})</em>` : '';
}
function onEnemyBox(e) {
  const row = e.target.closest('[data-e]');
  if (!row || !S.game.combat) return;
  const i = +row.dataset.e;
  if (S.game.combat.enemies[i] && S.game.combat.enemies[i].hp > 0) { S.foe = i; renderCombat(); }
}
function onActionBar(e) {
  const b = e.target.closest('[data-c]');
  if (!b || b.disabled) return;
  S.sfx.unlock();
  const c = b.dataset.c;
  if (c === 'attack') heroAct({ type: 'attack' });
  else if (c === 'defend') heroAct({ type: 'defend' });
  else if (c === 'item') { S.itemMode = !S.itemMode; S.abMode = false; S.spMode = false; renderCombat(); }
  else if (c === 'spells') { S.spMode = !S.spMode; S.abMode = false; S.itemMode = false; renderCombat(); }
  else if (c.startsWith('sp:')) castKnown(+c.slice(3));
  else if (c === 'spell') useAbility();
  else if (c === 'sweep') heroAct({ type: 'sweep' });
  else if (c.startsWith('abheal:')) { S.abMode = false; S.spMode = false; heroAct({ ...spellAct(S.spSel), target: +c.slice(7) }); }
  else if (c === 'log') openCombatLog();
  else if (c.startsWith('heal:')) heroAct({ type: 'item', item: 'potion', hero: +c.slice(5) });
  else if (c.startsWith('cure:')) heroAct({ type: 'item', item: 'gegengift', hero: +c.slice(5) });
  else if (c.startsWith('throw:')) heroAct({ type: 'item', item: 'oelflasche', target: +c.slice(6) });
}
// Zauberliste des Helden am Zug (Index 0 = Berufsfähigkeit), siehe knownSpells in logic.js
function curKnown() {
  const a = currentActor(S.game);
  return a && a.side === 'h' ? knownSpells(S.data, S.game.heroes[a.idx]) : [];
}
function spellAct(i) {
  const sp = curKnown()[i];
  return i === 0 || !sp ? { type: 'ability' } : { type: 'spell', spell: sp.id };
}
function castKnown(i) {
  const a = currentActor(S.game), list = curKnown(), sp = list[i];
  if (!a || a.side !== 'h' || !sp) return;
  const h = S.game.heroes[a.idx];
  if (h.mp < sp.cost) { say(`Zu wenig ${S.data.classes[h.cls].res.name} (${h.mp}/${sp.cost}).`); return; }
  S.spSel = i;
  if (sp.kind === 'heal' && !sp.all) { S.abMode = true; S.itemMode = false; renderCombat(); }
  else { S.spMode = false; heroAct(spellAct(i)); }
}
// Knopf „Fähigkeit“/„Zauber“: bei mehreren Zaubern Liste auf-/zuklappen, sonst die einzige Fähigkeit wirken
function useAbility() {
  const list = curKnown();
  if (!list.length) return;
  if (list.length > 1) { S.spMode = !S.spMode; S.abMode = false; S.itemMode = false; renderCombat(); }
  else castKnown(0);
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
function renderCompass() { const d = $('#compass-dial'); if (d && S.game) { S.compassTurns = nearestTurns(S.compassTurns || 0, S.game.player.dir); d.style.transform = `rotate(${-S.compassTurns * 90}deg)`; d.style.setProperty('--cr', `${S.compassTurns * 90}deg`); } }
function nearestTurns(prev, dir) { const base = Math.round(prev / 4) * 4; let best = base + dir, bd = Math.abs(best - prev); for (const c of [base - 4 + dir, base + 4 + dir]) if (Math.abs(c - prev) < bd) { best = c; bd = Math.abs(c - prev); } return best; }
function renderAll() { renderCompass(); announceTurn(); renderParty(); renderCombat(); renderLog(); }
// 0.19.6 (Nutzer: „Der viele Text versperrt den Blick auf den Gang“): Außerhalb des Kampfs zeigt das Meldungsfeld höchstens 2 Meldungen,
// jede höchstens 2 Zeilen, und blendet sie nach 3–6 s aus (länger bei langem Text). Im Kampf bleibt alles wie bisher (die letzten 2). Das Protokoll bleibt vollständig.
function renderLog() {
  const box = $('#log'), combat = !!(S.game && S.game.combat);
  let items;
  if (combat) items = S.log.slice(-2);
  else {
    const now = Date.now(), n = S.log.length, ts = S.logTs || [];
    let next = Infinity; items = [];
    for (let i = Math.max(0, n - 2); i < n; i++) {
      const ttl = Math.min(6000, 3000 + 40 * S.log[i].length), left = ttl - (now - (ts[i] || 0));
      if (left > 0) { items.push(S.log[i]); next = Math.min(next, left); }
    }
    clearTimeout(renderLog.h);
    if (next < Infinity) renderLog.h = setTimeout(renderLog, next + 30);
  }
  box.classList.toggle('calm', !combat);
  box.innerHTML = items.map((m) => `<div>${esc(m)}</div>`).join('');
}
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
    const pc = document.createElement('div'); pc.className = 'pc'; // 0.19.1: Reihe steht unter dem Porträt, damit der Name nicht abgeschnitten wird (Gerätefoto: „Berenn · vo…“)
    const rw = document.createElement('small'); rw.textContent = h.row === 'front' ? 'vorn' : 'hinten';
    pc.append(makePortrait(h), rw); card.append(pc);
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    info.innerHTML = `<div class="nm">${esc(h.name)} ${stIcons('h', i)}</div><div class="bar${pct <= 30 ? ' low' : ''}"><i style="width:${pct}%"></i></div><div class="hp">${h.hp}/${h.maxHp} · <span class="${S.data.classes[h.cls].res.name === 'Mana' ? 'rs-mp' : 'rs-au'}">${h.mp}/${h.maxMp}</span></div>`; // 0.19.1: Einheit entfällt (wurde am Rand abgeschnitten) – Mana blau, Ausdauer gelb
    card.append(info);
    card.addEventListener('click', () => { // Kopf antippen = Heilziel wählen (nur wenn gerade ein Ziel für Heilzauber gefragt ist)
      const b = $('#actionbar') && $(`#actionbar [data-c="abheal:${i}"]`);
      if (b && !b.disabled) { b.click(); return; }
      partyTap(i);
    });
    box.append(card);
  });
}
// Kopf antippen = zaubern. Im Kampf: der Held am Zug öffnet seine Fähigkeit/Zauberliste. Außerhalb: Heilzauber dieses Helden wählen.
function partyTap(i) {
  const g = S.game;
  if (S.modal || !$('#modal').hidden) return;
  if (g.combat && !g.combat.over) {
    const a = currentActor(g), bar = $('#actionbar');
    if (a && a.side === 'h' && a.idx === i && bar && !bar.hidden && bar.querySelector('[data-c="spell"],[data-c="spells"]')) { S.sfx.unlock(); useAbility(); }
    return;
  }
  openHeroCast(i);
}
function openHeroCast(i) {
  const g = S.game, h = g.heroes[i];
  S.castHero = i;
  const sps = knownSpells(S.data, h).filter((s) => s.kind === 'heal'), rn = S.data.classes[h.cls].res.name;
  if (!sps.length) { openCharacter(); return; }
  if (h.hp <= 0) { toast(`${h.name} ist bewusstlos.`); return; }
  const hurt = (x) => x.hp > 0 && x.hp < x.maxHp;
  let html = `<h2 style="margin:0 0 4px">${esc(h.name)} zaubert</h2><p class="muted" style="margin:0 0 6px">${esc(rn)}: ${h.mp}/${h.maxMp}</p>`;
  for (const sp of sps) {
    const ok = h.mp >= sp.cost;
    html += `<h3 style="margin:8px 0 4px">${esc(sp.name)} · ${sp.cost} ${esc(rn)} · heilt ${sp.heal} LP${sp.all ? ' (alle)' : ''}</h3><div class="acts" style="margin-top:0">`;
    html += sp.all ? `<button class="mb" data-m="oc:${sp.id}:-1" ${ok && g.heroes.some(hurt) ? '' : 'disabled'}>Auf die ganze Gruppe wirken</button>`
      : g.heroes.map((t, k) => `<button class="mb headbtn" data-m="oc:${sp.id}:${k}" ${ok && hurt(t) ? '' : 'disabled'}><img src="${makePortrait(t).toDataURL()}" alt=""><span>${esc(t.name)}<br>${t.hp}/${t.maxHp}</span></button>`).join('');
    html += '</div>';
  }
  html += `<div class="acts">${closeBtn}</div>`;
  openModal(html, 'cast');
}
function aliveMap() {
  const c = S.game && S.game.combat;
  if (!c) return null;
  const m = {};
  for (const e of c.enemies) { (m[e.objId] = m[e.objId] || []); if (e.hp > 0) m[e.objId].push(e.kind); } // je Gruppe: Arten der noch lebenden Gegner, damit das richtige Bild bleibt
  return m;
}
function renderCombat() {
  const c = S.game.combat, eb = $('#enemybox'), ab = $('#actionbar');
  if (!c) { eb.hidden = true; ab.hidden = true; return; }
  eb.hidden = false;
  announcePhases(c);
  const cur = c.over ? null : currentActor(S.game);
  const curName = cur ? (cur.side === 'h' ? S.game.heroes[cur.idx].name : c.enemies[cur.idx].name) : '';
  if (!c.enemies[S.foe] || c.enemies[S.foe].hp <= 0) S.foe = Math.max(0, c.enemies.findIndex((e) => e.hp > 0));
  const multi = c.enemies.filter((e) => e.hp > 0).length > 1;
  const heavyNow = !c.over && c.enemies.filter((e) => e.hp > 0 && e.intent === 'heavy');
  const warnKey = heavyNow.length ? c.round + ':' + heavyNow.map((e) => e.name).join(',') : null;
  if (warnKey && S.warnKey !== warnKey) { S.sfx.play('warn'); vib([90, 60, 90]); }
  S.warnKey = warnKey;
  const warnBar = heavyNow.length ? `<div class="heavywarn">⚠ ${esc(heavyNow[0].name)}: ${esc(enemyOf(S.data, heavyNow[0]).heavy.name)}! Jetzt verteidigen</div>` : '';
  eb.innerHTML = warnBar + (cur ? `<div class="turnbar ${cur.side === 'h' ? 'hero' : 'foe'}">${cur.side === 'h' ? 'Am Zug: ' + esc(curName) + (multi ? ' · Gegner antippen = Ziel' : '') : 'Gegner am Zug: ' + esc(curName)}</div>` : '') + c.enemies.map((e) => {
    const pct = Math.round(100 * e.hp / e.maxHp);
    const ei = c.enemies.indexOf(e);
    return `<div class="en${e.hp <= 0 ? ' dead' : ''}${multi && ei === S.foe && e.hp > 0 ? ' sel' : ''}" data-e="${ei}"><b>${esc(e.name)} ${stIcons('e', ei)}</b><span>${e.hp}/${e.maxHp} LP</span><div class="bar${pct <= 30 ? ' low' : ''}"><i style="width:${pct}%"></i></div>${e.intent === 'heavy' ? '<em class="warn">⚠ Schwerer Schlag</em>' : ''}${comboHint(cur, ei)}</div>`;
  }).join('') + `<div class="order">Runde ${c.round}: ` + c.order.map((o, i) => {
    const nm = o.side === 'h' ? S.game.heroes[o.idx].name : c.enemies[o.idx].name;
    return `<span class="${(i === c.pos ? 'now' : i < c.pos ? 'done' : '') + (o.side === 'e' ? ' foe' : '')}">${esc(nm)}</span>`;
  }).join('') + '</div>';
  ab.hidden = false;
  const a = currentActor(S.game);
  if (c.over || !a) { ab.hidden = true; return; }
  if (a.side !== 'h' || S.lock) { ab.innerHTML = `<div class="wait">${a.side === 'h' ? esc(S.game.heroes[a.idx].name) + ' ist gleich dran …' : 'Gegner ist am Zug …'}</div><button class="ab" data-c="log" style="flex:0 0 auto">Protokoll</button>`; return; }
  const potions = (S.game.inv.potion || 0) + (S.game.inv.gegengift || 0) + (S.game.inv.oelflasche || 0);
  const ch = S.game.heroes[a.idx], cab = S.data.classes[ch.cls].ability, cres = S.data.classes[ch.cls].res;
  const inv = S.game.inv, itemRows = [];
  { const row = (n, mk) => { const bs = mk(); if (n > 0 && bs.some((x) => x.ok)) itemRows.push(bs.map((x) => `<button class="ab" data-c="${x.c}" ${x.ok ? '' : 'disabled'}>${x.t}</button>`).join('')); }; // nur Zeilen zeigen, in denen etwas geht
    const giver = !!S.data.classes[ch.cls].potionGiver; // Alchemist (0.17.0): Tränke an alle Helden
    row(inv.potion, () => giver ? S.game.heroes.map((h, i) => ({ c: `heal:${i}`, ok: h.hp > 0 && h.hp < h.maxHp, t: `Heiltrank (${inv.potion}) → ${esc(h.name)}` })) : [{ c: `heal:${a.idx}`, ok: ch.hp > 0 && ch.hp < ch.maxHp, t: `Heiltrank (${inv.potion}) trinken` }]);
    row(inv.gegengift, () => giver ? S.game.heroes.map((h, i) => ({ c: `cure:${i}`, ok: h.hp > 0 && !!statusOf(S.game, 'h', i).poison, t: `Gegengift (${inv.gegengift}) → ${esc(h.name)}` })) : [{ c: `cure:${a.idx}`, ok: ch.hp > 0 && !!statusOf(S.game, 'h', a.idx).poison, t: `Gegengift (${inv.gegengift}) nehmen` }]);
    row(inv.oelflasche, () => S.game.combat.enemies.map((e, i) => ({ c: `throw:${i}`, ok: e.hp > 0, t: `Ölflasche (${inv.oelflasche}) → ${esc(e.name)}` }))); }
  const known = knownSpells(S.data, ch);
  const abBtn = known.length > 1 ? `<button class="ab" data-c="spells">✦ Zauber (${known.length})${S.spMode ? ' ▴' : ' ▾'}</button>` : cab ? `<button class="ab" data-c="sp:0" ${ch.mp >= cab.cost ? '' : 'disabled'}>✦ ${esc(cab.name)} (${cab.cost} ${esc(cres.name)})</button>` : '';
  let html = `<button class="ab" data-c="attack">⚔ Angriff</button><button class="ab${heavyNow.length ? ' pulse' : ''}" data-c="defend">⛨ Verteidigen</button><button class="ab" data-c="item" ${potions ? '' : 'disabled'}>Gegenstand (${potions})</button>${abBtn}${multi ? `<button class="ab" data-c="sweep">⚔ Alle (${SWEEP_MULT} %)</button>` : ''}<button class="ab" data-c="log">Protokoll</button>`;
  if (S.itemMode) {
    html += itemRows.length ? itemRows.map((r) => `<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">${r}</div>`).join('') : `<div class="wait" style="flex:1 0 100%">${esc(ch.name)} hat volle LP und kein Gift. Heiltrank und Gegengift wirkt nur auf den, der dran ist (Ausnahme: Alchemist).</div>`;
  }
  if (S.spMode && known.length > 1) {
    html += '<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">' + known.map((sp, i) =>
      `<button class="ab" data-c="sp:${i}" ${ch.mp >= sp.cost ? '' : 'disabled'}>${esc(sp.name)} (${sp.cost} ${esc(cres.name)})${sp.all ? ' · alle' : ''}</button>`).join('') + '</div>';
  }
  const sel = known[S.spSel];
  if (S.abMode && sel && sel.kind === 'heal' && !sel.all) {
    html += '<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">' + S.game.heroes.map((h, i) =>
      `<button class="ab" data-c="abheal:${i}" ${h.hp > 0 && (h.hp < h.maxHp || canCleanse(sel, statusOf(S.game, 'h', i))) ? '' : 'disabled'}>${esc(sel.name)} → ${esc(h.name)}</button>`).join('') + '</div>';
  }
  ab.innerHTML = html;
}

// ---------------------------------------------------------------- Dialoge
function openModal(html, kind = 'generic') {
  $('#modal-box').innerHTML = html;
  $('#modal-box').dataset.kind = kind; // z. B. breiteres Kartenfenster (CSS)
  $('#modal').hidden = false;
  S.modal = kind;
  S.held = [];
  $('#modal-box').scrollTop = 0;
}
function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; S.modal = null; S.invUse = null; S.invEquip = null; S.invSell = null; S.shopId = null; S.shopSure = null; }
const closeBtn = '<button class="mb" data-m="close">Schließen</button>';

function openMenu() {
  openModal(`<h2>Menü</h2><div class="acts" style="flex-direction:column;align-items:stretch">
    <button class="mb primary" data-m="close">Weiterspielen</button>
    <button class="mb" data-m="map">Karte</button>
    <button class="mb" data-m="rest">Rasten (Proviant: ${S.game ? (S.game.inv.ration || 0) : 0})</button>
    <button class="mb" data-m="bestiary">Bestiarium</button>
    <button class="mb" data-m="errlog">Fehlerlog (${ERR.list.length})</button>
    <button class="mb" data-m="save">Speichern</button>
    <button class="mb" data-m="load">Laden</button>
    <button class="mb" data-m="export">Spielstand exportieren (Datei)</button>
    <button class="mb" data-m="import">Spielstand importieren (Datei)</button>
    <button class="mb" data-m="settings">Einstellungen</button>
    <button class="mb" data-m="help">Steuerung &amp; Info</button>
    <button class="mb" data-m="title">Zum Titelbild</button>${S.settings.debug ? '<button class="mb" data-m="debug">Debug</button>' : ''}</div>`, 'menu');
}
function helpHtml() {
  return `<h2>Steuerung &amp; Info</h2>
  <h3>Links: Bewegung</h3><p>↑ Vor, ↓ Zurück, ← → seitwärts, ↶ ↷ um 90° drehen. Gedrückt halten wiederholt die Bewegung.</p>
  <h3>Rechts: Aktionen</h3><p>◉ Interagieren (Türen, Truhen, Hebel, Gegner ansprechen; Türen und Truhen gehen auch auf, wenn du gegen sie läufst oder sie direkt vor dir antippst), ⚔ Angriff, ✦ Fähigkeit (nur im Kampf, kostet Mana oder Ausdauer). Bei mehreren Gegnern: Gegner antippen = Ziel wählen, „Alle“ trifft jeden Gegner mit 60 % Schaden, ▣ Inventar (Heldenleiste: LP · Mana in Blau bzw. Ausdauer in Gelb), ☻ Charakter (dort „Talente“: ab Stufe 2 gibt jede Stufe einen Punkt; drei Zweige je Beruf, außerdem neue Fähigkeiten).</p>
  <h3>Kombinationsangriffe</h3><p>Automatisch, wenn ein Held einen Gegner trifft, der einen passenden Status von einem <b>anderen</b> Helden trägt. Im Kampf zeigt „✚ Kombi“ am Gegner, was gerade möglich ist.</p>${S.data.combos.map((c) => `<p class="muted" style="margin:2px 0">✚ <b>${esc(c.name)}</b>: ${esc(c.desc)}</p>`).join('')}
  <h3>Fallen</h3><p>Fallen verraten sich durch eine feine Spur am Boden oder eine Warnung an der Wand. ◉ auf das Feld vor dir untersucht den Boden, ein zweites ◉ entschärft die Falle. Helden mit Fallen-Talent (Schurke, Waldläufer, Alchemist) bemerken und entschärfen sie eher. Ausgelöste Fallen kosten LP, töten aber niemanden.</p>
  <h3>Steine und Druckplatten</h3><p>Schwere Steine lassen sich schieben (von vorn dagegenlaufen) und ziehen (◉, die Gruppe geht dabei einen Schritt zurück). Eine Druckplatte hält ein Gitter nur offen, solange etwas Schweres auf ihr liegt.</p>
  <h3>Menü (☰ rechts unten)</h3><p>Karte (auf eine erkundete Zelle tippen setzt oder entfernt eine Notiz), Rasten, Speichern, Laden, Einstellungen. Oben rechts zeigt der Kompass die Blickrichtung.</p>
  <h3>Kampf</h3><p>Rundenbasiert. Die Zugreihenfolge steht oben. Hinterreihe-Helden ohne Fernkampf treffen nur halb so hart.</p>
  <h3>Rast</h3><p>Menü → Rasten (oder im Inventar beim Proviant). Mit Proviant erholt sich die Gruppe vollständig, auch Bewusstlose. Ohne Proviant nur zu 30 %. Nicht im Kampf, nicht wenn ein Gegner in Sichtweite ist, und erst ab 10 Schritten Abstand zum nächsten Gegner (Weg zählt, nicht Luftlinie).</p>
  <h3>Weg</h3><p>Vom Testgewölbe führt die Treppe im Westen hinauf zur Siedlung am Moorrand. Dort beginnt der Weg durchs Moor. Runensteine lassen sich lesen (antippen oder ◉).</p>
  <p class="muted">Prototyp Phase 2 (in Arbeit) · Version ${VERSION} · Autor: eldermoor-dev. Alle Grafiken und Geräusche entstehen im Spiel selbst (prozedural). Keine Musik.</p>
  <div class="acts">${closeBtn}</div>`;
}
function openErrorLog() {
  const rows = ERR.list.slice().reverse().map((e) => `<div style="border-bottom:1px solid #3a2f20;padding:6px 0"><div class="muted" style="font-size:.72em">${esc(new Date(e.t).toLocaleString('de-DE'))} · v${esc(e.v)} · ${esc(e.where)}${e.n > 1 ? ` · ${e.n}×` : ''}</div><div>${esc(e.msg)}</div>${e.stack ? `<div class="muted" style="font-size:.66em;white-space:pre-wrap;word-break:break-all">${esc(e.stack.split('\n').slice(0, 3).join('\n'))}</div>` : ''}</div>`).join('');
  openModal(`<h2>Fehlerlog</h2><p class="muted">Hier landen Fehler, die das Spiel selbst bemerkt. „Kopieren“ legt den Text in die Zwischenablage, zum Einfügen in eine Nachricht.</p>${rows || '<p>Keine Fehler aufgezeichnet.</p>'}<div class="acts"><button class="mb" data-m="errcopy" ${ERR.list.length ? '' : 'disabled'}>Kopieren</button><button class="mb" data-m="errclear" ${ERR.list.length ? '' : 'disabled'}>Leeren</button><button class="mb" data-m="menu">Zurück</button></div>`, 'errlog');
}
async function copyErrorLog() {
  const text = formatErrorLog(ERR.list, `Version ${VERSION}, ${navigator.userAgent}`);
  try { await navigator.clipboard.writeText(text); toast('Fehlerlog kopiert.'); return; } catch { /* Rückfall */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    document.body.append(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? 'Fehlerlog kopiert.' : 'Kopieren nicht möglich.');
  } catch { toast('Kopieren nicht möglich.'); }
}
function speechHtml(t) { // Sprechender Charakter: Name + große, mittige Rede
  const m = /^([^:]{1,24}):\s*([\s\S]*)$/.exec(t || '');
  return `<div class="speech">${m ? `<b>${esc(m[1])}</b>` : ''}<p>„${esc(m ? m[2] : t)}“</p></div>`;
}
function openShop(shopId, greet) {
  const g = S.game, d = S.data, sh = d.shops[shopId];
  S.shopId = shopId;
  const tab = S.shopTab || 'buy';
  if (greet && S.shopTalk) { // erstes Ansprechen: Rede groß und mittig, erst nach „Weiter“ kommen die Waren
    openModal(`${speechHtml(S.shopTalk)}<p class="muted" style="text-align:center">${esc(sh.greeting)}</p><div class="acts" style="justify-content:center"><button class="mb primary" data-m="shopgo">Weiter</button></div>`, 'shop');
    return;
  }
  let html = `<h2>${esc(sh.name)}</h2>${greet ? `<p class="muted">${esc(sh.greeting)}</p>` : ''}<p>Gold: <b>${g.gold}</b></p>
    <div class="acts" style="margin-top:0"><button class="mb${tab === 'buy' ? ' primary' : ''}" data-m="shopbuy">Kaufen</button><button class="mb${tab === 'sell' ? ' primary' : ''}" data-m="shopsellTab">Verkaufen</button></div>`;
  if (tab === 'buy') {
    html += shopStock(d, shopId).map((e) => {
      const it = d.items[e.item], p = buyPrice(g, d, e.item), have = g.inv[e.item] || 0;
      return `<div class="row nw"><div><b>${itemIcon(e.item, it)}${esc(it.name)}</b>${have ? ` <span class="muted">(im Beutel: ${have})</span>` : ''}<div class="muted">${esc(it.desc)}</div></div><button class="mb" data-m="buy:${e.item}" ${g.gold >= p ? '' : 'disabled'}>Kaufen (${p} G)</button></div>`;
    }).join('');
  } else {
    const rows = Object.entries(g.inv).filter(([id, n]) => n > 0 && sellPrice(g, d, id) != null);
    html += rows.length ? rows.map(([id, n]) => {
      const it = itemDef(g, d, id), p = sellPrice(g, d, id), sure = S.shopSure === id;
      return `<div class="row nw"><div><b>${itemIcon(id, it)}${qTag(id, it)}</b> × ${n}<div class="muted">${esc(it.desc)}</div></div><button class="mb${sure ? ' primary' : ''}" data-m="shopsell:${id}">${sure ? 'Wirklich verkaufen' : 'Verkaufen'} (${p} G)</button></div>`;
    }).join('') : '<p class="muted">Du hast nichts, was sie kaufen würde. Getragene Ausrüstung musst du erst ablegen.</p>';
  }
  html += `<div class="acts">${closeBtn}</div>`;
  openModal(html, 'shop');
}
function openBestiary() {
  const g = S.game, d = S.data, b = g.bestiary || {};
  const ids = Object.keys(d.enemies), known = ids.filter((k) => b[k] && b[k].seen > 0);
  const BX = 'border:1px solid #5a4a30;border-radius:5px;padding:8px;margin:6px 0';
  const cards = ids.map((k) => {
    const e = d.enemies[k], r = b[k];
    if (!r || !r.seen) return `<div style="${BX}"><b>???</b><div class="muted">Noch nicht begegnet.</div></div>`;
    const L = [`Begegnet: ${r.seen}× · Besiegt: ${r.won}×`];
    if (r.won > 0) L.push(`LP ${e.hp} · Angriff ${e.atk} · Verteidigung ${e.def} · Beute ${e.gold || 0} Gold, ${e.xp || 0} EP`);
    else L.push('Werte unbekannt (erst nach dem ersten Sieg).');
    if (r.heavy && e.heavy) L.push(`Besonderer Angriff: ${esc(e.heavy.name)} (alle ${e.heavy.every} Züge, vorher angekündigt)`);
    if (r.cast && e.cast) L.push(`Zaubert: ${e.cast.map((c) => esc(c.name)).join(', ')}`);
    if (r.onHit && e.onHit) L.push(`Trefferwirkung: ${esc(d.statuses[e.onHit.status].name)} (${e.onHit.chance} %)`);
    const rs = Object.keys(r.resist || {}).map((el) => { const v = (e.resist || {})[el] || 0; return v >= 100 ? `immun gegen ${esc(d.elements[el].name)}` : `${v > 0 ? 'resistent gegen' : 'anfällig für'} ${esc(d.elements[el].name)} (${v > 0 ? '−' : '+'}${Math.abs(v)} % Schaden)`; });
    if (rs.length) L.push('Elemente: ' + rs.join(', '));
    if (e.phases) L.push(`Phasen erreicht: ${r.phase || 0} von ${e.phases.length}${(r.phase || 0) > 0 ? ' – ' + e.phases.slice(0, r.phase).map((p) => esc(p.name)).join(', ') : ''}`);
    return `<div style="${BX}"><b>${esc(e.name)}${e.boss ? ' · Boss' : ''}</b>${L.map((t) => `<div class="muted">${t}</div>`).join('')}</div>`;
  }).join('');
  openModal(`<h2>Bestiarium</h2><p class="muted">Entdeckt: ${known.length} von ${ids.length}. Werte, Elemente und Besonderheiten werden im Kampf aufgedeckt.</p>${cards}<div class="acts"><button class="mb" data-m="menu">Zurück</button></div>`, 'bestiary');
}
function openHelp() { openModal(helpHtml(), 'help'); }

// Symbol vor dem Gegenstandsnamen (Waffe, Rüstung, Trank, Gegengift, Öl, Proviant, Schlüssel …)
function itemIcon(id, it) {
  const ic = it.icon || (it.kind === 'equip' ? (it.slot === 'armor' ? '🛡' : '⚔') : it.kind === 'quest' ? '🗝' : it.heal ? '🧪' : it.cure ? '💧' : it.throw ? '🔥' : it.kind === 'supply' ? '🍞' : '');
  return ic ? `<span class="ic">${ic}</span> ` : '';
}
// Name mit Qualitätsfarbe, z. B. „Eisenschwert des Wolfs [Selten]“
function qTag(id, it) {
  const q = qualityOf(S.game, S.data, id);
  if (!q || q.id === 'common') return esc(it.name);
  return `<span style="color:${q.color}">${esc(it.name)} [${esc(q.name)}]</span>`;
}
// Änderung der Werte gegenüber der aktuell getragenen Ausrüstung im selben Platz, z. B. „ · Angriff +1“
function gearDelta(h, id) {
  const g = S.game, it = itemDef(g, S.data, id), cur = h.equip && h.equip[it.slot] ? itemDef(g, S.data, h.equip[it.slot]) : null;
  const d = [['atk', 'Angriff'], ['def', 'Verteidigung'], ['init', 'Init.']].map(([k, n]) => [(it[k] || 0) - (cur ? (cur[k] || 0) : 0), n]).filter(([v]) => v !== 0);
  return d.length ? ' · ' + d.map(([v, n]) => `${n} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(', ') : ' · gleich';
}
function openInventory() {
  const g = S.game, d = S.data;
  const rank = { consumable: 0, supply: 1, quest: 2, equip: 3 };
  const items = Object.entries(g.inv).filter(([, n]) => n > 0).sort((a, b) => (rank[itemDef(g, d, a[0]).kind] - rank[itemDef(g, d, b[0]).kind]) || itemDef(g, d, a[0]).name.localeCompare(itemDef(g, d, b[0]).name, 'de'));
  let html = `<h2>Inventar</h2><p>Gold: <b>${g.gold}</b></p>`;
  html += items.length ? items.map(([id, n]) => {
    const it = itemDef(g, d, id);
    const use = it.kind === 'consumable' && it.heal && !g.combat ? `<button class="mb" data-m="use:${id}">Benutzen</button>` : it.kind === 'supply' && !g.combat ? '<button class="mb" data-m="rest">Rasten</button>' : it.kind === 'equip' && !g.combat ? `<button class="mb" data-m="eqsel:${id}">Ausrüsten</button>` : '';
    return `<div class="row nw${S.invEquip === id ? ' sel' : ''}"><div><b>${itemIcon(id, it)}${qTag(id, it)}</b>${it.kind === 'quest' ? ' <span class="muted">(Questgegenstand)</span>' : ` × ${n}`}<div class="muted">${esc(it.desc)}</div></div>${use}</div>`;
  }).join('') : '<p class="muted">Nichts dabei.</p>';
  if (S.invEquip && itemDef(g, d, S.invEquip) && (g.inv[S.invEquip] || 0) > 0) {
    html += `<h3>${qTag(S.invEquip, itemDef(g, d, S.invEquip))} an wen?</h3><div class="acts">` + g.heroes.map((h, i) =>
      `<button class="mb" data-m="eq:${i}" ${canEquip(d, h, S.invEquip, g) ? '' : 'disabled'}>${esc(h.name)} (${esc(h.role)})${canEquip(d, h, S.invEquip, g) ? esc(gearDelta(h, S.invEquip)) : ''}</button>`).join('') + '</div>';
  }
  if (S.invUse) {
    html += `<h3>${esc(itemDef(g, d, S.invUse).name)} an wem anwenden?</h3><div class="acts">` + g.heroes.map((h, i) =>
      `<button class="mb headbtn" data-m="heal:${i}" ${h.hp > 0 && h.hp < h.maxHp ? '' : 'disabled'}><img src="${makePortrait(h).toDataURL()}" alt=""><span>${esc(h.name)}<br>${h.hp}/${h.maxHp}</span></button>`).join('') + '</div>';
  }
  if (g.combat) html += '<p class="muted">Im Kampf: Gegenstände über den Knopf „Gegenstand“ benutzen.</p>';
  else if (items.some(([id]) => sellPrice(g, d, id) != null)) html += '<p class="muted">Verkaufen kannst du bei einer Händlerin.</p>';
  html += `<div class="acts">${closeBtn}</div>`;
  openModal(html, 'inventory');
}
function xpLine(h) {
  const need = xpForNext(S.data, h);
  return need == null ? `EP ${h.xp} · Höchststufe` : `EP ${h.xp} / ${need}`;
}
function runeTxt(sp) {
  return (sp.runes || []).map((r) => (S.data.runes[r] ? S.data.runes[r].glyph : '')).join('') + ((sp.runes || []).length ? ' ' + sp.runes.map((r) => S.data.runes[r].name).join('·') : '');
}
function charAbility(h) {
  const c = S.data.classes[h.cls];
  if (!c.ability) return '';
  const known = knownSpells(S.data, h);
  const el = (sp) => (sp.element ? ` · ${esc(S.data.elements[sp.element].name)}` : '');
  const lines = known.map((sp) => `<div style="margin-top:3px">✦ ${esc(sp.name)} (${sp.cost})${el(sp)}${sp.all ? ' · alle' : ''}</div><div class="muted" style="font-size:.72em">${esc(runeTxt(sp))}</div><div class="muted" style="font-size:.72em">${esc(sp.desc)}</div>`).join('');
  const next = (c.spells || []).filter((s) => s.level > h.level && S.data.spells[s.id]).sort((p, q) => p.level - q.level)[0];
  return `<div>${esc(c.res.name)} ${h.mp}/${h.maxMp}</div>${lines}${next ? `<div class="muted" style="font-size:.72em;margin-top:3px">Stufe ${next.level}: ${esc(S.data.spells[next.id].name)}</div>` : ''}`;
}
const bonusTxt = (n) => (n ? ` <span class="muted">(+${n})</span>` : '');
function gearLines(h, i) {
  return ['weapon', 'armor'].map((s) => {
    const id = h.equip && h.equip[s], it = id && itemDef(S.game, S.data, id);
    return `<div class="muted">${S.data.slots[s]}: ${it ? qTag(id, it) + ` <button class="mb" data-m="uneq:${i}:${s}" style="padding:1px 6px;min-height:0">Ablegen</button>` : '–'}</div>`;
  }).join('');
}
function openCharacter() {
  const g = S.game;
  openModal(`<h2>Charaktere</h2><div class="grid4">` + g.heroes.map((h, i) =>
    `<div class="hc"><b>${esc(h.name)}</b><div class="muted">${esc(raceName(h.race))} · ${esc(h.role)}</div><div class="muted">${h.row === 'front' ? 'Vorderreihe' : 'Hinterreihe'}</div>
    <div>Stufe ${h.level}</div><div class="muted">${xpLine(h)}</div>
    <div>LP ${h.hp}/${h.maxHp}</div><div>Angriff ${h.atk}${bonusTxt(gearBonus(S.data, h, S.game).atk + talentSum(S.data, h, 'atk'))}</div><div>Verteidigung ${h.def}${bonusTxt(gearBonus(S.data, h, S.game).def + talentSum(S.data, h, 'def'))}</div><div>Initiative ${h.init}${bonusTxt(gearBonus(S.data, h, S.game).init + talentSum(S.data, h, 'init'))}</div><div>${h.ranged ? 'Fernkampf' : 'Nahkampf'}</div>${gearLines(h, i)}${charAbility(h)}<button class="mb" data-m="tal:${i}" style="margin-top:4px">Talente${talentPoints(S.data, h) > 0 ? ` (${talentPoints(S.data, h)} frei)` : ''}</button></div>`).join('') +
    `</div><p class="muted">Ausrüstung anlegen: Inventar → Gegenstand → „Ausrüsten“. Ablegen hier.</p><div class="acts">${closeBtn}</div>`, 'character');
}


// Talente (0.17.0): drei Zweige je Beruf, vier Einträge von oben nach unten. Tippen = lernen (wenn möglich).
function openTalents(i) {
  const g = S.game, h = g.heroes[i], d = S.data;
  S.talHero = i;
  const free = talentPoints(d, h);
  const tabs = g.heroes.map((x, k) => `<button class="mb${k === i ? ' sel' : ''}" data-m="tal:${k}" style="padding:2px 8px;min-height:0">${esc(x.name)}${talentPoints(d, x) > 0 ? ' ●' : ''}</button>`).join('');
  const why = { vorher: 'erst das Talent davor', stufe: `ab Stufe ${d.talents.gateLevel}`, punkte: 'zu wenige Punkte' };
  const cols = talentBranches(d, h.cls).map((b) => `<div class="tcol"><b>${esc(b.name)}</b><div class="muted" style="font-size:.72em">${esc(b.desc)}</div>` + talentNodesOf(d, h, b).map((n) => {
    const r = canLearnTalent(d, h, n.id), has = h.tal && h.tal[n.id];
    const st = has ? '✓ gelernt' : r.ok ? `Lernen (${n.cost} ${n.cost === 1 ? 'Punkt' : 'Punkte'})` : `${n.cost} P · ${why[r.why] || ''}`;
    return `<button class="tnode${has ? ' got' : r.ok ? ' can' : ''}" data-m="tl:${i}:${n.id}" ${has || !r.ok ? 'disabled' : ''}><b>${esc(n.name)}</b><span>${esc(n.desc)}</span><em>${esc(st)}</em></button>`;
  }).join('') + '</div>').join('');
  openModal(`<h2 style="margin:0 0 4px">Talente – ${esc(h.name)} (${esc(h.role)}, Stufe ${h.level})</h2><div class="acts" style="justify-content:flex-start;flex-wrap:wrap">${tabs}<span style="flex:1"></span><button class="mb" data-m="trs:${i}" style="padding:2px 8px;min-height:0" ${h.tal && Object.keys(h.tal).length ? '' : 'disabled'}>Zurücksetzen (${respecCost(d, h)} Gold)</button><button class="mb" data-m="char" style="padding:2px 8px;min-height:0">Zurück</button><button class="mb" data-m="close" style="padding:2px 8px;min-height:0">Schließen</button></div>
    <p style="margin:4px 0">Freie Talentpunkte: <b>${free}</b> · 1 Punkt je Stufe, Kosten 1 / 1 / 2 / 2, das 4. Talent ab Stufe ${d.talents.gateLevel}.</p><div class="tgrid">${cols}</div>`, 'talents');
}
const talentNodesOf = (d, h, b) => b.nodes.map((n, ni) => ({ ...n, ni, cost: (d.talents.cost || [1, 1, 2, 2])[ni] || 1 }));

function openMap() {
  const w = S.lvl.map[0].length, h = S.lvl.map.length;
  const cs = 3 * Math.max(8, Math.min(Math.floor(560 / w), Math.floor(230 / h))); // 0.19.5: dreifache Auflösung, damit Zoomen scharf bleibt
  openModal(`<h2 style="margin:0 0 4px">Karte – ${esc(S.lvl.name)}</h2><div class="mapwrap"><div id="mapvp"><canvas id="mapcv" width="${cs * w}" height="${cs * h}"></canvas></div>${mapLegendHtml()}</div>
  <div class="acts mapbar"><span class="muted">Blick: ${DIR_NAMES[S.game.player.dir]} · Tippen = Notiz ◆ · 2 Finger = Zoom, Ziehen = Verschieben</span>${closeBtn}</div>`, 'map');
  paintLegend();
  const cv = $('#mapcv'), vp = $('#mapvp');
  cv.dataset.cs = cs;
  drawMap();
  fitMapView(cv, vp, w, h, cs);
  const mz = initMapZoom(cv, vp);
  cv.addEventListener('click', (e) => {
    if (mz.dragged()) return; // Ziehen/Zoomen ist keine Notiz
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
// Kartengröße auf den freien Platz einpassen (Legende rechts oder, auf schmalen Bildschirmen, darunter).
function fitMapView(cv, vp, w, h, cs) {
  const par = vp.parentElement, leg = par.querySelector('.mapleg');
  const maxW = Math.max(120, par.clientWidth - (leg && window.innerWidth >= 520 ? leg.offsetWidth + 12 : 0));
  const maxH = Math.max(120, window.innerHeight - 120);
  const f = Math.min(maxW / (cs * w), maxH / (cs * h));
  const dw = Math.floor(cs * w * f), dh = Math.floor(cs * h * f);
  cv.style.width = dw + 'px'; cv.style.height = dh + 'px'; vp.style.width = dw + 'px'; vp.style.height = dh + 'px';
}
// Zoom (zwei Finger, Mausrad) und Verschieben (Ziehen) der Karte; reine Anzeige, ändert nichts am Spielstand.
function initMapZoom(cv, vp) {
  let k = 1, tx = 0, ty = 0, lastDrag = 0, moved = false, start = null;
  const pts = new Map();
  const apply = () => {
    k = Math.max(1, Math.min(8, k));
    tx = Math.min(0, Math.max(cv.offsetWidth * (1 - k), tx)); ty = Math.min(0, Math.max(cv.offsetHeight * (1 - k), ty));
    cv.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
  };
  const zoomAt = (px, py, nk) => { nk = Math.max(1, Math.min(8, nk)); tx = px - (px - tx) * nk / k; ty = py - (py - ty) * nk / k; k = nk; apply(); };
  const loc = (e) => { const r = vp.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  vp.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, loc(e)); if (pts.size === 1) { start = loc(e); moved = false; } else moved = true; });
  vp.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), cur = loc(e);
    pts.set(e.pointerId, cur);
    if (pts.size === 1) {
      if (!moved && start && Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 8) moved = true;
      if (moved) { tx += cur[0] - prev[0]; ty += cur[1] - prev[1]; apply(); }
    } else if (pts.size === 2) {
      const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]) || 1, d1 = Math.hypot(cur[0] - other[0], cur[1] - other[1]);
      moved = true;
      zoomAt((cur[0] + other[0]) / 2, (cur[1] + other[1]) / 2, k * d1 / d0);
    }
  });
  const up = (e) => { pts.delete(e.pointerId); if (!pts.size && moved) lastDrag = Date.now(); };
  vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  vp.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = loc(e); zoomAt(px, py, k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
  return { dragged: () => Date.now() - lastDrag < 400 };
}
function drawMap() {
  const cv = $('#mapcv'), c = cv.getContext('2d'), cs = +cv.dataset.cs, g = S.game, lvl = S.lvl;
  const w = lvl.map[0].length, h = lvl.map.length;
  c.fillStyle = '#0a0806'; c.fillRect(0, 0, cv.width, cv.height);
  const seen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && g.seen[y * w + x];
  const wallObj = new Set(g.objs.filter((o) => (o.type === 'secret' && !o.open) || (o.type === 'lever' && o.wall)).map((o) => o.x + ',' + o.y)); // Geheimwand und Schalterstein zählen auf der Karte als Mauer
  const cellChar = (l, x, y) => (wallObj.has(x + ',' + y) ? '#' : cellCharRaw(l, x, y));
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
    const k = mapSymKind(o);
    if (!k) continue;
    const horiz = o.type === 'door' && cellChar(lvl, o.x - 1, o.y) !== '.' && cellChar(lvl, o.x + 1, o.y) !== '.';
    drawMapSym(c, k, o.x * cs, o.y * cs, cs, horiz);
  }
  for (const idx of g.notes) drawMapSym(c, 'note', (idx % w) * cs, Math.floor(idx / w) * cs, cs);
  drawMapSym(c, 'player', g.player.x * cs, g.player.y * cs, cs, false, g.player.dir);
}
// Kartensymbole (eine Quelle für Karte und Legende). Geheimwand und unbenutzter Schalterstein erscheinen nicht (sehen aus wie Mauer).
function mapSymKind(o) {
  if (o.type === 'secret' || (o.type === 'lever' && o.wall && !o.used)) return null;
  if (o.type === 'door') return o.open ? 'doorOpen' : o.locked ? 'doorLocked' : 'door';
  if (o.type === 'chest') return o.open ? 'chestOpen' : 'chest';
  if (o.type === 'gate') return o.open ? 'gateOpen' : 'gate';
  if (o.type === 'lever') return o.used ? 'leverUsed' : 'lever';
  if (o.type === 'enemy') return o.dead ? null : 'enemy';
  if (o.type === 'plate') return o.down ? 'plateDown' : 'plate';
  if (o.type === 'boulder') return 'boulder';
  if (o.type === 'trap') return o.disarmed || !o.spotted ? null : o.sprung ? 'trapUsed' : 'trap'; // nur entdeckte Fallen
  return ['stairs', 'exit', 'sign', 'merchant', 'runestone'].includes(o.type) ? o.type : null;
}
const MAP_LEGEND = [
  ['player', 'Du (Spitze = Blick)'], ['note', 'Notiz'], ['floor', 'Erkundeter Boden'], ['wall', 'Wand'], ['unknown', 'Noch nicht erkundet'],
  ['door', 'Tür, geschlossen'], ['doorLocked', 'Tür, verschlossen'], ['doorOpen', 'Tür, offen'],
  ['chest', 'Truhe'], ['chestOpen', 'Truhe, geöffnet'], ['gate', 'Gitter, geschlossen'], ['gateOpen', 'Gitter, offen'],
  ['lever', 'Hebel'], ['leverUsed', 'Hebel, benutzt'], ['stairs', 'Treppe / Durchgang'], ['exit', 'Ausgang (Ende des Gebiets)'],
  ['sign', 'Hinweistafel'], ['runestone', 'Runenstein'], ['merchant', 'Händler'], ['enemy', 'Gegner'], ['plate', 'Druckplatte'], ['plateDown', 'Druckplatte, belastet'], ['boulder', 'Beweglicher Stein'], ['trap', 'Falle, entdeckt'], ['trapUsed', 'Falle, ausgelöst'],
];
function drawMapSym(c, k, x0, y0, cs, horiz = true, dir = 1) {
  const cx = x0 + cs / 2, cy = y0 + cs / 2;
  const txt = (t, col) => { c.fillStyle = col; c.font = `bold ${cs}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, cx, cy); };
  if (k === 'floor') { c.fillStyle = '#4a4034'; c.fillRect(x0, y0, cs, cs); }
  else if (k === 'wall') { c.fillStyle = '#8a7a5e'; c.fillRect(x0, y0, cs, cs); }
  else if (k === 'unknown') { c.strokeStyle = '#4a4034'; c.lineWidth = 2; c.strokeRect(x0 + 1, y0 + 1, cs - 2, cs - 2); }
  else if (k === 'door' || k === 'doorLocked' || k === 'doorOpen') { // Balken quer zum Gang, Farbe: zu / verschlossen / offen
    const t = Math.max(3, Math.round(cs * 0.3));
    const bar = (a, l) => horiz ? c.fillRect(x0 + a, cy - t / 2, l, t) : c.fillRect(cx - t / 2, y0 + a, t, l);
    c.fillStyle = k === 'doorOpen' ? '#9fb86a' : k === 'doorLocked' ? '#d9503a' : '#e8a24a';
    if (k === 'doorOpen') { bar(0, cs * 0.28); bar(cs * 0.72, cs * 0.28); } // offen: zwei Stummel, Durchgang frei
    else { bar(0, cs); c.fillStyle = '#1a120a'; c.beginPath(); c.arc(cx, cy, Math.max(1.5, cs * 0.1), 0, 7); c.fill(); } // Griff/Schloss
  }
  else if (k === 'chest' || k === 'chestOpen') { c.fillStyle = k === 'chestOpen' ? '#7a6a3a' : '#e0b040'; c.fillRect(cx - cs * 0.25, cy - cs * 0.2, cs * 0.5, cs * 0.4); }
  else if (k === 'stairs') { c.fillStyle = '#7fd4ff'; c.beginPath(); c.moveTo(cx - cs * 0.3, cy - cs * 0.25); c.lineTo(cx + cs * 0.3, cy - cs * 0.25); c.lineTo(cx, cy + cs * 0.3); c.fill(); }
  else if (k === 'runestone') { c.fillStyle = '#7fd4ff'; c.fillRect(cx - cs * 0.18, cy - cs * 0.32, cs * 0.36, cs * 0.64); }
  else if (k === 'exit') { c.strokeStyle = '#7fd4ff'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, cs * 0.3, 0, 7); c.stroke(); }
  else if (k === 'gate' || k === 'gateOpen') { c.strokeStyle = k === 'gateOpen' ? '#6b5a3a' : '#9aa4b4'; c.lineWidth = 2; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x0 + i * cs / 4, y0 + 2); c.lineTo(x0 + i * cs / 4, y0 + cs - 2); c.stroke(); } }
  else if (k === 'lever' || k === 'leverUsed') { c.fillStyle = k === 'leverUsed' ? '#6b5a3a' : '#d9a441'; c.fillRect(cx - 2, cy - cs * 0.3, 4, cs * 0.6); }
  else if (k === 'sign') { c.fillStyle = '#c89a5a'; c.fillRect(cx - cs * 0.25, cy - cs * 0.2, cs * 0.5, cs * 0.3); }
  else if (k === 'plate' || k === 'plateDown') { c.strokeStyle = k === 'plateDown' ? '#9fb86a' : '#c8c0a8'; c.lineWidth = 2; c.strokeRect(x0 + cs * 0.2, y0 + cs * 0.2, cs * 0.6, cs * 0.6); }
  else if (k === 'boulder') { c.fillStyle = '#a89c88'; c.beginPath(); c.arc(cx, cy, cs * 0.32, 0, 7); c.fill(); }
  else if (k === 'trap') txt('!', '#ff5a3c');
  else if (k === 'trapUsed') txt('!', '#7a6a5a');
  else if (k === 'merchant') txt('$', '#e0b040');
  else if (k === 'enemy') txt('×', '#d05040');
  else if (k === 'note') { c.fillStyle = '#ffe066'; c.beginPath(); c.moveTo(cx, y0 + 3); c.lineTo(x0 + cs - 3, cy); c.lineTo(cx, y0 + cs - 3); c.lineTo(x0 + 3, cy); c.fill(); }
  else if (k === 'player') {
    const a = dir * Math.PI / 2, r = cs * 0.38;
    c.fillStyle = '#ffffff'; c.beginPath();
    c.moveTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
    c.lineTo(cx + Math.sin(a + 2.5) * r, cy - Math.cos(a + 2.5) * r);
    c.lineTo(cx + Math.sin(a - 2.5) * r, cy - Math.cos(a - 2.5) * r);
    c.fill();
  }
}
// Legende neben der Karte (0.16.6, Nutzerwunsch; vorher eigenes Fenster): nur Zeichen, die in diesem Gebiet schon
// gesehen wurden (verrät nichts Unentdecktes), dazu die Grundzeichen. Schmale Bildschirme: rutscht unter die Karte.
function mapLegendHtml() {
  const g = S.game, w = S.lvl.map[0].length;
  const have = new Set(['player', 'note', 'floor', 'wall', 'unknown']);
  for (const o of g.objs) { const k = mapSymKind(o); if (k && g.seen[o.y * w + o.x]) have.add(k); }
  const rows = MAP_LEGEND.filter(([k]) => have.has(k));
  return `<div class="mapleg${rows.length > 10 ? ' two' : ''}">${rows.map(([k, t]) => `<div><canvas data-sym="${k}" width="40" height="40"></canvas><span>${esc(t)}</span></div>`).join('')}</div>`;
}
function paintLegend() {
  document.querySelectorAll('#modal-box canvas[data-sym]').forEach((cv) => drawMapSym(cv.getContext('2d'), cv.dataset.sym, 0, 0, 40, true, 1));
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
  <div class="row"><label>Helligkeit der Umgebung</label>${sel('bright', [[1, 'Original (dunkel)'], [1.35, 'Hell'], [1.8, 'Sehr hell'], [2.4, 'Maximal']])}</div>
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
  const v = el.type === 'checkbox' ? el.checked : (el.type === 'range' || k === 'fontScale' || k === 'flicker' || k === 'bright') ? parseFloat(el.value) : el.value;
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
  catch (e) { logError('Laden', e); toast('Laden fehlgeschlagen: ' + e.message, 4500); }
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
  catch (err) { logError('Import', err); toast('Import fehlgeschlagen: ' + err.message, 4500); }
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
  <h3>Teleport</h3><div class="acts" style="margin-top:0">${['start', 'door_a', 'chest_a', 'door_b', 'en1', 'rune_t1'].map((id) => `<button class="mb" data-m="tp:${id}">${id}</button>`).join('')}</div>
  <h3>Gebiet wechseln</h3><div class="acts" style="margin-top:0">${Object.values(S.data.levels).map((l) => `<button class="mb" data-m="dbg-area:${l.id}">${esc(l.name)}</button>`).join('')}</div>
  <h3>Cheats</h3><div class="acts" style="margin-top:0">
    <button class="mb" data-m="dbg-lvl">Alle +1 Stufe (${g.heroes.map((h) => h.level).join('/')})</button>
    <button class="mb" data-m="god">Unverwundbar: ${S.debug.god ? 'AN' : 'aus'}</button>
    <button class="mb" data-m="dbg-reset">Dieses Gebiet zurücksetzen (Gegner, Truhen, Türen neu)</button>
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
  else if (m === 'map') openMap();
  else if (m === 'debug') openDebug();
  else if (m === 'save') openSlots('save');
  else if (m === 'load') openSlots('load');
  else if (m === 'settings') openSettings();
  else if (m === 'help') openHelp();
  else if (m === 'bestiary') openBestiary();
  else if (m === 'errlog') openErrorLog();
  else if (m === 'errcopy') copyErrorLog();
  else if (m === 'errclear') { ERR.list = []; store.set('errlog', []); openErrorLog(); }
  else if (m === 'menu') openMenu();
  else if (m === 'export') exportSave();
  else if (m === 'import') $('#importfile').click();
  else if (m === 'fullscreen') {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }
    catch { toast('Vollbild wird von diesem Browser nicht unterstützt oder wurde abgelehnt.'); }
  } else if (m === 'install') {
    if (S.installEvent) { S.installEvent.prompt(); S.installEvent = null; }
    else toast('Chrome-Menü (⋮) → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.', 5000);
  } else if (m === 'selftest') openSelfTest();
  else if (m.startsWith('diff:')) { S.newDiff = m.slice(5); openNewGame(); }
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
  else if (m === 'rest') {
    const r = restParty(g, S.data);
    const t = { 'in-combat': 'Im Kampf kann niemand rasten.', 'enemy-near': `Ein Gegner ist zu nah (${r.dist} Schritte, nötig sind ${(S.data.rest || {}).enemyDistance || 10}). So kann die Gruppe nicht rasten.`, 'enemy-seen': 'Ein Gegner ist in Sichtweite. So kann die Gruppe nicht rasten.', 'nothing-to-do': 'Alle sind bereits bei Kräften.' }[r.error];
    if (t) { say(t); toast(t); closeModal(); }
    else { say(r.msg); S.sfx.play(r.sfx); toast(r.msg, 3200); closeModal(); renderAll(); }
  }
  else if (m === 'shopbuy' || m === 'shopsellTab') { S.shopTab = m === 'shopbuy' ? 'buy' : 'sell'; S.shopSure = null; openShop(S.shopId); }
  else if (m.startsWith('buy:')) {
    const r = buyItem(g, S.data, S.shopId, m.slice(4));
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); } else toast(r.error === 'no-gold' ? `Zu wenig Gold (${r.price} nötig).` : 'Das geht nicht.');
    renderAll(); openShop(S.shopId);
  }
  else if (m.startsWith('shopsell:')) {
    const id = m.slice(9), it = itemDef(g, S.data, id), q = qualityOf(g, S.data, id);
    const dear = it && it.kind === 'equip' && q && (q.id === 'rare' || q.id === 'epic');
    if (dear && S.shopSure !== id) { S.shopSure = id; openShop(S.shopId); return; } // seltene Ausrüstung: zweiter Tipp bestätigt
    S.shopSure = null;
    const r = sellItem(g, S.data, id);
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); } else toast('Das geht nicht.');
    renderAll(); openShop(S.shopId);
  }
  else if (m.startsWith('eqsel:')) { S.invEquip = m.slice(6); openInventory(); }
  else if (m.startsWith('eq:')) {
    const r = equipItem(g, S.data, S.invEquip, +m.slice(3));
    if (r.msg) { say(r.msg); S.sfx.play('ui'); toast(r.msg); } else toast('Das geht nicht.');
    S.invEquip = null; // 0.19.11: Auswahl schließt nach dem Anlegen (vorher blieb die Zeile oben anwählbar und ließ sich erneut ausrüsten)
    renderAll(); openInventory();
  }
  else if (m.startsWith('tal:')) { if (g.combat) toast('Nicht im Kampf.'); else openTalents(+m.slice(4)); }
  else if (m === 'char') openCharacter();
  else if (m.startsWith('tl:')) {
    const [, i, id] = m.split(':');
    const r = learnTalent(g, S.data, +i, id);
    if (r.msg) { say(r.msg); S.sfx.play('ui'); toast(r.msg); } else toast('Das geht nicht.');
    renderAll(); openTalents(+i);
  }
  else if (m.startsWith('trs:')) {
    const r = respecTalents(g, S.data, +m.slice(4));
    if (r.msg) { say(r.msg); S.sfx.play('ui'); toast(r.msg); } else toast(r.error === 'gold' ? `Dafür fehlen ${r.cost} Gold.` : 'Das geht nicht.');
    renderAll(); openTalents(+m.slice(4));
  }
  else if (m.startsWith('uneq:')) {
    const [, i, s] = m.split(':');
    const r = unequipItem(g, S.data, +i, s);
    if (r.msg) { say(r.msg); toast(r.msg); }
    renderAll(); openCharacter();
  }
  else if (m === 'shopgo') { S.shopTalk = null; openShop(S.shopId, false); }
  else if (m.startsWith('use:')) { S.invUse = m.slice(4); openInventory(); }
  else if (m.startsWith('heal:')) {
    const r = useItemOutside(g, S.data, S.invUse || 'potion', +m.slice(5));
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); }
    if ((g.inv.potion || 0) <= 0) S.invUse = null;
    renderAll(); openInventory();
  }
  else if (m.startsWith('tp:')) teleportTo(m.slice(3));
  else if (m.startsWith('oc:')) {
    const [, sid, t] = m.split(':');
    const r = castOutside(g, S.data, S.castHero, sid, +t);
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); }
    renderAll(); openHeroCast(S.castHero);
  }
  else if (m.startsWith('dbg-area:')) {
    if (jumpToLevel(g, S.data, m.slice(9)).ok) { S.lvl = getLevel(S.data, g); S.rc.setPalette(S.data.palettes[S.lvl.palette]); S.held = []; S.queued = null; closeModal(); snapCam(); renderAll(); toast('Gebiet: ' + S.lvl.name); }
  }
  else if (m === 'dbg-lvl') {
    const need = Math.max(0, ...g.heroes.map((h) => { const n = xpForNext(S.data, h); return n == null ? 0 : n - h.xp; }));
    if (need > 0) grantXp(g, S.data, need);
    g.heroes.forEach((h) => { h.hp = h.maxHp; h.mp = h.maxMp; });
    renderAll(); openDebug(); toast('Stufe: ' + g.heroes.map((h) => h.level).join('/'));
  }
  else if (m === 'god') { S.debug.god = !S.debug.god; openDebug(); }
  else if (m === 'dbg-reset') { if (resetArea(g, S.data).ok) { S.held = []; S.queued = null; closeModal(); snapCam(); renderAll(); toast('Gebiet zurückgesetzt: ' + S.lvl.name); } }
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
  const st = newGame(S.data, (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0, specs, S.newDiff || 'normal');
  startGame(st);
  say('Du stehst im Testgewölbe. Vor dir liegt eine Tür. Mit ◉ Interagieren öffnest du sie.');
}
function diffPicker() {
  const cur = S.newDiff || 'normal';
  return `<div class="acts" style="justify-content:flex-start;flex-wrap:wrap"><span>Schwierigkeit:</span>${Object.entries(S.data.difficulty).map(([k, v]) => `<button class="mb${k === cur ? ' sel' : ''}" data-m="diff:${k}" style="padding:2px 10px;min-height:0">${esc(v.name)}</button>`).join('')}</div><div class="muted" style="font-size:.8em">${esc(S.data.difficulty[cur].desc)}</div>`;
}
function openNewGame() {
  const party = buildParty(S.data);
  const rows = party.map((h, i) => `<div class="qp"><canvas data-q="${i}" width="32" height="32"></canvas><div><b>${esc(h.name)}</b><div class="muted">${esc(raceName(h.race))} · ${esc(h.role)} · ${rowName(h.row)} · LP ${h.maxHp}</div></div></div>`).join('');
  openModal(`<h2>Neues Spiel</h2>${diffPicker()}<h3>Schnellstart-Gruppe</h3>${rows}
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
