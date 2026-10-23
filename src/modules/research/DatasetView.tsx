import { useCallback, useEffect, useId, useState } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import {
  checkFile,
  datasetFiles,
  describeFile,
  fileName,
  filesValue,
  folderOf,
  formatSize,
  isFullPath,
  type DatasetFile,
  type FileState,
} from './datasets';

const STATE_TEXT: Record<FileState, string> = {
  same: 'Unchanged',
  changed: 'Changed',
  missing: 'Not found',
  unreadable: 'Could not be read',
  unchecked: 'No checksum',
};

interface Loaded {
  data: Record<string, unknown>;
  experiments: VaultItem[];
  linkedFrom: VaultItem[];
  /** The experiment the record links to, as its path, if it resolves. */
  experimentPath: string | null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** `[[Dose]]` as `Dose`. */
function linkTarget(value: unknown): string | null {
  const m = /^\s*\[\[([^[\]|#]+)/.exec(text(value));
  return m?.[1]?.trim() ?? null;
}

/** A dataset record, edited in place. Changes are written to the record straight away. */
export function DatasetView({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, FileState | 'checking'>>({});
  const [busy, setBusy] = useState<string | null>(null);

  /** The record and what it links to, or why it cannot be shown. */
  const read = useCallback(async (): Promise<Loaded | string> => {
    const { data, error } = await ctx.vault.readRecord(path);
    if (error !== null) return 'This dataset record could not be read, so it is left as it is.';
    const items = await ctx.app.items();
    const target = linkTarget(data['experiment']);
    return {
      data,
      experiments: items.filter((i) => i.type === 'experiment'),
      linkedFrom: await ctx.app.linksTo(path),
      experimentPath: target === null ? null : await ctx.app.resolveLink(target, path),
    };
  }, [ctx, path]);

  const show = (result: Loaded | string) => {
    if (typeof result === 'string') setProblem(result);
    else setLoaded(result);
  };

  useEffect(() => {
    let live = true;
    read().then(
      (result) => {
        if (live) show(result);
      },
      (err: unknown) => {
        if (live) setProblem(`This dataset could not be shown. ${messageOf(err)}`);
      },
    );
    return () => {
      live = false;
    };
  }, [read]);

  const save = async (changes: Record<string, unknown>) => {
    try {
      await ctx.vault.updateRecord(path, changes);
      show(await read());
    } catch (err) {
      setProblem(`That change could not be saved. ${messageOf(err)}`);
    }
  };

  if (problem !== null) return <p className="notice">{problem}</p>;
  if (loaded === null) return <p className="hint">Loading…</p>;
  const { data } = loaded;
  const files = datasetFiles(data);

  const addFiles = async () => {
    const picked = await ctx.vault.pickFiles({
      title: 'Add files to this dataset',
      multiple: true,
    });
    if (picked.length === 0) return;
    setBusy(`Reading ${String(picked.length)} ${picked.length === 1 ? 'file' : 'files'}…`);
    try {
      const added: DatasetFile[] = [];
      for (const full of picked) added.push(await describeFile(ctx.vault, full));
      const known = new Set(files.map((f) => f.path));
      const next = [...files, ...added.filter((f) => !known.has(f.path))];
      const outside = added.find((f) => isFullPath(f.path));
      const external =
        text(data['external']) === '' && outside ? { external: folderOf(outside.path) } : {};
      await save({ files: filesValue(next), ...external });
    } catch (err) {
      setProblem(`Those files could not be added. ${messageOf(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const checkFiles = async () => {
    setStates(Object.fromEntries(files.map((f) => [f.path, 'checking' as const])));
    for (const f of files) {
      const state = await checkFile(ctx.vault, f);
      setStates((s) => ({ ...s, [f.path]: state }));
    }
  };

  const removeFile = (file: DatasetFile) => {
    void save({ files: filesValue(files.filter((f) => f !== file)) });
  };

  return (
    <div className="dataset-view">
      <div className="property-rows">
        <TextRow
          label="Description"
          value={text(data['description'])}
          onCommit={(v) => void save({ description: v === '' ? null : v })}
        />
        <div className="property-row">
          <span className="property-label">Experiment</span>
          <div className="property-value">
            <ExperimentChoice
              loaded={loaded}
              onChoose={(item) =>
                void (async () => {
                  const value = item === null ? null : `[[${await ctx.app.linkTarget(item.path)}]]`;
                  await save({ experiment: value });
                })()
              }
            />
            {loaded.experimentPath !== null && (
              <button
                type="button"
                className="quiet"
                onClick={() => void ctx.app.open(loaded.experimentPath ?? '')}
              >
                Open
              </button>
            )}
          </div>
        </div>
        <TextRow
          label="Instrument"
          value={text(data['instrument'])}
          onCommit={(v) => void save({ instrument: v === '' ? null : v })}
        />
        <TextRow
          label="Acquired"
          type="date"
          value={text(data['acquired'])}
          onCommit={(v) => void save({ acquired: v === '' ? null : v })}
        />
        <TextRow
          label="Stored at"
          value={text(data['external'])}
          placeholder="Folder on lab storage, if the files are not in the vault"
          onCommit={(v) => void save({ external: v === '' ? null : v })}
        />
      </div>

      <h2 className="dataset-heading">Files</h2>
      {files.length === 0 ? (
        <p className="hint">No files yet. Add the files this dataset is made of.</p>
      ) : (
        <div className="table-scroll">
          <table className="dataset-files" aria-label="Dataset files">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Size</th>
                <th scope="col">SHA-256</th>
                <th scope="col">Check</th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const state = states[f.path];
                return (
                  <tr key={f.path}>
                    <td title={f.path}>
                      {isFullPath(f.path) ? (
                        fileName(f.path)
                      ) : (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => void ctx.app.open(f.path)}
                        >
                          {fileName(f.path)}
                        </button>
                      )}
                    </td>
                    <td>{f.size === null ? '' : formatSize(f.size)}</td>
                    <td className="checksum" title={f.sha256 ?? ''}>
                      {f.sha256?.slice(0, 12) ?? ''}
                    </td>
                    <td className={state === undefined ? '' : `file-state ${state}`}>
                      {state === undefined
                        ? ''
                        : state === 'checking'
                          ? 'Checking…'
                          : STATE_TEXT[state]}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="quiet"
                        aria-label={`Remove ${fileName(f.path)} from this dataset`}
                        title="Remove from this dataset. The file itself is kept."
                        onClick={() => {
                          removeFile(f);
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="actions">
        <button type="button" disabled={busy !== null} onClick={() => void addFiles()}>
          Add files…
        </button>
        {files.length > 0 && (
          <button type="button" className="quiet" onClick={() => void checkFiles()}>
            Check files
          </button>
        )}
      </div>
      {busy !== null && (
        <p className="hint" role="status">
          {busy}
        </p>
      )}

      {loaded.linkedFrom.length > 0 && (
        <section className="dataset-links" aria-label="Linked from">
          <h2 className="dataset-heading">Linked from</h2>
          <ul>
            {loaded.linkedFrom.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void ctx.app.open(item.path)}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ExperimentChoice({
  loaded,
  onChoose,
}: {
  loaded: Loaded;
  onChoose: (item: VaultItem | null) => void;
}) {
  const id = useId();
  const current = loaded.experimentPath ?? '';
  const written = linkTarget(loaded.data['experiment']);
  return (
    <select
      id={id}
      aria-label="Experiment"
      value={current}
      onChange={(e) => {
        onChoose(loaded.experiments.find((x) => x.path === e.target.value) ?? null);
      }}
    >
      <option value="">
        {written !== null && current === '' ? `${written} (not found)` : '–'}
      </option>
      {loaded.experiments.map((x) => (
        <option key={x.path} value={x.path}>
          {x.title}
        </option>
      ))}
    </select>
  );
}

function TextRow({
  label,
  value,
  type = 'text',
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  type?: 'text' | 'date';
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <div className="property-row">
      <label className="property-label" htmlFor={id}>
        {label}
      </label>
      <div className="property-value">
        <input
          id={id}
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            if (type === 'date') onCommit(e.target.value);
          }}
          onBlur={type === 'date' ? undefined : commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && type !== 'date') commit();
          }}
        />
      </div>
    </div>
  );
}
