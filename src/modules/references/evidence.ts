import type { ModuleContext, NewPageContent, PageTypeSpec, PdfExcerpt } from '@core/api';

export const EVIDENCE = 'evidence';
export const READING = 'references.reading';
export type CaptureMode = 'excerpt' | 'structured' | 'linked';
export interface Capture extends PdfExcerpt {
  mode: CaptureMode;
}

export function parseCapture(param: string | null): Capture | null {
  if (!param) return null;
  try {
    const value = JSON.parse(param) as Partial<Capture>;
    return typeof value.path === 'string' &&
      typeof value.text === 'string' &&
      typeof value.highlightId === 'string' &&
      Number.isInteger(value.page) &&
      (value.page ?? 0) > 0 &&
      ['excerpt', 'structured', 'linked'].includes(value.mode ?? '')
      ? (value as Capture)
      : null;
  } catch {
    return null;
  }
}

export function evidenceType(): PageTypeSpec {
  return {
    type: EVIDENCE,
    name: 'Evidence note',
    fields: [
      { key: 'source', label: 'Source PDF', kind: 'link' },
      { key: 'page', label: 'Source page', kind: 'text' },
      { key: 'citekey', label: 'Citation key', kind: 'text' },
      { key: 'related', label: 'Research links', kind: 'links' },
      { key: 'tags', label: 'Tags', kind: 'list' },
    ],
  };
}

export function evidenceContent(
  capture: Capture,
  comment: string,
  citekey: string,
  links: string[],
  hash: string,
): NewPageContent {
  const source = `[[${capture.path}#page=${String(capture.page)}]]`;
  const body = [
    source,
    citekey ? `[@${citekey}]` : '',
    '',
    ...capture.text.split('\n').map((line) => `> ${line}`),
    '',
    '## Notes',
    '',
    comment.trim(),
    '',
    ...(capture.mode === 'structured'
      ? ['## Main finding', '', '## Methods and limitations', '', '## Relevance to my research', '']
      : []),
  ].join('\n');
  return {
    properties: {
      source,
      page: String(capture.page),
      highlightId: capture.highlightId,
      sourceSha256: hash,
      excerpt: capture.text,
      citekey,
      related: links.map((p) => `[[${p}]]`),
    },
    body,
  };
}

export async function saveEvidence(
  ctx: ModuleContext,
  capture: Capture,
  title: string,
  comment: string,
  citekey: string,
  links: string[],
): Promise<string | null> {
  if (!title.trim() || !capture.text.trim())
    throw new Error('Add a title and select some source text.');
  const hash = await ctx.vault.hashFile(capture.path);
  const folder = 'Research/Evidence';
  await ctx.vault.ensureDir(folder);
  return ctx.app.createPage(
    folder,
    title.trim(),
    EVIDENCE,
    evidenceContent(capture, comment, citekey, links, hash),
  );
}
