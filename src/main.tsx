import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createContributions } from '@core/modules/contributions';
import { findBuiltInModules } from '@core/modules/loader';
import { ModuleRegistry } from '@core/modules/registry';
import { createPlatform } from '@core/platform';
import { createAppStore } from '@core/state/appStore';
import { App } from '@core/ui/App';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
// Bundled, so the app looks the same offline.
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import '@core/ui/styles.css';
import '@core/ui/themes.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const platform = createPlatform();
const { sources, broken } = findBuiltInModules();
const registry = new ModuleRegistry(sources, broken, {
  platform,
  device: platform.kind,
  contributions: createContributions(),
});
const store = createAppStore(platform, registry);
void store.getState().start();
// Closing the app saves the open page and lets modules finish first.
platform.onExitRequested(() => store.getState().closeVault());

createRoot(root).render(
  <StrictMode>
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>
  </StrictMode>,
);
