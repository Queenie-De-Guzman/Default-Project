# EduPlay Game World

An original, child-friendly learning world built on top of EduPlay's existing game engines. It does not copy external characters, artwork or branding.

## Routes

- `#/student/world` — dashboard with profile greeting, continue-playing card, learning islands, daily challenge, filters, stars/coins/XP, achievements and unlockable friends.
- `#/student/world/map` — animated archipelago level map with unlockable islands.
- `#/student/play/:attemptId` — existing game player wrapped with a mascot introduction, progress bar, hint button, sound/music controls, click feedback and victory celebration.

## Original design choices

- **Pip the learning owl**: original SVG mascot in `public/assets/gameworld/mascot.svg`.
- **Clay/toy interface**: chunky 3–5px borders, thick offset shadows, rounded cards, bright learning-blue + play-yellow + fun-pink palette.
- **Learning archipelago**: themed islands (Number Grove, Story Cove, Word Garden, Puzzle Peak, Pair Meadow, Spin Island, Search Springs, Treasure Trail) connected by a dotted trail.
- `gw-` CSS prefix in `public/styles-gameworld.css` avoids collisions with the 21 self-contained game modules.
- Reduced-motion is respected via `:root[data-animations="off"]`.

## Gameplay wrapper

Every game now gets:

1. Animated introduction with mascot, instructions and `Start Game`.
2. Progress bar + item counter.
3. On-demand `Hint` button using saved question hints/explanations (no answer leak by default).
4. Synthesized Web Audio effects: click, correct, incorrect, spin, timer tick, reward, victory.
5. Optional offline background music with a persistent toggle.
6. Immediate button pulse feedback and responsive touch targets.
7. Victory screen with stars, server-issued badges, coins, XP level, confetti, Play again, Next level and Return to world.

## Drag & Drop engine

New `drag_drop` game type in `public/games/dragdrop.js`:

- draggable answer cards sourced from saved question choices;
- one highlighted answer nest with valid drop feedback;
- HTML5 drag events, pointer/touch dragging, and keyboard selection (tab + Enter);
- correct/incorrect sound and explanation feedback;
- records answers through the existing `runGame()` contract.

It is registered in `public/games/index.js` and `server/catalog.js`.

## Progression and persistence

New tables:

- `game_world_progress(student_id, stars, coins, xp, level, completed, badges, level_stats, last_game_id, music_on)`
- `game_world_awards(attempt_id UNIQUE, student_id, stars, coins, badge, created_at)`

`POST /api/attempts/:id/submit` awards Game World progress once per completed attempt through `awardGameWorld()`. Existing `scores`, `student_progress`, `student_rewards` and `awardRewards()` behavior is unchanged.

`GET /api/game-world/state` and `POST /api/game-world/music` expose progress and music preference.

## Filtering

`GET /api/student/assignments` now also returns `game_grade_level`, `game_difficulty`, `subject_name` and `competency_title`, so the Game World can filter by grade, subject, difficulty and island.

## Verification performed

- 21 game modules registered; `node --check` passed across all project JS/MJS files.
- Game World dashboard and map rendered with six assigned activities.
- Player introduction, start, hint, sound toggle and music toggle verified in browser.
- New drag-and-drop game created through the API, played with synthetic pointer drag, graded 100%, and awarded 3 stars / 35 coins / XP.
- `GET /api/game-world/state` reflected the saved progress.
- Console errors and failed network requests: none.
