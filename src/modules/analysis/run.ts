import type { ModuleContext, ProgramResult } from '@core/api';
import {
  buildArgs,
  datasetPaths,
  earlierRuns,
  isFullPath,
  runLog,
  runStamp,
  type Script,
} from './scripts';

export const LOG_FILE = 'run.log';
export interface RunOutcome {
  result: ProgramResult;
  folder: string;
  outputs: string[];
  record: string;
}
export function datasetName(path: string): string {
  return (path.split('/').at(-1) ?? path).replace(/\.dataset\.yaml$/i, '');
}
const safeName = (value: string) =>
  value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 90) || 'analysis';

async function fingerprint(ctx: ModuleContext, path: string) {
  const external = isFullPath(path);
  const info = await ctx.vault.fileInfo(path, external);
  return { path, ...info, sha256: await ctx.vault.hashFile(path, external) };
}

/** A durable record exists before launching a process, including when launch fails. */
export async function runOnDataset(
  ctx: ModuleContext,
  script: Script,
  dataset: string,
  id: string,
  now = new Date(),
  options: { signal?: AbortSignal; parameters?: Record<string, string> } = {},
): Promise<RunOutcome> {
  const programs = ctx.programs;
  if (!programs) throw new Error('Scripts can only be run on the computer.');
  const { data, error } = await ctx.vault.readRecord(dataset);
  if (error !== null) throw new Error(`The dataset could not be read: ${error}`);
  const folder = dataset.includes('/') ? dataset.slice(0, dataset.lastIndexOf('/')) : '';
  const name = datasetName(dataset);
  const base = `${safeName(name)} ${safeName(script.name)} ${runStamp(now)} ${crypto.randomUUID().slice(0, 8)}`;
  const output = folder ? `${folder}/${base}` : base;
  await ctx.vault.ensureDir(output);
  const parameters = { ...script.parameters, ...options.parameters };
  const record = await ctx.vault.createRecord(
    output,
    `${name} ${script.name || 'Analysis'}`,
    'analysis',
    {
      title: `${name}: ${script.name || 'Analysis'}`,
      dataset: `[[${dataset}]]`,
      status: 'preparing',
      started: now.toISOString(),
      program: script.program,
      script: script.script,
      parameters,
      scope:
        'Main script snapshot and file hashes. Imports, packages and external services are not captured. The original script runs to preserve its local imports.',
    },
  );
  const check = () => {
    if (options.signal?.aborted) throw new Error('Run stopped.');
  };
  let result: ProgramResult | null = null;
  let command = script.program;
  try {
    check();
    const inputs = await Promise.all(datasetPaths(data).map((path) => fingerprint(ctx, path)));
    if (!programs.snapshotFile) throw new Error('This device cannot capture a script snapshot.');
    const extension = /\.[a-z0-9]+$/i.exec(script.script)?.[0] ?? '.txt';
    const snapshot = `${output}/script${extension}`;
    const scriptSha256 = await programs.snapshotFile(script.script, snapshot);
    const args = buildArgs(script.args, {
      script: script.script,
      files: datasetPaths(data),
      folder,
      output,
      name,
      parameters,
    });
    command = [script.program, ...args.map((a) => JSON.stringify(a.value))].join(' ');
    await ctx.vault.updateRecord(record, {
      inputs,
      snapshot: `[[${snapshot}]]`,
      scriptSha256,
      arguments: args,
      status: 'ready',
    });
    check();
    const executable = script.program.split(/[\\/]/).at(-1) ?? '';
    let runtime = 'Not probed for custom executables';
    if (/^(python(?:\d+(?:\.\d+)?)?|Rscript)(?:\.exe)?$/i.test(executable)) {
      const version = await programs.run({
        id: `${id}.version`,
        program: script.program,
        args: [{ kind: 'text', value: '--version' }],
        cwd: folder,
      });
      runtime = `${version.stdout}\n${version.stderr}`.trim();
    }
    check();
    await ctx.vault.updateRecord(record, { runtime, status: 'running' });
    check();
    result = await programs.run({ id, program: script.program, args, cwd: folder });
    await ctx.vault.writeText(`${output}/${LOG_FILE}`, runLog(command, result, now));
    const outputs: string[] = [];
    const walk = async (directory: string, prefix: string) => {
      for (const entry of await ctx.vault.listDir(directory)) {
        const relative = `${prefix}${entry.name}`;
        if (entry.isDir) await walk(`${directory}/${entry.name}`, `${relative}/`);
        else if (
          !['run.log', snapshot.split('/').at(-1), record.split('/').at(-1)].includes(relative)
        )
          outputs.push(relative);
      }
    };
    await walk(output, '');
    outputs.sort();
    const outputFiles = await Promise.all(outputs.map((p) => fingerprint(ctx, `${output}/${p}`)));
    const scriptChanged = await ctx.vault
      .hashFile(script.script, isFullPath(script.script))
      .then((hash) => hash !== scriptSha256)
      .catch(() => true);
    const inputsAfter = await Promise.all(
      inputs.map(async (input) => ({
        path: input.path,
        changed: await ctx.vault
          .hashFile(input.path, isFullPath(input.path))
          .then((hash) => hash !== input.sha256)
          .catch(() => true),
      })),
    );
    await ctx.vault.updateRecord(record, {
      status: result.stopped ? 'stopped' : result.code === 0 ? 'done' : 'failed',
      finished: new Date().toISOString(),
      exitCode: result.code,
      outputs: outputFiles,
      scriptChanged,
      inputsAfter,
      log: `[[${output}/${LOG_FILE}]]`,
    });
    await ctx.vault.keepSnapshot(dataset);
    const current = await ctx.vault.readRecord(dataset);
    if (current.error !== null) throw new Error(current.error);
    await ctx.vault.updateRecord(dataset, {
      analyses: [
        ...earlierRuns(current.data),
        {
          script: script.name || script.script,
          ran: now.toISOString(),
          result: result.stopped
            ? 'stopped'
            : result.code === 0
              ? 'done'
              : `exit code ${String(result.code)}`,
          folder: output,
          outputs,
          record: `[[${record}]]`,
        },
      ],
    });
    return { result, folder: output, outputs, record };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.vault.writeText(
      `${output}/${LOG_FILE}`,
      result
        ? `${runLog(command, result, now)}\nRecording error: ${message}\n`
        : `Run did not complete: ${message}\n`,
    );
    await ctx.vault.updateRecord(record, {
      status: options.signal?.aborted ? 'stopped' : 'failed',
      finished: new Date().toISOString(),
      error: message,
      log: `[[${output}/${LOG_FILE}]]`,
    });
    throw err;
  }
}

