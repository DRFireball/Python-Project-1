/*
 * app.js — browser UI for the tombstone generator. Uses the renderer that
 * the build inlines as globalThis.TrailTombstone.
 */
(function () {
  'use strict';

  const TT = globalThis.TrailTombstone.scene;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'trail-tombstone:v1';
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const els = {
    form: $('form'),
    preview: $('preview'),
    badge: $('badge'),
    playBtn: $('playBtn'),
    makeBtn: $('makeBtn'),
    size: $('size'),
    result: $('result'),
    resultImg: $('resultImg'),
    resultFacts: $('resultFacts'),
    saveBtn: $('saveBtn'),
    saveNote: $('saveNote'),
    header: $('header'),
    name: $('name'),
    epitaph: $('epitaph'),
    caption: $('caption'),
    overflow: $('overflow'),
    randomBtn: $('randomBtn'),
    sceneryBtn: $('sceneryBtn'),
    crittersLabel: $('crittersLabel'),
  };

  const CRITTER_LABEL = { traveler: 'Ghost', horse: 'Flies', wagon: 'Spinning wheel' };

  // ---------------------------------------------------------------- state ---

  const state = {
    subject: 'traveler',
    sky: 'dusk',
    look: 'color',
    header: 'HERE LIES',
    name: TT.PRESETS.traveler.name,
    epitaph: TT.PRESETS.traveler.epitaph,
    caption: TT.DEFAULTS.caption,
    cross: true,
    flowers: true,
    buzzards: true,
    critters: true,
    typewriter: false,
    seed: TT.DEFAULTS.seed,
    scale: 3,
  };
  // Name/epitaph follow the subject's preset until the user edits them.
  const edited = { name: false, epitaph: false };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        for (const k of Object.keys(state)) if (k in (saved.state || {})) state[k] = saved.state[k];
        Object.assign(edited, saved.edited || {});
      }
    } catch (e) {
      /* storage unavailable: start fresh */
    }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ state, edited }));
    } catch (e) {
      /* ignore */
    }
  }

  function syncForm() {
    const radio = (name, value) => {
      const el = els.form.querySelector(`input[name="${name}"][value="${value}"]`);
      if (el) el.checked = true;
    };
    radio('subject', state.subject);
    radio('sky', state.sky);
    radio('look', state.look);
    els.header.value = state.header;
    els.name.value = state.name;
    els.epitaph.value = state.epitaph;
    els.caption.value = state.caption;
    for (const k of ['cross', 'flowers', 'buzzards', 'critters', 'typewriter']) $(k).checked = !!state[k];
    els.size.value = String(state.scale);
    els.crittersLabel.textContent = CRITTER_LABEL[state.subject];
  }

  // -------------------------------------------------------------- preview ---

  const ctx = els.preview.getContext('2d');
  const image = ctx.createImageData(TT.W, TT.H);
  const pixels32 = new Uint32Array(image.data.buffer);
  let rendered = null;
  let lut = null;
  let frameIndex = 0;
  let playing = !reducedMotion;
  let lastTick = 0;

  function paletteLut(palette) {
    const out = new Uint32Array(palette.length);
    palette.forEach(([r, g, b], i) => (out[i] = (255 << 24) | (b << 16) | (g << 8) | r));
    return out;
  }

  function blit(frame) {
    for (let i = 0; i < frame.length; i++) pixels32[i] = lut[frame[i]];
    ctx.putImageData(image, 0, 0);
  }

  function renderPreview() {
    rendered = TT.renderFrames(state);
    lut = paletteLut(rendered.palette);
    frameIndex = Math.min(frameIndex, rendered.frames.length - 1);
    if (!playing) frameIndex = rendered.frames.length - 1;
    blit(rendered.frames[frameIndex]);
    els.badge.textContent = `${rendered.frames.length} FRAMES · ${(rendered.info.durationMs / 1000).toFixed(1)}S`;
    els.overflow.hidden = !rendered.info.overflow;
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (!playing || !rendered) return;
    const delay = rendered.delays[frameIndex] * 10;
    if (now - lastTick < delay) return;
    lastTick = now;
    frameIndex = (frameIndex + 1) % rendered.frames.length;
    blit(rendered.frames[frameIndex]);
  }

  function setPlaying(on) {
    playing = on;
    els.playBtn.textContent = on ? 'PAUSE' : 'PLAY';
    els.playBtn.setAttribute('aria-pressed', String(on));
    if (!on && rendered) {
      frameIndex = rendered.frames.length - 1;
      blit(rendered.frames[frameIndex]);
    }
  }

  // Scene-picker thumbnails: the right-hand part of frame 0 for each subject.
  function renderThumbs() {
    for (const canvas of document.querySelectorAll('canvas[data-thumb]')) {
      const subject = canvas.dataset.thumb;
      const r = TT.renderFrames({
        ...state, subject, caption: '', typewriter: false, name: '', epitaph: '',
        buzzards: false, critters: false, maxFrames: 1,
      });
      const pal = paletteLut(r.palette);
      const c = canvas.getContext('2d');
      const img = c.createImageData(120, 66);
      const px = new Uint32Array(img.data.buffer);
      const f = r.frames[0];
      for (let y = 0; y < 66; y++) for (let x = 0; x < 120; x++) px[y * 120 + x] = pal[f[(y + 84) * TT.W + (x + 120)]];
      c.putImageData(img, 0, 0);
    }
  }

  // ------------------------------------------------------------------ GIF ---

  let currentGif = null; // { blob, url, filename }

  function slug(s) {
    return (
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'tombstone'
    );
  }

  function clearResult() {
    if (currentGif) URL.revokeObjectURL(currentGif.url);
    currentGif = null;
    els.result.hidden = true;
    els.saveNote.hidden = true;
  }

  async function makeGif() {
    els.makeBtn.disabled = true;
    els.makeBtn.textContent = 'Carving…';
    await new Promise((r) => setTimeout(r, 30)); // let the button repaint
    try {
      const t0 = performance.now();
      const out = TT.renderGif(state);
      const blob = new Blob([out.bytes], { type: 'image/gif' });
      clearResult();
      currentGif = {
        blob,
        url: URL.createObjectURL(blob),
        filename: `tombstone-${slug(state.name || state.subject)}.gif`,
      };
      els.resultImg.src = currentGif.url;
      const kb = blob.size / 1024;
      els.resultFacts.textContent = `${currentGif.filename} · ${out.width}×${out.height} · ${out.info.frames} frames · ${
        kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(0) + ' KB'
      } · made in ${Math.round(performance.now() - t0)} ms`;
      els.result.hidden = false;
    } catch (e) {
      els.resultFacts.textContent = `Couldn't make the GIF: ${e.message}`;
      els.result.hidden = false;
    } finally {
      els.makeBtn.disabled = false;
      els.makeBtn.textContent = 'Make GIF';
    }
  }

  // In a Claude artifact, files go through the downloads capability; anywhere
  // else, a plain download link does the job.
  let downloadsPromise = null;
  function downloads() {
    if (!downloadsPromise) {
      downloadsPromise =
        window.claude && typeof window.claude.use === 'function'
          ? window.claude.use('downloads').catch(() => null)
          : Promise.resolve(null);
    }
    return downloadsPromise;
  }

  function note(text) {
    els.saveNote.textContent = text;
    els.saveNote.hidden = !text;
  }

  async function saveGif() {
    if (!currentGif) return;
    note('');
    const dl = await downloads();
    if (dl) {
      try {
        await dl.save({ filename: currentGif.filename, data: currentGif.blob });
        note('Saved.');
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') note('Save cancelled.');
        else if (code === 'rate_limited') note('A save prompt is already open. Finish that one first.');
        else note('Saving isn’t available here. Right-click the GIF and choose “Save image as”.');
      }
      return;
    }
    const a = document.createElement('a');
    a.href = currentGif.url;
    a.download = currentGif.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------------------------------------------------------------- wiring ---

  let pending = 0;
  function update(opts) {
    persist();
    clearTimeout(pending);
    pending = setTimeout(() => {
      renderPreview();
      if (opts && opts.thumbs) renderThumbs();
      clearResult();
    }, 40);
  }

  els.form.addEventListener('submit', (e) => e.preventDefault());

  els.form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'subject') {
      state.subject = t.value;
      if (!edited.name) state.name = TT.PRESETS[state.subject].name;
      if (!edited.epitaph) state.epitaph = TT.PRESETS[state.subject].epitaph;
      els.name.value = state.name;
      els.epitaph.value = state.epitaph;
      els.crittersLabel.textContent = CRITTER_LABEL[state.subject];
      frameIndex = 0;
      update();
    } else if (t.name === 'sky' || t.name === 'look') {
      state[t.name] = t.value;
      update({ thumbs: true });
    } else if (t.type === 'checkbox') {
      state[t.id] = t.checked;
      frameIndex = 0;
      update();
    }
  });

  for (const key of ['header', 'name', 'epitaph', 'caption']) {
    els[key].addEventListener('input', () => {
      state[key] = els[key].value;
      if (key in edited) edited[key] = true;
      update();
    });
  }

  els.size.addEventListener('change', () => {
    state.scale = Number(els.size.value);
    persist();
    clearResult();
  });

  els.randomBtn.addEventListener('click', () => {
    const list = TT.EPITAPHS[state.subject];
    let next = state.epitaph;
    for (let i = 0; i < 8 && next === state.epitaph; i++) next = list[Math.floor(Math.random() * list.length)];
    state.epitaph = next;
    els.epitaph.value = next;
    edited.epitaph = true;
    update();
  });

  els.sceneryBtn.addEventListener('click', () => {
    state.seed = Math.floor(Math.random() * 1e6);
    update({ thumbs: true });
  });

  els.playBtn.addEventListener('click', () => setPlaying(!playing));
  els.makeBtn.addEventListener('click', makeGif);
  els.saveBtn.addEventListener('click', saveGif);

  load();
  syncForm();
  setPlaying(playing);
  renderPreview();
  renderThumbs();
  requestAnimationFrame(tick);
})();
