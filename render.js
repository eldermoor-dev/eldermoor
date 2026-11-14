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
export const WALL_STONE = 1, WALL_MOSS = 2, WALL_DOOR = 3, WALL_DOOR_LOCKED = 4, WALL_TORCH = 5, WALL_ROCK = 6, WALL_LICHEN = 7, WALL_GATE = 8;

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

// Wand-, Boden- und Deckentexturen entstehen in Eigenauflösung n (64 oder 128): Formen werden aus dem 64er-Raster
// kontinuierlich abgetastet, Rauschen ist weich und das Pixelkorn schwach – dadurch wirken sie glatter und schärfer als hochskalierte 64er.
const grain = (x, y, s, amp) => (hash(x, y, s) - 0.5) * amp;
function genStone(seed, n = TEX) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) };
  const k = n / TEX, fine = n > TEX ? 0.35 : 0.8;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k; // Koordinaten im 64er-Raster
    const row = Math.floor(v / 16), off = (row & 1) * 16;
    const bu = (((u + off) % 32) + 32) % 32, bv = v % 16;
    const bid = Math.floor((u + off) / 32) + row * 7; // Stein-Nummer: jeder Stein bekommt eine eigene Grundhelligkeit
    let sh = 3.1 + (hash(bid, row, seed + 5) - 0.5) * 0.9 + (vnoise(u, v, 8, seed) - 0.5) * 1.4 + (vnoise(u, v, 3, seed + 3) - 0.5) * 0.6 + grain(x, y, seed + 1, fine);
    const edgeU = Math.min(bu, 31 - bu), edgeV = Math.min(bv, 15 - bv);
    if (bu < 0.9 || bv < 0.9) sh = 0.9 + hash(x, y, seed + 2) * 0.5; // Fuge
    else {
      if (bu < 2.2 || bv < 2.2) sh += 0.9; // Lichtkante oben/links
      else if (bu > 29.5 || bv > 13.5) sh -= 0.9; // Schattenkante unten/rechts
      sh -= Math.max(0, 2.6 - Math.min(edgeU, edgeV)) * 0.12; // sanft abgerundete Steine
    }
    t.data[y * n + x] = P('stone', sh);
  }
  for (let c = 0; c < 3; c++) { // feine Risse
    let cx = (Math.floor(hash(c, 1, seed + 7) * 60) + 2) * k, cy = Math.floor(hash(c, 2, seed + 7) * 30) * k;
    for (let i = 0; i < 12 * k; i++) {
      t.data[(Math.floor(cy) % n) * n + (Math.floor(cx) % n + n) % n] = P('stone', 0.6);
      cy += 0.5 + 0.5 * (k > 1 ? 1 : 1); cx += (hash(c, i, seed + 8) - 0.5) * 1.4;
    }
  }
  return t;
}
function genMoss(seed, n = TEX) {
  // Moos wächst an Fugen und Oberkanten der Steine, nach unten dünner; weiche Ränder statt Flecken
  const t = genStone(seed, n);
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k;
    const bv = v % 16, fuge = Math.max(0, 1 - Math.min(bv, 16 - bv) / 5) + Math.max(0, 1 - Math.min(((u + (Math.floor(v / 16) & 1) * 16) % 32), 32 - ((u + (Math.floor(v / 16) & 1) * 16) % 32)) / 4) * 0.6;
    const top = Math.max(0, 1 - v / 38);
    const cover = vnoise(u, v, 10, seed + 9) * 0.75 + vnoise(u, v, 4, seed + 11) * 0.25 + fuge * 0.22 + top * 0.3;
    const e = cover - 0.74;
    if (e > 0) {
      const base = t.data[y * n + x] & 7;
      t.data[y * n + x] = P('moss', Math.min(4.6, 1.2 + e * 7 + grain(x, y, seed + 12, n > TEX ? 0.3 : 0.7)) + (base > 3 ? 0.3 : 0));
    }
  }
  return t;
}
// Höhlenfels: unregelmäßige Felsbrocken (Voronoi-Zellen, kachelbar), dunkle Spalten dazwischen, Licht von links oben; optional Flechten
function genRock(seed, n = TEX, lichen = false) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) };
  const k = n / TEX, G = 6, cs = TEX / G, pts = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push({ x: (i + 0.2 + 0.6 * hash(i, j, seed + 1)) * cs, y: (j + 0.2 + 0.6 * hash(i, j, seed + 2)) * cs, b: hash(i, j, seed + 3) });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k, gi = Math.floor(u / cs), gj = Math.floor(v / cs);
    let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = gi + di, cj = gj + dj, wi = ((ci % G) + G) % G, wj = ((cj % G) + G) % G, p = pts[wj * G + wi];
      const px = p.x + (ci - wi) * cs, py = p.y + (cj - wj) * cs, d = Math.hypot(u - px, v - py);
      if (d < d1) { d2 = d1; d1 = d; best = p; bx = px; by = py; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1, dx = (u - bx) / cs, dy = (v - by) / cs;
    let sh = 2.7 + (best.b - 0.5) * 1.3 - (dx * 0.55 + dy * 0.85) * 1.1 + (vnoise(u, v, 8, seed + 4) - 0.5) * 1.1 + (vnoise(u, v, 3, seed + 5) - 0.5) * 0.6 + grain(x, y, seed + 6, n > TEX ? 0.35 : 0.8);
    if (e < 1.6) sh -= (1.6 - e) * 1.25; // Spalte zwischen den Brocken
    let m = 'stone';
    if (lichen) {
      const c = vnoise(u, v, 10, seed + 9) * 0.7 + vnoise(u, v, 4, seed + 11) * 0.3 + Math.max(0, 1 - v / 30) * 0.12 - 0.62;
      if (c > 0 && e > 0.9) { m = 'moss'; sh = Math.min(5, 1.8 + c * 6 + sh * 0.25); }
    }
    t.data[y * n + x] = P(m, sh);
  }
  return t;
}
// Fallgitter: Eisenstäbe vor dunklem Schacht, oben und unten Querbalken
function genGate(seed, n = TEX) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) };
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k;
    let idx = P('ceil', 0.3 + grain(x, y, seed, 0.6) + 0.4);
    const bar = (u % 10) < 3.4, beam = v < 5 || (v > 30 && v < 34) || v > 59;
    if (bar || beam) {
      const lit = (bar ? 4.4 - ((u % 10) / 3.4) * 1.6 : 4) - (beam && v > 59 ? 1 : 0) + grain(x, y, seed + 1, 0.5);
      idx = P('iron', Math.max(0.5, lit));
    }
    t.data[y * n + x] = idx;
  }
  return t;
}
// Wandfackel: feste Flamme (kein Flackern), Halterung aus Eisen, Lichtschein auf dem Stein
function genTorch(seed, n = TEX) {
  const t = genStone(seed, n);
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k - 32, v = y / k - 24, d = Math.hypot(u * 0.8, v);
    const idx = t.data[y * n + x];
    if (d < 34 && (idx >> 3) === M.stone) t.data[y * n + x] = P('stone', (idx & 7) + Math.pow(1 - d / 34, 1.3) * 3.4);
  }
  const set = (u, v, val) => { for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const px = Math.round(u * k) + dx, py = Math.round(v * k) + dy; if (px >= 0 && px < n && py >= 0 && py < n) t.data[py * n + px] = val; } };
  for (let v = 34; v <= 52; v++) for (let u = 29; u <= 35; u++) set(u, v, P('wood', 3 + (u === 29 ? 1 : 0) - (u === 35 ? 1.2 : 0) + hash(u, v, seed) * 0.5)); // Holzstab
  for (let u = 25; u <= 39; u++) for (let v = 31; v <= 35; v++) set(u, v, P('iron', 3.8 - (v - 31) * 0.35)); // Eisenschale
  for (let u = 27; u <= 37; u++) set(u, 36, P('iron', 1.5));
  for (let v = 6; v <= 31; v++) { // Flamme als Tropfen, dazu ein heller Kern
    const t0 = (31 - v) / 25, w = Math.sin(Math.min(1, t0 * 1.1) * Math.PI) * 7.5 * (1 - t0 * 0.4);
    for (let u = 32 - Math.ceil(w); u <= 32 + Math.ceil(w); u++) {
      const dd = Math.abs(u - 32) / Math.max(0.5, w);
      set(u, v, P('glow', dd < 0.4 && t0 < 0.75 ? 7 : dd < 0.75 ? 6 : 5));
    }
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
function genFloor(seed, n = TEX) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) };
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k, tile = Math.floor(u / 32) + Math.floor(v / 32) * 3;
    let sh = 2.7 + (hash(tile, 1, seed + 4) - 0.5) * 0.7 + (vnoise(u, v, 8, seed) - 0.5) * 1.3 + grain(x, y, seed + 1, n > TEX ? 0.3 : 0.6);
    const fu = u % 32, fv = v % 32;
    if (fu < 0.9 || fv < 0.9) sh = 0.9; else if (fu < 2 || fv < 2) sh += 0.5;
    t.data[y * n + x] = P('floor', sh);
  }
  return t;
}
function genCeil(seed, n = TEX) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) };
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k;
    t.data[y * n + x] = P('ceil', 1.3 + vnoise(u, v, 6, seed) * 1.6 + vnoise(u, v, 2, seed + 2) * 0.4 + grain(x, y, seed + 1, n > TEX ? 0.25 : 0.5));
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
// Händlerin: Gestalt mit Kapuze hinter einem Holzstand, Laterne rechts
function genMerchant(seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 10; y <= 56; y++) for (let x = 12; x <= 52; x++) {
    const cx = (x - 32) / (y < 26 ? 9.5 : 9.5 + (y - 26) * 0.55), cy = y < 26 ? (y - 17) / 8.5 : 0;
    if (cx * cx + cy * cy <= 1) {
      const l = (x - 32) / 18;
      let v = P('moss', 2.6 - l * 1.3 + (hash(x, y, seed) - 0.5) * 0.8 + (Math.sin(x * 0.7 + y * 0.2) > 0.5 ? -0.6 : 0));
      if (y >= 12 && y <= 24 && Math.abs(x - 32) <= 5 && (y - 18) * (y - 18) / 30 + (x - 32) * (x - 32) / 26 <= 1) v = P('flesh', 3.6 + (hash(x, y, seed + 1) - 0.5) * 0.6);
      if ((y === 18 || y === 19) && (x === 29 || x === 35)) v = P('iron', 0);
      set(x, y, v);
    }
  }
  for (let y = 44; y <= 58; y++) for (let x = 8; x <= 56; x++) {
    let sh = 3 + hash(x, y, seed + 2) * 1.2 - 0.6 + (y === 44 ? 1.2 : 0) - (y >= 57 ? 1 : 0);
    if (x === 8 || x === 56) sh -= 1;
    set(x, y, P('wood', sh));
  }
  for (let y = 34; y <= 43; y++) for (let x = 47; x <= 53; x++) {
    const edge = x === 47 || x === 53 || y === 34;
    set(x, y, edge ? P('iron', 2) : P('glow', 5 - (y - 34) * 0.25 + hash(x, y, seed + 3) * 0.6));
  }
  return t;
}
function genWisp(seed) {
  const t = mk(255);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const dx = x - 32, dy = y - 34, r = Math.hypot(dx, dy);
    if (r < 9) t.data[y * TEX + x] = P('flesh', 7);
    else if (r < 15) t.data[y * TEX + x] = P('flesh', 5.5 - (r - 9) * 0.5 + hash(x, y, seed) * 0.8);
    else if (r < 21 && hash(x, y, seed + 1) > 0.55 + (r - 15) * 0.07) t.data[y * TEX + x] = P('flesh', 3 - (r - 15) * 0.3);
  }
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + seed; for (let k = 0; k < 9; k++) { const px = Math.round(32 + Math.cos(a) * (14 + k)), py = Math.round(34 + Math.sin(a) * (14 + k) * 0.8 + k * 0.9); if (px >= 0 && px < TEX && py >= 0 && py < TEX && hash(px, py, seed + 2) > 0.3) t.data[py * TEX + px] = P('flesh', 2.5 - k * 0.2); } }
  return t;
}

