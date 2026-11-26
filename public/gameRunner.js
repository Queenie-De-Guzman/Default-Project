import { GAME_MODULES } from './games/index.js';
import { gameUI, toast, speak, sound, gameSoundEnabled } from './ui.js';

export function runGame(root, game, questions, options = {}) {
  root.innerHTML = '';
  const module = GAME_MODULES[game.type] || GAME_MODULES.multiple_choice;
  let finished = false;
  const records = new Map();
  const ctx = {
    root,
    game,
    questions,
    ui: gameUI,
    sound,
    soundEnabled: gameSoundEnabled,
    notify: options.notify || ((msg, kind) => toast(msg, kind)),
    speak: options.speak || speak,
    record(rec) {
      const id = String(rec?.questionId ?? rec?.question_id ?? rec?.id ?? `item-${records.size + 1}`);
      if (!records.has(id)) records.set(id, { ...rec, questionId: rec?.questionId ?? id });
      options.onRecord?.(rec, records);
    },
    finish() {
      if (finished) return;
      finished = true;
      options.onFinish?.([...records.values()]);
    }
  };
  try {
    module.render(ctx);
  } catch (error) {
    console.error('Game render error', error);
    root.innerHTML = `<div class="empty"><div class="big">😕</div><h3>This game could not be displayed</h3>
      <p class="muted">${String(error.message || error)}</p></div>`;
    ctx.finish();
  }
  return { module, records, ctx, forceFinish: () => ctx.finish() };
}
