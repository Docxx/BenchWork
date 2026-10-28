// @vitest-environment node
import {
  appearanceTokens,
  defaultAppearance,
  parseAppearance,
  PRESETS,
  textOn,
  type ThemePreset,
} from './appearance';

describe('appearance settings', () => {
  it('starts with the Forest look: serif pages, a dark sidebar', () => {
    const tokens = appearanceTokens(defaultAppearance(), 'light');
    expect(tokens['--bg']).toBe('#f8f7f3');
    expect(tokens['--sidebar-bg']).toBe('#1c2d2a');
    expect(tokens['--font-heading']).toContain('Source Serif 4');
    expect(tokens['--font-ui']).toContain('Inter');
  });

  it('reads what it knows and ignores the rest', () => {
    expect(
      parseAppearance({
        preset: 'classic',
        accent: '#B0506A',
        sidebar: 'dark',
        headingFont: 'serif',
        bodyFont: 'comic',
        textSize: 40,
        density: 'roomy',
        pageWidth: 'vast',
      }),
    ).toEqual({
      ...defaultAppearance('classic'),
      accent: '#b0506a',
      sidebar: 'dark',
      headingFont: 'serif',
      textSize: 20,
      density: 'roomy',
    });
    expect(parseAppearance('junk')).toEqual(defaultAppearance());
    expect(parseAppearance({ accent: 'red', textSize: '18' })).toEqual(defaultAppearance());
  });

  it('turns choices into tokens', () => {
    const tokens = appearanceTokens(
      {
        ...defaultAppearance(),
        accent: '#3a6fb0',
        sidebar: 'light',
        bodyFont: 'sans',
        textSize: 18,
        density: 'compact',
        pageWidth: 'wide',
      },
      'light',
    );
    expect(tokens['--accent']).toBe('#3a6fb0');
    expect(tokens['--accent-text']).toBe('#ffffff');
    expect(tokens['--sidebar-bg']).toBe(tokens['--surface']);
    expect(tokens['--font-body']).toContain('Inter');
    expect(tokens['--text-size']).toBe('18px');
    expect(tokens['--space']).toBe('0.8');
    expect(tokens['--page-width']).toBe('60rem');
  });

  it('lightens a chosen accent for dark pages, so it still reads', () => {
    const dark = appearanceTokens({ ...defaultAppearance(), accent: '#3a6fb0' }, 'dark');
    expect(dark['--accent']).not.toBe('#3a6fb0');
    expect(dark['--bg']).toBe('#171d1c');
  });

  it('reads the page colour, pattern and widths, keeping widths in range', () => {
    const read = parseAppearance({
      preset: 'ocean',
      paper: '#FBF4DE',
      pattern: 'grid',
      patternOnDocuments: true,
      sidebarWidth: 9999,
      panelWidth: 333.4,
      startupAnimation: false,
    });
    expect(read).toMatchObject({
      preset: 'ocean',
      paper: '#fbf4de',
      pattern: 'grid',
      patternOnDocuments: true,
      sidebarWidth: 440,
      panelWidth: 333,
      startupAnimation: false,
    });
    expect(parseAppearance({ pattern: 'stripes', paper: 'cream' })).toEqual(defaultAppearance());
  });

  it('gives every theme a full set of tokens', () => {
    for (const preset of Object.keys(PRESETS) as ThemePreset[]) {
      for (const scheme of ['light', 'dark'] as const) {
        const tokens = appearanceTokens(defaultAppearance(preset), scheme);
        expect(tokens['--bg']).toMatch(/^#[0-9a-f]{6}$/);
        expect(tokens['--paper']).toBe(tokens['--bg']);
      }
    }
  });

  it('turns the page colour and pattern into tokens, tinting the colour on dark pages', () => {
    const appearance = { ...defaultAppearance(), paper: '#fbf4de', pattern: 'lines' as const };
    expect(appearanceTokens(appearance, 'light')['--paper']).toBe('#fbf4de');
    expect(appearanceTokens(appearance, 'dark')['--paper']).toContain('color-mix');
    const tokens = appearanceTokens(appearance, 'light');
    expect(tokens['--paper-pattern']).toContain('linear-gradient');
    expect(tokens['--document-pattern']).toBe('none');
    expect(tokens['--sidebar-width']).toBe('260px');
  });

  it('puts dark or light text on an accent, whichever reads better', () => {
    expect(textOn('#1c2d2a')).toBe('#ffffff');
    expect(textOn('#e8d27a')).toBe('#10201a');
  });
});
