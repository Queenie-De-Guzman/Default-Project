# EduPlay SRS Traceability Matrix

**SRS version:** 1.0 (November 25, 2026)  
**Implementation version:** 1.3  
**Status key:** ✅ Implemented · ◐ Partial · ⬜ Not implemented / future enhancement

This matrix maps every SRS section and acceptance criterion to the shipped EduPlay build. It is deliberately conservative: a feature is marked **Partial** when the core behaviour works but depth (for example production email, optional OCR tooling, advanced layout fidelity or formal device testing) is still limited.

Version 1.2 adds the PPT & Lesson Reader, Story & Reading Library, student resource library/readers, teacher preferences and source-grounded AI analysis/game generation. Version 1.3 unifies everything through My Learning Materials, adds a dedicated PPT & Lesson Reader hub, My Generated Games, a Customization Center, richer source metadata/filters, per-slide and per-section narration scripts, direct generator uploads, source key facts, configurable generation defaults, a generated Teacher's Guide and a 36-title rights-safe upload catalog. All new generated content remains editable and teacher-reviewed.

---

## 1. Section-level coverage

| SRS § | Area | Status | Evidence / notes |
|---|---|---|---|
| 1 | Introduction | ✅ | Web-based interactive LMS implemented for Philippine elementary contexts. |
| 2 | Project overview | ✅ | Teacher Portal (`public/pages/teacher.js`) and Student Portal (`public/pages/student.js`). |
| 3 | Objectives | ✅ | Objectives 1–10 delivered. TTS uses browser Web Speech rather than a bundled external provider. |
| 4 | Scope | ◐ | All listed core components exist. Advanced simulation games, multiplayer and guaranteed OCR/layout fidelity for every source remain limited or optional. |
| 5 | Users and roles | ◐ | Admin, teacher and student roles with RBAC; teacher approval workflow. Recovery works in developer mode; production email delivery is not bundled. |
| 6.1 | Authentication & accounts | ◐ | Secure login/logout, signed tokens, teacher approval, student creation, class enrolment and admin reset. Self-service profile editing is minimal. |
| 6.2 | Teacher dashboard | ✅ | Overview KPIs, recent results, popular games, pending drafts and assignment counts (`/api/teacher/overview`). |
| 6.3 | Lesson management | ◐ | Lesson CRUD plus PPT/PPTX/PDF/DOCX/TXT/MD/HTML/CSV/image import through `server/documents.js`; My Learning Materials stores source metadata, drag-and-drop imports, filters and `content_imports` history. Slide order/geometry preserved where available. Legacy PPT conversion and OCR need optional tools. |
| 6.4 | AI content generator | ✅ | Original offline generator and optional OpenAI-compatible endpoint; output always saved as an editable draft requiring teacher approval. |
| 7 | AI lesson generation | ◐ | Source-grounded analysis, objectives, vocabulary, comprehension, source `keyFacts`, a Teacher's Guide (discussion questions, classroom activities, key takeaway), question-count limits and game drafts implemented in `server/content-analysis.js`; generator accepts direct uploads and configurable defaults. Worksheet/multimedia recommendation depth is partial. |
| 8 | Reading & narration | ✅ | `public/pages/reader.js`, `public/pages/materials.js`, `public/pages/library.js`, `public/pages/studentlibrary.js`, `public/highlight.js`, `public/reading.js`: storybook, slide and section readers, TTS, shared word/sentence highlighting, per-slide/per-section narration scripts, replay, speed/volume/voice/language and reading-session persistence. Word highlighting depends on browser boundary events; fallback exists. |
| 9 | Game engine | ✅ | 20 playable engines registered in `public/games/index.js`; builder supports content, timing, points, feedback, retries, themes and preview. Broader §9.1 catalogue (mazes, labs, multiplayer, etc.) is partially covered by the selected formats. |
| 9.2 | Game customisation | ◐ | Title, instructions, questions, images, difficulty, timer, points, attempts, feedback, rewards, metadata/config, default character/background and generation defaults covered. Event-level custom sound authoring and per-game font presets are not first-class settings. |
| 9.3 | Game preview | ✅ | `#/teacher/games/:id/preview`, lesson reader preview and generated-draft editing before save. |
| 10 | Animation & sound | ◐ | CSS animations, card flips, confetti/stars, game sound cues, Web Speech narration and recording. Persisted preferences now expose animation, effect/music volume and master-mute toggles, but event-level sound authoring, a character expression system and a full mixer remain future work. |
| 11 | Customisation centre | ◐ | Dedicated **Customization** page edits persisted `/api/preferences`: narration, highlighting, animations, sound/music volumes, mute, font size, high contrast, captions, defaults, feedback style and character. Global theme presets and reusable named profiles remain future work. |
| 12 | Student portal | ◐ | Dashboard, assignments, Reading Corner, games, progress, badges, classes/join codes and **My Library** with assigned presentations/stories. Daily challenges, virtual pet and learning map are future work. |
| 13 | Gamification | ◐ | Points, stars, badges, progress history and rewards. Digital trophies, levels, virtual pets, unlockables and treasure maps remain future work. |
| 14 | Assessment & evaluation | ◐ | Objective auto-scoring, attempts, explanations, competency links, teacher-reviewed recordings and story comprehension. Teacher-reviewed *game* activities and suggested practice automation are not yet implemented. |
| 15 | Analytics & reports | ◐ | CSV and PDF exports (insights, scores, students, games); mastery, missed questions, at-risk students, trends and completion rates in `/api/analytics/overview`. PDF charts are simple bars. |
| 16 | DepEd integration | ✅ | Competency table with subject/grade/quarter content, performance and reference fields plus teacher verification. No fabricated official codes ship; AI suggestions are explicitly unverified with `code = NULL`. |
| 17 | Architecture | ✅ | Presentation (vanilla SPA), application (Node HTTP + isolated document/analysis services), data (SQLite), external (optional AI API, Web Speech, optional LibreOffice/Tesseract). |
| 18 | Technology stack | ✅ | Section 18 permits adjustments; EduPlay uses zero-dependency Node 24 `node:sqlite`, vanilla ES modules and built-in Web Speech. No npm install is required. |
| 19 | Database design | ◐ | Core entities plus reading pages/vocabulary/sessions/recordings, materials/slides/assets with source metadata and narration scripts, stories/sections/vocabulary/comprehension/favorites/sessions with topic/level/quarter/objectives, analyses, generated games, assignments, preferences, `content_imports`, logs and settings. `lesson_media` and `game_audio` remain JSON/config fields rather than separate tables. |
| 20 | User workflows | ✅ | Teacher and student workflows implemented end to end, including upload → analysis → draft → assignment → attempt → result and reader → practice bridge. |
| 21 | Functional requirements | ✅ | See §21 matrix below; caveats are recorded in the implementation notes. |
| 22 | Non-functional requirements | ◐ | Responsive, accessible markup, reduced-motion CSS, modular isolation, validation, error taxonomy and progress saving. Load testing and formal accessibility audit remain open. |
| 23 | Security & privacy | ◐ | scrypt hashes, signed bearer tokens, RBAC, ownership checks, upload validation, path-safe media serving, no public student records and recovery-code expiry. Production email delivery, encryption-at-rest policy and DPIA tooling are deployment responsibilities. |
| 24 | UI/Design guidelines | ✅ | Colourful child-friendly design system, large controls, responsive teacher/student/admin shells and scoped new-module CSS. |
| 25 | Development phases | ✅ | Phases 1–9 substantially delivered; production deployment and formal QA remain operational work. |
| 26 | Testing & QA | ◐ | 25 legacy API checks, 34 enhancement API checks, 24 v1.3 API/static checks, 11 clean-state checks, 19 final-state checks, browser route/narration smoke checks, PDF validity and all 20 game render checks performed. Device lab, screen-reader and load testing are not formalised. |
| 27 | Acceptance criteria | ◐ | 15 original criteria, 6 enhancement criteria and 7 v1.3/catalog criteria exercised; see §27 matrix. Sound/event depth and device-lab caveats remain. |
| 28 | Future enhancements | ⬜ | Explicitly out of scope for v1.2; several are listed as partial above. |

