import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'random_question',
    title: 'Random Question',
    icon: '🎲',
    blurb: 'A shuffled question dash with skip, instant answers and a streak counter.',
    editorFields: [
      { key: 'answer', label: 'Answer override (typed fallback)', type: 'text', placeholder: 'Used when there are no choices' }
    ],
    recommendedFor: ['English', 'Math', 'Science', 'General']
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
      .rnd-app{font-family:inherit;max-width:740px;margin:0 auto;color:#242a46}
      .rnd-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .rnd-badge{background:linear-gradient(135deg,#f9c74f,#f8961e);color:#3a2600;padding:8px 14px;border-radius:999px;font-weight:900;box-shadow:0 4px 12px #f8961e55}
      .rnd-streak{background:#fff4dd;border:2px solid #ffd166;border-radius:999px;padding:6px 12px;font-weight:900;color:#a15c00}
      .rnd-card{background:#fff;border-radius:20px;padding:18px;border:2px solid #ffe5b8;box-shadow:0 12px 30px #242a4614}
      .rnd-tag{font-size:.78rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#a15c00}
      .rnd-prompt{font-size:clamp(1.15rem,3.6vw,1.55rem);font-weight:800;line-height:1.45;margin:10px 0 16px;overflow-wrap:anywhere}
      .rnd-choices{display:grid;gap:8px}
      @media(min-width:540px){.rnd-choices{grid-template-columns:1fr 1fr}}
      .rnd-choice{min-height:48px;border:2px solid #ffd98a;background:#fffbf2;border-radius:12px;padding:12px;text-align:left;font-weight:700;font-size:1rem;cursor:pointer;touch-action:manipulation;color:#242a46}
      .rnd-choice:hover{border-color:#f8961e;background:#fff3d9}
      .rnd-form{display:flex;gap:8px;flex-wrap:wrap}
      .rnd-input{flex:1 1 190px;min-width:0;padding:12px;border:2px solid #ffd98a;border-radius:12px;font-size:1rem;outline:none}
      .rnd-input:focus{border-color:#f8961e;box-shadow:0 0 0 3px #f8961e33}
      .rnd-btn{border:0;border-radius:12px;min-height:46px;padding:12px 16px;font-weight:900;cursor:pointer;touch-action:manipulation;background:linear-gradient(135deg,#f9c74f,#f8961e);color:#3a2600}
      .rnd-btn.rnd-skip{background:#f1f3f8;color:#667085}
      .rnd-toolbar{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:14px}
      .rnd-feedback{margin-top:12px;padding:10px 12px;border-radius:12px;font-weight:700;line-height:1.5}
      .rnd-ok{background:#e1f8ec;color:#0d6b45}.rnd-no{background:#ffece6;color:#a53a20}
      .rnd-next{margin-top:12px}
      .rnd-next button{width:100%;border:0;border-radius:12px;min-height:48px;background:linear-gradient(135deg,#4361ee,#7209b7);color:#fff;font-weight:900;cursor:pointer;touch-action:manipulation}
      .rnd-empty{text-align:center;padding:40px 16px;background:#fff;border-radius:20px;border:2px dashed #ffd98a;color:#667085}
    </style>`;

    root.innerHTML = `${style}<div class="rnd-app"></div>`;
    const app = root.querySelector('.rnd-app');

    if (!questions.length) {
      app.innerHTML = `<div class="rnd-empty"><div style="font-size:3rem">🎲</div><b>No questions to shuffle!</b><p>Add questions to start the random dash.</p></div>`;
      note('No questions available for Random Question.', 'info');
      done();
      return;
    }

    const deck = shuffle(questions);
    let idx = 0;
    let streak = 0;
    let best = 0;
    let right = 0;
    let locked = false;

    const score = (q, correct, response) => {
      if (seen.has(q)) return;
      seen.add(q);
      record({ questionId: q.id, correct: !!correct, response, points: correct ? maxP(q) : 0, maxPoints: maxP(q), explanation: q.explanation || '' });
    };

    function paint() {
      const q = deck[idx];
      const correctText = String(choicesOf(q).find((c) => c.is_correct)?.text ?? q.metadata?.answer ?? '');
      const choices = shuffle(choicesOf(q));
      locked = false;

      app.innerHTML = `
        <header class="rnd-head"><span class="rnd-badge">🎲 Random Question</span><span class="rnd-streak">🔥 Streak ${streak} · Best ${best} · ✅ ${right}</span></header>
        <section class="rnd-card">
          <div class="rnd-tag">Question ${idx + 1} / ${deck.length}</div>
          <p class="rnd-prompt">${E(q.prompt || 'Answer the question.')}</p>
          ${choices.length ? `<div class="rnd-choices">${choices.map((c, i) => `<button class="rnd-choice" type="button" data-i="${i}">${String.fromCharCode(65 + i)}. ${E(c.text)}</button>`).join('')}</div>` : `<form class="rnd-form"><input class="rnd-input" id="rnd-answer" autocomplete="off" placeholder="Type your answer..."><button class="rnd-btn" type="submit">Answer ✅</button></form>`}
          <div class="rnd-toolbar"><span class="rnd-tag">Skip counts as incorrect</span><button class="rnd-btn rnd-skip" type="button" id="rnd-skip">Skip ⏭️</button></div>
          <div id="rnd-feedback" aria-live="polite"></div>
        </section>`;

      const resolve = (response, ok) => {
        if (locked) return;
        locked = true;
        if (ok) { streak++; best = Math.max(best, streak); right++; } else streak = 0;
        score(q, ok, response);
        sound(ok);
        say(ok ? 'Correct!' : `The answer was ${correctText}.`);
        app.querySelectorAll('.rnd-choice, .rnd-btn, .rnd-input').forEach((b) => { b.disabled = true; });
        const fb = app.querySelector('#rnd-feedback');
        fb.className = `rnd-feedback ${ok ? 'rnd-ok' : 'rnd-no'}`;
        fb.innerHTML = ok
          ? `🎉 Correct!${q.explanation ? `<br>${E(q.explanation)}` : ''}`
          : `❌ ${response === '__skipped__' ? 'Skipped.' : 'Not quite.'} Answer: <b>${E(correctText)}</b>${q.explanation ? `<br>${E(q.explanation)}` : ''}`;
        fb.innerHTML += `<div class="rnd-next"><button type="button">${idx === deck.length - 1 ? 'See results 🏁' : 'Next question →'}</button></div>`;
        fb.querySelector('.rnd-next button').addEventListener('click', () => {
          if (idx === deck.length - 1) done();
          else { idx++; paint(); }
        });
      };

      app.querySelectorAll('.rnd-choice').forEach((b) => b.addEventListener('click', () => {
        const c = choices[Number(b.dataset.i)];
        resolve(c.text, c.is_correct || norm(c.text) === norm(correctText));
      }));

      app.querySelector('.rnd-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const val = app.querySelector('#rnd-answer').value.trim();
        const a = norm(val), b = norm(correctText);
        resolve(val, !!a && !!b && (a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))));
      });

      app.querySelector('#rnd-skip').addEventListener('click', () => resolve('__skipped__', false));
    }

    paint();
  }
};
