# Interactive Animated Stories

A separate EduPlay feature inspired by the participation style of modern children's story apps (including MightyBook and Vooks). All stories, art, characters, text and activities in EduPlay are original; no copyrighted third-party story, character, animation or asset is copied.

This feature does **not** replace or modify the existing Read Aloud or Animated Storybooks features. It uses its own tables, API namespace, pages and CSS prefix.

## Routes

- Student library: `#/student/interactive`
- Student player: `#/student/interactive/:id`
- Admin manager: `#/admin/interactive`
- Admin preview: `#/admin/interactive-preview/:id`

Entry point for students: **Reading → ✨ Interactive Stories**.

## Original seeded collection

- *Little Boots and the Sleepy Sheep* — Nursery Rhymes, Kinder.
- *The Fox and the Lantern* — Animal Stories, Grade 1.
- *Mia and the Rainy Day* — Educational Stories, Grade 2.

Each has three original scenes, tappable hotspots and age-appropriate activities.

## Student features

- Animated backgrounds: meadow, sunset, night and forest.
- Moving clouds, sun, hills, trees, animal friends and EduPlay's original owl mascot.
- Character expressions (`happy`, `curious`, `sleepy`, `surprised`) and actions (`idle`, `wave`, `hop`, `dance`).
- Scene transitions and scene-by-scene navigation.
- Voice narration through the existing browser speech engine, or uploaded scene audio when available.
- Word-by-word synchronized highlighting with a timed fallback for browsers that do not emit speech boundaries.
- Play, Pause, Resume, Replay, Stop, Previous, Next and Fullscreen controls.
- Character dialogue bubbles and Web Audio sound effects.
- Clickable hotspots with immediate visual and audio feedback.
- Interactive choices after scenes: multiple choice, true/false, matching, sequencing and vocabulary.
- Server-graded answers with stars and progress saved per student.

## Admin management

Administrators can add, edit, preview, publish and delete stories.

The form manages:

- story title, description, grade level, category and cover image;
- scenes with narration text, illustration, audio narration, background, character, expression and action;
- hotspot label, position, feedback and sound;
- activity type, prompt, options, answer and feedback.

Uploaded illustrations and audio are saved through the existing `saveDataUrl()` helper into `data/uploads/` and served from `/media/...`.

## Storyboard + Action Generator

Admin → Interactive Stories includes an offline **Storyboard + Action Generator**. Paste story text, choose category/grade/character and scene count, then click **Generate storyboard**.

The generator creates editable scene cards with:

- title and narration grounded in the supplied text;
- background theme inferred from words like night, forest, sunset, garden;
- character expression (`happy`, `curious`, `sleepy`, `surprised`) inferred from story language;
- character action (`idle`, `wave`, `hop`, `dance`) inferred from verbs;
- a tappable hotspot using a keyword from the scene;
- one grounded activity per scene (multiple choice, true/false, vocabulary or sequencing).

Edits made in the generated cards are included when **Save as draft** is pressed. The generator is deterministic and offline; it never calls a paid API.

## File import

Admin → Interactive Stories also has an **Import a story file** box.

Accepted files:

- `.json` — full story payload with scenes/activities;
- `.html` / `.htm` — `h1/h2/h3` become the title and scene headings, paragraphs/list items become scene narration;
- `.txt` / `.md` — `#`/`##` headings become scenes, blank-line-separated text becomes narration.

Imported stories are created as **drafts**; publish them when ready. Illustrations and audio can still be added through Edit afterward. The importer never copies third-party assets — it only reads the file you provide.

## Separate data

| Table | Purpose |
|---|---|
| `ias_stories` | Story metadata, cover, category, grade and publish status. |
| `ias_scenes` | Scene text, illustration, audio, background, character, expression and action. |
| `ias_hotspots` | Clickable objects per scene. |
| `ias_activities` | Interactive questions per story/scene. |
| `ias_progress` | Per-student scene, seconds, completion and stars. |
| `ias_awards` | Idempotent activity rewards. |

No existing `stories`, `story_pages`, `reading_sessions`, `animated_*`, scores or reward records are modified.

## Integration

- Reuses existing authentication and admin accounts.
- Uses the existing `route()` API wrapper and role checks.
- `ias-` CSS prefix and `ias_*` table names avoid collisions with existing features.
- Respects `:root[data-animations="off"]`.
- Responsive across desktop, tablet and mobile.

## Verification

- `node --check` passed across all project JS/MJS files.
- Three original published stories were seeded and appeared in the student library.
- Student player rendered animated scenes, hotspots, dialogue, transcript and controls.
- Hotspot feedback and narration highlighting worked in browser.
- Admin manager listed and allowed editing/previewing all three stories.
- Answer grading and progress endpoints returned correct results.
- No browser console errors during verification.
