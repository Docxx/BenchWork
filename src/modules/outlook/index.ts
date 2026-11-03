import { createElement, useState, useSyncExternalStore } from 'react';
import { Mail } from 'lucide-react';
import { defineModule } from '@core/api';
import { OutlookClient, eventTime } from './client';
import { OutlookView } from './OutlookView';
import './outlook.css';

function OutlookWidget({ client }: { client: OutlookClient }) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [now] = useState(() => Date.now());
  const upcoming = state.cache.events
    .filter((e) => !e.isCancelled && eventTime(e.end).getTime() > now)
    .sort((a, b) => eventTime(a.start).getTime() - eventTime(b.start).getTime())
    .slice(0, 4);
  return createElement(
    'div',
    { className: 'outlook-widget' },
    createElement(
      'p',
      { className: 'hint' },
      state.profile
        ? (state.profile.mail ?? state.profile.userPrincipalName)
        : 'Connect your Microsoft 365 account to see your correspondence and calendar.',
    ),
    ...upcoming.map((e) =>
      createElement('span', { key: e.id }, `${eventTime(e.start).toLocaleString()} · ${e.subject}`),
    ),
    createElement(
      'button',
      {
        type: 'button',
        className: 'quiet',
        onClick: () => {
          void client.ctx.app.openView('outlook.view');
        },
      },
      state.profile ? 'Open Outlook' : 'Connect Outlook',
    ),
  );
}
export default defineModule({
  activate(ctx) {
    const client = new OutlookClient(ctx);
    void client.load();
    ctx.onDispose(() => {
      client.dispose();
    });
    ctx.views.registerPageView({
      id: 'outlook.view',
      title: 'Outlook',
      tool: {
        icon: createElement(Mail, { size: 18, 'aria-hidden': true }),
        hint: 'Your Microsoft 365 email and calendar',
      },
      render: () => createElement(OutlookView, { client }),
    });
    ctx.views.registerSettingsPanel({
      id: 'outlook.settings',
      render: () =>
        createElement(
          'div',
          null,
          createElement(
            'p',
            null,
            'Connect your university or work Microsoft 365 account inside the Outlook module. Account tokens and recent offline mail are encrypted on this device, outside your vault.',
          ),
          createElement(
            'button',
            {
              type: 'button',
              onClick: () => {
                void ctx.app.openView('outlook.view');
              },
            },
            'Open Outlook connection',
          ),
        ),
    });
    ctx.views.registerWidget({
      id: 'outlook.overview',
      title: 'Outlook',
      icon: createElement(Mail, { size: 17, 'aria-hidden': true }),
      render: () => createElement(OutlookWidget, { client }),
    });
    ctx.views.registerCalendarSource({
      id: 'outlook.calendar',
      title: 'Outlook',
      marks: (from, to) =>
        Promise.resolve(
          client
            .snapshot()
            .cache.events.filter((e) => !e.isCancelled)
            .flatMap((e) => {
              const date = eventTime(e.start).toLocaleDateString('en-CA');
              return date >= from && date <= to
                ? [
                    {
                      date,
                      title: `${e.isAllDay ? '' : eventTime(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' '}${e.subject} (Outlook)`,
                      colour: 'blue',
                    },
                  ]
                : [];
            }),
        ),
    });
    ctx.commands.register({
      id: 'outlook.open',
      title: 'Open Outlook email and calendar',
      run: () => ctx.app.openView('outlook.view'),
    });
  },
});
