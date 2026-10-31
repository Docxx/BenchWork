// @vitest-environment node
import {
  changeTask,
  dueFits,
  newTaskId,
  readTasks,
  sortTasks,
  writeFields,
  writeTask,
} from './tasks';

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
  '- [ ] Flip [[w1118]] and [[elav-GAL4|elav]]',
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
      [11, 'Flip w1118 and elav', 'todo', null, []],
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

describe('task details', () => {
  const LINE =
    '- [ ] Write methods @Sam 🔼 📊 40% 🆔 m1 ⛔ d1,d2 🛫 2026-11-02 📅 2026-11-06 #thesis';

  it('are read from their marks, leaving the text plain', () => {
    const [task] = readTasks('Lab/Plan.md', LINE);
    expect(task).toMatchObject({
      text: 'Write methods #thesis',
      person: 'Sam',
      priority: 'medium',
      progress: 40,
      id: 'm1',
      after: ['d1', 'd2'],
      start: '2026-11-02',
      due: '2026-11-06',
      tags: ['thesis'],
    });
  });

  it('are written back one at a time, keeping the rest', () => {
    expect(writeFields(LINE, { progress: 60 })).toBe(
      '- [ ] Write methods @Sam 🔼 🆔 m1 ⛔ d1,d2 🛫 2026-11-02 📅 2026-11-06 #thesis 📊 60%',
    );
    expect(
      writeFields('- [ ] Plan', { priority: 'high', person: 'Ray', start: '2026-11-01' }),
    ).toBe('- [ ] Plan @Ray ⏫ 🛫 2026-11-01');
    const cleared = writeFields(LINE, {
      person: null,
      priority: null,
      progress: null,
      id: null,
      after: [],
      start: null,
      due: null,
    });
    expect(cleared).toBe('- [ ] Write methods #thesis');
  });

  it('make indented tasks subtasks of the one above', () => {
    const tasks = readTasks(
      'p.md',
      [
        '- [ ] Thesis',
        '  - [ ] Methods',
        '    - [ ] Climbing',
        '  - [ ] Results',
        '- [ ] Holiday',
        '',
        'Text ends the list.',
        '  - [ ] Not under Holiday',
      ].join('\n'),
    );
    expect(tasks.map((t) => [t.text, t.parent])).toEqual([
      ['Thesis', null],
      ['Methods', 0],
      ['Climbing', 1],
      ['Results', 0],
      ['Holiday', null],
      ['Not under Holiday', null],
    ]);
  });

  it('get ids no other task has', () => {
    const id = newTaskId(new Set(['a1b2']));
    expect(id).toMatch(/^[a-z0-9]{1,4}$/);
    expect(id).not.toBe('a1b2');
  });
});