function genSign(seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 36; y <= 62; y++) for (let x = 29; x <= 35; x++) set(x, y, P('wood', 2.4 + hash(x, y, seed) * 0.8 - (x >= 34 ? 0.8 : 0)));
  for (let y = 8; y <= 40; y++) for (let x = 5; x <= 59; x++) {
    const edge = y <= 9 || y >= 39 || x <= 6 || x >= 58;
    set(x, y, P('wood', edge ? 2.2 : 5.6 + hash(x >> 2, y >> 3, seed + 1) * 0.5));
  }
  // „Schrift“: dunkle Wortblöcke in vier Zeilen, kräftig und scharf
  for (let line = 0; line < 4; line++) {
    let x = 10 + Math.floor(hash(line, 1, seed + 2) * 4);
    const y0 = 13 + line * 6;
    while (x < 52) {
      const w = 5 + Math.floor(hash(x, line, seed + 3) * 8);
      for (let yy = y0; yy < y0 + 3; yy++) for (let xx = x; xx < Math.min(54, x + w); xx++) set(xx, yy, P('wood', 0.3));
      x += w + 3;
    }
  }
  return t;
}

function genStairs(kind, seed) {
  // Steinbogen wie beim Pfad, darin eine gut lesbare Treppe
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  const up = kind === 'up';
  for (let y = 6; y <= 62; y++) for (let x = 5; x <= 59; x++) {
    const dx = x - 32, dy = y - 34, top = y <= 34, ro = Math.hypot(dx, dy);
    const outer = top ? ro <= 27 : Math.abs(dx) <= 27, inner = top ? ro <= 18 : Math.abs(dx) <= 18;
    if (!outer) continue;
    if (!inner) { set(x, y, P('stone', 3.4 + hash(x >> 1, y >> 1, seed) * 1.3 - (dx > 0 ? 0.5 : 0))); continue; }
    const k = up ? Math.floor((61 - y) / 6) : Math.floor((y - 20) / 6), pos = up ? (61 - y) % 6 : (y - 20) % 6;
    const tread = pos < 3;
    if (up) {
      // aufwärts: Stufen werden nach oben schmaler und hell, oben fällt Licht ein
      const narrow = Math.abs(dx) > 18 - k * 1.2;
      if (narrow) { set(x, y, P('ceil', 0.4)); continue; }
      const lightTop = 1 - Math.min(1, (y - 14) / 30);
      set(x, y, tread ? P('stone', 5.8 - k * 0.15 + hash(x, y, seed + 1) * 0.5) : P('stone', 1.6 + lightTop * 1.2));
      if (y < 24) set(x, y, P('glow', 4.5 + (1 - (y - 14) / 10) * 2));
    } else {
      // abwärts: Stufen werden nach unten dunkler und enden im Schwarz
      const fade = Math.max(0, 1 - k / 5.5);
      if (k > 5) { set(x, y, P('ceil', 0)); continue; }
      set(x, y, tread ? P('stone', 0.4 + fade * 5.2 + hash(x, y, seed + 1) * 0.4) : P('stone', 0.2 + fade * 1.4));
    }
  }
  return t;
}

