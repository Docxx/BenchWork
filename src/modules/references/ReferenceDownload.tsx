import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import { filePaper, parsePdfLibrary } from './filePaper';
import { fullReference, type Reference } from './library';

/**
 * A failed download in plain words, without the address. Publishers often
 * refuse downloads that do not come from a signed-in browser.
 */
export function downloadProblem(message: string): string {
  const status = /\(([45]\d\d)[\s)]/.exec(message)?.[1];
  if (status === '401' || status === '403')
    return 'The publisher’s site would not let BenchWork download this PDF. Open the paper in your browser, download the PDF there, then choose it below.';
  if (status === '404')
    return 'There is no PDF at that link. Check the link, or choose a downloaded copy.';
  if (status === '429') return 'The site is busy. Wait a minute and try again.';
  if (status)
    return `The site could not give the PDF (error ${status}). Try again later, or choose a downloaded copy.`;
  return message.replace(/\s*\(?https?:\/\/\S+\)?/g, '').trim();
}

export function referenceFilename(ref: Reference) {
  return [ref.authors[0]?.family, ref.year, ref.title || ref.key].filter(Boolean).join(' - ');
}

let pending = Promise.resolve();
export async function saveReferencePdf(ctx: ModuleContext, ref: Reference, bytes: Uint8Array) {
  const settings = parsePdfLibrary(await ctx.storage.read('reading-library.json'));
  const path = await filePaper(
    ctx,
    settings.folder ?? 'Papers',
    settings.recursive,
    referenceFilename(ref),
    bytes,
  );
  const update = pending.then(async () => {
    const citations = await ctx.storage.read<Record<string, string>>('pdf-citations.json');
    await ctx.storage.write('pdf-citations.json', { ...citations, [path]: ref.key });
    const sources = await ctx.storage.read<Record<string, string>>('paper-references.json');
    await ctx.storage.write('paper-references.json', { ...sources, [path]: fullReference(ref) });
  });
  pending = update.catch(() => undefined);
  await update;
  return path;
}

export function ReferenceDownload({
  ctx,
  reference,
  onSaved,
}: {
  ctx: ModuleContext;
  reference: Reference;
  onSaved?: (path: string) => void;
}) {
  const [url, setUrl] = useState(
    reference.pdfUrl ||
      reference.url ||
      (reference.doi
        ? 'https://doi.org/' + reference.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
        : ''),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  async function collect(file?: File) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (file && file.size > 64 * 1024 * 1024)
        throw new Error('The PDF exceeds the reader’s 64 MB limit.');
      const bytes = file
        ? new Uint8Array(await file.arrayBuffer())
        : await ctx.files.downloadPaper(url.trim());
      const path = await saveReferencePdf(ctx, reference, bytes);
      setSaved(path);
      onSaved?.(path);
    } catch (err) {
      setError(downloadProblem(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }
  if (saved)
    return (
      <p role="status">
        Saved in {saved}{' '}
        <button type="button" onClick={() => void ctx.app.open(saved)}>
          Open PDF
        </button>
      </p>
    );
  return (
    <fieldset className="reference-download" disabled={busy}>
      <legend>{reference.title || reference.key}</legend>
      <label>
        PDF link
        <input
          type="url"
          value={url}
          placeholder="https://…"
          onChange={(e) => {
            setUrl(e.target.value);
          }}
        />
      </label>
      <button type="button" disabled={!url.trim()} onClick={() => void collect()}>
        {busy ? 'Saving…' : 'Save to Reading'}
      </button>
      <label>
        Or choose a PDF from this device
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void collect(file);
          }}
        />
      </label>
      {error && (
        <div role="alert" className="reference-download-problem">
          <p>{error}</p>
          {/^https?:\/\//i.test(url.trim()) && (
            <button type="button" onClick={() => void ctx.web.open(url.trim())}>
              Open in browser
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}
