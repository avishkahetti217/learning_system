import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { daysBetween, fmt, rel, today } from '../lib/dates.js';
import { DIFFS, schedule } from '../lib/plan.js';
import { ConfirmDialog, FormDialog, lessonFields } from '../components/dialogs.jsx';
import StudyDialog from '../components/StudyDialog.jsx';
import { Crumbs, DiffChip, Icon, NotFound, Ring, cap, plural } from '../components/ui.jsx';

export default function Lesson({ id, tab }) {
  const { lesson, course, mod, intervals, run, openDialog } = useStore();
  const l = lesson(id);
  if (!l) return <NotFound />;
  const c = course(l.courseId), m = mod(l.moduleId);
  const plan = schedule(l, intervals);
  const dueNow = plan.some(r => !r.done && r.due <= today());

  const patch = (body, msg) => run(() => api.patch(`/lessons/${id}`, body), msg);
  const edit = () => openDialog(
    <FormDialog
      title="Edit lesson" fields={lessonFields(l, intervals)}
      onSubmit={v => patch({ title: v.title, week: Number(v.week), date: v.date, difficulty: v.difficulty }, 'Lesson updated')}
    />,
  );
  const remove = () => openDialog(
    <ConfirmDialog
      title={`Delete “${l.title}”?`}
      text="Its key points, notes, flashcards and revision history will be removed."
      onYes={async () => { if (await run(() => api.del(`/lessons/${id}`), 'Lesson deleted')) location.hash = `#/course/${c.id}`; }}
    />,
  );

  const tabs = [
    ['points', 'list', 'Key points', l.points.length],
    ['cards', 'cards', 'Flashcards', l.cards.length],
    ['revision', 'refresh', 'Revision plan', `${plan.filter(r => r.done).length}/${plan.length}`],
  ];

  return (
    <>
      <Crumbs items={[[c.name, `#/course/${c.id}`], [m.name]]} />
      <section className="card lesson-head">
        <div className="lh-top">
          <div>
            <div className="eyebrow">Week {l.week} · Started {fmt(l.date)}</div>
            <h1>{l.title}</h1>
          </div>
          <div className="actions">
            <button className="icon-btn" onClick={edit} aria-label="Edit lesson" title="Edit lesson"><Icon name="edit" /></button>
            <button className="icon-btn danger" onClick={remove} aria-label="Delete lesson" title="Delete lesson"><Icon name="trash" /></button>
          </div>
        </div>
        <div className="lh-controls">
          <label>Difficulty</label>
          <div className="seg-inline" role="group" aria-label="Difficulty">
            {DIFFS.map(d => (
              <button
                key={d} className={`seg-btn ${d} ${l.difficulty === d ? 'on' : ''}`} aria-pressed={l.difficulty === d}
                onClick={() => patch({ difficulty: d }, `Marked ${d} — ${plural(intervals[d].length, 'revision')} planned`)}
              >{cap(d)}</button>
            ))}
          </div>
          <span className="spacer" />
          <button className={`btn ${l.completed ? 'success' : 'outline'}`} onClick={() => patch({ completed: !l.completed }, l.completed ? '' : 'Lesson completed')}>
            <Icon name="check" /> {l.completed ? 'Completed' : 'Mark as completed'}
          </button>
        </div>
      </section>

      <nav className="tabs">
        {tabs.map(([key, icon, label, badge]) => (
          <a key={key} className={`tab ${tab === key ? 'on' : ''}`} href={`#/lesson/${id}/${key}`}>
            <Icon name={icon} /> {label} <span className={`badge ${key === 'revision' && dueNow ? 'alert' : ''}`}>{badge}</span>
          </a>
        ))}
      </nav>

      {tab === 'cards' ? <CardsTab l={l} /> : tab === 'revision' ? <RevisionTab l={l} plan={plan} /> : <PointsTab l={l} />}
    </>
  );
}

