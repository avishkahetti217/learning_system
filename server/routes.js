import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db, DIFFS, snapshot, setIntervals } from './db.js';

const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#db2777', '#7c3aed', '#2563eb', '#dc2626'];

/* ---------- Validation ---------- */

const httpError = (status, message) => Object.assign(new Error(message), { status });
const bad = message => httpError(400, message);

function text(v, name, { max = 20000, optional = false } = {}) {
  if (v == null && optional) return '';
  if (typeof v !== 'string') throw bad(`${name} is required`);
  v = v.trim();
  if (!v && !optional) throw bad(`${name} is required`);
  if (v.length > max) throw bad(`${name} is too long`);
  return v;
}
function int(v, name, min = 1, max = 9999) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}`);
  return n;
}
function isoDate(v, name) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw bad(`${name} must be a valid date`);
  return v;
}
function difficulty(v) {
  if (!DIFFS.includes(v)) throw bad('Difficulty must be easy, medium or hard');
  return v;
}
const flag = v => (v ? 1 : 0);
const today = () => new Date().toISOString().slice(0, 10);

/** Applies whitelisted fields from `body` to one row. `fields` maps body key -> [column, parser]. */
function update(table, id, body, fields) {
  const sets = [], values = [];
  for (const [key, [column, parse]] of Object.entries(fields)) {
    if (key in body) { sets.push(`${column} = ?`); values.push(parse(body[key])); }
  }
  if (!sets.length) throw bad('Nothing to update');
  const { changes } = db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  if (!changes) throw httpError(404, 'Not found');
}

function remove(table, id) {
  if (!db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes) throw httpError(404, 'Not found');
}

function mustExist(table, id) {
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) throw httpError(404, 'Not found');
}

const nextPosition = (table, column, value) =>
  db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM ${table} WHERE ${column} = ?`).get(value).p;

/* ---------- Routes ---------- */

export const api = Router();

api.get('/data', (req, res) => res.json(snapshot()));

api.get('/export', (req, res) => {
  res.attachment(`learnlog-backup-${today()}.json`).json(snapshot());
});

// Courses
api.post('/courses', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM courses').get().n;
  const course = {
    id: randomUUID(),
    name: text(req.body.name, 'Course name', { max: 120 }),
    description: text(req.body.description, 'Description', { optional: true, max: 2000 }),
    color: COLORS[count % COLORS.length],
  };
  db.prepare('INSERT INTO courses (id, name, description, color) VALUES (@id, @name, @description, @color)').run(course);
  res.status(201).json(course);
});
api.patch('/courses/:id', (req, res) => {
  update('courses', req.params.id, req.body, {
    name: ['name', v => text(v, 'Course name', { max: 120 })],
    description: ['description', v => text(v, 'Description', { optional: true, max: 2000 })],
  });
  res.status(204).end();
});
api.delete('/courses/:id', (req, res) => { remove('courses', req.params.id); res.status(204).end(); });

// Modules
api.post('/modules', (req, res) => {
  const courseId = String(req.body.courseId);
  mustExist('courses', courseId);
  const mod = { id: randomUUID(), courseId, name: text(req.body.name, 'Module name', { max: 120 }), position: nextPosition('modules', 'course_id', courseId) };
  db.prepare('INSERT INTO modules (id, course_id, name, position) VALUES (@id, @courseId, @name, @position)').run(mod);
  res.status(201).json(mod);
});
api.patch('/modules/:id', (req, res) => {
  update('modules', req.params.id, req.body, { name: ['name', v => text(v, 'Module name', { max: 120 })] });
  res.status(204).end();
});
api.delete('/modules/:id', (req, res) => { remove('modules', req.params.id); res.status(204).end(); });

