import type { LinkChoice } from '../editor/pageLinks';
import { candidates, linkTargetFor, resolveLink, suffixKeys, suggestPages } from '../links/resolve';
import { rewriteLinks } from '../links/rewrite';
import { isPage, pageTitle } from '../notebooks/notebookTree';
import { embedPath } from '../pages/attachments';
import { baseName, parentVaultPath, type LinkRef, type PageRef } from '../platform';
import type { StoreContext } from './context';
import { locationOf } from './searchSlice';

/** Wait after the index changes before reloading the page list. */
export const LINKS_REFRESH_MS = 200;

/** A page linking to the open page, for the "Linked from" section. */
export interface Backlink {
  path: string;
  title: string;
  location: string;
  /** The line the link is on, as plain text. */
  context: string;
}

/** What a rename or move needs to know from before it happened. */
export interface RelinkPlan {
  from: string;
  before: PageRef[];
  links: LinkRef[];
}

export interface LinksSlice {
  /** Every page in the index, for links. */
  pageRefs: PageRef[];
  /** Pages linking to the open page. */
  backlinks: Backlink[];

  /** Reloads the page list and backlinks; called when the index changes. */
  refreshLinks: () => void;
  /** Loads backlinks for `path`, or clears them for null. */
  loadBacklinks: (path: string | null) => Promise<void>;
  /** What to write in `[[...]]` to link to `path`. */
  linkTargetFor: (path: string) => string;
  /**
   * Pages for the `[[` menu, then a choice to create one that is not there.
   * Waits for the page list if it has not loaded since the vault opened.
   */
  suggestLinks: (query: string) => Promise<LinkChoice[]>;
  /** Whether a link in the open page points at an existing page. */
  linkResolves: (target: string) => boolean;
  /** Opens the page a link in the open page means, creating it if it does not exist. */
  followLink: (target: string) => Promise<void>;
  /** Before renaming or moving `path`: notes the links that point into it. */
  planRelink: (path: string) => Promise<RelinkPlan | null>;
  /** After the rename or move to `to`: updates those links. Resolves to pages changed. */
  applyRelink: (plan: RelinkPlan, to: string) => Promise<number>;
}

