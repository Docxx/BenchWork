// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import type { PlatformAdapter, RelayAdapter } from '../platform/types';
import { RelayEngine, describeProgress } from './relayEngine';
import type { RelayConnection } from './relayClient';
import { MAX_FILE as MAX, fromBase64, randomKey, seal, sha256, unseal } from './relayCrypto';

function backend() {
  const events: { seq: number; id: string; payload: string }[] = [],
    blobs = new Map<string, string>();
  let online = true;
  return {
    events,
    blobs,
    setOnline: (value: boolean) => {
      online = value;
    },
    request: async (_endpoint: string, _certificate: string, body: string) => {
      await Promise.resolve();
      if (!online) throw new Error('Offline');
      const data = JSON.parse(body) as {
        action: string;
        after: number;
        id: string;
        payload: string;
      };
      if (data.action === 'events')
        return JSON.stringify({ events: events.filter((e) => e.seq > data.after).slice(0, 32) });
      if (data.action === 'append') {
        const before = events.find((e) => e.id === data.id);
        if (before && before.payload !== data.payload) throw new Error('Identity reused');
        if (!before) events.push({ seq: events.length + 1, id: data.id, payload: data.payload });
      }
      if (data.action === 'put') blobs.set(data.id, data.payload);
      if (data.action === 'get') return JSON.stringify({ payload: blobs.get(data.id) });
      return '{}';
    },
  };
}
const target = {
  endpoint: 'https://178.62.50.124',
  certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
};
async function device(server: ReturnType<typeof backend>, initial: Record<string, string> = {}) {
  const memory = new MemoryAdapter({ folders: { 'C:/Vault': initial } });
  await memory.setVaultRoot('C:/Vault');
  const relay: RelayAdapter = {
    request: server.request,
    apply: vi.fn(async (path: string, expected: string | null, encoded: string | null) => {
      const actual = (await memory.exists(path)) ? await memory.hashFile(path) : null;
      if (actual !== expected) return false;
      if (encoded === null) {
        if (actual) await memory.trash(path);
      } else {
        await memory.ensureDir(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
        await memory.writeBytes(path, fromBase64(encoded));
      }
      return true;
    }),
  };
  const platform: PlatformAdapter = Object.assign(memory, { relay });
  return { memory, platform, relay };
}
const connection = (key: string, owner: boolean): RelayConnection => ({
  ...target,
  protocol: 1,
  vault: 'test-vault-identity',
  token: 'device-token',
  key,
  name: owner ? 'PC' : 'Tablet',
  owner,
});

it('restores offline history and converges concurrent note edits without reseeding identical Markdown', async () => {
  const server = backend(),
    key = randomKey();
  const a = await device(server, { 'Notes.md': '# Notes\n\nAlpha and beta.\n' });
  const b = await device(server, { 'Notes.md': '# Notes\n\nAlpha and beta.\n' });
  let ea = await RelayEngine.open(a.platform, connection(key, true), true);
  const eb = await RelayEngine.open(b.platform, connection(key, false), true);
  await ea.sync();
  await eb.sync();
  expect(await b.memory.readText('Notes.md')).toBe('# Notes\n\nAlpha and beta.\n');
  await a.memory.writeTextAtomic('Notes.md', '# Notes\n\nAlpha one and beta.\n');
  await b.memory.writeTextAtomic('Notes.md', '# Notes\n\nAlpha and beta two.\n');
  server.setOnline(false);
  await expect(ea.sync()).rejects.toThrow('Offline');
  ea.destroy();
  ea = await RelayEngine.open(a.platform, connection(key, true));
  server.setOnline(true);
  await eb.sync();
  await ea.sync();
  await eb.sync();
  expect(await a.memory.readText('Notes.md')).toBe('# Notes\n\nAlpha one and beta two.\n');
  expect(await b.memory.readText('Notes.md')).toBe(await a.memory.readText('Notes.md'));
  expect(JSON.stringify(server.events)).not.toContain('Alpha');
  expect(JSON.stringify(server.events)).not.toContain('Notes.md');
  ea.destroy();
  eb.destroy();
});

it('preserves binary replacements, deletion/edit races, module data and renames', async () => {
  const server = backend(),
    key = randomKey();
  const a = await device(server, {
    'picture.png': 'old image',
    'Notes.md': 'Original\n',
    '.benchwork/modules/cloud/connections.json': '[1]',
    '.benchwork/index.sqlite': 'private index',
  });
  const b = await device(server);
  const ea = await RelayEngine.open(a.platform, connection(key, true), true),
    eb = await RelayEngine.open(b.platform, connection(key, false), true);
  await ea.sync();
  await eb.sync();
  expect(await b.memory.readText('.benchwork/modules/cloud/connections.json')).toBe('[1]');
  expect(await b.memory.exists('.benchwork/index.sqlite')).toBe(false);
  await a.memory.writeTextAtomic('picture.png', 'PC image');
  await b.memory.writeTextAtomic('picture.png', 'Tablet image');
  await a.memory.trash('Notes.md');
  await b.memory.writeTextAtomic('Notes.md', 'Original plus tablet\n');
  await ea.sync();
  await eb.sync();
  await ea.sync();
  await eb.sync();
  const images = Object.entries(a.memory.snapshot())
    .filter(([p]) => p.endsWith('.png'))
    .map(([, v]) => v)
    .sort();
  expect(images).toEqual(['PC image', 'Tablet image']);
  expect(await a.memory.readText('Notes.md')).toContain('tablet');
  await a.memory.rename('Notes.md', 'Moved.md');
  await ea.sync();
  await eb.sync();
  expect(await b.memory.readText('Moved.md')).toContain('tablet');
  expect(await b.memory.exists('Notes.md')).toBe(false);
  ea.destroy();
  eb.destroy();
});

it('recovers a failed projection without importing stale files as new deletions', async () => {
  const server = backend(),
    key = randomKey();
  const a = await device(server, { 'Notes.md': 'Base\n' }),
    b = await device(server);
  const ea = await RelayEngine.open(a.platform, connection(key, true), true);
  let eb = await RelayEngine.open(b.platform, connection(key, false), true);
  await ea.sync();
  await eb.sync();
  await a.memory.writeTextAtomic('Notes.md', 'Base plus remote\n');
  await ea.sync();
  vi.mocked(b.relay.apply).mockRejectedValueOnce(new Error('Disk full'));
  await expect(eb.sync()).rejects.toThrow('Disk full');
  eb.destroy();
  eb = await RelayEngine.open(b.platform, connection(key, false));
  await eb.sync();
  expect(await b.memory.readText('Notes.md')).toBe('Base plus remote\n');
  await ea.sync();
  expect(await a.memory.readText('Notes.md')).toBe('Base plus remote\n');
  ea.destroy();
  eb.destroy();
});

it('keeps an external edit made while a received change waits for projection', async () => {
  const server = backend(),
    key = randomKey();
  const a = await device(server, { 'Notes.md': 'Base\n' }),
    b = await device(server);
  const ea = await RelayEngine.open(a.platform, connection(key, true), true),
    eb = await RelayEngine.open(b.platform, connection(key, false), true);
  await ea.sync();
  await eb.sync();
  await a.memory.writeTextAtomic('Notes.md', 'Base with Remote\n');
  await ea.sync();
  vi.mocked(b.relay.apply).mockResolvedValueOnce(false);
  await expect(eb.sync()).rejects.toThrow('New local edits');
  await b.memory.writeTextAtomic('Notes.md', 'External before Base\n');
  await eb.sync();
  expect(await b.memory.readText('Notes.md')).toContain('External');
  expect(await b.memory.readText('Notes.md')).toContain('Remote');
  ea.destroy();
  eb.destroy();
});

it('does not upload before a durable checkpoint, rejects missing history and does not accept a wrong key', async () => {
  const server = backend(),
    key = randomKey();
  const a = await device(server, { 'Notes.md': 'Private\n' });
  const ea = await RelayEngine.open(a.platform, connection(key, true), true);
  const write = vi.spyOn(a.memory, 'writeTextAtomic');
  write.mockRejectedValueOnce(new Error('Disk full'));
  await expect(ea.sync()).rejects.toThrow('Disk full');
  expect(server.events).toHaveLength(0);
  write.mockRestore();
  await ea.sync();
  const b = await device(server);
  await expect(RelayEngine.open(b.platform, connection(key, false))).rejects.toThrow(
    'history is missing',
  );
  const eb = await RelayEngine.open(b.platform, connection(randomKey(), false), true);
  await expect(eb.sync()).rejects.toThrow();
  expect(await b.memory.exists('Notes.md')).toBe(false);
  const payload = await seal(key, 'vault', 'object', 'blob', new TextEncoder().encode('secret'));
  await expect(unseal(key, 'other-vault', 'object', 'blob', payload)).rejects.toThrow();
  await expect(unseal(key, 'vault', 'other-object', 'blob', payload)).rejects.toThrow();
  ea.destroy();
  eb.destroy();
});

it('reassembles multi-part updates, verifies multi-chunk attachments and safely retries a lost upload acknowledgement', async () => {
  const server = backend(),
    key = randomKey();
  const a = await device(server, { 'Large.md': `${'Original paragraph.\n'.repeat(18000)}\n` });
  const b = await device(server);
  const blob = Uint8Array.from({ length: 1100000 }, (_, i) => i % 251);
  await a.memory.writeBytes('attachment.bin', blob);
  let ea = await RelayEngine.open(a.platform, connection(key, true), true);
  const eb = await RelayEngine.open(b.platform, connection(key, false), true);
  const originalRequest = a.relay.request;
  let dropped = false;
  a.relay.request = async (endpoint, cert, body) => {
    const result = await originalRequest(endpoint, cert, body);
    if (!dropped && (JSON.parse(body) as { action: string }).action === 'append') {
      dropped = true;
      throw new Error('Acknowledgement lost');
    }
    return result;
  };
  await expect(ea.sync()).rejects.toThrow('Acknowledgement lost');
  ea.destroy();
  ea = await RelayEngine.open(a.platform, connection(key, true));
  await ea.sync();
  await eb.sync();
  expect(server.blobs.size).toBe(3);
  expect(server.events.length).toBeGreaterThan(1);
  expect(new Set(server.events.map((e) => e.id)).size).toBe(server.events.length);
  expect(await b.memory.readBytes('attachment.bin', 1200000)).toEqual(blob);
  expect(await b.memory.readText('Large.md')).toBe(await a.memory.readText('Large.md'));
  ea.destroy();
  eb.destroy();
  // Encrypts and moves a large page and a 1.1 MB file: about 3 s on a desktop,
  // longer on a shared CI runner, so it gets more than the 5 s default.
}, 30_000);

const OUTBOX = '.benchwork/relay/outbox';
const CHECKPOINT = '.benchwork/relay/checkpoint.json';
function picture(seed: number, size = 600 * 1024): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) bytes[i] = (i * 7 + seed) % 251;
  return bytes;
}
function outboxFiles(memory: MemoryAdapter): string[] {
  return Object.entries(memory.snapshot())
    .filter(([p, v]) => v !== null && p.startsWith(`${OUTBOX}/`))
    .map(([p]) => p);
}

