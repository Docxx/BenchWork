import type { InkPoint, InkStroke } from './stroke';

/** A small seeded random number generator, so every stress page is the same. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Handwriting-like strokes in lines down an area `width` by `height`: short
 * loops about the size of letters, sampled every 4 ms as a pen would be.
 */
export function stressStrokes(count: number, width: number, height: number, seed = 1): InkStroke[] {
  const rand = mulberry32(seed);
  const lineHeight = 40;
  const strokes: InkStroke[] = [];
  let x = 16;
  let y = 32;
  for (let i = 0; i < count; i += 1) {
    const letter = 10 + rand() * 18;
    if (x + letter > width - 16) {
      x = 16;
      y += lineHeight;
      if (y > height - 16) y = 32;
    }
    const steps = 20 + Math.floor(rand() * 30);
    const loops = 1 + rand();
    const points: InkPoint[] = [];
    for (let s = 0; s < steps; s += 1) {
      const f = s / (steps - 1);
      const angle = f * loops * Math.PI * 2;
      points.push({
        x: Math.round((x + f * letter + Math.sin(angle) * 5) * 100) / 100,
        y: Math.round((y - 8 + Math.cos(angle) * 7) * 100) / 100,
        pressure: Math.round((0.35 + 0.5 * Math.sin(f * Math.PI)) * 1000) / 1000,
        t: s * 4,
      });
    }
    strokes.push({ tool: 'pen', colour: '#1f2937', width: 1.5, source: 'pen', points });
    x += letter + 6 + rand() * 8;
  }
  return strokes;
}
