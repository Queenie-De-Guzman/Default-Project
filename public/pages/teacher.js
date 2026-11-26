import { esc, formatDate, toast } from '../ui.js';
import { runGame } from '../gameRunner.js';
import { animatedAdminPage } from './animatedstory.js';

export const teacherNav = [
  { path: 'teacher', label: 'Overview', icon: '🏠', short: 'Home' },
  { path: 'teacher/materials', label: 'My Learning Materials', icon: '📂', short: 'Materials' },
  { path: 'teacher/presentations', label: 'PPT & Lesson Reader', icon: '📽️', short: 'PPT' },
  { path: 'teacher/library', label: 'Story Library', icon: '📖', short: 'Stories' },
  { path: 'teacher/animated', label: 'Animated Storybooks', icon: '🎬', short: 'Animated' },
  { path: 'teacher/generator', label: 'AI Game Generator', icon: '✨', short: 'Create' },
  { path: 'teacher/lessons', label: 'Lessons', icon: '📘', short: 'Lessons' },
  { path: 'teacher/games', label: 'Game Library', icon: '🎮', short: 'Games' },
  { path: 'teacher/generated', label: 'My Generated Games', icon: '🧩', short: 'Generated' },
  { path: 'teacher/customize', label: 'Customization', icon: '🎨', short: 'Settings' },
  { path: 'teacher/classes', label: 'Classes', icon: '👥', short: 'Classes' },
  { path: 'teacher/assignments', label: 'Assignments', icon: '📌', short: 'Assign' },
  { path: 'teacher/competencies', label: 'Competencies', icon: '🎯' },
  { path: 'teacher/reports', label: 'Reports', icon: '📊' },
  { path: 'teacher/analytics', label: 'Insights', icon: '📈' }
];

function selectField(key, label, options, value, extra = {}) {
  return { key, label, type: 'select', options, value, ...extra };
}

export async function formModal(ctx, title, fields, values = {}, options = {}) {
  const html = fields.map((f) => {
    const id = `f_${f.key}`;
    const v = values[f.key] ?? f.value ?? '';
    let input;
    if (f.type === 'select') {
      input = `<select id="${id}" name="${esc(f.key)}" ${f.required ? 'required' : ''}>${(f.options || []).map((o) =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" name="${esc(f.key)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''}>${esc(v)}</textarea>`;
    } else if (f.type === 'checkbox') {
      input = `<input id="${id}" name="${esc(f.key)}" type="checkbox" ${v ? 'checked' : ''}>`;
    } else {
      input = `<input id="${id}" name="${esc(f.key)}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.min ? `min="${f.min}"` : ''} ${f.max ? `max="${f.max}"` : ''}>`;
    }
    return `<label class="field ${f.full ? 'full' : ''}">${esc(f.label)}${input}${f.help ? `<span class="hint">${esc(f.help)}</span>` : ''}</label>`;
  }).join('');
  const body = await ctx.modal(title, `<div class="form-grid">${html}</div>`, options);
  if (!body) return null;
  const result = {};
  for (const f of fields) {
    const el = body.querySelector(`[name="${f.key}"]`);
    if (!el) continue;
    result[f.key] = f.type === 'checkbox' ? el.checked : el.value;
  }
  return result;
}

async function loadMeta(ctx) {
  if (!ctx.state.meta) ctx.state.meta = await ctx.api('/api/meta');
  return ctx.state.meta;
}

const iconOf = (ctx, type) => ctx.state.meta?.gameTypes?.find((g) => g.type === type)?.icon || '🎮';
const titleOf = (ctx, type) => ctx.state.meta?.gameTypes?.find((g) => g.type === type)?.title || type;

export async function teacherPage(ctx) {
  await loadMeta(ctx);
  const [section, id, action] = ctx.params;
  if (section === 'lessons') return lessonsPage(ctx);
  if (section === 'games' && id && action === 'preview') return previewGamePage(ctx, id);
  if (section === 'games') return gamesPage(ctx);
  if (section === 'generator') return generatorPage(ctx);
  if (section === 'classes') return classesPage(ctx, id, action);
  if (section === 'assignments') return assignmentsPage(ctx);
  if (section === 'competencies') return competenciesPage(ctx);
  if (section === 'reports') return reportsPage(ctx);
  if (section === 'animated') return animatedAdminPage(ctx);
  return overviewPage(ctx);
}

