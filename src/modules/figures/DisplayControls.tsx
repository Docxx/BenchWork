import { useState } from 'react';
import { rangeTop, showsFor } from './images';
import {
  displayGroup,
  CHANNEL_COLOURS,
  type ChannelShow,
  type Corner,
  type Figure,
  type Panel,
} from './model';
import type { Planes } from './tiff';

const SCOPES = [
  { value: 'figure', label: 'The whole figure', group: 'every panel' },
  { value: 'row', label: 'Each row', group: 'every panel in this row' },
  { value: 'col', label: 'Each column', group: 'every panel in this column' },
] as const;

const CORNERS: { value: Corner; label: string }[] = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
];

/** A number box that saves when it loses focus or Enter is pressed; blank for none. */
function NumberBox({
  label,
  value,
  onSave,
  step = 'any',
  hint,
}: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => void;
  step?: string;
  hint?: string;
}) {
  const text = value === null ? '' : String(value);
  const [draft, setDraft] = useState(text);
  const [shown, setShown] = useState(text);
  if (text !== shown) {
    setShown(text);
    setDraft(text);
  }
  const commit = () => {
    if (draft === text) return;
    const n = Number(draft);
    onSave(draft.trim() === '' || !(n > 0) ? null : n);
  };
  return (
    <input
      type="number"
      aria-label={label}
      placeholder={hint}
      step={step}
      min={0}
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

/**
 * Brightness and contrast, set for a whole group of panels at once (the
 * figure, a row or a column), so compared panels are treated alike; and
 * channel colours and which channels show.
 */
export function DisplayControls({
  figure,
  panels,
  planes,
  onChange,
}: {
  figure: Figure;
  panels: readonly Panel[];
  planes: ReadonlyMap<string, Planes>;
  onChange: (f: Figure) => void;
}) {
  const first = panels.find((p) => p.image && planes.has(p.image.path));
  const read = first?.image ? planes.get(first.image.path) : undefined;
  if (!first || !read) return null;
  const shows = showsFor(figure, first, read, planes);
  const top = rangeTop(read);
  const scope = SCOPES.find((s) => s.value === figure.display.scope) ?? SCOPES[0];
  const groups = [...new Set(panels.map((p) => displayGroup(figure.display, p)))];

  /** Sets one channel's showing in every chosen panel's group. */
  const setChannel = (i: number, change: Partial<ChannelShow>) => {
    const next = { ...figure.display.groups };
    for (const g of groups) {
      const member = panels.find((p) => displayGroup(figure.display, p) === g) ?? first;
      const memberPlanes = member.image ? planes.get(member.image.path) : undefined;
      const base = next[g] ?? showsFor(figure, member, memberPlanes ?? read, planes);
      next[g] = base.map((s, j) => (j === i ? { ...s, ...change } : s));
    }
    onChange({ ...figure, display: { ...figure.display, groups: next } });
  };

  /** The highest value of a channel among the images in the chosen panels' groups. */
  const peakInGroups = (i: number) => {
    let peak = 0;
    for (const p of figure.panels) {
      if (!groups.includes(displayGroup(figure.display, p)) || !p.image) continue;
      peak = Math.max(peak, planes.get(p.image.path)?.peaks[i] ?? 0);
    }
    return peak > 0 ? peak : top;
  };

  return (
    <fieldset className="fig-display">
      <legend>Brightness and contrast</legend>
      <label className="fig-field">
        Set for
        <select
          aria-label="Set brightness and contrast for"
          value={figure.display.scope}
          onChange={(e) => {
            const value = SCOPES.find((s) => s.value === e.target.value)?.value ?? 'figure';
            onChange({ ...figure, display: { ...figure.display, scope: value } });
          }}
        >
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">Changes apply to {scope.group}, so they stay comparable.</p>
      {shows.map((show, i) => (
        <div key={i} className="fig-channel-show">
          <label className="choice">
            <input
              type="checkbox"
              checked={show.on}
              onChange={(e) => {
                setChannel(i, { on: e.target.checked });
              }}
            />
            {read.rgb
              ? (['Red', 'Green', 'Blue'][i] ?? `Channel ${String(i + 1)}`)
              : `Channel ${String(i + 1)}`}
          </label>
          {!read.rgb && (
            <div
              className="fig-swatches"
              role="group"
              aria-label={`Colour of channel ${String(i + 1)}`}
            >
              {CHANNEL_COLOURS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="colour-chip"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={show.colour === c.value}
                  style={{ background: c.value }}
                  onClick={() => {
                    setChannel(i, { colour: c.value });
                  }}
                />
              ))}
            </div>
          )}
          <label className="fig-range">
            <span>Black at</span>
            <input
              type="range"
              aria-label={`Channel ${String(i + 1)} black at`}
              min={0}
              max={top}
              step={top > 1 ? 1 : 0.001}
              value={show.min}
              onChange={(e) => {
                setChannel(i, { min: Math.min(Number(e.target.value), show.max - 1) });
              }}
            />
            <span className="fig-value">{Math.round(show.min)}</span>
          </label>
          <label className="fig-range">
            <span>Full at</span>
            <input
              type="range"
              aria-label={`Channel ${String(i + 1)} full at`}
              min={0}
              max={top}
              step={top > 1 ? 1 : 0.001}
              value={show.max}
              onChange={(e) => {
                setChannel(i, { max: Math.max(Number(e.target.value), show.min + 1) });
              }}
            />
            <span className="fig-value">{Math.round(show.max)}</span>
          </label>
          <button
            type="button"
            className="quiet"
            title="From zero to the brightest value in these panels"
            onClick={() => {
              setChannel(i, { min: 0, max: peakInGroups(i) });
            }}
          >
            Fit to brightest
          </button>
        </div>
      ))}
      <button
        type="button"
        className="quiet"
        onClick={() => {
          const next = Object.fromEntries(
            Object.entries(figure.display.groups).filter(([g]) => !groups.includes(g)),
          );
          onChange({ ...figure, display: { ...figure.display, groups: next } });
        }}
      >
        Reset to as read
      </button>
    </fieldset>
  );
}

