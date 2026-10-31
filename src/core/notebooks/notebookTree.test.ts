// @vitest-environment node
import type { DirEntry } from '../platform';
import { emptyTree, visibleEntries, type TreeState } from '../vault/fileTree';
import { isPage, notebookRows, orderEntries, pageTitle, type LayoutOptions } from './notebookTree';
import { isPreviewed as previewed } from './notebookTree';

function entry(path: string, isDir = false): DirEntry {
  return { name: path.slice(path.lastIndexOf('/') + 1), path, isDir, size: 0, modified: null };
}

const hideFiles = { showAllFiles: false };

function drawn(tree: TreeState, options: LayoutOptions = hideFiles): string[] {
  return notebookRows(tree, options).map((r) =>
    r.kind === 'node'
      ? `${'  '.repeat(r.depth)}${r.node.kind}:${r.node.title}${r.node.colour ? ` (${r.node.colour})` : ''}`
      : `${'  '.repeat(r.depth)}[${r.kind}]`,
  );
}

describe('pages', () => {
  it('are .md files, titled without the extension', () => {
    expect(isPage('Day 1.md')).toBe(true);
    expect(isPage('NOTES.MD')).toBe(true);
    expect(isPage('.md')).toBe(false);
    expect(isPage('data.csv')).toBe(false);
    expect(pageTitle('Day 1.md')).toBe('Day 1');
    expect(pageTitle('data.csv')).toBe('data.csv');
  });
});

describe('orderEntries', () => {
  const names = (entries: DirEntry[]) => entries.map((e) => e.name);
  const entries = visibleEntries([
    entry('b.md'),
    entry('Protocols', true),
    entry('a.md'),
    entry('Daily', true),
    entry('Archive', true),
  ]);

  it('puts named entries first, in order, then the rest sorted', () => {
    expect(names(orderEntries(entries, ['b.md', 'Protocols'], false))).toEqual([
      'b.md',
      'Protocols',
      'Archive',
      'Daily',
      'a.md',
    ]);
  });

  it('ignores names in the order that no longer exist', () => {
    expect(names(orderEntries(entries, ['gone.md', 'a.md'], false))[0]).toBe('a.md');
  });

  it('always puts the Daily notebook first at the top level', () => {
    expect(names(orderEntries(entries, ['Archive'], true))).toEqual([
      'Daily',
      'Archive',
      'Protocols',
      'a.md',
      'b.md',
    ]);
  });
});

describe('notebookRows', () => {
  const tree: TreeState = {
    ...emptyTree(),
    folders: {
      '': {
        status: 'loaded',
        entries: visibleEntries([
          entry('LPS model', true),
          entry('Daily', true),
          entry('attachments', true),
          entry('templates', true),
          entry('Loose page.md'),
          entry('photo.png'),
          entry('_section.yaml'),
        ]),
        childColours: { 'LPS model': 'teal' },
      },
      'LPS model': {
        status: 'loaded',
        entries: visibleEntries([
          entry('LPS model/Experiments', true),
          entry('LPS model/Plan.md'),
          entry('LPS model/data.csv'),
          entry('LPS model/Ideas.canvas.json'),
          entry('LPS model/day7.dataset.yaml'),
          entry('LPS model/notes.txt'),
          entry('LPS model/_section.yaml'),
        ]),
        meta: { colour: 'teal', icon: null, sort: 'manual', order: ['Plan.md'] },
        childColours: { 'LPS model/Experiments': 'red' },
      },
      'LPS model/Experiments': { status: 'loaded', entries: [] },
    },
    expanded: ['LPS model', 'LPS model/Experiments'],
  };

  it('shows notebooks, sections, pages and files it can preview, hiding the rest', () => {
    expect(drawn(tree)).toEqual([
      'notebook:Daily',
      'notebook:LPS model (teal)',
      '  page:Plan',
      '  section:Experiments (red)',
      '    [empty]',
      '  file:data.csv',
      '  file:day7',
      '  file:Ideas',
      'page:Loose page',
      'file:photo.png',
    ]);
  });

  it('shows everything when asked, except section settings files', () => {
    const rows = drawn(tree, { showAllFiles: true });
    expect(rows).toContain('notebook:attachments');
    expect(rows).toContain('file:photo.png');
    expect(rows).toContain('  file:data.csv');
    expect(rows).toContain('  file:notes.txt');
    expect(rows.some((r) => r.includes('_section.yaml'))).toBe(false);
  });
});

describe('files shown in the sidebar', () => {
  it('include Word documents, but not the lock files Word keeps beside them', () => {
    expect(previewed('Climbing.docx')).toBe(true);
    expect(previewed('~$imbing.docx')).toBe(false);
    expect(previewed('.hidden.pdf')).toBe(false);
  });
});

describe('sorting and hiding in the list', () => {
  const at = (path: string, isDir: boolean, modified: number): DirEntry => ({
    ...entry(path, isDir),
    modified,
  });
  const names = (list: DirEntry[]) => list.map((e) => e.name);
  const entries = [
    at('b.md', false, 3),
    at('a.md', false, 1),
    at('Zed', true, 0),
    at('c.md', false, 2),
  ];

  it('sorts by name either way or by last changed, folders first', () => {
    expect(names(orderEntries(entries, [], false, 'name'))).toEqual([
      'Zed',
      'a.md',
      'b.md',
      'c.md',
    ]);
    expect(names(orderEntries(entries, [], false, 'name-desc'))).toEqual([
      'Zed',
      'c.md',
      'b.md',
      'a.md',
    ]);
    expect(names(orderEntries(entries, ['c.md'], false, 'changed'))).toEqual([
      'Zed',
      'b.md',
      'c.md',
      'a.md',
    ]);
  });

  it('leaves out the Daily notebook, or files that are not pages, when asked', () => {
    const tree: TreeState = {
      ...emptyTree(),
      folders: {
        '': {
          status: 'loaded',
          entries: visibleEntries([entry('Daily', true), entry('Lab', true), entry('data.csv')]),
        },
      },
    };
    expect(drawn(tree, { showAllFiles: false }).join()).toContain('Daily');
    expect(drawn(tree, { showAllFiles: false, hideDaily: true }).join()).not.toContain('Daily');
    expect(drawn(tree, { showAllFiles: false }).join()).toContain('data.csv');
    expect(drawn(tree, { showAllFiles: false, pagesOnly: true }).join()).not.toContain('data.csv');
  });
});
