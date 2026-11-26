import { esc } from '../ui.js';

const CATEGORIES = {
  math: { label: 'Number Grove', icon: 'math', color: '#2563eb', blurb: 'Count, compare, add and subtract.' },
  reading: { label: 'Story Cove', icon: 'book', color: '#8b5cf6', blurb: 'Read words, phonics and sentences.' },
  words: { label: 'Word Garden', icon: 'abc', color: '#f472b6', blurb: 'Spell, sort and find words.' },
  logic: { label: 'Puzzle Peak', icon: 'puzzle', color: '#34d399', blurb: 'Sequences, patterns and memory.' },
  matching: { label: 'Pair Meadow', icon: 'cards', color: '#fb923c', blurb: 'Match pictures, words and numbers.' },
  spin: { label: 'Spin Island', icon: 'wheel', color: '#f59e0b', blurb: 'Spin the wheel and answer.' },
  search: { label: 'Search Springs', icon: 'search', color: '#0ea5e9', blurb: 'Find hidden words and objects.' },
  treasure: { label: 'Treasure Trail', icon: 'star', color: '#a855f7', blurb: 'Collect clues and reach the prize.' }
};

const TYPE_CATEGORY = {
  math: 'math', counting: 'math', addition: 'math', subtraction: 'math', multiplication: 'math',
  division: 'math', fractions: 'math', geometry: 'math', number_recognition: 'math', compare: 'math',
  reading: 'reading', phonics: 'reading', letter_recognition: 'reading', sentence_completion: 'reading',
  fill_blank: 'reading', scramble: 'words', spelling: 'words', wordsearch: 'search',
  matching: 'matching', memory: 'logic', sequencing: 'logic', sorting: 'logic', puzzle: 'logic',
  spin_wheel: 'spin', true_false: 'logic', multiple_choice: 'logic', bingo: 'words',
  crossword: 'words', listening: 'reading', pronunciation: 'reading', random_question: 'logic',
  escape_room: 'logic', treasure_hunt: 'treasure', picture: 'matching', drag_drop: 'math'
};

function categoryFor(gameType) {
  return TYPE_CATEGORY[String(gameType || '')] || 'logic';
}

function icon(kind, size = 32) {
  const s = `width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"`;
  const shapes = {
    math: '<rect x="4" y="5" width="24" height="22" rx="6" fill="#BFDBFE"/><path d="M10 12h12M10 20h5M19 16v8M15 20h8" stroke="#1E3A8A" stroke-width="3" stroke-linecap="round"/>',
    book: '<path d="M5 7c5-2 9-1 11 2 2-3 6-4 11-2v17c-5-2-9-1-11 2-2-3-6-4-11-2V7Z" fill="#DDD6FE" stroke="#5B21B6" stroke-width="2"/><path d="M16 9v17" stroke="#5B21B6" stroke-width="2"/>',
    abc: '<rect x="3" y="7" width="26" height="18" rx="6" fill="#FBCFE8"/><path d="M8 19l3-7 3 7M9.5 17h3M19 12h5M19 16h5M19 20h3" stroke="#831843" stroke-width="2.4" stroke-linecap="round"/>',
    puzzle: '<path d="M7 7h7v3a2 2 0 1 0 4 0V7h7v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H7v-7h3a2 2 0 1 0 0-4H7V7Z" fill="#A7F3D0" stroke="#065F46" stroke-width="2"/>',
    cards: '<rect x="4" y="9" width="13" height="16" rx="4" fill="#FED7AA" stroke="#9A3412" stroke-width="2"/><rect x="15" y="6" width="13" height="16" rx="4" fill="#FFEDD5" stroke="#9A3412" stroke-width="2"/><path d="m11 14 1.5 3 3.5.5-2.5 2.5.6 3.5L11 22l-3.1 1.5.6-3.5L6 17.5l3.5-.5L11 14Z" fill="#EA580C"/>',
    wheel: '<circle cx="16" cy="16" r="11" fill="#FEF08A" stroke="#854D0E" stroke-width="2"/><path d="M16 16 24 8M16 16 8 8M16 16l8 8M16 16l-8 8M16 5v22M5 16h22" stroke="#CA8A04" stroke-width="1.5"/><circle cx="16" cy="16" r="3" fill="#F59E0B"/>',
    search: '<circle cx="14" cy="14" r="8" fill="#E0F2FE" stroke="#075985" stroke-width="2.5"/><path d="m20 20 7 7" stroke="#075985" stroke-width="3" stroke-linecap="round"/>',
    star: '<path d="m16 4 3.4 7 7.6 1.1-5.5 5.4 1.3 7.6L16 21.6 9.2 25l1.3-7.5L5 12.1 12.6 11 16 4Z" fill="#FDE68A" stroke="#92400E" stroke-width="2" stroke-linejoin="round"/>'
  };
  return `<svg ${s}>${shapes[kind] || shapes.star}</svg>`;
}

