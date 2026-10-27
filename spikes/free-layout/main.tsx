import { getSchema } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import type { PMNode } from '../../src/core/editor/markdown/model';
import { freeExtensions } from './box';
import { documentToFree, freeFromMarkdown, freeToDocument, freeToMarkdown } from './storage';
import './spike.css';

/**
 * Free layout spike: can one page editor give OneNote-style pages, with
 * text anywhere? Not part of the app. Open /spikes/free-layout/ on the dev
 * server; see RESULTS.md for what to try.
 */

const SAMPLE = [
  '<!-- box x=40 y=40 w=440 -->',
  '## Meeting with Sam',
  '',
  '- Pilot ran on **Tuesday**: 20 flies',
  '- Climbing slower after LPS, day 7',
  '- Next: repeat with the mutant line',
  '',
  '<!-- box x=540 y=40 w=280 -->',
  'Remember to order fly food before Friday.',
  '',
  '<!-- box x=60 y=300 w=520 -->',
  '### Analysis ideas',
  '',
  '1. Mixed model with day as a factor',
  '2. Plot each genotype separately',
  '',
  '| Genotype | Mean cm |',
  '| --- | --- |',
  '| w1118 | 12 |',
  '| mutant | 7 |',
  '',
].join('\n');

const CHECKS = [
  'Click empty space and type: a box appears there',
  'Drag a box by its top bar; drag its right edge to resize',
  'Select text across two boxes, cut, click empty space, paste',
  'Copy a whole box (select all in it), paste into empty space',
  'Drag selected text out of a box onto empty space',
  'Click into an empty box, then click elsewhere: it goes away',
  'Ctrl+Z after moving, typing and pasting',
  'Arrow keys at the end of a box: the next box in reading order',
  'Switch to Document and back: no text is lost',
  'Edit the Markdown, then Load it: the page matches',
];

type Layout = 'free' | 'document';

function Spike() {
  // Filled before the editor starts, as pages are, since the Yjs document is what it shows.
  const ydoc = useMemo(() => {
    const doc = new Y.Doc();
    const schema = getSchema(freeExtensions(doc));
    prosemirrorJSONToYXmlFragment(schema, freeFromMarkdown(SAMPLE), doc.getXmlFragment('default'));
    return doc;
  }, []);
  const [layout, setLayout] = useState<Layout>('free');
  const [markdown, setMarkdown] = useState(SAMPLE);
  const [edited, setEdited] = useState<string | null>(null);

  const editor = useEditor({
    extensions: freeExtensions(ydoc),
    editorProps: { attributes: { class: 'free-page', 'aria-label': 'Free page' } },
    onUpdate: ({ editor: e }) => {
      setMarkdown(freeToMarkdown(e.getJSON() as PMNode));
    },
  });

  const switchTo = (next: Layout) => {
    if (next === layout) return;
    const json = editor.getJSON() as PMNode;
    const blocks = freeToDocument(json);
    // Document: everything in one full-width box, in reading order. Free: that box placed on the page.
    const doc =
      next === 'document'
        ? { type: 'doc', content: [{ type: 'box', attrs: { x: 0, y: 0, w: 0 }, content: blocks }] }
        : documentToFree(blocks);
    editor.commands.setContent(doc);
    setLayout(next);
  };

  return (
    <div className="spike">
      <header className="spike-bar">
        <strong>Free layout spike</strong>
        <div className="layout-switch" role="radiogroup" aria-label="Layout">
          {(['free', 'document'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              onClick={() => {
                switchTo(l);
              }}
            >
              {l === 'free' ? 'Free (OneNote)' : 'Document (Obsidian)'}
            </button>
          ))}
        </div>
      </header>
      <main className={`spike-page ${layout}`}>
        <EditorContent editor={editor} />
      </main>
      <aside className="spike-side">
        <h2>Try</h2>
        <ol>
          {CHECKS.map((c) => (
            <li key={c}>
              <label>
                <input type="checkbox" /> {c}
              </label>
            </li>
          ))}
        </ol>
        <h2>Saved as Markdown</h2>
        <textarea
          aria-label="Markdown"
          spellCheck={false}
          value={edited ?? markdown}
          onChange={(e) => {
            setEdited(e.target.value);
          }}
        />
        <button
          type="button"
          disabled={edited === null}
          onClick={() => {
            if (edited === null) return;
            editor.commands.setContent(freeFromMarkdown(edited));
            setEdited(null);
            setLayout('free');
          }}
        >
          Load this Markdown
        </button>
      </aside>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Spike />
    </StrictMode>,
  );
}
