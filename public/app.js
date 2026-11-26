import { toast, modal, confirmDialog, formatDate, downloadFile, initials, esc } from './ui.js';
import loginPage from './pages/login.js';
import { teacherPage, teacherNav } from './pages/teacher.js';
import { studentPage, studentNav } from './pages/student.js';
import gamePlayer from './pages/gameplayer.js';
import builderPage from './pages/builder.js';
import analyticsPage from './pages/analytics.js';
import readerPage from './pages/reader.js';
import materialsPage, { presentationHubPage } from './pages/materials.js';
import libraryPage from './pages/library.js';
import generatorPage from './pages/generator.js';
import myGamesPage from './pages/mygames.js';
import customizePage from './pages/customize.js';
import studentLibraryPage, { storyReaderPage, presentationReaderPage } from './pages/studentlibrary.js';
import adminPage, { adminNav } from './pages/admin.js';
import { presenterView, slideshowPage } from './pages/presentation.js';
import { storyPresenterView, storySlideshowPage } from './pages/story-present.js';
import { gameWorldPage, gameWorldMapPage } from './pages/gameworld.js';
import { mountWorldMusic } from './ui.js';
import { animatedLibraryPage, animatedPlayerPage } from './pages/animatedstory.js';
import { interactiveStoriesPage, interactiveStoryPlayerPage, interactiveStoriesAdminPage } from './pages/interactivestories.js';

const app = document.getElementById('app');
const TOKEN_KEY = 'eduplay_token';
const USER_KEY = 'eduplay_user';

export const state = {
  token: localStorage.getItem(TOKEN_KEY),
  user: safeParse(localStorage.getItem(USER_KEY)),
  meta: null,
  route: ''
};

