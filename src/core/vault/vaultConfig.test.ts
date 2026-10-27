// @vitest-environment node
import {
  DEFAULT_LINK_THRESHOLD_MB,
  defaultVaultConfig,
  parseVaultConfig,
  serialiseVaultConfig,
  VaultConfigError,
} from './vaultConfig';

describe('vault config', () => {
  it('round trips the default config', () => {
    const text = serialiseVaultConfig(defaultVaultConfig());
    expect(JSON.parse(text)).toEqual({
      version: 1,
      modules: {},
      attachments: { linkThresholdMB: 50 },
    });
    expect(text.endsWith('\n')).toBe(true);
    expect(parseVaultConfig(text)).toEqual(defaultVaultConfig());
  });

  it('keeps keys it does not know at every level', () => {
    const original = {
      version: 1,
      modules: {
        hello: { enabled: true, pinned: 3 },
        'from-the-future': { enabled: false, options: { a: 1 } },
      },
      attachments: { linkThresholdMB: 20, previewImages: true },
      sync: { provider: 'syncthing' },
    };
    const config = parseVaultConfig(JSON.stringify(original));
    expect(config.modules['hello']?.enabled).toBe(true);
    expect(config.attachments.linkThresholdMB).toBe(20);
    expect(JSON.parse(serialiseVaultConfig(config))).toEqual(original);
  });

  it('writes changes while keeping unknown keys', () => {
    const config = parseVaultConfig(
      JSON.stringify({ version: 1, modules: { hello: { enabled: false, note: 'x' } }, other: 1 }),
    );
    const hello = config.modules['hello'];
    if (hello) hello.enabled = true;
    expect(JSON.parse(serialiseVaultConfig(config))).toMatchObject({
      modules: { hello: { enabled: true, note: 'x' } },
      other: 1,
    });
  });

  it('replaces fields with the wrong type by defaults', () => {
    const config = parseVaultConfig(
      JSON.stringify({
        modules: { good: { enabled: true }, bad: { enabled: 'yes' }, worse: 3 },
        attachments: { linkThresholdMB: -5 },
      }),
    );
    expect(Object.keys(config.modules)).toEqual(['good']);
    expect(config.attachments.linkThresholdMB).toBe(DEFAULT_LINK_THRESHOLD_MB);
    expect(config.version).toBe(1);
  });

  it('refuses files it cannot trust', () => {
    expect(() => parseVaultConfig('{ not json')).toThrow(VaultConfigError);
    expect(() => parseVaultConfig('[1, 2]')).toThrow(/JSON object/);
    expect(() => parseVaultConfig('{"version": 2}')).toThrow(/newer version/);
  });

  it('keeps the layout new pages start with, writing it only when not the default', () => {
    const free = parseVaultConfig('{"version":1,"pages":{"layout":"free"}}');
    expect(free.pages.layout).toBe('free');
    expect(JSON.parse(serialiseVaultConfig(free))).toMatchObject({ pages: { layout: 'free' } });
    expect(parseVaultConfig('{"version":1,"pages":{"layout":"spiral"}}').pages.layout).toBe(
      'document',
    );
    expect(serialiseVaultConfig(defaultVaultConfig())).not.toContain('pages');
  });
});
