import { useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';
import {
  exportManuscript,
  exportMessage,
  readManuscript,
  type ManuscriptInfo,
} from './manuscripts';

/** A manuscript at a glance: its parts and word counts, and Export to Word. */
export function Overview({ ctx, path }: { ctx: ModuleContext; path: string | null }) {
  const [info, setInfo] = useState<ManuscriptInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pandoc, setPandoc] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    if (path === null) return;
    void readManuscript(ctx, path)
      .then((read) => {
        if (current) setInfo(read);
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    void ctx.pandoc.version().then((v) => {
      if (current) setPandoc(v);
    });
    return () => {
      current = false;
    };
  }, [ctx, path]);

  if (path === null) return <p className="page-empty">Open a manuscript first.</p>;
  if (problem !== null)
    return <p className="notice">This manuscript could not be read. {problem}</p>;
  if (info === null) return <p className="hint">Reading the manuscript…</p>;

  const total = info.parts.reduce((sum, p) => sum + p.words, 0);
  const runExport = async () => {
    setBusy(true);
    setDone(null);
    try {
      setDone(exportMessage(await exportManuscript(ctx, path)));
    } catch (err) {
      setDone(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manuscript-overview">
      <h2 className="manuscript-title">{info.title}</h2>
      {info.author !== null && <p className="hint">{info.author}</p>}

      {info.parts.length === 0 ? (
        <p className="hint">
          This manuscript has no parts yet. Link to its pages in the manuscript, in order.
        </p>
      ) : (
        <table className="manuscript-parts" aria-label="Parts">
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Words</th>
            </tr>
          </thead>
          <tbody>
            {info.parts.map((part) => (
              <tr key={part.target} className={part.path === null ? 'missing' : undefined}>
                <td>
                  {part.path === null ? (
                    <span title="No page with this name yet">{part.target} (not written yet)</span>
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        if (part.path !== null) void ctx.app.open(part.path);
                      }}
                    >
                      {part.title}
                    </button>
                  )}
                </td>
                <td className="number">{part.words.toLocaleString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="number">{total.toLocaleString('en-GB')}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <div className="actions">
        <button type="button" disabled={busy || !pandoc} onClick={() => void runExport()}>
          {busy ? 'Exporting…' : 'Export to Word'}
        </button>
        <button type="button" className="quiet" onClick={() => void ctx.app.open(path)}>
          Open manuscript
        </button>
      </div>
      {pandoc === null && (
        <p className="hint">
          Exporting needs Pandoc. Install it with winget install JohnMacFarlane.Pandoc, then restart
          BenchWork.
        </p>
      )}
      {done !== null && <p role="status">{done}</p>}
    </div>
  );
}
