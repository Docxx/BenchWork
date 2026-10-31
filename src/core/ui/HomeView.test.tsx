import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { VAULT_CONFIG_PATH } from '../vault/vaultConfig';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';
import { greeting } from './HomeView';

async function renderHome() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': { [VAULT_CONFIG_PATH]: '{"version":1}', 'Lab/Plan.md': '# Plan\n' },
    },
  });
  const registry = new ModuleRegistry(
    [
      fakeModule('bench', [], {
        activate: (ctx) => {
          ctx.views.registerPageView({
            id: 'bench.view',
            title: 'Bench',
            render: () => 'Bench view body',
            tool: { icon: null, hint: 'Things on the bench' },
          });
          ctx.views.registerWidget({
            id: 'bench.card',
            title: 'On the bench',
            starts: { home: true },
            render: () => 'Two gels running',
          });
        },
      }),
    ],
    [],
    { platform, device: 'desktop', contributions: createContributions() },
  );
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().start();
    await store.getState().chooseFolder('open');
    await store.getState().setModuleEnabled('bench', true);
  });
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return { store };
}

const cardNames = () =>
  within(screen.getByRole('article', { name: 'Home' }))
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent);

describe('Home', () => {
  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 9, 30, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 30, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 30, 20))).toBe('Good evening');
  });

  it('shows module cards and tools, which open from Home and the sidebar', async () => {
    const { store } = await renderHome();
    // Three to a row, in their usual order, the module's card among them.
    expect(cardNames().slice(0, 3)).toEqual(['Today', 'Tools', 'Pinned']);
    expect([...cardNames()].sort()).toEqual(
      ['Calendar', 'On the bench', 'Pinned', 'Recent pages', 'Today', 'Tools'].sort(),
    );
    expect(screen.getByText('Two gels running')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Bench.*Things on the bench/ }));
    await act(() => Promise.resolve());
    expect(screen.getByText('Bench view body')).toBeDefined();

    const sidebar = screen.getByRole('navigation', { name: 'Vault' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Home' }));
    await act(() => Promise.resolve());
    expect(store.getState().atHome()).toBe(true);
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Bench' }));
    await act(() => Promise.resolve());
    expect(store.getState().moduleView?.id).toBe('bench.view');
  });

  it('moves and hides cards, and shows them again', async () => {
    const { store } = await renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Edit home' }));
    await act(() => store.getState().setHomeLayout({}));
    // Arrow keys on a card's grip move it a cell; with Shift they resize it.
    const press = async (key: string, shiftKey = false) => {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Move On the bench' }), {
        key,
        shiftKey,
      });
      await act(() => Promise.resolve());
    };
    for (let i = 0; i < 12; i += 1) await press('ArrowUp');
    for (let i = 0; i < 8; i += 1) await press('ArrowLeft');
    await press('ArrowRight', true);
    const grid = store.getState().homeLayout().grid;
    expect(grid['bench.card']).toMatchObject({ x: 0, w: 5 });
    expect(cardNames().indexOf('On the bench')).toBeLessThan(cardNames().indexOf('Recent pages'));

    fireEvent.click(screen.getByRole('button', { name: 'Hide Tools' }));
    await act(() => Promise.resolve());
    expect(cardNames()).not.toContain('Tools');
    fireEvent.click(
      within(screen.getByLabelText('Hidden cards')).getByRole('button', { name: 'Tools' }),
    );
    await act(() => Promise.resolve());
    expect(cardNames()).toContain('Tools');
  });

  it('pins the open page to Home', async () => {
    const { store } = await renderHome();
    await act(() => store.getState().openPage('Lab/Plan.md'));
    fireEvent.click(screen.getByRole('button', { name: 'Pin to Home' }));
    await act(() => Promise.resolve());
    expect(screen.getByRole('button', { name: 'Unpin from Home' })).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Home' })[0] as HTMLElement);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    expect(within(pinned).getByRole('button', { name: /Plan/ })).toBeDefined();
  });
});
