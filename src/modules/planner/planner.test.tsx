import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ScheduledItem } from '@core/api';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { PageView } from '@core/ui/PageView';
import manifestJson from './manifest.json';
import { planMarks } from './index';
import {
  addDays,
  buildRows,
  cascade,
  chartRange,
  colourOf,
  criticalPath,
  daysBetween,
} from './gantt';
import { asDate, linkTargets, moveChanges, taskOf, type PlanTask } from './plan';

// Tests may reach core internals to set the app up; the module itself may not.

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'planner');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

const settle = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const VAULT = {
  'Lab/Pilot.md': '---\nstart: 2026-11-02\nend: 2026-11-06\nprogress: 40\n---\nA first run.\n',
  'Lab/Main study.md': '---\nstart: 2026-11-09\nend: 2026-11-27\nafter: "[[Pilot]]"\n---\n',
  'Lab/Committee.md': '---\ndate: 2026-12-01\nmilestone: true\n---\n',
  'Daily/2026-11/2026-11-03.md': '---\ndate: 2026-11-03\n---\nNotes.\n',
  'Lab/Ideas.md': 'No dates here.\n',
};

async function openPlanner(enabled = true) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { planner: { enabled } },
        }),
        ...VAULT,
      },
    },
  });
  const registry = new ModuleRegistry([source()], [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
  });
  render(
    <AppStoreProvider store={store}>
      <PageView />
    </AppStoreProvider>,
  );
  return { platform, store, state: () => store.getState() };
}

const task = (over: Partial<PlanTask> = {}): PlanTask => ({
  path: 'Lab/Pilot.md',
  title: 'Pilot',
  notebook: 'Lab',
  start: '2026-11-02',
  end: '2026-11-06',
  milestone: false,
  progress: 0,
  after: [],
  singleDate: false,
  ...over,
});

describe('Planner: reading dates from pages', () => {
  it('reads dates, and leaves out anything that is not one', () => {
    expect(asDate('2026-11-02')).toBe('2026-11-02');
    expect(asDate('2026-11-02T09:30')).toBe('2026-11-02');
    expect(asDate('2026-02-30')).toBeNull();
    expect(asDate('next week')).toBeNull();
    expect(asDate(20261102)).toBeNull();
  });

  it('reads one link or a list of them from after', () => {
    expect(linkTargets('[[Pilot]]')).toEqual(['Pilot']);
    expect(linkTargets(['[[Lab/Pilot|the pilot]]', '[[Dose#Method]]'])).toEqual([
      'Lab/Pilot',
      'Dose',
    ]);
    expect(linkTargets('Pilot')).toEqual(['Pilot']);
    expect(linkTargets(null)).toEqual([]);
  });

  it('places tasks, one-day pages and milestones', () => {
    const item = { path: 'Lab/Pilot.md', title: 'Pilot', type: 'page', changed: null };
    expect(taskOf(item, { start: '2026-11-02', end: '2026-11-06' })).toMatchObject({
      start: '2026-11-02',
      end: '2026-11-06',
      notebook: 'Lab',
      singleDate: false,
    });
    expect(taskOf(item, { date: '2026-11-03' })).toMatchObject({
      start: '2026-11-03',
      end: '2026-11-03',
      singleDate: true,
    });
    expect(taskOf(item, { date: '2026-12-01', milestone: true, end: '2026-12-09' })).toMatchObject({
      start: '2026-12-01',
      end: '2026-12-01',
      milestone: true,
    });
    // An end before the start is taken as the start.
    expect(taskOf(item, { start: '2026-11-06', end: '2026-11-02' })?.end).toBe('2026-11-06');
    expect(taskOf(item, { title: 'No dates' })).toBeNull();
  });

  it('writes moved dates the way the page already had them', () => {
    expect(moveChanges(task(), '2026-11-09', '2026-11-13')).toEqual({
      start: '2026-11-09',
      end: '2026-11-13',
    });
    const oneDay = task({ singleDate: true, start: '2026-11-03', end: '2026-11-03' });
    expect(moveChanges(oneDay, '2026-11-04', '2026-11-04')).toEqual({
      date: '2026-11-04',
      start: null,
      end: null,
    });
    expect(moveChanges(oneDay, '2026-11-04', '2026-11-06')).toEqual({
      date: null,
      start: '2026-11-04',
      end: '2026-11-06',
    });
    expect(
      moveChanges(task({ milestone: true, singleDate: true }), '2026-12-02', '2026-12-02'),
    ).toEqual({ date: '2026-12-02' });
  });
});

