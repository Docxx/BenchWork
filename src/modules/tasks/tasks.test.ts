// @vitest-environment node
import { changeTask, dueFits, readTasks, sortTasks, writeTask } from './tasks';

const PAGE = [
  '# Lab',
  '',
  '- [ ] Order fly food 📅 2026-11-02 #flies',
  '- [x] Flip stocks',
  '  - [ ] Write up gel #doing',
  '1. [ ] Numbered task',
  '- not a task',
  '```',
  '- [ ] in code',
  '```',
  '* [X] Starred done',
].join('\n');

describe('tasks', () => {
  it('are read from checklist lines, with due dates, doing and tags, outside code', () => {
    const tasks = readTasks('Lab/Plan.md', PAGE);
    expect(tasks.map((t) => [t.line, t.text, t.state, t.due, t.tags])).toEqual([
      [2, 'Order fly food #flies', 'todo', '2026-11-02', ['flies']],
      [3, 'Flip stocks', 'done', null, []],
      [4, 'Write up gel', 'doing', null, []],
      [5, 'Numbered task', 'todo', null, []],
      [10, 'Starred done', 'done', null, []],
    ]);
  });

  it('are written back with a new state and due date, keeping the rest', () => {
    expect(writeTask('- [ ] Order fly food 📅 2026-11-02 #flies', 'doing', '2026-11-03')).toBe(
      '- [ ] Order fly food #flies #doing 📅 2026-11-03',
    );
    expect(writeTask('  - [ ] Write up gel #doing', 'done', null)).toBe('  - [x] Write up gel');
    expect(writeTask('1. [x] Numbered', 'todo', null)).toBe('1. [ ] Numbered');
  });

  it('are changed in a page only if the line is still theirs', () => {
    const [task] = readTasks('p.md', PAGE).slice(1);
    if (!task) throw new Error('No task');
    expect(changeTask(PAGE, task, 'todo', null)?.split('\n')[3]).toBe('- [ ] Flip stocks');
    expect(changeTask(PAGE.replace('Flip stocks', 'Flip vials'), task, 'todo', null)).toBeNull();
    expect(changeTask(PAGE.replace(/\n/g, '\r\n'), task, 'todo', null)).toContain('\r\n');
  });

  it('are filtered by when they are due, and sorted by it', () => {
    const tasks = readTasks(
      'p.md',
      ['- [ ] a 📅 2026-10-27', '- [ ] b 📅 2026-10-28', '- [ ] c 📅 2026-11-03', '- [ ] d'].join(
        '\n',
      ),
    );
    const names = (filter: Parameters<typeof dueFits>[1]) =>
      tasks.filter((t) => dueFits(t, filter, '2026-10-28')).map((t) => t.text);
    expect(names('overdue')).toEqual(['a']);
    expect(names('today')).toEqual(['a', 'b']);
    expect(names('week')).toEqual(['a', 'b', 'c']);
    expect(names('none')).toEqual(['d']);
    expect(sortTasks([...tasks].reverse()).map((t) => t.text)).toEqual(['a', 'b', 'c', 'd']);
  });
});
