import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import type { LibraryState } from './state';
import { parseCapture, saveEvidence } from './evidence';
import { WritingWorkspace } from '../manuscript/WritingWorkspace';
import { EvidenceShelf, FigureImage } from './EvidenceShelf';
import { PdfLibrary } from './PdfLibrary';
import './reading.css';

export function ReadingDesk({
  ctx,
  library,
  param,
  writing,
}: {
  ctx: ModuleContext;
  library: LibraryState;
  param: string | null;
  writing?: string;
}) {
  const [tab, setTab] = useState(writing !== undefined ? 'Writing' : 'Reading');
  const [reference, setReference] = useState('');
  const [subjects, setSubjects] = useState('');
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
        } Â· p. ${String(capture.page)}`
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
      .read<Record<string, string>>('paper-references.json')
      .then((saved) => {
        setReference(saved?.[capture.path] ?? '');
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
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
      const references =
        (await ctx.storage.read<Record<string, string>>('paper-references.json')) ?? {};
      await ctx.storage.write('paper-references.json', {
        ...references,
        [capture.path]: reference.trim(),
      });
      await saveEvidence(
        ctx,
        capture,
        title,
        comment,
        citekey,
        links,
        [
          ...new Set(
            subjects
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ],
        reference,
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reading-desk">
      <nav className="actions" aria-label="Reading and writing">
        {['Reading', 'Evidence', 'Writing'].map((name) => (
          <button
            type="button"
            key={name}
            aria-pressed={tab === name}
            onClick={() => {
              setTab(name);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {capture && tab === 'Reading' && (
        <section className="reading-capture" aria-label="Capture evidence">
          <h2>
            {capture.mode === 'structured'
              ? 'Structured paper note'
              : capture.mode === 'linked'
                ? 'Link evidence to research'
                : 'Excerpt and comment'}
          </h2>
          <p>
            {capture.path} Â· Page {capture.page}
          </p>
          {capture.figure && <FigureImage ctx={ctx} path={capture.figure} />}
          <label className="label">
            Subjects (comma-separated)
            <input
              placeholder="Alzheimer’s, inflammation"
              value={subjects}
              onChange={(e) => {
                setSubjects(e.target.value);
              }}
            />
          </label>
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
          <label className="label">
            Paper reference (optional)
            <input
              value={reference}
              placeholder="Authors, title, year or DOI"
              onChange={(e) => {
                setReference(e.target.value);
              }}
            />
          </label>
          {snapshot.status !== 'ready' && (
            <p className="hint">
              Choose your Zotero Better BibTeX CSL JSON library in Reading and writing settings to
              add citations. You can still save evidence.
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
            {busy ? 'Savingâ€¦' : 'Save evidence note'}
          </button>
        </section>
      )}
      {tab === 'Reading' && (
        <section aria-label="PDF library">
          <h2>PDF library</h2>
          <PdfLibrary ctx={ctx} />
        </section>
      )}
      {tab === 'Evidence' && <EvidenceShelf ctx={ctx} library={library} />}
      {tab === 'Writing' && <WritingWorkspace ctx={ctx} path={writing || null} combined />}
    </div>
  );
}
