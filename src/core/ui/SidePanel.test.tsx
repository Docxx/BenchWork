import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { LINKS_REFRESH_MS } from '../state/linksSlice';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';

async function openApp() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { notes: { enabled: true } },
        }),
        'Lab/Plan.md':
          '# Plan\n\nOrder food.\n\n## Methods\n\nTap down.\n\n### Analysis\n\nModel.\n',
        'Lab/Diary.md': 'Followed the [[Plan]].\n',
      },
    },
  });
  const registry = new ModuleRegistry(
    [
      fakeModule('notes', [], {
        activate: (ctx) => {
          ctx.views.registerWidget({
            id: 'notes.tasks',
            title: 'Tasks',
            starts: { side: true },
            render: (page) => createElement('p', null, `Tasks for ${page ?? 'nothing'}`),
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
  });
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  await act(async () => {
    await store.getState().openPage('Lab/Plan.md');
    await new Promise((resolve) => setTimeout(resolve, LINKS_REFRESH_MS + 50));
  });
  return { store, state: () => store.getState() };
}

describe('Side panel', () => {
  it('lists the page’s headings, and a click goes to one', async () => {
    const { state } = await openApp();
    const panel = screen.getByRole('complementary', { name: 'Side panel' });
    expect(within(panel).getByRole('tab', { name: 'Outline' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const items = within(panel)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(items).toEqual(expect.arrayContaining(['Plan', 'Methods', 'Analysis']));

    fireEvent.click(within(panel).getByRole('button', { name: 'Analysis' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const heading = screen.getByRole('heading', { name: 'Analysis' });
    expect(heading.contains(window.getSelection()?.anchorNode ?? null)).toBe(true);
    expect(state().revealHeading).toBeNull();
  });

  it('shows the pages linking here, instead of at the foot of the page', async () => {
    await openApp();
    const panel = screen.getByRole('complementary', { name: 'Side panel' });
    expect(screen.queryByRole('region', { name: 'Linked from' })).toBeNull();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Linked from' }));
    expect(within(panel).getByRole('button', { name: /Diary/ })).toBeDefined();
  });

  it('shows tabs that modules add', async () => {
    await openApp();
    const panel = screen.getByRole('complementary', { name: 'Side panel' });
    fireEvent.click(within(panel).getByRole('tab', { name: 'Tasks' }));
    expect(within(panel).getByText('Tasks for Lab/Plan.md')).toBeDefined();
  });

  it('can be hidden, and links then show at the foot of the page', async () => {
    const { state } = await openApp();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the side panel' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole('complementary', { name: 'Side panel' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Linked from' })).toBeDefined();
    expect(state().settings.appearance.sidePanel).toBe(false);
  });

  it('opens Settings at the modules from its foot', async () => {
    await openApp();
    fireEvent.click(screen.getByRole('button', { name: 'Customise modules' }));
    expect(screen.getByRole('tab', { name: 'Modules' }).getAttribute('aria-selected')).toBe('true');
  });
});
