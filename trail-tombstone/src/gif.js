/*
 * gif.js — a small, dependency-free GIF89a encoder.
 *
 * Works on indexed frames (one palette index per pixel), which is exactly what
 * the pixel-art renderer produces, so no color quantization is needed.
 *
 * Features:
 *   - global color table (up to 256 colors)
 *   - infinite looping (NETSCAPE2.0 extension)
 *   - nearest-neighbour upscaling at encode time (crisp pixels)
 *   - frame differencing: after the first frame only the changed rectangle is
 *     written, and unchanged pixels inside it become transparent
 *   - identical consecutive frames are merged by adding their delays
 *
 * The LZW compressor mirrors giflib's EGifCompressLine so any GIF decoder can
 * read the output.
 */
(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (globalThis.TrailTombstone = globalThis.TrailTombstone || {}).gif = factory();
})(function () {
  'use strict';

  /** Growable byte buffer. */
  class ByteWriter {
    constructor(size) {
      this.buf = new Uint8Array(size || 1 << 16);
      this.len = 0;
    }
    ensure(n) {
      if (this.len + n <= this.buf.length) return;
      let cap = this.buf.length * 2;
      while (cap < this.len + n) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    byte(b) {
      this.ensure(1);
      this.buf[this.len++] = b & 0xff;
    }
    u16(v) {
      this.byte(v & 0xff);
      this.byte((v >> 8) & 0xff);
    }
    bytes(arr) {
      this.ensure(arr.length);
      this.buf.set(arr, this.len);
      this.len += arr.length;
    }
    ascii(s) {
      for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
    }
    result() {
      return this.buf.slice(0, this.len);
    }
  }

  const MAX_CODE = 4095;

  /**
   * LZW-compress an array of palette indices and write it as GIF image data
   * (min-code-size byte, sub-blocks, block terminator).
   */
  function writeLzw(out, pixels, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let runningCode = eoiCode + 1;
    let runningBits = minCodeSize + 1;
    let maxCode1 = 1 << runningBits;

    // Dictionary: key = (prefixCode << minCodeSize) | pixel. A generation
    // stamp in the high bits avoids clearing the table on every reset.
    const table = new Int32Array(4096 << minCodeSize);
    let gen = 1;

    // Bit packer feeding 255-byte sub-blocks.
    const block = new Uint8Array(255);
    let blockLen = 0;
    let bitBuf = 0;
    let bitCount = 0;

    out.byte(minCodeSize);

    function flushBlock() {
      if (blockLen === 0) return;
      out.byte(blockLen);
      out.bytes(block.subarray(0, blockLen));
      blockLen = 0;
    }
    function pushByte(b) {
      block[blockLen++] = b;
      if (blockLen === 255) flushBlock();
    }
    function output(code) {
      bitBuf |= code << bitCount;
      bitCount += runningBits;
      while (bitCount >= 8) {
        pushByte(bitBuf & 0xff);
        bitBuf >>>= 8;
        bitCount -= 8;
      }
      if (runningCode >= maxCode1 && code <= MAX_CODE) {
        runningBits++;
        maxCode1 = 1 << runningBits;
      }
    }

    output(clearCode);
    let current = pixels[0];
    for (let i = 1; i < pixels.length; i++) {
      const px = pixels[i];
      const key = (current << minCodeSize) | px;
      const entry = table[key];
      if (entry >>> 12 === gen) {
        current = entry & 0xfff;
        continue;
      }
      output(current);
      current = px;
      if (runningCode >= MAX_CODE) {
        output(clearCode);
        runningCode = eoiCode + 1;
        runningBits = minCodeSize + 1;
        maxCode1 = 1 << runningBits;
        gen++;
      } else {
        table[key] = (gen << 12) | runningCode++;
      }
    }
    output(current);
    output(eoiCode);
    if (bitCount > 0) pushByte(bitBuf & 0xff);
    flushBlock();
    out.byte(0); // block terminator
  }

  /** Copy a rectangle of a logical frame into an upscaled index buffer. */
  function scaleRect(src, srcW, x0, y0, w, h, scale, transparentMask, transIndex) {
    const outW = w * scale;
    const outH = h * scale;
    const out = new Uint8Array(outW * outH);
    for (let y = 0; y < h; y++) {
      const row = new Uint8Array(outW);
      for (let x = 0; x < w; x++) {
        const si = (y0 + y) * srcW + (x0 + x);
        const v = transparentMask && transparentMask[si] ? transIndex : src[si];
        row.fill(v, x * scale, x * scale + scale);
      }
      for (let r = 0; r < scale; r++) out.set(row, (y * scale + r) * outW);
    }
    return out;
  }

  /**
   * Encode an animated GIF.
   *
   * @param {object} opts
   * @param {number} opts.width   logical width (pixels per frame row)
   * @param {number} opts.height  logical height
   * @param {Array<Uint8Array>} opts.frames  palette index per logical pixel
   * @param {Array<[number,number,number]>} opts.palette  RGB triples (<= 255 colors)
   * @param {number|number[]} [opts.delay=10]  delay per frame in 1/100 s
   * @param {number} [opts.scale=1]  integer upscale factor
   * @param {number} [opts.loop=0]   0 = loop forever
   * @returns {Uint8Array} GIF file bytes
   */
  function encodeGif(opts) {
    const { width, height, frames, palette } = opts;
    const scale = Math.max(1, Math.floor(opts.scale || 1));
    const loop = opts.loop == null ? 0 : opts.loop;
    const delays = frames.map((_, i) =>
      Array.isArray(opts.delay) ? opts.delay[i] : opts.delay == null ? 10 : opts.delay
    );
    if (!frames.length) throw new Error('encodeGif: no frames');
    if (palette.length > 255) throw new Error('encodeGif: palette must have at most 255 colors');

    // Palette size must be a power of two; reserve one extra slot for transparency.
    let bits = 1;
    while (1 << bits < palette.length + 1) bits++;
    const tableSize = 1 << bits;
    const transIndex = tableSize - 1;
    const minCodeSize = Math.max(2, bits);

    // Merge identical consecutive frames.
    const merged = [];
    for (let i = 0; i < frames.length; i++) {
      const prev = merged[merged.length - 1];
      if (prev && equalFrames(prev.data, frames[i])) prev.delay += delays[i];
      else merged.push({ data: frames[i], delay: delays[i] });
    }

    const out = new ByteWriter(width * height * scale * scale);
    out.ascii('GIF89a');
    out.u16(width * scale);
    out.u16(height * scale);
    out.byte(0x80 | 0x70 | (bits - 1)); // GCT flag, 8-bit color resolution, table size
    out.byte(0); // background color index
    out.byte(0); // pixel aspect ratio
    for (let i = 0; i < tableSize; i++) {
      const c = palette[i] || [0, 0, 0];
      out.byte(c[0]);
      out.byte(c[1]);
      out.byte(c[2]);
    }

    if (merged.length > 1) {
      out.byte(0x21);
      out.byte(0xff);
      out.byte(11);
      out.ascii('NETSCAPE2.0');
      out.byte(3);
      out.byte(1);
      out.u16(loop);
      out.byte(0);
    }

    let prev = null;
    for (const frame of merged) {
      let x0 = 0, y0 = 0, w = width, h = height, mask = null;
      if (prev) {
        const box = diffBox(prev, frame.data, width, height);
        if (box) {
          ({ x0, y0, w, h } = box);
          mask = new Uint8Array(width * height);
          for (let y = y0; y < y0 + h; y++)
            for (let x = x0; x < x0 + w; x++) {
              const i = y * width + x;
              if (prev[i] === frame.data[i]) mask[i] = 1;
            }
        }
      }
      const hasTransparency = !!mask;
      // Graphic Control Extension
      out.byte(0x21);
      out.byte(0xf9);
      out.byte(4);
      out.byte((1 << 2) | (hasTransparency ? 1 : 0)); // disposal: leave in place
      out.u16(Math.max(2, Math.round(frame.delay)));
      out.byte(hasTransparency ? transIndex : 0);
      out.byte(0);
      // Image Descriptor
      out.byte(0x2c);
      out.u16(x0 * scale);
      out.u16(y0 * scale);
      out.u16(w * scale);
      out.u16(h * scale);
      out.byte(0);
      const pixels = scaleRect(frame.data, width, x0, y0, w, h, scale, mask, transIndex);
      writeLzw(out, pixels, minCodeSize);
      prev = frame.data;
    }

    out.byte(0x3b);
    return out.result();
  }

  function equalFrames(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** Bounding box of pixels that differ between two frames (1x1 if none). */
  function diffBox(a, b, width, height) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (a[row + x] !== b[row + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x0: 0, y0: 0, w: 1, h: 1 };
    return { x0: minX, y0: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  return { encodeGif, writeLzw, ByteWriter };
});
