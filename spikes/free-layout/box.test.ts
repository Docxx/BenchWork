import { Editor, getSchema } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import type { PMNode } from '../../src/core/editor/markdown/model';
import { deleteAcross, freeExtensions, moveBox, spansBoxes } from './box';
import { freeFromMarkdown, freeToMarkdown } from './storage';

const PAGE = [
  '<!-- box x=40 y=40 w=400 -->',
  'First box text.',
  '',
  '<!-- box x=500 y=40 w=300 -->',
  'Second box text.',
  '',
  '<!-- box x=40 y=400 w=400 -->',
  'Third box.',
  '',
].join('\n');

function editorWith(markdown: string): Editor {
  const ydoc = new Y.Doc();
  const schema = getSchema(freeExtensions(ydoc));
  prosemirrorJSONToYXmlFragment(schema, freeFromMarkdown(markdown), ydoc.getXmlFragment('default'));
  return new Editor({ element: document.createElement('div'), extensions: freeExtensions(ydoc) });
}

/** Document position just after `text` (or at its start). */
function at(editor: Editor, text: string, after = true): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1 || !node.isText) return;
    const i = node.text?.indexOf(text) ?? -1;
    if (i >= 0) found = pos + i + (after ? text.length : 0);
  });
  return found;
}

const markdown = (editor: Editor) => freeToMarkdown(editor.getJSON() as PMNode);

describe('free layout boxes', () => {
  it('deletes across boxes box by box, leaving each in place', () => {
    const editor = editorWith(PAGE);
    editor.commands.setTextSelection({
      from: at(editor, 'First box'),
      to: at(editor, 'Second box'),
    });
    expect(spansBoxes(editor.state)).toBe(true);
    editor.view.dispatch(deleteAcross(editor.state.tr));
    expect(markdown(editor)).toBe(
      [
        '<!-- box x=40 y=40 w=400 -->',
        'First box',
        '',
        '<!-- box x=500 y=40 w=300 -->',
        '&#x20;text.',
        '',
        '<!-- box x=40 y=400 w=400 -->',
        'Third box.',
        '',
      ].join('\n'),
    );
  });

  it('removes boxes wholly inside the selection', () => {
    const editor = editorWith(PAGE);
    editor.commands.setTextSelection({
      from: at(editor, 'First box'),
      to: at(editor, 'Third', false),
    });
    editor.view.dispatch(deleteAcross(editor.state.tr));
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.getText()).toContain('First box');
    expect(editor.getText()).toContain('Third box.');
  });

  it('types over a selection across boxes without joining them', () => {
    const editor = editorWith(PAGE);
    editor.commands.setTextSelection({
      from: at(editor, 'First box'),
      to: at(editor, 'Second box'),
    });
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (f) =>
      f(editor.view, from, to, '!', () => editor.state.tr),
    );
    expect(handled).toBe(true);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0).textContent).toBe('First box!');
  });

  it('pastes copied boxes as their text, where the cursor is', () => {
    const editor = editorWith(PAGE);
    const copied = editor.state.doc.slice(0, editor.state.doc.child(0).nodeSize);
    editor.commands.setTextSelection(at(editor, 'Third box.'));
    const handled = editor.view.someProp('handlePaste', (f) =>
      f(editor.view, new Event('paste') as ClipboardEvent, new Slice(copied.content, 0, 0)),
    );
    expect(handled).toBe(true);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(2).textContent).toContain('First box text.');
  });

  it('moves a box, keeping reading order and the cursor', () => {
    const editor = editorWith(PAGE);
    editor.commands.setTextSelection(at(editor, 'Second'));
    editor.view.dispatch(
      moveBox(editor.state.tr, editor.state.doc.child(0).nodeSize, { x: 500, y: 600, w: 250 }),
    );
    expect(
      markdown(editor)
        .split('\n')
        .filter((l) => l.startsWith('<!--')),
    ).toEqual([
      '<!-- box x=40 y=40 w=400 -->',
      '<!-- box x=40 y=400 w=400 -->',
      '<!-- box x=500 y=600 w=250 -->',
    ]);
    expect(editor.state.selection.$from.parent.textContent).toBe('Second box text.');
  });

  it('drops boxes left empty once the cursor leaves them', () => {
    const editor = editorWith(PAGE);
    const box = editor.schema.nodes['box'];
    const paragraph = editor.schema.nodes['paragraph'];
    if (!box || !paragraph) throw new Error('No box');
    const end = editor.state.doc.content.size;
    const tr = editor.state.tr.insert(
      end,
      box.create({ x: 10, y: 900, w: 200 }, paragraph.create()),
    );
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 2)));
    expect(editor.state.doc.childCount).toBe(4);
    editor.commands.setTextSelection(at(editor, 'Third'));
    expect(editor.state.doc.childCount).toBe(3);
  });
});
