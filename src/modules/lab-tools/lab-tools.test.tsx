import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ModuleContext } from '@core/api';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { App } from '@core/ui/App';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import manifestJson from './manifest.json';
import {
  cellsPerMl,
  copyNumber,
  doublingTime,
  ligationInsert,
  massForMolarity,
  masterMix,
  molarityOf,
  nucleicAcidConc,
  percentWeightVolume,
  primerTm,
  proteinConc,
  purity,
  rcf,
  rpmFor,
  seedingVolume,
  serialDilution,
  solveDilution,
  viability,
  volumeForMolarity,
} from './calc';
import { RECIPES, scaleRecipe } from './recipes';
import { clock, TimerStore, type Timer } from './timers';
import { leadTimer } from './TimersTool';
import { convertTemperature } from './tools';
import { convert, formatNumber, formatQuantity, parseNumber } from './units';

// Tests may reach core internals to set the app up; the module itself may not.

const near = (a: number | null, b: number, digits = 6) => {
  expect(a).not.toBeNull();
  expect(a ?? NaN).toBeCloseTo(b, digits);
};

describe('Lab tools: units', () => {
  it('convert, and read best in the largest unit at least 1', () => {
    expect(convert(2.5, 'volume', 'mL', 'µL')).toBeCloseTo(2500);
    expect(convert(1, 'massConc', 'mg/mL', 'ng/µL')).toBeCloseTo(1000);
    expect(formatQuantity(0.0025, 'volume')).toBe('2.5 mL');
    expect(formatQuantity(5.844, 'mass')).toBe('5.844 g');
    expect(formatQuantity(1e-7, 'molar')).toBe('100 nM');
    expect(formatNumber(1234567)).toBe('1.235 × 10^6');
    expect(formatNumber(0.5)).toBe('0.5');
    expect(convertTemperature(100, '°C', '°F')).toBeCloseTo(212);
    expect(convertTemperature(0, '°C', 'K')).toBeCloseTo(273.15);
  });

  it('read numbers as people type them', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('2x10^-3')).toBeCloseTo(0.002);
    expect(parseNumber('1e3')).toBe(1000);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('Lab tools: solutions', () => {
  it('find mass, molarity and volume', () => {
    near(massForMolarity(1, 0.1, 58.44), 5.844);
    near(molarityOf(5.844, 0.1, 58.44), 1);
    near(volumeForMolarity(5.844, 1, 58.44), 0.1);
    expect(molarityOf(1, 0, 58.44)).toBeNull();
  });

  it('solve C1V1 = C2V2 for the one value left empty', () => {
    expect(solveDilution({ c1: 10, v1: null, c2: 1, v2: 1e-3 })?.v1).toBeCloseTo(1e-4);
    expect(solveDilution({ c1: 10, v1: 1e-4, c2: null, v2: 1e-3 })?.c2).toBeCloseTo(1);
    expect(solveDilution({ c1: 10, v1: null, c2: null, v2: 1e-3 })).toBeNull();
  });

  it('make serial dilutions', () => {
    const result = serialDilution(100, 10, 3, 1e-3);
    expect(result?.tubes.map((t) => t.concentration)).toEqual([10, 1, 0.1]);
    near(result?.transfer ?? null, 1e-4);
    near(result?.diluent ?? null, 9e-4);
    expect(serialDilution(100, 1, 3, 1e-3)).toBeNull();
  });

  it('scale percentages and recipes', () => {
    near(percentWeightVolume(2, 0.5), 10);
    const tbe = RECIPES.find((r) => r.id === 'tbe');
    if (!tbe) throw new Error('No TBE');
    expect(scaleRecipe(tbe, 1, 1)[0]?.amount).toBeCloseTo(10.8);
    expect(scaleRecipe(tbe, 0.5, 10)[2]).toEqual({
      name: '0.5 M EDTA, pH 8.0',
      amount: 20,
      unit: 'mL',
    });
  });
});

describe('Lab tools: molecular biology', () => {
  it('find nucleic acid and protein concentrations', () => {
    near(nucleicAcidConc(0.5, 'dsDNA', 10), 250);
    near(nucleicAcidConc(1, 'RNA'), 40);
    near(proteinConc(0.5, 43824, 66430), 0.757918, 5);
  });

  it('judge purity from the ratios', () => {
    expect(purity(1.8, 1, 0.9, 'dsDNA').verdicts).toEqual(['pure']);
    expect(purity(1.5, 1, null, 'dsDNA').verdicts).toEqual(['protein']);
    expect(purity(2, 1, 1.5, 'RNA').verdicts).toEqual(['salt or solvent']);
  });

  it('work out ligations, copies, primers and master mixes', () => {
    near(ligationInsert(50, 3000, 1000, 3), 50);
    near(copyNumber(1, 3000, 'dsDNA'), 3.0883e8, -4);
    expect(primerTm('ATGC')?.tm).toBe(12);
    near(primerTm('ATGCATGCATGCATGCATGC')?.tm ?? null, 51.78, 2);
    expect(primerTm('atgc gc')?.gc).toBeCloseTo(4 / 6);
    expect(
      masterMix(
        [
          { name: 'Buffer', perReaction: 2.5 },
          { name: 'Water', perReaction: 10 },
        ],
        8,
        0.1,
      ),
    ).toEqual([
      { name: 'Buffer', total: 22 },
      { name: 'Water', total: 88 },
    ]);
  });
});

describe('Lab tools: cells and spinning', () => {
  it('count cells and seed them', () => {
    near(cellsPerMl([50, 50, 50, 50], 2), 1e6);
    near(viability(90, 10), 0.9);
    near(seedingVolume(1e6, 2e5, 6), 1.2);
  });

  it('change between rpm and g, and find doubling times', () => {
    near(rcf(13000, 7.3), 13792.8, 1);
    near(rpmFor(13792.8, 7.3), 13000, 1);
    near(doublingTime(1e5, 4e5, 48), 24);
    expect(doublingTime(4e5, 1e5, 48)).toBeNull();
  });
});

describe('Lab tools: timers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeCtx(saved: unknown = null) {
    const written: unknown[] = [];
    const ctx = {
      storage: {
        read: () => Promise.resolve(saved),
        write: (_name: string, data: unknown) => {
          written.push(data);
          return Promise.resolve();
        },
      },
      app: { notify: () => undefined },
    } as unknown as ModuleContext;
    return { ctx, written };
  }

  it('show the one that is done, or ends soonest, large', () => {
    const timer = (id: string, endsAt: number | null, done = false): Timer => ({
      id,
      name: id,
      length: 1000,
      endsAt,
      left: 1000,
      done,
    });
    expect(leadTimer([timer('a', 9000), timer('b', 5000), timer('c', null)], 0)?.id).toBe('b');
    expect(leadTimer([timer('a', 9000), timer('d', null, true)], 0)?.id).toBe('d');
    expect(leadTimer([], 0)).toBeNull();
  });

  it('show time left as a clock', () => {
    expect(clock(65_000)).toBe('1:05');
    expect(clock(3_661_000)).toBe('1:01:01');
    expect(clock(400)).toBe('0:01');
  });

  it('count down, pause, and say when they are done', async () => {
    vi.useFakeTimers();
    const { ctx, written } = fakeCtx();
    const done: string[] = [];
    const store = new TimerStore(ctx, (t) => done.push(t.name));
    await store.load();
    store.add('Gel', 10_000);
    const id = store.state().timers[0]?.id ?? '';
    vi.advanceTimersByTime(4_000);
    store.pause(id);
    vi.advanceTimersByTime(60_000);
    expect(done).toEqual([]);
    expect(store.state().timers[0]?.left).toBeCloseTo(6_000, -2);
    store.resume(id);
    vi.advanceTimersByTime(6_500);
    expect(done).toEqual(['Gel']);
    expect(store.state().timers[0]?.done).toBe(true);
    // Saved with the time it ends, so it carries on after a restart.
    expect(written.length).toBeGreaterThan(0);
    store.dispose();
  });

  it('finish timers that ended while the app was closed', async () => {
    const { ctx } = fakeCtx({
      timers: [{ id: 'a', name: 'Spin', length: 1000, endsAt: 1, left: 1000, done: false }],
    });
    const done: string[] = [];
    const store = new TimerStore(ctx, (t) => done.push(t.name));
    await store.load();
    expect(done).toEqual(['Spin']);
    store.dispose();
  });
});

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'lab-tools');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

