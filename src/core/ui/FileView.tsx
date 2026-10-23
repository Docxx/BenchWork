import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import type { TableData } from '../files/csv';
import { parseCsv } from '../files/csv';
import { fileKind, kindLabel } from '../files/fileKinds';
import { openPdf, type PdfDocument, type PdfRender } from '../files/pdf';
import { readSpreadsheet, type SheetData } from '../files/spreadsheet';
import { handlerFor } from '../modules/contributions';
import { CANVAS_EXTENSION } from '../notebooks/notebookTree';
import { baseName, PlatformError } from '../platform';
import { parseRecord, recordName } from '../records/records';
import { useApp } from './AppStoreContext';
import { LinkedFileView } from './LinkedFileView';

/** Rows shown in a table preview. */
export const PREVIEW_ROWS = 1000;
/** PDF pages drawn at most. */
const PDF_PAGES = 200;

/** The main area for a file that is not a page: a module's view, or a preview. */
export function FileView({ path }: { path: string }) {
  const handlers = useApp((s) => s.fileHandlers);
  const version = useApp((s) => s.fileVersion);
  const handler = handlerFor(handlers, path);
  const kind = fileKind(path);
  const title =
    kind === 'record' || kind === 'link'
      ? recordName(path)
      : kind === 'canvas'
        ? baseName(path).slice(0, -CANVAS_EXTENSION.length)
        : baseName(path);

  return (
    <article className="file-view" aria-label={title}>
      <header className="file-header">
        <h1 className="file-title">{title}</h1>
        <span className="file-kind">{handler?.name ?? kindLabel(path)}</span>
      </header>
      {/* Keyed so a change on disk, or another file, starts afresh, unless the view watches its file. */}
      <div
        className="file-body"
        key={handler?.watchesFile === true ? path : `${path}\n${String(version)}`}
      >
        {handler ? (
          <ModuleBoundary moduleId={handler.moduleId}>{handler.render({ path })}</ModuleBoundary>
        ) : (
          <Preview path={path} />
        )}
      </div>
    </article>
  );
}

function Preview({ path }: { path: string }) {
  switch (fileKind(path)) {
    case 'image':
      return <ImagePreview path={path} />;
    case 'table':
      return <CsvPreview path={path} />;
    case 'spreadsheet':
      return <SpreadsheetPreview path={path} />;
    case 'pdf':
      return <PdfPreview path={path} />;
    case 'link':
      return <LinkedFileView path={path} />;
    case 'record':
      return <RecordPreview path={path} />;
    case 'canvas':
      return (
        <p className="hint">
          Canvases are drawn by the Mind maps and canvas module. Switch it on in Settings to see
          this one.
        </p>
      );
    default:
      return <p className="hint">There is no preview for this kind of file.</p>;
  }
}

/** Why a file could not be shown, in plain words. */
function previewError(err: unknown): string {
  const e = PlatformError.from(err);
  if (e.kind === 'TooLarge') return 'This file is too large to preview.';
  if (e.kind === 'NotFound') return 'This file could not be found. It may have been moved.';
  return `This file could not be shown. ${e.message}`;
}

type Loaded<T> =
  { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; message: string };

