// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createContributions } from './contributions';
import { createModuleContext } from './context';
import { manifest, quietLogger } from './testModules';

async function setup() {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': { '.benchwork': null } } });
  await platform.setVaultRoot('C:/Vault');
  const contributions = createContributions();
  const handle = createModuleContext(manifest('hello'), {
    platform,
    device: 'desktop',
    contributions,
    logger: quietLogger,
  });
  return { platform, contributions, handle, ctx: handle.ctx };
}

describe('module context', () => {
  it('adds and removes sidebar panels', async () => {
    const { contributions, ctx } = await setup();
    const panel = ctx.views.registerSidebarPanel({
      id: 'hello.panel',
      title: 'Hello',
      render: () => 'Hi',
    });
    expect(contributions.getState().panels.map((p) => [p.id, p.moduleId])).toEqual([
      ['hello.panel', 'hello'],
    ]);
    panel.dispose();
    panel.dispose();
    expect(contributions.getState().panels).toEqual([]);
  });

  it('insists panel ids start with the module id', async () => {
    const { ctx } = await setup();
    expect(() =>
      ctx.views.registerSidebarPanel({ id: 'panel', title: 'x', render: () => null }),
    ).toThrow("must start with 'hello.'");
    ctx.views.registerSidebarPanel({ id: 'hello.a', title: 'x', render: () => null });
    expect(() =>
      ctx.views.registerSidebarPanel({ id: 'hello.a', title: 'x', render: () => null }),
    ).toThrow('already registered');
  });

  it('cleans up everything, newest first, and survives a failing clean-up', async () => {
    const { contributions, handle, ctx } = await setup();
    const order: string[] = [];
    ctx.onDispose(() => order.push('first'));
    ctx.views.registerSidebarPanel({ id: 'hello.panel', title: 'Hello', render: () => null });
    ctx.onDispose(() => {
      throw new Error('boom');
    });
    ctx.onDispose(() => order.push('last'));

    handle.dispose();
    handle.dispose();
    expect(order).toEqual(['last', 'first']);
    expect(contributions.getState().panels).toEqual([]);
  });

  it('refuses registrations after switch-off', async () => {
    const { handle, ctx } = await setup();
    handle.dispose();
    expect(() => {
      ctx.onDispose(() => undefined);
    }).toThrow('switched off');
  });

  it('stores JSON only in .benchwork/modules/<id>/', async () => {
    const { platform, ctx } = await setup();
    expect(await ctx.storage.read('state.json')).toBeNull();
    await ctx.storage.write('state.json', { count: 2 });
    expect(await ctx.storage.read('state.json')).toEqual({ count: 2 });
    expect(Object.keys(platform.snapshot())).toEqual([
      '.benchwork',
      '.benchwork/modules',
      '.benchwork/modules/hello',
      '.benchwork/modules/hello/state.json',
    ]);
  });

  it('rejects storage names that are paths', async () => {
    const { ctx } = await setup();
    for (const name of ['../escape.json', 'sub/state.json', '', '../../notes.md']) {
      await expect(ctx.storage.write(name, {})).rejects.toThrow();
    }
  });
});

describe('module context: Phase 2 extension points', () => {
  it('adds page types, commands and file handlers, and removes them on switch-off', async () => {
    const { contributions, ctx, handle } = await setup();
    ctx.pageTypes.register({ type: 'experiment', name: 'Experiment', fields: [] });
    ctx.commands.register({ id: 'hello.go', title: 'Go', run: () => undefined });
    ctx.files.register({
      id: 'hello.viewer',
      extensions: ['.Dataset.yaml'],
      name: 'Dataset',
      render: () => null,
    });
    const state = contributions.getState();
    expect(state.pageTypes.map((t) => [t.type, t.moduleId])).toEqual([['experiment', 'hello']]);
    expect(state.commands.map((c) => c.id)).toEqual(['hello.go']);
    expect(state.fileHandlers.map((h) => h.extensions)).toEqual([['.dataset.yaml']]);

    handle.dispose();
    expect(contributions.getState()).toMatchObject({
      pageTypes: [],
      commands: [],
      fileHandlers: [],
    });
  });

  it('refuses clashes and names it cannot use', async () => {
    const { ctx } = await setup();
    ctx.pageTypes.register({ type: 'experiment', name: 'Experiment', fields: [] });
    expect(() => ctx.pageTypes.register({ type: 'experiment', name: 'Again', fields: [] })).toThrow(
      'already registered',
    );
    expect(() => ctx.pageTypes.register({ type: 'page', name: 'Page', fields: [] })).toThrow();
    expect(() => ctx.pageTypes.register({ type: 'Big Type', name: 'Big', fields: [] })).toThrow();
    expect(() => ctx.commands.register({ id: 'go', title: 'Go', run: () => undefined })).toThrow(
      "must start with 'hello.'",
    );
    for (const extensions of [['.md'], ['csv'], ['.a b']]) {
      expect(() =>
        ctx.files.register({ id: 'hello.x', extensions, name: 'X', render: () => null }),
      ).toThrow();
    }
  });

  it('reads and writes vault files, with no way to delete them', async () => {
    const { platform, ctx } = await setup();
    await ctx.vault.ensureDir('Lab/Data');
    await ctx.vault.createNew('Lab/Data/a.dataset.yaml', 'id: 1\n');
    await expect(ctx.vault.createNew('Lab/Data/a.dataset.yaml', 'x')).rejects.toThrow();
    await ctx.vault.writeText('Lab/Data/a.dataset.yaml', 'id: 2\n');
    expect(await ctx.vault.readText('Lab/Data/a.dataset.yaml')).toBe('id: 2\n');
    expect(await ctx.vault.freeName('Lab/Data', 'a', '.dataset.yaml')).toBe('a 2.dataset.yaml');
    expect(await ctx.vault.hashFile('Lab/Data/a.dataset.yaml')).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(ctx.vault)).not.toContain('trash');
    expect(platform.snapshot()['Lab/Data/a.dataset.yaml']).toBe('id: 2\n');
  });

  it('stops watching when switched off', async () => {
    const { ctx, handle } = await setup();
    const seen: string[][] = [];
    ctx.vault.watch((change) => seen.push(change.paths));
    await ctx.vault.writeText('a.md', 'x');
    await new Promise((resolve) => setTimeout(resolve, 5));
    handle.dispose();
    await ctx.vault.writeText('b.md', 'x').catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toEqual([['a.md']]);
  });

  it('says so when the app is not connected yet', async () => {
    const { ctx } = await setup();
    await expect(Promise.resolve().then(() => ctx.app.items())).rejects.toThrow('not ready');
  });
});
