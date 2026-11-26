// Shared browser engine for uploaded PowerPoint files.
// The original PPTX is handed directly to a local OOXML renderer; slides are
// drawn from the source deck, not rebuilt from EduPlay's extracted text.

const bufferCache = new Map();
let stageSeq = 0;
let modulePromise = null;

const TRANSITION_CLASSES = [
  'pptx-tr-fade', 'pptx-tr-wipe', 'pptx-tr-push', 'pptx-tr-zoom', 'pptx-tr-split'
];

const SPEED_MS = { slow: 900, med: 550, medium: 550, fast: 280 };

function engineModule() {
  if (!modulePromise) {
    modulePromise = import('/vendor/aiden-pptx/aiden0z-pptx-renderer.browser.es.js');
  }
  return modulePromise;
}

export function pptxEngineAvailable() {
  return typeof DOMParser === 'function' && typeof HTMLElement === 'function';
}

async function deckBuffer(url) {
  if (!bufferCache.has(url)) {
    bufferCache.set(url, (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load the original PowerPoint file (${response.status}).`);
      const buffer = await response.arrayBuffer();
      if (!buffer.byteLength) throw new Error('The original PowerPoint file is empty.');
      return buffer;
    })().catch((error) => { bufferCache.delete(url); throw error; }));
  }
  return bufferCache.get(url);
}

function effectClass(transition) {
  const effect = String(transition?.effect || 'fade').toLowerCase();
  if (['cut', 'none', ''].includes(effect)) return '';
  if (['push', 'cover', 'pull'].includes(effect)) return 'pptx-tr-push';
  if (['zoom', 'random', 'wheel', 'circle', 'newsflash'].includes(effect)) return 'pptx-tr-zoom';
  if (['split', 'blinds', 'checker', 'comb', 'randombar', 'strips', 'wedge'].includes(effect)) return 'pptx-tr-split';
  return 'pptx-tr-fade';
}

function directionVars(transition, style) {
  const direction = String(transition?.direction || 'r').toLowerCase();
  const offsets = { r: ['38px', '0px'], l: ['-38px', '0px'], d: ['0px', '38px'], u: ['0px', '-38px'] };
  const [x, y] = offsets[direction] || offsets.r;
  style.setProperty('--pptx-tr-x', x);
  style.setProperty('--pptx-tr-y', y);
}

export function pptxSlideMarkup(aspect = 16 / 9) {
  const ratio = Number(aspect) > 0 ? Number(aspect) : 16 / 9;
  const id = `pptx-stage-${++stageSeq}`;
  return `<div class="pptx-slide" id="${id}" style="--pptx-aspect:${ratio}">
    <div class="pptx-slide-render"></div>
  </div>`;
}

/**
 * Mount a single-slide PowerPoint viewer in `container`.
 * Returns { render(index, transition), destroy() }.
 */
export async function mountPptxSlide(container, url, aspect = 16 / 9, options = {}) {
  if (!url) throw new Error('This material does not have an original PowerPoint file.');

  container.innerHTML = pptxSlideMarkup(aspect);
  const host = container.querySelector('.pptx-slide-render');
  let viewer = null;
  let timers = [];
  let disposed = false;

  try {
    const [{ PptxViewer, RECOMMENDED_ZIP_LIMITS }, buffer] = await Promise.all([
      engineModule(), deckBuffer(url)
    ]);
    if (disposed) return null;
    viewer = await PptxViewer.open(buffer, host, {
      renderMode: 'slide',
      zipLimits: RECOMMENDED_ZIP_LIMITS,
      externalMedia: 'block',
      pdfjs: false,
      fitMode: 'contain',
      onSlideError: (_index, error) => console.warn('[eduplay] slide render error', error)
    });
    if (disposed) { viewer.destroy(); return null; }
    await viewer.goToSlide(Math.max(0, Number(options.initialSlide) || 0));
  } catch (error) {
    if (viewer?.destroy) viewer.destroy();
    container.innerHTML = `<div class="pptx-error"><div class="big">📽️</div>
      <strong>The original slide could not be rendered.</strong>
      <p class="muted small">${String(error?.message || error)}</p></div>`;
    throw error;
  }

  return {
    async render(index, transition) {
      if (!viewer || disposed) return;
      const target = Math.max(0, Math.min(viewer.slideCount - 1, Number(index) || 0));
      timers.forEach(clearTimeout);
      timers = [];
      const cls = effectClass(transition);
      host.classList.remove(...TRANSITION_CLASSES);
      if (cls) {
        void host.offsetWidth;
        const duration = SPEED_MS[String(transition?.speed || 'med').toLowerCase()] || SPEED_MS.med;
        host.style.setProperty('--pptx-tr-duration', `${duration}ms`);
        directionVars(transition, host.style);
        host.classList.add(cls);
        timers.push(setTimeout(() => host.classList.remove(...TRANSITION_CLASSES), duration + 40));
      }
      await viewer.goToSlide(target);
    },
    destroy() {
      disposed = true;
      timers.forEach(clearTimeout);
      timers = [];
      if (viewer?.destroy) viewer.destroy();
      viewer = null;
      container.innerHTML = '';
    }
  };
}
