// EduPlay – True / False game module: big judgement buttons with reasoning feedback.
import { choicesOf } from '../ui.js';

export default {
  meta: {
    type: 'true_false',
    title: 'True or False?',
    icon: '⚖️',
    blurb: 'Make a big TRUE or FALSE judgement for each statement, then read the reasoning behind the answer.',
    editorFields: [
      { key: 'answer', label: 'Correct answer', type: 'text', placeholder: 'true or false' },
      { key: 'reason', label: 'Reasoning (optional)', type: 'text', placeholder: 'e.g. Water boils at 100°C at sea level' }
    ],
    recommendedFor: ['Science', 'History', 'English']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .tf-wrap{--tf-blue:#4338ca;--tf-red:#e11d48;font-family:inherit;color:#1e1b4b;padding:4px 2px 12px}
      .tf-wrap *{box-sizing:border-box}
      .tf-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}
      .tf-kicker{font-size:.7rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#4f46e5}
      .tf-step{font-size:.8rem;font-weight:800;background:#e0e7ff;color:#3730a3;border-radius:999px;padding:6px 12px}
      .tf-statement{margin:0 0 18px;padding:22px 20px;border-radius:22px;text-align:center;font-size:clamp(1.1rem,4.3vw,1.55rem);
        line-height:1.5;font-weight:750;background:linear-gradient(150deg,#eef2ff,#f5f3ff);border:2px solid #c7d2fe;
        box-shadow:0 6px 0 #e0e7ff;overflow-wrap:anywhere}
      .tf-statement::before{content:'“';color:#818cf8;font-size:1.8rem;line-height:0}
      .tf-statement::after{content:'”';color:#818cf8;font-size:1.8rem;line-height:0}
      .tf-say{border:0;background:transparent;font-size:1.05rem;cursor:pointer;margin-left:6px;vertical-align:middle}
      .tf-judges{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .tf-judge{position:relative;min-height:118px;border:3px solid;border-radius:22px;font:inherit;cursor:pointer;touch-action:manipulation;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;transition:transform .14s,box-shadow .14s,filter .14s}
      .tf-judge:hover:not(:disabled){transform:translateY(-4px)}
      .tf-judge:active:not(:disabled){transform:translateY(2px)}
      .tf-judge:focus-visible{outline:4px solid #facc15;outline-offset:2px}
      .tf-judge:disabled{cursor:default}
      .tf-judge--true{background:linear-gradient(160deg,#e0e7ff,#c7d2fe);border-color:#6366f1;color:#312e81;box-shadow:0 7px 0 #818cf8}
      .tf-judge--false{background:linear-gradient(160deg,#ffe4e6,#fecdd3);border-color:#f43f5e;color:#881337;box-shadow:0 7px 0 #fb7185}
      .tf-judge-icon{font-size:2.4rem;line-height:1}
      .tf-judge-label{font-size:clamp(1rem,4.5vw,1.4rem);font-weight:950;letter-spacing:.08em}
      .tf-judge--ok{filter:saturate(1.2);box-shadow:0 0 0 5px #4ade80,0 7px 0 #16a34a}
      .tf-judge--bad{opacity:.55;filter:grayscale(.5)}
      .tf-feedback{margin-top:16px;padding:16px 18px;border-radius:18px;font-size:.92rem;line-height:1.6;display:none;overflow-wrap:anywhere}
      .tf-feedback--show{display:block;animation:tf-pop .3s cubic-bezier(.2,1.3,.4,1)}
      .tf-feedback--ok{background:#ecfdf5;border:2px solid #34d399;color:#065f46}
      .tf-feedback--bad{background:#fff1f2;border:2px solid #fb7185;color:#881337}
      .tf-feedback strong{display:block;font-size:1.05rem;margin-bottom:5px}
      .tf-verdict{display:inline-block;margin:4px 0;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.75);font-weight:900;letter-spacing:.06em}
      .tf-next{border:0;border-radius:12px;padding:11px 18px;background:#4338ca;color:#fff;font:inherit;font-weight:900;cursor:pointer;
        box-shadow:0 3px 0 #312e81;touch-action:manipulation}
      .tf-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#eef2ff,#e0e7ff);border:2px dashed #a5b4fc}
      .tf-empty-icon{font-size:2.6rem}.tf-empty h2{margin:8px 0;font-size:1.2rem;color:#4338ca}.tf-empty p{margin:0;color:#3730a3;font-size:.9rem;line-height:1.5}
      @keyframes tf-pop{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}
      @media(max-width:480px){.tf-judge{min-height:100px;border-radius:16px}.tf-judge-icon{font-size:1.9rem}.tf-statement{padding:17px 14px}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="tf-wrap"><div class="tf-empty">
        <div class="tf-empty-icon">⚖️</div><h2>No statements to judge</h2>
        <p>Add true/false questions and the judgement buttons will appear here.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const rounds = questions.map((q, i) => {
      const m = q.metadata || {};
      const correct = choicesOf(q).find((c) => c.is_correct);
      const raw = correct?.text ?? m.answer ?? m.correct_answer ?? m.true_false ?? '';
      let answerBool;
      if (typeof raw === 'boolean') answerBool = raw;
      else {
        const text = String(raw).toLowerCase().trim();
        if (/^(true|yes|correct|right|t|y|1)\b/.test(text)) answerBool = true;
        else if (/^(false|no|incorrect|wrong|f|n|0)\b/.test(text)) answerBool = false;
        else answerBool = null;
      }
      return { q, id: q.id ?? `tf-${i + 1}`, answerBool, reason: String(m.reason || m.hint || '') };
    });

    const graded = new Set();
    let index = 0;
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

    function feedback(ok, round, chosen) {
      const el = ctx.root.querySelector('.tf-feedback');
      if (!el) return;
      const reasoning = round.q.explanation || round.reason || (chosen && chosen.feedback) || '';
      el.className = `tf-feedback tf-feedback--show ${ok ? 'tf-feedback--ok' : 'tf-feedback--bad'}`;
      el.innerHTML = `<strong>${ok ? '✓ Your judgement was right!' : '✕ Not this time'}</strong>
        <span class="tf-verdict">${round.answerBool === null ? 'No answer key was set' : `The statement is ${round.answerBool ? 'TRUE' : 'FALSE'}`}</span>
        ${reasoning ? `<div style="margin-top:6px">${E(reasoning)}</div>` : ''}
        <div style="margin-top:11px"><button type="button" class="tf-next">${index === rounds.length - 1 ? 'See results 🏁' : 'Next statement →'}</button></div>`;
      el.querySelector('.tf-next').addEventListener('click', () => {
        index += 1;
        if (index >= rounds.length) finishOnce();
        else load();
      });
    }

    function judge(round, value) {
      if (locked) return;
      locked = true;
      const ok = value === round.answerBool;
      grade(round, ok, value ? 'true' : 'false');
      ctx.ui.sound(ok);
      ctx.root.querySelectorAll('.tf-judge').forEach((el) => {
        el.disabled = true;
        const isAnswer = (el.dataset.value === 'true') === round.answerBool;
        if (isAnswer) el.classList.add('tf-judge--ok');
        else el.classList.add('tf-judge--bad');
      });
      const chosen = choicesOf(round.q).find((c) => (String(c.text).toLowerCase().startsWith(value ? 'true' : 'false')));
      feedback(ok, round, chosen);
    }

    function load() {
      const round = rounds[index];
      locked = false;
      const statement = String(round.q.prompt || 'Is this statement true or false?');
      ctx.root.innerHTML = `${css}<div class="tf-wrap">
        <div class="tf-head"><span class="tf-kicker">⚖️ True or false</span>
          <span class="tf-step">Statement ${index + 1} of ${rounds.length}</span></div>
        <p class="tf-statement">${E(statement)}<button type="button" class="tf-say" aria-label="Read statement aloud">🔊</button></p>
        <div class="tf-judges">
          <button type="button" class="tf-judge tf-judge--true" data-value="true">
            <span class="tf-judge-icon" aria-hidden="true">✔</span><span class="tf-judge-label">TRUE</span></button>
          <button type="button" class="tf-judge tf-judge--false" data-value="false">
            <span class="tf-judge-icon" aria-hidden="true">✘</span><span class="tf-judge-label">FALSE</span></button>
        </div>
        <div class="tf-feedback"></div>
      </div>`;
      ctx.root.querySelector('.tf-say').addEventListener('click', () => ctx.speak(statement));
      ctx.root.querySelector('[data-value="true"]').addEventListener('click', () => judge(round, true));
      ctx.root.querySelector('[data-value="false"]').addEventListener('click', () => judge(round, false));
    }

    load();
  }
};
