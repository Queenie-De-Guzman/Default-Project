import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'treasure_hunt',
    title: 'Treasure Hunt',
    icon: '🗺️',
    blurb: 'Follow a winding map, solve each stop to uncover the next clue, and dig up the treasure.',
    editorFields: [
      { key: 'location', label: 'Location name', type: 'text', placeholder: 'e.g. Whispering Woods' },
      { key: 'pin', label: 'Map emoji', type: 'text', placeholder: 'e.g. 🌲' },
      { key: 'clue', label: 'Clue revealed after answering', type: 'text', placeholder: 'e.g. Look beneath the old oak' }
    ],
    recommendedFor: ['English', 'History', 'Geography']
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
      .th-app{font-family:inherit;max-width:820px;margin:0 auto;color:#20423b}
      .th-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .th-badge{background:linear-gradient(135deg,#0f9b8e,#f2a93b);color:#fff;padding:8px 14px;border-radius:999px;font-weight:900;box-shadow:0 4px 12px #0f9b8e55}
      .th-sub{font-size:.9rem;font-weight:700;color:#50736c}
      .th-map{position:relative;border-radius:20px;overflow:hidden;border:3px solid #d9e8c8;background:
        radial-gradient(circle at 78% 18%,#fff3c4 0 8%,transparent 9%),
        repeating-linear-gradient(45deg,#e7f2d8 0 12px,#e1eed1 12px 24px);box-shadow:0 10px 26px #20423b18}
      .th-route{position:relative;height:142px}
      .th-route::before{content:"";position:absolute;left:6%;right:6%;top:50%;border-top:4px dashed #b6c99b;border-radius:50%}
      .th-stop{position:absolute;transform:translate(-50%,-50%);text-align:center;width:80px}
      .th-pin{display:block;font-size:1.8rem;line-height:1;filter:drop-shadow(0 3px 2px #0002)}
      .th-stop small{display:block;font-size:.66rem;font-weight:800;color:#3c6158;background:#ffffffcc;border-radius:999px;padding:2px 4px;margin-top:2px}
      .th-stop.th-visited .th-pin{filter:grayscale(.3);opacity:.6}
      .th-stop.th-here .th-pin{animation:thBounce .8s ease infinite alternate}
      @keyframes thBounce{from{transform:translateY(0)}to{transform:translateY(-7px)}}
      .th-explorer{position:absolute;transform:translate(-50%,-120%);font-size:2rem;transition:left .55s ease,top .55s ease;filter:drop-shadow(0 3px 3px #0003);z-index:3}
      .th-chest{position:absolute;right:8px;bottom:6px;font-size:2.4rem;filter:drop-shadow(0 3px 3px #0003)}
      .th-chest.th-open{animation:thChest .8s ease}
      @keyframes thChest{50%{transform:scale(1.25) rotate(-8deg)}}
      .th-card{background:#fff;border-radius:18px;padding:16px;margin-top:14px;border:2px solid #cfe4c1;box-shadow:0 10px 26px #20423b12}
      .th-prompt{font-size:1.12rem;font-weight:800;line-height:1.45;margin:0 0 12px}
      .th-choices{display:grid;gap:8px}
      @media(min-width:560px){.th-choices{grid-template-columns:1fr 1fr}}
      .th-choice{min-height:46px;border:2px solid #b9d6ae;background:#f6fbf2;color:#20423b;border-radius:12px;padding:12px;text-align:left;font-weight:700;font-size:1rem;cursor:pointer;touch-action:manipulation}
      .th-choice:hover{border-color:#0f9b8e;background:#e9f8ec}
      .th-form{display:flex;gap:8px;flex-wrap:wrap}
      .th-input{flex:1 1 190px;min-width:0;padding:12px;border:2px solid #b9d6ae;border-radius:12px;font-size:1rem;outline:none}
      .th-input:focus{border-color:#0f9b8e;box-shadow:0 0 0 3px #0f9b8e33}
      .th-btn{border:0;border-radius:12px;padding:12px 16px;min-height:44px;font-weight:800;cursor:pointer;touch-action:manipulation;background:linear-gradient(135deg,#0f9b8e,#0b7a70);color:#fff}
      .th-feedback{min-height:24px;margin-top:10px;font-weight:700}
      .th-ok{color:#0e7a4f}.th-no{color:#b4451e}
      .th-clue{margin-top:12px;background:#fff7d6;border-left:5px solid #f2a93b;padding:12px;border-radius:10px;font-weight:700;animation:thSlide .35s ease}
      @keyframes thSlide{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}
      .th-win{text-align:center;padding:22px 10px}
      .th-win-icon{font-size:4rem;animation:thChest .8s ease}
      .th-empty{text-align:center;padding:40px 16px;background:#fff;border-radius:18px;border:2px dashed #b9d6ae;color:#50736c}
    </style>`;

    root.innerHTML = `${style}<div class="th-app"></div>`;
    const app = root.querySelector('.th-app');

    if (!questions.length) {
      app.innerHTML = `<div class="th-empty"><div style="font-size:3rem">🗺️</div><b>No trail to follow!</b><p>Add questions to place stops on the treasure map.</p></div>`;
      note('No questions available for Treasure Hunt.', 'info');
      done();
      return;
    }

    const stops = questions.slice(0, 8);
    const marks = ['📍', '🌲', '⛰️', '🏕️', '🌋', '🏝️', '🏰', '🌴'];
    let idx = 0;
    const pos = (i) => ({ left: `${((i + 0.5) / stops.length) * 100}%`, top: `${i % 2 ? 64 : 36}%` });

    const score = (q, correct, response) => {
      if (seen.has(q)) return;
      seen.add(q);
      record({ questionId: q.id, correct: !!correct, response, points: correct ? maxP(q) : 0, maxPoints: maxP(q), explanation: q.explanation || '' });
    };

    app.innerHTML = `
      <header class="th-head"><span class="th-badge">🗺️ Treasure Hunt</span><span class="th-sub" id="th-sub"></span></header>
      <div class="th-map">
        <div class="th-route" id="th-route">
          ${stops.map((q, i) => {
            const p = pos(i);
            return `<div class="th-stop" data-i="${i}" style="left:${p.left};top:${p.top}"><span class="th-pin">${E(q.metadata?.pin || marks[i % marks.length])}</span><small>${E(q.metadata?.location || `Stop ${i + 1}`)}</small></div>`;
          }).join('')}
        </div>
        <div class="th-explorer" id="th-explorer">🧭</div>
        <div class="th-chest" id="th-chest">🎁</div>
      </div>
      <section class="th-card" id="th-card"></section>`;

    const card = app.querySelector('#th-card');

    function paintStops() {
      app.querySelectorAll('.th-stop').forEach((el, i) => {
        el.classList.toggle('th-visited', i < idx);
        el.classList.toggle('th-here', i === idx);
      });
      const p = pos(Math.min(idx, stops.length - 1));
      const ex = app.querySelector('#th-explorer');
      ex.style.left = p.left;
      ex.style.top = p.top;
      app.querySelector('#th-sub').textContent = `Stop ${Math.min(idx + 1, stops.length)} of ${stops.length}`;
    }

    function paintChallenge() {
      const q = stops[idx];
      const choices = shuffle(choicesOf(q));
      const correctText = String(choicesOf(q).find((c) => c.is_correct)?.text ?? q.metadata?.answer ?? '');
      const answerHtml = choices.length
        ? `<div class="th-choices">${choices.map((c, i) => `<button class="th-choice" type="button" data-i="${i}">${String.fromCharCode(65 + i)}. ${E(c.text)}</button>`).join('')}</div>`
        : `<form class="th-form"><input class="th-input" id="th-answer" autocomplete="off" placeholder="Write your answer..."><button class="th-btn" type="submit">Search 🔎</button></form>`;

      card.innerHTML = `
        <p class="th-prompt">🧭 ${E(q.prompt || 'Find the next clue.')}</p>
        ${answerHtml}
        <div class="th-feedback" aria-live="polite"></div>
        <div id="th-reveal"></div>`;

      const check = (response, ok) => {
        score(q, ok, response);
        sound(ok);
        say(ok ? 'Clue found!' : 'A clue is still hidden here.');
        const fb = card.querySelector('.th-feedback');
        fb.className = `th-feedback ${ok ? 'th-ok' : 'th-no'}`;
        fb.textContent = ok ? '✅ Clue unlocked!' : `❌ Not quite — the answer was ${correctText}.`;
        const clue = q.metadata?.clue || q.explanation || 'Follow the trail to the next stop!';
        card.querySelector('#th-reveal').innerHTML = `
          <div class="th-clue">🗝️ <b>Next clue:</b> ${E(clue)}</div>
          <div style="margin-top:12px;text-align:right"><button class="th-btn" type="button" id="th-travel">${idx === stops.length - 1 ? 'Open the chest 🎁' : 'Travel onward →'}</button></div>`;
        card.querySelector('#th-travel').addEventListener('click', () => {
          if (idx === stops.length - 1) win();
          else { idx++; paintStops(); paintChallenge(); }
        });
      };

      card.querySelectorAll('.th-choice').forEach((b) => b.addEventListener('click', () => {
        const c = choices[Number(b.dataset.i)];
        check(c.text, c.is_correct || norm(c.text) === norm(correctText));
      }));

      card.querySelector('.th-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const val = card.querySelector('#th-answer').value.trim();
        const a = norm(val), b = norm(correctText);
        check(val, !!a && !!b && (a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))));
      });
    }

    function win() {
      app.querySelector('#th-chest').classList.add('th-open');
      card.innerHTML = `<div class="th-win"><div class="th-win-icon">💎</div><h2 style="margin:6px 0">Treasure found!</h2><p style="color:#50736c">You followed every clue to the chest.</p><button class="th-btn" type="button" id="th-finish">See results 🏁</button></div>`;
      sound(true);
      say('Treasure found!');
      card.querySelector('#th-finish').addEventListener('click', done);
    }

    paintStops();
    paintChallenge();
  }
};
