import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { linkFile } from '../files/linkedFiles';
import { PlatformError } from '../platform';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { AppStoreProvider } from './AppStoreContext';
import { PageView } from './PageView';

async function renderFile(
  path: string,
  contents: Record<string, string | null>,
  prepare: (platform: MemoryAdapter) => void = () => undefined,
) {
  const platform = new MemoryAdapter({
    folders: { 'C:/Vault': { '.benchwork/config.json': '{"version":1}', ...contents } },
  });
  platform.addExternalFile('D:/Raw/scan.tif', 'image bytes');
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
  });
  const linked = await linkFile(platform, 'D:/Raw/scan.tif');
  prepare(platform);
  await act(async () => {
    await store.getState().openPath(path === 'linked' ? linked : path);
  });
  render(
    <AppStoreProvider store={store}>
      <PageView />
    </AppStoreProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { platform, store };
}

describe('FileView', () => {
  it('previews a CSV file as a table', async () => {
    await renderFile('Lab/day7.csv', { 'Lab/day7.csv': 'Fly,Climb\nw1118,12\nelav>tau,4\n' });
    expect(screen.getByRole('heading', { name: 'day7.csv' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'day7.csv' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Fly', 'Climb']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('shows a record no module handles as read-only values', async () => {
    await renderFile('Lab/day7.dataset.yaml', {
      'Lab/day7.dataset.yaml': 'instrument: Camera 2\nfiles: [a.csv]\n',
    });
    expect(screen.getByRole('heading', { name: 'day7' })).toBeTruthy();
    expect(screen.getByText('Dataset')).toBeTruthy();
    expect(screen.getByText('Camera 2')).toBeTruthy();
    expect(screen.getByText(/Switch on the module/)).toBeTruthy();
  });

  it('shows a linked file and checks it', async () => {
    await renderFile('linked', {});
    expect(screen.getByRole('heading', { name: 'scan.tif' })).toBeTruthy();
    expect(screen.getByText('D:/Raw/scan.tif')).toBeTruthy();
    expect(screen.getByText('11 bytes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check file' }));
    expect(await screen.findByText('The file is the same as when it was linked.')).toBeTruthy();
  });

  it('says when a file is too large to preview', async () => {
    await renderFile('Lab/big.csv', { 'Lab/big.csv': 'x' }, (platform) => {
      platform.readBytes = () => Promise.reject(new PlatformError('TooLarge', 'Too big'));
    });
    expect(screen.getByRole('alert').textContent).toBe('This file is too large to preview.');
  });
});
