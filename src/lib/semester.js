import { addDays, daysBetween, today } from './dates.js';

/**
 * Where a course stands against its semester calendar. Every module has one lesson per week.
 *
 * Weeks that have already ended are "due". For each module and due week:
 *  - no lesson in the app yet       → lecture notes not created (`missing`)
 *  - lesson added but not completed → `pending`
 * The current week is reported separately and never counts as behind.
 * Weeks behind = (missing + pending) / number of modules.
 */
export function semesterStatus(course, modules, lessonsOf, now = today()) {
  if (!course.startDate || !course.semesterWeeks) return null;
  const total = course.semesterWeeks;
  const elapsedDays = daysBetween(course.startDate, now);
  const notStarted = elapsedDays < 0;
  const currentWeek = notStarted ? 0 : Math.floor(elapsedDays / 7) + 1;
  const finished = currentWeek > total;
  const dueWeeks = finished ? total : Math.max(0, currentWeek - 1);

  const missing = [], pending = [], thisWeek = [];
  let notesMissing = 0;
  const perModule = modules.map(m => {
    const lessons = lessonsOf(m.id);
    let behind = 0, completed = 0;
    for (let week = 1; week <= dueWeeks; week++) {
      const ofWeek = lessons.filter(l => l.week === week);
      if (!ofWeek.length) {
        missing.push({ module: m, week });
        behind++;
        continue;
      }
      for (const lesson of ofWeek) {
        if (lesson.completed) completed++;
        else { pending.push({ module: m, week, lesson }); behind++; }
        if (!lesson.noteDone) notesMissing++;
      }
    }
    if (!finished && currentWeek >= 1) {
      const ofWeek = lessons.filter(l => l.week === currentWeek);
      thisWeek.push({ module: m, week: currentWeek, lessons: ofWeek });
    }
    return { module: m, behind, completed, expected: dueWeeks };
  });

  const behindLessons = missing.length + pending.length;
  const weeksBehind = modules.length ? behindLessons / modules.length : 0;
  // Last week up to which every module is fully done
  const firstGap = Math.min(dueWeeks + 1, ...[...missing, ...pending].map(x => x.week));
  const caughtUpThrough = firstGap - 1;

  let tone = 'easy', label = 'On track';
  if (weeksBehind >= 2) { tone = 'hard'; label = `${fmtWeeks(weeksBehind)} behind`; }
  else if (weeksBehind > 0) { tone = 'medium'; label = `${fmtWeeks(weeksBehind)} behind`; }

  const byWeek = (a, b) => (a.week - b.week) || (a.module.position - b.module.position);
  return {
    total, currentWeek, notStarted, finished, dueWeeks,
    startsIn: notStarted ? -elapsedDays : 0,
    endDate: addDays(course.startDate, total * 7 - 1),
    weekEnds: currentWeek >= 1 && !finished ? addDays(course.startDate, currentWeek * 7 - 1) : null,
    timePct: Math.round(Math.min(1, Math.max(0, elapsedDays + 1) / (total * 7)) * 100),
    missing: missing.sort(byWeek), pending: pending.sort(byWeek), thisWeek, notesMissing,
    behindLessons, weeksBehind, caughtUpThrough, perModule, tone, label,
  };
}

export const fmtWeeks = n => {
  const r = Math.round(n * 10) / 10;
  return `${r} week${r === 1 ? '' : 's'}`;
};
