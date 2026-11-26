import { esc, formatDate } from '../ui.js';
import { readingSpeech } from '../reading.js';
import { highlightHtml } from '../highlight.js';
import { flipbookHtml, turnFlipbook, bindFlipbook, initialFlipMode, applyStoredZoom } from '../flipbook.js';
import { mountPptxSlide, pptxSlideMarkup, pptxEngineAvailable } from '../presentation-engine.js';
import { raTopMarkup, raProgressMarkup, raBuddyMarkup, raTranscriptMarkup, raPracticeMarkup, raQuizMarkup, enhanceStoryReader } from '../readaloud.js';

const DEFAULT_PREFS = { narrationLang: 'en-US', narrationRate: 0.9, narrationVolume: 0.9, voiceURI: '', highlightStyle: 'word', highlightColor: '#fde68a' };

async function ensureMeta(ctx) {
  if (!ctx.state.meta) ctx.state.meta = await ctx.api('/api/meta');
  return ctx.state.meta;
}

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), location.href);
    if (url.protocol === 'javascript:' || url.href.startsWith('data:text/html')) return '';
    return ['http:', 'https:', 'blob:'].includes(url.protocol) || url.href.startsWith('data:image/') ? url.href : '';
  } catch { return ''; }
}

function sourceFileUrl(story) {
  return safeUrl(story.sourceMaterial?.file_url || story.source_file_url || story.file_url || '');
}

function storyPages(story) {
  return Array.isArray(story?.pages) && story.pages.length ? story.pages : (story?.sections || []);
}

function readerHighlight(text, prefs) {
  return highlightHtml(text, prefs?.highlightStyle || 'word', 'res-word', 'res-active')
    || '<span class="res-muted">No text in this section.</span>';
}

function coverHtml(story) {
  const cover = safeUrl(story.cover_url);
  return cover ? `<img class="res-cover" src="${esc(cover)}" alt="">` : `<div class="res-cover res-emoji">${esc(story.cover_emoji || '📖')}</div>`;
}

function voiceOptions(prefs, voices) {
  return `<option value="">Default voice</option>${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === prefs.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}`;
}

