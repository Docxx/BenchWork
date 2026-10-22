/**
 * Palm rejection rules. Each can be switched on or off in the spike page so
 * their effect can be tested one at a time on the tablet.
 */

export interface PalmRules {
  /** Fingers never draw: one-finger drags scroll the page instead. */
  penOnly: boolean;
  /** Ignore touches this many ms after the pen was last seen (hovering or touching). Null is off. */
  penNearbyMs: number | null;
  /** Ignore touches whose contact area is wider or taller than this, in CSS px. Null is off. */
  maxContactPx: number | null;
}

export const DEFAULT_RULES: PalmRules = { penOnly: true, penNearbyMs: 500, maxContactPx: 40 };

export interface PointerSample {
  pointerType: string;
  /** Contact size in CSS px, as reported by the browser. */
  width: number;
  height: number;
  /** Event time in ms. */
  time: number;
}

/** What the page last knew about the pen. */
export interface PalmState {
  /** When the pen was last seen, hovering or touching. */
  lastPenAt: number | null;
}

export type PalmDecision =
  | { action: 'draw' }
  | { action: 'scroll' }
  | { action: 'ignore'; reason: 'pen-nearby' | 'large-contact' };

/** Decides what a new pointer does. Pens and mice always draw. */
export function decide(sample: PointerSample, state: PalmState, rules: PalmRules): PalmDecision {
  if (sample.pointerType !== 'touch') return { action: 'draw' };
  if (
    rules.penNearbyMs !== null &&
    state.lastPenAt !== null &&
    sample.time - state.lastPenAt < rules.penNearbyMs
  ) {
    return { action: 'ignore', reason: 'pen-nearby' };
  }
  if (rules.maxContactPx !== null && Math.max(sample.width, sample.height) > rules.maxContactPx) {
    return { action: 'ignore', reason: 'large-contact' };
  }
  return rules.penOnly ? { action: 'scroll' } : { action: 'draw' };
}
