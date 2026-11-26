import { esc, toast } from '../ui.js';
import { state, api } from '../app.js';

export default async function loginPage(ctx) {
  return {
    title: 'Sign in',
    shell: false,
    html: `<div class="auth-wrap">
      <section class="auth-art">
        <div class="brand" style="padding:0 0 2rem;color:#fff">
          <div class="brand-mark" style="background:rgba(255,255,255,.2)">🎮</div>
          <div><div class="brand-name" style="color:#fff">Edu<span style="color:#fde68a">Play</span></div>
          <div class="brand-sub" style="color:#c7d2fe">Learn • Play • Grow</div></div>
        </div>
        <h1>Make every lesson an adventure.</h1>
        <p>Create interactive games, align them to your curriculum, assign them to classes, and watch your students grow — all in one playful learning space.</p>
        <div class="auth-features">
          <div><span>🎨</span> 20 ready-to-play educational game formats</div>
          <div><span>🤖</span> Editable AI-assisted question drafts</div>
          <div><span>📊</span> Instant feedback, scores and reports</div>
          <div><span>📚</span> Competency-aware lesson planning</div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand" style="padding:0 0 1.2rem">
            <div class="brand-mark">🎮</div>
            <div><div class="brand-name">Edu<span>Play</span></div><div class="brand-sub">Welcome back</div></div>
          </div>
          <h2>Sign in to your account</h2>
          <p class="muted small">Use your school account to continue.</p>
          <form id="login-form" class="stack">
            <label class="field">Username or email
              <input id="username" name="username" autocomplete="username" placeholder="e.g. teacher" required>
            </label>
            <label class="field">Password
              <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Your password" required>
            </label>
            <div id="login-error" class="notice hidden"></div>
            <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in →</button>
          </form>
          <div class="demo-box">
            <strong>Demo accounts</strong><br>
            Teacher: <button data-demo="teacher@eduplay.ph">teacher@eduplay.ph</button> / Teacher123!<br>
            Student: <button data-demo="student@eduplay.ph">student@eduplay.ph</button> / Student123!<br>
            Admin: <button data-demo="admin@eduplay.ph">admin@eduplay.ph</button> / Admin123!
          </div>
          <details style="margin-top:1rem">
            <summary class="small muted" style="cursor:pointer">New teacher? Request an account</summary>
            <form id="register-form" class="stack" style="margin-top:1rem">
              <label class="field">Full name<input name="full_name" required></label>
              <label class="field">Email<input name="email" type="email" required></label>
              <label class="field">Username<input name="username" required></label>
              <label class="field">Password<input name="password" type="password" minlength="6" required></label>
              <button class="btn btn-soft btn-block" type="submit">Submit for approval</button>
              <p class="muted tiny">An administrator reviews and approves teacher accounts before first sign-in.</p>
            </form>
          </details>
          <details style="margin-top:.7rem">
            <summary class="small muted" style="cursor:pointer">Forgot your password?</summary>
            <form id="forgot-form" class="stack" style="margin-top:1rem">
              <label class="field">Account email<input name="email" type="email" required></label>
              <button class="btn btn-soft btn-block" type="submit">Request recovery code</button>
              <p class="muted tiny" id="recovery-note"></p>
            </form>
            <form id="reset-form" class="stack" style="margin-top:.7rem">
              <label class="field">Recovery code<input name="token" required></label>
              <label class="field">New password<input name="password" type="password" minlength="6" required></label>
              <button class="btn btn-ghost btn-block" type="submit">Set new password</button>
            </form>
          </details>
        </div>
      </section>
    </div>`,
    mount(el) {
      const fillDemo = (email) => {
        el.querySelector('#username').value = email;
        el.querySelector('#password').value = email.startsWith('teacher') ? 'Teacher123!' : email.startsWith('admin') ? 'Admin123!' : 'Student123!';
      };
      el.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => fillDemo(b.dataset.demo)));

      const finish = (data) => {
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('eduplay_token', data.token);
        localStorage.setItem('eduplay_user', JSON.stringify(data.user));
        toast(`Welcome, ${data.user.full_name}!`, 'success');
        ctx.go(data.user.role === 'admin' ? 'admin' : data.user.role === 'teacher' ? 'teacher' : 'student');
      };
      const errorBox = el.querySelector('#login-error');
      el.querySelector('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(e.target));
        errorBox.classList.add('hidden');
        try {
          const data = await api('/api/auth/login', { method: 'POST', body });
          finish(data);
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.classList.remove('hidden');
        }
      });
      el.querySelector('#register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const data = await api('/api/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          e.target.reset();
          toast(data.message || 'Registration received.', 'success');
        } catch (error) { toast(error.message, 'error'); }
      });
      el.querySelector('#forgot-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const data = await api('/api/auth/forgot-password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          el.querySelector('#recovery-note').textContent = data.recoveryCode
            ? `${data.message} Code: ${data.recoveryCode} ${data.note || ''}`
            : data.message;
          toast('Recovery request processed', 'success');
        } catch (error) { toast(error.message, 'error'); }
      });
      el.querySelector('#reset-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const data = await api('/api/auth/reset-password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          e.target.reset();
          el.querySelector('#recovery-note').textContent = '';
          toast(data.message, 'success');
        } catch (error) { toast(error.message, 'error'); }
      });
    }
  };
}
