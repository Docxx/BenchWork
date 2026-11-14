import { FigureSave } from './figureSave';

it('keeps failed edits dirty, rejects incoming changes and retries the same text', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockResolvedValue(undefined);
  const save = new FigureSave(write);
  expect(save.accept('original')).toBe(true);
  save.edit('changed');
  await expect(save.flush()).rejects.toThrow('Disk full');
  expect(save.dirty).toBe(true);
  expect(save.accept('remote')).toBe(false);
  await save.flush();
  expect(write.mock.calls).toEqual([['changed'], ['changed']]);
  expect(save.dirty).toBe(false);
  await save.flush();
  expect(write).toHaveBeenCalledTimes(2);
  expect(save.accept('remote')).toBe(true);
});

it('finishes a write before saving newer edits, including an undo to the original', async () => {
  let finish!: () => void;
  const write = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    )
    .mockResolvedValue(undefined);
  const save = new FigureSave(write);
  save.accept('original');
  save.edit('first edit');
  const saving = save.flush();
  save.edit('second edit');
  save.edit('original');
  const leaving = save.flush();
  expect(write).toHaveBeenCalledTimes(1);
  expect(save.accept('remote')).toBe(false);
  finish();
  await Promise.all([saving, leaving]);
  expect(write.mock.calls).toEqual([['first edit'], ['original']]);
  expect(save.dirty).toBe(false);
});
