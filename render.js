// Die Schatten von Eldermoor – Raycasting-Renderer und prozedurale Grafik
// Autor: eldermoor-dev
// Der Renderer arbeitet auf einem eigenen Pixelpuffer (Uint32Array) und kennt weder DOM noch Canvas.
// Dadurch ist er in Node testbar und später austauschbar.

export const BASE_W = 480, BASE_H = 270, TEX = 64; // Grundauflösung (Retro) und Texturgröße der Generatoren
// Aktuelle Bildgröße: 480×270 (Retro) oder ein Vielfaches davon (Scharf = 2×). Live-Bindung: Änderung über setResolution().
export let W = BASE_W, H = BASE_H;
export function setResolution(r) { W = BASE_W * r; H = BASE_H * r; }
const MATS = ['stone', 'moss', 'wood', 'iron', 'floor', 'ceil', 'flesh', 'glow', 'blood', 'ice']; // 0.19.14: 10. Material „ice“ (blaue Augen des Hauptmanns); 0.19.8: 9. Material „blood“ (Schriftzüge); Paletten ohne Eintrag nutzen BLOOD_DEFAULT
const M = { stone: 0, moss: 1, wood: 2, iron: 3, floor: 4, ceil: 5, flesh: 6, glow: 7, blood: 8, ice: 9 };
const PAL_N = MATS.length * 8, BLOOD_DEFAULT = [206, 38, 32], ICE_DEFAULT = [96, 176, 255];
const P = (mat, shade) => M[mat] * 8 + Math.max(0, Math.min(7, Math.round(shade)));

// Wandtextur-IDs im Raster: 0 = frei, 1 Stein, 2 Moos, 3 Tür, 4 verschlossene Tür
export const WALL_STONE = 1, WALL_MOSS = 2, WALL_DOOR = 3, WALL_DOOR_LOCKED = 4, WALL_TORCH = 5, WALL_ROCK = 6, WALL_LICHEN = 7, WALL_GATE = 8, WALL_SECRET = 9, WALL_SWITCH = 10, WALL_SWITCH_ON = 11;

