import { freeName } from '../notebooks/notebookService';
import { isPage, PAGE_EXTENSION, pageTitle } from '../notebooks/notebookTree';
import { baseName, joinVaultPath, type PlatformAdapter } from '../platform';
import { localTimestamp, parsePage, serialisePage, updateMeta } from './frontmatter';

/**
 * Templates are ordinary pages in `templates/` at the vault root. Their
 * placeholders follow Obsidian, so the same templates work in both:
 * `{{title}}`, `{{date}}`, `{{time}}`, `{{weekday}}` and `{{date:FORMAT}}`.
 */

export const TEMPLATES_DIR = 'templates';
/** New daily pages start from this template if it exists. */
export const DAILY_TEMPLATE = joinVaultPath(TEMPLATES_DIR, `Daily${PAGE_EXTENSION}`);

export interface TemplateRef {
  path: string;
  title: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Formats a date with the usual letters: YYYY MMMM MMM MM M DD D dddd ddd
 * HH mm. Text in square brackets is kept as it is: `[Week of] D MMMM`.
 */
export function formatDate(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MMMM: MONTHS[date.getMonth()] ?? '',
    MMM: (MONTHS[date.getMonth()] ?? '').slice(0, 3),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
    dddd: DAYS[date.getDay()] ?? '',
    ddd: (DAYS[date.getDay()] ?? '').slice(0, 3),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
  };
  return format.replace(
    /\[([^\]]*)\]|YYYY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|mm/g,
    (t, kept?: string) => kept ?? tokens[t] ?? t,
  );
}

export interface FillValues {
  title: string;
  /** The date placeholders show; for daily pages, that day. */
  date: Date;
  /** The time `{{time}}` shows. */
  now: Date;
}

/** Fills in the placeholders. Unknown ones are left as they are. */
export function fillPlaceholders(text: string, values: FillValues): string {
  return text.replace(
    /\{\{\s*(\w+)\s*(?::([^}]*))?\}\}/g,
    (whole, name: string, format?: string) => {
      switch (name.toLowerCase()) {
        case 'title':
          return values.title;
        case 'date':
          return formatDate(values.date, format?.trim() || 'YYYY-MM-DD');
        case 'time':
          return formatDate(values.now, format?.trim() || 'HH:mm');
        case 'weekday':
          return formatDate(values.date, 'dddd');
        default:
          return whole;
      }
    },
  );
}

/**
 * A new page's text from a template: placeholders filled, the template's
 * frontmatter kept, and a fresh `id` and `created`. If the template's
 * frontmatter cannot be read, only its body is used.
 */
export function pageFromTemplate(
  template: string,
  values: FillValues,
  id: string,
  created: string = localTimestamp(values.now),
): string {
  const page = parsePage(fillPlaceholders(template, values));
  const base = page.error === null ? page : parsePage(page.body);
  const filled = updateMeta(base, { id, created, modified: null });
  return serialisePage(filled);
}

/** A template's body with placeholders filled, for inserting into a page. */
export function templateBody(template: string, values: FillValues): string {
  return parsePage(fillPlaceholders(template, values)).body.replace(/^(\r?\n)+/, '');
}

/** Every template, by title. */
export async function listTemplates(platform: PlatformAdapter): Promise<TemplateRef[]> {
  if (!(await platform.exists(TEMPLATES_DIR))) return [];
  return (await platform.listDir(TEMPLATES_DIR))
    .filter((e) => !e.isDir && isPage(e.name) && !e.name.startsWith('.'))
    .map((e) => ({ path: e.path, title: pageTitle(e.name) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Saves a page's text as a new template named after it: its own `id`,
 * `created` and `modified` are left out, so pages made from it get their
 * own. Never overwrites. Returns the template's path.
 */
export async function saveAsTemplate(platform: PlatformAdapter, pagePath: string): Promise<string> {
  const page = parsePage(await platform.readText(pagePath));
  const kept =
    page.error === null ? updateMeta(page, { id: null, created: null, modified: null }) : null;
  // No other keys left: no frontmatter block at all.
  const text = kept === null || (kept.yaml ?? '').trim() === '' ? page.body : serialisePage(kept);
  await platform.ensureDir(TEMPLATES_DIR);
  const name = await freeName(
    platform,
    TEMPLATES_DIR,
    pageTitle(baseName(pagePath)),
    PAGE_EXTENSION,
  );
  const path = joinVaultPath(TEMPLATES_DIR, name);
  await platform.createNew(path, text);
  return path;
}
