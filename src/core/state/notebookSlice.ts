import {
  createFolder,
  createPage,
  freeName,
  moveItem,
  NameError,
  recycleItem,
  renameItem,
  setColour,
} from '../notebooks/notebookService';
import { folderNodes, PAGE_EXTENSION, pageTitle } from '../notebooks/notebookTree';
import { typedPageText } from '../pages/pageTypes';
import { parentVaultPath, PlatformError } from '../platform';
import type { StoreContext } from './context';
import type { RelinkPlan } from './linksSlice';
import { rebasePath } from './treeSlice';

export interface NotebookSlice {
  /** Why the last sidebar action could not be done, shown above the tree. */
  sidebarNotice: string | null;
  dismissSidebarNotice: () => void;
  /** The item whose name is being edited in the sidebar. */
  renaming: string | null;
  setRenaming: (path: string | null) => void;

  /**
   * Each resolves to the new item's path, or null if it could not be done.
   * With no title, new folders are "New notebook" or "New section", numbered.
   */
  createNotebook: (title?: string) => Promise<string | null>;
  createSection: (parent: string, title?: string) => Promise<string | null>;
  /** With no title, the page is called "Untitled page" (or "Untitled page 2", and so on). */
  createPage: (folder: string, title?: string) => Promise<string | null>;
  /**
   * Creates a page of a type a module registered, such as an experiment,
   * and opens it. With no title it is "Untitled experiment", numbered.
   */
  createTypedPage: (folder: string, type: string, title?: string) => Promise<string | null>;
  renameItem: (path: string, title: string) => Promise<string | null>;
  /** Moves into `folder`; with `index`, also places it there in the folder's order. */
  moveItem: (path: string, folder: string, index?: number) => Promise<string | null>;
  setFolderColour: (folder: string, colour: string | null) => Promise<void>;
  /** Moves to the Recycle Bin. Resolves to false if it could not be done. */
  recycleItem: (path: string) => Promise<boolean>;
}

function messageFor(err: unknown): string {
  if (err instanceof NameError) return err.message;
  const e = PlatformError.from(err);
  switch (e.kind) {
    case 'AlreadyExists':
      return 'Something with that name is already there.';
    case 'NotFound':
      return 'That item is no longer there. It may have been moved or deleted outside BenchWork.';
    default:
      return `That could not be done. ${e.message}`;
  }
}

