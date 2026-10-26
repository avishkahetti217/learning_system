import { useEffect, useState } from 'react';
import { useStore } from './store.jsx';
import { isDue } from './lib/plan.js';
import { Icon } from './components/ui.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import Home from './pages/Home.jsx';
import Course from './pages/Course.jsx';
import Lesson from './pages/Lesson.jsx';
import Plans, { PlanDetail } from './pages/Plans.jsx';

/** Hash routes: #/  ·  #/course/:id  ·  #/lesson/:id/:tab (study | points | cards | revision)  ·  #/plans  ·  #/plan/:id */
function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}

export default function App() {
  const { data, error, refresh, intervals, openDialog, resolvedTheme, setTheme } = useStore();
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
  const [view, id, tab] = useHashRoute();

  useEffect(() => { window.scrollTo(0, 0); }, [view, id]);

  const dueCount = data ? data.lessons.filter(l => isDue(l, intervals)).length : 0;
  useEffect(() => { document.title = dueCount ? `(${dueCount}) LearnLog` : 'LearnLog'; }, [dueCount]);

  let page;
  if (!data) {
    page = error
      ? (
        <div className="card empty-block">
          <h3>Can’t reach the server</h3>
          <p className="muted">{error}</p>
          <button className="btn primary" onClick={refresh}>Try again</button>
        </div>
      )
      : <p className="muted center" style={{ padding: 48 }}>Loading…</p>;
  } else if (view === 'course') page = <Course id={id} />;
  else if (view === 'lesson') page = <Lesson key={id} id={id} tab={tab || 'study'} />;
  else if (view === 'plans') page = <Plans />;
  else if (view === 'plan') page = <PlanDetail key={id} id={id} />;
  else page = <Home />;

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <a href="#/" className="brand">
            <span className="brand-mark"><Icon name="book" /></span>
            LearnLog
          </a>
          <div className="actions">
            <a href="#/plans" className={`nav-link ${view === 'plans' || view === 'plan' ? 'on' : ''}`}>
              <Icon name="calendar" /> <span>Exam plans</span>
            </a>
            <button className="icon-btn" onClick={() => setTheme(nextTheme)} aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}>
              <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button className="icon-btn" onClick={() => data && openDialog(<SettingsDialog />)} aria-label="Settings" title="Settings">
              <Icon name="settings" />
            </button>
          </div>
        </div>
      </header>
      <main className="wrap">{page}</main>
    </>
  );
}
