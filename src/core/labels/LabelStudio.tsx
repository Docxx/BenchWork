import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Plus,
  Printer,
  Save,
  Upload,
  Download,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Bluetooth,
} from 'lucide-react';
import {
  feedSize,
  labelBatches,
  labelText,
  newLabelDesign,
  newLabelOnPaper,
  newLabelElement,
  parseLabelDesign,
  type LabelDesign,
  type LabelElement,
  type LabelKind,
  type LabelRow,
} from './model';
import { renderFeed, renderLabel } from './render';
import { LabelPrinter } from './printer';
import { usePrinterConnection } from './usePrinterConnection';
import type { LabelBluetoothDevice, LabelBluetoothTransport } from '../platform/labelBluetooth';
import type { LabelWorkspace } from './workspace';
import './labels.css';
export interface LabelStudioProps {
  workspace: LabelWorkspace;
  transport: LabelBluetoothTransport | null;
  standalone?: boolean;
}
const today = () => new Date().toLocaleDateString('en-GB');
const seed = (): LabelRow => ({ name: 'Sample name', id: 'SAMPLE-001', date: today() });
const kinds: readonly LabelKind[] = ['text', 'qr', 'barcode', 'image', 'box', 'line'];
const kindName = (kind: LabelKind) =>
  ({ text: 'Text', qr: 'QR code', barcode: 'Barcode', image: 'Image', box: 'Box', line: 'Line' })[
    kind
  ];
