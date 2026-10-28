import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { AppState, AppStore } from '../state/appStore';

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useApp<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useApp must be used inside AppStoreProvider');
  return useStore(store, selector);
}

/** The store itself, for reading state in event handlers without re-rendering. */
export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside AppStoreProvider');
  return store;
}
