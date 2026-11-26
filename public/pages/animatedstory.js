import { esc, sound } from '../ui.js';
import { readingSpeech } from '../reading.js';
import { highlightHtml } from '../highlight.js';

const CATEGORIES = ['Adventure', 'Fairy Tales', 'Animal Stories', 'Bedtime Stories', 'Moral Stories', 'Educational Stories'];
const GRADES = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

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
    return ['http:', 'https:', 'blob:'].includes(url.protocol) || url.href.startsWith('data:image/') ? url.href : '';
  } catch { return ''; }
}

function coverHtml(story) {
  const url = safeUrl(story.cover_url);
  if (url) return `<img src="${esc(url)}" alt="" loading="lazy">`;
  const themes = {
    Adventure: 'linear-gradient(145deg,#38bdf8,#a78bfa)',
    'Fairy Tales': 'linear-gradient(145deg,#f9a8d4,#c4b5fd)',
    'Animal Stories': 'linear-gradient(145deg,#86efac,#fde68a)',
    'Bedtime Stories': 'linear-gradient(145deg,#4338ca,#7dd3fc)',
    'Moral Stories': 'linear-gradient(145deg,#fcd34d,#fb7185)',
    'Educational Stories': 'linear-gradient(145deg,#5eead4,#60a5fa)'
  };
  return `<div class="as-cover-art" style="background:${themes[story.category] || themes.Adventure}"></div>
    <span class="as-cover-title">${esc(story.category || 'Story')}</span>`;
}

function sceneArt(scene) {
  const effects = Array.isArray(scene.effects) ? scene.effects : [];
  const image = safeUrl(scene.image_url);
  const skyClass = ['meadow', 'sunset', 'night', 'forest'].includes(scene.background) ? scene.background : 'meadow';
  const animal = ['fox', 'bear', 'fish', 'bird', 'rabbit'].includes(scene.character) ? scene.character : '';
  const stars = skyClass === 'night' ? '<i class="as-star" style="left:18%;top:18%"></i><i class="as-star" style="left:42%;top:12%;animation-delay:.7s"></i><i class="as-star" style="right:22%;top:26%;animation-delay:1.2s"></i>' : '';
  const sun = skyClass === 'night' ? '' : '<div class="as-sun"></div>';
  const sparkles = effects.includes('sparkles') ? '<i class="as-star" style="left:30%;top:40%"></i><i class="as-star" style="right:34%;top:48%;animation-delay:.9s"></i>' : '';
  const butterflies = effects.includes('butterflies') ? '<span class="as-animal bird" style="left:30%;bottom:30%"></span>' : '';
  return `${image ? `<img class="as-scene-image" src="${esc(image)}" alt="">` : ''}
    <div class="as-layer as-sky ${skyClass}">${stars}${sun}
      <div class="as-cloud"></div><div class="as-cloud two"></div>
      ${sparkles}
    </div>
    <div class="as-layer"><div class="as-hills"></div><div class="as-ground"></div>
      <div class="as-tree a"></div><div class="as-tree b"></div>
      ${animal ? `<div class="as-animal ${animal} one"></div><div class="as-animal ${animal} two"></div>` : ''}
      ${butterflies}
      <div class="as-character"><img src="/assets/gameworld/mascot.svg" alt=""></div>
    </div>
    <div class="as-scene-caption">${esc(scene.title || 'A new scene')}</div>`;
}

