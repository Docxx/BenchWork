// @vitest-environment node
/** Opt in against the deployed server with disposable vaults only. Consumes one setup code. */
import { readFile } from 'node:fs/promises';
import https from 'node:https';
import { MemoryAdapter } from '../platform/memory';
import type { PlatformAdapter, RelayAdapter } from '../platform/types';
import { createRelay, joinRelay, RelayClient, type RelayAddress } from './relayClient';
import { RelayEngine } from './relayEngine';
import { fromBase64 } from './relayCrypto';

const setupFile = process.env['BENCHWORK_RELAY_SETUP'];
it.skipIf(!setupFile)(
  'syncs two disposable devices through pinned HTTPS and rejects removed devices',
  async () => {
    const setup = JSON.parse(await readFile(setupFile ?? '', 'utf8')) as RelayAddress & {
      setup: string;
    };
    function transport(memory: MemoryAdapter): RelayAdapter {
      return {
        request: (endpoint, certificate, body) =>
          new Promise<string>((resolve, reject) => {
            const request = https.request(
              `${endpoint}/v1/relay`,
              {
                method: 'POST',
                ca: certificate,
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(body),
                },
                timeout: 35000,
              },
              (response) => {
                let text = '';
                response.on('data', (chunk: Buffer) => {
                  text += chunk.toString('utf8');
                });
                response.on('end', () => {
                  if (response.statusCode !== 200)
                    reject(new Error(`Relay HTTP ${String(response.statusCode)}`));
                  else resolve(text);
                });
              },
            );
            request.on('error', reject);
            request.on('timeout', () => request.destroy(new Error('Timeout')));
            request.end(body);
          }),
        apply: async (path, expected, bytes) => {
          const actual = (await memory.exists(path)) ? await memory.hashFile(path) : null;
          if (actual !== expected) return false;
          if (bytes === null) {
            if (actual) await memory.trash(path);
          } else {
            await memory.ensureDir(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
            await memory.writeBytes(path, fromBase64(bytes));
          }
          return true;
        },
      };
    }
    const a = new MemoryAdapter({ folders: { 'test-a': { 'Test.md': 'Beginning\n' } } });
    await a.setVaultRoot('test-a');
    const b = new MemoryAdapter({ folders: { 'test-b': {} } });
    await b.setVaultRoot('test-b');
    const pa: PlatformAdapter = Object.assign(a, { relay: transport(a) }),
      pb: PlatformAdapter = Object.assign(b, { relay: transport(b) });
    const owner = await createRelay(pa, setup, setup.setup, 'Disposable PC test');
    const ownerClient = new RelayClient(pa, owner);
    const invitation = await ownerClient.invitation();
    const tablet = await joinRelay(pb, invitation, 'Disposable tablet test');
    await expect(joinRelay(pb, invitation, 'Replay')).rejects.toThrow('403');
    const ea = await RelayEngine.open(pa, owner, true),
      eb = await RelayEngine.open(pb, tablet, true);
    try {
      await ea.sync();
      await eb.sync();
      expect(await b.readText('Test.md')).toBe('Beginning\n');
      await a.writeTextAtomic('Test.md', 'PC before Beginning\n');
      await b.writeTextAtomic('Test.md', 'Beginning after tablet\n');
      await ea.sync();
      await eb.sync();
      await ea.sync();
      expect(await a.readText('Test.md')).toContain('PC before');
      expect(await a.readText('Test.md')).toContain('after tablet');
      const binary = crypto.getRandomValues(new Uint8Array(60000));
      await a.writeBytes('image.bin', binary);
      await ea.sync();
      await eb.sync();
      expect(await b.readBytes('image.bin', 100000)).toEqual(binary);
      await ownerClient.call('close');
      await expect(new RelayClient(pb, tablet).call('events')).rejects.toThrow('403');
    } finally {
      ea.destroy();
      eb.destroy();
    }
  },
  60000,
);