export async function studentLibraryPage(ctx) {
  await ensureMeta(ctx);
  const [data, live, storyLive] = await Promise.all([
    ctx.api('/api/student/library'), ctx.api('/api/presentations/live'), ctx.api('/api/story-presentations/live')
  ]);
  const liveFor = new Map((Array.isArray(live) ? live : []).map((session) => [session.material_id, session]));
  const storyLiveFor = new Map((Array.isArray(storyLive) ? storyLive : []).map((session) => [session.story_id, session]));
  const liveBanner = live.length ? `<div class="live-banner"><div><h3><span class="live-dot"></span>Live presentation now</h3>
    <p>${esc(live[0].title)} — your teacher is presenting. Join the slide show to follow along.</p></div>
    <button class="btn btn-light" data-nav="student/slideshow/${esc(live[0].code)}">Join slide show</button></div>` : '';
  const storyLiveBanner = storyLive.length ? `<div class="live-banner"><div><h3><span class="live-dot"></span>Live story now</h3>
    <p>${esc(storyLive[0].title)} — your teacher is presenting. Join the story show to follow along.</p></div>
    <button class="btn btn-light" data-nav="student/storyshow/${esc(storyLive[0].code)}">Join story show</button></div>` : '';
  return {
    title: 'My Reading Library',
    html: `<div class="stack">
      <div class="notice notice-info"><span>📚</span><div><strong>Assigned by your teacher.</strong> Read presentations and stories here. Use play, pause and replay to listen again; highlighted words follow the narration.</div></div>
      ${liveBanner}
      ${storyLiveBanner}
      <div class="section-head"><div><h2>Presentations</h2><p class="muted small">${data.presentations.length} assigned</p></div></div>
      <div class="grid grid-3">${data.presentations.map((p) => `<div class="card card-pad card-hover res-card" data-nav="student/presentation/${p.id}">
        <div class="row-between"><span style="font-size:1.8rem">📽️</span><span class="chip chip-indigo">${esc((p.format || 'file').toUpperCase())}</span></div>
        <h3>${esc(p.title)}</h3><div class="muted tiny">${p.slide_count} slides • ${esc(p.class_name || '')}${p.due_at ? ` • Due ${formatDate(p.due_at)}` : ''}</div>
        ${p.instructions ? `<p class="muted small">${esc(p.instructions)}</p>` : ''}
        ${liveFor.has(p.id) ? `<div class="notice notice-green" style="margin-top:.6rem"><span>●</span><div>Live now — code <strong>${esc(liveFor.get(p.id).code)}</strong></div></div>` : ''}
        <div class="row wrap" style="margin-top:.7rem">
          <button class="btn btn-sm btn-primary" data-nav="student/presentation/${p.id}">Open presentation</button>
          ${liveFor.has(p.id) ? `<button class="btn btn-sm btn-soft" data-nav="student/slideshow/${esc(liveFor.get(p.id).code)}">Join slide show</button>` : ''}
        </div>
      </div>`).join('') || '<div class="empty card"><div class="big">📽️</div><h3>No presentations assigned</h3></div>'}</div>
      <div class="section-head"><div><h2>Stories</h2><p class="muted small">${data.stories.length} assigned</p></div></div>
      <div class="row wrap" style="margin-bottom:.8rem">
        <select id="sl-grade" class="search" aria-label="Filter stories by grade"><option value="">All grades</option>${[...new Set(data.stories.map((s) => s.grade_level).filter(Boolean))].map((v) => `<option>${esc(v)}</option>`).join('')}</select>
        <select id="sl-subject" class="search" aria-label="Filter stories by subject"><option value="">All subjects</option>${[...new Set(data.stories.map((s) => s.subject).filter(Boolean))].map((v) => `<option>${esc(v)}</option>`).join('')}</select>
        <select id="sl-difficulty" class="search" aria-label="Filter stories by reading difficulty"><option value="">All difficulties</option>${[...new Set(data.stories.map((s) => s.reading_level).filter(Boolean))].map((v) => `<option>${esc(v)}</option>`).join('')}</select>
        <select id="sl-genre" class="search" aria-label="Filter stories by genre"><option value="">All genres</option>${[...new Set(data.stories.map((s) => s.category).filter(Boolean))].map((v) => `<option>${esc(v)}</option>`).join('')}</select>
      </div>
      <div class="grid grid-4" id="sl-story-grid">${data.stories.map((s) => `<div class="card card-hover res-story" data-story-card data-grade="${esc(s.grade_level || '')}" data-subject="${esc(s.subject || '')}" data-difficulty="${esc(s.reading_level || '')}" data-genre="${esc(s.category || '')}" data-nav="student/story/${s.id}">
        ${coverHtml(s)}<div class="res-story-body"><span class="chip chip-indigo">${esc(s.category)}</span>
          <h3>${esc(s.title)}</h3><p class="muted small">${esc((s.description || '').slice(0, 80))}</p>
          <div class="muted tiny">${s.section_count} sections • ${esc(s.grade_level || '')} • ${esc(s.language)}${s.due_at ? ` • Due ${formatDate(s.due_at)}` : ''}</div>
          <div class="row wrap" style="margin-top:.6rem">
            <button class="btn btn-sm btn-primary" data-nav="student/story/${s.id}">Read story</button>
            ${storyLiveFor.has(s.id) ? `<button class="btn btn-sm btn-soft" data-nav="student/storyshow/${esc(storyLiveFor.get(s.id).code)}">Join story show</button>` : ''}
          </div></div>
      </div>`).join('') || '<div class="empty card"><div class="big">📖</div><h3>No stories assigned</h3></div>'}</div>
    </div>`,
    mount(el) {
      const applyStoryFilters = () => {
        const values = {
          grade: el.querySelector('#sl-grade')?.value || '',
          subject: el.querySelector('#sl-subject')?.value || '',
          difficulty: el.querySelector('#sl-difficulty')?.value || '',
          genre: el.querySelector('#sl-genre')?.value || ''
        };
        el.querySelectorAll('[data-story-card]').forEach((card) => {
          const show = Object.entries(values).every(([key, value]) => !value || card.dataset[key] === value);
          card.style.display = show ? '' : 'none';
        });
      };
      ['grade', 'subject', 'difficulty', 'genre'].forEach((key) => {
        el.querySelector(`#sl-${key}`)?.addEventListener('change', applyStoryFilters);
      });
      el.querySelectorAll('[data-nav^="student/slideshow/"], [data-nav^="student/storyshow/"]').forEach((button) => {
        button.addEventListener('click', () => {
          document.documentElement.requestFullscreen?.().catch?.(() => {});
        }, true);
      });
    }
  };
}

