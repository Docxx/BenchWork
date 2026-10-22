// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPage, savePage } from './markdown/markdown';
import { createPageYDoc, setYDocContent, yDocToPage } from './yjsDoc';

const FIXTURES = join(__dirname, 'markdown', 'fixtures');

describe('page Yjs documents', () => {
  it.each(readdirSync(FIXTURES))(
    'hold %s without losing anything, so it still saves byte for byte',
    (name) => {
      const text = readFileSync(join(FIXTURES, name), 'utf8');
      const loaded = loadPage(text);
      const ydoc = createPageYDoc(loaded.doc);
      expect(savePage(loaded.page, yDocToPage(ydoc), loaded.source)).toBe(text);
    },
  );

  it('can have their content replaced', () => {
    const ydoc = createPageYDoc(loadPage('Old text\n').doc);
    setYDocContent(ydoc, loadPage('# New\n').doc);
    expect(yDocToPage(ydoc).content?.map((b) => b.type)).toEqual(['heading']);
  });

  it('start empty pages with one paragraph, which saves as nothing', () => {
    const loaded = loadPage('');
    const ydoc = createPageYDoc(loaded.doc);
    expect(yDocToPage(ydoc).content?.map((b) => b.type)).toEqual(['paragraph']);
    expect(savePage(loaded.page, yDocToPage(ydoc), loaded.source)).toBe('');
  });
});
