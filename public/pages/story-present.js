import { esc } from '../ui.js';
import { narrationControls, attachPresentationNarration } from './presentation.js';

const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), location.href);
    return ['http:', 'https:', 'blob:'].includes(url.protocol) || url.href.startsWith('data:image/') ? url.href : '';
  } catch { return ''; }
}

function storyPageHtml(page) {
  if (!page) return '<div class="empty"><div class="big">📭</div><h3>No page</h3></div>';
  const preview = safeUrl(page.preview_url);
  if (preview) {
    return `<div class="story-present-page"><img src="${esc(preview)}" alt="${esc(page.title || 'Story page')}"></div>`;
  }
  return `<div class="story-present-page story-present-text">${String(page.html || '') ||
    `<p>${esc(String(page.text || '').slice(0, 1200))}</p>`}</div>`;
}

function endedHtml(title, backPath = 'student/library') {
  return `<div class="slideshow-shell"><div class="slideshow-ended">
    <div class="big">📖</div><h2>${esc(title)}</h2>
    <button class="btn btn-primary" data-nav="${esc(backPath)}">Back</button>
  </div></div>`;
}

/** Teacher-only Story Presenter View. */
export async function storyPresenterView(ctx) {
  const code = ctx.params[1];
  const session = await ctx.api(`/api/story-presentations/${encodeURIComponent(code)}`);
  const total = session.page_count;
  const pageAt = (index) => session.pages[index] || null;

  return {
    title: `Presenting — ${session.title}`,
    shell: false,
    html: `<div class="presenter-shell">
      <div class="presenter-top">
        <span class="presenter-brand">🎮 EduPlay Story Presenter</span>
        <button type="button" id="story-fullscreen">⛶ Full screen</button>
        <button type="button" id="story-tv" title="Open the audience view on the TV">📺 Open TV View</button>
        <span class="grow"></span><span>${esc(session.title)}</span>
        <button type="button" class="presenter-end" id="story-end">End Presentation</button>
      </div>
      <div class="presenter-privacy">🔒 Private Presenter View — open <strong>TV View</strong> on the TV or screen-share window. Do not share this presenter window.</div>
      <div class="presenter-grid">
        <section class="presenter-main">
          <div class="presenter-stage-wrap">
            <span class="presenter-overlay timer" id="story-timer">00:00:00
              <button type="button" id="story-pause">⏸</button><button type="button" id="story-resume">↻</button></span>
            <span class="presenter-overlay clock" id="story-clock">${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            <div class="presenter-stage story-present-stage" id="story-current">${storyPageHtml(pageAt(session.current_page))}</div>
          </div>
          <div class="presenter-controls">
            <button type="button" class="presenter-nav" id="story-prev" aria-label="Previous page">‹</button>
            <div><div class="presenter-counter" id="story-counter">Page ${session.current_page + 1} of ${total}</div>
              <div class="presenter-progress"><span id="story-progress"></span></div></div>
            <button type="button" class="presenter-nav" id="story-next" aria-label="Next page">›</button>
            <span class="presenter-hint">← → to turn</span>
          </div>
          <div class="presenter-narration-bar">${narrationControls('story-read', true)}</div>
        </section>
        <aside class="presenter-side">
          <h4>Next page</h4><div class="presenter-next" id="story-next-stage">${storyPageHtml(pageAt(session.current_page + 1))}</div>
          <div class="presenter-notes" id="story-notes"></div>
          <div class="presenter-code">Student join code <strong>${esc(session.code)}</strong></div>
        </aside>
      </div>
    </div>`,
    mount(el) {
      let current = session.current_page;
      let paused = Boolean(session.paused);
      let timerBase = session.elapsed_ms;
      let timerAt = Date.now();
      let narration = null;
      let ending = false;
      let clockTimer = null;

      const paint = () => {
        el.querySelector('#story-current').innerHTML = storyPageHtml(pageAt(current));
        el.querySelector('#story-next-stage').innerHTML = storyPageHtml(pageAt(current + 1));
        el.querySelector('#story-counter').textContent = `Page ${current + 1} of ${total}`;
        el.querySelector('#story-progress').style.width = `${((current + 1) / Math.max(1, total)) * 100}%`;
        const notes = el.querySelector('#story-notes');
        const text = String(pageAt(current)?.text || '').trim();
        notes.textContent = text || 'No narration text for this page.';
        notes.classList.toggle('empty', !text);
        el.querySelector('#story-prev').disabled = paused || current <= 0;
        el.querySelector('#story-next').disabled = paused || current >= total - 1;
        el.querySelector('#story-pause').disabled = paused;
        el.querySelector('#story-resume').disabled = !paused;
      };

      const send = async (patch, options = {}) => {
        if (patch.current_page !== undefined && !options.keepNarration) narration?.stop();
        try {
          const state = await ctx.api(`/api/story-presentations/${encodeURIComponent(code)}`, { method: 'PUT', body: patch });
          current = state.current_page;
          paused = Boolean(state.paused);
          timerBase = state.elapsed_ms;
          timerAt = Date.now();
          paint();
        } catch (error) {
          ctx.toast(error.message, 'error');
        }
      };

      let readAllToken = 0;
      const stopReadAll = () => {
        readAllToken += 1;
        const button = el.querySelector('#story-read-all');
        if (button) button.textContent = '📖 Read all';
      };
      const readAll = async () => {
        if (paused) { ctx.toast('Resume the presentation before reading all.', 'info'); return; }
        stopReadAll();
        const token = readAllToken;
        const button = el.querySelector('#story-read-all');
        if (button) button.textContent = '⏹ Stop reading all';
        while (token === readAllToken && current < total) {
          const finished = await new Promise((resolve) => narration?.speakOnce(resolve));
          if (token !== readAllToken || !finished) break;
          if (current >= total - 1) break;
          await send({ current_page: current + 1 }, { keepNarration: true });
        }
        if (token === readAllToken) stopReadAll();
      };

      const finish = async () => {
        if (ending) return;
        ending = true;
        stopReadAll();
        narration?.stop();
        try { await ctx.api(`/api/story-presentations/${encodeURIComponent(code)}/end`, { method: 'POST' }); }
        catch (error) { ctx.toast(error.message, 'error'); ending = false; return; }
        ctx.go(`teacher/library/${session.story_id}`);
      };

      const onKey = (event) => {
        if (event.target?.matches?.('input,textarea,select')) return;
        if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); stopReadAll(); send({ current_page: current + 1 }); }
        else if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); stopReadAll(); send({ current_page: current - 1 }); }
      };

      narration = attachPresentationNarration(el, 'story-read', () => String(pageAt(current)?.text || ''));
      el.querySelector('#story-prev').addEventListener('click', () => { stopReadAll(); send({ current_page: current - 1 }); });
      el.querySelector('#story-next').addEventListener('click', () => { stopReadAll(); send({ current_page: current + 1 }); });
      el.querySelector('#story-pause').addEventListener('click', () => { stopReadAll(); send({ paused: true }); });
      el.querySelector('#story-resume').addEventListener('click', () => send({ paused: false }));
      el.querySelector('#story-read-all')?.addEventListener('click', () => {
        if (el.querySelector('#story-read-all').textContent.includes('Stop')) stopReadAll();
        else readAll();
      });
      el.querySelector('#story-end').addEventListener('click', finish);
      el.querySelector('#story-tv')?.addEventListener('click', () => {
        window.open(`#/teacher/story-audience/${encodeURIComponent(code)}`, '_blank', 'noopener');
      });
      el.querySelector('#story-fullscreen').addEventListener('click', () => {
        const shell = el.querySelector('.presenter-shell');
        if (document.fullscreenElement) document.exitFullscreen?.();
        else shell.requestFullscreen?.();
      });
      document.addEventListener('keydown', onKey);
      paint();
      clockTimer = setInterval(() => {
        const ms = paused ? timerBase : timerBase + (Date.now() - timerAt);
        el.querySelector('#story-timer').firstChild.textContent = formatElapsed(ms);
        el.querySelector('#story-clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }, 250);
      el.__cleanupPresentation = () => {
        clearInterval(clockTimer);
        stopReadAll();
        narration?.stop();
        document.removeEventListener('keydown', onKey);
      };
    }
  };
}

