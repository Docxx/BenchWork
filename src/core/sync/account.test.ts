// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { fakeAccountRelay, connectDevice } from '../../test/fakeAccountRelay';
import {
  checkLogin,
  checkNewPassword,
  newRecoveryKey,
  openKeyring,
  passwordKeys,
  recoveryKeys,
  sealKeyring,
  type Keyring,
} from './account';
import { randomKey } from './relayCrypto';

const keyring = (revision: number): Keyring => ({
  revision,
  recoveryWrap: randomKey(),
  vaults: [{ id: 'vault-identity-0001', name: 'Lab', key: randomKey(), owner: 'owner-token' }],
});

function device() {
  const platform = new MemoryAdapter();
  connectDevice(platform, fakeAccountRelay(), 'PC');
  return platform;
}

it('splits the password into a sign-in key and a separate wrapping key', async () => {
  const platform = device();
  const kdf = { alg: 'argon2id', m: 65536, t: 3, p: 1 } as const;
  const salt = 'c2FsdHNhbHRzYWx0c2FsdA==';
  const one = await passwordKeys(platform, 'a long pass phrase', salt, kdf);
  expect(await passwordKeys(platform, 'a long pass phrase', salt, kdf)).toEqual(one);
  expect(one.auth).not.toEqual(one.wrap);
  expect(one.auth).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const other = await passwordKeys(platform, 'a long pass phrasf', salt, kdf);
  expect(other.auth).not.toEqual(one.auth);
});

it('refuses weaker password settings from the server', async () => {
  const platform = device();
  for (const kdf of [
    { alg: 'argon2id', m: 1024, t: 3, p: 1 },
    { alg: 'argon2id', m: 65536, t: 1, p: 1 },
  ] as const)
    await expect(
      passwordKeys(platform, 'pass phrase here', 'c2FsdHNhbHRzYWx0c2FsdA==', kdf),
    ).rejects.toThrow('unsafe');
});

it('seals the keyring so only the right key opens it, and refuses an older one', async () => {
  const wrap = randomKey();
  const sealed = await sealKeyring(wrap, keyring(3));
  expect(sealed).not.toContain('owner-token');
  expect((await openKeyring(wrap, sealed, 3)).vaults[0]?.name).toBe('Lab');
  await expect(openKeyring(randomKey(), sealed, 3)).rejects.toThrow('wrong');
  // A relay that reports a different version from the sealed revision is caught.
  await expect(openKeyring(wrap, sealed, 4)).rejects.toThrow('out-of-date');
  // A device that has seen revision 5 refuses revision 3 served later.
  await expect(openKeyring(wrap, sealed, 3, 5)).rejects.toThrow('out-of-date');
});

it('makes recovery keys that can be typed back with any spacing', async () => {
  const key = newRecoveryKey();
  expect(key).toMatch(/^([0-9a-f]{4}-){15}[0-9a-f]{4}$/);
  const typed = key.replace(/-/g, ' ').toUpperCase();
  expect(await recoveryKeys(typed)).toEqual(await recoveryKeys(key));
  await expect(recoveryKeys(key.slice(0, 20))).rejects.toThrow('not complete');
});

it('checks usernames and new passwords with plain messages', () => {
  expect(checkLogin('  Ray@Example.org ')).toBe('ray@example.org');
  expect(() => checkLogin('a')).toThrow('3 to 80');
  expect(() => {
    checkNewPassword('short', 'short');
  }).toThrow('at least 12');
  expect(() => {
    checkNewPassword('long enough phrase', 'long enough phrasf');
  }).toThrow('different');
});