// ---------- Palette: 8 Materialien × 8 Helligkeitsstufen = 64 feste Farben ----------
export function buildPalette(def, lift = 1) {
  const pal = new Uint32Array(PAL_N);
  MATS.forEach((m, mi) => {
    const c = def[m] || (m === 'blood' ? BLOOD_DEFAULT : m === 'ice' ? ICE_DEFAULT : [128, 128, 128]);
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
function genWisp(seed) { // Moorlicht (0.16.16, 128 px, ohne Umriss): lodernde Flamme mit schreiendem Geistergesicht, Greifarmen mit Krallen, wehendem Schweif und Funken
  const sparks = Array.from({ length: 16 }, (_, i) => { const a = hash(i, 1, seed) * 6.283, r = 17 + hash(i, 2, seed) * 11; return { x: 32 + Math.cos(a) * r * 1.05, y: 30 + Math.sin(a) * r * 0.9 - 2, r: 0.5 + hash(i, 3, seed) * 0.7 }; });
  return paintFigure(seed, ({ ell, cap, nz, px, py, x, y, vn }) => {
    const dx = px - 32, dy = py - 29, n = nz(x, y);
    // Gesicht (liegt vorn)
    if (ell(px, py, 29.8, 27.6, 0.8, 0.8) <= 1 || ell(px, py, 34.2, 27.6, 0.8, 0.8) <= 1) return ['glow', 7];
    if (cap(px, py, 26.8, 25.8, 31, 28.3, 1.9, 1.1) || cap(px, py, 37.2, 25.8, 33, 28.3, 1.9, 1.1)) return ['ceil', 0];
    if (cap(px, py, 25, 22.4, 30.8, 25, 0.7, 0.9) || cap(px, py, 39, 22.4, 33.2, 25, 0.7, 0.9)) return ['ceil', 0];
    if (ell(px, py, 32, 35.2, 3.3, 5) <= 1) { for (let i = 0; i < 4; i++) if (cap(px, py, 29.6 + i * 1.6, 30.6, 29.6 + i * 1.6, 32.6, 0.55, 0.1)) return ['flesh', 7]; return ['ceil', 0]; }
    // Funken
    for (const sp of sparks) if (Math.hypot(px - sp.x, py - sp.y) <= sp.r) return ['flesh', 6.4];
    // Greifarme links und rechts: wellige Schwaden mit Krallenfingern
    for (const sg of [-1, 1]) {
      const wob = Math.sin(py * 0.35 + seed + sg) * 1.6;
      if (cap(px, py, 32 + sg * 9, 33, 32 + sg * 18 + wob, 42, 3.3, 1.9) || cap(px, py, 32 + sg * 18 + wob, 42, 32 + sg * 21.4, 53, 1.9, 1.1)) return ['flesh', 3.4 + n * 0.9 + (px > 0 ? 0 : 0)];
      for (let f = 0; f < 3; f++) if (cap(px, py, 32 + sg * 21.4, 53, 32 + sg * (22.4 + f * 1.9), 58.6 + (f === 1 ? 1.6 : 0), 0.9, 0.12)) return ['flesh', 5.4];
    }
    // Flammenkörper: unruhiger Rand, nach oben in Zungen verlängert
    const ang = Math.atan2(dy, dx), up = Math.max(0, -Math.sin(ang));
    const R = 10.2 + 3.6 * vn(Math.cos(ang) * 2.6 + 3, Math.sin(ang) * 2.6 + seed, 2) + up * (9 + 9 * Math.abs(Math.sin(ang * 5 + seed * 0.3)) ** 1.3);
    const rr = Math.hypot(dx * 1.22, dy);
    // Schweif nach unten (Tropfen, wellig)
    const tail = py > 36 && py < 61 && Math.abs(dx - Math.sin(py * 0.3 + seed) * 2.2) < (61 - py) * 0.33 * (1 + (py - 36) * 0.02 * 0) + 0.2;
    if (rr < R || tail) { const t = Math.min(1, rr / R), b = tail && rr >= R ? 4.2 - (py - 36) * 0.09 : 7 - t * 4.6; return ['flesh', Math.max(1.2, b + (n - 0.5) * 1.1)]; }
    return null;
  }, 128, false);
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

// ---------- 0.16.8/0.16.11: Wandtafeln, Türschilder (Abziehbild auf der Wandfläche) und Rahmen offener Türen ----------
// Schilder werden in 192×192 (3× Grundtextur) ohne Weichzeichnen gemalt: scharfe Schrift. Stile: Form, Material, Schriftfarbe, Schriftart.
const PLQ = 192;
export const PLAQUE_STYLES = {
  wood: { shape: 'rect', mat: 'wood', sh: 5.4, edge: 1.4, ink: ['wood', 0.2], font: 'block', nails: true },
  dark: { shape: 'rect', mat: 'wood', sh: 2.4, edge: 0.6, ink: ['glow', 6.3], font: 'bold', nails: true, gild: true },
  stone: { shape: 'slab', mat: 'stone', sh: 4.8, edge: 2.2, ink: ['stone', 0.6], font: 'wide' },
  iron: { shape: 'rect', mat: 'iron', sh: 3.8, edge: 1.4, ink: ['glow', 6], font: 'block', rivets: true },
  moss: { shape: 'rect', mat: 'wood', sh: 4.0, edge: 1.2, ink: ['wood', 0.2], font: 'slant', moss: true },
  arrow: { shape: 'arrow', mat: 'wood', sh: 5.0, edge: 1.4, ink: ['wood', 0.2], font: 'bold', nails: true },
  arch: { shape: 'arch', mat: 'stone', sh: 4.2, edge: 1.8, ink: ['stone', 0.4], font: 'shadow' },
  banner: { shape: 'banner', mat: 'moss', sh: 3.4, edge: 1.2, ink: ['glow', 6.4], font: 'bold' },
  small: { shape: 'rect', mat: 'wood', sh: 4.6, edge: 1.2, ink: ['wood', 0.2], font: 'block', scale: 2, nails: true }
};
const STYLE_ORDER = Object.keys(PLAQUE_STYLES);
function styleFor(o) { // Daten: o.style; sonst fester Wert aus der Objekt-ID
  if (o.style && PLAQUE_STYLES[o.style]) return o.style;
  let h = 0; for (const ch of String(o.id || o.title || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STYLE_ORDER[h % STYLE_ORDER.length];
}
const titleLines = (title) => Math.max(1, String(title || '').split('|').slice(0, 2).filter(Boolean).length);
export function plaqueMetrics(title, kind, st) {
  const lines = String(title || '').toUpperCase().split('|').slice(0, 2).filter(Boolean);
  const cw = st.font === 'wide' ? 8 : 6;
  const maxC = Math.max(1, ...lines.map((l) => [...l].slice(0, 8).length));
  // 0.16.14: einzeilige Titel bis Faktor 4 (größere Buchstaben), zweizeilige wie bisher
  let s = st.scale || Math.min(lines.length > 1 ? 3 : 4, Math.floor(150 / (cw * maxC)));
  if (kind === 'door') s = Math.min(s, lines.length > 1 ? 2 : 4);
  s = Math.max(2, s);
  const dims = (k) => {
    const padX = 5 * k + (st.shape === 'arrow' ? 5 * k : 0) + (st.shape === 'arch' ? 2 * k : 0), padT = 3 * k + (st.shape === 'arch' ? 5 * k : 0), padB = 3 * k + (st.shape === 'banner' ? 7 * k : 0);
    const textW = maxC * cw * k - k;
    return { padX, padT, padB, textW, w: textW + 2 * padX };
  };
  while (s > 2 && dims(s).w > 176) s--; // Tafel darf nicht breiter als 176 werden (Text sonst am Rand abgeschnitten)
  const { padX, padT, padB, textW } = dims(s);
  const w = Math.min(176, textW + 2 * padX), h = lines.length * 9 * s - 2 * s + padT + padB;
  return { lines, cw, s, w, h, padT, padX };
}
// malt Tafel + Schrift in buf (N×N, 255 = durchsichtig). kind 'wall': Tafel auf Augenhöhe, 'door': Schild ganz oben.
function paintPlaque(buf, N, title, kind, styleName, seed) {
  const st = PLAQUE_STYLES[styleName] || PLAQUE_STYLES.wood, m = plaqueMetrics(title, kind, st), { s } = m;
  const set = (x, y, v) => { if (x >= 0 && x < N && y >= 0 && y < N) buf[y * N + x] = v; };
  const x0 = Math.round((N - m.w) / 2), y0 = kind === 'door' ? 6 : Math.round(N / 2 - m.h / 2), x1 = x0 + m.w - 1, y1 = y0 + m.h - 1, cx = (x0 + x1) / 2;
  const bt = Math.max(3, s), tipW = st.shape === 'arrow' ? 5 * s : 0, bodyR = x1 - tipW, cy = (y0 + y1) / 2, nd = st.shape === 'banner' ? 7 * s : 0;
  const rad = Math.min(m.w, m.h) * 0.42;
  const inside = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    if (st.shape === 'slab') { const nt = Math.floor(hash(x >> 3, 1, seed) * 4), nb = Math.floor(hash(x >> 3, 2, seed) * 4); if (y < y0 + nt || y > y1 - nb) return false; const c = 7; if ((x - x0) + (y - y0) < c || (x1 - x) + (y - y0) < c || (x - x0) + (y1 - y) < c || (x1 - x) + (y1 - y) < c) return false; }
    if (st.shape === 'arrow' && x > bodyR) return Math.abs(y - cy) <= (m.h / 2) * (1 - (x - bodyR) / tipW);
    if (st.shape === 'arch') { const r = rad; if (y < y0 + r && x < x0 + r && Math.hypot(x - (x0 + r), y - (y0 + r)) > r) return false; if (y < y0 + r && x > x1 - r && Math.hypot(x - (x1 - r), y - (y0 + r)) > r) return false; }
    if (st.shape === 'banner' && y > y1 - nd * (1 - Math.abs(x - cx) / (m.w / 2))) return false;
    return true;
  };
  const isEdge = (x, y) => !inside(x - bt, y) || !inside(x + bt, y) || !inside(x, y - bt) || !inside(x, y + bt);
  const mark = new Uint8Array(N * N);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y)) continue;
    mark[y * N + x] = 1;
    let v;
    if (isEdge(x, y)) v = P(st.mat, st.edge + hash(x >> 1, y >> 1, seed + 5) * 0.5);
    else {
      const grain = st.mat === 'wood' ? hash(x >> 4, y, seed) * 0.5 + hash(x >> 2, y >> 2, seed + 1) * 0.4 : hash(x >> 2, y >> 2, seed + 1) * 0.9;
      v = P(st.mat, st.sh + grain);
      if (st.moss && (hash(x >> 3, y >> 3, seed + 7) > 0.78 || (y - y0 < 3 * s && hash(x >> 2, 3, seed + 8) > 0.45))) v = P('moss', 3 + hash(x, y, seed + 9) * 1.5);
    }
    set(x, y, v);
  }
  if (st.gild) for (let y = y0 + bt + 2; y <= y1 - bt - 2; y++) for (let x = x0 + bt + 2; x <= x1 - bt - 2; x++) if (mark[y * N + x] && (y === y0 + bt + 2 || y === y1 - bt - 2 || x === x0 + bt + 2 || x === x1 - bt - 2)) set(x, y, P('glow', 3.4));
  const spots = [];
  if (st.nails) spots.push([x0 + bt + 2, y0 + bt + 2], [Math.min(x1 - bt - 2, bodyR - bt - 2), y0 + bt + 2], [x0 + bt + 2, y1 - bt - 2], [Math.min(x1 - bt - 2, bodyR - bt - 2), y1 - bt - 2]);
  if (st.rivets) for (const rx of [x0 + 2 * bt + 2, x1 - 2 * bt - 2, cx]) for (const ry of [y0 + bt + 2, y1 - bt - 2]) spots.push([Math.round(rx), ry]);
  for (const [nx, ny] of spots) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) set(nx + dx, ny + dy, P(st.rivets ? 'stone' : 'iron', dx + dy < 1 ? 6 : 4));
  if (kind !== 'door') for (let y = y0; y <= y1 + 3; y++) for (let x = x0; x <= x1 + 3; x++) if (!mark[y * N + x] && y > y0 + 2 && x > x0 + 2 && ((y > 2 && mark[(y - 3) * N + x]) || (x > 2 && mark[y * N + x - 3]))) if (buf[y * N + x] === 255) set(x, y, P('stone', 0));
  // Schrift
  const ink = P(st.ink[0], st.ink[1]), tcx = st.shape === 'arrow' ? (x0 + bodyR) / 2 : cx, ty0 = y0 + m.padT;
  m.lines.forEach((ln, li) => {
    const chars = [...ln].slice(0, 8), w = chars.length * m.cw * s - s, lx = Math.round(tcx - w / 2), ly = ty0 + li * 9 * s;
    chars.forEach((ch, ci) => {
      const g = (FONT[ch] || FONT[' ']).split('/'), gx = lx + ci * m.cw * s + (st.font === 'wide' ? s : 0);
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '1') continue;
        const sh = st.font === 'slant' ? Math.round((3 - r) * s * 0.4) : 0, ex = Math.max(1, s >> 1); // 0.16.14: alle Schriftarten dicker, damit die Striche aus der Ferne nicht wegbrechen
        const px = gx + c * s + sh, py = ly + r * s;
        if (st.font === 'shadow') for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) set(px + xx + 1 + (s >> 2), py + yy + 1 + (s >> 2), P(st.mat, st.sh + 2.2));
        for (let yy = 0; yy < s + ex; yy++) for (let xx = 0; xx < s + ex; xx++) set(px + xx, py + yy, ink);
      }
    });
  });
  return m;
}
// 0.16.17 (Nutzer: „Undeutlich, besser wieder nur Schriftzug, Schilder unnötig“): nur Schrift direkt auf Wand/Tür, ohne Tafel.
// Helle Buchstaben mit dunkler Kontur, damit sie auf Holz und Stein lesbar bleiben.
function genPlaque(title, kind, styleName, seed) {
  const N = PLQ, buf = new Uint8Array(N * N).fill(255);
  const lines = String(title || '').toUpperCase().split('|').slice(0, 2).filter(Boolean);
  const maxC = Math.max(1, ...lines.map((l) => [...l].slice(0, 8).length)), cw = 6;
  const s = Math.max(2, Math.min(3, Math.floor(168 / (cw * maxC)))); // 0.19.5: kleiner (vorher bis 5), Nutzer: „zu leuchtend groß“
  const ex = Math.max(1, s >> 2), lh = 9 * s, th = lines.length * lh - 2 * s;
  const ty0 = kind === 'door' ? 14 : Math.round(N / 2 - th / 2);
  // 0.19.11 (Nutzer: „gruseliger, nicht aus Druckschrift“): von Hand geschmiert – jeder Buchstabe leicht schief und versetzt, Striche aus runden Pinselflecken mit schwankender Dicke,
  // dicke Tropfen mit Kuppe, dunkle Gerinnsel und feuchte Lichter. Gleiche Lesbarkeit (gleiche Buchstabenraster), aber keine Blockschrift mehr.
  const mask = new Uint8Array(N * N);
  const stamp = (cx, cy, rad) => {
    const x0 = Math.floor(cx - rad - 1), x1 = Math.ceil(cx + rad + 1), y0 = Math.floor(cy - rad - 1), y1 = Math.ceil(cy + rad + 1);
    for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) if (X >= 0 && Y >= 0 && X < N && Y < N && (X + 0.5 - cx) ** 2 + (Y + 0.5 - cy) ** 2 <= rad * rad) mask[Y * N + X] = 1;
  };
  lines.forEach((ln, li) => {
    const chars = [...ln].slice(0, 8), w = chars.length * cw * s - s, lx = Math.round(N / 2 - w / 2), ly = ty0 + li * lh;
    chars.forEach((ch, ci) => {
      const g = (FONT[ch] || FONT[' ']).split('/');
      const gcx = lx + ci * cw * s + 2.5 * s, gcy = ly + 3.5 * s;
      const rot = (hash(ci, li, seed + 50) - 0.5) * 0.2, shear = (hash(ci, li, seed + 51) - 0.5) * 0.16, dy0 = (hash(ci, li, seed + 52) - 0.5) * s * 1.1, sc = 0.94 + hash(ci, li, seed + 53) * 0.2;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (let rw = 0; rw < 7; rw++) for (let c = 0; c < 5; c++) {
        if (g[rw][c] !== '1') continue;
        let ox = (c - 2) * s * sc, oy = (rw - 3) * s * sc;
        ox += shear * oy;
        const jx = (hash(c + ci * 7, rw, seed + 54) - 0.5) * s * 0.22, jy = (hash(c, rw + li * 9 + ci * 3, seed + 55) - 0.5) * s * 0.22;
        const cx = gcx + ox * cr - oy * sr + jx, cy = gcy + ox * sr + oy * cr + dy0 + jy + Math.sin(gcx * 0.3 + seed) * s * 0.3;
        stamp(cx, cy, s * (0.5 + hash(c + 3, rw + 5, seed + 56) * 0.2));
      }
    });
  });
  // Tropfen: dicke Streifen nach unten mit Kuppe am Ende
  const drip = new Uint8Array(N * N);
  for (let y = 0; y < N - 2; y++) for (let x = 0; x < N; x++) {
    if (!mask[y * N + x] || mask[(y + 1) * N + x] || hash(x, y, seed + 11) < 0.9) continue;
    const len = 4 + Math.floor(hash(x, y, seed + 12) * 16), wd = hash(x, y, seed + 13) > 0.55 ? 1 : 0;
    for (let k = 1; k <= len && y + k < N; k++) for (let d = 0; d <= wd; d++) { const X = x + d; if (X < N && !mask[(y + k) * N + X]) drip[(y + k) * N + X] = 1 + Math.min(2, Math.floor(k / (len / 3))); }
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1 + wd; xx++) { const X = x + xx, Y = y + len + 1 + yy; if (X >= 0 && X < N && Y >= 0 && Y < N && !mask[Y * N + X]) drip[Y * N + X] = 3; }
  }
  for (let i = 0; i < N * N; i++) if (drip[i]) mask[i] = 1;
  const ol = 1; // dunkle Kontur: hebt die rote Schrift von grauem Stein ab
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (mask[y * N + x]) continue;
    let near = false;
    for (let dy = -ol; dy <= ol && !near; dy++) for (let dx = -ol; dx <= ol; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && mask[Y * N + X]) { near = true; break; } }
    if (near) buf[y * N + x] = P('stone', 0);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!mask[y * N + x]) continue;
    const dv = drip[y * N + x], hh = hash(x, y, seed + 3);
    if (dv) { buf[y * N + x] = P('blood', dv === 3 ? 5.2 : 3.6 + dv * 0.5 + hh * 0.6); continue; }
    if (hh < 0.03) { buf[y * N + x] = P('stone', 1); continue; } // Abplatzer
    const up = y > 0 && x > 0 && !mask[(y - 1) * N + x - 1], clot = hash(x >> 1, y >> 1, seed + 20) > 0.86;
    buf[y * N + x] = P('blood', up ? 7 : clot ? 3.4 : 4.8 + hash(x >> 1, y >> 1, seed) * 1.8);
  }
  return { w: N, h: N, data: buf, noWrap: true };
}
// Rahmen einer offenen Tür (Sprite, 1×1 Feld): Pfosten, Sturz (mit Raumname), Türblatt nach innen aufgeklappt an der linken Seite.
function genDoorFrame(title, styleName, seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  const st = PLAQUE_STYLES[styleName] || PLAQUE_STYLES.wood;
  const lh = title ? Math.ceil((plaqueMetrics(title, 'door', st).h + 12) / 3) : 7; // Höhe des Sturzes
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const post = x <= 4 || x >= 59, lintel = y < lh;
    if (!post && !lintel) continue;
    const edge = (post && (x === 4 || x === 59)) || (lintel && y === lh - 1);
    set(x, y, P('wood', edge ? 1.2 : 2.8 + hash(x >> 1, y >> 3, seed) * 1.2));
  }
  for (let x = 5; x <= 17; x++) { // Türblatt: an der Angel (x=5) volle Höhe, zur freien Kante hin perspektivisch kürzer
    const k = (x - 5) / 12, top = Math.round(lh + k * 7), bot = Math.round(63 - k * 6);
    for (let y = top; y <= bot; y++) {
      const v01 = (y - top) / (bot - top);
      let v = P('wood', 3.6 - k * 1.4 + hash(x, y >> 3, seed + 2) * 0.9);
      if ((v01 > 0.12 && v01 < 0.2) || (v01 > 0.8 && v01 < 0.88)) v = P('iron', 3.4 - k);
      if (x === 17) v = P('wood', 5.2); // helle Vorderkante des Blatts
      if (y === top || y === bot) v = P('wood', 1.2);
      set(x, y, v);
    }
  }
  for (let y = 33; y <= 36; y++) set(15, y, P('iron', 6)); // Türring
  const hd = smoothSprite(t, 3); // 192×192
  if (title) {
    paintPlaque(hd.data, hd.w, title, 'door', styleName, seed + 1);
    // 0.19.13 (Nutzer: Schrift auf der Türschwelle wird gelb): Goldschrift der Tafel übermalen und dieselbe Blutschrift wie im Raum darüberlegen
    const inkV = P(st.ink[0], st.ink[1]), fill = P(st.mat, st.sh + 0.4);
    for (let i = 0; i < hd.data.length; i++) if (hd.data[i] === inkV) hd.data[i] = fill;
    const bt = genPlaque(title, 'door', styleName, 133);
    if (bt.w === hd.w) for (let i = 0; i < hd.data.length; i++) if (bt.data[i] !== 255) hd.data[i] = bt.data[i];
  }
  hd.noWrap = true;
  return hd;
}
function cachedTex(tex, bucket, key, make) {
  const c = tex[bucket] || (tex[bucket] = {});
  return c[key] || (c[key] = make());
}
// Abziehbilder für den Raycaster: Map (Zellindex*4 + Seite) → Textur. Seite: 0 = Nordseite der Wandzelle, 1 = Ost, 2 = Süd, 3 = West.
// Tafel (sign.face = Richtung vom Bodenfeld zur Wand) und Raumname auf geschlossenen Türen (door.title, beide Seiten des Durchgangs).
// Treppen/Ausgänge, die an einer Wand liegen (0.16.15): Bogen/Treppe sitzt IN der Wand (Abziehbild, richtige Perspektive) statt als frontales Bild davor.
// Liefert die Richtungen (0=N,1=O,2=S,3=W) vom Feld zu den angrenzenden Wänden; leer, wenn das Feld frei steht oder ein Durchgang zwischen zwei gegenüberliegenden Wänden ist (dort bleibt das Sprite mit Achse).
export function passFaces(wl, o) {
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const W = [0, 1, 2, 3].map((f) => wl(o.x + DX[f], o.y + DY[f]));
  if ((W[1] && W[3]) || (W[0] && W[2])) return [];
  const faces = [0, 1, 2, 3].filter((f) => W[f]);
  if (faces.length <= 1) return faces;
  // Ecke (0.16.17): nur EIN Bild – auf der Wand, auf die der längste freie Gang zuläuft (Nutzer: „4 Bögen??“ bei zwei Eck-Treppen)
  const run = (f) => { let n = 0; while (n < 40 && !wl(o.x - DX[f] * (n + 1), o.y - DY[f] * (n + 1))) n++; return n; };
  return [faces.reduce((a, b) => (run(b) > run(a) ? b : a))];
}
function passTex(tex, o) {
  if (o.type === 'stairs') return o.look === 'down' ? tex.sprites.stairsDown : o.look === 'up' ? tex.sprites.stairsUp : o.look === 'path' ? tex.sprites.arch : tex.sprites.portal;
  return o.look === 'down' ? tex.sprites.stairsDown : o.look === 'up' ? tex.sprites.stairsUp : o.look === 'path' ? tex.sprites.arch : tex.sprites.runeStone;
}
export function buildDecals(lvl, objs, tex) {
  const w = lvl.map[0].length, h = lvl.map.length, out = new Map();
  const wallAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h || lvl.map[y][x] !== '.';
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  for (const o of objs) {
    if (o.type === 'stairs' || o.type === 'exit') {
      for (const f of passFaces(wallAt, o)) { const wx = o.x + DX[f], wy = o.y + DY[f]; if (wx >= 0 && wy >= 0 && wx < w && wy < h) out.set((wy * w + wx) * 4 + (f + 2) % 4, passTex(tex, o)); }
      continue;
    }
    if (o.type === 'sign' && o.face != null && o.title) {
      const wx = o.x + DX[o.face], wy = o.y + DY[o.face];
      if (wallAt(wx, wy)) out.set((wy * w + wx) * 4 + (o.face + 2) % 4, cachedTex(tex, 'plaques', 'w:' + styleFor(o) + o.title, () => genPlaque(o.title, 'wall', styleFor(o), 131)));
    } else if (o.type === 'door' && !o.open && o.title) {
      const t = cachedTex(tex, 'plaques', 'd:' + styleFor(o) + o.title, () => genPlaque(o.title, 'door', styleFor(o), 133));
      const ns = wallAt(o.x - 1, o.y) && wallAt(o.x + 1, o.y); // Durchgang Nord–Süd
      for (const f of ns ? [0, 2] : [1, 3]) out.set((o.y * w + o.x) * 4 + f, t);
    }
  }
  return out;
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
  if (hueter) for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) { // 0.17.0: Thron hinter der Gestalt (Steinlehne mit Spitzbogen, Armlehnen, Stufen); nur auf freie Pixel, die Figur bleibt davor
    const i = y * SN + x;
    if (t.data[i] !== 255) continue;
    const px = (x + 0.5) * k, py = (y + 0.5) * k, ax = Math.abs(px - 32);
    const topY = 2.5 + ax * ax * 0.045 + (ax > 12 ? (ax - 12) * 1.2 : 0); // Spitzbogen-Lehne, außen abfallend
    const back = ax <= 15.5 && py >= topY && py <= 60;
    const arm = ax >= 12.5 && ax <= 19.5 && py >= 40 && py <= 56 && !(ax < 15.5 && py < 43);
    const step = py >= 58.5 && ax <= 23 - (py - 58.5) * 0.2;
    const spike = (Math.abs(ax - 9) < 1.2 && py >= topY - 3.2 && py < topY + 0.2) || (ax < 1.4 && py >= 0.4 && py < topY + 0.2);
    if (!(back || arm || step || spike)) continue;
    const edge = (back && (ax > 14 || py < topY + 1.4)) || (arm && (py < 41.6 || ax > 18)) || (step && py < 59.8);
    const inset = back && ax < 11 && py > topY + 4 && py < 52 && !edge;
    const v = edge ? 3.6 : inset ? 0.7 + hash(x >> 2, y >> 2, seed) * 0.4 : 1.7 + hash(x >> 1, y >> 1, seed + 3) * 0.7 + (px > 32 ? -0.3 : 0.2);
    t.data[i] = P('stone', v);
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

// Falle am Boden (0.18.0): 'faint' = feine Spur (drei dunkle Schlitze, leicht zu übersehen), 'seen' = entdeckt (rote Markierung + Warnzeichen), 'sprung' = ausgelöst (Speere ragen heraus)
function genTrap(mode, seed) {
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  if (mode === 'faint') {
    // 0.19.9 (Nutzer: „Ich erkenne Fallen erst nach Auslösung“): die Bodenspur war nur 1–2 Pixelreihen hoch, praktisch unsichtbar.
    // Jetzt eine leicht eingesunkene, rissige Platte mit Staub davor: auffällig genug, wer genau hinsieht, aber ohne Ausrufezeichen (das gibt es erst bei „entdeckt“).
    for (let y = 56; y <= 63; y++) for (let x = 10; x <= 54; x++) {
      const edge = x === 10 || x === 54 || y === 56;
      set(x, y, edge ? P('stone', 0.5) : P('stone', 2.1 + hash(x >> 1, y, seed) * 1.5));
    }
    for (const cx of [20, 32, 43]) { let x = cx + Math.floor(hash(cx, 5, seed) * 3) - 1; for (let y = 57; y <= 63; y++) { set(x, y, P('stone', 0.3)); if (hash(x, y, seed + 2) > 0.55) x += hash(y, x, seed + 3) > 0.5 ? 1 : -1; } }
    for (let x = 8; x <= 56; x++) for (let y = 53; y <= 55; y++) if (hash(x, y, seed + 7) > 0.88) set(x, y, P('stone', 4.4));
  } else if (mode === 'seen') {
    for (let x = 12; x <= 52; x++) for (let y = 58; y <= 63; y++) { const edge = x === 12 || x === 52 || y === 58 || y === 63; set(x, y, edge ? P('glow', 6.5) : (x + y) % 4 < 2 ? P('glow', 3.2) : P('stone', 0.6)); }
    for (let y = 30; y <= 50; y++) for (let x = 29; x <= 35; x++) { const w = 3 - Math.floor((y - 30) / 9); if (Math.abs(x - 32) <= Math.max(1, w) && y <= 45) set(x, y, P('glow', 7)); }
    for (let y = 49; y <= 53; y++) for (let x = 30; x <= 34; x++) set(x, y, P('glow', 7));
    for (let y = 28; y <= 55; y++) for (let x = 26; x <= 38; x++) if (t.data[y * TEX + x] === 255 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const v = t.data[(y + b) * TEX + x + a]; return v !== 255 && v !== P('stone', 0); })) set(x, y, P('stone', 0));
  } else {
    for (let x = 12; x <= 52; x++) set(x, 63, P('stone', 0.5));
    for (const cx of [18, 25, 32, 39, 46]) { const h = 16 + Math.floor(hash(cx, 3, seed) * 8); for (let y = 63 - h; y <= 62; y++) { const w = y < 63 - h + 4 ? 0 : 1; for (let x = cx - w; x <= cx + w; x++) set(x, y, P('iron', x < cx ? 5.5 : 3.2)); } }
  }
  t.noWrap = true;
  return t;
}
// Druckplatte (0.19.0): helle, deutlich sichtbare Steinplatte am Boden; belastet = eingesunken und dunkler
function genPlate(down, seed) {
  const t = mk(255);
  const y0 = down ? 60 : 57;
  for (let y = y0; y <= 63; y++) for (let x = 8; x <= 56; x++) {
    const edge = y === y0 || x === 8 || x === 56;
    t.data[y * TEX + x] = P('stone', edge ? (down ? 2.2 : 6.2) : (down ? 1.4 : 4.4) + hash(x >> 1, y, seed) * 0.8);
  }
  if (!down) for (let x = 8; x <= 56; x++) t.data[63 * TEX + x] = P('stone', 0.4);
  t.noWrap = true;
  return t;
}
// Beweglicher Stein: runder, zerfurchter Felsbrocken mit Licht von links oben
function genBoulder(seed) {
  const t = mk(255);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const dx = (x - 32) / 25, dy = (y - 40) / 23, a = Math.atan2(dy, dx);
    const rr = 1 + 0.07 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 7 + 1.3) - (dy > 0.75 ? (dy - 0.75) * 0.9 : 0);
    const d = Math.hypot(dx, dy);
    if (d > rr) continue;
    const light = 0.5 - dx * 0.35 - dy * 0.45, crack = Math.abs(Math.sin(x * 0.31 + y * 0.17 + seed) + Math.sin(y * 0.4 - x * 0.12)) < 0.12;
    let v = 2.2 + light * 3.4 + hash(x >> 1, y >> 1, seed) * 1.0 + hash(x >> 3, y >> 3, seed + 2) * 0.8;
    if (crack) v -= 1.6;
    if (d > rr - 0.08) v = 0.6;
    t.data[y * TEX + x] = P('stone', Math.max(0.2, Math.min(7, v)));
  }
  t.noWrap = true;
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

