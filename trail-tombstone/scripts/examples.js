#!/usr/bin/env node
/* Render the sample GIFs in examples/ (used in the README). */
'use strict';

const fs = require('fs');
const path = require('path');
const TT = require('../src/scene');

const out = path.join(__dirname, '..', 'examples');
fs.mkdirSync(out, { recursive: true });

const samples = [
  { file: 'traveler.gif', subject: 'traveler', sky: 'dusk' },
  { file: 'horse.gif', subject: 'horse', sky: 'day' },
  { file: 'wagon.gif', subject: 'wagon', sky: 'night' },
  { file: 'typewriter.gif', subject: 'traveler', sky: 'day', name: 'Ezra', epitaph: 'Said "I know a shortcut."', typewriter: true },
];

for (const { file, ...opts } of samples) {
  const r = TT.renderGif({ scale: 2, ...opts });
  fs.writeFileSync(path.join(out, file), r.bytes);
  console.log(`examples/${file}  ${r.width}x${r.height}  ${r.info.frames} frames  ${(r.bytes.length / 1024).toFixed(1)} KB`);
}
