# 🎮 EduPlay — Interactive Learning Management System

A complete, responsive, web-based learning platform for teachers and students. EduPlay includes a database-backed API, authentication with role-based access control, a teacher studio, a student learning space with an animated **Game World**, a unified My Learning Materials library, PPT/lesson and story readers, source-grounded AI game generation, a generated-games workspace, a Customization Center and **21 fully playable educational game engines**.

## Quick start

Requires **Node.js 22.5+** (built with Node 24). No `npm install` is needed — the app uses only Node built-ins.

```bash
npm start
# open http://localhost:3000
```

Then sign in with one of the seeded demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Teacher | `teacher@eduplay.ph` | `Teacher123!` |
| Student | `student@eduplay.ph` | `Student123!` |
| Administrator | `admin@eduplay.ph` | `Admin123!` |

New teacher accounts requested from the sign-in page stay pending until an administrator approves them in **Admin → Approvals**.

Other commands:

```bash
npm run dev         # auto-restart on server file changes
npm run reset-db    # delete the database (it is recreated on next start)
npm run import-stories # upload the 10 original starter-pack DOCX stories (server must be running)
npm run clear-library  # remove all stories and imported teaching materials
PORT=4000 npm start # use a different port
```

Runtime data lives in `data/eduplay.sqlite`; uploaded media and documents are stored under `data/uploads/`.

## What is included

### Teacher Studio

- **My Learning Materials** is the shared library for uploaded PPTs, documents, images and pasted text. It stores title, description, grade, subject, topic, language, reading level, quarter, objectives, file metadata and processing status, with filters/search across those fields.
- Create, edit, duplicate, publish and unpublish lessons and games.
- Game builder with question/answer editing, explanations, points, media upload, timers, difficulty, feedback and retry settings.
- Live preview of every game before publishing; generated drafts are collected in **My Generated Games** with source title, status and question count.
- Save drafts; publishing is always a deliberate action.
- Classes, student accounts, join codes and enrolment management.
- Assign games with due dates, instructions and retry rules.
- Curriculum competency bank with subject, grade, curriculum, reference and **teacher verification**.
- Digital storybook reader with narration, four reading modes, highlighting, vocabulary and student audio recordings for teacher review.
- Insights dashboard with competency mastery, frequently missed questions, at-risk students, trends and PDF exports.
- Original/general AI generator (`/api/ai/generate`) that produces **editable drafts** with explicit review warnings.

### PPT & Lesson Reader

- Upload PPTX, legacy PPT, PDF, DOCX, TXT, Markdown, HTML, CSV and common images (PNG, JPEG, WebP, GIF, BMP), up to 12 MB per file, using the file picker or drag-and-drop.
- Keeps slide order and, where the source exposes it, slide geometry, background, text runs, colours, font sizes, images and speaker notes.
- Slide thumbnails, previous/next navigation, slide viewer, all-text view and word/sentence highlighting.
- Narration with play, pause, resume, stop, replay, read-all, English/Filipino language selection, device voice, speed and volume. A custom narration script can be saved per slide and takes precedence over extracted slide text.
- Edit slide text, title, notes, image descriptions and narration script; edit extracted text; reprocess without re-uploading.
- Save materials to My Lessons, assign to classes, analyze them and generate game drafts directly from the uploaded source.
- Processing statuses: `uploading`, `extracting`, `analyzing`, `preparing narration`, `generating games`, `ready for review`, `failed`. Friendly errors cover unsupported/corrupted/password-protected/empty files, size limits and extraction/AI failures. Import attempts are recorded in `content_imports`.

### Story & Reading Library