// Lessons
const lessonFields = {
  title: ['title', v => text(v, 'Lesson title', { max: 200 })],
  week: ['week', v => int(v, 'Week')],
  date: ['start_date', v => isoDate(v, 'Start date')],
  difficulty: ['difficulty', difficulty],
  completed: ['completed', flag],
  notes: ['notes', v => text(v, 'Notes', { optional: true, max: 100000 })],
  mindmapDone: ['mindmap_done', flag],
  mindmapLink: ['mindmap_link', v => text(v, 'Mind map link', { optional: true, max: 2000 })],
  noteDone: ['note_done', flag],
  noteLink: ['note_link', v => text(v, 'Note link', { optional: true, max: 2000 })],
};
api.post('/lessons', (req, res) => {
  const moduleId = String(req.body.moduleId);
  mustExist('modules', moduleId);
  const lesson = {
    id: randomUUID(),
    moduleId,
    title: text(req.body.title, 'Lesson title', { max: 200 }),
    week: int(req.body.week, 'Week'),
    date: isoDate(req.body.date, 'Start date'),
    difficulty: difficulty(req.body.difficulty ?? 'medium'),
  };
  db.prepare('INSERT INTO lessons (id, module_id, title, week, start_date, difficulty) VALUES (@id, @moduleId, @title, @week, @date, @difficulty)').run(lesson);
  res.status(201).json(lesson);
});
api.patch('/lessons/:id', (req, res) => { update('lessons', req.params.id, req.body, lessonFields); res.status(204).end(); });
api.delete('/lessons/:id', (req, res) => { remove('lessons', req.params.id); res.status(204).end(); });

// Revisions — keyed by the day offset in the lesson's revision plan
api.put('/lessons/:id/revisions/:offset', (req, res) => {
  mustExist('lessons', req.params.id);
  const offset = int(req.params.offset, 'Day', 0, 3650);
  const doneOn = req.body?.doneOn ? isoDate(req.body.doneOn, 'Done date') : today();
  db.prepare('INSERT OR REPLACE INTO revisions (lesson_id, day_offset, done_on) VALUES (?, ?, ?)').run(req.params.id, offset, doneOn);
  res.status(204).end();
});
api.delete('/lessons/:id/revisions/:offset', (req, res) => {
  db.prepare('DELETE FROM revisions WHERE lesson_id = ? AND day_offset = ?').run(req.params.id, Number(req.params.offset));
  res.status(204).end();
});

// Key points
api.post('/lessons/:id/points', (req, res) => {
  mustExist('lessons', req.params.id);
  const point = { id: randomUUID(), lessonId: req.params.id, text: text(req.body.text, 'Key point', { max: 2000 }), position: nextPosition('points', 'lesson_id', req.params.id) };
  db.prepare('INSERT INTO points (id, lesson_id, text, position) VALUES (@id, @lessonId, @text, @position)').run(point);
  res.status(201).json(point);
});
api.patch('/points/:id', (req, res) => {
  update('points', req.params.id, req.body, { text: ['text', v => text(v, 'Key point', { max: 2000 })] });
  res.status(204).end();
});
api.delete('/points/:id', (req, res) => { remove('points', req.params.id); res.status(204).end(); });

// Lecture videos
api.post('/lessons/:id/videos', (req, res) => {
  mustExist('lessons', req.params.id);
  const video = { id: randomUUID(), lessonId: req.params.id, title: text(req.body.title, 'Video title', { max: 300 }), position: nextPosition('videos', 'lesson_id', req.params.id) };
  db.prepare('INSERT INTO videos (id, lesson_id, title, position) VALUES (@id, @lessonId, @title, @position)').run(video);
  res.status(201).json(video);
});
api.patch('/videos/:id', (req, res) => {
  update('videos', req.params.id, req.body, {
    title: ['title', v => text(v, 'Video title', { max: 300 })],
    watched: ['watched', flag],
  });
  res.status(204).end();
});
api.delete('/videos/:id', (req, res) => { remove('videos', req.params.id); res.status(204).end(); });

// Flashcards
api.post('/lessons/:id/cards', (req, res) => {
  mustExist('lessons', req.params.id);
  const card = {
    id: randomUUID(), lessonId: req.params.id,
    front: text(req.body.front, 'Question', { max: 2000 }),
    back: text(req.body.back, 'Answer', { max: 5000 }),
    position: nextPosition('cards', 'lesson_id', req.params.id),
  };
  db.prepare('INSERT INTO cards (id, lesson_id, front, back, position) VALUES (@id, @lessonId, @front, @back, @position)').run(card);
  res.status(201).json(card);
});
api.patch('/cards/:id', (req, res) => {
  update('cards', req.params.id, req.body, {
    front: ['front', v => text(v, 'Question', { max: 2000 })],
    back: ['back', v => text(v, 'Answer', { max: 5000 })],
    hard: ['hard', flag],
  });
  res.status(204).end();
});
api.delete('/cards/:id', (req, res) => { remove('cards', req.params.id); res.status(204).end(); });

