import { useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';

export interface Timer {
  id: string;
  name: string;
  /** The whole length, in ms. */
  length: number;
  /** When it ends, in ms since 1970, while running; null while paused or stopped. */
  endsAt: number | null;
  /** What is left while paused, in ms. */
  left: number;
  done: boolean;
}

export interface Stopwatch {
  /** When it was last started, while running. */
  startedAt: number | null;
  /** Time counted before that, in ms. */
  counted: number;
}

const FILE = 'timers.json';

/** What is left of a timer at `now`, in ms. */
export function timeLeft(timer: Timer, now: number): number {
  if (timer.done) return 0;
  return timer.endsAt === null ? timer.left : Math.max(0, timer.endsAt - now);
}

export function stopwatchTime(watch: Stopwatch, now: number): number {
  return watch.counted + (watch.startedAt === null ? 0 : now - watch.startedAt);
}

/** `1:05:09` or `4:07`, rounding up so a timer shows 0:00 only when it is done. */
export function clock(ms: number, roundUp = true): string {
  const total = roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${String(h)}:${pad(m)}:${pad(s)}` : `${String(m)}:${pad(s)}`;
}

/** A few short beeps, where the device can play sound. */
function beep(): void {
  try {
    const audio = new AudioContext();
    for (let i = 0; i < 3; i += 1) {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = 880;
      gain.gain.value = 0.15;
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + i * 0.35);
      tone.stop(audio.currentTime + i * 0.35 + 0.2);
    }
    setTimeout(() => void audio.close(), 1500);
  } catch {
    // No sound here; the message still shows.
  }
}

/**
 * Bench timers that keep running while other things are open, and across a
 * restart: each running timer is saved with the time it ends.
 */
export class TimerStore {
  private timers: Timer[] = [];
  private watch: Stopwatch = { startedAt: null, counted: 0 };
  private listeners = new Set<() => void>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private snapshot: { timers: Timer[]; watch: Stopwatch; now: number } = {
    timers: [],
    watch: this.watch,
    now: Date.now(),
  };

  constructor(
    private readonly ctx: ModuleContext,
    private readonly alert: (timer: Timer) => void = (timer) => {
      beep();
      ctx.app.notify(`Timer done: ${timer.name}`);
    },
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  state = () => this.snapshot;

  async load(): Promise<void> {
    const saved = await this.ctx.storage.read<{ timers?: Timer[] }>(FILE).catch(() => null);
    this.timers = Array.isArray(saved?.timers) ? saved.timers : [];
    this.tick();
  }

  dispose(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
  }

  private changed(save: boolean): void {
    this.snapshot = { timers: [...this.timers], watch: { ...this.watch }, now: Date.now() };
    for (const l of this.listeners) l();
    const running = this.timers.some((t) => t.endsAt !== null) || this.watch.startedAt !== null;
    if (running && this.ticker === null)
      this.ticker = setInterval(() => {
        this.tick();
      }, 250);
    if (!running && this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (save) void this.ctx.storage.write(FILE, { timers: this.timers }).catch(() => undefined);
  }

  /** Finishes timers whose time is up, then tells the views. */
  tick(now = Date.now()): void {
    let finished = false;
    for (const timer of this.timers) {
      if (timer.endsAt !== null && timer.endsAt <= now) {
        timer.endsAt = null;
        timer.left = 0;
        timer.done = true;
        finished = true;
        this.alert(timer);
      }
    }
    this.changed(finished);
  }

  add(name: string, length: number): void {
    if (!(length > 0)) return;
    const timer: Timer = {
      id: crypto.randomUUID().slice(0, 8),
      name: name.trim() === '' ? 'Timer' : name.trim(),
      length,
      endsAt: Date.now() + length,
      left: length,
      done: false,
    };
    this.timers.push(timer);
    this.changed(true);
  }

  private update(id: string, change: (t: Timer) => void): void {
    const timer = this.timers.find((t) => t.id === id);
    if (!timer) return;
    change(timer);
    this.changed(true);
  }

  pause(id: string): void {
    this.update(id, (t) => {
      if (t.endsAt === null) return;
      t.left = Math.max(0, t.endsAt - Date.now());
      t.endsAt = null;
    });
  }

  resume(id: string): void {
    this.update(id, (t) => {
      if (t.endsAt !== null || t.done) return;
      t.endsAt = Date.now() + t.left;
    });
  }

  /** Back to its full length, stopped. */
  reset(id: string): void {
    this.update(id, (t) => {
      t.endsAt = null;
      t.left = t.length;
      t.done = false;
    });
  }

  /** Adds time, such as one more minute. */
  extend(id: string, ms: number): void {
    this.update(id, (t) => {
      if (t.done) {
        t.done = false;
        t.endsAt = Date.now() + ms;
        t.left = ms;
      } else if (t.endsAt !== null) {
        t.endsAt += ms;
      } else {
        t.left += ms;
      }
    });
  }

  remove(id: string): void {
    this.timers = this.timers.filter((t) => t.id !== id);
    this.changed(true);
  }

  startStopwatch(): void {
    if (this.watch.startedAt === null) this.watch.startedAt = Date.now();
    this.changed(false);
  }

  stopStopwatch(): void {
    if (this.watch.startedAt !== null) {
      this.watch.counted += Date.now() - this.watch.startedAt;
      this.watch.startedAt = null;
    }
    this.changed(false);
  }

  resetStopwatch(): void {
    this.watch = { startedAt: null, counted: 0 };
    this.changed(false);
  }
}

export function useTimers(store: TimerStore) {
  return useSyncExternalStore(store.subscribe, store.state);
}
