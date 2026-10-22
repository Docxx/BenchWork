import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { AppStoreProvider } from './AppStoreContext';
import { PageView } from './PageView';

async function renderPageView() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork': null,
        'Lab/Plan.md': '# October plan\n\nOrder fly food.\n',
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
  });
  render(
    <AppStoreProvider store={store}>
      <PageView />
    </AppStoreProvider>,
  );
  return { platform, store };
}

async function settle(ms = 10): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('PageView', () => {
  it('suggests picking a page when none is open', async () => {
    await renderPageView();
    expect(screen.getByText(/Pick a page in the sidebar/)).toBeDefined();
  });

  it('shows the page title, its content and that it is saved', async () => {
    const { store } = await renderPageView();
    await act(() => store.getState().openPage('Lab/Plan.md'));
    await settle();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Page title' }).value).toBe(
      'Plan',
    );
    expect(screen.getByRole('heading', { name: 'October plan' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });

  it('renames the page from its title', async () => {
    const { platform, store } = await renderPageView();
    await act(() => store.getState().openPage('Lab/Plan.md'));
    const title = screen.getByRole('textbox', { name: 'Page title' });
    fireEvent.change(title, { target: { value: 'November plan' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    await settle();
    expect(store.getState().page?.path).toBe('Lab/November plan.md');
    expect(platform.snapshot()['Lab/November plan.md']).toBe('# October plan\n\nOrder fly food.\n');
  });

  it('asks what to do when the page changed outside while it had edits', async () => {
    const { platform, store } = await renderPageView();
    await act(() => store.getState().openPage('Lab/Plan.md'));
    act(() => {
      store.setState({ pageConflict: { diskText: 'Theirs.\n' } });
    });
    expect(screen.getByRole('alertdialog').textContent).toContain('changed outside BenchWork');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use the other version' }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(
      Object.keys(platform.snapshot()).some((p) => p.startsWith('.benchwork/snapshots/')),
    ).toBe(true);
  });
});
