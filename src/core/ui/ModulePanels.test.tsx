import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, useState } from 'react';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { VAULT_CONFIG_PATH } from '../vault/vaultConfig';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';

async function renderWith(registryModules: Parameters<typeof fakeModule>[] = []) {
  const platform = new MemoryAdapter({
    folders: { 'C:/Vault': { [VAULT_CONFIG_PATH]: '{"version":1}' } },
  });
  const registry = new ModuleRegistry(
    registryModules.map((args) => fakeModule(...args)),
    [],
    { platform, device: 'desktop', contributions: createContributions() },
  );
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().start();
    await store.getState().chooseFolder('open');
  });
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return { store, registry, platform };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('module panels in the sidebar', () => {
  it('appear when a module is switched on and go when it is off', async () => {
    const { store } = await renderWith([
      [
        'notes',
        [],
        {
          activate: (ctx) => {
            ctx.views.registerSidebarPanel({
              id: 'notes.panel',
              title: 'Quick notes',
              render: () => 'Panel body',
            });
          },
        },
      ],
    ]);
    expect(screen.queryByRole('region', { name: 'Quick notes' })).toBeNull();

    await act(() => store.getState().setModuleEnabled('notes', true));
    // Folded at first, to its heading; opened, it stays open.
    expect(screen.getByRole('region', { name: 'Quick notes' }).textContent).not.toContain(
      'Panel body',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick notes' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('region', { name: 'Quick notes' }).textContent).toContain('Panel body');
    expect(store.getState().settings.openPanels).toEqual(['notes.panel']);

    await act(() => store.getState().setModuleEnabled('notes', false));
    expect(screen.queryByRole('region', { name: 'Quick notes' })).toBeNull();
  });

  it('a panel that crashes while drawing does not break the app', async () => {
    const { store } = await renderWith([
      [
        'bad',
        [],
        {
          activate: (ctx) => {
            ctx.views.registerSidebarPanel({
              id: 'bad.panel',
              title: 'Bad panel',
              render: () => {
                throw new Error('render failed');
              },
            });
          },
        },
      ],
    ]);
    await act(() => store.getState().setModuleEnabled('bad', true));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bad panel' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('region', { name: 'Bad panel' }).textContent).toContain(
      'This panel could not be shown.',
    );
    expect(screen.getByRole('tree', { name: 'Notebooks' })).toBeDefined();
  });
});

describe('module file views', () => {
  let mounts = 0;
  function Probe({ path }: { path: string }) {
    const [mount] = useState(() => (mounts += 1));
    return `${path} view ${String(mount)}`;
  }

  async function changeOnDisk(
    { store, platform }: Awaited<ReturnType<typeof renderWith>>,
    path: string,
  ) {
    await act(async () => {
      await store.getState().openPath(path);
    });
    const before = screen.getByText(new RegExp(`^${path} view`)).textContent;
    await act(async () => {
      await platform.externalWrite(path, 'changed');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return { before, after: screen.getByText(new RegExp(`^${path} view`)).textContent };
  }

  it('start afresh when their file changes, unless they watch it themselves', async () => {
    const app = await renderWith([
      [
        'viewers',
        [],
        {
          activate: (ctx) => {
            ctx.files.register({
              id: 'viewers.plain',
              extensions: ['.one'],
              name: 'One',
              render: ({ path }) => createElement(Probe, { path }),
            });
            ctx.files.register({
              id: 'viewers.editor',
              extensions: ['.two'],
              name: 'Two',
              watchesFile: true,
              render: ({ path }) => createElement(Probe, { path }),
            });
          },
        },
      ],
    ]);
    await act(() => app.store.getState().setModuleEnabled('viewers', true));
    await app.platform.writeTextAtomic('a.one', 'x');
    await app.platform.writeTextAtomic('b.two', 'x');

    const plain = await changeOnDisk(app, 'a.one');
    expect(plain.after).not.toBe(plain.before);
    const editor = await changeOnDisk(app, 'b.two');
    expect(editor.after).toBe(editor.before);
  });
});
