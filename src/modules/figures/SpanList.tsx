import { Plus, X } from 'lucide-react';
import { Text } from './TextField';
import { newId } from './model';

/** A label over a run of rows, columns or lanes: where it starts, and how many it covers. */
export interface Span {
  id: string;
  text: string;
  start: number;
  span: number;
}

/**
 * Labels that each cover a run of things, such as "Control" over two lanes.
 * `noun` names the things, for the labels read aloud.
 */
export function SpanList({
  spans,
  count,
  noun,
  hint,
  addLabel,
  onChange,
}: {
  spans: readonly Span[];
  count: number;
  noun: string;
  hint: string;
  addLabel: string;
  onChange: (spans: Span[]) => void;
}) {
  const set = (id: string, change: (s: Span) => Span) => {
    onChange(spans.map((s) => (s.id === id ? change(s) : s)));
  };
  return (
    <>
      {spans.map((s) => (
        <div key={s.id} className="fig-header-row">
          <Text
            label={`Label over ${noun}s`}
            hint={hint}
            value={s.text}
            onSave={(text) => {
              set(s.id, (x) => ({ ...x, text }));
            }}
          />
          <label>
            from
            <select
              aria-label={`First ${noun}`}
              value={s.start}
              onChange={(e) => {
                const start = Number(e.target.value);
                set(s.id, (x) => ({ ...x, start, span: Math.min(x.span, count - start) }));
              }}
            >
              {Array.from({ length: count }, (_x, i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            over
            <select
              aria-label={`${noun[0]?.toUpperCase() ?? ''}${noun.slice(1)}s it covers`}
              value={s.span}
              onChange={(e) => {
                set(s.id, (x) => ({ ...x, span: Number(e.target.value) }));
              }}
            >
              {Array.from({ length: Math.max(1, count - s.start) }, (_x, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove label over ${noun}s`}
            title="Remove"
            onClick={() => {
              onChange(spans.filter((x) => x.id !== s.id));
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
          const used = spans.reduce((end, s) => Math.max(end, s.start + s.span), 0);
          const start = used < count ? used : 0;
          onChange([...spans, { id: newId(), text: '', start, span: Math.min(2, count - start) }]);
        }}
      >
        <Plus size={14} aria-hidden /> {addLabel}
      </button>
    </>
  );
}
