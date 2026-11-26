---
name: EduPlay AI Integration
description: Integrate or review AI-assisted content generation, speech/audio, safe child-facing feedback, and optional OpenAI-compatible endpoints in EduPlay. Use for server/ai.js, server/content-analysis.js, generated games, teacher-guide drafts, narration, and any EDUPLAY_AI_* configuration.
---

# EduPlay AI Integration

## Purpose

Add AI assistance without compromising the core rule: generated learning content must be grounded in teacher-approved source material and remain editable/reviewable.

## When to use

- "Add AI feedback", "improve quiz generation", "configure the AI endpoint", "use speech recognition"
- Work on `server/ai.js`, `server/content-analysis.js`, generated games, vocabulary, comprehension, teacher guides
- Changes to `EDUPLAY_AI_URL`, `EDUPLAY_AI_KEY`, `EDUPLAY_AI_MODEL`
- Browser speech synthesis/recognition or reading assistance features

Compose with `eduplay-learning` for pedagogy, `eduplay-gamification` for game output, `eduplay-security` for secrets/PII, and `eduplay-qa-testing` for verification.

## Detected architecture

- Offline deterministic generation is the default in both `server/ai.js` and `server/content-analysis.js`.
- Optional external generation uses an OpenAI-compatible chat endpoint when all three env vars are set.
- Generated drafts include review metadata and are saved as editable records.
- Browser narration uses `public/reading.js` (Web Speech API), not a network TTS service.
- No npm runtime dependencies; keep new integrations local or optional.

## Development workflow

1. Define the source text explicitly; never let the model invent unsupported facts.
2. Choose offline generation first. Add an external provider only when the teacher opts in.
3. Keep a deterministic fallback so the feature works without network/API keys.
4. Validate and normalize model output into the existing schema before saving.
5. Mark drafts for teacher review; never auto-publish student-facing content.
6. Test with and without credentials; confirm no secret is logged or returned.

## Coding standards

- Secrets come from environment variables only; never hardcode or display them.
- Use timeouts and bounded output on external requests.
- Parse/validate JSON defensively; treat model output as untrusted text.
- Escape generated text in the UI; sanitize any HTML.
- Include source quotes/offsets in metadata when possible.
- Keep prompts free of personally identifying student data.
- Stop speech on navigation and clean up listeners.

## Best practices

- Prompt for "only use the provided text" and require a source quote per item.
- Prefer small, structured outputs over long free-form answers.
- Provide a "Regenerate" path that does not discard manual teacher edits.
- Use child-safe, encouraging language for feedback; avoid personal judgments.
- Keep AI outputs editable drafts in the same UI as manually authored content.
- Document any API key requirement in plain language.

## Examples

**Good:** A comprehension question stores `sourceQuote` and `needsReview: true` until a teacher approves it.  
**Good:** Without `EDUPLAY_AI_KEY`, the app still generates basic vocabulary from the saved text.  
**Bad:** A model fills in a missing story ending and presents it as the author's text.  
**Bad:** A prompt includes student names and scores to personalize feedback.

## Common mistakes to avoid

- Shipping a feature that fails completely offline.
- Trusting model JSON without schema validation.
- Auto-publishing generated questions.
- Sending entire databases to an external provider.
- Replacing browser narration with a paid TTS dependency unnecessarily.
- Logging API keys or authorization headers.
