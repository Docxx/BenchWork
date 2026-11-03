// @vitest-environment node
import { MemoryAdapter } from '@core/platform/memory';
import { createModuleContext } from '@core/modules/context';
import { createContributions } from '@core/modules/contributions';
import { manifest } from '@core/modules/testModules';
import { CloudSession, copyFile, parseConnections, relativeStoragePath } from './storage';
import type { VerifiedCopy } from '@core/api';

async function setup() {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': {}, 'C:/OneDrive': {} } });
  platform.addExternalFile('C:/Raw/image.tif', 'large image data');
  await platform.setVaultRoot('C:/Vault');
  const { ctx } = createModuleContext(manifest('cloud'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  return { ctx, platform };
}
const connection = {
  id: 'one',
  name: 'University',
  provider: 'OneDrive' as const,
  folder: 'C:/OneDrive',
};
it('keeps complete relative names for drive roots and Windows provider folders', () => {
  const base = { source: '', size: 1, sha256: 'a'.repeat(64) };
  expect(
    relativeStoragePath({ ...base, folder: 'G:\\', target: 'G:\\BenchWork-one\\image.tif' }),
  ).toBe('BenchWork-one/image.tif');
  expect(
    relativeStoragePath({
      ...base,
      folder: 'C:\\OneDrive',
      target: 'C:\\OneDrive\\BenchWork-two\\image.tif',
    }),
  ).toBe('BenchWork-two/image.tif');
  expect(() =>
    relativeStoragePath({ ...base, folder: 'C:/Cloud', target: 'C:/Elsewhere/file' }),
  ).toThrow('outside');
});
it('cancels and settles a transfer before allowing the vault to close', async () => {
  const { ctx, platform } = await setup();
  let rejectCopy: ((reason: Error) => void) | null = null;
  vi.spyOn(platform.fileTransfers, 'copy').mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectCopy = reject;
      }),
  );
  vi.spyOn(platform.fileTransfers, 'cancel').mockImplementation(() => {
    rejectCopy?.(new Error('Copy cancelled'));
    return Promise.resolve();
  });
  const session = new CloudSession(ctx);
  const pending = session
    .perform((id) => copyFile(ctx, connection, 'C:/Raw/image.tif', '', id), true)
    .catch((err: unknown) => err);
  await vi.waitFor(() => {
    expect(rejectCopy).not.toBeNull();
  });
  await session.close();
  expect(await pending).toBeInstanceOf(Error);
  const records = await ctx.vault.listDir('Research/Cloud');
  expect(
    (await ctx.vault.readRecord(`Research/Cloud/${records[0]?.name ?? ''}`)).data['status'],
  ).toBe('cancelled');
  expect((await ctx.vault.fileInfo('C:/Raw/image.tif', true)).size).toBeGreaterThan(0);
});
it('records a verified local copy, keeps the source and never claims cloud upload completed', async () => {
  const { ctx } = await setup();
  const path = await copyFile(
    ctx,
    connection,
    'C:/Raw/image.tif',
    'Data/day7.dataset.yaml',
    'transfer-1',
  );
  expect((await ctx.vault.readRecord(path)).data).toMatchObject({
    status: 'verified',
    provider: 'OneDrive',
    cloudSync: 'unconfirmed',
    sourceRemoved: false,
    dataset: '[[Data/day7.dataset.yaml]]',
  });
  expect(await ctx.vault.hashFile('C:/Raw/image.tif', true)).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (await ctx.deviceStorage.read<Record<string, VerifiedCopy>>('receipts'))?.[path]?.target,
  ).toContain('C:/OneDrive/BenchWork-transfer-1/');
});
it('keeps a source when the destination is damaged or the source has changed', async () => {
  const { ctx, platform } = await setup();
  const copy = await platform.fileTransfers.copy('transfer-2', 'C:/Raw/image.tif', 'C:/OneDrive');
  platform.addExternalFile(copy.target, 'damaged');
  await expect(platform.fileTransfers.recycleSource(copy)).rejects.toThrow('changed');
  expect((await ctx.vault.fileInfo(copy.source, true)).size).toBeGreaterThan(0);
});
it('captures failed transfers and prevents work after the session closes', async () => {
  const { ctx } = await setup();
  const session = new CloudSession(ctx);
  await expect(
    session.perform((id) => copyFile(ctx, connection, 'C:/missing.tif', '', id)),
  ).rejects.toThrow();
  const records = await ctx.vault.listDir('Research/Cloud');
  expect(
    (await ctx.vault.readRecord(`Research/Cloud/${records[0]?.name ?? ''}`)).data['status'],
  ).toBe('failed');
  await session.close();
  await expect(session.perform(() => Promise.resolve())).rejects.toThrow('Wait');
  expect(parseConnections([{ ...connection, provider: 'invalid' }, connection])).toEqual([
    connection,
  ]);
});
