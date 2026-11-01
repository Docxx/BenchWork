import { useEffect, useRef, useState } from 'react';
import { clock } from './model';
export function PresenterTimer({ minutes }: { minutes: number }) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const accumulated = useRef(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setElapsed(accumulated.current + (performance.now() - started.current) / 1000);
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [running]);
  return (
    <section className="teaching-card">
      <h2>Talk timer</h2>
      <strong
        className="teaching-clock"
        style={{ color: elapsed > minutes * 60 ? 'var(--warn-text)' : 'inherit' }}
      >
        {clock(elapsed)}
      </strong>
      <p>
        {minutes.toFixed(1)} min planned{elapsed > minutes * 60 ? ' · over planned time' : ''}
      </p>
      <div className="teaching-toolbar">
        <button
          onClick={() => {
            if (running) accumulated.current += (performance.now() - started.current) / 1000;
            else started.current = performance.now();
            setRunning((v) => !v);
          }}
        >
          {running ? 'Pause timer' : 'Start timer'}
        </button>
        <button
          onClick={() => {
            accumulated.current = 0;
            started.current = performance.now();
            setElapsed(0);
            setRunning(false);
          }}
        >
          Reset timer
        </button>
      </div>
    </section>
  );
}
