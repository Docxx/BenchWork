import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, RefreshCw, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { ModuleContext, VaultGraph } from '@core/api';
import {
  DEFAULT_STYLE,
  graphModel,
  graphSignature,
  parseView,
  type GraphPreset,
  type GraphStyle,
} from './model';
import { GraphCanvas } from './GraphCanvas';

export function GraphView({ ctx, focus }: { ctx: ModuleContext; focus: string | null }) {
  const [data, setData] = useState<VaultGraph>({ nodes: [], edges: [], warnings: [] });
  const [style, setStyle] = useState<GraphStyle>(DEFAULT_STYLE);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [folder, setFolder] = useState('');
  const [kind, setKind] = useState('all');
  const [local, setLocal] = useState(focus !== null);
  const [settings, setSettings] = useState(false);
  /** The search and filter bar; hidden until asked for, so the graph has the room. */
  const [options, setOptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState<GraphPreset[]>([]);
  /** The saved view has been read, so changes from here on are kept. */
  const [ready, setReady] = useState(false);
  const [kept, setKept] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [fit, setFit] = useState(0);
  const [selected, setSelected] = useState<string | null>(focus);
  const request = useRef(0);
  /** What was last drawn; a reload that finds the same graph changes nothing. */
  const signature = useRef('');
  useEffect(() => {
    let live = true;
    void ctx.storage
      .read('appearance.json')
      .then((value) => {
        if (!live) return;
        const view = parseView(value);
        setStyle(view.style);
        setPresets(view.presets);
        setSettings(view.panel);
        setOptions(view.options);
        setFolder(view.filters.folder);
        setKind(view.filters.kind);
        setTag(view.filters.tag);
        setReady(true);
      })
      .catch(() => {
        if (!live) return;
        setError('Saved graph options could not be read. You can still explore the graph.');
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [ctx]);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      const id = ++request.current;
      void ctx.app
        .graph()
        .then((snapshot) => {
          if (live && request.current === id) {
            const next = graphSignature(snapshot);
            if (next !== signature.current) {
              signature.current = next;
              setData(snapshot);
            }
            setLoading(false);
            setError('');
          }
        })
        .catch((e: unknown) => {
          if (live && request.current === id) {
            setError(String(e));
            setLoading(false);
          }
        });
    };
    load();
    const watch = ctx.vault.watch(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      watch.dispose();
    };
  }, [ctx, refresh]);
  // Every option is kept as it is changed, a moment after the last change.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void ctx.storage
        .write('appearance.json', {
          style,
          filters: { folder, kind, tag },
          presets,
          panel: settings,
          options,
        })
        .then(() => {
          setKept(true);
        })
        .catch((e: unknown) => {
          setError(String(e));
        });
    }, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [ctx, ready, style, folder, kind, tag, presets, settings, options]);
  const model = useMemo(
    () =>
      graphModel(
        {
          ...data,
          nodes: data.nodes.filter(
            (n) =>
              (!folder || n.path.startsWith(`${folder}/`)) && (kind === 'all' || n.kind === kind),
          ),
        },
        style,
        query,
        tag,
        local ? focus : null,
      ),
    // Only what changes the graph itself; how it looks is read as it is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data,
      style.colourBy,
      style.tags,
      style.orphans,
      style.spacing,
      query,
      tag,
      local,
      focus,
      folder,
      kind,
    ],
  );
  const tags = [...new Set(data.nodes.flatMap((n) => n.tags))].sort();
  const current = model.nodes.find((n) => n.id === selected);
  const update = (change: Partial<GraphStyle>) => {
    setStyle((s) => ({ ...s, ...change }));
  };
  const savePreset = async () => {
    const name = await ctx.app.askText({ title: 'Save this look', label: 'Name' });
    if (name === null || name.trim() === '') return;
    const preset = { name: name.trim().slice(0, 40), style };
    setPresets((all) => [...all.filter((p) => p.name !== preset.name), preset].slice(-20));
  };
  return (
    <div className={`knowledge-graph graph-${style.palette}`}>
      {options && (
        <div className="graph-toolbar" role="toolbar" aria-label="Graph options">
          <div className="graph-brand">
            <Sparkles size={18} aria-hidden />
            <span>Your knowledge, connected</span>
          </div>
          <input
            aria-label="Search graph"
            placeholder="Find a note, document or tag…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <select
            aria-label="Graph folder"
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value);
            }}
          >
            <option value="">All folders</option>
            {[
              ...new Set(
                data.nodes
                  .filter((n) => n.path.includes('/'))
                  .map((n) => n.path.split('/')[0] ?? ''),
              ),
            ]
              .sort()
              .map((path) => (
                <option key={path}>{path}</option>
              ))}
          </select>
          <select
            aria-label="Graph file types"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
            }}
          >
            <option value="all">Notes and documents</option>
            <option value="note">Notes only</option>
            <option value="document">Documents only</option>
          </select>
          <select
            aria-label="Filter graph by tag"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
            }}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
          {focus && (
            <label className="graph-check">
              <input
                type="checkbox"
                checked={local}
                onChange={(e) => {
                  setLocal(e.target.checked);
                }}
              />
              Local graph
            </label>
          )}
          <button
            type="button"
            className="quiet"
            aria-label="Graph appearance"
            aria-expanded={settings}
            onClick={() => {
              setSettings((v) => !v);
            }}
          >
            <Settings2 size={17} aria-hidden />
            Appearance
          </button>
        </div>
      )}
      <div className="graph-stage">
        <div className="graph-tools">
          {!options && (folder !== '' || kind !== 'all' || tag !== '' || query !== '') && (
            <span className="graph-filtered" title="Some files are hidden by the options">
              Filtered
            </span>
          )}
          <button
            type="button"
            className="quiet"
            title="Search, filters and appearance"
            aria-label="Graph options"
            aria-expanded={options}
            onClick={() => {
              setOptions((v) => !v);
            }}
          >
            <SlidersHorizontal size={17} aria-hidden />
          </button>
          <button
            type="button"
            className="quiet"
            title="Fit graph"
            aria-label="Fit graph"
            onClick={() => {
              setFit((n) => n + 1);
            }}
          >
            <Maximize size={17} aria-hidden />
          </button>
          <button
            type="button"
            className="quiet"
            title="Refresh graph"
            aria-label="Refresh graph"
            onClick={() => {
              setLoading(true);
              setRefresh((n) => n + 1);
            }}
          >
            <RefreshCw size={17} aria-hidden />
          </button>
        </div>
        <GraphCanvas
          model={model}
          style={style}
          fit={fit}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
          }}
          onOpen={(path) => void ctx.app.open(path)}
        />
        <div className="graph-corner" role="status">
          {loading
            ? 'Reading your vault…'
            : `${String(model.nodes.length)} nodes · ${String(model.edges.length)} connections`}
        </div>
        {!loading && model.nodes.length === 0 && (
          <div className="graph-empty">
            No matching connections yet.
            <br />
            <span>
              Add notes and documents, link them with [[wiki links]], or give them a shared tag.
            </span>
          </div>
        )}
        {settings && (
          <aside className="graph-settings" aria-label="Graph appearance settings">
            <h2>Make it yours</h2>
            <div className="graph-presets">
              <button
                type="button"
                onClick={() => {
                  update({
                    palette: 'aurora',
                    glow: true,
                    size: 4,
                    opacity: 0.2,
                    spacing: 160,
                    labels: true,
                  });
                }}
              >
                Constellation
              </button>
              <button
                type="button"
                onClick={() => {
                  update({
                    palette: 'theme',
                    glow: false,
                    size: 5,
                    opacity: 0.35,
                    spacing: 140,
                    labels: true,
                  });
                }}
              >
                Research map
              </button>
              <button
                type="button"
                onClick={() => {
                  update({
                    palette: 'violet',
                    glow: false,
                    size: 3,
                    opacity: 0.15,
                    spacing: 180,
                    labels: false,
                  });
                }}
              >
                Minimal
              </button>
            </div>
            <label>
              Atmosphere
              <select
                value={style.palette}
                onChange={(e) => {
                  update({ palette: e.target.value as GraphStyle['palette'] });
                }}
              >
                <option value="aurora">Aurora · cyan and rose</option>
                <option value="ember">Ember · amber and coral</option>
                <option value="violet">Nebula · violet and mint</option>
                <option value="theme">Match app theme</option>
              </select>
            </label>
            <label>
              Colour groups by
              <select
                value={style.colourBy}
                onChange={(e) => {
                  update({ colourBy: e.target.value as GraphStyle['colourBy'] });
                }}
              >
                <option value="notebook">Notebook</option>
                <option value="kind">Notes and documents</option>
                <option value="tag">First tag</option>
              </select>
            </label>
            <label>
              Node size
              <input
                type="range"
                min="2"
                max="12"
                value={style.size}
                onChange={(e) => {
                  update({ size: Number(e.target.value) });
                }}
              />
            </label>
            <label>
              Spacing
              <input
                type="range"
                min="40"
                max="240"
                value={style.spacing}
                onChange={(e) => {
                  update({ spacing: Number(e.target.value) });
                }}
              />
            </label>
            <label>
              Connection brightness
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={style.opacity}
                onChange={(e) => {
                  update({ opacity: Number(e.target.value) });
                }}
              />
            </label>
            {(
              [
                ['labels', 'Show labels'],
                ['tags', 'Connect shared tags'],
                ['orphans', 'Show unconnected files'],
                ['glow', 'Node glow'],
              ] as const
            ).map(([key, label]) => (
              <label className="graph-check" key={key}>
                <input
                  type="checkbox"
                  checked={style[key]}
                  onChange={(e) => {
                    update({ [key]: e.target.checked });
                  }}
                />
                {label}
              </label>
            ))}
            <h3>Motion</h3>
            {(
              [
                ['live', 'Moving layout'],
                ['motion', 'Signals along links'],
                ['focus', 'Smooth focus on a note'],
                ['entrance', 'Grow in, and glide to a note'],
              ] as const
            ).map(([key, label]) => (
              <label className="graph-check" key={key}>
                <input
                  type="checkbox"
                  checked={style[key]}
                  onChange={(e) => {
                    update({ [key]: e.target.checked });
                  }}
                />
                {label}
              </label>
            ))}
            <label>
              Speed
              <input
                type="range"
                min="0.25"
                max="3"
                step="0.25"
                value={style.speed}
                onChange={(e) => {
                  update({ speed: Number(e.target.value) });
                }}
              />
            </label>
            <p>Motion follows your device’s reduced-motion preference.</p>
            <h3>Your looks</h3>
            {presets.length === 0 ? (
              <p>Save a look to come back to it.</p>
            ) : (
              <ul className="graph-saved" aria-label="Saved looks">
                {presets.map((p) => (
                  <li key={p.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setStyle(p.style);
                      }}
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      className="quiet"
                      aria-label={`Remove ${p.name}`}
                      title="Remove"
                      onClick={() => {
                        setPresets((all) => all.filter((x) => x.name !== p.name));
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="graph-kept" role="status">
              {kept ? 'Your options are saved as you change them.' : ''}
            </p>
            <div className="graph-setting-actions">
              <button type="button" onClick={() => void savePreset()}>
                Save this look
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setStyle(DEFAULT_STYLE);
                }}
              >
                Reset
              </button>
            </div>
          </aside>
        )}
        {current && (
          <div className="graph-selection">
            <span className="graph-selection-title">{current.title}</span>
            <small>{current.path ?? 'Shared tag'}</small>
            <div>
              {current.path ? (
                <button
                  type="button"
                  onClick={() => {
                    if (current.path) void ctx.app.open(current.path);
                  }}
                >
                  Open file
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTag(current.title.slice(1));
                  }}
                >
                  Explore tag
                </button>
              )}
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setSelected(null);
                }}
              >
                Clear selection
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="graph-footer">
        <span>Drag to explore · scroll or pinch to zoom · double-click a file to open</span>
        <span>● Notes&nbsp; ◆ Documents&nbsp; # Tags</span>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {data.warnings.length > 0 && (
        <p className="hint" role="status">
          Some files could not be read: {data.warnings.join(', ')}. Their nodes are still shown.
        </p>
      )}
      <details className="graph-files">
        <summary>Browse files ({model.nodes.filter((n) => n.path).length})</summary>
        <ul>
          {model.nodes
            .filter((n) => n.path)
            .map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setSelected(n.id);
                  }}
                >
                  {n.title}
                </button>
                <span>{n.path}</span>
                <button
                  type="button"
                  className="quiet"
                  aria-label={`Open ${n.title}`}
                  onClick={() => {
                    if (n.path) void ctx.app.open(n.path);
                  }}
                >
                  Open
                </button>
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
