import { addDays, today } from './dates.js';

export const DIFFS = ['easy', 'medium', 'hard'];
export const DEFAULT_INTERVALS = { easy: [1, 7, 30], medium: [1, 3, 7, 14, 30], hard: [1, 2, 4, 7, 14, 30, 60] };

/** The lesson's revision plan: one entry per interval day, counted from its start date. */
export function schedule(lesson, intervals) {
  return (intervals[lesson.difficulty] || []).map((offset, i) => ({
    n: i + 1, offset, due: addDays(lesson.date, offset), done: lesson.revDone[offset] || null,
  }));
}

export const nextRevision = (lesson, intervals) => schedule(lesson, intervals).find(r => !r.done) || null;

export function isDue(lesson, intervals) {
  const r = nextRevision(lesson, intervals);
  return !!r && r.due <= today();
}

export function progress(lessons) {
  const done = lessons.filter(l => l.completed).length;
  return { done, total: lessons.length, pct: lessons.length ? Math.round(done / lessons.length * 100) : 0 };
}
