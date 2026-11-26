import { esc } from '../ui.js';
import { readingSpeech } from '../reading.js';
import { mountPptxSlide, pptxEngineAvailable } from '../presentation-engine.js';

const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const clockTime = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};

async function endSessionKeepAlive(code, token) {
  try {
    await fetch(`/api/presentations/${encodeURIComponent(code)}/end`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      keepalive: true
    });
  } catch { /* the teacher may simply be changing pages */ }
}

export function narrationControls(prefix, withReadAll = false) {
  return `<div class="pres-narration" data-narration>
    <button type="button" id="${prefix}-read" class="btn btn-sm btn-primary">▶ Read aloud</button>
    ${withReadAll ? `<button type="button" id="${prefix}-all" class="btn btn-sm btn-soft">📖 Read all</button>` : ''}
    <button type="button" id="${prefix}-pause" class="btn btn-sm btn-ghost">⏸ Pause</button>
    <button type="button" id="${prefix}-resume" class="btn btn-sm btn-ghost">▶ Resume</button>
    <button type="button" id="${prefix}-stop" class="btn btn-sm btn-ghost">⏹ Stop</button>
    <button type="button" id="${prefix}-replay" class="btn btn-sm btn-ghost">↺ Replay</button>
    <label>Language <select id="${prefix}-lang"><option value="en-US">English</option><option value="fil-PH">Filipino</option></select></label>
    <label>Voice <select id="${prefix}-voice"><option value="">Default voice</option></select></label>
    <label>Speed <input id="${prefix}-rate" type="range" min="0.5" max="1.5" step="0.1" value="0.9"></label>
    <span id="${prefix}-narration-status" class="pres-narration-status"></span>
  </div>`;
}

