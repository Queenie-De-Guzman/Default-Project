// Dependency-free document extraction for EduPlay uploads.
//
// Supports PPTX (OOXML ZIP, parsed directly), legacy PPT (via LibreOffice),
// DOCX, PDF, plain text formats and images (optional Tesseract OCR). The result
// is normalized so the UI can render text, sections and — for presentations —
// an absolute-positioned approximation of each original slide.
//
// Only Node built-ins are used. Colors are returned as #RRGGBB, geometry and
// slide size are in CSS pixels at 96 dpi, and run sizes are in points.

import { inflateRawSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { extractText } from './pdf.js';

const execFileAsync = promisify(execFile);

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export const SUPPORTED_FILE_TYPES = [
  { ext: 'pptx', label: 'PowerPoint presentation (PPTX)', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'presentation' },
  { ext: 'ppt', label: 'Legacy PowerPoint presentation (PPT)', mime: 'application/vnd.ms-powerpoint', kind: 'presentation' },
  { ext: 'pdf', label: 'PDF document', mime: 'application/pdf', kind: 'document' },
  { ext: 'docx', label: 'Word document (DOCX)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
  { ext: 'txt', label: 'Plain text', mime: 'text/plain', kind: 'text' },
  { ext: 'md', label: 'Markdown', mime: 'text/markdown', kind: 'text' },
  { ext: 'html', label: 'HTML page', mime: 'text/html', kind: 'text' },
  { ext: 'csv', label: 'CSV spreadsheet', mime: 'text/csv', kind: 'text' },
  { ext: 'png', label: 'PNG image', mime: 'image/png', kind: 'image' },
  { ext: 'jpg', label: 'JPEG image', mime: 'image/jpeg', kind: 'image' },
  { ext: 'jpeg', label: 'JPEG image', mime: 'image/jpeg', kind: 'image' },
  { ext: 'webp', label: 'WebP image', mime: 'image/webp', kind: 'image' },
  { ext: 'gif', label: 'GIF image', mime: 'image/gif', kind: 'image' },
  { ext: 'bmp', label: 'Bitmap image', mime: 'image/bmp', kind: 'image' }
];

const MIME_TO_EXT = new Map();
for (const item of SUPPORTED_FILE_TYPES) {
  if (!MIME_TO_EXT.has(item.mime)) MIME_TO_EXT.set(item.mime, item.ext);
}
const EXT_ALIASES = { htm: 'html', jpe: 'jpg' };
const FORMAT_BY_EXT = {
  pptx: 'pptx', ppt: 'ppt', pdf: 'pdf', docx: 'docx',
  txt: 'txt', md: 'txt', html: 'txt', csv: 'txt',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image'
};

const EMU_PER_PX = 9525;
const MAX_MEDIA = 40;
const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 30000;
const SKIP_PLACEHOLDERS = new Set(['sldnum', 'dt', 'ftr', 'hdr', 'sldimg']);

function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function short(value, max = 300) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; }
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function attrs(tag) {
  const result = {};
  const re = /([:\w.-]+)\s*=\s*"([^"]*)"|([:\w.-]+)\s*=\s*'([^']*)'/g;
  let match;
  while ((match = re.exec(tag))) result[match[1] || match[3]] = match[2] ?? match[4];
  return result;
}

function attrOf(object, name) {
  if (!object) return undefined;
  if (object[name] !== undefined) return object[name];
  const suffix = ':' + name;
  for (const key of Object.keys(object)) if (key.endsWith(suffix)) return object[key];
  return undefined;
}

/** Elements by local name, tolerating arbitrary XML namespace prefixes. */
function elements(xml, name) {
  const prefix = '(?:[A-Za-z_][\\w.-]*:)?';
  const re = new RegExp(`<${prefix}${name}(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)<\\/${prefix}${name}\\s*>)`, 'g');
  const result = [];
  let match;
  while ((match = re.exec(String(xml || '')))) {
    result.push({ attrs: attrs(match[1]), content: match[2] || '', raw: match[0] });
  }
  return result;
}

