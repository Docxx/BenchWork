// @vitest-environment node
import { decide, DEFAULT_RULES, type PalmRules, type PointerSample } from './palm';

const OFF: PalmRules = { penOnly: false, penNearbyMs: null, maxContactPx: null };

function touch(time: number, size = 10): PointerSample {
  return { pointerType: 'touch', width: size, height: size, time };
}

describe('palm rejection', () => {
  it('always lets pens and mice draw', () => {
    for (const pointerType of ['pen', 'mouse']) {
      const sample = { pointerType, width: 200, height: 200, time: 10 };
      expect(decide(sample, { lastPenAt: 5 }, DEFAULT_RULES)).toEqual({ action: 'draw' });
    }
  });

  it('lets fingers draw when every rule is off', () => {
    expect(decide(touch(1000, 200), { lastPenAt: 999 }, OFF)).toEqual({ action: 'draw' });
  });

  it('makes fingers scroll in pen-only mode', () => {
    const rules = { ...OFF, penOnly: true };
    expect(decide(touch(1000), { lastPenAt: null }, rules)).toEqual({ action: 'scroll' });
  });

  it('ignores touches soon after the pen was seen, but not later', () => {
    const rules = { ...OFF, penNearbyMs: 500 };
    expect(decide(touch(1400), { lastPenAt: 1000 }, rules)).toEqual({
      action: 'ignore',
      reason: 'pen-nearby',
    });
    expect(decide(touch(1500), { lastPenAt: 1000 }, rules)).toEqual({ action: 'draw' });
  });

  it('ignores large contact areas, which are usually a palm', () => {
    const rules = { ...OFF, maxContactPx: 40 };
    expect(decide(touch(0, 41), { lastPenAt: null }, rules)).toEqual({
      action: 'ignore',
      reason: 'large-contact',
    });
    expect(decide(touch(0, 40), { lastPenAt: null }, rules)).toEqual({ action: 'draw' });
  });

  it('does not let a palm scroll the page in pen-only mode', () => {
    expect(decide(touch(0, 120), { lastPenAt: null }, DEFAULT_RULES)).toEqual({
      action: 'ignore',
      reason: 'large-contact',
    });
  });
});
