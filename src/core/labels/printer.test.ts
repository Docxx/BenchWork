import { LabelPrinter } from './printer';
import { newLabelDesign } from './model';
it('does not discover, connect or send bytes until explicitly requested, and refuses unconnected printing', async () => {
  const transport = {
    scan: vi.fn().mockResolvedValue([]),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue([]),
  };
  const printer = new LabelPrinter(transport);
  expect(transport.scan).not.toHaveBeenCalled();
  expect(transport.connect).not.toHaveBeenCalled();
  expect(transport.write).not.toHaveBeenCalled();
  await expect(printer.print(newLabelDesign(), [], 2, 1, () => undefined)).rejects.toThrow(
    'Connect the B3S',
  );
  expect(transport.write).not.toHaveBeenCalled();
  await printer.scan();
  expect(transport.scan).toHaveBeenCalledOnce();
  await printer.close();
});
