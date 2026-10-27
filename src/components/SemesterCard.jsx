import { useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { fmt, parseISO, today } from '../lib/dates.js';
import { fmtWeeks, semesterStatus } from '../lib/semester.js';
import { FormDialog, lessonFields } from './dialogs.jsx';
import { Bar, Icon, plural } from './ui.jsx';

const SHOW = 6;
const shortDate = d => parseISO(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function useSemester(course) {
  const { modulesOf, lessonsOf } = useStore();
  return semesterStatus(course, modulesOf(course.id), lessonsOf);
}

export default function SemesterCard({ course, onEdit }) {
  const { intervals, run, openDialog, modulesOf } = useStore();
  const s = useSemester(course);
  const [showAll, setShowAll] = useState(false);

  if (!s) {
    return (
      <section className="card pad semester setup">
        <span className="mm-icon"><Icon name="calendar" /></span>
        <div>
          <h3>Track your semester</h3>
          <p className="muted sm">Add the semester start date and length to see which week you’re in and how far behind you are.</p>
        </div>
        <button className="btn outline sm" onClick={onEdit}>Set semester dates</button>
      </section>
    );
  }

  const addLesson = (moduleId, week) => openDialog(
    <FormDialog
      title="Add lesson" submit="Add lesson"
      fields={lessonFields({ title: '', week, date: today(), difficulty: 'medium' }, intervals)}
      onSubmit={v => run(() => api.post('/lessons', { ...v, moduleId, week: Number(v.week) }), 'Lesson added')}
    />,
  );

  const catchUp = [
    ...s.missing.map(x => ({ ...x, kind: 'missing' })),
    ...s.pending.map(x => ({ ...x, kind: 'pending' })),
  ].sort((a, b) => (a.week - b.week) || (a.module.position - b.module.position));
  const visible = showAll ? catchUp : catchUp.slice(0, SHOW);
  const noModules = !modulesOf(course.id).length;

  let headline;
  if (s.notStarted) headline = `Semester starts in ${plural(s.startsIn, 'day')} (${shortDate(course.startDate)}).`;
  else if (s.finished) headline = `Semester finished on ${fmt(s.endDate)}.`;
  else headline = <>Week <b>{s.currentWeek}</b> of {s.total} · this week ends {shortDate(s.weekEnds)}</>;

  return (
    <section className="card pad semester">
      <div className="card-head">
        <h3>Semester progress</h3>
        {!s.notStarted && !noModules && <span className={`chip ${s.tone}`}>{s.label}</span>}
      </div>
      <p className="muted sm">{headline}</p>
      <div className="sem-timeline">
        <Bar pct={s.timePct} />
        <div className="sm muted sem-dates"><span>{fmt(course.startDate)}</span><span>{fmt(s.endDate)}</span></div>
      </div>

      {noModules ? (
        <p className="muted sm">Add modules to this course to track progress against the semester.</p>
      ) : !s.notStarted && s.dueWeeks > 0 && (
        <>
          <div className="sem-stats">
            <div className={`sem-stat ${s.tone}`}><b>{s.weeksBehind ? fmtWeeks(s.weeksBehind) : '0 weeks'}</b><span>behind</span></div>
            <div className="sem-stat"><b>{s.missing.length}</b><span>Lecture notes not created</span></div>
            <div className="sem-stat"><b>{s.pending.length}</b><span>Lessons pending</span></div>
            <div className="sem-stat"><b>{s.notesMissing}</b><span>Notion notes missing</span></div>
          </div>
          <p className="sm sem-summary">
            {s.behindLessons
              ? <>Weeks 1–{s.dueWeeks} should be covered. {s.caughtUpThrough > 0 ? `You’re fully caught up through week ${s.caughtUpThrough}` : 'You’re not fully caught up on any week yet'} — {plural(s.behindLessons, 'lesson')} to catch up on.</>
              : <>All lessons for weeks 1–{s.dueWeeks} are created and completed. Nice work!</>}
          </p>

          {catchUp.length > 0 && (
            <>
              <h4>Catch-up list</h4>
              <ul className="agenda-list">
                {visible.map(x => (
                  <li key={`${x.kind}-${x.module.id}-${x.week}-${x.lesson?.id || ''}`}>
                    <span className="week">W{x.week}</span>
                    <div className="ag-main">
                      <b>{x.lesson ? x.lesson.title : `${x.module.name} — week ${x.week}`}</b>
                      <span className="muted sm">{x.module.name} · {x.kind === 'missing' ? 'lecture notes not created' : 'not completed'}</span>
                    </div>
                    {x.kind === 'missing'
                      ? <button className="btn outline sm" onClick={() => addLesson(x.module.id, x.week)}><Icon name="plus" /> Add</button>
                      : <a className="btn outline sm" href={`#/lesson/${x.lesson.id}`}>Open</a>}
                  </li>
                ))}
              </ul>
              {catchUp.length > SHOW && (
                <button className="link-btn sem-more" onClick={() => setShowAll(v => !v)}>
                  {showAll ? 'Show less' : `Show all ${catchUp.length}`}
                </button>
              )}
            </>
          )}
        </>
      )}

      {!noModules && s.thisWeek.length > 0 && (
        <>
          <h4>This week · week {s.currentWeek}</h4>
          <ul className="agenda-list">
            {s.thisWeek.map(t => {
              const done = t.lessons.length > 0 && t.lessons.every(l => l.completed);
              return (
                <li key={t.module.id}>
                  <span className={`ag-ic ${done ? 'done' : 'learn'}`}><Icon name={done ? 'check' : 'book'} /></span>
                  <div className="ag-main">
                    <b>{t.lessons[0]?.title || `${t.module.name} — week ${t.week}`}</b>
                    <span className="muted sm">{t.module.name} · {done ? 'completed' : t.lessons.length ? 'in progress' : 'not added yet'}</span>
                  </div>
                  {t.lessons.length
                    ? <a className="btn ghost sm" href={`#/lesson/${t.lessons[0].id}`}>Open</a>
                    : <button className="btn ghost sm" onClick={() => addLesson(t.module.id, t.week)}><Icon name="plus" /> Add</button>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
