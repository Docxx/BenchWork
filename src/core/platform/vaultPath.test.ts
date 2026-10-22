// @vitest-environment node
import cases from './vault-path-cases.json';
import { PlatformError } from './errors';
import { baseName, joinVaultPath, normaliseVaultPath, parentVaultPath } from './vaultPath';

describe('normaliseVaultPath (shared cases)', () => {
  it.each(cases.valid)('accepts %j as %j', (input, expected) => {
    expect(normaliseVaultPath(input)).toBe(expected);
  });

  it.each(cases.invalid)('rejects %j with %s', (input, kind) => {
    let caught: unknown;
    try {
      normaliseVaultPath(input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlatformError);
    expect((caught as PlatformError).kind).toBe(kind);
  });
});

describe('path helpers', () => {
  it('joins onto the root and onto folders', () => {
    expect(joinVaultPath('', 'Notes')).toBe('Notes');
    expect(joinVaultPath('Notes', 'Day 1.md')).toBe('Notes/Day 1.md');
  });

  it('refuses to join an escaping name', () => {
    expect(() => joinVaultPath('Notes', '..')).toThrow(PlatformError);
  });

  it('finds parents and base names', () => {
    expect(parentVaultPath('')).toBeNull();
    expect(parentVaultPath('Notes')).toBe('');
    expect(parentVaultPath('Notes/Week 1/a.md')).toBe('Notes/Week 1');
    expect(baseName('Notes/Week 1/a.md')).toBe('a.md');
    expect(baseName('Notes')).toBe('Notes');
  });
});
