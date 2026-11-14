import { FileUp, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  barNames,
  CHART_TYPES,
  ERROR_KINDS,
  formatData,
  LEGEND_PLACES,
  parseData,
  SERIES_COLOURS,
  type Chart,
} from './chart';
import { newId } from './model';
import { Text } from './TextField';

const TYPE_NAMES: Record<Chart['type'], string> = {
  bar: 'Bars',
  line: 'Lines',
  scatter: 'Points',
};
const ERROR_NAMES: Record<Chart['error'], string> = {
  sem: 'SEM',
  sd: 'SD',
  none: 'None',
};
const LEGEND_NAMES: Record<Chart['legend'], string> = {
  none: 'None',
  top: 'Above',
  right: 'At the right',
  inside: 'Inside, top right',
};

/** A spreadsheet's first sheet, or a CSV file, as tab-separated text. */
async function sheetText(file: File): Promise<string> {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    const first = book.SheetNames[0];
    const sheet = first === undefined ? undefined : book.Sheets[first];
    return sheet ? XLSX.utils.sheet_to_csv(sheet, { FS: '\t', blankrows: false }) : '';
  }
  return file.text();
}

/** A number, or nothing for "fit the data". */
function Bound({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  return (
    <label className="fig-field">
      {label}
      <input
        type="number"
        aria-label={`Value axis ${label.toLowerCase()}`}
        placeholder="Auto"
        value={value ?? ''}
        onChange={(e) => {
          const t = e.target.value.trim();
          if (t === '') onSave(null);
          else if (Number.isFinite(Number(t))) onSave(Number(t));
        }}
      />
    </label>
  );
}

export function ChartControls({ chart, onChange }: { chart: Chart; onChange: (c: Chart) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const shown = formatData(chart);
  const [draft, setDraft] = useState(shown);
  const [was, setWas] = useState(shown);
  const [problem, setProblem] = useState<string | null>(null);
  if (shown !== was) {
    setWas(shown);
    setDraft(shown);
  }
  const takeData = (text: string) => {
    const data = parseData(text, chart.series);
    if (!data || data.groups.length === 0) {
      setProblem('That could not be read. Put names in the first row and numbers below them.');
      return;
    }
    setProblem(null);
    const bars = data.groups.length * Math.max(1, data.series.length);
    onChange({
      ...chart,
      ...data,
      brackets: chart.brackets.filter((b) => b.from < bars && b.to < bars),
    });
  };
  const names = barNames(chart);
  const several = chart.series.length > 1;

  return (
    <>
      <label className="fig-field">
        Kind
        <select
          aria-label="Kind of graph"
          value={chart.type}
          onChange={(e) => {
            const type = CHART_TYPES.find((t) => t === e.target.value);
            if (type) onChange({ ...chart, type });
          }}
        >
          {CHART_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_NAMES[t]}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Data</legend>
        <p className="hint fig-help">
          Paste from a spreadsheet: groups across the top with values below them. For several
          series, leave the first cell empty, put each series name over its values (repeated for
          each replicate) and a group name at the start of each row.
        </p>
        <textarea
          aria-label="Graph data"
          className="fig-data"
          rows={6}
          spellCheck={false}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={() => {
            if (draft !== shown) takeData(draft);
          }}
        />
        {problem !== null && (
          <p className="notice" role="alert">
            {problem}
          </p>
        )}
        <button
          type="button"
          className="quiet"
          onClick={() => {
            picker.current?.click();
          }}
        >
          <FileUp size={15} aria-hidden /> Read a spreadsheet
        </button>
        <input
          ref={picker}
          type="file"
          hidden
          accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
          aria-label="Spreadsheet to read"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void sheetText(file)
              .then((text) => {
                setDraft(text);
                takeData(text);
              })
              .catch(() => {
                setProblem('That file could not be read.');
              });
          }}
        />
      </fieldset>

      <fieldset>
        <legend>{several ? 'Series' : 'Colour'}</legend>
        {chart.series.map((s) => (
          <div key={s.id} className="fig-series">
            {several && <span>{s.name}</span>}
            <div className="fig-swatches" role="group" aria-label={`Colour of ${s.name}`}>
              {['#ffffff', ...SERIES_COLOURS].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="colour-chip"
                  aria-label={c === '#ffffff' ? 'White' : c}
                  aria-pressed={s.colour === c}
                  style={{ background: c }}
                  onClick={() => {
                    onChange({
                      ...chart,
                      series: chart.series.map((x) => (x.id === s.id ? { ...x, colour: c } : x)),
                    });
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        {several && (
          <label className="fig-field">
            Key
            <select
              aria-label="Where the key goes"
              value={chart.legend}
              onChange={(e) => {
                const legend = LEGEND_PLACES.find((p) => p === e.target.value);
                if (legend) onChange({ ...chart, legend });
              }}
            >
              {LEGEND_PLACES.map((p) => (
                <option key={p} value={p}>
                  {LEGEND_NAMES[p]}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <label className="fig-field">
        Error bars
        <select
          aria-label="Error bars"
          value={chart.error}
          onChange={(e) => {
            const error = ERROR_KINDS.find((k) => k === e.target.value);
            if (error) onChange({ ...chart, error });
          }}
        >
          {ERROR_KINDS.map((k) => (
            <option key={k} value={k}>
              {ERROR_NAMES[k]}
            </option>
          ))}
        </select>
      </label>
      {chart.type !== 'scatter' && (
        <label className="fig-check">
          <input
            type="checkbox"
            checked={chart.dots}
            onChange={(e) => {
              onChange({ ...chart, dots: e.target.checked });
            }}
          />
          Show each value
        </label>
      )}

      <fieldset>
        <legend>Axes</legend>
        <Text
          label="Value axis name"
          hint="Cell viability (%)"
          value={chart.yLabel}
          onSave={(yLabel) => {
            onChange({ ...chart, yLabel });
          }}
        />
        <div className="fig-place">
          <Bound
            label="From"
            value={chart.yMin}
            onSave={(yMin) => {
              onChange({ ...chart, yMin });
            }}
          />
          <Bound
            label="To"
            value={chart.yMax}
            onSave={(yMax) => {
              onChange({ ...chart, yMax });
            }}
          />
        </div>
        <label className="fig-check">
          <input
            type="checkbox"
            checked={chart.yLog}
            onChange={(e) => {
              onChange({ ...chart, yLog: e.target.checked });
            }}
          />
          Value axis in powers of ten
        </label>
        <Text
          label="Bottom axis name"
          hint="Concentration (mM)"
          value={chart.xLabel}
          onSave={(xLabel) => {
            onChange({ ...chart, xLabel });
          }}
        />
        {chart.type !== 'bar' && (
          <label className="fig-check">
            <input
              type="checkbox"
              checked={chart.xLog}
              onChange={(e) => {
                onChange({ ...chart, xLog: e.target.checked });
              }}
            />
            Bottom axis in powers of ten
          </label>
        )}
        <label className="fig-check">
          <input
            type="checkbox"
            checked={chart.slant}
            onChange={(e) => {
              onChange({ ...chart, slant: e.target.checked });
            }}
          />
          Slant the group names
        </label>
      </fieldset>

      <fieldset>
        <legend>Significance</legend>
        {chart.brackets.map((b, i) => (
          <div key={b.id} className="fig-bracket">
            <select
              aria-label={`Bracket ${String(i + 1)} from`}
              value={b.from}
              onChange={(e) => {
                const from = Number(e.target.value);
                onChange({
                  ...chart,
                  brackets: chart.brackets.map((x) => (x.id === b.id ? { ...x, from } : x)),
                });
              }}
            >
              {names.map((n, j) => (
                <option key={j} value={j}>
                  {n}
                </option>
              ))}
            </select>
            <select
              aria-label={`Bracket ${String(i + 1)} to`}
              value={b.to}
              onChange={(e) => {
                const to = Number(e.target.value);
                onChange({
                  ...chart,
                  brackets: chart.brackets.map((x) => (x.id === b.id ? { ...x, to } : x)),
                });
              }}
            >
              {names.map((n, j) => (
                <option key={j} value={j}>
                  {n}
                </option>
              ))}
            </select>
            <Text
              label={`Bracket ${String(i + 1)} text`}
              hint="**, ns or *P* < 0.01"
              value={b.text}
              onSave={(text) => {
                onChange({
                  ...chart,
                  brackets: chart.brackets.map((x) => (x.id === b.id ? { ...x, text } : x)),
                });
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove bracket ${String(i + 1)}`}
              title="Remove"
              onClick={() => {
                onChange({ ...chart, brackets: chart.brackets.filter((x) => x.id !== b.id) });
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="quiet"
          disabled={names.length < 2}
          onClick={() => {
            onChange({
              ...chart,
              brackets: [
                ...chart.brackets,
                { id: newId(), from: 0, to: Math.min(1, names.length - 1), text: '*' },
              ],
            });
          }}
        >
          <Plus size={14} aria-hidden /> Add a bracket
        </button>
      </fieldset>

      <label className="fig-field">
        Text size
        <input
          type="number"
          aria-label="Graph text size, points"
          min={4}
          max={24}
          value={chart.size}
          onChange={(e) => {
            const size = Number(e.target.value);
            if (size >= 4 && size <= 24) onChange({ ...chart, size });
          }}
        />
        pt
      </label>
    </>
  );
}
