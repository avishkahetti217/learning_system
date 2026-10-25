import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.DB_PATH || path.join(root, 'data', 'learnlog.db');
fs.mkdirSync(path.dirname(file), { recursive: true });

export const DIFFS = ['easy', 'medium', 'hard'];
// Days after a lesson's start date when a revision is due. Harder = more revisions.
export const DEFAULT_INTERVALS = { easy: [1, 7, 30], medium: [1, 3, 7, 14, 30], hard: [1, 2, 4, 7, 14, 30, 60] };

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (date('now'))
  );
  CREATE TABLE IF NOT EXISTS modules (
    id        TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    position  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id         TEXT PRIMARY KEY,
    module_id  TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    week       INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    completed  INTEGER NOT NULL DEFAULT 0,
    notes      TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS points (
    id        TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    text      TEXT NOT NULL,
    position  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cards (
    id        TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    front     TEXT NOT NULL,
    back      TEXT NOT NULL,
    hard      INTEGER NOT NULL DEFAULT 0,
    position  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS revisions (
    lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    day_offset INTEGER NOT NULL,
    done_on    TEXT NOT NULL,
    PRIMARY KEY (lesson_id, day_offset)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);
  CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id);
  CREATE INDEX IF NOT EXISTS idx_points_lesson ON points(lesson_id);
  CREATE INDEX IF NOT EXISTS idx_cards_lesson ON cards(lesson_id);
`);

export function getIntervals() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'intervals'").get();
  return { ...DEFAULT_INTERVALS, ...(row ? JSON.parse(row.value) : {}) };
}

export function setIntervals(intervals) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('intervals', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(intervals));
}

const groupBy = (rows, key) => {
  const map = new Map();
  for (const { [key]: k, ...rest } of rows) {
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(rest);
  }
  return map;
};

// Everything the UI needs in one payload. It is also the backup/export format.
export function snapshot() {
  const courses = db.prepare('SELECT id, name, description, color, created_at AS createdAt FROM courses ORDER BY created_at, rowid').all();
  const modules = db.prepare('SELECT id, course_id AS courseId, name, position FROM modules ORDER BY position').all();
  const points = groupBy(db.prepare('SELECT lesson_id, id, text FROM points ORDER BY position').all(), 'lesson_id');
  const cards = groupBy(db.prepare('SELECT lesson_id, id, front, back, hard FROM cards ORDER BY position').all(), 'lesson_id');
  const revisions = groupBy(db.prepare('SELECT lesson_id, day_offset, done_on FROM revisions').all(), 'lesson_id');
  const lessons = db.prepare(`
    SELECT l.id, l.module_id AS moduleId, m.course_id AS courseId, l.title, l.week, l.start_date AS date,
           l.difficulty, l.completed, l.notes
    FROM lessons l JOIN modules m ON m.id = l.module_id
  `).all().map(l => ({
    ...l,
    completed: !!l.completed,
    points: points.get(l.id) || [],
    cards: (cards.get(l.id) || []).map(c => ({ ...c, hard: !!c.hard })),
    revDone: Object.fromEntries((revisions.get(l.id) || []).map(r => [r.day_offset, r.done_on])),
  }));
  return { courses, modules, lessons, settings: { intervals: getIntervals() } };
}
