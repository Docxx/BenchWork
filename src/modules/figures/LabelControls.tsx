import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { CHANNEL_COLOURS, newId, type Corner, type Grid, type Panel } from './model';

const CORNERS: { value: Corner; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
];

/** A text box that saves when it loses focus or Enter is pressed. */
export function Text({
  label,
  value,
  onSave,
  hint,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onSave(draft);
  };
  return (
    <input
      aria-label={label}
      placeholder={hint}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

const HELP = (
  <p className="hint fig-help">
    Type <code>*w*</code> for italics, <code>Myd88^KO^</code> to raise, <code>CO~2~</code> to lower,{' '}
    <code>**A**</code> for bold.
  </p>
);

/** The grid's labels: rows, columns, headers over columns, and letters. */
export function FigureLabels({ figure, onChange }: { figure: Grid; onChange: (f: Grid) => void }) {
  const setAt = (list: readonly string[], i: number, v: string) =>
    list.map((x, j) => (j === i ? v : x));
  return (
    <section className="fig-labels" aria-label="Labels">
      <h3>Labels</h3>
      {HELP}
      <fieldset>
        <legend>Rows, at the left</legend>
        {figure.rows.map((_r, i) => (
          <Text
            key={i}
            label={`Row ${String(i + 1)} label`}
            hint={i === 0 ? '*w^1118^*' : `Row ${String(i + 1)}`}
            value={figure.rowLabels[i] ?? ''}
            onSave={(v) => {
              onChange({ ...figure, rowLabels: setAt(figure.rowLabels, i, v) });
            }}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend>Columns, at the top</legend>
        {figure.cols.map((_c, i) => (
          <Text
            key={i}
            label={`Column ${String(i + 1)} label`}
            hint={i === 0 ? 'DAPI' : `Column ${String(i + 1)}`}
            value={figure.colLabels[i] ?? ''}
            onSave={(v) => {
              onChange({ ...figure, colLabels: setAt(figure.colLabels, i, v) });
            }}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend>Headers over columns</legend>
        {figure.headers.map((h) => (
          <div key={h.id} className="fig-header-row">
            <Text
              label="Header"
              hint="Control"
              value={h.text}
              onSave={(v) => {
                onChange({
                  ...figure,
                  headers: figure.headers.map((x) => (x.id === h.id ? { ...x, text: v } : x)),
                });
              }}
            />
            <label>
              from
              <select
                aria-label="First column"
                value={h.col}
                onChange={(e) => {
                  const col = Number(e.target.value);
                  onChange({
                    ...figure,
                    headers: figure.headers.map((x) =>
                      x.id === h.id
                        ? { ...x, col, span: Math.min(x.span, figure.cols.length - col) }
                        : x,
                    ),
                  });
                }}
              >
                {figure.cols.map((_c, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              over
              <select
                aria-label="Columns it spans"
                value={h.span}
                onChange={(e) => {
                  onChange({
                    ...figure,
                    headers: figure.headers.map((x) =>
                      x.id === h.id ? { ...x, span: Number(e.target.value) } : x,
                    ),
                  });
                }}
              >
                {Array.from({ length: figure.cols.length - h.col }, (_x, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove header"
              title="Remove"
              onClick={() => {
                onChange({ ...figure, headers: figure.headers.filter((x) => x.id !== h.id) });
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
            onChange({
              ...figure,
              headers: [
                ...figure.headers,
                { id: newId(), text: '', col: 0, span: Math.min(2, figure.cols.length) },
              ],
            });
          }}
        >
          <Plus size={14} aria-hidden /> Add a header
        </button>
      </fieldset>
      <label className="fig-field">
        Label size
        <input
          type="number"
          aria-label="Label size, points"
          min={4}
          max={24}
          value={figure.labelSize}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 4 && v <= 24) onChange({ ...figure, labelSize: v });
          }}
        />
        pt
      </label>
      <fieldset>
        <legend>Letters in panels</legend>
        <label className="choice">
          <input
            type="checkbox"
            checked={figure.letters.show}
            onChange={(e) => {
              onChange({ ...figure, letters: { ...figure.letters, show: e.target.checked } });
            }}
          />
          Show letters
        </label>
        <div className="fig-row">
          <select
            aria-label="Letter style"
            value={figure.letters.form}
            onChange={(e) => {
              const form =
                e.target.value === 'lower' || e.target.value === 'brackets'
                  ? e.target.value
                  : 'upper';
              onChange({ ...figure, letters: { ...figure.letters, form } });
            }}
          >
            <option value="upper">A, B, C</option>
            <option value="lower">a, b, c</option>
            <option value="brackets">(a), (b), (c)</option>
          </select>
          <select
            aria-label="Letter corner"
            value={figure.letters.corner}
            onChange={(e) => {
              const corner = CORNERS.find((c) => c.value === e.target.value)?.value ?? 'top-left';
              onChange({ ...figure, letters: { ...figure.letters, corner } });
            }}
          >
            {CORNERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="fig-row">
          <label className="fig-field">
            Size
            <input
              type="number"
              aria-label="Letter size, points"
              min={4}
              max={36}
              value={figure.letters.size}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 4 && v <= 36)
                  onChange({ ...figure, letters: { ...figure.letters, size: v } });
              }}
            />
          </label>
          <select
            aria-label="Letter colour"
            value={figure.letters.colour}
            onChange={(e) => {
              onChange({ ...figure, letters: { ...figure.letters, colour: e.target.value } });
            }}
          >
            <option value="#ffffff">White</option>
            <option value="#000000">Black</option>
          </select>
        </div>
      </fieldset>
      <fieldset>
        <legend>Channel names in panels</legend>
        <div className="fig-row">
          <select
            aria-label="Channel name corner"
            value={figure.channelCorner}
            onChange={(e) => {
              const corner = CORNERS.find((c) => c.value === e.target.value)?.value ?? 'top-right';
              onChange({ ...figure, channelCorner: corner });
            }}
          >
            {CORNERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="fig-field">
            Size
            <input
              type="number"
              aria-label="Channel name size, points"
              min={4}
              max={24}
              value={figure.channelSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 4 && v <= 24) onChange({ ...figure, channelSize: v });
              }}
            />
          </label>
        </div>
      </fieldset>
    </section>
  );
}

/**
 * The channel or antibody names in the chosen panels, such as DAPI in blue
 * and Tau in green. With several panels chosen, the first's are shown and a
 * change goes to all.
 */
export function PanelLabels({
  panels,
  onChange,
}: {
  panels: readonly Panel[];
  onChange: (labels: Panel['labels']) => void;
}) {
  const labels = panels[0]?.labels ?? [];
  const set = (i: number, change: Partial<Panel['labels'][number]>) => {
    onChange(labels.map((l, j) => (j === i ? { ...l, ...change } : l)));
  };
  return (
    <fieldset className="fig-channels">
      <legend>Channel names{panels.length > 1 ? ', for all chosen' : ''}</legend>
      {labels.map((l, i) => (
        <div key={i} className="fig-channel">
          <Text
            label={`Channel name ${String(i + 1)}`}
            hint="DAPI"
            value={l.text}
            onSave={(v) => {
              set(i, { text: v });
            }}
          />
          <div
            className="fig-swatches"
            role="group"
            aria-label={`Colour of channel name ${String(i + 1)}`}
          >
            {CHANNEL_COLOURS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="colour-chip"
                title={c.name}
                aria-label={c.name}
                aria-pressed={l.colour === c.value}
                style={{ background: c.value }}
                onClick={() => {
                  set(i, { colour: c.value });
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove channel name ${String(i + 1)}`}
            title="Remove"
            onClick={() => {
              onChange(labels.filter((_l, j) => j !== i));
            }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="quiet"
        disabled={labels.length >= 8}
        onClick={() => {
          const next =
            CHANNEL_COLOURS[(labels.length + 1) % CHANNEL_COLOURS.length]?.value ?? '#ffffff';
          onChange([...labels, { text: '', colour: next }]);
        }}
      >
        <Plus size={14} aria-hidden /> Add a channel name
      </button>
    </fieldset>
  );
}
