// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createAppStore, type AppState } from './appStore';

const routes: [string, (state: AppState) => unknown][] = [
  ['Home', (s) => s.goHome()],
  ['page', (s) => s.openPath('Notes.md')],
  ['direct page', (s) => s.openPage('Notes.md')],
  ['file', (s) => s.openPath('Other.txt')],
  ['module view', (s) => s.openModuleView('example.view')],
  ['close file', (s) => s.closeFile()],
  ['Settings', (s) => s.openSettings()],
  ['conflicts', (s) => s.showView('conflicts')],
  ['close vault', (s) => s.closeVault()],
  ['rename', (s) => s.renameItem('Figure.json', 'Renamed.json')],
  ['move', (s) => s.moveItem('Figure.json', 'Folder')],
  ['recycle', (s) => s.recycleItem('Figure.json')],
];

it.each(routes)(
  'keeps an editor open when saving fails before %s, then retries',
  async (_, leave) => {
    const platform = new MemoryAdapter({
      folders: {
        'C:/Vault': {
          '.benchwork/config.json': '{"version":1}',
          'Notes.md': '# Notes\n',
          'Other.txt': 'Other',
          'Figure.json': '{}',
          Folder: null,
        },
      },
    });
    const store = createAppStore(platform);
    platform.queuePick('C:/Vault');
    await store.getState().chooseFolder('open');
    await store.getState().openPath('Figure.json');
    const save = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined);
    const hook = store.getState().registerEditorSave(save);
    await leave(store.getState());
    expect(store.getState().openFile).toBe('Figure.json');
    expect(store.getState().view).toBe('files');
    expect(store.getState().status.kind).toBe('open');
    await leave(store.getState());
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2);
    hook.dispose();
    expect(store.getState().editorSaves).toEqual([]);
    await store.getState().closeVault();
  },
);
