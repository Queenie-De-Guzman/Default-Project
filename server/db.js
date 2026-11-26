import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { hashPassword } from './auth.js';
import { DATA_DIR, UPLOAD_DIR, DB_PATH } from './paths.js';

export { DATA_DIR, UPLOAD_DIR, DB_PATH };

mkdirSync(UPLOAD_DIR, { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  avatar_color TEXT DEFAULT '#6366f1',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT '📚'
);

CREATE TABLE IF NOT EXISTS curriculum_competencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade_level TEXT NOT NULL,
  code TEXT,
  title TEXT NOT NULL,
  description TEXT,
  curriculum TEXT NOT NULL DEFAULT 'DepEd MATATAG',
  reference TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_by INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id),
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_year TEXT,
  join_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_number TEXT,
  grade_level TEXT,
  section TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_students (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id),
  grade_level TEXT,
  competency_id INTEGER REFERENCES curriculum_competencies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  objectives TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id),
  grade_level TEXT,
  competency_id INTEGER REFERENCES curriculum_competencies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
  time_limit INTEGER,
  points_per_question INTEGER NOT NULL DEFAULT 10,
  show_feedback INTEGER NOT NULL DEFAULT 1,
  allow_retry INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  cover_image TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ai')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL DEFAULT '',
  explanation TEXT,
  points INTEGER,
  media_url TEXT,
  audio_url TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS answer_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES game_questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  is_correct INTEGER NOT NULL DEFAULT 0,
  media_url TEXT,
  feedback TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  instructions TEXT,
  due_at TEXT,
  allow_retry INTEGER NOT NULL DEFAULT 1,
  show_feedback INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','expired')),
  time_spent INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '[]',
  details TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  max_points INTEGER NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT '🏅',
  criteria TEXT NOT NULL DEFAULT '{}',
  points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS student_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, reward_id, game_id)
);

CREATE TABLE IF NOT EXISTS student_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  best_percentage REAL NOT NULL DEFAULT 0,
  average_percentage REAL NOT NULL DEFAULT 0,
  last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, subject_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_games_teacher ON games(teacher_id);
CREATE INDEX IF NOT EXISTS idx_questions_game ON game_questions(game_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_game ON scores(game_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
`);

export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const get = (sql, ...params) => db.prepare(sql).get(...params) || null;
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function jsonParse(value, fallback = null) {
  if (value == null) return fallback;
  try { return typeof value === 'string' ? JSON.parse(value) : value; }
  catch { return fallback; }
}

// ── Forward-only migrations ────────────────────────────────────────────────
// Existing databases are upgraded in place so demo data survives a restart.
function ensureColumn(table, column, definition) {
  if (!all(`PRAGMA table_info(${table})`).some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('users', 'approved', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('lessons', 'source_file', 'TEXT');
ensureColumn('lessons', 'extracted_text', 'TEXT');

db.exec(`
CREATE TABLE IF NOT EXISTS lesson_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  text TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  audio_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lesson_vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  definition TEXT,
  media_url TEXT,
  audio_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'listen',
  time_spent INTEGER NOT NULL DEFAULT 0,
  pages_read INTEGER NOT NULL DEFAULT 0,
  words_read INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reading_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  page_id INTEGER REFERENCES lesson_pages(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewed','needs_practice')),
  score INTEGER,
  feedback TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reading_sessions_student ON reading_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
`);

// ── Teaching materials, story library and source-grounded AI ──────────────
db.exec(`
CREATE TABLE IF NOT EXISTS teaching_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'presentation' CHECK(kind IN ('presentation','document','text','image')),
  format TEXT,
  file_name TEXT,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','extracting','analyzing','generating_games','ready','failed')),
  error TEXT,
  extracted_text TEXT NOT NULL DEFAULT '',
  analysis TEXT NOT NULL DEFAULT '{}',
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS presentation_slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES teaching_materials(id) ON DELETE CASCADE,
  slide_number INTEGER NOT NULL,
  title TEXT,
  text TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER REFERENCES teaching_materials(id) ON DELETE CASCADE,
  story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'image',
  name TEXT,
  url TEXT NOT NULL,
  alt TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS presentation_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES teaching_materials(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
  current_slide INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  accumulated_ms INTEGER NOT NULL DEFAULT 0,
  segment_started_at INTEGER NOT NULL,
  paused_at INTEGER,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_world_progress (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  completed INTEGER NOT NULL DEFAULT 0,
  badges TEXT NOT NULL DEFAULT '[]',
  level_stats TEXT NOT NULL DEFAULT '{}',
  last_game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  music_on INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ias_stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Animal Stories',
  grade_level TEXT,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ias_scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES ias_stories(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT 'meadow',
  character TEXT NOT NULL DEFAULT 'owl',
  expression TEXT NOT NULL DEFAULT 'happy',
  action TEXT NOT NULL DEFAULT 'idle',
  image_url TEXT,
  audio_url TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, scene_number)
);

CREATE TABLE IF NOT EXISTS ias_hotspots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL REFERENCES ias_scenes(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Tap me',
  kind TEXT NOT NULL DEFAULT 'star',
  x INTEGER NOT NULL DEFAULT 50,
  y INTEGER NOT NULL DEFAULT 50,
  feedback TEXT NOT NULL DEFAULT '',
  sound TEXT NOT NULL DEFAULT 'click',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ias_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES ias_stories(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL DEFAULT 'multiple_choice',
  prompt TEXT NOT NULL DEFAULT '',
  options TEXT NOT NULL DEFAULT '[]',
  answer TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ias_progress (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES ias_stories(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  last_viewed TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id, story_id)
);

CREATE TABLE IF NOT EXISTS ias_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES ias_stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, story_id, kind)
);

CREATE TABLE IF NOT EXISTS animated_stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  grade_level TEXT,
  category TEXT NOT NULL DEFAULT 'Adventure',
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS animated_scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES animated_stories(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  background TEXT NOT NULL DEFAULT 'meadow',
  character TEXT NOT NULL DEFAULT 'owl',
  duration INTEGER NOT NULL DEFAULT 0,
  effects TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, scene_number)
);

CREATE TABLE IF NOT EXISTS animated_story_progress (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES animated_stories(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  last_viewed TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id, story_id)
);

CREATE TABLE IF NOT EXISTS story_quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  answers TEXT NOT NULL DEFAULT '[]',
  correct INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS story_reading_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 0,
  file_url TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  transcript TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS world_story_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  stars INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, story_id, kind)
);

CREATE TABLE IF NOT EXISTS game_world_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  badge TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS story_presentation_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
  current_page INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  accumulated_ms INTEGER NOT NULL DEFAULT 0,
  segment_started_at INTEGER NOT NULL,
  paused_at INTEGER,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_material_id INTEGER REFERENCES teaching_materials(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Short Stories',
  grade_level TEXT,
  subject TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  description TEXT,
  cover_url TEXT,
  cover_emoji TEXT DEFAULT '📖',
  source_note TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  preferences TEXT NOT NULL DEFAULT '{}',
  analysis TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, title)
);

