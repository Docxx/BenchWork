// @vitest-environment node
import {
  emptySectionMeta,
  parseSectionMeta,
  placeInOrder,
  renameInOrder,
  serialiseSectionMeta,
  type SectionMeta,
} from './sectionMeta';

describe('section settings', () => {
  const meta = (over: Partial<SectionMeta> = {}): SectionMeta => ({
    ...emptySectionMeta(),
    ...over,
  });

  it('reads colour, icon, sort and order', () => {
    expect(
      parseSectionMeta('colour: teal\nicon: 🧪\nsort: changed\norder: [Protocols, Day 1.md]\n'),
    ).toEqual({
      colour: 'teal',
      icon: '🧪',
      sort: 'changed',
      order: ['Protocols', 'Day 1.md'],
    });
  });

  it('treats broken or odd files as empty, and ignores unsafe colours and odd values', () => {
    for (const text of ['', 'order: [unclosed', '- a list', 'colour: "red; background: url(x)"']) {
      expect(parseSectionMeta(text).colour).toBeNull();
    }
    expect(parseSectionMeta('colour: "#2e6b5e"').colour).toBe('#2e6b5e');
    expect(parseSectionMeta('order: [a, a, 3, b]').order).toEqual(['a', 'b']);
    expect(parseSectionMeta('sort: sideways\nicon: a very long icon indeed').sort).toBe('manual');
    expect(parseSectionMeta('icon: a very long icon indeed').icon).toBeNull();
  });

  it('writes changes, keeping keys it does not know', () => {
    const text = serialiseSectionMeta(
      '# made by hand\ncolour: red\nowner: Ray\n',
      meta({ colour: 'blue', icon: '📓', sort: 'name', order: ['B', 'A'] }),
    );
    expect(text).toBe(
      '# made by hand\ncolour: blue\nowner: Ray\nicon: 📓\nsort: name\norder:\n  - B\n  - A\n',
    );
  });

  it('returns null when nothing is left, so no file is needed', () => {
    expect(serialiseSectionMeta(null, meta())).toBeNull();
    expect(serialiseSectionMeta('colour: red\nsort: name\n', meta())).toBeNull();
    expect(serialiseSectionMeta('colour: red\nowner: x\n', meta())).toBe('owner: x\n');
  });

  it('places and renames names in an order list', () => {
    expect(placeInOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(placeInOrder(['a', 'b'], 'new', 1)).toEqual(['a', 'new', 'b']);
    expect(placeInOrder(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
    expect(renameInOrder(['a', 'b', 'c'], 'b', 'B')).toEqual(['a', 'B', 'c']);
  });
});
