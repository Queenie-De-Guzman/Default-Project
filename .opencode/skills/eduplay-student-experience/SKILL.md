---
name: EduPlay Student Experience
description: Design and implement EduPlay student-facing navigation, My Library, story reading, slide show/TV view, games, rewards, progress indicators, and child-safe feedback. Use for student routes, reading controls, and elementary learner interactions.
---

# EduPlay Student Experience

## Purpose

Make every student screen understandable without teacher help: what to do now, what happens next, and how much progress has been made.

## When to use

- "Improve student dashboard", "fix student library", "adjust reading controls"
- Work on `public/pages/student.js`, `studentlibrary.js`, `presentation.js` (student/TV routes), `gameplayer.js`
- Changes to student library queries, assignments, reading sessions, rewards, or progress display
- Any child-facing copy, icon, animation, or feedback

Compose with `eduplay-ui-ux`, `eduplay-storybook`, `eduplay-gamification`, and `webapp-testing`.

## Detected architecture

- Student routes begin with `#/student/...`.
- `GET /api/student/library` returns only assigned presentations and stories.
- Story reader uses the shared flipbook and page-grounded narration.
- Presentation/TV view shows only the original current slide, no presenter chrome.
- Progress and rewards are per-student records, not public leaderboards.

## Development workflow

1. Read the screen as an 8–10 year old would: one clear next action, readable labels, no hidden gestures.
2. Confirm the API never returns teacher notes, answer keys, or upcoming content.
3. Keep navigation shallow: library → activity → finish/back.
4. Make every action reversible or clearly explained.
5. Test with keyboard, touch, and a small viewport.
6. Verify speech stops when leaving a page.

## Coding standards

- Use short words and concrete verbs in labels ("Read", "Play", "Next page").
- Every icon-only control needs `aria-label`.
- No public rankings or comparisons between students.
- Escape all dynamic content; never trust stored titles/descriptions.
- Use `reading.js` for speech; do not create a second speech implementation.
- Keep `data-nav` consistent so the shell and mobile nav work.

## Best practices

- Show badges/progress near the activity, not in a separate hidden menu.
- Use one reward animation per completion; allow replay without re-awarding.
- Highlight the current word/paragraph only when narration is active.
- Keep the TV/slide-show view clean; narration controls may auto-hide.
- Empty states should tell the child what to ask their teacher for.
- Celebrate effort and improvement, not only correctness.

## Examples

**Good:** "You finished page 3 of 12 — keep going!" with a visible progress bar.  
**Good:** A student opens a shared presentation and sees only the current slide on TV.  
**Bad:** A small "Submit" link with no feedback after answering.  
**Bad:** A leaderboard showing which student read fastest.

## Common mistakes to avoid

- Exposing teacher-only session data through a student API response.
- Using confusing dashboard jargon ("material", "entity", "record") with children.
- Auto-playing sound without a user action.
- Letting the TV view show the join code.
- Removing visible focus indicators for a cleaner look.