function narrationControls(prefix, prefs, withPageNav = false) {
  return `<div class="res-controls">
    <button class="btn btn-sm btn-primary" id="${prefix}-play">▶ Read</button>
    <button class="btn btn-sm btn-soft" id="${prefix}-all">📖 Read all</button>
    ${withPageNav ? `<button class="btn btn-sm btn-ghost" id="${prefix}-read-prev">‹ Previous page</button>
    <button class="btn btn-sm btn-ghost" id="${prefix}-read-next">Next page ›</button>` : ''}
    <button class="btn btn-sm btn-ghost" id="${prefix}-pause">⏸ Pause</button>
    <button class="btn btn-sm btn-ghost" id="${prefix}-resume">▶ Resume</button>
    <button class="btn btn-sm btn-ghost" id="${prefix}-stop">⏹ Stop</button>
    <button class="btn btn-sm btn-ghost" id="${prefix}-replay">↺ Replay</button>
    <label>Language <select id="${prefix}-lang"><option value="en-US" ${prefs.narrationLang === 'en-US' ? 'selected' : ''}>English</option><option value="fil-PH" ${prefs.narrationLang === 'fil-PH' ? 'selected' : ''}>Filipino</option></select></label>
    <label>Voice <select id="${prefix}-voice">${voiceOptions(prefs, [])}</select></label>
    <label>Speed <input id="${prefix}-rate" type="range" min="0.5" max="1.5" step="0.1" value="${prefs.narrationRate}"></label>
    <label>Volume <input id="${prefix}-volume" type="range" min="0" max="1" step="0.1" value="${prefs.narrationVolume}"></label>
    <span id="${prefix}-status" class="muted tiny">Speech uses this device’s available voices.</span>
  </div>`;
}

function attachNarration(el, ctx, options) {
  const { prefix, getText, onAdvance, onPrev, hasNext, prefs, persist, onBoundary, onState, onFinished } = options;
  const speech = readingSpeech;
  let generation = 0;
  let playingAll = false;
  const setStatus = (text) => { const node = el.querySelector(`#${prefix}-status`); if (node) node.textContent = text; };
  const clear = () => el.querySelectorAll('[data-active-class]').forEach((n) => n.classList.remove(n.dataset.activeClass || 'res-active'));
  const highlight = (charIndex) => {
    clear();
    const node = [...el.querySelectorAll('[data-start]')].find((n) => Number(n.dataset.start) <= charIndex && charIndex < Number(n.dataset.end));
    if (node) {
      node.classList.add(node.dataset.activeClass || 'res-active');
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      onBoundary?.(charIndex, node.textContent.trim());
    }
  };
  const speak = (after) => {
    const text = getText();
    if (!text || !text.trim()) { if (after) after(); return false; }
    const token = generation;
    const started = speech.speak({
      text, lang: prefs.narrationLang, rate: Number(prefs.narrationRate), volume: Number(prefs.narrationVolume), voiceURI: prefs.voiceURI,
      onBoundary: (event) => { if (token === generation) highlight(event.charIndex); },
      onEnd: () => { clear(); onState?.('stopped'); if (token === generation && after) after(); },
      onError: () => { clear(); onState?.('stopped'); if (token === generation && after) after(); }
    });
    if (started) onState?.('playing');
    return started;
  };
  const stop = () => { generation += 1; playingAll = false; speech.stop(); clear(); onState?.('stopped'); setStatus('Narration stopped.'); };
  const voiceSelect = el.querySelector(`#${prefix}-voice`);
  const refreshVoices = () => {
    if (voiceSelect) voiceSelect.innerHTML = voiceOptions(prefs, speech.voices(prefs.narrationLang));
  };
  refreshVoices();
  window.addEventListener('voiceschanged', refreshVoices);
  el.querySelector(`#${prefix}-play`).addEventListener('click', () => { stop(); setStatus(speak() ? 'Reading…' : 'Nothing to read.'); });
  el.querySelector(`#${prefix}-read-prev`)?.addEventListener('click', () => { stop(); onPrev?.(); });
  el.querySelector(`#${prefix}-read-next`)?.addEventListener('click', () => { stop(); onAdvance?.(); });
  el.querySelector(`#${prefix}-all`).addEventListener('click', () => {
    stop(); playingAll = true; const token = generation;
    const next = () => {
      if (!playingAll || token !== generation) return;
      if (!hasNext() || !onAdvance()) { playingAll = false; setStatus('Finished reading.'); onFinished?.(); return; }
      if (!speak(next)) next();
    };
    setStatus('Reading all sections…');
    if (!speak(next)) next();
  });
  el.querySelector(`#${prefix}-pause`).addEventListener('click', () => { speech.pause(); onState?.('paused'); setStatus('Paused.'); });
  el.querySelector(`#${prefix}-resume`).addEventListener('click', () => { speech.resume(); onState?.('playing'); setStatus('Resumed.'); });
  el.querySelector(`#${prefix}-stop`).addEventListener('click', stop);
  el.querySelector(`#${prefix}-replay`).addEventListener('click', () => { stop(); setStatus(speak() ? 'Replaying…' : 'Nothing to replay.'); });
  const updatePrefs = async () => {
    prefs.narrationLang = el.querySelector(`#${prefix}-lang`).value;
    prefs.narrationRate = Number(el.querySelector(`#${prefix}-rate`).value);
    prefs.narrationVolume = Number(el.querySelector(`#${prefix}-volume`).value);
    prefs.voiceURI = el.querySelector(`#${prefix}-voice`).value;
    if (persist) await persist(prefs);
    refreshVoices();
  };
  el.querySelector(`#${prefix}-lang`).addEventListener('change', updatePrefs);
  el.querySelector(`#${prefix}-voice`).addEventListener('change', updatePrefs);
  el.querySelector(`#${prefix}-rate`).addEventListener('change', updatePrefs);
  el.querySelector(`#${prefix}-volume`).addEventListener('change', updatePrefs);
  window.addEventListener('pagehide', stop, { once: true });
  return { stop, speak };
}

