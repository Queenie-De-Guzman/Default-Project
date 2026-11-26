import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'crossword',
    title: 'Crossword Builder',
    icon: '🔤',
    blurb: 'A mini crossword built automatically from your correct answers and prompts.',
    editorFields: [
      { key: 'answer', label: 'Answer override (optional)', type: 'text', placeholder: 'Used instead of the correct choice' }
    ],
    recommendedFor: ['English', 'Science', 'History']
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
      .xw-app{font-family:inherit;max-width:960px;margin:0 auto;color:#253247}
      .xw-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .xw-badge{background:linear-gradient(135deg,#4361ee,#7209b7);color:#fff;padding:8px 14px;border-radius:999px;font-weight:800;box-shadow:0 4px 12px #4361ee55}
      .xw-sub{font-size:.9rem;font-weight:700;color:#6b7590}
      .xw-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(240px,.9fr);gap:14px;align-items:start}
      @media(max-width:720px){.xw-layout{grid-template-columns:1fr}}
      .xw-panel{background:#fff;border-radius:18px;padding:14px;border:2px solid #dfe4ff;box-shadow:0 10px 26px #25324714}
      .xw-gridwrap{overflow:auto;max-width:100%;padding:4px 2px 10px}
      .xw-grid{display:grid;grid-template-columns:repeat(var(--xw-cols),38px);grid-auto-rows:38px;gap:3px;min-width:max-content;margin:0 auto}
      .xw-block{background:#2d3557;border-radius:7px}
      .xw-cell{position:relative;background:#f6f8ff;border:2px solid #b9c4f0;border-radius:7px}
      .xw-num{position:absolute;left:3px;top:1px;font-size:9px;line-height:1;color:#6b7590;font-weight:800}
      .xw-input{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;text-align:center;text-transform:uppercase;font-size:1.15rem;font-weight:800;color:#253247;outline:none;padding:6px 2px 0}
      .xw-input:focus{background:#fff6d5;border-radius:6px;box-shadow:inset 0 0 0 2px #ffb703}
      .xw-input.xw-good{background:#d8f7e6;color:#0e7a4f}
      .xw-input.xw-bad{background:#ffe0e0;color:#b52020}
      .xw-input:disabled{cursor:default}
      .xw-clues{margin:0;padding-left:20px;line-height:1.5}
      .xw-clues li{margin-bottom:8px}
      .xw-clues b{display:inline-grid;place-items:center;min-width:22px;height:22px;background:#4361ee;color:#fff;border-radius:6px;margin-right:6px;font-size:.8rem}
      .xw-h3{margin:0 0 8px;font-size:1rem;color:#4361ee}
      .xw-h3.xw-down{color:#7209b7}
      .xw-none{color:#98a2b8;font-style:italic;list-style:none;margin-left:-20px}
      .xw-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .xw-btn{border:0;border-radius:12px;padding:12px 16px;min-height:44px;font-weight:800;cursor:pointer;touch-action:manipulation;background:linear-gradient(135deg,#4361ee,#7209b7);color:#fff;box-shadow:0 4px 12px #7209b744}
      .xw-btn.xw-ghost{background:#eef1ff;color:#4361ee;box-shadow:none}
      .xw-feedback{margin-top:12px;font-weight:700;min-height:22px}
      .xw-ok{color:#0e7a4f}.xw-no{color:#b52020}
      .xw-empty{text-align:center;padding:40px 16px;background:#fff;border-radius:18px;border:2px dashed #b9c4f0;color:#6b7590}
    </style>`;

    root.innerHTML = `${style}<div class="xw-app"></div>`;
    const app = root.querySelector('.xw-app');

    if (!questions.length) {
      app.innerHTML = `<div class="xw-empty"><div style="font-size:3rem">🔤</div><b>No crossword words yet!</b><p>Add questions with correct answers to build a grid.</p></div>`;
      note('No questions available for Crossword Builder.', 'info');
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

    const clean = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
    const LIMIT = 15;
    const keyOf = (r, c) => `${r},${c}`;
    const parseKey = (k) => k.split(',').map(Number);

    const words = questions.map((q) => ({
      q,
      word: clean(choicesOf(q).find((c) => c.is_correct)?.text ?? q.metadata?.answer ?? q.prompt ?? '')
    }));
    const usable = words.filter((w) => w.word.length >= 2);
    const skipped = words.filter((w) => w.word.length < 2).map((w) => w.q);

    if (!usable.length) {
      app.innerHTML = `<div class="xw-empty"><div style="font-size:3rem">🔤</div><b>Not enough letters!</b><p>These questions need answers with at least two letters to build a crossword.</p><button class="xw-btn" type="button" id="xw-quit">See results</button></div>`;
      app.querySelector('#xw-quit').addEventListener('click', () => {
        skipped.forEach((q) => score(q, false, ''));
        done();
      });
      return;
    }

    const cells = new Map();
    const entries = [];

    function tryPlace(word, r, c, dir) {
      if (r < 0 || c < 0 || c + (dir === 'across' ? word.length - 1 : 0) >= LIMIT || r + (dir === 'down' ? word.length - 1 : 0) >= LIMIT) return null;
      let intersections = 0;
      for (let i = 0; i < word.length; i++) {
        const rr = dir === 'across' ? r : r + i;
        const cc = dir === 'across' ? c + i : c;
        const existing = cells.get(keyOf(rr, cc));
        if (existing) {
          if (existing !== word[i]) return null;
          intersections++;
        }
      }
      if (!intersections || intersections === word.length) return null;
      return intersections;
    }

    function commit(item, r, c, dir) {
      const e = { q: item.q, answer: item.word, row: r, col: c, dir, number: 0 };
      entries.push(e);
      for (let i = 0; i < item.word.length; i++) {
        cells.set(keyOf(r + (dir === 'down' ? i : 0), c + (dir === 'across' ? i : 0)), item.word[i]);
      }
    }

    commit(usable[0], 0, 0, 'across');

    for (let w = 1; w < usable.length; w++) {
      const item = usable[w];
      const word = item.word;
      let best = null;
      for (const [k, ch] of cells) {
        const [r, c] = parseKey(k);
        for (let j = 0; j < word.length; j++) {
          if (word[j] !== ch) continue;
          for (const dir of ['across', 'down']) {
            const sr = dir === 'across' ? r : r - j;
            const sc = dir === 'across' ? c - j : c;
            const hits = tryPlace(word, sr, sc, dir);
            if (!hits) continue;
            const rank = hits * 10 + (dir === 'down' ? 1 : 0) - (sr + sc) / 100;
            if (!best || rank > best.rank) best = { sr, sc, dir, rank };
          }
        }
      }
      if (best) commit(item, best.sr, best.sc, best.dir);
      else {
        // Non-intersecting answers are simply stacked below the grid.
        let maxRow = 0;
        for (const k of cells.keys()) maxRow = Math.max(maxRow, parseKey(k)[0]);
        commit(item, maxRow + 2, 0, 'across');
      }
    }

    const entryByStart = new Map();
    entries.forEach((e, i) => {
      const k = keyOf(e.row, e.col);
      if (!entryByStart.has(k)) entryByStart.set(k, []);
      entryByStart.get(k).push(i);
    });
    const numberAt = new Map();
    let num = 0;
    [...cells.keys()].map(parseKey).sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([r, c]) => {
      const k = keyOf(r, c);
      const starts = entryByStart.get(k) || [];
      if (!starts.length) return;
      const startAcross = !cells.has(keyOf(r, c - 1)) && starts.some((i) => entries[i].dir === 'across');
      const startDown = !cells.has(keyOf(r - 1, c)) && starts.some((i) => entries[i].dir === 'down');
      if (startAcross || startDown) {
        num++;
        numberAt.set(k, num);
        starts.forEach((i) => { entries[i].number = num; });
      } else {
        num++;
        starts.forEach((i) => { entries[i].number = num; });
      }
    });

    const cellEntries = new Map();
    entries.forEach((e, ei) => {
      for (let i = 0; i < e.answer.length; i++) {
        const k = keyOf(e.row + (e.dir === 'down' ? i : 0), e.col + (e.dir === 'across' ? i : 0));
        if (!cellEntries.has(k)) cellEntries.set(k, []);
        cellEntries.get(k).push({ ei, i });
      }
    });

    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const k of cells.keys()) {
      const [r, c] = parseKey(k);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
    }

    let gridHtml = '';
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const k = keyOf(r, c);
        const ch = cells.get(k);
        const area = `${r - minR + 1}/${c - minC + 1}`;
        if (!ch) { gridHtml += `<div class="xw-block" style="grid-area:${area}"></div>`; continue; }
        const n = numberAt.get(k);
        const first = (cellEntries.get(k) || [])[0] || { ei: '', i: '' };
        gridHtml += `<div class="xw-cell" style="grid-area:${area}">
          ${n ? `<span class="xw-num">${n}</span>` : ''}
          <input class="xw-input" maxlength="1" autocomplete="off" aria-label="Crossword cell" data-k="${k}" data-r="${r}" data-c="${c}" data-e="${first.ei}" data-i="${first.i}">
        </div>`;
      }
    }

    const clueList = (dir) => entries.filter((e) => e.dir === dir).map((e) => `<li><b>${e.number || '?'}</b> ${E(e.q.prompt || 'Clue')}${e.answer.length > 12 ? ` <span style="color:#98a2b8">(${e.answer.length} letters)</span>` : ''}</li>`).join('') || `<li class="xw-none">No ${dir} clues</li>`;

    app.innerHTML = `
      <header class="xw-head"><span class="xw-badge">🔤 Crossword Builder</span><span class="xw-sub">${entries.length} entries · ${skipped.length ? skipped.length + ' unplaced' : 'all placed'}</span></header>
      <div class="xw-layout">
        <section class="xw-panel">
          <div class="xw-gridwrap"><div class="xw-grid" id="xw-grid" style="--xw-cols:${maxC - minC + 1}">${gridHtml}</div></div>
          <div class="xw-actions">
            <button class="xw-btn" type="button" id="xw-check">Check answers ✅</button>
            <button class="xw-btn xw-ghost" type="button" id="xw-clear">Clear grid</button>
          </div>
          <div class="xw-feedback" id="xw-feedback" aria-live="polite"></div>
        </section>
        <section class="xw-panel">
          <h3 class="xw-h3">Across →</h3><ol class="xw-clues">${clueList('across')}</ol>
          <h3 class="xw-h3 xw-down">Down ↓</h3><ol class="xw-clues">${clueList('down')}</ol>
        </section>
      </div>`;

    const grid = app.querySelector('#xw-grid');
    const inputs = [...app.querySelectorAll('.xw-input')];
    const byCoord = new Map(inputs.map((el) => [keyOf(Number(el.dataset.r), Number(el.dataset.c)), el]));

    grid.addEventListener('input', (ev) => {
      const el = ev.target.closest('.xw-input');
      if (!el || el.disabled) return;
      el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 1);
      if (el.value) {
        const next = app.querySelector(`.xw-input[data-e="${el.dataset.e}"][data-i="${Number(el.dataset.i) + 1}"]`);
        if (next) next.focus();
      }
    });

    grid.addEventListener('keydown', (ev) => {
      const el = ev.target.closest('.xw-input');
      if (!el || el.disabled) return;
      const r = Number(el.dataset.r), c = Number(el.dataset.c);
      if (ev.key === 'Backspace' && !el.value) {
        const prev = app.querySelector(`.xw-input[data-e="${el.dataset.e}"][data-i="${Number(el.dataset.i) - 1}"]`);
        if (prev) { ev.preventDefault(); prev.focus(); prev.select(); }
      } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        const dr = ev.key === 'ArrowUp' ? -1 : ev.key === 'ArrowDown' ? 1 : 0;
        const dc = ev.key === 'ArrowLeft' ? -1 : ev.key === 'ArrowRight' ? 1 : 0;
        const target = byCoord.get(keyOf(r + dr, c + dc));
        if (target) { ev.preventDefault(); target.focus(); target.select(); }
      }
    });

    app.querySelector('#xw-clear').addEventListener('click', () => {
      inputs.forEach((el) => { el.value = ''; el.classList.remove('xw-good', 'xw-bad'); });
      app.querySelector('#xw-feedback').textContent = '';
      inputs[0]?.focus();
    });

    app.querySelector('#xw-check').addEventListener('click', () => {
      let goodCount = 0;
      entries.forEach((e) => {
        let good = true;
        for (let i = 0; i < e.answer.length; i++) {
          const k = keyOf(e.row + (e.dir === 'down' ? i : 0), e.col + (e.dir === 'across' ? i : 0));
          const val = (byCoord.get(k)?.value || '').toUpperCase();
          if (val !== e.answer[i]) good = false;
          byCoord.get(k)?.classList.remove('xw-good', 'xw-bad');
          byCoord.get(k)?.classList.add(val === e.answer[i] ? 'xw-good' : 'xw-bad');
        }
        if (good) goodCount++;
        score(e.q, good, e.answer);
      });
      skipped.forEach((q) => score(q, false, ''));
      sound(goodCount === entries.length);
      say(goodCount === entries.length ? 'Perfect crossword!' : `${goodCount} of ${entries.length} entries correct.`);
      inputs.forEach((el) => { el.disabled = true; });
      app.querySelector('#xw-check').disabled = true;
      app.querySelector('#xw-clear').disabled = true;
      const fb = app.querySelector('#xw-feedback');
      fb.className = 'xw-feedback';
      fb.innerHTML = `<span class="${goodCount === entries.length ? 'xw-ok' : 'xw-no'}">${goodCount} / ${entries.length} entries correct.</span> <button class="xw-btn" type="button" id="xw-finish">See results 🏁</button>`;
      fb.querySelector('#xw-finish').addEventListener('click', done);
    });
  }
};
