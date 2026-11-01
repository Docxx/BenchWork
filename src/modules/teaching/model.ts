import type { AudienceFrame, ModuleContext } from '@core/api';

export interface Slide {
  id: string;
  title: string;
  body: string;
  notes: string;
  minutes: number;
  image: string | null;
  pdfPage: number | null;
  source: string | null;
  reveal: boolean;
  strokes: AudienceFrame['strokes'];
}
export interface Lesson {
  title: string;
  purpose: 'lecture' | 'seminar' | 'tutorial';
  background: string;
  foreground: string;
  accent: string;
  slides: Slide[];
}
export const newSlide = (): Slide => ({
  id: crypto.randomUUID(),
  title: 'Untitled slide',
  body: '',
  notes: '',
  minutes: 2,
  image: null,
  pdfPage: null,
  source: null,
  reveal: false,
  strokes: [],
});
export const newLesson = (): Lesson => ({
  title: 'New lesson',
  purpose: 'lecture',
  background: '#101b2c',
  foreground: '#f0f5ff',
  accent: '#67d9ed',
  slides: [newSlide()],
});
const colour = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const text = (v: unknown, max = 100000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const path = (v: unknown): string | null =>
  typeof v === 'string' && v.length < 1000 && !/^[a-z]:|^[/\\]|(^|[/\\])\.\.([/\\]|$)/i.test(v)
    ? v
    : null;
export function parseLesson(data: Record<string, unknown>): Lesson {
  if (!Array.isArray(data.slides) || data.slides.length > 1000)
    throw new Error('This lesson needs a valid slide list (up to 1,000 slides).');
  const base = newLesson();
  return {
    title: text(data.title, 500) || 'Untitled lesson',
    purpose: data.purpose === 'seminar' || data.purpose === 'tutorial' ? data.purpose : 'lecture',
    background: colour(data.background, base.background),
    foreground: colour(data.foreground, base.foreground),
    accent: colour(data.accent, base.accent),
    slides: data.slides.map((value: unknown): Slide => {
      if (!value || typeof value !== 'object') throw new Error('A slide could not be read.');
      const s = value as Record<string, unknown>;
      const strokes: AudienceFrame['strokes'] = [];
      if (Array.isArray(s.strokes))
        for (const raw of s.strokes.slice(0, 2000)) {
          if (!raw || typeof raw !== 'object') continue;
          const stroke = raw as Record<string, unknown>;
          if (!Array.isArray(stroke.points)) continue;
          const points = stroke.points
            .slice(0, 1000)
            .filter(
              (p: unknown): p is [number, number] =>
                Array.isArray(p) &&
                p.length === 2 &&
                p.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000),
            );
          strokes.push({
            colour: colour(stroke.colour, '#ffce63'),
            width:
              typeof stroke.width === 'number' && Number.isFinite(stroke.width)
                ? Math.max(1, Math.min(20, stroke.width))
                : 3,
            points,
          });
        }
      return {
        id: text(s.id, 100) || crypto.randomUUID(),
        title: text(s.title, 1000),
        body: text(s.body),
        notes: text(s.notes),
        minutes:
          typeof s.minutes === 'number' && Number.isFinite(s.minutes)
            ? Math.max(0.1, Math.min(180, s.minutes))
            : 2,
        image: path(s.image),
        pdfPage:
          typeof s.pdfPage === 'number' && Number.isInteger(s.pdfPage) && s.pdfPage > 0
            ? s.pdfPage
            : null,
        source: path(s.source),
        reveal: s.reveal === true,
        strokes,
      };
    }),
  };
}
/** Deliberately construct public fields. Never spread a lesson or slide into this payload. */
export function publicFrame(
  lesson: Lesson,
  slide: Slide | undefined,
  image: string | null,
  lines = Infinity,
  blank = false,
): AudienceFrame {
  return {
    title: blank ? '' : (slide?.title ?? lesson.title),
    body: blank ? '' : (slide?.body ?? '').split('\n').slice(0, lines).join('\n'),
    image: blank ? null : image,
    background: lesson.background,
    foreground: lesson.foreground,
    accent: lesson.accent,
    blank,
    strokes: blank ? [] : (slide?.strokes ?? []),
  };
}
export function moveSlide(slides: Slide[], index: number, by: number): Slide[] {
  const next = index + by;
  if (next < 0 || next >= slides.length) return slides;
  const copy = [...slides];
  const first = copy[index];
  const second = copy[next];
  if (!first || !second) return slides;
  copy[index] = second;
  copy[next] = first;
  return copy;
}
export const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export async function lessonFiles(ctx: ModuleContext): Promise<string[]> {
  if (!(await ctx.vault.exists('Teaching/Lessons'))) return [];
  return (await ctx.vault.listDir('Teaching/Lessons'))
    .filter((e) => !e.isDir && e.name.endsWith('.lesson.yaml'))
    .map((e) => `Teaching/Lessons/${e.name}`);
}
