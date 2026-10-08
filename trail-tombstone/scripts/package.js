#!/usr/bin/env node
/*
 * Package a shareable zip: release/trail-tombstone-<version>.zip
 *
 *   Trail Tombstone.html   the app: double-click to open in any browser
 *   README.txt             plain-text instructions
 *   command-line/          optional Node.js CLI (cli.js + src/)
 *
 * Builds first, then writes the zip with a tiny built-in zip writer, so it
 * works the same on Windows, macOS and Linux with no extra tools.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
require('./build'); // regenerates dist/

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const top = `trail-tombstone-${version}`;

const README = `TRAIL TOMBSTONE ${version}
Make animated pixel-art tombstone GIFs: a fallen traveler, a dead horse,
or a tipped-over covered wagon, with your own epitaph.


OPEN THE APP
------------
Double-click "Trail Tombstone.html". It opens in your web browser.
Nothing to install, and it works offline.

  1. Pick who didn't make it: Traveler, Horse or Wagon.
  2. Pick a sky, and Full color or Green screen (black + neon green).
  3. Type the name, epitaph and the caption for the bottom bar.
  4. Click "Make GIF", then "Save GIF".

Extras:
  - Typewriter text: the epitaph types itself out letter by letter
    (makes a longer GIF, about 6 seconds).
  - Reshuffle scenery: new mountains, grass and flowers.
  - Your last settings are remembered in that browser.


COMMAND LINE (optional)
-----------------------
Needs Node.js 18 or newer (https://nodejs.org). No other installs.

  cd command-line
  node cli.js --subject horse --name Dusty --epitaph "Good horse. Bad at rivers." -o dusty.gif
  node cli.js --subject wagon --sky night --green -o wagon.gif
  node cli.js --help
`;

const files = [
  { name: 'Trail Tombstone.html', data: fs.readFileSync(path.join(root, 'dist/index.html')) },
  { name: 'README.txt', data: Buffer.from(README.replace(/\n/g, '\r\n')) }, // CRLF so Notepad shows it right
  { name: 'command-line/cli.js', data: fs.readFileSync(path.join(root, 'cli.js')), exec: true },
  ...['gif', 'font', 'art', 'scene'].map((m) => ({
    name: `command-line/src/${m}.js`,
    data: fs.readFileSync(path.join(root, `src/${m}.js`)),
  })),
];

// ---- minimal zip writer (deflate, UTF-8 names, unix permissions) ----------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function zip(entries) {
  const { time, date } = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const deflated = zlib.deflateRawSync(e.data, { level: 9 });
    const stored = deflated.length >= e.data.length;
    const body = stored ? e.data : deflated;
    const method = stored ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 file names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by unix, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((e.exec ? 0o100755 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const out = path.join(root, 'release', `${top}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const bytes = zip(files.map((f) => ({ ...f, name: `${top}/${f.name}` })));
fs.writeFileSync(out, bytes);
console.log(`release/${top}.zip  ${(bytes.length / 1024).toFixed(1)} KB  (${files.length} files)`);
