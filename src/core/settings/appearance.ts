/**
 * How the app looks: a theme preset, then the user's own choices on top.
 * Everything here becomes CSS custom properties on the root element, and
 * every style in the app (modules included) reads those, so changing a
 * setting restyles everything at once. Saved per device with the other
 * app settings.
 */

export type ThemePreset = 'forest' | 'classic';
export type Scheme = 'light' | 'dark';
export type SidebarStyle = 'dark' | 'light';
export type FontChoice = 'serif' | 'sans';
export type Density = 'compact' | 'comfortable' | 'roomy';
export type PageWidth = 'narrow' | 'normal' | 'wide';

export interface Appearance {
  preset: ThemePreset;
  /** A colour such as `#5b8a76`, or null for the preset's own. */
  accent: string | null;
  /** Null for the preset's own. */
  sidebar: SidebarStyle | null;
  /** Page titles and headings. */
  headingFont: FontChoice;
  /** The text of pages. Menus and buttons always use the sans font. */
  bodyFont: FontChoice;
  /** Base text size in pixels. */
  textSize: number;
  density: Density;
  pageWidth: PageWidth;
  /** The side panel beside pages, with the outline and backlinks. */
  sidePanel: boolean;
  /** The toolbar of formatting and things to insert, above pages. */
  ribbon: boolean;
}

export const TEXT_SIZE_RANGE = { min: 13, max: 20 } as const;

/** The colours of one preset in one scheme. */
interface Palette {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  warnBg: string;
  warnText: string;
}

/** The sidebar's own colours, when it is dark against a light page or the other way. */
interface SidebarPalette {
  bg: string;
  hover: string;
  active: string;
  text: string;
  muted: string;
  border: string;
}

interface PresetSpec {
  name: string;
  light: Palette;
  dark: Palette;
  sidebar: SidebarStyle;
  darkSidebar: SidebarPalette;
  headingFont: FontChoice;
  bodyFont: FontChoice;
}

/** Warm paper, a forest sidebar and sage green: the design from Figma. */
const FOREST: PresetSpec = {
  name: 'Forest',
  light: {
    bg: '#f8f7f3',
    surface: '#efede7',
    border: '#e2dfd7',
    text: '#1d2725',
    muted: '#6b7470',
    accent: '#5b8a76',
    warnBg: '#fbf1e4',
    warnText: '#7a4a12',
  },
  dark: {
    bg: '#171d1c',
    surface: '#202927',
    border: '#2f3b38',
    text: '#e5eae7',
    muted: '#97a39e',
    accent: '#80b49d',
    warnBg: '#3a2c17',
    warnText: '#f2cd94',
  },
  sidebar: 'dark',
  darkSidebar: {
    bg: '#1c2d2a',
    hover: '#253a36',
    active: '#2e4642',
    text: '#e7ece9',
    muted: '#93a49f',
    border: '#2f4440',
  },
  headingFont: 'serif',
  bodyFont: 'serif',
};

