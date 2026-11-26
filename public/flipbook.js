import { esc } from './ui.js';

const pad = (value) => String(value).padStart(2, '0');
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));

function stored(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function saveStored(key, value) {
  try { localStorage.setItem(key, String(value)); }
  catch { /* private browsing still works without persistence */ }
}

function currentZoom() {
  return clamp(stored('eduplay-flip-zoom', '1'), 0.6, 1.8);
}

function applyZoom(root, zoom) {
  const book = root?.querySelector?.('[data-flipbook]');
  const value = clamp(zoom, 0.6, 1.8);
  if (book) book.style.setProperty('--flipbook-scale', String(value));
  const label = root?.querySelector?.('[data-flipbook-zoom-value]');
  if (label) label.textContent = `${Math.round(value * 100)}%`;
  saveStored('eduplay-flip-zoom', value);
  return value;
}

function playPageTurn() {
  if (stored('eduplay-flip-sound', '0') !== '1') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const audio = playPageTurn.audio || (playPageTurn.audio = new Ctx());
    const duration = 0.16;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) {
      const fade = 1 - i / channel.length;
      channel[i] = (Math.random() * 2 - 1) * fade * fade;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    gain.gain.value = 0.18;
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
  } catch { /* sound is optional */ }
}

/**
 * Render one story section as a page in a book. Callers supply the body so the
 * teacher and student readers can keep their own narration highlighting.
 */
export function flipbookHtml({
  prefix, title, pages = [], index = 0, renderPage, viewMode = 'single', onTurn = null, sound = false
} = {}) {
  const count = pages.length;
  const mode = viewMode === 'double' ? 'double' : 'single';
  const step = mode === 'double' ? 2 : 1;
  const visible = mode === 'double'
    ? [pages[index], pages[index + 1]].filter(Boolean)
    : [pages[index]].filter(Boolean);
  const zoom = currentZoom();
  const soundOn = sound || stored('eduplay-flip-sound', '0') === '1';
  const counter = count
    ? mode === 'double' && visible.length > 1
      ? `Pages ${index + 1}–${Math.min(count, index + 2)} of ${count}`
      : `Page ${index + 1} of ${count}`
    : 'No pages';
  return `<div class="flipbook-shell" data-flipbook-shell data-view-mode="${mode}" data-index="${index}" data-count="${count}">
    <div class="flipbook-toolbar" role="toolbar" aria-label="Flip book controls">
      <button class="btn btn-sm btn-ghost" id="${prefix}-flip-prev" aria-label="Previous page" ${index <= 0 ? 'disabled' : ''}>‹ Previous</button>
      <strong data-flipbook-counter>${esc(counter)}</strong>
      <button class="btn btn-sm btn-ghost" id="${prefix}-flip-next" aria-label="Next page" ${index + step >= count ? 'disabled' : ''}>Next ›</button>
      <span class="flipbook-toolbar-sep" aria-hidden="true"></span>
      <button class="btn btn-sm btn-ghost" id="${prefix}-flip-zoom-out" aria-label="Zoom out">−</button>
      <span class="flipbook-zoom-value" data-flipbook-zoom-value>${Math.round(zoom * 100)}%</span>
      <button class="btn btn-sm btn-ghost" id="${prefix}-flip-zoom-in" aria-label="Zoom in">+</button>
      <button class="btn btn-sm btn-ghost" id="${prefix}-flip-fullscreen" aria-label="Toggle fullscreen">⛶</button>
      <button class="btn btn-sm btn-ghost" id="${prefix}-flip-mode" aria-label="Toggle single or double page">${mode === 'double' ? '📖 Double' : '📄 Single'}</button>
      <button class="btn btn-sm btn-ghost ${soundOn ? 'flipbook-sound-on' : ''}" id="${prefix}-flip-sound" aria-label="Toggle page turn sound" aria-pressed="${soundOn}">${soundOn ? '🔊' : '🔇'}</button>
    </div>
    <div class="flipbook-stage">
      <div class="flipbook" data-flipbook tabindex="0" aria-label="${esc(title || 'Story')} flip book" style="--flipbook-scale:${zoom}">
        ${visible.map((page, localIndex) => `<div class="flipbook-page flipbook-page-current ${mode === 'double' ? (localIndex === 0 ? 'flipbook-page-left' : 'flipbook-page-right') : ''}">
          <div class="flipbook-page-top">
            <span class="flipbook-book-title">${esc(title || 'Story')}</span>
            <span class="flipbook-page-number">PAGE ${pad((pages.indexOf(page) >= 0 ? pages.indexOf(page) : index) + 1)} / ${pad(count)}</span>
          </div>
          <div class="flipbook-page-body">${renderPage ? renderPage(page, pages.indexOf(page) >= 0 ? pages.indexOf(page) : index) : ''}</div>
          <div class="flipbook-page-bottom">
            <span>Click a corner, drag, or use ← → to turn</span>
            <span>${pad((pages.indexOf(page) >= 0 ? pages.indexOf(page) : index) + 1)}</span>
          </div>
        </div>`).join('')}
        <div class="flipbook-spine" aria-hidden="true"></div>
      </div>
    </div>
  </div>`;
}

