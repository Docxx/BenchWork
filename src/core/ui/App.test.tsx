import { act, render, screen } from '@testing-library/react';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';
import { vaultName } from './Sidebar';

async function renderApp(platform: MemoryAdapter) {
  const store = createAppStore(platform);
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  await act(() => store.getState().start());
  return store;
}

/** Someone who has seen the first-run guide. */
const GUIDED = { appSettings: { guided: true } };

describe('App', () => {
  it('shows the vault picker when no vault is open', async () => {
    await renderApp(new MemoryAdapter(GUIDED));
    expect(screen.getByRole('heading', { name: 'BenchWork' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'New vault' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open vault' })).toBeDefined();
  });

  it('creates a vault and shows its name', async () => {
    const platform = new MemoryAdapter({ ...GUIDED, folders: { 'C:/Labs/LPS model': {} } });
    platform.queuePick('C:/Labs/LPS model');
    await renderApp(platform);
    await act(async () => {
      screen.getByRole('button', { name: 'New vault' }).click();
      await Promise.resolve();
    });
    expect(await screen.findByRole('heading', { name: 'LPS model' })).toBeDefined();
  });

  it('asks before using a folder with files in it', async () => {
    const platform = new MemoryAdapter({ ...GUIDED, folders: { 'C:/Thesis': { 'a.docx': 'x' } } });
    platform.queuePick('C:/Thesis');
    await renderApp(platform);
    act(() => {
      screen.getByRole('button', { name: 'Open vault' }).click();
    });
    expect(
      await screen.findByRole('dialog', { name: 'Use this folder as a vault?' }),
    ).toBeDefined();
    act(() => {
      screen.getByRole('button', { name: 'Cancel' }).click();
    });
    expect(screen.getByRole('button', { name: 'Open vault' })).toBeDefined();
  });
});

describe('first-run guide', () => {
  const next = (name = 'Next') => {
    act(() => {
      screen.getByRole('button', { name }).click();
    });
  };

  it('walks someone new from welcome to a vault, then through the rest', async () => {
    const platform = new MemoryAdapter({ folders: { 'C:/Lab': {} } });
    platform.queuePick('C:/Lab');
    const store = await renderApp(platform);
    expect(screen.getByRole('heading', { name: 'Welcome to BenchWork' })).toBeDefined();
    next('Show me');
    expect(screen.getByRole('heading', { name: 'How BenchWork works' })).toBeDefined();
    next();
    // No going on until there is a vault.
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await act(async () => {
      screen.getByRole('button', { name: /^New vault/ }).click();
      await Promise.resolve();
    });
    expect(await screen.findByText('Your vault is ready:')).toBeDefined();
    // The guide offers the packs, so the pack question waits.
    expect(screen.queryByRole('heading', { name: 'What do you do?' })).toBeNull();
    next();
    expect(screen.getByRole('heading', { name: 'Choose your tools' })).toBeDefined();
    next();
    expect(screen.getByRole('heading', { name: 'Pick a theme' })).toBeDefined();
    act(() => {
      screen.getByRole('radio', { name: 'Ocean' }).click();
    });
    expect(store.getState().settings.appearance.preset).toBe('ocean');
    next();
    expect(screen.getByRole('heading', { name: 'Finding your way round' })).toBeDefined();
    await act(async () => {
      screen.getByRole('button', { name: 'Start using BenchWork' }).click();
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog', { name: 'Finding your way round' })).toBeNull();
    expect(store.getState().choosingPack).toBe(false);
    expect(await platform.loadAppSettings()).toMatchObject({ guided: true });
  });

  it('can be skipped, and does not come back by itself', async () => {
    const platform = new MemoryAdapter();
    await renderApp(platform);
    await act(async () => {
      screen.getByRole('button', { name: 'Skip the guide' }).click();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'New vault' })).toBeDefined();
    expect(await platform.loadAppSettings()).toMatchObject({ guided: true });
  });
});

describe('vaultName', () => {
  it('takes the last part of Windows and other paths', () => {
    expect(vaultName('C:\\Users\\Ray\\LPS model')).toBe('LPS model');
    expect(vaultName('/home/ray/Vault/')).toBe('Vault');
    expect(vaultName('memory://Vault')).toBe('Vault');
  });
});
