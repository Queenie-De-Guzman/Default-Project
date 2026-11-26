import { esc, formatDate } from '../ui.js';
import { readingSpeech } from '../reading.js';
import { highlightHtml } from '../highlight.js';
import { teacherGuideHtml } from '../teacherguide.js';
import { flipbookHtml, turnFlipbook, bindFlipbook, initialFlipMode, applyStoredZoom } from '../flipbook.js';
import { fileToDataUrl, buildPdfStoryPages, persistPagePreviews, closeOcrWorker } from '../pdf-story.js';

const SUGGESTED_STORIES = [
  { group: 'Values Education', theme: 'kindness, honesty, respect, responsibility', grade: 'Grades 1–6', subject: 'Values Education', ideas: [
    ['The Little Boy Who Helped Others', 'Recognize how small acts of kindness help others.'],
    ['The Lost Wallet', 'Explain why honesty and integrity matter.'],
    ['Our Clean Classroom', 'Describe ways to share responsibility and teamwork.'],
    ['The Sharing Tree', 'Identify ways to show generosity and friendship.']
  ] },
  { group: 'Science and Nature', theme: 'plants, animals, weather, life cycles', grade: 'Grades 2–6', subject: 'Science', ideas: [
    ['The Journey of a Little Seed', 'Explain the stages of a plant life cycle.'],
    ['From Caterpillar to Butterfly', 'Sequence the stages of metamorphosis.'],
    ['The Adventure of a Water Drop', 'Describe how water moves through the water cycle.'],
    ['The Children Who Saved the Forest', 'Identify ways to protect trees and wildlife.'],
    ['The Journey Through the Solar System', 'Name the planets and describe basic space facts.'],
    ['The Power of Electricity', 'Explain simple, safe uses of electricity.']
  ] },
  { group: 'Mathematics', theme: 'counting, addition, subtraction, problem-solving', grade: 'Grades 1–4', subject: 'Mathematics', ideas: [
    ["Mia's First Market Day", 'Count objects and solve simple addition problems.'],
    ['The Pizza Party', 'Divide a whole into equal parts.'],
    ["Ben's Little Savings", 'Add coins and explain why saving money matters.'],
    ['The Shape Builders', 'Identify and use basic shapes to build objects.']
  ] },
  { group: 'Philippine Culture and History', theme: 'identity, traditions, community, history', grade: 'Grades 1–6', subject: 'Philippine Culture and History', ideas: [
    ['Ang Magsasaka at ang Kalabaw', 'Napapahalagahan ang sipag at pagtutulungan.'],
    ['Ang Bayanihan sa Aming Barangay', 'Ipaliwanag ang kahulugan ng bayanihan.'],
    ['Ang Pista sa Aming Bayan', 'Identify elements of local culture and traditions.'],
    ['Bakasyon sa Probinsya', 'Describe Filipino family traditions.'],
    ['The Time-Traveling Historian', 'Sequence key events in Philippine history.']
  ] },
  { group: 'Health and Safety', theme: 'hygiene, nutrition, safety, preparedness', grade: 'Grades 1–6', subject: 'Health', ideas: [
    ['The Adventures of Clean Hands', 'Demonstrate proper handwashing.'],
    ['The Rainbow on My Plate', 'Choose a balanced meal.'],
    ['Ready, Set, Be Safe!', 'State what to do during common emergencies.'],
    ['The Safe Way to School', 'Follow road and pedestrian safety rules.']
  ] },
  { group: 'Environmental Education', theme: 'conservation, waste management, civic care', grade: 'Grades 4–6', subject: 'Science', ideas: [
    ['The Mystery of the Missing Trees', 'Explain why forests matter.'],
    ['The Inventor of Tomorrow', 'Propose a creative solution to an environmental problem.'],
    ['The Community Problem Solvers', 'Describe ways to take part in civic responsibility.'],
    ['The Great Recycling Challenge', 'Sort materials and explain waste reduction.']
  ] },
  { group: 'Adventure and Imagination', theme: 'vocabulary, sequencing, inference, imagination', grade: 'Grades 1–6', subject: 'English', ideas: [
    ['The Brave Little Rabbit', 'Describe character traits using story evidence.'],
    ['The Missing Puppy', 'Retell events in correct sequence.'],
    ['A Day at the Beach', 'Use descriptive words from the story.'],
    ['The Magic Library', 'Derive word meanings from context.'],
    ['The Secret Garden', 'Identify the main idea of a passage.'],
    ['The Clever Little Ant', 'Make an inference supported by the text.'],
    ['The Mystery of the Broken Clock', 'Use clues to solve a story problem.'],
    ['The New Student', 'Explain a character’s actions.'],
    ['The Secret of the Ancient Map', 'Use map clues to follow a route.']
  ] }
];

const DEFAULT_PREFS = {
  narrationLang: 'en-US', narrationRate: 0.9, narrationVolume: 0.9, voiceURI: '',
  highlightStyle: 'word', highlightColor: '#fde68a', viewMode: 'single'
};

function allSuggestions() {
  return SUGGESTED_STORIES.flatMap((group) => group.ideas.map(([title, objective]) => ({
    title, objective, group: group.group, subject: group.subject, grade: group.grade, theme: group.theme
  })));
}

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

