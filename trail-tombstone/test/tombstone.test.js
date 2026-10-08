'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { encodeGif } = require('../src/gif');
const font = require('../src/font');
const TT = require('../src/scene');
const { decodeGif } = require('./gif-decoder');

function upscale(frame, w, h, s) {
  const out = new Uint8Array(w * s * h * s);
  for (let y = 0; y < h * s; y++)
    for (let x = 0; x < w * s; x++) out[y * w * s + x] = frame[Math.floor(y / s) * w + Math.floor(x / s)];
  return out;
}

test('encoder round-trips random noise through LZW (forces dictionary resets)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const w = 97, h = 61;
  const palette = Array.from({ length: 40 }, (_, i) => [i * 6, 255 - i * 6, (i * 37) % 256]);
  const frames = [0, 1, 2].map(() => Uint8Array.from({ length: w * h }, () => Math.floor(rnd() * 40)));
  const bytes = encodeGif({ width: w, height: h, frames, palette, delay: 5 });
  const gif = decodeGif(bytes);
  assert.equal(gif.width, w);
  assert.equal(gif.height, h);
  assert.equal(gif.frames.length, 3);
  gif.frames.forEach((f, i) => assert.deepEqual(f.data, frames[i]));
  assert.equal(gif.loops, 0, 'loops forever');
  assert.equal(gif.trailerAt, bytes.length, 'trailer is the last byte');
});

test('identical consecutive frames are merged and their delays summed', () => {
  const a = new Uint8Array(16).fill(1);
  const b = new Uint8Array(16).fill(2);
  const bytes = encodeGif({ width: 4, height: 4, frames: [a, a, a, b], palette: [[0, 0, 0], [255, 0, 0], [0, 0, 255]], delay: 10 });
  const gif = decodeGif(bytes);
  assert.equal(gif.frames.length, 2);
  assert.equal(gif.frames[0].delay, 30);
  assert.equal(gif.frames[1].delay, 10);
});

for (const subject of Object.keys(TT.SUBJECTS)) {
  test(`${subject}: every decoded GIF frame matches the rendered frame pixel for pixel`, () => {
    const scale = 2;
    const r = TT.renderFrames({ subject, sky: 'night', typewriter: true });
    const { bytes } = TT.renderGif({ subject, sky: 'night', typewriter: true, scale });
    const gif = decodeGif(bytes);
    assert.equal(gif.width, TT.W * scale);
    assert.equal(gif.height, TT.H * scale);
    // Expand merged frames back out by delay so the timelines line up.
    const timeline = [];
    for (const f of gif.frames) for (let d = 0; d < Math.round(f.delay / r.delays[0]); d++) timeline.push(f);
    assert.equal(timeline.length, r.frames.length);
    r.frames.forEach((frame, i) => {
      assert.deepEqual(timeline[i].data, upscale(frame, TT.W, TT.H, scale), `frame ${i}`);
    });
    // after the first frame, only changed rectangles are stored
    assert.ok(gif.frames.slice(1).every((f) => f.rect.w * f.rect.h < gif.width * gif.height));
  });
}

test('all printable ASCII has a 5x7 glyph', () => {
  const mask = { w: 6, h: 7, data: new Int16Array(42) };
  for (let c = 32; c < 127; c++) {
    mask.data.fill(-1);
    font.drawText(mask, String.fromCharCode(c), 0, 0, 1, 1);
    if (c !== 32) assert.ok(mask.data.some((v) => v === 1), `glyph for ${JSON.stringify(String.fromCharCode(c))}`);
  }
});

test('word wrap honours per-line widths and hard-breaks long words', () => {
  const lines = font.wrap('one two three four', () => 6 * 9 - 1, 1);
  assert.deepEqual(lines, ['one two', 'three', 'four']);
  const long = font.wrap('supercalifragilistic', () => 6 * 5 - 1, 1);
  assert.deepEqual(long, ['super', 'calif', 'ragil', 'istic']);
  assert.deepEqual(font.wrap('a\n\nb', () => 100, 1), ['a', '', 'b']);
});

test('a short epitaph fits; a very long one is flagged as overflowing', () => {
  const short = TT.renderFrames({ epitaph: 'Ate the questionable berries.', maxFrames: 1 });
  assert.equal(short.info.overflow, false);
  const long = TT.renderFrames({ epitaph: 'word '.repeat(80), maxFrames: 1 });
  assert.equal(long.info.overflow, true);
});

test('typewriter mode lengthens the animation in whole loops', () => {
  const plain = TT.renderFrames({});
  const typed = TT.renderFrames({ typewriter: true, epitaph: 'Forded the river. The river won.' });
  assert.equal(plain.frames.length, 24);
  assert.ok(typed.frames.length > 24 && typed.frames.length % 24 === 0);
});

test('rendering is deterministic for a given seed', () => {
  const a = TT.renderGif({ subject: 'horse', seed: 99 }).bytes;
  const b = TT.renderGif({ subject: 'horse', seed: 99 }).bytes;
  const c = TT.renderGif({ subject: 'horse', seed: 100 }).bytes;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('CLI writes a GIF', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')), 'cli.gif');
  const cli = path.join(__dirname, '..', 'cli.js');
  execFileSync(process.execPath, [cli, '--subject', 'wagon', '--name', 'Betsy', '--scale', '1', '-o', out]);
  const gif = decodeGif(fs.readFileSync(out));
  assert.equal(gif.width, TT.W);
  assert.equal(gif.frames.length > 1, true);
});

test('CLI rejects unknown subjects', () => {
  const cli = path.join(__dirname, '..', 'cli.js');
  assert.throws(() => execFileSync(process.execPath, [cli, '--subject', 'ox'], { stdio: 'pipe' }));
});
