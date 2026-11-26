// EduPlay – Fill in the Blank game module: typed answer with instant checking.
import { choicesOf } from '../ui.js';

export default {
  meta: {
    type: 'fill_blank',
    title: 'Fill in the Blank',
    icon: '✏️',
    blurb: 'Read the prompt, type the missing word and get instant feedback with the teacher’s explanation.',
    editorFields: [
      { key: 'answer', label: 'Correct answer', type: 'text', placeholder: 'e.g. evaporation' },
      { key: 'hint', label: 'Hint (optional)', type: 'text', placeholder: 'e.g. It starts with the letter e' }
    ],
    recommendedFor: ['English', 'Science', 'Language']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .fb-wrap{--fb-teal:#0f766e;--fb-mint:#14b8a6;--fb-ink:#134e4a;font-family:inherit;color:var(--fb-ink);padding:4px 2px 12px}
      .fb-wrap *{box-sizing:border-box}
      .fb-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:10px}
      .fb-kicker{font-size:.7rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--fb-teal)}
      .fb-step{background:#ccfbf1;border-radius:999px;padding:6px 12px;font-size:.8rem;font-weight:800;color:#115e59}
      .fb-card{padding:20px;border-radius:22px;background:linear-gradient(150deg,#f0fdfa,#ecfeff);border:2px solid #99f6e4;box-shadow:0 6px 0 #ccfbf1}
      .fb-prompt{margin:0 0 18px;font-size:clamp(1.05rem,4vw,1.4rem);line-height:1.6;font-weight:700;overflow-wrap:anywhere}
      .fb-blankmark{display:inline-block;min-width:88px;padding:0 8px;border-bottom:4px solid var(--fb-mint);
        color:transparent;user-select:none;letter-spacing:.12em}
      .fb-label{display:block;margin-bottom:7px;font-size:.75rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#0f766e}
      .fb-input{width:100%;padding:14px 16px;border:2px solid #5eead4;border-radius:14px;background:#fff;color:#0f172a;
        font:inherit;font-size:1.05rem;box-shadow:inset 0 2px 5px rgba(0,0,0,.03);transition:border-color .15s,box-shadow .15s}
      .fb-input:focus{outline:0;border-color:var(--fb-teal);box-shadow:0 0 0 4px rgba(20,184,166,.16)}
      .fb-input:disabled{background:#f1f5f9;color:#475569}
      .fb-status{min-height:22px;margin-top:9px;font-size:.85rem;font-weight:700}
      .fb-status--ok{color:#047857}.fb-status--wait{color:#0f766e;opacity:.75}
      .fb-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .fb-btn{border:0;border-radius:12px;padding:11px 17px;font:inherit;font-weight:800;font-size:.86rem;cursor:pointer;touch-action:manipulation;
        background:#ccfbf1;color:#115e59;box-shadow:0 3px 0 #5eead4}
      .fb-btn:hover:not(:disabled){filter:brightness(1.05)}
      .fb-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #5eead4}
      .fb-btn:disabled{opacity:.5;cursor:default}
      .fb-btn--check{margin-left:auto;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;box-shadow:0 3px 0 #115e59}
      .fb-btn--next{background:#115e59;color:#fff;box-shadow:0 3px 0 #042f2e}
      .fb-feedback{margin-top:15px;padding:14px 16px;border-radius:15px;font-size:.9rem;line-height:1.55;display:none;overflow-wrap:anywhere}
      .fb-feedback--show{display:block;animation:fb-pop .25s ease}
      .fb-feedback--ok{background:#d1fae5;border:1px solid #6ee7b7;color:#065f46}
      .fb-feedback--bad{background:#fef3c7;border:1px solid #fcd34d;color:#78350f}
      .fb-feedback strong{display:block;font-size:1rem;margin-bottom:4px}
      .fb-answer{display:inline-block;margin:6px 0;padding:5px 10px;border-radius:9px;background:rgba(255,255,255,.75);font-weight:900;letter-spacing:.02em}
      .fb-say{border:0;background:transparent;font-size:1.05rem;cursor:pointer;margin-left:6px;vertical-align:middle}
      .fb-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#f0fdfa,#ccfbf1);border:2px dashed #5eead4}
      .fb-empty-icon{font-size:2.6rem}.fb-empty h2{margin:8px 0;font-size:1.2rem;color:#0f766e}.fb-empty p{margin:0;color:#115e59;font-size:.9rem;line-height:1.5}
      @keyframes fb-pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:480px){.fb-card{padding:15px}.fb-btn{padding:10px 13px;font-size:.8rem}.fb-blankmark{min-width:62px}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="fb-wrap"><div class="fb-empty">
        <div class="fb-empty-icon">✏️</div><h2>No blanks to fill</h2>
        <p>Add questions with a prompt and a correct answer to start this activity.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const rounds = questions.map((q, i) => {
      const m = q.metadata || {};
      const correct = choicesOf(q).find((c) => c.is_correct);
      return {
        q,
        id: q.id ?? `blank-${i + 1}`,
        answer: String(correct?.text ?? m.answer ?? m.correct_answer ?? m.correct ?? ''),
        hint: String(m.hint || '')
      };
    });

    const graded = new Set();
    let index = 0;
    let locked = false;
    let typingTimer;
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
      clearTimeout(typingTimer);
      ctx.finish();
    }

    function matches(round, value) {
      const v = ctx.ui.norm(value);
      if (!v) return false;
      if (!round.answer) return false; // no keyed answer means the item cannot be scored correct
      return v === ctx.ui.norm(round.answer);
    }

    function showFeedback(ok, round, response) {
      const el = ctx.root.querySelector('.fb-feedback');
      if (!el) return;
      el.className = `fb-feedback fb-feedback--show ${ok ? 'fb-feedback--ok' : 'fb-feedback--bad'}`;
      el.innerHTML = `<strong>${ok ? '✓ That fills the blank!' : (round.answer ? 'Not quite — the answer is below' : 'No answer key was set')}</strong>
        ${round.answer ? `<span class="fb-answer">${E(round.answer)}</span><br>` : ''}
        ${round.q.explanation ? `<div>${E(round.q.explanation)}</div>` : ''}
        <div class="fb-actions">
          ${ok ? '' : '<button type="button" class="fb-btn fb-btn--retry">Try again</button>'}
          <button type="button" class="fb-btn fb-btn--next">${index === rounds.length - 1 ? 'See results' : 'Next question →'}</button>
        </div>`;
      el.querySelector('.fb-btn--next')?.addEventListener('click', () => {
        index += 1;
        if (index >= rounds.length) finishOnce();
        else load();
      });
      el.querySelector('.fb-btn--retry')?.addEventListener('click', () => {
        locked = false;
        const input = ctx.root.querySelector('.fb-input');
        if (input) { input.disabled = false; input.value = ''; input.focus(); }
        const status = ctx.root.querySelector('.fb-status');
        if (status) { status.textContent = ''; status.className = 'fb-status'; }
        el.className = 'fb-feedback';
        el.innerHTML = '';
      });
    }

    function finalize(ok, response) {
      if (locked) return;
      const round = rounds[index];
      locked = true;
      clearTimeout(typingTimer);
      const input = ctx.root.querySelector('.fb-input');
      if (input) input.disabled = true;
      grade(round, ok, response);
      ctx.ui.sound(ok);
      if (!ok) ctx.notify(round.answer ? 'Answer revealed below.' : 'Response saved.', 'info');
      showFeedback(ok, round, response);
    }

    function load() {
      const round = rounds[index];
      locked = false;
      clearTimeout(typingTimer);
      const rawPrompt = String(round.q.prompt || 'Fill in the blank');
      const escaped = E(rawPrompt);
      const hasBlank = /(\[\s*blank\s*\]|_{3,})/i.test(rawPrompt);
      const promptHtml = escaped.replace(/(\[\s*blank\s*\]|_{3,})/gi, '<span class="fb-blankmark">______</span>')
        + (hasBlank ? '' : ' <span class="fb-blankmark">______</span>');

      ctx.root.innerHTML = `${css}<div class="fb-wrap">
        <div class="fb-top"><span class="fb-kicker">✏️ Fill in the blank</span>
          <span class="fb-step">Question ${index + 1} of ${rounds.length}</span></div>
        <div class="fb-card">
          <p class="fb-prompt">${promptHtml}<button type="button" class="fb-say" aria-label="Read question aloud">🔊</button></p>
          <label class="fb-label" for="fb-answer-input">Your answer</label>
          <input class="fb-input" id="fb-answer-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type here…">
          <div class="fb-status" aria-live="polite"></div>
          <div class="fb-actions">
            <button type="button" class="fb-btn fb-btn--hint">💡 Hint</button>
            <button type="button" class="fb-btn fb-btn--skip">Skip</button>
            <button type="button" class="fb-btn fb-btn--check">Check answer ✓</button>
          </div>
          <div class="fb-feedback"></div>
        </div>
      </div>`;

      const input = ctx.root.querySelector('.fb-input');
      const status = ctx.root.querySelector('.fb-status');
      ctx.root.querySelector('.fb-say').addEventListener('click', () => ctx.speak(rawPrompt));
      ctx.root.querySelector('.fb-btn--hint').addEventListener('click', () => {
        ctx.notify(round.hint || (round.answer ? `The answer starts with “${round.answer[0]}”.` : 'Read the prompt carefully.'), 'info');
      });
      ctx.root.querySelector('.fb-btn--skip').addEventListener('click', () => finalize(false, input.value.trim()));
      ctx.root.querySelector('.fb-btn--check').addEventListener('click', () => {
        if (!input.value.trim()) { ctx.notify('Type an answer first.', 'info'); return; }
        finalize(matches(round, input.value), input.value.trim());
      });

      input.addEventListener('input', () => {
        if (locked) return;
        const value = input.value.trim();
        const ok = matches(round, value);
        status.textContent = !value ? '' : (ok ? 'That looks right!' : 'Keep going…');
        status.className = `fb-status ${ok ? 'fb-status--ok' : 'fb-status--wait'}`;
        clearTimeout(typingTimer);
        if (value && ok && round.answer) typingTimer = setTimeout(() => finalize(true, value), 550);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (input.value.trim()) finalize(matches(round, input.value), input.value.trim());
      });
      input.focus();
    }

    load();
  }
};
