import { addDays, daysBetween, parseISO, today } from './dates.js';
import { schedule } from './plan.js';

export const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
/** A revision is quicker than learning a lesson, so it counts as half a lesson of load. */
export const REVISION_WEIGHT = 0.5;

export const STATUS = {
  relaxed: { label: 'Relaxed', tone: 'easy' },
  comfortable: { label: 'Comfortable', tone: 'easy' },
  busy: { label: 'Busy but doable', tone: 'medium' },
  tight: { label: 'Tight', tone: 'hard' },
  overloaded: { label: 'Overloaded', tone: 'hard' },
  covered: { label: 'All lessons covered', tone: 'easy' },
  past: { label: 'Exam finished', tone: '' },
};

/**
 * Projects a day-by-day study plan from `start` up to (not including) the exam day.
 *
 * - Each tested module has one lesson per week (`totalWeeks`); completed lessons are covered,
 *   everything else — including weeks not yet added to the app — still has to be learned.
 * - Remaining lessons are interleaved week by week across modules and spread evenly over the
 *   study days before the final review window.
 * - Revisions: pending ones for completed lessons, plus projected ones for lessons as they get
 *   learned (using the lesson's difficulty, or the plan default for lessons not added yet).
 *   A revision that falls on a rest day moves to the next study day.
 * - The final review window (last `bufferDays` days) has no new lessons; modules are reviewed in turn.
 *
 * It is recomputed from current progress every time, so falling behind or getting ahead rebalances it.
 */
