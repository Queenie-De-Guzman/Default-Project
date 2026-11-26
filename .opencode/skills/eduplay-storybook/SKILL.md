---
name: EduPlay Storybook
description: Work on EduPlay Story Library creation, PDF-to-flipbook conversion, page editors, OCR fallback, read-aloud narration, word highlighting, story quizzes, story presenter view, and student reading experiences. Use for any story_pages, story_sections, flipbook, pdf-story, or story reader task.
---

# EduPlay Storybook

## Purpose

Maintain the complete digital reading pipeline: PDF upload or manual creation, page rendering, OCR fallback, narration, flipbook interactions, and source-grounded comprehension activities.

## When to use

- "Add read-aloud", "fix the flipbook", "create a flipbook", "improve the story library"
- Changes to `public/pages/library.js`, `public/pages/studentlibrary.js`, `public/flipbook.js`, `public/pdf-story.js`, `public/reading.js`, `public/highlight.js`
- Changes to `stories`, `story_pages`, `story_sections`, `story_vocabulary`, `story_comprehension`
- PDF upload, OCR warnings, cover images, manual page editor, or story presenter/TV view

Compose with `pdf` for PDF internals, `pptx` only for presentations, `eduplay-learning` for quizzes, and `webapp-testing` for browser verification.

## Detected architecture

- PDFs render in the browser with local PDF.js under `public/vendor/pdfjs/`.
- Image-only pages use local Tesseract under `public/vendor/tesseract/`; OCR text is stored separately and the original page image is preserved.
- Server persists page previews in `data/uploads/` and serves them at `/media/...`.
- `story_pages` is authoritative; `story_sections` is kept synchronized for legacy flows.
- Narration uses the browser Web Speech API via `reading.js`.
- Flipbook code is shared between teacher and student views.

## Development workflow

1. Trace the data path first: upload/editor → preview asset → `story_pages.text/html` → reader → narration → games.
2. Preserve the original source. Never replace a rendered PDF page with extracted text or a placeholder.
3. For OCR failure, keep the page image and show a clear warning; never show a blank page.
4. Update both teacher and student readers when changing page shape or narration semantics.
5. Verify AI game generation still uses only saved story text (no invented content).
6. Test with a text PDF, an image-only PDF, and a manually authored story.

## Coding standards

- Use `source_type`, `ocr_status`, and `ocr_error` to explain page origin; do not infer it from filenames.
- Narration text must come from `page.text` or teacher narration scripts, never from speaker notes or guessed content.
- Sanitize stored HTML before injecting it into the DOM.
- Use `safeUrl()` before rendering any stored URL.
- Keep preview URLs on `/media/...` or same-origin/blob/data-image URLs only.
- Preserve the `data-nav` router and persistent modal pattern (`modal(..., { persistent: true })` + `body.close()`).

## Best practices

- Render every PDF page at upload time so the flipbook is instant later.
- Store OCR text separately from the image so the original design remains untouched.
- Show explicit page count and processing status in the library.
- Keep Read Aloud controls consistent: Play, Pause, Resume, Stop, Replay, Previous/Next page, speed, voice, language, volume.
- Highlight using token offsets from `highlight.js`; do not mutate story HTML permanently.
- Story Presenter View must stay private: TV/students receive only the current page.

## Examples

**Good:** A scanned page with failed OCR still displays its JPEG preview and says "OCR could not read this page; original image preserved."  
**Good:** "Read all" narrates each page in order and advances the synchronized page index.  
**Bad:** Replacing a page image with a text div because extraction returned no words.  
**Bad:** A comprehension question whose answer never appears in any saved page.

## Common mistakes to avoid

- Deleting `story_pages` when editing sections.
- Forgetting to update `updated_at` and cover/preview references.
- Allowing duplicate titles without numeric suffixes.
- Using a CDN for PDF.js or OCR assets.
- Exposing teacher narration scripts to students.
- Letting the TV/audience view show next-page or timer information.
