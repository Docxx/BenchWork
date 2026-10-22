// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import type { DeviceKind } from '../platform';
import { defaultVaultConfig, type VaultConfig } from '../vault/vaultConfig';
import { createContributions } from './contributions';
import { ModuleRegistry, type ModuleSource } from './registry';
import { fakeModule, manifest } from './testModules';

async function setup(sources: ModuleSource[], device: DeviceKind = 'desktop') {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': { '.benchwork': null } } });
  await platform.setVaultRoot('C:/Vault');
  const contributions = createContributions();
  const registry = new ModuleRegistry(sources, [], { platform, device, contributions });
  return { platform, contributions, registry };
}

function statuses(registry: ModuleRegistry): Record<string, string> {
  return Object.fromEntries(
    registry.store.getState().modules.map((m) => [m.manifest.id, m.status]),
  );
}

function config(enabled: Record<string, boolean>): VaultConfig {
  const c = defaultVaultConfig();
  for (const [id, on] of Object.entries(enabled)) c.modules[id] = { enabled: on };
  return c;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('ModuleRegistry', () => {
  it('starts with everything off, or unavailable on the wrong device', async () => {
    const { registry } = await setup(
      [fakeModule('a', []), fakeModule('pen', [], { manifest: { platforms: ['tablet'] } })],
      'desktop',
    );
    expect(statuses(registry)).toEqual({ a: 'off', pen: 'unavailable' });
  });

  it('switches a module on and off, cleaning up after it', async () => {
    const events: string[] = [];
    const { registry, contributions } = await setup([
      fakeModule('hello', events, {
        activate: (ctx) => {
          ctx.views.registerSidebarPanel({ id: 'hello.panel', title: 'Hello', render: () => null });
        },
      }),
    ]);

    await registry.enable(['hello']);
    expect(statuses(registry)).toEqual({ hello: 'on' });
    expect(contributions.getState().panels).toHaveLength(1);

    await registry.disable(['hello']);
    expect(statuses(registry)).toEqual({ hello: 'off' });
    expect(contributions.getState().panels).toHaveLength(0);
    expect(events).toEqual(['activate hello', 'deactivate hello', 'dispose hello']);
  });

  it('plans dependencies first when switching on', async () => {
    const { registry } = await setup([
      fakeModule('manuscript', [], { manifest: { dependsOn: ['references'] } }),
      fakeModule('references', [], { manifest: { dependsOn: ['core-data'] } }),
      fakeModule('core-data', []),
    ]);
    expect(registry.planEnable('manuscript')).toEqual({
      ok: true,
      ids: ['core-data', 'references', 'manuscript'],
    });
    await registry.enable(['core-data']);
    expect(registry.planEnable('manuscript')).toEqual({
      ok: true,
      ids: ['references', 'manuscript'],
    });
  });

  it('plans dependents first when switching off', async () => {
    const { registry } = await setup([
      fakeModule('manuscript', [], { manifest: { dependsOn: ['references'] } }),
      fakeModule('references', []),
      fakeModule('other', []),
    ]);
    await registry.enable(['references', 'manuscript', 'other']);
    expect(registry.planDisable('references')).toEqual({
      ok: true,
      ids: ['manuscript', 'references'],
    });
    expect(registry.planDisable('other')).toEqual({ ok: true, ids: ['other'] });
  });

  it('refuses plans it cannot carry out', async () => {
    const { registry } = await setup(
      [
        fakeModule('manuscript', [], { manifest: { dependsOn: ['references'] } }),
        fakeModule('loop-a', [], { manifest: { dependsOn: ['loop-b'] } }),
        fakeModule('loop-b', [], { manifest: { dependsOn: ['loop-a'] } }),
        fakeModule('pen', [], { manifest: { platforms: ['tablet'] } }),
      ],
      'desktop',
    );
    expect(registry.planEnable('manuscript')).toEqual({
      ok: false,
      reason: 'Manuscript needs the "references" module, which is not installed',
    });
    const loop = registry.planEnable('loop-a');
    expect(!loop.ok && loop.reason).toContain('loop');
    const pen = registry.planEnable('pen');
    expect(!pen.ok && pen.reason).toContain('not available');
  });

  it('keeps the core running when a module fails to start', async () => {
    const events: string[] = [];
    const { registry, contributions } = await setup([
      fakeModule('broken', events, {
        activate: (ctx) => {
          ctx.views.registerSidebarPanel({ id: 'broken.panel', title: 'x', render: () => null });
          throw new Error('Zotero is not running');
        },
      }),
      fakeModule('fine', events),
    ]);
    await registry.enable(['broken', 'fine']);

    expect(statuses(registry)).toEqual({ broken: 'failed', fine: 'on' });
    expect(registry.get('broken')?.error).toBe('Zotero is not running');
    expect(contributions.getState().panels).toEqual([]);
    expect(events).toContain('dispose broken');
    expect(registry.enabledIds()).toEqual(['broken', 'fine']);
  });

  it('can retry a failed module by switching it off and on', async () => {
    let fail = true;
    const { registry } = await setup([
      fakeModule('flaky', [], {
        activate: () => {
          if (fail) throw new Error('not yet');
        },
      }),
    ]);
    await registry.enable(['flaky']);
    fail = false;
    await registry.disable(['flaky']);
    await registry.enable(['flaky']);
    expect(statuses(registry)).toEqual({ flaky: 'on' });
  });

  it('does not start a module whose dependency failed', async () => {
    const { registry } = await setup([
      fakeModule('base', [], {
        activate: () => {
          throw new Error('no');
        },
      }),
      fakeModule('top', [], { manifest: { dependsOn: ['base'] } }),
    ]);
    await registry.enable(['base', 'top']);
    expect(statuses(registry)).toEqual({ base: 'failed', top: 'off' });
    expect(registry.get('top')?.error).toContain('base');
  });

  it('reports a module whose code has no activate function', async () => {
    const { registry } = await setup([
      { manifest: manifest('empty'), load: () => Promise.resolve({} as never) },
    ]);
    await registry.enable(['empty']);
    expect(registry.get('empty')?.error).toContain('defineModule');
  });

  it('starts what the vault config asks for, using defaults for unseen modules', async () => {
    const events: string[] = [];
    const { registry } = await setup([
      fakeModule('top', events, { manifest: { dependsOn: ['base'] } }),
      fakeModule('base', events),
      fakeModule('default-on', events, { manifest: { defaultEnabled: true } }),
      fakeModule('switched-off', events, { manifest: { defaultEnabled: true } }),
      fakeModule('orphan', events, { manifest: { dependsOn: ['missing-dep'] } }),
    ]);
    await registry.activateFromConfig(
      config({ top: true, base: true, 'switched-off': false, orphan: true }),
    );
    expect(statuses(registry)).toEqual({
      top: 'on',
      base: 'on',
      'default-on': 'on',
      'switched-off': 'off',
      orphan: 'off',
    });
    expect(events.indexOf('activate base')).toBeLessThan(events.indexOf('activate top'));
    expect(registry.get('orphan')?.error).toContain('missing-dep');
  });

  it('stops everything, dependents first', async () => {
    const events: string[] = [];
    const { registry } = await setup([
      fakeModule('base', events),
      fakeModule('top', events, { manifest: { dependsOn: ['base'] } }),
    ]);
    await registry.enable(['base', 'top']);
    events.length = 0;
    await registry.deactivateAll();
    expect(events).toEqual(['deactivate top', 'dispose top', 'deactivate base', 'dispose base']);
  });

  it('runs changes one at a time', async () => {
    const events: string[] = [];
    let release: () => void = () => undefined;
    const { registry } = await setup([
      fakeModule('slow', events, {
        activate: () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      }),
    ]);
    const on = registry.enable(['slow']);
    const off = registry.disable(['slow']);
    await vi.waitFor(() => {
      expect(events).toEqual(['activate slow']);
    });
    // Still mid-start, so the switch-off has not begun.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events).toEqual(['activate slow']);
    release();
    await Promise.all([on, off]);
    expect(events).toEqual(['activate slow', 'deactivate slow', 'dispose slow']);
    expect(statuses(registry)).toEqual({ slow: 'off' });
  });

  it('never touches vault files when switching modules', async () => {
    const platform = new MemoryAdapter({
      folders: { 'C:/Vault': { '.benchwork': null, 'notes.md': 'keep me', 'Data/run.csv': 'a' } },
    });
    await platform.setVaultRoot('C:/Vault');
    const registry = new ModuleRegistry(
      [
        fakeModule('hello', [], {
          activate: async (ctx) => {
            await ctx.storage.write('state.json', { on: true });
          },
        }),
      ],
      [],
      { platform, device: 'desktop', contributions: createContributions() },
    );
    const userFiles = () =>
      Object.fromEntries(
        Object.entries(platform.snapshot()).filter(([path]) => !path.startsWith('.benchwork')),
      );
    const before = userFiles();
    await registry.enable(['hello']);
    await registry.disable(['hello']);
    await registry.enable(['hello']);
    await registry.deactivateAll();
    expect(userFiles()).toEqual(before);
    expect(platform.snapshot()['.benchwork/modules/hello/state.json']).toContain('"on": true');
  });

  it('flags two modules with the same id', () => {
    const platform = new MemoryAdapter();
    const registry = new ModuleRegistry([fakeModule('a', []), fakeModule('a', [])], [], {
      platform,
      device: 'desktop',
      contributions: createContributions(),
    });
    expect(registry.store.getState().modules).toHaveLength(1);
    expect(registry.store.getState().broken).toEqual([
      { folder: 'a', errors: ['Two modules share this id'] },
    ]);
  });
});