export function createNotebookSlice(ctx: StoreContext): NotebookSlice {
  const { platform, set, get } = ctx;

  /** Runs a sidebar action, turning failures into a notice. */
  async function attempt<T>(action: () => Promise<T>): Promise<T | null> {
    if (get().status.kind !== 'open') return null;
    set({ sidebarNotice: null });
    try {
      return await action();
    } catch (err) {
      set({ sidebarNotice: messageFor(err) });
      return null;
    }
  }

  /** Shows a new or moved item: opens the folders above it and selects it. */
  async function reveal(path: string): Promise<void> {
    const parent = parentVaultPath(path) ?? '';
    await get().reloadFolders([parent]);
    await get().revealFolder(parent);
    get().selectEntry(path);
  }

  /** Keeps open folders and the selection pointing at a renamed or moved item. */
  async function followMove(from: string, to: string): Promise<void> {
    get().pageMoved(from, to);
    get().fileMoved(from, to);
    const { tree } = get();
    const expanded = tree.expanded.map((p) => rebasePath(p, from, to));
    const folders = Object.fromEntries(
      Object.entries(tree.folders).filter(([p]) => p !== from && !p.startsWith(`${from}/`)),
    );
    const selected = tree.selected === null ? null : rebasePath(tree.selected, from, to);
    set({ tree: { folders, expanded, selected } });
    await get().reloadFolders([parentVaultPath(from) ?? '', parentVaultPath(to) ?? '']);
    for (const p of expanded.filter((e) => e === to || e.startsWith(`${to}/`))) {
      await get().revealFolder(p);
    }
  }

  /**
   * Before a rename or move: saves the open page, so its latest text is
   * what gets updated, and notes the links pointing into `path`.
   */
  async function beforeMove(path: string): Promise<RelinkPlan | null> {
    await get().savePageNow();
    return get().planRelink(path);
  }

  /** After a rename or move: updates links to it in other pages, and says so. */
  async function afterMove(plan: RelinkPlan | null, to: string): Promise<void> {
    if (plan === null) return;
    const pages = await get().applyRelink(plan, to);
    if (pages > 0) {
      set({
        sidebarNotice: `Updated links in ${String(pages)} ${pages === 1 ? 'page' : 'pages'}.`,
      });
    }
  }

  ctx.onVault({
    closed: () => {
      set({ sidebarNotice: null, renaming: null });
    },
  });

  return {
    sidebarNotice: null,
    dismissSidebarNotice: () => {
      set({ sidebarNotice: null });
    },
    renaming: null,
    setRenaming: (renaming) => {
      set({ renaming });
    },

    createNotebook: (title) =>
      attempt(async () => {
        const path = await createFolder(platform, '', title);
        await reveal(path);
        return path;
      }),

    createSection: (parent, title) =>
      attempt(async () => {
        const path = await createFolder(platform, parent, title);
        await reveal(path);
        return path;
      }),

    createPage: (folder, title) =>
      attempt(async () => {
        const path = await createPage(platform, folder, title === undefined ? {} : { title });
        await reveal(path);
        await get().openPage(path);
        return path;
      }),

    createTypedPage: (folder, type, title) =>
      attempt(async () => {
        const spec = get().pageTypes.find((t) => t.type === type);
        if (!spec) {
          throw new NameError(
            'That kind of page is not available. Its module may be switched off.',
          );
        }
        const name =
          title ??
          pageTitle(
            await freeName(platform, folder, `Untitled ${spec.name.toLowerCase()}`, PAGE_EXTENSION),
          );
        const content = (await spec.create?.({ folder, title: name, now: new Date() })) ?? {};
        const path = await createPage(platform, folder, {
          title: name,
          text: (id, created) => typedPageText(type, content, id, created),
        });
        await reveal(path);
        await get().openPage(path);
        return path;
      }),

    renameItem: (path, title) =>
      attempt(async () => {
        const relink = await beforeMove(path);
        const target = await renameItem(platform, path, title);
        if (target !== path) {
          await followMove(path, target);
          await afterMove(relink, target);
        }
        return target;
      }),

    moveItem: (path, folder, index) =>
      attempt(async () => {
        await get().revealFolder(folder);
        const siblings = (folderNodes(get().tree, folder, 0, get().settings) ?? []).map(
          (n) => n.name,
        );
        const placement = index === undefined ? undefined : { index, siblings };
        const relink = await beforeMove(path);
        const target = await moveItem(platform, path, folder, placement);
        if (target !== path) {
          await followMove(path, target);
          await afterMove(relink, target);
        } else {
          await get().reloadFolders([folder]);
        }
        get().selectEntry(target);
        return target;
      }),

    setFolderColour: async (folder, colour) => {
      await attempt(async () => {
        await setColour(platform, folder, colour);
        await get().reloadFolders([folder, parentVaultPath(folder) ?? '']);
      });
    },

    recycleItem: async (path) => {
      const done = await attempt(async () => {
        // Save and close the open page first if it is going, so its latest text is recycled.
        const open = get().page?.path;
        if (open !== undefined && (open === path || open.startsWith(`${path}/`))) {
          await get().closePage();
        }
        const file = get().openFile;
        if (file !== null && (file === path || file.startsWith(`${path}/`))) get().closeFile();
        await recycleItem(platform, path);
        const { tree } = get();
        const gone = (p: string) => p === path || p.startsWith(`${path}/`);
        set({
          tree: {
            ...tree,
            expanded: tree.expanded.filter((p) => !gone(p)),
            selected: tree.selected !== null && gone(tree.selected) ? null : tree.selected,
          },
        });
        await get().reloadFolders([parentVaultPath(path) ?? '']);
        return true;
      });
      return done === true;
    },
  };
}
