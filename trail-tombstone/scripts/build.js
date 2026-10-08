#!/usr/bin/env node
/*
 * Build: inline the renderer and UI script into the HTML template.
 *
 *   dist/index.html     standalone page (open it straight from disk, or host it)
 *   dist/artifact.html  same page without the <html>/<head>/<body> wrapper,
 *                       for hosts that add their own (e.g. Claude artifacts)
 *
 * No dependencies; Node 18+.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const CORE = ['src/gif.js', 'src/font.js', 'src/art.js', 'src/scene.js'];

function inline(files) {
  return files
    .map((f) => {
      const code = read(f);
      if (/<\/script/i.test(code)) throw new Error(`${f} contains "</script" and can't be inlined`);
      return `/* ---- ${f} ---- */\n${code.trim()}\n`;
    })
    .join('\n');
}

function build() {
  const template = read('web/template.html');
  if (!template.includes('/* @inline-core */') || !template.includes('/* @inline-app */'))
    throw new Error('web/template.html is missing an inline marker');

  const fragment = template
    .replace('/* @inline-core */', () => inline(CORE))
    .replace('/* @inline-app */', () => inline(['web/app.js']));

  const [head, body] = fragment.split('<!-- @body -->');
  if (body === undefined) throw new Error('web/template.html is missing the <!-- @body --> marker');
  const full =
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    head.trim() +
    '\n</head>\n<body>\n' +
    body.trim() +
    '\n</body>\n</html>\n';

  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), full);
  fs.writeFileSync(path.join(dist, 'artifact.html'), fragment);
  const kb = (n) => (Buffer.byteLength(n) / 1024).toFixed(1) + ' KB';
  console.log(`dist/index.html     ${kb(full)}`);
  console.log(`dist/artifact.html  ${kb(fragment)}`);
}

build();
