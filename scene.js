// Die Schatten von Eldermoor – Schlafkammer-Bild beim Rasten (0.43.0)
// Prozedural gezeichnet (Canvas 320×180, hochskaliert, pixelig), animiert (Feuer, Kerze, Atmen, Zzz, Regen). Keine Spiellogik.
// startSleepScene(heroes, seed, onDone): zeigt ca. 5 s lang Margas Herberge mit den schlafenden Helden; Tippen überspringt (nach 1,5 s).
const W = 320, H = 180;
export const SLEEP_ROOMS = ['Kaminzimmer', 'Dachkammer', 'Eckzimmer am Fenster', 'Gewölbestube'];
const SKIN = { human: '#e0b48c', elf: '#f0d2b0', dwarf: '#d49a74', ork: '#7f9a5a', gnome: '#e8b898' };
const HAIR = ['#3a2616', '#6a4224', '#b8863c', '#1c1612', '#9a3a1c', '#c9c2b0'];
const BLANKET = { warrior: ['#7a2a2a', '#9a3c3c'], rogue: ['#2f4a33', '#42654a'], priest: ['#8c8571', '#a29b85'], mage: ['#2c3e7a', '#4457a0'], ranger: ['#5a4a2a', '#7a6638'], alchemist: ['#3f6b5e', '#58887a'] };
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function disc(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }
function glow(c, x, y, r, rgb, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }

function planks(c, y0, y1, base, line, seed) { // Holzwand aus senkrechten Brettern
  rect(c, 0, y0, W, y1 - y0, base);
  for (let x = 0; x < W; x += 16) { rect(c, x, y0, 1, y1 - y0, line); const h = hash(seed + x); rect(c, x + 4 + (h % 6), y0 + 8 + (h >> 4) % (y1 - y0 - 16), 1, 5, line); }
}
function stones(c, x0, y0, w, h, base, line, seed) { // Mauerwerk
  rect(c, x0, y0, w, h, base);
  for (let y = y0, r = 0; y < y0 + h; y += 10, r++) { rect(c, x0, y, w, 1, line); for (let x = x0 + (r % 2) * 9; x < x0 + w; x += 18) rect(c, x, y, 1, 10, line); }
  for (let i = 0; i < 24; i++) { const h2 = hash(seed + i); rect(c, x0 + (h2 % w), y0 + ((h2 >> 8) % h), 2, 1, 'rgba(255,255,255,.07)'); }
}
function beams(c, y, col) { rect(c, 0, y, W, 6, col); rect(c, 0, y + 6, W, 1, 'rgba(0,0,0,.35)'); for (const x of [40, 160, 280]) { rect(c, x, 0, 7, y + 6, col); rect(c, x + 7, 0, 1, y + 6, 'rgba(0,0,0,.3)'); } }
function floor(c, y0, base, line) { rect(c, 0, y0, W, H - y0, base); for (let y = y0 + 6; y < H; y += 9) rect(c, 0, y, W, 1, line); for (let y = y0, r = 0; y < H; y += 9, r++) for (let x = (r * 37) % 53; x < W; x += 53) rect(c, x, y, 1, 9, line); }

