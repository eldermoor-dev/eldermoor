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
export const WALL_STONE = 1, WALL_MOSS = 2, WALL_DOOR = 3, WALL_DOOR_LOCKED = 4, WALL_TORCH = 5, WALL_ROCK = 6, WALL_LICHEN = 7, WALL_GATE = 8, WALL_SECRET = 9, WALL_SWITCH = 10, WALL_SWITCH_ON = 11, WALL_HOUSE = 12, WALL_VEGAS = 13, WALL_WEB = 14; // 0.33.0: WALL_WEB = Spinnennetz (Gitter mit web:true)
export const DOOR_LOOKS = ['plank', 'eisen', 'stein', 'bogen', 'gold', 'gitter', 'morsch']; // 0.32.1 (Nutzer: „mehr Türvarianten“): Aussehen der Tür (Objektfeld look); plank = klassische Holztür mit Eisenbändern (ID 3/4), übrige IDs 20 + 2·Index (+1 verschlossen)
export const doorWall = (o) => { const i = DOOR_LOOKS.indexOf(o.look); return i <= 0 ? (o.locked ? WALL_DOOR_LOCKED : WALL_DOOR) : 20 + i * 2 + (o.locked ? 1 : 0); };

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
  const t = genStone(11, n); // 0.19.24: gleiche Steinmauer wie normale Wände (Fugen passen), Moos läuft zu den Seitenkanten aus
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k;
    const ed = Math.min(1, Math.min(u, TEX - u) / 10), edge = ed * ed * (3 - 2 * ed);
    const bv = v % 16, fuge = Math.max(0, 1 - Math.min(bv, 16 - bv) / 5) + Math.max(0, 1 - Math.min(((u + (Math.floor(v / 16) & 1) * 16) % 32), 32 - ((u + (Math.floor(v / 16) & 1) * 16) % 32)) / 4) * 0.6;
    const top = Math.max(0, 1 - v / 38);
    const cover = vnoise(u, v, 10, seed + 9) * 0.75 + vnoise(u, v, 4, seed + 11) * 0.25 + fuge * 0.22 + top * 0.3;
    const e = cover - 0.74 - (1 - edge) * 0.6;
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
// 0.31.11: Palme (Insel) und aufgewühlter Sandhügel (vergrabener Schatz, nur sichtbar, wenn bemerkt)
function genPalm(seed) {
  const crownX = 36, crownY = 17;
  const pts = [];
  for (const a of [-2.9, -2.35, -1.85, -1.3, -0.8, -0.25, 0.3]) for (let s = 0; s <= 1.0001; s += 0.025) pts.push([crownX + Math.cos(a) * s * 26, crownY + Math.sin(a) * s * 11 + s * s * 14 - 2]);
  return paintFigure(seed, ({ ell, lit, nz, px, py, x, y, vn }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1);
    if (ell(px, py, crownX - 3, crownY + 5, 2.6, 2.6) <= 1 || ell(px, py, crownX + 2, crownY + 6, 2.4, 2.4) <= 1) return ['wood', 1.2 + n * 0.4]; // Kokosnüsse
    let dmin = 9; for (const [qx, qy] of pts) { const d = Math.hypot(px - qx, (py - qy) * 1.25); if (d < dmin) dmin = d; }
    if (dmin < 2.5 + ((x + y) % 3 === 0 ? 0.5 : 0)) return ['moss', 4.6 - l * 0.7 - dmin * 0.5 + n * 0.6]; // Wedel
    const tx = 31 + Math.pow((62 - py) / 44, 2) * 5.5; // Stamm, oben leicht geneigt
    const w = 4.4 - (62 - py) * 0.04;
    if (py >= crownY + 2 && py <= 62 && Math.abs(px - tx) < w) return ['wood', 3.1 - (px - tx) * 0.5 - (Math.abs((py % 4.6)) < 0.9 ? 1.1 : 0) + n * 0.4];
    return null;
  }, 128, true);
}
function genMound(seed) {
  return paintFigure(seed, ({ ell, lit, nz, px, py, x, y }) => {
    const n = nz(x, y), e = ell(px, py, 32, 54, 17, 6);
    if (e <= 1) return ['glow', (e > 0.55 ? 3.3 : 4.6) - (px - 32) * 0.04 + n * 0.6]; // aufgeworfener Sand, dunkler Rand = frisch gegraben
    if (ell(px, py, 32, 54, 21, 8.5) <= 1 && n > 0.5) return ['glow', 2.6];
    return null;
  }, 128, true);
}
function genWeb(seed, n = TEX) { // 0.33.0: Spinnennetz – dunkler Grund, Speichenfäden und Spiralringe in hellem Grau-Weiß, klebrige Knoten
  const t = { w: n, h: n, data: new Uint8Array(n * n) };
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k, dx = u - 32, dy = v - 30, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    let idx = P('ceil', 0.3 + grain(x, y, seed, 0.6) + 0.3);
    const spoke = Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.44 && r > 2;
    const ring = r > 4 && (r % 7) < 1.1 + (r > 20 ? 0.3 : 0) && Math.abs(Math.sin(a * 6)) > 0.02;
    const sag = ring && ((r % 7) < 0.55 || hash((r / 7) | 0, (a * 6) | 0, seed) > 0.28);
    if (spoke || sag) idx = P('stone', 6 + grain(x, y, seed + 1, 1.4));
    if (r < 3) idx = P('stone', 6.8);
    t.data[y * n + x] = idx;
  }
  return t;
}
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
// Geöffnetes Fallgitter (0.23.9, Nutzer: „soll offen zu sehen sein“): Pfosten und Querbalken, daran hochgezogen die Stäbe mit Spitzen; Durchgang frei
// 0.31.6 (Nutzer: „Brücke ist flach“): Geländer der Brücke – Pfosten und zwei Holme, steht als Ebene längs der Bahn an der Kante (Typ 'rail')
function railBlock(t, seed, top, flameTorch) { // 0.32.1 (Nutzer: „Geländer sieht schlecht aus“): steinerne Brüstung (Quader mit Fugen, Deckplatte); optional hoher Pfosten mit Fackel in der Mitte
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = top; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const cop = y < top + 4, row = Math.floor((y - top - 4) / 9), off = (row & 1) * 8, joint = !cop && (((y - top - 4) % 9) === 0 || ((x + off) % 16) === 0);
    set(x, y, cop ? P('stone', (y === top ? 6.3 : y === top + 3 ? 2.6 : 5.2) + hash(x >> 2, 0, seed) * 0.4) : P('stone', (joint ? 1.4 : 3.5) + hash((x + off) >> 4, row, seed) * 0.9 + (hash(x, y, seed + 3) - 0.5) * 0.4));
  }
  if (flameTorch) {
    const pt = 18, px0 = 26, px1 = 37;
    for (let y = pt; y < TEX; y++) for (let x = px0; x <= px1; x++) { const edge = x === px0 || x === px1; set(x, y, P('stone', (edge ? 1.8 : 4.2) + hash(x >> 1, y >> 3, seed + 7) * 0.8 - ((y - pt) % 9 === 0 ? 1.4 : 0))); }
    for (let y = pt - 3; y < pt; y++) for (let x = px0 - 2; x <= px1 + 2; x++) set(x, y, P('stone', y === pt - 3 ? 6.4 : 5.0)); // Pfostenkappe
    for (let y = 9; y <= pt - 4; y++) for (let x = 30; x <= 33; x++) set(x, y, P('iron', 3.2 + (x === 30 ? 0.8 : 0))); // Halterung
    for (let x = 27; x <= 36; x++) for (let y = 9; y <= 11; y++) set(x, y, P('iron', 4.0 - (y - 9) * 0.5)); // Schale
    for (let y = 0; y <= 9; y++) { const t0 = (9 - y) / 9, w = Math.sin(Math.min(1, t0 * 1.1) * Math.PI) * 4.2 * (1 - t0 * 0.35); for (let x = 32 - Math.ceil(w); x <= 32 + Math.ceil(w); x++) { const dd = Math.abs(x - 32) / Math.max(0.5, w); set(x, y, P('glow', dd < 0.4 && t0 < 0.8 ? 7 : dd < 0.75 ? 6 : 5)); } } // Flamme
  }
}
function genRail(seed) { const t = { w: TEX, h: TEX, data: new Uint8Array(TEX * TEX).fill(255), noWrap: true }; railBlock(t, seed, 22, false); return t; }
function genRailTorch(seed) { const t = { w: TEX, h: TEX, data: new Uint8Array(TEX * TEX).fill(255), noWrap: true }; railBlock(t, seed, 41, true); return t; }
function genGateOpen(seed) {
  const t = { w: TEX, h: TEX, data: new Uint8Array(TEX * TEX).fill(255) };
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    if (x <= 3 || x >= 60) set(x, y, P('iron', (x === 3 || x === 60 ? 1.4 : 3.2) + hash(x, y >> 2, seed) * 0.6)); // Pfosten
    else if (y <= 5) set(x, y, P('iron', (y === 5 ? 1.2 : 3.8) + hash(x >> 1, y, seed + 1) * 0.5)); // Querbalken
  }
  for (let u = 8; u < 58; u += 10) for (let x = u; x < u + 3.4; x++) for (let y = 6; y <= 19; y++) {
    const tip = y >= 17; // Spitze läuft schmal zu
    if (tip && (x - u < 1 || x - u > 2)) continue;
    set(Math.floor(x), y, P('iron', 4.4 - ((x - u) / 3.4) * 1.6 + hash(x, y, seed + 2) * 0.4));
  }
  t.noWrap = true;
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
function genDoorV(look, locked, seed) { // 0.32.1: Türvarianten (eisen, stein, bogen, gold, gitter, morsch)
  const t = mk(), D = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  const ring = (cx, cy, rad, v) => { for (let a = 0; a < 48; a++) { const ang = (a / 48) * Math.PI * 2; D(Math.round(cx + Math.cos(ang) * rad), Math.round(cy + Math.sin(ang) * rad), v); } };
  const lockPlate = (mat, sh) => { for (let y = 26; y <= 40; y++) for (let x = 27; x <= 36; x++) D(x, y, P(mat, sh + (y < 30 ? 1 : 0))); for (let y = 31; y <= 36; y++) { D(31, y, P('iron', 0)); D(32, y, P('iron', 0)); } D(31, 30, P('iron', 0)); D(32, 30, P('iron', 0)); };
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    let v;
    if (look === 'eisen') {
      v = P('iron', 2.3 + hash(x >> 1, y >> 1, seed) * 0.7);
      if (y % 16 === 0 || x === 31 || x === 32) v = P('iron', 0.8);
      else if (y % 16 === 1) v = P('iron', 4.2);
      else if (x % 8 === 4 && (y % 16 === 4 || y % 16 === 5)) v = P('iron', 5.6);
    } else if (look === 'stein') {
      v = P('stone', 3.2 + hash(x >> 1, y >> 1, seed) * 0.9 + (hash(x, y, seed + 5) - 0.5) * 0.4);
      const e = Math.min(x, y, 63 - x, 63 - y);
      if (e >= 5 && e <= 6) v = P('stone', 5.0); else if (e === 7) v = P('stone', 1.2);
      if (e > 7 && (x === 31 || x === 32 || y === 30 || y === 31)) v = P('stone', 1.4);
    } else if (look === 'bogen') {
      v = P('wood', 3 + hash(x, y >> 3, seed) * 1.6 - 0.8 + ((x & 15) === 0 ? -1.4 : 0));
      if (x === 31 || x === 32) v = P('wood', 0.8);
      const dx = (x - 32) / 29, dy = (y - 29) / 29;
      if (y < 29 && Math.hypot(dx, dy) > 1) v = P('stone', 2.1 + hash(x, y, seed + 2) * 0.8);
      else if (y < 29 && Math.hypot(dx, dy) > 0.93) v = P('iron', 3.4);
      if (((y >= 38 && y <= 40) || (y >= 52 && y <= 54)) && (x < 21 || x > 42)) v = P('iron', 3.2 + hash(x, y, seed + 3));
    } else if (look === 'gold') {
      v = P('wood', 1.9 + hash(x >> 1, y >> 3, seed) * 0.9);
      const e = Math.min(x, y, 63 - x, 63 - y);
      if (e >= 4 && e <= 6) v = P('glow', 4.6 + hash(x, y, seed + 1) * 0.8);
      else if (e > 7 && (((x + y) % 12 === 0) || ((x - y + 64) % 12 === 0))) v = P('glow', 3.4);
      else if (e > 7 && x % 12 === 6 && y % 12 === 6) v = P('glow', 6.2);
    } else if (look === 'gitter') {
      v = P('ceil', 0);
      const bar = x >= 4 && x <= 59 && ((x % 9) >= 3 && (x % 9) <= 5);
      const cross = x >= 4 && x <= 59 && ((y >= 6 && y <= 9) || (y >= 30 && y <= 32) || (y >= 54 && y <= 57));
      if (bar || cross) v = P('iron', 3.0 + hash(x, y, seed) * 0.8 + ((x % 9) === 3 || y === 6 ? 0.9 : 0));
    } else { // morsch
      v = P('wood', 1.7 + hash(x >> 1, y >> 4, seed) * 1.0 + ((x % 13) === 0 ? -1.0 : 0));
      const nz = hash(x >> 2, y >> 2, seed + 9);
      if (nz > 0.72) v = P('moss', 2.0 + hash(x, y, seed + 4) * 1.2);
      if (hash(x >> 0, y >> 4, seed + 6) > 0.97 && (y & 7) > 1) v = P('wood', 0.4);
      if ((y >= 10 && y <= 13) || (y >= 50 && y <= 53)) v = P('iron', 1.8 + hash(x, y, seed + 2) * 0.8);
    }
    if (x < 2 || x > 61) v = P('stone', 2 + hash(x, y, seed + 3));
    D(x, y, v);
  }
  if (locked) {
    if (look === 'gitter') lockPlate('iron', 4.5); else if (look === 'gold') lockPlate('glow', 5.0); else if (look === 'stein') lockPlate('stone', 5.2); else lockPlate('iron', look === 'morsch' ? 2.8 : 4.5);
  } else if (look === 'bogen') { ring(26, 40, 4, P('iron', 6)); ring(38, 40, 4, P('iron', 6)); }
  else if (look === 'eisen') { for (let y = 33; y <= 35; y++) for (let x = 40; x <= 55; x++) D(x, y, P('iron', 6.2 - (y - 33) * 0.7)); for (let y = 30; y <= 38; y++) { D(40, y, P('iron', 4)); D(55, y, P('iron', 4)); } }
  else if (look === 'gitter') { for (let y = 36; y <= 42; y++) for (let x = 42; x <= 48; x++) D(x, y, P('iron', 5.2)); }
  else ring(46, 34, 4, look === 'gold' ? P('glow', 6.4) : look === 'morsch' ? P('iron', 3.0) : P('iron', 6));
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
// 0.31.11: Sandboden (Gebietsfeld floorTex: 'sand'): warmer Sand mit weichen Windrippeln
function genSand(seed, n = TEX) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) };
  const k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k;
    let sh = 3.9 + (vnoise(u, v, 16, seed) - 0.5) * 1.1 + Math.sin((v + vnoise(u, v, 8, seed + 3) * 6) * 0.55) * 0.22 + grain(x, y, seed + 1, n > TEX ? 0.45 : 0.8);
    if (hash(x, y, seed + 9) > 0.992) sh -= 1.2; // vereinzelte dunkle Körner
    t.data[y * n + x] = P('glow', sh);
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
// 0.19.18 (Nutzer: Truhen „optisch ansprechender, schärfer“): neue Truhe mit gewölbtem Deckel, Eisenbändern mit Nieten, Goldschloss, Eckbeschlägen und Holzmaserung; 128 px, im Modus Scharf 2× geglättet (vorher 64 px hochskaliert)
function chestTex(tex, o) { // 0.31.9: Truhe nach Gebiet (o.mat) und Wertstufe (o.look: eisen | edel | prunk), erst bei Bedarf gezeichnet
  const mat = o.mat || 'eiche', look = o.look === 'eisen' || o.look === 'edel' ? o.look : o.look === 'prunk' ? 'prunk' : '';
  if (!o.mat && !look) return o.open ? tex.sprites.chestOpen : tex.sprites.chest;
  if (!o.mat && look === 'prunk') return o.open ? tex.sprites.chestOpen : tex.sprites.chestPrunk;
  const key = mat + ':' + look + (o.open ? ':o' : '');
  return cachedTex(tex, 'chests', key, () => tex.sm2(genChest2(!!o.open, 61 + ((mat.length * 7 + look.length) % 9), look || false, mat)));
}
function genChest2(open, seed, style = false, mat = 'eiche') { // style: true/'prunk' = Gold (Lockvogel), 'eisen' = gute Truhe, 'edel' = seltene Truhe (0.31.9, Wertstufen)
  const prunk = style === true || style === 'prunk', ed = style === 'edel', ei = style === 'eisen'; // prunk (0.20.0): Goldbeschläge, Edelsteine – Lockvogel im falschen Schatzraum
  return paintFigure(seed, ({ ell, cap, nz, px, py: py0, x, y, vn }) => {
    const py = 61.5 - (61.5 - py0) * 1.35; // 0.19.25: Truhe niedriger und breiter (Nutzer: „sieht komisch aus“), Boden bleibt unten
    const ax = Math.abs(px - 32), l = (px - 32) / 22 * 0.9, n = nz(x, y);
    // 0.31.9 (A): Körper je Gebiet – moder (Moor: vermoost), stein (Kultgruft), erz (Schratgruben: dunkles Eisen), nebel (Nebelturm: blassblaue Bohlen), eiche (Festung), blut (Blutgruft: dunkelrot)
    const BODY = { moder: ['wood', 0.92], stein: ['stone', 0.95], erz: ['iron', 0.68], nebel: ['ceil', 1.12], eiche: ['wood', 1], blut: ['blood', 0.5] }[mat] || ['wood', 1];
    const wood = (b) => (mat === 'moder' && vn(px * 0.9, py * 0.9, 9) > 0.64) ? ['moss', b * 0.85 + 0.4] : [BODY[0], b * BODY[1] - l * 1.1 + (vn(px * 2.2, py * 0.35, 6) - 0.5) * 1.5 + (n - 0.5) * 0.5 - (Math.abs(((py - 36) % 6.2)) < 0.35 ? 1.1 : 0)];
    const band = (b) => [prunk ? 'glow' : ed ? 'ice' : ei ? 'stone' : mat === 'erz' ? 'wood' : 'iron', (prunk ? b + 0.6 : ed ? b + 0.5 : ei ? b + 1.2 : b) - l * 0.9 + (n - 0.5) * 0.5];
    const bandX = (ax > 13.2 && ax < 17.4) || (ei && ax > 5 && ax < 8.6 && !(py >= 30.5 && py <= 43)); // Eisentruhe: zusätzliche Mittelbänder
    const lidTop = (hw) => ell(px, py, 32, 37, hw, 17); // gewölbter Deckel
    if (open) {
      const inside = ell(px, py, 32, 36.6, 19.4, 3.9) <= 1;
      if (py >= 36.4 && py <= 61.5 && ax <= 22) {
        if (ell(px, py, 32, 36.6, 19.4, 3.9) <= 1 && py < 40.5) return ['ceil', 0.2 + (py - 33) * 0.1 + n * 0.3];
        if (bandX) return (Math.round(px * 2) % 7 === 0 && Math.abs(py - 46) < 0.9) || (Math.round(px * 2) % 7 === 0 && Math.abs(py - 56) < 0.9) ? ['iron', 6.8] : band(3.8);
        if (py > 55.6 && (ax > 17.4)) return band(3);
        if (ax > 21 || py > 60.6) return wood(1.5);
        return wood(3.3);
      }
      if (inside) return ['ceil', 0.3];
      if (ell(px, py, 32, 36.6, 22, 5.6) <= 1 && py < 36.6) return wood(4.6); // Rand der Öffnung
      // Deckel nach hinten aufgeklappt: Innenseite sichtbar
      const hw = 21 - (36 - py) * 0.12;
      if (py >= 9 && py <= 31 && ax <= hw) {
        if (py < 11.5) return wood(4.8);
        if (bandX) return band(2.6);
        return ['wood', 1.7 + (vn(px * 2.2, py * 0.4, 6) - 0.5) * 0.9 + n * 0.3 - (px - 32) * 0.03];
      }
      return null;
    }
    // geschlossen: Gold-Schloss zuerst (liegt vorn)
    if ((prunk || ed) && (ell(px, py, 32, 27, 2.2, 2.2) <= 1 || ell(px, py, 22.5, 48, 1.7, 1.7) <= 1 || ell(px, py, 41.5, 48, 1.7, 1.7) <= 1)) return ['blood', 6.2 - (py - 26) * 0.02 + (ell(px, py, 31.3, 26.3, 0.8, 0.8) <= 1 ? 1.5 : 0)]; // Rubine
    if (ax <= 4.3 && py >= 31.6 && py <= 42.4) {
      if (ell(px, py, 32, 36.4, 1.15, 1.15) <= 1 || (ax < 0.55 && py > 36.4 && py < 39.6)) return ['ceil', 0];
      const edge = ax > 3.4 || py < 32.5 || py > 41.4;
      if (prunk) return edge ? ['glow', 4] : ['glow', 6.8 - l * 0.6 - (py - 31) * 0.08];
      if (ed) return edge ? ['ice', 3] : ['ice', 6.4 - l * 0.6 - (py - 31) * 0.08];
      if (ei) return edge ? ['stone', 3.4] : ['stone', 6.6 - l * 0.6 - (py - 31) * 0.08];
      return edge ? ['wood', 3.4] : ['wood', 6.6 - l * 0.6 - (py - 31) * 0.08]; // 0.19.25: Messing aus hellem Holzton statt Palette-Glühen (im Nebelturm war das Schloss eisblau)
    }
    if (py >= 36.4 && py <= 61.5 && ax <= 22) { // Korpus
      if (bandX) return (Math.round(px * 2) % 7 === 0 && (Math.abs(py - 41) < 0.9 || Math.abs(py - 57) < 0.9)) ? ['iron', 6.8] : band(3.9);
      if (py > 56 && ax > 17.4) return band(3.2); // Eckbeschläge
      if (ax > 17.4 && py < 39 && ax < 22) return band(3.6);
      if (py > 60.4) return ['wood', 0.8]; // Sockel
      if (ax > 21) return wood(1.4);
      return wood(3.3);
    }
    if (py >= 14 && py < 36.4 && lidTop(22) <= 1) { // Deckel
      if (py > 34.6 && py < 37) return band(4.2); // Querband an der Fuge
      if (bandX) return (Math.round(px * 2) % 7 === 0 && py < 34) ? ['iron', 6.8] : band(3.7 + (36 - py) * 0.05);
      const rim = lidTop(22) > 0.9; // Kante
      return rim ? wood(1.6) : (mat === 'moder' && vn(px * 0.9, py * 0.9, 9) > 0.64) ? ['moss', 2.8 + (36 - py) * 0.08] : [BODY[0], (3.1 + (36 - py) * 0.11) * BODY[1] - l * 1.0 + (vn(px * 2.2, py * 0.35, 6) - 0.5) * 1.3 + (n - 0.5) * 0.5];
    }
    return null;
  }, 128);
}
// 0.20.0: Truhenmaul (Monstertruhe) – Prunktruhe mit aufgerissenem Deckel als Kiefer, Zahnreihen, Zunge, Glutaugen, Krallenbeine
function genMimic(seed) {
  return paintFigure(seed, ({ ell, cap, nz, px, py, x, y, vn }) => {
    const ax = Math.abs(px - 32), l = (px - 32) / 22 * 0.9, n = nz(x, y);
    const wood = (b) => ['wood', b - l * 1.1 + (vn(px * 2.2, py * 0.35, 6) - 0.5) * 1.4 + (n - 0.5) * 0.5];
    const gold = (b) => ['glow', b - l * 0.8 + (n - 0.5) * 0.4];
    // Augen auf dem Deckel (über allem)
    if (ell(px, py, 25, 14.5, 2.6, 1.7) <= 1 || ell(px, py, 39, 14.5, 2.6, 1.7) <= 1) return ell(px, py, px < 32 ? 25.6 : 39.6, 14.6, 0.7, 1.1) <= 1 ? ['ceil', 0] : ['blood', 7];
    // Zunge hängt über die Vorderkante
    if (cap(px, py, 32, 36, 30, 47, 4.2, 3) || ell(px, py, 30, 47.5, 3.2, 2.4) <= 1) return ['blood', 4.6 + (ax < 0.6 ? -1.2 : 0) - l * 0.6 + n * 0.5];
    // Zähne: oben (am Deckel, zeigen nach unten), unten (an der Kastenkante, zeigen nach oben)
    for (let i = 0; i < 9; i++) {
      const tx = 13 + i * 4.75, big = i === 1 || i === 7;
      if (cap(px, py, tx, 26, tx + 0.3, 26 + (big ? 7 : 4.2), 1.6, 0.15)) return ['stone', 7 - (py - 26) * 0.15 + n * 0.3];
      if (cap(px, py, tx + 2.3, 40, tx + 2.1, 40 - (big ? 6 : 3.8), 1.5, 0.15)) return ['stone', 6.8 - (40 - py) * 0.12 + n * 0.3];
    }
    // Schlund
    if (ell(px, py, 32, 33, 19.5, 7.6) <= 1) return ['blood', 1.2 + (1 - ell(px, py, 32, 33, 19.5, 7.6)) * 1.8 + n * 0.4];
    if (py > 26 && py < 40 && ax < 21.5) return ['ceil', 0.3];
    // Deckel (aufgeklappt, leicht nach hinten geneigt)
    if (py >= 6 && py <= 26.5 && ell(px, py, 32, 26, 22.5, 20) <= 1) {
      if (py > 24.4) return gold(4.6);
      if (ax > 13 && ax < 16.6) return Math.round(px * 2) % 7 === 0 && py < 23 ? ['flesh', 7] : gold(5.4 + (26 - py) * 0.03);
      return ell(px, py, 32, 26, 22.5, 20) > 0.9 ? wood(1.4) : wood(3 + (26 - py) * 0.06);
    }
    // Kasten
    if (py >= 39.5 && py <= 56 && ax <= 22) {
      if (py < 41.4) return gold(4.8);
      if (ax > 13 && ax < 16.6) return Math.round(px * 2) % 7 === 0 && Math.abs(py - 48) < 0.9 ? ['flesh', 7] : gold(5.2);
      if (py > 52.4 && ax > 17.4) return gold(4.4);
      if (ax > 21) return wood(1.3);
      return wood(3.1) ;
    }
    // Krallenbeine
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const bx = 32 + sx * (10 + k * 9);
      if (cap(px, py, bx, 55, bx + sx * 3, 61.5, 2.2, 1.2)) return ['wood', 1.8 - l * 0.6 + n * 0.4];
      if (py > 60.5 && py < 63 && Math.abs(px - (bx + sx * 3)) < 3 && Math.floor(px * 1.3) % 2 === 0) return ['flesh', 5];
    }
    return null;
  }, 128);
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
  'Ä': '10001/00000/01110/10001/11111/10001/10001', 'Ö': '10001/00000/01110/10001/10001/10001/01110', 'Ü': '10001/00000/10001/10001/10001/10001/01110',
  0: '01110/10001/10011/10101/11001/10001/01110', 1: '00100/01100/00100/00100/00100/00100/01110', 2: '01110/10001/00001/00010/00100/01000/11111',
  3: '11110/00001/00001/01110/00001/00001/11110', 4: '00010/00110/01010/10010/11111/00010/00010', 5: '11111/10000/11110/00001/00001/10001/01110',
  6: '00110/01000/10000/11110/10001/10001/01110', 7: '11111/00001/00010/00100/01000/01000/01000', 8: '01110/10001/10001/01110/10001/10001/01110',
  9: '01110/10001/10001/01111/00001/00010/01100',
  '.': '00000/00000/00000/00000/00000/01100/01100', '!': '00100/00100/00100/00100/00100/00000/00100', '?': '01110/10001/00001/00010/00100/00000/00100',
  ':': '00000/01100/01100/00000/01100/01100/00000', '-': '00000/00000/00000/11111/00000/00000/00000', '→': '00000/00100/00010/11111/00010/00100/00000', '←': '00000/00100/01000/11111/01000/00100/00000', ' ': '00000/00000/00000/00000/00000/00000/00000'
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
// 0.31.6 (Nutzer: „Schriftzüge unterschiedlich, bei Brücke z. B. mit Symbol“): Farbe/Art der Schrift je nach Schildstil (INKS), optionales Symbol über dem Text (o.sym)
// 0.47.8 (Nutzer: „alle Schriften kontrastarm“): immer helle Schrift mit dunkler Kontur (auf Wänden zusätzlich dunkle Platte), Farbton je Stil
const INKS = { // fill: [Material, Stufe], edge: [Material, Stufe] (Kontur)
  kreide: { fill: ['ice', 7], edge: ['ceil', 0] }, gold: { fill: ['glow', 6.4], edge: ['ceil', 0] }
};
const INK_OF = { wood: 'gold', dark: 'gold', stone: 'kreide', iron: 'kreide', moss: 'kreide', arrow: 'gold', arch: 'kreide', banner: 'gold', small: 'kreide' };
const SYMS = {
  bruecke: ['11111111111', '11100000111', '11000000011', '10000000001', '10000000001', '01010101010'],
  faehre: ['00000100000', '00001110000', '00011111000', '00111111100', '00000100000', '11111111111', '01111111110', '00111111100'],
  schaedel: ['011111110', '111111111', '110111011', '110111011', '011111110', '001111100', '001010100'],
  wuerfel: ['111111101111111', '101110101111111', '111111101111111', '111011101110111', '111111101111111', '101110101111101', '111111101111111'], // zwei weiße Würfel, Augen = Löcher (dunkel durch Kontur)
  schluessel: ['0111000000', '1000100000', '1000100000', '0111011111', '0000010101', '0000010101'],
  ab: ['0011100', '0011100', '0011100', '1111111', '0111110', '0011100', '0001000'], // 0.47.15: Wegweiser an Treppen: Pfeil hinab/hinauf
  auf: ['0001000', '0011100', '0111110', '1111111', '0011100', '0011100', '0011100']
};
// 0.32.1 (Nutzer: „unterschiedliche Schriftarten im Spiel“): Schriftarten der Wand- und Türtitel (FONTMODES): rad = Strichdicke, xs/ys = Breite/Höhe der Buchstaben, shear = Schräge, wave = Wackeln der Zeile; Objektfeld font überschreibt die Schrift des Schildstils
export const FONTMODES = { block: { rad: 0.6 }, bold: { rad: 0.85 }, thin: { rad: 0.5 }, slant: { rad: 0.62, shear: -0.3 }, wide: { rad: 0.62, xs: 1.3 }, tall: { rad: 0.6, ys: 1.3 }, wavy: { rad: 0.62, wave: 0.5 }, shadow: { rad: 0.62 } };
function genPlaque(title, kind, styleName, seed, clipY = PLQ, sym = null, fontName = null) { // clipY (0.22.1): nichts unterhalb zeichnen (Türsturz: Schrift läuft nicht ins Leere)
  const K = kind === 'wall' ? 2 : 1, N = PLQ * K, buf = new Uint8Array(N * N).fill(255); // 0.47.8 (Nutzer: Schriften unscharf): Wandschilder in doppelter Auflösung (384²); der Raycaster liest die Größe aus dec.w
  const lines = String(title || '').toUpperCase().split('|').slice(0, 2).filter(Boolean);
  const fm = FONTMODES[fontName] || FONTMODES[(PLAQUE_STYLES[styleName] || {}).font] || FONTMODES.block, fxs = fm.xs || 1, fys = fm.ys || 1;
  const maxC = Math.max(1, ...lines.map((l) => [...l].slice(0, 8).length)), cw = 6 * fxs;
  // 0.23.4 (Nutzer: aus der Nähe zu groß, unlesbar): Textblock höchstens ca. die halbe Wandbreite (vorher bis 75 %); Stil (Blutschmiere) bleibt
  const s = (kind === 'door' ? Math.max(1.6, Math.min(2.0, 86 / (cw * maxC))) : Math.max(1.7, Math.min(2.9, 112 / (cw * maxC)))) * K; // 0.32.1: kurze Wandtitel (BRÜCKE) größer, Nutzer: kaum lesbar // Türsturz (0.23.6): Schrift liegt innerhalb des Türschilds
  const lh = Math.round(9 * s * fys), th = lines.length ? Math.round(lines.length * lh - 2 * s) : 0;
  const SG = sym && SYMS[sym] ? SYMS[sym] : null, ss = lines.length ? s * 1.3 : s * 2.2, symH = SG ? Math.round(SG.length * ss + (lines.length ? 5 * s : 0)) : 0; // ohne Text: Symbol allein, größer und mittig
  const ty0 = kind === 'door' ? Math.max(30, Math.round(52 - (th + symH) / 2)) + symH : Math.round(N / 2 - th / 2 + symH / 2); // 0.47.14 (Nutzer: Türschrift zu groß, ragt über den Rahmen): Tür-Block mittig in der oberen Türfüllung (y 28–86, Schloss ab ca. y 96)
  // 0.19.11 (Nutzer: „gruseliger, nicht aus Druckschrift“): von Hand geschmiert – jeder Buchstabe leicht schief und versetzt, Striche aus runden Pinselflecken mit schwankender Dicke,
  // dicke Tropfen mit Kuppe, dunkle Gerinnsel und feuchte Lichter. Gleiche Lesbarkeit (gleiche Buchstabenraster), aber keine Blockschrift mehr.
  const mask = new Uint8Array(N * N);
  const stamp = (cx, cy, rad) => {
    const x0 = Math.floor(cx - rad - 1), x1 = Math.ceil(cx + rad + 1), y0 = Math.floor(cy - rad - 1), y1 = Math.ceil(cy + rad + 1);
    for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) if (X >= 0 && Y >= 0 && X < N && Y < N && Math.abs(X + 0.5 - cx) <= rad && Math.abs(Y + 0.5 - cy) <= rad) mask[Y * N + X] = 1; // 0.31.5: eckige Druckbuchstaben
  };
  if (SG) { // Symbol mittig über dem Text
    const sx0 = Math.round(N / 2 - SG[0].length * ss / 2), sy0 = ty0 - symH + (kind === 'door' ? 0 : 0);
    SG.forEach((row, r) => [...row].forEach((v, c) => { if (v === '1') stamp(sx0 + (c + 0.5) * ss, sy0 + (r + 0.5) * ss, ss * 0.52); }));
  }
  lines.forEach((ln, li) => {
    const chars = [...ln].slice(0, 8), w = chars.length * cw * s - s, lx = Math.round(N / 2 - w / 2), ly = ty0 + li * lh;
    chars.forEach((ch, ci) => {
      const g = (FONT[ch] || FONT[' ']).split('/');
      const gcx = lx + ci * cw * s + 2.5 * s * fxs, gcy = ly + 3.5 * s;
      const rot = 0, shear = fm.shear || 0, dy0 = fm.wave ? Math.sin(ci * 1.9 + seed) * s * fm.wave : 0, sc = 1; // 0.31.5 (Nutzer: schwarz, nicht verlaufend, Druckbuchstaben): keine Schmiere mehr // 0.22.1: ruhiger (Nutzer: aus der Nähe zu undeutlich)
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (let rw = 0; rw < 7; rw++) for (let c = 0; c < 5; c++) {
        if (g[rw][c] !== '1') continue;
        let ox = (c - 2) * s * sc * fxs, oy = (rw - 3) * s * sc * fys;
        ox += shear * oy;
        const jx = 0, jy = 0;
        const cx = gcx + ox * cr - oy * sr + jx, cy = gcy + ox * sr + oy * cr + dy0 + jy;
        stamp(cx, cy, s * (kind === 'wall' ? Math.min(fm.rad, 0.56) : fm.rad)); // 0.47.8: auf Wandschildern höchstens ein Rasterpunkt Strichbreite – M, A, R verschmolzen vorher zu Klumpen
      }
    });
  });
  // Tropfen: dicke Streifen nach unten mit Kuppe am Ende
  const drip = new Uint8Array(N * N);
  for (let y = 0; y < N - 2; y++) for (let x = 0; x < N; x++) {
    if (true) continue; // 0.31.5: keine Tropfen
    if (!mask[y * N + x] || mask[(y + 1) * N + x] || hash(x, y, seed + 11) < 0.955) continue;
    const lastLine = y >= ty0 + lh * (lines.length - 1), lmax = lastLine ? 10 : Math.max(2, 2 * s - 1); // 0.22.1: Tropfen kürzer, nie in die nächste Zeile
    const len = 2 + Math.floor(hash(x, y, seed + 12) * lmax), wd = hash(x, y, seed + 13) > 0.6 ? 1 : 0;
    for (let k = 1; k <= len && y + k < N; k++) for (let d = 0; d <= wd; d++) { const X = x + d; if (X < N && !mask[(y + k) * N + X]) drip[(y + k) * N + X] = 1 + Math.min(2, Math.floor(k / (len / 3))); }
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1 + wd; xx++) { const X = x + xx, Y = y + len + 1 + yy; if (X >= 0 && X < N && Y >= 0 && Y < N && !mask[Y * N + X]) drip[Y * N + X] = 3; }
  }
  for (let i = 0; i < N * N; i++) if (drip[i]) mask[i] = 1;
  if (clipY < PLQ) for (let i = clipY * N; i < N * N; i++) { mask[i] = 0; drip[i] = 0; }
  // 0.47.14 (Nutzer: Irrlichtschild wirkt wie Neonreklame, Türschrift passt nicht zur Tür): Schrift sitzt auf einem Schild aus dem Material des Stils
  // (Holz, Stein, Eisen, Moosbrett) mit Rand, Nägeln bzw. Nieten. Helle Bretter: dunkle aufgemalte Schrift ohne Kontur; dunkle Platten: Kreideschrift (Grau statt Blau/Gold).
  const BOARDS = { wood: ['wood', 4.4, 'paint', true], dark: ['wood', 2.0, 'chalk', true], stone: ['stone', 4.6, 'paint', false], iron: ['iron', 2.8, 'chalk', true], moss: ['wood', 3.8, 'paint', true, true], arrow: ['wood', 4.4, 'paint', true], arch: ['stone', 4.2, 'paint', false], banner: ['moss', 3.6, 'paint', false], small: ['wood', 4.4, 'paint', true] };
  const special = sym === 'wuerfel' && !lines.length; // Würfeltür: Elfenbein auf Eisen
  const [bMat, bSh, inkMode, studs, mossy] = BOARDS[special ? 'iron' : styleName] || BOARDS.wood;
  const ink = special ? { fill: ['glow', 6.3], edge: ['ceil', 0] } : inkMode === 'chalk' ? { fill: ['stone', 6.4], edge: ['ceil', 0] } : { fill: [bMat, 0.15], edge: null };
  const ol = ink.edge ? (kind === 'wall' ? 3 : 2) : 0; // Kontur nur bei heller Schrift
  if (lines.length || SG) { // Schild hinter Schrift und Symbol
    let bx0 = N, by0 = N, bx1 = -1, by1 = -1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (mask[y * N + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (bx1 >= 0) {
      const padX = 9 * K + Math.round(s), padY = 7 * K + Math.round(s * 0.8), rr = 6 * K, bw = 2 * K;
      const px0 = Math.max(0, bx0 - padX), px1 = Math.min(N - 1, bx1 + padX), py0 = Math.max(0, by0 - padY), py1 = Math.min(N - 1, by1 + padY);
      const studAt = [[px0 + 5 * K, py0 + 5 * K], [px1 - 5 * K, py0 + 5 * K], [px0 + 5 * K, py1 - 5 * K], [px1 - 5 * K, py1 - 5 * K]];
      for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
        const cx0 = x < px0 + rr ? px0 + rr - x : x > px1 - rr ? x - (px1 - rr) : 0, cy0 = y < py0 + rr ? py0 + rr - y : y > py1 - rr ? y - (py1 - rr) : 0;
        if (cx0 && cy0 && Math.hypot(cx0, cy0) > rr) continue; // runde Ecken
        const edge = x < px0 + bw || x > px1 - bw || y < py0 + bw || y > py1 - bw || (cx0 && cy0 && Math.hypot(cx0, cy0) > rr - bw);
        let sh = bSh + (hash(x >> 2, y >> 1, seed + 22) - 0.5) * 0.7 + (bMat === 'wood' ? (hash(x >> 5, y, seed + 23) - 0.5) * 0.6 : 0); // Maserung bzw. Körnung
        if (edge) sh = bSh - 2.0; else if (x < px0 + 2 * bw || y < py0 + 2 * bw) sh += 0.6; else if (x > px1 - 2 * bw || y > py1 - 2 * bw) sh -= 0.5;
        buf[y * N + x] = P(bMat, sh);
        if (mossy && !edge && y - py0 < 8 * K && hash(x >> 1, y >> 1, seed + 31) < 0.55 * (1 - (y - py0) / (8 * K))) buf[y * N + x] = P('moss', 3.2 + hash(x, y, seed + 32) * 1.2); // Moos am oberen Rand
        if (studs && py1 - py0 > 22 * K) for (const [sx, sy] of studAt) { const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy); if (d <= 1.7 * K) buf[y * N + x] = P('iron', d <= 1 * K ? 5.2 : 2.4); } // Nägel/Nieten
      }
    }
  }
  if (ol) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (mask[y * N + x]) continue;
    let near = false;
    for (let dy = -ol; dy <= ol && !near; dy++) for (let dx = -ol; dx <= ol; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && mask[Y * N + X]) { near = true; break; } }
    if (near) buf[y * N + x] = P(ink.edge[0], ink.edge[1]); // Kontur, damit die helle Schrift auf dem Schild lesbar bleibt
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!mask[y * N + x]) continue;
    buf[y * N + x] = P(ink.fill[0], ink.fill[1]);
  }
  return { w: N, h: N, data: buf, noWrap: true };
}
// Rahmen einer offenen Tür (Sprite, 1×1 Feld): Pfosten, Sturz (mit Raumname), Türblatt nach innen aufgeklappt an der linken Seite.
function genDoorFrame(title, styleName, seed, look) { // 0.32.2 (Nutzer: Archivtür zu grau, offen braun): Rahmen/Blatt im Material der geschlossenen Tür
  const t = mk(255);
  const FM = { stein: 'stone', eisen: 'iron', gitter: 'iron' }[look] || 'wood';
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  const st = PLAQUE_STYLES[styleName] || PLAQUE_STYLES.wood;
  const lh = title ? Math.ceil((plaqueMetrics(title, 'door', st).h + 12) / 3) : 7; // Höhe des Sturzes
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const post = x <= 4 || x >= 59, lintel = y < lh;
    if (!post && !lintel) continue;
    const edge = (post && (x === 4 || x === 59)) || (lintel && y === lh - 1);
    set(x, y, P(FM, edge ? 1.2 : 2.8 + hash(x >> 1, y >> 3, seed) * 1.2));
  }
  for (let x = 5; x <= 17; x++) { // Türblatt: an der Angel (x=5) volle Höhe, zur freien Kante hin perspektivisch kürzer
    const k = (x - 5) / 12, top = Math.round(lh + k * 7), bot = Math.round(63 - k * 6);
    for (let y = top; y <= bot; y++) {
      const v01 = (y - top) / (bot - top);
      let v = P(FM, 3.6 - k * 1.4 + hash(x, y >> 3, seed + 2) * 0.9);
      if ((v01 > 0.12 && v01 < 0.2) || (v01 > 0.8 && v01 < 0.88)) v = P('iron', 3.4 - k);
      if (x === 17) v = P(FM, 5.2); // helle Vorderkante des Blatts
      if (y === top || y === bot) v = P(FM, 1.2);
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
    const bt = genPlaque(title, 'door', styleName, 133, lh * 3 - 2);
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
  if (o.type === 'stairs' && o.look === 'tuer') return cachedTex(tex, 'deco', 'tavernentuer', () => genDeco('tavernentuer', 171, true)); // 0.43.1: Taverneneingang als Holztür mit Schild
  if (o.type === 'stairs') return o.look === 'down' ? tex.sprites.stairsDown : o.look === 'up' ? tex.sprites.stairsUp : o.look === 'path' ? tex.sprites.arch : tex.sprites.portal;
  return o.look === 'down' ? tex.sprites.stairsDown : o.look === 'up' ? tex.sprites.stairsUp : o.look === 'path' ? tex.sprites.arch : tex.sprites.runeStone;
}
// 0.23.0: Wandschmuck (Nutzerwunsch: gelegentlich Wandnischen, Gemälde, Kritzeleien). 192×192 wie Tafeln, transparent außerhalb.
function genDeco(kind, seed, full = true) {
  if (kind === 'nischeleer') { kind = 'niche'; full = false; } // 0.33.0: leere Wandnische als Schmuck
  const N = PLQ, buf = new Uint8Array(N * N).fill(255);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < N && y < N) buf[y * N + x] = v; };
  if (kind === 'niche') { // Nische: dunkle, gemauerte Vertiefung mit Bogen; full = es liegt etwas darin
    for (let y = 70; y <= 150; y++) for (let x = 56; x <= 136; x++) {
      const top = y < 96, r = Math.hypot((x - 96) / 40, (y - 96) / 26);
      if (top && r > 1) continue;
      const rim = top ? r > 0.86 : (x < 62 || x > 130 || y > 144);
      set(x, y, rim ? P('stone', 4.6 + hash(x >> 2, y >> 2, seed) * 1.2) : P('ceil', 0.4 + (y - 70) / 140 + hash(x >> 1, y >> 1, seed + 1) * 0.4));
    }
    for (let x = 62; x <= 130; x++) for (let y = 138; y <= 143; y++) set(x, y, P('stone', 2.4 + (y - 138) * 0.25)); // Boden der Nische
    if (full) { // kleines Bündel und ein Fläschchen
      for (let y = 118; y <= 138; y++) for (let x = 74; x <= 104; x++) { const r = Math.hypot((x - 89) / 15, (y - 130) / 10); if (r <= 1) set(x, y, P('wood', 4.6 - r * 1.6 + hash(x >> 1, y, seed + 4) * 0.6)); }
      for (let y = 112; y <= 138; y++) for (let x = 108; x <= 122; x++) { const bottle = Math.abs(x - 115) <= (y < 122 ? 2 : 6); if (bottle) set(x, y, P(y < 122 ? 'wood' : 'blood', y < 122 ? 3 : 5.6 - Math.abs(x - 113) * 0.3)); }
    }
  } else if (kind === 'aushang') { // 0.42.0: Aushang: viele verschieden große, leicht schiefe Zettel mit Nadel, Schatten und Schriftzeilen direkt auf der Holzwand
    const notes = [ // [Mitte x, Mitte y, Breite, Höhe, Winkel, Material, Helligkeit, Siegel]
      [40, 60, 36, 46, -0.06, 'glow', 6.2, 0], [84, 50, 28, 32, 0.05, 'stone', 6.9, 0], [126, 66, 40, 52, -0.03, 'glow', 5.8, 1],
      [165, 54, 22, 28, 0.09, 'stone', 6.6, 0], [24, 112, 18, 24, -0.08, 'glow', 6.6, 0], [58, 118, 26, 28, 0.07, 'stone', 6.8, 0],
      [84, 86, 16, 20, -0.1, 'glow', 6.4, 0], [100, 114, 46, 34, -0.04, 'glow', 5.9, 0], [148, 124, 30, 38, 0.04, 'stone', 6.7, 1], [176, 100, 18, 22, 0.06, 'glow', 6.3, 0]];
    notes.forEach(([cx, cy, nw, nh, a, mat, sh, seal], ni) => {
      const ca = Math.cos(a), sa = Math.sin(a), R = Math.ceil(Math.hypot(nw, nh) / 2) + 4;
      const loc = (x, y) => { const dx = x - cx, dy = y - cy; return [dx * ca + dy * sa, -dx * sa + dy * ca]; };
      for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) { // Schatten (nach unten rechts versetzt), nur auf freier Wand
        const [u, v] = loc(x - 2, y - 3);
        if (Math.abs(u) <= nw / 2 && Math.abs(v) <= nh / 2 && buf[y * N + x] === 255) set(x, y, P('wood', 0.5));
      }
      for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
        const [u, v] = loc(x, y);
        if (Math.abs(u) > nw / 2 || Math.abs(v) > nh / 2) continue;
        const edge = Math.abs(u) > nw / 2 - 1.2 || Math.abs(v) > nh / 2 - 1.2;
        let c = P(mat, sh - (edge ? 0.9 : 0) - (v + nh / 2) / nh * 0.5 + hash(x >> 1, y >> 1, seed + ni) * 0.5);
        const row = v + nh / 2 - 7; // Schriftzeilen: erste dick (Überschrift), dann dünne Zeilen mit Lücken
        if (row >= 0 && v < nh / 2 - 5 && Math.abs(u) < nw / 2 - 4) {
          const k = Math.floor(row / 4.5), within = row - k * 4.5, last = v > nh / 2 - 11;
          const thick = k === 0 ? within < 2.6 : within < 1.3;
          if (thick && hash((u + 99) >> 2, k, seed + ni * 7) > (k === 0 ? 0.05 : 0.22) && !(last && u > 0)) c = P('ceil', k === 0 ? 0.3 : 0.9);
        }
        if (v > nh / 2 - 6 && u > nw / 2 - 6 && (u - (nw / 2 - 6)) + (v - (nh / 2 - 6)) > 6) c = P('wood', 2.4); // umgeknickte Ecke
        set(x, y, c);
      }
      const [px, py] = [Math.round(cx - sa * (-nh / 2 + 3)), Math.round(cy + ca * (-nh / 2 + 3))]; // Nadel oben mittig
      for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) if (Math.hypot(x - px, y - py) <= 2.2) set(x, y, P('iron', x < px && y < py ? 6.4 : 2.6));
      if (seal) for (let y = cy + 6; y <= cy + 18; y++) for (let x = cx - 6; x <= cx + 6; x++) if (Math.hypot(x - cx, y - cy - 12) <= 5.6) set(x, y, P('blood', 4.6 - Math.hypot(x - cx + 1.5, y - cy - 13.5) * 0.25)); // Wachssiegel
    });
  } else if (kind === 'rohr') { // 0.33.0: Abflussrohr: senkrechtes Eisenrohr mit Schellen, grünem Belag und Tropfspur
    for (let y = 0; y < N; y++) for (let x = 84; x <= 108; x++) {
      const cx = (x - 96) / 12, sh = 5.2 - (cx + 0.3) * 2.4 - Math.abs(cx) * 0.8;
      const band = (y % 70) > 36 && (y % 70) < 44 && x > 80 && x < 112;
      set(x, y, band ? P('iron', 3.6 + hash(x >> 1, y >> 1, seed) * 0.5) : P('iron', Math.max(0.8, sh + hash(x >> 2, y >> 2, seed + 1) * 0.7)));
    }
    for (let y = 0; y < N; y++) for (let x = 112; x <= 118; x++) if (y > 60 && hash(0, y >> 3, seed + 3) > 0.35 + (x - 112) * 0.05) set(x, y, P('moss', 2.4 + (y / N) * 1.6)); // Algenspur
    for (let y = 150; y < N; y++) for (let x = 76; x <= 116; x++) if (Math.hypot((x - 96) / 20, (y - 176) / 14) <= 1) set(x, y, P('moss', 1.4 + hash(x >> 1, y >> 1, seed + 5) * 0.8)); // Pfütze
  } else if (kind === 'gitter') { // 0.33.0: kniehoher Gitterschacht dicht über dem Boden
    for (let y = 128; y <= 184; y++) for (let x = 54; x <= 138; x++) {
      const rim = x < 60 || x > 132 || y < 134 || y > 178, bar = !rim && ((x - 60) % 11) < 3.4;
      set(x, y, rim ? P('iron', 3.4 + hash(x >> 2, y >> 2, seed) * 0.8) : bar ? P('iron', 4.6 - ((x - 60) % 11) * 0.25) : P('ceil', 0.1 + hash(x >> 1, y >> 1, seed + 1) * 0.3));
    }
  } else if (kind === 'moos') { // 0.48.0: Moosbewuchs: unregelmäßige Polster, Tropfsträhnen von oben, helle Spitzen
    const cs = [[36, 46, 34], [112, 72, 44], [158, 34, 26], [66, 134, 38], [142, 150, 32], [100, 14, 22]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let m = 0;
      for (const [cx, cy, r] of cs) { const d = Math.hypot(x - cx, (y - cy) * 1.15) / r + (hash(x >> 1, y >> 1, seed + 7) - 0.5) * 0.55; if (d < 1) m = Math.max(m, 1 - d); }
      if (m > 0.04) set(x, y, P('moss', 1.5 + m * 2.6 + hash(x, y, seed + 8) * 0.8));
    }
    for (let x = 6; x < N - 6; x += 3) { const h0 = hash(x >> 2, 3, seed + 9); if (h0 < 0.55) continue; const len = 14 + Math.floor(h0 * 60); for (let y = 0; y < len; y++) { const w = y < len - 6 ? 1 : 0; for (let k = 0; k <= w; k++) set(x + k, y, P('moss', 1.8 + (y / len) * 1.4 + hash(x, y, seed + 10) * 0.6)); } }
  } else if (kind === 'blut') { // 0.48.0: Blutspritzer mit Schleifspur zum Boden
    for (let y = 70; y < N; y++) { const t = (y - 70) / (N - 70), cx = 96 + Math.sin(t * 3.1) * 16 + t * 14, w = 8 - t * 5; for (let x = Math.floor(cx - w - 2); x <= cx + w + 2; x++) { const e = Math.abs(x - cx) - w + (hash(x, y >> 1, seed + 1) - 0.5) * 5; if (e < 0) set(x, y, P('blood', 2.2 + hash(x >> 2, y >> 2, seed + 2) * 0.5 + t * 0.4)); } }
    for (let i = 0; i < 70; i++) { const a = hash(i, 1, seed) * 6.283, d = 10 + hash(i, 2, seed) ** 1.5 * 66, r = 0.8 + hash(i, 3, seed) * 2.6, cx = 96 + Math.cos(a) * d * 1.15, cy = 78 + Math.sin(a) * d * 0.85, tail = Math.floor(r * (1 + hash(i, 5, seed) * 3)); for (let y = Math.floor(cy - r); y <= cy + r + tail; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const rr = y > cy ? r * (1 - (y - cy) / (r + tail + 1)) : r; if (Math.hypot(x - cx, Math.min(0, y - cy)) <= Math.max(0.6, rr)) set(x, y, P('blood', 2.2 + hash(x >> 1, y >> 1, seed + 4) * 0.6 + (y - cy) * 0.02)); } }
    for (let y = 56; y < 100; y++) for (let x = 78; x < 116; x++) { const dx = (x - 97) / 13, dy = (y - 78) / 15, a = Math.atan2(dy, dx), rim = 1 + Math.sin(a * 7 + hash(1, 1, seed) * 6) * 0.22 + Math.sin(a * 13) * 0.12; if (Math.hypot(dx, dy) <= rim) set(x, y, P('blood', 1.9 + hash(x >> 2, y >> 2, seed + 5) * 0.5 + (y - 56) * 0.012)); }
  } else if (kind === 'kratzer') { // 0.48.0: drei Krallenspuren im Stein: dunkle Rille, helle Bruchkanten
    for (let k = 0; k < 3; k++) { const x0 = 66 + k * 26, y0 = 30 + k * 5; for (let i = 0; i < 110; i++) { const x = x0 + i * 0.34 + Math.sin(i * 0.09 + k) * 1.6, y = y0 + i * 1.0, w = i < 10 ? 0.8 + i / 10 : i > 96 ? (110 - i) / 14 + 0.6 : 2.6 + Math.sin(i * 0.3 + k) * 0.3; for (let dx = -4; dx <= 4; dx++) { const ad = Math.abs(dx); if (ad > w + 1.2) continue; set(Math.round(x) + dx, Math.round(y), ad <= w * 0.55 ? P('stone', 0.9 + hash(i, k, seed) * 0.5) : ad <= w + 0.2 ? P('stone', 3 + hash(i, k + 3, seed)) : P('stone', 7.2 - hash(i, k + 6, seed) * 0.8)); } } }
  } else if (kind === 'painting') { // Gemälde: Goldrahmen, düstere Landschaft mit Turm
    for (let y = 40; y <= 140; y++) for (let x = 36; x <= 156; x++) {
      const fr = x < 46 || x > 146 || y < 50 || y > 130;
      if (fr) { set(x, y, P('glow', 3.6 + ((x + y) % 7 < 2 ? 1.6 : 0) + hash(x >> 2, y >> 2, seed) * 0.6)); continue; }
      const hz = 98 + Math.sin(x * 0.07 + seed) * 6, tower = Math.abs(x - 118) < 7 && y > 64 || (Math.abs(x - 118) < 11 && y > 60 && y < 70);
      set(x, y, tower && y < hz + 12 ? P('stone', 0.8) : y < hz ? P('ceil', 2.2 + (y - 50) / 40 + hash(x >> 3, y >> 3, seed + 2) * 0.5) : P('moss', 1.8 + hash(x >> 2, y >> 2, seed + 3) * 1.2));
      if (Math.hypot(x - 72, y - 66) < 7) set(x, y, P('flesh', 6.2)); // Mond
    }
  } else if (kind === 'bildSee' || kind === 'bildGnom' || kind === 'bildWuerfel') { // 0.32.1: Bilder für die Blockhütte (Holzrahmen)
    const seg = (x, y, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - x0 - dx * t, y - y0 - dy * t); };
    for (let y = 40; y <= 140; y++) for (let x = 36; x <= 156; x++) {
      if (x < 46 || x > 146 || y < 50 || y > 130) { set(x, y, P('wood', 3.2 + (x < 40 || x > 152 || y < 44 || y > 136 ? -1 : 0.4) + hash(x >> 2, y >> 2, seed) * 0.6)); continue; }
      let c;
      if (kind === 'bildSee') {
        const t = (y - 50) / 80, hz = 98;
        if (y < hz) c = P('blood', 2.2 + t * 4 + hash(x >> 3, y >> 3, seed + 2) * 0.4); else c = P('ice', 1.6 + hash(x >> 2, y >> 1, seed + 3) * 1.1);
        if (Math.hypot(x - 100, y - 94) < 8) c = P('glow', 7);
        else if (y >= hz && Math.abs(x - 100) < 6 - (y - hz) * 0.12) c = P('glow', 4.6 + hash(x, y >> 1, seed + 4));
        const stems = seg(x, y, 66, 128, 74, 80);
        if (stems < 2.2) c = P('wood', 1.6);
        else if (seg(x, y, 74, 80, 52, 90) < 1.8 || seg(x, y, 74, 80, 98, 88) < 1.8 || seg(x, y, 74, 80, 76, 66) < 1.8 || seg(x, y, 74, 80, 60, 70) < 1.8 || seg(x, y, 74, 80, 90, 70) < 1.8) c = P('moss', 1.4);
      } else if (kind === 'bildGnom') {
        c = P('moss', 2 + hash(x >> 2, y >> 2, seed + 1) * 0.6);
        if (Math.abs(x - 96) < (y - 54) * 0.45 && y > 54 && y < 90) c = P('blood', 4.4 - (x - 96) * 0.02);
        if (Math.hypot((x - 96) / 15, (y - 99) / 14) < 1) c = P('wood', 5.6);
        if (Math.hypot((x - 96) / 12, (y - 117) / 13) < 1 && y > 104) c = P('stone', 6.4 + hash(x >> 1, y >> 1, seed + 5) * 0.4);
        if (Math.hypot(x - 90, y - 97) < 2 || Math.hypot(x - 102, y - 97) < 2) c = P('ceil', 0.3);
        if (Math.hypot(x - 96, y - 103) < 3) c = P('wood', 4.2);
      } else {
        c = P('blood', 2 + hash(x >> 3, y >> 3, seed + 1) * 0.5);
        const die = (x0, y0) => { if (x >= x0 && x < x0 + 30 && y >= y0 && y < y0 + 30) { c = P('stone', 7); for (const [u, v] of [[0.28, 0.2], [0.72, 0.2], [0.28, 0.5], [0.72, 0.5], [0.28, 0.8], [0.72, 0.8]]) if (Math.hypot(x - x0 - u * 30, y - y0 - v * 30) < 3) c = P('ceil', 0.3); } };
        die(62, 88); die(100, 66);
      }
      set(x, y, c);
    }
  } else if (kind === 'tavernentuer') { // 0.43.1: Tür der Taverne in einer Holztäfelung (ganze Wandfläche) mit Namensschild darüber
    const dx0 = 60, dx1 = 132, dy0 = 74;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v;
      const inDoor = x >= dx0 && x <= dx1 && y >= dy0 && y < N - 8;
      if (inDoor) { // Türblatt: senkrechte Bohlen, zwei Eisenbänder, Rahmen
        const fr = x < dx0 + 4 || x > dx1 - 4 || y < dy0 + 4;
        v = P('wood', fr ? 1.6 + hash(x >> 1, y >> 1, seed) * 0.5 : 2.5 + (((x - dx0) >> 3) % 2) * 0.5 + hash(x >> 3, y, seed + 2) * 0.5);
        if (!fr && (x - dx0) % 8 === 0) v = P('wood', 1.2);
        for (const by of [dy0 + 22, dy0 + 70]) if (!fr && y >= by && y < by + 5) v = P('iron', 3.2 + hash(x >> 2, y, seed + 3) * 0.6);
      } else if (x >= dx0 - 8 && x <= dx1 + 8 && y >= dy0 - 8 && y < N - 8) { // Rahmen um die Tür
        v = P('wood', 5.6 + hash(x >> 1, y >> 1, seed + 4) * 0.6);
      } else if (y >= N - 8 && x >= dx0 - 10 && x <= dx1 + 10) { // Steinschwelle
        v = P('stone', 4.4 + hash(x >> 2, y >> 2, seed + 5) * 1.2);
      } else { // Holztäfelung
        const rail = y < 6 || y > N - 7 || (y >= 62 && y < 68) || x < 5 || x > N - 6;
        const lower = y >= 68;
        const px = x % 32, py = lower ? (y - 68) % 56 : y;
        const inset = lower ? (px > 4 && px < 28 && py > 5 && py < 50) : false;
        v = P('wood', rail ? 2.6 + hash(x >> 1, y, seed + 6) * 0.5 : inset ? 3.0 + hash(x >> 3, y >> 1, seed + 7) * 0.6 : 4.2 + (((x >> 4) % 2) * 0.5) + hash(x >> 4, y, seed + 8) * 0.7);
        if (lower && !rail && !inset && (px === 4 || px === 28 || py === 5 || py === 50)) v = P('wood', 1.8);
        if (!lower && !rail && x % 16 === 0) v = P('wood', 2.8);
      }
      set(x, y, v);
    }
    for (let a = 0; a < 5; a++) for (let b2 = 0; b2 < 5; b2++) if ((a - 2) * (a - 2) + (b2 - 2) * (b2 - 2) <= 5) set(dx1 - 14 + a, 132 + b2, P('glow', 6.2 - (a + b2) * 0.1)); // Messingklinke
    for (let y = dy0 + 18; y < dy0 + 36; y++) for (let x = dx0 + 6; x < dx0 + 11; x++) set(x, y, P('iron', 3.6)); // Scharnier
    paintPlaque(buf, N, 'GOLDENER|EBER', 'door', 'dark', seed + 9); // Namensschild oben auf der Täfelung
  } else { // graffiti: grob geritzte Figur, Strichliste und Pfeil
    const scratch = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); set(x, y, P('stone', 6.6)); set(x + 1, y, P('stone', 6.6)); set(x, y + 1, P('stone', 0.6)); } };
    scratch(70, 60, 70, 110); scratch(70, 75, 55, 92); scratch(70, 75, 85, 92); scratch(70, 110, 58, 135); scratch(70, 110, 82, 135); // Figur
    for (let a = 0; a < 24; a++) { const x = 70 + Math.cos(a / 24 * Math.PI * 2) * 9, y = 52 + Math.sin(a / 24 * Math.PI * 2) * 9; set(Math.round(x), Math.round(y), P('stone', 6.6)); }
    for (let i = 0; i < 4; i++) scratch(104 + i * 8, 64, 104 + i * 8, 92); scratch(100, 86, 136, 70); // Strichliste
    scratch(104, 120, 140, 120); scratch(140, 120, 130, 112); scratch(140, 120, 130, 128); // Pfeil
  }
  return { w: N, h: N, data: buf, noWrap: true };
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
    if ((o.type === 'sign' && o.face != null && o.deco) || (o.type === 'niche' && o.face != null)) { // Wandschmuck / Nische
      const wx = o.x + DX[o.face], wy = o.y + DY[o.face], k = o.type === 'niche' ? 'niche' : o.deco, full = o.type !== 'niche' || !o.taken;
      if (wallAt(wx, wy)) out.set((wy * w + wx) * 4 + (o.face + 2) % 4, cachedTex(tex, 'deco', k + (full ? 1 : 0), () => genDeco(k, 171, full)));
      continue;
    }
    if (o.type === 'sign' && o.face != null && (o.title || o.sym) && !(o.textless && !o.sym)) {
      const wx = o.x + DX[o.face], wy = o.y + DY[o.face];
      if (wallAt(wx, wy)) out.set((wy * w + wx) * 4 + (o.face + 2) % 4, cachedTex(tex, 'plaques', 'w:' + styleFor(o) + (o.font || '') + (o.sym || '') + (o.textless ? '#' : o.title), () => genPlaque(o.textless ? '' : o.title, 'wall', styleFor(o), 131, PLQ, o.sym, o.font)));
    } else if (o.type === 'door' && !o.open && (o.title || o.sym)) {
      const t = cachedTex(tex, 'plaques', 'd:' + styleFor(o) + (o.font || '') + (o.sym || '') + (o.textless ? '#' : o.title), () => genPlaque(o.textless ? '' : o.title, 'door', styleFor(o), 133, PLQ, o.sym, o.font)); // 0.32.1: Tür nur mit Symbol (Würfeltür)
      const ns = wallAt(o.x - 1, o.y) && wallAt(o.x + 1, o.y); // Durchgang Nord–Süd
      for (const f of ns ? [0, 2] : [1, 3]) out.set((o.y * w + o.x) * 4 + f, t);
    }
  }
  return out;
}