/** Runs `load` once, keeping its result unless the component has gone. */
function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<Loaded<T>>({ state: 'loading' });
  const loader = useRef(load);
  useEffect(() => {
    let live = true;
    loader.current().then(
      (value) => {
        if (live) setResult({ state: 'ready', value });
      },
      (err: unknown) => {
        if (live) setResult({ state: 'error', message: previewError(err) });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return result;
}

function Status({ result }: { result: Loaded<unknown> }) {
  if (result.state === 'loading') return <p className="hint">Loading…</p>;
  if (result.state === 'error') {
    return (
      <p className="notice" role="alert">
        {result.message}
      </p>
    );
  }
  return null;
}

function ImagePreview({ path }: { path: string }) {
  const fileUrl = useApp((s) => s.fileUrl);
  const url = fileUrl(path);
  if (url === null) return <p className="hint">This image could not be shown.</p>;
  return <img className="image-preview" src={url} alt={baseName(path)} />;
}

export function TablePreview({ table, label }: { table: TableData; label: string }) {
  const [head, ...body] = table.rows;
  const width = Math.max(0, ...table.rows.map((r) => r.length));
  const pad = (row: readonly string[]) => [...row, ...Array<string>(width - row.length).fill('')];
  return (
    <div className="table-preview">
      {table.total > table.rows.length && (
        <p className="hint">
          Showing the first {table.rows.length.toLocaleString('en-GB')} of{' '}
          {table.total.toLocaleString('en-GB')} rows.
        </p>
      )}
      {head === undefined ? (
        <p className="hint">This table is empty.</p>
      ) : (
        <div className="table-scroll">
          <table aria-label={label}>
            <thead>
              <tr>
                {pad(head).map((cell, i) => (
                  <th key={i} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {pad(row).map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CsvPreview({ path }: { path: string }) {
  const readFileBytes = useApp((s) => s.readFileBytes);
  const result = useLoad(async () => {
    const text = new TextDecoder().decode(await readFileBytes(path));
    return parseCsv(text, PREVIEW_ROWS, path.toLowerCase().endsWith('.tsv') ? '\t' : undefined);
  });
  if (result.state !== 'ready') return <Status result={result} />;
  return <TablePreview table={result.value} label={baseName(path)} />;
}

function SpreadsheetPreview({ path }: { path: string }) {
  const readFileBytes = useApp((s) => s.readFileBytes);
  const result = useLoad(async () => readSpreadsheet(await readFileBytes(path), PREVIEW_ROWS));
  const [sheet, setSheet] = useState(0);
  if (result.state !== 'ready') return <Status result={result} />;
  const sheets: SheetData[] = result.value;
  const current = sheets[sheet] ?? sheets[0];
  if (!current) return <p className="hint">This spreadsheet has no sheets.</p>;
  return (
    <>
      {sheets.length > 1 && (
        <div className="tabs sheet-tabs" role="tablist" aria-label="Sheets">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              className="tab"
              aria-selected={s === current}
              onClick={() => {
                setSheet(i);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <TablePreview table={current} label={current.name} />
    </>
  );
}

function PdfPreview({ path }: { path: string }) {
  const readFileBytes = useApp((s) => s.readFileBytes);
  const result = useLoad(async () => openPdf(await readFileBytes(path)));
  const doc = result.state === 'ready' ? result.value : null;
  useEffect(
    () => () => {
      doc?.destroy();
    },
    [doc],
  );
  if (doc === null) return <Status result={result} />;
  return <PdfPages doc={doc} />;
}

function PdfPages({ doc }: { doc: PdfDocument }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const shown = Math.min(doc.pages, PDF_PAGES);

  useEffect(() => {
    const run: { live: boolean; current: PdfRender | null } = { live: true, current: null };
    const width = Math.min(900, Math.max(320, (ref.current?.clientWidth ?? 800) - 16));
    void (async () => {
      // One page at a time, top first, so the first page shows quickly.
      for (let n = 1; n <= shown && run.live; n += 1) {
        const canvas = ref.current?.querySelector<HTMLCanvasElement>(`[data-page="${String(n)}"]`);
        if (!canvas) continue;
        run.current = doc.render(n, canvas, width);
        try {
          if (!(await run.current.done)) return;
        } catch (err) {
          console.warn('Could not draw PDF page', n, err);
          setFailed(true);
        }
      }
    })();
    return () => {
      // Stop the page being drawn, so the canvas is free to draw again.
      run.live = false;
      run.current?.cancel();
    };
  }, [doc, shown]);

  return (
    <div className="pdf-preview" ref={ref}>
      <p className="hint">
        {doc.pages === 1 ? '1 page' : `${String(doc.pages)} pages`}
        {doc.pages > shown ? `, showing the first ${String(shown)}` : ''}.
      </p>
      {failed && <p className="hint">Some pages could not be drawn.</p>}
      {Array.from({ length: shown }, (_, i) => (
        <canvas key={i} data-page={i + 1} aria-label={`Page ${String(i + 1)}`} role="img" />
      ))}
    </div>
  );
}

/** A record no module shows: its values, read only. */
function RecordPreview({ path }: { path: string }) {
  const readFileText = useApp((s) => s.readFileText);
  const result = useLoad(async () => parseRecord(await readFileText(path)));
  if (result.state !== 'ready') return <Status result={result} />;
  const { data, error } = result.value;
  if (error !== null) {
    return <p className="hint">This record could not be read, so it is left as it is.</p>;
  }
  const entries = Object.entries(data);
  return (
    <>
      <p className="hint">
        A {kindLabel(path).toLowerCase()} record. Switch on the module that uses it to edit it here.
      </p>
      <dl className="record-values">
        {entries.map(([key, value]) => (
          <div key={key} className="record-value">
            <dt>{key}</dt>
            <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** Stops a module's view that throws from breaking the rest of the app. */
class ModuleBoundary extends Component<
  { moduleId: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.moduleId}] File view failed:`, error, info);
  }

  override render(): ReactNode {
    if (this.state.failed) return <p className="notice">This file could not be shown.</p>;
    return this.props.children;
  }
}
