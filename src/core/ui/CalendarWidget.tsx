import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CalendarMark } from '../api';
import { dayOf } from '../pages/daily';
import { useApp } from './AppStoreContext';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The 42 days shown for a month: whole weeks, Monday first. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const back = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => dayOf(new Date(year, month, 1 - back + i)));
}

const COLOURS = new Set(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'grey']);
const dotColour = (c: string | undefined) =>
  c !== undefined && COLOURS.has(c) ? `var(--section-${c})` : 'var(--accent)';

/**
 * A month at a glance: daily pages, and what modules mark, such as tasks
 * due and planned dates. Choosing a day lists its marks; its page opens
 * from there.
 */
export function CalendarWidget() {
  const calendarMarks = useApp((s) => s.calendarMarks);
  const openDay = useApp((s) => s.openDay);
  const openPath = useApp((s) => s.openPath);
  // Read again as the index catches up, and when modules come and go.
  const progress = useApp((s) => s.indexProgress);
  const sources = useApp((s) => s.calendarSources);
  const today = dayOf(new Date());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [chosen, setChosen] = useState<string>(today);
  const [marks, setMarks] = useState<CalendarMark[]>([]);
  const days = monthGrid(month.year, month.month);
  const from = days[0] ?? today;
  const to = days.at(-1) ?? today;

  useEffect(() => {
    let current = true;
    void calendarMarks(from, to).then((found) => {
      if (current) setMarks(found);
    });
    return () => {
      current = false;
    };
  }, [calendarMarks, from, to, progress, sources]);

  const byDay = new Map<string, CalendarMark[]>();
  for (const m of marks) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);
  const label = new Date(month.year, month.month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
  const step = (by: number) => {
    setMonth((m) => {
      const d = new Date(m.year, m.month + by, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };
  const chosenMarks = byDay.get(chosen) ?? [];
  const chosenDate = new Date(`${chosen}T12:00:00`);

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button
          type="button"
          className="icon-button"
          aria-label="Previous month"
          onClick={() => {
            step(-1);
          }}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <span className="calendar-month" aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Next month"
          onClick={() => {
            step(1);
          }}
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="calendar-grid" role="grid" aria-label={label}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="calendar-weekday" aria-hidden>
            {d.charAt(0)}
          </span>
        ))}
        {days.map((day) => {
          const dayMarks = byDay.get(day) ?? [];
          const inMonth = Number(day.slice(5, 7)) - 1 === month.month;
          const classes = [
            'calendar-day',
            inMonth ? '' : 'other-month',
            day === today ? 'today' : '',
            day === chosen ? 'chosen' : '',
          ]
            .filter((c) => c !== '')
            .join(' ');
          const name = new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          return (
            <button
              key={day}
              type="button"
              className={classes}
              aria-label={
                dayMarks.length === 0 ? name : `${name}, ${String(dayMarks.length)} marked`
              }
              aria-pressed={day === chosen}
              onClick={() => {
                setChosen(day);
              }}
              onDoubleClick={() => void openDay(day)}
            >
              {Number(day.slice(8))}
              {dayMarks.length > 0 && (
                <span className="calendar-dots" aria-hidden>
                  {dayMarks.slice(0, 3).map((m, i) => (
                    <span key={i} style={{ background: dotColour(m.colour) }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-day-list">
        <div className="calendar-day-head">
          <strong>
            {chosenDate.toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </strong>
          <button type="button" className="quiet" onClick={() => void openDay(chosen)}>
            Open the day’s page
          </button>
        </div>
        {chosenMarks.filter((m) => m.title !== 'Daily page').length === 0 ? (
          <p className="hint">Nothing marked.</p>
        ) : (
          <ul>
            {chosenMarks
              .filter((m) => m.title !== 'Daily page')
              .map((m, i) => (
                <li key={i}>
                  <span className="calendar-dot" style={{ background: dotColour(m.colour) }} />
                  {m.path === undefined ? (
                    m.title
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => void openPath(m.path ?? '')}
                    >
                      {m.title}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