const PPT_TRANSITIONS = [
  'blinds', 'checker', 'circle', 'comb', 'cover', 'cut', 'dissolve', 'fade', 'newsflash',
  'plus', 'pull', 'push', 'random', 'randomBar', 'split', 'strips', 'wedge', 'wheel', 'wipe', 'zoom'
];

/** Preserve the slide transition declared in the original PPTX for the viewer. */
function parseSlideTransition(xml) {
  const node = elements(xml, 'transition')[0];
  if (!node) return null;
  const effect = PPT_TRANSITIONS.find((name) => elements(node.content, name).length);
  if (!effect) return null;
  const detail = elements(node.content, effect)[0]?.attrs || {};
  return {
    effect,
    direction: String(attrOf(detail, 'dir') || 'r').slice(0, 4),
    speed: String(attrOf(node.attrs, 'spd') || 'med').slice(0, 8),
    advancedOnClick: attrOf(node.attrs, 'advClick') !== '0'
  };
}

function emuToPx(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number / EMU_PER_PX) * 100) / 100 : 0;
}

function dataUrlForImage(name, bytes) {
  const ext = (/\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1] || 'png').toLowerCase();
  const mime = SUPPORTED_FILE_TYPES.find((item) => item.ext === ext)?.mime || 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function createMediaBudget(warnings) {
  let remaining = MAX_MEDIA;
  let warned = false;
  return {
    take() {
      if (remaining <= 0) {
        if (!warned) {
          warnings.push(`Only the first ${MAX_MEDIA} images were included; any remaining media were omitted.`);
          warned = true;
        }
        return false;
      }
      remaining -= 1;
      return true;
    }
  };
}

function isZip(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(bytes[2]) && [0x04, 0x06, 0x08].includes(bytes[3]);
}

