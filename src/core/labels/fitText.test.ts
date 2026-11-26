// @vitest-environment node
import { fitText, MIN_TEXT_MM, wrapText } from './fitText';

/** Each character is 0.55 of the text size wide, like a typical sans serif. */
const measure = (s: string, size: number) => s.length * size * 0.55;

describe('text that shrinks to fit', () => {
  it('wraps at spaces and keeps typed line breaks', () => {
    expect(wrapText('a bb ccc', 5, (s) => s.length)).toEqual(['a bb', 'ccc']);
    expect(wrapText('one\ntwo', 100, (s) => s.length)).toEqual(['one', 'two']);
  });
  it('keeps short text at its size on one line', () => {
    expect(fitText('OreR', { width: 30, height: 5 }, 3.5, 1.1, measure)).toEqual({
      size: 3.5,
      lines: ['OreR'],
    });
  });
  it('puts a long genotype all on the label, smaller and wrapped', () => {
    const text = 'Dipt2.2-lacZ, Drs-GFP, y w; Dif cn bw';
    const box = { width: 34, height: 4.5 };
    const fitted = fitText(text, box, 3.5, 1.1, measure);
    expect(fitted.size).toBeLessThan(3.5);
    expect(fitted.lines.join(' ')).toBe(text);
    for (const line of fitted.lines) expect(measure(line, fitted.size)).toBeLessThanOrEqual(34);
    expect((fitted.lines.length - 1) * fitted.size * 1.1 + fitted.size).toBeLessThanOrEqual(4.5);
  });
  it('stops at the smallest size rather than vanishing', () => {
    const fitted = fitText('x'.repeat(500), { width: 5, height: 1 }, 3, 1.2, measure);
    expect(fitted.size).toBe(MIN_TEXT_MM);
  });
});
