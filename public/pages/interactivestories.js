import { esc, sound } from '../ui.js';
import { readingSpeech } from '../reading.js';
import { highlightHtml } from '../highlight.js';
import { generateStoryboard } from '../storyboard-generator.js';

const CATEGORIES = ['Nursery Rhymes', 'Animal Stories', 'Fairy Tales', 'Fables', 'Educational Stories'];
const GRADES = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
const ANIMALS = { owl: '', fox: '🦊', bear: '🐻', fish: '🐠', bird: '🐦', rabbit: '🐰' };
const HOTSPOT_ICONS = { star: '★', leaf: '🍃', cloud: '☁️', heart: '♥', bell: '🔔' };

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), location.href);
    return ['http:', 'https:', 'blob:', 'data:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function parseTextStory(text, name = '') {
  const lines = String(text || '').split(/\r?\n/);
  let title = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || 'Imported Story';
  let description = '';
  const scenes = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,2}\s+/.test(line)) {
      const heading = line.replace(/^#{1,2}\s+/, '').trim();
      if (!scenes.length && !current) title = heading;
      else { current = { title: heading, text: '', background: 'meadow', character: 'owl', expression: 'happy', action: 'idle', hotspots: [] }; scenes.push(current); }
      continue;
    }
    if (/^>\s*/.test(line)) { description = (description + ' ' + line.replace(/^>\s*/, '')).trim(); continue; }
    if (!current) { current = { title: `Scene ${scenes.length + 1}`, text: '', background: 'meadow', character: 'owl', expression: 'happy', action: 'idle', hotspots: [] }; scenes.push(current); }
    current.text = `${current.text} ${line}`.trim();
  }
  if (!scenes.length) scenes.push({ title: 'Scene 1', text: String(text || '').trim(), background: 'meadow', character: 'owl', expression: 'happy', action: 'idle', hotspots: [] });
  scenes.forEach((scene, i) => {
    if (!scene.text.trim()) return;
    scene.title = scene.title || `Scene ${i + 1}`;
    scene.hotspots = [{
      label: scene.text.split(/\s+/).slice(0, 2).join(' ').replace(/[^\p{L}\p{N} ]/gu, '') || 'Look here',
      kind: 'star', x: 50, y: 55,
      feedback: scene.text.split(/[.!?]/)[0] || 'Listen to this part again.',
      sound: 'click'
    }];
  });
  return { title, description, category: 'Animal Stories', grade_level: 'Grade 1', scenes, activities: [] };
}

function parseImportedStory(text, name = '') {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (ext === 'json') {
    const data = JSON.parse(text);
    return {
      title: data.title || name.replace(/\.json$/i, ''),
      description: data.description || '',
      category: CATEGORIES.includes(data.category) ? data.category : 'Animal Stories',
      grade_level: data.grade_level || 'Grade 1',
      coverUrl: data.coverUrl || '',
      scenes: Array.isArray(data.scenes) ? data.scenes : [],
      activities: Array.isArray(data.activities) ? data.activities : []
    };
  }
  if (ext === 'html' || ext === 'htm') {
    const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
    const title = doc.querySelector('h1,h2,title')?.textContent?.trim() || name.replace(/\.[^.]+$/, '');
    const description = doc.querySelector('p')?.textContent?.trim() || '';
    const blocks = [...doc.querySelectorAll('h2,h3,p,li')]
      .map((node) => ({ tag: node.tagName, text: node.textContent.trim() }))
      .filter((item) => item.text && !item.text.includes(title));
    const scenes = [];
    let current = null;
    blocks.forEach((block) => {
      if (block.tag === 'H2' || block.tag === 'H3') {
        current = { title: block.text, text: '', background: 'meadow', character: 'owl', expression: 'happy', action: 'idle', hotspots: [] };
        scenes.push(current);
      } else if (!current) {
        current = { title: `Scene ${scenes.length + 1}`, text: block.text, background: 'meadow', character: 'owl', expression: 'happy', action: 'idle', hotspots: [] };
        scenes.push(current);
      } else current.text = `${current.text} ${block.text}`.trim();
    });
    if (!scenes.length) return parseTextStory(doc.body.textContent || '', name);
    scenes.forEach((scene, i) => {
      scene.title = scene.title || `Scene ${i + 1}`;
      scene.hotspots = [{ label: 'Look here', kind: 'star', x: 50, y: 55, feedback: scene.text.split(/[.!?]/)[0] || 'Listen again.', sound: 'click' }];
    });
    return { title, description, category: 'Animal Stories', grade_level: 'Grade 1', scenes, activities: [] };
  }
  return parseTextStory(text, name);
}