function looksOle(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

function isEncryptedOle(bytes) {
  return bytes.includes(Buffer.from('EncryptedPackage', 'utf16le'))
    || /EncryptedPackage/i.test(bytes.toString('latin1'));
}

function normalizeZipName(name) {
  const parts = [];
  for (const segment of String(name || '').replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function resolveZipPath(baseDirectory, target) {
  return normalizeZipName(`${String(baseDirectory || '').replace(/\\/g, '/')}/${String(target || '').replace(/\\/g, '/')}`);
}

function readZip64Values(bytes, locator, entry) {
  if (locator >= 0 && locator + 20 <= bytes.length && bytes.readUInt32LE(locator) === 0x07064b50) {
    const offset = Number(bytes.readBigUInt64LE(locator + 8));
    if (offset >= 0 && offset + 56 <= bytes.length && bytes.readUInt32LE(offset) === 0x06064b50) {
      entry.count = Number(bytes.readBigUInt64LE(offset + 32));
      entry.size = Number(bytes.readBigUInt64LE(offset + 40));
      entry.offset = Number(bytes.readBigUInt64LE(offset + 48));
    }
  }
  return entry;
}

/** Minimal ZIP central-directory reader; entries are inflated on demand. */
function openZip(bytes) {
  if (!isZip(bytes)) {
    if (looksOle(bytes)) {
      const error = coded('LEGACY_OR_PROTECTED',
        'This is a legacy Office file or a password-protected package. Save it as PPTX/DOCX (or remove the password) and upload again.');
      error.passwordProtected = isEncryptedOle(bytes);
      throw error;
    }
    throw coded('EXTRACTION_FAILED', 'The uploaded file is not a valid OOXML (ZIP) package.');
  }

  let eocd = -1;
  const lowerBound = Math.max(0, bytes.length - 22 - 65535);
  for (let position = bytes.length - 22; position >= lowerBound; position -= 1) {
    if (bytes.readUInt32LE(position) === 0x06054b50 && position + 22 + bytes.readUInt16LE(position + 20) <= bytes.length) {
      eocd = position;
      break;
    }
  }
  if (eocd < 0) throw coded('EXTRACTION_FAILED', 'The OOXML package has no readable central directory.');

  let directory = readZip64Values(bytes, eocd - 20, {
    count: bytes.readUInt16LE(eocd + 10),
    size: bytes.readUInt32LE(eocd + 12),
    offset: bytes.readUInt32LE(eocd + 16)
  });

  const entries = new Map();
  let position = directory.offset;
  for (let index = 0; index < directory.count && position + 46 <= bytes.length; index += 1) {
    if (bytes.readUInt32LE(position) !== 0x02014b50) {
      throw coded('EXTRACTION_FAILED', 'The OOXML package has a damaged central directory.');
    }
    const flags = bytes.readUInt16LE(position + 8);
    const method = bytes.readUInt16LE(position + 10);
    let compressedSize = bytes.readUInt32LE(position + 20);
    let uncompressedSize = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28);
    const extraLength = bytes.readUInt16LE(position + 30);
    const commentLength = bytes.readUInt16LE(position + 32);
    let localOffset = bytes.readUInt32LE(position + 42);
    const nameBuffer = bytes.subarray(position + 46, position + 46 + nameLength);
    const extra = bytes.subarray(position + 46 + nameLength, position + 46 + nameLength + extraLength);

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      let cursor = 0;
      while (cursor + 4 <= extra.length) {
        const id = extra.readUInt16LE(cursor);
        const length = extra.readUInt16LE(cursor + 2);
        const data = extra.subarray(cursor + 4, cursor + 4 + length);
        if (id === 0x0001) {
          let field = 0;
          if (uncompressedSize === 0xffffffff && field + 8 <= data.length) { uncompressedSize = Number(data.readBigUInt64LE(field)); field += 8; }
          if (compressedSize === 0xffffffff && field + 8 <= data.length) { compressedSize = Number(data.readBigUInt64LE(field)); field += 8; }
          if (localOffset === 0xffffffff && field + 8 <= data.length) { localOffset = Number(data.readBigUInt64LE(field)); }
          break;
        }
        cursor += 4 + length;
      }
    }

    const name = normalizeZipName(nameBuffer.toString('utf8'));
    if (name && !name.endsWith('/')) {
      entries.set(name, { name, flags, method, compressedSize, uncompressedSize, localOffset });
    }
    position += 46 + nameLength + extraLength + commentLength;
  }

  return {
    names: [...entries.keys()],
    has(name) { return entries.has(normalizeZipName(name)); },
    get(name) {
      const entry = entries.get(normalizeZipName(name));
      if (!entry) return null;
      if (entry.flags & 1) {
        const error = coded('LEGACY_OR_PROTECTED', 'This package is password-protected and cannot be read without a password.');
        error.passwordProtected = true;
        throw error;
      }
      if (entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
        throw coded('EXTRACTION_FAILED', `The package contains an oversized part (${entry.name}); extraction was stopped.`);
      }
      if (entry.localOffset + 30 > bytes.length || bytes.readUInt32LE(entry.localOffset) !== 0x04034b50) {
        throw coded('EXTRACTION_FAILED', `The package part ${entry.name} has an invalid local header.`);
      }
      const nameLength = bytes.readUInt16LE(entry.localOffset + 26);
      const extraLength = bytes.readUInt16LE(entry.localOffset + 28);
      const start = entry.localOffset + 30 + nameLength + extraLength;
      const payload = bytes.subarray(start, start + entry.compressedSize);
      try {
        if (entry.method === 0) return Buffer.from(payload);
        if (entry.method === 8) return inflateRawSync(payload);
        throw coded('EXTRACTION_FAILED', `Unsupported ZIP compression method ${entry.method} in ${entry.name}.`);
      } catch (error) {
        if (error && error.code) throw error;
        throw coded('EXTRACTION_FAILED', `Could not decompress ${entry.name}: ${short(error?.message || error)}`);
      }
    }
  };
}

function relationshipsFor(zip, partPath) {
  const separator = partPath.lastIndexOf('/');
  const directory = separator === -1 ? '' : partPath.slice(0, separator);
  const fileName = separator === -1 ? partPath : partPath.slice(separator + 1);
  const relPath = `${directory ? directory + '/' : ''}_rels/${fileName}.rels`;
  const xml = zip.get(relPath)?.toString('utf8') || '';
  const map = new Map();
  const re = /<(?:[A-Za-z_][\w.-]*:)?Relationship\b[^>]*>/g;
  let match;
  while ((match = re.exec(xml))) {
    const data = attrs(match[0]);
    if (data.Id) {
      map.set(data.Id, {
        target: String(data.Target || ''),
        type: String(data.Type || ''),
        external: /external/i.test(data.TargetMode || '')
      });
    }
  }
  return { map, directory };
}

function extractColor(fragment) {
  for (const fill of elements(fragment, 'solidFill')) {
    const value = elements(fill.content, 'srgbClr')[0]?.attrs.val;
    if (/^[0-9a-f]{6}$/i.test(value || '')) return `#${value.toUpperCase()}`;
  }
  return null;
}

function normalizeAlign(value) {
  const align = String(value || '').toLowerCase();
  if (align === 'ctr') return 'center';
  if (align === 'r') return 'right';
  if (['just', 'justlow', 'dist', 'thaadist'].includes(align)) return 'justify';
  return 'left';
}

function extractParagraphs(xml) {
  const paragraphs = [];
  for (const paragraph of elements(xml, 'p')) {
    const runs = [];
    const runElements = [...elements(paragraph.content, 'r'), ...elements(paragraph.content, 'fld')];
    for (const run of runElements) {
      const properties = elements(run.content, 'rPr')[0]?.attrs || {};
      const value = elements(run.content, 't').map((node) => decodeXmlEntities(node.content)).join('');
      if (!value) continue;
      const size = Number(properties.sz);
      runs.push({
        text: value,
        size: Number.isFinite(size) && size > 0 ? Math.round((size / 100) * 100) / 100 : null,
        bold: /^(1|true)$/i.test(properties.b || ''),
        italic: /^(1|true)$/i.test(properties.i || ''),
        color: extractColor(run.content),
        font: elements(run.content, 'latin')[0]?.attrs.typeface || null
      });
    }
    const breaks = elements(paragraph.content, 'br').length;
    const text = runs.map((run) => run.text).join('') + '\n'.repeat(breaks);
    paragraphs.push({ text, align: normalizeAlign(paragraph.attrs.algn), runs });
  }
  return paragraphs;
}

function geometryOf(element, fallback = { x: 0, y: 0, w: 0, h: 0 }) {
  const transform = elements(element?.content || '', 'xfrm')[0];
  if (!transform) return { ...fallback };
  const offset = elements(transform.content, 'off')[0]?.attrs || {};
  const extent = elements(transform.content, 'ext')[0]?.attrs || {};
  return {
    x: offset.x !== undefined ? emuToPx(offset.x) : fallback.x,
    y: offset.y !== undefined ? emuToPx(offset.y) : fallback.y,
    w: extent.cx !== undefined ? emuToPx(extent.cx) : fallback.w,
    h: extent.cy !== undefined ? emuToPx(extent.cy) : fallback.h
  };
}

function placeholderType(element) {
  return String(elements(element?.content || '', 'ph')[0]?.attrs.type || '').toLowerCase();
}

function extractNotes(zip, partPath, slideRels, warnings) {
  const relationship = [...slideRels.map.values()].find((item) => /\/notesSlide$/i.test(item.type));
  if (!relationship || relationship.external) return '';
  const notesPath = resolveZipPath(slideRels.directory, relationship.target);
  const xml = zip.get(notesPath)?.toString('utf8');
  if (!xml) {
    warnings.push(`Speaker notes could not be read from ${notesPath}.`);
    return '';
  }
  const notes = [];
  for (const shape of elements(xml, 'sp')) {
    if (SKIP_PLACEHOLDERS.has(placeholderType(shape))) continue;
    const text = extractParagraphs(shape.content).map((paragraph) => paragraph.text).filter(Boolean).join('\n');
    if (text.trim()) notes.push(text.trim());
  }
  return normalizeText(notes.join('\n\n'));
}

function parseSlide({ zip, part, number, warnings, mediaBudget, slideWidth, slideHeight }) {
  const xml = zip.get(part)?.toString('utf8') || '';
  const rels = relationshipsFor(zip, part);
  const shapes = [];
  const media = [];
  const background = extractColor(elements(xml, 'bg')[0]?.content || '');

  for (const shape of elements(xml, 'sp')) {
    const type = placeholderType(shape);
    if (SKIP_PLACEHOLDERS.has(type)) continue;
    const paragraphs = extractParagraphs(shape.content);
    if (!paragraphs.length) continue;
    const geometry = geometryOf(shape);
    const id = elements(shape.content, 'cNvPr')[0]?.attrs || {};
    shapes.push({
      type: 'text',
      x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h,
      text: paragraphs.map((paragraph) => paragraph.text).join('\n'),
      runs: paragraphs.flatMap((paragraph) => paragraph.runs),
      align: paragraphs.find((paragraph) => paragraph.text.trim())?.align || 'left',
      src: '',
      alt: decodeXmlEntities(id.descr || nameFromId(id) || '')
    });
    // Keep placeholder information internal for title detection only.
    shapes[shapes.length - 1].placeholder = type || undefined;
  }

  for (const picture of elements(xml, 'pic')) {
    const blip = elements(picture.content, 'blip')[0];
    const relationshipId = attrOf(blip?.attrs, 'embed') || attrOf(blip?.attrs, 'link');
    const relationship = relationshipId ? rels.map.get(relationshipId) : null;
    const geometry = geometryOf(picture);
    const id = elements(picture.content, 'cNvPr')[0]?.attrs || {};
    const name = decodeXmlEntities(id.name || relationshipId || `image${media.length + 1}`);
    const alt = decodeXmlEntities(id.descr || '');

    if (!relationship || relationship.external) {
      warnings.push(`Image ${name} on slide ${number} could not be embedded.`);
      shapes.push({ type: 'image', x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h, text: '', runs: [], align: 'left', src: '', alt });
      continue;
    }
    const imagePath = resolveZipPath(rels.directory, relationship.target);
    const bytes = zip.get(imagePath);
    if (!bytes) {
      warnings.push(`Image ${name} (${imagePath}) on slide ${number} is missing from the package.`);
      shapes.push({ type: 'image', x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h, text: '', runs: [], align: 'left', src: '', alt });
      continue;
    }
    const dataUrl = dataUrlForImage(imagePath, bytes);
    const included = mediaBudget.take();
    if (included) {
      media.push({ name, dataUrl, x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h });
    }
    shapes.push({
      type: 'image', x: geometry.x, y: geometry.y, w: geometry.w, h: geometry.h,
      text: '', runs: [], align: 'left', src: included ? dataUrl : '', alt
    });
  }

  const textShapes = shapes.filter((shape) => shape.type === 'text' && shape.text.trim());
  const titleShape = shapes.find((shape) => shape.type === 'text' && /^(title|ctrTitle)$/.test(shape.placeholder || ''));
  const title = cleanLine(titleShape?.text || textShapes[0]?.text || '').split('\n')[0].slice(0, 160);
  const text = normalizeText(textShapes.map((shape) => shape.text).join('\n'));
  const notes = extractNotes(zip, part, rels, warnings);
  const layoutShapes = shapes.map((shape) => {
    const { placeholder, ...rest } = shape;
    return rest;
  });
  const description = [
    title ? `Slide ${number}: ${title}` : `Slide ${number}`,
    text ? text.slice(0, 240) : '',
    media.length ? `${media.length} image${media.length === 1 ? '' : 's'}` : ''
  ].filter(Boolean).join('. ');

  return {
    slide: {
      number, title, text, notes, description, media,
      transition: parseSlideTransition(xml),
      layout: { width: slideWidth, height: slideHeight, background, shapes: layoutShapes }
    },
    text: [text, notes].filter(Boolean).join('\n\n')
  };
}

function nameFromId(id) {
  return id?.name ? String(id.name) : '';
}

function splitSections(text) {
  return String(text || '').split(/\n\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ title: '', text: value }));
}