function fireplace(c, x, y, t, big) { // Kamin, x = Mitte, y = Boden
  const w = big ? 76 : 54, h = big ? 66 : 48, x0 = x - w / 2;
  stones(c, x0 - 6, y - h - 8, w + 12, h + 8, '#5a5248', '#3a342d', x);
  rect(c, x0 - 10, y - h - 14, w + 20, 7, '#6e6558'); rect(c, x0 - 10, y - h - 8, w + 20, 1, '#2c2620'); // Sims
  rect(c, x0 + 6, y - h + 10, w - 12, h - 10, '#120c08'); // Feuerstelle
  rect(c, x0 + 6, y - h + 10, w - 12, 2, '#2a221a');
  const f = 0.85 + 0.15 * Math.sin(t * 13) + 0.05 * Math.sin(t * 31 + 1);
  const bw = w - 24;
  rect(c, x - bw / 2, y - 6, bw, 5, '#3a2616'); rect(c, x - bw / 2 + 4, y - 9, bw - 8, 4, '#4a301c'); // Holzscheite
  for (let i = 0; i < 6; i++) { // Flammen
    const fx = x - bw / 2 + 4 + i * (bw - 8) / 5, ph = Math.sin(t * (9 + i * 1.7) + i * 2), fh = (big ? 26 : 18) * f * (0.7 + 0.3 * (1 - Math.abs(i - 2.5) / 3)) + ph * 3;
    c.fillStyle = '#c8461c'; c.beginPath(); c.moveTo(fx - 6, y - 8); c.quadraticCurveTo(fx - 2 + ph, y - 8 - fh * 0.6, fx + ph * 1.5, y - 8 - fh); c.quadraticCurveTo(fx + 3, y - 8 - fh * 0.5, fx + 6, y - 8); c.fill();
    c.fillStyle = '#f0a030'; c.beginPath(); c.moveTo(fx - 3.5, y - 8); c.quadraticCurveTo(fx - 1 + ph * 0.6, y - 8 - fh * 0.45, fx + ph, y - 8 - fh * 0.68); c.quadraticCurveTo(fx + 2, y - 8 - fh * 0.3, fx + 3.5, y - 8); c.fill();
    c.fillStyle = '#ffe9a0'; c.beginPath(); c.moveTo(fx - 1.5, y - 8); c.lineTo(fx + ph * 0.4, y - 8 - fh * 0.32); c.lineTo(fx + 1.5, y - 8); c.fill();
  }
  for (let i = 0; i < 4; i++) { const p = ((t * 0.6 + i * 0.27) % 1); rect(c, x - 12 + i * 8 + Math.sin(t * 3 + i) * 3, y - 14 - p * 40, 1, 1, `rgba(255,190,90,${1 - p})`); } // Funken
  return f;
}
function window_(c, x, y, w, h, t, kind, seed) { // Fenster mit Nachthimmel
  rect(c, x - 3, y - 3, w + 6, h + 6, '#2a1c10');
  rect(c, x, y, w, h, '#0c1226');
  for (let i = 0; i < 9; i++) { const q = hash(seed + i); rect(c, x + 2 + (q % (w - 4)), y + 2 + ((q >> 8) % (h - 12)), 1, 1, `rgba(255,255,230,${0.4 + 0.4 * Math.sin(t * 2 + i)})`); }
  if (kind === 'moon') { disc(c, x + w * 0.7, y + h * 0.3, 6, '#f2efd0'); disc(c, x + w * 0.7 + 3, y + h * 0.3 - 1, 5, '#0c1226'); glow(c, x + w * 0.65, y + h * 0.3, 30, '220,230,255', 0.18); }
  if (kind === 'rain') { c.strokeStyle = 'rgba(150,170,210,.55)'; c.lineWidth = 1; for (let i = 0; i < 14; i++) { const q = hash(seed + i), px = x + (q % w), py = y + ((((q >> 8) % h) + t * 90) % h); c.beginPath(); c.moveTo(px, py); c.lineTo(px - 1, py + 4); c.stroke(); } }
  if (kind === 'snow') { for (let i = 0; i < 16; i++) { const q = hash(seed + i), px = x + ((q + Math.sin(t + i) * 3 + w) % w), py = y + ((((q >> 8) % h) + t * 14) % h); rect(c, px, py, 1.5, 1.5, 'rgba(240,245,255,.9)'); } }
  rect(c, x + w / 2 - 1, y, 2, h, '#2a1c10'); rect(c, x, y + h / 2 - 1, w, 2, '#2a1c10'); rect(c, x - 4, y + h + 3, w + 8, 3, '#3a2616');
}
function candle(c, x, y, t) {
  rect(c, x - 4, y - 2, 8, 2, '#5a4a30'); rect(c, x - 2, y - 14, 4, 12, '#e6dcc0'); rect(c, x - 2, y - 14, 1, 12, '#fff6dc');
  const f = 0.8 + 0.2 * Math.sin(t * 17) + 0.08 * Math.sin(t * 41);
  c.fillStyle = '#f2a030'; c.beginPath(); c.ellipse(x, y - 18, 2, 4 * f, 0, 0, 6.2832); c.fill(); rect(c, x - 0.5, y - 19, 1, 3, '#fff2b0');
  return f;
}
function bed(c, x0, hero, i, t) {
  const bw = 66, race = hero.race || 'human', cls = hero.cls || 'warrior', hs = hash(hero.name || i);
  const skin = SKIN[race] || SKIN.human, hair = HAIR[hs % HAIR.length], bl = BLANKET[cls] || BLANKET.warrior;
  const br = Math.sin(t * 1.7 + i * 1.3) * 1.2; // Atmen
  rect(c, x0 - 2, 90, bw + 4, 22, '#4a301c'); rect(c, x0 - 2, 90, bw + 4, 2, '#6a4628'); rect(c, x0 - 2, 112, bw + 4, 1, '#1c1208'); // Kopfbrett
  rect(c, x0, 110, bw, 50, '#d8cfb4'); // Laken
  rect(c, x0 + 12, 106, bw - 24, 20, '#efe8d4'); rect(c, x0 + 12, 124, bw - 24, 2, '#b8ae94'); rect(c, x0 + 12, 106, bw - 24, 2, '#fff8e8'); // Kissen
  const hx = x0 + bw / 2, hy = 117;
  disc(c, hx, hy, race === 'gnome' ? 7 : 9, skin);
  if (race === 'dwarf') { c.fillStyle = '#8a4a1c'; c.beginPath(); c.arc(hx, hy + 1, 9, 0.15, 3.0); c.fill(); rect(c, hx - 8, hy + 3, 16, 12, '#8a4a1c'); rect(c, hx - 7, hy + 14, 14, 3, '#8a4a1c'); rect(c, hx - 8, hy + 3, 16, 1, '#a8602a'); }
  if (race === 'elf') { rect(c, hx - 13, hy - 3, 5, 2, skin); rect(c, hx + 8, hy - 3, 5, 2, skin); rect(c, hx - 15, hy - 5, 2, 2, skin); rect(c, hx + 13, hy - 5, 2, 2, skin); }
  if (race === 'human' || race === 'elf' || race === 'dwarf') { c.fillStyle = race === 'elf' ? '#e8dcb0' : hair; c.beginPath(); c.arc(hx, hy - 1, 9.5, 3.4, 6.0); c.fill(); rect(c, hx - 10, hy - 4, 3, 9, c.fillStyle); rect(c, hx + 7, hy - 4, 3, 9, c.fillStyle); }
  if (race === 'dwarf') { c.fillStyle = '#8a4a1c'; c.beginPath(); c.arc(hx, hy - 1, 9.5, 3.4, 6.0); c.fill(); }
  if (race === 'gnome') { c.fillStyle = '#b8402a'; c.beginPath(); c.moveTo(hx - 8, hy - 3); c.lineTo(hx + 14, hy - 12 + Math.sin(t * 1.2) * 1); c.lineTo(hx + 8, hy - 2); c.fill(); rect(c, hx - 8, hy - 4, 16, 2, '#f0e8d0'); }
  if (race === 'ork') { rect(c, hx - 4, hy + 4, 1, 3, '#efe8d0'); rect(c, hx + 3, hy + 4, 1, 3, '#efe8d0'); rect(c, hx - 7, hy - 8, 14, 2, '#2b3a1c'); }
  rect(c, hx - 5, hy - 1, 3, 1, '#2a1a10'); rect(c, hx + 2, hy - 1, 3, 1, '#2a1a10'); rect(c, hx - 1, hy + 3, 2, 1, '#8a4a3a'); // geschlossene Augen, Mund
  rect(c, x0 + 2, 128 + br, bw - 4, 34 - br, bl[0]); rect(c, x0 + 2, 128 + br, bw - 4, 3, bl[1]); // Decke, hebt und senkt sich
  for (let k = 0; k < 3; k++) rect(c, x0 + 6 + k * 20, 136 + br, 12, 1, 'rgba(255,255,255,.12)');
  rect(c, x0 - 2, 156, bw + 4, 10, '#4a301c'); rect(c, x0 - 2, 156, bw + 4, 2, '#6a4628'); // Fußbrett
  rect(c, x0 + 4, 166, 3, 5, '#2a1a10'); rect(c, x0 + bw - 7, 166, 3, 5, '#2a1a10');
  // Ausrüstung am Bettpfosten
  const gx = x0 + bw + 3;
  if (cls === 'warrior') { rect(c, gx, 98, 2, 26, '#c8ccd4'); rect(c, gx - 3, 120, 8, 2, '#8a6a30'); rect(c, gx, 122, 2, 5, '#4a301c'); }
  else if (cls === 'mage') { rect(c, gx, 84, 2, 44, '#6a4628'); disc(c, gx + 1, 84, 3, '#7ab8ff'); }
  else if (cls === 'ranger') { c.strokeStyle = '#8a6a30'; c.lineWidth = 2; c.beginPath(); c.arc(gx - 6, 112, 18, -1.1, 1.1); c.stroke(); }
  else if (cls === 'priest') { rect(c, gx, 100, 2, 24, '#8a6a30'); rect(c, gx - 2, 98, 6, 6, '#d9b44a'); }
  else if (cls === 'rogue') { rect(c, gx, 108, 2, 14, '#c8ccd4'); rect(c, gx - 2, 120, 6, 2, '#2a1a10'); }
  else { rect(c, gx - 1, 106, 5, 10, '#9fd4c4'); rect(c, gx, 104, 3, 3, '#6a4628'); }
  // Zzz
  for (let k = 0; k < 2; k++) { const p = ((t * 0.45 + i * 0.31 + k * 0.5) % 1); c.fillStyle = `rgba(230,225,255,${0.85 * (1 - p)})`; c.font = `${7 + k * 2}px sans-serif`; c.fillText('z', hx + 12 + p * 8 + k * 4, hy - 8 - p * 22 - k * 5); }
  // Stiefel am Fußende
  rect(c, x0 + 14, 168, 6, 6, '#3a2616'); rect(c, x0 + 22, 168, 6, 6, '#3a2616'); rect(c, x0 + 14, 172, 8, 2, '#1c1208'); rect(c, x0 + 22, 172, 8, 2, '#1c1208');
}

