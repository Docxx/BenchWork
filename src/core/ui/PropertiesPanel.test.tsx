import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { AppStoreProvider } from './AppStoreContext';
import { PropertiesPanel } from './PropertiesPanel';

const DOSE = [
  '---',
  'id: d1',
  'type: experiment',
  'status: planned',
  'datasets: ["[[day7]]"]',
  'cell_line: HeLa',
  '---',
  'Notes',
  '',
].join('\n');

async function renderPanel(page: string) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': '{"version":1,"modules":{"lab":{"enabled":true}}}',
        'Lab/Dose.md': DOSE,
        'Lab/Plain.md': 'Just text.\n',
        'Lab/day7.dataset.yaml': 'id: x\n',
      },
    },
  });
  const lab = fakeModule('lab', [], {
    activate: (ctx) => {
      ctx.pageTypes.register({
        type: 'experiment',
        name: 'Experiment',
        fields: [
          { key: 'aim', label: 'Aim', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'choice', options: ['planned', 'running'] },
          { key: 'datasets', label: 'Datasets', kind: 'links' },
        ],
      });
    },
  });
  const registry = new ModuleRegistry([lab], [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
    await store.getState().openPage(page);
  });
  render(
    <AppStoreProvider store={store}>
      <PropertiesPanel />
    </AppStoreProvider>,
  );
  return { platform, store };
}

describe('PropertiesPanel', () => {
  it('shows the type fields, then the page’s other properties', async () => {
    await renderPanel('Lab/Dose.md');
    const panel = screen.getByRole('region', { name: 'Properties' });
    expect(within(panel).getByText('Experiment')).toBeTruthy();
    expect(within(panel).getByLabelText('Aim')).toBeTruthy();
    expect(within(panel).getByLabelText<HTMLSelectElement>('Status').value).toBe('planned');
    expect(within(panel).getByRole('button', { name: 'day7' })).toBeTruthy();
    expect(within(panel).getByLabelText<HTMLInputElement>('Cell line').value).toBe('HeLa');
    // Only keys the type does not define can be removed.
    expect(within(panel).queryByRole('button', { name: 'Remove Status' })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Remove Cell line' })).toBeTruthy();
  });

  it('saves changes into the frontmatter', async () => {
    const { store } = await renderPanel('Lab/Dose.md');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'running' } });
    const aim = screen.getByLabelText('Aim');
    fireEvent.change(aim, { target: { value: 'Dose response' } });
    fireEvent.blur(aim);
    fireEvent.click(screen.getByRole('button', { name: 'Remove link to day7' }));
    expect(store.getState().pageProperties).toMatchObject({
      status: 'running',
      aim: 'Dose response',
    });
    // An empty list is not kept.
    expect(store.getState().pageProperties).not.toHaveProperty('datasets');
  });

  it('stays hidden on a page with no properties until one is added', async () => {
    const { store } = await renderPanel('Lab/Plain.md');
    expect(screen.queryByRole('region', { name: 'Properties' })).toBeNull();
    act(() => {
      store.getState().setAddingProperty(true);
    });
    fireEvent.change(screen.getByLabelText('New property name'), { target: { value: 'sample' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(store.getState().pageProperties).toMatchObject({ sample: '' });
    expect(screen.getByLabelText('Sample')).toBeTruthy();
  });
});
