import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { dayOf } from '../pages/daily';
import { parseAppSettings } from '../settings/appSettings';
import { createAppStore } from '../state/appStore';
import { VAULT_CONFIG_PATH } from '../vault/vaultConfig';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';
import { monthGrid } from './CalendarWidget';

const today = dayOf(new Date());

async function renderApp() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        [VAULT_CONFIG_PATH]: '{"version":1}',
        [`Daily/${today.slice(0, 7)}/${today}.md`]: '# Today\n',
      },
    },
  });
  const registry = new ModuleRegistry(
    [
      fakeModule('lab', [], {
        activate: (ctx) => {
          ctx.views.registerWidget({
            id: 'lab.gels',
            title: 'Gels',
            starts: { side: true },
            render: (page) => `Gels beside ${page ?? 'nothing'}`,
          });
          ctx.views.registerCalendarSource({
            id: 'lab.runs',
            title: 'Runs',
            marks: (from, to) =>
              Promise.resolve(
                today >= from && today <= to
                  ? [{ date: today, title: 'Run the big gel', colour: 'red' }]
                  : [],
              ),
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
    await store.getState().setModuleEnabled('lab', true);
  });
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  await act(() => new Promise((r) => setTimeout(r, 30)));
  return { store, platform };
}

const dock = (name: string) => screen.getByRole('region', { name });
const tabs = (name: string) =>
  within(dock(name))
    .queryAllByRole('tab')
    .map((t) => t.getAttribute('aria-label'));
const choose = async (label: string) => {
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
  await act(() => new Promise((r) => setTimeout(r, 10)));
};

describe('docks', () => {
  it('show the outline, links and module widgets beside pages, even on Home', async () => {
    await renderApp();
    expect(tabs('Right side, top')).toEqual(['Outline', 'Linked from', 'Gels']);
    expect(tabs('Under the notebooks')).toEqual([]);
    expect(screen.getByText('Open a page to see its outline.')).toBeDefined();
  });

  it('take widgets added, moved and closed, and remember it', async () => {
    const { platform } = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Add a widget under the notebooks' }));
    await choose('Calendar');
    expect(tabs('Under the notebooks')).toEqual(['Calendar']);

    fireEvent.click(within(dock('Right side, top')).getByRole('tab', { name: 'Gels' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move or close Gels' }));
    await choose('Move to right side, bottom');
    expect(tabs('Right side, top')).toEqual(['Outline', 'Linked from']);
    expect(tabs('Right side, bottom')).toEqual(['Gels']);
    expect(within(dock('Right side, bottom')).getByText('Gels beside nothing')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Move or close Gels' }));
    await choose('Close');
    expect(tabs('Right side, bottom')).toEqual([]);

    const saved = parseAppSettings(await platform.loadAppSettings()).home['C:/Vault'];
    expect(saved?.docks).toMatchObject({ left: ['core.calendar'], closed: ['lab.gels'] });
  });
});

describe('the calendar', () => {
  it('lays out whole weeks from Monday', () => {
    const days = monthGrid(2026, 9);
    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2026-09-28');
    expect(days[3]).toBe('2026-10-01');
  });

  it('marks daily pages and what modules add, and lists the chosen day', async () => {
    const { store } = await renderApp();
    const calendar = screen.getByRole('region', { name: 'Calendar' });
    const day = within(calendar).getByRole('button', { name: /, 2 marked$/ });
    expect(day.getAttribute('aria-pressed')).toBe('true');
    expect(within(calendar).getByText('Run the big gel')).toBeDefined();

    fireEvent.click(within(calendar).getByRole('button', { name: 'Open the day’s page' }));
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(store.getState().page?.path).toBe(`Daily/${today.slice(0, 7)}/${today}.md`);
  });
});
