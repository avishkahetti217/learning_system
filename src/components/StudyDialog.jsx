import { useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.jsx';
import { Modal } from './dialogs.jsx';
import { Icon, plural } from './ui.jsx';

export default function StudyDialog({ lesson, hardOnly }) {
  const { closeDialog, run, toast } = useStore();
  const [deck, setDeck] = useState(() => lesson.cards.filter(c => !hardOnly || c.hard));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = deck[i];

  const go = next => { setI(next); setFlipped(false); };
  const prev = () => i > 0 && go(i - 1);
  const next = () => {
    if (i < deck.length - 1) return go(i + 1);
    closeDialog();
    toast(`Session complete — ${plural(deck.length, 'card')} reviewed`);
  };
  const toggleHard = () => {
    const hard = !card.hard;
    setDeck(d => d.map(c => (c.id === card.id ? { ...c, hard } : c)));
    run(() => api.patch(`/cards/${card.id}`, { hard }));
  };

  function onKeyDown(e) {
    if (e.key === ' ') { e.preventDefault(); setFlipped(f => !f); }
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }

  return (
    <Modal>
      {/* Space flips the card even when a button has focus, so suppress the button's own keyup click. */}
      <div className="modal study" tabIndex={-1} onKeyDown={onKeyDown} onKeyUp={e => e.key === ' ' && e.preventDefault()} data-autofocus>
        <header>
          <h2>{lesson.title}</h2>
          <span className="muted sm">{i + 1} / {deck.length}{hardOnly && ' · hard cards'}</span>
          <button className="icon-btn" onClick={closeDialog} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="bar study-progress"><i style={{ width: `${(i + 1) / deck.length * 100}%` }} /></div>
        <div className="study-body">
          {/* keyed so moving to the next card doesn't animate the flip back */}
          <button key={card.id} className={`flip ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(f => !f)} aria-label="Flip card">
            <div className="flip-inner">
              <div className="face front"><span className="face-label">Question</span><p>{card.front}</p></div>
              <div className="face back"><span className="face-label">Answer</span><p>{card.back}</p></div>
            </div>
          </button>
          <p className="muted sm center">Click the card or press Space to flip · ← → to move</p>
        </div>
        <footer className="study-foot">
          <button className="btn outline" onClick={prev} disabled={i === 0}><Icon name="left" /> Prev</button>
          <button className={`star-btn ${card.hard ? 'on' : ''}`} onClick={toggleHard}>
            <Icon name="star" filled={card.hard} /> {card.hard ? 'Hard to remember' : 'Mark as hard'}
          </button>
          <button className="btn primary" onClick={next}>{i === deck.length - 1 ? 'Finish' : 'Next'} <Icon name="right" /></button>
        </footer>
      </div>
    </Modal>
  );
}
