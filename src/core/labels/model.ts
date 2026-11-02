export type LabelKind = 'text' | 'qr' | 'barcode' | 'image' | 'box' | 'line';
export interface LabelElement {
  id: string;
  kind: LabelKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  font: 'sans' | 'serif' | 'mono';
  size: number;
  bold: boolean;
  align: 'left' | 'center' | 'right';
  rotation: 0 | 90 | 180 | 270;
  image: string;
}
export interface LabelDesign {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  perFeed: 1 | 2;
  layout: 'stacked' | 'across';
  gap: number;
  offsetX: number;
  offsetY: number;
  density: number;
  threshold: number;
  elements: LabelElement[];
}
export type LabelRow = Record<string, string>;
const n = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, fallback = '', max = 2000) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
export function newLabelElement(kind: LabelKind): LabelElement {
  return {
    id: crypto.randomUUID(),
    kind,
    x: 2,
    y: 2,
    width: kind === 'qr' ? 10 : 40,
    height: kind === 'qr' ? 10 : 5,
    text: kind === 'qr' || kind === 'barcode' ? '{id}' : '{name}',
    font: 'sans',
    size: 2.5,
    bold: false,
    align: 'left',
    rotation: 0,
    image: '',
  };
}
export function newLabelDesign(): LabelDesign {
  const title = { ...newLabelElement('text'), text: '{name}', bold: true, width: 45 };
  const detail = { ...newLabelElement('text'), y: 8, text: '{id}   {date}', width: 45, size: 1.8 };
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: 'Sample label',
    width: 50,
    height: 15,
    perFeed: 2,
    layout: 'stacked',
    gap: 0,
    offsetX: 0,
    offsetY: -0.75,
    density: 2,
    threshold: 180,
    elements: [title, detail],
  };
}
/** Start a fresh design using the paper and calibration already selected. */
export function newLabelOnPaper(paper: LabelDesign): LabelDesign {
  const { width, height, perFeed, layout, gap, offsetX, offsetY, density, threshold } = paper;
  return {
    ...newLabelDesign(),
    width,
    height,
    perFeed,
    layout,
    gap,
    offsetX,
    offsetY,
    density,
    threshold,
  };
}

/** Whitelist imported fields. Templates contain data, never executable markup. */
export function parseLabelDesign(value: unknown): LabelDesign {
  const r = obj(value);
  if (r['version'] !== 1) throw new Error('This is not a supported BenchWork label file.');
  const base = newLabelDesign();
  const width = n(r['width'], 50, 5, 72),
    height = n(r['height'], 15, 5, 150);
  const elements = Array.isArray(r['elements'])
    ? r['elements'].slice(0, 100).map((value) => {
        const e = obj(value),
          kind = e['kind'];
        if (!['text', 'qr', 'barcode', 'image', 'box', 'line'].includes(String(kind)))
          throw new Error('Unknown label element.');
        const k = kind as LabelKind;
        const image = str(e['image'], '', 750000);
        if (image && !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(image))
          throw new Error('Only embedded PNG, JPEG and WebP images are supported.');
        return {
          ...newLabelElement(k),
          x: n(e['x'], 2, 0, width),
          y: n(e['y'], 2, 0, height),
          width: n(e['width'], 10, 0.2, width),
          height: n(e['height'], 5, 0.2, height),
          text: str(e['text']),
          image,
          size: n(e['size'], 2.5, 0.8, 20),
          bold: e['bold'] === true,
          font: e['font'] === 'serif' || e['font'] === 'mono' ? e['font'] : 'sans',
          align: e['align'] === 'center' || e['align'] === 'right' ? e['align'] : 'left',
          rotation: [90, 180, 270].includes(Number(e['rotation']))
            ? (e['rotation'] as 90 | 180 | 270)
            : 0,
        } satisfies LabelElement;
      })
    : [];
  return {
    ...base,
    id: /^[a-f0-9-]{36}$/i.test(str(r['id'])) ? str(r['id']) : base.id,
    name: str(r['name'], 'Label', 100),
    width,
    height,
    perFeed: r['perFeed'] === 1 ? 1 : 2,
    layout: r['layout'] === 'across' ? 'across' : 'stacked',
    gap: n(r['gap'], 0, 0, 10),
    offsetX: n(r['offsetX'], 0, -10, 10),
    offsetY: n(r['offsetY'], -0.75, -10, 10),
    density: Math.round(n(r['density'], 2, 1, 5)),
    threshold: Math.round(n(r['threshold'], 180, 1, 254)),
    elements,
  };
}
export function labelText(text: string, row: LabelRow, sequence: number): string {
  return text.replace(/\{([^{}]+)\}/g, (_, key: string) =>
    key === 'n' ? String(sequence) : Object.hasOwn(row, key) ? (row[key] ?? '') : `{${key}}`,
  );
}
export function feedSize(d: LabelDesign): { width: number; height: number } {
  const width = d.layout === 'across' ? d.width * d.perFeed + d.gap * (d.perFeed - 1) : d.width;
  const height = d.layout === 'stacked' ? d.height * d.perFeed + d.gap * (d.perFeed - 1) : d.height;
  if (width > 72)
    throw new Error(
      'This arrangement is wider than the B3S printhead. Choose stacked labels or reduce the width.',
    );
  return { width, height };
}
export function labelBatches(
  rows: readonly LabelRow[],
  copies: number,
  perFeed: number,
): LabelRow[][] {
  if (perFeed !== 1 && perFeed !== 2)
    throw new Error('Choose one or two labels per feed position.');
  if (!Number.isInteger(copies) || copies < 1 || copies > 500 || rows.length > 500)
    throw new Error('Choose between 1 and 500 labels per job.');
  const labels = rows.length ? rows : Array.from({ length: copies }, () => ({}));
  return Array.from({ length: Math.ceil(labels.length / perFeed) }, (_, i) =>
    labels.slice(i * perFeed, (i + 1) * perFeed),
  );
}
