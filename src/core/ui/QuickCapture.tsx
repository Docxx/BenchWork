import { Plus } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { useApp, useAppStore } from './AppStoreContext';

/** Puts the cursor on a new empty line at the end of the page. */
function newLineAtEnd(editor: Editor): void {
  const last = editor.state.doc.lastChild;
  const lastBlock = last?.type.name === 'box' ? last.lastChild : last;
  const empty = lastBlock?.type.name === 'paragraph' && lastBlock.childCount === 0;
  const chain = editor.chain().focus('end');
  if (!empty) chain.insertContent({ type: 'paragraph' });
  chain.scrollIntoView().run();
}

/** Opens today's page with the cursor on a new line at the end. */
export function useQuickNote(): () => Promise<void> {
  const store = useAppStore();
  const openToday = useApp((s) => s.openToday);

  return async () => {
    await openToday();
    const path = store.getState().page?.path;
    // The page's editor starts just after the page opens.
    const ready = () => {
      const { pageEditor, page } = store.getState();
      return pageEditor !== null && page?.path === path ? pageEditor.editor : null;
    };
    const editor = ready();
    if (editor) {
      newLineAtEnd(editor);
      return;
    }
    const stop = store.subscribe(() => {
      const found = ready();
      if (!found) return;
      stop();
      // Once its text has filled in from the file.
      setTimeout(() => {
        if (!found.isDestroyed) newLineAtEnd(found);
      }, 50);
    });
    setTimeout(stop, 3000);
  };
}

/**
 * A button for writing something down quickly: it opens today's page with
 * the cursor on a new line at the end. Shown on touch screens, where there
 * is no keyboard shortcut to hand.
 */
export function QuickCapture() {
  const capture = useQuickNote();
  return (
    <button
      type="button"
      className="quick-capture"
      title="Quick note on today’s page"
      aria-label="Quick note on today’s page"
      onClick={() => void capture()}
    >
      <Plus size={24} strokeWidth={2} aria-hidden />
    </button>
  );
}
