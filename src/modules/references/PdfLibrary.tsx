import { useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';

export interface PdfLibrarySettings {
  folder: string | null;
  recursive: boolean;
}
export function parsePdfLibrary(value: unknown): PdfLibrarySettings {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    folder: typeof data['folder'] === 'string' ? data['folder'] : null,
    recursive: data['recursive'] !== false,
  };
}
export async function paperPaths(
  ctx: ModuleContext,
  folder: string,
  recursive: boolean,
): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await ctx.vault.listDir(folder)) {
    if (entry.name.startsWith('.')) continue;
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDir && recursive) result.push(...(await paperPaths(ctx, path, true)));
    else if (!entry.isDir && /\.pdf$/i.test(entry.name)) result.push(path);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

export function PdfLibrary({ ctx }: { ctx: ModuleContext }) {
  const [settings, setSettings] = useState<PdfLibrarySettings>({ folder: null, recursive: true });
  const [paths, setPaths] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void ctx.storage
      .read('reading-library.json')
      .then(async (saved) => {
        const parsed = parsePdfLibrary(saved);
        if (parsed.folder === null && (await ctx.vault.exists('Papers'))) parsed.folder = 'Papers';
        if (live) setSettings(parsed);
      })
      .catch((err: unknown) => {
        if (live) setError(String(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [ctx]);
  useEffect(() => {
    let live = true;
    let request = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (settings.folder === null) return;
    const load = () => {
      const token = ++request;
      void paperPaths(ctx, settings.folder ?? '', settings.recursive)
        .then((all) => {
          if (live && token === request) setPaths(all);
        })
        .catch((err: unknown) => {
          if (live) setError(String(err));
        });
    };
    const watching = ctx.vault.watch(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
    load();
    return () => {
      live = false;
      clearTimeout(timer);
      watching.dispose();
    };
  }, [ctx, settings]);
  const save = async (next: PdfLibrarySettings) => {
    try {
      await ctx.storage.write('reading-library.json', next);
      setSettings(next);
      setChoosing(false);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };
  const shown = paths.filter((p) => p.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="pdf-library">
      <div className="actions">
        <strong>
          {settings.folder === null ? 'No papers folder selected' : settings.folder || 'Vault root'}
        </strong>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setChoosing(!choosing);
          }}
        >
          Choose papers folder
        </button>
      </div>
      {choosing && (
        <FolderChooser
          ctx={ctx}
          initial={settings.folder ?? ''}
          onChoose={(folder) => void save({ ...settings, folder })}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {settings.folder !== null && (
        <>
          <label>
            <input
              type="checkbox"
              checked={settings.recursive}
              onChange={(e) => void save({ ...settings, recursive: e.target.checked })}
            />
            Include subfolders
          </label>
          <input
            aria-label="Search PDF library"
            placeholder="Find a paper…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <p className="hint">{shown.length} PDFs in the selected folder</p>
        </>
      )}
      {!loading && settings.folder === null && (
        <p className="hint">
          Choose the folder in your vault that contains your papers. Other PDFs will stay out of
          this library.
        </p>
      )}
      {settings.folder !== null && shown.length === 0 && (
        <p className="hint">No matching PDFs in this folder.</p>
      )}
      {settings.folder !== null &&
        shown.map((path) => (
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
    </div>
  );
}

function FolderChooser({
  ctx,
  initial,
  onChoose,
}: {
  ctx: ModuleContext;
  initial: string;
  onChoose: (path: string) => void;
}) {
  const [folder, setFolder] = useState(initial);
  const [folders, setFolders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void ctx.vault
      .listDir(folder)
      .then((entries) => {
        if (live) {
          setFolders(entries.filter((e) => e.isDir && !e.name.startsWith('.')).map((e) => e.name));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (live) setError(String(err));
      });
    return () => {
      live = false;
    };
  }, [ctx, folder]);
  return (
    <fieldset className="papers-folder-picker">
      <legend>Papers folder</legend>
      <p>{folder || 'Vault root'}</p>
      {error && <p role="alert">{error}</p>}
      {folder && (
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setFolder(folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : '');
          }}
        >
          Parent folder
        </button>
      )}
      {folders.map((name) => (
        <button
          type="button"
          className="reading-item quiet"
          key={name}
          onClick={() => {
            setFolder(folder ? `${folder}/${name}` : name);
          }}
        >
          {name} /
        </button>
      ))}
      <button
        type="button"
        disabled={error !== null}
        onClick={() => {
          onChoose(folder);
        }}
      >
        Use this folder
      </button>
    </fieldset>
  );
}