// ---------- 0.16.12: neue Kampffiguren (128×128, kontinuierlich abgetastet): Skelett, Kultwächter, Turmwache, Hauptmann, Wolf, Kultist ----------
function paintFigure(seed, build, SN = 128, outline = true) {
  const k = 64 / SN, t = { w: SN, h: SN, data: new Uint8Array(SN * SN).fill(255) };
  const ell = (px, py, cx, cy, rx, ry) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
  const cap = (px, py, ax, ay, bx, by, r0, r1) => { const vx = bx - ax, vy = by - ay, q = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(px - ax - vx * q, py - ay - vy * q) <= r0 + (r1 - r0) * q; };
  const lit = (px, py) => ((px - 32) * 0.9 + (py - 34) * 0.3) / 18; // Licht von links oben
  const nz = (x, y, s2 = 0) => hash(x, y, seed + s2);
  const lock = new Uint8Array(SN * SN); // 1 = kein Umriss (Leuchten)
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) {
    const px = (x + 0.5) * k, py = (y + 0.5) * k;
    const r = build({ ell, cap, lit, nz, px, py, x, y, vn: (a, b, c) => vnoise(a, b, c, seed) });
    if (!r) continue;
    t.data[y * SN + x] = P(r[0], r[1]);
    if (r[0] === 'glow') lock[y * SN + x] = 1;
  }
  const copy = t.data.slice();
  if (outline) for (let y = 1; y < SN - 1; y++) for (let x = 1; x < SN - 1; x++) { const i = y * SN + x; if (copy[i] !== 255 && !lock[i] && (copy[i - 1] === 255 || copy[i + 1] === 255 || copy[i - SN] === 255 || copy[i + SN] === 255)) t.data[i] = P(MATS[copy[i] >> 3], Math.max(0, (copy[i] & 7) - 2.6)); }
  t.noWrap = true;
  return t;
}

