import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { addDays, fmt, parseISO, rel, today } from '../lib/dates.js';
import { DIFFS } from '../lib/plan.js';
import { STATUS, WEEKDAYS, buildExamPlan } from '../lib/planner.js';
import { ConfirmDialog, FormDialog, Modal, lessonFields } from '../components/dialogs.jsx';
import { Bar, Crumbs, EmptyBlock, Icon, NotFound, cap, plural } from '../components/ui.jsx';

const DEFAULT_WEEKS = 12;
const round1 = n => (Math.round(n * 10) / 10).toString();
const weekday = date => parseISO(date).toLocaleDateString(undefined, { weekday: 'short' });
const longDate = date => parseISO(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

export const StatusPill = ({ status }) => <span className={`chip ${STATUS[status].tone || 'neutral'}`}>{STATUS[status].label}</span>;

export function usePlanProjection(plan) {
  const store = useStore();
  return useMemo(() => buildExamPlan(plan, store, store.intervals), [plan, store.data]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------- Create / edit ---------- */

export function PlanDialog({ plan, courseId: fixedCourse }) {
  const { data, modulesOf, lessonsOf, run, closeDialog, toast } = useStore();
  const editing = !!plan;
  const [courseId, setCourseId] = useState(plan?.courseId || fixedCourse || data.courses[0]?.id || '');
  const defaultsFor = cid => Object.fromEntries(modulesOf(cid).map(m => [
    m.id, Math.max(DEFAULT_WEEKS, ...lessonsOf(m.id).map(l => l.week)),
  ]));
  const [name, setName] = useState(plan?.name || 'Semester exam');
  const [examDate, setExamDate] = useState(plan?.examDate || addDays(today(), 42));
  const [selected, setSelected] = useState(() => (plan
    ? Object.fromEntries(plan.modules.map(m => [m.moduleId, m.totalWeeks]))
    : defaultsFor(courseId)));
  const [weeks, setWeeks] = useState(() => ({ ...defaultsFor(courseId), ...selected }));
  const [studyDays, setStudyDays] = useState(plan?.studyDays || [1, 2, 3, 4, 5, 6]);
  const [bufferDays, setBufferDays] = useState(plan?.bufferDays ?? 3);
  const [dailyCapacity, setDailyCapacity] = useState(plan?.dailyCapacity ?? 3);
  const [defaultDifficulty, setDefaultDifficulty] = useState(plan?.defaultDifficulty || 'medium');
  const [busy, setBusy] = useState(false);

  const changeCourse = cid => {
    setCourseId(cid);
    setSelected(defaultsFor(cid));
    setWeeks(defaultsFor(cid));
  };
  const toggleModule = id => setSelected(s => {
    const next = { ...s };
    if (id in next) delete next[id];
    else next[id] = weeks[id];
    return next;
  });
  const setModuleWeeks = (id, v) => {
    setWeeks(w => ({ ...w, [id]: v }));
    setSelected(s => (id in s ? { ...s, [id]: v } : s));
  };
  const toggleDay = d => setStudyDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]));

  async function submit(e) {
    e.preventDefault();
    const modules = Object.entries(selected).map(([moduleId, totalWeeks]) => ({ moduleId, totalWeeks: Number(totalWeeks) }));
    if (!modules.length) return toast('Choose at least one module for the exam');
    if (!studyDays.length) return toast('Choose at least one study day');
    const body = { name, examDate, studyDays, bufferDays: Number(bufferDays), dailyCapacity: Number(dailyCapacity), defaultDifficulty, modules };
    setBusy(true);
    let id = plan?.id;
    const ok = await run(async () => {
      if (editing) await api.patch(`/plans/${plan.id}`, body);
      else ({ id } = await api.post('/plans', { ...body, courseId }));
    }, editing ? 'Exam plan updated' : 'Exam plan created');
    setBusy(false);
    if (ok) {
      closeDialog();
      location.hash = `#/plan/${id}`;
    }
  }

  const mods = modulesOf(courseId);
  return (
    <Modal>
      <form className="modal" onSubmit={submit}>
        <header>
          <h2>{editing ? 'Edit exam plan' : 'New exam plan'}</h2>
          <button type="button" className="icon-btn" onClick={closeDialog} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="modal-body">
          <div className="field-row">
            <label className="field"><span>Exam name</span>
              <input value={name} onChange={e => setName(e.target.value)} required maxLength={120} />
            </label>
            <label className="field"><span>Exam date</span>
              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} required min={editing ? undefined : addDays(today(), 1)} />
            </label>
          </div>
          {!editing && !fixedCourse && (
            <label className="field"><span>Course</span>
              <select value={courseId} onChange={e => changeCourse(e.target.value)} required>
                {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          <div className="field">
            <span>Modules in this exam</span>
            {mods.length ? (
              <ul className="pick-list">
                {mods.map(m => {
                  const on = m.id in selected;
                  const done = lessonsOf(m.id).filter(l => l.completed).length;
                  return (
                    <li key={m.id} className={on ? 'on' : ''}>
                      <label className="pick">
                        <input type="checkbox" checked={on} onChange={() => toggleModule(m.id)} />
                        <span><b>{m.name}</b><small>{done} lesson{done === 1 ? '' : 's'} completed</small></span>
                      </label>
                      <label className="weeks">
                        <input
                          type="number" min={1} max={52} value={weeks[m.id] ?? DEFAULT_WEEKS} disabled={!on} required={on}
                          onChange={e => setModuleWeeks(m.id, e.target.value)} aria-label={`Weeks in ${m.name}`}
                        />
                        <small>weeks</small>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted sm">This course has no modules yet — add some first.</p>}
            <small>One lesson per module per week. Lessons you haven’t added yet are still planned.</small>
          </div>

          <div className="field">
            <span>Study days</span>
            <div className="day-chips">
              {WEEKDAYS.map(([d, label]) => (
                <button key={d} type="button" className={`day-chip ${studyDays.includes(d) ? 'on' : ''}`} aria-pressed={studyDays.includes(d)} onClick={() => toggleDay(d)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <label className="field"><span>Comfortable load per day</span>
              <input type="number" min={1} max={20} value={dailyCapacity} onChange={e => setDailyCapacity(e.target.value)} required />
              <small>In lessons — a revision counts as half</small>
            </label>
            <label className="field"><span>Final review days</span>
              <input type="number" min={0} max={60} value={bufferDays} onChange={e => setBufferDays(e.target.value)} required />
              <small>Before the exam, with no new lessons</small>
            </label>
          </div>

          <div className="field">
            <span>Assume lessons not added yet are</span>
            <div className="seg-inline" role="group" aria-label="Assumed difficulty">
              {DIFFS.map(d => (
                <button key={d} type="button" className={`seg-btn ${d} ${defaultDifficulty === d ? 'on' : ''}`} onClick={() => setDefaultDifficulty(d)}>{cap(d)}</button>
              ))}
            </div>
            <small>Used to project their revisions</small>
          </div>
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={closeDialog}>Cancel</button>
          <button className="btn primary" disabled={busy || !mods.length}>{editing ? 'Save plan' : 'Create plan'}</button>
        </footer>
      </form>
    </Modal>
  );
}

/* ---------- List ---------- */

export default function Plans() {
  const { data, openDialog } = useStore();
  const newPlan = () => openDialog(<PlanDialog />);
  const t = today();
  const upcoming = data.plans.filter(p => p.examDate > t);
  const past = data.plans.filter(p => p.examDate <= t).reverse();

  if (!data.courses.length) {
    return <EmptyBlock title="No courses yet" text="Create a course and its modules first, then plan for its exams."><a className="btn primary" href="#/">Go home</a></EmptyBlock>;
  }
  return (
    <>
      <div className="section-bar">
        <div>
          <h1>Exam plans</h1>
          <p className="muted">A day-by-day projection of new lessons and revisions up to each exam.</p>
        </div>
        <button className="btn primary sm" onClick={newPlan}><Icon name="plus" /> New exam plan</button>
      </div>
      {upcoming.length
        ? <div className="plan-grid">{upcoming.map(p => <PlanCard key={p.id} plan={p} />)}</div>
        : (
          <EmptyBlock title="No upcoming exams" text="Add an exam, choose the modules it covers, and get a study plan that gets you there without the stress.">
            <button className="btn primary" onClick={newPlan}><Icon name="plus" /> Plan an exam</button>
          </EmptyBlock>
        )}
      {past.length > 0 && (
        <>
          <h2 className="past-title">Past exams</h2>
          <div className="plan-grid">{past.map(p => <PlanCard key={p.id} plan={p} />)}</div>
        </>
      )}
    </>
  );
}

function todayLine(proj) {
  const d = proj.byDate.get(today());
  if (!d) return null;
  if (!d.study) return 'Rest day today';
  const parts = [];
  if (d.learn.length) parts.push(plural(d.learn.length, 'new lesson'));
  if (d.revise.length) parts.push(plural(d.revise.length, 'revision'));
  if (d.reviewModules.length) parts.push('final review');
  return parts.length ? `Today: ${parts.join(' · ')}` : 'Nothing planned today';
}

function PlanCard({ plan, compact }) {
  const { course } = useStore();
  const proj = usePlanProjection(plan);
  const c = course(plan.courseId);
  return (
    <a className={`plan-card card ${compact ? 'compact' : ''}`} href={`#/plan/${plan.id}`} style={{ '--accent': c?.color }}>
      <div className="countdown">
        {proj.daysLeft > 0 ? <><b>{proj.daysLeft}</b><span>day{proj.daysLeft === 1 ? '' : 's'}</span></> : <Icon name="flag" />}
      </div>
      <div className="pc-main">
        <h3>{plan.name}</h3>
        <span className="muted sm pc-meta">{c?.name} · {fmt(plan.examDate)}</span>
        {!compact && <div className="pc-progress"><Bar pct={proj.pct} /><span className="sm muted">{proj.done}/{proj.total} lessons covered</span></div>}
        {proj.daysLeft > 0 && <span className="sm">{todayLine(proj)}</span>}
      </div>
      <StatusPill status={proj.status} />
    </a>
  );
}

/** Compact list of upcoming exams for the home page. */
export function UpcomingExams() {
  const { data } = useStore();
  const upcoming = data.plans.filter(p => p.examDate > today());
  if (!upcoming.length) return null;
  return (
    <section className="upcoming">
      <div className="panel-head"><h2>Upcoming exams</h2><a className="link-btn" href="#/plans">All plans</a></div>
      <div className="plan-grid">{upcoming.slice(0, 3).map(p => <PlanCard key={p.id} plan={p} compact />)}</div>
    </section>
  );
}

/* ---------- Detail ---------- */

export function PlanDetail({ id }) {
  const { data, course, run, openDialog } = useStore();
  const plan = data.plans.find(p => p.id === id);
  if (!plan) return <NotFound />;
  return <PlanView plan={plan} c={course(plan.courseId)} run={run} openDialog={openDialog} />;
}

function PlanView({ plan, c, run, openDialog }) {
  const proj = usePlanProjection(plan);
  const t = today();
  const [selected, setSelected] = useState(() => (proj.byDate.has(t) ? t : proj.days[0]?.date));
  const day = proj.byDate.get(selected);

  const remove = () => openDialog(
    <ConfirmDialog
      title={`Delete “${plan.name}”?`} text="Only the plan is removed — your lessons and progress stay."
      onYes={async () => { if (await run(() => api.del(`/plans/${plan.id}`), 'Exam plan deleted')) location.hash = '#/plans'; }}
    />,
  );

  return (
    <div style={{ '--accent': c.color }}>
      <Crumbs items={[['Exam plans', '#/plans'], [plan.name]]} />
      <section className="card page-head plan-head">
        <div className="countdown big">
          {proj.daysLeft > 0 ? <><b>{proj.daysLeft}</b><span>day{proj.daysLeft === 1 ? '' : 's'} to go</span></> : <Icon name="flag" />}
        </div>
        <div className="ph-main">
          <div className="eyebrow">{c.name}</div>
          <h1>{plan.name}</h1>
          <p className="muted">{longDate(plan.examDate)} {parseISO(plan.examDate).getFullYear()} · <StatusPill status={proj.status} /></p>
        </div>
        <div className="actions">
          <button className="btn outline sm" onClick={() => openDialog(<PlanDialog plan={plan} />)}><Icon name="edit" /> Edit</button>
          <button className="icon-btn danger" onClick={remove} aria-label="Delete plan" title="Delete plan"><Icon name="trash" /></button>
        </div>
      </section>

      {proj.status === 'past' ? (
        <EmptyBlock title="This exam has passed" text="Edit the plan to set a new date, or delete it." />
      ) : (
        <>
          <Insight plan={plan} proj={proj} />
          <section className="stats">
            <Stat icon="book" tone="primary" value={<>{proj.remaining}<small> / {proj.total}</small></>} label="Lessons left to learn" />
            <Stat icon="calendar" value={proj.studyDayCount} label={`Study days left (${proj.reviewDayCount} for final review)`} />
            <Stat icon="target" tone="easy" value={round1(proj.lessonsPerStudyDay)} label="New lessons per study day" />
            <Stat icon="refresh" tone="star" value={proj.revisionCount} label="Revisions along the way" />
          </section>

          <div className="plan-layout">
            <section className="card pad">
              <div className="card-head">
                <h3>Schedule</h3>
                <div className="legend-inline sm muted">
                  <span><i className="sw learn" />New</span><span><i className="sw rev" />Revisions</span>
                  <span><i className="sw review" />Final review</span><span><i className="sw rest" />Rest</span>
                </div>
              </div>
              <Calendar plan={plan} proj={proj} selected={selected} onSelect={setSelected} />
            </section>
            <DayAgenda plan={plan} day={day} proj={proj} />
          </div>

          <section className="card pad">
            <h3>Modules</h3>
            <p className="muted sm">Covered lessons and when each module’s new material finishes.</p>
            <div className="module-progress">
              {proj.moduleStats.map(m => {
                const pct = m.total ? Math.round(m.done / m.total * 100) : 0;
                return (
                  <div key={m.moduleId} className="mp-row">
                    <div className="mp-name"><b>{m.module.name}</b><span className="muted sm">{m.done}/{m.total} lessons</span></div>
                    <Bar pct={pct} />
                    <span className="sm muted mp-finish">{m.remaining ? `Finish new lessons by ${fmt(m.finishBy || plan.examDate)}` : 'All lessons covered'}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const Stat = ({ icon, label, value, tone = '' }) => (
  <div className="card stat">
    <span className={`stat-ic ${tone}`}><Icon name={icon} /></span>
    <div><b>{value}</b><span>{label}</span></div>
  </div>
);

function Insight({ plan, proj }) {
  const capLoad = plan.dailyCapacity;
  const daysPerWeek = proj.studyDaysPerWeek;
  let text, advice = null;
  if (proj.status === 'covered') {
    text = `Every lesson is covered. Use your ${plural(proj.studyDayCount, 'study day')} for revision — ${plural(proj.revisionCount, 'revision')} are scheduled before the exam.`;
  } else {
    const perWeek = proj.lessonsPerStudyDay * daysPerWeek;
    text = `Learn about ${round1(proj.lessonsPerStudyDay)} new lesson${proj.lessonsPerStudyDay === 1 ? '' : 's'} per study day (≈ ${round1(perWeek)} a week over ${plural(daysPerWeek, 'day')}), plus ${plural(proj.revisionCount, 'revision')} along the way. `
      + `That averages ${round1(proj.avgLoad)} of your comfortable ${capLoad} per day.`;
    if (proj.status === 'tight' || proj.status === 'overloaded') {
      advice = proj.daysPerWeekNeeded && proj.daysPerWeekNeeded <= 7
        ? `To make it comfortable, study about ${proj.daysPerWeekNeeded} days a week, raise your daily load, or shorten the final review.`
        : 'Even studying every day won’t keep this comfortable — raise your daily load, shorten the final review, or focus on the highest-value lessons first.';
    } else if (proj.overCapacityDays > 0) {
      advice = `${plural(proj.overCapacityDays, 'day')} ${proj.overCapacityDays === 1 ? 'goes' : 'go'} over your comfortable load because revisions bunch up — marked with a red dot in the schedule.`;
    }
  }
  return (
    <div className={`card insight ${STATUS[proj.status].tone}`}>
      <Icon name={proj.status === 'tight' || proj.status === 'overloaded' ? 'alert' : 'check'} />
      <div><p>{text}</p>{advice && <p className="muted sm">{advice}</p>}</div>
    </div>
  );
}

function Calendar({ plan, proj, selected, onSelect }) {
  const t = today();
  return (
    <div className="cal" role="grid" aria-label="Study schedule">
      <div className="cal-row cal-head" role="row">{WEEKDAYS.map(([d, label]) => <span key={d} role="columnheader">{label}</span>)}</div>
      {proj.weeksGrid.map(week => (
        <div className="cal-row" role="row" key={week[0]}>
          {week.map(date => {
            const d = proj.byDate.get(date);
            if (date === plan.examDate) {
              return <span key={date} className="cal-cell exam" role="gridcell" title="Exam day"><em>{parseISO(date).getDate()}</em><Icon name="flag" /></span>;
            }
            if (!d) return <span key={date} className="cal-cell outside" role="gridcell"><em>{parseISO(date).getDate()}</em></span>;
            const heat = Math.min(1, d.load / plan.dailyCapacity);
            const cls = ['cal-cell', !d.study && 'rest', d.review && d.study && 'review', d.load > plan.dailyCapacity && 'over', date === selected && 'selected', date === t && 'today'].filter(Boolean).join(' ');
            return (
              <button
                key={date} className={cls} role="gridcell" onClick={() => onSelect(date)} style={{ '--heat': `${Math.round(heat * 38)}%` }}
                aria-label={`${longDate(date)}: ${d.study ? `${d.learn.length} new, ${d.revise.length} revisions${d.review ? ', final review' : ''}` : 'rest day'}`}
              >
                <em>{parseISO(date).getDate()}</em>
                {d.study && (d.learn.length > 0 || d.revise.length > 0 || d.review) && (
                  <span className="cal-counts">
                    {d.learn.length > 0 && <b>{d.learn.length}</b>}
                    {d.revise.length > 0 && <small><Icon name="refresh" />{d.revise.length}</small>}
                    {d.review && !d.learn.length && !d.revise.length && <small className="star"><Icon name="star" filled /></small>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayAgenda({ plan, day, proj }) {
  const { mod, lesson: getLesson, intervals, run, openDialog, data } = useStore();
  if (!day) return <section className="card pad"><p className="muted">Pick a day in the schedule.</p></section>;
  const t = today();
  const isToday = day.date === t;
  const nextStudy = proj.days.find(d => d.study && d.date > day.date);
  const hardCards = moduleId => data.lessons.filter(l => l.moduleId === moduleId).flatMap(l => l.cards).filter(c => c.hard).length;

  const addLesson = item => openDialog(
    <FormDialog
      title="Add lesson" submit="Add lesson"
      fields={lessonFields({ title: '', week: item.week, date: day.date < t ? t : day.date, difficulty: plan.defaultDifficulty }, intervals)}
      onSubmit={v => run(() => api.post('/lessons', { ...v, moduleId: item.moduleId, week: Number(v.week) }), 'Lesson added')}
    />,
  );
  const tick = r => run(() => api.put(`/lessons/${r.lesson.id}/revisions/${r.offset}`, { doneOn: t }), 'Revision done — nice!');

  return (
    <section className="card pad agenda">
      <div className="card-head">
        <h3>{isToday ? 'Today' : cap(rel(day.date))}</h3>
        <span className="muted sm">{longDate(day.date)}</span>
      </div>
      {!day.study ? (
        <div className="empty">Rest day — recharge.{nextStudy && <> Next study day is {weekday(nextStudy.date)} {fmt(nextStudy.date)}.</>}</div>
      ) : (
        <>
          {day.load > 0 && <p className="muted sm">Load {round1(day.load)} of {plan.dailyCapacity}{day.load > plan.dailyCapacity ? ' — a heavy day' : ''}</p>}
          {day.learn.length > 0 && (
            <>
              <h4>Learn</h4>
              <ul className="agenda-list">
                {day.learn.map(item => {
                  const l = item.lesson && getLesson(item.lesson.id);
                  return (
                    <li key={`${item.moduleId}-${item.week}-${l?.id || ''}`}>
                      <span className="ag-ic learn"><Icon name="book" /></span>
                      <div className="ag-main">
                        <b>{l ? l.title : `Week ${item.week} lesson`}</b>
                        <span className="muted sm">{mod(item.moduleId)?.name} · Week {item.week}{!l && ' · not added yet'}</span>
                      </div>
                      {l
                        ? <a className="btn outline sm" href={`#/lesson/${l.id}`}>Open</a>
                        : <button className="btn outline sm" onClick={() => addLesson(item)}><Icon name="plus" /> Add</button>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {day.revise.length > 0 && (
            <>
              <h4>Revise</h4>
              <ul className="agenda-list">
                {day.revise.map(r => {
                  const canTick = !r.projected && r.due <= t && isToday;
                  return (
                    <li key={`${r.moduleId}-${r.week}-${r.lesson?.id || ''}-${r.offset}`}>
                      {canTick
                        ? <button className="check-btn" onClick={() => tick(r)} aria-label="Mark revision as done" title="Mark revision as done"><Icon name="check" /></button>
                        : <span className="ag-ic rev"><Icon name="refresh" /></span>}
                      <div className="ag-main">
                        <b>{r.lesson ? r.lesson.title : `Week ${r.week} lesson`}</b>
                        <span className="muted sm">
                          {mod(r.moduleId)?.name} · Revision {r.n} of {r.total}
                          {r.catchUp && ' · catch-up'}{r.projected && ' · projected'}
                        </span>
                      </div>
                      {r.lesson && <a className="btn ghost sm" href={`#/lesson/${r.lesson.id}/revision`}>Open</a>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {day.reviewModules.length > 0 && (
            <>
              <h4>Final review</h4>
              <ul className="agenda-list">
                {day.reviewModules.map(mid => (
                  <li key={mid}>
                    <span className="ag-ic review"><Icon name="star" /></span>
                    <div className="ag-main">
                      <b>{day.mixedReview ? 'Mixed review' : 'Review'}: {mod(mid)?.name}</b>
                      <span className="muted sm">Key points, mind map, Notion note{hardCards(mid) ? ` · ${plural(hardCards(mid), 'hard flashcard')}` : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!day.learn.length && !day.revise.length && !day.reviewModules.length && <div className="empty">Nothing planned — a light day.</div>}
        </>
      )}
    </section>
  );
}

