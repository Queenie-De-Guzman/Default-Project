---
name: EduPlay Docs & Research
description: Retrieve authoritative documentation, research GitHub repositories/libraries, and keep EduPlay technical documentation accurate. Use for library/API questions, OpenCode configuration questions, compatibility research, architecture notes, README/SRS/traceability updates, and troubleshooting.
---

# EduPlay Docs & Research

## Purpose

Reduce guessed APIs and stale documentation. Prefer primary sources, verify compatibility with EduPlay's offline/no-build constraints, and record decisions in project docs.

## When to use

- "Check the docs", "research a library", "is this compatible with OpenCode/EduPlay?"
- Any question about an external API, npm package, browser API, or MCP server
- Updating `README.md`, `docs/SRS-TRACEABILITY.md`, `docs/PRESENTATION-VIEWS.md`, or catalog docs
- Troubleshooting errors that require official docs

Compose with `eduplay-ai-integration` for AI APIs, `eduplay-security` for credentials, and `eduplay-qa-testing` to validate anything adopted.

## Source priority

1. Official product/library documentation.
2. Official GitHub repository README/issues/releases.
3. Machine-readable indexes such as `llms.txt` or OpenAPI schemas.
4. Reputable package registries (npm/PyPI) for version/license/maintenance.
5. Community examples only as secondary evidence.

For OpenCode V2 questions, use `https://opencode.ai/docs/` as the source of truth. Do not substitute V1 docs.

## Development workflow

1. State the exact question and the constraint (offline, browser-only, Node version, license, no npm deps, etc.).
2. Fetch the official docs page or repository metadata.
3. Record version, license, maintenance date, and any API key/paid requirement.
4. Compare against actual EduPlay files before recommending adoption.
5. If adopted, vendor or configure it locally; do not add a blind dependency.
6. Update the relevant doc with what changed and how to verify it.
7. Cite repository/doc URLs in the final report.

## Coding standards

- Do not paste credentials, tokens, or private student data into research notes.
- Keep docs concise and behavior-focused, not marketing copy.
- Mention platform constraints (Windows path quirks, browser fullscreen gestures, MIME types) when relevant.
- Preserve existing doc structure and terminology (`Story Library`, `Presenter View`, `TV View`, `Read Aloud`).
- Mark uncertain claims as uncertain; do not assert unsupported features.

## Best practices

- Use Context7 when installed/configured for library-specific docs; otherwise fetch official docs directly.
- Check `package.json` before adding any dependency; EduPlay currently has no runtime npm dependencies.
- Prefer local vendor assets under `public/vendor/` for browser libraries.
- For MCP servers, check OAuth/API key requirements before configuration.
- Mention free vs paid status explicitly in recommendations.

## Examples

**Good:** "PDF.js 4.10.38 is vendored locally; `pdf.min.mjs` exists but `pdf.min.js` does not, so module import is required."  
**Good:** "Context7 MCP is free with optional API key for higher rate limits; no secret stored in config."  
**Bad:** "I found a CDN snippet, so let's add it" without checking offline requirements.  
**Bad:** Quoting a blog post instead of the official API reference.

## Common mistakes to avoid

- Trusting training data over current docs.
- Mixing OpenCode V1 and V2 configuration syntax.
- Installing a library whose license forbids the intended use.
- Adding npm dependencies to a no-build project.
- Documenting a feature before browser verification.