function parsePptx(bytes, warnings, metadata) {
  const zip = openZip(bytes);
  const presentation = zip.get('ppt/presentation.xml')?.toString('utf8') || '';
  if (!presentation) throw coded('EXTRACTION_FAILED', 'The PPTX package is missing ppt/presentation.xml.');

  const presentationRels = relationshipsFor(zip, 'ppt/presentation.xml');
  const parts = [];
  const seen = new Set();
  for (const node of elements(presentation, 'sldId')) {
    const relationship = presentationRels.map.get(attrOf(node.attrs, 'id'));
    if (!relationship) continue;
    const part = resolveZipPath(presentationRels.directory, relationship.target);
    if (!seen.has(part) && zip.has(part)) {
      seen.add(part);
      parts.push(part);
    }
  }
  if (!parts.length) {
    parts.push(...zip.names
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => (Number(/\d+/.exec(a)?.[0]) || 0) - (Number(/\d+/.exec(b)?.[0]) || 0)));
    if (parts.length) warnings.push('Slide order could not be resolved from presentation.xml; slides were sorted by file name.');
  }

  const size = elements(presentation, 'sldSz')[0]?.attrs || {};
  const slideWidth = emuToPx(size.cx) || 960;
  const slideHeight = emuToPx(size.cy) || 720;
  const mediaBudget = createMediaBudget(warnings);
  const slides = [];
  const textParts = [];
  for (const [index, part] of parts.entries()) {
    const parsed = parseSlide({ zip, part, number: index + 1, warnings, mediaBudget, slideWidth, slideHeight });
    slides.push(parsed.slide);
    if (parsed.text) textParts.push(parsed.text);
  }
  metadata.slideCount = slides.length;
  return {
    format: 'pptx',
    text: normalizeText(textParts.join('\n\n')),
    sections: slides.map((slide) => ({ title: slide.title, text: slide.text })),
    slides
  };
}

