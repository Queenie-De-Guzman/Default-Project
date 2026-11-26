import { esc, toast, formatDate, sound, gameSoundEnabled, setGameSound, mountWorldMusic } from '../ui.js';
import { runGame } from '../gameRunner.js';

const fmtTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default async function gamePlayer(ctx) {
  const attemptId = ctx.params[1];
  const attempt = await ctx.api(`/api/attempts/${attemptId}`);
  const game = await ctx.api(`/api/games/${attempt.game_id}`);
  const meta = ctx.state.meta?.gameTypes?.find((g) => g.type === game.type);
  const showFeedback = attempt.status === 'completed' ? true : true;

  return {
    title: game.title,
    shell: false,
    html: `<div class="player">
      <div class="player-top">
        <button class="btn btn-ghost btn-sm" id="exit-btn">← Exit</button>
        <button class="btn btn-ghost btn-sm" id="world-btn">🌈 World</button>
        <div class="grow"><div class="muted tiny">${esc(meta?.title || game.type)} • ${esc(game.grade_level || 'All levels')}</div>
          <strong class="small">${esc(game.title)}</strong></div>
        ${game.time_limit ? `<div class="timer-pill" id="timer">⏱ ${fmtTime(game.time_limit)}</div>` : ''}
        <button class="gw-icon-btn" id="gw-music" aria-label="Toggle music" aria-pressed="false">🎵</button>
        <button class="sound-toggle" id="sound-toggle" aria-label="Toggle game sounds" aria-pressed="${gameSoundEnabled()}">
          ${gameSoundEnabled() ? '🔊' : '🔇'}<span> Sound</span>
        </button>
        <div class="score-pill" id="score-pill">⭐ <span id="score">0</span> pts</div>
      </div>
      <div class="player-card">
        <div class="player-head">
          <div><h2 style="margin:0">${meta?.icon || '🎮'} ${esc(game.title)}</h2>
            <div class="muted small">${esc(game.description || 'Answer all items to finish the activity.')}</div></div>
          <span class="chip chip-indigo">${esc(game.difficulty)}</span>
        </div>
        <div class="player-stage" id="stage"></div>
        <div class="player-foot"><span id="progress-text">Let's get started!</span>
          <div class="gw-progress" style="flex:1;max-width:260px"><span id="game-progress-bar" style="width:0%"></span></div>
          <button class="gw-hint-btn" id="hint-btn">💡 Hint</button>
          <span>${esc(game.questions.length)} items • ${game.points_per_question} pts each</span></div>
      </div>
      <div class="gw-intro" id="game-intro">
        <div class="gw-intro-card">
          <div class="gw-intro-mascot"><img src="/assets/gameworld/mascot.svg" alt="" width="120"></div>
          <span class="gw-eyebrow">Pip says: ready when you are</span>
          <h2>${esc(game.title)}</h2>
          <p>${esc(game.description || 'Play the activity, answer carefully, and collect stars along the way.')}</p>
          <div class="gw-intro-steps">
            <div class="gw-intro-step">1. Read or listen</div>
            <div class="gw-intro-step">2. Choose your answer</div>
            <div class="gw-intro-step">3. Collect stars ★</div>
          </div>
          <button class="gw-btn gw-btn-primary" id="game-start">▶ Start Game</button>
        </div>
      </div>
    </div>`,
    mount(el) {
      const stage = el.querySelector('#stage');
      const scoreEl = el.querySelector('#score');
      const progressEl = el.querySelector('#progress-text');
      const timerEl = el.querySelector('#timer');
      let finished = false;
      let startedAt = Date.now();
      let timer = null;
      let runner;
      let lastTickSecond = null;

      const stopTimer = () => { if (timer) clearInterval(timer); timer = null; };

      const soundButton = el.querySelector('#sound-toggle');
      const paintSoundButton = () => {
        const on = gameSoundEnabled();
        soundButton.setAttribute('aria-pressed', String(on));
        soundButton.innerHTML = `${on ? '🔊' : '🔇'}<span> Sound</span>`;
      };
      soundButton.addEventListener('click', () => {
        setGameSound(!gameSoundEnabled());
        paintSoundButton();
      });

      stage.addEventListener('click', (event) => {
        const target = event.target instanceof Element
          ? event.target.closest('button, .opt, .tile, .word, [data-choice], [data-card], [data-answer]')
          : null;
        if (!target || target.disabled) return;
        sound('click');
        target.classList.add('game-pulse');
        setTimeout(() => target.classList.remove('game-pulse'), 240);
      });

      const recalc = (records) => {
        let earned = 0, max = 0, correct = 0;
        records.forEach((rec) => {
          const q = game.questions.find((x) => String(x.id) === String(rec.questionId));
          const mp = Number(rec.maxPoints ?? q?.points ?? game.points_per_question ?? 1);
          max += mp;
          if (rec.correct) { earned += Number(rec.points ?? mp); correct++; }
        });
        scoreEl.textContent = earned;
        progressEl.textContent = `${correct} correct • ${records.size}/${game.questions.length} items answered`;
        const bar = el.querySelector('#game-progress-bar');
        if (bar) bar.style.width = `${Math.min(100, records.size / Math.max(1, game.questions.length) * 100)}%`;
        return { earned, max, correct };
      };

      const startTimer = () => {
        if (!game.time_limit || timer) return;
        startedAt = Date.now();
        timer = setInterval(() => {
          const left = game.time_limit - (Date.now() - startedAt) / 1000;
          timerEl.textContent = `⏱ ${fmtTime(left)}`;
          timerEl.classList.toggle('low', left <= 15);
          const whole = Math.ceil(left);
          if (left > 0 && left <= 10 && whole !== lastTickSecond) {
            lastTickSecond = whole;
            sound('tick');
          }
          if (left <= 0) { stopTimer(); if (!finished) runner?.forceFinish(); }
        }, 250);
      };

      const hintButton = el.querySelector('#hint-btn');
      let hintCount = 0;
      hintButton?.addEventListener('click', () => {
        hintCount += 1;
        const answered = runner?.records?.size || 0;
        const question = game.questions[Math.min(answered, game.questions.length - 1)];
        const metadata = question?.metadata || {};
        const hint = metadata.hint || metadata.tip || question?.explanation
          || 'Look at the question again and choose the answer that matches what you know.';
        el.querySelector('#progress-text').textContent = `💡 Hint ${hintCount}: ${String(hint).slice(0, 110)}`;
        sound('click');
      });

      const celebrate = () => {
        const layer = document.createElement('div');
        layer.className = 'gw-confetti';
        const colors = ['#fbbf24', '#f472b6', '#34d399', '#60a5fa', '#a78bfa'];
        for (let i = 0; i < 50; i += 1) {
          const piece = document.createElement('i');
          piece.style.left = `${Math.random() * 100}%`;
          piece.style.background = colors[i % colors.length];
          piece.style.animationDelay = `${Math.random() * .7}s`;
          piece.style.transform = `rotate(${Math.random() * 180}deg)`;
          layer.appendChild(piece);
        }
        document.body.appendChild(layer);
        setTimeout(() => layer.remove(), 3200);
      };

      const finishGame = async (records) => {
        if (finished) return;
        finished = true;
        stopTimer();
        const { earned, max, correct } = recalc(new Map(records.map((r) => [String(r.questionId), r])));
        const timeSpent = Math.round((Date.now() - startedAt) / 1000);
        stage.innerHTML = `<div class="center" style="padding:2rem"><div class="muted">Saving your results…</div></div>`;
        try {
          const result = await ctx.api(`/api/attempts/${attempt.id}/submit`, {
            method: 'POST',
            body: { answers: records, details: { gameType: game.type, finishedAt: new Date().toISOString() }, time_spent: timeSpent }
          });
          const emoji = result.percentage >= 95 ? '🏆' : result.percentage >= 75 ? '🎉' : result.percentage >= 50 ? '👍' : '💪';
          const feedback = result.show_feedback ? `<div class="card card-pad" style="box-shadow:none;text-align:left;margin-top:1rem">
            <h3>Answer review</h3>
            ${result.graded.filter((g) => g.explanation).map((g, i) => `<div class="row" style="padding:.4rem 0;border-bottom:1px solid var(--line);align-items:flex-start">
              <span>${g.correct ? '✅' : '❌'}</span><div class="small">${esc(g.explanation)}</div></div>`).join('') || '<p class="muted small">No explanations were provided for this game.</p>'}
          </div>` : '';
          stage.innerHTML = `<div class="result-hero">
            <div class="result-emoji">${emoji}</div>
            <h2>${result.percentage >= 75 ? 'Great work!' : 'Good effort — keep practicing!'}</h2>
            <div class="result-score">${result.percentage}%</div>
            <div class="stars" style="font-size:1.8rem">${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}</div>
            <p class="muted">${result.correct} of ${result.total} correct • ${result.points} of ${result.max_points} points</p>
            <div class="reward-strip">
              ${result.rewards.map((r) => `<div class="reward">${r.icon} ${esc(r.name)} +${r.points}</div>`).join('')}
              ${result.passed ? '<div class="reward">🎯 Activity passed</div>' : ''}
              ${result.world ? `<div class="reward">★ +${result.world.stars || 0} world stars</div><div class="reward">● +${result.world.coins || 0} coins</div><div class="reward">🚀 Level ${result.world.level || 1}</div>` : ''}
              ${(result.world?.badges || []).slice(-2).map((b) => `<div class="reward">${b}</div>`).join('')}
            </div>
            <div class="row" style="justify-content:center;margin-top:1rem">
              <button class="btn btn-primary btn-lg" id="again-btn">${attempt.assignment_id && (attempt.assignment?.allow_retry ?? game.allow_retry) ? 'Play again ↻' : 'Back to dashboard'}</button>
              <button class="btn btn-soft btn-lg" id="world-result-btn">🌈 Return to world</button>
              <button class="btn btn-soft btn-lg" id="next-level-btn">Next level →</button>
              <button class="btn btn-ghost btn-lg" id="home-btn">My learning</button>
            </div>
            ${feedback}
          </div>`;
          sound(result.stars >= 2 ? 'win' : 'reward');
          if (result.stars >= 2) celebrate();
          stage.querySelector('#home-btn').onclick = () => ctx.go('student');
          stage.querySelector('#world-result-btn').onclick = () => ctx.go('student/world');
          stage.querySelector('#next-level-btn').onclick = () => ctx.go('student/world/map');
          stage.querySelector('#again-btn').onclick = async () => {
            if (!attempt.assignment_id || !(attempt.assignment?.allow_retry ?? game.allow_retry)) return ctx.go('student');
            try {
              const next = await ctx.api('/api/attempts', { method: 'POST', body: { assignment_id: attempt.assignment_id } });
              ctx.go(`student/play/${next.attempt.id}`);
            } catch (error) {
              if (error.status === 403) { toast('This activity allows only one attempt.', 'error'); ctx.go('student'); }
              else toast(error.message, 'error');
            }
          };
        } catch (error) {
          stage.innerHTML = `<div class="empty"><div class="big">😕</div><h3>Could not save your result</h3><p class="muted">${esc(error.message)}</p>
            <button class="btn btn-primary" id="home-btn">Back to dashboard</button></div>`;
          stage.querySelector('#home-btn').onclick = () => ctx.go('student');
        }
      };

      const intro = el.querySelector('#game-intro');
      const startGame = () => {
        if (intro) intro.remove();
        sound('start');
        startTimer();
        runner = runGame(stage, game, game.questions, {
          notify: (msg, kind) => toast(msg, kind),
          onRecord: (rec, records) => recalc(records),
          onFinish: finishGame
        });
      };
      el.querySelector('#game-start')?.addEventListener('click', startGame);
      el.querySelector('#world-btn').onclick = () => ctx.go('student/world');
      el.querySelector('#exit-btn').onclick = () => {
        if (finished) return ctx.go('student/world');
        if (ctx.confirmDialog) {
          ctx.confirmDialog('Leave activity?', 'Your current progress will not be saved.', 'Leave').then((yes) => { if (yes) ctx.go('student/world'); });
        } else ctx.go('student/world');
      };
      const stopMusic = mountWorldMusic(el);
      el.__cleanupPresentation = () => { stopTimer(); stopMusic?.(); };
    }
  };
}
