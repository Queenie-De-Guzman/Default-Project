// EduPlay – Scramble game module: rebuild the answer from shuffled letter tiles.
import { choicesOf, shuffle } from '../ui.js';

export default {
  meta: {
    type: 'scramble',
    title: 'Letter Scramble',
    icon: '🔤',
    blurb: 'Unscramble the letter tiles to spell the correct answer. Tap tiles to place them, use backspace, then check your word.',
    editorFields: [
      { key: 'answer', label: 'Correct answer', type: 'text', placeholder: 'e.g. photosynthesis' },
      { key: 'hint', label: 'Hint (optional)', type: 'text', placeholder: 'e.g. It has 14 letters' }
    ],
    recommendedFor: ['English', 'Science', 'Spelling']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .sc-wrap{--sc-purple:#7c3aed;--sc-pink:#db2777;--sc-ink:#3b0764;font-family:inherit;color:var(--sc-ink);padding:4px 2px 12px}
      .sc-wrap *{box-sizing:border-box}
      .sc-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .sc-kicker{font-size:.7rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--sc-pink)}
      .sc-progress{font-size:.8rem;font-weight:800;color:var(--sc-purple);background:#fdf2f8;border:1px solid #fbcfe8;border-radius:999px;padding:6px 12px}
      .sc-track{height:8px;border-radius:99px;background:#f3e8ff;overflow:hidden;margin-bottom:14px}
      .sc-track-fill{height:100%;background:linear-gradient(90deg,var(--sc-purple),var(--sc-pink));transition:width .35s}
      .sc-prompt{margin:0 0 14px;padding:15px 16px;border-radius:18px;font-size:clamp(1rem,3.6vw,1.25rem);line-height:1.4;font-weight:700;
        background:linear-gradient(135deg,#faf5ff,#fdf2f8);border:1px solid #f0abfc;box-shadow:inset 4px 0 0 var(--sc-pink);overflow-wrap:anywhere}
      .sc-say{margin-left:6px;border:0;background:transparent;font-size:1.05rem;cursor:pointer;vertical-align:middle}
      .sc-slots{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:70px;padding:12px;margin-bottom:16px;border-radius:18px;
        border:2px dashed #d8b4fe;background:#fdf4ff}
      .sc-placeholder{font-size:.85rem;color:#a21caf;opacity:.7;font-style:italic}
      .sc-tile{width:clamp(38px,10vw,50px);height:clamp(44px,11vw,56px);flex:none;border:0;border-radius:12px;
        background:linear-gradient(160deg,#a855f7,#db2777);color:#fff;font:inherit;font-size:1.35rem;font-weight:900;
        cursor:pointer;box-shadow:0 4px 0 #6b21a8,0 6px 10px rgba(0,0,0,.14);transition:transform .12s,box-shadow .12s;touch-action:manipulation}
      .sc-tile:hover{transform:translateY(-2px);box-shadow:0 6px 0 #6b21a8,0 9px 14px rgba(0,0,0,.16)}
      .sc-tile:active{transform:translateY(3px);box-shadow:0 1px 0 #6b21a8}
      .sc-tile:focus-visible{outline:3px solid #f9a8d4;outline-offset:2px}
      .sc-tile--placed{background:linear-gradient(160deg,#0ea5e9,#4f46e5);box-shadow:0 4px 0 #312e81}
      .sc-tile--placed:hover{box-shadow:0 6px 0 #312e81}
      .sc-bank{display:flex;flex-wrap:wrap;gap:7px;min-height:56px;padding:10px;border-radius:16px;background:#ede9fe;border:1px solid #ddd6fe}
      .sc-bank .sc-tile{background:linear-gradient(160deg,#c084fc,#7c3aed);box-shadow:0 4px 0 #5b21b6}
      .sc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
      .sc-btn{border:0;border-radius:12px;padding:11px 15px;font:inherit;font-weight:800;font-size:.87rem;cursor:pointer;touch-action:manipulation;
        background:#f3e8ff;color:#6b21a8;box-shadow:0 3px 0 #d8b4fe}
      .sc-btn:hover:not(:disabled){filter:brightness(1.05)}
      .sc-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #d8b4fe}
      .sc-btn:disabled{opacity:.45;cursor:default}
      .sc-btn--check{margin-left:auto;background:linear-gradient(135deg,#db2777,#7c3aed);color:#fff;box-shadow:0 4px 0 #4c1d95;padding-inline:22px}
      .sc-input{width:100%;max-width:320px;padding:12px 14px;border:2px solid #d8b4fe;border-radius:12px;font:inherit;font-size:1.05rem;color:#3b0764}
      .sc-feedback{margin-top:14px;border-radius:16px;padding:13px 15px;font-size:.9rem;line-height:1.5;display:none;overflow-wrap:anywhere}
      .sc-feedback--show{display:block;animation:sc-pop .25s ease}
      .sc-feedback--ok{background:#d1fae5;border:1px solid #6ee7b7;color:#065f46}
      .sc-feedback--bad{background:#ffe4e6;border:1px solid #fda4af;color:#9f1239}
      .sc-feedback strong{display:block;margin-bottom:4px;font-size:1rem}
      .sc-feedback code{display:inline-block;margin-top:5px;padding:4px 9px;border-radius:8px;background:rgba(255,255,255,.7);font-size:1rem;font-weight:800;letter-spacing:.06em}
      .sc-next{display:inline-block;margin-top:10px;border:0;border-radius:11px;padding:10px 16px;background:#4c1d95;color:#fff;font:inherit;font-weight:800;cursor:pointer}
      .sc-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#fdf4ff,#fae8ff);border:2px dashed #e9d5ff}
      .sc-empty-icon{font-size:2.6rem}.sc-empty h2{margin:8px 0;font-size:1.2rem;color:#86198f}.sc-empty p{margin:0;color:#701a75;font-size:.9rem;line-height:1.5}
      @keyframes sc-pop{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}
      @media(max-width:480px){.sc-tile{width:36px;height:44px;font-size:1.15rem}.sc-btn{padding:10px 12px;font-size:.8rem}.sc-btn--check{padding-inline:14px}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="sc-wrap"><div class="sc-empty">
        <div class="sc-empty-icon">🔤</div><h2>Nothing to unscramble</h2>
        <p>Add questions with a correct answer and the letter tiles will appear here.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const rounds = questions.map((q, i) => {
      const m = q.metadata || {};
      const correct = choicesOf(q).find((c) => c.is_correct);
      const answer = String(correct?.text ?? m.answer ?? m.word ?? m.correct ?? q.prompt ?? '');
      const raw = Array.from(answer).filter((ch) => /[\p{L}\p{N}]/u.test(ch));
      return {
        q,
        id: q.id ?? `scramble-${i + 1}`,
        answer,
        letters: raw.map((ch, k) => ({ k, ch })),
        hint: String(m.hint || '')
      };
    });

    const graded = new Set();
    let index = 0;
    let placed = [];
    let bank = [];
    let locked = false;
    let finished = false;

    const maxPoints = (q) => Number(q.points ?? ctx.game?.points_per_question ?? 1) || 1;

    function grade(round, correct, response) {
      if (graded.has(round.id)) return;
      graded.add(round.id);
      const max = maxPoints(round.q);
      ctx.record({
        questionId: round.q.id ?? round.id,
        correct: !!correct,
        response,
        points: correct ? max : 0,
        maxPoints: max,
        explanation: round.q.explanation || ''
      });
    }

    function finishOnce() {
      if (finished) return;
      finished = true;
      ctx.finish();
    }

    function tile(t, where) {
      return `<button type="button" class="sc-tile ${where === 'placed' ? 'sc-tile--placed' : ''}"
        data-tile="${t.k}" data-where="${where}" aria-label="${where === 'placed' ? 'Remove letter' : 'Place letter'} ${E(t.ch)}" ${locked ? 'disabled' : ''}>${E(t.ch)}</button>`;
    }

    function draw() {
      const round = rounds[index];
      const slots = ctx.root.querySelector('.sc-slots');
      const bankEl = ctx.root.querySelector('.sc-bank');
      const check = ctx.root.querySelector('.sc-btn--check');
      const back = ctx.root.querySelector('.sc-btn--back');
      const clear = ctx.root.querySelector('.sc-btn--clear');
      const hint = ctx.root.querySelector('.sc-btn--hint');
      const input = ctx.root.querySelector('.sc-input');
      if (!slots || !bankEl) return;
      if (input) input.value = placed.map((t) => t.ch).join('');
      slots.innerHTML = placed.length
        ? placed.map((t) => tile(t, 'placed')).join('')
        : '<span class="sc-placeholder">Tap the tiles below to build the answer</span>';
      bankEl.innerHTML = bank.map((t) => tile(t, 'bank')).join('') || '<span class="sc-placeholder">No tiles left</span>';
      const canEdit = !locked && (placed.length > 0 || bank.length > 0);
      if (back) back.disabled = !canEdit;
      if (clear) clear.disabled = !canEdit;
      if (check) check.disabled = locked || (!placed.length && !bank.length);
      if (hint) hint.disabled = locked;
    }

    function feedback(ok, round) {
      const el = ctx.root.querySelector('.sc-feedback');
      if (!el) return;
      el.className = `sc-feedback sc-feedback--show ${ok ? 'sc-feedback--ok' : 'sc-feedback--bad'}`;
      el.innerHTML = `<strong>${ok ? '✓ Correct!' : 'Not quite — here is the answer'}</strong>
        ${round.q.explanation ? `<div>${E(round.q.explanation)}</div>` : ''}
        <code>${E(round.answer)}</code>
        ${ok ? '' : '<br><button type="button" class="sc-btn sc-btn--retry" style="margin-top:9px">Try again</button>'}
        <br><button type="button" class="sc-next">${index === rounds.length - 1 ? 'See results' : 'Next puzzle →'}</button>`;
      el.querySelector('.sc-next')?.addEventListener('click', () => {
        index += 1;
        if (index >= rounds.length) finishOnce();
        else load();
      });
      el.querySelector('.sc-btn--retry')?.addEventListener('click', () => {
        placed = [];
        bank = shuffle(round.letters);
        locked = false;
        el.className = 'sc-feedback';
        el.innerHTML = '';
        draw();
      });
    }

    function checkAnswer() {
      const round = rounds[index];
      if (locked) return;
      const typed = ctx.root.querySelector('.sc-input')?.value ?? '';
      const built = placed.length ? placed.map((t) => t.ch).join('') : typed;
      const ok = ctx.ui.norm(built) === ctx.ui.norm(round.answer) && ctx.ui.norm(built).length > 0;
      locked = true;
      grade(round, ok, built);
      ctx.ui.sound(ok);
      if (!ok) ctx.notify('Check the letters again — the answer is shown below.', 'error');
      draw();
      feedback(ok, round);
    }

    function load() {
      const round = rounds[index];
      placed = [];
      bank = shuffle(round.letters);
      locked = false;
      const hasTiles = round.letters.length > 0;
      ctx.root.innerHTML = `${css}<div class="sc-wrap">
        <div class="sc-top"><span class="sc-kicker">🔤 Letter scramble</span>
          <span class="sc-progress">Puzzle ${index + 1} of ${rounds.length}</span></div>
        <div class="sc-track"><div class="sc-track-fill" style="width:${((index) / rounds.length) * 100}%"></div></div>
        <h2 class="sc-prompt">${E(round.q.prompt || 'Unscramble the answer')}
          <button type="button" class="sc-say" aria-label="Read prompt aloud">🔊</button></h2>
        <div class="sc-slots"></div>
        ${hasTiles ? '' : '<label class="sc-kicker" for="sc-text-answer">Type the answer</label><input class="sc-input" id="sc-text-answer" type="text" autocomplete="off" spellcheck="false" placeholder="Your answer">' + '<div style="height:10px"></div>'}
        <div class="sc-bank"></div>
        <div class="sc-actions">
          <button type="button" class="sc-btn sc-btn--back">⌫ Backspace</button>
          <button type="button" class="sc-btn sc-btn--clear">Clear</button>
          <button type="button" class="sc-btn sc-btn--hint">💡 Hint</button>
          <button type="button" class="sc-btn sc-btn--check">Check ✓</button>
        </div>
        <div class="sc-feedback"></div>
      </div>`;

      ctx.root.querySelector('.sc-say').addEventListener('click', () => ctx.speak(String(round.q.prompt || '')));
      ctx.root.querySelector('.sc-input')?.addEventListener('input', (e) => {
        placed = Array.from(e.target.value).filter((ch) => /[\p{L}\p{N}]/u.test(ch)).map((ch, k) => ({ k: -k - 1, ch }));
        bank = [];
        draw();
      });
      ctx.root.querySelector('.sc-btn--back').addEventListener('click', () => {
        if (locked || !placed.length) return;
        bank.push(placed.pop());
        bank = shuffle(bank);
        draw();
      });
      ctx.root.querySelector('.sc-btn--clear').addEventListener('click', () => {
        if (locked) return;
        bank = shuffle([...placed, ...bank]);
        placed = [];
        draw();
      });
      ctx.root.querySelector('.sc-btn--hint').addEventListener('click', () => {
        ctx.notify(round.hint || `The answer has ${round.letters.length} letters: ${round.answer[0] || '?'}…`, 'info');
      });
      ctx.root.querySelector('.sc-btn--check').addEventListener('click', checkAnswer);
      draw();
    }

    // Delegated handlers live on the persistent root so they are attached only once.
    ctx.root.addEventListener('click', (e) => {
      const t = e.target.closest('.sc-tile');
      if (!t || t.disabled) return;
      const k = Number(t.dataset.tile);
      if (t.dataset.where === 'bank') {
        const at = bank.findIndex((x) => x.k === k);
        if (at >= 0) placed.push(bank.splice(at, 1)[0]);
      } else {
        const at = placed.findIndex((x) => x.k === k);
        if (at >= 0) bank.push(placed.splice(at, 1)[0]);
      }
      draw();
    });

    ctx.root.addEventListener('keydown', (e) => {
      if (locked || e.key !== 'Backspace') return;
      if (e.target.matches('input, textarea')) return;
      if (!placed.length) return;
      e.preventDefault();
      bank.push(placed.pop());
      bank = shuffle(bank);
      draw();
    });

    load();
  }
};