function genStairs(kind, seed) {
  // 0.34.2: Steinbogen mit perspektivischer Treppe: Stufen werden nach hinten schmaler und niedriger, helle Trittflächen mit Vorderkante,
  // dunkle Setzstufen, seitliche Wangen. Hinab: von oben nach unten dunkler bis Schwarz. Hinauf: von unten nach oben, oben fällt Licht ein.
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  const up = kind === 'up';
  const SMAX = 43, bounds = [0]; // Stufenränder (Abstand von der nahen Kante), jede Stufe 0,8× so hoch wie die davor
  for (let k = 0, p = 9; bounds[bounds.length - 1] < SMAX + 10; k++, p *= 0.8) bounds.push(bounds[bounds.length - 1] + Math.max(2.2, p));
  for (let y = 6; y <= 62; y++) for (let x = 5; x <= 59; x++) {
    const dx = x - 32, dy = y - 34, top = y <= 34, ro = Math.hypot(dx, dy);
    const outer = top ? ro <= 27 : Math.abs(dx) <= 27, inner = top ? ro <= 18 : Math.abs(dx) <= 18;
    if (!outer) continue;
    if (!inner) { set(x, y, P('stone', 3.4 + hash(x >> 1, y >> 1, seed) * 1.3 - (dx > 0 ? 0.5 : 0))); continue; }
    const s = Math.max(0, up ? 61 - y : y - 18);
    const w = 17.5 - s * 0.2;
    if (Math.abs(dx) > w) { set(x, y, P('stone', (up ? 2.6 : 2.0) - Math.min(1.2, s * 0.03) - (dx > 0 ? 0.3 : 0))); continue; } // Wange
    let k = 0; while (k < bounds.length - 2 && s >= bounds[k + 1]) k++;
    const frac = (s - bounds[k]) / (bounds[k + 1] - bounds[k]), tread = frac < 0.6, nose = frac < 0.12;
    if (up) {
      if (s > 38) { set(x, y, P('glow', 4.2 + Math.min(2, (s - 38) * 0.4))); continue; } // oben fällt Licht ein
      const b = 5.6 - s * 0.04;
      set(x, y, tread ? P('stone', b + (nose ? 0.9 : 0) + hash(x, y, seed + 1) * 0.3) : P('stone', 1.0 + s * 0.02));
    } else {
      if (s > 40) { set(x, y, P('ceil', 0)); continue; } // endet im Schwarz
      const fade = Math.max(0, 1 - s / 40);
      set(x, y, tread ? P('stone', 0.4 + fade * 5.2 + (nose ? 0.8 * fade : 0) + hash(x, y, seed + 1) * 0.3) : P('stone', 0.1 + fade * 1.0));
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
  // 0.44.0 (Nutzer: „Käfer anders darstellen, bedrohlicher“): Erzkäfer von vorn, aufgerichtet: gewölbter Rückenpanzer mit Dornen und rostroten Kanten,
  // breite Kopfplatte mit vier glühenden Augen, zwei gezackte Zangen, die auf den Betrachter zuschnappen, gewinkelte Beine mit Dornen, lange Fühler
  // 0.47.15 (Nutzer: „Kampfbild wirkt sehr verpixelt“): in 3-facher Eigenauflösung (192²) gezeichnet statt 64² hochgezogen; Koordinaten wie bisher (Raster 64, Pixelmitte = ganze Zahl),
  // Linien, Augen, Zangen, Dornen und Fühler mit runden Pinseln, Umriss 2 statt 3 Bildpunkte stark
  const F = 3, N = TEX * F, t = { w: N, h: N, data: new Uint8Array(N * N).fill(255) };
  const U = (X) => (X + 0.5) / F - 0.5; // Mitte des Bildpunkts X in Koordinaten des 64er-Rasters
  const lo = (u) => Math.max(0, Math.floor((u + 0.5) * F)), hi = (u) => Math.min(N - 1, Math.ceil((u + 0.5) * F));
  const disc = (cx, cy, r, v) => { for (let Y = lo(cy - r); Y <= hi(cy + r); Y++) for (let X = lo(cx - r); X <= hi(cx + r); X++) if (Math.hypot(U(X) - cx, U(Y) - cy) <= r) t.data[Y * N + X] = v; };
  const line = (x0, y0, x1, y1, mat, sh, th = 1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * F * 1.5); for (let i = 0; i <= n; i++) disc(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, th / 2 + 0.05, P(mat, sh)); };
  const area = (u0, v0, u1, v1, fn) => { for (let Y = lo(v0); Y <= hi(v1); Y++) for (let X = lo(u0); X <= hi(u1); X++) { const r = fn(U(X), U(Y), X, Y); if (r != null) t.data[Y * N + X] = r; } };
  // Beine (hinter dem Körper): Oberschenkel nach außen und oben, Unterschenkel steil nach unten mit Dorn
  for (const sd of [-1, 1]) for (const [yy, up, out] of [[34, 10, 22], [41, 6, 26], [48, 2, 23]]) {
    const kx = 32 + sd * out, ky = yy - up;
    line(32 + sd * 15, yy, kx, ky, 'iron', 3.6, 3); line(kx, ky, kx + sd * 4, 60 - (yy - 34) * 0.15, 'iron', 4.2, 3);
    line(kx, ky, kx + sd * 2, ky + 3, 'blood', 4.2, 1); // rostrotes Gelenk
    line(kx + sd * 4, 60 - (yy - 34) * 0.15, kx + sd * 6, 62 - (yy - 34) * 0.15, 'stone', 6, 1); // Kralle
  }
  // Fühler (hinter dem Panzer: nur das Stück außerhalb der Kuppel ist zu sehen)
  for (const sd of [-1, 1]) { let px = 32 + sd * 6, py = 42; for (let i = 0; i < 16; i++) for (let q = 0; q < 4; q++) { px += sd * (0.9 + i * 0.05) / 4; py -= (0.7 - i * 0.025) / 4; disc(px, py, 0.8 - i * 0.015, P('stone', 3.6)); } }
  // Rückenpanzer: hohe Kuppel mit Mittelnaht, Querplatten und Dornenreihe
  area(8, 14, 56, 52, (u, v, X, Y) => {
    const dx = (u - 32) / 23, dy = (v - 33) / 17, d2 = dx * dx + dy * dy;
    if (d2 > 1 || v > 50.5) return null;
    const rim = d2 > 0.82, seam = Math.abs(u - 32) < 0.9, plate = Math.abs(v - 6 * Math.round(v / 6)) < 0.5 && Math.abs(dx) < 0.9;
    let sh = 2.6 - dy * 1.5 - Math.abs(dx) * 1.1 + hash(X >> 2, Y >> 2, seed) * 0.5;
    if (seam) sh -= 1.1; if (plate) sh -= 1.2;
    return rim ? P('blood', 1.9 - dy * 0.5 + hash(X >> 1, Y >> 1, seed + 3) * 0.4) : P('iron', Math.max(0.5, sh));
  });
  for (let cy = 16; cy < 48; cy += 4) for (let cx = 12; cx < 52; cx += 4) { // Glanzpunkte
    if (hash(cx, cy, seed + 4) <= 0.82) continue;
    const dx = (cx - 32) / 23, dy = (cy - 33) / 17;
    if (dy < -0.25 && dx * dx * 4 + dy * dy < 0.9 && dx * dx + dy * dy < 0.8) disc(cx + hash(cx, cy, seed + 5) * 2 - 1, cy + hash(cx, cy, seed + 6) * 2 - 1, 1.0, P('stone', 4.6));
  }
  for (let k = -3; k <= 3; k++) { const bx = 32 + k * 6.5, by = 33 - 17 * Math.sqrt(Math.max(0, 1 - Math.pow((bx - 32) / 23, 2))), H = 7 - Math.abs(k) * 0.8; // Rückendornen: spitz zulaufend, links hell, rechts dunkel
    area(bx - 2, by - H - 3, bx + 2, by, (u, v) => { const hh = (by - 0.5 - v) / H; if (hh < 0 || hh > 1) return null; const hw = 1.25 * (1 - hh); if (Math.abs(u - bx) > hw) return null; return P('stone', (u < bx - hw * 0.2 ? 5.8 : u > bx + hw * 0.4 ? 3.0 : 4.4) - hh * 0.8); }); }
  // Halsschild (breit, vorn über dem Kopf)
  area(16, 36, 48, 48, (u, v, X, Y) => { const dx = (u - 32) / 16, dy = (v - 43) / 7; return dx * dx + dy * dy <= 1 ? P('iron', 4.4 - dy * 1.6 - Math.abs(dx) * 1.0 + hash(X >> 1, Y >> 1, seed + 1) * 0.4) : null; });
  line(15, 41, 32, 35, 'blood', 3.4, 1.1); line(49, 41, 32, 35, 'blood', 3.4, 1.1);
  // Kopf: breite Platte, dunkel, mit Stirnkante
  area(19, 42, 45, 58, (u, v, X, Y) => { const dx = (u - 32) / 13, dy = (v - 50) / 8; return dx * dx + dy * dy <= 1 ? P('iron', 3.0 - dy * 1.2 + hash(X >> 1, Y >> 1, seed + 2) * 0.4) : null; });
  line(22, 45, 42, 45, 'iron', 5.4, 1.1);
  // vier glühende Augen
  for (const [ex, ey, r] of [[27, 50, 2.3], [37, 50, 2.3], [23.5, 53, 1.4], [40.5, 53, 1.4]]) { disc(ex, ey, r + 0.4, P('blood', 7)); disc(ex, ey, r * 0.5 + 0.2, P('glow', 7)); }
  // Zangen: knochenhell, groß, nach innen gebogen, innen gezackt, Spitzen glänzen
  for (const sd of [-1, 1]) {
    for (let i = 0; i <= 90; i++) { const a = i / 90, x = 32 + sd * (9 + Math.sin(a * 2.2) * 15 - a * a * 6), y = 54 + a * 9, R = (5 - a * 4) / 2 + 0.1, cx = x - sd * (R - 0.5);
      disc(cx, y, R, P('glow', 5.0 - a * 0.4)); disc(cx + sd * R * 0.3, y - R * 0.1, R * 0.55, P('glow', 6.3 - a * 0.4)); }
    for (let k = 0; k < 5; k++) { const a = 0.3 + k * 0.14, x = 32 + sd * (9 + Math.sin(a * 2.2) * 15 - a * a * 6) - sd * 4, y = 54 + a * 9; disc(x - sd * 0.4, y + 0.4, 1.0, P('glow', 7)); }
    disc(32 + sd * 3, 62.6, 0.8, P('glow', 7));
  }
  // Umriss (2 Bildpunkte stark)
  const copy = Uint8Array.from(t.data);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (copy[y * N + x] !== 255) continue;
    let hit = false;
    for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2; dx++) { if (Math.abs(dx) + Math.abs(dy) > 2) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && copy[yy * N + xx] !== 255) { hit = true; break; } }
    if (hit) t.data[y * N + x] = P('ceil', 0.3);
  }
  return t;
}

