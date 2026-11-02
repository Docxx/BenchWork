import {
  NiimbotAbstractClient,
  NiimbotBluetoothClient,
  ImageEncoder,
  PageColorType,
  ConnectResult,
  type ConnectionInfo,
  type NiimbotClientType,
  type PrinterInfo,
} from '@mmote/niimbluelib';
import type { LabelBluetoothTransport, LabelBluetoothDevice } from '../platform/labelBluetooth';
import { labelBatches, type LabelDesign, type LabelRow } from './model';
import { renderFeed } from './render';
class NativeClient extends NiimbotAbstractClient {
  private connected = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private transport: LabelBluetoothTransport,
    private id: string,
  ) {
    super();
    this.setHeartbeatAutoStart(false);
    this.setFetchRfidOnPrintEnd(false);
  }
  getType(): NiimbotClientType {
    return 'bluetooth';
  }
  isConnected() {
    return this.connected;
  }
  async connect(): Promise<ConnectionInfo> {
    await this.transport.connect(this.id);
    this.connected = true;
    let reading = false;
    this.timer = setInterval(() => {
      if (reading || !this.connected) return;
      reading = true;
      void this.transport
        .read()
        .then((bytes) => {
          if (bytes.length) this.processRawPacket(Uint8Array.from(bytes));
        })
        .catch(() => {
          this.connected = false;
        })
        .finally(() => {
          reading = false;
        });
    }, 30);
    try {
      await this.connectNegotiate();
      await this.fetchPrinterInfo();
      return { result: this.getPrinterInfo().connectResult ?? ConnectResult.FirmwareErrors };
    } catch (err) {
      await this.disconnect();
      throw err;
    }
  }
  async disconnect() {
    this.connected = false;
    this.stopHeartbeat();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.transport.disconnect();
  }
  async sendRaw(data: Uint8Array, force = false) {
    const send = async () => {
      if (!this.connected)
        throw new Error('Printer disconnected. Check the last label before trying again.');
      await new Promise((resolve) => setTimeout(resolve, this.packetIntervalMs));
      await this.transport.write(Array.from(data));
    };
    if (force) await send();
    else await this.mutex.runExclusive(send);
  }
}
export class LabelPrinter {
  private client: NiimbotAbstractClient | null = null;
  private running: Promise<void> | null = null;
  private stopRequested = false;
  constructor(private transport: LabelBluetoothTransport | null) {}
  scan(): Promise<LabelBluetoothDevice[]> {
    return this.transport
      ? this.transport.scan()
      : Promise.resolve([
          { id: 'browser', name: 'Choose a Bluetooth printer', transport: 'Browser Bluetooth' },
        ]);
  }
  async connect(id: string): Promise<PrinterInfo> {
    if (this.running) throw new Error('Wait for the current print job to finish.');
    await this.close();
    const client = this.transport
      ? new NativeClient(this.transport, id)
      : new NiimbotBluetoothClient();
    client.setHeartbeatAutoStart(false);
    client.setFetchRfidOnPrintEnd(false);
    try {
      await client.connect();
      const info = client.getPrinterInfo();
      if (info.modelId !== 262)
        throw new Error('This first print profile is calibrated for the B3S model 262.');
      this.client = client;
      return info;
    } catch (err) {
      await client.disconnect().catch(() => undefined);
      throw err;
    }
  }
  isConnected() {
    return this.client?.isConnected() ?? false;
  }
  stop() {
    this.stopRequested = true;
  }
  async close() {
    this.stopRequested = true;
    await this.running?.catch(() => undefined);
    const client = this.client;
    this.client = null;
    await client?.disconnect();
  }
  print(
    d: LabelDesign,
    rows: LabelRow[],
    copies: number,
    start: number,
    progress: (done: number, total: number) => void,
  ): Promise<void> {
    if (this.running) return Promise.reject(new Error('A print job is already running.'));
    const client = this.client;
    if (!client?.isConnected())
      return Promise.reject(new Error('Connect the B3S before printing.'));
    this.stopRequested = false;
    const work = async () => {
      const batches = labelBatches(rows, copies, d.perFeed);
      // Render and validate every page before any paper is used.
      const pages = [];
      let sequence = start;
      for (const batch of batches) {
        pages.push(await renderFeed(d, batch, sequence));
        sequence += batch.length;
      }
      progress(0, pages.length);
      const task = client.protocol.newPrintTask('B1', {
        totalPages: pages.length,
        density: d.density,
        statusTimeoutMs: 3000,
        pageTimeoutMs: 10000,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await task.printInit();
        for (const [i, page] of pages.entries()) {
          if (this.stopRequested)
            throw new Error(
              'Stopped after the current feed position. Check the printed labels before starting a new job.',
            );
          await task.printPage(
            ImageEncoder.encodeCanvas(page, PageColorType.SingleColor, 'top'),
            1,
          );
          progress(i + 1, pages.length);
        }
        await Promise.race([
          task.waitForFinished(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => {
                reject(
                  new Error(
                    'Printer completion is uncertain. Check the labels before starting another job; nothing will be retried automatically.',
                  ),
                );
              },
              Math.max(20000, pages.length * 2500),
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
        client.protocol.cancelStatusPoll();
        await client.protocol.printEnd().catch(() => undefined);
      }
    };
    const pending = work().finally(() => {
      this.running = null;
    });
    this.running = pending;
    return pending;
  }
}
