import type { ModuleContext } from '@core/api';
import { lessonFiles, newLesson, parseLesson, type Lesson } from './model';
import { Rehearsal } from './rehearsal';

interface State {
  files: string[];
  path: string | null;
  lesson: Lesson;
  dirty: boolean;
  error: string;
  busy: boolean;
}
/** One shared editing session survives moves between Studio, Presenter and Rehearsal. */
export class TeachingSession {
  readonly rehearsal = new Rehearsal();
  state: State = {
    files: [],
    path: null,
    lesson: newLesson(),
    dirty: false,
    error: '',
    busy: false,
  };
  private pending = new Set<Promise<void>>();
  private closing = false;
  perform(task: () => Promise<void>): Promise<void> {
    if (this.closing) return Promise.reject(new Error('This workspace is closing.'));
    const pending = task().finally(() => {
      this.pending.delete(pending);
    });
    this.pending.add(pending);
    return pending;
  }
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly ctx: ModuleContext) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => {
      fn();
    });
  }
  async refresh() {
    this.set({ files: await lessonFiles(this.ctx) });
  }
  edit(lesson: Lesson) {
    this.set({ lesson, dirty: true });
    if (this.timer) clearTimeout(this.timer);
    if (this.state.path)
      this.timer = setTimeout(() => {
        void this.save().catch(() => {
          /* Visible error and dirty edits remain for retry. */
        });
      }, 600);
  }
  save(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const task = this.tail
      .catch(() => {
        /* A retry is allowed after a failed save. */
      })
      .then(async () => {
        if (!this.state.dirty && this.state.path) return;
        const { lesson, path } = this.state;
        this.set({ busy: true, error: '' });
        try {
          await this.ctx.vault.ensureDir('Teaching/Lessons');
          const data = { ...lesson };
          const saved =
            path ??
            (await this.ctx.vault.createRecord('Teaching/Lessons', lesson.title, 'lesson', data));
          if (path) await this.ctx.vault.updateRecord(path, data);
          this.set({
            path: saved,
            dirty: this.state.lesson !== lesson,
            files: [...new Set([...this.state.files, saved])],
          });
        } catch (e) {
          this.set({ error: String(e), dirty: true });
          throw e;
        } finally {
          this.set({ busy: false });
        }
      });
    this.tail = task;
    return task;
  }
  async select(path: string) {
    if (this.state.dirty) await this.save();
    await this.rehearsal.save(this.ctx);
    const record = await this.ctx.vault.readRecord(path);
    if (record.error) throw new Error(record.error);
    this.set({ path, lesson: parseLesson(record.data), dirty: false, error: '' });
  }
  async create() {
    if (this.state.dirty) await this.save();
    await this.rehearsal.save(this.ctx);
    this.set({ path: null, lesson: newLesson(), dirty: true, error: '' });
    await this.save();
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.pending]);
    try {
      if (this.timer) clearTimeout(this.timer);
      if (this.state.dirty) await this.save();
      await this.tail;
      await this.rehearsal.save(this.ctx);
      await this.ctx.audience?.close();
    } catch (error) {
      this.closing = false;
      throw error;
    }
  }
}