// Falle am Boden (0.18.0): 'faint' = feine Spur (drei dunkle Schlitze, leicht zu übersehen), 'seen' = entdeckt (rote Markierung + Warnzeichen), 'sprung' = ausgelöst (Speere ragen heraus)
function genTrap(mode, seed, kind = 'spikes') { // kind (0.22.1, Nutzer: „Stahlspeere statt wie angekündigt Gift“): Bild passend zur Fallenart
  const t = mk(255);
  const set = (x, y, v) => { if (x >= 0 && x < TEX && y >= 0 && y < TEX) t.data[y * TEX + x] = v; };
  if (mode === 'faint') {
    // 0.19.9: sichtbare Platte; 0.19.18 (Nutzer: „Stein bei der Giftfalle jetzt zu deutlich“): dezenter – kleiner, kaum dunkler als der Boden, schmale feine Risse, wenig Staub
    // 0.23.4 (Nutzer: ohne Schurken nicht erkennbar): etwas höher und kontrastreicher – helle Kante oben, dunkle Fuge, deutlichere Risse; weiter dezenter als die entdeckte (rote) Falle
    // 0.26.3 (Nutzer: „Fallen viel zu offensichtlich“): wieder schmaler und kontrastärmer – Kante und Fuge nur noch leicht, Platte kaum heller als Boden
    // 0.47.5 (Nutzer: „Immer noch zu leicht erkennbar“): Spur nur noch im Material des Bodens (Stein-Töne stachen heraus), kein Rechteck mehr (wirkte wie eine Platte) – zwei kurze, unregelmäßige Haarrisse und wenige Staubpunkte, kaum dunkler als die Bodenmaserung
    for (const [cx, w] of [[26, 9], [37, 7]]) { let x = cx + Math.floor(hash(cx, 5, seed) * 3) - 1; for (let y = 60; y <= 63; y++) { for (let k = 0; k < w - (y - 60) * 2; k++) if (hash(x + k, y, seed + 13) > 0.25) set(x + k, y, P('floor', 2)); x += hash(y, x, seed + 3) > 0.5 ? 1 : -1; } }
    for (let x = 20; x <= 44; x++) for (let y = 61; y <= 63; y++) if (hash(x, y, seed + 7) > 0.965) set(x, y, P('floor', 4));
  } else if (mode === 'seen') {
    // 0.47.3 (Nutzer: „Ausrufezeichen mittig im Bild“): flache Bodenmarkierung – roter Ring und liegendes Ausrufezeichen auf dem Boden, nichts schwebt mehr in Bildmitte
    for (let y = 52; y <= 63; y++) for (let x = 8; x <= 56; x++) {
      const r = Math.hypot((x - 32) / 24, (y - 58) / 5.6);
      if (r > 1.02) continue;
      if (r > 0.8) set(x, y, P('blood', 6.2 + hash(x, y, seed) * 0.5));
      else if (hash(x >> 1, y, seed + 5) > 0.55) set(x, y, P('blood', 1.6));
    }
    for (let y = 54; y <= 60; y++) for (let x = 30; x <= 33; x++) set(x, y, P('blood', 7));
    for (let y = 61; y <= 62; y++) for (let x = 30; x <= 33; x++) set(x, y, P('blood', 7));
  } else if (kind === 'gas') { // Giftnebel: Düsen im Boden, grüne Schwaden
    for (let x = 12; x <= 52; x++) set(x, 63, P('stone', 0.5));
    for (const cx of [20, 32, 44]) for (let x = cx - 2; x <= cx + 2; x++) set(x, 62, P('stone', 0.2));
    for (let y = 22; y <= 62; y++) for (let x = 6; x <= 58; x++) {
      const d = Math.hypot((x - 32) / 26, (y - 50) / 15) + Math.sin(x * 0.4 + y * 0.25) * 0.08 + (hash(x >> 1, y >> 1, seed + 9) - 0.5) * 0.25;
      const d2 = Math.hypot((x - 24) / 12, (y - 34) / 9), d3 = Math.hypot((x - 41) / 11, (y - 30) / 8);
      const m = Math.min(d, d2 + 0.15, d3 + 0.2);
      if (m < 1 && hash(x, y, seed + 4) > m * 0.55) set(x, y, P('flesh', 6.6 - m * 2.8 + hash(x >> 1, y, seed) * 0.6)); // flesh = in Moor-/Gruben-/Kellerpaletten grünlich
    }
  } else if (kind === 'rune') { // Runenfalle: leuchtender Runenkreis am Boden
    for (let y = 52; y <= 63; y++) for (let x = 6; x <= 58; x++) {
      const r = Math.hypot((x - 32) / 26, (y - 58) / 5.5);
      if (r > 1.05) continue;
      const ring = Math.abs(r - 0.88) < 0.1 || Math.abs(r - 0.5) < 0.07;
      const glyph = r < 0.8 && Math.abs(Math.sin(Math.atan2(y - 58, (x - 32) / 4.7) * 3)) > 0.94;
      if (ring || glyph) set(x, y, P('ice', 6.6 + hash(x, y, seed) * 0.4));
      else if (r < 0.95 && hash(x, y, seed + 6) > 0.8) set(x, y, P('ice', 3.2));
    }
    for (let y = 30; y <= 51; y++) for (let x = 24; x <= 40; x++) if (Math.abs(x - 32) < 1 + (51 - y) * 0.02 && hash(x, y, seed + 8) > 0.35) set(x, y, P('ice', 4.4 + (y - 30) * 0.08));
  } else {
    for (let x = 12; x <= 52; x++) set(x, 63, P('stone', 0.5));
    for (const cx of [18, 25, 32, 39, 46]) { const h = 16 + Math.floor(hash(cx, 3, seed) * 8); for (let y = 63 - h; y <= 62; y++) { const w = y < 63 - h + 4 ? 0 : 1; for (let x = cx - w; x <= cx + w; x++) set(x, y, P('iron', x < cx ? 5.5 : 3.2)); } }
  }
  t.noWrap = true;
  return t;
}
// Teleportfeld (0.23.0): leuchtender Wirbel am Boden (aktiv) bzw. erloschener Steinkreis (per Hebel abgeschaltet)
function genTele(on, seed) {
  const t = mk(255);
  for (let y = 40; y <= 63; y++) for (let x = 2; x <= 62; x++) {
    const r = Math.hypot((x - 32) / 29, (y - 58) / 6);
    if (r <= 1.05 && y >= 52) {
      const a = Math.atan2(y - 58, (x - 32) / 4.8), sw = Math.sin(a * 3 + r * 9);
      if (Math.abs(r - 0.95) < 0.09) t.data[y * TEX + x] = P(on ? 'glow' : 'stone', on ? 6.8 : 3.2);
      else if (on && r < 0.9 && sw > 0.55) t.data[y * TEX + x] = P('ice', 5.2 + (1 - r) * 2);
      else if (!on && r < 0.9 && hash(x, y, seed) > 0.85) t.data[y * TEX + x] = P('stone', 1.6);
    } else if (on && y < 52 && Math.abs(x - 32) < 22 * (1 - (52 - y) / 14) && hash(x, y >> 1, seed + 3) > 0.9) t.data[y * TEX + x] = P('ice', 6 - (52 - y) * 0.15); // aufsteigende Funken
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
  for (let y = 24; y <= 63; y++) for (let x = 10; x <= 54; x++) { // 0.48.0: Runenring um den Sockel – leuchtet, solange der Hebel bereit ist
    const r = Math.hypot((x - 32) / 21, (y - 46) / 19), onRing = r > 0.88 && r < 1.02, rune = onRing && (Math.floor((Math.atan2(y - 46, x - 32) + 3.1416) * 4) % 3 === 0 || hash(x >> 1, y >> 1, seed + 11) > 0.8);
    if (!onRing || (y > 56 && Math.abs(x - 32) < 8)) continue;
    if (used) { if (hash(x, y, seed + 12) > 0.35) set(x, y, P('iron', 2.2 + hash(x >> 1, y, seed + 13) * 0.8)); } else set(x, y, rune ? P('glow', 7) : P('glow', 4.2));
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

// 0.39.0: Gast auf einem Stuhl (sitzend, Krug in den Händen); v = 0 Hutträger mit Bart, 1 Kapuze, 2 Dunkelhaar im roten Wams
function genGuest(seed, v) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), ax = Math.abs(px - 32), wd = (b) => ['wood', b - l * 0.9 + n * 0.45];
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3], base = [['blood', 3.3], ['moss', 3.1], ['ice', 3.3]][v % 3], cl = (b) => [base[0], b - l * 0.8 + n * 0.4];
    if (v === 0 && (ell(px, py, 32, 10.5, 10.5, 2.3) <= 1 || (py >= 3.5 && py < 11 && ax < 5.8))) return wd(2.5);
    if (v === 1 && py < 18 && ell(px, py, 32, 15, 9.2, 10.5) <= 1) return cl(2.4);
    if (v === 2 && py < 12.6 && ell(px, py, 32, 12.5, 7, 5.4) <= 1) return ['wood', 1.5 - l * 0.3];
    if (ell(px, py, 32, 17.5, 6.4, 7.4) <= 1) {
      if (ell(px, py, 29.3, 17, 1.1, 1.3) <= 1 || ell(px, py, 34.7, 17, 1.1, 1.3) <= 1) return ['ceil', 0];
      if (py > 21.2 && py < 22.8 && ax < 2.2) return ['blood', 2.3];
      if (v === 0 && py > 20.5) return ['wood', 2.0 - l * 0.4 + n * 0.4];
      return skin(5.3);
    }
    if (cap(px, py, 21, 29, 27, 41, 3.3, 3.1) || cap(px, py, 43, 29, 37, 41, 3.3, 3.1)) return cl(3.9);
    if (px >= 28 && px < 36 && py >= 34 && py < 43) return py < 36 ? ['glow', 6.8] : ['iron', 4.6 - l * 0.8];
    if (ell(px, py, 27.5, 41, 2.6, 2.4) <= 1 || ell(px, py, 36.5, 41, 2.6, 2.4) <= 1) return skin(4.9);
    if (py >= 24 && py <= 49 && ax < 12.5 - Math.max(0, py - 44) * 0.5) return cl(3.1);
    if (py >= 49 && py < 57 && ax >= 3 && ax < 14) return ['iron', 1.6 - l * 0.4];
    if (py >= 57 && py <= 61 && ax >= 3 && ax < 15) return wd(1.7);
    if (py >= 22 && py < 29 && ax >= 13.5 && ax < 17.5) return wd(2.7);
    if (py >= 29 && py < 50 && ax >= 14.5 && ax < 17.5) return wd(2.8);
    if (py >= 49 && py < 53 && ax < 17.5) return wd(3.7);
    if (py >= 53 && py <= 61 && ax >= 14.5 && ax < 17.5) return wd(2.2);
  }, 128);
}