CREATE TABLE IF NOT EXISTS story_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL,
  title TEXT,
  text TEXT NOT NULL DEFAULT '',
  image_description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS story_vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES story_sections(id) ON DELETE SET NULL,
  term TEXT NOT NULL,
  definition TEXT,
  source_quote TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS story_comprehension (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  choices TEXT NOT NULL DEFAULT '[]',
  answer TEXT,
  explanation TEXT,
  source_quote TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS story_favorites (
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, story_id)
);

CREATE TABLE IF NOT EXISTS story_reading_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES story_sections(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'listen',
  time_spent INTEGER NOT NULL DEFAULT 0,
  words_read INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('material','story','lesson','text')),
  source_id INTEGER,
  material_id INTEGER REFERENCES teaching_materials(id) ON DELETE SET NULL,
  story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  input_text TEXT NOT NULL DEFAULT '',
  analysis TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','failed')),
  error TEXT,
  provider TEXT DEFAULT 'offline',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES teaching_materials(id) ON DELETE SET NULL,
  story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  analysis_id INTEGER REFERENCES ai_analyses(id) ON DELETE SET NULL,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  questions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES teaching_materials(id) ON DELETE CASCADE,
  story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  due_at TEXT,
  instructions TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_materials_teacher ON teaching_materials(teacher_id);
CREATE INDEX IF NOT EXISTS idx_slides_material ON presentation_slides(material_id, slide_number);
CREATE INDEX IF NOT EXISTS idx_stories_teacher ON stories(teacher_id, category);
CREATE INDEX IF NOT EXISTS idx_story_sections_story ON story_sections(story_id, section_number);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_teacher ON ai_analyses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_generated_games_teacher ON generated_games(teacher_id);
CREATE INDEX IF NOT EXISTS idx_material_assignments_class ON material_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_presentation_sessions_code ON presentation_sessions(code);
CREATE INDEX IF NOT EXISTS idx_presentation_sessions_live ON presentation_sessions(status, material_id);
CREATE INDEX IF NOT EXISTS idx_story_presentation_code ON story_presentation_sessions(code);
CREATE INDEX IF NOT EXISTS idx_story_presentation_live ON story_presentation_sessions(status, story_id);
CREATE INDEX IF NOT EXISTS idx_game_world_awards_student ON game_world_awards(student_id);
CREATE INDEX IF NOT EXISTS idx_story_quiz_student ON story_quiz_attempts(student_id, story_id);
CREATE INDEX IF NOT EXISTS idx_story_recordings_student ON story_reading_recordings(student_id, story_id);
CREATE INDEX IF NOT EXISTS idx_animated_stories_status ON animated_stories(status, category, grade_level);
CREATE INDEX IF NOT EXISTS idx_animated_scenes_story ON animated_scenes(story_id, scene_number);
CREATE INDEX IF NOT EXISTS idx_ias_stories_status ON ias_stories(status, category, grade_level);
CREATE INDEX IF NOT EXISTS idx_ias_scenes_story ON ias_scenes(story_id, scene_number);
CREATE INDEX IF NOT EXISTS idx_ias_activities_story ON ias_activities(story_id, scene_number);
`);

// Forward-only additions: existing databases gain these columns in place on restart.
ensureColumn('teaching_materials', 'description', "TEXT NOT NULL DEFAULT ''");
ensureColumn('teaching_materials', 'grade_level', 'TEXT');
ensureColumn('teaching_materials', 'subject', 'TEXT');
ensureColumn('teaching_materials', 'topic', 'TEXT');
ensureColumn('teaching_materials', 'language', "TEXT NOT NULL DEFAULT 'English'");
ensureColumn('teaching_materials', 'reading_level', 'TEXT');
ensureColumn('teaching_materials', 'quarter', 'TEXT');
ensureColumn('teaching_materials', 'objectives', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('teaching_materials', 'file_size', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('teaching_materials', 'file_hash', 'TEXT');
ensureColumn('teaching_materials', 'presentation_url', 'TEXT');

ensureColumn('presentation_slides', 'narration_script', "TEXT NOT NULL DEFAULT ''");
ensureColumn('presentation_slides', 'transition', "TEXT NOT NULL DEFAULT '{}'");

ensureColumn('stories', 'topic', 'TEXT');
ensureColumn('stories', 'reading_level', 'TEXT');
ensureColumn('stories', 'quarter', 'TEXT');
ensureColumn('stories', 'objectives', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('stories', 'story_type', "TEXT NOT NULL DEFAULT 'text'");
ensureColumn('stories', 'source_file_url', 'TEXT');
ensureColumn('stories', 'source_file_name', 'TEXT');
ensureColumn('stories', 'source_hash', 'TEXT');
ensureColumn('stories', 'page_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('stories', 'processing_status', "TEXT NOT NULL DEFAULT 'ready'");
ensureColumn('stories', 'processing_error', 'TEXT');
ensureColumn('stories', 'archived', 'INTEGER NOT NULL DEFAULT 0');

db.exec(`
CREATE TABLE IF NOT EXISTS story_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  preview_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  ocr_status TEXT NOT NULL DEFAULT 'none',
  ocr_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_story_pages_story ON story_pages(story_id, page_number);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS content_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  file_name TEXT,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_imports_teacher ON content_imports(teacher_id);
