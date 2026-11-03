import type { ModuleContext } from '@core/api';
import { link, relatedEntries, saveEntry, text, validDay, type Entry } from '../research/api';

export function actionLines(value: unknown): string[] {
  return [
    ...new Set(
      text(value)
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[-*]\s*(?:\[[ xX]\]\s*)?/, '').trim())
        .filter(Boolean),
    ),
  ];
}
export async function prepareAgenda(
  ctx: ModuleContext,
  meeting: Entry,
  entries: Entry[],
): Promise<void> {
  const linked = await relatedEntries(ctx, meeting, entries);
  const old = text(meeting.data['agenda']);
  const additions = linked
    .filter((entry) => ['experiment', 'question'].includes(entry.type))
    .map(
      (entry) =>
        `${entry.title}: ${text(entry.data['status']) || 'review'}${text(entry.data['conclusion']) ? `\nConclusion: ${text(entry.data['conclusion'])}` : ''}${text(entry.data['next']) || text(entry.data['nextTest']) ? `\nNext: ${text(entry.data['next']) || text(entry.data['nextTest'])}` : ''}`,
    )
    .filter((section) => !old.includes(section));
  if (!additions.length)
    throw new Error('Link experiments or questions first, or the agenda is already up to date.');
  await saveEntry(ctx, meeting, { agenda: [old, ...additions].filter(Boolean).join('\n\n') });
}
async function actionId(meeting: Entry, action: string): Promise<string> {
  const bytes = new TextEncoder().encode(action);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)]
    .slice(0, 10)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `meeting-${text(meeting.data['id']).replace(/[^a-zA-Z0-9]/g, '')}-${hash}`;
}
export async function exportActions(ctx: ModuleContext, meeting: Entry): Promise<number> {
  const actions = actionLines(meeting.data['actions']);
  if (!actions.length) throw new Error('Add follow-ups first.');
  const target = text(meeting.data['taskTarget']).replace(/^\[\[|\]\]$/g, '');
  const path = target ? await ctx.app.resolveLink(target, meeting.path) : await ctx.app.todayPage();
  if (!path || !path.endsWith('.md'))
    throw new Error('Choose an experiment or a notes page for follow-ups.');
  const body = await ctx.vault.readText(path);
  const due = text(meeting.data['due']);
  if (due && !validDay(due)) throw new Error('Choose a valid follow-up date.');
  const lines: string[] = [];
  for (const action of actions) {
    const id = await actionId(meeting, action);
    if (!body.includes(`🆔 ${id}`))
      lines.push(`- [ ] ${action} 🆔 ${id}${due ? ` 📅 ${due}` : ''}`);
  }
  if (lines.length)
    await ctx.app.appendToPage(
      path,
      `\n### Follow-ups: ${meeting.title.replace(/[\r\n]/g, ' ')}\n\n${lines.join('\n')}\n`,
    );
  if (!target) await saveEntry(ctx, meeting, { taskTarget: link(path) });
  return lines.length;
}
