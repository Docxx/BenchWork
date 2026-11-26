import { MemoryAdapter } from '../platform/memory';
import type { PlatformAdapter } from '../platform';
import type { RelayAdapter } from '../platform/types';
import { CardStore } from './cards';
import type { RelayConnection } from './relayClient';

/** A stand-in relay that keeps cards the way the Python server does. */
function backend() {
  const cards = new Map<string, { body: string; updated: number }>();
  let clock = 1000;
  const relay: RelayAdapter = {
    apply: () => Promise.resolve(true),
    request: (_endpoint: string, _certificate: string, body: string) => {
      const data = JSON.parse(body) as Record<string, string | number>;
      if (data['token'] !== 'device-token') throw new Error('Device access removed');
      const key = `${String(data['kind'])}/${String(data['id'])}`;
      if (data['action'] === 'card_put') {
        cards.set(key, { body: String(data['body']), updated: (clock += 1) });
        return Promise.resolve(JSON.stringify({ stored: true }));
      }
      if (data['action'] === 'card_get') {
        const found = cards.get(key);
        if (!found) throw new Error('Card unavailable');
        return Promise.resolve(JSON.stringify(found));
      }
      if (data['action'] === 'card_delete') {
        cards.delete(key);
        return Promise.resolve(JSON.stringify({ deleted: true }));
      }
      if (data['action'] === 'cards_list') {
        const since = Number(data['since'] ?? 0);
        const found = [...cards.entries()]
          .filter(([k, v]) => k.startsWith(`${String(data['kind'])}/`) && v.updated > since)
          .sort((a, b) => a[1].updated - b[1].updated)
          .map(([k, v]) => ({ id: k.split('/')[1], updated: v.updated }));
        return Promise.resolve(JSON.stringify({ cards: found }));
      }
      throw new Error('Unsupported relay action');
    },
  };
  return relay;
}

const connection: RelayConnection = {
  endpoint: 'https://178.62.50.124',
  certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
  protocol: 1,
  vault: 'test-vault-identity',
  token: 'device-token',
  key: 'a'.repeat(44),
  owner: true,
  name: 'PC',
};

async function store(relay: RelayAdapter = backend()) {
  const memory = new MemoryAdapter({ folders: { 'C:/Vault': {} } });
  await memory.setVaultRoot('C:/Vault');
  const platform: PlatformAdapter = Object.assign(memory, { relay });
  return new CardStore(platform, connection);
}

it('carries a stock to the phone, and says nothing for a vial it has never seen', async () => {
  const cards = await store();
  await cards.put('stock', 'K7M2Q9XA', { name: 'Myd88-KO-CyO', genotype: 'w ; Myd88[KO]/CyO' });
  expect(await cards.get('stock', 'K7M2Q9XA')).toMatchObject({ name: 'Myd88-KO-CyO' });
  expect(await cards.get('stock', 'ZZZZZZZZ')).toBeNull();
  // A code that could not be a card identifier never reaches the relay.
  expect(await cards.get('stock', 'not a code')).toBeNull();
  await expect(cards.put('stock', 'bad id', {})).rejects.toThrow('card identifier');
});

it('lists labels in the order they changed, so a phone catches up once', async () => {
  const cards = await store();
  await cards.put('label', 'first-label', { name: 'Vial label' });
  await cards.put('label', 'second-label', { name: 'Box label' });
  const all = await cards.list('label');
  expect(all.map((c) => c.id)).toEqual(['first-label', 'second-label']);
  expect(await cards.list('label', all[1]?.updated)).toEqual([]);

  // Changing one brings it back, and only it.
  await cards.put('label', 'first-label', { name: 'Vial label, bigger' });
  const since = await cards.list('label', all[1]?.updated);
  expect(since.map((c) => c.id)).toEqual(['first-label']);
  expect(await cards.get('label', 'first-label')).toMatchObject({ name: 'Vial label, bigger' });

  await cards.remove('label', 'first-label');
  expect(await cards.get('label', 'first-label')).toBeNull();
});

it('refuses a card too large for the relay, and passes other failures on', async () => {
  const cards = await store();
  await expect(cards.put('label', 'huge', { text: 'x'.repeat(400001) })).rejects.toThrow(
    'too large',
  );
  const broken = await store({
    apply: () => Promise.resolve(true),
    request: () => Promise.reject(new Error('Relay unreachable or certificate changed')),
  });
  await expect(broken.get('stock', 'K7M2Q9XA')).rejects.toThrow('Relay unreachable');
});