function wordParagraphText(xml) {
  let value = String(xml || '')
    .replace(/<w:br\b[^>]*\/?>/gi, '\n')
    .replace(/<w:tab\b[^>]*\/?>/gi, '\t')
    .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi, (_, text) => text)
    .replace(/<[^>]*>/g, '');
  return decodeXmlEntities(value).replace(/[\t ]+/g, ' ').trim();
}

function parseDocx(bytes, warnings, metadata) {
  const zip = openZip(bytes);
  const xml = zip.get('word/document.xml')?.toString('utf8') || '';
  if (!xml) throw coded('EXTRACTION_FAILED', 'The DOCX package is missing word/document.xml.');

  const sections = [];
  let current = null;
  for (const paragraph of elements(xml, 'p')) {
    const text = wordParagraphText(paragraph.content);
    if (!text) continue;
    const style = String(attrOf(elements(paragraph.content, 'pStyle')[0]?.attrs, 'val') || '');
    if (/heading/i.test(style)) {
      current = { title: text, text: '' };
      sections.push(current);
    } else {
      if (!current) {
        current = { title: '', text: '' };
        sections.push(current);
      }
      current.text = current.text ? `${current.text}\n${text}` : text;
    }
  }

  const app = zip.get('docProps/app.xml')?.toString('utf8') || '';
  const pages = /<Pages>\s*(\d+)\s*<\/Pages>/i.exec(app);
  if (pages) metadata.pageCount = Number(pages[1]);
  const text = normalizeText(sections.map((section) => [section.title, section.text].filter(Boolean).join('\n')).join('\n\n'));
  return { format: 'docx', text, sections, slides: [] };
}

