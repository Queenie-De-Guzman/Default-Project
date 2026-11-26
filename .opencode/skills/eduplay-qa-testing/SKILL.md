---
name: EduPlay QA Testing
description: Test EduPlay end to end: teacher/student login and RBAC, uploads, PDF/PPTX rendering, Story Library, flipbook, read-aloud, games, assignments, presenter/TV privacy, responsiveness, accessibility, and bug reporting. Use before delivery or when reproducing an issue.
---

# EduPlay QA Testing

## Purpose

Provide a repeatable verification workflow for a browser-based LMS with role-specific views, local file processing, live sessions, and child-facing interactions.

## When to use

- "Test the student dashboard", "verify Presenter View", "check security", "find the bug"
- Before claiming any UI/API change is complete
- After changing auth, uploads, rendering, narration, sessions, games, or reports

Compose with `webapp-testing` for Playwright/browser automation, `eduplay-security` for access-control tests, and domain skills (`eduplay-storybook`, `eduplay-gamification`, etc.) for expected behavior.

## Detected environment

- Server: `node server/index.js`, bound to `http://localhost:3000`.
- Browser automation is available through OpenCode's browser tools; `webapp-testing` adds Python Playwright scripts.
- No test runner is installed in `package.json`; tests are scripted/browser-based.
- Seeded accounts: `teacher@eduplay.ph / Teacher123!`, `student@eduplay.ph / Student123!`, `admin@eduplay.ph / Admin123!`.
- API login uses `username`, not `email`.
- Static assets and uploads: `/vendor/...`, `/media/...`.

## Development workflow

1. Start/check the server; never test against a stale build or a dead port.
2. Define the exact user role and starting route.
3. Reproduce with the smallest deterministic fixture: text PDF, image-only PDF, short PPTX, manual story.
4. Check the happy path first, then negative and authorization cases.
5. Capture screenshots, console errors, and failed network requests.
6. Report findings as: steps, expected, actual, severity, suspected file/function.
7. After a fix, rerun the same steps; do not widen the test silently.

## Required test matrix

- **Auth/RBAC:** login/logout, teacher cannot see another teacher's records, student cannot access unassigned content, admin approvals.
- **Uploads:** PDF text layer, image-only PDF with OCR warning, PPTX with notes, duplicate file hash reuse.
- **Story Library:** two-card chooser, manual editor, publish/draft, archive/delete, search/filter, reopen/edit.
- **Flipbook:** counter, corner/edge turn, drag, keyboard, zoom, single/double, fullscreen, reduced motion.
- **Read Aloud:** play, pause, resume, stop, replay, previous/next page, language/voice/speed/volume, Read All.
- **Presentations:** original slide fidelity, next-slide/notes privacy, timer, sync, student/TV view has no presenter data.
- **Games:** only source-grounded content, editable drafts, answer keys hidden from students, scoring/rewards recorded once.
- **Responsive:** 375px phone, tablet, 1280px desktop; no horizontal scroll; touch targets ≥44px.
- **Accessibility:** labels, focus order, contrast, reduced motion, no color-only meaning.

## Coding standards

- Use explicit waits/conditions; never rely on arbitrary sleeps when a selector or text condition is available.
- Unique test data per run; never assume a story/material ID.
- Do not run `npm run import-stories` unless a test explicitly requires seeded samples.
- Do not run `npm run clear-library` during ordinary verification; it destroys user data.
- Use fresh refs after DOM changes; stale refs are expected in hash-routed pages.
- Redact tokens and credentials from reports/logs.

## Best practices

- Verify both DOM and API: a pretty screen can hide an authorization leak.
- For privacy checks, inspect student API responses for `notes`, `narration_script`, `next`, and `timer`.
- Check console + network on every visual regression; 404 vendor assets are common.
- Test full-screen/HDMI-related views with and without fullscreen permission.
- Keep one screenshot per meaningful state for comparison.

## Common bug signatures

- `ERR_CONNECTION_REFUSED` → server stopped; restart before testing.
- "Page not found" on a new hash route → route not registered or app.js cached; hard reload.
- Blank slide → renderer failed or original file URL missing.
- White/invisible text → theme/color resolution bug in the renderer.
- Stale data after save → API response or route render not refreshed.
- Duplicate records → missing hash/title dedupe.

## Example report

```text
Case: Student TV view during teacher presentation
Steps: teacher starts deck, student opens /student/slideshow/<code>, teacher advances
Expected: only current original slide changes
Actual: next-slide panel visible
Severity: high (privacy)
Likely files: public/pages/presentation.js, server/api.js
```
