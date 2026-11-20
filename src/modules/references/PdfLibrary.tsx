export { parsePdfLibrary, paperPaths } from './filePaper';
import { filePaper, parsePdfLibrary, paperPaths, type PdfLibrarySettings } from './filePaper';
import { useRef, useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';

export function PdfLibrary({ ctx }: { ctx: ModuleContext }) {
  const [settings, setSettings] = useState<PdfLibrarySettings>({ folder: null, recursive: true });
  const [paths, setPaths] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const picker = useRef<HTMLInputElement>(null);
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
  const collect = async (files?: File[]) => {
    if (busy || loading) return;
    setBusy(true);
    setError(null);
    setNotice('');
    const folder = settings.folder ?? 'Papers';
    try {
      const added: string[] = [];
      if (files) {
        for (const file of files) {
          if (file.size > 64 * 1024 * 1024)
            throw new Error('The PDF exceeds the reader limit of 64 MB.');
          added.push(
            await filePaper(
              ctx,
              folder,
              settings.recursive,
              file.name,
              new Uint8Array(await file.arrayBuffer()),
            ),
          );
        }
      } else {
        const address = new URL(url);
        const basename = decodeURIComponent(address.pathname.split('/').at(-1) || 'Paper');
        added.push(
          await filePaper(
            ctx,
            folder,
            settings.recursive,
            title.trim() || basename,
            await ctx.files.downloadPaper(address.href),
          ),
        );
        const [path] = added;
        if (path) {
          const sources =
            (await ctx.storage.read<Record<string, string>>('paper-references.json')) ?? {};
          if (!sources[path])
            await ctx.storage.write('paper-references.json', {
              ...sources,
              [path]: title.trim()
                ? title.trim() + ' · ' + address.origin + address.pathname
                : address.origin + address.pathname,
            });
        }
        setUrl('');
        setTitle('');
      }
      if (settings.folder === null) await save({ ...settings, folder });
      setPaths(await paperPaths(ctx, folder, settings.recursive));
      setNotice('In your library: ' + added.join(', '));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
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
      <form
        className="paper-import"
        onSubmit={(e) => {
          e.preventDefault();
          void collect();
        }}
      >
        <label>
          Direct PDF link
          <input
            type="url"
            required
            placeholder="https://..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
          />
        </label>
        <label>
          Paper title (optional)
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </label>
        <button type="submit" disabled={!url.trim() || busy || loading}>
          Download PDF
        </button>
        <button type="button" disabled={busy || loading} onClick={() => picker.current?.click()}>
          Import downloaded PDFs
        </button>
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          accept=".pdf,application/pdf"
          aria-label="Import PDFs"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void collect(files);
          }}
        />
      </form>
      {(busy || notice) && <p role="status">{busy ? 'Adding papers...' : notice}</p>}
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