/** BenchWork's first look: plain white and grey, in system fonts. */
const CLASSIC: PresetSpec = {
  name: 'Classic',
  light: {
    bg: '#ffffff',
    surface: '#f6f8fa',
    border: '#d0d7de',
    text: '#1f2328',
    muted: '#656d76',
    accent: '#2e6b5e',
    warnBg: '#fff4e5',
    warnText: '#7a4100',
  },
  dark: {
    bg: '#1e1f22',
    surface: '#2b2d31',
    border: '#3f4248',
    text: '#e6e6e6',
    muted: '#9da5b0',
    accent: '#5fb3a1',
    warnBg: '#3a2a12',
    warnText: '#f5c98a',
  },
  sidebar: 'light',
  darkSidebar: {
    bg: '#24292f',
    hover: '#30363d',
    active: '#3a4149',
    text: '#e6e6e6',
    muted: '#9da5b0',
    border: '#3a4149',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

export const PRESETS: Record<ThemePreset, PresetSpec> = { forest: FOREST, classic: CLASSIC };

/** Accent colours to pick from, besides the preset's own and any colour. */
export const ACCENT_CHOICES = [
  { name: 'Sage', value: '#5b8a76' },
  { name: 'Teal', value: '#2a8a8a' },
  { name: 'Blue', value: '#3a6fb0' },
  { name: 'Plum', value: '#7d5ba6' },
  { name: 'Rose', value: '#b0506a' },
  { name: 'Clay', value: '#b8693f' },
  { name: 'Ochre', value: '#a8821e' },
  { name: 'Slate', value: '#56606b' },
] as const;

const FONTS: Record<FontChoice, string> = {
  serif: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, 'Times New Roman', serif",
  sans: "'Inter Variable', Inter, system-ui, 'Segoe UI', sans-serif",
};

/** Spacing multiplier for each density. */
const SPACE: Record<Density, string> = { compact: '0.8', comfortable: '1', roomy: '1.25' };
const WIDTH: Record<PageWidth, string> = { narrow: '38rem', normal: '46rem', wide: '60rem' };

export function defaultAppearance(preset: ThemePreset = 'forest'): Appearance {
  const spec = PRESETS[preset];
  return {
    preset,
    accent: null,
    sidebar: null,
    headingFont: spec.headingFont,
    bodyFont: spec.bodyFont,
    textSize: 16,
    density: 'comfortable',
    pageWidth: 'normal',
    sidePanel: true,
    ribbon: true,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const oneOf = <T extends string>(value: unknown, choices: readonly T[]): value is T =>
  typeof value === 'string' && (choices as readonly string[]).includes(value);

/** Never throws: anything it does not recognise keeps the default. */
export function parseAppearance(data: unknown): Appearance {
  const record =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const preset = oneOf(record['preset'], ['forest', 'classic'] as const)
    ? record['preset']
    : 'forest';
  const result = defaultAppearance(preset);
  const accent = record['accent'];
  if (typeof accent === 'string' && HEX.test(accent)) result.accent = accent.toLowerCase();
  if (oneOf(record['sidebar'], ['dark', 'light'] as const)) result.sidebar = record['sidebar'];
  if (oneOf(record['headingFont'], ['serif', 'sans'] as const))
    result.headingFont = record['headingFont'];
  if (oneOf(record['bodyFont'], ['serif', 'sans'] as const)) result.bodyFont = record['bodyFont'];
  const size = record['textSize'];
  if (typeof size === 'number' && Number.isFinite(size)) {
    result.textSize = Math.round(
      Math.min(TEXT_SIZE_RANGE.max, Math.max(TEXT_SIZE_RANGE.min, size)),
    );
  }
  if (oneOf(record['density'], ['compact', 'comfortable', 'roomy'] as const))
    result.density = record['density'];
  if (oneOf(record['pageWidth'], ['narrow', 'normal', 'wide'] as const))
    result.pageWidth = record['pageWidth'];
  if (typeof record['sidePanel'] === 'boolean') result.sidePanel = record['sidePanel'];
  if (typeof record['ribbon'] === 'boolean') result.ribbon = record['ribbon'];
  return result;
}

/** Black or white, whichever reads better on `hex`. */
export function textOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return luminance > 0.35 ? '#10201a' : '#ffffff';
}

/** Lighter in dark mode, so a chosen accent still reads on a dark page. */
function forScheme(accent: string, scheme: Scheme): string {
  if (scheme === 'light') return accent;
  const n = Number.parseInt(accent.slice(1), 16);
  const lift = (c: number) => Math.round(c + (255 - c) * 0.3);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(lift);
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The CSS custom properties for an appearance in a scheme. */
export function appearanceTokens(appearance: Appearance, scheme: Scheme): Record<string, string> {
  const spec = PRESETS[appearance.preset];
  const palette = spec[scheme];
  const accent = appearance.accent === null ? palette.accent : forScheme(appearance.accent, scheme);
  // A dark sidebar on a dark page takes the page's own colours, a shade apart.
  const sidebarStyle = appearance.sidebar ?? spec.sidebar;
  const sidebar: SidebarPalette =
    sidebarStyle === 'dark' && scheme === 'light'
      ? spec.darkSidebar
      : {
          bg: scheme === 'dark' && sidebarStyle === 'dark' ? spec.darkSidebar.bg : palette.surface,
          hover: `color-mix(in srgb, ${palette.text} 7%, transparent)`,
          active: `color-mix(in srgb, ${accent} 18%, transparent)`,
          text: palette.text,
          muted: palette.muted,
          border: palette.border,
        };
  return {
    '--bg': palette.bg,
    '--surface': palette.surface,
    '--border': palette.border,
    '--text': palette.text,
    '--muted': palette.muted,
    '--accent': accent,
    '--accent-text': textOn(accent),
    '--accent-soft': `color-mix(in srgb, ${accent} 14%, ${palette.bg})`,
    '--warn-bg': palette.warnBg,
    '--warn-text': palette.warnText,
    '--sidebar-bg': sidebar.bg,
    '--sidebar-hover': sidebar.hover,
    '--sidebar-active': sidebar.active,
    '--sidebar-text': sidebar.text,
    '--sidebar-muted': sidebar.muted,
    '--sidebar-border': sidebar.border,
    '--font-ui': FONTS.sans,
    '--font-heading': FONTS[appearance.headingFont],
    '--font-body': FONTS[appearance.bodyFont],
    '--text-size': `${String(appearance.textSize)}px`,
    '--space': SPACE[appearance.density],
    '--page-width': WIDTH[appearance.pageWidth],
  };
}
