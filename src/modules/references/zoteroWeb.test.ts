// @vitest-environment node
import { parseLibrary } from './library';
import { checkKey, makeKey, readLibraryFile, syncLibrary, type ZoteroAccount } from './zoteroWeb';

const KEY = 'abcdefghijklmnopqrstuvwx';
const account: ZoteroAccount = { key: KEY, userId: '42', username: 'ray' };

function item(
  key: string,
  version: number,
  data: Record<string, unknown>,
  csl: Record<string, unknown> = {},
) {
  return {
    key,
    version,
    data: { key, version, itemType: 'journalArticle', collections: [], tags: [], ...data },
    csljson: { id: '42/' + key, type: 'article-journal', title: data['title'], ...csl },
  };
}

/** A fake api.zotero.org: answers by path, records what was asked. */
function server(routes: Record<string, (params: URLSearchParams) => unknown>) {
  const asked: string[] = [];
  const get = (address: string) => {
    asked.push(address);
    const url = new URL(address);
    const route = routes[url.pathname];
    if (!route) return Promise.reject(new Error('The site answered with an error (404).'));
    return Promise.resolve(JSON.stringify(route(url.searchParams)));
  };
  return { get, asked };
}

const page = <T>(all: T[], params: URLSearchParams) => {
  const start = Number(params.get('start'));
  return all.slice(start, start + Number(params.get('limit')));
};

describe('a Zotero key', () => {
  it('is checked with Zotero, which says whose library it opens', async () => {
    const { get } = server({
      [`/keys/${KEY}`]: () => ({
        userID: 42,
        username: 'ray',
        access: { user: { library: true } },
      }),
    });
    await expect(checkKey(get, ` ${KEY} `)).resolves.toEqual(account);
  });

  it('is refused when it is malformed, unknown, or cannot read the library', async () => {
    const { get } = server({
      [`/keys/${KEY}`]: () => ({ userID: 42, access: { user: { notes: true } } }),
    });
    await expect(checkKey(get, 'short')).rejects.toThrow('24 letters and numbers');
    await expect(checkKey(get, KEY)).rejects.toThrow('Allow library access');
    await expect(checkKey(server({}).get, KEY)).rejects.toThrow('did not accept this key');
  });
});

describe('syncing a Zotero library', () => {
  const old = parseLibrary(
    JSON.stringify([
      { id: 'Buchon2014-rs', title: 'Immunity in Drosophila', DOI: '10.1038/NRI3763' },
      {
        id: 'Daneman2015-ib',
        title: 'The <span class="nocase">blood-brain</span> barrier',
        issued: { 'date-parts': [[2015]] },
      },
    ]),
  ).refs.values();

  it('fetches everything 100 at a time, with collections and tags, keeping old citation keys', async () => {
    const filler = Array.from({ length: 101 }, (_, i) =>
      item('F' + String(i), 3, { title: 'Filler ' + String(i) }, { author: [{ family: 'Zed' }] }),
    );
    const items = [
      item('A', 5, { title: 'Own key', citationKey: 'Mine2020-aa', collections: ['C1'] }),
      item('B', 5, { title: 'From extra', extra: 'PMID: 1\nCitation Key: Extra2019-bb' }),
      item('C', 5, { title: 'Immunity!', DOI: 'https://doi.org/10.1038/nri3763' }),
      item(
        'D',
        6,
        { title: 'The blood brain barrier', tags: [{ tag: 'review' }], dateAdded: '2026-01-02' },
        { issued: { 'date-parts': [[2015]] }, abstract: 'Barrier biology.' },
      ),
      item(
        'E',
        7,
        { title: 'Brand new' },
        { author: [{ family: 'Ölz' }], issued: { 'date-parts': [[2026]] } },
      ),
      item('N', 7, { itemType: 'note', title: '' }),
      item('T', 7, { title: 'Binned', deleted: 1 }),
      ...filler,
    ];
    const { get, asked } = server({
      '/users/42/collections': (p) =>
        page(
          [
            { key: 'C1', version: 8, data: { key: 'C1', name: 'Thesis', parentCollection: false } },
            {
              key: 'C2',
              version: 2,
              data: { key: 'C2', name: 'Chapter 2', parentCollection: 'C1' },
            },
          ],
          p,
        ),
      '/users/42/items': (p) => page(items, p),
    });
    const file = await syncLibrary(get, account, null, old, new Date('2026-11-27T12:00:00Z'));

    expect(asked.filter((u) => u.includes('/items')).length).toBe(2);
    expect(asked.every((u) => u.includes('key=' + KEY) && !u.includes('since='))).toBe(true);
    expect(file.version).toBe(8);
    expect(file.collections).toEqual([
      { key: 'C2', name: 'Chapter 2', parent: 'C1' },
      { key: 'C1', name: 'Thesis', parent: null },
    ]);
    const keys: Record<string, string> = Object.fromEntries(
      file.items.map((i) => [String(i['zotero-key']), String(i['citation-key'])]),
    );
    expect(keys).toMatchObject({
      A: 'Mine2020-aa',
      B: 'Extra2019-bb',
      C: 'Buchon2014-rs',
      D: 'Daneman2015-ib',
      E: makeKey('Ölz', '2026', 'E'),
    });
    expect(keys['E']).toMatch(/^Olz2026-[a-z]{2}$/);
    expect(keys).not.toHaveProperty('N');
    expect(keys).not.toHaveProperty('T');
    // Same surname, year and no title clash: still one key each.
    expect(new Set(Object.values(keys)).size).toBe(Object.keys(keys).length);

    const library = parseLibrary(JSON.stringify(file));
    expect(library.collections).toHaveLength(2);
    expect(library.refs.get('Daneman2015-ib')).toMatchObject({
      tags: ['review'],
      added: '2026-01-02',
      abstract: 'Barrier biology.',
      zoteroKey: 'D',
    });
    expect(library.refs.get('Mine2020-aa')?.collections).toEqual(['C1']);
    expect(readLibraryFile(JSON.stringify(file))?.version).toBe(8);
  });

  it('afterwards asks only for changes, and keeps each item’s key', async () => {
    const first = await syncLibrary(
      server({
        '/users/42/collections': () => [],
        '/users/42/items': (p) =>
          page([item('A', 4, { title: 'One' }), item('B', 4, { title: 'Two' })], p),
      }).get,
      account,
      null,
      [],
    );
    const keyOfA = first.items.find((i) => i['zotero-key'] === 'A')?.['citation-key'];
    const { get, asked } = server({
      '/users/42/collections': () => [],
      '/users/42/items': (p) =>
        p.get('since') === '4' ? [item('A', 9, { title: 'One, revised' })] : [],
      '/users/42/deleted': () => ({ items: ['B'], collections: [] }),
    });
    const second = await syncLibrary(get, account, first, []);
    expect(asked.every((u) => u.includes('since=4'))).toBe(true);
    expect(second.version).toBe(9);
    expect(second.items.map((i) => [i['citation-key'], i['title']])).toEqual([
      [keyOfA, 'One, revised'],
    ]);
  });

  it('starts again from scratch for another account’s copy', async () => {
    const { asked, get } = server({
      '/users/42/collections': () => [],
      '/users/42/items': () => [],
    });
    const other = {
      source: 'zotero' as const,
      userId: '7',
      version: 50,
      synced: '',
      collections: [],
      items: [],
    };
    await syncLibrary(get, account, other, []);
    expect(asked.some((u) => u.includes('since='))).toBe(false);
  });
});
