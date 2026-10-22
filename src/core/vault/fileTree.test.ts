// @vitest-environment node
import type { DirEntry } from '../platform';
import { compareEntries, emptyTree, treeRows, visibleEntries, type TreeState } from './fileTree';

function entry(path: string, isDir = false): DirEntry {
  return { name: path.slice(path.lastIndexOf('/') + 1), path, isDir, size: 0, modified: null };
}

describe('visibleEntries', () => {
  it('puts folders first, then sorts naturally ignoring case', () => {
    const sorted = visibleEntries([
      entry('Day 10.md'),
      entry('zebra'),
      entry('Day 2.md'),
      entry('Archive', true),
      entry('apple.md'),
      entry('2026', true),
      entry('Day 1.md'),
    ]);
    expect(sorted.map((e) => e.name)).toEqual([
      '2026',
      'Archive',
      'apple.md',
      'Day 1.md',
      'Day 2.md',
      'Day 10.md',
      'zebra',
    ]);
  });

  it('hides dot files and folders, including .benchwork and temp files', () => {
    const shown = visibleEntries([
      entry('.benchwork', true),
      entry('.git', true),
      entry('.page.md.123.0.tmp'),
      entry('page.md'),
    ]);
    expect(shown.map((e) => e.name)).toEqual(['page.md']);
  });

  it('orders names that differ only by case consistently', () => {
    expect(compareEntries(entry('Notes'), entry('notes'))).toBeLessThan(0);
    expect(compareEntries(entry('notes'), entry('Notes'))).toBeGreaterThan(0);
  });
});

describe('treeRows', () => {
  it('shows a loading row before the root arrives', () => {
    expect(treeRows(emptyTree())).toEqual([{ kind: 'loading', parent: '', depth: 0 }]);
  });

  it('shows an empty vault message', () => {
    const tree: TreeState = { ...emptyTree(), folders: { '': { status: 'loaded', entries: [] } } };
    expect(treeRows(tree)).toEqual([{ kind: 'empty', parent: '', depth: 0 }]);
  });

  it('walks only into open folders', () => {
    const tree: TreeState = {
      folders: {
        '': { status: 'loaded', entries: [entry('A', true), entry('B', true), entry('c.md')] },
        A: { status: 'loaded', entries: [entry('A/Inner', true), entry('A/a.md')] },
        'A/Inner': { status: 'loading' },
        B: { status: 'loaded', entries: [entry('B/hidden.md')] },
      },
      expanded: ['A', 'A/Inner'],
      selected: null,
    };
    expect(
      treeRows(tree).map((r) =>
        r.kind === 'entry'
          ? `${'  '.repeat(r.depth)}${r.entry.name}${r.expanded ? ' (open)' : ''}`
          : `${'  '.repeat(r.depth)}[${r.kind}]`,
      ),
    ).toEqual(['A (open)', '  Inner (open)', '    [loading]', '  a.md', 'B', 'c.md']);
  });

  it('shows errors and empty folders in place', () => {
    const tree: TreeState = {
      folders: {
        '': { status: 'loaded', entries: [entry('Broken', true), entry('Empty', true)] },
        Broken: { status: 'error', message: 'No access' },
        Empty: { status: 'loaded', entries: [] },
      },
      expanded: ['Broken', 'Empty'],
      selected: null,
    };
    const rows = treeRows(tree).filter((r) => r.kind !== 'entry');
    expect(rows).toEqual([
      { kind: 'error', parent: 'Broken', depth: 1, message: 'No access' },
      { kind: 'empty', parent: 'Empty', depth: 1 },
    ]);
  });
});