export function buildExamPlan(plan, { mod, lessonsOf }, intervals, start = today()) {
  const exam = plan.examDate;
  const daysLeft = daysBetween(start, exam);
  const cap = plan.dailyCapacity;

  const modules = plan.modules
    .map(pm => ({ ...pm, module: mod(pm.moduleId) }))
    .filter(pm => pm.module)
    .sort((a, b) => a.module.position - b.module.position);

  // What's left to learn
  const toLearn = [];
  const moduleStats = modules.map((pm, order) => {
    const lessons = lessonsOf(pm.moduleId);
    const weeks = Math.max(pm.totalWeeks, ...lessons.map(l => l.week));
    let done = 0, total = 0;
    for (let week = 1; week <= weeks; week++) {
      const ofWeek = lessons.filter(l => l.week === week);
      if (!ofWeek.length) {
        total++;
        toLearn.push({ moduleId: pm.moduleId, order, week, lesson: null });
        continue;
      }
      for (const lesson of ofWeek) {
        total++;
        if (lesson.completed) done++;
        else toLearn.push({ moduleId: pm.moduleId, order, week, lesson });
      }
    }
    return { moduleId: pm.moduleId, module: pm.module, done, total, remaining: total - done, finishBy: null };
  });
  toLearn.sort((a, b) => (a.week - b.week) || (a.order - b.order));

  // Calendar up to the exam
  const days = [];
  for (let i = 0; i < Math.max(daysLeft, 0); i++) {
    const date = addDays(start, i);
    days.push({
      date,
      study: plan.studyDays.includes(parseISO(date).getDay()),
      review: daysBetween(date, exam) <= plan.bufferDays,
      learn: [], revise: [], reviewModules: [], mixedReview: false, load: 0,
    });
  }
  const studyDays = days.filter(d => d.study);
  const learnDays = studyDays.filter(d => !d.review);
  // If the exam is already inside the review window, learning has to happen on whatever study days remain.
  const learnTarget = learnDays.length ? learnDays : studyDays;
  const firstStudyDayFrom = date => studyDays.find(d => d.date >= date) || null;

  // Spread new lessons evenly
  toLearn.forEach((item, i) => {
    if (!learnTarget.length) return;
    const day = learnTarget[Math.floor(i * learnTarget.length / toLearn.length)];
    item.date = day.date;
    day.learn.push(item);
  });

  // Revisions
  const addRevision = (due, entry) => {
    if (due >= exam) return;
    const day = firstStudyDayFrom(due < start ? start : due);
    if (day) day.revise.push({ ...entry, due });
  };
  // Several overdue revisions of one lesson collapse into a single catch-up, and catch-ups are
  // spread over the first study days (at most `cap` a day) instead of piling up on day one.
  const catchUps = [];
  for (const pm of modules) {
    for (const lesson of lessonsOf(pm.moduleId)) {
      if (!lesson.completed) continue;
      const revs = schedule(lesson, intervals);
      const pending = revs.filter(r => !r.done);
      const overdue = pending.filter(r => r.due < start);
      const entry = r => ({ lesson, moduleId: pm.moduleId, week: lesson.week, n: r.n, total: revs.length, offset: r.offset, projected: false });
      if (overdue.length) catchUps.push({ ...entry(overdue[0]), due: overdue[0].due, catchUp: true });
      for (const r of pending.filter(r => r.due >= start)) addRevision(r.due, entry(r));
    }
  }
  catchUps.sort((a, b) => a.due.localeCompare(b.due)).forEach((entry, i) => {
    const day = studyDays[Math.floor(i / cap)] || studyDays[studyDays.length - 1];
    if (day) day.revise.unshift(entry);
  });
  for (const item of toLearn) {
    if (!item.date) continue;
    const offsets = intervals[item.lesson?.difficulty || plan.defaultDifficulty] || [];
    offsets.forEach((offset, i) => addRevision(addDays(item.date, offset), {
      lesson: item.lesson, moduleId: item.moduleId, week: item.week, n: i + 1, total: offsets.length, offset, projected: true,
    }));
  }

  // Final review window: one module per day where possible, spare days are mixed reviews
  const reviewDays = studyDays.filter(d => d.review);
  const ids = modules.map(m => m.moduleId);
  reviewDays.forEach((d, i) => {
    if (reviewDays.length >= ids.length) {
      d.mixedReview = i >= ids.length;
      d.reviewModules = d.mixedReview ? ids : [ids[i]];
    } else {
      d.reviewModules = ids.filter((_, j) => Math.floor(j * reviewDays.length / ids.length) === i);
    }
  });

  for (const d of days) d.load = d.learn.length + d.revise.length * REVISION_WEIGHT;
  for (const item of toLearn) {
    const s = moduleStats.find(m => m.moduleId === item.moduleId);
    if (item.date && (!s.finishBy || item.date > s.finishBy)) s.finishBy = item.date;
  }

  // Workload & stress
  const learnLoad = learnTarget.reduce((sum, d) => sum + d.load, 0);
  const avgLoad = learnTarget.length ? learnLoad / learnTarget.length : 0;
  const peakLoad = Math.max(0, ...days.map(d => d.load));
  let status;
  if (daysLeft <= 0) status = 'past';
  else if (!toLearn.length) status = 'covered';
  else if (!learnTarget.length || avgLoad > cap * 1.3) status = 'overloaded';
  else if (avgLoad > cap) status = 'tight';
  else if (avgLoad > cap * 0.85) status = 'busy';
  else if (avgLoad > cap * 0.6 || peakLoad > cap) status = 'comfortable';
  else status = 'relaxed';

  // How many study days a week would keep the average at a comfortable 85% of capacity
  const learnPeriodDays = days.filter(d => !d.review).length || days.length;
  const weeks = learnPeriodDays / 7;
  const daysPerWeekNeeded = weeks > 0 ? Math.ceil(learnLoad / (cap * 0.85) / weeks) : null;

  // Monday-first weeks for the calendar grid, from this week to the exam week
  const weeksGrid = [];
  if (daysLeft > 0) {
    const gridStart = addDays(start, -((parseISO(start).getDay() + 6) % 7));
    for (let w = gridStart; w <= exam; w = addDays(w, 7)) weeksGrid.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  }

  const done = moduleStats.reduce((s, m) => s + m.done, 0);
  const total = moduleStats.reduce((s, m) => s + m.total, 0);
  return {
    daysLeft, days, byDate: new Map(days.map(d => [d.date, d])), weeksGrid, moduleStats,
    studyDayCount: studyDays.length, learnDayCount: learnTarget.length, reviewDayCount: reviewDays.length,
    remaining: toLearn.length, unscheduled: toLearn.filter(i => !i.date).length,
    revisionCount: days.reduce((s, d) => s + d.revise.length, 0),
    lessonsPerStudyDay: learnTarget.length ? toLearn.length / learnTarget.length : 0,
    studyDaysPerWeek: plan.studyDays.length,
    avgLoad, peakLoad, overCapacityDays: days.filter(d => d.load > cap).length,
    daysPerWeekNeeded, status, done, total, pct: total ? Math.round(done / total * 100) : 0,
  };
}
