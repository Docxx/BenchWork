import { Collaboration } from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { baseExtensions } from '../editor/extensions';
import { FileInput } from '../editor/fileInput';
import { PageLinks, pageLinksKey, type LinkMenuState } from '../editor/pageLinks';
import { SlashCommands, type SlashMenuState } from '../editor/slashCommands';
import { FRAGMENT } from '../editor/yjsDoc';
import type { OpenPage } from '../state/pageSlice';
import { useApp } from './AppStoreContext';

/** The editor for one open page, bound to the page's Yjs document. */
export function PageEditor({ page }: { page: OpenPage }) {
  const savePageNow = useApp((s) => s.savePageNow);
  const addFiles = useApp((s) => s.addFiles);
  const assetUrl = useApp((s) => s.assetUrl);
  const pageRefs = useApp((s) => s.pageRefs);
  const linkResolves = useApp((s) => s.linkResolves);
  const followLink = useApp((s) => s.followLink);
  const setSearchQuery = useApp((s) => s.setSearchQuery);
  const suggestLinks = useApp((s) => s.suggestLinks);
  const [slash, setSlash] = useState<SlashMenuState | null>(null);
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);

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
        PageLinks.configure({
          suggest: suggestLinks,
          resolves: linkResolves,
          openLink: (target) => void followLink(target),
          openTag: (tag) => {
            setSearchQuery(`#${tag}`);
          },
          onMenu: setLinkMenu,
        }),
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

  // When pages come and go, recheck which links point at a page.
  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(pageLinksKey, true));
  }, [editor, pageRefs]);

  return (
    <>
      <EditorContent editor={editor} className="page-content" />
      {slash !== null && <SlashMenu state={slash} />}
      {linkMenu !== null && <LinkMenu state={linkMenu} />}
    </>
  );
}

function LinkMenu({ state }: { state: LinkMenuState }) {
  if (state.items.length === 0) {
    return (
      <div className="slash-menu" style={position(state.rect)} role="status">
        <p className="slash-empty">Type a page name</p>
      </div>
    );
  }
  return (
    <ul
      className="slash-menu"
      role="listbox"
      aria-label="Link to page"
      style={position(state.rect)}
    >
      {state.items.map((item, i) => (
        <li
          key={item.id}
          role="option"
          aria-selected={i === state.index}
          className={i === state.index ? 'slash-item active' : 'slash-item'}
          onMouseDown={(e) => {
            e.preventDefault();
            state.choose(i);
          }}
        >
          <span>{item.label}</span>
          {item.detail !== '' && <span className="slash-detail">{item.detail}</span>}
        </li>
      ))}
    </ul>
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
