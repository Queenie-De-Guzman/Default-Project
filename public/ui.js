// Shared front-end helpers used by the SPA and by game modules.
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export const attr = (value) => esc(value);

export const norm = (value) => String(value ?? '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function choicesOf(question) {
  return (question?.choices || []).map((c, i) => ({
    ...c,
    text: c.text ?? `Option ${i + 1}`,
    is_correct: Boolean(c.is_correct)
  }));
}

export const correctOf = (question) => choicesOf(question).find((c) => c.is_correct);

const SOUND_KEY = 'eduplay-game-sound';
let audioCtx = null;
let masterGain = null;

export function gameSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== '0'; }
  catch { return true; }
}

export function setGameSound(enabled) {
  try { localStorage.setItem(SOUND_KEY, enabled ? '1' : '0'); }
  catch { /* storage may be unavailable; sound still works for this page */ }
  if (enabled) sound('click');
}

function ensureAudio(force = false) {
  if (!force && !gameSoundEnabled()) return null;
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.22;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch { return null; }
}

function tone(ctx, { freq = 440, type = 'sine', at = 0, duration = 0.14, volume = 0.5, slide = null }) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(40, freq), start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + Math.min(0.02, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/**
 * Browser-generated game sounds. Boolean calls remain compatible with older
 * modules: true = correct, false = incorrect.
 */
export function sound(event = true) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const kind = typeof event === 'boolean' ? (event ? 'correct' : 'incorrect') : String(event || 'click');
  try {
    if (kind === 'correct') {
      tone(ctx, { freq: 659, at: 0, duration: 0.12, volume: 0.55 });
      tone(ctx, { freq: 880, at: 0.09, duration: 0.16, volume: 0.5 });
      tone(ctx, { freq: 1318, at: 0.18, duration: 0.2, volume: 0.35, type: 'triangle' });
    } else if (kind === 'incorrect') {
      tone(ctx, { freq: 330, type: 'triangle', duration: 0.16, volume: 0.42, slide: 196 });
      tone(ctx, { freq: 247, type: 'sine', at: 0.12, duration: 0.18, volume: 0.28, slide: 165 });
    } else if (kind === 'click') {
      tone(ctx, { freq: 540, duration: 0.055, volume: 0.25, slide: 680 });
    } else if (kind === 'tick') {
      tone(ctx, { freq: 880, type: 'square', duration: 0.045, volume: 0.16 });
    } else if (kind === 'spin') {
      [420, 520, 640, 780, 940].forEach((freq, i) =>
        tone(ctx, { freq, type: 'triangle', at: i * 0.07, duration: 0.07, volume: 0.3 }));
    } else if (kind === 'start') {
      [523, 659, 784].forEach((freq, i) =>
        tone(ctx, { freq, at: i * 0.08, duration: 0.14, volume: 0.4 }));
    } else if (kind === 'reward') {
      tone(ctx, { freq: 880, duration: 0.22, volume: 0.4 });
      tone(ctx, { freq: 1175, at: 0.1, duration: 0.28, volume: 0.35, type: 'triangle' });
    } else if (kind === 'win') {
      [523, 659, 784, 1047].forEach((freq, i) =>
        tone(ctx, { freq, at: i * 0.11, duration: 0.25, volume: 0.45, type: i === 3 ? 'triangle' : 'sine' }));
      tone(ctx, { freq: 1318, at: 0.44, duration: 0.4, volume: 0.3 });
    } else {
      tone(ctx, { freq: 520, duration: 0.08, volume: 0.22 });
    }
  } catch { /* audio is a nice-to-have */ }
}

export const gameUI = { esc, shuffle, norm, pick, wait, sound, gameSoundEnabled, setGameSound };

// Gentle original background music for the Game World, synthesized offline.
const WORLD_MUSIC_KEY = 'eduplay-world-music';
let worldMusicTimer = null;
let worldMusicStep = 0;
const WORLD_NOTES = [392, 523, 659, 523, 440, 587, 784, 587];

export function worldMusicOn() {
  try { return localStorage.getItem(WORLD_MUSIC_KEY) === '1'; }
  catch { return false; }
}

function worldMusicTick() {
  const ctx = ensureAudio(true);
  if (!ctx) return;
  const note = WORLD_NOTES[worldMusicStep % WORLD_NOTES.length];
  worldMusicStep += 1;
  tone(ctx, { freq: note, type: 'sine', duration: 0.35, volume: 0.1 });
  if (worldMusicStep % 4 === 0) tone(ctx, { freq: note / 2, type: 'triangle', duration: 0.6, volume: 0.06 });
}

function stopWorldMusic() {
  if (worldMusicTimer) clearInterval(worldMusicTimer);
  worldMusicTimer = null;
}

function startWorldMusic() {
  if (worldMusicTimer) return;
  worldMusicTick();
  worldMusicTimer = setInterval(worldMusicTick, 520);
}

export function mountWorldMusic(root) {
  const button = root?.querySelector('#gw-music');
  if (!button) return () => {};
  const paint = () => {
    const on = worldMusicOn();
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? '🎵' : '🎵̸';
  };
  paint();
  if (worldMusicOn()) startWorldMusic();
  const onClick = () => {
    const next = !worldMusicOn();
    try { localStorage.setItem(WORLD_MUSIC_KEY, next ? '1' : '0'); }
    catch { /* preference may be unavailable */ }
    if (next) startWorldMusic(); else stopWorldMusic();
    paint();
  };
  button.addEventListener('click', onClick);
  const cleanup = () => { button.removeEventListener('click', onClick); stopWorldMusic(); };
  root.__cleanupMusic = cleanup;
  return cleanup;
}

export function toast(message, kind = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export function modal(title, content, options = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${options.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="modal-body">${content}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>${esc(options.cancelText || 'Cancel')}</button>
        <button class="btn btn-primary" data-ok>${esc(options.okText || 'Save')}</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);
    let closed = false;
    const done = (value) => { if (closed) return; closed = true; wrap.remove(); resolve(value); };
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => done(null)));
    wrap.querySelector('[data-ok]').addEventListener('click', () => done(wrap.querySelector('.modal-body')));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(null); });
    const first = wrap.querySelector('input,textarea,select,button');
    if (first) first.focus();
    // Persistent modals stay in the DOM so an in-form submit (uploads) can finish.
    // The caller receives the live body element and closes it with body.close().
    if (options.persistent) {
      const body = wrap.querySelector('.modal-body');
      body.close = () => done(null);
      wrap.querySelector('[data-ok]').style.display = 'none';
      wrap.querySelector('[data-close].btn-ghost').textContent = options.cancelText || 'Close';
      resolve(body);
    }
  });
}

export function confirmDialog(title, message, okText = 'Delete') {
  return modal(title, `<p class="muted">${esc(message)}</p>`, { okText, cancelText: 'Keep' })
    .then((body) => !!body);
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
    (withTime ? ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}

export function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase();
}

export function progressRing(percent, size = 54) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - p / 100)}"/>
    <text x="50%" y="53%" class="ring-text">${Math.round(p)}%</text>
  </svg>`;
}
