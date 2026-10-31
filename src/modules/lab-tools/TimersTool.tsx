import { useState } from 'react';
import { NumberField, useNumber } from './fields';
import { clock, stopwatchTime, timeLeft, useTimers, type Timer, type TimerStore } from './timers';

const QUICK = [1, 5, 10, 15, 30, 60];

function TimerRow({ store, timer, now }: { store: TimerStore; timer: Timer; now: number }) {
  const left = timeLeft(timer, now);
  const running = timer.endsAt !== null;
  return (
    <li className={timer.done ? 'lab-timer done' : 'lab-timer'} aria-label={timer.name}>
      <span className="lab-timer-name">{timer.name}</span>
      <span className="lab-timer-clock" role="timer">
        {timer.done ? 'Done' : clock(left)}
      </span>
      <span className="lab-timer-tools">
        {!timer.done &&
          (running ? (
            <button
              type="button"
              className="quiet"
              onClick={() => {
                store.pause(timer.id);
              }}
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="quiet"
              onClick={() => {
                store.resume(timer.id);
              }}
            >
              Start
            </button>
          ))}
        <button
          type="button"
          className="quiet"
          onClick={() => {
            store.extend(timer.id, 60_000);
          }}
        >
          +1 min
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            store.reset(timer.id);
          }}
        >
          Reset
        </button>
        <button
          type="button"
          className="quiet"
          aria-label={`Remove ${timer.name}`}
          onClick={() => {
            store.remove(timer.id);
          }}
        >
          ×
        </button>
      </span>
    </li>
  );
}

/** The running timers, for Home. */
/** The timer to show large: one that is done, else the running one ending soonest, else any. */
export function leadTimer(timers: readonly Timer[], now: number): Timer | null {
  const done = timers.find((t) => t.done);
  if (done) return done;
  const running = timers
    .filter((t) => t.endsAt !== null)
    .sort((a, b) => timeLeft(a, now) - timeLeft(b, now));
  return running[0] ?? timers[0] ?? null;
}

/** For Home and the docks: the next timer in large digits, the rest below, and quick starts. */
export function TimersCard({ store, onOpen }: { store: TimerStore; onOpen: () => void }) {
  const { timers, now } = useTimers(store);
  const lead = leadTimer(timers, now);
  const rest = timers.filter((t) => t !== lead);
  return (
    <div className="lab-timers-card">
      {lead === null ? (
        <p className="hint">No timers running.</p>
      ) : (
        <div className={lead.done ? 'lab-big-timer done' : 'lab-big-timer'}>
          <span className="lab-big-clock" role="timer" aria-label={`${lead.name} timer`}>
            {lead.done ? 'Done' : clock(timeLeft(lead, now))}
          </span>
          <span className="lab-big-name">{lead.name}</span>
          <span className="lab-timer-tools">
            {!lead.done &&
              (lead.endsAt !== null ? (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    store.pause(lead.id);
                  }}
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    store.resume(lead.id);
                  }}
                >
                  Start
                </button>
              ))}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                store.extend(lead.id, 60_000);
              }}
            >
              +1 min
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                store.remove(lead.id);
              }}
            >
              {lead.done ? 'Dismiss' : 'Remove'}
            </button>
          </span>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="lab-timers">
          {rest.map((t) => (
            <TimerRow key={t.id} store={store} timer={t} now={now} />
          ))}
        </ul>
      )}
      <div className="lab-quick" role="group" aria-label="Start a timer">
        {[1, 5, 10, 15, 30].map((m) => (
          <button
            key={m}
            type="button"
            className="quiet"
            onClick={() => {
              store.add(`${String(m)} min`, m * 60_000);
            }}
          >
            {m} min
          </button>
        ))}
        <button type="button" className="quiet" onClick={onOpen}>
          More…
        </button>
      </div>
    </div>
  );
}

export function TimersTool({ store }: { store: TimerStore }) {
  const { timers, watch, now } = useTimers(store);
  const [name, setName] = useState('');
  const [minutes, setMinutes, minutesV] = useNumber('5');
  const [seconds, setSeconds, secondsV] = useNumber('0');
  const length = ((minutesV ?? 0) * 60 + (secondsV ?? 0)) * 1000;
  const start = (ms: number, label = name) => {
    store.add(label, ms);
    setName('');
  };
  return (
    <>
      <div className="lab-field wide">
        <label htmlFor="lab-timer-name">Name</label>
        <input
          id="lab-timer-name"
          autoComplete="off"
          value={name}
          placeholder="Gel, incubation, spin…"
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </div>
      <NumberField label="Minutes" value={minutes} onChange={setMinutes} />
      <NumberField label="Seconds" value={seconds} onChange={setSeconds} />
      <div className="lab-buttons">
        <button
          type="button"
          disabled={!(length > 0)}
          onClick={() => {
            start(length);
          }}
        >
          Start timer
        </button>
        {QUICK.map((m) => (
          <button
            key={m}
            type="button"
            className="quiet"
            onClick={() => {
              start(m * 60_000, name.trim() === '' ? `${String(m)} min` : name);
            }}
          >
            {m} min
          </button>
        ))}
      </div>
      {timers.length > 0 && (
        <ul className="lab-timers" aria-label="Timers">
          {timers.map((t) => (
            <TimerRow key={t.id} store={store} timer={t} now={now} />
          ))}
        </ul>
      )}

      <h3 className="lab-subhead">Stopwatch</h3>
      <div className="lab-stopwatch">
        <span className="lab-timer-clock" role="timer" aria-label="Stopwatch">
          {clock(stopwatchTime(watch, now), false)}
        </span>
        {watch.startedAt === null ? (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              store.startStopwatch();
            }}
          >
            Start
          </button>
        ) : (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              store.stopStopwatch();
            }}
          >
            Stop
          </button>
        )}
        <button
          type="button"
          className="quiet"
          onClick={() => {
            store.resetStopwatch();
          }}
        >
          Reset
        </button>
      </div>
      <p className="hint lab-note">
        Timers keep running while you work elsewhere, and beep when done.
      </p>
    </>
  );
}