/** Clone the visible page(s), animate them away, then paint the next page. */
export function turnFlipbook(root, direction, paint) {
  const book = root?.querySelector?.('[data-flipbook]');
  const pages = [...(book?.querySelectorAll?.('.flipbook-page-current') || [])];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!book || !pages.length || reduced) { paint(); return; }

  const sheets = pages.map((page) => {
    const sheet = page.cloneNode(true);
    sheet.removeAttribute('tabindex');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.classList.remove('flipbook-page-current');
    sheet.classList.add('flipbook-turn', direction === 'next' ? 'flipbook-turn-next' : 'flipbook-turn-prev');
    sheet.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    sheet.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    return sheet;
  });

  // Paint first: the page body is re-rendered from scratch, so the turning
  // sheets must be attached to the new book rather than the old one.
  paint();
  const freshBook = root.querySelector('[data-flipbook]');
  if (!freshBook) return;
  sheets.forEach((sheet) => freshBook.appendChild(sheet));
  const cleanup = () => sheets.forEach((sheet) => sheet.remove());
  sheets[0]?.addEventListener('animationend', cleanup, { once: true });
  window.setTimeout(cleanup, 800);
}

/**
 * Delegate toolbar, corner, keyboard, drag and edge-click navigation.
 * Re-painting keeps working because every handler is attached to the root.
 */
export function bindFlipbook(root, prefix, onTurn, options = {}) {
  if (!root) return;
  const modeOf = () => root.querySelector('[data-flipbook-shell]')?.dataset.viewMode === 'double' ? 'double' : 'single';
  const stepOf = () => modeOf() === 'double' ? 2 : 1;
  const turn = (delta) => {
    if (!delta) return;
    playPageTurn();
    onTurn(delta);
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('button');
    if (button && root.contains(button)) {
      if (button.id === `${prefix}-flip-prev`) turn(-stepOf());
      if (button.id === `${prefix}-flip-next`) turn(stepOf());
      if (button.id === `${prefix}-flip-zoom-out`) applyZoom(root, clamp((Number(root.querySelector('[data-flipbook]')?.style.getPropertyValue('--flipbook-scale')) || 1) - 0.1, 0.6, 1.8));
      if (button.id === `${prefix}-flip-zoom-in`) applyZoom(root, clamp((Number(root.querySelector('[data-flipbook]')?.style.getPropertyValue('--flipbook-scale')) || 1) + 0.1, 0.6, 1.8));
      if (button.id === `${prefix}-flip-fullscreen`) {
        const shell = root.querySelector('[data-flipbook-shell]');
        if (document.fullscreenElement) document.exitFullscreen?.();
        else shell?.requestFullscreen?.();
      }
      if (button.id === `${prefix}-flip-mode`) {
        const mode = modeOf() === 'double' ? 'single' : 'double';
        saveStored('eduplay-flip-mode', mode);
        options.onModeChange?.(mode);
      }
      if (button.id === `${prefix}-flip-sound`) {
        const on = stored('eduplay-flip-sound', '0') !== '1';
        saveStored('eduplay-flip-sound', on ? '1' : '0');
        button.textContent = on ? '🔊' : '🔇';
        button.classList.toggle('flipbook-sound-on', on);
        button.setAttribute('aria-pressed', String(on));
        if (on) playPageTurn();
      }
      return;
    }
    if (options.doubleClickTurn === false) return;
    const body = event.target.closest?.('.flipbook-page-body');
    if (!body || event.target.closest?.('a,input,textarea,select,button,contenteditable')) return;
    const rect = body.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    if (ratio < 0.08) turn(-stepOf());
    else if (ratio > 0.92) turn(stepOf());
  });

  root.addEventListener('keydown', (event) => {
    if (!event.target.closest?.('[data-flipbook]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-stepOf()); }
    if (event.key === 'ArrowRight') { event.preventDefault(); turn(stepOf()); }
  });

  let drag = null;
  root.addEventListener('pointerdown', (event) => {
    const book = event.target.closest?.('[data-flipbook]');
    if (!book || event.target.closest?.('a,input,textarea,select,button,contenteditable')) return;
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId, book };
    book.classList.add('flipbook-dragging');
    try { book.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
  });
  root.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    drag.book.classList.remove('flipbook-dragging');
    drag = null;
    if (Math.abs(dx) > 70) turn(dx < 0 ? stepOf() : -stepOf());
  });
  root.addEventListener('pointercancel', () => {
    drag?.book.classList.remove('flipbook-dragging');
    drag = null;
  });
}

export function initialFlipMode() {
  return stored('eduplay-flip-mode', 'single') === 'double' ? 'double' : 'single';
}

export function applyStoredZoom(root) {
  return applyZoom(root, currentZoom());
}
