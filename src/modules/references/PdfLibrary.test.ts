// @vitest-environment node
import { MemoryAdapter } from '@core/platform/memory';
import { createModuleContext } from '@core/modules/context';
import { createContributions } from '@core/modules/contributions';
import { manifest } from '@core/modules/testModules';
import { paperPaths, parsePdfLibrary } from './PdfLibrary';
it('reads only the chosen papers folder and respects the subfolder option', async () => {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        'Papers/Paper.pdf': 'pdf',
        'Papers/Sub/Another.PDF': 'pdf',
        'Papers/Notes.txt': 'notes',
        'Admin/Invoice.pdf': 'not a paper',
        'Papers/.hidden/Secret.pdf': 'hidden',
      },
    },
  });
  await platform.setVaultRoot('C:/Vault');
  const { ctx } = createModuleContext(manifest('references'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  expect(await paperPaths(ctx, 'Papers', false)).toEqual(['Papers/Paper.pdf']);
  expect(await paperPaths(ctx, 'Papers', true)).toEqual([
    'Papers/Paper.pdf',
    'Papers/Sub/Another.PDF',
  ]);
  expect(parsePdfLibrary({ folder: 'Papers', recursive: false })).toEqual({
    folder: 'Papers',
    recursive: false,
  });
  expect(parsePdfLibrary(null).folder).toBeNull();
});
