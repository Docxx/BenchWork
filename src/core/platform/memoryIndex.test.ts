// @vitest-environment node
import { MemoryIndex, parseQuery } from './memoryIndex';
import { MATCH_END, MATCH_START, type IndexedPage } from './types';

function page(path: string, title: string, body: string, tags: string[] = []): IndexedPage {
  return {
    path,
    id: null,
    title,
    type: 'page',
    created: null,
    modified: null,
    mtime: 1,
    size: body.length,
    tags,
    links: [],
    body,
  };
}

async function openIndex(root = 'C:/Vault') {
  let current: string | null = root;
  const index = new MemoryIndex(() => current);
  await index.open();
  return {
    index,
    switchTo: (next: string | null) => {
      current = next;
    },
  };
}

const paths = (hits: { path: string }[]) => hits.map((h) => h.path);

describe('MemoryIndex', () => {
  it('reads queries the same way as the SQLite index', () => {
    expect(parseQuery('LPS-model "day 7" Café')).toEqual([
      { kind: 'prefix', word: 'lps' },
      { kind: 'prefix', word: 'model' },
      { kind: 'phrase', words: ['day', '7'] },
      { kind: 'prefix', word: 'cafe' },
    ]);
    expect(parseQuery(' " * ')).toEqual([]);
  });

  it('finds pages with every word, by word start and phrase, titles first', async () => {
    const { index } = await openIndex();
    await index.apply(
      [
        page('Lab/Dose.md', 'Dose', 'LPS dose response, climbing at day 7'),
        page('Lab/Climbing.md', 'Climbing', 'Assay notes'),
        page('Lab/Diet.md', 'Diet', 'Fresh food on day 3'),
      ],
      [],
    );
    expect(paths(await index.search('clim', 10))).toEqual(['Lab/Climbing.md', 'Lab/Dose.md']);
    expect(paths(await index.search('lps CLIMBING', 10))).toEqual(['Lab/Dose.md']);
    expect(paths(await index.search('"day 7"', 10))).toEqual(['Lab/Dose.md']);
    expect(await index.search('', 10)).toEqual([]);
  });

  it('marks matched words in the snippet', async () => {
    const { index } = await openIndex();
    await index.apply([page('a.md', 'A', 'We ran the western blot today.')], []);
    const [hit] = await index.search('western', 10);
    expect(hit?.snippet).toBe(`We ran the ${MATCH_START}western${MATCH_END} blot today.`);
  });

  it('removes files and folders, and keeps each vault separate', async () => {
    const { index, switchTo } = await openIndex();
    await index.apply([page('Lab/a.md', 'A', 'x'), page('Lab2/b.md', 'B', 'x')], []);
    await index.apply([], ['Lab']);
    expect((await index.entries()).map((e) => e.path)).toEqual(['Lab2/b.md']);

    switchTo('C:/Other');
    expect(await index.open()).toEqual({ fresh: true });
    expect(await index.entries()).toEqual([]);
    switchTo('C:/Vault');
    expect(await index.open()).toEqual({ fresh: false });
    expect(await index.entries()).toHaveLength(1);
  });

  it('refuses to work when closed', async () => {
    const { index } = await openIndex();
    await index.close();
    await expect(index.entries()).rejects.toThrow('not open');
  });
});
