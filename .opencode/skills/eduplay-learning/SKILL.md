---
name: EduPlay Learning
description: Design lessons, reading comprehension activities, quizzes, assessments, and learning-progress tracking in EduPlay. Use for lesson pages, teacher guide content, vocabulary, comprehension questions, student reading sessions, and progress records.
---

# EduPlay Learning

## Purpose

Keep EduPlay's learning activities pedagogically sound, source-grounded, and measurable without over-assessing young learners.

## When to use

- "Add a comprehension activity", "improve lesson pages", "track reading progress"
- Work on `public/pages/reader.js`, `public/teacherguide.js`, `server/content-analysis.js`, `server/ai.js`
- Changes to `lessons`, `lesson_pages`, `lesson_vocabulary`, `reading_sessions`, `story_reading_sessions`, `student_progress`, `story_comprehension`
- Any assessment, quiz, objective, or teacher-guide task

Compose with `eduplay-gamification` for practice/games, `eduplay-storybook` for reading sources, and `eduplay-security` for student data handling.

## Detected architecture

- Materials and stories are analyzed into source-grounded sections, vocabulary, comprehension drafts, and teacher guides.
- AI is deterministic/offline by default; optional external generation requires explicit environment configuration.
- Reading sessions record timing and completion for both lessons and stories.
- Student progress is separate from game scores.

## Development workflow

1. State the learning objective in teacher-facing language.
2. Derive questions and vocabulary only from the saved source text.
3. Choose an age-appropriate response format (recognition before recall for younger learners).
4. Provide explanatory feedback and teacher review controls for generated drafts.
5. Record progress on meaningful completion, never on mere page views.
6. Verify both teacher preview and student experience.

## Coding standards

- Use stable IDs for sections/questions so edits do not orphan progress.
- Keep generated drafts marked for review until a teacher saves/publishes them.
- Store source quotes or offsets in metadata where practical.
- Never expose answer keys in student API responses or DOM.
- Use UTC/timestamp consistency for sessions and progress.
- Keep narration scripts separate from canonical source text.

## Best practices

- One objective per activity; 3–5 focused questions are better than a long quiz.
- Vocabulary should include the word, source sentence, and child-friendly meaning.
- Reading comprehension should mix literal, sequence, and simple inference items.
- Show progress as mastery/effort, not rankings between children.
- Teacher guide should explain what to say, what to ask, and what to listen for.
- Preserve teacher edits when regenerating analysis.

## Examples

**Good:** After a story page about Juan visiting his grandparents, ask "Who did Juan visit?" with the source sentence available to the teacher.  
**Good:** A reading session marks completion only after the last page is viewed and the student confirms.  
**Bad:** A generated question about a character that never appears in the story.  
**Bad:** Ranking students publicly by reading speed.

## Common mistakes to avoid

- Replacing teacher edits with regenerated AI content.
- Treating OCR noise as authoritative vocabulary.
- Recording a page turn as a completed lesson.
- Using adult assessment language with elementary students.
- Forgetting to clean up speech/session listeners on navigation.
