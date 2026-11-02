// Manual NIIMBOT transport probe. Default operation only reads printer identity.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { NiimbotAbstractClient, ImageEncoder, PageColorType } from '@mmote/niimbluelib';
import { readFile } from 'node:fs/promises';
const id = process.argv[2];
if (!id?.startsWith('ble:') && !id?.startsWith('classic:'))
  throw new Error('Supply a discovered printer id.');
const child = spawn('src-tauri/target/debug/label_probe.exe', [id], {
  stdio: ['pipe', 'pipe', 'inherit'],
  windowsHide: true,
});
const lines = createInterface({ input: child.stdout });
const pending = [];
lines.on('line', (line) => {
  const next = pending.shift();
  if (next) {
    try {
      const value = JSON.parse(line);
      if (value.error) next.reject(new Error(value.error));
      else next.resolve(value);
    } catch (e) {
      next.reject(e);
    }
  }
});
child.on('exit', () => {
  for (const next of pending.splice(0)) next.reject(new Error('Transport closed.'));
});
const receive = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
const connected = await receive();
if (!connected.connected) throw new Error('Could not connect');
function rpc(op, bytes) {
  const response = receive();
  child.stdin.write(JSON.stringify({ op, bytes }) + '\n');
  return response;
}
class Client extends NiimbotAbstractClient {
  timer;
  connected = false;
  getType() {
    return 'bluetooth';
  }
  isConnected() {
    return this.connected;
  }
  async connect() {
    this.connected = true;
    this.setHeartbeatAutoStart(false);
    this.setFetchRfidOnPrintEnd(false);
    let reading = false;
    this.timer = setInterval(async () => {
      if (reading) return;
      reading = true;
      try {
        const { bytes } = await rpc('read');
        if (bytes.length) this.processRawPacket(Uint8Array.from(bytes));
      } catch {
      } finally {
        reading = false;
      }
    }, 30);
    await this.negotiateAndGetPrinterInfo();
    return { result: this.getPrinterInfo().connectResult, deviceName: 'B3S' };
  }
  async disconnect() {
    this.connected = false;
    this.stopHeartbeat();
    clearInterval(this.timer);
    child.stdin.end();
  }
  async sendRaw(bytes, force = false) {
    const send = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await rpc('write', Array.from(bytes));
    };
    if (force) await send();
    else await this.mutex.runExclusive(send);
  }
}
const client = new Client();
try {
  await client.connect();
  console.log(
    JSON.stringify({ printer: client.getPrinterInfo(), model: client.getModelMetadata() }, null, 2),
  );
  if (process.argv.includes('--test-print')) {
    if (client.getPrinterInfo().modelId !== 262)
      throw new Error('This calibration is restricted to the tested B3S model.');
    const bmp = await readFile('test-results/label-calibration/calibration.bmp');
    const offset = bmp.readUInt32LE(10),
      width = bmp.readInt32LE(18),
      height = bmp.readInt32LE(22);
    if (
      width !== 400 ||
      height !== 240 ||
      bmp.readUInt16LE(28) !== 24 ||
      bmp.readUInt32LE(30) !== 0
    )
      throw new Error('Unexpected calibration bitmap');
    const stride = Math.ceil((width * 3) / 4) * 4;
    const encoded = ImageEncoder.encode(
      {
        width,
        height,
        getPixelColor(x, y) {
          const pos = offset + (height - 1 - y) * stride + x * 3;
          return bmp[pos] + bmp[pos + 1] + bmp[pos + 2] < 384 ? 0 : 0xffffff;
        },
      },
      PageColorType.SingleColor,
      'top',
    );
    const task = client.protocol.newPrintTask('B1', {
      totalPages: 1,
      density: 2,
      statusTimeoutMs: 3000,
      pageTimeoutMs: 10000,
    });
    let timeout;
    try {
      console.log(
        'Printing exactly one corrected 50 x 30 mm calibration page: two 50 x 15 mm labels, zero internal gap, -0.75 mm artwork offset.',
      );
      await task.printInit();
      await task.printPage(encoded, 1);
      await Promise.race([
        task.waitForFinished(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Completion uncertain; do not retry automatically.')),
            20000,
          );
        }),
      ]);
      console.log('Printer acknowledged completion of one calibration page.');
    } finally {
      clearTimeout(timeout);
      client.protocol.cancelStatusPoll();
      await client.protocol.printEnd().catch(() => undefined);
    }
  }
} finally {
  await client.disconnect();
}
