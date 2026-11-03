import { useCallback, useEffect, useState } from 'react';
import type { ModuleContext, ScheduledItem, VaultItem } from '@core/api';

export { RecordsView, RecordEditor, LinkPicker, LinkedRecords } from './RecordsView';
export type { RecordSpec, Field } from './RecordsView';

/** Public helpers shared by modules that declare a dependency on Research. */
export interface Entry extends VaultItem {
  data: Record<string, unknown>;
  source: string;
  error: string | null;
}

export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
export const values = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : text(value) === ''
      ? []
      : [text(value)];
export const link = (path: string): string => `[[${path}]]`;
export const label = (value: unknown): string =>
  values(value)
    .map(
      (v) =>
        v
          .replace(/^\[\[|\]\]$/g, '')
          .split('|')
          .at(-1)
          ?.split('/')
          .at(-1)
          ?.replace(/\.(?:md|[a-z-]+\.yaml)$/i, '') ?? v,
    )
    .join(', ');
export const today = (): string => {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export function validDay(day: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T12:00:00Z`)) &&
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
  );
}
export function addDays(day: string, days: number): string {
  if (!validDay(day) || !Number.isFinite(days))
    throw new Error('Choose a valid date and day offset.');
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return date.toISOString().slice(0, 10);
}
export const dayDifference = (from: string, to: string): number => {
  if (!validDay(from) || !validDay(to)) throw new Error('Choose valid dates.');
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
};

export async function readEntry(ctx: ModuleContext, item: VaultItem): Promise<Entry> {
  const source = await ctx.vault.readText(item.path);
  const page = item.path.toLowerCase().endsWith('.md');
  const properties = page ? await ctx.app.pageProperties(item.path) : null;
  const record = page
    ? {
        data: properties ?? {},
        error: properties === null ? 'The page properties could not be read.' : null,
      }
    : await ctx.vault.readRecord(item.path);
  return { ...item, source, ...record };
}
export async function loadEntries(ctx: ModuleContext): Promise<Entry[]> {
  return Promise.all(
    (await ctx.app.items()).map(async (item) => {
      try {
        return await readEntry(ctx, item);
      } catch (error) {
        return {
          ...item,
          data: {},
          source: '',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
export function useEntries(ctx: ModuleContext) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setRevision((n) => n + 1);
  }, []);
  useEffect(() => {
    let active = true;
    void loadEntries(ctx)
      .then((items) => {
        if (active) {
          setEntries(items);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ctx, revision]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = ctx.vault.watch(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    });
    return () => {
      stop.dispose();
      if (timer !== null) clearTimeout(timer);
    };
  }, [ctx, refresh]);
  return { entries, error, loading, refresh };
}

export async function saveEntry(
  ctx: ModuleContext,
  entry: Entry,
  changes: Record<string, unknown>,
): Promise<void> {
  if (entry.error !== null)
    throw new Error('This record could not be read and has not been changed.');
  if ((await ctx.vault.readText(entry.path)) !== entry.source)
    throw new Error(
      'This record changed elsewhere. Close the editor and reopen it before saving. Your form is still here.',
    );
  await ctx.vault.keepSnapshot(entry.path);
  if (entry.path.endsWith('.md')) await ctx.app.setPageProperties(entry.path, changes);
  else await ctx.vault.updateRecord(entry.path, { ...changes, modified: new Date().toISOString() });
}

export async function relatedEntries(
  ctx: ModuleContext,
  entry: Entry,
  all: Entry[],
): Promise<Entry[]> {
  const found = new Set((await ctx.app.linksTo(entry.path)).map((item) => item.path));
  const refs = [...JSON.stringify(entry.data).matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(
    (m) => m[1] ?? '',
  );
  for (const ref of refs) {
    const path = await ctx.app.resolveLink(ref, entry.path);
    if (path) found.add(path);
  }
  return all.filter((item) => item.path !== entry.path && found.has(item.path));
}

export function scheduleItem(
  source: string,
  entry: Entry,
  start: string,
  end = start,
): ScheduledItem {
  return {
    key: `${source}:${entry.path}`,
    path: entry.path,
    title: entry.title,
    start,
    end,
    milestone: start === end,
    progress: entry.data['status'] === 'done' ? 1 : 0,
    done: entry.data['status'] === 'done',
    person: text(entry.data['owner']) || null,
    priority: null,
    notebook: entry.path.split('/')[0] ?? '',
    after: [],
    parent: null,
  };
}

export interface WorkflowStep {
  id: string;
  title: string;
  offset: number;
  minutes: number;
  done: boolean;
  notes: string;
  completedAt: string | null;
}
export function stepsOf(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const row = raw as Record<string, unknown>;
    if (text(row['title']).trim() === '') return [];
    return [
      {
        id: text(row['id']) || crypto.randomUUID(),
        title: text(row['title']),
        offset:
          typeof row['offset'] === 'number' && Number.isFinite(row['offset'])
            ? Math.trunc(row['offset'])
            : 0,
        minutes:
          typeof row['minutes'] === 'number' && Number.isFinite(row['minutes'])
            ? Math.max(0, row['minutes'])
            : 0,
        done: row['done'] === true,
        notes: text(row['notes']),
        completedAt: typeof row['completedAt'] === 'string' ? row['completedAt'] : null,
      },
    ];
  });
}
export function blankStep(title = 'New step'): WorkflowStep {
  return {
    id: crypto.randomUUID(),
    title,
    offset: 0,
    minutes: 0,
    done: false,
    notes: '',
    completedAt: null,
  };
}
