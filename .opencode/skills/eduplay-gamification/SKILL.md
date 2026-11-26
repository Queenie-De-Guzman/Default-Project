---
name: EduPlay Gamification
description: Design and implement EduPlay educational games, points, badges, rewards, streaks, challenges, and achievement feedback. Use when working on game builders, game runners, reward tables, student progress, or source-grounded quiz generation.
---

# EduPlay Gamification

## Purpose

Build engaging, age-appropriate learning games that remain grounded in teacher-approved content and produce reliable progress/reward records.

## When to use

- "Create an educational game", "fix the reward system", "add badges"
- Work on `public/pages/gameplayer.js`, `public/gameRunner.js`, `public/pages/builder.js`, `public/pages/mygames.js`
- Changes to `games`, `generated_games`, `game_questions`, `answer_choices`, `attempts`, `scores`, `rewards`, `student_rewards`, `student_progress`
- Quiz generation from materials/stories

Compose with `eduplay-learning` for pedagogy and assessment, `eduplay-ui-ux` for child-facing feedback, and `webapp-testing` for gameplay verification.

## Detected architecture

- Games are editable drafts created from source text; the builder lets teachers revise prompts, choices, feedback, and answers.
- Game types include multiple choice, matching, fill-in-the-blank, word search, sequencing, and true/false.
- Student gameplay records attempts, scores, time spent, and rewards.
- AI generation is offline by default and optionally uses an OpenAI-compatible endpoint via `EDUPLAY_AI_URL` / `EDUPLAY_AI_KEY` / `EDUPLAY_AI_MODEL`.

## Development workflow

1. Identify the learning objective and the source text that supports it.
2. Choose the game type that best practices that objective; do not start from visuals.
3. Ensure every question/answer can be justified by the saved source. Mark generated drafts for teacher review.
4. Implement feedback that explains *why*, not just correct/incorrect.
5. Update progress and reward records once per meaningful completion, not on every click.
6. Test replay, retry, scoring, and accessibility with keyboard input.

## Coding standards

- Never invent facts in generated questions; use source quotes/metadata where available.
- Store metadata such as `sourceQuote`, `sourceType`, and `needsReview` when adding generated content.
- Keep answer keys server-side; do not leak correctness into student HTML.
- Use transaction boundaries when inserting game questions, choices, attempts, and rewards.
- Escape all prompts, choices, and feedback before rendering.
- Keep timers and speech cleanup on `pagehide`.

## Best practices

- Short, concrete prompts work best for elementary learners.
- Use immediate, encouraging feedback with one next action.
- Rewards should reinforce effort and mastery, not just speed.
- Keep challenge difficulty adjustable by teacher settings.
- Preserve question order and stable IDs for editing.
- Use `ui.js sound()` synthesized effects (click/correct/incorrect/spin/tick/reward/win); keep the student mute toggle working and never add external audio files.
- Animate success briefly; never block the next interaction for more than a few hundred milliseconds.

## Examples

**Good:** A sequencing game asks the student to order events quoted from the story.  
**Good:** After completing a game, the student sees points, a badge, and a "Play again" / "Next activity" choice.  
**Bad:** A word-search containing words never found in the assigned story.  
**Bad:** Awarding the same badge repeatedly on every answer click.

## Common mistakes to avoid

- Double-counting an attempt when a student retries.
- Giving away answers through DOM attributes or visible data.
- Mixing teacher-edit mode into the student player.
- Using only color to show correct/incorrect.
- Unbounded animations or sounds with no mute/reduced-motion path.
