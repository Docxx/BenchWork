import type { TableData } from '../files/csv';
import { fileKind, kindLabel } from '../files/fileKinds';
import { baseName } from '../platform';
import { recordName } from '../records/records';

/**
 * `![[Data/day7.csv]]` and other embedded files that are not images: a card
 * with the file's name and kind, and for tables the first few rows.
 * Clicking it opens the file, as clicking a link does.
 */

/** Rows a table embed shows, the header included. */
export const EMBED_ROWS = 6;

/** Loads the first rows of an embedded table; null if it cannot be read. */
export type TableLoader = (target: string) => Promise<TableData | null>;

/** Files embeds show as a card, rather than a link chip. */
export function isFileEmbed(target: string): boolean {
  const kind = fileKind(target.split('#')[0] ?? '');
  return kind === 'table' || kind === 'spreadsheet' || kind === 'pdf' || kind === 'link';
}

function cell(tag: 'th' | 'td', text: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function tableElement(table: TableData): HTMLElement {
  const el = document.createElement('table');
  const [head, ...body] = table.rows;
  if (head) {
    const row = document.createElement('tr');
    row.append(...head.map((c) => cell('th', c)));
    el.append(row);
  }
  for (const r of body) {
    const row = document.createElement('tr');
    row.append(...r.map((c) => cell('td', c)));
    el.append(row);
  }
  return el;
}

export function fileEmbedElement(
  target: string,
  alias: string | null,
  loadTable: TableLoader | null,
): { dom: HTMLElement; destroy: () => void } {
  const path = target.split('#')[0] ?? target;
  const kind = fileKind(path);
  const card = document.createElement('span');
  card.className = `file-embed ${kind}`;
  card.dataset['wikiLink'] = '';
  card.dataset['target'] = target;
  card.dataset['embed'] = '';
  card.title = target;
  card.contentEditable = 'false';

  const head = document.createElement('span');
  head.className = 'file-embed-head';
  const name = document.createElement('span');
  name.className = 'file-embed-name';
  name.textContent = alias ?? (kind === 'link' ? recordName(path) : baseName(path));
  const label = document.createElement('span');
  label.className = 'file-embed-kind';
  label.textContent = kindLabel(path);
  head.append(name, label);
  card.append(head);

  let live = true;
  if (loadTable !== null && (kind === 'table' || kind === 'spreadsheet')) {
    const rows = document.createElement('span');
    rows.className = 'file-embed-rows';
    card.append(rows);
    void loadTable(target).then(
      (table) => {
        if (!live || table === null || table.rows.length === 0) return;
        rows.append(tableElement(table));
        if (table.total > table.rows.length) {
          const more = document.createElement('span');
          more.className = 'file-embed-more';
          more.textContent = `${(table.total - table.rows.length).toLocaleString('en-GB')} more rows`;
          rows.append(more);
        }
      },
      () => undefined,
    );
  }
  return {
    dom: card,
    destroy: () => {
      live = false;
    },
  };
}
