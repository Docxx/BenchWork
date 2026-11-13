import { useEffect, useState } from 'react';
import type { DirEntry, ModuleContext } from '@core/api';
import { BOARD_ENDING, emptyBoard, serialiseBoard } from './model';

const isBoard = (path: string) => path.toLowerCase().endsWith(BOARD_ENDING);

/** Makes an empty whiteboard in `folder` and opens it. */
export async function createBoard(ctx: ModuleContext, folder: string, name: string): Promise<void> {
  const file = await ctx.vault.freeName(folder, name.trim(), BOARD_ENDING);
  const path = folder === '' ? file : `${folder}/${file}`;
  await ctx.vault.createNew(path, serialiseBoard(emptyBoard()));
  await ctx.app.open(path);
}

/** Every whiteboard in the vault, newest change first. BenchWork's own folders are skipped. */
export async function findBoards(ctx: ModuleContext): Promise<DirEntry[]> {
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
      } else if (isBoard(e.name)) found.push(e);
    }
  };
  await walk('', 0);
  return found.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
}

/** The Whiteboards tool: every board, and a new one in a notebook. */
export function BoardList({ ctx }: { ctx: ModuleContext }) {
  const [boards, setBoards] = useState<DirEntry[] | null>(null);
  const [notebooks, setNotebooks] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let current = true;
    void Promise.all([findBoards(ctx), ctx.vault.listDir('')]).then(([found, top]) => {
      if (!current) return;
      setBoards(found);
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
      if (change.paths.some(isBoard)) setReads((n) => n + 1);
    });
    return () => {
      watching.dispose();
    };
  }, [ctx]);

  return (
    <div className="wb-list">
      <form
        className="wb-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === '') return;
          void createBoard(ctx, folder, name).then(() => {
            setName('');
          });
        }}
      >
        <input
          aria-label="Whiteboard name"
          placeholder="Name of a new whiteboard"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
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
          New whiteboard
        </button>
      </form>
      {boards === null ? (
        <p className="hint">Reading…</p>
      ) : boards.length === 0 ? (
        <p className="hint">
          No whiteboards yet. A whiteboard is an endless board to write and draw on, kept beside
          your notes.
        </p>
      ) : (
        <ul aria-label="Whiteboards">
          {boards.map((b) => (
            <li key={b.path}>
              <button
                type="button"
                className="link-button"
                onClick={() => void ctx.app.open(b.path)}
              >
                {b.name.slice(0, -BOARD_ENDING.length)}
              </button>
              <span className="hint">
                {b.path.includes('/') ? b.path.slice(0, b.path.lastIndexOf('/')) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