const bar = (name: RegExp) => screen.getByRole('button', { name });

describe('Planner: the chart', () => {
  it('shows pages with dates, grouped by notebook, with milestones', async () => {
    const { state } = await openPlanner();
    await act(() => state().runCommand('planner.open', { folder: null }));
    await settle();
    const chart = screen.getByRole('region', { name: 'Chart' });
    expect(within(chart).getByText('Daily')).toBeTruthy();
    expect(bar(/^Pilot, 2 Nov 2026 to 6 Nov 2026$/).className).toContain('gantt-bar');
    expect(bar(/^Committee, 1 Dec 2026$/).className).toContain('milestone');
    expect(bar(/^Main study, 9 Nov 2026 to 27 Nov 2026$/)).toBeTruthy();
    expect(chart.querySelectorAll('.gantt-arrows > path')).toHaveLength(1);
  });

  it('opens for one notebook from its menu', async () => {
    const { state } = await openPlanner();
    await act(() => state().runCommand('planner.notebook', { folder: 'Lab/Experiments' }));
    await settle();
    expect(screen.queryByRole('button', { name: /^2026-11-03,/ })).toBeNull();
    expect(bar(/^Pilot,/)).toBeTruthy();
  });

  it('moves a bar a day at a time, and the pages waiting for it', async () => {
    const { platform, state } = await openPlanner();
    await act(() => state().runCommand('planner.open', { folder: null }));
    await settle();
    for (let i = 0; i < 3; i += 1) {
      fireEvent.keyDown(bar(/^Pilot,/), { key: 'ArrowRight' });
      await settle(60);
    }
    expect(platform.snapshot()['Lab/Pilot.md']).toBe(
      '---\nstart: 2026-11-05\nend: 2026-11-09\nprogress: 40\n---\nA first run.\n',
    );
    // Main study came after it, so it moved on a day too.
    expect(platform.snapshot()['Lab/Main study.md']).toContain(
      'start: 2026-11-10\nend: 2026-11-28\n',
    );
    expect(screen.getByRole('status').textContent).toContain('1 item that waits');

    // Shift and an arrow changes the end only.
    fireEvent.keyDown(bar(/^Pilot,/), { key: 'ArrowLeft', shiftKey: true });
    await settle(60);
    expect(platform.snapshot()['Lab/Pilot.md']).toContain('start: 2026-11-05\nend: 2026-11-08\n');
  });

  it('says how to start when nothing has dates', async () => {
    const { platform, state } = await openPlanner();
    for (const path of Object.keys(VAULT)) await platform.writeTextAtomic(path, 'No dates.\n');
    await act(() => state().runCommand('planner.open', { folder: null }));
    await settle();
    expect(screen.getByText(/Nothing to plan yet/)).toBeTruthy();
  });
});

const item = (key: string, start: string, end: string, over: Partial<ScheduledItem> = {}) =>
  ({
    key,
    title: key,
    path: `Lab/${key}.md`,
    start,
    end,
    milestone: false,
    progress: 0,
    done: false,
    person: null,
    priority: null,
    notebook: 'Lab',
    after: [],
    parent: null,
    ...over,
  }) satisfies ScheduledItem;

