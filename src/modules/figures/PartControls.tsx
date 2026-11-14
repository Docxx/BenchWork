import { Plus, X } from 'lucide-react';
import {
  LANE_ANGLES,
  newBlot,
  withCols,
  withLanes,
  type Blot,
  type SideLabel,
  type Table,
  type TableRow,
} from './blot';
import { newId } from './model';
import { SHAPE_FORMS, SHAPE_WAYS, type Shape } from './shapes';
import { SpanList } from './SpanList';
import { Text } from './TextField';

/** A whole number within bounds, typed in. */
function Count({
  label,
  value,
  min,
  max,
  onSave,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onSave: (n: number) => void;
}) {
  return (
    <label className="fig-field">
      {label}
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (n >= min && n <= max) onSave(n);
        }}
      />
    </label>
  );
}

/**
 * Rows of a conditions table: a name, then a short value (+, −, a dose)
 * for each lane or column. A quick button fills a row with + and −.
 */
function Rows({
  rows,
  count,
  onChange,
}: {
  rows: readonly TableRow[];
  count: number;
  onChange: (rows: TableRow[]) => void;
}) {
  const set = (id: string, change: (r: TableRow) => TableRow) => {
    onChange(rows.map((r) => (r.id === id ? change(r) : r)));
  };
  return (
    <>
      {rows.map((row, i) => (
        <div key={row.id} className="fig-table-row">
          <Text
            label={`Row ${String(i + 1)} name`}
            hint="Drug"
            value={row.label}
            onSave={(label) => {
              set(row.id, (r) => ({ ...r, label }));
            }}
          />
          <div className="fig-cells">
            {Array.from({ length: count }, (_x, c) => (
              <button
                key={c}
                type="button"
                className="fig-cell"
                aria-label={`Row ${String(i + 1)}, ${String(c + 1)}: ${row.cells[c] || 'empty'}`}
                title="Press to switch between +, − and empty"
                onClick={() => {
                  const now = row.cells[c] ?? '';
                  const next = now === '+' ? '−' : now === '−' ? '' : '+';
                  set(row.id, (r) => ({
                    ...r,
                    cells: r.cells.map((x, j) => (j === c ? next : x)),
                  }));
                }}
              >
                {row.cells[c] || '·'}
              </button>
            ))}
          </div>
          <Text
            label={`Row ${String(i + 1)} values`}
            hint="Or type them, with commas"
            value={row.cells.join(', ')}
            onSave={(v) => {
              const parts = v.split(',').map((x) => x.trim().replace(/^-$/, '−'));
              set(row.id, (r) => ({
                ...r,
                cells: Array.from({ length: count }, (_x, j) => parts[j] ?? ''),
              }));
            }}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove row ${String(i + 1)}`}
            title="Remove"
            onClick={() => {
              onChange(rows.filter((r) => r.id !== row.id));
            }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="quiet"
        onClick={() => {
          onChange([
            ...rows,
            { id: newId(), label: '', cells: Array.from({ length: count }, () => '') },
          ]);
        }}
      >
        <Plus size={14} aria-hidden /> Add a row
      </button>
    </>
  );
}

/** Labels down one side of a blot, each at a point down the image. */
function Sides({
  labels,
  noun,
  hint,
  onChange,
}: {
  labels: readonly SideLabel[];
  noun: string;
  hint: string;
  onChange: (l: SideLabel[]) => void;
}) {
  return (
    <>
      {labels.map((m, i) => (
        <div key={m.id} className="fig-header-row">
          <Text
            label={`${noun} ${String(i + 1)}`}
            hint={hint}
            value={m.text}
            onSave={(text) => {
              onChange(labels.map((x) => (x.id === m.id ? { ...x, text } : x)));
            }}
          />
          <label>
            at
            <input
              type="number"
              aria-label={`${noun} ${String(i + 1)}, % down`}
              min={0}
              max={100}
              value={Math.round(m.at * 100)}
              onChange={(e) => {
                const at = Number(e.target.value) / 100;
                if (at >= 0 && at <= 1)
                  onChange(labels.map((x) => (x.id === m.id ? { ...x, at } : x)));
              }}
            />
            %
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${noun.toLowerCase()} ${String(i + 1)}`}
            title="Remove"
            onClick={() => {
              onChange(labels.filter((x) => x.id !== m.id));
            }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="quiet"
        onClick={() => {
          const last = labels.at(-1)?.at ?? 0.1;
          onChange([...labels, { id: newId(), text: '', at: Math.min(0.95, last + 0.2) }]);
        }}
      >
        <Plus size={14} aria-hidden /> Add
      </button>
    </>
  );
}

/** Labels round a blot, or a button to start them. */
export function BlotControls({
  blot,
  onChange,
}: {
  blot: Blot | null;
  onChange: (b: Blot | null) => void;
}) {
  if (!blot) {
    return (
      <button
        type="button"
        className="quiet"
        title="Lanes, conditions, size markers and band names round the image"
        onClick={() => {
          onChange(newBlot());
        }}
      >
        Label as a blot
      </button>
    );
  }
  return (
    <section className="fig-blot" aria-label="Blot labels">
      <h4>Blot labels</h4>
      <p className="hint">Drag a marker or band name up and down beside the image to place it.</p>
      <Count
        label="Lanes"
        value={blot.lanes}
        min={1}
        max={40}
        onSave={(n) => {
          onChange(withLanes(blot, n));
        }}
      />
      <div className="fig-place">
        <label className="fig-field">
          From
          <input
            type="number"
            aria-label="Lanes start, % across"
            min={0}
            max={90}
            value={Math.round(blot.from * 100)}
            onChange={(e) => {
              const from = Number(e.target.value) / 100;
              if (from >= 0 && from < blot.to - 0.05) onChange({ ...blot, from });
            }}
          />
          %
        </label>
        <label className="fig-field">
          To
          <input
            type="number"
            aria-label="Lanes end, % across"
            min={10}
            max={100}
            value={Math.round(blot.to * 100)}
            onChange={(e) => {
              const to = Number(e.target.value) / 100;
              if (to <= 1 && to > blot.from + 0.05) onChange({ ...blot, to });
            }}
          />
          %
        </label>
      </div>
      <fieldset>
        <legend>Lane names</legend>
        <Text
          label="Lane names"
          hint="Mock, β-lap, Sirtinol, with commas"
          value={blot.laneLabels.join(', ')}
          onSave={(v) => {
            const parts = v.split(',').map((x) => x.trim());
            onChange({
              ...blot,
              laneLabels: Array.from({ length: blot.lanes }, (_x, i) => parts[i] ?? ''),
            });
          }}
        />
        <label className="fig-field">
          Slant
          <select
            aria-label="Lane name slant"
            value={blot.laneAngle}
            onChange={(e) => {
              const a = LANE_ANGLES.find((x) => String(x) === e.target.value);
              if (a !== undefined) onChange({ ...blot, laneAngle: a });
            }}
          >
            <option value={0}>Across</option>
            <option value={45}>Slanted</option>
            <option value={90}>Upright</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Over groups of lanes</legend>
        <SpanList
          spans={blot.groups}
          count={blot.lanes}
          noun="lane"
          hint="Control"
          addLabel="Add a group"
          onChange={(groups) => {
            onChange({ ...blot, groups });
          }}
        />
      </fieldset>
      <fieldset>
        <legend>Conditions, above the lanes</legend>
        <Rows
          rows={blot.rows}
          count={blot.lanes}
          onChange={(rows) => {
            onChange({ ...blot, rows });
          }}
        />
      </fieldset>
      <fieldset>
        <legend>Size markers, on the left</legend>
        <Sides
          labels={blot.markers}
          noun="Marker"
          hint="62 kDa"
          onChange={(markers) => {
            onChange({ ...blot, markers });
          }}
        />
      </fieldset>
      <fieldset>
        <legend>Band names, on the right</legend>
        <Sides
          labels={blot.bands}
          noun="Band"
          hint="GAPDH"
          onChange={(bands) => {
            onChange({ ...blot, bands });
          }}
        />
      </fieldset>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          onChange(null);
        }}
      >
        Remove blot labels
      </button>
    </section>
  );
}

/** A table on its own, such as + and − under a graph. */
export function TableControls({ table, onChange }: { table: Table; onChange: (t: Table) => void }) {
  return (
    <>
      <p className="hint">
        Line the table up under a graph or blot: its columns spread evenly across its width.
      </p>
      <Count
        label="Columns"
        value={table.cols}
        min={1}
        max={40}
        onSave={(n) => {
          onChange(withCols(table, n));
        }}
      />
      <Rows
        rows={table.rows}
        count={table.cols}
        onChange={(rows) => {
          onChange({ ...table, rows });
        }}
      />
      <Count
        label="Text size, points"
        value={table.size}
        min={4}
        max={24}
        onSave={(size) => {
          onChange({ ...table, size });
        }}
      />
    </>
  );
}

const FORM_NAMES: Record<Shape['form'], string> = {
  line: 'Line',
  arrow: 'Arrow',
  bracket: 'Bracket',
  box: 'Box',
};
const WAY_NAMES: Record<Shape['way'], string> = {
  across: 'Across',
  down: 'Down',
  fall: 'Slanting down',
  rise: 'Slanting up',
};

export function ShapeControls({ shape, onChange }: { shape: Shape; onChange: (s: Shape) => void }) {
  return (
    <>
      <label className="fig-field">
        Kind
        <select
          aria-label="Kind of shape"
          value={shape.form}
          onChange={(e) => {
            const form = SHAPE_FORMS.find((f) => f === e.target.value);
            if (form) onChange({ ...shape, form });
          }}
        >
          {SHAPE_FORMS.map((f) => (
            <option key={f} value={f}>
              {FORM_NAMES[f]}
            </option>
          ))}
        </select>
      </label>
      {shape.form !== 'box' && (
        <label className="fig-field">
          Runs
          <select
            aria-label="Which way it runs"
            value={shape.way}
            onChange={(e) => {
              const way = SHAPE_WAYS.find((w) => w === e.target.value);
              if (way) onChange({ ...shape, way });
            }}
          >
            {SHAPE_WAYS.map((w) => (
              <option key={w} value={w}>
                {WAY_NAMES[w]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="fig-field">
        Thickness
        <input
          type="number"
          aria-label="Line thickness, mm"
          min={0.05}
          max={3}
          step={0.05}
          value={shape.width}
          onChange={(e) => {
            const width = Number(e.target.value);
            if (width >= 0.05 && width <= 3) onChange({ ...shape, width });
          }}
        />
        mm
      </label>
      <label className="fig-field">
        Colour
        <input
          type="color"
          aria-label="Shape colour"
          value={shape.colour}
          onChange={(e) => {
            onChange({ ...shape, colour: e.target.value });
          }}
        />
      </label>
      <label className="fig-check">
        <input
          type="checkbox"
          checked={shape.dashed}
          onChange={(e) => {
            onChange({ ...shape, dashed: e.target.checked });
          }}
        />
        Dashed
      </label>
      {shape.form === 'arrow' && (
        <label className="fig-check">
          <input
            type="checkbox"
            checked={shape.both}
            onChange={(e) => {
              onChange({ ...shape, both: e.target.checked });
            }}
          />
          Heads at both ends
        </label>
      )}
      {(shape.form === 'arrow' || shape.form === 'bracket') && (
        <label className="fig-check">
          <input
            type="checkbox"
            checked={shape.flip}
            onChange={(e) => {
              onChange({ ...shape, flip: e.target.checked });
            }}
          />
          {shape.form === 'arrow' ? 'Point the other way' : 'Ends the other way'}
        </label>
      )}
    </>
  );
}