// ---------- Begegnungspersonen (0.26.1): drei eigene Figuren, nicht mehr die Händlerin / Gegnerbilder ----------
// kind: 'torf' (Torfstecher: Schlapphut, Bart, Spaten), 'wache' (Wachmann: Rundhelm, Lederharnisch, Wappenrock, Speer), 'wund' (verwundeter Kultist: Kapuze, Verbände, gebeugt)
function genPerson(seed, kind) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1);
    const sh = kind === 'wund' ? -2.5 : 0; // gebeugt: Oberkörper nach links
    const dx = px - 32 - (py < 40 ? sh * (1 - py / 40) : 0), hy = kind === 'wund' ? 15 : 13;
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3]; // warmer Hautton (Material glow wie bei Hedda)
    // Gesicht, Augen, Mund (oben auf)
    if (kind !== 'wund' || py > hy - 1) {
      const er = kind === 'torf' ? 1.05 : 1.4; // Bram: kleinere Augen (0.26.3)
      if (ell(px, py, 32 + sh - 2.9, hy, er, er * 1.15) <= 1 || ell(px, py, 32 + sh + 2.9, hy, er, er * 1.15) <= 1) return ['ceil', 0];
    }
    if (kind === 'wund' && (ell(px, py, 32 + sh - 2.9, hy, 1.5, 1.6) <= 1 || ell(px, py, 32 + sh + 2.9, hy, 1.5, 1.6) <= 1)) return ['ice', 7];
    // Kopfbedeckung
    if (kind === 'torf') {
      if (Math.abs(py - 8.4) < 1.2 && Math.abs(dx) < 12.5) return ['wood', 2.2 + n * 0.8 - l * 0.8]; // breite Krempe
      if (ell(px, py, 32, 6.5, 7.2, 4.6) <= 1 && py < 8.4) return ['wood', 2.6 - l * 1 + n * 0.6];
    } else if (kind === 'wache') {
      if (ell(px, py, 32, 9, 8.6, 6.4) <= 1 && py < 10.5) return ['iron', 3.8 - l * 1.4 + n * 0.5];
      if (Math.abs(dx) < 1.1 && py >= 10 && py < 16) return ['iron', 3.2]; // Nasenschutz
    } else {
      if (ell(px, py, 32 + sh, 10, 10.5, 10.5) <= 1 && !(ell(px, py, 32 + sh, 15, 6, 6) <= 1)) return ['stone', 1.6 - l * 0.8 + n * 0.6]; // Kapuze
    }
    // Kopf
    if (kind === 'torf') { // 0.26.3: Bart statt Maske – V-förmige Wangenkante, Schnurrbart, spitz auslaufend, Haarsträhnen
      const beard = () => ['stone', 5.6 - l * 0.8 + ((x + (y >> 2)) % 3 === 0 ? -0.9 : 0.5) + n * 0.5];
      if (ell(px, py, 32, hy + 1.3, 1.25, 1.1) <= 1) return skin(4.2); // Nase
      if (Math.abs(Math.abs(dx) - 2.9) < 2 && Math.abs(py - (hy - 2.7)) < 0.6 && ell(px, py, 32, hy, 6.6, 7.4) <= 1) return ['wood', 1.8]; // Brauen
      if (ell(px, py, 32, hy, 6.6, 7.4) <= 1 && py > hy + 2.6 + (1 - Math.abs(dx) / 6.6) * 0 - Math.abs(dx) * 0.0) {
        if (py > hy + 3.4 && py < hy + 4.6 && Math.abs(dx) < 2.2) return ['ceil', 0.6]; // Mund im Bart
        return beard();
      }
      if (py > hy + 5 && py < hy + 11.5 && Math.abs(dx) < 5.2 - (py - hy - 5) * 0.72) return beard(); // Bart läuft unter dem Kinn spitz aus
    }
    if (ell(px, py, 32 + sh, hy, 6.6, 7.4) <= 1) {
      return skin(5.2);
    }
    // Hals
    if (Math.abs(px - 32 - sh * 0.8) < 2.6 && py > 19 && py < 23.5) return skin(4);
    // Werkzeug / Waffe rechts im Bild
    if (kind === 'torf') {
      if (cap(px, py, 48, 52, 47, 14, 1, 1)) return ['wood', 3 - l * 0.8];
      if (py > 6 && py < 16 && Math.abs(px - 47.3) < 4.2 - (py - 6) * 0.14 && ell(px, py, 47.5, 12, 4.4, 6.4) <= 1) return ['iron', 4.4 - l * 1.2 + n * 0.5]; // Spatenblatt
    } else if (kind === 'wache') {
      if (cap(px, py, 50, 56, 50, 3, 0.9, 0.9)) return ['wood', 3 - l * 0.8];
      if (py < 9.5 && py > 1 && Math.abs(px - 50) < (py - 1) * 0.52) return ['iron', 5.4 - l];
    }
    // Arme
    const armMat = kind === 'wache' ? ['iron', 3 - l] : kind === 'torf' ? ['moss', 2.2 - l * 0.8 + n * 0.5] : ['stone', 1.8 - l * 0.8];
    if (cap(px, py, 22 + sh, 26, 17 + sh * 0.6, 38, 3.3, 2.7) || cap(px, py, 42 + sh * 0.2, 26, 47, 38, 3.3, 2.7)) return armMat;
    if (ell(px, py, 16.5 + sh * 0.6, 39.5, 2.5, 2.7) <= 1 || ell(px, py, 47.3, 39.5, 2.5, 2.7) <= 1) return skin(4.6); // Hände
    // Rumpf und Beine
    const hw = 9.5 + Math.max(0, py - 26) * (kind === 'wund' ? 0.22 : 0.1);
    if (py >= 23 && py < 58 && Math.abs(dx) < hw && py < 58 - (kind === 'wund' ? Math.abs(Math.sin(px * 1.3 + seed)) * 2 : 0)) {
      if (kind === 'torf') {
        if (Math.abs(dx) < 1 && py < 46) return ['wood', 2];
        if (py > 44 && py < 46) return ['wood', 1.4]; // Gürtel
        return py > 46 ? ['wood', 1.8 + n * 0.9 - l * 0.6] : ['moss', 2.6 + n * 1 - l * 1.2];
      }
      if (kind === 'wache') {
        if (py > 47) return ['wood', 2 + n * 0.6 - l * 0.6]; // Hose
        if (Math.abs(dx) < 3.4 && py > 25) return ['blood', 4 + n * 0.4 - l * 0.6]; // Wappenrock
        if (py > 44 && py < 46) return ['wood', 1.2];
        return ['iron', 2.8 + (((x >> 1) + (y >> 1)) & 1) * 0.35 - l * 1.1]; // Kettenhemd
      }
      // wund: zerlumpte Robe, Verband quer über die Brust, Blutflecken
      if (Math.abs(py - 31 - dx * 0.35) < 1.9) return ['stone', 6.2 - l * 0.6];
      if (ell(px, py, 28 + sh, 36, 2.4, 3.2) <= 1 || ell(px, py, 38, 48, 2, 2.4) <= 1) return ['blood', 4.6];
      return ['stone', 1.6 + n * 1.1 - l * 0.9];
    }
    if (kind === 'wund' && py >= 56 && py < 60 && Math.abs(dx) < 9) return ['stone', 1.2 + n * 0.8]; // Saum
    return null;
  }, 128, true);
}


// 0.42.0: Wirtin Marga (Nutzer: „sieht nicht aus wie eine Wirtin“, vorher Bild des Waffenhändlers): Frau mit Haarknoten und Kopftuchband, rote Wangen,
// freundliches Lächeln, weiße Bluse mit hochgekrempelten Ärmeln, rotes Mieder, lange helle Schürze, Bierkrug mit Schaum in der Hand, Schlüsselbund am Gürtel.
// 0.46.0: Hexe (Taverne): spitzer Hut, graue Strähnen, moosgrüne Robe, Stab mit leuchtender Kugel
function genHexe(seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32, ax = Math.abs(dx);
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3], hair = (b) => ['stone', b - l * 0.7 + n * 0.4], robe = (b) => ['moss', b - l * 0.9 + n * 0.5], hat = (b) => ['iron', b - l * 0.6 + n * 0.3];
    const hy = 17;
    // Stab rechts (im Bild) mit leuchtender Kugel
    if (ell(px, py, 52, 9, 3.6, 3.6) <= 1) return ['glow', 6.2 - Math.hypot(px - 52, py - 9) * 0.25];
    if (Math.abs(px - 52 - (py - 9) * 0.02) < 1 && py > 11 && py < 62) return ['wood', 3.2 - l * 0.6 + n * 0.4];
    // Gesicht: schmale Augen, Hakennase, Mund
    if (ell(px, py, 32 - 2.8, hy, 1.1, 0.9) <= 1 || ell(px, py, 32 + 2.8, hy, 1.1, 0.9) <= 1) return ['glow', 7.2];
    if (Math.abs(Math.abs(dx) - 3) < 1.6 && Math.abs(py - (hy - 2.4)) < 0.5) return hair(1.5);
    if (ell(px, py, 32.4, hy + 2.6, 1, 2) <= 1) return skin(3.6);
    if (Math.abs(py - (hy + 5.8)) < 0.5 && ax < 2.4) return ['blood', 2.8];
    // Hut: Krempe und gebogene Spitze
    const tipX = 32 + Math.max(0, (9 - py)) * 0.0 + (py < 5 ? (5 - py) * 0.5 : 0), half = Math.max(0, (py - 0) * 0.62);
    if (py >= 0 && py < 9 && Math.abs(px - tipX) < half + 0.4) return hat(2.2 + (py < 5 ? 0.3 : 0));
    if (ell(px, py, 32, 9.8, 13, 2.3) <= 1) return hat(2.6);
    if (py > 7 && py < 10 && ax < 9.5) return ['blood', 2.6 - l * 0.3]; // Hutband
    // Gesicht, Haar
    if (ell(px, py, 32, hy, 6.6, 7.6) <= 1) return skin(4.4);
    if (py > 9 && ((ax > 6 && ax < 9.6 && py < 36) || (py < 14 && ax < 7))) return hair(5.2);
    // Hals, Robe (Kegel), Kragen, Ärmel
    if (ax < 2.4 && py > 24 && py < 28) return skin(3.8);
    if (py >= 26 && ax < 7 + (py - 26) * 0.44 + (py > 58 ? 0 : 0) && py < 64) { if (py < 29 && ax < 4) return robe(5.4); if (((x >> 2) + (y >> 3)) % 7 === 0 && py > 40) return robe(2.1); return robe(3.4); }
    if (cap(px, py, 46, 31, 51, 37, 3.1, 2.8)) return robe(3.8);
    if (ell(px, py, 51, 39, 2.2, 2.2) <= 1) return skin(4.2);
    return null;
  });
}
function genWirtin(seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3], hair = (b) => ['blood', b - l * 0.7 + n * 0.5], cloth = (b) => ['stone', Math.min(7, b + 0.8) - l * 0.5 + n * 0.3], linen = (b) => ['ice', b - l * 0.7 + n * 0.3];
    const hy = 15;
    // Gesicht: Augen mit Wimpern, Brauen, Lächeln, Wangen
    if (ell(px, py, 32 - 2.9, hy, 0.95, 1.15) <= 1 || ell(px, py, 32 + 2.9, hy, 0.95, 1.15) <= 1) return ['ceil', 0.3];
    if (Math.abs(Math.abs(dx) - 3.1) < 1.8 && Math.abs(py - (hy - 3)) < 0.55) return hair(1.6);
    if (Math.abs(Math.abs(dx) - 4) < 0.5 && Math.abs(py - (hy - 1.4)) < 0.4) return ['ceil', 0.6]; // Wimpern
    if (Math.abs(py - (hy + 4.3 - (Math.abs(dx) > 1.3 ? 0.6 : 0))) < 0.5 && Math.abs(dx) < 2.5) return ['blood', 3.6]; // Lächeln (Mundwinkel hoch)
    if (ell(px, py, 32 - 4.3, hy + 2.5, 1.2, 0.8) <= 1 || ell(px, py, 32 + 4.3, hy + 2.5, 1.2, 0.8) <= 1) return ['blood', 4.9 - l * 0.3]; // zarte rote Wangen
    if (ell(px, py, 32, hy + 1.4, 0.9, 0.8) <= 1) return skin(4.2); // Nase
    // Kopftuchband (hell) und Haarknoten
    if (Math.abs(py - 8.2) < 1.5 && Math.abs(dx) < 7.2 && ell(px, py, 32, hy, 7.4, 8.6) <= 1.15) return cloth(5.8);
    if (ell(px, py, 32, 4.2, 5.2, 4.2) <= 1) return hair(2.9 + ((x + y) % 5 === 0 ? 0.5 : 0)); // Knoten
    if (py < 9.5 && ell(px, py, 32, hy, 7.6, 8.8) <= 1) return hair(2.5);
    // Seitliche Haarsträhnen hinter dem Gesicht
    if (ell(px, py, 32, hy, 6.4, 7.2) <= 1) return skin(5.4);
    if (ell(px, py, 32, hy, 7.9, 8.8) <= 1 || (Math.abs(Math.abs(dx) - 7.4) < 1.1 && py > 12 && py < 21)) return hair(2.3);
    // Hals und Ausschnitt
    if (Math.abs(dx) < 2.6 && py > 21.5 && py < 25) return skin(4.2);
    // Bierkrug in der rechten Hand (im Bild rechts)
    if (px > 44 && px < 54 && py > 28 && py < 41) { if (py < 31) return ['stone', 7 - l * 0.3 + n * 0.3]; if (px > 51.6) return ['iron', 3.4]; return ['wood', 3.6 - l * 0.8 + n * 0.5]; } // Schaum, Henkel, Krug
    if (ell(px, py, 55, 34, 2, 4.4) <= 1 && ell(px, py, 55, 34, 1, 3.2) > 1) return ['iron', 3.4]; // Henkelring
    // Arme: Bluse bis zum Ellbogen hochgekrempelt, Unterarm nackt, linke Hand in der Hüfte
    if (cap(px, py, 22, 26, 16, 33, 3.5, 3.3)) return cloth(6.2);
    if (cap(px, py, 16, 33, 22, 43, 2.9, 2.6)) return skin(4.8);
    if (cap(px, py, 42, 26, 47, 33, 3.5, 3.3)) return cloth(6.2);
    if (cap(px, py, 47, 33, 49, 40, 2.9, 2.6)) return skin(4.8);
    if (ell(px, py, 22.5, 43.5, 2.5, 2.5) <= 1 || ell(px, py, 48.5, 40.5, 2.6, 2.5) <= 1) return skin(4.6);
    // Rumpf: Bluse oben, rotes Mieder mit Schnürung, Schürze, dunkler Rock
    const hw = 8.8 + Math.max(0, py - 28) * 0.2;
    if (py >= 23 && py < 60 && Math.abs(dx) < hw) {
      if (py < 28) return cloth(6.4); // Bluse am Hals
      if (py < 36) { if (Math.abs(dx) < 1 && ((y >> 1) & 1)) return ['stone', 6.6]; return ['blood', 3.6 - l * 0.8 + n * 0.4]; } // Mieder
      if (py > 37 && py < 39.2) return ['wood', 1.4]; // Gürtel
      if (ell(px, py, 28.5, 39.4, 1.3, 1.5) <= 1 || ell(px, py, 30.5, 41, 1.1, 2) <= 1) return ['glow', 5.6]; // Schlüsselbund
      if (Math.abs(dx) < hw - 2.4 && py > 39) return ['glow', 7 - (Math.abs(dx) < 0.6 ? 0.9 : 0) - l * 0.4 + n * 0.2]; // Schürze (helles Leinen)
      return ['wood', 1.7 + n * 0.6 - l * 0.6]; // Rock
    }
    return null;
  }, 128, true);
}

// ---------- 0.29.0: Waffenhändler Valdis (Blutgruft) und der Gefangene ----------
// Valdis: kahl, Augenklappe mit Riemen, Narbe, breite Eisenschultern, brauner Lederrock mit Gürtel, Zweihänder neben sich. Gefangener: zottelige Haare, Lumpen, Ketten an den Händen.
function genVendor2(seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3];
    const head = ell(px, py, 32, 13, 6.8, 7.6) <= 1;
    if (ell(px, py, 28.8, 13, 2.5, 2.4) <= 1) return ['ceil', 0.3]; // Augenklappe
    if (head && Math.abs((py - 7.5) - (px - 22) * 0.36) < 0.65) return ['ceil', 0.8]; // Riemen
    if (ell(px, py, 35.2, 13, 1.3, 1.5) <= 1) return ['ceil', 0];
    if (head && Math.abs(px - 38.6 - (py - 8) * 0.18) < 0.5 && py > 8 && py < 16) return ['blood', 3.4]; // Narbe
    if (head && py > 17 && py < 18.4 && Math.abs(dx) < 3.2) return ['ceil', 0.8]; // Mund
    if (head && py > 15.6 && py < 17 && Math.abs(dx) < 4.4 && Math.abs(dx) > 0.8) return ['wood', 1.6 + n]; // Schnurrbart
    if (head) return skin(5.4);
    if (Math.abs(dx) < 2.8 && py > 19 && py < 24) return skin(4);
    // Zweihänder rechts (Spitze nach oben)
    if (cap(px, py, 50, 52, 50, 4, 2.4, 1.2)) return ['iron', 5.2 - l * 1.1 + n * 0.4];
    if (Math.abs(py - 40) < 1.1 && Math.abs(px - 50) < 5.2) return ['wood', 2.6]; // Parierstange
    if (cap(px, py, 50, 41, 50, 54, 1.5, 1.5)) return ['wood', 1.8 - l * 0.5];
    // Schultern aus Eisen
    if (ell(px, py, 18.5, 26.5, 6.8, 4.8) <= 1 || ell(px, py, 45.5, 26.5, 6.8, 4.8) <= 1) return ['iron', 4.4 - l * 1.4 + n * 0.5];
    // Arme
    if (cap(px, py, 21, 28, 18, 40, 3.4, 2.9) || cap(px, py, 43, 28, 49, 40, 3.4, 2.9)) return ['wood', 2.4 - l * 0.8 + n * 0.6];
    if (ell(px, py, 17.5, 41, 2.5, 2.7) <= 1 || ell(px, py, 49.2, 41.5, 2.6, 2.8) <= 1) return skin(4.6);
    // Rumpf: Lederrock, Schürze, Gürtel
    if (py >= 23 && py < 59 && Math.abs(dx) < 10.2 + Math.max(0, py - 40) * 0.06) {
      if (py > 43.5 && py < 46) return Math.abs(dx) < 2 ? ['glow', 6] : ['ceil', 1.4];
      if (py > 46) return ['ceil', 1.5 + n * 0.6 - l * 0.5]; // Hosen
      if (Math.abs(dx) < 6.5 && py > 29) return ['wood', 3.4 + n * 0.7 - l * 0.9]; // Schürze
      return ['wood', 2 + n * 0.8 - l * 0.9];
    }
    return null;
  }, 128, true);
}
// 0.46.0: Brum – kahlköpfiger Schmied mit rotem Vollbart, Lederschürze und Hammer (Valdis trägt Augenklappe und Zweihänder)
function genVendor3(seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32, ax = Math.abs(dx);
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3], beard = (b) => ['blood', b - l * 0.8 + ((x + y * 2) % 5 === 0 ? 0.5 : -0.1) + n * 0.5];
    const head = ell(px, py, 32, 13, 7.6, 7.4) <= 1;
    if (ell(px, py, 28.6, 12, 1.2, 1.1) <= 1 || ell(px, py, 35.4, 12, 1.2, 1.1) <= 1) return ['ceil', 0];
    if (head && Math.abs(ax - 3.6) < 2 && Math.abs(py - 9.4 - (ax < 3.6 ? 0 : 0)) < 0.7) return beard(1.8); // buschige Brauen
    if (ell(px, py, 32, 14.8, 1.6, 1.4) <= 1) return skin(4.2); // Nase
    if (py > 15 && ell(px, py, 32, 20, 9, 9.5) <= 1) { if (py > 17.5 && py < 19 && ax < 2.6) return ['ceil', 0.9]; return beard(3.1); } // Vollbart
    if (head) return skin(5.6);
    // Hammer links (Kopf unten, im Bild links)
    if (cap(px, py, 13, 56, 13, 22, 1.5, 1.5)) return ['wood', 2.2 - l * 0.5];
    if (px > 5 && px < 21 && py > 12 && py < 24) return ['iron', 4.6 - l * 1.2 + n * 0.4];
    // Schultern, Arme
    if (ell(px, py, 19, 27, 6.2, 4.6) <= 1 || ell(px, py, 45, 27, 6.2, 4.6) <= 1) return ['wood', 3.4 - l * 1.0 + n * 0.5];
    if (cap(px, py, 20, 29, 15, 41, 3.6, 3.2) || cap(px, py, 44, 29, 49, 41, 3.6, 3.2)) return skin(4.6 - l * 0.4);
    if (ell(px, py, 14, 41, 3, 3) <= 1 || ell(px, py, 50, 41.5, 2.8, 2.8) <= 1) return skin(4.4);
    // Rumpf: Lederschürze über dunklem Hemd, Gürtel
    if (py >= 23 && py < 60 && ax < 11 + Math.max(0, py - 40) * 0.05) {
      if (py > 43 && py < 45.6) return ax < 2 ? ['iron', 5] : ['ceil', 1.6];
      if (py > 45.6) return ['stone', 2.4 + n * 0.6 - l * 0.5];
      if (ax < 7.4 && py > 28) return ['wood', 4 + n * 0.8 - l * 0.9]; // Schürze
      return ['moss', 1.6 + n * 0.6 - l * 0.6];
    }
    return null;
  }, 128, true);
}
function genPrisoner(seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.4];
    const hair = (b) => ['stone', b - l * 0.8 + ((x * 3 + y) % 4 === 0 ? -0.8 : 0.4) + n * 0.6];
    const head = ell(px, py, 32, 14, 6.4, 7.2) <= 1;
    if (ell(px, py, 29.2, 14, 1.3, 1.4) <= 1 || ell(px, py, 34.8, 14, 1.3, 1.4) <= 1) return ['ceil', 0];
    if (head && py > 18.5 && py < 19.6 && Math.abs(dx) < 2.2) return ['ceil', 0.8];
    // struppiges Haar: Kappe oben, Strähnen seitlich bis zu den Schultern, Stoppelbart
    if (ell(px, py, 32, 9.5, 9.2, 7.8) <= 1 && py < 12.5 + Math.abs(dx) * 0.25) return hair(2.2);
    if (Math.abs(Math.abs(dx) - 7.6) < 2.2 && py > 10 && py < 28 - Math.abs(Math.sin(px * 1.7 + seed)) * 4) return hair(2);
    if (head && py > 16.5 && ell(px, py, 32, 18.5, 5.6, 6.2) <= 1) return hair(3.2); // Bart
    if (head) return skin(5.8);
    if (Math.abs(dx) < 2.6 && py > 20 && py < 24) return skin(4.2);
    // Arme nach vorn, Hände in Ketten
    if (cap(px, py, 23, 27, 27, 40, 3, 2.6) || cap(px, py, 41, 27, 37, 40, 3, 2.6)) return ['stone', 1.6 + n * 1.1 - l * 0.8];
    const sag = 41.5 + 2.6 * (1 - Math.pow((px - 32) / 5.2, 2));
    if (Math.abs(dx) < 5.2 && Math.abs(py - sag) < 0.8 && (px & 1) === 0) return ['iron', 4.6 - l];
    if (ell(px, py, 26, 41.2, 3, 2.4) <= 1 || ell(px, py, 38, 41.2, 3, 2.4) <= 1) return ['iron', 3.8 - l * 1.2];
    // Lumpen mit Rissen
    const hem = 57 - Math.abs(Math.sin(px * 1.3 + seed)) * 3.5;
    if (py >= 23 && py < hem && Math.abs(dx) < 9.6 + Math.max(0, py - 26) * 0.12) {
      if (ell(px, py, 30, 34, 2.4, 3) <= 1 || ell(px, py, 38, 45, 2, 2.4) <= 1) return skin(3.8);
      if (ell(px, py, 36, 31, 2.2, 1.8) <= 1) return ['blood', 4];
      return ['stone', 1.3 + n * 1.2 - l * 0.8];
    }
    return null;
  }, 128, true);
}

// ---------- Vampire (0.27.0, Blutgruft): 'diener' (Blutdiener: Livree, Kerzenleuchter), 'brut' (Vampirbrut: kahl, Fledermausohren, Reißzahnmaul, Rippen), 'graefin' (Blutgräfin: hoher Kragen, schwarzes Haar, Umhang mit Blutfutter) ----------
// Haut = Material 'iron' (blass, kühl), Augen 'blood' (rot), Reißzähne 'glow' (knochengelb), Kleidung 'ceil' (schwarz) und 'blood' (Futter)
function genVampire(seed, kind) {
  const gr = kind === 'graefin', br = kind === 'brut';
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    const skin = (b) => ['iron', b - l * 0.9 + n * 0.35];
    const cloth = (b) => ['ceil', b - l * 0.5 + n * 0.5];
    const lining = (b) => ['blood', b - l * 0.6 + n * 0.6];
    const fang = ['glow', 6.5];
    const hy = br ? 14 : 13;
    // Augen
    if (br) { if (ell(px, py, 28.8, hy, 1.8, 1.5) <= 1 || ell(px, py, 35.2, hy, 1.8, 1.5) <= 1) return ['blood', 7]; }
    else if (ell(px, py, 29.2, hy, 1.45, 1.1) <= 1 || ell(px, py, 34.8, hy, 1.45, 1.1) <= 1) return ['blood', 7];
    // Brauen (finster, schräg)
    if (cap(px, py, 25.8, hy - 4.2, 30.6, hy - 2.4, 0.55, 0.4) || cap(px, py, 38.2, hy - 4.2, 33.4, hy - 2.4, 0.55, 0.4)) return ['ceil', 0];
    // Mund und Reißzähne
    if (br) {
      if (ell(px, py, 32, 20.2, 4.8, 2.7) <= 1 && py > 18.2) {
        for (let i = 0; i < 4; i++) if (cap(px, py, 29.2 + i * 1.9, 18.4, 29.4 + i * 1.9, 21.2, 0.6, 0.08)) return fang;
        if (cap(px, py, 29.4, 23.4, 29.4, 20.4, 0.7, 0.08) || cap(px, py, 34.6, 23.4, 34.6, 20.4, 0.7, 0.08)) return fang;
        return ['ceil', 0];
      }
      if (ell(px, py, 31, 17, 0.55, 0.8) <= 1 || ell(px, py, 33, 17, 0.55, 0.8) <= 1) return ['ceil', 0]; // Nasenschlitze
    } else {
      if (cap(px, py, 30.4, 19.4, 30.4, 22.4, 0.6, 0.08) || cap(px, py, 33.6, 19.4, 33.6, 22.4, 0.6, 0.08)) return fang;
      if (cap(px, py, 29.4, 19.3, 34.6, 19.3, 0.75, 0.75)) return gr ? lining(4.6) : ['ceil', 0.4];
    }
    // Kopf
    if (gr) {
      const face = ell(px, py, 32, 14.4, 6.2, 7.6) <= 1;
      if (face) return skin(5.9);
      if (ell(px, py, 32, 12, 9.6, 10.4) <= 1 && py < 22) return cloth(0.3);                 // schwarzes Haar
      if (Math.abs(Math.abs(dx) - 8) < 2.2 && py > 14 && py < 36 - Math.abs(dx) * 0.4) return cloth(0.4); // Strähnen
      // hoher Kragen hinter dem Kopf
      if (cap(px, py, 18.5, 29, 15.5, 7, 3.6, 1.3) || cap(px, py, 45.5, 29, 48.5, 7, 3.6, 1.3)) return lining(2.4);
    } else if (br) {
      if (cap(px, py, 25.8, 12, 17.6, 1.6, 2.6, 0.3) || cap(px, py, 38.2, 12, 46.4, 1.6, 2.6, 0.3)) return skin(4.2); // Fledermausohren
      if (ell(px, py, 32, hy, 6.8, 8) <= 1) return skin(5.1);
    } else {
      if (ell(px, py, 32, 8.6, 6.8, 4.6) <= 1 && py < 10.2 + Math.abs(dx) * 0.2) return cloth(0.3);   // glatt zurückgekämmtes Haar
      if (ell(px, py, 32, 13.2, 6.4, 7.4) <= 1) return skin(5.8);
    }
    // Hals
    if (Math.abs(dx) < 2.5 && py > 20 && py < 26) return br ? skin(4) : skin(4.8);
    if (!gr && !br && Math.abs(dx) < 4.6 && py > 22 && py < 25) return ['glow', 5.4 - l * 0.6]; // weißer Kragen des Dieners
    // Hände mit Krallen
    const hand = (cx, cy) => ell(px, py, cx, cy, 2.3, 2.8) <= 1;
    const claws = (cx, cy) => [-1, 0, 1].some((k) => cap(px, py, cx + k * 1.3, cy + 2, cx + k * 1.7, cy + (br ? 8 : 5.5), 0.5, 0.1));
    const hxL = gr ? 14.2 : 15.5, hxR = gr ? 49.8 : 48.5, hyy = br ? 46 : 43.5;
    if (hand(hxL, hyy) || hand(hxR, hyy)) return skin(4.8);
    if (claws(hxL, hyy) || claws(hxR, hyy)) return ['iron', 7];
    // Kerzenleuchter des Dieners (rechts)
    if (!gr && !br) {
      if (ell(px, py, 48.5, 25.5, 1.7, 2.3) <= 1) return ['glow', 7];
      if (cap(px, py, 48.5, 27, 48.5, 42, 0.8, 0.8) || cap(px, py, 45.8, 42, 51.2, 42, 0.8, 0.8)) return ['wood', 3.4 - l * 0.8];
    }
    // Arme
    const arm = br ? skin(4) : gr ? lining(2.9) : cloth(1.7);
    if (cap(px, py, 23.4, 27, hxL + 1, hyy - 3, br ? 2.4 : 3.5, br ? 1.9 : 2.8) || cap(px, py, 40.6, 27, hxR - 1, hyy - 3, br ? 2.4 : 3.5, br ? 1.9 : 2.8)) return arm;
    // Rumpf, Umhang, Beine
    if (gr) {
      const hw = 8.4 + Math.max(0, py - 26) * 0.42;
      if (py >= 24 && py < 60 - (Math.sin(px * 1.1 + seed) + 1) * 1.3 && Math.abs(dx) < hw) {
        if (Math.abs(dx) > hw - 3.6 && py > 28) return lining(2.9);
        if (Math.abs(dx) < 0.6 && py > 27 && py < 44) return ['iron', 2.6];
        if (py > 24 && py < 30 && Math.abs(dx) < 4.4) return skin(5.2); // Dekolleté
        return cloth(1 + n * 0.5);
      }
    } else if (br) {
      const hw = 8.2 + Math.max(0, py - 30) * 0.05;
      if (py >= 24 && py < 47 && Math.abs(dx) < hw) {
        if (Math.abs(dx) < 3.6 && py < 44) return (py * 1.7) % 3.4 < 1.3 ? ['ceil', 0.8] : skin(4);   // Rippen
        return cloth(1.2 + n * 0.9);
      }
      if (py >= 46 && py < 60 && (Math.abs(dx - 5.4) < 3.5 || Math.abs(dx + 5.4) < 3.5) && py < 60 - Math.abs(Math.sin(px * 1.5 + seed)) * 2.4) return cloth(1.5 + n * 0.6); // zerfetzte Hosenbeine
    } else {
      if (py >= 24 && py < 46 && Math.abs(dx) < 9) {
        if (Math.abs(dx) < 3.3 && py > 25) { if (Math.abs(dx) < 0.7 && ((py - 29) % 5 < 1.2)) return ['glow', 6.4]; return lining(3.6 - l * 0.4); } // rote Weste mit Knöpfen
        return cloth(1.7);
      }
      if (py >= 45 && py < 59 && (Math.abs(dx - 4.2) < 3.3 || Math.abs(dx + 4.2) < 3.3)) return py > 56 ? ['ceil', 0.3] : cloth(1.2);
    }
    return null;
  }, 128, true);
}