function room(c, v, t) {
  const seed = 100 + v * 7;
  if (v === 0) { // Kaminzimmer: Kamin in der Mitte, warmes Licht
    planks(c, 0, 104, '#3a2616', '#2a1a0e', seed); beams(c, 0, '#2a1a0e'); floor(c, 100, '#4a3220', '#2e1e12');
    const f = fireplace(c, 160, 92, t, true);
    window_(c, 36, 28, 34, 44, t, 'moon', seed); window_(c, 250, 28, 34, 44, t, 'moon', seed + 3);
    rect(c, 224, 50, 22, 3, '#6a4628'); rect(c, 228, 40, 14, 10, '#8a6a30'); // Regal, Krug
    c.fillStyle = '#7a2a2a'; c.beginPath(); c.ellipse(160, 99, 60, 4, 0, 0, 6.2832); c.fill(); // Teppich vor dem Kamin
    return { x: 160, y: 72, r: 150, rgb: '255,150,60', a: 0.34 * f };
  }
  if (v === 1) { // Dachkammer: Schrägen, Dachfenster, Kerze
    rect(c, 0, 0, W, 104, '#2e2014'); planks(c, 0, 104, '#33231a', '#22160e', seed);
    c.fillStyle = '#4a301c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, 22); c.lineTo(160, 6); c.lineTo(0, 22); c.fill();
    c.strokeStyle = '#2a1a0e'; c.lineWidth = 6; for (const x of [30, 100, 160, 220, 290]) { c.beginPath(); c.moveTo(x, 104); c.lineTo(x, 30); c.stroke(); }
    c.beginPath(); c.moveTo(0, 22); c.lineTo(160, 4); c.lineTo(W, 22); c.stroke();
    floor(c, 100, '#443020', '#2a1c10');
    window_(c, 132, 22, 56, 44, t, 'moon', seed);
    rect(c, 262, 70, 30, 32, '#4a301c'); rect(c, 262, 70, 30, 3, '#6a4628'); // Kiste
    const f = candle(c, 277, 70, t);
    rect(c, 22, 66, 22, 3, '#6a4628'); rect(c, 26, 56, 5, 10, '#9fd4c4'); rect(c, 34, 58, 5, 8, '#d9b44a'); // Regal mit Fläschchen
    return { x: 277, y: 52, r: 110, rgb: '255,170,70', a: 0.3 * f, cool: true };
  }
  if (v === 2) { // Eckzimmer: Kamin links, Fenster rechts mit Regen
    planks(c, 0, 104, '#3c2a1c', '#2a1c10', seed); beams(c, 0, '#2a1a0e'); floor(c, 100, '#4a3424', '#2e2012');
    const f = fireplace(c, 62, 92, t, false);
    window_(c, 210, 24, 54, 50, t, 'rain', seed);
    rect(c, 128, 40, 40, 30, '#2a1c10'); rect(c, 130, 42, 36, 26, '#6a4a2a'); rect(c, 134, 46, 12, 8, '#b09060'); rect(c, 150, 48, 12, 10, '#8a6a40'); // Wandbild/Karte
    c.fillStyle = '#5a3c28'; c.beginPath(); c.ellipse(190, 106, 30, 5, 0, 0, 6.2832); c.fill(); // Bärenfell
    rect(c, 288, 60, 20, 40, '#4a301c'); rect(c, 290, 62, 16, 36, '#2a1c10'); // Schrank
    return { x: 62, y: 74, r: 120, rgb: '255,150,60', a: 0.3 * f };
  }
  // v === 3: Gewölbestube aus Stein, Laternen, Fässer
  stones(c, 0, 0, W, 104, '#4a4640', '#2e2b27', seed); floor(c, 100, '#3a342c', '#26221c');
  c.fillStyle = '#2e2b27'; for (const x of [0, 107, 214]) { c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 53, 56, x + 107, 0); c.fill(); }
  for (const x of [54, 160, 266]) { rect(c, x - 1, 0, 2, 18, '#1c1208'); rect(c, x - 5, 18, 10, 12, '#6a4628'); rect(c, x - 3, 20, 6, 8, `rgba(255,${190 + 30 * Math.sin(t * 9 + x)},90,.9)`); }
  window_(c, 140, 34, 40, 36, t, 'snow', seed);
  rect(c, 14, 56, 30, 44, '#5a3c28'); rect(c, 14, 62, 30, 2, '#2a1a10'); rect(c, 14, 90, 30, 2, '#2a1a10'); rect(c, 270, 60, 30, 40, '#5a3c28'); rect(c, 270, 66, 30, 2, '#2a1a10'); rect(c, 270, 88, 30, 2, '#2a1a10'); // Fässer
  const f = 0.85 + 0.15 * Math.sin(t * 9);
  return { x: 160, y: 24, r: 190, rgb: '255,170,80', a: 0.22 * f };
}

