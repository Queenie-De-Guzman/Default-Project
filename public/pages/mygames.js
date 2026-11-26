import { esc, formatDate } from '../ui.js';

const STATUS_LABELS = {
  draft: 'Draft', published: 'Published', archived: 'Archived', generating: 'Generating', failed: 'Failed'
};

function gameLabel(ctx, type) {
  const found = ctx.state.meta?.gameTypes?.find((g) => g.type === type);
  return found ? `${found.icon} ${found.title}` : '🎮 ' + String(type || 'Game').replace(/_/g, ' ');
}

function statusChip(status) {
  const key = String(status || 'draft');
  const cls = key === 'published' ? 'chip-green' : key === 'failed' ? 'chip-red' : 'chip-amber';
  return `<span class="chip ${cls}">${esc(STATUS_LABELS[key] || key)}</span>`;
}

export async function myGamesPage(ctx) {
  if (!ctx.state.meta) ctx.state.meta = await ctx.api('/api/meta');
  let games = [];
  let loadError = '';
  try {
    const result = await ctx.api('/api/generated-games');
    games = Array.isArray(result) ? result : Array.isArray(result?.games) ? result.games : [];
  } catch (error) {
    loadError = error.message;
  }

  const types = [...new Set(games.map((g) => g.type).filter(Boolean))];
  const statuses = [...new Set(games.map((g) => g.status).filter(Boolean))];

  return {
    title: 'My Generated Games',
    html: `<div class="stack">
      <div class="notice notice-info"><span>🎲</span><div><strong>Games generated from your sources.</strong> Every item keeps a link to its source so you can check wording, evidence and curriculum alignment before publishing.</div></div>
      <div class="section-head"><div><h2>Generated games</h2><p class="muted small">${games.length} item${games.length === 1 ? '' : 's'} • drafts and published games appear here</p></div>
        <button class="btn btn-primary" data-nav="teacher/generator">+ Generate from a source</button></div>
      <div class="filters card card-pad">
        <input id="mg-search" class="search" placeholder="Search title or source…" aria-label="Search generated games">
        <select id="mg-type" aria-label="Filter by game type"><option value="">All types</option>${types.map((t) => `<option value="${esc(t)}">${esc(gameLabel(ctx, t))}</option>`).join('')}</select>
        <select id="mg-status" aria-label="Filter by status"><option value="">All statuses</option>${statuses.map((s) => `<option value="${esc(s)}">${esc(STATUS_LABELS[s] || s)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="mg-reset">Reset</button>
      </div>
      ${loadError ? `<div class="notice"><span>⚠️</span><div>Could not load generated games: ${esc(loadError)}</div></div>` : ''}
      <div id="mg-list" class="grid grid-3"></div>
    </div>`,
    mount(el) {
      const list = el.querySelector('#mg-list');
      const paint = () => {
        const search = el.querySelector('#mg-search').value.trim().toLowerCase();
        const type = el.querySelector('#mg-type').value;
        const status = el.querySelector('#mg-status').value;
        const shown = games.filter((g) => (!search || `${g.title || ''} ${g.source_title || ''}`.toLowerCase().includes(search))
          && (!type || g.type === type) && (!status || g.status === status));
        list.innerHTML = shown.map((g) => `<div class="card card-pad card-hover mg-game-card">
          <div class="row-between"><span style="font-size:1.6rem">${esc(gameLabel(ctx, g.type))}</span>${statusChip(g.status)}</div>
          <h3 style="margin:.6rem 0 .2rem">${esc(g.title || 'Untitled game')}</h3>
          <div class="muted tiny">${g.question_count != null ? `${esc(g.question_count)} question${Number(g.question_count) === 1 ? '' : 's'}` : 'Question count unavailable'} • ${esc(formatDate(g.created_at, true))}</div>
          <div class="mg-source">Source: <strong>${esc(g.source_title || (g.source_type ? `${g.source_type} #${g.source_id || ''}` : 'Not recorded'))}</strong></div>
          <div class="row wrap" style="margin-top:.8rem">
            <button class="btn btn-sm btn-primary" data-nav="teacher/games/${g.game_id}/edit">Edit in builder</button>
            <button class="btn btn-sm btn-soft" data-nav="teacher/games/${g.game_id}/preview">Preview</button>
          </div>
        </div>`).join('') || `<div class="empty card"><div class="big">${loadError ? '⚠️' : '🎲'}</div>
          <h3>${loadError ? 'Generated games unavailable' : games.length ? 'No games match these filters' : 'No generated games yet'}</h3>
          <p>${loadError ? 'Check the server connection and reload the page.' : games.length ? 'Try a different search, type or status.' : 'Choose a source in the AI Game Generator to create your first draft.'}</p>
          <button class="btn btn-primary" data-nav="teacher/generator">Open the generator</button></div>`;
        list.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => ctx.go(b.dataset.nav)));
      };
      el.querySelector('#mg-search').addEventListener('input', paint);
      el.querySelector('#mg-type').addEventListener('change', paint);
      el.querySelector('#mg-status').addEventListener('change', paint);
      el.querySelector('#mg-reset').addEventListener('click', () => {
        el.querySelector('#mg-search').value = '';
        el.querySelector('#mg-type').value = '';
        el.querySelector('#mg-status').value = '';
        paint();
      });
      paint();
    }
  };
}

export default myGamesPage;
