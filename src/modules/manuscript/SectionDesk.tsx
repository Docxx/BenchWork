import { useEffect, useState } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import { linkedPaths, saveSectionLinks, STATUSES } from './workspace';

const propertyText = (value: unknown, fallback = '') =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;

export function SectionDesk({
  ctx,
  path,
  items,
}: {
  ctx: ModuleContext;
  path: string;
  items: VaultItem[];
}) {
  const [aim, setAim] = useState('');
  const [status, setStatus] = useState('planned');
  const [wordTarget, setWordTarget] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [analyses, setAnalyses] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    text: string;
    source: string;
    page: string;
    citekey: string;
  } | null>(null);
  useEffect(() => {
    void ctx.app
      .pageProperties(path)
      .then((props) => {
        if (!props) throw new Error('This section could not be read.');
        setAim(propertyText(props['aim'], ''));
        setStatus(propertyText(props['status'], 'planned'));
        setWordTarget(propertyText(props['wordTarget'], ''));
        setEvidence(linkedPaths(props['evidence']));
        setAnalyses(linkedPaths(props['analyses']));
        setLoaded(true);
      })
      .catch((err: unknown) => {
        setMessage(String(err));
      });
  }, [ctx, path]);
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveSectionLinks(ctx, path, { aim, status, wordTarget, evidence, analyses });
      setMessage('Section plan saved.');
      return true;
    } catch (err) {
      setMessage(String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const choose = (
    label: string,
    type: string,
    values: string[],
    set: (value: string[]) => void,
  ) => (
    <fieldset>
      <legend>{label}</legend>
      <div className="writing-choices">
        {items
          .filter((i) => i.type === type)
          .map((i) => (
            <label key={i.path}>
              <input
                type="checkbox"
                checked={values.includes(i.path)}
                onChange={(e) => {
                  set(e.target.checked ? [...values, i.path] : values.filter((p) => p !== i.path));
                }}
              />
              {i.title}
            </label>
          ))}
      </div>
      {items.every((i) => i.type !== type) && <p className="hint">No {label.toLowerCase()} yet.</p>}
    </fieldset>
  );
  return (
    <section className="writing-section-desk" aria-label="Section plan">
      <h2>{path.split('/').at(-1)?.replace(/\.md$/, '')}</h2>
      {message && <p role="status">{message}</p>}
      <label className="label">
        Section aim
        <textarea
          value={aim}
          onChange={(e) => {
            setAim(e.target.value);
          }}
        />
      </label>
      <div className="writing-new">
        <label className="label">
          Section status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Word target
          <input
            inputMode="numeric"
            value={wordTarget}
            onChange={(e) => {
              setWordTarget(e.target.value);
            }}
          />
        </label>
      </div>
      {choose('Evidence notes', 'evidence', evidence, setEvidence)}
      {choose('Analysis runs', 'analysis', analyses, setAnalyses)}
      <div className="actions">
        <button type="button" disabled={!loaded || busy} onClick={() => void save()}>
          Save section plan
        </button>
        <button
          type="button"
          disabled={!loaded || busy}
          onClick={() =>
            void save().then((saved) => {
              if (saved) return ctx.app.open(path);
            })
          }
        >
          Write section
        </button>
      </div>
      <h3>Sources beside your draft</h3>
      {evidence.map((p) => (
        <button
          key={p}
          type="button"
          className="writing-section quiet"
          onClick={() =>
            void ctx.app
              .pageProperties(p)
              .then((props) => {
                setPreview({
                  title: p.split('/').at(-1) ?? p,
                  text: propertyText(props?.['excerpt'], ''),
                  source: linkedPaths([props?.['source']])[0]?.split('#')[0] ?? '',
                  page: propertyText(props?.['page'], '1'),
                  citekey: propertyText(props?.['citekey'], ''),
                });
              })
              .catch((err: unknown) => {
                setMessage(String(err));
              })
          }
        >
          {items.find((i) => i.path === p)?.title ?? p}
        </button>
      ))}
      {analyses.map((p) => (
        <button
          type="button"
          className="writing-section quiet"
          key={p}
          onClick={() => void ctx.app.open(p)}
        >
          {items.find((i) => i.path === p)?.title ?? p}
        </button>
      ))}
      {preview && (
        <aside className="writing-evidence">
          <h3>{preview.title}</h3>
          <blockquote>{preview.text}</blockquote>
          <div className="actions">
            <button
              type="button"
              disabled={!preview.source}
              onClick={() => void ctx.app.open(preview.source, { heading: `page=${preview.page}` })}
            >
              Open source PDF
            </button>
            <button
              type="button"
              disabled={!preview.citekey}
              onClick={() =>
                void ctx.app
                  .appendToPage(path, `[@${preview.citekey}]`)
                  .then(() => {
                    setMessage('Citation added to section.');
                  })
                  .catch((err: unknown) => {
                    setMessage(String(err));
                  })
              }
            >
              Add citation to section
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
