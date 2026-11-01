// @vitest-environment node
import { createModuleContext } from '@core/modules/context';
import { createContributions } from '@core/modules/contributions';
import { manifest } from '@core/modules/testModules';
import { MemoryAdapter } from '@core/platform/memory';
import { moveSlide, newLesson, newSlide, parseLesson, publicFrame } from './model';
import { TeachingSession } from './session';
import { Rehearsal } from './rehearsal';
import { importSlides, noteText } from './materials';

async function setup() {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': {} } });
  await platform.setVaultRoot('C:/Vault');
  const { ctx } = createModuleContext(manifest('teaching'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  return { platform, ctx };
}
it('turns a note into readable audience text without metadata or formatting syntax', () => {
  expect(
    noteText(
      '---\ntags: [private]\n---\n# Title\n\n**Strong** [source](https://example.org) and [[Page|Label]]',
    ),
  ).toBe('Title\n\nStrong source and Label');
});
it('projects only public content and removes everything during blackout', () => {
  const lesson = newLesson();
  const slide = {
    ...newSlide(),
    title: 'Public',
    body: 'First\nSecond',
    notes: 'SECRET speaker notes',
    source: 'Private/source.md',
  };
  expect(publicFrame(lesson, slide, null, 1)).toMatchObject({ title: 'Public', body: 'First' });
  expect(JSON.stringify(publicFrame(lesson, slide, null))).not.toMatch(/SECRET|source|notes/);
  expect(publicFrame(lesson, slide, 'data:image/png;base64,abc', 5, true)).toMatchObject({
    title: '',
    body: '',
    image: null,
    strokes: [],
    blank: true,
  });
});
it('keeps slide identity and private notes when reordering a reusable lesson', () => {
  const first = { ...newSlide(), notes: 'Keep me' };
  const second = newSlide();
  const parsed = parseLesson({ ...newLesson(), slides: [first, second] });
  expect(moveSlide(parsed.slides, 0, 1).map((s) => s.id)).toEqual([second.id, first.id]);
  expect(moveSlide(parsed.slides, 0, -1)).toBe(parsed.slides);
  expect(parsed.slides[0]?.notes).toBe('Keep me');
  expect(
    parseLesson({ slides: [{ ...first, image: '../escape.png', minutes: NaN }] }).slides[0],
  ).toMatchObject({ image: null, minutes: 2 });
  expect(() => parseLesson({ slides: 'broken' })).toThrow();
});
it('retains edits after a failed save and retries without replacing an unreadable lesson', async () => {
  const { ctx } = await setup();
  const session = new TeachingSession(ctx);
  await session.create();
  const path = session.state.path ?? '';
  session.edit({ ...session.state.lesson, title: 'Changed' });
  const write = vi.spyOn(ctx.vault, 'updateRecord').mockRejectedValueOnce(new Error('Disk full'));
  await expect(session.save()).rejects.toThrow('Disk full');
  expect(session.state).toMatchObject({ dirty: true, lesson: { title: 'Changed' } });
  await session.save();
  expect(write).toHaveBeenCalledTimes(2);
  expect((await ctx.vault.readRecord(path)).data.title).toBe('Changed');
  await ctx.vault.writeText('Teaching/Lessons/broken.lesson.yaml', ': [broken');
  await expect(session.select('Teaching/Lessons/broken.lesson.yaml')).rejects.toThrow();
  expect(session.state.path).toBe(path);
  await session.close();
});
it('serialises saves and preserves edits made while a save is pending', async () => {
  const { ctx } = await setup();
  const session = new TeachingSession(ctx);
  await session.create();
  let release: (() => void) | undefined;
  const original = ctx.vault.updateRecord.bind(ctx.vault);
  vi.spyOn(ctx.vault, 'updateRecord').mockImplementationOnce(async (path, changes) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await original(path, changes);
  });
  session.edit({ ...session.state.lesson, title: 'First' });
  const first = session.save();
  await vi.waitFor(() => {
    expect(release).toBeDefined();
  });
  session.edit({ ...session.state.lesson, title: 'Second' });
  const second = session.save();
  release?.();
  await Promise.all([first, second]);
  expect((await ctx.vault.readRecord(session.state.path ?? '')).data.title).toBe('Second');
  expect(session.state.dirty).toBe(false);
  await session.close();
});
it('accounts for pauses, slide changes and bookmarks using monotonic time', async () => {
  const { ctx } = await setup();
  let now = 0;
  const practice = new Rehearsal(() => now);
  practice.start('Teaching/Lessons/talk.lesson.yaml', 'a');
  now = 3000;
  practice.change('b');
  now = 5000;
  practice.bookmark('Explain this');
  practice.pause();
  now = 100000;
  practice.resume();
  now = 101000;
  practice.pause();
  expect(practice.practice).toMatchObject({
    seconds: 6,
    timings: { a: 3, b: 3 },
    bookmarks: [{ slide: 'b', seconds: 5, note: 'Explain this' }],
  });
  await practice.save(ctx);
  expect(practice.practice).toBeNull();
  const files = await ctx.vault.listDir('Teaching/Rehearsals');
  expect(files).toHaveLength(1);
  expect((await ctx.vault.readRecord(files[0]?.path ?? '')).data).toMatchObject({ seconds: 6 });
});
it('imports PowerPoint slide snapshots and private notes without changing the source', async () => {
  const { ctx, platform } = await setup();
  platform.usePowerPointImporter((_, folder) =>
    Promise.resolve({
      source: `${folder}/talk.pptx`,
      slides: [{ title: 'Welcome', notes: 'Private', image: `${folder}/slide-1.png` }],
    }),
  );
  const slides = await importSlides(ctx, 'C:/Talk/talk.pptx');
  expect(slides[0]).toMatchObject({ title: 'Welcome', notes: 'Private' });
  expect(JSON.stringify(publicFrame(newLesson(), slides[0], null))).not.toContain('Private');
  await expect(importSlides(ctx, 'C:/Talk/program.exe')).rejects.toThrow('Choose a PDF');
});
it('waits for an in-flight import before saving and releasing its vault', async () => {
  const { ctx } = await setup();
  const session = new TeachingSession(ctx);
  await session.create();
  let release: (() => void) | undefined;
  const pending = session.perform(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    session.edit({ ...session.state.lesson, title: 'Imported talk' });
  });
  let closed = false;
  const closing = session.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  release?.();
  await pending;
  await closing;
  expect((await ctx.vault.readRecord(session.state.path ?? '')).data.title).toBe('Imported talk');
});
