// Browser-only PDF rendering + OCR. Both libraries are vendored locally so
// story creation still works offline and never depends on a public CDN.

const PDF_MODULE = '/vendor/pdfjs/pdf.min.mjs';
const PDF_WORKER = '/vendor/pdfjs/pdf.worker.min.mjs';
const TESSERACT_SCRIPT = '/vendor/tesseract/tesseract.min.js';
const TESSERACT_WORKER = '/vendor/tesseract/worker.min.js';
const TESSERACT_CORE = '/vendor/tesseract/tesseract-core-simd-lstm.wasm.js';
const TESSERACT_LANG = '/vendor/tesseract/lang';

let pdfjsPromise = null;
let ocrWorker = null;
let ocrLang = '';

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDF_MODULE).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      return lib;
    });
  }
  return pdfjsPromise;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('The local OCR engine could not be loaded.'));
    document.head.appendChild(script);
  });
}

function tidyOcr(text) {
  return String(text || '')
    .replace(/\u000c/g, '\n')
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .join('\n')
    .slice(0, 20000);
}

async function ensureOcrWorker(language) {
  await loadScript(TESSERACT_SCRIPT);
  if (!window.Tesseract?.createWorker) throw new Error('The local OCR engine is unavailable.');
  const lang = language === 'Filipino' ? 'fil' : 'eng';
  if (ocrWorker && ocrLang === lang) return ocrWorker;
  if (ocrWorker) { try { await ocrWorker.terminate(); } catch { /* ignore */ } }
  ocrWorker = null;
  ocrWorker = await window.Tesseract.createWorker(lang, 1, {
    workerPath: TESSERACT_WORKER,
    corePath: TESSERACT_CORE,
    langPath: TESSERACT_LANG
  });
  await ocrWorker.setParameters({ tessedit_pageseg_mode: '6' });
  ocrLang = lang;
  return ocrWorker;
}

async function recognise(canvas, language) {
  const worker = await ensureOcrWorker(language);
  const result = await worker.recognize(canvas);
  return tidyOcr(result?.data?.text || '');
}

export async function closeOcrWorker() {
  if (!ocrWorker) return;
  try { await ocrWorker.terminate(); } catch { /* ignore */ }
  ocrWorker = null;
  ocrLang = '';
}

/** Move rendered canvas previews to /media before saving the story record. */
export async function persistPagePreviews(pages, ctx, onProgress) {
  for (let start = 0; start < pages.length; start += 20) {
    const chunk = pages.slice(start, start + 20);
    const images = chunk.map((page) => page.preview_data).filter(Boolean);
    if (!images.length) continue;
    const result = await ctx.api('/api/story-previews', { method: 'POST', body: { images } });
    chunk.filter((page) => page.preview_data).forEach((page, i) => {
      page.preview_url = result.urls[i];
      delete page.preview_data;
    });
    onProgress?.({ done: Math.min(start + 20, pages.length), total: pages.length });
  }
}

/**
 * Render every PDF page to a canvas with PDF.js. Text layers are preferred;
 * image-only pages fall back to local OCR. The original page image is always
 * kept, including when OCR fails, so a scan never becomes a blank page.
 */
export async function buildPdfStoryPages(file, { language = 'English', maxPages = 80, onProgress } = {}) {
  if (!file) throw new Error('Choose a PDF file first.');
  const isPdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
  if (!isPdf) throw new Error('Only PDF storybooks can be rendered as flip-book pages.');
  const lib = await pdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const total = Math.min(pdf.numPages, maxPages);
  const pages = [];
  const ocrFailures = [];
  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    const extracted = tidyOcr((textContent.items || [])
      .map((item) => item?.str || '').join(' ')
      .replace(/\s+\.\s*/g, '. '));
    let text = extracted;
    let sourceType = 'pdf_text';
    let ocrStatus = 'none';
    let ocrError = '';
    if (text.replace(/\s/g, '').length < 24) {
      try {
        text = await recognise(canvas, language);
        sourceType = text ? 'pdf_ocr' : 'pdf_text';
        ocrStatus = text ? 'ready' : 'failed';
        ocrError = text ? '' : 'OCR could not find readable words on this page. The original page image is preserved.';
      } catch (error) {
        text = '';
        sourceType = 'pdf_text';
        ocrStatus = 'failed';
        ocrError = String(error?.message || 'OCR failed.').slice(0, 300);
      }
      if (ocrStatus === 'failed') ocrFailures.push(pageNumber);
    }

    pages.push({
      page_number: pageNumber,
      title: `Page ${pageNumber}`,
      text,
      html: '',
      preview_data: canvas.toDataURL('image/jpeg', 0.72),
      source_type: sourceType,
      ocr_status: ocrStatus,
      ocr_error: ocrError
    });
    onProgress?.({ done: pageNumber, total });
  }
  return {
    pages,
    pageCount: pdf.numPages,
    truncated: pdf.numPages > maxPages,
    ocrFailures
  };
}
