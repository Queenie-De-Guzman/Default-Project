---
name: EduPlay Teacher Tools
description: Work on EduPlay teacher workflows: dashboard, learning materials, PPT/PPTX reader and presenter view, class/student management, assignments, story library, narration scripts, reports, and analytics. Use for teacher-specific routes, API calls, and panels.
---

# EduPlay Teacher Tools

## Purpose

Keep teacher workflows efficient and safe: prepare content once, assign it clearly, present it privately, review student progress, and regenerate learning activities without duplicating records.

## When to use

- "Improve teacher panel", "fix assignment flow", "add teacher report"
- Work on `public/pages/teacher.js`, `materials.js`, `library.js`, `presentation.js`, `analytics.js`, `admin.js`
- Changes to `teaching_materials`, `presentation_slides`, `material_assignments`, `classes`, `class_students`, `students`, `activity_logs`
- Upload, reprocess, dedupe, assign, present, analyze, or generate games from materials

Compose with `eduplay-ui-ux`, `eduplay-learning`, `eduplay-storybook`, and `eduplay-security`.

## Detected architecture

- Teacher routes begin with `#/teacher/...`; admin has separate routes.
- Materials are uploaded as data URLs, stored under `data/uploads/`, served from `/media/...`.
- Duplicate files are reused by SHA-256 `file_hash` per teacher and format.
- `presentation_sessions` and `story_presentation_sessions` hold live presenter state; only the teacher can move/end a session.
- Teacher analytics reads attempts, reading sessions, activity logs, and rewards.

## Development workflow

1. Verify the teacher owns the record through the existing `*Access()` helper.
2. Reuse existing API routes before adding new ones; respect role checks.
3. For any bulk action, show confirmation and report success/failure counts.
4. Keep assignment scope explicit: class IDs, optional due date, instructions.
5. For presenter changes, keep notes/next-slide/timer out of student responses.
6. Check the teacher dashboard after changes so counts and empty states remain accurate.

## Coding standards

- All teacher mutations must be behind `route(..., 'teacher', ...)` and ownership checks.
- Preserve `created_at` / `updated_at` semantics.
- Use `transaction()` for multi-table writes.
- Never expose another teacher's material, story, game, or session.
- Use `esc()` in every dynamic teacher panel.
- Keep modal behavior persistent where the user must upload/pick before closing.

## Best practices

- Surface processing status clearly: uploading → extracting → analyzing → ready/failed.
- Provide retry/reprocess without forcing re-upload.
- Show material metadata chips (grade, subject, topic, language, quarter) consistently.
- In Presenter View, provide "Open TV View" and warn not to share the presenter window.
- Generate games only from saved source and keep drafts editable.
- Reports should explain what the number means, not just display it.

## Examples

**Good:** A teacher assigns one presentation to Grade 4 and sees it appear in each student's library.  
**Good:** Re-uploading the same PDF returns the existing material instead of duplicating it.  
**Bad:** A teacher sees another teacher's story because the ID was guessed.  
**Bad:** An assignment modal closes before the teacher chooses a class.

## Common mistakes to avoid

- Deleting dependent rows before parent rows without considering foreign keys.
- Forgetting to unarchive a story when reassigning it.
- Letting students poll a teacher-only session endpoint.
- Showing OCR warnings to students as if they were teacher notes.
- Hardcoding class IDs in UI logic.