export function attachPresentationNarration(root, prefix, getText) {
  const speech = readingSpeech;
  const q = (name) => root.querySelector(`#${prefix}-${name}`);
  const read = q('read'); const pause = q('pause'); const resume = q('resume');
  const stopBtn = q('stop'); const replay = q('replay');
  const lang = q('lang'); const voice = q('voice'); const rate = q('rate');
  const status = q('narration-status');
  if (!read) return { stop() {} };
  let active = false;

  const setStatus = (message = '') => { if (status) status.textContent = message; };
  const refreshVoices = () => {
    const options = speech.voices(lang.value || 'en-US');
    voice.innerHTML = '<option value="">Default voice</option>' + options.map((v) =>
      `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  };
  const speak = (onDone) => {
    const text = String(getText() || '').trim();
    if (!text) { setStatus('No slide text to read.'); if (onDone) onDone(false); return false; }
    let finished = false;
    let timer = null;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      active = false;
      setStatus(ok ? '' : 'Read Aloud is unavailable on this device.');
      if (onDone) onDone(ok);
    };
    const started = speech.speak({
      text, lang: lang.value, rate: Number(rate.value) || 0.9, volume: 1, voiceURI: voice.value,
      onEnd: () => finish(true),
      onError: () => finish(false)
    });
    if (!started) finish(false);
    else {
      active = true;
      setStatus('Reading this slide…');
      timer = setTimeout(() => finish(true), Math.max(5000, text.length * 90));
    }
    return started;
  };
  const stop = () => { speech.stop(); active = false; setStatus(''); };

  read.addEventListener('click', () => speak());
  replay.addEventListener('click', () => speak());
  pause.addEventListener('click', () => { if (speech.pause()) setStatus('Paused.'); });
  resume.addEventListener('click', () => { if (speech.resume()) setStatus('Reading this slide…'); });
  stopBtn.addEventListener('click', stop);
  lang.addEventListener('change', refreshVoices);
  refreshVoices();
  return { stop, speakOnce: (onDone) => speak(onDone), isActive: () => active };
}

function endedHtml(title, backPath = 'student/library') {
  return `<div class="slideshow-shell"><div class="slideshow-ended">
    <div class="big">📽️</div><h2>${esc(title)}</h2>
    <button class="btn btn-primary" data-nav="${esc(backPath)}">Back</button>
  </div></div>`;
}

/** Teacher-only Presenter View. shell:false keeps the whole viewport private. */
export async function presenterView(ctx) {
  const code = ctx.params[1];
  const session = await ctx.api(`/api/presentations/${encodeURIComponent(code)}`);
  const slides = session.material?.slides || [];
  const total = session.slide_count || slides.length;
  const slideAt = (index) => slides.find((slide) => Number(slide.slide_number) === index + 1) || slides[index] || null;

  return {
    title: `Presenting — ${session.title}`,
    shell: false,
    html: `<div class="presenter-shell">
      <div class="presenter-top">
        <span class="presenter-brand">🎮 EduPlay Presenter</span>
        <button type="button" title="Toggle full screen" id="presenter-fullscreen">⛶ Full screen</button>
        <button type="button" id="presenter-tv" title="Open the audience view on the TV">📺 Open TV View</button>
        <span class="grow"></span>
        <span>${esc(session.file_name || 'PowerPoint presentation')}</span>
        <button type="button" class="presenter-end" id="presenter-end">End Presentation</button>
      </div>
      <div class="presenter-privacy">🔒 Private Presenter View — open <strong>TV View</strong> on the TV or screen-share window. Do not share this presenter window.</div>
      <div class="presenter-grid">
        <section class="presenter-main">
          <div class="presenter-stage-wrap">
            <span class="presenter-overlay timer" id="presenter-timer-box">00:00:00
              <button type="button" id="presenter-pause" title="Pause presentation">⏸</button>
              <button type="button" id="presenter-resume" title="Resume presentation">↻</button>
            </span>
            <span class="presenter-overlay clock" id="presenter-clock">${clockTime()}</span>
            <div class="presenter-stage" id="presenter-current"></div>
          </div>
          <div class="presenter-controls">
            <button type="button" class="presenter-nav" id="presenter-prev" aria-label="Previous slide">‹</button>
            <div><div class="presenter-counter" id="presenter-counter">Slide ${session.current_slide + 1} of ${total}</div>
              <div class="presenter-progress"><span id="presenter-progress"></span></div></div>
            <button type="button" class="presenter-nav" id="presenter-next" aria-label="Next slide">›</button>
            <span class="presenter-hint">← → to turn</span>
            <button type="button" class="btn btn-sm btn-soft" id="presenter-pause-main">⏸ Pause</button>
            <button type="button" class="btn btn-sm btn-soft" id="presenter-resume-main">▶ Resume</button>
          </div>
          <div class="presenter-narration-bar">${narrationControls('presenter-read', true)}</div>
        </section>
        <aside class="presenter-side">
          <h4>Next slide</h4>
          <div class="presenter-next" id="presenter-next-stage"></div>
          <div class="presenter-notes" id="presenter-notes"></div>
          <div class="presenter-code">Student join code <strong>${esc(session.code)}</strong></div>
        </aside>
      </div>
    </div>`,
    mount(el) {
      let current = session.current_slide;
      let paused = Boolean(session.paused);
      let timerBase = session.elapsed_ms;
      let timerAt = Date.now();
      let currentDeck = null;
      let nextDeck = null;
      let ended = false;
      let ending = false;
      let clockTimer = null;
      let narration = null;

      const setButtons = () => {
        const prev = el.querySelector('#presenter-prev');
        const next = el.querySelector('#presenter-next');
        if (prev) prev.disabled = paused || current <= 0;
        if (next) next.disabled = paused || current >= total - 1;
        el.querySelector('#presenter-pause').disabled = paused;
        el.querySelector('#presenter-resume').disabled = !paused;
        el.querySelector('#presenter-pause-main').disabled = paused;
        el.querySelector('#presenter-resume-main').disabled = !paused;
      };

      const paintText = () => {
        el.querySelector('#presenter-counter').textContent = `Slide ${current + 1} of ${total}`;
        el.querySelector('#presenter-progress').style.width = `${((current + 1) / Math.max(1, total)) * 100}%`;
        const note = String(slideAt(current)?.notes || '').trim();
        const notes = el.querySelector('#presenter-notes');
        notes.textContent = note || 'No speaker notes for this slide.';
        notes.classList.toggle('empty', !note);
        setButtons();
      };

      const paintSlides = () => {
        currentDeck?.render(current, session.transitions?.[current]);
        nextDeck?.render(Math.min(total - 1, current + 1), session.transitions?.[current + 1]);
        paintText();
      };

      const applyState = (state, renderSlides = true) => {
        const changed = state.current_slide !== current;
        current = state.current_slide;
        paused = Boolean(state.paused);
        timerBase = state.elapsed_ms;
        timerAt = Date.now();
        if (renderSlides && changed) paintSlides();
        else paintText();
      };

      const send = async (patch, options = {}) => {
        if (patch.current_slide !== undefined && !options.keepNarration) narration?.stop();
        try {
          const state = await ctx.api(`/api/presentations/${encodeURIComponent(code)}`, { method: 'PUT', body: patch });
          applyState(state, true);
        } catch (error) {
          if (error.status === 409) ctx.toast(error.message, 'info');
          else ctx.toast(error.message, 'error');
        }
      };

      let readAllToken = 0;
      const stopReadAll = () => {
        readAllToken += 1;
        const button = el.querySelector('#presenter-read-all');
        if (button) button.textContent = '📖 Read all';
      };
      const readAll = async () => {
        if (paused) { ctx.toast('Resume the presentation before reading all.', 'info'); return; }
        stopReadAll();
        const token = readAllToken;
        const button = el.querySelector('#presenter-read-all');
        if (button) button.textContent = '⏹ Stop reading all';
        while (token === readAllToken && current < total) {
          const finished = await new Promise((resolve) => narration?.speakOnce(resolve));
          if (token !== readAllToken || !finished) break;
          if (current >= total - 1) break;
          await send({ current_slide: current + 1 }, { keepNarration: true });
        }
        if (token === readAllToken) stopReadAll();
      };

      const finish = async () => {
        if (ending) return;
        stopReadAll();
        ending = true;
        narration?.stop();
        try { await ctx.api(`/api/presentations/${encodeURIComponent(code)}/end`, { method: 'POST' }); }
        catch (error) { ctx.toast(error.message, 'error'); ending = false; return; }
        ended = true;
        ctx.go(`teacher/materials/${session.material_id}`);
      };

      const onKey = (event) => {
        if (ended || event.target?.matches?.('input,textarea,select')) return;
        if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); stopReadAll(); send({ current_slide: current + 1 }); }
        else if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); stopReadAll(); send({ current_slide: current - 1 }); }
      };

      (async () => {
        try {
          if (!pptxEngineAvailable()) throw new Error('The local PowerPoint viewer did not load. Reload the page.');
          const [a, b] = await Promise.all([
            mountPptxSlide(el.querySelector('#presenter-current'), session.presentation_url, session.aspect, { width: 1600 }),
            mountPptxSlide(el.querySelector('#presenter-next-stage'), session.presentation_url, session.aspect, { width: 960 })
          ]);
          currentDeck = a;
          nextDeck = b;
          paintSlides();
        } catch (error) {
          el.querySelector('#presenter-current').innerHTML = `<div class="pptx-error"><div class="big">📽️</div>
            <strong>${esc(error.message)}</strong></div>`;
          ctx.toast(error.message, 'error');
        }
      })();

      el.querySelector('#presenter-prev').addEventListener('click', () => { stopReadAll(); send({ current_slide: current - 1 }); });
      el.querySelector('#presenter-next').addEventListener('click', () => { stopReadAll(); send({ current_slide: current + 1 }); });
      el.querySelector('#presenter-pause').addEventListener('click', () => { stopReadAll(); send({ paused: true }); });
      el.querySelector('#presenter-pause-main').addEventListener('click', () => { stopReadAll(); send({ paused: true }); });
      el.querySelector('#presenter-resume').addEventListener('click', () => send({ paused: false }));
      el.querySelector('#presenter-resume-main').addEventListener('click', () => send({ paused: false }));
      el.querySelector('#presenter-read-all')?.addEventListener('click', () => {
        if (el.querySelector('#presenter-read-all').textContent.includes('Stop')) stopReadAll();
        else readAll();
      });
      el.querySelector('#presenter-end').addEventListener('click', finish);
      el.querySelector('#presenter-tv')?.addEventListener('click', () => {
        window.open(`#/teacher/audience/${encodeURIComponent(code)}`, '_blank', 'noopener');
      });
      el.querySelector('#presenter-fullscreen').addEventListener('click', async () => {
        const shell = el.querySelector('.presenter-shell');
        try {
          if (document.fullscreenElement) await document.exitFullscreen?.();
          else await shell.requestFullscreen?.();
        } catch { /* fullscreen can be blocked by the browser */ }
      });
      narration = attachPresentationNarration(el, 'presenter-read', () =>
        slideAt(current)?.narration_script || slideAt(current)?.text || '');
      document.addEventListener('keydown', onKey);
      paintText();
      clockTimer = setInterval(() => {
        const ms = paused ? timerBase : timerBase + (Date.now() - timerAt);
        el.querySelector('#presenter-timer-box').firstChild.textContent = formatElapsed(ms);
        el.querySelector('#presenter-clock').textContent = clockTime();
      }, 250);
      el.requestFullscreen?.().catch?.(() => {});
      el.__cleanupPresentation = () => {
        clearInterval(clockTimer);
        stopReadAll();
        narration?.stop();
        document.removeEventListener('keydown', onKey);
        currentDeck?.destroy();
        nextDeck?.destroy();
      };
    }
  };
}

