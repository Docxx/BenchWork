/**
 * Searching Europe PMC (www.ebi.ac.uk/europepmc), which covers PubMed, PMC
 * and preprints from bioRxiv, medRxiv and others. No key is needed.
 */

export const SEARCH_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

/** Papers fetched for a topic at a time. */
export const PAGE_SIZE = 25;
/** How far back a topic looks, in days. */
export const DAYS = 30;

export interface Topic {
  id: string;
  name: string;
  /** Search words, as Europe PMC reads them: AND, OR, NOT and "quotes". */
  query: string;
  preprints: boolean;
}

export interface Paper {
  /** Europe PMC's source and id, such as `MED/42822610`. */
  key: string;
  title: string;
  authors: string;
  journal: string;
  /** `YYYY-MM-DD`, when it was first published. */
  date: string;
  doi: string | null;
  abstract: string;
  /** The paper's page on Europe PMC, which links to the full text where there is one. */
  url: string;
  preprint: boolean;
  openAccess: boolean;
}

function day(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The search for a topic's papers from the last DAYS days, newest first. */
export function searchUrl(topic: Topic, now: Date): string {
  const from = new Date(now);
  from.setDate(from.getDate() - DAYS);
  const query = [
    `(${topic.query.trim()})`,
    `FIRST_PDATE:[${day(from)} TO ${day(now)}]`,
    ...(topic.preprints ? [] : ['NOT SRC:PPR']),
  ].join(' AND ');
  const params = new URLSearchParams({
    query,
    format: 'json',
    resultType: 'core',
    pageSize: String(PAGE_SIZE),
    sort: 'FIRST_PDATE_D desc',
  });
  return `${SEARCH_URL}?${params.toString()}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** HTML tags only, so `p < 0.05 and q > 1` in the text is left alone. */
const TAG = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi;

/**
 * Plain text from Europe PMC's bits of HTML, such as `<i>CCNF</i>` and
 * `<h4>Background</h4>`. Some titles have their tags written out as
 * `&lt;i&gt;`, so those are read as tags too.
 */
export function plain(html: string): string {
  return html
    .replace(/&lt;(\/?(?:i|b|em|strong|sup|sub|u|sc|h\d|p|br)\s*\/?)&gt;/gi, '<$1>')
    .replace(/<\/(h\d|p|div)>/gi, '\n')
    .replace(/<h\d[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(TAG, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Papers from a search's JSON. Throws with a plain message if it is not one. */
export function parseResults(json: string): Paper[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Europe PMC sent something that could not be read.');
  }
  if (!isRecord(data)) throw new Error('Europe PMC sent something that could not be read.');
  if (typeof data['errMsg'] === 'string') throw new Error(`Europe PMC: ${data['errMsg']}`);
  const list = isRecord(data['resultList']) ? data['resultList']['result'] : null;
  if (!Array.isArray(list)) return [];
  const papers: Paper[] = [];
  for (const raw of list) {
    if (!isRecord(raw)) continue;
    const id = text(raw['id']);
    const source = text(raw['source']);
    const title = plain(text(raw['title'])).replace(/\.$/, '');
    if (id === '' || source === '' || title === '') continue;
    const journalInfo = isRecord(raw['journalInfo']) ? raw['journalInfo'] : {};
    const journal = isRecord(journalInfo['journal']) ? text(journalInfo['journal']['title']) : '';
    const publisher = isRecord(raw['bookOrReportDetails'])
      ? text(raw['bookOrReportDetails']['publisher'])
      : '';
    const doi = text(raw['doi']);
    papers.push({
      key: `${source}/${id}`,
      title,
      authors: plain(text(raw['authorString'])).replace(/\.$/, ''),
      journal:
        journal !== ''
          ? journal
          : publisher !== ''
            ? publisher
            : source === 'PPR'
              ? 'Preprint'
              : '',
      date: text(raw['firstPublicationDate']),
      doi: doi === '' ? null : doi,
      abstract: plain(text(raw['abstractText'])),
      url: `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
      preprint: source === 'PPR',
      openAccess: raw['isOpenAccess'] === 'Y',
    });
  }
  return papers;
}

/** "Smith J, Jones K, et al." for a long author list. */
export function shortAuthors(authors: string, most = 3): string {
  const names = authors.split(/,\s*/).filter((n) => n !== '');
  return names.length <= most ? names.join(', ') : `${names.slice(0, most).join(', ')}, et al.`;
}
