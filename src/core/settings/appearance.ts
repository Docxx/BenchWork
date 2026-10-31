/**
 * How the app looks: a theme preset, then the user's own choices on top.
 * Everything here becomes CSS custom properties on the root element, and
 * every style in the app (modules included) reads those, so changing a
 * setting restyles everything at once. Saved per device with the other
 * app settings.
 */

export type ThemePreset =
  | 'forest'
  | 'classic'
  | 'ocean'
  | 'heather'
  | 'clay'
  | 'graphite'
  | 'sepia'
  | 'bridge'
  | 'dino'
  | 'space'
  | 'neon'
  | 'terminal'
  | 'mars'
  | 'galaxy'
  | 'xeno'
  | 'moonlit'
  | 'wizard'
  | 'sparkle'
  | 'synthwave'
  | 'deep';
export type Scheme = 'light' | 'dark';
export type SidebarStyle = 'dark' | 'light';
export type FontChoice = 'serif' | 'sans' | 'mono';
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
  /** The colour behind pages, such as `#fbf4de`, or null for the theme's own. */
  paper: string | null;
  /** What is drawn on free layout pages. */
  pattern: PaperPattern;
  /** Whether document pages show the pattern too. */
  patternOnDocuments: boolean;
  /** Widths in pixels, set by dragging the edge of each. */
  sidebarWidth: number;
  panelWidth: number;
  /** A short animation as the app opens. */
  startupAnimation: boolean;
}

export type PaperPattern = 'plain' | 'dots' | 'lines' | 'grid';
export const PAPER_PATTERNS: readonly PaperPattern[] = ['plain', 'dots', 'lines', 'grid'];

export const TEXT_SIZE_RANGE = { min: 13, max: 20 } as const;
export const SIDEBAR_WIDTH = { min: 200, max: 440, initial: 260 } as const;
export const PANEL_WIDTH = { min: 240, max: 520, initial: 304 } as const;

/** Page colours to pick from, besides the theme's own and any colour. */
export const PAPER_CHOICES = [
  { name: 'White', value: '#ffffff' },
  { name: 'Cream', value: '#fbf4de' },
  { name: 'Mint', value: '#e8f3ec' },
  { name: 'Sky', value: '#e6eff9' },
  { name: 'Blush', value: '#f9e9ee' },
  { name: 'Stone', value: '#eceae4' },
] as const;

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

export type SectionColour =
  'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'grey';

/** The usual section colours, for themes without their own. */
const SECTIONS: Record<SectionColour, string> = {
  red: '#d1495b',
  orange: '#c8794f',
  yellow: '#c99a1e',
  green: '#5b8a5a',
  teal: '#2a9d8f',
  blue: '#4a78b8',
  purple: '#8a7cb8',
  grey: '#8c959f',
};

