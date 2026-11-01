import { version } from '../../../package.json';
export const FEEDBACK_EMAIL = 'raywprice@gmail.com';
export const DOWNLOADS_URL = 'https://github.com/Docxx/BenchWork/releases';
/** Set VITE_PREVIEW_TOOLS=false for builds after the testing period. */
export const PREVIEW_BUILD = import.meta.env['VITE_PREVIEW_TOOLS'] !== 'false';
export const APP_VERSION = version;
const configuredBuild: unknown = import.meta.env['VITE_BUILD_ID'];
export const BUILD_ID = typeof configuredBuild === 'string' ? configuredBuild : 'development';
export type FeedbackKind = 'bug' | 'idea' | 'feedback';
export interface FeedbackDraft {
  kind: FeedbackKind;
  title: string;
  description: string;
  area: string;
  steps: string;
  expected: string;
}
export interface FeedbackEnvironment {
  version: string;
  build: string;
  device: 'desktop' | 'tablet';
}
export const newFeedback = (): FeedbackDraft => ({
  kind: 'bug',
  title: '',
  description: '',
  area: 'General',
  steps: '',
  expected: '',
});
export function reportText(draft: FeedbackDraft, environment: FeedbackEnvironment | null): string {
  const kind =
    draft.kind === 'bug' ? 'Bug report' : draft.kind === 'idea' ? 'Suggestion' : 'Feedback';
  const sections = [
    `BenchWork ${kind}`,
    draft.title.trim(),
    `Area: ${draft.area}`,
    draft.description.trim(),
  ];
  if (draft.kind === 'bug' && draft.steps.trim())
    sections.push(`Steps to reproduce\n${draft.steps.trim()}`);
  if (draft.kind === 'bug' && draft.expected.trim())
    sections.push(`Expected behaviour\n${draft.expected.trim()}`);
  if (environment)
    sections.push(
      `App details\nVersion: ${environment.version}\nBuild: ${environment.build}\nDevice: ${environment.device === 'tablet' ? 'Android tablet' : 'Desktop'}`,
    );
  return sections.filter(Boolean).join('\n\n');
}
export function reportSubject(draft: FeedbackDraft): string {
  const kind = draft.kind === 'bug' ? 'Bug' : draft.kind === 'idea' ? 'Suggestion' : 'Feedback';
  return `[BenchWork ${kind}] ${draft.title
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 120)}`;
}
/** Email clients vary in their URL limits. Longer reports remain available to copy. */
export function mailDraft(
  subject: string,
  report: string,
): { subject: string; body: string; needsPaste: boolean } {
  const needsPaste = encodeURIComponent(subject).length + encodeURIComponent(report).length > 5500;
  return {
    subject,
    body: needsPaste
      ? 'Please paste the report copied from BenchWork below this line.\n\n'
      : report,
    needsPaste,
  };
}
