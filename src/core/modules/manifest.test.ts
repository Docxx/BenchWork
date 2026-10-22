// @vitest-environment node
import { validateManifest } from './manifest';

const GOOD = {
  id: 'references',
  name: 'References',
  version: '0.1.0',
  description: 'Zotero library, citation keys and literature notes',
  dependsOn: [],
  platforms: ['desktop', 'tablet'],
  defaultEnabled: false,
};

function errorsFor(data: unknown, folder = 'references'): string[] {
  const result = validateManifest(data, folder);
  return result.ok ? [] : result.errors;
}

describe('validateManifest', () => {
  it('accepts the example manifest from SPEC.md', () => {
    expect(validateManifest(GOOD, 'references')).toEqual({ ok: true, manifest: GOOD });
  });

  it('fills in optional fields and ignores unknown ones', () => {
    const minimal = {
      id: GOOD.id,
      name: GOOD.name,
      version: GOOD.version,
      description: GOOD.description,
    };
    const result = validateManifest({ ...minimal, homepage: 'https://example.org' }, 'references');
    expect(result).toEqual({
      ok: true,
      manifest: {
        ...minimal,
        dependsOn: [],
        platforms: ['desktop', 'tablet'],
        defaultEnabled: false,
      },
    });
  });

  it('requires the id to match the folder', () => {
    expect(errorsFor(GOOD, 'refs')).toEqual([
      '"id" is "references" but the folder is "refs"; they must match',
    ]);
  });

  it.each([
    [{ ...GOOD, id: 'References' }, '"id" must be'],
    [{ ...GOOD, id: '1abc' }, '"id" must be'],
    [{ ...GOOD, name: '  ' }, '"name"'],
    [{ ...GOOD, version: '1.0' }, '"version"'],
    [{ ...GOOD, description: 3 }, '"description"'],
    [{ ...GOOD, dependsOn: 'manuscript' }, '"dependsOn"'],
    [{ ...GOOD, dependsOn: ['references'] }, 'depend on itself'],
    [{ ...GOOD, dependsOn: ['a', 'a'] }, 'twice'],
    [{ ...GOOD, platforms: [] }, '"platforms"'],
    [{ ...GOOD, platforms: ['ios'] }, '"platforms"'],
    [{ ...GOOD, defaultEnabled: 'yes' }, '"defaultEnabled"'],
  ])('rejects %j', (data, expected) => {
    expect(errorsFor(data).join(' ')).toContain(expected);
  });

  it('rejects things that are not objects, reporting every problem at once', () => {
    expect(errorsFor(null)).toEqual(['manifest.json must contain a JSON object']);
    expect(errorsFor({}).length).toBeGreaterThanOrEqual(4);
  });
});
