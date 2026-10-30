import { useSyncExternalStore } from 'react';
import type { ModuleContext, NewPageContent } from '@core/api';
import { parseResults, searchUrl, type Paper, type Topic } from './europePmc';

/** Results older than this are fetched again when the app opens, in ms. */
export const STALE_MS = 6 * 60 * 60_000;
/** Where notes on papers go. */
export const NOTES_FOLDER = 'Reading';

const TOPICS = 'topics.json';
const CACHE = 'results.json';

export interface TopicResults {
  /** When they were fetched, in ms since 1970. */
  fetched: number;
  papers: Paper[];
}

export interface PapersState {
  topics: Topic[];
  results: Record<string, TopicResults>;
  /** Topics being fetched now. */
  loading: string[];
  /** Why a topic's last fetch failed. */
  errors: Record<string, string>;
  loaded: boolean;
}

/** A copy of `record` without `key`. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readTopics(data: unknown): Topic[] {
  const list = isRecord(data) && Array.isArray(data['topics']) ? data['topics'] : [];
  return list.filter(
    (t): t is Topic =>
      isRecord(t) &&
      typeof t['id'] === 'string' &&
      typeof t['name'] === 'string' &&
      typeof t['query'] === 'string' &&
      typeof t['preprints'] === 'boolean',
  );
}

/** The newest papers across every topic, each once, with the topic it came from. */
export function newestPapers(
  state: Pick<PapersState, 'topics' | 'results'>,
  count: number,
): { paper: Paper; topic: Topic }[] {
  const seen = new Set<string>();
  const all: { paper: Paper; topic: Topic }[] = [];
  for (const topic of state.topics) {
    for (const paper of state.results[topic.id]?.papers ?? []) {
      if (seen.has(paper.key)) continue;
      seen.add(paper.key);
      all.push({ paper, topic });
    }
  }
  return all.sort((a, b) => b.paper.date.localeCompare(a.paper.date)).slice(0, count);
}

/** A literature note for a paper: its details as properties, then room for notes. */
export function noteFor(paper: Paper, topic: Topic | null): NewPageContent {
  const link = paper.doi === null ? paper.url : `https://doi.org/${paper.doi}`;
  return {
    properties: {
      authors: paper.authors,
      journal: paper.journal,
      published: paper.date,
      ...(paper.doi === null ? {} : { doi: paper.doi }),
      url: link,
      tags: ['paper', ...(topic === null ? [] : [topic.name.toLowerCase().replace(/\s+/g, '-')])],
    },
    body: [
      `**${paper.authors}**`,
      '',
      `_${paper.journal}_, ${paper.date}. [Read it](${link})`,
      '',
      '## Abstract',
      '',
      paper.abstract === '' ? 'No abstract.' : paper.abstract.split('\n').join('\n\n'),
      '',
      '## Notes',
      '',
      '',
    ].join('\n'),
  };
}

/**
 * Topics and their latest papers. Topics are saved in the module's own
 * folder, with the last results, so Home shows them at once and offline.
 */
export class PapersStore {
  private state: PapersState = { topics: [], results: {}, loading: [], errors: {}, loaded: false };
  private listeners = new Set<() => void>();

  constructor(
    private readonly ctx: ModuleContext,
    private readonly now: () => Date = () => new Date(),
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get = (): PapersState => this.state;

  private set(changes: Partial<PapersState>): void {
    this.state = { ...this.state, ...changes };
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    const [topics, cache] = await Promise.all([
      this.ctx.storage.read(TOPICS).catch(() => null),
      this.ctx.storage.read(CACHE).catch(() => null),
    ]);
    const results: Record<string, TopicResults> = {};
    if (isRecord(cache) && isRecord(cache['results'])) {
      for (const [id, r] of Object.entries(cache['results'])) {
        if (isRecord(r) && typeof r['fetched'] === 'number' && Array.isArray(r['papers'])) {
          results[id] = { fetched: r['fetched'], papers: r['papers'] as Paper[] };
        }
      }
    }
    this.set({ topics: readTopics(topics), results, loaded: true });
    const stale = this.state.topics.filter(
      (t) => (results[t.id]?.fetched ?? 0) < this.now().getTime() - STALE_MS,
    );
    await Promise.all(stale.map((t) => this.refresh(t.id)));
  }

  private async saveTopics(): Promise<void> {
    await this.ctx.storage.write(TOPICS, { topics: this.state.topics });
  }

  private async saveResults(): Promise<void> {
    await this.ctx.storage.write(CACHE, { results: this.state.results }).catch(() => undefined);
  }

  async refresh(topicId: string): Promise<void> {
    const topic = this.state.topics.find((t) => t.id === topicId);
    if (!topic || this.state.loading.includes(topicId)) return;
    this.set({ loading: [...this.state.loading, topicId] });
    let errors = this.state.errors;
    try {
      const papers = parseResults(await this.ctx.web.getText(searchUrl(topic, this.now())));
      this.state.results = {
        ...this.state.results,
        [topicId]: { fetched: this.now().getTime(), papers },
      };
      errors = without(errors, topicId);
      await this.saveResults();
    } catch (err) {
      errors = { ...errors, [topicId]: err instanceof Error ? err.message : String(err) };
    }
    this.set({ loading: this.state.loading.filter((id) => id !== topicId), errors });
  }

  async refreshAll(): Promise<void> {
    await Promise.all(this.state.topics.map((t) => this.refresh(t.id)));
  }

  /** Adds a topic, or changes one with the same id, and fetches its papers. */
  async saveTopic(topic: Topic): Promise<void> {
    const exists = this.state.topics.some((t) => t.id === topic.id);
    const topics = exists
      ? this.state.topics.map((t) => (t.id === topic.id ? topic : t))
      : [...this.state.topics, topic];
    this.set({ topics, results: without(this.state.results, topic.id) });
    await this.saveTopics();
    await this.refresh(topic.id);
  }

  async removeTopic(id: string): Promise<void> {
    this.set({
      topics: this.state.topics.filter((t) => t.id !== id),
      results: without(this.state.results, id),
    });
    await this.saveTopics();
    await this.saveResults();
  }

  /** Makes a literature note for a paper in the Reading notebook, and opens it. */
  async makeNote(paper: Paper, topic: Topic | null): Promise<void> {
    await this.ctx.vault.ensureDir(NOTES_FOLDER);
    const title = paper.title
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim();
    const file = await this.ctx.vault.freeName(NOTES_FOLDER, title, '.md');
    await this.ctx.app.createPage(
      NOTES_FOLDER,
      file.replace(/\.md$/, ''),
      undefined,
      noteFor(paper, topic),
    );
  }
}

export function usePapers(store: PapersStore): PapersState {
  return useSyncExternalStore(store.subscribe, store.get);
}
