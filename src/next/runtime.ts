import { createContributions } from '@core/modules/contributions';
import { findBuiltInModules } from '@core/modules/loader';
import { ModuleRegistry } from '@core/modules/registry';
import { createAppStore, type AppStore } from '@core/state/appStore';
import { newDoc, newText, serialiseDoc } from '../modules/figures/doc';
import { newChart } from '../modules/figures/chart';
import { seedWorkspace, parseWorkspace, type Workspace } from './model';
import { StudioAdapter, STUDIO_ROOT, WORKSPACE_FILE, readArchive, restoreArchive } from './storage';

export interface NextRuntime {
  platform: StudioAdapter;
  store: AppStore;
  workspace: Workspace;
}

function figure(): string {
  const doc = newDoc();
  const chart = newChart();
  chart.type = 'line';
  chart.groups = ['0', '15', '30', '60'];
  chart.series = [
    {
      id: 'control',
      name: 'Control',
      colour: '#357b74',
      values: [
        [1, 1.1, 0.9],
        [1.2, 1.1, 1.3],
        [1.1, 1.2, 1],
        [1, 1.1, 0.9],
      ],
    },
    {
      id: 'recovery',
      name: 'Recovery',
      colour: '#e69a66',
      values: [
        [0.4, 0.5, 0.45],
        [0.6, 0.55, 0.65],
        [0.85, 0.9, 0.8],
        [1.1, 1, 1.05],
      ],
    },
  ];
  chart.xLabel = 'Time (min)';
  chart.yLabel = 'Relative response';
  doc.blocks = [
    { id: 'chart', kind: 'chart', x: 8, y: 15, w: 150, h: 95, letter: null, chart },
    {
      id: 'caption',
      kind: 'text',
      x: 8,
      y: 118,
      w: 150,
      h: 18,
      letter: '',
      text: newText(
        'Example data. A recovery trajectory, shown as mean ± SEM. These synthetic values illustrate the workflow.',
      ),
    },
  ];
  return serialiseDoc(doc);
}
function noteText(id: string, title: string, body: string): string {
  return `---\nid: next-${id}\ncreated: ${new Date().toISOString()}\n---\n# ${title}\n\n${body}\n`;
}
export async function createNextRuntime(): Promise<NextRuntime> {
  const saved = await readArchive();
  const workspace = seedWorkspace();
  const platform = new StudioAdapter({
    folders: {
      [STUDIO_ROOT]: {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: {
            figures: { enabled: true },
            whiteboard: { enabled: true },
            'mind-maps': { enabled: true },
            'lab-tools': { enabled: true },
          },
        }),
        [WORKSPACE_FILE]: JSON.stringify(workspace),
        'Recovery/The recovery window.md': noteText(
          'n1',
          'The recovery window',
          '## A question worth following\n\nHow do cells return to their baseline after a transient stress? And is recovery a smooth return, or a change of state?\n\n> A useful experiment makes the next question clearer.\n\n## What we know so far\n\nThe example pilot gives us a shape to investigate. The early time points look different from the later ones, but this is a **working hypothesis**, not a conclusion.\n\n- [x] Capture a baseline\n- [x] Record the acquisition settings\n- [ ] Repeat the time course\n- [ ] Compare the single-cell distributions\n\n## Next move\n\nStart with [[Live imaging pilot]]. Keep the raw images, the exclusions and the interpretation together.\n\n*This is fictional sample content. Make it yours.*',
        ),
        'Recovery/Live imaging pilot.md': noteText(
          'n2',
          'Live imaging / pilot 03',
          '## Aim\n\nExplore the time resolution needed to observe recovery.\n\n## Run notes\n\n| Time | Observation | Next action |\n| --- | --- | --- |\n| Baseline | Sample field acquired | Check saturation |\n| Early | Example transient response | Repeat the field |\n| Late | Example return towards baseline | Compare distributions |\n\n## Reflection\n\nWhat would make this result convincing? Write the control you need before the next run.\n\n*Illustrative example, not a validated laboratory protocol.*',
        ),
        'Atlas/Patterns worth following.md': noteText(
          'n3',
          'Patterns worth following',
          '## Look at the distribution\n\nAn average can hide two very different populations. Before adding another condition, look at the individual cells.\n\n## Quality checks\n\n- [ ] Inspect the segmentation\n- [ ] Flag saturated fields\n- [ ] Keep exclusion criteria with the dataset\n\nWhat would a second population change about the interpretation?',
        ),
        'Manuscript/A story in four figures.md': noteText(
          'n4',
          'A story in four figures',
          '## The thread\n\n1. Establish the response.\n2. Show the recovery window.\n3. Test the alternative explanation.\n4. Bring the mechanism into focus.\n\n## A figure earns its place\n\nEach figure should answer a question. Keep the sources and the limitations beside the claim.',
        ),
        'Daily/Ideas for the next session.md': noteText(
          'n5',
          'Ideas for the next session',
          '## One important thing\n\nCompare the early recovery time points.\n\n## Small sparks\n\n- Try a shorter interval for the first few frames.\n- Link the image quality checks to the run note.\n- Leave time to think after the acquisition.',
        ),
        'Manuscript/Recovery trajectory.figure.json': figure(),
      },
    },
    appSettings: { guided: true, lastVault: STUDIO_ROOT },
  });
  await platform.setVaultRoot(STUDIO_ROOT);
  if (saved) {
    platform.addFolder(STUDIO_ROOT, {});
    await platform.setVaultRoot(STUDIO_ROOT);
    await restoreArchive(platform, saved);
  }
  const loaded = parseWorkspace(await platform.readText(WORKSPACE_FILE));
  const { sources, broken } = findBuiltInModules();
  const registry = new ModuleRegistry(sources, broken, {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  await store.getState().start();
  if (store.getState().status.kind !== 'open')
    throw new Error('The example workspace could not be opened. Your saved data has been kept.');
  platform.enablePersistence();
  await platform.checkpoint();
  return { platform, store, workspace: loaded };
}
