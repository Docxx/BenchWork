import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import { RecordsView, text, today, type RecordSpec } from '../research/api';
import { suggestBooking, validateBooking } from './bookings';
export const EQUIPMENT: RecordSpec = {
  kind: 'equipment',
  title: 'Equipment',
  singular: 'equipment item',
  folder: 'Research/Equipment',
  defaults: { status: 'ready' },
  fields: [
    { key: 'location', label: 'Location' },
    {
      key: 'status',
      label: 'Status',
      kind: 'choice',
      options: ['ready', 'maintenance', 'out of service'],
    },
    { key: 'preparation', label: 'Preparation', kind: 'long' },
    { key: 'maintenance', label: 'Maintenance instructions', kind: 'long' },
    { key: 'nextMaintenance', label: 'Next maintenance', kind: 'date' },
    { key: 'lastMaintenance', label: 'Last maintained', kind: 'date' },
    { key: 'owner', label: 'Contact' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
};
export const BOOKING: RecordSpec = {
  kind: 'booking',
  title: 'Bookings',
  singular: 'booking',
  folder: 'Research/Bookings',
  defaults: { status: 'reserved' },
  fields: [
    { key: 'equipment', label: 'Equipment', kind: 'link', types: ['equipment'] },
    { key: 'experiment', label: 'Experiment', kind: 'link', types: ['experiment'] },
    { key: 'run', label: 'Run', kind: 'link', types: ['run'] },
    { key: 'start', label: 'Start', kind: 'datetime-local', required: true },
    { key: 'end', label: 'End', kind: 'datetime-local', required: true },
    { key: 'owner', label: 'For' },
    { key: 'status', label: 'Status', kind: 'choice', options: ['reserved', 'done', 'cancelled'] },
    { key: 'preparation', label: 'Preparation for this booking', kind: 'long' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
};
export function EquipmentView({ ctx, initial }: { ctx: ModuleContext; initial: string | null }) {
  const [bookings, setBookings] = useState(initial?.endsWith('.booking.yaml') ?? false);
  const spec = bookings
    ? {
        ...BOOKING,
        validate: (
          data: Record<string, unknown>,
          entries: Parameters<typeof validateBooking>[2],
          current: Parameters<typeof validateBooking>[3],
        ) => validateBooking(ctx, data, entries, current),
        suggest: (
          data: Record<string, unknown>,
          entries: Parameters<typeof suggestBooking>[2],
          current: Parameters<typeof validateBooking>[3],
        ) => suggestBooking(ctx, data, entries, current),
      }
    : EQUIPMENT;
  return (
    <>
      <p className="hint">
        Reservations are local plans in this vault. They do not book a university or external
        system.
      </p>
      <div className="workflow-toolbar">
        <button
          aria-pressed={!bookings}
          onClick={() => {
            setBookings(false);
          }}
        >
          Equipment
        </button>
        <button
          aria-pressed={bookings}
          onClick={() => {
            setBookings(true);
          }}
        >
          Bookings
        </button>
      </div>
      <RecordsView
        key={bookings ? 'bookings' : 'equipment'}
        ctx={ctx}
        spec={spec}
        initial={initial}
        detail={(entry) => (
          <>
            {entry.type === 'equipment' &&
              text(entry.data['nextMaintenance']) &&
              text(entry.data['nextMaintenance']) <= today() && (
                <p className="workflow-error">
                  Maintenance is due. Review preparation and maintenance before using this
                  equipment.
                </p>
              )}
          </>
        )}
      />
    </>
  );
}
