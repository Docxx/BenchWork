// @vitest-environment node
import { defineModule } from '../api';
import { collectModules, findBuiltInModules } from './loader';

const manifestFor = (id: string, name: string) => ({
  id,
  name,
  version: '0.1.0',
  description: '',
});

describe('collectModules', () => {
  it('pairs manifests with their code, sorted by name', async () => {
    const zebra = defineModule({ activate: () => undefined });
    const found = collectModules(
      {
        '../../modules/zebra/manifest.json': manifestFor('zebra', 'Zebra'),
        '../../modules/alpha/manifest.json': manifestFor('alpha', 'Alpha'),
      },
      {
        '../../modules/zebra/index.ts': () => Promise.resolve({ default: zebra }),
        '../../modules/alpha/index.ts': () => Promise.resolve({ default: zebra }),
      },
    );
    expect(found.broken).toEqual([]);
    expect(found.sources.map((s) => s.manifest.id)).toEqual(['alpha', 'zebra']);
    expect(await found.sources[1]?.load()).toBe(zebra);
  });

  it('reports bad manifests and missing code without stopping the others', () => {
    const found = collectModules(
      {
        '../../modules/good/manifest.json': manifestFor('good', 'Good'),
        '../../modules/wrong-id/manifest.json': manifestFor('other', 'Other'),
        '../../modules/no-code/manifest.json': manifestFor('no-code', 'No code'),
      },
      { '../../modules/good/index.ts': () => Promise.resolve({ default: {} }) },
    );
    expect(found.sources.map((s) => s.manifest.id)).toEqual(['good']);
    expect(found.broken.map((b) => b.folder)).toEqual(['wrong-id', 'no-code']);
    expect(found.broken[1]?.errors).toEqual(['The folder has no index.ts']);
  });

  it('fails to load code with no default export', async () => {
    const found = collectModules(
      { '../../modules/a/manifest.json': manifestFor('a', 'A') },
      { '../../modules/a/index.ts': () => Promise.resolve({}) },
    );
    await expect(found.sources[0]?.load()).rejects.toThrow('no default export');
  });
});

describe('findBuiltInModules', () => {
  it('finds every module folder and they all have valid manifests', () => {
    expect(findBuiltInModules().broken).toEqual([]);
  });
});
