import type { ModuleContext, NewPageContent, PageTypeSpec } from '@core/api';

/**
 * Protocols: pages of type `protocol` with a version, a status and a link
 * to the version they replace. A new version is a copy that supersedes the
 * old one; the old page is kept, only marked Retired.
 */

export const PROTOCOL = 'protocol';
export const STATUSES = ['Draft', 'In use', 'Retired'];

const STARTER = [
  '## Purpose',
  '',
  '## Materials',
  '',
  '- First item',
  '',
  '## Steps',
  '',
  '1. First step',
  '',
  '## Notes',
  '',
].join('\n');

export function protocolType(): PageTypeSpec {
  return {
    type: PROTOCOL,
    name: 'Protocol',
    fields: [
      { key: 'version', label: 'Version', kind: 'text' },
      { key: 'status', label: 'Status', kind: 'choice', options: STATUSES },
      { key: 'supersedes', label: 'Supersedes', kind: 'link', linkType: PROTOCOL },
    ],
    create: () => ({ properties: { version: '1', status: 'Draft' }, body: STARTER }),
  };
}

/** `LPS feeding v3` with version 3 becomes `LPS feeding v4`; others gain ` v2`. */
export function nextVersion(title: string, version: unknown): { title: string; version: string } {
  const current =
    typeof version === 'number'
      ? version
      : Number.parseInt(typeof version === 'string' ? version : '', 10);
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 2;
  const base = title.replace(/\s+v\d+$/i, '');
  return { title: `${base} v${String(next)}`, version: String(next) };
}

/** A page's text after its frontmatter. */
export function bodyOf(text: string): string {
  const m = /^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/** What a new version starts with: the old one's text, version up, linked back. */
export function versionContent(
  body: string,
  version: string,
  oldTarget: string,
  oldProperties: Record<string, unknown>,
): NewPageContent {
  const properties: Record<string, unknown> = {
    version,
    status: 'Draft',
    supersedes: `[[${oldTarget}]]`,
  };
  if (Array.isArray(oldProperties['tags'])) properties['tags'] = oldProperties['tags'];
  return { properties, body };
}

function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function titleOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
}

/** Makes a new version of the open protocol beside it, and retires the old one. */
export async function newVersion(ctx: ModuleContext): Promise<void> {
  const path = ctx.app.openPage();
  const props = path === null ? null : await ctx.app.pageProperties(path);
  if (path === null || props?.['type'] !== PROTOCOL) {
    ctx.app.notify('Open a protocol first, then choose New version of this protocol.');
    return;
  }
  const next = nextVersion(titleOf(path), props['version']);
  const body = bodyOf(await ctx.vault.readText(path));
  const content = versionContent(body, next.version, await ctx.app.linkTarget(path), props);
  const made = await ctx.app.createPage(folderOf(path), next.title, PROTOCOL, content);
  if (made === null) return;
  await ctx.app.setPageProperties(path, { status: 'Retired' });
  ctx.app.notify(`Made ${next.title}. ${titleOf(path)} is marked Retired and kept as it was.`);
}

/** Asks for a name and makes a protocol in `folder`. */
export async function newProtocol(ctx: ModuleContext, folder: string | null): Promise<void> {
  if (folder === null) {
    ctx.app.notify('Choose New protocol from a notebook or section menu.');
    return;
  }
  const name = await ctx.app.askText({ title: 'New protocol', label: 'Protocol name' });
  if (name === null || name.trim() === '') return;
  await ctx.app.createPage(folder, name.trim(), PROTOCOL);
}
