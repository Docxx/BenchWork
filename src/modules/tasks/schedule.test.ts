// @vitest-environment node
import { datesFor, scheduleOf, taskKey } from './schedule';
import { readTasks } from './tasks';

const PAGE = [
  '- [ ] Thesis',
  '  - [ ] Methods 🆔 m1 🛫 2026-11-02 📅 2026-11-06 📊 50%',
  '  - [x] Results ⛔ m1 🛫 2026-11-09 📅 2026-11-13 ⏫ @Sam',
  '- [ ] Order agar 📅 2026-11-03',
  '- [ ] No dates',
].join('\n');

describe('Tasks on the planner’s chart', () => {
  it('are the tasks with dates, with links, people and priorities', () => {
    const items = scheduleOf(readTasks('Thesis/Plan.md', PAGE));
    const by = Object.fromEntries(items.map((i) => [i.title, i]));
    expect(Object.keys(by).sort()).toEqual(['Methods', 'Order agar', 'Results', 'Thesis']);
    expect(by['Methods']).toMatchObject({ start: '2026-11-02', end: '2026-11-06', progress: 0.5 });
    expect(by['Order agar']).toMatchObject({ start: '2026-11-03', end: '2026-11-03' });
    expect(by['Results']).toMatchObject({
      done: true,
      progress: 1,
      person: 'Sam',
      priority: 2,
      notebook: 'Thesis',
      after: [by['Methods']?.key],
      parent: by['Thesis']?.key,
    });
  });

  it('span a task without dates over its subtasks, with their progress', () => {
    const thesis = scheduleOf(readTasks('Thesis/Plan.md', PAGE)).find((i) => i.title === 'Thesis');
    expect(thesis).toMatchObject({
      start: '2026-11-02',
      end: '2026-11-13',
      summary: true,
      progress: 0.75,
    });
  });

  it('keep an id key steady when lines move, and write dates as the task had them', () => {
    const [methods] = readTasks('p.md', '- [ ] Methods 🆔 m1 📅 2026-11-06');
    if (!methods) throw new Error('No task');
    expect(taskKey(methods)).toBe('tasks.tasks:p.md#m1');
    expect(datesFor(methods, '2026-11-07', '2026-11-07')).toEqual({ due: '2026-11-07' });
    expect(datesFor(methods, '2026-11-07', '2026-11-09')).toEqual({
      start: '2026-11-07',
      due: '2026-11-09',
    });
  });
});