`);

export function seedInteractiveStories() {
  const admin = get("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' ORDER BY u.id LIMIT 1");
  if (!admin) return;
  const seeds = [
    {
      title: 'Little Boots and the Sleepy Sheep',
      description: 'A gentle nursery-rhyme adventure about finding a missing hat and helping sleepy sheep get home.',
      category: 'Nursery Rhymes', grade_level: 'Kinder',
      scenes: [
        { title: 'The missing hat', text: 'Little Boots looked in the tall grass. His blue hat was gone!', background: 'meadow', character: 'rabbit', expression: 'curious', action: 'hop', hotspots: [['blue hat', 'star', 28, 62, 'A hat keeps your head warm!', 'click'], ['tall grass', 'leaf', 70, 70, 'Grass can hide little treasures.', 'tick']], activity: { type: 'multiple_choice', prompt: 'What did Little Boots lose?', options: ['His hat', 'His shoe', 'His ball'], answer: 'His hat', feedback: 'Yes! His blue hat was missing.' } },
        { title: 'A sleepy sheep', text: 'A small sheep yawned behind a fence. Boots waved and said, “Come with me!”', background: 'sunset', character: 'bear', expression: 'happy', action: 'wave', hotspots: [['sleepy sheep', 'star', 55, 58, 'Sheep rest when the sky gets soft and pink.', 'click']], activity: { type: 'true_false', prompt: 'The sheep was sleeping behind a fence.', options: ['True', 'False'], answer: 'True', feedback: 'Correct! The sheep was resting there.' } },
        { title: 'Home again', text: 'Boots found his hat and walked home with the sheep. Everyone cheered.', background: 'night', character: 'owl', expression: 'happy', action: 'dance', hotspots: [['cheering friends', 'star', 50, 40, 'Friends celebrate kind helpers!', 'reward']], activity: { type: 'matching', prompt: 'Which word matches “a soft sound made when happy”?', options: ['cheer', 'cry', 'crumb'], answer: 'cheer', feedback: 'Cheer means a happy shout!' } }
      ]
    },
    {
      title: 'The Fox and the Lantern',
      description: 'A clever little fox learns that sharing light makes a dark path brighter for everyone.',
      category: 'Animal Stories', grade_level: 'Grade 1',
      scenes: [
        { title: 'A dark path', text: 'Fox found a lantern beside a mossy stone. The path ahead was very dark.', background: 'night', character: 'fox', expression: 'curious', action: 'idle', hotspots: [['lantern', 'star', 35, 55, 'A lantern gives light when it is dark.', 'click'], ['mossy stone', 'leaf', 72, 68, 'Moss is soft and green.', 'tick']], activity: { type: 'multiple_choice', prompt: 'What did Fox find?', options: ['A lantern', 'A kite', 'A shell'], answer: 'A lantern', feedback: 'Right! It was a lantern.' } },
        { title: 'A friendly plan', text: 'Fox carried the lantern to the bridge. “I can help,” Fox whispered.', background: 'forest', character: 'fox', expression: 'happy', action: 'wave', hotspots: [['bridge', 'leaf', 50, 65, 'A bridge helps us cross water.', 'click']], activity: { type: 'true_false', prompt: 'Fox wanted to help.', options: ['True', 'False'], answer: 'True', feedback: 'Yes, Fox was kind and helpful.' } },
        { title: 'Light for everyone', text: 'Fox shared the lantern. The whole path glowed gold.', background: 'sunset', character: 'fox', expression: 'happy', action: 'dance', hotspots: [['gold light', 'star', 60, 45, 'Sharing makes good things grow.', 'reward']], activity: { type: 'vocabulary', prompt: 'Which word means “gave something to others”?', options: ['shared', 'hid', 'dropped'], answer: 'shared', feedback: 'Shared means let others use it too.' } }
      ]
    },
    {
      title: 'Mia and the Rainy Day',
      description: 'An educational story about clouds, rain, rainbows and helping a neighbour.',
      category: 'Educational Stories', grade_level: 'Grade 2',
      scenes: [
        { title: 'Grey clouds', text: 'Mia saw grey clouds over the garden. “It might rain,” she said.', background: 'meadow', character: 'owl', expression: 'curious', action: 'idle', hotspots: [['grey cloud', 'cloud', 30, 25, 'Grey clouds can bring rain.', 'click']], activity: { type: 'multiple_choice', prompt: 'What might grey clouds bring?', options: ['Rain', 'Sand', 'Stars'], answer: 'Rain', feedback: 'Yes, grey clouds often bring rain.' } },
        { title: 'Rain boots', text: 'Mia put on her yellow boots and carried an umbrella to her neighbour.', background: 'night', character: 'rabbit', expression: 'happy', action: 'hop', hotspots: [['yellow boots', 'star', 45, 66, 'Boots keep feet dry in rain.', 'click']], activity: { type: 'sequencing', prompt: 'What happens first?', options: ['Mia wears boots', 'Mia sees clouds', 'Mia helps a neighbour'], answer: 'Mia sees clouds', feedback: 'First, Mia saw the clouds.' } },
        { title: 'A bright rainbow', text: 'After the rain, a rainbow arched over the street. Mia smiled.', background: 'sunset', character: 'owl', expression: 'happy', action: 'dance', hotspots: [['rainbow', 'star', 62, 30, 'Rainbows appear when sunlight meets raindrops.', 'reward']], activity: { type: 'vocabulary', prompt: 'Which word means “a curved band of colours”?', options: ['rainbow', 'puddle', 'umbrella'], answer: 'rainbow', feedback: 'Rainbow is the band of colours in the sky.' } }
      ]
    }
  ];

  transaction(() => {
    seeds.forEach((seed) => {
      if (get('SELECT id FROM ias_stories WHERE title=?', seed.title)) return;
      const story = run(`INSERT INTO ias_stories(created_by,title,description,category,grade_level,status)
                         VALUES (?,?,?,?,?,'published')`,
        admin.id, seed.title, seed.description, seed.category, seed.grade_level);
      const storyId = Number(story.lastInsertRowid);
      seed.scenes.forEach((scene, i) => {
        const row = run(`INSERT INTO ias_scenes(story_id,scene_number,title,text,background,character,expression,action,duration)
                         VALUES (?,?,?,?,?,?,?,?,?)`,
          storyId, i + 1, scene.title, scene.text, scene.background, scene.character,
          scene.expression || 'happy', scene.action || 'idle', 8);
        const sceneId = Number(row.lastInsertRowid);
        (scene.hotspots || []).forEach(([label, kind, x, y, feedback, sound]) =>
          run('INSERT INTO ias_hotspots(scene_id,label,kind,x,y,feedback,sound) VALUES (?,?,?,?,?,?,?)',
            sceneId, label, kind, x, y, feedback, sound));
        if (scene.activity) {
          run('INSERT INTO ias_activities(story_id,scene_number,type,prompt,options,answer,feedback) VALUES (?,?,?,?,?,?,?)',
            storyId, i + 1, scene.activity.type, scene.activity.prompt,
            JSON.stringify(scene.activity.options), scene.activity.answer, scene.activity.feedback);
        }
      });
    });
  });
}

export function hydrateGame(row) {
  if (!row) return null;
  const game = { ...row, config: jsonParse(row.config, {}), cover_image: row.cover_image || '' };
  const questions = all('SELECT * FROM game_questions WHERE game_id = ? ORDER BY sort_order, id', row.id)
    .map((q) => ({
      ...q,
      metadata: jsonParse(q.metadata, {}),
      choices: all('SELECT * FROM answer_choices WHERE question_id = ? ORDER BY sort_order, id', q.id)
        .map((c) => ({ ...c, is_correct: Boolean(c.is_correct) }))
    }));
  return { ...game, questions };
}

export function seedIfEmpty() {
  const roleCount = get('SELECT COUNT(*) c FROM roles').c;
  if (roleCount) return false;

  run("INSERT INTO roles(name,description) VALUES ('admin','System administrator')");
  run("INSERT INTO roles(name,description) VALUES ('teacher','Creates and manages learning content')");
  run("INSERT INTO roles(name,description) VALUES ('student','Plays assigned learning games')");

  const subjects = [
    ['Mathematics', 'MATH', 'Numbers, operations, geometry and data', '#6366f1', '➗'],
    ['Science', 'SCI', 'Living and non-living systems', '#0ea5e9', '🔬'],
    ['English', 'ENG', 'Reading, writing, speaking and listening', '#f59e0b', '📖'],
    ['Filipino', 'FIL', 'Wika at panitikan', '#ef4444', '🇵🇭'],
    ['Social Studies', 'SOC', 'History, geography and citizenship', '#10b981', '🌏'],
    ['Values Education', 'VAL', 'Character and values formation', '#ec4899', '💖'],
    ['MAPEH', 'MAPEH', 'Music, arts, physical education and health', '#8b5cf6', '🎨'],
    ['TLE', 'TLE', 'Technology and livelihood education', '#14b8a6', '🛠️']
  ];
  for (const [name, code, description, color, icon] of subjects) {
    run('INSERT INTO subjects(name,code,description,color,icon) VALUES (?,?,?,?,?)', name, code, description, color, icon);
  }

  // Deliberately sample/unverified: EduPlay never ships fabricated official DepEd codes.
  const samples = [
    ['Mathematics', 'Grade 4', 'Number sense', 'Uses numbers to describe and compare quantities in real-life situations.'],
    ['Science', 'Grade 4', 'Living things', 'Identifies structures and functions of living things in the environment.'],
    ['English', 'Grade 4', 'Reading comprehension', 'Identifies the main idea and supporting details in an informational text.'],
    ['Filipino', 'Grade 4', 'Pagbasa', 'Nakikilala ang pangunahing kaisipan sa isang binasang teksto.'],
    ['Social Studies', 'Grade 5', 'Community', 'Describes the roles and responsibilities of community members.']
  ];
  for (const [subject, grade, title, description] of samples) {
    const sid = get('SELECT id FROM subjects WHERE name = ?', subject).id;
    run(`INSERT INTO curriculum_competencies(subject_id,grade_level,code,title,description,curriculum,reference,verified,created_by)
         VALUES (?,?,NULL,?,?,'DepEd MATATAG','Sample entry — verify against your official DepEd document',0,NULL)`,
      sid, grade, title, description);
  }

  const teacherRole = get("SELECT id FROM roles WHERE name='teacher'").id;
  const studentRole = get("SELECT id FROM roles WHERE name='student'").id;
  const teacherPass = hashPassword('Teacher123!');
  const studentPass = hashPassword('Student123!');
  run(`INSERT INTO users(username,email,password_hash,full_name,role_id,avatar_color)
       VALUES ('teacher','teacher@eduplay.ph',?,'Ms. Rivera',?,'#6366f1')`, teacherPass, teacherRole);
  run(`INSERT INTO users(username,email,password_hash,full_name,role_id,avatar_color)
       VALUES ('student','student@eduplay.ph',?,'Ana Reyes',?,'#f59e0b')`, studentPass, studentRole);
  const teacherId = get("SELECT id FROM users WHERE username='teacher'").id;
  const studentUserId = get("SELECT id FROM users WHERE username='student'").id;
  run(`INSERT INTO students(user_id,student_number,grade_level,section) VALUES (?, 'S-1001','Grade 4','Sunflower')`, studentUserId);
  const studentId = get('SELECT id FROM students WHERE user_id = ?', studentUserId).id;

  const mathId = get("SELECT id FROM subjects WHERE name='Mathematics'").id;
  const sciId = get("SELECT id FROM subjects WHERE name='Science'").id;
  const engId = get("SELECT id FROM subjects WHERE name='English'").id;

  run(`INSERT INTO classes(name,grade_level,subject_id,teacher_id,school_year,join_code)
       VALUES ('Grade 4 - Sunflower','Grade 4',?,?, '2026-2027','SUNFLOWER4')`, mathId, teacherId);
  const classId = get("SELECT id FROM classes WHERE join_code='SUNFLOWER4'").id;
  run('INSERT INTO class_students(class_id,student_id) VALUES (?,?)', classId, studentId);

  run(`INSERT INTO lessons(teacher_id,subject_id,grade_level,competency_id,title,description,objectives,status)
       VALUES (?,?,'Grade 4',1,'Numbers Around Us','A playful introduction to place value and operations.',
       'Compare and order numbers; solve one-step problems.','published')`, teacherId, mathId);
  const lessonId = get("SELECT id FROM lessons WHERE title='Numbers Around Us'").id;

  const rewardRows = [
    ['First Steps', 'Completed your first game', '🌱', JSON.stringify({ type: 'first_play' }), 10],
    ['Perfect Score', 'Answered every item correctly', '⭐', JSON.stringify({ type: 'perfect' }), 50],
    ['Sharp Shooter', 'Scored at least 80%', '🎯', JSON.stringify({ type: 'score_80' }), 25],
    ['Speed Star', 'Finished with time to spare', '⚡', JSON.stringify({ type: 'fast' }), 20],
    ['Persistent Learner', 'Retried an activity', '💪', JSON.stringify({ type: 'retry' }), 15]
  ];
  for (const r of rewardRows) {
    run('INSERT INTO rewards(name,description,icon,criteria,points) VALUES (?,?,?,?,?)', ...r);
  }

  function createGame({ title, type, subjectId, description, config = {}, questions }) {
    run(`INSERT INTO games(teacher_id,lesson_id,subject_id,grade_level,competency_id,title,description,type,difficulty,time_limit,points_per_question,config,status,source)
         VALUES (?,?,?,'Grade 4',1,?,?,?,?,?,?,?,'published','manual')`,
      teacherId, lessonId, subjectId, title, description, type,
      type === 'math' ? 'medium' : 'easy', type === 'wordsearch' ? 180 : null, 10,
      JSON.stringify(config));
    const gameId = Number(db.prepare('SELECT last_insert_rowid() id').get().id);
    questions.forEach((q, i) => {
      run(`INSERT INTO game_questions(game_id,prompt,explanation,points,metadata,sort_order)
           VALUES (?,?,?,NULL,?,?)`, gameId, q.prompt, q.explanation || '', JSON.stringify(q.metadata || {}), i);
      const qid = Number(db.prepare('SELECT last_insert_rowid() id').get().id);
      (q.choices || []).forEach((c, j) => {
        run('INSERT INTO answer_choices(question_id,text,is_correct,sort_order) VALUES (?,?,?,?)',
          qid, c.text, c.correct ? 1 : 0, j);
      });
    });
    return gameId;
  }

  createGame({
    title: 'Planet Facts Quiz', type: 'multiple_choice', subjectId: sciId,
    description: 'Test what you know about the solar system.',
    questions: [
      { prompt: 'Which planet is known as the Red Planet?', explanation: 'Mars has iron-rich dust that makes it look red.', choices: [
        { text: 'Venus', correct: false }, { text: 'Mars', correct: true }, { text: 'Jupiter', correct: false }, { text: 'Mercury', correct: false }] },
      { prompt: 'What is the largest planet in our solar system?', explanation: 'Jupiter is more than 11 times wider than Earth.', choices: [
        { text: 'Earth', correct: false }, { text: 'Saturn', correct: false }, { text: 'Jupiter', correct: true }, { text: 'Neptune', correct: false }] },
      { prompt: 'Which planet has the most famous ring system?', explanation: 'Saturn is well known for its bright rings of ice and rock.', choices: [
        { text: 'Saturn', correct: true }, { text: 'Mars', correct: false }, { text: 'Earth', correct: false }, { text: 'Uranus', correct: false }] }
    ]
  });

  createGame({
    title: 'Where Do They Live?', type: 'matching', subjectId: sciId,
    description: 'Match each animal to its home.',
    questions: [
      { prompt: 'Bee', metadata: { left: 'Bee', right: 'Hive' } },
      { prompt: 'Bird', metadata: { left: 'Bird', right: 'Nest' } },
      { prompt: 'Fish', metadata: { left: 'Fish', right: 'Coral reef' } },
      { prompt: 'Ant', metadata: { left: 'Ant', right: 'Anthill' } }
    ]
  });

  createGame({
    title: 'Math Sprint', type: 'math', subjectId: mathId,
    description: 'Quick mental math practice.',
    questions: [
      { prompt: '24 + 17 = ?', explanation: '24 + 17 = 41.', choices: [{ text: '41', correct: true }] },
      { prompt: '8 × 6 = ?', explanation: '8 × 6 = 48.', choices: [{ text: '48', correct: true }] },
      { prompt: '90 − 35 = ?', explanation: '90 − 35 = 55.', choices: [{ text: '55', correct: true }] }
    ]
  });

  createGame({
    title: 'Fact or Fiction?', type: 'true_false', subjectId: sciId,
    description: 'Decide if each statement is true or false.',
    questions: [
      { prompt: 'The Sun is a star.', explanation: 'The Sun is the star at the centre of our solar system.', choices: [
        { text: 'True', correct: true }, { text: 'False', correct: false }] },
      { prompt: 'Whales are fish.', explanation: 'Whales are mammals; they breathe air and feed their young milk.', choices: [
        { text: 'True', correct: false }, { text: 'False', correct: true }] }
    ]
  });

  createGame({
    title: 'Sentence Scramble', type: 'scramble', subjectId: engId,
    description: 'Unscramble the letters to make a word.',
    questions: [
      { prompt: 'A large ocean animal', explanation: 'Dolphin', choices: [{ text: 'DOLPHIN', correct: true }] },
      { prompt: 'You use it to write', explanation: 'Pencil', choices: [{ text: 'PENCIL', correct: true }] },
      { prompt: 'The opposite of cold', explanation: 'Hot', choices: [{ text: 'HOT', correct: true }] }
    ]
  });

  createGame({
    title: 'Science Word Search', type: 'wordsearch', subjectId: sciId,
    description: 'Find the hidden science words.',
    config: { gridSize: 12 },
    questions: [
      { prompt: 'Star', choices: [{ text: 'STAR', correct: true }] },
      { prompt: 'Plant', choices: [{ text: 'PLANT', correct: true }] },
      { prompt: 'Water', choices: [{ text: 'WATER', correct: true }] },
      { prompt: 'Rock', choices: [{ text: 'ROCK', correct: true }] }
    ]
  });

  const games = all("SELECT id,title FROM games WHERE status='published'");
  for (const g of games) {
    run(`INSERT INTO assignments(game_id,class_id,teacher_id,title,instructions,status)
         VALUES (?,?,?,?,?,'active')`, g.id, classId, teacherId, g.title, 'Play carefully and learn something new!');
  }

  return true;
}

function seedSupportingData() {
  // Administrator account for account governance and system settings.
  const adminRole = get("SELECT id FROM roles WHERE name='admin'")?.id;
  if (adminRole && !get("SELECT id FROM users WHERE username='admin' OR email='admin@eduplay.ph'")) {
    run(`INSERT INTO users(username,email,password_hash,full_name,role_id,avatar_color,approved)
         VALUES ('admin','admin@eduplay.ph',?,'System Administrator',?,'#0f172a',1)`,
      hashPassword('Admin123!'), adminRole);
  }

  const defaults = [
    ['site_name', 'EduPlay', 'Name shown in reports and exported documents.'],
    ['school_name', 'Sample Elementary School', 'Replace with your school name before printing official reports.'],
    ['default_language', 'en-US', 'Default narration language (en-US or fil-PH).'],
    ['default_reading_rate', '0.9', 'Default narration speed for the student reader.'],
    ['sound_enabled', 'true', 'Enable game sound effects by default.'],
    ['password_recovery_mode', 'developer', 'developer returns a one-time recovery code on screen; production requires an email provider.'],
    ['session_limit_minutes', '60', 'Maximum idle time before a login token expires.']
  ];
  for (const [key, value, description] of defaults) {
    run('INSERT OR IGNORE INTO system_settings(key,value,description) VALUES (?,?,?)', key, value, description);
  }

  const lesson = get("SELECT id FROM lessons WHERE title='Numbers Around Us'");
  if (lesson && !get('SELECT id FROM lesson_pages WHERE lesson_id=?', lesson.id)) {
    const pages = [
      ['Numbers Are Everywhere', 'Numbers help us describe the world around us. We use numbers to count stars in the sky, books on a shelf, and friends in a classroom. Every number has a place, and every place has a value.'],
      ['Place Value', 'In the number 345, the digit 3 stands for three hundreds, the 4 stands for four tens, and the 5 stands for five ones. The position of a digit tells us how much it is worth. That idea is called place value.'],
      ['Compare and Order', 'To compare two numbers, start with the digit on the left. The number with the greater digit in the highest place value is greater. We can arrange numbers from smallest to largest or from largest to smallest.']
    ];
    pages.forEach(([title, text], i) => {
      run('INSERT INTO lesson_pages(lesson_id,sort_order,title,text) VALUES (?,?,?,?)', lesson.id, i, title, text);
    });
    const vocab = [
      ['digit', 'A single symbol used to write a number, such as 0 through 9.'],
      ['place value', 'The value of a digit because of where it stands in a number.'],
      ['compare', 'To decide which number is greater, less, or equal.'],
      ['order', 'To arrange numbers in a particular sequence.']
    ];
    vocab.forEach(([term, definition], i) => {
      run('INSERT INTO lesson_vocabulary(lesson_id,term,definition,sort_order) VALUES (?,?,?,?)', lesson.id, term, definition, i);
    });
    run('UPDATE lessons SET extracted_text=? WHERE id=?', pages.map(([t, x]) => `${t}\n${x}`).join('\n\n'), lesson.id);
  }
}

const STORY_LIBRARY = [
  {
    title: 'The Little Seed', category: 'Short Stories', grade: 'Grade 3', subject: 'English', emoji: '🌱',
    description: 'A seed learns that growing takes patience, water and sunlight.',
    sections: [
      ['A Tiny Beginning', 'A little seed slept in the dark soil. One morning, rain tapped on the ground. The seed felt water around it and began to wake up.'],
      ['Reaching for Light', 'The seed pushed a small green shoot through the soil. It reached toward the warm sun. Day by day, the shoot grew taller and stronger.']
    ],
    vocab: [['soil', 'The ground where plants grow.'], ['sprout', 'A young plant just coming out of the ground.'], ['patience', 'Waiting calmly for something to happen.']],
    comprehension: [
      { prompt: 'What woke the seed?', choices: ['Rain', 'Wind', 'A bird', 'Moonlight'], answer: 'Rain', explanation: 'The text says rain tapped on the ground.' }
    ]
  },
  {
    title: 'The Honest Gardener', category: 'Moral Stories', grade: 'Grade 4', subject: 'Values Education', emoji: '🌻',
    description: 'A gardener tells the truth about a broken pot and earns trust.',
    sections: [
      ['The Broken Pot', 'Maya knocked over a clay pot while carrying water. The pot cracked, but no one saw her. She felt worried and wanted to hide it.'],
      ['A Brave Choice', 'Maya told her grandfather what happened. He thanked her for being honest. Together, they repaired the pot and placed it back in the garden.']
    ],
    vocab: [['honest', 'Telling the truth.'], ['repair', 'To fix something that is broken.'], ['trust', 'Belief that someone will do what is right.']],
    comprehension: [
      { prompt: 'What did Maya do after breaking the pot?', choices: ['She hid it', 'She told the truth', 'She left the garden', 'She blamed the wind'], answer: 'She told the truth', explanation: 'Maya told her grandfather what happened.' }
    ]
  },
  {
    title: 'The Ant and the Grain', category: 'Fables and Folktales', grade: 'Grade 2', subject: 'English', emoji: '🐜',
    description: 'A small ant shows that teamwork makes hard work easier.',
    sections: [
      ['One Grain', 'An ant found a grain of rice bigger than itself. She tried to push it alone, but the grain would not move.'],
      ['Many Helpers', 'The ant called her friends. Together, they lifted the grain and carried it to their nest. The work felt light when everyone helped.']
    ],
    vocab: [['grain', 'A small seed of rice or wheat.'], ['teamwork', 'Working together.'], ['nest', 'A home built by an animal.']],
    comprehension: [
      { prompt: 'How did the ants move the grain?', choices: ['One ant pushed it', 'They worked together', 'The wind moved it', 'They rolled it downhill'], answer: 'They worked together', explanation: 'The ant called her friends and they carried it together.' }
    ]
  },
  {
    title: 'Kiko and the Lost Kitten', category: 'Animal Stories', grade: 'Grade 3', subject: 'English', emoji: '🐱',
    description: 'A kind boy helps a lost kitten find its way home.',
    sections: [
      ['A Soft Meow', 'Kiko heard a soft meow beside the fence. A small kitten was hiding there. Its fur was dusty and its eyes were wide with fear.'],
      ['Finding Home', 'Kiko asked neighbours about the kitten. A girl nearby ran over and called it "Mochi." The kitten jumped into her arms and purred happily.']
    ],
    vocab: [['kitten', 'A young cat.'], ['dusty', 'Covered with dust.'], ['purred', 'Made a soft happy sound, as a cat does.']],
    comprehension: [
      { prompt: 'Where did Kiko find the kitten?', choices: ['In a tree', 'Beside the fence', 'In a box', 'At school'], answer: 'Beside the fence', explanation: 'The story says the kitten was hiding beside the fence.' }
    ]
  },
  {
    title: 'The Map in the Backpack', category: 'Adventure Stories', grade: 'Grade 5', subject: 'English', emoji: '🗺️',
    description: 'Two friends follow a hand-drawn map to a hidden garden.',
    sections: [
      ['The Old Map', 'Ana found a folded map in her backpack. It showed three turns, a blue gate and a small star beside a garden.'],
      ['The Hidden Garden', 'Ana and Ben followed the map. After the third turn, they saw the blue gate. Behind it was a quiet garden full of yellow flowers.']
    ],
    vocab: [['folded', 'Bent or creased.'], ['gate', 'An opening in a fence or wall.'], ['hidden', 'Hard to find.']],
    comprehension: [
      { prompt: 'What was beside the garden on the map?', choices: ['A river', 'A star', 'A school', 'A mountain'], answer: 'A star', explanation: 'The map showed a small star beside the garden.' }
    ]
  },
  {
    title: 'Ang Maliit na Bayan', category: 'Filipino Stories', grade: 'Grade 4', subject: 'Filipino', language: 'Filipino', emoji: '🇵🇭',
    description: 'Isang kwento tungkol sa pagtutulungan sa isang maliit na bayan.',
    sections: [
      ['Ang Tulay', 'Sa isang maliit na bayan, nasira ang tulay matapos ang malak na ulan. Hindi makatawid ang mga tao papuntang palengke.'],
      ['Pagtutulungan', 'Nagpulong ang mga baryo. Nagdala sila ng kahoy, pako at martilyo. Sa loob ng isang araw, ayos na ang tulay at masaya ang lahat.']
    ],
    vocab: [['tulay', 'Daan para makatawid sa ilog o bangin.'], ['ulan', 'Malakas na pag-ulan.'], ['pagtutulungan', 'Pagtulong sa isa’t isa.']],
    comprehension: [
      { prompt: 'Ano ang nangyari sa tulay?', choices: ['Nasira ito', 'Naging kulay asul', 'Nawala ito', 'Tumubo ito'], answer: 'Nasira ito', explanation: 'Sinabi sa teksto na nasira ang tulay matapos ang ulan.' }
    ]
  },
  {
    title: 'The Rainy Day Picnic', category: 'English Stories', grade: 'Grade 2', subject: 'English', emoji: '🌧️',
    description: 'A picnic moves indoors when the rain arrives.',
    sections: [
      ['Clouds Above', 'Lia packed sandwiches for a picnic. Dark clouds appeared above the park. Then rain began to fall on the grass.'],
      ['A New Plan', 'Lia and her family moved the picnic to the living room. They ate sandwiches, played cards and listened to the rain on the roof.']
    ],
    vocab: [['picnic', 'A meal eaten outdoors.'], ['clouds', 'Soft grey shapes in the sky.'], ['roof', 'The top covering of a house.']],
    comprehension: [
      { prompt: 'Saan nangyari ang picnic sa huli?', choices: ['Sa parke', 'Sa silid-kainan', 'Sa paaralan', 'Sa bukid'], answer: 'Sa silid-kainan', explanation: 'The family moved the picnic to the living room.' }
    ]
  },
  {
    title: 'Why Leaves Change Colour', category: 'Science Reading', grade: 'Grade 4', subject: 'Science', emoji: '🍁',
    description: 'A short science passage about chlorophyll and autumn leaves.',
    sections: [
      ['Green Leaves', 'During spring and summer, leaves contain chlorophyll. Chlorophyll helps plants use sunlight to make food and gives leaves their green colour.'],
      ['Autumn Colours', 'In autumn, some plants stop making chlorophyll. The green colour fades, and yellow and orange colours become easier to see.']
    ],
    vocab: [['chlorophyll', 'The green material in leaves that helps plants use sunlight.'], ['autumn', 'The season after summer.'], ['fade', 'To become lighter or weaker.']],
    comprehension: [
      { prompt: 'What helps leaves make food using sunlight?', choices: ['Rain', 'Chlorophyll', 'Wind', 'Soil'], answer: 'Chlorophyll', explanation: 'The passage says chlorophyll helps plants use sunlight to make food.' }
    ]
  },
  {
    title: 'The First School Bell', category: 'Historical Stories', grade: 'Grade 5', subject: 'Social Studies', emoji: '🔔',
    description: 'A imagined look at a community school long ago.',
    sections: [
      ['Early Morning', 'Long ago, the school bell rang before sunrise. Children walked along dusty roads carrying slates and small wooden pencils.'],
      ['One Classroom', 'One teacher taught many grades in a single room. Older pupils helped younger ones read the lesson written on the board.']
    ],
    vocab: [['slate', 'A flat board used for writing long ago.'], ['pupil', 'A student.'], ['lesson', 'Something taught or learned.']],
    comprehension: [
      { prompt: 'What did children carry to school?', choices: ['Books and bags', 'Slates and pencils', 'Phones', 'Lunch boxes only'], answer: 'Slates and pencils', explanation: 'The passage says children carried slates and small wooden pencils.' }
    ]
  },
  {
    title: 'Words That Build', category: 'Vocabulary Reading', grade: 'Grade 3', subject: 'English', emoji: '🔤',
    description: 'A passage that teaches words about building and repair.',
    sections: [
      ['The Workshop', 'A carpenter measures wood with a ruler. She cuts a board, sands the edge and joins it to another board with glue.'],
      ['A Finished Shelf', 'The shelf is sturdy now. It can hold books without bending. The carpenter checks every corner before she paints it.']
    ],
    vocab: [['measure', 'To find the size of something.'], ['sturdy', 'Strong and not easily broken.'], ['sands', 'Makes a surface smooth.']],
    comprehension: [
      { prompt: 'What does the carpenter use to measure wood?', choices: ['A ruler', 'A brush', 'A hammer', 'A spoon'], answer: 'A ruler', explanation: 'The passage says she measures wood with a ruler.' }
    ]
  },
  {
    title: 'Finding the Main Idea', category: 'Reading Comprehension', grade: 'Grade 4', subject: 'English', emoji: '📝',
    description: 'A practice passage with details that support one main idea.',
    sections: [
      ['A Busy Garden', 'The school garden is busy every afternoon. Students water the vegetables, pull weeds and count the tomatoes. Others write notes in their garden journals.'],
      ['One Big Idea', 'All these tasks help the garden grow. The main idea is that students work together to care for the school garden.']
    ],
    vocab: [['main idea', 'The most important point in a text.'], ['detail', 'A small piece of information.'], ['journal', 'A notebook for written notes.']],
    comprehension: [
      { prompt: 'What is the main idea of the passage?', choices: ['Students help care for the garden', 'Tomatoes are red', 'Journals are heavy', 'Afternoons are long'], answer: 'Students help care for the garden', explanation: 'The final section states the main idea directly.' }
    ]
  }
];

const coverSvg = (emoji, title) => {
  const safe = String(title).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs><rect width="640" height="360" rx="28" fill="url(#g)"/><circle cx="540" cy="70" r="90" fill="#ffffff" opacity=".12"/><text x="320" y="160" font-size="96" text-anchor="middle">${emoji}</text><text x="320" y="260" font-size="30" font-family="Arial,sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${safe}</text><text x="320" y="305" font-size="17" font-family="Arial,sans-serif" fill="#e0e7ff" text-anchor="middle">EduPlay Original Story</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

function seedLibraryData() {
  const teacher = get("SELECT id FROM users WHERE username='teacher'");
  if (!teacher) return;
  for (const story of STORY_LIBRARY) {
    if (get('SELECT id FROM stories WHERE teacher_id=? AND title=?', teacher.id, story.title)) continue;
    run(`INSERT INTO stories(teacher_id,title,category,grade_level,subject,language,description,cover_url,cover_emoji,source_note,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,'published')`,
      teacher.id, story.title, story.category, story.grade, story.subject, story.language || 'English', story.description,
      coverSvg(story.emoji, story.title), story.emoji,
      'Original EduPlay content created for this application; licensed for use inside EduPlay.');
    const storyId = Number(db.prepare('SELECT last_insert_rowid() id').get().id);
    story.sections.forEach(([title, text], i) => {
      run('INSERT INTO story_sections(story_id,section_number,title,text) VALUES (?,?,?,?)', storyId, i, title, text);
    });
    story.vocab.forEach(([term, definition], i) => {
      run('INSERT INTO story_vocabulary(story_id,term,definition,sort_order) VALUES (?,?,?,?)', storyId, term, definition, i);
    });
    story.comprehension.forEach((item, i) => {
      run('INSERT INTO story_comprehension(story_id,prompt,choices,answer,explanation,source_quote,sort_order) VALUES (?,?,?,?,?,?,?)',
        storyId, item.prompt, JSON.stringify(item.choices.map((text) => ({ text, is_correct: text === item.answer }))),
        item.answer, item.explanation, item.explanation, i);
    });
  }
}

seedIfEmpty();
seedInteractiveStories();
seedSupportingData();
// Sample stories are opt-in: a fresh install starts with an empty Story Library.
// Set EDUPLAY_SEED_STORIES=1 before the first start to restore the 11 original samples.
if (process.env.EDUPLAY_SEED_STORIES === '1') seedLibraryData();

if (process.argv.includes('--reset')) {
  db.close();
  const { rmSync } = await import('node:fs');
  rmSync(DB_PATH, { force: true });
  rmSync(DB_PATH + '-wal', { force: true });
  rmSync(DB_PATH + '-shm', { force: true });
  console.log('Database removed. Run npm start to recreate and seed it.');
}