function coverHtml(story) {
  const url = safeUrl(story.cover_url);
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy">`;
  const colors = {
    'Nursery Rhymes': 'linear-gradient(145deg,#99f6e4,#fde68a)',
    'Animal Stories': 'linear-gradient(145deg,#86efac,#fbcfe8)',
    'Fairy Tales': 'linear-gradient(145deg,#c4b5fd,#f9a8d4)',
    Fables: 'linear-gradient(145deg,#fdba74,#fde68a)',
    'Educational Stories': 'linear-gradient(145deg,#7dd3fc,#a7f3d0)'
  };
  return `<div class="ias-cover-badge">${esc(story.category)}</div><style>.ias-cover{background:${colors[story.category] || colors['Animal Stories']}}</style>`;
}

function art(scene, hotspots = []) {
  const bg = ['meadow', 'sunset', 'night', 'forest'].includes(scene.background) ? scene.background : 'meadow';
  const animal = ANIMALS[scene.character] ?? '';
  const image = safeUrl(scene.image_url);
  const expression = ['happy', 'curious', 'sleepy', 'surprised'].includes(scene.expression) ? scene.expression : 'happy';
  const action = ['idle', 'wave', 'hop', 'dance'].includes(scene.action) ? scene.action : 'idle';
  return `${image ? `<img class="ias-image" src="${esc(image)}" alt="">` : ''}
    <div class="ias-layer ias-sky ${bg}"><div class="ias-cloud"></div><div class="ias-sun"></div>
      ${bg === 'night' ? '<span style="position:absolute;left:22%;top:18%;color:#fff">✦</span><span style="position:absolute;right:28%;top:12%;color:#fff">✧</span>' : ''}
    </div>
    <div class="ias-layer"><div class="ias-hill"></div><div class="ias-ground"></div>
      <div class="ias-tree a"></div><div class="ias-tree b"></div>
      ${animal ? `<div class="ias-friend one">${animal}</div><div class="ias-friend two">${animal}</div>` : ''}
      <div class="ias-hero ias-${expression} ias-${action}"><img src="/assets/gameworld/mascot.svg" alt=""></div>
    </div>
    <div class="ias-dialogue" data-ias-dialogue>${expression === 'surprised' ? 'Wow!' : expression === 'sleepy' ? 'Yawn...' : expression === 'curious' ? 'Hmm...' : 'Hello, friend!'}</div>
    <div class="ias-caption">${esc(scene.title || 'A new scene')}</div>
    ${hotspots.map((h, i) => `<button type="button" class="ias-hotspot" data-ias-hotspot="${i}" style="left:${Number(h.x) || 50}%;top:${Number(h.y) || 50}%" aria-label="${esc(h.label || 'Interactive object')}">${HOTSPOT_ICONS[h.kind] || '★'}</button>`).join('')}`;
}

export async function interactiveStoriesPage(ctx) {
  const stories = await ctx.api('/api/interactive-stories');
  let category = ''; let grade = '';
  return {
    title: 'Interactive Animated Stories',
    html: `<div class="ias-page">
      <div class="ias-head"><div><h1>✨ Interactive Animated Stories</h1><p>Tap characters, answer questions and help the story move forward.</p></div>
        <button class="ias-btn ias-soft" data-nav="student/reading">← Back to Read Aloud</button></div>
      <div class="ias-tabs">${['', ...CATEGORIES].map((c) => `<button class="ias-tab ${c ? '' : 'active'}" data-ias-category="${esc(c)}">${c || 'All stories'}</button>`).join('')}</div>
      <div class="ias-filters"><select class="ias-filter" id="ias-grade"><option value="">All grade levels</option>${GRADES.map((g) => `<option>${g}</option>`).join('')}</select>
        <span class="ias-chip">${stories.length} interactive stories</span></div>
      <div class="ias-grid" id="ias-grid">${stories.map((s) => `<div class="ias-card" data-ias-story data-category="${esc(s.category)}" data-grade="${esc(s.grade_level || '')}">
        <div class="ias-cover">${coverHtml(s)}</div>
        <div class="ias-card-body"><div class="ias-chips"><span class="ias-chip ias-purple">${esc(s.category)}</span>${s.grade_level ? `<span class="ias-chip">${esc(s.grade_level)}</span>` : ''}<span class="ias-chip">${s.scene_count} scenes</span><span class="ias-chip">${s.activity_count} activities</span></div>
          <h3>${esc(s.title)}</h3><p>${esc(s.description || 'An interactive story waiting for you.')}</p>
          <button class="ias-primary" data-nav="student/interactive/${s.id}">▶ Play story</button>
        </div></div>`).join('') || '<div class="empty card"><div class="big">✨</div><h3>No interactive stories yet</h3><p>Ask your administrator to publish one.</p></div>'}</div>
    </div>`,
    mount(el) {
      const paint = () => el.querySelectorAll('[data-ias-story]').forEach((card) => {
        card.style.display = (!category || card.dataset.category === category) && (!grade || card.dataset.grade === grade) ? '' : 'none';
      });
      el.querySelectorAll('[data-ias-category]').forEach((button) => button.addEventListener('click', () => {
        category = button.dataset.iasCategory || '';
        el.querySelectorAll('[data-ias-category]').forEach((b) => b.classList.toggle('active', b === button));
        paint();
      }));
      el.querySelector('#ias-grade').addEventListener('change', (e) => { grade = e.target.value; paint(); });
    }
  };
}

