import type { ModuleContext, ProgramResult } from '@core/api';
import { buildArgs, datasetPaths, earlierRuns, runLog, runStamp, type Script } from './scripts';

export const LOG_FILE = 'run.log';

export interface RunOutcome {
  result: ProgramResult;
  /** The vault folder the results went in. */
  folder: string;
  /** Files the script made, by name. */
  outputs: string[];
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** A dataset record's name: its file name without `.dataset.yaml`. */
export function datasetName(path: string): string {
  return (path.split('/').at(-1) ?? path).replace(/\.dataset\.yaml$/i, '');
}

/**
 * Runs a script on a dataset: its results go in a new folder beside the
 * record, with a log of the run, and the record lists them under
 * `analyses`. The dataset's own files are only read.
 */
export async function runOnDataset(
  ctx: ModuleContext,
  script: Script,
  dataset: string,
  id: string,
  now: Date = new Date(),
): Promise<RunOutcome> {
  const programs = ctx.programs;
  if (!programs) throw new Error('Scripts can only be run on the computer.');
  const { data, error } = await ctx.vault.readRecord(dataset);
  if (error !== null) throw new Error(`The dataset could not be read: ${error}`);
  const folder = parentOf(dataset);
  const name = datasetName(dataset);
  const base = `${name} ${script.name || 'analysis'} ${runStamp(now)}`;
  const output = folder === '' ? base : `${folder}/${base}`;
  await ctx.vault.ensureDir(output);

  const args = buildArgs(script.args, {
    script: script.script,
    files: datasetPaths(data),
    folder,
    output,
    name,
  });
  const result = await programs.run({ id, program: script.program, args, cwd: folder });

  const command = [
    script.program,
    ...args.map((a) => (/\s/.test(a.value) ? `"${a.value}"` : a.value)),
  ].join(' ');
  await ctx.vault.writeText(`${output}/${LOG_FILE}`, runLog(command, result, now));
  const outputs = (await ctx.vault.listDir(output))
    .filter((e) => !e.isDir && e.name !== LOG_FILE)
    .map((e) => e.name)
    .sort();

  await ctx.vault.keepSnapshot(dataset);
  await ctx.vault.updateRecord(dataset, {
    analyses: [
      ...earlierRuns(data),
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
      },
    ],
  });
  return { result, folder: output, outputs };
}
