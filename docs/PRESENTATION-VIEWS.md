# Dual Presentation Views

EduPlay now has two separate presentation interfaces for uploaded PowerPoint decks and Story Library stories.

## Teacher — Presenter View (private)

Open a presentation or story, then choose **Start Presenter View** / **Present Story**.

The full-screen presenter console shows:

- large current slide/page rendered from the original uploaded file;
- next slide/page preview;
- speaker notes (PowerPoint) or saved page narration text (Story Library);
- elapsed timer with pause/resume;
- slide/page counter and previous/next controls;
- **Read Aloud** with play, pause, resume, stop, replay, language, voice and speed;
- full-screen toggle and **End Presentation**.

A join code is shown only to the teacher. The **Open TV View** button opens a separate audience window that contains only the current slide/page. Put that window on the TV or share only that window; never screen-share the presenter console.

## Student / TV — Slide Show (public)

Students or a classroom TV open the join link shown in **My Library**:

- PowerPoint: `#/student/slideshow/<code>`
- Story Library: `#/student/storyshow/<code>`

This view shows only the current original slide/page, full screen. It never contains speaker notes, next-slide preview, timer, page counter or presenter controls. A translucent Read Aloud bar appears briefly when the pointer moves; it reads only the saved slide/page text.

Joining from My Library requests browser full screen where permitted. Use F11 if the browser blocks automatic full screen.

## Synchronization

State is stored in `presentation_sessions` and `story_presentation_sessions`. Student views poll their session every second and follow the teacher’s current slide/page. Only the owning teacher can change or end a session; students cannot control the teacher’s view. Assigning the material/story to a class is required before a student can join.

## Original file preservation

PowerPoint slides are rendered locally from the uploaded `.pptx` by the vendored OOXML renderer under `public/vendor/aiden-pptx/`. EduPlay does not rebuild slides from extracted text for these views. Legacy `.ppt` files must be converted to PPTX by the existing LibreOffice path before presenting. Slide transitions declared in the PPTX are stored and applied where the local renderer supports them; object-level animations depend on the renderer and are not invented by EduPlay.
