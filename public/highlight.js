// Shared text highlighting used by every reader in EduPlay.
// The returned spans keep the original reader class names so existing CSS keeps
// working, and carry data-start / data-end for speech-boundary highlighting.
import { esc } from './ui.js';

/**
 * Wrap readable text in highlightable spans.
 * @param {string} text source text
 * @param {'word'|'sentence'} style token granularity
 * @param {string} wordClass class applied to each span (e.g. 'lm-word')
 * @param {string} activeClass class added by the reader while speaking (e.g. 'lm-active')
 * @returns {string} escaped HTML (empty string when there is no text)
 */
export function highlightHtml(text, style = 'word', wordClass = 'word', activeClass = 'active') {
  const raw = String(text ?? '');
  if (!raw.trim()) return '';
  const baseClass = String(wordClass || 'word').trim();
  const active = String(activeClass || 'active').trim();
  const prefix = baseClass.split(/\s+/)[0].replace(/-word$/, '');
  const sentenceEndClass = prefix ? `${prefix}-sentence-end` : '';
  const attrs = `data-active-class="${esc(active)}"`;
  const span = (value, start, extraClass = '') => `<span class="${esc([baseClass, extraClass].filter(Boolean).join(' '))}" data-start="${start}" data-end="${start + value.length}" ${attrs}>${esc(value)}</span>`;

  let html = '';
  if (style === 'sentence') {
    const re = /[^.!?]+[.!?]*\s*/g;
    let match;
    while ((match = re.exec(raw)) !== null) {
      if (!match[0].trim()) continue;
      html += span(match[0], match.index, 'hl-sentence');
    }
    return html;
  }

  const re = /\S+|\s+/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const value = match[0];
    if (/^\s+$/.test(value)) { html += esc(value); continue; }
    html += span(value, match.index, /[.!?]$/.test(value) ? sentenceEndClass : '');
  }
  return html;
}

export default highlightHtml;
