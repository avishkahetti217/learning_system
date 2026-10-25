import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { today } from './lib/dates.js';

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [toastMsg, setToastMsg] = useState({ text: '', show: false });
  const [, setDay] = useState(today());
  const toastTimer = useRef();

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
