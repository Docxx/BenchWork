import { ArrowUpRight, Asterisk, Navigation, ScanSearch, Type, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { CHANNEL_COLOURS, type Corner, type MarkKind, type Panel } from './model';

const ICON = { size: 16, strokeWidth: 1.8, 'aria-hidden': true } as const;

const KINDS: { kind: MarkKind; label: string; icon: ReactNode }[] = [
  { kind: 'arrow', label: 'Arrow', icon: <ArrowUpRight {...ICON} /> },
  { kind: 'arrowhead', label: 'Arrowhead', icon: <Navigation {...ICON} /> },
  { kind: 'star', label: 'Asterisk', icon: <Asterisk {...ICON} /> },
  { kind: 'text', label: 'Text', icon: <Type {...ICON} /> },
];

const COLOURS = [...CHANNEL_COLOURS, { name: 'Black', value: '#000000' }];

const CORNERS: { value: Corner; label: string }[] = [
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
];

function Swatches({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="fig-swatches" role="group" aria-label={label}>
      {COLOURS.map((c) => (
        <button
          key={c.value}
          type="button"
          className="colour-chip"
          title={c.name}
          aria-label={c.name}
          aria-pressed={value === c.value}
          style={{ background: c.value }}
          onClick={() => {
            onPick(c.value);
          }}
        />
      ))}
    </div>
  );
}

/**
 * Marks for one panel: choose a kind, then press the panel where it should
 * point. A chosen mark can be recoloured, sized, turned or removed, and
 * dragged on the panel. And a zoomed inset: draw its region on the panel.
 */
export function MarkControls({
  panel,
  tool,
  selectedMark,
  onTool,
  onSelectMark,
  onChange,
}: {
  panel: Panel;
  tool: 'move' | MarkKind | 'inset';
  selectedMark: string | null;
  onTool: (t: 'move' | MarkKind | 'inset') => void;
  onSelectMark: (id: string | null) => void;
  onChange: (p: Panel) => void;
}) {
  const mark = panel.marks.find((m) => m.id === selectedMark);
  const setMark = (change: Partial<NonNullable<typeof mark>>) => {
    if (!mark) return;
    onChange({
      ...panel,
      marks: panel.marks.map((m) => (m.id === mark.id ? { ...m, ...change } : m)),
    });
  };
  const inset = panel.inset;
  return (
    <>
      <fieldset className="fig-marks">
        <legend>Point things out</legend>
        <div className="tool-group" role="group" aria-label="Add a mark">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className="tool"
              title={`${k.label}: then press the panel where it should point`}
              aria-label={k.label}
              aria-pressed={tool === k.kind}
              onClick={() => {
                onTool(tool === k.kind ? 'move' : k.kind);
              }}
            >
              {k.icon}
            </button>
          ))}
        </div>
        {tool !== 'move' && tool !== 'inset' && (
          <p className="hint" role="status">
            Press the panel where it should point.
          </p>
        )}
        {panel.marks.length > 0 && (
          <ul className="fig-mark-list" aria-label="Marks">
            {panel.marks.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="quiet"
                  aria-pressed={m.id === selectedMark}
                  onClick={() => {
                    onSelectMark(m.id === selectedMark ? null : m.id);
                  }}
                >
                  {KINDS.find((k) => k.kind === m.kind)?.label ?? 'Mark'} {i + 1}
                  {m.kind === 'text' && m.text !== '' ? `: ${m.text}` : ''}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove mark ${String(i + 1)}`}
                  title="Remove"
                  onClick={() => {
                    onChange({ ...panel, marks: panel.marks.filter((x) => x.id !== m.id) });
                    if (m.id === selectedMark) onSelectMark(null);
                  }}
                >
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {mark && (
          <div className="fig-mark-edit">
            {mark.kind === 'text' && (
              <input
                aria-label="Mark text"
                value={mark.text}
                onChange={(e) => {
                  setMark({ text: e.target.value });
                }}
              />
            )}
            <Swatches
              label="Mark colour"
              value={mark.colour}
              onPick={(colour) => {
                setMark({ colour });
              }}
            />
            <label className="fig-range">
              <span>Size</span>
              <input
                type="range"
                aria-label="Mark size"
                min={4}
                max={30}
                value={mark.size}
                onChange={(e) => {
                  setMark({ size: Number(e.target.value) });
                }}
              />
              <span className="fig-value">{mark.size} pt</span>
            </label>
            {(mark.kind === 'arrow' || mark.kind === 'arrowhead') && (
              <label className="fig-range">
                <span>Points</span>
                <input
                  type="range"
                  aria-label="Mark direction"
                  min={0}
                  max={345}
                  step={15}
                  value={mark.angle}
                  onChange={(e) => {
                    setMark({ angle: Number(e.target.value) });
                  }}
                />
                <span className="fig-value">{mark.angle}°</span>
              </label>
            )}
          </div>
        )}
      </fieldset>
      <fieldset className="fig-inset">
        <legend>Zoomed inset</legend>
        <button
          type="button"
          className="quiet"
          aria-pressed={tool === 'inset'}
          onClick={() => {
            onTool(tool === 'inset' ? 'move' : 'inset');
          }}
        >
          <ScanSearch {...ICON} /> {inset ? 'Draw its region again' : 'Draw a region to zoom'}
        </button>
        {tool === 'inset' && (
          <p className="hint" role="status">
            Drag across the part of the panel to show larger.
          </p>
        )}
        {inset && (
          <>
            <div className="fig-row">
              <select
                aria-label="Inset corner"
                value={inset.corner}
                onChange={(e) => {
                  onChange({
                    ...panel,
                    inset: {
                      ...inset,
                      corner:
                        CORNERS.find((c) => c.value === e.target.value)?.value ?? 'bottom-left',
                    },
                  });
                }}
              >
                {CORNERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  onChange({ ...panel, inset: null });
                }}
              >
                Remove inset
              </button>
            </div>
            <label className="fig-range">
              <span>Size</span>
              <input
                type="range"
                aria-label="Inset size"
                min={0.15}
                max={0.7}
                step={0.05}
                value={inset.size}
                onChange={(e) => {
                  onChange({ ...panel, inset: { ...inset, size: Number(e.target.value) } });
                }}
              />
              <span className="fig-value">{Math.round(inset.size * 100)}%</span>
            </label>
            <Swatches
              label="Inset outline colour"
              value={inset.colour}
              onPick={(colour) => {
                onChange({ ...panel, inset: { ...inset, colour } });
              }}
            />
          </>
        )}
      </fieldset>
    </>
  );
}
