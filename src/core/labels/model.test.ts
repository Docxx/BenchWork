// @vitest-environment node
import {
  feedSize,
  labelBatches,
  labelText,
  newLabelDesign,
  newLabelOnPaper,
  newLabelElement,
  parseLabelDesign,
} from './model';
describe('label geometry and portable templates', () => {
  it('keeps the chosen paper and phone calibration when starting a fresh design', () => {
    const prior = { ...newLabelDesign(), offsetY: 1.25, gap: 0.5 };
    const fresh = newLabelOnPaper(prior);
    expect(fresh).toMatchObject({ width: 50, height: 15, perFeed: 2, offsetY: 1.25, gap: 0.5 });
    expect(fresh.id).not.toBe(prior.id);
    expect(fresh.elements[0]?.id).not.toBe(prior.elements[0]?.id);
  });
  it('retains the physically verified stacked-pair calibration', () => {
    const d = newLabelDesign();
    expect(feedSize(d)).toEqual({ width: 50, height: 30 });
    expect(d.offsetY).toBe(-0.75);
    expect(parseLabelDesign(d)).toMatchObject({
      width: 50,
      height: 15,
      perFeed: 2,
      gap: 0,
      offsetY: -0.75,
    });
  });
  it('refuses arrangements wider than the printhead instead of clipping them', () => {
    expect(() => feedSize({ ...newLabelDesign(), layout: 'across' })).toThrow('wider');
    expect(feedSize({ ...newLabelDesign(), layout: 'across', width: 25, gap: 2 })).toEqual({
      width: 52,
      height: 15,
    });
  });
  it('preserves odd batches with one unused label, without adding an extra copy', () => {
    const rows = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    expect(labelBatches(rows, 99, 2)).toEqual([[rows[0], rows[1]], [rows[2]]]);
    expect(labelBatches([], 3, 2).flat()).toHaveLength(3);
    expect(() => labelBatches([], 0, 2)).toThrow();
    expect(() => labelBatches([], 501, 2)).toThrow();
  });
  it('treats field substitutions as plain data, including spreadsheet headings with spaces', () => {
    expect(
      labelText('{Sample ID} {n} {missing}', { 'Sample ID': 'A<script>', n: 'wrong' }, 7),
    ).toBe('A<script> 7 {missing}');
  });
  it('rejects active image sources and bounds imported geometry and layer count', () => {
    const d = newLabelDesign();
    expect(() =>
      parseLabelDesign({
        ...d,
        elements: [{ ...newLabelElement('image'), image: 'https://example.com/tracker.png' }],
      }),
    ).toThrow('embedded');
    expect(() =>
      parseLabelDesign({
        ...d,
        elements: [{ ...newLabelElement('image'), image: 'data:image/svg+xml;base64,PHN2Zz4=' }],
      }),
    ).toThrow();
    const loaded = parseLabelDesign({
      ...d,
      width: 1000,
      offsetY: Infinity,
      elements: Array.from({ length: 110 }, () => ({ ...newLabelElement('text'), x: -50 })),
    });
    expect(loaded.width).toBe(72);
    expect(loaded.offsetY).toBe(-0.75);
    expect(loaded.elements).toHaveLength(100);
    expect(loaded.elements[0]?.x).toBe(0);
  });
});
