import { useEffect, useState } from 'react';
import type { DirEntry, ModuleContext } from '@core/api';
import { CANVAS_ENDING, emptyCanvas, isCanvas, serialiseCanvas } from './canvasFile';

/** How deep into folders to look for canvases. */
const DEPTH = 6;

/** Makes an empty canvas in `folder` and opens it. */
export async function createCanvas(
  ctx: ModuleContext,
  folder: string,
  name: string,
): Promise<void> {
  const file = await ctx.vault.freeName(folder, name.trim(), CANVAS_ENDING);
  const path = folder === '' ? file : `${folder}/${file}`;
  await ctx.vault.createNew(path, serialiseCanvas(emptyCanvas()));
  await ctx.app.open(path);
}

/** Every canvas in the vault, newest change first. BenchWork's own folders are skipped. */
export async function findCanvases(ctx: ModuleContext): Promise<DirEntry[]> {
  const found: DirEntry[] = [];
  const walk = async (folder: string, depth: number): Promise<void> => {
    let entries: DirEntry[];
    try {
      entries = await ctx.vault.listDir(folder);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDir) {
        if (depth < DEPTH) await walk(entry.path, depth + 1);
      } else if (isCanvas(entry.name)) {
        found.push(entry);
      }
    }
  };
  await walk('', 0);
  return found.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
}

/** The name a canvas shows as: its file name without the ending. */
export function canvasName(path: string): string {
  const base = path.split('/').at(-1) ?? path;
  return base.slice(0, base.length - CANVAS_ENDING.length);
}

/** Every canvas in one place, and a way to start a new one. */
export function CanvasList({ ctx }: { ctx: ModuleContext }) {
  const [canvases, setCanvases] = useState<DirEntry[] | null>(null);
  const [notebooks, setNotebooks] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let current = true;
    void Promise.all([findCanvases(ctx), ctx.vault.listDir('')]).then(([found, top]) => {
      if (!current) return;
      setCanvases(found);
      const folders = top.filter((e) => e.isDir && !e.name.startsWith('.')).map((e) => e.path);
      setNotebooks(folders);
      setFolder((f) => (f === '' || !folders.includes(f) ? (folders[0] ?? '') : f));
    });
    return () => {
      current = false;
    };
  }, [ctx, reads]);

  useEffect(() => {
    const watching = ctx.vault.watch((change) => {
      if (change.paths.some(isCanvas)) setReads((n) => n + 1);
    });
    return () => {
      watching.dispose();
    };
  }, [ctx]);

  const create = () => {
    if (name.trim() === '') return;
    void createCanvas(ctx, folder, name).then(() => {
      setName('');
    });
  };

  return (
    <div className="canvas-list">
      <form
        className="canvas-new"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label>
          Name
          <input
            value={name}
            placeholder="Project ideas"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <label>
          In
          <select
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value);
            }}
          >
            {notebooks.length === 0 && <option value="">The vault</option>}
            {notebooks.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={name.trim() === ''}>
          New canvas
        </button>
      </form>

      {canvases === null ? (
        <p className="hint">Looking for canvases…</p>
      ) : canvases.length === 0 ? (
        <p className="hint">No canvases yet. Name one above to start.</p>
      ) : (
        <ul className="canvas-files">
          {canvases.map((c) => (
            <li key={c.path}>
              <button type="button" onClick={() => void ctx.app.open(c.path)}>
                <span className="canvas-file-name">{canvasName(c.path)}</span>
                <span className="hint">{c.path.split('/').slice(0, -1).join(' › ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
