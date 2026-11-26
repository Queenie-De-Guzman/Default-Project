import { esc, formatDate, progressRing } from '../ui.js';

export const studentNav = [
  { path: 'student', label: 'My Learning', icon: '🏠', short: 'Home' },
  { path: 'student/world', label: 'Game World', icon: '🌈', short: 'World' },
  { path: 'student/progress', label: 'My Progress', icon: '📈', short: 'Progress' },
  { path: 'student/library', label: 'My Library', icon: '📚', short: 'Library' },
  { path: 'student/reading', label: 'Reading', icon: '📖', short: 'Read' },
  { path: 'student/activities', label: 'Activities', icon: '🎮', short: 'Games' }
];

const colors = ['#6366f1', '#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899'];
const iconFor = (ctx, type) => ctx.state.meta?.gameTypes?.find((g) => g.type === type)?.icon || '🎮';
const titleFor = (ctx, type) => ctx.state.meta?.gameTypes?.find((g) => g.type === type)?.title || type;

async function openAssignment(ctx, assignment) {
  if (assignment.my_attempts > 0 && !assignment.assignment_allow_retry) {
    ctx.toast('This activity allows only one attempt. View your results instead.', 'info');
    return ctx.go('student/progress');
  }
  try {
    const result = await ctx.api('/api/attempts', {
      method: 'POST',
      body: { assignment_id: Number(assignment.assignment_id) }
    });
    ctx.go(`student/play/${result.attempt.id}`);
  } catch (error) {
    if (error.status === 403) {
      ctx.toast('This activity allows only one attempt.', 'error');
      ctx.go('student/progress');
    } else {
      ctx.toast(error.message, 'error');
    }
  }
}

async function ensureMeta(ctx) {
  if (!ctx.state.meta) ctx.state.meta = await ctx.api('/api/meta');
}

export async function studentPage(ctx) {
  await ensureMeta(ctx);
  const section = ctx.params[0];
  if (section === 'progress') return progressPage(ctx);
  if (section === 'reading') return readingPage(ctx);
  if (section === 'activities') return activitiesPage(ctx);
  return homePage(ctx);
}