function PointsTab({ l }) {
  const { run, openDialog } = useStore();
  const [draft, setDraft] = useState('');

  const add = async e => {
    e.preventDefault();
    if (!draft.trim()) return;
    if (await run(() => api.post(`/lessons/${l.id}/points`, { text: draft }))) setDraft('');
  };
  const edit = p => openDialog(
    <FormDialog
      title="Edit key point"
      fields={[{ name: 'text', label: 'Key point', type: 'textarea', value: p.text, required: true }]}
      onSubmit={v => run(() => api.patch(`/points/${p.id}`, v))}
    />,
  );

  return (
    <div className="two-col">
      <section className="card pad">
        <h3>Key points</h3>
        <p className="muted sm">The main ideas you took away from this lesson.</p>
        {l.points.length > 0 && (
          <ol className="points">
            {l.points.map(p => (
              <li key={p.id}>
                <span>{p.text}</span>
                <div className="row-actions">
                  <button className="icon-btn sm" onClick={() => edit(p)} aria-label="Edit point"><Icon name="edit" /></button>
                  <button className="icon-btn sm danger" onClick={() => run(() => api.del(`/points/${p.id}`))} aria-label="Delete point"><Icon name="trash" /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <form className="add-inline" onSubmit={add}>
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a key point and press Enter" autoComplete="off" required />
          <button className="btn primary">Add</button>
        </form>
      </section>
      <Notes key={l.id} l={l} />
    </div>
  );
}

/** Free-form notes, saved shortly after typing stops (and on leaving the tab). */
function Notes({ l }) {
  const { refresh } = useStore();
  const [text, setText] = useState(l.notes);
  const [status, setStatus] = useState('');
  const latest = useRef(text);
  const timer = useRef(null);

  const persist = () => {
    clearTimeout(timer.current);
    timer.current = null;
    return api.patch(`/lessons/${l.id}`, { notes: latest.current })
      .then(() => { setStatus('Saved'); refresh(); })
      .catch(e => setStatus(`Not saved — ${e.message}`));
  };

  useEffect(() => () => { if (timer.current) persist(); }, []);

  const onChange = e => {
    setText(e.target.value);
    latest.current = e.target.value;
    setStatus('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, 600);
  };

  return (
    <section className="card pad">
      <h3>Notes</h3>
      <p className="muted sm">Anything else worth remembering — saved automatically.</p>
      <textarea id="notes" value={text} onChange={onChange} placeholder="Examples, questions, links…" />
      <span className="saved">{status}</span>
    </section>
  );
}

function CardsTab({ l }) {
  const { run, openDialog } = useStore();
  const [filter, setFilter] = useState('all');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const frontRef = useRef(null);
  const hardCount = l.cards.filter(c => c.hard).length;
  const list = filter === 'hard' ? l.cards.filter(c => c.hard) : l.cards;

  const add = async e => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    if (await run(() => api.post(`/lessons/${l.id}/cards`, { front, back }), 'Flashcard added')) {
      setFront(''); setBack('');
      frontRef.current?.focus();
    }
  };
  const edit = c => openDialog(
    <FormDialog
      title="Edit flashcard"
      fields={[
        { name: 'front', label: 'Question or term', value: c.front, required: true },
        { name: 'back', label: 'Answer or definition', type: 'textarea', value: c.back, required: true },
      ]}
      onSubmit={v => run(() => api.patch(`/cards/${c.id}`, v))}
    />,
  );
  const remove = c => openDialog(
    <ConfirmDialog title="Delete this flashcard?" text={c.front} onYes={() => run(() => api.del(`/cards/${c.id}`), 'Flashcard deleted')} />,
  );
  const study = hardOnly => openDialog(<StudyDialog lesson={l} hardOnly={hardOnly} />);

  return (
    <section className="card pad">
      <form className="fc-add" onSubmit={add}>
        <input ref={frontRef} value={front} onChange={e => setFront(e.target.value)} placeholder="Question or term" autoComplete="off" required />
        <textarea
          value={back} onChange={e => setBack(e.target.value)} placeholder="Answer or definition" rows={1} required
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}
        />
        <button className="btn primary"><Icon name="plus" /> Add card</button>
      </form>

      <div className="fc-toolbar">
        <div className="seg-inline" role="group" aria-label="Filter cards">
          <button className={`seg-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All · {l.cards.length}</button>
          <button className={`seg-btn ${filter === 'hard' ? 'on' : ''}`} onClick={() => setFilter('hard')}><Icon name="star" filled /> Hard · {hardCount}</button>
        </div>
        <span className="spacer" />
        {hardCount > 0 && <button className="btn outline sm" onClick={() => study(true)}><Icon name="star" /> Study hard cards</button>}
        <button className="btn primary sm" onClick={() => study(false)} disabled={!l.cards.length}><Icon name="play" /> Study all</button>
      </div>

      {list.length
        ? (
          <div className="fc-grid">
            {list.map(c => (
              <article key={c.id} className={`fc ${c.hard ? 'hard' : ''}`}>
                <div className="fc-front">{c.front}</div>
                <div className="fc-back">{c.back}</div>
                <footer>
                  <button className={`star-btn ${c.hard ? 'on' : ''}`} aria-pressed={c.hard} onClick={() => run(() => api.patch(`/cards/${c.id}`, { hard: !c.hard }))}>
                    <Icon name="star" filled={c.hard} /> {c.hard ? 'Hard to remember' : 'Mark as hard'}
                  </button>
                  <span className="spacer" />
                  <button className="icon-btn sm" onClick={() => edit(c)} aria-label="Edit card"><Icon name="edit" /></button>
                  <button className="icon-btn sm danger" onClick={() => remove(c)} aria-label="Delete card"><Icon name="trash" /></button>
                </footer>
              </article>
            ))}
          </div>
        )
        : (
          <div className="empty">
            {filter === 'hard' && l.cards.length ? 'No cards marked as hard. Tap the star on a card to highlight it.' : 'No flashcards yet. Add your first one above.'}
          </div>
        )}
    </section>
  );
}

function RevisionTab({ l, plan }) {
  const { intervals, run } = useStore();
  const done = plan.filter(r => r.done).length;
  const pct = plan.length ? Math.round(done / plan.length * 100) : 0;
  const t = today();

  const toggle = r => run(() => (r.done
    ? api.del(`/lessons/${l.id}/revisions/${r.offset}`)
    : api.put(`/lessons/${l.id}/revisions/${r.offset}`, { doneOn: today() })));

  return (
    <section className="card pad">
      <div className="rev-head">
        <div>
          <h3>Revision plan</h3>
          <p className="muted sm">
            Marked <b>{cap(l.difficulty)}</b>, so you’ll revise {plural(plan.length, 'time')}, counted from {fmt(l.date)} — your first day on this lesson.
            Each revision appears on the home page when it’s due. Change the difficulty above to adjust the plan.
          </p>
        </div>
        <Ring pct={pct} size={52} />
      </div>
      <ol className="timeline">
        {plan.map(r => {
          const n = daysBetween(t, r.due);
          const status = r.done ? 'done' : n < 0 ? 'overdue' : n === 0 ? 'due' : 'upcoming';
          const aria = r.done ? 'Mark revision as not done' : 'Mark revision as done';
          return (
            <li key={r.offset} className={`tl ${status}`}>
              <button className={`check-btn ${r.done ? 'on' : ''}`} onClick={() => toggle(r)} aria-label={aria} title={aria}><Icon name="check" /></button>
              <div className="tl-main">
                <b>Revision {r.n}</b> <span className="muted sm">· day {r.offset}</span>
                <div className="sm muted">{fmt(r.due)} · {r.done ? `revised on ${fmt(r.done)}` : rel(r.due)}</div>
              </div>
              <span className={`tag ${status}`}>{{ done: 'Done', overdue: 'Overdue', due: 'Due today', upcoming: 'Upcoming' }[status]}</span>
            </li>
          );
        })}
      </ol>
      <div className="legend">
        {DIFFS.map(d => (
          <div key={d} className={d === l.difficulty ? 'on' : ''}>
            <DiffChip d={d} />
            <div className="muted">{plural(intervals[d].length, 'revision')} · days {intervals[d].join(', ')}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
