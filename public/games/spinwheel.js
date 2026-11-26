// EduPlay – Spin the Wheel game module: spin to land on a question, then answer it.
import { choicesOf, shuffle, wait } from '../ui.js';

const SW_COLORS = ['#f472b6', '#a78bfa', '#38bdf8', '#4ade80', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc', '#facc15', '#60a5fa', '#34d399', '#f9a8d4'];

export default {
  meta: {
    type: 'spin_wheel',
    title: 'Spin the Wheel',
    icon: '🎡',
    blurb: 'Spin the colourful wheel to pick a question, answer it, then spin again until every segment has been played.',
    editorFields: [
      { key: 'answer', label: 'Answer (for typed questions)', type: 'text', placeholder: 'e.g. photosynthesis' },
      { key: 'label', label: 'Wheel segment label (optional)', type: 'text', placeholder: 'e.g. Question 1' }
    ],
    recommendedFor: ['English', 'Math', 'Science', 'Revision']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .sw-wrap{--sw-purple:#6b21a8;font-family:inherit;color:#4c1d95;padding:4px 2px 12px}
      .sw-wrap *{box-sizing:border-box}
      .sw-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px}
      .sw-kicker{font-size:.7rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#a21caf}
      .sw-head h2{margin:2px 0 0;font-size:clamp(1.1rem,4vw,1.5rem)}
      .sw-count{background:#fdf4ff;color:#86198f;border:1px solid #f5d0fe;border-radius:999px;padding:6px 12px;font-size:.8rem;font-weight:800}
      .sw-stage{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;gap:10px;margin:10px 0 16px}
      .sw-wheelbox{position:relative;width:min(78vw,320px)}
      .sw-pointer{position:absolute;left:50%;top:-18px;transform:translateX(-50%);width:0;height:0;z-index:3;
        border-left:13px solid transparent;border-right:13px solid transparent;border-top:26px solid #581c87;filter:drop-shadow(0 3px 2px rgba(0,0,0,.25))}
      .sw-wheel{position:relative;width:100%;aspect-ratio:1;border-radius:50%;border:8px solid #fef08a;
        box-shadow:0 0 0 4px #a16207,0 12px 24px rgba(76,29,149,.25),inset 0 0 0 3px rgba(255,255,255,.5);
        transition:transform 3.1s cubic-bezier(.13,.76,.17,1);will-change:transform}
      .sw-hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:52px;height:52px;border-radius:50%;
        background:radial-gradient(circle at 35% 30%,#fde68a,#f59e0b);border:4px solid #7c2d12;display:grid;place-items:center;
        font-size:1.2rem;z-index:2;box-shadow:0 3px 8px rgba(0,0,0,.3)}
      .sw-label{position:absolute;left:50%;top:50%;max-width:38%;padding:3px 5px;border-radius:8px;background:rgba(255,255,255,.9);
        color:#4c1d95;font-size:.63rem;font-weight:900;line-height:1.1;text-align:center;white-space:nowrap;
        overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,.18)}
      .sw-label--done{opacity:.42;text-decoration:line-through}
      .sw-spin{border:0;border-radius:999px;padding:14px 30px;background:linear-gradient(135deg,#db2777,#7c3aed);color:#fff;
        font:inherit;font-size:1rem;font-weight:950;letter-spacing:.03em;cursor:pointer;touch-action:manipulation;
        box-shadow:0 6px 0 #4c1d95,0 10px 18px rgba(76,29,149,.25)}
      .sw-spin:hover:not(:disabled){filter:brightness(1.1);transform:translateY(-2px)}
      .sw-spin:active:not(:disabled){transform:translateY(3px);box-shadow:0 3px 0 #4c1d95}
      .sw-spin:disabled{opacity:.55;cursor:default}
      .sw-panel{padding:16px;border-radius:20px;background:linear-gradient(150deg,#faf5ff,#fdf2f8);border:2px solid #e9d5ff;min-height:90px}
      .sw-panel-title{margin:0 0 8px;font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#a21caf}
      .sw-question{margin:0 0 13px;font-size:clamp(1rem,3.8vw,1.2rem);line-height:1.45;font-weight:750;overflow-wrap:anywhere}
      .sw-say{border:0;background:transparent;font-size:1rem;cursor:pointer;margin-left:5px;vertical-align:middle}
      .sw-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:8px}
      .sw-choice{border:2px solid #e9d5ff;border-radius:13px;padding:12px;background:#fff;color:#581c87;font:inherit;font-size:.9rem;
        font-weight:750;text-align:left;cursor:pointer;touch-action:manipulation;box-shadow:0 3px 0 #f3e8ff;overflow-wrap:anywhere}
      .sw-choice:hover:not(:disabled){border-color:#c026d3;transform:translateY(-2px)}
      .sw-choice:disabled{cursor:default}
      .sw-choice--ok{background:#dcfce7;border-color:#22c55e;box-shadow:0 3px 0 #86efac}
      .sw-choice--bad{background:#ffe4e6;border-color:#f43f5e;box-shadow:0 3px 0 #fda4af}
      .sw-choice--dim{opacity:.55}
      .sw-input{width:100%;padding:12px;border:2px solid #d8b4fe;border-radius:12px;font:inherit;font-size:1rem;color:#4c1d95}
      .sw-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .sw-btn{border:0;border-radius:11px;padding:10px 15px;background:#ede9fe;color:#5b21b6;font:inherit;font-weight:800;font-size:.85rem;
        cursor:pointer;touch-action:manipulation;box-shadow:0 3px 0 #ddd6fe}
      .sw-btn:disabled{opacity:.5;cursor:default}
      .sw-btn--go{background:#7c3aed;color:#fff;box-shadow:0 3px 0 #4c1d95;margin-left:auto}
      .sw-feedback{margin-top:12px;padding:12px 14px;border-radius:13px;font-size:.88rem;line-height:1.5;display:none;overflow-wrap:anywhere}
      .sw-feedback--show{display:block;animation:sw-pop .25s ease}
      .sw-feedback--ok{background:#dcfce7;border:1px solid #4ade80;color:#14532d}
      .sw-feedback--bad{background:#fff1f2;border:1px solid #fb7185;color:#881337}
      .sw-idle{color:#7e22ce;font-size:.9rem;margin:0;line-height:1.5}
      .sw-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#faf5ff,#f3e8ff);border:2px dashed #d8b4fe}
      .sw-empty-icon{font-size:2.6rem}.sw-empty h2{margin:8px 0;font-size:1.2rem;color:#7e22ce}.sw-empty p{margin:0;color:#6b21a8;font-size:.9rem;line-height:1.5}
      @keyframes sw-pop{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}
      @media(max-width:480px){.sw-wheelbox{width:min(84vw,290px)}.sw-spin{padding:12px 22px;font-size:.9rem}.sw-label{font-size:.56rem}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="sw-wrap"><div class="sw-empty">
        <div class="sw-empty-icon">🎡</div><h2>The wheel is empty</h2>
        <p>Add a few questions and each one will become a segment on the wheel.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const rounds = questions.map((q, i) => {
      const m = q.metadata || {};
      const correct = choicesOf(q).find((c) => c.is_correct);
      return {
        q,
        id: q.id ?? `wheel-${i + 1}`,
        choices: shuffle(choicesOf(q)),
        answer: String(correct?.text ?? m.answer ?? m.correct ?? ''),
        label: String(m.label || correct?.text || q.prompt || `Q${i + 1}`).slice(0, 14)
      };
    });

    const graded = new Set();
    const remaining = rounds.map((_, i) => i);
    let rotation = 0;
    let spinning = false;
    let answering = false;
    let finished = false;
    const seg = 360 / rounds.length;
    let labelEls = [];

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
      const btn = ctx.root.querySelector('.sw-spin');
      if (btn) btn.disabled = true;
      ctx.finish();
    }

    function positionLabels() {
      const radius = (ctx.root.querySelector('.sw-wheel')?.clientWidth || 280) * 0.34;
      labelEls.forEach((el, i) => {
        const a = i * seg + seg / 2;
        el.style.transform = `translate(-50%,-50%) rotate(${a}deg) translateY(-${radius}px) rotate(${-(a + rotation)}deg)`;
      });
    }

    function showIdle(text) {
      const panel = ctx.root.querySelector('.sw-panel');
      panel.innerHTML = `<p class="sw-panel-title">🎡 Wheel</p><p class="sw-idle">${E(text)}</p>`;
    }

    function reveal(round, ok, chosen) {
      const el = ctx.root.querySelector('.sw-feedback');
      if (!el) return;
      const answerText = chosen || round.answer || (round.choices.find((c) => c.is_correct)?.text) || '';
      el.className = `sw-feedback sw-feedback--show ${ok ? 'sw-feedback--ok' : 'sw-feedback--bad'}`;
      el.innerHTML = `<strong>${ok ? '🎉 Correct!' : 'Not quite'}</strong>
        ${answerText ? `<div>Correct answer: <b>${E(answerText)}</b></div>` : ''}
        ${round.q.explanation ? `<div style="margin-top:4px">${E(round.q.explanation)}</div>` : ''}`;
    }

    function showQuestion(roundIndex) {
      const round = rounds[roundIndex];
      const panel = ctx.root.querySelector('.sw-panel');
      const prompt = String(round.q.prompt || 'Answer this question');
      panel.innerHTML = `<p class="sw-panel-title">🎯 Segment landed: ${E(round.label)}</p>
        <p class="sw-question">${E(prompt)}<button type="button" class="sw-say" aria-label="Read question aloud">🔊</button></p>
        ${round.choices.length ? `<div class="sw-choices">
          ${round.choices.map((c, i) => `<button type="button" class="sw-choice" data-i="${i}">${String.fromCharCode(65 + i)}. ${E(c.text)}</button>`).join('')}
        </div>` : `<input class="sw-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type your answer">
          <div class="sw-actions"><button type="button" class="sw-btn sw-btn--go">Submit answer</button></div>`}
        <div class="sw-actions"><button type="button" class="sw-btn sw-btn--skip">Skip question</button></div>
        <div class="sw-feedback"></div>`;
      panel.querySelector('.sw-say').addEventListener('click', () => ctx.speak(prompt));

      function resolve(ok, response) {
        if (answering) return;
        answering = false;
        grade(round, ok, response);
        ctx.ui.sound(ok);
        panel.querySelectorAll('.sw-choice').forEach((el) => {
          el.disabled = true;
          const c = round.choices[Number(el.dataset.i)];
          if (c?.is_correct) el.classList.add('sw-choice--ok');
          else if (String(el.dataset.i) === String(response?.index ?? -1)) el.classList.add('sw-choice--bad');
          else el.classList.add('sw-choice--dim');
        });
        reveal(round, ok, response?.text ?? (typeof response === 'string' ? response : ''));
        const at = remaining.indexOf(roundIndex);
        if (at >= 0) remaining.splice(at, 1);
        labelEls[roundIndex]?.classList.add('sw-label--done');
        const count = ctx.root.querySelector('.sw-count');
        if (count) count.textContent = `${rounds.length - remaining.length} / ${rounds.length} done`;
        const spinBtn = ctx.root.querySelector('.sw-spin');
        if (spinBtn) {
          if (!remaining.length) {
            spinBtn.textContent = 'All segments done';
            finishOnce();
          } else {
            spinBtn.textContent = 'Spin again 🎡';
            spinBtn.disabled = false;
          }
        }
        if (!remaining.length) ctx.notify('Every wheel segment is complete!', 'success');
      }

      panel.querySelectorAll('.sw-choice').forEach((el) => {
        el.addEventListener('click', () => {
          if (answering) return;
          const i = Number(el.dataset.i);
          const choice = round.choices[i];
          answering = true;
          resolve(choice.is_correct, { text: choice.text, index: i });
        });
      });

      const input = panel.querySelector('.sw-input');
      if (input) {
        const submit = () => {
          if (answering) return;
          const value = input.value.trim();
          if (!value) { ctx.notify('Type an answer first.', 'info'); return; }
          answering = true;
          const ok = !!round.answer && ctx.ui.norm(value) === ctx.ui.norm(round.answer);
          resolve(ok, value);
        };
        panel.querySelector('.sw-btn--go').addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      }
      panel.querySelector('.sw-btn--skip').addEventListener('click', () => {
        if (answering) return;
        answering = true;
        resolve(false, null);
      });
    }

    async function spin() {
      if (spinning || answering || !remaining.length || finished) return;
      spinning = true;
      const spinBtn = ctx.root.querySelector('.sw-spin');
      spinBtn.disabled = true;
      spinBtn.textContent = 'Spinning…';
      ctx.ui.sound('spin');
      showIdle('The wheel is spinning — good luck!');
      const target = remaining[Math.floor(Math.random() * remaining.length)];
      const center = target * seg + seg / 2;
      const desired = ((360 - center) % 360 + 360) % 360;
      const current = ((rotation % 360) + 360) % 360;
      const delta = ((desired - current) + 360) % 360;
      rotation += 360 * (5 + Math.floor(Math.random() * 3)) + delta + (Math.random() - 0.5) * seg * 0.3;
      const wheel = ctx.root.querySelector('.sw-wheel');
      wheel.style.transform = `rotate(${rotation}deg)`;
      positionLabels();
      await wait(3200);
      spinning = false;
      spinBtn.disabled = true;
      spinBtn.textContent = 'Spin again 🎡';
      showQuestion(target);
    }

    ctx.root.innerHTML = `${css}<div class="sw-wrap">
      <div class="sw-head"><div><span class="sw-kicker">🎡 Spin the wheel</span><h2>${E(ctx.game?.title || 'Take a spin')}</h2></div>
        <span class="sw-count">0 / ${rounds.length} done</span></div>
      <div class="sw-stage">
        <div class="sw-wheelbox"><div class="sw-pointer" aria-hidden="true"></div>
          <div class="sw-wheel" aria-label="Question wheel">
            <div class="sw-hub" aria-hidden="true">⭐</div>
            ${rounds.map((r, i) => `<span class="sw-label" data-seg="${i}">${E(r.label)}</span>`).join('')}
          </div>
        </div>
        <button type="button" class="sw-spin">Spin the wheel 🎡</button>
      </div>
      <div class="sw-panel"><p class="sw-panel-title">🎡 Wheel</p><p class="sw-idle">Spin to choose your first question.</p></div>
    </div>`;

    const wheel = ctx.root.querySelector('.sw-wheel');
    wheel.style.background = `conic-gradient(${rounds.map((r, i) => `${SW_COLORS[i % SW_COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')})`;
    labelEls = [...ctx.root.querySelectorAll('.sw-label')];
    positionLabels();
    ctx.root.querySelector('.sw-spin').addEventListener('click', spin);
    window.addEventListener('resize', () => { if (!finished) positionLabels(); });
  }
};
