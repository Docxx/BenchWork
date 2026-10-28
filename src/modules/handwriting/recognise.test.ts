// @vitest-environment node
import type { HandwritingRecognizer, InkStroke, ModuleContext } from '@core/api';
import { makeReader, toPoints } from './recognise';

const stroke = (id: string, tool: InkStroke['tool'], times: number[]): InkStroke => ({
  id,
  tool,
  colour: '#000000',
  width: 2,
  points: times.map((t, i) => [i * 10, 5, 0.5, t]),
});

describe('reading handwriting', () => {
  it('gives strokes in order, each point with a time running on through the writing', () => {
    expect(toPoints([stroke('a', 'pen', [0, 20]), stroke('b', 'pen', [0, 30])])).toEqual([
      [
        [0, 5, 0],
        [10, 5, 20],
      ],
      [
        [0, 5, 120],
        [10, 5, 150],
      ],
    ]);
  });

  it('downloads the language model once, the first time, and reads only pen strokes', async () => {
    const notes: string[] = [];
    const ctx = { app: { notify: (m: string) => notes.push(m) } } as unknown as ModuleContext;
    let ready = false;
    let downloads = 0;
    const seen: number[] = [];
    const device: HandwritingRecognizer = {
      ready: () => Promise.resolve(ready),
      prepare: () => {
        downloads += 1;
        ready = true;
        return Promise.resolve();
      },
      recognise: (strokes) => {
        seen.push(strokes.length);
        return Promise.resolve(' Flies flipped ');
      },
    };
    const read = makeReader(ctx, device);
    expect(await read([stroke('a', 'pen', [0, 10]), stroke('h', 'highlighter', [0, 5])])).toBe(
      'Flies flipped',
    );
    expect(await read([stroke('b', 'pen', [0, 10])])).toBe('Flies flipped');
    expect(downloads).toBe(1);
    expect(seen).toEqual([1, 1]);
    expect(notes[0]).toContain('one-off download');
    expect(await read([stroke('h', 'highlighter', [0, 5])])).toBe('');
  });
});
