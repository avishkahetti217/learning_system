import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { daysBetween, fmt, rel, today } from '../lib/dates.js';
import { nextRevision, progress } from '../lib/plan.js';
import { ConfirmDialog, FormDialog, lessonFields } from '../components/dialogs.jsx';
import { Bar, Crumbs, DiffChip, EmptyBlock, Icon, NotFound, Ring, plural } from '../components/ui.jsx';

const courseFields = (c = {}) => [
  { name: 'name', label: 'Course name', value: c.name, required: true, attrs: { maxLength: 120, placeholder: 'e.g. Machine Learning Specialization' } },
  { name: 'description', label: 'Description (optional)', type: 'textarea', value: c.description },
];

export function NewCourseDialog() {
  const { run } = useStore();
  return (
    <FormDialog
      title="New course" submit="Create course" fields={courseFields()}
      onSubmit={async v => {
        let id;
        const ok = await run(async () => { ({ id } = await api.post('/courses', v)); }, 'Course created');
        if (ok) location.hash = `#/course/${id}`;
        return ok;
      }}
    />
  );
}

export default function Course({ id }) {
  const { course, modulesOf, lessonsOfCourse, run, openDialog } = useStore();
  const c = course(id);
  if (!c) return <NotFound />;
  const mods = modulesOf(id);
  const p = progress(lessonsOfCourse(id));

  const edit = () => openDialog(
    <FormDialog title="Edit course" fields={courseFields(c)} onSubmit={v => run(() => api.patch(`/courses/${id}`, v), 'Course updated')} />,
  );
  const remove = () => openDialog(
    <ConfirmDialog
      title={`Delete “${c.name}”?`}
      text="All of its modules, lessons, notes and flashcards will be removed. This can’t be undone."
      onYes={async () => { if (await run(() => api.del(`/courses/${id}`), 'Course deleted')) location.hash = '#/'; }}
    />,
  );
  const addModule = () => openDialog(
    <FormDialog
      title="New module" submit="Add module"
      fields={[{ name: 'name', label: 'Module name', required: true, attrs: { maxLength: 120, placeholder: 'e.g. Module 1 — Foundations' } }]}
      onSubmit={v => run(() => api.post('/modules', { courseId: id, name: v.name }), 'Module added')}
    />,
  );

  return (
    <div style={{ '--accent': c.color }}>
      <Crumbs items={[[c.name]]} />
      <section className="card page-head">
        <div className="ph-main">
          <h1>{c.name}</h1>
          {c.description && <p className="muted">{c.description}</p>}
          <div className="ph-progress">
            <Bar pct={p.pct} />
            <span>{p.done} of {plural(p.total, 'lesson')} completed · <b>{p.pct}%</b></span>
          </div>
        </div>
        <div className="actions">
          <button className="btn outline sm" onClick={edit}><Icon name="edit" /> Edit</button>
          <button className="icon-btn danger" onClick={remove} aria-label="Delete course" title="Delete course"><Icon name="trash" /></button>
        </div>
      </section>

      <div className="section-bar">
        <h2>Modules</h2>
        <button className="btn primary sm" onClick={addModule}><Icon name="plus" /> Add module</button>
      </div>
      {mods.length
        ? mods.map((m, i) => <ModuleCard key={m.id} m={m} index={i} />)
        : (
          <EmptyBlock title="No modules yet" text="Break the course into modules, then add weekly lessons to each.">
            <button className="btn primary" onClick={addModule}><Icon name="plus" /> Add first module</button>
          </EmptyBlock>
        )}
    </div>
  );
}

function ModuleCard({ m, index }) {
  const { lessonsOf, lessonsOfCourse, intervals, run, openDialog } = useStore();
  const lessons = lessonsOf(m.id);
  const p = progress(lessons);

  const rename = () => openDialog(
    <FormDialog
      title="Rename module"
      fields={[{ name: 'name', label: 'Module name', value: m.name, required: true, attrs: { maxLength: 120 } }]}
      onSubmit={v => run(() => api.patch(`/modules/${m.id}`, v))}
    />,
  );
  const remove = () => openDialog(
    <ConfirmDialog
      title={`Delete “${m.name}”?`}
      text="All lessons in this module, with their notes and flashcards, will be removed."
      onYes={() => run(() => api.del(`/modules/${m.id}`), 'Module deleted')}
    />,
  );
  const addLesson = () => {
    const lastWeek = lessonsOfCourse(m.courseId).reduce((max, l) => Math.max(max, l.week), 0);
    openDialog(
      <FormDialog
        title="New lesson" submit="Add lesson"
        fields={lessonFields({ title: '', week: lastWeek || 1, date: today(), difficulty: 'medium' }, intervals)}
        onSubmit={v => run(() => api.post('/lessons', { ...v, moduleId: m.id, week: Number(v.week) }), 'Lesson added')}
      />,
    );
  };

  return (
    <section className="card module">
      <header className="module-head">
        <div className="mh-title">
          <span className="mod-num">{index + 1}</span>
          <div>
            <h3>{m.name}</h3>
            <span className="muted sm">{p.done} of {plural(p.total, 'lesson')} completed</span>
          </div>
        </div>
        <Ring pct={p.pct} />
        <div className="actions">
          <button className="icon-btn sm" onClick={rename} aria-label="Rename module" title="Rename module"><Icon name="edit" /></button>
          <button className="icon-btn sm danger" onClick={remove} aria-label="Delete module" title="Delete module"><Icon name="trash" /></button>
        </div>
      </header>
      {lessons.length
        ? <div className="lesson-list">{lessons.map(l => <LessonRow key={l.id} l={l} />)}</div>
        : <p className="muted empty-inline">No lessons yet.</p>}
      <button className="add-row" onClick={addLesson}><Icon name="plus" /> Add lesson</button>
    </section>
  );
}

function LessonRow({ l }) {
  const { intervals, run } = useStore();
  const r = nextRevision(l, intervals);
  const hard = l.cards.filter(c => c.hard).length;
  const watched = l.videos.filter(v => v.watched).length;
  const href = `#/lesson/${l.id}`;
  const label = l.completed ? 'Mark as not completed' : 'Mark as completed';

  let rev;
  if (!r) rev = <span className="tag ok"><Icon name="check" /> All revised</span>;
  else {
    const n = daysBetween(today(), r.due);
    rev = n < 0 ? <span className="tag overdue">Revision overdue</span>
      : n === 0 ? <span className="tag due">Revise today</span>
      : <span className="tag">Revise {rel(r.due)}</span>;
  }

  const toggle = e => {
    e.stopPropagation();
    run(() => api.patch(`/lessons/${l.id}`, { completed: !l.completed }), l.completed ? '' : 'Lesson completed');
  };

  return (
    <div className={`lesson-row ${l.completed ? 'done' : ''}`} onClick={() => { location.hash = href; }}>
      <button className={`check-btn ${l.completed ? 'on' : ''}`} onClick={toggle} aria-label={label} title={label}><Icon name="check" /></button>
      <span className="week">W{l.week}</span>
      <div className="lr-main">
        <a className="lr-title" href={href} onClick={e => e.stopPropagation()}>{l.title}</a>
        <span className="lr-sub">{fmt(l.date)}{l.videos.length > 0 && ` · ${watched}/${l.videos.length} videos`}{l.mindmapDone && ' · mind map ✓'}{l.noteDone && ' · note ✓'} · {plural(l.cards.length, 'card')}{hard > 0 && ` · ${hard} hard`}</span>
      </div>
      <DiffChip d={l.difficulty} />
      <span className="lr-rev">{rev}</span>
    </div>
  );
}
