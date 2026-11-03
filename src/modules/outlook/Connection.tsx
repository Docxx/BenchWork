import { useState, useSyncExternalStore } from 'react';
import { message, type OutlookClient } from './client';
import type { Settings } from './types';

export function Connection({ client }: { client: OutlookClient }) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [settings, setSettings] = useState<Settings>(state.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="outlook-connect" aria-label="Outlook connection">
      <h2>
        {state.profile ? 'Account and offline storage' : 'Connect your university or work account'}
      </h2>
      <p>
        Sign in with Microsoft to read, organise and send email, and manage your calendars.
        BenchWork never asks for your password.
      </p>
      {!state.profile && (
        <details open={!settings.clientId}>
          <summary>One-time Microsoft app setup</summary>
          <ol>
            <li>
              Register BenchWork in your organisation’s Microsoft Entra portal as a public client
              application.
            </li>
            <li>
              Enable public client flows. Add delegated permissions: User.Read, Mail.ReadWrite,
              Mail.Send and Calendars.ReadWrite.
            </li>
            <li>
              Copy its Application (client) ID below. Your university may need to approve access.
            </li>
          </ol>
          <p>No client secret is needed. Sign in separately on the PC and tablet.</p>
          <button
            type="button"
            className="quiet"
            onClick={() =>
              void client.ctx.web.open(
                'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
              )
            }
          >
            Open Microsoft app registrations
          </button>
        </details>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await client.configure(settings);
            if (!state.profile) await client.connect();
          });
        }}
      >
        <label>
          Application (client) ID
          <input
            value={settings.clientId}
            disabled={busy || !!state.profile || !!state.challenge}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onChange={(e) => {
              setSettings((s) => ({ ...s, clientId: e.target.value }));
            }}
          />
        </label>
        <label>
          Directory (tenant) ID
          <input
            value={settings.tenant}
            disabled={busy || !!state.profile || !!state.challenge}
            onChange={(e) => {
              setSettings((s) => ({ ...s, tenant: e.target.value.trim() }));
            }}
          />
          <small>Use your organisation’s ID, or organizations.</small>
        </label>
        <label className="outlook-check">
          <input
            type="checkbox"
            checked={settings.cache}
            onChange={(e) => {
              setSettings((s) => ({ ...s, cache: e.target.checked }));
            }}
          />
          Keep recent emails and calendar on this device
        </label>
        <p className="hint">
          Encrypted on this device, outside your vault. Up to 200 recent email summaries, 10 opened
          message bodies and recently viewed calendar events. Attachments are downloaded only when
          you choose them.
        </p>
        <div className="actions">
          <button type="submit" disabled={busy || !!state.challenge}>
            {busy
              ? 'Connecting…'
              : state.profile
                ? 'Save connection settings'
                : 'Connect Microsoft 365'}
          </button>
          {state.profile && (
            <>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => void act(() => client.clearCache())}
              >
                Clear offline cache
              </button>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Disconnect this account and remove its sign-in and cached emails from this device? Your Microsoft mailbox stays unchanged.',
                    )
                  )
                    void act(() => client.disconnect());
                }}
              >
                Disconnect account
              </button>
            </>
          )}
        </div>
      </form>
      {state.challenge && (
        <div className="outlook-code" role="status">
          <p>Open Microsoft’s sign-in page and enter this code:</p>
          <strong>{state.challenge.user_code}</strong>
          <div className="actions">
            <button
              type="button"
              onClick={() => void client.ctx.web.open('https://microsoft.com/devicelogin')}
            >
              Sign in with Microsoft
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                client.cancelSignIn();
              }}
            >
              Cancel sign-in
            </button>
          </div>
          <p>BenchWork will connect when Microsoft confirms your sign-in.</p>
        </div>
      )}
      {(error || state.error) && (
        <p className="notice" role="alert">
          {error || state.error}
        </p>
      )}
    </section>
  );
}
