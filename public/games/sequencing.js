// EduPlay – Sequencing game module: drag or nudge cards into the right order.
import { shuffle } from '../ui.js';

export default {
  meta: {
    type: 'sequencing',
    title: 'Order Up!',
    icon: '🧺',
    blurb: 'Put shuffled steps back into the correct order. Drag rows into place or use the up and down buttons — six questions per round.',
    editorFields: [
      { key: 'order', label: 'Order number (optional)', type: 'text', placeholder: 'e.g. 1' },
      { key: 'step', label: 'Alternative order number', type: 'text', placeholder: 'e.g. 1' }
    ],
    recommendedFor: ['History', 'Science', 'English', 'Procedures']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .seq-wrap{--seq-amber:#b45309;--seq-brown:#78350f;font-family:inherit;color:#451a03;padding:4px 2px 12px}
      .seq-wrap *{box-sizing:border-box}
      .seq-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px}
      .seq-kicker{font-size:.7rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#d97706}
      .seq-head h2{margin:2px 0 0;font-size:clamp(1.1rem,4vw,1.5rem)}
      .seq-round{background:#fef3c7;border:1px solid #fde68a;color:#92400e;border-radius:999px;padding:6px 12px;font-size:.8rem;font-weight:800}
      .seq-tip{margin:0 0 13px;font-size:.83rem;color:#92400e}
      .seq-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;counter-reset:seq}
      .seq-row{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:15px;border:2px solid #fcd34d;
        background:linear-gradient(135deg,#fffbeb,#fff7ed);box-shadow:0 4px 0 #fde68a;cursor:grab;touch-action:manipulation}
      .seq-row:hover{transform:translateY(-1px)}
      .seq-row.seq-dragging{opacity:.45;cursor:grabbing}
      .seq-row.seq-over{border-color:#f59e0b;background:#fef3c7;box-shadow:0 0 0 4px rgba(245,158,11,.2)}
      .seq-grip{flex:none;color:#d97706;font-size:1.15rem;letter-spacing:-3px;user-select:none}
      .seq-num{flex:none;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:#d97706;color:#fff;font-size:.82rem;font-weight:900}
      .seq-text{flex:1;min-width:0;font-size:.9rem;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
      .seq-move{display:flex;flex-direction:column;gap:3px;flex:none}
      .seq-btn{width:30px;height:26px;border:1px solid #fcd34d;border-radius:7px;background:#fff;color:#b45309;
        font:inherit;font-size:.8rem;font-weight:900;line-height:1;cursor:pointer;touch-action:manipulation}
      .seq-btn:hover:not(:disabled){background:#fef3c7}
      .seq-btn:disabled{opacity:.35;cursor:default}
      .seq-row.seq-right{border-color:#4ade80;background:#f0fdf4;box-shadow:0 4px 0 #bbf7d0}
      .seq-row.seq-wrong{border-color:#fb7185;background:#fff1f2;box-shadow:0 4px 0 #fecdd3}
      .seq-foot{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}
      .seq-btn--main{border:0;border-radius:12px;padding:11px 18px;background:#d97706;color:#fff;font:inherit;font-weight:900;font-size:.86rem;
        cursor:pointer;box-shadow:0 3px 0 #92400e;touch-action:manipulation;width:auto;height:auto}
      .seq-btn--main:hover:not(:disabled){filter:brightness(1.08)}
      .seq-btn--main:disabled{opacity:.5;cursor:default}
      .seq-feedback{margin-top:14px;padding:14px 16px;border-radius:16px;font-size:.88rem;line-height:1.55;display:none;overflow-wrap:anywhere}
      .seq-feedback--show{display:block;animation:seq-pop .25s ease}
      .seq-feedback--ok{background:#dcfce7;border:2px solid #4ade80;color:#14532d}
      .seq-feedback--bad{background:#fff7ed;border:2px solid #fbbf24;color:#78350f}
      .seq-answer{margin:7px 0 0;padding-left:18px}
      .seq-answer li{margin:3px 0}
      .seq-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#fffbeb,#fef3c7);border:2px dashed #fcd34d}
      .seq-empty-icon{font-size:2.6rem}.seq-empty h2{margin:8px 0;font-size:1.2rem;color:#b45309}.seq-empty p{margin:0;color:#78350f;font-size:.9rem;line-height:1.5}
      @keyframes seq-pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:480px){.seq-row{padding:8px;gap:6px;border-radius:12px}.seq-text{font-size:.82rem}.seq-num{width:24px;height:24px}.seq-grip{display:none}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="seq-wrap"><div class="seq-empty">
        <div class="seq-empty-icon">🧺</div><h2>Nothing to order</h2>
        <p>Add a few questions and put them in the order you want students to arrange them.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const indexed = questions.map((q, i) => {
      const m = q.metadata || {};
      const raw = m.order ?? m.step ?? m.position;
      const key = Number(raw);
      return { q, i, key: Number.isFinite(key) ? key : i, id: q.id ?? `seq-${i + 1}` };
    });

    const groups = [];
    for (let start = 0; start < indexed.length; start += 6) {
      const slice = indexed.slice(start, start + 6);
      groups.push({
        correct: [...slice].sort((a, b) => a.key - b.key || a.i - b.i),
        display: shuffle(slice)
      });
    }

    const graded = new Set();
    let groupIndex = 0;
    let order = [];
    let checked = false;
    let dragPos = null;
    let finished = false;

    const maxPoints = (q) => Number(q.points ?? ctx.game?.points_per_question ?? 1) || 1;

    function grade(item, correct, response) {
      if (graded.has(item.id)) return;
      graded.add(item.id);
      const max = maxPoints(item.q);
      ctx.record({
        questionId: item.q.id ?? item.id,
        correct: !!correct,
        response,
        points: correct ? max : 0,
        maxPoints: max,
        explanation: item.q.explanation || ''
      });
    }

    function finishOnce() {
      if (finished) return;
      finished = true;
      ctx.finish();
    }

    function move(from, to) {
      if (checked || from == null || to < 0 || to >= order.length || from === to) return;
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item);
      renderRows();
    }

    function renderRows() {
      const list = ctx.root.querySelector('.seq-list');
      if (!list) return;
      list.innerHTML = order.map((item, pos) => `<li class="seq-row" draggable="true" data-pos="${pos}" data-i="${item.i}">
        <span class="seq-grip" aria-hidden="true">⋮⋮</span>
        <span class="seq-num">${pos + 1}</span>
        <span class="seq-text">${E(item.q.prompt || `Step ${item.i + 1}`)}</span>
        <span class="seq-move">
          <button type="button" class="seq-btn" data-act="up" aria-label="Move up" ${pos === 0 || checked ? 'disabled' : ''}>▲</button>
          <button type="button" class="seq-btn" data-act="down" aria-label="Move down" ${pos === order.length - 1 || checked ? 'disabled' : ''}>▼</button>
        </span>
      </li>`).join('');
    }

    function check() {
      if (checked) return;
      checked = true;
      const group = groups[groupIndex];
      let allRight = true;
      order.forEach((item, pos) => {
        const expected = group.correct.findIndex((x) => x.i === item.i);
        const ok = pos === expected;
        if (!ok) allRight = false;
        grade(item, ok, { position: pos + 1, expectedPosition: expected + 1 });
      });
      ctx.ui.sound(allRight);
      ctx.root.querySelectorAll('.seq-row').forEach((row) => {
        const item = order[Number(row.dataset.pos)];
        const expected = group.correct.findIndex((x) => x.i === item.i);
        row.classList.add(Number(row.dataset.pos) === expected ? 'seq-right' : 'seq-wrong');
        row.draggable = false;
        row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      });
      const el = ctx.root.querySelector('.seq-feedback');
      el.className = `seq-feedback seq-feedback--show ${allRight ? 'seq-feedback--ok' : 'seq-feedback--bad'}`;
      el.innerHTML = `<strong>${allRight ? '🎉 Perfect order!' : 'Here is the correct order'}</strong>
        <ol class="seq-answer">${group.correct.map((x) => `<li>${E(x.q.prompt || `Step ${x.i + 1}`)}</li>`).join('')}</ol>
        <div style="margin-top:10px"><button type="button" class="seq-btn seq-btn--main seq-next">${groupIndex === groups.length - 1 ? 'See results 🏁' : 'Next round →'}</button></div>`;
      el.querySelector('.seq-next').addEventListener('click', () => {
        groupIndex += 1;
        if (groupIndex >= groups.length) finishOnce();
        else loadGroup();
      });
      const checkBtn = ctx.root.querySelector('.seq-check');
      if (checkBtn) checkBtn.disabled = true;
    }

    function loadGroup() {
      order = [...groups[groupIndex].display];
      checked = false;
      dragPos = null;
      const list = ctx.root.querySelector('.seq-list');
      const feedback = ctx.root.querySelector('.seq-feedback');
      const round = ctx.root.querySelector('.seq-round');
      const checkBtn = ctx.root.querySelector('.seq-check');
      if (list && feedback && round && checkBtn) {
        renderRows();
        feedback.className = 'seq-feedback';
        feedback.innerHTML = '';
        round.textContent = `Round ${groupIndex + 1} of ${groups.length}`;
        checkBtn.disabled = false;
      }
    }

    ctx.root.innerHTML = `${css}<div class="seq-wrap">
      <div class="seq-head"><div><span class="seq-kicker">🧺 Order up!</span>
        <h2>${E(ctx.game?.title || 'Put the steps in order')}</h2></div>
        <span class="seq-round">Round 1 of ${groups.length}</span></div>
      <p class="seq-tip">Drag a row to move it, or use ▲ and ▼. When you are happy with the order, check your answer.</p>
      <ul class="seq-list"></ul>
      <div class="seq-feedback"></div>
      <div class="seq-foot"><button type="button" class="seq-btn seq-btn--main seq-check">Check order ✓</button></div>
    </div>`;

    const list = ctx.root.querySelector('.seq-list');

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.seq-btn[data-act]');
      if (!btn || btn.disabled) return;
      const row = btn.closest('.seq-row');
      const pos = Number(row.dataset.pos);
      move(pos, btn.dataset.act === 'up' ? pos - 1 : pos + 1);
    });

    list.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.seq-row');
      if (!row || checked) { e.preventDefault(); return; }
      dragPos = Number(row.dataset.pos);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragPos));
      row.classList.add('seq-dragging');
    });

    list.addEventListener('dragend', () => {
      ctx.root.querySelectorAll('.seq-row').forEach((r) => r.classList.remove('seq-dragging', 'seq-over'));
      dragPos = null;
    });

    list.addEventListener('dragover', (e) => {
      if (checked || dragPos == null) return;
      const row = e.target.closest('.seq-row');
      if (!row || Number(row.dataset.pos) === dragPos) return;
      e.preventDefault();
      row.classList.add('seq-over');
    });

    list.addEventListener('dragleave', (e) => {
      e.target.closest('.seq-row')?.classList.remove('seq-over');
    });

    list.addEventListener('drop', (e) => {
      if (checked || dragPos == null) return;
      const row = e.target.closest('.seq-row');
      if (!row) return;
      e.preventDefault();
      const target = Number(row.dataset.pos);
      const from = dragPos;
      dragPos = null;
      move(from, target);
    });

    ctx.root.querySelector('.seq-check').addEventListener('click', check);
    loadGroup();
  }
};
