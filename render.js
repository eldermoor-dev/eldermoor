// Die Schatten von Eldermoor – Raycasting-Renderer und prozedurale Grafik
// Autor: eldermoor-dev
// Der Renderer arbeitet auf einem eigenen Pixelpuffer (Uint32Array) und kennt weder DOM noch Canvas.
// Dadurch ist er in Node testbar und später austauschbar.

export const BASE_W = 480, BASE_H = 270, TEX = 64; // Grundauflösung (Retro) und Texturgröße der Generatoren
// Aktuelle Bildgröße: 480×270 (Retro) oder ein Vielfaches davon (Scharf = 2×). Live-Bindung: Änderung über setResolution().
export let W = BASE_W, H = BASE_H;
export function setResolution(r) { W = BASE_W * r; H = BASE_H * r; }
const MATS = ['stone', 'moss', 'wood', 'iron', 'floor', 'ceil', 'flesh', 'glow'];
const M = { stone: 0, moss: 1, wood: 2, iron: 3, floor: 4, ceil: 5, flesh: 6, glow: 7 };
const P = (mat, shade) => M[mat] * 8 + Math.max(0, Math.min(7, Math.round(shade)));

// Wandtextur-IDs im Raster: 0 = frei, 1 Stein, 2 Moos, 3 Tür, 4 verschlossene Tür
export const WALL_STONE = 1, WALL_MOSS = 2, WALL_DOOR = 3, WALL_DOOR_LOCKED = 4;

// ---------- Palette: 8 Materialien × 8 Helligkeitsstufen = 64 feste Farben ----------
export function buildPalette(def) {
  const pal = new Uint32Array(64);
  MATS.forEach((m, mi) => {
    const c = def[m] || [128, 128, 128];
    for (let s = 0; s < 8; s++) {
      const f = 0.08 + 0.92 * Math.pow(s / 7, 1.15);
      const r = Math.round(c[0] * f + 6 * (1 - f));
      const g = Math.round(c[1] * f + 8 * (1 - f));
      const b = Math.round(c[2] * f + 16 * (1 - f));
      pal[mi * 8 + s] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; // little-endian ABGR
    }
  });
  return pal;
}