export async function interactiveStoryPlayerPage(ctx) {
  const id = ctx.params[1];
  const story = await ctx.api(`/api/interactive-stories/${encodeURIComponent(id)}`);
  const scenes = story.scenes || [];
  if (!scenes.length) return { title: story.title, html: `<div class="ias-page"><div class="empty"><h2>This story has no scenes yet.</h2><button class="ias-btn" data-nav="student/interactive">Back to stories</button></div></div>` };
  let current = 0;
  let state = 'idle';
  let token = 0;
  let fallbackTimer = null;
  let startedAt = Date.now();
  const prefs = { lang: 'en-US', rate: 0.9, volume: 1, voiceURI: '' };

  return {
    title: story.title,
    shell: false,
    html: `<div class="ias-player">
      <div class="ias-player-top"><button class="ias-btn ias-soft" data-nav="student/interactive">← Stories</button>
        <h2>${esc(story.title)}</h2><span class="ias-chip">${esc(story.category)}</span><span class="grow"></span>
        <span class="ias-chip" id="ias-scene-label">Scene 1 of ${scenes.length}</span>
        <span class="ias-stars" id="ias-star-count">☆</span>
        <button class="ias-btn ias-soft" id="ias-fullscreen">⛶ Fullscreen</button></div>
      <div class="ias-stage" id="ias-stage">${art(scenes[0], scenes[0].hotspots)}</div>
      <div class="ias-transcript" id="ias-transcript">${highlightHtml(scenes[0].text || '', 'word', 'ias-word', 'ias-active') || '<span class="muted">No narration text for this scene.</span>'}</div>
      <div class="ias-controls">
        <button class="ias-btn ias-soft" id="ias-prev">‹ Previous</button>
        <button class="ias-btn ias-play" id="ias-play">▶ Play</button>
        <button class="ias-btn ias-soft" id="ias-pause">⏸ Pause</button>
        <button class="ias-btn ias-soft" id="ias-resume">▶ Resume</button>
        <button class="ias-btn ias-stop" id="ias-stop">⏹ Stop</button>
        <button class="ias-btn ias-soft" id="ias-replay">↺ Replay</button>
        <button class="ias-btn" id="ias-next">Next ›</button>
        <label class="ias-chip">Voice <select class="ias-select" id="ias-voice"></select></label>
        <label class="ias-chip">Speed <input class="ias-range" id="ias-rate" type="range" min="0.5" max="1.5" step="0.1" value="0.9"></label>
        <span class="ias-status" id="ias-status">Ready. Press Play.</span>
      </div>
      <div class="ias-activity" id="ias-activity" hidden></div>
    </div>`,
    mount(el) {
      const stage = el.querySelector('#ias-stage');
      const transcript = el.querySelector('#ias-transcript');
      const status = el.querySelector('#ias-status');
      const activityPanel = el.querySelector('#ias-activity');
      const voiceSelect = el.querySelector('#ias-voice');
      let stars = 0;
      let audio = null;

      const refreshVoices = () => {
        voiceSelect.innerHTML = '<option value="">Default voice</option>' + readingSpeech.voices(prefs.lang)
          .map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('');
      };
      refreshVoices();
      window.addEventListener('voiceschanged', refreshVoices);

      const saveProgress = async (completed = false) => {
        try {
          await ctx.api(`/api/interactive-stories/${encodeURIComponent(id)}/progress`, { method: 'POST', body: {
            sceneNumber: current, seconds: Math.round((Date.now() - startedAt) / 1000), completed, stars
          } });
        } catch { /* progress is best-effort */ }
      };

      const clearHighlight = () => transcript.querySelectorAll('.ias-active').forEach((n) => n.classList.remove('ias-active'));
      const stopFallback = () => { if (fallbackTimer) clearInterval(fallbackTimer); fallbackTimer = null; };
      const startFallback = (myToken) => {
        stopFallback();
        const words = [...transcript.querySelectorAll('.ias-word')];
        if (!words.length) return;
        let i = 0; words[0].classList.add('ias-active');
        fallbackTimer = setInterval(() => {
          if (myToken !== token || state !== 'playing') return stopFallback();
          words[i]?.classList.remove('ias-active'); i += 1;
          if (i >= words.length) return stopFallback();
          words[i].classList.add('ias-active');
        }, Math.max(180, 520 / prefs.rate));
      };

      const showActivity = () => {
        const item = (story.activities || []).find((a) => Number(a.scene_number) === current + 1);
        if (!item) return false;
        const options = Array.isArray(item.options) ? item.options : [];
        activityPanel.hidden = false;
        activityPanel.innerHTML = `<div class="ias-head"><h3>🎯 ${esc(item.type.replace('_', ' '))}</h3></div>
          <p style="font-weight:800">${esc(item.prompt)}</p>
          <div class="ias-options">${options.map((o, i) => `<button class="ias-option" data-ias-option="${esc(o)}" type="button">${i + 1}. ${esc(o)}</button>`).join('')}</div>
          <div class="ias-feedback" data-ias-feedback>Choose one answer to help the story continue.</div>`;
        activityPanel.querySelectorAll('[data-ias-option]').forEach((button) => button.addEventListener('click', async () => {
          activityPanel.querySelectorAll('[data-ias-option]').forEach((b) => b.disabled = true);
          try {
            const result = await ctx.api(`/api/interactive-stories/${encodeURIComponent(id)}/activities/${item.id}/answer`, {
              method: 'POST', body: { response: button.dataset.iasOption }
            });
            button.classList.add(result.correct ? 'ias-correct' : 'ias-wrong');
            activityPanel.querySelector('[data-ias-feedback]').textContent = `${result.correct ? '✅' : '💭'} ${result.feedback}`;
            sound(result.correct ? 'correct' : 'incorrect');
            if (result.stars) { stars += result.stars; el.querySelector('#ias-star-count').textContent = '★'.repeat(Math.min(5, stars)); }
          } catch (error) {
            activityPanel.querySelector('[data-ias-feedback]').textContent = error.message;
          }
        }));
        activityPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
      };

      const finishScene = () => {
        state = 'done'; clearHighlight(); stopFallback();
        status.textContent = 'Scene finished!';
        saveProgress(false);
        if (showActivity()) return;
        if (current < scenes.length - 1) setTimeout(() => go(current + 1, true), 600);
        else { saveProgress(true); sound('win'); status.textContent = 'Story complete!'; }
      };

      const speak = (after) => {
        const scene = scenes[current];
        const myToken = token;
        clearHighlight();
        if (scene.audio_url) {
          audio = new Audio(scene.audio_url);
          audio.playbackRate = prefs.rate;
          audio.volume = prefs.volume;
          audio.onended = () => { if (myToken === token) after?.(); };
          audio.play().then(() => {
            state = 'playing'; status.textContent = `Playing scene ${current + 1}...`;
            startFallback(myToken);
          }).catch(() => { status.textContent = 'Audio blocked. Press Play again.'; });
          return true;
        }
        const text = String(scene.text || '').trim();
        if (!text) { after?.(); return false; }
        let boundarySeen = false;
        const started = readingSpeech.speak({
          text, lang: prefs.lang, rate: prefs.rate, volume: prefs.volume, voiceURI: prefs.voiceURI,
          onBoundary: (event) => {
            if (myToken !== token) return;
            boundarySeen = true; stopFallback(); clearHighlight();
            const node = [...transcript.querySelectorAll('.ias-word')]
              .find((n) => Number(n.dataset.start) <= event.charIndex && event.charIndex < Number(n.dataset.end));
            if (node) node.classList.add('ias-active');
          },
          onEnd: () => { if (myToken === token) { clearHighlight(); stopFallback(); after?.(); } },
          onError: () => { if (myToken === token) { clearHighlight(); stopFallback(); after?.(); } }
        });
        if (started) {
          state = 'playing'; status.textContent = `Reading scene ${current + 1}...`;
          setTimeout(() => { if (myToken === token && !boundarySeen && state === 'playing') startFallback(myToken); }, 700);
        }
        return started;
      };

      const stop = () => {
        token += 1; state = 'idle'; readingSpeech.stop(); audio?.pause(); audio = null;
        clearHighlight(); stopFallback(); status.textContent = 'Stopped.';
      };

      const go = (next, keepPlaying = false) => {
        if (next >= scenes.length) { stop(); saveProgress(true); sound('win'); status.textContent = 'Story complete!'; return; }
        token += 1; readingSpeech.stop(); audio?.pause(); audio = null; stopFallback();
        current = Math.max(0, next);
        const scene = scenes[current];
        stage.innerHTML = art(scene, scene.hotspots || []);
        transcript.innerHTML = highlightHtml(scene.text || '', 'word', 'ias-word', 'ias-active')
          || '<span class="muted">No narration text for this scene.</span>';
        el.querySelector('#ias-scene-label').textContent = `Scene ${current + 1} of ${scenes.length}`;
        el.querySelector('#ias-prev').disabled = current <= 0;
        el.querySelector('#ias-next').disabled = current >= scenes.length - 1;
        activityPanel.hidden = true;
        saveProgress(false);
        bindHotspots();
        if (keepPlaying) setTimeout(() => speak(finishScene), 250);
        else status.textContent = `Scene ${current + 1} ready.`;
      };

      const bindHotspots = () => {
        stage.querySelectorAll('[data-ias-hotspot]').forEach((button) => button.addEventListener('click', (event) => {
          const spot = scenes[current].hotspots?.[Number(button.dataset.iasHotspot)] || {};
          sound(spot.sound || 'click');
          bubble(event.currentTarget, spot.feedback || 'You found something!');
          button.classList.add('ias-found');
        }));
      };
      const bubble = (target, message) => {
        const old = stage.querySelector('.ias-toast-bubble'); old?.remove();
        const note = document.createElement('div');
        note.className = 'ias-toast-bubble'; note.textContent = message;
        stage.appendChild(note);
        setTimeout(() => note.remove(), 2400);
      };

      el.querySelector('#ias-play').addEventListener('click', () => speak(finishScene));
      el.querySelector('#ias-pause').addEventListener('click', () => {
        const paused = readingSpeech.pause() || (audio && (audio.pause(), true));
        if (paused) { state = 'paused'; stopFallback(); status.textContent = 'Paused.'; }
      });
      el.querySelector('#ias-resume').addEventListener('click', () => {
        const resumed = readingSpeech.resume() || (audio && (audio.play(), true));
        if (resumed) { state = 'playing'; status.textContent = 'Resumed.'; }
      });
      el.querySelector('#ias-stop').addEventListener('click', stop);
      el.querySelector('#ias-replay').addEventListener('click', () => { stop(); speak(finishScene); });
      el.querySelector('#ias-prev').addEventListener('click', () => { stop(); go(current - 1); });
      el.querySelector('#ias-next').addEventListener('click', () => { stop(); go(current + 1); });
      el.querySelector('#ias-fullscreen').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else el.querySelector('.ias-player').requestFullscreen?.().catch?.(() => {});
      });
      el.querySelector('#ias-rate').addEventListener('change', (e) => { prefs.rate = Number(e.target.value) || .9; });
      voiceSelect.addEventListener('change', (e) => { prefs.voiceURI = e.target.value; });
      bindHotspots();
      el.__cleanupPresentation = () => { token += 1; readingSpeech.stop(); audio?.pause(); stopFallback(); window.removeEventListener('voiceschanged', refreshVoices); };
    }
  };
}