function friendSvg(kind, unlocked, size = 62) {
  const faces = {
    nova: '<circle cx="32" cy="32" r="24" fill="#FDE68A" stroke="#B45309" stroke-width="3"/><path d="m32 15 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" fill="#F59E0B"/><circle cx="25" cy="35" r="2" fill="#78350F"/><circle cx="39" cy="35" r="2" fill="#78350F"/>',
    bubble: '<circle cx="32" cy="32" r="24" fill="#BAE6FD" stroke="#0369A1" stroke-width="3"/><circle cx="25" cy="30" r="3" fill="#0F172A"/><circle cx="39" cy="30" r="3" fill="#0F172A"/><path d="M24 40q8 6 16 0" stroke="#0369A1" stroke-width="3" fill="none" stroke-linecap="round"/>',
    dot: '<circle cx="32" cy="32" r="24" fill="#FECACA" stroke="#B91C1C" stroke-width="3"/><path d="M32 12v40M18 22l28 20M46 22 18 42" stroke="#7F1D1D" stroke-width="2"/><circle cx="25" cy="28" r="2" fill="#7F1D1D"/><circle cx="39" cy="28" r="2" fill="#7F1D1D"/>',
    pixel: '<rect x="10" y="14" width="44" height="38" rx="12" fill="#DDD6FE" stroke="#5B21B6" stroke-width="3"/><rect x="20" y="26" width="8" height="8" rx="2" fill="#5B21B6"/><rect x="36" y="26" width="8" height="8" rx="2" fill="#5B21B6"/><path d="M24 41h16" stroke="#5B21B6" stroke-width="3" stroke-linecap="round"/>'
  };
  return `<div class="gw-badge ${unlocked ? '' : 'locked'}" style="width:${size}px;height:${size}px;background:#fff" aria-label="${unlocked ? 'Unlocked friend' : 'Locked friend'}"><svg width="${size - 10}" height="${size - 10}" viewBox="0 0 64 64" aria-hidden="true">${faces[kind]}</svg></div>`;
}

function mascot(className = '') {
  return `<div class="gw-mascot gw-float ${className}"><img src="/assets/gameworld/mascot.svg" alt="" width="230"></div>`;
}

function topbar(state, role = 'student') {
  return `<div class="gw-top">
    <div class="gw-brand"><span class="gw-brand-mark">🎮</span><span>EduPlay World<small>Learning adventure</small></span></div>
    <span class="grow"></span>
    <span class="gw-pill gw-star-pill">★ <span id="gw-star-count">${state.stars || 0}</span></span>
    <span class="gw-pill gw-coin-pill">● <span id="gw-coin-count">${state.coins || 0}</span></span>
    <button class="gw-icon-btn" id="gw-music" aria-label="Toggle music" aria-pressed="false">🎵</button>
    <button class="gw-icon-btn" data-nav="${role === 'teacher' ? 'teacher' : 'student'}" aria-label="Back">←</button>
  </div>`;
}

function assignmentsFor(assignments) {
  return (Array.isArray(assignments) ? assignments : []).filter((a) => a.game_id || a.game);
}

async function startAssignment(ctx, assignmentId) {
  const created = await ctx.api('/api/attempts', { method: 'POST', body: { assignment_id: Number(assignmentId) } });
  const id = created?.attempt?.id || created?.id;
  if (!id) throw new Error('Could not start that activity.');
  ctx.go(`student/play/${id}`);
}

