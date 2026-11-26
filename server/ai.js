// EduPlay content generator.
// Offline by default: deterministic, teacher-reviewable drafts. If EDUPLAY_AI_URL and
// EDUPLAY_AI_KEY are configured, an OpenAI-compatible chat endpoint is used first.
// Generated content is ALWAYS saved as an editable draft and never published automatically.

const FACT_BANK = {
  'solar system': [
    ['Sun', 'The star at the centre of our solar system.', 'planet'],
    ['Mars', 'The red planet, named after the Roman god of war.', 'Venus'],
    ['Jupiter', 'The largest planet in our solar system.', 'Saturn'],
    ['Saturn', 'A planet famous for its bright rings of ice and rock.', 'Uranus'],
    ['Earth', 'The planet we live on, with liquid water on its surface.', 'Moon']
  ],
  'plants': [
    ['Photosynthesis', 'The process plants use to make food using sunlight.', 'Respiration'],
    ['Chlorophyll', 'The green pigment that captures sunlight in leaves.', 'Carbon dioxide'],
    ['Root', 'The plant part that absorbs water and nutrients from soil.', 'Stem'],
    ['Stomata', 'Tiny openings in leaves that allow gas exchange.', 'Petals'],
    ['Pollination', 'The transfer of pollen that helps plants make seeds.', 'Germination']
  ],
  'fractions': [
    ['Numerator', 'The top number of a fraction; it tells how many parts are counted.', 'Denominator'],
    ['Denominator', 'The bottom number of a fraction; it tells how many equal parts exist.', 'Numerator'],
    ['Equivalent fractions', 'Fractions that name the same value.', 'Improper fractions'],
    ['Proper fraction', 'A fraction whose numerator is smaller than its denominator.', 'Mixed number'],
    ['One half', 'One of two equal parts of a whole.', 'One third']
  ],
  'water cycle': [
    ['Evaporation', 'The process where liquid water changes into water vapour.', 'Condensation'],
    ['Condensation', 'The process where water vapour changes into liquid droplets.', 'Evaporation'],
    ['Precipitation', 'Water falling from clouds as rain, snow, or hail.', 'Collection'],
    ['Collection', 'Water gathering in rivers, lakes, and oceans.', 'Transpiration'],
    ['Transpiration', 'Water vapour released from plant leaves.', 'Precipitation']
  ],
  'animals': [
    ['Mammal', 'An animal that has hair or fur and feeds its young milk.', 'Reptile'],
    ['Reptile', 'An animal with dry scales that usually lays eggs.', 'Mammal'],
    ['Bird', 'An animal with feathers, wings, and a beak.', 'Fish'],
    ['Amphibian', 'An animal that lives both in water and on land.', 'Insect'],
    ['Habitat', 'The natural home of an animal or plant.', 'Predator']
  ],
  'family': [
    ['Pamilya', 'Ang pangkat ng mga taong magkakasama sa bahay.', 'Paaralan'],
    ['Magulang', 'Ang ama o ina ng isang bata.', 'Kapatid'],
    ['Kapatid', 'Anak ng parehong magulang.', 'Lolo'],
    ['Bahay', 'Ang lugar na tirahan ng pamilya.', 'Simbahan'],
    ['Pagtutulungan', 'Pagtulong sa isa’t isa upang makumpleto ang gawain.', 'Pagkakahiya']
  ]
};

const GENERIC_TERMS = ['observation', 'evidence', 'pattern', 'comparison', 'relationship', 'process', 'example', 'explanation'];

function gradeNumber(grade) {
  const n = parseInt(String(grade || '').match(/\d+/)?.[0] || '4', 10);
  return Math.min(12, Math.max(1, n));
}

function keywordItems(topic) {
  const key = Object.keys(FACT_BANK).find((k) => new RegExp(k, 'i').test(topic || ''));
  return key ? FACT_BANK[key].map(([term, definition, distractor]) => ({ term, definition, distractor })) : null;
}

