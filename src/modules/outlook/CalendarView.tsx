import { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { eventTime, message, type OutlookClient } from './client';
import type { Event } from './types';
import { localDate } from './calendarDates';
import { EventEditor } from './EventEditor';

export function CalendarView({ client }: { client: OutlookClient }) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [selectedCalendar, setSelectedCalendar] = useState('all');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<'week' | 'month' | 'agenda'>('week');
  const [events, setEvents] = useState<Event[]>(state.cache.events);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Event | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void client.calendars().catch(() => {});
  }, [client]);
  const from = new Date(`${date}T00:00:00`);
  if (mode === 'month') from.setDate(1);
  if (mode === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const to = new Date(from);
  if (mode === 'month') to.setMonth(to.getMonth() + 1);
  else to.setDate(to.getDate() + (mode === 'week' ? 7 : 30));
  const fromIso = from.toISOString(),
    toIso = to.toISOString();
  useEffect(() => {
    let live = true;
    const calendars = state.cache.calendars.filter(
      (c) => selectedCalendar === 'all' || c.id === selectedCalendar,
    );
    if (!calendars.length) return;
    void Promise.all(calendars.map((c) => client.events(c, fromIso, toIso)))
      .then((lists) => {
        if (live) {
          setEvents(lists.flat());
          setOffline(false);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setEvents(client.snapshot().cache.events);
          setOffline(true);
          setError(message(e));
        }
      });
    return () => {
      live = false;
    };
  }, [client, selectedCalendar, fromIso, toIso, refresh, state.cache.calendars]);
  const shown = events
    .filter(
      (e) =>
        !e.isCancelled &&
        (selectedCalendar === 'all' || e.calendarId === selectedCalendar) &&
        eventTime(e.start) < to &&
        eventTime(e.end) > from,
    )
    .sort((a, b) => eventTime(a.start).getTime() - eventTime(b.start).getTime());
  const days = new Map<string, Event[]>();
  for (const event of shown) {
    const key = eventTime(event.start).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await run();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="outlook-calendar-toolbar">
        <button
          type="button"
          onClick={() => {
            setEditor('new');
          }}
        >
          <Plus size={16} aria-hidden />
          New event
        </button>
        <button
          type="button"
          className="quiet"
          aria-label="Previous calendar period"
          onClick={() => {
            const d = new Date(from);
            if (mode === 'month') d.setMonth(d.getMonth() - 1);
            else d.setDate(d.getDate() - (mode === 'week' ? 7 : 30));
            setDate(localDate(d));
          }}
        >
          <ChevronLeft size={17} aria-hidden />
        </button>
        <input
          aria-label="Calendar date"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
        <button
          type="button"
          className="quiet"
          aria-label="Next calendar period"
          onClick={() => {
            setDate(localDate(to));
          }}
        >
          <ChevronRight size={17} aria-hidden />
        </button>
        <select
          aria-label="Calendar range"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as typeof mode);
          }}
        >
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="agenda">30-day agenda</option>
        </select>
        <select
          aria-label="Outlook calendar"
          value={selectedCalendar}
          onChange={(e) => {
            setSelectedCalendar(e.target.value);
          }}
        >
          <option value="all">All calendars</option>
          {state.cache.calendars.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="quiet"
          aria-label="Refresh Outlook calendar"
          onClick={() => {
            setRefresh((n) => n + 1);
          }}
        >
          <RefreshCw size={17} aria-hidden />
        </button>
      </div>
      {offline && (
        <p className="notice" role="status">
          Showing this device’s cached calendar. Refresh when connected for changes and new
          invitations.
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div
        className={`outlook-calendar-events outlook-calendar-${mode}`}
        aria-label="Calendar events"
      >
        {shown.length === 0 && (
          <p className="hint">No events in this range. Refresh or select another calendar.</p>
        )}
        {[...days].map(([day, items]) => (
          <section className="outlook-day" key={day}>
            <h2>{day}</h2>
            {items.map((event) => (
              <article className="outlook-event" key={`${event.calendarId ?? ''}:${event.id}`}>
                <time>
                  {event.isAllDay
                    ? 'All day'
                    : `${eventTime(event.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} – ${eventTime(event.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                </time>
                <h3>{event.subject || '(No title)'}</h3>
                <p>{event.location?.displayName}</p>
                <small>{event.calendarName}</small>
                <p>{event.bodyPreview}</p>
                <div className="outlook-event-actions">
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() => {
                      setEditor(event);
                    }}
                  >
                    View / edit
                  </button>
                  {!event.isOrganizer && (
                    <>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Accept this invitation and notify the organiser?'))
                            void action(() => client.respond(event, 'accept'));
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Reply tentatively and notify the organiser?'))
                            void action(() => client.respond(event, 'tentativelyAccept'));
                        }}
                      >
                        Tentative
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Decline this invitation and notify the organiser?'))
                            void action(() => client.respond(event, 'decline'));
                        }}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {event.onlineMeeting?.joinUrl && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => void client.ctx.web.open(event.onlineMeeting?.joinUrl ?? '')}
                    >
                      Join meeting
                    </button>
                  )}
                  {event.webLink && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => void client.ctx.web.open(event.webLink ?? '')}
                    >
                      Open in Outlook
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
      {editor && (
        <EventEditor
          key={editor === 'new' ? 'new' : editor.id}
          client={client}
          calendars={state.cache.calendars}
          event={editor === 'new' ? null : editor}
          onClose={() => {
            setEditor(null);
          }}
          onSaved={() => {
            setEditor(null);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
