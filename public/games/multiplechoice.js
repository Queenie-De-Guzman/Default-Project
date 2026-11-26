// EduPlay – Multiple Choice game module: one vibrant answer card per question.
import { choicesOf, shuffle } from '../ui.js';

const MCH_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const MCH_COLORS = ['#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#eab308'];

export default {
  meta: {
    type: 'multiple_choice',
    title: 'Choice Carnival',
    icon: '🎯',
    blurb: 'Pick the best answer from colourful cards. Get instant feedback and the teacher’s explanation before moving on.',
    editorFields: [],
    recommendedFor: ['English', 'Math', 'Science', 'History']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .mch-wrap{--mch-ink:#3b0764;font-family:inherit;color:var(--mch-ink);padding:4px 2px 12px}
      .mch-wrap *{box-sizing:border-box}
      .mch-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}
      .mch-kicker{font-size:.7rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#ea580c}
      .mch-step{font-size:.8rem;font-weight:800;background:#ffedd5;color:#9a3412;border-radius:999px;padding:6px 12px}
      .mch-bar{height:9px;border-radius:99px;background:#ffe4e6;overflow:hidden;margin-bottom:14px}
      .mch-bar-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#f97316,#db2777,#8b5cf6);transition:width .3s}
      .mch-prompt{margin:0 0 16px;padding:18px;border-radius:20px;font-size:clamp(1.05rem,4vw,1.4rem);line-height:1.45;font-weight:800;
        background:linear-gradient(135deg,#fff7ed,#fdf2f8);border:2px solid #fed7aa;box-shadow:0 5px 0 #ffedd5;overflow-wrap:anywhere}
      .mch-say{border:0;background:transparent;font-size:1.05rem;cursor:pointer;margin-left:6px;vertical-align:middle}
      .mch-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:11px}
      .mch-card{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:76px;padding:14px;border-radius:17px;
        border:2px solid var(--mch-accent,#fb923c);background:#fff;color:#431407; font:inherit;font-size:.95rem;font-weight:750;line-height:1.35;
        text-align:left;cursor:pointer;touch-action:manipulation;box-shadow:0 5px 0 var(--mch-shadow,#fed7aa);
        transition:transform .13s,box-shadow .13s,background .13s;overflow-wrap:anywhere}
      .mch-card:hover:not(:disabled){transform:translateY(-3px) rotate(-.4deg);box-shadow:0 8px 0 var(--mch-shadow,#fed7aa),0 12px 16px rgba(0,0,0,.1)}
      .mch-card:active:not(:disabled){transform:translateY(2px);box-shadow:0 2px 0 var(--mch-shadow,#fed7aa)}
      .mch-card:focus-visible{outline:3px solid #f97316;outline-offset:2px}
      .mch-card:disabled{cursor:default}
      .mch-letter{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--mch-accent,#fb923c);
        color:#fff;font-weight:900;font-size:1rem;box-shadow:inset 0 -3px 0 rgba(0,0,0,.15)}
      .mch-text{min-width:0}
      .mch-media{width:42px;height:42px;flex:none;object-fit:cover;border-radius:10px}
      .mch-mark{margin-left:auto;font-size:1.25rem;font-weight:900;flex:none}
      .mch-card--ok{background:#dcfce7;border-color:#22c55e;box-shadow:0 5px 0 #86efac}
      .mch-card--bad{background:#ffe4e6;border-color:#f43f5e;box-shadow:0 5px 0 #fda4af}
      .mch-card--dim{opacity:.55;filter:saturate(.5)}
      .mch-feedback{margin-top:15px;padding:15px 17px;border-radius:17px;font-size:.9rem;line-height:1.55;display:none;overflow-wrap:anywhere}
      .mch-feedback--show{display:block;animation:mch-pop .28s cubic-bezier(.2,1.4,.4,1)}
      .mch-feedback--ok{background:#dcfce7;border:2px solid #4ade80;color:#14532d}
      .mch-feedback--bad{background:#fff1f2;border:2px solid #fb7185;color:#881337}
      .mch-feedback strong{display:block;font-size:1.05rem;margin-bottom:5px}
      .mch-next{display:inline-block;margin-top:11px;border:0;border-radius:12px;padding:11px 18px;background:#7c3aed;color:#fff;
        font:inherit;font-weight:900;cursor:pointer;box-shadow:0 3px 0 #4c1d95;touch-action:manipulation}
      .mch-skip{border:0;border-radius:12px;padding:10px 14px;background:#f3e8ff;color:#6b21a8;font:inherit;font-weight:800;cursor:pointer;touch-action:manipulation}
      .mch-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#fff7ed,#ffedd5);border:2px dashed #fdba74}
      .mch-empty-icon{font-size:2.6rem}.mch-empty h2{margin:8px 0;font-size:1.2rem;color:#c2410c}.mch-empty p{margin:0;color:#9a3412;font-size:.9rem;line-height:1.5}
      @keyframes mch-pop{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}
      @media(max-width:480px){.mch-prompt{padding:14px}.mch-card{min-height:66px;padding:11px;gap:9px}.mch-letter{width:32px;height:32px;border-radius:9px;font-size:.9rem}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="mch-wrap"><div class="mch-empty">
        <div class="mch-empty-icon">🎯</div><h2>No choices to show</h2>
        <p>Add answer choices to your questions and they will appear here as colourful cards.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const rounds = questions.map((q, i) => ({
      q,
      id: q.id ?? `choice-${i + 1}`,
      choices: shuffle(choicesOf(q))
    }));
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
      const el = ctx.root.querySelector('.mch-feedback');
      if (!el) return;
      const answered = chosen || round.choices.find((c) => c.is_correct);
      el.className = `mch-feedback mch-feedback--show ${ok ? 'mch-feedback--ok' : 'mch-feedback--bad'}`;
      el.innerHTML = `<strong>${ok ? '🎉 Correct!' : (chosen ? 'Not quite — good try!' : 'No answer was selected')}</strong>
        ${answered ? `<div>Correct answer: <b>${E(answered.text)}</b></div>` : ''}
        ${round.q.explanation ? `<div style="margin-top:5px">${E(round.q.explanation)}</div>` : ''}
        <button type="button" class="mch-next">${index === rounds.length - 1 ? 'See results 🏁' : 'Next question →'}</button>`;
      el.querySelector('.mch-next').addEventListener('click', () => {
        index += 1;
        if (index >= rounds.length) finishOnce();
        else load();
      });
    }

    function pick(round, choice) {
      if (locked) return;
      locked = true;
      const ok = !!choice?.is_correct;
      const chosenIndex = round.choices.indexOf(choice);
      grade(round, ok, choice?.text ?? null);
      ctx.ui.sound(ok);
      ctx.root.querySelectorAll('.mch-card').forEach((el) => {
        const isCorrect = el.dataset.correct === 'true';
        el.disabled = true;
        if (isCorrect) { el.classList.add('mch-card--ok'); el.querySelector('.mch-mark').textContent = '✓'; }
        else if (Number(el.dataset.index) === chosenIndex) { el.classList.add('mch-card--bad'); el.querySelector('.mch-mark').textContent = '✕'; }
        else el.classList.add('mch-card--dim');
      });
      feedback(ok, round, choice);
    }

    function load() {
      const round = rounds[index];
      locked = false;
      const prompt = String(round.q.prompt || 'Choose the best answer');
      ctx.root.innerHTML = `${css}<div class="mch-wrap">
        <div class="mch-head"><span class="mch-kicker">🎯 Choice carnival</span>
          <span class="mch-step">Question ${index + 1} of ${rounds.length}</span></div>
        <div class="mch-bar"><div class="mch-bar-fill" style="width:${(index / rounds.length) * 100}%"></div></div>
        <h2 class="mch-prompt">${E(prompt)}<button type="button" class="mch-say" aria-label="Read question aloud">🔊</button></h2>
        <div class="mch-options">
          ${round.choices.map((c, i) => {
            const color = MCH_COLORS[i % MCH_COLORS.length];
            const media = c.media_url ? `<img class="mch-media" src="${E(c.media_url)}" alt="" loading="lazy">` : '';
            return `<button type="button" class="mch-card" data-index="${i}" data-correct="${c.is_correct ? 'true' : 'false'}"
              style="--mch-accent:${color};--mch-shadow:${color}33">
              <span class="mch-letter">${MCH_LETTERS[i] || String(i + 1)}</span>
              <span class="mch-text">${E(c.text)}</span>${media}<span class="mch-mark" aria-hidden="true"></span>
            </button>`;
          }).join('')}
        </div>
        ${round.choices.length ? '' : '<div class="mch-feedback mch-feedback--show mch-feedback--bad"><strong>This question has no answer choices yet.</strong><button type="button" class="mch-next">Continue →</button></div>'}
        <div class="mch-feedback"></div>
      </div>`;

      ctx.root.querySelector('.mch-say').addEventListener('click', () => ctx.speak(prompt));
      ctx.root.querySelectorAll('.mch-card').forEach((el) => {
        el.addEventListener('click', () => pick(round, round.choices[Number(el.dataset.index)]));
      });
      if (!round.choices.length) {
        grade(round, false, null);
        ctx.root.querySelector('.mch-next').addEventListener('click', () => {
          index += 1;
          if (index >= rounds.length) finishOnce();
          else load();
        });
      }
    }

    load();
  }
};
