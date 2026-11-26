import { esc, toast } from '../ui.js';
import { GAME_MODULES } from '../games/index.js';
import { runGame } from '../gameRunner.js';

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const setPath = (obj, path, value) => {
  const keys = path.split('.');
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (node[key] == null || typeof node[key] !== 'object') node[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
};

function blankQuestion(type, index, meta) {
  const metadata = {};
  (meta.editorFields || []).forEach((f) => { metadata[f.key] = ''; });
  const needsChoices = !['matching', 'memory', 'sequencing', 'sorting', 'pronunciation'].includes(type);
  const choices = needsChoices ? [
    { text: '', is_correct: true, feedback: '' },
    { text: '', is_correct: false, feedback: '' },
    { text: '', is_correct: false, feedback: '' },
    { text: '', is_correct: false, feedback: '' }
  ] : [];
  return {
    prompt: type === 'sequencing' ? `Step ${index + 1}: describe what happens` : '',
    explanation: '', points: null, media_url: '', audio_url: '', metadata, choices
  };
}

export default async function builderPage(ctx) {
  const [subjects, competencies, lessons] = await Promise.all([
    ctx.api('/api/subjects'), ctx.api('/api/competencies'), ctx.api('/api/lessons')
  ]);
  const gameId = ctx.params[1] === 'new' ? null : ctx.params[1];
  let game;
  if (gameId) {
    game = await ctx.api(`/api/games/${gameId}`);
  } else {
    const type = ctx.query.type || 'multiple_choice';
    game = {
      id: null, title: ctx.query.title || 'New game', description: '', type,
      subject_id: null, grade_level: 'Grade 4', competency_id: null, lesson_id: null,
      difficulty: 'medium', time_limit: null, points_per_question: 10,
      show_feedback: 1, allow_retry: 1, config: {}, source: 'manual', status: 'draft',
      questions: []
    };
  }
  game.config = typeof game.config === 'string' ? (() => { try { return JSON.parse(game.config); } catch { return {}; } })() : (game.config || {});
  game.questions = game.questions || [];
  if (!game.questions.length) game.questions.push(blankQuestion(game.type, 0, GAME_MODULES[game.type]?.meta || {}));

  const meta = GAME_MODULES[game.type]?.meta || { title: game.type, icon: '🎮', blurb: '', editorFields: [] };
  const metaInfo = ctx.state.meta?.gameTypes?.find((t) => t.type === game.type);

  const configFields = {
    reading: [{ key: 'passage', label: 'Reading passage', type: 'textarea', full: true }],
    wordsearch: [{ key: 'gridSize', label: 'Grid size (8–18)', type: 'number' }],
    bingo: [{ key: 'calls', label: 'Number of calls', type: 'number' }]
  }[game.type] || [];

  const renderQuestion = (q, i) => {
    const fields = meta.editorFields || [];
    const needsChoices = !['matching', 'memory', 'sequencing', 'sorting', 'pronunciation'].includes(game.type);
    return `<div class="question-card" data-q="${i}">
      <div class="question-head">
        <div class="row"><span class="q-num">${i + 1}</span><strong class="small">Question ${i + 1}</strong></div>
        <div class="row">
          <button class="btn btn-sm btn-ghost" data-action="up" data-i="${i}" title="Move up">↑</button>
          <button class="btn btn-sm btn-ghost" data-action="down" data-i="${i}" title="Move down">↓</button>
          <button class="btn btn-sm btn-ghost" data-action="dupq" data-i="${i}" title="Duplicate">⧉</button>
          <button class="btn btn-sm btn-ghost" data-action="delq" data-i="${i}" title="Delete" style="color:var(--red)">✕</button>
        </div>
      </div>
      <label class="field">${game.type === 'sequencing' ? 'Event / step text' : game.type === 'true_false' ? 'Statement' : 'Question or prompt'}
        <textarea data-path="questions.${i}.prompt" rows="2" placeholder="${game.type === 'sequencing' ? 'What happens first?' : 'Type the question here…'}">${esc(q.prompt)}</textarea></label>
      <div class="form-grid" style="margin-top:.7rem">
        <label class="field">Explanation (shown as feedback)<input data-path="questions.${i}.explanation" value="${esc(q.explanation || '')}" placeholder="Why is this the answer?"></label>
        <label class="field">Points for this item<input data-path="questions.${i}.points" type="number" min="0" value="${esc(q.points ?? '')}" placeholder="Uses game default"></label>
        ${fields.map((f) => `<label class="field ${f.full ? 'full' : ''}">${esc(f.label)}
          ${f.type === 'textarea' ? `<textarea data-path="questions.${i}.metadata.${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(q.metadata?.[f.key] || '')}</textarea>`
            : `<input data-path="questions.${i}.metadata.${f.key}" value="${esc(q.metadata?.[f.key] || '')}" placeholder="${esc(f.placeholder || '')}">`}
          ${f.help ? `<span class="hint">${esc(f.help)}</span>` : ''}</label>`).join('')}
      </div>
      <div class="row wrap" style="margin-top:.7rem">
        <label class="btn btn-sm btn-ghost" style="margin:0">🖼 Upload image
          <input type="file" accept="image/*" class="hidden" data-upload="questions.${i}.media_url"></label>
        <label class="btn btn-sm btn-ghost" style="margin:0">🎧 Upload audio
          <input type="file" accept="audio/*" class="hidden" data-upload="questions.${i}.audio_url"></label>
        <label class="field small" style="flex:1;min-width:180px">Image URL
          <input data-path="questions.${i}.media_url" value="${esc(q.media_url || '')}" placeholder="/media/…"></label>
        <label class="field small" style="flex:1;min-width:180px">Audio URL
          <input data-path="questions.${i}.audio_url" value="${esc(q.audio_url || '')}" placeholder="/media/…"></label>
      </div>
      ${q.media_url ? `<img class="media-preview" src="${esc(q.media_url)}" alt="Question media">` : ''}
      ${q.audio_url ? `<audio controls src="${esc(q.audio_url)}" style="width:100%;margin-top:.5rem"></audio>` : ''}
      ${needsChoices ? `<div style="margin-top:.8rem;border-top:1px solid var(--line);padding-top:.7rem">
        <div class="row-between"><strong class="small">Answer choices</strong><button class="btn btn-sm btn-soft" data-action="addchoice" data-i="${i}">+ Add choice</button></div>
        ${(q.choices || []).map((c, j) => `<div class="choice-row">
          <input type="radio" name="correct-${i}" ${c.is_correct ? 'checked' : ''} data-correct="${i}.${j}" title="Mark correct answer" aria-label="Mark correct answer">
          <input type="text" data-path="questions.${i}.choices.${j}.text" value="${esc(c.text)}" placeholder="Choice ${j + 1}">
          <button class="btn btn-sm btn-ghost" data-action="delchoice" data-i="${i}" data-j="${j}" title="Remove choice">✕</button>
          <span class="chip ${c.is_correct ? 'chip-green' : ''}" style="font-size:.62rem">${c.is_correct ? 'Correct' : 'Wrong'}</span>
        </div>`).join('')}
        <div class="hint">Select the radio button next to the correct answer. ${['wordsearch', 'crossword', 'fill_blank', 'scramble', 'picture'].includes(game.type) ? 'Only the correct answer text is needed.' : ''}</div>
      </div>` : `<div class="hint" style="margin-top:.7rem">This game type uses the metadata fields above instead of answer choices.</div>`}
    </div>`;
  };

  const paint = (root) => {
    root.innerHTML = `<div class="builder-layout">
      <div class="stack">
        <div class="card card-pad">
          <div class="row-between"><div><span class="chip chip-indigo">${meta.icon || metaInfo?.icon || '🎮'} ${esc(meta.title || metaInfo?.title || game.type)}</span>
            <p class="muted small" style="margin:.5rem 0 0">${esc(meta.blurb || metaInfo?.title || '')}</p></div>
            <button class="btn btn-ghost btn-sm" data-nav="teacher/games">← Game Library</button></div>
          <div class="form-grid" style="margin-top:1rem">
            <label class="field full">Game title<input data-path="title" value="${esc(game.title)}"></label>
            <label class="field full">Description<textarea data-path="description" rows="2">${esc(game.description || '')}</textarea></label>
            ${configFields.map((f) => `<label class="field ${f.full ? 'full' : ''}">${esc(f.label)}
              ${f.type === 'textarea' ? `<textarea data-path="config.${f.key}" rows="4">${esc(game.config?.[f.key] || '')}</textarea>`
                : `<input data-path="config.${f.key}" type="${f.type}" value="${esc(game.config?.[f.key] ?? '')}">`}</label>`).join('')}
          </div>
        </div>
        <div class="section-head"><h2>Questions <span class="muted small">(${game.questions.length})</span></h2>
          <div class="row"><button class="btn btn-sm btn-ghost" data-action="preview">👁 Preview & play</button>
            <button class="btn btn-sm btn-primary" data-action="addq">+ Add question</button></div></div>
        <div id="questions" class="stack">${game.questions.map(renderQuestion).join('')}</div>
      </div>
      <div class="stack" style="position:sticky;top:86px">
        <div class="card card-pad">
          <h3>Publish settings</h3>
          <div class="form-grid">
            <label class="field">Subject<select data-path="subject_id"><option value="">No subject</option>
              ${subjects.map((s) => `<option value="${s.id}" ${String(game.subject_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
            <label class="field">Grade level<input data-path="grade_level" value="${esc(game.grade_level || '')}"></label>
            <label class="field full">Lesson<select data-path="lesson_id"><option value="">No lesson</option>
              ${lessons.map((l) => `<option value="${l.id}" ${String(game.lesson_id) === String(l.id) ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}</select></label>
            <label class="field full">Competency<select data-path="competency_id"><option value="">No competency</option>
              ${competencies.map((c) => `<option value="${c.id}" ${String(game.competency_id) === String(c.id) ? 'selected' : ''}>${esc(c.grade_level)} • ${esc(c.title)}${c.code ? ` (${esc(c.code)})` : ''}</option>`).join('')}</select></label>
            <label class="field">Difficulty<select data-path="difficulty">
              ${['easy', 'medium', 'hard'].map((d) => `<option value="${d}" ${game.difficulty === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select></label>
            <label class="field">Time limit (seconds)<input data-path="time_limit" type="number" min="0" value="${esc(game.time_limit || '')}" placeholder="No limit"></label>
            <label class="field">Points per item<input data-path="points_per_question" type="number" min="1" value="${esc(game.points_per_question)}"></label>
            <label class="field">Status<select data-path="status"><option value="draft" ${game.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="published" ${game.status === 'published' ? 'selected' : ''}>Published</option></select></label>
            <label class="field" style="display:flex;flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" data-path="show_feedback" ${game.show_feedback ? 'checked' : ''}> Show instant feedback</label>
            <label class="field" style="display:flex;flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" data-path="allow_retry" ${game.allow_retry ? 'checked' : ''}> Allow retries</label>
          </div>
          <div class="row" style="margin-top:1rem">
            <button class="btn btn-primary grow" data-action="save">Save draft</button>
            <button class="btn btn-green grow" data-action="publish">Publish</button>
          </div>
          <div class="row" style="margin-top:.5rem">
            <button class="btn btn-ghost btn-sm grow" data-action="savepreview">Save & preview</button>
            ${game.id ? '<button class="btn btn-ghost btn-sm grow" data-action="duplicate">Duplicate</button>' : ''}
          </div>
        </div>
        <div class="notice notice-info"><span>💡</span><div><strong>Teacher control:</strong> every question, answer, explanation, image and setting here is editable. Publishing is always a deliberate step.</div></div>
      </div>
    </div>`;
  };

  const payload = () => ({
    ...game,
    questions: game.questions.map((q) => ({
      ...q,
      points: q.points === '' || q.points === null || q.points === undefined ? null : Number(q.points),
      choices: (q.choices || []).map((c) => ({ ...c, is_correct: Boolean(c.is_correct) }))
    }))
  });

  const save = async (publish = false) => {
    if (!String(game.title || '').trim()) { toast('Please enter a game title', 'error'); return null; }
    if (!game.questions.length) { toast('Add at least one question', 'error'); return null; }
    const body = payload();
    body.status = publish ? 'published' : (game.status || 'draft');
    if (publish) {
      const issues = [];
      game.questions.forEach((q, i) => {
        const needsAnswer = !['matching', 'memory', 'sequencing', 'sorting', 'pronunciation', 'wordsearch', 'crossword'].includes(game.type);
        if (needsAnswer && !(q.choices || []).some((c) => c.is_correct && String(c.text).trim())) issues.push(`Question ${i + 1} needs a correct answer.`);
      });
      if (issues.length) { toast(issues.join(' '), 'error'); return null; }
    }
    try {
      const wasNew = !game.id;
      const saved = game.id ? await ctx.api(`/api/games/${game.id}`, { method: 'PUT', body }) : await ctx.api('/api/games', { method: 'POST', body });
      game.id = saved.id;
      game.status = saved.status;
      if (wasNew) history.replaceState(null, '', `#/builder/games/${saved.id}/edit`);
      if (publish && saved.status !== 'published') {
        const published = await ctx.api(`/api/games/${saved.id}/publish`, { method: 'POST' });
        game.status = published.status;
      }
      toast(publish ? 'Game published!' : 'Draft saved', 'success');
      return saved;
    } catch (error) {
      toast(`${error.message} ${(error.details || []).join(' ')}`, 'error');
      return null;
    }
  };

  const preview = (root) => {
    const stage = document.createElement('div');
    stage.className = 'player-card';
    stage.style.maxWidth = '760px';
    stage.innerHTML = `<div class="player-head"><div><h2 style="margin:0">${esc(game.title)}</h2><div class="muted small">Teacher preview — answers do not affect student scores</div></div><span class="chip chip-amber">Preview</span></div><div class="player-stage" id="preview-stage"></div>`;
    const holder = document.createElement('div');
    holder.className = 'modal-backdrop';
    holder.appendChild(stage);
    const close = document.createElement('button');
    close.className = 'btn btn-ghost btn-sm';
    close.textContent = 'Close preview';
    close.style.margin = '0 1rem 1rem';
    stage.appendChild(close);
    document.body.appendChild(holder);
    close.onclick = () => holder.remove();
    holder.addEventListener('click', (e) => { if (e.target === holder) holder.remove(); });
    runGame(stage.querySelector('#preview-stage'), { ...game, config: game.config || {} }, game.questions, {
      notify: (msg, kind) => toast(msg, kind),
      onFinish: () => toast('Preview complete', 'info')
    });
  };

  return {
    title: game.id ? 'Edit game' : 'Create game',
    html: '<div id="builder-root"></div>',
    mount(el) {
      const root = el.querySelector('#builder-root');
      paint(root);

      root.addEventListener('input', (e) => {
        const el2 = e.target.closest('[data-path]');
        if (!el2) return;
        setPath(game, el2.dataset.path, el2.type === 'checkbox' ? el2.checked : el2.value);
      });
      root.addEventListener('change', (e) => {
        const el2 = e.target.closest('[data-path], [data-correct], [data-upload]');
        if (!el2) return;
        if (el2.dataset.correct !== undefined) {
          const [qi, ci] = el2.dataset.correct.split('.').map(Number);
          game.questions[qi].choices.forEach((c, j) => { c.is_correct = j === ci; });
          paint(root);
        }
        if (el2.dataset.upload) {
          const file = el2.files?.[0];
          if (!file) return;
          if (file.size > 12 * 1024 * 1024) return toast('File is larger than 12 MB', 'error');
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const result = await ctx.api('/api/media', { method: 'POST', body: { dataUrl: reader.result, name: file.name } });
              setPath(game, el2.dataset.upload, result.url);
              paint(root);
              toast('File uploaded', 'success');
            } catch (error) { toast(error.message, 'error'); }
          };
          reader.readAsDataURL(file);
        }
      });
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-action]');
        if (!b) return;
        const action = b.dataset.action;
        const i = Number(b.dataset.i);
        if (action === 'addq') { game.questions.push(blankQuestion(game.type, game.questions.length, meta)); paint(root); }
        if (action === 'delq') { if (game.questions.length > 1) { game.questions.splice(i, 1); paint(root); } else toast('A game needs at least one question', 'error'); }
        if (action === 'dupq') { game.questions.splice(i + 1, 0, JSON.parse(JSON.stringify(game.questions[i]))); paint(root); }
        if (action === 'up' && i > 0) { [game.questions[i - 1], game.questions[i]] = [game.questions[i], game.questions[i - 1]]; paint(root); }
        if (action === 'down' && i < game.questions.length - 1) { [game.questions[i + 1], game.questions[i]] = [game.questions[i], game.questions[i + 1]]; paint(root); }
        if (action === 'addchoice') { game.questions[i].choices.push({ text: '', is_correct: false, feedback: '' }); paint(root); }
        if (action === 'delchoice') {
          const q = game.questions[i];
          if (q.choices.length <= 2) return toast('Keep at least two choices', 'error');
          const wasCorrect = q.choices[b.dataset.j].is_correct;
          q.choices.splice(Number(b.dataset.j), 1);
          if (wasCorrect) q.choices[0].is_correct = true;
          paint(root);
        }
        if (action === 'preview') preview(root);
        if (action === 'save') await save(false);
        if (action === 'publish') { if (await save(true)) ctx.go('teacher/games'); }
        if (action === 'savepreview') { const saved = await save(false); if (saved) preview(root); }
        if (action === 'duplicate') {
          try { const copy = await ctx.api(`/api/games/${game.id}/duplicate`, { method: 'POST' }); ctx.go(`builder/games/${copy.id}/edit`); }
          catch (error) { toast(error.message, 'error'); }
        }
      });
    }
  };
}