// ---------- Prozedurale Texturen (Index = Material*8 + Helligkeit, 255 = transparent) ----------
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, cell, seed) { // kachelbares Value-Noise auf 64×64
  const n = TEX / cell;
  const gx = x / cell, gy = y / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const mk = (fill = 255) => ({ w: TEX, h: TEX, data: new Uint8Array(TEX * TEX).fill(fill) });

function genStone(seed) {
  const t = mk();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const off = ((y >> 4) & 1) * 16;
    const bx = (x + off) & 31, by = y & 15;
    let sh = 3 + vnoise(x, y, 4, seed) * 1.6 + hash(x, y, seed + 1) * 0.8 - 1.2;
    if (by === 0 || bx === 0) sh = 1 + hash(x, y, seed + 2);
    else {
      if (by === 1 || bx === 1) sh += 1.2;
      if (by === 15 || bx === 31) sh -= 0.8;
    }
    t.data[y * TEX + x] = P('stone', sh);
  }
  for (let k = 0; k < 3; k++) { // feine Risse
    let cx = Math.floor(hash(k, 1, seed + 7) * 60) + 2, cy = Math.floor(hash(k, 2, seed + 7) * 30);
    for (let i = 0; i < 12; i++) {
      t.data[(cy & 63) * TEX + (cx & 63)] = P('stone', 0.5);
      cy++; cx += Math.floor(hash(k, i, seed + 8) * 3) - 1;
    }
  }
  return t;
}
function genMoss(seed) {
  const t = genStone(seed);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const n = vnoise(x, y, 8, seed + 9) + hash(x, y, seed + 10) * 0.15;
    if (n > 0.58) t.data[y * TEX + x] = P('moss', 2 + (n - 0.58) * 9);
  }
  return t;
}
function genDoor(seed, locked) {
  const t = mk();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const px = x & 15;
    let v = P('wood', 3 + hash(x, y >> 3, seed) * 1.6 - 0.8 + (px === 0 || px === 15 ? -1.6 : 0) + hash(x, y, seed + 1) * 0.5);
    if ((y >= 8 && y <= 13) || (y >= 50 && y <= 55)) { // Eisenbänder
      v = P('iron', 3 + hash(x, y, seed + 2) * 1.2 + (y === 8 || y === 50 ? 1 : 0));
      if ((x % 16 === 8) && (y === 10 || y === 11 || y === 52 || y === 53)) v = P('iron', 6);
    }
    if (x < 2 || x > 61) v = P('stone', 2 + hash(x, y, seed + 3));
    t.data[y * TEX + x] = v;
  }
  if (locked) {
    for (let y = 26; y <= 40; y++) for (let x = 27; x <= 36; x++) t.data[y * TEX + x] = P('iron', 4.5 + (y < 30 ? 1 : 0));
    for (let y = 31; y <= 36; y++) { t.data[y * TEX + 31] = P('iron', 0); t.data[y * TEX + 32] = P('iron', 0); }
    t.data[30 * TEX + 31] = P('iron', 0); t.data[30 * TEX + 32] = P('iron', 0);
  } else {
    for (let a = 0; a < 40; a++) { // Türring
      const ang = (a / 40) * Math.PI * 2;
      const rx = Math.round(46 + Math.cos(ang) * 4), ry = Math.round(34 + Math.sin(ang) * 4);
      t.data[ry * TEX + rx] = P('iron', 6);
    }
  }
  return t;
}
function genFloor(seed) {
  const t = mk();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    let sh = 2.6 + vnoise(x, y, 8, seed) * 1.5 + hash(x, y, seed + 1) * 0.6 - 0.7;
    if ((x & 31) === 0 || (y & 31) === 0) sh = 1;
    t.data[y * TEX + x] = P('floor', sh);
  }
  return t;
}
function genCeil(seed) {
  const t = mk();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    t.data[y * TEX + x] = P('ceil', 1.2 + vnoise(x, y, 4, seed) * 1.8 + hash(x, y, seed + 1) * 0.5);
  }
  return t;
}
function genChest(open, seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 34; y <= 58; y++) for (let x = 10; x <= 53; x++) {
    let sh = 3 + hash(x, y, seed) * 1.2 - 0.6 + (y === 34 ? 1 : 0) - (y >= 56 ? 1 : 0) - (x <= 11 ? 0.8 : 0);
    let v = P('wood', sh);
    if ((x >= 18 && x <= 21) || (x >= 42 && x <= 45)) v = P('iron', 3 + hash(x, y, seed + 1) + (y === 34 ? 1 : 0));
    set(x, y, v);
  }
  if (!open) {
    for (let y = 20; y <= 33; y++) {
      const inset = Math.round(Math.max(0, 4 - (y - 20) * 0.5));
      for (let x = 10 + inset; x <= 53 - inset; x++) {
        let v = P('wood', 4 + hash(x, y, seed + 2) * 1 - 0.5 - (y > 31 ? 1 : 0));
        if ((x >= 18 && x <= 21) || (x >= 42 && x <= 45)) v = P('iron', 4 + hash(x, y, seed + 3));
        set(x, y, v);
      }
    }
    for (let y = 30; y <= 38; y++) for (let x = 29; x <= 34; x++) set(x, y, P('glow', 5 - (y - 30) * 0.15));
    set(31, 33, P('glow', 0)); set(32, 33, P('glow', 0)); set(31, 34, P('glow', 0)); set(32, 34, P('glow', 0));
  } else {
    for (let y = 12; y <= 25; y++) for (let x = 12; x <= 51; x++) set(x, y, P('wood', 1.5 + hash(x, y, seed + 4) * 1.2 + (y === 12 ? 1 : 0)));
    for (let y = 34; y <= 40; y++) for (let x = 12; x <= 51; x++) {
      const gl = hash(x, y, seed + 5);
      set(x, y, gl > 0.86 ? P('glow', 6) : P('wood', 0.5 + gl));
    }
  }
  return t;
}
function genSchrat(seed) {
  // Hochaufgelöstes Sprite (SN×SN statt 64×64): Moorschrat = knorrige Wesen aus Borke, Moos und fahlem Fleisch
  const SN = 160, k = 64 / SN;
  const t = { w: SN, h: SN, data: new Uint8Array(SN * SN).fill(255) };
  const segd = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay;
    const q = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    const nx = ax + vx * q, ny = ay + vy * q;
    return { d: Math.hypot(px - nx, py - ny), nx, ny, q };
  };
  const lim = (px, py, ax, ay, bx, by, r0, r1) => { // Kapsel mit veränderlichem Radius
    const s2 = segd(px, py, ax, ay, bx, by); const r = r0 + (r1 - r0) * s2.q;
    return s2.d <= r ? { cx: s2.nx, cy: s2.ny, r } : null;
  };
  const arm = (px, py, sx) => lim(px, py, 32 + sx * 13, 30, 32 + sx * 22, 44, 5, 3.6) || lim(px, py, 32 + sx * 22, 44, 32 + sx * (21 + (sx > 0 ? 1 : 0)), 58, 3.6, 2.6);
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
    const px = (x + 0.5) * k, py = (y + 0.5) * k;
    let hit = null, part = '';
    const hx = (px - 32) / 8.6, hy = (py - 15.5) / 9.8;
    if (hx * hx + hy * hy <= 1) { hit = { cx: 32, cy: 15.5, r: 10 }; part = 'head'; }
    if (!hit) { const n = lim(px, py, 32, 22, 32, 29, 5.2, 6.5); if (n) { hit = n; part = 'neck'; } }
    if (!hit) {
      const bx = (px - 32) / (15 - 4.5 * Math.max(0, (py - 34) / 24)), by = (py - 41) / 19;
      if (bx * bx + by * by <= 1) { hit = { cx: 32, cy: 41, r: 17 }; part = 'body'; }
    }
    if (!hit) { const a = arm(px, py, -1) || arm(px, py, 1); if (a) { hit = a; part = 'arm'; } }
    if (!hit) { // Wurzelbeine
      const l = lim(px, py, 26, 54, 21, 63.5, 3.6, 1.6) || lim(px, py, 38, 54, 43, 63.5, 3.6, 1.6) || lim(px, py, 32, 56, 32, 63.8, 3.4, 1.4);
      if (l) { hit = l; part = 'root'; }
    }
    if (!hit) { // Äste auf dem Kopf (Geweih)
      const b = lim(px, py, 26.5, 8.5, 21, 1.5, 1.7, 0.7) || lim(px, py, 37.5, 8.5, 43, 1.0, 1.7, 0.7) || lim(px, py, 23.5, 5, 18, 4.2, 0.9, 0.4) || lim(px, py, 40.5, 4.6, 46, 3.4, 0.9, 0.4) || lim(px, py, 22.2, 3.2, 21.2, -0.2, 0.7, 0.3);
      if (b) { hit = b; part = 'branch'; }
    }
    if (!hit) { // Klauen
      for (const [hx0, sg] of [[10.5, -1], [53.5, 1]]) {
        const c = lim(px, py, hx0, 58, hx0 - 3.6 * sg, 63.6, 1.3, 0.3) || lim(px, py, hx0, 58, hx0, 64, 1.3, 0.3) || lim(px, py, hx0, 58, hx0 + 3.6 * sg, 63.6, 1.3, 0.3);
        if (c) { hit = c; part = 'claw'; break; }
      }
    }
    if (!hit) continue;
    const l = ((px - hit.cx) * 0.9 + (py - hit.cy) * 0.7) / hit.r; // Licht von links oben
    let sh = 3.5 - l * 1.7 + (vnoise(px, py, 3.5, seed) - 0.5) * 1.0;
    let mat = 'wood';
    if (part === 'head') {
      mat = 'flesh'; sh += 0.3 + (vnoise(px, py, 2.5, seed + 4) - 0.5) * 0.9;
      if (py < 10.5 + vnoise(px, 0, 3, seed + 6) * 2.2) { mat = 'wood'; sh -= 0.4; } // Borkenstirn
    } else if (part === 'claw') { mat = 'stone'; sh = 5.4 - l; }
    else if (part === 'branch') { mat = 'wood'; sh = 2.3 - l * 0.8; }
    else {
      const g = vnoise(px * 4, py, 9, seed + 2);                 // senkrechte Rinde
      if (g < 0.34) sh -= 1.9; else if (g > 0.66) sh += 0.8;
      sh += (hash(x, y, seed + 5) - 0.5) * 0.5;
      if (part === 'body' && vnoise(px, py, 5, seed + 3) > 0.6) { mat = 'flesh'; sh = 2.6 - l * 0.8; } // freiliegendes Holz
    }
    if (part !== 'claw' && part !== 'branch' && vnoise(px, py, 6.5, seed + 9) > (part === 'root' ? 0.5 : 0.64) + (py < 26 ? 0.06 : 0)) { mat = 'moss'; sh = 2.7 + (1 - l) * 0.9 + (hash(x, y, seed + 11) - 0.5) * 0.7; }
    t.data[y * SN + x] = P(mat, sh);
  }
  // dunkler Umriss, 2 Texel stark
  for (let pass = 0; pass < 2; pass++) {
    const copy = t.data.slice();
    for (let y = 1; y < SN - 1; y++) for (let x = 1; x < SN - 1; x++) {
      const i = y * SN + x;
      if (copy[i] === 255) continue;
      if (copy[i - 1] === 255 || copy[i + 1] === 255 || copy[i - SN] === 255 || copy[i + SN] === 255) t.data[i] = P(MATS[copy[i] >> 3], Math.max(0, (copy[i] & 7) - 2.6));
    }
  }
  const set = (px, py, v) => { const x = Math.floor(px / k), y = Math.floor(py / k); if (x >= 0 && y >= 0 && x < SN && y < SN && t.data[y * SN + x] !== 255) t.data[y * SN + x] = v; };
  // Augen: schräge, leuchtende Schlitze mit Schein
  for (const [ex, sg] of [[27.6, -1], [36.4, 1]]) {
    for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
      const px = (x + 0.5) * k - ex, py = (y + 0.5) * k - 14.6;
      const rx = px * 0.93 - sg * py * 0.36, ry = py * 0.93 + sg * px * 0.36;
      const e = (rx / 2.5) ** 2 + (ry / 1.25) ** 2;
      if (e <= 1) set(px + ex, py + 14.6, P('glow', e < 0.45 ? 7 : 5));
      else if (e <= 3.6 && t.data[y * SN + x] !== 255 && MATS[t.data[y * SN + x] >> 3] === 'flesh') t.data[y * SN + x] = P('flesh', 1.8);
    }
  }
  // Maul: gezackte dunkle Linie mit hellen Zähnen
  for (let x = 26.5; x <= 37.5; x += k * 0.5) {
    const zig = Math.abs(((x - 26.5) % 2.2) - 1.1) * 0.9;
    for (let yy = 21.4 + zig; yy < 22.8 + zig; yy += k * 0.5) set(x, yy, P('flesh', 0));
    if (Math.floor((x - 26.5) / 1.1) % 2 === 0) for (let yy = 22.3 + zig; yy < 23.4 + zig; yy += k * 0.5) set(x, yy, P('stone', 6));
  }
  return t;
}
function genPortal(seed) {
  const t = mk(255);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const dx = x - 32, dy = y - 34, r = Math.hypot(dx, dy);
    if (r >= 18 && r <= 24) {
      const ang = Math.atan2(dy, dx);
      t.data[y * TEX + x] = P('glow', 4 + Math.sin(ang * 5 + seed) * 1.5 + hash(x, y, seed) * 1.2);
    } else if (r < 18) {
      t.data[y * TEX + x] = P('ceil', 0.3 + (Math.sin(Math.atan2(dy, dx) * 3 + r * 0.45) > 0.7 ? 1.4 : 0));
    } else if (y >= 56 && x >= 18 && x <= 46) {
      t.data[y * TEX + x] = P('stone', 2.5 + hash(x, y, seed + 1));
    }
  }
  return t;
}

