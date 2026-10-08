#!/usr/bin/env node
/*
 * Command-line GIF maker. Same renderer as the web app.
 *
 *   node cli.js --subject horse --name "Biscuit" --epitaph "Good horse. Bad at rivers." -o biscuit.gif
 *   node cli.js --help
 */
'use strict';

const fs = require('fs');
const path = require('path');
const TT = require('./src/scene');

const FLAGS = {
  subject: 'traveler | horse | wagon',
  sky: 'day | dusk | night',
  look: 'color | green (black and neon green only)',
  green: 'shorthand for --look green',
  header: 'small line at the top of the stone (default "HERE LIES")',
  name: 'name carved in large letters',
  epitaph: 'epitaph text (use \\n for a line break)',
  caption: 'message in the black bar along the bottom ("" to hide it)',
  scale: 'pixel size multiplier, 1-8 (default 3 = 720x480)',
  delay: 'frame delay in 1/100 s (default 9)',
  seed: 'scenery seed: changes mountains, grass and flowers',
  'no-cross': 'leave the cross off the stone',
  'no-flowers': 'no flowers on the grave',
  'no-buzzards': 'no circling buzzards',
  'no-critters': 'no flies / ghost / spinning wheel',
  typewriter: 'type the epitaph and caption out letter by letter',
  out: 'output file (default tombstone.gif); alias -o',
};

function usage() {
  const lines = Object.entries(FLAGS).map(([k, v]) => `  --${k.padEnd(12)} ${v}`);
  return `Usage: node cli.js [options]\n\n${lines.join('\n')}\n`;
}

function parse(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '-o') arg = '--out';
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    let key = arg.slice(2);
    let value;
    const eq = key.indexOf('=');
    if (eq >= 0) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    if (!(key in FLAGS)) throw new Error(`Unknown option --${key}. Run with --help to see options.`);
    if (key.startsWith('no-')) {
      opts[key.slice(3)] = false;
      continue;
    }
    if (key === 'typewriter') {
      opts.typewriter = true;
      continue;
    }
    if (key === 'green') {
      opts.look = 'green';
      continue;
    }
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) throw new Error(`--${key} needs a value`);
    }
    opts[key] = value;
  }
  if (opts.epitaph) opts.epitaph = opts.epitaph.replace(/\\n/g, '\n');
  if (opts.subject && !TT.SUBJECTS[opts.subject]) throw new Error(`--subject must be one of: ${Object.keys(TT.SUBJECTS).join(', ')}`);
  if (opts.sky && !TT.SKIES[opts.sky]) throw new Error(`--sky must be one of: ${Object.keys(TT.SKIES).join(', ')}`);
  if (opts.look && !TT.LOOKS[opts.look]) throw new Error(`--look must be one of: ${Object.keys(TT.LOOKS).join(', ')}`);
  return opts;
}

function main() {
  let opts;
  try {
    opts = parse(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${usage()}`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write(usage());
    return;
  }
  const out = path.resolve(opts.out || 'tombstone.gif');
  delete opts.out;
  const result = TT.renderGif(opts);
  fs.writeFileSync(out, result.bytes);
  const kb = (result.bytes.length / 1024).toFixed(1);
  process.stdout.write(`Wrote ${out} (${result.width}x${result.height}, ${result.info.frames} frames, ${kb} KB)\n`);
  if (result.info.overflow) process.stderr.write('Note: the epitaph was too long for the stone and was cut off.\n');
}

main();
