import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { db, all, get, run, transaction, hydrateGame, jsonParse } from './db.js';
import { bearer, verifyToken, hashPassword, verifyPassword, signToken, fail, HttpError } from './auth.js';
import { GAME_TYPES, GAME_TYPE_IDS } from './catalog.js';
import { UPLOAD_DIR } from './paths.js';
import { generateGame } from './ai.js';
import { extractDocument, parseDataUrl, SUPPORTED_FILE_TYPES, MAX_UPLOAD_BYTES } from './documents.js';
import { analyzeContent, generateFromSource } from './content-analysis.js';
import { buildPdf, extractText } from './pdf.js';
import { analyticsOverview, analyticsPdfBlocks } from './analytics.js';
import { lookupDefinition } from './dictionary.js';

const routes = [];
const pathToRegex = (path) => new RegExp('^' + path.replace(/:[a-zA-Z_]+/g, (m) => `(?<${m.slice(1)}>[^/]+)`).replace(/\//g, '\\/') + '$');

function route(method, path, auth, handler) {
  routes.push({
    method,
    pattern: pathToRegex(path),
    handler: async (ctx) => {
      if (auth) {
        const payload = verifyToken(bearer(ctx.req));
        if (!payload) fail(401, 'Please sign in to continue.');
        const user = getUser(payload.sub);
        if (!user || !user.active) fail(401, 'Your account is no longer active.');
        if (auth !== 'any' && user.role_name !== auth) fail(403, 'You do not have access to this area.');
        ctx.user = user;
      }
      return handler(ctx);
    }
  });
}

const getUser = (id) => get(`SELECT u.*, r.name role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, id);
const studentFor = (userId) => get('SELECT * FROM students WHERE user_id = ?', userId);
const norm = (v) => String(v ?? '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ok = (body = {}) => ({ status: 200, body });
const created = (body) => ({ status: 201, body });
const requireFields = (body, fields) => {
  for (const f of fields) if (body[f] === undefined || body[f] === null || String(body[f]).trim() === '') fail(400, `${f} is required.`);
};
function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

function logActivity(user, action, entityType = null, entityId = null, details = null, req = null) {
  const info = req ? { ip: req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || null, agent: req.headers?.['user-agent'] || null } : null;
  run('INSERT INTO activity_logs(user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)',
    user?.id ?? null, action, entityType, entityId == null ? null : String(entityId),
    JSON.stringify({ ...(details && typeof details === 'object' ? details : details ? { message: details } : {}), ...(info || {}) }));
}

function requireAdmin(user) {
  if (user.role_name !== 'admin') fail(403, 'Administrator access is required.');
}

function settingValue(key, fallback = '') {
  return get('SELECT value FROM system_settings WHERE key=?', key)?.value ?? fallback;
}

// Objectives are always stored as a JSON array, whether the client sends an
// array, a JSON-encoded array, or a single plain-text objective.
function objectivesJson(value, fallback = []) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (Array.isArray(value)) return JSON.stringify(value.filter((item) => item !== null && item !== undefined).map((item) => String(item)));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return JSON.stringify(fallback);
    const parsed = jsonParse(trimmed, null);
    if (Array.isArray(parsed)) return JSON.stringify(parsed.map((item) => String(item ?? '')));
    return JSON.stringify([trimmed]);
  }
  return JSON.stringify(fallback);
}

function logContentImport(user, material, status, message) {
  run(`INSERT INTO content_imports(teacher_id,source_type,source_id,file_name,status,message)
       VALUES (?,'material',?,?,?,?)`,
    user.id, material?.id ?? null, material?.file_name || null, status,
    message == null || message === '' ? null : String(message).slice(0, 2000));
}

// Merge teacher settings into every draft config. Teacher edits always win.
function applyGenerationDefaults(drafts, body = {}) {
  const shared = {
    difficulty: body.difficulty || 'medium',
    points_per_question: body.defaultPoints || 10,
    time_limit: body.defaultTimeLimit || 0,
    animations: body.animations !== false,
    soundEffects: body.soundEffects !== false,
    backgroundMusic: Boolean(body.backgroundMusic),
    background: body.background || ''
  };
  if (body.instructions !== undefined) shared.instructions = body.instructions;
  if (body.character !== undefined) shared.character = body.character;
  return (Array.isArray(drafts) ? drafts : []).map((draft) => {
    if (!draft || typeof draft !== 'object') return draft;
    const edited = draft.config && typeof draft.config === 'object' && !Array.isArray(draft.config) ? draft.config : {};
    return {
      ...draft,
      difficulty: draft.difficulty || shared.difficulty,
      points_per_question: draft.points_per_question ?? shared.points_per_question,
      time_limit: draft.time_limit ?? shared.time_limit,
      config: { ...shared, ...edited }
    };
  });
}

async function saveDataUrl(dataUrl, kind = 'audio') {
  const match = /^data:(image|audio|application)\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) fail(400, 'An image or audio data URL is required.');
  const bytes = Buffer.from(match[3].replace(/\s/g, ''), 'base64');
  if (bytes.length > 12 * 1024 * 1024) fail(413, 'File is larger than 12 MB.');
  const ext = match[2].replace(/[^a-z0-9]/gi, '').slice(0, 8) || (match[1] === 'audio' ? 'mp3' : 'png');
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), bytes);
  return `/media/${filename}`;
}

function lessonAccess(lessonId, user) {
  const lesson = get('SELECT * FROM lessons WHERE id=?', lessonId);
  if (!lesson) fail(404, 'Lesson not found.');
  if (user.role_name === 'teacher' && lesson.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'This lesson belongs to another teacher.');
  return lesson;
}

function gameAccess(gameId, user) {
  const game = get('SELECT * FROM games WHERE id = ?', gameId);
  if (!game) fail(404, 'Game not found.');
  if (game.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'This game belongs to another teacher.');
  return game;
}

const STORY_CATEGORIES = [
  'Short Stories', 'Moral Stories', 'Fables and Folktales', 'Animal Stories', 'Adventure Stories',
  'Filipino Stories', 'English Stories', 'Science Reading', 'Historical Stories',
  'Vocabulary Reading', 'Reading Comprehension',
  'Values Education', 'Science and Nature', 'Mathematics', 'Philippine Culture and History',
  'Health and Safety', 'Environmental Education', 'Adventure and Imagination'
];

const MATERIAL_MIME = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html', htm: 'text/html',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp'
};

function processingError(error) {
  if (error instanceof HttpError) throw error;
  const code = String(error?.code || '');
  const messages = {
    INVALID_FILE: [400, 'That file could not be read. Try exporting it again.'],
    FILE_TOO_LARGE: [413, `File is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`],
    EMPTY_FILE: [400, 'That file is empty.'],
    EMPTY_DOCUMENT: [400, 'No readable content was found in that document.'],
    UNSUPPORTED_FILE: [400, 'Unsupported file format. Upload PPT, PPTX, PDF, DOCX, TXT, MD, HTML, CSV or an image.'],
    INVALID_EXTENSION: [400, 'Unsupported file format. Upload PPT, PPTX, PDF, DOCX, TXT, MD, HTML, CSV or an image.'],
    CONVERSION_REQUIRED: [400, 'Legacy PPT needs LibreOffice on the server for full rendering. Save the file as PPTX or ask your administrator to install LibreOffice.'],
    LEGACY_OR_PROTECTED: [400, 'This looks like a password-protected or legacy binary document. Save it as an unprotected PPTX or DOCX, or install LibreOffice for legacy PPT conversion.'],
    PASSWORD_PROTECTED: [400, 'Password-protected documents cannot be processed. Remove the password and upload again.'],
    EXTRACTION_FAILED: [422, 'The document could not be extracted. Check that it is not corrupted and try again.'],
    OCR_REQUIRED: [422, 'This file contains only images. OCR is needed; install Tesseract or paste the text manually.']
  };
  const mapped = messages[code] || [422, error?.message || 'The document could not be processed.'];
  throw new HttpError(mapped[0], mapped[1]);
}

function allowedExtension(fileName, mime = '') {
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  if (SUPPORTED_FILE_TYPES.some((item) => item.ext === ext)) return ext;
  const mimeExt = { 'application/pdf': 'pdf', 'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html', 'image/png': 'png',
    'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[String(mime).toLowerCase()];
  if (mimeExt) return mimeExt;
  fail(400, 'Unsupported file format. Upload PPT, PPTX, PDF, DOCX, TXT, MD, HTML, CSV or a supported image.');
}

async function saveUploadFile(dataUrl, fileName, mime) {
  let parsed;
  try { parsed = parseDataUrl(dataUrl); }
  catch (error) { processingError(error); }
  const ext = allowedExtension(fileName || `file.${parsed.ext}`, mime || parsed.mime);
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(join(UPLOAD_DIR, filename), parsed.bytes);
  return {
    url: `/media/${filename}`, bytes: parsed.bytes, mime: mime || MATERIAL_MIME[ext] || parsed.mime,
    ext, hash: createHash('sha256').update(parsed.bytes).digest('hex')
  };
}

async function readUploadDataUrl(fileUrl) {
  if (!String(fileUrl || '').startsWith('/media/')) fail(400, 'The original file is no longer available.');
  const name = basename(fileUrl);
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) fail(400, 'Invalid stored file name.');
  const bytes = await readFile(join(UPLOAD_DIR, name));
  const ext = name.split('.').pop().toLowerCase();
  return { dataUrl: `data:${MATERIAL_MIME[ext] || 'application/octet-stream'};base64,${bytes.toString('base64')}`, ext };
}

function materialAccess(materialId, user) {
  const material = get('SELECT * FROM teaching_materials WHERE id=?', materialId);
  if (!material) fail(404, 'Teaching material not found.');
  if (user.role_name === 'student') {
    const student = studentFor(user.id);
    const allowed = student && get(`SELECT 1 FROM material_assignments ma
      JOIN class_students cs ON cs.class_id=ma.class_id
      WHERE ma.material_id=? AND cs.student_id=?`, material.id, student.id);
    if (!allowed) fail(403, 'This material has not been shared with your class.');
  } else if (material.teacher_id !== user.id && user.role_name !== 'admin') {
    fail(403, 'This material belongs to another teacher.');
  }
  return material;
}

function storyAccess(storyId, user) {
  const story = get('SELECT * FROM stories WHERE id=?', storyId);
  if (!story) fail(404, 'Story not found.');
  if (user.role_name === 'student') {
    if (story.status !== 'published') fail(404, 'Story not found.');
  } else if (story.teacher_id !== user.id && user.role_name !== 'admin'
    && !/Original EduPlay/i.test(story.source_note || '')) {
    fail(403, 'This story belongs to another teacher.');
  }
  return story;
}

const isSharedStory = (story) => /Original EduPlay/i.test(story.source_note || '');

function materialView(row) {
  return {
    ...row,
    analysis: jsonParse(row.analysis, {}),
    preferences: jsonParse(row.preferences, {}),
    slideCount: get('SELECT COUNT(*) c FROM presentation_slides WHERE material_id=?', row.id).c
  };
}

function materialDetail(row, user = null) {
  const slides = all('SELECT * FROM presentation_slides WHERE material_id=? ORDER BY slide_number,id', row.id)
    .map((slide) => ({ ...slide, layout: jsonParse(slide.layout, {}), transition: jsonParse(slide.transition || '{}', null) }));
  const student = user?.role_name === 'student';
  if (student) {
    slides.forEach((slide) => { delete slide.notes; delete slide.narration_script; });
  }
  return {
    ...materialView(row),
    slides,
    assets: student ? [] : all('SELECT * FROM material_assets WHERE material_id=? ORDER BY id', row.id),
    assignments: student ? [] : all(`SELECT ma.*, c.name class_name FROM material_assignments ma
      LEFT JOIN classes c ON c.id=ma.class_id WHERE ma.material_id=? ORDER BY ma.id DESC`, row.id),
    games: student ? [] : all('SELECT id,type,title,status,game_id,created_at FROM generated_games WHERE material_id=? ORDER BY id DESC', row.id)
  };
}

function storyView(row, user) {
  return {
    ...row,
    analysis: jsonParse(row.analysis, {}),
    preferences: jsonParse(row.preferences, {}),
    favorite: user ? Boolean(get('SELECT 1 FROM story_favorites WHERE story_id=? AND teacher_id=?', row.id, user.id)) : false,
    sectionCount: get('SELECT COUNT(*) c FROM story_pages WHERE story_id=?', row.id).c
      || get('SELECT COUNT(*) c FROM story_sections WHERE story_id=?', row.id).c
  };
}

function storyDetail(row, user) {
  const sourceMaterial = row.source_material_id
    ? get('SELECT id,title,file_name,file_url,format,kind,status FROM teaching_materials WHERE id=?', row.source_material_id) || null
    : null;
  return {
    ...storyView(row, user),
    sourceMaterial,
    pages: all('SELECT * FROM story_pages WHERE story_id=? ORDER BY page_number,id', row.id),
    sections: all('SELECT * FROM story_sections WHERE story_id=? ORDER BY section_number,id', row.id),
    vocabulary: all('SELECT * FROM story_vocabulary WHERE story_id=? ORDER BY sort_order,id', row.id),
    comprehension: all('SELECT * FROM story_comprehension WHERE story_id=? ORDER BY sort_order,id', row.id)
      .map((item) => {
        const question = { ...item, choices: jsonParse(item.choices, []) };
        if (user?.role_name === 'student') delete question.answer;
        return question;
      }),
    assignments: all(`SELECT ma.*, c.name class_name FROM material_assignments ma
      LEFT JOIN classes c ON c.id=ma.class_id WHERE ma.story_id=? ORDER BY ma.id DESC`, row.id),
    games: all('SELECT id,type,title,status,game_id,created_at FROM generated_games WHERE story_id=? ORDER BY id DESC', row.id)
  };
}

const STORY_HTML_TAGS = new Set(['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'blockquote', 'center']);

/** Keep teacher-authored page formatting, but never store scripts or event handlers. */
function sanitizeStoryHtml(value) {
  let html = String(value || '').slice(0, 50000)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/<\/?([a-zA-Z0-9]+)\b([^>]*)>/g, (match, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    const closing = match.startsWith('</');
    if (!STORY_HTML_TAGS.has(tag) && tag !== 'img') return '';
    if (tag === 'img') {
      if (closing) return '';
      const srcMatch = /src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(rawAttrs);
      const src = String(srcMatch?.[1] || srcMatch?.[2] || srcMatch?.[3] || '');
      const safeImage = /^\/media\/[a-f0-9-]+\.[a-z0-9]+$/i.test(src)
        || /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src);
      return safeImage ? `<img src="${esc(src)}" alt="">` : '';
    }
    if (closing) return `</${tag}>`;
    const styleMatch = /style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rawAttrs);
    const style = String(styleMatch?.[1] || styleMatch?.[2] || styleMatch?.[3] || '')
      .split(';').map((rule) => rule.trim())
      .filter((rule) => /^(color|background-color|font-size|font-family|font-weight|font-style|text-align|line-height|margin-(top|bottom)|padding-(top|bottom))\s*:/i.test(rule))
      .join(';');
    return `<${tag}${style ? ` style="${esc(style)}"` : ''}>`;
  });
  return html;
}

function plainTextFromHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function prepareStoryPages(storyId, pages = []) {
  const prepared = [];
  run('DELETE FROM story_pages WHERE story_id=?', storyId);
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i] || {};
    const html = sanitizeStoryHtml(page.html);
    const text = String(page.text ?? plainTextFromHtml(html)).slice(0, 20000);
    let previewUrl = safeStoredUrl(page.preview_url);
    if (!previewUrl && typeof page.preview_data === 'string' && /^data:image\//i.test(page.preview_data)) {
      try { previewUrl = await saveDataUrl(page.preview_data, 'image'); }
      catch { previewUrl = null; }
    }
    const sourceType = ['pdf_text', 'pdf_ocr', 'manual'].includes(page.source_type) ? page.source_type : 'manual';
    const ocrStatus = ['none', 'pending', 'ready', 'failed'].includes(page.ocr_status) ? page.ocr_status : 'none';
    run(`INSERT INTO story_pages(story_id,page_number,title,text,html,preview_url,source_type,ocr_status,ocr_error)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      storyId, i + 1,
      String(page.title || `Page ${i + 1}`).slice(0, 200), text, html, previewUrl,
      sourceType, ocrStatus, String(page.ocr_error || '').slice(0, 1000));
    prepared.push({
      id: Number(db.prepare('SELECT last_insert_rowid() id').get().id),
      page_number: i + 1, title: String(page.title || `Page ${i + 1}`).slice(0, 200),
      text, html, preview_url: previewUrl, source_type: sourceType, ocr_status: ocrStatus
    });
  }
  return prepared;
}

function safeStoredUrl(value) {
  const url = String(value || '');
  return /^\/media\/[a-f0-9-]+\.[a-z0-9]+$/i.test(url) ? url : '';
}

function subjectIdFor(name) {
  if (!name) return null;
  return get('SELECT id FROM subjects WHERE name=?', String(name).trim())?.id || null;
}

