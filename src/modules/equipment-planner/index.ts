import { createElement } from 'react';
import { Microscope } from 'lucide-react';
import { defineModule } from '@core/api';
import { loadEntries, saveEntry, scheduleItem, text, validDay } from '../research/api';
import { EquipmentView } from './EquipmentView';
import { validateBooking } from './bookings';
export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: 'equipment-planner.view',
      title: 'Equipment Planner',
      render: (initial) => createElement(EquipmentView, { ctx, initial }),
      tool: {
        icon: createElement(Microscope, { size: 18, 'aria-hidden': true }),
        hint: 'Reservations, preparation and maintenance',
      },
    });
    for (const kind of ['equipment', 'booking'])
      ctx.files.register({
        id: `equipment-planner.${kind}`,
        extensions: [`.${kind}.yaml`],
        name: kind === 'booking' ? 'Booking' : 'Equipment',
        watchesFile: true,
        render: ({ path }) => createElement(EquipmentView, { ctx, initial: path }),
      });
    ctx.views.registerCalendarSource({
      id: 'equipment-planner.calendar',
      title: 'Bookings and maintenance',
      marks: async (from, to) =>
        (await loadEntries(ctx)).flatMap((entry) => {
          const date = text(
            entry.data[entry.type === 'equipment' ? 'nextMaintenance' : 'start'],
          ).slice(0, 10);
          return ['equipment', 'booking'].includes(entry.type) &&
            entry.data['status'] !== 'cancelled' &&
            date >= from &&
            date <= to
            ? [
                {
                  date,
                  title: entry.type === 'equipment' ? `Maintenance: ${entry.title}` : entry.title,
                  path: entry.path,
                  colour: 'orange',
                },
              ]
            : [];
        }),
    });
    ctx.views.registerScheduleSource({
      id: 'equipment-planner.bookings',
      title: 'Equipment bookings',
      items: async () =>
        (await loadEntries(ctx))
          .filter(
            (e) =>
              e.type === 'booking' &&
              e.data['status'] !== 'cancelled' &&
              validDay(text(e.data['start']).slice(0, 10)),
          )
          .map((entry) =>
            scheduleItem(
              'equipment-planner.bookings',
              entry,
              text(entry.data['start']).slice(0, 10),
              text(entry.data['end']).slice(0, 10),
            ),
          ),
      move: async (key, start, end) => {
        const entries = await loadEntries(ctx);
        const entry = entries.find(
          (e) => e.path === key.slice('equipment-planner.bookings:'.length),
        );
        if (!entry) return;
        const data = {
          ...entry.data,
          start: start + text(entry.data['start']).slice(10),
          end: end + text(entry.data['end']).slice(10),
        };
        const error = await validateBooking(ctx, data, entries, entry);
        if (error) throw new Error(error);
        await saveEntry(ctx, entry, { start: data.start, end: data.end });
      },
    });
  },
});