/** Runs survive navigation; module/vault shutdown waits for their final records. */
export class AnalysisSession {
  private closed = false;
  private active = new Map<
    string,
    { controller: AbortController; pending: Promise<RunOutcome>; dataset: string }
  >();
  current() {
    const first = this.active.entries().next().value;
    return first ? { id: first[0], ...first[1] } : null;
  }
  constructor(private readonly ctx: ModuleContext) {}
  run(script: Script, dataset: string, id: string, parameters: Record<string, string>) {
    if (this.closed || this.active.size)
      return Promise.reject(new Error('Wait for the current run to finish.'));
    const controller = new AbortController();
    const pending = runOnDataset(this.ctx, script, dataset, id, new Date(), {
      parameters,
      signal: controller.signal,
    }).finally(() => {
      this.active.delete(id);
    });
    this.active.set(id, { controller, pending, dataset });
    return pending;
  }
  async stop(id: string) {
    const entry = this.active.get(id);
    if (!entry) return;
    entry.controller.abort();
    const stop = () =>
      Promise.all([this.ctx.programs?.stop(id), this.ctx.programs?.stop(`${id}.version`)]).catch(
        () => undefined,
      );
    const timer = setInterval(() => void stop(), 150);
    try {
      await stop();
      await entry.pending.catch(() => undefined);
    } finally {
      clearInterval(timer);
    }
  }
  async close() {
    this.closed = true;
    await Promise.all([...this.active.keys()].map((id) => this.stop(id)));
  }
}
