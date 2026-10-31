import DOMPurify from 'dompurify';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Mail as MailIcon,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { OutlookClient, eventTime, message } from './client';
import type { Attachment, Calendar, Composer, Event, Mail, Settings } from './types';

export function safeMailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'img',
      'style',
      'form',
      'input',
      'button',
      'video',
      'audio',
      'picture',
      'source',
      'iframe',
      'object',
      'embed',
      'link',
      'base',
    ],
    FORBID_ATTR: ['style', 'src', 'srcset', 'background', 'id', 'class', 'name'],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  });
}
export function plainMail(mail: Mail): string {
  if (!mail.body) return mail.bodyPreview;
  if (mail.body.contentType.toLowerCase() === 'text') return mail.body.content;
  const html = safeMailHtml(mail.body.content)
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '$&\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const link of doc.querySelectorAll('a[href]'))
    link.append(` (${link.getAttribute('href') ?? ''})`);
  return doc.body.textContent;
}

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
function Connection({ client }: { client: OutlookClient }) {
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
const initialComposer = (): Composer => ({
  mode: 'new',
  to: '',
  cc: '',
  subject: '',
  text: '',
  attachments: [],
});
function Mailbox({ client }: { client: OutlookClient }) {
  const state = useSyncExternalStore(client.subscribe, client.snapshot);
  const [folder, setFolder] = useState('inbox');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Mail[]>(state.cache.messages);
  const [selected, setSelected] = useState<Mail | null>(null);
  const [next, setNext] = useState<string | undefined>();
  const [folderNext, setFolderNext] = useState<string | undefined>();
  const composer = state.composer;
  const setComposer = (value: Composer | null) => {
    client.setComposer(value);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  const readSequence = useRef(0);
  const request = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let live = true;
    void client
      .folders()
      .then((value) => {
        if (live) setFolderNext(value['@odata.nextLink']);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [client]);
  useEffect(() => {
    let live = true;
    const id = ++sequence.current;
    void client
      .mail(folder, search)
      .then((value) => {
        if (live && sequence.current === id) {
          setList(value.value);
          setNext(value['@odata.nextLink']);
          setOffline(false);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (live) {
          const q = search.toLowerCase();
          setList(
            client
              .snapshot()
              .cache.messages.filter(
                (m) =>
                  !q ||
                  `${m.subject} ${m.bodyPreview} ${m.from?.emailAddress.address ?? ''}`
                    .toLowerCase()
                    .includes(q),
              ),
          );
          setNext(undefined);
          setOffline(true);
          setError(message(e));
        }
      });
    return () => {
      live = false;
    };
  }, [client, folder, search, refresh]);
  async function open(mail: Mail) {
    const id = ++readSequence.current;
    const listing = sequence.current;
    setSelected(client.snapshot().cache.bodies[mail.id] ?? mail);
    setError('');
    try {
      const value = await client.read(mail.id);
      if (id === readSequence.current && listing === sequence.current) setSelected(value);
    } catch (e) {
      if (id === readSequence.current && listing === sequence.current) setError(message(e));
    }
  }
  function reply(mode: 'reply' | 'replyAll' | 'forward') {
    if (!selected) return;
    const own = (state.profile?.mail ?? state.profile?.userPrincipalName ?? '').toLowerCase();
    const source = selected.from?.emailAddress.address ?? '';
    const replyTo = selected.replyTo?.length
      ? selected.replyTo.map((a) => a.emailAddress.address)
      : [source];
    const recipients =
      mode === 'forward'
        ? []
        : [
            ...replyTo,
            ...(mode === 'replyAll'
              ? (selected.toRecipients ?? []).map((a) => a.emailAddress.address)
              : []),
          ].filter((a) => a && a.toLowerCase() !== own);
    const text =
      mode === 'forward'
        ? `\n\n---------- Forwarded message ----------\nFrom: ${source}\nSubject: ${selected.subject}\n\n${plainMail(selected)}`
        : '';
    setComposer({
      ...initialComposer(),
      mode,
      sourceId: selected.id,
      to: [...new Set(recipients)].join('; '),
      cc:
        mode === 'replyAll'
          ? (selected.ccRecipients ?? [])
              .map((a) => a.emailAddress.address)
              .filter((a) => a.toLowerCase() !== own && !recipients.includes(a))
              .join('; ')
          : '',
      subject: `${mode === 'forward' ? 'FW' : 'RE'}: ${selected.subject.replace(/^(RE|FW):\s*/i, '')}`,
      text,
    });
  }
  async function remove(action: () => Promise<void>) {
    await action();
    if (selected) setList((items) => items.filter((m) => m.id !== selected.id));
    setSelected(null);
  }
  return (
    <>
      <div className="outlook-mail-actions">
        <button
          type="button"
          onClick={() => {
            setComposer(initialComposer());
          }}
        >
          <Plus size={16} aria-hidden />
          New email
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <input
            aria-label="Search Outlook mail"
            placeholder="Search this folder…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <button type="submit" className="quiet">
            Search
          </button>
        </form>
        <button
          type="button"
          className="quiet"
          disabled={busy}
          aria-label="Refresh Outlook mail"
          onClick={() => {
            setRefresh((n) => n + 1);
          }}
        >
          <RefreshCw size={17} aria-hidden />
        </button>
      </div>
      {offline && (
        <p className="notice" role="status">
          Showing recent cached emails from all folders on this device
          {state.cache.savedAt
            ? `, saved ${new Date(state.cache.savedAt).toLocaleString('en-GB')}`
            : ''}
          . Older emails and uncached bodies need a connection.
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className={`outlook-mail-layout${selected ? ' has-selection' : ''}`}>
        <nav className="outlook-folders" aria-label="Mail folders">
          <label>
            Folder
            <select
              value={folder}
              onChange={(e) => {
                setFolder(e.target.value);
                setSelected(null);
              }}
            >
              <option value="inbox">Inbox</option>
              <option value="all">All mail</option>
              <option value="sentitems">Sent</option>
              <option value="drafts">Drafts</option>
              <option value="archive">Archive</option>
              <option value="deleteditems">Deleted items</option>
              {state.cache.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.displayName}
                  {f.unreadItemCount ? ` (${String(f.unreadItemCount)})` : ''}
                </option>
              ))}
            </select>
          </label>
          {state.cache.folders
            .filter((f) => f.childFolderCount > 0)
            .map((f) => (
              <button
                type="button"
                className="quiet"
                key={f.id}
                disabled={busy}
                onClick={() =>
                  void request(async () => {
                    const value = await client.folders(f.id);
                    setFolderNext(value['@odata.nextLink']);
                  })
                }
              >
                Show subfolders of {f.displayName}
              </button>
            ))}
          {folderNext && (
            <button
              type="button"
              className="quiet"
              onClick={() =>
                void request(async () => {
                  const value = await client.folders(undefined, folderNext);
                  setFolderNext(value['@odata.nextLink']);
                })
              }
            >
              More folders
            </button>
          )}
          <small>{offline ? 'Device cache' : 'Microsoft 365'}</small>
        </nav>
        <section className="outlook-message-list" aria-label="Emails">
          {list.length === 0 && <p className="hint">No emails to show.</p>}
          {list.map((mail) => (
            <button
              type="button"
              key={mail.id}
              className={`outlook-mail-row${mail.isRead ? '' : ' unread'}`}
              aria-pressed={selected?.id === mail.id}
              onClick={() => void open(mail)}
            >
              <span className="outlook-mail-from">
                {mail.from?.emailAddress.name ?? mail.from?.emailAddress.address ?? 'No sender'}
                <time>
                  {mail.receivedDateTime
                    ? new Date(mail.receivedDateTime).toLocaleDateString('en-GB')
                    : ''}
                </time>
              </span>
              <strong>{mail.subject || '(No subject)'}</strong>
              <span className="outlook-mail-preview">{mail.bodyPreview}</span>
              <small>
                {mail.isDraft ? 'Draft · ' : ''}
                {mail.hasAttachments ? 'Attachments · ' : ''}
                {mail.flag?.flagStatus === 'flagged' ? 'Flagged' : ''}
              </small>
            </button>
          ))}
          {next && (
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() =>
                void request(async () => {
                  const value = await client.mail(folder, search, next);
                  setList((items) => [
                    ...new Map([...items, ...value.value].map((m) => [m.id, m])).values(),
                  ]);
                  setNext(value['@odata.nextLink']);
                })
              }
            >
              Load older emails
            </button>
          )}
        </section>
        <section className="outlook-reader" aria-label="Email reader">
          {selected ? (
            <>
              <button
                type="button"
                className="quiet outlook-back"
                onClick={() => {
                  readSequence.current++;
                  setSelected(null);
                }}
              >
                <ChevronLeft size={16} aria-hidden />
                Back to emails
              </button>
              <h2>{selected.subject || '(No subject)'}</h2>
              <p className="outlook-sender">
                {selected.from?.emailAddress.name} &lt;{selected.from?.emailAddress.address}&gt;
              </p>
              <p className="hint">
                To: {(selected.toRecipients ?? []).map((r) => r.emailAddress.address).join('; ')}
                <br />
                {selected.receivedDateTime
                  ? new Date(selected.receivedDateTime).toLocaleString('en-GB')
                  : ''}
              </p>
              <div className="outlook-reader-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    reply('reply');
                  }}
                >
                  Reply
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    reply('replyAll');
                  }}
                >
                  Reply all
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy || !selected.body}
                  onClick={() => {
                    reply('forward');
                  }}
                >
                  Forward
                </button>
                {selected.isDraft && (
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy || !selected.body}
                    onClick={() => {
                      setComposer({
                        ...initialComposer(),
                        id: selected.id,
                        mode: 'draft',
                        to: (selected.toRecipients ?? [])
                          .map((a) => a.emailAddress.address)
                          .join('; '),
                        cc: (selected.ccRecipients ?? [])
                          .map((a) => a.emailAddress.address)
                          .join('; '),
                        bcc: (selected.bccRecipients ?? [])
                          .map((a) => a.emailAddress.address)
                          .join('; '),
                        subject: selected.subject,
                        text: plainMail(selected),
                      });
                    }}
                  >
                    Edit draft
                  </button>
                )}
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void request(async () => {
                      await client.organise(selected.id, { isRead: !selected.isRead });
                      const changed = { ...selected, isRead: !selected.isRead };
                      setSelected(changed);
                      setList((items) => items.map((m) => (m.id === changed.id ? changed : m)));
                    })
                  }
                >
                  {selected.isRead ? 'Mark unread' : 'Mark read'}
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void request(async () => {
                      const flag = {
                        flagStatus:
                          selected.flag?.flagStatus === 'flagged' ? 'notFlagged' : 'flagged',
                      };
                      await client.organise(selected.id, { flag });
                      setSelected({ ...selected, flag });
                    })
                  }
                >
                  {selected.flag?.flagStatus === 'flagged' ? 'Unflag' : 'Flag'}
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void request(() => remove(() => client.move(selected.id, 'archive')))
                  }
                >
                  Archive
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Move this email to Deleted items?'))
                      void request(() => remove(() => client.move(selected.id, 'deleteditems')));
                  }}
                >
                  Delete
                </button>
                <select
                  aria-label="Move email to folder"
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    const destination = e.target.value;
                    if (destination)
                      void request(() => remove(() => client.move(selected.id, destination)));
                  }}
                >
                  <option value="">Move to…</option>
                  {state.cache.folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.displayName}
                    </option>
                  ))}
                </select>
                {selected.webLink && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => void client.ctx.web.open(selected.webLink ?? '')}
                  >
                    Open in Outlook
                  </button>
                )}
              </div>
              <p className="hint">External images and active content are blocked.</p>
              {selected.body ? (
                selected.body.contentType.toLowerCase() === 'html' ? (
                  <div
                    className="outlook-email-body"
                    onClick={(e) => {
                      const anchor = (e.target as Element).closest('a');
                      if (anchor) {
                        e.preventDefault();
                        const href = anchor.getAttribute('href');
                        if (href && /^https?:\/\//i.test(href)) void client.ctx.web.open(href);
                      }
                    }}
                    dangerouslySetInnerHTML={{ __html: safeMailHtml(selected.body.content) }}
                  />
                ) : (
                  <div className="outlook-email-text">{selected.body.content}</div>
                )
              ) : (
                <p>
                  {selected.bodyPreview}
                  <br />
                  <small>The full message body has not been downloaded.</small>
                </p>
              )}
              <Attachments key={selected.id} client={client} mail={selected} />
            </>
          ) : (
            <div className="outlook-reader-empty">
              <MailIcon size={36} aria-hidden />
              <h2>Room for your correspondence</h2>
              <p>Select an email to read it beside your research.</p>
            </div>
          )}
        </section>
      </div>
      {composer && (
        <Compose
          client={client}
          value={composer}
          onClose={() => {
            setComposer(null);
          }}
          onSent={() => {
            setComposer(null);
            setNotice('Microsoft accepted your email for sending.');
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
function Attachments({ client, mail }: { client: OutlookClient; mail: Mail }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!mail.hasAttachments) return null;
  return (
    <section className="outlook-attachments" aria-label="Email attachments">
      <h3>Attachments</h3>
      <button
        type="button"
        className="quiet"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void client
            .attachments(mail.id)
            .then(setFiles)
            .catch((e: unknown) => {
              setError(message(e));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        Load attachment list
      </button>
      {files.map((file, i) => (
        <button
          type="button"
          key={file.id ?? i}
          className="quiet"
          disabled={busy}
          onClick={() => {
            if (!file.id) return;
            setBusy(true);
            void client
              .attachment(mail.id, file.id)
              .then((value) => {
                if (!value.contentBytes)
                  throw new Error('This attachment needs Outlook to download it.');
                const bytes = Uint8Array.from(atob(value.contentBytes), (c) => c.charCodeAt(0));
                return client.ctx.app
                  .askText({
                    title: 'Save attachment to vault',
                    label: 'File name (saved in Outlook attachments)',
                    initial: value.name.replace(/[\\/:*?"<>|]/g, '_'),
                  })
                  .then(async (name) => {
                    if (!name) return;
                    const folder = 'Outlook attachments';
                    await client.ctx.vault.ensureDir(folder);
                    const safe = name
                      .replace(/[\\/:*?"<>|]/g, '_')
                      .replace(/^\.+/, '')
                      .trim();
                    if (!safe) throw new Error('Enter a file name.');
                    const dot = safe.lastIndexOf('.');
                    const filename = await client.ctx.vault.freeName(
                      folder,
                      dot > 0 ? safe.slice(0, dot) : safe,
                      dot > 0 ? safe.slice(dot) : '',
                    );
                    const path = `${folder}/${filename}`;
                    await client.ctx.vault.createNew(path, '');
                    await client.ctx.vault.writeBytes(path, bytes);
                    client.ctx.app.notify(`Attachment saved to ${path}`);
                  });
              })
              .catch((e: unknown) => {
                setError(message(e));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          Save {file.name} to vault{' '}
          {file.size ? `(${Math.ceil(file.size / 1024).toLocaleString('en-GB')} KB)` : ''}
        </button>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function Compose({
  client,
  value,
  onClose,
  onSent,
}: {
  client: OutlookClient;
  value: Composer;
  onClose: () => void;
  onSent: () => void;
}) {
  const [composer, setComposer] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (change: Partial<Composer>) => {
    const updated = { ...composer, ...change };
    setComposer(updated);
    client.setComposer(updated);
    setSaved(false);
    setConfirm(false);
  };
  async function save(send: boolean) {
    setBusy(true);
    setError('');
    const working = { ...composer, attachments: composer.attachments.map((a) => ({ ...a })) };
    try {
      if (send) {
        await client.send(working);
        onSent();
      } else {
        await client.saveDraft(working);
        client.setComposer(working);
        setSaved(true);
      }
    } catch (e) {
      client.setComposer(working);
      setError(message(e));
    } finally {
      setComposer(working);
      if (!send) client.setComposer(working);
      setBusy(false);
      setConfirm(false);
    }
  }
  return (
    <div className="outlook-dialog-backdrop">
      <section
        className="outlook-compose"
        role="dialog"
        aria-modal="true"
        aria-label="Compose email"
      >
        <h2>
          {composer.mode === 'new'
            ? 'New email'
            : composer.mode === 'draft'
              ? 'Edit draft'
              : composer.mode === 'forward'
                ? 'Forward email'
                : 'Reply to email'}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm(true);
          }}
        >
          <label>
            To
            <input
              value={composer.to}
              disabled={busy}
              onChange={(e) => {
                set({ to: e.target.value });
              }}
              placeholder="name@university.ac.uk; colleague@university.ac.uk"
            />
          </label>
          <label>
            Cc
            <input
              value={composer.cc}
              disabled={busy}
              onChange={(e) => {
                set({ cc: e.target.value });
              }}
            />
          </label>
          <label>
            Bcc
            <input
              value={composer.bcc ?? ''}
              disabled={busy}
              onChange={(e) => {
                set({ bcc: e.target.value });
              }}
            />
          </label>
          <label>
            Subject
            <input
              value={composer.subject}
              disabled={busy}
              onChange={(e) => {
                set({ subject: e.target.value });
              }}
            />
          </label>
          <label>
            Message
            <textarea
              maxLength={200000}
              rows={12}
              value={composer.text}
              disabled={busy}
              onChange={(e) => {
                set({ text: e.target.value });
              }}
            />
          </label>
          <label>
            Attach files (under 3 MB each)
            <input
              type="file"
              multiple
              disabled={busy}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                void Promise.all(
                  files.map(async (file): Promise<Attachment> => {
                    if (file.size >= 3 * 1024 * 1024)
                      throw new Error(
                        `${file.name} is too large. Use Outlook for attachments of 3 MB or more.`,
                      );
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    let binary = '';
                    for (const byte of bytes) binary += String.fromCharCode(byte);
                    return {
                      name: file.name,
                      contentType: file.type || 'application/octet-stream',
                      contentBytes: btoa(binary),
                      size: file.size,
                    };
                  }),
                )
                  .then((attachments) => {
                    if (
                      [...composer.attachments, ...attachments].reduce(
                        (sum, a) => sum + (a.size ?? 0),
                        0,
                      ) >=
                      5 * 1024 * 1024
                    )
                      throw new Error(
                        'Keep combined attachments below 5 MB, or send from Outlook.',
                      );
                    set({ attachments: [...composer.attachments, ...attachments] });
                  })
                  .catch((e: unknown) => {
                    setError(message(e));
                  });
                e.target.value = '';
              }}
            />
          </label>
          <ul>
            {composer.attachments.map((a, i) => (
              <li key={i}>
                {a.name}
                {!a.id && (
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() => {
                      set({ attachments: composer.attachments.filter((_, index) => index !== i) });
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          {saved && <p role="status">Draft saved in Outlook.</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>
              Review send
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Save draft
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => {
                if (
                  saved ||
                  window.confirm(
                    'Close this editor? Changes not saved as an Outlook draft will be lost.',
                  )
                )
                  onClose();
              }}
            >
              Close editor
            </button>
          </div>
          {confirm && (
            <div className="outlook-send-review" role="alertdialog" aria-label="Confirm email send">
              <p>
                Send <strong>{composer.subject || '(No subject)'}</strong> to{' '}
                <strong>{composer.to}</strong>
                {composer.cc ? `, cc ${composer.cc}` : ''}
                {composer.bcc ? `, bcc ${composer.bcc}` : ''}?
              </p>
              <button type="button" disabled={busy} onClick={() => void save(true)}>
                {busy ? 'Sending…' : 'Send email'}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => {
                  setConfirm(false);
                }}
              >
                Keep editing
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

function CalendarView({ client }: { client: OutlookClient }) {
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
function localDate(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function localInput(date: Date): string {
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function EventEditor({
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
