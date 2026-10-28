import type { ProgramArg } from '@core/api';

/**
 * The person's analysis scripts, and how each is run on a dataset. A
 * script's arguments are a pattern such as `{script} {files} {output}`:
 * - `{script}` the script file;
 * - `{files}` each of the dataset's files, as separate arguments;
 * - `{folder}` the folder the dataset record is in;
 * - `{output}` a new folder for this run's results;
 * - `{name}` the dataset's name.
 * Words in quotes stay together, so paths with spaces can be written.
 */

export interface Script {
  id: string;
  name: string;
  /** The program that runs it, such as `python` or a full path to one. */
  program: string;
  /** The script file: a full path, or a vault path. */
  script: string;
  args: string;
}

export const DEFAULT_ARGS = '{script} {files} {output}';

export function newScript(): Script {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: '',
    program: 'python',
    script: '',
    args: DEFAULT_ARGS,
  };
}

/** Whether a path is a full path on the computer, rather than a vault path. */
export function isFullPath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('/') || path.startsWith('\\\\');
}

/** A path as an argument: full paths as they are, vault paths made full by the core. */
function pathArg(path: string): ProgramArg {
  return isFullPath(path) ? { kind: 'text', value: path } : { kind: 'vault', value: path };
}

/** Words of a pattern; quoted words stay together, without their quotes. */
export function words(pattern: string): string[] {
  return [...pattern.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

export interface RunPlaces {
  script: string;
  files: readonly string[];
  folder: string;
  output: string;
  name: string;
}

/** The arguments for a run: the pattern with its placeholders filled in. */
export function buildArgs(pattern: string, places: RunPlaces): ProgramArg[] {
  return words(pattern).flatMap((word): ProgramArg[] => {
    switch (word) {
      case '{script}':
        return [pathArg(places.script)];
      case '{files}':
        return places.files.map(pathArg);
      case '{folder}':
        return [pathArg(places.folder)];
      case '{output}':
        return [pathArg(places.output)];
      default:
        return [{ kind: 'text', value: word.replaceAll('{name}', places.name) }];
    }
  });
}

/** Parses saved scripts; anything not a script is left out. */
export function parseScripts(data: unknown): Script[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((s: unknown): Script[] => {
    if (typeof s !== 'object' || s === null) return [];
    const r = s as Record<string, unknown>;
    const text = (k: string, fallback: string) => (typeof r[k] === 'string' ? r[k] : fallback);
    if (typeof r['id'] !== 'string') return [];
    return [
      {
        id: r['id'],
        name: text('name', ''),
        program: text('program', 'python'),
        script: text('script', ''),
        args: text('args', DEFAULT_ARGS),
      },
    ];
  });
}

/** A time as folder names write it: `2026-10-28 1530`. */
export function runStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** What a dataset record says about its files: vault or full paths. */
export function datasetPaths(data: Record<string, unknown>): string[] {
  const files = data['files'];
  if (!Array.isArray(files)) return [];
  return files.flatMap((f: unknown): string[] => {
    const path =
      typeof f === 'string'
        ? f
        : typeof f === 'object' && f !== null
          ? (f as Record<string, unknown>)['path']
          : null;
    return typeof path === 'string' && path.trim() !== '' ? [path.trim()] : [];
  });
}

/** The record's earlier runs, to add to. */
export function earlierRuns(data: Record<string, unknown>): Record<string, unknown>[] {
  const runs = data['analyses'];
  return Array.isArray(runs)
    ? runs.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    : [];
}

/** The run's log: what ran, how it ended, and what it printed. */
export function runLog(
  command: string,
  result: { code: number | null; stdout: string; stderr: string; stopped: boolean },
  when: Date,
): string {
  return [
    `Ran: ${when.toISOString()}`,
    `Command: ${command}`,
    `Result: ${result.stopped ? 'stopped' : `exit code ${String(result.code)}`}`,
    '',
    '--- Output ---',
    result.stdout.trimEnd(),
    '',
    '--- Errors ---',
    result.stderr.trimEnd(),
    '',
  ].join('\n');
}
