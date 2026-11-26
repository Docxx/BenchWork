// @vitest-environment node
import { readStock } from './records';
import { labelGenotype, stockLabelDesign } from './stockLabel';

describe('stock labels', () => {
  it('writes the genotype as on a vial, without wild-type chromosomes at the end', () => {
    expect(labelGenotype('+ ; Sco/CyO ; TM3/TM6 ; +')).toBe('+; Sco/CyO; TM3/TM6');
    expect(labelGenotype('w ; + ; + ; +')).toBe('w');
  });
  it('lays out name, genotype, initials, date and QR link like a vial label', () => {
    const stock = readStock('Fly room/Stocks/OreR.flystock.yaml', { genotype: '+ ; + ; + ; +' });
    const d = stockLabelDesign(stock, 'RP', 'K7M2Q9XA', null);
    expect(d.data).toMatchObject({ name: 'OreR', initials: 'RP', link: 'benchwork://s/K7M2Q9XA' });
    expect(d.elements.map((e) => e.text)).toEqual([
      '{name}',
      '{genotype}',
      '{initials}',
      '{today}',
      '{link}',
    ]);
    const qr = d.elements.find((e) => e.kind === 'qr');
    expect(qr?.width).toBe(11);
    // Everything stays on the label.
    for (const e of d.elements) {
      expect(e.x + e.width).toBeLessThanOrEqual(d.width);
      expect(e.y + e.height).toBeLessThanOrEqual(d.height);
    }
  });
});