function genArch(seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 8; y <= 62; y++) for (let x = 6; x <= 58; x++) {
    const dx = x - 32, dy = y - 34;
    const top = y <= 34, ro = Math.hypot(dx, dy);
    const outer = top ? ro <= 26 : Math.abs(dx) <= 26, inner = top ? ro <= 17 : Math.abs(dx) <= 17;
    if (!outer) continue;
    if (!inner) set(x, y, P('stone', 3.4 + hash(x >> 1, y >> 1, seed) * 1.4 + (Math.abs(dx) < 3 && y < 14 ? 1.4 : 0) - (dx > 0 ? 0.5 : 0)));
    else { const d = Math.min(1, Math.hypot(dx * 1.1, (y - 44) * 0.8) / 17); set(x, y, P('ceil', 0.6 + (1 - d) * 3.4 + hash(x, y, seed + 1) * 0.5)); }
  }
  for (let k = 0; k < 14; k++) { const x = 20 + Math.floor(hash(k, 3, seed) * 24), y = 52 + Math.floor(hash(k, 4, seed) * 9); set(x, y, P('floor', 3)); set(x + 1, y, P('floor', 3)); }
  return t;
}

function genKaefer(seed) {
  // Erzkäfer: breiter Panzer mit Rückenkiel, Kopf mit Zangen, sechs Beine, schwach glühende Augen
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 24; y <= 56; y++) for (let x = 6; x <= 58; x++) {
    const dx = (x - 32) / 25, dy = (y - 42) / 15;
    if (dx * dx + dy * dy > 1) continue;
    const lit = 4.6 - dy * 2.2 - Math.abs(dx) * 1.4 + hash(x, y, seed) * 0.5;
    set(x, y, P('iron', Math.max(0.6, lit - (Math.abs(x - 32) < 1 ? -0.9 : 0) - (((y - 24) % 7) === 0 && Math.abs(dx) < 0.85 ? 1.3 : 0))));
  }
  for (let y = 36; y <= 50; y++) for (let x = 26; x <= 38; x++) { const dx = (x - 32) / 6.5, dy = (y - 43) / 7; if (dx * dx + dy * dy <= 1) set(x, y, P('iron', 5.4 - dy * 1.2 + hash(x, y, seed + 1) * 0.5)); }
  for (let y = 26; y <= 38; y++) for (let x = 24; x <= 40; x++) { const dx = (x - 32) / 8, dy = (y - 33) / 6; if (dx * dx + dy * dy <= 1) set(x, y, P('stone', 3.2 - dy * 1.4 + hash(x, y, seed + 2) * 0.5)); }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) { set(32 + s * (5 + i), 40 + i, P('stone', 1.5)); set(32 + s * (5 + i), 41 + i, P('stone', 1)); }
    for (let i = 0; i < 6; i++) { set(32 + s * (3 + Math.round(i * 0.5)), 38 + i, P('stone', 6)); set(32 + s * (3 + Math.round(i * 0.5)) + s, 38 + i, P('stone', 5)); }
    set(32 + s * 4, 31, P('glow', 7)); set(32 + s * 4 + s, 31, P('glow', 6));
    for (let j = 0; j < 3; j++) { const ly = 46 + j * 5; for (let i = 0; i < 12; i++) { const lx = 32 + s * (14 + i), lyy = ly + Math.round(i * (j + 0.5) * 0.7); set(lx, lyy, P('stone', 4.2)); set(lx, lyy + 1, P('stone', 3)); set(lx + s, lyy, P('stone', 4.2)); } }
    for (let i = 0; i < 8; i++) { set(32 + s * (5 + i), 27 - i, P('stone', 4.5)); set(32 + s * (5 + i) + s, 27 - i, P('stone', 3.5)); }
  }
  return t;
}

