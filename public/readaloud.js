// EduPlay Interactive Read Aloud — word lookup, boundary highlighting,
// reading practice, animated companion, quizzes and progress helpers.

import { esc } from './ui.js';
import { readingSpeech } from './reading.js';
import { highlightHtml } from './highlight.js';

const norm = (value) => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function raTopMarkup(story, prefs) {
  const chips = [
    story.grade_level && `Grade ${esc(story.grade_level)}`,
    story.subject && esc(story.subject),
    story.reading_level && esc(story.reading_level),
    esc(story.category || 'Story')
  ].filter(Boolean).map((chip) => `<span class="ra-chip">${chip}</span>`).join('');
  return `<div class="ra-top">
    <div><h2>📖 ${esc(story.title)}</h2><div class="ra-chips">${chips}</div></div>
    <span class="grow"></span>
    <span class="ra-chip ra-chip-purple">🔊 ${esc(prefs?.narrationLang === 'fil-PH' ? 'Filipino' : 'English')}</span>
  </div>`;
}

function raProgressInner(index, total) {
  const percent = total ? Math.round((index / Math.max(1, total - 1)) * 100) : 0;
  return `<span>Page ${index + 1} of ${total}</span>
    <div class="ra-progress-track"><span style="width:${percent}%"></span></div>
    <span>${percent}%</span>`;
}

export function raProgressMarkup(index, total) {
  return `<div class="ra-progress">${raProgressInner(index, total)}</div>`;
}

export function raBuddyMarkup() {
  return `<div class="ra-buddy" data-ra-buddy>
    <img src="/assets/gameworld/mascot.svg" alt="" width="92">
    <div class="ra-bubble" data-ra-bubble>Tap a word to hear it again!</div>
  </div>`;
}

export function raTranscriptMarkup(text, prefs) {
  const html = highlightHtml(text, 'word', 'ra-word', 'ra-active');
  return `<div class="ra-panel"><h3>Read along</h3>
    <div class="ra-transcript" data-ra-transcript style="--ra-highlight:${esc(prefs?.highlightColor || '#fde68a')}">${html || '<span class="muted small">No narration text on this page.</span>'}</div>
    <p class="muted small" style="margin:.6rem 0 0">Tap any word for pronunciation, meaning and an example.</p></div>`;
}

export function raPracticeMarkup() {
  return `<div class="ra-practice">
    <div class="ra-practice-head"><div><h3 style="margin:0">🎤 Read It Yourself</h3>
      <p class="muted small" style="margin:.2rem 0 0">Read this page aloud. Pip will listen if your browser supports speech recognition.</p></div>
      <div class="ra-wave" data-ra-wave>${'<i></i>'.repeat(12)}</div>
      <button class="ra-mic-btn" data-ra-mic type="button">🎤 Start reading</button></div>
    <textarea class="field" data-ra-transcript-input rows="2" placeholder="Your words will appear here. You can also type what you read."></textarea>
    <div class="ra-practice-feedback" data-ra-practice-feedback>Ready when you are.</div>
  </div>`;
}

export function raQuizMarkup() {
  return `<div class="ra-quiz" data-ra-quiz hidden>
    <div class="ra-quiz-head"><div><h3>🧩 Story challenge</h3><p class="muted small" style="margin:.2rem 0 0">Answer questions from this story and collect rewards.</p></div>
      <span class="ra-chip ra-chip-mint" data-ra-quiz-count></span></div>
    <div data-ra-quiz-body></div>
  </div>`;
}

function showPopover(ctx, event, data, prefs) {
  document.querySelector('.ra-word-card')?.remove();
  const card = document.createElement('div');
  card.className = 'ra-word-card';
  card.innerHTML = `<button class="ra-close" type="button" aria-label="Close">✕</button>
    <h4>${esc(data.word)}<span class="ra-pos">${esc(data.partOfSpeech || 'word')}</span></h4>
    <p><strong>Meaning:</strong> ${esc(data.definition || 'No saved meaning yet.')}</p>
    ${data.example ? `<p class="ra-example">${esc(data.example)}</p>` : ''}
    <div class="ra-word-actions"><button class="btn btn-sm btn-soft" data-ra-say>🔊 Hear it</button>
      <button class="btn btn-sm btn-ghost" data-ra-slow>🐢 Say slowly</button></div>`;
  document.body.appendChild(card);
  const rect = event.currentTarget.getBoundingClientRect();
  card.style.left = `${Math.min(window.innerWidth - 340, Math.max(12, rect.left))}px`;
  card.style.top = `${Math.min(window.innerHeight - 230, rect.bottom + 8)}px`;
  const say = (rate) => readingSpeech.speak({
    text: data.word, lang: prefs?.narrationLang || 'en-US', rate,
    volume: prefs?.narrationVolume ?? 1, voiceURI: prefs?.voiceURI || ''
  });
  card.querySelector('[data-ra-say]').addEventListener('click', () => say(0.9));
  card.querySelector('[data-ra-slow]').addEventListener('click', () => say(0.55));
  const close = () => { card.remove(); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onOutside, true); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const onOutside = (e) => { if (!card.contains(e.target)) close(); };
  card.querySelector('.ra-close').addEventListener('click', close);
  setTimeout(() => { document.addEventListener('keydown', onKey); document.addEventListener('pointerdown', onOutside, true); }, 0);
}