function fileTitle(fileName) {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function coverHtml(story, size = 'card') {
  const cover = safeUrl(story.cover_url);
  return cover
    ? `<img class="story-cover story-cover-${size}" src="${esc(cover)}" alt="${esc(story.title)} cover">`
    : `<div class="story-cover story-cover-${size} story-cover-emoji">${esc(story.cover_emoji || '📖')}</div>`;
}

function voiceSelect(prefs, voices, id = 'story-voice') {
  return `<select id="${id}" data-voice><option value="">Default voice</option>${voices.map((v) =>
    `<option value="${esc(v.voiceURI)}" ${v.voiceURI === prefs.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>`;
}

function storyPages(story) {
  return Array.isArray(story?.pages) && story.pages.length ? story.pages : (story?.sections || []);
}

function pageNarration(page, prefs) {
  return String(prefs?.narrationScripts?.[page?.id] || page?.text || '');
}

function plainTextFromEditor(html) {
  const holder = document.createElement('div');
  holder.innerHTML = String(html || '');
  holder.querySelectorAll('script,style').forEach((node) => node.remove());
  return (holder.innerText || holder.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function libraryPage(ctx) {
  ctxModal = ctx.modal.bind(ctx);
  ctxToast = ctx.toast.bind(ctx);
  ctxApi = ctx.api.bind(ctx);
  ctxGo = ctx.go.bind(ctx);
  window.eduplayState = ctx.state;
  await ensureMeta(ctx);
  const [, id] = ctx.params;
  if (id) return storyDetailPage(ctx, id);
  const [stories, materials, classes] = await Promise.all([
    ctx.api('/api/stories'), ctx.api('/api/materials'), ctx.api('/api/classes')
  ]);
  const meta = ctx.state.meta;
  const suggestionItems = allSuggestions();
  const categories = meta.storyCategories?.length ? meta.storyCategories : [
    'Short Stories', 'Moral Stories', 'Fables and Folktales', 'Animal Stories', 'Adventure Stories',
    'Filipino Stories', 'English Stories', 'Science Reading', 'Historical Stories', 'Vocabulary Reading',
    'Reading Comprehension', 'Values Education', 'Science and Nature', 'Mathematics',
    'Philippine Culture and History', 'Health and Safety', 'Environmental Education', 'Adventure and Imagination'
  ];

  return {
    title: 'Story & Reading Library',
    html: `<div class="stack">
      <div class="notice notice-info"><span>📚</span><div><strong>Authorized reading material only.</strong> Upload a PDF storybook or write one page by page. Every story becomes the same interactive flip book with Read Aloud and source-grounded AI games.</div></div>
      <details class="story-suggestions">
        <summary><strong>Recommended stories to upload</strong> — ${suggestionItems.length} topic ideas across seven themes</summary>
        <div class="story-suggestions-body">
          <div class="notice"><span>⚖️</span><div><strong>Rights note:</strong> these are topic ideas for ORIGINAL, licensed or public-domain versions. Do not upload copyrighted third-party text without permission.</div></div>
          <div class="story-suggestion-grid">
            ${SUGGESTED_STORIES.map((group) => `<section class="story-suggestion-group">
              <h3>${esc(group.group)}</h3><p class="muted tiny">${esc(group.theme)} • ${esc(group.grade)}</p>
              <ul>${group.ideas.map(([title, objective]) => {
                const index = suggestionItems.findIndex((item) => item.title === title && item.group === group.group);
                return `<li><span>${esc(title)}</span><button class="btn btn-sm btn-soft" data-suggestion="${index}">Use this idea</button></li>`;
              }).join('')}</ul>
            </section>`).join('')}
          </div>
        </div>
      </details>
      <div class="section-head"><div><h2>Reading library</h2><p class="muted small">${stories.length} book${stories.length === 1 ? '' : 's'} • Filter by grade, subject, category, reading level and language</p></div>
        <button class="btn btn-primary btn-lg" id="story-add">+ Add New Story</button></div>
      <div class="filters">
        <input id="story-search" class="search" placeholder="Search titles and descriptions…" aria-label="Search stories">
        <select id="story-category"><option value="">All categories</option>${categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
        <select id="story-grade"><option value="">All grades</option>${[...new Set(stories.map((s) => s.grade_level).filter(Boolean))].map((g) => `<option>${esc(g)}</option>`).join('')}</select>
        <select id="story-subject"><option value="">All subjects</option>${[...new Set(stories.map((s) => s.subject).filter(Boolean))].map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        <select id="story-reading"><option value="">All reading levels</option>${[...new Set(stories.map((s) => s.reading_level).filter(Boolean))].map((r) => `<option>${esc(r)}</option>`).join('')}</select>
        <select id="story-language"><option value="">All languages</option><option>English</option><option>Filipino</option></select>
        <button class="btn btn-sm btn-soft" id="story-favorites">☆ Favorites</button>
        <button class="btn btn-sm btn-soft" id="story-archived">Archived</button>
      </div>
      <div id="story-grid" class="grid grid-4">${stories.map(storyCard).join('') || '<div class="empty card"><div class="big">📖</div><h3>No stories yet</h3><p>Use <strong>+ Add New Story</strong> to upload a PDF or create one manually.</p></div>'}</div>
    </div>`,
    mount(el) {
      let favoritesOnly = false;
      let archivedOnly = false;
      let archivedStories = null;
      const grid = el.querySelector('#story-grid');
      const paint = () => {
        const visibleStories = archivedOnly ? (archivedStories || []) : stories;
        const search = el.querySelector('#story-search').value.trim().toLowerCase();
        const category = el.querySelector('#story-category').value;
        const grade = el.querySelector('#story-grade').value;
        const subject = el.querySelector('#story-subject').value;
        const reading = el.querySelector('#story-reading').value;
        const language = el.querySelector('#story-language').value;
        const shown = visibleStories.filter((s) => (!search || `${s.title} ${s.description || ''}`.toLowerCase().includes(search))
          && (!category || s.category === category) && (!grade || s.grade_level === grade)
          && (!subject || s.subject === subject) && (!reading || s.reading_level === reading)
          && (!language || s.language === language) && (!favoritesOnly || s.favorite));
        grid.innerHTML = shown.map(storyCard).join('') || '<div class="empty"><div class="big">🔎</div><h3>No stories match these filters</h3></div>';
        bindRows();
      };
      const bindRows = () => {
        grid.querySelectorAll('[data-favorite]').forEach((b) => b.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const result = await ctx.api(`/api/stories/${b.dataset.favorite}/favorite`, { method: 'POST' });
            const story = [...stories, ...(archivedStories || [])].find((s) => s.id === Number(b.dataset.favorite));
            if (story) story.favorite = result.favorite;
            paint();
          } catch (error) { ctx.toast(error.message, 'error'); }
        }));
        grid.querySelectorAll('[data-story-delete]').forEach((b) => b.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!await ctx.confirmDialog('Delete this story?')) return;
          try { await ctx.api(`/api/stories/${b.dataset.storyDelete}`, { method: 'DELETE' }); ctx.toast('Story deleted.', 'success'); ctx.render(); }
          catch (error) { ctx.toast(error.message, 'error'); }
        }));
        grid.querySelectorAll('[data-story-archive]').forEach((b) => b.addEventListener('click', async (e) => {
          e.stopPropagation();
          try { await ctx.api(`/api/stories/${b.dataset.storyArchive}`, { method: 'PUT', body: { archived: true } }); ctx.toast('Story archived.', 'success'); ctx.render(); }
          catch (error) { ctx.toast(error.message, 'error'); }
        }));
        grid.querySelectorAll('[data-story-unarchive]').forEach((b) => b.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await ctx.api(`/api/stories/${b.dataset.storyUnarchive}`, { method: 'PUT', body: { archived: false } });
            ctx.toast('Story restored to your library.', 'success'); ctx.render();
          } catch (error) { ctx.toast(error.message, 'error'); }
        }));
      };
      ['#story-search', '#story-category', '#story-grade', '#story-subject', '#story-reading', '#story-language'].forEach((selector) =>
        el.querySelector(selector).addEventListener('input', paint));
      el.querySelector('#story-favorites').addEventListener('click', (e) => {
        favoritesOnly = !favoritesOnly;
        e.currentTarget.className = `btn btn-sm ${favoritesOnly ? 'btn-primary' : 'btn-soft'}`;
        paint();
      });
      el.querySelector('#story-archived').addEventListener('click', async (e) => {
        archivedOnly = !archivedOnly;
        if (archivedOnly && !archivedStories) archivedStories = await ctx.api('/api/stories?archived=1');
        e.currentTarget.className = `btn btn-sm ${archivedOnly ? 'btn-primary' : 'btn-soft'}`;
        e.currentTarget.textContent = archivedOnly ? '← Active stories' : 'Archived';
        paint();
      });
      bindRows();

      const uniqueStoryTitle = (base) => {
        const taken = new Set(stories.map((s) => String(s.title || '').toLowerCase()));
        let candidate = base;
        let suffix = 2;
        while (taken.has(candidate.toLowerCase())) candidate = `${base} (${suffix++})`;
        return candidate;
      };

      const openAddCards = async (prefill = {}) => {
        const body = await ctx.modal('Add New Story', `<div class="story-choice-cards">
          <button type="button" class="story-choice-card" data-choice="upload">
            <span class="story-choice-icon">📄</span><strong>CARD 1: Upload PDF Storybook</strong>
            <p class="muted small">Upload an existing PDF and turn it into an interactive digital storybook.</p>
            <span class="btn btn-primary">Upload PDF</span>
          </button>
          <button type="button" class="story-choice-card" data-choice="manual">
            <span class="story-choice-icon">📖</span><strong>CARD 2: Create Story Manually</strong>
            <p class="muted small">Write, design, and create your own interactive storybook.</p>
            <span class="btn btn-primary">Create Manually</span>
          </button>
        </div>`, { wide: true, persistent: true, cancelText: 'Close' });
        body.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => {
          const choice = button.dataset.choice;
          body.close();
          if (choice === 'upload') openUploadFlow(prefill, uniqueStoryTitle);
          else openManualEditor(null, prefill, uniqueStoryTitle);
        }));
      };

      el.querySelector('#story-add').addEventListener('click', () => openAddCards());
      el.querySelectorAll('[data-suggestion]').forEach((b) => b.addEventListener('click', () => {
        const suggestion = suggestionItems[Number(b.dataset.suggestion)];
        if (suggestion) openAddCards(suggestion);
      }));
      window.eduplayAddStory = () => openAddCards();
      window.eduplayMaterials = materials;
    }
  };
}

function metaFields(values = {}, categories = [], includeCover = false) {
  return `<div class="form-grid">
    <label class="field">Title <input name="title" value="${esc(values.title || '')}" required></label>
    <label class="field">Category <select name="category">${categories.map((c) => `<option ${c === values.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="field">Grade level <input name="grade_level" value="${esc(values.grade_level || values.grade || '')}" placeholder="Grade 4"></label>
    <label class="field">Subject <input name="subject" value="${esc(values.subject || '')}" placeholder="English"></label>
    <label class="field">Language <select name="language"><option ${values.language !== 'Filipino' ? 'selected' : ''}>English</option><option ${values.language === 'Filipino' ? 'selected' : ''}>Filipino</option></select></label>
    <label class="field">Reading difficulty <input name="reading_level" value="${esc(values.reading_level || '')}" placeholder="Grade 4 / Intermediate"></label>
    <label class="field full">Short description <textarea name="description" rows="2">${esc(values.description || '')}</textarea></label>
    <label class="field full">Learning objectives <textarea name="objectives" rows="2" placeholder="What should learners be able to do?">${esc(values.objectives || values.objective || '')}</textarea></label>
    ${includeCover ? `<label class="field full">Cover image <input id="story-cover-file" type="file" accept="image/*"></label>` : ''}
  </div>`;
}

function categoriesFor(ctx) {
  return ctx.state.meta?.storyCategories?.length ? ctx.state.meta.storyCategories : ['Short Stories', 'Moral Stories', 'Fables and Folktales', 'Animal Stories', 'Adventure Stories', 'Filipino Stories', 'English Stories', 'Science Reading', 'Reading Comprehension', 'Values Education'];
}

function openUploadFlow(prefill, uniqueStoryTitle) {
  return (async () => {
    const categories = categoriesFor({ state: window.eduplayState || {} });
    const values = {
      title: prefill.title || '', category: prefill.category || categories[0], grade_level: prefill.grade || '',
      subject: prefill.subject || '', language: prefill.language || 'English', description: prefill.objective || ''
    };
    const body = await ctxModal('Upload PDF Storybook', `<form id="pdf-story-form" class="stack">
      <div id="story-dropzone" class="story-dropzone"><div style="font-size:2rem">📄</div><strong>Drop a PDF here or click to choose a file</strong><p class="muted small" id="story-file-label">PDF.js renders every page; image-only pages use local OCR for narration.</p></div>
      <input id="story-pdf-file" type="file" accept="application/pdf,.pdf" hidden>
      ${metaFields(values, categories)}
      <div class="notice" id="story-upload-status"><span>⏳</span><div>Waiting for a PDF…</div></div>
    </form>`, { wide: true, persistent: true, cancelText: 'Close' });
    const form = body.querySelector('#pdf-story-form');
    const fileInput = form.querySelector('#story-pdf-file');
    const dropzone = form.querySelector('#story-dropzone');
    const status = form.querySelector('#story-upload-status');
    const submit = document.createElement('button');
    submit.type = 'submit'; submit.className = 'btn btn-primary btn-lg'; submit.textContent = 'Upload PDF';
    form.appendChild(submit);
    let selectedFile = null;
    const setStatus = (message, icon = '⏳') => { status.innerHTML = `<span>${icon}</span><div>${esc(message)}</div>`; };
    const acceptFile = (file) => {
      if (!file || (!/\.pdf$/i.test(file.name || '') && !/pdf/i.test(file.type || ''))) {
        ctxToast('Choose a PDF file.', 'error'); return;
      }
      selectedFile = file;
      const titleField = form.querySelector('[name=title]');
      if (!titleField.value.trim()) titleField.value = fileTitle(file.name);
      form.querySelector('#story-file-label').textContent = `${file.name} — ${formatBytes(file.size)}`;
      setStatus('Ready. PDF.js will render each page, then OCR will read image-only pages.', '✅');
    };
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); acceptFile(e.dataTransfer?.files?.[0]); });
    fileInput.addEventListener('change', () => acceptFile(fileInput.files?.[0]));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = selectedFile;
      if (!file) { ctxToast('Choose a PDF file first.', 'error'); return; }
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form));
        const title = String(data.title || '').trim() || fileTitle(file.name);
        const dataUrl = await fileToDataUrl(file);
        setStatus('Importing the original PDF into your library…');
        const material = await ctxApi('/api/materials', { method: 'POST', body: {
          dataUrl, fileName: file.name, mime: 'application/pdf', title: `${title} source`,
          language: data.language, grade_level: data.grade_level, subject: data.subject
        } });
        setStatus('Rendering page images with PDF.js…');
        const rendered = await buildPdfStoryPages(file, {
          language: data.language,
          maxPages: 120,
          onProgress: ({ done, total }) => setStatus(`Rendering page ${done} of ${total}…`)
        });
        setStatus('Saving rendered page images…');
        await persistPagePreviews(rendered.pages, { api: ctxApi });
        await closeOcrWorker();
        const warning = rendered.ocrFailures.length
          ? `OCR could not read ${rendered.ocrFailures.length} page${rendered.ocrFailures.length === 1 ? '' : 's'} (${rendered.ocrFailures.join(', ')}). The original page images are preserved.`
          : rendered.truncated ? 'Only the first 120 pages were rendered.' : '';
        const payload = {
          title: uniqueStoryTitle(title), story_type: 'pdf', category: data.category,
          grade_level: data.grade_level, subject: data.subject, language: data.language,
          description: data.description, reading_level: data.reading_level, objectives: data.objectives,
          source_material_id: material.id, source_file_url: material.file_url, source_file_name: file.name,
          cover_url: rendered.pages[0]?.preview_url || null,
          processing_status: warning ? 'warning' : 'ready', processing_error: warning,
          pages: rendered.pages, status: 'draft'
        };
        setStatus('Saving your flip book…');
        const story = await ctxApi('/api/stories', { method: 'POST', body: payload });
        body.close();
        ctxToast(warning ? `Saved with a processing warning. ${warning}` : 'PDF flip book ready with Read Aloud.', warning ? 'info' : 'success');
        ctxGo(`teacher/library/${story.id}`);
      } catch (error) {
        await closeOcrWorker().catch(() => {});
        ctxToast(error.message || 'The PDF could not be processed.', 'error');
        setStatus(error.message || 'The PDF could not be processed.', '⚠️');
        submit.disabled = false;
      }
    });
  })().catch((error) => ctxToast(error.message, 'error'));
}

