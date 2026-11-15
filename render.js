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
export const WALL_STONE = 1, WALL_MOSS = 2, WALL_DOOR = 3, WALL_DOOR_LOCKED = 4, WALL_TORCH = 5, WALL_ROCK = 6, WALL_LICHEN = 7, WALL_GATE = 8, WALL_SECRET = 9, WALL_SWITCH = 10, WALL_SWITCH_ON = 11;

// ---------- Palette: 8 Materialien × 8 Helligkeitsstufen = 64 feste Farben ----------
export function buildPalette(def, lift = 1) {
  const pal = new Uint32Array(64);
  MATS.forEach((m, mi) => {
    const c = def[m] || [128, 128, 128];
    for (let s = 0; s < 8; s++) {
      const f = 0.08 + 0.92 * Math.pow(s / 7, 1.15 / lift);
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
    // 0.16.4b: offener Deckel ohne Lücke (vorher wirkte die Truhe wie ein Stuhl). Von leicht oben gesehen:
    // Öffnung als Trapez (hinten schmaler) mit dunklem, leerem Innenraum, Rand hell; Deckel hängt an der Hinterkante,
    // ist nach hinten geklappt (oben schmaler, Innenseite mit Brettern und Eisenbändern, helle Kante oben).
    for (let y = 27; y <= 34; y++) { // Öffnung / Oberseite des Kastens
      const inset = Math.round((34 - y) * 0.55);
      const x0 = 10 + inset, x1 = 53 - inset;
      for (let x = x0; x <= x1; x++) {
        const rim = x <= x0 + 1 || x >= x1 - 1 || y === 34 || y === 27;
        set(x, y, rim ? P('wood', 4 + (y === 34 ? 0.6 : 0) - (y === 27 ? 1 : 0)) : P('wood', 0.2 + hash(x, y, seed + 5) * 0.5 + (y >= 32 ? 0.3 : 0)));
      }
    }
    for (let y = 15; y <= 27; y++) { // Deckel, Innenseite (nach hinten geklappt: kürzer, oben schmaler)
      const k = (27 - y) / 12, inset = Math.round(4 + k * 4);
      const x0 = 10 + inset, x1 = 53 - inset, w = x1 - x0;
      for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / w;
        let v = P('wood', 2.2 + hash(x, y, seed + 4) * 0.9 - k * 0.4);
        if (Math.abs(u * 6 - Math.round(u * 6)) < 0.06) v = P('wood', 1.2); // Bretterfugen
        if ((u > 0.17 && u < 0.25) || (u > 0.75 && u < 0.83)) v = P('iron', 3 + hash(x, y, seed + 6) * 0.8);
        if (x <= x0 || x >= x1) v = P('wood', 1.4);
        if (y <= 16) v = P('wood', 4.4 - (y === 15 ? 0 : 0.6)); // Deckelkante oben (Dicke)
        if (y >= 26) v = P('iron', 2.6); // Scharnierleiste
        set(x, y, v);
      }
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
function genMerchant(seed) { // Hedda: Händlerin mit Kopftuch, Umhang, Schürze und Laterne hinter dem Tresen
  const SN = 128, k = 64 / SN;
  const t = { w: SN, h: SN, data: new Uint8Array(SN * SN).fill(255) };
  const el = (px, py, cx, cy, rx, ry) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
    const px = (x + 0.5) * k, py = (y + 0.5) * k, dx = px - 32, l = dx / 18;
    let v = -1;
    // Körper: Kleid + Umhang
    const hw = 8.5 + Math.max(0, py - 24) * 0.28;
    if (py >= 24 && py <= 50 && Math.abs(dx) <= hw) v = P('moss', 2.6 - l * 1.4 + (vnoise(px * 5, py * 0.4, 6, seed) - 0.5) * 1.2);
    if (el(px, py, 32, 24.5, 12, 4.2)) v = P('moss', 3 - l * 1.4); // Schultern
    // Schürze
    if (py >= 31 && py <= 50 && Math.abs(dx) <= 5.6 + (py - 31) * 0.12) v = P('iron', 5.4 - l * 0.8 + (hash(x, y, seed) - 0.5) * 0.3);
    if (py >= 31 && py <= 32.2 && Math.abs(dx) <= 6.4) v = P('wood', 2.5); // Schürzenband
    // Hals + Gesicht
    if (py >= 21 && py <= 25 && Math.abs(dx) <= 2.2) v = P('glow', 3.6);
    if (el(px, py, 32, 14.5, 6.3, 7.4)) v = P('glow', 4.9 - l * 0.8);
    // Haar: dunkle Strähnen seitlich des Gesichts, unter dem Tuch
    if (py >= 9 && py <= 26 && (el(px, py, 32, 15, 8.4, 8.6) && !el(px, py, 32, 15.5, 5.6, 6.6))) v = P('wood', 1.6 + (hash(x, y, seed + 4) - 0.5) * 0.8);
    if (py > 19 && py < 28 && Math.abs(Math.abs(dx) - 7.3) < 1.7 && py - 18 > Math.abs(dx) * 0.2) v = P('wood', 1.4 + (hash(x, y, seed + 5) - 0.5) * 0.8); // Zöpfe über die Schultern
    // Kopftuch (oben) mit Knoten
    if (py <= 11.2 && el(px, py, 32, 10, 9.2, 6.2)) v = P('iron', 3.4 - l * 1.0);
    if (el(px, py, 32, 9.6, 8.4, 3.4)) v = P('iron', 4 - l * 1.0);
    if (el(px, py, 41, 12.5, 2.4, 2.8) && py > 9) v = P('iron', 2.6); // Knoten seitlich
    // Arm mit Laterne
    if (v < 0 && (Math.hypot(px - 47, py - 35) <= 2.6 || (py >= 26 && py <= 36 && Math.abs(px - (41 + (py - 26) * 0.55)) <= 3))) v = P('moss', 2.2);
    if (v >= 0) t.data[y * SN + x] = v;
  }
  // Gesichtszüge: Augen mit Wimpern, Brauen, Nase, Lippen
  const paint = (cx, cy, rx, ry, val) => { for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) { const px = (x + 0.5) * k, py = (y + 0.5) * k; if (el(px, py, cx, cy, rx, ry)) t.data[y * SN + x] = val; } };
  for (const ex of [29.6, 34.4]) { paint(ex, 14.4, 1.35, 0.85, P('iron', 7)); paint(ex, 14.4, 0.7, 0.8, P('ceil', 0)); paint(ex, 12.6, 1.6, 0.4, P('wood', 1)); paint(ex, 13.5, 1.5, 0.3, P('ceil', 0)); }
  paint(32, 16.7, 0.7, 1.1, P('glow', 3.6)); // Nase
  paint(32, 19.2, 1.9, 0.75, P('wood', 2.6)); paint(32, 19.0, 1.0, 0.3, P('wood', 3.6)); // Lippen
  // Theke
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
    const px = (x + 0.5) * k, py = (y + 0.5) * k;
    if (py >= 44 && py <= 63.5 && px >= 7 && px <= 57) { let sh = 3 + hash(x, y, seed + 2) * 1.2 - 0.6 + (py < 45 ? 1.2 : 0) - (py > 62 ? 1 : 0); if (px < 8 || px > 56) sh -= 1; t.data[y * SN + x] = P('wood', sh); }
    if (px >= 44 && px <= 50 && py >= 34 && py <= 44 && !(py > 43.5)) { const edge = px < 44.9 || px > 49.1 || py < 34.9; t.data[y * SN + x] = edge ? P('iron', 2) : P('glow', 5 - (py - 34) * 0.25 + hash(x, y, seed + 3) * 0.6); }
  }
  const copy = t.data.slice(); // dunkler Umriss
  for (let y = 1; y < SN - 1; y++) for (let x = 1; x < SN - 1; x++) { const i = y * SN + x; if (copy[i] !== 255 && (copy[i] >> 3) !== 7 && (copy[i - 1] === 255 || copy[i + 1] === 255 || copy[i - SN] === 255 || copy[i + SN] === 255)) t.data[i] = P(MATS[copy[i] >> 3], Math.max(0, (copy[i] & 7) - 2.5)); }
  t.noWrap = true;
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

// 5×7-Pixelschrift für Schilder (Großbuchstaben, Ziffern, wenige Zeichen)
const FONT = {
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110', C: '01110/10001/10000/10000/10000/10001/01110',
  D: '11110/10001/10001/10001/10001/10001/11110', E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01110/10001/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001', I: '01110/00100/00100/00100/00100/00100/01110',
  J: '00111/00010/00010/00010/00010/10010/01100', K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/10001/11001/10101/10011/10001/10001', O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000', Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100', U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100', W: '10001/10001/10001/10101/10101/10101/01010', X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
  'Ä': '01010/01110/10001/11111/10001/10001/10001', 'Ö': '01010/01110/10001/10001/10001/10001/01110', 'Ü': '01010/10001/10001/10001/10001/10001/01110',
  0: '01110/10001/10011/10101/11001/10001/01110', 1: '00100/01100/00100/00100/00100/00100/01110', 2: '01110/10001/00001/00010/00100/01000/11111',
  3: '11110/00001/00001/01110/00001/00001/11110', 4: '00010/00110/01010/10010/11111/00010/00010', 5: '11111/10000/11110/00001/00001/10001/01110',
  6: '00110/01000/10000/11110/10001/10001/01110', 7: '11111/00001/00010/00100/01000/01000/01000', 8: '01110/10001/10001/01110/10001/10001/01110',
  9: '01110/10001/10001/01111/00001/00010/01100',
  '.': '00000/00000/00000/00000/00000/01100/01100', '!': '00100/00100/00100/00100/00100/00000/00100', '?': '01110/10001/00001/00010/00100/00000/00100',
  ':': '00000/01100/01100/00000/01100/01100/00000', '-': '00000/00000/00000/11111/00000/00000/00000', '→': '00000/00100/00010/11111/00010/00100/00000', ' ': '00000/00000/00000/00000/00000/00000/00000'
};
function genSign(seed, title) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 36; y <= 62; y++) for (let x = 29; x <= 35; x++) set(x, y, P('wood', 2.4 + hash(x, y, seed) * 0.8 - (x >= 34 ? 0.8 : 0)));
  for (let y = 8; y <= 40; y++) for (let x = 5; x <= 59; x++) {
    const edge = y <= 9 || y >= 39 || x <= 6 || x >= 58;
    set(x, y, P('wood', edge ? 2.2 : 5.6 + hash(x >> 2, y >> 3, seed + 1) * 0.5));
  }
  const ink = P('wood', 0.3);
  const lines = String(title || '').toUpperCase().split('|').slice(0, 2).filter(Boolean);
  if (lines.length) { // Titel in Pixelschrift, mittig; darunter angedeutete Textzeilen
    lines.forEach((ln, li) => {
      const chars = [...ln].slice(0, 8), w = chars.length * 6 - 1, x0 = Math.round(32 - w / 2), y0 = 12 + li * 9;
      chars.forEach((ch, ci) => {
        const g = (FONT[ch] || FONT[' ']).split('/');
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === '1') set(x0 + ci * 6 + c, y0 + r, ink);
      });
    });
    return t;
  }
  // ohne Titel: dunkle Wortblöcke
  for (let line = 0; line < 4; line++) {
    let x = 10 + Math.floor(hash(line, 1, seed + 2) * 4);
    const y0 = 13 + line * 6;
    while (x < 52) {
      const w = 5 + Math.floor(hash(x, line, seed + 3) * 8);
      for (let yy = y0; yy < y0 + 3; yy++) for (let xx = x; xx < Math.min(54, x + w); xx++) set(xx, yy, ink);
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

// Moorschrat als Boss: breiter, vorgebeugter Baumriese mit Geweihkrone, Bodenkrallen, Zähnen und glühenden Rissen in der Brust
function genSchratBoss(seed, variant = 'moor') { // 'moor': grünlich, algig, nass, kahl, kleine Augen · 'grube': dreckig, lange schwarze Zottelhaare, große schwarze Augen
  const moor = variant === 'moor', SN = 192, k = 64 / SN;
  const t = { w: SN, h: SN, data: new Uint8Array(SN * SN).fill(255) };
  const segd = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, q = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    const nx = ax + vx * q, ny = ay + vy * q;
    return { d: Math.hypot(px - nx, py - ny), nx, ny, q };
  };
  const lim = (px, py, ax, ay, bx, by, r0, r1) => { const q = segd(px, py, ax, ay, bx, by), r = r0 + (r1 - r0) * q.q; return q.d <= r ? { cx: q.nx, cy: q.ny, r } : null; };
  const ell = (px, py, cx, cy, rx, ry) => { const a = (px - cx) / rx, b = (py - cy) / ry; return a * a + b * b <= 1 ? { cx, cy, r: Math.max(rx, ry) } : null; };
  const MIRROR = [-1, 1];
  const STR = []; // Haarsträhnen: Wellenlinien vom Scheitel über Schultern, nach außen länger
  if (!moor) for (let i = 0; i < 34; i++) {
    const fringe = i % 4 === 0, sg = i % 2 ? 1 : -1, r = hash(i, 1, seed), u = fringe ? (hash(i, 4, seed) - 0.5) * 1.6 : sg * 0.55;
    const x0 = fringe ? 32 + u * 8.5 : 32 + sg * (8.2 + r * 4.2), y0 = fringe ? 7.8 + Math.abs(u) * 2 : 9.5 + r * 4, len = fringe ? 2.5 + hash(i, 2, seed) * 2.2 : 24 + r * 18;
    const pts = [[x0, y0]]; let cx = x0, cy = y0;
    for (let n = 1; n <= 5; n++) { cx += u * (fringe ? 0.6 : 2.0) + (hash(i, n, seed + 3) - 0.5) * 3.0; cy += len / 5; pts.push([cx, cy]); }
    STR.push(pts);
  }
  const hair = (px, py) => { for (const p of STR) for (let n = 0; n < 5; n++) { const q = lim(px, py, p[n][0], p[n][1], p[n + 1][0], p[n + 1][1], 1.9 - n * 0.2, 1.6 - n * 0.28); if (q) return q; } return null; };
  const arm = (px, py) => { for (const sg of MIRROR) { const h = lim(px, py, 32 + sg * 17, 27, 32 + sg * 27, 44, 7, 5.4) || lim(px, py, 32 + sg * 27, 44, 32 + sg * 25, 59, 5.4, 4) || ell(px, py, 32 + sg * 17, 26, 9, 8); if (h) return h; } return null; };
  const claws = (px, py) => { for (const sg of MIRROR) for (const d of [-5, -1.5, 2]) { const c = lim(px, py, 32 + sg * 25, 58, 32 + sg * (25 + d * 1.7), 63.7, 1.9, 0.35); if (c) return c; } return null; };
  const antlers = (px, py) => {
    for (const sg of MIRROR) {
      const X = (v) => 32 + sg * v;
      const a = lim(px, py, X(7), 9, X(13), 3, 1.9, 1.1) || lim(px, py, X(13), 3, X(19), 0.6, 1.1, 0.5) || lim(px, py, X(10), 6, X(17), 7.5, 1.1, 0.5) || lim(px, py, X(14.4), 2.2, X(15.5), -0.5, 0.8, 0.3) || lim(px, py, X(7), 9, X(5), 1.5, 1.2, 0.4) || lim(px, py, X(17), 7.5, X(21), 4.5, 0.6, 0.3);
      if (a) return a;
    }
    return null;
  };
  const roots = (px, py) => lim(px, py, 22, 54, 9, 63.5, 5, 1.6) || lim(px, py, 42, 54, 55, 63.5, 5, 1.6) || lim(px, py, 28, 56, 20, 63.9, 4.2, 1.3) || lim(px, py, 36, 56, 44, 63.9, 4.2, 1.3) || lim(px, py, 32, 57, 32, 63.9, 3.6, 1.3);
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
    const px = (x + 0.5) * k, py = (y + 0.5) * k;
    let hit = null, part = '';
    if (!moor && (hit = hair(px, py))) part = 'hair';
    const bw = 17.5 - 5.5 * Math.max(0, (py - 33) / 26);
    if (!hit) { const bx = (px - 32) / bw, by = (py - 40) / 20.5; if (bx * bx + by * by <= 1) { hit = { cx: 32, cy: 40, r: 19 }; part = 'body'; } }
    if (!hit && (hit = ell(px, py, 32, 17.2, 11, 9.4))) part = 'head';
    if (!hit && (hit = arm(px, py))) part = 'arm';
    if (!hit && (hit = roots(px, py))) part = 'root';
    if (!hit && (hit = claws(px, py))) part = 'claw';
    if (!hit) continue;
    const l = ((px - hit.cx) * 0.9 + (py - hit.cy) * 0.7) / hit.r;
    let sh = 3.3 - l * 1.9 + (vnoise(px, py, 3.5, seed) - 0.5) * 0.7, mat = 'wood';
    if (part === 'hair') { mat = 'ceil'; sh = 0.5 - l * 0.5 + (vnoise(px * 9, py * 0.6, 4, seed + 21) - 0.5) * 1.2 + (hash(x, y, seed + 23) - 0.5) * 0.4; if (vnoise(px * 8, py * 0.5, 4, seed + 25) > 0.8) sh = 2.1; }
    else if (part === 'head') {
      mat = 'wood'; sh = 3.0 - l * 1.5 + (vnoise(px * 3, py, 8, seed + 4) - 0.5) * 1.0;
      if (py > 21.2 && py < 25 && Math.abs(px - 32) < 7.6) { mat = 'ceil'; sh = 0; } // Maul
    } else if (part === 'claw') { mat = 'stone'; sh = 5.6 - l; }
    else if (part === 'branch') { mat = 'wood'; sh = 2.0 - l * 0.8; }
    else { // Rinde: feine senkrechte Furchen und Rippen statt großer Flecken
      const g = vnoise(px * 9, py * 0.7, 5, seed + 2), g2 = vnoise(px * 3.2, py * 0.5, 11, seed + 7);
      sh += (g - 0.5) * 2.6 + (g2 - 0.5) * 1.1;
      if (g < 0.2) sh -= 1.1; // tiefe Rindenspalte
      sh += (hash(x, y, seed + 5) - 0.5) * 0.35;
    }
    if (!moor && part === 'head' && mat !== 'ceil') { mat = 'flesh'; sh = 3.6 - l * 1.2 + (vnoise(px * 3, py, 6, seed + 4) - 0.5) * 0.8; } // fahles, schmutziges Gesicht, damit die schwarzen Augen wirken
    if (!moor && part !== 'hair' && part !== 'claw' && mat !== 'ceil') { sh -= 0.5; if (vnoise(px, py, 4.5, seed + 15) > 0.62) sh -= 1.2; } // Grubenschrat: schmutzig, dunkle Dreckflecken
    if (moor && part !== 'claw' && mat !== 'ceil' && part !== 'head' && vnoise(px, py, 4.2, seed + 13) < 0.74) { mat = 'moss'; sh = 3.1 - l * 1.7 + (vnoise(px * 8, py * 0.8, 5, seed + 3) - 0.5) * 1.8 + (hash(x, y, seed + 5) - 0.5) * 0.4; } // Moorschrat: überwiegend Algen und Moos mit fauligen Holzstellen
    if (moor && part === 'head') { mat = 'moss'; sh = 3.3 - l * 1.4 + (vnoise(px * 3, py, 6, seed + 4) - 0.5) * 0.9; if (py > 21.2 && py < 25 && Math.abs(px - 32) < 7.6) { mat = 'ceil'; sh = 0; } } // kahler, grünlicher Schädel
    const mossy = false;
    if (part !== 'claw' && part !== 'branch' && mat !== 'ceil' && mossy) { mat = 'moss'; sh = 2.6 + (1 - l) * 0.8 + (hash(x, y, seed + 11) - 0.5) * 0.5; }
    t.data[y * SN + x] = P(mat, sh);
  }
  // Zähne: helle Dornen oben und unten im Maul
  const setp = (px, py, v) => { const x = Math.floor(px / k), y = Math.floor(py / k); if (x >= 0 && y >= 0 && x < SN && y < SN && t.data[y * SN + x] !== 255) t.data[y * SN + x] = v; };
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
    const px = (x + 0.5) * k, py = (y + 0.5) * k;
    if (Math.abs(px - 32) > 7.2 || py < 20.8 || py > 25.4) continue;
    const ph = ((px - 24.8) / 2.4) % 1, tri = Math.abs(ph - 0.5) * 2; // 0..1 Zickzack
    if (py < 22.7 && py - 20.8 < (1 - tri) * 2.4 + 0.2) setp(px, py, P('stone', 6.6 - (py - 20.8) * 0.5));
    if (py > 23.6 && 25.4 - py < (1 - Math.abs(((px - 26) / 2.4) % 1 - 0.5) * 2) * 1.9 + 0.1) setp(px, py, P('stone', 6.2));
  }
  // glühende Risse in der Brust (nur Grubenschrat)
  for (let i = 0; i < (moor ? 0 : 4); i++) {
    let cx = 32 + (i - 1.5) * 4.2, cy = 33 + (i % 2) * 2;
    for (let n = 0; n < 26; n++) { setp(cx, cy, P('glow', 6.4 - n * 0.06)); setp(cx + 0.35, cy, P('glow', 5)); cx += (hash(i, n, seed + 20) - 0.5) * 1.5; cy += 0.55; }
  }
  // dunkler Umriss
  for (let pass = 0; pass < 2; pass++) {
    const copy = t.data.slice();
    for (let y = 1; y < SN - 1; y++) for (let x = 1; x < SN - 1; x++) {
      const i = y * SN + x;
      if (copy[i] === 255) continue;
      if (copy[i - 1] === 255 || copy[i + 1] === 255 || copy[i - SN] === 255 || copy[i + SN] === 255) t.data[i] = P(MATS[copy[i] >> 3], Math.max(0, (copy[i] & 7) - 2.8));
    }
  }
  if (moor) { // Wassertropfen: glänzende Perlen auf dem Körper und Tropfen, die von Kinn, Armen und Körper hängen
    for (let i = 0; i < 34; i++) {
      const px = 14 + hash(i, 5, seed + 31) * 36, py = 12 + hash(i, 6, seed + 31) * 44, X = Math.floor(px / k), Y = Math.floor(py / k);
      if (t.data[Y * SN + X] === 255 || (t.data[Y * SN + X] >> 3) === 5) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) { const o = (Y + dy) * SN + X + dx; if (t.data[o] !== 255 && Math.hypot(dx / 1.2, dy / 2) <= 1) t.data[o] = P('moss', 6.3 - dy * 0.35); }
      for (const [dx, dy] of [[-1, -1], [0, -1]]) { const o = (Y + dy) * SN + X + dx; if (t.data[o] !== 255) t.data[o] = P('stone', 7.4); } // Glanzpunkt
    }
    for (let i = 0; i < 14; i++) { // hängende Tropfen
      const px = 17 + hash(i, 7, seed + 33) * 30, py0 = 24 + hash(i, 8, seed + 33) * 24;
      let X = Math.floor(px / k), Y = Math.floor(py0 / k); while (Y < SN - 3 && t.data[(Y + 1) * SN + X] !== 255) Y++;
      if (Y > SN - 20 || t.data[Y * SN + X] === 255) continue;
      const L = 5 + Math.floor(hash(i, 9, seed + 33) * 9);
      for (let n = 1; n <= L; n++) t.data[(Y + n) * SN + X] = P('moss', 5.2);
      for (const dy of [L + 1, L + 2]) for (const dx of dy === L + 1 ? [-1, 0, 1] : [0]) t.data[(Y + dy) * SN + X + dx] = P('stone', dy === L + 1 ? 6.4 : 5.6);
      t.data[(Y + L) * SN + X - 1] = P('stone', 7.4);
    }
  }
  const E = moor ? { rx: 1.5, ry: 0.85, y: 16.2, xs: [28.6, 35.4] } : { rx: 3.7, ry: 3.0, y: 15.8, xs: [27.2, 36.8] };
  for (const [ei, ex] of E.xs.entries()) {
    const sg = ei ? 1 : -1;
    for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
      const dx = (x + 0.5) * k - ex, dy = (y + 0.5) * k - E.y, i = y * SN + x;
      if (t.data[i] === 255) continue;
      if (moor) { // kleine, kalte, glimmende Augen in dunkler Höhle
        const rx = dx * 0.95 - sg * dy * 0.4, ry = dy * 0.95 + sg * dx * 0.4, e = (rx / E.rx) ** 2 + (ry / E.ry) ** 2;
        if (e <= 1) t.data[i] = P('glow', e < 0.4 ? 7 : 5.5); else if (e <= 3.2) t.data[i] = P('ceil', 0);
      } else { // große, tiefschwarze Augen mit Glanzpunkt
        const e = (dx / E.rx) ** 2 + (dy / E.ry) ** 2;
        if (e <= 1) t.data[i] = P('ceil', 0); else if (e <= 1.35) t.data[i] = P('ceil', 1);
        if (Math.hypot(dx + 1.4, dy + 1.1) < 0.55) t.data[i] = P('stone', 7.4);
      }
    }
  }
  t.noWrap = true;
  return t;
}

