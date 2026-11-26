# EduPlay game module contract

Every file in `public/games/` exports one game module via ES module `export default`:

```js
export default {
  meta: {
    type: 'matching',            // unique snake_case id, must equal file name
    title: 'Matching Game',
    icon: '🧩',
    blurb: 'Short teacher-facing description.',
    editorFields: [              // extra metadata fields shown in the teacher question editor
      { key: 'left', label: 'Left item', type: 'text', placeholder: 'e.g. Photosynthesis' },
      { key: 'right', label: 'Right item', type: 'text', placeholder: 'e.g. Making food in plants' },
      { key: 'image', label: 'Image URL (optional)', type: 'text' }
    ],
    recommendedFor: ['English', 'Science']
  },
  render(ctx) { /* build DOM inside ctx.root */ }
};
```

`render(ctx)` receives exactly this context (do not import server code):

| key | meaning |
| --- | --- |
| `ctx.root` | an empty `HTMLElement`; put ALL your markup/event listeners inside it |
| `ctx.game` | `{ id, title, type, description, config, points_per_question, time_limit, difficulty }` (`config` is already parsed from JSON) |
| `ctx.questions` | array of `{ id, prompt, explanation, points, media_url, metadata, choices }` where `metadata` is already parsed and `choices` is `[{ id, text, is_correct, media_url, feedback }]` |
| `ctx.record(rec)` | call once for every scored item. `rec = { questionId, correct: Boolean, response: any, points, maxPoints, explanation }`. `points`/`maxPoints` are numbers; if omitted the shell uses `question.points ?? game.points_per_question ?? 1`. Repeat calls with the same `questionId` are ignored by the shell (first record wins), so call once per question. |
| `ctx.finish()` | call when the activity is over. The shell then shows results and saves the attempt. Call it after the last `record()`. |
| `ctx.notify(message, kind)` | toast; kind is `success`, `error`, or `info` |
| `ctx.speak(text)` | uses browser speech synthesis when available |
| `ctx.ui` | helpers: `esc(str)`, `shuffle(array)`, `norm(str)`, `pick(array)`, `wait(ms)`, `sound(ok)` |

Rules:
- Use `ctx.ui.esc()` for any teacher-entered text injected into HTML.
- No external libraries, no network calls. Use inline SVG/emoji/CSS for visuals.
- Every game must be playable with mouse **and** touch/keyboard where sensible, and work on a 360px-wide screen.
- Always handle `ctx.questions.length === 0` with a friendly message and `ctx.finish()`.
- Never call `ctx.finish()` more than once.
- Correctness: compare teacher-defined `is_correct` flags or `metadata.answer`; be tolerant of case/spacing via `ctx.ui.norm()`.
- Keep each module self-contained; import only `../ui.js` if you need shared helpers (or just use `ctx.ui`).
- Use CSS classes prefixed with your game type (e.g. `.mch-board`) and add a `<style>` tag inside your markup when you need custom styles.
- Generic question types (`multiple_choice`, `true_false`, `fill_blank`, etc.) still need their own distinct presentation — do not reuse another module wholesale.

`answerChoices(question)` helper is available from `../ui.js` if useful:

```js
import { choicesOf } from '../ui.js';
```
