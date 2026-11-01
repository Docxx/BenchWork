import { useState } from 'react';
import { message, type OutlookClient } from './client';
import type { Attachment, Composer } from './types';

export function Compose({
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
