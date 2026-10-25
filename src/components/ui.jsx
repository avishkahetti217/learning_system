import { Fragment } from 'react';
import { daysBetween, rel, today } from '../lib/dates.js';

export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9Z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 18.5"/>',
  cards: '<rect x="2" y="7" width="15" height="14" rx="2"/><path d="M7 3h13a2 2 0 0 1 2 2v12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  play: '<path d="m7 4 13 8-13 8Z"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3Z"/>',
  mindmap: '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/><path d="m5.5 6.5 4.3 3.8M18.5 6.5l-4.3 3.8M5.5 17.5l4.3-3.8M18.5 17.5l-4.3-3.8"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};

export const Icon = ({ name, filled, className = '' }) => (
  <svg className={`ic ${filled ? 'filled' : ''} ${className}`} viewBox="0 0 24 24" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: PATHS[name] }} />
);

export const DiffChip = ({ d }) => <span className={`chip ${d}`}>{cap(d)}</span>;

export const Bar = ({ pct }) => (
  <div className={`bar ${pct === 100 ? 'full' : ''}`}><i style={{ width: `${pct}%` }} /></div>
);

export function Ring({ pct, size = 44 }) {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <svg className={`ring ${pct === 100 ? 'full' : ''}`} viewBox="0 0 44 44" width={size} height={size} role="img" aria-label={`${pct}% complete`}>
      <circle cx="22" cy="22" r={r} className="ring-bg" />
      <circle cx="22" cy="22" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle">{pct}%</text>
    </svg>
  );
}

export function DueTag({ due }) {
  const n = daysBetween(today(), due);
  if (n < 0) return <span className="tag overdue">Overdue {plural(-n, 'day')}</span>;
  if (n === 0) return <span className="tag due">Due today</span>;
  return <span className="tag">{cap(rel(due))}</span>;
}

export const EmptyBlock = ({ title, text, children }) => (
  <div className="card empty-block"><h3>{title}</h3><p className="muted">{text}</p>{children}</div>
);

export const NotFound = () => (
  <EmptyBlock title="Not found" text="This item may have been deleted."><a className="btn primary" href="#/">Go home</a></EmptyBlock>
);

export const Crumbs = ({ items }) => (
  <nav className="crumbs">
    <a href="#/">Home</a>
    {items.map(([label, href], i) => (
      <Fragment key={i}>
        <Icon name="right" />
        {href ? <a href={href}>{label}</a> : <span>{label}</span>}
      </Fragment>
    ))}
  </nav>
);
