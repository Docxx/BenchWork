import * as Y from 'yjs';
import diff from 'fast-diff';
import { parsePage, pageProperties, serialisePage, updateProperties } from '../pages/frontmatter';
import { normaliseVaultPath } from '../platform/vaultPath';

export interface Revision {
  parents: string[];
  deleted: boolean;
  chunks?: string[];
  hash?: string;
  size?: number;
}
export type FileObject = Y.Map<unknown>;
export function allowed(path: string): boolean {
  try {
    if (!path || normaliseVaultPath(path) !== path || path.endsWith('.tmp')) return false;
    if (path.startsWith('.benchwork/modules/') || path === '.benchwork/file-tags.json')
      return !path
        .split('/')
        .slice(1)
        .some((p) => p.startsWith('.'));
    return !path.split('/').some((p) => p.startsWith('.'));
  } catch {
    return false;
  }
}
export function files(doc: Y.Doc): Y.Map<FileObject> {
  return doc.getMap('files');
}
export function heads(file: FileObject): [string, Revision][] {
  const versions = file.get('versions') as Y.Map<Revision>;
  const parents = new Set([...versions.values()].flatMap((v) => v.parents));
  return [...versions.entries()]
    .filter(([id]) => !parents.has(id))
    .sort(([a], [b]) => a.localeCompare(b));
}
export function revise(file: FileObject, value: Omit<Revision, 'parents'>): void {
  (file.get('versions') as Y.Map<Revision>).set(crypto.randomUUID(), {
    ...value,
    parents: heads(file).map(([id]) => id),
  });
}
export function createFile(doc: Y.Doc, path: string, text: boolean): [string, FileObject] {
  const id = crypto.randomUUID();
  const file = new Y.Map<unknown>();
  files(doc).set(id, file);
  file.set('path', path);
  file.set('kind', text ? 'text' : 'binary');
  file.set('versions', new Y.Map<Revision>());
  if (text) {
    file.set('body', new Y.Text());
    file.set('properties', new Y.Map<string>());
    file.set('header', '');
  }
  return [id, file];
}
export function replaceText(text: Y.Text, value: string): void {
  let index = 0;
  for (const [kind, part] of diff(text.toJSON(), value)) {
    if (kind === -1) text.delete(index, part.length);
    else {
      if (kind === 1) text.insert(index, part);
      index += part.length;
    }
  }
}
export function setMarkdown(file: FileObject, value: string): void {
  const page = parsePage(value);
  const properties = file.get('properties') as Y.Map<string>;
  if (page.error !== null) {
    // Unreadable YAML is an atomic header, never parsed and rewritten.
    file.set('header', page.yaml ?? '');
    file.set('broken', true);
  } else {
    const next = pageProperties(page);
    for (const key of new Set([...properties.keys(), ...Object.keys(next)])) {
      const encoded = JSON.stringify(next[key] ?? null);
      if (properties.get(key) !== encoded) properties.set(key, encoded);
    }
    file.set('header', page.yaml);
    file.set('broken', false);
  }
  file.set('eol', page.eol);
  file.set('bom', page.bom);
  replaceText(file.get('body') as Y.Text, page.body);
  revise(file, { deleted: false });
}
export function markdown(file: FileObject): string {
  const yaml = file.get('header') as string | null;
  const base = parsePage(
    serialisePage({
      yaml,
      body: '',
      eol: file.get('eol') as '\n' | '\r\n',
      bom: file.get('bom') === true,
    }),
  );
  const changes = Object.fromEntries(
    [...(file.get('properties') as Y.Map<string>)].map(([key, value]) => [
      key,
      JSON.parse(value) as unknown,
    ]),
  );
  const page = file.get('broken') === true ? base : updateProperties(base, changes);
  return serialisePage({ ...page, body: (file.get('body') as Y.Text).toJSON() });
}
/** Reject malformed catalogues before projecting any received state to disk. */
export function validate(doc: Y.Doc): void {
  if (files(doc).size > 20000) throw new Error('Sync catalogue exceeds 20,000 files.');
  for (const [id, file] of files(doc)) {
    if (
      !/^[\da-f-]{36}$/i.test(id) ||
      !(file instanceof Y.Map) ||
      !allowed(String(file.get('path')))
    )
      throw new Error('Invalid sync file identity or path.');
    const kind = file.get('kind');
    if (kind !== 'text' && kind !== 'binary') throw new Error('Unsupported sync file type.');
    const versions = file.get('versions');
    if (!(versions instanceof Y.Map)) throw new Error('Invalid sync history.');
    for (const v of versions.values() as Iterable<Partial<Revision> | null>) {
      if (
        !v ||
        !Array.isArray(v.parents) ||
        !v.parents.every((p) => typeof p === 'string') ||
        typeof v.deleted !== 'boolean'
      )
        throw new Error('Invalid sync revision.');
      if (
        !v.deleted &&
        kind === 'binary' &&
        (!Array.isArray(v.chunks) ||
          v.chunks.length > 64 ||
          !v.chunks.every((c) => /^[\da-f-]{36}$/i.test(c)) ||
          !/^[\da-f]{64}$/.test(v.hash ?? '') ||
          !Number.isInteger(v.size) ||
          (v.size ?? -1) < 0 ||
          (v.size ?? Infinity) > 32 * 1024 * 1024)
      )
        throw new Error('Invalid attachment revision.');
    }
    if (kind === 'text') {
      if (
        !(file.get('body') instanceof Y.Text) ||
        !(file.get('properties') instanceof Y.Map) ||
        (file.get('header') !== null && typeof file.get('header') !== 'string')
      )
        throw new Error('Invalid note state.');
      if (markdown(file).length > 4 * 1024 * 1024) throw new Error('Note exceeds sync text limit.');
    }
  }
}
export function copyPath(path: string, id: string): string {
  const dot = path.lastIndexOf('.'),
    slash = path.lastIndexOf('/');
  const at = dot > slash ? dot : path.length;
  return `${path.slice(0, at)} (sync copy ${id.slice(0, 8)})${path.slice(at)}`;
}