// ---------- Moorsee (0.28.0): Wasser- und Bohlenboden, Fuhrmann, Boot, Gnom, Riesenspinne ----------
function genWater(seed, n) { // kachelbar: Wellen aus ganzzahligen Frequenzen, selten Glanzpunkte; Material 'ice' (blau) in dunklen Stufen
  const t = { w: n, h: n, data: new Uint8Array(n * n) }, T = Math.PI * 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    const r = Math.sin(T * (3 * u + 0.6 * Math.sin(T * 2 * v))) + Math.sin(T * (4 * v + 0.5 * Math.sin(T * 3 * u))) * 0.8 + Math.sin(T * (2 * u + 2 * v));
    let sh = 2.1 + (r + 2.6) * 0.42 + hash(x >> 1, y >> 1, seed) * 0.5;
    if (r > 1.9 && hash(x, y, seed + 3) > 0.55) sh = 5.6; // Glanzlicht
    t.data[y * n + x] = P('ice', sh);
  }
  return t;
}
function genPlanks(seed, n) { // Bohlen quer zur Laufrichtung (Bretter liegen in x-Richtung); 8 Bretter je Kachel
  const t = { w: n, h: n, data: new Uint8Array(n * n) }, bh = n / 8;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const row = Math.floor(y / bh), off = Math.floor(hash(row, 7, seed) * n);
    const gap = y % bh < Math.max(1, bh / 10);
    const joint = ((x + off) % (n / 2)) < Math.max(1, n / 64);
    const nail = ((x + off) % (n / 2)) === 3 && (y % bh) > bh * 0.35 && (y % bh) < bh * 0.55;
    let c = P('wood', 3.2 + hash(row, 3, seed) * 0.9 + (hash(x >> 2, y, seed + 1) - 0.5) * 0.7);
    if (gap || joint) c = P('wood', 0.7);
    else if (nail) c = P('iron', 4);
    t.data[y * n + x] = c;
  }
  return t;
}
function genFerryman(seed) { // Fuhrmann: Strohhut, wetterbraunes Gesicht, Ölmantel, Ruder
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3];
    if (ell(px, py, 28.6, 14, 1.1, 1.2) <= 1 || ell(px, py, 35.4, 14, 1.1, 1.2) <= 1) return ['ceil', 0];
    if (cap(px, py, 29.6, 19.5, 34.4, 19.5, 0.6, 0.6)) return ['ceil', 1.2];
    // Strohhut: breite Krempe, flacher Kegel
    if (Math.abs(py - 9.6) < 1.3 && Math.abs(dx) < 13.5) return ['wood', 4.2 + n * 0.8 - l * 0.8];
    if (py > 2.5 && py < 9.6 && Math.abs(dx) < (py - 2.5) * 0.9 + 1.5) return ['wood', 4.6 + n * 0.7 - l];
    if (ell(px, py, 32, 14.6, 6.3, 7.2) <= 1) { if (py > 17.5 && Math.abs(dx) < 5.2) return ['stone', 4.4 - l * 0.6 + n * 0.8]; return skin(4.6); } // graue Bartstoppeln
    if (Math.abs(dx) < 2.6 && py > 20 && py < 24) return skin(3.8);
    // Ruder rechts: Holm und Blatt
    if (cap(px, py, 49, 6, 49, 52, 1.1, 1.1)) return ['wood', 3.4 - l * 0.8];
    if (ell(px, py, 49, 53, 3.4, 6.2) <= 1) return ['wood', 4 - l * 0.8 + n * 0.4];
    // Arme und Hände
    if (ell(px, py, 47.4, 33, 2.4, 2.8) <= 1 || ell(px, py, 15.5, 40, 2.4, 2.8) <= 1) return skin(4.2);
    const coat = ['ice', 2.6 + n * 0.7 - l * 0.9]; // Ölmantel
    if (cap(px, py, 22, 26, 16.5, 38, 3.4, 2.8) || cap(px, py, 42, 26, 46, 33, 3.4, 2.8)) return coat;
    const hw = 9.6 + Math.max(0, py - 26) * 0.12;
    if (py >= 23 && py < 56 && Math.abs(dx) < hw) {
      if (py > 37 && py < 39.4) return ['wood', 1.8]; // Strick als Gürtel
      return py > 50 ? ['ice', 2 + n * 0.7 - l * 0.6] : coat;
    }
    if (py >= 55 && py < 60 && (Math.abs(dx - 4.4) < 3.3 || Math.abs(dx + 4.4) < 3.3)) return ['wood', 1.4 + n * 0.4];
    return null;
  }, 128, true);
}
// 0.31.13: Möbel für das Innere der Blockhütte (Typ decor, look = Name)
function genFurn(kind, seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), ax = Math.abs(px - 32), wd = (b) => ['wood', b - l * 0.9 + n * 0.45];
    if (kind === 'fassKaputt') { // 0.44.0: zerschlagenes Fass – Dauben, Eisenreifen, Splitter am Boden
      const edge = 1 - Math.pow((py - 55) / 6, 2);
      if (Math.hypot((px - 21) / 9, (py - 54) / 3.4) > 0.78 && Math.hypot((px - 21) / 9, (py - 54) / 3.4) < 1) return ['iron', 3.4 - l * 0.6];
      if (py >= 48 && py <= 61 && ax < 20 * Math.max(0, edge) + 4) return wd(3.0 + ((px * 0.9) % 5 < 0.8 ? -0.9 : 0) + n * 0.4);
      if (py >= 38 && py < 50 && Math.abs((px - 44) - (50 - py) * 0.55) < 2.2) return wd(4.2); // schräg ragende Daube
      if (py >= 42 && py < 54 && Math.abs((px - 30) + (52 - py) * 0.45) < 1.8) return wd(3.8);
      if (py >= 58 && py <= 62 && ax < 28 && ((px * 7 + py * 3) % 9 === 0)) return wd(4.6); // Splitter
      return null;
    }
    if (kind === 'fass') {
      const rx = 14 + (1 - Math.pow((py - 40) / 20, 2)) * 3;
      if (py >= 20 && py <= 60 && ax < rx) return (Math.abs(py - 27) < 1.3 || Math.abs(py - 52) < 1.3) ? ['iron', 3.6 - l * 0.6] : ['wood', 3.2 - l * 1.2 + ((px * 0.7) % 4 < 0.7 ? -0.8 : 0) + n * 0.4];
      if (py >= 17.5 && py < 20 && ax < 12) return wd(4.4);
    } else if (kind === 'schutt') { // 0.33.0: Geröllhaufen: aufgeschüttete Steinbrocken
      const dome = 58 - 24 * Math.sqrt(Math.max(0, 1 - (ax / 27) ** 2)) + Math.sin(px * 1.3) * 1.3 + Math.sin(px * 0.45 + 1) * 2;
      if (py >= dome && py <= 61 && ax < 28) { const cell = (Math.floor((px + (py > 50 ? 3 : 0)) / 6) * 7 + Math.floor(py / 5) * 3) % 4; return ['stone', 2.2 + cell * 0.55 - l * 1.1 + n * 0.7 - (py - dome < 1.6 ? -1.2 : 0)]; }
    } else if (kind === 'tisch') {
      if (py >= 34 && py < 39 && ax < 27) return wd(4.2);
      if (py >= 39 && py < 42 && ax < 27) return wd(2.2);
      if (py >= 42 && py <= 61 && Math.abs(ax - 23) < 2.3) return wd(2.6);
      if (px > 28 && px < 33 && py > 25 && py < 34) return ['glow', 5.8 + n]; // Kerze
      if (ell(px, py, 30.5, 22.5, 1.8, 2.8) <= 1) return ['glow', 7];
    } else if (kind === 'stuhl') {
      if (py >= 40 && py < 45 && ax < 11) return wd(3.8);
      if (py >= 15 && py < 40 && ax >= 8 && ax < 11.5) return wd(2.8);
      if (py >= 15 && py < 24 && ax < 11.5) return wd(3.3);
      if (py >= 45 && py <= 61 && Math.abs(ax - 8.6) < 1.7) return wd(2.4);
    } else if (kind === 'bett') {
      if (py >= 26 && py <= 60 && px >= 6 && px < 12) return wd(3);       // Kopfbrett
      if (py >= 38 && py <= 60 && px >= 52 && px < 57) return wd(2.8);   // Fußbrett
      if (py >= 42 && py < 56 && px >= 12 && px < 52) { if (ell(px, py, 21, 43, 6.5, 3.4) <= 1) return ['glow', 6.2 - l * 0.4]; return ['blood', 3.4 - l * 0.7 + n * 0.5 + (Math.abs(((px - 12) % 9)) < 0.5 ? -0.7 : 0)]; }
      if (py >= 56 && py <= 61 && px >= 6 && px < 57) return wd(2.2);
    } else if (kind === 'regal') {
      if (py >= 6 && py <= 62 && ax < 19) {
        if (ax >= 17 || (py >= 5 && py < 8) || [20, 34, 48, 61].some((q) => Math.abs(py - q) < 1.4)) return wd(3.2);
        const bk = Math.floor((px + 40) / 3), cols = ['blood', 'ice', 'moss', 'glow', 'wood'], bh = [20, 34, 48].find((q) => py < q) || 48;
        if (py > bh - 11 - (hash(bk, bh, seed) * 3) && ax < 16) return [cols[Math.floor(hash(bk, bh + 1, seed) * 5)], 3.4 + hash(bk, bh + 2, seed) * 1.4 - l * 0.5];
        return ['ceil', 0.4];
      }
    } else if (kind === 'tresen') { // 0.39.0: Schanktheke mit Krügen (Teile reihen sich zu einer Theke)
      const mug = [14, 26, 40, 51].find((cx) => Math.abs(px - cx) < 3 && py >= 22 && py < 30);
      if (mug != null) return py < 24 ? ['glow', 6.8] : ['iron', 4.6 - l * 0.8 + n * 0.3];
      if (py >= 30 && py < 35 && ax < 31) return wd(5 - (py - 30) * 0.25);
      if (py >= 35 && py <= 61 && ax < 29) { if (ax > 26.5 || ax < 1.2 || py > 57) return wd(2.3); return wd(3.2 + (Math.floor((px + 40) / 8) % 2) * 0.55); }
    } else if (kind === 'weinregal') { // 0.39.0: Regal mit liegenden Flaschen (Stirnseiten rot, grün, hell)
      if (py >= 5 && py <= 62 && ax < 21) {
        if (ax >= 19 || py < 9 || py > 59.5 || [22, 38, 54].some((q) => Math.abs(py - q) < 1.5)) return wd(3.1);
        const cx = [14.5, 23.5, 32.5, 41.5, 50.5].find((q) => Math.abs(px - q) < 4.5), cy = [15.5, 30.5, 46.5].find((q) => Math.abs(py - q) < 7.5);
        if (cx != null && cy != null && ell(px, py, cx, cy, 3.6, 3.6) <= 1) { const h = hash(Math.round(cx), Math.round(cy), seed), r = ell(px, py, cx, cy, 1.5, 1.5) <= 1; return r ? ['wood', 4.8] : h < 0.45 ? ['blood', 2.6 - l * 0.5] : h < 0.75 ? ['moss', 3.2 - l * 0.5] : ['glow', 4.2 - l * 0.5]; }
        return ['ceil', 0.3];
      }
    } else if (kind === 'weinfass') { // 0.39.0: liegendes Fass auf Gestell, Stirnseite mit Reifen, Zapfhahn und Tropfen
      const dx2 = px - 32, dy2 = py - 36, r = Math.hypot(dx2, dy2);
      if (Math.abs(px - 32) < 2.3 && py >= 41 && py < 48.5) return ['iron', 4.8 - l * 0.4];
      if (ell(px, py, 32, 50, 1.6, 2.2) <= 1) return ['blood', 3.6];
      if (r < 22) { if (r > 19) return ['iron', 3.8 - l * 0.7]; if (ell(px, py, 32, 24, 2.2, 1.7) <= 1) return wd(1.4); if (Math.abs(r - 13) < 0.8 || Math.abs(r - 6.5) < 0.8) return wd(2.1); return wd(3.5 + (Math.floor((dx2 + 40) / 5) % 2) * 0.55); }
      if (py >= 54 && py <= 62 && ax >= 10 && ax < 25) return wd(2.3);
    } else if (kind === 'kamin') {
      if (py >= 18 && py <= 62 && ax < 21) {
        if (ax < 10 && py >= 38) { // Feuerstelle
          if (ell(px, py, 32, 52, 6, 9) <= 1) return ['glow', 6.4 - Math.abs(px - 32) * 0.15];
          if (ell(px, py, 32, 54, 9, 11) <= 1) return ['blood', 4.2];
          return ['ceil', 0.2];
        }
        return ['stone', 3.8 - l * 0.8 + n * 0.5 - ((py % 9) < 0.9 || ((px + (Math.floor(py / 9) % 2) * 5) % 10) < 0.9 ? 1 : 0)];
      }
      if (py >= 14 && py < 18 && ax < 24) return ['stone', 4.8 - l * 0.6];
      if (py >= 2 && py < 14 && ax < 9) return ['stone', 3.2 - l * 0.6 + n * 0.4];
    } else if (kind === 'kaktus') { // 0.32.0: Säulenkaktus mit Armen, Rippen, Dornen und Blüte
      const rib = Math.sin(px * 2.1) * 0.35, col = (b) => ['moss', b - l * 0.9 + rib + n * 0.3];
      if (ell(px, py, 32, 15.5, 2.6, 1.7) <= 1) return ['blood', 5.2];
      if (cap(px, py, 32, 61, 32, 20, 6.2, 5.2) || cap(px, py, 32, 41, 19, 41, 3.8, 3.8) || cap(px, py, 19, 41, 19, 28, 3.4, 3) || cap(px, py, 32, 34, 45, 34, 3.8, 3.8) || cap(px, py, 45, 34, 45, 22, 3.4, 3)) {
        if (hash(x, y, seed + 4) > 0.965) return ['glow', 6.6];
        return col(3.2);
      }
    } else if (kind === 'haengematte') { // 0.32.0: Hängematte zwischen zwei Palmen (Sprite zweifach breit: Enden liegen an den Stämmen der Nachbarfelder)
      const u = (px - 32) / 27, sag = 53 + 6 * (1 - u * u); // 0.32.1: tief gehängt (Liegefläche knapp über dem Boden, vorher auf Kopfhöhe)
      const band = Math.floor((px + 40) / 3) % 2;
      if (Math.abs(u) <= 1 && py >= sag && py < sag + 4) return band ? ['blood', 4.4 - l * 0.7 + n * 0.3] : ['glow', 5.6 - l * 0.7 + n * 0.3];
      if (ell(px, py, 22, sag - 0.9, 5, 1.8) <= 1 && Math.abs(u) <= 1) return ['ice', 6.4 - l * 0.4]; // Kissen
      if (cap(px, py, 0, 48.5, 5, 52.5, 0.9, 0.9) || cap(px, py, 64, 48.5, 59, 52.5, 0.9, 0.9)) return ['wood', 2.4]; // Seile
    } else if (kind === 'vase') { // 0.32.1: Blumenvase (Keramik, drei Blüten)
      const body = ell(px, py, 32, 49, 9, 12) <= 1 || (py >= 30 && py < 40 && ax < 3.6 + (py - 30) * 0.2) || (py >= 28.5 && py < 31 && ax < 5.4);
      if (body) { if (py > 44 && py < 47 && ax < 10) return ['glow', 4.6 - l * 0.6]; return ['ice', 4.2 - l * 1.0 + n * 0.3]; }
      if (cap(px, py, 32, 29, 32, 14, 0.9, 0.9) || cap(px, py, 32, 29, 25, 18, 0.8, 0.8) || cap(px, py, 32, 29, 40, 19, 0.8, 0.8)) return ['moss', 3.2 - l * 0.5];
      if (ell(px, py, 28, 23, 4, 1.6) <= 1 || ell(px, py, 37, 25, 4, 1.6) <= 1) return ['moss', 3.8 - l * 0.5];
      if (ell(px, py, 32, 12.5, 1.7, 1.7) <= 1) return ['glow', 6.8];
      if (ell(px, py, 32, 12.5, 5, 5) <= 1) return ['blood', 5.2 - l * 0.4 + n * 0.3];
      if (ell(px, py, 25, 17, 3.6, 3.6) <= 1 || ell(px, py, 40, 18, 3.6, 3.6) <= 1) return ['glow', 5.4 - l * 0.4 + n * 0.3];
    } else if (kind === 'kueche') { // 0.32.1: Küchenecke (Zeile mit Steinplatte, Kochtopf mit Dampf, hängende Kelle und Pfanne)
      if (py >= 33 && py <= 61 && ax < 27) {
        if (py < 38) return ['stone', 5.2 - l * 0.7 + n * 0.3];
        if (ax > 25.4 || Math.abs(px - 32) < 0.8) return wd(1.8);
        if (Math.abs(px - 27) < 1.2 && py > 44 && py < 49 || Math.abs(px - 37) < 1.2 && py > 44 && py < 49) return ['iron', 5];
        return wd(3.6);
      }
      if (px > 14 && px < 31 && py >= 22 && py < 33) return (py < 24 || py > 31 ? ['iron', 4.8 - l * 0.6] : ['iron', 3.2 - l * 0.8 + n * 0.3]); // Kochtopf
      if (cap(px, py, 31, 25, 36, 24, 0.8, 0.8)) return ['iron', 4.2]; // Topfgriff
      if (py < 20 && py > 4 && Math.abs(px - 22.5 - Math.sin(py * 0.5) * 1.6) < 1.1 && hash(x, y, seed + 7) > 0.3) return ['ice', 6.2]; // Dampf
      if (cap(px, py, 46, 6, 46, 30, 0.6, 0.6) || ell(px, py, 46, 31, 2.4, 2.4) <= 1) return ['iron', 4.4]; // Kelle
      if (ell(px, py, 54, 22, 4.6, 4.6) <= 1 && px < 59) return ['iron', 3.4 - l * 0.5]; // Pfanne
    } else if (kind === 'spielautomat') { // 0.32.0: einarmiger Bandit
      if (py >= 6 && py <= 61 && ax < 15) {
        if (py < 17 && ax < 13) return (Math.abs(px - 32) < 8 && py > 9 && py < 14) ? ['glow', 7.2] : ['blood', 3.6 - l * 0.7];                 // Leuchtschild
        if (py >= 20 && py < 38 && ax < 11.5) { const k3 = Math.floor((px - 20.5) / 7.7); const cx = 24.2 + k3 * 7.8; if (k3 >= 0 && k3 < 3 && Math.abs(px - cx) < 3.3) { if (ell(px, py, cx, 29, 2.2, 2.4) <= 1) return k3 === 1 ? ['ceil', 0.3] : ['blood', 4.8]; return ['stone', 6.8]; } return ['ceil', 0.5]; }
        if (py >= 46 && py < 54 && ax < 9) return hash(x, y, seed) > 0.9 ? ['glow', 6.6] : ['ceil', 0.3];   // Münzfach
        if (ax >= 13.2 || (py > 17 && py < 20) || (py > 38 && py < 41)) return ['glow', 5.2 - l * 0.6];       // Goldrand
        return ['blood', 3.2 - l * 0.8 + n * 0.3];
      }
      if (cap(px, py, 47, 36, 53, 24, 1.1, 1.1) || ell(px, py, 53.5, 22.5, 2.6, 2.6) <= 1) return py < 25.5 && px > 50 ? ['blood', 5.4] : ['iron', 4.6]; // Hebel
    } else if (kind === 'roulette') { // 0.32.0: Roulettetisch mit Kessel
      if (py >= 44 && py <= 61 && (Math.abs(ax - 25) < 2.6)) return wd(2.4);
      if (py >= 38 && py < 44 && ax < 29) return wd(3.2 - (py - 38) * 0.15);
      if (py >= 30 && py < 38 && ax < 29) { const wx = (px - 32) / 13, wy = (py - 34.5) / 4.4; const q = wx * wx + wy * wy; if (q <= 1) return q < 0.12 ? ['glow', 7] : q < 0.45 ? ['ceil', 0.4] : (Math.floor((Math.atan2(wy, wx) + 3.15) / 0.52) % 2 ? ['blood', 4.4] : ['ceil', 0.6]); if (q <= 1.35) return wd(4.4); return ['moss', 3.1 - l * 0.5 + n * 0.25]; }
      if (py >= 24 && py < 30 && Math.abs(px - 48) < 6) return ['glow', 6 + n]; // Chipstapel
    } else if (kind === 'kartentisch') { // 0.32.0: Pokertisch (grüner Filz, Karten, Chips)
      if (py >= 44 && py <= 61 && Math.abs(ax - 20) < 2.4) return wd(2.2);
      if (ell(px, py, 32, 39, 29, 7.2) <= 1) {
        if (ell(px, py, 32, 39, 26.5, 5.6) > 1) return ['blood', 3.4 - l * 0.6];
        const cx = Math.floor((px - 17) / 6.5), inCard = cx >= 0 && cx < 5 && py > 35.5 && py < 41 && ((px - 17) % 6.5) < 5;
        if (inCard) return ((px - 17) % 6.5) > 1.5 && ((px - 17) % 6.5) < 3.4 && py > 37 && py < 39.5 ? ['blood', 4.8] : ['stone', 6.8];
        if (ell(px, py, 12 + 3, 37, 2.6, 1.3) <= 1 || ell(px, py, 49, 41, 2.6, 1.3) <= 1) return ['glow', 6.4];
        return ['moss', 3 - l * 0.5 + n * 0.25];
      }
    }
    return null;
  }, 128, true);
}
// 0.32.0: Teufel (Murmel verwandelt sich): roter Spieler im Nadelstreifenanzug mit Sonnenbrille, Zigarre, Riesenwürfel und Dreizack-Stock
function genDevil(seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), skin = (b) => ['blood', b - l * 0.9 + n * 0.3];
    const suit = (b) => ['ceil', b - l * 0.5 + n * 0.2 + (((px * 1.4) % 4.2) < 0.55 ? 0.9 : 0)];
    // Zigarre + Glut
    if (ell(px, py, 43.8, 25.6, 1.3, 1.3) <= 1) return ['glow', 7.4];
    if (cap(px, py, 34.5, 24.3, 43, 25.6, 0.95, 0.95)) return ['wood', 2.6];
    // Sonnenbrille mit Glanz
    if (py > 14.2 && py < 18.6 && px > 24.2 && px < 39.8) { if (Math.abs(px - 32) < 1.1) return ['iron', 3]; if (Math.abs(px - 28.2) < 3.4 || Math.abs(px - 35.8) < 3.4) return (py < 15.8 && (px < 27 || (px > 34.4 && px < 36.6))) ? ['stone', 6.8] : ['ceil', 0.15]; }
    // Hörner (dunkel, Spitzen hell) und Ohren
    for (const sg of [-1, 1]) {
      if (cap(px, py, 32 + sg * 7, 11, 32 + sg * 13, 1.5, 2.5, 0.5)) return ((py < 6) ? ['stone', 5.2 - l * 0.4] : ['ceil', 1.1 - l * 0.4 + n * 0.2]);
      if (cap(px, py, 32 + sg * 8.5, 17, 32 + sg * 14.5, 13.5, 1.8, 0.5)) return skin(4.2);
    }
    // Gesicht
    if (ell(px, py, 32, 17.5, 8.4, 9.8) <= 1) {
      if (py > 22.8 && py < 26.4 && Math.abs(px - 32) < 5.8 && py < 25.2 + Math.abs(px - 32) * 0.05) return ((px * 1.1 + py) % 3 < 1.2) ? ['stone', 7] : ['ceil', 0.25]; // Grinsen mit Zähnen
      if (Math.abs(px - 32) < 2.4 && py > 27 && py < 31) return ['ceil', 1.3 + n * 0.4]; // Spitzbart
      if (py > 12 && py < 14.4 && Math.abs(Math.abs(px - 32) - 4.2) < 3.2) return ['ceil', 0.7]; // Brauen
      return skin(4.7);
    }
    if (ell(px, py, 32, 30, 2.7, 4) <= 1 && py > 27) return ['ceil', 1.3 + n * 0.4];
    // Schleife und Weste
    if (py > 29.4 && py < 33.4 && ((Math.abs(px - 32) < 1.2) || ((Math.abs(px - 32) < 5) && (Math.abs(py - 31.4) < 2.1 - Math.abs(px - 32) * 0.28)))) return ['blood', 5.6 - l * 0.4];
    // Würfel (links, in der Hand)
    if (px > 2.5 && px < 17.5 && py > 40 && py < 55) { const cx = 10, cy = 47.5; for (const [dx, dy] of [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4]]) if (Math.hypot(px - cx - dx, py - cy - dy) < 1.5) return ['ceil', 0.2]; return ['stone', 7.2 - l * 0.8 - ((px < 4.5 || py > 53.3) ? 0.9 : 0)]; }
    // Hände
    if (ell(px, py, 12, 52, 3.4, 3) <= 1 || ell(px, py, 54.5, 49, 3.2, 3.2) <= 1) return skin(4.3);
    // Dreizack-Stock rechts
    if (cap(px, py, 55.5, 22, 55.5, 62, 0.85, 0.85) || cap(px, py, 52, 12, 52, 22, 0.75, 0.75) || cap(px, py, 59, 12, 59, 22, 0.75, 0.75) || cap(px, py, 52, 22, 59, 22, 0.8, 0.8) || cap(px, py, 55.5, 7, 55.5, 22, 0.8, 0.8)) return ['iron', 5.4 - l * 0.5];
    // Arme (Anzug)
    if (cap(px, py, 17.5, 33, 11.5, 50, 5.6, 4.2) || cap(px, py, 46.5, 33, 54, 48, 5.6, 4.2)) return suit(1.6);
    // Körper: Jackett, Revers, Weste
    if (py >= 29 && py <= 56) { const hw = 11 + (py - 29) * 0.34; if (Math.abs(px - 32) < hw) { if (Math.abs(px - 32) < 3.4 + (py - 29) * 0.12 && py > 33) return Math.abs(px - 32) < 1.2 && ((py | 0) % 5 === 0) ? ['blood', 4] : ['glow', 5.4 - l * 0.6 + n * 0.3]; return suit(1.7); } }
    // Schwanz
    if (cap(px, py, 44, 54, 58, 57, 1.3, 1.1) || (ell(px, py, 59, 55.5, 3, 2.4) <= 1 && px > 57)) return skin(3.6);
    // Beine und Schuhe
    if (py > 55 && (cap(px, py, 26, 55, 26, 61, 4.2, 4) || cap(px, py, 38, 55, 38, 61, 4.2, 4))) return suit(1.4);
    if (ell(px, py, 25, 62.2, 5.4, 1.9) <= 1 || ell(px, py, 39, 62.2, 5.4, 1.9) <= 1) return ['ceil', 0.3 + l * 0.2];
    return null;
  }, 128, true);
}

// 0.32.0: Spielhöllen-Teppich (Bodenzeichen '+'): rot-schwarzes Karomuster mit goldenen Rauten
function genCarpet(seed, n) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) }, q = n / 4;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const cx = Math.floor(x / q), cy = Math.floor(y / q), u = (x % q) / q - 0.5, v = (y % q) / q - 0.5, red = (cx + cy) % 2 === 0;
    let c = red ? P('blood', 3.6 + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.5) : P('ceil', 0.5 + (hash(x >> 1, y >> 1, seed + 1) - 0.5) * 0.4);
    const rim = Math.min(Math.abs(u), Math.abs(v)) > 0.44 ? 1 : 0;
    if (Math.abs(u) + Math.abs(v) < 0.2 || rim) c = P('glow', red ? 5.8 : 6.4);
    t.data[y * n + x] = c;
  }
  return t;
}

function genPaving(seed, n) { // 0.32.1: Steinplatten (Brücke): 2×2 Platten je Feld, dunkle Fugen, leicht versetzt und gesprenkelt
  const t = { w: n, h: n, data: new Uint8Array(n * n) }, q = n / 2, jw = Math.max(1, Math.round(n / 48));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const row = Math.floor(y / q), xs = (x + (row & 1) * (q / 2)) % n, col = Math.floor(xs / q), joint = (y % q) < jw || (xs % q) < jw;
    t.data[y * n + x] = P('stone', (joint ? 1.2 : 3.4 + (hash(col, row, seed) - 0.5) * 1.2 + (hash(x >> 1, y >> 1, seed + 2) - 0.5) * 0.7));
  }
  return t;
}
function genRug(seed, n) { // 0.32.1: Wohnteppich (warmes Rot, helle Streifen, Rautenmuster; nahtlos je Feld)
  const t = { w: n, h: n, data: new Uint8Array(n * n) }, q = n / 4;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x % q) / q - 0.5, v = (y % q) / q - 0.5;
    let c = P('blood', 2.8 + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.6);
    if (Math.abs(u) + Math.abs(v) < 0.22) c = P('glow', 4.6 + (hash(x >> 1, y >> 1, seed + 1) - 0.5) * 0.4);
    else if (y % q < 2) c = P('glow', 3.8);
    t.data[y * n + x] = c;
  }
  return t;
}

