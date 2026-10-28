/**
 * "Updated 12 min ago" from a page's `modified` time, which BenchWork
 * writes as local time (2026-10-27T14:03:12). Null if there is none.
 */
export function updatedText(modified: unknown, now: Date = new Date()): string | null {
  if (typeof modified !== 'string') return null;
  const time = new Date(modified);
  if (Number.isNaN(time.getTime())) return null;
  const minutes = Math.floor((now.getTime() - time.getTime()) / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  const sameDay = time.toDateString() === now.toDateString();
  if (sameDay) return `Updated ${String(hours)} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (time.toDateString() === yesterday.toDateString()) return 'Updated yesterday';
  const day = time.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(time.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `Updated ${day}`;
}
