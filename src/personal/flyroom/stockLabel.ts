import {
  appLink,
  isShortCode,
  newLabelDesign,
  newShortCode,
  parseLabelDesign,
  type LabelDesign,
  type ModuleContext,
} from '@core/api';
import { formatPair, parseGenotype } from './genetics';
import type { Stock } from './records';
import type { FlyStore } from './store';

const STUDIO = 'labels.studio';
const FOLDER = 'Labels';

/** The genotype as written on a vial: chromosomes left wild type at the end are dropped. */
export function labelGenotype(genotype: string): string {
  const parts = parseGenotype(genotype).map(formatPair);
  while (parts.length > 1 && parts.at(-1) === '+') parts.pop();
  return parts.join('; ');
}

/** Points to the millimetres label designs store. */
const pt = (points: number) => Math.round(((points * 25.4) / 72) * 1000) / 1000;

/**
 * A vial label: name in bold at the top, the genotype under it, the QR code
 * on the right, initials bottom left and the date bottom right. Fields in
 * braces, so the template also works for a batch of stocks.
 */
export function stockLabelDesign(
  stock: Stock,
  initials: string,
  code: string,
  paper: LabelDesign | null,
): LabelDesign {
  const base = newLabelDesign();
  const design: LabelDesign = paper
    ? {
        ...base,
        width: paper.width,
        height: paper.height,
        perFeed: paper.perFeed,
        layout: paper.layout,
        gap: paper.gap,
        offsetX: paper.offsetX,
        offsetY: paper.offsetY,
        density: paper.density,
        threshold: paper.threshold,
      }
    : base;
  const { width: w, height: h } = design;
  const qr = Math.min(11, h - 1, w / 3);
  const text = base.elements[0];
  if (!text) throw new Error('Label Studio could not start a label.');
  const element = (changes: Partial<LabelDesign['elements'][number]>) => ({
    ...text,
    id: crypto.randomUUID(),
    bold: false,
    ...changes,
  });
  const middle = w - qr - 2;
  const genotypeTop = 0.8 + pt(13) * 1.2;
  return {
    ...design,
    name: `${stock.name} vial`,
    folder: 'Fly stocks',
    savedAs: 'template',
    savedAt: new Date().toISOString(),
    data: {
      name: stock.name,
      genotype: labelGenotype(stock.genotype),
      initials,
      code,
      link: appLink('s', code),
    },
    elements: [
      element({
        text: '{name}',
        bold: true,
        align: 'center',
        x: 1,
        y: 0.8,
        width: middle - 1,
        height: pt(13) * 1.2,
        size: pt(13),
      }),
      element({
        // Long genotypes shrink and wrap so that all of it is on the label.
        text: '{genotype}',
        align: 'center',
        fit: true,
        lineSpacing: 1.1,
        x: 1,
        y: genotypeTop,
        width: middle - 1,
        height: h - genotypeTop - pt(9) * 1.2 - 0.4,
        size: pt(10),
      }),
      element({
        text: '{initials}',
        x: 1,
        y: h - pt(9) * 1.2 - 0.3,
        width: 12,
        height: pt(9) * 1.2,
        size: pt(9),
      }),
      element({
        text: '{today}',
        align: 'right',
        x: w - 20,
        y: h - pt(7) * 1.2 - 0.3,
        width: 19,
        height: pt(7) * 1.2,
        size: pt(7),
      }),
      {
        ...element({ kind: 'qr', text: '{link}' }),
        x: w - qr - 1,
        y: 0.5,
        width: qr,
        height: qr,
      },
    ],
  };
}

/**
 * Templates made before genotypes shrank to fit: the genotype gets the room
 * down to the initials and shrinks to fit it.
 */
export function fitGenotype(design: LabelDesign): LabelDesign {
  const bottom = design.height - pt(9) * 1.2 - 0.4;
  return {
    ...design,
    elements: design.elements.map((e) =>
      e.kind === 'text' && e.text === '{genotype}' && !e.fit
        ? { ...e, fit: true, lineSpacing: 1.1, height: Math.max(e.height, bottom - e.y) }
        : e,
    ),
  };
}

/**
 * Labels made before, or by hand, with the date typed in: it becomes the
 * automatic date, so a label printed today carries today.
 */
export function withTodaysDate(design: LabelDesign): LabelDesign {
  return {
    ...design,
    elements: design.elements.map((e) =>
      e.kind === 'text' && /^\s*\d{2}\/\d{2}\/\d{4}\s*$/.test(e.text)
        ? { ...e, text: '{today}' }
        : e,
    ),
  };
}

async function savedDesigns(ctx: ModuleContext): Promise<LabelDesign[]> {
  if (!(await ctx.vault.exists(FOLDER))) return [];
  const files = (await ctx.vault.listDir(FOLDER)).filter(
    (e) => !e.isDir && e.name.endsWith('.label.json'),
  );
  const designs = await Promise.all(
    files.slice(0, 2000).map(async (e) => {
      try {
        return parseLabelDesign(JSON.parse(await ctx.vault.readText(`${FOLDER}/${e.name}`)));
      } catch {
        return null;
      }
    }),
  );
  return designs.filter((d): d is LabelDesign => d !== null);
}

