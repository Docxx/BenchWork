import { checklistItems, type ChecklistItem, type ModuleContext, type VaultItem } from '@core/api';

export interface ProjectSummary {
  path: string;
  folder: string;
  title: string;
  aim: string;
  status: string;
  error: string | null;
  linkedPaths?: readonly string[];
}
export interface ProjectFile extends VaultItem {
  group: 'notes' | 'experiments' | 'files';
}
export interface ProjectTask extends ChecklistItem {
  path: string;
  pageTitle: string;
}
export interface ProjectContents {
  files: ProjectFile[];
  tasks: ProjectTask[];
  warnings: string[];
}

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const fileName = (path: string) => path.split('/').at(-1) ?? path;
const string = (value: unknown) => (typeof value === 'string' ? value : '');

/** Existing typed hubs and the original project.md convention both remain supported. */
export async function loadProjects(
  ctx: ModuleContext,
  items: readonly VaultItem[],
): Promise<ProjectSummary[]> {
  const hubs = items.filter(
    (item) => item.type === 'project' || fileName(item.path).toLowerCase() === 'project.md',
  );
  const projects: ProjectSummary[] = [];
  // Limit parallel file reads on large vaults and slower tablet storage.
  for (let start = 0; start < hubs.length; start += 8) {
    projects.push(
      ...(await Promise.all(
        hubs.slice(start, start + 8).map(async (item) => {
          const folder = parentOf(item.path);
          const title =
            fileName(item.path).toLowerCase() === 'project.md'
              ? fileName(folder) || item.title
              : item.title;
          try {
            const data = await ctx.app.pageProperties(item.path);
            const linkedPaths = (await ctx.app.linksTo(item.path)).map((linked) => linked.path);
            return {
              path: item.path,
              folder,
              title,
              aim: string(data?.['aim']),
              status: string(data?.['status']) || 'active',
              error: data === null ? 'The project properties could not be read.' : null,
              linkedPaths,
            };
          } catch (error) {
            return {
              path: item.path,
              folder,
              title,
              aim: '',
              status: '',
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      )),
    );
  }
  return projects.sort((a, b) => a.title.localeCompare(b.title, 'en-GB'));
}

/** Nearest project folder wins. Shared folders require an explicit link to avoid mixing projects. */
export function projectForPath(
  path: string,
  projects: readonly ProjectSummary[],
): ProjectSummary | null {
  const exact = projects.find((p) => p.path === path);
  if (exact) return exact;
  const possible = projects
    .filter((p) => p.folder === '' || path.startsWith(`${p.folder}/`))
    .sort((a, b) => b.folder.length - a.folder.length);
  const nearest = possible[0];
  return nearest && possible.filter((p) => p.folder === nearest.folder).length === 1
    ? nearest
    : null;
}

export function projectFile(item: VaultItem): ProjectFile {
  return {
    ...item,
    group:
      item.type === 'experiment'
        ? 'experiments'
        : item.path.toLowerCase().endsWith('.md')
          ? 'notes'
          : 'files',
  };
}

/** Folder membership plus explicit backlinks, using the vault's files rather than a second database. */
export async function loadProjectContents(
  ctx: ModuleContext,
  project: ProjectSummary,
  projects: readonly ProjectSummary[],
  indexed: readonly VaultItem[],
): Promise<ProjectContents> {
  const files = new Map<string, ProjectFile>();
  const warnings: string[] = [];
  const index = new Map(indexed.map((item) => [item.path, item]));
  const hubs = new Set(projects.map((p) => p.path));
  const add = (item: VaultItem) => {
    if (!hubs.has(item.path)) files.set(item.path, projectFile(item));
  };
  let visited = 0;
  const walk = async (folder: string, depth: number): Promise<void> => {
    if (depth > 32 || visited > 20_000)
      throw new Error(
        'This project is too large to list completely. Open its folder in the sidebar.',
      );
    let entries;
    try {
      entries = await ctx.vault.listDir(folder);
    } catch (error) {
      warnings.push(
        `${folder || 'Vault root'} could not be listed. ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      visited += 1;
      if (visited > 20_000)
        throw new Error(
          'This project is too large to list completely. Open its folder in the sidebar.',
        );
      if (entry.isDir) {
        // A nested project keeps its own contents.
        if (projects.some((p) => p.path !== project.path && p.folder === entry.path)) continue;
        await walk(entry.path, depth + 1);
      } else if (projectForPath(entry.path, projects)?.path === project.path) {
        add(
          index.get(entry.path) ?? {
            path: entry.path,
            title: entry.name.endsWith('.md') ? entry.name.slice(0, -3) : entry.name,
            type: '',
            changed: entry.modified,
          },
        );
      }
    }
  };
  await walk(project.folder, 0);
  try {
    for (const item of await ctx.app.linksTo(project.path)) add(item);
  } catch {
    warnings.push('Linked items could not be loaded. Folder contents are still shown.');
  }
  const tasks: ProjectTask[] = [];
  const pages = [{ path: project.path, title: project.title }, ...files.values()].filter((f) =>
    f.path.toLowerCase().endsWith('.md'),
  );
  for (let start = 0; start < pages.length; start += 8) {
    await Promise.all(
      pages.slice(start, start + 8).map(async (page) => {
        try {
          for (const task of checklistItems(await ctx.vault.readText(page.path)))
            tasks.push({ ...task, path: page.path, pageTitle: page.title });
        } catch {
          warnings.push(`Tasks in ${page.title} could not be read.`);
        }
      }),
    );
  }
  return {
    files: [...files.values()].sort((a, b) => a.title.localeCompare(b.title, 'en-GB')),
    tasks: tasks.sort(
      (a, b) =>
        Number(a.checked) - Number(b.checked) || a.pageTitle.localeCompare(b.pageTitle, 'en-GB'),
    ),
    warnings,
  };
}
