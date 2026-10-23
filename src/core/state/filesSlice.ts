import { isPage } from '../notebooks/notebookTree';
import { baseName } from '../platform';
import type { StoreContext } from './context';
import { rebasePath } from './treeSlice';

export interface FilesSlice {
  /** A file that is not a page, open in its viewer in the main area. */
  openFile: string | null;
  /** Opens a page in the editor, or any other file in its viewer. */
  openPath: (path: string) => Promise<void>;
  closeFile: () => void;
  /** After a rename or move, keeps the open file pointing at it. */
  fileMoved: (from: string, to: string) => void;
}

export function createFilesSlice(ctx: StoreContext): FilesSlice {
  const { set, get } = ctx;

  ctx.onVault({
    closed: () => {
      set({ openFile: null });
    },
  });

  return {
    openFile: null,

    openPath: async (path) => {
      if (get().status.kind !== 'open') return;
      get().showView('files');
      if (isPage(baseName(path))) {
        set({ openFile: null });
        await get().openPage(path);
        return;
      }
      await get().closePage();
      set({ openFile: path, pageNotice: null });
      get().selectEntry(path);
    },

    closeFile: () => {
      set({ openFile: null });
    },

    fileMoved: (from, to) => {
      const open = get().openFile;
      if (open !== null) set({ openFile: rebasePath(open, from, to) });
    },
  };
}
