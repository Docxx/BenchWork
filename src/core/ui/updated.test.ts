// @vitest-environment node
import { updatedText } from './updated';

describe('updatedText', () => {
  const now = new Date(2026, 9, 27, 15, 30);

  it('says how long ago a page changed, in plain words', () => {
    expect(updatedText('2026-10-27T15:29:40', now)).toBe('Updated just now');
    expect(updatedText('2026-10-27T15:18:00', now)).toBe('Updated 12 min ago');
    expect(updatedText('2026-10-27T14:20:00', now)).toBe('Updated 1 hour ago');
    expect(updatedText('2026-10-27T09:00:00', now)).toBe('Updated 6 hours ago');
    expect(updatedText('2026-10-26T22:00:00', now)).toBe('Updated yesterday');
    expect(updatedText('2026-10-03T10:00:00', now)).toBe('Updated 3 Oct');
    expect(updatedText('2025-12-03T10:00:00', now)).toBe('Updated 3 Dec 2025');
  });

  it('says nothing without a time it can read', () => {
    expect(updatedText(undefined, now)).toBeNull();
    expect(updatedText('soon', now)).toBeNull();
  });
});