// 0.47.3 (Nutzer: Rast außerhalb der Taverne ohne Betten): Gang im Dungeon, Helden schlafen in Decken auf dem Steinboden, eine Laterne in der Mitte
function lying(c, x0, hero, i, t) {
  const race = hero.race || 'human', cls = hero.cls || 'warrior', hs = hash(hero.name || i);
  const skin = SKIN[race] || SKIN.human, hair = HAIR[hs % HAIR.length], bl = BLANKET[cls] || BLANKET.warrior;
  // 0.49.0: unruhig – schnellere, flachere Atmung und gelegentliches Zucken (je Held eigener Takt)
  const tw = Math.max(0, Math.sin(t * 0.9 + i * 2.1) - 0.82) * 5.5;
  const br = Math.sin(t * 2.6 + i * 1.3) * 0.7 + tw * Math.sin(t * 31 + i), y0 = 128 + (i % 2) * 6, w = 66;
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x0 + w / 2, y0 + 30, w / 2 + 3, 6, 0, 0, 6.2832); c.fill(); // Schatten
  rect(c, x0 - 4, y0 + 27, w + 10, 6, '#2e281f'); rect(c, x0 - 4, y0 + 27, w + 10, 1, '#41372b'); for (let k = 0; k < 6; k++) rect(c, x0 - 4 + k * 13 + (i % 3), y0 + 33, 3, 2, '#2e281f'); // 0.49.5: dünne, abgewetzte Decke auf dem Steinboden
  const dull = (hex) => { const n = parseInt(hex.slice(1), 16), m = [0x3a, 0x34, 0x2c]; return '#' + [16, 8, 0].map((sh, q) => Math.round(((n >> sh) & 255) * 0.32 + m[q] * 0.68).toString(16).padStart(2, '0')).join(''); };
  const cov = dull(bl[0]), cov2 = dull(bl[1]);
  rect(c, x0 + 2, y0 + 18, 14, 10, '#6a5238'); rect(c, x0 + 2, y0 + 18, 14, 2, '#8a6c48'); // Rucksack als Kopfstütze
  const hx = x0 + 12, hy = y0 + 14;
  disc(c, hx, hy, race === 'gnome' ? 7 : 9, skin);
  c.fillStyle = race === 'elf' ? '#e8dcb0' : race === 'dwarf' ? '#8a4a1c' : hair; c.beginPath(); c.arc(hx, hy - 1, 9.5, 2.9, 5.9); c.fill();
  if (race === 'elf') rect(c, hx + 8, hy - 6, 6, 2, skin);
  if (race === 'gnome') { c.fillStyle = '#b8402a'; c.beginPath(); c.moveTo(hx - 6, hy - 4); c.lineTo(hx - 17, hy - 11 + Math.sin(t * 1.2)); c.lineTo(hx + 2, hy - 6); c.fill(); }
  if (race === 'dwarf') { c.fillStyle = '#8a4a1c'; rect(c, hx - 2, hy + 3, 12, 6, '#8a4a1c'); }
  if (tw > 1.2) { for (const ex of [hx + 1, hx + 6]) { rect(c, ex, hy - 2, 3, 3, '#e8e0d0'); rect(c, ex + 1, hy - 1, 1, 1, '#1a1008'); } } // zuckt: Augen springen kurz auf
  else { rect(c, hx + 1, hy - 1, 3, 1, '#2a1a10'); rect(c, hx + 6, hy - 1, 3, 1, '#2a1a10'); }
  rect(c, x0 + 20, y0 + 15 - br, w - 20, 15 + br, cov); rect(c, x0 + 20, y0 + 15 - br, w - 20, 2, cov2); // Mantel über dem Körper, flach und gedämpft
  c.fillStyle = cov; c.beginPath(); c.ellipse(x0 + w - 1, y0 + 23, 3, 7 + br / 2, 0, 0, 6.2832); c.fill();
  for (let k = 0; k < 3; k++) rect(c, x0 + 26 + k * 12, y0 + 20 - br, 8, 1, 'rgba(255,255,255,.07)');
  const gx = x0 + 20;
  if (cls === 'warrior') { rect(c, gx, y0 + 33, 40, 2, '#c8ccd4'); rect(c, gx - 2, y0 + 31, 3, 6, '#8a6a30'); }
  else if (cls === 'mage') { rect(c, gx, y0 + 33, 44, 2, '#6a4628'); disc(c, gx - 1, y0 + 34, 3, '#7ab8ff'); }
  else if (cls === 'ranger') { c.strokeStyle = '#8a6a30'; c.lineWidth = 2; c.beginPath(); c.ellipse(gx + 20, y0 + 34, 22, 3, 0, 0, 6.2832); c.stroke(); }
  else if (cls === 'priest') { rect(c, gx, y0 + 33, 40, 2, '#8a6a30'); rect(c, gx + 40, y0 + 31, 6, 6, '#d9b44a'); }
  else if (cls === 'rogue') { rect(c, gx + 4, y0 + 33, 24, 2, '#c8ccd4'); rect(c, gx, y0 + 32, 5, 4, '#2a1a10'); }
  else { rect(c, gx + 4, y0 + 32, 6, 5, '#9fd4c4'); rect(c, gx + 5, y0 + 30, 4, 3, '#6a4628'); }
  // 0.49.0: kein gemütliches „z“; der Schlaf ist unruhig (siehe drawCampScene: Zucken, flache Atmung)
}
function corridor(c, t) {
  // 0.49.5 (Nutzer: „Sieht nicht nach Gang aus“): Gang in Perspektive – Seitenwände, Decke und Boden laufen auf ein dunkles Ende zu, dunkle Seitenöffnungen, Wandfackel links
  const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]); c.closePath(); c.fill(); };
  const VX0 = 118, VX1 = 202, VY0 = 46, VY1 = 104, wy = (x, v, left) => { const s = (left ? x : W - x) / VX0, top = VY0 * s, bot = 160 + (VY1 - 160) * s; return top + (bot - top) * v; };
  rect(c, 0, 0, W, H, '#0a0908');
  poly([[0, 0], [VX0, VY0], [VX0, VY1], [0, 160]], '#34312b'); poly([[W, 0], [VX1, VY0], [VX1, VY1], [W, 160]], '#2e2b26');
  poly([[0, 0], [W, 0], [VX1, VY0], [VX0, VY0]], '#1f1d1a'); poly([[0, 160], [VX0, VY1], [VX1, VY1], [W, 160], [W, H], [0, H]], '#2a2722');
  rect(c, VX0, VY0, VX1 - VX0, VY1 - VY0, '#050405');
  // 0.49.5b (Nutzer: „Wände zu glatt, sehen aus wie Kacheln“): unregelmäßiges Bruchsteinmauerwerk, jeder Stein anders in Größe, Farbe und Kante, dazu Risse, Feuchtflecken und Moos
  const sf = (d) => Math.min(1, (1 - 1 / (1 + 0.5 * d)) / 0.78);
  for (const left of [true, false]) {
    const ex = left ? 0 : W, fx = left ? VX0 : VX1, sd = left ? 11 : 97;
    const P = (d, v) => { const f = sf(d), x = ex + (fx - ex) * f, top = VY0 * f, bot = 160 + (VY1 - 160) * f; return [x, top + (bot - top) * v]; };
    let v0 = 0, row = 0;
    while (v0 < 1) {
      const hr = 0.075 + (hash(sd + row * 31) % 100) / 100 * 0.1, v1 = Math.min(1, v0 + hr);
      let d0 = -((hash(sd + row * 7) % 100) / 100) * 1.4;
      while (d0 < 7.2) {
        const h = hash(sd * 3 + row * 101 + Math.round((d0 + 3) * 10)), dw = 0.55 + (h % 100) / 100 * 1.15, d1 = d0 + dw, q = (h >> 8) % 100;
        const a0 = Math.max(0, d0), a1 = Math.min(7.2, d1);
        if (a1 > a0) {
          const pts = [P(a0, v0 + 0.004), P(a1, v0 + 0.004), P(a1, v1 - 0.004), P(a0, v1 - 0.004)];
          poly(pts, q < 40 ? `rgba(0,0,0,${0.05 + q / 400})` : q < 75 ? `rgba(255,255,255,${0.025 + (q - 40) / 900})` : `rgba(40,60,30,${0.1 + (q - 75) / 250})`); // dunkler / heller / bemooster Stein
          c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1 + (h >> 16) % 2 * 0.6; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); c.moveTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]); c.stroke(); // Fugen
          if ((h >> 4) % 9 === 0) { const m = P((a0 + a1) / 2, v0 + (v1 - v0) * 0.4); c.strokeStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.moveTo(m[0], m[1]); c.lineTo(m[0] + (left ? 3 : -3), m[1] + 5 + h % 4); c.lineTo(m[0] + (left ? 1 : -1), m[1] + 9 + h % 3); c.stroke(); } // Riss
        }
        d0 = d1;
      }
      v0 = v1; row++;
    }
    for (let k = 0; k < 6; k++) { const h = hash(sd + k * 53), pp = P(0.4 + (h % 60) / 10, 0.1 + ((h >> 6) % 80) / 100); glow(c, pp[0], pp[1], 14 + h % 14, '10,16,8', 0.35); } // Feuchtflecken
  }
  c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1;
  for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(160 + k * 14, VY1); c.lineTo(160 + k * 70, H); c.stroke(); } // Bodenplatten
  for (const dy of [112, 124, 142, 164]) { c.beginPath(); c.moveTo(0, dy + 8); c.lineTo(W, dy + 8); c.stroke(); }
  for (const left of [true, false]) { // dunkle Seitenöffnungen
    const a = left ? 22 : W - 22, b = left ? 40 : W - 40;
    poly([[a, wy(a, 0.18, left)], [b, wy(b, 0.18, left)], [b, wy(b, 1, left)], [a, wy(a, 1, left)]], '#050405');
  }
  // Wandfackel an der linken Wand, Flamme flackert unregelmäßig
  let fl = 0.78 + 0.12 * Math.sin(t * 11) + 0.07 * Math.sin(t * 17.3 + 1) + 0.04 * Math.sin(t * 29 + 2);
  fl = Math.max(0.32, fl - Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 3.7 + 1) - 0.5) * 1.5); // Flamme sackt zeitweise fast ein (Zugluft)
  rect(c, 74, 68, 4, 12, '#2a1c10'); rect(c, 71, 64, 10, 5, '#4a3826');
  c.fillStyle = `rgba(255,${150 + 60 * fl},60,.95)`; c.beginPath(); c.moveTo(73, 65); c.quadraticCurveTo(76 + Math.sin(t * 9), 50 - 4 * fl, 79, 65); c.fill();
  c.fillStyle = 'rgba(255,230,150,.9)'; c.beginPath(); c.moveTo(75, 65); c.quadraticCurveTo(76.5 + Math.sin(t * 9), 56 - 2 * fl, 77.5, 65); c.fill();
  return { x: 76, y: 62, r: 100, rgb: '255,130,45', a: 0.36 * fl };
}
// 0.49.5 (Nutzer: „Kleines Lagerfeuer in der Mitte“): niedriges Feuer zwischen den Schlafenden, fast heruntergebrannt
function campfire(c, t) {
  const cx = 160, cy = 126, f = 0.7 + 0.18 * Math.sin(t * 13) + 0.1 * Math.sin(t * 21 + 1) + 0.05 * Math.sin(t * 34);
  c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(cx, cy + 3, 16, 5, 0, 0, 6.2832); c.fill();
  for (let k = 0; k < 9; k++) { const a = k / 9 * 6.2832; disc(c, cx + Math.cos(a) * 12, cy + 1 + Math.sin(a) * 3.4, 2.6, k % 2 ? '#4a463f' : '#37342e'); } // Steinring
  rect(c, cx - 9, cy - 2, 18, 3, '#3a2616'); rect(c, cx - 6, cy - 4, 12, 3, '#4a301c'); // Holz
  for (const [dx, h, w] of [[-4, 9, 4], [0, 14, 5], [4, 8, 3.6]]) { c.fillStyle = `rgba(255,${110 + 70 * f},40,.95)`; c.beginPath(); c.moveTo(cx + dx - w, cy - 3); c.quadraticCurveTo(cx + dx + Math.sin(t * 8 + dx), cy - 3 - h * f, cx + dx + w, cy - 3); c.fill(); }
  c.fillStyle = 'rgba(255,225,150,.9)'; c.beginPath(); c.moveTo(cx - 2, cy - 3); c.quadraticCurveTo(cx + Math.sin(t * 8), cy - 3 - 7 * f, cx + 2, cy - 3); c.fill();
  return { x: cx, y: cy - 4, r: 85, rgb: '255,120,40', a: 0.4 * f };
}
// Rote Augenpaare im Dunkel (0.49.5: Zeitfenster passen in die 5 s der Szene, vorher kam fast nie eines vor): erscheinen, blinzeln, das letzte Paar kommt näher
const EYES = [ // x, y, Abstand, Start, Ende, Annäherung (1 = wird größer)
  { x: 160, y: 78, d: 7, s: 0.9, e: 2.9, g: 0 }, { x: 31, y: 85, d: 5, s: 1.6, e: 3.8, g: 0 },
  { x: W - 31, y: 85, d: 5, s: 2.2, e: 4.3, g: 0 }, { x: 150, y: 62, d: 4, s: 2.8, e: 4.7, g: 0 },
  { x: 164, y: 86, d: 12, s: 3.3, e: 5.4, g: 1 },
];
function eyes(c, t) {
  c.globalCompositeOperation = 'lighter';
  for (const e of EYES) {
    const du = e.e - e.s, u = t - e.s; if (u < 0 || u > du) continue;
    let a = Math.min(1, u / 0.4, (du - u) / 0.5); // sanftes Ein-/Ausblenden
    if (((t * 1.3 + e.s * 3) % 3.2) < 0.16) a *= 0.1; // blinzeln
    const k = 1 + e.g * 0.9 * (u / du), dx = Math.sin(t * 0.7 + e.s) * 1.2, d = e.d * k; // Annäherung: größer
    for (const sg of [-1, 1]) { const x = e.x + dx + sg * d / 2; glow(c, x, e.y, 9 * k, '255,30,20', 0.7 * a); disc(c, x, e.y, 1.9 * k, `rgba(255,60,40,${a})`); disc(c, x, e.y, 0.8 * k, `rgba(255,230,190,${a})`); }
  }
  c.globalCompositeOperation = 'source-over';
}
export function drawCampScene(c, heroes, t) {
  c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H);
  const L = corridor(c, t), L2 = campfire(c, t);
  const n = Math.min(4, heroes.length), bw = 66, gap = 10, x00 = Math.round((W - (n * bw + (n - 1) * gap)) / 2);
  heroes.slice(0, n).forEach((h, i) => lying(c, x00 + i * (bw + gap), h, i, t));
  const beat = Math.max(0, Math.sin(t * 5.4)) ** 6 + Math.max(0, Math.sin(t * 5.4 - 0.9)) ** 6 * 0.6; // Herzschlag: doppelter Puls
  c.fillStyle = `rgba(3,2,9,${0.72 + 0.05 * beat})`; c.fillRect(0, 0, W, H); // tiefe Dunkelheit (0.49.5: .72 statt .58)
  c.globalCompositeOperation = 'lighter'; glow(c, L.x, L.y, L.r, L.rgb, L.a); glow(c, L2.x, L2.y, L2.r, L2.rgb, L2.a); c.globalCompositeOperation = 'source-over';
  c.fillStyle = 'rgba(8,16,38,.16)'; c.fillRect(0, 0, W, H); // kalter Ton
  for (let k = 0; k < 7; k++) { c.fillStyle = `rgba(70,84,110,${(0.03 + 0.012 * Math.sin(t * 0.8)) * (k + 1) / 2})`; c.fillRect(0, H - 70 + k * 10, W, 10); } // Bodennebel, nach unten dichter
  eyes(c, t); // über der Dunkelheit, damit sie leuchten
  const g = c.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 200); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.78)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
}

