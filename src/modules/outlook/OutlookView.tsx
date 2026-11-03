import { useState, useSyncExternalStore } from 'react';
import { CalendarDays, Mail as MailIcon, Settings2 } from 'lucide-react';
import type { OutlookClient } from './client';
import { Connection } from './Connection';
import { Mailbox } from './Mailbox';
import { CalendarView } from './CalendarView';

export function OutlookView({ client }: { client: OutlookClient }) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [tab, setTab] = useState<'mail' | 'calendar'>('mail');
  const [settings, setSettings] = useState(false);
  if (!state.ready) return <p className="hint">Unlocking this device’s Outlook connection…</p>;
  return (
    <div className="outlook">
      <div className="outlook-top">
        <div className="outlook-brand">
          <span className="outlook-badge">
            <MailIcon size={22} aria-hidden />
          </span>
          <div>
            <strong>Outlook</strong>
            <small>
              {state.profile?.mail ??
                state.profile?.userPrincipalName ??
                'Your mail and calendar, beside your research'}
            </small>
          </div>
        </div>
        {state.profile && (
          <nav aria-label="Outlook views">
            <button
              type="button"
              className="quiet"
              aria-pressed={tab === 'mail'}
              onClick={() => {
                setTab('mail');
              }}
            >
              <MailIcon size={16} aria-hidden />
              Mail
            </button>
            <button
              type="button"
              className="quiet"
              aria-pressed={tab === 'calendar'}
              onClick={() => {
                setTab('calendar');
              }}
            >
              <CalendarDays size={16} aria-hidden />
              Calendar
            </button>
          </nav>
        )}
        <button
          type="button"
          className="quiet"
          aria-label="Outlook settings"
          aria-expanded={settings}
          onClick={() => {
            setSettings((v) => !v);
          }}
        >
          <Settings2 size={17} aria-hidden />
        </button>
      </div>
      {state.cacheWarning && (
        <p className="notice" role="status">
          {state.cacheWarning}
        </p>
      )}
      {(!state.profile || settings) && <Connection client={client} />}
      {state.profile &&
        !settings &&
        (tab === 'mail' ? <Mailbox client={client} /> : <CalendarView client={client} />)}
    </div>
  );
}
