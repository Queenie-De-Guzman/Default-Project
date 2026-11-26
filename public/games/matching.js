// EduPlay – Matching Pairs game module.
import { choicesOf, shuffle } from '../ui.js';

export default {
  meta: {
    type: 'matching',
    title: 'Matching Pairs',
    icon: '🧩',
    blurb: 'Connect each item on the left with its partner on the right. Drag a card across or tap one card from each column. Wrong guesses can be retried.',
    editorFields: [
      { key: 'left', label: 'Left item', type: 'text', placeholder: 'e.g. Photosynthesis' },
      { key: 'right', label: 'Right item', type: 'text', placeholder: 'e.g. Making food in plants' },
      { key: 'image', label: 'Image URL (optional)', type: 'text' }
    ],
    recommendedFor: ['English', 'Science', 'Social Studies']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .mtg-wrap{--mtg-purple:#6d28d9;--mtg-violet:#8b5cf6;--mtg-ink:#2e1065;--mtg-mint:#10b981;--mtg-rose:#f43f5e;
        font-family:inherit;color:var(--mtg-ink);padding:4px 2px 10px;}
      .mtg-wrap *{box-sizing:border-box}
      .mtg-head{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;justify-content:space-between;margin-bottom:8px}
      .mtg-kicker{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--mtg-violet)}
      .mtg-head h2{margin:2px 0 0;font-size:clamp(1.15rem,4vw,1.6rem);line-height:1.2}
      .mtg-counter{background:#ede9fe;border:1px solid #ddd6fe;border-radius:999px;padding:7px 14px;font-size:.85rem;font-weight:700;white-space:nowrap}
      .mtg-counter strong{color:var(--mtg-purple);font-size:1.05rem}
      .mtg-tip{margin:0 0 14px;color:#6d28d9;opacity:.8;font-size:.85rem}
      .mtg-board{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr);gap:8px;align-items:start}
      .mtg-col{min-width:0}
      .mtg-col h3{margin:0 0 8px;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#7c3aed;text-align:center}
      .mtg-mid{align-self:center;text-align:center;font-size:1.4rem;color:#a78bfa;font-weight:900}
      .mtg-list{display:flex;flex-direction:column;gap:9px;min-height:60px}
      .mtg-card{position:relative;display:flex;align-items:center;gap:8px;width:100%;min-height:64px;padding:10px 30px 10px 12px;
        border:2px solid #ddd6fe;border-radius:15px;background:linear-gradient(145deg,#fff,#f5f3ff);color:#3b0764;
        font:inherit;font-size:.9rem;font-weight:650;line-height:1.3;text-align:left;cursor:grab;touch-action:manipulation;
        box-shadow:0 3px 0 #ede9fe;transition:transform .14s,box-shadow .14s,border-color .14s,background .14s}
      .mtg-card:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 12px rgba(109,40,217,.16)}
      .mtg-card:focus-visible{outline:3px solid #a78bfa;outline-offset:2px}
      .mtg-card--sel{border-color:var(--mtg-purple);background:#ede9fe;box-shadow:0 0 0 4px rgba(139,92,246,.2)}
      .mtg-over{border-color:var(--mtg-mint);background:#d1fae5}
      .mtg-dragging{opacity:.45}
      .mtg-card--done{border-color:#6ee7b7;background:linear-gradient(145deg,#ecfdf5,#d1fae5);box-shadow:0 3px 0 #a7f3d0;cursor:default;opacity:.92}
      .mtg-badge{position:absolute;top:6px;right:7px;min-width:22px;height:22px;border-radius:50%;background:var(--mtg-mint);color:#fff;
        display:grid;place-items:center;font-size:.72rem;font-weight:900;box-shadow:0 1px 4px rgba(0,0,0,.15)}
      .mtg-thumb{width:30px;height:30px;object-fit:cover;border-radius:8px;flex:none;background:#ede9fe}
      .mtg-text{min-width:0;overflow-wrap:anywhere}
      .mtg-card--bad{border-color:var(--mtg-rose);animation:mtg-shake .4s ease}
      @keyframes mtg-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}50%{transform:translateX(6px)}75%{transform:translateX(-3px)}}
      .mtg-links{margin-top:16px;padding:12px;border:1px dashed #c4b5fd;border-radius:16px;background:#faf5ff;min-height:52px}
      .mtg-links h4{margin:0 0 8px;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#7c3aed}
      .mtg-link-list{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
      .mtg-link{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:6px 10px;border-radius:999px;background:#d1fae5;
        color:#065f46;font-size:.78rem;font-weight:700;overflow-wrap:anywhere}
      .mtg-link b{display:inline-grid;place-items:center;width:19px;height:19px;flex:none;border-radius:50%;background:#059669;color:#fff;font-size:.68rem}
      .mtg-empty-note{color:#6b7280;font-size:.85rem}
      .mtg-foot{display:flex;justify-content:flex-end;margin-top:12px}
      .mtg-finish{border:0;border-radius:12px;padding:11px 18px;background:var(--mtg-purple);color:#fff;font:inherit;font-weight:800;
        cursor:pointer;box-shadow:0 4px 0 #4c1d95;touch-action:manipulation}
      .mtg-finish:hover:not(:disabled){filter:brightness(1.08)}
      .mtg-finish:disabled{opacity:.5;cursor:default}
      .mtg-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;
        background:linear-gradient(145deg,#f5f3ff,#ede9fe);border:2px dashed #c4b5fd}
      .mtg-empty-icon{font-size:2.6rem}
      .mtg-empty h2{margin:8px 0;font-size:1.2rem;color:var(--mtg-purple)}
      .mtg-empty p{margin:0;color:#5b21b6;font-size:.9rem;line-height:1.5}
      .mtg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      @media(max-width:480px){.mtg-board{grid-template-columns:minmax(0,1fr) 16px minmax(0,1fr);gap:5px}
        .mtg-card{font-size:.8rem;min-height:58px;padding:9px 24px 9px 9px;border-radius:12px}
        .mtg-mid{font-size:1rem}.mtg-thumb{display:none}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="mtg-wrap"><div class="mtg-empty">
        <div class="mtg-empty-icon">🧩</div><h2>No pairs to match yet</h2>
        <p>Add a few questions with a left item and a right item, then come back to play.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const pairs = questions.map((q, i) => {
      const m = q.metadata || {};
      const correct = choicesOf(q).find((c) => c.is_correct);
      return {
        q,
        id: String(q.id ?? `pair-${i + 1}`),
        left: String(m.left ?? q.prompt ?? `Item ${i + 1}`),
        right: String(m.right ?? correct?.text ?? m.answer ?? `Match ${i + 1}`),
        image: m.image || q.media_url || ''
      };
    });
    const byId = new Map(pairs.map((p) => [p.id, p]));
    const graded = new Set();
    const matched = new Set();
    let bad = new Set();
    let badTimer;
    let selected = null;
    let dragging = null;
    let finished = false;

    const maxPoints = (q) => Number(q.points ?? ctx.game?.points_per_question ?? 1) || 1;

    function grade(pair, correct, response) {
      if (!pair || graded.has(pair.id)) return;
      graded.add(pair.id);
      const max = maxPoints(pair.q);
      ctx.record({
        questionId: pair.q.id ?? pair.id,
        correct: !!correct,
        response,
        points: correct ? max : 0,
        maxPoints: max,
        explanation: pair.q.explanation || ''
      });
    }

    function finishOnce() {
      if (finished) return;
      finished = true;
      const btn = ctx.root.querySelector('.mtg-finish');
      if (btn) btn.disabled = true;
      ctx.finish();
    }

    function matchNumber(id) {
      return [...matched].indexOf(id) + 1;
    }

    function card(p, side) {
      const done = matched.has(p.id);
      const isSel = selected && selected.id === p.id && selected.side === side;
      const cls = ['mtg-card', done ? 'mtg-card--done' : '', isSel ? 'mtg-card--sel' : '', bad.has(p.id) ? 'mtg-card--bad' : ''].filter(Boolean).join(' ');
      const img = p.image ? `<img class="mtg-thumb" src="${E(p.image)}" alt="" loading="lazy">` : '';
      return `<button type="button" class="${cls}" data-id="${E(p.id)}" data-side="${side}"
        draggable="${done ? 'false' : 'true'}" ${done ? 'disabled' : ''} aria-label="${E(side === 'left' ? p.left : p.right)}">
        ${img}<span class="mtg-text">${E(side === 'left' ? p.left : p.right)}</span>
        ${done ? `<span class="mtg-badge">${matchNumber(p.id)}</span>` : ''}
      </button>`;
    }

    function draw() {
      const left = ctx.root.querySelector('.mtg-list--left');
      const right = ctx.root.querySelector('.mtg-list--right');
      const links = ctx.root.querySelector('.mtg-link-list');
      const count = ctx.root.querySelector('.mtg-counter strong');
      const note = ctx.root.querySelector('.mtg-empty-note');
      if (!left || !right || !links) return;
      left.innerHTML = shuffleLeft.map((p) => card(p, 'left')).join('');
      right.innerHTML = shuffleRight.map((p) => card(p, 'right')).join('');
      links.innerHTML = [...matched].map((id) => {
        const p = byId.get(id);
        return `<li class="mtg-link"><b>${matchNumber(id)}</b><span>${E(p.left)} ↔ ${E(p.right)}</span></li>`;
      }).join('') || '<li class="mtg-empty-note">Matched pairs will appear here.</li>';
      if (count) count.textContent = String(matched.size);
      if (note) note.textContent = matched.size === pairs.length ? 'All pairs connected — great work!' : '';
    }

    const shuffleLeft = shuffle(pairs);
    const shuffleRight = shuffle(pairs);

    ctx.root.innerHTML = `${css}<div class="mtg-wrap">
      <div class="mtg-head">
        <div><span class="mtg-kicker">🧩 Connect the pairs</span><h2>${E(ctx.game?.title || 'Matching Game')}</h2></div>
        <div class="mtg-counter"><strong>0</strong> / ${pairs.length} connected</div>
      </div>
      <p class="mtg-tip">Drag a card onto its partner, or tap one card from each column. Wrong guesses can be retried.</p>
      <div class="mtg-board">
        <div class="mtg-col"><h3>Column A</h3><div class="mtg-list mtg-list--left"></div></div>
        <div class="mtg-mid" aria-hidden="true">↔</div>
        <div class="mtg-col"><h3>Column B</h3><div class="mtg-list mtg-list--right"></div></div>
      </div>
      <div class="mtg-links"><h4>Connected pairs</h4><ul class="mtg-link-list"></ul><p class="mtg-empty-note"></p></div>
      <div class="mtg-foot"><button type="button" class="mtg-finish">Finish round</button></div>
      <div class="mtg-sr" aria-live="polite"></div>
    </div>`;

    function attempt(leftId, rightId) {
      if (!leftId || !rightId || matched.has(leftId) || matched.has(rightId)) return;
      const leftPair = byId.get(leftId);
      const rightPair = byId.get(rightId);
      if (!leftPair || !rightPair) return;
      const correct = leftId === rightId;
      if (correct) {
        matched.add(leftId);
        grade(leftPair, true, { left: leftPair.left, right: leftPair.right });
        ctx.ui.sound(true);
        ctx.notify('Connection made!', 'success');
      } else {
        grade(leftPair, false, { left: leftPair.left, right: rightPair.right, matchedWrongly: true });
        grade(rightPair, false, { left: leftPair.left, right: rightPair.right, matchedWrongly: true });
        ctx.ui.sound(false);
        ctx.notify('Not a match — try again.', 'error');
        bad = new Set([leftId, rightId]);
        clearTimeout(badTimer);
        badTimer = setTimeout(() => { bad = new Set(); if (!finished) draw(); }, 520);
      }
      const live = ctx.root.querySelector('.mtg-sr');
      if (live) live.textContent = correct ? `${leftPair.left} matches ${leftPair.right}` : 'Try a different pair';
      draw();
      if (matched.size === pairs.length) finishOnce();
    }

    ctx.root.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.mtg-card');
      if (!cardEl || cardEl.disabled) return;
      const id = cardEl.dataset.id;
      const side = cardEl.dataset.side;
      if (matched.has(id)) return;
      if (!selected || selected.side === side) {
        selected = { id, side };
        draw();
        if (side === 'left') ctx.speak(leftPairText(id));
        return;
      }
      const leftId = selected.side === 'left' ? selected.id : id;
      const rightId = selected.side === 'right' ? selected.id : id;
      selected = null;
      attempt(leftId, rightId);
    });

    function leftPairText(id) {
      return byId.get(id)?.left || '';
    }

    ctx.root.addEventListener('dragstart', (e) => {
      const cardEl = e.target.closest('.mtg-card');
      if (!cardEl || cardEl.disabled) return;
      dragging = { id: cardEl.dataset.id, side: cardEl.dataset.side };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${dragging.side}:${dragging.id}`);
      cardEl.classList.add('mtg-dragging');
    });

    ctx.root.addEventListener('dragend', (e) => {
      e.target.closest('.mtg-card')?.classList.remove('mtg-dragging');
      ctx.root.querySelectorAll('.mtg-over').forEach((el) => el.classList.remove('mtg-over'));
      dragging = null;
    });

    ctx.root.addEventListener('dragover', (e) => {
      if (!dragging) return;
      const cardEl = e.target.closest('.mtg-card');
      if (!cardEl || cardEl.disabled || cardEl.dataset.side === dragging.side) return;
      e.preventDefault();
      cardEl.classList.add('mtg-over');
    });

    ctx.root.addEventListener('dragleave', (e) => {
      e.target.closest('.mtg-card')?.classList.remove('mtg-over');
    });

    ctx.root.addEventListener('drop', (e) => {
      if (!dragging) return;
      const cardEl = e.target.closest('.mtg-card');
      if (!cardEl || cardEl.dataset.side === dragging.side) return;
      e.preventDefault();
      const from = dragging;
      dragging = null;
      attempt(from.side === 'left' ? from.id : cardEl.dataset.id, from.side === 'right' ? from.id : cardEl.dataset.id);
    });

    ctx.root.querySelector('.mtg-finish').addEventListener('click', () => {
      pairs.forEach((p) => { if (!matched.has(p.id)) grade(p, false, { skipped: true }); });
      finishOnce();
    });

    draw();
  }
};