function bindStartButtons(el, ctx) {
  el.querySelectorAll('[data-start-assignment]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await startAssignment(ctx, button.dataset.startAssignment); }
      catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; }
    });
  });
}

export async function gameWorldPage(ctx) {
  const [state, assignments] = await Promise.all([
    ctx.api('/api/game-world/state'),
    ctx.api('/api/student/assignments')
  ]);
  const items = assignmentsFor(assignments);
  const levelStats = state.level_stats || {};
  const continueItem = items.find((a) => !levelStats[a.id]?.completed) || items[0];
  const dayIndex = new Date().getDate() % Math.max(1, items.length);
  const daily = items[dayIndex] || items[0];
  const categories = Object.entries(CATEGORIES);

  return {
    title: 'Game World',
    shell: false,
    html: `<div class="gw-shell">
      ${topbar(state)}
      <main class="gw-wrap">
        <section class="gw-hero">
          <div>
            <span class="gw-eyebrow">★ Level ${state.level || 1} explorer</span>
            <h1>Ready to play,<br>${esc(ctx.state.user?.full_name?.split(' ')[0] || 'friend')}?</h1>
            <p>Explore islands, solve playful challenges, and collect stars. Every game you finish opens the next part of the map.</p>
            <div class="gw-actions">
              <button class="gw-btn gw-btn-primary" id="gw-continue-btn">${continueItem ? '▶ Continue playing' : '📖 See your library'}</button>
              <button class="gw-btn gw-btn-white" data-nav="student/world/map">🗺 Open map</button>
            </div>
          </div>
          ${mascot()}
        </section>

        ${continueItem ? `<section class="gw-section gw-card gw-continue">
          <div class="gw-continue-art">${icon(categoryFor(continueItem.game_type), 42)}</div>
          <div><strong>Continue: ${esc(continueItem.game_title || continueItem.title || 'Activity')}</strong>
            <div class="muted small">${esc(continueItem.instructions || 'Pick up where you left off.')}</div>
            <div class="gw-progress" style="margin-top:.6rem"><span style="width:${Math.min(100, (state.xp || 0) % 150 / 150 * 100)}%"></span></div>
          </div>
          <button class="gw-btn gw-btn-soft" data-start-assignment="${continueItem.id}">Play →</button>
        </section>` : ''}

        <section class="gw-section">
          <div class="gw-section-head"><div><h2>Learning islands</h2><p>Choose a subject and start exploring.</p></div>
            <button class="gw-btn gw-btn-soft" data-nav="student/world/map">Full map →</button></div>
          <div class="gw-grid gw-grid-4">
            ${categories.map(([key, cat]) => `<div class="gw-card gw-card-hover" data-nav="student/world/map">
              <div class="gw-cat-icon" style="background:${cat.color}">${icon(cat.icon, 30)}</div>
              <h3>${esc(cat.label)}</h3><p class="muted">${esc(cat.blurb)}</p>
              <span class="gw-chip">${items.filter((a) => categoryFor(a.game_type) === key).length} games</span>
            </div>`).join('')}
          </div>
        </section>

        ${daily ? `<section class="gw-section gw-card">
          <div class="gw-section-head"><div><h2>Daily challenge</h2><p>A quick win to keep your streak shining.</p></div><span class="gw-chip">Today</span></div>
          <div class="gw-row"><div style="flex:1"><strong>${esc(daily.game_title || daily.title || 'Daily game')}</strong>
            <p class="muted small">${esc(daily.instructions || 'Complete this activity to earn bonus stars.')}</p></div>
            <button class="gw-btn gw-btn-primary" data-start-assignment="${daily.id}">Play challenge</button></div>
        </section>` : ''}

        <section class="gw-section">
          <div class="gw-section-head"><div><h2>All activities</h2><p>Filter by island, grade, subject and difficulty.</p></div></div>
          <div class="gw-row" style="margin-bottom:.8rem">
            <select class="gw-pill" id="gw-filter-category"><option value="">All islands</option>${Object.entries(CATEGORIES).map(([key, cat]) => `<option value="${key}">${esc(cat.label)}</option>`).join('')}</select>
            <select class="gw-pill" id="gw-filter-grade"><option value="">All grades</option>${[...new Set(items.map((a) => a.game_grade_level).filter(Boolean))].map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
            <select class="gw-pill" id="gw-filter-subject"><option value="">All subjects</option>${[...new Set(items.map((a) => a.subject_name).filter(Boolean))].map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
            <select class="gw-pill" id="gw-filter-difficulty"><option value="">All levels</option>${[...new Set(items.map((a) => a.game_difficulty).filter(Boolean))].map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
          </div>
          <div class="gw-grid gw-grid-3" id="gw-game-list">${items.map((item) => {
            const cat = CATEGORIES[categoryFor(item.game_type)] || CATEGORIES.logic;
            return `<div class="gw-card" data-item data-category="${categoryFor(item.game_type)}" data-grade="${esc(item.game_grade_level || '')}" data-subject="${esc(item.subject_name || '')}" data-difficulty="${esc(item.game_difficulty || '')}">
              <div class="gw-cat-icon" style="background:${cat.color}">${icon(cat.icon, 26)}</div>
              <h3>${esc(item.game_title || item.title || 'Activity')}</h3>
              <div class="gw-row"><span class="gw-chip">${esc(cat.label)}</span>${item.game_grade_level ? `<span class="gw-chip">${esc(item.game_grade_level)}</span>` : ''}${item.game_difficulty ? `<span class="gw-chip">${esc(item.game_difficulty)}</span>` : ''}</div>
              <p class="muted small">${esc((item.instructions || item.description || '').slice(0, 80))}</p>
              <button class="gw-btn gw-btn-soft" data-start-assignment="${item.id}">Play now →</button>
            </div>`;
          }).join('') || '<div class="empty">No assigned games yet.</div>'}</div>
        </section>

        <section class="gw-section gw-grid gw-grid-3">
          <div class="gw-card"><h3>🏅 Achievements</h3><div class="gw-row" style="margin-top:.7rem">
            ${['🌱', '🔥', '🧠', '🏆'].map((badge, i) => `<span class="gw-badge ${((state.badges || []).length > i) ? '' : 'locked'}">${badge}</span>`).join('')}
          </div><p class="muted small">Finish activities to unlock more badges.</p></div>
          <div class="gw-card"><h3>⭐ Stars</h3><div class="gw-star-row">${'★'.repeat(Math.min(5, state.stars || 0))}${'☆'.repeat(Math.max(0, 5 - (state.stars || 0)))}</div>
            <p class="muted small">${state.stars || 0} total stars collected.</p></div>
          <div class="gw-card"><h3>🚀 Your level</h3><div style="font-size:2.4rem;font-weight:900;color:#4f46e5">${state.level || 1}</div>
            <div class="gw-progress"><span style="width:${((state.xp || 0) % 150) / 150 * 100}%"></span></div>
            <p class="muted small">${150 - ((state.xp || 0) % 150)} XP to the next level.</p></div>
        </section>

        <section class="gw-section">
          <div class="gw-section-head"><div><h2>Friends to unlock</h2><p>Keep playing to meet the whole crew.</p></div></div>
          <div class="gw-grid gw-grid-4">
            ${[['nova', 2, 'Nova'], ['bubble', 3, 'Bubbles'], ['dot', 4, 'Dot'], ['pixel', 5, 'Pixel']].map(([kind, at, name]) => `<div class="gw-card" style="text-align:center">
              ${friendSvg(kind, (state.level || 1) >= at)}
              <h3>${name}</h3><span class="gw-chip">${(state.level || 1) >= at ? 'Unlocked' : `Level ${at}`}</span>
            </div>`).join('')}
          </div>
        </section>
      </main>
    </div>`,
    mount(el) {
      bindStartButtons(el, ctx);
      const filters = ['category', 'grade', 'subject', 'difficulty'];
      const applyFilters = () => {
        const values = Object.fromEntries(filters.map((key) => [key, el.querySelector(`#gw-filter-${key}`)?.value || '']));
        el.querySelectorAll('[data-item]').forEach((card) => {
          const show = filters.every((key) => !values[key] || card.dataset[key] === values[key]);
          card.style.display = show ? '' : 'none';
        });
      };
      filters.forEach((key) => el.querySelector(`#gw-filter-${key}`)?.addEventListener('change', applyFilters));
      el.querySelector('#gw-continue-btn')?.addEventListener('click', async () => {
        if (!continueItem) return ctx.go('student/library');
        await startAssignment(ctx, continueItem.id);
      });
      const stopMusic = ctx.mountWorldMusic?.(el);
      el.__cleanupPresentation = () => stopMusic?.();
    }
  };
}

