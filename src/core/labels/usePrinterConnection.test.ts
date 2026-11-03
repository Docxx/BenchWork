import { act, renderHook } from '@testing-library/react';
import { usePrinterConnection } from './usePrinterConnection';
import type { LabelPrinter } from './printer';

const key = 'benchwork.label-studio.printer';
function fakePrinter() {
  let connected = false;
  return {
    connect: vi.fn<LabelPrinter['connect']>().mockImplementation(() => {
      connected = true;
      return Promise.resolve({
        modelId: 262,
        softwareVersion: '37.07',
        batteryPercents: 100,
      } as Awaited<ReturnType<LabelPrinter['connect']>>);
    }),
    close: vi.fn(() => {
      connected = false;
      return Promise.resolve();
    }),
    isConnected: () => connected,
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it('reconnects the remembered native printer and retries when it becomes available', async () => {
  localStorage.setItem(key, JSON.stringify({ id: 'classic:B3S', auto: true }));
  const printer = fakePrinter();
  printer.connect.mockRejectedValueOnce(new Error('Out of range'));
  const { result, unmount } = renderHook(() => usePrinterConnection(printer, true, false));
  await act(async () => {});
  expect(result.current.connected).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(printer.connect).toHaveBeenLastCalledWith('classic:B3S');
  expect(result.current.connected).toBe(true);
  await act(async () => {
    await result.current.disconnect();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45000);
  });
  expect(printer.connect).toHaveBeenCalledTimes(2);
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ auto: false });
  unmount();
});

it('does not interrupt a print job or automatically invoke browser Bluetooth', async () => {
  localStorage.setItem(key, JSON.stringify({ id: 'ble:B3S', auto: true }));
  const printer = fakePrinter();
  const { rerender, unmount } = renderHook(
    ({ native, paused }) => usePrinterConnection(printer, native, paused),
    { initialProps: { native: true, paused: true } },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(printer.connect).not.toHaveBeenCalled();
  rerender({ native: false, paused: false });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(printer.connect).not.toHaveBeenCalled();
  unmount();
});

it('remembers a first manual connection and releases it on unmount', async () => {
  const printer = fakePrinter();
  const { result, unmount } = renderHook(() => usePrinterConnection(printer, true, false));
  expect(printer.connect).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.connect('classic:chosen');
  });
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toEqual({
    id: 'classic:chosen',
    auto: true,
  });
  unmount();
  await act(async () => {});
  expect(printer.close).toHaveBeenCalled();
});

it('honours an explicit opt-out when connecting manually', async () => {
  localStorage.setItem(key, JSON.stringify({ id: 'classic:chosen', auto: false }));
  const printer = fakePrinter();
  const { result, unmount } = renderHook(() => usePrinterConnection(printer, true, false));
  await act(async () => {
    await result.current.connect('classic:chosen');
  });
  expect(result.current.autoConnect).toBe(false);
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ auto: false });
  unmount();
});
