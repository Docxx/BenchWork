// @vitest-environment node
import { parseRich, plainText } from './richText';

const shape = (text: string) =>
  parseRich(text).map((r) => [r.text, r.italic ? 'i' : '', r.bold ? 'b' : '', r.shift].join('|'));

describe('rich labels', () => {
  it('reads italics, bold, raised and lowered text', () => {
    expect(shape('*elav*>*Myd88^KO^*')).toEqual([
      'elav|i||none',
      '>|||none',
      'Myd88|i||none',
      'KO|i||sup',
    ]);
    expect(shape('**A** CO~2~')).toEqual(['A||b|none', ' CO|||none', '2|||sub']);
  });

  it('keeps a marker with nothing to close it, and an escaped one, as typed', () => {
    expect(plainText('5 * 3')).toBe('5 * 3');
    expect(plainText('a^b')).toBe('a^b');
    expect(plainText('\\*not italic\\*')).toBe('*not italic*');
    expect(shape('w*')).toEqual(['w*|||none']);
  });

  it('gives the plain text for search', () => {
    expect(plainText('*w*; *Sco*/*CyO*')).toBe('w; Sco/CyO');
  });
});
