// Die Schatten von Eldermoor – Spielsteuerung, Oberfläche, Eingabe
// Autor: eldermoor-dev
import {
  DIRS, DIR_NAMES, dirToward, frontCell, newGame, tryMove, turn, interact, useItemOutside, startCombat, currentActor,
  heroAction, enemyStep, applyDefeat, serialize, deserialize, markSeen, getLevel, cellChar, blockerAt,
  buildParty, deriveStats, skipStunned, restParty, enemyOf, sellItem, sellPrice, buyItem, buyPrice, haggle, shopStock, shopLeft, shopRestockIn, readHint, pushError, formatErrorLog, itemDef, cursedOwned, exorcise, EXORCISE, smithJobs, smithUpgrade, isCursed, curseKnown, curseText, qualityOf, changeArea, travelTo, castOutside, jumpToLevel, resetArea, wallSignAhead, grantXp, knownSpells, canCleanse, comboFor, talentBranches, talentPoints, talentSum, learnedTalents, canLearnTalent, partyAvgLevel, learnTalent, respecTalents, respecCost, equipItem, unequipItem, canEquip, gearBonus, statusOf, SEP, SWEEP_MULT, validateParty, randomParty, xpForNext, NAME_MAX,
  activeSets, coveredBy, gearCompare, wornOverview, isNew, clearNew, doorAhead2, dialogStartNode, dialogView, dialogEnter, roomAt, floodLabel, dialogChoose, diceNew, diceRoll, diceKeep, diceNext, diceFinish, diceRoundLine, recruitHero, swapHero, dismissReserve, recruitCost, RESERVE_MAX, mapOffers, buyMap, mapQuota, MAP_MAX, boardView, boardTurnIn, boardDismiss, achievements, masteryLevel
} from './logic.js';
import { Raycaster, makeTextures, buildGrid, buildFloorGrid, buildSprites, buildDecals, drawPortrait, setResolution, W, H, BASE_W, BASE_H, spriteScale, figureScale, setCombatFit, groupOffsets, isNarrowAt, groupLayout } from './render.js';
import { Sfx } from './audio.js';
import { startSleepScene } from './scene.js';
import { store } from './store.js';

