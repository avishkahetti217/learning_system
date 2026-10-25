import { useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { DEFAULT_INTERVALS, DIFFS } from '../lib/plan.js';
import { ConfirmDialog, FormDialog } from './dialogs.jsx';
import { DiffChip, Icon, cap, plural } from './ui.jsx';

const toText = intervals => Object.fromEntries(DIFFS.map(d => [d, intervals[d].join(', ')]));

export default function SettingsDialog() {
  const { intervals, run, toast, openDialog, theme, setTheme } = useStore();
  const [values, setValues] = useState(() => toText(intervals));

  const save = () => {
    const parsed = {};
    for (const d of DIFFS) {
      parsed[d] = values[d].split(/[\s,]+/).filter(Boolean).map(Number);
      if (!parsed[d].length || parsed[d].some(n => !Number.isInteger(n) || n < 1)) {
        toast(`Use whole days, separated by commas, for ${cap(d)}`);
        return false;
      }
    }
    return run(() => api.put('/settings', { intervals: parsed }), 'Revision schedule updated');
  };

  async function importFile(file) {
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!Array.isArray(data.courses) || !Array.isArray(data.lessons)) throw new Error();
    } catch {
      return toast('That file isn’t a valid LearnLog backup');
    }
    openDialog(
      <ConfirmDialog
        title="Replace your data?"
        text={`Everything will be replaced with this backup (${plural(data.courses.length, 'course')}, ${plural(data.lessons.length, 'lesson')}).`}
        yesLabel="Replace"
        onYes={async () => {
          if (await run(() => api.post('/import', data), 'Backup restored')) location.hash = '#/';
        }}
      />,
    );
  }

  return (
    <FormDialog title="Settings" submit="Save settings" onSubmit={save}>
      <h4 style={{ marginTop: 4 }}>Appearance</h4>
      <div className="seg-inline" role="group" aria-label="Theme" style={{ marginBottom: 4 }}>
        {[['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']].map(([value, icon, label]) => (
          <button
            key={value} type="button" className={`seg-btn ${theme === value ? 'on' : ''}`} aria-pressed={theme === value}
            onClick={() => setTheme(value)}
          ><Icon name={icon} /> {label}</button>
        ))}
      </div>

      <h4>Revision schedule</h4>
      <p className="muted sm" style={{ marginBottom: 12 }}>
        Days after a lesson’s start date when you’ll be prompted to revise. Separate with commas.
      </p>
      {DIFFS.map(d => (
        <label key={d} className="iv-row">
          <DiffChip d={d} />
          <input
            value={values[d]} inputMode="numeric" required aria-label={`${cap(d)} revision days`}
            onChange={e => setValues(v => ({ ...v, [d]: e.target.value }))}
          />
        </label>
      ))}
      <button type="button" className="link-btn" onClick={() => setValues(toText(DEFAULT_INTERVALS))}>Reset to defaults</button>

      <h4>Your data</h4>
      <p className="muted sm" style={{ marginBottom: 12 }}>
        Stored in a SQLite database on the server. Export a backup now and then.
      </p>
      <div className="btn-row">
        <a className="btn outline sm" href="/api/export" download><Icon name="download" /> Export backup</a>
        <label className="btn outline sm">
          <Icon name="upload" /> Import backup
          <input type="file" accept=".json,application/json" hidden onChange={e => importFile(e.target.files[0])} />
        </label>
      </div>
    </FormDialog>
  );
}
