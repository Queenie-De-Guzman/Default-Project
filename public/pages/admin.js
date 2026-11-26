import { esc, formatDate, initials } from '../ui.js';
import { animatedAdminPage } from './animatedstory.js';
import { interactiveStoriesAdminPage } from './interactivestories.js';

export const adminNav = [
  { path: 'admin', label: 'Overview', icon: '🏠', short: 'Home' },
  { path: 'admin/users', label: 'Users', icon: '👥', short: 'Users' },
  { path: 'admin/approvals', label: 'Approvals', icon: '✅', short: 'Approve' },
  { path: 'admin/logs', label: 'Activity Log', icon: '📜', short: 'Logs' },
  { path: 'admin/settings', label: 'Settings', icon: '⚙️', short: 'Settings' },
  { path: 'admin/animated', label: 'Animated Storybooks', icon: '🎬', short: 'Books' },
  { path: 'admin/interactive', label: 'Interactive Stories', icon: '✨', short: 'Interactive' }
];

const ROLES = ['admin', 'teacher', 'student'];
const STATUSES = ['active', 'inactive', 'pending', 'approved', 'rejected', 'suspended'];

const isSelf = (ctx, user) => ctx.state.user && String(user.id) === String(ctx.state.user.id);
const isApproved = (user) => user.approved !== undefined
  ? !!user.approved
  : ['active', 'approved'].includes(String(user.status || '').toLowerCase());

function errorPage(title, error, path) {
  return {
    title,
    html: `<div class="empty"><div class="big">😕</div><h2>Could not load ${esc(title.toLowerCase())}</h2>
      <p class="muted">${esc(error.message || 'Unknown error')}</p>
      <button class="btn btn-primary" data-nav="${esc(path)}">Try again</button></div>`
  };
}

function statValue(stats, keys, fallback = 0) {
  for (const key of keys) {
    if (stats && stats[key] !== undefined && stats[key] !== null) return stats[key];
  }
  return fallback;
}

function identity(user) {
  const name = user.full_name || user.username || 'Unnamed user';
  return `<div class="row" style="gap:.6rem">
    <div class="avatar" style="background:${esc(user.avatar_color || '#4f46e5')}">${esc(initials(name))}</div>
    <div class="grow ellipsis"><strong class="small">${esc(name)}</strong><div class="muted tiny">${esc(user.email || user.username || '')}</div></div>
  </div>`;
}

function roleChip(role) {
  const cls = role === 'admin' ? 'chip-red' : role === 'teacher' ? 'chip-indigo' : 'chip-green';
  return `<span class="chip ${cls}">${esc(role || '—')}</span>`;
}

function statusChips(user) {
  const status = user.status || (user.active ? 'active' : 'inactive');
  const good = user.active && !['pending', 'rejected', 'suspended'].includes(String(status).toLowerCase());
  const statusClass = good ? 'chip-green' : (String(status).toLowerCase() === 'pending' ? 'chip-amber' : 'chip-red');
  return `<div class="row wrap" style="gap:.3rem">
    <span class="chip ${user.active ? 'chip-green' : 'chip-red'}">${user.active ? 'Active' : 'Inactive'}</span>
    <span class="chip ${statusClass}">${esc(status)}</span>
  </div>`;
}

function fullUserPayload(user, overrides = {}) {
  return {
    role: user.role,
    active: !!user.active,
    approved: isApproved(user),
    full_name: user.full_name || user.username || '',
    email: user.email || '',
    ...overrides
  };
}

function detailsText(details) {
  if (details === null || details === undefined || details === '') return '—';
  if (typeof details === 'string') {
    const text = details.trim();
    if (text.startsWith('{') || text.startsWith('[')) {
      try { return detailsText(JSON.parse(text)); } catch { /* show the raw string */ }
    }
    return text;
  }
  if (Array.isArray(details)) return details.map(detailsText).join(' • ');
  if (typeof details === 'object') {
    return Object.entries(details).map(([key, value]) =>
      `${key}: ${value && typeof value === 'object' ? detailsText(value) : String(value ?? '')}`).join(' • ');
  }
  return String(details);
}

