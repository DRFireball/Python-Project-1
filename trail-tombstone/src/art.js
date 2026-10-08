/*
 * art.js — palette, drawing primitives and the procedural pixel art:
 * prairie backdrop, headstone, and the three "departed" subjects
 * (a fallen traveler, a horse, a tipped-over covered wagon).
 *
 * Everything draws into Layer objects holding palette indices (-1 = empty),
 * so the output stays a strict indexed palette that encodes cleanly to GIF.
 */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (globalThis.TrailTombstone = globalThis.TrailTombstone || {}).art = factory();
})(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Palette
  // ---------------------------------------------------------------------------

  // Sky-dependent colors, set explicitly per time of day.
  const SKY_SETS = {
    day: {
      sky0: '#3f76c2', sky1: '#5e93d4', sky2: '#8ab6e3', sky3: '#c3dcef',
      sun: '#fff6cf', sunGlow: '#f6e6a6', cloud: '#ffffff', cloudShade: '#d3e1ef',
      mtnFar: '#93a8cb', mtnFarShade: '#7489b0', mtnNear: '#7e9a8a', mtnNearShade: '#688572',
      snow: '#f1f5fb', haze: '#c4d39a', star: '#ffffff', starDim: '#9fb6dc',
    },
    dusk: {
      sky0: '#2a1e4d', sky1: '#6b3a6e', sky2: '#c25e5e', sky3: '#f29b56',
      sun: '#ffd77a', sunGlow: '#ffb35c', cloud: '#f5a87c', cloudShade: '#b6607a',
      mtnFar: '#6a4777', mtnFarShade: '#4f3463', mtnNear: '#4c4562', mtnNearShade: '#3a3550',
      snow: '#f0b9a8', haze: '#9a8a5a', star: '#fff2d6', starDim: '#b98aa8',
    },
    night: {
      sky0: '#060a1c', sky1: '#0d1533', sky2: '#16224a', sky3: '#22325f',
      sun: '#e8edf7', sunGlow: '#9aa9cc', cloud: '#3b4775', cloudShade: '#2b3560',
      mtnFar: '#1d2648', mtnFarShade: '#151c3a', mtnNear: '#17213a', mtnNearShade: '#111a30',
      snow: '#a6b2d4', haze: '#2c3d43', star: '#ffffff', starDim: '#6f7fae',
    },
  };

  // Colors lit by the sky (tinted at dusk and night).
  const LIT = {
    k: '#1b1512',
    grass0: '#b9d06a', grass1: '#93b04e', grass2: '#6e8e3a', grass3: '#4e6b2a', grass4: '#36501e',
    dirt0: '#bf9a64', dirt1: '#9a7443', dirt2: '#6f532f',
    stone0: '#e2ded2', stone1: '#bdb8ab', stone2: '#959082', stone3: '#615d55',
    moss0: '#7b9a3c', moss1: '#55722b',
    wood0: '#c08850', wood1: '#946035', wood2: '#62401f',
    canvas0: '#f2ead4', canvas1: '#d4c6a4', canvas2: '#a8977a',
    iron: '#4b4643',
    skin0: '#eab68b', skin1: '#c98b62',
    hair: '#5b3b22',
    shirt0: '#be4a3c', shirt1: '#8e3129',
    pants0: '#56679a', pants1: '#3d4a73',
    boot: '#43291a', bootHi: '#6b4430',
    hat0: '#93714a', hat1: '#6c5134', hatBand: '#2d2018',
    horse0: '#a86a3c', horse1: '#7f4a28', horse2: '#5a3219', belly: '#cf9c6c',
    mane: '#2f1e13', hoof: '#2b2622', sock: '#efe7d8',
    tongue: '#e57b8c',
    buzz0: '#2a2426', buzz1: '#4d4446', buzzHead: '#cf7a6e',
    fly: '#141414', flyWing: '#d6e2ea',
    flowerY: '#f3d24c', flowerW: '#f5f0e3', flowerP: '#c784c4',
    metal: '#a9b0b5',
  };

  // Interface colors — never tinted.
  const UI = {
    capBg: '#0f0c0a', capFg: '#f3ebd7', capDim: '#8e8675', cursor: '#f3ebd7',
    ghost0: '#f1f6ff', ghost1: '#b8c7ea', ghostEye: '#24304f',
  };

  const NAMES = [...Object.keys(SKY_SETS.day), ...Object.keys(LIT), ...Object.keys(UI)];
  const C = {};
  NAMES.forEach((n, i) => (C[n] = i));

  const TINTS = {
    day: { mul: [1, 1, 1], to: [0, 0, 0], amt: 0 },
    dusk: { mul: [1.0, 0.8, 0.7], to: [255, 128, 84], amt: 0.1 },
    night: { mul: [0.4, 0.48, 0.74], to: [36, 52, 110], amt: 0.08 },
  };

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function buildPalette(sky) {
    const set = SKY_SETS[sky] || SKY_SETS.day;
    const tint = TINTS[sky] || TINTS.day;
    return NAMES.map((name) => {
      if (name in set) return hexToRgb(set[name]);
      if (name in UI) return hexToRgb(UI[name]);
      const rgb = hexToRgb(LIT[name]);
      return rgb.map((v, i) => {
        const m = v * tint.mul[i];
        return Math.max(0, Math.min(255, Math.round(m + (tint.to[i] - m) * tint.amt)));
      });
    });
  }

  // Green-screen look: only black and neon green. Each palette color gets a
  // brightness level 0-4, drawn as an ordered-dither pattern
  // (0 = black, 1 = 25% green dots, 2 = checkerboard, 3 = 75%, 4 = solid green).
  const GREEN_SCREEN = [[0, 0, 0], [57, 255, 20]];
  const MONO = {
    sky0: 0, sky1: 0, sky2: 0, sky3: 1, sun: 4, sunGlow: 2, cloud: 3, cloudShade: 1,
    mtnFar: 3, mtnFarShade: 2, mtnNear: 4, mtnNearShade: 1, snow: 4, haze: 1, star: 4, starDim: 2,
    k: 0,
    grass0: 2, grass1: 0, grass2: 0, grass3: 0, grass4: 0,
    dirt0: 3, dirt1: 2, dirt2: 1,
    stone0: 4, stone1: 4, stone2: 2, stone3: 0,
    moss0: 2, moss1: 1,
    wood0: 4, wood1: 2, wood2: 1,
    canvas0: 4, canvas1: 2, canvas2: 1,
    iron: 1,
    skin0: 4, skin1: 3, hair: 2,
    shirt0: 4, shirt1: 2,
    pants0: 3, pants1: 1,
    boot: 2, bootHi: 4,
    hat0: 3, hat1: 2, hatBand: 0,
    horse0: 3, horse1: 2, horse2: 1, belly: 4, mane: 1, hoof: 1, sock: 4,
    tongue: 4,
    buzz0: 4, buzz1: 2, buzzHead: 4,
    fly: 4, flyWing: 2,
    flowerY: 4, flowerW: 4, flowerP: 3,
    metal: 4,
    capBg: 0, capFg: 4, capDim: 2, cursor: 4,
    ghost0: 4, ghost1: 2, ghostEye: 0,
  };
  const MONO_SKY = {
    day: { sky2: 1 },
    dusk: {},
    night: { sky3: 0, cloud: 2 },
  };

  /** Brightness level (0-4) for every palette index, for the green-screen look. */
  function monoLevels(sky) {
    const over = MONO_SKY[sky] || {};
    return Uint8Array.from(NAMES, (n) => (n in over ? over[n] : MONO[n] != null ? MONO[n] : 2));
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];

  class Layer {
    constructor(w, h, fill) {
      this.w = w;
      this.h = h;
      this.data = new Int16Array(w * h).fill(fill == null ? -1 : fill);
    }
    clone() {
      const l = new Layer(this.w, this.h);
      l.data.set(this.data);
      return l;
    }
    inb(x, y) {
      return x >= 0 && y >= 0 && x < this.w && y < this.h;
    }
    set(x, y, c) {
      x = Math.round(x);
      y = Math.round(y);
      if (this.inb(x, y)) this.data[y * this.w + x] = c;
    }
    get(x, y) {
      return this.inb(x, y) ? this.data[y * this.w + x] : -1;
    }
    rect(x, y, w, h, c) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
    }
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.set(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    thickLine(x0, y0, x1, y1, c, t) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const y = y0 + ((y1 - y0) * i) / n;
        this.disc(x, y, t / 2, c);
      }
    }
    disc(cx, cy, r, c) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 0.25) this.set(x, y, c);
    }
    ellipse(cx, cy, rx, ry, c, test) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x - cx) / (rx + 0.35), ny = (y - cy) / (ry + 0.35);
          if (nx * nx + ny * ny <= 1 && (!test || test(x, y))) this.set(x, y, c);
        }
    }
    poly(points, c) {
      let minY = Infinity, maxY = -Infinity;
      for (const [, y] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        const xs = [];
        const sy = y + 0.5;
        for (let i = 0; i < points.length; i++) {
          const [x0, y0] = points[i];
          const [x1, y1] = points[(i + 1) % points.length];
          if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2)
          for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c);
      }
    }
    /** Recolor every filled pixel via fn(x, y, color) -> color. */
    map(fn) {
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const i = y * this.w + x;
          if (this.data[i] >= 0) this.data[i] = fn(x, y, this.data[i]);
        }
    }
    /** Blit an ASCII sprite. `key` maps characters to palette indices. */
    sprite(rows, key, ox, oy, flipX) {
      rows.forEach((row, y) => {
        const chars = Array.from(row);
        chars.forEach((ch, x) => {
          if (key[ch] == null) return;
          this.set(ox + (flipX ? chars.length - 1 - x : x), oy + y, key[ch]);
        });
      });
    }
    /** Add a 1px outline (4-neighbourhood) around all filled pixels. */
    outline(c, diag) {
      const src = this.data.slice();
      const w = this.w, h = this.h;
      const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] >= 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (src[y * w + x] >= 0) continue;
          let edge = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
          if (!edge && diag) edge = filled(x - 1, y - 1) || filled(x + 1, y - 1) || filled(x - 1, y + 1) || filled(x + 1, y + 1);
          if (edge) this.data[y * w + x] = c;
        }
      return this;
    }
    /** Composite onto another layer. `dither` 0..1 keeps that share of pixels. */
    drawOnto(target, ox, oy, dither) {
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const c = this.data[y * this.w + x];
          if (c < 0) continue;
          const tx = x + ox, ty = y + oy;
          if (dither != null && dither < 1 && bayer(tx, ty) >= dither) continue;
          target.set(tx, ty, c);
        }
    }
  }

  // ---------------------------------------------------------------------------
  // Backdrop
  // ---------------------------------------------------------------------------

  const W = 240;
  const H = 160;
  const HORIZON = 88;

  function drawSky(L, sky, frame, seed) {
    const bands = [C.sky0, C.sky1, C.sky2, C.sky3];
    for (let y = 0; y < HORIZON; y++) {
      const t = (y / (HORIZON - 1)) * (bands.length - 1);
      const i = Math.min(bands.length - 2, Math.floor(t));
      let f = t - i;
      f = Math.max(0, Math.min(1, (f - 0.3) / 0.4)); // solid bands, dithered seams
      for (let x = 0; x < W; x++) L.set(x, y, f > bayer(x, y) ? bands[i + 1] : bands[i]);
    }

    if (sky === 'night') {
      const rnd = mulberry32(seed ^ 0x51a7);
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(rnd() * W);
        const y = Math.floor(rnd() * (HORIZON - 26));
        const bright = rnd() < 0.3;
        const sparkle = rnd() < 0.5;
        const twinkle = (frame + i * 7) % 24 < 3;
        L.set(x, y, twinkle ? C.starDim : bright ? C.star : C.starDim);
        if (bright && !twinkle && sparkle) {
          L.set(x - 1, y, C.starDim); L.set(x + 1, y, C.starDim);
          L.set(x, y - 1, C.starDim); L.set(x, y + 1, C.starDim);
        }
      }
      // crescent moon
      const moon = new Layer(24, 24);
      moon.disc(12, 12, 8.5, C.sun);
      moon.map((x, y, c) => (x + y > 27 ? C.sunGlow : c));
      moon.disc(16, 9, 7.5, -1);
      moon.drawOnto(L, 186, 8);
    } else if (sky === 'dusk') {
      // big low sun sinking behind the ridge
      for (let r = 17; r >= 0; r--) {
        const col = r > 14 ? C.sunGlow : C.sun;
        for (let y = -r; y <= r; y++)
          for (let x = -r; x <= r; x++)
            if (x * x + y * y <= r * r && (r <= 14 || bayer(x, y) > 0.5)) L.set(176 + x, 70 + y, col);
      }
      // horizontal bands across the sun
      for (const yy of [66, 71, 75, 78]) for (let x = 160; x < 194; x++) if (L.get(x, yy) === C.sun) L.set(x, yy, C.sunGlow);
    } else {
      for (let y = -12; y <= 12; y++)
        for (let x = -12; x <= 12; x++) {
          const d = Math.sqrt(x * x + y * y);
          if (d <= 7.5) L.set(204 + x, 22 + y, C.sun);
          else if (d <= 10.5 && bayer(x, y) > 0.55) L.set(204 + x, 22 + y, C.sunGlow);
        }
    }

    if (sky !== 'night') {
      drawCloud(L, 22, 20, 1.0);
      drawCloud(L, 120, 12, 0.75);
      drawCloud(L, 172, 40, 0.55);
    }
  }

  function drawCloud(L, x, y, s) {
    const cl = new Layer(70, 24);
    const puffs = [[10, 15, 7], [20, 10, 9], [32, 8, 10], [44, 11, 8], [54, 15, 6], [30, 15, 8]];
    for (const [px, py, r] of puffs) cl.disc(px * s + 4, py * s + 4, r * s, C.cloud);
    const base = Math.round(18 * s + 4);
    cl.map((cx, cy, c) => (cy > base ? -1 : cy >= base - Math.max(1, Math.round(2 * s)) ? C.cloudShade : c));
    cl.drawOnto(L, x, y);
  }

  const TRAIL_VX = 182; // where the wagon ruts meet the horizon

  function drawMountains(L, seed) {
    // A range of sharp peaks, lit from the left, with a low pass where the trail leads.
    const rnd = mulberry32(seed * 3 + 1);
    const peaks = [];
    for (let x = -24; x < W + 30; x += 16 + rnd() * 26) {
      let h = 14 + rnd() * 24;
      const nearPass = Math.abs(x - TRAIL_VX) < 26;
      if (nearPass) h = 6 + rnd() * 6;
      peaks.push({ x, h, s: 0.75 + rnd() * 0.55 });
    }
    const jitter = mulberry32(seed * 5 + 9);
    const base = 82;
    for (let px = 0; px < W; px++) {
      let best = -Infinity, peak = null;
      for (const p of peaks) {
        const v = p.h - Math.abs(px - p.x) * p.s;
        if (v > best) { best = v; peak = p; }
      }
      const top = Math.round(base - best + (jitter() < 0.25 ? 1 : 0));
      const lit = px <= peak.x;
      const snowDepth = peak.h > 24 ? Math.round((peak.h - 20) * 0.45) : 0;
      const peakTop = base - peak.h;
      for (let y = Math.max(0, top); y < HORIZON; y++) {
        let c = lit ? C.mtnFar : C.mtnFarShade;
        const depth = y - peakTop;
        if (depth < snowDepth || (depth < snowDepth + 2 && bayer(px, y) > 0.5)) c = lit ? C.snow : bayer(px, y) > 0.5 ? C.snow : C.mtnFar;
        L.set(px, y, c);
      }
    }
    // Rolling foothills
    const ph = seed % 97;
    for (let x = 0; x < W; x++) {
      const top = Math.round(78 + 2.6 * Math.sin(x / 21 + ph) + 1.6 * Math.sin(x / 8.3 + ph * 2));
      for (let y = top; y < HORIZON; y++) {
        const c = y - top < 2 ? C.mtnNear : y > HORIZON - 4 && bayer(x, y) > 0.5 ? C.haze : C.mtnNearShade;
        L.set(x, y, c);
      }
    }
  }

  function drawGround(L, seed) {
    const rnd = mulberry32(seed ^ 0x9e37);
    for (let y = HORIZON; y < H; y++) {
      const t = (y - HORIZON) / (H - HORIZON);
      for (let x = 0; x < W; x++) {
        let c = C.grass1;
        if (t < 0.12) c = (t / 0.12) > bayer(x, y) ? C.grass1 : C.haze;
        else if (t < 0.22) c = ((t - 0.12) / 0.1) > bayer(x, y) ? C.grass1 : C.grass0;
        else if (t > 0.8) c = ((t - 0.8) / 0.2) * 0.7 > bayer(x, y) ? C.grass2 : C.grass1;
        const r = rnd();
        if (t > 0.1 && r < 0.05) c = C.grass2;
        else if (t > 0.1 && r < 0.075) c = C.grass0;
        L.set(x, y, c);
      }
    }
    // Wagon-wheel ruts converging on the horizon.
    const vx = TRAIL_VX;
    for (let y = HORIZON; y < H; y++) {
      const t = (y - HORIZON) / (H - HORIZON);
      const half = 0.6 + t * 1.9;
      for (const bx of [118, 160]) {
        const cx = vx + (bx - vx) * t + (bx < vx ? -1 : 1) * 1.5 * (1 - t);
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
          const edge = x === Math.round(cx - half);
          L.set(x, y, edge && t > 0.25 ? C.dirt2 : t < 0.2 ? C.dirt0 : C.dirt1);
        }
      }
    }
  }

  function tuftList(seed) {
    const rnd = mulberry32(seed ^ 0x77aa);
    const list = [];
    for (let i = 0; i < 46; i++) {
      const y = HORIZON + 6 + Math.floor(Math.pow(rnd(), 0.8) * (H - HORIZON - 8));
      list.push({ x: Math.floor(rnd() * W), y, phase: Math.floor(rnd() * 12), flower: rnd() < 0.22 ? Math.floor(rnd() * 3) : -1 });
    }
    return list;
  }

  function drawTufts(L, tufts, frame) {
    for (const t of tufts) {
      const size = 1 + Math.round(((t.y - HORIZON) / (H - HORIZON)) * 4);
      const sway = (Math.floor((frame + t.phase) / 6) % 2) * (size > 2 ? 1 : 0);
      for (const dx of [-2, 0, 2]) {
        const h = dx === 0 ? size + 1 : size;
        const lean = dx === 0 ? 0 : dx / 2;
        for (let i = 0; i < h; i++) {
          const tip = i === h - 1;
          const x = t.x + dx * (size > 2 ? 1 : 0.5) + (tip ? lean + sway : i > h / 2 ? lean : 0);
          L.set(x, t.y - i, tip ? C.grass0 : i === 0 ? C.grass4 : C.grass3);
        }
      }
      if (t.flower >= 0) {
        const fx = t.x + 3, fy = t.y - size - 1;
        const col = [C.flowerY, C.flowerW, C.flowerP][t.flower];
        L.set(fx, fy + 1, C.grass3);
        L.set(fx, fy, col);
        if (size > 2) { L.set(fx - 1, fy, col); L.set(fx + 1, fy, col); L.set(fx, fy - 1, col); }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Headstone
  // ---------------------------------------------------------------------------

  const STONE = { cx: 66, cy: 88, r: 46, bottom: 131, margin: 7 };

  /** Half-width of the stone face at row y (0 above the arch). */
  function stoneHalfWidth(y) {
    if (y >= STONE.cy) return STONE.r;
    const dy = STONE.cy - y;
    return dy > STONE.r ? 0 : Math.sqrt(STONE.r * STONE.r - dy * dy);
  }

  /** Usable text width for a band of rows [y0, y1]. */
  function textWidthBetween(y0, y1) {
    let hw = Infinity;
    for (let y = y0; y <= y1; y++) hw = Math.min(hw, stoneHalfWidth(y));
    return Math.max(0, Math.floor(2 * (hw - STONE.margin)));
  }

  function buildStone(seed, opts) {
    const L = new Layer(W, H);
    const { cx, cy, r, bottom } = STONE;
    const rnd = mulberry32(seed ^ 0x3c3c);
    // Body
    for (let y = cy - r; y < bottom; y++) {
      const hw = stoneHalfWidth(y);
      if (hw <= 0) continue;
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
      for (let x = x0; x <= x1; x++) {
        let c = C.stone1;
        const fromL = x - x0, fromR = x1 - x;
        if (fromR < 1) c = C.stone3;
        else if (fromR < 5) c = fromR < 3 || bayer(x, y) > 0.5 ? C.stone2 : C.stone1;
        else if (fromL < 3) c = C.stone0;
        else if (y < cy && y - (cy - Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)))) < 3 && x < cx + 14) c = C.stone0;
        const n = rnd();
        if (c === C.stone1 && n < 0.035) c = C.stone2;
        else if (c === C.stone1 && n < 0.05) c = C.stone0;
        L.set(x, y, c);
      }
    }
    // A crack running in from the right edge, clear of the lettering
    let kx = cx + r - 1, ky = cy - 12;
    const crack = mulberry32(seed ^ 0x1f1f);
    for (let i = 0; i < 15; i++) {
      L.set(kx, ky, C.stone3);
      L.set(kx - 1, ky + 1, C.stone0);
      ky += 1;
      if (kx > cx + r - 5 && crack() < 0.55) kx -= 1;
      else if (kx < cx + r - 1 && crack() < 0.25) kx += 1;
    }
    // Moss creeping up the bottom-left
    const moss = mulberry32(seed ^ 0x2d2d);
    for (let x = cx - r; x < cx - r + 30; x++) {
      const h = Math.floor(moss() * 6 + (30 - (x - (cx - r))) / 5);
      for (let y = bottom - 1; y > bottom - 1 - h; y--)
        if (L.get(x, y) >= 0 && moss() < 0.75) L.set(x, y, moss() < 0.5 ? C.moss0 : C.moss1);
    }
    L.outline(C.k);
    // Plinth
    const px0 = cx - r - 7, px1 = cx + r + 7;
    const plinth = new Layer(W, H);
    plinth.rect(px0, bottom, px1 - px0 + 1, 7, C.stone2);
    plinth.rect(px0, bottom, px1 - px0 + 1, 2, C.stone1);
    plinth.rect(px0, bottom, 2, 7, C.stone1);
    plinth.rect(px1 - 2, bottom, 3, 7, C.stone3);
    plinth.outline(C.k);
    plinth.drawOnto(L, 0, 0);
    // Grave mound in front
    const mound = new Layer(W, H);
    mound.ellipse(cx + 2, bottom + 13, r + 4, 8, C.dirt1, (x, y) => y >= bottom + 5);
    mound.map((x, y, c) => (y < bottom + 8 ? (bayer(x, y) > 0.4 ? C.dirt0 : C.dirt1) : y > bottom + 14 ? C.dirt2 : c));
    const mr = mulberry32(seed ^ 0x4b4b);
    mound.map((x, y, c) => (mr() < 0.06 ? C.dirt2 : mr() < 0.03 ? C.stone2 : c));
    mound.outline(C.k);
    mound.drawOnto(L, 0, 0);
    // Wildflowers laid on the mound
    if (opts.flowers !== false) {
      const fx = cx + 22, fy = bottom + 8;
      const bouquet = [
        ' y w ',
        'yYwWw',
        ' y.w ',
        '  g  ',
        ' g g ',
      ];
      L.sprite(bouquet, { y: C.flowerY, Y: C.flowerY, w: C.flowerW, W: C.flowerW, g: C.grass3, '.': C.grass2 }, fx, fy - 4);
      L.sprite(['p.p', '.g.'], { p: C.flowerP, g: C.grass3 }, cx - 30, bottom + 7);
    }
    return L;
  }

  /** Engrave text into the scene: dark cut with a light lower-right lip. */
  function engrave(L, mask) {
    for (let y = 0; y < mask.h; y++)
      for (let x = 0; x < mask.w; x++)
        if (mask.data[y * mask.w + x] >= 0 && mask.get(x + 1, y + 1) < 0) L.set(x + 1, y + 1, C.stone0);
    for (let y = 0; y < mask.h; y++)
      for (let x = 0; x < mask.w; x++) if (mask.data[y * mask.w + x] >= 0) L.set(x, y, C.stone3);
  }

  const CROSS = ['..#..', '.###.', '..#..', '..#..', '..#..', '..#..'];

  // ---------------------------------------------------------------------------
  // Subjects
  // ---------------------------------------------------------------------------

  /** X-shaped eye centred on (x, y). */
  function xEye(L, x, y, c) {
    L.set(x - 1, y - 1, c); L.set(x + 1, y - 1, c); L.set(x, y, c); L.set(x - 1, y + 1, c); L.set(x + 1, y + 1, c);
  }

  function buildTraveler() {
    // Sprawled on his back, seen from a little above: head left, boots right.
    const L = new Layer(100, 46);
    const cy = 23;
    // Hat, knocked off and lying brim-down above the head
    L.ellipse(9, 6, 7, 4.2, C.hat1);
    L.ellipse(9, 5, 4.2, 2.6, C.hat0);
    L.ellipse(9, 6.5, 4.4, 1, C.hatBand, (x, y) => y === 7);
    // Arms flung out (drawn first so the torso overlaps the shoulders)
    L.thickLine(33, cy - 6, 40, cy - 15, C.shirt1, 6);
    L.thickLine(40, cy - 15, 49, cy - 19, C.shirt1, 5);
    L.disc(52, cy - 20, 2.6, C.skin0);
    L.thickLine(33, cy + 7, 39, cy + 15, C.shirt1, 6);
    L.thickLine(39, cy + 15, 47, cy + 19, C.shirt1, 5);
    L.disc(50, cy + 20, 2.6, C.skin0);
    // Legs, splayed a little
    L.thickLine(54, cy - 4, 79, cy - 9, C.pants0, 8);
    L.thickLine(54, cy + 4, 79, cy + 9, C.pants0, 8);
    L.map((x, y, c) => (c === C.pants0 && (y === cy - 5 - Math.round((x - 54) / 5) || y > cy + 9 + Math.round((x - 54) / 5)) ? C.pants1 : c));
    L.rect(63, cy + 4, 5, 4, C.canvas1); // knee patch
    // Boots, toes to the sky
    for (const [bx, by] of [[83, cy - 10], [83, cy + 10]]) {
      L.ellipse(bx, by, 5, 4.6, C.boot);
      L.ellipse(bx - 1, by - 1, 2, 1.5, C.bootHi);
      L.set(bx + 5, by + 1, C.metal); L.set(bx + 6, by + 1, C.metal); // spur
    }
    // Torso: red flannel with suspenders and buttons
    L.rect(26, cy - 9, 29, 19, C.shirt0);
    L.set(26, cy - 9, -1); L.set(26, cy + 9, -1);
    L.map((x, y, c) => {
      if (c !== C.shirt0 || x < 26 || x > 54) return c;
      if ((x - 26) % 6 === 3 || (y - cy + 9) % 6 === 3) return C.shirt1;
      return c;
    });
    L.rect(26, cy - 6, 29, 2, C.hatBand); // suspenders
    L.rect(26, cy + 5, 29, 2, C.hatBand);
    for (let x = 30; x < 54; x += 6) L.set(x, cy, C.canvas0); // buttons
    // Belt
    L.rect(52, cy - 9, 3, 19, C.hatBand);
    L.rect(52, cy - 1, 3, 3, C.flowerY);
    // Neckerchief
    L.rect(22, cy - 6, 5, 13, C.pants0);
    L.poly([[26, cy - 3], [32, cy], [26, cy + 3]], C.pants0);
    // Head (crown to the left, chin to the right)
    const hx = 15;
    L.ellipse(hx, cy, 8, 8.5, C.skin0);
    L.map((x, y, c) => {
      if (c !== C.skin0 || x > hx + 9) return c;
      const dx = x - hx, dy = y - cy;
      if (dx < -3 || (dx < 0 && Math.abs(dy) > 6)) return C.hair;
      if (dx > 4 && Math.abs(dy) > 5) return C.skin1;
      return c;
    });
    L.disc(hx - 1, cy - 9, 1.6, C.skin1); // ears
    L.disc(hx - 1, cy + 9, 1.6, C.skin1);
    L.outline(C.k);
    // Face details after the outline
    xEye(L, hx + 1, cy - 4, C.k);
    xEye(L, hx + 1, cy + 4, C.k);
    L.set(hx + 4, cy, C.skin1); L.set(hx + 4, cy - 1, C.skin1); // nose
    L.rect(hx + 6, cy - 3, 1, 7, C.hair); // moustache
    L.rect(hx + 8, cy - 1, 1, 3, C.k); // open mouth
    L.set(hx + 9, cy + 1, C.tongue); L.set(hx + 10, cy + 1, C.tongue);
    L.set(hx + 10, cy + 2, C.k);
    return { layer: L, ground: 44, center: [38, cy] };
  }

  function buildHorse() {
    const L = new Layer(84, 44);
    const G = 43;
    // Tail, draped on the ground
    L.thickLine(64, 30, 72, 33, C.mane, 3);
    L.thickLine(72, 33, 77, 41, C.mane, 3);
    L.thickLine(70, 34, 81, 42, C.mane, 2);
    L.line(66, 30, 74, 34, C.horse2);
    // Legs (stiff, in the air) — drawn before the barrel so it overlaps them
    const legs = [
      { x: 33, lean: -4, top: 6 },
      { x: 39, lean: -2, top: 4 },
      { x: 53, lean: 2, top: 5 },
      { x: 59, lean: 4, top: 7 },
    ];
    legs.forEach((g, i) => {
      const x1 = g.x + g.lean;
      const col = i % 2 === 0 ? C.horse1 : C.horse0;
      if (i >= 2) L.ellipse(g.x - 1, 24, 4, 5, col); // thigh
      L.thickLine(g.x, 26, x1, g.top + 4, col, 3.2);
      L.thickLine(x1, g.top + 5, x1, g.top + 3, C.sock, 3.2);
      L.rect(Math.round(x1) - 2, g.top - 1, 4, 4, C.hoof);
    });
    // Barrel (on its back: belly up)
    const bx = 47, by = 32;
    L.ellipse(bx, by, 20, 9, C.horse0);
    L.map((x, y, c) => {
      if (Math.abs(x - bx) > 21 || Math.abs(y - by) > 10 || c !== C.horse0) return c;
      if (y < by - 4) return C.belly;
      if (y < by - 2) return bayer(x, y) > 0.5 ? C.belly : C.horse0;
      if (y > by + 5) return C.horse1;
      return c;
    });
    // Neck
    L.poly([[30, 26], [32, 39], [14, 41], [12, 33]], C.horse0);
    L.poly([[30, 34], [32, 40], [14, 42], [14, 38]], C.horse1);
    // Head, lying on its cheek, muzzle left
    L.ellipse(11, 35, 8, 5.5, C.horse0);
    L.ellipse(4, 37, 4.5, 3.6, C.horse1);
    L.poly([[12, 30], [15, 23], [18, 31]], C.horse0); // ear
    L.set(15, 27, C.horse2); L.set(15, 28, C.horse2);
    // Mane along the neck
    L.thickLine(29, 25, 14, 31, C.mane, 3);
    for (const [x, y] of [[26, 27], [22, 29], [18, 30]]) { L.set(x, y + 2, C.mane); L.set(x - 1, y + 3, C.mane); }
    // Blaze
    L.line(9, 31, 3, 35, C.sock);
    // Tongue flopped out on the ground
    L.ellipse(3, 42, 2.4, 1.3, C.tongue);
    L.outline(C.k);
    // X eye + nostril + mouth line
    const ex = 11, ey = 33;
    L.set(ex - 1, ey - 1, C.k); L.set(ex + 1, ey - 1, C.k); L.set(ex, ey, C.k); L.set(ex - 1, ey + 1, C.k); L.set(ex + 1, ey + 1, C.k);
    L.set(1, 36, C.k);
    L.line(2, 40, 7, 40, C.k);
    L.line(29, 33, 32, 37, C.horse2); // shoulder line
    return { layer: L, ground: G };
  }

  // The wagon lies upside down on its crushed bonnet, rear end (left) heaved up.
  const TILT = 0.17;
  const tiltY = (x, y) => y - (82 - x) * TILT;
  const WAGON = {
    w: 106, h: 66, ground: 65,
    wheels: [
      // The rear wheel came off: that's the one lying in the grass.
      { x: 31, y: tiltY(31, 33), r: 12, missing: true },
      { x: 70, y: tiltY(70, 34), r: 10, spin: true },
    ],
  };

  function buildWagon() {
    const L = new Layer(WAGON.w, WAGON.h);
    const G = WAGON.ground;
    const boxTop = 30, boxBot = 44;
    // Tongue (drawbar) jutting into the air from the front axle
    L.thickLine(80, tiltY(80, 36), 102, 16, C.wood2, 2.6);
    L.thickLine(80, tiltY(80, 35), 101, 15, C.wood1, 1);
    // Canvas bonnet squashed between the box and the ground
    const edge = (x) => tiltY(x, boxBot);
    L.poly([[15, edge(15)], [81, edge(81)], [88, G - 5], [84, G], [11, G], [8, G - 6]], C.canvas0);
    L.map((x, y, c) => {
      if (c !== C.canvas0) return c;
      const t = (y - edge(x)) / Math.max(1, G - edge(x));
      if ([27, 40, 53, 66].some((hx) => Math.abs(x - hx - t * 3) < 0.9)) return t > 0.85 ? C.canvas2 : C.canvas1; // hoops
      if (y > G - 3) return C.canvas2;
      if (t > 0.72) return bayer(x, y) > 0.45 ? C.canvas1 : C.canvas0;
      if (t < 0.12) return C.canvas1;
      return c;
    });
    // A tear in the canvas
    L.poly([[44, 52], [50, 51], [48, 58], [43, 56]], C.k);
    L.set(46, 54, C.wood2);
    // Wagon box (upside down, so its floor is on top)
    L.poly([[14, tiltY(14, boxTop)], [83, tiltY(83, boxTop)], [83, tiltY(83, boxBot)], [14, tiltY(14, boxBot)]], C.wood0);
    L.map((x, y, c) => {
      if (c !== C.wood0) return c;
      const ly = y - tiltY(x, boxTop); // row within the box
      if (ly < 1.5) return C.wood2; // floor seen edge-on
      if (Math.abs(ly - 5.5) < 0.6 || Math.abs(ly - 10) < 0.6) return C.wood1; // plank seams
      if (x === 14 || x === 82 || x === 48) return C.wood1; // posts
      if (ly > 12.5) return C.wood2;
      return c;
    });
    // Axle bolsters
    L.poly([[25, tiltY(25, 26)], [37, tiltY(37, 26)], [37, tiltY(37, 30)], [25, tiltY(25, 30)]], C.wood2);
    L.poly([[65, tiltY(65, 27)], [75, tiltY(75, 27)], [75, tiltY(75, 30)], [65, tiltY(65, 30)]], C.wood2);
    L.outline(C.k);
    return { layer: L, ground: G };
  }

  function drawWheel(L, cx, cy, r, angle, spokes) {
    const n = spokes || 10;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r + 0.5) continue;
        if (d > r - 0.5) { L.set(x, y, C.k); continue; }
        if (d > r - 1.5) { L.set(x, y, C.iron); continue; }
        if (d > r - 3.4) { L.set(x, y, dx + dy < -2 ? C.wood0 : C.wood1); continue; }
        if (d > r - 4.2) { L.set(x, y, C.k); continue; }
        if (d <= 2.6) { L.set(x, y, d <= 1.2 ? C.iron : d > 2 ? C.k : C.wood2); continue; }
        const a = Math.atan2(dy, dx) - angle;
        const step = (Math.PI * 2) / n;
        const off = ((a % step) + step) % step;
        const dist = Math.min(off, step - off) * d;
        if (dist < 0.75) L.set(x, y, C.wood0);
        else if (dist < 1.45) L.set(x, y, C.wood2);
      }
  }

  /** Bare axle end where a wheel broke off: hub plus a few snapped spokes. */
  function drawHub(L, cx, cy) {
    for (const [a, len] of [[-2.2, 6], [-0.6, 4], [0.9, 5], [2.6, 3]]) {
      const x1 = cx + Math.cos(a) * len, y1 = cy + Math.sin(a) * len;
      L.thickLine(cx, cy, x1, y1, C.k, 2.6);
    }
    for (const [a, len] of [[-2.2, 5], [-0.6, 3], [0.9, 4], [2.6, 2]]) {
      L.line(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, C.wood0);
    }
    L.disc(cx, cy, 3.4, C.k);
    L.disc(cx, cy, 2.5, C.wood2);
    L.disc(cx, cy, 1.1, C.iron);
  }

  /** The missing rear wheel, lying flat in the grass (seen at a low angle). */
  function drawLooseWheel(L, cx, cy) {
    const rx = 13, ry = 5.2;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x - cx) / (rx + 0.4), ny = (y - cy) / (ry + 0.4);
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d > 1) continue;
        if (d > 0.9) L.set(x, y, C.k);
        else if (d > 0.8) L.set(x, y, C.iron);
        else if (d > 0.58) L.set(x, y, y < cy ? C.wood1 : C.wood0);
        else if (d > 0.48) L.set(x, y, C.k);
      }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      L.line(cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 1, cx + Math.cos(a) * 6.6, cy + Math.sin(a) * 2.6, C.wood0);
    }
    L.ellipse(cx, cy, 3, 1.6, C.k);
    L.ellipse(cx, cy, 1.8, 0.6, C.wood2);
  }

  function drawCargo(L, x, y, crateX, crateY) {
    // barrel on its side
    const b = new Layer(16, 12);
    b.ellipse(7, 5.5, 7, 5, C.wood1);
    b.map((px, py, c) => (py < 3 ? C.wood0 : py > 8 ? C.wood2 : c));
    b.line(3, 1, 3, 10, C.iron);
    b.line(11, 1, 11, 10, C.iron);
    b.outline(C.k);
    b.ellipse(13, 5.5, 2.4, 4.4, C.wood2);
    b.set(13, 5, C.k);
    b.drawOnto(L, x, y);
    // crate
    const cr = new Layer(14, 12);
    cr.rect(1, 1, 11, 9, C.wood0);
    cr.line(1, 1, 11, 9, C.wood1);
    cr.line(1, 9, 11, 1, C.wood1);
    cr.rect(1, 1, 11, 1, C.wood1);
    cr.outline(C.k);
    cr.drawOnto(L, crateX, crateY);
  }

  /** Soft dithered shadow on the grass. */
  function drawShadow(L, cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d <= 1 && bayer(x, y) < 0.55 - d * 0.25) L.set(x, y, C.grass3);
      }
  }

  // Small animated critters --------------------------------------------------

  const BUZZARD = [
    ['b.........b', 'Bb.......bB', '.bbb.h.bbb.', '....bbb....'],
    ['...........', '....bhb....', '.bbbbbbbbb.', 'bB.......Bb'],
  ];

  function drawBuzzards(L, frame, total) {
    const birds = [
      { cx: 150, cy: 26, rx: 34, ry: 9, phase: 0 },
      { cx: 112, cy: 16, rx: 22, ry: 6, phase: Math.PI },
    ];
    for (const b of birds) {
      const a = (frame / total) * Math.PI * 2 + b.phase;
      const x = Math.round(b.cx + Math.cos(a) * b.rx);
      const y = Math.round(b.cy + Math.sin(a) * b.ry);
      const wing = Math.floor((frame + (b.phase ? 3 : 0)) / 3) % 2;
      L.sprite(BUZZARD[wing], { b: C.buzz0, B: C.buzz1, h: C.buzzHead }, x - 5, y - 2);
    }
  }

  function drawFlies(L, frame, total, ox, oy) {
    const flies = [
      { cx: 10, cy: 26, rx: 9, ry: 6, kx: 2, ky: 3, p: 0 },
      { cx: 46, cy: 14, rx: 12, ry: 5, kx: 1, ky: 2, p: 1.7 },
      { cx: 30, cy: 20, rx: 7, ry: 8, kx: 3, ky: 2, p: 3.1 },
    ];
    for (const f of flies) {
      const t = (frame / total) * Math.PI * 2;
      const x = Math.round(ox + f.cx + Math.sin(t * f.kx + f.p) * f.rx);
      const y = Math.round(oy + f.cy + Math.sin(t * f.ky + f.p * 2) * f.ry);
      L.set(x, y, C.fly);
      L.set(x + (frame % 2 ? 1 : -1), y - 1, C.flyWing);
    }
  }

  const GHOST_BODY = [
    '....ggggg....',
    '..ggwwwwwgg..',
    '.gwwwwwwwwWg.',
    'gwwwwwwwwwwWg',
    'gwweewwweewWg',
    'gwweewwweewWg',
    'gwwwwwwwwwwWg',
    'gwwwwweewwwWg',
    'gwwwwweewwwWg',
    'gwwwwwwwwwWWg',
    'gwwwwwwwwwWWg',
    'gwwwwwwwwWWWg',
  ];
  const GHOST = [
    [...GHOST_BODY, 'gwwg.gwwg.gWg', '.gg...gg...g.'],
    [...GHOST_BODY, 'gw.gwwg.gwwWg', 'g...gg...gg..'],
  ];

  function drawSpirit(L, frame, total, x0, y0) {
    const t = frame / total;
    const y = Math.round(y0 - t * 60);
    const x = Math.round(x0 + Math.sin(t * Math.PI * 4) * 3);
    let alpha = 1;
    if (t < 0.15) alpha = 0.25 + (t / 0.15) * 0.75;
    else if (t > 0.7) alpha = Math.max(0, 1 - (t - 0.7) / 0.3);
    if (alpha <= 0.05) return;
    const g = new Layer(13, 14);
    g.sprite(GHOST[Math.floor(frame / 3) % 2], { g: C.ghost1, w: C.ghost0, W: C.ghost1, e: C.ghostEye }, 0, 0);
    g.drawOnto(L, x - 6, y - 13, alpha);
  }

  return {
    W, H, HORIZON, C, NAMES, SKY_SETS, STONE, CROSS, WAGON,
    Layer, mulberry32, bayer, buildPalette, monoLevels, GREEN_SCREEN, drawHub,
    drawSky, drawMountains, drawGround, tuftList, drawTufts,
    buildStone, stoneHalfWidth, textWidthBetween, engrave,
    buildTraveler, buildHorse, buildWagon, drawWheel, drawLooseWheel, drawCargo, drawShadow,
    drawBuzzards, drawFlies, drawSpirit,
  };
});
