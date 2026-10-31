import { createElement } from 'react';
import { Users } from 'lucide-react';
import { defineModule } from '@core/api';
import { loadEntries, text } from '../research/api';
import { MeetingsView } from './MeetingsView';
export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: 'meeting-organiser.view',
      title: 'Meeting Organiser',
      render: (initial) => createElement(MeetingsView, { ctx, initial }),
      tool: {
        icon: createElement(Users, { size: 18, 'aria-hidden': true }),
        hint: 'Agendas, decisions and follow-ups linked to research',
      },
    });
    ctx.files.register({
      id: 'meeting-organiser.meeting',
      extensions: ['.meeting.yaml'],
      name: 'Meeting',
      watchesFile: true,
      render: ({ path }) => createElement(MeetingsView, { ctx, initial: path }),
    });
    ctx.views.registerCalendarSource({
      id: 'meeting-organiser.calendar',
      title: 'Research meetings',
      marks: async (from, to) =>
        (await loadEntries(ctx))
          .filter(
            (entry) =>
              entry.type === 'meeting' &&
              text(entry.data['date']) >= from &&
              text(entry.data['date']) <= to,
          )
          .map((entry) => ({
            date: text(entry.data['date']),
            title: entry.title,
            path: entry.path,
            colour: 'purple',
          })),
    });
  },
});
