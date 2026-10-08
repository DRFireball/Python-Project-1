/*
 * scene.js — public API. Lays out the epitaph on the headstone, composes
 * each animation frame and hands the frames to the GIF encoder.
 *
 *   const TT = require('./src/scene');           // Node
 *   const TT = globalThis.TrailTombstone.scene;  // browser
 *
 *   const result = TT.renderFrames({ subject: 'horse', name: 'Biscuit' });
 *   const bytes  = TT.renderGif({ subject: 'wagon', scale: 3 });
 */
(function (factory) {
  const dep = (name) =>
    typeof module === 'object' && module.exports ? require('./' + name) : globalThis.TrailTombstone[name];
  const api = factory(dep('art'), dep('font'), dep('gif'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.TrailTombstone.scene = api;
})(function (art, font, gif) {
  'use strict';

  const { W, H, C, Layer } = art;

  const SUBJECTS = {
    traveler: { label: 'Fallen traveler' },
    horse: { label: 'Dead horse' },
    wagon: { label: 'Tipped-over wagon' },
  };
  const SKIES = { day: 'Midday', dusk: 'Sundown', night: 'Moonlight' };

  // Starting text for each subject (used when no name/epitaph is given).
  const PRESETS = {
    traveler: { name: 'HANK', epitaph: 'Ate the questionable berries.' },
    horse: { name: 'DUSTY', epitaph: 'Good horse. Bad at rivers.' },
    wagon: { name: 'BETSY', epitaph: 'Axle snapped. Spirit unbroken.' },
  };

  // Fuel for the "random epitaph" button.
  const EPITAPHS = {
    traveler: [
      'Ate the questionable berries.',
      'Forded the river. The river won.',
      'Said "I know a shortcut."',
      'Tried to pet the rattlesnake.',
      'Drank from the wrong creek.',
      'Traded his boots for a ham. Regretted it.',
      'Died as he lived: lost.',
      'Went to find water. Found it.',
      'Should have caulked the wagon.',
      'Mistook the bear for a large dog.',
      'Out of food, out of luck, out of here.',
      'Bet his oxen on a card game.',
    ],
    horse: [
      'Good horse. Bad at rivers.',
      'Carried us 900 miles. We carried him 2.',
      'Never complained. Bit everyone though.',
      'Ate the oats. And the sack.',
      'Finally got to sit down.',
      'Gone to the big pasture.',
      'Spooked by a tumbleweed. Fatally.',
      'Kicked the bucket. Literally.',
    ],
    wagon: [
      'Axle snapped. Spirit unbroken.',
      'Hit one rock too many.',
      'Took the hill at full speed.',
      'Rest in pieces.',
      'Lost a wheel. Then lost the rest.',
      'Too much bacon in the back.',
      'Overloaded, overturned, over it.',
      'Survived 3 rivers. Not the 4th.',
    ],
  };

  const DEFAULTS = {
    subject: 'traveler',
    sky: 'dusk',
    header: 'HERE LIES',
    caption: 'Press SPACE to pay respects',
    cross: true,
    flowers: true,
    buzzards: true,
    critters: true, // flies on the horse, ghost for the traveler, spinning wheel on the wagon
    typewriter: false,
    seed: 1848,
    delay: 9, // hundredths of a second per frame
    scale: 3,
  };

  const LOOP = 24; // ambient animation loop length (frames)

  function withDefaults(opts) {
    const o = Object.assign({}, DEFAULTS);
    for (const [k, v] of Object.entries(opts || {})) if (v !== undefined) o[k] = v;
    if (!SUBJECTS[o.subject]) o.subject = DEFAULTS.subject;
    if (!SKIES[o.sky]) o.sky = DEFAULTS.sky;
    if (o.name === undefined) o.name = PRESETS[o.subject].name;
    if (o.epitaph === undefined) o.epitaph = PRESETS[o.subject].epitaph;
    o.seed = (Number(o.seed) || 0) >>> 0;
    o.scale = Math.max(1, Math.min(8, Math.round(Number(o.scale) || DEFAULTS.scale)));
    o.delay = Math.max(2, Math.min(100, Math.round(Number(o.delay) || DEFAULTS.delay)));
    return o;
  }

  // ---------------------------------------------------------------------------
  // Headstone text layout
  // ---------------------------------------------------------------------------

  const TOP = 46; // first usable row on the stone face
  const BOTTOM = 128; // last usable row

  /** Lay the carving out from row `top`. Returns positioned items. */
  function layoutFrom(top, o) {
    const items = [];
    let y = top;
    let overflow = false;
    const fits = (h) => y + h - 1 <= BOTTOM;

    if (o.cross) {
      items.push({ kind: 'cross', y, h: art.CROSS.length });
      y += art.CROSS.length + 4;
    }
    const header = font.normalize(o.header || '').trim();
    if (header) {
      const lines = font.wrap(header, () => art.textWidthBetween(y, y + 6), 1).slice(0, 2);
      for (const line of lines) {
        items.push({ kind: 'text', text: line, y, scale: 1 });
        y += font.LINE_H;
      }
      y += 2;
    }
    const name = font.normalize(o.name || '').trim();
    if (name) {
      if (font.measure(name, 2) <= art.textWidthBetween(y, y + 13) && fits(14)) {
        items.push({ kind: 'text', text: name, y, scale: 2 });
        y += 14 + 5;
      } else {
        const lines = font.wrap(name, (i) => art.textWidthBetween(y + i * font.LINE_H, y + i * font.LINE_H + 6), 1);
        for (const line of lines) {
          items.push({ kind: 'text', text: line, y, scale: 1 });
          y += font.LINE_H;
        }
        y += 4;
      }
    }
    const epitaph = font.normalize(o.epitaph || '').trim();
    let epitaphChars = 0;
    if (epitaph) {
      const startY = y;
      const lines = font.wrap(epitaph, (i) => art.textWidthBetween(startY + i * font.LINE_H, startY + i * font.LINE_H + 6), 1);
      for (let i = 0; i < lines.length; i++) {
        if (!fits(7)) {
          overflow = true;
          const last = items[items.length - 1];
          if (last && last.kind === 'text' && last.epitaph) {
            const chars = Array.from(last.text);
            const room = Math.floor((art.textWidthBetween(last.y, last.y + 6) + 1) / font.ADVANCE);
            last.text = chars.slice(0, Math.max(0, Math.min(chars.length, room - 3))).join('') + '...';
          }
          break;
        }
        items.push({ kind: 'text', text: lines[i], y, scale: 1, epitaph: true });
        epitaphChars += Array.from(lines[i]).length;
        y += font.LINE_H;
      }
    }
    const used = items.length ? items[items.length - 1].y + (items[items.length - 1].scale === 2 ? 14 : 7) - 1 : top;
    return { items, used, overflow, epitaphChars };
  }

  function layoutStone(o) {
    let lay = layoutFrom(TOP, o);
    // Centre the carving vertically when there is room to spare.
    const spare = BOTTOM - lay.used;
    if (!lay.overflow && spare > 1) {
      const shifted = layoutFrom(TOP + Math.floor(spare / 2), o);
      if (!shifted.overflow) lay = shifted;
    }
    return lay;
  }

  function carve(L, lay, reveal) {
    const mask = new Layer(W, H);
    let budget = reveal == null ? Infinity : reveal;
    for (const it of lay.items) {
      if (it.kind === 'cross') {
        mask.sprite(art.CROSS, { '#': 1 }, art.STONE.cx - 2, it.y);
        continue;
      }
      let text = it.text;
      if (it.epitaph) {
        const chars = Array.from(text);
        if (budget <= 0) continue;
        if (chars.length > budget) text = chars.slice(0, budget).join('');
        budget -= chars.length;
      }
      const x = Math.round(art.STONE.cx - font.measure(it.text, it.scale) / 2);
      font.drawText(mask, text, x, it.y, 1, it.scale);
    }
    art.engrave(L, mask);
  }

  // ---------------------------------------------------------------------------
  // Caption bar
  // ---------------------------------------------------------------------------

  function layoutCaption(text) {
    const t = font.normalize(text || '').trim();
    if (!t) return null;
    let lines = font.wrap(t, () => W - 12, 1);
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      const chars = Array.from(lines[1]);
      lines[1] = chars.slice(0, Math.min(chars.length, 35)).join('') + '...';
    }
    const h = 8 + lines.length * font.LINE_H - 2;
    return { lines, h, y: H - h };
  }

  function drawCaption(L, cap, frame, reveal) {
    L.rect(0, cap.y, W, cap.h, C.capBg);
    L.rect(0, cap.y, W, 1, C.capDim);
    let budget = reveal == null ? Infinity : reveal;
    let cursorAt = null;
    cap.lines.forEach((line, i) => {
      const chars = Array.from(line);
      const shown = Math.max(0, Math.min(chars.length, budget));
      budget -= chars.length;
      const x = Math.round(W / 2 - font.measure(line, 1) / 2);
      const y = cap.y + 4 + i * font.LINE_H;
      font.drawText(L, chars.slice(0, shown).join(''), x, y, C.capFg, 1);
      if (shown < chars.length && cursorAt == null) cursorAt = { x: x + shown * font.ADVANCE, y };
      if (i === cap.lines.length - 1 && cursorAt == null) cursorAt = { x: x + chars.length * font.ADVANCE + 1, y };
    });
    if (cursorAt && cursorAt.x + 5 < W && Math.floor(frame / 6) % 2 === 0) L.rect(cursorAt.x, cursorAt.y, 5, 7, C.cursor);
  }

  // ---------------------------------------------------------------------------
  // Frames
  // ---------------------------------------------------------------------------

  const cache = new Map();
  function cached(key, make) {
    if (!cache.has(key)) {
      if (cache.size > 24) cache.clear();
      cache.set(key, make());
    }
    return cache.get(key);
  }

  function subjectPlacement(subject) {
    if (subject === 'traveler') return { x: 130, groundY: 140, shadow: [52, 27, 48, 17] };
    if (subject === 'horse') return { x: 142, groundY: 136, shadow: [42, 40, 40, 5] };
    return { x: 124, groundY: 137, shadow: [50, 62, 46, 4] };
  }

  /**
   * Render every frame as palette indices.
   * @returns {{width:number,height:number,frames:Uint8Array[],delays:number[],palette:number[][],info:object}}
   */
  function renderFrames(options) {
    const o = withDefaults(options);
    const palette = art.buildPalette(o.sky);
    const tufts = art.tuftList(o.seed);
    const stone = cached('stone:' + o.seed + ':' + o.flowers, () => art.buildStone(o.seed, o));
    const lay = layoutStone(o);
    const cap = layoutCaption(o.caption);
    const capChars = cap ? cap.lines.reduce((n, l) => n + Array.from(l).length, 0) : 0;

    let subject;
    if (o.subject === 'traveler') subject = cached('traveler', art.buildTraveler);
    else if (o.subject === 'horse') subject = cached('horse', art.buildHorse);
    else subject = cached('wagon', art.buildWagon);
    const place = subjectPlacement(o.subject);
    const sx = place.x;
    const sy = place.groundY - subject.ground;

    // Frame count: one ambient loop, or long enough to type everything out.
    let total = LOOP;
    const charsPerFrame = 2;
    let typeFrames = 0;
    if (o.typewriter) {
      typeFrames = Math.ceil((lay.epitaphChars + capChars) / charsPerFrame) + 2;
      total = Math.ceil((typeFrames + 22) / LOOP) * LOOP;
    }

    // Backdrop is static except at night, when the stars twinkle.
    const makeBackdrop = (frame) => {
      const B = new Layer(W, H, C.sky0);
      art.drawSky(B, o.sky, frame, o.seed);
      art.drawMountains(B, o.seed);
      art.drawGround(B, o.seed);
      return B;
    };
    const staticBackdrop = o.sky === 'night' ? null : makeBackdrop(0);

    if (options && options.maxFrames) total = Math.min(total, Math.max(1, options.maxFrames | 0));
    const frames = [];
    for (let f = 0; f < total; f++) {
      const loopF = f % LOOP;
      const L = staticBackdrop ? staticBackdrop.clone() : makeBackdrop(loopF);
      art.drawTufts(L, tufts, loopF);
      if (o.buzzards) art.drawBuzzards(L, loopF, LOOP);
      stone.drawOnto(L, 0, 0);

      // Typewriter reveal
      let revealEpitaph = null, revealCaption = null;
      if (o.typewriter) {
        const shown = Math.max(0, (f - 2) * charsPerFrame);
        revealEpitaph = Math.min(lay.epitaphChars, shown);
        revealCaption = Math.max(0, shown - lay.epitaphChars);
      }
      carve(L, lay, revealEpitaph);

      const [shx, shy, shrx, shry] = place.shadow;
      art.drawShadow(L, sx + shx, sy + shy, shrx, shry);
      if (o.subject === 'wagon') {
        art.drawLooseWheel(L, sx + 4, place.groundY + 5);
        subject.layer.drawOnto(L, sx, sy);
        art.drawCargo(L, sx - 4, place.groundY - 10, sx + 90, place.groundY - 11);
        for (const w of art.WAGON.wheels) {
          const angle = w.spin && o.critters ? (loopF / LOOP) * ((Math.PI * 2) / 10) * 2 : 0.15;
          art.drawWheel(L, sx + w.x, sy + w.y, w.r, angle, 10);
        }
      } else {
        subject.layer.drawOnto(L, sx, sy);
      }
      if (o.critters && o.subject === 'horse') art.drawFlies(L, loopF, LOOP, sx, sy);
      if (o.critters && o.subject === 'traveler') art.drawSpirit(L, loopF, LOOP, sx + subject.center[0], sy + subject.center[1]);

      if (cap) drawCaption(L, cap, f, revealCaption);

      const out = new Uint8Array(W * H);
      for (let i = 0; i < out.length; i++) out[i] = L.data[i] < 0 ? C.k : L.data[i];
      frames.push(out);
    }

    // Hold the final typed-out frame a little longer.
    const delays = frames.map(() => o.delay);
    return {
      width: W,
      height: H,
      frames,
      delays,
      palette,
      info: {
        overflow: lay.overflow,
        frames: total,
        durationMs: delays.reduce((a, b) => a + b, 0) * 10,
      },
    };
  }

  function renderGif(options) {
    const o = withDefaults(options);
    const r = renderFrames(o);
    const bytes = gif.encodeGif({ width: r.width, height: r.height, frames: r.frames, palette: r.palette, delay: r.delays, scale: o.scale });
    return { bytes, info: r.info, width: r.width * o.scale, height: r.height * o.scale };
  }

  return { renderFrames, renderGif, layoutStone, withDefaults, DEFAULTS, PRESETS, EPITAPHS, SUBJECTS, SKIES, W, H };
});
