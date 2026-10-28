import type { CSSProperties } from 'react';
import {
  ACCENT_CHOICES,
  PAPER_CHOICES,
  PRESETS,
  TEXT_SIZE_RANGE,
  type Density,
  type FontChoice,
  type PageWidth,
  type PaperPattern,
  type ThemePreset,
} from '../settings/appearance';
import type { Theme } from '../settings/appSettings';
import { useApp } from './AppStoreContext';

const SCHEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DENSITIES: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'roomy', label: 'Roomy' },
];

const WIDTHS: { value: PageWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
];

// Each font's name is written in that font, as a sample.
const FONTS: { value: FontChoice; label: string; style: CSSProperties }[] = [
  { value: 'serif', label: 'Serif', style: { fontFamily: "'Source Serif 4 Variable', serif" } },
  { value: 'sans', label: 'Sans serif', style: { fontFamily: "'Inter Variable', sans-serif" } },
];

const PATTERNS: { value: PaperPattern; label: string }[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'dots', label: 'Dots' },
  { value: 'lines', label: 'Lines' },
  { value: 'grid', label: 'Grid' },
];

/** A row of radio buttons for one choice. */
function Choices<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; style?: CSSProperties }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="choice-row">
        {options.map((o) => (
          <label key={o.value} className="choice" style={o.style}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => {
                onChange(o.value);
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Theme, colours, fonts and sizes. Every change shows at once, across the app. */
export function AppearanceSettings() {
  const theme = useApp((s) => s.settings.theme);
  const appearance = useApp((s) => s.settings.appearance);
  const setTheme = useApp((s) => s.setTheme);
  const setAppearance = useApp((s) => s.setAppearance);
  const resetAppearance = useApp((s) => s.resetAppearance);
  const preset = PRESETS[appearance.preset];

  const choosePreset = (id: ThemePreset) => {
    const spec = PRESETS[id];
    void setAppearance({
      preset: id,
      accent: null,
      sidebar: null,
      headingFont: spec.headingFont,
      bodyFont: spec.bodyFont,
    });
  };

  return (
    <div className="appearance">
      <fieldset className="field">
        <legend>Theme</legend>
        <div className="preset-row">
          {(Object.keys(PRESETS) as ThemePreset[]).map((id) => {
            const spec = PRESETS[id];
            const sidebar = spec.sidebar === 'dark' ? spec.darkSidebar.bg : spec.light.surface;
            return (
              <label key={id} className="preset-card">
                <input
                  type="radio"
                  name="preset"
                  value={id}
                  checked={appearance.preset === id}
                  onChange={() => {
                    choosePreset(id);
                  }}
                />
                <span className="preset-swatch" aria-hidden="true">
                  <span style={{ background: sidebar }} />
                  <span style={{ background: spec.light.bg }}>
                    <i style={{ background: spec.light.accent }} />
                  </span>
                </span>
                {spec.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Choices
        legend="Light or dark"
        name="theme"
        value={theme}
        options={SCHEMES}
        onChange={(t) => void setTheme(t)}
      />

      <fieldset className="field">
        <legend>Accent colour</legend>
        <div className="swatch-row">
          <button
            type="button"
            className="swatch"
            aria-pressed={appearance.accent === null}
            title={`${preset.name} colour`}
            style={{ background: preset.light.accent }}
            onClick={() => void setAppearance({ accent: null })}
          >
            <span className="visually-hidden">{preset.name} colour</span>
          </button>
          {ACCENT_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              className="swatch"
              aria-pressed={appearance.accent === c.value}
              title={c.name}
              style={{ background: c.value }}
              onClick={() => void setAppearance({ accent: c.value })}
            >
              <span className="visually-hidden">{c.name}</span>
            </button>
          ))}
          <label className="swatch-custom">
            <input
              type="color"
              aria-label="Any colour"
              value={appearance.accent ?? preset.light.accent}
              onChange={(e) => void setAppearance({ accent: e.target.value })}
            />
            Any colour
          </label>
        </div>
      </fieldset>

      <Choices
        legend="Sidebar"
        name="sidebar"
        value={appearance.sidebar ?? preset.sidebar}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
        ]}
        onChange={(sidebar) => void setAppearance({ sidebar })}
      />

      <Choices
        legend="Titles and headings"
        name="heading-font"
        value={appearance.headingFont}
        options={FONTS}
        onChange={(headingFont) => void setAppearance({ headingFont })}
      />
      <Choices
        legend="Page text"
        name="body-font"
        value={appearance.bodyFont}
        options={FONTS}
        onChange={(bodyFont) => void setAppearance({ bodyFont })}
      />

      <fieldset className="field">
        <legend>Text size</legend>
        <div className="choice-row">
          <input
            type="range"
            aria-label="Text size"
            min={TEXT_SIZE_RANGE.min}
            max={TEXT_SIZE_RANGE.max}
            step={1}
            value={appearance.textSize}
            onChange={(e) => void setAppearance({ textSize: Number(e.target.value) })}
          />
          <output>{appearance.textSize}px</output>
        </div>
      </fieldset>

      <Choices
        legend="Spacing"
        name="density"
        value={appearance.density}
        options={DENSITIES}
        onChange={(density) => void setAppearance({ density })}
      />
      <Choices
        legend="Page width"
        name="page-width"
        value={appearance.pageWidth}
        options={WIDTHS}
        onChange={(pageWidth) => void setAppearance({ pageWidth })}
      />

      <fieldset className="field">
        <legend>Page colour</legend>
        <div className="swatch-row">
          <button
            type="button"
            className="swatch paper"
            aria-pressed={appearance.paper === null}
            title={`${preset.name} page`}
            style={{ background: preset.light.bg }}
            onClick={() => void setAppearance({ paper: null })}
          >
            <span className="visually-hidden">{preset.name} page</span>
          </button>
          {PAPER_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              className="swatch paper"
              aria-pressed={appearance.paper === c.value}
              title={c.name}
              style={{ background: c.value }}
              onClick={() => void setAppearance({ paper: c.value })}
            >
              <span className="visually-hidden">{c.name}</span>
            </button>
          ))}
          <label className="swatch-custom">
            <input
              type="color"
              aria-label="Any page colour"
              value={appearance.paper ?? preset.light.bg}
              onChange={(e) => void setAppearance({ paper: e.target.value })}
            />
            Any colour
          </label>
        </div>
        <p className="hint">On dark pages, the colour shows as a tint.</p>
      </fieldset>

      <fieldset className="field">
        <legend>Page pattern</legend>
        <div className="choice-row">
          {PATTERNS.map((o) => (
            <label key={o.value} className="pattern-card">
              <input
                type="radio"
                name="pattern"
                value={o.value}
                checked={appearance.pattern === o.value}
                onChange={() => void setAppearance({ pattern: o.value })}
              />
              <span className={`pattern-sample ${o.value}`} aria-hidden="true" />
              {o.label}
            </label>
          ))}
        </div>
        <label className="choice">
          <input
            type="checkbox"
            checked={appearance.patternOnDocuments}
            onChange={(e) => void setAppearance({ patternOnDocuments: e.target.checked })}
          />
          On document pages too, not only free layout pages
        </label>
      </fieldset>

      <fieldset className="field">
        <legend>Toolbar</legend>
        <label className="choice">
          <input
            type="checkbox"
            checked={appearance.ribbon}
            onChange={(e) => void setAppearance({ ribbon: e.target.checked })}
          />
          Show formatting and things to insert above pages
        </label>
        <p className="hint">The / menu and keyboard shortcuts work either way.</p>
      </fieldset>

      <fieldset className="field">
        <legend>Side panel</legend>
        <label className="choice">
          <input
            type="checkbox"
            checked={appearance.sidePanel}
            onChange={(e) => void setAppearance({ sidePanel: e.target.checked })}
          />
          Show the outline and links beside pages
        </label>
      </fieldset>

      <fieldset className="field">
        <legend>Opening</legend>
        <label className="choice">
          <input
            type="checkbox"
            checked={appearance.startupAnimation}
            onChange={(e) => void setAppearance({ startupAnimation: e.target.checked })}
          />
          Show a short animation as BenchWork opens
        </label>
      </fieldset>

      <p className="hint">
        Drag the edge of the sidebar or the side panel to change its width. Double-click the edge to
        reset it.
      </p>

      <div className="actions">
        <button type="button" className="quiet" onClick={() => void resetAppearance()}>
          Reset to the theme’s own look
        </button>
      </div>
      <p className="hint">Saved on this device only.</p>
    </div>
  );
}
