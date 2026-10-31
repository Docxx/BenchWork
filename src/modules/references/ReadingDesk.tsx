import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import type { LibraryState } from './state';
import { EVIDENCE, parseCapture, saveEvidence } from './evidence';
import './reading.css';

export function ReadingDesk({
  ctx,
  library,
  param,
}: {
  ctx: ModuleContext;
  library: LibraryState;
  param: string | null;
}) {
  const capture = useMemo(() => parseCapture(param), [param]);
  const snapshot = useSyncExternalStore(library.subscribe, library.current);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [title, setTitle] = useState(
    capture
      ? `${
          capture.path
            .split('/')
            .at(-1)
            ?.replace(/\.pdf$/i, '') ?? 'Evidence'
        } · p. ${String(capture.page)}`
      : '',
  );
  const [comment, setComment] = useState('');
  const [citekey, setCitekey] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void ctx.app
      .items()
      .then(setItems)
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, [ctx]);
  useEffect(() => {
    if (!capture) return;
    void ctx.storage
      .read<Record<string, string>>('pdf-citations.json')
      .then((saved) => {
        setCitekey(saved?.[capture.path] ?? '');
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, [ctx, capture]);
  const save = async () => {
    if (!capture || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = (await ctx.storage.read<Record<string, string>>('pdf-citations.json')) ?? {};
      await ctx.storage.write('pdf-citations.json', { ...saved, [capture.path]: citekey });
      await saveEvidence(ctx, capture, title, comment, citekey, links);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reading-desk">
      <p className="hint">
        Read a PDF, select a passage and choose an evidence action. Evidence notes keep the excerpt,
        source page, citation and your own observations together.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {capture && (
        <section className="reading-capture" aria-label="Capture evidence">
          <h2>
            {capture.mode === 'structured'
              ? 'Structured paper note'
              : capture.mode === 'linked'
                ? 'Link evidence to research'
                : 'Excerpt and comment'}
          </h2>
          <p>
            {capture.path} · Page {capture.page}
          </p>
          <blockquote>{capture.text}</blockquote>
          <label className="label">
            Evidence title
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </label>
          <label className="label">
            Citation
            <select
              aria-label="Citation"
              value={citekey}
              onChange={(e) => {
                setCitekey(e.target.value);
              }}
            >
              <option value="">No citation selected</option>
              {[...snapshot.refs].map(([key, ref]) => (
                <option key={key} value={key}>
                  {ref.title} [@{key}]
                </option>
              ))}
            </select>
          </label>
          {snapshot.status !== 'ready' && (
            <p className="hint">
              Choose your Zotero Better BibTeX CSL JSON library in References settings to add
              citations. You can still save evidence.
            </p>
          )}
          <label className="label">
            Your observations
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
              }}
            />
          </label>
          <fieldset>
            <legend>Link to questions, experiments or writing</legend>
            <select
              aria-label="Research links"
              multiple
              value={links}
              onChange={(e) => {
                setLinks([...e.target.selectedOptions].map((o) => o.value));
              }}
            >
              {items
                .filter((i) =>
                  [
                    'research-question',
                    'question',
                    'experiment',
                    'manuscript',
                    'writing-section',
                  ].includes(i.type),
                )
                .map((i) => (
                  <option key={i.path} value={i.path}>
                    {i.title}
                  </option>
                ))}
            </select>
            <p className="hint">Optional. Use Ctrl or Command to select several on a computer.</p>
          </fieldset>
          <button type="button" disabled={busy || !title.trim()} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save evidence note'}
          </button>
        </section>
      )}
      <div className="reading-columns">
        <section aria-label="Evidence notes">
          <h2>Evidence notes</h2>
          {items.filter((i) => i.type === EVIDENCE).length === 0 && (
            <p className="hint">Your saved excerpts will appear here.</p>
          )}
          {items
            .filter((i) => i.type === EVIDENCE)
            .map((i) => (
              <button
                className="reading-item quiet"
                key={i.path}
                type="button"
                onClick={() => void ctx.app.open(i.path)}
              >
                {i.title}
                <small>{i.path}</small>
              </button>
            ))}
        </section>
        <section aria-label="PDF library">
          <h2>PDF library</h2>
          <p className="hint">
            Enable Handwriting for PDF text selection, highlighting and evidence capture.
          </p>
          <PdfList ctx={ctx} />
        </section>
      </div>
    </div>
  );
}

function PdfList({ ctx }: { ctx: ModuleContext }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const walk = async (folder: string): Promise<string[]> => {
      const entries = await ctx.vault.listDir(folder);
      const lists = await Promise.all(
        entries
          .filter((e) => !e.name.startsWith('.'))
          .map((e) => {
            const path = folder ? `${folder}/${e.name}` : e.name;
            return e.isDir ? walk(path) : Promise.resolve(/\.pdf$/i.test(e.name) ? [path] : []);
          }),
      );
      return lists.flat();
    };
    void walk('')
      .then((all) => {
        if (live) setPaths(all);
      })
      .catch((err: unknown) => {
        if (live) setError(String(err));
      });
    return () => {
      live = false;
    };
  }, [ctx]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {paths.length === 0 && <p className="hint">Add PDFs to your vault to start reading.</p>}
      {paths.map((path) => (
        <button
          type="button"
          className="reading-item quiet"
          key={path}
          onClick={() => void ctx.app.open(path)}
        >
          {path.split('/').at(-1)}
          <small>{path}</small>
        </button>
      ))}
    </>
  );
}
