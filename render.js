// Die Schatten von Eldermoor – Raycasting-Renderer und prozedurale Grafik
// Autor: eldermoor-dev
// Der Renderer arbeitet auf einem eigenen Pixelpuffer (Uint32Array) und kennt weder DOM noch Canvas.
// Dadurch ist er in Node testbar und später austauschbar.

export const W = 480, H = 270, TEX = 64;
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
  const t = mk(255);
  const seg = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay;
    const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (ax + vx * k), py - (ay + vy * k));
  };
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const bx = (x - 32) / 15, by = (y - 40) / 22;
    const hx = (x - 32) / 9, hy = (y - 16) / 11;
    const armL = seg(x, y, 19, 30, 9, 54), armR = seg(x, y, 45, 30, 55, 54);
    let shape = null, cx = 32, cy = 40, r = 20;
    if (hx * hx + hy * hy <= 1) { shape = 'head'; cx = 32; cy = 16; r = 11; }
    else if (bx * bx + by * by <= 1) { shape = 'body'; }
    else if (armL <= 4.5) { shape = 'arm'; cx = 14; cy = 42; r = 14; }
    else if (armR <= 4.5) { shape = 'arm'; cx = 50; cy = 42; r = 14; }
    if (!shape) continue;
    const l = ((x - cx) * 0.9 + (y - cy) * 0.7) / r;
    let sh = 3.2 - l * 1.6 + (vnoise(x, y, 4, seed) - 0.5) * 1.8;
    let mat = 'flesh';
    if (vnoise(x, y, 8, seed + 3) > 0.64) { mat = 'moss'; sh = 2.5 + sh * 0.3; }
    if (shape === 'arm' && (y > 51)) sh = 6; // Klauen
    t.data[y * TEX + x] = P(mat, sh);
  }
  const copy = t.data.slice();
  for (let y = 1; y < TEX - 1; y++) for (let x = 1; x < TEX - 1; x++) { // dunkler Umriss
    const i = y * TEX + x;
    if (copy[i] === 255) continue;
    if (copy[i - 1] === 255 || copy[i + 1] === 255 || copy[i - TEX] === 255 || copy[i + TEX] === 255) t.data[i] = (copy[i] & ~7) | Math.max(0, (copy[i] & 7) - 2);
  }
  const eye = (ex, ey) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d <= 1) t.data[(ey + dy) * TEX + ex + dx] = P('glow', 7);
      else if (d === 2) t.data[(ey + dy) * TEX + ex + dx] = P('glow', 3);
    }
  };
  eye(28, 15); eye(36, 15);
  for (let x = 27; x <= 37; x++) t.data[(22 + (x % 2)) * TEX + x] = P('flesh', 0);
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

export function makeTextures() {
  return {
    wall: { [WALL_STONE]: genStone(11), [WALL_MOSS]: genMoss(23), [WALL_DOOR]: genDoor(31, false), [WALL_DOOR_LOCKED]: genDoor(31, true) },
    floor: genFloor(41),
    ceil: genCeil(53),
    sprites: { chest: genChest(false, 61), chestOpen: genChest(true, 61), schrat: genSchrat(71), portal: genPortal(81) }
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
      const ftex = tex.floor.data, ctex = tex.ceil.data;
      const rdx0 = dirX - planeX, rdy0 = dirY - planeY, rdx1 = dirX + planeX, rdy1 = dirY + planeY;
      for (let y = half; y < H; y++) {
        const p = y + 0.5 - half;
        const rowDist = 0.5 * focal / p;
        const tbl = this.shadeTbl[dropFor(rowDist)];
        let fx = px + rowDist * rdx0, fy = py + rowDist * rdy0;
        const sx = rowDist * (rdx1 - rdx0) / W, sy = rowDist * (rdy1 - rdy0) / W;
        const rowF = y * W, rowC = (H - 1 - y) * W;
        for (let x = 0; x < W; x++) {
          const tx = ((fx * TEX) | 0) & 63, ty = ((fy * TEX) | 0) & 63;
          const ti = ty * TEX + tx;
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
      let texX = Math.floor(wallX * TEX);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = TEX - 1 - texX;
      const td = tex.wall[hit].data;
      const tbl = this.shadeTbl[Math.min(7, dropFor(dist) + side)];
      const texStep = TEX / lineH;
      let texPos = (y0 - startRaw) * texStep;
      for (let y = y0; y <= y1; y++) {
        const c = tbl[td[((texPos | 0) & 63) * TEX + texX]];
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
      const td = s.tex.data;
      const screenX = Math.floor(W / 2 * (1 + tX / tY));
      const sprH = Math.floor(focal / tY * s.scale), sprW = sprH;
      if (sprH < 2) continue;
      const bottom = Math.floor(half + 0.5 * focal / tY), top = bottom - sprH;
      const x0 = screenX - (sprW >> 1);
      const tbl = this.shadeTbl[dropFor(tY)];
      const ya = Math.max(0, top), yb = Math.min(H - 1, bottom - 1);
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + sprW); x++) {
        if (tY >= zbuf[x]) continue;
        const tx = Math.floor((x - x0) * TEX / sprW);
        for (let y = ya; y <= yb; y++) {
          const ty = Math.floor((y - top) * TEX / sprH);
          const idx = td[ty * TEX + tx];
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
