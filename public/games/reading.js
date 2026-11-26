// EduPlay – Reading comprehension: scrollable passage beside comprehension questions.
import { choicesOf } from '../ui.js';

export default {
  meta: {
    type: 'reading',
    title: 'Reading Corner',
    icon: '📖',
    blurb: 'Read the passage in a scrollable panel, then answer comprehension questions with instant explanations.',
    editorFields: [
      { key: 'passage', label: 'Passage (first question)', type: 'text', placeholder: 'Paste the reading passage here…' },
      { key: 'answer', label: 'Answer (if not using choices)', type: 'text', placeholder: 'e.g. the water cycle' }
    ],
    recommendedFor: ['English', 'History', 'Social Studies']
  },

  render(ctx) {
    const E = ctx.ui.esc;
    const css = `<style>
      .rd-wrap{--rd-ink:#422006;--rd-brown:#92400e;--rd-paper:#fffbeb;font-family:inherit;color:var(--rd-ink);padding:4px 2px 12px}
      .rd-wrap *{box-sizing:border-box}
      .rd-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}
      .rd-kicker{font-size:.7rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--rd-brown)}
      .rd-head h2{margin:2px 0 0;font-size:clamp(1.1rem,4vw,1.5rem);font-family:Georgia,serif}
      .rd-progress{background:#fef3c7;border:1px solid #fde68a;border-radius:999px;padding:6px 12px;font-size:.8rem;font-weight:800;color:#92400e}
      .rd-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
      .rd-passage,.rd-question{min-width:0;border-radius:20px;border:2px solid #fcd34d;background:var(--rd-paper);box-shadow:0 5px 0 #fde68a}
      .rd-passage-head{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between;padding:11px 14px;
        border-bottom:2px solid #fde68a;background:linear-gradient(135deg,#fef3c7,#fff7ed);border-radius:18px 18px 0 0}
      .rd-passage-head h3{margin:0;font-size:.85rem;font-weight:900;color:#92400e}
      .rd-tools{display:flex;gap:5px}
      .rd-tool{border:1px solid #fcd34d;border-radius:9px;background:#fff;color:#92400e;font:inherit;font-size:.75rem;font-weight:800;
        padding:6px 9px;cursor:pointer;touch-action:manipulation}
      .rd-tool:hover{background:#fef3c7}
      .rd-passage-body{max-height:min(62vh,520px);overflow:auto;padding:15px 17px;font-family:Georgia,'Times New Roman',serif;
        font-size:clamp(.9rem,3.4vw,1rem);line-height:1.72;white-space:pre-wrap;overflow-wrap:anywhere;scrollbar-width:thin}
      .rd-passage--expanded .rd-passage-body{max-height:none}
      .rd-missing{color:#92400e;font-style:italic;font-family:inherit}
      .rd-question{padding:16px}
      .rd-qlabel{margin:0 0 8px;font-size:.7rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:#b45309}
      .rd-prompt{margin:0 0 14px;font-family:Georgia,serif;font-size:clamp(1rem,3.9vw,1.22rem);line-height:1.5;font-weight:700;overflow-wrap:anywhere}
      .rd-say{border:0;background:transparent;font-size:1rem;cursor:pointer;margin-left:5px;vertical-align:middle}
      .rd-choices{display:flex;flex-direction:column;gap:8px}
      .rd-choice{display:flex;align-items:flex-start;gap:9px;width:100%;padding:11px 12px;border:2px solid #fcd34d;border-radius:13px;
        background:#fff;color:#451a03;font:inherit;font-size:.9rem;line-height:1.4;text-align:left;cursor:pointer;touch-action:manipulation;overflow-wrap:anywhere}
      .rd-choice:hover:not(:disabled){border-color:#d97706;background:#fffbeb}
      .rd-choice:disabled{cursor:default}
      .rd-choice .rd-chip{flex:none;width:23px;height:23px;border-radius:7px;background:#fde68a;color:#92400e;display:grid;place-items:center;font-size:.75rem;font-weight:900}
      .rd-choice--ok{border-color:#22c55e;background:#dcfce7}
      .rd-choice--ok .rd-chip{background:#22c55e;color:#fff}
      .rd-choice--bad{border-color:#f43f5e;background:#ffe4e6}
      .rd-choice--bad .rd-chip{background:#f43f5e;color:#fff}
      .rd-choice--dim{opacity:.6}
      .rd-input{width:100%;padding:12px;border:2px solid #fcd34d;border-radius:12px;font:inherit;font-size:1rem;color:#422006}
      .rd-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .rd-btn{border:0;border-radius:12px;padding:11px 16px;background:#fef3c7;color:#92400e;font:inherit;font-weight:800;font-size:.85rem;
        cursor:pointer;box-shadow:0 3px 0 #fde68a;touch-action:manipulation}
      .rd-btn:hover:not(:disabled){filter:brightness(1.05)}
      .rd-btn:disabled{opacity:.5;cursor:default}
      .rd-btn--main{background:#b45309;color:#fff;box-shadow:0 3px 0 #78350f}
      .rd-feedback{margin-top:13px;padding:13px 15px;border-radius:13px;font-size:.88rem;line-height:1.55;display:none;overflow-wrap:anywhere}
      .rd-feedback--show{display:block;animation:rd-pop .25s ease}
      .rd-feedback--ok{background:#dcfce7;border:1px solid #4ade80;color:#14532d}
      .rd-feedback--bad{background:#fff7ed;border:1px solid #fbbf24;color:#78350f}
      .rd-feedback strong{display:block;margin-bottom:4px}
      .rd-empty{margin:22px auto;max-width:420px;padding:30px 22px;text-align:center;border-radius:22px;background:linear-gradient(145deg,#fffbeb,#fef3c7);border:2px dashed #fcd34d}
      .rd-empty-icon{font-size:2.6rem}.rd-empty h2{margin:8px 0;font-size:1.2rem;color:#92400e}.rd-empty p{margin:0;color:#78350f;font-size:.9rem;line-height:1.5}
      @keyframes rd-pop{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:720px){.rd-layout{grid-template-columns:1fr}
        .rd-passage-body{max-height:30vh}.rd-passage--expanded .rd-passage-body{max-height:none}
        .rd-question{padding:13px}}
    </style>`;

    const questions = Array.isArray(ctx.questions) ? ctx.questions : [];
    if (!questions.length) {
      ctx.root.innerHTML = `${css}<div class="rd-wrap"><div class="rd-empty">
        <div class="rd-empty-icon">📖</div><h2>Nothing to read yet</h2>
        <p>Add a passage and comprehension questions to open the reading corner.</p>
      </div></div>`;
      ctx.finish();
      return;
    }

    const cfg = (ctx.game?.config && typeof ctx.game.config === 'object') ? ctx.game.config : {};
    const passage = String(cfg.passage || questions[0]?.metadata?.passage || '');
    const rounds = questions.map((q, i) => {
      const m = q.metadata || {};
      return {
        q,
        id: q.id ?? `reading-${i + 1}`,
        choices: choicesOf(q),
        answer: String(choicesOf(q).find((c) => c.is_correct)?.text ?? m.answer ?? '')
      };
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

    function feedback(ok, round, chosenIndex) {
      const el = ctx.root.querySelector('.rd-feedback');
      if (!el) return;
      const correctChoice = round.choices.find((c) => c.is_correct);
      const answer = correctChoice?.text || round.answer;
      el.className = `rd-feedback rd-feedback--show ${ok ? 'rd-feedback--ok' : 'rd-feedback--bad'}`;
      el.innerHTML = `<strong>${ok ? '✓ Well read!' : 'Not quite — check the passage'}</strong>
        ${answer ? `<div>Correct answer: <b>${E(answer)}</b></div>` : ''}
        ${round.q.explanation ? `<div style="margin-top:5px">${E(round.q.explanation)}</div>` : ''}
        <div class="rd-actions"><button type="button" class="rd-btn rd-btn--main rd-next">${index === rounds.length - 1 ? 'See results 🏁' : 'Next question →'}</button></div>`;
      el.querySelector('.rd-next').addEventListener('click', () => {
        index += 1;
        if (index >= rounds.length) finishOnce();
        else loadQuestion();
      });
    }

    function resolve(ok, response, chosenIndex) {
      if (locked) return;
      locked = true;
      grade(rounds[index], ok, response);
      ctx.ui.sound(ok);
      ctx.root.querySelectorAll('.rd-choice').forEach((el) => {
        el.disabled = true;
        const isCorrect = el.dataset.correct === 'true';
        if (isCorrect) el.classList.add('rd-choice--ok');
        else if (Number(el.dataset.index) === chosenIndex) el.classList.add('rd-choice--bad');
        else el.classList.add('rd-choice--dim');
      });
      const input = ctx.root.querySelector('.rd-input');
      if (input) input.disabled = true;
      feedback(ok, rounds[index], chosenIndex);
    }

    function loadQuestion() {
      locked = false;
      const round = rounds[index];
      const prompt = String(round.q.prompt || 'Answer this question');
      const panel = ctx.root.querySelector('.rd-question');
      panel.innerHTML = `<p class="rd-qlabel">Comprehension question ${index + 1} of ${rounds.length}</p>
        <p class="rd-prompt">${E(prompt)}<button type="button" class="rd-say" aria-label="Read question aloud">🔊</button></p>
        ${round.choices.length ? `<div class="rd-choices">
          ${round.choices.map((c, i) => `<button type="button" class="rd-choice" data-index="${i}" data-correct="${c.is_correct ? 'true' : 'false'}">
            <span class="rd-chip">${String.fromCharCode(65 + i)}</span><span>${E(c.text)}</span></button>`).join('')}
        </div>` : `<input class="rd-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type your answer">
          <div class="rd-actions"><button type="button" class="rd-btn rd-btn--main rd-submit">Check answer ✓</button>
          <button type="button" class="rd-btn rd-skip">Skip</button></div>`}
        <div class="rd-feedback"></div>`;
      panel.querySelector('.rd-say').addEventListener('click', () => ctx.speak(prompt));
      panel.querySelectorAll('.rd-choice').forEach((el) => {
        el.addEventListener('click', () => {
          const i = Number(el.dataset.index);
          const choice = round.choices[i];
          resolve(!!choice.is_correct, choice.text, i);
        });
      });
      const input = panel.querySelector('.rd-input');
      if (input) {
        const submit = () => {
          const value = input.value.trim();
          if (!value) { ctx.notify('Type an answer first.', 'info'); return; }
          const ok = !!round.answer && ctx.ui.norm(value) === ctx.ui.norm(round.answer);
          resolve(ok, value, -1);
        };
        panel.querySelector('.rd-submit').addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        panel.querySelector('.rd-skip').addEventListener('click', () => resolve(false, '', -1));
      }
      const progress = ctx.root.querySelector('.rd-progress');
      if (progress) progress.textContent = `${index + 1} / ${rounds.length}`;
    }

    ctx.root.innerHTML = `${css}<div class="rd-wrap">
      <div class="rd-head"><div><span class="rd-kicker">📖 Reading corner</span>
        <h2>${E(ctx.game?.title || 'Read & understand')}</h2></div>
        <span class="rd-progress">1 / ${rounds.length}</span></div>
      <div class="rd-layout">
        <aside class="rd-passage">
          <div class="rd-passage-head"><h3>📄 Passage</h3>
            <div class="rd-tools"><button type="button" class="rd-tool rd-listen">🔊 Listen</button>
              <button type="button" class="rd-tool rd-expand">Expand ↕</button></div></div>
          <div class="rd-passage-body">${passage ? E(passage) : '<p class="rd-missing">No passage was supplied for this activity. Answer using the question prompt.</p>'}</div>
        </aside>
        <section class="rd-question"></section>
      </div>
    </div>`;

    if (passage) ctx.root.querySelector('.rd-listen').addEventListener('click', () => ctx.speak(passage));
    else ctx.root.querySelector('.rd-listen').disabled = true;
    ctx.root.querySelector('.rd-expand').addEventListener('click', (e) => {
      const panel = ctx.root.querySelector('.rd-passage');
      panel.classList.toggle('rd-passage--expanded');
      e.target.textContent = panel.classList.contains('rd-passage--expanded') ? 'Collapse ↕' : 'Expand ↕';
    });
    loadQuestion();
  }
};