function genBoat(seed) { // 0.32.1: Ruderboot von der Seite: geschwungener Rumpf mit spitzem Bug und Heck, hochgezogene Steven, Sitzbank, Ruder
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32, ax = Math.abs(dx), q = Math.min(1, ax / 28);
    const top = 46 - 11 * q * q;                                  // Dollbord: steigt zu Bug und Heck
    const bot = top + 13 * Math.sqrt(Math.max(0, 1 - q * q));       // Kiel: Rumpf läuft an den Enden spitz zusammen
    if (ax < 28.5) {
      if (py >= top - 0.4 && py < top + 1.6 && py < bot) return ['wood', 5 - l * 0.8];                        // Dollbord (hell)
      if (py >= top + 1.6 && py < bot) {
        const lap = Math.floor((py - top) / 3.2);
        return ['wood', (((py - top) % 3.2) < 0.8 ? 0.9 : 2.5 + hash(lap, 5, seed) * 0.8) - l * 0.7 + n * 0.3]; // Klinkerplanken
      }
      if (ax > 25 && py < top && py > top - 6 + (ax - 25) * 1.2) return ['wood', 3.4 - l * 0.6];              // Steven (hochgezogene Enden)
    }
    if (ax < 5 && py >= top - 2 && py < top + 0.6) return ['wood', 4.2 - l * 0.6];                              // Sitzbank ragt über den Rand
    if (cap(px, py, 17, top - 4, 46, top + 2, 0.9, 0.9)) return ['wood', 3.6 - l * 0.6];                         // Ruder quer über dem Boot
    if (ell(px, py, 48.5, top + 2.6, 4.4, 1.8) <= 1) return ['wood', 4.4 - l * 0.6];                              // Ruderblatt
    return null;
  }, 128, true);
}
function genGnome(seed) { // Gnom: rote Zipfelmütze, große Nase, langer weißer Bart, blaue Jacke, Würfel in der Hand
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    const skin = (b) => ['glow', b - l * 0.8 + n * 0.3];
    if (ell(px, py, 29.4, 29, 1.0, 1.1) <= 1 || ell(px, py, 34.6, 29, 1.0, 1.1) <= 1) return ['ceil', 0];
    if (ell(px, py, 32, 31.6, 2.0, 1.8) <= 1) return skin(3.6);                              // dicke Nase
    // Würfel in der rechten Hand (heller Würfel, Punkte)
    if (Math.abs(px - 46.5) < 3.2 && Math.abs(py - 45) < 3.2) return ((Math.abs(px - 45.2) < 0.7 && Math.abs(py - 43.8) < 0.7) || (Math.abs(px - 47.8) < 0.7 && Math.abs(py - 46.2) < 0.7)) ? ['ceil', 0] : ['iron', 7];
    // Zipfelmütze, leicht abgeknickt
    const tipx = 38 + (py < 12 ? (12 - py) * 0.5 : 0);
    if (py > 4 && py < 25 && Math.abs(px - (32 + (24 - py) * 0.22 + (py < 12 ? (12 - py) * 0.5 : 0))) < (py - 4) * 0.32 + 0.5) return ['blood', 4.4 - l * 0.8 + n * 0.5];
    if (Math.abs(py - 24.6) < 1.5 && Math.abs(dx) < 9.2) return ['blood', 3.2 - l * 0.6];   // Krempe
    if (ell(px, py, 32, 29.6, 6.0, 5.8) <= 1 && py < 33) return skin(4.8);                    // Gesicht
    // Bart: von den Wangen bis zum Gürtel, spitz
    if (py >= 31 && py < 49 && Math.abs(dx) < 6.4 - (py - 31) * 0.22 && Math.abs(dx) < 4.2 + (49 - py) * 0.18) return ['iron', 6.6 - l * 0.7 + n * 0.8];
    if (cap(px, py, 24, 38, 18, 47, 3.2, 2.6) || cap(px, py, 40, 38, 45, 45, 3.2, 2.6)) return ['ice', 3.4 - l * 0.8 + n * 0.5]; // Ärmel
    if (ell(px, py, 17.6, 48, 2.2, 2.4) <= 1 || ell(px, py, 46.5, 46, 2.2, 2.4) <= 1) return skin(4.4);
    const hw = 9 + Math.max(0, py - 36) * 0.14;
    if (py >= 34 && py < 56 && Math.abs(dx) < hw) { if (py > 47 && py < 49.2) return ['wood', 1.6]; return ['ice', 3 + n * 0.7 - l * 0.8]; }
    if (py >= 55 && py < 61 && (Math.abs(dx - 4.2) < 3.5 || Math.abs(dx + 4.2) < 3.5)) return ['wood', 1.8 + n * 0.5 - l * 0.4];
    return null;
  }, 128, true);
}
function genCocoon(seed) { // 0.33.0: eingesponnener Mensch: weißgraue Seidenwalze mit Fadenbändern, oben schaut ein Gesicht heraus (lebt noch)
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    if (ell(px, py, 32, 13.5, 5.4, 6.4) <= 1) { // Gesicht
      if (ell(px, py, 29.6, 12.6, 1.1, 1.3) <= 1 || ell(px, py, 34.4, 12.6, 1.1, 1.3) <= 1) return ['ceil', 0];
      if (py > 17.2 && py < 18.2 && Math.abs(dx) < 1.8) return ['blood', 3.6];
      return ['glow', 5 - l * 0.8 + n * 0.3];
    }
    const wob = Math.sin(py * 0.35) * 0.6;
    const rx = py < 20 ? 9.5 : 11.5 - Math.pow(Math.max(0, py - 38) / 22, 2) * 6;
    if (py >= 19 && py <= 61 && Math.abs(dx - wob) < rx) {
      const band = (Math.abs((py * 1.0 + dx * 0.9) % 6) < 1.1) || (Math.abs((py - dx * 0.8) % 9) < 0.9);
      return ['stone', (band ? 7.2 : 5.1) - l * 1.2 + n * 0.9];
    }
    if (py >= 14 && py < 19 && Math.abs(dx) < 8) return ['stone', 5.8 - l * 1.0 + n * 0.8]; // Seide um den Hals
    for (const sx of [-1, 1]) if (cap(px, py, 32 + sx * 6, 50, 32 + sx * 16, 62, 0.5, 0.3)) return ['stone', 6.4]; // Fäden zum Boden
    return null;
  }, 128, true);
}

function genSpider(seed, queen = false) { // schwarze Riesenspinne: dicker Hinterleib mit roter Sanduhr, sechs rote Augen, Beißklauen, acht behaarte Beine
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1), dx = px - 32;
    const blk = (b) => ['ceil', b - l * 0.5 + n * 0.45];
    for (const [ex, ey, r] of [[29.4, 24.4, 1.15], [34.6, 24.4, 1.15], [27.6, 22.2, 0.8], [36.4, 22.2, 0.8], [30.8, 21.6, 0.7], [33.2, 21.6, 0.7]]) if (ell(px, py, ex, ey, r, r) <= 1) return [queen ? 'ice' : 'blood', 7];
    if (cap(px, py, 30, 29, 29.2, 34.6, 0.9, 0.2) || cap(px, py, 34, 29, 34.8, 34.6, 0.9, 0.2)) return ['glow', 6.6]; // Beißklauen
    // Sanduhr auf dem Hinterleib
    if (Math.abs(dx) < 3.6 - Math.abs(py - 40) * 0.2 && py > 33.5 && py < 46.5 && ell(px, py, 32, 40, 4.5, 8) <= 1 && !(py > 39 && py < 41 && Math.abs(dx) > 1.6)) return [queen ? 'glow' : 'blood', 5.8 - l * 0.4];
    // Beine (vier je Seite): Oberschenkel nach oben-außen, Schiene nach unten
    for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) {
      const ay = 24 + i * 3.4, kx = 32 + sg * (19 + i * 2.2), ky = 8 + i * 5.2 + (i === 3 ? 6 : 0), fx = 32 + sg * (26 + i * 1.2), fy = 50 + (i > 1 ? 5 : 0);
      if (cap(px, py, 32 + sg * 6, ay, kx, ky, 1.9, 1.4) || cap(px, py, kx, ky, fx, fy, 1.4, 0.45)) return blk(1.2 + (hash(x, y, seed + i) > 0.82 ? 1.4 : 0));
    }
    if (queen && py > 14 && py < 21 && Math.abs(dx) < 8 && ((Math.abs(dx) * 1.3 + py) % 4.2) < 1.3 + (21 - py) * 0.1 && py < 20 - Math.abs(dx) * 0.2) return ['glow', 5.6 - l * 0.5]; // Krone aus Dornen
    if (ell(px, py, 32, 25.6, 7.4, 6.2) <= 1) return blk(1.5);       // Kopfbruststück
    if (ell(px, py, 32, 40, 12.6, 11.6) <= 1) return blk(0.9 + (lit(px, py) > 0 ? 0 : 0.0));  // Hinterleib
    return null;
  }, 128, true);
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
      const qx = 50.5 + (px - 50.5) / 0.62, qy = 51 + (py - 51) / 0.62; // 0.19.23: Knauf kleiner (Nutzer: „bleibt, aber kleiner“)
      const pr = Math.hypot(qx - 50.5, qy - 51);
      if (ell(qx, qy, 49.5, 50.4, 0.95, 1.0) <= 1 || ell(qx, qy, 51.5, 50.4, 0.95, 1.0) <= 1) return ['ice', 7]; // 0.19.16: blaue Augen im Schädel (Nutzer)
      if (Math.abs(qx - 50.5) < 0.4 && qy > 51.6 && qy < 52.5) return ['ceil', 0]; // Nase
      if (ell(qx, qy, 50.5, 50.6, 2.5, 2.6) <= 1 || (Math.abs(qx - 50.5) < 1.3 && qy > 52.6 && qy < 54.6 && (Math.floor((qx - 49) * 2) % 2 === 0 || qy > 53.9))) return ['glow', 6.8]; // Schädel, Kiefer mit Zähnen
      if (pr > 3.7 && pr < 4.7) return ['glow', 6.4]; // Siegelkreis
      if (pr <= 3.7 && pr > 2.5) return ['iron', 2.2]; // dunkle Füllung im Kreis
      if (cap(px, py, 50.5, 31, 50.5, 36, 1.6, 1.2) && hash(px, py, seed + 31) > 0.6) return ['blood', 3.6]; // Blut am unteren Klingenteil
      // 0.19.19 (Nutzer: „Es muss deutlicher werden, dass er das Schwert in den Händen hält“): Panzerfaust umschließt den Griff, Fingerglieder, Daumen, Unterarm
      { const fd = ell(px, py, 50.5, 41.6, 3.5, 3.1);
        if (fd <= 1) return fd > 0.78 ? ['ceil', 0.6] : Math.abs(((py - 38.9) % 1.6)) < 0.3 && py > 39 ? ['iron', 6.6] : ['wood', 2.4 - l * 0.8 + n * 0.5]; // dunkler Lederhandschuh, helle Fingerglieder
        if (cap(px, py, 47.2, 39.6, 49.6, 38.2, 1.0, 0.8)) return ['wood', 3.6]; // Daumen oben auf dem Griff
        if (cap(px, py, 50.8, 33.8, 50.5, 38.6, 2.5, 2.9)) return ['wood', 1.8 - l * 0.5 + (Math.abs(py - 36) < 0.5 ? 2 : 0)]; } // Handgelenk/Stulpe
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
    // 0.19.19 (Nutzer: Ring drohend in der anderen Hand hochhalten, andere Farbe): linker Arm hochgereckt, Faust mit Siegelring in Blau (Material ice, golden war schon genug)
    if (haupt) {
      const rr = Math.hypot(px - 11.6, py - 6.6);
      if (Math.hypot(px - 11.6, py - 6.6 - 0) < 4.4 && rr > 2.5 && !(rr < 3.2 && py > 8.6)) return ['ice', rr < 3.1 ? 6.2 : 7]; // Ring
      if (ell(px, py, 11.6, 2.4, 1.5, 1.3) <= 1) return ['ice', 7]; // Stein im Ring
      if (rr <= 2.5 && py < 9.2) return null; // Loch im Ring: Hintergrund bleibt frei
      const hd = ell(px, py, 11.6, 11.6, 3.5, 3.2);
      if (hd <= 1) return Math.abs(((px - 8.6) % 1.7)) < 0.3 && py < 12 ? ['iron', 1.6] : ['iron', 5.4 - l * 1.1 + (hd > 0.7 ? -1.2 : 0.4)];
      if (cap(px, py, 11.2, 14, 9.6, 22.5, 2.6, 3.0) || cap(px, py, 9.6, 22.5, 19.5, 26, 3.0, 3.4)) return A(3.4);
    }
    // Arme, Schulterplatten, Hände
    if ((!haupt && cap(px, py, 20.5, 27, 15.8, 39.5, 3.3, 2.8)) || cap(px, py, 43.5, 27, 49.8, 40.5, 3.3, 2.8) || ell(px, py, 50.6, 41, 2.6, 2.8) <= 1) return A(3.2);
    if (ell(px, py, 20, 25.2, 6.6, 4.6) <= 1 || ell(px, py, 44, 25.2, 6.6, 4.6) <= 1) return A(4.8);
    if (haupt && (cap(px, py, 19, 21.5, 14.6, 12.5, 1.8, 0.2) || cap(px, py, 45, 21.5, 49.4, 12.5, 1.8, 0.2) || cap(px, py, 15.5, 25.5, 9.6, 21, 1.5, 0.2) || cap(px, py, 48.5, 25.5, 54.4, 21, 1.5, 0.2))) return ['iron', 5.8 - l * 0.6];
    // Brustpanzer mit Siegel, Gürtel, Wappenrock, Beine, Stiefel
    // 0.19.17: goldener Brustring entfernt (Nutzer: „Der runde Kreis in der Mitte weg“)
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
    // 0.47.7 (Nutzer: „Monster zu groß und unfertig, wolfähnlicher“): Rumpf neu – schmale Brust statt Block, dünnere Vorderläufe nah beieinander, zottige Halskrause statt der Kamm-Zacken (sahen wie Hände aus), Hinterläufe seitlich hinter der Brust
    if (ell(px, py, sx(5.9), 62.2, 2.9, 1.3) <= 1) return ['ceil', 1.2 + fur * 0.3]; // Vorderpfoten
    if (py > 62.6 && py < 63.9 && (Math.abs(ax - 4.5) < 0.4 || Math.abs(ax - 5.9) < 0.4 || Math.abs(ax - 7.3) < 0.4)) return ['stone', 6.5]; // Krallen
    if (cap(px, py, sx(5.0), 52, sx(5.6), 61.6, 2.5, 1.8)) return F(1.9); // Vorderläufe
    if (ell(px, py, 32, 52.5, 8.6, 7.8) <= 1) return py > 54.5 && ax < 3.6 ? ['ceil', 2.8 + fur * 0.5] : F(2.1); // Brust mit hellerem Bauchfell
    { const dx = (px - 32) / 12.8, dy = (py - 44.8) / 7.4, ang = Math.atan2(dy, dx), lim = 1 + 0.11 * Math.sin(ang * 11 + seed) + 0.07 * Math.sin(ang * 23 + seed * 2); if (Math.hypot(dx, dy) <= lim && py > 38) return F(1.9 + (Math.hypot(dx, dy) < 0.6 ? 0.2 : -0.2)); } // zottige Halskrause
    if (ell(px, py, sx(11.4), 62.2, 3.0, 1.2) <= 1) return ['ceil', 0.8 + fur * 0.3]; // Hinterpfoten
    if (cap(px, py, sx(11.0), 53, sx(11.6), 61.5, 3.4, 1.8)) return F(1.0); // Hinterläufe (Keulen)
    if (ell(px, py, 32, 51.5, 13, 8.2) <= 1) return F(1.1); // Rumpf dahinter
    return null;
  });
}

// 0.19.20 (Nutzer: Turmwache und Kultpriester „gefährlicher und interessanter“): eigene Figuren statt der schlichten Varianten
function genTurmwache(seed) { // Vollplatte mit Gitterhelm, Flügelhelmzier, Stachelschultern, Turmschild mit Dellen und Nieten, Speer mit zerfetztem Wimpel, Blutspuren
  const body = ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const dx = px - 32, ax = Math.abs(dx), l = lit(px, py), n = nz(x >> 1, y >> 1);
    const A = (b) => ['iron', b - l * 1.5 + n * 0.7];
    // Augen und Visier
    if (ell(px, py, 28.4, 14.3, 1.6, 0.95) <= 1 || ell(px, py, 35.6, 14.3, 1.6, 0.95) <= 1) return ['glow', 7];
    if (py >= 13.1 && py <= 15.5 && ax <= 7 && ell(px, py, 32, 14, 9, 10.4) <= 1) return ['ceil', 0];
    if (ell(px, py, 32, 14, 9, 10.4) <= 1) {
      if (ax < 0.8 && py > 15.4 && py < 22) return ['ceil', 0]; // T-Visier
      if (py > 17.2 && py < 23 && ax > 1.8 && ax < 7 && Math.abs(((ax - 1.8) % 2.2)) < 0.55) return ['ceil', 0.3]; // Gitterschlitze am Kinn
      if (ax > 8 - 0.0 && ax < 9.2 && py > 10 && py < 21) return A(2.4); // Wangenkante
    }
    // Helmzier: Kamm aus Stahlzacken und Flügel
    for (let i = 0; i < 4; i++) if (cap(px, py, 32, 4.4 - i * 0, 32 + (i - 1.5) * 1.4, -0.6, 1.5 - i * 0.12, 0.2) && i === 0) return ['iron', 6.6 - l];
    if (cap(px, py, 32, 6.5, 32, -0.4, 1.7, 0.3)) return ['iron', 6.4 - l * 0.6];
    if (cap(px, py, 24.2, 8.5, 17.4, 1.2, 2.4, 0.3) || cap(px, py, 39.8, 8.5, 46.6, 1.2, 2.4, 0.3)) return ['stone', 6.4 - l * 0.8];
    if (ell(px, py, 32, 13.6, 8.9, 10.4) <= 1) return A(Math.abs(dx) < 0.7 ? 5.6 : py < 9 ? 5 : 4.2);
    // Speer (rechts im Bild): Blatt, Parierstück, zerfetzter Wimpel, Schaft
    if (py >= 0 && py <= 11.5) { const hw = 2.7 * Math.pow(Math.sin(Math.PI * Math.min(1, (py + 0.4) / 12)), 0.85); if (Math.abs(px - 51) <= hw) return Math.abs(px - 51) < 0.45 ? ['iron', 2.8] : ['iron', px < 51 ? 7 : 5]; }
    if (cap(px, py, 48.4, 12.4, 53.6, 12.4, 0.85, 0.85)) return ['iron', 3.4];
    if (px > 51.6 && px < 60 && py > 13.4 && py < 25 && Math.abs(py - 15) < (px - 51.6) * 0.45 + 1.4 - Math.max(0, px - 54) * 0.28 && hash(Math.floor(px * 2), Math.floor(py * 2), seed + 7) > 0.12 && py < 14.2 + (px - 51.6) * 0.9 + Math.sin(px * 1.8) * 1.4) return ['blood', 3.4 + hash(x, y, seed + 8) * 1.2 - (px - 51.6) * 0.22];
    if (cap(px, py, 51, 12.5, 51, 63, 0.95, 0.95)) return ['wood', 2.5 - l * 0.5];
    // Turmschild (links, groß): Rand, Nieten, Buckel, Kreuzrune, Dellen, Blut
    { const sw = py < 48 ? 8.2 : 8.2 * (60.5 - py) / 12.5, sd = Math.abs(px - 13.5);
      if (py >= 23.5 && py <= 60.5 && sd <= sw && !(py < 26 && sd > sw - 1.8)) {
        const rim = sd > sw - 1.5 || py < 25.4 || (py > 48 && sd > sw - 2.4);
        if (rim) return (Math.floor(py / 4.4) % 2 === 0 && sd > sw - 1.5 && sd < sw - 0.2 && ((py * 7 | 0) % 5 === 0)) ? ['iron', 7] : ['iron', 3.0 - (px < 13.5 ? -0.8 : 0.3) + n * 0.6];
        if (ell(px, py, 13.5, 38, 2.4, 2.4) <= 1) return ['iron', ell(px, py, 12.9, 37.4, 1, 1) <= 1 ? 7 : 5.4]; // Buckel
        if (ell(px, py, 13.5, 38, 3.6, 3.6) <= 1) return ['iron', 2.2];
        if ((sd < 0.8 && py > 28 && py < 52) || (Math.abs(py - 33) < 0.8 && sd < 5.2)) return ['glow', 4.4];
        if (vn(px * 1.5, py * 1.5, 5) > 0.74) return ['iron', 1.2 + n * 0.5]; // Dellen
        if (hash(px * 3 | 0, py * 3 | 0, seed + 61) > 0.97) return ['blood', 4]; // Spritzer
        return ['stone', 3.2 - ((px - 13.5) * 0.22 + (py - 40) * 0.08) + n * 0.8 - (vn(px * 2, py * 0.6, 7) - 0.5)];
      } }
    // rechter Arm am Speer, Handschuh
    if (ell(px, py, 50.8, 38.6, 2.8, 2.9) <= 1) return ['iron', 2.4 + n * 0.5];
    if (cap(px, py, 43.5, 27, 49.6, 37, 3.4, 2.8)) return ((py * 1.2 | 0) % 4 === 0) ? ['iron', 1.6] : A(3.4);
    // Schulterstücke mit Lamellen und Dornen
    for (const sg of [-1, 1]) { const cx = 32 + sg * 12.4;
      if (cap(px, py, cx + sg * 1.5, 22, cx + sg * 4.4, 13.2, 1.9, 0.15) || cap(px, py, cx + sg * 4.2, 24, cx + sg * 8.6, 18.2, 1.4, 0.12)) return ['iron', 6.6 - l];
      if (ell(px, py, cx, 26, 7.4, 5.6) <= 1) return (Math.abs(((py - 22) % 3.4)) < 0.4) ? ['iron', 1.8] : A(4.4); }
    // Brustpanzer: Rippe, Kreuz, Fahrkante, Nieten
    if (ell(px, py, 32, 34.5, 11.4, 12.2) <= 1 && py < 45.6) {
      if ((ax < 0.7 && py > 27 && py < 42) || (Math.abs(py - 31.4) < 0.7 && ax < 4.8)) return ['glow', 4.6];
      if (ax < 0.7) return A(6);
      if (Math.abs(py - 40) < 0.4 && ax > 3) return ['iron', 1.8]; // Plattenfuge
      if (hash(px * 2 | 0, py * 2 | 0, seed + 31) > 0.985) return ['iron', 7]; // Nieten
      return A(ax > 8.5 ? 2.8 : 4.1);
    }
    // Gürtel, Schurz aus Plattenstreifen, Beinschienen mit Knie-Dornen, Eisenschuhe
    if (py > 44.2 && py < 46.4 && ax < 10.5) return ax < 1.8 ? ['glow', 5.2] : ['wood', 1.6 + n * 0.6];
    if (py >= 46.4 && py < 54.6 && ax < 9.6 - (py - 46.4) * 0.12) { const band = Math.floor((py - 46.4) / 2.7); return ax < 0.6 ? ['ceil', 0.4] : A(3.8 - band * 0.5 - (((py - 46.4) % 2.7) < 0.5 ? 1.2 : 0)); }
    if (cap(px, py, 28, 53, 27, 60.4, 3.5, 3.0) || cap(px, py, 36, 53, 37, 60.4, 3.5, 3.0)) return A(3.4);
    if (ell(px, py, 28, 53.4, 3.4, 2.3) <= 1 || ell(px, py, 36, 53.4, 3.4, 2.3) <= 1) return A(5.4);
    if (cap(px, py, 25.6, 52.8, 24.4, 50.4, 1.1, 0.1) || cap(px, py, 38.4, 52.8, 39.6, 50.4, 1.1, 0.1)) return ['iron', 6.6];
    if (ell(px, py, 26, 62, 4.8, 2.1) <= 1 || ell(px, py, 38, 62, 4.8, 2.1) <= 1) return A(2.4);
    // zerrissener Umhang hinter der Gestalt
    if (py > 27 && py < 59 + 4 * Math.abs(Math.sin(px * 0.9 + seed)) && ax < 13.4 + (py - 27) * 0.1 && !(py > 46 && hash(px * 1.4 | 0, py * 1.4 | 0, seed + 5) > 0.86)) return ['wood', 0.9 + vn(px * 3, py * 0.5, 4) * 1.2 - l * 0.4];
    return null;
  };
  return paintFigure(seed, (c) => {
    const res = body(c);
    if (res && res[0] !== 'glow' && res[0] !== 'ceil' && c.py > 18 && c.vn(c.px * 1.5, c.py * 1.8, 9) > 0.82 && hash(c.px, c.py, seed + 41) > 0.3) return ['blood', 3 + hash(c.px, c.py, seed + 42) * 1.5];
    return res;
  });
}
function genGiessmeister(seed) { // 0.37.1 (Nutzer: Gießmeister wirkte wie ein alter Endgegner, Vorbild Foto): Gießer im silbernen Hitzeschutzanzug – Spitzkapuze, goldorange spiegelndes Gesichtsschild, dicke Handschuhe, vorgebeugt, lange Eisenstange, deren Ende rotglühend ist
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1);
    const lean = py < 40 ? (40 - py) * 0.07 : 0, cx = 32 + lean, dx = px - cx, ax = Math.abs(dx);
    const fold = vn(px * 1.6, py * 1.1, 6) - 0.5; // Falten des Anzugs
    const fire = Math.max(0, (px - 30) * 0.05 + (py - 24) * 0.03); // Feuerseite (rechts/unten) spiegelt orange
    const crease = Math.abs(Math.sin((px * 0.9 + py * 1.7 + fold * 9) * 0.9)); // diagonale Knitterlinien (Metallfolie)
    const S = (b) => (dx > 12.4 && py > 26 && py < 58 && fold > 0.02 ? ['glow', 1.6 + fold * 3] : ['iron', b - l * 1.6 + fold * 3 + (crease < 0.12 ? 2.2 : crease > 0.9 ? -1.4 : 0) + n * 0.6]); // silbern mit Glanzkanten, rechter Rand spiegelt das Feuer orange
    // Eisenstange (rechts, schräg nach oben): Ende rotglühend mit Funken
    { const bx = 49.5, tx = 55.5; // unten bx, oben tx
      const rodAt = (py2) => bx + (tx - bx) * (62 - py2) / 62;
      if (py >= 1.5 && py <= 62 && Math.abs(px - rodAt(py)) <= (py < 20 ? 1.9 : 1.35)) {
        if (py < 5) return ['glow', 7];
        if (py < 11) return ['glow', 6.2 - (py - 5) * 0.2];
        if (py < 22) return ['blood', 6.6 - (py - 11) * 0.38 + n * 0.5];
        if (py < 30) return ['blood', 2.6 - (py - 22) * 0.15];
        return ['iron', 2.4 - (px - rodAt(py)) * 0.5 + n * 0.5];
      }
      if (py < 24 && hash(px * 2 | 0, py * 2 | 0, seed + 71) > 0.985 && Math.abs(px - rodAt(py)) < 6) return ['glow', 6]; } // Funken
    // Handschuhe (dunkles Leder, dick)
    if (ell(px, py, 51.2, 41, 3.6, 3.4) <= 1) return ['wood', 1.4 - l * 0.6 + n * 0.5];
    if (ell(px, py, 18.5, 49, 3.8, 3.8) <= 1) return ['wood', 1.2 - l * 0.6 + n * 0.5];
    // Gesichtsschild: dunkler Rahmen, goldorange Spiegelung mit Lichtstreifen, Augen schimmern durch
    if (ell(px, py, cx + 0.8, 16.4, 8.6, 6.6) <= 1) {
      const e = ell(px, py, cx + 0.8, 16.4, 8.6, 6.6);
      if (e > 0.8) return ['wood', 1.4 - l * 0.5];
      if (ell(px, py, cx - 2.2, 17.2, 1.2, 0.8) <= 1 || ell(px, py, cx + 3.8, 17.2, 1.2, 0.8) <= 1) return ['wood', 0.8];
      if (Math.abs((px - cx) * 0.6 + (py - 16.4)) < 0.9) return ['glow', 7]; // Lichtstreifen
      if (py > 19.6 + dx * 0.12) return ['wood', 1.8 - fold]; // Schatten unter dem Schild (Gesicht dahinter)
      return ['glow', 4.6 + (16.4 - py) * 0.3 - dx * 0.1 + fold * 2.4];
    }
    // Schildkrempe oben
    if (py > 8.2 && py < 10.4 && ax < 9.8 && ell(px, py, cx, 12, 10.5, 5) <= 1.4) return ['wood', 1.8 - l * 0.6];
    // Spitzkapuze
    if (ell(px, py, cx, 14, 10.4, 12) <= 1 || cap(px, py, cx, 12, cx - 1, 0.8, 7, 0.3)) return S(5 - Math.max(0, 6 - py) * 0.1);
    // Schultern und Rumpf
    if (ell(px, py, cx - 0.6 + (py > 28 ? 0 : 0), 33.5, 15.6, 12.4) <= 1) return S(4.4 + (dx > 4 && py > 28 ? 1.3 : 0));
    // rechter Arm zur Stange, linker Arm herab
    if (cap(px, py, 44, 27, 50.4, 39, 4.2, 3.4)) return S(4 + (py > 30 ? 0.8 : 0));
    if (cap(px, py, 17.5, 27, 18.4, 47, 4.4, 3.8)) return S(3.2);
    // langer Schutzschurz bis zu den Stiefeln, Falten senkrecht
    if (py > 40 && py < 61 && ax < 13.4 - (py - 40) * 0.12) { const f2 = Math.sin(px * 1.7 + seed) * 0.5; return ax < 0.5 ? ['ceil', 0.8] : S(4.2 - (py - 40) * 0.07 + f2 + (dx > 3 ? 0.8 : 0) + fire * 1.2); }
    // Gürtel mit Schnalle
    if (py > 38.4 && py < 41 && ax < 13.2) return ax < 1.6 ? ['iron', 6.4] : ['wood', 1.2];
    // Stiefel
    if (ell(px, py, cx - 5.4, 62, 5, 2.2) <= 1 || ell(px, py, cx + 5.4, 62, 5, 2.2) <= 1) return ['wood', 1.2 - l * 0.4 + n * 0.5];
    return null;
  });
}
function genSchlacke(seed) { // 0.37.4 (Nutzer: Schlackenwächter sah einer anderen Spielfigur zu ähnlich): gedrungener Golem aus erkalteter Schlacke – klumpiger Körper, glühende Risse, Kern in der Brust, riesige Faust, erhobener Schlackenblock als Hammer, geschmolzene Pfütze am Boden
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const l = lit(px, py), n = nz(x >> 1, y >> 1);
    const lump = vn(px * 1.3, py * 1.3, 5) - 0.5; // Klumpen
    const crack = Math.abs(vn(px * 1.1 + 7, py * 1.1, 6) - 0.5); // Risslinien: nahe 0 = Riss
    const G = (b) => crack < 0.04 ? ['glow', 4.2 + (0.04 - crack) * 60] : ['iron', b - 0.5 - l * 1.5 + lump * 3 + n * 0.6]; // dunkle Schlacke mit glühenden Rissen
    const dx = px - 32, ax = Math.abs(dx);
    // geschmolzene Pfütze und Tropfen am Boden
    if (ell(px, py, 32, 62, 22, 1.9) <= 1) return ['glow', 3.4 + Math.abs(dx) * -0.05 + n * 1.2 + 1.2];
    if (hash(px * 2 | 0, 0, seed + 5) > 0.93 && py > 40 && py < 58 && ax < 20 && ell(px, py, px, 50, 0.6, 9) <= 1) return ['glow', 5.2];
    // Augen und Maul im kleinen, tief sitzenden Kopf
    if (cap(px, py, 27.4, 13.6, 30.6, 14.6, 0.95, 0.7) || cap(px, py, 36.6, 13.6, 33.4, 14.6, 0.95, 0.7)) return ['glow', 7];
    if (py > 18.2 && py < 19.8 && ax < 3.6 && (Math.floor(px * 1.6) % 2 === 0)) return ['glow', 5.6];
    // Hammer: Schlackenblock rechts oben auf glühendem Stiel
    if (px > 43 && px < 61 && py > 1 && py < 14) { const hx = px - 43, hy = py - 1; if (hx < 1.2 || hx > 16.4 || hy < 1.2 || hy > 11) return ['iron', 0.5 + n * 0.5]; if (hy > 9 || (Math.abs(hx - 8.5) < 0.7 && hy < 9)) return ['glow', 4.8 + n]; return ['iron', 1.5 - l * 1.1 + lump * 3 + n * 0.6]; }
    if (cap(px, py, 51.5, 12, 51.5, 26, 1.7, 1.7)) return ['iron', 1.6 - l * 0.8 + n * 0.5];
    // Arme: rechts hebt den Hammer, links hängt eine riesige Faust
    if (cap(px, py, 44, 28, 51.5, 24, 5, 4.4)) return G(2.4);
    if (ell(px, py, 52, 23.5, 4.2, 3.6) <= 1) return G(3.1);
    if (cap(px, py, 19.5, 27, 13.5, 46, 6.2, 5.4)) return G(2.2);
    if (ell(px, py, 12.6, 51.5, 7.2, 6.4) <= 1) return G(3.0);
    // Kopf: kantiger Klumpen zwischen den Schultern, Zacken oben
    if (ell(px, py, 32, 14.5, 8.6, 7.6) <= 1 || cap(px, py, 27, 9, 25.6, 3.4, 2.1, 0.4) || cap(px, py, 37, 9, 38.6, 3.8, 2.1, 0.4)) return G(2.8);
    // Rumpf mit Kern
    if (ell(px, py, 32, 33.5, 17.4, 14.2) <= 1) {
      const core = ell(px, py, 32, 32, 6.2, 7.4);
      if (core <= 1) return ['glow', 7 - core * 2.4 + n * 0.4];
      if (core <= 1.5) return ['blood', 4.4];
      return G(2.5);
    }
    // Beine: zwei kurze Pfeiler
    if (ell(px, py, 24, 54, 7.4, 8.6) <= 1 || ell(px, py, 40, 54, 7.4, 8.6) <= 1) return G(1.9);
    return null;
  });
}
function genPriester(seed) { // Kultpriester (192 px): Spitzhaube mit drittem Auge, Perlenkette, rote Stola mit goldenen Zeichen, schwebendes Zauberbuch, Schädelstab mit Frostkugel, Räuchergefäß an Ketten, zerrissener Saum mit Runen
  const sparks = Array.from({ length: 8 }, (_, i) => ({ x: 9 + hash(i, 1, seed) * 12, y: 27 + hash(i, 2, seed) * 11, r: 0.35 + hash(i, 3, seed) * 0.4 }));
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const dx = px - 32, ax = Math.abs(dx), l = lit(px, py), n = nz(x >> 1, y >> 1);
    const C = (b) => ['ceil', b - l * 0.9 + n * 0.5];
    const bone = (b) => ['stone', b - l * 0.9 + n * 0.5];
    // Augen: zwei schräge, ein senkrechtes drittes Auge auf der Stirn
    if (cap(px, py, 27.2, 15.2, 30.8, 14.2, 0.85, 0.6) || cap(px, py, 36.8, 15.2, 33.2, 14.2, 0.85, 0.6) || ell(px, py, 32, 10.2, 0.85, 1.7) <= 1) return ['glow', 7];
    if (ell(px, py, 32, 15.4, 5.7, 6.4) <= 1) { // Gesichtshöhle mit Zahnreihe
      if (py > 19.8 && py < 21.6 && ax < 3.6 && Math.floor(px * 1.8) % 2 === 0) return bone(7);
      return ['ceil', 0];
    }
    // Perlenkette und Schlüsselbein
    if (py > 22.4 && py < 29.6 && Math.abs(py - (24 + (ax / 9) ** 2 * 5.6)) < 0.75 && ax < 9.4 && Math.floor(ax * 1.4) % 2 === 0) return ['glow', 6];
    // Schädelstab rechts: Kugel, Zinken, Schädel, Schaft, Hand
    if (ell(px, py, 50, 5.4, 3.5, 3.5) <= 1) return Math.hypot(px - 49, py - 4.3) < 1.2 ? ['ice', 7] : ['ice', 5 - (px - 50) * 0.2];
    if (ell(px, py, 50, 5.4, 4.7, 4.7) <= 1 && ell(px, py, 50, 5.4, 4.2, 4.2) > 1) return ['glow', 3.4];
    if (cap(px, py, 46, 11, 46.2, 4.4, 0.8, 0.3) || cap(px, py, 54, 11, 53.8, 4.4, 0.8, 0.3)) return ['iron', 5.8];
    if (ell(px, py, 50, 13.4, 3.1, 2.8) <= 1) { if (ell(px, py, 48.8, 13.2, 0.8, 0.9) <= 1 || ell(px, py, 51.2, 13.2, 0.8, 0.9) <= 1) return ['ice', 7]; return bone(6.2); }
    if (cap(px, py, 50, 15.4, 50, 63, 0.9, 0.9)) return ['wood', 2.2 - l * 0.4];
    // rechte Hand und Ärmel
    if (ell(px, py, 50, 33, 2.3, 2.3) <= 1) return bone(5.2);
    if (cap(px, py, 43, 27, 48.6, 32, 4, 3.2)) return C(2.1 + vn(px, py * 0.6, 4) * 1.2);
    // Zauberbuch links: schwebend, Deckel dunkel, Seiten hell, glühende Zeichen, Funken
    for (const sp of sparks) if (Math.hypot(px - sp.x, py - sp.y) <= sp.r) return ['glow', 6.5];
    if (px > 6.4 && px < 19.6 && py > 28.4 && py < 40.6) {
      const bx = px - 6.4, by = py - 28.4;
      if (bx < 1.1 || by < 1.0 || by > 11.4) return ['wood', 1.8 + n * 0.5];
      if (Math.abs(bx - 6.5) < 0.35) return ['wood', 1.2];
      if (by > 2 && by < 10 && ((Math.floor(by * 1.4) % 2) === 0) && hash(Math.floor(px * 2), Math.floor(py * 1.4), seed + 3) > 0.25) return ['glow', 6.8];
      return ['stone', 5.8 - bx * 0.06 + n * 0.5];
    }
    if (ell(px, py, 13, 42.6, 3, 2.1) <= 1) return bone(5);
    if (cap(px, py, 21.6, 27, 15.4, 38, 4.2, 3.3)) return C(2.1 + vn(px + 7, py * 0.6, 4) * 1.2);
    // Mantelkragen mit Goldrand und Schulterzacken
    if (ell(px, py, 32, 26.6, 15.2, 5.6) <= 1) { if (ell(px, py, 32, 26.6, 15.2, 5.6) > 0.78 && py > 25.4) return ['glow', 3.2 + n]; return C(2.6 + vn(px * 1.4, py * 0.8, 5) * 1.3); }
    for (const sg of [-1, 1]) if (cap(px, py, 32 + sg * 13.6, 24.4, 32 + sg * 15.4, 17.4, 1.3, 0.1)) return bone(6.2);
    // rote Stola mit goldenen Zeichen und Fransen
    if (ax < 2.7 && py > 24.4 && py < 61.4 - Math.abs(Math.sin(px * 4 + seed)) * 1.8) {
      if (ax > 2.0) return ['glow', 2.6];
      const gi = Math.floor((py - 28) / 5.6); if (gi >= 0 && Math.abs(((py - 28) % 5.6) - 2.2) < 0.9 && ax < 1.2) return ['glow', 6.6];
      return ['blood', 3.2 - l * 0.6 + n * 0.8 - Math.max(0, (py - 48) * 0.04)];
    }
    // Räuchergefäß an Kette (rechts am Gürtel) und Gürtel
    if (ell(px, py, 41.4, 54.4, 2.4, 2.9) <= 1) return Math.abs(py - 54.4) < 0.5 || ell(px, py, 41.4, 56, 0.9, 0.9) <= 1 ? ['glow', 6] : ['iron', 4.2];
    if (cap(px, py, 41.4, 46, 41.4, 51.4, 0.3, 0.3) && Math.floor(py) % 2 === 0) return ['iron', 5.6];
    if (py > 44.2 && py < 46.4 && ax < 9) return ax < 2.7 ? ['glow', 5.4] : ['wood', 1.7 + n * 0.5];
    // Haube: Spitze und Falten, Goldsaum
    const peak = py > 0.6 && py < 10.4 && ax < 1.2 + (py - 0.6) * 0.72;
    if (peak || ell(px, py, 32, 15, 9.3, 10.6) <= 1) {
      if (ell(px, py, 32, 15.4, 8.6, 10.2) > 0.9 && py > 12 && py < 25.6) return ['glow', 3.4 + n * 0.8]; // Goldsaum um das Gesicht
      return C(1.7 + vn(px * 1.2, py * 0.35, 7) * 1.4 + (dx < -4 ? 0.7 : 0));
    }
    // Robe: Falten, zerrissener Saum, leuchtende Zeichen
    const hem = 62.8 - 2.6 * Math.abs(Math.sin(px * 1.2 + seed)) - 1.4 * Math.abs(Math.sin(px * 3.3 + seed * 0.7));
    if (py > 22 && py < hem && ax < 8 + (py - 22) * 0.36) {
      if (py > 50 && vn(px * 3.3, py * 0.7, 6) > 0.68) return null;
      if (py > 55.4 && py < 57.2 && Math.floor(px * 1.1 + seed) % 3 === 0 && ax > 2.7) return ['glow', 5.2];
      return C(1.6 + vn(px * 1.1, py * 0.3, 3) * 1.7 + Math.abs(Math.sin(px * 0.8 + seed)) * 0.5 - Math.max(0, (py - 44) * 0.03));
    }
    return null;
  }, 192);
}