---

## 21. Functional requirements matrix

| Requirement | Status | Implementation |
|---|---|---|
| Authenticate users by role | ✅ | `POST /api/auth/login`, signed tokens, RBAC guard in `server/api.js`. |
| Teacher lesson CRUD | ✅ | `/api/lessons` routes. |
| Document upload | ✅ | `/api/materials` accepts 14 formats via `server/documents.js`, max 12 MB, with drag-and-drop, metadata persistence, `content_imports` logging and specific unsupported/corrupt/password-protected/empty/size errors. |
| Text-to-speech narration | ✅ | `public/reading.js` Web Speech manager with en-US/fil-PH voices, voice/rate/volume selection, play/pause/resume/stop/replay/read-all and per-slide/per-section narration script overrides. |
| Interactive reading | ✅ | Storybook pages, story sections and slide materials with vocabulary, highlighting, comprehension and student sessions. |
| Educational game types | ✅ | 20 registered engines. |
| Teacher game customisation | ✅ | Builder + game config/metadata + persisted game defaults (difficulty, points, time, instructions, character, background, animations and sound flags). |
| Animated interactions | ✅ | CSS transitions, flips, confetti, stars and spins with a persisted global animation toggle. |
| Configurable audio effects | ◐ | Game sound cues, narration and persisted effect/music volumes plus master mute; no custom per-event audio mapping yet. |
| Save teacher customisation | ✅ | Game/lesson config, Customization Center and persisted preferences via `/api/preferences`. |
| Assign lessons to students | ✅ | Published lessons in Reading Corner plus `/api/materials/:id/assign`, `/api/stories/:id/assign` and game assignments. |
| Automatic scoring | ✅ | Server-side grading in `/api/attempts/:id/submit`. |
| Store performance | ✅ | `attempts`, `scores`, `student_progress`, `reading_sessions`, `story_reading_sessions`. |
| Generate reports | ✅ | CSV and PDF exports plus analytics dashboard. |
| Curriculum references | ✅ | `curriculum_competencies` with teacher verification; AI suggestions unverified. |
| Source-grounded AI generation | ✅ | `/api/ai/analyze`, `/api/ai/generate-from-source`, `/api/materials/:id/analyze`, `/api/materials/:id/games`, `/api/stories/:id/analyze`, `/api/stories/:id/games`; direct file upload, source preselection, `keyFacts`, question-count limits and generation defaults. |
| No unsupported invented facts | ✅ | Every generated question carries `sourceQuote`, `explanation` and `needsReview`; `keyFacts` are selected from actual sentences; ambiguous/short/image-only sources are flagged. |
| Processing statuses and retry | ✅ | Upload/extract/analyze/narration/generation statuses, friendly error taxonomy, `content_imports` history and `/api/materials/:id/reprocess` without re-upload. |
| Story library management | ✅ | 11 authorized original seed stories across all required categories, 18 selectable categories including the expanded catalog themes, topic/reading-level/quarter filters, cover/objectives, favorites, sections, vocabulary, comprehension, Teacher's Guide and assignment. |
| Unified learning materials library | ✅ | `#/teacher/materials` and `#/teacher/presentations` share `teaching_materials` with metadata filters, drag-and-drop import, status display and generator hand-off. |
| My Generated Games | ✅ | `#/teacher/generated` and `GET /api/generated-games` list drafts with source title, question count, status and edit/preview links. |
| Customization Center | ✅ | `#/teacher/customize` edits all persisted narration, accessibility, animation, sound and generation defaults. |
| Teacher's Guide generation | ✅ | Source-grounded objectives, discussion questions with `sourceQuote`, classroom activities and key takeaway in every analysis response. |
| Rights-safe upload catalog | ✅ | `docs/STORY-UPLOAD-CATALOG.md` provides 36 topic ideas with required metadata and an explicit authorization warning; Story Library offers “Use this idea” prefill. |

