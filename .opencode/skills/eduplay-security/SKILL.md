---
name: EduPlay Security
description: Review and implement EduPlay authentication, bearer tokens, role-based access control, ownership checks, safe uploads, URL sanitization, XSS prevention, child privacy, and live-session authorization. Use before any security review or when touching auth, API routes, uploads, or stored HTML/URLs.
---

# EduPlay Security

## Purpose

Protect student data and teacher content in a small offline-friendly LMS. Security work must not break classroom workflows.

## When to use

- "Check security", "fix authorization", "audit uploads", "review permissions"
- Changes to `server/auth.js`, `server/api.js`, `server/index.js`, `public/ui.js`, `public/app.js`
- Any new API route, upload path, stored HTML, stored URL, or presentation/story session endpoint

Compose with `eduplay-qa-testing` for negative tests and `eduplay-teacher-tools` for intended workflow.

## Detected architecture

- Bearer tokens via `Authorization: Bearer ...`; user roles from `users.role_id → roles.name`.
- Route wrapper `route(method, path, auth, handler)` enforces authentication and role.
- Access helpers: `materialAccess()`, `storyAccess()`, `lessonAccess()`, `gameAccess()`.
- Password hashing in `server/auth.js`; admin approval for teacher accounts.
- Uploads written to `data/uploads/` with UUID filenames and served through `/media/...`.
- SQLite via `node:sqlite` with `PRAGMA foreign_keys = ON`.
- Optional external AI via `EDUPLAY_AI_URL`, `EDUPLAY_AI_KEY`, `EDUPLAY_AI_MODEL`.

## Development workflow

1. Classify the resource: public, authenticated, role-scoped, owner-scoped, or assigned-to-class.
2. Find the existing access helper before writing a new check.
3. Add the check at the API boundary, not only in the UI.
4. Validate/sanitize input server-side; escape on output client-side.
5. For file uploads, validate extension/MIME/size and store generated filenames only.
6. Write negative tests: wrong role, wrong owner, unassigned student, malformed ID, guessed session code.
7. Review logs for accidental credential or token exposure.

## Coding standards

- Every new route declares the narrowest valid `auth` level.
- Ownership checks must compare IDs, not just role names.
- Use `esc()` for text and `sanitizeStoryHtml()` for stored HTML.
- Use `safeUrl()` before rendering URLs; allow same-origin, http(s), blob, and data-image only where appropriate.
- Never accept a user-supplied filename/path for storage; use `randomUUID()`/generated paths.
- Use `{env:NAME}` style external config; never write secrets into source or docs.
- Keep answer keys and teacher notes out of student API payloads.
- Use `transaction()` for multi-table mutations.

## Best practices

- Students may only see published stories and materials assigned to their class.
- Teachers may only edit their own records unless the role is admin.
- Live presentation sessions: teacher controls state; students can read state only.
- Hash-based dedupe should be scoped by teacher to avoid cross-account reuse.
- Log meaningful actions without logging tokens, passwords, or full file contents.
- Fail closed: unknown IDs should return 404/403, never partial data.

## Examples

**Good:** `storyPresentationSession()` checks both session code and class assignment before returning state.  
**Good:** `materialDetail(row, user)` strips notes and narration scripts for students.  
**Bad:** A student endpoint returning all story pages including teacher narration script.  
**Bad:** Trusting `preview_url` from the database without a scheme check.

## Common mistakes to avoid

- Relying on hidden UI instead of server authorization.
- Using `auth: 'any'` without an in-handler role/ownership check.
- Allowing JavaScript/data-text URLs in stored fields.
- Logging request bodies that contain data URLs or passwords.
- Reusing a teacher's duplicate-file hash for a different teacher.
- Letting students advance a teacher's presentation session.