async function renderApp() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { 'lab-tools': { enabled: true } },
        }),
        'Lab/Plan.md': '# Plan\n\nBuffer:\n',
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
    await store.getState().start();
    await store.getState().chooseFolder('open');
  });
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return { store, platform };
}

const settle = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('Lab tools: the view', () => {
  it('opens from Tools, and works out a dilution', async () => {
    await renderApp();
    await settle();
    const sidebar = screen.getByRole('navigation', { name: 'Vault' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Lab tools' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Dilution (C1V1)' }));
    const tool = screen.getByRole('region', { name: 'Dilution (C1V1)' });
    fireEvent.change(within(tool).getByLabelText('Stock (C1)'), { target: { value: '10' } });
    fireEvent.change(within(tool).getByLabelText('Final (C2)'), { target: { value: '1' } });
    fireEvent.change(within(tool).getByLabelText('Final volume (V2)'), { target: { value: '1' } });
    expect(within(tool).getByRole('status', { name: 'Mix' }).textContent).toContain(
      '100 µL of 10 mM stock + 900 µL diluent = 1 mL at 1 mM',
    );
    // Not beside a page, so answers are copied, not added.
    expect(within(tool).queryByRole('button', { name: 'Add to page' })).toBeNull();
  });

  it('adds an answer to the page it is beside', async () => {
    const { store, platform } = await renderApp();
    await act(() => store.getState().openPage('Lab/Plan.md'));
    await settle(80);
    fireEvent.click(screen.getByRole('tab', { name: 'Lab tools' }));
    await settle();
    fireEvent.change(screen.getByRole('combobox', { name: 'Tool' }), {
      target: { value: 'percent' },
    });
    fireEvent.change(screen.getByLabelText('Percentage'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Final volume'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to page' }));
    await act(() => store.getState().savePageNow());
    expect(platform.snapshot()['Lab/Plan.md']).toContain('10 g in 500 mL for 2% w/v');
  });
});