export async function animatedLibraryPage(ctx) {
  const stories = await ctx.api('/api/animated-stories');
  let category = '';
  let grade = '';
  return {
    title: 'Animated Storybooks',
    html: `<div class="as-page">
      <div class="as-head"><div><h1>🎬 Animated Storybooks</h1><p>Stories that move, speak and sparkle — a new way to read along.</p></div>
        <button class="as-btn as-soft" data-nav="student/reading">← Back to Read Aloud</button></div>
      <div class="as-tabs">${['', ...CATEGORIES].map((c) => `<button class="as-tab ${c === '' ? 'active' : ''}" data-as-category="${esc(c)}">${c || 'All stories'}</button>`).join('')}</div>
      <div class="as-filters"><select class="as-filter" id="as-grade"><option value="">All grade levels</option>${GRADES.map((g) => `<option>${g}</option>`).join('')}</select>
        <span class="as-chip">${stories.length} animated stories</span></div>
      <div class="as-grid" id="as-grid">${stories.map((s) => `<div class="as-card" data-story data-category="${esc(s.category)}" data-grade="${esc(s.grade_level || '')}">
        <div class="as-cover">${coverHtml(s)}</div>
        <div class="as-card-body"><div class="as-chips"><span class="as-chip as-purple">${esc(s.category)}</span>${s.grade_level ? `<span class="as-chip">${esc(s.grade_level)}</span>` : ''}<span class="as-chip">${s.scene_count} scenes</span></div>
          <h3>${esc(s.title)}</h3><p>${esc(s.description || 'A animated story waiting to be told.')}</p>
          <button class="as-play" data-nav="student/animated/${s.id}">▶ Play story</button>
        </div></div>`).join('') || '<div class="empty card"><div class="big">🎬</div><h3>No animated stories yet</h3><p>Ask your administrator to publish one.</p></div>'}</div>
    </div>`,
    mount(el) {
      const paint = () => el.querySelectorAll('[data-story]').forEach((card) => {
        const show = (!category || card.dataset.category === category) && (!grade || card.dataset.grade === grade);
        card.style.display = show ? '' : 'none';
      });
      el.querySelectorAll('[data-as-category]').forEach((button) => button.addEventListener('click', () => {
        category = button.dataset.asCategory || '';
        el.querySelectorAll('[data-as-category]').forEach((b) => b.classList.toggle('active', b === button));
        paint();
      }));
      el.querySelector('#as-grade').addEventListener('change', (e) => { grade = e.target.value; paint(); });
    }
  };
}

