import { BringToFront, Copy, SendToBack, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TEXT_ALIGNS, type Block, type FigureDoc, type TextBox } from './doc';
import { Text } from './TextField';
import { PAGE_WIDTHS } from './model';

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;

/** A number in mm that saves as it is typed, if it is within bounds. */
function Mm({
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
  onSave: (v: number) => void;
}) {
  return (
    <label className="fig-field">
      {label}
      <input
        type="number"
        aria-label={`${label}, mm`}
        min={min}
        max={max}
        step={0.5}
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onSave(v);
        }}
      />
    </label>
  );
}

/** The page, with nothing chosen: its width, the space blocks keep, and letters. */
export function PageControls({
  doc,
  tablet,
  onChange,
}: {
  doc: FigureDoc;
  tablet: boolean;
  onChange: (d: FigureDoc) => void;
}) {
  return (
    <>
      <p className="hint">
        {tablet
          ? 'Add images, a grid or text, then drag them into place. Press one to change it; once chosen, drag inside an image to move it in its frame.'
          : 'Drop images onto the page, or add a grid or text, then drag them into place. Click one to change it; once chosen, drag inside an image to move it in its frame.'}
      </p>
      <label className="fig-field">
        Width
        <select
          aria-label="Page width"
          value={PAGE_WIDTHS.find((w) => w.width === doc.width)?.width ?? 'own'}
          onChange={(e) => {
            if (e.target.value !== 'own') onChange({ ...doc, width: Number(e.target.value) });
          }}
        >
          {PAGE_WIDTHS.map((w) => (
            <option key={w.width} value={w.width}>
              {w.name}, {w.width} mm
            </option>
          ))}
          {!PAGE_WIDTHS.some((w) => w.width === doc.width) && (
            <option value="own">{doc.width} mm</option>
          )}
        </select>
      </label>
      <Mm
        label="Space between parts"
        value={doc.gap}
        min={0}
        max={20}
        onSave={(gap) => {
          onChange({ ...doc, gap });
        }}
      />
      <fieldset>
        <legend>Letters</legend>
        <label className="fig-check">
          <input
            type="checkbox"
            checked={doc.letters.show}
            onChange={(e) => {
              onChange({ ...doc, letters: { ...doc.letters, show: e.target.checked } });
            }}
          />
          Letter each part
        </label>
        <label className="fig-field">
          Style
          <select
            aria-label="Letter style"
            value={doc.letters.form}
            onChange={(e) => {
              const form = (['upper', 'lower', 'brackets'] as const).find(
                (f) => f === e.target.value,
              );
              if (form) onChange({ ...doc, letters: { ...doc.letters, form } });
            }}
          >
            <option value="upper">A, B, C</option>
            <option value="lower">a, b, c</option>
            <option value="brackets">(a), (b), (c)</option>
          </select>
        </label>
        <label className="fig-field">
          Size
          <input
            type="number"
            aria-label="Letter size, points"
            min={4}
            max={36}
            value={doc.letters.size}
            onChange={(e) => {
              const size = Number(e.target.value);
              if (size >= 4 && size <= 36) onChange({ ...doc, letters: { ...doc.letters, size } });
            }}
          />
          pt
        </label>
      </fieldset>
    </>
  );
}