// Verdoppelt eine Textur (Scale2x-Kantenglättung) und fügt feines Korn hinzu; Glühen und Transparenz bleiben unberührt.
function upsample2(t, seed) {
  const n = t.w, o = n * 2, src = t.data, out = new Uint8Array(o * o);
  const at = (x, y) => src[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  const wrap = t.noWrap !== true;
  const get = (x, y) => (wrap ? at(x, y) : src[Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x))]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = src[y * n + x], a = get(x, y - 1), b = get(x + 1, y), c = get(x - 1, y), d = get(x, y + 1);
    let e0 = p, e1 = p, e2 = p, e3 = p;
    if (a !== d && c !== b) {
      if (c === a) e0 = a; if (a === b) e1 = b; if (d === c) e2 = c; if (b === d) e3 = d;
    }
    const q = [e0, e1, e2, e3];
    for (let i = 0; i < 4; i++) {
      const ox = x * 2 + (i & 1), oy = y * 2 + (i >> 1);
      let v = q[i];
      if (v !== 255 && (v >> 3) !== M.glow && (v >> 3) !== M.iron) {
        const h = hash(ox, oy, seed);
        const sh = v & 7;
        if (h < 0.14 && sh > 0) v -= 1; else if (h > 0.9 && sh < 7) v += 1;
      }
      out[oy * o + ox] = v;
    }
  }
  return { w: o, h: o, data: out, noWrap: t.noWrap };
}
export function makeTextures(detail = 1) {
  const up = (t, s) => (detail > 1 ? upsample2(t, s) : t);
  const spr = (t, s) => { t.noWrap = true; return up(t, s); };
  return {
    wall: { [WALL_STONE]: up(genStone(11), 101), [WALL_MOSS]: up(genMoss(23), 102), [WALL_DOOR]: up(genDoor(31, false), 103), [WALL_DOOR_LOCKED]: up(genDoor(31, true), 104) },
    floor: up(genFloor(41), 105),
    ceil: up(genCeil(53), 106),
    sprites: { chest: spr(genChest(false, 61), 107), chestOpen: spr(genChest(true, 61), 108), schrat: genSchrat(71), portal: spr(genPortal(81), 109) }
  };
}

