import { esc, progressRing, toast as uiToast } from '../ui.js';
import { readingSpeech } from '../reading.js';

const PREFS_KEY = 'eduplay.reader.prefs';
const SAVE_DELAY_MS = 650;
const SPEEDS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];
const MODES = [
  { id: 'listen', icon: '🎧', label: 'Listen', hint: 'Hear the whole story' },
  { id: 'along', icon: '👆', label: 'Read Along', hint: 'Follow the words as they are read' },
  { id: 'independent', icon: '📖', label: 'Independent', hint: 'Read quietly on your own' },
  { id: 'practice', icon: '🎤', label: 'Reading Practice', hint: 'Read aloud and record yourself' }
];
const DEFAULT_PREFS = { mode: 'listen', rate: 1, volume: 0.9, muted: false, lang: 'en-US', voiceURI: '' };

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n)));
const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const wordsIn = (text) => (String(text ?? '').match(/\S+/g) || []).length;
const modeInfo = (id) => MODES.find((m) => m.id === id) || MODES[0];

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
    const prefs = { ...DEFAULT_PREFS, ...saved };
    prefs.rate = clamp(prefs.rate ?? 1, 0.6, 1.4);
    prefs.volume = clamp(prefs.volume ?? 0.9, 0, 1);
    prefs.muted = Boolean(prefs.muted);
    prefs.lang = ['en-US', 'fil-PH'].includes(prefs.lang) ? prefs.lang : 'en-US';
    if (!MODES.some((m) => m.id === prefs.mode)) prefs.mode = 'listen';
    return prefs;
  } catch { return { ...DEFAULT_PREFS }; }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage is optional */ }
}

function lessonIdFrom(ctx) {
  const p = ctx.params || [];
  if (p[0] === 'read' && p[1]) return p[1];
  if (p[0] === 'lessons' && p[1] && p[2] === 'read') return p[1];
  const at = p.indexOf('read');
  return (at > 0 && p[at - 1]) || p[1] || p[0] || '';
}

