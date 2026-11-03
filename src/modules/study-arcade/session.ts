import type { ModuleContext } from '@core/api';
import { newBank, parseBank, score, type Bank, type Result } from './model';
export class StudySession {
  state = { bank: newBank(), path: '', files: [] as string[], dirty: false, error: '' };
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
  round: {
    bank: string;
    started: string;
    seconds: number;
    results: Result[];
    complete: boolean;
  } | null = null;
  constructor(readonly ctx: ModuleContext) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  set(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => {
      fn();
    });
  }
  edit(bank: Bank) {
    this.set({ bank, dirty: true });
  }
  async refresh() {
    const files = (await this.ctx.vault.exists('Teaching/Quizzes'))
      ? (await this.ctx.vault.listDir('Teaching/Quizzes'))
          .filter((e) => e.name.endsWith('.quiz.yaml'))
          .map((e) => `Teaching/Quizzes/${e.name}`)
      : [];
    this.set({ files });
  }
  save(): Promise<void> {
    const task = this.tail
      .catch(() => {
        /* Allow explicit retry. */
      })
      .then(async () => {
        if (!this.state.dirty && this.state.path) return;
        const { bank, path } = this.state;
        try {
          await this.ctx.vault.ensureDir('Teaching/Quizzes');
          const saved =
            path ||
            (await this.ctx.vault.createRecord('Teaching/Quizzes', bank.title, 'quiz', {
              ...bank,
            }));
          if (path) await this.ctx.vault.updateRecord(path, { ...bank });
          this.set({
            path: saved,
            dirty: bank !== this.state.bank,
            error: '',
            files: [...new Set([...this.state.files, saved])],
          });
        } catch (e) {
          this.set({ error: String(e), dirty: true });
          throw e;
        }
      });
    this.tail = task;
    return task;
  }
  async select(path: string) {
    if (this.state.dirty) await this.save();
    await this.saveRound();
    const r = await this.ctx.vault.readRecord(path);
    if (r.error) throw new Error(r.error);
    this.set({ path, bank: parseBank(r.data), dirty: false, error: '' });
  }
  async create() {
    if (this.state.dirty) await this.save();
    await this.saveRound();
    this.set({ path: '', bank: newBank(), dirty: true, error: '' });
    await this.save();
  }
  async saveRound() {
    if (!this.round) return;
    const r = this.round;
    await this.ctx.vault.ensureDir('Teaching/Practice');
    await this.ctx.vault.createRecord(
      'Teaching/Practice',
      r.started.replaceAll(':', '-'),
      'practice',
      { ...r, ...score(r.results) },
    );
    if (this.round === r) this.round = null;
  }
  startRound() {
    this.round = {
      bank: this.state.path,
      started: new Date().toISOString(),
      seconds: 0,
      results: [],
      complete: false,
    };
  }
  updateTime(seconds: number) {
    if (this.round) this.round.seconds = seconds;
  }
  completeRound(complete: boolean) {
    if (this.round) this.round.complete = complete;
  }
  answer(question: string, correct: boolean) {
    this.round?.results.push({ question, correct });
  }
  async close() {
    this.closing = true;
    await Promise.allSettled([...this.pending]);
    try {
      if (this.state.dirty) await this.save();
      await this.tail;
      await this.saveRound();
    } catch (error) {
      this.closing = false;
      throw error;
    }
  }
}
