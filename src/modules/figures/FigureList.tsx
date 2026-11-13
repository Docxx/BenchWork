import { useEffect, useState } from 'react';
import type { DirEntry, ModuleContext } from '@core/api';
import { FIGURE_ENDING, newFigure, serialiseFigure } from './model';

const isFigure = (path: string) => path.toLowerCase().endsWith(FIGURE_ENDING);

/** Makes a figure with a grid in `folder`, and opens it. */
export async function createFigure(
  ctx: ModuleContext,
  folder: string,
  name: string,
  rows = 2,
  cols = 3,
): Promise<void> {
  const file = await ctx.vault.freeName(folder, name.trim(), FIGURE_ENDING);
  const path = folder === '' ? file : `${folder}/${file}`;
  await ctx.vault.createNew(path, serialiseFigure(newFigure(rows, cols)));
  await ctx.app.open(path);
}

/** Every figure in the vault, newest change first. BenchWork's own folders are skipped. */
export async function findFigures(ctx: ModuleContext): Promise<DirEntry[]> {
  const found: DirEntry[] = [];
  const walk = async (folder: string, depth: number): Promise<void> => {
    let entries: DirEntry[];
    try {
      entries = await ctx.vault.listDir(folder);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDir) {
        if (depth < 6) await walk(e.path, depth + 1);
      } else if (isFigure(e.name)) found.push(e);
    }
  };
  await walk('', 0);
  return found.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
}

/** The Figures tool: every figure, and a new one with its grid. */
export function FigureList({ ctx }: { ctx: ModuleContext }) {
  const [figures, setFigures] = useState<DirEntry[] | null>(null);
  const [notebooks, setNotebooks] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.all([findFigures(ctx), ctx.vault.listDir('')]).then(([found, top]) => {
      if (!live) return;
      setFigures(found);
      // Notebooks only: not hidden folders, nor the images a figure at the top keeps.
      const folders = top
        .filter((e) => e.isDir && !e.name.startsWith('.') && e.name !== 'attachments')
        .map((e) => e.path);
      setNotebooks(folders);
      setFolder((f) => (f === '' || !folders.includes(f) ? (folders[0] ?? '') : f));
    });
    return () => {
      live = false;
    };
  }, [ctx, reads]);

  useEffect(() => {
    const watching = ctx.vault.watch((change) => {
      if (change.paths.some(isFigure)) setReads((n) => n + 1);
    });
    return () => {
      watching.dispose();
    };
  }, [ctx]);

  const size = (label: string, value: number, set: (n: number) => void) => (
    <label className="fig-field">
      {label}
      <input
        type="number"
        aria-label={label}
        min={1}
        max={12}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (n >= 1 && n <= 12) set(n);
        }}
      />
    </label>
  );

  return (
    <div className="fig-list">
      <form
        className="fig-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === '') return;
          void createFigure(ctx, folder, name, rows, cols).then(() => {
            setName('');
          });
        }}
      >
        <input
          aria-label="Figure name"
          placeholder="Name of a new figure, such as Figure 2"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        {size('Rows', rows, setRows)}
        {size('Columns', cols, setCols)}
        <select
          aria-label="Notebook"
          value={folder}
          onChange={(e) => {
            setFolder(e.target.value);
          }}
        >
          {notebooks.length === 0 && <option value="">The vault</option>}
          {notebooks.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button type="submit" disabled={name.trim() === ''}>
          New figure
        </button>
      </form>
      {figures === null ? (
        <p className="hint">Reading…</p>
      ) : figures.length === 0 ? (
        <p className="hint">
          No figures yet. A figure lays images out in panels on a page of real size, with labels,
          ready to export for a paper or a talk.
        </p>
      ) : (
        <ul aria-label="Figures">
          {figures.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                className="link-button"
                onClick={() => void ctx.app.open(f.path)}
              >
                {f.name.slice(0, -FIGURE_ENDING.length)}
              </button>
              <span className="hint">
                {f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