function download(name: string, content: string, type: string) {
  if (window.BenchWorkAndroid?.shareLabelTemplate) {
    const response: unknown = JSON.parse(window.BenchWorkAndroid.shareLabelTemplate(name, content));
    if (typeof response === 'object' && response !== null && 'error' in response)
      throw new Error(String(response.error));
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10000);
}
function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
export function LabelStudio({ workspace, transport, standalone = false }: LabelStudioProps) {
  const [design, setDesign] = useState(newLabelDesign);
  const [selected, setSelected] = useState<string | null>(null);
  const [templates, setTemplates] = useState<LabelDesign[]>([]);
  const [row, setRow] = useState<LabelRow>(seed);
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [records, setRecords] = useState<LabelRow[]>([]);
  const [copies, setCopies] = useState(2);
  const [start, setStart] = useState(1);
  const [preview, setPreview] = useState('');
  const [artwork, setArtwork] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [devices, setDevices] = useState<LabelBluetoothDevice[]>([]);
  const [device, setDevice] = useState('');
  const [tab, setTab] = useState<'design' | 'library' | 'batch' | 'printer'>('design');
  const [search, setSearch] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState('');
  const [dataIndex, setDataIndex] = useState(0);
  const printer = useMemo(() => new LabelPrinter(transport), [transport]);
  const connection = usePrinterConnection(printer, transport !== null, busy);
  const { connected, connecting, name: printerName } = connection;
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    fromX: number;
    fromY: number;
    width: number;
    height: number;
    elementWidth: number;
    elementHeight: number;
    size: number;
    resize: boolean;
  } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const active = design.elements.find((e) => e.id === selected);
  const shown = rows.length ? { ...row, ...rows[dataIndex] } : row;
  const total = rows.length || copies;
  const feeds = Math.ceil(total / design.perFeed);
  const fields = Array.from(new Set([...Object.keys(row), ...Object.keys(shown)])).slice(0, 24);
  useEffect(() => {
    let live = true;
    void workspace
      .list()
      .then((found) => {
        if (live) {
          setTemplates(found);
          const last = [...found].reverse().find((d) => d.savedAs !== 'printed') ?? found.at(-1);
          if (standalone && last) setDesign(structuredClone(last));
        }
      })
      .catch((err: unknown) => {
        if (live) setError(errorText(err));
      });
    return () => {
      live = false;
    };
  }, [workspace, standalone]);
  useEffect(() => {
    let live = true;
    const sample = Array.from(
      { length: rows.length ? design.perFeed : Math.min(design.perFeed, copies) },
      (_, i) =>
        rows.length ? (rows[dataIndex + i] ? { ...row, ...rows[dataIndex + i] } : undefined) : row,
    ).filter((r): r is LabelRow => r !== undefined);
    void Promise.all([
      renderFeed(design, sample, start + dataIndex),
      renderLabel(design, rows.length ? { ...row, ...rows[dataIndex] } : row, start + dataIndex),
    ])
      .then(([c, label]) => {
        if (live) {
          setPreview(c.toDataURL());
          setArtwork(label.toDataURL());
          setPreviewError('');
        }
      })
      .catch((err: unknown) => {
        if (live) setPreviewError(errorText(err));
      });
    return () => {
      live = false;
    };
  }, [design, row, rows, start, dataIndex, copies]);
  useEffect(() => {
    const refresh = () => {
      setRow((r) => ({ ...r }));
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (confirm && !dialog.current?.open) dialog.current?.showModal();
    if (!confirm) dialog.current?.close();
  }, [confirm]);
  const act = async (run: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await run();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  function change(patch: Partial<LabelDesign>) {
    setDesign((d) => ({ ...d, ...patch }));
  }
  function edit(patch: Partial<LabelElement>) {
    setDesign((d) => ({
      ...d,
      elements: d.elements.map((e) => (e.id === selected ? { ...e, ...patch } : e)),
    }));
  }
  function add(kind: LabelKind) {
    if (kind === 'image') {
      imageInput.current?.click();
      return;
    }
    const e = { ...newLabelElement(kind), ...(kind === 'text' ? { text: 'Your text' } : {}) };
    change({ elements: [...design.elements, e] });
    setSelected(e.id);
  }
  async function importTemplate(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    await act(async () => {
      if (f.size > 5 * 1024 * 1024) throw new Error('Label files must be below 5 MB.');
      const imported = parseLabelDesign(JSON.parse(await f.text()));
      setDesign({ ...imported, id: crypto.randomUUID(), name: `${imported.name} (imported)` });
      setSelected(null);
      setNotice('Template imported. Save it to add it to this library.');
    });
  }
  async function importRows(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    await act(async () => {
      if (f.size > 10 * 1024 * 1024) throw new Error('Choose a spreadsheet below 10 MB.');
      const XLSX = await import('xlsx');
      const book = XLSX.read(await f.arrayBuffer(), {
        type: 'array',
        raw: f.name.toLowerCase().endsWith('.csv'),
      });
      const sheet = book.Sheets[book.SheetNames[0] ?? ''];
      if (!sheet) throw new Error('No worksheet found.');
      const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });
      if (values.length > 500) throw new Error('Use at most 500 spreadsheet rows per job.');
      const mapped = values.map((r) =>
        Object.fromEntries(
          Object.entries(r)
            .slice(0, 100)
            .map(([k, v]) => [
              k.slice(0, 100),
              (v instanceof Date
                ? v.toISOString()
                : ['string', 'number', 'boolean'].includes(typeof v)
                  ? String(v)
                  : ''
              ).slice(0, 2000),
            ]),
        ),
      );
      if (!mapped.length)
        throw new Error(
          'The first worksheet has no data rows. Use column headings in the first row.',
        );
      setRows(mapped);
      setDataIndex(0);
      setNotice(`${String(mapped.length)} data rows loaded. Nothing has been printed.`);
    });
  }
  async function importImage(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    await act(async () => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024)
        throw new Error('Choose a PNG, JPEG or WebP image below 5 MB.');
      const bitmap = await createImageBitmap(f);
      try {
        const c = document.createElement('canvas');
        const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
        c.width = Math.round(bitmap.width * scale);
        c.height = Math.round(bitmap.height * scale);
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('Image drawing unavailable.');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bitmap, 0, 0, c.width, c.height);
        const image = c.toDataURL('image/png');
        if (image.length > 750000) throw new Error('Try a smaller image for this label.');
        const element = { ...newLabelElement('image'), width: 12, height: 10, image };
        change({ elements: [...design.elements, element] });
        setSelected(element.id);
      } finally {
        bitmap.close();
      }
    });
  }
  function moveElement(clientX: number, clientY: number) {
    const from = drag.current;
    if (!from) return;
    const dx = ((clientX - from.fromX) * design.width) / from.width;
    const dy = ((clientY - from.fromY) * design.height) / from.height;
    setDesign((d) => ({
      ...d,
      elements: d.elements.map((layer) => {
        if (layer.id !== from.id) return layer;
        if (!from.resize)
          return {
            ...layer,
            x: Math.round(Math.max(0, Math.min(d.width - layer.width, from.x + dx)) * 4) / 4,
            y: Math.round(Math.max(0, Math.min(d.height - layer.height, from.y + dy)) * 4) / 4,
          };
        const angle = (layer.rotation * Math.PI) / 180;
        const width = Math.max(
          0.5,
          Math.min(d.width, from.elementWidth + dx * Math.cos(angle) + dy * Math.sin(angle)),
        );
        const height = Math.max(
          0.5,
          Math.min(d.height, from.elementHeight - dx * Math.sin(angle) + dy * Math.cos(angle)),
        );
        return {
          ...layer,
          width,
          height,
          ...(layer.kind === 'text'
            ? { size: Math.max(0.8, Math.min(20, (from.size * height) / from.elementHeight)) }
            : {}),
        };
      }),
    }));
  }
  function moveLayer(delta: number) {
    if (!active) return;
    const elements = [...design.elements],
      index = elements.findIndex((e) => e.id === selected),
      to = Math.max(0, Math.min(elements.length - 1, index + delta));
    elements.splice(index, 1);
    elements.splice(to, 0, active);
    change({ elements });
  }
  let size = { width: design.width, height: design.height * design.perFeed };
  try {
    size = feedSize(design);
  } catch {
    /* Render displays the validation message. */
  }
  return (
    <div className={`label-studio ${standalone ? 'label-standalone' : ''}`}>
      <header className="label-header">
        <div>
          <span className="label-eyebrow">BENCHWORK · LABEL STUDIO</span>
          <h1>Make your mark.</h1>
          <p>Design once. Print a pair, a whole experiment or a box of samples.</p>
        </div>
        <div className="label-header-actions">
          <button
            disabled={busy}
            onClick={() => {
              setDesign(newLabelOnPaper(design));
              setTab('design');
              setSelected(null);
              setRows([]);
            }}
          >
            New label
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await workspace.save({
                  ...design,
                  savedAs: 'template',
                  savedAt: new Date().toISOString(),
                });
                setTemplates(await workspace.list());
                setNotice('Template saved.');
              })
            }
          >
            <Save size={16} />
            Save template
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="label-notice">
          {notice}
        </p>
      )}
      <nav className="label-tabs" aria-label="Label Studio views">
        {(['design', 'library', 'batch', 'printer'] as const).map((view) => (
          <button
            key={view}
            aria-pressed={tab === view}
            onClick={() => {
              setTab(view);
            }}
          >
            {
              {
                design: 'Design',
                library: 'Library',
                batch: 'Batch data',
                printer: 'Printer settings',
              }[view]
            }
          </button>
        ))}
      </nav>
      <fieldset disabled={busy} className={`label-editor label-view-${tab}`}>
        <aside className="label-controls" hidden={tab !== 'library' && tab !== 'printer'}>
          <section hidden={tab !== 'library'}>
            <h2>Templates and saved labels</h2>
            <label>
              Search saved labels
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
              />
            </label>
            <label>
              Show
              <select
                value={libraryFilter}
                onChange={(e) => {
                  setLibraryFilter(e.target.value);
                }}
              >
                <option value="all">All labels</option>
                <option value="templates">Templates</option>
                <option value="printed">Recent prints</option>
              </select>
            </label>
            <div className="label-library-grid">
              {[...templates]
                .reverse()
                .filter(
                  (d) =>
                    d.name.toLowerCase().includes(search.toLowerCase()) &&
                    (libraryFilter === 'all' ||
                      (libraryFilter === 'printed'
                        ? d.savedAs === 'printed'
                        : d.savedAs !== 'printed')),
                )
                .map((d) => (
                  <button
                    key={d.id}
                    className="label-library-card"
                    onClick={() => {
                      setDesign(structuredClone(d));
                      setSelected(null);
                      setRows([]);
                      setTab('design');
                    }}
                  >
                    <LabelThumbnail design={d} />
                    <strong>{d.name}</strong>
                    <span>
                      {d.width} × {d.height} mm ·{' '}
                      {d.savedAs === 'printed' ? 'Printed label' : 'Template'}
                    </span>
                  </button>
                ))}
            </div>
            {!!templates.length &&
              !templates.some(
                (d) =>
                  d.name.toLowerCase().includes(search.toLowerCase()) &&
                  (libraryFilter === 'all' ||
                    (libraryFilter === 'printed'
                      ? d.savedAs === 'printed'
                      : d.savedAs !== 'printed')),
              ) && <p>No labels match your search.</p>}
            {!templates.length && (
              <p>Save a template to find it here. Completed prints also appear here.</p>
            )}
            <label>
              Saved template
              <select
                aria-label="Saved label template"
                value=""
                onChange={(e) => {
                  const found = templates.find((d) => d.id === e.target.value);
                  if (found) {
                    setDesign(structuredClone(found));
                    setSelected(null);
                  }
                }}
              >
                <option value="">Choose a template</option>
                {templates.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="label-mini-actions">
              <label className="label-file-button">
                <Upload size={15} />
                Import template
                <input type="file" accept=".json" onChange={(e) => void importTemplate(e)} />
              </label>
              <button
                onClick={() => {
                  try {
                    download(
                      `${design.name.replace(/[^a-z0-9 _-]/gi, '') || 'label'}.label.json`,
                      JSON.stringify(design, null, 2),
                      'application/json',
                    );
                  } catch (err) {
                    setError(errorText(err));
                  }
                }}
              >
                <Download size={15} />
                Export template
              </button>
            </div>
            <p className="hint">
              Import and export the same label files between BenchWork and the phone app. Save keeps
              this template in the current library.
            </p>
          </section>
          <section hidden={tab !== 'printer'}>
            <h2>Paper and calibration</h2>
            <div className="label-two">
              <NumberField
                label="Label width (mm)"
                value={design.width}
                min={5}
                max={72}
                onChange={(width) => {
                  change({ width });
                }}
              />
              <NumberField
                label="Label height (mm)"
                value={design.height}
                min={5}
                max={150}
                onChange={(height) => {
                  change({ height });
                }}
              />
            </div>
            <label>
              Labels per feed
              <select
                value={design.perFeed}
                onChange={(e) => {
                  change({ perFeed: Number(e.target.value) === 1 ? 1 : 2 });
                }}
              >
                <option value={1}>One</option>
                <option value={2}>Two</option>
              </select>
            </label>
            <label>
              Arrangement
              <select
                value={design.layout}
                onChange={(e) => {
                  change({ layout: e.target.value === 'across' ? 'across' : 'stacked' });
                }}
              >
                <option value="stacked">Stacked along the feed</option>
                <option value="across">Side by side across the roll</option>
              </select>
            </label>
            <NumberField
              label="Internal gap (mm)"
              value={design.gap}
              min={0}
              max={10}
              step={0.25}
              onChange={(gap) => {
                change({ gap });
              }}
            />
            <div className="label-two">
              <NumberField
                label="Horizontal offset (mm)"
                value={design.offsetX}
                min={-10}
                max={10}
                step={0.25}
                onChange={(offsetX) => {
                  change({ offsetX });
                }}
              />
              <NumberField
                label="Vertical offset (mm)"
                value={design.offsetY}
                min={-10}
                max={10}
                step={0.25}
                onChange={(offsetY) => {
                  change({ offsetY });
                }}
              />
            </div>
            <NumberField
              label="Print density"
              value={design.density}
              min={1}
              max={5}
              onChange={(density) => {
                change({ density: Math.round(density) });
              }}
            />
            <NumberField
              label="Black threshold"
              value={design.threshold}
              min={1}
              max={254}
              onChange={(threshold) => {
                change({ threshold: Math.round(threshold) });
              }}
            />
            <p className="hint">
              Positive offsets move artwork right or down. B3S starting profile: 50 × 15 mm, two
              stacked, gap 0, vertical offset −0.75 mm.
            </p>
          </section>
        </aside>
        <main className="label-stage" hidden={tab === 'library' || tab === 'printer'}>
          <div hidden={tab !== 'design'}>
            {' '}
            <label>
              Template name
              <input
                value={design.name}
                maxLength={100}
                onChange={(e) => {
                  change({ name: e.target.value });
                }}
              />
            </label>
            <div className="label-toolbar">
              {(['text', 'image'] as const).map((kind) => (
                <button
                  key={kind}
                  disabled={design.elements.length >= 100}
                  onClick={() => {
                    add(kind);
                  }}
                >
                  <Plus size={14} />
                  {kindName(kind)}
                </button>
              ))}
              <button
                disabled={design.elements.length >= 100}
                onClick={() => {
                  const element = {
                    ...newLabelElement('text'),
                    text: '{today}',
                    y: Math.max(0, Math.min(design.height - 4, 8)),
                    width: 22,
                    height: 4,
                    size: 2,
                  };
                  change({ elements: [...design.elements, element] });
                  setSelected(element.id);
                }}
              >
                <Plus size={14} />
                Date
              </button>
              <details className="label-more">
                <summary>More elements</summary>
                <div className="label-mini-actions">
                  {kinds
                    .filter((kind) => kind !== 'text' && kind !== 'image')
                    .map((kind) => (
                      <button
                        key={kind}
                        disabled={design.elements.length >= 100}
                        onClick={() => {
                          add(kind);
                        }}
                      >
                        {kindName(kind)}
                      </button>
                    ))}
                </div>
              </details>
              <input
                ref={imageInput}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void importImage(e)}
              />
            </div>
            <div className="label-canvas-area">
              <div className="label-paper-caption">
                {design.width} × {design.height} mm · drag to move · blue corner to resize
              </div>
              <svg
                className="label-layout"
                style={{ pointerEvents: busy ? 'none' : undefined }}
                viewBox={`0 0 ${String(design.width)} ${String(design.height)}`}
                role="img"
                aria-label="Label design canvas"
              >
                <rect width={design.width} height={design.height} fill="white" />
                {artwork && (
                  <image
                    href={artwork}
                    width={design.width}
                    height={design.height}
                    pointerEvents="none"
                  />
                )}
                {design.elements.map((element) => (
                  <g
                    key={element.id}
                    transform={`translate(${String(element.x)} ${String(element.y)}) rotate(${String(element.rotation)})`}
                  >
                    <rect
                      width={element.width}
                      height={element.height}
                      fill={selected === element.id ? '#1284ff18' : 'transparent'}
                      stroke={selected === element.id ? '#1284ff' : '#91a7b344'}
                      strokeWidth={0.15}
                      tabIndex={0}
                      role="button"
                      aria-label={`Select ${kindName(element.kind)}: ${element.text.slice(0, 40)}`}
                      onClick={() => {
                        setSelected(element.id);
                      }}
                      onKeyDown={(e) => {
                        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                          e.preventDefault();
                          setSelected(element.id);
                          const delta = e.shiftKey ? 1 : 0.25;
                          setDesign((d) => ({
                            ...d,
                            elements: d.elements.map((layer) =>
                              layer.id !== element.id
                                ? layer
                                : {
                                    ...layer,
                                    x: Math.max(
                                      0,
                                      Math.min(
                                        d.width - layer.width,
                                        layer.x +
                                          (e.key === 'ArrowRight'
                                            ? delta
                                            : e.key === 'ArrowLeft'
                                              ? -delta
                                              : 0),
                                      ),
                                    ),
                                    y: Math.max(
                                      0,
                                      Math.min(
                                        d.height - layer.height,
                                        layer.y +
                                          (e.key === 'ArrowDown'
                                            ? delta
                                            : e.key === 'ArrowUp'
                                              ? -delta
                                              : 0),
                                      ),
                                    ),
                                  },
                            ),
                          }));
                        }
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(element.id);
                        }
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        setSelected(element.id);
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (box)
                          drag.current = {
                            id: element.id,
                            x: element.x,
                            y: element.y,
                            fromX: e.clientX,
                            fromY: e.clientY,
                            width: box.width,
                            height: box.height,
                            elementWidth: element.width,
                            elementHeight: element.height,
                            size: element.size,
                            resize: false,
                          };
                      }}
                      onPointerMove={(e) => {
                        moveElement(e.clientX, e.clientY);
                      }}
                      onPointerUp={() => {
                        drag.current = null;
                      }}
                      onLostPointerCapture={() => {
                        drag.current = null;
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                    />
                    {selected === element.id && (
                      <rect
                        className="label-resize-handle"
                        role="button"
                        aria-label="Resize selected element"
                        tabIndex={0}
                        x={element.width - 2}
                        y={element.height - 2}
                        width={4}
                        height={4}
                        rx={0.35}
                        fill="#1284ff"
                        stroke="white"
                        strokeWidth={0.2}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                          if (box)
                            drag.current = {
                              id: element.id,
                              x: element.x,
                              y: element.y,
                              fromX: e.clientX,
                              fromY: e.clientY,
                              width: box.width,
                              height: box.height,
                              elementWidth: element.width,
                              elementHeight: element.height,
                              size: element.size,
                              resize: true,
                            };
                        }}
                        onPointerMove={(e) => {
                          moveElement(e.clientX, e.clientY);
                        }}
                        onPointerUp={() => {
                          drag.current = null;
                        }}
                        onLostPointerCapture={() => {
                          drag.current = null;
                        }}
                        onPointerCancel={() => {
                          drag.current = null;
                        }}
                        onKeyDown={(e) => {
                          const delta = e.shiftKey ? 1 : 0.25;
                          if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                            e.preventDefault();
                            edit({
                              width: Math.max(
                                0.2,
                                Math.min(
                                  design.width,
                                  element.width +
                                    (e.key === 'ArrowRight'
                                      ? delta
                                      : e.key === 'ArrowLeft'
                                        ? -delta
                                        : 0),
                                ),
                              ),
                              height: Math.max(
                                0.2,
                                Math.min(
                                  design.height,
                                  element.height +
                                    (e.key === 'ArrowDown'
                                      ? delta
                                      : e.key === 'ArrowUp'
                                        ? -delta
                                        : 0),
                                ),
                              ),
                            });
                          }
                        }}
                      />
                    )}
                  </g>
                ))}
              </svg>
              <details className="label-print-preview">
                <summary>Print preview</summary>
                <p className="hint">
                  This includes the paper layout and calibration. The element boxes above are
                  editing guides.
                </p>
                {previewError ? (
                  <p role="alert">{previewError}</p>
                ) : (
                  preview && (
                    <img
                      src={preview}
                      alt="Actual monochrome label print preview"
                      style={{ aspectRatio: `${String(size.width)} / ${String(size.height)}` }}
                    />
                  )
                )}
              </details>
            </div>
            {fields.some((key) => design.elements.some((e) => e.text.includes(`{${key}}`))) && (
              <section>
                <h2>Label text</h2>
                <div className="label-two">
                  {fields
                    .filter((key) => design.elements.some((e) => e.text.includes(`{${key}}`)))
                    .map((key) => (
                      <label key={key}>
                        {key}
                        <input
                          value={shown[key] ?? ''}
                          disabled={rows.length > 0}
                          onChange={(e) => {
                            setRow((r) => ({ ...r, [key]: e.target.value }));
                          }}
                        />
                      </label>
                    ))}
                </div>
              </section>
            )}
          </div>
          <section className="label-data" hidden={tab !== 'batch'}>
            <h2>Label data</h2>
            <p className="hint">
              Use fields such as {'{name}'}, {'{id}'}, {'{date}'} and {'{n}'} in text, QR codes and
              barcodes.
            </p>
            <div className="label-two">
              {fields.map((key) => (
                <label key={key}>
                  {key}
                  <input
                    value={shown[key] ?? ''}
                    disabled={rows.length > 0}
                    onChange={(e) => {
                      setRow((r) => ({ ...r, [key]: e.target.value }));
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="label-mini-actions">
              <label className="label-file-button">
                <Upload size={15} />
                CSV or Excel batch
                <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void importRows(e)} />
              </label>
              {workspace.records && (
                <button
                  onClick={() =>
                    void act(async () => {
                      const found = (await workspace.records?.()) ?? [];
                      setRecords(found);
                      setNotice(`${String(found.length)} BenchWork records available.`);
                    })
                  }
                >
                  Load BenchWork records
                </button>
              )}
              {rows.length > 0 && (
                <button
                  onClick={() => {
                    setRows([]);
                    setDataIndex(0);
                  }}
                >
                  Clear batch
                </button>
              )}
            </div>
            {records.length > 0 && (
              <label>
                BenchWork item
                <select
                  aria-label="BenchWork label item"
                  value=""
                  onChange={(e) => {
                    const found = records[Number(e.target.value)];
                    if (found) {
                      setRow(found);
                      setRows([]);
                    }
                  }}
                >
                  <option value="">Choose one record</option>
                  {records.map((r, i) => (
                    <option key={i} value={i}>
                      {r['name']} · {r['id']}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {records.length > 0 && (
              <button
                onClick={() => {
                  setRows(records);
                  setDataIndex(0);
                }}
              >
                Use all loaded records as a batch
              </button>
            )}
            {rows.length > 0 && (
              <label>
                Preview batch row
                <select
                  value={dataIndex}
                  onChange={(e) => {
                    setDataIndex(Number(e.target.value));
                  }}
                >
                  {rows.map((r, i) => (
                    <option value={i} key={i}>
                      {i + 1} · {r['name'] ?? r['id'] ?? Object.values(r)[0]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="label-two">
              <NumberField
                label="Sequence starts at"
                value={start}
                min={0}
                max={999999}
                onChange={(v) => {
                  setStart(Math.round(v));
                }}
              />
            </div>
          </section>
        </main>
        <aside className="label-inspector" hidden={tab !== 'design'}>
          <section>
            <h2>Elements</h2>
            <div className="label-layer-list">
              {design.elements.map((element, i) => (
                <button
                  key={element.id}
                  aria-pressed={selected === element.id}
                  onClick={() => {
                    setSelected(element.id);
                  }}
                >
                  {i + 1}. {kindName(element.kind)} {element.text.slice(0, 25)}
                </button>
              ))}
            </div>
          </section>
          {active && (
            <section>
              <h2>{kindName(active.kind)} properties</h2>
              {active.kind === 'text' && (
                <label className="label-check">
                  <input
                    type="checkbox"
                    checked={active.text === '{today}'}
                    onChange={(e) => {
                      edit({ text: e.target.checked ? '{today}' : today() });
                    }}
                  />
                  Always use today's date
                </label>
              )}
              {['text', 'qr', 'barcode'].includes(active.kind) && (
                <label>
                  Content
                  <textarea
                    rows={3}
                    value={active.text === '{today}' ? today() : active.text}
                    disabled={active.text === '{today}'}
                    onChange={(e) => {
                      edit({ text: e.target.value });
                    }}
                  />
                </label>
              )}
              <div className="label-two">
                <NumberField
                  label="Width (mm)"
                  value={active.width}
                  min={0.2}
                  max={design.width}
                  step={0.25}
                  onChange={(width) => {
                    edit({ width });
                  }}
                />
                <NumberField
                  label="Height (mm)"
                  value={active.height}
                  min={0.2}
                  max={design.height}
                  step={0.25}
                  onChange={(height) => {
                    edit({ height });
                  }}
                />
              </div>
              <details>
                <summary>Position and rotation</summary>
                <div className="label-two">
                  <NumberField
                    label="X (mm)"
                    value={active.x}
                    min={0}
                    max={design.width}
                    step={0.25}
                    onChange={(x) => {
                      edit({ x });
                    }}
                  />
                  <NumberField
                    label="Y (mm)"
                    value={active.y}
                    min={0}
                    max={design.height}
                    step={0.25}
                    onChange={(y) => {
                      edit({ y });
                    }}
                  />
                </div>{' '}
                <label>
                  Rotation
                  <select
                    value={active.rotation}
                    onChange={(e) => {
                      edit({ rotation: Number(e.target.value) as LabelElement['rotation'] });
                    }}
                  >
                    {[0, 90, 180, 270].map((v) => (
                      <option value={v} key={v}>
                        {v}°
                      </option>
                    ))}
                  </select>
                </label>
              </details>
              {active.kind === 'text' && (
                <>
                  <NumberField
                    label="Text size (mm)"
                    value={active.size}
                    min={0.8}
                    max={20}
                    step={0.1}
                    onChange={(size) => {
                      edit({ size });
                    }}
                  />
                  <label>
                    Font
                    <select
                      value={active.font}
                      onChange={(e) => {
                        edit({ font: e.target.value as LabelElement['font'] });
                      }}
                    >
                      <option value="sans">Sans serif</option>
                      <option value="serif">Serif</option>
                      <option value="mono">Monospace</option>
                    </select>
                  </label>
                  <label>
                    Alignment
                    <select
                      value={active.align}
                      onChange={(e) => {
                        edit({ align: e.target.value as LabelElement['align'] });
                      }}
                    >
                      <option value="left">Left</option>
                      <option value="center">Centre</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label className="label-check">
                    <input
                      type="checkbox"
                      checked={active.bold}
                      onChange={(e) => {
                        edit({ bold: e.target.checked });
                      }}
                    />
                    Bold
                  </label>
                </>
              )}
              <div className="label-mini-actions">
                <button
                  aria-label="Duplicate label element"
                  onClick={() => {
                    const clone = {
                      ...active,
                      id: crypto.randomUUID(),
                      x: Math.min(design.width - active.width, active.x + 1),
                      y: Math.min(design.height - active.height, active.y + 1),
                    };
                    change({ elements: [...design.elements, clone] });
                    setSelected(clone.id);
                  }}
                >
                  <Copy size={15} />
                </button>
                <button
                  aria-label="Move layer up"
                  onClick={() => {
                    moveLayer(1);
                  }}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  aria-label="Move layer down"
                  onClick={() => {
                    moveLayer(-1);
                  }}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  aria-label="Delete label element"
                  onClick={() => {
                    change({ elements: design.elements.filter((e) => e.id !== selected) });
                    setSelected(null);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </section>
          )}
        </aside>
      </fieldset>
      <section className="label-printer-panel">
        <div>
          <h2>
            <Bluetooth size={18} />
            NIIMBOT B3S
          </h2>
          <p>{printerName}</p>
        </div>
        <div className="label-mini-actions" hidden={tab !== 'printer'}>
          <button
            disabled={busy || connecting}
            onClick={() =>
              void act(async () => {
                const found = await printer.scan();
                setDevices(found);
                setDevice(found[0]?.id ?? '');
                if (found.length === 1 && found[0] && connection.autoConnect)
                  await connection.connect(found[0].id);
                if (!found.length)
                  setNotice('No B3S found. Turn it on, keep it nearby and close the NIIMBOT app.');
              })
            }
          >
            Search printers
          </button>
          <select
            aria-label="Label printer"
            value={device}
            disabled={busy || connecting}
            onChange={(e) => {
              setDevice(e.target.value);
            }}
          >
            <option value="">Choose a printer</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.transport}
              </option>
            ))}
          </select>
          <button
            disabled={busy || connecting || !device}
            onClick={() =>
              void act(async () => {
                await connection.connect(device);
              })
            }
          >
            Connect
          </button>
          {connected && (
            <button
              disabled={busy || connecting}
              onClick={() =>
                void act(async () => {
                  await connection.disconnect();
                })
              }
            >
              Disconnect
            </button>
          )}
        </div>
        <label className="label-check" hidden={tab !== 'printer'}>
          <input
            type="checkbox"
            checked={connection.autoConnect}
            onChange={(e) => {
              connection.setAuto(e.target.checked);
            }}
          />
          Auto-connect to last printer
        </label>
        {!transport && tab === 'printer' && (
          <p>
            Browser Bluetooth needs you to click Connect. Automatic reconnection is available in the
            installed apps.
          </p>
        )}
        <button
          hidden={tab === 'printer'}
          onClick={() => {
            setTab('printer');
          }}
        >
          Manage printer
        </button>
        <NumberField
          label="Copies (without batch)"
          value={copies}
          min={1}
          max={500}
          onChange={(v) => {
            setCopies(Math.round(v));
          }}
        />
        <button
          className="label-print-button"
          disabled={busy || connecting || !connected || !!previewError}
          onClick={() => {
            try {
              labelBatches(rows, copies, design.perFeed);
              feedSize(design);
              setConfirm(true);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <Printer size={18} />
          Review {total} labels
        </button>
        {busy && progress && (
          <button
            onClick={() => {
              printer.stop();
              setProgress('Stopping after the current feed position…');
            }}
          >
            Stop after current pair
          </button>
        )}
        {progress && <p role="status">{progress}</p>}
      </section>
      <dialog
        ref={dialog}
        className="label-confirm"
        aria-label="Review label print job"
        onCancel={(e) => {
          e.preventDefault();
          setConfirm(false);
        }}
      >
        <h2>Print {total} labels?</h2>
        <p>
          {feeds} feed position{feeds === 1 ? '' : 's'} · {design.width} × {design.height} mm ·{' '}
          {design.perFeed} per feed
        </p>
        {total % design.perFeed !== 0 && (
          <p>One spare label will be left blank on the final feed.</p>
        )}
        {preview && <img src={preview} alt="Print job preview" />}
        <p>
          Check that this roll matches the preview. If a job is interrupted, check the paper before
          printing again.
        </p>
        <div className="label-mini-actions">
          <button
            onClick={() => {
              setConfirm(false);
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setConfirm(false);
              setProgress('Preparing print job…');
              void act(async () => {
                await printer.print(
                  design,
                  rows.length
                    ? rows.map((r) => ({ ...row, ...r }))
                    : Array.from({ length: copies }, () => row),
                  copies,
                  start,
                  (done, count) => {
                    setProgress(
                      `Sent ${String(done)} of ${String(count)} feed positions; waiting for the printer.`,
                    );
                  },
                );
                setProgress('Printer acknowledged completion.');
                try {
                  const printed = {
                    ...design,
                    id: crypto.randomUUID(),
                    savedAs: 'printed' as const,
                    savedAt: new Date().toISOString(),
                    name: `${design.name} · ${new Date().toLocaleString('en-GB')}`,
                    elements: design.elements.map((e) => ({
                      ...e,
                      text: labelText(e.text, rows.length ? { ...row, ...rows[0] } : row, start),
                    })),
                  };
                  await workspace.save(printed);
                  setTemplates(await workspace.list());
                } catch {
                  setError(
                    'Labels printed successfully, but the recent label could not be saved. Save your template separately.',
                  );
                }

                setNotice('Print job completed.');
              });
            }}
          >
            Print now
          </button>
        </div>
      </dialog>
    </div>
  );
}
function LabelThumbnail({ design }: { design: LabelDesign }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    void renderLabel(design, seed(), 1)
      .then((c) => {
        if (live) setSrc(c.toDataURL());
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [design]);
  return src ? (
    <img src={src} alt={`Preview of ${design.name}`} />
  ) : (
    <span className="label-thumbnail-empty">Label preview</span>
  );
}
function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value === '') return;
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