// 0.19.22 (Nutzer: Nebelhüter „nicht gefährlich genug, zu sehr Strichmännchen“): breiter Geisterkönig mit Eiszackenkrone, Stachelschultern, Rippen und Siegel, Klauenhänden, Kristallstab, zerfetztem Mantel, der im Nebel verschwimmt, und hohem Dornenthron
function genHueter(seed) {
  return paintFigure(seed, ({ ell, cap, lit, nz, px, py, x, y, vn }) => {
    const dx = px - 32, ax = Math.abs(dx), l = lit(px, py), n = nz(x >> 1, y >> 1);
    const R = (b) => ['wood', b - l * 0.9 + n * 0.5 + (vn(px * 1.3, py * 0.35, 6) - 0.5) * 1.2];
    // Augen (groß, schräg, kalt) und Gesichtshöhle mit Reißzähnen
    if (cap(px, py, 26.4, 12.8, 30.4, 14.8, 1.25, 0.8) || cap(px, py, 37.6, 12.8, 33.6, 14.8, 1.25, 0.8)) return ['glow', 7];
    if (cap(px, py, 24.6, 10.4, 30.6, 12.6, 0.75, 0.5) || cap(px, py, 39.4, 10.4, 33.4, 12.6, 0.75, 0.5)) return ['ceil', 0]; // Brauen
    if (ell(px, py, 32, 15.6, 6.3, 7.2) <= 1) {
      if (py > 19.6 && py < 22.6 && ax < 4.6) { const i = Math.floor((px - 27) / 1.15); if (py < 20.9 ? i % 2 === 0 : i % 2 === 1) return ['flesh', 7]; }
      return ['ceil', 0];
    }
    // Krone aus Eiszacken auf der Kapuze
    for (let i = -3; i <= 3; i++) { const h = 9.4 - Math.abs(i) * 1.5 + (i % 2 ? 0 : 1.2), bx = 32 + i * 2.5; if (cap(px, py, bx, 7.6, bx + i * 0.5, 7.6 - h, 1.05, 0.12)) return ['ice', 6.2 - l * 0.8 + (py < 4 ? 0.8 : 0)]; }
    if (py > 6.6 && py < 9.2 && ax < 7.6 + (py - 6.6) * 0.4 && ell(px, py, 32, 14.4, 9.6, 10.8) <= 1) return Math.abs(Math.floor(dx * 0.9) % 3) === 0 && py > 7.2 && py < 8.4 ? ['glow', 6.4] : ['iron', 5.2 - l];
    // Kapuze mit Frostsaum
    if (ell(px, py, 32, 14.4, 9.8, 10.8) <= 1) return ell(px, py, 32, 14.4, 9.8, 10.8) > 0.8 && py > 11 ? ['flesh', 5.2 + n] : R(1.4 + (dx < -3 ? 0.5 : 0));
    // Stab links: Kristallbündel
    for (const sg of [-1, 0, 1]) if (cap(px, py, 10, 11, 10 + sg * 5.2, 11 - (sg ? 5.2 : 9.6), 1.9, 0.25)) return ['ice', 6.6 - Math.abs(sg) * 1.2 - (px - 10) * 0.12];
    if (ell(px, py, 10, 12.6, 2.8, 3.4) <= 1) return ['ice', 7];
    if (cap(px, py, 10, 15.6, 10, 63, 0.95, 0.95)) return ['wood', 1.5 - l * 0.4];
    // Hände: Knochenklauen
    if (ell(px, py, 11.6, 39.6, 2.6, 2.7) <= 1) return ['flesh', 6.6 - l * 0.4];
    for (const f of [[8.6, 36.4], [10.4, 35.4], [12.8, 35.4], [14.6, 36.4]]) if (cap(px, py, 11.8, 38.4, f[0], f[1], 0.8, 0.12)) return ['flesh', 7];
    if (ell(px, py, 51.2, 43.4, 2.7, 2.6) <= 1) return ['flesh', 6.4 - l * 0.4];
    for (const f of [[48.2, 46.6], [50.2, 47.2], [52.4, 47.2], [54.4, 46.2]]) if (cap(px, py, 51.2, 44.6, f[0], f[1], 0.85, 0.12)) return ['flesh', 7];
    // Arme (weite Ärmel)
    if (cap(px, py, 21, 27.6, 12.8, 37.8, 4.4, 3.2) || cap(px, py, 43, 27.6, 50.6, 41, 4.4, 3.2)) return R(2.2 + (Math.abs(((py - 30) % 3.2)) < 0.3 ? -0.8 : 0));
    // Schulterstücke mit Eisdornen
    for (const sg of [-1, 1]) { const cx = 32 + sg * 13.6;
      if (cap(px, py, cx + sg * 0.6, 23, cx + sg * 3.8, 10.4, 2.2, 0.15) || cap(px, py, cx - sg * 2, 22.6, cx - sg * 1.8, 12.6, 1.6, 0.12) || cap(px, py, cx + sg * 4.6, 25, cx + sg * 8.6, 17.6, 1.6, 0.12)) return ['ice', 6.2 - l * 0.7];
      if (ell(px, py, cx, 26, 8, 5.8) <= 1) return Math.abs(((py - 22.4) % 3.2)) < 0.4 ? ['iron', 1.6] : ['iron', 4.6 - l * 1.4 + n * 0.6]; }
    // Brust: dunkler Riss mit Rippen und leuchtendem Siegel
    if (ax < 8.4 && py > 28.4 && py < 46) {
      const rr = Math.hypot(dx, py - 36.4);
      if (rr < 4.6 && rr > 3.2) return ['glow', 6.6];
      if (Math.abs(dx) < 0.7 && py > 29 && py < 45) return ['glow', 5.4];
      if (rr <= 3.2) return ['ceil', 0];
      for (let i = 0; i < 3; i++) if (ax > 1.6 && Math.abs(py - (31.4 + i * 4.4 + (ax / 8) ** 2 * 3)) < 0.8) return ['flesh', 5.8 - i * 0.3];
      return ['ceil', 0.3];
    }
    // Frostkragen
    if (ell(px, py, 32, 25.8, 14.2, 5.2) <= 1) return ['flesh', 4.6 + vn(px * 2, py * 1.4, 4) * 2 - l * 0.6];
    // Mantel: bauchig, zerfetzt, nach unten im Nebel aufgelöst
    const w = 9.6 + Math.max(0, py - 26) * 0.4;
    if (py > 26 && ax < w) {
      const hem = 57 + Math.sin(px * 1.15 + seed) * 2.2 + Math.sin(px * 2.9) * 1.1 - ax * 0.12;
      if (py > hem) return null;
      if (py > hem - 2.2) return ['flesh', 2.8 + n];
      if (ax > w - 1.3) return ['wood', 0.6 + n * 0.4];
      return R(2.1 + Math.abs(Math.sin(px * 0.9 + seed)) * 0.6 - Math.max(0, (py - 44) * 0.05));
    }
    // Thron hinter der Gestalt: hohe Spitzbogenlehne, Seitentürme, Schädel an den Armlehnen, Stufen
    { const topY = 1.2 + (ax / 27) ** 2 * 16 - (ax < 1.6 ? 1.4 : 0);
      const back = ax <= 27 && py >= topY && py <= 60;
      const spire = ax >= 23.4 && ax <= 27.6 && py >= 0.8 + (ax - 23.4) * 1.2 && py < 34;
      const armR = ax >= 17 && ax <= 29.4 && py >= 38 && py <= 57 && !(ax < 20 && py < 40);
      const skull = ell(px, py, 32 + Math.sign(dx || 1) * 26, 35.6, 2.6, 2.6) <= 1;
      const step = py >= 58.6 && ax <= 31.5 - (py - 58.6) * 0.4;
      if (skull) return ell(px, py, 32 + Math.sign(dx || 1) * 26 - 0.9, 35.2, 0.7, 0.8) <= 1 || ell(px, py, 32 + Math.sign(dx || 1) * 26 + 0.9, 35.2, 0.7, 0.8) <= 1 ? ['ice', 7] : ['flesh', 5.8];
      if (back || spire || armR || step) {
        const edge = (back && (ax > 25 || py < topY + 1.3)) || (armR && (py < 39.6 || ax > 27.6)) || (step && py < 59.8) || spire;
        const inset = back && ax < 20 && py > topY + 4 && py < 54;
        return edge ? ['stone', 7] : inset ? ['stone', 0 + n * 0.3 + (ax < 1 ? 0.8 : 0)] : ['stone', 0.5 + n * 0.5]; // 0.23.12: Thron heller, hebt sich von der Wand ab
      } }
    return null;
  }, 192);
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
// 0.31.7/0.31.10: Blockhüttenwand (Nutzer: „aus dunkelbraunen Holzbalken“): waagerechte, runde Stämme mit Fugen, Maserung und vereinzelten Astlöchern
// 0.32.0: Spielsalon-Wand (Kartenzeichen 'v', nur nach der Verwandlung): rote Tapete mit Rautenmuster, Goldstreifen, Neonband und Glühbirnenreihe
function genVegasWall(seed, n = TEX) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) }, k = n / TEX;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, fu = (u * 4) % 1, fv = (v * 4) % 1;
    let c;
    if (v > 0.8) c = P('ceil', 0.5 + hash(x >> 1, y >> 1, seed) * 0.4);                                   // dunkle Sockelleiste
    else {
      const dia = Math.abs(fu - 0.5) + Math.abs(fv - 0.5);
      c = P('blood', 2.6 + (dia < 0.2 ? 0.7 : 0) + (hash(x >> 1, y >> 1, seed + 2) - 0.5) * 0.45);
      if (((u * 8) % 1) < 0.05) c = P('glow', 5.2);                                                       // goldene Streifen
    }
    if (Math.abs(v - 0.8) < 0.012) c = P('glow', 6.2);                                                     // Goldleiste
    if (v > 0.46 && v < 0.54) c = P('ice', v > 0.49 && v < 0.51 ? 7.6 : 5.2);                              // Neonband
    if (v > 0.06 && v < 0.12) { const bx = ((u * 8) % 1) - 0.5, by = (v - 0.09) / 0.03; if (bx * bx * 4 + by * by < 0.8) c = P('glow', ((u * 8) | 0) % 2 ? 7.6 : 6.4); } // Glühbirnen
    t.data[y * n + x] = c;
  }
  return t;
}

