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