function parsePdf(fileName, dataUrl, bytes, warnings, metadata) {
  let extracted;
  try {
    extracted = extractText(fileName || 'document.pdf', dataUrl);
  } catch (error) {
    throw coded('EXTRACTION_FAILED', `PDF text extraction failed: ${short(error?.message || error)}`);
  }
  const text = normalizeText(extracted?.text || '');
  const raw = bytes.toString('latin1');
  metadata.pageCount = (raw.match(/\/Type\s*\/Page\b/g) || []).length;

  let needsOcr = false;
  if (extracted?.warning) warnings.push(extracted.warning);
  if (extracted?.scanned) {
    needsOcr = true;
    warnings.push('This PDF appears to be scanned or image-based; OCR is required for the text on its pages.');
  }
  if (!text) {
    needsOcr = true;
    warnings.push('No selectable text was found in the PDF. Use an OCR tool such as tesseract on the pages to recover the text.');
  }
  return { format: 'pdf', text, sections: splitSections(text), slides: [], needsOcr };
}

function parseTextFile(bytes, ext) {
  let text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  if (ext === 'html') {
    text = text
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(?:p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
      })
      .replace(/&#([0-9]+);/g, (_, dec) => {
        try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; }
      });
  }
  text = normalizeText(text);
  return { format: 'txt', text, sections: splitSections(text), slides: [] };
}

