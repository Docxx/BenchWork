// @vitest-environment node
import {
  buildArgs,
  datasetPaths,
  earlierRuns,
  parseScripts,
  runLog,
  runStamp,
  words,
} from './scripts';

describe('analysis scripts', () => {
  it('fill their argument pattern, with vault paths left for the core to make full', () => {
    expect(
      buildArgs('{script} --in {files} --out {output} --label "{name} run"', {
        script: 'C:\\Scripts\\buzzz.py',
        files: ['Data/day7.mp4', 'D:\\Lab\\day7-raw.avi'],
        folder: 'Data',
        output: 'Data/day7 Buzzz 2026-10-28 1530',
        name: 'day7',
      }),
    ).toEqual([
      { kind: 'text', value: 'C:\\Scripts\\buzzz.py' },
      { kind: 'text', value: '--in' },
      { kind: 'vault', value: 'Data/day7.mp4' },
      { kind: 'text', value: 'D:\\Lab\\day7-raw.avi' },
      { kind: 'text', value: '--out' },
      { kind: 'vault', value: 'Data/day7 Buzzz 2026-10-28 1530' },
      { kind: 'text', value: '--label' },
      { kind: 'text', value: 'day7 run' },
    ]);
    expect(words(`a "b c" 'd e' f`)).toEqual(['a', 'b c', 'd e', 'f']);
  });

  it('are read back from storage, keeping only scripts', () => {
    expect(parseScripts([{ id: 'a', name: 'Buzzz' }, 'junk', { name: 'no id' }])).toEqual([
      { id: 'a', name: 'Buzzz', program: 'python', script: '', args: '{script} {files} {output}' },
    ]);
    expect(parseScripts(null)).toEqual([]);
  });
});

describe('datasets for analysis', () => {
  it('list their files, as written in either form', () => {
    expect(
      datasetPaths({ files: ['Data/a.csv', { path: 'D:\\Lab\\b.avi', size: 3 }, { size: 1 }, ''] }),
    ).toEqual(['Data/a.csv', 'D:\\Lab\\b.avi']);
    expect(earlierRuns({ analyses: [{ script: 'x' }, 'junk'] })).toEqual([{ script: 'x' }]);
  });

  it('have each run named by time and logged', () => {
    expect(runStamp(new Date(2026, 9, 28, 15, 30))).toBe('2026-10-28 1530');
    const log = runLog(
      'python buzzz.py',
      { code: 0, stdout: 'done\n', stderr: '', stopped: false },
      new Date(Date.UTC(2026, 9, 28, 15, 30)),
    );
    expect(log).toContain('Command: python buzzz.py');
    expect(log).toContain('Result: exit code 0');
    expect(log).toContain('--- Output ---\ndone');
  });
});
