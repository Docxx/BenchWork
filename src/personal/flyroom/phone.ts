/**
 * Stocks on the phone: each stock with a label code is sent to the relay as a
 * readable card, so scanning its vial shows the stock in the label app. Only
 * what belongs on a vial goes, and a stock without a code is never sent.
 */
import { isShortCode, type ModuleContext } from '@core/api';
import { stockCentrePage, referenceLink } from './links';
import type { Stock } from './records';

/** A stock as the phone shows it. Kept small: a phone screen, not the vault. */
export interface StockCard {
  code: string;
  name: string;
  genotype: string;
  source: string;
  number: string;
  flybase: string;
  /** The stock centre's own page, worked out here so the phone need not know the centres. */
  centre: { centre: string; url: string } | null;
  status: string;
  location: string;
  flipEvery: number | null;
  lastFlipped: string;
  notes: string;
  reference: string;
  /** The reference as a link, where it holds a DOI or an address. */
  referenceUrl: string | null;
  /** When this card was made, so the phone can say how fresh it is. */
  sent: string;
}

export function stockCard(stock: Stock, now = new Date()): StockCard {
  return {
    code: stock.code,
    name: stock.name,
    genotype: stock.genotype,
    source: stock.source,
    number: stock.number,
    flybase: stock.flybase,
    centre: stockCentrePage(stock.source, stock.number),
    status: stock.status,
    location: stock.location,
    flipEvery: stock.flipEvery,
    lastFlipped: stock.lastFlipped,
    notes: stock.notes,
    reference: stock.reference,
    referenceUrl: referenceLink(stock.reference),
    sent: now.toISOString().slice(0, 10),
  };
}

/**
 * Sends these stocks to the phone, quietly. Stocks without a label code have
 * no vial to scan, so they are skipped. A relay that is not set up, or not
 * answering, is not worth interrupting the person's work for.
 */
export async function sendStocks(ctx: ModuleContext, stocks: readonly Stock[]): Promise<number> {
  if (!ctx.cards.available()) return 0;
  let sent = 0;
  for (const stock of stocks) {
    if (!isShortCode(stock.code)) continue;
    try {
      await ctx.cards.put('stock', stock.code, stockCard(stock));
      sent += 1;
    } catch (err) {
      console.warn('[flyroom] A stock could not be sent to the phone', stock.name, err);
    }
  }
  return sent;
}