---

## 27. Acceptance criteria matrix

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Teachers create and upload lessons | ✅ | Lesson CRUD plus TXT/MD/HTML/CSV/PDF/DOCX/PPT/PPTX/image upload with extraction and slide layout where available. |
| 2 | System processes lesson content | ✅ | Extraction, section/slide organization, analysis and game drafts; OCR/LibreOffice paths are optional and reported when unavailable. |
| 3 | Students listen to narration | ✅ | Web Speech playback with language/voice/rate/volume controls in readers and student library. |
| 4 | Text displayed and followed during narration | ✅ | Word highlighting with boundary events and sentence/timed fallback. |
| 5 | Teachers generate and edit interactive activities | ✅ | Legacy and source-grounded AI drafts flow into the builder for editing before save/publish. |
| 6 | Educational games fully playable | ✅ | 20 engines verified. |
| 7 | Game animations work | ✅ | CSS/JS animations in game engines and result screens. |
| 8 | Sound effects respond to interactions | ◐ | Basic cues, effect/music volume settings and master mute implemented; custom per-event audio mapping remains future work. |
| 9 | Teachers customise game content/appearance | ◐ | Content/theme/timing/points/retries, character/background defaults and accessibility preferences covered; per-game font presets pending. |
| 10 | Students complete assigned activities | ✅ | Assignment → attempt → play → results, including materials/stories. |
| 11 | Scores and progress saved | ✅ | SQLite persistence, progress aggregation and reading sessions. |
| 12 | Teachers access performance reports | ✅ | Reports page, analytics page and CSV/PDF exports. |
| 13 | Curriculum references associated | ✅ | Lessons/games/materials/stories link to competencies; verification enforced in UI. |
| 14 | Roles and permissions enforced | ✅ | RBAC on every API route plus admin approval workflow. |
| 15 | Works on desktop and mobile browsers | ✅ | Responsive shells, readers and new-module CSS; formal device-lab testing pending. |
| 16 | Uploads persist and can be retried without re-upload | ✅ | `teaching_materials`, `presentation_slides`, `material_assets` and `/api/materials/:id/reprocess`. |
| 17 | Assigned stories/presentations are readable by students | ✅ | `/api/student/library`, `#/student/story/:id`, `#/student/presentation/:id`, saved sessions. |
| 18 | Generated questions are grounded in the source | ✅ | `sourceQuote`/`needsReview` metadata; unclear or missing content flagged, not invented. |
| 19 | Narration preferences persist | ✅ | `/api/preferences` used by teacher and student readers. |
| 20 | All teacher learning materials are reusable across modules | ✅ | Materials can be opened in the reader, saved to My Lessons, assigned, analyzed, turned into games and preselected in the generator. |
| 21 | Generated drafts are easy to find and preview | ✅ | My Generated Games lists drafts with source/question counts and links to builder/preview; Save & preview opens the first saved game. |
| 22 | Custom narration scripts are respected | ✅ | Slide `narration_script` and story `preferences.narrationScripts` override extracted/section text during playback. |
| 23 | Source facts are visible for verification | ✅ | Analysis results display offline/remote `keyFacts` selected from the actual source, alongside `sourceQuote` and review flags. |
| 24 | Generation settings are applied to drafts | ✅ | Question count, difficulty, points, time limit, instructions, character, background, animations and sound flags are merged into saved draft configs. |
| 25 | Teachers get a usable guide with every story | ✅ | Teacher's Guide supplies objectives, discussion questions, classroom activities and a key takeaway from the actual source. |
| 26 | Upload ideas can be turned into real stories quickly | ✅ | The recommended catalog pre-fills the Story Library form and never ships unauthorized third-party text. |