async function homePage(ctx) {
  const data = await ctx.api('/api/student/dashboard');
  const first = ctx.state.user.full_name.split(' ')[0];
  const rewardIcons = data.rewards.slice(0, 5).map((r) => `<div class="reward" title="${esc(r.description)}">${r.icon} ${esc(r.name)}</div>`).join('');
  return {
    title: 'My Learning',
    html: `<div class="stack">
      <div class="card card-pad" style="background:linear-gradient(120deg,#4f46e5,#8b5cf6);color:#fff;border:0">
        <div class="row-between wrap">
          <div><h1 style="color:#fff;margin:0">Hi, ${esc(first)}! 👋</h1>
            <p style="color:#e0e7ff;margin:.4rem 0 0">Ready to play and learn something new today?</p>
            <div class="row wrap" style="margin-top:.7rem">
              <button class="btn btn-sm" style="background:#fbbf24;color:#78350f;border:0;font-weight:800" data-nav="student/world">🌈 Game World</button>
              <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:0" data-nav="student/reading">📖 Reading Corner</button>
              <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:0" data-nav="student/library">📚 My Library</button></div></div>
          <div class="row"><div style="text-align:center"><div style="font-size:1.8rem;font-weight:900">${data.progress.completed}</div><div class="tiny" style="color:#c7d2fe">games finished</div></div>
            <div style="width:1px;height:38px;background:rgba(255,255,255,.25)"></div>
            <div style="text-align:center"><div style="font-size:1.8rem;font-weight:900">${data.progress.points}</div><div class="tiny" style="color:#c7d2fe">points earned</div></div></div>
        </div>
      </div>
      <div class="section-head"><div><h2>Assigned to you</h2><p class="muted small">${data.assignments.length} activit${data.assignments.length === 1 ? 'y' : 'ies'} waiting</p></div>
        <button class="btn btn-ghost btn-sm" data-nav="student/activities">See all →</button></div>
      ${data.assignments.length ? `<div class="grid grid-3">${data.assignments.slice(0, 6).map((a, i) => {
        const done = a.my_attempts > 0;
        const color = colors[a.id % colors.length];
        return `<div class="card game-card card-hover">
          <div class="game-cover" style="background:linear-gradient(135deg,${color},${color}bb)">${iconFor(ctx, a.type)}</div>
          <div class="game-card-body">
            <div class="row wrap"><span class="chip chip-indigo">${esc(titleFor(ctx, a.type))}</span>
              ${done ? `<span class="chip ${a.best_score >= 75 ? 'chip-green' : 'chip-amber'}">Best ${a.best_score ?? 0}%</span>` : '<span class="chip chip-amber">New</span>'}</div>
            <h3>${esc(a.title)}</h3>
            <p class="muted small" style="margin:0">${esc((a.description || a.instructions || '').slice(0, 70))}</p>
            <div class="muted tiny">${esc(a.class_name)} • ${esc(a.subject_name || 'General')}${a.due_at ? ` • Due ${formatDate(a.due_at)}` : ''}</div>
            <div class="game-actions"><button class="btn btn-sm btn-primary btn-block" data-play="${a.assignment_id}">${done && a.assignment_allow_retry ? 'Play again' : done ? 'View results' : 'Play now'} →</button></div>
          </div></div>`;
      }).join('')}</div>` : '<div class="empty card"><div class="big">🎁</div><h3>No activities yet</h3><p>Your teacher will assign games here soon.</p></div>'}
      <div class="grid grid-2">
        <div class="card card-pad"><div class="section-head"><h3>My badges</h3><button class="btn btn-sm btn-ghost" data-nav="student/progress">View all</button></div>
          <div class="reward-strip" style="justify-content:flex-start">${rewardIcons || '<span class="muted small">Play a game to earn your first badge!</span>'}</div>
          <div class="bar" style="margin-top:1rem"><span style="width:${Math.min(100, data.progress.average)}%"></span></div>
          <div class="muted small" style="margin-top:.4rem">Average score: <strong>${Math.round(data.progress.average)}%</strong></div>
        </div>
        <div class="card card-pad"><h3>My classes</h3>
          ${data.classes.length ? data.classes.map((c) => `<div class="row" style="padding:.4rem 0;border-bottom:1px solid var(--line)"><span style="font-size:1.2rem">🏫</span>
            <div class="grow"><strong class="small">${esc(c.name)}</strong><div class="muted tiny">${esc(c.subject_name || 'General')} • ${esc(c.grade_level)}</div></div>
            <span class="chip mono tiny">${esc(c.join_code)}</span></div>`).join('') : '<p class="muted small">You have not joined a class yet.</p>'}
          <form id="join-form" class="row" style="margin-top:1rem"><input id="join-code" placeholder="Enter class code" style="flex:1">
            <button class="btn btn-primary btn-sm" type="submit">Join</button></form>
        </div>
      </div>
    </div>`,
    mount(el) {
      el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => {
        const assignment = data.assignments.find((a) => String(a.assignment_id) === String(b.dataset.play));
        if (assignment) openAssignment(ctx, assignment);
      }));
      el.querySelector('#join-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await ctx.api('/api/student/join', { method: 'POST', body: { code: el.querySelector('#join-code').value } }); ctx.toast('Joined class!', 'success'); ctx.render(); }
        catch (error) { ctx.toast(error.message, 'error'); }
      });
    }
  };
}

