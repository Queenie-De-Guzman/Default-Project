// Minimal dependency-free PDF writer. Produces valid PDF 1.4 files using the
// built-in Helvetica fonts. It supports headings, paragraphs, data tables and
// simple horizontal bar charts — enough for EduPlay's printable reports.

import { inflateSync } from 'node:zlib';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;

function textSafe(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

function trunc(value, max) {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max - 1) + '...' : s;
}

/**
 * buildPdf({ title, subtitle, blocks, footer })
 * blocks:
 *   { type: 'heading', text }
 *   { type: 'text', text }
 *   { type: 'table', columns: ['A','B'], rows: [[...],[...]] }
 *   { type: 'bars', items: [{ label, value, max }] }
 */
export function buildPdf({ title = 'EduPlay Report', subtitle = '', blocks = [], footer = 'EduPlay • Learn. Listen. Play. Explore. Achieve.' } = {}) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;

  const push = (line) => ops.push(line);
  const newPage = () => {
    if (ops.length) pages.push(ops.join('\n'));
    ops = [];
    y = PAGE_H - MARGIN;
  };
  const ensure = (height) => {
    if (y - height < MARGIN + 28) newPage();
  };
  const drawText = (value, { size = 10, bold = false, x = MARGIN, color = [0.12, 0.14, 0.2] } = {}) => {
    push(`${color.map((n) => n.toFixed(3)).join(' ')} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y.toFixed(2)} Td (${textSafe(value)}) Tj ET`);
  };
  const rect = (x, top, width, height, color) => {
    push(`${color.map((n) => n.toFixed(3)).join(' ')} rg ${x.toFixed(2)} ${top.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  };

  // Cover / title band.
  rect(0, PAGE_H - 112, PAGE_W, 112, [0.31, 0.27, 0.75]);
  push('BT /F2 22 Tf 48 704 Td (' + textSafe(title) + ') Tj ET');
  if (subtitle) push(`0.85 0.86 0.98 rg BT /F1 10 Tf 48 684 Td (${textSafe(subtitle)}) Tj ET`);
  y = PAGE_H - 142;

  for (const block of blocks) {
    if (!block) continue;
    if (block.type === 'heading') {
      ensure(34);
      y -= 6;
      drawText(block.text, { size: 14, bold: true, color: [0.31, 0.27, 0.75] });
      push(`0.85 0.85 0.92 RG 0.8 w ${MARGIN} ${(y - 4).toFixed(2)} m ${PAGE_W - MARGIN} ${(y - 4).toFixed(2)} l S`);
      y -= 10;
    } else if (block.type === 'text') {
      const lines = String(block.text || '').split(/\n/);
      for (const line of lines) {
        ensure(16);
        drawText(trunc(line, 100), { size: 10 });
        y -= 15;
      }
      y -= 4;
    } else if (block.type === 'table') {
      const columns = block.columns || [];
      const rows = (block.rows || []).map((r) => r.map((cell) => trunc(cell, 42)));
      if (!columns.length) continue;
      const usable = PAGE_W - MARGIN * 2;
      const weights = columns.map((_, i) => {
        const sample = Math.max(String(columns[i]).length, ...rows.map((r) => String(r[i] ?? '').length));
        return Math.min(Math.max(sample, 8), 34);
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const widths = weights.map((w) => (w / totalWeight) * usable);
      const headerH = 20;
      const rowH = 18;

      ensure(headerH + rowH);
      rect(MARGIN, y - headerH + 4, usable, headerH, [0.91, 0.9, 0.98]);
      let x = MARGIN;
      columns.forEach((col, i) => {
        drawText(col, { size: 9, bold: true, x: x + 4 });
        x += widths[i];
      });
      y -= headerH;

      rows.forEach((row, index) => {
        if (y - rowH < MARGIN + 28) newPage();
        if (index % 2 === 1) rect(MARGIN, y - rowH + 4, usable, rowH, [0.97, 0.97, 0.99]);
        x = MARGIN;
        row.forEach((cell, i) => {
          drawText(cell ?? '', { size: 8.5, x: x + 4, color: [0.2, 0.22, 0.28] });
          x += widths[i];
        });
        push(`0.91 0.92 0.95 RG 0.4 w ${MARGIN} ${(y - rowH + 4).toFixed(2)} m ${PAGE_W - MARGIN} ${(y - rowH + 4).toFixed(2)} l S`);
        y -= rowH;
      });
      y -= 12;
    } else if (block.type === 'bars') {
      for (const item of block.items || []) {
        ensure(38);
        const max = Number(item.max) || 100;
        const value = Math.max(0, Math.min(max, Number(item.value) || 0));
        drawText(trunc(item.label || '', 52), { size: 9, bold: true });
        y -= 14;
        rect(MARGIN, y - 4, PAGE_W - MARGIN * 2, 10, [0.92, 0.93, 0.97]);
        if (value > 0) rect(MARGIN, y - 4, ((PAGE_W - MARGIN * 2) * value) / max, 10, [0.35, 0.55, 0.92]);
        drawText(`${Math.round(value)}${item.suffix || ''}`, { size: 8, x: PAGE_W - MARGIN - 42, color: [0.35, 0.4, 0.5] });
        y -= 24;
      }
      y -= 6;
    }
  }

  if (ops.length) pages.push(ops.join('\n'));
  if (!pages.length) pages.push('BT /F1 11 Tf 48 700 Td (No data available.) Tj ET');

  const stamped = pages.map((content, index) => `${content}\n0.55 0.57 0.63 rg BT /F1 8 Tf ${MARGIN} 28 Td (${textSafe(footer)}) Tj ET\nBT /F1 8 Tf ${PAGE_W - MARGIN - 52} 28 Td (Page ${index + 1} of ${pages.length}) Tj ET`);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${stamped.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${stamped.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  stamped.forEach((content, i) => {
    const pageId = 5 + i * 2;
    const streamId = pageId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  });

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Simple text extraction used by the lesson document importer. */
export function extractText(fileName, dataUrl) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Unsupported file.');
  const mime = match[1];
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (bytes.length > 12 * 1024 * 1024) throw new Error('File is larger than 12 MB.');
  const ext = String(fileName || '').split('.').pop().toLowerCase();

  if (['txt', 'md', 'csv', 'json', 'html', 'htm'].includes(ext) || mime.startsWith('text/')) {
    let text = bytes.toString('utf8');
    if (ext === 'html' || ext === 'htm') {
      text = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>|<\/p>|<\/h[1-6]>|<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }
    return { text: cleanText(text), format: ext || 'text' };
  }

  if (ext === 'pdf' || mime === 'application/pdf') {
    // Lightweight PDF text extraction: scans uncompressed and FlateDecode
    // streams for text-showing operators. It handles common generated PDFs;
    // scanned/image PDFs need OCR and are reported honestly.
    const raw = bytes.toString('latin1');
    const chunks = [];
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    while ((m = streamRe.exec(raw))) {
      let stream = m[1];
      const start = raw.lastIndexOf('<<', m.index);
      const dict = raw.slice(start, m.index);
      if (/FlateDecode/.test(dict)) {
        try { stream = inflateSync(Buffer.from(stream, 'latin1')).toString('latin1'); }
        catch { continue; }
      }
      chunks.push(stream);
    }
    const parts = [];
    for (const stream of chunks) {
      const re = /\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\]])*\]\s*TJ/g;
      let found;
      while ((found = re.exec(stream))) {
        const chunk = found[0];
        const strings = chunk.match(/\((?:\\.|[^\\()])*\)/g) || [];
        const value = strings.map((s) => s.slice(1, -1)
          .replace(/\\([nrt()\\])/g, (_, c) => ({ n: '\n', r: '', t: ' ' }[c] ?? c))
          .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))).join('');
        if (value.trim()) parts.push(value);
      }
    }
    const text = cleanText(parts.join('\n'));
    // Custom/embedded font encodings can yield raw glyph codes instead of letters.
    // Fail honestly instead of feeding unreadable characters into the AI analysis.
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
      return {
        text: '', format: 'pdf', scanned: true,
        warning: 'This PDF uses a font encoding EduPlay cannot decode. Export it as DOCX/TXT or run OCR, then upload again.'
      };
    }
    return { text, format: 'pdf', scanned: !text };
  }

  throw new Error('Supported uploads: TXT, MD, CSV, HTML and text-based PDF. Convert DOCX files to PDF or plain text first.');
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .split('\n').map((line) => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
