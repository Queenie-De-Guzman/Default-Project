// EduPlay – original drag-and-drop answer game. Source-grounded: every draggable
// item comes from the question's saved answer choices.

export default {
  meta: {
    type: 'drag_drop',
    title: 'Drop & Learn',
    icon: '🧲',
    blurb: 'Drag the right answer into the answer nest. Works with touch, mouse and keyboard.',
    editorFields: [
      { key: 'hint', label: 'Hint (optional)' }
    ]
  },

  render(ctx) {
    const { root, game, questions, ui, record, finish } = ctx;
    const E = ui.esc;
    if (!questions.length) {
      root.innerHTML = '<div class="empty"><div class="big">🧲</div><h3>No drag-and-drop items yet</h3><p>Add questions with answers in the game builder.</p></div>';
      finish();
      return;
    }

    const maxPoints = (q) => {
      const value = Number(q.points ?? game.points_per_question ?? 1);
      return Number.isFinite(value) && value > 0 ? value : 1;
    };
    let index = 0;
    let answered = 0;
    let done = false;

    function paint() {
      const q = questions[index];
      const choices = ui.shuffle((q.choices || []).map((c, i) => ({
        ...c,
        id: c.id ?? `choice-${i}`,
        text: c.text ?? `Option ${i + 1}`
      })));
      const correct = choices.find((c) => c.is_correct) || choices[0];
      const metadata = q.metadata || {};
      const hint = metadata.hint || q.hint || '';
      let selected = null;

      root.innerHTML = `<div class="q-title">${E(q.prompt || 'Drag the correct answer into the box.')}</div>
        ${q.media_url ? `<img class="q-media" src="${E(q.media_url)}" alt="">` : ''}
        <div class="gw-hud">
          <strong>${index + 1} / ${questions.length}</strong>
          <div class="gw-progress"><span style="width:${index / questions.length * 100}%"></span></div>
          <button class="gw-hint-btn" id="dd-hint">💡 Hint</button>
        </div>
        <p class="muted small">Drag a card into the answer nest, or tap a card then press Enter in the nest.</p>
        <div class="gw-drop-grid" style="margin:1rem 0">
          ${choices.map((c, i) => `<div class="gw-draggable" data-choice="${i}" tabindex="0" role="button" aria-label="Answer choice: ${E(c.text)}">${E(c.text)}</div>`).join('')}
        </div>
        <div class="gw-dropzone" id="dd-drop" tabindex="0" role="button" aria-label="Answer drop zone">Drop your answer here</div>
        <div class="feedback" id="dd-feedback" style="margin-top:1rem"></div>
        <div class="row" style="margin-top:1rem"><button class="game-btn" id="dd-next" disabled>Next →</button></div>`;

      const zone = root.querySelector('#dd-drop');
      const feedback = root.querySelector('#dd-feedback');
      const next = root.querySelector('#dd-next');

      root.querySelector('#dd-hint').addEventListener('click', () => {
        feedback.className = 'feedback ok';
        feedback.textContent = hint || q.explanation || 'Look for the answer that matches the question exactly.';
        ui.sound('click');
      });

      function settle(choice, correctFlag) {
        if (done) return;
        done = true;
        answered += 1;
        record({
          questionId: q.id,
          correct: correctFlag,
          response: String(choice?.text ?? ''),
          points: correctFlag ? maxPoints(q) : 0,
          maxPoints: maxPoints(q),
          explanation: q.explanation || ''
        });
        ui.sound(correctFlag);
        zone.classList.remove('over');
        zone.classList.add(correctFlag ? 'correct' : 'wrong');
        zone.textContent = `${correctFlag ? '✅' : '❌'} ${choice?.text || ''}`;
        feedback.className = `feedback ${correctFlag ? 'ok' : 'no'}`;
        feedback.textContent = correctFlag
          ? (q.explanation || 'Correct! Nice work.')
          : `Not quite. The answer is "${correct.text}". ${q.explanation || ''}`.trim();
        next.disabled = false;
        root.querySelectorAll('.gw-draggable').forEach((el) => el.classList.add('placed'));
      }

      function attempt(choice) {
        if (done || !choice) return;
        settle(choice, String(choice.id) === String(correct.id) || ui.norm(choice.text) === ui.norm(correct.text));
      }

      root.querySelectorAll('.gw-draggable').forEach((item) => {
        const choice = choices[Number(item.dataset.choice)];
        item.addEventListener('click', () => {
          if (done) return;
          selected = choice;
          zone.classList.add('over');
          zone.textContent = `Ready to drop: ${choice.text} — press Enter`;
          ui.sound('click');
        });
        item.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
        });
        item.addEventListener('dragstart', (event) => {
          event.dataTransfer?.setData('text/plain', String(choice.id));
          item.classList.add('placed');
        });
        item.addEventListener('pointerdown', (event) => {
          if (done || event.button !== 0) return;
          const ghost = item.cloneNode(true);
          ghost.style.position = 'fixed';
          ghost.style.zIndex = '999';
          ghost.style.pointerEvents = 'none';
          ghost.style.width = `${item.offsetWidth}px`;
          ghost.style.opacity = '.9';
          document.body.appendChild(ghost);
          const move = (e) => {
            ghost.style.left = `${e.clientX - item.offsetWidth / 2}px`;
            ghost.style.top = `${e.clientY - item.offsetHeight / 2}px`;
            const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('#dd-drop');
            zone.classList.toggle('over', Boolean(under));
          };
          const up = (e) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            ghost.remove();
            const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('#dd-drop');
            if (under) attempt(choice);
            else zone.classList.remove('over');
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up, { once: true });
        });
      });

      zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        const id = event.dataTransfer?.getData('text/plain');
        attempt(choices.find((c) => String(c.id) === id));
      });
      zone.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && selected) { event.preventDefault(); attempt(selected); }
      });

      next.addEventListener('click', () => {
        if (index >= questions.length - 1) finish();
        else { index += 1; done = false; paint(); }
      });
    }

    paint();
  }
};
