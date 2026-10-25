import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { DIFFS } from '../lib/plan.js';
import { Icon, cap, plural } from './ui.jsx';

/** A native modal <dialog>. Closing (Esc, backdrop, buttons) clears the store's dialog slot. */
export function Modal({ children }) {
  const { closeDialog } = useStore();
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d.open) d.showModal();
    d.querySelector('[data-autofocus], input:not([type=radio]):not([type=file]), textarea')?.focus();
  }, []);
  return (
    <dialog ref={ref} onClose={closeDialog} onClick={e => { if (e.target === ref.current) closeDialog(); }}>
      {children}
    </dialog>
  );
}

function Field({ f }) {
  if (f.row) return <div className="field-row">{f.row.map(x => <Field key={x.name} f={x} />)}</div>;
  const hint = f.hint && <small>{f.hint}</small>;
  if (f.type === 'segmented') {
    return (
      <div className="field">
        <span>{f.label}</span>
        <div className="seg">
          {f.options.map(o => (
            <label key={o.value} className={o.value}>
              <input type="radio" name={f.name} value={o.value} defaultChecked={o.value === f.value} />
              <span>{o.label}{o.sub && <small>{o.sub}</small>}</span>
            </label>
          ))}
        </div>
        {hint}
      </div>
    );
  }
  const props = { name: f.name, defaultValue: f.value ?? '', required: f.required, ...f.attrs };
  return (
    <label className="field">
      <span>{f.label}</span>
      {f.type === 'textarea' ? <textarea rows={f.rows || 3} {...props} /> : <input type={f.type || 'text'} {...props} />}
      {hint}
    </label>
  );
}

/** Form in a modal. `onSubmit` receives trimmed values; return false to keep the dialog open. */
export function FormDialog({ title, fields = [], submit = 'Save', onSubmit, children }) {
  const { closeDialog } = useStore();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const values = {};
    for (const [k, v] of new FormData(e.currentTarget)) values[k] = typeof v === 'string' ? v.trim() : v;
    setBusy(true);
    const ok = await onSubmit(values);
    setBusy(false);
    if (ok !== false) closeDialog();
  }

  return (
    <Modal>
      <form className="modal" onSubmit={handleSubmit}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={closeDialog} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="modal-body">
          {fields.map((f, i) => <Field key={f.name || i} f={f} />)}
          {children}
        </div>
        <footer>
          <button type="button" className="btn ghost" onClick={closeDialog}>Cancel</button>
          <button className="btn primary" disabled={busy}>{submit}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ title, text, yesLabel = 'Delete', onYes }) {
  const { closeDialog } = useStore();
  return (
    <Modal>
      <div className="modal">
        <header><h2>{title}</h2></header>
        <div className="modal-body"><p className="muted">{text}</p></div>
        <footer>
          <button className="btn ghost" onClick={closeDialog} data-autofocus>Cancel</button>
          <button className="btn danger" onClick={() => { closeDialog(); onYes(); }}>{yesLabel}</button>
        </footer>
      </div>
    </Modal>
  );
}

export const lessonFields = (l, intervals) => [
  { name: 'title', label: 'Lesson title', value: l.title, required: true, attrs: { maxLength: 200 } },
  { row: [
    { name: 'week', label: 'Week number', type: 'number', value: l.week, required: true, attrs: { min: 1, max: 999, step: 1 } },
    { name: 'date', label: 'Start date', type: 'date', value: l.date, required: true, hint: 'Revisions are counted from this day' },
  ] },
  { name: 'difficulty', label: 'How hard is it?', type: 'segmented', value: l.difficulty,
    hint: 'Harder lessons get more revision prompts.',
    options: DIFFS.map(d => ({ value: d, label: cap(d), sub: plural(intervals[d].length, 'revision') })) },
];
