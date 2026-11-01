import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, Mail as MailIcon, Plus, RefreshCw } from 'lucide-react';
import { message, type OutlookClient } from './client';
import type { Composer, Mail } from './types';
import { plainMail, safeMailHtml } from './rendering';
import { Attachments } from './Attachments';
import { Compose } from './Compose';

const initialComposer = (): Composer => ({
  mode: 'new',
  to: '',
  cc: '',
  subject: '',
  text: '',
  attachments: [],
});
export function Mailbox({ client }: { client: OutlookClient }) {
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