function genLever(used, seed) {
  // Wandhebel auf Steinsockel: Griff oben (bereit) oder unten (umgelegt)
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 34; y <= 62; y++) for (let x = 18; x <= 46; x++) { const edge = x < 20 || y < 36; set(x, y, P('stone', 3.6 + hash(x >> 1, y >> 1, seed) * 1.1 + (edge ? 0.8 : 0) - (x > 43 ? 0.8 : 0))); }
  for (let y = 40; y <= 56; y++) for (let x = 29; x <= 35; x++) set(x, y, P('iron', 2 + hash(x, y, seed + 1) * 0.6)); // Schlitz/Platte
  for (let i = 0; i < 24; i++) { // Stange
    const y = used ? 48 + i * 0.6 : 48 - i * 1.0, x = 32 + (used ? 0 : 0);
    for (let w = -1; w <= 1; w++) set(x + w, Math.round(y), P('iron', 5 - Math.abs(w) * 1.2));
  }
  const ky = used ? 63 : 22, kx = 32;
  for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 14) set(kx + x, Math.min(63, ky + y), P('wood', 5 - (x + y) * 0.2));
  return t;
}

function genSkeleton(seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  const bone = (x, y, s) => P('stone', s + hash(x, y, seed) * 0.8);
  for (let y = 6; y <= 20; y++) for (let x = 24; x <= 40; x++) { const dx = (x - 32) / 8.5, dy = (y - 13) / 7.5; if (dx * dx + dy * dy <= 1) set(x, y, bone(x, y, 6)); }
  for (let y = 21; y <= 25; y++) for (let x = 27; x <= 37; x++) set(x, y, bone(x, y, 5));
  for (const ex of [28, 35]) for (let y = 11; y <= 15; y++) for (let x = ex; x <= ex + 2; x++) set(x, y, P('ceil', 0));
  for (const ex of [29, 36]) set(ex, 13, P('glow', 6));
  for (let y = 26; y <= 44; y++) for (let x = 31; x <= 33; x++) set(x, y, bone(x, y, 4.5));
  for (let i = 0; i < 5; i++) { const y = 28 + i * 3; for (let x = 22; x <= 42; x++) { const k = Math.abs(x - 32); if (k >= 3 && k <= 10 - i) set(x, y, bone(x, y, 4.5 - k * 0.1)); } }
  for (let y = 45; y <= 60; y++) for (const lx of [27, 36]) for (let x = lx; x <= lx + 2; x++) set(x, y, bone(x, y, 4));
  for (let y = 28; y <= 52; y++) for (const ax of [20, 43]) for (let x = ax; x <= ax + 2; x++) set(x, y, bone(x, y, 3.5));
  return t;
}

