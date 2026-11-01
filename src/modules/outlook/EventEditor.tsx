import { useState } from 'react';
import { eventTime, message, type OutlookClient } from './client';
import type { Calendar, Event } from './types';
import { localInput } from './calendarDates';

export function EventEditor({
  client,
  calendars,
  event,
  onClose,
  onSaved,
}: {
  client: OutlookClient;
  calendars: Calendar[];
  event: Event | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(event?.subject ?? '');
  const [calendar, setCalendar] = useState(
    event?.calendarId ?? calendars.find((c) => c.canEdit !== false)?.id ?? '',
  );
  const [start, setStart] = useState(() =>
    localInput(
      event
        ? event.isAllDay
          ? new Date(`${event.start.dateTime.slice(0, 10)}T00:00:00`)
          : eventTime(event.start)
        : new Date(),
    ),
  );
  const [end, setEnd] = useState(() =>
    localInput(
      event
        ? event.isAllDay
          ? new Date(`${event.end.dateTime.slice(0, 10)}T00:00:00`)
          : eventTime(event.end)
        : new Date(Date.now() + 3600_000),
    ),
  );
  const [location, setLocation] = useState(event?.location?.displayName ?? '');
  const [attendees, setAttendees] = useState(
    (event?.attendees ?? []).map((a) => a.emailAddress.address).join('; '),
  );
  const [notes, setNotes] = useState('');
  const [allDay, setAllDay] = useState(event?.isAllDay ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transactionId] = useState(() => crypto.randomUUID());
  const editable =
    !event?.recurrence &&
    event?.isOrganizer !== false &&
    calendars.find((c) => c.id === calendar)?.canEdit !== false;
  async function save() {
    setError('');
    let startDate = new Date(start),
      endDate = new Date(end);
    if (
      !subject.trim() ||
      !calendar ||
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      endDate <= startDate
    ) {
      setError('Add a title and an end time after the start.');
      return;
    }
    if (
      allDay &&
      (startDate.getHours() !== 0 ||
        startDate.getMinutes() !== 0 ||
        endDate.getHours() !== 0 ||
        endDate.getMinutes() !== 0)
    ) {
      setError('For all-day events, set midnight at the start and midnight after the final day.');
      return;
    }
    if (allDay) {
      startDate = new Date(`${start.slice(0, 10)}T00:00:00Z`);
      endDate = new Date(`${end.slice(0, 10)}T00:00:00Z`);
    }
    const recipients = attendees
      .split(/[;,\n]/)
      .map((a) => a.trim())
      .filter(Boolean);
    if (recipients.some((a) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a))) {
      setError('Check the attendee email addresses.');
      return;
    }
    if (
      recipients.length &&
      !window.confirm('Save this event and send invitations or updates to its attendees?')
    )
      return;
    setBusy(true);
    try {
      await client.saveEvent(
        calendar,
        {
          subject,
          location: { displayName: location },
          start: { dateTime: startDate.toISOString().replace('Z', ''), timeZone: 'UTC' },
          end: { dateTime: endDate.toISOString().replace('Z', ''), timeZone: 'UTC' },
          isAllDay: allDay,
          attendees: recipients.map((address) => ({ emailAddress: { address }, type: 'required' })),
          ...(!event || notes ? { body: { contentType: 'Text', content: notes } } : {}),
          ...(!event ? { transactionId } : {}),
        },
        event?.id,
      );
      onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="outlook-dialog-backdrop">
      <section
        className="outlook-compose"
        role="dialog"
        aria-modal="true"
        aria-label="Calendar event"
      >
        <h2>{event ? 'Calendar event' : 'New calendar event'}</h2>
        {!editable && (
          <p className="notice">
            Use Outlook to change recurring events or meetings organised by someone else.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || !editable}>
            <label>
              Calendar
              <select
                value={calendar}
                disabled={!!event}
                onChange={(e) => {
                  setCalendar(e.target.value);
                }}
              >
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Event title
              <input
                required
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                }}
              />
            </label>
            <label>
              Starts (your local time)
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                }}
              />
            </label>
            <label>
              Ends (your local time)
              <input
                type="datetime-local"
                required
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                }}
              />
            </label>
            <label className="outlook-check">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                }}
              />
              All-day event
            </label>
            <label>
              Location
              <input
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                }}
              />
            </label>
            <label>
              Attendees
              <input
                value={attendees}
                onChange={(e) => {
                  setAttendees(e.target.value);
                }}
                placeholder="Email addresses separated by semicolons"
              />
            </label>
            <label>
              {event ? 'Replace event notes (leave blank to preserve)' : 'Event notes'}
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
              />
            </label>
          </fieldset>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="submit" disabled={busy || !editable}>
              Save event
            </button>
            {event && editable && (
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Delete this event? If it has attendees, they may receive a cancellation.',
                    )
                  )
                    return;
                  setBusy(true);
                  void client
                    .deleteEvent(event)
                    .then(onSaved)
                    .catch((e: unknown) => {
                      setError(message(e));
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                Delete event
              </button>
            )}
            <button type="button" className="quiet" disabled={busy} onClick={onClose}>
              Close
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
