// @vitest-environment node
import { readStock } from './records';
import { fitGenotype, labelGenotype, stockLabelDesign } from './stockLabel';

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

describe('long genotypes', () => {
  it('shrink to fit in new and older stock labels', () => {
    const stock = readStock('Fly room/Stocks/Dipt.flystock.yaml', {
      genotype: 'Dipt2.2-lacZ, Drs-GFP, y w ; Dif cn bw ; + ; +',
    });
    const fresh = stockLabelDesign(stock, 'RP', 'K7M2Q9XA', null);
    const genotype = fresh.elements.find((e) => e.text === '{genotype}');
    expect(genotype?.fit).toBe(true);
    expect(genotype?.height).toBeGreaterThan(4);
    expect(fresh.data?.['genotype']).toBe('Dipt2.2-lacZ, Drs-GFP, y w; Dif cn bw');

    const older = {
      ...fresh,
      elements: fresh.elements.map((e) =>
        e.text === '{genotype}' ? { ...e, fit: false, height: 4 } : e,
      ),
    };
    const upgraded = fitGenotype(older).elements.find((e) => e.text === '{genotype}');
    expect(upgraded?.fit).toBe(true);
    expect(upgraded?.height).toBeCloseTo(genotype?.height ?? 0, 1);
  });
});