function genGuard(seed, boss) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 22; y <= 62; y++) { const w = 8 + Math.round((y - 22) * 0.35); for (let x = 32 - w; x <= 32 + w; x++) set(x, y, P(boss ? 'wood' : 'iron', (boss ? 2.4 : 3.2) + hash(x, y, seed) * 0.9 - (x > 32 ? 0.7 : 0) - (y > 54 ? 0.8 : 0))); }
  for (let y = 6; y <= 24; y++) { const w = 7 - Math.max(0, 14 - y) * 0.15; for (let x = Math.round(32 - w); x <= 32 + w; x++) set(x, y, P('iron', 4 + hash(x, y, seed + 1) * 0.8 - (x > 32 ? 0.8 : 0))); }
  for (let y = 13; y <= 15; y++) for (let x = 26; x <= 38; x++) set(x, y, P('ceil', 0));
  set(29, 14, P('glow', 6)); set(35, 14, P('glow', 6));
  for (let y = 24; y <= 46; y++) for (let x = 12; x <= 17; x++) set(x, y, P('iron', 3 + hash(x, y, seed + 2) - (x < 14 ? 0.6 : 0)));
  for (let y = 34; y <= 50; y++) for (let x = 46; x <= 48; x++) set(x, y, P('iron', 5 - (y > 46 ? 1 : 0)));
  if (boss) for (let y = 26; y <= 32; y++) for (let x = 29; x <= 35; x++) set(x, y, P('glow', 4 + (y === 29 ? 1.5 : 0)));
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
  const n = TEX * (detail > 1 ? 4 : 1), nf = TEX * (detail > 1 ? 2 : 1); // Wände 256, Boden/Decke 128: Eigenauflösung statt hochskaliert (Potenzen von 2 wegen Maskierung)
  return {
    wall: { [WALL_STONE]: genStone(11, n), [WALL_MOSS]: genMoss(23, n), [WALL_DOOR]: up(genDoor(31, false), 103), [WALL_DOOR_LOCKED]: up(genDoor(31, true), 104), [WALL_TORCH]: genTorch(11, n), [WALL_ROCK]: genRock(17, n), [WALL_GATE]: genGate(29, n), [WALL_LICHEN]: genRock(19, n, true) },
    floor: genFloor(41, nf),
    ceil: genCeil(53, nf),
    sprites: { chest: spr(genChest(false, 61), 107), chestOpen: spr(genChest(true, 61), 108), schrat: genSchrat(71), portal: spr(genPortal(81), 109), merchant: spr(genMerchant(91), 110), wisp: genWisp(121), skeleton: genSkeleton(171), guard: genGuard(181, false), captain: genGuard(191, true), kaefer: genKaefer(201), leverUp: genLever(false, 211), leverDown: genLever(true, 211), stairsDown: spr(genStairs('down', 141), 112), stairsUp: spr(genStairs('up', 151), 113), arch: spr(genArch(161), 114), sign: genSign(131) }
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
      for (let i = 0; i < 64; i++) t[i] = (i >> 3) === M.glow && d < 7 ? this.pal[(i & ~7) | Math.max(2, (i & 7) - (d >> 1))] : this.pal[(i & ~7) | Math.max(0, (i & 7) - d)];
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
    grid[y * w + x] = c === '#' ? WALL_STONE : c === 'm' ? WALL_MOSS : c === 'T' ? WALL_TORCH : c === 'r' ? WALL_ROCK : c === 'o' ? WALL_LICHEN : 0;
  }
  for (const o of objs) if (o.type === 'door' && !o.open) grid[o.y * w + o.x] = o.locked ? WALL_DOOR_LOCKED : WALL_DOOR;
  for (const o of objs) if (o.type === 'gate' && !o.open) grid[o.y * w + o.x] = WALL_GATE;
  return { grid, gw: w, gh: h };
}
const spriteFor = (tex, k) => (k === 'moorlicht' ? tex.sprites.wisp : k === 'skeleton' ? tex.sprites.skeleton : k === 'kultwaechter' ? tex.sprites.guard : k === 'hauptmann' ? tex.sprites.captain : k === 'erzkaefer' ? tex.sprites.kaefer : tex.sprites.schrat);
const kindOf = (o, i) => (Array.isArray(o.kinds) ? o.kinds[Math.min(i, o.kinds.length - 1)] : o.kind);
export function buildSprites(objs, tex, time, angle = 0, alive = null) { // alive: {objId: Arten (Liste) oder Anzahl der lebenden Gegner} im Kampf
  const out = [];
  const rx = Math.cos(angle), ry = Math.sin(angle); // „rechts“ aus Sicht der Kamera
  for (const o of objs) {
    if (o.type === 'chest') out.push({ x: o.x, y: o.y, tex: o.open ? tex.sprites.chestOpen : tex.sprites.chest, scale: 0.5 });
    else if (o.type === 'enemy' && !o.dead) {
      const tot = Array.isArray(o.kinds) ? Math.min(3, o.kinds.length) : 1;
      const av = alive && alive[o.id] != null ? alive[o.id] : null, kindList = Array.isArray(av) ? av : null;
      const n = kindList ? kindList.length : av != null ? av : tot; // Gruppe: eine Gestalt je lebendem Gegner, nebeneinander
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n - 1) / 2) * 0.36 : 0;
        out.push({ x: o.x + rx * off, y: o.y + ry * off, tex: spriteFor(tex, kindList ? kindList[i] : kindOf(o, i)), scale: (n > 1 ? 0.62 : 0.85) * (1 + 0.02 * Math.sin(time * 3 + i)) });
      }
    }
    else if (o.type === 'lever') out.push({ x: o.x, y: o.y, tex: o.used ? tex.sprites.leverDown : tex.sprites.leverUp, scale: 0.75 });
    else if (o.type === 'sign') out.push({ x: o.x, y: o.y, tex: tex.sprites.sign, scale: 0.7 });
    else if (o.type === 'merchant') out.push({ x: o.x, y: o.y, tex: tex.sprites.merchant, scale: 0.8 });
    else if (o.type === 'stairs') out.push({ x: o.x, y: o.y, tex: o.look === 'down' ? tex.sprites.stairsDown : o.look === 'up' ? tex.sprites.stairsUp : o.look === 'path' ? tex.sprites.arch : tex.sprites.portal, scale: 0.9 });
    else if (o.type === 'exit') out.push({ x: o.x, y: o.y, tex: tex.sprites.portal, scale: 0.9 });
  }
  return out;
}

