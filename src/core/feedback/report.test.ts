// @vitest-environment node
import { mailDraft, newFeedback, reportSubject, reportText, DOWNLOADS_URL } from './report';
import { createAppStore } from '../state/appStore';
import { MemoryAdapter } from '../platform/memory';
it('builds reviewed reports with an explicit whitelist of optional app details', () => {
  const draft = {
    ...newFeedback(),
    title: 'Timer stopped',
    description: 'The timer disappeared.',
    area: 'Research tools',
    steps: 'Start a timer, then change views.',
    expected: 'The timer should keep running.',
  };
  const environment = {
    version: '0.15.0',
    build: 'test-build',
    device: 'tablet' as const,
    vaultPath: '/private/vault',
    token: 'private-token',
    notes: 'secret notes',
  };
  const report = reportText(draft, environment);
  expect(report).toContain('Steps to reproduce');
  expect(report).toContain('Android tablet');
  expect(report).not.toMatch(/private-token|secret notes|\/private\/vault/);
  expect(reportText(draft, null)).not.toMatch(/Version:|Build:|Device:/);
  expect(reportSubject({ ...draft, title: 'Header\r\nBcc: example' })).not.toMatch(/[\r\n]/);
  expect(reportText({ ...draft, kind: 'idea' }, environment)).not.toContain('Steps to reproduce');
});
it('keeps long and non-ASCII reports available for copying when email links would be too long', () => {
  const normal = mailDraft('Report', 'Useful details.');
  expect(normal.needsPaste).toBe(false);
  expect(normal.body).toBe('Useful details.');
  const long = mailDraft('Report', '🧪'.repeat(1000));
  expect(long.needsPaste).toBe(true);
  expect(long.body).toContain('paste');
});
it('does not send or open anything automatically and remembers hiding the preview bar', async () => {
  const platform = new MemoryAdapter({ appSettings: { guided: true } });
  const store = createAppStore(platform);
  await store.getState().start();
  expect(platform.feedbackDrafts).toEqual([]);
  expect(platform.openedLinks).toEqual([]);
  await store.getState().openFeedbackEmail('Report', 'Reviewed details');
  expect(platform.feedbackDrafts).toEqual([{ subject: 'Report', body: 'Reviewed details' }]);
  await store.getState().openLatestInstaller();
  expect(platform.openedLinks).toEqual([DOWNLOADS_URL]);
  await store.getState().setPreviewBarVisible(false);
  expect(
    ((await platform.loadAppSettings()) as { previewBarVisible: boolean }).previewBarVisible,
  ).toBe(false);
});
