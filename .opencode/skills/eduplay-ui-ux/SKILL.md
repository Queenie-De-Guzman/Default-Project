---
name: EduPlay UI/UX
description: Design and review EduPlay teacher/student interfaces, dashboards, flipbooks, game screens, and child-friendly learning experiences. Use for layout, visual hierarchy, typography, color, spacing, responsive behavior, accessibility, motion, and design-system consistency in this vanilla ES-module frontend.
---

# EduPlay UI/UX

## Purpose

Keep EduPlay visually coherent, accessible, and appropriate for elementary learners while remaining efficient for teachers. This skill is project-specific: it interprets general design guidance against EduPlay's actual stack and conventions.

## When to use

- "Improve the EduPlay dashboard" or "make the library easier to use"
- Any change to `public/pages/*.js`, `public/styles*.css`, `public/ui.js`
- New teacher or student screens, modals, cards, toolbars, forms, or empty states
- Responsive/tablet/mobile work, accessibility audits, or motion polish
- Review of visual consistency before delivery

Compose with `ui-ux-pro-max` and `frontend-design` for design research, then `webapp-testing` to verify the result in a browser.

## Detected stack / constraints

- No frontend framework or build step. Browser-native ES modules loaded by `public/index.html`.
- Hash router in `public/app.js`; page modules in `public/pages/`; shared DOM helpers in `public/ui.js`.
- Styles are plain CSS in `styles.css`, `styles-reading.css`, `styles-library.css`.
- Vendor browser libraries live in `public/vendor/` and must stay local/offline.
- Teacher, student, and admin roles share a shell but need distinct information density.

## Development workflow

1. Read the relevant page module and CSS before editing. Do not invent components that already exist.
2. Identify the user: child learner, teacher preparing content, or admin. Optimize for that context.
3. If the task is a broad visual direction, call `ui-ux-pro-max` with an explicit stack of plain HTML/CSS/ES modules.
4. Reuse existing tokens/classes and the shared `shell()`, `modal()`, `toast()`, `esc()` helpers.
5. Implement mobile-first with meaningful breakpoints; keep tap targets at least 44px.
6. Verify with `webapp-testing`: desktop, tablet, and mobile widths; keyboard focus; console errors.
7. Finish with a short visual QA checklist and a screenshot when the change is visual.

## Coding standards

- Use semantic HTML (`button` for actions, `nav`, `main`, `h1`–`h3`, `label` for inputs).
- Escape all dynamic text with `esc()`. Never interpolate unsanitized HTML.
- Prefer CSS custom properties and existing utility classes over inline magic numbers.
- Keep icons accompanied by text or `aria-label`; avoid emoji-only action buttons.
- Use `:focus-visible` styles; never remove focus rings without a replacement.
- Respect `prefers-reduced-motion` and EduPlay's `:root[data-animations="off"]`.
- Avoid horizontal scrolling on phones; test long titles and empty states.
- Keep the existing `data-nav` router contract when adding navigation.

## Design direction

- **Students/children:** larger text, generous spacing, clear one-step actions, friendly but not distracting feedback, obvious progress and reward states.
- **Teachers:** denser but scannable cards, explicit filters, predictable bulk actions, minimal modal friction, clear status chips.
- **Reading/games:** high contrast text, stable layout while speech highlights words, no motion that competes with reading.

## Best practices

- Establish one primary action per screen; secondary actions use `btn-soft` / `btn-ghost`.
- Keep cards consistent: icon/eyebrow, title, metadata, status, primary action.
- Use color meaningfully: green = ready/success, amber = draft/warning, red = error/destructive, indigo = primary.
- Show loading, empty, and error states for every data-driven view.
- Preserve keyboard order: navigation → content → actions → destructive actions.
- Animate only state changes that communicate meaning (page turns, correct answers, progress).

## Examples

**Good:** A story card shows cover, title, grade/subject/language chips, upload date, page count, and one clear "Read" action.  
**Good:** A child answer button has a 48px target, visible focus ring, and immediate but gentle correct/incorrect feedback.  
**Bad:** A 12px gray caption carrying critical instructions, or an icon-only trash button with no label.

## Common mistakes to avoid

- Mixing Tailwind-style utility names into plain CSS files.
- Adding npm dependencies for styling or components.
- Replacing the shell/router with a new framework.
- Using hover-only controls on tablets.
- Showing teacher notes or timer in the student/TV view.
- Letting layout shift while narration highlights words.
- Declaring a design "done" without testing 375px width and a keyboard-only path.
