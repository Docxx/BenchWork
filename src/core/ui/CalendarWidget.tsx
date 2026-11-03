import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { CalendarMark } from '../api';
import { parseCalendar, type CalendarPreferences } from '../settings/calendar';
import './calendar.css';
import { dayOf } from '../pages/daily';
import { useApp } from './AppStoreContext';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The 42 days shown for a month: whole weeks, Monday first. */
export function monthGrid(year: number, month: number, sunday = false): string[] {
  const first = new Date(year, month, 1);
  const back = sunday ? first.getDay() : (first.getDay() + 6) % 7;
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
  const homes = useApp((s) => s.settings.home);
  const status = useApp((s) => s.status);
  const calendar = status.kind === 'open' ? homes[status.vault.root]?.calendar : undefined;
  const setHomeLayout = useApp((s) => s.setHomeLayout);
  const settingsError = useApp((s) => s.settingsError);
  const preferences = parseCalendar(calendar);
  const [customise, setCustomise] = useState(false);
  const change = (changes: Partial<CalendarPreferences>) => {
    void setHomeLayout({ calendar: { ...preferences, ...changes } });
  };
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
  const monthDays = monthGrid(month.year, month.month, preferences.weekStart === 'sunday');
  const selectedDay = new Date(`${chosen}T12:00:00`);
  const weekBack =
    preferences.weekStart === 'sunday' ? selectedDay.getDay() : (selectedDay.getDay() + 6) % 7;
  const days =
    preferences.view === 'week'
      ? Array.from({ length: 7 }, (_, i) =>
          dayOf(
            new Date(
              selectedDay.getFullYear(),
              selectedDay.getMonth(),
              selectedDay.getDate() - weekBack + i,
            ),
          ),
        )
      : monthDays;
  const from = days[0] ?? today;
  const to = days.at(-1) ?? today;

  useEffect(() => {
    let current = true;
    void calendarMarks(from, to).then((found) => {
      if (current)
        setMarks(preferences.dailyPages ? found : found.filter((m) => m.title !== 'Daily page'));
    });
    return () => {
      current = false;
    };
  }, [calendarMarks, from, to, progress, sources, preferences.dailyPages]);

  const byDay = new Map<string, CalendarMark[]>();
  for (const m of marks) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);
  const label = new Date(month.year, month.month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
  const step = (by: number) => {
    if (preferences.view === 'week') {
      const next = new Date(`${chosen}T12:00:00`);
      next.setDate(next.getDate() + by * 7);
      setChosen(dayOf(next));
      setMonth({ year: next.getFullYear(), month: next.getMonth() });
      return;
    }
    const d = new Date(month.year, month.month + by, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
    setChosen(dayOf(d));
  };
  const chosenMarks = byDay.get(chosen) ?? [];
  const chosenDate = new Date(`${chosen}T12:00:00`);

  return (
    <div
      className={`calendar calendar-${preferences.density}`}
      style={
        {
          '--calendar-accent':
            preferences.colour === 'theme'
              ? 'var(--accent)'
              : `var(--section-${preferences.colour})`,
        } as CSSProperties
      }
    >
      <div className="calendar-controls">
        <div className="calendar-views" role="group" aria-label="Calendar view">
          {(['month', 'week', 'agenda'] as const).map((view) => (
            <button
              key={view}
              type="button"
              className="quiet"
              aria-pressed={preferences.view === view}
              onClick={() => {
                change({ view });
              }}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Customise calendar"
          aria-expanded={customise}
          onClick={() => {
            setCustomise(!customise);
          }}
        >
          <Settings2 size={16} aria-hidden />
        </button>
      </div>
      {customise && (
        <fieldset className="calendar-options">
          <legend>Calendar appearance</legend>
          <label>
            Day size
            <select
              aria-label="Calendar day size"
              value={preferences.density}
              onChange={(e) => {
                change({ density: e.target.value as CalendarPreferences['density'] });
              }}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </label>
          <label>
            Week starts
            <select
              aria-label="Calendar week starts"
              value={preferences.weekStart}
              onChange={(e) => {
                change({ weekStart: e.target.value as CalendarPreferences['weekStart'] });
              }}
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </label>
          <label>
            Accent
            <select
              aria-label="Calendar accent"
              value={preferences.colour}
              onChange={(e) => {
                change({ colour: e.target.value as CalendarPreferences['colour'] });
              }}
            >
              {['theme', 'blue', 'teal', 'purple', 'orange'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.agenda}
              onChange={(e) => {
                change({ agenda: e.target.checked });
              }}
            />
            Show selected-day agenda
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.dailyPages}
              onChange={(e) => {
                change({ dailyPages: e.target.checked });
              }}
            />
            Show daily page markers
          </label>
        </fieldset>
      )}
      {settingsError && (
        <p role="alert" className="hint">
          {settingsError}
        </p>
      )}
      <div className="calendar-head">
        <button
          type="button"
          className="icon-button"
          aria-label={preferences.view === 'week' ? 'Previous week' : 'Previous month'}
          onClick={() => {
            step(-1);
          }}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className="quiet"
          aria-label="Calendar today"
          onClick={() => {
            const now = new Date();
            setChosen(dayOf(now));
            setMonth({ year: now.getFullYear(), month: now.getMonth() });
          }}
        >
          Today
        </button>
        <span className="calendar-month" aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={preferences.view === 'week' ? 'Next week' : 'Next month'}
          onClick={() => {
            step(1);
          }}
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {preferences.view !== 'agenda' && (
        <div className="calendar-grid" role="grid" aria-label={label}>
          {(preferences.weekStart === 'sunday' ? ['Sun', ...WEEKDAYS.slice(0, 6)] : WEEKDAYS).map(
            (d) => (
              <span key={d} className="calendar-weekday" aria-hidden>
                {d}
              </span>
            ),
          )}
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
      )}
      {preferences.view === 'agenda' && (
        <div className="calendar-agenda" aria-label="Calendar agenda">
          {marks.filter((m) => m.title !== 'Daily page').length === 0 && (
            <p className="hint">No upcoming items in this month.</p>
          )}
          {[...byDay]
            .filter(([, events]) => events.some((m) => m.title !== 'Daily page'))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, events]) => (
              <section key={date}>
                <button type="button" className="quiet" onClick={() => void openDay(date)}>
                  {new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </button>
                {events
                  .filter((m) => m.title !== 'Daily page')
                  .map((m, i) => (
                    <button
                      type="button"
                      className="calendar-agenda-item quiet"
                      key={i}
                      onClick={() => {
                        if (m.path) void openPath(m.path);
                        else void openDay(date);
                      }}
                    >
                      <span className="calendar-dot" style={{ background: dotColour(m.colour) }} />
                      {m.title}
                    </button>
                  ))}
              </section>
            ))}
        </div>
      )}
      {preferences.view !== 'agenda' && preferences.agenda && (
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
      )}
    </div>
  );
}
