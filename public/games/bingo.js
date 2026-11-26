import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'bingo',
    title: 'Bingo',
    icon: '🎱',
    blurb: 'A 5×5 bingo card built from answers and prompts. Call terms, mark squares, shout BINGO!',
    editorFields: [
      { key: 'call', label: 'Custom bingo term (optional)', type: 'text', placeholder: 'Extra word for the card' }
    ],
    recommendedFor: ['English', 'Math', 'Science', 'Vocabulary']
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
      .bing-app{font-family:inherit;max-width:880px;margin:0 auto;color:#2b2145}
      .bing-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .bing-badge{background:linear-gradient(135deg,#ff4d8d,#7b2ff7);color:#fff;padding:8px 14px;border-radius:999px;font-weight:900;box-shadow:0 4px 14px #7b2ff755}
      .bing-status{font-size:.9rem;font-weight:700;color:#6a5f86}
      .bing-layout{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(220px,.6fr);gap:14px;align-items:start}
      @media(max-width:700px){.bing-layout{grid-template-columns:1fr}}
      .bing-panel{background:#fff;border-radius:18px;padding:14px;border:2px solid #e5d9ff;box-shadow:0 10px 28px #2b214516}
      .bing-title{text-align:center;font-weight:900;letter-spacing:.32em;font-size:1.3rem;color:#7b2ff7;margin:2px 0 10px;padding-left:.32em}
      .bing-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
      .bing-cell{position:relative;min-height:64px;border:2px solid #d9cbf5;background:#faf7ff;border-radius:10px;padding:6px 3px;font-size:.79rem;font-weight:800;color:#2b2145;cursor:pointer;overflow:hidden;word-break:break-word;touch-action:manipulation;transition:transform .15s,background .2s}
      .bing-cell:active{transform:scale(.95)}
      .bing-cell.bing-called{background:#fff0d6;border-color:#ffab2e;box-shadow:0 0 0 3px #ffab2e55;animation:bingPulse .8s ease infinite alternate}
      @keyframes bingPulse{to{box-shadow:0 0 0 6px #ffab2e22}}
      .bing-cell.bing-marked{background:#dcf7e8;border-color:#22a06b;color:#0d6b45}
      .bing-cell.bing-marked::after{content:"✓";position:absolute;right:4px;top:2px;color:#0d6b45;font-size:.9rem}
      .bing-cell.bing-free{background:linear-gradient(135deg,#ffe6f2,#e7dcff);border-color:#ff4d8d}
      .bing-cell.bing-win{background:linear-gradient(135deg,#ffe066,#ff9f43);border-color:#ff6b00;animation:bingWin .6s ease}
      @keyframes bingWin{50%{transform:scale(1.09) rotate(-3deg)}}
      .bing-callcard{text-align:center;background:linear-gradient(160deg,#7b2ff7,#ff4d8d);color:#fff;border-radius:16px;padding:16px 12px;margin-bottom:12px}
      .bing-callcard small{opacity:.85;font-weight:800;letter-spacing:.1em}
      .bing-called-term{font-size:1.5rem;font-weight:900;margin:8px 0;min-height:36px;word-break:break-word}
      .bing-btn{width:100%;border:0;border-radius:12px;min-height:48px;font-size:1rem;font-weight:900;cursor:pointer;touch-action:manipulation;background:#ffca3a;color:#3b2a00;box-shadow:0 4px 0 #d9a400}
      .bing-btn:active{transform:translateY(2px);box-shadow:0 2px 0 #d9a400}
      .bing-tip{font-size:.85rem;color:#6a5f86;line-height:1.5;margin:12px 0 0}
      .bing-banner{margin-top:12px;text-align:center;font-weight:900;color:#7b2ff7;min-height:24px}
      .bing-finish{margin-top:10px;width:100%;border:0;border-radius:12px;min-height:44px;font-weight:800;cursor:pointer;background:#7b2ff7;color:#fff}
      @media(max-width:420px){.bing-cell{min-height:54px;font-size:.7rem}.bing-panel{padding:10px}}
    </style>`;

    root.innerHTML = `${style}<div class="bing-app"></div>`;
    const app = root.querySelector('.bing-app');

    if (!questions.length) {
      app.innerHTML = `<div class="bing-panel" style="text-align:center;padding:36px 16px"><div style="font-size:3rem">🎱</div><b>No bingo terms yet!</b><p>Add questions to create the card.</p></div>`;
      note('No questions available for Bingo.', 'info');
      done();
      return;
    }

    const score = (q, correct, response) => {
      if (seen.has(q)) return;
      seen.add(q);
      record({ questionId: q.id, correct: !!correct, response, points: correct ? maxP(q) : 0, maxPoints: maxP(q), explanation: q.explanation || '' });
    };

    const shorten = (value, n = 20) => {
      const t = String(value ?? '').replace(/\s+/g, ' ').trim();
      return t.length > n ? `${t.slice(0, n - 1)}…` : t;
    };
    const usedLabels = new Set();
    const terms = [];
    const addTerm = (label, qref) => {
      const l = shorten(label);
      const key = norm(l);
      if (!l || !key || usedLabels.has(key)) return;
      usedLabels.add(key);
      terms.push({ label: l, qref: qref || null });
    };

    for (const q of questions) addTerm(choicesOf(q).find((c) => c.is_correct)?.text ?? q.metadata?.answer ?? q.prompt, q);
    for (const q of questions) { if (terms.length >= 24) break; addTerm(q.prompt, null); }
    for (const q of questions) { if (terms.length >= 24) break; addTerm(q.metadata?.call, null); }
    const fillers = ['⭐', '🌟', '📚', '🎈', '🍎', '🚀', '🎯', '💡', '🧩', '🏆', '🌈', '⚽', '🎨', '🐝', '🍀', '🎵'];
    let fi = 0;
    while (terms.length < 24) addTerm(`${fillers[fi % fillers.length]} ${++fi}`, null);
    if (terms.length > 24) terms.length = 24;

    const picked = shuffle(terms);
    const card = [];
    let p = 0;
    for (let i = 0; i < 25; i++) {
      if (i === 12) card.push({ label: 'FREE SPACE', qref: null, free: true });
      else card.push({ ...(picked[p++] || { label: '⭐', qref: null }), free: false });
    }

    const queue = shuffle(card.map((_, i) => i).filter((i) => !card[i].free));
    const marked = new Set([12]);
    const winCells = new Set();
    let pending = null;
    let right = 0;
    let finished = false;

    app.innerHTML = `
      <header class="bing-head"><span class="bing-badge">🎱 BINGO</span><span class="bing-status" id="bing-status"></span></header>
      <div class="bing-layout">
        <section class="bing-panel">
          <div class="bing-title">BINGO</div>
          <div class="bing-grid" id="bing-grid"></div>
          <div class="bing-banner" id="bing-banner" aria-live="polite"></div>
        </section>
        <aside class="bing-panel">
          <div class="bing-callcard">
            <small>CALLED TERM</small>
            <div class="bing-called-term" id="bing-term">—</div>
            <button class="bing-btn" type="button" id="bing-call">Call next 🔔</button>
          </div>
          <p class="bing-tip">Tap <b>Call next</b>, then tap the matching square to mark it. A full row, column or diagonal wins!</p>
          <button class="bing-finish" type="button" id="bing-finish">Finish early 🏁</button>
        </aside>
      </div>`;

    const grid = app.querySelector('#bing-grid');
    const status = app.querySelector('#bing-status');
    const termEl = app.querySelector('#bing-term');
    const banner = app.querySelector('#bing-banner');

    function findBingo() {
      const lines = [];
      for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
      for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
      lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
      return lines.filter((line) => line.every((i) => marked.has(i)));
    }

    function draw() {
      grid.innerHTML = card.map((c, i) => `<button class="bing-cell ${c.free ? 'bing-free' : ''} ${marked.has(i) ? 'bing-marked' : ''} ${pending === i ? 'bing-called' : ''} ${winCells.has(i) ? 'bing-win' : ''}" type="button" data-i="${i}" aria-label="Bingo square: ${E(c.label)}">${E(c.label)}</button>`).join('');
      termEl.textContent = pending === null ? '—' : card[pending].label;
      status.textContent = `${queue.length} terms to call · ${marked.size}/25 marked · ${right} correct`;
    }

    function finalize() {
      if (finished) return;
      finished = true;
      for (const q of questions) if (!seen.has(q)) score(q, false, 'not marked');
      draw();
      if (!banner.textContent.includes('BINGO')) banner.innerHTML = `🎉 Round complete — <b>${right}</b> correct answers.`;
      app.querySelector('#bing-call').disabled = true;
      app.querySelector('#bing-finish').hidden = true;
      note('Bingo round finished!', 'success');
      const btn = document.createElement('button');
      btn.className = 'bing-finish';
      btn.type = 'button';
      btn.textContent = 'See results 🏁';
      btn.addEventListener('click', done);
      banner.appendChild(btn);
    }

    function callNext() {
      if (finished) return;
      if (pending !== null) {
        const missed = card[pending];
        if (missed.qref) score(missed.qref, false, 'missed call');
        note(`Missed: ${missed.label}`, 'info');
        pending = null;
      }
      if (queue.length === 0) { finalize(); return; }
      pending = queue.shift();
      say(card[pending].label);
      note(`Called: ${card[pending].label}`, 'info');
      draw();
    }

    function tapCell(i) {
      if (finished || card[i].free) return;
      if (pending === null) { note('Call a term first!', 'info'); return; }
      if (norm(card[i].label) !== norm(card[pending].label)) {
        sound(false);
        note(`That square is not "${card[pending].label}".`, 'error');
        return;
      }
      if (marked.has(i)) { note('Already marked!', 'info'); return; }
      marked.add(i);
      if (card[i].qref) {
        score(card[i].qref, true, card[i].label);
        right++;
      }
      sound(true);
      pending = null;
      const lines = findBingo();
      if (lines.length) {
        lines.forEach((line) => line.forEach((cell) => winCells.add(cell)));
        say('BINGO!');
        note('BINGO! You made a line!', 'success');
        banner.textContent = '🎱 BINGO! 🎉';
        draw();
        finalize();
        return;
      }
      draw();
      if (queue.length === 0) finalize();
    }

    grid.addEventListener('click', (ev) => {
      const cell = ev.target.closest('.bing-cell');
      if (cell) tapCell(Number(cell.dataset.i));
    });
    app.querySelector('#bing-call').addEventListener('click', callNext);
    app.querySelector('#bing-finish').addEventListener('click', () => {
      if (pending !== null) {
        const missed = card[pending];
        if (missed.qref) score(missed.qref, false, 'missed call');
        pending = null;
      }
      finalize();
    });

    draw();
  }
};
