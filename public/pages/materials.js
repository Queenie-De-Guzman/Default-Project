import { esc, formatDate } from '../ui.js';
import { readingSpeech } from '../reading.js';
import { highlightHtml } from '../highlight.js';
import { teacherGuideHtml } from '../teacherguide.js';
import { mountPptxSlide, pptxSlideMarkup, pptxEngineAvailable } from '../presentation-engine.js';

const STATUS_LABELS = {
  uploading: 'Uploading', extracting: 'Extracting content', analyzing: 'Analyzing lesson',
  generating_games: 'Generating games', ready: 'Ready for review', failed: 'Failed processing'
};

const STATUS_CLASS = {
  uploading: 'chip-sky', extracting: 'chip-indigo', analyzing: 'chip-indigo',
  generating_games: 'chip-pink', ready: 'chip-green', failed: 'chip-red'
};

const DEFAULT_PREFS = {
  narrationLang: 'en-US', narrationRate: 0.9, narrationVolume: 0.9, voiceURI: '',
  highlightStyle: 'word', highlightColor: '#fde68a'
};

async function ensureMeta(ctx) {
  if (!ctx.state.meta) ctx.state.meta = await ctx.api('/api/meta');
  return ctx.state.meta;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), location.href);
    return ['http:', 'https:', 'data:image/', 'blob:'].some((prefix) => url.protocol === prefix
      || (prefix === 'data:image/' && url.href.startsWith('data:image/')))
      && !url.href.startsWith('data:text/html') ? url.href : '';
  } catch { return ''; }
}

const formatBytes = (bytes) => bytes > 1024 * 1024
  ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const statusChip = (status) => `<span class="chip ${STATUS_CLASS[status] || 'chip'}">${esc(STATUS_LABELS[status] || status)}</span>`;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file. Try again.'));
    reader.readAsDataURL(file);
  });
}

const STATUS_PROGRESS = {
  uploading: 12, extracting: 38, analyzing: 68, generating_games: 88, ready: 100, failed: 100
};

function progressHtml(status, error = '') {
  const label = STATUS_LABELS[status] || status || 'Queued';
  const percent = STATUS_PROGRESS[status] ?? 5;
  return `<div class="lm-progress ${status === 'failed' ? 'lm-progress-error' : ''}">
    <div class="bar"><span style="width:${percent}%"></span></div>
    <span class="muted tiny">${esc(label)}${error && status === 'failed' ? ` — ${esc(error)}` : ''}</span>
  </div>`;
}

function sizeLabel(material) {
  const size = Number(material.file_size ?? material.file_size_bytes ?? material.size);
  return size > 0 ? formatBytes(size) : 'Size unknown';
}

function metadataChips(material) {
  const labels = [
    ['grade_level', material.grade_level], ['subject', material.subject], ['topic', material.topic],
    ['language', material.language], ['reading_level', material.reading_level], ['quarter', material.quarter]
  ];
  const chips = labels.filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `<span class="chip lm-meta-chip" data-meta="${key}">${esc(value)}</span>`);
  return chips.length ? `<div class="lm-meta-chips row wrap">${chips.join('')}</div>` : '';
}

function optionsFrom(items, selected = '', allLabel = 'All') {
  const unique = [...new Set((items || []).map((item) => String(item ?? '')).filter(Boolean))];
  return `<option value="">${esc(allLabel)}</option>${unique.map((value) =>
    `<option value="${esc(value)}" ${String(selected) === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
}

function materialsQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) params.set(key, String(value).trim());
  });
  const query = params.toString();
  return query ? `/api/materials?${query}` : '/api/materials';
}

function objectivesFrom(material) {
  if (Array.isArray(material.objectives) && material.objectives.length) {
    return material.objectives.map((o) => (typeof o === 'string' ? o : o.title || '')).filter(Boolean).join('\n');
  }
  if (material.objectives) return String(material.objectives);
  return (material.analysis?.objectives || []).map((o) => (typeof o === 'string' ? o : o.title || '')).filter(Boolean).join('\n');
}

