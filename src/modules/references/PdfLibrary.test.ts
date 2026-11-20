// @vitest-environment node
import { MemoryAdapter } from '@core/platform/memory';
import { createModuleContext } from '@core/modules/context';
import { createContributions } from '@core/modules/contributions';
import { manifest } from '@core/modules/testModules';
import { paperPaths, parsePdfLibrary } from './PdfLibrary';
import { saveReferencePdf } from './ReferenceDownload';
import { parseLibrary } from './library';

it('files a reference by author, year and title, reuses its PDF and links it to evidence', async () => {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': {} } });
  await platform.setVaultRoot('C:/Vault');
  const { ctx } = createModuleContext(manifest('references'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  await ctx.storage.write('reading-library.json', { folder: 'Research/Papers', recursive: true });
  const ref = parseLibrary(
    JSON.stringify([
      {
        id: 'singh',
        title: 'Cell repair',
        author: [{ family: 'Singh' }],
        issued: { 'date-parts': [[2025]] },
      },
    ]),
  ).refs.get('singh');
  if (!ref) throw new Error('Missing reference');
  const bytes = new TextEncoder().encode('%PDF-1.7\n');
  const path = 'Research/Papers/Singh - 2025 - Cell repair.pdf';
  expect(await saveReferencePdf(ctx, ref, bytes)).toBe(path);
  expect(await saveReferencePdf(ctx, ref, bytes)).toBe(path);
  expect(await ctx.storage.read('pdf-citations.json')).toEqual({ [path]: 'singh' });
  expect(await ctx.storage.read('paper-references.json')).toEqual({
    [path]: 'Singh (2025). Cell repair.',
  });
});
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
