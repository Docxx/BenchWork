// @vitest-environment node
import {
  feedSize,
  copyLabelDesign,
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
  it('resolves today at print time using the local date and ignores stale imported date fields', () => {
    const template = parseLabelDesign({
      ...newLabelDesign(),
      savedAs: 'printed',
      savedAt: '2026-11-02T12:00:00Z',
    });
    expect(template.elements[0]?.text).toBe('Label text');
    expect(
      labelText(
        '{today} / {date}',
        { today: 'old', date: 'fixed date' },
        1,
        new Date(2026, 10, 3, 12),
      ),
    ).toBe('03/11/2026 / fixed date');
    expect(labelText('{today}', {}, 1, new Date(2026, 10, 4, 12))).toBe('04/11/2026');
    expect(template.savedAs).toBe('printed');
    expect(template.savedAt).toBe('2026-11-02T12:00:00Z');
  });
  it('retains element identities when loading saved labels and separates duplicate imported IDs', () => {
    const d = newLabelDesign();
    const loaded = parseLabelDesign(d);
    expect(loaded.elements[0]?.id).toBe(d.elements[0]?.id);
    const duplicate = parseLabelDesign({ ...d, elements: [d.elements[0], d.elements[0]] });
    expect(duplicate.elements[0]?.id).not.toBe(duplicate.elements[1]?.id);
  });
  it('keeps off-edge positioning and font choices when saving a named variation', () => {
    const original = newLabelDesign();
    const element = original.elements[0];
    if (!element) throw new Error('Missing title');
    original.elements[0] = { ...element, x: -2, y: -0.5, font: 'open-sans' };
    const copy = copyLabelDesign(original, 'Stock variation', 'Fly stocks');
    expect(copy.id).not.toBe(original.id);
    expect(copy.elements[0]?.id).not.toBe(element.id);
    expect(parseLabelDesign(copy)).toMatchObject({
      name: 'Stock variation',
      folder: 'Fly stocks',
      elements: [{ x: -2, y: -0.5, font: 'open-sans' }],
    });
    expect(original.name).toBe('Sample label');
    expect(() => copyLabelDesign(original, '  ')).toThrow();
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
    expect(loaded.elements[0]?.x).toBe(-50);
  });
});