function mathItems(topic, grade) {
  const g = gradeNumber(grade);
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const items = [];
  if (g <= 2) {
    for (let i = 0; i < 6; i++) {
      const a = rnd(2, 15), b = rnd(1, 10);
      const plus = i < 3;
      const answer = plus ? a + b : a + b - Math.min(a, b);
      const x = plus ? a : a + b, y = plus ? b : Math.min(a, b);
      items.push({ term: String(answer), definition: plus ? `Add ${x} and ${y}.` : `Subtract ${y} from ${x}.`, answer: String(answer), explanation: `${x} ${plus ? '+' : '−'} ${y} = ${answer}.` });
    }
  } else if (g <= 4) {
    for (let i = 0; i < 6; i++) {
      const a = rnd(2, 9), b = rnd(2, 9);
      const times = i < 4;
      const answer = times ? a * b : a * b;
      const x = times ? a : answer, y = times ? b : a;
      items.push({
        term: String(answer),
        definition: times ? `Multiply ${a} by ${b}.` : `Divide ${answer} by ${a}.`,
        answer: String(answer),
        explanation: times ? `${a} × ${b} = ${answer}.` : `${answer} ÷ ${a} = ${b}.`
      });
    }
  } else if (g <= 6) {
    const pairs = [[1, 2], [3, 4], [2, 5], [3, 5], [1, 4], [2, 3]];
    for (const [a, b] of pairs) {
      items.push({ term: `${a}/${b}`, definition: `Write the fraction equivalent to ${a}/${b} with denominator ${b * 2}.`, answer: `${a * 2}/${b * 2}`, explanation: `Multiply numerator and denominator by 2: ${a}/${b} = ${a * 2}/${b * 2}.` });
    }
  } else {
    const a = rnd(3, 12);
    items.push(
      { term: String(3 * a), definition: `Solve for x: 3x = ${3 * a}`, answer: String(a), explanation: `Divide both sides by 3: x = ${a}.` },
      { term: String(a + 5), definition: `Solve for x: x − 5 = ${a}`, answer: String(a + 5), explanation: `Add 5 to both sides: x = ${a + 5}.` },
      { term: String(a * a), definition: `Find the square of ${a}.`, answer: String(a * a), explanation: `${a}² = ${a} × ${a} = ${a * a}.` }
    );
  }
  return items;
}

function genericItems(topic) {
  const clean = topic.trim().replace(/[.!?]+$/, '');
  return [
    { term: 'Observation', definition: `An observation is information gathered about ${clean} using the senses or tools.`, distractor: 'Opinion' },
    { term: 'Evidence', definition: `Evidence is information that helps explain or support an idea about ${clean}.`, distractor: 'Guess' },
    { term: 'Comparison', definition: `A comparison shows how ${clean} is similar to or different from something else.`, distractor: 'Conclusion' },
    { term: 'Explanation', definition: `An explanation tells why or how something about ${clean} happens.`, distractor: 'Question' },
    { term: 'Example', definition: `An example is a specific case that helps illustrate ${clean}.`, distractor: 'Rule' }
  ];
}

function canonicalItems({ topic, subject, grade }) {
  const subjectName = String(subject || '').toLowerCase();
  if (subjectName.includes('math')) return mathItems(topic, grade);
  const bank = keywordItems(topic);
  if (bank) return bank.map((b) => ({ ...b, answer: b.term, explanation: b.definition }));
  return genericItems(topic);
}