const VERSION = '0.53.0';
const cellCharRaw = cellChar; // unverfälschte Kartenzelle (die Karte blendet Geheimwände als Mauer ein)
const $ = (s, r = document) => r.querySelector(s);
const hasKey = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// settingsV 2 (v0.2.0): Schrittgeräusche standardmäßig aus (Nutzerentscheidung 13.11.2026)
const SETTINGS_V = 3;
// settingsV 3 (v0.19.9): Nutzer „Zu dunkel“ – Standard-Helligkeit 1,8 („Sehr hell“), neue Stufe „Maximal“ (2,4); alte Einstellung unter 1,8 wird einmalig angehoben
const DEFAULTS = { volume: 0.7, muted: false, quality: 'medium', vibration: true, fontScale: 1, colorblind: false, debug: false, flicker: 0.35, bright: 1.8, steps: false, ambient: true, sharp: 'scharf', autoFs: true, settingsV: SETTINGS_V };
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
if (new URLSearchParams(location.search).has('dev')) { window.__S = S; S.snapCam = () => snapCam(); S.fn = { openMap: () => openMap(), renderCombat: () => renderCombat(), startCombatUI: (o) => startCombatUI(o), showEvent: (a, b) => showEvent(a, b), openDice: (id) => openDice(id), openShop: (id) => openShop(id, true), openTavern: () => { S.tav = null; openTavern(); }, openMaps: () => openMaps(), openBoard: () => openBoard(), gotoArea: (id) => { jumpToLevel(S.game, S.data, id); S.lvl = getLevel(S.data, S.game); S.rc.setPalette(S.data.palettes[S.lvl.palette]); S.held = []; S.queued = null; snapCam(); renderAll(); } }; } // nur für automatische Tests (?dev)

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
// 0.23.10 (Nutzer: Leiste überlappt die Tasten): Display-Ränder/Vollbild verschieben die Tastenblöcke auch nach dem Layout – Einpassung bei Größenänderung, Vollbildwechsel und sicherheitshalber alle 400 ms prüfen (billig: nur Messen, Schreiben bei Änderung)
let fitSig = '';
function refitStack() {
  const lp = $('#ctl-left'), rp = $('#ctl-right'), st = $('#stage');
  if (!lp || !rp || !st) return;
  const a = lp.getBoundingClientRect(), b = rp.getBoundingClientRect(), c = st.getBoundingClientRect();
  const sig = [a.right, b.left, c.left, c.right, S.hs].map((v) => Math.round((v || 0) * 2)).join(',');
  if (sig !== fitSig) { fitSig = sig; fitStack(); }
}
window.addEventListener('resize', () => { fitSig = ''; setTimeout(refitStack, 60); });
document.addEventListener('fullscreenchange', () => { fitSig = ''; setTimeout(refitStack, 120); });
setInterval(refitStack, 400);

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
    // 0.49.9 (Nutzer: Schrat im Kampf „zu klein“, Screenshot): Die Einpassung rechnete mit Abstand 1, der Schrat steht aber zwei Felder entfernt. Folge: Figur doppelt verkleinert (Untergrenze 0,5 griff) und Fußpunkt zu hoch. Jetzt zählt der echte Abstand des nächsten lebenden Gegners entlang der Blickrichtung (mindestens 1, dort unverändert).
    const pl = g.player, dv = [[0, -1], [1, 0], [0, 1], [-1, 0]][pl.dir];
    let near = Infinity;
    for (const e of c.enemies) {
      if (e.hp <= 0) continue;
      const eo = g.objs.find((o) => o.id === e.objId && o.type === 'enemy');
      if (eo) near = Math.min(near, (eo.x - pl.x) * dv[0] + (eo.y - pl.y) * dv[1]);
    }
    const hud = hudTopPx(now), tY = Math.max(1, Number.isFinite(near) ? Math.min(4, near) : 1) + VIEW_BACK, floor = 0.5 * f / tY;
    // 0.17.0: auch Bosse werden ganz ins Bild gesetzt (Kopf war oben abgeschnitten); sie bleiben dank Skalierung 1,0–1,2 trotzdem die größten Figuren
    const groups = {};
    c.enemies.forEach((e) => { if (e.hp > 0) (groups[e.objId] = groups[e.objId] || []).push(e.kind); });
    let maxS = 0.5;
    for (const ks of Object.values(groups)) for (const k of ks) maxS = Math.max(maxS, figureScale(S.tex, k, ks.length)); // 0.51.1: nach sichtbarer Höhe, nicht nach dem ganzen Bild
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
    // 0.23.4 (Nutzer: Fallenspur nicht erkennbar): ist eine entdeckte Falle das nächste Feld, wird der Blick wie bei der Truhe gesenkt – der Boden liegt sonst hinter der Leiste.
    // Nur bei entdeckten Fallen, damit die Kamera keine unentdeckte Falle verrät.
    const tr = g.objs.find((o) => o.type === 'trap' && !o.sprung && !o.disarmed && o.spotted && o.x === p.x + d[0] && o.y === p.y + d[1]);
    if (tr) {
      const hz = hudTopPx(now) - H * 0.015 - 0.5 * f * 0.35;
      return { back: 0, hz: Math.max(0.3, Math.min(0.5, hz / H)) };
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
  const sprites = buildSprites(S.game.objs, S.tex, now / 1000, S.cam.a, aliveMap(), { grid, gw, gh });
  S.rc.render({ px: vc.x, py: vc.y, angle: vc.a, horizon: S.vh * H, grid, gw, gh, decals: buildDecals(S.lvl, S.game.objs, S.tex), sprites, time: now / 1000, floorGrid: buildFloorGrid(S.lvl), waterStyle: S.lvl.water || null, hall: S.lvl.hall || null, floorTex: S.lvl.floorTex || null, fog: S.lvl.fog || 1 });
  S.ctx.putImageData(S.img, 0, 0);
  placeFoeTags(sprites);
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
  $('#foetags').addEventListener('click', onEnemyBox);
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
      if (r.encounter) { if (r.msg) say(r.msg); if (r.sfx) S.sfx.play(r.sfx); startCombatUI(r.encounter); break; } // 0.20.0: Monstertruhe erwacht
      if (r.talk) { S.held = []; openDialog(r.talk); break; } // 0.25.0: Begegnungsdialog
      if (r.page) { S.sfx.play('ui'); say('Ins Notizbuch eingetragen.'); openParchment(r.page.title, r.page.text, 'Weiter'); renderAll(); break; } // 0.47.0: Erzählseite
      if (r.board) { S.held = []; S.sfx.play('ui'); openBoard(); break; } // 0.40.0: Aushangbrett
      if (r.shop) { if (r.msg) say(r.msg); S.shopTalk = r.msg || null; S.held = []; S.shopTab = 'buy'; S.shopSure = null; openShop(r.shop, true); break; }
      say(r.msg); if (r.sfx) S.sfx.play(r.sfx);
      if (r.moved) { S.target.x = g.player.x + 0.5; S.target.y = g.player.y + 0.5; beginTween(); toast(r.msg, 5000); } // Stein gezogen: Gruppe steht ein Feld weiter hinten
      if (r.long) toast(r.msg + (r.newNote ? ' – Ins Notizbuch eingetragen.' : ''), 8000);
      if (r.newNote) say('Ins Notizbuch eingetragen.');
      if (r.changed) vib(20);
      if (r.teleported) snapCam(); // 0.44.0: Fass-Teleport
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
    beginTween(); updateReadHint();
    (r.events || []).forEach(onEvent);
    if (r.luck) { say(r.luck); toast(r.luck, 4500); S.sfx.play('chest'); vib(20); } // Glücksamulett (0.28.0)
    if (r.notes) { S.held = []; r.notes.forEach((t) => { say(t); toast(t, 5000); }); S.sfx.play('warn'); vib([40, 40, 40]); S.nextAllowed = performance.now() + 500; }
    if (r.encounter && (r.events || []).some((e) => e.type === 'scene')) { // 0.47.17: erst Auftritt (Erscheinen, Albtraum), dann Kampf
      S.held = []; S.queued = null; S.lock = true;
      const enc = r.encounter;
      setTimeout(() => { S.lock = false; if (S.game && !S.game.combat) startCombatUI(enc, false); }, 1700);
    } else if (r.encounter) startCombatUI(r.encounter, r.ambush);
  } else if (r.encounter) startCombatUI(r.encounter);
  else if (r.stairsHere) { S.held = []; S.queued = null; S.nextAllowed = performance.now() + 400; onEvent({ type: 'stairs', id: r.stairsHere }); } // 0.49.7: „Vor“ auf dem Treppenfeld gegen die Treppenwand
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
  renderCompass(); updateReadHint();
  S.target.a += d * Math.PI / 2;
  beginTween(170);
  S.sfx.play('step');
  if (r.notes) { r.notes.forEach((t) => { say(t); toast(t, 5000); }); S.sfx.play('warn'); vib([40, 40, 40]); }
  if (r.encounter) startCombatUI(r.encounter, r.ambush);
}
async function afterAreaChange(r) { // Gebietswechsel (Treppe oder Fähre) in der Oberfläche nachziehen
  S.lvl = getLevel(S.data, S.game);
  S.rc.setPalette(S.data.palettes[S.lvl.palette]);
  S.held = []; S.queued = null;
  snapCam();
  say(r.msg);
  renderAll();
  introOnce('area:' + S.game.levelId, S.lvl.intro);
  await saveSlot('auto', true);
}
async function onEvent(ev) {
  if (ev.type === 'stairs') {
    const r = changeArea(S.game, S.data, ev.id);
    if (!r.ok) { say(r.msg); return; }
    await afterAreaChange(r);
    return;
  }
  if (ev.type === 'teleport') { S.held = []; S.queued = null; snapCam(); if (!ev.hidden) { say(ev.msg); toast(ev.msg, 3000); S.sfx.play('sting'); flash(); vib(40); } renderAll(); return; } // 0.23.0: versteckte Teleporter ohne Meldung – nur die Umgebung und der Kompass verraten es
  if (ev.type === 'scene') { S.held = []; S.queued = null; syncLook(); flash(); if (ev.slam) { S.sfx.play('slam'); setTimeout(() => S.sfx.play('sting'), 450); } else S.sfx.play('sting'); vib(ev.slam ? [160, 40, 90, 50, 90] : [90, 50, 90]); say(ev.text); showEvent(ev.title, ev.text, 4600); renderAll(); return; } // 0.47.17: Auftritt (Albtraum)
  if (ev.type === 'illusion') { say(ev.msg); toast(ev.msg, 4000); S.sfx.play('sting'); vib(30); renderAll(); return; } // 0.22.0: Illusionswand durchschritten
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
  say(`${name} ${S.game.combat.enemies.length > 1 ? 'greifen' : 'greift'} ${S.game.combat.ambush ? 'aus dem Hinterhalt ' : ''}an!`);
  for (const m of S.game.combat.startMsgs || []) say(m); // 0.22.0: Talente zu Kampfbeginn (Wachsam, Fangnetz)
  if (!introOnce('intro:' + enemyObj.id, S.data.enemies[enemyObj.kind] && S.data.enemies[enemyObj.kind].intro)) S.sfx.play('miss');
  vib(40);
  renderAll();
  runEnemyTurns();
}
function showResult(r) {
  // 0.22.1 (Nutzer: Betäubung des Moorschrats war in der Leiste nicht zu sehen): Solange der Kampf läuft, steht ein ganzer Zug als EINE Zeile
  // in der Leiste – sonst verdrängen Folgemeldungen (Brandschaden, „X ist am Zug“) das Wichtige. Das Protokoll behält jede Meldung einzeln.
  const parts = (r.msgs || []).map((m) => m.split(SEP));
  parts.forEach(([t, dt]) => { clogAdd(dt ? `${t} [${dt}]` : t); if (/^Beute von /.test(t)) toast(t, 3600); });
  if (S.game.combat && !r.over && parts.length > 1) say(parts.map(([t]) => t).join(' '));
  else parts.forEach(([t]) => say(t));
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
    const t = { 'full-hp': 'Dieser Held hat volle LP.', 'full-mp': 'Dieser Held hat volles Mana.', 'no-item': 'Kein Trank mehr.', 'bad-target': 'Das Ziel kann nicht geheilt werden.', 'once': 'Tote erwecken geht nur einmal je Kampf.', 'not-available': 'Noch nicht verfügbar.', 'no-mp': 'Zu wenig Mana oder Ausdauer.', 'no-ability': 'Dieser Held hat keine Fähigkeit.' }[r.error];
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
  const lvl = getLevel(S.data, g);
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
    if ((fd[0] || fd[1]) && sx * fd[0] + sy * fd[1] < 0.05) continue; // 0.22.1: Wandtafel lesbar, sobald man ihre Vorderseite sieht – auch schräg (vorher nur mit Blick genau auf die Wand)
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
  const lvl = getLevel(S.data, g);
  const r = $('#view').getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const a = S.cam.a, dirX = Math.sin(a), dirY = -Math.cos(a), plX = Math.cos(a) * 0.8, plY = Math.sin(a) * 0.8;
  const inv = 1 / (plX * dirY - dirX * plY);
  const open = (x, y) => { const row = lvl.map[Math.floor(y)]; return row && row[Math.floor(x)] === '.'; };
  const f = frontCell(g);
  let best = null, bt = 1e9;
  for (const o of g.objs) {
    const big = o.type === 'door' || o.type === 'gate' || o.type === 'secret' || (o.type === 'lever' && o.wall);
    if (!(big ? (!o.open || (o.type === 'door' && o.x === f.x && o.y === f.y)) : o.type === 'chest' ? !o.open : o.type === 'lever' || o.type === 'merchant' || (o.type === 'npc' && !o.gone))) continue; // 0.16.5: Händlerin antippen = ansprechen
    const sx = o.x + 0.5 - S.cam.x, sy = o.y + 0.5 - S.cam.y;
    const tX = inv * (dirY * sx - dirX * sy), tY = inv * (-plY * sx + plX * sy);
    if (tY <= 0.3 || tY > 2.6 || tY >= bt) continue;
    const tol = big ? 0.31 / tY + 0.02 : o.type === 'merchant' || o.type === 'npc' ? 0.26 / tY + 0.03 : 0.16 / tY + 0.04;
    if (Math.abs(0.5 * (1 + tX / tY) - fx) > tol) continue;
    let clear = true;
    const dist = Math.hypot(sx, sy), steps = Math.ceil(dist / 0.2);
    for (let i = 1; i < steps - 1; i++) { const k = i / steps; if (!open(S.cam.x + sx * k, S.cam.y + sy * k)) { clear = false; break; } }
    if (clear) { best = o; bt = tY; }
  }
  if (!best) return false;
  if (best.x === f.x && best.y === f.y) act('interact');
  else if (best.type === 'door' && doorAhead2(g, best.x, best.y)) { const r = interact(g, S.data, best); say(r.msg); if (r.sfx) S.sfx.play(r.sfx); if (r.changed) vib(20); renderAll(); } // 0.26.2: Tür aus 2 Feldern öffnen
  else { say('Geh näher heran.'); toast('Geh näher heran.', 1500); }
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
      const { lat, dep } = groupLayout(buildGrid(S.lvl, S.game.objs), o.x, o.y, a, n)[k];
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
const whyAttr = (why) => ` data-why="${esc(why)}" aria-disabled="true"`; // 0.34.1
const wDrink = (mana, h) => (h.hp <= 0 ? `${h.name} ist bewusstlos.` : mana ? `${h.name} hat volles Mana.` : `${h.name} hat volle LP.`);
function onActionBar(e) {
  const b = e.target.closest('[data-c]');
  if (!b || b.disabled) return;
  if (b.dataset.why) { say(b.dataset.why); return; } // 0.34.1: gesperrte Aktion nennt den Grund (statt stummem disabled)
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
  else if (c.startsWith('dr:')) { const [, id, h] = c.split(':'); heroAct({ type: 'item', item: id, hero: +h }); }
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
  if ((sp.kind === 'heal' && !sp.all) || sp.kind === 'revive') { S.abMode = true; S.itemMode = false; renderCombat(); }
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
// 0.47.13: Lesefeld mit echter Schrift für Schild/Türtitel in Blickrichtung (unabhängig von Rasterauflösung und Blickwinkel)
function updateReadHint() { const el = $('#readhint'); if (!el || !S.game) return; const r = S.game.combat || (S.settings && S.settings.readHint === false) ? null : readHint(S.game, S.data); if (!r) { if (!el.hidden) el.hidden = true; return; } if (el.textContent !== r.text) el.textContent = r.text; if (el.hidden) el.hidden = false; }
function syncLook() { const l = getLevel(S.data, S.game); if (l !== S.lvl) { S.lvl = l; S.rc.setPalette(S.data.palettes[l.palette]); } } // 0.47.17: Gebietsumbau (Albtraum-Palette) folgt der Marke im Spielstand
// 0.48.1: Blitze im Albtraum (solange die Marke der Szene gesetzt ist): helles Aufflackern, kurz darauf Donner
let boltAt = 0;
function bolt() { const v = $('#view'); v.classList.remove('bolt'); void v.offsetWidth; v.classList.add('bolt'); setTimeout(() => { if (S.sfx) S.sfx.play('thunder'); }, 250 + Math.random() * 500); }
setInterval(() => {
  const g = S.game, sc = g && S.data && getLevel(S.data, g).scene;
  if (!S.started || !g || !sc || !sc.door || !g.flags[sc.id]) { boltAt = 0; return; }
  const now = performance.now();
  if (!boltAt) boltAt = now + 1500 + Math.random() * 2500;
  if (now >= boltAt) { bolt(); boltAt = now + 3500 + Math.random() * 5500; }
}, 400);
function renderAll() { syncLook(); updateReadHint(); renderCompass(); announceTurn(); renderParty(); renderCombat(); renderLog(); updateInvBadge(); updateTalBadge(); }
// 0.22.1: Punkt am Inventar-Knopf, solange etwas Neues drin ist
function updateInvBadge() { const b = document.querySelector('[data-a="inv"]'); if (b && S.game) b.classList.toggle('hasnew', Object.keys(S.game.inv).some((k) => isNew(S.game, k))); }
// 0.23.2 (Nutzer): lila Punkt am Charakter-Knopf, solange ein Held freie Talentpunkte hat
function updateTalBadge() { const b = document.querySelector('[data-a="char"]'); if (b && S.game) b.classList.toggle('hastal', !!S.data.talents && S.game.heroes.some((h) => talentPoints(S.data, h) > 0)); }
// 0.19.6 (Nutzer: „Der viele Text versperrt den Blick auf den Gang“): Außerhalb des Kampfs zeigt das Meldungsfeld höchstens 2 Meldungen,
// jede höchstens 2 Zeilen, und blendet sie nach 3–6 s aus (länger bei langem Text). Im Kampf bleibt alles wie bisher (die letzten 2). Das Protokoll bleibt vollständig.
// 0.23.2 (Nutzer: „Spiel grundsätzlich im Vollbild starten“): Browser erlauben Vollbild nur nach einem Tipp – daher beim ersten Tipp im Titel bzw. auf einen Knopf.
// Als installierte App startet das Spiel ohnehin im Vollbild (manifest: fullscreen).
function autoFullscreen() {
  if (!S.settings || S.settings.autoFs === false || S.fsLeft || S.fsTried || (S.game && S.game.combat) || document.fullscreenElement || !document.documentElement.requestFullscreen) return; // 0.23.11: nach Verlassen des Vollbilds (z. B. kurz aus der App) nicht mehr automatisch zurück – Android zeigt sonst jedes Mal die graue Systemmeldung
  S.fsTried = true; // 0.23.14: höchstens ein automatischer Versuch je Seitenaufruf und nie im Kampf (Android-Systemmeldung erschien sonst „plötzlich“)
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
}
document.addEventListener('pointerdown', () => { if (S.game) autoFullscreen(); }, { capture: true });
setInterval(() => { if (S.game) { updateInvBadge(); updateTalBadge(); } }, 700);
// 0.31.0: Autospeichern alle 10 Minuten (nicht im Kampf, nicht vor Spielstart); Slot „auto“ wie bei Gebietswechseln
const AUTOSAVE_MS = 10 * 60 * 1000;
setInterval(async () => { try { if (S.started && S.game && !S.game.combat && !S.dice && await saveSlot('auto', true)) toast('Automatisch gespeichert.', 1400); } catch { /* egal */ } }, AUTOSAVE_MS); // Punkte an Inventar/Charakter auch ohne neues Bild aktuell halten
// 0.23.1 (Nutzer: nach dem Wechsel ins Vollbild verdecken Informationen das Bild zu lange): Meldungen und Hinweise sofort ausblenden.
function calmScreen() { S.logTs = (S.logTs || []).map(() => 0); const t = $('#toast'); if (t) t.hidden = true; const ev = $('#event'); if (ev) ev.hidden = true; renderLog(); }
document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) S.fsLeft = false; else if (S.game) S.fsLeft = true; if (S.game) calmScreen(); });
function renderLog() {
  const box = $('#log'), combat = !!(S.game && S.game.combat);
  let items;
  if (combat) items = S.log.slice(-2);
  else {
    const now = Date.now(), n = S.log.length, ts = S.logTs || [];
    let next = Infinity; items = [];
    for (let i = Math.max(0, n - 2); i < n; i++) {
      const ttl = 3000, left = ttl - (now - (ts[i] || 0));
      if (left > 0) { items.push(S.log[i]); next = Math.min(next, left); }
    }
    clearTimeout(renderLog.h);
    if (next < Infinity) renderLog.h = setTimeout(renderLog, next + 30);
  }
  box.classList.toggle('calm', !combat);
  document.body.classList.toggle('incombat', !!combat); // 0.34.1: Bewegungsknöpfe im Kampf gedämpft
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
// 0.23.3: Lebensbalken an die Gegnerbilder heften (Lage aus dem Raycaster, s.scr)
function placeFoeTags(sprites) {
  const c = S.game && S.game.combat, ft = $('#foetags');
  if (!c || ft.hidden) return;
  const cv = S.ctx.canvas.getBoundingClientRect(), hr = $('#hud').getBoundingClientRect();
  if (!cv.width) return;
  const kx = cv.width / W, ky = cv.height / H;
  const slot = {}; // je Gruppe: k-te Gestalt = k-ter lebender Gegner dieser Gruppe
  c.enemies.forEach((e, i) => { if (e.hp > 0) (slot[e.objId] = slot[e.objId] || []).push(i); });
  const pos = {};
  for (const s of sprites) if (s.foe && s.scr) { const ei = (slot[s.foe.id] || [])[s.foe.k]; if (ei != null) pos[ei] = s.scr; }
  const top0 = ($('#enemybox').getBoundingClientRect().bottom || 0) - hr.top + 2;
  for (const el of ft.children) {
    const p = pos[+el.dataset.e];
    if (!p) { el.style.visibility = 'hidden'; continue; }
    const w = Math.max(50, Math.min(120, p.w * kx * 0.4));
    let x = cv.left - hr.left + p.cx * kx - w / 2, y = cv.top - hr.top + p.top * ky - 16;
    x = Math.max(cv.left - hr.left + 2, Math.min(cv.right - hr.left - w - 2, x));
    y = Math.max(top0, y);
    el.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${w.toFixed(0)}px;z-index:${Math.round(100 - p.tY * 10)}`;
  }
}
// Heil- und Zaubertränke im Besitz, nach Art und Größe sortiert (0.24.0)
function drinkIds() {
  return Object.keys(S.data.items).filter((id) => { const df = S.data.items[id]; return df.kind === 'consumable' && (df.heal || df.mana) && (S.game.inv[id] || 0) > 0; })
    .sort((p, q) => { const a = S.data.items[p], b = S.data.items[q]; return (a.mana ? 1 : 0) - (b.mana ? 1 : 0) || (a.heal || a.mana) - (b.heal || b.mana); });
}
function renderCombat() {
  const c = S.game.combat, eb = $('#enemybox'), ab = $('#actionbar');
  if (!c) { eb.hidden = true; ab.hidden = true; $('#foetags').hidden = true; return; }
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
  const hint = multi && c.round === 1 ? ' · Gegner antippen = Ziel' : ''; // 0.23.3: Hinweis nur noch in der ersten Runde
  eb.innerHTML = warnBar + `<div class="order"><b>Runde ${c.round}</b>` + (floodLabel(c) ? `<span class="flood">🌊 Flut: ${floodLabel(c)}</span>` : '') + c.order.map((o, i) => {
    const nm = o.side === 'h' ? S.game.heroes[o.idx].name : c.enemies[o.idx].name;
    return `<span class="${(i === c.pos ? 'now' : i < c.pos ? 'done' : '') + (o.side === 'e' ? ' foe' : '')}">${esc(nm)}</span>`;
  }).join('') + (cur && cur.side === 'h' && hint ? `<em>${hint.slice(3)}</em>` : '') + '</div>' + (cur && cur.side === 'h' ? comboHint(cur, S.foe) : ''); // 0.23.4: Kombi-Text für das gewählte Ziel (war seit 0.23.3 unsichtbar)
  // 0.23.3 (Nutzer: „Kasten verdeckt Gegner“): Lebensbalken stehen direkt über den Gegnern im Bild
  const ft = $('#foetags');
  ft.hidden = false;
  ft.innerHTML = c.enemies.map((e, ei) => {
    if (e.hp <= 0) return '';
    const pct = Math.round(100 * e.hp / e.maxHp);
    const tagL = (e.name.match(/ ([A-Z])$/) || [])[1] || '';
    const ic = (e.intent === 'heavy' ? '<i class="w">⚠</i>' : '') + (coveredBy(S.game, S.data, ei) ? '<i title="gedeckt −25 %">🛡</i>' : '') + (e.rage ? '<i class="w" title="Raserei">🔥</i>' : '') + (comboHint(cur, ei) ? '<i class="cb" title="Kombi möglich">✚ Kombi</i>' : '');
    return `<div class="ft${multi && ei === S.foe ? ' sel' : ''}" data-e="${ei}" style="visibility:hidden">${tagL ? '<b>' + tagL + '</b>' : ''}<div class="bar${pct <= 30 ? ' low' : ''}"><i style="width:${pct}%"></i></div>${stIcons('e', ei)}${ic}</div>`;
  }).join('');
  ab.hidden = false;
  const a = currentActor(S.game);
  if (c.over || !a) { ab.hidden = true; return; }
  if (a.side !== 'h' || S.lock) { ab.innerHTML = `<div class="wait">${a.side === 'h' ? esc(S.game.heroes[a.idx].name) + ' ist gleich dran …' : 'Gegner ist am Zug …'}</div>`; return; }
  const potions = drinkIds().reduce((s, id) => s + S.game.inv[id], 0) + (S.game.inv.gegengift || 0) + (S.game.inv.oelflasche || 0);
  const ch = S.game.heroes[a.idx], cab = S.data.classes[ch.cls].ability, cres = S.data.classes[ch.cls].res;
  const inv = S.game.inv, itemRows = [];
  { const row = (n, mk) => { const bs = mk(); if (n > 0 && bs.some((x) => x.ok)) itemRows.push(bs.map((x) => `<button class="ab" data-c="${x.c}" ${x.ok ? '' : whyAttr(x.w)}>${x.t}</button>`).join('')); }; // nur Zeilen zeigen, in denen etwas geht
    const giver = !!S.data.classes[ch.cls].potionGiver; // Alchemist (0.17.0): Tränke an alle Helden
    const SZ = { 15: 'klein', 40: 'mittel', 90: 'groß', 35: 'mittel', 70: 'groß' }; // 0.24.0: Tränke in drei Größen – je Art eine Zeile
    for (const mana of [false, true]) {
      const ids = drinkIds().filter((id) => !!S.data.items[id].mana === mana); if (!ids.length) continue;
      const kind = mana ? 'Zaubertrank' : 'Heiltrank';
      row(1, () => ids.flatMap((id) => {
        const df = S.data.items[id], n = inv[id], sz = SZ[df.heal || df.mana] || '', okFor = (h) => h.hp > 0 && (mana ? h.mp < h.maxMp : h.hp < h.maxHp);
        return giver ? S.game.heroes.map((h, i) => ({ c: `dr:${id}:${i}`, ok: okFor(h), w: wDrink(mana, h), t: `${kind} ${sz} (${n}) → ${esc(h.name)}` })) : [{ c: `dr:${id}:${a.idx}`, ok: okFor(ch), w: wDrink(mana, ch), t: `${kind} ${sz} (${n})` }];
      })); }
    row(inv.gegengift, () => giver ? S.game.heroes.map((h, i) => ({ c: `cure:${i}`, ok: h.hp > 0 && !!statusOf(S.game, 'h', i).poison, w: `${h.name} ist nicht vergiftet.`, t: `Gegengift (${inv.gegengift}) → ${esc(h.name)}` })) : [{ c: `cure:${a.idx}`, ok: ch.hp > 0 && !!statusOf(S.game, 'h', a.idx).poison, w: `${ch.name} ist nicht vergiftet.`, t: `Gegengift (${inv.gegengift}) nehmen` }]);
    row(inv.oelflasche, () => S.game.combat.enemies.map((e, i) => ({ c: `throw:${i}`, ok: e.hp > 0, w: `${e.name} ist schon besiegt.`, t: `Ölflasche (${inv.oelflasche}) → ${esc(e.name)}` }))); }
  const known = knownSpells(S.data, ch);
  const abBtn = known.length > 1 ? `<button class="ab" data-c="spells">✦ Zauber (${known.length})${S.spMode ? ' ▴' : ' ▾'}</button>` : cab ? `<button class="ab" data-c="sp:0"${ch.mp >= cab.cost ? '' : whyAttr(`Zu wenig ${cres.name} (${ch.mp}/${cab.cost}).`)}>✦ ${esc(cab.name)} (${cab.cost} ${esc(cres.name)})</button>` : '';
  let html = `<button class="ab" data-c="attack">⚔ Angriff</button><button class="ab${heavyNow.length ? ' pulse' : ''}" data-c="defend">⛨ Verteidigen</button><button class="ab" data-c="item"${potions ? '' : whyAttr('Keine Tränke oder Gegengifte im Beutel.')}>Gegenstand (${potions})</button>${abBtn}${multi ? `<button class="ab" data-c="sweep">⚔ Alle (${SWEEP_MULT} %)</button>` : ''}`;
  if (S.itemMode) {
    html += itemRows.length ? itemRows.map((r) => `<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">${r}</div>`).join('') : `<div class="wait" style="flex:1 0 100%">${esc(ch.name)} hat volle LP und kein Gift. Heiltrank und Gegengift wirkt nur auf den, der dran ist (Ausnahme: Alchemist).</div>`;
  }
  if (S.spMode && known.length > 1) {
    html += '<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">' + known.map((sp, i) =>
      `<button class="ab" data-c="sp:${i}"${ch.mp >= sp.cost ? '' : whyAttr(`Zu wenig ${cres.name} (${ch.mp}/${sp.cost}).`)}>${esc(sp.name)} (${sp.cost} ${esc(cres.name)})${sp.all ? ' · alle' : ''}</button>`).join('') + '</div>';
  }
  const sel = known[S.spSel];
  if (S.abMode && sel && sel.kind === 'revive') { // 0.53.0: Tote erwecken – nur bewusstlose Helden sind Ziel
    html += '<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">' + S.game.heroes.map((h, i) =>
      `<button class="ab" data-c="abheal:${i}"${h.hp <= 0 && !(S.game.combat && S.game.combat.awakened) ? '' : whyAttr(h.hp > 0 ? `${h.name} ist nicht bewusstlos.` : 'Schon einmal gewirkt in diesem Kampf.')}>${esc(sel.name)} → ${esc(h.name)}</button>`).join('') + '</div>';
  }
  if (S.abMode && sel && sel.kind === 'heal' && !sel.all) {
    html += '<div style="flex:1 0 100%;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">' + S.game.heroes.map((h, i) =>
      `<button class="ab" data-c="abheal:${i}"${h.hp > 0 && (h.hp < h.maxHp || canCleanse(sel, statusOf(S.game, 'h', i))) ? '' : whyAttr(h.hp > 0 ? `${h.name} hat volle LP.` : `${h.name} ist bewusstlos.`)}>${esc(sel.name)} → ${esc(h.name)}</button>`).join('') + '</div>';
  }
  ab.innerHTML = html;
}

// ---------------------------------------------------------------- Dialoge
// 0.25.0 Begegnungsdialoge (Nutzerwunsch: Auswahl wie bei EOB2 mit spürbaren Folgen)
function openDialog(id, node) {
  const g = S.game, npc = g.objs.find((o) => o.id === id);
  if (!npc) return;
  const nid = node || dialogStartNode(g, S.data, npc), v = dialogView(g, S.data, npc, nid);
  if (!v) return;
  S.dlg = { id, node: nid };
  const en = dialogEnter(g, S.data, npc, nid), nd = ((S.data.dialogs[npc.dialog] || {}).nodes || {})[nid];
  if (en.newNote) say('Ins Notizbuch eingetragen.');
  const noted = nd && nd.note && (g.journal || []).some((e) => e.id === 'dlg:' + npc.id + ':x') ? '<p class="muted" style="margin:0 0 10px">✔ Im Notizbuch eingetragen</p>' : '';
  openModal(`<h2>${esc(v.name)}</h2><p style="font-style:italic;line-height:1.45;margin:6px 0 10px">${esc(v.text)}</p>${noted}<div class="acts" style="flex-direction:column;align-items:stretch">${v.choices.map((c) => `<button class="mb" data-m="dlg:${c.i}" ${c.ok ? '' : 'disabled'}>${esc(c.t)}</button>`).join('')}</div>`, 'dialog');
}
// 0.43.0: Schlafkammer-Bild (scene.js) bei jeder Rast, ca. 5 s; Zimmer wechselt je Rast
function sleepScene(camp = false) { // 0.47.3: camp = Rast im Dungeon (Gang ohne Betten); Taverne behält das Zimmerbild
  const g = S.game; g.restN = (g.restN || 0) + 1;
  return new Promise((res) => startSleepScene(g.heroes, g.restN * 7 + (g.steps || 0), res, 5000, camp));
}
async function dialogPick(i) {
  const g = S.game, d = S.dlg, npc = d && g.objs.find((o) => o.id === d.id);
  if (!npc) return;
  const r = dialogChoose(g, S.data, npc, d.node, i);
  if (r.error) return;
  if (r.msg) { say(r.msg); toast(r.msg, 4000); }
  if (r.sfx) S.sfx.play(r.sfx);
  if (r.encounter) { closeModal(); renderAll(); startCombatUI(r.encounter); return; }
  if (r.goto) { closeModal(); const t = travelTo(g, S.data, r.goto, r.msg); if (!t.ok) { say(t.msg); renderAll(); return; } S.sfx.play('door'); await afterAreaChange(t); return; } // 0.28.0: Fähre
  if (r.inn) { closeModal(); renderAll(); await sleepScene(); renderAll(); try { await saveSlot('auto', true); } catch { /* egal */ } return; } // 0.43.0: Zimmer mit Schlafkammer-Bild
  if (r.tavern) { S.tav = { pi: null, sure: null }; openTavern(); return; } // 0.34.0: Taverne
  if (r.maps) { openMaps(); return; } // 0.40.0: Schatzkarten
  if (r.board) { openBoard(); return; } // 0.40.0: Aushangbrett
  if (r.exorcise) { openExorcise(); return; } // 0.46.0: Hexe
  if (r.smith) { openSmith(); return; } // 0.53.0: Schmied
  if (r.game) { closeModal(); openDice(d.id); return; } // 0.32.0: Würfelspiel mit Murmel
  if (r.next) { openDialog(d.id, r.next); renderAll(); return; }
  closeModal(); renderAll();
  try { if (!g.combat) await saveSlot('auto', true); } catch { /* egal */ }
}
// ---------- Taverne (0.34.0): Reserve, Heldentausch, Anwerben; Logik: logic.js (recruitHero, swapHero, dismissReserve) ----------
function tavSync() { // Eingaben der Anwerbe-Zeile merken, bevor die Oberfläche neu gezeichnet wird
  const t = S.tav = S.tav || { pi: null, sure: null }, n = $('#tv-name'), r = $('#tv-race'), c = $('#tv-cls');
  if (n) t.name = n.value; if (r) t.race = r.value; if (c) t.cls = c.value;
  return t;
}
function openTavern() {
  const g = S.game, d = S.data, t = S.tav = S.tav || { pi: null, sure: null }, res = g.reserve || [];
  const rn = (k) => esc(d.races[k].name), cn = (k) => esc(d.classes[k].name);
  const line = (h) => `<b>${esc(h.name)}</b> · ${rn(h.race)} ${esc(h.role)} · Stufe ${h.level} · ${h.row === 'front' ? 'vorn' : 'hinten'}<div class="muted">LP ${Math.ceil(h.hp)}/${h.maxHp}${h.maxMp ? ` · ${esc((d.classes[h.cls].res || {}).name || 'Ressource')} ${h.mp}/${h.maxMp}` : ''}${h.hp <= 0 ? ' · bewusstlos' : ''}</div>`;
  const party = g.heroes.map((h, i) => `<div class="row nw"><div>${line(h)}</div><button class="mb${t.pi === i ? ' primary' : ''}" data-m="tav-pick:${i}">${t.pi === i ? 'Gewählt' : 'Tauschen'}</button></div>`).join('');
  const resv = res.length ? res.map((h, i) => `<div class="row nw"><div>${line(h)}</div><div style="display:flex;flex-direction:column;gap:4px"><button class="mb" data-m="tav-in:${i}" ${t.pi == null ? 'disabled' : ''}>${t.pi == null ? 'Platz wählen' : 'Einwechseln'}</button><button class="mb${t.sure === i ? ' primary' : ''}" data-m="tav-out:${i}">${t.sure === i ? 'Wirklich?' : 'Verabschieden'}</button></div></div>`).join('') : '<p class="muted">Niemand wartet hier. Wer hier wartet, bekommt ' + ((d.tavern || {}).reserveXp || 0) + ' % der Erfahrung.</p>';
  const cost = recruitCost(g, d), full = res.length >= RESERVE_MAX;
  const opt = (obj, sel) => Object.keys(obj).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(obj[k].name)}</option>`).join('');
  openModal(`<h2>Taverne – Gruppe verwalten</h2><p>Gold: <b>${g.gold}</b></p>
    <h3>Gruppe (tippe „Tauschen“, dann „Einwechseln“)</h3>${party}
    <h3>Reserve (${res.length}/${RESERVE_MAX})</h3>${resv}
    <h3>Neu anwerben</h3><p class="muted">Der Neue kommt mit Stufe ${partyAvgLevel(g)} (Durchschnitt der Gruppe) in die Reserve.</p>
    <div class="row"><input type="text" id="tv-name" maxlength="${NAME_MAX}" placeholder="Name" autocomplete="off" autocapitalize="words" spellcheck="false" value="${esc(t.name || '')}"></div>
    <div class="row"><select id="tv-race">${opt(d.races, t.race || Object.keys(d.races)[0])}</select><select id="tv-cls">${opt(d.classes, t.cls || Object.keys(d.classes)[0])}</select></div>
    <div class="acts"><button class="mb primary" data-m="tav-hire" ${full || g.gold < cost ? 'disabled' : ''}>${full ? 'Reserve voll' : `Anwerben (${cost} G)`}</button>${closeBtn}</div>`, 'tavern');
}
// ---------- Schatzkarten und Aushangbrett (0.40.0); Logik: logic.js (mapOffers, buyMap, boardView, boardTurnIn, boardDismiss) ----------
function openMaps() {
  const g = S.game, offers = mapOffers(g, S.data);
  const rows = offers.length ? offers.map((o) => `<div class="row nw"><div><b>${esc(o.name)}</b><div class="muted">${o.owned ? 'Schon gekauft – das Kreuz steht auf der Gebietskarte.' : `Führt zu einem verborgenen Raum in „${esc(o.area)}“.`}</div></div><button class="mb${o.owned ? '' : ' primary'}" data-m="map-buy:${o.id}" ${o.ok ? '' : 'disabled'}>${o.owned ? 'Gekauft' : `${o.price} G`}</button></div>`).join('') : '<p class="muted">Marga schüttelt den Kopf: „Für Gegenden, die ihr nie betreten habt, zeichne ich nichts.“</p>';
  const q = mapQuota(g), wait = Math.ceil(q.waitMs / 60000);
  const quota = q.left > 0 ? `Marga: „Höchstens ${MAP_MAX} Karten je Besuch. ${q.left === MAP_MAX ? 'Heute habt ihr noch keine genommen.' : `Ihr könnt noch ${q.left} nehmen.`}“` : `Marga: „Für heute habt ihr genug Karten. Kommt in ${wait >= 60 ? 'etwa einer Stunde' : `${wait} Minuten`} wieder.“`;
  openModal(`<h2>Schatzkarten</h2><p>Gold: <b>${g.gold}</b></p><p class="muted">Eine Karte zeigt auf der Gebietskarte ein Kreuz an einer Wand. Nur mit der Karte im Beutel lässt sie sich öffnen. Für jedes Gebiet gibt es eine, und nur Gebiete, die ihr schon besucht habt.</p><p><i>${quota}</i></p>${rows}<div class="acts">${closeBtn}</div>`, 'maps');
}
function openBoard() {
  const g = S.game, list = boardView(g, S.data);
  const icon = { kill: '⚔', trophy: '✦', gear: '⚒' };
  const rows = list.length ? list.map((v) => `<div class="row nw"><div><b>${icon[v.type] || ''} ${esc(v.title)}</b><div>${esc(v.text)}</div><div class="muted">Belohnung: ${v.xp} EP${v.gold ? ` und ${v.gold} Gold` : ''} · ${v.type === 'kill' ? `Fortschritt ${v.have}/${v.need}` : v.have ? 'Liegt im Beutel' : 'Noch nicht beschafft'}</div></div><div style="display:flex;flex-direction:column;gap:4px"><button class="mb${v.ready ? ' primary' : ''}" data-m="bd-in:${v.id}" ${v.ready ? '' : 'disabled'}>Abgeben</button><button class="mb" data-m="bd-x:${v.id}">Abreißen</button></div></div>`).join('') : '<p class="muted">Das Brett ist leer. Ein paar Schritte weiter hängt vielleicht ein neuer Zettel – oder es gibt noch nichts, was zu euren Gebieten passt.</p>';
  openModal(`<h2>Aushangbrett</h2><p class="muted">Steckbriefe zählen ab dem Aushang. Erfahrung gibt es für alle Helden, die noch stehen. Neue Zettel erscheinen nach etwa 60 Schritten.</p>${rows}<div class="acts">${closeBtn}</div>`, 'board');
}
// ---------- Hexe Ysolde (0.46.0); Logik: logic.js (cursedOwned, exorcise) ----------
function openExorcise() {
  const g = S.game, list = cursedOwned(g, S.data), pot = S.data.items[EXORCISE.item].name, have = g.inv[EXORCISE.item] || 0;
  const rows = list.length ? list.map((o) => `<div class="row nw"><div><b>${esc(o.name)}</b>${o.worn ? ` <span class="muted">(getragen von ${esc(o.worn)})</span>` : ''}<div class="muted">Fluch: ${esc(o.curse)}</div></div><button class="mb${o.ok ? ' primary' : ''}" data-m="exo:${o.id}" ${o.ok ? '' : 'disabled'}>Entfluchen</button></div>`).join('') : '<p class="muted">Ysolde schaut in euren Beutel und zuckt die Schultern: „Nichts Verfluchtes dabei. Noch.“</p>';
  openModal(`<h2>Ysolde entflucht</h2><p>Gold: <b>${g.gold}</b> · ${esc(pot)}: <b>${have}</b></p><p class="muted">Preis je Gegenstand: ${EXORCISE.gold} Gold und ${esc(pot)}. Sie nimmt nur den Fluch, nie den Nutzen. Auch getragene Stücke. Noch unerkannte Flüche zeigt sie nicht an: erst wenn ein Fluch bekannt ist, steht das Stück hier.</p>${rows}<div class="acts">${closeBtn}</div>`, 'exo');
}
function exoAct(m) {
  const r = exorcise(S.game, S.data, m.slice(4));
  const bad = { 'in-combat': 'Im Kampf geht das nicht.', gold: `Dafür fehlen ${r.cost} Gold.`, item: `Ysolde braucht: ${r.item}.` }[r.error];
  if (r.msg) { say(r.msg); S.sfx.play(r.sfx || 'ui'); toast(r.msg, 5000); } else toast(bad || 'Das geht nicht.', 3200);
  const sc = $('#modal-box').scrollTop; renderAll(); openExorcise(); $('#modal-box').scrollTop = sc;
}
// ---------- Schmied (0.53.0); Logik: logic.js (smithJobs, smithUpgrade) ----------
function openSmith() {
  const g = S.game, list = smithJobs(g, S.data);
  const rows = list.length ? list.map((j) => `<div class="row nw"><div><b>${esc(j.name)}</b> <span class="muted">${esc(j.from)} → ${esc(j.to)}${j.worn ? ` · getragen von ${esc(j.worn)}` : ''}</span><div class="muted">Danach: ${esc(j.gain)}</div></div><button class="mb${j.ok ? ' primary' : ''}" data-m="smi:${j.id}" ${j.ok ? '' : 'disabled'}>Aufwerten (${j.cost} G)</button></div>`).join('') : '<p class="muted">Der Schmied dreht eure Stücke in der Hand: „Hier gibt es nichts mehr zu verbessern. Bringt mir Waffen und Rüstungen, die noch nicht Selten sind.“</p>';
  openModal(`<h2>Schmied Brann</h2><p>Gold: <b>${g.gold}</b></p><p class="muted">Er hebt Waffen und Rüstungen um eine Stufe, höchstens bis Selten. Gewöhnlich → Gut: +1 auf den Hauptwert. Gut → Selten: eine Zufallseigenschaft. Der Preis steht am Knopf. Ringe, Amulette, Einzigartiges und Set-Teile fasst er nicht an. Auch getragene Stücke.</p>${rows}<div class="acts">${closeBtn}</div>`, 'smith');
}
function smiAct(m) {
  const r = smithUpgrade(S.game, S.data, m.slice(4));
  const bad = { 'in-combat': 'Im Kampf geht das nicht.', gold: `Dafür fehlen ${r.cost} Gold.`, unknown: 'Das Stück ist nicht mehr zu verbessern.' }[r.error];
  if (r.msg) { say(r.msg); S.sfx.play(r.sfx || 'ui'); toast(r.msg, 5000); } else toast(bad || 'Das geht nicht.', 3200);
  const sc = $('#modal-box').scrollTop; renderAll(); openSmith(); $('#modal-box').scrollTop = sc;
}
function wirtAct(m) {
  const g = S.game;
  let r = null;
  if (m.startsWith('map-buy:')) r = buyMap(g, S.data, m.slice(8));
  else if (m.startsWith('bd-in:')) r = boardTurnIn(g, S.data, m.slice(6));
  else if (m.startsWith('bd-x:')) r = boardDismiss(g, S.data, m.slice(5));
  if (r) {
    const bad = { 'in-combat': 'Im Kampf geht das nicht.', 'gold': `Dafür fehlen ${r.cost} Gold.`, 'owned': 'Diese Karte habt ihr schon.', 'limit': `Marga: „Für heute habt ihr genug Karten. Kommt in ${Math.ceil((r.waitMs || 0) / 60000)} Minuten wieder.“`, 'not-ready': 'Dafür fehlt noch etwas.' }[r.error];
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx || 'ui'); toast(r.msg, 5000); } else toast(bad || 'Das geht nicht.', 3200);
  }
  const sc = $('#modal-box').scrollTop; renderAll(); (m.startsWith('map-buy:') ? openMaps : openBoard)(); $('#modal-box').scrollTop = sc;
}
function tavAct(m) {
  const g = S.game, t = tavSync();
  let r = null;
  if (m.startsWith('tav-pick:')) { const i = +m.slice(9); t.pi = t.pi === i ? null : i; t.sure = null; }
  else if (m.startsWith('tav-in:')) { r = swapHero(g, S.data, t.pi, +m.slice(7)); if (!r.error) t.pi = null; t.sure = null; }
  else if (m.startsWith('tav-out:')) { const i = +m.slice(8); if (t.sure !== i) t.sure = i; else { r = dismissReserve(g, S.data, i); t.sure = null; } }
  else if (m === 'tav-hire') { r = recruitHero(g, S.data, { name: t.name || '', race: t.race || Object.keys(S.data.races)[0], cls: t.cls || Object.keys(S.data.classes)[0] }); if (!r.error) { t.name = ''; t.sure = null; } }
  if (r) {
    const bad = { 'no-front': 'Mindestens ein Held muss in der Vorderreihe stehen.', 'full': 'Die Reserve ist voll (vier Betten).', 'name': 'Bitte einen Namen eingeben.', 'name-bad': 'Dieser Name ist nicht erlaubt.', 'name-taken': 'Diesen Namen trägt schon jemand.', 'gold': `Dafür fehlen ${r.cost} Gold.`, 'in-combat': 'Im Kampf geht das nicht.' }[r.error];
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx || 'ui'); toast(r.msg, 3500); } else toast(bad || 'Das geht nicht.', 3200);
  }
  const sc = $('#modal-box').scrollTop; renderAll(); openTavern(); $('#modal-box').scrollTop = sc; // Bildlauf bleibt erhalten
  if (r && r.msg) saveSlot('auto', true).catch(() => {});
}
// ---------- Würfelspiel mit Murmel (0.32.0), Regeln und Logik: logic.js (diceNew … diceFinish) ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHtml = (n, cls = '', attr = '') => `<span class="die ${cls}" ${attr}>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<i class="${n && PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;
function openDice(npcId) { S.dice = { npcId, g: null, res: null, line: '' }; renderDice(); }
function renderDice() {
  const D = S.dice, cfg = S.data.dicegame, g = S.game;
  if (!D) return;
  if (!D.g) { // Einsatzwahl
    openModal(`<h2>Würfeln mit Murmel</h2><p style="line-height:1.4;margin:4px 0 8px">${esc(cfg.rules)}</p><p style="margin:4px 0 6px">Einsatz wählen (Gewinn = doppelter Einsatz, Gold: ${g.gold}):</p>
      <div class="acts" style="flex-direction:column;align-items:stretch">${cfg.stakes.map((st) => `<button class="mb" data-m="dice-stake:${st}" ${g.gold >= st ? '' : 'disabled'}>${st ? st + ' Gold' : 'Nur zum Spaß (kein Einsatz)'}</button>`).join('')}<button class="mb" data-m="dice-cancel">Doch nicht</button></div>`, 'dice');
    return;
  }
  const d = D.g, sum = (a) => a.reduce((x, y) => x + y, 0), keep = d.phase === 'keep', shown = d.phase === 'keep' || d.phase === 'show' || d.phase === 'end';
  const mine = shown ? d.p.map((v, i) => dieHtml(v, (d.rerolled === i && d.phase !== 'keep' ? 'sel ' : '') + (keep ? 'tap' : ''), keep ? `data-m="dice-re:${i}"` : '')).join('') : [0, 0, 0].map(() => dieHtml(0)).join('');
  const his = shown ? d.m.map((v, i) => dieHtml(v, 'red' + (d.mrerolled === i && d.phase !== 'keep' ? ' sel' : ''))).join('') : [0, 0, 0].map(() => dieHtml(0, 'red')).join('');
  let foot = '', info = '';
  if (d.phase === 'roll') { info = d.round === 1 && !d.history.length ? 'Beide würfeln drei Würfel.' : 'Nächste Würfe.'; foot = `<button class="mb primary" data-m="dice-roll">Würfeln</button><button class="mb" data-m="dice-giveup">Aufgeben</button>`; }
  else if (keep) { info = 'Tippt einen eurer Würfel an, um ihn neu zu werfen – oder behaltet alle.'; foot = `<button class="mb primary" data-m="dice-re:-1">Behalten</button>`; }
  else if (d.phase === 'show') { info = `${D.line} (${sum(d.p)} : ${sum(d.m)})`; foot = `<button class="mb primary" data-m="dice-next">Weiter</button>`; }
  else if (d.phase === 'end') { info = `${d.won ? 'Ihr gewinnt das Spiel.' : 'Murmel gewinnt das Spiel.'} ${D.res ? D.res.msg : ''}`; foot = `<button class="mb primary" data-m="dice-done">Weiter</button>`; }
  const tot = shown ? `<div class="dsum">${sum(d.p)}</div>` : '<div class="dsum">·</div>', tot2 = shown ? `<div class="dsum">${sum(d.m)}</div>` : '<div class="dsum">·</div>';
  openModal(`<h2>Würfeln mit Murmel</h2><div class="dscore">Einsatz ${d.stake ? d.stake + ' Gold' : 'keiner'} · Runde ${d.round} · Ihr ${d.pw} : ${d.mw} Murmel</div>
    <div class="drow"><b>Murmel</b>${his}${tot2}</div><div class="drow"><b>Ihr</b>${mine}${tot}</div>
    <p class="dinfo">${esc(info)}</p><div class="acts" style="margin-top:6px">${foot}</div>`, 'dice');
}
async function diceAction(m) {
  const D = S.dice, g = S.game; if (!D) { closeModal(); return; }
  const npc = g.objs.find((o) => o.id === D.npcId);
  if (m.startsWith('dice-stake:')) { const r = diceNew(g, S.data, +m.slice(11)); if (r.error) { toast('Nicht genug Gold.'); return; } D.g = r.g; renderAll(); renderDice(); return; }
  if (!D.g) { S.dice = null; closeModal(); return; } // dice-cancel
  if (m === 'dice-roll') { diceRoll(g, D.g); renderDice(); return; }
  if (m.startsWith('dice-re:')) { const i = +m.slice(8); if (D.g.phase !== 'keep') return; diceKeep(g, D.g, i < 0 ? null : i); D.line = diceRoundLine(g, S.data, D.g); renderDice(); return; }
  if (m === 'dice-next') { diceNext(D.g); if (D.g.phase === 'end') { D.res = diceFinish(g, S.data, npc, D.g); S.sfx.play(D.g.won ? 'chest' : 'warn'); renderAll(); } renderDice(); return; }
  if (m === 'dice-giveup') { if (D.g.phase !== 'roll' && D.g.phase !== 'keep') return; D.g.won = false; D.g.phase = 'end'; D.res = diceFinish(g, S.data, npc, D.g); S.sfx.play('warn'); renderAll(); renderDice(); return; }
  if (m === 'dice-done') {
    const res = D.res; S.dice = null; closeModal();
    if (res && res.msg) { say(res.msg); toast(res.msg, 5000); }
    if (res && res.devil) { S.lvl = getLevel(S.data, g); S.held = []; S.queued = null; renderAll(); startCombatUI(res.encounter); return; } // Raum ist jetzt der Spielsalon
    renderAll();
    try { if (!g.combat) await saveSlot('auto', true); } catch { /* egal */ }
  }
}
function openModal(html, kind = 'generic') {
  $('#modal-box').innerHTML = html;
  $('#modal-box').dataset.kind = kind; // z. B. breiteres Kartenfenster (CSS)
  $('#modal').hidden = false;
  if (!S.modal) S.modalAt = performance.now(); // 0.31.5: Schutzzeit gegen durchgereichte Tipps (Tipp auf „Inventar“ traf im neuen Fenster z. B. „Rasten“)
  S.modal = kind;
  S.held = [];
  $('#modal-box').scrollTop = 0;
}
function closeModal() { if (S.modal === 'dice') S.dice = null; if (S.modal === 'inventory' && S.game) { clearNew(S.game); updateInvBadge(); } $('#modal').hidden = true; $('#modal-box').innerHTML = ''; S.modal = null; S.dlg = null; S.invUse = null; S.invEquip = null; S.invSell = null; S.shopId = null; S.shopSure = null; }
const closeBtn = '<button class="mb" data-m="close">Schließen</button>';

// 0.47.0: Pergamentseite (Vorgeschichte, Runensteine). Absätze durch Leerzeile getrennt; Schließen über data-m=close.
function openParchment(title, text, button) {
  const paras = String(text || '').split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('');
  openModal(`<div class="parch"><div class="ph">❦ ${esc(title)} ❦</div><div class="pr"></div>${paras}<div class="pr"></div><div class="pseal">✦</div><div class="acts" style="justify-content:center"><button class="mb primary" data-m="close">${esc(button || 'Weiter')}</button></div></div>`, 'parchment');
}
function openMenu() {
  openModal(`<h2>Menü</h2><div class="acts" style="flex-direction:column;align-items:stretch">
    <button class="mb primary" data-m="close">Weiterspielen</button>
    <button class="mb" data-m="map">Karte</button>
    <button class="mb" data-m="rest">Rasten (Proviant: ${S.game ? (S.game.inv.ration || 0) : 0})</button>
    <button class="mb" data-m="settings">Einstellungen</button>
    <button class="mb" data-m="errlog">Fehlerlog (${ERR.list.length})</button>
    <button class="mb" data-m="save">Speichern</button>
    <button class="mb" data-m="load">Laden</button>
    <button class="mb" data-m="export">Spielstand exportieren (Datei)</button>
    <button class="mb" data-m="import">Spielstand importieren (Datei)</button>
    <button class="mb" data-m="clog">Kampfprotokoll</button>
    <button class="mb" data-m="journal">Notizbuch (${S.game && S.game.journal ? S.game.journal.length : 0})</button>
    <button class="mb" data-m="bestiary">Bestiarium</button><button class="mb" data-m="achv">Erfolge</button>
    <button class="mb" data-m="help">Steuerung &amp; Info</button>
    <button class="mb" data-m="title">Zum Titelbild</button>
    <button class="mb" data-m="quit">Spiel beenden</button>${S.settings.debug ? '<button class="mb" data-m="debug">Debug</button>' : ''}</div>`, 'menu');
}
function helpHtml() {
  return `<h2>Steuerung &amp; Info</h2>
  <h3>Links: Bewegung</h3><p>↑ Vor, ↓ Zurück, ← → seitwärts, ↶ ↷ um 90° drehen. Gedrückt halten wiederholt die Bewegung.</p>
  <h3>Rechts: Aktionen</h3><p>◉ Interagieren (Türen, Truhen, Hebel, Gegner ansprechen; Türen und Truhen gehen auch auf, wenn du gegen sie läufst oder sie direkt vor dir antippst), ⚔ Angriff, ✦ Fähigkeit (nur im Kampf, kostet Mana oder Ausdauer). Bei mehreren Gegnern: Gegner antippen = Ziel wählen, „Alle“ trifft jeden Gegner mit 60 % Schaden, ▣ Inventar (Heldenleiste: LP · Mana in Blau bzw. Ausdauer in Gelb), ☻ Charakter (dort „Talente“: ab Stufe 2 gibt jede Stufe einen Punkt; drei Zweige je Beruf, außerdem neue Fähigkeiten).</p>
  <h3>Kombinationsangriffe</h3><p>Automatisch, wenn ein Held einen Gegner trifft, der einen passenden Status von einem <b>anderen</b> Helden trägt. Im Kampf zeigt „✚ Kombi“ am Gegner, was gerade möglich ist.</p>${S.data.combos.map((c) => `<p class="muted" style="margin:2px 0">✚ <b>${esc(c.name)}</b>: ${esc(c.desc)}</p>`).join('')}
  <h3>Fallen</h3><p>Fallen verraten sich durch eine feine Spur am Boden oder eine Warnung an der Wand. ◉ auf das Feld vor dir untersucht den Boden, ein zweites ◉ entschärft die Falle. Helden mit Fallen-Talent (Schurke, Waldläufer, Alchemist) bemerken und entschärfen sie eher. Ausgelöste Fallen kosten LP, töten aber niemanden.</p>
  <h3>Illusionswände</h3><p>Manche Wände sind nur ein Trugbild: man kann hindurchgehen. Sie verbergen nie den Hauptweg, nur Geheimnisse. Hinweise geben Inschriften in der Nähe; Helden, die Geheimwände spüren, bemerken ein Flimmern. Auf der Karte erscheint der Durchgang erst, wenn ihr hindurchgegangen seid.</p>
  <h3>Talent-Sondereffekte (★)</h3><p>Das dritte Talent jedes Zweigs hat einen besonderen Effekt (mit ★ markiert), z. B. Gegner auf sich ziehen, nie überfallen werden, Kettenreaktion oder Manaschild. Gruppenwirkungen (Kampfruf, Schutzschild, Giftschutz, Nachsorge) gelten für alle.</p>
  <h3>Gegnertaktik</h3><p>Wachen (🛡) decken ihre Verbündeten: solange eine Wache steht, nehmen die anderen 25 % weniger Schaden – zuerst die Wache. Rudeltiere geraten in Raserei (🔥), wenn ein Verbündeter fällt. Manche Gegner zielen bevorzugt auf Heiler.</p><h3>Ausrüstungseffekte und Sets</h3><p>Besondere Stücke haben Effekte wie Lebensraub, Dornen oder Ausweichen. Zwei passende Set-Teile (Waffe und Rüstung) am selben Helden geben einen zusätzlichen Bonus. Effekte und Sets stehen im Charakterbogen.</p>
  <h3>Truhen</h3><p>Manche Truhen sind verschlossen: ein Dietrich (bei Hedda) oder ein Held mit Schlosstalent öffnet sie; misslingt es dem Talent, klemmt das Schloss bis zur nächsten Rast. Manche Truhen tragen eine Falle – wer sie bemerkt, entschärft sie mit ◉. Und nicht jede Truhe ist eine Truhe.</p><h3>Talente außerhalb des Kampfes</h3><p>Schlösser (Schurke, Alchemist), Geheimwände spüren (Waldläufer, Magier: zeigt auch, wo der Mechanismus liegt), Fallen (Schurke, Waldläufer, Alchemist) und Feilschen bei Händlern (Schurke, Alchemist). Es zählt der beste wache Held.</p>
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
  let html = `<h2>${esc(sh.name)}</h2>${greet ? `<p class="muted">${esc(sh.greeting)}</p>` : ''}<p>Gold: <b>${g.gold}</b></p>${haggle(g, d) > 0 ? `<p class="muted">Feilschen (Talent): Preise −${haggle(g, d)} %, Verkauf +${haggle(g, d)} %</p>` : ''}
    <div class="acts" style="margin-top:0"><button class="mb${tab === 'buy' ? ' primary' : ''}" data-m="shopbuy">Kaufen</button><button class="mb${tab === 'sell' ? ' primary' : ''}" data-m="shopsellTab">Verkaufen</button></div>`;
  if (tab === 'buy') {
    html += shopStock(d, shopId).map((e) => {
      const it = d.items[e.item], p = buyPrice(g, d, e.item), have = g.inv[e.item] || 0, left = shopLeft(g, d, shopId, e.item);
      return `<div class="row nw"><div><b>${itemIcon(e.item, it)}${esc(it.name)}</b>${have ? ` <span class="muted">(im Beutel: ${have})</span>` : ''} <span class="muted">· Vorrat: ${left}</span><div class="muted">${esc(it.desc)}</div></div><button class="mb" data-m="buy:${e.item}" ${left > 0 && g.gold >= p ? '' : 'disabled'}>${left > 0 ? `Kaufen (${p} G)` : 'Ausverkauft'}</button></div>`;
    }).join('');
    const wait = shopRestockIn(g, shopId); // 0.47.9: Nachschub nur in echter Zeit
    if (wait > 0) html += `<p class="muted">Nachschub in etwa ${Math.ceil(wait / 60000)} Min. (echte Zeit).</p>`;
  } else {
    const rows = stackedInv(g, d, (id) => sellPrice(g, d, id) != null).map((gr) => [gr.id, gr.n]);
    html += rows.length ? rows.map(([id, n]) => {
      const it = itemDef(g, d, id), p = sellPrice(g, d, id), sure = S.shopSure === id;
      return `<div class="row nw"><div><b>${itemIcon(id, it)}${qTag(id, it)}</b> × ${n}<div class="muted">${esc(it.desc)}</div></div><button class="mb${sure ? ' primary' : ''}" data-m="shopsell:${id}">${sure ? 'Wirklich verkaufen' : 'Verkaufen'} (${p} G)</button></div>`;
    }).join('') : '<p class="muted">Du hast nichts, was sie kaufen würde. Getragene Ausrüstung musst du erst ablegen.</p>';
  }
  html += `<div class="acts">${closeBtn}</div>`;
  openModal(html, 'shop');
}
function openAchievements() { // 0.41.0: Erfolge, abgeleitet aus dem Spielstand
  const g = S.game, list = achievements(g, S.data);
  const rows = list.map((a) => `<div style="border:1px solid #5a4a30;border-radius:5px;padding:8px;margin:6px 0"><b>${esc(a.name)}</b> ${'★'.repeat(a.tier)}${'☆'.repeat(a.steps.length - a.tier)}<div class="muted">${esc(a.what)}: ${a.n}${a.next ? ` (nächste Stufe bei ${a.next})` : ' – alle Stufen erreicht'}</div></div>`).join('');
  openModal(`<h2>Erfolge</h2><p class="muted">Sie ergeben sich aus dem Spielstand. Eine Belohnung gibt es nur in Ehren.</p>${rows}<div class="acts"><button class="mb" data-m="menu">Zurück</button></div>`, 'achv');
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
    if (r.guard && e.guard) L.push('Wache: deckt ihre Verbündeten (−25 % Schaden), solange sie steht.');
    if (r.enrage && e.enrage) L.push('Gerät in Raserei, wenn ein Verbündeter fällt (+25 % Angriff).');
    if (r.onHit && e.onHit) L.push(`Trefferwirkung: ${esc(d.statuses[e.onHit.status].name)} (${e.onHit.chance} %)`);
    const rs = Object.keys(r.resist || {}).map((el) => { const v = (e.resist || {})[el] || 0; return v >= 100 ? `immun gegen ${esc(d.elements[el].name)}` : `${v > 0 ? 'resistent gegen' : 'anfällig für'} ${esc(d.elements[el].name)} (${v > 0 ? '−' : '+'}${Math.abs(v)} % Schaden)`; });
    if (rs.length) L.push('Elemente: ' + rs.join(', '));
    if (e.phases) L.push(`Phasen erreicht: ${r.phase || 0} von ${e.phases.length}${(r.phase || 0) > 0 ? ' – ' + e.phases.slice(0, r.phase).map((p) => esc(p.name)).join(', ') : ''}`);
    if (d.mastery && !e.boss) { const ml = masteryLevel(g, d, k), nx = d.mastery.at[ml]; L.push(`Meisterschaft: ${ml ? 'I'.repeat(ml) : '–'}${nx ? ` (nächste bei ${nx} Siegen, jetzt ${(g.kills && g.kills[k]) || 0})` : ' (höchste Stufe)'}`); }
    return `<div style="${BX}"><b>${esc(e.name)}${e.boss ? ' · Boss' : ''}</b>${L.map((t) => `<div class="muted">${t}</div>`).join('')}</div>`;
  }).join('');
  openModal(`<h2>Bestiarium</h2><p class="muted">Entdeckt: ${known.length} von ${ids.length}. Werte, Elemente und Besonderheiten werden im Kampf aufgedeckt.</p>${cards}<div class="acts"><button class="mb" data-m="menu">Zurück</button></div>`, 'bestiary');
}
function openJournal() { // 0.35.0: gesammelte Hinweise, nach Gebiet geordnet
  const g = S.game, d = S.data, j = g.journal || [];
  const BX = 'border:1px solid #5a4a30;border-radius:5px;padding:8px;margin:6px 0';
  const order = Object.keys(d.levels), lvs = order.filter((id) => j.some((e) => e.lv === id));
  const body = lvs.length ? lvs.map((id) => `<h3>${esc(d.levels[id].name)}</h3>${j.filter((e) => e.lv === id).map((e) => `<div style="${BX}"><b>${esc(e.title)}</b><div class="muted">${esc(e.text)}</div></div>`).join('')}`).join('') : '<p class="muted">Noch nichts eingetragen. Tafeln, Inschriften, Risse in Wänden, Gitter und Ratschläge landen hier, sobald ihr sie lest oder hört.</p>';
  openModal(`<h2>Notizbuch</h2><p class="muted">Gesammelte Hinweise: ${j.length}</p>${body}<div class="acts"><button class="mb" data-m="menu">Zurück</button></div>`, 'journal');
}
function openHelp() { openModal(helpHtml(), 'help'); }

// Symbol vor dem Gegenstandsnamen (Waffe, Rüstung, Trank, Gegengift, Öl, Proviant, Schlüssel …)
function itemIcon(id, it) {
  const ic = it.icon || (it.kind === 'equip' ? (it.slot === 'armor' ? '🛡' : it.slot === 'ring' ? '💍' : it.slot === 'amulet' ? '📿' : '⚔') : it.kind === 'quest' ? '🗝' : it.heal ? '🧪' : it.cure ? '💧' : it.throw ? '🔥' : it.kind === 'supply' ? '🍞' : '');
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
  const c = gearCompare(S.game, S.data, h, id);
  if (!c) return '';
  const d = [['atk', 'Angriff'], ['def', 'Verteidigung'], ['init', 'Init.']].filter(([k]) => c.delta[k] !== 0).map(([k, n]) => `${n} ${c.delta[k] > 0 ? '+' : '−'}${Math.abs(c.delta[k])}`);
  return (d.length ? ' · ' + d.join(', ') : ' · gleich') + (c.better ? ' ▲' : c.worse ? ' ▼' : '');
}
// 0.30.0: Zeile „Besser für: …“ unter einem Ausrüstungsstück im Inventar; nur Helden, bei denen die Summe der Werte steigt
function betterFor(id) {
  const g = S.game, it = itemDef(g, S.data, id);
  if (!it || it.kind !== 'equip') return '';
  const ok = g.heroes.map((h) => ({ h, c: gearCompare(g, S.data, h, id) })).filter((x) => x.c && x.c.better);
  const who = ok.map((x) => `${esc(x.h.name)}${esc(gearDelta(x.h, id).replace(/ ▲$/, ''))}`).join(' · ');
  return `<div style="font-size:.8em;color:#6fdc8c">${ok.length ? '▲ Besser für: ' + who : '<span class="muted">Verbessert niemanden</span>'}</div>`;
}
// 0.30.0: Übersicht „Wer trägt was“ (Helden × Plätze)
function openGearOverview() {
  const g = S.game, d = S.data, slots = Object.keys(d.slots);
  const rows = wornOverview(g, d).map(({ hero: h, slots: sl }) => `<div class="row nw"><div><b>${esc(h.name)}</b> <span class="muted">(${esc(h.role)})</span>${slots.map((s) => { const id = sl[s], it = id && itemDef(g, d, id); return `<div style="font-size:.85em"><span class="muted">${esc(d.slots[s])}:</span> ${it ? qTag(id, it) + `<span class="muted"> · ${[['atk', 'Ang'], ['def', 'Verteid'], ['init', 'Init']].filter(([k]) => it[k]).map(([k, n]) => `${n} ${it[k] > 0 ? '+' : '−'}${Math.abs(it[k])}`).join(', ') || 'keine Werte'}</span>` : '<span class="muted">–</span>'}</div>`; }).join('')}</div></div>`).join('');
  const spare = stackedInv(g, d, (id) => itemDef(g, d, id).kind === 'equip');
  const rest = spare.length ? `<h3>Im Inventar</h3>` + spare.map((gr) => { const it = itemDef(g, d, gr.id); return `<div class="row nw"><div><b>${qTag(gr.id, it)}</b> × ${gr.n}${betterFor(gr.id)}</div></div>`; }).join('') : '<p class="muted">Keine Ausrüstung im Inventar.</p>';
  openModal(`<h2>Ausrüstung</h2>${rows}${rest}<div class="acts"><button class="mb" data-m="char">Charaktere</button><button class="mb" data-m="inv">Inventar</button>${closeBtn}</div>`, 'gear');
}
// 0.22.2 (Nutzer: „Stapeln“): gleiche erzeugte Stücke (gleicher Name, Qualität, Werte) als eine Zeile „× n“; Knöpfe wirken auf das erste Stück.
function stackedInv(g, d, filter = () => true) {
  const groups = new Map();
  for (const [id, n] of Object.entries(g.inv)) {
    if (!(n > 0) || !filter(id)) continue;
    const it = itemDef(g, d, id);
    const key = /^g\d+$/.test(id) ? ['S', it.base, it.q, it.name, it.atk, it.def, it.init, (it.classes || []).join()].join('|') : id;
    const gr = groups.get(key);
    if (gr) { gr.n += n; gr.ids.push(id); } else groups.set(key, { id, n, ids: [id] });
  }
  return [...groups.values()];
}
function openInventory() {
  const g = S.game, d = S.data;
  const rank = { consumable: 0, supply: 1, tool: 1, quest: 2, equip: 3 };
  const anyNew = (gr) => gr.ids.some((x) => isNew(g, x));
  const items = stackedInv(g, d).map((gr) => [gr.id, gr.n, anyNew(gr)]).sort((a, b) => (b[2] - a[2]) || (rank[itemDef(g, d, a[0]).kind] - rank[itemDef(g, d, b[0]).kind]) || itemDef(g, d, a[0]).name.localeCompare(itemDef(g, d, b[0]).name, 'de'));
  let html = `<h2>Inventar</h2><p>Gold: <b>${g.gold}</b></p>`;
  html += items.length ? items.map(([id, n, nw]) => {
    const it = itemDef(g, d, id);
    const use = it.kind === 'consumable' && (it.heal || it.mana) ? `<button class="mb" data-m="use:${id}">Benutzen</button>` : it.kind === 'supply' && !g.combat ? '<button class="mb" data-m="rest">Rasten</button>' : it.kind === 'equip' && !g.combat ? `<button class="mb" data-m="eqsel:${id}">Ausrüsten</button>` : '';
    return `<div class="row nw${S.invEquip === id ? ' sel' : ''}"><div><b>${itemIcon(id, it)}${qTag(id, it)}</b>${it.kind === 'quest' ? ' <span class="muted">(Questgegenstand)</span>' : ` × ${n}`}${nw ? ' <span class="newtag">● neu</span>' : ''}<div class="muted">${esc(it.desc)}</div>${it.kind === 'equip' ? betterFor(id) : ''}${isCursed(it) && curseKnown(g, d, id) ? `<div style="font-size:.8em;color:#e86060">⚠ Verflucht: ${esc(curseText(it))}</div>` : ''}</div>${use}</div>`;
  }).join('') : '<p class="muted">Nichts dabei.</p>';
  if (S.invEquip && itemDef(g, d, S.invEquip) && (g.inv[S.invEquip] || 0) > 0) {
    html += `<h3>${qTag(S.invEquip, itemDef(g, d, S.invEquip))} an wen?</h3><div class="acts">` + g.heroes.map((h, i) =>
      `<button class="mb" data-m="eq:${i}" ${canEquip(d, h, S.invEquip, g) ? '' : 'disabled'}>${esc(h.name)} (${esc(h.role)})${canEquip(d, h, S.invEquip, g) ? esc(gearDelta(h, S.invEquip)) + (h.equip && h.equip[itemDef(g, d, S.invEquip).slot] ? ' · trägt ' + esc(itemDef(g, d, h.equip[itemDef(g, d, S.invEquip).slot]).name) : ' · Platz frei') : ''}</button>`).join('') + '</div>';
  }
  if (S.invUse) {
    html += `<h3>${esc(itemDef(g, d, S.invUse).name)} an wem anwenden?</h3><div class="acts">` + g.heroes.map((h, i) =>
      `<button class="mb headbtn" data-m="heal:${i}" ${itemDef(g, d, S.invUse).mana ? (h.hp > 0 && h.mp < h.maxMp ? '' : 'disabled') : (h.hp > 0 && h.hp < h.maxHp ? '' : 'disabled')}><img src="${makePortrait(h).toDataURL()}" alt=""><span>${esc(h.name)}<br>${itemDef(g, d, S.invUse).mana ? h.mp + '/' + h.maxMp : h.hp + '/' + h.maxHp}</span></button>`).join('') + '</div>';
  }
  if (g.combat) html += '<p class="muted">Im Kampf: „Benutzen“ gilt für den Helden, der gerade am Zug ist (Alchemist: für jeden Helden). Alternativ der Knopf „Gegenstand“.</p>';
  else if (items.some(([id]) => sellPrice(g, d, id) != null)) html += '<p class="muted">Verkaufen kannst du bei einer Händlerin.</p>';
  html += `<div class="acts"><button class="mb" data-m="gear">Ausrüstung</button>${closeBtn}</div>`;
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
  return Object.keys(S.data.slots).map((s) => {
    const id = h.equip && h.equip[s], it = id && itemDef(S.game, S.data, id);
    const cu = it && isCursed(it) && curseKnown(S.game, S.data, id) ? `<div style="font-size:.72em;color:#e86060">⚠ Fluch: ${esc(curseText(it))}</div>` : '';
    const fx = (it && it.fx ? `<div class="muted" style="font-size:.72em">${esc(fxText(it.fx))}</div>` : '') + cu;
    return `<div class="muted">${S.data.slots[s]}: ${it ? qTag(id, it) + ` <button class="mb" data-m="uneq:${i}:${s}" style="padding:1px 6px;min-height:0">Ablegen</button>` : '–'}</div>${fx}`;
  }).join('') + activeSets(S.data, h).map((st) => `<div style="font-size:.74em;color:#6fdc8c">Set „${esc(st.name)}“: ${esc(fxText(st.bonus))}</div>`).join('');
}
// 0.21.0: Ausrüstungseffekte in Worten
const FX_NAMES = { lifesteal: (v) => `Lebensraub ${v} %`, thorns: (v) => `Dornen ${v}`, crit: (v) => `Krit +${v} %`, dodge: (v) => `Ausweichen ${v} %`, resist: (v) => `Statusabwehr ${v} %`, soak: (v) => `Schaden gegen dich −${v}`, regen: (v) => `+${v} Ressource je Angriff/Verteidigen`, heal: (v) => `Heilung +${v}`, abil: (v) => `Fähigkeiten +${v} %`, gold: (v) => `Gold +${v} %` };
function fxText(fx) { return Object.entries(fx || {}).map(([k, v]) => (FX_NAMES[k] ? FX_NAMES[k](v) : `${k} ${v}`)).join(', '); }
function openCharacter() {
  const g = S.game;
  openModal(`<h2>Charaktere</h2><div class="grid4">` + g.heroes.map((h, i) =>
    `<div class="hc"><b>${esc(h.name)}</b><div class="muted">${esc(raceName(h.race))} · ${esc(h.role)}</div><div class="muted">${h.row === 'front' ? 'Vorderreihe' : 'Hinterreihe'}</div>
    <div>Stufe ${h.level}</div><div class="muted">${xpLine(h)}</div>
    <div>LP ${h.hp}/${h.maxHp}</div><div>Angriff ${h.atk}${bonusTxt(gearBonus(S.data, h, S.game).atk + talentSum(S.data, h, 'atk'))}</div><div>Verteidigung ${h.def}${bonusTxt(gearBonus(S.data, h, S.game).def + talentSum(S.data, h, 'def'))}</div><div>Initiative ${h.init}${bonusTxt(gearBonus(S.data, h, S.game).init + talentSum(S.data, h, 'init'))}</div><div>${h.ranged ? 'Fernkampf' : 'Nahkampf'}</div>${gearLines(h, i)}${charAbility(h)}<button class="mb" data-m="tal:${i}" style="margin-top:4px">Talente${talentPoints(S.data, h) > 0 ? ` <span class="taldot">●</span> ${talentPoints(S.data, h)} frei` : ''}</button></div>`).join('') +
    `</div><p class="muted">Ausrüstung anlegen: Inventar → Gegenstand → „Ausrüsten“. Ablegen hier.</p><div class="acts"><button class="mb" data-m="gear">Wer trägt was?</button>${closeBtn}</div>`, 'character');
}


// Talente (0.17.0): drei Zweige je Beruf, vier Einträge von oben nach unten. Tippen = lernen (wenn möglich).
function openTalents(i) {
  const g = S.game, h = g.heroes[i], d = S.data;
  S.talHero = i;
  const free = talentPoints(d, h);
  const tabs = g.heroes.map((x, k) => `<button class="mb${k === i ? ' sel' : ''}" data-m="tal:${k}" style="padding:2px 8px;min-height:0">${esc(x.name)}${talentPoints(d, x) > 0 ? ' ●' : ''}</button>`).join('');
  const why = { vorher: 'erst das Talent davor', stufe: `ab Stufe ${d.talents.gateLevel}`, punkte: 'zu wenige Punkte', andere: 'andere Wahl gelernt' };
  const nodeBtn = (n) => {
    const r = canLearnTalent(d, h, n.id), has = h.tal && h.tal[n.id];
    const st = has ? '✓ gelernt' : r.ok ? `Lernen (${n.cost} ${n.cost === 1 ? 'Punkt' : 'Punkte'})` : `${n.cost} P · ${why[r.why] || ''}`;
    return `<button class="tnode${has ? ' got' : r.ok ? ' can' : ''}" data-m="tl:${i}:${n.id}" ${has || !r.ok ? 'disabled' : ''}><b>${esc(n.name)}</b><span>${esc(n.desc)}</span><em>${esc(st)}</em></button>`;
  };
  const cols = talentBranches(d, h.cls).map((b) => `<div class="tcol"><b>${esc(b.name)}</b><div class="muted" style="font-size:.72em">${esc(b.desc)}</div>` + talentNodesOf(d, h, b).map((n) => n.alt
    ? `<div class="talt"><div class="muted" style="font-size:.7em">Wahl: ein Weg</div>${nodeBtn(n)}${nodeBtn({ ...n.alt, cost: n.cost })}</div>` : nodeBtn(n)).join('') + '</div>').join('');
  openModal(`<h2 style="margin:0 0 4px">Talente – ${esc(h.name)} (${esc(h.role)}, Stufe ${h.level})</h2><div class="acts" style="justify-content:flex-start;flex-wrap:wrap">${tabs}<span style="flex:1"></span><button class="mb" data-m="trs:${i}" style="padding:2px 8px;min-height:0" ${h.tal && Object.keys(h.tal).length ? '' : 'disabled'}>Zurücksetzen (${respecCost(d, h)} Gold)</button><button class="mb" data-m="char" style="padding:2px 8px;min-height:0">Zurück</button><button class="mb" data-m="close" style="padding:2px 8px;min-height:0">Schließen</button></div>
    <p style="margin:4px 0">Freie Talentpunkte: <b>${free}</b> · 1 Punkt je Stufe, Kosten 1 / 1 / 2 / 2, das 4. Talent ab Stufe ${d.talents.gateLevel}.</p><div class="tgrid">${cols}</div>`, 'talents');
}
const talentNodesOf = (d, h, b) => b.nodes.map((n, ni) => ({ ...n, ni, cost: (d.talents.cost || [1, 1, 2, 2])[ni] || 1 }));

function openMap() {
  const w = S.lvl.map[0].length, h = S.lvl.map.length;
  const cs = 3 * Math.max(8, Math.min(Math.floor(560 / w), Math.floor(230 / h))); // 0.19.5: dreifache Auflösung, damit Zoomen scharf bleibt
  openModal(`<h2 style="margin:0 0 4px">Karte – ${esc(S.lvl.name)}<span id="mapname" style="font-size:.7em;font-weight:normal;color:var(--gold,#e0b45a);margin-left:10px"></span></h2><div class="mapwrap"><div id="mapvp"><canvas id="mapcv" width="${cs * w}" height="${cs * h}"></canvas></div>${mapLegendHtml()}</div>
  <div class="acts mapbar"><span class="muted">Blick: ${DIR_NAMES[S.game.player.dir]} · Tippen = Notiz ◆ · 2 Finger oder ＋/− = Zoom, Ziehen = Verschieben</span><button class="mb" id="mz-in" aria-label="Vergrößern">＋</button><button class="mb" id="mz-out" aria-label="Verkleinern">−</button><button class="mb" id="mz-reset" aria-label="Zoom zurücksetzen">1:1</button>${closeBtn}</div>`, 'map');
  paintLegend();
  const cv = $('#mapcv'), vp = $('#mapvp');
  cv.dataset.cs = cs;
  drawMap();
  fitMapView(cv, vp, w, h, cs);
  const mz = initMapZoom(cv, vp);
  $('#mz-in').addEventListener('click', () => mz.zoomBy(1.5)); $('#mz-out').addEventListener('click', () => mz.zoomBy(1 / 1.5)); $('#mz-reset').addEventListener('click', () => mz.reset()); // 0.23.4: Zoom auch ohne Geste
  cv.addEventListener('click', (e) => {
    if (mz.dragged()) return; // Ziehen/Zoomen ist keine Notiz
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * cv.width / r.width / cs), y = Math.floor((e.clientY - r.top) * cv.height / r.height / cs);
    const idx = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || !S.game.seen[idx] || cellChar(S.lvl, x, y) !== '.') return;
    const rn = roomAt(S.lvl, x, y), mn = $('#mapname'); if (mn) mn.textContent = rn ? '· ' + rn : ''; // 0.37.6: Raumname beim Antippen
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
  const mid = () => [vp.clientWidth / 2, vp.clientHeight / 2];
  return { dragged: () => Date.now() - lastDrag < 400, zoomBy: (f) => { const [px, py] = mid(); zoomAt(px, py, k * f); }, reset: () => { k = 1; tx = 0; ty = 0; apply(); }, scale: () => k };
}
function drawMap() {
  const cv = $('#mapcv'), c = cv.getContext('2d'), cs = +cv.dataset.cs, g = S.game, lvl = S.lvl;
  const w = lvl.map[0].length, h = lvl.map.length;
  c.fillStyle = '#0a0806'; c.fillRect(0, 0, cv.width, cv.height);
  const seen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && g.seen[y * w + x];
  const wallObj = new Set(g.objs.filter((o) => (o.type === 'secret' && !o.open) || (o.type === 'lever' && o.wall) || (o.type === 'illusion' && !o.found)).map((o) => o.x + ',' + o.y)); // Geheimwand und Schalterstein zählen auf der Karte als Mauer
  const cellChar = (l, x, y) => (wallObj.has(x + ',' + y) ? '#' : cellCharRaw(l, x, y));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (cellChar(lvl, x, y) === '.') { if (seen(x, y)) { c.fillStyle = lvl.floor && lvl.floor[y][x] === 's' ? '#77705f' : lvl.floor && '=|'.includes(lvl.floor[y][x]) ? '#7a5a34' : '#4a4034'; c.fillRect(x * cs, y * cs, cs, cs); } } // Bohlen (Brücke, Steg) braun (0.28.0)
    else {
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cellChar(lvl, x + dx, y + dy) === '.' && seen(x + dx, y + dy)) near = true;
      if (near) { c.fillStyle = cellChar(lvl, x, y) === '~' ? '#2f5f8f' : '#8a7a5e'; c.fillRect(x * cs, y * cs, cs, cs); } // Wasser blau
    }
  }
  if (lvl.id === 'moorsee') { // 0.32.1 (Nutzer: „Keine eigene Schatzinselkarte, soll hier zu sehen sein“): besuchte Schatzinsel als verkleinerter Ausschnitt im See
    const ar = g.areas && g.areas.schatzinsel, il = S.data.levels.schatzinsel;
    if (ar && ar.seen && il) {
      const iw = il.map[0].length, ih = il.map.length, ic = cs * 0.5, ox = 24 * cs, oy = 3 * cs, isn = (x, y) => x >= 0 && y >= 0 && x < iw && y < ih && ar.seen[y * iw + x];
      for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
        const ch = cellCharRaw(il, x, y);
        if (ch === '.') { if (isn(x, y)) { c.fillStyle = il.floor && '=|+r'.includes(il.floor[y][x]) ? '#7a5a34' : '#a08a52'; c.fillRect(ox + x * ic, oy + y * ic, ic + 0.5, ic + 0.5); } } // Sand hell, Bohlen braun
        else { let near = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cellCharRaw(il, x + dx, y + dy) === '.' && isn(x + dx, y + dy)) near = true; if (near) { c.fillStyle = ch === '~' ? '#2f5f8f' : '#8a7a5e'; c.fillRect(ox + x * ic, oy + y * ic, ic + 0.5, ic + 0.5); } }
      }
      c.fillStyle = '#e8d9b0'; c.font = `${Math.round(cs * 0.7)}px serif`; c.textBaseline = 'bottom'; c.fillText('Schatzinsel', ox, oy - cs * 0.15);
    }
  }
  for (const o of g.objs) {
    if (!seen(o.x, o.y) && !(o.type === 'secret' && o.needs)) continue;
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
  if (o.type === 'secret' && o.needs && !o.open) return (S.game.inv[o.needs] || 0) > 0 ? 'kreuz' : null; // 0.40.0: Kreuz der Schatzkarte
  if (o.type === 'secret' || (o.type === 'lever' && o.wall && !o.used)) return null;
  if (o.type === 'door') return o.open ? 'doorOpen' : o.locked ? 'doorLocked' : 'door';
  if (o.type === 'chest') return o.open ? 'chestOpen' : 'chest';
  if (o.type === 'gate') return o.open ? 'gateOpen' : 'gate';
  if (o.type === 'lever') return o.used ? 'leverUsed' : 'lever';
  if (o.type === 'enemy') return o.dead || o.lurk ? null : 'enemy';
  if (o.type === 'plate') return o.down ? 'plateDown' : 'plate';
  if (o.type === 'boulder') return 'boulder';
  if (o.type === 'teleport') return o.look === 'hidden' && !o.used ? null : o.open ? 'teleOff' : 'tele';
  if (o.type === 'trap') return o.disarmed || !o.spotted ? null : o.sprung ? 'trapUsed' : 'trap'; // nur entdeckte Fallen
  if (o.type === 'buried') return o.sensed && !o.dug ? 'chest' : null; // 0.32.1: gespürter Schatz
  return ['stairs', 'exit', 'sign', 'merchant', 'runestone'].includes(o.type) ? o.type : null;
}
const MAP_LEGEND = [
  ['player', 'Du (Spitze = Blick)'], ['note', 'Notiz'], ['floor', 'Erkundeter Boden'], ['wall', 'Wand'], ['unknown', 'Noch nicht erkundet'],
  ['tele', 'Teleportfeld'], ['teleOff', 'Teleportfeld, erloschen'],
  ['door', 'Tür, geschlossen'], ['doorLocked', 'Tür, verschlossen'], ['doorOpen', 'Tür, offen'],
  ['chest', 'Truhe'], ['chestOpen', 'Truhe, geöffnet'], ['gate', 'Gitter, geschlossen'], ['gateOpen', 'Gitter, offen'],
  ['lever', 'Hebel'], ['leverUsed', 'Hebel, benutzt'], ['stairs', 'Treppe / Durchgang'], ['exit', 'Ausgang (Ende des Gebiets)'],
  ['kreuz', 'Kreuz der Schatzkarte'], ['sign', 'Hinweistafel'], ['runestone', 'Runenstein'], ['merchant', 'Händler'], ['enemy', 'Gegner'], ['plate', 'Druckplatte'], ['plateDown', 'Druckplatte, belastet'], ['boulder', 'Beweglicher Stein'], ['trap', 'Falle, entdeckt'], ['trapUsed', 'Falle, ausgelöst'],
];
function drawMapSym(c, k, x0, y0, cs, horiz = true, dir = 1) {
  const cx = x0 + cs / 2, cy = y0 + cs / 2;
  const txt = (t, col) => { c.fillStyle = col; c.font = `bold ${cs}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, cx, cy); };
  if (k === 'floor') { c.fillStyle = '#4a4034'; c.fillRect(x0, y0, cs, cs); }
  else if (k === 'kreuz') { c.strokeStyle = '#e0402e'; c.lineWidth = Math.max(2, cs / 5); c.lineCap = 'round'; c.beginPath(); c.moveTo(x0 + cs * 0.15, y0 + cs * 0.15); c.lineTo(x0 + cs * 0.85, y0 + cs * 0.85); c.moveTo(x0 + cs * 0.85, y0 + cs * 0.15); c.lineTo(x0 + cs * 0.15, y0 + cs * 0.85); c.stroke(); }
  else if (k === 'tele' || k === 'teleOff') { c.strokeStyle = k === 'tele' ? '#7fd4ff' : '#6a6050'; c.lineWidth = Math.max(1, cs / 6); c.beginPath(); c.arc(cx, cy, cs * 0.34, 0, Math.PI * 2); c.stroke(); if (k === 'tele') { c.fillStyle = '#7fd4ff'; c.fillRect(cx - cs * 0.08, cy - cs * 0.08, cs * 0.16, cs * 0.16); } }
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
    const a = dir * Math.PI / 2, r = cs * (horiz ? 0.45 : 0.9); // 0.26.6 (Nutzer: eigener Standpfeil größer): auf der Karte ragt er über das Feld hinaus; horiz=true = Legende
    c.fillStyle = '#ffffff'; c.strokeStyle = '#000000'; c.lineWidth = Math.max(1, cs * 0.14); c.lineJoin = 'round'; c.beginPath();
    c.moveTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
    c.lineTo(cx + Math.sin(a + 2.5) * r, cy - Math.cos(a + 2.5) * r);
    c.lineTo(cx + Math.sin(a - 2.5) * r, cy - Math.cos(a - 2.5) * r);
    c.closePath(); c.stroke(); c.fill();
  }
}
// Legende neben der Karte (0.16.6, Nutzerwunsch; vorher eigenes Fenster): nur Zeichen, die in diesem Gebiet schon
// gesehen wurden (verrät nichts Unentdecktes), dazu die Grundzeichen. Schmale Bildschirme: rutscht unter die Karte.
function mapLegendHtml() {
  const g = S.game, w = S.lvl.map[0].length;
  const have = new Set(['player', 'note', 'floor', 'wall', 'unknown']);
  for (const o of g.objs) { const k = mapSymKind(o); if (k && (g.seen[o.y * w + o.x] || k === 'kreuz')) have.add(k); }
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
  <div class="row"><label>Beim Start Vollbild</label>${chk('autoFs')}</div>
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
  <div class="acts"><button class="mb" data-m="fullscreen">Vollbild: ${document.fullscreenElement ? 'an – ausschalten' : 'aus – einschalten'}</button><button class="mb" data-m="install">App installieren</button><button class="mb" data-m="refresh">Neueste Version laden</button><button class="mb" data-m="selftest">Selbsttest</button>${closeBtn}</div>
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
  if (performance.now() - (S.modalAt || 0) < 350) return; // 0.31.5: Klick unmittelbar nach dem Öffnen = durchgereichter Tipp, ignorieren
  S.sfx.unlock();
  S.sfx.play('ui');
  const m = b.dataset.m;
  const g = S.game;
  if (m === 'close') closeModal();
  else if (m === 'title-close') { closeModal(); }
  else if (m === 'title') { if (S.started && !confirm('Zum Titelbild? Nicht gespeicherter Fortschritt geht verloren.')) return; closeModal(); await showTitle(); }
  else if (m === 'quit') { closeModal(); quitGame(); }
  else if (m === 'map') openMap();
  else if (m === 'debug') openDebug();
  else if (m === 'save') openSlots('save');
  else if (m === 'load') openSlots('load');
  else if (m === 'settings') openSettings();
  else if (m === 'help') openHelp();
  else if (m === 'bestiary') openBestiary();
  else if (m === 'achv') openAchievements();
  else if (m === 'journal') openJournal();
  else if (m === 'clog') openCombatLog(); // 0.47.1: Kampfprotokoll nur noch im Menü
  else if (m === 'errlog') openErrorLog();
  else if (m === 'errcopy') copyErrorLog();
  else if (m === 'errclear') { ERR.list = []; store.set('errlog', []); openErrorLog(); }
  else if (m === 'menu') openMenu();
  else if (m === 'export') exportSave();
  else if (m === 'import') $('#importfile').click();
  else if (m === 'fullscreen' && document.fullscreenElement) { // 0.24.1 (Nutzer: „Vollbildmodus an / aus“): Schalter – ausschalten verlassen und kein automatischer Wiedereintritt
    S.fsLeft = true;
    try { await document.exitFullscreen(); closeModal(); calmScreen(); } catch { toast('Vollbild konnte nicht beendet werden. Von oben ziehen und „Zurück“ tippen.'); }
  } else if (m === 'fullscreen') {
    S.fsLeft = false;
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); closeModal(); calmScreen(); } // 0.23.1: nach dem Wechsel Fenster schließen, Meldungen ausblenden
    catch { toast('Vollbild wird von diesem Browser nicht unterstützt oder wurde abgelehnt.'); }
  } else if (m === 'refresh') { // 0.24.2 (Nutzer: neue Version lässt sich nicht installieren): Offline-Cache und Service Worker entfernen, neu laden. Spielstände (IndexedDB) bleiben unberührt.
    try { const regs = (await navigator.serviceWorker.getRegistrations()) || []; for (const r of regs) await r.unregister(); } catch { /* egal */ }
    try { for (const k of await caches.keys()) if (k.startsWith('eldermoor-')) await caches.delete(k); } catch { /* egal */ }
    toast('Cache geleert – Spiel lädt neu …'); setTimeout(() => location.reload(), 600);
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
    if (t) { say(t); toast(t, 3200); if (S.modal === 'inventory') openInventory(); else closeModal(); } // 0.30.1: Inventar bleibt bei gesperrter Rast offen (Meldung nur beim Tippen auf „Rasten“)
    else { say(r.msg); S.sfx.play(r.sfx); closeModal(); renderAll(); await sleepScene(true); toast(r.msg, 3200); renderAll(); } // 0.43.0: Schlafkammer-Bild
  }
  else if (m === 'shopbuy' || m === 'shopsellTab') { S.shopTab = m === 'shopbuy' ? 'buy' : 'sell'; S.shopSure = null; openShop(S.shopId); }
  else if (m.startsWith('buy:')) {
    const sc = $('#modal-box').scrollTop; // 0.35.0: Liste bleibt beim Kaufen an ihrer Stelle
    const r = buyItem(g, S.data, S.shopId, m.slice(4));
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); } else toast(r.error === 'no-gold' ? `Zu wenig Gold (${r.price} nötig).` : r.error === 'sold-out' ? 'Ausverkauft. Nachschub kommt später.' : 'Das geht nicht.');
    renderAll(); openShop(S.shopId); $('#modal-box').scrollTop = sc;
  }
  else if (m.startsWith('shopsell:')) {
    const id = m.slice(9), it = itemDef(g, S.data, id), q = qualityOf(g, S.data, id);
    const dear = it && it.kind === 'equip' && q && (q.id === 'rare' || q.id === 'epic');
    if (dear && S.shopSure !== id) { const sc0 = $('#modal-box').scrollTop; S.shopSure = id; openShop(S.shopId); $('#modal-box').scrollTop = sc0; return; } // seltene Ausrüstung: zweiter Tipp bestätigt
    S.shopSure = null;
    const sc = $('#modal-box').scrollTop;
    const r = sellItem(g, S.data, id);
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); } else toast('Das geht nicht.');
    renderAll(); openShop(S.shopId); $('#modal-box').scrollTop = sc;
  }
  else if (m.startsWith('eqsel:')) { S.invEquip = m.slice(6); openInventory(); const hs = $('#modal-box [data-m^="eq:"]'); if (hs && hs.parentElement) (hs.parentElement.previousElementSibling || hs.parentElement).scrollIntoView({ block: 'end' }); } // 0.32.2: Heldenauswahl automatisch ins Bild scrollen
  else if (m.startsWith('eq:')) {
    const r = equipItem(g, S.data, S.invEquip, +m.slice(3));
    if (r.msg) { say(r.msg); S.sfx.play('ui'); toast(r.msg); } else toast('Das geht nicht.');
    S.invEquip = null; // 0.19.11: Auswahl schließt nach dem Anlegen (vorher blieb die Zeile oben anwählbar und ließ sich erneut ausrüsten)
    renderAll(); openInventory();
  }
  else if (m.startsWith('tal:')) { if (g.combat) toast('Nicht im Kampf.'); else openTalents(+m.slice(4)); }
  else if (m === 'char') openCharacter();
  else if (m === 'gear') openGearOverview();
  else if (m === 'inv') openInventory();
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
  else if (m.startsWith('tav-')) tavAct(m);
  else if (m.startsWith('map-buy:') || m.startsWith('bd-')) wirtAct(m);
  else if (m.startsWith('exo:')) exoAct(m);
  else if (m.startsWith('smi:')) smiAct(m);
  else if (m === 'shopgo') { S.shopTalk = null; openShop(S.shopId, false); }
  else if (m.startsWith('dlg:')) dialogPick(+m.slice(4));
  else if (m.startsWith('dice-')) diceAction(m);
  else if (m.startsWith('use:')) {
    if (g.combat) { // 0.31.1: Tränke im Kampf aus dem Inventar: Held am Zug trinkt für sich (Alchemist wählt den Helden)
      const a = currentActor(g);
      if (!a || a.side !== 'h' || S.lock) { toast('Gerade ist kein Held am Zug.'); return; }
      if (S.data.classes[g.heroes[a.idx].cls].potionGiver) { S.invUse = m.slice(4); openInventory(); }
      else { closeModal(); heroAct({ type: 'item', item: m.slice(4), hero: a.idx }); }
    } else { S.invUse = m.slice(4); openInventory(); }
  }
  else if (m.startsWith('heal:') && g.combat) { const id = S.invUse; closeModal(); if (id) heroAct({ type: 'item', item: id, hero: +m.slice(5) }); }
  else if (m.startsWith('heal:')) {
    const r = useItemOutside(g, S.data, S.invUse || 'potion', +m.slice(5));
    if (r.msg) { say(r.msg); S.sfx.play(r.sfx); toast(r.msg); }
    if ((g.inv[S.invUse || 'potion'] || 0) <= 0) S.invUse = null;
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
  const it = S.data.story && S.data.story.intro; if (it) openParchment(it.title, it.text, it.button); // 0.47.0: Vorgeschichte, nur beim Start eines neuen Spiels
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
  autoFullscreen();
  const t = b.dataset.t;
  if (t === 'new') openNewGame();
  else if (t === 'continue') { const l = await latestSave(); if (l) await loadSlot(l.key); }
  else if (t === 'load') { S.started = false; await openSlots('load'); }
  else if (t === 'settings') openSettings();
  else if (t === 'help') openHelp();
  else if (t === 'quit') quitGame();
}
// 0.24.1 (Nutzer: „Button Spiel beenden einfügen“): Autospeicherstand (außer im Kampf), Vollbild verlassen, window.close() versuchen.
// Browser/Android erlauben das Schließen oft nicht – dann erklärt ein Hinweis, wie man die App wegwischt (nicht gesichert, ob window.close() auf dem Gerät greift).
async function quitGame() {
  if (S.started && !confirm('Spiel beenden? Ohne Speichern geht Fortschritt seit dem letzten Speichern verloren.')) return;
  let saved = false;
  if (S.started && S.game && !S.game.combat) { try { await saveSlot('auto', true); saved = true; } catch { /* egal */ } }
  try { S.sfx.suspend(); } catch { /* egal */ }
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* egal */ }
  try { window.close(); } catch { /* egal */ }
  setTimeout(() => openModal(`<h2>Spiel beendet</h2><p>${saved ? 'Der Stand wurde automatisch gesichert.' : S.started ? 'Es wurde nicht gespeichert (Kampf oder kein Spiel).' : ''}</p><p class="muted">Android lässt Web-Apps sich oft nicht selbst schließen. Wische die App dann in der Übersicht weg (von unten nach oben wischen, App nach oben schieben).</p><div class="acts"><button class="mb primary" data-m="close">Zurück zum Spiel</button></div>`, 'quitinfo'), 400);
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
