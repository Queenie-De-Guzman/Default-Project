// Shared renderer for AI-generated teacher guides. The guide is always
// presented as a draft for teacher review — never as verified curriculum text.
import { esc } from './ui.js';

function textOf(item) {
  if (typeof item === 'string') return item;
  return String(item?.text || item?.prompt || item?.title || item?.description || '');
}

export function teacherGuideHtml(guide) {
  if (!guide || typeof guide !== 'object' || !Object.keys(guide).length) {
    return '<p class="muted small">No Teacher’s Guide has been generated yet. Analyze the source to create a draft.</p>';
  }
  const objectives = Array.isArray(guide.objectives) ? guide.objectives : [];
  const questions = Array.isArray(guide.discussionQuestions) ? guide.discussionQuestions : [];
  const activities = Array.isArray(guide.classroomActivities) ? guide.classroomActivities : [];
  const list = (items, empty) => items.length
    ? `<ul class="tg-list">${items.map((item) => `<li>${esc(textOf(item))}</li>`).join('')}</ul>`
    : `<p class="muted small">${esc(empty)}</p>`;

  return `<div class="teacher-guide tg-card">
    <div class="tg-head"><span class="chip chip-pink">📋 Teacher’s Guide</span><span class="chip chip-amber">Generated draft — review before use</span></div>
    ${guide.keyTakeaway ? `<div class="tg-takeaway"><strong>Key takeaway</strong><p>${esc(textOf(guide.keyTakeaway) || String(guide.keyTakeaway))}</p></div>` : ''}
    <div><strong>Learning objectives</strong>${list(objectives, 'No objectives suggested from this source.')}</div>
    <div><strong>Discussion questions</strong>${questions.length
      ? `<ol class="tg-list">${questions.map((q) => `<li>
          <div>${esc(textOf(q))}${q.needsReview ? ' <span class="chip chip-amber">Needs review</span>' : ''}</div>
          ${q.sourceQuote ? `<blockquote class="tg-quote">“${esc(String(q.sourceQuote))}”</blockquote>` : ''}
        </li>`).join('')}</ol>`
      : '<p class="muted small">No discussion questions suggested from this source.</p>'}</div>
    <div><strong>Classroom activities</strong>${list(activities, 'No activities suggested from this source.')}</div>
    ${guide.needsReview ? '<div class="notice"><span>⚠️</span><div>Some items could not be confirmed from the source. Check them against your own copy before teaching.</div></div>' : ''}
    <p class="muted tiny">Generated from the uploaded text only. Verify accuracy, authorization and curriculum alignment yourself.</p>
  </div>`;
}

export default teacherGuideHtml;
