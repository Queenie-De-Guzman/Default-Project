// EduPlay source-grounded content analysis.
// Offline by default: every draft is derived from sentences that actually appear in the
// uploaded text. If EDUPLAY_AI_URL, EDUPLAY_AI_KEY and EDUPLAY_AI_MODEL are all set, an
// OpenAI-compatible chat endpoint is tried and its JSON is merged only when it is valid.
// Generated content is ALWAYS a teacher-reviewable draft — never published automatically.
// No dependencies, no random numbers: identical input produces identical output.

const GENERIC_TITLES = new Set([
  'untitled', 'document', 'lesson', 'story', 'text', 'chapter', 'draft', 'upload',
  'sample', 'new document', 'content', 'analysis', 'page', 'file'
]);

const STOPWORDS = new Set([
  // English function words
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'than', 'so', 'because', 'of', 'in', 'on',
  'at', 'by', 'for', 'with', 'without', 'from', 'to', 'into', 'onto', 'over', 'under',
  'about', 'above', 'below', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'am', 'do', 'does', 'did', 'done', 'have', 'has', 'had', 'will', 'would', 'can',
  'could', 'shall', 'should', 'may', 'might', 'must', 'not', 'no', 'nor', 'yes', 'this',
  'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them', 'him', 'her',
  'his', 'their', 'our', 'your', 'my', 'me', 'we', 'you', 'who', 'whom', 'whose',
  'which', 'what', 'when', 'where', 'why', 'how', 'there', 'here', 'very', 'just',
  'also', 'too', 'only', 'more', 'most', 'some', 'any', 'all', 'each', 'every',
  'many', 'much', 'few', 'other', 'another', 'same', 'such', 'own', 'one', 'two',
  'three', 'up', 'down', 'out', 'off', 'after', 'before', 'during', 'while', 'again',
  'once', 'still', 'even', 'ever', 'never', 'always', 'often', 'sometimes', 'maybe',
  'perhaps', 'now', 'get', 'got', 'make', 'made', 'go', 'went', 'come', 'came', 'say',
  'said', 'says', 'see', 'saw', 'know', 'knew', 'think', 'thought', 'use', 'used',
  'using', 'like', 'really', 'well', 'grade', 'level', 'lesson', 'chapter', 'page',
  'unit', 'section', 'title', 'name',
  // Filipino function words
  'ang', 'ng', 'sa', 'ay', 'na', 'at', 'mga', 'ba', 'kasi', 'kaya', 'pero', 'kapag',
  'kung', 'pag', 'para', 'tungkol', 'ni', 'nina', 'kay', 'kina', 'ko', 'ka', 'mo',
  'niya', 'nito', 'sila', 'siya', 'kami', 'tayo', 'kayo', 'ako', 'ikaw', 'ito',
  'iyan', 'iyon', 'dito', 'diyan', 'doon', 'hindi', 'oo', 'pa', 'lang', 'din', 'daw',
  'raw', 'po', 'nung', 'noong', 'tapos', 'dun', 'kanya', 'kanila', 'namin', 'ninyo',
  'yung', 'yun', 'ating', 'nating'
]);

const SUBJECT_RULES = [
  ['Mathematics', ['mathematics', 'math', 'fraction', 'numerator', 'denominator',
    'number', 'numbers', 'add', 'added', 'addition', 'subtract', 'multiply',
    'division', 'divide', 'geometry', 'angle', 'equation', 'measure', 'percent',
    'ratio', 'sum', 'product', 'integer', 'algebra']],
  ['Science', ['science', 'scientific', 'atom', 'cell', 'plant', 'plants', 'animal',
    'animals', 'water cycle', 'photosynthesis', 'energy', 'force', 'motion',
    'planet', 'experiment', 'observation', 'hypothesis', 'ecosystem', 'matter',
    'organism', 'chemical', 'weather', 'solar', 'temperature', 'gravity']],
  ['English', ['english', 'poem', 'poetry', 'story', 'sentence', 'paragraph',
    'grammar', 'noun', 'verb', 'adjective', 'author', 'character', 'fiction',
    'vocabulary', 'comprehension', 'reading', 'literature', 'dialogue']],
  ['Filipino', ['filipino', 'tagalog', 'wika', 'pamilya', 'pagbasa', 'kaisipan',
    'salita', 'pangungusap', 'tula', 'kwento', 'kuwento', 'bayan', 'panitikan',
    'gramatika']],
  ['Social Studies', ['social studies', 'history', 'historical', 'community', 'map',
    'country', 'government', 'culture', 'society', 'city', 'province', 'economy',
    'citizen', 'barangay', 'nation', 'leader', 'tradition', 'geography']],
  ['Values Education', ['values education', 'values', 'respect', 'honesty',
    'responsible', 'responsibility', 'kindness', 'cooperation', 'teamwork',
    'good manners', 'integrity', 'empathy', 'friendship', 'discipline', 'helpful',
    'sharing', 'courtesy']]
];

const SAMPLE_COMPETENCIES = {
  reading: {
    title: 'Reading comprehension',
    description: 'Sample competency (unverified): identifies main ideas and supporting details in a text.'
  },
  vocabulary: {
    title: 'Vocabulary development',
    description: 'Sample competency (unverified): works out word meaning from the sentence it appears in.'
  },
  number: {
    title: 'Number sense',
    description: 'Sample competency (unverified): describes and compares quantities using numbers.'
  },
  science: {
    title: 'Scientific inquiry',
    description: 'Sample competency (unverified): observes, questions, and explains using evidence from a text.'
  },
  filipino: {
    title: 'Pagbasa at pag-unawa',
    description: 'Halimbawang kakayahan (hindi pa nasusuri): nakikilala ang pangunahing kaisipan at mga detalye sa teksto.'
  }
};

