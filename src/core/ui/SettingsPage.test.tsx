import { act, fireEvent, render, screen } from '@testing-library/react';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry, type BrokenModule, type ModuleSource } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { VAULT_CONFIG_PATH } from '../vault/vaultConfig';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';
import { applyTheme } from './theme';

async function renderSettings(sources: ModuleSource[] = [], broken: BrokenModule[] = []) {
  const platform = new MemoryAdapter({
    folders: { 'C:/Labs/Vault': { [VAULT_CONFIG_PATH]: '{"version":1}' } },
  });
  const registry = new ModuleRegistry(sources, broken, {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Labs/Vault');
  await act(async () => {
    await store.getState().start();
    await store.getState().chooseFolder('open');
  });
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return { platform, store };
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(() => {
  applyTheme('system');
});

describe('Settings page', () => {
  it('opens from the sidebar and closes again', async () => {
    await renderSettings();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull();
  });

  it('changes the theme on the page', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await flush();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'Match system' }));
    await flush();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('moves between tabs with the arrow keys', async () => {
    await renderSettings();
    const general = screen.getByRole('tab', { name: 'General' });
    general.focus();
    fireEvent.keyDown(general, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Vault' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(general, { key: 'ArrowLeft' });
    fireEvent.keyDown(general, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Modules' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows the vault folder and saves the link threshold', async () => {
    const { platform } = await renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Vault' }));
    expect(screen.getByText('C:/Labs/Vault')).toBeDefined();

    const input = screen.getByRole('spinbutton', { name: 'Link files larger than' });
    expect((input as HTMLInputElement).value).toBe('50');
    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.blur(input);
    await flush();
    expect(platform.snapshot()[VAULT_CONFIG_PATH]).toContain('"linkThresholdMB": 120');
  });

  it('says so when there are no modules', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Modules' }));
    expect(screen.getByText('No modules installed.')).toBeDefined();
  });

  it('switches a module with its switch', async () => {
    await renderSettings([fakeModule('hello', [])]);
    fireEvent.click(screen.getByRole('tab', { name: 'Modules' }));
    const toggle = screen.getByRole('switch', { name: /Hello/ });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    await flush();
    expect(screen.getByRole('switch', { name: /Hello/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('On')).toBeDefined();
  });

  it('asks before switching on dependencies too', async () => {
    await renderSettings([
      fakeModule('manuscript', [], { manifest: { dependsOn: ['references'] } }),
      fakeModule('references', []),
    ]);
    fireEvent.click(screen.getByRole('tab', { name: 'Modules' }));
    fireEvent.click(screen.getByRole('switch', { name: /Manuscript/ }));
    await flush();
    expect(
      screen.getByRole('alertdialog', {
        name: 'Switching on Manuscript also switches on References.',
      }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await flush();
    expect(screen.getByRole('switch', { name: /References/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('lists modules that could not load, and greys out ones for other devices', async () => {
    await renderSettings(
      [fakeModule('pen', [], { manifest: { platforms: ['tablet'] } })],
      [{ folder: 'oops', errors: ['"version" must look like 1.2.3'] }],
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Modules' }));
    expect(screen.getByRole('switch', { name: /Pen/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Not available on this device')).toBeDefined();
    expect(screen.getByText(/must look like 1\.2\.3/)).toBeDefined();
  });
});

describe('applyTheme', () => {
  it('sets light or dark, and removes the attribute for system', () => {
    const root = document.createElement('html');
    applyTheme('light', root);
    expect(root.dataset['theme']).toBe('light');
    applyTheme('system', root);
    expect(root.dataset['theme']).toBeUndefined();
  });
});
