import { expect, type Locator } from '@playwright/test';

interface EditorDom extends Element {
  editor?: {
    view: {
      posAtDOM: (node: Node, offset: number) => number;
      state: {
        selection: { from: number };
        doc: { resolve: (pos: number) => { start: () => number; end: () => number } };
      };
    };
  };
}

/**
 * Clicks into a block of the page editor (a paragraph or heading), then
 * waits until the editor has the cursor in it. The editor takes up a
 * click's position a moment after the mouse is released; keys pressed
 * sooner than that, faster than anyone types, would land where the cursor
 * was before.
 */
export async function clickInto(block: Locator): Promise<void> {
  await block.click();
  await expect
    .poll(() =>
      block.evaluate((el) => {
        const view = el.closest<EditorDom>('.ProseMirror')?.editor?.view;
        if (!view) return false;
        const inside = view.state.doc.resolve(view.posAtDOM(el, 0));
        const { from } = view.state.selection;
        return from >= inside.start() && from <= inside.end();
      }),
    )
    .toBe(true);
}