describe('Planner: working out the chart', () => {
  it('counts days and sets the range around the plan and today', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(chartRange([item('a', '2026-11-02', '2026-11-04')], '2026-10-30')).toEqual({
      from: '2026-10-23',
      to: '2026-12-22',
    });
  });

  it('groups rows, with parts under their whole unless folded', () => {
    const items = [
      item('thesis', '2026-11-01', '2026-11-20', { summary: true, person: 'Sam' }),
      item('methods', '2026-11-01', '2026-11-05', { parent: 'thesis', person: 'Sam' }),
      item('holiday', '2026-11-10', '2026-11-12', { person: 'Ray' }),
    ];
    const shape = (rows: ReturnType<typeof buildRows>) =>
      rows.map((r) =>
        r.kind === 'group' ? `# ${r.label}` : `${'  '.repeat(r.depth)}${r.item.key}`,
      );
    expect(shape(buildRows(items, 'person', new Set()))).toEqual([
      '# Ray',
      'holiday',
      '# Sam',
      'thesis',
      '  methods',
    ]);
    expect(shape(buildRows(items, 'none', new Set(['thesis'])))).toEqual(['thesis', 'holiday']);
  });

  it('colours by priority, progress, or steadily by value', () => {
    expect(colourOf(item('a', '2026-11-01', '2026-11-01', { priority: 1 }), 'priority', [])).toBe(
      'red',
    );
    expect(colourOf(item('a', '2026-11-01', '2026-11-01', { done: true }), 'progress', [])).toBe(
      'green',
    );
    const order = ['Lab', 'Thesis'];
    expect(
      colourOf(item('a', '2026-11-01', '2026-11-01', { notebook: 'Thesis' }), 'notebook', order),
    ).toBe('teal');
  });

  it('pushes later what waits for a moved item, keeping lengths', () => {
    const items = [
      item('a', '2026-11-02', '2026-11-06'),
      item('b', '2026-11-09', '2026-11-12', { after: ['a'] }),
      item('c', '2026-11-13', '2026-11-13', { after: ['b'] }),
      item('d', '2026-12-01', '2026-12-02', { after: ['a'] }),
    ];
    const moved = cascade(items, 'a', '2026-11-05', '2026-11-10');
    expect(Object.fromEntries(moved)).toEqual({
      a: { start: '2026-11-05', end: '2026-11-10' },
      b: { start: '2026-11-11', end: '2026-11-14' },
      c: { start: '2026-11-15', end: '2026-11-15' },
    });
  });

  it('finds the critical path: the chain with no slack', () => {
    const items = [
      item('design', '2026-11-02', '2026-11-04'),
      item('build', '2026-11-05', '2026-11-12', { after: ['design'] }),
      item('docs', '2026-11-05', '2026-11-06', { after: ['design'] }),
      item('launch', '2026-11-13', '2026-11-13', { after: ['build', 'docs'] }),
    ];
    expect([...criticalPath(items)].sort()).toEqual(['build', 'design', 'launch']);
    // A later item on its own does not take the slack away from the chain.
    const withOther = [...items, item('holiday', '2026-12-01', '2026-12-20')];
    expect([...criticalPath(withOther)].sort()).toEqual(['build', 'design', 'launch']);
  });
});

describe('Planner: switched off', () => {
  it('leaves the pages and their dates alone', async () => {
    const { platform, state } = await openPlanner();
    const before = platform.snapshot();
    await act(async () => {
      await state().setModuleEnabled('planner', false);
    });
    const after = platform.snapshot();
    for (const path of Object.keys(VAULT)) expect(after[path]).toBe(before[path]);
  });
});

describe('Planner: on the calendar', () => {
  it('marks one-day pages, milestones, and where others start and end', () => {
    const task = (title: string, start: string, end: string, milestone = false) => ({
      path: `Lab/${title}.md`,
      title,
      notebook: 'Lab',
      start,
      end,
      milestone,
      progress: 0,
      after: [],
      singleDate: start === end,
    });
    const marks = planMarks(
      [
        task('Pilot', '2026-11-02', '2026-11-06'),
        task('Committee', '2026-11-20', '2026-11-20', true),
        task('Talk', '2026-11-12', '2026-11-12'),
        task('Later', '2026-12-02', '2026-12-04'),
      ],
      '2026-11-01',
      '2026-11-30',
    );
    expect(marks.map((m) => [m.date, m.title, m.colour])).toEqual([
      ['2026-11-02', 'Pilot starts', 'blue'],
      ['2026-11-06', 'Pilot ends', 'blue'],
      ['2026-11-20', '◆ Committee', 'purple'],
      ['2026-11-12', 'Talk', 'blue'],
    ]);
  });
});