function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || /^(javascript:|data:text\/html)/i.test(raw)) return '';
  try {
    const url = new URL(raw, typeof location === 'undefined' ? 'http://localhost/' : location.href);
    return ['http:', 'https:', 'data:', 'blob:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function asList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  return String(value ?? '').split(/[\n;]+|•/).map((v) => v.trim()).filter(Boolean);
}

// Words + sentences with absolute character offsets, so narration boundaries
// can highlight the right word even when replaying one sentence/paragraph.
function buildTextModel(raw) {
  const text = String(raw ?? '');
  const words = [];
  for (const match of text.matchAll(/\S+/g)) {
    words.push({ index: words.length, start: match.index, end: match.index + match[0].length, text: match[0], sentence: 0 });
  }
  const sentences = [];
  for (const match of text.matchAll(/[^.!?。！？…]+(?:[.!?。！？…]+["'”’)\]]*)?/g)) {
    if (!match[0].trim()) continue;
    const lead = match[0].length - match[0].trimStart().length;
    sentences.push({
      index: sentences.length,
      start: match.index + lead,
      end: match.index + match[0].length,
      text: match[0].trim(),
      words: []
    });
  }
  let sentenceAt = 0;
  words.forEach((word) => {
    while (sentenceAt < sentences.length - 1 && word.start >= sentences[sentenceAt].end) sentenceAt += 1;
    word.sentence = sentences.length ? sentenceAt : -1;
    if (sentences[sentenceAt]) sentences[sentenceAt].words.push(word.index);
  });
  let html = '';
  let cursor = 0;
  words.forEach((word) => {
    html += esc(text.slice(cursor, word.start));
    html += `<span class="reader-word" data-w="${word.index}" data-s="${word.sentence}">${esc(word.text)}</span>`;
    cursor = word.end;
  });
  html += esc(text.slice(cursor));
  return { words, sentences, html };
}

function findWordAt(model, offset) {
  const list = model?.words || [];
  let low = 0;
  let high = list.length - 1;
  let found = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (list[mid].start <= offset) { found = list[mid]; low = mid + 1; } else high = mid - 1;
  }
  return found;
}

function paragraphsOf(raw) {
  const text = String(raw ?? '');
  const out = [];
  const breaks = /\n\s*\n+/g;
  let last = 0;
  let match;
  const push = (chunk, from) => {
    if (!chunk.trim()) return;
    out.push({ text: chunk.trim(), start: from + (chunk.length - chunk.trimStart().length) });
  };
  while ((match = breaks.exec(text))) {
    push(text.slice(last, match.index), last);
    last = breaks.lastIndex;
  }
  push(text.slice(last), last);
  return out;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
}

export default async function readerPage(ctx) {
  const lessonId = lessonIdFrom(ctx);
  if (!lessonId) throw new Error('This reading link is missing a lesson.');

  const data = await ctx.api(`/api/reading/lessons/${encodeURIComponent(lessonId)}`);
  const lesson = data?.lesson || {};
  const pages = (Array.isArray(data?.pages) ? data.pages : [])
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const vocabulary = Array.isArray(data?.vocabulary) ? data.vocabulary : [];
  const games = Array.isArray(data?.games) ? data.games : [];
  const recordings = Array.isArray(data?.recordings) ? data.recordings : [];
  const isTeacher = ctx.state?.user?.role === 'teacher' || ctx.params?.[0] === 'lessons';
  const notify = ctx.toast || uiToast;
  const prefs = loadPrefs();
  let mode = prefs.mode;
  const baseUrl = `/api/reading/lessons/${encodeURIComponent(lessonId)}`;

  const suppliedAttempt = ctx.query?.attempt || ctx.query?.attempt_id || ctx.query?.gameAttempt || '';
  const voiceOptions = () => {
    const voices = readingSpeech.voices(prefs.lang);
    return `<option value="">System default</option>` + voices.map((v) =>
      `<option value="${esc(v.voiceURI)}" ${prefs.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(v.name || v.voiceURI)}</option>`
    ).join('');
  };

  const objectives = asList(lesson.objectives);
  const initialPercent = pages.length ? Math.round(100 / pages.length) : 0;

  const html = `<div class="reader" id="reader-root" data-mode="${esc(mode)}" data-preview="${isTeacher ? 'true' : 'false'}">
    ${isTeacher ? `<div class="reader-banner" role="status"><span>👀</span><span>Preview mode — reading sessions are not saved</span></div>` : ''}
    <header class="reader-head reader-card">
      <div class="reader-head-main">
        ${isTeacher ? '<button class="btn btn-ghost btn-sm reader-back" id="reader-back">← Lessons</button>' : ''}
        <div class="grow">
          <div class="reader-kicker">📖 Digital storybook ${lesson.subject_name ? `• ${esc(lesson.subject_name)}` : ''} ${lesson.grade_level ? `• ${esc(lesson.grade_level)}` : ''}</div>
          <h2 class="reader-title">${esc(lesson.title || 'Reading lesson')}</h2>
          ${lesson.description ? `<p class="reader-muted reader-description">${esc(lesson.description)}</p>` : ''}
          <div class="reader-tags">
            ${lesson.competency_title ? `<span class="chip chip-indigo">🎯 ${esc(lesson.competency_title)}</span>` : ''}
            <span class="chip ${lesson.status === 'published' ? 'chip-green' : 'chip-amber'}">${esc(lesson.status || 'draft')}</span>
            ${recordings.length && isTeacher ? `<span class="chip chip-sky">🎤 ${recordings.length} recording${recordings.length === 1 ? '' : 's'} to review</span>` : ''}
          </div>
          ${objectives.length ? `<details class="reader-objectives"><summary>What you'll learn</summary><ul>${objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></details>` : ''}
        </div>
      </div>
      <div class="reader-ring" id="reader-ring" aria-label="Reading progress">${progressRing(initialPercent, 58)}</div>
    </header>

    <div class="reader-modes" role="group" aria-label="Reading mode">
      ${MODES.map((m) => `<button type="button" class="reader-mode-btn" data-mode="${m.id}" aria-pressed="${m.id === mode}" title="${esc(m.hint)}">
        <span class="reader-mode-icon">${m.icon}</span><span class="reader-mode-name">${esc(m.label)}</span>
      </button>`).join('')}
    </div>

    <div class="reader-layout">
      <section class="reader-stage reader-card">
        <div class="reader-stage-top">
          <div class="reader-page-label" id="reader-page-label">Page 1 of ${pages.length}</div>
          <div class="reader-progress-wrap" role="status" aria-live="polite">
            <div class="reader-progressbar"><span id="reader-progress-fill" style="width:${initialPercent}%"></span></div>
            <span class="reader-progress-text" id="reader-progress-text">${initialPercent}%</span>
          </div>
        </div>
        <div class="reader-finish-slot" id="reader-finish-slot"></div>
        <article class="reader-book" id="reader-book">
          <div class="reader-media" id="reader-media"></div>
          <h3 class="reader-page-title" id="reader-page-title"></h3>
          <div class="reader-text" id="reader-text" tabindex="0" aria-label="Story text"></div>
        </article>
        <div class="reader-stage-foot">
          <button type="button" class="btn btn-ghost btn-sm reader-nav-btn" id="reader-prev">← Previous</button>
          <div class="reader-dots" id="reader-dots" role="group" aria-label="Choose a page"></div>
          <div class="reader-nav-actions">
            <button type="button" class="btn btn-ghost btn-sm reader-nav-btn" id="reader-finish">✓ Finish</button>
            <button type="button" class="btn btn-primary btn-sm reader-nav-btn" id="reader-next">Next page →</button>
          </div>
        </div>
      </section>

      <aside class="reader-aside">
        <section class="reader-card reader-panel">
          <h3 class="reader-panel-title">✨ New words</h3>
          ${vocabulary.length ? `<div class="reader-vocab-list">${vocabulary.map((v, i) => `
            <div class="reader-vocab-item">
              <button type="button" class="reader-vocab-term" data-vocab="${i}" aria-expanded="false">${esc(v.term)} <span class="reader-chevron">▾</span></button>
              <div class="reader-vocab-def reader-hidden" id="reader-vocab-def-${i}">
                <p class="reader-muted reader-vocab-text">${esc(v.definition || 'No definition provided.')}</p>
                ${safeUrl(v.media_url) ? `<img class="reader-vocab-image" src="${esc(safeUrl(v.media_url))}" alt="${esc(v.term)}">` : ''}
                <div class="reader-vocab-actions">
                  <button type="button" class="btn btn-soft btn-sm" data-vocab-speak="${i}">🔊 Hear it</button>
                  ${safeUrl(v.audio_url) ? `<audio controls preload="none" src="${esc(safeUrl(v.audio_url))}"></audio>` : ''}
                </div>
              </div>
            </div>`).join('')}</div>` : '<p class="reader-muted reader-small">No new words for this story.</p>'}
        </section>

        <section class="reader-card reader-panel reader-practice" id="reader-practice">
          <h3 class="reader-panel-title">🎤 Reading practice</h3>
          ${isTeacher
            ? '<p class="reader-muted reader-small">Recording is turned off in preview mode.</p>'
            : `<p class="reader-muted reader-small">Read this page aloud, then listen to yourself.</p>
              <div class="reader-record-actions">
                <button type="button" class="btn btn-red btn-sm" id="reader-record">● Record</button>
                <button type="button" class="btn btn-ghost btn-sm" id="reader-record-stop" disabled>■ Stop</button>
              </div>
              <p class="reader-hint" id="reader-record-status" role="status"></p>
              <div class="reader-record-preview reader-hidden" id="reader-record-preview"></div>`}
        </section>

        ${isTeacher && recordings.length ? `<section class="reader-card reader-panel" id="reader-review-panel">
          <h3 class="reader-panel-title">🎤 Student recordings</h3>
          ${recordings.map((rec) => `<div class="reader-review-item" data-recording="${esc(rec.id)}">
            <div class="reader-review-head"><strong>${esc(rec.student_name || 'Student')}</strong>
              <span class="chip ${rec.status === 'reviewed' ? 'chip-green' : 'chip-amber'}">${esc(rec.status)}</span></div>
            <div class="reader-muted reader-small">${esc(rec.created_at || '')} • ${esc(rec.duration || 0)}s</div>
            ${safeUrl(rec.file_url) ? `<audio controls preload="none" src="${esc(safeUrl(rec.file_url))}"></audio>` : ''}
            <div class="reader-review-fields">
              <label>Score <input type="number" min="0" max="100" class="reader-review-score" value="${rec.score ?? ''}" placeholder="0-100"></label>
              <label>Feedback <textarea class="reader-review-feedback" rows="2" placeholder="Encourage the reader…">${esc(rec.feedback || '')}</textarea></label>
            </div>
            <button type="button" class="btn btn-soft btn-sm" data-review-save="${esc(rec.id)}">Save review</button>
          </div>`).join('')}
        </section>` : ''}

        <section class="reader-card reader-panel">
          <h3 class="reader-panel-title">🎯 Next adventure</h3>
          ${games.length
            ? suppliedAttempt
              ? `<div class="reader-game-list">${games.map((g) => `<button type="button" class="reader-game-btn" data-game="${esc(g.id)}">🎮 ${esc(g.title)} →</button>`).join('')}</div>`
              : `<p class="reader-muted reader-small">Ask your teacher to assign this practice</p>
                 <div class="reader-game-chips">${games.map((g) => `<span class="chip">${esc(g.title)}</span>`).join('')}</div>`
            : '<p class="reader-muted reader-small">No practice games for this story yet.</p>'}
        </section>

        <section class="reader-card reader-panel reader-session">
          <h3 class="reader-panel-title">📈 Your reading</h3>
          <div class="reader-stat-row"><span>Time</span><strong id="reader-stat-time">00:00</strong></div>
          <div class="reader-stat-row"><span>Pages read</span><strong id="reader-stat-pages">0</strong></div>
          <div class="reader-stat-row"><span>Words read</span><strong id="reader-stat-words">0</strong></div>
          <div class="reader-stat-row"><span>Mode</span><strong id="reader-stat-mode">${esc(modeInfo(mode).label)}</strong></div>
          <p class="reader-hint" id="reader-stat-trail">Mode trail: ${esc(modeInfo(mode).label)}</p>
        </section>
      </aside>
    </div>

    <div class="reader-controls reader-card" id="reader-controls" role="toolbar" aria-label="Narration controls">
      <div class="reader-ctl-group">
        <button type="button" class="reader-ctl-btn reader-ctl-primary" id="reader-play" aria-label="Play narration"><span id="reader-play-icon">▶</span> <span id="reader-play-label">Play</span></button>
        <button type="button" class="reader-ctl-btn" id="reader-pause" disabled aria-label="Pause narration">⏸ <span class="reader-ctl-text">Pause</span></button>
        <button type="button" class="reader-ctl-btn" id="reader-stop" aria-label="Stop narration">⏹ <span class="reader-ctl-text">Stop</span></button>
      </div>
      <div class="reader-ctl-group">
        <button type="button" class="reader-ctl-btn" id="reader-replay-sentence" title="Replay the current sentence">↩ <span class="reader-ctl-text">Sentence</span></button>
        <button type="button" class="reader-ctl-btn" id="reader-replay-paragraph" title="Replay the current paragraph">↺ <span class="reader-ctl-text">Paragraph</span></button>
      </div>
      <div class="reader-ctl-group reader-ctl-settings">
        <label class="reader-ctl-field"><span>Speed</span>
          <select id="reader-speed" class="reader-ctl-select">${SPEEDS.map((s) => `<option value="${s}" ${Math.abs(prefs.rate - s) < 0.01 ? 'selected' : ''}>${s.toFixed(1)}×</option>`).join('')}</select>
        </label>
        <label class="reader-ctl-field"><span>Volume</span>
          <input id="reader-volume" class="reader-ctl-range" type="range" min="0" max="1" step="0.05" value="${prefs.volume}" aria-label="Volume">
        </label>
        <button type="button" class="reader-ctl-btn" id="reader-mute" aria-pressed="${prefs.muted}">${prefs.muted ? '🔇 Unmute' : '🔊 Mute'}</button>
        <label class="reader-ctl-field"><span>Language</span>
          <select id="reader-lang" class="reader-ctl-select">
            <option value="en-US" ${prefs.lang === 'en-US' ? 'selected' : ''}>English</option>
            <option value="fil-PH" ${prefs.lang === 'fil-PH' ? 'selected' : ''}>Filipino</option>
          </select>
        </label>
        <label class="reader-ctl-field"><span>Voice</span>
          <select id="reader-voice" class="reader-ctl-select reader-ctl-voice">${voiceOptions()}</select>
        </label>
      </div>
      ${readingSpeech.supported() ? '' : '<p class="reader-hint reader-speech-note">Narration is not available in this browser — you can still read along visually.</p>'}
    </div>
  </div>`;

  return {
    title: `Read: ${lesson.title || 'Story'}`,
    html,
    mount(el) {
      const root = el.querySelector('#reader-root') || el;
      const q = (selector) => root.querySelector(selector);
      const textEl = q('#reader-text');
      const mediaEl = q('#reader-media');
      const pageTitleEl = q('#reader-page-title');
      const pageLabelEl = q('#reader-page-label');
      const fillEl = q('#reader-progress-fill');
      const progressTextEl = q('#reader-progress-text');
      const ringEl = q('#reader-ring');
      const dotsEl = q('#reader-dots');
      const prevBtn = q('#reader-prev');
      const nextBtn = q('#reader-next');
      const finishBtn = q('#reader-finish');
      const finishSlot = q('#reader-finish-slot');
      const playBtn = q('#reader-play');
      const playIcon = q('#reader-play-icon');
      const playLabel = q('#reader-play-label');
      const pauseBtn = q('#reader-pause');
      const speedSel = q('#reader-speed');
      const volumeInput = q('#reader-volume');
      const muteBtn = q('#reader-mute');
      const langSel = q('#reader-lang');
      const voiceSel = q('#reader-voice');
      const statTime = q('#reader-stat-time');
      const statPages = q('#reader-stat-pages');
      const statWords = q('#reader-stat-words');
      const statMode = q('#reader-stat-mode');
      const statTrail = q('#reader-stat-trail');
      const recordBtn = q('#reader-record');
      const stopRecordBtn = q('#reader-record-stop');
      const recordStatus = q('#reader-record-status');
      const recordPreview = q('#reader-record-preview');

      const notify = (message, kind) => ctx.toast ? ctx.toast(message, kind) : uiToast(message, kind);
      const tracker = {
        startedAt: Date.now(),
        banked: 0,
        clockPaused: false,
        pages: new Set(),
        words: 0,
        trail: [mode],
        elapsed() {
          return this.banked + (this.clockPaused ? 0 : Date.now() - this.startedAt);
        }
      };

      let index = 0;
      let model = { words: [], sentences: [], html: '' };
      let speechState = 'stopped';
      let speechToken = 0;
      let fallbackTimer = null;
      let resumeFallback = null;
      let clearTimer = null;
      let lastOffset = 0;
      let lastSentence = 0;
      let alive = true;
      let tickTimer = null;
      let saveTimer = null;
      let completedRequested = false;
      let finalSaved = false;
      let saveChain = Promise.resolve();
      let recorder = null;
      let stream = null;
      let chunks = [];
      let recordStartedAt = 0;
      let pendingDataUrl = '';
      let previewUrl = '';
      let uploadBtn = null;

      const currentPage = () => pages[index] || null;
      const pageKey = (page) => String(page?.id ?? index);
      const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      function markRead(page) {
        if (!page || tracker.pages.has(pageKey(page))) return;
        tracker.pages.add(pageKey(page));
        tracker.words += wordsIn(page.text);
      }

      function updateStats() {
        if (statTime) statTime.textContent = clock(tracker.elapsed() / 1000);
        if (statPages) statPages.textContent = String(tracker.pages.size);
        if (statWords) statWords.textContent = String(tracker.words);
        if (statMode) statMode.textContent = modeInfo(mode).label;
        if (statTrail) statTrail.textContent = `Mode trail: ${tracker.trail.map((m) => modeInfo(m).label).join(' → ')}`;
      }

      function updatePlayUI() {
        if (!playBtn) return;
        playIcon.textContent = speechState === 'playing' ? '⏸' : '▶';
        playLabel.textContent = speechState === 'playing' ? 'Pause' : speechState === 'paused' ? 'Resume' : 'Play';
        playBtn.setAttribute('aria-label', speechState === 'playing' ? 'Pause narration' : speechState === 'paused' ? 'Resume narration' : 'Play narration');
        if (pauseBtn) pauseBtn.disabled = speechState !== 'playing';
      }

      function clearFallback() {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }

      function clearHighlights() {
        if (!textEl) return;
        textEl.querySelectorAll('.reader-word.reader-active-word, .reader-word.reader-active-sentence')
          .forEach((node) => node.classList.remove('reader-active-word', 'reader-active-sentence'));
      }

      function scrollToWord(node) {
        if (!node || reducedMotion() || typeof node.scrollIntoView !== 'function') return;
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      function highlightWord(wordIndex) {
        if (!textEl) return;
        const node = textEl.querySelector(`.reader-word[data-w="${wordIndex}"]`);
        if (!node) return;
        textEl.querySelectorAll('.reader-word.reader-active-word').forEach((n) => n.classList.remove('reader-active-word'));
        node.classList.add('reader-active-word');
        scrollToWord(node);
      }

      function highlightSentence(sentenceIndex) {
        if (!textEl || sentenceIndex < 0) return;
        lastSentence = sentenceIndex;
        textEl.querySelectorAll('.reader-word.reader-active-sentence').forEach((n) => n.classList.remove('reader-active-sentence'));
        const nodes = textEl.querySelectorAll(`.reader-word[data-s="${sentenceIndex}"]`);
        nodes.forEach((n) => n.classList.add('reader-active-sentence'));
        scrollToWord(nodes[0]);
      }

      function speakChunk(rawText, { startOffset = 0, highlight = false } = {}) {
        const source = String(rawText ?? '');
        const lead = source.length - source.trimStart().length;
        const body = source.trim();
        if (!body) return;
        if (!readingSpeech.supported()) {
          notify('Narration is not available in this browser. You can still read along visually.', 'info');
          speechState = 'stopped';
          updatePlayUI();
          return;
        }

        readingSpeech.stop();
        clearFallback();
        resumeFallback = null;
        if (clearTimer) clearTimeout(clearTimer);
        clearHighlights();
        const token = ++speechToken;
        const base = startOffset + lead;

        if (highlight && model.sentences.length) {
          const end = base + body.length;
          const chunkSentences = model.sentences.filter((s) => s.end > base && s.start < end);
          const startFallback = () => {
            if (token !== speechToken || speechState !== 'playing' || !chunkSentences.length) return;
            let at = 0;
            const step = () => {
              if (token !== speechToken || speechState !== 'playing') return;
              const sentence = chunkSentences[at++];
              if (!sentence) return;
              lastOffset = sentence.start;
              highlightSentence(sentence.index);
              const delay = Math.max(600, Math.round(sentence.words.length * 420 / prefs.rate));
              fallbackTimer = setTimeout(step, delay);
            };
            step();
          };
          resumeFallback = startFallback;
          fallbackTimer = setTimeout(() => { fallbackTimer = null; startFallback(); }, 450);
        }

        const started = readingSpeech.speak({
          text: body,
          lang: prefs.lang,
          voiceURI: prefs.voiceURI,
          rate: prefs.rate,
          pitch: 1,
          volume: prefs.muted ? 0 : prefs.volume,
          onBoundary: (event) => {
            if (token !== speechToken) return;
            clearFallback();
            resumeFallback = null;
            if (!highlight) return;
            const absolute = base + (Number(event.charIndex) || 0);
            lastOffset = absolute;
            const word = findWordAt(model, absolute);
            if (word) {
              highlightWord(word.index);
              highlightSentence(word.sentence);
            }
          },
          onEnd: () => {
            if (token !== speechToken) return;
            clearFallback();
            resumeFallback = null;
            speechState = 'stopped';
            updatePlayUI();
            clearTimer = setTimeout(() => { if (token === speechToken) clearHighlights(); }, 1000);
          }
        });

        if (started) {
          speechState = 'playing';
          updatePlayUI();
        } else {
          speechState = 'stopped';
          updatePlayUI();
          notify('Your browser could not start narration.', 'info');
        }
      }

      function stopSpeech() {
        speechToken += 1;
        readingSpeech.stop();
        clearFallback();
        resumeFallback = null;
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = null;
        clearHighlights();
        speechState = 'stopped';
        updatePlayUI();
      }

      function playPage() {
        const page = currentPage();
        if (page) speakChunk(page.text || '', { highlight: mode === 'along', startOffset: 0 });
      }

      function handlePlay() {
        if (speechState === 'paused') {
          if (readingSpeech.resume()) {
            speechState = 'playing';
            updatePlayUI();
            if (mode === 'along' && resumeFallback) resumeFallback();
          } else playPage();
        } else if (speechState === 'playing') {
          if (readingSpeech.pause()) { speechState = 'paused'; clearFallback(); updatePlayUI(); }
        } else playPage();
      }

      function handlePause() {
        if (speechState !== 'playing') return;
        if (readingSpeech.pause()) { speechState = 'paused'; clearFallback(); updatePlayUI(); }
      }

      function replaySentence() {
        const page = currentPage();
        if (!page || !model.sentences.length) return;
        const sentence = model.sentences[Math.min(lastSentence, model.sentences.length - 1)];
        speakChunk(String(page.text || '').slice(sentence.start, sentence.end), {
          startOffset: sentence.start,
          highlight: mode === 'along'
        });
      }

      function replayParagraph() {
        const page = currentPage();
        if (!page) return;
        const paragraphs = paragraphsOf(page.text || '');
        if (!paragraphs.length) return;
        const paragraph = paragraphs.find((p) => lastOffset >= p.start && lastOffset <= p.start + p.text.length) || paragraphs[0];
        speakChunk(paragraph.text, { startOffset: paragraph.start, highlight: mode === 'along' });
      }

      function renderMedia(page) {
        const imageUrl = safeUrl(page.media_url);
        const audioUrl = safeUrl(page.audio_url);
        let out = '';
        if (imageUrl) {
          const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(imageUrl) || /^data:video\//i.test(imageUrl);
          out += isVideo
            ? `<video class="reader-video" src="${esc(imageUrl)}" controls preload="metadata"></video>`
            : `<figure class="reader-figure"><img class="reader-image" src="${esc(imageUrl)}" alt="${esc(page.title || 'Story illustration')}" loading="lazy"></figure>`;
        }
        if (audioUrl) {
          out += `<div class="reader-audio"><span>🔊 Listen to this page</span><audio controls preload="none" src="${esc(audioUrl)}"></audio></div>`;
        }
        return out;
      }

      function renderPage() {
        const page = currentPage();
        if (!page) return;
        stopSpeech();
        lastOffset = 0;
        lastSentence = 0;
        model = buildTextModel(page.text || '');
        textEl.innerHTML = model.html || '<span class="reader-muted">No text on this page yet.</span>';
        pageTitleEl.textContent = page.title || `Page ${index + 1}`;
        mediaEl.innerHTML = renderMedia(page);
        pageLabelEl.textContent = `Page ${index + 1} of ${pages.length}`;
        dotsEl.innerHTML = pages.map((_, i) => `<button type="button" class="reader-dot ${i === index ? 'reader-dot-active' : ''}" data-page="${i}" aria-label="Go to page ${i + 1}" aria-current="${i === index}"></button>`).join('');
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index >= pages.length - 1;
        const percent = pages.length ? Math.round(((index + 1) / pages.length) * 100) : 0;
        fillEl.style.width = `${percent}%`;
        progressTextEl.textContent = `${percent}%`;
        ringEl.innerHTML = progressRing(percent, 58);
        markRead(page);
        updateStats();
        resetRecordingUI();
      }

      function goToPage(next) {
        if (next < 0 || next >= pages.length || next === index) return;
        queueSave(false);
        index = next;
        renderPage();
        queueSave(false);
      }

      function renderModeUI() {
        root.dataset.mode = mode;
        root.querySelectorAll('.reader-mode-btn').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
        });
        updateStats();
      }

      function setMode(next) {
        if (!MODES.some((m) => m.id === next) || next === mode) return;
        stopSpeech();
        mode = next;
        prefs.mode = next;
        savePrefs(prefs);
        tracker.trail.push(next);
        renderModeUI();
        queueSave(false);
        notify(`${modeInfo(next).label} mode`, 'info');
      }

      function finishReading() {
        stopSpeech();
        if (!finalSaved) {
          finalSaved = true;
          finishSlot.innerHTML = `<div class="reader-finish-note" role="status"><span>🎉</span>
            <div><strong>You finished the story!</strong><div class="reader-muted reader-small">${isTeacher ? 'Preview complete — nothing was saved.' : 'Your reading session was saved.'}</div></div>
            <button type="button" class="btn btn-soft btn-sm" id="reader-read-again">Read again ↻</button></div>`;
          const again = finishSlot.querySelector('#reader-read-again');
          if (again) again.addEventListener('click', () => goToPage(0));
          queueSave(true, true);
        }
      }

      // ---- Session saving: cumulative values, debounced, serialized ----
      function snapshot(completed) {
        return {
          mode,
          time_spent: Math.round(tracker.elapsed() / 1000),
          pages_read: tracker.pages.size,
          words_read: tracker.words,
          completed: Boolean(completed)
        };
      }

      function postSession(completed) {
        if (isTeacher) return Promise.resolve();
        saveChain = saveChain.then(() => ctx.api(`${baseUrl}/sessions`, {
          method: 'POST',
          body: snapshot(completed)
        })).catch(() => { /* saving is best-effort; never interrupt reading */ });
        return saveChain;
      }

      function queueSave(completed = false, immediate = false) {
        if (isTeacher) return;
        if (completed) completedRequested = true;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (immediate) {
          postSession(completed || completedRequested).then(() => { if (completed) finalSaved = true; });
        } else {
          saveTimer = setTimeout(() => {
            saveTimer = null;
            postSession(completedRequested);
          }, SAVE_DELAY_MS);
        }
      }

      // ---- Recording ----
      const recordingSupported = () => typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

      function stopStream() {
        if (stream) { stream.getTracks().forEach((track) => { try { track.stop(); } catch { /* ignore */ } }); stream = null; }
      }

      function resetRecordingUI() {
        if (!recordBtn) return;
        recordBtn.disabled = false;
        if (stopRecordBtn) stopRecordBtn.disabled = true;
        if (recordPreview) {
          recordPreview.classList.add('reader-hidden');
          recordPreview.innerHTML = '';
        }
        if (recordStatus) {
          recordStatus.textContent = recordingSupported()
            ? ''
            : 'Audio recording is not available in this browser. You can still finish your practice session.';
        }
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
        pendingDataUrl = '';
        uploadBtn = null;
        if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* ignore */ } }
        recorder = null;
        stopStream();
      }

      async function startRecording() {
        if (isTeacher) return;
        if (!recordingSupported()) {
          if (recordStatus) recordStatus.textContent = 'Audio recording is not available in this browser. You can still finish your practice session.';
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          recorder = new MediaRecorder(stream);
          recordStartedAt = performance.now();
          recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
          recorder.onstop = async () => {
            const duration = Math.round((performance.now() - recordStartedAt) / 100) / 10;
            stopStream();
            if (!alive || !chunks.length) return;
            const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
            chunks = [];
            try { pendingDataUrl = await blobToDataUrl(blob); } catch { pendingDataUrl = ''; }
            previewUrl = URL.createObjectURL(blob);
            if (recordPreview) {
              recordPreview.innerHTML = `<div class="reader-record-label">Your recording (${duration}s)</div>
                <audio controls preload="metadata" src="${esc(previewUrl)}"></audio>
                ${pendingDataUrl ? `<div class="reader-record-buttons">
                  <button type="button" class="btn btn-primary btn-sm" id="reader-upload-recording">Save recording</button>
                  <button type="button" class="btn btn-ghost btn-sm" id="reader-rerecord">Try again</button>
                </div>` : '<p class="reader-hint">Could not prepare this recording for upload.</p>'}`;
              recordPreview.classList.remove('reader-hidden');
              uploadBtn = recordPreview.querySelector('#reader-upload-recording');
              if (uploadBtn) uploadBtn.addEventListener('click', () => uploadRecording(duration));
              const again = recordPreview.querySelector('#reader-rerecord');
              if (again) again.addEventListener('click', resetRecordingUI);
            }
            if (recordBtn) recordBtn.disabled = false;
            if (stopRecordBtn) stopRecordBtn.disabled = true;
            if (recordStatus) recordStatus.textContent = pendingDataUrl ? 'Listen to your recording, then save it.' : 'Recording could not be prepared.';
          };
          recorder.start();
          if (recordBtn) recordBtn.disabled = true;
          if (stopRecordBtn) stopRecordBtn.disabled = false;
          if (recordPreview) recordPreview.classList.add('reader-hidden');
          if (recordStatus) recordStatus.textContent = 'Recording… read this page aloud.';
        } catch {
          stopStream();
          recorder = null;
          if (recordBtn) recordBtn.disabled = false;
          if (stopRecordBtn) stopRecordBtn.disabled = true;
          if (recordStatus) recordStatus.textContent = 'Microphone access was blocked. You can still finish your practice session.';
        }
      }

      function stopRecording() {
        if (recorder && recorder.state !== 'inactive') {
          try { recorder.stop(); } catch { stopStream(); }
        } else stopStream();
        if (stopRecordBtn) stopRecordBtn.disabled = true;
        if (recordStatus) recordStatus.textContent = 'Processing your recording…';
      }

      function uploadRecording(duration) {
        if (!pendingDataUrl || isTeacher) return;
        const page = currentPage();
        if (uploadBtn) uploadBtn.disabled = true;
        if (recordStatus) recordStatus.textContent = 'Saving your recording…';
        ctx.api(`${baseUrl}/recordings`, {
          method: 'POST',
          body: { dataUrl: pendingDataUrl, page_id: page?.id ?? null, duration }
        }).then(() => {
          if (recordStatus) recordStatus.textContent = 'Recording saved. Great job!';
          notify('Recording saved', 'success');
          if (recordPreview) recordPreview.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        }).catch((error) => {
          if (recordStatus) recordStatus.textContent = `Could not save your recording: ${error.message}`;
          if (uploadBtn) uploadBtn.disabled = false;
        });
      }

      // ---- Events and lifecycle ----
      root.querySelectorAll('.reader-mode-btn').forEach((button) => {
        button.addEventListener('click', () => setMode(button.dataset.mode));
      });
      playBtn?.addEventListener('click', handlePlay);
      pauseBtn?.addEventListener('click', handlePause);
      q('#reader-stop')?.addEventListener('click', stopSpeech);
      q('#reader-replay-sentence')?.addEventListener('click', replaySentence);
      q('#reader-replay-paragraph')?.addEventListener('click', replayParagraph);
      prevBtn.addEventListener('click', () => goToPage(index - 1));
      nextBtn.addEventListener('click', () => goToPage(index + 1));
      finishBtn?.addEventListener('click', finishReading);
      q('#reader-back')?.addEventListener('click', () => ctx.go('teacher/lessons'));

      dotsEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-page]');
        if (button) goToPage(Number(button.dataset.page));
      });

      speedSel?.addEventListener('change', () => {
        prefs.rate = clamp(speedSel.value, 0.6, 1.4);
        speedSel.value = String(prefs.rate);
        savePrefs(prefs);
      });
      volumeInput?.addEventListener('input', () => {
        prefs.volume = clamp(volumeInput.value, 0, 1);
        savePrefs(prefs);
      });
      muteBtn?.addEventListener('click', () => {
        prefs.muted = !prefs.muted;
        muteBtn.textContent = prefs.muted ? '🔇 Unmute' : '🔊 Mute';
        muteBtn.setAttribute('aria-pressed', String(prefs.muted));
        savePrefs(prefs);
        if (prefs.muted && speechState !== 'stopped') stopSpeech();
      });
      langSel?.addEventListener('change', () => {
        prefs.lang = langSel.value === 'fil-PH' ? 'fil-PH' : 'en-US';
        prefs.voiceURI = '';
        savePrefs(prefs);
        if (voiceSel) voiceSel.innerHTML = voiceOptions();
      });
      const refreshVoices = () => { if (voiceSel) voiceSel.innerHTML = voiceOptions(); };
      if (readingSpeech.supported() && typeof window !== 'undefined' && window.speechSynthesis?.addEventListener) {
        window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      }
      voiceSel?.addEventListener('change', () => {
        prefs.voiceURI = voiceSel.value || '';
        savePrefs(prefs);
      });

      root.querySelectorAll('[data-vocab]').forEach((button) => {
        button.addEventListener('click', () => {
          const panel = q(`#reader-vocab-def-${button.dataset.vocab}`);
          if (!panel) return;
          const open = panel.classList.toggle('reader-hidden');
          button.setAttribute('aria-expanded', String(!open));
        });
      });
      root.querySelectorAll('[data-vocab-speak]').forEach((button) => {
        button.addEventListener('click', () => {
          const word = vocabulary[Number(button.dataset.vocabSpeak)];
          if (!word) return;
          speakChunk(`${word.term}. ${word.definition || ''}`.trim(), { highlight: false });
        });
      });
      root.querySelectorAll('[data-game]').forEach((button) => {
        button.addEventListener('click', () => {
          if (suppliedAttempt) ctx.go(`student/play/${encodeURIComponent(suppliedAttempt)}`);
        });
      });
      root.querySelectorAll('[data-review-save]').forEach((button) => {
        button.addEventListener('click', async () => {
          const item = button.closest('[data-recording]');
          if (!item) return;
          try {
            await ctx.api(`/api/reading/recordings/${encodeURIComponent(button.dataset.reviewSave)}/review`, {
              method: 'POST',
              body: {
                score: item.querySelector('.reader-review-score').value,
                feedback: item.querySelector('.reader-review-feedback').value,
                status: 'reviewed'
              }
            });
            notify('Review saved', 'success');
          } catch (error) { notify(error.message, 'error'); }
        });
      });
      recordBtn?.addEventListener('click', startRecording);
      stopRecordBtn?.addEventListener('click', stopRecording);

      function onVisibility() {
        if (document.hidden) {
          if (!tracker.clockPaused) {
            tracker.banked += Date.now() - tracker.startedAt;
            tracker.clockPaused = true;
          }
          handlePause();
          queueSave(false, true);
        } else if (tracker.clockPaused) {
          tracker.startedAt = Date.now();
          tracker.clockPaused = false;
        }
      }

      function cleanup() {
        if (!alive) return;
        alive = false;
        if (tickTimer) clearInterval(tickTimer);
        if (saveTimer) clearTimeout(saveTimer);
        stopSpeech();
        resetRecordingUI();
        if (readingSpeech.supported() && typeof window !== 'undefined' && window.speechSynthesis?.removeEventListener) {
          window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
        }
        document.removeEventListener('pagehide', cleanup);
        document.removeEventListener('visibilitychange', onVisibility);
        if (!finalSaved) {
          finalSaved = true;
          if (!tracker.clockPaused) {
            tracker.banked += Date.now() - tracker.startedAt;
            tracker.clockPaused = true;
          }
          postSession(completedRequested).then(() => { saveChain = Promise.resolve(); });
        }
      }

      document.addEventListener('pagehide', cleanup);
      document.addEventListener('visibilitychange', onVisibility);
      tickTimer = setInterval(() => {
        if (!alive) return;
        if (!root.isConnected) { cleanup(); return; }
        updateStats();
      }, 1000);

      renderModeUI();
      renderPage();
    }
  };
}