function saveSourceGames({ user, drafts, sourceType, sourceId, analysisId = null, status = 'draft', gradeLevel = '', subject = '' }) {
  const ids = [];
  const column = sourceType === 'material' ? 'material_id' : sourceType === 'story' ? 'story_id' : 'lesson_id';
  for (const draft of (Array.isArray(drafts) ? drafts : []).slice(0, 12)) {
    if (!draft?.type || !draft?.title) continue;
    const draftConfig = draft.config && typeof draft.config === 'object' && !Array.isArray(draft.config) ? draft.config : {};
    const payload = validateGamePayload({
      title: draft.title,
      description: draft.description || '',
      type: draft.type,
      subject_id: subjectIdFor(subject || draft.subject),
      grade_level: gradeLevel || draft.grade_level,
      difficulty: draft.difficulty || draftConfig.difficulty || 'medium',
      time_limit: draft.time_limit ?? draftConfig.time_limit ?? null,
      points_per_question: draft.points_per_question ?? draftConfig.points_per_question ?? 10,
      show_feedback: draft.show_feedback !== false,
      allow_retry: draft.allow_retry !== false,
      config: { ...draftConfig, generatedFrom: sourceType, generatedFromId: sourceId },
      status,
      source: 'ai'
    });
    run(`INSERT INTO games(teacher_id,lesson_id,subject_id,grade_level,competency_id,title,description,type,difficulty,
          time_limit,points_per_question,show_feedback,allow_retry,config,cover_image,status,source)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      user.id, column === 'lesson_id' ? sourceId : null, payload.subject_id, payload.grade_level, null,
      payload.title, payload.description, payload.type, payload.difficulty, payload.time_limit,
      payload.points_per_question, payload.show_feedback, payload.allow_retry, JSON.stringify(payload.config),
      payload.cover_image, payload.status, payload.source);
    const gameId = Number(db.prepare('SELECT last_insert_rowid() id').get().id);
    saveQuestions(gameId, draft.questions || []);
    run(`INSERT INTO generated_games(teacher_id,material_id,story_id,lesson_id,analysis_id,game_id,type,title,config,questions,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      user.id, column === 'material_id' ? sourceId : null, column === 'story_id' ? sourceId : null,
      column === 'lesson_id' ? sourceId : null, analysisId, gameId, payload.type, payload.title,
      JSON.stringify(payload.config), JSON.stringify(draft.questions || []), payload.status);
    ids.push(gameId);
  }
  return ids;
}

async function processMaterial(material, fileData) {
  try {
    run("UPDATE teaching_materials SET status='extracting',error=NULL WHERE id=?", material.id);
    const extracted = await extractDocument({ fileName: fileData.fileName || material.file_name, dataUrl: fileData.dataUrl, mime: fileData.mime });
    let presentationUrl = material.file_url;
    if (material.format === 'ppt' && extracted.presentationBytes) {
      const dataUrl = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${extracted.presentationBytes.toString('base64')}`;
      presentationUrl = await saveDataUrl(dataUrl, 'presentation');
    }
    const mediaMap = new Map();
    if (Array.isArray(extracted.slides)) {
      for (const slide of extracted.slides) {
        for (const media of slide.media || []) {
          if (!media.dataUrl || mediaMap.has(media.dataUrl)) continue;
          try { mediaMap.set(media.dataUrl, await saveDataUrl(media.dataUrl, 'image')); }
          catch { /* keep unreadable images out of the library */ }
        }
      }
    }
    transaction(() => {
      run('DELETE FROM presentation_slides WHERE material_id=?', material.id);
      run('DELETE FROM material_assets WHERE material_id=? AND story_id IS NULL', material.id);
      (extracted.slides || []).forEach((slide) => {
        const layout = { ...(slide.layout || {}) };
        if (Array.isArray(layout.shapes)) {
          layout.shapes = layout.shapes.map((shape) => {
            if (shape?.src && mediaMap.has(shape.src)) return { ...shape, src: mediaMap.get(shape.src) };
            if (shape?.src && String(shape.src).startsWith('data:')) return { ...shape, src: null };
            return shape;
          });
        }
        run(`INSERT INTO presentation_slides(material_id,slide_number,title,text,notes,description,layout,transition)
             VALUES (?,?,?,?,?,?,?,?)`, material.id, Number(slide.number) || 0, slide.title || '',
          String(slide.text || '').slice(0, 20000), String(slide.notes || '').slice(0, 10000),
          String(slide.description || '').slice(0, 4000), JSON.stringify(layout),
          JSON.stringify(slide.transition || null));
      });
      for (const [dataUrl, url] of mediaMap) {
        run('INSERT INTO material_assets(material_id,kind,name,url,alt) VALUES (?,?,?,?,?)',
          material.id, 'slide_image', null, url, 'Extracted slide image');
      }
    });

    const materialPrefs = {
      ...jsonParse(material.preferences, {}),
      warnings: Array.isArray(extracted.warnings) ? extracted.warnings : [],
      needsOcr: Boolean(extracted.needsOcr)
    };
    run("UPDATE teaching_materials SET status='analyzing',extracted_text=?,preferences=?,presentation_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      String(extracted.text || '').slice(0, 200000), JSON.stringify(materialPrefs), presentationUrl, material.id);
    const analysis = await generateFromSource({
      text: extracted.text || '',
      sections: extracted.sections || [],
      title: material.title,
      gradeLevel: '',
      subject: '',
      language: settingValue('default_language', 'en-US')
    });
    run(`UPDATE teaching_materials SET status='ready',analysis=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      JSON.stringify(analysis), material.id);
    logActivity(getUser(material.teacher_id), 'process_material', 'material', material.id,
      { format: extracted.format, slides: extracted.slides?.length || 0, warnings: extracted.warnings });
    return { ...extracted, analysis };
  } catch (error) {
    run("UPDATE teaching_materials SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      String(error?.message || 'Processing failed.').slice(0, 1000), material.id);
    processingError(error);
  }
}

function validateGamePayload(body) {
  requireFields(body, ['title', 'type']);
  if (!GAME_TYPE_IDS.includes(body.type)) fail(400, 'Unsupported game type.');
  return {
    title: String(body.title).trim().slice(0, 160),
    description: String(body.description || '').slice(0, 1000),
    type: body.type,
    subject_id: body.subject_id || null,
    grade_level: String(body.grade_level || '').slice(0, 40) || null,
    competency_id: body.competency_id || null,
    lesson_id: body.lesson_id || null,
    difficulty: ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'medium',
    time_limit: body.time_limit === null || body.time_limit === '' ? null : Math.max(0, Math.min(3600, Number(body.time_limit) || 0)) || null,
    points_per_question: Math.max(1, Math.min(100, Number(body.points_per_question) || 10)),
    show_feedback: body.show_feedback === false || body.show_feedback === 0 ? 0 : 1,
    allow_retry: body.allow_retry === false || body.allow_retry === 0 ? 0 : 1,
    config: body.config && typeof body.config === 'object' ? body.config : jsonParse(body.config, {}),
    cover_image: body.cover_image || null,
    status: body.status === 'published' ? 'published' : 'draft',
    source: body.source === 'ai' ? 'ai' : 'manual'
  };
}

function saveQuestions(gameId, questions) {
  if (!Array.isArray(questions)) fail(400, 'Questions must be an array.');
  if (questions.length > 100) fail(400, 'A game can have at most 100 questions.');
  transaction(() => {
    run('DELETE FROM answer_choices WHERE question_id IN (SELECT id FROM game_questions WHERE game_id = ?)', gameId);
    run('DELETE FROM game_questions WHERE game_id = ?', gameId);
    questions.forEach((q, i) => {
      run(`INSERT INTO game_questions(game_id,prompt,explanation,points,media_url,audio_url,metadata,sort_order)
           VALUES (?,?,?,?,?,?,?,?)`,
        gameId,
        String(q.prompt ?? '').slice(0, 2000),
        String(q.explanation ?? '').slice(0, 2000),
        q.points === null || q.points === '' || q.points === undefined ? null : Math.max(0, Number(q.points) || 0),
        q.media_url || null,
        q.audio_url || null,
        JSON.stringify(q.metadata && typeof q.metadata === 'object' ? q.metadata : jsonParse(q.metadata, {})),
        Number(q.sort_order ?? i));
      const qid = Number(db.prepare('SELECT last_insert_rowid() id').get().id);
      const choices = Array.isArray(q.choices) ? q.choices : [];
      choices.slice(0, 12).forEach((c, j) => {
        run('INSERT INTO answer_choices(question_id,text,is_correct,media_url,feedback,sort_order) VALUES (?,?,?,?,?,?)',
          qid,
          String(c.text ?? '').slice(0, 1000),
          c.is_correct === true || c.is_correct === 1 || c.is_correct === 'true' ? 1 : 0,
          c.media_url || null,
          String(c.feedback ?? '').slice(0, 500),
          Number(c.sort_order ?? j));
      });
    });
  });
}

function publishIssues(game) {
  const issues = [];
  if (!game.questions.length) issues.push('Add at least one question before publishing.');
  game.questions.forEach((q, i) => {
    const needsChoice = !['matching', 'memory', 'sequencing', 'pronunciation', 'sorting'].includes(game.type);
    if (needsChoice && !q.choices.some((c) => c.is_correct) && game.type !== 'crossword' && game.type !== 'wordsearch') {
      issues.push(`Question ${i + 1} has no marked correct answer.`);
    }
  });
  return issues;
}

// ───────────────────────────── Auth & metadata ─────────────────────────────

route('POST', '/api/auth/login', null, ({ body, req }) => {
  requireFields(body, ['username', 'password']);
  const user = get(`SELECT u.*, r.name role_name FROM users u JOIN roles r ON r.id = u.role_id
                    WHERE u.username = ? OR u.email = ?`, body.username, body.username);
  if (!user || !verifyPassword(body.password, user.password_hash)) fail(401, 'Incorrect username or password.');
  if (!user.active) fail(403, 'This account has been deactivated. Contact your administrator.');
  if (user.role_name === 'teacher' && !user.approved) fail(403, 'Your teacher account is awaiting administrator approval.');
  run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', user.id);
  logActivity(user, 'login', 'user', user.id, { method: 'password' }, req);
  const safe = { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role_name, avatar_color: user.avatar_color };
  return ok({ token: signToken(user), user: safe });
});

route('POST', '/api/auth/register', null, ({ body, req }) => {
  requireFields(body, ['username', 'email', 'password', 'full_name']);
  if (String(body.password).length < 6) fail(400, 'Password must be at least 6 characters.');
  if (get('SELECT id FROM users WHERE username = ? OR email = ?', body.username, body.email)) fail(409, 'That username or email is already in use.');
  const roleId = get("SELECT id FROM roles WHERE name = 'teacher'").id;
  const result = run(`INSERT INTO users(username,email,password_hash,full_name,role_id,avatar_color,approved)
                      VALUES (?,?,?,?,?,?,0)`, String(body.username).trim(), String(body.email).trim(),
    hashPassword(body.password), String(body.full_name).trim(), roleId, '#8b5cf6');
  const user = getUser(Number(result.lastInsertRowid));
  logActivity(user, 'register', 'user', user.id, { role: 'teacher', pending_approval: true }, req);
  return created({ pending: true, message: 'Registration received. An administrator must approve your teacher account before you can sign in.' });
});

route('POST', '/api/auth/forgot-password', null, ({ body, req }) => {
  requireFields(body, ['email']);
  const user = get('SELECT * FROM users WHERE email=?', String(body.email).trim());
  if (!user) return ok({ ok: true, message: 'If that email is registered, a recovery code has been prepared.' });
  const token = randomBytes(18).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  run('UPDATE password_resets SET used=1 WHERE user_id=?', user.id);
  run("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES (?,?,datetime('now','+45 minutes'))", user.id, hash);
  logActivity(user, 'password_recovery_requested', 'user', user.id, null, req);
  const mode = settingValue('password_recovery_mode', 'developer');
  return ok({
    ok: true,
    message: mode === 'developer'
      ? 'Development recovery mode is enabled. Store this single-use code securely; it is shown only once.'
      : 'If that email is registered, a recovery code has been sent by your administrator.',
    recoveryCode: mode === 'developer' ? token : undefined,
    note: mode === 'developer' ? 'Configure an email provider and switch password_recovery_mode to production before live deployment.' : undefined
  });
});

route('POST', '/api/auth/reset-password', null, ({ body, req }) => {
  requireFields(body, ['token', 'password']);
  if (String(body.password).length < 6) fail(400, 'Password must be at least 6 characters.');
  const hash = createHash('sha256').update(String(body.token).trim()).digest('hex');
  const reset = get(`SELECT pr.*, u.full_name FROM password_resets pr JOIN users u ON u.id=pr.user_id
                     WHERE pr.token_hash=? AND pr.used=0 AND pr.expires_at > datetime('now')`, hash);
  if (!reset) fail(400, 'This recovery code is invalid or has expired.');
  transaction(() => {
    run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(body.password), reset.user_id);
    run('UPDATE password_resets SET used=1 WHERE id=?', reset.id);
  });
  logActivity({ id: reset.user_id }, 'password_reset', 'user', reset.user_id, null, req);
  return ok({ ok: true, message: 'Password updated. You can now sign in.' });
});

route('GET', '/api/auth/me', 'any', ({ user }) => ok({
  user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role_name, avatar_color: user.avatar_color },
  student: user.role_name === 'student' ? studentFor(user.id) : null
}));

route('GET', '/api/meta', null, () => ok({
  gameTypes: GAME_TYPES,
  subjects: all('SELECT * FROM subjects ORDER BY name'),
  rewards: all('SELECT * FROM rewards ORDER BY id'),
  fileTypes: SUPPORTED_FILE_TYPES,
  storyCategories: STORY_CATEGORIES,
  maxUploadBytes: MAX_UPLOAD_BYTES,
  curriculumNote: 'EduPlay does not ship official DepEd competency codes. Add and verify codes from your own official curriculum documents.'
}));

route('POST', '/api/media', 'teacher', async ({ body }) => {
  const dataUrl = String(body.dataUrl || '');
  const match = dataUrl.match(/^data:(image|audio)\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) fail(400, 'Only image and audio uploads are supported.');
  const bytes = Buffer.from(match[3].replace(/\s/g, ''), 'base64');
  if (bytes.length > 12 * 1024 * 1024) fail(413, 'File is larger than 12 MB.');
  const safeExt = match[2].replace(/[^a-z0-9]/gi, '').slice(0, 8) || (match[1] === 'audio' ? 'mp3' : 'png');
  const filename = `${randomUUID()}.${safeExt}`;
  await writeFile(join(UPLOAD_DIR, filename), bytes);
  return created({ url: `/media/${filename}`, name: body.name || filename, size: bytes.length });
});