function openManualEditor(existingStory, prefill, uniqueStoryTitle) {
  return (async () => {
    const categories = categoriesFor({ state: window.eduplayState || {} });
    const source = existingStory || {};
    const pages = existingStory && storyPages(existingStory).length
      ? storyPages(existingStory).map((page) => ({ id: page.id, title: page.title || '', html: page.html || '', text: page.text || '' }))
      : [{ title: 'Page 1', html: '', text: '' }];
    let active = 0;
    const values = {
      title: source.title || prefill.title || '', category: source.category || prefill.category || categories[0],
      grade_level: source.grade_level || prefill.grade || '', subject: source.subject || prefill.subject || '',
      language: source.language || prefill.language || 'English',
      reading_level: source.reading_level || '', description: source.description || prefill.objective || '',
      objectives: Array.isArray(source.objectives) ? source.objectives.join('\n') : (source.objectives || prefill.objective || '')
    };
    const body = await ctxModal(existingStory ? 'Edit Story Pages' : 'Create Story Manually', `<form id="manual-story-form" class="stack">
      ${metaFields(values, categories, true)}
      <div class="story-editor-layout">
        <aside class="story-editor-pages"><div class="row-between"><strong>Pages</strong><button type="button" class="btn btn-sm btn-soft" id="story-page-add">+ Add New Page</button></div><div id="story-page-list"></div></aside>
        <section class="stack">
          <div class="story-editor-tools">
            <button type="button" class="btn btn-sm btn-ghost" data-cmd="bold"><strong>B</strong></button>
            <button type="button" class="btn btn-sm btn-ghost" data-cmd="italic"><em>I</em></button>
            <button type="button" class="btn btn-sm btn-ghost" data-cmd="underline"><u>U</u></button>
            <select data-cmd="format" aria-label="Paragraph style"><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option></select>
            <select data-cmd="fontSize" aria-label="Font size"><option value="2">Small</option><option value="3" selected>Normal</option><option value="5">Large</option><option value="6">Extra large</option></select>
            <select data-cmd="fontName" aria-label="Font style"><option value="inherit">Default</option><option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Comic Sans MS">Comic Sans</option></select>
            <button type="button" class="btn btn-sm btn-ghost" data-cmd="justifyLeft">⬅ Align</button>
            <button type="button" class="btn btn-sm btn-ghost" data-cmd="justifyCenter">↔ Align</button>
            <button type="button" class="btn btn-sm btn-ghost" data-cmd="justifyRight">➡ Align</button>
            <label class="tiny">Text colour <input type="color" data-cmd="foreColor" value="#1f2937"></label>
            <label class="tiny">Spacing <select data-cmd="spacing"><option value="1">Compact</option><option value="1.6" selected>Normal</option><option value="2.2">Wide</option></select></label>
            <label class="tiny">Image <input id="story-page-image" type="file" accept="image/*"></label>
          </div>
          <div id="story-editor-canvas" class="story-editor-canvas" contenteditable="true" aria-label="Page content"></div>
        </section>
        <aside><strong>Live preview</strong><div id="story-editor-preview" class="story-editor-preview"></div></aside>
      </div>
      <div class="row wrap"><button type="button" class="btn btn-primary" id="story-save-draft">Save draft</button>
        <button type="button" class="btn btn-success" id="story-publish">Publish</button>
        <span class="muted tiny">Use <strong>Add New Page</strong> for each flip-book page. Images and formatting are saved with the story.</span></div>
    </form>`, { wide: true, persistent: true, cancelText: 'Close' });
    const form = body.querySelector('#manual-story-form');
    const canvas = form.querySelector('#story-editor-canvas');
    const preview = form.querySelector('#story-editor-preview');
    const list = form.querySelector('#story-page-list');
    const coverInput = form.querySelector('#story-cover-file');
    let coverUrl = source.cover_url || '';

    const sync = () => {
      pages[active].html = canvas.innerHTML;
      pages[active].text = plainTextFromEditor(canvas.innerHTML);
    };
    const renderList = () => {
      list.innerHTML = pages.map((page, i) => `<div class="story-editor-page ${i === active ? 'active' : ''}" data-page="${i}">
        <button type="button" class="btn btn-sm btn-ghost" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
        <input value="${esc(page.title || `Page ${i + 1}`)}" aria-label="Page title">
        <button type="button" class="btn btn-sm btn-ghost" data-move="${i}" data-dir="1" ${i === pages.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn btn-sm btn-ghost" data-remove="${i}" ${pages.length === 1 ? 'disabled' : ''}>✕</button>
      </div>`).join('');
      list.querySelectorAll('[data-page] input').forEach((input, i) => input.addEventListener('input', () => { pages[i].title = input.value; }));
      list.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => {
        sync();
        const i = Number(button.dataset.move); const j = i + Number(button.dataset.dir);
        if (j < 0 || j >= pages.length) return;
        [pages[i], pages[j]] = [pages[j], pages[i]];
        active = j; renderList(); load();
      }));
      list.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
        if (pages.length === 1) return;
        sync();
        const i = Number(button.dataset.remove);
        pages.splice(i, 1); active = Math.min(active, pages.length - 1); renderList(); load();
      }));
      list.querySelectorAll('[data-page]').forEach((row) => row.addEventListener('click', (e) => {
        if (e.target.closest('button,input')) return;
        sync(); active = Number(row.dataset.page); renderList(); load();
      }));
    };
    const paintPreview = () => {
      preview.innerHTML = canvas.innerHTML.trim() || '<p class="muted">Start writing to see the live preview.</p>';
    };
    const load = () => {
      canvas.innerHTML = pages[active]?.html || '';
      paintPreview();
    };
    renderList(); load();
    canvas.addEventListener('input', () => { sync(); paintPreview(); });
    form.querySelector('#story-page-add').addEventListener('click', () => {
      sync();
      pages.push({ title: `Page ${pages.length + 1}`, html: '', text: '' });
      active = pages.length - 1; renderList(); load(); canvas.focus();
    });
    form.querySelectorAll('[data-cmd]').forEach((control) => {
      const apply = () => {
        const cmd = control.dataset.cmd;
        canvas.focus();
        if (cmd === 'spacing') { canvas.style.lineHeight = control.value; sync(); paintPreview(); return; }
        if (cmd === 'format') document.execCommand('formatBlock', false, control.value);
        else document.execCommand(cmd, false, control.value);
        sync(); paintPreview();
      };
      control.addEventListener(control.tagName === 'SELECT' || control.type === 'color' ? 'change' : 'click', apply);
    });
    form.querySelector('#story-page-image').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
        const uploaded = await ctxApi('/api/media', { method: 'POST', body: { dataUrl, name: file.name } });
        canvas.focus();
        document.execCommand('insertHTML', false, `<img src="${uploaded.url}" alt="">`);
        sync(); paintPreview();
      } catch (error) { ctxToast(error.message, 'error'); }
    });
    coverInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
        const uploaded = await ctxApi('/api/media', { method: 'POST', body: { dataUrl, name: file.name } });
        coverUrl = uploaded.url;
        ctxToast('Cover image uploaded.', 'success');
      } catch (error) { ctxToast(error.message, 'error'); }
    });

    const save = async (status) => {
      sync();
      const data = Object.fromEntries(new FormData(form));
      const cleaned = pages.map((page, i) => ({
        id: page.id, page_number: i + 1, title: String(page.title || `Page ${i + 1}`).slice(0, 200),
        html: page.html, text: page.text, source_type: 'manual', ocr_status: 'none'
      })).filter((page) => page.text.trim() || page.html.replace(/<[^>]+>/g, '').trim());
      if (!String(data.title || '').trim()) { ctxToast('Add a story title.', 'error'); return; }
      if (!cleaned.length) { ctxToast('Add text or an image to at least one page.', 'error'); return; }
      const payload = {
        title: existingStory ? data.title : uniqueStoryTitle(data.title), story_type: 'manual',
        category: data.category, grade_level: data.grade_level, subject: data.subject,
        language: data.language, description: data.description, reading_level: data.reading_level,
        objectives: data.objectives, cover_url: coverUrl || data.cover_url || null,
        status, pages: cleaned, story_pages: cleaned.length
      };
      try {
        const story = existingStory
          ? await ctxApi(`/api/stories/${existingStory.id}`, { method: 'PUT', body: payload })
          : await ctxApi('/api/stories', { method: 'POST', body: payload });
        body.close();
        ctxToast(status === 'published' ? 'Story published to your library.' : 'Draft saved.', 'success');
        ctxGo(`teacher/library/${story.id}`);
      } catch (error) { ctxToast(error.message, 'error'); }
    };
    form.querySelector('#story-save-draft').addEventListener('click', () => save('draft'));
    form.querySelector('#story-publish').addEventListener('click', () => save('published'));
  })().catch((error) => ctxToast(error.message, 'error'));
}

