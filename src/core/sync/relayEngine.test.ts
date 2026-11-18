// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import type { PlatformAdapter, RelayAdapter } from '../platform/types';
import { RelayEngine } from './relayEngine';
import type { RelayConnection } from './relayClient';
import { fromBase64, randomKey, seal, unseal } from './relayCrypto';

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
