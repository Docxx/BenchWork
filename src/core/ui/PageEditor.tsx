import { Collaboration } from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { useState } from 'react';
import { baseExtensions } from '../editor/extensions';
import { FileInput } from '../editor/fileInput';
import { SlashCommands, type SlashMenuState } from '../editor/slashCommands';
import { FRAGMENT } from '../editor/yjsDoc';
import type { OpenPage } from '../state/pageSlice';
import { useApp } from './AppStoreContext';

/** The editor for one open page, bound to the page's Yjs document. */
export function PageEditor({ page }: { page: OpenPage }) {
  const savePageNow = useApp((s) => s.savePageNow);
  const addFiles = useApp((s) => s.addFiles);
  const assetUrl = useApp((s) => s.assetUrl);
  const [slash, setSlash] = useState<SlashMenuState | null>(null);

  const editor = useEditor(
    {
      extensions: [
        ...baseExtensions({
          embed: (target) => assetUrl(target, true),
          image: (src) => assetUrl(src, false),
        }),
        Collaboration.configure({ document: page.ydoc, field: FRAGMENT }),
        SlashCommands.configure({ onChange: setSlash }),
        FileInput.configure({ onFiles: addFiles }),
      ],
      editorProps: {
        attributes: { class: 'page-editor', 'aria-label': `Page: ${page.title}` },
      },
      onBlur: () => {
        void savePageNow();
      },
    },
    [page.ydoc],
  );

  return (
    <>
      <EditorContent editor={editor} className="page-content" />
      {slash !== null && <SlashMenu state={slash} />}
    </>
  );
}

function SlashMenu({ state }: { state: SlashMenuState }) {
  if (state.items.length === 0) {
    return (
      <div className="slash-menu" style={position(state.rect)} role="status">
        <p className="slash-empty">No matching blocks</p>
      </div>
    );
  }
  return (
    <ul
      className="slash-menu"
      role="listbox"
      aria-label="Insert block"
      style={position(state.rect)}
    >
      {state.items.map((item, i) => (
        <li
          key={item.id}
          role="option"
          aria-selected={i === state.index}
          className={i === state.index ? 'slash-item active' : 'slash-item'}
          // Mouse down, not click, so the editor keeps its cursor.
          onMouseDown={(e) => {
            e.preventDefault();
            state.choose(i);
          }}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function position(rect: DOMRect | null): { left: number; top: number } {
  if (!rect) return { left: 0, top: 0 };
  return {
    left: Math.min(rect.left, window.innerWidth - 240),
    top: Math.min(rect.bottom + 4, window.innerHeight - 320),
  };
}