- A fresh install starts with an **empty Story Library**. Eleven authorized original sample stories can be restored with `EDUPLAY_SEED_STORIES=1 npm start` on a new database; otherwise add your own original/licensed stories.
- A 36-title recommended upload catalog in `docs/STORY-UPLOAD-CATALOG.md` suggests original/licensed topics across values, science, math, Filipino culture, comprehension, safety and higher-elementary themes. The accompanying `docs/story-library-starter-pack/` contains ten original sample manuscripts that can be imported with `npm run import-stories`. The command is idempotent; remaining suggestions are topic ideas only. Use `npm run clear-library` to remove all stories and imported teaching materials again.
- Filter and search by title, grade, subject, category, language, topic, reading level, quarter and favorite status. The category list also includes Values Education, Science and Nature, Mathematics, Philippine Culture and History, Health and Safety, Environmental Education and Adventure and Imagination.
- Story covers, topic, reading level, quarter, objectives, sections/chapters, whole-story and per-section narration, highlighting, vocabulary explanations and comprehension questions. Per-section narration scripts can override the section text.
- **Flip book preview:** uploaded PDF/DOCX/PPTX/TXT files and typed sections become page-turning book pages in both teacher and student readers, with corner arrows and ← → keyboard navigation. Each page keeps narration and word/sentence highlighting.
- **Two ways to add a story:** **Add story** opens with two tabs — **Upload file** and **Write manually**. In upload mode, choosing a PDF/document is enough: the title/topic are filled from the filename and the result opens as a flip book with Read Aloud. In manual mode, enter a title and section text; each section becomes a page in the same flip book. Optional details stay in a collapsed panel, remain editable, and duplicate titles get a numeric suffix.
- Teacher import from a material or pasted text, plus section/vocabulary/question editing, favorites, assignment and use as an AI game source.
- Reading sessions are saved for students with time spent, words read and completion state.

### Source-grounded AI Game Generator

- Sources: direct file upload, uploaded materials (PPT/PPTX/PDF/DOCX/TXT/images with OCR fallback), My Lessons, Story Library stories or pasted text. Materials can also be preselected from My Learning Materials with `?material=:id`.
- Extracts, organizes and analyzes content; suggests grade, subject, objectives and **unverified sample** competencies. Reports source-grounded `keyFacts` for quick teacher verification.
- Teacher controls for number of questions, difficulty, default points, time limit, instructions, character, background, animations, sound effects and background music are applied to generated drafts.
- Produces editable vocabulary, comprehension and game drafts for multiple choice, matching, word search, sequencing, fill-in-the-blanks and other registered formats.
- Every generated question carries a `sourceQuote`, an explanation and a `needsReview` flag. Unclear or missing information is flagged instead of invented.
- Drafts can be edited in the builder, previewed, saved, published or discarded. Nothing is published automatically; **Save & preview** opens the first saved game.

### Customization Center

- Persisted teacher preferences cover narration language, voice, speed and volume, word/sentence highlighting and colour, animations, sound-effect and music volumes, master mute, font size, high contrast, captions, default difficulty/points/time limit, feedback style, character and custom sounds.
- Preferences are applied globally to supported readers and game flows and can be edited from **Teacher → Customization**.
- Game feedback sounds are synthesized in the browser with the Web Audio API: click, correct, incorrect, spin, timer tick, reward and victory fanfare. Students can mute/unmute with the Sound button; the choice is stored locally. Event-level custom sound upload and per-game font presets remain deployment/UI extensions.

### Administrator Console

- Review and approve/reject teacher registrations.
- Manage roles, account status, names/emails and password resets.
- Inspect an activity log and edit system settings (school name, narration defaults, recovery mode, etc.).
- Password recovery codes are shown on screen in the default `developer` mode; production deployments should provide an email service and switch `password_recovery_mode` to `production`.

### Student Learning Space

- See assigned activities, due dates and best scores.
- Play all 20 game types with instant feedback and explanations.
- Earn points, stars and badges; review progress, history and achievements.
- Retry activities when the teacher allows it.
- Join a class with a code.
- Open published storybooks in the Reading Corner, listen or read along, and record reading practice.
- Open **My Library** to read assigned presentations and stories with narration, highlighting, vocabulary and comprehension checks.

### Game World

Students get an original animated learning world at `#/student/world` with a level map, learning islands, continue-playing card, daily challenge, filters by grade/subject/difficulty, stars, coins, XP, badges and unlockable friends. The player wraps every game with a mascot introduction, progress bar, hints, sound/music controls, click feedback and a victory celebration. Progress is stored per student in `game_world_progress` and awarded once per completed attempt through `game_world_awards`.

### Game library (all playable)

Matching, Word Scramble, Word Search, Fill in the Blanks, Multiple Choice, True or False, Spin the Wheel, Memory Cards, Story Sequencing, Reading Comprehension, Picture Guessing, Crossword Puzzle, Escape Room, Treasure Hunt, Bingo, Drag & Drop Sorting, Math Challenge, Listening Challenge, Pronunciation Challenge and Random Question Challenge.