export async function storyReaderPage(ctx) {
  await ensureMeta(ctx);
  const [, storyId] = ctx.params;
  const [story, preferences] = await Promise.all([ctx.api(`/api/stories/${storyId}`), ctx.api('/api/preferences')]);
  const prefs = { ...DEFAULT_PREFS, ...(story.preferences || {}), ...preferences };
  const sections = storyPages(story);
  let index = 0;
  let viewMode = initialFlipMode();
  let startedAt = Date.now();
  let wordsRead = 0;
  let saved = false;
  const section = () => sections[index];
  const narrationText = (page) => String(prefs?.narrationScripts?.[page?.id] || page?.text || '');
  const pageHtml = (page, i) => {
    const text = narrationText(page);
    const sourceImage = page?.preview_url
      ? `<img class="flipbook-page-image" src="${esc(page.preview_url)}" alt="Story page ${i + 1}">`
      : '';
    const rich = page?.html ? `<div class="story-rich-html">${page.html}</div>` : '';
    const heading = !sourceImage && !rich ? `<h3 class="story-section-title">${esc(page?.title || `Page ${i + 1}`)}</h3>` : '';
    const transcript = text ? `<div class="res-text story-narration-text" data-res-highlight style="--res-highlight:${esc(prefs.highlightColor)}">${readerHighlight(text, prefs)}</div>` : '';
    const warning = page?.ocr_status === 'failed'
      ? `<div class="notice"><span>⚠️</span><div><strong>OCR warning:</strong> ${esc(page.ocr_error || 'No narration text was found; the original page image is shown.')}</div></div>` : '';
    return `${sourceImage || rich || heading}${transcript}${warning}`
      || '<span class="res-muted">This page has no text. The original page image is shown when available.</span>';
  };

  const saveSession = async (completed = false) => {
    if (!section()) return;
    if (completed) saved = true;
    try {
      await ctx.api(`/api/stories/${story.id}/sessions`, { method: 'POST', body: {
        section_id: section().id, mode: 'listen', time_spent: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        words_read: wordsRead, completed
      } });
    } catch { /* reading should never be blocked by a progress save */ }
  };

  return {
    title: story.title,
    html: `<div class="ra-reader">
      <div class="row-between wrap"><div><button class="btn btn-sm btn-ghost" data-nav="student/library">← My Reading Library</button>
        <h2 style="margin:.5rem 0 .2rem">${esc(story.title)}</h2><p class="muted small">${esc(story.category)} • ${esc(story.language)}</p></div>
        <div class="row wrap">${sourceFileUrl(story) ? `<a class="btn btn-sm btn-ghost" href="${esc(sourceFileUrl(story))}" target="_blank" rel="noopener">Open source file</a>` : ''}${coverHtml(story)}</div></div>
      ${story.processing_error ? `<div class="notice"><span>⚠️</span><div><strong>Processing notice:</strong> ${esc(story.processing_error)} The page images are still available.</div></div>` : ''}
      <div class="notice notice-info"><span>📖</span><div><strong>Interactive storybook.</strong> Read along, tap words, listen, practise reading aloud, and take the story challenge.</div></div>
      ${raTopMarkup(story, prefs)}
      <div data-ra-progress>${raProgressMarkup(0, sections.length)}</div>
      <div class="ra-layout">
        <div class="res-reader-layout">
          <aside class="res-sections"><h3>Pages</h3>${sections.map((s, i) => `<button class="res-section-btn ${i === 0 ? 'active' : ''}" data-section="${i}">${i + 1}. ${esc(s.title || `Page ${i + 1}`)}</button>`).join('')}</aside>
          <section class="card card-pad">
            <div class="row-between"><strong id="res-counter">Page ${sections.length ? 1 : 0} of ${sections.length}</strong>
              <div class="row"><button class="btn btn-sm btn-ghost" id="res-prev">← Previous</button><button class="btn btn-sm btn-ghost" id="res-next">Next →</button></div></div>
            <div id="res-body" class="res-body ra-stage" style="--res-highlight:${esc(prefs.highlightColor)}">
              <div data-ra-flip>${flipbookHtml({ prefix: 'res', title: story.title, pages: sections, index: 0, viewMode, renderPage: pageHtml })}</div>
              ${raBuddyMarkup()}
              <span class="ra-page-note" data-ra-page-note>Page 1 of ${sections.length}</span>
            </div>
            ${narrationControls('res', prefs, true)}
            <div class="row" style="margin-top:.8rem"><button class="btn btn-sm btn-soft" id="ra-finish">✓ Finish & take challenge</button></div>
          </section>
        </div>
        <div class="ra-side">
          ${raTranscriptMarkup(narrationText(section()), prefs)}
          <div class="ra-panel"><h3>Words to know</h3>${(story.vocabulary || []).map((v) => `<div class="res-vocab"><strong class="ra-word">${esc(v.term)}</strong> — ${esc(v.definition || '')}</div>`).join('') || '<p class="muted small">No vocabulary list for this story.</p>'}</div>
        </div>
      </div>
      ${raPracticeMarkup()}
      ${raQuizMarkup()}
    </div>`,
    mount(el) {
      applyStoredZoom(el);
      let enhance = null;
      const paint = () => {
        const flip = el.querySelector('[data-ra-flip]');
        if (flip) flip.innerHTML = flipbookHtml({
          prefix: 'res', title: story.title, pages: sections, index, viewMode, renderPage: pageHtml
        });
        applyStoredZoom(el.querySelector('#res-body'));
        el.querySelector('#res-counter').textContent = `Page ${index + 1} of ${sections.length}`;
        el.querySelector('#res-prev').disabled = index <= 0;
        el.querySelector('#res-next').disabled = index >= sections.length - 1;
        const note = el.querySelector('[data-ra-page-note]');
        if (note) note.textContent = `Page ${index + 1} of ${sections.length}`;
        el.querySelectorAll('[data-section]').forEach((b) => b.classList.toggle('active', Number(b.dataset.section) === index));
        enhance?.setPage(index);
      };
      const go = (next, animate = true) => {
        if (!sections.length) return;
        const target = Math.min(sections.length - 1, Math.max(0, next));
        if (target === index) return;
        const commit = () => { index = target; paint(); };
        if (animate) turnFlipbook(el, target > index ? 'next' : 'prev', commit);
        else commit();
      };
      const advance = () => {
        if (index >= sections.length - 1) return false;
        go(index + 1); return true;
      };
      const back = () => {
        if (index <= 0) return false;
        go(index - 1); return true;
      };
      const narration = attachNarration(el, ctx, {
        prefix: 'res', getText: () => narrationText(section()),
        onAdvance: advance, onPrev: back, hasNext: () => index < sections.length - 1, prefs,
        onBoundary: (_charIndex, word) => { wordsRead += 1; enhance?.setState('playing', word ? `Reading: ${word}` : 'Listening closely…'); },
        onState: (state) => enhance?.setState(state),
        onFinished: () => enhance?.finish(),
        persist: async () => { await ctx.api('/api/preferences', { method: 'PUT', body: prefs }); }
      });
      enhance = enhanceStoryReader({ el, ctx, story, sections, prefs, getIndex: () => index, narration, go, saveSession });
      enhance.setPage(index);
      bindFlipbook(el, 'res', (delta) => { narration.stop(); go(index + delta); }, {
        onModeChange: (mode) => { viewMode = mode; paint(); }
      });
      el.querySelectorAll('[data-section]').forEach((b) => b.addEventListener('click', () => { narration.stop(); go(Number(b.dataset.section)); }));
      el.querySelector('#res-prev').addEventListener('click', () => { narration.stop(); go(index - 1); });
      el.querySelector('#res-next').addEventListener('click', () => { narration.stop(); go(index + 1); });
      window.addEventListener('pagehide', () => { if (!saved) saveSession(false); }, { once: true });
      el.__cleanupPresentation = () => { narration.stop(); enhance?.destroy(); };
    }
  };
}