// Batch page-image upload: keeps large PDF flip books under the JSON body cap.
route('POST', '/api/story-previews', 'teacher', async ({ body }) => {
  const images = Array.isArray(body.images) ? body.images : [];
  if (!images.length) fail(400, 'No page images were supplied.');
  if (images.length > 30) fail(413, 'Upload page images in batches of 30 or fewer.');
  const urls = [];
  for (const dataUrl of images) {
    if (!/^data:image\//i.test(String(dataUrl || ''))) fail(400, 'Only image page previews are supported.');
    urls.push(await saveDataUrl(dataUrl, 'image'));
  }
  return created({ urls });
});

// ───────────────────────────── Subjects & competencies ─────────────────────

route('GET', '/api/subjects', 'any', () => ok(all('SELECT * FROM subjects ORDER BY name')));
route('POST', '/api/subjects', 'teacher', ({ body }) => {
  requireFields(body, ['name']);
  const r = run('INSERT INTO subjects(name,code,description,color,icon) VALUES (?,?,?,?,?)',
    String(body.name).trim(), body.code || null, body.description || null, body.color || '#6366f1', body.icon || '📚');
  return created(get('SELECT * FROM subjects WHERE id = ?', Number(r.lastInsertRowid)));
});

route('GET', '/api/competencies', 'any', ({ query }) => {
  let sql = `SELECT cc.*, s.name subject_name FROM curriculum_competencies cc JOIN subjects s ON s.id = cc.subject_id WHERE 1=1`;
  const args = [];
  if (query.subject_id) { sql += ' AND cc.subject_id = ?'; args.push(query.subject_id); }
  if (query.grade_level) { sql += ' AND cc.grade_level = ?'; args.push(query.grade_level); }
  return ok(all(sql + ' ORDER BY cc.grade_level, s.name, cc.id', ...args));
});

route('POST', '/api/competencies', 'teacher', ({ body, user }) => {
  requireFields(body, ['title', 'grade_level', 'subject_id']);
  const r = run(`INSERT INTO curriculum_competencies(subject_id,grade_level,code,title,description,curriculum,reference,verified,created_by)
                 VALUES (?,?,?,?,?,?,?,0,?)`,
    body.subject_id, String(body.grade_level), body.code || null, String(body.title).trim(),
    body.description || null, body.curriculum || 'DepEd MATATAG', body.reference || null, user.id);
  return created(get('SELECT cc.*, s.name subject_name FROM curriculum_competencies cc JOIN subjects s ON s.id=cc.subject_id WHERE cc.id=?', Number(r.lastInsertRowid)));
});

route('PUT', '/api/competencies/:id', 'teacher', ({ params, body, user }) => {
  const c = get('SELECT * FROM curriculum_competencies WHERE id = ?', params.id);
  if (!c) fail(404, 'Competency not found.');
  run(`UPDATE curriculum_competencies SET subject_id=?, grade_level=?, code=?, title=?, description=?, curriculum=?, reference=?, verified=?, verified_by=? WHERE id=?`,
    body.subject_id || c.subject_id, body.grade_level || c.grade_level,
    body.code === '' ? null : (body.code ?? c.code), body.title || c.title,
    body.description ?? c.description, body.curriculum || c.curriculum, body.reference ?? c.reference,
    body.verified ? 1 : 0, body.verified ? user.id : null, params.id);
  return ok(get('SELECT cc.*, s.name subject_name FROM curriculum_competencies cc JOIN subjects s ON s.id=cc.subject_id WHERE cc.id=?', params.id));
});

route('DELETE', '/api/competencies/:id', 'teacher', ({ params }) => {
  run('DELETE FROM curriculum_competencies WHERE id = ?', params.id);
  return ok({ deleted: true });
});

// ───────────────────────────── Lessons ─────────────────────────────

route('GET', '/api/lessons', 'teacher', ({ user, query }) => {
  const args = [user.id];
  let sql = `SELECT l.*, s.name subject_name, cc.title competency_title, cc.code competency_code,
             (SELECT COUNT(*) FROM games g WHERE g.lesson_id = l.id) game_count
             FROM lessons l LEFT JOIN subjects s ON s.id=l.subject_id
             LEFT JOIN curriculum_competencies cc ON cc.id=l.competency_id WHERE l.teacher_id = ?`;
  if (query.status) { sql += ' AND l.status = ?'; args.push(query.status); }
  sql += ' ORDER BY l.updated_at DESC, l.id DESC';
  return ok(all(sql, ...args));
});

route('GET', '/api/lessons/:id', 'teacher', ({ params, user }) => {
  const lesson = get('SELECT * FROM lessons WHERE id = ? AND teacher_id = ?', params.id, user.id);
  if (!lesson) fail(404, 'Lesson not found.');
  return ok(lesson);
});

route('POST', '/api/lessons', 'teacher', ({ body, user }) => {
  requireFields(body, ['title']);
  const r = run(`INSERT INTO lessons(teacher_id,subject_id,grade_level,competency_id,title,description,objectives,status)
                 VALUES (?,?,?,?,?,?,?,?)`,
    user.id, body.subject_id || null, body.grade_level || null, body.competency_id || null,
    String(body.title).trim(), body.description || null, body.objectives || null,
    body.status === 'published' ? 'published' : 'draft');
  return created(get('SELECT * FROM lessons WHERE id = ?', Number(r.lastInsertRowid)));
});

route('PUT', '/api/lessons/:id', 'teacher', ({ params, body, user }) => {
  const lesson = get('SELECT * FROM lessons WHERE id = ? AND teacher_id = ?', params.id, user.id);
  if (!lesson) fail(404, 'Lesson not found.');
  run(`UPDATE lessons SET subject_id=?,grade_level=?,competency_id=?,title=?,description=?,objectives=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    body.subject_id ?? lesson.subject_id, body.grade_level ?? lesson.grade_level,
    body.competency_id ?? lesson.competency_id, body.title || lesson.title,
    body.description ?? lesson.description, body.objectives ?? lesson.objectives,
    body.status || lesson.status, params.id);
  return ok(get('SELECT * FROM lessons WHERE id = ?', params.id));
});

route('DELETE', '/api/lessons/:id', 'teacher', ({ params, user }) => {
  run('DELETE FROM lessons WHERE id = ? AND teacher_id = ?', params.id, user.id);
  return ok({ deleted: true });
});

// ───────────────────────────── Games ─────────────────────────────

route('GET', '/api/games', 'any', ({ user, query }) => {
  const args = [];
  let sql = `SELECT g.*, s.name subject_name, cc.title competency_title, cc.code competency_code,
             l.title lesson_title,
             (SELECT COUNT(*) FROM game_questions q WHERE q.game_id = g.id) question_count,
             (SELECT COUNT(*) FROM assignments a WHERE a.game_id = g.id) assignment_count
             FROM games g LEFT JOIN subjects s ON s.id=g.subject_id
             LEFT JOIN curriculum_competencies cc ON cc.id=g.competency_id
             LEFT JOIN lessons l ON l.id=g.lesson_id WHERE 1=1`;
  if (user.role_name === 'teacher') { sql += ' AND g.teacher_id = ?'; args.push(user.id); }
  else sql += " AND g.status = 'published'";
  if (query.status) { sql += ' AND g.status = ?'; args.push(query.status); }
  if (query.type) { sql += ' AND g.type = ?'; args.push(query.type); }
  if (query.subject_id) { sql += ' AND g.subject_id = ?'; args.push(query.subject_id); }
  if (query.search) { sql += ' AND (g.title LIKE ? OR g.description LIKE ?)'; args.push(`%${query.search}%`, `%${query.search}%`); }
  sql += ' ORDER BY g.updated_at DESC, g.id DESC';
  return ok(all(sql, ...args));
});

route('GET', '/api/games/:id', 'any', ({ params, user }) => {
  const game = hydrateGame(get('SELECT * FROM games WHERE id = ?', params.id));
  if (!game) fail(404, 'Game not found.');
  if (user.role_name === 'teacher') {
    if (game.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'This game belongs to another teacher.');
  } else if (game.status !== 'published') fail(404, 'Game not found.');
  return ok(game);
});

route('POST', '/api/games', 'teacher', ({ body, user }) => {
  const g = validateGamePayload(body);
  const r = run(`INSERT INTO games(teacher_id,lesson_id,subject_id,grade_level,competency_id,title,description,type,difficulty,time_limit,points_per_question,show_feedback,allow_retry,config,cover_image,status,source)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    user.id, g.lesson_id, g.subject_id, g.grade_level, g.competency_id, g.title, g.description, g.type,
    g.difficulty, g.time_limit, g.points_per_question, g.show_feedback, g.allow_retry,
    JSON.stringify(g.config || {}), g.cover_image, g.status, g.source);
  const id = Number(r.lastInsertRowid);
  if (Array.isArray(body.questions)) saveQuestions(id, body.questions);
  return created(hydrateGame(get('SELECT * FROM games WHERE id = ?', id)));
});

route('PUT', '/api/games/:id', 'teacher', ({ params, body, user }) => {
  const current = gameAccess(params.id, user);
  const g = validateGamePayload({ ...current, ...body });
  run(`UPDATE games SET lesson_id=?,subject_id=?,grade_level=?,competency_id=?,title=?,description=?,type=?,difficulty=?,time_limit=?,points_per_question=?,show_feedback=?,allow_retry=?,config=?,cover_image=?,status=?,source=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    g.lesson_id, g.subject_id, g.grade_level, g.competency_id, g.title, g.description, g.type, g.difficulty,
    g.time_limit, g.points_per_question, g.show_feedback, g.allow_retry, JSON.stringify(g.config || {}),
    g.cover_image, g.status, g.source, params.id);
  if (Array.isArray(body.questions)) saveQuestions(params.id, body.questions);
  return ok(hydrateGame(get('SELECT * FROM games WHERE id = ?', params.id)));
});

route('DELETE', '/api/games/:id', 'teacher', ({ params, user }) => {
  gameAccess(params.id, user);
  run('DELETE FROM games WHERE id = ?', params.id);
  return ok({ deleted: true });
});

route('POST', '/api/games/:id/duplicate', 'teacher', ({ params, user }) => {
  const source = hydrateGame(gameAccess(params.id, user));
  const r = run(`INSERT INTO games(teacher_id,lesson_id,subject_id,grade_level,competency_id,title,description,type,difficulty,time_limit,points_per_question,show_feedback,allow_retry,config,cover_image,status,source)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft','manual')`,
    user.id, source.lesson_id, source.subject_id, source.grade_level, source.competency_id,
    `${source.title} (Copy)`, source.description, source.type, source.difficulty, source.time_limit,
    source.points_per_question, source.show_feedback, source.allow_retry,
    JSON.stringify(source.config), source.cover_image);
  const id = Number(r.lastInsertRowid);
  saveQuestions(id, source.questions.map((q) => ({
    prompt: q.prompt, explanation: q.explanation, points: q.points, media_url: q.media_url,
    audio_url: q.audio_url, metadata: q.metadata, choices: q.choices
  })));
  return created(hydrateGame(get('SELECT * FROM games WHERE id = ?', id)));
});

route('POST', '/api/games/:id/publish', 'teacher', ({ params, user, req }) => {
  const game = hydrateGame(gameAccess(params.id, user));
  const issues = publishIssues(game);
  if (issues.length) fail(422, 'Fix these issues before publishing:', issues);
  run("UPDATE games SET status='published', updated_at=CURRENT_TIMESTAMP WHERE id=?", params.id);
  logActivity(user, 'publish_game', 'game', params.id, { title: game.title }, req);
  return ok(hydrateGame(get('SELECT * FROM games WHERE id = ?', params.id)));
});

route('GET', '/api/games/:id/preview', 'teacher', ({ params, user }) => {
  return ok(hydrateGame(gameAccess(params.id, user)));
});

route('GET', '/api/generated-games', 'teacher', ({ user }) => ok(all(`
  SELECT gg.id, gg.type, gg.title, gg.status, gg.game_id,
         (SELECT COUNT(*) FROM game_questions q WHERE q.game_id=gg.game_id) question_count,
         CASE WHEN gg.material_id IS NOT NULL THEN 'material'
              WHEN gg.story_id IS NOT NULL THEN 'story'
              WHEN gg.lesson_id IS NOT NULL THEN 'lesson'
              ELSE 'text' END source_type,
         COALESCE(gg.material_id, gg.story_id, gg.lesson_id) source_id,
         COALESCE(m.title, st.title, l.title, '') source_title,
         gg.created_at, g.title game_title, g.status game_status
  FROM generated_games gg
  LEFT JOIN games g ON g.id=gg.game_id
  LEFT JOIN teaching_materials m ON m.id=gg.material_id
  LEFT JOIN stories st ON st.id=gg.story_id
  LEFT JOIN lessons l ON l.id=gg.lesson_id
  WHERE gg.teacher_id=?
  ORDER BY gg.created_at DESC, gg.id DESC`, user.id)));

route('POST', '/api/ai/generate', 'teacher', async ({ body }) => {
  requireFields(body, ['topic', 'grade_level', 'subject']);
  const result = await generateGame({
    topic: body.topic,
    grade: body.grade_level,
    subject: body.subject,
    competency: body.competency_title || '',
    gameType: body.game_type || body.type || 'multiple_choice',
    count: body.count,
    config: body.config
  });
  return ok(result);
});

// ───────────────────────────── Classes & students ──────────────────────────

route('GET', '/api/classes', 'teacher', ({ user }) => ok(all(`
  SELECT c.*, s.name subject_name, (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id=c.id) student_count,
         (SELECT COUNT(*) FROM assignments a WHERE a.class_id=c.id) assignment_count
  FROM classes c LEFT JOIN subjects s ON s.id=c.subject_id WHERE c.teacher_id=? ORDER BY c.id DESC`, user.id)));

route('GET', '/api/classes/:id', 'teacher', ({ params, user }) => {
  const c = get('SELECT * FROM classes WHERE id=? AND teacher_id=?', params.id, user.id);
  if (!c) fail(404, 'Class not found.');
  return ok({
    ...c,
    students: all(`SELECT st.*, u.full_name, u.email, u.username FROM class_students cs
                   JOIN students st ON st.id=cs.student_id JOIN users u ON u.id=st.user_id
                   WHERE cs.class_id=? ORDER BY u.full_name`, params.id),
    assignments: all('SELECT * FROM assignments WHERE class_id=? ORDER BY id DESC', params.id)
  });
});

function newJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

route('POST', '/api/classes', 'teacher', ({ body, user }) => {
  requireFields(body, ['name', 'grade_level']);
  let code = newJoinCode();
  while (get('SELECT id FROM classes WHERE join_code=?', code)) code = newJoinCode();
  const r = run('INSERT INTO classes(name,grade_level,subject_id,teacher_id,school_year,join_code) VALUES (?,?,?,?,?,?)',
    String(body.name).trim(), String(body.grade_level), body.subject_id || null, user.id, body.school_year || null, code);
  return created(get('SELECT * FROM classes WHERE id=?', Number(r.lastInsertRowid)));
});

route('PUT', '/api/classes/:id', 'teacher', ({ params, body, user }) => {
  const c = get('SELECT * FROM classes WHERE id=? AND teacher_id=?', params.id, user.id);
  if (!c) fail(404, 'Class not found.');
  run('UPDATE classes SET name=?,grade_level=?,subject_id=?,school_year=? WHERE id=?',
    body.name || c.name, body.grade_level || c.grade_level, body.subject_id ?? c.subject_id,
    body.school_year ?? c.school_year, params.id);
  return ok(get('SELECT * FROM classes WHERE id=?', params.id));
});

route('DELETE', '/api/classes/:id', 'teacher', ({ params, user }) => {
  run('DELETE FROM classes WHERE id=? AND teacher_id=?', params.id, user.id);
  return ok({ deleted: true });
});

route('GET', '/api/students', 'teacher', ({ user }) => ok(all(`
  SELECT st.*, u.full_name, u.email, u.username,
    (SELECT COUNT(*) FROM class_students cs WHERE cs.student_id=st.id) class_count,
    (SELECT COUNT(*) FROM scores sc WHERE sc.student_id=st.id) attempts
  FROM students st JOIN users u ON u.id=st.user_id ORDER BY u.full_name`)));

route('POST', '/api/students', 'teacher', ({ body, user }) => {
  requireFields(body, ['full_name', 'email']);
  const username = String(body.username || body.email.split('@')[0]).trim();
  if (get('SELECT id FROM users WHERE username=? OR email=?', username, body.email)) fail(409, 'A user with that username or email already exists.');
  const password = String(body.password || 'Student123!');
  const roleId = get("SELECT id FROM roles WHERE name='student'").id;
  const ur = run(`INSERT INTO users(username,email,password_hash,full_name,role_id,avatar_color) VALUES (?,?,?,?,?,?)`,
    username, String(body.email).trim(), hashPassword(password), String(body.full_name).trim(), roleId, '#f59e0b');
  const sr = run('INSERT INTO students(user_id,student_number,grade_level,section) VALUES (?,?,?,?)',
    Number(ur.lastInsertRowid), body.student_number || null, body.grade_level || null, body.section || null);
  const studentId = Number(sr.lastInsertRowid);
  if (body.class_id) run('INSERT OR IGNORE INTO class_students(class_id,student_id) VALUES (?,?)', body.class_id, studentId);
  return created({ id: studentId, username, email: body.email, password, full_name: body.full_name });
});

route('POST', '/api/classes/:id/students', 'teacher', ({ params, body }) => {
  if (!get('SELECT id FROM classes WHERE id=?', params.id)) fail(404, 'Class not found.');
  if (!get('SELECT id FROM students WHERE id=?', body.student_id)) fail(404, 'Student not found.');
  run('INSERT OR IGNORE INTO class_students(class_id,student_id) VALUES (?,?)', params.id, body.student_id);
  return ok({ added: true });
});

route('DELETE', '/api/classes/:id/students/:studentId', 'teacher', ({ params }) => {
  run('DELETE FROM class_students WHERE class_id=? AND student_id=?', params.id, params.studentId);
  return ok({ removed: true });
});

route('POST', '/api/student/join', 'student', ({ body, user }) => {
  requireFields(body, ['code']);
  const c = get('SELECT * FROM classes WHERE join_code=?', String(body.code).trim().toUpperCase());
  if (!c) fail(404, 'No class found with that code.');
  const student = studentFor(user.id);
  run('INSERT OR IGNORE INTO class_students(class_id,student_id) VALUES (?,?)', c.id, student.id);
  return ok({ class: c });
});

// ───────────────────────────── Assignments ─────────────────────────────

route('GET', '/api/assignments', 'teacher', ({ user, query }) => {
  const args = [user.id];
  let sql = `SELECT a.*, g.title game_title, g.type game_type, g.status game_status, g.subject_id,
             c.name class_name, s.name subject_name,
             (SELECT COUNT(*) FROM attempts at WHERE at.assignment_id=a.id) attempt_count,
             (SELECT COUNT(DISTINCT at.student_id) FROM attempts at WHERE at.assignment_id=a.id) student_count
             FROM assignments a JOIN games g ON g.id=a.game_id JOIN classes c ON c.id=a.class_id
             LEFT JOIN subjects s ON s.id=g.subject_id WHERE a.teacher_id=?`;
  if (query.class_id) { sql += ' AND a.class_id=?'; args.push(query.class_id); }
  if (query.game_id) { sql += ' AND a.game_id=?'; args.push(query.game_id); }
  sql += ' ORDER BY a.id DESC';
  return ok(all(sql, ...args));
});

route('POST', '/api/assignments', 'teacher', ({ body, user, req }) => {
  requireFields(body, ['game_id', 'class_id']);
  const game = gameAccess(body.game_id, user);
  if (!get('SELECT id FROM classes WHERE id=? AND teacher_id=?', body.class_id, user.id)) fail(404, 'Class not found.');
  const r = run(`INSERT INTO assignments(game_id,class_id,teacher_id,title,instructions,due_at,allow_retry,show_feedback,status)
                 VALUES (?,?,?,?,?,?,?,?,?)`,
    body.game_id, body.class_id, user.id, body.title || game.title, body.instructions || '',
    body.due_at || null, body.allow_retry === false || body.allow_retry === 0 ? 0 : 1,
    body.show_feedback === false || body.show_feedback === 0 ? 0 : 1, 'active');
  logActivity(user, 'create_assignment', 'assignment', Number(r.lastInsertRowid), { game: game.title }, req);
  return created(get('SELECT * FROM assignments WHERE id=?', Number(r.lastInsertRowid)));
});

route('PUT', '/api/assignments/:id', 'teacher', ({ params, body, user }) => {
  const a = get('SELECT * FROM assignments WHERE id=? AND teacher_id=?', params.id, user.id);
  if (!a) fail(404, 'Assignment not found.');
  run('UPDATE assignments SET title=?,instructions=?,due_at=?,allow_retry=?,show_feedback=?,status=? WHERE id=?',
    body.title ?? a.title, body.instructions ?? a.instructions, body.due_at ?? a.due_at,
    body.allow_retry === false || body.allow_retry === 0 ? 0 : 1,
    body.show_feedback === false || body.show_feedback === 0 ? 0 : 1,
    body.status || a.status, params.id);
  return ok(get('SELECT * FROM assignments WHERE id=?', params.id));
});

route('DELETE', '/api/assignments/:id', 'teacher', ({ params, user }) => {
  run('DELETE FROM assignments WHERE id=? AND teacher_id=?', params.id, user.id);
  return ok({ deleted: true });
});

// ───────────────────────────── Reports ─────────────────────────────

route('GET', '/api/reports/performance', 'teacher', ({ user, query }) => {
  const args = [user.id];
  return ok(all(`SELECT sc.*, u.full_name student_name, st.grade_level, st.section, g.title game_title, g.type game_type,
             COALESCE(c.name, '—') class_name, s.name subject_name, at.started_at, at.completed_at, at.time_spent
             FROM scores sc JOIN attempts at ON at.id=sc.attempt_id
             JOIN students st ON st.id=sc.student_id JOIN users u ON u.id=st.user_id
             JOIN games g ON g.id=sc.game_id
             LEFT JOIN assignments a ON a.id=at.assignment_id LEFT JOIN classes c ON c.id=a.class_id
             LEFT JOIN subjects s ON s.id=g.subject_id WHERE g.teacher_id=?
             ${query.game_id ? 'AND g.id=?' : ''} ${query.class_id ? 'AND a.class_id=?' : ''}
             ORDER BY sc.recorded_at DESC LIMIT 1000`,
    ...args, ...(query.game_id ? [query.game_id] : []), ...(query.class_id ? [query.class_id] : [])));
});

route('GET', '/api/reports/summary', 'teacher', ({ user }) => ok({
  totals: get(`SELECT (SELECT COUNT(*) FROM games WHERE teacher_id=?) games,
                      (SELECT COUNT(*) FROM lessons WHERE teacher_id=?) lessons,
                      (SELECT COUNT(*) FROM assignments WHERE teacher_id=?) assignments,
                      (SELECT COUNT(*) FROM scores sc JOIN games g ON g.id=sc.game_id WHERE g.teacher_id=?) completed`,
    user.id, user.id, user.id, user.id),
  byGame: all(`SELECT g.id, g.title, g.type, COUNT(sc.id) attempts, ROUND(AVG(sc.percentage),1) avg_score,
               MAX(sc.percentage) best_score FROM games g LEFT JOIN scores sc ON sc.game_id=g.id
               WHERE g.teacher_id=? GROUP BY g.id ORDER BY attempts DESC LIMIT 12`, user.id),
  byStudent: all(`SELECT u.full_name, st.id student_id, COUNT(sc.id) attempts, ROUND(AVG(sc.percentage),1) avg_score,
                  SUM(sc.points) points FROM scores sc JOIN students st ON st.id=sc.student_id
                  JOIN users u ON u.id=st.user_id JOIN games g ON g.id=sc.game_id
                  WHERE g.teacher_id=? GROUP BY st.id ORDER BY avg_score DESC LIMIT 12`, user.id)
}));

route('GET', '/api/reports/export', 'teacher', ({ user, query, res }) => {
  const type = query.type || 'scores';
  let rows = [];
  let filename = 'eduplay-report.csv';
  if (type === 'scores') {
    rows = [
      ['Student', 'Grade', 'Section', 'Class', 'Game', 'Type', 'Subject', 'Points', 'Max Points', 'Percent', 'Stars', 'Passed', 'Date'],
      ...all(`SELECT u.full_name, st.grade_level, st.section, COALESCE(c.name,'—') class_name, g.title, g.type,
              COALESCE(s.name,'—') subject_name, sc.points, sc.max_points, ROUND(sc.percentage,1) pct, sc.stars,
              CASE sc.passed WHEN 1 THEN 'Yes' ELSE 'No' END passed, sc.recorded_at
              FROM scores sc JOIN attempts at ON at.id=sc.attempt_id
              LEFT JOIN assignments a ON a.id=at.assignment_id LEFT JOIN classes c ON c.id=a.class_id
              JOIN students st ON st.id=sc.student_id JOIN users u ON u.id=st.user_id
              JOIN games g ON g.id=sc.game_id LEFT JOIN subjects s ON s.id=g.subject_id
              WHERE g.teacher_id=? ORDER BY sc.recorded_at DESC`, user.id)
        .map((r) => [r.full_name, r.grade_level, r.section, r.class_name, r.title, r.type, r.subject_name, r.points, r.max_points, r.pct, r.stars, r.passed, r.recorded_at])
    ];
    filename = 'eduplay-assessment-results.csv';
  } else if (type === 'games') {
    rows = [
      ['Title', 'Type', 'Subject', 'Grade', 'Difficulty', 'Status', 'Questions', 'Assignments', 'Updated'],
      ...all(`SELECT g.title, g.type, COALESCE(s.name,'—') subject_name, COALESCE(g.grade_level,'—'), g.difficulty, g.status,
              (SELECT COUNT(*) FROM game_questions q WHERE q.game_id=g.id) questions,
              (SELECT COUNT(*) FROM assignments a WHERE a.game_id=g.id) assignments, g.updated_at
              FROM games g LEFT JOIN subjects s ON s.id=g.subject_id WHERE g.teacher_id=? ORDER BY g.id DESC`, user.id).map((r) => Object.values(r))
    ];
    filename = 'eduplay-game-inventory.csv';
  } else {
    rows = [
      ['Student', 'Email', 'Grade', 'Section', 'Games Completed', 'Total Points', 'Best %', 'Average %', 'Last Activity'],
      ...all(`SELECT u.full_name, u.email, COALESCE(st.grade_level,'—'), COALESCE(st.section,'—'),
              (SELECT COUNT(*) FROM scores sc WHERE sc.student_id=st.id) completed,
              (SELECT COALESCE(SUM(points),0) FROM scores sc WHERE sc.student_id=st.id) total_points,
              (SELECT COALESCE(MAX(percentage),0) FROM scores sc WHERE sc.student_id=st.id) best,
              (SELECT COALESCE(AVG(percentage),0) FROM scores sc WHERE sc.student_id=st.id) average,
              COALESCE((SELECT MAX(last_activity_at) FROM student_progress p WHERE p.student_id=st.id),'—')
              FROM students st JOIN users u ON u.id=st.user_id ORDER BY u.full_name`).map((r) => Object.values(r))
    ];
    filename = 'eduplay-student-progress.csv';
  }
  const payload = '\uFEFF' + csv(rows);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
});

route('GET', '/api/teacher/overview', 'teacher', ({ user }) => {
  const stats = get(`SELECT (SELECT COUNT(*) FROM games WHERE teacher_id=?) games,
                           (SELECT COUNT(*) FROM games WHERE teacher_id=? AND status='draft') drafts,
                           (SELECT COUNT(*) FROM lessons WHERE teacher_id=?) lessons,
                           (SELECT COUNT(*) FROM assignments WHERE teacher_id=?) assignments,
                           (SELECT COUNT(*) FROM classes WHERE teacher_id=?) classes,
                           (SELECT COUNT(*) FROM scores sc JOIN games g ON g.id=sc.game_id WHERE g.teacher_id=?) plays,
                           (SELECT COALESCE(ROUND(AVG(percentage),1),0) FROM scores sc JOIN games g ON g.id=sc.game_id WHERE g.teacher_id=?) average`,
    user.id, user.id, user.id, user.id, user.id, user.id, user.id);
  return ok({
    stats,
    recent: all(`SELECT sc.*, u.full_name student_name, g.title game_title, g.type FROM scores sc
                 JOIN students st ON st.id=sc.student_id JOIN users u ON u.id=st.user_id
                 JOIN games g ON g.id=sc.game_id WHERE g.teacher_id=? ORDER BY sc.recorded_at DESC LIMIT 8`, user.id),
    topGames: all(`SELECT g.id, g.title, g.type, COUNT(sc.id) plays, ROUND(AVG(sc.percentage),1) avg
                   FROM games g LEFT JOIN scores sc ON sc.game_id=g.id WHERE g.teacher_id=?
                   GROUP BY g.id ORDER BY plays DESC LIMIT 5`, user.id)
  });
});

// ───────────────────────────── Student play ─────────────────────────────

route('GET', '/api/student/dashboard', 'student', ({ user }) => {
  const student = studentFor(user.id);
  if (!student) fail(404, 'Student profile not found.');
  const assignments = all(`
    SELECT a.id assignment_id, a.due_at, a.allow_retry assignment_allow_retry, a.show_feedback, a.instructions,
           g.*, c.name class_name, s.name subject_name, s.color subject_color, s.icon subject_icon,
           (SELECT COUNT(*) FROM attempts at WHERE at.assignment_id=a.id AND at.student_id=st.id) my_attempts,
           (SELECT MAX(sc.percentage) FROM scores sc JOIN attempts at ON at.id=sc.attempt_id
            WHERE at.assignment_id=a.id AND at.student_id=st.id) best_score
    FROM assignments a JOIN games g ON g.id=a.game_id JOIN classes c ON c.id=a.class_id
    JOIN class_students cs ON cs.class_id=c.id
    JOIN students st ON st.user_id=? AND st.id=cs.student_id
    LEFT JOIN subjects s ON s.id=g.subject_id
    WHERE a.status='active' AND g.status='published'
    ORDER BY (a.due_at IS NULL), a.due_at, a.id DESC`, user.id);
  const progress = get(`SELECT COUNT(*) completed, COALESCE(SUM(points),0) points,
                        COALESCE(AVG(percentage),0) average FROM scores WHERE student_id=?`, student.id);
  const rewards = all(`SELECT r.*, sr.awarded_at, g.title game_title FROM student_rewards sr
                       JOIN rewards r ON r.id=sr.reward_id LEFT JOIN games g ON g.id=sr.game_id
                       WHERE sr.student_id=? ORDER BY sr.awarded_at DESC`, student.id);
  const classes = all(`SELECT c.*, s.name subject_name FROM class_students cs JOIN classes c ON c.id=cs.class_id
                       LEFT JOIN subjects s ON s.id=c.subject_id WHERE cs.student_id=?`, student.id);
  return ok({ student, assignments, progress, rewards, classes });
});

route('GET', '/api/student/progress', 'student', ({ user }) => {
  const student = studentFor(user.id);
  return ok({
    rows: all(`SELECT p.*, COALESCE(s.name,'General') subject_name, g.title game_title, g.type game_type
               FROM student_progress p LEFT JOIN subjects s ON s.id=p.subject_id
               LEFT JOIN games g ON g.id=p.game_id WHERE p.student_id=? ORDER BY p.last_activity_at DESC`, student.id),
    history: all(`SELECT sc.*, g.title game_title, g.type game_type, g.subject_id, s.name subject_name
                  FROM scores sc JOIN games g ON g.id=sc.game_id LEFT JOIN subjects s ON s.id=g.subject_id
                  WHERE sc.student_id=? ORDER BY sc.recorded_at DESC LIMIT 50`, student.id),
    rewards: all(`SELECT r.*, sr.awarded_at, g.title game_title FROM student_rewards sr
                  JOIN rewards r ON r.id=sr.reward_id LEFT JOIN games g ON g.id=sr.game_id
                  WHERE sr.student_id=? ORDER BY sr.awarded_at DESC`, student.id)
  });
});

route('GET', '/api/student/assignments', 'student', ({ user }) => {
  const student = studentFor(user.id);
  return ok(all(`SELECT a.*, g.title game_title, g.type game_type, g.status game_status,
                         g.grade_level game_grade_level, g.difficulty game_difficulty,
                         s.name subject_name, cc.title competency_title, c.name class_name
                  FROM assignments a
                  JOIN games g ON g.id=a.game_id
                  LEFT JOIN subjects s ON s.id=g.subject_id
                  LEFT JOIN curriculum_competencies cc ON cc.id=g.competency_id
                  JOIN classes c ON c.id=a.class_id
                 JOIN class_students cs ON cs.class_id=c.id AND cs.student_id=?
                 WHERE a.status='active' AND g.status='published' ORDER BY a.id DESC`, student.id));
});

function ensurePlayable(assignmentId, gameId, student) {
  let assignment = null;
  if (assignmentId) {
    assignment = get(`SELECT a.* FROM assignments a JOIN class_students cs ON cs.class_id=a.class_id
                      WHERE a.id=? AND cs.student_id=? AND a.status='active'`, assignmentId, student.id);
    if (!assignment) fail(403, 'This assignment is not available to you.');
    gameId = assignment.game_id;
  }
  const game = get('SELECT * FROM games WHERE id=? AND status=?', gameId, 'published');
  if (!game) fail(404, 'Game is not available.');
  if (!assignment) {
    const any = get(`SELECT a.* FROM assignments a JOIN class_students cs ON cs.class_id=a.class_id
                     WHERE a.game_id=? AND cs.student_id=? AND a.status='active' LIMIT 1`, gameId, student.id);
    if (!any) fail(403, 'This game has not been assigned to your class.');
    assignment = any;
  }
  const previous = all(`SELECT at.* FROM attempts at WHERE at.game_id=? AND at.student_id=? ORDER BY at.id DESC`, gameId, student.id);
  if (previous.length && !assignment.allow_retry && previous.some((p) => p.status === 'completed')) {
    fail(403, 'This activity allows only one attempt.');
  }
  return { assignment, game, attemptNumber: previous.length + 1 };
}

route('POST', '/api/attempts', 'student', ({ body, user }) => {
  const student = studentFor(user.id);
  const { assignment, game, attemptNumber } = ensurePlayable(body.assignment_id || body.assignmentId, body.game_id || body.gameId, student);
  const r = run('INSERT INTO attempts(assignment_id,game_id,student_id) VALUES (?,?,?)', assignment.id, game.id, student.id);
  return created({ attempt: get('SELECT * FROM attempts WHERE id=?', Number(r.lastInsertRowid)), game: hydrateGame(game), attemptNumber });
});

route('GET', '/api/attempts/:id', 'any', ({ params, user }) => {
  const attempt = get('SELECT * FROM attempts WHERE id=?', params.id);
  if (!attempt) fail(404, 'Attempt not found.');
  if (user.role_name === 'student' && attempt.student_id !== studentFor(user.id)?.id) fail(403, 'Not your attempt.');
  if (user.role_name === 'teacher') {
    const g = get('SELECT teacher_id FROM games WHERE id=?', attempt.game_id);
    if (g?.teacher_id !== user.id) fail(403, 'Not your class.');
  }
  return ok({
    ...attempt,
    answers: jsonParse(attempt.answers, []),
    details: jsonParse(attempt.details, []),
    assignment: attempt.assignment_id ? get('SELECT * FROM assignments WHERE id = ?', attempt.assignment_id) : null
  });
});

route('POST', '/api/attempts/:id/heartbeat', 'student', ({ params, body, user }) => {
  const attempt = get('SELECT * FROM attempts WHERE id=?', params.id);
  if (!attempt || attempt.student_id !== studentFor(user.id)?.id) fail(404, 'Attempt not found.');
  run('UPDATE attempts SET time_spent=MAX(time_spent,?) WHERE id=?', Math.max(0, Number(body.time_spent || 0)), params.id);
  return ok({ ok: true });
});

function awardRewards(studentId, gameId, { percentage, timeSpent, timeLimit, attemptNumber }) {
  const criteria = [];
  if (attemptNumber === 1) criteria.push({ type: 'first_play' });
  if (percentage >= 100) criteria.push({ type: 'perfect' });
  if (percentage >= 80) criteria.push({ type: 'score_80' });
  if (timeLimit && timeSpent > 0 && timeSpent < timeLimit * 0.5) criteria.push({ type: 'fast' });
  if (attemptNumber > 1) criteria.push({ type: 'retry' });
  const awarded = [];
  for (const criterion of criteria) {
    const reward = get('SELECT * FROM rewards WHERE json_extract(criteria, \'$.type\') = ?', criterion.type);
    if (!reward) continue;
    const r = run('INSERT OR IGNORE INTO student_rewards(student_id,reward_id,game_id) VALUES (?,?,?)', studentId, reward.id, gameId);
    if (r.changes) awarded.push({ id: reward.id, name: reward.name, icon: reward.icon, description: reward.description, points: reward.points });
  }
  return awarded;
}

route('POST', '/api/attempts/:id/submit', 'student', ({ params, body, user, req }) => {
  const student = studentFor(user.id);
  const attempt = get('SELECT * FROM attempts WHERE id=?', params.id);
  if (!attempt || attempt.student_id !== student.id) fail(404, 'Attempt not found.');
  if (attempt.status !== 'in_progress') return ok({ alreadySubmitted: true, attempt_id: attempt.id });

  const game = hydrateGame(get('SELECT * FROM games WHERE id=?', attempt.game_id));
  if (!game) fail(404, 'Game no longer exists.');
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const seen = new Set();
  const pointsFor = (q) => {
    const value = Number(q.points ?? game.points_per_question ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  };
  const maxPoints = game.questions.reduce((sum, q) => sum + pointsFor(q), 0);
  let earned = 0, correctCount = 0;
  const graded = [];

  for (const rec of answers) {
    const q = game.questions.find((x) => String(x.id) === String(rec.questionId));
    if (!q || seen.has(String(rec.questionId))) continue;
    seen.add(String(rec.questionId));
    const mp = pointsFor(q);
    let isCorrect = Boolean(rec.correct);
    const correctChoice = q.choices.find((c) => c.is_correct);
    if (correctChoice && rec.response !== undefined && rec.response !== null && rec.response !== '') {
      const response = String(rec.response);
      const matchesId = /^\d+$/.test(response) && q.choices.some((c) => String(c.id) === response && c.is_correct);
      const matchesText = norm(response) === norm(correctChoice.text);
      if (matchesId || matchesText) isCorrect = true;
      else if (q.choices.some((c) => norm(c.text) === norm(response) || String(c.id) === response)) isCorrect = false;
    }
    if (isCorrect) { earned += mp; correctCount++; }
    graded.push({ questionId: q.id, correct: isCorrect, response: rec.response ?? null, points: isCorrect ? mp : 0, maxPoints: mp, explanation: q.explanation || rec.explanation || '' });
  }

  for (const q of game.questions) {
    if (seen.has(String(q.id))) continue;
    graded.push({ questionId: q.id, correct: false, response: null, points: 0, maxPoints: pointsFor(q), explanation: q.explanation || '' });
  }
  graded.sort((a, b) => game.questions.findIndex((q) => String(q.id) === String(a.questionId)) - game.questions.findIndex((q) => String(q.id) === String(b.questionId)));

  const percentage = maxPoints ? Math.round((earned / maxPoints) * 1000) / 10 : 0;
  const stars = percentage >= 95 ? 3 : percentage >= 75 ? 2 : percentage >= 50 ? 1 : 0;
  const passed = percentage >= 75 ? 1 : 0;
  const timeSpent = Math.max(0, Number(body.time_spent ?? body.timeSpent ?? attempt.time_spent ?? 0));
  const previous = all('SELECT id FROM attempts WHERE game_id=? AND student_id=? AND id<>?', game.id, student.id, attempt.id).length + 1;
  const showFeedback = attempt.assignment_id ? get('SELECT show_feedback FROM assignments WHERE id=?', attempt.assignment_id)?.show_feedback : game.show_feedback;

  transaction(() => {
    run(`UPDATE attempts SET status='completed', completed_at=CURRENT_TIMESTAMP, time_spent=?, answers=?, details=? WHERE id=?`,
      timeSpent, JSON.stringify(graded), JSON.stringify(body.details || []), attempt.id);
    run(`INSERT OR REPLACE INTO scores(attempt_id,student_id,game_id,points,max_points,percentage,stars,passed)
         VALUES (?,?,?,?,?,?,?,?)`, attempt.id, student.id, game.id, earned, maxPoints, percentage, stars, passed);

    const existing = get('SELECT * FROM student_progress WHERE student_id=? AND subject_id IS ? AND game_id IS ?',
      student.id, game.subject_id ?? null, game.id);
    if (existing) {
      const attempts = existing.attempts + 1;
      run(`UPDATE student_progress SET attempts=?,completed=completed+1,total_points=total_points+?,
           best_percentage=MAX(best_percentage,?),average_percentage=(average_percentage*?+?)/?,
           last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        attempts, earned, percentage, existing.attempts, percentage, attempts, existing.id);
    } else {
      run(`INSERT INTO student_progress(student_id,subject_id,game_id,attempts,completed,total_points,best_percentage,average_percentage)
           VALUES (?,?,?,1,1,?,?,?)`, student.id, game.subject_id ?? null, game.id, earned, percentage, percentage);
    }
  });

  const awarded = awardRewards(student.id, game.id, { percentage, timeSpent, timeLimit: game.time_limit, attemptNumber: previous });
  const world = awardGameWorld(student.id, { ...attempt, percentage }, game, stars, correctCount, passed, req, user);
  logActivity({ id: user.id }, 'complete_attempt', 'attempt', attempt.id, { game: game.title, percentage }, req);
  return ok({
    attempt_id: attempt.id,
    world,
    correct: correctCount,
    total: graded.length,
    points: earned,
    max_points: maxPoints,
    percentage, stars, passed,
    rewards: awarded,
    show_feedback: showFeedback !== 0,
    graded,
    explanation: game.description || ''
  });
});

// ── Game World progress & rewards ──────────────────────────────────────────
function gameWorldState(studentId) {
  let row = get('SELECT * FROM game_world_progress WHERE student_id=?', studentId);
  if (!row) {
    run('INSERT INTO game_world_progress(student_id) VALUES (?)', studentId);
    row = get('SELECT * FROM game_world_progress WHERE student_id=?', studentId);
  }
  return {
    stars: row.stars,
    coins: row.coins,
    xp: row.xp,
    level: row.level,
    completed: row.completed,
    badges: jsonParse(row.badges, []),
    level_stats: jsonParse(row.level_stats, {}),
    last_game_id: row.last_game_id,
    music_on: Boolean(row.music_on),
    updated_at: row.updated_at
  };
}

function awardWorldDirect({ studentId, storyId, kind, stars = 0, user = null, req = null }) {
  const existing = get('SELECT 1 FROM world_story_awards WHERE student_id=? AND story_id=? AND kind=?', studentId, storyId, kind);
  const state = gameWorldState(studentId);
  if (existing) return { state, awarded: false };
  const coins = stars * 10;
  run('INSERT INTO world_story_awards(student_id,story_id,kind,stars,coins) VALUES (?,?,?,?,?)', studentId, storyId, kind, stars, coins);
  const stats = { ...(state.level_stats || {}) };
  const key = `story:${storyId}`;
  const previous = stats[key] || {};
  stats[key] = {
    ...previous,
    completed: true,
    stars: Math.max(Number(previous.stars || 0), stars)
  };
  const xp = state.xp + stars * 20;
  const level = 1 + Math.floor(xp / 150);
  const badges = new Set(state.badges || []);
  if (kind === 'read') badges.add('📖');
  if (kind === 'quiz') badges.add('🧩');
  if (stars >= 3) badges.add('🌟');
  run(`UPDATE game_world_progress SET stars=stars+?,coins=coins+?,xp=?,level=?,badges=?,level_stats=?,updated_at=CURRENT_TIMESTAMP WHERE student_id=?`,
    stars, coins, xp, level, JSON.stringify([...badges]), JSON.stringify(stats), studentId);
  if (user) logActivity({ id: user.id }, 'world_story_award', 'story', storyId, { kind, stars }, req);
  return { state: gameWorldState(studentId), awarded: true };
}

function awardGameWorld(studentId, attempt, game, stars, correctCount, passed, req, user) {
  if (get('SELECT 1 FROM game_world_awards WHERE attempt_id=?', attempt.id)) return gameWorldState(studentId);
  const newAwardId = run(`INSERT INTO game_world_awards(attempt_id,student_id,stars,coins,badge)
                          VALUES (?,?,?,?,?)`, attempt.id, studentId, stars, stars * 10 + (passed ? 5 : 0),
    passed ? '🏅' : null).lastInsertRowid;
  const state = gameWorldState(studentId);
  const key = String(attempt.assignment_id || game.id);
  const stats = { ...(state.level_stats || {}) };
  const previous = stats[key] || {};
  stats[key] = {
    ...previous,
    completed: true,
    stars: Math.max(Number(previous.stars || 0), stars),
    best_percentage: Math.max(Number(previous.best_percentage || 0), Number(attempt.percentage || 0)),
    attempts: Number(previous.attempts || 0) + 1
  };
  const xp = state.xp + stars * 25 + correctCount * 2;
  const completed = state.completed + 1;
  const level = 1 + Math.floor(xp / 150);
  const badges = new Set(state.badges || []);
  if (completed >= 1) badges.add('🌱');
  if (completed >= 3) badges.add('🔥');
  if ((state.stars || 0) + stars >= 9) badges.add('🧠');
  if (level >= 3) badges.add('🏆');
  run(`UPDATE game_world_progress SET stars=stars+?,coins=coins+?,xp=?,level=?,completed=?,badges=?,level_stats=?,last_game_id=?,updated_at=CURRENT_TIMESTAMP WHERE student_id=?`,
    stars, stars * 10 + (passed ? 5 : 0), xp, level, completed,
    JSON.stringify([...badges]), JSON.stringify(stats), game.id, studentId);
  logActivity({ id: user.id }, 'game_world_award', 'attempt', attempt.id, { stars, level }, req);
  return { ...gameWorldState(studentId), award_id: Number(newAwardId) };
}

route('GET', '/api/game-world/state', 'student', ({ user }) => {
  const student = studentFor(user.id);
  if (!student) fail(404, 'Student profile not found.');
  return ok(gameWorldState(student.id));
});

route('POST', '/api/game-world/music', 'student', ({ user, body }) => {
  const student = studentFor(user.id);
  if (!student) fail(404, 'Student profile not found.');
  gameWorldState(student.id);
  run('UPDATE game_world_progress SET music_on=?,updated_at=CURRENT_TIMESTAMP WHERE student_id=?', body.on ? 1 : 0, student.id);
  return ok(gameWorldState(student.id));
});

// ── Interactive Read Aloud support ────────────────────────────────────────
route('GET', '/api/words/:word', 'any', ({ params, query, user }) => {
  const saved = [];
  let example = '';
  if (query.storyId) {
    const story = storyAccess(query.storyId, user);
    saved.push(...all('SELECT * FROM story_vocabulary WHERE story_id=?', story.id));
    const needle = String(params.word || '').toLowerCase();
    const page = all('SELECT text FROM story_pages WHERE story_id=?', story.id)
      .find((row) => String(row.text || '').toLowerCase().includes(needle));
    if (page) {
      const text = String(page.text || '');
      const at = text.toLowerCase().indexOf(needle);
      example = text.slice(Math.max(0, at - 70), at + needle.length + 110).trim();
    }
  }
  const result = lookupDefinition(params.word, saved, example);
  if (!result) fail(404, 'No saved meaning found for that word.');
  return ok(result);
});

route('GET', '/api/student/reading-stats', 'student', ({ user }) => {
  const student = studentFor(user.id);
  if (!student) fail(404, 'Student profile not found.');
  const sessions = get(`SELECT COUNT(*) c, COALESCE(SUM(time_spent),0) seconds,
                               COALESCE(SUM(words_read),0) words
                        FROM story_reading_sessions WHERE student_id=?`, student.id);
  const quiz = get(`SELECT COUNT(*) c, COALESCE(SUM(correct),0) correct,
                           COALESCE(SUM(total),0) total, COALESCE(MAX(percentage),0) best
                    FROM story_quiz_attempts WHERE student_id=?`, student.id);
  const recordings = get('SELECT COUNT(*) c FROM story_reading_recordings WHERE student_id=?', student.id);
  const vocabulary = get(`SELECT COUNT(DISTINCT v.id) c FROM story_vocabulary v
                          JOIN story_reading_sessions sr ON sr.story_id=v.story_id
                          WHERE sr.student_id=?`, student.id);
  const history = all(`SELECT s.title, sr.mode, sr.time_spent, sr.words_read, sr.completed, sr.created_at
                       FROM story_reading_sessions sr JOIN stories s ON s.id=sr.story_id
                       WHERE sr.student_id=? ORDER BY sr.created_at DESC LIMIT 20`, student.id);
  const awards = all('SELECT story_id,kind,stars,coins,created_at FROM world_story_awards WHERE student_id=? ORDER BY created_at DESC', student.id);
  return ok({ sessions, quiz, recordings, vocabulary, history, awards, world: gameWorldState(student.id) });
});

route('POST', '/api/stories/:id/comprehension/submit', 'student', ({ params, body, user, req }) => {
  const student = studentFor(user.id);
  const story = storyAccess(params.id, user);
  if (!storyAssignmentAllowed(story.id, user)) fail(403, 'This story has not been shared with your class.');
  const questions = all('SELECT * FROM story_comprehension WHERE story_id=? ORDER BY sort_order,id', story.id)
    .map((item) => ({ ...item, choices: jsonParse(item.choices, []) }));
  if (!questions.length) fail(422, 'This story has no quiz questions yet.');
  const answers = Array.isArray(body.answers) ? body.answers : [];
  let correct = 0;
  const graded = questions.map((q) => {
    const rec = answers.find((a) => String(a.questionId) === String(q.id)) || {};
    const response = rec.response ?? rec.choiceId ?? '';
    const choice = q.choices.find((c) => String(c.id) === String(response));
    const answer = String(q.answer ?? '');
    const isCorrect = Boolean(answer) && (
      norm(choice?.text || response) === norm(answer)
      || String(choice?.id ?? '') === answer
      || String(response) === answer
    );
    if (isCorrect) correct += 1;
    return { questionId: q.id, correct: isCorrect, response: String(response || ''), explanation: q.explanation || q.source_quote || '' };
  });
  const percentage = Math.round(correct / questions.length * 1000) / 10;
  const stars = percentage >= 90 ? 3 : percentage >= 70 ? 2 : percentage >= 40 ? 1 : 0;
  run(`INSERT INTO story_quiz_attempts(story_id,student_id,answers,correct,total,percentage,stars)
       VALUES (?,?,?,?,?,?,?)`, story.id, student.id, JSON.stringify(graded), correct, questions.length, percentage, stars);
  const award = stars ? awardWorldDirect({ studentId: student.id, storyId: story.id, kind: 'quiz', stars, user, req }) : null;
  logActivity({ id: user.id }, 'story_quiz', 'story', story.id, { percentage, stars }, req);
  return ok({ correct, total: questions.length, percentage, stars, graded, award: award?.awarded ? award.state : null });
});

route('POST', '/api/stories/:id/recordings', 'student', async ({ params, body, user, req }) => {
  const student = studentFor(user.id);
  const story = storyAccess(params.id, user);
  if (!storyAssignmentAllowed(story.id, user)) fail(403, 'This story has not been shared with your class.');
  requireFields(body, ['dataUrl']);
  const pageNumber = Math.max(1, Number(body.pageNumber) || 1);
  const page = get('SELECT text FROM story_pages WHERE story_id=? AND page_number=?', story.id, pageNumber);
  const transcript = String(body.transcript || '');
  const target = String(page?.text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const spoken = transcript.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const hits = spoken.filter((word) => target.includes(word)).length;
  const score = target.length ? Math.min(100, Math.round(hits / target.length * 100)) : 0;
  const url = await saveDataUrl(body.dataUrl, 'audio');
  run(`INSERT INTO story_reading_recordings(story_id,student_id,page_number,file_url,duration,transcript,score)
       VALUES (?,?,?,?,?,?,?)`, story.id, student.id, pageNumber, url,
    Math.max(0, Number(body.duration) || 0), transcript.slice(0, 4000), score);
  const stars = score >= 80 ? 3 : score >= 50 ? 2 : score >= 20 ? 1 : 0;
  const award = stars ? awardWorldDirect({ studentId: student.id, storyId: story.id, kind: 'practice', stars, user, req }) : null;
  logActivity({ id: user.id }, 'story_recording', 'story', story.id, { score, pageNumber }, req);
  return ok({ score, stars, url, award: award?.awarded ? award.state : null });
});

// ───────────────────────────── Reading & narration ────────────────────────

route('GET', '/api/reading/lessons', 'any', ({ user }) => {
  if (user.role_name === 'teacher') {
    return ok(all(`SELECT l.*, s.name subject_name,
                   (SELECT COUNT(*) FROM lesson_pages p WHERE p.lesson_id=l.id) page_count,
                   (SELECT COUNT(*) FROM lesson_vocabulary v WHERE v.lesson_id=l.id) vocabulary_count
                   FROM lessons l LEFT JOIN subjects s ON s.id=l.subject_id
                   WHERE l.teacher_id=? ORDER BY l.updated_at DESC`, user.id));
  }
  const student = studentFor(user.id);
  return ok(all(`SELECT l.id,l.title,l.description,l.objectives,l.grade_level,l.subject_id,
                        s.name subject_name, cc.title competency_title,
                        (SELECT COUNT(*) FROM lesson_pages p WHERE p.lesson_id=l.id) page_count,
                        (SELECT COUNT(*) FROM reading_sessions rs WHERE rs.lesson_id=l.id AND rs.student_id=?) sessions
                 FROM lessons l LEFT JOIN subjects s ON s.id=l.subject_id
                 LEFT JOIN curriculum_competencies cc ON cc.id=l.competency_id
                 WHERE l.status='published' ORDER BY l.updated_at DESC`, student?.id ?? -1));
});

route('GET', '/api/reading/lessons/:id', 'any', ({ params, user }) => {
  const lesson = lessonAccess(params.id, user);
  const pages = all('SELECT * FROM lesson_pages WHERE lesson_id=? ORDER BY sort_order,id', lesson.id);
  const fallbackText = [lesson.description, lesson.objectives].filter(Boolean).join('\n\n')
    || 'Your teacher has not added reading content to this lesson yet.';
  const effectivePages = pages.length
    ? pages
    : [{ id: null, lesson_id: lesson.id, sort_order: 0, title: lesson.title, text: fallbackText, media_url: null, audio_url: null }];
  const vocabulary = all('SELECT * FROM lesson_vocabulary WHERE lesson_id=? ORDER BY sort_order,id', lesson.id);
  const student = studentFor(user.id);
  const games = all(`SELECT g.id,g.title,g.type FROM games g WHERE g.lesson_id=? AND g.status='published' ORDER BY g.id`, lesson.id);
  let progress = null;
  let recordings = [];
  if (student) {
    progress = get('SELECT * FROM reading_sessions WHERE lesson_id=? AND student_id=? ORDER BY id DESC LIMIT 1', lesson.id, student.id);
    recordings = all(`SELECT r.*, l.title lesson_title FROM reading_recordings r JOIN lessons l ON l.id=r.lesson_id
                      WHERE r.lesson_id=? AND r.student_id=? ORDER BY r.id DESC`, lesson.id, student.id);
  } else if (user.role_name === 'teacher') {
    recordings = all(`SELECT r.*, u.full_name student_name, l.title lesson_title FROM reading_recordings r
                      JOIN lessons l ON l.id=r.lesson_id JOIN students st ON st.id=r.student_id
                      JOIN users u ON u.id=st.user_id WHERE l.teacher_id=? ORDER BY r.id DESC LIMIT 100`, user.id);
  }
  return ok({
    lesson: {
      id: lesson.id, title: lesson.title, description: lesson.description, objectives: lesson.objectives,
      grade_level: lesson.grade_level, subject_name: get('SELECT name FROM subjects WHERE id=?', lesson.subject_id)?.name || null,
      competency_title: get('SELECT title FROM curriculum_competencies WHERE id=?', lesson.competency_id)?.title || null,
      status: lesson.status, source_file: lesson.source_file
    },
    pages: effectivePages,
    vocabulary,
    games,
    progress,
    recordings
  });
});

route('POST', '/api/reading/lessons/:id/sessions', 'student', ({ params, body, user }) => {
  const lesson = lessonAccess(params.id, user);
  if (lesson.status !== 'published') fail(404, 'Lesson not found.');
  const student = studentFor(user.id);
  const r = run(`INSERT INTO reading_sessions(lesson_id,student_id,mode,time_spent,pages_read,words_read,completed)
                 VALUES (?,?,?,?,?,?,?)`,
    lesson.id, student.id,
    ['listen', 'along', 'read_along', 'independent', 'practice'].includes(body.mode) ? body.mode : 'listen',
    Math.max(0, Number(body.time_spent) || 0), Math.max(0, Number(body.pages_read) || 0),
    Math.max(0, Number(body.words_read) || 0), body.completed ? 1 : 0);
  return created(get('SELECT * FROM reading_sessions WHERE id=?', Number(r.lastInsertRowid)));
});

route('POST', '/api/reading/lessons/:id/recordings', 'student', async ({ params, body, user }) => {
  const lesson = lessonAccess(params.id, user);
  if (lesson.status !== 'published') fail(404, 'Lesson not found.');
  const student = studentFor(user.id);
  const fileUrl = await saveDataUrl(body.dataUrl, 'audio');
  const r = run(`INSERT INTO reading_recordings(lesson_id,student_id,page_id,file_url,duration)
                 VALUES (?,?,?,?,?)`,
    lesson.id, student.id, body.page_id || null, fileUrl, Math.max(0, Number(body.duration) || 0));
  return created(get('SELECT * FROM reading_recordings WHERE id=?', Number(r.lastInsertRowid)));
});

route('POST', '/api/reading/recordings/:id/review', 'teacher', ({ params, body, user, req }) => {
  const recording = get(`SELECT r.*, l.teacher_id FROM reading_recordings r JOIN lessons l ON l.id=r.lesson_id WHERE r.id=?`, params.id);
  if (!recording) fail(404, 'Recording not found.');
  if (recording.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'Not your student recording.');
  const score = body.score === null || body.score === '' ? null : Math.max(0, Math.min(100, Number(body.score) || 0));
  run(`UPDATE reading_recordings SET score=?,feedback=?,status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,
    score, String(body.feedback || '').slice(0, 2000),
    ['submitted', 'reviewed', 'needs_practice'].includes(body.status) ? body.status : 'reviewed', user.id, params.id);
  logActivity(user, 'review_recording', 'recording', params.id, { score }, req);
  return ok(get('SELECT * FROM reading_recordings WHERE id=?', params.id));
});

route('POST', '/api/reading/lessons/:id/pages', 'teacher', ({ params, body, user }) => {
  const lesson = lessonAccess(params.id, user);
  requireFields(body, ['text']);
  const r = run('INSERT INTO lesson_pages(lesson_id,sort_order,title,text,media_url,audio_url) VALUES (?,?,?,?,?,?)',
    lesson.id, Number(body.sort_order ?? 0), String(body.title || '').slice(0, 200),
    String(body.text).slice(0, 12000), body.media_url || null, body.audio_url || null);
  return created(get('SELECT * FROM lesson_pages WHERE id=?', Number(r.lastInsertRowid)));
});

route('PUT', '/api/reading/pages/:id', 'teacher', ({ params, body, user }) => {
  const page = get('SELECT p.*, l.teacher_id FROM lesson_pages p JOIN lessons l ON l.id=p.lesson_id WHERE p.id=?', params.id);
  if (!page) fail(404, 'Page not found.');
  if (page.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'Not your lesson.');
  run('UPDATE lesson_pages SET title=?,text=?,sort_order=?,media_url=?,audio_url=? WHERE id=?',
    body.title ?? page.title, body.text ?? page.text, Number(body.sort_order ?? page.sort_order),
    body.media_url ?? page.media_url, body.audio_url ?? page.audio_url, params.id);
  return ok(get('SELECT * FROM lesson_pages WHERE id=?', params.id));
});

route('DELETE', '/api/reading/pages/:id', 'teacher', ({ params, user }) => {
  const page = get('SELECT p.*, l.teacher_id FROM lesson_pages p JOIN lessons l ON l.id=p.lesson_id WHERE p.id=?', params.id);
  if (!page) fail(404, 'Page not found.');
  if (page.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'Not your lesson.');
  run('DELETE FROM lesson_pages WHERE id=?', params.id);
  return ok({ deleted: true });
});

route('POST', '/api/reading/lessons/:id/vocabulary', 'teacher', ({ params, body, user }) => {
  const lesson = lessonAccess(params.id, user);
  requireFields(body, ['term']);
  const r = run('INSERT INTO lesson_vocabulary(lesson_id,term,definition,media_url,audio_url,sort_order) VALUES (?,?,?,?,?,?)',
    lesson.id, String(body.term).trim(), String(body.definition || '').slice(0, 1000),
    body.media_url || null, body.audio_url || null, Number(body.sort_order ?? 0));
  return created(get('SELECT * FROM lesson_vocabulary WHERE id=?', Number(r.lastInsertRowid)));
});

route('DELETE', '/api/reading/vocabulary/:id', 'teacher', ({ params, user }) => {
  const item = get('SELECT v.*, l.teacher_id FROM lesson_vocabulary v JOIN lessons l ON l.id=v.lesson_id WHERE v.id=?', params.id);
  if (!item) fail(404, 'Vocabulary item not found.');
  if (item.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'Not your lesson.');
  run('DELETE FROM lesson_vocabulary WHERE id=?', params.id);
  return ok({ deleted: true });
});

route('POST', '/api/reading/lessons/:id/import', 'teacher', ({ params, body, user, req }) => {
  const lesson = lessonAccess(params.id, user);
  requireFields(body, ['text']);
  const source = String(body.text).replace(/\r\n?/g, '\n').trim();
  const chunks = source.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  const pages = [];
  if (chunks.length > 1) {
    chunks.forEach((chunk) => pages.push(chunk));
  } else {
    const sentences = source.split(/(?<=[.!?])\s+/);
    let buffer = '';
    for (const sentence of sentences) {
      if ((buffer + ' ' + sentence).length > 800 && buffer) { pages.push(buffer.trim()); buffer = sentence; }
      else buffer = (buffer ? buffer + ' ' : '') + sentence;
    }
    if (buffer.trim()) pages.push(buffer.trim());
  }
  transaction(() => {
    if (body.mode !== 'append') run('DELETE FROM lesson_pages WHERE lesson_id=?', lesson.id);
    pages.forEach((text, i) => {
      run('INSERT INTO lesson_pages(lesson_id,sort_order,title,text) VALUES (?,?,?,?)',
        lesson.id, Number(body.start_order ?? 0) + i, `Page ${i + 1}`, text.slice(0, 12000));
    });
    run('UPDATE lessons SET extracted_text=?,source_file=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      source.slice(0, 60000), body.source_file || null, lesson.id);
  });
  logActivity(user, 'import_lesson_content', 'lesson', lesson.id, { pages: pages.length, source: body.source_file || 'pasted text' }, req);
  return ok({ imported: pages.length, pages: all('SELECT * FROM lesson_pages WHERE lesson_id=? ORDER BY sort_order,id', lesson.id) });
});

route('POST', '/api/reading/extract', 'teacher', ({ body }) => {
  requireFields(body, ['dataUrl']);
  const result = extractText(body.name || 'lesson.txt', body.dataUrl);
  return ok({ ...result, suggestion: result.scanned
    ? 'No selectable text was found. This may be a scanned PDF; paste the text instead.'
    : 'Review the extracted text, then import it into a lesson as reading pages.' });
});

// ───────────────────────────── Administration ─────────────────────────────

const adminUserView = (row) => ({
  id: row.id, username: row.username, email: row.email, full_name: row.full_name,
  role: row.role_name, active: Boolean(row.active), approved: Boolean(row.approved),
  status: !row.active ? 'inactive' : !row.approved ? 'pending' : 'active',
  avatar_color: row.avatar_color, last_login_at: row.last_login_at, created_at: row.created_at,
  student_id: get('SELECT id FROM students WHERE user_id=?', row.id)?.id || null
});

route('GET', '/api/admin/overview', 'any', ({ user }) => {
  requireAdmin(user);
  return ok({
    stats: {
      total_users: get('SELECT COUNT(*) c FROM users').c,
      teachers: get("SELECT COUNT(*) c FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='teacher'").c,
      students: get("SELECT COUNT(*) c FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='student'").c,
      pending_approvals: get("SELECT COUNT(*) c FROM users WHERE role_id=(SELECT id FROM roles WHERE name='teacher') AND approved=0").c,
      active_today: get("SELECT COUNT(*) c FROM users WHERE date(last_login_at)=date('now')").c,
      logs: get('SELECT COUNT(*) c FROM activity_logs').c
    },
    recentUsers: all(`SELECT u.*, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.created_at DESC, u.id DESC LIMIT 8`).map(adminUserView),
    recentLogs: all('SELECT l.*, u.full_name user_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 8'),
    byRole: all('SELECT r.name role, COUNT(u.id) count FROM roles r LEFT JOIN users u ON u.role_id=r.id GROUP BY r.id')
  });
});

route('GET', '/api/admin/users', 'any', ({ user, query }) => {
  requireAdmin(user);
  const args = [];
  let sql = `SELECT u.*, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id WHERE 1=1`;
  if (query.role) { sql += ' AND r.name=?'; args.push(query.role); }
  if (query.status === 'pending') { sql += ' AND u.approved=0'; }
  else if (query.status === 'active') { sql += ' AND u.active=1 AND u.approved=1'; }
  else if (query.status === 'inactive') { sql += ' AND u.active=0'; }
  if (query.search) { sql += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)'; args.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`); }
  return ok(all(sql + ' ORDER BY u.id DESC', ...args).map(adminUserView));
});

route('GET', '/api/admin/approvals', 'any', ({ user }) => {
  requireAdmin(user);
  return ok(all(`SELECT u.*, r.name role_name FROM users u JOIN roles r ON r.id=u.role_id
                 WHERE u.approved=0 ORDER BY u.created_at DESC`).map(adminUserView));
});

route('PUT', '/api/admin/users/:id', 'any', ({ params, body, user, req }) => {
  requireAdmin(user);
  const target = getUser(params.id);
  if (!target) fail(404, 'User not found.');
  if (Number(params.id) === user.id && body.active === false) fail(400, 'You cannot deactivate your own account.');
  const roleId = body.role ? get('SELECT id FROM roles WHERE name=?', body.role)?.id : target.role_id;
  if (body.role && !roleId) fail(400, 'Unknown role.');
  if (body.email && get('SELECT id FROM users WHERE email=? AND id<>?', body.email, params.id)) fail(409, 'That email is already in use.');
  run(`UPDATE users SET full_name=?,email=?,role_id=?,active=?,approved=? WHERE id=?`,
    body.full_name || target.full_name, body.email || target.email, roleId,
    body.active === undefined || body.active === null ? target.active : (body.active ? 1 : 0),
    body.approved === undefined || body.approved === null ? target.approved : (body.approved ? 1 : 0),
    params.id);
  logActivity(user, 'update_user', 'user', params.id, { role: body.role, active: body.active, approved: body.approved }, req);
  return ok(adminUserView(getUser(params.id)));
});

route('POST', '/api/admin/users/:id/reset-password', 'any', ({ params, body, user, req }) => {
  requireAdmin(user);
  const target = getUser(params.id);
  if (!target) fail(404, 'User not found.');
  requireFields(body, ['password']);
  if (String(body.password).length < 6) fail(400, 'Password must be at least 6 characters.');
  run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(body.password), params.id);
  logActivity(user, 'reset_password', 'user', params.id, {}, req);
  return ok({ ok: true, message: `Password updated for ${target.full_name}.` });
});

route('POST', '/api/admin/users/:id/approve', 'any', ({ params, user, req }) => {
  requireAdmin(user);
  const target = getUser(params.id);
  if (!target) fail(404, 'User not found.');
  run('UPDATE users SET approved=1,active=1 WHERE id=?', params.id);
  logActivity(user, 'approve_user', 'user', params.id, { approved_role: target.role_name }, req);
  return ok({ ok: true, message: `${target.full_name} can now sign in.` });
});

route('POST', '/api/admin/users/:id/reject', 'any', ({ params, user, req }) => {
  requireAdmin(user);
  if (Number(params.id) === user.id) fail(400, 'You cannot reject your own account.');
  const target = getUser(params.id);
  if (!target) fail(404, 'User not found.');
  run('UPDATE users SET approved=0,active=0 WHERE id=?', params.id);
  logActivity(user, 'reject_user', 'user', params.id, {}, req);
  return ok({ ok: true, message: `${target.full_name} was rejected and deactivated.` });
});

route('GET', '/api/admin/logs', 'any', ({ user, query }) => {
  requireAdmin(user);
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
  return ok(all(`SELECT l.*, u.full_name user_name FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id
                 ORDER BY l.id DESC LIMIT ?`, limit).map((r) => ({ ...r, details: jsonParse(r.details, r.details) })));
});

route('GET', '/api/admin/settings', 'any', ({ user }) => {
  requireAdmin(user);
  return ok(all('SELECT * FROM system_settings ORDER BY key'));
});

route('PUT', '/api/admin/settings', 'any', ({ user, body, req }) => {
  requireAdmin(user);
  if (!Array.isArray(body.settings)) fail(400, 'settings must be an array.');
  transaction(() => {
    for (const item of body.settings) {
      if (!item?.key) continue;
      const value = typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? '');
      run(`INSERT INTO system_settings(key,value,description,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        String(item.key).slice(0, 100), value.slice(0, 4000), item.description || null);
    }
  });
  logActivity(user, 'update_settings', 'settings', null, { keys: body.settings.map((s) => s.key) }, req);
  return ok({ ok: true });
});

// ───────────────────────────── Advanced analytics & PDF ───────────────────

route('GET', '/api/analytics/overview', 'teacher', ({ user, query }) => ok(analyticsOverview(user.id, query)));

route('GET', '/api/analytics/export', 'teacher', ({ user, query, res }) => {
  const report = query.report || 'analytics';
  const title = report === 'scores' ? 'Assessment Results'
    : report === 'students' ? 'Student Progress'
      : report === 'games' ? 'Game Inventory' : 'Learning Analytics';
  const school = settingValue('school_name', 'EduPlay');
  const subtitle = `${school} • Prepared ${new Date().toLocaleDateString()} • ${user.full_name}`;
  let blocks;

  if (report === 'analytics') {
    blocks = analyticsPdfBlocks(analyticsOverview(user.id, query), user.full_name);
  } else if (report === 'scores') {
    const rows = all(`SELECT u.full_name student_name, COALESCE(c.name,'—') class_name, g.title game_title,
                      sc.points, sc.max_points, sc.percentage, sc.stars, sc.recorded_at
                      FROM scores sc JOIN attempts at ON at.id=sc.attempt_id
                      LEFT JOIN assignments a ON a.id=at.assignment_id LEFT JOIN classes c ON c.id=a.class_id
                      JOIN students st ON st.id=sc.student_id JOIN users u ON u.id=st.user_id
                      JOIN games g ON g.id=sc.game_id WHERE g.teacher_id=? ORDER BY sc.recorded_at DESC LIMIT 300`, user.id);
    blocks = [
      { type: 'heading', text: 'Assessment results' },
      { type: 'table', columns: ['Student', 'Class', 'Game', 'Points', '%', 'Stars'], rows: rows.map((r) => [r.student_name, r.class_name, r.game_title, `${r.points}/${r.max_points}`, r.percentage, r.stars]) }
    ];
  } else if (report === 'students') {
    const rows = all(`SELECT u.full_name student_name, st.grade_level, st.section,
                      (SELECT COUNT(*) FROM scores sc WHERE sc.student_id=st.id) completed,
                      (SELECT COALESCE(ROUND(AVG(percentage),1),0) FROM scores sc WHERE sc.student_id=st.id) avg,
                      (SELECT COALESCE(SUM(points),0) FROM scores sc WHERE sc.student_id=st.id) points
                      FROM students st JOIN users u ON u.id=st.user_id ORDER BY u.full_name LIMIT 300`);
    blocks = [
      { type: 'heading', text: 'Student progress' },
      { type: 'table', columns: ['Student', 'Grade', 'Section', 'Games', 'Avg %', 'Points'], rows: rows.map((r) => [r.student_name, r.grade_level || '-', r.section || '-', r.completed, r.avg, r.points]) }
    ];
  } else {
    const rows = all(`SELECT g.title, g.type, g.difficulty, g.status,
                      (SELECT COUNT(*) FROM game_questions q WHERE q.game_id=g.id) questions,
                      (SELECT COUNT(*) FROM attempts at WHERE at.game_id=g.id) attempts
                      FROM games g WHERE g.teacher_id=? ORDER BY g.id DESC LIMIT 300`, user.id);
    blocks = [
      { type: 'heading', text: 'Game inventory' },
      { type: 'table', columns: ['Title', 'Type', 'Difficulty', 'Status', 'Questions', 'Attempts'], rows: rows.map((r) => Object.values(r)) }
    ];
  }

  const pdf = buildPdf({ title, subtitle, blocks, footer: `${settingValue('site_name', 'EduPlay')} • ${school}` });
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="eduplay-${report}.pdf"`,
    'Content-Length': pdf.length,
    'Cache-Control': 'no-store'
  });
  res.end(pdf);
});

// ───────────────────────────── Shared preferences ──────────────────────────

const DEFAULT_PREFERENCES = {
  narrationRate: 0.9,
  narrationVolume: 0.9,
  narrationLang: 'en-US',
  voiceURI: '',
  highlightStyle: 'word',
  highlightColor: '#fde68a',
  gameTheme: 'playful',
  animations: true,
  soundEffects: true,
  backgroundMusic: false,
  effectsVolume: 0.6,
  musicVolume: 0.3,
  masterMuted: false,
  fontSize: 'medium',
  highContrast: false,
  captions: true,
  defaultDifficulty: 'medium',
  defaultPoints: 10,
  defaultTimeLimit: 0,
  feedbackStyle: 'encouraging',
  character: 'owl',
  customSounds: {}
};

route('GET', '/api/preferences', 'any', ({ user }) => {
  const saved = jsonParse(get('SELECT preferences FROM teacher_preferences WHERE user_id=?', user.id)?.preferences, {});
  const next = { ...DEFAULT_PREFERENCES, ...(saved && typeof saved === 'object' ? saved : {}) };
  if (!next.customSounds || typeof next.customSounds !== 'object' || Array.isArray(next.customSounds)) next.customSounds = {};
  return ok(next);
});

route('PUT', '/api/preferences', 'any', ({ user, body }) => {
  const current = jsonParse(get('SELECT preferences FROM teacher_preferences WHERE user_id=?', user.id)?.preferences, {});
  const next = { ...DEFAULT_PREFERENCES, ...(current && typeof current === 'object' ? current : {}) };
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (body[key] !== undefined) next[key] = body[key];
  }
  if (!next.customSounds || typeof next.customSounds !== 'object' || Array.isArray(next.customSounds)) next.customSounds = {};
  run(`INSERT INTO teacher_preferences(user_id,preferences,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences, updated_at=CURRENT_TIMESTAMP`,
    user.id, JSON.stringify(next));
  return ok(next);
});

// ───────────────────── Teaching materials & presentations ──────────────────

route('GET', '/api/materials', 'teacher', ({ user, query }) => {
  const args = [user.id];
  let sql = 'SELECT * FROM teaching_materials WHERE teacher_id=?';
  if (query.status) { sql += ' AND status=?'; args.push(query.status); }
  if (query.kind) { sql += ' AND kind=?'; args.push(query.kind); }
  if (query.grade) { sql += ' AND grade_level=?'; args.push(query.grade); }
  if (query.subject) { sql += ' AND subject=?'; args.push(query.subject); }
  if (query.topic) { sql += ' AND topic=?'; args.push(query.topic); }
  if (query.language) { sql += ' AND language=?'; args.push(query.language); }
  if (query.reading_level) { sql += ' AND reading_level=?'; args.push(query.reading_level); }
  if (query.search) {
    sql += ' AND (title LIKE ? OR file_name LIKE ? OR description LIKE ? OR topic LIKE ?)';
    args.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
  }
  sql += ' ORDER BY updated_at DESC,id DESC';
  return ok(all(sql, ...args).map(materialView));
});

route('POST', '/api/materials', 'teacher', async ({ user, body, req }) => {
  requireFields(body, ['dataUrl']);
  const fileName = String(body.fileName || 'upload');
  const ext = allowedExtension(fileName, body.mime);
  const kind = ['presentation', 'document', 'text', 'image'].includes(body.kind)
    ? body.kind
    : (SUPPORTED_FILE_TYPES.find((item) => item.ext === ext)?.kind || 'document');
  let contentHash = '';
  try { contentHash = createHash('sha256').update(parseDataUrl(body.dataUrl).bytes).digest('hex'); }
  catch { /* saveUploadFile below will report the invalid data URL */ }
  if (contentHash) {
    const existing = get(`SELECT * FROM teaching_materials
      WHERE teacher_id=? AND file_hash=? AND format=? ORDER BY id DESC LIMIT 1`, user.id, contentHash, ext);
    if (existing) return ok({ ...materialDetail(existing, user), deduplicated: true });
  }
  const stored = await saveUploadFile(body.dataUrl, fileName, body.mime);
  const fileSize = body.file_size === undefined || body.file_size === null
    ? stored.bytes.length : Math.max(0, Number(body.file_size) || 0);
  const title = String(body.title || fileName.replace(/\.[^.]+$/, '')).trim().slice(0, 160) || 'Untitled material';
  const r = run(`INSERT INTO teaching_materials(teacher_id,class_id,title,kind,format,file_name,file_url,mime_type,status,preferences,
                 description,grade_level,subject,topic,language,reading_level,quarter,objectives,file_size,file_hash)
                 VALUES (?,?,?,?,?,?,?,?,'uploading',?,?,?,?,?,?,?,?,?,?,?)`,
    user.id, body.class_id || null, title, kind, ext, fileName.slice(0, 255), stored.url, stored.mime,
    JSON.stringify(DEFAULT_PREFERENCES),
    String(body.description || '').slice(0, 4000),
    body.grade_level || null, body.subject || null, body.topic || null,
    String(body.language || 'English').slice(0, 40), body.reading_level || null, body.quarter || null,
    objectivesJson(body.objectives), fileSize, stored.hash || contentHash || null);
  const materialId = Number(r.lastInsertRowid);
  logActivity(user, 'upload_material', 'material', materialId, { fileName, format: ext, size: stored.bytes.length }, req);
  let material = get('SELECT * FROM teaching_materials WHERE id=?', materialId);
  try {
    await processMaterial(material, { fileName, dataUrl: body.dataUrl, mime: stored.mime });
    logContentImport(user, material, 'ready', `Imported ${fileName}.`);
  } catch (error) {
    material = get('SELECT * FROM teaching_materials WHERE id=?', materialId);
    logContentImport(user, material, 'failed', String(error?.message || 'Processing failed.'));
    return ok({ ...materialDetail(material, user), error: error.message });
  }
  return created(materialDetail(get('SELECT * FROM teaching_materials WHERE id=?', materialId), user));
});

route('GET', '/api/materials/:id', 'any', ({ params, user }) => ok(materialDetail(materialAccess(params.id, user), user)));

route('PUT', '/api/materials/:id', 'teacher', ({ params, body, user, req }) => {
  const material = materialAccess(params.id, user);
  run(`UPDATE teaching_materials SET title=?,class_id=?,kind=?,preferences=?,extracted_text=?,
     description=?,grade_level=?,subject=?,topic=?,language=?,reading_level=?,quarter=?,objectives=?,file_size=?,
     updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    body.title || material.title, body.class_id ?? material.class_id,
    ['presentation', 'document', 'text', 'image'].includes(body.kind) ? body.kind : material.kind,
    JSON.stringify({ ...jsonParse(material.preferences, {}), ...(body.preferences || {}) }),
    body.extracted_text !== undefined ? String(body.extracted_text).slice(0, 200000) : material.extracted_text,
    body.description !== undefined && body.description !== null ? String(body.description).slice(0, 4000) : material.description,
    body.grade_level ?? material.grade_level, body.subject ?? material.subject, body.topic ?? material.topic,
    body.language !== undefined && body.language !== null ? String(body.language).slice(0, 40) : material.language,
    body.reading_level ?? material.reading_level, body.quarter ?? material.quarter,
    body.objectives !== undefined ? objectivesJson(body.objectives) : material.objectives,
    body.file_size === undefined || body.file_size === null
      ? material.file_size : Math.max(0, Number(body.file_size) || 0),
    material.id);
  logActivity(user, 'update_material', 'material', material.id, {}, req);
  return ok(materialDetail(get('SELECT * FROM teaching_materials WHERE id=?', material.id), user));
});

route('DELETE', '/api/materials/:id', 'teacher', ({ params, user, req }) => {
  const material = materialAccess(params.id, user);
  run('DELETE FROM teaching_materials WHERE id=?', material.id);
  logActivity(user, 'delete_material', 'material', material.id, { title: material.title }, req);
  return ok({ deleted: true });
});

route('POST', '/api/materials/:id/reprocess', 'teacher', async ({ params, user }) => {
  const material = materialAccess(params.id, user);
  const original = await readUploadDataUrl(material.file_url);
  try {
    await processMaterial(material, { fileName: material.file_name, dataUrl: original.dataUrl, mime: MATERIAL_MIME[original.ext] });
    logContentImport(user, material, 'ready', `Reprocessed ${material.file_name || 'material'}.`);
  } catch (error) {
    logContentImport(user, material, 'failed', String(error?.message || 'Processing failed.'));
    return ok({ ...materialDetail(get('SELECT * FROM teaching_materials WHERE id=?', material.id), user), error: error.message });
  }
  return ok(materialDetail(get('SELECT * FROM teaching_materials WHERE id=?', material.id), user));
});

route('PUT', '/api/materials/:id/slides/:slideId', 'teacher', ({ params, body, user }) => {
  const material = materialAccess(params.id, user);
  const slide = get('SELECT * FROM presentation_slides WHERE id=? AND material_id=?', params.slideId, material.id);
  if (!slide) fail(404, 'Slide not found.');
  const layout = body.layout !== undefined
    ? (typeof body.layout === 'object' ? body.layout : jsonParse(body.layout, jsonParse(slide.layout, {})))
    : jsonParse(slide.layout, {});
  run(`UPDATE presentation_slides SET title=?,text=?,notes=?,description=?,layout=?,narration_script=? WHERE id=?`,
    body.title ?? slide.title, body.text ?? slide.text, body.notes ?? slide.notes,
    body.description ?? slide.description, JSON.stringify(layout),
    body.narration_script ?? slide.narration_script, slide.id);
  run('UPDATE teaching_materials SET updated_at=CURRENT_TIMESTAMP WHERE id=?', material.id);
  const updated = get('SELECT * FROM presentation_slides WHERE id=?', slide.id);
  return ok({ ...updated, layout });
});

route('POST', '/api/materials/:id/assign', 'teacher', ({ params, body, user, req }) => {
  const material = materialAccess(params.id, user);
  if (!Array.isArray(body.class_ids)) fail(400, 'class_ids must be an array.');
  transaction(() => {
    run('DELETE FROM material_assignments WHERE material_id=?', material.id);
    for (const classId of body.class_ids) {
      if (!get('SELECT id FROM classes WHERE id=? AND teacher_id=?', classId, user.id)) fail(404, 'One of those classes was not found.');
      run('INSERT INTO material_assignments(teacher_id,material_id,class_id,due_at,instructions) VALUES (?,?,?,?,?)',
        user.id, material.id, classId, body.due_at || null, String(body.instructions || '').slice(0, 1000));
    }
  });
  logActivity(user, 'assign_material', 'material', material.id, { classes: body.class_ids }, req);
  return ok({ assigned: body.class_ids.length });
});

// ── Synchronized PowerPoint presentations ────────────────────────────────
const PRESENTATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newPresentationCode() {
  let code;
  do {
    code = [...randomBytes(6)].map((byte) => PRESENTATION_CODE_ALPHABET[byte % PRESENTATION_CODE_ALPHABET.length]).join('');
  } while (get('SELECT 1 FROM presentation_sessions WHERE code=?', code));
  return code;
}

function presentationElapsed(session) {
  const now = Date.now();
  const start = Number(session.segment_started_at) || now;
  const end = session.paused ? (Number(session.paused_at) || now) : now;
  return Math.max(0, Number(session.accumulated_ms || 0) + Math.max(0, end - start));
}

function presentationShape(session) {
  const material = get('SELECT * FROM teaching_materials WHERE id=?', session.material_id);
  const slides = all('SELECT slide_number,title,text,layout,transition FROM presentation_slides WHERE material_id=? ORDER BY slide_number,id', session.material_id);
  const layout = jsonParse(slides[0]?.layout || '{}', {});
  const width = Number(layout.width) || 960;
  const height = Number(layout.height) || 540;
  const count = all('SELECT id FROM presentation_slides WHERE material_id=?', session.material_id).length;
  return {
    id: session.id,
    code: session.code,
    status: session.status,
    paused: Boolean(session.paused),
    current_slide: Math.min(count - 1, Math.max(0, Number(session.current_slide) || 0)),
    slide_count: count,
    elapsed_ms: presentationElapsed(session),
    started_at: session.started_at,
    ended_at: session.ended_at,
    updated_at: session.updated_at,
    material_id: session.material_id,
    teacher_id: session.teacher_id,
    title: material?.title || 'Presentation',
    file_name: material?.file_name || '',
    presentation_url: material?.presentation_url || material?.file_url || '',
    aspect: width / height,
    transitions: slides.map((slide) => jsonParse(slide.transition || '{}', null)),
    slide_titles: slides.map((slide, index) => slide.title || `Slide ${index + 1}`),
    slide_texts: slides.map((slide) => String(slide.text || ''))
  };
}

function presentationSession(code, user) {
  const session = get('SELECT * FROM presentation_sessions WHERE code=?', String(code || '').toUpperCase());
  if (!session) fail(404, 'Presentation session not found.');
  const material = materialAccess(session.material_id, user);
  if (user.role_name === 'teacher' && session.teacher_id !== user.id && user.role_name !== 'admin') {
    fail(403, 'This presentation belongs to another teacher.');
  }
  if (user.role_name !== 'teacher' && user.role_name !== 'student' && user.role_name !== 'admin') {
    fail(403, 'You do not have access to this presentation.');
  }
  return { session, material };
}

function presentationFull(session, user) {
  return {
    ...presentationShape(session),
    material: materialDetail(get('SELECT * FROM teaching_materials WHERE id=?', session.material_id), user)
  };
}

route('POST', '/api/materials/:id/presentations', 'teacher', ({ params, body, user, req }) => {
  const material = materialAccess(params.id, user);
  if (material.kind !== 'presentation' || !['pptx', 'ppt'].includes(material.format)) {
    fail(400, 'Presenter View needs an uploaded PowerPoint presentation.');
  }
  const slideCount = get('SELECT COUNT(*) c FROM presentation_slides WHERE material_id=?', material.id).c;
  if (!slideCount) fail(422, 'This presentation has no slides to present yet.');
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  for (const stale of all("SELECT * FROM presentation_sessions WHERE teacher_id=? AND material_id=? AND status='active'", user.id, material.id)) {
    run(`UPDATE presentation_sessions SET status='ended',ended_at=?,paused=0,paused_at=NULL,accumulated_ms=?,updated_at=? WHERE id=?`,
      timestamp, presentationElapsed(stale), timestamp, stale.id);
  }
  const start = Math.min(slideCount - 1, Math.max(0, Number(body?.current_slide) || 0));
  const code = newPresentationCode();
  const result = run(`INSERT INTO presentation_sessions(code,teacher_id,material_id,status,current_slide,paused,accumulated_ms,segment_started_at,started_at,updated_at)
                      VALUES (?,?,?,'active',?,0,0,?,?,?)`,
    code, user.id, material.id, start, now, new Date(now).toISOString(), new Date(now).toISOString());
  logActivity(user, 'start_presentation', 'material', material.id, { code }, req);
  return created(presentationFull(get('SELECT * FROM presentation_sessions WHERE id=?', result.lastInsertRowid), user));
});

route('GET', '/api/presentations/live', 'student', ({ user }) => {
  const student = studentFor(user.id);
  if (!student) return ok([]);
  const rows = all(`SELECT DISTINCT s.* FROM presentation_sessions s
    JOIN material_assignments ma ON ma.material_id=s.material_id
    JOIN class_students cs ON cs.class_id=ma.class_id
    WHERE cs.student_id=? AND s.status='active' ORDER BY s.updated_at DESC`, student.id);
  return ok(rows.map(presentationShape));
});

route('GET', '/api/presentations/:code/state', 'any', ({ params, user }) => {
  const { session } = presentationSession(params.code, user);
  return ok(presentationShape(session));
});

route('GET', '/api/presentations/:code', 'any', ({ params, user }) => {
  const { session } = presentationSession(params.code, user);
  return ok(presentationFull(session, user));
});

route('PUT', '/api/presentations/:code', 'teacher', ({ params, body, user }) => {
  const { session } = presentationSession(params.code, user);
  if (session.status !== 'active') fail(409, 'This presentation has ended.');
  const fields = [];
  const values = [];
  if (body.current_slide !== undefined) {
    if (session.paused) fail(409, 'Resume the presentation before changing slides.');
    const count = get('SELECT COUNT(*) c FROM presentation_slides WHERE material_id=?', session.material_id).c;
    fields.push('current_slide=?');
    values.push(Math.min(count - 1, Math.max(0, Number(body.current_slide) || 0)));
  }
  if (body.paused !== undefined) {
    const nextPaused = Boolean(body.paused);
    if (nextPaused !== Boolean(session.paused)) {
      const now = Date.now();
      if (nextPaused) {
        fields.push('accumulated_ms=?', 'paused=1', 'paused_at=?');
        values.push(presentationElapsed(session), now);
      } else {
        fields.push('paused=0', 'paused_at=NULL', 'segment_started_at=?');
        values.push(now);
      }
    }
  }
  if (fields.length) {
    fields.push('updated_at=?');
    values.push(new Date().toISOString(), session.id);
    run(`UPDATE presentation_sessions SET ${fields.join(',')} WHERE id=?`, ...values);
  }
  return ok(presentationShape(get('SELECT * FROM presentation_sessions WHERE id=?', session.id)));
});

route('POST', '/api/presentations/:code/end', 'teacher', ({ params, user, req }) => {
  const { session, material } = presentationSession(params.code, user);
  const elapsed = presentationElapsed(session);
  const now = new Date().toISOString();
  run(`UPDATE presentation_sessions SET status='ended',paused=0,paused_at=NULL,accumulated_ms=?,ended_at=?,updated_at=? WHERE id=?`,
    elapsed, now, now, session.id);
  logActivity(user, 'end_presentation', 'material', material.id, { code: session.code }, req);
  return ok(presentationShape(get('SELECT * FROM presentation_sessions WHERE id=?', session.id)));
});

// ── Synchronized Story Library presenter view ─────────────────────────────
function storySessionCode() {
  let code;
  do {
    code = [...randomBytes(6)].map((byte) => PRESENTATION_CODE_ALPHABET[byte % PRESENTATION_CODE_ALPHABET.length]).join('');
  } while (get('SELECT 1 FROM story_presentation_sessions WHERE code=?', code));
  return code;
}

function storyAssignmentAllowed(storyId, user) {
  const student = studentFor(user.id);
  if (!student) return false;
  return Boolean(get(`SELECT 1 FROM material_assignments ma
    JOIN class_students cs ON cs.class_id=ma.class_id
    WHERE ma.story_id=? AND cs.student_id=?`, storyId, student.id));
}

function storyPresentationShape(session, options = {}) {
  const story = get('SELECT id,title,story_type,cover_url,status FROM stories WHERE id=?', session.story_id);
  const allPages = all('SELECT page_number,title,text,html,preview_url FROM story_pages WHERE story_id=? ORDER BY page_number,id', session.story_id);
  const current = Math.min(allPages.length - 1, Math.max(0, Number(session.current_page) || 0));
  const pages = options.studentOnly ? [allPages[current]] : allPages;
  return {
    id: session.id,
    code: session.code,
    status: session.status,
    paused: Boolean(session.paused),
    current_page: current,
    page_count: allPages.length,
    elapsed_ms: presentationElapsed(session),
    started_at: session.started_at,
    ended_at: session.ended_at,
    updated_at: session.updated_at,
    story_id: session.story_id,
    teacher_id: session.teacher_id,
    title: story?.title || 'Story',
    story_type: story?.story_type || 'text',
    cover_url: story?.cover_url || '',
    pages: pages.filter(Boolean)
  };
}

function storyPresentationSession(code, user) {
  const session = get('SELECT * FROM story_presentation_sessions WHERE code=?', String(code || '').toUpperCase());
  if (!session) fail(404, 'Story presentation session not found.');
  const story = storyAccess(session.story_id, user);
  if (user.role_name === 'teacher' && session.teacher_id !== user.id && user.role_name !== 'admin') {
    fail(403, 'This story presentation belongs to another teacher.');
  }
  if (user.role_name === 'student' && !storyAssignmentAllowed(session.story_id, user)) {
    fail(403, 'This story has not been shared with your class.');
  }
  return { session, story };
}

route('POST', '/api/stories/:id/presentations', 'teacher', ({ params, user, req }) => {
  const story = storyAccess(params.id, user);
  const count = get('SELECT COUNT(*) c FROM story_pages WHERE story_id=?', story.id).c;
  if (!count) fail(422, 'This story has no pages to present yet.');
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  for (const stale of all("SELECT * FROM story_presentation_sessions WHERE teacher_id=? AND story_id=? AND status='active'", user.id, story.id)) {
    run(`UPDATE story_presentation_sessions SET status='ended',ended_at=?,paused=0,paused_at=NULL,accumulated_ms=?,updated_at=? WHERE id=?`,
      timestamp, presentationElapsed(stale), timestamp, stale.id);
  }
  const code = storySessionCode();
  const result = run(`INSERT INTO story_presentation_sessions(code,teacher_id,story_id,status,current_page,paused,accumulated_ms,segment_started_at,started_at,updated_at)
                      VALUES (?,?,?,'active',0,0,0,?,?,?)`,
    code, user.id, story.id, now, timestamp, timestamp);
  logActivity(user, 'start_story_presentation', 'story', story.id, { code }, req);
  return created(storyPresentationShape(get('SELECT * FROM story_presentation_sessions WHERE id=?', result.lastInsertRowid)));
});

route('GET', '/api/story-presentations/live', 'student', ({ user }) => {
  const student = studentFor(user.id);
  if (!student) return ok([]);
  const rows = all(`SELECT DISTINCT s.* FROM story_presentation_sessions s
    JOIN material_assignments ma ON ma.story_id=s.story_id
    JOIN class_students cs ON cs.class_id=ma.class_id
    WHERE cs.student_id=? AND s.status='active' ORDER BY s.updated_at DESC`, student.id);
  return ok(rows.map((row) => storyPresentationShape(row, { studentOnly: true })));
});

route('GET', '/api/story-presentations/:code/state', 'any', ({ params, user }) => {
  const { session } = storyPresentationSession(params.code, user);
  return ok(storyPresentationShape(session, { studentOnly: user.role_name === 'student' }));
});

route('GET', '/api/story-presentations/:code', 'any', ({ params, user }) => {
  const { session } = storyPresentationSession(params.code, user);
  return ok(storyPresentationShape(session));
});

route('PUT', '/api/story-presentations/:code', 'teacher', ({ params, body, user }) => {
  const { session } = storyPresentationSession(params.code, user);
  if (session.status !== 'active') fail(409, 'This story presentation has ended.');
  const fields = [];
  const values = [];
  if (body.current_page !== undefined) {
    if (session.paused) fail(409, 'Resume the presentation before changing pages.');
    const count = get('SELECT COUNT(*) c FROM story_pages WHERE story_id=?', session.story_id).c;
    fields.push('current_page=?');
    values.push(Math.min(count - 1, Math.max(0, Number(body.current_page) || 0)));
  }
  if (body.paused !== undefined) {
    const nextPaused = Boolean(body.paused);
    if (nextPaused !== Boolean(session.paused)) {
      const now = Date.now();
      if (nextPaused) {
        fields.push('accumulated_ms=?', 'paused=1', 'paused_at=?');
        values.push(presentationElapsed(session), now);
      } else {
        fields.push('paused=0', 'paused_at=NULL', 'segment_started_at=?');
        values.push(now);
      }
    }
  }
  if (fields.length) {
    fields.push('updated_at=?');
    values.push(new Date().toISOString(), session.id);
    run(`UPDATE story_presentation_sessions SET ${fields.join(',')} WHERE id=?`, ...values);
  }
  return ok(storyPresentationShape(get('SELECT * FROM story_presentation_sessions WHERE id=?', session.id)));
});

route('POST', '/api/story-presentations/:code/end', 'teacher', ({ params, user, req }) => {
  const { session, story } = storyPresentationSession(params.code, user);
  const now = new Date().toISOString();
  run(`UPDATE story_presentation_sessions SET status='ended',paused=0,paused_at=NULL,accumulated_ms=?,ended_at=?,updated_at=? WHERE id=?`,
    presentationElapsed(session), now, now, session.id);
  logActivity(user, 'end_story_presentation', 'story', story.id, { code: session.code }, req);
  return ok(storyPresentationShape(get('SELECT * FROM story_presentation_sessions WHERE id=?', session.id)));
});

route('POST', '/api/materials/:id/analyze', 'teacher', async ({ params, body, user }) => {
  const material = materialAccess(params.id, user);
  const slides = all('SELECT title,text FROM presentation_slides WHERE material_id=? ORDER BY slide_number', material.id);
  const analysis = await generateFromSource({
    text: material.extracted_text || '',
    sections: slides.map((slide) => ({ title: slide.title, text: slide.text })),
    title: material.title,
    gradeLevel: bodyGrade(material),
    subject: '',
    language: body.language || material.language || '',
    questionCount: body.questionCount,
    keyFacts: body.keyFacts
  });
  const r = run(`INSERT INTO ai_analyses(teacher_id,source_type,source_id,material_id,input_text,analysis,provider)
                 VALUES (?,'material',?,?,?,?,?)`,
    user.id, material.id, material.id, String(material.extracted_text || '').slice(0, 100000),
    JSON.stringify(analysis), analysis.provider || 'offline');
  run('UPDATE teaching_materials SET analysis=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', JSON.stringify(analysis), material.id);
  return ok({ id: Number(r.lastInsertRowid), ...analysis });
});

route('POST', '/api/materials/:id/games', 'teacher', ({ params, body, user, req }) => {
  const material = materialAccess(params.id, user);
  const analysis = jsonParse(material.analysis, {});
  const drafts = Array.isArray(body.drafts) && body.drafts.length
    ? body.drafts
    : (analysis.gameDrafts || []).filter((draft) => !body.formats || body.formats.includes(draft.type));
  if (!drafts.length) fail(422, 'Generate or choose at least one game draft first.');
  const gameIds = saveSourceGames({
    user, drafts, sourceType: 'material', sourceId: material.id,
    analysisId: body.analysis_id || null, status: body.publish ? 'published' : 'draft',
    gradeLevel: analysis.suggestedGrade || '', subject: analysis.suggestedSubject || ''
  });
  logActivity(user, 'generate_games_from_material', 'material', material.id, { games: gameIds }, req);
  return created({
    teacherGuide: analysis?.teacherGuide || null,
    gameIds,
    games: gameIds.map((id) => hydrateGame(get('SELECT * FROM games WHERE id=?', id)))
  });
});

route('GET', '/api/materials/:id/games', 'any', ({ params, user }) => {
  const material = materialAccess(params.id, user);
  return ok(all('SELECT * FROM generated_games WHERE material_id=? ORDER BY id DESC', material.id)
    .map((row) => ({ ...row, config: jsonParse(row.config, {}), questions: jsonParse(row.questions, []) })));
});

function bodyGrade(material) {
  return get('SELECT grade_level FROM lessons WHERE teacher_id=? ORDER BY id DESC LIMIT 1', material.teacher_id)?.grade_level || '';
}

function writeStoryContent(storyId, { sections, vocabulary, comprehension } = {}) {
  if (Array.isArray(sections)) {
    run('DELETE FROM story_sections WHERE story_id=?', storyId);
    sections.forEach((section, i) => {
      run('INSERT INTO story_sections(story_id,section_number,title,text,image_description) VALUES (?,?,?,?,?)',
        storyId, Number(section.section_number ?? section.sort_order ?? i), String(section.title || `Section ${i + 1}`).slice(0, 200),
        String(section.text || '').slice(0, 20000), String(section.image_description || '').slice(0, 2000));
    });
  }
  if (Array.isArray(vocabulary)) {
    run('DELETE FROM story_vocabulary WHERE story_id=?', storyId);
    vocabulary.forEach((item, i) => {
      if (!item?.term) return;
      run('INSERT INTO story_vocabulary(story_id,term,definition,source_quote,sort_order) VALUES (?,?,?,?,?)',
        storyId, String(item.term).slice(0, 120), String(item.definition || '').slice(0, 1000),
        String(item.source_quote || '').slice(0, 1000), Number(item.sort_order ?? i));
    });
  }
  if (Array.isArray(comprehension)) {
    run('DELETE FROM story_comprehension WHERE story_id=?', storyId);
    comprehension.forEach((item, i) => {
      if (!item?.prompt) return;
      const choices = Array.isArray(item.choices) ? item.choices : [];
      run(`INSERT INTO story_comprehension(story_id,prompt,choices,answer,explanation,source_quote,sort_order)
           VALUES (?,?,?,?,?,?,?)`,
        storyId, String(item.prompt).slice(0, 2000), JSON.stringify(choices.slice(0, 12)),
        String(item.answer || '').slice(0, 500), String(item.explanation || '').slice(0, 2000),
        String(item.source_quote || '').slice(0, 1000), Number(item.sort_order ?? i));
    });
  }
}

function sourceTextFor(body, user) {
  const sourceType = String(body.sourceType || 'text');
  if (sourceType === 'material') {
    const material = materialAccess(body.sourceId, user);
    return {
      text: material.extracted_text || '', sourceId: material.id, sourceType, title: body.title || material.title,
      gradeLevel: body.gradeLevel || bodyGrade(material), subject: body.subject || '',
      language: body.language || material.language || '',
      sections: all('SELECT title,text FROM presentation_slides WHERE material_id=? ORDER BY slide_number', material.id)
    };
  }
  if (sourceType === 'story') {
    const story = storyAccess(body.sourceId, user);
    const pages = all('SELECT title,text FROM story_pages WHERE story_id=? ORDER BY page_number', story.id)
      .filter((page) => String(page.text || '').trim());
    const sections = pages.length
      ? pages
      : all('SELECT title,text FROM story_sections WHERE story_id=? ORDER BY section_number', story.id)
        .filter((section) => String(section.text || '').trim() && !/^Preview of /i.test(String(section.text || '')));
    return {
      text: sections.map((s) => `${s.title}\n${s.text}`).join('\n\n'),
      sections, sourceId: story.id, sourceType, title: body.title || story.title,
      gradeLevel: body.gradeLevel || story.grade_level, subject: body.subject || story.subject,
      language: body.language || story.language || ''
    };
  }
  if (sourceType === 'lesson') {
    const lesson = lessonAccess(body.sourceId, user);
    const pages = all('SELECT title,text FROM lesson_pages WHERE lesson_id=? ORDER BY sort_order', lesson.id);
    return {
      text: lesson.extracted_text || pages.map((p) => `${p.title}\n${p.text}`).join('\n\n'),
      sourceId: lesson.id, sourceType, title: body.title || lesson.title,
      gradeLevel: body.gradeLevel || lesson.grade_level, subject: body.subject || get('SELECT name FROM subjects WHERE id=?', lesson.subject_id)?.name || '',
      language: body.language || ''
    };
  }
  return {
    text: String(body.text || '').slice(0, 100000), sourceId: null, sourceType: 'text',
    title: body.title || 'Pasted lesson content', gradeLevel: body.gradeLevel || '', subject: body.subject || '',
    language: body.language || '', sections: []
  };
}

// ─────────────────────────── Story & Reading Library ───────────────────────

route('GET', '/api/stories', 'any', ({ user, query }) => {
  const args = [];
  let sql = `SELECT s.* FROM stories s WHERE 1=1`;
  if (query.archived === '1') sql += ' AND s.archived=1';
  else sql += ' AND s.archived=0';
  if (user.role_name === 'student') sql += " AND s.status='published'";
  else if (user.role_name === 'teacher') sql += ' AND (s.teacher_id=? OR s.source_note LIKE ?)';
  else sql += " AND s.status='published'";
  if (user.role_name === 'teacher') args.push(user.id, 'Original EduPlay%');
  if (query.category) { sql += ' AND s.category=?'; args.push(query.category); }
  if (query.grade) { sql += ' AND s.grade_level=?'; args.push(query.grade); }
  if (query.reading_level) { sql += ' AND s.reading_level=?'; args.push(query.reading_level); }
  if (query.subject) { sql += ' AND s.subject=?'; args.push(query.subject); }
  if (query.quarter) { sql += ' AND s.quarter=?'; args.push(query.quarter); }
  if (query.language) { sql += ' AND s.language=?'; args.push(query.language); }
  if (query.search) { sql += ' AND (s.title LIKE ? OR s.description LIKE ?)'; args.push(`%${query.search}%`, `%${query.search}%`); }
  if (query.source_material_id) { sql += ' AND s.source_material_id=?'; args.push(query.source_material_id); }
  if (query.favorite === '1' && user.role_name === 'teacher') {
    sql += ' AND EXISTS (SELECT 1 FROM story_favorites f WHERE f.story_id=s.id AND f.teacher_id=?)';
    args.push(user.id);
  }
  sql += ' ORDER BY s.updated_at DESC,s.id DESC';
  if (query.limit) { sql += ' LIMIT ?'; args.push(Math.min(200, Math.max(1, Number(query.limit) || 50))); }
  return ok(all(sql, ...args).map((row) => storyView(row, user)));
});

route('GET', '/api/stories/:id', 'any', ({ params, user }) => ok(storyDetail(storyAccess(params.id, user), user)));

route('POST', '/api/stories', 'teacher', async ({ body, user, req }) => {
  requireFields(body, ['title']);
  let sourceMaterial = null;
  if (body.source_material_id) sourceMaterial = materialAccess(body.source_material_id, user);
  const requestedPages = Array.isArray(body.pages) ? body.pages : [];
  const sections = Array.isArray(body.sections) ? body.sections : [];
  let vocabulary = body.vocabulary;
  let comprehension = body.comprehension;
  let analysis = {};
  const sourceSections = requestedPages.length
    ? requestedPages.map((page, i) => ({ title: page?.title || `Page ${i + 1}`, text: page?.text || plainTextFromHtml(page?.html) }))
    : sections;
  if ((!vocabulary || !comprehension) && sourceSections.length) {
    analysis = await generateFromSource({
      text: sourceSections.map((s) => s.text || '').join('\n\n'),
      sections: sourceSections, title: body.title, gradeLevel: body.grade_level, subject: body.subject,
      language: body.language || 'English'
    });
    vocabulary = vocabulary || analysis.vocabulary;
    comprehension = comprehension || analysis.compression || analysis.comprehension;
  }
  const storyType = ['pdf', 'manual', 'text'].includes(body.story_type)
    ? body.story_type : requestedPages.length ? 'manual' : 'text';
  const processingStatus = ['ready', 'processing', 'warning', 'failed'].includes(body.processing_status)
    ? body.processing_status : 'ready';
  const r = run(`INSERT INTO stories(teacher_id,source_material_id,title,category,grade_level,subject,language,description,
                  cover_url,cover_emoji,source_note,status,preferences,analysis,
                  topic,reading_level,quarter,objectives,story_type,source_file_url,source_file_name,source_hash,
                  page_count,processing_status,processing_error)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    user.id, sourceMaterial?.id || null, String(body.title).trim().slice(0, 160),
    String(body.category || 'Short Stories').slice(0, 80), String(body.grade_level || '').slice(0, 40),
    String(body.subject || '').slice(0, 80), String(body.language || 'English').slice(0, 40),
    String(body.description || '').slice(0, 1000), body.cover_url || null,
    String(body.cover_emoji || '📖').slice(0, 16),
    String(body.source_note || 'Original content supplied by the teacher.').slice(0, 1000),
    body.status === 'published' ? 'published' : 'draft',
    JSON.stringify({ ...DEFAULT_PREFERENCES, ...(body.preferences || {}) }), JSON.stringify(analysis),
    body.topic || null, body.reading_level || null, body.quarter || null, objectivesJson(body.objectives),
    storyType, safeStoredUrl(body.source_file_url || sourceMaterial?.file_url),
    String(body.source_file_name || sourceMaterial?.file_name || '').slice(0, 255) || null,
    body.source_hash ? String(body.source_hash).slice(0, 128) : sourceMaterial?.file_hash || null,
    requestedPages.length, processingStatus, String(body.processing_error || '').slice(0, 1000) || null);
  const storyId = Number(r.lastInsertRowid);
  const prepared = requestedPages.length ? await prepareStoryPages(storyId, requestedPages) : [];
  if (prepared.length && !body.cover_url && prepared[0].preview_url) {
    run('UPDATE stories SET cover_url=? WHERE id=?', prepared[0].preview_url, storyId);
  }
  writeStoryContent(storyId, { sections: prepared.length ? prepared : sections, vocabulary, comprehension });
  if (sourceMaterial && prepared.length && !String(sourceMaterial.extracted_text || '').trim()) {
    const groundedText = prepared.map((page) => page.text).filter(Boolean).join('\n\n').slice(0, 200000);
    if (groundedText) run('UPDATE teaching_materials SET extracted_text=? WHERE id=?', groundedText, sourceMaterial.id);
  }
  logActivity(user, 'create_story', 'story', storyId, { title: body.title, source: sourceMaterial?.title, storyType }, req);
  return created(storyDetail(get('SELECT * FROM stories WHERE id=?', storyId), user));
});

route('PUT', '/api/stories/:id', 'teacher', async ({ params, body, user, req }) => {
  const story = storyAccess(params.id, user);
  const requestedPages = Array.isArray(body.pages) ? body.pages : null;
  const prepared = requestedPages ? await prepareStoryPages(story.id, requestedPages) : [];
  const derivedSections = prepared.length
    ? prepared.map((page) => ({ section_number: page.page_number, title: page.title, text: page.text }))
    : null;
  const pageCount = requestedPages ? prepared.length : story.page_count;
  const coverUrl = body.cover_url !== undefined
    ? body.cover_url
    : (prepared.length && !story.cover_url ? prepared[0].preview_url : story.cover_url);
  run(`UPDATE stories SET title=?,category=?,grade_level=?,subject=?,language=?,description=?,cover_url=?,cover_emoji=?,
        source_note=?,status=?,archived=?,preferences=?,topic=?,reading_level=?,quarter=?,objectives=?,page_count=?,
        processing_status=?,processing_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    body.title || story.title, body.category || story.category, body.grade_level ?? story.grade_level,
    body.subject ?? story.subject, body.language || story.language, body.description ?? story.description,
    coverUrl || null, body.cover_emoji || story.cover_emoji,
    body.source_note ?? story.source_note, body.status === 'published' ? 'published' : story.status,
    body.archived === undefined ? story.archived : (body.archived ? 1 : 0),
    JSON.stringify({ ...jsonParse(story.preferences, {}), ...(body.preferences || {}) }),
    body.topic ?? story.topic, body.reading_level ?? story.reading_level, body.quarter ?? story.quarter,
    body.objectives !== undefined ? objectivesJson(body.objectives) : story.objectives, pageCount,
    ['ready', 'processing', 'warning', 'failed'].includes(body.processing_status)
      ? body.processing_status : story.processing_status,
    body.processing_error !== undefined
      ? String(body.processing_error || '').slice(0, 1000) || null : story.processing_error,
    story.id);
  writeStoryContent(story.id, { ...body, sections: derivedSections || body.sections });
  logActivity(user, 'update_story', 'story', story.id, { pages: pageCount }, req);
  return ok(storyDetail(get('SELECT * FROM stories WHERE id=?', story.id), user));
});

route('DELETE', '/api/stories/:id', 'teacher', ({ params, user, req }) => {
  const story = storyAccess(params.id, user);
  if (story.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'Only the owner can delete this story.');
  run('DELETE FROM stories WHERE id=?', story.id);
  logActivity(user, 'delete_story', 'story', story.id, { title: story.title }, req);
  return ok({ deleted: true });
});

route('POST', '/api/stories/:id/favorite', 'teacher', ({ params, user }) => {
  const story = storyAccess(params.id, user);
  const existing = get('SELECT 1 FROM story_favorites WHERE story_id=? AND teacher_id=?', story.id, user.id);
  if (existing) run('DELETE FROM story_favorites WHERE story_id=? AND teacher_id=?', story.id, user.id);
  else run('INSERT INTO story_favorites(story_id,teacher_id) VALUES (?,?)', story.id, user.id);
  return ok({ favorite: !existing });
});

route('POST', '/api/stories/:id/assign', 'teacher', ({ params, body, user, req }) => {
  const story = storyAccess(params.id, user);
  if (!Array.isArray(body.class_ids)) fail(400, 'class_ids must be an array.');
  transaction(() => {
    run('DELETE FROM material_assignments WHERE story_id=?', story.id);
    for (const classId of body.class_ids) {
      if (!get('SELECT id FROM classes WHERE id=? AND teacher_id=?', classId, user.id)) fail(404, 'One of those classes was not found.');
      run('INSERT INTO material_assignments(teacher_id,story_id,class_id,due_at,instructions) VALUES (?,?,?,?,?)',
        user.id, story.id, classId, body.due_at || null, String(body.instructions || '').slice(0, 1000));
    }
  });
  if (story.status !== 'published' || story.archived) run("UPDATE stories SET status='published',archived=0 WHERE id=?", story.id);
  logActivity(user, 'assign_story', 'story', story.id, { classes: body.class_ids }, req);
  return ok({ assigned: body.class_ids.length });
});

route('POST', '/api/stories/:id/sections', 'teacher', ({ params, body, user }) => {
  const story = storyAccess(params.id, user);
  requireFields(body, ['text']);
  const next = Number(get('SELECT COALESCE(MAX(section_number),-1)+1 n FROM story_sections WHERE story_id=?', story.id).n);
  const r = run('INSERT INTO story_sections(story_id,section_number,title,text,image_description) VALUES (?,?,?,?,?)',
    story.id, next, String(body.title || `Section ${next + 1}`).slice(0, 200),
    String(body.text).slice(0, 20000), String(body.image_description || '').slice(0, 2000));
  return created(get('SELECT * FROM story_sections WHERE id=?', Number(r.lastInsertRowid)));
});

route('PUT', '/api/story-sections/:id', 'teacher', ({ params, body, user }) => {
  const section = get('SELECT s.*, st.teacher_id FROM story_sections s JOIN stories st ON st.id=s.story_id WHERE s.id=?', params.id);
  if (!section) fail(404, 'Story section not found.');
  if (section.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'This story belongs to another teacher.');
  run('UPDATE story_sections SET title=?,text=?,image_description=?,section_number=? WHERE id=?',
    body.title ?? section.title, body.text ?? section.text, body.image_description ?? section.image_description,
    Number(body.section_number ?? section.section_number), section.id);
  return ok(get('SELECT * FROM story_sections WHERE id=?', section.id));
});

route('DELETE', '/api/story-sections/:id', 'teacher', ({ params, user }) => {
  const section = get('SELECT s.*, st.teacher_id FROM story_sections s JOIN stories st ON st.id=s.story_id WHERE s.id=?', params.id);
  if (!section) fail(404, 'Story section not found.');
  if (section.teacher_id !== user.id && user.role_name !== 'admin') fail(403, 'This story belongs to another teacher.');
  run('DELETE FROM story_sections WHERE id=?', section.id);
  return ok({ deleted: true });
});

route('POST', '/api/stories/:id/analyze', 'teacher', async ({ params, body, user }) => {
  const story = storyAccess(params.id, user);
  const source = sourceTextFor({ ...body, sourceType: 'story', sourceId: story.id }, user);
  const analysis = await generateFromSource({ ...source, questionCount: body.questionCount, keyFacts: body.keyFacts });
  const r = run(`INSERT INTO ai_analyses(teacher_id,source_type,source_id,story_id,input_text,analysis,provider)
                 VALUES (?,'story',?,?,?,?,?)`,
    user.id, story.id, story.id, String(source.text).slice(0, 100000), JSON.stringify(analysis), analysis.provider || 'offline');
  run('UPDATE stories SET analysis=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', JSON.stringify(analysis), story.id);
  return ok({ id: Number(r.lastInsertRowid), ...analysis });
});

route('POST', '/api/stories/:id/games', 'teacher', ({ params, body, user, req }) => {
  const story = storyAccess(params.id, user);
  const analysis = jsonParse(story.analysis, {});
  const drafts = Array.isArray(body.drafts) && body.drafts.length
    ? body.drafts
    : (analysis.gameDrafts || []).filter((draft) => !body.formats || body.formats.includes(draft.type));
  if (!drafts.length) fail(422, 'Analyze this story and choose at least one game format first.');
  const gameIds = saveSourceGames({
    user, drafts, sourceType: 'story', sourceId: story.id,
    analysisId: body.analysis_id || null, status: body.publish ? 'published' : 'draft',
    gradeLevel: story.grade_level || analysis.suggestedGrade || '', subject: story.subject || analysis.suggestedSubject || ''
  });
  logActivity(user, 'generate_games_from_story', 'story', story.id, { games: gameIds }, req);
  return created({
    teacherGuide: analysis?.teacherGuide || null,
    gameIds,
    games: gameIds.map((id) => hydrateGame(get('SELECT * FROM games WHERE id=?', id)))
  });
});

route('POST', '/api/stories/:id/sessions', 'student', ({ params, body, user }) => {
  const story = storyAccess(params.id, user);
  const student = studentFor(user.id);
  const r = run(`INSERT INTO story_reading_sessions(story_id,student_id,section_id,mode,time_spent,words_read,completed)
                 VALUES (?,?,?,?,?,?,?)`,
    story.id, student.id, body.section_id || null,
    ['listen', 'read_along', 'independent', 'practice'].includes(body.mode) ? body.mode : 'listen',
    Math.max(0, Number(body.time_spent) || 0), Math.max(0, Number(body.words_read) || 0), body.completed ? 1 : 0);
  return created(get('SELECT * FROM story_reading_sessions WHERE id=?', Number(r.lastInsertRowid)));
});

route('GET', '/api/student/library', 'student', ({ user }) => {
  const student = studentFor(user.id);
  if (!student) return ok({ presentations: [], stories: [] });
  const presentations = all(`SELECT m.id,m.title,m.kind,m.format,m.file_name,m.updated_at,
      (SELECT COUNT(*) FROM presentation_slides s WHERE s.material_id=m.id) slide_count,
      ma.due_at, ma.instructions, c.name class_name
      FROM teaching_materials m JOIN material_assignments ma ON ma.material_id=m.id
      JOIN classes c ON c.id=ma.class_id JOIN class_students cs ON cs.class_id=ma.class_id
      WHERE cs.student_id=? ORDER BY ma.id DESC`, student.id);
  const stories = all(`SELECT s.id,s.title,s.category,s.grade_level,s.subject,s.reading_level,s.language,s.description,s.cover_url,s.cover_emoji,
      (SELECT COALESCE(NULLIF((SELECT COUNT(*) FROM story_pages p WHERE p.story_id=s.id),0),
        (SELECT COUNT(*) FROM story_sections sec WHERE sec.story_id=s.id))) section_count,
      ma.due_at, ma.instructions, c.name class_name
      FROM stories s JOIN material_assignments ma ON ma.story_id=s.id
      JOIN classes c ON c.id=ma.class_id JOIN class_students cs ON cs.class_id=ma.class_id
      WHERE cs.student_id=? AND s.status='published' AND s.archived=0 ORDER BY ma.id DESC`, student.id);
  return ok({ presentations, stories });
});

// ───────────────────────── Source-grounded AI API ──────────────────────────

route('POST', '/api/ai/analyze', 'teacher', async ({ body, user }) => {
  const source = sourceTextFor(body, user);
  if (!String(source.text || '').trim() && !body.text) fail(400, 'There is no content to analyze.');
  const analysis = await generateFromSource({ ...source, questionCount: body.questionCount, keyFacts: body.keyFacts });
  analysis.gameDrafts = applyGenerationDefaults(analysis.gameDrafts, body);
  const r = run(`INSERT INTO ai_analyses(teacher_id,source_type,source_id,material_id,story_id,lesson_id,input_text,analysis,provider)
                 VALUES (?,?,?,?,?,?,?,?,?)`,
    user.id, source.sourceType, source.sourceId,
    source.sourceType === 'material' ? source.sourceId : null,
    source.sourceType === 'story' ? source.sourceId : null,
    source.sourceType === 'lesson' ? source.sourceId : null,
    String(source.text || '').slice(0, 100000), JSON.stringify(analysis), analysis.provider || 'offline');
  return created({ id: Number(r.lastInsertRowid), ...analysis });
});

route('POST', '/api/ai/generate-from-source', 'teacher', async ({ body, user, req }) => {
  const source = sourceTextFor(body, user);
  const analysis = await generateFromSource({
    ...source, formats: body.formats || [],
    questionCount: body.questionCount, keyFacts: body.keyFacts,
    language: source.language || body.language || ''
  });
  analysis.gameDrafts = applyGenerationDefaults(analysis.gameDrafts, body);
  let analysisId = null;
  const r = run(`INSERT INTO ai_analyses(teacher_id,source_type,source_id,material_id,story_id,lesson_id,input_text,analysis,provider)
                 VALUES (?,?,?,?,?,?,?,?,?)`,
    user.id, source.sourceType, source.sourceId,
    source.sourceType === 'material' ? source.sourceId : null,
    source.sourceType === 'story' ? source.sourceId : null,
    source.sourceType === 'lesson' ? source.sourceId : null,
    String(source.text || '').slice(0, 100000), JSON.stringify(analysis), analysis.provider || 'offline');
  analysisId = Number(r.lastInsertRowid);
  let gameIds = [];
  const drafts = applyGenerationDefaults(
    Array.isArray(body.drafts) && body.drafts.length ? body.drafts : analysis.gameDrafts, body);
  if (body.save) {
    gameIds = saveSourceGames({
      user, drafts, sourceType: source.sourceType, sourceId: source.sourceId,
      analysisId, status: body.publish ? 'published' : 'draft',
      gradeLevel: body.gradeLevel || analysis.suggestedGrade || '', subject: body.subject || analysis.suggestedSubject || ''
    });
  }
  logActivity(user, 'generate_from_source', source.sourceType, source.sourceId, { games: gameIds, formats: body.formats }, req);
  return created({ analysisId, analysis, teacherGuide: analysis?.teacherGuide || null, drafts, gameIds });
});

// ── Animated Storybooks (separate feature) ────────────────────────────────
const ANIMATED_CATEGORIES = ['Adventure', 'Fairy Tales', 'Animal Stories', 'Bedtime Stories', 'Moral Stories', 'Educational Stories'];

function animatedView(row) {
  return {
    ...row,
    scene_count: get('SELECT COUNT(*) c FROM animated_scenes WHERE story_id=?', row.id).c
  };
}

function animatedDetail(row) {
  return {
    ...animatedView(row),
    scenes: all('SELECT * FROM animated_scenes WHERE story_id=? ORDER BY scene_number,id', row.id)
      .map((scene) => ({ ...scene, effects: jsonParse(scene.effects, []) }))
  };
}

function animatedAccess(id, user) {
  const story = get('SELECT * FROM animated_stories WHERE id=?', id);
  if (!story) fail(404, 'Animated story not found.');
  if (user?.role_name === 'student' && story.status !== 'published') fail(404, 'Animated story not found.');
  return story;
}

function animatedManageAccess(id, user) {
  const story = animatedAccess(id, user);
  if (user.role_name !== 'admin' && !(user.role_name === 'teacher' && story.created_by === user.id)) {
    fail(403, 'You can only manage your own animated stories.');
  }
  return story;
}

async function storeAnimatedImage(value) {
  if (!value) return '';
  if (String(value).startsWith('data:')) return saveDataUrl(value, 'image');
  if (/^\/media\//.test(String(value))) return String(value);
  return '';
}

async function saveAnimatedScenes(storyId, scenes) {
  const list = Array.isArray(scenes) ? scenes.slice(0, 40) : [];
  transaction(() => {
    run('DELETE FROM animated_scenes WHERE story_id=?', storyId);
    list.forEach((scene, i) => {
      run(`INSERT INTO animated_scenes(story_id,scene_number,title,text,image_url,background,character,duration,effects)
           VALUES (?,?,?,?,?,?,?,?,?)`, storyId, i + 1,
        String(scene.title || `Scene ${i + 1}`).slice(0, 160),
        String(scene.text || '').slice(0, 4000),
        scene.image_url || '',
        ['meadow', 'sunset', 'night', 'forest'].includes(scene.background) ? scene.background : 'meadow',
        String(scene.character || 'owl').slice(0, 40),
        Math.max(0, Math.min(120, Number(scene.duration) || 0)),
        JSON.stringify(Array.isArray(scene.effects) ? scene.effects : []));
    });
  });
}

route('GET', '/api/animated-stories', 'any', ({ user, query }) => {
  const args = [];
  let sql = 'SELECT * FROM animated_stories WHERE 1=1';
  if (user.role_name !== 'admin') sql += " AND status='published'";
  if (query.category) { sql += ' AND category=?'; args.push(query.category); }
  if (query.grade_level) { sql += ' AND grade_level=?'; args.push(query.grade_level); }
  sql += ' ORDER BY updated_at DESC,id DESC';
  return ok(all(sql, ...args).map(animatedView));
});

route('GET', '/api/animated-stories/admin', 'any', ({ user }) => {
  if (!['admin', 'teacher'].includes(user.role_name)) fail(403, 'You do not have access to story management.');
  const rows = user.role_name === 'teacher'
    ? all('SELECT * FROM animated_stories WHERE created_by=? ORDER BY updated_at DESC,id DESC', user.id)
    : all('SELECT * FROM animated_stories ORDER BY updated_at DESC,id DESC');
  return ok(rows.map(animatedDetail));
});

route('GET', '/api/animated-stories/:id', 'any', ({ params, user }) => ok(animatedDetail(animatedAccess(params.id, user))));

route('POST', '/api/animated-stories/:id/progress', 'student', ({ params, body, user }) => {
  const student = studentFor(user.id);
  if (!student) fail(404, 'Student profile not found.');
  const story = animatedAccess(params.id, user);
  run(`INSERT INTO animated_story_progress(student_id,story_id,scene_number,seconds,completed,last_viewed)
       VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(student_id,story_id) DO UPDATE SET
         scene_number=excluded.scene_number,
         seconds=MAX(animated_story_progress.seconds,excluded.seconds),
         completed=MAX(animated_story_progress.completed,excluded.completed),
         last_viewed=CURRENT_TIMESTAMP`,
    student.id, story.id,
    Math.max(0, Number(body.sceneNumber) || 0),
    Math.max(0, Number(body.seconds) || 0),
    body.completed ? 1 : 0);
  return ok(get('SELECT * FROM animated_story_progress WHERE student_id=? AND story_id=?', student.id, story.id));
});

route('POST', '/api/animated-stories', 'any', async ({ body, user, req }) => {
  if (!['admin', 'teacher'].includes(user.role_name)) fail(403, 'You do not have access to story management.');
  requireFields(body, ['title']);
  const coverUrl = await storeAnimatedImage(body.coverUrl);
  const r = run(`INSERT INTO animated_stories(created_by,title,description,grade_level,category,cover_url,status)
                 VALUES (?,?,?,?,?,?,'draft')`,
    user.id, String(body.title).trim().slice(0, 160), String(body.description || '').slice(0, 4000),
    body.grade_level || null,
    ANIMATED_CATEGORIES.includes(body.category) ? body.category : 'Adventure', coverUrl);
  const id = Number(r.lastInsertRowid);
  await saveAnimatedScenes(id, body.scenes || []);
  logActivity(user, 'create_animated_story', 'animated_story', id, { title: body.title }, req);
  return created(animatedDetail(get('SELECT * FROM animated_stories WHERE id=?', id)));
});

route('PUT', '/api/animated-stories/:id', 'any', async ({ params, body, user, req }) => {
  const story = animatedManageAccess(params.id, user);
  const coverUrl = body.coverUrl ? await storeAnimatedImage(body.coverUrl) : story.cover_url;
  run(`UPDATE animated_stories SET title=?,description=?,grade_level=?,category=?,cover_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    String(body.title || story.title).trim().slice(0, 160),
    String(body.description ?? story.description).slice(0, 4000),
    body.grade_level ?? story.grade_level,
    ANIMATED_CATEGORIES.includes(body.category) ? body.category : story.category,
    coverUrl, story.id);
  if (Array.isArray(body.scenes)) await saveAnimatedScenes(story.id, body.scenes);
  logActivity(user, 'update_animated_story', 'animated_story', story.id, {}, req);
  return ok(animatedDetail(get('SELECT * FROM animated_stories WHERE id=?', story.id)));
});

route('POST', '/api/animated-stories/:id/publish', 'any', ({ params, user, req }) => {
  const story = animatedManageAccess(params.id, user);
  run("UPDATE animated_stories SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?", story.id);
  logActivity(user, 'publish_animated_story', 'animated_story', story.id, {}, req);
  return ok(animatedDetail(get('SELECT * FROM animated_stories WHERE id=?', story.id)));
});

route('DELETE', '/api/animated-stories/:id', 'any', ({ params, user, req }) => {
  const story = animatedManageAccess(params.id, user);
  run('DELETE FROM animated_stories WHERE id=?', story.id);
  logActivity(user, 'delete_animated_story', 'animated_story', story.id, {}, req);
  return ok({ deleted: true });
});

// ── Interactive Animated Stories (separate feature) ───────────────────────
const IAS_CATEGORIES = ['Nursery Rhymes', 'Animal Stories', 'Fairy Tales', 'Fables', 'Educational Stories'];

function iasView(row) {
  return {
    ...row,
    scene_count: get('SELECT COUNT(*) c FROM ias_scenes WHERE story_id=?', row.id).c,
    activity_count: get('SELECT COUNT(*) c FROM ias_activities WHERE story_id=?', row.id).c
  };
}

function iasDetail(row, student = false) {
  const scenes = all('SELECT * FROM ias_scenes WHERE story_id=? ORDER BY scene_number,id', row.id).map((scene) => ({
    ...scene,
    hotspots: all('SELECT * FROM ias_hotspots WHERE scene_id=? ORDER BY id', scene.id)
  }));
  const activities = all('SELECT * FROM ias_activities WHERE story_id=? ORDER BY scene_number,id', row.id)
    .map((item) => {
      const activity = { ...item, options: jsonParse(item.options, []) };
      if (student) delete activity.answer;
      return activity;
    });
  return { ...iasView(row), scenes, activities };
}

function iasAccess(id, user) {
  const story = get('SELECT * FROM ias_stories WHERE id=?', id);
  if (!story) fail(404, 'Interactive story not found.');
  if (user?.role_name === 'student' && story.status !== 'published') fail(404, 'Interactive story not found.');
  return story;
}

async function iasStoreAsset(value, kind = 'image') {
  if (!value) return '';
  if (String(value).startsWith('data:')) return saveDataUrl(value, kind);
  if (/^\/media\//.test(String(value))) return String(value);
  return '';
}

async function iasSaveScenes(storyId, scenes = []) {
  const list = Array.isArray(scenes) ? scenes.slice(0, 40) : [];
  transaction(() => {
    run('DELETE FROM ias_scenes WHERE story_id=?', storyId);
    list.forEach((scene, i) => {
      const row = run(`INSERT INTO ias_scenes(story_id,scene_number,title,text,background,character,expression,action,image_url,audio_url,duration)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        storyId, i + 1,
        String(scene.title || `Scene ${i + 1}`).slice(0, 160),
        String(scene.text || '').slice(0, 4000),
        ['meadow', 'sunset', 'night', 'forest'].includes(scene.background) ? scene.background : 'meadow',
        String(scene.character || 'owl').slice(0, 40),
        String(scene.expression || 'happy').slice(0, 40),
        String(scene.action || 'idle').slice(0, 40),
        scene.image_url || '', scene.audio_url || '',
        Math.max(0, Math.min(120, Number(scene.duration) || 0)));
      const sceneId = Number(row.lastInsertRowid);
      (Array.isArray(scene.hotspots) ? scene.hotspots : []).forEach((spot) => {
        run('INSERT INTO ias_hotspots(scene_id,label,kind,x,y,feedback,sound) VALUES (?,?,?,?,?,?,?)',
          sceneId,
          String(spot.label || 'Tap me').slice(0, 80),
          String(spot.kind || 'star').slice(0, 40),
          Math.max(0, Math.min(100, Number(spot.x) || 50)),
          Math.max(0, Math.min(100, Number(spot.y) || 50)),
          String(spot.feedback || '').slice(0, 500),
          String(spot.sound || 'click').slice(0, 40));
      });
    });
  });
}

async function iasSaveActivities(storyId, activities = []) {
  const list = Array.isArray(activities) ? activities.slice(0, 60) : [];
  transaction(() => {
    run('DELETE FROM ias_activities WHERE story_id=?', storyId);
    list.forEach((item) => {
      run('INSERT INTO ias_activities(story_id,scene_number,type,prompt,options,answer,feedback) VALUES (?,?,?,?,?,?,?)',
        storyId,
        Math.max(1, Number(item.sceneNumber || item.scene_number) || 1),
        ['multiple_choice', 'true_false', 'matching', 'sequencing', 'vocabulary'].includes(item.type) ? item.type : 'multiple_choice',
        String(item.prompt || '').slice(0, 500),
        JSON.stringify(Array.isArray(item.options) ? item.options : []),
        String(item.answer || '').slice(0, 200),
        String(item.feedback || '').slice(0, 500));
    });
  });
}

route('GET', '/api/interactive-stories', 'any', ({ query }) => {
  const args = [];
  let sql = "SELECT * FROM ias_stories WHERE status='published'";
  if (query.category) { sql += ' AND category=?'; args.push(query.category); }
  if (query.grade_level) { sql += ' AND grade_level=?'; args.push(query.grade_level); }
  sql += ' ORDER BY updated_at DESC,id DESC';
  return ok(all(sql, ...args).map(iasView));
});

route('GET', '/api/interactive-stories/admin', 'admin', () =>
  ok(all('SELECT * FROM ias_stories ORDER BY updated_at DESC,id DESC').map((s) => iasDetail(s))));

route('GET', '/api/interactive-stories/:id', 'any', ({ params, user }) =>
  ok(iasDetail(iasAccess(params.id, user), user?.role_name === 'student')));

route('POST', '/api/interactive-stories/:id/progress', 'student', ({ params, body, user }) => {
  const student = studentFor(user.id);
  if (!student) fail(404, 'Student profile not found.');
  const story = iasAccess(params.id, user);
  run(`INSERT INTO ias_progress(student_id,story_id,scene_number,seconds,completed,stars,last_viewed)
       VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(student_id,story_id) DO UPDATE SET
         scene_number=excluded.scene_number,
         seconds=MAX(ias_progress.seconds,excluded.seconds),
         completed=MAX(ias_progress.completed,excluded.completed),
         stars=MAX(ias_progress.stars,excluded.stars),
         last_viewed=CURRENT_TIMESTAMP`,
    student.id, story.id,
    Math.max(0, Number(body.sceneNumber) || 0),
    Math.max(0, Number(body.seconds) || 0),
    body.completed ? 1 : 0,
    Math.max(0, Number(body.stars) || 0));
  return ok(get('SELECT * FROM ias_progress WHERE student_id=? AND story_id=?', student.id, story.id));
});

route('POST', '/api/interactive-stories/:id/activities/:activityId/answer', 'student', ({ params, body, user, req }) => {
  const student = studentFor(user.id);
  const story = iasAccess(params.id, user);
  const activity = get('SELECT * FROM ias_activities WHERE id=? AND story_id=?', params.activityId, story.id);
  if (!activity) fail(404, 'Activity not found.');
  const response = String(body.response ?? '');
  const correct = norm(response) === norm(activity.answer);
  const kind = `activity:${activity.id}`;
  const existing = get('SELECT 1 FROM ias_awards WHERE student_id=? AND story_id=? AND kind=?', student.id, story.id, kind);
  if (!existing && correct) {
    run('INSERT INTO ias_awards(student_id,story_id,kind,stars,coins) VALUES (?,?,?,?,?)', student.id, story.id, kind, 1, 10);
    run('UPDATE ias_progress SET stars=stars+1,last_viewed=CURRENT_TIMESTAMP WHERE student_id=? AND story_id=?', student.id, story.id);
  }
  logActivity({ id: user.id }, 'interactive_story_answer', 'story', story.id, { activityId: activity.id, correct }, req);
  return ok({ correct, answer: activity.answer, feedback: activity.feedback || (correct ? 'Great job!' : 'Try another answer.'), stars: correct && !existing ? 1 : 0 });
});

route('POST', '/api/interactive-stories', 'admin', async ({ body, user, req }) => {
  requireAdmin(user);
  requireFields(body, ['title']);
  const coverUrl = await iasStoreAsset(body.coverUrl);
  const r = run(`INSERT INTO ias_stories(created_by,title,description,category,grade_level,cover_url,status)
                 VALUES (?,?,?,?,?,?,'draft')`,
    user.id, String(body.title).trim().slice(0, 160), String(body.description || '').slice(0, 4000),
    IAS_CATEGORIES.includes(body.category) ? body.category : 'Animal Stories', body.grade_level || null, coverUrl);
  const id = Number(r.lastInsertRowid);
  await iasSaveScenes(id, body.scenes);
  await iasSaveActivities(id, body.activities);
  logActivity(user, 'create_interactive_story', 'story', id, { title: body.title }, req);
  return created(iasDetail(get('SELECT * FROM ias_stories WHERE id=?', id)));
});

route('PUT', '/api/interactive-stories/:id', 'admin', async ({ params, body, user, req }) => {
  requireAdmin(user);
  const story = iasAccess(params.id, user);
  const coverUrl = body.coverUrl ? await iasStoreAsset(body.coverUrl) : story.cover_url;
  run(`UPDATE ias_stories SET title=?,description=?,category=?,grade_level=?,cover_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    String(body.title || story.title).trim().slice(0, 160),
    String(body.description ?? story.description).slice(0, 4000),
    IAS_CATEGORIES.includes(body.category) ? body.category : story.category,
    body.grade_level ?? story.grade_level, coverUrl, story.id);
  if (Array.isArray(body.scenes)) await iasSaveScenes(story.id, body.scenes);
  if (Array.isArray(body.activities)) await iasSaveActivities(story.id, body.activities);
  logActivity(user, 'update_interactive_story', 'story', story.id, {}, req);
  return ok(iasDetail(get('SELECT * FROM ias_stories WHERE id=?', story.id)));
});

route('POST', '/api/interactive-stories/:id/publish', 'admin', ({ params, user, req }) => {
  requireAdmin(user);
  const story = iasAccess(params.id, user);
  run("UPDATE ias_stories SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?", story.id);
  logActivity(user, 'publish_interactive_story', 'story', story.id, {}, req);
  return ok(iasDetail(get('SELECT * FROM ias_stories WHERE id=?', story.id)));
});

route('DELETE', '/api/interactive-stories/:id', 'admin', ({ params, user, req }) => {
  requireAdmin(user);
  const story = iasAccess(params.id, user);
  run('DELETE FROM ias_stories WHERE id=?', story.id);
  logActivity(user, 'delete_interactive_story', 'story', story.id, {}, req);
  return ok({ deleted: true });
});

export { routes };
