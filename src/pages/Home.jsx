import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { daysBetween, today } from '../lib/dates.js';
import { isDue, nextRevision, progress, schedule } from '../lib/plan.js';
import { NewCourseDialog } from './Course.jsx';
import { Bar, DiffChip, DueTag, Icon, plural } from '../components/ui.jsx';

export default function Home() {
  const { data, intervals, openDialog } = useStore();
  const newCourse = () => openDialog(<NewCourseDialog />);

  if (!data.courses.length) {
    return (
      <section className="card welcome">
        <div className="welcome-icon"><Icon name="book" /></div>
        <h1>Track what you learn</h1>
        <p className="muted">
          Create a course, split it into modules and weekly lessons, capture key points and flashcards —
          and get reminded to revise at just the right time.
        </p>
        <button className="btn primary lg" onClick={newCourse}><Icon name="plus" /> Create your first course</button>
        <ol className="steps">
          <li><b>1</b>Add a course &amp; modules</li>
          <li><b>2</b>Log lessons by week</li>
          <li><b>3</b>Revise when prompted</li>
        </ol>
      </section>
    );
  }

  const t = today();
  const due = [], soon = [];
  for (const l of data.lessons) {
    const r = nextRevision(l, intervals);
    if (!r) continue;
    const n = daysBetween(t, r.due);
    if (n <= 0) due.push({ l, r, n });
    else if (n <= 7) soon.push({ l, r, n });
  }
  due.sort((a, b) => a.n - b.n);
  soon.sort((a, b) => a.n - b.n);

  const cards = data.lessons.flatMap(l => l.cards);
  const p = progress(data.lessons);
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{greeting}</h1>
        <p className="muted">
          {due.length ? <>You have <b>{plural(due.length, 'lesson')}</b> to revise today.</> : 'You’re all caught up on revisions.'}
        </p>
      </section>

      <section className="stats">
        <Stat icon="refresh" label="Due for revision" value={due.length} tone="primary" />
        <Stat icon="check" label="Lessons completed" value={<>{p.done}<small> / {p.total}</small></>} tone="easy" />
        <Stat icon="cards" label="Flashcards" value={cards.length} />
        <Stat icon="star" label="Hard flashcards" value={cards.filter(c => c.hard).length} tone="star" />
      </section>

      <div className="home-grid">
        <section>
          <div className="panel-head"><h2>Revise today</h2><span className={`count ${due.length ? '' : 'zero'}`}>{due.length}</span></div>
          {due.length
            ? <ul className="rev-list">{due.map(x => <RevisionItem key={x.l.id} {...x} />)}</ul>
            : <div className="empty">Nothing due right now. Nice work!</div>}
          {soon.length > 0 && (
            <>
              <div className="panel-head sub"><h3>Coming up this week</h3></div>
              <ul className="rev-list compact">{soon.map(x => <RevisionItem key={x.l.id} {...x} upcoming />)}</ul>
            </>
          )}
        </section>
        <section>
          <div className="panel-head">
            <h2>Your courses</h2>
            <button className="btn primary sm" onClick={newCourse}><Icon name="plus" /> New course</button>
          </div>
          <div className="course-grid">{data.courses.map(c => <CourseCard key={c.id} c={c} />)}</div>
        </section>
      </div>
    </>
  );
}

const Stat = ({ icon, label, value, tone = '' }) => (
  <div className="card stat">
    <span className={`stat-ic ${tone}`}><Icon name={icon} /></span>
    <div><b>{value}</b><span>{label}</span></div>
  </div>
);

function RevisionItem({ l, r, upcoming }) {
  const { course, mod, intervals, run } = useStore();
  const markDone = () => run(() => api.put(`/lessons/${l.id}/revisions/${r.offset}`, { doneOn: today() }), 'Revision done — nice!');
  return (
    <li className="rev-item">
      {upcoming
        ? <span className="dot" />
        : <button className="check-btn" onClick={markDone} title="Mark revision as done" aria-label="Mark revision as done"><Icon name="check" /></button>}
      <a className="rev-main" href={`#/lesson/${l.id}/revision`}>
        <span className="rev-title">{l.title}</span>
        <span className="rev-sub">
          {course(l.courseId)?.name} · {mod(l.moduleId)?.name} · Revision {r.n} of {schedule(l, intervals).length}
        </span>
      </a>
      <span className="rev-tags"><DiffChip d={l.difficulty} /><DueTag due={r.due} /></span>
    </li>
  );
}

function CourseCard({ c }) {
  const { lessonsOfCourse, modulesOf, intervals } = useStore();
  const lessons = lessonsOfCourse(c.id);
  const p = progress(lessons);
  const dueN = lessons.filter(l => isDue(l, intervals)).length;
  return (
    <a className="course-card" href={`#/course/${c.id}`} style={{ '--accent': c.color }}>
      <div className="cc-top">
        <span className="cc-icon"><Icon name="book" /></span>
        {dueN > 0 && <span className="tag due">{dueN} to revise</span>}
      </div>
      <h3>{c.name}</h3>
      {c.description && <p className="muted clamp">{c.description}</p>}
      <div className="cc-meta">{plural(modulesOf(c.id).length, 'module')} · {plural(p.total, 'lesson')}</div>
      <Bar pct={p.pct} />
      <div className="cc-foot"><span>{p.done} of {p.total} completed</span><b>{p.pct}%</b></div>
    </a>
  );
}
