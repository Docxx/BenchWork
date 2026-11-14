import type { ModuleContext, VaultItem } from '@core/api';
import { MemoryAdapter } from '@core/platform/memory';
import {
  loadProjectContents,
  loadProjects,
  projectForPath,
  type ProjectSummary,
} from './projectWorkspace';

const project = (path: string): ProjectSummary => ({
  path,
  folder: path.slice(0, path.lastIndexOf('/')),
  title: path.split('/').at(-2) ?? '',
  aim: '',
  status: 'active',
  error: null,
});
const item = (path: string, type = 'page'): VaultItem => ({
  path,
  type,
  title: path.split('/').at(-1)?.replace(/\.md$/, '') ?? '',
  changed: null,
});

it('keeps similar names, nested projects and shared folders separate', () => {
  const a = project('Alpha/project.md'),
    nested = project('Alpha/Nested/project.md'),
    b = project('Alphabet/project.md');
  const projects = [a, nested, b];
  expect(projectForPath('Alpha/Notes/a.md', projects)?.path).toBe(a.path);
  expect(projectForPath('Alpha/Nested/Notes/a.md', projects)?.path).toBe(nested.path);
  expect(projectForPath('Alphabet/Notes/a.md', projects)?.path).toBe(b.path);
  expect(projectForPath('Unrelated/a.md', projects)).toBeNull();
  const shared = [project('Shared/One.md'), project('Shared/Two.md')];
  expect(projectForPath('Shared/notes.md', shared)).toBeNull();
  expect(projectForPath('Shared/One.md', shared)?.path).toBe('Shared/One.md');
});

it('loads the original project.md convention and typed hubs without rewriting files', async () => {
  const ctx = {
    app: {
      linksTo: () => Promise.resolve([item('Shared/Linked.md')]),
      pageProperties: (path: string) =>
        Promise.resolve(path.includes('Alpha') ? { aim: 'Test recovery', status: 'paused' } : {}),
    },
  } as unknown as ModuleContext;
  const projects = await loadProjects(ctx, [
    item('Alpha/project.md'),
    item('Other/Custom.md', 'project'),
    item('Other/Notes.md'),
  ]);
  expect(projects.map((p) => [p.path, p.title, p.aim, p.status])).toEqual([
    ['Alpha/project.md', 'Alpha', 'Test recovery', 'paused'],
    ['Other/Custom.md', 'Custom', '', 'active'],
  ]);
});

it('collects binary assets, linked notes and real checklists, excluding nested and unrelated project data', async () => {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        'Alpha/project.md': '# Alpha\n- [ ] Plan controls\n',
        'Alpha/Notes/Run.md': '# Run\n- [x] Record baseline\n',
        'Alpha/Experiments/Pilot.md': '# Pilot\n',
        'Alpha/Data/image.tif': 'image',
        'Alpha/.private/hidden.txt': 'private',
        'Alpha/Nested/project.md': '# Nested\n',
        'Alpha/Nested/secret.md': '- [ ] Nested task\n',
        'Beta/project.md': '# Beta\n',
        'Beta/note.md': '- [ ] Beta task\n',
        'Shared/Linked.md': '- [ ] Review result\n\n```md\n- [ ] Example only\n```\n',
      },
    },
  });
  await platform.setVaultRoot('C:/Vault');
  const a = project('Alpha/project.md');
  const projects = [a, project('Alpha/Nested/project.md'), project('Beta/project.md')];
  const indexed = [
    item('Alpha/Notes/Run.md'),
    item('Alpha/Experiments/Pilot.md', 'experiment'),
    item('Shared/Linked.md'),
  ];
  const ctx = {
    vault: {
      listDir: (path: string) => platform.listDir(path),
      readText: (path: string) => platform.readText(path),
    },
    app: { linksTo: () => Promise.resolve([item('Shared/Linked.md')]) },
  } as unknown as ModuleContext;
  const before = platform.snapshot();
  const contents = await loadProjectContents(ctx, a, projects, indexed);
  expect(contents.files.map((f) => f.path).sort()).toEqual([
    'Alpha/Data/image.tif',
    'Alpha/Experiments/Pilot.md',
    'Alpha/Notes/Run.md',
    'Shared/Linked.md',
  ]);
  expect(contents.files.find((f) => f.path.endsWith('Pilot.md'))?.group).toBe('experiments');
  expect(contents.tasks.map((t) => t.text).sort()).toEqual([
    'Plan controls',
    'Record baseline',
    'Review result',
  ]);
  expect(contents.tasks.find((t) => t.text === 'Record baseline')?.checked).toBe(true);
  expect(contents.warnings).toEqual([]);
  expect(platform.snapshot()).toEqual(before);
});
