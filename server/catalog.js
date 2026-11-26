// Canonical catalogue of EduPlay game engines. The front-end also reads the richer
// metadata (icon, editor fields) from each game module; this list is the server-side
// source of truth for validation.
export const GAME_TYPES = [
  { type: 'matching', title: 'Matching Game', icon: '🔗' },
  { type: 'scramble', title: 'Word Scramble', icon: '🔤' },
  { type: 'wordsearch', title: 'Word Search', icon: '🔍' },
  { type: 'fill_blank', title: 'Fill in the Blanks', icon: '✏️' },
  { type: 'multiple_choice', title: 'Multiple Choice', icon: '✅' },
  { type: 'true_false', title: 'True or False', icon: '⚖️' },
  { type: 'spin_wheel', title: 'Spin the Wheel', icon: '🎡' },
  { type: 'memory', title: 'Memory Cards', icon: '🃏' },
  { type: 'sequencing', title: 'Story Sequencing', icon: '🧮' },
  { type: 'reading', title: 'Reading Comprehension', icon: '📖' },
  { type: 'picture', title: 'Picture Guessing', icon: '🖼️' },
  { type: 'crossword', title: 'Crossword Puzzle', icon: '🔠' },
  { type: 'escape_room', title: 'Escape Room', icon: '🔐' },
  { type: 'treasure_hunt', title: 'Treasure Hunt', icon: '🗺️' },
  { type: 'bingo', title: 'Bingo', icon: '🎱' },
  { type: 'sorting', title: 'Drag & Drop Sorting', icon: '🗂️' },
  { type: 'math', title: 'Math Challenge', icon: '➗' },
  { type: 'listening', title: 'Listening Challenge', icon: '🎧' },
  { type: 'pronunciation', title: 'Pronunciation Challenge', icon: '🗣️' },
  { type: 'random_question', title: 'Random Question Challenge', icon: '🎲' },
  { type: 'drag_drop', title: 'Drop & Learn', icon: '🧲' }
];

export const GAME_TYPE_IDS = GAME_TYPES.map((g) => g.type);
