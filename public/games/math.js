import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'math',
    title: 'Math Sprint',
    icon: '🧮',
    blurb: 'Solve number challenges with a big keypad, instant feedback and a growing streak.',
    editorFields: [
      { key: 'answer', label: 'Numeric answer (optional)', type: 'text', placeholder: 'e.g. 42' },
      { key: 'hint', label: 'Working-out hint', type: 'text', placeholder: 'Shown after an answer' }
    ],
    recommendedFor: ['Math']
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
      .mth-app{font-family:inherit;max-width:700px;margin:0 auto;color:#1f2a52}
      .mth-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .mth-badge{background:linear-gradient(135deg,#ffb703,#fb8500);color:#3a2400;padding:8px 14px;border-radius:999px;font-weight:900;box-shadow:0 4px 12px #fb850055}
      .mth-streak{background:#fff3cd;color:#a05a00;border:2px solid #ffd166;border-radius:999px;padding:6px 12px;font-weight:900}
      .mth-card{background:#fff;border-radius:20px;padding:18px;border:2px solid #ffe1a8;box-shadow:0 12px 30px #1f2a5214}
      .mth-prompt{font-size:clamp(1.35rem,4.5vw,2rem);font-weight:900;line-height:1.35;text-align:center;margin:6px 0 14px;overflow-wrap:anywhere}
      .mth-qnum{font-size:.8rem;font-weight:800;color:#8a94b4;text-align:center;text-transform:uppercase;letter-spacing:.08em}
      .mth-display{width:100%;box-sizing:border-box;font-size:2rem;font-weight:900;text-align:center;padding:12px;border:3px solid #fb8500;border-radius:14px;background:#fffaf0;color:#1f2a52;outline:none}
      .mth-display:focus{box-shadow:0 0 0 4px #fb850033}
      .mth-pad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
      .mth-key{min-height:56px;border:0;border-radius:12px;background:#f1f4ff;color:#1f2a52;font-size:1.3rem;font-weight:900;cursor:pointer;touch-action:manipulation}
      .mth-key:active{transform:scale(.95)}
      .mth-key.mth-go{grid-column:span 2;background:linear-gradient(135deg,#ffb703,#fb8500);color:#3a2400}
      .mth-key.mth-alt{background:#ffe8d1;color:#9c4a00;font-size:1.05rem}
      .mth-choices{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:12px 0 0}
      .mth-choice{min-height:46px;min-width:64px;border:2px solid #ffd166;background:#fffaf0;border-radius:12px;font-weight:900;font-size:1.1rem;cursor:pointer;touch-action:manipulation;padding:8px 14px}
      .mth-choice:hover{background:#fff0cc}
      .mth-feedback{margin-top:14px;padding:12px;border-radius:12px;font-weight:700;line-height:1.5;min-height:24px}
      .mth-ok{background:#e1f8ec;color:#0d6b45;border:2px solid #22a06b}
      .mth-no{background:#ffece6;color:#a53a20;border:2px solid #e17055}
      .mth-next{width:100%;margin-top:12px;min-height:48px;border:0;border-radius:12px;background:linear-gradient(135deg,#4361ee,#7209b7);color:#fff;font-weight:900;cursor:pointer;touch-action:manipulation}
      .mth-empty{text-align:center;padding:40px 16px;background:#fff;border-radius:20px;border:2px dashed #ffd166;color:#8a94b4}
      @media(max-width:420px){.mth-key{min-height:50px}.mth-card{padding:12px}}
    </style>`;

    root.innerHTML = `${style}<div class="mth-app"></div>`;
    const app = root.querySelector('.mth-app');

    if (!questions.length) {
      app.innerHTML = `<div class="mth-empty"><div style="font-size:3rem">🧮</div><b>No sums yet!</b><p>Add math questions to start the sprint.</p></div>`;
      note('No questions available for Math Sprint.', 'info');
      done();
      return;
    }

    const parseNum = (v) => {
      const s = String(v ?? '').replace(/,/g, '').replace(/\u00d7/g, '*').replace(/\u00f7/g, '/').replace(/\u2212/g, '-').trim();
      if (/^[-+*/().\d\s]+$/.test(s)) {
        try {
          const n = Function(`"use strict";return (${s})`)();
          if (Number.isFinite(n)) return n;
        } catch { /* fall back to first number */ }
      }
      const m = s.match(/-?\d+(?:\.\d+)?/);
      return m ? Number(m[0]) : null;
    };
    let idx = 0;
    let streak = 0;
    let best = 0;
    let locked = false;

    const score = (q, correct, response) => {
      if (seen.has(q)) return;
      seen.add(q);
      record({ questionId: q.id, correct: !!correct, response, points: correct ? maxP(q) : 0, maxPoints: maxP(q), explanation: q.explanation || '' });
    };

    function paint() {
      const q = questions[idx];
      const correctText = String(choicesOf(q).find((c) => c.is_correct)?.text ?? q.metadata?.answer ?? '');
      const correctNum = parseNum(correctText);
      const choices = shuffle(choicesOf(q));
      locked = false;

      app.innerHTML = `
        <header class="mth-head"><span class="mth-badge">🧮 Math Sprint</span><span class="mth-streak">🔥 Streak ${streak} · Best ${best}</span></header>
        <section class="mth-card">
          <div class="mth-qnum">Question ${idx + 1} / ${questions.length}</div>
          <p class="mth-prompt">${E(q.prompt || 'Solve the problem.')}</p>
          ${choices.length ? `<div class="mth-choices">${choices.map((c, i) => `<button class="mth-choice" type="button" data-i="${i}">${E(c.text)}</button>`).join('')}</div>` : ''}
          <input class="mth-display" id="mth-input" inputmode="decimal" autocomplete="off" placeholder="?" aria-label="Your answer">
          <div class="mth-pad">
            ${['7', '8', '9', '−', '4', '5', '6', '×', '1', '2', '3', '÷', '0', '.', '⌫'].map((k) => `<button class="mth-key ${['−', '×', '÷'].includes(k) ? 'mth-alt' : ''}" type="button" data-key="${E(k)}">${E(k)}</button>`).join('')}
            <button class="mth-key mth-go" type="button" data-key="enter">CHECK ✅</button>
          </div>
          <div class="mth-feedback" id="mth-feedback" aria-live="polite" hidden></div>
          <div id="mth-next"></div>
        </section>`;

      const input = app.querySelector('#mth-input');
      const feedback = app.querySelector('#mth-feedback');

      const check = (typed) => {
        if (locked) return;
        locked = true;
        const raw = String(typed ?? input.value).trim();
        const n = parseNum(raw);
        const ok = n !== null && correctNum !== null
          ? Math.abs(n - correctNum) < 1e-6
          : !!norm(raw) && norm(raw) === norm(correctText);
        if (ok) { streak++; best = Math.max(best, streak); } else streak = 0;
        score(q, ok, raw);
        sound(ok);
        say(ok ? 'Correct! Nice work.' : 'Not quite.');
        input.disabled = true;
        app.querySelectorAll('.mth-key, .mth-choice').forEach((b) => { b.disabled = true; });
        feedback.hidden = false;
        feedback.className = `mth-feedback ${ok ? 'mth-ok' : 'mth-no'}`;
        const hint = q.metadata?.hint ? `<br>💡 ${E(q.metadata.hint)}` : '';
        feedback.innerHTML = ok
          ? `🎉 Correct! ${E(q.explanation || `The answer is ${correctText}.`)}${hint}`
          : `❌ The answer is <b>${E(correctText)}</b>.${q.explanation ? `<br>${E(q.explanation)}` : ''}${hint}`;
        app.querySelector('#mth-next').innerHTML = `<button class="mth-next" type="button">${idx === questions.length - 1 ? 'See results 🏁' : 'Next question →'}</button>`;
        app.querySelector('.mth-next').addEventListener('click', () => {
          if (idx === questions.length - 1) done();
          else { idx++; paint(); }
        });
      };

      app.querySelector('.mth-pad').addEventListener('click', (ev) => {
        const b = ev.target.closest('.mth-key');
        if (!b || locked) return;
        const k = b.dataset.key;
        if (k === 'enter') check(input.value);
        else if (k === '⌫') input.value = input.value.slice(0, -1);
        else if (k === '−' && !input.value.startsWith('-')) input.value = `-${input.value}`;
        else input.value += k;
        input.focus();
      });

      app.querySelectorAll('.mth-choice').forEach((b) => b.addEventListener('click', () => {
        if (locked) return;
        input.value = choices[Number(b.dataset.i)].text;
        check(input.value);
      }));

      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); check(input.value); } });
      input.focus();
    }

    paint();
  }
};
