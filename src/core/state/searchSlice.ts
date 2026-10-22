import { pageTitle } from '../notebooks/notebookTree';
import { parentVaultPath, type SearchHit } from '../platform';
import { INDEX_OFF, IndexService, type IndexProgress } from '../search/indexService';
import type { StoreContext } from './context';

/** Results shown at most. */
export const SEARCH_LIMIT = 50;
/** Wait after typing before searching. */
export const SEARCH_DELAY_MS = 120;

/** A search for one tag, such as `#lps` or `#lab/flies`. */
const TAG_QUERY = /^#([^\s#]+)$/;

export interface SearchResult extends SearchHit {
  /** Where the page lives, such as `LPS model > Experiments`; empty at the top. */
  location: string;
}

export interface SearchSlice {
  searchQuery: string;
  /** Null when there is no query. */
  searchResults: SearchResult[] | null;
  indexProgress: IndexProgress;
  /** Bumped to ask the search box to take focus (Ctrl+E). */
  searchFocusRequest: number;

  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  focusSearch: () => void;
  /** Empties the search index and reads every page again. */
  rebuildIndex: () => Promise<void>;
  /** Resolves when indexing has caught up; for tests. */
  indexIdle: () => Promise<void>;
}

export function locationOf(path: string): string {
  const folder = parentVaultPath(path) ?? '';
  return folder === '' ? '' : folder.split('/').map(pageTitle).join(' > ');
}

export function createSearchSlice(ctx: StoreContext): SearchSlice {
  const { platform, set, get } = ctx;
  let service: IndexService | null = null;
  let stopWatching: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let searchToken = 0;

  async function runSearch(): Promise<void> {
    const token = (searchToken += 1);
    const query = get().searchQuery;
    if (query.trim() === '' || !service) {
      set({ searchResults: null });
      return;
    }
    let hits: SearchHit[];
    try {
      // `#tag` on its own lists the pages with that tag.
      const tag = TAG_QUERY.exec(query.trim())?.[1];
      hits =
        tag === undefined
          ? await service.search(query, SEARCH_LIMIT)
          : await service.tagged(tag, SEARCH_LIMIT);
    } catch {
      hits = [];
    }
    if (token !== searchToken) return;
    set({ searchResults: hits.map((hit) => ({ ...hit, location: locationOf(hit.path) })) });
  }

  function scheduleSearch(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runSearch();
    }, SEARCH_DELAY_MS);
  }

  ctx.onVault({
    opened: () => {
      const current = new IndexService(platform, {
        progress: (indexProgress) => {
          if (service === current) set({ indexProgress });
        },
        updated: () => {
          if (service !== current) return;
          get().refreshLinks();
          if (get().searchQuery.trim() !== '') scheduleSearch();
        },
      });
      service = current;
      stopWatching = platform.watch((change) => {
        current.changed(change.paths);
      });
      // In the background: the vault is usable while pages are read.
      void current.start();
    },
    closing: async () => {
      stopWatching?.();
      stopWatching = null;
      const current = service;
      service = null;
      await current?.stop();
    },
    closed: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      searchToken += 1;
      set({ searchQuery: '', searchResults: null, indexProgress: INDEX_OFF });
    },
  });

  return {
    searchQuery: '',
    searchResults: null,
    indexProgress: INDEX_OFF,
    searchFocusRequest: 0,

    setSearchQuery: (searchQuery) => {
      set({ searchQuery });
      if (searchQuery.trim() === '') {
        searchToken += 1;
        set({ searchResults: null });
      } else {
        scheduleSearch();
      }
    },

    clearSearch: () => {
      get().setSearchQuery('');
    },

    focusSearch: () => {
      set((s) => ({ searchFocusRequest: s.searchFocusRequest + 1 }));
    },

    rebuildIndex: async () => {
      await service?.rebuild();
    },

    indexIdle: async () => {
      await service?.idle();
    },
  };
}
