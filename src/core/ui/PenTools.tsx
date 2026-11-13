import {
  ChevronDown,
  Eraser,
  Highlighter,
  PenLine,
  Star,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PenTool } from '../ink/surface';
import { MAX_PENS } from '../settings/appSettings';
import { HIGHLIGHTER_COLOURS, PEN_COLOURS, PEN_WIDTHS } from '../state/inkSlice';
import { useApp } from './AppStoreContext';

const TOOLS: { tool: PenTool; label: string; icon: LucideIcon }[] = [
  { tool: 'pen', label: 'Pen', icon: PenLine },
  { tool: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { tool: 'eraser', label: 'Eraser', icon: Eraser },
];

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;

/** Keeps the page's selection and focus where they are when a tool is pressed. */
const keepFocus = (e: { preventDefault: () => void }) => {
  e.preventDefault();
};

/** A dot the colour and size of a pen: what it will draw like. */
function PenDot({ colour, width, soft }: { colour: string; width: number; soft: boolean }) {
  const size = Math.max(5, Math.min(18, width * 2.2));
  return (
    <span
      className="pen-dot"
      aria-hidden="true"
      style={{ width: size, height: size, background: colour, opacity: soft ? 0.55 : 1 }}
    />
  );
}

/**
 * What the pen writes with: draw or write as text; pen, highlighter,
 * eraser and any tools modules add; favourite pens, a press away; and the
 * pen in use, which opens its colours, thickness and favourites.
 */
export function PenTools() {
  const pen = useApp((s) => s.pen);
  const setPen = useApp((s) => s.setPen);
  const pens = useApp((s) => s.settings.pens);
  const savePen = useApp((s) => s.savePen);
  const removePen = useApp((s) => s.removePen);
  const penMode = useApp((s) => s.settings.penMode);
  const moduleTools = useApp((s) => s.inkTools);
  const setPenMode = useApp((s) => s.setPenMode);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const inks = pen.tool === 'pen' || pen.tool === 'highlighter';
  const colours = pen.tool === 'highlighter' ? HIGHLIGHTER_COLOURS : PEN_COLOURS;
  const saved = pens.some(
    (p) => p.tool === pen.tool && p.colour === pen.colour && p.width === pen.width,
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <>
      <div className="tool-group pen-mode" role="radiogroup" aria-label="What the pen does">
        {(
          [
            { mode: 'draw', label: 'Draw', title: 'The pen draws ink', icon: PenLine },
            {
              mode: 'text',
              label: 'Write as text',
              title: 'Handwriting in text becomes typed text',
              icon: Type,
            },
          ] as const
        ).map(({ mode, label, title, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            className="tool labelled"
            title={title}
            aria-checked={penMode === mode}
            onMouseDown={keepFocus}
            onClick={() => void setPenMode(mode)}
          >
            <Icon {...ICON} />
            {label}
          </button>
        ))}
      </div>
      <div className="tool-group" role="group" aria-label="Pen tools">
        {TOOLS.map(({ tool, label, icon: Icon }) => (
          <button
            key={tool}
            type="button"
            className="tool"
            title={label}
            aria-label={label}
            aria-pressed={pen.tool === tool}
            onMouseDown={keepFocus}
            onClick={() => {
              setPen({ tool });
            }}
          >
            <Icon {...ICON} />
          </button>
        ))}
        {moduleTools.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tool"
            title={t.title}
            aria-label={t.title}
            aria-pressed={pen.tool === t.id}
            onMouseDown={keepFocus}
            onClick={() => {
              setPen({ tool: t.id });
            }}
          >
            {t.icon}
          </button>
        ))}
      </div>
      {pens.length > 0 && (
        <div className="tool-group" role="group" aria-label="Favourite pens">
          {pens.map((p, i) => {
            const name = `${p.tool === 'pen' ? 'Pen' : 'Highlighter'} ${String(i + 1)}`;
            return (
              <button
                key={`${p.tool}${p.colour}${String(p.width)}`}
                type="button"
                className="tool pen-favourite"
                title={name}
                aria-label={name}
                aria-pressed={
                  pen.tool === p.tool && pen.colour === p.colour && pen.width === p.width
                }
                onMouseDown={keepFocus}
                onClick={() => {
                  setPen({ tool: p.tool, colour: p.colour, width: p.width });
                }}
              >
                <PenDot colour={p.colour} width={p.width} soft={p.tool === 'highlighter'} />
              </button>
            );
          })}
        </div>
      )}
      {inks && (
        <div className="tool-group pen-style" ref={panel}>
          <button
            type="button"
            className="tool labelled"
            aria-haspopup="dialog"
            aria-expanded={open}
            title="Colour and thickness"
            onMouseDown={keepFocus}
            onClick={() => {
              setOpen(!open);
            }}
          >
            <PenDot colour={pen.colour} width={pen.width} soft={pen.tool === 'highlighter'} />
            Colour and thickness
            <ChevronDown size={13} aria-hidden />
          </button>
          {open && (
            <div className="pen-panel" role="dialog" aria-label="Colour and thickness">
              <div className="pen-panel-row" role="group" aria-label="Colour">
                {colours.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className="colour-chip ink"
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={pen.colour === c.value}
                    style={{ background: c.value }}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setPen({ colour: c.value });
                    }}
                  />
                ))}
                <label className="pen-custom" title="Any colour">
                  <span className="visually-hidden">Any colour</span>
                  <input
                    type="color"
                    value={pen.colour}
                    onChange={(e) => {
                      setPen({ colour: e.target.value });
                    }}
                  />
                </label>
              </div>
              <div className="pen-panel-row" role="group" aria-label="Thickness">
                {PEN_WIDTHS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    className="tool pen-width"
                    title={w.name}
                    aria-label={w.name}
                    aria-pressed={pen.width === w.value}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setPen({ width: w.value });
                    }}
                  >
                    <span style={{ height: `${String(w.value * 1.5)}px` }} />
                  </button>
                ))}
                <input
                  type="range"
                  className="pen-slider"
                  aria-label="Thickness"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={pen.width}
                  onChange={(e) => {
                    setPen({ width: Number(e.target.value) });
                  }}
                />
                <span className="pen-size">{String(pen.width)}</span>
              </div>
              <div className="pen-panel-row">
                <button
                  type="button"
                  className="quiet"
                  disabled={saved || pens.length >= MAX_PENS}
                  onClick={() => void savePen()}
                >
                  <Star size={14} aria-hidden />{' '}
                  {saved ? 'In your favourites' : 'Keep as a favourite'}
                </button>
              </div>
              {pens.length > 0 && (
                <ul className="pen-saved" aria-label="Favourite pens to remove">
                  {pens.map((p, i) => (
                    <li key={`${p.tool}${p.colour}${String(p.width)}`}>
                      <PenDot colour={p.colour} width={p.width} soft={p.tool === 'highlighter'} />
                      <span>
                        {p.tool === 'pen' ? 'Pen' : 'Highlighter'}, {String(p.width)}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove favourite ${String(i + 1)}`}
                        title="Remove"
                        onClick={() => void removePen(i)}
                      >
                        <X size={13} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
