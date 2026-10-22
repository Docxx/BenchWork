// @vitest-environment node
import { PlatformError } from './errors';

describe('PlatformError.from', () => {
  it('keeps PlatformErrors as they are', () => {
    const err = new PlatformError('NotFound', 'gone');
    expect(PlatformError.from(err)).toBe(err);
  });

  it('reads the error shape sent by the Rust backend', () => {
    const err = PlatformError.from({ kind: 'OutsideVault', message: 'nope' });
    expect(err.kind).toBe('OutsideVault');
    expect(err.message).toBe('nope');
  });

  it('treats unknown kinds and other values as Io errors', () => {
    expect(PlatformError.from({ kind: 'Strange', message: 'x' }).kind).toBe('Io');
    expect(PlatformError.from(new Error('boom')).message).toBe('boom');
    expect(PlatformError.from('plain text').message).toBe('plain text');
  });
});
