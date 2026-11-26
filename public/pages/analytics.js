import { esc, formatDate } from '../ui.js';

const pct = (value) => `${Math.round(Number(value) || 0)}%`;

function bar(label, value, max = 100, suffix = '%') {
  const width = Math.max(0, Math.min(100, (Number(value) / (max || 100)) * 100));
  const color = value >= 75 ? 'var(--green)' : value >= 50 ? 'var(--amber)' : 'var(--red)';
  return `<div style="padding:.45rem 0">
    <div class="row-between small"><span class="ellipsis">${esc(label)}</span><strong>${esc(value)}${suffix}</strong></div>
    <div class="bar" style="margin-top:.3rem"><span style="width:${width}%;background:${color}"></span></div>
  </div>`;
}

async function downloadReport(ctx, report) {
  const token = ctx.state.token;
  const params = new URLSearchParams({ report });
  if (ctx.query.class_id) params.set('class_id', ctx.query.class_id);
  if (ctx.query.game_id) params.set('game_id', ctx.query.game_id);
  const url = `/api/analytics/export?${params.toString()}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not generate the PDF report.');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `eduplay-${report}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default async function analyticsPage(ctx) {
  let data;
  try {
    data = await ctx.api('/api/analytics/overview');
  } catch (error) {
    return {
      title: 'Learning Insights',
      html: `<div class="empty"><div class="big">😕</div><h2>Insights unavailable</h2>
        <p class="muted">${esc(error.message)}</p></div>`
    };
  }

  const kpis = [
    ['📝', data.kpis.scores, 'Recorded scores'],
    ['📈', pct(data.kpis.average), 'Average score'],
    ['✅', pct(data.kpis.pass_rate), 'Pass rate'],
    ['⭐', data.kpis.points, 'Points earned'],
    ['🎓', data.kpis.students, 'Students seen'],
    ['⚠️', data.kpis.at_risk, 'Need practice']
  ];

  return {
    title: 'Learning Insights',
    html: `<div class="stack">
      <div class="notice notice-info"><span>🔍</span><div><strong>Decision-ready analytics.</strong> These insights are calculated from stored attempts, scores and reading sessions. Competency mastery only appears after teachers verify references from official DepEd documents.</div></div>
      <div class="card card-pad filters">
        <select id="filter-class"><option value="">All classes</option>${data.classes.map((c) => `<option value="${c.id}" ${String(ctx.query.class_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select id="filter-game"><option value="">All games</option>${data.games.map((g) => `<option value="${g.id}" ${String(ctx.query.game_id) === String(g.id) ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select>
        <button class="btn btn-primary btn-sm" id="apply-filters">Apply</button>
        <button class="btn btn-ghost btn-sm" id="clear-filters">Clear</button>
        <div class="grow"></div>
        <button class="btn btn-soft btn-sm" data-pdf="analytics">📄 PDF Insights</button>
        <button class="btn btn-soft btn-sm" data-pdf="scores">📄 PDF Scores</button>
        <button class="btn btn-soft btn-sm" data-pdf="students">📄 PDF Students</button>
        <button class="btn btn-soft btn-sm" data-pdf="games">📄 PDF Games</button>
      </div>
      <div class="grid grid-3">
        ${kpis.map(([icon, num, label]) => `<div class="card stat"><div class="stat-ico">${icon}</div><div><div class="stat-num">${esc(num)}</div><div class="stat-label">${label}</div></div></div>`).join('')}
      </div>
      <div class="grid grid-2">
        <div class="card card-pad">
          <div class="section-head"><h2>Competency mastery</h2><span class="muted tiny">${data.competencyMastery.length} competencies</span></div>
          ${data.competencyMastery.length ? data.competencyMastery.slice(0, 10).map((c) => bar(`${c.key} (${c.count} tries)`, c.mastery)).join('')
        : '<p class="muted small">No competency-tagged games have been played yet.</p>'}
        </div>
        <div class="card card-pad">
          <div class="section-head"><h2>Subject performance</h2></div>
          ${data.subjectPerformance.length ? data.subjectPerformance.map((s) => bar(s.key, s.avg)).join('')
        : '<p class="muted small">Play a game to see subject averages.</p>'}
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-pad section-head" style="margin:0"><h2>Frequently missed questions</h2><span class="muted tiny">Weakest items first</span></div>
          <div class="table-wrap" style="border:0;border-radius:0"><table><thead><tr><th>Game</th><th>Question</th><th>Misses</th></tr></thead><tbody>
          ${data.frequentMisses.length ? data.frequentMisses.slice(0, 12).map((m) => `<tr><td class="small">${esc(m.game)}</td><td class="small">${esc(m.prompt)}</td><td><span class="chip chip-red">${m.wrong}</span></td></tr>`).join('')
        : '<tr><td colspan="3" class="center muted">No incorrect answers recorded.</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="card">
          <div class="card-pad section-head" style="margin:0"><h2>Students needing practice</h2><span class="muted tiny">Below 60% or no attempts</span></div>
          <div class="table-wrap" style="border:0;border-radius:0"><table><thead><tr><th>Student</th><th>Grade</th><th>Tries</th><th>Avg</th></tr></thead><tbody>
          ${data.atRisk.length ? data.atRisk.slice(0, 12).map((s) => `<tr><td class="small">${esc(s.student_name)}</td><td class="small">${esc(s.grade_level || '—')}</td><td>${s.attempts}</td><td><span class="chip chip-amber">${pct(s.avg)}</span></td></tr>`).join('')
        : '<tr><td colspan="4" class="center muted">Everyone is above the practice threshold.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card card-pad">
          <div class="section-head"><h2>Score trend</h2><span class="muted tiny">Last ${data.scoreTrend.length} active days</span></div>
          ${data.scoreTrend.length ? data.scoreTrend.map((t) => bar(formatDate(t.day), t.avg)).join('')
        : '<p class="muted small">No scores recorded yet.</p>'}
        </div>
        <div class="card card-pad"><div class="section-head"><h2>Game completion</h2></div>
          ${data.gameCompletion.length ? data.gameCompletion.slice(0, 8).map((g) => bar(`${g.game_title} (${g.completed}/${g.attempts})`, Number(g.avg_score) || 0)).join('')
        : '<p class="muted small">No games assigned yet.</p>'}
          ${data.readingProgress.length ? `<h3 style="margin-top:1rem">Reading sessions</h3>${data.readingProgress.map((r) => bar(`${r.lesson_title} (${r.sessions})`, Math.min(100, r.seconds || 0), 600, 's')).join('')}` : ''}
        </div>
      </div>
    </div>`,
    mount(el) {
      el.querySelector('#apply-filters').addEventListener('click', () => {
        const classId = el.querySelector('#filter-class').value;
        const gameId = el.querySelector('#filter-game').value;
        const parts = [];
        if (classId) parts.push(`class_id=${classId}`);
        if (gameId) parts.push(`game_id=${gameId}`);
        ctx.go(`teacher/analytics${parts.length ? '?' + parts.join('&') : ''}`);
      });
      el.querySelector('#clear-filters').addEventListener('click', () => ctx.go('teacher/analytics'));
      el.querySelectorAll('[data-pdf]').forEach((button) => {
        button.addEventListener('click', async () => {
          try { await downloadReport(ctx, button.dataset.pdf); ctx.toast('PDF report downloaded', 'success'); }
          catch (error) { ctx.toast(error.message, 'error'); }
        });
      });
    }
  };
}
