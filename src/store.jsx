import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { today } from './lib/dates.js';

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const THEME_KEY = 'learnlog.theme';
function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [toastMsg, setToastMsg] = useState({ text: '', show: false });
  const [, setDay] = useState(today());
  const [theme, setTheme] = useState(() => readTheme());
  const [resolvedTheme, setResolvedTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const toastTimer = useRef();

  // Theme preference: 'system' follows the OS (live), 'light'/'dark' override it. Saved per browser.
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      const root = document.documentElement;
      if (root.dataset.theme !== resolved) {
        // Switch instantly; per-element colour transitions would otherwise fade at different speeds.
        root.classList.add('theme-switching');
        root.dataset.theme = resolved;
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
      }
      setResolvedTheme(resolved);
    };
    apply();
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch { /* storage unavailable — the choice just won't persist */ }
    if (theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const refresh = useCallback(async () => {
    try {
      setData(await api.get('/data'));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const toast = useCallback(text => {
    setToastMsg({ text, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(t => ({ ...t, show: false })), 2400);
  }, []);

  /** Runs an API call, reloads data and reports the outcome. Resolves to true on success. */
  const run = useCallback(async (call, successMsg) => {
    try {
      await call();
      await refresh();
      if (successMsg) toast(successMsg);
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  }, [refresh, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-render when the tab regains focus on a new day so "due today" stays accurate.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) setDay(today()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const lookups = useMemo(() => {
    if (!data) return {};
    const byId = list => new Map(list.map(x => [x.id, x]));
    const courses = byId(data.courses), modules = byId(data.modules), lessons = byId(data.lessons);
    return {
      course: id => courses.get(id),
      mod: id => modules.get(id),
      lesson: id => lessons.get(id),
      modulesOf: courseId => data.modules.filter(m => m.courseId === courseId),
      lessonsOf: moduleId => data.lessons.filter(l => l.moduleId === moduleId)
        .sort((a, b) => (a.week - b.week) || a.date.localeCompare(b.date)),
      lessonsOfCourse: courseId => data.lessons.filter(l => l.courseId === courseId),
    };
  }, [data]);

  const value = {
    data, error, refresh, run, toast,
    theme, setTheme, resolvedTheme,
    intervals: data?.settings.intervals,
    openDialog: setDialog,
    closeDialog: useCallback(() => setDialog(null), []),
    ...lookups,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
      {dialog}
      <div id="toast" className={toastMsg.show ? 'show' : ''} role="status" aria-live="polite">{toastMsg.text}</div>
    </StoreContext.Provider>
  );
}