function genHouseWall(seed, n = TEX) {
  const t = { w: n, h: n, data: new Uint8Array(n * n) }, k = n / TEX, LOG = 8; // 8 Stämme je Wand
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / k, v = y / k, li = Math.floor(v / LOG), f = (v % LOG) / LOG;
    const rowSeed = seed + li * 13, off = hash(li, 7, seed) * 20;
    let shade = f < 0.1 ? 0.2 : 1.0 + 1.5 * Math.sin(Math.PI * Math.min(1, (f - 0.1) / 0.9)) * (0.85 + 0.15 * hash(li, 3, seed));
    shade += grain(Math.floor((u + off) / 3), y >> 1, rowSeed, 0.5) + (hash(Math.floor((u + off) * 0.7), li, seed + 5) > 0.92 ? -0.5 : 0);
    const kx = 14 + hash(li, 11, seed) * 36;
    if (f > 0.25 && f < 0.75 && Math.hypot((u - kx) / 2.6, (v - (li + 0.5) * LOG) / 1.6) < 1) shade = 0.5; // Astloch
    t.data[y * n + x] = P('wood', Math.min(6.2, Math.max(1, shade + 2.8))); // 0.32.1: heller (Stufen 0–3 wirkten im Nachtlicht schwarz, Steinwände liegen bei 3–5; innen dunkelt der Nebel zusätzlich ab)
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
    wall: { [WALL_STONE]: stoneW, [WALL_HOUSE]: genHouseWall(37, n), [WALL_VEGAS]: genVegasWall(38, n), [WALL_SECRET]: genSecretWall(stoneW, 301), [WALL_SWITCH]: genSwitchWall(stoneW, false), [WALL_SWITCH_ON]: genSwitchWall(stoneW, true), [WALL_MOSS]: genMoss(23, n), [WALL_DOOR]: up(genDoor(31, false), 103), [WALL_DOOR_LOCKED]: up(genDoor(31, true), 104), [22]: up(genDoorV('eisen', false, 502), 602), [23]: up(genDoorV('eisen', true, 503), 603), [24]: up(genDoorV('stein', false, 504), 604), [25]: up(genDoorV('stein', true, 505), 605), [26]: up(genDoorV('bogen', false, 506), 606), [27]: up(genDoorV('bogen', true, 507), 607), [28]: up(genDoorV('gold', false, 508), 608), [29]: up(genDoorV('gold', true, 509), 609), [30]: up(genDoorV('gitter', false, 510), 610), [31]: up(genDoorV('gitter', true, 511), 611), [32]: up(genDoorV('morsch', false, 512), 612), [33]: up(genDoorV('morsch', true, 513), 613), [WALL_TORCH]: genTorch(11, n), [WALL_ROCK]: genRock(17, n), [WALL_GATE]: genGate(29, n), [WALL_WEB]: genWeb(53, n), [WALL_LICHEN]: genRock(19, n, true) },
    floor: genFloor(41, nf),
    sand: genSand(47, nf),
    sm2,
    water: genWater(61, nf),
    plank: genPlanks(62, nf),
    carpet: genCarpet(63, nf),
    rug: genRug(64, nf),
    paving: genPaving(66, nf),
    ceil: genCeil(53, nf),
    sprites: { gateOpen: smoothSprite(genGateOpen(431), 3), rail: genRail(441), railTorch: genRailTorch(442), palme: sm2(genPalm(461)), fass: sm2(genFurn('fass', 471)), fassKaputt: sm2(genFurn('fassKaputt', 491)), tisch: sm2(genFurn('tisch', 472)), stuhl: sm2(genFurn('stuhl', 473)), bett: sm2(genFurn('bett', 474)), regal: sm2(genFurn('regal', 475)), kamin: sm2(genFurn('kamin', 476)), tresen: sm2(genFurn('tresen', 485)), weinregal: sm2(genFurn('weinregal', 486)), weinfass: sm2(genFurn('weinfass', 487)), gast0: sm2(genGuest(488, 0)), gast1: sm2(genGuest(489, 1)), gast2: sm2(genGuest(490, 2)), kaktus: sm2(genFurn('kaktus', 477)), haengematte: sm2(genFurn('haengematte', 478)), spielautomat: sm2(genFurn('spielautomat', 479)), roulette: sm2(genFurn('roulette', 480)), vase: sm2(genFurn('vase', 483)), kueche: sm2(genFurn('kueche', 484)), kartentisch: sm2(genFurn('kartentisch', 481)), teufel: sm2(genDevil(482)), mound: sm2(genMound(463)), plate: genPlate(false, 411), plateDown: genPlate(true, 411), boulder: smoothSprite(genBoulder(421), 2), trapFaint: genTrap('faint', 401), trapSeen: genTrap('seen', 401), teleOn: genTele(true, 431), teleOff: genTele(false, 431), magier: sm2(genRobed(247, 'priester')), trapSprung: genTrap('sprung', 401), trapSprung_gas: genTrap('sprung', 403, 'gas'), trapSprung_rune: genTrap('sprung', 405, 'rune'), chest: sm2(genChest2(false, 61)), chestOpen: sm2(genChest2(true, 61)),  chestPrunk: sm2(genChest2(false, 63, true)), mimic: sm2(genMimic(67)), schrat: sm2(genSchrat(71)), portal: spr(genPortal(81), 109), merchant: sm2(genMerchant(91)), wisp: sm2(genWisp(121)), skeleton: sm2(genSkeleton(171)), guard: sm2(genGuard(181, 'wacht')), turmwache: sm2(genTurmwache(183)), captain: sm2(genGuard(191, 'haupt')), giessmeister: sm2(genGiessmeister(195)), schlacke: sm2(genSchlacke(197)), wolf: sm2(genWolf(301)), kultist: sm2(genKultist(311)), torf: sm2(genPerson(711, 'torf')), fuhrmann: sm2(genFerryman(771)), boot: sm2(genBoat(772)), gnom: sm2(genGnome(773)), spinne: sm2(genSpider(774)), koenigin: sm2(genSpider(777, true)), kokon: sm2(genCocoon(778)), schutt: sm2(genFurn('schutt', 474)), diener: sm2(genVampire(741, 'diener')), brut: sm2(genVampire(742, 'brut')), graefin: sm2(genVampire(743, 'graefin')), wache: sm2(genPerson(721, 'wache')), haendler2: sm2(genVendor2(751)), wirtin: sm2(genWirtin(752)), hexe: sm2(genHexe(753)), haendler3: sm2(genVendor3(754)), gefangener: sm2(genPrisoner(761)), wund: sm2(genPerson(731, 'wund')), kaefer: sm2(genKaefer(201)), geist: sm2(genRobed(241, 'geist')), priester: sm2(genPriester(251)), hueter: sm2(genHueter(261)), moorschrat: sm2(genSchratBoss(221, 'moor')), grubenschrat: sm2(genSchratBoss(222, 'grube')), runeStone: spr(genRuneStone(231), 115), leverUp: genLever(false, 211), leverDown: genLever(true, 211), stairsDown: spr(genStairs('down', 141), 112), stairsUp: spr(genStairs('up', 151), 113), arch: spr(genArch(161), 114), sign: genSign(131) }
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
    const fogK = 0.85 / (this.bright || 1) * (view.fog || 1); // 0.39.0: Ebenen können den Nebel dünner machen (Taverne: fog 0.4)
    const dropFor = (dist) => Math.min(7, Math.floor(dist * fogK / fl));

    // Decke und Boden. Horizont verschiebbar (view.horizon in Pixeln; Standard H/2): kleiner = Blick nach unten, größer = Blick nach oben
    const half = Math.max(1, Math.min(H - 1, Math.round(view.horizon == null ? H / 2 : view.horizon)));
    const hall = view.hall || null; // { h: Deckenhöhe in Wandhöhen, low: [x0, y0, x1, y1] Felder mit normaler Höhe }
    if (q === 'low') {
      for (let y = 0; y < H; y++) {
        const fl0 = y >= half, p = fl0 ? y + 0.5 - half : half - y - 0.5;
        const tbl = this.shadeTbl[dropFor(0.5 * focal / p)];
        const c = fl0 ? tbl[P('floor', 3)] : tbl[P('ceil', 2)];
        const row = y * W;
        for (let x = 0; x < W; x++) buf[row + x] = c;
      }
    } else {
      const ftex = (view.floorTex === 'sand' && tex.sand ? tex.sand : tex.floor).data, ctex = tex.ceil.data, FN = tex.floor.w, FM = FN - 1;
      const rdx0 = dirX - planeX, rdy0 = dirY - planeY, rdx1 = dirX + planeX, rdy1 = dirY + planeY;
      for (let y = 0; y < H; y++) {
        const fl0 = y >= half, p = fl0 ? y + 0.5 - half : half - y - 0.5;
        const rowDist = 0.5 * focal / p;
        const tbl = this.shadeTbl[dropFor(rowDist)];
        const src = fl0 ? ftex : ctex;
        let fx = px + rowDist * rdx0, fy = py + rowDist * rdy0;
        const sx = rowDist * (rdx1 - rdx0) / W, sy = rowDist * (rdy1 - rdy0) / W;
        const row = y * W;
        if (!fl0 && hall) { // 0.31.7: hohe Decke (hall.h Wandhöhen); über dem Häuschen (hall.low) liegt die normale Decke
          const d2 = rowDist * (hall.h - 0.5) / 0.5, tb1 = tbl, tb2 = this.shadeTbl[dropFor(d2)], row0 = y * W, lw = hall.low;
          for (let x = 0; x < W; x++) {
            const kx = x / W, rx = rdx0 + (rdx1 - rdx0) * kx, ry = rdy0 + (rdy1 - rdy0) * kx;
            let cxp = px + rowDist * rx, cyp = py + rowDist * ry, tb = tb1;
            const ccx = Math.floor(cxp), ccy = Math.floor(cyp);
            if (ccx < lw[0] || ccx > lw[2] || ccy < lw[1] || ccy > lw[3]) { cxp = px + d2 * rx; cyp = py + d2 * ry; tb = tb2; }
            buf[row0 + x] = tb[ctex[(((cyp * FN) | 0) & FM) * FN + (((cxp * FN) | 0) & FM)]];
          }
          continue;
        }
        if (fl0 && view.floorGrid && tex.water) { // 0.28.0: Wasser (1) und Bohlen (2 = quer zur x-Achse, 3 = quer zur y-Achse) je Feld
          const fg = view.floorGrid.fg, fw = view.floorGrid.gw, fh = view.floorGrid.gh, wd = tex.water.data, pd = tex.plank.data, cd = tex.carpet ? tex.carpet.data : pd, rd = tex.rug ? tex.rug.data : pd, sd = tex.paving ? tex.paving.data : pd, wob = t * 7;
          for (let x = 0; x < W; x++) {
            const cx = Math.floor(fx), cy = Math.floor(fy), k = cx >= 0 && cy >= 0 && cx < fw && cy < fh ? fg[cy * fw + cx] : 0;
            let c;
            if (k === 1) c = wd[((((fy * FN + Math.sin(fx * 2.3 + t) * 2) | 0) & FM) * FN) + (((fx * FN + wob) | 0) & FM)];
            else if (k === 6) { c = sd[((((fy * FN) | 0) & FM) * FN) + (((fx * FN) | 0) & FM)]; }
            else if (k === 5) { c = rd[((((fy * FN) | 0) & FM) * FN) + (((fx * FN) | 0) & FM)]; }
            else if (k === 4) { c = cd[((((fy * FN) | 0) & FM) * FN) + (((fx * FN) | 0) & FM)]; }
            else if (k >= 2) { const tx = ((fx * FN) | 0) & FM, ty = ((fy * FN) | 0) & FM; c = k === 2 ? pd[ty * FN + tx] : pd[tx * FN + ty]; }
            else c = src[(((fy * FN) | 0) & FM) * FN + (((fx * FN) | 0) & FM)];
            buf[row + x] = tbl[c];
            fx += sx; fy += sy;
          }
          continue;
        }
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
    const viewIn = !!hall && Math.floor(px) >= hall.low[0] && Math.floor(px) <= hall.low[2] && Math.floor(py) >= hall.low[1] && Math.floor(py) <= hall.low[3]; // Blick von innen: kein Dach zeichnen
    const isLow = (mx, my) => !hall || (mx >= hall.low[0] && mx <= hall.low[2] && my >= hall.low[1] && my <= hall.low[3]);
    const drawWall = (x, hit, mapX, mapY, side, stepX, rdx, rdy, dist, hf) => {
      const lineH = Math.floor(focal / dist);
      const startRaw = Math.floor(half - lineH / 2), topRaw = startRaw + lineH - lineH * hf;
      const y0 = Math.max(0, topRaw), y1 = Math.min(H - 1, startRaw + lineH - 1);
      let wallX = side === 0 ? py + dist * rdy : px + dist * rdx;
      wallX -= Math.floor(wallX);
      const wt = tex.wall[hit], WN = wt.w, WM = WN - 1;
      let texX = Math.floor(wallX * WN);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = WN - 1 - texX;
      const td = wt.data;
      const tbl = this.shadeTbl[Math.min(7, dropFor(dist) + side)];
      const texStep = WN / lineH;
      let texPos = (y0 - topRaw) * texStep;
      const dec = decals && hf === 1 ? decals.get((mapY * gw + mapX) * 4 + (side === 0 ? (stepX > 0 ? 3 : 1) : (rdy > 0 ? 0 : 2))) : null;
      const dN = dec ? dec.w : 0, dX = dec ? Math.max(0, Math.min(dN - 1, dN - 1 - Math.floor((((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) ? 1 - wallX : wallX) * dN))) : 0 /* gespiegelt: die Wandtextur-Spiegelung gilt für Beschriftung nicht; 0.47.12 (Nutzer: „Z ELLEN“, E/N ohne Steg): Spalte aus wallX in voller Schildauflösung statt aus der gröberen Wandtextur-Spalte texX (nur WN Stufen) */, dStep = dec ? dN / lineH : 0;
      for (let y = y0; y <= y1; y++) {
        let c = tbl[td[((texPos | 0) & WM) * WN + texX]];
        texPos += texStep;
        if (dec) { const dv = dec.data[Math.min(dN - 1, ((y - startRaw) * dStep) | 0) * dN + dX]; if (dv !== 255) c = tbl[dv]; }
        const o = y * W + x;
        buf[o] = c;
        if (step === 2) buf[o + 1] = c;
      }
      if (hf === 1 && hall && !viewIn && topRaw > 0) { // 0.32.1 (Nutzer: „Haus sieht aus wie ein Bungalow, soll Spitzdach haben“): Satteldach. Giebelwände (längs x) tragen ein Dreieck mit Holzverschalung, Seitenwände zeigen die Dachfläche (rote Schindeln) bis zum First
        const lw = hall.low, full = lineH * 1.25;
        let rh;
        if (side === 1) { const wx = px + dist * rdx, cxm = (lw[0] + lw[2] + 1) / 2, hw = (lw[2] - lw[0] + 1) / 2; rh = Math.floor(full * Math.max(0, 1 - Math.abs(wx - cxm) / hw)); } else rh = Math.floor(full * 0.9 * Math.abs(rdx) / Math.hypot(rdx, rdy)); // Dachfläche steigt je nach Blickwinkel: von der Seite bis zum First, in Längsrichtung kaum sichtbar
        const rTop = Math.max(0, topRaw - rh), rowH = Math.max(2, lineH * 0.1), u = texX / WN;
        for (let y = rTop; y < topRaw; y++) {
          const dyE = topRaw - 1 - y, ri = Math.floor(dyE / rowH), rf = 1 - (dyE / rowH - ri), v = Math.min(1, dyE / full); // v 0 = Traufe, 1 = First
          let c;
          if (side === 1) { // Giebel: senkrechte Bretter, Randbrett rot entlang der Schräge
            const edge = y <= rTop + Math.max(1, Math.floor(lineH * 0.035));
            const plank = Math.floor(u * 10), pj = (u * 10 - plank) < 0.08;
            c = edge ? tbl[P('blood', 2.6 + v * 1.2)] : tbl[P('wood', Math.max(0.8, (pj ? 1.6 : 4.2 + hash(plank, 0, 77) * 0.8) - v * 0.3))];
          } else { // Dachfläche: Schindelreihen, versetzt, First hell
            const stag = ((u * 8 + (ri & 1) * 0.5) % 1), join = stag < 0.06;
            let sh = 3.0 + v * 1.0 + hash(Math.floor(u * 8 + (ri & 1) * 0.5), ri, 91) * 0.7;
            if (rf > 0.82) sh -= 0.9; else if (rf < 0.12) sh += 0.5;
            if (join) sh -= 0.8;
            if (dyE < Math.max(1, Math.floor(lineH * 0.04))) sh = 1.0; // Traufenschatten
            if (y <= rTop + 1) sh = 5.4; // First
            c = tbl[P('blood', Math.max(0.6, sh))];
          }
          const o = y * W + x; buf[o] = c; if (step === 2) buf[o + 1] = c;
        }
      }
    };
    const hits = [];
    for (let x = 0; x < W; x += step) {
      const camX = 2 * (x + step * 0.5) / W - 1;
      const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      let mapX = Math.floor(px), mapY = Math.floor(py);
      const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (px - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (py - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }
      let side = 0, hit = 0, n = 0;
      hits.length = 0;
      for (let i = 0; i < 48; i++) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= gw || mapY >= gh) hit = WALL_STONE;
        else hit = grid[mapY * gw + mapX];
        if (!hit) continue;
        let dist = side === 0 ? sdx - ddx : sdy - ddy;
        if (dist < 0.0001) dist = 0.0001;
        hits.push({ hit, mapX, mapY, side, stepX, dist, hf: isLow(mapX, mapY) && mapX >= 0 && mapY >= 0 && mapX < gw && mapY < gh ? 1 : hall ? hall.h : 1 });
        if (!hall || hits[hits.length - 1].hf > 1) break; // niedrige Wand: dahinter weitersuchen (die hohe Wand dahinter ragt darüber)
      }
      if (!hits.length) { for (let i = 0; i < step; i++) zbuf[x + i] = 1e9; continue; }
      for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; drawWall(x, h.hit, h.mapX, h.mapY, h.side, h.stepX, rdx, rdy, h.dist, h.hf); }
      for (let i = 0; i < step; i++) zbuf[x + i] = hits[0].dist;
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
      if (s.span) { // 0.32.1: Strecke zwischen zwei Punkten im Raum (Hängematte): jede Texturspalte perspektivisch einzeln projiziert, Enden bleiben an den Stämmen
        const cx = s.x + 0.5, cy = s.y + 0.5, proj = (tx) => { const o = (tx * 64 / TN - 32) / 27, wx = cx + s.span[0] * o - px, wy = cy + s.span[1] * o - py; return { X: invDet * (dirY * wx - dirX * wy), Y: invDet * (-planeY * wx + planeX * wy) }; };
        const tbl2 = this.shadeTbl[dropFor(tY)];
        for (let tx = 0; tx < TN; tx++) {
          const c0 = proj(tx - 0.5), c1 = proj(tx + 0.5), cm = proj(tx);
          if (cm.Y <= 0.15 || c0.Y <= 0.1 || c1.Y <= 0.1) continue;
          const xa = Math.floor(W / 2 * (1 + c0.X / c0.Y)), xb = Math.floor(W / 2 * (1 + c1.X / c1.Y));
          const hh = Math.floor(focal / cm.Y * s.scale), bt = Math.floor(half + 0.5 * focal / cm.Y), tp = bt - hh;
          for (let x = Math.max(0, Math.min(xa, xb)); x <= Math.min(W - 1, Math.max(xa, xb)); x++) {
            if (cm.Y >= zbuf[x]) continue;
            for (let y = Math.max(0, tp); y <= Math.min(H - 1, bt - 1); y++) { const idx = td[Math.floor((y - tp) * TN / hh) * TN + tx]; if (idx !== 255) buf[y * W + x] = tbl2[idx]; }
          }
        }
        continue;
      }
      let wf = 1; // Durchgänge stehen fest im Raum: Breite nach Blickwinkel zur Durchgangsachse
      if (s.axis) { const len = Math.hypot(s.x + 0.5 - px, s.y + 0.5 - py) || 1; wf = Math.max(0.12, Math.min(1, Math.abs(((s.x + 0.5 - px) * s.axis[0] + (s.y + 0.5 - py) * s.axis[1]) / len))); }
      const sprH = Math.floor(focal / tY * s.scale), sprW = Math.max(1, Math.floor(sprH * wf));
      if (sprH < 2) continue;
      const bottom = Math.floor(half + 0.5 * focal / tY), top = bottom - sprH;
      const x0 = screenX - (sprW >> 1);
      if (s.foe) { // 0.23.3: Bildschirmlage für die Lebensbalken über dem Gegner (main.js)
        if (s.tex.opTop == null) { let r = 0; outer: for (; r < TN; r++) for (let c = 0; c < TN; c++) if (td[r * TN + c] !== 255) break outer; s.tex.opTop = r / TN; }
        const hb = Math.floor(focal / tY * (s.base || s.scale)); s.scr = { cx: screenX, top: bottom - hb + hb * s.tex.opTop, w: Math.max(1, Math.floor(hb * wf)), tY }; // 0.23.12: Lage ohne Atem-Schwanken, sonst wackelt der Lebensbalken
      }
      const tbl = this.shadeTbl[dropFor(tY)];
      const ya = Math.max(0, top), yb = Math.min(H - 1, bottom - 1);
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + sprW); x++) {
        if (!s.front && tY >= zbuf[x]) continue; // 0.23.3: Gegner im laufenden Kampf verschwinden nicht hinter Seitenwänden
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
// 0.28.0: Bodenarten je Feld für den Raycaster: Karte '~' = Wasser (1); lvl.floor (optional, gleiche Größe wie map): '=' Bohlen quer zur x-Achse (2), '|' Bohlen quer zur y-Achse (3). Null, wenn das Gebiet weder Wasser noch Bohlen hat.
const floorGridCache = new WeakMap();
export function buildFloorGrid(lvl) {
  if (floorGridCache.has(lvl)) return floorGridCache.get(lvl);
  const w = lvl.map[0].length, h = lvl.map.length, fg = new Uint8Array(w * h);
  let any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = lvl.floor && lvl.floor[y] ? lvl.floor[y][x] : '.';
    const v = lvl.map[y][x] === '~' ? 1 : f === '=' ? 2 : f === '|' ? 3 : f === '+' ? 4 : f === 'r' ? 5 : f === 's' ? 6 : 0;
    if (v) { fg[y * w + x] = v; any = true; }
  }
  const r = any ? { fg, gw: w, gh: h } : null;
  floorGridCache.set(lvl, r);
  return r;
}
export function buildGrid(lvl, objs) {
  const w = lvl.map[0].length, h = lvl.map.length;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = lvl.map[y][x];
    grid[y * w + x] = c === '#' ? WALL_STONE : c === 'm' ? WALL_MOSS : c === 'T' ? WALL_TORCH : c === 'r' ? WALL_ROCK : c === 'o' ? WALL_LICHEN : c === 'h' ? WALL_HOUSE : c === 'v' ? WALL_VEGAS : 0;
  }
  for (const o of objs) if ((o.type === 'illusion' && !o.found) || (o.type === 'secret' && o.needs && !o.open)) { // 0.40.0: Kartenwand sieht aus wie jede Mauer; // 0.22.0: Illusionswand = Mauer wie die Nachbarn
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => grid[(o.y + dy) * w + o.x + dx]).find((v) => v === WALL_STONE || v === WALL_MOSS || v === WALL_ROCK || v === WALL_LICHEN);
    grid[o.y * w + o.x] = nb || WALL_STONE;
  }
  for (const o of objs) if (o.type === 'door' && !o.open) grid[o.y * w + o.x] = doorWall(o);
  for (const o of objs) if (o.type === 'gate' && !o.open) grid[o.y * w + o.x] = o.web ? WALL_WEB : WALL_GATE;
  for (const o of objs) { if (o.type === 'secret' && !o.open && !o.needs) grid[o.y * w + o.x] = WALL_SECRET; else if (o.type === 'lever' && o.wall) grid[o.y * w + o.x] = o.torch ? WALL_TORCH : o.used ? WALL_SWITCH_ON : WALL_SWITCH; } // torch (0.23.7): Schalter sieht aus wie eine gewöhnliche Wandfackel
  return { grid, gw: w, gh: h };
}
const spriteFor = (tex, k) => (k === 'moorlicht' ? tex.sprites.wisp : k === 'skeleton' ? tex.sprites.skeleton : k === 'kultwaechter' ? tex.sprites.guard : k === 'turmwache' ? tex.sprites.turmwache : k === 'schlackenwaechter' ? tex.sprites.schlacke : k === 'wolf' ? tex.sprites.wolf : k === 'kultist' ? tex.sprites.kultist : k === 'hauptmann' ? tex.sprites.captain : k === 'giessmeister' ? tex.sprites.giessmeister : k === 'erzkaefer' ? tex.sprites.kaefer : k === 'nebelgeist' ? tex.sprites.geist : (k === 'kultpriester' || k === 'quellhueterin') ? tex.sprites.priester : k === 'truhenmaul' ? tex.sprites.mimic : k === 'brandmagier' ? tex.sprites.magier : (k === 'riesenspinne' || k === 'brutspinne' || k === 'netzwaechter') ? tex.sprites.spinne : k === 'spinnenkoenigin' ? tex.sprites.koenigin : k === 'blutdiener' ? tex.sprites.diener : k === 'vampirbrut' ? tex.sprites.brut : k === 'blutgraefin' ? tex.sprites.graefin : k === 'teufel' ? tex.sprites.teufel : k === 'nebelhueter' ? tex.sprites.hueter : k === 'schrat' ? tex.sprites.moorschrat : k === 'grubenschrat' ? tex.sprites.grubenschrat : tex.sprites.schrat);
const bossScale = (k) => (k === 'schrat' || k === 'grubenschrat' || k === 'nebelhueter' ? 1.2 : k === 'hauptmann' || k === 'blutgraefin' || k === 'giessmeister' || k === 'quellhueterin' ? 1.12 : k === 'truhenmaul' ? 0.8 : k === 'spinnenkoenigin' ? 1.4 : k === 'brutspinne' ? 0.7 : k === 'netzwaechter' ? 1.0 : k === 'riesenspinne' ? 1.15 : k === 'teufel' ? 1.12 : 0.9); // Bosse stehen größer im Gang
export const GROUP_SCALE = 0.78, GROUP_GAP = 0.44, CHEST_SCALE = 0.58; // 0.16.4: Gruppen vorher 0.62/0.36, Truhe 0.5 (Nutzer: zu klein, hinter der Leiste)
let combatFit = 1; // 0.16.17: im Kampf verkleinert die Kamera zu große Figuren so, dass sie samt Füßen über der Leiste ins Bild passen
export const setCombatFit = (v) => { combatFit = v; };
// 0.19.2: Gruppen je nach Größe kleiner, damit sich die Gestalten nicht überschneiden (Nutzer: „Gegner überschneiden sich“)
export const GROUP_SIZE = { 2: 0.84, 3: 0.72 }; // 0.22.1 (Nutzer: „Gegner wirken zu klein“): vorher 0.72 / 0.6
export const spriteScale = (k, n) => bossScale(k) * // 0.22.1 (Nutzer: „alle gleich groß, wie auf offener Fläche“): Gruppengröße ändert die Figurengröße nicht mehr
   (k === 'wolf' ? 1.3 : k === 'moorlicht' && n > 1 ? 0.84 : 1); // 0.47.10 (Nutzer: „Geist ragt heraus“): das Moorlicht ist breit (Schleier, Ärmel) und ragte im Gang in die Wand; in Gruppen kleiner // Wolf ist niedrig gebaut: größer ansetzen (0.19.3: 1,25 → 1,45; 0.19.5: 1,65, Nutzer: „noch etwas größer“; 0.47.7 Nutzer: „Monster zu groß“ → 1,3)
// Aufstellung einer Gruppe (0.16.4b): lat = seitlich (rechts +), dep = Tiefe (vom Betrachter weg). Im engen Gang (links und rechts Wand)
// stehen die Gegner gestaffelt hintereinander statt nebeneinander, sonst ragen sie in die Wände (Nutzer-Screenshot 0.16.4).
// 0.22.1: Alle Figuren in voller Größe. Offen: nebeneinander. Enger Gang (1 Feld): eine vorn, die anderen leicht versetzt dahinter;
// grow gleicht die Perspektive teilweise aus, damit die hinteren nicht klein wirken (Nutzer: „im Gang werden sie klein“).
export function groupOffsets(n, narrow, side = 0) { // side (0.23.4): -1 = Wand links, +1 = Wand rechts, 0 = frei – die Gruppe rückt von der Wand weg (Nutzer: „Monster in der Wand“)
  if (n <= 1) return [{ lat: 0, dep: 0, grow: 1 }];
  if (narrow) return n >= 3
    ? [{ lat: -0.13, dep: 0, grow: 1 }, { lat: 0.14, dep: 0.12, grow: 1.08 }, { lat: 0, dep: 0.6, grow: 1.36 }]
    : [{ lat: -0.15, dep: 0, grow: 1 }, { lat: 0.17, dep: 0.14, grow: 1.08 }]; // 0.23.8: näher an der Mitte (breite Figuren mit Schild ragten an die Wand)
  if (n >= 3 && side !== 0) { // 0.26.3 (Nutzer: im breiten Gang nebeneinander): Wand nur auf einer Seite – zwei vorn nebeneinander, die dritte mittig dahinter
    const k = -side; // k: Richtung weg von der Wand
    void k; // 0.31.3 (Nutzer: „Monster sollen mittig stehen“): Gruppe bleibt in der Feldmitte, auch neben einer Wand
    return [{ lat: -0.28, dep: 0, grow: 1 }, { lat: 0.28, dep: 0, grow: 1 }, { lat: 0, dep: 0.62, grow: 1.32 }];
  }
  const gap = n >= 3 ? 0.5 : 0.42; // 0.26.5 (Nutzer: „Stehen zu weit auseinander“): vorher 0.56/0.62
  const lats = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * gap);
  // 0.31.3: kein Verschieben von der Wand weg mehr, die Gruppe steht mittig
  return lats.map((lat) => ({ lat, dep: 0, grow: 1 }));
}
// Wand direkt links/rechts des Feldes (aus Sicht der Kamera)
export function wallSides(g, x, y, angle) {
  if (!g) return { l: false, r: false };
  const rx = Math.round(Math.cos(angle)), ry = Math.round(Math.sin(angle));
  const wall = (cx, cy) => cx < 0 || cy < 0 || cx >= g.gw || cy >= g.gh || g.grid[cy * g.gw + cx] !== 0;
  return { l: wall(x - rx, y - ry), r: wall(x + rx, y + ry) };
}
export function groupLayout(g, x, y, angle, n) {
  const { l, r } = wallSides(g, x, y, angle);
  return groupOffsets(n, n > 1 && l && r, l && !r ? -1 : r && !l ? 1 : 0); // Wand auf einer Seite: groupOffsets weicht von der Wand weg (drei: Dreieck)
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
// 0.23.13 (Nutzer: „Bei Annäherung dreht sich das Tor um 90 Grad“): frei im Raum stehende Treppen/Ausgänge hatten keine feste Achse und drehten sich als Aufsteller zur Kamera.
// Jetzt stehen sie fest parallel zur nächsten Wand (bei Gleichstand: Nord-Süd-Blick).
function freeAxis(grid, o) {
  const wl = (x, y) => x < 0 || y < 0 || x >= grid.gw || y >= grid.gh || grid.grid[y * grid.gw + x] !== 0;
  const run = (dx, dy) => { let n = 0; while (n < 12 && !wl(o.x + dx * (n + 1), o.y + dy * (n + 1))) n++; return n; };
  const ns = Math.min(run(0, -1), run(0, 1)), ew = Math.min(run(-1, 0), run(1, 0));
  return ns <= ew ? [0, 1] : [1, 0];
}
export function buildSprites(objs, tex, time, angle = 0, alive = null, grid = null) { // alive: {objId: Arten (Liste) oder Anzahl der lebenden Gegner} im Kampf; grid: für enge Gänge
  const out = [];
  const rx = Math.cos(angle), ry = Math.sin(angle); // „rechts“ aus Sicht der Kamera
  const fx = Math.sin(angle), fy = -Math.cos(angle); // „vorn“
  for (const o of objs) {
    if (o.type === 'plate') out.push({ x: o.x, y: o.y, tex: o.down ? tex.sprites.plateDown : tex.sprites.plate, scale: 1 });
    else if (o.type === 'teleport') { if (o.look !== 'hidden') out.push({ x: o.x, y: o.y, tex: o.open ? tex.sprites.teleOff : tex.sprites.teleOn, scale: 1 }); }
    else if (o.type === 'boulder') out.push({ x: o.x, y: o.y, tex: tex.sprites.boulder, scale: 0.78 });
    else if (o.type === 'trap') { if (!o.disarmed) out.push({ x: o.x, y: o.y, tex: o.sprung ? tex.sprites['trapSprung_' + o.kind] || tex.sprites.trapSprung : o.spotted ? tex.sprites.trapSeen : tex.sprites.trapFaint, scale: 1 }); }
    else if (o.type === 'chest') out.push({ x: o.x, y: o.y, tex: chestTex(tex, o), scale: CHEST_SCALE });
    else if (o.type === 'enemy' && !o.dead && !o.lurk) {
      const tot = Array.isArray(o.kinds) ? Math.min(3, o.kinds.length) : 1;
      const av = alive && alive[o.id] != null ? alive[o.id] : null, kindList = Array.isArray(av) ? av : null;
      const n = kindList ? kindList.length : av != null ? av : tot; // Gruppe: eine Gestalt je lebendem Gegner, nebeneinander
      const offs = groupLayout(grid, o.x, o.y, angle, n), tight = n > 1 && isNarrowAt(grid, o.x, o.y, angle);
      for (let i = 0; i < n; i++) {
        let { lat, dep, grow } = offs[i];
        const kd = kindList ? kindList[i] : kindOf(o, i);
        if (n > 1 && kd === 'moorlicht') lat = tight ? lat * 0.25 : Math.max(-0.12, Math.min(0.12, lat)); // 0.47.10/11: breite Gestalt nah an die Mitte in jeder Aufstellung (Nutzer-Screenshot: Aufstellung „Wand auf einer Seite“ stellte sie bei +0,28 an die rechte Wand)
        const sc = spriteScale(kd, n) * combatFit * (grow || 1);
        const inFight = !!(alive && alive[o.id] != null);
        out.push({ x: o.x + rx * lat + fx * dep, y: o.y + ry * lat + fy * dep, tex: spriteFor(tex, kd), scale: sc, base: sc, front: inFight, foe: inFight ? { id: o.id, k: i } : null });
      }
    }
    else if (o.type === 'buried') { if (o.sensed && !o.dug) out.push({ x: o.x, y: o.y, tex: tex.sprites.mound, scale: 0.55 }); }
    else if (o.type === 'barrel') out.push({ x: o.x, y: o.y, tex: o.broken ? tex.sprites.fassKaputt : tex.sprites.fass, scale: o.scale || 0.95 }); // 0.44.0: zerschlagbares Fass
    else if (o.type === 'decor') out.push({ x: o.x, y: o.y, tex: tex.sprites[o.look] || tex.sprites.boot, scale: o.scale || 0.95, span: o.look === 'haengematte' ? [1, 0] : undefined }); // 0.32.1: Hängematte als Strecke zwischen den Palmen (Palmen liegen links/rechts, x-Richtung): Hängematte steht fest als Ebene zwischen den Palmen (Normale nord–süd) // 0.28.0: feste Dekoration (Boot)
    else if (o.type === 'lever' && !o.wall) out.push({ x: o.x, y: o.y, tex: o.used ? tex.sprites.leverDown : tex.sprites.leverUp, scale: 0.75 });
    else if (o.type === 'sign' && o.face == null) out.push({ x: o.x, y: o.y, tex: signTex(tex, o), scale: 0.7 }); // mit face: Tafel hängt an der Wand (buildDecals)
    else if (o.type === 'door' && o.open && grid) { // offene Tür: Rahmen + aufgeklapptes Blatt, nur beim Blick längs des Durchgangs (sonst stünde der Rahmen quer)
      const wl = (x, y) => x < 0 || y < 0 || x >= grid.gw || y >= grid.gh || grid.grid[y * grid.gw + x] !== 0;
      const ns = wl(o.x - 1, o.y) && wl(o.x + 1, o.y);
      out.push({ x: o.x, y: o.y, tex: cachedTex(tex, 'frames', styleFor(o) + (o.look || '') + (o.textless ? '#' : o.title || ''), () => genDoorFrame(o.textless ? '' : o.title, styleFor(o), 137, o.look)), scale: 1, axis: ns ? [0, 1] : [1, 0] });
    }
    else if (o.type === 'gate' && o.open && grid) { // offenes Gitter: hochgezogene Stäbe im Durchgang (nur beim Blick längs, wie offene Tür)
      const wl = (x, y) => x < 0 || y < 0 || x >= grid.gw || y >= grid.gh || grid.grid[y * grid.gw + x] !== 0;
      const ns = wl(o.x - 1, o.y) && wl(o.x + 1, o.y), ew = wl(o.x, o.y - 1) && wl(o.x, o.y + 1);
      if (ns || ew) out.push({ x: o.x, y: o.y, tex: tex.sprites.gateOpen, scale: 1, axis: ns ? [0, 1] : [1, 0] });
    }
    else if (o.type === 'rail') out.push({ x: o.x + (o.dx || 0), y: o.y + (o.dy || 0), tex: o.torch ? tex.sprites.railTorch : tex.sprites.rail, scale: o.torch ? 1.0 : 0.55, axis: o.ax === 'y' ? [1, 0] : [0, 1] }); // Brückengeländer: axis = Flächennormale; Ebene längs der Bahn steht beim Blick entlang der Bahn kantig (schmal)
    else if (o.type === 'runestone') out.push({ x: o.x, y: o.y, tex: tex.sprites.runeStone, scale: 0.9 });
    else if (o.type === 'merchant') out.push({ x: o.x, y: o.y, tex: tex.sprites[o.look] || tex.sprites.merchant, scale: o.look ? 0.95 : 0.8 });
    else if (o.type === 'npc' && !o.gone) out.push({ x: o.x, y: o.y, tex: tex.sprites[o.look] || tex.sprites.merchant, scale: o.scale || (o.look === 'kultist' || o.look === 'guard' ? 0.95 : 0.85) }); // 0.25.0: Begegnungspersonen (look = Spritename)
    else if (o.type === 'stairs' || o.type === 'exit') {
      if (grid && passFaces((x, y) => x < 0 || y < 0 || x >= grid.gw || y >= grid.gh || grid.grid[y * grid.gw + x] !== 0, o).length) continue; // liegt an einer Wand: als Wand-Abziehbild (buildDecals)
      out.push({ x: o.x, y: o.y, tex: passTex(tex, o), scale: 0.9, axis: grid ? passAxis(grid, o) || freeAxis(grid, o) : null });
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
