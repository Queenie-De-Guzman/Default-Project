// EduPlay – Word Search game module: find hidden answer words in a generated grid.
import { choicesOf, shuffle } from '../ui.js';

const WS_COLORS = ['#fb7185', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#4ade80'];
const WS_DIRS = [[0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1]];
const WS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default {
  meta: {
    type: 'wordsearch',
    title: 'Word Search',
    icon: '🔎',
    blurb: 'Hunt for each answer in a letter grid. Drag across a word or tap its first and last letter to mark it.',
    editorFields: [
      { key: 'word', label: 'Word to hide', type: 'text', placeholder: 'e.g. photosynthesis' },
      { key: 'hint', label: 'Clue (optional)', type: 'text', placeholder: 'e.g. Plants use this to make food' }
    ],
    recommendedFor: ['English', 'Science', 'Language']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .ws-wrap{--ws-blue:#0369a1;--ws-teal:#0d9488;--ws-ink:#0f172a;font-family:inherit;color:var(--ws-ink);padding:4px 2px 12px}
      .ws-wrap *{box-sizing:border-box}
      .ws-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px}
      .ws-kicker{font-size:.7rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--ws-teal)}
      .ws-head h2{margin:2px 0 0;font-size:clamp(1.1rem,4vw,1.5rem)}
      .ws-count{font-size:.8rem;font-weight:800;color:#fff;background:var(--ws-blue);border-radius:999px;padding:6px 12px}
      .ws-tip{margin:0 0 12px;font-size:.82rem;color:#475569}
      .ws-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;align-items:start}
      .ws-board{border:5px solid #bae6fd;border-radius:20px;background:#f0f9ff;padding:8px;box-shadow:0 6px 0 #e0f2fe;
        display:grid;grid-template-columns:repeat(var(--ws-size),minmax(0,1fr));gap:2px;touch-action:none;-webkit-user-select:none;user-select:none}
      .ws-cell{aspect-ratio:1;width:100%;min-width:0;padding:0;display:grid;place-items:center;border:0;border-radius:5px;
        background:rgba(255,255,255,.7);color:#334155;font:inherit;font-size:clamp(.62rem,2.4vw,.95rem);font-weight:800;
        cursor:pointer;touch-action:none;transition:background .12s,transform .12s}
      .ws-cell:hover{background:#bae6fd}
      .ws-cell:focus-visible{outline:2px solid #0284c7;outline-offset:1px;z-index:2}
      .ws-sel{background:#fde68a!important;transform:scale(1.06);box-shadow:0 0 0 2px #f59e0b}
      .ws-hit{background:var(--ws-color)!important;color:#fff!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.6)}
      .ws-bad{background:#fecdd3!important;animation:ws-shake .35s}
      @keyframes ws-shake{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}
      .ws-panel{padding:13px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;min-width:0}
      .ws-panel h3{margin:0 0 9px;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:#0f766e}
      .ws-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
      .ws-word{padding:8px 10px;border-radius:11px;background:#fff;border:1px solid #e2e8f0;font-size:.82rem;line-height:1.35;overflow-wrap:anywhere}
      .ws-word--found{border-color:#6ee7b7;background:#ecfdf5;color:#065f46;font-weight:800}
      .ws-word b{letter-spacing:.14em;color:#94a3b8}
      .ws-word--found b{color:#047857;letter-spacing:.02em}
      .ws-clue{display:block;color:#64748b;font-size:.74rem;margin-top:2px}
      .ws-word--found .ws-clue{color:#047857}
      .ws-foot{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}
      .ws-btn{border:0;border-radius:12px;padding:11px 16px;font:inherit;font-weight:800;font-size:.85rem;cursor:pointer;touch-action:manipulation;
        background:#e0f2fe;color:#075985;box-shadow:0 3px 0 #bae6fd}
      .ws-btn:hover:not(:disabled){filter:brightness(1.05)}
      .ws-btn:disabled{opacity:.5;cursor:default}
      .ws-btn--main{background:var(--ws-blue);color:#fff;box-shadow:0 3px 0 #075985}
      .ws-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#f0f9ff,#e0f2fe);border:2px dashed #7dd3fc}
      .ws-empty-icon{font-size:2.6rem}.ws-empty h2{margin:8px 0;font-size:1.2rem;color:#0369a1}.ws-empty p{margin:0;color:#0c4a6e;font-size:.9rem;line-height:1.5}
      @media(max-width:620px){.ws-layout{grid-template-columns:1fr}.ws-board{gap:1px;padding:5px;border-width:3px}.ws-cell{border-radius:3px}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="ws-wrap"><div class="ws-empty">
        <div class="ws-empty-icon">🔎</div><h2>No words to hide</h2>
        <p>Add questions with a word or correct answer and a search grid will be generated.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const words = questions.map((q, i) => {
      const m = q.metadata || {};
      const correct = choicesOf(q).find((c) => c.is_correct);
      const source = String(m.word ?? correct?.text ?? m.answer ?? q.prompt ?? `WORD${i + 1}`);
      const text = source.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14) || `WORD${i + 1}`;
      return { q, id: q.id ?? `word-${i + 1}`, text, source };
    });

    const size = Math.max(8, Math.min(14, Math.max(...words.map((w) => w.text.length)) + 2));
    const grid = Array.from({ length: size }, () => Array(size).fill(''));

    words.forEach((word) => {
      let placed = false;
      for (let attempt = 0; attempt < 250 && !placed; attempt += 1) {
        const [dr, dc] = WS_DIRS[Math.floor(Math.random() * WS_DIRS.length)];
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        const er = r + dr * (word.text.length - 1);
        const ec = c + dc * (word.text.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let fits = true;
        for (let k = 0; k < word.text.length; k += 1) {
          const existing = grid[r + dr * k][c + dc * k];
          if (existing && existing !== word.text[k]) { fits = false; break; }
        }
        if (!fits) continue;
        for (let k = 0; k < word.text.length; k += 1) grid[r + dr * k][c + dc * k] = word.text[k];
        placed = true;
      }
      if (!placed) {
        const r = Math.floor(Math.random() * size);
        for (let k = 0; k < word.text.length && k < size; k += 1) grid[r][k] = word.text[k];
      }
    });

    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!grid[r][c]) grid[r][c] = WS_ALPHABET[Math.floor(Math.random() * WS_ALPHABET.length)];
      }
    }

    const graded = new Set();
    const foundSet = new Set();
    let pending = null;
    let dragging = null;
    let finished = false;
    let badTimer;

    const maxPoints = (q) => Number(q.points ?? ctx.game?.points_per_question ?? 1) || 1;

    function grade(word, correct, response) {
      if (graded.has(word.id)) return;
      graded.add(word.id);
      const max = maxPoints(word.q);
      ctx.record({
        questionId: word.q.id ?? word.id,
        correct: !!correct,
        response,
        points: correct ? max : 0,
        maxPoints: max,
        explanation: word.q.explanation || ''
      });
    }

    function finishOnce() {
      if (finished) return;
      finished = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      clearTimeout(badTimer);
      const btn = ctx.root.querySelector('.ws-btn--main');
      if (btn) btn.disabled = true;
      ctx.finish();
    }

    function cellAt(x) {
      return ctx.root.querySelector(`.ws-cell[data-r="${x.r}"][data-c="${x.c}"]`);
    }

    function paint(cells) {
      ctx.root.querySelectorAll('.ws-sel').forEach((el) => el.classList.remove('ws-sel'));
      (cells || []).forEach((x) => cellAt(x)?.classList.add('ws-sel'));
    }

    function cellsBetween(a, b) {
      const dr = b.r - a.r;
      const dc = b.c - a.c;
      if (dr === 0 && dc === 0) return [a];
      if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
      const sr = Math.sign(dr);
      const sc = Math.sign(dc);
      const n = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
      return Array.from({ length: n }, (_, k) => ({ r: a.r + sr * k, c: a.c + sc * k }));
    }

    function renderList() {
      const list = ctx.root.querySelector('.ws-list');
      const count = ctx.root.querySelector('.ws-count');
      if (!list) return;
      list.innerHTML = words.map((w) => {
        const isFound = foundSet.has(w.id);
        return `<li class="ws-word ${isFound ? 'ws-word--found' : ''}">
          <b>${isFound ? E(w.text) : '_ '.repeat(w.text.length).trim()}</b>
          <span class="ws-clue">${E(w.source)}</span>
        </li>`;
      }).join('');
      if (count) count.textContent = `${foundSet.size} / ${words.length} found`;
    }

    function evaluate(a, b) {
      const cells = cellsBetween(a, b);
      paint([]);
      if (!cells || cells.length < 2) {
        ctx.notify('Tap a start letter and an end letter in a straight line.', 'info');
        return;
      }
      const str = cells.map((x) => grid[x.r][x.c]).join('');
      const rev = str.split('').reverse().join('');
      const word = words.find((w) => !foundSet.has(w.id) && (w.text === str || w.text === rev));
      if (!word) {
        ctx.ui.sound(false);
        ctx.notify('No hidden word on that line — keep looking!', 'error');
        cells.forEach((x) => cellAt(x)?.classList.add('ws-bad'));
        clearTimeout(badTimer);
        badTimer = setTimeout(() => cells.forEach((x) => cellAt(x)?.classList.remove('ws-bad')), 420);
        return;
      }
      foundSet.add(word.id);
      const color = WS_COLORS[foundSet.size % WS_COLORS.length];
      cells.forEach((x) => {
        const el = cellAt(x);
        if (el) { el.style.setProperty('--ws-color', color); el.classList.add('ws-hit'); }
      });
      grade(word, true, { start: a, end: b, word: word.text });
      ctx.ui.sound(true);
      ctx.notify(`Found: ${word.text}!`, 'success');
      renderList();
      if (foundSet.size === words.length) finishOnce();
    }

    ctx.root.innerHTML = `${css}<div class="ws-wrap">
      <div class="ws-head"><div><span class="ws-kicker">🔎 Word search</span><h2>${E(ctx.game?.title || 'Find the hidden words')}</h2></div>
        <span class="ws-count">0 / ${words.length} found</span></div>
      <p class="ws-tip">Drag across a word, or tap its first letter and then its last letter. Words run horizontally, vertically or diagonally.</p>
      <div class="ws-layout">
        <div class="ws-board" style="--ws-size:${size}" role="grid" aria-label="Word search letter grid">
          ${grid.map((row, r) => row.map((ch, c) => `<button type="button" role="gridcell" class="ws-cell" data-r="${r}" data-c="${c}" aria-label="Row ${r + 1} column ${c + 1}: ${E(ch)}">${E(ch)}</button>`).join('')).join('')}
        </div>
        <div class="ws-panel"><h3>Words to find</h3><ul class="ws-list"></ul></div>
      </div>
      <div class="ws-foot"><button type="button" class="ws-btn ws-btn--main">Finish search</button></div>
    </div>`;

    renderList();

    function onMove(e) {
      if (!dragging) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const cell = under?.closest?.('.ws-cell');
      if (!cell || !ctx.root.contains(cell)) return;
      const end = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
      const cells = cellsBetween(dragging, end);
      paint(cells || [dragging]);
    }

    function onUp(e) {
      if (!dragging) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const cell = under?.closest?.('.ws-cell');
      const start = dragging;
      dragging = null;
      const end = (cell && ctx.root.contains(cell))
        ? { r: Number(cell.dataset.r), c: Number(cell.dataset.c) }
        : start;
      if (end.r === start.r && end.c === start.c) {
        if (!pending) {
          pending = start;
          paint([start]);
          ctx.notify('Start selected — now tap the last letter.', 'info');
        } else {
          const first = pending;
          pending = null;
          evaluate(first, end);
        }
      } else {
        pending = null;
        evaluate(start, end);
      }
    }

    ctx.root.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.ws-cell');
      if (!cell || finished) return;
      e.preventDefault();
      dragging = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
      paint([dragging]);
    });

    ctx.root.addEventListener('click', (e) => {
      if (e.detail !== 0) return; // pointer taps are handled above; detail 0 = keyboard activation
      const cell = e.target.closest('.ws-cell');
      if (!cell || finished) return;
      const at = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
      if (!pending) { pending = at; paint([at]); ctx.notify('Start selected — now tap the last letter.', 'info'); }
      else { const first = pending; pending = null; evaluate(first, at); }
    });

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    ctx.root.querySelector('.ws-btn--main').addEventListener('click', () => {
      words.forEach((w) => { if (!foundSet.has(w.id)) grade(w, false, { skipped: true }); });
      finishOnce();
    });
  }
};