function slideStage(slide, prefs) {
  const layout = slide?.layout || {};
  const shapes = Array.isArray(layout.shapes) ? layout.shapes : [];
  const baseW = Number(layout.width) || 960;
  const baseH = Number(layout.height) || 540;
  const color = String(prefs.highlightColor || '#fde68a');
  if (shapes.length) {
    return `<div class="lm-slide-canvas" style="aspect-ratio:${baseW}/${baseH};background:${esc(layout.background || '#ffffff')}">
      ${shapes.map((shape) => {
        const x = Math.max(0, Number(shape.x) || 0) / baseW * 100;
        const y = Math.max(0, Number(shape.y) || 0) / baseH * 100;
        const w = Math.max(0, Number(shape.w) || 100) / baseW * 100;
        const h = Math.max(0, Number(shape.h) || 30) / baseH * 100;
        const style = `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
        if (shape.type === 'image' || shape.src) {
          const src = safeUrl(shape.src);
          return src ? `<img class="lm-shape-img" style="${style}" src="${esc(src)}" alt="${esc(shape.alt || 'Slide image')}">`
            : `<div class="lm-shape-missing" style="${style}">🖼️ Image unavailable</div>`;
        }
        const runs = Array.isArray(shape.runs) ? shape.runs : [];
        const label = runs.length
          ? runs.map((r) => `<span style="${r.size ? `font-size:clamp(.5rem,${Number(r.size) / 100 * 1.3}vw,2.2rem);` : ''}${r.bold ? 'font-weight:800;' : ''}${r.italic ? 'font-style:italic;' : ''}${r.color ? `color:#${esc(String(r.color).replace('#', ''))};` : ''}${r.font ? `font-family:${esc(r.font)},sans-serif;` : ''}">${esc(r.text || '')}</span>`).join('')
          : esc(shape.text || '');
        return `<div class="lm-shape-text" style="${style};text-align:${esc(shape.align || 'left')}">${label}</div>`;
      }).join('')}
      <style>.lm-word.lm-active{background:${color};border-radius:3px}</style>
    </div>`;
  }
  return `<div class="lm-slide-fallback">
    <div class="lm-slide-title">${esc(slide?.title || 'Untitled slide')}</div>
    <div class="lm-slide-text" data-highlight-root style="--lm-highlight:${esc(color)}">${highlightHtml(slide?.text || '', prefs.highlightStyle, 'lm-word', 'lm-active') || '<span class="lm-muted">No text extracted for this slide yet.</span>'}</div>
    ${slide?.notes ? `<div class="lm-slide-notes"><strong>Speaker notes</strong><p>${esc(slide.notes)}</p></div>` : ''}
  </div>`;
}

function voiceSelect(prefs, voices, id = 'lm-voice') {
  return `<select id="${id}"><option value="">Default voice</option>${voices.map((v) =>
    `<option value="${esc(v.voiceURI)}" ${v.voiceURI === prefs.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>`;
}

export async function materialsPage(ctx) {
  await ensureMeta(ctx);
  const [, id] = ctx.params;
  if (id) return materialDetailPage(ctx, id);
  return materialsListView(ctx, {
    title: 'My Learning Materials',
    heading: 'Teaching materials',
    intro: 'One upload, many uses. Import a PPT/PPTX, PDF, DOCX, text file or image, then use it for slides, narration, reading text and games.'
  });
}

export async function presentationHubPage(ctx) {
  return materialsListView(ctx, {
    title: 'PPT & Lesson Reader',
    heading: 'Presentations',
    intro: 'Import slide decks and open them in the reader to review narration, highlight text and generate games.',
    presentationOnly: true
  });
}

function uploadMetadataFields() {
  return `<div class="form-grid lm-upload-meta">
    <label class="field full">Description <textarea name="description" rows="2" placeholder="What is this material about?"></textarea></label>
    <label class="field">Grade level <input name="grade_level" placeholder="Grade 4"></label>
    <label class="field">Subject <input name="subject" placeholder="Science"></label>
    <label class="field">Topic <input name="topic" placeholder="The water cycle"></label>
    <label class="field">Language <select name="language"><option>English</option><option>Filipino</option></select></label>
    <label class="field">Reading level <input name="reading_level" placeholder="Grade 4 / Intermediate"></label>
    <label class="field">Quarter <select name="quarter"><option value="">Not set</option><option>Quarter 1</option><option>Quarter 2</option><option>Quarter 3</option><option>Quarter 4</option></select></label>
  </div>`;
}

async function materialsListView(ctx, options) {
  await ensureMeta(ctx);
  const presentationOnly = Boolean(options.presentationOnly);
  const forcedKind = presentationOnly ? 'presentation' : '';
  const initial = await ctx.api(materialsQuery({ kind: forcedKind }));
  const materials = (Array.isArray(initial) ? initial : []).filter((m) => !presentationOnly || m.kind === 'presentation');
  const classes = await ctx.api('/api/classes');
  const meta = ctx.state.meta;
  const accept = (meta.fileTypes || []).map((f) => `.${f.ext}`).join(',');
  const kindOptions = ['presentation', 'document', 'text', 'image'];

  const filterFields = () => ({
    search: elValue('#lm-search'), grade: elValue('#lm-filter-grade'), subject: elValue('#lm-filter-subject'),
    topic: elValue('#lm-filter-topic'), language: elValue('#lm-filter-language'),
    reading_level: elValue('#lm-filter-reading'), kind: presentationOnly ? forcedKind : elValue('#lm-filter-kind'),
    status: elValue('#lm-filter-status')
  });
  function elValue(selector) {
    const node = document.querySelector(selector);
    return node ? node.value.trim() : '';
  }

  return {
    title: options.title,
    html: `<div class="stack">
      <div class="notice notice-info"><span>${presentationOnly ? '📽️' : '📂'}</span><div><strong>${esc(options.heading)}.</strong> ${esc(options.intro)}</div></div>
      <div class="section-head"><div><h2>${esc(options.heading)}</h2><p class="muted small" id="lm-count">${materials.length} saved item${materials.length === 1 ? '' : 's'}</p></div>
        <button class="btn btn-primary" id="lm-upload">+ ${presentationOnly ? 'Upload presentation' : 'Import material'}</button></div>
      <div class="filters lm-filters card card-pad">
        <input id="lm-search" class="search" placeholder="Search title or file name…" aria-label="Search materials">
        <select id="lm-filter-grade" aria-label="Filter by grade">${optionsFrom(materials.map((m) => m.grade_level), '', 'All grades')}</select>
        <select id="lm-filter-subject" aria-label="Filter by subject">${optionsFrom(materials.map((m) => m.subject), '', 'All subjects')}</select>
        <select id="lm-filter-topic" aria-label="Filter by topic">${optionsFrom(materials.map((m) => m.topic), '', 'All topics')}</select>
        <select id="lm-filter-language" aria-label="Filter by language">${optionsFrom(materials.map((m) => m.language), '', 'All languages')}</select>
        <select id="lm-filter-reading" aria-label="Filter by reading level">${optionsFrom(materials.map((m) => m.reading_level), '', 'All reading levels')}</select>
        ${presentationOnly ? '' : `<select id="lm-filter-kind" aria-label="Filter by type"><option value="">All types</option>${kindOptions.map((k) => `<option value="${k}">${esc(k[0].toUpperCase() + k.slice(1))}</option>`).join('')}</select>`}
        <select id="lm-filter-status" aria-label="Filter by status"><option value="">All statuses</option>${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}">${esc(label)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="lm-reset">Reset</button>
      </div>
      <div id="lm-list" class="grid grid-3">${materials.map(materialCard).join('') || `<div class="empty card"><div class="big">${presentationOnly ? '📽️' : '📂'}</div><h3>No ${presentationOnly ? 'presentations' : 'materials'} yet</h3><p>Upload a file to get started.</p></div>`}</div>
    </div>`,
    mount(el) {
      let items = materials;
      const list = el.querySelector('#lm-list');
      const count = el.querySelector('#lm-count');
      let searchTimer;

      const bindRows = () => {
        list.querySelectorAll('[data-present]').forEach((b) => b.addEventListener('click', async () => {
          b.disabled = true; b.textContent = 'Starting…';
          try {
            const session = await ctx.api(`/api/materials/${b.dataset.present}/presentations`, { method: 'POST', body: {} });
            ctx.toast(`Presenter View started. Students join with code ${session.code}.`, 'success');
            ctx.go(`teacher/present/${session.code}`);
          } catch (error) {
            ctx.toast(error.message, 'error'); b.disabled = false; b.textContent = '▶ Present';
          }
        }));
        list.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', async () => {
          b.disabled = true; b.textContent = 'Retrying…';
          try { await ctx.api(`/api/materials/${b.dataset.retry}/reprocess`, { method: 'POST' }); ctx.toast('Processing finished. Review the material.', 'success'); ctx.render(); }
          catch (error) { ctx.toast(error.message, 'error'); b.disabled = false; b.textContent = 'Retry'; }
        }));
        list.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
          if (!await ctx.confirmDialog('Delete this material? Games already saved will remain in your library.')) return;
          try { await ctx.api(`/api/materials/${b.dataset.delete}`, { method: 'DELETE' }); ctx.toast('Material deleted.', 'success'); ctx.render(); }
          catch (error) { ctx.toast(error.message, 'error'); }
        }));
      };
      const paint = () => {
        list.innerHTML = items.map(materialCard).join('') || '<div class="empty"><div class="big">🔎</div><h3>No materials match these filters</h3><p>Try a different filter or upload a new file.</p></div>';
        count.textContent = `${items.length} saved item${items.length === 1 ? '' : 's'}`;
        bindRows();
      };
      const load = async () => {
        try {
          items = await ctx.api(materialsQuery(filterFields()));
          if (!Array.isArray(items)) items = [];
          if (presentationOnly) items = items.filter((m) => m.kind === 'presentation');
          paint();
        } catch (error) { ctx.toast(error.message, 'error'); }
      };
      const filterSelectors = ['#lm-filter-grade', '#lm-filter-subject', '#lm-filter-topic', '#lm-filter-language', '#lm-filter-reading', '#lm-filter-status'];
      if (!presentationOnly) filterSelectors.push('#lm-filter-kind');
      filterSelectors.forEach((selector) => el.querySelector(selector).addEventListener('change', load));
      el.querySelector('#lm-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 180); });
      el.querySelector('#lm-reset').addEventListener('click', () => {
        ['#lm-search', ...filterSelectors].forEach((selector) => { el.querySelector(selector).value = ''; });
        load();
      });
      bindRows();

      el.querySelector('#lm-upload').addEventListener('click', async () => {
        const body = await ctx.modal(presentationOnly ? 'Upload a presentation' : 'Import teaching material', `<form id="lm-upload-form" class="stack">
          <div class="lm-drop" id="lm-drop" role="button" tabindex="0" aria-label="Drop a file here or press Enter to browse">
            <div class="lm-drop-icon">📥</div><strong>Drop your file here</strong>
            <span class="muted small" id="lm-drop-note">or click to browse — drag-and-drop works too</span>
          </div>
          <label class="field">Title <input name="title" placeholder="Leave blank to use the file name"></label>
          <label class="field">Choose file <input name="file" type="file" accept="${esc(accept)}"></label>
          <label class="field">Or paste text instead <textarea name="pasted" rows="4" placeholder="Paste lesson or story text here"></textarea></label>
          ${uploadMetadataFields()}
          <label class="field">Save to class <select name="class_id"><option value="">My library only</option>${classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
          <div class="hint">Supported: PPT, PPTX, PDF, DOCX, TXT, MD, HTML, CSV and images. Maximum ${formatBytes(Number(meta.maxUploadBytes || 12 * 1024 * 1024))}. Use only material you own or are licensed to teach.</div>
          <div id="lm-upload-status" class="notice notice-info"><span>📥</span><div>Ready to upload. Processing status will appear here.</div></div>
          <button class="btn btn-primary btn-lg" type="submit" style="display:none">Import</button>
        </form>`, { wide: true, persistent: true });
        if (!body) return;
        const form = body.querySelector('#lm-upload-form');
        const status = body.querySelector('#lm-upload-status');
        const fileInput = form.querySelector('[name=file]');
        const pasted = form.querySelector('[name=pasted]');
        const drop = body.querySelector('#lm-drop');
        const dropNote = body.querySelector('#lm-drop-note');
        const submit = form.querySelector('button[type=submit]');
        let droppedFile = null;
        const setStatus = (icon, message, className = 'notice notice-info') => {
          status.className = className;
          status.innerHTML = `<span>${icon}</span><div>${message}</div>`;
        };
        const allowed = (file) => !accept || accept.split(',').some((ext) => file.name.toLowerCase().endsWith(ext.trim().toLowerCase()));
        const toggle = () => {
          const hasFile = Boolean(droppedFile || fileInput.files.length) || Boolean(pasted.value.trim());
          submit.style.display = hasFile ? 'inline-flex' : 'none';
        };
        const chooseFile = (file) => {
          if (!file) return;
          if (!allowed(file)) { ctx.toast('That file type is not supported here.', 'error'); return; }
          droppedFile = file; pasted.value = '';
          drop.classList.add('lm-drop-selected');
          dropNote.textContent = `${file.name} — ${formatBytes(file.size)}`;
          setStatus('📥', `<strong>${esc(STATUS_LABELS.uploading)}</strong> — ready to extract content and analyze this lesson.`);
          toggle();
        };
        drop.addEventListener('click', () => fileInput.click());
        drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
        ['dragenter', 'dragover'].forEach((event) => drop.addEventListener(event, (e) => { e.preventDefault(); drop.classList.add('lm-drop-over'); }));
        ['dragleave', 'dragend'].forEach((event) => drop.addEventListener(event, () => drop.classList.remove('lm-drop-over')));
        drop.addEventListener('drop', (e) => {
          e.preventDefault(); drop.classList.remove('lm-drop-over');
          chooseFile([...(e.dataTransfer?.files || [])][0]);
        });
        fileInput.addEventListener('change', () => {
          droppedFile = fileInput.files[0] || null;
          if (droppedFile) { pasted.value = ''; dropNote.textContent = `${droppedFile.name} — ${formatBytes(droppedFile.size)}`; drop.classList.add('lm-drop-selected'); }
          toggle();
        });
        pasted.addEventListener('input', () => { if (pasted.value.trim()) { droppedFile = null; fileInput.value = ''; drop.classList.remove('lm-drop-selected'); } toggle(); });
        toggle();
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const file = droppedFile || fileInput.files[0] || null;
          if (!file && !pasted.value.trim()) return ctx.toast('Choose a file or paste some text first.', 'error');
          submit.disabled = true;
          setStatus('⏳', `<strong>${esc(STATUS_LABELS.uploading)}…</strong> Extracting content and analyzing the lesson.`);
          try {
            let fileName; let mime; let dataUrl;
            if (file) {
              if (file.size > Number(meta.maxUploadBytes || 12 * 1024 * 1024)) throw new Error('That file is larger than the upload limit.');
              fileName = file.name; mime = file.type || ''; dataUrl = await fileToDataUrl(file);
            } else {
              const text = pasted.value.trim();
              fileName = 'pasted-lesson.txt'; mime = 'text/plain';
              dataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
            }
            const values = Object.fromEntries(new FormData(form));
            const payload = {
              dataUrl, fileName, mime,
              title: String(values.title || '').trim(),
              class_id: values.class_id || null,
              description: values.description || '',
              grade_level: values.grade_level || '', subject: values.subject || '', topic: values.topic || '',
              language: values.language || '', reading_level: values.reading_level || '', quarter: values.quarter || ''
            };
            if (file) payload.file_size = file.size;
            if (presentationOnly) payload.kind = 'presentation';
            setStatus('⏳', `<strong>${esc(STATUS_LABELS.extracting)}…</strong> Analyzing the lesson and preparing slides.`);
            const result = await ctx.api('/api/materials', { method: 'POST', body: payload });
            const label = STATUS_LABELS[result.status] || STATUS_LABELS.uploading;
            setStatus(result.status === 'failed' ? '⚠️' : '✅',
              result.status === 'failed'
                ? `<strong>${esc(label)}</strong> — ${esc(result.error || 'Review or retry from the material card.')}`
                : `<strong>${esc(label)}</strong> — ${esc(result.title)} has ${result.slides?.length || 0} slide${result.slides?.length === 1 ? '' : 's'}.`,
              result.status === 'failed' ? 'notice' : 'notice notice-green');
            ctx.toast(result.status === 'failed' ? 'Processing failed. Review the material.' : 'Material imported and analyzed.', result.status === 'failed' ? 'error' : 'success');
            items = [result, ...items.filter((item) => item.id !== result.id)];
            paint();
            body.close();
          } catch (error) {
            ctx.toast(error.message, 'error');
            setStatus('⚠️', esc(error.message), 'notice');
          } finally { submit.disabled = false; }
        });
      });
    }
  };
}