function genSkeleton(seed) { // Gruftskelett: Rosthelm, Rippen, rostiges Schwert, Rundschild, glühende Augen
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const dx = px - 32, l = lit(px, py), n = nz(x >> 1, y >> 1);
    const bone = (b) => ['stone', b - l * 1.3 + n * 0.8];
    // Augen und Gebiss zuerst (liegen oben auf)
    if (ell(px, py, 28.3, 13.4, 1.1, 1.4) <= 1 || ell(px, py, 35.7, 13.4, 1.1, 1.4) <= 1) return ['glow', 7];
    if (ell(px, py, 28.3, 13, 2.5, 3) <= 1 || ell(px, py, 35.7, 13, 2.5, 3) <= 1 || ell(px, py, 32, 16.8, 1, 1.7) <= 1) return ['ceil', 0];
    if (py > 19.2 && py < 21.8 && Math.abs(dx) < 4.6 && Math.floor(px * 1.7) % 2 === 0) return ['ceil', 0];
    if (ell(px, py, 32, 12, 8.6, 9) <= 1 && py < 11.4) return Math.abs(dx) < 1 && py > 10 ? ['iron', 4.5] : ['iron', 3.5 - l * 1.4 + n * 0.8];
    if (Math.abs(dx) < 0.9 && py >= 11 && py < 16.5 && ell(px, py, 32, 12, 8.6, 9) <= 1) return ['iron', 3.2];
    if (ell(px, py, 32, 12.6, 8, 8.4) <= 1 || ell(px, py, 32, 19.6, 5.4, 2.8) <= 1) return bone(6.2);
    // Schwert (rechts im Bild) mit Parierstange, Griff, Fehlstellen in der Klinge
    if (cap(px, py, 49.5, 43, 49.5, 5, 1.3, 0.5) && !(Math.abs(py - 20) < 0.6 && px > 50)) return ['iron', px > 49.5 ? 4.6 : 6.3];
    if (cap(px, py, 45.2, 43.5, 53.8, 43.5, 1.1, 1.1)) return ['iron', 3.4];
    if (cap(px, py, 49.5, 44, 49.5, 51, 0.95, 0.95)) return ['wood', 2];
    // rechter Arm (Schwertarm), linker Arm mit Schild
    if (cap(px, py, 43, 25.5, 48, 35, 1.6, 1.3) || cap(px, py, 48, 35, 49.5, 44, 1.3, 1.1)) return bone(4.2);
    const sd = ell(px, py, 13, 42, 6.8, 9.5);
    if (sd <= 1) return ell(px, py, 13, 42, 2, 2.6) <= 1 ? ['iron', 5.8] : sd > 0.68 ? ['iron', 2 + n * 0.6] : ['wood', 3.1 - l + n * 0.9 - (Math.abs(py - 42) < 0.5 ? 1.2 : 0)];
    if (cap(px, py, 21, 25.5, 16, 36, 1.6, 1.3) || cap(px, py, 16, 36, 14, 45, 1.3, 1.1)) return bone(4.2);
    // Rumpf: Wirbelsäule, Rippenbögen, Schultern, Becken, Lendenschurz, Beine
    if (cap(px, py, 21, 25.3, 43, 25.3, 1.8, 1.8)) return bone(5);
    if (cap(px, py, 32, 21, 32, 46, 1.4, 1.4)) return bone(4.4);
    for (let i = 0; i < 6; i++) { const w = 10.5 - i * 1.1, yy = 27.4 + i * 3.1 + (Math.abs(dx) / w) ** 2 * 2.2; if (Math.abs(dx) > 2 && Math.abs(dx) < w && Math.abs(py - yy) < 0.95) return bone(4.8 - i * 0.1); }
    if (ell(px, py, 32, 47.2, 7.4, 3.6) <= 1) return bone(4.3);
    const bot = 57 + Math.sin(px * 1.9 + seed) * 1.3;
    if (py > 45 && py < bot && Math.abs(dx) < 6 - (py - 45) * 0.06) return ['wood', 1.8 + n * 1.2 - l * 0.6];
    if (cap(px, py, 28, 49, 26.5, 61.5, 1.9, 1.5) || cap(px, py, 36, 49, 37.5, 61.5, 1.9, 1.5) || ell(px, py, 25.6, 62.4, 3.4, 1.3) <= 1 || ell(px, py, 38.4, 62.4, 3.4, 1.3) <= 1) return bone(4);
    return null;
  });
}