/**
 * A label made here goes to the phone as well, so it is there without
 * exporting a pack. Quiet: the label is saved in the vault either way.
 */
async function sendToPhone(ctx: ModuleContext, design: LabelDesign): Promise<void> {
  if (!ctx.cards.available()) return;
  try {
    await ctx.cards.put('label', design.id, design);
  } catch (err) {
    console.warn('[flyroom] This label could not be sent to the phone', design.name, err);
  }
}

/** The initials labels are signed with, asked for once and kept in settings. */
async function labelInitials(ctx: ModuleContext, store: FlyStore): Promise<string | null> {
  const kept = store.snapshot().settings.initials;
  if (kept !== '') return kept;
  const typed = await ctx.app.askText({ title: 'Your initials', label: 'Initials for labels' });
  if (typed === null || typed.trim() === '') return null;
  const initials = typed.trim().slice(0, 12);
  await store.saveInitials(initials);
  return initials;
}

/** A stock's short code, given once and kept so labels already printed keep working. */
async function stockCode(store: FlyStore, stock: Stock): Promise<string> {
  if (isShortCode(stock.code)) return stock.code;
  const code = newShortCode();
  await store.update(stock.path, { code });
  return code;
}

/** The fields a vial label fills in for one stock. */
function labelRow(stock: Stock, initials: string, code: string): Record<string, string> {
  return {
    name: stock.name,
    genotype: labelGenotype(stock.genotype),
    initials,
    code,
    link: appLink('s', code),
  };
}

/**
 * One label carrying a batch: the vial label for each stock picked, ready to
 * print as a run. The layout comes from the first stock, so every label in the
 * batch is laid out the same way.
 */
export async function makeStockLabels(
  ctx: ModuleContext,
  store: FlyStore,
  stocks: readonly Stock[],
): Promise<void> {
  const [first] = stocks;
  if (!first) throw new Error('Choose at least one stock.');
  if (stocks.length === 1) return makeStockLabel(ctx, store, first);
  if (!ctx.views.hasPageView(STUDIO))
    throw new Error('Turn on Label Studio in Settings, Modules, to make labels.');
  const initials = await labelInitials(ctx, store);
  if (initials === null) return;
  const rows = [];
  for (const stock of stocks) rows.push(labelRow(stock, initials, await stockCode(store, stock)));
  const designs = await savedDesigns(ctx);
  const paper =
    designs
      .filter((d) => d.savedAs !== 'printed')
      .sort((a, b) => (a.savedAt ?? '').localeCompare(b.savedAt ?? ''))
      .at(-1) ?? null;
  const [data] = rows;
  const design: LabelDesign = {
    ...stockLabelDesign(first, initials, rows[0]?.['code'] ?? '', paper),
    name: `Vial labels, ${String(stocks.length)} stocks`,
    ...(data ? { data } : {}),
    rows,
  };
  await ctx.vault.ensureDir(FOLDER);
  const saved = parseLabelDesign(design);
  await ctx.vault.writeText(`${FOLDER}/${design.id}.label.json`, JSON.stringify(saved, null, 2));
  await sendToPhone(ctx, saved);
  await ctx.app.openView(STUDIO, design.id);
}

/**
 * Makes a label template for a stock in Label Studio and opens it. A stock
 * that already has one opens that, with its details brought up to date.
 */
export async function makeStockLabel(
  ctx: ModuleContext,
  store: FlyStore,
  stock: Stock,
): Promise<void> {
  if (!ctx.views.hasPageView(STUDIO))
    throw new Error('Turn on Label Studio in Settings, Modules, to make labels.');
  const initials = await labelInitials(ctx, store);
  if (initials === null) return;
  const code = await stockCode(store, stock);
  const designs = await savedDesigns(ctx);
  const existing = designs.find((d) => d.data?.['code'] === code);
  const design = existing
    ? {
        ...withTodaysDate(fitGenotype(existing)),
        data: { ...existing.data, ...labelRow(stock, initials, code) },
      }
    : stockLabelDesign(
        stock,
        initials,
        code,
        designs
          .filter((d) => d.savedAs !== 'printed')
          .sort((a, b) => (a.savedAt ?? '').localeCompare(b.savedAt ?? ''))
          .at(-1) ?? null,
      );
  const path = `${FOLDER}/${design.id}.label.json`;
  await ctx.vault.ensureDir(FOLDER);
  if (existing) await ctx.vault.keepSnapshot(path);
  const saved = parseLabelDesign(design);
  await ctx.vault.writeText(path, JSON.stringify(saved, null, 2));
  await sendToPhone(ctx, saved);
  await ctx.app.openView(STUDIO, design.id);
}