async function overviewPage(ctx) {
  const data = await ctx.api('/api/teacher/overview');
  const stats = [
    ['🎮', data.stats.games, 'Games created'],
    ['📘', data.stats.lessons, 'Lessons'],
    ['📌', data.stats.assignments, 'Assignments'],
    ['👥', data.stats.classes, 'Classes'],
    ['🏆', data.stats.plays, 'Game plays'],
    ['📈', `${data.stats.average}%`, 'Average score']
  ];
  return {
    title: 'Overview',
    html: `<div class="stack">
      <div class="notice notice-info"><span>👋</span><div><strong>Welcome back, ${esc(ctx.state.user.full_name.split(' ')[0])}!</strong> Start by creating a lesson, then build a game and assign it to a class.</div></div>
      <div class="grid grid-3">
        ${stats.map(([icon, num, label]) => `<div class="card stat"><div class="stat-ico">${icon}</div><div><div class="stat-num">${esc(num)}</div><div class="stat-label">${label}</div></div></div>`).join('')}
      </div>
      <div class="grid grid-2">
        <div class="card card-pad">
          <div class="section-head"><h2>Quick actions</h2></div>
          <div class="grid grid-2">
            <button class="btn btn-primary" data-nav="teacher/generator">✨ Generate from material</button>
            <button class="btn btn-ghost" data-nav="teacher/materials">📽️ Import a presentation</button>
            <button class="btn btn-ghost" data-nav="teacher/library">📖 Open Story Library</button>
            <button class="btn btn-ghost" data-nav="teacher/games">🎮 Open Game Library</button>
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-head"><h2>Popular games</h2><button class="btn btn-sm btn-soft" data-nav="teacher/games">View all</button></div>
          ${data.topGames.length ? data.topGames.map((g) => `<div class="row" style="padding:.35rem 0;border-bottom:1px solid var(--line)">
            <span style="font-size:1.3rem">${iconOf(ctx, g.type)}</span><div class="grow ellipsis"><strong>${esc(g.title)}</strong><div class="muted tiny">${g.plays} plays • ${g.avg ?? 0}% avg</div></div>
          </div>`).join('') : '<p class="muted small">No plays recorded yet.</p>'}
        </div>
      </div>
      <div class="card">
        <div class="card-pad section-head" style="margin:0"><h2>Recent student results</h2><button class="btn btn-sm btn-ghost" data-nav="teacher/reports">Full report</button></div>
        <div class="table-wrap" style="border:0;border-radius:0">
          <table><thead><tr><th>Student</th><th>Game</th><th>Score</th><th>Stars</th><th>Date</th></tr></thead><tbody>
          ${data.recent.length ? data.recent.map((r) => `<tr><td><strong>${esc(r.student_name)}</strong></td><td>${esc(r.game_title)}</td>
            <td><span class="chip ${r.percentage >= 75 ? 'chip-green' : 'chip-amber'}">${r.percentage}%</span></td>
            <td class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</td><td class="muted small">${formatDate(r.recorded_at, true)}</td></tr>`).join('')
          : '<tr><td colspan="5" class="center muted">No results yet. Assign a game to get started.</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </div>`
  };
}

