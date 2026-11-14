import { letters, readingOrder, type FigureDoc } from './doc';
import { showsFor } from './images';
import { displayGroup, inReadingOrder, letter, type Grid } from './model';
import { plainText } from './richText';
import type { Planes } from './tiff';

const round = (v: number, places = 2) => String(Math.round(v * 10 ** places) / 10 ** places);

const count = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

const NAMES: Record<string, string> = {
  '#ffffff': 'grey',
  '#3ddc5a': 'green',
  '#ff40ff': 'magenta',
  '#ff4040': 'red',
  '#4a8cff': 'blue',
  '#30e0f0': 'cyan',
  '#ffe040': 'yellow',
};

/**
 * A plain account of how the figure was made, for a methods section or a
 * lab record: each panel's file, how it was cropped, its scale, and how its
 * channels were shown. Display settings are listed per group, as they were
 * applied: to the whole figure, a row or a column.
 */
export function methodsNote(
  doc: FigureDoc,
  planes: ReadonlyMap<string, Planes>,
  name: string,
): string {
  const lines: string[] = [`# ${name}: how it was made`, ''];
  lines.push(
    `Laid out in BenchWork at ${round(doc.width, 1)} mm wide. Images were not altered: crops, turns and display ranges are applied when drawn.`,
    '',
  );
  const shown = letters(doc);
  let n = 0;
  for (const block of readingOrder(doc.blocks)) {
    const tag = shown.get(block.id) ?? '';
    if (block.kind === 'graphic') {
      n += 1;
      const g = block.graphic;
      const trimmed = g.trim.left + g.trim.top + g.trim.right + g.trim.bottom > 0;
      lines.push(
        `## ${tag === '' ? `Part ${String(n)}` : `Panel ${tag}`}`,
        '',
        `Graph from \`${g.path}\`${g.page > 1 ? `, page ${String(g.page)}` : ''}${trimmed ? ', its edges trimmed' : ''}.`,
        '',
      );
      continue;
    }
    if (block.kind !== 'grid' || !block.grid.panels.some((p) => p.image)) continue;
    n += 1;
    lines.push(...gridNote(block.grid, planes, tag === '' ? `Part ${String(n)}` : `Panel ${tag}`));
  }
  return lines.join('\n');
}

/** How one grid of images was made. */
function gridNote(figure: Grid, planes: ReadonlyMap<string, Planes>, title: string): string[] {
  const lines: string[] = [`## ${title}`, ''];
  lines.push(`${count(figure.rows.length, 'row')} by ${count(figure.cols.length, 'column')}.`, '');
  const scope =
    figure.display.scope === 'figure'
      ? 'the same for every panel'
      : figure.display.scope === 'row'
        ? 'set for each row, the same for every panel in it'
        : 'set for each column, the same for every panel in it';
  lines.push(`Brightness and contrast were ${scope}.`, '');
  const order = inReadingOrder(figure.panels);
  order.forEach((panel, i) => {
    if (!panel.image) return;
    const image = panel.image;
    const read = planes.get(image.path);
    const tag = figure.letters.show ? letter(i, figure.letters.form) : `Image ${String(i + 1)}`;
    const parts = [`**${tag}**: \`${image.path}\``];
    const where: string[] = [];
    const rowName = plainText(figure.rowLabels[panel.row] ?? '');
    const colName = plainText(figure.colLabels[panel.col] ?? '');
    if (rowName !== '') where.push(rowName);
    if (colName !== '') where.push(colName);
    if (where.length > 0) parts.push(`(${where.join(', ')})`);
    lines.push(parts.join(' '));
    const details: string[] = [];
    if (read)
      details.push(`${String(read.width)} × ${String(read.height)} px, ${String(read.bits)}-bit`);
    const crop = image.crop;
    details.push(
      crop.zoom > 1.001
        ? `cropped to ${round(100 / crop.zoom, 1)}% of the image's shorter fit`
        : 'shown whole across the panel',
    );
    if (crop.turns > 0) details.push(`turned ${String(crop.turns * 90)}° clockwise`);
    if (crop.flip) details.push('flipped');
    if (image.umPerPx !== null) {
      details.push(`${round(image.umPerPx, 4)} µm per pixel`);
      if (panel.scaleBar) details.push(`scale bar ${String(figure.scaleBar.um)} µm`);
    }
    if (panel.inset) details.push('with a zoomed inset of the outlined region');
    lines.push(`- ${details.join('; ')}`);
    if (read) {
      const shows = showsFor(figure, panel, read, planes);
      const group = displayGroup(figure.display, panel);
      const set = figure.display.groups[group] !== undefined;
      const channels = shows.map((s, c) => {
        const name = read.rgb
          ? ['red', 'green', 'blue'][c]
          : `channel ${String(c + 1)} (${NAMES[s.colour.toLowerCase()] ?? s.colour})`;
        return s.on
          ? `${name ?? ''} ${round(s.min, 0)} to ${round(s.max, 0)}`
          : `${name ?? ''} hidden`;
      });
      lines.push(
        `- Display${set ? '' : ' (as read: zero to the figure’s brightest value)'}: ${channels.join('; ')}`,
      );
    }
    lines.push('');
  });
  return lines;
}