// ---------- Raycaster ----------
export class Raycaster {
  constructor(textures, paletteDef) {
    this.buf = new Uint32Array(W * H);
    this.zbuf = new Float32Array(W);
    this.tex = textures;
    this.quality = 'medium'; // low | medium | high
    this.flicker = 0.35; // Fackelflackern: 0 = aus, 1 = voll
    this.planeLen = 0.8;
    this.focal = (W / 2) / this.planeLen;
    this.setPalette(paletteDef);
  }
  setPalette(def) {
    this.pal = buildPalette(def);
    this.shadeTbl = [];
    for (let d = 0; d < 8; d++) {
      const t = new Uint32Array(64);
      for (let i = 0; i < 64; i++) t[i] = this.pal[(i & ~7) | Math.max(0, (i & 7) - d)];
      this.shadeTbl.push(t);
    }
  }
  // view: { px, py, angle, grid (Uint8Array), gw, gh, sprites: [{x,y,tex,scale}], time }
  render(view) {
    const { buf, zbuf, focal, tex } = this;
    const q = this.quality;
    const a = view.angle;
    const dirX = Math.sin(a), dirY = -Math.cos(a);
    const planeX = Math.cos(a) * this.planeLen, planeY = Math.sin(a) * this.planeLen;
    const px = view.px, py = view.py;
    const t = view.time || 0;
    const amp = q === 'low' ? 0 : this.flicker;
    const fl = 1 + amp * (0.07 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 5.1 + 1.3) + 0.03 * Math.sin(t * 23.7));
    const fogK = 0.85;
    const dropFor = (dist) => Math.min(7, Math.floor(dist * fogK / fl));

