// @vitest-environment node
import cases from './vault-path-cases.json';
import { PlatformError } from './errors';
import {
  baseName,
  fullBaseName,
  joinVaultPath,
  normaliseVaultPath,
  parentVaultPath,
  vaultPathOf,
} from './vaultPath';

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

describe('full paths', () => {
  it('finds the vault path of a file inside the vault', () => {
    expect(vaultPathOf('C:\\Lab vault', 'C:\\Lab vault\\Data\\day7.csv')).toBe('Data/day7.csv');
    expect(vaultPathOf('C:\\Lab vault\\', 'c:\\lab VAULT\\Data\\day7.csv')).toBe('Data/day7.csv');
    expect(vaultPathOf('C:/Lab vault', 'C:/Lab vault/a.png')).toBe('a.png');
    expect(vaultPathOf('/home/ray/Vault', '/home/ray/Vault/x/y.csv')).toBe('x/y.csv');
  });

  it('says null for files outside it', () => {
    expect(vaultPathOf('C:\\Lab vault', 'D:\\Raw\\scan.tif')).toBeNull();
    expect(vaultPathOf('C:\\Lab vault', 'C:\\Lab vault 2\\a.csv')).toBeNull();
    expect(vaultPathOf('C:\\Lab vault', 'C:\\Lab vault')).toBeNull();
    // Names ignore case only on Windows-style paths.
    expect(vaultPathOf('/home/ray/Vault', '/home/ray/vault/a.csv')).toBeNull();
  });

  it('takes the last part of a full path', () => {
    expect(fullBaseName('D:\\Raw\\scan 1.tif')).toBe('scan 1.tif');
    expect(fullBaseName('/mnt/lab/run.csv')).toBe('run.csv');
    expect(fullBaseName('plain.txt')).toBe('plain.txt');
  });
});
