import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { AppStoreProvider } from './AppStoreContext';
import { FileTree } from './FileTree';

async function renderTree() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork': null,
        'Notes/Week 1/Monday.md': '',
        'Notes/todo.md': '',
        'readme.md': '',
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  render(
    <AppStoreProvider store={store}>
      <FileTree />
    </AppStoreProvider>,
  );
  return store;
}

function item(name: string): HTMLElement {
  return screen.getByRole('treeitem', { name });
}

/** Lets pending folder loads finish and React re-render. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('FileTree', () => {
  it('shows the top level with folders first and nothing hidden', async () => {
    await renderTree();
    const names = within(screen.getByRole('tree'))
      .getAllByRole('treeitem')
      .map((el) => el.textContent);
    expect(names).toEqual(['▸Notes', 'readme.md']);
    expect(item('Notes').getAttribute('aria-expanded')).toBe('false');
    expect(item('readme.md').hasAttribute('aria-expanded')).toBe(false);
  });

  it('opens a folder on click and selects it', async () => {
    await renderTree();
    fireEvent.click(item('Notes'));
    await settle();
    expect(item('Notes').getAttribute('aria-expanded')).toBe('true');
    expect(item('Notes').getAttribute('aria-selected')).toBe('true');
    expect(item('todo.md').getAttribute('aria-level')).toBe('2');
  });

  it('selects a file on click without anything else happening', async () => {
    const store = await renderTree();
    fireEvent.click(item('readme.md'));
    expect(store.getState().tree.selected).toBe('readme.md');
  });

  it('supports arrow keys, Home, End and Enter', async () => {
    const store = await renderTree();
    const tree = screen.getByRole('tree');
    item('Notes').focus();

    fireEvent.keyDown(tree, { key: 'ArrowRight' }); // open Notes
    await settle();
    expect(item('Notes').getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(tree, { key: 'ArrowRight' }); // into first child
    expect(document.activeElement).toBe(item('Week 1'));

    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item('todo.md'));

    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(store.getState().tree.selected).toBe('Notes/todo.md');

    fireEvent.keyDown(tree, { key: 'ArrowLeft' }); // to parent
    expect(document.activeElement).toBe(item('Notes'));

    fireEvent.keyDown(tree, { key: 'ArrowLeft' }); // close Notes
    expect(item('Notes').getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(tree, { key: 'End' });
    expect(document.activeElement).toBe(item('readme.md'));
    fireEvent.keyDown(tree, { key: 'Home' });
    expect(document.activeElement).toBe(item('Notes'));
  });

  it('gives only one item a Tab stop', async () => {
    await renderTree();
    const stops = screen.getAllByRole('treeitem').filter((el) => el.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });
});
