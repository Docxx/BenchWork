// @vitest-environment node
import { appearanceTokens, defaultAppearance, parseAppearance, textOn } from './appearance';

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

  it('puts dark or light text on an accent, whichever reads better', () => {
    expect(textOn('#1c2d2a')).toBe('#ffffff');
    expect(textOn('#e8d27a')).toBe('#10201a');
  });
});
