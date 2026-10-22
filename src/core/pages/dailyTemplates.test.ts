// @vitest-environment node
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import {
  dailyPath,
  dateOf,
  dayHeading,
  dayOf,
  dayOfPath,
  findDay,
  listDays,
  neighbourDay,
} from './daily';
import { parsePage } from './frontmatter';
import {
  fillPlaceholders,
  formatDate,
  listTemplates,
  pageFromTemplate,
  saveAsTemplate,
  templateBody,
} from './templates';

const THURSDAY = new Date(2026, 9, 22, 10, 30, 5);
const VALUES = { title: 'LPS dose', date: THURSDAY, now: THURSDAY };

async function openVault(contents: MemoryFolderContents) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  await platform.setVaultRoot('C:/Vault');
  return platform;
}

describe('days', () => {
  it('are local dates, and only real ones', () => {
    expect(dayOf(THURSDAY)).toBe('2026-10-22');
    expect(dateOf('2026-02-30')).toBeNull();
    expect(dateOf('22-10-2026')).toBeNull();
    expect(dayHeading('2026-10-22')).toBe('Thursday 22 October 2026');
  });

  it('go in a section per month, and pages in either layout count', () => {
    expect(dailyPath('2026-10-22')).toBe('Daily/2026-10/2026-10-22.md');
    expect(dayOfPath('Daily/2026-10/2026-10-22.md')).toBe('2026-10-22');
    expect(dayOfPath('Daily/2026-10-22.md')).toBe('2026-10-22');
    expect(dayOfPath('Daily/Notes/2026-10-22.md')).toBeNull();
    expect(dayOfPath('Lab/2026-10-22.md')).toBeNull();
    expect(dayOfPath('Daily/2026-10/Plan.md')).toBeNull();
  });

  it('are found in both layouts, preferring the month section', async () => {
    const platform = await openVault({
      'Daily/2026-10-20.md': '',
      'Daily/2026-10-22.md': 'old layout',
      'Daily/2026-10/2026-10-22.md': 'new layout',
      'Daily/2026-09/2026-09-30.md': '',
      'Daily/Notes/2026-10-01.md': '',
    });
    expect(await findDay(platform, '2026-10-22')).toBe('Daily/2026-10/2026-10-22.md');
    expect(await findDay(platform, '2026-10-20')).toBe('Daily/2026-10-20.md');
    expect(await findDay(platform, '2026-10-21')).toBeNull();
    const days = await listDays(platform);
    expect([...days.keys()].sort()).toEqual(['2026-09-30', '2026-10-20', '2026-10-22']);
    expect(days.get('2026-10-22')).toBe('Daily/2026-10/2026-10-22.md');
  });

  it('skip empty days going back and forward', () => {
    const days = ['2026-09-30', '2026-10-20', '2026-10-22'];
    expect(neighbourDay(days, '2026-10-22', -1)).toBe('2026-10-20');
    expect(neighbourDay(days, '2026-10-20', -1)).toBe('2026-09-30');
    expect(neighbourDay(days, '2026-10-21', 1)).toBe('2026-10-22');
    expect(neighbourDay(days, '2026-10-22', 1)).toBeNull();
  });
});

describe('placeholders', () => {
  it('fill title, date, time and weekday', () => {
    expect(fillPlaceholders('{{title}} on {{date}} at {{time}}, a {{weekday}}', VALUES)).toBe(
      'LPS dose on 2026-10-22 at 10:30, a Thursday',
    );
  });

  it('take a date format, and leave unknown placeholders alone', () => {
    expect(fillPlaceholders('{{date:dddd D MMMM YYYY}} {{ date : DD/MM }}', VALUES)).toBe(
      'Thursday 22 October 2026 22/10',
    );
    expect(fillPlaceholders('{{author}}', VALUES)).toBe('{{author}}');
  });

  it('keep bracketed words in formats', () => {
    expect(formatDate(THURSDAY, '[Meeting] ddd D MMM, HH:mm')).toBe('Meeting Thu 22 Oct, 10:30');
  });
});

describe('pages from templates', () => {
  const TEMPLATE = [
    '---',
    'type: protocol',
    'tags: [lab]',
    'id: old-id',
    'modified: 2026-01-01',
    '---',
    '# {{title}}',
    '',
    'Started {{date}}.',
    '',
  ].join('\n');

  it('keep the frontmatter, with a fresh id and created time', () => {
    const text = pageFromTemplate(TEMPLATE, VALUES, 'new-id', '2026-10-22T10:30:05+01:00');
    const page = parsePage(text);
    expect(page.meta).toMatchObject({
      id: 'new-id',
      type: 'protocol',
      tags: ['lab'],
      created: '2026-10-22T10:30:05+01:00',
      modified: null,
    });
    expect(page.body).toBe('# LPS dose\n\nStarted 2026-10-22.\n');
  });

  it('use only the body when the frontmatter is broken', () => {
    const text = pageFromTemplate('---\nid: [oops\n---\nBody\n', VALUES, 'new-id', 'now');
    expect(text).toBe('---\nid: new-id\ncreated: now\n---\nBody\n');
  });

  it('give just the filled body for inserting', () => {
    expect(templateBody(TEMPLATE, VALUES)).toBe('# LPS dose\n\nStarted 2026-10-22.\n');
  });
});

describe('template files', () => {
  it('are the pages in templates/', async () => {
    const platform = await openVault({
      'templates/Protocol.md': '',
      'templates/Daily.md': '',
      'templates/notes.txt': '',
      'templates/Old': null,
    });
    expect(await listTemplates(platform)).toEqual([
      { path: 'templates/Daily.md', title: 'Daily' },
      { path: 'templates/Protocol.md', title: 'Protocol' },
    ]);
    expect(await listTemplates(await openVault({}))).toEqual([]);
  });

  it('can be saved from a page, without its id, and never overwrite', async () => {
    const platform = await openVault({
      'Lab/Protocol.md': '---\nid: p1\ncreated: then\ntype: protocol\n---\nSteps.\n',
      'templates/Protocol.md': 'existing',
    });
    const path = await saveAsTemplate(platform, 'Lab/Protocol.md');
    expect(path).toBe('templates/Protocol 2.md');
    expect(await platform.readText(path)).toBe('---\ntype: protocol\n---\nSteps.\n');
    expect(await platform.readText('templates/Protocol.md')).toBe('existing');
  });
});