function materialCard(m) {
  return `<div class="card card-pad card-hover lm-material-card">
    <div class="row-between"><span style="font-size:1.8rem">${m.kind === 'presentation' ? '📽️' : m.kind === 'image' ? '🖼️' : '📄'}</span>${statusChip(m.status)}</div>
    <h3 style="margin:.6rem 0 .2rem">${esc(m.title)}</h3>
    <div class="muted tiny lm-card-facts">${esc((m.format || m.kind || 'file').toUpperCase())} • ${esc(sizeLabel(m))} • ${m.slideCount} slide${m.slideCount === 1 ? '' : 's'} • Uploaded ${formatDate(m.created_at || m.updated_at, true)}</div>
    ${metadataChips(m)}
    ${progressHtml(m.status, m.error)}
    <div class="row wrap" style="margin-top:.8rem">
      <button class="btn btn-sm btn-primary" data-nav="teacher/materials/${m.id}">Open reader</button>
      ${m.kind === 'presentation' && ['pptx', 'ppt'].includes(m.format) && m.status === 'ready'
        ? `<button class="btn btn-sm btn-soft" data-present="${m.id}">▶ Present</button>` : ''}
      <button class="btn btn-sm btn-soft" data-nav="teacher/generator?material=${m.id}">Use in generator</button>
      ${m.status === 'failed' ? `<button class="btn btn-sm btn-soft" data-retry="${m.id}">Retry</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-delete="${m.id}">Delete</button>
    </div>
  </div>`;
}

async function materialDetailPage(ctx, id) {
  const [material, classes, preferences] = await Promise.all([
    ctx.api(`/api/materials/${id}`), ctx.api('/api/classes'), ctx.api('/api/preferences')
  ]);
  const prefs = { ...DEFAULT_PREFS, ...(material.preferences || {}), ...preferences };
  const meta = ctx.state.meta;
  const speech = readingSpeech;
  let index = 0;
  let playingAll = false;
  let generation = 0;
  let voices = [];
  const sourceUrl = material.presentation_url || material.file_url || '';
  let useOriginal = material.kind === 'presentation' && ['pptx', 'ppt'].includes(material.format)
    && material.slides.length > 0 && Boolean(sourceUrl);
  const firstLayout = material.slides[0]?.layout || {};
  const aspect = (Number(firstLayout.width) || 960) / (Number(firstLayout.height) || 540);
  let deck = null;

  const currentSlide = () => material.slides[index] || null;
  const setStatus = (message) => {
    const target = document.querySelector('#lm-status-text');
    if (target) target.textContent = message;
  };
  const clearHighlights = () => document.querySelectorAll('[data-active-class]').forEach((el) => el.classList.remove(el.dataset.activeClass || 'lm-active'));
  const highlightAt = (charIndex) => {
    const root = document.querySelector('[data-highlight-root]') || document.querySelector('.lm-slide-canvas');
    if (!root) return;
    clearHighlights();
    const node = [...root.querySelectorAll('[data-start]')].find((el) => Number(el.dataset.start) <= charIndex && charIndex < Number(el.dataset.end));
    if (node) { node.classList.add(node.dataset.activeClass || 'lm-active'); node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  };
  const speakCurrent = (onEnd) => {
    const slide = currentSlide();
    const text = String(slide?.narration_script || slide?.text || '').trim();
    if (!text) { if (onEnd) onEnd(); return false; }
    const token = generation;
    return speech.speak({
      text, lang: prefs.narrationLang, rate: Number(prefs.narrationRate), volume: Number(prefs.narrationVolume), voiceURI: prefs.voiceURI,
      onBoundary: (event) => { if (token === generation && !(slide?.narration_script || '').trim()) highlightAt(event.charIndex); },
      onEnd: () => { clearHighlights(); if (token === generation && onEnd) onEnd(); },
      onError: () => { clearHighlights(); if (token === generation && onEnd) onEnd(); }
    });
  };
  const stopSpeech = () => { generation += 1; playingAll = false; speech.stop(); clearHighlights(); setStatus('Narration stopped.'); };
  const updateButtons = () => {
    const play = document.querySelector('#lm-play');
    if (play) play.textContent = speech.isPaused() ? '▶ Resume' : '▶ Read slide';
  };

  const paintSlide = () => {
    const slide = currentSlide();
    const stage = document.querySelector('#lm-stage');
    const counter = document.querySelector('#lm-counter');
    if (!stage) return;
    if (useOriginal && slide) {
      deck?.render(index, slide.transition);
    } else {
      stage.innerHTML = slide ? slideStage(slide, prefs)
        : `<div class="empty"><div class="big">📭</div><h3>No slides extracted</h3><p>Edit the extracted text below or reprocess the material.</p></div>`;
    }
    if (counter) counter.textContent = material.slides.length ? `Slide ${index + 1} of ${material.slides.length}` : 'No slides';
    const prev = document.querySelector('#lm-prev'); const next = document.querySelector('#lm-next');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= material.slides.length - 1;
    const title = document.querySelector('#lm-slide-title');
    if (title) title.textContent = slide?.title || `Slide ${index + 1}`;
    const notes = document.querySelector('#lm-notes');
    if (notes) notes.innerHTML = slide?.notes ? `<strong>Speaker notes</strong><p>${esc(slide.notes)}</p>` : '<span class="muted small">No speaker notes for this slide.</span>';
    const script = document.querySelector('#lm-narration-script');
    if (script) {
      script.value = slide?.narration_script || '';
      script.placeholder = slide?.text || 'Write a narration script for this slide…';
      const label = document.querySelector('#lm-narration-title');
      if (label) label.textContent = slide?.title || `Slide ${index + 1}`;
    }
    const thumbs = document.querySelectorAll('[data-slide-index]');
    thumbs.forEach((b) => b.classList.toggle('active', Number(b.dataset.slideIndex) === index));
    updateButtons();
  };

  const goTo = (next) => {
    if (!material.slides.length) return;
    index = Math.min(material.slides.length - 1, Math.max(0, next));
    stopSpeech();
    paintSlide();
  };

  return {
    title: material.title,
    html: `<div class="stack">
      <div class="row-between wrap">
        <div><button class="btn btn-sm btn-ghost" data-nav="teacher/materials">← All materials</button>
          <h2 style="margin:.5rem 0 .2rem">${esc(material.title)}</h2>
          <div class="row wrap">${statusChip(material.status)}<span class="muted tiny">${esc(material.file_name || '')} • Updated ${formatDate(material.updated_at, true)}</span></div></div>
        <div class="row wrap">
          <button class="btn btn-sm btn-soft" id="lm-analyze">Analyze content</button>
          <button class="btn btn-sm btn-soft" id="lm-prefs">Narration & highlight</button>
          <button class="btn btn-sm btn-soft" id="lm-assign">Assign</button>
          <button class="btn btn-sm btn-soft" id="lm-save-lesson">Save to My Lessons</button>
          ${material.kind === 'presentation' && ['pptx', 'ppt'].includes(material.format) && material.slides.length
            ? `<button class="btn btn-sm btn-primary" id="lm-present">▶ Start Presenter View</button>` : ''}
          <button class="btn btn-sm btn-primary" id="lm-games">Generate games</button>
        </div>
      </div>
      ${material.error ? `<div class="notice"><span>⚠️</span><div><strong>Processing error:</strong> ${esc(material.error)}
        <button class="btn btn-sm btn-soft" id="lm-retry">Retry without re-uploading</button></div></div>` : ''}
      <div class="lm-workspace">
        <aside class="lm-thumbnails">
          <div class="section-head"><h3>Slides</h3><span class="chip">${material.slides.length}</span></div>
          ${material.slides.map((s, i) => `<button class="lm-thumb ${i === 0 ? 'active' : ''}" data-slide-index="${i}">
            <span class="lm-thumb-num">${i + 1}</span><span class="ellipsis">${esc(s.title || `Slide ${i + 1}`)}</span>
            <small>${esc((s.text || '').slice(0, 48))}</small></button>`).join('') || '<p class="muted small">No slides yet.</p>'}
        </aside>
        <section class="lm-viewer card">
          <div class="lm-viewer-bar"><div><strong id="lm-slide-title">${esc(material.slides[0]?.title || 'Slide 1')}</strong>
            <span class="muted small" id="lm-counter">Slide ${material.slides.length ? 1 : 0} of ${material.slides.length}</span></div>
            <div class="row"><button class="btn btn-sm btn-ghost" id="lm-prev" ${material.slides.length < 2 ? 'disabled' : ''}>← Previous</button>
              <button class="btn btn-sm btn-ghost" id="lm-next" ${material.slides.length < 2 ? 'disabled' : ''}>Next →</button></div></div>
          <div id="lm-stage" class="lm-stage">${material.slides[0]
            ? (useOriginal ? pptxSlideMarkup(aspect) : slideStage(material.slides[0], prefs))
            : '<div class="empty"><div class="big">📭</div><h3>No slides extracted</h3></div>'}</div>
          <div class="lm-controls">
            <button class="btn btn-primary btn-sm" id="lm-play">▶ Read slide</button>
            <button class="btn btn-sm btn-soft" id="lm-read-all">📖 Read all</button>
            <button class="btn btn-sm btn-ghost" id="lm-pause">⏸ Pause</button>
            <button class="btn btn-sm btn-ghost" id="lm-resume">▶ Resume</button>
            <button class="btn btn-sm btn-ghost" id="lm-stop">⏹ Stop</button>
            <button class="btn btn-sm btn-ghost" id="lm-replay">↺ Replay</button>
            <label class="lm-inline">Language <select id="lm-lang"><option value="en-US" ${prefs.narrationLang === 'en-US' ? 'selected' : ''}>English</option><option value="fil-PH" ${prefs.narrationLang === 'fil-PH' ? 'selected' : ''}>Filipino</option></select></label>
            <label class="lm-inline">Rate <input id="lm-rate" type="range" min="0.5" max="1.5" step="0.1" value="${prefs.narrationRate}"></label>
            <label class="lm-inline">Volume <input id="lm-volume" type="range" min="0" max="1" step="0.1" value="${prefs.narrationVolume}"></label>
            <span id="lm-status-text" class="muted tiny">Narration uses this browser’s speech voices.</span>
          </div>
          <div class="lm-notes" id="lm-notes">${material.slides[0]?.notes ? `<strong>Speaker notes</strong><p>${esc(material.slides[0].notes)}</p>` : '<span class="muted small">No speaker notes for this slide.</span>'}</div>
          <div class="lm-edit-row"><button class="btn btn-sm btn-soft" id="lm-edit-slide">✏️ Edit slide text & notes</button>
            <button class="btn btn-sm btn-ghost" id="lm-edit-text">📝 Edit all extracted text</button></div>
        </section>
      </div>
      <div class="card card-pad lm-narration-panel">
        <div class="section-head"><div><h3>Narration script — <span id="lm-narration-title">${esc(material.slides[0]?.title || 'Slide 1')}</span></h3>
          <p class="muted small">Leave blank to read the slide text as-is. Scripts are saved per slide.</p></div>
          <button class="btn btn-sm btn-primary" id="lm-save-script">Save script</button></div>
        <textarea id="lm-narration-script" rows="4" placeholder="${esc(material.slides[0]?.text || 'Write a narration script for this slide…')}">${esc(material.slides[0]?.narration_script || '')}</textarea>
      </div>
      <div class="grid grid-2">
        <div class="card card-pad"><div class="section-head"><h3>AI analysis & Teacher’s Guide</h3><span class="chip chip-amber">Draft</span></div><div id="lm-analysis">${analysisHtml(material.analysis)}</div></div>
        <div class="card card-pad"><div class="section-head"><h3>Reuse this material</h3></div>
          <div class="stack"><button class="btn btn-soft" id="lm-story">📖 Create story from slides</button>
            <button class="btn btn-soft" id="lm-reprocess">🔄 Re-extract original file</button>
            <div class="hint">Saved games stay editable in the builder. Generated competencies are suggestions only; verify official codes yourself.</div></div></div>
      </div>
    </div>`,
    mount(el) {
      voices = speech.voices(prefs.narrationLang);
      if (useOriginal) {
        (async () => {
          try {
            if (!pptxEngineAvailable()) throw new Error('This browser cannot render the local PowerPoint viewer.');
            const stage = el.querySelector('#lm-stage');
            deck = await mountPptxSlide(stage, sourceUrl, aspect, { width: 1280 });
            paintSlide();
          } catch (error) {
            useOriginal = false;
            deck = null;
            ctx.toast(error.message, 'error');
            paintSlide();
          }
        })();
      }
      el.__cleanupPresentation = () => { stopSpeech(); deck?.destroy(); };
      el.querySelectorAll('[data-slide-index]').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.slideIndex))));
      el.querySelector('#lm-prev').addEventListener('click', () => goTo(index - 1));
      el.querySelector('#lm-next').addEventListener('click', () => goTo(index + 1));
      el.querySelector('#lm-play').addEventListener('click', () => { stopSpeech(); setStatus(speakCurrent() ? 'Reading current slide…' : 'No text to read on this slide.'); updateButtons(); });
      el.querySelector('#lm-read-all').addEventListener('click', () => {
        stopSpeech(); playingAll = true;
        const token = generation;
        const readNext = () => {
          if (!playingAll || token !== generation) return;
          if (index >= material.slides.length - 1) { playingAll = false; setStatus('Finished reading all slides.'); return; }
          index += 1; paintSlide();
          if (!speakCurrent(readNext)) readNext();
        };
        setStatus('Reading all slides…');
        if (!speakCurrent(readNext)) readNext();
      });
      el.querySelector('#lm-pause').addEventListener('click', () => { speech.pause(); setStatus('Narration paused.'); updateButtons(); });
      el.querySelector('#lm-resume').addEventListener('click', () => { speech.resume(); setStatus('Narration resumed.'); updateButtons(); });
      el.querySelector('#lm-stop').addEventListener('click', stopSpeech);
      el.querySelector('#lm-replay').addEventListener('click', () => { stopSpeech(); setStatus(speakCurrent() ? 'Replaying current slide…' : 'No text to replay.'); });
      const persistPrefs = async () => {
        const patch = {
          narrationLang: el.querySelector('#lm-lang').value,
          narrationRate: Number(el.querySelector('#lm-rate').value),
          narrationVolume: Number(el.querySelector('#lm-volume').value)
        };
        Object.assign(prefs, patch);
        try { await ctx.api('/api/preferences', { method: 'PUT', body: patch }); await ctx.api(`/api/materials/${material.id}`, { method: 'PUT', body: { preferences: patch } }); }
        catch (error) { ctx.toast(error.message, 'error'); }
      };
      el.querySelector('#lm-lang').addEventListener('change', async () => { await persistPrefs(); voices = speech.voices(prefs.narrationLang); });
      el.querySelector('#lm-rate').addEventListener('change', persistPrefs);
      el.querySelector('#lm-volume').addEventListener('change', persistPrefs);

      el.querySelector('#lm-save-script').addEventListener('click', async () => {
        const slide = currentSlide();
        if (!slide) return ctx.toast('There is no slide to save yet.', 'info');
        const button = el.querySelector('#lm-save-script');
        button.disabled = true;
        try {
          const updated = await ctx.api(`/api/materials/${material.id}/slides/${slide.id}`, {
            method: 'PUT', body: { narration_script: el.querySelector('#lm-narration-script').value }
          });
          material.slides[index] = { ...slide, ...updated };
          ctx.toast('Narration script saved.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
        finally { button.disabled = false; }
      });

      el.querySelector('#lm-save-lesson').addEventListener('click', async () => {
        const button = el.querySelector('#lm-save-lesson');
        button.disabled = true;
        try {
          const lesson = await ctx.api('/api/lessons', { method: 'POST', body: {
            title: material.title,
            grade_level: material.grade_level || material.analysis?.suggestedGrade || '',
            description: material.description || '',
            objectives: objectivesFrom(material),
            status: 'draft'
          } });
          const extractedText = material.extracted_text || material.slides.map((s) => `${s.title || ''}\n${s.text || ''}`.trim()).join('\n\n');
          await ctx.api(`/api/lessons/${lesson.id}`, { method: 'PUT', body: { extracted_text: extractedText } });
          ctx.toast('Saved as a draft lesson in My Lessons.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
        finally { button.disabled = false; }
      });

      el.querySelector('#lm-edit-slide').addEventListener('click', async () => {
        const slide = currentSlide();
        if (!slide) return ctx.toast('There is no slide to edit yet.', 'info');
        const body = await ctx.modal(`Edit slide ${index + 1}`, `<form id="lm-slide-form" class="stack">
          <label class="field">Title <input name="title" value="${esc(slide.title || '')}"></label>
          <label class="field">Slide text <textarea name="text" rows="7">${esc(slide.text || '')}</textarea></label>
          <label class="field">Narration script (optional) <textarea name="narration_script" rows="4">${esc(slide.narration_script || '')}</textarea></label>
          <label class="field">Speaker notes <textarea name="notes" rows="3">${esc(slide.notes || '')}</textarea></label>
          <label class="field">Image description (optional) <textarea name="description" rows="2">${esc(slide.description || '')}</textarea></label>
        </form>`);
        if (!body) return;
        const fields = Object.fromEntries(new FormData(body.querySelector('form')));
        try {
          const updated = await ctx.api(`/api/materials/${material.id}/slides/${slide.id}`, { method: 'PUT', body: fields });
          material.slides[index] = updated;
          paintSlide();
          ctx.toast('Slide saved.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#lm-edit-text').addEventListener('click', async () => {
        const body = await ctx.modal('Edit all extracted text', `<form class="stack"><label class="field">Extracted reading text
          <textarea name="text" rows="14">${esc(material.extracted_text || '')}</textarea></label>
          <div class="hint">Changes here also update future AI analysis for this material.</div></form>`);
        if (!body) return;
        try {
          const result = await ctx.api(`/api/materials/${material.id}`, { method: 'PUT', body: { extracted_text: new FormData(body.querySelector('form')).get('text') } });
          material.extracted_text = result.extracted_text;
          ctx.toast('Extracted text saved.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#lm-prefs').addEventListener('click', async () => {
        const body = await ctx.modal('Narration & highlighting', `<form id="lm-pref-form" class="form-grid">
          <label class="field">Language <select name="narrationLang"><option value="en-US" ${prefs.narrationLang === 'en-US' ? 'selected' : ''}>English</option><option value="fil-PH" ${prefs.narrationLang === 'fil-PH' ? 'selected' : ''}>Filipino</option></select></label>
          <label class="field">Voice ${voiceSelect(prefs, voices)}</label>
          <label class="field">Reading speed <input name="narrationRate" type="range" min="0.5" max="1.5" step="0.1" value="${prefs.narrationRate}"></label>
          <label class="field">Volume <input name="narrationVolume" type="range" min="0" max="1" step="0.1" value="${prefs.narrationVolume}"></label>
          <label class="field">Highlight style <select name="highlightStyle"><option value="word" ${prefs.highlightStyle === 'word' ? 'selected' : ''}>Word</option><option value="sentence" ${prefs.highlightStyle === 'sentence' ? 'selected' : ''}>Sentence</option></select></label>
          <label class="field">Highlight colour <input name="highlightColor" type="color" value="${esc(prefs.highlightColor)}"></label>
        </form>`);
        if (!body) return;
        const form = body.querySelector('form');
        const patch = Object.fromEntries(new FormData(form));
        patch.narrationRate = Number(patch.narrationRate); patch.narrationVolume = Number(patch.narrationVolume);
        patch.voiceURI = body.querySelector('#lm-voice').value;
        Object.assign(prefs, patch);
        try {
          await ctx.api('/api/preferences', { method: 'PUT', body: patch });
          await ctx.api(`/api/materials/${material.id}`, { method: 'PUT', body: { preferences: patch } });
          const slide = currentSlide();
          if (slide) el.querySelector('#lm-stage').innerHTML = slideStage(slide, prefs);
          ctx.toast('Preferences saved and will be reused.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#lm-assign').addEventListener('click', async () => {
        const body = await ctx.modal('Assign material to classes', `<form class="stack">
          ${classes.map((c) => `<label class="field checkbox"><input type="checkbox" name="class_id" value="${c.id}" ${(material.assignments || []).some((a) => a.class_id === c.id) ? 'checked' : ''}> ${esc(c.name)} — ${esc(c.grade_level)}</label>`).join('') || '<p class="muted">Create a class first.</p>'}
          <label class="field">Instructions <textarea name="instructions" rows="2">${esc(material.assignments?.[0]?.instructions || '')}</textarea></label>
        </form>`);
        if (!body) return;
        const form = body.querySelector('form');
        const class_ids = [...form.querySelectorAll('[name=class_id]:checked')].map((i) => Number(i.value));
        try {
          await ctx.api(`/api/materials/${material.id}/assign`, { method: 'POST', body: { class_ids, instructions: form.querySelector('[name=instructions]').value } });
          ctx.toast('Material assigned.', 'success'); ctx.render();
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#lm-present')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true; button.textContent = 'Starting…';
        try {
          const session = await ctx.api(`/api/materials/${material.id}/presentations`, { method: 'POST', body: {} });
          ctx.toast(`Presenter View started. Students join with code ${session.code}.`, 'success');
          ctx.go(`teacher/present/${session.code}`);
        } catch (error) {
          ctx.toast(error.message, 'error');
          button.disabled = false; button.textContent = '▶ Start Presenter View';
        }
      });

      el.querySelector('#lm-analyze').addEventListener('click', async () => {
        const btn = el.querySelector('#lm-analyze'); btn.disabled = true; btn.textContent = 'Analyzing…';
        try {
          const analysis = await ctx.api(`/api/materials/${material.id}/analyze`, { method: 'POST' });
          material.analysis = analysis;
          el.querySelector('#lm-analysis').innerHTML = analysisHtml(analysis);
          ctx.toast('Source-grounded analysis saved.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
        finally { btn.disabled = false; btn.textContent = 'Analyze content'; }
      });

      el.querySelector('#lm-games').addEventListener('click', async () => {
        const types = (meta.gameTypes || []).filter((g) => ['multiple_choice', 'matching', 'fill_blank', 'wordsearch', 'sequencing', 'true_false'].includes(g.type));
        const body = await ctx.modal('Generate games from this material', `<form class="stack"><div class="grid grid-2">
          ${types.map((t) => `<label class="field checkbox"><input type="checkbox" name="format" value="${esc(t.type)}" checked> ${esc(t.icon)} ${esc(t.title)}</label>`).join('')}
          </div><div class="hint">Questions come only from this material’s extracted text. Every game is saved as an editable draft.</div></form>`);
        if (!body) return;
        const formats = [...body.querySelectorAll('[name=format]:checked')].map((i) => i.value);
        try {
          const result = await ctx.api(`/api/materials/${material.id}/games`, { method: 'POST', body: { formats } });
          ctx.toast(`${result.gameIds.length} editable game draft${result.gameIds.length === 1 ? '' : 's'} created.`, 'success');
          ctx.go('teacher/games');
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#lm-story').addEventListener('click', async () => {
        const sections = material.slides.filter((s) => (s.text || '').trim()).map((s) => ({ title: s.title, text: s.text }));
        if (!sections.length) return ctx.toast('Add slide text before creating a story.', 'info');
        const body = await ctx.modal('Create a story from these slides', `<form class="stack">
          <label class="field">Story title <input name="title" value="${esc(material.title)}" required></label>
          <label class="field">Category <select name="category">${(meta.storyCategories || []).map((c) => `<option ${c === 'Short Stories' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="field">Grade level <input name="grade_level" value="${esc(material.analysis?.suggestedGrade || '')}" placeholder="Grade 4"></label>
          <label class="field">Language <select name="language"><option>English</option><option>Filipino</option></select></label>
          <div class="hint">This creates an editable story in your Reading Library. You can add vocabulary and comprehension questions afterwards.</div>
        </form>`);
        if (!body) return;
        const payload = Object.fromEntries(new FormData(body.querySelector('form')));
        try {
          const story = await ctx.api('/api/stories', { method: 'POST', body: { ...payload, source_material_id: material.id, sections, status: 'draft' } });
          ctx.toast('Story draft created in your Reading Library.', 'success');
          ctx.go(`teacher/library/${story.id}`);
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      const retry = el.querySelector('#lm-retry');
      if (retry) retry.addEventListener('click', async () => {
        retry.disabled = true;
        try { const result = await ctx.api(`/api/materials/${material.id}/reprocess`, { method: 'POST' }); material.status = result.status; ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); retry.disabled = false; }
      });
      el.querySelector('#lm-reprocess').addEventListener('click', async () => {
        try { await ctx.api(`/api/materials/${material.id}/reprocess`, { method: 'POST' }); ctx.toast('Re-extracted from the original file.', 'success'); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      });
      window.addEventListener('pagehide', stopSpeech, { once: true });
    }
  };
}