Six ready-to-play sample games are seeded; all 21 engines are registered and available from the builder. Each module has its own interaction model and visual theme, but shares the same scoring engine, timer, answer recording and result flow. The player adds responsive button feedback and offline synthesized sound effects (with a persistent mute toggle).

## AI and narration behavior

### Offline by default, optional remote endpoint

Both generators are deterministic and offline by default. The legacy generator lives in `server/ai.js`; the source-grounded analyzer/generator lives in `server/content-analysis.js`. To use an OpenAI-compatible endpoint for the source-grounded engine, set:

```bash
EDUPLAY_AI_URL=https://your-endpoint/v1/chat/completions
EDUPLAY_AI_KEY=your-api-key
EDUPLAY_AI_MODEL=gpt-4o-mini
```

If the endpoint is unavailable, EduPlay falls back to the offline analyzer. Remote output is still normalized into editable drafts with review metadata.

### Grounding rule

Questions, vocabulary and explanations are derived from the actual uploaded or pasted source. When the source is ambiguous, image-only or too short, EduPlay flags the item for teacher review rather than inventing facts. `needsReview` items should be checked before publishing.

### Narration

Narration uses the browser Web Speech API. English (`en-US`) and Filipino (`fil-PH`) are offered, but available voices depend on the device/browser. Word highlighting uses speech boundary events when available and falls back to timed/sentence highlighting otherwise.

## Supported document formats and limits

`GET /api/meta` returns the authoritative list. Current formats: `pptx`, `ppt`, `pdf`, `docx`, `txt`, `md`, `html`, `csv`, `png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`. Maximum upload size is **12 MB**.

Known extraction limits:

- Legacy PPT conversion and OCR use optional external tools (LibreOffice and Tesseract). If they are unavailable, EduPlay reports a clear warning/flag instead of failing silently.
- OOXML parsing is regex-based. Grouped shapes, SmartArt, charts, theme colours and layout-inherited geometry are approximated.
- Password-protected, corrupted or empty files are rejected with specific error codes and messages.

## DepEd/MATATAG note

EduPlay **does not ship or invent official DepEd competency codes**. Seeded competencies and AI-suggested competencies are clearly labelled unverified samples with `code = NULL`. Teachers must copy codes and references from their own official DepEd curriculum documents, mark entries as verified, and review all generated content before publishing.

## Scoring and data

- Server-side score calculation from recorded answers, with sanity checks against answer keys where possible.
- Stars (1–3), pass threshold (75%), points, badges and per-subject/game progress.
- SQLite tables include `users`, `roles`, `subjects`, `curriculum_competencies`, `classes`, `students`, `class_students`, `lessons`, `lesson_pages`, `lesson_vocabulary`, `games`, `game_questions`, `answer_choices`, `assignments`, `attempts`, `scores`, `rewards`, `student_rewards`, `student_progress`, `reading_sessions`, `reading_recordings`, `activity_logs`, `system_settings`, `password_resets`, plus the newer `teaching_materials`, `presentation_slides`, `material_assets`, `stories`, `story_sections`, `story_vocabulary`, `story_comprehension`, `story_favorites`, `story_reading_sessions`, `ai_analyses`, `generated_games`, `material_assignments`, `teacher_preferences` and `content_imports`.
- Database migrations are forward-only, so existing demo data survives restarts.
- Passwords are hashed with scrypt; sessions use HMAC-signed bearer tokens; every API route applies role and ownership checks.

## Project structure

