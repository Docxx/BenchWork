import { asText } from './kinds';

/**
 * Flip reminders. A fly stock with "flip every N days" is due N days after
 * it was last flipped. The due flips are kept as checklist lines in one
 * page, `Inventory/Flips due.md`, so they show with other tasks, sync like
 * any page, and read as a plain list anywhere. Ticking one records the flip
 * on the stock, and its next flip takes the line's place.
 */

export const FLIPS_PAGE = 'Inventory/Flips due.md';

export interface FlipStock {
  /** The stock's name, as `[[name]]` links to it. */
  name: string;
  flipEvery: number | null;
  /** `YYYY-MM-DD`, or null if never. */
  lastFlipped: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A stock's flip details from its record's values. */
export function flipStock(name: string, data: Record<string, unknown>): FlipStock {
  const every = Number(asText(data['flipEvery']));
  const last = asText(data['lastFlipped']).slice(0, 10);
  return {
    name,
    flipEvery: Number.isFinite(every) && every > 0 ? Math.round(every) : null,
    lastFlipped: DAY.test(last) ? last : null,
  };
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** When a stock is next due to be flipped; today if never flipped; null if it is not flipped. */
export function nextFlip(stock: FlipStock, today: string): string | null {
  if (stock.flipEvery === null) return null;
  return stock.lastFlipped === null ? today : addDays(stock.lastFlipped, stock.flipEvery);
}

/** The flips page's text: every stock that is flipped, soonest first. */
export function flipsPage(stocks: readonly FlipStock[], today: string): string {
  const due = stocks
    .map((s) => ({ name: s.name, next: nextFlip(s, today) }))
    .filter((s): s is { name: string; next: string } => s.next !== null)
    .sort((a, b) => a.next.localeCompare(b.next) || a.name.localeCompare(b.name));
  const lines = [
    '# Flips due',
    '',
    'Kept by the Inventory module from your fly stocks. Tick a flip when it is done, and the next one takes its place.',
    '',
    ...(due.length === 0
      ? ['No stocks are set to be flipped. Give a fly stock a number of days in "Flip every".']
      : due.map((s) => `- [ ] Flip [[${s.name}]] 📅 ${s.next}`)),
    '',
  ];
  return lines.join('\n');
}

/** The stocks ticked as flipped in the page's text. */
export function tickedFlips(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/^\s*[-*+]\s+\[[xX]\]\s+Flip \[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/gm)) {
    const name = m[1]?.trim();
    if (name) names.push(name);
  }
  return names;
}
