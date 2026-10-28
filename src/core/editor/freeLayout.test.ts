import { Editor } from '@tiptap/core';
import { Collaboration } from '@tiptap/extension-collaboration';
import { Slice } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { baseExtensions } from './extensions';
import {
  deleteAcross,
  deleteBox,
  FreeLayout,
  hasBoxes,
  moveBox,
  setLayout,
  spansBoxes,
  wrapInBox,
} from './freeLayout';
import { parseBody, serialiseBody } from './markdown/markdown';
import type { PMNode } from './markdown/model';
import { createPageYDoc, FRAGMENT, yDocToPage } from './yjsDoc';

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

function editorWith(markdown: string, layout: 'free' | 'document' = 'free') {
  const loaded = parseBody(markdown);
  const ydoc = createPageYDoc(loaded.doc);
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [
      ...baseExtensions(),
      FreeLayout,
      Collaboration.configure({ document: ydoc, field: FRAGMENT }),
    ],
  });
  setLayout(editor, layout);
  const saved = () => serialiseBody(yDocToPage(ydoc), loaded.source);
  return { editor, saved };
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

describe('free layout pages', () => {
  it('load as boxes, and save exactly as written when untouched', () => {
    const { editor, saved } = editorWith(PAGE);
    expect(editor.state.doc.childCount).toBe(3);
    expect(hasBoxes(editor.state.doc)).toBe(true);
    expect(saved()).toBe(PAGE);
  });

  it('delete across boxes box by box, leaving each in place', () => {
    const { editor, saved } = editorWith(PAGE);
    editor.commands.setTextSelection({
      from: at(editor, 'First box'),
      to: at(editor, 'Second box'),
    });
    expect(spansBoxes(editor.state)).toBe(true);
    editor.view.dispatch(deleteAcross(editor.state.tr));
    expect(saved()).toContain(
      '<!-- box x=40 y=40 w=400 -->\nFirst box\n\n<!-- box x=500 y=40 w=300 -->',
    );
    expect(saved()).toContain('Third box.');
    expect(editor.state.doc.childCount).toBe(3);
  });

  it('keep at least one box when everything is deleted', () => {
    const { editor } = editorWith(PAGE);
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
    editor.view.dispatch(deleteAcross(editor.state.tr));
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.textContent).toBe('');
  });

  it('type over a selection across boxes without joining them', () => {
    const { editor } = editorWith(PAGE);
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

  it('paste copied boxes as their text, where the cursor is', () => {
    const { editor } = editorWith(PAGE);
    const copied = editor.state.doc.slice(0, editor.state.doc.child(0).nodeSize);
    editor.commands.setTextSelection(at(editor, 'Third box.'));
    const handled = editor.view.someProp('handlePaste', (f) =>
      f(editor.view, new Event('paste') as ClipboardEvent, new Slice(copied.content, 0, 0)),
    );
    expect(handled).toBe(true);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(2).textContent).toContain('First box text.');
  });

  it('move a box, keeping reading order, the cursor, and the other boxes as written', () => {
    const { editor, saved } = editorWith(PAGE);
    editor.commands.setTextSelection(at(editor, 'Second'));
    const pos = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(moveBox(editor.state.tr, pos, { x: 500, y: 600, w: 250 }));
    expect(saved()).toBe(
      [
        '<!-- box x=40 y=40 w=400 -->',
        'First box text.',
        '',
        '<!-- box x=40 y=400 w=400 -->',
        'Third box.',
        '',
        '<!-- box x=500 y=600 w=250 -->',
        'Second box text.',
        '',
      ].join('\n'),
    );
    expect(editor.state.selection.$from.parent.textContent).toBe('Second box text.');
  });

  it('drop boxes left empty once the cursor leaves them, but keep sticky notes', () => {
    const { editor } = editorWith(PAGE);
    const { schema } = editor;
    const box = schema.nodes['box'];
    const paragraph = schema.nodes['paragraph'];
    if (!box || !paragraph) throw new Error('No box');
    const end = editor.state.doc.content.size;
    const tr = editor.state.tr
      .insert(end, box.create({ x: 10, y: 900, w: 200 }, paragraph.create()))
      .insert(
        end + 4,
        box.create({ x: 300, y: 900, w: 200, colour: 'yellow' }, paragraph.create()),
      );
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 2)));
    expect(editor.state.doc.childCount).toBe(5);
    editor.commands.setTextSelection(at(editor, 'Third'));
    expect(editor.state.doc.childCount).toBe(4);
    expect(editor.state.doc.lastChild?.attrs['colour']).toBe('yellow');
  });

  it('delete a whole box in one step, and empty the last one instead', () => {
    const { editor, saved } = editorWith(PAGE);
    const second = editor.state.doc.child(0).nodeSize;
    editor.view.dispatch(deleteBox(editor.state.tr, second));
    expect(editor.state.doc.childCount).toBe(2);
    expect(saved()).not.toContain('Second box');
    editor.view.dispatch(deleteBox(editor.state.tr, 0));
    editor.view.dispatch(deleteBox(editor.state.tr, 0));
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.textContent).toBe('');
  });

  it('make no boxes on a click in document view', () => {
    const { editor } = editorWith(PAGE, 'document');
    editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(editor.state.doc.childCount).toBe(3);
  });

  it('start a page turned into free layout as one box holding all of it', () => {
    const { editor, saved } = editorWith('# Plain\n\nSome ==text==.\n', 'document');
    expect(hasBoxes(editor.state.doc)).toBe(false);
    wrapInBox(editor);
    expect(editor.state.doc.childCount).toBe(1);
    expect(saved()).toBe('<!-- box x=40 y=40 w=640 -->\n# Plain\n\nSome ==text==.\n');
  });

  it('read and keep highlight and underline in any page', () => {
    const { editor, saved } = editorWith('A ==bright== and <u>firm</u> idea.\n', 'document');
    const marks = ((editor.getJSON() as PMNode).content?.[0]?.content ?? []).map((n) => [
      n.text,
      (n.marks ?? []).map((m) => m.type),
    ]);
    expect(marks).toEqual([
      ['A ', []],
      ['bright', ['highlight']],
      [' and ', []],
      ['firm', ['underline']],
      [' idea.', []],
    ]);
    editor.commands.setTextSelection({ from: at(editor, 'idea', false), to: at(editor, 'idea') });
    editor.commands.toggleMark('highlight');
    expect(saved()).toBe('A ==bright== and <u>firm</u> ==idea==.\n');
  });
});