```text
server/
  index.js            HTTP server, static files and JSON API routing
  api.js              API endpoints, validation, RBAC and activity logging
  db.js               SQLite schema, forward-only migrations and seed data
  auth.js             Password hashing and signed tokens
  ai.js               Original offline + optional remote game generator
  content-analysis.js Source-grounded analyzer and game-draft generator
  documents.js        PPTX/PPT/DOCX/PDF/TXT/image extraction engine
  catalog.js          Canonical list of the 20 game types
  analytics.js        Competency/mastery/miss/at-risk aggregation
  pdf.js              Dependency-free PDF writer and document text extraction
public/
  app.js              SPA router and shells (teacher, student, admin)
  ui.js               Shared UI helpers
  reading.js          Web Speech narration manager
  highlight.js        Shared word/sentence narration highlighting markup
  gameRunner.js       Shared game/player bridge
  pages/              Login, teacher, student, builder, player, reader,
                      materials, library, generator, mygames, customize,
                      studentlibrary, analytics, admin
  games/              21 self-contained game modules + registry
  styles-reading.css  Responsive storybook styling
  styles-library.css  Materials, story library, generator and student reader styling
scripts/
  import-story-pack.mjs Imports the original starter-pack DOCX files via the API
data/                 SQLite database, uploads and token secret (created at runtime)
docs/
  SRS-TRACEABILITY.md Requirement-by-requirement implementation status
  STORY-UPLOAD-CATALOG.md 36 rights-safe story ideas and upload fields
  story-library-starter-pack/ 10 original sample manuscripts + catalog
```

## Key routes

Teacher UI routes: `#/teacher`, `#/teacher/lessons`, `#/teacher/materials`, `#/teacher/materials/:id`, `#/teacher/presentations`, `#/teacher/present/:code`, `#/teacher/library`, `#/teacher/library/:id`, `#/teacher/story-presenting/:code`, `#/teacher/generator` (optionally `?material=:id`), `#/teacher/generated`, `#/teacher/customize`, `#/teacher/games`, `#/teacher/classes`, `#/teacher/assignments`, `#/teacher/analytics`.

Student UI routes: `#/student`, `#/student/library`, `#/student/story/:id`, `#/student/presentation/:id`, `#/student/slideshow/:code`, `#/student/storyshow/:code`, `#/student/reading`, `#/student/activities`, `#/student/progress`.

`docs/PRESENTATION-VIEWS.md` documents the private teacher Presenter View and the public student/TV Slide Show.

### New API families

```text
GET    /api/meta
GET    /api/preferences                 PUT    /api/preferences
GET    /api/materials                   POST   /api/materials (base64 data URL)
GET    /api/materials/:id               PUT    /api/materials/:id
DELETE /api/materials/:id               POST   /api/materials/:id/reprocess
PUT    /api/materials/:id/slides/:sid   POST   /api/materials/:id/assign
POST   /api/materials/:id/analyze       GET|POST /api/materials/:id/games

GET    /api/stories                     POST   /api/stories
GET    /api/stories/:id                 PUT    /api/stories/:id
DELETE /api/stories/:id                 POST   /api/stories/:id/favorite
POST   /api/stories/:id/assign          POST   /api/stories/:id/sections
POST   /api/stories/:id/analyze         POST   /api/stories/:id/games
POST   /api/stories/:id/sessions

GET    /api/student/library
GET    /api/generated-games
POST   /api/ai/analyze                  POST   /api/ai/generate-from-source
```

Existing families remain: `/api/auth/*`, `/api/reading/*`, `/api/admin/*`, `/api/analytics/*`, lessons, games, classes, assignments, attempts, scores, reports and media.

## Teacher workflows

1. **Material-to-game:** drag-and-drop or pick a PPT/lesson in My Learning Materials → add metadata → review extracted slides and text → edit notes, image descriptions and narration scripts → save to My Lessons or analyze → set generation defaults → edit grounded drafts → save & preview → publish → assign → monitor results.
2. **Story-to-reading:** import or create a story → set topic/reading level/quarter/objectives and cover → add sections, narration scripts, vocabulary and comprehension questions → set narration language/voice → assign → student reads and progress is saved.
3. **Direct generator upload:** choose “Upload a file now” in AI Game Generator → set question count/difficulty/points/time/instructions/character → analyze source-grounded key facts and drafts → edit → save & preview.
4. **Classic game creation:** create a lesson → open AI Generator or Game Library → edit every question in the builder → preview → save draft → publish → assign → review drafts in My Generated Games and reports.

## Documentation

- `README.md` — this setup and operation guide.
- `docs/SRS-TRACEABILITY.md` — maps every SRS section, functional requirement and acceptance criterion to implemented, partial or future status. It also records deliberate deviations and remaining gaps.
- `docs/STORY-UPLOAD-CATALOG.md` — 36 recommended, rights-safe story upload ideas with required metadata and generated-feature guidance.