// Kultwächter, Turmwache und Hauptmann: gepanzerte Kultkrieger. v: 'wacht' (Hellebarde, kleine Hörner) · 'turm' (Turmschild, Speer, Wangenplatten) · 'haupt' (Umhang, Zweihänder, große Hörner, Siegel)
function genGuard(seed, v = 'wacht') {
  const haupt = v === 'haupt', turm = v === 'turm', arm = turm ? 5 : haupt ? 3.2 : 3.6;
  const body = ({ ell, cap, lit, nz, px, py, x, y }) => {
    const dx = px - 32, l = lit(px, py), n = nz(x >> 1, y >> 1);
    const A = (b) => ['iron', b + (arm - 3.6) - l * 1.5 + n * 0.7];
    // 0.19.11 (Nutzer: Siegel-Boss soll gefährlicher aussehen): größere Glutaugen, Dornenkrone, dickere Hörner, Schulterdornen, Ketten, Siegel auf der Klinge, zerfetzter Umhang, Blutspuren
    if (haupt && (ell(px, py, 28.6, 13.6, 1.9, 1.4) <= 1 || ell(px, py, 35.4, 13.6, 1.9, 1.4) <= 1)) return ['ice', 7]; // 0.19.14: blaue Augen (Nutzer: im Bild ist schon genug gelb, rot ebenfalls abgelehnt)
    if (!haupt && (ell(px, py, 28.8, 13.8, 1.2, 1) <= 1 || ell(px, py, 35.2, 13.8, 1.2, 1) <= 1)) return ['glow', 7];
    if (Math.abs(dx) <= 6.4 && py >= 12.3 && py <= 15.2 && ell(px, py, 32, 13, 8.6, 9.8) <= 1) return ['ceil', 0];
    // Hörner und Helmzier
    if (haupt && (cap(px, py, 24.4, 9, 17.6, 0.8, 2.7, 0.5) || cap(px, py, 39.6, 9, 46.4, 0.8, 2.7, 0.5))) return ['stone', 6.2 - l * 0.8];
    if (haupt) for (let i = 0; i < 5; i++) { const sx = 27.2 + i * 2.4; if (cap(px, py, sx, 4.2, sx + (i - 2) * 0.7, 0.2, 0.95, 0.12)) return ['iron', 6.6 - l]; } // Dornenkrone
    if (v === 'wacht' && (cap(px, py, 25, 8.5, 22, 3, 1.5, 0.4) || cap(px, py, 39, 8.5, 42, 3, 1.5, 0.4))) return ['stone', 6 - l * 0.8];
    if (cap(px, py, 32, 2.5, 32, 8, 1.2, 2.4) && !turm) return A(5.6);
    if (turm && ell(px, py, 32, 4, 2.6, 5.5) <= 1) return ['glow', 4.2 + n];
    if (ell(px, py, 32, 13.2, 8.6, 9.8) <= 1) return A(4.4 + (turm && Math.abs(dx) > 6.5 ? -0.6 : 0));
    // Waffe
    if (haupt) {
      // 0.19.13 (Nutzer: „Schwert unten zu groß, Totenkopf unten am Griff in einem Kreis“): kleineres Schwert, Totenschädel im Siegelkreis am Knauf
      const pr = Math.hypot(px - 50.5, py - 51);
      if (ell(px, py, 49.5, 50.4, 0.7, 0.8) <= 1 || ell(px, py, 51.5, 50.4, 0.7, 0.8) <= 1 || (Math.abs(px - 50.5) < 0.4 && py > 51.6 && py < 52.5)) return ['ceil', 0]; // Augenhöhlen, Nase
      if (ell(px, py, 50.5, 50.6, 2.5, 2.6) <= 1 || (Math.abs(px - 50.5) < 1.3 && py > 52.6 && py < 54.6 && (Math.floor((px - 49) * 2) % 2 === 0 || py > 53.9))) return ['glow', 6.8]; // Schädel, Kiefer mit Zähnen
      if (pr > 3.7 && pr < 4.7) return ['glow', 6.4]; // Siegelkreis
      if (pr <= 3.7 && pr > 2.5) return ['iron', 2.2]; // dunkle Füllung im Kreis
      if (cap(px, py, 50.5, 31, 50.5, 36, 1.6, 1.2) && hash(px, py, seed + 31) > 0.6) return ['blood', 3.6]; // Blut am unteren Klingenteil
      // 0.19.15 (Nutzer: „sieht aus wie eine Eisenstange“): Klinge mit Spitze, Hohlkehle, helle Schneide; geschwungene Parierstange, umwickelter Griff
      if (py >= 3.6 && py <= 36) {
        const hw = py < 9.5 ? 0.15 + (py - 3.6) * 0.36 : 2.3, ax = Math.abs(px - 50.5);
        if (ax <= hw) {
          if (ax < 0.42 && py > 10) return ['iron', 2.4]; // Hohlkehle
          if (ax > hw - 0.7) return ['iron', px < 50.5 ? 7 : 5.4]; // helle Schneide links, Schatten rechts
          return ['iron', px < 50.5 ? 6 : 4];
        }
      }
      if (cap(px, py, 45, 36.4, 56, 36.4, 1.15, 1.15) || cap(px, py, 45, 36.4, 43.4, 39.4, 0.95, 0.4) || cap(px, py, 56, 36.4, 57.6, 39.4, 0.95, 0.4)) return ['iron', 3.6 - l]; // Parierstange mit nach unten gebogenen Enden
      if (cap(px, py, 50.5, 37.4, 50.5, 46.4, 1.0, 1.0)) return ['wood', Math.floor((py - 37) / 1.6) % 2 ? 1.4 : 2.8]; // Griff mit Wicklung
    }
    else { if (cap(px, py, 51, -0.5, 51, 7, 1.1, 0.2)) return ['iron', 6.4]; if (!turm && ell(px, py, 55.5, 12.5, 5.2, 6.8) <= 1 && px > 52) return ['iron', px > 57.5 ? 6.6 : 5 + n * 0.5]; if (cap(px, py, 51, 6, 51, 63, 0.95, 0.95)) return ['wood', 2.4 - l * 0.5]; }
    // Turmschild links
    if (turm) { const sd = ell(px, py, 13.5, 38.5, 8.2, 17); if (sd <= 1) { if ((Math.abs(px - 13.5) < 1.1 && py > 27 && py < 49) || (Math.abs(py - 37) < 1.1 && Math.abs(px - 13.5) < 5.5)) return ['glow', 4.6]; return sd > 0.72 ? ['iron', 2.2 + n * 0.5] : ['stone', 4 - l + n * 0.9]; } }
    // Arme, Schulterplatten, Hände
    if (cap(px, py, 20.5, 27, 15.8, 39.5, 3.3, 2.8) || cap(px, py, 43.5, 27, 49.8, 40.5, 3.3, 2.8) || ell(px, py, 50.6, 41, 2.6, 2.8) <= 1) return A(3.2);
    if (ell(px, py, 20, 25.2, 6.6, 4.6) <= 1 || ell(px, py, 44, 25.2, 6.6, 4.6) <= 1) return A(4.8);
    if (haupt && (cap(px, py, 19, 21.5, 14.6, 12.5, 1.8, 0.2) || cap(px, py, 45, 21.5, 49.4, 12.5, 1.8, 0.2) || cap(px, py, 15.5, 25.5, 9.6, 21, 1.5, 0.2) || cap(px, py, 48.5, 25.5, 54.4, 21, 1.5, 0.2))) return ['iron', 5.8 - l * 0.6];
    // Brustpanzer mit Siegel, Gürtel, Wappenrock, Beine, Stiefel
    if (haupt && Math.abs(Math.hypot(dx, py - 32) - 3.7) < 0.8) return ['glow', 6.6];
    if (haupt) for (const [ax, ay, bx, by] of [[22, 26, 41, 45], [42, 26, 23, 45]]) { // gekreuzte Siegelketten
      const vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy), t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (L * L)));
      if (Math.hypot(px - ax - vx * t, py - ay - vy * t) < 0.95) return ['iron', Math.floor(t * L / 1.6) % 2 ? 6.4 - l : 2.4];
    }
    if (py > 43.8 && py < 46.6 && Math.abs(dx) < 11) return Math.abs(dx) < 1.8 ? ['glow', 5] : ['wood', 1.6 + n * 0.6];
    if (ell(px, py, 32, 34, 11.8, 13.2) <= 1 && py < 46) return A(Math.abs(dx) < 0.7 ? 5.4 : 4);
    const hem = 58 + Math.sin(px * 1.6 + seed) * 1.4;
    if (py > 46 && py < hem && Math.abs(dx) < 6.8 + (py - 46) * 0.12) return Math.abs(dx) < 0.9 ? ['glow', turm ? 4.2 : 3.4] : [turm ? 'stone' : 'wood', (turm ? 3.2 : 2.2) + n * 0.8 - l * 0.6];
    if (cap(px, py, 28, 46, 27, 60, 3.4, 3) || cap(px, py, 36, 46, 37, 60, 3.4, 3) || ell(px, py, 26.2, 61.8, 4.4, 2.2) <= 1 || ell(px, py, 37.8, 61.8, 4.4, 2.2) <= 1) return A(2.6);
    // Umhang des Hauptmanns (hinter allem)
    if (haupt && py > 23 && py < 49 + 14 * Math.abs(Math.sin(px * 0.85 + seed * 0.3)) * (0.5 + 0.5 * Math.abs(Math.sin(px * 0.31 + 1))) && Math.abs(dx) < 12.8 + (py - 23) * 0.3 && !(py > 40 && hash(px >> 1, py >> 1, seed + 5) > 0.84)) return ['wood', 1.6 + (vnoiseCol(px, seed)) * 1.2 - l * 0.5]; // Fetzen mit Rissen
    return null;
  };
  if (!haupt) return paintFigure(seed, body);
  return paintFigure(seed, (c) => { // Blutspritzer auf Rüstung, Umhang und Klinge
    const res = body(c);
    if (res && res[0] !== 'glow' && c.py > 22 && c.vn(c.px * 1.4, c.py * 1.9, 7) > 0.8 && hash(c.px, c.py, seed + 41) > 0.25) return ['blood', 3.2 + hash(c.px, c.py, seed + 42) * 1.6];
    return res;
  });
}
const vnoiseCol = (px, seed) => 0.5 + 0.5 * Math.sin(px * 1.9 + seed); // senkrechte Falten

