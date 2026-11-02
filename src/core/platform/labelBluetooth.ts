import { invoke, isTauri } from '@tauri-apps/api/core';
export interface LabelBluetoothDevice {
  id: string;
  name: string;
  transport: string;
}
export interface LabelBluetoothTransport {
  scan(): Promise<LabelBluetoothDevice[]>;
  connect(id: string): Promise<void>;
  disconnect(): Promise<void>;
  write(bytes: number[]): Promise<void>;
  read(): Promise<number[]>;
}
declare global {
  interface Window {
    __benchworkLabelReply?: (id: string, ok: boolean, value: unknown) => void;
  }
}
let counter = 0;
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function androidRequest<T>(op: string, payload: unknown): Promise<T> {
  window.__benchworkLabelReply = (id, ok, value) => {
    const request = pending.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(id);
    if (ok) request.resolve(value);
    else request.reject(new Error(String(value)));
  };
  return new Promise<T>((resolve, reject) => {
    const id = `label-${String(++counter)}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Bluetooth operation timed out. Reconnect before trying again.'));
    }, 25000);
    pending.set(id, {
      resolve: (value) => {
        resolve(value as T);
      },
      reject,
      timer,
    });
    try {
      window.BenchWorkAndroid?.labelBluetooth?.(id, op, JSON.stringify(payload));
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
export function nativeLabelBluetooth(): LabelBluetoothTransport | null {
  if (window.BenchWorkAndroid?.labelBluetooth)
    return {
      scan: () => androidRequest('scan', {}),
      connect: (id) => androidRequest('connect', { id }),
      disconnect: () => androidRequest('disconnect', {}),
      write: (bytes) => androidRequest('write', { bytes }),
      read: () => androidRequest('read', {}),
    };
  if (!isTauri()) return null;
  return {
    scan: () => invoke('label_bluetooth_scan'),
    connect: (id) => invoke('label_bluetooth_connect', { id }),
    disconnect: () => invoke('label_bluetooth_disconnect'),
    write: (bytes) => invoke('label_bluetooth_write', { bytes }),
    read: () => invoke('label_bluetooth_read'),
  };
}