function bindWordLookup(el, ctx, story, prefs) {
  const handler = async (event) => {
    const wordEl = event.target.closest('.ra-word, .res-word');
    if (!wordEl) return;
    const word = wordEl.textContent.trim().replace(/[^\p{L}\p{N}'-]/gu, '');
    if (!word) return;
    try {
      const data = await ctx.api(`/api/words/${encodeURIComponent(word)}?storyId=${story.id}`);
      showPopover(ctx, { currentTarget: wordEl }, data, prefs);
    } catch {
      showPopover(ctx, { currentTarget: wordEl }, {
        word, partOfSpeech: 'word', definition: 'No saved meaning for this word yet.', example: ''
      }, prefs);
    }
  };
  el.addEventListener('click', handler);
  return () => el.removeEventListener('click', handler);
}

function bindBuddy(el, getText) {
  const buddy = el.querySelector('[data-ra-buddy]');
  const bubble = el.querySelector('[data-ra-bubble]');
  if (!buddy || !bubble) return { setState() {}, destroy() {} };
  const messages = {
    playing: 'Listen closely...',
    paused: 'I will wait for you.',
    stopped: 'Tap a word if you want to hear it again.',
    finished: 'Wonderful reading!'
  };
  return {
    setState(state, text = '') {
      buddy.classList.toggle('is-listening', state === 'playing');
      buddy.classList.toggle('is-happy', state === 'finished');
      bubble.textContent = text || messages[state] || messages.stopped;
    },
    destroy() {}
  };
}

function bindPractice(el, ctx, story, getPage, prefs) {
  const button = el.querySelector('[data-ra-mic]');
  const input = el.querySelector('[data-ra-transcript-input]');
  const feedback = el.querySelector('[data-ra-practice-feedback]');
  const wave = el.querySelector('[data-ra-wave]');
  if (!button) return () => {};
  let recognition = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let listening = false;

  const stop = async () => {
    if (!listening) return;
    listening = false;
    button.classList.remove('listening');
    button.textContent = '🎤 Start reading';
    wave?.classList.remove('active');
    try { recognition?.stop(); } catch { /* ignore */ }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else await upload();
  };

  const upload = async () => {
    const transcript = input?.value || '';
    const duration = 0;
    let dataUrl = '';
    if (chunks.length) {
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    }
    if (!dataUrl) {
      feedback.textContent = transcript
        ? 'Reading saved as text. Microphone audio was unavailable.'
        : 'No audio or words captured. Try again.';
      return;
    }
    try {
      const result = await ctx.api(`/api/stories/${story.id}/recordings`, { method: 'POST', body: {
        dataUrl, transcript, duration, pageNumber: getPage() + 1
      } });
      feedback.textContent = `Nice try! Match score: ${result.score}%. ${result.stars ? `You earned ${result.stars} stars!` : 'Keep practicing.'}`;
      if (result.award) ctx.toast('Reading practice reward saved!', 'success');
    } catch (error) {
      feedback.textContent = error.message;
    }
  };

  button.addEventListener('click', async () => {
    if (listening) return stop();
    listening = true;
    button.classList.add('listening');
    button.textContent = '⏹ Stop and check';
    wave?.classList.add('active');
    feedback.textContent = 'Listening... read this page aloud.';
    input.value = '';
    chunks = [];
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => { stream?.getTracks().forEach((t) => t.stop()); upload(); };
      recorder.start();
    } catch {
      feedback.textContent = 'Microphone is unavailable. You can type what you read.';
    }
    if (Recognition) {
      recognition = new Recognition();
      recognition.lang = prefs?.narrationLang || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = '';
        for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0].transcript + ' ';
        input.value = text.trim();
      };
      recognition.onerror = () => { feedback.textContent = 'Speech recognition stopped. You can type what you read.'; };
      try { recognition.start(); } catch { /* already started */ }
    }
  });

  return () => { try { recognition?.stop(); } catch { /* ignore */ } if (recorder?.state !== 'inactive') recorder?.stop(); stream?.getTracks().forEach((t) => t.stop()); };
}

