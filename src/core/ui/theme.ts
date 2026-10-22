import type { Theme } from '../settings/appSettings';

/**
 * Applies a theme to the page. `system` removes the attribute so the CSS
 * follows the operating system's light or dark setting.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
}