export interface PresetSpec {
  name: string;
  light: Palette;
  dark: Palette;
  /** Always this scheme, whatever Light or dark says; the fun themes are always dark. */
  fixedScheme?: Scheme;
  /** Listed with the fun themes, which also have effects of their own in themes.css. */
  fun?: boolean;
  sidebar: SidebarStyle;
  darkSidebar: SidebarPalette;
  /** Its own section colours, used for notebooks, cards and canvases. */
  sections?: Record<SectionColour, string>;
  /** Accent colours offered with it, in place of the usual ones. */
  accents?: readonly { name: string; value: string }[];
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

/** Cool blues and a deep sea sidebar. */
const OCEAN: PresetSpec = {
  name: 'Ocean',
  light: {
    bg: '#f5f8fa',
    surface: '#eaf0f4',
    border: '#d8e1e8',
    text: '#16232e',
    muted: '#5f6f7c',
    accent: '#2f6f9f',
    warnBg: '#fbf1e4',
    warnText: '#7a4a12',
  },
  dark: {
    bg: '#121a21',
    surface: '#1b252e',
    border: '#2a3742',
    text: '#e3eaf0',
    muted: '#93a3b1',
    accent: '#6fa8d6',
    warnBg: '#3a2c17',
    warnText: '#f2cd94',
  },
  sidebar: 'dark',
  darkSidebar: {
    bg: '#15293a',
    hover: '#1d3549',
    active: '#26425a',
    text: '#e6eef5',
    muted: '#8fa6ba',
    border: '#24394d',
  },
  headingFont: 'serif',
  bodyFont: 'sans',
};

/** Soft purples. */
const HEATHER: PresetSpec = {
  name: 'Heather',
  light: {
    bg: '#faf8fb',
    surface: '#f1edf3',
    border: '#e3dce8',
    text: '#241d2a',
    muted: '#6e6476',
    accent: '#7d5ba6',
    warnBg: '#fbf1e4',
    warnText: '#7a4a12',
  },
  dark: {
    bg: '#1a161e',
    surface: '#241e2a',
    border: '#352d3d',
    text: '#ebe5f0',
    muted: '#a397ad',
    accent: '#b49ad8',
    warnBg: '#3a2c17',
    warnText: '#f2cd94',
  },
  sidebar: 'dark',
  darkSidebar: {
    bg: '#2b2034',
    hover: '#362a41',
    active: '#43344f',
    text: '#efe8f4',
    muted: '#a596b2',
    border: '#3b2f46',
  },
  headingFont: 'serif',
  bodyFont: 'sans',
};

/** Warm earth and terracotta. */
const CLAY: PresetSpec = {
  name: 'Clay',
  light: {
    bg: '#fbf7f2',
    surface: '#f3ebe2',
    border: '#e6dacd',
    text: '#2b211b',
    muted: '#77685d',
    accent: '#b8693f',
    warnBg: '#fbf1e4',
    warnText: '#7a4a12',
  },
  dark: {
    bg: '#1c1714',
    surface: '#271f1a',
    border: '#3a2f28',
    text: '#efe6de',
    muted: '#ab9b8e',
    accent: '#e0976c',
    warnBg: '#3a2c17',
    warnText: '#f2cd94',
  },
  sidebar: 'dark',
  darkSidebar: {
    bg: '#3a261c',
    hover: '#463026',
    active: '#553b2f',
    text: '#f5ebe3',
    muted: '#c0a898',
    border: '#4a3328',
  },
  headingFont: 'serif',
  bodyFont: 'serif',
};

/** Neutral greys with a clear blue: high contrast. */
const GRAPHITE: PresetSpec = {
  name: 'Graphite',
  light: {
    bg: '#ffffff',
    surface: '#f2f2f3',
    border: '#dcdcdf',
    text: '#111214',
    muted: '#5d6068',
    accent: '#2563c9',
    warnBg: '#fff4e5',
    warnText: '#7a4100',
  },
  dark: {
    bg: '#141516',
    surface: '#1e1f21',
    border: '#303236',
    text: '#ededee',
    muted: '#9b9ea5',
    accent: '#7aa7ef',
    warnBg: '#3a2a12',
    warnText: '#f5c98a',
  },
  sidebar: 'dark',
  darkSidebar: {
    bg: '#1d1e21',
    hover: '#28292d',
    active: '#33353a',
    text: '#ececee',
    muted: '#9a9ca3',
    border: '#2c2e32',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

/** Old paper and brown ink, easy on the eyes for long reading. */
const SEPIA: PresetSpec = {
  name: 'Sepia',
  light: {
    bg: '#f6efe1',
    surface: '#ede3d0',
    border: '#ddd0b8',
    text: '#3b2f22',
    muted: '#7a6a55',
    accent: '#8a5a2b',
    warnBg: '#fbe9cf',
    warnText: '#7a4a12',
  },
  dark: {
    bg: '#1f1a14',
    surface: '#2a231b',
    border: '#3b3226',
    text: '#e9dcc6',
    muted: '#a8977d',
    accent: '#d1a066',
    warnBg: '#3a2c17',
    warnText: '#f2cd94',
  },
  sidebar: 'light',
  darkSidebar: {
    bg: '#2e251b',
    hover: '#3a2f23',
    active: '#46392b',
    text: '#f0e4cf',
    muted: '#ad9b80',
    border: '#3f3427',
  },
  headingFont: 'serif',
  bodyFont: 'serif',
};

const BRIDGE_DARK: Palette = {
  bg: '#07070b',
  surface: '#15141f',
  border: '#2c2a42',
  text: '#f6ecdf',
  muted: '#b9abcf',
  accent: '#ff9c3d',
  warnBg: '#3d2312',
  warnText: '#ffcc99',
};

const BRIDGE: PresetSpec = {
  name: 'Starship bridge',
  light: BRIDGE_DARK,
  dark: BRIDGE_DARK,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#000000',
    hover: 'rgba(255, 156, 61, 0.12)',
    active: 'rgba(204, 153, 204, 0.3)',
    text: '#ffcc99',
    muted: '#9f9fd6',
    border: '#26243a',
  },
  sections: {
    red: '#e0525a',
    orange: '#ff9c3d',
    yellow: '#ffcc66',
    green: '#a6d672',
    teal: '#6fd3d3',
    blue: '#9a9cff',
    purple: '#cc99cc',
    grey: '#9a98b8',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

const DINO_DARK: Palette = {
  bg: '#14130c',
  surface: '#1f1d13',
  border: '#3a3723',
  text: '#efe8d2',
  muted: '#b2aa84',
  accent: '#e3a72f',
  warnBg: '#3b2a0c',
  warnText: '#ffd27a',
};

const DINO: PresetSpec = {
  name: 'Dino park',
  light: DINO_DARK,
  dark: DINO_DARK,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#0e180b',
    hover: 'rgba(227, 167, 47, 0.12)',
    active: 'rgba(227, 167, 47, 0.24)',
    text: '#e6dfc4',
    muted: '#9cab7c',
    border: '#22321a',
  },
  sections: {
    red: '#d0573a',
    orange: '#e3a72f',
    yellow: '#f2c230',
    green: '#6f9a3c',
    teal: '#4f9a83',
    blue: '#5f8fb0',
    purple: '#9a7aa8',
    grey: '#8f8a72',
  },
  headingFont: 'serif',
  bodyFont: 'sans',
};

const SPACE_THEME_DARK: Palette = {
  bg: '#060a18',
  surface: '#0f1530',
  border: '#232c52',
  text: '#e8ecff',
  muted: '#9ba4cc',
  accent: '#8f7bff',
  warnBg: '#2e2140',
  warnText: '#f3c4ff',
};

const SPACE_THEME: PresetSpec = {
  name: 'Deep space',
  light: SPACE_THEME_DARK,
  dark: SPACE_THEME_DARK,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#040714',
    hover: 'rgba(143, 123, 255, 0.12)',
    active: 'rgba(143, 123, 255, 0.26)',
    text: '#dfe4ff',
    muted: '#7f89b8',
    border: '#1a2144',
  },
  sections: {
    red: '#ff6b8b',
    orange: '#ffab6b',
    yellow: '#ffe27a',
    green: '#6be3b0',
    teal: '#5ad1e6',
    blue: '#6b9bff',
    purple: '#b48cff',
    grey: '#8b93b8',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

const NEON_DARK: Palette = {
  bg: '#0d0221',
  surface: '#190a33',
  border: '#3b1d66',
  text: '#f6f0ff',
  muted: '#b79ddb',
  accent: '#ff2a6d',
  warnBg: '#3a0b2a',
  warnText: '#ffb3cf',
};

const NEON: PresetSpec = {
  name: 'Neon city',
  light: NEON_DARK,
  dark: NEON_DARK,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#080115',
    hover: 'rgba(5, 217, 232, 0.12)',
    active: 'rgba(255, 42, 109, 0.28)',
    text: '#eadfff',
    muted: '#9481bd',
    border: '#2a1252',
  },
  sections: {
    red: '#ff2a6d',
    orange: '#ff8a3d',
    yellow: '#f9f871',
    green: '#3dff9e',
    teal: '#05d9e8',
    blue: '#4d7cff',
    purple: '#c45cff',
    grey: '#9a8bb8',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

const TERMINAL_DARK: Palette = {
  bg: '#040904',
  surface: '#0a140a',
  border: '#1d3b1d',
  text: '#9dffa9',
  muted: '#55b866',
  accent: '#33ff66',
  warnBg: '#262a05',
  warnText: '#e6ff66',
};

const TERMINAL: PresetSpec = {
  name: 'Retro terminal',
  light: TERMINAL_DARK,
  dark: TERMINAL_DARK,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#020602',
    hover: 'rgba(51, 255, 102, 0.1)',
    active: 'rgba(51, 255, 102, 0.22)',
    text: '#86ff96',
    muted: '#42a052',
    border: '#143214',
  },
  sections: {
    red: '#ff5f56',
    orange: '#ffb347',
    yellow: '#e6ff66',
    green: '#33ff66',
    teal: '#3dffd0',
    blue: '#59a6ff',
    purple: '#c38bff',
    grey: '#6f9f77',
  },
  headingFont: 'mono',
  bodyFont: 'mono',
};

const MARS_DARK: Palette = {
  bg: '#190e0a',
  surface: '#26150f',
  border: '#45261a',
  text: '#f7e6da',
  muted: '#c49c86',
  accent: '#e2622b',
  warnBg: '#3f1d0d',
  warnText: '#ffc39a',
};

const MARS: PresetSpec = {
  name: 'Red planet',
  light: MARS_DARK,
  dark: MARS_DARK,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#110805',
    hover: 'rgba(226, 98, 43, 0.12)',
    active: 'rgba(226, 98, 43, 0.26)',
    text: '#f0d9c9',
    muted: '#a8806a',
    border: '#2f1810',
  },
  sections: {
    red: '#e2482b',
    orange: '#e2622b',
    yellow: '#e8b45a',
    green: '#8fa36a',
    teal: '#5f9c95',
    blue: '#6f8fb8',
    purple: '#a57aa0',
    grey: '#a08a7d',
  },
  headingFont: 'serif',
  bodyFont: 'sans',
};

const GALAXY_PALETTE: Palette = {
  bg: '#07080d',
  surface: '#121521',
  border: '#262b40',
  text: '#f2ead8',
  muted: '#aaa38d',
  accent: '#4fb3ff',
  warnBg: '#2c2410',
  warnText: '#ffe08a',
};

const GALAXY: PresetSpec = {
  name: 'Galaxy far away',
  light: GALAXY_PALETTE,
  dark: GALAXY_PALETTE,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#04050a',
    hover: 'rgba(79, 179, 255, 0.12)',
    active: 'rgba(79, 179, 255, 0.24)',
    text: '#e8dcc0',
    muted: '#8d8872',
    border: '#1b1f30',
  },
  sections: {
    red: '#ff3b3b',
    orange: '#e8a04a',
    yellow: '#ffe08a',
    green: '#4cff6a',
    teal: '#47d7e8',
    blue: '#4fb3ff',
    purple: '#b06bff',
    grey: '#9a96a0',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

const XENO_PALETTE: Palette = {
  bg: '#050806',
  surface: '#0c120e',
  border: '#1f2e23',
  text: '#b8f5c4',
  muted: '#629f6f',
  accent: '#7dff9a',
  warnBg: '#2a2405',
  warnText: '#ffd23f',
};

const XENO: PresetSpec = {
  name: 'Xeno colony',
  light: XENO_PALETTE,
  dark: XENO_PALETTE,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#020403',
    hover: 'rgba(125, 255, 154, 0.1)',
    active: 'rgba(125, 255, 154, 0.2)',
    text: '#9ee8ad',
    muted: '#4f845b',
    border: '#142019',
  },
  sections: {
    red: '#ff4d3d',
    orange: '#ffa13d',
    yellow: '#ffd23f',
    green: '#7dff9a',
    teal: '#46e0c0',
    blue: '#5fa8ff',
    purple: '#b98cff',
    grey: '#6f8a75',
  },
  headingFont: 'mono',
  bodyFont: 'mono',
};

const MOONLIT_PALETTE: Palette = {
  bg: '#0f1413',
  surface: '#172020',
  border: '#26322f',
  text: '#e3e8e4',
  muted: '#97a59f',
  accent: '#c0283f',
  warnBg: '#2a1a1c',
  warnText: '#f2b8c0',
};

const MOONLIT: PresetSpec = {
  name: 'Moonlit forest',
  light: MOONLIT_PALETTE,
  dark: MOONLIT_PALETTE,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#0a0f0e',
    hover: 'rgba(227, 232, 228, 0.07)',
    active: 'rgba(192, 40, 63, 0.26)',
    text: '#d7dfda',
    muted: '#87968f',
    border: '#1c2624',
  },
  sections: {
    red: '#c0283f',
    orange: '#c27a4c',
    yellow: '#c9b46a',
    green: '#5f8a6e',
    teal: '#5f9a96',
    blue: '#7d93ad',
    purple: '#8a7aa0',
    grey: '#8f9a96',
  },
  headingFont: 'serif',
  bodyFont: 'serif',
};

const WIZARD_PALETTE: Palette = {
  bg: '#f3e6c8',
  surface: '#ead7ae',
  border: '#cdb68a',
  text: '#2b1d14',
  muted: '#6b563d',
  accent: '#7a1f2b',
  warnBg: '#f0d9a0',
  warnText: '#5a3a00',
};

const WIZARD: PresetSpec = {
  name: 'Wizarding school',
  light: WIZARD_PALETTE,
  dark: WIZARD_PALETTE,
  fixedScheme: 'light',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#3a0d14',
    hover: 'rgba(243, 226, 184, 0.1)',
    active: 'rgba(212, 175, 55, 0.28)',
    text: '#f3e2b8',
    muted: '#cdae72',
    border: '#521a22',
  },
  sections: {
    red: '#9b2335',
    orange: '#b8642a',
    yellow: '#c99a1e',
    green: '#2e6b45',
    teal: '#2f7a76',
    blue: '#2f4f8a',
    purple: '#6b3f8a',
    grey: '#8a7a62',
  },
  accents: [
    { name: 'Crimson and gold', value: '#7a1f2b' },
    { name: 'Emerald and silver', value: '#1f5f3a' },
    { name: 'Sapphire and bronze', value: '#1f3f7a' },
    { name: 'Amber and black', value: '#a6780f' },
  ],
  headingFont: 'serif',
  bodyFont: 'serif',
};

const SPARKLE_PALETTE: Palette = {
  bg: '#fff0f7',
  surface: '#ffe0f0',
  border: '#f6bfdb',
  text: '#4a1d3a',
  muted: '#9a5c84',
  accent: '#e3368a',
  warnBg: '#fff1c9',
  warnText: '#7a5200',
};

const SPARKLE: PresetSpec = {
  name: 'Pink sparkle',
  light: SPARKLE_PALETTE,
  dark: SPARKLE_PALETTE,
  fixedScheme: 'light',
  fun: true,
  sidebar: 'light',
  darkSidebar: {
    bg: '#5a1f45',
    hover: 'rgba(255, 240, 247, 0.1)',
    active: 'rgba(255, 158, 205, 0.3)',
    text: '#ffe6f3',
    muted: '#e7a9cb',
    border: '#6e2a56',
  },
  sections: {
    red: '#ff5c8a',
    orange: '#ff9a6b',
    yellow: '#ffc94d',
    green: '#5fd3a0',
    teal: '#45c9d6',
    blue: '#7aa2ff',
    purple: '#b57bff',
    grey: '#b693a8',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

const SYNTHWAVE_PALETTE: Palette = {
  bg: '#140726',
  surface: '#21103a',
  border: '#3d1d66',
  text: '#fbe9ff',
  muted: '#c69fe2',
  accent: '#ff3ea5',
  warnBg: '#3d1530',
  warnText: '#ffc46b',
};

const SYNTHWAVE: PresetSpec = {
  name: 'Synthwave sunset',
  light: SYNTHWAVE_PALETTE,
  dark: SYNTHWAVE_PALETTE,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#0d041a',
    hover: 'rgba(255, 62, 165, 0.12)',
    active: 'rgba(255, 62, 165, 0.26)',
    text: '#f3dcff',
    muted: '#a17cc4',
    border: '#2c1352',
  },
  sections: {
    red: '#ff3e6c',
    orange: '#ff8a3d',
    yellow: '#ffd23e',
    green: '#3dffb0',
    teal: '#3de6ff',
    blue: '#5c7cff',
    purple: '#c45cff',
    grey: '#a08bb8',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

const DEEP_PALETTE: Palette = {
  bg: '#031a24',
  surface: '#072a38',
  border: '#0f3f52',
  text: '#dff7ff',
  muted: '#8ab8c7',
  accent: '#2fe0d0',
  warnBg: '#2b2a10',
  warnText: '#ffe28a',
};

const DEEP: PresetSpec = {
  name: 'Deep ocean',
  light: DEEP_PALETTE,
  dark: DEEP_PALETTE,
  fixedScheme: 'dark',
  fun: true,
  sidebar: 'dark',
  darkSidebar: {
    bg: '#021219',
    hover: 'rgba(47, 224, 208, 0.1)',
    active: 'rgba(47, 224, 208, 0.24)',
    text: '#d2f1fb',
    muted: '#6fa3b4',
    border: '#0b3242',
  },
  sections: {
    red: '#ff6b7a',
    orange: '#ffa25c',
    yellow: '#ffe27a',
    green: '#5fe39a',
    teal: '#2fe0d0',
    blue: '#3fa9ff',
    purple: '#9c8cff',
    grey: '#7fa3ae',
  },
  headingFont: 'sans',
  bodyFont: 'sans',
};

export const PRESETS: Record<ThemePreset, PresetSpec> = {
  forest: FOREST,
  classic: CLASSIC,
  ocean: OCEAN,
  heather: HEATHER,
  clay: CLAY,
  graphite: GRAPHITE,
  sepia: SEPIA,
  bridge: BRIDGE,
  dino: DINO,
  space: SPACE_THEME,
  neon: NEON,
  terminal: TERMINAL,
  mars: MARS,
  galaxy: GALAXY,
  xeno: XENO,
  moonlit: MOONLIT,
  wizard: WIZARD,
  sparkle: SPARKLE,
  synthwave: SYNTHWAVE,
  deep: DEEP,
};

/** The scheme a preset is shown in: its own fixed one, or the one asked for. */
export function presetScheme(preset: ThemePreset, wanted: Scheme): Scheme {
  return PRESETS[preset].fixedScheme ?? wanted;
}

const PRESET_IDS = Object.keys(PRESETS) as ThemePreset[];

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
  mono: "'Cascadia Mono', 'Cascadia Code', Consolas, 'DejaVu Sans Mono', 'Courier New', monospace",
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
    paper: null,
    pattern: 'dots',
    patternOnDocuments: false,
    sidebarWidth: SIDEBAR_WIDTH.initial,
    panelWidth: PANEL_WIDTH.initial,
    startupAnimation: true,
  };
}

/** A whole number of pixels within `range`. */
export function clampWidth(value: number, range: { min: number; max: number }): number {
  return Math.round(Math.min(range.max, Math.max(range.min, value)));
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
  const preset = oneOf(record['preset'], PRESET_IDS) ? record['preset'] : 'forest';
  const result = defaultAppearance(preset);
  const accent = record['accent'];
  if (typeof accent === 'string' && HEX.test(accent)) result.accent = accent.toLowerCase();
  if (oneOf(record['sidebar'], ['dark', 'light'] as const)) result.sidebar = record['sidebar'];
  if (oneOf(record['headingFont'], ['serif', 'sans', 'mono'] as const))
    result.headingFont = record['headingFont'];
  if (oneOf(record['bodyFont'], ['serif', 'sans', 'mono'] as const))
    result.bodyFont = record['bodyFont'];
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
  const paper = record['paper'];
  if (typeof paper === 'string' && HEX.test(paper)) result.paper = paper.toLowerCase();
  if (oneOf(record['pattern'], PAPER_PATTERNS)) result.pattern = record['pattern'];
  if (typeof record['patternOnDocuments'] === 'boolean')
    result.patternOnDocuments = record['patternOnDocuments'];
  for (const [key, range] of [
    ['sidebarWidth', SIDEBAR_WIDTH],
    ['panelWidth', PANEL_WIDTH],
  ] as const) {
    const width = record[key];
    if (typeof width === 'number' && Number.isFinite(width)) result[key] = clampWidth(width, range);
  }
  if (typeof record['startupAnimation'] === 'boolean')
    result.startupAnimation = record['startupAnimation'];
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

/** Lines and dots: the page's text colour, faint. */
const INK = 'color-mix(in srgb, var(--text) 13%, transparent)';

/** Each pattern as a background image and its size. */
const PATTERNS: Record<PaperPattern, { image: string; size: string }> = {
  plain: { image: 'none', size: 'auto' },
  dots: { image: `radial-gradient(circle, ${INK} 1px, transparent 1.2px)`, size: '24px 24px' },
  lines: { image: `linear-gradient(to bottom, transparent 27px, ${INK} 27px)`, size: '100% 28px' },
  grid: {
    image: `linear-gradient(${INK} 1px, transparent 1px), linear-gradient(90deg, ${INK} 1px, transparent 1px)`,
    size: '24px 24px',
  },
};

/** The CSS custom properties for an appearance in a scheme. */
export function appearanceTokens(appearance: Appearance, scheme: Scheme): Record<string, string> {
  const spec = PRESETS[appearance.preset];
  const palette = spec[scheme];
  const accent = appearance.accent === null ? palette.accent : forScheme(appearance.accent, scheme);
  const pattern = PATTERNS[appearance.pattern];
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
  const sections = Object.fromEntries(
    Object.entries(spec.sections ?? SECTIONS).map(([name, colour]) => [
      `--section-${name}`,
      colour,
    ]),
  );
  return {
    ...sections,
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
    // A chosen page colour is a tint on dark pages, so text still reads.
    '--paper':
      appearance.paper === null
        ? palette.bg
        : scheme === 'light'
          ? appearance.paper
          : `color-mix(in srgb, ${appearance.paper} 12%, ${palette.bg})`,
    '--paper-pattern': pattern.image,
    '--paper-size': pattern.size,
    '--document-pattern': appearance.patternOnDocuments ? pattern.image : 'none',
    '--sidebar-width': `${String(appearance.sidebarWidth)}px`,
    '--panel-width': `${String(appearance.panelWidth)}px`,
  };
}