/** A line of Markdown as plain text, for showing where a link is. */
export function plainLine(line: string): string {
  return line
    .replace(/!?\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g, (_, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    .replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+|>\s*)/, '')
    .replace(/[*_`~]/g, '')
    .trim()
    .slice(0, 200);
}

function contextFor(text: string, targets: readonly string[]): string {
  const lower = targets.map((t) => `[[${t.toLowerCase()}`);
  const line = text.split(/\r?\n/).find((l) => lower.some((t) => l.toLowerCase().includes(t)));
  return line === undefined ? '' : plainLine(line);
}

function under(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

export function createLinksSlice(ctx: StoreContext): LinksSlice {
  const { platform, set, get } = ctx;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backlinksToken = 0;
  /** Whether the page list has loaded since the vault opened. */
  let loaded = false;

  async function reload(): Promise<void> {
    if (get().status.kind !== 'open') return;
    const token = ctx.session();
    let pageRefs: PageRef[];
    try {
      pageRefs = await platform.index.pages();
    } catch {
      return; // not open yet; the next index update tries again
    }
    if (token !== ctx.session()) return;
    set({ pageRefs });
    loaded = true;
    await get().loadBacklinks(get().page?.path ?? null);
  }

  ctx.onVault({
    closed: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      backlinksToken += 1;
      loaded = false;
      set({ pageRefs: [], backlinks: [] });
    },
  });

  return {
    pageRefs: [],
    backlinks: [],

    refreshLinks: () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void reload();
      }, LINKS_REFRESH_MS);
    },

    loadBacklinks: async (path) => {
      const token = (backlinksToken += 1);
      if (path === null || get().status.kind !== 'open') {
        set({ backlinks: [] });
        return;
      }
      let refs: LinkRef[];
      try {
        refs = await platform.index.backlinks(suffixKeys(path));
      } catch {
        refs = [];
      }
      const pages = get().pageRefs;
      const bySource = new Map<string, string[]>();
      for (const ref of refs) {
        if (ref.source === path) continue;
        if (resolveLink(ref.target, ref.source, pages)?.path !== path) continue;
        bySource.set(ref.source, [...(bySource.get(ref.source) ?? []), ref.target]);
      }
      const backlinks: Backlink[] = [];
      for (const [source, targets] of bySource) {
        let context = '';
        try {
          context = contextFor(await platform.readText(source), targets);
        } catch {
          continue; // gone since it was indexed
        }
        backlinks.push({
          path: source,
          title: pageTitle(baseName(source)),
          location: locationOf(source),
          context,
        });
      }
      if (token !== backlinksToken) return;
      set({ backlinks: backlinks.sort((a, b) => a.title.localeCompare(b.title)) });
    },

    linkTargetFor: (path) => linkTargetFor(path, get().pageRefs),

    suggestLinks: async (query) => {
      if (!loaded) {
        await get().indexIdle();
        await reload();
      }
      const pages = get().pageRefs;
      const choices: LinkChoice[] = suggestPages(query, pages).map((p) => ({
        id: p.path,
        label: p.title,
        detail: locationOf(p.path),
        target: linkTargetFor(p.path, pages),
      }));
      const typed = query.trim();
      if (typed !== '' && !pages.some((p) => p.title.toLowerCase() === typed.toLowerCase())) {
        choices.push({ id: 'new', label: `Create "${typed}"`, detail: 'New page', target: typed });
      }
      return choices;
    },

    // Until the page list has loaded, links are not shown as missing, so they
    // do not flicker faded every time a vault opens.
    linkResolves: (target) =>
      !loaded || candidates(target, get().page?.path ?? null, get().pageRefs).length > 0,

    followLink: async (target) => {
      const from = get().page?.path ?? null;
      const found = resolveLink(target, from, get().pageRefs);
      if (found) {
        await get().openPath(found.path, target.split('#')[1]?.split('^')[0]);
        return;
      }
      // A file such as `attachments/plot.png` or `Data/day7.csv`.
      const file = embedPath(target);
      if (file !== null && !isPage(baseName(file)) && (await platform.exists(file))) {
        await get().openPath(file);
        return;
      }
      // A new page: in the folder the link names, if it exists, else beside this page.
      const clean = (target.split(/[#^]/)[0] ?? '').trim().replace(/\.md$/i, '');
      if (clean === '') return;
      const named = parentVaultPath(clean);
      const here = from === null ? '' : (parentVaultPath(from) ?? '');
      let folder = here;
      if (named !== null && named !== '') {
        folder = (await platform.exists(named).catch(() => false)) ? named : here;
      }
      await get().createPage(folder, baseName(clean));
    },

    planRelink: async (path) => {
      try {
        // Let indexing catch up and read the pages afresh, so a rename made
        // just after opening a vault still finds every link.
        await get().indexIdle();
        const before = await platform.index.pages();
        const moving = before.filter((p) => under(p.path, path));
        if (moving.length === 0) return null;
        const keys = [...new Set(moving.flatMap((p) => suffixKeys(p.path)))];
        return { from: path, before, links: await platform.index.backlinks(keys) };
      } catch {
        return null;
      }
    },

    applyRelink: async (plan, to) => {
      const { from, before } = plan;
      const moved = new Map<string, string>();
      for (const p of before) {
        if (under(p.path, from)) moved.set(p.path, to + p.path.slice(from.length));
      }
      const after = before.map((p) => {
        const next = moved.get(p.path);
        return next === undefined ? p : { ...p, path: next, title: pageTitle(baseName(next)) };
      });

      let changedPages = 0;
      for (const source of new Set(plan.links.map((l) => l.source))) {
        const current = moved.get(source) ?? source;
        let text: string;
        try {
          text = await platform.readText(current);
        } catch {
          continue;
        }
        const result = rewriteLinks(text, (target) => {
          const was = resolveLink(target, source, before);
          const next = was === null ? undefined : moved.get(was.path);
          if (next === undefined) return null;
          if (resolveLink(target, current, after)?.path === next) return null;
          return linkTargetFor(next, after);
        });
        if (result.count === 0) continue;
        await platform.writeTextAtomic(current, result.text);
        changedPages += 1;
      }
      set({ pageRefs: after });
      return changedPages;
    },
  };
}