async function activitiesPage(ctx) {
  const data = await ctx.api('/api/student/dashboard');
  return {
    title: 'Activities',
    html: `<div class="stack">
      <div class="section-head"><div><h2>All activities</h2><p class="muted small">Pick an activity and start playing.</p></div></div>
      ${data.assignments.length ? `<div class="grid grid-3">${data.assignments.map((a, i) => `<div class="card game-card card-hover">
        <div class="game-cover" style="background:linear-gradient(135deg,${colors[a.id % colors.length]},${colors[a.id % colors.length]}bb)">${iconFor(ctx, a.type)}</div>
        <div class="game-card-body"><span class="chip chip-indigo">${esc(titleFor(ctx, a.type))}</span>
          <h3>${esc(a.title)}</h3><p class="muted small">${esc(a.description || '')}</p>
          <div class="muted tiny">${a.my_attempts} attempt${a.my_attempts === 1 ? '' : 's'} • Best ${a.best_score ?? 0}%</div>
          <button class="btn btn-sm btn-primary btn-block" data-play="${a.assignment_id}">Play now →</button>
        </div></div>`).join('')}</div>` : '<div class="empty card"><div class="big">🎮</div><h3>No activities assigned</h3></div>'}
    </div>`,
    mount(el) {
      el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => {
        const assignment = data.assignments.find((a) => String(a.assignment_id) === String(b.dataset.play));
        if (assignment) openAssignment(ctx, assignment);
      }));
    }
  };
}

async function readingPage(ctx) {
  let lessons;
  try { lessons = await ctx.api('/api/reading/lessons'); }
  catch (error) {
    return { title: 'Reading', html: `<div class="empty"><div class="big">📖</div><h2>Reading is unavailable</h2><p class="muted">${esc(error.message)}</p></div>` };
  }
  return {
    title: 'Reading Corner',
    html: `<div class="stack">
      <div class="card card-pad" style="background:linear-gradient(120deg,#0ea5e9,#8b5cf6);color:#fff;border:0">
        <h1 style="color:#fff;margin:0">Read, listen, discover 📖</h1>
        <p style="color:#e0f2fe;margin:.4rem 0 0">Open a storybook, listen to narration, practice reading aloud, and learn new words.</p>
      </div>
      <div class="row wrap"><button class="btn btn-sm btn-primary" data-nav="student/reading">📖 Read Aloud</button>
        <button class="btn btn-sm btn-soft" data-nav="student/animated">🎬 Animated Storybooks</button>
        <button class="btn btn-sm btn-soft" data-nav="student/interactive">✨ Interactive Stories</button></div>
      ${lessons.length ? `<div class="grid grid-3">${lessons.map((l, i) => `<div class="card game-card card-hover">
        <div class="game-cover" style="background:linear-gradient(135deg,${colors[i % colors.length]},${colors[i % colors.length]}bb)">📖</div>
        <div class="game-card-body"><span class="chip chip-indigo">${esc(l.subject_name || 'Reading')}</span>
          <h3>${esc(l.title)}</h3><p class="muted small">${esc((l.description || '').slice(0, 80))}</p>
          <div class="muted tiny">${l.page_count || 1} page${l.page_count === 1 ? '' : 's'} • ${l.sessions ? `${l.sessions} visit${l.sessions === 1 ? '' : 's'}` : 'Not opened yet'}</div>
          <button class="btn btn-sm btn-primary btn-block" data-nav="student/read/${l.id}">Open storybook →</button>
        </div></div>`).join('')}</div>`
      : '<div class="empty card"><div class="big">📚</div><h3>No published stories yet</h3><p>Ask your teacher to publish a reading lesson.</p></div>'}
    </div>`
  };
}