// Exam plans
function planModules(courseId, modules) {
  if (!Array.isArray(modules) || !modules.length) throw bad('Choose at least one module for the exam');
  const inCourse = new Set(db.prepare('SELECT id FROM modules WHERE course_id = ?').all(courseId).map(m => m.id));
  const seen = new Set();
  return modules.map(m => {
    const moduleId = String(m?.moduleId);
    if (!inCourse.has(moduleId)) throw bad('A selected module doesn’t belong to this course');
    if (seen.has(moduleId)) throw bad('A module was selected twice');
    seen.add(moduleId);
    return { moduleId, totalWeeks: int(m.totalWeeks, 'Weeks per module', 1, 52) };
  });
}
function studyDays(v) {
  const days = [...new Set(Array.isArray(v) ? v.map(Number) : [])].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) throw bad('Choose at least one study day');
  return JSON.stringify(days);
}
const planFields = {
  name: ['name', v => text(v, 'Plan name', { max: 120 })],
  examDate: ['exam_date', v => isoDate(v, 'Exam date')],
  studyDays: ['study_days', studyDays],
  bufferDays: ['buffer_days', v => int(v, 'Final review days', 0, 60)],
  dailyCapacity: ['daily_capacity', v => int(v, 'Daily load', 1, 20)],
  defaultDifficulty: ['default_difficulty', difficulty],
};
const savePlanModules = (planId, modules) => {
  db.prepare('DELETE FROM exam_plan_modules WHERE plan_id = ?').run(planId);
  const ins = db.prepare('INSERT INTO exam_plan_modules (plan_id, module_id, total_weeks) VALUES (?, ?, ?)');
  for (const m of modules) ins.run(planId, m.moduleId, m.totalWeeks);
};

api.post('/plans', (req, res) => {
  const courseId = String(req.body.courseId);
  mustExist('courses', courseId);
  const plan = {
    id: randomUUID(), courseId,
    name: text(req.body.name, 'Plan name', { max: 120 }),
    examDate: isoDate(req.body.examDate, 'Exam date'),
    studyDays: studyDays(req.body.studyDays ?? [1, 2, 3, 4, 5, 6]),
    bufferDays: int(req.body.bufferDays ?? 3, 'Final review days', 0, 60),
    dailyCapacity: int(req.body.dailyCapacity ?? 3, 'Daily load', 1, 20),
    defaultDifficulty: difficulty(req.body.defaultDifficulty ?? 'medium'),
  };
  const modules = planModules(courseId, req.body.modules);
  db.transaction(() => {
    db.prepare(`INSERT INTO exam_plans (id, course_id, name, exam_date, study_days, buffer_days, daily_capacity, default_difficulty)
                VALUES (@id, @courseId, @name, @examDate, @studyDays, @bufferDays, @dailyCapacity, @defaultDifficulty)`).run(plan);
    savePlanModules(plan.id, modules);
  })();
  res.status(201).json({ id: plan.id });
});
api.patch('/plans/:id', (req, res) => {
  const row = db.prepare('SELECT course_id AS courseId FROM exam_plans WHERE id = ?').get(req.params.id);
  if (!row) throw httpError(404, 'Not found');
  const modules = 'modules' in req.body ? planModules(row.courseId, req.body.modules) : null;
  const { modules: _, ...fields } = req.body;
  db.transaction(() => {
    if (Object.keys(fields).length) update('exam_plans', req.params.id, fields, planFields);
    if (modules) savePlanModules(req.params.id, modules);
  })();
  res.status(204).end();
});
api.delete('/plans/:id', (req, res) => { remove('exam_plans', req.params.id); res.status(204).end(); });

// Settings
api.put('/settings', (req, res) => {
  const input = req.body?.intervals || {};
  const intervals = {};
  for (const d of DIFFS) {
    const days = [...new Set((Array.isArray(input[d]) ? input[d] : []).map(Number))]
      .filter(n => Number.isInteger(n) && n > 0 && n <= 3650)
      .sort((a, b) => a - b);
    if (!days.length || days.length > 30) throw bad(`Enter between 1 and 30 revision days for ${d}`);
    intervals[d] = days;
  }
  setIntervals(intervals);
  res.json({ intervals });
});

