// @vitest-environment node
import { parseSectionMeta, placeInOrder, renameInOrder, serialiseSectionMeta } from './sectionMeta';

describe('section settings', () => {
  it('reads colour and order', () => {
    expect(parseSectionMeta('colour: teal\norder: [Protocols, Day 1.md]\n')).toEqual({
      colour: 'teal',
      order: ['Protocols', 'Day 1.md'],
    });
  });

  it('treats broken or odd files as empty, and ignores unsafe colours', () => {
    for (const text of ['', 'order: [unclosed', '- a list', 'colour: "red; background: url(x)"']) {
      expect(parseSectionMeta(text).colour).toBeNull();
    }
    expect(parseSectionMeta('colour: "#2e6b5e"').colour).toBe('#2e6b5e');
    expect(parseSectionMeta('order: [a, a, 3, b]').order).toEqual(['a', 'b']);
  });

  it('writes changes, keeping keys it does not know', () => {
    const text = serialiseSectionMeta('# made by hand\ncolour: red\nicon: flask\n', {
      colour: 'blue',
      order: ['B', 'A'],
    });
    expect(text).toBe('# made by hand\ncolour: blue\nicon: flask\norder:\n  - B\n  - A\n');
  });

  it('returns null when nothing is left, so no file is needed', () => {
    expect(serialiseSectionMeta(null, { colour: null, order: [] })).toBeNull();
    expect(serialiseSectionMeta('colour: red\n', { colour: null, order: [] })).toBeNull();
    expect(serialiseSectionMeta('colour: red\nicon: x\n', { colour: null, order: [] })).toBe(
      'icon: x\n',
    );
  });

  it('places and renames names in an order list', () => {
    expect(placeInOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(placeInOrder(['a', 'b'], 'new', 1)).toEqual(['a', 'new', 'b']);
    expect(placeInOrder(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
    expect(renameInOrder(['a', 'b', 'c'], 'b', 'B')).toEqual(['a', 'B', 'c']);
  });
});
