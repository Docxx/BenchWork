// @vitest-environment node
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import {
  createFolder,
  createPage,
  moveItem,
  NameError,
  readSectionMeta,
  recycleItem,
  renameItem,
  safeName,
  setColour,
} from './notebookService';

async function vault(contents: MemoryFolderContents = {}) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  await platform.setVaultRoot('C:/Vault');
  return platform;
}

const fixed = { newId: () => 'id-1', now: () => '2026-10-22T10:30:00+01:00' };

describe('safeName', () => {
  it.each([
    ['Day 1', 'Day 1'],
    ['  LPS: dose? ', 'LPS- dose-'],
    ['a/b\\c', 'a-b-c'],
    ['Ends with dots...', 'Ends with dots'],
    ['con', 'con_'],
    ['Con.md', 'Con.md_'],
  ])('turns %j into %j', (input, expected) => {
    expect(safeName(input)).toBe(expected);
  });

  it('refuses empty names', () => {
    for (const title of ['', '   ', '...', '..']) expect(() => safeName(title)).toThrow(NameError);
  });
});

describe('creating', () => {
  it('numbers new notebooks and sections when the default name is taken', async () => {
    const platform = await vault({ 'New notebook': null });
    expect(await createFolder(platform, '')).toBe('New notebook 2');
    expect(await createFolder(platform, 'New notebook')).toBe('New notebook/New section');
  });

  it('refuses a folder name that is taken', async () => {
    const platform = await vault({ Lab: null });
    await expect(createFolder(platform, '', 'Lab')).rejects.toThrow('already a notebook');
  });

  it('creates pages with an id and created time', async () => {
    const platform = await vault({ Lab: null });
    expect(await createPage(platform, 'Lab', fixed)).toBe('Lab/Untitled page.md');
    expect(await createPage(platform, 'Lab', fixed)).toBe('Lab/Untitled page 2.md');
    expect(platform.snapshot()['Lab/Untitled page.md']).toBe(
      '---\nid: id-1\ncreated: 2026-10-22T10:30:00+01:00\n---\n',
    );
    expect(await createPage(platform, 'Lab', { ...fixed, title: 'Plan', body: '# Plan\n' })).toBe(
      'Lab/Plan.md',
    );
    expect(platform.snapshot()['Lab/Plan.md']).toContain('---\n# Plan\n');
  });

  it('never overwrites an existing page', async () => {
    const platform = await vault({ 'Lab/Plan.md': 'keep me' });
    await expect(createPage(platform, 'Lab', { ...fixed, title: 'Plan' })).rejects.toThrow(
      'already a page',
    );
    expect(platform.snapshot()['Lab/Plan.md']).toBe('keep me');
  });
});

describe('renaming', () => {
  it('keeps .md on pages and updates the folder order', async () => {
    const platform = await vault({
      'Lab/Old.md': 'x',
      'Lab/Other.md': 'y',
      'Lab/_section.yaml': 'colour: red\norder:\n  - Old.md\n  - Other.md\n',
    });
    expect(await renameItem(platform, 'Lab/Old.md', 'New: draft')).toBe('Lab/New- draft.md');
    expect(await readSectionMeta(platform, 'Lab')).toEqual({
      colour: 'red',
      order: ['New- draft.md', 'Other.md'],
    });
  });

  it('renames folders, and refuses a name that is taken', async () => {
    const platform = await vault({ 'Lab/a.md': 'a', Other: null });
    expect(await renameItem(platform, 'Lab', 'Lab notes')).toBe('Lab notes');
    expect(platform.snapshot()['Lab notes/a.md']).toBe('a');
    await expect(renameItem(platform, 'Lab notes', 'Other')).rejects.toThrow(NameError);
  });

  it('does nothing when the name is unchanged', async () => {
    const platform = await vault({ 'Lab/a.md': 'a' });
    expect(await renameItem(platform, 'Lab/a.md', 'a')).toBe('Lab/a.md');
    expect(platform.snapshot()).toEqual({ Lab: null, 'Lab/a.md': 'a' });
  });
});

describe('moving', () => {
  it('moves into another folder and out of the old folder order', async () => {
    const platform = await vault({
      'Lab/a.md': 'a',
      'Lab/_section.yaml': 'order:\n  - a.md\n',
      Archive: null,
    });
    expect(await moveItem(platform, 'Lab/a.md', 'Archive')).toBe('Archive/a.md');
    expect(platform.snapshot()['Archive/a.md']).toBe('a');
    expect(await readSectionMeta(platform, 'Lab')).toEqual({ colour: null, order: [] });
  });

  it('places an item in order, keeping the others where they were', async () => {
    const platform = await vault({ 'Lab/a.md': 'a', 'Lab/b.md': 'b', 'Lab/c.md': 'c' });
    await moveItem(platform, 'Lab/c.md', 'Lab', { index: 0, siblings: ['a.md', 'b.md', 'c.md'] });
    expect((await readSectionMeta(platform, 'Lab'))?.order).toEqual(['c.md', 'a.md', 'b.md']);
  });

  it('refuses to move a folder into itself or onto a name that is taken', async () => {
    const platform = await vault({ 'Lab/Inner': null, 'Lab/a.md': 'a', 'Other/a.md': 'other' });
    await expect(moveItem(platform, 'Lab', 'Lab/Inner')).rejects.toThrow('inside itself');
    await expect(moveItem(platform, 'Lab/a.md', 'Other')).rejects.toThrow(NameError);
    expect(platform.snapshot()['Other/a.md']).toBe('other');
  });
});

describe('colour and recycling', () => {
  it('sets and clears a folder colour, keeping other settings', async () => {
    const platform = await vault({ 'Lab/_section.yaml': 'icon: flask\n' });
    await setColour(platform, 'Lab', 'teal');
    expect(platform.snapshot()['Lab/_section.yaml']).toBe('icon: flask\ncolour: teal\n');
    await setColour(platform, 'Lab', null);
    expect(platform.snapshot()['Lab/_section.yaml']).toBe('icon: flask\n');
  });

  it('writes no settings file just to clear a colour that was never set', async () => {
    const platform = await vault({ Lab: null });
    await setColour(platform, 'Lab', null);
    expect(platform.snapshot()).toEqual({ Lab: null });
  });

  it('sends items to the Recycle Bin and drops them from the order', async () => {
    const platform = await vault({
      'Lab/a.md': 'a',
      'Lab/b.md': 'b',
      'Lab/_section.yaml': 'order:\n  - a.md\n  - b.md\n',
    });
    await recycleItem(platform, 'Lab/a.md');
    expect(platform.trashed()).toEqual(['Lab/a.md']);
    expect((await readSectionMeta(platform, 'Lab'))?.order).toEqual(['b.md']);
  });
});