async function progressPage(ctx) {
  const [data, reading] = await Promise.all([
    ctx.api('/api/student/progress'),
    ctx.api('/api/student/reading-stats')
  ]);
  const overall = data.history.length ? Math.round(data.history.reduce((s, r) => s + r.percentage, 0) / data.history.length) : 0;
  return {
    title: 'My Progress',
    html: `<div class="stack">
      <div class="grid grid-4">
        <div class="card stat"><div class="stat-ico">🏆</div><div><div class="stat-num">${data.history.length}</div><div class="stat-label">Games played</div></div></div>
        <div class="card stat"><div class="stat-ico">⭐</div><div><div class="stat-num">${data.history.reduce((s, r) => s + r.points, 0)}</div><div class="stat-label">Points earned</div></div></div>
        <div class="card stat"><div class="stat-ico">📈</div><div><div class="stat-num">${overall}%</div><div class="stat-label">Average score</div></div></div>
        <div class="card stat"><div class="stat-ico">🎖️</div><div><div class="stat-num">${data.rewards.length}</div><div class="stat-label">Badges earned</div></div></div>
      </div>
      <div class="grid grid-2">
        <div class="card card-pad"><h3>Progress by subject</h3>
          ${data.rows.length ? data.rows.map((r) => `<div class="row" style="padding:.5rem 0;border-bottom:1px solid var(--line)">
            ${progressRing(r.best_percentage, 46)}<div class="grow"><strong class="small">${esc(r.game_title || r.subject_name)}</strong>
              <div class="muted tiny">${r.attempts} attempt${r.attempts === 1 ? '' : 's'} • ${r.total_points} points</div></div></div>`).join('')
          : '<p class="muted small">Start playing to see your progress.</p>'}
        </div>
        <div class="card card-pad"><h3>Badge collection</h3>
          <div class="grid grid-2">
          ${data.rewards.length ? data.rewards.map((r) => `<div class="card card-pad center" style="box-shadow:none;background:#fffbeb;border-color:#fde68a">
            <div style="font-size:2rem">${r.icon}</div><strong class="small">${esc(r.name)}</strong>
            <div class="muted tiny">${esc(r.description)}</div></div>`).join('') : '<p class="muted small">No badges yet — keep learning!</p>'}
          </div>
        </div>
      </div>
      <div class="card card-pad"><div class="section-head"><div><h3>📖 Reading journey</h3><p class="muted small">Stories, words and quizzes completed.</p></div>
        <button class="btn btn-sm btn-soft" data-nav="student/library">Open library</button></div>
        <div class="grid grid-4">
          <div class="card stat"><div class="stat-ico">📚</div><div><div class="stat-num">${reading.sessions.c}</div><div class="stat-label">Reading sessions</div></div></div>
          <div class="card stat"><div class="stat-ico">⏱️</div><div><div class="stat-num">${Math.round(reading.sessions.seconds / 60)}</div><div class="stat-label">Minutes read</div></div></div>
          <div class="card stat"><div class="stat-ico">🔤</div><div><div class="stat-num">${reading.sessions.words}</div><div class="stat-label">Words read</div></div></div>
          <div class="card stat"><div class="stat-ico">🧩</div><div><div class="stat-num">${reading.quiz.best}%</div><div class="stat-label">Best quiz</div></div></div>
        </div>
        <h4 style="margin:1rem 0 .5rem">Story history</h4>
        <div class="table-wrap"><table class="ra-history-table"><thead><tr><th>Story</th><th>Mode</th><th>Minutes</th><th>Words</th><th>Status</th><th>Date</th></tr></thead><tbody>
          ${reading.history.length ? reading.history.map((r) => `<tr><td><strong>${esc(r.title)}</strong></td><td>${esc(r.mode)}</td>
            <td>${Math.round(r.time_spent / 60)}</td><td>${r.words_read}</td>
            <td><span class="chip ${r.completed ? 'chip-green' : 'chip-amber'}">${r.completed ? 'Finished' : 'In progress'}</span></td>
            <td class="muted small">${formatDate(r.created_at, true)}</td></tr>`).join('')
          : '<tr><td colspan="6" class="center muted">No reading history yet.</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="card"><div class="card-pad section-head" style="margin:0"><h3>Recent results</h3></div>
        <div class="table-wrap" style="border:0;border-radius:0"><table><thead><tr><th>Activity</th><th>Subject</th><th>Score</th><th>Stars</th><th>Points</th><th>Date</th></tr></thead><tbody>
        ${data.history.length ? data.history.map((r) => `<tr><td><strong>${esc(r.game_title)}</strong></td><td>${esc(r.subject_name || '—')}</td>
          <td><span class="chip ${r.percentage >= 75 ? 'chip-green' : 'chip-amber'}">${r.percentage}%</span></td>
          <td class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</td><td>${r.points}</td><td class="muted small">${formatDate(r.recorded_at, true)}</td></tr>`).join('')
        : '<tr><td colspan="6" class="center muted">No results yet.</td></tr>'}
        </tbody></table></div>
      </div>
    </div>`
  };
}