// Robengestalten des Nebelturms: 'geist' (Nebelgeist, schwebend, zerfranst), 'priester' (Kultpriester mit Stab), 'hueter' (Nebelhüter: Krone, Stab, leuchtendes Siegel)
function genRobed(seed, kind) {
  const SN = 128, k = 64 / SN, geist = kind === 'geist', hueter = kind === 'hueter';
  const t = { w: SN, h: SN, data: new Uint8Array(SN * SN).fill(255) };
  const segd = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, q = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy))); return { d: Math.hypot(px - ax - vx * q, py - ay - vy * q), q }; };
  const cap = (px, py, ax, ay, bx, by, r0, r1) => { const q = segd(px, py, ax, ay, bx, by); return q.d <= r0 + (r1 - r0) * q.q; };
  const robeMat = geist ? 'flesh' : hueter ? 'iron' : 'wood';
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
    const px = (x + 0.5) * k, py = (y + 0.5) * k, dx = px - 32;
    let part = '';
    const bottom = geist ? 55 - 5 * Math.abs(Math.sin(px * 0.85 + seed)) - 2 * Math.abs(Math.sin(px * 2.3)) : 63.5 - 1.2 * Math.abs(Math.sin(px * 1.1 + seed));
    const hw = 6.5 + Math.max(0, py - 20) * (geist ? 0.24 : 0.3) + (geist ? Math.sin(py * 0.45 + seed) * 1.2 : 0);
    if (py >= 19 && py <= bottom && Math.abs(dx) <= hw) part = 'robe';
    if (!part && ((dx / 11.5) ** 2 + ((py - 22.5) / 5) ** 2 <= 1)) part = 'robe';
    if (!part && (cap(px, py, 22, 23, 17.5, 40, 3.4, 2.6) || cap(px, py, 42, 23, 46.5, 37, 3.4, 2.6))) part = 'arm';
    if ((dx / 7.6) ** 2 + ((py - 13.5) / 8.6) ** 2 <= 1) part = 'hood';
    if (!geist && !part && cap(px, py, 47.2, 7, 47.2, 62.5, 0.9, 0.9)) part = 'staff';
    if (!geist && Math.hypot(px - 47.2, py - 6) <= (hueter ? 3.2 : 2.5)) part = 'orb';
    if (hueter && !part && (cap(px, py, 27, 7, 24.5, 0.8, 1.3, 0.3) || cap(px, py, 32, 6, 32, -0.5, 1.4, 0.3) || cap(px, py, 37, 7, 39.5, 0.8, 1.3, 0.3))) part = 'crown';
    if (!part) continue;
    const l = (dx * 0.9 + (py - 34) * 0.25) / 18; // Licht von links oben
    let mat = robeMat, sh = 3.6 - l * 2.2 + (vnoise(px * 5, py * 0.35, 6, seed) - 0.5) * 2.0 + (hash(x, y, seed + 3) - 0.5) * 0.3; // senkrechte Falten
    if (part === 'hood') { sh = 3.4 - ((px - 32) * 0.9 + (py - 13.5) * 0.6) / 8 * 1.5; if (((px - 32) / 4.9) ** 2 + ((py - 15.2) / 5.6) ** 2 <= 1) { mat = 'ceil'; sh = 0; } }
    else if (part === 'staff') { mat = 'wood'; sh = 2.4; }
    else if (part === 'orb') { mat = 'glow'; sh = 7 - Math.hypot(px - 46.5, py - 5.3) * 0.9; }
    else if (part === 'crown') { mat = 'iron'; sh = 5.2 - l; }
    else if (part === 'arm') sh -= 0.5;
    if (geist) sh += 1.6 - Math.max(0, py - 30) * 0.07; // oben hell, nach unten verblassend
    if (!geist && part === 'robe' && Math.abs(dx) < 1.1 && py > 24) { mat = 'glow'; sh = hueter ? 5.5 : 3.2; } // Saum in der Mitte
    if (hueter && part === 'robe' && Math.abs(Math.hypot(dx, py - 31) - 3.6) < 0.8) { mat = 'glow'; sh = 6.8; } // Siegel auf der Brust
    t.data[y * SN + x] = P(mat, sh);
  }
  const copy = t.data.slice(); // dunkler Umriss
  for (let y = 1; y < SN - 1; y++) for (let x = 1; x < SN - 1; x++) { const i = y * SN + x; if (copy[i] !== 255 && (copy[i] >> 3) !== 7 && (copy[i - 1] === 255 || copy[i + 1] === 255 || copy[i - SN] === 255 || copy[i + SN] === 255)) t.data[i] = P(MATS[copy[i] >> 3], Math.max(0, (copy[i] & 7) - 2.5)); }
  for (const ex of [29.6, 34.4]) for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) { // Augen
    const d = Math.hypot((x + 0.5) * k - ex, ((y + 0.5) * k - 14.6) * 1.25), r = hueter ? 1.25 : geist ? 1.1 : 0.85;
    if (d <= r) t.data[y * SN + x] = geist ? P('ceil', 0) : P('glow', d < r * 0.55 ? 7 : 5.2);
  }
  if (geist) for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) { const px = (x + 0.5) * k, py = (y + 0.5) * k; if (((px - 32) / 1.5) ** 2 + ((py - 18.6) / 2.2) ** 2 <= 1) t.data[y * SN + x] = P('ceil', 0); } // offener Mund
  t.noWrap = true;
  return t;
}

