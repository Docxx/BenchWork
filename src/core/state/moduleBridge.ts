import type { VaultItem } from '../api';
import { linkTargetFor, resolveLink, suffixKeys } from '../links/resolve';
import type { AppBridge } from '../modules/context';
import type { PageRef, PlatformAdapter } from '../platform';
import type { AppStore } from './appStore';

function item(ref: PageRef): VaultItem {
  return { path: ref.path, title: ref.title, type: ref.type };
}

/** What modules reach the app through: ModuleApp in src/core/api, backed by the store. */
export function createModuleBridge(store: AppStore, platform: PlatformAdapter): AppBridge {
  const state = () => store.getState();

  /** The index's pages once it has caught up with recent changes. */
  async function pages(): Promise<PageRef[]> {
    if (state().status.kind !== 'open') return [];
    await state().indexIdle();
    return platform.index.pages();
  }

  return {
    vaultRoot: () => {
      const status = state().status;
      return status.kind === 'open' ? status.vault.root : null;
    },
    open: (path) => state().openPath(path),
    createFolder: (folder, title) =>
      folder === '' ? state().createNotebook(title) : state().createSection(folder, title),
    createPage: (folder, title, type) =>
      type === undefined
        ? state().createPage(folder, title)
        : state().createTypedPage(folder, type, title),
    askText: (options) => state().askText(options),
    notify: (message) => {
      store.setState({ sidebarNotice: message });
    },
    items: async () => (await pages()).map(item),
    linksTo: async (path) => {
      const all = await pages();
      const refs = await platform.index.backlinks(suffixKeys(path));
      const sources = new Set(
        refs
          .filter((r) => r.source !== path && resolveLink(r.target, r.source, all)?.path === path)
          .map((r) => r.source),
      );
      return all.filter((p) => sources.has(p.path)).map(item);
    },
    linkTarget: async (path) => linkTargetFor(path, await pages()),
    resolveLink: async (target, from) => resolveLink(target, from, await pages())?.path ?? null,
  };
}
