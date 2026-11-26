// @vitest-environment node
import { appLink, createAppLinkRouter, isShortCode, newShortCode, parseAppLink } from './appLinks';

describe('benchwork:// links', () => {
  it('makes short codes that avoid easily confused letters', () => {
    for (let i = 0; i < 50; i++) expect(isShortCode(newShortCode())).toBe(true);
    expect(newShortCode(() => new Uint8Array([0, 1, 31, 32, 18, 21, 22, 27]))).toBe('01Z0JNPV');
  });
  it('reads links, forgiving case and O or I typed for 0 or 1', () => {
    expect(parseAppLink('benchwork://s/K7M2Q9XA')).toEqual({ kind: 's', code: 'K7M2Q9XA' });
    expect(parseAppLink(' benchwork://s/k7m2q9xa/ ')).toEqual({ kind: 's', code: 'K7M2Q9XA' });
    expect(parseAppLink('benchwork://s/O1I2L3AB')).toEqual({ kind: 's', code: '011213AB' });
    expect(parseAppLink('https://s/K7M2Q9XA')).toBeNull();
    expect(parseAppLink('benchwork://s/K7M2Q9X')).toBeNull();
    expect(parseAppLink('benchwork://s/K7M2Q9XU')).toBeNull();
    expect(appLink('s', 'K7M2Q9XA')).toBe('benchwork://s/K7M2Q9XA');
    expect(() => appLink('s', 'bad')).toThrow();
  });
  it('holds a link until its handler is registered', () => {
    const opened: string[] = [];
    const handlers: { kind: string; open: (code: string) => void }[] = [];
    const router = createAppLinkRouter(() => handlers);
    router.receive('benchwork://s/K7M2Q9XA');
    router.receive('not a link');
    expect(opened).toEqual([]);
    handlers.push({ kind: 's', open: (code) => opened.push(code) });
    router.handlersChanged();
    router.handlersChanged();
    expect(opened).toEqual(['K7M2Q9XA']);
  });
});