function safeParse(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? (options.body instanceof FormData ? options.body : JSON.stringify(options.body)) : undefined
    });
  } catch {
    throw new Error('Cannot reach the EduPlay server. Check your connection and try again.');
  }
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && state.token && !path.includes('/auth/login')) {
      logout();
    }
    const error = new Error(data?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

export function go(path) {
  const target = '#/' + String(path || '').replace(/^#\/?/, '');
  if (location.hash === target) render();
  else location.hash = target;
}

let preferencesRequested = false;

function applyDisplayPreferences(prefs) {
  const root = document.documentElement;
  root.dataset.fontSize = String(prefs.fontSize || 'medium');
  root.dataset.animations = prefs.animations === false ? 'off' : 'on';
  root.dataset.contrast = prefs.highContrast ? 'high' : 'normal';
  root.dataset.captions = prefs.captions === false ? 'off' : 'on';
}

// Loads saved display preferences once per signed-in session without re-rendering.
export async function applyPreferences() {
  if (preferencesRequested || !state.token || !state.user) return;
  preferencesRequested = true;
  try {
    applyDisplayPreferences(await api('/api/preferences'));
  } catch {
    preferencesRequested = false;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  state.token = null;
  state.user = null;
  preferencesRequested = false;
  applyDisplayPreferences({});
  go('login');
}

function homeRoute(role = state.user?.role) {
  if (role === 'admin') return 'admin';
  if (role === 'teacher') return 'teacher';
  return 'student';
}

function shell(page, title) {
  const role = state.user?.role || 'student';
  const nav = role === 'admin' ? adminNav : role === 'student' ? studentNav : teacherNav;
  const workspaceLabel = role === 'admin' ? 'Administration' : role === 'teacher' ? 'Teacher Studio' : 'Learning Space';
  const path = state.route;
  const activePath = path.startsWith('builder/') ? `teacher/games/${path.split('/').slice(2).join('/')}` : path;
  const navItems = nav.map((item) => {
    const active = activePath === item.path || (item.path !== '' && activePath.startsWith(item.path + '/'));
    return `<button class="nav-item ${active ? 'active' : ''}" data-nav="${esc(item.path)}">
      <span class="ico">${item.icon}</span><span>${esc(item.label)}</span></button>`;
  }).join('');
  const mobile = nav.slice(0, 5).map((item) => {
    const active = activePath === item.path || (item.path !== '' && activePath.startsWith(item.path + '/'));
    return `<button class="${active ? 'active' : ''}" data-nav="${esc(item.path)}"><span class="ico">${item.icon}</span>${esc(item.short || item.label)}</button>`;
  }).join('');
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand" data-nav="${role}">
        <div class="brand-mark">🎮</div>
        <div><div class="brand-name">Edu<span>Play</span></div><div class="brand-sub">${workspaceLabel}</div></div>
      </div>
      <nav class="nav">
        <div class="nav-label">Workspace</div>${navItems}
      </nav>
      <div class="nav-foot">
        <div class="user-chip">
          <div class="avatar" style="background:${esc(state.user?.avatar_color || '#4f46e5')}">${esc(initials(state.user?.full_name))}</div>
          <div class="grow ellipsis"><div style="font-weight:700;font-size:.85rem">${esc(state.user?.full_name)}</div><div class="muted tiny">${esc(state.user?.role)}</div></div>
          <button class="icon-btn" id="logout-btn" data-nav="" title="Sign out" aria-label="Sign out">↪</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar"><div><div class="crumb">${workspaceLabel}</div><h1>${esc(title)}</h1></div>
        <div class="row"><span class="chip chip-indigo">🎮 EduPlay</span></div></header>
      <main class="content" id="view">${page}</main>
    </div>
  </div>
  <nav class="mobile-nav">${mobile}</nav>`;
}

export async function render() {
  const raw = location.hash.replace(/^#\/?/, '') || (state.token ? (state.user?.role === 'teacher' ? 'teacher' : 'student') : 'login');
  const [pathname, queryString] = raw.split('?');
  const parts = pathname.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryString || ''));
  state.route = pathname;

  if (!state.token && pathname !== 'login') return go('login');
  if (state.token && (pathname === 'login' || pathname === '')) {
    return go(homeRoute());
  }

  const ctx = {
    api, state, go, render, toast, modal, confirmDialog, formatDate, downloadFile, esc,
    mountWorldMusic,
    params: parts.slice(1), query
  };

  applyPreferences();

  let result;
  try {
    if (pathname === 'login') {
      result = await loginPage(ctx);
    } else if (!state.user) {
      const me = await api('/api/auth/me');
      state.user = me.user;
      localStorage.setItem(USER_KEY, JSON.stringify(me.user));
      return render();
    } else if (parts[0] === 'admin' && state.user.role === 'admin') {
      if (parts[1] === 'animated-preview') result = await animatedPlayerPage(ctx);
      else if (parts[1] === 'interactive-preview') result = await interactiveStoryPlayerPage(ctx);
      else result = await adminPage(ctx);
    } else if (parts[0] === 'teacher' && state.user.role === 'teacher') {
      if (parts[1] === 'lessons' && parts[3] === 'read') result = await readerPage(ctx);
      else if (parts[1] === 'analytics') result = await analyticsPage(ctx);
      else if (parts[1] === 'materials') result = await materialsPage(ctx);
      else if (parts[1] === 'presentations') result = await presentationHubPage(ctx);
      else if (parts[1] === 'library') result = await libraryPage(ctx);
      else if (parts[1] === 'animated-preview') result = await animatedPlayerPage(ctx);
      else if (parts[1] === 'present') result = await presenterView(ctx);
      else if (parts[1] === 'audience') result = await slideshowPage(ctx);
      else if (parts[1] === 'story-presenting') result = await storyPresenterView(ctx);
      else if (parts[1] === 'story-audience') result = await storySlideshowPage(ctx);
      else if (parts[1] === 'generator') result = await generatorPage(ctx);
      else if (parts[1] === 'generated') result = await myGamesPage(ctx);
      else if (parts[1] === 'customize') result = await customizePage(ctx);
      else if (parts[1] === 'games' && parts[3] === 'edit') result = await builderPage({ ...ctx, params: ['games', parts[2], 'edit'] });
      else result = await teacherPage(ctx);
    } else if (parts[0] === 'student' && state.user.role === 'student') {
      if (parts[1] === 'world') result = parts[2] === 'map' ? await gameWorldMapPage(ctx) : await gameWorldPage(ctx);
      else if (parts[1] === 'play') result = await gamePlayer(ctx);
      else if (parts[1] === 'read') result = await readerPage(ctx);
      else if (parts[1] === 'story') result = await storyReaderPage(ctx);
      else if (parts[1] === 'presentation') result = await presentationReaderPage(ctx);
      else if (parts[1] === 'slideshow') result = await slideshowPage(ctx);
      else if (parts[1] === 'storyshow') result = await storySlideshowPage(ctx);
      else if (parts[1] === 'library') result = await studentLibraryPage(ctx);
      else if (parts[1] === 'animated') result = parts[2] ? await animatedPlayerPage(ctx) : await animatedLibraryPage(ctx);
      else if (parts[1] === 'interactive') result = parts[2] ? await interactiveStoryPlayerPage(ctx) : await interactiveStoriesPage(ctx);
      else result = await studentPage(ctx);
    } else if (parts[0] === 'builder' && state.user.role === 'teacher') {
      result = await builderPage(ctx);
    } else {
      result = { title: 'Not found', html: '<div class="empty"><div class="big">🧭</div><h2>Page not found</h2><button class="btn btn-primary" data-nav="teacher">Go back</button></div>' };
    }
  } catch (error) {
    result = {
      title: 'Something went wrong',
      html: `<div class="empty"><div class="big">😕</div><h2>${esc(error.message)}</h2>
        ${error.details ? `<p class="muted">${esc(error.details.join(' • '))}</p>` : ''}
        <button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`
    };
  }

  const previousView = document.getElementById('view') || app;
  previousView.__cleanupPresentation?.();
  app.innerHTML = result.shell === false ? result.html : shell(result.html, result.title);
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.id === 'logout-btn') { e.stopPropagation(); logout(); return; }
      go(el.dataset.nav);
    });
  });
  if (result.mount) result.mount(document.getElementById('view') || app, ctx);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.addEventListener('hashchange', render);
render();