---

## Implementation artefacts index

| Concern | Files / endpoints |
|---|---|
| Auth, approvals, recovery | `server/auth.js`, `server/api.js` (`/api/auth/*`), `public/pages/login.js` |
| Admin console | `public/pages/admin.js`, `/api/admin/*` |
| Reader & narration | `public/reading.js`, `public/pages/reader.js`, `public/styles-reading.css`, `/api/reading/*` |
| Legacy document extraction | `server/pdf.js` (`extractText`), `/api/reading/extract`, `/api/reading/lessons/:id/import` |
| Materials & slide reader | `server/documents.js`, `public/pages/materials.js`, `/api/materials/*`, `/api/meta`, `content_imports` |
| Story library & student readers | `public/pages/library.js`, `public/pages/studentlibrary.js`, `public/highlight.js`, `/api/stories/*`, `/api/student/library`, `public/styles-library.css` |
| Source-grounded AI | `server/content-analysis.js`, `public/pages/generator.js`, `/api/ai/analyze`, `/api/ai/generate-from-source`, `/api/generated-games`, `public/pages/mygames.js` |
| Preferences & Customization Center | `teacher_preferences`, `public/pages/customize.js`, `/api/preferences` |
| Story upload catalog & Teacher's Guide | `docs/STORY-UPLOAD-CATALOG.md`, `docs/story-library-starter-pack/`, `scripts/import-story-pack.mjs`, `public/pages/library.js`, `public/teacherguide.js`, `server/content-analysis.js`, `/api/meta` |
| Analytics | `server/analytics.js`, `public/pages/analytics.js`, `/api/analytics/*` |
| PDF reports | `server/pdf.js`, `/api/analytics/export` |
| Data model | `server/db.js` (schema + forward-only migrations + seed) |
| Logging & settings | `activity_logs`, `system_settings`, `/api/admin/logs`, `/api/admin/settings` |

