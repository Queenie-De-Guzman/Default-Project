# EduPlay OpenCode Skill Installation

Verified on 2026-11-26. All skills are project-local, so they travel with the EduPlay workspace and do not alter global OpenCode configuration.

## Detected EduPlay stack

- Frontend: browser-native ES modules, hash router (`public/app.js`), plain CSS, no build step.
- Backend: Node.js built-in `http` server (`server/index.js`), custom route table (`server/api.js`).
- Database: SQLite through `node:sqlite` `DatabaseSync` (`server/db.js`), WAL + foreign keys enabled.
- Auth: hashed passwords, bearer tokens, roles `admin` / `teacher` / `student`, teacher approval flow.
- Storage: original uploads in `data/uploads/`, served through `/media/...`.
- AI: offline deterministic generation by default; optional OpenAI-compatible endpoint via `EDUPLAY_AI_URL`, `EDUPLAY_AI_KEY`, `EDUPLAY_AI_MODEL`.
- Browser libraries: local only under `public/vendor/` (PDF.js, Tesseract, PPTX renderer).
- Runtime npm dependencies: none.

## Installed existing skills

| ID | Source | License | Location | Purpose |
|---|---|---|---|---|
| `ui-ux-pro-max` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | MIT | `.opencode/skills/ui-ux-pro-max/` | Design intelligence: styles, palettes, typography, UX rules, charts, stacks. |
| `frontend-design` | https://github.com/anthropics/skills/tree/main/skills/frontend-design | Apache-2.0 | `.opencode/skills/frontend-design/` | Distinctive frontend visual direction. |
| `webapp-testing` | https://github.com/anthropics/skills/tree/main/skills/webapp-testing | Apache-2.0 | `.opencode/skills/webapp-testing/` | Python Playwright browser testing helpers. |
| `pdf` | https://github.com/anthropics/skills/tree/main/skills/pdf | Apache-2.0 | `.opencode/skills/pdf/` | PDF reading, merge/split, OCR guidance. |
| `pptx` | https://github.com/anthropics/skills/tree/main/skills/pptx | Apache-2.0 | `.opencode/skills/pptx/` | PPTX parsing/editing guidance. |
| `find-docs` | https://github.com/upstash/context7 | MIT | `.agents/skills/find-docs/` | Context7 CLI documentation lookup. |

`find-docs` was installed with `npx ctx7 setup --opencode --project --cli --yes`. OAuth was not required for CLI mode; no API key or token was stored.

## Created EduPlay skills

All are in `.opencode/skills/<id>/SKILL.md` with automatic `name` + `description` discovery.

| ID | Focus |
|---|---|
| `eduplay-ui-ux` | Educational UI design, child-friendly dashboards, responsive/accessibility rules. |
| `eduplay-storybook` | PDF flipbooks, OCR fallback, page editor, read-aloud, story presenter/TV. |
| `eduplay-gamification` | Games, points, badges, rewards, source-grounded quiz generation. |
| `eduplay-learning` | Lessons, comprehension, assessments, progress tracking. |
| `eduplay-teacher-tools` | Teacher dashboard, materials, classes, assignments, reports, presenter view. |
| `eduplay-student-experience` | Child navigation, library, reading, slide show, rewards, feedback. |
| `eduplay-qa-testing` | RBAC, upload, flipbook, narration, presenter/TV privacy, responsive and a11y tests. |
| `eduplay-security` | Auth, RBAC, ownership, safe uploads, URL/HTML sanitization, child privacy. |
| `eduplay-ai-integration` | Offline-safe AI drafts, optional OpenAI-compatible endpoint, speech/audio. |
| `eduplay-docs-research` | Official docs first, GitHub/npm research, doc updates. |

## Configuration changes

- No `opencode.json` / `opencode.jsonc` existed before or was created. OpenCode auto-discovers `.opencode/skills` and `.agents/skills`.
- `AGENTS.md` was created by the Context7 CLI. It only contains the documented `find-docs` lookup rule; no secrets.
- No application source, database record, or static asset was changed by this skill installation.

## Prerequisites installed

- Python 3.12.10 (user scope): `C:\Users\QueenieDeGuzman\AppData\Local\Programs\Python\Python312\python.exe`.
- Python `playwright` 1.65.2 and Chromium headless browser for `webapp-testing`.
- `ui-ux-pro-max` and `webapp-testing` SKILL.md files include a local-path fallback because the WindowsApps `python` alias is not a real interpreter in the current shell environment.

## API keys / paid tools

- None required.
- Context7 works anonymously with lower rate limits. For higher limits, set `CONTEXT7_API_KEY` or run `npx ctx7@latest login`; no key is stored in the workspace.
- EduPlay's optional external AI remains opt-in via `EDUPLAY_AI_URL`, `EDUPLAY_AI_KEY`, and `EDUPLAY_AI_MODEL`.

## Verification performed

1. Confirmed 16 skills discovered with correct path-derived IDs and frontmatter.
2. No duplicate IDs across `.opencode/skills` and `.agents/skills`.
3. Loaded `eduplay-ui-ux`, `find-docs` with the OpenCode `skill` tool.
4. Ran `python scripts/search.py` from `ui-ux-pro-max` successfully using the absolute Python path.
5. Verified `import playwright` succeeds and Chromium was downloaded.
6. Ran `npx ctx7@latest library "HTML" "canvas element"` successfully without an API key.
7. Confirmed `AGENTS.md` contains no credentials.

## Usage routing examples

- "Improve the EduPlay dashboard" → `eduplay-ui-ux` + `ui-ux-pro-max` + `frontend-design`, then `webapp-testing`.
- "Create a flipbook" → `eduplay-storybook` + `pdf` + `eduplay-ui-ux`.
- "Add read-aloud" → `eduplay-storybook` + `eduplay-ai-integration` + `eduplay-qa-testing`.
- "Create an educational game" → `eduplay-gamification` + `eduplay-learning`.
- "Improve teacher panel" → `eduplay-teacher-tools` + `eduplay-ui-ux`.
- "Test the student dashboard" → `eduplay-qa-testing` + `webapp-testing` + `eduplay-student-experience`.
- "Check security" → `eduplay-security` + `eduplay-qa-testing`.
- Library/API questions → `find-docs` and `eduplay-docs-research`.

## Recommended next steps

1. Restart the terminal/OpenCode session once so the new Python PATH entries are inherited by bare `python` commands.
2. Run `npx ctx7@latest login` only if anonymous Context7 rate limits are too low.
3. On the first real design task, run a `ui-ux-pro-max --design-system` query and save the result under `design-system/eduplay/` with `--persist` if the user wants a durable design system.
4. Add a lightweight Playwright smoke script under `scripts/` only when the user asks for persisted automated tests.
