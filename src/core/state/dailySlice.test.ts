// @vitest-environment node
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { createAppStore } from './appStore';

const THURSDAY = new Date(2026, 9, 22, 9, 15);

async function openVault(contents: MemoryFolderContents = {}) {
  const platform = new MemoryAdapter({
    folders: { 'C:/Vault': { '.benchwork/config.json': '{"version":1}', ...contents } },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, state: () => store.getState(), file: (p: string) => platform.snapshot()[p] };
}

describe('Today', () => {
  it("creates today's page in a month section, then opens the same page next time", async () => {
    const { state, file } = await openVault();
    await state().openToday(THURSDAY);
    expect(state().page?.path).toBe('Daily/2026-10/2026-10-22.md');
    const text = file('Daily/2026-10/2026-10-22.md') ?? '';
    expect(text).toMatch(
      /^---\nid: [0-9a-f-]{36}\ncreated: 2026-10-22T09:15:00[+-]\d\d:\d\d\n---\n/,
    );
    expect(text.endsWith('# Thursday 22 October 2026\n\n')).toBe(true);
    expect(state().tree.selected).toBe('Daily/2026-10/2026-10-22.md');

    await state().closePage();
    await state().openToday(THURSDAY);
    expect(state().page?.path).toBe('Daily/2026-10/2026-10-22.md');
    expect(file('Daily/2026-10/2026-10-22.md')).toBe(text);
  });

  it('opens an existing page in the old flat layout', async () => {
    const { state, file } = await openVault({ 'Daily/2026-10-22.md': 'Written already.\n' });
    await state().openToday(THURSDAY);
    expect(state().page?.path).toBe('Daily/2026-10-22.md');
    expect(file('Daily/2026-10/2026-10-22.md')).toBeUndefined();
  });

  it('starts from the Daily template when there is one', async () => {
    const { state, file } = await openVault({
      'templates/Daily.md': '---\ntags: [daily]\n---\n# {{date:dddd D MMMM}}\n\n## Plan\n',
    });
    await state().openToday(THURSDAY);
    const text = file('Daily/2026-10/2026-10-22.md') ?? '';
    // The id goes first, as on every page; the template's own keys follow.
    expect(text).toMatch(/^---\nid: [0-9a-f-]{36}\ntags: \[daily\]\ncreated: /);
    expect(text).toContain('---\n# Thursday 22 October\n\n## Plan\n');
  });
});

describe('previous and next day', () => {
  it('skip days without a page, across months and layouts', async () => {
    const { state } = await openVault({
      'Daily/2026-09/2026-09-30.md': '',
      'Daily/2026-10-20.md': '',
      'Daily/2026-10/2026-10-22.md': '',
    });
    await state().openPage('Daily/2026-10-20.md');
    await vi.waitFor(() => {
      expect(state().dayNeighbours).toEqual({
        previous: 'Daily/2026-09/2026-09-30.md',
        next: 'Daily/2026-10/2026-10-22.md',
      });
    });
    await state().openPage('Daily/2026-10/2026-10-22.md');
    await vi.waitFor(() => {
      expect(state().dayNeighbours).toEqual({ previous: 'Daily/2026-10-20.md', next: null });
    });
  });

  it('are empty for pages that are not daily pages', async () => {
    const { state } = await openVault({ 'Lab/Plan.md': '' });
    await state().openPage('Lab/Plan.md');
    await vi.waitFor(() => {
      expect(state().dayNeighbours).toEqual({ previous: null, next: null });
    });
  });
});

describe('templates', () => {
  const PROTOCOL = '---\ntype: protocol\n---\n# {{title}}\n\nDate: {{date}}\n';

  it('make new pages, filled in with the page name', async () => {
    const { state, file } = await openVault({ 'templates/Protocol.md': PROTOCOL, Lab: null });
    await state().loadTemplates();
    expect(state().templates).toEqual([{ path: 'templates/Protocol.md', title: 'Protocol' }]);
    const path = await state().createFromTemplate('Lab', 'templates/Protocol.md', 'Western blot');
    expect(path).toBe('Lab/Western blot.md');
    expect(state().page?.path).toBe(path);
    const text = file('Lab/Western blot.md') ?? '';
    expect(text).toMatch(
      /^---\nid: [0-9a-f-]{36}\ntype: protocol\ncreated: .+\n---\n# Western blot\n/,
    );
  });

  it('can be saved from a page, and inserted into another', async () => {
    const { state, file } = await openVault({
      'Lab/Steps.md': '---\nid: s1\n---\n1. Spin at {{time}}\n',
      'Lab/Run.md': '',
    });
    const saved = await state().saveAsTemplate('Lab/Steps.md');
    expect(saved).toBe('templates/Steps.md');
    expect(file('templates/Steps.md')).toBe('1. Spin at {{time}}\n');
    expect(state().sidebarNotice).toBe('Saved as a template: Steps.');

    await state().openPage('Lab/Run.md');
    expect(await state().templateBodyFor('templates/Steps.md', THURSDAY)).toBe(
      '1. Spin at 09:15\n',
    );
    expect(await state().templateBodyFor('templates/Missing.md')).toBeNull();
  });
});
