import { act, fireEvent, render, screen, within } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { PageView } from '@core/ui/PageView';
import manifestJson from './manifest.json';
import { plotTraces } from './plot';

// Tests may reach core internals to set the app up; the module itself may not.

const react = vi.fn(() => Promise.resolve());
const purge = vi.fn();
vi.mock('plotly.js-dist-min', () => ({ react, purge }));

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'data-viewer');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

const settle = (ms = 20) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

async function openFile(
  path: string,
  files: Record<string, string> = {},
  enabled = true,
  bytes?: Uint8Array,
) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { 'data-viewer': { enabled } },
        }),
        ...files,
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
    if (bytes) await platform.writeBytes(path, bytes);
  });
  render(
    <AppStoreProvider store={store}>
      <PageView />
    </AppStoreProvider>,
  );
  await act(async () => {
    await store.getState().openPath(path);
  });
  await settle();
  return { platform, store, state: () => store.getState() };
}

const sheet = () => screen.getByRole('table', { name: 'Sheet' });
const cell = (row: number, col: number) =>
  within(sheet()).getAllByRole('row')[row]?.querySelectorAll('td')[col] as HTMLElement;

/** Selects a cell and types new contents into the formula bar. */
function enter(row: number, col: number, text: string) {
  fireEvent.mouseDown(cell(row, col));
  const bar = screen.getByRole('textbox', { name: 'Cell contents' });
  fireEvent.focus(bar);
  fireEvent.change(bar, { target: { value: text } });
  fireEvent.keyDown(bar, { key: 'Enter' });
}

function saveNow() {
  fireEvent.keyDown(sheet(), { key: 's', ctrlKey: true });
}

describe('Data viewer: plots', () => {
  const values = [
    ['dose', 'cm', 'genotype'],
    [1, 10, 'w1118'],
    [2, 12, 'w1118'],
    [1, 7, 'mutant'],
    [2, 'n/a', 'mutant'],
  ];

  it('plots one column against another, leaving out rows without a number', () => {
    expect(
      plotTraces(values, { type: 'scatter', x: 0, y: 1, group: null, headings: true }),
    ).toEqual([{ type: 'scatter', mode: 'markers', x: [1, 2, 1], y: [10, 12, 7] }]);
  });

  it('splits into named groups, one box per group', () => {
    const traces = plotTraces(values, { type: 'box', x: 0, y: 1, group: 2, headings: true });
    expect(traces).toEqual([
      { name: 'w1118', type: 'box', y: [10, 12] },
      { name: 'mutant', type: 'box', y: [7] },
    ]);
  });

  it('draws with Plotly when the plot is shown, and clears it when hidden', async () => {
    await openFile('data.csv', { 'data.csv': 'dose,cm\n1,10\n2,12\n' });
    fireEvent.click(screen.getByRole('button', { name: 'Plot' }));
    await settle();
    expect(react).toHaveBeenCalled();
    const traces = (react.mock.calls.at(-1) as unknown[] | undefined)?.[1];
    expect(traces).toEqual([{ type: 'scatter', mode: 'markers', x: [1, 2], y: [10, 12] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Plot' }));
    await settle();
    expect(purge).toHaveBeenCalled();
  });
});

describe('Data viewer: editing', () => {
  it('opens a CSV file as a sheet', async () => {
    await openFile('Data/day7.csv', { 'Data/day7.csv': 'fly,cm\nw1118,12\n' });
    expect(cell(1, 0).textContent).toBe('fly');
    expect(cell(2, 1).textContent).toBe('12');
    expect(screen.getByText(/keep the results of formulas/)).toBeTruthy();
  });

  it('works out formulas and saves their results, keeping a copy of the file first', async () => {
    const { platform } = await openFile('data.csv', { 'data.csv': 'a,b\n1,2\n3,4\n' });
    enter(1, 2, 'sum');
    enter(2, 2, '=A2+B2');
    expect(cell(2, 2).textContent).toBe('3');
    saveNow();
    await settle();

    const files = platform.snapshot();
    expect(files['data.csv']).toBe('a,b,sum\n1,2,3\n3,4\n');
    const copies = Object.entries(files).filter(
      ([p, v]) => p.startsWith('.benchwork/snapshots/') && v !== null,
    );
    expect(copies).toHaveLength(1);
    expect(copies[0]?.[1]).toBe('a,b\n1,2\n3,4\n');
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });

  it('saves by itself a moment after the last edit', async () => {
    const { platform } = await openFile('data.csv', { 'data.csv': 'a\n1\n' });
    enter(2, 0, '5');
    expect(screen.getByRole('status').textContent).toBe('Edited');
    await settle(1200);
    expect(platform.snapshot()['data.csv']).toBe('a\n5\n');
  });

  it('adds rows and sorts below the headings', async () => {
    const { platform } = await openFile('data.csv', { 'data.csv': 'n\n3\n1\n2\n' });
    fireEvent.mouseDown(cell(1, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Sort A to Z' }));
    saveNow();
    await settle();
    expect(platform.snapshot()['data.csv']).toBe('n\n1\n2\n3\n');
  });

  it('opens Excel files read-only until asked to edit them', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['x'], [1]]), 'Counts');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    await openFile('counts.xlsx', {}, true, new Uint8Array(bytes));
    expect(cell(1, 0).textContent).toBe('x');
    expect(screen.getByRole('status').textContent).toBe('Read-only');
    expect(screen.getByRole('button', { name: 'Add row' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit anyway' }));
    expect(screen.getByRole('button', { name: 'Add row' })).toHaveProperty('disabled', false);
  });

  it('reloads a file changed elsewhere, but never saves over it', async () => {
    const { platform } = await openFile('data.csv', { 'data.csv': 'a\n1\n' });
    await act(async () => {
      await platform.writeTextAtomic('data.csv', 'a\n2\n');
    });
    await settle();
    expect(cell(2, 0).textContent).toBe('2');

    enter(2, 0, '9');
    await act(async () => {
      await platform.writeTextAtomic('data.csv', 'a\n3\n');
    });
    await settle(1200);
    expect(screen.getByRole('alert').textContent).toMatch(/changed outside BenchWork/);
    expect(platform.snapshot()['data.csv']).toBe('a\n3\n');
    fireEvent.click(screen.getByRole('button', { name: 'Load the other version' }));
    await settle();
    expect(cell(2, 0).textContent).toBe('3');
  });
});

describe('Data viewer: datasets', () => {
  it('says which dataset a file is in, and updates its checksum after saving', async () => {
    const record = 'id: d1\nfiles:\n  - path: data.csv\n    size: 4\n    sha256: old\n';
    const { platform } = await openFile('data.csv', {
      'data.csv': 'a\n1\n',
      'run.dataset.yaml': record,
    });
    expect(screen.getByText(/Part of run\./)).toBeTruthy();
    enter(2, 0, '22');
    saveNow();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Update checksum' }));
    await settle();
    const updated = platform.snapshot()['run.dataset.yaml'] ?? '';
    expect(updated).toContain('size: 5');
    expect(updated).toMatch(/sha256: [0-9a-f]{64}/);
  });
});

describe('Data viewer: switched off', () => {
  it('leaves data files alone, and the core preview opens them', async () => {
    const { platform } = await openFile('data.csv', { 'data.csv': 'a\n1\n' }, false);
    expect(screen.queryByRole('table', { name: 'Sheet' })).toBeNull();
    expect(platform.snapshot()['data.csv']).toBe('a\n1\n');
  });
});
