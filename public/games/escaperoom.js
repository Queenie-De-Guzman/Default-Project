import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'escape_room',
    title: 'Escape Room',
    icon: '🔐',
    blurb: 'Solve each locked room to collect keys and escape before the timer of fun runs out.',
    editorFields: [
      { key: 'room_name', label: 'Room name (optional)', type: 'text', placeholder: 'e.g. The Library' },
      { key: 'answer', label: 'Answer override (optional)', type: 'text', placeholder: 'Used when no correct choice is set' }
    ],
    recommendedFor: ['English', 'Math', 'Science', 'History']
  },
  render(ctx) {
    const { root, questions, game, record, finish, notify, speak: sayFn, ui } = ctx;
    const E = ui.esc || esc;
    const say = (t) => { try { if (sayFn) { sayFn(t); return; } } catch { /* use fallback */ } speak(t); };
    const note = (m, k = 'info') => { try { notify(m, k); } catch { toast(m, k); } };
    const maxP = (q) => Number(q?.points ?? game?.points_per_question ?? 1) || 1;
    const seen = new WeakSet();
    let ended = false;
    const done = () => { if (ended) return; ended = true; finish(); };

    const style = `<style>
      .er-app{font-family:inherit;max-width:800px;margin:0 auto;color:#eaf2ff;background:radial-gradient(circle at 20% 0%,#2b3560,#141a30 70%);border-radius:22px;padding:16px;box-shadow:0 14px 34px #10162c66}
      .er-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
      .er-badge{font-weight:900;letter-spacing:.04em;background:linear-gradient(135deg,#ffd166,#ff8c42);color:#241a0b;padding:8px 14px;border-radius:999px}
      .er-sub{font-size:.9rem;color:#b9c6e8;font-weight:700}
      .er-doors{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:16px 0 8px}
      .er-door{width:76px;padding:10px 4px;border-radius:14px;background:linear-gradient(160deg,#344061,#1d2440);border:2px solid #5c6a99;text-align:center;transition:transform .35s,box-shadow .35s,border-color .35s}
      .er-door.er-current{border-color:#ffd166;box-shadow:0 0 0 3px #ffd16644;transform:translateY(-4px)}
      .er-door.er-open{border-color:#4ade80;background:linear-gradient(160deg,#1c6b52,#124b3a);animation:erOpen .5s ease}
      @keyframes erOpen{50%{transform:rotate(-6deg) scale(1.08)}}
      .er-lock{font-size:1.7rem;display:block;line-height:1.2}
      .er-door-label{font-size:.72rem;font-weight:800;color:#cbd6f2}
      .er-keyring{display:flex;gap:3px;justify-content:center;align-items:center;min-height:40px;font-size:1.3rem;flex-wrap:wrap}
      .er-key.er-new{animation:erKey .6s cubic-bezier(.2,1.6,.4,1)}
      @keyframes erKey{from{transform:scale(0) rotate(-90deg);opacity:0}to{transform:none;opacity:1}}
      .er-challenge{background:#ffffff10;border:1px solid #ffffff22;border-radius:18px;padding:16px;margin-top:10px}
      .er-challenge.er-shake{animation:erShake .35s}
      @keyframes erShake{0%,100%{transform:none}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
      .er-prompt{font-size:1.15rem;font-weight:800;margin:0 0 6px;line-height:1.4}
      .er-roomname{font-size:.8rem;color:#ffd166;font-weight:800;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em}
      .er-choices{display:grid;gap:8px;margin-top:12px}
      .er-choice{background:#2b3560;color:#eaf2ff;border:2px solid #46548a;border-radius:12px;padding:12px 14px;text-align:left;font-weight:700;font-size:1rem;cursor:pointer;min-height:46px;touch-action:manipulation}
      .er-choice:hover,.er-choice:focus{border-color:#ffd166;outline:none}
      .er-form{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
      .er-input{flex:1 1 180px;min-width:0;padding:12px;border-radius:12px;border:2px solid #46548a;background:#202943;color:#fff;font-size:1rem}
      .er-btn{border:0;border-radius:12px;padding:12px 16px;min-height:44px;font-weight:800;cursor:pointer;touch-action:manipulation;background:linear-gradient(135deg,#ffd166,#ff8c42);color:#241a0b}
      .er-feedback{min-height:22px;margin-top:10px;font-weight:700;color:#ffe0a3}
      .er-win{text-align:center;padding:26px 10px}
      .er-win-icon{font-size:4rem;animation:erWin .8s ease}
      @keyframes erWin{from{transform:scale(.3) rotate(-25deg)}to{transform:none}}
      .er-code{letter-spacing:.35em;font-weight:900;color:#ffd166;margin:10px 0}
      @media(max-width:420px){.er-door{width:62px}.er-app{padding:12px}}
    </style>`;

    root.innerHTML = `${style}<div class="er-app"></div>`;
    const app = root.querySelector('.er-app');

    if (!questions.length) {
      app.innerHTML = `<div class="er-win"><div class="er-win-icon">🔐</div><b>No locks to open!</b><p>Add questions to build the escape room.</p></div>`;
      note('No questions available for Escape Room.', 'info');
      done();
      return;
    }

    const rooms = questions.slice(0, 8);
    const opened = rooms.map(() => false);
    const recorded = new WeakSet();
    let idx = 0;
    let keys = 0;

    const correctText = (q) => String(choicesOf(q).find((c) => c.is_correct)?.text ?? q.metadata?.answer ?? '');

    function paintDoors() {
      app.querySelector('#er-doors').innerHTML = rooms.map((q, i) => {
        const state = opened[i] ? 'er-open' : i === idx ? 'er-current' : '';
        const name = q.metadata?.room_name || `Room ${i + 1}`;
        return `<div class="er-door ${state}" title="${E(name)}"><span class="er-lock">${opened[i] ? '🔓' : '🔒'}</span><span class="er-door-label">${E(name)}</span></div>`;
      }).join('');
      app.querySelector('#er-keys').innerHTML = opened.map((o) => o ? '<span class="er-key er-new">🔑</span>' : '').join('') || '<span style="color:#7f8bb0;font-size:.8rem">No keys yet</span>';
      app.querySelector('#er-sub').textContent = `Room ${Math.min(idx + 1, rooms.length)} of ${rooms.length} · ${keys} key${keys === 1 ? '' : 's'}`;
    }

    function paintChallenge() {
      const q = rooms[idx];
      const choices = shuffle(choicesOf(q));
      const panel = app.querySelector('#er-challenge');
      const name = q.metadata?.room_name || `Room ${idx + 1}`;
      const answerHtml = choices.length
        ? `<div class="er-choices">${choices.map((c, i) => `<button class="er-choice" type="button" data-i="${i}">${String.fromCharCode(65 + i)}. ${E(c.text)}</button>`).join('')}</div>`
        : `<form class="er-form"><input class="er-input" id="er-answer" autocomplete="off" placeholder="Type the passcode..." aria-label="Room answer"><button class="er-btn" type="submit">Try key 🔑</button></form>`;

      panel.classList.remove('er-shake');
      panel.innerHTML = `
        <div class="er-roomname">${E(name)}</div>
        <p class="er-prompt">${E(q.prompt || 'Solve the puzzle to open this door.')}</p>
        ${answerHtml}
        <div class="er-feedback" aria-live="polite"></div>`;

      const choose = (response, ok) => {
        if (opened[idx]) return;
        if (!recorded.has(q)) {
          recorded.add(q);
          record({ questionId: q.id, correct: !!ok, response, points: ok ? maxP(q) : 0, maxPoints: maxP(q), explanation: q.explanation || '' });
        }
        if (ok) {
          opened[idx] = true;
          keys++;
          sound(true);
          say('Door unlocked!');
          note('Lock opened — key collected!', 'success');
          panel.querySelector('.er-feedback').innerHTML = `<span style="color:#4ade80">🔓 Unlocked!</span>`;
          paintDoors();
          if (idx === rooms.length - 1) window.setTimeout(win, 650);
          else {
            window.setTimeout(() => { idx++; paintDoors(); paintChallenge(); }, 650);
          }
        } else {
          sound(false);
          note('That key does not fit — try again.', 'error');
          panel.classList.add('er-shake');
          panel.querySelector('.er-feedback').textContent = '❌ Wrong key. The door stays locked — try again!';
          window.setTimeout(() => panel.classList.remove('er-shake'), 400);
        }
      };

      panel.querySelectorAll('.er-choice').forEach((b) => b.addEventListener('click', () => {
        const c = choices[Number(b.dataset.i)];
        const ok = c.is_correct || norm(c.text) === norm(correctText(q));
        choose(c.text, ok);
      }));

      panel.querySelector('.er-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const val = panel.querySelector('#er-answer').value.trim();
        const b = norm(correctText(q));
        const a = norm(val);
        const ok = !!b && !!a && (a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b)));
        choose(val, ok);
      });
    }

    function win() {
      app.innerHTML = `
        <div class="er-win">
          <div class="er-win-icon">🎉</div>
          <h2 style="margin:6px 0">You escaped!</h2>
          <p style="color:#b9c6e8">All ${rooms.length} doors unlocked with ${keys} keys.</p>
          <div class="er-code">ESCAPED</div>
          <button class="er-btn" type="button" id="er-finish">Collect results 🏁</button>
        </div>`;
      say('You escaped!');
      app.querySelector('#er-finish').addEventListener('click', done);
    }

    app.innerHTML = `
      <div class="er-head"><span class="er-badge">🔐 ESCAPE ROOM</span><span class="er-sub" id="er-sub"></span></div>
      <div class="er-doors" id="er-doors"></div>
      <div class="er-keyring" id="er-keys"></div>
      <div class="er-challenge" id="er-challenge"></div>`;

    paintDoors();
    paintChallenge();
  }
};
