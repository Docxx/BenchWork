import type { CanvasItem, CanvasLink } from './canvasFile';
import {
  arrowLook,
  BORDERS,
  cardLook,
  colourVar,
  COLOURS,
  ENDS,
  LINES,
  PATHS,
  SHAPES,
  TEXT_SIZES,
  WIDTHS,
  type ArrowLook,
  type CardLook,
  type Colour,
} from './canvasStyle';

const COLOUR_NAMES: Record<Colour, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  grey: 'Grey',
};

const SHAPE_NAMES = {
  rounded: 'Rounded',
  rectangle: 'Rectangle',
  pill: 'Pill',
  ellipse: 'Oval',
  diamond: 'Diamond',
} as const;
const BORDER_NAMES = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', none: 'No border' };
const SIZE_NAMES = { small: 'Small', normal: 'Normal', large: 'Large', huge: 'Huge' } as const;
const LINE_NAMES = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' } as const;
const WIDTH_NAMES = { thin: 'Thin', medium: 'Medium', thick: 'Thick' } as const;
const END_NAMES = {
  end: 'At the end',
  both: 'Both ends',
  start: 'At the start',
  none: 'None',
} as const;
const PATH_NAMES = {
  curved: 'Curved',
  straight: 'Straight',
  step: 'Square bends',
  smooth: 'Rounded bends',
} as const;

/** The value all of `values` share, or null if they differ. */
function shared<T>(values: T[]): T | null {
  const [first] = values;
  return values.every((v) => v === first) ? (first ?? null) : null;
}

function Swatches({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Colour | null | undefined;
  onChange: (colour: Colour | null) => void;
}) {
  return (
    <span className="canvas-swatches" role="group" aria-label={label}>
      <span className="canvas-style-label">{label}</span>
      <button
        type="button"
        className="canvas-swatch none"
        aria-label="None"
        title="None"
        aria-pressed={value === null}
        onClick={() => {
          onChange(null);
        }}
      />
      {COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          className="canvas-swatch"
          style={{ background: colourVar(c) }}
          aria-label={COLOUR_NAMES[c]}
          title={COLOUR_NAMES[c]}
          aria-pressed={value === c}
          onClick={() => {
            onChange(c);
          }}
        />
      ))}
    </span>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  names,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  names: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="canvas-choice">
      <span className="canvas-style-label">{label}</span>
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value as T);
        }}
      >
        {value === null && <option value="">Mixed</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {names[o]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Choices for the cards or arrows that are selected. */
export function CanvasStyleBar({
  cards,
  arrows,
  onCards,
  onArrows,
  onLink,
  onName,
  onReverse,
}: {
  cards: CanvasItem[];
  arrows: CanvasLink[];
  onCards: (changes: Partial<CardLook>) => void;
  onArrows: (changes: Partial<ArrowLook>) => void;
  onLink: () => void;
  onName: () => void;
  onReverse: () => void;
}) {
  if (cards.length === 0 && arrows.length === 0) return null;
  const cardLooks = cards.map(cardLook);
  const arrowLooks = arrows.map(arrowLook);
  const fixedSides = arrowLooks.some((l) => l.fromSide !== null || l.toSide !== null);
  return (
    <div className="canvas-style" role="toolbar" aria-label="Style">
      {cards.length > 0 && (
        <>
          <Swatches
            label="Fill"
            value={shared(cardLooks.map((l) => l.fill))}
            onChange={(fill) => {
              onCards({ fill });
            }}
          />
          <Swatches
            label="Border"
            value={shared(cardLooks.map((l) => l.borderColour))}
            onChange={(borderColour) => {
              onCards({ borderColour });
            }}
          />
          <Choice
            label="Border line"
            value={shared(cardLooks.map((l) => l.border))}
            options={BORDERS}
            names={BORDER_NAMES}
            onChange={(border) => {
              onCards({ border });
            }}
          />
          <Choice
            label="Shape"
            value={shared(cardLooks.map((l) => l.shape))}
            options={SHAPES}
            names={SHAPE_NAMES}
            onChange={(shape) => {
              onCards({ shape });
            }}
          />
          <Choice
            label="Text"
            value={shared(cardLooks.map((l) => l.textSize))}
            options={TEXT_SIZES}
            names={SIZE_NAMES}
            onChange={(textSize) => {
              onCards({ textSize });
            }}
          />
          {cards.length === 1 && (
            <button type="button" className="quiet" onClick={onLink}>
              {cardLooks[0]?.link === null ? 'Link…' : 'Change link…'}
            </button>
          )}
        </>
      )}
      {arrows.length > 0 && (
        <>
          <Swatches
            label="Arrow"
            value={shared(arrowLooks.map((l) => l.colour))}
            onChange={(colour) => {
              onArrows({ colour });
            }}
          />
          <Choice
            label="Line"
            value={shared(arrowLooks.map((l) => l.line))}
            options={LINES}
            names={LINE_NAMES}
            onChange={(line) => {
              onArrows({ line });
            }}
          />
          <Choice
            label="Thickness"
            value={shared(arrowLooks.map((l) => l.width))}
            options={WIDTHS}
            names={WIDTH_NAMES}
            onChange={(width) => {
              onArrows({ width });
            }}
          />
          <Choice
            label="Arrowheads"
            value={shared(arrowLooks.map((l) => l.ends))}
            options={ENDS}
            names={END_NAMES}
            onChange={(ends) => {
              onArrows({ ends });
            }}
          />
          <Choice
            label="Path"
            value={shared(arrowLooks.map((l) => l.path))}
            options={PATHS}
            names={PATH_NAMES}
            onChange={(path) => {
              onArrows({ path });
            }}
          />
          {arrows.length === 1 && (
            <button type="button" className="quiet" onClick={onName}>
              Name…
            </button>
          )}
          <button type="button" className="quiet" onClick={onReverse}>
            Reverse
          </button>
          {fixedSides && (
            <button
              type="button"
              className="quiet"
              title="Join the sides that face each other, wherever the cards move"
              onClick={() => {
                onArrows({ fromSide: null, toSide: null });
              }}
            >
              Facing sides
            </button>
          )}
        </>
      )}
    </div>
  );
}
