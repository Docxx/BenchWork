/**
 * A cross's timetable: from the day it was set up and its temperature,
 * when to move the parents on, when the first progeny hatch, and the last
 * day to collect them before their own young (the next generation) start
 * hatching. Each step can be ticked off on the cross.
 */

export const TEMPERATURES = [18, 25, 29] as const;
export type Temperature = (typeof TEMPERATURES)[number];

/** Days after setting up, for one temperature. */
export interface Timing {
  /** Move the parents to a fresh vial. */
  flip: number;
  /** The first progeny hatch. */
  hatch: number;
  /** Last day to collect or score, before the next generation hatches. */
  last: number;
  /** How often to collect virgins, in hours. */
  virginHours: number;
}

/** Usual timings; changeable in the Fly room settings. */
export const DEFAULT_TIMINGS: Record<Temperature, Timing> = {
  18: { flip: 6, hatch: 19, last: 36, virginHours: 16 },
  25: { flip: 3, hatch: 10, last: 18, virginHours: 8 },
  29: { flip: 3, hatch: 8, last: 15, virginHours: 6 },
};

export type StepId = 'flip' | 'hatch' | 'collect' | 'last';

export interface Step {
  id: StepId;
  title: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** For collecting: the last day of the window. */
  until?: string;
  hint?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The nearest temperature with a timing: 22 °C counts as 25. */
export function nearestTemperature(degrees: number): Temperature {
  return TEMPERATURES.reduce((best, t) =>
    Math.abs(t - degrees) < Math.abs(best - degrees) ? t : best,
  );
}

/** A cross's steps, in date order; none if the set-up date is not a date. */
export function steps(
  setUp: string,
  degrees: number,
  timings: Record<Temperature, Timing> = DEFAULT_TIMINGS,
): Step[] {
  if (!DAY.test(setUp)) return [];
  const t = timings[nearestTemperature(degrees)];
  return [
    { id: 'flip', title: 'Move the parents to a fresh vial', date: addDays(setUp, t.flip) },
    { id: 'hatch', title: 'First progeny hatch', date: addDays(setUp, t.hatch) },
    {
      id: 'collect',
      title: 'Collect virgins',
      date: addDays(setUp, t.hatch),
      until: addDays(setUp, t.last),
      hint: `Clear the vial, then collect every ${String(t.virginHours)} hours.`,
    },
    { id: 'last', title: 'Last day to collect', date: addDays(setUp, t.last) },
  ];
}

/** Steps not ticked off that are due on or before `today`. */
export function dueSteps(all: readonly Step[], done: readonly string[], today: string): Step[] {
  return all.filter((s) => !done.includes(s.id) && s.date <= today);
}
