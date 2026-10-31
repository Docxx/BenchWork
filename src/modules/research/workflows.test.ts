// @vitest-environment node
import type { ModuleContext, ModuleDefinition } from '@core/api';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore, type AppStore } from '@core/state/appStore';
import research from './index';
import researchManifest from './manifest.json';
import runner from '../protocol-runner/index';
import runnerManifest from '../protocol-runner/manifest.json';
import samples from '../sample-tracker/index';
import samplesManifest from '../sample-tracker/manifest.json';
import equipment from '../equipment-planner/index';
import equipmentManifest from '../equipment-planner/manifest.json';
import questions from '../research-questions/index';
import questionsManifest from '../research-questions/manifest.json';
import meetings from '../meeting-organiser/index';
import meetingsManifest from '../meeting-organiser/manifest.json';
import lab from '../lab-notebook/index';
import labManifest from '../lab-notebook/manifest.json';
import tools from '../lab-tools/index';
import toolsManifest from '../lab-tools/manifest.json';
import { addDays, link, loadEntries, readEntry, saveEntry, stepsOf, type Entry } from './api';
import {
  applySchedule,
  createRun,
  exportTasks,
  protocolSteps,
  repeatRun,
  reviewSchedule,
} from '../protocol-runner/runs';
import { aliquots, ancestry, validateParents } from '../sample-tracker/samples';
import { overlaps, suggestBooking, validateBooking } from '../equipment-planner/bookings';
import { exportActions, prepareAgenda } from '../meeting-organiser/meetings';
import { planTest } from '../research-questions/QuestionsView';

const definitions: [unknown, ModuleDefinition][] = [
  [researchManifest, research],
  [runnerManifest, runner],
  [samplesManifest, samples],
  [equipmentManifest, equipment],
  [questionsManifest, questions],
  [meetingsManifest, meetings],
  [labManifest, lab],
  [toolsManifest, tools],
];
const stores: AppStore[] = [];
const EXP = 'Research/Experiments/Pilot.md';
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a value');
  return value;
}
const PROTOCOL = 'Research/Protocols/Assay.md';

async function setup(extra: Record<string, string> = {}) {
  const contexts = new Map<string, ModuleContext>();
  const sources: ModuleSource[] = definitions.map(([raw, definition]) => {
    const result = validateManifest(raw, (raw as { id: string }).id);
    if (!result.ok) throw new Error(result.errors.join(', '));
    return {
      manifest: result.manifest,
      load: () =>
        Promise.resolve({
          activate(ctx) {
            contexts.set(ctx.manifest.id, ctx);
            return definition.activate(ctx);
          },
        }),
    };
  });
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: Object.fromEntries(
            sources.map((source) => [source.manifest.id, { enabled: true }]),
          ),
        }),
        [EXP]: '---\nid: exp-1\ntype: experiment\nstatus: planned\n---\n## Notes\n\n',
        [PROTOCOL]:
          '---\nid: protocol-1\ntype: protocol\nversion: 3\n---\n## Steps\n\n1. Prepare samples\n2. Collect measurements\n\n## Notes\n\n',
        'Research/Equipment/Scope.equipment.yaml': JSON.stringify({
          id: 'scope-1',
          status: 'ready',
        }),
        ...extra,
      },
    },
  });
  const registry = new ModuleRegistry(sources, [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  stores.push(store);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  await store.getState().indexIdle();
  const ctx = contexts.get('research');
  if (!ctx) throw new Error('Research did not activate');
  const get = async (path: string, type: string): Promise<Entry> =>
    readEntry(ctx, {
      path,
      type,
      title: path.split('/').at(-1)?.split('.')[0] ?? path,
      changed: null,
    });
  const indexed = async (path: string) => {
    await vi.waitFor(async () => {
      expect((await ctx.app.items()).some((item) => item.path === path)).toBe(true);
    });
  };
  return { ctx, platform, registry, store, contexts, get, indexed };
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.getState().closeVault();
});