function genWolf(seed) { // 0.19.2: Sumpfwolf von vorn (Nutzer: Gegner „sehen in unterschiedliche Richtungen“ – vorher Profil nach links). Kopf gesenkt, glühende Augen, gefletschte Zähne, gesträubte Schultern, Moos im Fell
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const ax = Math.abs(px - 32), l = lit(px, py), fur = (vn(px * 1.6, py * 2.4, 5) - 0.5) * 1.2 + nz(x, y) * 0.45;
    const moss = vn(px * 1.7 + 9, py * 1.7, 4) > 0.66 && py > 36;
    const F = (b) => (moss ? ['moss', 2.1 + fur * 0.7 + (b - 1.6) * 0.5] : ['ceil', b - l * 0.7 + fur * 0.8]);
    const sx = (v) => 32 + Math.sign(px - 32 || 1) * v; // gespiegelte x-Koordinate auf der Seite des Pixels
    // Gesicht (liegt vorn)
    if (ell(px, py, sx(5.0), 33.6, 1.9, 1.1) <= 1) return ['glow', ell(px, py, sx(4.6), 33.6, 0.65, 0.65) <= 1 ? 3.4 : 7];
    if (cap(px, py, sx(2.2), 31.2, sx(7.6), 32.4, 0.75, 0.75)) return ['ceil', 0]; // finstere Brauen
    if (ell(px, py, 32, 39.6, 2.1, 1.35) <= 1) return ['ceil', 0]; // Nase
    if (cap(px, py, sx(2.5), 42.6, sx(2.2), 46.6, 0.85, 0.2) || cap(px, py, sx(1.0), 43.0, sx(1.0), 44.6, 0.55, 0.2) || cap(px, py, sx(2.1), 48.4, sx(2.3), 45.2, 0.75, 0.2)) return ['stone', 7]; // Fänge oben und unten
    if (ell(px, py, 32, 45.3, 3.8, 2.4) <= 1) return ['flesh', ell(px, py, 32, 45.8, 2.2, 1.2) <= 1 ? 0.6 : 2]; // Rachen
    if (ell(px, py, 32, 41.6, 4.9, 4.5) <= 1) return F(2.6); // Schnauze
    if (ell(px, py, 32, 47.6, 4.2, 1.8) <= 1) return F(1.8); // Unterkiefer
    if (ell(px, py, 32, 34.8, 9.2, 6.8) <= 1) return F(2.3); // Schädel
    if (cap(px, py, sx(6.4), 30.4, sx(10.8), 22.2, 3.0, 0.4)) return cap(px, py, sx(6.9), 29.6, sx(10.2), 24.2, 1.2, 0.2) ? ['flesh', 1.2] : F(1.7); // Ohren mit dunklem Innenohr
    // Vorderläufe und Pfoten mit Krallen
    if (ell(px, py, sx(7.6), 62, 3.3, 1.5) <= 1) return ['ceil', 1.2 + fur * 0.3];
    if (py > 62.4 && py < 63.8 && (Math.abs(ax - 5.6) < 0.45 || Math.abs(ax - 7.6) < 0.45 || Math.abs(ax - 9.6) < 0.45)) return ['stone', 6.5];
    if (cap(px, py, sx(7.2), 49, sx(7.7), 61.4, 3.2, 2.1)) return F(1.9);
    // Brust, Halskrause, gesträubter Rücken
    if (ell(px, py, 32, 50.5, 10.5, 7.5) <= 1) return py > 53 && ax < 5 ? ['ceil', 2.8 + fur * 0.5] : F(2.1);
    if (ell(px, py, 32, 43.5, 13.5, 8.2) <= 1) return F(1.8);
    for (let i = 0; i < 5; i++) { const bx = 9.5 + i * 1.7, top = 33.2 - (i % 2) * 1.6 - (i === 2 ? 1 : 0); if (cap(px, py, sx(bx), 39.5, sx(bx + 0.9), top, 1.4, 0.2)) return F(1.3); }
    // Hinterläufe und Rumpf (weiter hinten, dunkler)
    if (ell(px, py, sx(15.4), 62, 2.8, 1.3) <= 1) return ['ceil', 0.8 + fur * 0.3];
    if (cap(px, py, sx(14.6), 50, sx(15.6), 61.5, 2.8, 1.8)) return F(1.1);
    if (ell(px, py, 32, 46.5, 15, 7) <= 1) return F(1.2);
    return null;
  });
}

