import { moveTask, parseWorkspace, projectProgress, relatedEvidence, seedWorkspace } from './model';
import { timerSeconds, timerText } from './useTimer';

it('derives project progress from the actual steps and keeps other projects unchanged', () => {
  const start = seedWorkspace();
  expect(projectProgress(start, 'signal')).toBe(25);
  const next = moveTask(start, 't1', 'Complete');
  expect(projectProgress(next, 'signal')).toBe(50);
  expect(projectProgress(next, 'atlas')).toBe(50);
  expect(start.tasks.find((t) => t.id === 't1')?.stage).toBe('In progress');
  expect(projectProgress(next, 'missing')).toBe(0);
});

it('finds connections using shared project membership and shared tags', () => {
  const w = seedWorkspace();
  const related = relatedEvidence(w, 'e3').map((e) => e.id);
  expect(related).toContain('e1');
  expect(related).toContain('e4');
  expect(related).not.toContain('e3');
  expect(related).not.toContain('e6');
});

it('round-trips studio metadata and refuses malformed imports', () => {
  const w = seedWorkspace();
  expect(parseWorkspace(JSON.stringify(w))).toEqual(w);
  expect(() => parseWorkspace('{"version":23}')).toThrow('not supported');
  expect(() =>
    parseWorkspace(JSON.stringify({ ...w, tasks: [{ ...w.tasks[0], stage: 'Wrong' }] })),
  ).toThrow('invalid status');
  expect(() =>
    parseWorkspace(JSON.stringify({ ...w, evidence: [{ ...w.evidence[0], tags: [17] }] })),
  ).toThrow('invalid');
  expect(() => parseWorkspace(JSON.stringify({ ...w, focusMinutes: -1 }))).toThrow('history');
});

it('uses wall-clock deadlines, so a background timer cannot drift or go negative', () => {
  expect(timerSeconds({ duration: 1500, remaining: 1500, end: 100_000 }, 70_001)).toBe(30);
  expect(timerSeconds({ duration: 1500, remaining: 1500, end: 100_000 }, 105_000)).toBe(0);
  expect(timerSeconds({ duration: 1500, remaining: 239, end: null }, 105_000)).toBe(239);
  expect(timerText(1500)).toBe('25:00');
  expect(timerText(61)).toBe('01:01');
});

it('retains custom workflows, upgrades older studios and rejects invalid step timers', () => {
  const workspace = seedWorkspace();
  const older: Record<string, unknown> = { ...workspace };
  delete older['protocol'];
  expect(parseWorkspace(JSON.stringify(older)).protocol).toEqual(workspace.protocol);
  const customised = {
    ...workspace,
    protocol: {
      title: 'My workflow',
      steps: [
        {
          id: 'own-step',
          title: 'Check the reference',
          detail: 'Record the settings',
          seconds: 120,
        },
      ],
    },
  };
  expect(parseWorkspace(JSON.stringify(customised)).protocol).toEqual(customised.protocol);
  expect(() =>
    parseWorkspace(
      JSON.stringify({
        ...customised,
        protocol: {
          ...customised.protocol,
          steps: [{ ...customised.protocol.steps[0], seconds: -1 }],
        },
      }),
    ),
  ).toThrow('step');
});