## Documentation-tested flows

- Clean start: 3 seeded users, 6 seeded games, 20 registered game types, 3 seeded storybook pages, 18 story categories and an empty Story Library unless `EDUPLAY_SEED_STORIES=1` is set on first start.
- API regression: 25 legacy checks, 34 enhancement checks and 24 v1.3 checks passed; 11 clean-state and 19 final-state checks passed (with starter stories present at the time).
- Browser smoke: teacher materials, presentations, library, generator, generated games and customization routes rendered without page errors; student library and published story reader rendered correctly. Unassigned/draft resources correctly showed access-control messages.
- Upload fix: persistent upload modals keep their form mounted; material and story file uploads now submit from the in-form Import/Create button instead of being detached by the generic modal action.
- Story preview: **Add story** offers **Upload file** and **Write manually** tabs; both save into the same flip book reader. Upload mode auto-fills the title/topic from the filename and adds Read Aloud. Smoke tests covered TXT/PDF and manual text, two-page detection, duplicate-title suffixes, hidden mode panels and page-turn animation in teacher/student readers.
- Extraction smoke: one-slide PPTX with styled text was uploaded, edited, reprocessed, analyzed and used to generate four game drafts.
- Starter pack: `npm run import-stories` imported 10 original manuscripts into My Learning Materials and Story Library with sections, vocabulary, answer keys, metadata and Teacher's Guides. `npm run clear-library` removed all 21 stories and 10 imported materials for the requested empty state.

**Policy reminder:** EduPlay never ships official DepEd competency codes. Competency samples and AI suggestions are labelled unverified with `code = NULL`, and teachers must enter and verify codes from their own official DepEd/MATATAG documents before publishing aligned materials.