function choicesFrom(item, pool, count = 4) {
  const correct = item.answer || item.term;
  const others = pool.filter((x) => (x.answer || x.term) !== correct)
    .map((x) => x.answer || x.term).filter(Boolean);
  const extra = [item.distractor, ...others, ...GENERIC_TERMS].filter(Boolean);
  const distractors = [];
  for (const candidate of [...new Set(extra)]) {
    if (candidate.toLowerCase() === correct.toLowerCase()) continue;
    distractors.push(candidate);
    if (distractors.length >= count - 1) break;
  }
  while (distractors.length < count - 1) distractors.push(`Other answer ${distractors.length + 1}`);
  return [{ text: correct, is_correct: true }, ...distractors.map((text) => ({ text, is_correct: false }))];
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function recommendedFormats(subject = '', grade = '') {
  const g = gradeNumber(grade);
  const base = ['multiple_choice', 'matching', 'true_false', 'fill_blank', 'wordsearch', 'spin_wheel', 'random_question'];
  if (/math/i.test(subject)) return ['math', 'multiple_choice', 'fill_blank', 'escape_room', 'bingo', 'treasure_hunt', ...base];
  if (/english|filipino|read/i.test(subject)) return ['reading', 'scramble', 'wordsearch', 'crossword', 'sequencing', 'pronunciation', 'fill_blank', ...base];
  if (g <= 3) return ['picture', 'matching', 'memory', 'true_false', 'multiple_choice', 'bingo', 'sorting', ...base];
  return ['picture', 'sorting', 'listening', 'multiple_choice', 'matching', 'escape_room', 'treasure_hunt', ...base];
}

function adapt(items, type, topic, config) {
  const questions = [];
  const pool = items;

  const withChoices = (count = 4) => items.map((item, i) => ({
    prompt: item.definition || `What is the answer to: ${item.term}?`,
    explanation: item.explanation || `${item.answer || item.term} is the correct answer.`,
    metadata: { source: 'ai_draft', needsReview: true },
    choices: shuffled(choicesFrom(item, pool, count)).map((c, j) => ({ ...c, sort_order: j }))
  }));

  switch (type) {
    case 'matching':
    case 'memory':
      return {
        questions: items.map((item) => ({
          prompt: item.term,
          explanation: item.explanation,
          metadata: { source: 'ai_draft', needsReview: true, left: item.term, right: item.definition },
          choices: [{ text: item.term, is_correct: true, sort_order: 0 }]
        })),
        config: {}
      };
    case 'scramble':
    case 'wordsearch':
    case 'crossword':
      return {
        questions: items.map((item) => ({
          prompt: item.definition,
          explanation: item.explanation,
          metadata: { source: 'ai_draft', needsReview: true, word: item.answer || item.term },
          choices: [{ text: item.answer || item.term, is_correct: true, sort_order: 0 }]
        })),
        config: {}
      };
    case 'true_false': {
      const qs = items.slice(0, 5).map((item, i) => {
        const truth = i % 2 === 0;
        return {
          prompt: truth ? item.definition : `${item.definition.replace(/\.$/, '')} — but this is actually false.`,
          explanation: truth ? `True. ${item.explanation || ''}` : `False. The correct idea is: ${item.explanation || ''}`,
          metadata: { source: 'ai_draft', needsReview: true },
          choices: [
            { text: 'True', is_correct: truth, sort_order: 0 },
            { text: 'False', is_correct: !truth, sort_order: 1 }
          ]
        };
      });
      return { questions: qs, config: {} };
    }
    case 'fill_blank': {
      const answer = items[0]?.answer || items[0]?.term || topic;
      return {
        questions: items.slice(0, 5).map((item) => ({
          prompt: String(item.definition || '').replace(new RegExp(`\\b${String(item.answer || item.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '_______'),
          explanation: item.explanation || `The missing idea is ${item.answer || item.term}.`,
          metadata: { source: 'ai_draft', needsReview: true },
          choices: [{ text: item.answer || item.term, is_correct: true, sort_order: 0 }]
        })).concat(items.length ? [] : [{ prompt: `Complete: ${topic} is _______`, explanation: answer, metadata: { source: 'ai_draft', needsReview: true }, choices: [{ text: answer, is_correct: true }] }]),
        config: {}
      };
    }
    case 'reading': {
      const passage = `${topic} is an important idea worth studying carefully. We can learn about ${topic} by observing, asking questions, and checking evidence. First, notice important details. Next, compare what you see with what you already know. Finally, explain your thinking using clear examples. ${items.map((i) => i.definition).join(' ')}`;
      const qs = items.slice(0, 4).map((item) => ({
        prompt: `According to the passage, which statement about ${topic} is correct?`,
        explanation: item.explanation || item.definition,
        metadata: { source: 'ai_draft', needsReview: true, passage },
        choices: shuffled(choicesFrom(item, pool, 4)).map((c, j) => ({ ...c, sort_order: j }))
      }));
      return { questions: qs, config: { passage } };
    }
    case 'sequencing':
      return {
        questions: [
          `Ask a clear question about ${topic}.`,
          `Make careful observations or gather information about ${topic}.`,
          `Organize the information and look for patterns.`,
          `Share an explanation and check it with evidence.`
        ].map((prompt, i) => ({
          prompt, explanation: `Step ${i + 1} of a simple inquiry process.`,
          metadata: { source: 'ai_draft', needsReview: true }, choices: []
        })),
        config: {}
      };
    case 'sorting':
      return {
        questions: items.map((item, i) => ({
          prompt: item.term,
          explanation: item.definition,
          metadata: { source: 'ai_draft', needsReview: true, category: i < 2 ? 'Ideas' : 'Details' },
          choices: []
        })),
        config: {}
      };
    case 'picture':
      return {
        questions: items.slice(0, 5).map((item) => ({
          prompt: `What is being described?`,
          explanation: item.explanation || item.definition,
          metadata: { source: 'ai_draft', needsReview: true, emoji: ['🔍', '🌱', '💡', '🧪', '⭐'][items.indexOf(item) % 5], clue1: item.definition, clue2: item.term.split('')[0] + '…' },
          choices: [{ text: item.answer || item.term, is_correct: true, sort_order: 0 }]
        })),
        config: {}
      };
    case 'listening':
      return {
        questions: items.slice(0, 5).map((item) => ({
          prompt: 'What did you hear?',
          explanation: item.explanation || item.definition,
          metadata: { source: 'ai_draft', needsReview: true, listen_text: item.definition },
          choices: shuffled(choicesFrom(item, pool, 4)).map((c, j) => ({ ...c, sort_order: j }))
        })),
        config: {}
      };
    case 'pronunciation':
      return {
        questions: items.map((item) => ({
          prompt: item.answer || item.term,
          explanation: item.definition,
          metadata: { source: 'ai_draft', needsReview: true, word: item.answer || item.term },
          choices: []
        })),
        config: {}
      };
    case 'bingo':
      return {
        questions: items.map((item) => ({
          prompt: item.term, explanation: item.definition,
          metadata: { source: 'ai_draft', needsReview: true, word: item.term },
          choices: [{ text: item.term, is_correct: true }]
        })),
        config: {}
      };
    default:
      questions.push(...withChoices(4));
      return { questions, config };
  }
}

async function remoteGenerate(input) {
  const url = process.env.EDUPLAY_AI_URL;
  const key = process.env.EDUPLAY_AI_KEY;
  if (!url || !key) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.EDUPLAY_AI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'You are a helpful teacher assistant. Return ONLY JSON with a "questions" array. Each question has prompt, explanation, metadata and choices [{text,is_correct}]. Never invent official curriculum codes. All content is a draft for teacher review.' },
          { role: 'user', content: `Topic: ${input.topic}\nGrade: ${input.grade}\nSubject: ${input.subject}\nCompetency: ${input.competency || 'Not provided'}\nGame type: ${input.gameType}\nCount: ${input.count}` }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(String(content).replace(/^```json|```$/g, '').trim());
    if (!Array.isArray(parsed.questions) || !parsed.questions.length) return null;
    return {
      questions: parsed.questions.slice(0, input.count).map((q, i) => ({
        prompt: String(q.prompt || `Question ${i + 1}`),
        explanation: String(q.explanation || ''),
        metadata: { ...(q.metadata || {}), source: 'ai_remote', needsReview: true },
        choices: (q.choices || []).map((c) => ({ text: String(c.text || ''), is_correct: Boolean(c.is_correct) }))
      })),
      config: parsed.config && typeof parsed.config === 'object' ? parsed.config : {},
      engine: 'remote'
    };
  } catch {
    return null;
  }
}

export async function generateGame(input) {
  const topic = String(input.topic || '').trim();
  if (!topic) throw new Error('Topic is required.');
  const count = Math.max(2, Math.min(30, Number(input.count) || 6));
  const remote = await remoteGenerate({ ...input, topic, count });
  if (remote) {
    return {
      ...remote,
      recommended: recommendedFormats(input.subject, input.grade),
      warnings: ['AI-generated draft — verify every answer and explanation before publishing.', 'Add your own official competency reference; EduPlay does not supply DepEd codes.']
    };
  }
  const items = canonicalItems({ topic, subject: input.subject, grade: input.grade });
  const local = adapt(items, input.gameType || 'multiple_choice', topic, input.config || {});
  const questions = local.questions.slice(0, count);
  return {
    questions,
    config: local.config || {},
    recommended: recommendedFormats(input.subject, input.grade),
    warnings: [
      'Offline generator draft — verify every answer and explanation before publishing.',
      'No official DepEd competency code was created. Enter one from your own DepEd documents if required.'
    ],
    engine: 'local'
  };
}
