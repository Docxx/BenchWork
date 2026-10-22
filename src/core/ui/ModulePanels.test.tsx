import { act, render, screen } from '@testing-library/react';
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
  return { store, registry };
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
    expect(screen.getByRole('region', { name: 'Quick notes' }).textContent).toContain('Panel body');

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
    expect(screen.getByRole('region', { name: 'Bad panel' }).textContent).toContain(
      'This panel could not be shown.',
    );
    expect(screen.getByRole('tree', { name: 'Notebooks' })).toBeDefined();
  });
});