// ---------- Prozedurale Heldenporträts (32×32, nur im Browser genutzt) ----------
const SKIN = ['#e0b48c', '#c98f66', '#f0c8a0', '#a8714c'];
const ORK_SKIN = ['#7f9a5a', '#6f8a4e'];
const hx = (c) => c;
// role = Berufsname (Krieger, Schurke, Priester, Magier, Waldläufer), race = Rassen-Schlüssel (optional, z. B. 'elf')
export function drawPortrait(ctx, role, seed, race) {
  const skin = race === 'ork' ? ORK_SKIN[Math.abs(seed) % ORK_SKIN.length] : SKIN[Math.abs(seed) % SKIN.length];
  const px = (x, y, w, h, c) => { ctx.fillStyle = hx(c); ctx.fillRect(x, y, w, h); };
  px(0, 0, 32, 32, '#1b1712');
  px(0, 24, 32, 8, role === 'Krieger' ? '#6b7280' : role === 'Schurke' ? '#2f4a33' : role === 'Priester' ? '#e8e2d0' : role === 'Waldläufer' ? '#6b5532' : '#2c3e7a');
  px(13, 22, 6, 4, skin);
  for (let y = 8; y <= 24; y++) { // Gesicht (Ellipse)
    const k = Math.sqrt(Math.max(0, 1 - Math.pow((y - 16) / 8.5, 2))) * 7.2;
    px(Math.round(16 - k), y, Math.round(k * 2), 1, skin);
  }
  px(12, 16, 2, 2, '#1b1712'); px(18, 16, 2, 2, '#1b1712'); px(14, 21, 4, 1, '#6b3b2a');
  if (race === 'elf') { px(6, 14, 3, 3, skin); px(23, 14, 3, 3, skin); px(5, 12, 1, 3, skin); px(26, 12, 1, 3, skin); }
  else if (race === 'dwarf') { px(10, 22, 12, 5, '#8a5a2c'); px(9, 17, 2, 5, '#8a5a2c'); px(21, 17, 2, 5, '#8a5a2c'); }
  else if (race === 'ork') { px(12, 21, 1, 2, '#efe8d0'); px(19, 21, 1, 2, '#efe8d0'); px(11, 14, 4, 1, '#2b3a1c'); px(17, 14, 4, 1, '#2b3a1c'); }
  else if (race === 'gnome') { px(15, 17, 3, 3, '#e0a080'); }
  if (role === 'Krieger') { px(8, 6, 16, 6, '#8d95a3'); px(8, 12, 3, 8, '#8d95a3'); px(21, 12, 3, 8, '#8d95a3'); px(15, 12, 2, 6, '#8d95a3'); }
  else if (role === 'Schurke') { px(7, 5, 18, 7, '#2f4a33'); px(7, 12, 3, 12, '#2f4a33'); px(22, 12, 3, 12, '#2f4a33'); }
  else if (role === 'Priester') { px(9, 5, 14, 5, '#e8e2d0'); px(14, 1, 4, 5, '#d9b44a'); px(15, 2, 2, 3, '#e8e2d0'); }
  else if (role === 'Waldläufer') { px(8, 5, 16, 6, '#6b5532'); px(6, 10, 20, 2, '#6b5532'); px(21, 1, 2, 7, '#b7d17a'); px(7, 12, 2, 8, '#6b5532'); px(23, 12, 2, 8, '#6b5532'); }
  else { for (let i = 0; i < 12; i++) px(16 - Math.round(i * 0.55), 1 + i, Math.round(1 + i * 1.1), 1, '#2c3e7a'); px(6, 12, 20, 2, '#2c3e7a'); px(14, 6, 4, 2, '#d9b44a'); }
}
