// @vitest-environment node
import { createModuleContext } from '@core/modules/context';
import { createContributions } from '@core/modules/contributions';
import { manifest } from '@core/modules/testModules';
import { MemoryAdapter } from '@core/platform/memory';
import { newBank, newQuestion, parseBank, readyQuestions, score } from './model';
import { StudySession } from './session';
it('requires usable questions and scores personal answers independently of question type', () => {
  const bank = newBank();
  bank.questions.push(
    { ...newQuestion(), prompt: 'Recall?', answer: 'Yes' },
    { ...newQuestion(), prompt: 'Choose?', options: ['A', 'B'], correct: 1 },
  );
  expect(readyQuestions(bank)).toHaveLength(2);
  expect(
    score([
      { question: 'a', correct: true },
      { question: 'b', correct: false },
    ]),
  ).toEqual({ correct: 1, total: 2, points: 100 });
  expect(
    parseBank({
      ...bank,
      questions: [
        { ...bank.questions[1], image: 'https://tracker.invalid/image.png', correct: 99 },
      ],
    }).questions[0],
  ).toMatchObject({ correct: 0 });
  expect(() => parseBank({ title: 'Broken', questions: ['oops'] })).toThrow();
});
it('saves banks and unfinished personal rounds before a module closes', async () => {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': {} } });
  await platform.setVaultRoot('C:/Vault');
  const { ctx } = createModuleContext(manifest('study-arcade'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const session = new StudySession(ctx);
  await session.create();
  session.edit({ ...session.state.bank, title: 'Revision' });
  session.round = {
    bank: session.state.path,
    started: new Date().toISOString(),
    seconds: 20,
    complete: false,
    results: [{ question: 'one', correct: true }],
  };
  await session.close();
  expect((await ctx.vault.readRecord(session.state.path)).data.title).toBe('Revision');
  const records = await ctx.vault.listDir('Teaching/Practice');
  expect((await ctx.vault.readRecord(records[0]?.path ?? '')).data).toMatchObject({
    correct: 1,
    points: 100,
    complete: false,
  });
});