async function lessonsPage(ctx) {
  const [lessons, subjects, competencies] = await Promise.all([
    ctx.api('/api/lessons'), ctx.api('/api/subjects'), ctx.api('/api/competencies')
  ]);
  const subjectOpts = subjects.map((s) => ({ value: s.id, label: s.name }));
  const compOpts = [{ value: '', label: 'No competency selected' }, ...competencies.map((c) => ({ value: c.id, label: `${c.grade_level} • ${c.title}${c.code ? ` (${c.code})` : ''}` }))];
  const fields = (v = {}) => [
    { key: 'title', label: 'Lesson title', required: true, full: true, value: v.title },
    selectField('subject_id', 'Subject', subjectOpts, v.subject_id),
    { key: 'grade_level', label: 'Grade level', value: v.grade_level || 'Grade 4', placeholder: 'e.g. Grade 4' },
    selectField('competency_id', 'Curriculum competency', compOpts, v.competency_id, { full: true }),
    { key: 'objectives', label: 'Learning objectives', type: 'textarea', full: true, value: v.objectives },
    { key: 'description', label: 'Description', type: 'textarea', full: true, value: v.description },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }], value: v.status || 'draft' }
  ];
  return {
    title: 'Lessons',
    html: `<div class="stack">
      <div class="section-head"><div><h2>My lessons</h2><p class="muted small">Plan learning experiences and attach competencies.</p></div>
        <button class="btn btn-primary" id="add-lesson">+ New lesson</button></div>
      <div class="table-wrap"><table><thead><tr><th>Lesson</th><th>Subject</th><th>Grade</th><th>Competency</th><th>Games</th><th>Status</th><th></th></tr></thead><tbody>
      ${lessons.length ? lessons.map((l) => `<tr>
        <td><strong>${esc(l.title)}</strong><div class="muted tiny">${esc((l.description || '').slice(0, 60))}</div></td>
        <td>${esc(l.subject_name || '—')}</td><td>${esc(l.grade_level || '—')}</td>
        <td class="small">${esc(l.competency_title || '—')}</td><td>${l.game_count}</td>
        <td><span class="chip ${l.status === 'published' ? 'chip-green' : 'chip-amber'}">${l.status}</span></td>
        <td class="right"><button class="btn btn-sm btn-ghost" data-nav="teacher/lessons/${l.id}/read">📖 Read</button>
          <button class="btn btn-sm btn-ghost" data-content="${l.id}">📄 Content</button>
          <button class="btn btn-sm btn-ghost" data-edit="${l.id}">Edit</button>
          <button class="btn btn-sm btn-ghost" data-del="${l.id}" style="color:var(--red)">Delete</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="center muted">No lessons yet. Create your first lesson.</td></tr>'}
      </tbody></table></div>
    </div>`,
    mount(el) {
      el.querySelector('#add-lesson').addEventListener('click', async () => {
        const values = await formModal(ctx, 'New lesson', fields());
        if (!values) return;
        try { await ctx.api('/api/lessons', { method: 'POST', body: values }); ctx.toast('Lesson created', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      });
      el.querySelectorAll('[data-content]').forEach((button) => button.addEventListener('click', async () => {
        const lessonId = button.dataset.content;
        try {
          const reading = await ctx.api(`/api/reading/lessons/${lessonId}`);
          const body = await ctx.modal(`Reading content — ${reading.lesson.title}`, `
            <div class="stack">
              <div class="notice notice-info"><span>📄</span><div>Paste a story or upload a text-based document. EduPlay splits blank-line separated paragraphs into storybook pages. Scanned PDFs need OCR first.</div></div>
              <label class="field full">Reading text<textarea id="content-text" rows="12" placeholder="Paste your lesson or story here…">${esc(reading.pages.map((p) => p.text).join('\n\n'))}</textarea></label>
              <div class="form-grid">
                <label class="field full">Upload document (TXT, MD, HTML, text-based PDF)<input id="content-file" type="file" accept=".txt,.md,.html,.htm,.pdf,.csv"></label>
                <label class="field">Import mode<select id="content-mode"><option value="replace">Replace existing pages</option><option value="append">Add pages at the end</option></select></label>
              </div>
              <div class="muted small">${reading.pages.length} page(s) currently saved.</div>
            </div>`, { wide: true, okText: 'Save content' });
          if (!body) return;
          const file = body.querySelector('#content-file').files[0];
          let text = body.querySelector('#content-text').value.trim();
          let sourceFile = null;
          if (file) {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('Could not read that file.'));
              reader.readAsDataURL(file);
            });
            const extracted = await ctx.api('/api/reading/extract', { method: 'POST', body: { dataUrl, name: file.name } });
            if (extracted.scanned || !extracted.text) throw new Error(extracted.suggestion || 'No text could be extracted from that file.');
            text = extracted.text;
            sourceFile = file.name;
          }
          if (!text) throw new Error('Add some reading text or choose a file first.');
          await ctx.api(`/api/reading/lessons/${lessonId}/import`, { method: 'POST', body: { text, mode: body.querySelector('#content-mode').value, source_file: sourceFile } });
          ctx.toast('Reading content saved', 'success');
          ctx.render();
        } catch (error) { ctx.toast(error.message, 'error'); }
      }));
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
        const lesson = lessons.find((l) => l.id == b.dataset.edit);
        const values = await formModal(ctx, 'Edit lesson', fields(lesson), lesson);
        if (!values) return;
        try { await ctx.api(`/api/lessons/${lesson.id}`, { method: 'PUT', body: values }); ctx.toast('Lesson updated', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!await ctx.confirmDialog('Delete lesson?', 'This cannot be undone. Games in this lesson will remain.')) return;
        try { await ctx.api(`/api/lessons/${b.dataset.del}`, { method: 'DELETE' }); ctx.toast('Lesson deleted', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
    }
  };
}

async function previewGamePage(ctx, id) {
  const game = await ctx.api(`/api/games/${id}`);
  const meta = ctx.state.meta.gameTypes.find((g) => g.type === game.type);
  return {
    title: `Preview: ${game.title}`,
    shell: false,
    html: `<div class="player">
      <div class="player-top">
        <button class="btn btn-ghost btn-sm" data-nav="teacher/games">← Game Library</button>
        <div class="grow"><div class="muted tiny">Teacher preview • ${esc(meta?.title || game.type)}</div><strong class="small">${esc(game.title)}</strong></div>
        <span class="chip chip-amber">Preview mode</span>
      </div>
      <div class="player-card">
        <div class="player-head"><div><h2 style="margin:0">${meta?.icon || '🎮'} ${esc(game.title)}</h2>
          <div class="muted small">${esc(game.description || 'Test the learner experience before publishing.')}</div></div>
          <span class="chip chip-indigo">${game.questions.length} questions</span></div>
        <div class="player-stage" id="stage"></div>
        <div class="player-foot"><span>Preview answers are never saved to student records.</span><span>${game.points_per_question} pts each</span></div>
      </div>
    </div>`,
    mount(el) {
      const stage = el.querySelector('#stage');
      runGame(stage, game, game.questions, {
        notify: (msg, kind) => ctx.toast(msg, kind),
        onFinish: () => {
          stage.insertAdjacentHTML('beforeend', `<div class="notice notice-green" style="margin-top:1rem"><span>✅</span><div>Preview complete. Adjust anything in the builder, then publish when ready.</div></div>`);
        }
      });
    }
  };
}

async function gamesPage(ctx) {
  const [games, subjects] = await Promise.all([ctx.api('/api/games'), ctx.api('/api/subjects')]);
  const types = ctx.state.meta.gameTypes;
  return {
    title: 'Game Library',
    html: `<div class="stack">
      <div class="section-head"><div><h2>Game Library</h2><p class="muted small">Create, edit, preview and publish interactive games.</p></div>
        <button class="btn btn-primary" id="new-game">+ Create game</button></div>
      <div class="card card-pad filters">
        <input id="search" class="search" placeholder="🔍 Search games…">
        <select id="filter-type"><option value="">All formats</option>${types.map((t) => `<option value="${t.type}">${t.icon} ${t.title}</option>`).join('')}</select>
        <select id="filter-status"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select>
        <select id="filter-subject"><option value="">All subjects</option>${subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <span class="muted small" id="count"></span>
      </div>
      <div class="grid grid-4" id="game-grid"></div>
    </div>`,
    mount(el) {
      const grid = el.querySelector('#game-grid');
      const paint = () => {
        const search = el.querySelector('#search').value.toLowerCase();
        const type = el.querySelector('#filter-type').value;
        const status = el.querySelector('#filter-status').value;
        const subject = el.querySelector('#filter-subject').value;
        const list = games.filter((g) => (!search || g.title.toLowerCase().includes(search)) && (!type || g.type === type) && (!status || g.status === status) && (!subject || String(g.subject_id) === subject));
        el.querySelector('#count').textContent = `${list.length} game${list.length === 1 ? '' : 's'}`;
        grid.innerHTML = list.length ? list.map((g) => {
          const colors = ['#6366f1', '#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899'];
          const color = colors[g.id % colors.length];
          return `<div class="card game-card card-hover">
            <div class="game-cover" style="background:linear-gradient(135deg,${color},${color}bb)">${g.cover_image ? `<img src="${esc(g.cover_image)}" alt="" style="height:100%;width:100%;object-fit:cover">` : iconOf(ctx, g.type)}</div>
            <div class="game-card-body">
              <div class="row wrap"><span class="chip chip-indigo">${iconOf(ctx, g.type)} ${esc(titleOf(ctx, g.type))}</span>
                <span class="chip ${g.status === 'published' ? 'chip-green' : 'chip-amber'}">${g.status}</span>
                ${g.source === 'ai' ? '<span class="chip chip-pink">AI draft</span>' : ''}</div>
              <h3>${esc(g.title)}</h3>
              <p class="muted small" style="margin:0">${esc((g.description || 'No description').slice(0, 80))}</p>
              <div class="muted tiny">${g.question_count} questions • ${g.assignment_count} assignments • ${esc(g.subject_name || 'No subject')}</div>
              <div class="game-actions">
                <button class="btn btn-sm btn-primary" data-edit="${g.id}">Edit</button>
                <button class="btn btn-sm btn-ghost" data-preview="${g.id}">Preview</button>
                <button class="btn btn-sm btn-ghost" data-dup="${g.id}">Duplicate</button>
                ${g.status === 'draft' ? `<button class="btn btn-sm btn-green" data-pub="${g.id}">Publish</button>` : `<button class="btn btn-sm btn-ghost" data-unpub="${g.id}">Unpublish</button>`}
                <button class="btn btn-sm btn-ghost" data-assign="${g.id}">Assign</button>
                <button class="btn btn-sm btn-ghost" data-del="${g.id}" style="color:var(--red)">🗑</button>
              </div>
            </div></div>`;
        }).join('') : '<div class="empty" style="grid-column:1/-1"><div class="big">🎲</div><h3>No games found</h3><p>Create one or adjust your filters.</p></div>';
      };
      paint();
      ['#search', '#filter-type', '#filter-status', '#filter-subject'].forEach((s) => el.querySelector(s).addEventListener('input', paint));
      el.querySelector('#new-game').addEventListener('click', async () => {
        const values = await formModal(ctx, 'Choose a game format', [
          { key: 'title', label: 'Game title', required: true, full: true, placeholder: 'e.g. Solar System Quiz' },
          selectField('type', 'Game format', types.map((t) => ({ value: t.type, label: `${t.icon} ${t.title}` })), 'multiple_choice', { full: true })
        ], {}, { okText: 'Continue to builder' });
        if (!values) return;
        ctx.go(`builder/games/new?type=${values.type}&title=${encodeURIComponent(values.title)}`);
      });
      const find = (id) => games.find((g) => g.id == id);
      grid.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const { edit, preview, dup, pub, unpub, assign, del } = b.dataset;
        if (edit) return ctx.go(`builder/games/${edit}/edit`);
        if (preview) return ctx.go(`teacher/games/${preview}/preview`);
        if (dup) {
          try { await ctx.api(`/api/games/${dup}/duplicate`, { method: 'POST' }); ctx.toast('Game duplicated as draft', 'success'); ctx.render(); }
          catch (err) { ctx.toast(err.message, 'error'); }
        }
        if (pub) {
          try { await ctx.api(`/api/games/${pub}/publish`, { method: 'POST' }); ctx.toast('Game published!', 'success'); ctx.render(); }
          catch (err) { ctx.toast(`${err.message} ${(err.details || []).join(' ')}`, 'error'); }
        }
        if (unpub) {
          try { await ctx.api(`/api/games/${unpub}`, { method: 'PUT', body: { status: 'draft' } }); ctx.toast('Moved to drafts', 'success'); ctx.render(); }
          catch (err) { ctx.toast(err.message, 'error'); }
        }
        if (assign) {
          const classes = await ctx.api('/api/classes');
          if (!classes.length) return ctx.toast('Create a class first', 'error');
          const values = await formModal(ctx, 'Assign game', [
            selectField('class_id', 'Class', classes.map((c) => ({ value: c.id, label: `${c.name} (${c.student_count} students)` })), classes[0].id, { full: true }),
            { key: 'due_at', label: 'Due date (optional)', type: 'datetime-local' },
            { key: 'instructions', label: 'Instructions', type: 'textarea', full: true, value: 'Play carefully and learn something new!' },
            { key: 'allow_retry', label: 'Allow retries', type: 'checkbox', value: true },
            { key: 'show_feedback', label: 'Show instant feedback', type: 'checkbox', value: true }
          ], {}, { okText: 'Assign' });
          if (!values) return;
          try {
            await ctx.api('/api/assignments', { method: 'POST', body: { ...values, game_id: Number(assign) } });
            ctx.toast('Game assigned to class', 'success'); ctx.render();
          } catch (err) { ctx.toast(err.message, 'error'); }
        }
        if (del) {
          const g = find(del);
          if (!await ctx.confirmDialog('Delete game?', `“${g.title}” and its questions will be permanently removed.`)) return;
          try { await ctx.api(`/api/games/${del}`, { method: 'DELETE' }); ctx.toast('Game deleted', 'success'); ctx.render(); }
          catch (err) { ctx.toast(err.message, 'error'); }
        }
      });
    }
  };
}

async function generatorPage(ctx) {
  const [subjects, competencies] = await Promise.all([ctx.api('/api/subjects'), ctx.api('/api/competencies')]);
  const types = ctx.state.meta.gameTypes;
  const fields = [
    { key: 'topic', label: 'Topic or lesson focus', required: true, full: true, placeholder: 'e.g. The water cycle' },
    selectField('grade_level', 'Grade level', ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8'].map((g) => ({ value: g, label: g })), 'Grade 4'),
    selectField('subject', 'Subject', subjects.map((s) => ({ value: s.name, label: s.name })), 'Science'),
    selectField('competency_id', 'Competency (optional)', [{ value: '', label: 'No competency selected' }, ...competencies.map((c) => ({ value: c.id, label: `${c.grade_level} • ${c.title}` }))], ''),
    selectField('game_type', 'Game format', types.map((t) => ({ value: t.type, label: `${t.icon} ${t.title}` })), 'multiple_choice', { full: true }),
    { key: 'count', label: 'Number of items', type: 'number', value: 6, min: 2, max: 30 }
  ];
  return {
    title: 'AI Game Generator',
    html: `<div class="stack">
      <div class="notice notice-info"><span>🤖</span><div><strong>Draft assistant, not autopilot.</strong> Generated questions are always saved as editable drafts and must be reviewed by a teacher before publishing. No official DepEd competency codes are generated.</div></div>
      <div class="builder-layout">
        <div class="card card-pad">
          <h2>Describe what you need</h2>
          <form id="gen-form" class="form-grid">
            ${fields.map((f) => `<label class="field ${f.full ? 'full' : ''}">${esc(f.label)}
              ${f.type === 'select' ? `<select name="${f.key}">${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
                : `<input name="${f.key}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.required ? 'required' : ''} ${f.min ? `min="${f.min}"` : ''} ${f.max ? `max="${f.max}"` : ''}>`}
            </label>`).join('')}
            <div class="full"><button class="btn btn-primary btn-lg" type="submit">✨ Generate draft questions</button></div>
          </form>
        </div>
        <div class="card card-pad">
          <h3>How it works</h3>
          <ol class="muted small" style="padding-left:1.1rem;line-height:1.8">
            <li>Enter a topic, grade and subject.</li>
            <li>The generator suggests questions, answers and explanations.</li>
            <li>Review and edit everything in the builder.</li>
            <li>Publish only when it is accurate and curriculum-aligned.</li>
          </ol>
          <div class="notice" style="margin-top:1rem"><span>📚</span><div>Verify every competency reference against your official DepEd curriculum document before selecting it.</div></div>
        </div>
      </div>
      <div id="results"></div>
    </div>`,
    mount(el) {
      el.querySelector('#gen-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.target));
        const comp = competencies.find((c) => String(c.id) === body.competency_id);
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Generating…';
        try {
          const result = await ctx.api('/api/ai/generate', { method: 'POST', body: { ...body, competency_title: comp?.title || '' } });
          const results = el.querySelector('#results');
          results.innerHTML = `<div class="card card-pad">
            <div class="row-between"><div><h2>Draft ready — review required</h2>
              <p class="muted small">${result.questions.length} questions • ${esc(result.engine || 'local')} generator</p></div>
              <span class="chip chip-amber">Draft only</span></div>
            ${result.warnings.map((w) => `<div class="notice"><span>⚠️</span><div>${esc(w)}</div></div>`).join('')}
            <div class="row wrap" style="margin:1rem 0"><strong class="small">Recommended formats:</strong>
              ${result.recommended.slice(0, 8).map((t) => `<button class="btn btn-sm ${body.game_type === t ? 'btn-primary' : 'btn-ghost'}" data-rec="${t}">${iconOf(ctx, t)} ${esc(titleOf(ctx, t))}</button>`).join('')}</div>
            <div class="stack" id="draft-list">
              ${result.questions.map((q, i) => `<div class="question-card"><div class="question-head"><span class="q-num">${i + 1}</span><span class="chip">${esc(body.game_type)}</span></div>
                <p style="font-weight:600;margin-bottom:.3rem">${esc(q.prompt)}</p>
                ${q.choices?.length ? `<div class="muted small">${q.choices.map((c) => `${c.is_correct ? '✅' : '◻️'} ${esc(c.text)}`).join(' • ')}</div>` : ''}
              </div>`).join('')}
            </div>
            <div class="row" style="margin-top:1rem"><button class="btn btn-primary btn-lg" id="save-draft">Save as editable draft →</button>
              <span class="muted small">You can edit every question, answer and setting before publishing.</span></div>
          </div>`;
          let chosenType = body.game_type;
          results.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => {
            chosenType = b.dataset.rec;
            results.querySelectorAll('[data-rec]').forEach((x) => x.className = 'btn btn-sm btn-ghost');
            b.className = 'btn btn-sm btn-primary';
          }));
          results.querySelector('#save-draft').addEventListener('click', async () => {
            try {
              const payload = {
                title: `${body.topic} — ${titleOf(ctx, chosenType)}`,
                description: `AI-assisted draft for ${body.grade_level} ${body.subject}. Review before publishing.`,
                type: chosenType, grade_level: body.grade_level, subject: body.subject,
                subject_id: subjects.find((s) => s.name === body.subject)?.id || null,
                competency_id: body.competency_id || null, status: 'draft', source: 'ai',
                config: result.config || {}, questions: result.questions
              };
              const game = await ctx.api('/api/games', { method: 'POST', body: payload });
              ctx.toast('Draft saved — review it in the builder', 'success');
              ctx.go(`builder/games/${game.id}/edit`);
            } catch (err) { ctx.toast(err.message, 'error'); }
          });
        } catch (err) { ctx.toast(err.message, 'error'); }
        finally { btn.disabled = false; btn.textContent = '✨ Generate draft questions'; }
      });
    }
  };
}

