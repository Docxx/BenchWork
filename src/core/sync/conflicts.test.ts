// @vitest-environment node
import { conflictCopy, isConflictCopy, lineDiff, withSyncIgnore } from './conflicts';

describe('conflict copies', () => {
  it('are known by Syncthing’s names, and lead back to their file', () => {
    expect(conflictCopy('Lab/Notes.sync-conflict-20261028-113945-ABCDEF7.md')).toEqual({
      copy: 'Lab/Notes.sync-conflict-20261028-113945-ABCDEF7.md',
      original: 'Lab/Notes.md',
      when: new Date(2026, 9, 28, 11, 39, 45),
      device: 'ABCDEF7',
    });
    expect(
      conflictCopy('attachments/Ink 2026 a1b2.ink.sync-conflict-20261028-113945-ABCDEF7.json')
        ?.original,
    ).toBe('attachments/Ink 2026 a1b2.ink.json');
    expect(conflictCopy('todo.sync-conflict-20261028-113945-ABCDEF7')?.original).toBe('todo');
  });

  it('are not mistaken for ordinary files', () => {
    expect(isConflictCopy('Notes.md')).toBe(false);
    expect(isConflictCopy('sync-conflict notes.md')).toBe(false);
    expect(isConflictCopy('Notes.sync-conflict-2026-ABCDEF7.md')).toBe(false);
    expect(conflictCopy('Notes.md')).toBeNull();
  });
});

describe('the sync ignore file', () => {
  it('gains BenchWork’s lines once, keeping the person’s own', () => {
    const first = withSyncIgnore(null);
    expect(first).toContain('.benchwork/index.sqlite*');
    expect(first).toContain('.benchwork/trash');
    expect(withSyncIgnore(first)).toBeNull();
    const theirs = withSyncIgnore('// mine\n*.tmp\n.benchwork/snapshots\n');
    expect(theirs?.startsWith('// mine\n*.tmp\n.benchwork/snapshots\n\n// BenchWork')).toBe(true);
    expect(theirs?.match(/\.benchwork\/snapshots/g)).toHaveLength(1);
  });
});

describe('comparing two copies', () => {
  it('keeps shared lines in order and shows what each has besides', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'mine', text: 'b' },
      { kind: 'theirs', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'theirs', text: 'd' },
    ]);
    expect(lineDiff('same\r\n', 'same\n').every((l) => l.kind === 'same')).toBe(true);
  });
});