function bindQuiz(el, ctx, story, show) {
  const panel = el.querySelector('[data-ra-quiz]');
  const body = panel?.querySelector('[data-ra-quiz-body]');
  const count = panel?.querySelector('[data-ra-quiz-count]');
  if (!panel || !body) return { show() {}, destroy() {} };
  const questions = story.comprehension || [];
  const answers = [];
  let at = 0;

  const renderQuestion = () => {
    const q = questions[at];
    if (!q) return renderResult();
    const choices = q.choices || [];
    const isTF = choices.length === 2 && choices.some((c) => /true/i.test(c.text)) && choices.some((c) => /false/i.test(c.text));
    body.innerHTML = `<div class="ra-question">${at + 1}. ${esc(q.prompt)}</div>
      <div class="ra-options">${choices.map((c, i) => `<button class="ra-option" data-ra-answer="${esc(c.text)}" data-index="${i}" type="button">${isTF ? (i === 0 ? '✅ True' : '❌ False') : esc(c.text)}</button>`).join('')}</div>
      <div class="ra-quiz-feedback" data-ra-feedback>Choose one answer.</div>`;
    count.textContent = `Question ${at + 1} of ${questions.length}`;
    body.querySelectorAll('[data-ra-answer]').forEach((button) => button.addEventListener('click', async () => {
      body.querySelectorAll('[data-ra-answer]').forEach((b) => b.disabled = true);
      answers.push({ questionId: q.id, response: button.dataset.raAnswer });
      button.classList.add('correct');
      body.querySelector('[data-ra-feedback]').textContent = 'Saved! Loading next question...';
      at += 1;
      await new Promise((r) => setTimeout(r, 350));
      renderQuestion();
    }));
  };

  const renderResult = async () => {
    let result = null;
    try {
      result = await ctx.api(`/api/stories/${story.id}/comprehension/submit`, { method: 'POST', body: { answers } });
    } catch (error) {
      body.innerHTML = `<div class="empty"><h3>Could not save the quiz</h3><p>${esc(error.message)}</p></div>`;
      return;
    }
    body.innerHTML = `<div class="ra-quiz-result">
      <div class="result-emoji">${result.stars >= 2 ? '🏆' : '🎉'}</div>
      <h2>${result.percentage >= 70 ? 'Great reading!' : 'Good effort!'}</h2>
      <div class="ra-score">${result.percentage}%</div>
      <div class="ra-stars">${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</div>
      <p class="muted">${result.correct} of ${result.total} correct</p>
      <div class="ra-reward-row">
        ${result.award ? `<span class="ra-reward">★ ${result.award.stars} stars</span><span class="ra-reward">● ${result.award.coins} coins</span><span class="ra-reward">🚀 Level ${result.award.level}</span>` : ''}
      </div>
      <div class="row" style="justify-content:center"><button class="btn btn-primary" data-ra-retry>Try again</button>
        <button class="btn btn-soft" data-nav="student/library">Back to library</button></div>
    </div>`;
    body.querySelector('[data-ra-retry]')?.addEventListener('click', () => { answers.length = 0; at = 0; renderQuestion(); });
  };

  return {
    show() {
      if (!questions.length) { panel.hidden = false; body.innerHTML = '<p class="muted small">This story has no quiz questions yet.</p>'; return; }
      panel.hidden = false;
      at = 0; answers.length = 0; renderQuestion();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    destroy() {}
  };
}

export function enhanceStoryReader({ el, ctx, story, sections, prefs, getIndex, narration, go, saveSession }) {
  const buddy = bindBuddy(el);
  const unbindWords = bindWordLookup(el, ctx, story, prefs);
  const stopPractice = bindPractice(el, ctx, story, getIndex, prefs);
  const quiz = bindQuiz(el, ctx, story, () => {});
  let finished = false;

  const finishSession = async () => {
    if (finished) return;
    finished = true;
    narration?.stop?.();
    buddy.setState('finished', 'You finished the story! Take the challenge.');
    await saveSession?.(true);
    quiz.show();
  };

  el.querySelector('[data-ra-finish]')?.addEventListener('click', finishSession);
  return {
    setPage(index) {
      const progress = el.querySelector('[data-ra-progress]');
      if (progress) progress.innerHTML = raProgressInner(index, sections.length);
      const transcript = el.querySelector('[data-ra-transcript]');
      if (transcript) transcript.innerHTML = highlightHtml(String(sections[index]?.text || ''), 'word', 'ra-word', 'ra-active');
      buddy.setState('stopped', `Page ${index + 1} ready. Tap a word!`);
    },
    setState(state, text) { buddy.setState(state, text); },
    finish: finishSession,
    destroy() { unbindWords(); stopPractice(); quiz.destroy(); buddy.destroy(); }
  };
}
