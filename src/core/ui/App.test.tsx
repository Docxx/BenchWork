import { act, render, screen } from '@testing-library/react';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';
import { vaultName } from './Shell';

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

describe('App', () => {
  it('shows the vault picker when no vault is open', async () => {
    await renderApp(new MemoryAdapter());
    expect(screen.getByRole('heading', { name: 'BenchWork' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'New vault' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open vault' })).toBeDefined();
  });

  it('creates a vault and shows its name', async () => {
    const platform = new MemoryAdapter({ folders: { 'C:/Labs/LPS model': {} } });
    platform.queuePick('C:/Labs/LPS model');
    await renderApp(platform);
    await act(async () => {
      screen.getByRole('button', { name: 'New vault' }).click();
      await Promise.resolve();
    });
    expect(await screen.findByRole('heading', { name: 'LPS model' })).toBeDefined();
  });

  it('asks before using a folder with files in it', async () => {
    const platform = new MemoryAdapter({ folders: { 'C:/Thesis': { 'a.docx': 'x' } } });
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

describe('vaultName', () => {
  it('takes the last part of Windows and other paths', () => {
    expect(vaultName('C:\\Users\\Ray\\LPS model')).toBe('LPS model');
    expect(vaultName('/home/ray/Vault/')).toBe('Vault');
    expect(vaultName('memory://Vault')).toBe('Vault');
  });
});