    // Decke und Boden
    const half = H / 2;
    if (q === 'low') {
      for (let y = half; y < H; y++) {
        const p = y + 0.5 - half;
        const tbl = this.shadeTbl[dropFor(0.5 * focal / p)];
        const fc = tbl[P('floor', 3)], cc = tbl[P('ceil', 2)];
        const rowF = y * W, rowC = (H - 1 - y) * W;
        for (let x = 0; x < W; x++) { buf[rowF + x] = fc; buf[rowC + x] = cc; }
      }
    } else {
      const ftex = tex.floor.data, ctex = tex.ceil.data, FN = tex.floor.w, FM = FN - 1;
      const rdx0 = dirX - planeX, rdy0 = dirY - planeY, rdx1 = dirX + planeX, rdy1 = dirY + planeY;
      for (let y = half; y < H; y++) {
        const p = y + 0.5 - half;
        const rowDist = 0.5 * focal / p;
        const tbl = this.shadeTbl[dropFor(rowDist)];
        let fx = px + rowDist * rdx0, fy = py + rowDist * rdy0;
        const sx = rowDist * (rdx1 - rdx0) / W, sy = rowDist * (rdy1 - rdy0) / W;
        const rowF = y * W, rowC = (H - 1 - y) * W;
        for (let x = 0; x < W; x++) {
          const tx = ((fx * FN) | 0) & FM, ty = ((fy * FN) | 0) & FM;
          const ti = ty * FN + tx;
          buf[rowF + x] = tbl[ftex[ti]];
          buf[rowC + x] = tbl[ctex[ti]];
          fx += sx; fy += sy;
        }
      }
    }