/** Student-only Story Slide Show. */
export async function storySlideshowPage(ctx) {
  const code = ctx.params[1];
  let state;
  const backPath = ctx.state.user.role === 'teacher' ? 'teacher/library' : 'student/library';
  try {
    state = await ctx.api(`/api/story-presentations/${encodeURIComponent(code)}/state`);
  } catch (error) {
    return { title: 'Presentation unavailable', shell: false, html: endedHtml(error.message, backPath) };
  }
  if (state.status === 'ended') {
    return { title: 'Presentation ended', shell: false, html: endedHtml('The story presentation has ended.', backPath) };
  }

  return {
    title: state.title,
    shell: false,
    html: `<div class="slideshow-shell"><div class="slideshow-stage story-present-stage" id="story-show-stage">
      ${storyPageHtml(state.pages[0])}
    </div><div class="slideshow-narration" id="story-show-narration">${narrationControls('storyshow-read')}</div></div>`,
    mount(el) {
      const stage = el.querySelector('#story-show-stage');
      const bar = el.querySelector('#story-show-narration');
      let current = state.current_page;
      let active = true;
      let pollTimer = null;
      let hideTimer = null;
      let narration = null;
      const showNarration = () => {
        bar?.classList.add('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => bar?.classList.remove('visible'), 4000);
      };
      const end = (message) => {
        if (!active) return;
        active = false;
        clearInterval(pollTimer); clearTimeout(hideTimer);
        narration?.stop();
        el.querySelector('.slideshow-shell').innerHTML = `<div class="slideshow-ended">
          <div class="big">📖</div><h2>${esc(message)}</h2>
          <button class="btn btn-primary" data-nav="${esc(backPath)}">Back</button></div>`;
        el.querySelector('[data-nav]')?.addEventListener('click', (event) => ctx.go(event.currentTarget.dataset.nav));
      };
      const onKey = (event) => { if (event.key === 'Escape' && active) ctx.go('student/library'); };
      narration = attachPresentationNarration(el, 'storyshow-read', () => String(state.pages?.[0]?.text || ''));
      showNarration();
      document.addEventListener('mousemove', showNarration);
      document.addEventListener('keydown', onKey);
      pollTimer = setInterval(async () => {
        if (!active) return;
        try {
          const next = await ctx.api(`/api/story-presentations/${encodeURIComponent(code)}/state`);
          if (!active) return;
          if (next.status === 'ended') { end('The story presentation has ended.'); return; }
          if (next.current_page !== current) {
            current = next.current_page;
            state = next;
            narration?.stop();
            stage.innerHTML = storyPageHtml(next.pages[0]);
          }
        } catch { /* keep the page visible during brief network errors */ }
      }, 900);
      el.__cleanupPresentation = () => {
        active = false;
        clearInterval(pollTimer); clearTimeout(hideTimer);
        narration?.stop();
        document.removeEventListener('mousemove', showNarration);
        document.removeEventListener('keydown', onKey);
      };
    }
  };
}
