import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = process.argv[2] ? resolve(process.argv[2]) : join(PROJECT, 'docs/story-library-starter-pack');
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BASE = 'http://localhost:3000';
const { extractDocument } = await import(pathToFileURL(join(PROJECT, 'server/documents.js')).href);

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

function parseStory(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const lines = text.split('\n').map((l) => l.trim());
  const title = lines[0] || blocks[0].split('\n')[0].trim();
  const gradeLine = lines.find((b) => b.startsWith('Grade level:')) || '';
  const grade = (gradeLine.match(/Grade level:\s*(.*?)\s+Subject:/) || [])[1] || '';
  const subject = (gradeLine.match(/Subject:\s*(.*)/) || [])[1] || '';
  const langLine = lines.find((b) => b.startsWith('Language:')) || '';
  const language = (langLine.match(/Language:\s*(.*?)\s+Category:/) || [])[1] || 'English';
  const sourceCategory = (langLine.match(/Category:\s*(.*)/) || [])[1] || '';
  const objective = (blocks.find((b) => b.startsWith('Learning Objective')) || '').split('\n').slice(1).join(' ').trim();
  const storyStart = blocks.findIndex((b) => b === 'Story');
  const vocabIndex = blocks.findIndex((b) => b.startsWith('Vocabulary Builder'));
  const compIndex = blocks.findIndex((b) => b.startsWith('Reading Comprehension'));
  const sections = blocks.slice(storyStart + 1, vocabIndex).map((block, i) => {
    const lines = block.split('\n');
    return { title: lines[0].trim(), text: lines.slice(1).join('\n').trim(), section_number: i + 1 };
  });
  const vocabulary = (blocks[vocabIndex] || '').split('\n').slice(1).filter(Boolean).map((line) => {
    const at = line.indexOf(':');
    return { term: line.slice(0, at).trim(), definition: line.slice(at + 1).trim() };
  }).filter((v) => v.term);
  const comprehension = [];
  let current = null;
  for (const line of (blocks[compIndex] || '').split('\n').slice(1).filter(Boolean)) {
    const promptMatch = /^\d+\.\s*(.*)/.exec(line);
    if (promptMatch) { current = { prompt: promptMatch[1].trim(), choices: [] }; continue; }
    const answerMatch = /^Answer:\s*(.*)/.exec(line);
    if (answerMatch && current) {
      const answer = answerMatch[1].trim();
      const proof = sections.map((s) => s.text).join('\n').split(/(?<=[.!?])\s+/)
        .find((sentence) => sentence.toLowerCase().includes(answer.toLowerCase().replace(/^the\s+/, '').slice(0, 30))) || '';
      comprehension.push({ ...current, answer, explanation: 'Answer key from the original manuscript.', source_quote: proof.slice(0, 1000) });
      current = null;
    }
  }
  return { title, grade, subject, language, sourceCategory, objective, sections, vocabulary, comprehension };
}

const CATEGORY_MAP = {
  'Science and Nature': 'Science and Nature',
  'Honesty': 'Values Education',
  'Health and Safety': 'Health and Safety',
  'Water Cycle': 'Science and Nature',
  'Counting and Addition': 'Mathematics',
  'Bayanihan and Community': 'Philippine Culture and History',
  'Fractions': 'Mathematics',
  'Road Safety': 'Health and Safety',
  'Reading Comprehension': 'Reading Comprehension',
  'Environmental Education': 'Environmental Education'
};
const EMOJI = {
  '01_the_journey_of_a_little_seed.docx': '🌱',
  '02_the_lost_wallet.docx': '🧾',
  '03_the_adventure_of_clean_hands.docx': '🧼',
  "04_the_water_drop_s_big_trip.docx": '💧',
  '05_mia_s_first_market_day.docx': '🛒',
  '06_the_bayanihan_garden.docx': '🤝',
  '07_the_pizza_party_sharing_fairly.docx': '🍕',
  '08_the_safe_way_to_school.docx': '🚦',
  '09_the_missing_puppy.docx': '🐶',
  '10_the_children_who_saved_the_river.docx': '🌊'
};
const readingLevel = (grade) => /Grade\s*[45]|Grade\s*6|4–6|3–5/.test(grade) ? 'Intermediate' : 'Beginner';

let token;
for (let attempt = 0; attempt < 20; attempt++) {
  try { token = (await call('/api/auth/login', { method: 'POST', body: { username: 'teacher@eduplay.ph', password: 'Teacher123!' } })).token; break; }
  catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
}
if (!token) throw new Error('Could not sign in.');
const existing = await call('/api/stories', { token });
const existingByTitle = new Map(existing.map((s) => [s.title, s]));
const existingMaterials = await call('/api/materials', { token });
const materialByTitle = new Map(existingMaterials.map((m) => [m.title, m]));
const files = readdirSync(PACK).filter((name) => /^\d\d_.*\.docx$/.test(name)).sort();

for (const fileName of files) {
  const bytes = readFileSync(join(PACK, fileName));
  const parsed = parseStory((await extractDocument({
    fileName, dataUrl: `data:${MIME};base64,${bytes.toString('base64')}`, mime: MIME
  })).text);
  const category = CATEGORY_MAP[parsed.sourceCategory] || parsed.sourceCategory || 'Short Stories';
  const topic = parsed.sourceCategory;
  const level = readingLevel(parsed.grade);
  const materialMeta = {
    title: parsed.title, description: `Original sample manuscript: ${parsed.objective}`,
    grade_level: parsed.grade, subject: parsed.subject, topic, language: parsed.language,
    reading_level: level, objectives: [parsed.objective], file_size: bytes.length
  };
  let material = materialByTitle.get(parsed.title);
  if (material) {
    material = await call(`/api/materials/${material.id}`, { method: 'PUT', token, body: materialMeta });
  } else {
    material = await call('/api/materials', {
      method: 'POST', token,
      body: { dataUrl: `data:${MIME};base64,${bytes.toString('base64')}`, fileName, mime: MIME, ...materialMeta }
    });
    materialByTitle.set(parsed.title, material);
  }
  const storyBody = {
    title: parsed.title, category, grade_level: parsed.grade, subject: parsed.subject,
    language: parsed.language, topic, reading_level: level,
    description: `Original sample story from the EduPlay Story Library Starter Pack. ${parsed.objective}`,
    cover_emoji: EMOJI[fileName] || '📖',
    source_material_id: material.id,
    source_note: 'Original sample manuscript supplied by the teacher in the EduPlay Story Library Starter Pack. Teacher review required.',
    status: 'draft',
    objectives: [parsed.objective],
    sections: parsed.sections,
    vocabulary: parsed.vocabulary,
    comprehension: parsed.comprehension
  };
  const existingStory = existingByTitle.get(parsed.title);
  const story = existingStory
    ? await call(`/api/stories/${existingStory.id}`, { method: 'PUT', token, body: storyBody })
    : await call('/api/stories', { method: 'POST', token, body: storyBody });
  await call(`/api/stories/${story.id}/analyze`, { method: 'POST', token, body: {} });
  console.log(`${existingStory ? 'UPDATED' : 'IMPORTED'} ${parsed.title} -> material ${material.id}, story ${story.id}, grade=${parsed.grade}, category=${category}, sections=${parsed.sections.length}, vocab=${parsed.vocabulary.length}, questions=${parsed.comprehension.length}`);
}
console.log('DONE');
