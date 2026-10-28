import { Eraser, Highlighter, PenLine, Type, type LucideIcon } from 'lucide-react';
import type { PenTool } from '../ink/surface';
import { HIGHLIGHTER_COLOURS, PEN_COLOURS, PEN_WIDTHS } from '../state/inkSlice';
import { useApp } from './AppStoreContext';

const TOOLS: { tool: PenTool; label: string; icon: LucideIcon }[] = [
  { tool: 'pen', label: 'Pen', icon: PenLine },
  { tool: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { tool: 'eraser', label: 'Eraser', icon: Eraser },
];

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;

/** Pen, highlighter and eraser, with colours and widths: what the pen writes with. */
export function PenTools() {
  const pen = useApp((s) => s.pen);
  const setPen = useApp((s) => s.setPen);
  const penMode = useApp((s) => s.settings.penMode);
  const moduleTools = useApp((s) => s.inkTools);
  const setPenMode = useApp((s) => s.setPenMode);
  const colours = pen.tool === 'highlighter' ? HIGHLIGHTER_COLOURS : PEN_COLOURS;

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
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => void setPenMode(mode)}
          >
            <Icon {...ICON} />
            {label}
          </button>
        ))}
      </div>
      <>
        <div className="tool-group">
          {TOOLS.map(({ tool, label, icon: Icon }) => (
            <button
              key={tool}
              type="button"
              className="tool"
              title={label}
              aria-label={label}
              aria-pressed={pen.tool === tool}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
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
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                setPen({ tool: t.id });
              }}
            >
              {t.icon}
            </button>
          ))}
        </div>
        {(pen.tool === 'pen' || pen.tool === 'highlighter') && (
          <>
            <div className="tool-group">
              <span className="tool-label">Colour</span>
              {colours.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="colour-chip ink"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={pen.colour === c.value}
                  style={{ background: c.value }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    setPen({ colour: c.value });
                  }}
                />
              ))}
            </div>
            <div className="tool-group">
              {PEN_WIDTHS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  className="tool pen-width"
                  title={w.name}
                  aria-label={w.name}
                  aria-pressed={pen.width === w.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    setPen({ width: w.value });
                  }}
                >
                  <span style={{ height: `${String(w.value * 1.5)}px` }} />
                </button>
              ))}
            </div>
          </>
        )}
      </>
    </>
  );
}