async function commandAvailable(command, args, timeout = 8000) {
  try {
    await execFileAsync(command, args, { timeout, maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function parseImage(bytes, ext, fileName, warnings) {
  const directory = join(tmpdir(), `eduplay-ocr-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const title = basename(String(fileName || `image.${ext}`));
  try {
    const imagePath = join(directory, `image.${ext}`);
    await writeFile(imagePath, bytes);
    if (!await commandAvailable('tesseract', ['--version'])) {
      warnings.push('Tesseract OCR is not installed; add tesseract to PATH to extract text from images.');
      return { format: 'image', text: '', sections: [{ title, text: '' }], slides: [], needsOcr: true };
    }
    const options = { timeout: CONVERSION_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 };
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync('tesseract', [imagePath, 'stdout', '-l', 'eng+fil'], options));
    } catch (firstError) {
      // Some installations only ship English trained data; retry before giving up.
      try {
        ({ stdout } = await execFileAsync('tesseract', [imagePath, 'stdout', '-l', 'eng'], options));
      } catch (error) {
        warnings.push(`Tesseract OCR failed: ${short(error?.stderr || error?.message || firstError?.message)}`);
        return { format: 'image', text: '', sections: [{ title, text: '' }], slides: [], needsOcr: true };
      }
    }
    const text = normalizeText(stdout);
    if (!text) warnings.push('Tesseract did not find readable text in this image.');
    return { format: 'image', text, sections: [{ title, text }], slides: [], needsOcr: !text };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function findConverter() {
  for (const command of ['soffice', 'libreoffice']) {
    if (await commandAvailable(command, ['--version'])) return command;
  }
  return null;
}

async function convertLegacyPpt(bytes, warnings, metadata) {
  if (looksOle(bytes) && isEncryptedOle(bytes)) {
    const error = coded('LEGACY_OR_PROTECTED', 'This PPT file is password-protected. Remove the password or save it as PPTX before uploading.');
    error.passwordProtected = true;
    throw error;
  }
  const converter = await findConverter();
  if (!converter) {
    throw coded('CONVERSION_REQUIRED',
      'Legacy PPT files need conversion. Install LibreOffice (soffice/libreoffice on PATH) or save the presentation as PPTX and upload it again.');
  }

  const directory = join(tmpdir(), `eduplay-ppt-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  try {
    const input = join(directory, 'source.ppt');
    const output = join(directory, 'source.pptx');
    await writeFile(input, bytes);
    try {
      await execFileAsync(converter, ['--headless', '--norestore', '--convert-to', 'pptx', '--outdir', directory, input], {
        timeout: CONVERSION_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024
      });
    } catch (error) {
      throw coded('CONVERSION_REQUIRED',
        `LibreOffice conversion failed: ${short(error?.stderr || error?.message)}. Save the presentation as PPTX and upload it again.`);
    }
    let converted;
    try {
      converted = await readFile(output);
    } catch {
      throw coded('CONVERSION_REQUIRED', 'LibreOffice did not produce a PPTX file. Save the presentation as PPTX and upload it again.');
    }
    metadata.conversionUsed = true;
    metadata.converter = converter;
    warnings.push(`Legacy PPT converted with ${converter}; slide layout may differ slightly from the original.`);
    return converted;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

function inferExt({ fileName, mime, fallback }) {
  const match = /\.([a-z0-9]+)\s*$/i.exec(String(fileName || '').trim());
  const fromName = match ? match[1].toLowerCase() : '';
  const normalizedName = EXT_ALIASES[fromName] || fromName;
  if (SUPPORTED_FILE_TYPES.some((item) => item.ext === normalizedName)) return normalizedName;
  const fromMime = MIME_TO_EXT.get(String(mime || '').split(';')[0].trim().toLowerCase());
  if (fromMime) return fromMime;
  const normalizedFallback = EXT_ALIASES[fallback] || fallback;
  if (SUPPORTED_FILE_TYPES.some((item) => item.ext === normalizedFallback)) return normalizedFallback;
  return normalizedName || normalizedFallback || '';
}

/** Parse an uploaded document and return a normalized, render-ready result. */
export async function extractDocument({ fileName, dataUrl, mime } = {}) {
  const parsed = parseDataUrl(dataUrl);
  const warnings = [];
  const metadata = {
    slideCount: 0,
    passwordProtected: false,
    conversionUsed: false,
    converter: null,
    pageCount: 0
  };
  let format = '';
  let presentationBytes = null;
  try {
    const ext = inferExt({ fileName, mime: mime || parsed.mime, fallback: parsed.ext });
    format = FORMAT_BY_EXT[ext] || '';
    if (!format) {
      throw coded('INVALID_FILE',
        `Unsupported file type ".${ext}". Supported types: ${SUPPORTED_FILE_TYPES.map((item) => item.ext).join(', ')}.`);
    }

    let result;
    if (format === 'pptx') {
      result = parsePptx(parsed.bytes, warnings, metadata);
      presentationBytes = parsed.bytes;
    } else if (format === 'ppt') {
      const converted = await convertLegacyPpt(parsed.bytes, warnings, metadata);
      result = parsePptx(converted, warnings, metadata);
      presentationBytes = converted;
      format = 'ppt';
    } else if (format === 'docx') {
      result = parseDocx(parsed.bytes, warnings, metadata);
    } else if (format === 'pdf') {
      result = parsePdf(fileName, dataUrl, parsed.bytes, warnings, metadata);
    } else if (format === 'txt') {
      result = parseTextFile(parsed.bytes, ext);
    } else {
      result = await parseImage(parsed.bytes, ext, fileName, warnings);
    }

    const text = normalizeText(result.text || '');
    const hasContent = Boolean(text)
      || (result.slides || []).length > 0
      || (result.slides || []).some((slide) => (slide.media || []).length > 0)
      || metadata.pageCount > 0
      || format === 'image';
    if (!hasContent) {
      throw coded('EMPTY_DOCUMENT', 'No readable text, slides, or images were found in the uploaded file.');
    }

    return {
      format,
      text,
      sections: Array.isArray(result.sections) ? result.sections : [],
      slides: Array.isArray(result.slides) ? result.slides : [],
      warnings,
      needsOcr: Boolean(result.needsOcr),
      metadata,
      presentationBytes
    };
  } catch (error) {
    if (error && typeof error.code === 'string') {
      if (error.passwordProtected) metadata.passwordProtected = true;
      throw error;
    }
    throw coded('EXTRACTION_FAILED', `Could not extract content from ${cleanLine(fileName) || 'the uploaded file'}: ${short(error?.message || error)}`);
  }
}

export function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]*)((?:;[^;,]+)*);base64,([A-Za-z0-9+/=\s]*)$/i.exec(String(dataUrl ?? '').trim());
  if (!match) throw coded('INVALID_FILE', 'A valid base64 data URL is required (data:<mime>;base64,...).');
  const mime = (match[1] || 'application/octet-stream').toLowerCase();
  const payload = match[3].replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) {
    throw coded('INVALID_FILE', 'The uploaded file contains invalid base64 data.');
  }
  const bytes = Buffer.from(payload, 'base64');
  if (!bytes.length) throw coded('EMPTY_FILE', 'The uploaded file is empty.');
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw coded('FILE_TOO_LARGE', `File is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }
  return { mime, bytes, ext: MIME_TO_EXT.get(mime) || 'bin' };
}
