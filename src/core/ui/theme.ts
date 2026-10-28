import { appearanceTokens, type Appearance, type Scheme } from '../settings/appearance';
import type { Theme } from '../settings/appSettings';

/** Light or dark, with `system` following the operating system. */
export function schemeFor(theme: Theme, systemDark: boolean): Scheme {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

/**
 * Applies the appearance to the page as CSS custom properties. `system`
 * leaves `data-theme` off, so anything styled by the operating system's
 * setting follows it too.
 */
export function applyAppearance(
  appearance: Appearance,
  theme: Theme,
  systemDark: boolean,
  root: HTMLElement = document.documentElement,
): void {
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
  const scheme = schemeFor(theme, systemDark);
  root.dataset['preset'] = appearance.preset;
  root.style.colorScheme = scheme;
  for (const [name, value] of Object.entries(appearanceTokens(appearance, scheme))) {
    root.style.setProperty(name, value);
  }
}

/** Whether the app is showing dark colours now. */
export function pageIsDark(): boolean {
  return document.documentElement.style.colorScheme === 'dark';
}
