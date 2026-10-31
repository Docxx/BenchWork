import { useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import { changeTaskFields, readTasks, type Task, type TaskFields, type TaskState } from './tasks';

/** Pages read at a time while first gathering tasks. */
const BATCH = 20;

const isPage = (path: string) => path.toLowerCase().endsWith('.md');

/**
 * Every task in the vault, gathered from the pages once, then kept up to
 * date as pages change. Changing a task writes its page, keeping a
 * recovery copy first.
 */
export class TaskStore {
  private byPage = new Map<string, Task[]>();
  private listeners = new Set<() => void>();
  private snapshot: Task[] = [];
  loaded = false;

  constructor(private readonly ctx: ModuleContext) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Every task, as one list; the same list until something changes. */
  all = (): Task[] => this.snapshot;

  private changed(): void {
    this.snapshot = [...this.byPage.values()].flat();
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    const pages = (await this.ctx.app.items()).map((i) => i.path).filter(isPage);
    for (let i = 0; i < pages.length; i += BATCH) {
      await Promise.all(pages.slice(i, i + BATCH).map((p) => this.read(p)));
    }
    this.loaded = true;
    this.changed();
  }

  /** Reads pages again after they changed on disk. */
  async refresh(paths: readonly string[]): Promise<void> {
    const pages = paths.filter(isPage);
    if (pages.length === 0) return;
    await Promise.all(pages.map((p) => this.read(p)));
    this.changed();
  }

  private async read(path: string): Promise<void> {
    try {
      const tasks = readTasks(path, await this.ctx.vault.readText(path));
      if (tasks.length > 0) this.byPage.set(path, tasks);
      else this.byPage.delete(path);
    } catch {
      // Gone, or not readable: no tasks from it.
      this.byPage.delete(path);
    }
  }

  /** Sets a task's state and due date in its page. */
  async set(task: Task, state: TaskState, due: string | null = task.due): Promise<void> {
    await this.update(task, { state, due });
  }

  /** Changes some of a task's details in its page. */
  async update(task: Task, changes: Partial<TaskFields>): Promise<void> {
    const text = await this.ctx.vault.readText(task.path);
    const next = changeTaskFields(text, task, changes);
    if (next === null) {
      // The page changed since: show it as it is now, and change nothing.
      await this.refresh([task.path]);
      this.ctx.app.notify('That page changed meanwhile, so the task was not changed. Try again.');
      return;
    }
    await this.ctx.vault.keepSnapshot(task.path);
    await this.ctx.vault.writeText(task.path, next);
    await this.refresh([task.path]);
  }
}

/** Every task, updating as they change. */
export function useTasks(store: TaskStore): Task[] {
  return useSyncExternalStore(store.subscribe, store.all);
}
