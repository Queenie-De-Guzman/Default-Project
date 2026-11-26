import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'sorting',
    title: 'Sorting Station',
    icon: '🗂️',
    blurb: 'Drag or tap each item into the right category bin, defined by the category metadata.',
    editorFields: [
      { key: 'category', label: 'Category for this item', type: 'text', placeholder: 'e.g. Mammal' },
      { key: 'answer', label: 'Item text override (optional)', type: 'text', placeholder: 'Shown on the draggable card' }
    ],
    recommendedFor: ['Science', 'English', 'Social Studies']
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
      .srt-app{font-family:inherit;max-width:900px;margin:0 auto;color:#27314e}
      .srt-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .srt-badge{background:linear-gradient(135deg,#00b894,#0984e3);color:#fff;padding:8px 14px;border-radius:999px;font-weight:900;box-shadow:0 4px 12px #0984e355}
      .srt-sub{font-size:.9rem;font-weight:700;color:#667085}
      .srt-tray{background:#fff;border:2px dashed #a7e3d3;border-radius:16px;padding:12px;margin-bottom:14px;min-height:88px}
      .srt-label{font-size:.8rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#00997c;margin-bottom:8px}
      .srt-items{display:flex;gap:8px;flex-wrap:wrap}
      .srt-item{border:2px solid #00b894;background:#eafbf5;color:#14584a;border-radius:12px;padding:10px 12px;min-height:46px;font-weight:800;cursor:grab;touch-action:manipulation;max-width:100%;overflow-wrap:anywhere}
      .srt-item:active{cursor:grabbing}
      .srt-item.srt-selected{box-shadow:0 0 0 4px #00b89455;transform:translateY(-3px)}
      .srt-bins{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
      .srt-bin{min-height:150px;background:#f7f9ff;border:3px dashed #b9c9e8;border-radius:16px;padding:10px;transition:background .2s,border-color .2s,transform .2s}
      .srt-bin.srt-over{background:#e6f6ff;border-color:#0984e3;transform:scale(1.02)}
      .srt-bin-title{font-weight:900;color:#2b4d8f;margin-bottom:8px;text-align:center;background:#fff;border-radius:10px;padding:8px 4px;border:1px solid #dce6fb;overflow-wrap:anywhere}
      .srt-chip{display:block;background:#fff;border:2px solid #dce6fb;border-radius:10px;padding:8px;margin-bottom:6px;font-size:.85rem;font-weight:700;overflow-wrap:anywhere;animation:srtDrop .3s ease}
      @keyframes srtDrop{from{transform:scale(.8);opacity:0}to{transform:none;opacity:1}}
      .srt-chip.srt-right{border-color:#22a06b;background:#e3f9ee;color:#0d6b45}
      .srt-chip.srt-wrong{border-color:#e17055;background:#ffece6;color:#a53a20}
      .srt-score{margin-top:14px;font-weight:800;min-height:26px}
      .srt-btn{border:0;border-radius:12px;padding:12px 16px;min-height:44px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#00b894,#0984e3);color:#fff}
      .srt-hint{font-size:.8rem;color:#667085;margin-top:6px}
      @media(max-width:420px){.srt-bins{grid-template-columns:1fr 1fr;gap:6px}.srt-bin{min-height:130px;padding:6px}}
    </style>`;

    root.innerHTML = `${style}<div class="srt-app"></div>`;
    const app = root.querySelector('.srt-app');

    if (!questions.length) {
      app.innerHTML = `<div class="srt-tray" style="text-align:center"><div style="font-size:3rem">🗂️</div><b>Nothing to sort yet!</b><p>Add questions with a category to play.</p></div>`;
      note('No questions available for Sorting Station.', 'info');
      done();
      return;
    }

    const items = shuffle(questions.map((q) => ({
      q,
      label: String(q.metadata?.answer ?? choicesOf(q).find((c) => c.is_correct)?.text ?? q.prompt ?? 'Item'),
      cat: String(q.metadata?.category ?? 'General'),
      placed: false,
      placedIn: null,
      ok: null
    })));

    const allCats = [...new Set(items.map((i) => i.cat))];
    const cats = [...new Set([...allCats.slice(0, 6), ...(allCats.length > 6 ? ['Other'] : [])])];
    let selected = null;
    let right = 0;

    app.innerHTML = `
      <header class="srt-head"><span class="srt-badge">🗂️ Sorting Station</span><span class="srt-sub" id="srt-sub"></span></header>
      <div class="srt-tray">
        <div class="srt-label">Items to sort — drag them or tap an item then a bin</div>
        <div class="srt-items" id="srt-items"></div>
        <div class="srt-hint">💡 Tap an item to select it, then tap a category bin.</div>
      </div>
      <div class="srt-bins" id="srt-bins">
        ${cats.map((c) => `<div class="srt-bin" data-cat="${E(c)}"><div class="srt-bin-title">${E(c)}</div><div class="srt-bin-items"></div></div>`).join('')}
      </div>
      <div class="srt-score" id="srt-score" aria-live="polite"></div>`;

    const tray = app.querySelector('#srt-items');
    const binsWrap = app.querySelector('#srt-bins');

    function draw() {
      tray.innerHTML = items.map((it, i) => it.placed ? '' : `<button class="srt-item ${selected === i ? 'srt-selected' : ''}" type="button" draggable="true" data-i="${i}">${E(it.label)}</button>`).join('') || '<span style="color:#667085;font-weight:700">All items sorted! 🎉</span>';
      binsWrap.querySelectorAll('.srt-bin').forEach((bin) => {
        const cat = bin.dataset.cat;
        bin.querySelector('.srt-bin-items').innerHTML = items.filter((it) => it.placed && it.placedIn === cat).map((it) =>
          `<span class="srt-chip ${it.ok ? 'srt-right' : 'srt-wrong'}">${E(it.label)}${it.ok ? ' ✅' : `<br><small>belongs in ${E(it.cat)}</small>`}</span>`
        ).join('');
      });
      const doneCount = items.filter((i) => i.placed).length;
      app.querySelector('#srt-sub').textContent = `${doneCount} / ${items.length} sorted · ✅ ${right}`;
      app.querySelector('#srt-score').innerHTML = doneCount === items.length
        ? `🎯 Finished with ${right} / ${items.length} correct! <button class="srt-btn" type="button" id="srt-finish">See results 🏁</button>`
        : '';
      app.querySelector('#srt-finish')?.addEventListener('click', done);
    }

    function place(i, cat) {
      const it = items[i];
      if (!it || it.placed) return;
      const ok = norm(it.cat) === norm(cat) || (cat === 'Other' && !allCats.slice(0, 6).includes(it.cat));
      it.placed = true;
      it.placedIn = cat;
      it.ok = ok;
      if (ok) right++;
      if (!seen.has(it.q)) {
        seen.add(it.q);
        record({ questionId: it.q.id, correct: ok, response: cat, points: ok ? maxP(it.q) : 0, maxPoints: maxP(it.q), explanation: it.q.explanation || '' });
      }
      sound(ok);
      note(ok ? `✅ ${it.label} belongs in ${cat}` : `❌ ${it.label} belongs in ${it.cat}`, ok ? 'success' : 'error');
      say(ok ? 'Correct!' : `Actually, ${it.label} belongs in ${it.cat}.`);
      selected = null;
      draw();
    }

    tray.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.srt-item');
      if (!btn) return;
      const i = Number(btn.dataset.i);
      selected = selected === i ? null : i;
      draw();
    });

    tray.addEventListener('dragstart', (ev) => {
      const btn = ev.target.closest('.srt-item');
      if (!btn) return;
      ev.dataTransfer.setData('text/plain', btn.dataset.i);
      ev.dataTransfer.effectAllowed = 'move';
      selected = Number(btn.dataset.i);
      tray.querySelectorAll('.srt-item').forEach((el) => el.classList.toggle('srt-selected', Number(el.dataset.i) === selected));
    });

    binsWrap.addEventListener('dragover', (ev) => {
      const bin = ev.target.closest('.srt-bin');
      if (!bin) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      binsWrap.querySelectorAll('.srt-bin').forEach((b) => b.classList.toggle('srt-over', b === bin));
    });

    binsWrap.addEventListener('dragleave', (ev) => {
      const bin = ev.target.closest('.srt-bin');
      if (bin) bin.classList.remove('srt-over');
    });

    binsWrap.addEventListener('drop', (ev) => {
      const bin = ev.target.closest('.srt-bin');
      if (!bin) return;
      ev.preventDefault();
      binsWrap.querySelectorAll('.srt-bin').forEach((b) => b.classList.remove('srt-over'));
      const raw = ev.dataTransfer.getData('text/plain');
      const i = Number(raw);
      if (Number.isInteger(i)) place(i, bin.dataset.cat);
    });

    binsWrap.addEventListener('click', (ev) => {
      const bin = ev.target.closest('.srt-bin');
      if (!bin || selected === null) return;
      place(selected, bin.dataset.cat);
    });

    draw();
  }
};