async function classesPage(ctx, id, action) {
  const [classes, subjects, students] = await Promise.all([ctx.api('/api/classes'), ctx.api('/api/subjects'), ctx.api('/api/students')]);
  const subjectOpts = [{ value: '', label: 'No subject' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))];
  const fields = (v = {}) => [
    { key: 'name', label: 'Class name', required: true, value: v.name, placeholder: 'e.g. Grade 4 - Sunflower' },
    { key: 'grade_level', label: 'Grade level', required: true, value: v.grade_level || 'Grade 4' },
    selectField('subject_id', 'Subject', subjectOpts, v.subject_id),
    { key: 'school_year', label: 'School year', value: v.school_year || '2026-2027' }
  ];
  let detail = null;
  if (id && action === 'students') detail = await ctx.api(`/api/classes/${id}`);
  if (detail) return classDetailPage(ctx, detail, students);
  return {
    title: 'Classes',
    html: `<div class="stack">
      <div class="section-head"><div><h2>My classes</h2><p class="muted small">Share a join code with students or add them directly.</p></div>
        <button class="btn btn-primary" id="add-class">+ New class</button></div>
      <div class="grid grid-3">
        ${classes.length ? classes.map((c) => `<div class="card card-pad card-hover">
          <div class="row-between"><span style="font-size:1.8rem">🏫</span><span class="chip chip-indigo">${esc(c.grade_level)}</span></div>
          <h3 style="margin-top:.5rem">${esc(c.name)}</h3>
          <p class="muted small">${esc(c.subject_name || 'General')} • ${c.student_count} student${c.student_count === 1 ? '' : 's'} • ${c.assignment_count} assignments</p>
          <div class="row"><span class="chip mono">Code: ${esc(c.join_code)}</span></div>
          <div class="row" style="margin-top:1rem"><button class="btn btn-sm btn-primary" data-manage="${c.id}">Manage students</button>
            <button class="btn btn-sm btn-ghost" data-edit="${c.id}">Edit</button>
            <button class="btn btn-sm btn-ghost" data-del="${c.id}" style="color:var(--red)">🗑</button></div>
        </div>`).join('') : '<div class="empty" style="grid-column:1/-1"><div class="big">🏫</div><h3>No classes yet</h3><p>Create a class to assign games.</p></div>'}
      </div>
    </div>`,
    mount(el) {
      el.querySelector('#add-class').addEventListener('click', async () => {
        const values = await formModal(ctx, 'New class', fields());
        if (!values) return;
        try { await ctx.api('/api/classes', { method: 'POST', body: values }); ctx.toast('Class created', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      });
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
        const c = classes.find((x) => x.id == b.dataset.edit);
        const values = await formModal(ctx, 'Edit class', fields(c), c);
        if (!values) return;
        try { await ctx.api(`/api/classes/${c.id}`, { method: 'PUT', body: values }); ctx.toast('Class updated', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
      el.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => ctx.go(`teacher/classes/${b.dataset.manage}/students`)));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!await ctx.confirmDialog('Delete class?', 'Assignments and enrolments in this class will be removed.')) return;
        try { await ctx.api(`/api/classes/${b.dataset.del}`, { method: 'DELETE' }); ctx.toast('Class deleted', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
    }
  };
}

function classDetailPage(ctx, detail, allStudents) {
  const enrolled = new Set(detail.students.map((s) => s.id));
  return {
    title: detail.name,
    html: `<div class="stack">
      <div class="row"><button class="btn btn-ghost btn-sm" data-nav="teacher/classes">← Classes</button>
        <div class="grow"><h2 style="margin:0">${esc(detail.name)}</h2><div class="muted small">Join code: <strong class="mono">${esc(detail.join_code)}</strong></div></div></div>
      <div class="grid grid-2">
        <div class="card card-pad">
          <div class="section-head"><h3>Enrolled students (${detail.students.length})</h3></div>
          ${detail.students.length ? detail.students.map((s) => `<div class="row" style="padding:.45rem 0;border-bottom:1px solid var(--line)">
            <div class="avatar" style="width:32px;height:32px;background:#f59e0b">${esc(s.full_name[0])}</div>
            <div class="grow"><strong class="small">${esc(s.full_name)}</strong><div class="muted tiny">${esc(s.email)}</div></div>
            <button class="btn btn-sm btn-ghost" data-remove="${s.id}" style="color:var(--red)">Remove</button></div>`).join('')
          : '<p class="muted small">No students enrolled yet.</p>'}
        </div>
        <div class="card card-pad">
          <h3>Add a student</h3>
          <p class="muted small">Create a new student account and add it to this class automatically.</p>
          <form id="new-student" class="form-grid">
            <label class="field full">Full name<input name="full_name" required></label>
            <label class="field">Email<input name="email" type="email" required></label>
            <label class="field">Password<input name="password" value="Student123!"></label>
            <label class="field">Grade level<input name="grade_level" value="${esc(detail.grade_level)}"></label>
            <label class="field">Section<input name="section" placeholder="e.g. Sunflower"></label>
            <div class="full"><button class="btn btn-primary" type="submit">Add student</button></div>
          </form>
          <hr style="border:0;border-top:1px solid var(--line);margin:1.2rem 0">
          <h3>Enrol an existing student</h3>
          <select id="existing-student"><option value="">Choose a student…</option>
            ${allStudents.filter((s) => !enrolled.has(s.id)).map((s) => `<option value="${s.id}">${esc(s.full_name)} (${esc(s.email)})</option>`).join('')}
          </select>
          <button class="btn btn-soft btn-sm" id="enrol" style="margin-top:.6rem">Enrol selected student</button>
        </div>
      </div>
    </div>`,
    mount(el) {
      el.querySelector('#new-student').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await ctx.api('/api/students', { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), class_id: detail.id } });
          ctx.toast('Student added', 'success'); ctx.render();
        } catch (err) { ctx.toast(err.message, 'error'); }
      });
      el.querySelector('#enrol').addEventListener('click', async () => {
        const student_id = el.querySelector('#existing-student').value;
        if (!student_id) return ctx.toast('Choose a student first', 'error');
        try { await ctx.api(`/api/classes/${detail.id}/students`, { method: 'POST', body: { student_id: Number(student_id) } }); ctx.render(); }
        catch (err) { ctx.toast(err.message, 'error'); }
      });
      el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
        try { await ctx.api(`/api/classes/${detail.id}/students/${b.dataset.remove}`, { method: 'DELETE' }); ctx.render(); }
        catch (err) { ctx.toast(err.message, 'error'); }
      }));
    }
  };
}