describe('connected research workflows', () => {
  it('registers six connected tools and cleanly disables them without rewriting files', async () => {
    const { registry, platform } = await setup();
    expect(registry.contributions.getState().pageViews.map((view) => view.id)).toEqual(
      expect.arrayContaining([
        'research.experiments',
        'protocol-runner.view',
        'sample-tracker.view',
        'equipment-planner.view',
        'research-questions.view',
        'meeting-organiser.view',
      ]),
    );
    const before = platform.snapshot();
    const plan = registry.planDisable('research');
    if (!plan.ok) throw new Error(plan.reason);
    await registry.disable(plan.ids);
    expect(registry.get('protocol-runner')?.status).toBe('off');
    expect(registry.get('sample-tracker')?.status).toBe('off');
    expect(platform.snapshot()).toEqual(before);
  });

  it('freezes protocol steps and version into a run and repeats only unfinished work', async () => {
    const { ctx, get, indexed } = await setup();
    const protocol = await get(PROTOCOL, 'protocol');
    expect(protocolSteps(protocol).map((step) => step.title)).toEqual([
      'Prepare samples',
      'Collect measurements',
    ]);
    const path = await createRun(ctx, protocol, EXP, 'Pilot run', '2026-11-01');
    await indexed(path);
    const run = await get(path, 'run');
    expect(run.data['experiment']).toBe(link(EXP));
    expect(run.data['protocolVersion']).toBe('3');
    const steps = stepsOf(run.data['steps']);
    steps[0] = {
      ...must(steps[0]),
      done: true,
      notes: 'Changed incubation',
      completedAt: '2026-11-01T12:00:00Z',
    };
    await saveEntry(ctx, run, { steps });
    const repeated = await repeatRun(ctx, await get(path, 'run'), true);
    await indexed(repeated);
    const next = await get(repeated, 'run');
    expect(stepsOf(next.data['steps'])).toHaveLength(1);
    expect(stepsOf(next.data['steps'])[0]?.done).toBe(false);
    expect(next.data['previous']).toBe(link(path));
    expect(stepsOf((await get(path, 'run')).data['steps'])[0]?.notes).toBe('Changed incubation');
  });

  it('reviews dates without writing, then applies linked booking and checklist changes', async () => {
    const { ctx, get, indexed } = await setup();
    const path = await createRun(
      ctx,
      await get(PROTOCOL, 'protocol'),
      EXP,
      'Scheduled run',
      '2026-11-01',
    );
    await indexed(path);
    await exportTasks(ctx, await get(path, 'run'));
    const booking = await ctx.vault
      .createRecord('Research/Bookings', 'Scope time', 'booking', {
        equipment: link('Research/Equipment/Scope.equipment.yaml'),
        run: link(path),
        start: '2026-11-01T09:00',
        end: '2026-11-01T10:00',
        status: 'reserved',
      })
      .catch(async () => {
        await ctx.vault.ensureDir('Research/Bookings');
        return ctx.vault.createRecord('Research/Bookings', 'Scope time', 'booking', {
          equipment: link('Research/Equipment/Scope.equipment.yaml'),
          run: link(path),
          start: '2026-11-01T09:00',
          end: '2026-11-01T10:00',
          status: 'reserved',
        });
      });
    await indexed(booking);
    const run = await get(path, 'run');
    const review = await reviewSchedule(ctx, run, '2026-11-04', await loadEntries(ctx));
    expect((await get(path, 'run')).data['start']).toBe('2026-11-01');
    expect(review.changes).toHaveLength(3);
    await applySchedule(ctx, review);
    expect((await get(path, 'run')).data['start']).toBe('2026-11-04');
    expect((await get(booking, 'booking')).data['start']).toBe('2026-11-04T09:00');
    expect(await ctx.vault.readText(EXP)).toContain('📅 2026-11-04');
  });

  it('rejects stale review and stale form saves without overwriting external edits', async () => {
    const { ctx, get, indexed } = await setup();
    const path = await createRun(
      ctx,
      await get(PROTOCOL, 'protocol'),
      EXP,
      'Stale run',
      '2026-11-01',
    );
    await indexed(path);
    const run = await get(path, 'run');
    const review = await reviewSchedule(ctx, run, '2026-11-03', await loadEntries(ctx));
    await ctx.vault.updateRecord(path, { notes: 'Edited elsewhere' });
    await expect(applySchedule(ctx, review)).rejects.toThrow('changed');
    await expect(saveEntry(ctx, run, { notes: 'Overwrite' })).rejects.toThrow('changed');
    expect((await get(path, 'run')).data['notes']).toBe('Edited elsewhere');
  });

  it('does not create duplicate checklist tasks when an export is retried', async () => {
    const { ctx, get, indexed } = await setup();
    const path = await createRun(
      ctx,
      await get(PROTOCOL, 'protocol'),
      EXP,
      'Checklist run',
      '2026-11-01',
    );
    await indexed(path);
    const run = await get(path, 'run');
    await exportTasks(ctx, run);
    await expect(exportTasks(ctx, await get(path, 'run'))).rejects.toThrow('already');
    expect((await ctx.vault.readText(EXP)).match(/Prepare samples/g)).toHaveLength(1);
  });

  it('restores earlier files when a schedule write fails partway through', async () => {
    const { ctx, platform, get, indexed } = await setup();
    const path = await createRun(
      ctx,
      await get(PROTOCOL, 'protocol'),
      EXP,
      'Recoverable',
      '2026-11-01',
    );
    await indexed(path);
    await exportTasks(ctx, await get(path, 'run'));
    const before = await ctx.vault.readText(path);
    const checklist = await ctx.vault.readText(EXP);
    const review = await reviewSchedule(
      ctx,
      await get(path, 'run'),
      '2026-11-04',
      await loadEntries(ctx),
    );
    const write = platform.writeTextAtomic.bind(platform);
    let failed = false;
    platform.writeTextAtomic = (target, source) => {
      if (target === EXP && !failed) {
        failed = true;
        return Promise.reject(new Error('Disk full'));
      }
      return write(target, source);
    };
    try {
      await expect(applySchedule(ctx, review)).rejects.toThrow('Disk full');
      expect(await ctx.vault.readText(path)).toBe(before);
      expect(await ctx.vault.readText(EXP)).toBe(checklist);
    } finally {
      platform.writeTextAtomic = write;
    }
  });

  it('refuses a reviewed schedule if another booking has since taken the slot', async () => {
    const { ctx, get, indexed } = await setup();
    const path = await createRun(
      ctx,
      await get(PROTOCOL, 'protocol'),
      EXP,
      'Collision',
      '2026-11-01',
    );
    await indexed(path);
    await ctx.vault.ensureDir('Research/Bookings');
    const booking = await ctx.vault.createRecord('Research/Bookings', 'Original', 'booking', {
      equipment: link('Research/Equipment/Scope.equipment.yaml'),
      run: link(path),
      start: '2026-11-01T09:00',
      end: '2026-11-01T10:00',
    });
    await indexed(booking);
    const review = await reviewSchedule(
      ctx,
      await get(path, 'run'),
      '2026-11-04',
      await loadEntries(ctx),
    );
    const late = await ctx.vault.createRecord('Research/Bookings', 'New reservation', 'booking', {
      equipment: link('Research/Equipment/Scope.equipment.yaml'),
      start: '2026-11-04T09:30',
      end: '2026-11-04T10:30',
    });
    await indexed(late);
    await expect(applySchedule(ctx, review)).rejects.toThrow('overlap');
    expect((await get(path, 'run')).data['start']).toBe('2026-11-01');
  });

  it('keeps malformed YAML unchanged and reports it as unreadable', async () => {
    const { ctx, get } = await setup({
      'Research/Samples/Broken.sample.yaml': 'id: [unfinished\n',
    });
    const broken = await get('Research/Samples/Broken.sample.yaml', 'sample');
    expect(broken.error).not.toBeNull();
    await expect(saveEntry(ctx, broken, { location: 'Overwrite' })).rejects.toThrow(
      'not been changed',
    );
    expect(await ctx.vault.readText(broken.path)).toBe('id: [unfinished\n');
  });

  it('rejects invalid dates and keeps explicitly emptied template steps empty', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow('valid');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    const entry = {
      path: 'Template.workflowprotocol.yaml',
      data: { instructions: 'Old step', steps: [] },
    } as unknown as Entry;
    expect(protocolSteps(entry)).toEqual([]);
  });

  it('creates sample aliquots with traceable parents and prevents lineage cycles', async () => {
    const { ctx, get, indexed } = await setup();
    await ctx.vault.ensureDir('Research/Samples');
    const parent = await ctx.vault.createRecord('Research/Samples', 'Parent', 'sample', {
      experiment: link(EXP),
      location: 'Freezer A',
    });
    await indexed(parent);
    const paths = await aliquots(ctx, await get(parent, 'sample'), 2);
    await indexed(must(paths[1]));
    const child = await get(must(paths[0]), 'sample');
    const all = await loadEntries(ctx);
    expect((await ancestry(ctx, child, all)).map((e) => e.path)).toContain(parent);
    expect(child.data['location']).toBe('Freezer A');
    expect(
      await validateParents(ctx, { parents: [link(child.path)] }, all, await get(parent, 'sample')),
    ).toContain('cycle');
  });

  it('detects equipment clashes, permits adjacent bookings and suggests the next free slot', async () => {
    const { ctx, get, indexed } = await setup();
    await ctx.vault.ensureDir('Research/Bookings');
    const path = await ctx.vault.createRecord('Research/Bookings', 'Occupied', 'booking', {
      equipment: link('Research/Equipment/Scope.equipment.yaml'),
      start: '2026-11-01T09:00',
      end: '2026-11-01T10:00',
      status: 'reserved',
    });
    await indexed(path);
    const data = {
      equipment: link('Research/Equipment/Scope.equipment.yaml'),
      start: '2026-11-01T09:30',
      end: '2026-11-01T10:30',
      status: 'reserved',
    };
    const all = await loadEntries(ctx);
    expect(await validateBooking(ctx, data, all, null)).toContain('Overlaps');
    expect(await suggestBooking(ctx, data, all)).toEqual({
      start: '2026-11-01T10:00',
      end: '2026-11-01T11:00',
    });
    expect(
      await validateBooking(
        ctx,
        { ...data, start: '2026-11-01T10:00', end: '2026-11-01T11:00' },
        all,
        null,
      ),
    ).toBeNull();
    expect(overlaps('09', '10', '10', '11')).toBe(false);
    expect(await validateBooking(ctx, { ...data, status: 'cancelled' }, all, null)).toBeNull();
    expect((await get(path, 'booking')).data['start']).toBe('2026-11-01T09:00');
  });

  it('links a question to a new experiment and turns meeting follow-ups into deduplicated tasks', async () => {
    const { ctx, get, indexed } = await setup();
    await ctx.vault.ensureDir('Research/Questions');
    const question = await ctx.vault.createRecord('Research/Questions', 'Mechanism', 'question', {
      question: 'What changes behaviour?',
      nextTest: 'Compare conditions',
      status: 'open',
    });
    await indexed(question);
    const experiment = await planTest(ctx, await get(question, 'question'), 'Follow-up');
    expect(experiment).not.toBeNull();
    expect(await ctx.vault.readText(must(experiment))).toContain('Compare conditions');
    await ctx.vault.ensureDir('Research/Meetings');
    const path = await ctx.vault.createRecord('Research/Meetings', 'Supervisor', 'meeting', {
      experiments: [link(EXP)],
      questions: [link(question)],
      actions: 'Order materials\nCheck results',
      taskTarget: link(EXP),
      due: '2026-11-05',
    });
    await indexed(path);
    await prepareAgenda(ctx, await get(path, 'meeting'), await loadEntries(ctx));
    expect((await get(path, 'meeting')).data['agenda']).toContain('Mechanism');
    expect(await exportActions(ctx, await get(path, 'meeting'))).toBe(2);
    expect(await exportActions(ctx, await get(path, 'meeting'))).toBe(0);
    expect((await ctx.vault.readText(EXP)).match(/Order materials/g)).toHaveLength(1);
  });

  it('shares run timers with Lab tools and removes the provider on disable', async () => {
    const { contexts, registry } = await setup();
    const ctx = must(contexts.get('protocol-runner'));
    expect(ctx.timers.start('Test timer', 60000)).toBe(true);
    expect(ctx.timers.start('Invalid', -1)).toBe(false);
    await registry.disable(['lab-tools']);
    expect(ctx.timers.start('Stopped', 1000)).toBe(false);
  });
});
