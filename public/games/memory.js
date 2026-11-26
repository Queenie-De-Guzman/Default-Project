// EduPlay – Memory game module: flip cards to find matching left/right pairs.
import { choicesOf, shuffle } from '../ui.js';

export default {
  meta: {
    type: 'memory',
    title: 'Memory Match',
    icon: '🃏',
    blurb: 'Flip two cards at a time to find each matching pair. Track your moves and clear the whole board.',
    editorFields: [
      { key: 'left', label: 'First card text', type: 'text', placeholder: 'e.g. Photosynthesis' },
      { key: 'right', label: 'Matching card text', type: 'text', placeholder: 'e.g. Making food in plants' }
    ],
    recommendedFor: ['English', 'Science', 'Vocabulary']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .mem-wrap{--mem-blue:#1e3a8a;--mem-gold:#f59e0b;font-family:inherit;color:#172554;padding:4px 2px 12px}
      .mem-wrap *{box-sizing:border-box}
      .mem-head{display:flex;flex-wrap:wrap;gap:9px;align-items:center;justify-content:space-between;margin-bottom:12px}
      .mem-kicker{font-size:.7rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#2563eb}
      .mem-head h2{margin:2px 0 0;font-size:clamp(1.1rem,4vw,1.5rem)}
      .mem-stats{display:flex;gap:7px;flex-wrap:wrap}
      .mem-stat{background:#dbeafe;border:1px solid #bfdbfe;color:#1e40af;border-radius:999px;padding:7px 12px;font-size:.8rem;font-weight:800}
      .mem-stat strong{font-size:1rem}
      .mem-tip{margin:0 0 12px;color:#1d4ed8;font-size:.83rem}
      .mem-board{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,80px),1fr));gap:8px}
      .mem-card{position:relative;width:100%;aspect-ratio:1/1;padding:0;border:0;background:transparent;cursor:pointer;perspective:700px;touch-action:manipulation}
      .mem-card:focus-visible{outline:3px solid #fbbf24;outline-offset:2px;border-radius:14px}
      .mem-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transform:rotateY(180deg);transition:transform .45s cubic-bezier(.2,.8,.3,1)}
      .mem-card.is-open .mem-inner,.mem-card.is-matched .mem-inner{transform:rotateY(0)}
      .mem-face{position:absolute;inset:0;display:grid;place-items:center;padding:5px;border-radius:13px;backface-visibility:hidden;
        -webkit-backface-visibility:hidden;text-align:center;overflow-wrap:anywhere;font-size:clamp(.68rem,2.7vw,.88rem);font-weight:800;line-height:1.2}
      .mem-cover{transform:rotateY(180deg);background:linear-gradient(150deg,#1d4ed8,#6d28d9);color:#fde68a;
        border:3px solid #93c5fd;box-shadow:0 4px 0 #1e3a8a;font-size:1.5rem}
      .mem-value{background:linear-gradient(150deg,#fffbeb,#fef3c7);color:#1e3a8a;border:3px solid #fbbf24;box-shadow:0 4px 0 #d97706}
      .mem-card:hover:not(.is-open):not(.is-matched) .mem-cover{filter:brightness(1.13)}
      .mem-card.is-matched .mem-value{background:linear-gradient(150deg,#dcfce7,#bbf7d0);border-color:#22c55e;box-shadow:0 4px 0 #16a34a;color:#14532d}
      .mem-card.is-wrong .mem-value{border-color:#f43f5e;background:#ffe4e6;box-shadow:0 4px 0 #e11d48}
      .mem-foot{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:15px}
      .mem-btn{border:0;border-radius:12px;padding:11px 16px;background:#dbeafe;color:#1e40af;font:inherit;font-weight:800;font-size:.85rem;
        cursor:pointer;box-shadow:0 3px 0 #93c5fd;touch-action:manipulation}
      .mem-btn:hover:not(:disabled){filter:brightness(1.05)}
      .mem-btn:disabled{opacity:.5;cursor:default}
      .mem-btn--main{background:#1e40af;color:#fff;box-shadow:0 3px 0 #172554}
      .mem-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#eff6ff,#dbeafe);border:2px dashed #93c5fd}
      .mem-empty-icon{font-size:2.6rem}.mem-empty h2{margin:8px 0;font-size:1.2rem;color:#1e40af}.mem-empty p{margin:0;color:#1e3a8a;font-size:.9rem;line-height:1.5}
      @media(max-width:480px){.mem-board{gap:6px}.mem-face{border-width:2px;border-radius:10px}.mem-cover{font-size:1.2rem}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="mem-wrap"><div class="mem-empty">
        <div class="mem-empty-icon">🃏</div><h2>No cards to flip</h2>
        <p>Add questions with left and right items (or prompts and answers) to build a memory board.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const items = [];
    questions.forEach((q, i) => {
      const m = q.metadata || {};
      const correct = choicesOf(q).find((c) => c.is_correct);
      const id = q.id ?? `memory-${i + 1}`;
      items.push({ id, q, text: String(m.left ?? q.prompt ?? `Card ${i + 1}`) });
      items.push({ id, q, text: String(m.right ?? correct?.text ?? m.answer ?? `Match ${i + 1}`) });
    });
    const deck = shuffle(items);

    const graded = new Set();
    const matched = new Set();
    let opened = [];
    let moves = 0;
    let lock = false;
    let finished = false;
    let flipTimer;

    const maxPoints = (q) => Number(q.points ?? ctx.game?.points_per_question ?? 1) || 1;

    function grade(question, correct, response) {
      if (graded.has(question)) return;
      graded.add(question);
      const max = maxPoints(question);
      ctx.record({
        questionId: question.id ?? `memory-${questions.indexOf(question) + 1}`,
        correct: !!correct,
        response,
        points: correct ? max : 0,
        maxPoints: max,
        explanation: question.explanation || ''
      });
    }

    function finishOnce() {
      if (finished) return;
      finished = true;
      clearTimeout(flipTimer);
      const btn = ctx.root.querySelector('.mem-btn--main');
      if (btn) btn.disabled = true;
      ctx.finish();
    }

    function updateStats() {
      const el = ctx.root.querySelector('.mem-moves');
      if (el) el.textContent = String(moves);
      const done = ctx.root.querySelector('.mem-pairs');
      if (done) done.textContent = `${matched.size} / ${questions.length}`;
    }

    function markDone(cardEls) {
      cardEls.forEach((el) => { el.classList.add('is-matched'); el.classList.remove('is-open', 'is-wrong'); });
    }

    function checkComplete() {
      if (matched.size === questions.length) {
        ctx.ui.sound(true);
        ctx.notify('Board cleared — excellent memory!', 'success');
        finishOnce();
      }
    }

    function flip(index) {
      if (lock || finished) return;
      const item = deck[index];
      const cardEls = ctx.root.querySelectorAll('.mem-card');
      if (matched.has(item.id) || opened.includes(index) || cardEls[index].classList.contains('is-open')) return;
      opened.push(index);
      cardEls[index].classList.add('is-open');
      if (opened.length < 2) return;

      moves += 1;
      updateStats();
      lock = true;
      const [a, b] = opened;
      const first = deck[a];
      const second = deck[b];
      const els = [cardEls[a], cardEls[b]];

      if (first.id === second.id) {
        matched.add(first.id);
        grade(first.q, true, { moves, pair: [first.text, second.text] });
        ctx.ui.sound(true);
        flipTimer = setTimeout(() => {
          markDone(els);
          opened = [];
          lock = false;
          checkComplete();
        }, 420);
      } else {
        grade(first.q, false, { moves, flippedWith: second.text });
        grade(second.q, false, { moves, flippedWith: first.text });
        ctx.ui.sound(false);
        ctx.notify('No match — remember those cards!', 'error');
        els.forEach((el) => el.classList.add('is-wrong'));
        flipTimer = setTimeout(() => {
          els.forEach((el) => { el.classList.remove('is-open', 'is-wrong'); });
          opened = [];
          lock = false;
        }, 900);
      }
    }

    ctx.root.innerHTML = `${css}<div class="mem-wrap">
      <div class="mem-head"><div><span class="mem-kicker">🃏 Memory match</span>
        <h2>${E(ctx.game?.title || 'Find the pairs')}</h2></div>
        <div class="mem-stats"><span class="mem-stat">Moves <strong class="mem-moves">0</strong></span>
          <span class="mem-stat">Pairs <strong class="mem-pairs">0 / ${questions.length}</strong></span></div></div>
      <p class="mem-tip">Tap two cards to flip them. Find the two cards that belong together.</p>
      <div class="mem-board">
        ${deck.map((item, i) => `<button type="button" class="mem-card" data-i="${i}" aria-label="Card ${i + 1}">
          <span class="mem-inner"><span class="mem-face mem-cover" aria-hidden="true">✦</span>
          <span class="mem-face mem-value">${E(item.text)}</span></span></button>`).join('')}
      </div>
      <div class="mem-foot"><button type="button" class="mem-btn mem-btn--main">Finish game</button></div>
    </div>`;

    ctx.root.querySelectorAll('.mem-card').forEach((el) => {
      el.addEventListener('click', () => flip(Number(el.dataset.i)));
    });
    ctx.root.querySelector('.mem-btn--main').addEventListener('click', () => {
      questions.forEach((q) => {
        if (!graded.has(q)) grade(q, false, { skipped: true });
      });
      finishOnce();
    });
  }
};
