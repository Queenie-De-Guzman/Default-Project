import { esc } from '../ui.js';
import { teacherGuideHtml } from '../teacherguide.js';

const RECOMMENDED = ['multiple_choice', 'matching', 'fill_blank', 'wordsearch', 'sequencing', 'true_false'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const THEMES = ['playful', 'nature', 'space', 'detective', 'classic'];
const CHARACTERS = ['Coach Pixel', 'Professor Owl', 'Captain Star', 'Ate Maya', 'Kuya Jun'];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file. Try again.'));
    reader.readAsDataURL(file);
  });
}

const numberOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

async function ensureMeta(ctx) {
  if (!ctx.state.meta) ctx.state.meta = await ctx.api('/api/meta');
  return ctx.state.meta;
}

const gameTitle = (ctx, type) => ctx.state.meta?.gameTypes?.find((g) => g.type === type)?.title || type;
const gameIcon = (ctx, type) => ctx.state.meta?.gameTypes?.find((g) => g.type === type)?.icon || '🎮';

function parseSource(value) {
  const [type, id] = String(value || 'text').split(':');
  return { sourceType: type || 'text', sourceId: id ? Number(id) : null };
}

export async function generatorPage(ctx) {
  await ensureMeta(ctx);
  const [materials, stories, lessons, subjects] = await Promise.all([
    ctx.api('/api/materials'), ctx.api('/api/stories'), ctx.api('/api/lessons'), ctx.api('/api/subjects')
  ]);
  let drafts = [];
  let analysis = null;
  let analysisId = null;
  const preselectedMaterial = ctx.query.material ? String(ctx.query.material) : '';
  if (preselectedMaterial && !materials.some((m) => String(m.id) === preselectedMaterial)) {
    materials.unshift({ id: preselectedMaterial, title: `Material #${preselectedMaterial}` });
  }
  let sourceSelection = preselectedMaterial
    ? { sourceType: 'material', sourceId: Number(preselectedMaterial) }
    : { sourceType: 'text', sourceId: null };

  const sourceOptions = [
    '<option value="text">✍️ Pasted text</option>',
    '<option value="upload">📤 Upload a file now</option>',
    ...materials.map((m) => `<option value="material:${m.id}" ${String(m.id) === preselectedMaterial ? 'selected' : ''}>📽️ Material — ${esc(m.title)}</option>`),
    ...stories.map((s) => `<option value="story:${s.id}">📖 Story — ${esc(s.title)}</option>`),
    ...lessons.map((l) => `<option value="lesson:${l.id}">📘 Lesson — ${esc(l.title)}</option>`)
  ].join('');

  const formatOptions = RECOMMENDED.map((type) => `<label class="field checkbox gen-format">
    <input type="checkbox" name="format" value="${type}" ${['multiple_choice', 'matching', 'fill_blank'].includes(type) ? 'checked' : ''}>
    ${esc(gameIcon(ctx, type))} ${esc(gameTitle(ctx, type))}</label>`).join('');
  const accept = (ctx.state.meta.fileTypes || []).map((f) => `.${f.ext}`).join(',');

  return {
    title: 'AI Game Generator',
    html: `<div class="stack">
      <div class="notice notice-info"><span>🤖</span><div><strong>Grounded in your own material.</strong> Choose an uploaded presentation, story, lesson or paste text. Questions, answers and explanations come from that source; unclear items are flagged for teacher review.</div></div>
      <div class="builder-layout">
        <div class="card card-pad">
          <h2>1. Choose your source</h2>
          <form id="gen-source-form" class="stack">
            <label class="field">Source <select id="gen-source">${sourceOptions}</select></label>
            <div id="gen-upload-wrap" class="field gen-upload-wrap">Upload a file now <input id="gen-upload-file" type="file" accept="${esc(accept)}"><span class="hint">The file is saved to My Learning Materials first, then analyzed from its extracted text.</span></div>
            <div id="gen-text-wrap" class="field">Pasted text <textarea id="gen-text" rows="9" placeholder="Paste authorized lesson or story text here…"></textarea></div>
            <div class="form-grid">
              <label class="field">Title <input id="gen-title" placeholder="Used for generated drafts"></label>
              <label class="field">Grade <select id="gen-grade">${['', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8'].map((g) => `<option value="${g}" ${g === 'Grade 4' ? 'selected' : ''}>${g || 'Infer from source'}</option>`).join('')}</select></label>
              <label class="field">Subject <select id="gen-subject"><option value="">Infer from source</option>${subjects.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}</select></label>
              <label class="field">Language <select id="gen-language"><option>English</option><option>Filipino</option></select></label>
            </div>
            <div class="form-grid gen-settings">
              <label class="field">Number of questions <input id="gen-count" type="number" min="1" max="40" value="8"></label>
              <label class="field">Difficulty <select id="gen-difficulty">${DIFFICULTIES.map((d) => `<option value="${d}" ${d === 'medium' ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select></label>
              <label class="field">Default points per item <input id="gen-points" type="number" min="1" value="10"></label>
              <label class="field">Time limit (seconds) <input id="gen-time" type="number" min="0" value="0"></label>
              <label class="field full">Instructions for learners <textarea id="gen-instructions" rows="2" placeholder="Answer using only what the source says."></textarea></label>
              <label class="field">Guide character <select id="gen-character"><option value="">Default narrator</option>${CHARACTERS.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
              <label class="field full">Background / scenario <textarea id="gen-background" rows="2" placeholder="Optional setting or context, grounded in the source…"></textarea></label>
              <label class="field checkbox"><input id="gen-animations" type="checkbox" checked> Animations</label>
              <label class="field checkbox"><input id="gen-sound" type="checkbox" checked> Sound effects</label>
              <label class="field checkbox"><input id="gen-music" type="checkbox"> Background music</label>
            </div>
            <div><strong class="small">Game formats</strong><div class="gen-formats">${formatOptions}</div></div>
            <button class="btn btn-primary btn-lg" type="submit">✨ Analyze source & create drafts</button>
          </form>
        </div>
        <div class="card card-pad">
          <h2>How review works</h2>
          <ol class="gen-steps">
            <li>The server extracts readable text and sections from your source.</li>
            <li>It suggests objectives, vocabulary, comprehension items and game drafts.</li>
            <li>You edit every question, answer, explanation and game setting below.</li>
            <li>Save as drafts, open the builder, then publish only after verification.</li>
          </ol>
          <div class="notice"><span>🎯</span><div>Competency suggestions are sample titles with no official code. Enter and verify official DepEd/MATATAG codes yourself.</div></div>
          <div class="notice"><span>🔒</span><div>Use only material you own, licensed, public-domain or otherwise authorized for classroom use.</div></div>
        </div>
      </div>
      <div id="gen-results"></div>
    </div>`,
    mount(el) {
      const sourceSelect = el.querySelector('#gen-source');
      const textWrap = el.querySelector('#gen-text-wrap');
      const uploadWrap = el.querySelector('#gen-upload-wrap');
      const uploadInput = el.querySelector('#gen-upload-file');
      const toggleText = () => {
        textWrap.style.display = sourceSelect.value === 'text' ? 'block' : 'none';
        uploadWrap.style.display = sourceSelect.value === 'upload' ? 'block' : 'none';
      };
      sourceSelect.addEventListener('change', toggleText);
      toggleText();

      const generationBody = (extra = {}) => ({
        questionCount: numberOr(el.querySelector('#gen-count').value, 8),
        difficulty: el.querySelector('#gen-difficulty').value,
        defaultPoints: numberOr(el.querySelector('#gen-points').value, 10),
        defaultTimeLimit: numberOr(el.querySelector('#gen-time').value, 0),
        instructions: el.querySelector('#gen-instructions').value.trim(),
        character: el.querySelector('#gen-character').value,
        animations: el.querySelector('#gen-animations').checked,
        soundEffects: el.querySelector('#gen-sound').checked,
        backgroundMusic: el.querySelector('#gen-music').checked,
        background: el.querySelector('#gen-background').value.trim(),
        ...extra
      });

      el.querySelector('#gen-source-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Analyzing source…';
        sourceSelection = parseSource(sourceSelect.value);
        const text = el.querySelector('#gen-text').value.trim();
        const title = el.querySelector('#gen-title').value.trim();
        if (sourceSelection.sourceType === 'text' && !text) {
          ctx.toast('Paste text, choose another source or upload a file.', 'error');
          btn.disabled = false; btn.textContent = '✨ Analyze source & create drafts'; return;
        }
        const formats = [...e.target.querySelectorAll('[name=format]:checked')].map((i) => i.value);
        try {
          if (sourceSelection.sourceType === 'upload') {
            const file = uploadInput.files[0];
            if (!file) throw new Error('Choose a file to upload first.');
            btn.textContent = 'Uploading file…';
            const limit = Number(ctx.state.meta.maxUploadBytes || 12 * 1024 * 1024);
            if (file.size > limit) throw new Error('That file is larger than the upload limit.');
            const result = await ctx.api('/api/materials', { method: 'POST', body: {
              dataUrl: await fileToDataUrl(file), fileName: file.name, mime: file.type || '',
              title, grade_level: el.querySelector('#gen-grade').value,
              subject: el.querySelector('#gen-subject').value,
              language: el.querySelector('#gen-language').value,
              file_size: file.size
            } });
            if (result.status === 'failed') throw new Error(result.error || 'The uploaded file could not be processed.');
            sourceSelection = { sourceType: 'material', sourceId: result.id };
            materials.unshift(result);
            sourceSelect.innerHTML = `<option value="text">✍️ Pasted text</option><option value="upload">📤 Upload a file now</option>`
              + materials.map((m) => `<option value="material:${m.id}">📽️ Material — ${esc(m.title)}</option>`).join('')
              + stories.map((s) => `<option value="story:${s.id}">📖 Story — ${esc(s.title)}</option>`).join('')
              + lessons.map((l) => `<option value="lesson:${l.id}">📘 Lesson — ${esc(l.title)}</option>`).join('');
            sourceSelect.value = `material:${result.id}`;
            toggleText();
            btn.textContent = 'Analyzing source…';
          }
          const body = generationBody({
            ...sourceSelection, text, formats,
            title: title || analysis?.source?.title || '',
            gradeLevel: el.querySelector('#gen-grade').value,
            subject: el.querySelector('#gen-subject').value,
            language: el.querySelector('#gen-language').value
          });
          const result = await ctx.api('/api/ai/generate-from-source', { method: 'POST', body });
          analysis = result.analysis || {};
          if (!analysis.teacherGuide && result.teacherGuide) analysis.teacherGuide = result.teacherGuide;
          analysisId = result.analysisId; drafts = result.drafts || [];
          paintResults();
          ctx.toast(`${drafts.length} editable draft${drafts.length === 1 ? '' : 's'} ready for review.`, 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
        finally { btn.disabled = false; btn.textContent = '✨ Analyze source & create drafts'; }
      });

      function paintResults() {
        const root = el.querySelector('#gen-results');
        root.innerHTML = `<div class="card card-pad">
          <div class="row-between wrap"><div><h2>2. Review & edit before saving</h2>
            <p class="muted small">Source: ${esc(analysis?.source?.title || 'your material')} • ${analysis?.source?.wordCount || 0} words • ${analysis?.provider === 'remote' ? 'remote AI engine' : 'offline grounded engine'}</p></div>
            <span class="chip chip-amber">Editable drafts</span></div>
          <div class="gen-summary">
            <div><strong>Topic</strong><p>${esc(analysis?.topic || 'Unclear')}</p></div>
            <div><strong>Suggested grade</strong><p>${esc(analysis?.suggestedGrade || 'Review needed')}</p></div>
            <div><strong>Suggested subject</strong><p>${esc(analysis?.suggestedSubject || 'General')}</p></div>
          </div>
          <div class="grid grid-2">
            <div><strong>Learning objectives</strong><ul>${(analysis?.objectives || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
            <div><strong>Suggested competencies <span class="chip chip-amber">Unverified</span></strong><ul>${(analysis?.competencySuggestions || []).map((c) => `<li>${esc(c.title)}<div class="muted tiny">${esc(c.reason || '')}</div></li>`).join('')}</ul></div>
          </div>
          <details class="gen-keyfacts" ${analysis?.keyFacts?.length ? 'open' : ''}>
            <summary><strong>Key facts from the source</strong></summary>
            <ul>${(analysis?.keyFacts || []).map((f) => `<li>${esc(typeof f === 'string' ? f : f.text || f.fact || '')}</li>`).join('') || '<li class="muted">No distinct facts were extracted from this source.</li>'}</ul>
          </details>
          ${(analysis?.flags || []).map((f) => `<div class="notice"><span>⚠️</span><div>${esc(f)}</div></div>`).join('')}
          ${(analysis?.warnings || []).map((w) => `<div class="notice"><span>ℹ️</span><div>${esc(w)}</div></div>`).join('')}
          ${teacherGuideHtml(analysis?.teacherGuide)}
        </div>
        <div class="section-head"><h2>Game drafts</h2><span class="muted small">${drafts.length} selected</span></div>
        <div class="gen-draft-list">${drafts.map(draftHtml).join('')}</div>
        <div class="row wrap" style="margin:1rem 0"><button class="btn btn-primary btn-lg" id="gen-save">💾 Save selected drafts</button>
          <button class="btn btn-soft btn-lg" id="gen-save-preview">Save &amp; preview</button>
          <span class="muted small">Saved games open in the builder for full customization.</span></div>`;
        bindDrafts();
        root.querySelector('#gen-save').addEventListener('click', () => saveDrafts(false));
        root.querySelector('#gen-save-preview').addEventListener('click', () => saveDrafts(true));
      }

      function draftHtml(draft, i) {
        const config = draft.config || {};
        const questions = draft.questions || [];
        return `<div class="card card-pad gen-draft" data-draft="${i}">
          <div class="row-between wrap"><div class="row"><span style="font-size:1.5rem">${esc(gameIcon(ctx, draft.type))}</span>
            <div><strong>${esc(gameTitle(ctx, draft.type))}</strong><div class="muted tiny">${esc(draft.description || '')}</div></div></div>
            <label class="field checkbox"><input type="checkbox" data-draft-select ${draft.selected !== false ? 'checked' : ''}> Include</label></div>
          <div class="form-grid">
            <label class="field">Title <input data-draft-title value="${esc(draft.title || '')}"></label>
            <label class="field">Difficulty <select data-draft-difficulty>${DIFFICULTIES.map((d) => `<option ${draft.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
            <label class="field">Points per question <input type="number" min="1" max="100" data-draft-points value="${esc(draft.points_per_question || config.points_per_question || 10)}"></label>
            <label class="field">Time limit (seconds) <input type="number" min="0" data-draft-time value="${esc(draft.time_limit || config.time_limit || 0)}"></label>
            <label class="field full">Instructions <textarea data-draft-instructions rows="2">${esc(config.instructions || draft.description || '')}</textarea></label>
            <label class="field">Theme <select data-draft-theme>${THEMES.map((t) => `<option ${config.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="field checkbox"><input type="checkbox" data-draft-animations ${config.animations !== false ? 'checked' : ''}> Animations</label>
            <label class="field checkbox"><input type="checkbox" data-draft-sound ${config.soundEffects !== false ? 'checked' : ''}> Sound effects</label>
            <label class="field checkbox"><input type="checkbox" data-draft-music ${config.backgroundMusic ? 'checked' : ''}> Background music</label>
          </div>
          <div class="section-head"><h3>Questions</h3><button class="btn btn-sm btn-soft" data-add-question>+ Add question</button></div>
          <div class="gen-questions">${questions.map((q, qi) => questionHtml(q, qi)).join('') || '<p class="muted small">No questions generated for this format.</p>'}</div>
        </div>`;
      }

      function questionHtml(q, qi) {
        const metadata = q.metadata || {};
        const choices = q.choices || [];
        return `<div class="gen-question" data-question="${qi}">
          <div class="row-between"><strong class="small">Question ${qi + 1}</strong><button class="btn btn-sm btn-ghost" data-remove-question>Remove</button></div>
          <label class="field">Prompt <input data-q-prompt value="${esc(q.prompt || '')}"></label>
          ${choices.length ? `<div class="gen-choices">${choices.map((c, ci) => `<div class="gen-choice">
            <input data-q-choice value="${esc(c.text || '')}" placeholder="Choice ${ci + 1}">
            <label class="gen-correct"><input type="checkbox" data-q-correct ${c.is_correct ? 'checked' : ''}> Correct</label>
            <button class="btn btn-sm btn-ghost" data-remove-choice>✕</button></div>`).join('')}</div>` : ''}
          <label class="field">Explanation / evidence <textarea data-q-explanation rows="2">${esc(q.explanation || metadata.sourceQuote || '')}</textarea></label>
          <div class="muted tiny">${metadata.sourceQuote ? `Source: ${esc(metadata.sourceQuote.slice(0, 160))}` : 'No source quote recorded.'} ${metadata.needsReview ? ' • ⚠️ Needs review' : ''}</div>
          ${choices.length ? '<button class="btn btn-sm btn-ghost" data-add-choice>+ Add choice</button>' : ''}
        </div>`;
      }

      function readDrafts() {
        document.querySelectorAll('[data-draft]').forEach((card) => {
          const i = Number(card.dataset.draft);
          const d = drafts[i];
          d.selected = card.querySelector('[data-draft-select]').checked;
          d.title = card.querySelector('[data-draft-title]').value;
          d.difficulty = card.querySelector('[data-draft-difficulty]').value;
          d.points_per_question = Number(card.querySelector('[data-draft-points]').value) || 10;
          d.time_limit = Number(card.querySelector('[data-draft-time]').value) || 0;
          d.description = card.querySelector('[data-draft-instructions]').value;
          d.config = {
            ...(d.config || {}),
            theme: card.querySelector('[data-draft-theme]').value,
            animations: card.querySelector('[data-draft-animations]').checked,
            soundEffects: card.querySelector('[data-draft-sound]').checked,
            backgroundMusic: card.querySelector('[data-draft-music]').checked,
            instructions: card.querySelector('[data-draft-instructions]').value,
            points_per_question: d.points_per_question,
            time_limit: d.time_limit
          };
          card.querySelectorAll('[data-question]').forEach((qEl) => {
            const q = d.questions[Number(qEl.dataset.question)];
            q.prompt = qEl.querySelector('[data-q-prompt]').value;
            q.explanation = qEl.querySelector('[data-q-explanation]').value;
            const choices = [...qEl.querySelectorAll('[data-q-choice]')].map((input, ci) => ({
              text: input.value, is_correct: qEl.querySelectorAll('[data-q-correct]')[ci]?.checked || false
            }));
            if (choices.length) q.choices = choices;
          });
        });
      }

      function bindDrafts() {
        const root = el.querySelector('#gen-results');
        root.querySelectorAll('[data-add-choice]').forEach((b) => b.addEventListener('click', () => {
          readDrafts();
          const qi = Number(b.closest('[data-question]').dataset.question);
          const di = Number(b.closest('[data-draft]').dataset.draft);
          drafts[di].questions[qi].choices.push({ text: '', is_correct: false });
          paintResults();
        }));
        root.querySelectorAll('[data-remove-choice]').forEach((b) => b.addEventListener('click', () => {
          readDrafts();
          const qEl = b.closest('[data-question]');
          const qi = Number(qEl.dataset.question); const ci = [...qEl.querySelectorAll('[data-remove-choice]')].indexOf(b);
          const di = Number(b.closest('[data-draft]').dataset.draft);
          drafts[di].questions[qi].choices.splice(ci, 1);
          paintResults();
        }));
        root.querySelectorAll('[data-add-question]').forEach((b) => b.addEventListener('click', () => {
          readDrafts();
          const di = Number(b.closest('[data-draft]').dataset.draft);
          drafts[di].questions.push({ prompt: '', explanation: '', metadata: { sourceQuote: '', needsReview: true, sourceType: 'teacher' }, choices: [{ text: '', is_correct: true }, { text: '', is_correct: false }] });
          paintResults();
        }));
        root.querySelectorAll('[data-remove-question]').forEach((b) => b.addEventListener('click', () => {
          readDrafts();
          const qi = Number(b.closest('[data-question]').dataset.question);
          const di = Number(b.closest('[data-draft]').dataset.draft);
          drafts[di].questions.splice(qi, 1);
          paintResults();
        }));
      }

      async function saveDrafts(preview = false) {
        readDrafts();
        const selected = drafts.filter((d) => d.selected !== false && (d.questions || []).some((q) => q.prompt?.trim()));
        if (!selected.length) return ctx.toast('Select and complete at least one game draft.', 'error');
        const btn = el.querySelector(preview ? '#gen-save-preview' : '#gen-save');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          let savedIds = [];
          if (sourceSelection.sourceType === 'material') {
            const result = await ctx.api(`/api/materials/${sourceSelection.sourceId}/games`, {
              method: 'POST', body: { ...generationBody(), drafts: selected, analysis_id: analysisId }
            });
            savedIds = result.gameIds || [];
          } else if (sourceSelection.sourceType === 'story') {
            const result = await ctx.api(`/api/stories/${sourceSelection.sourceId}/games`, {
              method: 'POST', body: { ...generationBody(), drafts: selected, analysis_id: analysisId }
            });
            savedIds = result.gameIds || [];
          } else {
            const payload = generationBody({
              ...sourceSelection,
              text: el.querySelector('#gen-text').value.trim(),
              title: el.querySelector('#gen-title').value.trim() || analysis?.source?.title,
              gradeLevel: el.querySelector('#gen-grade').value,
              subject: el.querySelector('#gen-subject').value,
              language: el.querySelector('#gen-language').value,
              drafts: selected, save: true
            });
            const result = await ctx.api('/api/ai/generate-from-source', { method: 'POST', body: payload });
            savedIds = result.gameIds || [];
          }
          ctx.toast(`${selected.length} editable game draft${selected.length === 1 ? '' : 's'} saved.`, 'success');
          if (preview && savedIds.length) ctx.go(`teacher/games/${savedIds[0]}/preview`);
          else ctx.go('teacher/games');
        } catch (error) {
          ctx.toast(error.message, 'error');
          btn.disabled = false;
          btn.textContent = preview ? 'Save & preview' : '💾 Save selected drafts';
        }
      }
    }
  };
}

export default generatorPage;
