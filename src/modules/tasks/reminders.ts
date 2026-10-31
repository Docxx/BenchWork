import type { ModuleContext } from '@core/api';
import type { TaskStore } from './store';
import type { Task } from './tasks';

/** How often reminders are looked for, in ms. */
export const CHECK_MS = 15_000;
/** Reminders missed by more than this, such as while the app was closed, stay quiet. */
export const LATE_MS = 12 * 60 * 60_000;

const FILE = 'reminders.json';

/** A reminder's time as a local Date. */
export function reminderTime(remind: string): Date {
  return new Date(`${remind}:00`);
}

/** A reminder's key: the same task and time is only ever shown once. */
export const reminderKey = (t: Task): string => `${t.path}|${t.text}|${t.remind ?? ''}`;

/** Reminders that are due at `now` and not yet shown. */
export function dueReminders(
  tasks: readonly Task[],
  shown: ReadonlySet<string>,
  now: Date,
): Task[] {
  return tasks.filter((t) => {
    if (t.remind === null || t.state === 'done' || shown.has(reminderKey(t))) return false;
    const at = reminderTime(t.remind).getTime();
    return at <= now.getTime() && at > now.getTime() - LATE_MS;
  });
}

/** A short chime, where the device can play sound. */
function chime(): void {
  try {
    const audio = new AudioContext();
    [660, 880].forEach((hz, i) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = hz;
      gain.gain.value = 0.12;
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + i * 0.25);
      tone.stop(audio.currentTime + i * 0.25 + 0.2);
    });
    setTimeout(() => void audio.close(), 1000);
  } catch {
    // No sound here; the message still shows.
  }
}

/**
 * Shows each task's reminder once, when its time comes, while the app is
 * open. Which ones were shown is kept in the module's folder, so a restart
 * does not show them again.
 */
export class Reminders {
  private shown = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly store: TaskStore,
    private readonly alert: (task: Task) => void = (task) => {
      chime();
      ctx.app.notify(`Reminder: ${task.text}`);
    },
  ) {}

  async start(): Promise<void> {
    const saved = await this.ctx.storage.read<{ shown?: unknown }>(FILE).catch(() => null);
    if (Array.isArray(saved?.shown)) {
      this.shown = new Set(saved.shown.filter((k): k is string => typeof k === 'string'));
    }
    this.timer = setInterval(() => {
      this.check();
    }, CHECK_MS);
    this.check();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  check(now = new Date()): void {
    if (!this.store.loaded) return;
    const due = dueReminders(this.store.all(), this.shown, now);
    if (due.length === 0) return;
    for (const task of due) {
      this.shown.add(reminderKey(task));
      this.alert(task);
    }
    // Only recent ones need remembering.
    const keep = [...this.shown].slice(-500);
    void this.ctx.storage.write(FILE, { shown: keep }).catch(() => undefined);
  }
}