/** Student-only Slide Show. No notes, upcoming slides or private controls. */
export async function slideshowPage(ctx) {
  const code = ctx.params[1];
  let state;
  const backPath = ctx.state.user.role === 'teacher' ? 'teacher/materials' : 'student/library';
  try {
    state = await ctx.api(`/api/presentations/${encodeURIComponent(code)}/state`);
  } catch (error) {
    return { title: 'Presentation unavailable', shell: false, html: endedHtml(error.message, backPath) };
  }
  if (state.status === 'ended') {
    return { title: 'Presentation ended', shell: false, html: endedHtml('The presentation has ended.', backPath) };
  }

  return {
    title: state.title,
    shell: false,
    html: `<div class="slideshow-shell"><div class="slideshow-stage" id="slideshow-stage">
      <div class="slideshow-boot">Loading presentation…</div>
    </div><div class="slideshow-narration" id="slideshow-narration">${narrationControls('slideshow-read')}</div></div>`,
    mount(el) {
      const stage = el.querySelector('#slideshow-stage');
      const narrationBar = el.querySelector('#slideshow-narration');
      let deck = null;
      let narration = null;
      let current = -1;
      let pollTimer = null;
      let hideTimer = null;
      let active = true;
      const showNarration = () => {
        narrationBar?.classList.add('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => narrationBar?.classList.remove('visible'), 4000);
      };
      narration = attachPresentationNarration(el, 'slideshow-read', () => state.slide_texts?.[current] || '');
      showNarration();
      document.addEventListener('mousemove', showNarration);
      const end = (message) => {
        if (!active) return;
        active = false;
        clearInterval(pollTimer);
        clearTimeout(hideTimer);
        narration?.stop();
        deck?.destroy();
        el.querySelector('.slideshow-shell').innerHTML = `<div class="slideshow-ended">
          <div class="big">📽️</div><h2>${esc(message)}</h2>
          <button class="btn btn-primary" data-nav="${esc(backPath)}">Back</button></div>`;
        el.querySelector('[data-nav]')?.addEventListener('click', (event) => ctx.go(event.currentTarget.dataset.nav));
      };
      const onKey = (event) => { if (event.key === 'Escape' && active) ctx.go('student/library'); };
      const onPageHide = () => { if (active) { active = false; clearInterval(pollTimer); } };

      (async () => {
        try {
          deck = await mountPptxSlide(stage, state.presentation_url, state.aspect, { width: 1600 });
          if (!active) return;
          current = state.current_slide;
          deck.render(current, state.transitions?.[current]);
          document.documentElement.requestFullscreen?.().catch?.(() => {});
        } catch (error) {
          end(error.message);
        }
      })();

      pollTimer = setInterval(async () => {
        if (!active) return;
        try {
          const next = await ctx.api(`/api/presentations/${encodeURIComponent(code)}/state`);
          if (!active) return;
          if (next.status === 'ended') { end('The presentation has ended.'); return; }
          if (next.current_slide !== current) {
            current = next.current_slide;
            narration?.stop();
            deck?.render(current, next.transitions?.[current]);
          }
        } catch { /* keep the current slide visible through brief network errors */ }
      }, 900);

      document.addEventListener('keydown', onKey);
      window.addEventListener('pagehide', onPageHide, { once: true });
      el.__cleanupPresentation = () => {
        active = false;
        clearInterval(pollTimer);
        clearTimeout(hideTimer);
        narration?.stop();
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('mousemove', showNarration);
        deck?.destroy();
      };
    }
  };
}