function analysisHtml(analysis = {}) {
  if (!analysis || !Object.keys(analysis).length) return '<p class="muted small">No analysis saved yet. Choose “Analyze content” to review objectives, vocabulary and evidence from the source.</p>';
  const list = (items = [], key = 'title') => items.length
    ? `<ul class="lm-list">${items.map((x) => `<li>${esc(typeof x === 'string' ? x : x[key] || x.title || '')}${x.reason ? `<div class="muted tiny">${esc(x.reason)}</div>` : ''}</li>`).join('')}</ul>`
    : '<p class="muted small">None suggested.</p>';
  return `<div class="stack">
    <div><strong>Topic:</strong> ${esc(analysis.topic || 'Unclear')} <span class="chip">${esc(analysis.suggestedGrade || 'Grade unclear')}</span> <span class="chip">${esc(analysis.suggestedSubject || 'General')}</span></div>
    <div><strong>Objectives</strong>${list(analysis.objectives)}</div>
    <div><strong>Vocabulary</strong>${list((analysis.vocabulary || []).map((v) => `${v.term}: ${v.definition}`))}</div>
    <div><strong>Suggested competencies (unverified)</strong>${list(analysis.competencySuggestions)}</div>
    ${(analysis.flags || []).map((f) => `<div class="notice"><span>⚠️</span><div>${esc(f)}</div></div>`).join('')}
    ${teacherGuideHtml(analysis.teacherGuide)}
  </div>`;
}

export default materialsPage;
