// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from './appStore';

async function setup() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': '{"version":1,"attachments":{"linkThresholdMB":1}}',
        'Lab/image.png': 'original',
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, state: () => store.getState() };
}
const file = (name: string, size = 3) => ({
  name,
  size,
  type: '',
  bytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
});

describe('files in notebook folders', () => {
  it('copies into the chosen folder without an open page, preserving existing and concurrent names', async () => {
    const { platform, state } = await setup();
    expect(state().page).toBeNull();
    const [one, two] = await Promise.all([
      state().addFilesToFolder('Lab', [file('image.png')]),
      state().addFilesToFolder('Lab', [file('image.png')]),
    ]);
    expect(one).toHaveLength(1);
    expect(two).toHaveLength(1);
    expect(one[0]?.path).not.toBe(two[0]?.path);
    expect(one[0]?.path).toMatch(/^Lab\/image/);
    expect(platform.snapshot()['Lab/image.png']).toBe('original');
    expect(state().tree.expanded).toContain('Lab');
  });
  it('asks before importing large files and creates a linked record in the chosen folder', async () => {
    const { platform, state } = await setup();
    platform.addExternalFile('D:/stack.tif', 'source pixels');
    platform.queueFilePick(['D:/stack.tif']);
    const adding = state().addFilesToFolder('Lab', [file('stack.tif', 2 * 1024 * 1024)]);
    await vi.waitFor(() => {
      expect(state().attachQuestion?.name).toBe('stack.tif');
    });
    expect(platform.snapshot()['Lab/stack.tif']).toBeUndefined();
    state().answerAttach('link');
    const result = await adding;
    expect(result[0]?.path).toBe('Lab/stack.tif.link.yaml');
    expect(platform.snapshot()['Lab/stack.tif.link.yaml']).toContain('path: D:/stack.tif');
    expect((await platform.fileInfo('D:/stack.tif', true)).size).toBe(13);
  });
  it('copies picked files without moving their sources, and reports invalid destinations', async () => {
    const { platform, state } = await setup();
    platform.addExternalFile('D:/run.csv', 'a,b');
    platform.queueFilePick(['D:/run.csv']);
    expect((await state().pickFilesIntoFolder('Lab'))[0]?.path).toBe('Lab/run.csv');
    expect((await platform.fileInfo('D:/run.csv', true)).size).toBe(3);
    expect(await state().addFilesToFolder('../outside', [file('bad.csv')])).toEqual([]);
    expect(state().sidebarNotice).toContain('could not be added');
    expect(platform.snapshot()['../outside/bad.csv']).toBeUndefined();
  });
  it('opens folders explicitly and reports failures', async () => {
    const { platform, state } = await setup();
    await state().openNotebookFolder('Lab');
    expect(platform.openedFolders).toEqual(['Lab']);
    await state().openNotebookFolder('../outside');
    expect(platform.openedFolders).toEqual(['Lab']);
    expect(state().sidebarNotice).not.toBeNull();
  });
  it('cancels a pending import when its vault closes', async () => {
    const { platform, state } = await setup();
    const adding = state().addFilesToFolder('Lab', [file('large.tif', 2 * 1024 * 1024)]);
    await vi.waitFor(() => {
      expect(state().attachQuestion).not.toBeNull();
    });
    await state().closeVault();
    expect(await adding).toEqual([]);
    expect(platform.snapshot()['Lab/large.tif']).toBeUndefined();
  });
  it('finishes an in-flight write in the original vault before closing', async () => {
    const { platform, state } = await setup();
    let finish: (bytes: Uint8Array) => void = () => {
      throw new Error('Read not started');
    };
    const bytes = new Promise<Uint8Array>((resolve) => {
      finish = resolve;
    });
    let reading = false;
    const adding = state().addFilesToFolder('Lab', [
      {
        ...file('slow.png'),
        bytes: () => {
          reading = true;
          return bytes;
        },
      },
    ]);
    await vi.waitFor(() => {
      expect(reading).toBe(true);
    });
    let closed = false;
    const closing = state()
      .closeVault()
      .then(() => {
        closed = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(closed).toBe(false);
    finish(new Uint8Array([1, 2, 3]));
    await Promise.all([adding, closing]);
    expect(closed).toBe(true);
    await platform.setVaultRoot('C:/Vault');
    expect(await platform.readBytes('Lab/slow.png', 100)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
