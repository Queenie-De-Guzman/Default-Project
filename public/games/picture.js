import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'picture',
    title: 'Picture Puzzle',
    icon: '🖼️',
    blurb: 'Show a mystery picture, reveal hints one at a time, then type the answer.',
    editorFields: [
      { key: 'emoji', label: 'Illustration emoji (used when there is no image)', type: 'text', placeholder: 'e.g. 🐝' },
      { key: 'clue1', label: 'Clue 1', type: 'text', placeholder: 'A gentle first hint' },
      { key: 'clue2', label: 'Clue 2', type: 'text', placeholder: 'A stronger second hint' }
    ],
    recommendedFor: ['English', 'Science', 'Geography']
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
      .pic-app{font-family:inherit;max-width:760px;margin:0 auto;color:#26304a}
      .pic-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .pic-badge{background:linear-gradient(135deg,#ff8a5b,#ff5f8d);color:#fff;padding:8px 14px;border-radius:999px;font-weight:800;box-shadow:0 4px 12px #ff8a5b55}
      .pic-progress{font-size:.9rem;font-weight:700;color:#6b7590}
      .pic-card{background:#fff;border-radius:20px;padding:16px;box-shadow:0 10px 30px #26304a18;border:2px solid #ffe0d2}
      .pic-stage{position:relative;border-radius:16px;background:linear-gradient(160deg,#fff4e8,#ffe3ea);min-height:210px;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .pic-image{width:100%;max-height:320px;object-fit:contain;display:block}
      .pic-emoji{font-size:clamp(5rem,18vw,9rem);line-height:1;filter:drop-shadow(0 8px 8px #0002);animation:picPop .45s ease}
      @keyframes picPop{from{transform:scale(.5) rotate(-8deg);opacity:0}to{transform:none;opacity:1}}
      .pic-stage-tag{position:absolute;left:10px;top:10px;background:#ffffffcc;border-radius:999px;padding:4px 10px;font-size:.75rem;font-weight:800;color:#c44f6d}
      .pic-clues{margin:12px 0;display:grid;gap:8px}
      .pic-clue{background:#fff8e1;border-left:4px solid #ffb300;padding:10px 12px;border-radius:10px;font-weight:600;animation:picSlide .3s ease}
      @keyframes picSlide{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
      .pic-clue-actions{display:flex;gap:8px;flex-wrap:wrap}
      .pic-btn{border:0;border-radius:12px;padding:12px 16px;font-size:1rem;font-weight:800;cursor:pointer;min-height:44px;touch-action:manipulation}
      .pic-hint{background:#fff3cd;color:#8a5a00;border:2px solid #ffd968}
      .pic-hint:disabled{opacity:.45;cursor:not-allowed}
      .pic-form{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
      .pic-input{flex:1 1 190px;min-width:0;padding:12px 14px;font-size:1rem;border:2px solid #ffd0bd;border-radius:12px;outline:none}
      .pic-input:focus{border-color:#ff7a59;box-shadow:0 0 0 3px #ff7a5933}
      .pic-submit{background:linear-gradient(135deg,#ff7a59,#f4516c);color:#fff;box-shadow:0 4px 12px #f4516c55}
      .pic-feedback{margin-top:12px;min-height:24px;font-weight:700}
      .pic-ok{color:#16855b}.pic-no{color:#c0392b}
      .pic-next{margin-top:12px;display:flex;justify-content:flex-end}
      .pic-empty{text-align:center;padding:40px 16px;background:#fff;border-radius:20px;border:2px dashed #ffc9b6;color:#6b7590}
      @media(max-width:420px){.pic-card{padding:12px}.pic-btn{padding:10px 12px}}
    </style>`;

    root.innerHTML = `${style}<div class="pic-app"></div>`;
    const app = root.querySelector('.pic-app');

    if (!questions.length) {
      app.innerHTML = `<div class="pic-empty"><div style="font-size:3rem">🖼️</div><b>No pictures yet!</b><p>Add questions with answers to play Picture Puzzle.</p></div>`;
      note('No questions available for Picture Puzzle.', 'info');
      done();
      return;
    }

    const score = (q, correct, response) => {
      if (seen.has(q)) return;
      seen.add(q);
      record({
        questionId: q.id,
        correct: !!correct,
        response,
        points: correct ? maxP(q) : 0,
        maxPoints: maxP(q),
        explanation: q.explanation || ''
      });
    };

    let idx = 0;
    let right = 0;
    let locked = false;
    let hints = 0;

    function paint() {
      const q = questions[idx];
      const m = q.metadata || {};
      const media = q.media_url || m.image_url || '';
      const correct = choicesOf(q).find((c) => c.is_correct)?.text ?? m.answer ?? '';
      locked = false;
      hints = 0;

      app.innerHTML = `
        <header class="pic-head">
          <span class="pic-badge">🖼️ Picture Puzzle</span>
          <span class="pic-progress">Picture ${idx + 1} / ${questions.length} · ✅ ${right}</span>
        </header>
        <section class="pic-card">
          <div class="pic-stage">
            ${media ? `<img class="pic-image" src="${E(media)}" alt="Mystery picture">` : `<div class="pic-emoji">${E(m.emoji || '🔍')}</div>`}
            <span class="pic-stage-tag">Can you guess me?</span>
          </div>
          <div class="pic-clues" id="pic-clues"></div>
          <div class="pic-clue-actions">
            <button class="pic-btn pic-hint" type="button" data-hint="1">💡 Clue 1</button>
            <button class="pic-btn pic-hint" type="button" data-hint="2">💡 Clue 2</button>
          </div>
          <form class="pic-form" id="pic-form">
            <input class="pic-input" id="pic-answer" placeholder="Type your guess..." autocomplete="off" aria-label="Your answer">
            <button class="pic-btn pic-submit" type="submit">Check ✅</button>
          </form>
          <div class="pic-feedback" id="pic-feedback" aria-live="polite"></div>
          <div class="pic-next" id="pic-next"></div>
        </section>`;

      const clues = app.querySelector('#pic-clues');
      const refreshClues = () => {
        clues.innerHTML = [1, 2].filter((n) => hints >= n).map((n) => `<div class="pic-clue">🔎 ${E(m['clue' + n] || (n === 1 ? 'Look closely at the picture.' : 'Think about what it is used for.'))}</div>`).join('');
        app.querySelectorAll('.pic-hint').forEach((b) => { b.disabled = locked || Number(b.dataset.hint) <= hints; });
      };
      refreshClues();

      app.querySelectorAll('.pic-hint').forEach((b) => b.addEventListener('click', () => {
        if (locked) return;
        hints = Math.max(hints, Number(b.dataset.hint));
        sound(true);
        refreshClues();
      }));

      app.querySelector('#pic-form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (locked) return;
        locked = true;
        const input = app.querySelector('#pic-answer');
        const typed = input.value.trim();
        const a = norm(typed);
        const b = norm(correct);
        const ok = !!a && !!b && (a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b)));
        score(q, ok, typed);
        if (ok) right++;
        sound(ok);
        say(ok ? 'Correct!' : `The answer was ${correct}`);
        input.disabled = true;
        refreshClues();
        const fb = app.querySelector('#pic-feedback');
        fb.className = `pic-feedback ${ok ? 'pic-ok' : 'pic-no'}`;
        fb.innerHTML = ok
          ? `🎉 Correct — it was <b>${E(correct)}</b>!`
          : `💭 Not quite. The answer was <b>${E(correct)}</b>.${q.explanation ? `<br>${E(q.explanation)}` : ''}`;
        const next = app.querySelector('#pic-next');
        next.innerHTML = `<button class="pic-btn pic-submit" type="button">${idx === questions.length - 1 ? 'See results 🏁' : 'Next picture →'}</button>`;
        next.querySelector('button').addEventListener('click', () => {
          if (idx === questions.length - 1) done();
          else { idx++; paint(); }
        });
      });
    }

    paint();
  }
};
