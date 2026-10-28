import { Eraser, Highlighter, PenLine, type LucideIcon } from 'lucide-react';
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
  const colours = pen.tool === 'highlighter' ? HIGHLIGHTER_COLOURS : PEN_COLOURS;

  return (
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
      </div>
      {pen.tool !== 'eraser' && (
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
  );
}
