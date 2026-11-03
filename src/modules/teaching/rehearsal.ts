import type { ModuleContext } from '@core/api';
export interface Practice {
  lesson: string;
  started: string;
  seconds: number;
  timings: Record<string, number>;
  bookmarks: { slide: string; seconds: number; note: string }[];
  notes: string;
}
/** Time is monotonic; pausing and changing slides never double-count a section. */
export class Rehearsal {
  practice: Practice | null = null;
  running = false;
  private tick = 0;
  private slide = '';
  constructor(private now: () => number = () => performance.now()) {}
  start(lesson: string, slide: string) {
    this.practice = {
      lesson,
      started: new Date().toISOString(),
      seconds: 0,
      timings: {},
      bookmarks: [],
      notes: '',
    };
    this.slide = slide;
    this.running = true;
    this.tick = this.now();
  }
  sample() {
    if (!this.running || !this.practice) return;
    const next = this.now();
    const elapsed = Math.max(0, (next - this.tick) / 1000);
    this.tick = next;
    this.practice.seconds += elapsed;
    this.practice.timings[this.slide] = (this.practice.timings[this.slide] ?? 0) + elapsed;
  }
  change(slide: string) {
    this.sample();
    this.slide = slide;
  }
  pause() {
    this.sample();
    this.running = false;
  }
  resume() {
    if (this.practice) {
      this.tick = this.now();
      this.running = true;
    }
  }
  bookmark(note: string) {
    this.sample();
    this.practice?.bookmarks.push({ slide: this.slide, seconds: this.practice.seconds, note });
  }
  setNotes(notes: string) {
    if (this.practice) this.practice.notes = notes;
  }
  async save(ctx: ModuleContext) {
    this.pause();
    if (!this.practice) return;
    const snapshot = this.practice;
    await ctx.vault.ensureDir('Teaching/Rehearsals');
    await ctx.vault.createRecord(
      'Teaching/Rehearsals',
      snapshot.started.replaceAll(':', '-'),
      'rehearsal',
      { ...snapshot },
    );
    if (this.practice === snapshot) this.practice = null;
  }
}