    // Wände
    const grid = view.grid, gw = view.gw, gh = view.gh;
    const step = q === 'low' ? 2 : 1;
    for (let x = 0; x < W; x += step) {
      const camX = 2 * (x + step * 0.5) / W - 1;
      const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      let mapX = Math.floor(px), mapY = Math.floor(py);
      const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (px - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (py - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }
      let side = 0, hit = 0;
      for (let i = 0; i < 48 && !hit; i++) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= gw || mapY >= gh) hit = WALL_STONE;
        else hit = grid[mapY * gw + mapX];
      }
      if (!hit) { for (let i = 0; i < step; i++) zbuf[x + i] = 1e9; continue; }
      let dist = side === 0 ? sdx - ddx : sdy - ddy;
      if (dist < 0.0001) dist = 0.0001;
      const lineH = Math.floor(focal / dist);
      const startRaw = Math.floor(half - lineH / 2);
      const y0 = Math.max(0, startRaw), y1 = Math.min(H - 1, startRaw + lineH - 1);
      let wallX = side === 0 ? py + dist * rdy : px + dist * rdx;
      wallX -= Math.floor(wallX);
      const wt = tex.wall[hit], WN = wt.w, WM = WN - 1;
      let texX = Math.floor(wallX * WN);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = WN - 1 - texX;
      const td = wt.data;
      const tbl = this.shadeTbl[Math.min(7, dropFor(dist) + side)];
      const texStep = WN / lineH;
      let texPos = (y0 - startRaw) * texStep;
      for (let y = y0; y <= y1; y++) {
        const c = tbl[td[((texPos | 0) & WM) * WN + texX]];
        texPos += texStep;
        const o = y * W + x;
        buf[o] = c;
        if (step === 2) buf[o + 1] = c;
      }
      for (let i = 0; i < step; i++) zbuf[x + i] = dist;
    }

    // Sprites (von hinten nach vorn)
    const list = [];
    const det = planeX * dirY - dirX * planeY;
    const invDet = 1 / det;
    for (const s of view.sprites || []) {
      const sx = s.x + 0.5 - px, sy = s.y + 0.5 - py;
      const tX = invDet * (dirY * sx - dirX * sy);
      const tY = invDet * (-planeY * sx + planeX * sy);
      if (tY > 0.15) list.push({ s, tX, tY });
    }
    list.sort((p, o) => o.tY - p.tY);
    for (const { s, tX, tY } of list) {
      const td = s.tex.data, TN = s.tex.w;
      const screenX = Math.floor(W / 2 * (1 + tX / tY));
      const sprH = Math.floor(focal / tY * s.scale), sprW = sprH;
      if (sprH < 2) continue;
      const bottom = Math.floor(half + 0.5 * focal / tY), top = bottom - sprH;
      const x0 = screenX - (sprW >> 1);
      const tbl = this.shadeTbl[dropFor(tY)];
      const ya = Math.max(0, top), yb = Math.min(H - 1, bottom - 1);
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + sprW); x++) {
        if (tY >= zbuf[x]) continue;
        const tx = Math.floor((x - x0) * TN / sprW);
        for (let y = ya; y <= yb; y++) {
          const ty = Math.floor((y - top) * TN / sprH);
          const idx = td[ty * TN + tx];
          if (idx === 255) continue;
          buf[y * W + x] = tbl[idx];
        }
      }
    }
  }
}

