import { spawnSync } from 'node:child_process';

// A separate output directory keeps the existing BenchWork build untouched.
const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, BENCHWORK_NEXT: '1' },
});
process.exitCode = result.status ?? 1;
