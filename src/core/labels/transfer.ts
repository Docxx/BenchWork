import { parseLabelDesign, type LabelDesign } from './model';

export const LABEL_PACK_LIMIT = 25 * 1024 * 1024;
export function labelPack(labels: readonly LabelDesign[]): string {
  if (!labels.length || labels.length > 100)
    throw new Error('Choose between 1 and 100 labels per pack.');
  const text = JSON.stringify({
    format: 'benchwork-label-pack',
    version: 1,
    labels: labels.map(parseLabelDesign),
  });
  if (new TextEncoder().encode(text).length > LABEL_PACK_LIMIT)
    throw new Error('This pack exceeds 25 MB. Export fewer labels or smaller images.');
  return text;
}

/** Imported copies have new IDs, so a pack can never overwrite a local label. */
export function unpackLabels(text: string, paper?: LabelDesign): LabelDesign[] {
  if (new TextEncoder().encode(text).length > LABEL_PACK_LIMIT)
    throw new Error('Choose a label pack below 25 MB.');
  const raw: unknown = JSON.parse(text);
  const pack = raw as { format?: unknown; version?: unknown; labels?: unknown } | null;
  let values: unknown[];
  if (pack?.format === 'benchwork-label-pack') {
    if (
      pack.version !== 1 ||
      !Array.isArray(pack.labels) ||
      !pack.labels.length ||
      pack.labels.length > 100
    )
      throw new Error('This is not a supported label pack.');
    values = pack.labels;
  } else values = [raw];
  return values.map((value) => {
    const d = parseLabelDesign(value);
    const matching =
      paper &&
      d.width === paper.width &&
      d.height === paper.height &&
      d.perFeed === paper.perFeed &&
      d.layout === paper.layout &&
      d.gap === paper.gap;
    return {
      ...d,
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      ...(matching
        ? { offsetX: paper.offsetX, offsetY: paper.offsetY, density: paper.density }
        : {}),
    };
  });
}