async function assignmentsPage(ctx) {
  const [assignments, games, classes] = await Promise.all([ctx.api('/api/assignments'), ctx.api('/api/games'), ctx.api('/api/classes')]);
  const fields = (v = {}) => [
    selectField('game_id', 'Game', games.filter((g) => g.status === 'published').map((g) => ({ value: g.id, label: `${iconOf(ctx, g.type)} ${g.title}` })), v.game_id, { full: true }),
    selectField('class_id', 'Class', classes.map((c) => ({ value: c.id, label: c.name })), v.class_id, { full: true }),
    { key: 'title', label: 'Assignment title (optional)', value: v.title },
    { key: 'due_at', label: 'Due date', type: 'datetime-local', value: v.due_at ? String(v.due_at).slice(0, 16) : '' },
    { key: 'instructions', label: 'Instructions', type: 'textarea', full: true, value: v.instructions },
    { key: 'allow_retry', label: 'Allow retries', type: 'checkbox', value: v.allow_retry ?? true },
    { key: 'show_feedback', label: 'Show instant feedback', type: 'checkbox', value: v.show_feedback ?? true },
    selectField('status', 'Status', [{ value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }], v.status || 'active')
  ];
  return {
    title: 'Assignments',
    html: `<div class="stack">
      <div class="section-head"><div><h2>Assignments</h2><p class="muted small">Publish games to classes and track completion.</p></div>
        <button class="btn btn-primary" id="add-assign">+ New assignment</button></div>
      <div class="table-wrap"><table><thead><tr><th>Assignment</th><th>Game</th><th>Class</th><th>Due</th><th>Responses</th><th>Status</th><th></th></tr></thead><tbody>
      ${assignments.length ? assignments.map((a) => `<tr>
        <td><strong>${esc(a.title || a.game_title)}</strong></td>
        <td>${iconOf(ctx, a.game_type)} ${esc(a.game_title)} ${a.game_status !== 'published' ? '<span class="chip chip-red">Unpublished</span>' : ''}</td>
        <td>${esc(a.class_name)}</td><td class="small">${a.due_at ? formatDate(a.due_at, true) : 'No due date'}</td>
        <td>${a.student_count}/${a.attempt_count}</td>
        <td><span class="chip ${a.status === 'active' ? 'chip-green' : 'chip-amber'}">${a.status}</span></td>
        <td class="right"><button class="btn btn-sm btn-ghost" data-edit="${a.id}">Edit</button>
          <button class="btn btn-sm btn-ghost" data-del="${a.id}" style="color:var(--red)">🗑</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="center muted">No assignments yet.</td></tr>'}
      </tbody></table></div>
    </div>`,
    mount(el) {
      el.querySelector('#add-assign').addEventListener('click', async () => {
        if (!games.some((g) => g.status === 'published')) return ctx.toast('Publish a game first', 'error');
        const v = await formModal(ctx, 'New assignment', fields());
        if (!v) return;
        try { await ctx.api('/api/assignments', { method: 'POST', body: v }); ctx.toast('Assignment created', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      });
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
        const a = assignments.find((x) => x.id == b.dataset.edit);
        const v = await formModal(ctx, 'Edit assignment', fields(a), a);
        if (!v) return;
        delete v.game_id; delete v.class_id;
        try { await ctx.api(`/api/assignments/${a.id}`, { method: 'PUT', body: v }); ctx.toast('Assignment updated', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!await ctx.confirmDialog('Delete assignment?', 'Student attempts and scores will be kept.')) return;
        try { await ctx.api(`/api/assignments/${b.dataset.del}`, { method: 'DELETE' }); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
    }
  };
}

async function competenciesPage(ctx) {
  const [list, subjects] = await Promise.all([ctx.api('/api/competencies'), ctx.api('/api/subjects')]);
  const subjectOpts = subjects.map((s) => ({ value: s.id, label: s.name }));
  const fields = (v = {}) => [
    selectField('subject_id', 'Subject', subjectOpts, v.subject_id, { full: true }),
    { key: 'grade_level', label: 'Grade level', value: v.grade_level || 'Grade 4', required: true },
    { key: 'title', label: 'Competency title', value: v.title, required: true },
    { key: 'code', label: 'Official code (optional)', value: v.code, help: 'Enter only a code copied from your official DepEd document.' },
    { key: 'curriculum', label: 'Curriculum', value: v.curriculum || 'DepEd MATATAG' },
    { key: 'reference', label: 'Reference / source', value: v.reference },
    { key: 'description', label: 'Description', type: 'textarea', full: true, value: v.description }
  ];
  return {
    title: 'Curriculum Competencies',
    html: `<div class="stack">
      <div class="notice"><span>📚</span><div><strong>Important:</strong> EduPlay does not ship official DepEd competency codes. Sample entries below are unverified and meant as starting points. Add codes and references from your own official curriculum documents, then mark them verified.</div></div>
      <div class="section-head"><div><h2>Competency bank</h2><p class="muted small">${list.length} entries • ${list.filter((c) => c.verified).length} teacher-verified</p></div>
        <button class="btn btn-primary" id="add-comp">+ Add competency</button></div>
      <div class="table-wrap"><table><thead><tr><th>Title</th><th>Subject</th><th>Grade</th><th>Code</th><th>Reference</th><th>Verification</th><th></th></tr></thead><tbody>
      ${list.length ? list.map((c) => `<tr>
        <td><strong>${esc(c.title)}</strong><div class="muted tiny">${esc((c.description || '').slice(0, 70))}</div></td>
        <td>${esc(c.subject_name)}</td><td>${esc(c.grade_level)}</td>
        <td class="mono small">${c.code ? esc(c.code) : '<span class="muted">No code</span>'}</td>
        <td class="small muted">${esc((c.reference || '—').slice(0, 40))}</td>
        <td><span class="chip ${c.verified ? 'chip-green' : 'chip-amber'}">${c.verified ? '✅ Verified' : 'Unverified'}</span></td>
        <td class="right"><button class="btn btn-sm ${c.verified ? 'btn-ghost' : 'btn-soft'}" data-verify="${c.id}">${c.verified ? 'Unverify' : 'Verify'}</button>
          <button class="btn btn-sm btn-ghost" data-edit="${c.id}">Edit</button>
          <button class="btn btn-sm btn-ghost" data-del="${c.id}" style="color:var(--red)">🗑</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="center muted">No competencies yet.</td></tr>'}
      </tbody></table></div>
    </div>`,
    mount(el) {
      el.querySelector('#add-comp').addEventListener('click', async () => {
        const v = await formModal(ctx, 'Add competency', fields());
        if (!v) return;
        try { await ctx.api('/api/competencies', { method: 'POST', body: v }); ctx.toast('Competency added', 'success'); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      });
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
        const c = list.find((x) => x.id == b.dataset.edit);
        const v = await formModal(ctx, 'Edit competency', fields(c), c);
        if (!v) return;
        try { await ctx.api(`/api/competencies/${c.id}`, { method: 'PUT', body: v }); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
      el.querySelectorAll('[data-verify]').forEach((b) => b.addEventListener('click', async () => {
        const c = list.find((x) => x.id == b.dataset.verify);
        try { await ctx.api(`/api/competencies/${c.id}`, { method: 'PUT', body: { verified: !c.verified } }); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!await ctx.confirmDialog('Delete competency?', 'Lessons using it will keep their titles.')) return;
        try { await ctx.api(`/api/competencies/${b.dataset.del}`, { method: 'DELETE' }); ctx.render(); }
        catch (e) { ctx.toast(e.message, 'error'); }
      }));
    }
  };
}

async function reportsPage(ctx) {
  const data = await ctx.api('/api/reports/summary');
  const exportReport = async (type) => {
    const response = await fetch(`/api/reports/export?type=${type}`, { headers: { Authorization: `Bearer ${ctx.state.token}` } });
    if (!response.ok) return ctx.toast('Export failed', 'error');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `eduplay-${type}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return {
    title: 'Reports & Analytics',
    html: `<div class="stack">
      <div class="section-head"><div><h2>Assessment reports</h2><p class="muted small">Review performance by game and by student.</p></div>
        <div class="row"><button class="btn btn-ghost" data-export="scores">⬇ Results CSV</button>
          <button class="btn btn-ghost" data-export="games">⬇ Games CSV</button>
          <button class="btn btn-ghost" data-export="students">⬇ Students CSV</button></div></div>
      <div class="grid grid-4">
        ${[['🎮', data.totals.games, 'Games'], ['📌', data.totals.assignments, 'Assignments'], ['🏆', data.totals.completed, 'Completed plays'], ['📚', data.totals.lessons, 'Lessons']]
          .map(([i, n, l]) => `<div class="card stat"><div class="stat-ico">${i}</div><div><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div></div>`).join('')}
      </div>
      <div class="grid grid-2">
        <div class="card card-pad"><h3>Performance by game</h3>
          <div class="table-wrap" style="border:0"><table><thead><tr><th>Game</th><th>Plays</th><th>Average</th><th>Best</th></tr></thead><tbody>
          ${data.byGame.map((g) => `<tr><td class="small">${iconOf(ctx, g.type)} ${esc(g.title)}</td><td>${g.attempts}</td><td>${g.avg ?? 0}%</td><td>${g.best_score ?? 0}%</td></tr>`).join('') || '<tr><td colspan="4" class="muted center">No data</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="card card-pad"><h3>Top students</h3>
          <div class="table-wrap" style="border:0"><table><thead><tr><th>Student</th><th>Plays</th><th>Average</th><th>Points</th></tr></thead><tbody>
          ${data.byStudent.map((s) => `<tr><td class="small">${esc(s.full_name)}</td><td>${s.attempts}</td><td>${s.avg_score ?? 0}%</td><td>${s.points}</td></tr>`).join('') || '<tr><td colspan="4" class="muted center">No data</td></tr>'}
          </tbody></table></div>
        </div>
      </div>
    </div>`,
    mount(el) { el.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => exportReport(b.dataset.export))); }
  };
}
