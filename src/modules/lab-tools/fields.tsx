import { useId, useState, type ReactNode } from 'react';
import type { ModuleContext } from '@core/api';
import { parseNumber, UNITS, type Kind } from './units';

/** A typed number: the text as typed, and its value, or null. */
export function useNumber(initial = ''): [string, (text: string) => void, number | null] {
  const [text, setText] = useState(initial);
  return [text, setText, parseNumber(text)];
}

export function useUnit(kind: Kind, initial: string): [string, (label: string) => void, Kind] {
  const [label, setLabel] = useState(initial);
  return [label, setLabel, kind];
}

/** A number box, with a unit menu beside it when `unit` is given. */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  unit?: [string, (label: string) => void, Kind];
  /** A fixed unit, shown after the box. */
  suffix?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="lab-field">
      <label htmlFor={id}>{label}</label>
      <span className="lab-input">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
        {unit && (
          <select
            aria-label={`${label} unit`}
            value={unit[0]}
            onChange={(e) => {
              unit[1](e.target.value);
            }}
          >
            {UNITS[unit[2]].map((u) => (
              <option key={u.label} value={u.label}>
                {u.label}
              </option>
            ))}
          </select>
        )}
        {suffix !== undefined && <span className="lab-suffix">{suffix}</span>}
      </span>
    </div>
  );
}

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="lab-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value as T);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Where answers go: copied, or typed into the open page. */
export interface Output {
  ctx: ModuleContext;
  /** Whether a page is open beside the tools, to add answers to. */
  canInsert: boolean;
}

/**
 * An answer, with buttons to copy it or add it to the open page. `text`
 * is what is copied or added; `children`, if given, is what shows.
 */
export function Answer({
  out,
  label,
  text,
  children,
}: {
  out: Output;
  label: string;
  text: string | null;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="lab-answer" role="status" aria-label={label}>
      <span className="lab-answer-label">{label}</span>
      <span className="lab-answer-value">{text === null ? '–' : (children ?? text)}</span>
      {text !== null && (
        <span className="lab-answer-tools">
          <button
            type="button"
            className="quiet"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                }, 1200);
              });
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {out.canInsert && (
            <button
              type="button"
              className="quiet"
              onClick={() => {
                if (!out.ctx.app.insertText(text))
                  out.ctx.app.notify('Open a page to add this to.');
              }}
            >
              Add to page
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/** A short explanation under a tool's fields. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="hint lab-note">{children}</p>;
}
