import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryAdapter } from '../platform/memory';
import type { WindowFrame } from '../platform';
import { createAppStore } from '../state/appStore';
import { VAULT_CONFIG_PATH } from '../vault/vaultConfig';
import { App } from './App';
import { AppStoreProvider } from './AppStoreContext';

function fakeFrame() {
  const calls: string[] = [];
  let maximised = false;
  let resized: (() => void) | null = null;
  const frame: WindowFrame = {
    minimise: () => {
      calls.push('minimise');
      return Promise.resolve();
    },
    toggleMaximise: () => {
      calls.push('maximise');
      maximised = !maximised;
      resized?.();
      return Promise.resolve();
    },
    close: () => {
      calls.push('close');
      return Promise.resolve();
    },
    isMaximised: () => Promise.resolve(maximised),
    startDragging: () => {
      calls.push('drag');
      return Promise.resolve();
    },
    onResized: (listener) => {
      resized = listener;
      return () => {
        resized = null;
      };
    },
  };
  return { frame, calls };
}

async function renderApp(frame: WindowFrame | null) {
  const platform = new MemoryAdapter({
    folders: { 'C:/Vault': { [VAULT_CONFIG_PATH]: '{"version":1}' } },
  });
  platform.windowFrame = frame;
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().start();
    await store.getState().chooseFolder('open');
  });
  const view = render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return view;
}

describe('the window buttons', () => {
  it('minimise, maximise and restore, and close the window', async () => {
    const { frame, calls } = fakeFrame();
    const { container } = await renderApp(frame);
    expect(container.querySelector('.shell')?.classList.contains('framed')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Minimise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximise' }));
    await act(() => Promise.resolve());
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(calls).toEqual(['minimise', 'maximise', 'close']);

    // Pressing on the top of the sidebar moves the window; on its text too;
    // pressing twice maximises it; a button there works as a button.
    calls.length = 0;
    const header = container.querySelector('.sidebar-header');
    if (!header) throw new Error('No sidebar header');
    fireEvent.mouseDown(header, { button: 0, detail: 1 });
    fireEvent.mouseDown(header.querySelector('.brand-name') ?? header, { button: 0, detail: 1 });
    fireEvent.mouseDown(header, { button: 0, detail: 2 });
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Hide the sidebar' }), {
      button: 0,
      detail: 1,
    });
    expect(calls).toEqual(['drag', 'drag', 'maximise']);
  });

  it('are left to the system where it draws the window, as on the tablet', async () => {
    await renderApp(null);
    expect(screen.queryByRole('group', { name: 'Window' })).toBeNull();
  });
});
