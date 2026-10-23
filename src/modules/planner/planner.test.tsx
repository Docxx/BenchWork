import { act, render, screen } from '@testing-library/react';
import type { GanttOptions, GanttTask } from 'frappe-gantt';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { PageView } from '@core/ui/PageView';
import manifestJson from './manifest.json';
import { asDate, linkTargets, moveChanges, taskOf, type PlanTask } from './plan';
import { MOVE_SAVE_MS } from './PlannerView';

// Tests may reach core internals to set the app up; the module itself may not.

// jsdom cannot lay out SVG, so the chart is a stand-in that records what it was given.
const charts: { tasks: GanttTask[]; options: GanttOptions }[] = [];
vi.mock('frappe-gantt', () => ({
  default: class {
    constructor(_element: HTMLElement, tasks: GanttTask[], options: GanttOptions) {
      charts.push({ tasks, options });
    }
    change_view_mode() {
      // Nothing to draw.
    }
  },
}));
vi.mock('frappe-gantt/style.css', () => ({}));

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
  charts.length = 0;
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
    const item = { path: 'Lab/Pilot.md', title: 'Pilot', type: 'page' };
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

describe('Planner: the timeline', () => {
  it('shows pages with dates by notebook, with dependencies and milestones', async () => {
    const { state } = await openPlanner();
    await act(() => state().runCommand('planner.open', { folder: null }));
    await settle();

    const { tasks } = charts.at(-1) ?? { tasks: [] };
    expect(tasks.map((t) => [t.name, t.start, t.end])).toEqual([
      ['2026-11-03', '2026-11-03', '2026-11-03'],
      ['Pilot', '2026-11-02', '2026-11-06'],
      ['Main study', '2026-11-09', '2026-11-27'],
      ['◆ Committee', '2026-12-01', '2026-12-01'],
    ]);
    const pilot = tasks[1];
    expect(pilot?.progress).toBe(40);
    expect(tasks[2]?.dependencies).toEqual([pilot?.id]);
    expect(tasks[3]?.custom_class).toBe('milestone');
    expect(screen.getByRole('combobox', { name: 'Notebook' }).textContent).toBe(
      'All notebooksDailyLab',
    );
  });

  it('opens for one notebook from its menu', async () => {
    const { state } = await openPlanner();
    await act(() => state().runCommand('planner.notebook', { folder: 'Lab/Experiments' }));
    await settle();
    expect(charts.at(-1)?.tasks.map((t) => t.name)).toEqual(['Pilot', 'Main study', '◆ Committee']);
  });

  it('writes the new dates to the page once a bar stops moving', async () => {
    const { platform, state } = await openPlanner();
    await act(() => state().runCommand('planner.open', { folder: null }));
    await settle();
    const { tasks, options } = charts.at(-1) ?? { tasks: [], options: {} };
    const pilot = tasks.find((t) => t.name === 'Pilot');
    if (!pilot) throw new Error('No pilot');

    // While dragging, the chart reports every step; only the last is written.
    options.on_date_change?.(pilot, new Date(2026, 10, 3), new Date(2026, 10, 7, 23, 59, 59));
    options.on_date_change?.(pilot, new Date(2026, 10, 4), new Date(2026, 10, 8, 23, 59, 59));
    await settle(MOVE_SAVE_MS + 50);
    expect(platform.snapshot()['Lab/Pilot.md']).toBe(
      '---\nstart: 2026-11-04\nend: 2026-11-08\nprogress: 40\n---\nA first run.\n',
    );

    const daily = tasks.find((t) => t.name === '2026-11-03');
    if (!daily) throw new Error('No daily note');
    options.on_date_change?.(daily, new Date(2026, 10, 5), new Date(2026, 10, 5, 23, 59, 59));
    options.on_progress_change?.(pilot, 75.4);
    await settle(MOVE_SAVE_MS + 50);
    expect(platform.snapshot()['Daily/2026-11/2026-11-03.md']).toBe(
      '---\ndate: 2026-11-05\n---\nNotes.\n',
    );
    expect(platform.snapshot()['Lab/Pilot.md']).toContain('progress: 75\n');
  });

  it('writes a move still waiting when the planner closes', async () => {
    const { platform, state } = await openPlanner();
    await act(() => state().runCommand('planner.open', { folder: null }));
    await settle();
    const { tasks, options } = charts.at(-1) ?? { tasks: [], options: {} };
    const pilot = tasks.find((t) => t.name === 'Pilot');
    if (!pilot) throw new Error('No pilot');
    options.on_date_change?.(pilot, new Date(2026, 10, 10), new Date(2026, 10, 14, 23, 59, 59));
    act(() => {
      state().closeModuleView();
    });
    await settle();
    expect(platform.snapshot()['Lab/Pilot.md']).toContain('start: 2026-11-10\nend: 2026-11-14\n');
  });

  it('says how to start when nothing has dates', async () => {
    const { platform, state } = await openPlanner();
    for (const path of Object.keys(VAULT)) await platform.writeTextAtomic(path, 'No dates.\n');
    await act(() => state().runCommand('planner.open', { folder: null }));
    await settle();
    expect(screen.getByText(/Nothing to plan yet/)).toBeTruthy();
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
