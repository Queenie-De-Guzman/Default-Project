// Offline storyboard + action generator for Interactive Animated Stories.
// Generates editable drafts grounded only in the text the user provides.

const STOP = new Set(`a an the and or but so if then than that this these those there here was were is are be been being
i you he she it we they me him her them my your his its our their of in on at to for with from by about into over under
up down out off again very really just now not no yes do does did done can could will would should may might must have has had
one two three four five six seven eight nine ten first next last new old good bad little small big large said says say went
go goes going came come see saw looked looking found get got gave give take took made make made put saw wanted want need needs`.split(/\s+/));

const CLEAN = (word) => String(word || '').replace(/[^\p{L}\p{N}'’-]/gu, '').toLowerCase();

function sentences(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function words(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}'-]+/gu) || []).filter((w) => w.length > 2);
}

function keywords(text, count = 3) {
  const freq = new Map();
  words(text).forEach((word) => {
    if (STOP.has(word)) return;
    freq.set(word, (freq.get(word) || 0) + 1);
  });
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([word]) => word);
}

function backgroundFor(text) {
  const t = String(text || '').toLowerCase();
  if (/night|moon|star|dark|sleep|lantern|midnight/.test(t)) return 'night';
  if (/forest|tree|wood|garden|leaf|bush|jungle/.test(t)) return 'forest';
  if (/sunset|evening|gold|sunrise|dusk|amber|orange sky/.test(t)) return 'sunset';
  return 'meadow';
}

function characterFor(text, preferred) {
  if (preferred) return preferred;
  const t = String(text || '').toLowerCase();
  if (/fox/.test(t)) return 'fox';
  if (/rabbit|bunny|hare/.test(t)) return 'rabbit';
  if (/bird|sparrow|hen|duck|owl/.test(t)) return 'bird';
  if (/bear/.test(t)) return 'bear';
  if (/fish|pond|river|sea|water/.test(t)) return 'fish';
  return 'owl';
}

function expressionFor(text) {
  const t = String(text || '').toLowerCase();
  if (/sleep|yawn|tired|dream|nap/.test(t)) return 'sleepy';
  if (/sudden|wow|surprise|shock|amaz/.test(t)) return 'surprised';
  if (/ask|wonder|look|search|find|curious|why|how/.test(t)) return 'curious';
  return 'happy';
}

function actionFor(text) {
  const t = String(text || '').toLowerCase();
  if (/dance|cheer|celebrat|party|shout|yay/.test(t)) return 'dance';
  if (/wave|said|hello|greet|smile|call/.test(t)) return 'wave';
  if (/jump|hop|run|skip|leap/.test(t)) return 'hop';
  return 'idle';
}

function titleFrom(text, fallback) {
  const first = sentences(text)[0] || String(text || '').slice(0, 60);
  const wordsOut = first.split(/\s+/).slice(0, 6).join(' ').replace(/[.!?]+$/, '');
  return wordsOut || fallback;
}

function makeActivity(text, index, allTitles, keyWord) {
  const types = ['multiple_choice', 'true_false', 'vocabulary', 'sequencing', 'multiple_choice'];
  const type = types[index % types.length];
  const distractors = keywords(text, 8).filter((w) => w !== keyWord).slice(0, 2);
  while (distractors.length < 2) distractors.push(['garden', 'river', 'window', 'pocket', 'blanket'][distractors.length]);
  if (type === 'true_false') {
    return {
      sceneNumber: index + 1, type,
      prompt: `Does this scene mention “${keyWord}”?`,
      options: ['True', 'False'], answer: 'True',
      feedback: `Yes — “${keyWord}” appears in this scene.`
    };
  }
  if (type === 'vocabulary') {
    return {
      sceneNumber: index + 1, type,
      prompt: `Which word belongs to this scene?`,
      options: [keyWord, ...distractors], answer: keyWord,
      feedback: `“${keyWord}” comes from the story text on this page.`
    };
  }
  if (type === 'sequencing') {
    return {
      sceneNumber: index + 1, type,
      prompt: `Which event happens first in the story?`,
      options: [allTitles[0] || titleFrom(text, 'Scene 1'), ...allTitles.slice(1, 3)],
      answer: allTitles[0] || titleFrom(text, 'Scene 1'),
      feedback: `The story begins with “${allTitles[0] || 'the first scene'}”.`
    };
  }
  return {
    sceneNumber: index + 1, type,
    prompt: `Which word is found in this scene?`,
    options: [keyWord, ...distractors], answer: keyWord,
    feedback: `Correct — “${keyWord}” is in the scene text.`
  };
}

export function generateStoryboard(input = {}) {
  const body = String(input.text || '').trim();
  if (!body) throw new Error('Write or paste story text first.');
  const requested = Math.max(1, Math.min(10, Number(input.sceneCount) || 0));
  const chunks = body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const source = chunks.length > 1 ? chunks : sentences(body);
  const sceneCount = requested || Math.min(8, Math.max(1, source.length));
  const pool = [];
  for (let i = 0; i < sceneCount; i += 1) {
    pool.push(source[Math.floor(i * source.length / sceneCount)] || source[source.length - 1] || body);
  }

  const scenes = pool.map((chunk, i) => {
    const key = keywords(chunk, 2)[0] || words(chunk)[0] || 'friend';
    const sentence = sentences(chunk)[0] || chunk.slice(0, 120);
    return {
      title: titleFrom(chunk, `Scene ${i + 1}`),
      text: chunk.slice(0, 1200),
      background: backgroundFor(chunk),
      character: characterFor(chunk, input.character),
      expression: expressionFor(chunk),
      action: actionFor(chunk),
      hotspots: [
        {
          label: key,
          kind: backgroundFor(chunk) === 'night' ? 'star' : 'leaf',
          x: 28 + ((i * 17) % 44),
          y: 45 + ((i * 11) % 30),
          feedback: sentence,
          sound: 'click'
        }
      ]
    };
  });

  const titles = scenes.map((s) => s.title);
  const activities = scenes.map((scene, i) =>
    makeActivity(scene.text, i, titles, keywords(scene.text, 2)[0] || words(scene.text)[0] || 'story'));

  return {
    title: String(input.title || '').trim() || titleFrom(body, 'My Interactive Story'),
    description: String(input.description || sentences(body)[0] || '').slice(0, 400),
    category: input.category || 'Animal Stories',
    grade_level: input.gradeLevel || 'Grade 1',
    scenes,
    activities
  };
}
