import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { App } from '@core/ui/App';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import manifestJson from './manifest.json';
import { dueReminders, LATE_MS, reminderKey } from './reminders';
import { dayOf, readTasks, reminderOf } from './tasks';

// Tests may reach core internals to set the app up; the module itself may not.

describe('Tasks: reminders', () => {
  it('are read with their own date, the due date, or the daily page’s date', () => {
    expect(reminderOf('Call ⏰ 2026-11-02 9:30', null, 'Lab/Plan.md')).toBe('2026-11-02T09:30');
    expect(reminderOf('Call ⏰ 14:00', '2026-11-03', 'Lab/Plan.md')).toBe('2026-11-03T14:00');
    expect(reminderOf('Call ⏰ 14:00', null, 'Daily/2026-10/2026-10-30.md')).toBe(
      '2026-10-30T14:00',
    );
    expect(reminderOf('Call ⏰ 14:00', null, 'Lab/Plan.md')).toBeNull();
    expect(reminderOf('Call ⏰ 25:00', '2026-11-03', 'Lab/Plan.md')).toBeNull();
    const [task] = readTasks('p.md', '- [ ] Feed flies ⏰ 2026-10-30 08:15 📅 2026-10-30');
    expect(task).toMatchObject({ text: 'Feed flies', remind: '2026-10-30T08:15' });
  });

  it('are due once their time comes, once each, and not long after', () => {
    const tasks = readTasks(
      'p.md',
      [
        '- [ ] Early ⏰ 2026-10-30 08:00',
        '- [ ] Later ⏰ 2026-10-30 17:00',
        '- [x] Done ⏰ 2026-10-30 08:00',
        '- [ ] Last week ⏰ 2026-10-23 08:00',
      ].join('\n'),
    );
    const now = new Date('2026-10-30T09:00:00');
    expect(dueReminders(tasks, new Set(), now).map((t) => t.text)).toEqual(['Early']);
    const [early] = tasks;
    if (!early) throw new Error('No task');
    expect(dueReminders(tasks, new Set([reminderKey(early)]), now)).toEqual([]);
    expect(LATE_MS).toBeGreaterThan(0);
  });
});

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'tasks');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

describe('Tasks: the Reminders widget', () => {
  it('adds a reminder to today’s page, and lists it', async () => {
    const platform = new MemoryAdapter({
      folders: {
        'C:/Vault': {
          '.benchwork/config.json': JSON.stringify({
            version: 1,
            modules: { tasks: { enabled: true } },
          }),
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
    await act(() => new Promise((r) => setTimeout(r, 30)));

    const widget = screen.getByRole('region', { name: 'Reminders' });
    fireEvent.change(within(widget).getByLabelText('Remind me to'), {
      target: { value: 'Collect virgins' },
    });
    fireEvent.change(within(widget).getByLabelText('At'), { target: { value: '23:59' } });
    fireEvent.click(within(widget).getByRole('button', { name: 'Add' }));
    await act(() => new Promise((r) => setTimeout(r, 50)));

    const today = dayOf(new Date());
    const page = platform.snapshot()[`Daily/${today.slice(0, 7)}/${today}.md`] ?? '';
    expect(page).toContain(`- [ ] Collect virgins ⏰ ${today} 23:59`);
    expect(within(widget).getByRole('button', { name: 'Collect virgins' })).toBeDefined();
    expect(widget.textContent).toContain('23:59');
  });
});
