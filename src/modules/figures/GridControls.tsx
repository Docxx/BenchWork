import {
  ArrowLeft,
  Columns3,
  FlipHorizontal2,
  ImagePlus,
  Merge,
  Minus,
  Plus,
  RotateCw,
  Rows3,
  SplitSquareHorizontal,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DisplayControls, ScaleControls } from './DisplayControls';
import { FigureLabels, PanelLabels } from './LabelControls';
import { MarkControls } from './MarkControls';
import {
  DEFAULT_CROP,
  insertLine,
  merge,
  removeLine,
  split,
  type Crop,
  type Grid,
  type MarkKind,
  type Panel,
} from './model';
import type { Planes } from './tiff';

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;

/**
 * A grid of images, chosen as a whole: its rows and columns, the space
 * between them, and the labels round it. A change that adds rows or labels
 * is passed on with `grow`, so the block grows rather than squeezing panels.
 */
export function GridControls({
  grid,
  onChange,
  onAddImages,
}: {
  grid: Grid;
  onChange: (g: Grid, grow: boolean) => void;
  onAddImages: () => void;
}) {
  const lastRow = grid.rows.length - 1;
  const lastCol = grid.cols.length - 1;
  return (
    <>
      <p className="hint">
        Press an image to crop, turn or label it. Drop several images to fill the empty panels in
        order.
      </p>
      <button type="button" className="quiet" onClick={onAddImages}>
        <ImagePlus {...ICON} /> Add images
      </button>
      <div className="tool-group" role="group" aria-label="Rows and columns">
        <Rows3 {...ICON} />
        <button
          type="button"
          className="tool"
          title="Add a row"
          aria-label="Add a row"
          onClick={() => {
            onChange(insertLine(grid, 'row', lastRow), true);
          }}
        >
          <Plus {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Remove a row"
          aria-label="Remove a row"
          disabled={grid.rows.length <= 1}
          onClick={() => {
            onChange(removeLine(grid, 'row', lastRow), true);
          }}
        >
          <Minus {...ICON} />
        </button>
        <Columns3 {...ICON} />
        <button
          type="button"
          className="tool"
          title="Add a column"
          aria-label="Add a column"
          onClick={() => {
            onChange(insertLine(grid, 'col', lastCol), true);
          }}
        >
          <Plus {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Remove a column"
          aria-label="Remove a column"
          disabled={grid.cols.length <= 1}
          onClick={() => {
            onChange(removeLine(grid, 'col', lastCol), true);
          }}
        >
          <Minus {...ICON} />
        </button>
      </div>
      <label className="fig-field">
        Space between
        <input
          type="number"
          aria-label="Space between images, mm"
          min={0}
          max={20}
          step={0.5}
          value={grid.gap}
          onChange={(e) => {
            const gap = Number(e.target.value);
            if (Number.isFinite(gap) && gap >= 0 && gap <= 20) onChange({ ...grid, gap }, true);
          }}
        />
        mm
      </label>
      <FigureLabels
        figure={grid}
        onChange={(g) => {
          onChange(g, true);
        }}
      />
    </>
  );
}

/** One or more panels of a grid, chosen: crop, marks, channel names, scale and display. */
export function PanelControls({
  grid,
  chosen,
  planes,
  tool,
  selectedMark,
  rowHeight,
  onTool,
  onSelectMark,
  onChange,
  onBack,
  onNotice,
}: {
  grid: Grid;
  chosen: Panel[];
  planes: ReadonlyMap<string, Planes>;
  tool: 'move' | MarkKind | 'inset';
  selectedMark: string | null;
  /** The chosen panel's row height as laid out, mm. */
  rowHeight: number | null;
  onTool: (t: 'move' | MarkKind | 'inset') => void;
  onSelectMark: (id: string | null) => void;
  onChange: (g: Grid, grow: boolean) => void;
  onBack: () => void;
  onNotice: (text: string) => void;
}) {
  const ids = new Set(chosen.map((p) => p.id));
  const one: Panel | undefined = chosen.length === 1 ? chosen[0] : undefined;
  const editPanels = (change: (p: Panel) => Panel) => {
    onChange({ ...grid, panels: grid.panels.map((p) => (ids.has(p.id) ? change(p) : p)) }, false);
  };
  const editCrop = (change: (c: Crop) => Crop) => {
    editPanels((p) => (p.image ? { ...p, image: { ...p.image, crop: change(p.image.crop) } } : p));
  };
  const block = (() => {
    if (chosen.length < 2) return null;
    const row = Math.min(...chosen.map((p) => p.row));
    const col = Math.min(...chosen.map((p) => p.col));
    const rowEnd = Math.max(...chosen.map((p) => p.row + p.rowSpan));
    const colEnd = Math.max(...chosen.map((p) => p.col + p.colSpan));
    return { row, col, rowSpan: rowEnd - row, colSpan: colEnd - col };
  })();
  const single = grid.panels.length === 1;
  return (
    <>
      {!single && (
        <button type="button" className="quiet fig-back" onClick={onBack}>
          <ArrowLeft {...ICON} /> The whole grid
        </button>
      )}
      {!single && <h4>{chosen.length === 1 ? 'Image' : `${String(chosen.length)} images`}</h4>}
      {one?.image && (
        <p className="fig-file" title={one.image.path}>
          {one.image.path.split('/').at(-1)}
        </p>
      )}
      <div className="tool-group" role="group" aria-label="Image">
        <button
          type="button"
          className="tool"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => {
            editCrop((c) => ({ ...c, zoom: Math.max(1, c.zoom / 1.25) }));
          }}
        >
          <ZoomOut {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => {
            editCrop((c) => ({ ...c, zoom: Math.min(40, c.zoom * 1.25) }));
          }}
        >
          <ZoomIn {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Turn a quarter"
          aria-label="Turn a quarter"
          onClick={() => {
            editCrop((c) => ({ ...c, turns: ((c.turns + 1) % 4) as Crop['turns'] }));
          }}
        >
          <RotateCw {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Flip"
          aria-label="Flip"
          onClick={() => {
            editCrop((c) => ({ ...c, flip: !c.flip }));
          }}
        >
          <FlipHorizontal2 {...ICON} />
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            editCrop(() => ({ ...DEFAULT_CROP }));
          }}
        >
          Reset
        </button>
      </div>
      {chosen.length > 1 && (
        <button
          type="button"
          className="quiet"
          title="Copy the first image's zoom to the others, so they match"
          onClick={() => {
            const zoom = chosen[0]?.image?.crop.zoom ?? 1;
            editCrop((c) => ({ ...c, zoom }));
          }}
        >
          Match zoom
        </button>
      )}
      {one?.image && (
        <MarkControls
          panel={one}
          tool={tool}
          selectedMark={selectedMark}
          onTool={onTool}
          onSelectMark={onSelectMark}
          onChange={(panel) => {
            onChange(
              { ...grid, panels: grid.panels.map((p) => (p.id === panel.id ? panel : p)) },
              false,
            );
          }}
        />
      )}
      <PanelLabels
        panels={chosen}
        onChange={(labels) => {
          editPanels((p) => ({ ...p, labels }));
        }}
      />
      <ScaleControls
        figure={grid}
        panels={chosen}
        onChange={(g) => {
          onChange(g, false);
        }}
      />
      <details className="fig-adjust">
        <summary>Adjust brightness</summary>
        <DisplayControls
          figure={grid}
          panels={chosen}
          planes={planes}
          onChange={(g) => {
            onChange(g, false);
          }}
        />
      </details>
      <div className="tool-group" role="group" aria-label="Arrange">
        {block !== null && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              const next = merge(grid, block);
              if (next) onChange(next, false);
              else onNotice('Those panels cannot be joined: the block would cut through another.');
            }}
          >
            <Merge {...ICON} /> Join
          </button>
        )}
        {one && (one.rowSpan > 1 || one.colSpan > 1) && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              onChange(split(grid, one.id), false);
            }}
          >
            <SplitSquareHorizontal {...ICON} /> Split
          </button>
        )}
        <button
          type="button"
          className="quiet"
          onClick={() => {
            editPanels((p) => ({ ...p, image: null }));
          }}
        >
          <Trash2 {...ICON} /> Remove image
        </button>
      </div>
      {one && !single && rowHeight !== null && (
        <label className="fig-field">
          Row height
          <input
            type="number"
            aria-label="Row height, mm"
            min={2}
            max={400}
            step={1}
            value={Math.round(rowHeight * 10) / 10}
            onChange={(e) => {
              const h = Number(e.target.value);
              if (!Number.isFinite(h) || h < 2 || h > 400) return;
              // Rows are kept as proportions; this one is set against the rest.
              const unit = (grid.rows[one.row] ?? 1) / rowHeight;
              onChange(
                { ...grid, rows: grid.rows.map((r, i) => (i === one.row ? h * unit : r)) },
                true,
              );
            }}
          />
          mm
        </label>
      )}
    </>
  );
}