export function drawSleepScene(c, heroes, v, t) {
  c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H);
  const L = room(c, v, t);
  const n = Math.min(4, heroes.length), bw = 66, gap = 10, x00 = Math.round((W - (n * bw + (n - 1) * gap)) / 2);
  heroes.slice(0, n).forEach((h, i) => bed(c, x00 + i * (bw + gap), h, i, t));
  c.fillStyle = L.cool ? 'rgba(14,16,40,.38)' : 'rgba(12,6,20,.30)'; c.fillRect(0, 0, W, H); // Nacht
  c.globalCompositeOperation = 'lighter'; glow(c, L.x, L.y, L.r, L.rgb, L.a); c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 210); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H); // Vignette
}

// Zeigt die Szene als Vollbild-Überlage. heroes: state.heroes. seed: Zahl (wählt das Zimmer). onDone: nach Ende oder Tippen.
export function startSleepScene(heroes, seed, onDone, ms = 5000, camp = false) {
  const v = camp ? -1 : (seed >>> 0) % SLEEP_ROOMS.length;
  const el = document.createElement('div');
  el.id = 'sleepscene';
  el.style.cssText = 'position:fixed;inset:0;z-index:60;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .6s;touch-action:none;';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.style.cssText = 'width:min(100vw,calc(100vh*16/9));aspect-ratio:16/9;image-rendering:pixelated;max-height:80vh;';
  const cap = document.createElement('div');
  cap.style.cssText = 'color:#e8d6a8;font:italic 1rem Georgia,serif;margin-top:10px;text-align:center;padding:0 12px;';
  cap.textContent = camp ? 'Nachtlager im Gang – etwas atmet im Dunkel …' : `Margas Herberge · ${SLEEP_ROOMS[v]} – die Nacht vergeht …`;
  const hint = document.createElement('div'); hint.style.cssText = 'color:#8a7a5a;font:.8rem system-ui;margin-top:4px;'; hint.textContent = 'Tippen überspringt';
  el.append(cv, cap, hint); document.body.append(el);
  const c = cv.getContext('2d'); let raf = 0, done = false; const t0 = performance.now();
  const end = () => { if (done) return; done = true; cancelAnimationFrame(raf); el.style.opacity = '0'; setTimeout(() => { el.remove(); onDone && onDone(); }, 450); };
  el.addEventListener('pointerdown', () => { if (performance.now() - t0 > 1500) end(); });
  const loop = () => { const t = (performance.now() - t0) / 1000; (camp ? drawCampScene(c, heroes, t) : drawSleepScene(c, heroes, v, t)); if (t * 1000 >= ms) { end(); return; } raf = requestAnimationFrame(loop); };
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  loop();
  return { room: v, end };
}