export async function presentationReaderPage(ctx) {
  await ensureMeta(ctx);
  const [, materialId] = ctx.params;
  const [material, preferences] = await Promise.all([ctx.api(`/api/materials/${materialId}`), ctx.api('/api/preferences')]);
  const prefs = { ...DEFAULT_PREFS, ...(material.preferences || {}), ...preferences };
  const slides = material.slides || [];
  const layout = slides[0]?.layout || {};
  const aspect = (Number(layout.width) || 960) / (Number(layout.height) || 540);
  const sourceUrl = material.presentation_url || material.file_url || '';
  let index = 0;
  let deck = null;
  let narration = null;

  return {
    title: material.title,
    html: `<div class="stack">
      <div class="row-between wrap"><div><button class="btn btn-sm btn-ghost" data-nav="student/library">← My Reading Library</button>
        <h2 style="margin:.5rem 0">${esc(material.title)}</h2><span class="muted tiny">${slides.length} slides • original PowerPoint slides</span></div></div>
      <div class="res-reader-layout">
        <aside class="res-sections"><h3>Slides</h3>${slides.map((s, i) => `<button class="res-section-btn ${i === 0 ? 'active' : ''}" data-slide="${i}">${i + 1}. ${esc(s.title || `Slide ${i + 1}`)}</button>`).join('')}</aside>
        <section class="card card-pad"><div class="row-between"><strong id="res-counter">Slide ${slides.length ? 1 : 0} of ${slides.length}</strong>
          <div class="row"><button class="btn btn-sm btn-ghost" id="res-prev">← Previous</button><button class="btn btn-sm btn-ghost" id="res-next">Next →</button></div></div>
          <div id="res-stage" class="res-stage res-stage-pptx">${slides.length ? pptxSlideMarkup(aspect) : '<div class="empty"><div class="big">📭</div><h3>No slides</h3></div>'}</div>
          ${narrationControls('pres', prefs)}</section>
      </div>
    </div>`,
    mount(el) {
      const stage = el.querySelector('#res-stage');
      const paint = () => {
        deck?.render(index, slides[index]?.transition);
        el.querySelector('#res-counter').textContent = `Slide ${index + 1} of ${slides.length}`;
        el.querySelector('#res-prev').disabled = index <= 0;
        el.querySelector('#res-next').disabled = index >= slides.length - 1;
        el.querySelectorAll('[data-slide]').forEach((b) => b.classList.toggle('active', Number(b.dataset.slide) === index));
      };
      const advance = () => { if (index >= slides.length - 1) return false; index += 1; paint(); return true; };
      narration = attachNarration(el, ctx, {
        prefix: 'pres', getText: () => slides[index]?.text || '',
        onAdvance: advance, hasNext: () => index < slides.length - 1, prefs,
        persist: async () => { await ctx.api('/api/preferences', { method: 'PUT', body: prefs }); }
      });
      el.querySelectorAll('[data-slide]').forEach((b) => b.addEventListener('click', () => { narration.stop(); index = Number(b.dataset.slide); paint(); }));
      el.querySelector('#res-prev').addEventListener('click', () => { narration.stop(); index = Math.max(0, index - 1); paint(); });
      el.querySelector('#res-next').addEventListener('click', () => { narration.stop(); index = Math.min(slides.length - 1, index + 1); paint(); });
      (async () => {
        try {
          if (!slides.length) return;
          if (!pptxEngineAvailable() || !sourceUrl) throw new Error('The original PowerPoint file is not available in this browser.');
          deck = await mountPptxSlide(stage, sourceUrl, aspect, { width: 1280 });
          paint();
        } catch (error) {
          stage.innerHTML = `<div class="pptx-error" style="color:#475569"><div class="big">📽️</div><strong>${esc(error.message)}</strong></div>`;
        }
      })();
      el.__cleanupPresentation = () => { narration?.stop(); deck?.destroy(); };
    }
  };
}

export default studentLibraryPage;
