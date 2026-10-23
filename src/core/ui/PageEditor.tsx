import { Collaboration } from '@tiptap/extension-collaboration';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { citationsKey, type CiteMenuState } from '../editor/citationNode';
import { baseExtensions } from '../editor/extensions';
import { FileInput, insertFiles } from '../editor/fileInput';
import { blocksFromMarkdown } from '../editor/markdown/markdown';
import { PageLinks, pageLinksKey, type LinkMenuState } from '../editor/pageLinks';
import {
  FILE_ITEM,
  PROPERTY_ITEM,
  SlashCommands,
  type SlashMenuState,
} from '../editor/slashCommands';
import { FRAGMENT } from '../editor/yjsDoc';
import type { OpenPage } from '../state/pageSlice';
import { useApp } from './AppStoreContext';
import { TemplatePicker } from './TemplatePicker';

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
  const citationProvider = useApp((s) => s.citationProvider);
  const citationProviders = useApp((s) => s.citationProviders);
  const citationVersion = useApp((s) => s.citationVersion);
  const templateBodyFor = useApp((s) => s.templateBodyFor);
  const setAddingProperty = useApp((s) => s.setAddingProperty);
  const embedTable = useApp((s) => s.embedTable);
  const pickAndAddFiles = useApp((s) => s.pickAndAddFiles);
  const [slash, setSlash] = useState<SlashMenuState | null>(null);
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);
  const [citeMenu, setCiteMenu] = useState<CiteMenuState | null>(null);
  /** Where to insert a template, while choosing one. */
  const [templateAt, setTemplateAt] = useState<number | null>(null);

  const editor = useEditor(
    {
      extensions: [
        ...baseExtensions(
          {
            embed: (target) => assetUrl(target, true),
            image: (src) => assetUrl(src, false),
            table: embedTable,
          },
          { citations: citationProvider, onMenu: setCiteMenu },
        ),
        Collaboration.configure({ document: page.ydoc, field: FRAGMENT }),
        SlashCommands.configure({
          onChange: setSlash,
          onTemplate: setTemplateAt,
          onAction: (id, pos, current) => {
            if (id === PROPERTY_ITEM) setAddingProperty(true);
            if (id === FILE_ITEM) {
              void pickAndAddFiles().then((files) => {
                insertFiles(current, pos, files);
              });
            }
          },
        }),
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

  // When the reference library changes, or its module is switched on or off, redraw citations.
  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(citationsKey, true));
  }, [editor, citationProviders, citationVersion]);

  return (
    <>
      <EditorContent editor={editor} className="page-content" />
      {slash !== null && <SlashMenu state={slash} />}
      {linkMenu !== null && <LinkMenu state={linkMenu} />}
      {citeMenu !== null && (
        <LinkMenu state={citeMenu} label="Cite" empty="No matching references" wide />
      )}
      {templateAt !== null && (
        <TemplatePicker
          mode="insert"
          onClose={() => {
            setTemplateAt(null);
            editor.commands.focus();
          }}
          onChoose={(template) => {
            const at = templateAt;
            setTemplateAt(null);
            void templateBodyFor(template).then((body) => {
              if (body === null || editor.isDestroyed) return;
              // The page may have changed while the template was read.
              const pos = Math.min(at, editor.state.doc.content.size);
              editor.chain().focus().insertContentAt(pos, blocksFromMarkdown(body)).run();
            });
          }}
        />
      )}
    </>
  );
}

/** The `[[` menu of pages, and the `[@` menu of references, which look the same. */
function LinkMenu({
  state,
  label = 'Link to page',
  empty = 'Type a page name',
  wide = false,
}: {
  state: LinkMenuState | CiteMenuState;
  label?: string;
  empty?: string;
  /** Wider, for references with long titles. */
  wide?: boolean;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Keep the chosen item in view as the arrow keys move through a long list.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [state.index, state.items]);

  const className = wide ? 'slash-menu wide' : 'slash-menu';
  const width = wide ? 360 : 240;
  if (state.items.length === 0) {
    return (
      <div className={className} style={position(state.rect, width)} role="status">
        <p className="slash-empty">{empty}</p>
      </div>
    );
  }
  return (
    <ul
      ref={list}
      className={className}
      role="listbox"
      aria-label={label}
      style={position(state.rect, width)}
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

function position(rect: DOMRect | null, width = 240): { left: number; top: number } {
  if (!rect) return { left: 0, top: 0 };
  return {
    left: Math.max(0, Math.min(rect.left, window.innerWidth - width)),
    top: Math.min(rect.bottom + 4, window.innerHeight - 320),
  };
}