function storyCard(story) {
  const count = story.sectionCount || 0;
  return `<div class="card card-hover story-card" data-nav="teacher/library/${story.id}">
    ${coverHtml(story)}
    <div class="story-card-body">
      <div class="row-between wrap"><span class="chip chip-indigo">${esc(story.category)}</span>
        <button class="icon-btn ${story.favorite ? 'story-fav' : ''}" data-favorite="${story.id}" title="Toggle favorite">${story.favorite ? '★' : '☆'}</button></div>
      <h3>${esc(story.title)}</h3>
      <p class="muted small">${esc((story.description || '').slice(0, 90))}</p>
      <div class="row wrap"><span class="chip">${esc(story.grade_level || 'No grade')}</span><span class="chip">${esc(story.language)}</span>
        ${story.reading_level ? `<span class="chip chip-sky">${esc(story.reading_level)}</span>` : ''}
        <span class="chip">${esc(story.story_type || 'text')}</span>
        <span class="chip ${story.status === 'published' ? 'chip-green' : 'chip-amber'}">${story.status === 'published' ? 'Published' : 'Draft'}</span></div>
      <div class="muted tiny">${count} page${count === 1 ? '' : 's'} • ${formatDate(story.updated_at, true)}</div>
      <div class="row wrap" style="margin-top:.6rem"><button class="btn btn-sm btn-primary" data-nav="teacher/library/${story.id}">Read & edit</button>
        ${story.archived
          ? `<button class="btn btn-sm btn-soft" data-story-unarchive="${story.id}">Restore</button>`
          : `<button class="btn btn-sm btn-ghost" data-story-archive="${story.id}">Archive</button>`}
        <button class="btn btn-sm btn-ghost" data-story-delete="${story.id}">Delete</button></div>
    </div>
  </div>`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

// Thin globals let the creation helpers use the current page context without
// threading it through every callback.
let ctxModal = null;
let ctxToast = null;
let ctxApi = null;
let ctxGo = null;

async function storyDetailPage(ctx, id) {
  const [story, classes, preferences] = await Promise.all([
    ctx.api(`/api/stories/${id}`), ctx.api('/api/classes'), ctx.api('/api/preferences')
  ]);
  ctxModal = ctx.modal.bind(ctx);
  ctxToast = ctx.toast.bind(ctx);
  ctxApi = ctx.api.bind(ctx);
  ctxGo = ctx.go.bind(ctx);
  window.eduplayState = ctx.state;
  const prefs = { ...DEFAULT_PREFS, ...(story.preferences || {}), ...preferences };
  const pages = storyPages(story);
  const speech = readingSpeech;
  let index = 0;
  let viewMode = initialFlipMode();
  let playingAll = false;
  let generation = 0;
  let voices = [];

  const page = () => pages[index];
  const setStatus = (message) => { const el = document.querySelector('#story-status'); if (el) el.textContent = message; };
  const clearHighlights = () => document.querySelectorAll('[data-active-class]').forEach((el) => el.classList.remove(el.dataset.activeClass || 'story-active'));
  const highlightAt = (charIndex) => {
    const root = document.querySelector('[data-story-highlight]');
    if (!root) return;
    clearHighlights();
    const node = [...root.querySelectorAll('[data-start]')].find((el) => Number(el.dataset.start) <= charIndex && charIndex < Number(el.dataset.end));
    if (node) { node.classList.add(node.dataset.activeClass || 'story-active'); node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  };
  const speakCurrent = (onEnd) => {
    const text = pageNarration(page(), prefs).trim();
    if (!text) { if (onEnd) onEnd(); return false; }
    const token = generation;
    return speech.speak({
      text, lang: prefs.narrationLang, rate: Number(prefs.narrationRate), volume: Number(prefs.narrationVolume), voiceURI: prefs.voiceURI,
      onBoundary: (event) => { if (token === generation && !prefs.narrationScripts?.[page()?.id]) highlightAt(event.charIndex); },
      onEnd: () => { clearHighlights(); if (token === generation && onEnd) onEnd(); },
      onError: () => { clearHighlights(); if (token === generation && onEnd) onEnd(); }
    });
  };
  const stopSpeech = () => { generation += 1; playingAll = false; speech.stop(); clearHighlights(); setStatus('Narration stopped.'); };

  const renderPage = (p, pageIndex) => {
    const text = pageNarration(p, prefs);
    const highlighted = highlightHtml(text, prefs.highlightStyle, 'story-word', 'story-active');
    const sourceImage = p?.preview_url
      ? `<img class="flipbook-page-image" src="${esc(p.preview_url)}" alt="Story page ${pageIndex + 1}">`
      : '';
    const rich = p?.html ? `<div class="story-rich-html">${p.html}</div>` : '';
    const transcript = highlighted
      ? `<div class="story-text story-narration-text" data-story-highlight style="--story-highlight:${esc(prefs.highlightColor)}">${highlighted}</div>`
      : '';
    const heading = !p?.html ? `<h3 class="story-section-title">${esc(p?.title || `Page ${pageIndex + 1}`)}</h3>` : '';
    const warning = p?.ocr_status === 'failed'
      ? `<div class="notice"><span>⚠️</span><div><strong>OCR warning:</strong> ${esc(p.ocr_error || 'No narration text was found; the original page image is shown.')}</div></div>` : '';
    const body = sourceImage || rich || heading;
    return `${body}${transcript}${warning}` || '<span class="story-muted">This page is empty. Open the page editor to add story content.</span>';
  };

  const paintSection = ({ animate = false, root = document } = {}) => {
    const body = document.querySelector('#story-body');
    if (!body) return;
    const apply = () => {
      body.innerHTML = flipbookHtml({ prefix: 'story', title: story.title, pages, index, viewMode, renderPage });
      applyStoredZoom(body);
      const script = document.querySelector('#story-script');
      if (script) {
        script.value = prefs.narrationScripts?.[page()?.id] || '';
        script.placeholder = page()?.text || 'Write a narration script for this page…';
        const label = document.querySelector('#story-script-title');
        if (label) label.textContent = page()?.title || `Page ${index + 1}`;
      }
      const counter = document.querySelector('#story-counter');
      if (counter) counter.textContent = pages.length ? `Page ${index + 1} of ${pages.length}` : 'No pages';
      const prev = document.querySelector('#story-prev');
      const next = document.querySelector('#story-next');
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= pages.length - 1;
      document.querySelectorAll('[data-section-index]').forEach((b) => b.classList.toggle('active', Number(b.dataset.sectionIndex) === index));
    };
    if (animate) turnFlipbook(root, 'next', apply);
    else apply();
  };
  const goTo = (next, root = document, animate = true) => {
    if (!pages.length) return;
    const target = Math.min(pages.length - 1, Math.max(0, next));
    if (target === index) return;
    const commit = () => { index = target; stopSpeech(); paintSection({ root }); };
    if (animate) turnFlipbook(root, target > index ? 'next' : 'prev', commit);
    else commit();
  };

  const warning = story.processing_status === 'warning' || story.processing_error
    ? `<div class="notice"><span>⚠️</span><div><strong>Processing notice:</strong> ${esc(story.processing_error || 'Some pages may have limited narration.')} The page images are still available.</div></div>` : '';
  const sourceUrl = safeUrl(story.sourceMaterial?.file_url || story.source_file_url || '');

  return {
    title: story.title,
    html: `<div class="stack">
      <div class="row-between wrap"><div><button class="btn btn-sm btn-ghost" data-nav="teacher/library">← Reading Library</button>
        <h2 style="margin:.5rem 0 .2rem">${esc(story.title)}</h2>
        <div class="row wrap"><span class="chip chip-indigo">${esc(story.category)}</span><span class="chip">${esc(story.grade_level || 'No grade')}</span>
          <span class="chip">${esc(story.language)}</span><span class="chip">${esc(story.story_type || 'text')}</span>
          <span class="chip ${story.status === 'published' ? 'chip-green' : 'chip-amber'}">${story.status === 'published' ? 'Published' : 'Draft'}</span></div></div>
        <div class="row wrap">
          <button class="btn btn-sm btn-soft" id="story-fav">${story.favorite ? '★ Favorited' : '☆ Favorite'}</button>
          <button class="btn btn-sm btn-soft" id="story-meta">Edit details</button>
          <button class="btn btn-sm btn-soft" id="story-pages-edit">✏️ Edit pages</button>
          <button class="btn btn-sm btn-soft" id="story-prefs">Narration</button>
          <button class="btn btn-sm btn-soft" id="story-assign">Assign</button>
          ${pages.length ? `<button class="btn btn-sm btn-primary" id="story-present">▶ Present Story</button>` : ''}
          ${sourceUrl ? `<a class="btn btn-sm btn-ghost" href="${esc(sourceUrl)}" target="_blank" rel="noopener">Open source file</a>` : ''}
          <button class="btn btn-sm btn-ghost" id="story-archive">Archive</button>
          <button class="btn btn-sm btn-primary" id="story-games">Generate games</button>
        </div></div>
      ${warning}
      <div class="notice notice-info"><span>📖</span><div><strong>Shared flip book.</strong> Use the toolbar for previous/next, page counter, zoom, single/double pages, fullscreen and optional page-turn sound. Click a corner, drag the page, or press ← → to turn.</div></div>
      <div class="story-reader-layout">
        <aside class="story-sections"><div class="section-head"><h3>Pages</h3><span class="chip">${pages.length}</span></div>
          ${pages.map((p, i) => `<button class="story-section-btn ${i === 0 ? 'active' : ''}" data-section-index="${i}"><span>${i + 1}.</span> ${esc(p.title || `Page ${i + 1}`)}</button>`).join('') || '<p class="muted small">No pages yet.</p>'}
          <button class="btn btn-sm btn-soft btn-block" id="story-add-section">+ Add page</button>
        </aside>
        <section class="card story-reading-card">
          <div class="row-between"><strong id="story-counter">Page ${pages.length ? 1 : 0} of ${pages.length}</strong>
            <div class="row"><button class="btn btn-sm btn-ghost" id="story-prev">← Previous</button><button class="btn btn-sm btn-ghost" id="story-next">Next →</button></div></div>
          <div id="story-body" class="story-body">${flipbookHtml({ prefix: 'story', title: story.title, pages, index: 0, viewMode, renderPage })}</div>
          <div class="story-script-field"><label class="field">Narration script — <span id="story-script-title">${esc(page()?.title || 'Page 1')}</span>
            <textarea id="story-script" rows="3" placeholder="${esc(page()?.text || 'Write a narration script for this page…')}">${esc(prefs.narrationScripts?.[page()?.id] || '')}</textarea></label>
            <button class="btn btn-sm btn-soft" id="story-save-script">Save script</button></div>
          <div class="story-controls">
            <button class="btn btn-sm btn-primary" id="story-play">▶ Read page</button>
            <button class="btn btn-sm btn-soft" id="story-read-all">📖 Read whole story</button>
            <button class="btn btn-sm btn-ghost" id="story-page-prev">‹ Prev page</button>
            <button class="btn btn-sm btn-ghost" id="story-page-next">Next page ›</button>
            <button class="btn btn-sm btn-ghost" id="story-pause">⏸ Pause</button>
            <button class="btn btn-sm btn-ghost" id="story-resume">▶ Resume</button>
            <button class="btn btn-sm btn-ghost" id="story-stop">⏹ Stop</button>
            <button class="btn btn-sm btn-ghost" id="story-replay">↺ Replay</button>
            <label>Language <select id="story-lang"><option value="en-US" ${prefs.narrationLang === 'en-US' ? 'selected' : ''}>English</option><option value="fil-PH" ${prefs.narrationLang === 'fil-PH' ? 'selected' : ''}>Filipino</option></select></label>
            <label>Voice ${voiceSelect(prefs, [])}</label>
            <label>Speed <input id="story-rate" type="range" min="0.5" max="1.5" step="0.1" value="${prefs.narrationRate}"></label>
            <label>Volume <input id="story-volume" type="range" min="0" max="1" step="0.1" value="${prefs.narrationVolume}"></label>
            <span id="story-status" class="muted tiny">Highlighting follows speech boundaries when available.</span>
          </div>
        </section>
      </div>
      <div class="grid grid-2">
        <div class="card card-pad"><div class="section-head"><h3>Vocabulary</h3><button class="btn btn-sm btn-soft" id="story-vocab-edit">Manage</button></div>
          ${(story.vocabulary || []).length ? `<div class="story-vocab-list">${story.vocabulary.map((v) => `<div class="story-vocab"><strong>${esc(v.term)}</strong><p>${esc(v.definition || 'No definition supplied.')}</p>${v.source_quote ? `<small>${esc(v.source_quote)}</small>` : ''}</div>`).join('')}</div>` : '<p class="muted small">No vocabulary items yet.</p>'}</div>
        <div class="card card-pad"><div class="section-head"><h3>Comprehension</h3><button class="btn btn-sm btn-soft" id="story-comprehension-edit">Manage</button></div>
          ${(story.comprehension || []).length ? `<div class="stack">${story.comprehension.map((q, i) => `<div class="story-question" data-q="${i}">
            <strong>${i + 1}. ${esc(q.prompt)}</strong><div class="row wrap" style="margin-top:.4rem">${(q.choices || []).map((c) => `<button class="btn btn-sm btn-ghost story-choice" data-choice="${esc(c.text)}">${esc(c.text)}</button>`).join('')}</div>
            <div class="story-feedback muted small"></div></div>`).join('')}</div>` : '<p class="muted small">No comprehension questions yet.</p>'}</div>
      </div>
      <div class="card card-pad"><div class="section-head"><h3>AI review & Teacher’s Guide</h3><button class="btn btn-sm btn-soft" id="story-analyze">Analyze source</button></div>
        <div id="story-analysis">${analysisHtml(story.analysis)}</div></div>
    </div>`,
    mount(el) {
      voices = speech.voices(prefs.narrationLang);
      const voiceNode = el.querySelector('[data-voice]');
      if (voiceNode) voiceNode.innerHTML = voiceSelect(prefs, voices, 'story-voice').replace(/^<select[^>]*>|<\/select>$/g, '');
      paintSection();
      bindFlipbook(el, 'story', (delta) => goTo(index + delta, el), {
        onModeChange: (mode) => { viewMode = mode; prefs.viewMode = mode; paintSection(); }
      });
      el.querySelectorAll('[data-section-index]').forEach((b) => b.addEventListener('click', () => goTo(Number(b.dataset.sectionIndex), el)));
      el.querySelector('#story-prev').addEventListener('click', () => goTo(index - 1, el));
      el.querySelector('#story-next').addEventListener('click', () => goTo(index + 1, el));
      el.querySelector('#story-page-prev').addEventListener('click', () => goTo(index - 1, el));
      el.querySelector('#story-page-next').addEventListener('click', () => goTo(index + 1, el));
      el.querySelector('#story-play').addEventListener('click', () => { stopSpeech(); setStatus(speakCurrent() ? 'Reading this page…' : 'No narration text on this page.'); });
      el.querySelector('#story-read-all').addEventListener('click', () => {
        stopSpeech(); playingAll = true; const token = generation;
        const readNext = () => {
          if (!playingAll || token !== generation) return;
          if (index >= pages.length - 1) { playingAll = false; setStatus('Finished reading the story.'); return; }
          const commit = () => { index += 1; paintSection(); };
          turnFlipbook(el, 'next', commit);
          if (!speakCurrent(readNext)) readNext();
        };
        setStatus('Reading the whole story…');
        if (!speakCurrent(readNext)) readNext();
      });
      el.querySelector('#story-pause').addEventListener('click', () => { speech.pause(); setStatus('Paused.'); });
      el.querySelector('#story-resume').addEventListener('click', () => { speech.resume(); setStatus('Resumed.'); });
      el.querySelector('#story-stop').addEventListener('click', stopSpeech);
      el.querySelector('#story-replay').addEventListener('click', () => { stopSpeech(); setStatus(speakCurrent() ? 'Replaying page…' : 'Nothing to replay.'); });
      el.querySelector('#story-save-script').addEventListener('click', async () => {
        const p = page();
        if (!p) return ctx.toast('There is no page to save yet.', 'info');
        const button = el.querySelector('#story-save-script');
        button.disabled = true;
        const narrationScripts = { ...(prefs.narrationScripts || {}), [p.id]: el.querySelector('#story-script').value };
        try {
          await ctx.api(`/api/stories/${story.id}`, { method: 'PUT', body: { preferences: { narrationScripts } } });
          prefs.narrationScripts = narrationScripts;
          ctx.toast('Narration script saved for this page.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
        finally { button.disabled = false; }
      });
      const persist = async () => {
        const patch = {
          narrationLang: el.querySelector('#story-lang').value,
          narrationRate: Number(el.querySelector('#story-rate').value),
          narrationVolume: Number(el.querySelector('#story-volume').value),
          voiceURI: el.querySelector('[data-voice]').value,
          viewMode
        };
        Object.assign(prefs, patch);
        try { await ctx.api('/api/preferences', { method: 'PUT', body: patch }); await ctx.api(`/api/stories/${story.id}`, { method: 'PUT', body: { preferences: patch } }); }
        catch (error) { ctx.toast(error.message, 'error'); }
      };
      el.querySelector('#story-lang').addEventListener('change', async () => { await persist(); voices = speech.voices(prefs.narrationLang); });
      el.querySelector('[data-voice]').addEventListener('change', persist);
      el.querySelector('#story-rate').addEventListener('change', persist);
      el.querySelector('#story-volume').addEventListener('change', persist);

      el.querySelector('#story-fav').addEventListener('click', async () => {
        try { const r = await ctx.api(`/api/stories/${story.id}/favorite`, { method: 'POST' }); story.favorite = r.favorite; el.querySelector('#story-fav').textContent = r.favorite ? '★ Favorited' : '☆ Favorite'; }
        catch (error) { ctx.toast(error.message, 'error'); }
      });
      el.querySelector('#story-archive').addEventListener('click', async () => {
        try { await ctx.api(`/api/stories/${story.id}`, { method: 'PUT', body: { archived: true } }); ctx.toast('Story archived.', 'success'); ctx.go('teacher/library'); }
        catch (error) { ctx.toast(error.message, 'error'); }
      });
      el.querySelector('#story-add-section').addEventListener('click', () => openManualEditor(story));
      el.querySelector('#story-pages-edit').addEventListener('click', () => openManualEditor(story));

      el.querySelector('#story-meta').addEventListener('click', async () => {
        const body = await ctx.modal('Edit story details', `<form class="stack">
          <label class="field">Title <input name="title" value="${esc(story.title)}" required></label>
          <div class="form-grid">
            <label class="field">Category <select name="category">${(ctx.state.meta.storyCategories || []).map((c) => `<option ${story.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="field">Language <select name="language"><option ${story.language === 'English' ? 'selected' : ''}>English</option><option ${story.language === 'Filipino' ? 'selected' : ''}>Filipino</option></select></label>
            <label class="field">Grade <input name="grade_level" value="${esc(story.grade_level || '')}"></label>
            <label class="field">Subject <input name="subject" value="${esc(story.subject || '')}"></label>
            <label class="field">Topic <input name="topic" value="${esc(story.topic || '')}"></label>
            <label class="field">Reading level <input name="reading_level" value="${esc(story.reading_level || '')}"></label>
            <label class="field">Quarter <input name="quarter" value="${esc(story.quarter || '')}"></label>
          </div>
          <label class="field">Description <textarea name="description" rows="3">${esc(story.description || '')}</textarea></label>
          <label class="field">Cover image URL (optional) <input name="cover_url" value="${esc(story.cover_url || '')}"></label>
          <label class="field checkbox"><input type="checkbox" name="published" ${story.status === 'published' ? 'checked' : ''}> Published (shareable with students)</label>
        </form>`);
        if (!body) return;
        const form = body.querySelector('form');
        const values = Object.fromEntries(new FormData(form));
        try {
          const updated = await ctx.api(`/api/stories/${story.id}`, { method: 'PUT', body: { ...values, status: form.querySelector('[name=published]').checked ? 'published' : 'draft' } });
          Object.assign(story, updated); ctx.toast('Story details saved.', 'success'); ctx.render();
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#story-prefs').addEventListener('click', async () => {
        const body = await ctx.modal('Narration preferences', `<form class="form-grid">
          <label class="field">Language <select name="narrationLang"><option value="en-US" ${prefs.narrationLang === 'en-US' ? 'selected' : ''}>English</option><option value="fil-PH" ${prefs.narrationLang === 'fil-PH' ? 'selected' : ''}>Filipino</option></select></label>
          <label class="field">Voice ${voiceSelect(prefs, voices, 'pref-voice')}</label>
          <label class="field">Speed <input name="narrationRate" type="range" min="0.5" max="1.5" step="0.1" value="${prefs.narrationRate}"></label>
          <label class="field">Volume <input name="narrationVolume" type="range" min="0" max="1" step="0.1" value="${prefs.narrationVolume}"></label>
          <label class="field">Highlight colour <input name="highlightColor" type="color" value="${esc(prefs.highlightColor)}"></label>
        </form>`);
        if (!body) return;
        const form = body.querySelector('form');
        const patch = Object.fromEntries(new FormData(form));
        patch.narrationRate = Number(patch.narrationRate); patch.narrationVolume = Number(patch.narrationVolume);
        patch.voiceURI = form.querySelector('[data-voice]').value;
        delete patch.voice;
        Object.assign(prefs, patch);
        try {
          await ctx.api('/api/preferences', { method: 'PUT', body: patch });
          await ctx.api(`/api/stories/${story.id}`, { method: 'PUT', body: { preferences: patch } });
          paintSection(); ctx.toast('Preferences saved.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#story-vocab-edit').addEventListener('click', async () => {
        const rows = (story.vocabulary || []).map((v, i) => `<div class="story-edit-row" data-vrow="${i}"><input name="term" value="${esc(v.term)}" placeholder="Term"><input name="definition" value="${esc(v.definition || '')}" placeholder="Definition"><button type="button" class="btn btn-sm btn-ghost" data-remove-v>✕</button></div>`).join('');
        const body = await ctx.modal('Manage vocabulary', `<form class="stack"><div id="story-vrows">${rows}</div>
          <button type="button" class="btn btn-sm btn-soft" id="story-add-vrow">+ Add term</button>
          <div class="hint">Definitions from source text are safe to edit. Teacher-written definitions should still match the source.</div></form>`);
        if (!body) return;
        const wrap = body.querySelector('#story-vrows');
        body.querySelector('#story-add-vrow').addEventListener('click', () => wrap.insertAdjacentHTML('beforeend', '<div class="story-edit-row"><input name="term" placeholder="Term"><input name="definition" placeholder="Definition"><button type="button" class="btn btn-sm btn-ghost" data-remove-v>✕</button></div>'));
        wrap.addEventListener('click', (e) => { if (e.target.hasAttribute('data-remove-v')) e.target.closest('.story-edit-row').remove(); });
        const vocabulary = [...wrap.querySelectorAll('.story-edit-row')].map((row, i) => ({ term: row.querySelector('[name=term]').value, definition: row.querySelector('[name=definition]').value, sort_order: i })).filter((v) => v.term.trim());
        try { await ctx.api(`/api/stories/${story.id}`, { method: 'PUT', body: { vocabulary } }); ctx.toast('Vocabulary saved.', 'success'); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#story-comprehension-edit').addEventListener('click', async () => {
        const rows = (story.comprehension || []).map((q) => comprehensionRow(q)).join('');
        const body = await ctx.modal('Manage comprehension questions', `<form class="stack"><div id="story-qrows">${rows}</div>
          <button type="button" class="btn btn-sm btn-soft" id="story-add-qrow">+ Add question</button>
          <div class="hint">Separate choices with a newline. Put the correct answer in the “answer” field exactly as it appears in a choice.</div></form>`);
        if (!body) return;
        const wrap = body.querySelector('#story-qrows');
        body.querySelector('#story-add-qrow').addEventListener('click', () => wrap.insertAdjacentHTML('beforeend', comprehensionRow({})));
        wrap.addEventListener('click', (e) => { if (e.target.hasAttribute('data-remove-q')) e.target.closest('.story-q-row').remove(); });
        const comprehension = [...wrap.querySelectorAll('.story-q-row')].map((row, i) => {
          const prompt = row.querySelector('[name=prompt]').value.trim();
          const answer = row.querySelector('[name=answer]').value.trim();
          const choices = row.querySelector('[name=choices]').value.split('\n').map((text) => text.trim()).filter(Boolean)
            .map((text) => ({ text, is_correct: text === answer }));
          return { prompt, answer, choices, explanation: row.querySelector('[name=explanation]').value, sort_order: i };
        }).filter((q) => q.prompt);
        try { await ctx.api(`/api/stories/${story.id}`, { method: 'PUT', body: { comprehension } }); ctx.toast('Comprehension questions saved.', 'success'); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelectorAll('.story-question').forEach((q) => {
        q.querySelectorAll('[data-choice]').forEach((btn) => btn.addEventListener('click', () => {
          const item = story.comprehension[Number(q.dataset.q)];
          const correct = btn.dataset.choice === item.answer;
          q.querySelectorAll('[data-choice]').forEach((b) => b.classList.toggle('story-correct', b.dataset.choice === item.answer));
          q.querySelector('.story-feedback').innerHTML = `${correct ? '✅ Correct.' : '❌ Try the highlighted answer.'} ${esc(item.explanation || '')}`;
        }));
      });

      el.querySelector('#story-assign').addEventListener('click', async () => {
        const body = await ctx.modal('Assign story to classes', `<form class="stack">
          ${classes.map((c) => `<label class="field checkbox"><input type="checkbox" name="class_id" value="${c.id}" ${(story.assignments || []).some((a) => a.class_id === c.id) ? 'checked' : ''}> ${esc(c.name)} — ${esc(c.grade_level)}</label>`).join('') || '<p class="muted">Create a class first.</p>'}
          <label class="field">Instructions <textarea name="instructions" rows="2">${esc(story.assignments?.[0]?.instructions || '')}</textarea></label></form>`);
        if (!body) return;
        const form = body.querySelector('form');
        const class_ids = [...form.querySelectorAll('[name=class_id]:checked')].map((i) => Number(i.value));
        try { await ctx.api(`/api/stories/${story.id}/assign`, { method: 'POST', body: { class_ids, instructions: form.querySelector('[name=instructions]').value } }); ctx.toast('Story assigned and published.', 'success'); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      });

      el.querySelector('#story-analyze').addEventListener('click', async () => {
        const btn = el.querySelector('#story-analyze'); btn.disabled = true; btn.textContent = 'Analyzing…';
        try {
          const analysis = await ctx.api(`/api/stories/${story.id}/analyze`, { method: 'POST' });
          story.analysis = analysis; el.querySelector('#story-analysis').innerHTML = analysisHtml(analysis); ctx.toast('Analysis saved.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
        finally { btn.disabled = false; btn.textContent = 'Analyze source'; }
      });

      el.querySelector('#story-present')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true; button.textContent = 'Starting…';
        try {
          const session = await ctx.api(`/api/stories/${story.id}/presentations`, { method: 'POST', body: {} });
          ctx.toast(`Story Presenter View started. Students join with code ${session.code}.`, 'success');
          ctx.go(`teacher/story-presenting/${session.code}`);
        } catch (error) {
          ctx.toast(error.message, 'error');
          button.disabled = false; button.textContent = '▶ Present Story';
        }
      });

      el.querySelector('#story-games').addEventListener('click', async () => {
        const body = await ctx.modal('Generate games from this story', `<form class="stack"><div class="grid grid-2">
          ${['multiple_choice', 'matching', 'fill_blank', 'wordsearch', 'sequencing', 'true_false'].map((type) => {
            const game = (ctx.state.meta.gameTypes || []).find((g) => g.type === type);
            return `<label class="field checkbox"><input type="checkbox" name="format" value="${type}" checked> ${esc(game?.icon || '🎮')} ${esc(game?.title || type)}</label>`;
          }).join('')}</div><div class="hint">All questions are grounded in the saved page text (typed text or OCR), and saved as editable drafts.</div></form>`);
        if (!body) return;
        const formats = [...body.querySelectorAll('[name=format]:checked')].map((i) => i.value);
        try {
          const result = await ctx.api(`/api/stories/${story.id}/games`, { method: 'POST', body: { formats } });
          ctx.toast(`${result.gameIds.length} game draft(s) created.`, 'success'); ctx.go('teacher/games');
        } catch (error) { ctx.toast(error.message, 'error'); }
      });
      window.addEventListener('pagehide', stopSpeech, { once: true });
    }
  };
}

function comprehensionRow(q = {}) {
  return `<div class="story-q-row"><label class="field">Prompt <input name="prompt" value="${esc(q.prompt || '')}"></label>
    <label class="field">Choices (one per line) <textarea name="choices" rows="3">${esc((q.choices || []).map((c) => c.text || c).join('\n'))}</textarea></label>
    <div class="form-grid"><label class="field">Correct answer <input name="answer" value="${esc(q.answer || '')}"></label>
      <label class="field">Explanation <input name="explanation" value="${esc(q.explanation || '')}"></label></div>
    <button type="button" class="btn btn-sm btn-ghost" data-remove-q>Remove question</button></div>`;
}

function analysisHtml(analysis = {}) {
  if (!analysis || !Object.keys(analysis).length) return '<p class="muted small">No analysis saved yet. Analyze the story to review source-grounded objectives, vocabulary and review flags.</p>';
  return `<div class="stack"><div><strong>Topic:</strong> ${esc(analysis.topic || 'Unclear')} <span class="chip">${esc(analysis.suggestedGrade || '')}</span> <span class="chip">${esc(analysis.suggestedSubject || '')}</span></div>
    <div><strong>Objectives</strong><ul>${(analysis.objectives || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>
    <div><strong>Review flags</strong>${(analysis.flags || []).map((f) => `<div class="notice"><span>⚠️</span><div>${esc(f)}</div></div>`).join('') || '<p class="muted small">No flags.</p>'}</div>
    ${teacherGuideHtml(analysis.teacherGuide)}</div>`;
}

export default libraryPage;