/** What any chosen block has: its letter, where it is and how big, and arranging it. */
export function BlockControls({
  block,
  shownLetter,
  pageWidth,
  onChange,
  onDuplicate,
  onRestack,
  onRemove,
}: {
  block: Block;
  /** The letter it shows now, for the hint. */
  shownLetter: string;
  pageWidth: number;
  onChange: (b: Block) => void;
  onDuplicate: () => void;
  onRestack: (front: boolean) => void;
  onRemove: () => void;
}) {
  const mode = block.letter === null ? 'auto' : block.letter === '' ? 'none' : 'own';
  return (
    <>
      <fieldset>
        <legend>Letter</legend>
        <select
          aria-label="Letter"
          value={mode}
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...block,
              letter: v === 'auto' ? null : v === 'none' ? '' : shownLetter || 'A',
            });
          }}
        >
          <option value="auto">
            {block.kind === 'text' ? 'None' : 'Next in order'}
            {mode === 'auto' && shownLetter !== '' ? ` (${shownLetter})` : ''}
          </option>
          {block.kind !== 'text' && <option value="none">None</option>}
          <option value="own">Its own</option>
        </select>
        {mode === 'own' && (
          <Text
            label="Its own letter"
            hint="A′"
            value={block.letter ?? ''}
            onSave={(v) => {
              onChange({ ...block, letter: v.trim() === '' ? null : v.trim() });
            }}
          />
        )}
      </fieldset>
      <fieldset className="fig-place">
        <legend>Place and size</legend>
        <Mm
          label="Left"
          value={block.x}
          min={-pageWidth}
          max={pageWidth * 2}
          onSave={(x) => {
            onChange({ ...block, x });
          }}
        />
        <Mm
          label="Top"
          value={block.y}
          min={0}
          max={5000}
          onSave={(y) => {
            onChange({ ...block, y });
          }}
        />
        <Mm
          label="Width"
          value={block.w}
          min={2}
          max={2000}
          onSave={(w) => {
            onChange({ ...block, w });
          }}
        />
        <Mm
          label="Height"
          value={block.h}
          min={2}
          max={2000}
          onSave={(h) => {
            onChange({ ...block, h });
          }}
        />
      </fieldset>
      <div className="tool-group" role="group" aria-label="Arrange">
        <button
          type="button"
          className="tool"
          title="Duplicate"
          aria-label="Duplicate"
          onClick={onDuplicate}
        >
          <Copy {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Bring to front"
          aria-label="Bring to front"
          onClick={() => {
            onRestack(true);
          }}
        >
          <BringToFront {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Send to back"
          aria-label="Send to back"
          onClick={() => {
            onRestack(false);
          }}
        >
          <SendToBack {...ICON} />
        </button>
        <button
          type="button"
          className="tool"
          title="Delete"
          aria-label="Delete"
          onClick={onRemove}
        >
          <Trash2 {...ICON} />
        </button>
      </div>
    </>
  );
}

/** A text box's words and how they look. */
export function TextControls({
  text,
  onChange,
}: {
  text: TextBox;
  onChange: (t: TextBox) => void;
}) {
  const [draft, setDraft] = useState(text.text);
  const [shown, setShown] = useState(text.text);
  if (text.text !== shown) {
    setShown(text.text);
    setDraft(text.text);
  }
  return (
    <>
      <textarea
        id="fig-text-input"
        aria-label="Text"
        rows={4}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={() => {
          if (draft !== text.text) onChange({ ...text, text: draft });
        }}
      />
      <p className="hint fig-help">
        Type <code>*w*</code> for italics, <code>Myd88^KO^</code> to raise, <code>CO~2~</code> to
        lower, <code>**A**</code> for bold.
      </p>
      <label className="fig-field">
        Size
        <input
          type="number"
          aria-label="Text size, points"
          min={4}
          max={48}
          value={text.size}
          onChange={(e) => {
            const size = Number(e.target.value);
            if (size >= 4 && size <= 48) onChange({ ...text, size });
          }}
        />
        pt
      </label>
      <label className="fig-field">
        Line up
        <select
          aria-label="Line up text"
          value={text.align}
          onChange={(e) => {
            const align = TEXT_ALIGNS.find((a) => a === e.target.value);
            if (align) onChange({ ...text, align });
          }}
        >
          <option value="left">Left</option>
          <option value="center">Middle</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label className="fig-field">
        Colour
        <input
          type="color"
          aria-label="Text colour"
          value={text.colour}
          onChange={(e) => {
            onChange({ ...text, colour: e.target.value });
          }}
        />
      </label>
      <label className="fig-check">
        <input
          type="checkbox"
          checked={text.upright}
          onChange={(e) => {
            onChange({ ...text, upright: e.target.checked });
          }}
        />
        Read upwards, as a side label
      </label>
    </>
  );
}
