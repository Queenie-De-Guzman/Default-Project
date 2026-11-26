# Animated Storybooks

A new, separate Vooks-inspired storytelling feature inside EduPlay. It does **not** replace or modify the existing Read Aloud system, story reader, lessons, games, assignments, or progress records.

## Access

- Student tab: **Reading → 🎬 Animated Storybooks**
- Student route: `#/student/animated`
- Player route: `#/student/animated/:id`
- Admin route: `#/admin/animated`
- Admin preview: `#/admin/animated-preview/:id`

## Separate data

New tables only:

- `animated_stories(created_by, title, description, grade_level, category, cover_url, status, ...)`
- `animated_scenes(story_id, scene_number, title, text, image_url, background, character, duration, effects, ...)`
- `animated_story_progress(student_id, story_id, scene_number, seconds, completed, last_viewed)`

No existing `stories`, `story_pages`, `reading_sessions`, `scores`, `rewards`, or `game_world_progress` rows are changed by this feature.

## Student experience

- Separate collection with category tabs: Adventure, Fairy Tales, Animal Stories, Bedtime Stories, Moral Stories, Educational Stories.
- Grade-level filter.
- Cover image, title, description, scene count and Play button.
- Animated scene-by-scene player with original CSS/SVG environments:
  - moving clouds, twinkling stars, swaying hills and trees;
  - animated fox/bear/fish/bird/rabbit characters and the EduPlay owl mascot;
  - optional sparkles and butterflies effects;
  - uploaded scene image layered behind the animation.
- Natural narration using the existing Web Speech API wrapper.
- Word-by-word synchronized highlighting, with a timed fallback on browsers that do not emit speech boundaries.
- Play, Pause, Resume, Stop, Replay, Previous scene, Next scene, Fullscreen, voice, speed and music controls.
- Scene progress saved per student.

## Admin management

Administrators can add, edit, preview, publish and delete animated stories.

The admin form supports:

- title, description, grade level and category;
- cover image upload;
- multiple scenes with title, narration text, background theme, animal character, duration, image upload and effects;
- publish control so drafts never appear to students.

Uploaded images are saved with the existing `saveDataUrl()` helper into `data/uploads/` and served from `/media/...`.

## Compatibility

- Uses existing authentication and student/admin accounts.
- Uses the same API route wrapper and role checks as the rest of EduPlay.
- `as-` CSS prefix and `animated_*` table names avoid collisions with existing `ra-`, `gw-`, `lm-`, `story-` and `pptx-` systems.
- Respects `:root[data-animations="off"]` and `prefers-reduced-motion`.
- Responsive for desktop, tablet and mobile.

## Files

| File | Purpose |
|---|---|
| `public/pages/animatedstory.js` | Student library, animated player and admin manager. |
| `public/styles-animated.css` | Separate animated storybook visual system. |
| `public/assets/gameworld/mascot.svg` | Reused original owl mascot. |
| `server/api.js` | New `/api/animated-stories` routes. |
| `server/db.js` | New animated story tables and indexes. |
| `public/app.js`, `public/pages/student.js`, `public/pages/admin.js` | Route and navigation links only. |

## Verification

- `node --check` passed across all project JS/MJS files.
- Admin created and published a 3-scene animated story through the API.
- Student library listed the published story with category, grade and scene count.
- Player rendered animated night/meadow scenes with fox characters, owl mascot, caption, word highlighting and controls.
- No browser console errors were observed during verification.