function genKultist(seed) { // Moorkultist (0.16.16, 192 px): Spitzkapuze mit Widderhörnern, leere Gesichtshöhle mit glühenden Schlitzaugen, Knochenmaske mit Zähnen, Knochenzacken an den Schultern, gezackter Dolch mit Gift, grüne Zauberhand mit Krallen, Brustsiegel, Gürtel mit Schädeln, zerfetzter Saum
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const dx = px - 32, l = lit(px, py), n = nz(x >> 1, y >> 1);
    const C = (b) => ['ceil', b - l * 0.8 + n * 0.5];
    const bone = (b) => ['stone', b - l * 0.9 + n * 0.6];
    // Augen (schräg, böse) und Zähne zuerst
    if (cap(px, py, 27.1, 13.6, 30.7, 15.5, 1.0, 0.6) || cap(px, py, 36.9, 13.6, 33.3, 15.5, 1.0, 0.6)) return ['glow', 7];
    if (ell(px, py, 32, 20.2, 4.2, 3.2) <= 1 && py > 18.6) { // Maul: schwarz mit unregelmäßigen Reißzähnen oben und unten
      for (let i = 0; i < 5; i++) { const tx = 28.6 + i * 1.7, len = 1.6 + hash(i, 5, seed) * 1.7; if (cap(px, py, tx, 18.8, tx, 18.8 + len, 0.62, 0.08) || cap(px, py, tx + 0.8, 23.6, tx + 0.8, 23.6 - len * 0.7, 0.55, 0.08)) return bone(7); }
      return ['ceil', 0];
    }
    if (cap(px, py, 24.6, 9.6, 31.5, 11.6, 0.6, 0.35) || cap(px, py, 39.4, 9.6, 32.5, 11.6, 0.6, 0.35)) return ['ceil', 0]; // finstere Brauen
    // Widderhörner (seitlich der Kapuze, eingerollt)
    for (const sg of [-1, 1]) {
      const hx = 32 + sg * 8.6;
      if (cap(px, py, hx, 10.5, 32 + sg * 14.2, 6.6, 2.5, 1.9) || cap(px, py, 32 + sg * 14.2, 6.6, 32 + sg * 17, 11.8, 1.9, 1.2) || cap(px, py, 32 + sg * 17, 11.8, 32 + sg * 14.6, 15.4, 1.2, 0.3)) return Math.abs(Math.sin((py + px * 0.6) * 1.9)) > 0.78 ? bone(4.4) : bone(6.4);
    }
    if (ell(px, py, 32, 19.4, 5.6, 5.4) <= 1 && py > 17.2) return bone(5.6 + n * 0.6); // Kiefer der Maske
    if (ell(px, py, 32, 14.4, 6.2, 7.2) <= 1) return ['ceil', 0]; // leere Gesichtshöhle
    // Kapuze: Spitze und Haube mit Falten
    const peak = py > 0.8 && py < 10.6 && Math.abs(dx) < (py - 0.8) * 0.9 + 0.2;
    if (peak || ell(px, py, 32, 13.4, 9.1, 10.6) <= 1) return C(1.5 + vn(px * 1.2, py * 0.4, 7) * 1.2 + (dx < -4 ? 0.7 : 0));
    // Dolch (rechts erhoben): gezackte Klinge, Parierstange, Giftadern und Tropfen
    const blade = cap(px, py, 50.2, 19.5, 52.2, 10.2, 1.45, 1.25) || cap(px, py, 52.2, 10.2, 49.6, 2.4, 1.25, 0.15);
    if (blade) {
      if (cap(px, py, 50.6, 18, 51.7, 8, 0.32, 0.3)) return ['glow', 6.2];
      return ['iron', (px > 51.4 ? 4.3 : 6.5) + (Math.floor(py * 1.1) % 2 === 0 && px < 50.6 ? -0.8 : 0)];
    }
    for (let i = 0; i < 4; i++) { const ty = 7 + i * 3; if (cap(px, py, 50.6 - i * 0.2, ty, 48.9 - i * 0.2, ty + 1.1, 0.7, 0.1)) return ['iron', 5.6]; } // Sägezähne
    if (cap(px, py, 46.6, 20.2, 53.8, 20.2, 0.95, 0.95)) return ['iron', 3.2];
    if (ell(px, py, 53.6, 24.4, 0.6, 1.1) <= 1 || ell(px, py, 47.2, 27, 0.55, 1.0) <= 1) return ['glow', 6]; // Tropfen
    if (ell(px, py, 50.2, 22, 2.3, 2.5) <= 1) return bone(5.4); // Hand
    for (const f of [[48.5, 19.6], [50.2, 19.1], [52, 19.6]]) if (cap(px, py, f[0], 21, f[0] + (f[0] - 50.2) * 0.1, f[1], 0.7, 0.55)) return bone(4.8);
    // rechter Arm (weiter Ärmel)
    if (cap(px, py, 42.5, 25.8, 48.6, 31.5, 3.7, 3) || cap(px, py, 48.6, 31.5, 50.2, 23.4, 3, 2.1)) return C(2 + vn(px * 0.9, py * 0.5, 4) * 1.3);
    // linke Zauberhand mit grüner Flamme und Krallen
    if (ell(px, py, 13.2, 39, 3.8, 5.2) <= 1) return ['flesh', ell(px, py, 13.2, 40, 1.7, 2.6) <= 1 ? 7 : 5.2 + n * 0.8];
    if (cap(px, py, 13.2, 36, 11.8, 29.4, 2.4, 0.2) || cap(px, py, 15.4, 37, 17.8, 31.8, 1.7, 0.2) || cap(px, py, 11, 37, 8.8, 32.4, 1.5, 0.2)) return ['flesh', 5.6 + n * 0.8];
    if (ell(px, py, 13.2, 45.2, 3.1, 3.3) <= 1) return bone(5.2);
    for (const f of [[9.6, 51.2], [12, 52.4], [14.6, 52.4], [17.2, 51]]) if (cap(px, py, 13.2 + (f[0] - 13.2) * 0.4, 46.2, f[0], f[1], 0.85, 0.15)) return bone(6);
    if (cap(px, py, 21.6, 26, 15.6, 33, 3.7, 3) || cap(px, py, 15.6, 33, 13.4, 43, 3, 2.4)) return C(2 + vn(px * 0.9 + 7, py * 0.5, 4) * 1.3);
    // Schulterkragen mit Knochenzacken
    for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) {
      const bx = 32 + sg * (8.2 + i * 3.4), top = 20.8 + i * 0.9 - (i === 1 ? 1.6 : 0);
      if (cap(px, py, bx, 25.8, bx + sg * 0.9, top, 1.2, 0.12)) return bone(6.2 - i * 0.2);
    }
    if (ell(px, py, 32, 25.6, 14.2, 5.2) <= 1) return C(2.6 + vn(px * 1.4, py * 0.8, 5) * 1.5);
    // Brustsiegel: offenes Auge (Mandel mit Pupille und kurzen Strahlen)
    { const ex = dx / 4.6, ey = (py - 34) / 2.4, eye = ex * ex + ey * ey;
      if (Math.abs(eye - 1) < 0.34 && Math.abs(ey) < 1.02) return ['glow', 5.2];
      if (ell(px, py, 32, 34, 1.15, 1.15) <= 1) return ['glow', 7];
      for (const sg of [-1, 0, 1]) if (cap(px, py, 32 + sg * 3.4, 29.2 - (sg === 0 ? 0.6 : 0), 32 + sg * 4.6, 27.2, 0.45, 0.2)) return ['glow', 4.6]; }
    // Gürtel mit Schnalle, Knochenschädeln an Ketten und herabhängenden Fetzen
    for (const sx of [25.6, 38.6]) {
      if (ell(px, py, sx, 51.4, 2, 2.3) <= 1) return ell(px, py, sx - 0.7, 51.4, 0.5, 0.7) <= 1 || ell(px, py, sx + 0.7, 51.4, 0.5, 0.7) <= 1 ? ['ceil', 0] : bone(6.1);
      if (cap(px, py, sx, 46.4, sx, 49.2, 0.3, 0.3)) return ['iron', 4];
    }
    if (py > 44 && py < 46.9 && Math.abs(dx) < 9.2) return Math.abs(dx) < 1.9 ? ['glow', 5.4] : ['wood', 1.7 + n * 0.7];
    // Robe: breiter werdend, Falten, zerfetzter Saum, Risse
    const hem = 62.6 - 2.4 * Math.abs(Math.sin(px * 1.35 + seed)) - 1.3 * Math.abs(Math.sin(px * 3.7 + seed * 0.7));
    if (py > 21 && py < hem && Math.abs(dx) < 7.6 + (py - 21) * 0.34) {
      if (py > 52 && vn(px * 3.2, py * 0.6, 6) > 0.67) return null; // Risse im Saum
      if (Math.abs(dx) < 1 && py > 46.9) return ['ceil', 0]; // Schlitz
      if (py > 56.6 && Math.abs(dx) > 1 && Math.floor(px * 1.6 + seed) % 3 === 0) return ['glow', 3.2]; // glimmender Saum
      return C(1.5 + vn(px * 1.1, py * 0.3, 3) * 1.6 + Math.abs(Math.sin(px * 0.8 + seed)) * 0.5 - Math.max(0, (py - 44) * 0.03));
    }
    return null;
  }, 192);
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
    sprites: { plate: genPlate(false, 411), plateDown: genPlate(true, 411), boulder: smoothSprite(genBoulder(421), 2), trapFaint: genTrap('faint', 401), trapSeen: genTrap('seen', 401), trapSprung: genTrap('sprung', 401), chest: spr(genChest(false, 61), 107), chestOpen: spr(genChest(true, 61), 108), schrat: sm2(genSchrat(71)), portal: spr(genPortal(81), 109), merchant: sm2(genMerchant(91)), wisp: sm2(genWisp(121)), skeleton: sm2(genSkeleton(171)), guard: sm2(genGuard(181, 'wacht')), turmwache: sm2(genGuard(183, 'turm')), captain: sm2(genGuard(191, 'haupt')), wolf: sm2(genWolf(301)), kultist: sm2(genKultist(311)), kaefer: sm(genKaefer(201)), geist: sm2(genRobed(241, 'geist')), priester: sm2(genRobed(251, 'priester')), hueter: sm2(genRobed(261, 'hueter')), moorschrat: sm2(genSchratBoss(221, 'moor')), grubenschrat: sm2(genSchratBoss(222, 'grube')), runeStone: spr(genRuneStone(231), 115), leverUp: genLever(false, 211), leverDown: genLever(true, 211), stairsDown: spr(genStairs('down', 141), 112), stairsUp: spr(genStairs('up', 151), 113), arch: spr(genArch(161), 114), sign: genSign(131) }
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
    const bt = this.bright || 1, minS = bt >= 2.4 ? 3 : bt >= 1.8 ? 2 : bt >= 1.35 ? 1 : 0;
    this.pal = buildPalette(def, bt);
    this.shadeTbl = [];
    for (let d = 0; d < 8; d++) {
      const t = new Uint32Array(PAL_N);
      for (let i = 0; i < PAL_N; i++) t[i] = (i >> 3) === M.glow && d < 7 ? this.pal[(i & ~7) | Math.max(2, (i & 7) - (d >> 1))] : this.pal[(i & ~7) | Math.max(Math.min(i & 7, minS), (i & 7) - d)];
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
    const grid = view.grid, gw = view.gw, gh = view.gh, decals = view.decals || null;
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
      const dec = decals ? decals.get((mapY * gw + mapX) * 4 + (side === 0 ? (stepX > 0 ? 3 : 1) : (stepY > 0 ? 0 : 2))) : null;
      const dN = dec ? dec.w : 0, dX = dec ? Math.max(0, dN - 1 - Math.min(dN - 1, Math.floor(texX * dN / WN))) : 0 /* gespiegelt: die Wandtextur-Spiegelung gilt für Beschriftung nicht */, dStep = dec ? dN / lineH : 0;
      for (let y = y0; y <= y1; y++) {
        let c = tbl[td[((texPos | 0) & WM) * WN + texX]];
        texPos += texStep;
        if (dec) { const dv = dec.data[Math.min(dN - 1, ((y - startRaw) * dStep) | 0) * dN + dX]; if (dv !== 255) c = tbl[dv]; }
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
      let wf = 1; // Durchgänge stehen fest im Raum: Breite nach Blickwinkel zur Durchgangsachse
      if (s.axis) { const len = Math.hypot(s.x + 0.5 - px, s.y + 0.5 - py) || 1; wf = Math.max(0.12, Math.min(1, Math.abs(((s.x + 0.5 - px) * s.axis[0] + (s.y + 0.5 - py) * s.axis[1]) / len))); }
      const sprH = Math.floor(focal / tY * s.scale), sprW = Math.max(1, Math.floor(sprH * wf));
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
const spriteFor = (tex, k) => (k === 'moorlicht' ? tex.sprites.wisp : k === 'skeleton' ? tex.sprites.skeleton : k === 'kultwaechter' ? tex.sprites.guard : k === 'turmwache' ? tex.sprites.turmwache : k === 'wolf' ? tex.sprites.wolf : k === 'kultist' ? tex.sprites.kultist : k === 'hauptmann' ? tex.sprites.captain : k === 'erzkaefer' ? tex.sprites.kaefer : k === 'nebelgeist' ? tex.sprites.geist : k === 'kultpriester' ? tex.sprites.priester : k === 'nebelhueter' ? tex.sprites.hueter : k === 'schrat' ? tex.sprites.moorschrat : k === 'grubenschrat' ? tex.sprites.grubenschrat : tex.sprites.schrat);
const bossScale = (k) => (k === 'schrat' || k === 'grubenschrat' || k === 'nebelhueter' ? 1.2 : k === 'hauptmann' ? 1.12 : 0.9); // Bosse stehen größer im Gang
export const GROUP_SCALE = 0.78, GROUP_GAP = 0.44, CHEST_SCALE = 0.62; // 0.16.4: Gruppen vorher 0.62/0.36, Truhe 0.5 (Nutzer: zu klein, hinter der Leiste)
let combatFit = 1; // 0.16.17: im Kampf verkleinert die Kamera zu große Figuren so, dass sie samt Füßen über der Leiste ins Bild passen
export const setCombatFit = (v) => { combatFit = v; };
// 0.19.2: Gruppen je nach Größe kleiner, damit sich die Gestalten nicht überschneiden (Nutzer: „Gegner überschneiden sich“)
export const GROUP_SIZE = { 2: 0.72, 3: 0.6 };
export const spriteScale = (k, n) => (n > 1 ? GROUP_SIZE[Math.min(3, n)] || GROUP_SCALE : bossScale(k)) * (k === 'wolf' ? 1.65 : 1); // Wolf ist niedrig gebaut: größer ansetzen (0.19.3: 1,25 → 1,45; 0.19.5: 1,65, Nutzer: „noch etwas größer“)
// Aufstellung einer Gruppe (0.16.4b): lat = seitlich (rechts +), dep = Tiefe (vom Betrachter weg). Im engen Gang (links und rechts Wand)
// stehen die Gegner gestaffelt hintereinander statt nebeneinander, sonst ragen sie in die Wände (Nutzer-Screenshot 0.16.4).
export function groupOffsets(n, narrow) {
  if (n <= 1) return [{ lat: 0, dep: 0 }];
  const gap = narrow ? (n >= 3 ? 0.32 : 0.48) : (n >= 3 ? 0.42 : 0.5); // 0.19.3: Zweiergruppen weiter auseinander (größere Wölfe) // 0.19.2: Abstand so, dass die kleineren Gestalten nebeneinander passen
  return Array.from({ length: n }, (_, i) => ({ lat: (i - (n - 1) / 2) * gap, dep: 0 }));
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
// Achse eines Durchgangs (Tor, Treppe, Ausgang) aus den Nachbarwänden; null = frei stehend. Das Sprite wird damit schmaler, wenn man schräg/seitlich vorbeigeht, statt sich zur Kamera zu drehen.
function passAxis(grid, o) {
  if (!grid) return null;
  const wl = (x, y) => x < 0 || y < 0 || x >= grid.gw || y >= grid.gh || grid.grid[y * grid.gw + x] !== 0;
  if (wl(o.x - 1, o.y) && wl(o.x + 1, o.y)) return [0, 1];
  if (wl(o.x, o.y - 1) && wl(o.x, o.y + 1)) return [1, 0];
  return null;
}
export function buildSprites(objs, tex, time, angle = 0, alive = null, grid = null) { // alive: {objId: Arten (Liste) oder Anzahl der lebenden Gegner} im Kampf; grid: für enge Gänge
  const out = [];
  const rx = Math.cos(angle), ry = Math.sin(angle); // „rechts“ aus Sicht der Kamera
  const fx = Math.sin(angle), fy = -Math.cos(angle); // „vorn“
  for (const o of objs) {
    if (o.type === 'plate') out.push({ x: o.x, y: o.y, tex: o.down ? tex.sprites.plateDown : tex.sprites.plate, scale: 1 });
    else if (o.type === 'boulder') out.push({ x: o.x, y: o.y, tex: tex.sprites.boulder, scale: 0.78 });
    else if (o.type === 'trap') { if (!o.disarmed) out.push({ x: o.x, y: o.y, tex: o.sprung ? tex.sprites.trapSprung : o.spotted ? tex.sprites.trapSeen : tex.sprites.trapFaint, scale: 1 }); }
    else if (o.type === 'chest') out.push({ x: o.x, y: o.y, tex: o.open ? tex.sprites.chestOpen : tex.sprites.chest, scale: CHEST_SCALE });
    else if (o.type === 'enemy' && !o.dead) {
      const tot = Array.isArray(o.kinds) ? Math.min(3, o.kinds.length) : 1;
      const av = alive && alive[o.id] != null ? alive[o.id] : null, kindList = Array.isArray(av) ? av : null;
      const n = kindList ? kindList.length : av != null ? av : tot; // Gruppe: eine Gestalt je lebendem Gegner, nebeneinander
      const narrow = n > 1 && isNarrowAt(grid, o.x, o.y, angle), offs = groupOffsets(n, narrow);
      for (let i = 0; i < n; i++) {
        let { lat, dep } = offs[i];
        const kd = kindList ? kindList[i] : kindOf(o, i), sc = spriteScale(kd, n) * combatFit;
        // 0.19.7 (Nutzer: „Gegner in der Wand“): im engen Gang ragten seitliche Figuren in die Mauern. Seitenabstand so begrenzen, dass die sichtbare Figur (ca. 76 % der Bildbreite) zwischen den Wänden bleibt; äußere Figuren dafür etwas nach hinten staffeln.
        if (narrow) { const lim = Math.max(0.04, 0.47 - 0.38 * sc); if (Math.abs(lat) > lim) { lat = Math.sign(lat) * lim; if (n >= 3 || i === 1) dep += 0.3; } }
        out.push({ x: o.x + rx * lat + fx * dep, y: o.y + ry * lat + fy * dep, tex: spriteFor(tex, kd), scale: sc * (1 + 0.02 * Math.sin(time * 3 + i)) });
      }
    }
    else if (o.type === 'lever' && !o.wall) out.push({ x: o.x, y: o.y, tex: o.used ? tex.sprites.leverDown : tex.sprites.leverUp, scale: 0.75 });
    else if (o.type === 'sign' && o.face == null) out.push({ x: o.x, y: o.y, tex: signTex(tex, o), scale: 0.7 }); // mit face: Tafel hängt an der Wand (buildDecals)
    else if (o.type === 'door' && o.open && grid) { // offene Tür: Rahmen + aufgeklapptes Blatt, nur beim Blick längs des Durchgangs (sonst stünde der Rahmen quer)
      const wl = (x, y) => x < 0 || y < 0 || x >= grid.gw || y >= grid.gh || grid.grid[y * grid.gw + x] !== 0;
      const ns = wl(o.x - 1, o.y) && wl(o.x + 1, o.y);
      out.push({ x: o.x, y: o.y, tex: cachedTex(tex, 'frames', styleFor(o) + (o.title || ''), () => genDoorFrame(o.title, styleFor(o), 137)), scale: 1, axis: ns ? [0, 1] : [1, 0] });
    }
    else if (o.type === 'runestone') out.push({ x: o.x, y: o.y, tex: tex.sprites.runeStone, scale: 0.9 });
    else if (o.type === 'merchant') out.push({ x: o.x, y: o.y, tex: tex.sprites.merchant, scale: 0.8 });
    else if (o.type === 'stairs' || o.type === 'exit') {
      if (grid && passFaces((x, y) => x < 0 || y < 0 || x >= grid.gw || y >= grid.gh || grid.grid[y * grid.gw + x] !== 0, o).length) continue; // liegt an einer Wand: als Wand-Abziehbild (buildDecals)
      out.push({ x: o.x, y: o.y, tex: passTex(tex, o), scale: 0.9, axis: passAxis(grid, o) });
    }
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
  px(0, 24, 32, 8, role === 'Krieger' ? '#6b7280' : role === 'Schurke' ? '#2f4a33' : (role === 'Priester' || role === 'Kleriker') ? '#e8e2d0' : role === 'Waldläufer' ? '#6b5532' : role === 'Alchemist' ? '#3f6b5e' : '#2c3e7a');
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
  else if (role === 'Alchemist') { px(8, 6, 16, 5, '#7a4a2c'); px(8, 11, 3, 9, '#7a4a2c'); px(21, 11, 3, 9, '#7a4a2c'); px(9, 14, 6, 5, '#9fd4c4'); px(17, 14, 6, 5, '#9fd4c4'); px(15, 15, 2, 2, '#3a2a1a'); px(10, 15, 4, 3, '#1b1712'); px(18, 15, 4, 3, '#1b1712'); }
  else if (role === 'Waldläufer') { px(8, 5, 16, 6, '#6b5532'); px(6, 10, 20, 2, '#6b5532'); px(21, 1, 2, 7, '#b7d17a'); px(7, 12, 2, 8, '#6b5532'); px(23, 12, 2, 8, '#6b5532'); }
  else { for (let i = 0; i < 12; i++) px(16 - Math.round(i * 0.55), 1 + i, Math.round(1 + i * 1.1), 1, '#2c3e7a'); px(6, 12, 20, 2, '#2c3e7a'); px(14, 6, 4, 2, '#d9b44a'); }
}