// ---------- Brücke zwischen Spielzustand und Renderer ----------
export function buildGrid(lvl, objs) {
  const w = lvl.map[0].length, h = lvl.map.length;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = lvl.map[y][x];
    grid[y * w + x] = c === '#' ? WALL_STONE : c === 'm' ? WALL_MOSS : 0;
  }
  for (const o of objs) if (o.type === 'door' && !o.open) grid[o.y * w + o.x] = o.locked ? WALL_DOOR_LOCKED : WALL_DOOR;
  return { grid, gw: w, gh: h };
}
export function buildSprites(objs, tex, time) {
  const out = [];
  for (const o of objs) {
    if (o.type === 'chest') out.push({ x: o.x, y: o.y, tex: o.open ? tex.sprites.chestOpen : tex.sprites.chest, scale: 0.5 });
    else if (o.type === 'enemy' && !o.dead) out.push({ x: o.x, y: o.y, tex: tex.sprites.schrat, scale: 0.85 * (1 + 0.02 * Math.sin(time * 3)) });
    else if (o.type === 'exit') out.push({ x: o.x, y: o.y, tex: tex.sprites.portal, scale: 0.9 });
  }
  return out;
}

// ---------- Prozedurale Heldenporträts (32×32, nur im Browser genutzt) ----------
const SKIN = ['#e0b48c', '#c98f66', '#f0c8a0', '#a8714c'];
const hx = (c) => c;
export function drawPortrait(ctx, role, seed) {
  const skin = SKIN[Math.abs(seed) % SKIN.length];
  const px = (x, y, w, h, c) => { ctx.fillStyle = hx(c); ctx.fillRect(x, y, w, h); };
  px(0, 0, 32, 32, '#1b1712');
  px(0, 24, 32, 8, role === 'Krieger' ? '#6b7280' : role === 'Schurke' ? '#2f4a33' : role === 'Priester' ? '#e8e2d0' : '#2c3e7a');
  px(13, 22, 6, 4, skin);
  for (let y = 8; y <= 24; y++) { // Gesicht (Ellipse)
    const k = Math.sqrt(Math.max(0, 1 - Math.pow((y - 16) / 8.5, 2))) * 7.2;
    px(Math.round(16 - k), y, Math.round(k * 2), 1, skin);
  }
  px(12, 16, 2, 2, '#1b1712'); px(18, 16, 2, 2, '#1b1712'); px(14, 21, 4, 1, '#6b3b2a');
  if (role === 'Krieger') { px(8, 6, 16, 6, '#8d95a3'); px(8, 12, 3, 8, '#8d95a3'); px(21, 12, 3, 8, '#8d95a3'); px(15, 12, 2, 6, '#8d95a3'); }
  else if (role === 'Schurke') { px(7, 5, 18, 7, '#2f4a33'); px(7, 12, 3, 12, '#2f4a33'); px(22, 12, 3, 12, '#2f4a33'); }
  else if (role === 'Priester') { px(9, 5, 14, 5, '#e8e2d0'); px(14, 1, 4, 5, '#d9b44a'); px(15, 2, 2, 3, '#e8e2d0'); }
  else { for (let i = 0; i < 12; i++) px(16 - Math.round(i * 0.55), 1 + i, Math.round(1 + i * 1.1), 1, '#2c3e7a'); px(6, 12, 20, 2, '#2c3e7a'); px(14, 6, 4, 2, '#d9b44a'); }
}
