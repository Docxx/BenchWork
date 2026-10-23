import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { FileSource, IncomingFile } from '../pages/attachments';
import { WIKI_LINK, type PMNode } from './markdown/model';

/**
 * Catches files pasted or dropped into the page, hands them to `onFiles` to
 * be copied into the vault, then embeds the ones it added where they landed:
 * images and files with a preview as `![[path]]`, others as `[[path]]` links.
 */

export interface AddedFileRef {
  path: string;
  embed: boolean;
}

export interface FileInputOptions {
  onFiles: ((files: IncomingFile[], source: FileSource) => Promise<AddedFileRef[]>) | null;
}

export function toIncoming(file: File): IncomingFile {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    bytes: async () => new Uint8Array(await file.arrayBuffer()),
  };
}

/** The nodes to insert for added files, separated by spaces. */
export function embedContent(added: readonly AddedFileRef[]): PMNode[] {
  return added.flatMap((file, i) => [
    ...(i > 0 ? [{ type: 'text', text: ' ' }] : []),
    { type: WIKI_LINK, attrs: { target: file.path, alias: null, embed: file.embed } },
  ]);
}

/** Inserts added files at `pos`, or as near as the page now allows. */
export function insertFiles(editor: Editor, pos: number, added: readonly AddedFileRef[]): void {
  if (added.length === 0 || editor.isDestroyed) return;
  // The page may have changed while the files were being copied.
  const at = Math.min(pos, editor.state.doc.content.size);
  editor.chain().focus().insertContentAt(at, embedContent(added)).run();
}

export const FileInput = Extension.create<FileInputOptions>({
  name: 'fileInput',

  addOptions() {
    return { onFiles: null };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const { onFiles } = this.options;

    const take = (list: FileList | null | undefined, pos: number, source: FileSource) => {
      const files = Array.from(list ?? []);
      if (files.length === 0 || onFiles === null) return false;
      void onFiles(files.map(toIncoming), source).then((added) => {
        insertFiles(editor, pos, added);
      });
      return true;
    };

    return [
      new Plugin({
        key: new PluginKey('fileInput'),
        props: {
          handlePaste: (view, event) => {
            const handled = take(event.clipboardData?.files, view.state.selection.from, 'paste');
            if (handled) event.preventDefault();
            return handled;
          },
          handleDrop: (view, event, _slice, moved) => {
            // Blocks dragged within the page are moved by ProseMirror itself.
            if (moved) return false;
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const handled = take(
              event.dataTransfer?.files,
              at?.pos ?? view.state.selection.from,
              'drop',
            );
            if (handled) event.preventDefault();
            return handled;
          },
        },
      }),
    ];
  },
});