export async function gameWorldMapPage(ctx) {
  const [state, assignments] = await Promise.all([
    ctx.api('/api/game-world/state'),
    ctx.api('/api/student/assignments')
  ]);
  const items = assignmentsFor(assignments);
  const levelStats = state.level_stats || {};
  const level = state.level || 1;
  const positions = [
    [15, 26], [36, 18], [58, 28], [80, 18], [20, 52], [44, 48], [68, 56], [88, 50], [32, 78], [58, 80], [80, 78]
  ];
  const colors = ['#2563eb', '#8b5cf6', '#34d399', '#f59e0b', '#f472b6', '#0ea5e9', '#fb923c', '#a855f7', '#14b8a6', '#eab308', '#ec4899'];

  return {
    title: 'Adventure Map',
    shell: false,
    html: `<div class="gw-shell">
      ${topbar(state)}
      <main class="gw-wrap">
        <div class="gw-section-head"><div><h1 style="margin:0">🗺 Learning Map</h1><p>Each island is a new activity. Finish one to unlock the next.</p></div>
          <button class="gw-btn gw-btn-soft" data-nav="student/world">← Game World</button></div>
        <section class="gw-map">
          <h2 class="gw-map-title">Pip's Learning Archipelago</h2>
          <div class="gw-trail"><svg viewBox="0 0 1000 520" preserveAspectRatio="none"><path d="M120 135 C240 40, 330 190, 470 85 S700 150, 810 70 M120 135 C100 260, 240 240, 350 250 S610 220, 690 285 S850 250, 880 260 M350 250 C250 360, 320 420, 450 400 S680 470, 790 400"/></svg></div>
          ${items.slice(0, 11).map((item, i) => {
            const [x, y] = positions[i] || [50, 50];
            const unlocked = i === 0 || levelStats[item.id]?.completed || i < level;
            const done = Boolean(levelStats[item.id]?.completed);
            const cat = CATEGORIES[categoryFor(item.game_type)] || CATEGORIES.logic;
            return `<div class="gw-island ${done ? 'done' : ''} ${unlocked ? (i === level - 1 ? 'current' : '') : 'locked'}" style="left:${x}%;top:${y}%">
              <div class="gw-island-node" style="background:${colors[i % colors.length]}" ${unlocked ? `data-start-assignment="${item.id}" role="button" tabindex="0" aria-label="Play ${esc(item.game_title || 'level ' + (i + 1))}"` : 'aria-disabled="true"'}>
                ${unlocked ? (i + 1) : '🔒'}${done ? '' : ''}
              </div>
              <span class="gw-island-label">${esc((item.game_title || `Level ${i + 1}`).slice(0, 18))}</span>
              ${done ? `<div class="gw-star-row" style="font-size:.9rem">${'★'.repeat(levelStats[item.id]?.stars || 1)}</div>` : ''}
            </div>`;
          }).join('') || '<div class="empty">No activities assigned yet.</div>'}
        </section>
      </main>
    </div>`,
    mount(el) {
      bindStartButtons(el, ctx);
      el.querySelectorAll('.gw-island-node[data-start-assignment]').forEach((node) => {
        node.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); node.click(); }
        });
      });
      const stopMusic = ctx.mountWorldMusic?.(el);
      el.__cleanupPresentation = () => stopMusic?.();
    }
  };
}

export default gameWorldPage;
