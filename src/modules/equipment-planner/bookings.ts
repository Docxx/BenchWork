import type { ModuleContext } from '@core/api';
import { text, type Entry } from '../research/api';

export function localTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function validTime(value: string): boolean {
  const date = new Date(value);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    localTime(date) === value
  );
}
export function overlaps(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
): boolean {
  return start < otherEnd && end > otherStart;
}
async function equipmentPath(
  ctx: ModuleContext,
  value: unknown,
  from: string,
): Promise<string | null> {
  return ctx.app.resolveLink(text(value).replace(/^\[\[|\]\]$/g, ''), from);
}
export async function clashes(
  ctx: ModuleContext,
  data: Record<string, unknown>,
  entries: Entry[],
  current: Entry | null,
): Promise<Entry[]> {
  const equipment = await equipmentPath(
    ctx,
    data['equipment'],
    current?.path ?? 'Research/Bookings/new.booking.yaml',
  );
  const conflicts: Entry[] = [];
  for (const other of entries.filter(
    (e) => e.type === 'booking' && e.path !== current?.path && e.data['status'] !== 'cancelled',
  )) {
    if ((await equipmentPath(ctx, other.data['equipment'], other.path)) !== equipment) continue;
    if (
      overlaps(
        text(data['start']),
        text(data['end']),
        text(other.data['start']),
        text(other.data['end']),
      )
    )
      conflicts.push(other);
  }
  return conflicts;
}
export async function validateBooking(
  ctx: ModuleContext,
  data: Record<string, unknown>,
  entries: Entry[],
  current: Entry | null,
): Promise<string | null> {
  const start = text(data['start']);
  const end = text(data['end']);
  if (!validTime(start) || !validTime(end) || end <= start)
    return 'Choose valid start and end times, with the end after the start.';
  const path = await equipmentPath(ctx, data['equipment'], current?.path ?? '');
  const equipment = entries.find((e) => e.path === path && e.type === 'equipment');
  if (!equipment) return 'Choose an equipment record.';
  if (data['status'] === 'cancelled') return null;
  if (equipment.data['status'] === 'out of service') return 'This equipment is out of service.';
  const found = await clashes(ctx, data, entries, current);
  return found.length
    ? `Overlaps ${found.map((e) => e.title).join(', ')}. Change the times or request a suggestion.`
    : null;
}
export async function suggestBooking(
  ctx: ModuleContext,
  data: Record<string, unknown>,
  entries: Entry[],
  current: Entry | null = null,
): Promise<Record<string, unknown>> {
  let start = text(data['start']);
  let end = text(data['end']);
  if (!validTime(start) || !validTime(end) || end <= start)
    throw new Error('Enter the desired start and end times first.');
  const duration = new Date(end).getTime() - new Date(start).getTime();
  for (let i = 0; i < 1000; i += 1) {
    const conflicts = await clashes(ctx, { ...data, start, end }, entries, current);
    if (!conflicts.length) return { start, end };
    const next = conflicts
      .map((e) => text(e.data['end']))
      .sort()
      .at(-1);
    if (!next || !validTime(next)) throw new Error('An existing booking has invalid dates.');
    start = next;
    end = localTime(new Date(new Date(start).getTime() + duration));
  }
  throw new Error('No free slot was found. Choose another date or equipment item.');
}
