// @vitest-environment node
import {
  guessKind,
  isPropertyKey,
  labelFor,
  linkTargets,
  linkValue,
  listOf,
  propertyRows,
  textOf,
  valueFromText,
} from './propertyValues';

describe('property rows', () => {
  it('lists the type fields first, then other keys, without the quiet ones', () => {
    const rows = propertyRows(
      { id: 'x', type: 'experiment', status: 'running', cell_line: 'HeLa', tags: ['a'] },
      [
        { key: 'aim', label: 'Aim', kind: 'text' },
        { key: 'status', label: 'Status', kind: 'choice', options: ['running'] },
      ],
    );
    expect(rows.map((r) => [r.key, r.label, r.kind, r.value, r.extra])).toEqual([
      ['aim', 'Aim', 'text', undefined, false],
      ['status', 'Status', 'choice', 'running', false],
      ['cell_line', 'Cell line', 'text', 'HeLa', true],
    ]);
  });

  it('guesses kinds for keys no type defines', () => {
    expect(guessKind('[[Dose]]')).toBe('link');
    expect(guessKind(['[[a]]', '[[b]]'])).toBe('links');
    expect(guessKind(['w1118', '[[b]]'])).toBe('list');
    expect(guessKind('2026-10-21')).toBe('date');
    expect(guessKind(12)).toBe('text');
    expect(labelFor('cellLine')).toBe('Cell line');
  });
});

describe('property values', () => {
  it('shows values as text and lists', () => {
    expect(textOf(['a', 2])).toBe('a, 2');
    expect(textOf(null)).toBe('');
    expect(listOf('one')).toEqual(['one']);
    expect(listOf(undefined)).toEqual([]);
  });

  it('reads and writes links the way Obsidian does', () => {
    expect(linkTargets(['[[climbing-day7]]', '[[Data/scan]]'])).toEqual([
      'climbing-day7',
      'Data/scan',
    ]);
    expect(linkTargets('[[LPS feeding v3]]')).toEqual(['LPS feeding v3']);
    expect(linkValue(['a', 'b'], 'links')).toEqual(['[[a]]', '[[b]]']);
    expect(linkValue(['a'], 'link')).toBe('[[a]]');
    expect(linkValue([], 'link')).toBeNull();
  });

  it('turns typed text into stored values', () => {
    expect(valueFromText('list', ' w1118, elav>tau ,')).toEqual(['w1118', 'elav>tau']);
    expect(valueFromText('links', 'a, [[b]]')).toEqual(['[[a]]', '[[b]]']);
    expect(valueFromText('link', '[[Dose]]')).toBe('[[Dose]]');
    expect(valueFromText('text', '  ')).toBeNull();
  });

  it('accepts only usable names for new properties', () => {
    expect(isPropertyKey('cell line')).toBe(true);
    expect(isPropertyKey('id')).toBe(false);
    expect(isPropertyKey('a: b')).toBe(false);
    expect(isPropertyKey('  ')).toBe(false);
  });
});
