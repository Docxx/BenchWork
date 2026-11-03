import { useState } from 'react';
import { message, type OutlookClient } from './client';
import type { Attachment, Mail } from './types';

export function Attachments({ client, mail }: { client: OutlookClient; mail: Mail }) {
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
