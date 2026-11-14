import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  File,
  FileText,
  FlaskConical,
  FolderKanban,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import { createProject } from './projects';
import {
  loadProjects,
  loadProjectContents,
  projectForPath,
  type ProjectSummary,
  type ProjectContents,
} from './projectWorkspace';
import './projects.css';

const VIEW = 'research.projects';
const countLabel = (count: number, word: string) =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;
const GROUPS = ['notes', 'experiments', 'files', 'tasks'] as const;
type Group = (typeof GROUPS)[number];
const LABELS: Record<Group, string> = {
  notes: 'Notes',
  experiments: 'Experiments',
  files: 'Files',
  tasks: 'Tasks',
};

export function ProjectsView({ ctx, initial }: { ctx: ModuleContext; initial: string | null }) {
  const [catalog, setCatalog] = useState<{ projects: ProjectSummary[]; items: VaultItem[] } | null>(
    null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [contents, setContents] = useState<{ path: string; data: ProjectContents } | null>(null);
  const [group, setGroup] = useState<Group>('notes');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [aim, setAim] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const initialApplied = useRef(false);
  const project = catalog?.projects.find((p) => p.path === selected) ?? null;

  useEffect(() => {
    let live = true;
    const load = async () => {
      const items = await ctx.app.items();
      const projects = await loadProjects(ctx, items);
      if (!live) return;
      setCatalog({ projects, items });
      if (!initialApplied.current) {
        const chosen = initial ? projectForPath(initial, projects) : null;
        if (chosen) setSelected(chosen.path);
        initialApplied.current = initial === null || chosen !== null;
      }
    };
    void load().catch((error: unknown) => {
      if (live) setNotice(error instanceof Error ? error.message : String(error));
    });
    return () => {
      live = false;
    };
  }, [ctx, revision, initial]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watch = ctx.vault.watch(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        setRevision((value) => value + 1);
      }, 150);
    });
    return () => {
      watch.dispose();
      if (timer !== null) clearTimeout(timer);
    };
  }, [ctx]);

  useEffect(() => {
    if (!project || !catalog) return;
    let live = true;
    void loadProjectContents(ctx, project, catalog.projects, catalog.items).then(
      (data) => {
        if (live) {
          setContents({ path: project.path, data });
          setNotice(null);
        }
      },
      (error: unknown) => {
        if (live) setNotice(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      live = false;
    };
  }, [ctx, project, catalog]);

  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    void action()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setNotice(message);
        ctx.app.notify(message);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const open = (path: string) => {
    run(() => ctx.app.open(path));
  };
  const addPage = (experiment: boolean) => {
    run(async () => {
      if (!project) return;
      const title = await ctx.app.askText({
        title: experiment ? 'New experiment' : 'New project note',
        label: experiment ? 'Experiment name' : 'Note name',
      });
      if (!title?.trim()) return;
      const folder = [project.folder, experiment ? 'Experiments' : 'Notes']
        .filter(Boolean)
        .join('/');
      await ctx.vault.ensureDir(folder);
      const path = await ctx.app.createPage(folder, title, experiment ? 'experiment' : undefined);
      if (path)
        await ctx.app.setPageProperties(path, {
          project: `[[${await ctx.app.linkTarget(project.path)}]]`,
        });
    });
  };
  const count = (which: Group) => {
    if (!project || contents?.path !== project.path) return null;
    return which === 'tasks'
      ? contents.data.tasks.length
      : contents.data.files.filter((f) => f.group === which).length;
  };
  const data = contents?.path === project?.path ? contents?.data : null;
  const found =
    catalog?.projects.filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        `${p.title} ${p.aim} ${p.folder}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];

  return (
    <div className="projects-view">
      {notice && (
        <p className="notice" role="alert">
          {notice}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setNotice(null);
              setRevision((n) => n + 1);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {selected !== null && !project && catalog && (
        <p className="notice">
          This project may have moved.{' '}
          <button
            type="button"
            onClick={() => {
              initialApplied.current = true;
              setSelected(null);
            }}
          >
            Back to projects
          </button>
        </p>
      )}
      {project ? (
        <>
          <div className="projects-toolbar">
            <button
              type="button"
              className="quiet"
              onClick={() => {
                initialApplied.current = true;
                setSelected(null);
                setQuery('');
              }}
            >
              <ArrowLeft size={16} aria-hidden />
              All projects
            </button>
            <div className="project-actions">
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => {
                  open(project.path);
                }}
              >
                <FileText size={15} aria-hidden />
                Project page
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  addPage(false);
                }}
              >
                <Plus size={15} aria-hidden />
                New note
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  addPage(true);
                }}
              >
                <FlaskConical size={15} aria-hidden />
                New experiment
              </button>
            </div>
          </div>
          <header className="project-workspace-heading">
            <span className="project-icon" aria-hidden>
              <FolderKanban size={27} />
            </span>
            <div>
              <span className="project-status">{project.status}</span>
              <h2>{project.title}</h2>
              <p>{project.aim || 'No aim recorded. Add one on the project page.'}</p>
              <span className="project-path">{project.folder || 'Vault root'}</span>
            </div>
          </header>
          {project.error && (
            <p className="notice" role="alert">
              {project.error} Open the project page to check it.
            </p>
          )}
          <div
            className="project-tabs"
            role="tablist"
            aria-label="Project contents"
            onKeyDown={(event) => {
              const index = GROUPS.indexOf(group);
              const next =
                event.key === 'ArrowRight'
                  ? GROUPS[(index + 1) % GROUPS.length]
                  : event.key === 'ArrowLeft'
                    ? GROUPS[(index + GROUPS.length - 1) % GROUPS.length]
                    : event.key === 'Home'
                      ? GROUPS[0]
                      : event.key === 'End'
                        ? GROUPS.at(-1)
                        : null;
              if (!next) return;
              event.preventDefault();
              setGroup(next);
              setQuery('');
              document.getElementById(`project-tab-${next}`)?.focus();
            }}
          >
            {GROUPS.map((which) => (
              <button
                key={which}
                type="button"
                role="tab"
                aria-selected={group === which}
                tabIndex={group === which ? 0 : -1}
                id={`project-tab-${which}`}
                aria-controls="project-content"
                onClick={() => {
                  setGroup(which);
                  setQuery('');
                }}
              >
                {LABELS[which]} {count(which) !== null && <span>{count(which)}</span>}
              </button>
            ))}
          </div>
          {data ? (
            <>
              {data.warnings.length > 0 && (
                <div className="notice" role="status">
                  {data.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
              <label className="project-search">
                <Search size={15} aria-hidden />
                <input
                  type="search"
                  aria-label="Search project contents"
                  placeholder={`Find ${LABELS[group].toLowerCase()}…`}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                  }}
                />
              </label>
              <section
                id="project-content"
                role="tabpanel"
                aria-labelledby={`project-tab-${group}`}
              >
                {group === 'tasks' ? (
                  <>
                    <p className="hint">
                      Checklist items from this project’s pages. Open a task’s page to edit it.
                    </p>
                    {data.tasks.filter((t) =>
                      `${t.text} ${t.pageTitle}`.toLowerCase().includes(query.toLowerCase()),
                    ).length === 0 ? (
                      <p className="empty">
                        {query
                          ? 'No tasks match this search.'
                          : 'No checklist items in this project yet.'}
                      </p>
                    ) : (
                      <ul className="project-task-list" aria-label="Project tasks">
                        {data.tasks
                          .filter((t) =>
                            `${t.text} ${t.pageTitle}`.toLowerCase().includes(query.toLowerCase()),
                          )
                          .map((task, index) => (
                            <li key={`${task.path}-${String(index)}`}>
                              <span
                                className={`project-task-state${task.checked ? ' done' : ''}`}
                                aria-label={task.checked ? 'Done' : 'Open'}
                              >
                                {task.checked ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                              </span>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => {
                                  open(task.path);
                                }}
                              >
                                <span>{task.text}</span>
                                <small>{task.pageTitle}</small>
                              </button>
                              <ArrowUpRight size={14} aria-hidden />
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    {data.files.filter(
                      (f) =>
                        f.group === group &&
                        `${f.title} ${f.path}`.toLowerCase().includes(query.toLowerCase()),
                    ).length === 0 ? (
                      <p className="empty">
                        {query
                          ? 'No items match this search.'
                          : `No ${LABELS[group].toLowerCase()} in this project yet.`}
                      </p>
                    ) : (
                      <ul
                        className="project-file-list"
                        aria-label={`Project ${LABELS[group].toLowerCase()}`}
                      >
                        {data.files
                          .filter(
                            (f) =>
                              f.group === group &&
                              `${f.title} ${f.path}`.toLowerCase().includes(query.toLowerCase()),
                          )
                          .map((file) => (
                            <li key={file.path}>
                              <span className="project-file-icon" aria-hidden>
                                {group === 'experiments' ? (
                                  <FlaskConical size={19} />
                                ) : group === 'notes' ? (
                                  <FileText size={19} />
                                ) : (
                                  <File size={19} />
                                )}
                              </span>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => {
                                  open(file.path);
                                }}
                              >
                                <span>{file.title}</span>
                                <small>{file.path}</small>
                              </button>
                              <ArrowUpRight size={14} aria-hidden />
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
              <p className="hint project-membership">
                Includes this project’s folder and items linking to its project page. Nested
                projects keep their own contents.
              </p>
            </>
          ) : (
            <p role="status">Loading project contents…</p>
          )}
        </>
      ) : (
        <>
          <div className="projects-toolbar">
            <p className="hint">
              Keep each project’s notes, experiments, files and tasks together.
            </p>
            <button
              type="button"
              onClick={() => {
                setCreating((value) => !value);
              }}
            >
              <Plus size={16} aria-hidden />
              New project
            </button>
          </div>
          {creating && (
            <form
              className="project-create"
              aria-label="New project"
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) return;
                run(async () => {
                  const path = await createProject(ctx, name.trim(), aim);
                  if (!path) throw new Error('The project could not be created.');
                  await ctx.app.openView(VIEW, path);
                });
              }}
            >
              <label className="field">
                <span className="label">Project name</span>
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              </label>
              <label className="field">
                <span className="label">Aim</span>
                <textarea
                  value={aim}
                  rows={2}
                  onChange={(event) => {
                    setAim(event.target.value);
                  }}
                />
              </label>
              <div className="actions">
                <button type="submit" disabled={busy || !name.trim()}>
                  Create project
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    setCreating(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="projects-filters">
            <label className="project-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                aria-label="Search projects"
                placeholder="Find a project…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
            </label>
            <select
              aria-label="Project status"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            >
              <option value="all">All projects</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="finished">Finished</option>
            </select>
          </div>
          {!catalog ? (
            <p role="status">Loading projects…</p>
          ) : found.length === 0 ? (
            <p className="empty">
              {catalog.projects.length === 0
                ? 'No projects yet. Create a project to add a notebook with Notes, Experiments and Data sections.'
                : 'No projects match these filters.'}
            </p>
          ) : (
            <div className="project-cards">
              {found.map((p) => {
                const pages = catalog.items.filter(
                  (item) =>
                    !catalog.projects.some((hub) => hub.path === item.path) &&
                    (projectForPath(item.path, catalog.projects)?.path === p.path ||
                      p.linkedPaths?.includes(item.path) === true),
                );
                return (
                  <article className="project-card" key={p.path}>
                    <div className="project-card-top">
                      <span className="project-icon" aria-hidden>
                        <FolderKanban size={25} />
                      </span>
                      <span className="project-status">{p.status}</span>
                    </div>
                    <h3>{p.title}</h3>
                    <p>{p.aim || 'No aim recorded.'}</p>
                    <span className="project-path">{p.folder || 'Vault root'}</span>
                    <div className="project-card-counts">
                      <span>
                        <FileText size={14} aria-hidden />
                        {countLabel(
                          pages.filter(
                            (i) =>
                              i.path.endsWith('.md') &&
                              i.type !== 'experiment' &&
                              i.type !== 'project',
                          ).length,
                          'note',
                        )}
                      </span>
                      <span>
                        <FlaskConical size={14} aria-hidden />
                        {countLabel(
                          pages.filter((i) => i.type === 'experiment').length,
                          'experiment',
                        )}
                      </span>
                    </div>
                    {p.error && <p className="notice">{p.error}</p>}
                    <button
                      type="button"
                      className="quiet"
                      aria-label={`Open project ${p.title}`}
                      onClick={() => {
                        initialApplied.current = true;
                        setSelected(p.path);
                        setQuery('');
                        setGroup('notes');
                      }}
                    >
                      Open project
                      <ArrowUpRight size={15} aria-hidden />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
