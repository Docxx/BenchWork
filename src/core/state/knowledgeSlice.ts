import type { VaultGraph } from '../api';
import { resolveLink } from '../links/resolve';
import { parsePage } from '../pages/frontmatter';
import { baseName, normaliseVaultPath, type PageRef } from '../platform';
import { extractFile } from '../search/extract';
import type { StoreContext } from './context';

export const FILE_TAGS = '.benchwork/file-tags.json';
export function cleanTags(tags: readonly string[]): string[] {
  return [
    ...new Set(tags.map((t) => t.trim().replace(/^#+/, '').normalize('NFC').toLowerCase())),
  ].filter((t) => /^[\p{L}\p{N}_/-]+$/u.test(t) && /[\p{L}_-]/u.test(t));
}
type Registry = Record<string, string[]>;

export interface KnowledgeSlice {
  tagRevision: number;
  itemTags: (path: string) => Promise<string[]>;
  setItemTags: (path: string, tags: string[]) => Promise<void>;
  moveItemTags(from: string, to: string): Promise<void>;
  documentTagHits(tag: string): Promise<{ path: string; title: string; snippet: string }[]>;
  vaultGraph(): Promise<VaultGraph>;
}

/** Document metadata is durable vault data, separate from the disposable search index. */
export function createKnowledgeSlice(ctx: StoreContext): KnowledgeSlice {
  const { platform, get, set } = ctx;
  let pending: Promise<void> = Promise.resolve();
  async function registry(): Promise<Registry> {
    if (!(await platform.exists(FILE_TAGS))) return {};
    const value: unknown = JSON.parse(await platform.readText(FILE_TAGS));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Document tags could not be read. The original metadata has been kept.');
    const result: Registry = {};
    for (const [path, tags] of Object.entries(value)) {
      if (!Array.isArray(tags) || !tags.every((t): t is string => typeof t === 'string'))
        throw new Error('Document tags could not be read. The original metadata has been kept.');
      result[normaliseVaultPath(path)] = cleanTags(tags);
    }
    return result;
  }
  function change(edit: (data: Registry) => void): Promise<void> {
    const token = ctx.session();
    const operation = pending.then(async () => {
      if (token !== ctx.session() || get().status.kind !== 'open')
        throw new Error('The vault changed before tags could be saved.');
      const data = await registry();
      const before = JSON.stringify(data);
      edit(data);
      if (JSON.stringify(data) === before) return;
      await platform.ensureDir('.benchwork');
      await platform.writeTextAtomic(FILE_TAGS, JSON.stringify(data, null, 2) + '\n');
      set({ tagRevision: get().tagRevision + 1 });
      if (get().searchQuery) get().setSearchQuery(get().searchQuery);
    });
    pending = operation.catch(() => {});
    return operation;
  }
  ctx.onVault({
    closing: () => pending,
    closed: () => {
      set({ tagRevision: 0 });
    },
  });
  return {
    tagRevision: 0,
    itemTags: async (path) => {
      if (path.toLowerCase().endsWith('.md')) {
        if (get().page?.path === path) return cleanTags(strings(get().pageProperties?.['tags']));
        return parsePage(await platform.readText(path)).meta.tags;
      }
      return (await registry())[path] ?? [];
    },
    setItemTags: async (path, tags) => {
      const normal = normaliseVaultPath(path);
      if (normal.toLowerCase().endsWith('.md')) {
        if (get().page?.path !== normal || get().propertiesBroken || get().pageConflict)
          throw new Error(
            'Open this note and resolve its properties or conflict before tagging it.',
          );
        get().setPageProperties({ tags: cleanTags(tags) });
        await get().savePageNow();
        if (get().saveState !== 'saved')
          throw new Error('Tags are in the note. Saving failed; use Retry save.');
      } else {
        await change((data) => {
          data[normal] = cleanTags(tags);
        });
      }
    },
    moveItemTags: (from, to) =>
      change((data) => {
        for (const path of Object.keys(data)) {
          if (path !== from && !path.startsWith(`${from}/`)) continue;
          const target = `${to}${path.slice(from.length)}`;
          data[target] = cleanTags([...(data[target] ?? []), ...(data[path] ?? [])]);
          Reflect.deleteProperty(data, path);
        }
      }),
    documentTagHits: async (tag) => {
      const key = tag.toLowerCase();
      const entries = Object.entries(await registry()).filter(([, tags]) =>
        tags.some((t) => t === key || t.startsWith(`${key}/`)),
      );
      const found = await Promise.all(
        entries.map(async ([path, tags]) =>
          (await platform.exists(path))
            ? { path, title: baseName(path), snippet: tags.map((t) => `#${t}`).join(' ') }
            : null,
        ),
      );
      return found.filter((item) => item !== null);
    },
    vaultGraph: async () => {
      const token = ctx.session();
      await get().indexIdle();
      const metadata = await registry();
      const nodes: VaultGraph['nodes'] = [];
      const links: { source: string; target: string }[] = [];
      const warnings: string[] = [];
      async function walk(folder: string): Promise<void> {
        for (const entry of await platform.listDir(folder)) {
          if (token !== ctx.session()) throw new Error('The vault changed. Refresh the graph.');
          if (entry.name.startsWith('.') || entry.name.endsWith('.ink.json')) continue;
          if (entry.isDir) {
            await walk(entry.path);
            continue;
          }
          if (
            !/\.(md|ya?ml|pdf|docx?|xlsx?|csv|tsv|png|jpe?g|gif|webp|svg|canvas\.json)$/i.test(
              entry.name,
            )
          )
            continue;
          const isNote = /\.md$/i.test(entry.name);
          let title = baseName(entry.path).replace(/\.md$/i, '');
          let tags = metadata[entry.path] ?? [];
          if (isNote || /\.ya?ml$/i.test(entry.name)) {
            try {
              const extracted = extractFile(entry.path, await platform.readText(entry.path), {
                mtime: entry.modified,
                size: entry.size,
              });
              title = extracted.title;
              tags = cleanTags([...tags, ...extracted.tags]);
              links.push(...extracted.links.map((l) => ({ source: entry.path, target: l.target })));
            } catch {
              warnings.push(entry.path);
            }
          }
          nodes.push({
            id: entry.path,
            path: entry.path,
            title,
            kind: isNote ? 'note' : 'document',
            tags,
          });
        }
      }
      await walk('');
      const refs: PageRef[] = nodes.map((n) => ({
        path: n.path,
        title: n.title,
        id: null,
        type: n.kind,
      }));
      const edges: VaultGraph['edges'] = [];
      const seen = new Set<string>();
      for (const link of links) {
        const target = resolveLink(link.target, link.source, refs)?.path;
        if (!target || target === link.source) continue;
        const key = [link.source, target].sort().join('\n');
        if (!seen.has(key)) {
          edges.push({ source: link.source, target });
          seen.add(key);
        }
      }
      return { nodes, edges, warnings };
    },
  };
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((t): t is string => typeof t === 'string')
    : typeof value === 'string'
      ? value.split(/[,\s]+/)
      : [];
}
