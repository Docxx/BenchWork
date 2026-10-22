import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createPlatform } from '@core/platform';
import { createAppStore } from '@core/state/appStore';
import { App } from '@core/ui/App';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import '@core/ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const store = createAppStore(createPlatform());
void store.getState().start();

createRoot(root).render(
  <StrictMode>
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>
  </StrictMode>,
);
