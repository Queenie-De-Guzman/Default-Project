// Central registry of all 20 EduPlay game engines.
import matching from './matching.js';
import scramble from './scramble.js';
import wordsearch from './wordsearch.js';
import fillblank from './fillblank.js';
import multiplechoice from './multiplechoice.js';
import truefalse from './truefalse.js';
import spinwheel from './spinwheel.js';
import memory from './memory.js';
import sequencing from './sequencing.js';
import reading from './reading.js';
import picture from './picture.js';
import crossword from './crossword.js';
import escaperoom from './escaperoom.js';
import treasurehunt from './treasurehunt.js';
import bingo from './bingo.js';
import sorting from './sorting.js';
import math from './math.js';
import listening from './listening.js';
import pronunciation from './pronunciation.js';
import randomquestion from './randomquestion.js';
import dragdrop from './dragdrop.js';

export const GAME_MODULES = {
  matching,
  scramble,
  wordsearch,
  fill_blank: fillblank,
  multiple_choice: multiplechoice,
  true_false: truefalse,
  spin_wheel: spinwheel,
  memory,
  sequencing,
  reading,
  picture,
  crossword,
  escape_room: escaperoom,
  treasure_hunt: treasurehunt,
  bingo,
  sorting,
  math,
  listening,
  pronunciation,
  random_question: randomquestion,
  drag_drop: dragdrop
};

export const GAME_LIST = Object.values(GAME_MODULES).map((m) => m.meta);
