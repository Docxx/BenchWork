// @vitest-environment node
import { extractPage } from '../search/extract';
import { citationDisplay, type CitationView } from './citationNode';
import { citationKeys, findCitations, plainCitationLabel } from './citations';
import { loadPage, savePage } from './markdown/markdown';

describe('citation keys', () => {
  it('follow Pandoc: groups, prefixes, locators and suppressed authors', () => {
    expect(citationKeys('@smith2024')).toEqual(['smith2024']);
    expect(citationKeys('@smith2024; @lee2023')).toEqual(['smith2024', 'lee2023']);
    expect(citationKeys('see @smith2024, p. 12')).toEqual(['smith2024']);
    expect(citationKeys('-@doe:2020.')).toEqual(['doe:2020']);
    expect(citationKeys('mail me@example.org')).toEqual([]);
    expect(citationKeys('no keys here')).toEqual([]);
  });

  it('are found in brackets, but not in links or wiki links', () => {
    expect(findCitations('As shown [@smith2024; @lee2023], and [see @doe, p. 4].')).toEqual([
      { index: 9, length: 22, inner: '@smith2024; @lee2023' },
      { index: 37, length: 16, inner: 'see @doe, p. 4' },
    ]);
    expect(findCitations('[@smith2024](https://doi.org/x)')).toEqual([]);
    expect(findCitations('[[@not a citation]]')).toEqual([]);
    expect(findCitations('[plain words]')).toEqual([]);
  });

  it('show their keys when no module can name the works', () => {
    expect(plainCitationLabel('see @smith2024, p. 12; @lee2023')).toBe('@smith2024; @lee2023');
  });
});

describe('citations in Markdown', () => {
  it('read back exactly as written', () => {
    for (const text of [
      'As shown [@smith2024; @lee2023, p. 4] and [-@doe2020].\n',
      '**Bold [@smith2024]** text.\n',
      'Escaped \\[@smith2024] stays text.\n',
    ]) {
      const loaded = loadPage(text);
      expect(savePage(loaded.page, loaded.doc, loaded.source)).toBe(text);
    }
  });

  it('become citation nodes, keeping what is between the brackets', () => {
    const [para] = loadPage('See [@smith2024, p. 12] now.\n').doc.content ?? [];
    expect(para?.content?.map((n) => n.type)).toEqual(['text', 'citation', 'text']);
    expect(para?.content?.[1]?.attrs).toEqual({ inner: '@smith2024, p. 12' });
    expect(JSON.stringify(loadPage('Escaped \\[@smith2024].\n').doc)).not.toContain('citation');
  });

  it('are written back when their block is edited', () => {
    const loaded = loadPage('See [@smith2024; @lee2023].\n');
    const [para] = loaded.doc.content ?? [];
    if (!para) throw new Error('no paragraph');
    const edited = {
      ...para,
      attrs: {},
      content: [...(para.content ?? []), { type: 'text', text: ' More.' }],
    };
    expect(savePage(loaded.page, { type: 'doc', content: [edited] }, loaded.source)).toBe(
      'See [@smith2024; @lee2023]. More.\n',
    );
  });

  it('count as links to literature notes, and their keys are searchable', () => {
    const page = extractPage('Daily/2026-10-23.md', 'Read [@smith2024; @lee2023].\n', {
      mtime: null,
      size: 0,
    });
    expect(page.links.map((l) => l.key)).toEqual(['smith2024', 'lee2023']);
    expect(page.body).toBe('Read @smith2024 @lee2023.');
  });
});

describe('citation chips', () => {
  const view: CitationView = {
    describe: (key) =>
      key === 'smith2024' ? { short: 'Smith et al. 2024', full: 'Smith, A. (2024). Tau.' } : null,
    suggest: () => [],
    open: () => undefined,
  };

  it('name the works, and say when a key is not in the library', () => {
    expect(citationDisplay('@smith2024, p. 12', view)).toEqual({
      label: 'Smith et al. 2024',
      title: 'Smith, A. (2024). Tau.',
      known: true,
    });
    expect(citationDisplay('@smith2024; @nope', view)).toMatchObject({
      label: 'Smith et al. 2024; @nope',
      known: false,
    });
  });

  it('show the keys when the References module is off', () => {
    expect(citationDisplay('@smith2024', null)).toEqual({
      label: '@smith2024',
      title: '[@smith2024]',
      known: true,
    });
  });
});
