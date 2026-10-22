import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { AppStoreProvider } from './AppStoreContext';
import { Sidebar } from './Sidebar';

async function renderSidebar() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork': null,
        'LPS model/Experiments/Dose.md': 'x',
        'LPS model/Plan.md': 'p',
        'LPS model/data.csv': 'a,b',
        'LPS model/_section.yaml': 'colour: teal\n',
        Archive: null,
        attachments: null,
        'readme.md': '',
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
  });
  const status = store.getState().status;
  if (status.kind !== 'open') throw new Error('vault did not open');
  render(
    <AppStoreProvider store={store}>
      <Sidebar vault={status.vault} />
    </AppStoreProvider>,
  );
  return { platform, store };
}

const item = (name: string) => screen.getByRole('treeitem', { name });
const names = () =>
  within(screen.getByRole('tree', { name: 'Notebooks' }))
    .getAllByRole('treeitem')
    .map((el) => el.getAttribute('aria-label'));

/** Lets store actions and React updates finish. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe('NotebookTree', () => {
  it('shows notebooks and pages, without .md, other files or reserved folders', async () => {
    await renderSidebar();
    expect(names()).toEqual(['Archive', 'LPS model', 'readme']);
    expect(item('LPS model').getAttribute('aria-roledescription')).toBe('notebook');
    fireEvent.click(item('LPS model'));
    await settle();
    expect(names()).toEqual(['Archive', 'LPS model', 'Experiments', 'Plan', 'readme']);
    expect(item('Experiments').getAttribute('aria-roledescription')).toBe('section');
    expect(item('Plan').getAttribute('aria-roledescription')).toBe('page');
  });

  it('creates a notebook from the header and lets you name it at once', async () => {
    const { platform } = await renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'New notebook' }));
    await settle();
    const field = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(field, { target: { value: 'Immunofly' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(names()).toContain('Immunofly');
    expect(platform.snapshot()).toHaveProperty(['Immunofly']);
  });

  it('renames with F2, and Escape cancels', async () => {
    await renderSidebar();
    act(() => {
      item('readme').focus();
    });
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'F2' });
    let field = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'F2' });
    field = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(field, { target: { value: 'Read me first' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(names()).toContain('Read me first');
  });

  it('offers the right menu for folders and pages', async () => {
    await renderSidebar();
    fireEvent.contextMenu(item('LPS model'));
    const menu = screen.getByRole('menu', { name: 'LPS model options' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((b) => b.textContent),
    ).toEqual(
      expect.arrayContaining([
        'New page',
        'New page from template…',
        'New section',
        'Rename',
        'Move to Recycle Bin',
      ]),
    );
    expect(within(menu).getByRole('menuitem', { name: 'Colour teal' })).toBeDefined();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.contextMenu(item('readme'));
    expect(
      within(screen.getByRole('menu'))
        .getAllByRole('menuitem')
        .map((b) => b.textContent),
    ).toEqual(['Rename', 'Save as template', 'Move to Recycle Bin']);
  });

  it('adds a page from the menu and starts renaming it', async () => {
    const { platform } = await renderSidebar();
    fireEvent.contextMenu(item('Archive'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New page' }));
    await settle();
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDefined();
    expect(platform.snapshot()['Archive/Untitled page.md']).toContain('id: ');
  });

  it('colours a notebook', async () => {
    const { platform } = await renderSidebar();
    fireEvent.contextMenu(item('Archive'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colour purple' }));
    await settle();
    expect(platform.snapshot()['Archive/_section.yaml']).toBe('colour: purple\n');
  });

  it('asks before moving to the Recycle Bin', async () => {
    const { platform } = await renderSidebar();
    act(() => {
      item('LPS model').focus();
    });
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Delete' });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('“LPS model” and everything in it');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(platform.trashed()).toEqual([]);

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Move to Recycle Bin' }));
    await settle();
    expect(platform.trashed()).toEqual(['LPS model']);
    expect(names()).toEqual(['Archive', 'readme']);
  });

  it('moves a page into a notebook by dragging', async () => {
    const { platform } = await renderSidebar();
    const page = item('readme');
    const target = item('Archive');
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: 'move',
      dropEffect: 'move',
    };
    fireEvent.dragStart(page, { dataTransfer });
    // jsdom rows have no height, so clientY 0.5 is the middle of the row: "into".
    fireEvent.dragOver(target, { dataTransfer, clientY: 0.5 });
    expect(target.className).toContain('drop-into');
    fireEvent.drop(target, { dataTransfer, clientY: 0.5 });
    await settle();
    expect(platform.snapshot()['Archive/readme.md']).toBe('');
  });

  it('shows a notice when an action fails, and can dismiss it', async () => {
    const { store } = await renderSidebar();
    await act(async () => {
      await store.getState().createNotebook('Archive');
    });
    expect(screen.getByRole('alert').textContent).toContain('already a notebook');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
