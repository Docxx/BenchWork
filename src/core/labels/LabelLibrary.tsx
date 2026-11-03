import { useEffect, useState, type ChangeEvent } from 'react';
import { Folder, FolderPlus, Download, Upload, ArrowRight } from 'lucide-react';
import { feedSize, type LabelDesign } from './model';
import { renderFeed } from './render';

interface Props {
  templates: LabelDesign[];
  folders: string[];
  onOpen: (design: LabelDesign) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onMove: (ids: string[], folder: string) => Promise<void>;
  onExport: (labels: LabelDesign[]) => Promise<void>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  keepAlignment: boolean;
  onKeepAlignment: (value: boolean) => void;
}
export function LabelLibrary({
  templates,
  folders,
  onOpen,
  onCreateFolder,
  onMove,
  onExport,
  onImport,
  keepAlignment,
  onKeepAlignment,
}: Props) {
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('*');
  const [filter, setFilter] = useState('all');
  const [newFolder, setNewFolder] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const visible = [...templates]
    .reverse()
    .filter(
      (d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) &&
        (folder === '*' || (d.folder ?? '') === folder) &&
        (filter === 'all' ||
          (filter === 'printed' ? d.savedAs === 'printed' : d.savedAs !== 'printed')),
    );
  const picked = templates.filter((d) => selected.includes(d.id));
  return (
    <section className="label-library">
      <div className="label-library-heading">
        <div>
          <h2>Templates and saved labels</h2>
          <p className="hint">Create here. Take a label pack to your phone. Print in the lab.</p>
        </div>
        <label className="label-file-button">
          <Upload size={17} />
          Import labels
          <input type="file" accept=".json" onChange={onImport} />
        </label>
      </div>
      <div className="label-library-layout">
        <aside className="label-folder-panel">
          <nav aria-label="Label folders">
            {[['*', 'All labels'], ['', 'Unfiled'], ...folders.map((f) => [f, f])].map(
              ([value, name]) => (
                <button
                  key={value}
                  aria-label={`Folder ${name ?? 'All labels'}`}
                  aria-pressed={folder === value}
                  onClick={() => {
                    setFolder(value ?? '*');
                    setSelected([]);
                  }}
                >
                  <Folder size={16} />
                  {name}
                  <span>
                    {templates.filter((d) => value === '*' || (d.folder ?? '') === value).length}
                  </span>
                </button>
              ),
            )}
          </nav>
          <details className="label-new-folder">
            <summary>New folder</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newFolder.trim())
                  void onCreateFolder(newFolder).then(() => {
                    setNewFolder('');
                  });
              }}
            >
              <label>
                New folder
                <input
                  value={newFolder}
                  maxLength={80}
                  onChange={(e) => {
                    setNewFolder(e.target.value);
                  }}
                />
              </label>
              <button disabled={!newFolder.trim()}>
                <FolderPlus size={16} />
                Create folder
              </button>
            </form>
          </details>
        </aside>
        <div className="label-library-content">
          <div className="label-library-search">
            <label>
              Search saved labels
              <input
                type="search"
                placeholder="Search labels…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
              />
            </label>
            <label>
              Show
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                }}
              >
                <option value="all">All labels</option>
                <option value="templates">Templates</option>
                <option value="printed">Recent prints</option>
              </select>
            </label>
          </div>
          <div className="label-library-actions">
            <button
              disabled={!visible.length}
              onClick={() => {
                setSelected(visible.map((d) => d.id));
              }}
            >
              Select visible
            </button>
            <button disabled={!picked.length} onClick={() => void onExport(picked)}>
              <Download size={16} />
              Export selected ({picked.length})
            </button>
            <button disabled={!visible.length} onClick={() => void onExport(visible)}>
              <Download size={16} />
              {folder === '*' ? 'Export library' : 'Export folder'}
            </button>
            {!!picked.length && (
              <label>
                Move selected to folder
                <select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value)
                      void onMove(
                        picked.map((d) => d.id),
                        value === 'root' ? '' : value.slice(7),
                      ).then(() => {
                        setSelected([]);
                      });
                  }}
                >
                  <option value="">Choose a folder</option>
                  <option value="root">Unfiled</option>
                  {folders.map((f) => (
                    <option key={f} value={`folder:${f}`}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="label-library-grid">
            {visible.map((d) => (
              <article key={d.id} className="label-library-card">
                <label className="label-library-select">
                  <input
                    type="checkbox"
                    aria-label={`Select saved label ${d.name}`}
                    checked={selected.includes(d.id)}
                    onChange={(e) => {
                      setSelected((ids) =>
                        e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id),
                      );
                    }}
                  />
                  {d.savedAs === 'printed' ? 'Recent print' : d.folder || 'Template'}
                </label>
                <button
                  className="label-open-card"
                  aria-label={`Open label ${d.name}`}
                  onClick={() => {
                    onOpen(d);
                  }}
                >
                  <span className="label-preview-frame">
                    <LabelThumbnail design={d} />
                  </span>
                  <strong>{d.name}</strong>
                  <span>
                    {d.width} × {d.height} mm · {d.perFeed} per feed
                  </span>
                  <span className="label-open-hint">
                    Open and edit <ArrowRight size={14} />
                  </span>
                </button>
              </article>
            ))}
          </div>
          {!visible.length && (
            <p>
              {templates.length
                ? 'No labels match your search.'
                : 'Save your first label to start your library.'}
            </p>
          )}
        </div>
      </div>
      <details className="label-transfer-help">
        <summary>Taking labels to the lab</summary>
        <ol>
          <li>Select labels, or open a folder and choose Export folder.</li>
          <li>
            Transfer the .labelpack.json file to your phone using Quick Share, USB or a cloud
            folder.
          </li>
          <li>
            Open the phone app’s Library and choose Import labels. The labels and their images are
            kept offline.
          </li>
        </ol>
        <label className="label-check">
          <input
            type="checkbox"
            checked={keepAlignment}
            onChange={(e) => {
              onKeepAlignment(e.target.checked);
            }}
          />
          Use this device’s print alignment when importing matching paper
        </label>
        <p className="hint">
          Packs include folders, editable layouts, images and saved field values. Today's date stays
          live. Import creates copies and keeps existing labels.
        </p>
      </details>
    </section>
  );
}

function LabelThumbnail({ design }: { design: LabelDesign }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    const row = {
      name: 'Sample name',
      id: 'SAMPLE-001',
      date: new Date().toLocaleDateString('en-GB'),
      ...design.data,
    };
    void renderFeed(
      design,
      Array.from({ length: design.perFeed }, () => row),
      1,
    )
      .then((c) => {
        if (live) setSrc(c.toDataURL());
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [design]);
  const size = feedSize(design);
  return src ? (
    <img
      src={src}
      alt={`Preview of ${design.name}`}
      style={{ aspectRatio: `${String(size.width)} / ${String(size.height)}` }}
    />
  ) : (
    <span className="label-thumbnail-empty">Label preview</span>
  );
}
