import type { VaultItem } from '../api';
import { linkTargetFor, resolveLink, suffixKeys } from '../links/resolve';
import type { AppBridge } from '../modules/context';
import { pageProperties, parsePage, serialisePage, updateProperties } from '../pages/frontmatter';
import type { PageRef, PlatformAdapter } from '../platform';
import type { AppStore } from './appStore';

function item(ref: PageRef): VaultItem {
  return { path: ref.path, title: ref.title, type: ref.type, changed: ref.mtime ?? null };
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
    inkHooks: () => ({
      settings: () => state().pen,
      onPen: () => {
        state().notePen();
      },
      dark: () => document.documentElement.style.colorScheme === 'dark',
      filters: () => state().strokeFilters,
      tool: (id) => state().inkTools.find((t) => t.id === id) ?? null,
    }),
    vaultRoot: () => {
      const status = state().status;
      return status.kind === 'open' ? status.vault.root : null;
    },
    open: (path, options) => state().openPath(path, options?.heading),
    createFolder: (folder, title) =>
      folder === '' ? state().createNotebook(title) : state().createSection(folder, title),
    createPage: (folder, title, type, content) =>
      type === undefined
        ? state().createPage(folder, title, content)
        : state().createTypedPage(folder, type, title, content),
    openPage: () => state().page?.path ?? null,
    insertText: (text) => {
      const editor = state().pageEditor?.editor;
      if (!editor || editor.isDestroyed || !editor.isEditable) return false;
      return editor.chain().focus().insertContent({ type: 'text', text }).run();
    },
    openView: (id, param) => state().openModuleView(id, param ?? null),
    pageProperties: async (path) => {
      const page = parsePage(await platform.readText(path));
      return page.error === null ? pageProperties(page) : null;
    },
    setPageProperties: async (path, changes) => {
      // The open page changes through the editor's session, so nothing is lost.
      if (state().page?.path === path) {
        state().setPageProperties(changes);
        await state().savePageNow();
        return;
      }
      const page = parsePage(await platform.readText(path));
      await platform.writeTextAtomic(path, serialisePage(updateProperties(page, changes)));
    },
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
