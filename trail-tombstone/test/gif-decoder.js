/*
 * Minimal GIF decoder used only by the tests, to check the encoder's output
 * independently. Returns fully composited frames as palette indices.
 */
'use strict';

function decodeGif(bytes) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => bytes[p++] | (bytes[p++] << 8);
  const ascii = (n) => String.fromCharCode(...bytes.subarray(p, (p += n)));

  const sig = ascii(6);
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('bad signature ' + sig);
  const width = u16();
  const height = u16();
  const packed = u8();
  u8(); // background
  u8(); // aspect
  let palette = [];
  if (packed & 0x80) {
    const n = 1 << ((packed & 7) + 1);
    for (let i = 0; i < n; i++) palette.push([u8(), u8(), u8()]);
  }

  const canvas = new Uint8Array(width * height);
  const frames = [];
  let gce = null;
  let loops = null;

  for (;;) {
    const block = u8();
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        u8();
        const f = u8();
        gce = { disposal: (f >> 2) & 7, transparent: f & 1 ? true : false, delay: u16(), transIndex: u8() };
        u8();
      } else if (label === 0xff) {
        const len = u8();
        const id = ascii(len);
        for (let size = u8(); size; size = u8()) {
          if (id === 'NETSCAPE2.0' && size === 3) {
            u8();
            loops = u16();
          } else p += size;
        }
      } else {
        for (let size = u8(); size; size = u8()) p += size;
      }
      continue;
    }
    if (block !== 0x2c) throw new Error('unexpected block 0x' + block.toString(16) + ' at ' + (p - 1));
    const x = u16(), y = u16(), w = u16(), h = u16();
    const ipacked = u8();
    if (ipacked & 0x80) throw new Error('local color tables not expected');
    if (ipacked & 0x40) throw new Error('interlace not expected');
    const minCode = u8();
    const data = [];
    for (let size = u8(); size; size = u8()) {
      for (let i = 0; i < size; i++) data.push(bytes[p + i]);
      p += size;
    }
    const pixels = lzwDecode(Uint8Array.from(data), minCode, w * h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const v = pixels[yy * w + xx];
        if (gce && gce.transparent && v === gce.transIndex) continue;
        canvas[(y + yy) * width + (x + xx)] = v;
      }
    frames.push({ data: canvas.slice(), delay: gce ? gce.delay : 0, rect: { x, y, w, h } });
    gce = null;
  }
  return { width, height, palette, frames, loops, trailerAt: p };
}

function lzwDecode(data, minCode, count) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[eoi] = null;
    size = minCode + 1;
  };
  reset();
  const out = [];
  let bit = 0;
  let prev = null;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++) {
      const byte = data[(bit + i) >> 3];
      if (byte === undefined) return -1;
      code |= ((byte >> ((bit + i) & 7)) & 1) << i;
    }
    bit += size;
    return code;
  };
  for (;;) {
    const code = read();
    if (code < 0) throw new Error('ran out of LZW data');
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (code === dict.length && prev) entry = prev.concat(prev[0]);
    else throw new Error('bad LZW code ' + code);
    for (const v of entry) out.push(v);
    if (prev && dict.length < 4096) dict.push(prev.concat(entry[0]));
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
  }
  if (out.length !== count) throw new Error(`decoded ${out.length} pixels, expected ${count}`);
  return out;
}

module.exports = { decodeGif };