// Runenstein: aufrechte Steinplatte mit leuchtenden Runen und Schein am Boden (Ziel eines Gebiets)
function genRuneStone(seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 7; y <= 62; y++) for (let x = 17; x <= 47; x++) {
    const top = y < 22 ? Math.hypot(Math.max(0, Math.abs(x - 32) - 6), 22 - y) : 0;
    if (y < 22 && (Math.abs(x - 32) > 6 ? top > 9.5 : false)) continue;
    if (y < 14 && Math.abs(x - 32) > 8 - (14 - y) * 0.4) continue;
    const edge = x < 20 || y < 11 && y < 9 + Math.abs(x - 32) * 0.1, shade = x > 43 ? -0.9 : 0;
    set(x, y, P('stone', 3.4 + hash(x >> 1, y >> 1, seed) * 1.2 + (x < 20 ? 0.9 : 0) + shade));
  }
  for (const [y0, w] of [[18, 7], [31, 9], [44, 7]]) { // drei Runenzeilen
    for (let i = 0; i < 3; i++) {
      const cx = 32 + (i - 1) * 8, gy = y0, kind = Math.floor(hash(i, y0, seed + 3) * 3);
      for (let a = -4; a <= 4; a++) { set(cx, gy + a, P('glow', 6.4)); set(cx + 1, gy + a, P('glow', 4.6)); }
      if (kind === 0) for (let a = 0; a <= 4; a++) { set(cx + a, gy - 4 + a, P('glow', 6)); set(cx - a, gy - 4 + a, P('glow', 6)); }
      else if (kind === 1) for (let a = -3; a <= 3; a++) { set(cx + a, gy, P('glow', 6)); set(cx + a, gy + 4, P('glow', 5.5)); }
      else for (let a = 0; a <= 4; a++) { set(cx + a, gy + a - 4, P('glow', 6)); set(cx + a, gy + 4 - a, P('glow', 6)); }
    }
  }
  for (let x = 12; x <= 52; x++) for (let y = 60; y <= 63; y++) if (t.data[y * TEX + x] === 255) set(x, y, P('glow', 2.4 + hash(x, y, seed + 5) * 0.8)); // Schein am Boden
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
// Glättet ein 64er-Sprite auf S-fache Auflösung: Silhouette über bilineare Deckkraft (runde Kanten statt Treppen),
// Helligkeit je Material bilinear gemischt (weiche Verläufe statt Blöcken). Nur für den Modus „Scharf“.
function smoothSprite(t, S = 4) {
  const n = t.w, o = n * S, src = t.data, out = new Uint8Array(o * o).fill(255);
  for (let oy = 0; oy < o; oy++) for (let ox = 0; ox < o; ox++) {
    const u = (ox + 0.5) / S - 0.5, v = (oy + 0.5) / S - 0.5, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    let alpha = 0, best = -1, bw = 0;
    const px = [], ws = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const xx = Math.max(0, Math.min(n - 1, x0 + i)), yy = Math.max(0, Math.min(n - 1, y0 + j)), p = src[yy * n + xx], w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      px.push(p); ws.push(w);
      if (p !== 255) { alpha += w; if (w > bw) { bw = w; best = p; } }
    }
    if (alpha < 0.5 || best < 0) continue;
    const mat = best >> 3; let sh = 0, wt = 0;
    for (let q = 0; q < 4; q++) if (px[q] !== 255 && (px[q] >> 3) === mat) { sh += (px[q] & 7) * ws[q]; wt += ws[q]; }
    out[oy * o + ox] = (mat << 3) | Math.max(0, Math.min(7, Math.round(sh / wt)));
  }
  return { w: o, h: o, data: out, noWrap: true };
}
// Geheimwand und versteckter Schalter: Abwandlungen der Steinmauer (feiner Riss · lockerer Stein · eingedrückter Stein)
function shadeBy(t, i, d) { const v = t.data[i]; t.data[i] = (v & ~7) | Math.max(0, Math.min(7, (v & 7) + d)); }
function genSecretWall(base, seed) {
  const t = { w: base.w, h: base.h, data: base.data.slice() }, n = t.w, th = Math.max(1, n >> 7);
  let x = n * 0.5;
  for (let y = 0; y < n; y++) { // eine Haarlinie von oben nach unten, leicht gezackt
    if (y % Math.max(2, n >> 4) === 0) x += (hash(y, 3, seed) - 0.5) * n * 0.05;
    for (let k = 0; k < th; k++) shadeBy(t, y * n + ((Math.round(x) + k) & (n - 1)), -2);
  }
  return t;
}
function genSwitchWall(base, pressed) {
  const t = { w: base.w, h: base.h, data: base.data.slice() }, n = t.w, x0 = Math.round(n * 0.4), x1 = Math.round(n * 0.62), y0 = Math.round(n * 0.56), y1 = Math.round(n * 0.7), b = Math.max(1, n >> 6);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const edge = x - x0 < b || x1 - x < b || y - y0 < b || y1 - y < b;
    shadeBy(t, y * n + x, pressed ? (edge ? -3 : -2) : (edge ? (y - y0 < b || x - x0 < b ? 1 : -2) : 1)); // locker: steht leicht vor (hell oben/links, Schatten unten/rechts)
  }
  return t;
}
export function makeTextures(detail = 1) {
  const up = (t, s) => (detail > 1 ? upsample2(t, s) : t);
  const spr = (t, s) => { t.noWrap = true; return up(t, s); };
  const sm2 = (t) => { t.noWrap = true; return detail > 1 ? smoothSprite(t, 2) : t; }; // große Bosse (160/192 px): 2× weich
  const sm = (t) => { t.noWrap = true; return detail > 1 ? smoothSprite(t, 4) : t; }; // Monster und Händler: im Modus Scharf geglättet
  const n = TEX * (detail > 1 ? 4 : 1), nf = TEX * (detail > 1 ? 2 : 1); // Wände 256, Boden/Decke 128: Eigenauflösung statt hochskaliert (Potenzen von 2 wegen Maskierung)
  const stoneW = genStone(11, n);
  return {
    wall: { [WALL_STONE]: stoneW, [WALL_SECRET]: genSecretWall(stoneW, 301), [WALL_SWITCH]: genSwitchWall(stoneW, false), [WALL_SWITCH_ON]: genSwitchWall(stoneW, true), [WALL_MOSS]: genMoss(23, n), [WALL_DOOR]: up(genDoor(31, false), 103), [WALL_DOOR_LOCKED]: up(genDoor(31, true), 104), [WALL_TORCH]: genTorch(11, n), [WALL_ROCK]: genRock(17, n), [WALL_GATE]: genGate(29, n), [WALL_LICHEN]: genRock(19, n, true) },
    floor: genFloor(41, nf),
    ceil: genCeil(53, nf),
    sprites: { chest: spr(genChest(false, 61), 107), chestOpen: spr(genChest(true, 61), 108), schrat: sm2(genSchrat(71)), portal: spr(genPortal(81), 109), merchant: sm2(genMerchant(91)), wisp: sm(genWisp(121)), skeleton: sm(genSkeleton(171)), guard: sm(genGuard(181, false)), captain: sm(genGuard(191, true)), kaefer: sm(genKaefer(201)), geist: sm2(genRobed(241, 'geist')), priester: sm2(genRobed(251, 'priester')), hueter: sm2(genRobed(261, 'hueter')), moorschrat: sm2(genSchratBoss(221, 'moor')), grubenschrat: sm2(genSchratBoss(222, 'grube')), runeStone: spr(genRuneStone(231), 115), leverUp: genLever(false, 211), leverDown: genLever(true, 211), stairsDown: spr(genStairs('down', 141), 112), stairsUp: spr(genStairs('up', 151), 113), arch: spr(genArch(161), 114), sign: genSign(131) }
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
    this.bright = 1; // Helligkeit: 1 = original dunkel, >1 hellere Umgebung (weniger Nebel, Mindesthelligkeit)
    this.planeLen = 0.8;
    this.focal = (W / 2) / this.planeLen;
    this.setPalette(paletteDef);
  }
  setPalette(def) {
    if (def) this.palDef = def; else def = this.palDef;
    const bt = this.bright || 1, minS = bt >= 1.8 ? 2 : bt >= 1.35 ? 1 : 0;
    this.pal = buildPalette(def, bt);
    this.shadeTbl = [];
    for (let d = 0; d < 8; d++) {
      const t = new Uint32Array(64);
      for (let i = 0; i < 64; i++) t[i] = (i >> 3) === M.glow && d < 7 ? this.pal[(i & ~7) | Math.max(2, (i & 7) - (d >> 1))] : this.pal[(i & ~7) | Math.max(Math.min(i & 7, minS), (i & 7) - d)];
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
    const fogK = 0.85 / (this.bright || 1);
    const dropFor = (dist) => Math.min(7, Math.floor(dist * fogK / fl));

    // Decke und Boden. Horizont verschiebbar (view.horizon in Pixeln; Standard H/2): kleiner = Blick nach unten, größer = Blick nach oben
    const half = Math.max(1, Math.min(H - 1, Math.round(view.horizon == null ? H / 2 : view.horizon)));
    if (q === 'low') {
      for (let y = 0; y < H; y++) {
        const fl0 = y >= half, p = fl0 ? y + 0.5 - half : half - y - 0.5;
        const tbl = this.shadeTbl[dropFor(0.5 * focal / p)];
        const c = fl0 ? tbl[P('floor', 3)] : tbl[P('ceil', 2)];
        const row = y * W;
        for (let x = 0; x < W; x++) buf[row + x] = c;
      }
    } else {
      const ftex = tex.floor.data, ctex = tex.ceil.data, FN = tex.floor.w, FM = FN - 1;
      const rdx0 = dirX - planeX, rdy0 = dirY - planeY, rdx1 = dirX + planeX, rdy1 = dirY + planeY;
      for (let y = 0; y < H; y++) {
        const fl0 = y >= half, p = fl0 ? y + 0.5 - half : half - y - 0.5;
        const rowDist = 0.5 * focal / p;
        const tbl = this.shadeTbl[dropFor(rowDist)];
        const src = fl0 ? ftex : ctex;
        let fx = px + rowDist * rdx0, fy = py + rowDist * rdy0;
        const sx = rowDist * (rdx1 - rdx0) / W, sy = rowDist * (rdy1 - rdy0) / W;
        const row = y * W;
        for (let x = 0; x < W; x++) {
          const tx = ((fx * FN) | 0) & FM, ty = ((fy * FN) | 0) & FM;
          buf[row + x] = tbl[src[ty * FN + tx]];
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
  for (const o of objs) { if (o.type === 'secret' && !o.open) grid[o.y * w + o.x] = WALL_SECRET; else if (o.type === 'lever' && o.wall) grid[o.y * w + o.x] = o.used ? WALL_SWITCH_ON : WALL_SWITCH; }
  return { grid, gw: w, gh: h };
}
const spriteFor = (tex, k) => (k === 'moorlicht' ? tex.sprites.wisp : k === 'skeleton' ? tex.sprites.skeleton : k === 'kultwaechter' || k === 'turmwache' ? tex.sprites.guard : k === 'hauptmann' ? tex.sprites.captain : k === 'erzkaefer' ? tex.sprites.kaefer : k === 'nebelgeist' ? tex.sprites.geist : k === 'kultpriester' ? tex.sprites.priester : k === 'nebelhueter' ? tex.sprites.hueter : k === 'schrat' ? tex.sprites.moorschrat : k === 'grubenschrat' ? tex.sprites.grubenschrat : tex.sprites.schrat);
const bossScale = (k) => (k === 'schrat' || k === 'grubenschrat' || k === 'nebelhueter' ? 1.2 : k === 'hauptmann' ? 1 : 0.9); // Bosse stehen größer im Gang
export const GROUP_SCALE = 0.78, GROUP_GAP = 0.44, CHEST_SCALE = 0.62; // 0.16.4: Gruppen vorher 0.62/0.36, Truhe 0.5 (Nutzer: zu klein, hinter der Leiste)
export const spriteScale = (k, n) => (n > 1 ? GROUP_SCALE : bossScale(k));
// Aufstellung einer Gruppe (0.16.4b): lat = seitlich (rechts +), dep = Tiefe (vom Betrachter weg). Im engen Gang (links und rechts Wand)
// stehen die Gegner gestaffelt hintereinander statt nebeneinander, sonst ragen sie in die Wände (Nutzer-Screenshot 0.16.4).
export function groupOffsets(n, narrow) {
  if (n <= 1) return [{ lat: 0, dep: 0 }];
  if (!narrow) return Array.from({ length: n }, (_, i) => ({ lat: (i - (n - 1) / 2) * GROUP_GAP, dep: 0 }));
  if (n === 2) return [{ lat: -0.12, dep: 0 }, { lat: 0.18, dep: 0.42 }];
  return [{ lat: 0, dep: 0 }, { lat: -0.22, dep: 0.42 }, { lat: 0.22, dep: 0.42 }];
}
// Eng = beide Nachbarfelder quer zur Blickrichtung sind Wand (grid aus buildGrid: 0 = frei)
export function isNarrowAt(g, x, y, angle) {
  if (!g) return false;
  const rx = Math.round(Math.cos(angle)), ry = Math.round(Math.sin(angle));
  const wall = (cx, cy) => cx < 0 || cy < 0 || cx >= g.gw || cy >= g.gh || g.grid[cy * g.gw + cx] !== 0;
  return wall(x + rx, y + ry) && wall(x - rx, y - ry);
}
const kindOf = (o, i) => (Array.isArray(o.kinds) ? o.kinds[Math.min(i, o.kinds.length - 1)] : o.kind);
function signTex(tex, o) { // ein Schild-Sprite je Titel, einmal erzeugt
  const key = o.title || '';
  const c = tex.signs || (tex.signs = {});
  return c[key] || (c[key] = key ? (() => { const t = genSign(131, key); t.noWrap = true; return smoothSprite(t, 4); })() : tex.sprites.sign);
}
export function buildSprites(objs, tex, time, angle = 0, alive = null, grid = null) { // alive: {objId: Arten (Liste) oder Anzahl der lebenden Gegner} im Kampf; grid: für enge Gänge
  const out = [];
  const rx = Math.cos(angle), ry = Math.sin(angle); // „rechts“ aus Sicht der Kamera
  const fx = Math.sin(angle), fy = -Math.cos(angle); // „vorn“
  for (const o of objs) {
    if (o.type === 'chest') out.push({ x: o.x, y: o.y, tex: o.open ? tex.sprites.chestOpen : tex.sprites.chest, scale: CHEST_SCALE });
    else if (o.type === 'enemy' && !o.dead) {
      const tot = Array.isArray(o.kinds) ? Math.min(3, o.kinds.length) : 1;
      const av = alive && alive[o.id] != null ? alive[o.id] : null, kindList = Array.isArray(av) ? av : null;
      const n = kindList ? kindList.length : av != null ? av : tot; // Gruppe: eine Gestalt je lebendem Gegner, nebeneinander
      const offs = groupOffsets(n, n > 1 && isNarrowAt(grid, o.x, o.y, angle));
      for (let i = 0; i < n; i++) {
        const { lat, dep } = offs[i];
        out.push({ x: o.x + rx * lat + fx * dep, y: o.y + ry * lat + fy * dep, tex: spriteFor(tex, kindList ? kindList[i] : kindOf(o, i)), scale: spriteScale(kindList ? kindList[i] : kindOf(o, i), n) * (1 + 0.02 * Math.sin(time * 3 + i)) });
      }
    }
    else if (o.type === 'lever' && !o.wall) out.push({ x: o.x, y: o.y, tex: o.used ? tex.sprites.leverDown : tex.sprites.leverUp, scale: 0.75 });
    else if (o.type === 'sign') out.push({ x: o.x, y: o.y, tex: signTex(tex, o), scale: 0.7 });
    else if (o.type === 'runestone') out.push({ x: o.x, y: o.y, tex: tex.sprites.runeStone, scale: 0.9 });
    else if (o.type === 'merchant') out.push({ x: o.x, y: o.y, tex: tex.sprites.merchant, scale: 0.8 });
    else if (o.type === 'stairs') out.push({ x: o.x, y: o.y, tex: o.look === 'down' ? tex.sprites.stairsDown : o.look === 'up' ? tex.sprites.stairsUp : o.look === 'path' ? tex.sprites.arch : tex.sprites.portal, scale: 0.9 });
    else if (o.type === 'exit') out.push({ x: o.x, y: o.y, tex: o.look === 'down' ? tex.sprites.stairsDown : o.look === 'up' ? tex.sprites.stairsUp : o.look === 'path' ? tex.sprites.arch : tex.sprites.runeStone, scale: 0.9 });
  }
  return out;
}

// ---------- Prozedurale Heldenporträts (32×32, nur im Browser genutzt) ----------
const SKIN = ['#e0b48c', '#c98f66', '#f0c8a0', '#a8714c'];
const ORK_SKIN = ['#7f9a5a', '#6f8a4e'];
const hx = (c) => c;
// role = Berufsname (Krieger, Schurke, Kleriker, Magier, Waldläufer), race = Rassen-Schlüssel (optional, z. B. 'elf')
export function drawPortrait(ctx, role, seed, race) {
  const skin = race === 'ork' ? ORK_SKIN[Math.abs(seed) % ORK_SKIN.length] : SKIN[Math.abs(seed) % SKIN.length];
  const px = (x, y, w, h, c) => { ctx.fillStyle = hx(c); ctx.fillRect(x, y, w, h); };
  px(0, 0, 32, 32, '#1b1712');
  px(0, 24, 32, 8, role === 'Krieger' ? '#6b7280' : role === 'Schurke' ? '#2f4a33' : (role === 'Priester' || role === 'Kleriker') ? '#e8e2d0' : role === 'Waldläufer' ? '#6b5532' : '#2c3e7a');
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
  else if ((role === 'Priester' || role === 'Kleriker')) { px(9, 5, 14, 5, '#e8e2d0'); px(14, 1, 4, 5, '#d9b44a'); px(15, 2, 2, 3, '#e8e2d0'); }
  else if (role === 'Waldläufer') { px(8, 5, 16, 6, '#6b5532'); px(6, 10, 20, 2, '#6b5532'); px(21, 1, 2, 7, '#b7d17a'); px(7, 12, 2, 8, '#6b5532'); px(23, 12, 2, 8, '#6b5532'); }
  else { for (let i = 0; i < 12; i++) px(16 - Math.round(i * 0.55), 1 + i, Math.round(1 + i * 1.1), 1, '#2c3e7a'); px(6, 12, 20, 2, '#2c3e7a'); px(14, 6, 4, 2, '#d9b44a'); }
}