function valueToInput(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function inputToValue(setting, raw) {
  const original = setting.value;
  const text = String(raw ?? '');
  if (typeof original === 'boolean') return text.trim().toLowerCase() === 'true';
  if (typeof original === 'number' && text.trim() !== '' && Number.isFinite(Number(text))) return Number(text);
  if (original !== null && typeof original === 'object') {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

export default async function adminPage(ctx) {
  const section = ctx.params[0];
  if (section === 'users') return usersPage(ctx);
  if (section === 'approvals') return approvalsPage(ctx);
  if (section === 'logs') return logsPage(ctx);
  if (section === 'settings') return settingsPage(ctx);
  if (section === 'animated') return animatedAdminPage(ctx);
  if (section === 'interactive') return interactiveStoriesAdminPage(ctx);
  return overviewPage(ctx);
}

async function overviewPage(ctx) {
  let data;
  try { data = await ctx.api('/api/admin/overview'); }
  catch (e) { return errorPage('Overview', e, 'admin'); }

  const stats = data.stats || {};
  const cards = [
    ['👥', statValue(stats, ['totalUsers', 'total_users', 'users']), 'Total users'],
    ['🧑‍🏫', statValue(stats, ['teachers']), 'Teachers'],
    ['🎓', statValue(stats, ['students']), 'Students'],
    ['⏳', statValue(stats, ['pendingApprovals', 'pending_approvals', 'pending']), 'Pending approvals'],
    ['⚡', statValue(stats, ['activeToday', 'active_today']), 'Active today']
  ];
  const byRole = data.byRole || {};
  const roleRows = Array.isArray(byRole)
    ? byRole.map((r) => [r.role || r.name || r.key || '—', r.count ?? r.total ?? 0])
    : Object.entries(byRole);
  const recentUsers = data.recentUsers || [];
  const recentLogs = data.recentLogs || [];

  return {
    title: 'Admin Overview',
    html: `<div class="stack">
      <div class="notice notice-info"><span>🛡️</span><div><strong>Administrator console.</strong> Review teacher approvals, manage accounts and track platform activity from one place.</div></div>
      <div class="grid grid-3">
        ${cards.map(([icon, num, label]) => `<div class="card stat"><div class="stat-ico">${icon}</div><div><div class="stat-num">${esc(num)}</div><div class="stat-label">${label}</div></div></div>`).join('')}
      </div>
      <div class="card card-pad">
        <div class="section-head" style="margin:0"><h2>Quick actions</h2><span class="muted small">Jump into a management area</span></div>
        <div class="grid grid-4" style="margin-top:1rem">
          <button class="btn btn-primary" data-nav="admin/approvals">✅ Review approvals</button>
          <button class="btn btn-ghost" data-nav="admin/users">👥 Manage users</button>
          <button class="btn btn-ghost" data-nav="admin/logs">📜 View activity log</button>
          <button class="btn btn-ghost" data-nav="admin/settings">⚙️ System settings</button>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card card-pad">
          <div class="section-head"><h2>Recently joined</h2><button class="btn btn-sm btn-ghost" data-nav="admin/users">All users</button></div>
          ${recentUsers.length ? recentUsers.slice(0, 6).map((u) => `<div class="row" style="padding:.4rem 0;border-bottom:1px solid var(--line)">
            ${identity(u)}<div class="right">${roleChip(u.role)}</div></div>`).join('')
          : '<p class="muted small">No users found.</p>'}
        </div>
        <div class="card card-pad">
          <div class="section-head"><h2>Users by role</h2></div>
          ${roleRows.length ? roleRows.map(([role, count]) => `<div class="row-between" style="padding:.4rem 0;border-bottom:1px solid var(--line)">
            <span class="small">${roleChip(role)}</span><strong>${esc(count)}</strong></div>`).join('')
          : '<p class="muted small">No role data available.</p>'}
        </div>
      </div>
      <div class="card">
        <div class="card-pad section-head" style="margin:0"><h2>Recent activity</h2><button class="btn btn-sm btn-ghost" data-nav="admin/logs">Full log</button></div>
        <div class="table-wrap" style="border:0;border-radius:0">
          <table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>
          ${recentLogs.length ? recentLogs.slice(0, 8).map((l) => `<tr>
            <td class="muted small">${formatDate(l.created_at, true)}</td>
            <td class="small">${esc(l.user_name || 'System')}</td>
            <td><span class="chip chip-indigo">${esc(l.action)}</span></td>
            <td class="mono small">${esc(l.entity_type || '—')}${l.entity_id ? ` #${esc(l.entity_id)}` : ''}</td>
            <td class="muted small ellipsis">${esc(detailsText(l.details))}</td></tr>`).join('')
          : '<tr><td colspan="5" class="center muted">No activity recorded yet.</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </div>`
  };
}

async function usersPage(ctx) {
  let users;
  try { users = await ctx.api('/api/admin/users'); }
  catch (e) { return errorPage('Users', e, 'admin/users'); }

  return {
    title: 'User Management',
    html: `<div class="stack">
      <div class="section-head"><div><h2>Users</h2><p class="muted small">Manage roles, account status and credentials.</p></div>
        <span class="chip" id="user-total">${users.length} users</span></div>
      <div class="card card-pad filters">
        <input id="user-search" class="search" placeholder="🔍 Search name, username or email…">
        <select id="user-role"><option value="">All roles</option>${ROLES.map((r) => `<option value="${r}">${r}</option>`).join('')}</select>
        <select id="user-status"><option value="">All statuses</option>${STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="clear-filters">Clear</button>
        <span class="muted small" id="user-count"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Student ID</th><th>Last login</th><th>Joined</th><th class="right">Actions</th></tr></thead>
        <tbody id="user-rows"></tbody>
      </table></div>
    </div>`,
    mount(el) {
      const rows = el.querySelector('#user-rows');
      const count = el.querySelector('#user-count');
      let visible = users;
      let timer;

      const paint = (list) => {
        visible = list;
        count.textContent = `${list.length} shown / ${users.length} total`;
        rows.innerHTML = list.length ? list.map((u) => `<tr>
          <td>${identity(u)}</td>
          <td>${roleChip(u.role)}</td>
          <td>${statusChips(u)}${isSelf(ctx, u) ? '<span class="chip chip-indigo">You</span>' : ''}</td>
          <td class="small mono">${u.student_id ? esc(u.student_id) : '—'}</td>
          <td class="muted small">${formatDate(u.last_login_at, true)}</td>
          <td class="muted small">${formatDate(u.created_at)}</td>
          <td class="right"><div class="row wrap" style="gap:.3rem;justify-content:flex-end">
            <button class="btn btn-sm btn-soft" data-edit="${u.id}">Edit</button>
            ${isSelf(ctx, u)
              ? `<button class="btn btn-sm btn-ghost" disabled title="You cannot deactivate your own account">Deactivate</button>`
              : `<button class="btn btn-sm ${u.active ? 'btn-ghost' : 'btn-green'}" data-toggle="${u.id}">${u.active ? 'Deactivate' : 'Activate'}</button>`}
            <button class="btn btn-sm btn-ghost" data-reset="${u.id}" title="Reset password">🔑 Reset</button>
          </div></td></tr>`).join('')
        : '<tr><td colspan="7" class="center muted">No users match these filters.</td></tr>';
      };

      const load = async () => {
        const query = new URLSearchParams();
        const search = el.querySelector('#user-search').value.trim();
        const role = el.querySelector('#user-role').value;
        const status = el.querySelector('#user-status').value;
        if (search) query.set('search', search);
        if (role) query.set('role', role);
        if (status) query.set('status', status);
        try {
          const list = await ctx.api(`/api/admin/users${query.size ? `?${query}` : ''}`);
          paint(list || []);
        } catch (e) { ctx.toast(e.message, 'error'); }
      };

      paint(users);
      el.querySelector('#user-search').addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(load, 250);
      });
      el.querySelector('#user-role').addEventListener('change', load);
      el.querySelector('#user-status').addEventListener('change', load);
      el.querySelector('#clear-filters').addEventListener('click', () => {
        el.querySelector('#user-search').value = '';
        el.querySelector('#user-role').value = '';
        el.querySelector('#user-status').value = '';
        clearTimeout(timer);
        load();
      });

      rows.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-edit],button[data-toggle],button[data-reset]');
        if (!button) return;
        const user = visible.find((u) => String(u.id) === String(button.dataset.edit || button.dataset.toggle || button.dataset.reset));
        if (!user) return;
        const label = user.full_name || user.username || 'this user';

        if (button.dataset.edit) {
          const body = await ctx.modal(`Edit user — ${label}`, `<div class="form-grid">
            <label class="field full">Full name<input name="full_name" value="${esc(user.full_name || '')}" required></label>
            <label class="field full">Email<input name="email" type="email" value="${esc(user.email || '')}" required></label>
            <label class="field">Role<select name="role">${ROLES.map((r) =>
              `<option value="${r}" ${user.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
            <label class="field">Approved
              <select name="approved"><option value="true" ${isApproved(user) ? 'selected' : ''}>Approved</option>
                <option value="false" ${!isApproved(user) ? 'selected' : ''}>Not approved</option></select></label>
            <label class="field full">Account access
              <input name="active" type="checkbox" ${user.active ? 'checked' : ''} ${isSelf(ctx, user) ? 'disabled' : ''}>
              ${isSelf(ctx, user) ? '<span class="hint">You cannot deactivate your own account.</span>' : '<span class="hint">Uncheck to block sign-in for this user.</span>'}
            </label>
            <div class="full muted small">Current status: ${esc(user.status || (user.active ? 'active' : 'inactive'))}</div>
          </div>`, { okText: 'Save changes' });
          if (!body) return;
          const value = (name) => body.querySelector(`[name="${name}"]`);
          const payload = fullUserPayload(user, {
            full_name: value('full_name').value.trim(),
            email: value('email').value.trim(),
            role: value('role').value,
            approved: value('approved').value === 'true',
            active: isSelf(ctx, user) ? !!user.active : value('active').checked
          });
          if (!payload.full_name || !payload.email) return ctx.toast('Name and email are required', 'error');
          try {
            await ctx.api(`/api/admin/users/${user.id}`, { method: 'PUT', body: payload });
            ctx.toast('User updated', 'success'); ctx.render();
          } catch (err) { ctx.toast(err.message, 'error'); }
        }

        if (button.dataset.toggle) {
          const activating = !user.active;
          if (!activating && !await ctx.confirmDialog('Deactivate user?', `${label} will no longer be able to sign in.`, 'Deactivate')) return;
          try {
            await ctx.api(`/api/admin/users/${user.id}`, {
              method: 'PUT', body: fullUserPayload(user, { active: activating })
            });
            ctx.toast(activating ? 'User activated' : 'User deactivated', 'success'); ctx.render();
          } catch (err) { ctx.toast(err.message, 'error'); }
        }

        if (button.dataset.reset) {
          const body = await ctx.modal(`Reset password — ${label}`, `<div class="form-grid">
            <div class="notice notice-info full"><span>🔑</span><div>Set a new temporary password and share it with the user through a secure channel.</div></div>
            <label class="field full">New password<input name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters"></label>
            <label class="field full">Confirm password<input name="confirm" type="password" autocomplete="new-password"></label>
          </div>`, { okText: 'Reset password' });
          if (!body) return;
          const password = body.querySelector('[name="password"]').value;
          const confirm = body.querySelector('[name="confirm"]').value;
          if (password.length < 8) return ctx.toast('Password must be at least 8 characters', 'error');
          if (password !== confirm) return ctx.toast('Passwords do not match', 'error');
          try {
            await ctx.api(`/api/admin/users/${user.id}/reset-password`, { method: 'POST', body: { password } });
            ctx.toast('Password reset', 'success'); ctx.render();
          } catch (err) { ctx.toast(err.message, 'error'); }
        }
      });
    }
  };
}

async function approvalsPage(ctx) {
  let pending;
  try { pending = await ctx.api('/api/admin/approvals'); }
  catch (e) { return errorPage('Approvals', e, 'admin/approvals'); }

  return {
    title: 'Teacher Approvals',
    html: `<div class="stack">
      <div class="notice notice-info"><span>✅</span><div><strong>Review new teachers.</strong> Approve only accounts you recognise. Rejected teachers cannot sign in until an administrator changes their status.</div></div>
      <div class="section-head"><div><h2>Pending approvals</h2><p class="muted small">${pending.length} teacher${pending.length === 1 ? '' : 's'} waiting for a decision.</p></div>
        <button class="btn btn-sm btn-ghost" data-nav="admin/users">Manage all users</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Teacher</th><th>Username</th><th>Email</th><th>Requested</th><th class="right">Decision</th></tr></thead>
        <tbody>${pending.length ? pending.map((u) => `<tr>
          <td>${identity(u)}</td>
          <td class="small mono">${esc(u.username || '—')}</td>
          <td class="small">${esc(u.email || '—')}</td>
          <td class="muted small">${formatDate(u.created_at, true)}</td>
          <td class="right"><div class="row wrap" style="gap:.3rem;justify-content:flex-end">
            <button class="btn btn-sm btn-green" data-approve="${u.id}">Approve</button>
            <button class="btn btn-sm btn-ghost" data-reject="${u.id}" style="color:var(--red)">Reject</button>
          </div></td></tr>`).join('')
        : '<tr><td colspan="5" class="center muted">No pending teacher approvals. 🎉</td></tr>'}
        </tbody>
      </table></div>
    </div>`,
    mount(el) {
      el.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-approve],button[data-reject]');
        if (!button) return;
        const id = button.dataset.approve || button.dataset.reject;
        const teacher = pending.find((u) => String(u.id) === String(id));
        const label = teacher ? (teacher.full_name || teacher.username || 'this teacher') : 'this teacher';
        if (button.dataset.approve) {
          try {
            await ctx.api(`/api/admin/users/${id}/approve`, { method: 'POST' });
            ctx.toast(`${label} approved`, 'success'); ctx.render();
          } catch (err) { ctx.toast(err.message, 'error'); }
        } else {
          if (!await ctx.confirmDialog('Reject teacher?', `${label} will be denied access to the teacher workspace.`, 'Reject')) return;
          try {
            await ctx.api(`/api/admin/users/${id}/reject`, { method: 'POST' });
            ctx.toast(`${label} rejected`, 'success'); ctx.render();
          } catch (err) { ctx.toast(err.message, 'error'); }
        }
      });
    }
  };
}

async function logsPage(ctx) {
  let logs;
  try { logs = await ctx.api('/api/admin/logs?limit=200'); }
  catch (e) { return errorPage('Activity log', e, 'admin/logs'); }

  return {
    title: 'Activity Log',
    html: `<div class="stack">
      <div class="section-head"><div><h2>Activity log</h2><p class="muted small">Most recent ${logs.length} events across the platform.</p></div>
        <span class="chip" id="log-count"></span></div>
      <div class="card card-pad filters">
        <input id="log-search" class="search" placeholder="🔍 Filter by action (e.g. login, publish)…">
        <button class="btn btn-sm btn-ghost" id="log-clear">Clear</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody id="log-rows"></tbody>
      </table></div>
    </div>`,
    mount(el) {
      const rows = el.querySelector('#log-rows');
      const count = el.querySelector('#log-count');
      const paint = () => {
        const search = el.querySelector('#log-search').value.trim().toLowerCase();
        const list = logs.filter((l) => !search || String(l.action || '').toLowerCase().includes(search));
        count.textContent = `${list.length} / ${logs.length} events`;
        rows.innerHTML = list.length ? list.map((l) => `<tr>
          <td class="muted small">${formatDate(l.created_at, true)}</td>
          <td class="small">${esc(l.user_name || 'System')}</td>
          <td><span class="chip chip-indigo">${esc(l.action || '—')}</span></td>
          <td class="mono small">${esc(l.entity_type || '—')}${l.entity_id ? ` #${esc(l.entity_id)}` : ''}</td>
          <td class="muted small">${esc(detailsText(l.details))}</td></tr>`).join('')
        : `<tr><td colspan="5" class="center muted">No events${search ? ' matching this action' : ''}.</td></tr>`;
      };
      paint();
      el.querySelector('#log-search').addEventListener('input', paint);
      el.querySelector('#log-clear').addEventListener('click', () => {
        el.querySelector('#log-search').value = '';
        paint();
      });
    }
  };
}

async function settingsPage(ctx) {
  let settings;
  try { settings = await ctx.api('/api/admin/settings'); }
  catch (e) { return errorPage('Settings', e, 'admin/settings'); }

  return {
    title: 'System Settings',
    html: `<div class="stack">
      <div class="notice notice-info"><span>⚙️</span><div><strong>Changes apply immediately.</strong> Review each value before saving — settings control platform-wide behaviour.</div></div>
      <div class="section-head"><div><h2>System settings</h2><p class="muted small">${settings.length} configurable value${settings.length === 1 ? '' : 's'}.</p></div>
        <span class="chip" id="save-state">All changes saved</span></div>
      ${settings.length ? `<div class="card card-pad"><form id="settings-form" class="form-grid">
        ${settings.map((s) => `<label class="field full">
          <span class="row-between" style="width:100%"><strong class="small mono">${esc(s.key)}</strong>
            ${s.updated_at ? `<span class="muted tiny">Updated ${formatDate(s.updated_at, true)}</span>` : ''}</span>
          <input name="${esc(s.key)}" value="${esc(valueToInput(s.value))}" ${s.value !== null && typeof s.value === 'object' ? 'class="mono"' : ''}>
          ${s.description ? `<span class="hint">${esc(s.description)}</span>` : ''}
        </label>`).join('')}
        <div class="full row" style="margin-top:.5rem">
          <button class="btn btn-primary" type="submit">Save all settings</button>
          <button class="btn btn-ghost" type="button" id="settings-reset">Discard changes</button>
        </div>
      </form></div>`
      : '<div class="empty"><div class="big">⚙️</div><h3>No settings available</h3><p>The server did not return any configurable settings.</p></div>'}
    </div>`,
    mount(el) {
      const form = el.querySelector('#settings-form');
      if (!form) return;
      const state = el.querySelector('#save-state');
      const reset = () => {
        form.querySelectorAll('input[name]').forEach((input, i) => {
          input.value = valueToInput(settings[i].value);
        });
        state.textContent = 'All changes saved';
      };
      form.addEventListener('input', () => { state.textContent = 'Unsaved changes'; });
      el.querySelector('#settings-reset').addEventListener('click', reset);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputs = [...form.querySelectorAll('input[name]')];
        const payload = settings.map((s, i) => ({ key: s.key, value: inputToValue(s, inputs[i]?.value) }));
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true; button.textContent = 'Saving…';
        try {
          await ctx.api('/api/admin/settings', { method: 'PUT', body: { settings: payload } });
          ctx.toast('Settings saved', 'success');
          state.textContent = 'All changes saved';
          ctx.render();
        } catch (err) {
          ctx.toast(err.message, 'error');
        } finally {
          button.disabled = false; button.textContent = 'Save all settings';
        }
      });
    }
  };
}
