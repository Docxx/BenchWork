import { MemoryAdapter } from '@core/platform/memory';
import { seedWorkspace } from './model';
import { archiveOf, restoreArchive, STUDIO_ROOT, validateArchive, WORKSPACE_FILE } from './storage';

it('round-trips notes, empty folders and actual attachment bytes without text conversion', async () => {
  const original = new MemoryAdapter({
    folders: {
      [STUDIO_ROOT]: {
        [WORKSPACE_FILE]: JSON.stringify(seedWorkspace()),
        'Notebook/An idea.md': '# A thought\n\nA → B · µm',
        Empty: null,
      },
    },
  });
  await original.setVaultRoot(STUDIO_ROOT);
  await original.writeBytes('Notebook/image.tif', new Uint8Array([0, 255, 17, 0, 128, 10]));
  const archive = validateArchive(JSON.parse(JSON.stringify(archiveOf(original))) as unknown);
  const restored = new MemoryAdapter({ folders: { [STUDIO_ROOT]: {} } });
  await restored.setVaultRoot(STUDIO_ROOT);
  await restoreArchive(restored, archive);
  expect(await restored.readText('Notebook/An idea.md')).toBe('# A thought\n\nA → B · µm');
  expect(restored.bytesOf('Notebook/image.tif')).toEqual(new Uint8Array([0, 255, 17, 0, 128, 10]));
  expect(await restored.listDir('Empty')).toEqual([]);
});

it.each([
  '../outside.md',
  '/absolute.md',
  'C:/outside.md',
  'a\\outside.md',
  'a/../outside.md',
  'a//file.md',
])('refuses unsafe imported path %s', (path) => {
  expect(() =>
    validateArchive({ format: 'benchwork-next', version: 1, entries: [{ path, data: 'YQ==' }] }),
  ).toThrow('unsafe');
});
it('refuses duplicate paths, invalid bytes and exports with missing studio metadata', () => {
  expect(() =>
    validateArchive({
      format: 'benchwork-next',
      version: 1,
      entries: [
        { path: 'a.md', data: 'YQ==' },
        { path: 'A.md', data: 'Yg==' },
      ],
    }),
  ).toThrow('repeated');
  expect(() =>
    validateArchive({
      format: 'benchwork-next',
      version: 1,
      entries: [{ path: 'a.md', data: 'not base64!' }],
    }),
  ).toThrow('content');
  expect(() => validateArchive({ format: 'benchwork-next', version: 1, entries: [] })).toThrow(
    'missing',
  );
});
