import { esc, shuffle, norm, choicesOf, sound, wait, pick, toast, speak } from '../ui.js';

export default {
  meta: {
    type: 'listening',
    title: 'Listening Lab',
    icon: '🎧',
    blurb: 'Play teacher audio (or speech), then answer what you heard. Replay as often as you like.',
    editorFields: [
      { key: 'audio_url', label: 'Audio URL (optional)', type: 'text', placeholder: 'https://…/clip.mp3' },
      { key: 'listen_text', label: 'Text to speak (when no audio)', type: 'text', placeholder: 'The sentence students will hear' }
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
      .lst-app{font-family:inherit;max-width:720px;margin:0 auto;color:#242b5b}
      .lst-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .lst-badge{background:linear-gradient(135deg,#3a86ff,#8338ec);color:#fff;padding:8px 14px;border-radius:999px;font-weight:900;box-shadow:0 4px 12px #8338ec55}
      .lst-sub{font-size:.9rem;font-weight:700;color:#66709a}
      .lst-card{background:#fff;border-radius:20px;padding:18px;border:2px solid #d7e3ff;box-shadow:0 12px 30px #242b5b14}
      .lst-player{border-radius:18px;background:linear-gradient(135deg,#eef4ff,#e7e0ff);padding:18px;text-align:center;border:2px solid #d7e3ff}
      .lst-player.lst-playing{animation:lstGlow 1s ease infinite alternate}
      @keyframes lstGlow{to{box-shadow:0 0 0 8px #8338ec22}}
      .lst-play{width:88px;height:88px;border-radius:50%;border:0;background:linear-gradient(135deg,#3a86ff,#8338ec);color:#fff;font-size:2.2rem;cursor:pointer;box-shadow:0 8px 18px #8338ec66;touch-action:manipulation}
      .lst-play:active{transform:scale(.94)}
      .lst-wave{display:flex;justify-content:center;align-items:flex-end;gap:4px;height:26px;margin-top:12px}
      .lst-wave i{width:5px;height:8px;background:#8338ec;border-radius:3px;opacity:.35}
      .lst-playing .lst-wave i{animation:lstBar .6s ease infinite alternate;opacity:1}
      .lst-wave i:nth-child(2){animation-delay:.1s}.lst-wave i:nth-child(3){animation-delay:.2s}.lst-wave i:nth-child(4){animation-delay:.3s}.lst-wave i:nth-child(5){animation-delay:.4s}
      @keyframes lstBar{to{height:24px}}
      .lst-hint{font-size:.85rem;color:#66709a;font-weight:700;margin:10px 0 0}
      .lst-prompt{font-size:1.12rem;font-weight:800;margin:16px 0 10px;line-height:1.45}
      .lst-choices{display:grid;gap:8px}
      @media(min-width:520px){.lst-choices{grid-template-columns:1fr 1fr}}
      .lst-choice{min-height:46px;border:2px solid #cfdcff;background:#f7faff;border-radius:12px;padding:12px;font-weight:700;font-size:1rem;cursor:pointer;touch-action:manipulation;color:#242b5b}
      .lst-choice:hover{border-color:#8338ec;background:#f0eaff}
      .lst-form{display:flex;gap:8px;flex-wrap:wrap}
      .lst-input{flex:1 1 190px;min-width:0;padding:12px;border:2px solid #cfdcff;border-radius:12px;font-size:1rem;outline:none}
      .lst-input:focus{border-color:#8338ec;box-shadow:0 0 0 3px #8338ec33}
      .lst-btn{border:0;border-radius:12px;min-height:46px;padding:12px 16px;font-weight:800;cursor:pointer;touch-action:manipulation;background:linear-gradient(135deg,#3a86ff,#8338ec);color:#fff}
      .lst-feedback{margin-top:12px;padding:10px 12px;border-radius:12px;font-weight:700;line-height:1.5}
      .lst-ok{background:#e1f8ec;color:#0d6b45}.lst-no{background:#ffece6;color:#a53a20}
      .lst-next{margin-top:12px}
      .lst-empty{text-align:center;padding:40px 16px;background:#fff;border-radius:20px;border:2px dashed #cfdcff;color:#66709a}
    </style>`;

    root.innerHTML = `${style}<div class="lst-app"></div>`;
    const app = root.querySelector('.lst-app');

    if (!questions.length) {
      app.innerHTML = `<div class="lst-empty"><div style="font-size:3rem">🎧</div><b>Nothing to listen to yet!</b><p>Add audio questions to use the Listening Lab.</p></div>`;
      note('No questions available for Listening Lab.', 'info');
      done();
      return;
    }

    const score = (q, correct, response) => {
      if (seen.has(q)) return;
      seen.add(q);
      record({ questionId: q.id, correct: !!correct, response, points: correct ? maxP(q) : 0, maxPoints: maxP(q), explanation: q.explanation || '' });
    };

    let idx = 0;
    let locked = false;

    function paint() {
      const q = questions[idx];
      const url = String(q.metadata?.audio_url || '');
      const listenText = String(q.metadata?.listen_text || q.prompt || '');
      const correctText = String(choicesOf(q).find((c) => c.is_correct)?.text ?? q.metadata?.answer ?? '');
      const choices = shuffle(choicesOf(q));
      locked = false;

      app.innerHTML = `
        <header class="lst-head"><span class="lst-badge">🎧 Listening Lab</span><span class="lst-sub">Question ${idx + 1} / ${questions.length}</span></header>
        <section class="lst-card">
          <div class="lst-player" id="lst-player">
            <button class="lst-play" type="button" id="lst-play" aria-label="Play audio">▶️</button>
            <div class="lst-wave"><i></i><i></i><i></i><i></i><i></i></div>
            <p class="lst-hint">${url ? 'Tap to play the recording · tap again to replay' : 'Tap to hear the sentence spoken aloud'}</p>
            ${url ? `<audio id="lst-audio" src="${E(url)}" preload="none"></audio>` : ''}
          </div>
          <p class="lst-prompt">${E(q.prompt || 'What did you hear?')}</p>
          ${choices.length ? `<div class="lst-choices">${choices.map((c, i) => `<button class="lst-choice" type="button" data-i="${i}">${String.fromCharCode(65 + i)}. ${E(c.text)}</button>`).join('')}</div>` : `<form class="lst-form"><input class="lst-input" id="lst-answer" autocomplete="off" placeholder="Type what you heard..."><button class="lst-btn" type="submit">Check ✅</button></form>`}
          <div id="lst-feedback" aria-live="polite"></div>
        </section>`;

      const player = app.querySelector('#lst-player');
      const audio = app.querySelector('#lst-audio');
      let stopTimer = null;

      const play = () => {
        player.classList.add('lst-playing');
        window.clearTimeout(stopTimer);
        if (audio) {
          audio.currentTime = 0;
          const p = audio.play();
          if (p && typeof p.catch === 'function') p.catch(() => { note('Audio could not play — try the replay button.', 'error'); player.classList.remove('lst-playing'); });
        } else {
          say(listenText);
          stopTimer = window.setTimeout(() => player.classList.remove('lst-playing'), Math.min(6000, Math.max(1800, listenText.length * 90)));
        }
        app.querySelector('#lst-play').textContent = '🔁';
      };
      if (audio) audio.addEventListener('ended', () => player.classList.remove('lst-playing'));
      app.querySelector('#lst-play').addEventListener('click', play);

      const check = (response, ok) => {
        if (locked) return;
        locked = true;
        score(q, ok, response);
        sound(ok);
        say(ok ? 'Correct answer!' : 'Listen again.');
        app.querySelectorAll('.lst-choice, .lst-btn').forEach((b) => { b.disabled = true; });
        app.querySelector('#lst-feedback').innerHTML = `
          <div class="lst-feedback ${ok ? 'lst-ok' : 'lst-no'}">${ok ? '🎉 Correct!' : `❌ The answer was <b>${E(correctText)}</b>.`}${q.explanation ? `<br>${E(q.explanation)}` : ''}</div>
          <div class="lst-next"><button class="lst-btn" type="button" id="lst-next">${idx === questions.length - 1 ? 'See results 🏁' : 'Next question →'}</button></div>`;
        app.querySelector('#lst-next').addEventListener('click', () => {
          if (idx === questions.length - 1) done();
          else { idx++; paint(); }
        });
      };

      app.querySelectorAll('.lst-choice').forEach((b) => b.addEventListener('click', () => {
        const c = choices[Number(b.dataset.i)];
        check(c.text, c.is_correct || norm(c.text) === norm(correctText));
      }));

      app.querySelector('.lst-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const val = app.querySelector('#lst-answer').value.trim();
        const a = norm(val), b = norm(correctText);
        check(val, !!a && !!b && (a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))));
      });
    }

    paint();
  }
};
