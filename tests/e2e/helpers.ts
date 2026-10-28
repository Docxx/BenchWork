import { expect, type Locator, type Page } from '@playwright/test';

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

/** Opens the side panel's Linked from tab, and returns what it shows. */
export async function linkedFrom(page: Page): Promise<Locator> {
  const panel = page.getByRole('complementary', { name: 'Side panel' });
  await panel.getByRole('tab', { name: 'Linked from' }).click();
  return panel.getByRole('tabpanel');
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
