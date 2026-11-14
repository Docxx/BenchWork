import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { TauriAdapter } from '@core/platform/tauri';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import '@core/ui/styles.css';
import '@core/ui/themes.css';
import './next.css';
import { NextApp } from './NextApp';
import { createNextRuntime } from './runtime';

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
const app = createRoot(root);
app.render(
  <div className="nx-loading">
    <span className="nx-mark">B</span>
    <h1>A little more possibility.</h1>
    <p>Opening BenchWork Next…</p>
  </div>,
);
void createNextRuntime().then(
  (runtime) => {
    if (isTauri()) {
      const native = new TauriAdapter();
      native.onExitRequested(async () => {
        if (!(await runtime.store.getState().closeVault())) return false;
        await runtime.platform.checkpoint();
        return true;
      });
    }
    app.render(
      <StrictMode>
        <AppStoreProvider store={runtime.store}>
          <NextApp runtime={runtime} />
        </AppStoreProvider>
      </StrictMode>,
    );
  },
  (err: unknown) => {
    app.render(
      <div className="nx-loading">
        <h1>Let’s get the studio open.</h1>
        <p>{err instanceof Error ? err.message : String(err)}</p>
        <button
          onClick={() => {
            location.reload();
          }}
        >
          Try again
        </button>
        <p>Stored data has not been reset.</p>
      </div>,
    );
  },
);