const GAME_TITLES = {
  multiple_choice: 'Multiple Choice',
  matching: 'Matching Game',
  fill_blank: 'Fill in the Blanks',
  wordsearch: 'Word Search',
  sequencing: 'Story Sequencing',
  true_false: 'True or False'
};

const NEUTRAL_DISTRACTORS = [
  'Not mentioned in the text',
  'Cannot be determined from the text',
  'Not stated in the source',
  'Not described in the passage',
  'No detail given in the text'
];

const SHORT_SOURCE_FLAG = 'Source is too short for reliable comprehension questions.';
const TOPIC_FLAG = 'No clear topic found; teacher should confirm the topic.';
const PRONOUN_FLAG = 'Some sentences contain unnamed characters or pronouns; confirm answers before publishing.';
const OCR_FLAG = 'OCR was needed; verify extracted words.';

const BASE_WARNINGS = [
  'Generated content is a draft only — verify every answer, definition, and explanation against the uploaded text before publishing.',
  'Competency entries are labelled samples with no official code; EduPlay does not claim official DepEd alignment.',
  'Questions were derived only from sentences found in the source; confirm any inference with the teacher.'
];

// ───────────────────────────── Text utilities ─────────────────────────────

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWord(word) {
  return String(word ?? '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function tokenize(text) {
  return (String(text ?? '').match(/[\p{L}\p{N}']+/gu) || [])
    .map((word) => normalizeWord(word)).filter(Boolean);
}

function isMeaningful(word, minLength = 4) {
  const value = normalizeWord(word);
  if (value.length < minLength || STOPWORDS.has(value)) return false;
  if (/^\d+$/.test(value)) return false;
  if (/^(.)\1+$/.test(value)) return false;
  return true;
}

function splitOnPunctuation(line) {
  // English terminators plus Filipino usage (!, ?, ...) and full-width variants.
  try {
    return String(line).split(/(?<=[.!?…！？])\s+/u);
  } catch {
    return String(line).replace(/([.!?…！？])(\s+)/gu, '$1\u0001').split('\u0001');
  }
}

function splitSentences(raw) {
  const lines = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((line) => line.replace(/[\t\u00a0]+/g, ' ').trim())
    .filter(Boolean);
  const sentences = [];
  for (const line of lines) {
    for (const part of splitOnPunctuation(line)) {
      const sentence = part.replace(/\s+/g, ' ').trim();
      if (sentence) sentences.push(sentence);
    }
  }
  return sentences;
}

function cleanLabel(value) {
  return String(value ?? '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MINOR_WORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'ng', 'sa', 'ay', 'na']);

function titleCase(value) {
  return String(value ?? '').split(/\s+/).filter(Boolean)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase();
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      return word.charAt(0).toLocaleUpperCase() + word.slice(1);
    })
    .join(' ');
}

function dedupeByLower(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const value = String(item ?? '').trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function tokenInfo(text) {
  const words = tokenize(text);
  const counts = new Map();
  const firstIndex = new Map();
  const capitalized = new Set();
  for (const match of String(text ?? '').match(/\b[\p{Lu}][\p{Ll}\p{N}'-]{2,}\b/gu) || []) {
    capitalized.add(match.toLocaleLowerCase());
  }
  words.forEach((word, index) => {
    if (!isMeaningful(word, 3)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
    if (!firstIndex.has(word)) firstIndex.set(word, index);
  });
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count, firstIndex: firstIndex.get(term), capitalized: capitalized.has(term) }))
    .sort((a, b) => b.count - a.count
      || Number(b.capitalized) - Number(a.capitalized)
      || a.firstIndex - b.firstIndex
      || a.term.localeCompare(b.term));
}

function pickTopic(titleValue, normalizedText, ranked, flags) {
  const supplied = cleanLabel(titleValue);
  const isGeneric = GENERIC_TITLES.has(supplied.toLocaleLowerCase());
  const hasContent = tokenize(supplied).some((word) => !STOPWORDS.has(word));
  if (supplied && !isGeneric && hasContent) return titleCase(supplied);
  if (ranked.length) return titleCase(ranked[0].term);
  flags.add(TOPIC_FLAG);
  if (!normalizedText) flags.add('No source text was provided; add uploaded text before publishing generated content.');
  return 'Unclear topic from source';
}

function romanToNumber(value) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const upper = String(value || '').toUpperCase();
  if (!/^[IVXLCDM]+$/.test(upper)) return 0;
  let total = 0;
  for (let i = 0; i < upper.length; i += 1) {
    const current = map[upper[i]];
    const next = map[upper[i + 1]] || 0;
    total += current < next ? -current : current;
  }
  return total;
}

function inferGrade(titleValue, gradeValue, normalizedText, sentences, wordCount, flags) {
  const head = sentences.slice(0, 3).join(' ');
  const combined = `${gradeValue || ''} ${titleValue || ''} ${head} ${normalizedText.slice(0, 600)}`;
  const match = combined.match(/\bgrade\s*[-:]?\s*(\d{1,2}|[IVXLCDM]{1,4})\b/i);
  if (match) {
    const number = /\d/.test(match[1]) ? parseInt(match[1], 10) : romanToNumber(match[1]);
    if (number >= 1 && number <= 12) return { grade: `Grade ${number}`, explicit: true };
  }
  if (!wordCount) {
    flags.add('No grade level was stated; teacher should confirm the suggested grade.');
    return { grade: 'Grade 4', explicit: false };
  }
  const letters = (normalizedText.match(/[\p{L}]/gu) || []).length;
  const averageWords = wordCount / Math.max(1, sentences.length);
  const averageLength = letters / wordCount;
  const score = averageWords + (averageLength - 4) * 2;
  const grade = score < 8 ? 2 : score < 11 ? 3 : score < 14 ? 4 : score < 17 ? 5
    : score < 20 ? 6 : score < 24 ? 7 : 8;
  return { grade: `Grade ${grade}`, explicit: false };
}

function inferSubject(titleValue, subjectValue, languageValue, normalizedText) {
  const supplied = String(subjectValue || '').toLocaleLowerCase();
  const language = String(languageValue || '').toLocaleLowerCase();
  const combined = `${titleValue || ''} ${supplied} ${language} ${normalizedText}`.toLocaleLowerCase();
  const scores = new Map(SUBJECT_RULES.map(([name]) => [name, 0]));

  for (const [name, keywords] of SUBJECT_RULES) {
    for (const keyword of keywords) {
      const expression = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(keyword)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
      if (expression.test(combined)) scores.set(name, scores.get(name) + 1);
    }
  }
  if (/math\b|mathematics/i.test(supplied)) scores.set('Mathematics', scores.get('Mathematics') + 3);
  if (/scien/i.test(supplied)) scores.set('Science', scores.get('Science') + 3);
  if (/english/i.test(supplied)) scores.set('English', scores.get('English') + 3);
  if (/filipino|tagalog/i.test(supplied) || /filipino|tagalog/i.test(language)) {
    scores.set('Filipino', scores.get('Filipino') + 3);
  }
  if (/social|history/i.test(supplied)) scores.set('Social Studies', scores.get('Social Studies') + 3);
  if (/values|edu(kasyon)? sa pagkatao/i.test(supplied)) scores.set('Values Education', scores.get('Values Education') + 3);
  if (/once upon|narrator|story|kwento|kuwento/i.test(`${titleValue || ''} ${normalizedText.slice(0, 300)}`)) {
    scores.set('English', scores.get('English') + 1);
  }

  let best = 'General';
  let bestScore = 0;
  for (const [name, score] of scores) {
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return bestScore ? best : 'General';
}

function sampleCompetencies(subject, language, vocabularyCount) {
  let keys;
  if (subject === 'Filipino' || /filipino|tagalog/i.test(language || '')) keys = ['filipino', 'vocabulary'];
  else if (subject === 'Mathematics') keys = ['number', 'reading'];
  else if (subject === 'Science') keys = ['science', 'reading', 'vocabulary'];
  else keys = ['reading', 'vocabulary'];

  return keys.filter((key, index) => key !== 'vocabulary' || vocabularyCount > 0 || index === 0)
    .map((key) => ({
      ...SAMPLE_COMPETENCIES[key],
      reason: `Sample only — suggested because the source ${key === 'number' ? 'contains numerical or quantity language' : key === 'science' ? 'contains observation or explanation language' : key === 'filipino' ? 'appears to be in Filipino and contains reading details' : key === 'vocabulary' ? 'contains reusable key terms' : 'contains sentences with details to comprehend'}; verify against your own official DepEd document. No official code is supplied.`,
      curriculum: 'DepEd MATATAG',
      verified: false,
      code: null
    }));
}

function hasPronouns(text) {
  return /\b(he|she|they|him|her|them|his|its|it|siya|sila|niya|kanya|ito|iyan|iyon|kami|tayo)\b/iu.test(text || '');
}

function hasOCRNoise(text) {
  return /[\uFFFD\uFFFC¬ﬁﬂﬀ]|\[\s*(illegible|unreadable)\s*\]|\bocr\b/iu.test(text || '');
}

function findTermMatch(sentence, term) {
  const expression = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(term)})(?=$|[^\\p{L}\\p{N}])`, 'iu');
  const match = String(sentence).match(expression);
  return match ? { matched: match[2], expression } : null;
}

function sentenceWithTerm(sentences, term) {
  for (const sentence of sentences) {
    const found = findTermMatch(sentence, term);
    if (found) return { sentence, ...found };
  }
  return null;
}

function definitionCue(sentence) {
  return /\b(means?|meaning|defined as|refers to|ay|ibig sabihin|kahulugan|tinatawag)\b/iu.test(sentence);
}

function buildVocabulary(sentences, ranked) {
  const candidates = ranked.filter((item) => isMeaningful(item.term, 4)).slice(0, 8);
  const vocabulary = [];
  for (const candidate of candidates) {
    const hit = sentenceWithTerm(sentences, candidate.term);
    if (!hit) continue;
    const uses = sentences.filter((sentence) => findTermMatch(sentence, candidate.term)).length;
    let definition = hit.sentence;
    if (hit.sentence.length > 180) {
      const clause = hit.sentence.split(/[,;:—–]/u)
        .map((part) => part.trim())
        .find((part) => new RegExp(escapeRegExp(candidate.term), 'iu').test(part) && part.length >= 20);
      definition = clause || hit.sentence.slice(0, 180);
    }
    vocabulary.push({
      term: candidate.term,
      definition,
      sourceQuote: hit.sentence,
      reviewNeeded: !definitionCue(hit.sentence) || uses > 1 || hasPronouns(hit.sentence)
    });
  }
  return vocabulary;
}

function placeChoices(distractors, correct, index) {
  const options = [];
  let cursor = 0;
  for (let i = 0; i < 4; i += 1) {
    if (i === index) options.push({ text: String(correct), is_correct: true });
    else options.push({ text: distractors[cursor++], is_correct: false });
  }
  return options;
}

function makeChoices(correct, distractors, position) {
  const cleanCorrect = String(correct ?? '');
  const pool = dedupeByLower(distractors)
    .filter((item) => item.toLocaleLowerCase() !== cleanCorrect.toLocaleLowerCase());
  let fillerIndex = 0;
  while (pool.length < 3 && fillerIndex < NEUTRAL_DISTRACTORS.length) {
    pool.push(NEUTRAL_DISTRACTORS[fillerIndex++]);
  }
  return placeChoices(pool.slice(0, 3), cleanCorrect, position % 4);
}

function buildComprehension(sentences, vocabulary, ranked) {
  const items = [];
  const usable = ranked.filter((item) => isMeaningful(item.term, 4)).map((item) => item.term);
  const termPool = dedupeByLower([...vocabulary.map((entry) => entry.term), ...usable]);
  const allSentences = dedupeByLower(sentences);
  const target = Math.min(6, Math.max(4, Math.min(sentences.length * 2, 6)));
  let clozeIndex = 0;
  let detailIndex = 0;

  for (let i = 0; i < target; i += 1) {
    const doCloze = i % 2 === 0;
    const term = termPool[clozeIndex % Math.max(1, termPool.length)];
    const hit = term ? sentenceWithTerm(sentences, term) : null;
    const sentence = sentences[detailIndex % Math.max(1, sentences.length)];

    if (doCloze && hit && sentences.length) {
      clozeIndex += 1;
      const cloze = hit.sentence.replace(hit.expression, (_full, prefix) => `${prefix}_______`);
      const uses = sentences.filter((entry) => findTermMatch(entry, term)).length;
      items.push({
        prompt: `Complete this sentence from the text: "${cloze}"`,
        answer: hit.matched,
        choices: makeChoices(hit.matched, termPool.filter((value) => value !== term), items.length),
        explanation: `The source sentence is: "${hit.sentence}"`,
        sourceQuote: hit.sentence,
        reviewNeeded: uses > 1 || hasPronouns(hit.sentence)
      });
    } else if (sentence) {
      detailIndex += 1;
      const distractors = allSentences.filter((entry) => entry.toLocaleLowerCase() !== sentence.toLocaleLowerCase());
      items.push({
        prompt: 'According to the text, which statement is correct?',
        answer: sentence,
        choices: makeChoices(sentence, distractors, items.length),
        explanation: `The source sentence is: "${sentence}". Other options come from different sentences in the same text, so confirm the intended detail.`,
        sourceQuote: sentence,
        reviewNeeded: true
      });
    }
  }
  return items;
}

function buildObjectives(topic, vocabulary, sections) {
  const label = topic === 'Unclear topic from source' ? 'the provided text' : topic.toLocaleLowerCase();
  const terms = vocabulary.slice(0, 3).map((entry) => entry.term);
  const sectionNames = sections.slice(0, 2).map((section) => section.title);
  const objectives = [
    `Identify the main ideas about ${label} in the text.`,
    terms.length >= 2
      ? `Explain the relationship between ${terms[0]} and ${terms[1]} using only the text.`
      : 'Retell the key details from the text in the order given.'
  ];
  objectives.push(terms.length
    ? `Define ${terms.slice(0, 3).join(', ')} as they are used in the text.`
    : 'Locate and copy the key sentences from the text.');
  objectives.push(sectionNames.length
    ? `Summarize ${sectionNames.join(' and ')} using sentences from the source.`
    : `Answer questions about ${label} using evidence quoted from the source.`);
  return objectives.slice(0, 4);
}

function normalizeSections(sectionsValue) {
  if (!Array.isArray(sectionsValue)) return [];
  return sectionsValue.map((section, index) => {
    if (typeof section === 'string') return { title: `Section ${index + 1}`, text: section };
    const value = section && typeof section === 'object' ? section : {};
    const rawTitle = cleanLabel(value.title || value.heading || '');
    return {
      title: rawTitle || `Section ${index + 1}`,
      text: String(value.text ?? value.content ?? value.body ?? value.summary ?? '')
    };
  });
}

function buildSections(sectionsValue) {
  return normalizeSections(sectionsValue).map((section) => {
    const sentences = splitSentences(section.text);
    const summary = sentences.slice(0, 2).join(' ').slice(0, 320);
    const keyTerms = tokenInfo(section.text)
      .filter((item) => isMeaningful(item.term, 4))
      .slice(0, 5)
      .map((item) => item.term);
    return { title: section.title, summary, keyTerms };
  });
}

function recommendGames({ sentences, vocabulary, topic, subject, ranked }) {
  const storyLike = /story|tale|once upon|character|narrator|history|first|then|next|finally|kwento|kuwento|noong unang panahon/i
    .test(`${topic || ''} ${subject || ''} ${sentences.slice(0, 5).join(' ')}`);
  const distinct = ranked.length;
  const vocabularyHeavy = vocabulary.length >= 5 || (sentences.length > 0 && distinct / Math.max(1, sentences.length) >= 2);
  const games = [
    {
      type: 'multiple_choice', title: GAME_TITLES.multiple_choice,
      reason: 'Checks understanding of details that are stated directly in the uploaded text.'
    },
    {
      type: 'matching', title: GAME_TITLES.matching,
      reason: 'Links each key term to the sentence in which the source uses it.'
    },
    {
      type: 'fill_blank', title: GAME_TITLES.fill_blank,
      reason: 'Reuses exact sentences from the text as cloze items.'
    }
  ];
  if (storyLike) {
    games.push({
      type: 'sequencing', title: GAME_TITLES.sequencing,
      reason: 'Orders sentences that already appear in the source, which suits a story or historical account.'
    });
  } else if (vocabularyHeavy) {
    games.push({
      type: 'wordsearch', title: GAME_TITLES.wordsearch,
      reason: 'Reinforces the vocabulary that appears repeatedly in the source.'
    });
  } else {
    games.push({
      type: 'wordsearch', title: GAME_TITLES.wordsearch,
      reason: 'Practises the key terms taken from the source sentences.'
    });
  }
  return games;
}

function questionMetadata(sourceQuote, needsReview, sourceType, extra = {}) {
  return { sourceQuote: String(sourceQuote || ''), needsReview: Boolean(needsReview), sourceType, ...extra };
}

function buildGameDrafts({ topic, sentences, vocabulary, comprehension, ranked, questionCount = 0 }) {
  const drafts = [];
  const label = topic === 'Unclear topic from source' ? 'the source text' : topic;
  const enough = sentences.length >= 3 && vocabulary.length >= 3;
  const clozeItems = comprehension.filter((item) => item.prompt.includes('_______'));
  const termPool = dedupeByLower([...vocabulary.map((entry) => entry.term), ...ranked.map((item) => item.term)]);

  if (comprehension.length) {
    drafts.push({
      type: 'multiple_choice',
      title: `${GAME_TITLES.multiple_choice} — ${label}`,
      description: `Multiple-choice draft using details and terms found in ${label}. Review before publishing.`,
      config: {},
      questions: comprehension.map((item) => ({
        prompt: item.prompt,
        explanation: item.explanation,
        metadata: questionMetadata(item.sourceQuote, item.reviewNeeded, 'source_sentence'),
        choices: item.choices.map((choice) => ({ text: choice.text, is_correct: choice.is_correct }))
      }))
    });
  }

  if (vocabulary.length >= 2) {
    drafts.push({
      type: 'matching',
      title: `${GAME_TITLES.matching} — ${label}`,
      description: `Matching draft that pairs each source term with its own sentence from ${label}.`,
      config: {},
      questions: vocabulary.map((entry) => ({
        prompt: `Match the term: ${entry.term}`,
        explanation: `Source sentence: "${entry.sourceQuote}"`,
        metadata: questionMetadata(entry.sourceQuote, entry.reviewNeeded, 'source_term', {
          left: entry.term, right: entry.definition
        }),
        choices: [{ text: entry.definition, is_correct: true }]
      }))
    });
  }

  if (vocabulary.length >= 3) {
    drafts.push({
      type: 'wordsearch',
      title: `${GAME_TITLES.wordsearch} — ${label}`,
      description: `Word search draft using words copied from ${label}.`,
      config: {},
      questions: vocabulary.map((entry) => ({
        prompt: `Find the word used in this sentence from the text: "${entry.sourceQuote}"`,
        explanation: `The word in the source sentence is ${entry.term}.`,
        metadata: questionMetadata(entry.sourceQuote, entry.reviewNeeded, 'source_term', {
          word: entry.term.toLocaleUpperCase()
        }),
        choices: [{ text: entry.term.toLocaleUpperCase(), is_correct: true }]
      }))
    });
  }

  if (sentences.length >= 2) {
    drafts.push({
      type: 'sequencing',
      title: `${GAME_TITLES.sequencing} — ${label}`,
      description: `Sequencing draft that keeps the first sentences of ${label} in their original order.`,
      config: {},
      questions: sentences.slice(0, 6).map((sentence, index) => ({
        prompt: sentence,
        explanation: `This is sentence ${index + 1} from the source text.`,
        metadata: questionMetadata(sentence, hasPronouns(sentence), 'source_sentence', { order: index + 1 }),
        choices: []
      }))
    });
  }

  if (clozeItems.length) {
    drafts.push({
      type: 'fill_blank',
      title: `${GAME_TITLES.fill_blank} — ${label}`,
      description: `Cloze draft built from sentences and terms in ${label}.`,
      config: {},
      questions: clozeItems.map((item) => ({
        prompt: item.prompt,
        explanation: item.explanation,
        metadata: questionMetadata(item.sourceQuote, item.reviewNeeded, 'cloze'),
        choices: item.choices.map((choice) => ({ text: choice.text, is_correct: choice.is_correct }))
      }))
    });
  }

  if (enough && sentences.length >= 2) {
    const trueFalse = sentences.slice(0, 5).map((sentence, index) => {
      const term = vocabulary.find((entry) => findTermMatch(sentence, entry.term));
      const truth = index % 2 === 0;
      const replacement = term && !truth
        ? termPool.find((value) => value.toLocaleLowerCase() !== term.term.toLocaleLowerCase())
        : null;
      const changed = term && replacement ? sentence.replace(findTermMatch(sentence, term.term).expression, (_full, prefix) => `${prefix}${replacement}`) : null;
      const prompt = !truth && changed ? changed : sentence;
      return {
        prompt,
        explanation: !truth && changed
          ? `False — the text states: "${sentence}"`
          : `True — the text states: "${sentence}"`,
        metadata: questionMetadata(sentence, true, 'source_sentence'),
        choices: [
          { text: 'True', is_correct: truth },
          { text: 'False', is_correct: !truth }
        ]
      };
    }).filter((question) => question.prompt);
    if (trueFalse.length) {
      drafts.push({
        type: 'true_false',
        title: `${GAME_TITLES.true_false} — ${label}`,
        description: `True/false draft whose explanations quote ${label}.`,
        config: {},
        questions: trueFalse
      });
    }
  }
  if (questionCount > 0) {
    for (const draft of drafts) draft.questions = draft.questions.slice(0, questionCount);
  }
  return drafts;
}

// A teacher-facing guide built only from sentences that occur in the source.
function buildTeacherGuide({ topic, sentences, objectives, vocabulary, flags }) {
  const label = topic === 'Unclear topic from source' ? 'the provided text' : topic;
  const terms = vocabulary.slice(0, 3).map((entry) => entry.term);
  const themeUnclear = topic === 'Unclear topic from source' || !sentences.length;
  const openers = [
    `Why does the text say ${label} matters? Support your answer with a source sentence.`,
    `Which detail from the text best explains ${label}?`,
    `How would you retell ${label} to a classmate using only the text?`,
    `Which word from the text changes how you understand ${label}?`,
    `What would you ask the author about ${label}?`
  ];
  const count = Math.min(5, Math.max(3, sentences.length || 3));
  const discussionQuestions = Array.from({ length: count }, (_, index) => {
    const sourceQuote = sentences[index % Math.max(1, sentences.length)] || '';
    return {
      prompt: openers[index % openers.length],
      sourceQuote,
      needsReview: !sourceQuote || hasPronouns(sourceQuote) || flags.has(SHORT_SOURCE_FLAG)
    };
  });
  const classroomActivities = [
    `Sequence the events in ${label} using sentences copied from the source.`,
    `Act out the scene from ${label} and quote the sentence that guided you.`,
    `Make a vocabulary word wall for ${label} using: ${terms.join(', ') || 'terms from the text'}.`,
    `In pairs, summarize ${label} in three sentences taken from the text.`
  ];
  const takeawaySentence = sentences.find((sentence) => sentence.length >= 40 && sentence.length <= 240) || sentences[0] || '';
  const keyTakeaway = themeUnclear
    ? 'The main idea is not clear from the available source; confirm it with the teacher before use.'
    : (takeawaySentence.length > 240 ? `${takeawaySentence.slice(0, 237)}…` : takeawaySentence);
  const needsReview = themeUnclear || flags.size > 0 || !objectives.length
    || discussionQuestions.some((question) => question.needsReview);
  return {
    objectives: [...objectives],
    discussionQuestions,
    classroomActivities,
    keyTakeaway,
    needsReview
  };
}

// ───────────────────────────── Public: offline analysis ─────────────────────────────

export function analyzeContent({
  text = '', sections = [], title = '', gradeLevel = '', subject = '', language = '',
  questionCount = 0, keyFacts = []
} = {}) {
  const flags = new Set();
  const normalizedText = String(text ?? '').replace(/\s+/g, ' ').trim();
  const sentences = splitSentences(text);
  const wordCount = (normalizedText.match(/[\p{L}\p{N}']+/gu) || []).length;
  const ranked = tokenInfo(normalizedText);

  const topic = pickTopic(title, normalizedText, ranked, flags);
  const grade = inferGrade(title, gradeLevel, normalizedText, sentences, wordCount, flags);
  if (!grade.explicit && !String(gradeLevel || '').trim() && wordCount && sentences.length) {
    flags.add('No grade level was stated; teacher should confirm the suggested grade.');
  }
  const suggestedSubject = inferSubject(title, subject, language, normalizedText);
  const vocabulary = buildVocabulary(sentences, ranked);
  const requestedCount = Math.max(0, Number(questionCount) || 0);
  const allComprehension = buildComprehension(sentences, vocabulary, ranked);
  const comprehension = requestedCount > 0 ? allComprehension.slice(0, requestedCount) : allComprehension;
  const analyzedSections = buildSections(sections);
  const objectives = buildObjectives(topic, vocabulary, analyzedSections);

  if (wordCount < 40 || sentences.length < 3) flags.add(SHORT_SOURCE_FLAG);
  if (hasPronouns(normalizedText)) flags.add(PRONOUN_FLAG);
  if (hasOCRNoise(normalizedText)) flags.add(OCR_FLAG);

  // keyFacts are never invented: only strings found verbatim in source sentences survive.
  const factCandidates = Array.isArray(keyFacts) && keyFacts.length
    ? keyFacts.filter((fact) => typeof fact === 'string' && fact.trim()).map((fact) => fact.trim())
    : sentences.slice(0, 8);
  const groundedKeyFacts = dedupeByLower(factCandidates.filter((fact) => {
    const lower = fact.toLocaleLowerCase();
    return sentences.some((sentence) => {
      const candidate = sentence.toLocaleLowerCase();
      return candidate === lower || candidate.includes(lower);
    });
  })).slice(0, 8);
  const teacherGuide = buildTeacherGuide({ topic, sentences, objectives, vocabulary, flags });

  return {
    source: {
      title: String(title ?? ''),
      gradeLevel: String(gradeLevel ?? ''),
      subject: String(subject ?? ''),
      language: String(language ?? ''),
      wordCount,
      sectionCount: normalizeSections(sections).length
    },
    topic,
    keyFacts: groundedKeyFacts,
    suggestedGrade: grade.grade,
    suggestedSubject,
    objectives,
    teacherGuide,
    competencySuggestions: sampleCompetencies(suggestedSubject, language, vocabulary.length),
    vocabulary,
    comprehension,
    sections: analyzedSections,
    recommendedGames: recommendGames({ sentences, vocabulary, topic, subject, ranked }),
    gameDrafts: buildGameDrafts({ topic, sentences, vocabulary, comprehension, ranked, questionCount }),
    flags: [...flags],
    warnings: [...BASE_WARNINGS],
    provider: 'offline'
  };
}

// ───────────────────────────── Remote merge helpers ─────────────────────────────

function validArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function sanitizeStrings(value) {
  if (!validArray(value)) return null;
  const result = dedupeByLower(value.filter((item) => typeof item === 'string'));
  return result.length ? result : null;
}

function sanitizeVocabulary(value) {
  if (!validArray(value)) return null;
  const result = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const term = String(entry.term || '').trim();
    const sourceQuote = String(entry.sourceQuote || '').trim();
    if (!term || !sourceQuote) continue;
    result.push({
      term,
      definition: String(entry.definition || sourceQuote),
      sourceQuote,
      reviewNeeded: true
    });
  }
  return result.length ? result : null;
}

function sanitizeChoices(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((choice) => choice && typeof choice === 'object')
    .map((choice) => ({ text: String(choice.text ?? ''), is_correct: Boolean(choice.is_correct) }))
    .filter((choice) => choice.text);
}

function sanitizeComprehension(value) {
  if (!validArray(value)) return null;
  const result = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const prompt = String(item.prompt || '').trim();
    const sourceQuote = String(item.sourceQuote || '').trim();
    const choices = sanitizeChoices(item.choices);
    if (!prompt || !sourceQuote || choices.length < 2) continue;
    if (!choices.some((choice) => choice.is_correct)) choices[0].is_correct = true;
    result.push({
      prompt,
      answer: String(item.answer || choices.find((choice) => choice.is_correct).text),
      choices,
      explanation: String(item.explanation || `Source quote: "${sourceQuote}"`),
      sourceQuote,
      reviewNeeded: true
    });
  }
  return result.length ? result : null;
}

function sanitizeSections(value) {
  if (!validArray(value)) return null;
  const result = [];
  for (const section of value) {
    if (!section || typeof section !== 'object') continue;
    const title = String(section.title || '').trim();
    const summary = String(section.summary || '').trim();
    if (!title || !summary) continue;
    result.push({
      title,
      summary,
      keyTerms: Array.isArray(section.keyTerms)
        ? section.keyTerms.filter((term) => typeof term === 'string').map(String).slice(0, 10)
        : []
    });
  }
  return result.length ? result : null;
}

function sanitizeCompetencies(value) {
  if (!validArray(value)) return null;
  const result = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const title = String(entry.title || '').trim();
    if (!title) continue;
    result.push({
      title,
      description: String(entry.description || 'Sample competency — verify before use.'),
      reason: String(entry.reason || 'Sample only; verify against your own official document.'),
      curriculum: 'DepEd MATATAG',
      verified: false,
      code: null
    });
  }
  return result.length ? result : null;
}

function sanitizeRecommended(value) {
  if (!validArray(value)) return null;
  const result = [];
  for (const game of value) {
    if (!game || typeof game !== 'object') continue;
    const type = String(game.type || '').trim();
    if (!type) continue;
    result.push({
      type,
      title: String(game.title || GAME_TITLES[type] || type),
      reason: String(game.reason || 'Suggested for this source; review before publishing.')
    });
  }
  return result.length ? result : null;
}

function sanitizeGameDrafts(value) {
  if (!validArray(value)) return null;
  const result = [];
  for (const draft of value) {
    if (!draft || typeof draft !== 'object') continue;
    const type = String(draft.type || '').trim();
    const questions = [];
    for (const question of Array.isArray(draft.questions) ? draft.questions : []) {
      if (!question || typeof question !== 'object') continue;
      const metadata = question.metadata && typeof question.metadata === 'object' ? question.metadata : {};
      const sourceQuote = String(metadata.sourceQuote || '').trim();
      const prompt = String(question.prompt || '').trim();
      if (!prompt || !sourceQuote) continue;
      questions.push({
        prompt,
        explanation: String(question.explanation || `Source quote: "${sourceQuote}"`),
        metadata: {
          ...metadata,
          sourceQuote,
          needsReview: true,
          sourceType: String(metadata.sourceType || 'remote_draft')
        },
        choices: sanitizeChoices(question.choices)
      });
    }
    if (!type || !questions.length) continue;
    result.push({
      type,
      title: String(draft.title || GAME_TITLES[type] || type),
      description: String(draft.description || 'Remote draft — verify against the source before publishing.'),
      config: draft.config && typeof draft.config === 'object' ? draft.config : {},
      questions
    });
  }
  return result.length ? result : null;
}

function mergeRemote(offline, parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const sanitizers = {
    objectives: sanitizeStrings,
    vocabulary: sanitizeVocabulary,
    comprehension: sanitizeComprehension,
    sections: sanitizeSections,
    competencySuggestions: sanitizeCompetencies,
    recommendedGames: sanitizeRecommended,
    gameDrafts: sanitizeGameDrafts,
    flags: sanitizeStrings,
    warnings: sanitizeStrings
  };
  const merged = { ...offline };
  let accepted = 0;
  for (const [key, sanitize] of Object.entries(sanitizers)) {
    const clean = sanitize(parsed[key]);
    if (clean) {
      merged[key] = clean;
      accepted += 1;
    }
  }
  // Scalar fields always stay source-grounded from the offline analysis.
  return accepted ? merged : null;
}

const SCHEMA_HINT = [
  'Desired JSON keys, each an array: objectives (strings),',
  'vocabulary [{term,definition,sourceQuote,reviewNeeded}],',
  'comprehension [{prompt,answer,choices:[{text,is_correct}],explanation,sourceQuote,reviewNeeded}],',
  'sections [{title,summary,keyTerms}], competencySuggestions [{title,description,reason}],',
  'recommendedGames [{type,title,reason}],',
  'gameDrafts [{type,title,description,config,questions:[{prompt,explanation,metadata:{sourceQuote,needsReview,sourceType},choices}]}],',
  'flags (strings), warnings (strings).'
].join(' ');

async function tryRemote(sourceInput, offline) {
  const url = process.env.EDUPLAY_AI_URL;
  const key = process.env.EDUPLAY_AI_KEY;
  const model = process.env.EDUPLAY_AI_MODEL;
  if (!url || !key || !model) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const excerpt = [
      `Title: ${sourceInput.title || ''}`,
      `Grade level: ${sourceInput.gradeLevel || ''}`,
      `Subject: ${sourceInput.subject || ''}`,
      `Language: ${sourceInput.language || ''}`,
      '',
      String(sourceInput.text || '').slice(0, 4000)
    ].join('\n');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Return only valid JSON. Use only facts present in the supplied source text. Do not invent facts, answers, or official curriculum codes. All content is a draft for teacher review.'
          },
          { role: 'user', content: `${excerpt}\n\n${SCHEMA_HINT}\nQuote the source exactly in every sourceQuote and explanation.` }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`remote endpoint returned HTTP ${response.status}`);
    const data = await response.json();
    let content = data?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) content = content.map((part) => part?.text || '').join('');
    if (typeof content !== 'string' || !content.trim()) throw new Error('remote response contained no JSON content');
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    const merged = mergeRemote(offline, parsed);
    if (!merged) throw new Error('remote JSON contained no usable arrays');
    return { ...merged, provider: 'remote' };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────── Public: orchestration ─────────────────────────────

export async function generateFromSource(input = {}) {
  const sourceInput = {
    text: input.text ?? '',
    sections: input.sections ?? [],
    title: input.title ?? '',
    gradeLevel: input.gradeLevel ?? '',
    subject: input.subject ?? '',
    language: input.language ?? '',
    questionCount: input.questionCount ?? 0,
    keyFacts: input.keyFacts ?? []
  };
  const options = input.options && typeof input.options === 'object' ? input.options : {};
  let analysis = analyzeContent(sourceInput);
  const offlineKeyFacts = Array.isArray(analysis.keyFacts) ? analysis.keyFacts : [];
  const offlineTeacherGuide = analysis.teacherGuide || null;
  if (options.ocr === true && !analysis.flags.includes(OCR_FLAG)) analysis.flags.push(OCR_FLAG);

  let remote;
  try {
    remote = await tryRemote(sourceInput, analysis);
  } catch (error) {
    const message = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 180) || 'unknown error';
    analysis.warnings.push(`Remote AI generation failed (${message}); used offline source-grounded analysis instead.`);
  }
  if (remote) analysis = { ...remote, keyFacts: offlineKeyFacts, teacherGuide: offlineTeacherGuide };

  // Remote drafts can outgrow the requested count; caps always apply to the final result.
  const count = Math.max(0, Number(sourceInput.questionCount) || 0);
  if (count > 0) {
    analysis.comprehension = Array.isArray(analysis.comprehension) ? analysis.comprehension.slice(0, count) : [];
    analysis.gameDrafts = (Array.isArray(analysis.gameDrafts) ? analysis.gameDrafts : []).map((draft) => ({
      ...draft,
      questions: Array.isArray(draft.questions) ? draft.questions.slice(0, count) : []
    }));
  }

  const requested = Array.isArray(input.formats)
    ? input.formats
    : (Array.isArray(options.formats) ? options.formats : []);
  const formats = requested
    .map((format) => String(format ?? '').trim().toLocaleLowerCase().replace(/[\s-]+/g, '_'))
    .filter(Boolean);
  if (formats.length) {
    analysis.gameDrafts = analysis.gameDrafts.filter((draft) => formats.includes(String(draft.type || '').toLocaleLowerCase()));
  }
  return analysis;
}
