import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'pronunciation',
    title: 'Pronunciation Studio',
    icon: '🎤',
    blurb: 'Listen to each word, say it into the microphone (or practise and mark done), and track progress.',
    editorFields: [
      { key: 'word', label: 'Word or phrase to say', type: 'text', placeholder: 'e.g. butterfly' },
      { key: 'tip', label: 'Pronunciation tip', type: 'text', placeholder: 'e.g. Say each syllable slowly' },
      { key: 'lang', label: 'Speech language code', type: 'text', placeholder: 'e.g. en-US' }
    ],
    recommendedFor: ['English', 'Languages']
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
      .pro-app{font-family:inherit;max-width:720px;margin:0 auto;color:#342146}
      .pro-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .pro-badge{background:linear-gradient(135deg,#f72585,#4cc9f0);color:#fff;padding:8px 14px;border-radius:999px;font-weight:900;box-shadow:0 4px 12px #f7258555}
      .pro-dots{display:flex;gap:5px;flex-wrap:wrap}
      .pro-dot{width:13px;height:13px;border-radius:50%;background:#e3d9f0;border:2px solid #c4b2dc}
      .pro-dot.pro-done{background:#f72585;border-color:#f72585}
      .pro-dot.pro-now{background:#4cc9f0;border-color:#4cc9f0;transform:scale(1.2)}
      .pro-card{background:#fff;border-radius:20px;padding:18px;border:2px solid #f3d9ea;box-shadow:0 12px 30px #34214614;text-align:center}
      .pro-word{font-size:clamp(2rem,8vw,3.4rem);font-weight:900;line-height:1.15;margin:10px 0;overflow-wrap:anywhere;color:#4a1d5e}
      .pro-tip{background:#fff5fa;border-left:4px solid #f72585;border-radius:10px;padding:10px 12px;text-align:left;font-weight:700;font-size:.9rem;line-height:1.5;margin:12px 0}
      .pro-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}
      .pro-btn{border:0;border-radius:14px;min-height:50px;padding:12px 16px;font-weight:900;font-size:1rem;cursor:pointer;touch-action:manipulation}
      .pro-listen{background:linear-gradient(135deg,#4cc9f0,#4361ee);color:#fff}
      .pro-mic{background:linear-gradient(135deg,#f72585,#7209b7);color:#fff}
      .pro-done{background:#e8f9ef;color:#0d6b45;border:2px solid #22a06b}
      .pro-btn.pro-rec{animation:proRec .8s ease infinite alternate}
      @keyframes proRec{to{box-shadow:0 0 0 8px #f7258544}}
      .pro-feedback{margin-top:14px;min-height:26px;font-weight:800;line-height:1.5}
      .pro-ok{color:#0d6b45}.pro-no{color:#b4451e}
      .pro-next{margin-top:12px}
      .pro-next button{width:100%;border:0;border-radius:12px;min-height:48px;background:#342146;color:#fff;font-weight:900;cursor:pointer}
      .pro-empty{text-align:center;padding:40px 16px;background:#fff;border-radius:20px;border:2px dashed #f3d9ea;color:#7b6a8c}
    </style>`;

    root.innerHTML = `${style}<div class="pro-app"></div>`;
    const app = root.querySelector('.pro-app');

    if (!questions.length) {
      app.innerHTML = `<div class="pro-empty"><div style="font-size:3rem">🎤</div><b>No words to practise!</b><p>Add pronunciation questions to open the studio.</p></div>`;
      note('No questions available for Pronunciation Studio.', 'info');
      done();
      return;
    }

    const score = (q, correct, response) => {
      if (seen.has(q)) return;
      seen.add(q);
      record({ questionId: q.id, correct: !!correct, response, points: correct ? maxP(q) : 0, maxPoints: maxP(q), explanation: q.explanation || '' });
    };

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    let rec = null;
    let idx = 0;
    let locked = false;
    let right = 0;

    const stopRec = () => { if (rec) { try { rec.abort(); } catch { /* ignore */ } rec = null; } };

    function paint() {
      const q = questions[idx];
      const correctText = String(q.metadata?.word ?? choicesOf(q).find((c) => c.is_correct)?.text ?? q.prompt ?? '').trim().slice(0, 60);
      const word = correctText || 'hello';
      const tip = String(q.metadata?.tip || 'Break the word into small parts, say each part slowly, then say it smoothly.');
      locked = false;
      stopRec();

      app.innerHTML = `
        <header class="pro-head"><span class="pro-badge">🎤 Pronunciation Studio</span><div class="pro-dots">${questions.map((_, i) => `<span class="pro-dot ${seen.has(questions[i]) ? 'pro-done' : ''} ${i === idx ? 'pro-now' : ''}"></span>`).join('')}</div></header>
        <section class="pro-card">
          <div style="font-size:.8rem;font-weight:800;color:#7b6a8c;text-transform:uppercase;letter-spacing:.06em">Word ${idx + 1} of ${questions.length}</div>
          <div class="pro-word">“${E(word)}”</div>
          <div class="pro-tip">💡 <b>Tip:</b> ${E(tip)}${q.explanation ? ` ${E(q.explanation)}` : ''}</div>
          <div class="pro-actions">
            <button class="pro-btn pro-listen" type="button" id="pro-listen">🔊 Listen</button>
            ${SR ? `<button class="pro-btn pro-mic" type="button" id="pro-mic">🎤 Say it</button>` : ''}
            <button class="pro-btn pro-done" type="button" id="pro-skip">${SR ? '✍️ Practise &amp; mark done' : '✅ I practised — mark done'}</button>
          </div>
          <div class="pro-feedback" id="pro-feedback" aria-live="polite"></div>
          <div class="pro-next" id="pro-next"></div>
        </section>`;

      app.querySelector('#pro-listen').addEventListener('click', () => say(word));

      const finishItem = (heard, ok) => {
        if (locked) return;
        locked = true;
        stopRec();
        score(q, ok, heard);
        if (ok) right++;
        sound(ok);
        say(ok ? 'Great pronunciation!' : 'Good try — listen once more.');
        const fb = app.querySelector('#pro-feedback');
        fb.className = `pro-feedback ${ok ? 'pro-ok' : 'pro-no'}`;
        fb.innerHTML = ok ? `🌟 Excellent! "${E(word)}" sounded great.` : `👍 Heard “${E(heard || 'nothing')}”. Keep practising “${E(word)}”.`;
        app.querySelectorAll('.pro-btn').forEach((b) => { b.disabled = true; b.classList.remove('pro-rec'); });
        app.querySelector('#pro-next').innerHTML = `<button type="button">${idx === questions.length - 1 ? 'See results 🏁' : 'Next word →'}</button>`;
        app.querySelector('#pro-next button').addEventListener('click', () => {
          if (idx === questions.length - 1) done();
          else { idx++; paint(); }
        });
      };

      app.querySelector('#pro-skip').addEventListener('click', () => finishItem('practised', true));

      if (SR) {
        app.querySelector('#pro-mic').addEventListener('click', () => {
          if (locked) return;
          stopRec();
          try {
            rec = new SR();
            rec.lang = String(q.metadata?.lang || navigator.language || 'en-US');
            rec.interimResults = false;
            rec.maxAlternatives = 3;
            const mic = app.querySelector('#pro-mic');
            mic.classList.add('pro-rec');
            mic.textContent = '🎙️ Listening…';
            rec.onresult = (e) => {
              const heard = Array.from(e.results[0] || []).map((a) => a.transcript).join(' ');
              const h = norm(heard);
              const w = norm(word);
              const ok = !!h && !!w && (h === w || (w.length > 3 && h.includes(w)) || (h.length > 3 && w.includes(h)));
              finishItem(heard, ok);
            };
            rec.onerror = () => {
              mic.classList.remove('pro-rec');
              mic.textContent = '🎤 Say it';
              note('Microphone unavailable — use “Practise & mark done”.', 'error');
            };
            rec.onend = () => { if (!locked) { mic.classList.remove('pro-rec'); mic.textContent = '🎤 Say it'; } };
            rec.start();
          } catch {
            note('Speech recognition is not available here — use “Practise & mark done”.', 'info');
          }
        });
      }
    }

    paint();
  }
};