export async function animatedPlayerPage(ctx) {
  const id = ctx.params[1];
  const story = await ctx.api(`/api/animated-stories/${encodeURIComponent(id)}`);
  const scenes = story.scenes || [];
  if (!scenes.length) return { title: story.title, html: `<div class="as-page"><div class="empty"><h2>This story has no scenes yet.</h2><button class="as-btn" data-nav="student/animated">Back to stories</button></div></div>` };
  let current = 0;
  let state = 'idle';
  let startedAt = Date.now();
  let timer = null;
  let fallbackTimer = null;
  let musicTimer = null;
  let token = 0;
  const prefs = { lang: 'en-US', rate: 0.9, volume: 1, voiceURI: '' };

  return {
    title: story.title,
    shell: false,
    html: `<div class="as-player">
      <div class="as-player-top"><button class="as-btn as-soft" data-nav="student/animated">← Stories</button>
        <h2>${esc(story.title)}</h2><span class="as-chip as-purple">${esc(story.category)}</span>
        <span class="grow"></span><span class="as-chip" id="as-scene-label">Scene 1 of ${scenes.length}</span>
        <button class="as-btn as-soft" id="as-fullscreen">⛶ Fullscreen</button></div>
      <div class="as-stage" id="as-stage">${sceneArt(scenes[0])}</div>
      <div class="as-transcript" id="as-transcript">${highlightHtml(scenes[0].text || '', 'word', 'as-word', 'as-active') || '<span class="muted">No narration text for this scene.</span>'}</div>
      <div class="as-controls">
        <button class="as-btn as-soft" id="as-prev">‹ Previous</button>
        <button class="as-btn as-play-btn" id="as-play">▶ Play</button>
        <button class="as-btn as-soft" id="as-pause">⏸ Pause</button>
        <button class="as-btn as-soft" id="as-resume">▶ Resume</button>
        <button class="as-btn as-stop" id="as-stop">⏹ Stop</button>
        <button class="as-btn as-soft" id="as-replay">↺ Replay</button>
        <button class="as-btn" id="as-next">Next ›</button>
        <button class="as-btn as-soft" id="as-music">🎵 Music</button>
        <label class="as-chip">Voice <select class="as-select" id="as-voice"></select></label>
        <label class="as-chip">Speed <input class="as-range" id="as-rate" type="range" min="0.5" max="1.5" step="0.1" value="0.9"></label>
        <span class="as-status" id="as-status">Ready. Press Play to begin.</span>
      </div>
    </div>`,
    mount(el) {
      const stage = el.querySelector('#as-stage');
      const transcript = el.querySelector('#as-transcript');
      const status = el.querySelector('#as-status');
      const voiceSelect = el.querySelector('#as-voice');
      const clearHighlight = () => el.querySelectorAll('.as-active').forEach((n) => n.classList.remove('as-active'));

      const refreshVoices = () => {
        voiceSelect.innerHTML = '<option value="">Default voice</option>' + readingSpeech.voices(prefs.lang)
          .map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('');
      };
      refreshVoices();
      window.addEventListener('voiceschanged', refreshVoices);

      const saveProgress = async (completed = false) => {
        try {
          await ctx.api(`/api/animated-stories/${encodeURIComponent(id)}/progress`, { method: 'POST', body: {
            sceneNumber: current, seconds: Math.round((Date.now() - startedAt) / 1000), completed
          } });
        } catch { /* reading should never be blocked by progress saving */ }
      };

      const paintScene = (animate = true) => {
        const scene = scenes[current];
        stage.innerHTML = sceneArt(scene);
        transcript.innerHTML = highlightHtml(scene.text || '', 'word', 'as-word', 'as-active')
          || '<span class="muted">No narration text for this scene.</span>';
        el.querySelector('#as-scene-label').textContent = `Scene ${current + 1} of ${scenes.length}`;
        el.querySelector('#as-prev').disabled = current <= 0;
        el.querySelector('#as-next').disabled = current >= scenes.length - 1;
        if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          stage.animate([{ opacity: .4, transform: 'scale(.98)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 350 });
        }
        saveProgress(false);
      };

      const stopFallback = () => { if (fallbackTimer) clearInterval(fallbackTimer); fallbackTimer = null; };
      const startFallback = (myToken) => {
        stopFallback();
        const words = [...transcript.querySelectorAll('.as-word')];
        if (!words.length) return;
        let i = 0;
        words[0].classList.add('as-active');
        fallbackTimer = setInterval(() => {
          if (myToken !== token || state !== 'playing') return stopFallback();
          words[i]?.classList.remove('as-active');
          i += 1;
          if (i >= words.length) return stopFallback();
          words[i].classList.add('as-active');
          words[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }, Math.max(180, 520 / prefs.rate));
      };

      const speak = (after) => {
        const text = String(scenes[current]?.text || '').trim();
        if (!text) { if (after) after(); return false; }
        const myToken = token;
        let boundarySeen = false;
        clearHighlight();
        const started = readingSpeech.speak({
          text, lang: prefs.lang, rate: prefs.rate, volume: prefs.volume, voiceURI: prefs.voiceURI,
          onBoundary: (event) => {
            if (myToken !== token) return;
            boundarySeen = true; stopFallback();
            clearHighlight();
            const node = [...transcript.querySelectorAll('.as-word')]
              .find((n) => Number(n.dataset.start) <= event.charIndex && event.charIndex < Number(n.dataset.end));
            if (node) { node.classList.add('as-active'); node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
          },
          onEnd: () => {
            if (myToken !== token) return;
            clearHighlight(); stopFallback();
            if (after) after();
          },
          onError: () => { if (myToken !== token) return; clearHighlight(); stopFallback(); if (after) after(); }
        });
        if (started) {
          state = 'playing'; status.textContent = `Reading scene ${current + 1}...`;
          setTimeout(() => { if (myToken === token && !boundarySeen && state === 'playing') startFallback(myToken); }, 700);
        }
        return started;
      };

      const stop = () => {
        token += 1; state = 'idle'; readingSpeech.stop(); clearHighlight(); stopFallback();
        status.textContent = 'Stopped.';
      };

      const go = (next, keepPlaying = false) => {
        if (next >= scenes.length) { stop(); state = 'done'; status.textContent = 'Story complete!'; saveProgress(true); sound('win'); return; }
        token += 1; readingSpeech.stop(); stopFallback();
        current = Math.max(0, next);
        paintScene();
        if (keepPlaying) setTimeout(() => speak(() => go(current + 1, true)), 250);
        else status.textContent = `Scene ${current + 1} ready.`;
      };

      el.querySelector('#as-play').addEventListener('click', () => { if (!speak(() => go(current + 1, true))) status.textContent = 'No narration text.'; });
      el.querySelector('#as-pause').addEventListener('click', () => { if (readingSpeech.pause()) { state = 'paused'; stopFallback(); status.textContent = 'Paused.'; } });
      el.querySelector('#as-resume').addEventListener('click', () => { if (readingSpeech.resume()) { state = 'playing'; status.textContent = 'Resumed.'; } });
      el.querySelector('#as-stop').addEventListener('click', stop);
      el.querySelector('#as-replay').addEventListener('click', () => { stop(); speak(() => go(current + 1, true)); });
      el.querySelector('#as-prev').addEventListener('click', () => { stop(); go(current - 1); });
      el.querySelector('#as-next').addEventListener('click', () => { stop(); go(current + 1); });
      el.querySelector('#as-fullscreen').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else el.querySelector('.as-player').requestFullscreen?.().catch?.(() => {});
      });
      el.querySelector('#as-rate').addEventListener('change', (e) => { prefs.rate = Number(e.target.value) || .9; });
      voiceSelect.addEventListener('change', (e) => { prefs.voiceURI = e.target.value; });
      el.querySelector('#as-music').addEventListener('click', () => {
        if (musicTimer) { clearInterval(musicTimer); musicTimer = null; status.textContent = 'Music off.'; return; }
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        const ctxAudio = new Ctor();
        const notes = [392, 523, 659, 523];
        let step = 0;
        musicTimer = setInterval(() => {
          const osc = ctxAudio.createOscillator(); const gain = ctxAudio.createGain();
          osc.frequency.value = notes[step++ % notes.length];
          gain.gain.value = .025;
          osc.connect(gain).connect(ctxAudio.destination);
          osc.start(); osc.stop(ctxAudio.currentTime + .3);
        }, 480);
        status.textContent = 'Music on.';
      });

      timer = setInterval(() => {
        if (state === 'playing') el.querySelector('#as-scene-label').textContent = `Scene ${current + 1} of ${scenes.length} • ${Math.floor((Date.now() - startedAt) / 1000)}s`;
      }, 1000);
      el.__cleanupPresentation = () => {
        clearInterval(timer); if (musicTimer) clearInterval(musicTimer);
        stopFallback(); readingSpeech.stop(); window.removeEventListener('voiceschanged', refreshVoices);
      };
    }
  };
}

export async function animatedAdminPage(ctx) {
  const stories = await ctx.api('/api/animated-stories/admin');
  let editing = null;
  const formHtml = (story) => `<form class="as-form" id="as-form">
    <h3>${story ? `Edit: ${esc(story.title)}` : 'New animated story'}</h3>
    <label>Title <input name="title" required value="${esc(story?.title || '')}"></label>
    <label>Description <textarea name="description" rows="2">${esc(story?.description || '')}</textarea></label>
    <label>Grade level <select name="grade_level">${GRADES.map((g) => `<option ${story?.grade_level === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <label>Category <select name="category">${CATEGORIES.map((c) => `<option ${story?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Cover image <input type="file" name="cover" accept="image/*"></label>
    <div><strong>Scenes</strong><div id="as-scenes">${(story?.scenes?.length ? story.scenes : [{ title: 'Scene 1', text: '', background: 'meadow', character: 'owl', effects: [] }]).map((s, i) => sceneForm(s, i)).join('')}</div>
      <button type="button" class="as-btn as-soft" id="as-add-scene">+ Add scene</button></div>
    <button class="as-btn" type="submit">${story ? 'Save changes' : 'Create story'}</button>
  </form>`;

  function sceneForm(scene, i) {
    const effects = Array.isArray(scene.effects) ? scene.effects : [];
    return `<div class="as-scene-row" data-scene-row>
      <div class="as-scene-head"><strong>Scene ${i + 1}</strong><button type="button" class="as-btn as-stop" data-as-remove-scene>Remove</button></div>
      <label>Scene title <input name="scene_title" value="${esc(scene.title || '')}"></label>
      <label>Narration text <textarea name="scene_text" rows="3">${esc(scene.text || '')}</textarea></label>
      <div class="row wrap"><label>Background <select name="scene_background">${['meadow', 'sunset', 'night', 'forest'].map((b) => `<option ${scene.background === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label>Animal <select name="scene_character">${['owl', 'fox', 'bear', 'fish', 'bird', 'rabbit'].map((c) => `<option ${scene.character === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Seconds <input name="scene_duration" type="number" min="0" max="120" value="${Number(scene.duration) || 0}"></label></div>
      <label>Image <input type="file" name="scene_image" accept="image/*"></label>
      ${scene.image_url ? `<img src="${esc(scene.image_url)}" alt="" style="max-height:80px;border-radius:10px">` : ''}
      <label class="checkbox"><input type="checkbox" name="scene_effect" value="sparkles" ${effects.includes('sparkles') ? 'checked' : ''}> Sparkles</label>
      <label class="checkbox"><input type="checkbox" name="scene_effect" value="butterflies" ${effects.includes('butterflies') ? 'checked' : ''}> Butterflies</label>
    </div>`;
  }

  return {
    title: ctx.state.user.role === 'teacher' ? 'Animated Storybooks' : 'Animated Storybooks Admin',
    html: `<div class="as-page as-admin">
      <div class="as-head"><div><h1>🎬 Animated Storybooks</h1><p>Add, edit, preview and publish animated stories separate from Read Aloud.</p></div>
        <button class="as-btn as-soft" data-nav="${ctx.state.user.role === 'teacher' ? 'teacher' : 'admin'}">← Back</button></div>
      <div class="as-admin-grid">
        <div class="as-card card-pad"><h3>Published & drafts</h3>
          ${stories.length ? stories.map((s) => `<div class="row wrap" style="padding:.6rem 0;border-bottom:1px solid var(--line)">
            <span class="grow"><strong>${esc(s.title)}</strong><div class="muted tiny">${esc(s.category)} • ${s.scene_count} scenes • ${s.status}</div></span>
            <button class="as-btn as-soft" data-as-edit="${s.id}">Edit</button>
            <button class="as-btn as-soft" data-nav="${ctx.state.user.role === 'teacher' ? 'teacher/animated-preview' : 'admin/animated-preview'}/${s.id}">Preview</button>
            ${s.status !== 'published' ? `<button class="as-btn as-play-btn" data-as-publish="${s.id}">Publish</button>` : ''}
            <button class="as-btn as-stop" data-as-delete="${s.id}">Delete</button>
          </div>`).join('') : '<p class="muted">No animated stories yet.</p>'}
        </div>
        <div id="as-form-host">${formHtml(null)}</div>
      </div>
    </div>`,
    mount(el) {
      const host = el.querySelector('#as-form-host');
      const bindForm = () => {
        el.querySelector('#as-add-scene')?.addEventListener('click', () => {
          const wrap = el.querySelector('#as-scenes');
          wrap.insertAdjacentHTML('beforeend', sceneForm({ title: `Scene ${wrap.children.length + 1}`, text: '', background: 'meadow', character: 'owl', effects: [] }, wrap.children.length));
          bindForm();
        });
        el.querySelectorAll('[data-as-remove-scene]').forEach((b) => b.addEventListener('click', () => { b.closest('[data-scene-row]')?.remove(); }));
        el.querySelector('#as-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const button = form.querySelector('[type=submit]'); button.disabled = true;
          try {
            const coverFile = form.querySelector('[name=cover]').files[0];
            const coverUrl = coverFile ? await fileToDataUrl(coverFile) : '';
            const rows = [...form.querySelectorAll('[data-scene-row]')];
            const scenes = [];
            for (const row of rows) {
              const file = row.querySelector('[name=scene_image]').files[0];
              scenes.push({
                title: row.querySelector('[name=scene_title]').value,
                text: row.querySelector('[name=scene_text]').value,
                background: row.querySelector('[name=scene_background]').value,
                character: row.querySelector('[name=scene_character]').value,
                duration: Number(row.querySelector('[name=scene_duration]').value) || 0,
                effects: [...row.querySelectorAll('[name=scene_effect]:checked')].map((i) => i.value),
                image_url: file ? await fileToDataUrl(file) : (row.querySelector('img')?.src || '')
              });
            }
            const payload = {
              title: form.querySelector('[name=title]').value,
              description: form.querySelector('[name=description]').value,
              grade_level: form.querySelector('[name=grade_level]').value,
              category: form.querySelector('[name=category]').value,
              scenes
            };
            if (coverUrl) payload.coverUrl = coverUrl;
            if (editing) await ctx.api(`/api/animated-stories/${editing}`, { method: 'PUT', body: payload });
            else await ctx.api('/api/animated-stories', { method: 'POST', body: payload });
            ctx.toast('Animated story saved.', 'success'); ctx.render();
          } catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; }
        });
      };
      bindForm();
      el.querySelectorAll('[data-as-edit]').forEach((b) => b.addEventListener('click', async () => {
        try {
          const story = await ctx.api(`/api/animated-stories/${b.dataset.asEdit}`);
          editing = story.id; host.innerHTML = formHtml(story); bindForm();
          host.scrollIntoView({ behavior: 'smooth' });
        } catch (error) { ctx.toast(error.message, 'error'); }
      }));
      el.querySelectorAll('[data-as-publish]').forEach((b) => b.addEventListener('click', async () => {
        try { await ctx.api(`/api/animated-stories/${b.dataset.asPublish}/publish`, { method: 'POST' }); ctx.toast('Published.', 'success'); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      }));
      el.querySelectorAll('[data-as-delete]').forEach((b) => b.addEventListener('click', async () => {
        if (!await ctx.confirmDialog('Delete this animated story?', 'This cannot be undone.', 'Delete')) return;
        try { await ctx.api(`/api/animated-stories/${b.dataset.asDelete}`, { method: 'DELETE' }); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      }));
    }
  };
}

export default animatedLibraryPage;