// Import a backup (replaces everything). Accepts the export format, including backups from the old browser-only version.
api.post('/import', (req, res) => {
  const data = req.body;
  if (!data || !Array.isArray(data.courses) || !Array.isArray(data.modules) || !Array.isArray(data.lessons)) {
    throw bad('That file isn’t a valid LearnLog backup');
  }
  const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
  db.transaction(() => {
    db.prepare('DELETE FROM courses').run(); // cascades to everything else
    const insCourse = db.prepare('INSERT INTO courses (id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)');
    const insModule = db.prepare('INSERT INTO modules (id, course_id, name, position) VALUES (?, ?, ?, ?)');
    const insLesson = db.prepare('INSERT INTO lessons (id, module_id, title, week, start_date, difficulty, completed, notes, mindmap_done, mindmap_link, note_done, note_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insVideo = db.prepare('INSERT INTO videos (id, lesson_id, title, watched, position) VALUES (?, ?, ?, ?, ?)');
    const insPoint = db.prepare('INSERT INTO points (id, lesson_id, text, position) VALUES (?, ?, ?, ?)');
    const insCard = db.prepare('INSERT INTO cards (id, lesson_id, front, back, hard, position) VALUES (?, ?, ?, ?, ?, ?)');
    const insRev = db.prepare('INSERT INTO revisions (lesson_id, day_offset, done_on) VALUES (?, ?, ?)');

    const courseIds = new Set(), moduleIds = new Set();
    data.courses.forEach((c, i) => {
      insCourse.run(str(c.id, randomUUID()), str(c.name, 'Untitled course'), str(c.description), str(c.color, COLORS[i % COLORS.length]), str(c.createdAt, today()));
      courseIds.add(c.id);
    });
    data.modules.filter(m => courseIds.has(m.courseId)).forEach((m, i) => {
      insModule.run(m.id, m.courseId, str(m.name, 'Untitled module'), i + 1);
      moduleIds.add(m.id);
    });
    for (const l of data.lessons.filter(l => moduleIds.has(l.moduleId))) {
      insLesson.run(l.id, l.moduleId, str(l.title, 'Untitled lesson'), Number(l.week) || 1, str(l.date, today()),
        DIFFS.includes(l.difficulty) ? l.difficulty : 'medium', flag(l.completed), str(l.notes), flag(l.mindmapDone), str(l.mindmapLink), flag(l.noteDone), str(l.noteLink));
      (l.videos || []).forEach((v, i) => insVideo.run(str(v.id, randomUUID()), l.id, str(v.title), flag(v.watched), i + 1));
      (l.points || []).forEach((p, i) => insPoint.run(str(p.id, randomUUID()), l.id, str(p.text), i + 1));
      (l.cards || []).forEach((c, i) => insCard.run(str(c.id, randomUUID()), l.id, str(c.front), str(c.back), flag(c.hard), i + 1));
      for (const [offset, doneOn] of Object.entries(l.revDone || {})) insRev.run(l.id, Number(offset), str(doneOn, today()));
    }
    const insPlan = db.prepare('INSERT INTO exam_plans (id, course_id, name, exam_date, study_days, buffer_days, daily_capacity, default_difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insPlanModule = db.prepare('INSERT OR IGNORE INTO exam_plan_modules (plan_id, module_id, total_weeks) VALUES (?, ?, ?)');
    for (const p of (Array.isArray(data.plans) ? data.plans : []).filter(p => courseIds.has(p.courseId))) {
      const days = Array.isArray(p.studyDays) ? p.studyDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
      const planId = str(p.id, randomUUID());
      insPlan.run(planId, p.courseId, str(p.name, 'Exam'), str(p.examDate, today()), JSON.stringify(days.length ? days : [1, 2, 3, 4, 5, 6]),
        Number.isInteger(p.bufferDays) ? p.bufferDays : 3, Number.isInteger(p.dailyCapacity) ? p.dailyCapacity : 3,
        DIFFS.includes(p.defaultDifficulty) ? p.defaultDifficulty : 'medium');
      for (const m of p.modules || []) if (moduleIds.has(m.moduleId)) insPlanModule.run(planId, m.moduleId, Number(m.totalWeeks) || 12);
    }
    if (data.settings?.intervals) setIntervals(data.settings.intervals);
  })();
  res.json(snapshot());
});

api.use((req, res) => res.status(404).json({ error: 'Not found' }));