/** The chosen panels' pixel size and scale bar, and the figure's scale bar settings. */
export function ScaleControls({
  figure,
  panels,
  onChange,
}: {
  figure: Figure;
  panels: readonly Panel[];
  onChange: (f: Figure) => void;
}) {
  const withImages = panels.filter((p) => p.image);
  if (withImages.length === 0) return null;
  const ids = new Set(withImages.map((p) => p.id));
  const size = withImages[0]?.image?.umPerPx ?? null;
  const same = withImages.every((p) => (p.image?.umPerPx ?? null) === size);
  const on = withImages.every((p) => p.scaleBar);
  const bar = figure.scaleBar;
  const setBar = (change: Partial<typeof bar>) => {
    onChange({ ...figure, scaleBar: { ...bar, ...change } });
  };
  const missing = withImages.some((p) => p.image?.umPerPx === null);
  return (
    <fieldset className="fig-scale">
      <legend>Scale</legend>
      <label className="fig-field">
        Pixel size
        <NumberBox
          label="Pixel size, µm per pixel"
          value={same ? size : null}
          hint={same ? 'Not known' : 'Differs'}
          onSave={(v) => {
            onChange({
              ...figure,
              panels: figure.panels.map((p) =>
                ids.has(p.id) && p.image ? { ...p, image: { ...p.image, umPerPx: v } } : p,
              ),
            });
          }}
        />
        µm
      </label>
      <label className="choice">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            onChange({
              ...figure,
              panels: figure.panels.map((p) =>
                ids.has(p.id) ? { ...p, scaleBar: e.target.checked } : p,
              ),
            });
          }}
        />
        Scale bar here
      </label>
      {on && missing && <p className="hint">Add the pixel size to draw the bar.</p>}
      {on && (
        <>
          <div className="fig-row">
            <label className="fig-field">
              Length
              <NumberBox
                label="Scale bar length, µm"
                value={bar.um}
                onSave={(v) => {
                  if (v !== null) setBar({ um: v });
                }}
              />
              µm
            </label>
            <select
              aria-label="Scale bar corner"
              value={bar.corner}
              onChange={(e) => {
                setBar({
                  corner: CORNERS.find((c) => c.value === e.target.value)?.value ?? 'bottom-right',
                });
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
              Thickness
              <NumberBox
                label="Scale bar thickness, mm"
                value={bar.thickness}
                step="0.1"
                onSave={(v) => {
                  if (v !== null) setBar({ thickness: Math.min(5, v) });
                }}
              />
              mm
            </label>
            <select
              aria-label="Scale bar colour"
              value={bar.colour}
              onChange={(e) => {
                setBar({ colour: e.target.value });
              }}
            >
              <option value="#ffffff">White</option>
              <option value="#000000">Black</option>
            </select>
          </div>
          <label className="choice">
            <input
              type="checkbox"
              checked={bar.text}
              onChange={(e) => {
                setBar({ text: e.target.checked });
              }}
            />
            Write the length by the bar
          </label>
          <p className="hint">
            The same length is used in every panel; say it in the legend if the bars are unlabelled.
          </p>
        </>
      )}
    </fieldset>
  );
}