export async function interactiveStoriesAdminPage(ctx) {
  const stories = await ctx.api('/api/interactive-stories/admin');
  let editing = null;
  const sceneForm = (s = {}, i = 0) => `<div class="ias-row" data-ias-scene>
    <div class="row-between"><strong>Scene ${i + 1}</strong><button type="button" class="ias-btn ias-stop" data-ias-remove-scene>Remove</button></div>
    <label>Title <input name="scene_title" value="${esc(s.title || '')}"></label>
    <label>Narration <textarea name="scene_text" rows="2">${esc(s.text || '')}</textarea></label>
    <div class="row wrap"><label>Background <select name="scene_background">${['meadow', 'sunset', 'night', 'forest'].map((b) => `<option ${s.background === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <label>Character <select name="scene_character">${Object.keys(ANIMALS).map((c) => `<option ${s.character === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Expression <select name="scene_expression">${['happy', 'curious', 'sleepy', 'surprised'].map((v) => `<option ${s.expression === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Action <select name="scene_action">${['idle', 'wave', 'hop', 'dance'].map((v) => `<option ${s.action === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <label>Illustration <input type="file" name="scene_image" accept="image/*"></label>
    <label>Audio narration <input type="file" name="scene_audio" accept="audio/*"></label>
    <div class="row wrap"><label>Hotspot label <input name="spot_label" value="${esc(s.hotspots?.[0]?.label || '')}"></label>
      <label>X % <input name="spot_x" type="number" min="0" max="100" value="${s.hotspots?.[0]?.x || 50}"></label>
      <label>Y % <input name="spot_y" type="number" min="0" max="100" value="${s.hotspots?.[0]?.y || 50}"></label>
      <label>Feedback <input name="spot_feedback" value="${esc(s.hotspots?.[0]?.feedback || '')}"></label></div>
  </div>`;
  const activityForm = (a = {}, i = 0) => `<div class="ias-row" data-ias-activity>
    <div class="row-between"><strong>Activity ${i + 1}</strong><button type="button" class="ias-btn ias-stop" data-ias-remove-activity>Remove</button></div>
    <label>Scene number <input name="activity_scene" type="number" min="1" value="${a.scene_number || 1}"></label>
    <label>Type <select name="activity_type">${['multiple_choice', 'true_false', 'matching', 'sequencing', 'vocabulary'].map((t) => `<option ${a.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Prompt <input name="activity_prompt" value="${esc(a.prompt || '')}"></label>
    <label>Options (comma separated) <input name="activity_options" value="${esc((a.options || []).join(', '))}"></label>
    <label>Answer <input name="activity_answer" value="${esc(a.answer || '')}"></label>
    <label>Feedback <input name="activity_feedback" value="${esc(a.feedback || '')}"></label>
  </div>`;
  const formHtml = (story) => `<form class="ias-form" id="ias-admin-form">
    <h3>${story ? `Edit: ${esc(story.title)}` : 'New interactive story'}</h3>
    <label>Title <input name="title" required value="${esc(story?.title || '')}"></label>
    <label>Description <textarea name="description" rows="2">${esc(story?.description || '')}</textarea></label>
    <label>Grade <select name="grade_level">${GRADES.map((g) => `<option ${story?.grade_level === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <label>Category <select name="category">${CATEGORIES.map((c) => `<option ${story?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Cover <input type="file" name="cover" accept="image/*"></label>
    <div><strong>Scenes</strong><div id="ias-scenes">${(story?.scenes?.length ? story.scenes : [{}]).map(sceneForm).join('')}</div>
      <button type="button" class="ias-btn ias-soft" id="ias-add-scene">+ Add scene</button></div>
    <div><strong>Activities</strong><div id="ias-activities">${(story?.activities?.length ? story.activities : [{}]).map(activityForm).join('')}</div>
      <button type="button" class="ias-btn ias-soft" id="ias-add-activity">+ Add activity</button></div>
    <button class="ias-btn" type="submit">${story ? 'Save changes' : 'Create story'}</button>
  </form>`;

  return {
    title: 'Interactive Stories Admin',
    html: `<div class="ias-page ias-admin">
      <div class="ias-head"><div><h1>✨ Interactive Stories</h1><p>Manage original scenes, hotspots, narration and activities.</p></div>
        <button class="ias-btn ias-soft" data-nav="admin">← Admin</button></div>
      <div class="ias-admin-grid">
        <div class="ias-card card-pad"><h3>Stories</h3>${stories.map((s) => `<div class="ias-story-row" style="padding:.6rem 0;border-bottom:1px solid var(--line)">
          <span class="grow"><strong>${esc(s.title)}</strong><div class="muted tiny">${esc(s.category)} • ${s.scene_count} scenes • ${s.activity_count} activities • ${s.status}</div></span>
          <button class="ias-btn ias-soft" data-ias-edit="${s.id}">Edit</button>
          <button class="ias-btn ias-soft" data-nav="admin/interactive-preview/${s.id}">Preview</button>
          ${s.status !== 'published' ? `<button class="ias-btn ias-play" data-ias-publish="${s.id}">Publish</button>` : ''}
          <button class="ias-btn ias-stop" data-ias-delete="${s.id}">Delete</button></div>`).join('') || '<p class="muted">No stories yet.</p>'}</div>
        <div id="ias-form-host">${formHtml(null)}</div>
      </div>
      <div class="ias-card card-pad"><div class="ias-head"><div><h3>🧭 Storyboard + Action Generator</h3><p class="muted small">Turn story text into scenes with backgrounds, character actions, hotspots and grounded activities.</p></div></div>
        <div class="ias-form" style="box-shadow:none;border:0;padding:0;margin-top:.8rem">
          <label>Story title <input id="ias-sb-title" placeholder="My interactive story"></label>
          <label>Story text <textarea id="ias-sb-text" rows="5" placeholder="Paste your original story text. Blank lines or sentences become scenes."></textarea></label>
          <div class="row wrap">
            <label>Category <select id="ias-sb-category">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
            <label>Grade <select id="ias-sb-grade">${GRADES.map((g) => `<option>${g}</option>`).join('')}</select></label>
            <label>Character <select id="ias-sb-character">${Object.keys(ANIMALS).map((c) => `<option>${c}</option>`).join('')}</select></label>
            <label>Scenes <input id="ias-sb-count" type="number" min="1" max="10" value="3"></label>
          </div>
          <div class="row wrap"><button class="ias-btn" id="ias-sb-generate" type="button">Generate storyboard</button>
            <button class="ias-btn ias-play" id="ias-sb-save" type="button" disabled>Save as draft</button>
            <span class="ias-status" id="ias-sb-status">Ready.</span></div>
        </div>
        <div id="ias-storyboard" class="ias-sb-grid"></div>
      </div>
      <div class="ias-card card-pad"><div class="ias-head"><div><h3>Import a story file</h3><p class="muted small">Accepts .json, .html, .txt or .md. HTML/text files become scenes; JSON keeps scenes and activities.</p></div></div>
        <div class="row wrap" style="margin-top:.8rem">
          <input class="ias-filter" id="ias-import-file" type="file" accept=".json,.html,.htm,.txt,.md">
          <button class="ias-btn" id="ias-import-btn" type="button">Import file</button>
          <span class="ias-status" id="ias-import-status">No file chosen.</span>
        </div>
      </div>
    </div>`,
    mount(el) {
      const host = el.querySelector('#ias-form-host');
      let generated = null;
      const statusEl = el.querySelector('#ias-sb-status');
      const board = el.querySelector('#ias-storyboard');

      const paintBoard = () => {
        if (!generated) { board.innerHTML = ''; return; }
        board.innerHTML = generated.scenes.map((scene, i) => {
          const activity = generated.activities.find((a) => Number(a.sceneNumber) === i + 1);
          return `<div class="ias-sb-card">
            <div class="row-between"><strong>Scene ${i + 1}</strong><span class="ias-chip">${esc(scene.background)}</span></div>
            <label>Title <input data-sb-title="${i}" value="${esc(scene.title)}"></label>
            <label>Action text <textarea data-sb-text="${i}" rows="3">${esc(scene.text)}</textarea></label>
            <div class="row wrap">
              <label>Background <select data-sb-bg="${i}">${['meadow', 'sunset', 'night', 'forest'].map((b) => `<option ${scene.background === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
              <label>Character <select data-sb-character="${i}">${Object.keys(ANIMALS).map((c) => `<option ${scene.character === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
              <label>Expression <select data-sb-expression="${i}">${['happy', 'curious', 'sleepy', 'surprised'].map((v) => `<option ${scene.expression === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
              <label>Action <select data-sb-action="${i}">${['idle', 'wave', 'hop', 'dance'].map((v) => `<option ${scene.action === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            </div>
            <p class="muted small">👆 Hotspot: <strong>${esc(scene.hotspots?.[0]?.label || '')}</strong> — ${esc((scene.hotspots?.[0]?.feedback || '').slice(0, 70))}</p>
            <p class="muted small">🎯 ${esc(activity?.type || '')}: ${esc(activity?.prompt || '')} <strong>${esc(activity?.answer || '')}</strong></p>
          </div>`;
        }).join('');
      };

      const syncBoard = () => {
        if (!generated) return;
        generated.scenes.forEach((scene, i) => {
          scene.title = board.querySelector(`[data-sb-title="${i}"]`)?.value || scene.title;
          scene.text = board.querySelector(`[data-sb-text="${i}"]`)?.value || scene.text;
          scene.background = board.querySelector(`[data-sb-bg="${i}"]`)?.value || scene.background;
          scene.character = board.querySelector(`[data-sb-character="${i}"]`)?.value || scene.character;
          scene.expression = board.querySelector(`[data-sb-expression="${i}"]`)?.value || scene.expression;
          scene.action = board.querySelector(`[data-sb-action="${i}"]`)?.value || scene.action;
        });
      };

      el.querySelector('#ias-sb-generate')?.addEventListener('click', () => {
        try {
          generated = generateStoryboard({
            title: el.querySelector('#ias-sb-title').value,
            text: el.querySelector('#ias-sb-text').value,
            category: el.querySelector('#ias-sb-category').value,
            gradeLevel: el.querySelector('#ias-sb-grade').value,
            character: el.querySelector('#ias-sb-character').value,
            sceneCount: el.querySelector('#ias-sb-count').value
          });
          paintBoard();
          el.querySelector('#ias-sb-save').disabled = false;
          statusEl.textContent = `${generated.scenes.length} scenes generated. Edit the cards, then save.`;
          sound('success');
        } catch (error) { statusEl.textContent = error.message; ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#ias-sb-save')?.addEventListener('click', async (event) => {
        if (!generated) return;
        syncBoard();
        const button = event.currentTarget; button.disabled = true;
        try {
          const saved = await ctx.api('/api/interactive-stories', { method: 'POST', body: generated });
          statusEl.textContent = `Saved “${saved.title}” as a draft with ${saved.scene_count} scenes.`;
          ctx.toast('Storyboard saved as draft.', 'success');
          generated = null; board.innerHTML = '';
        } catch (error) { statusEl.textContent = error.message; ctx.toast(error.message, 'error'); button.disabled = false; }
      });

      el.querySelector('#ias-import-btn')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const fileInput = el.querySelector('#ias-import-file');
        const statusEl = el.querySelector('#ias-import-status');
        const file = fileInput?.files?.[0];
        if (!file) { statusEl.textContent = 'Choose a file first.'; return; }
        button.disabled = true;
        statusEl.textContent = `Importing ${file.name}...`;
        try {
          const payload = parseImportedStory(await file.text(), file.name);
          if (!payload.scenes.length) throw new Error('No scenes were found in that file.');
          const saved = await ctx.api('/api/interactive-stories', { method: 'POST', body: payload });
          statusEl.textContent = `Imported ${saved.scene_count} scenes. Click Publish when ready.`;
          ctx.toast('Story imported as a draft.', 'success');
          ctx.render();
        } catch (error) {
          statusEl.textContent = error.message;
          ctx.toast(error.message, 'error');
          button.disabled = false;
        }
      });
      const bind = () => {
        el.querySelector('#ias-add-scene')?.addEventListener('click', () => {
          const wrap = el.querySelector('#ias-scenes');
          wrap.insertAdjacentHTML('beforeend', sceneForm({}, wrap.children.length)); bind();
        });
        el.querySelector('#ias-add-activity')?.addEventListener('click', () => {
          const wrap = el.querySelector('#ias-activities');
          wrap.insertAdjacentHTML('beforeend', activityForm({}, wrap.children.length)); bind();
        });
        el.querySelectorAll('[data-ias-remove-scene]').forEach((b) => b.addEventListener('click', () => b.closest('[data-ias-scene]')?.remove()));
        el.querySelectorAll('[data-ias-remove-activity]').forEach((b) => b.addEventListener('click', () => b.closest('[data-ias-activity]')?.remove()));
        el.querySelector('#ias-admin-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = event.currentTarget; const button = form.querySelector('[type=submit]'); button.disabled = true;
          try {
            const coverFile = form.querySelector('[name=cover]').files[0];
            const scenes = [];
            for (const row of form.querySelectorAll('[data-ias-scene]')) {
              const image = row.querySelector('[name=scene_image]').files[0];
              const audioFile = row.querySelector('[name=scene_audio]').files[0];
              scenes.push({
                title: row.querySelector('[name=scene_title]').value,
                text: row.querySelector('[name=scene_text]').value,
                background: row.querySelector('[name=scene_background]').value,
                character: row.querySelector('[name=scene_character]').value,
                expression: row.querySelector('[name=scene_expression]').value,
                action: row.querySelector('[name=scene_action]').value,
                image_url: image ? await fileToDataUrl(image) : (row.querySelector('img')?.src || ''),
                audio_url: audioFile ? await fileToDataUrl(audioFile) : (row.dataset.audioUrl || ''),
                hotspots: [{
                  label: row.querySelector('[name=spot_label]').value,
                  kind: 'star', x: Number(row.querySelector('[name=spot_x]').value) || 50,
                  y: Number(row.querySelector('[name=spot_y]').value) || 50,
                  feedback: row.querySelector('[name=spot_feedback]').value,
                  sound: 'click'
                }]
              });
            }
            const activities = [...form.querySelectorAll('[data-ias-activity]')].map((row) => ({
              sceneNumber: Number(row.querySelector('[name=activity_scene]').value) || 1,
              type: row.querySelector('[name=activity_type]').value,
              prompt: row.querySelector('[name=activity_prompt]').value,
              options: row.querySelector('[name=activity_options]').value.split(',').map((v) => v.trim()).filter(Boolean),
              answer: row.querySelector('[name=activity_answer]').value,
              feedback: row.querySelector('[name=activity_feedback]').value
            }));
            const payload = {
              title: form.querySelector('[name=title]').value,
              description: form.querySelector('[name=description]').value,
              grade_level: form.querySelector('[name=grade_level]').value,
              category: form.querySelector('[name=category]').value,
              scenes, activities
            };
            if (coverFile) payload.coverUrl = await fileToDataUrl(coverFile);
            if (editing) await ctx.api(`/api/interactive-stories/${editing}`, { method: 'PUT', body: payload });
            else await ctx.api('/api/interactive-stories', { method: 'POST', body: payload });
            ctx.toast('Interactive story saved.', 'success'); ctx.render();
          } catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; }
        });
      };
      bind();
      el.querySelectorAll('[data-ias-edit]').forEach((b) => b.addEventListener('click', async () => {
        try { const story = await ctx.api(`/api/interactive-stories/${b.dataset.iasEdit}`); editing = story.id; host.innerHTML = formHtml(story); bind(); host.scrollIntoView({ behavior: 'smooth' }); }
        catch (error) { ctx.toast(error.message, 'error'); }
      }));
      el.querySelectorAll('[data-ias-publish]').forEach((b) => b.addEventListener('click', async () => {
        try { await ctx.api(`/api/interactive-stories/${b.dataset.iasPublish}/publish`, { method: 'POST' }); ctx.toast('Published.', 'success'); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      }));
      el.querySelectorAll('[data-ias-delete]').forEach((b) => b.addEventListener('click', async () => {
        if (!await ctx.confirmDialog('Delete this story?', 'This cannot be undone.', 'Delete')) return;
        try { await ctx.api(`/api/interactive-stories/${b.dataset.iasDelete}`, { method: 'DELETE' }); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      }));
    }
  };
}

export default interactiveStoriesPage;