describe('large first uploads', { timeout: 60000 }, () => {
  afterEach(() => {
    RelayEngine.batchBytes = 64 * 1024 * 1024;
  });

  it('keeps envelopes out of the checkpoint, sends in batches and empties the outbox', async () => {
    RelayEngine.batchBytes = 2 * 1024 * 1024;
    const server = backend(),
      key = randomKey();
    const a = await device(server, { 'Notes.md': '# Notes\n' });
    await a.memory.ensureDir('Images');
    for (let i = 0; i < 12; i += 1)
      await a.memory.writeBytes(`Images/p${String(i)}.png`, picture(i));
    const ea = await RelayEngine.open(a.platform, connection(key, true), true);
    const progress: string[] = [];
    ea.onProgress = (p) => {
      progress.push(`${String(p.files)}/${String(p.total)}/${String(p.sent)}`);
    };
    const checkpoints: number[] = [];
    const write = a.memory.writeTextAtomic.bind(a.memory);
    vi.spyOn(a.memory, 'writeTextAtomic').mockImplementation(async (path, text) => {
      if (path === CHECKPOINT) {
        checkpoints.push(text.length);
        for (const payload of server.blobs.values()) expect(text).not.toContain(payload);
      }
      await write(path, text);
    });
    await ea.sync();
    // 12 pictures of two pieces each, sent in several batches with their catalogue updates.
    expect(server.blobs.size).toBe(24);
    expect(server.events.length).toBeGreaterThan(2);
    expect(Math.max(...checkpoints)).toBeLessThan(100 * 1024);
    expect(outboxFiles(a.memory)).toEqual([]);
    expect(progress.at(-1)).toBe(`13/13/${String(24 + server.events.length)}`);
    const b = await device(server);
    const eb = await RelayEngine.open(b.platform, connection(key, false), true);
    await eb.sync();
    for (let i = 0; i < 12; i += 1)
      expect(await b.memory.readBytes(`Images/p${String(i)}.png`, MAX)).toEqual(picture(i));
    ea.destroy();
    eb.destroy();
  });

  it('resumes after a crash mid-upload, sends nothing twice and removes leftover files', async () => {
    RelayEngine.batchBytes = 2 * 1024 * 1024;
    const server = backend(),
      key = randomKey();
    const a = await device(server);
    await a.memory.ensureDir('Data');
    for (let i = 0; i < 8; i += 1) await a.memory.writeBytes(`Data/d${String(i)}.bin`, picture(i));
    let ea = await RelayEngine.open(a.platform, connection(key, true), true);
    const original = a.relay.request;
    let puts = 0;
    a.relay.request = async (endpoint, cert, body) => {
      // The first batch is 4 files (8 pieces and an update); fail inside the second.
      if ((JSON.parse(body) as { action: string }).action === 'put' && ++puts === 11)
        throw new Error('Connection lost');
      return original(endpoint, cert, body);
    };
    await expect(ea.sync()).rejects.toThrow('Connection lost');
    ea.destroy();
    // A piece written just before a crash, with no checkpoint listing it.
    const folder = (outboxFiles(a.memory)[0] ?? `${OUTBOX}/x/y`).split('/').slice(0, -1).join('/');
    await a.memory.writeTextAtomic(`${folder}/orphan.txt`, 'left over');
    // A device that received the first batch gets whole, verified files only.
    const b = await device(server);
    const eb = await RelayEngine.open(b.platform, connection(key, false), true);
    await eb.sync();
    const early = Object.keys(b.memory.snapshot()).filter((p) => p.startsWith('Data/'));
    expect(early.length).toBeGreaterThan(0);
    for (const path of early)
      expect(await b.memory.readBytes(path, MAX)).toEqual(picture(Number(path.slice(6, -4))));
    a.relay.request = original;
    ea = await RelayEngine.open(a.platform, connection(key, true));
    expect(await a.memory.exists(`${folder}/orphan.txt`)).toBe(false);
    await ea.sync();
    expect(server.blobs.size).toBe(16);
    expect(new Set(server.events.map((e) => e.id)).size).toBe(server.events.length);
    expect(outboxFiles(a.memory)).toEqual([]);
    await eb.sync();
    for (let i = 0; i < 8; i += 1)
      expect(await b.memory.readBytes(`Data/d${String(i)}.bin`, MAX)).toEqual(picture(i));
    ea.destroy();
    eb.destroy();
  });

  it('still sends envelopes kept inside a checkpoint from before the outbox folder', async () => {
    const server = backend(),
      key = randomKey();
    const a = await device(server, { 'Notes.md': 'Old style\n' });
    await a.memory.writeBytes('old.png', picture(3));
    let ea = await RelayEngine.open(a.platform, connection(key, true), true);
    server.setOnline(false);
    await expect(ea.sync()).rejects.toThrow('Offline');
    ea.destroy();
    // Rewrite the checkpoint as 0.24.0 kept it: envelopes inline, no outbox folder.
    const state = JSON.parse(await a.memory.readText(CHECKPOINT)) as {
      pending: { id: string; kind: string; file?: string; payload?: string }[];
      outbox?: string;
    };
    for (const item of state.pending) {
      item.payload = await a.memory.readText(item.file ?? '');
      await a.memory.removeSyncOutbox(item.file ?? '');
      delete item.file;
    }
    delete state.outbox;
    await a.memory.writeTextAtomic(CHECKPOINT, JSON.stringify(state));
    server.setOnline(true);
    ea = await RelayEngine.open(a.platform, connection(key, true));
    await ea.sync();
    const b = await device(server);
    const eb = await RelayEngine.open(b.platform, connection(key, false), true);
    await eb.sync();
    expect(await b.memory.readText('Notes.md')).toBe('Old style\n');
    expect(await b.memory.readBytes('old.png', MAX)).toEqual(picture(3));
    ea.destroy();
    eb.destroy();
  });

  it('refuses a checkpoint that points outside the outbox folder', async () => {
    const server = backend(),
      key = randomKey();
    const a = await device(server, { 'Notes.md': 'Text\n' });
    const ea = await RelayEngine.open(a.platform, connection(key, true), true);
    server.setOnline(false);
    await expect(ea.sync()).rejects.toThrow('Offline');
    ea.destroy();
    const state = JSON.parse(await a.memory.readText(CHECKPOINT)) as {
      pending: { file?: string }[];
    };
    const first = state.pending[0];
    if (first) first.file = 'Notes.md';
    await a.memory.writeTextAtomic(CHECKPOINT, JSON.stringify(state));
    await expect(RelayEngine.open(a.platform, connection(key, true))).rejects.toThrow('damaged');
  });

  it('sends files up to 50 MB and skips larger ones', async () => {
    const server = backend(),
      key = randomKey();
    const a = await device(server);
    // Over the old 32 MB limit: 68 pieces.
    const big = picture(5, 34 * 1024 * 1024);
    await a.memory.ensureDir('Literature');
    await a.memory.writeBytes('Literature/big.pdf', big);
    await a.memory.writeBytes('Literature/huge.pdf', picture(6, 1024));
    // Report the second file as 51 MB rather than holding that much in memory.
    const list = a.memory.listDir.bind(a.memory);
    vi.spyOn(a.memory, 'listDir').mockImplementation(async (path) =>
      (await list(path)).map((e) =>
        e.path === 'Literature/huge.pdf' ? { ...e, size: 51 * 1024 * 1024 } : e,
      ),
    );
    const ea = await RelayEngine.open(a.platform, connection(key, true), true);
    const report = await ea.sync();
    expect(report.skipped).toEqual(['Literature/huge.pdf']);
    const b = await device(server);
    const eb = await RelayEngine.open(b.platform, connection(key, false), true);
    await eb.sync();
    expect(await b.memory.hashFile('Literature/big.pdf')).toBe(await sha256(big));
    expect(await b.memory.exists('Literature/huge.pdf')).toBe(false);
    ea.destroy();
    eb.destroy();
  });
});

it('deletes only files in the sync outbox folder', async () => {
  const memory = new MemoryAdapter({
    folders: {
      'C:/Vault': { 'Page.md': 'mine', [`${OUTBOX}/h/1.txt`]: 'piece', [CHECKPOINT]: '{}' },
    },
  });
  await memory.setVaultRoot('C:/Vault');
  await memory.removeSyncOutbox(`${OUTBOX}/h/1.txt`);
  expect(await memory.exists(`${OUTBOX}/h/1.txt`)).toBe(false);
  for (const refused of ['Page.md', CHECKPOINT, `${OUTBOX}/h`, '.benchwork/relay/outboxX/a.txt'])
    await expect(memory.removeSyncOutbox(refused)).rejects.toThrow();
  expect(await memory.readText('Page.md')).toBe('mine');
});

it('describes sync progress in plain words', () => {
  expect(describeProgress({ files: 120, total: 1019, sent: 1312 })).toBe(
    'Sending files: 120 of 1,019 read, 1,312 pieces sent',
  );
  expect(describeProgress({ files: 0, total: 0, sent: 1 })).toBe('Sending changes: 1 piece sent');
});
