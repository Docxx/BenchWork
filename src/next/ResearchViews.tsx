import {
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Columns3,
  FileText,
  FlaskConical,
  Focus,
  Layers3,
  List,
  Maximize2,
  Minus,
  Network,
  Orbit,
  PanelsTopLeft,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StudioProps } from './NextApp';
import { Badge, CheckCircle, Empty, IconButton, MiniChart, Modal, SectionHead } from './components';
import {
  MODULES,
  STAGES,
  logActivity,
  moveTask,
  projectProgress,
  relatedEvidence,
  type Evidence,
  type Stage,
  type Task,
} from './model';
import { timerText, type StudioTimer } from './useTimer';

export function Projects({
  workspace: w,
  change,
  selected,
  select,
  notify,
  go,
}: StudioProps & { selected: string; select: (id: string) => void }) {
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const [dialog, setDialog] = useState<'task' | 'project' | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [project, setProject] = useState(selected === 'all' ? (w.projects[0]?.id ?? '') : selected);
  const [priority, setPriority] = useState<'Normal' | 'High'>('Normal');
  const [stage, setStage] = useState<Stage>('Ideas');
  const shown = w.tasks.filter((t) => selected === 'all' || t.project === selected);
  const activeProject = w.projects.find((p) => p.id === selected);
  const move = (id: string, next: Stage) => {
    change((s) =>
      logActivity(
        moveTask(s, id, next),
        next === 'Complete' ? 'One step forward' : 'Work, in motion',
        `${s.tasks.find((t) => t.id === id)?.title ?? 'Task'} → ${next}`,
      ),
    );
  };
  function openTask(t?: Task) {
    setTask(t ?? null);
    setTitle(t?.title ?? '');
    setProject(t?.project ?? (selected === 'all' ? (w.projects[0]?.id ?? '') : selected));
    setPriority(t?.priority ?? 'Normal');
    setStage(t?.stage ?? 'Ideas');
    setDialog('task');
  }
  return (
    <>
      <div className="nx-project-overview">
        <div>
          <span className="nx-eyebrow">
            {activeProject ? `PROJECT ${activeProject.code}` : 'THE WHOLE PICTURE'}
          </span>
          <h2>{activeProject?.name ?? 'Turn possibility into progress.'}</h2>
          <p>
            {activeProject?.description ??
              'A place for every next step, from the first question to the final figure.'}
          </p>
          <div className="nx-project-overview-stats">
            <span>
              <span className="nx-small-dot" />
              {shown.filter((t) => t.stage === 'In progress').length} in motion
            </span>
            <span>
              <CheckCheck size={15} />
              {shown.filter((t) => t.stage === 'Complete').length} complete
            </span>
            {activeProject && (
              <button
                onClick={() => {
                  go('notebook', w.notes.find((n) => n.project === activeProject.id)?.id);
                }}
              >
                Open project notes
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="nx-project-overview-art">
          <MiniChart colour={activeProject?.colour ?? '#357b74'} />
          <strong>
            {activeProject
              ? projectProgress(w, activeProject.id)
              : Math.round(
                  (w.tasks.filter((t) => t.stage === 'Complete').length /
                    Math.max(w.tasks.length, 1)) *
                    100,
                )}
            <span>%</span>
          </strong>
          <small>of the next steps, taken</small>
        </div>
      </div>
      <div className="nx-view-toolbar">
        <div className="nx-project-tabs">
          <button
            className={selected === 'all' ? 'selected' : ''}
            onClick={() => {
              select('all');
            }}
          >
            All projects<span>{w.projects.length}</span>
          </button>
          {w.projects.map((p) => (
            <button
              key={p.id}
              className={selected === p.id ? 'selected' : ''}
              onClick={() => {
                select(p.id);
              }}
            >
              <span className="nx-project-dot" style={{ background: p.colour }} />
              {p.name}
            </button>
          ))}
          <IconButton
            icon={Plus}
            label="New project"
            onClick={() => {
              setTitle('');
              setDescription('');
              setDialog('project');
            }}
          />
        </div>
        <div className="nx-toolbar-actions">
          <div className="nx-segment">
            <IconButton
              icon={Columns3}
              label="Board view"
              active={layout === 'board'}
              onClick={() => {
                setLayout('board');
              }}
            />
            <IconButton
              icon={List}
              label="List view"
              active={layout === 'list'}
              onClick={() => {
                setLayout('list');
              }}
            />
          </div>
          <button
            className="nx-button"
            onClick={() => {
              openTask();
            }}
          >
            <Plus size={15} />
            New step
          </button>
        </div>
      </div>
      {layout === 'board' ? (
        <div className="nx-board">
          {STAGES.map((s, index) => (
            <section
              className="nx-board-column"
              key={s}
              aria-label={s}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/benchwork-task');
                if (w.tasks.some((t) => t.id === id)) move(id, s);
              }}
            >
              <div className="nx-column-heading">
                <span>
                  <i className={`stage-${String(index)}`} />
                  {s}
                  <small>{shown.filter((t) => t.stage === s).length}</small>
                </span>
                <IconButton
                  icon={Plus}
                  label={`Add a step to ${s}`}
                  onClick={() => {
                    openTask();
                    setStage(s);
                  }}
                />
              </div>
              <div className="nx-column-cards">
                {shown
                  .filter((t) => t.stage === s)
                  .map((t) => (
                    <article
                      className="nx-task-card"
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/benchwork-task', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <div className="nx-task-card-tags">
                        <Badge
                          colour={
                            t.tag === 'Experiment'
                              ? 'teal'
                              : t.tag === 'Writing'
                                ? 'orange'
                                : 'neutral'
                          }
                        >
                          {t.tag}
                        </Badge>
                        {t.priority === 'High' && (
                          <span className="nx-priority" title="High priority">
                            ↗
                          </span>
                        )}
                      </div>
                      <button
                        className="nx-task-title"
                        onClick={() => {
                          openTask(t);
                        }}
                      >
                        {t.title}
                      </button>
                      <p>
                        <span
                          className="nx-project-dot"
                          style={{ background: w.projects.find((p) => p.id === t.project)?.colour }}
                        />
                        {w.projects.find((p) => p.id === t.project)?.name}
                      </p>
                      <div className="nx-task-card-footer">
                        <span className="nx-task-avatar">RP</span>
                        <select
                          aria-label={`Move ${t.title}`}
                          value={t.stage}
                          onChange={(e) => {
                            move(t.id, e.target.value as Stage);
                          }}
                        >
                          {STAGES.map((stage) => (
                            <option key={stage}>{stage}</option>
                          ))}
                        </select>
                      </div>
                    </article>
                  ))}
                <button
                  className="nx-add-card"
                  onClick={() => {
                    openTask();
                    setStage(s);
                  }}
                >
                  <Plus size={14} />A possible next step
                </button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="nx-task-table">
          <div className="nx-task-table-heading">
            <span>THE NEXT STEP</span>
            <span>PROJECT</span>
            <span>STATUS</span>
          </div>
          {shown.map((t) => (
            <div key={t.id}>
              <div className="nx-task-list-title">
                <CheckCircle
                  checked={t.stage === 'Complete'}
                  label={`Complete ${t.title}`}
                  onClick={() => {
                    move(t.id, t.stage === 'Complete' ? 'Ideas' : 'Complete');
                  }}
                />
                <button
                  onClick={() => {
                    openTask(t);
                  }}
                >
                  <strong>{t.title}</strong>
                </button>
              </div>
              <span>{w.projects.find((p) => p.id === t.project)?.name}</span>
              <select
                aria-label={`Move ${t.title}`}
                value={t.stage}
                onChange={(e) => {
                  move(t.id, e.target.value as Stage);
                }}
              >
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="nx-board-footnote">
        <span>
          <ShieldCheck size={14} />
          Every move is saved. Drag cards, or use the status menu.
        </span>
        <span>{shown.length} steps. One bigger story.</span>
      </div>
      {dialog && (
        <Modal
          title={
            dialog === 'project'
              ? 'Give an idea some room.'
              : task
                ? 'One step, a little clearer.'
                : 'What happens next?'
          }
          close={() => {
            setDialog(null);
          }}
        >
          <form
            className="nx-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              if (dialog === 'project') {
                const id = crypto.randomUUID();
                change((s) =>
                  logActivity(
                    {
                      ...s,
                      projects: [
                        ...s.projects,
                        {
                          id,
                          name: title.trim(),
                          description,
                          colour:
                            ['#357b74', '#7582b4', '#c0835a', '#a36a81'][s.projects.length % 4] ??
                            '#357b74',
                          code: title
                            .trim()
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((word) => word[0])
                            .join('')
                            .toUpperCase(),
                        },
                      ],
                    },
                    'Room for a new question',
                    title.trim(),
                  ),
                );
                select(id);
              } else {
                const next: Task = {
                  id: task?.id ?? crypto.randomUUID(),
                  title: title.trim(),
                  project,
                  stage,
                  priority,
                  tag: task?.tag ?? 'Next step',
                };
                change((s) =>
                  logActivity(
                    {
                      ...s,
                      tasks: task
                        ? s.tasks.map((t) => (t.id === task.id ? next : t))
                        : [...s.tasks, next],
                    },
                    task ? 'A clearer next step' : 'A new possibility',
                    title.trim(),
                  ),
                );
              }
              setDialog(null);
              notify('A little more direction. Saved.');
            }}
          >
            <label>
              {dialog === 'project' ? 'Project name' : 'The next step'}
              <input
                autoFocus
                value={title}
                required
                maxLength={180}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                placeholder={
                  dialog === 'project'
                    ? 'A question worth following'
                    : 'Something small and specific'
                }
              />
            </label>
            {dialog === 'project' ? (
              <label>
                What is it about?
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                  }}
                  placeholder="A sentence to keep the purpose in sight."
                />
              </label>
            ) : (
              <>
                <label>
                  Project
                  <select
                    value={project}
                    onChange={(e) => {
                      setProject(e.target.value);
                    }}
                  >
                    {w.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="nx-form-row">
                  <label>
                    Status
                    <select
                      value={stage}
                      onChange={(e) => {
                        setStage(e.target.value as Stage);
                      }}
                    >
                      {STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select
                      value={priority}
                      onChange={(e) => {
                        setPriority(e.target.value as 'Normal' | 'High');
                      }}
                    >
                      <option>Normal</option>
                      <option>High</option>
                    </select>
                  </label>
                </div>
              </>
            )}
            <div className="nx-form-footer">
              <span>Small moves add up.</span>
              <button type="submit" className="nx-button">
                {task ? 'Save changes' : dialog === 'project' ? 'Create project' : 'Add this step'}
                <ArrowUpRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function EvidenceLibrary({
  workspace: w,
  change,
  selected,
  select,
  createNote,
  notify,
}: StudioProps & { selected: string | null; select: (id: string | null) => void }) {
  const [filter, setFilter] = useState('All sources');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [kind, setKind] = useState<Evidence['kind']>('Paper');
  const [project, setProject] = useState(w.projects[0]?.id ?? '');
  const source = w.evidence.find((e) => e.id === selected);
  const sources = w.evidence.filter(
    (e) =>
      (filter === 'All sources' ||
        (filter === 'To read' && !e.read) ||
        (filter === 'Starred' && e.starred) ||
        e.kind === filter) &&
      `${e.title} ${e.summary} ${e.author} ${e.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function updateSource(id: string, update: Partial<Evidence>) {
    change((s) => ({
      ...s,
      evidence: s.evidence.map((e) => (e.id === id ? { ...e, ...update } : e)),
    }));
  }
  return (
    <>
      <div className="nx-evidence-top">
        <div className="nx-evidence-intro">
          <div className="nx-evidence-stack">
            <BookOpen size={34} />
            <span />
            <span />
          </div>
          <div>
            <span className="nx-eyebrow">A LIBRARY WITH A PURPOSE</span>
            <h2>Read. Question. Connect.</h2>
            <p>
              {w.evidence.length} sources collected. {w.evidence.filter((e) => !e.read).length} new
              perspectives waiting.
            </p>
          </div>
        </div>
        <button
          className="nx-button"
          onClick={() => {
            setTitle('');
            setAuthor('');
            setSummary('');
            setTags('');
            setAdding(true);
          }}
        >
          <Plus size={15} />
          Add a source
        </button>
      </div>
      <div className="nx-view-toolbar">
        <div className="nx-filter-tabs">
          {['All sources', 'To read', 'Starred', 'Paper', 'Observation', 'Dataset'].map((f) => (
            <button
              className={filter === f ? 'selected' : ''}
              key={f}
              onClick={() => {
                setFilter(f);
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="nx-filter-input">
          <Search size={15} />
          <input
            aria-label="Search evidence"
            placeholder="Find a thread…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
        </label>
      </div>
      <div className={`nx-evidence-layout ${source ? 'has-detail' : ''}`}>
        <div className="nx-evidence-grid">
          {sources.map((e) => (
            <article
              key={e.id}
              className={`nx-evidence-card ${selected === e.id ? 'selected' : ''}`}
            >
              <div className="nx-evidence-card-head">
                <span
                  className={`nx-source-icon ${e.kind === 'Paper' ? 'paper' : e.kind === 'Dataset' ? 'data' : 'observation'}`}
                >
                  {e.kind === 'Paper' ? (
                    <BookOpen size={23} />
                  ) : e.kind === 'Dataset' ? (
                    <Layers3 size={23} />
                  ) : (
                    <FlaskConical size={23} />
                  )}
                </span>
                <IconButton
                  icon={Star}
                  label={`${e.starred ? 'Unstar' : 'Star'} ${e.title}`}
                  active={e.starred}
                  onClick={() => {
                    updateSource(e.id, { starred: !e.starred });
                  }}
                />
              </div>
              <span className="nx-eyebrow">
                {e.kind} <span>· {e.year}</span>
              </span>
              <button
                className="nx-evidence-title"
                onClick={() => {
                  select(e.id);
                }}
              >
                {e.title}
              </button>
              <p>{e.summary}</p>
              <small className="nx-source-author">{e.author}</small>
              <div className="nx-source-tags">
                {e.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setQuery(tag);
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
              <div className="nx-evidence-card-footer">
                <span>
                  <span
                    className="nx-project-dot"
                    style={{ background: w.projects.find((p) => p.id === e.project)?.colour }}
                  />
                  {w.projects.find((p) => p.id === e.project)?.code}
                </span>
                <button
                  onClick={() => {
                    updateSource(e.id, { read: !e.read });
                  }}
                >
                  {e.read ? <CheckCheck size={14} /> : <BookOpen size={14} />}{' '}
                  {e.read ? 'Read & reflected' : 'To read'}
                </button>
              </div>
            </article>
          ))}
          {sources.length === 0 && (
            <Empty
              title="A little room for discovery."
              text="Try a different search, or add a source you want to think about."
              action="Add a source"
              onAction={() => {
                setAdding(true);
              }}
            />
          )}
        </div>
        {source && (
          <aside className="nx-source-detail" aria-label="Evidence details">
            <div className="nx-source-detail-head">
              <Badge colour="teal">THE THREAD</Badge>
              <IconButton
                icon={X}
                label="Close evidence details"
                onClick={() => {
                  select(null);
                }}
              />
            </div>
            <h2>{source.title}</h2>
            <p>{source.author}</p>
            <label className="nx-summary-label">
              YOUR INTERPRETATION
              <textarea
                key={source.id}
                defaultValue={source.summary}
                aria-label="Source interpretation"
                onBlur={(e) => {
                  if (e.target.value !== source.summary)
                    updateSource(source.id, { summary: e.target.value });
                }}
              />
            </label>
            <button
              className="nx-button"
              onClick={() => {
                void createNote(
                  `Reading: ${source.title}`,
                  `## Source\n\n${source.title}\n${source.author}\n\n## My interpretation\n\n${source.summary}\n\n## Questions to carry forward\n\n`,
                  source.project,
                ).catch((err: unknown) => {
                  notify(String(err));
                });
              }}
            >
              <FileText size={15} />
              Make a reading note
            </button>
            <label className="nx-evidence-tag-edit">
              Tags, separated by commas
              <input
                key={source.id}
                aria-label="Source tags"
                defaultValue={source.tags.join(', ')}
                onBlur={(event) => {
                  updateSource(source.id, {
                    tags: [
                      ...new Set(
                        event.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      ),
                    ],
                  });
                }}
              />
            </label>
            <div className="nx-source-connections">
              <span className="nx-eyebrow">CONNECTED IN YOUR WORKSPACE</span>
              {relatedEvidence(w, source.id).map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    select(e.id);
                  }}
                >
                  <Network size={16} />
                  <span>
                    {e.title}
                    <small>{e.project === source.project ? 'Same project' : 'Shared tags'}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
            <p className="nx-fine-print">
              Connections come from shared project membership and tags. They are prompts for your
              thinking, not evidence of a scientific relationship.
            </p>
          </aside>
        )}
      </div>
      {adding && (
        <Modal
          title="Bring a new perspective."
          subtitle="Keep the source and your interpretation together."
          close={() => {
            setAdding(false);
          }}
        >
          <form
            className="nx-form"
            onSubmit={(event) => {
              event.preventDefault();
              const id = crypto.randomUUID();
              const source: Evidence = {
                id,
                title: title.trim(),
                author: author.trim() || 'Own source',
                year: String(new Date().getFullYear()),
                kind,
                project,
                summary,
                tags: [
                  ...new Set(
                    tags
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  ),
                ],
                read: false,
                starred: false,
              };
              change((s) =>
                logActivity(
                  { ...s, evidence: [source, ...s.evidence] },
                  'Another perspective, collected',
                  source.title,
                ),
              );
              select(id);
              setAdding(false);
              notify('Your source is part of the story.');
            }}
          >
            <label>
              Title
              <input
                autoFocus
                value={title}
                required
                maxLength={200}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </label>
            <label>
              Author, citation or source
              <input
                value={author}
                onChange={(e) => {
                  setAuthor(e.target.value);
                }}
                placeholder="Enough to find the original again"
              />
            </label>
            <div className="nx-form-row">
              <label>
                Kind
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as Evidence['kind']);
                  }}
                >
                  <option>Paper</option>
                  <option>Observation</option>
                  <option>Dataset</option>
                </select>
              </label>
              <label>
                Project
                <select
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                  }}
                >
                  {w.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Why it matters
              <textarea
                rows={4}
                value={summary}
                onChange={(e) => {
                  setSummary(e.target.value);
                }}
              />
            </label>
            <label>
              Tags, separated by commas
              <input
                aria-label="New source tags"
                value={tags}
                onChange={(event) => {
                  setTags(event.target.value);
                }}
                placeholder="recovery, imaging, a new question"
              />
            </label>
            <div className="nx-form-footer">
              <span>Your perspective belongs here.</span>
              <button type="submit" className="nx-button" disabled={!title.trim()}>
                Add to library
                <ArrowUpRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  colour: string;
  kind: 'Project' | 'Note' | 'Source';
  parent: string;
}
export function Constellation({ workspace: w, go }: StudioProps) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>('signal');
  const [zoom, setZoom] = useState(1);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const nodes = useMemo(() => {
    const result: GraphNode[] = [];
    const centres = [
      { x: 300, y: 240 },
      { x: 730, y: 260 },
      { x: 500, y: 510 },
    ];
    w.projects.forEach((p, index) => {
      if (filter !== 'all' && filter !== p.id) return;
      const centre =
        filter === 'all' ? (centres[index % 3] ?? { x: 500, y: 300 }) : { x: 500, y: 320 };
      const offset = Math.floor(index / 3) * 35;
      result.push({
        id: p.id,
        label: p.name,
        x: centre.x + offset,
        y: centre.y,
        colour: p.colour,
        kind: 'Project',
        parent: '',
      });
      const children = [
        ...w.notes
          .filter((n) => n.project === p.id)
          .map((n) => ({ id: n.id, label: n.title, kind: 'Note' as const })),
        ...w.evidence
          .filter((e) => e.project === p.id)
          .map((e) => ({ id: e.id, label: e.title, kind: 'Source' as const })),
      ];
      children.forEach((child, i) => {
        const angle = (i / children.length) * Math.PI * 2 - Math.PI / 2;
        result.push({
          ...child,
          x: centre.x + Math.cos(angle) * (filter === 'all' ? 137 : 230),
          y: centre.y + Math.sin(angle) * (filter === 'all' ? 113 : 225),
          colour: p.colour,
          parent: p.id,
        });
      });
    });
    return result.map((n) => ({ ...n, ...positions[n.id] }));
  }, [w, filter, positions]);
  const chosen = nodes.find((n) => n.id === selected);
  const shared = w.evidence.flatMap((a, i) =>
    w.evidence
      .slice(i + 1)
      .filter((b) => a.project !== b.project && a.tags.some((t) => b.tags.includes(t)))
      .map((b) => [a.id, b.id] as const),
  );
  return (
    <div className="nx-constellation-layout">
      <section className="nx-constellation">
        <div className="nx-graph-toolbar">
          <div>
            <span className="nx-live-dot" />
            <strong>Your living constellation</strong>
            <Badge>{nodes.length} connections to explore</Badge>
          </div>
          <select
            aria-label="Filter constellation by project"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          >
            {[{ id: 'all', name: 'All projects' }, ...w.projects].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="nx-graph-space">
          <div className="nx-graph-transform" style={{ transform: `scale(${String(zoom)})` }}>
            <svg
              className="nx-graph-edges"
              viewBox="0 0 1000 700"
              preserveAspectRatio="none"
              aria-hidden
            >
              {nodes
                .filter((n) => n.parent)
                .map((n) => {
                  const parent = nodes.find((p) => p.id === n.parent);
                  return parent ? (
                    <line
                      key={n.id}
                      x1={n.x}
                      y1={n.y}
                      x2={parent.x}
                      y2={parent.y}
                      stroke={n.colour}
                      strokeOpacity={selected === n.id || selected === parent.id ? 0.75 : 0.2}
                      strokeWidth={selected === n.id || selected === parent.id ? 2 : 1}
                    />
                  ) : null;
                })}
              {shared.map(([from, to]) => {
                const a = nodes.find((n) => n.id === from),
                  b = nodes.find((n) => n.id === to);
                return a && b ? (
                  <path
                    key={`${from}-${to}`}
                    d={`M${String(a.x)} ${String(a.y)} Q500 180 ${String(b.x)} ${String(b.y)}`}
                    stroke="#be9867"
                    strokeWidth="1.4"
                    strokeDasharray="5 5"
                    fill="none"
                  />
                ) : null;
              })}
            </svg>
            {nodes.map((n) => (
              <button
                key={n.id}
                className={`nx-graph-node ${n.kind.toLowerCase()} ${n.id === selected ? 'selected' : ''}`}
                style={
                  {
                    left: `${String(n.x / 10)}%`,
                    top: `${String(n.y / 7)}%`,
                    '--node-colour': n.colour,
                  } as React.CSSProperties
                }
                aria-label={`${n.kind}: ${n.label}`}
                onClick={() => {
                  setSelected(n.id);
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId) || e.buttons === 0) return;
                  const box = e.currentTarget.parentElement?.getBoundingClientRect();
                  if (!box) return;
                  const x = Math.max(
                    60,
                    Math.min(940, ((e.clientX - box.left) / box.width) * 1000),
                  );
                  const y = Math.max(50, Math.min(650, ((e.clientY - box.top) / box.height) * 700));
                  setPositions((p) => ({ ...p, [n.id]: { x, y } }));
                }}
              >
                <span>
                  {n.kind === 'Project' ? (
                    <Orbit size={25} />
                  ) : n.kind === 'Note' ? (
                    <FileText size={15} />
                  ) : (
                    <BookOpen size={15} />
                  )}
                </span>
                <strong>{n.label}</strong>
                {n.kind === 'Project' && <small>PROJECT</small>}
              </button>
            ))}
          </div>
          <div className="nx-graph-watermark">
            Follow your curiosity.<span>There’s usually a thread.</span>
          </div>
          <div className="nx-graph-controls">
            <IconButton
              icon={Minus}
              label="Zoom out"
              onClick={() => {
                setZoom((z) => Math.max(0.6, z - 0.1));
              }}
            />
            <span>{Math.round(zoom * 100)}%</span>
            <IconButton
              icon={Plus}
              label="Zoom in"
              onClick={() => {
                setZoom((z) => Math.min(1.5, z + 0.1));
              }}
            />
            <IconButton
              icon={Maximize2}
              label="Reset constellation view"
              onClick={() => {
                setZoom(1);
                setPositions({});
              }}
            />
          </div>
        </div>
        <div className="nx-graph-legend">
          <span>
            <i className="solid" />
            Same project
          </span>
          <span>
            <i className="dashed" />
            Shared tags
          </span>
          <span>Drag a node. Follow a thought.</span>
        </div>
      </section>
      <aside className="nx-graph-inspector">
        <span className="nx-eyebrow">A CLOSER LOOK</span>
        {chosen ? (
          <>
            <span className="nx-inspector-symbol" style={{ color: chosen.colour }}>
              <Orbit size={35} />
            </span>
            <Badge>{chosen.kind}</Badge>
            <h2>{chosen.label}</h2>
            <p>
              {chosen.kind === 'Project'
                ? w.projects.find((p) => p.id === chosen.id)?.description
                : chosen.kind === 'Source'
                  ? w.evidence.find((e) => e.id === chosen.id)?.summary
                  : 'A thought in your notebook. Follow it back to the page and keep exploring.'}
            </p>
            <button
              className="nx-button"
              onClick={() => {
                go(
                  chosen.kind === 'Project'
                    ? 'projects'
                    : chosen.kind === 'Note'
                      ? 'notebook'
                      : 'evidence',
                  chosen.id,
                );
              }}
            >
              Follow this thread
              <ArrowUpRight size={16} />
            </button>
            <div className="nx-inspector-links">
              <span className="nx-eyebrow">NEARBY IN YOUR WORKSPACE</span>
              {nodes
                .filter(
                  (n) =>
                    n.id !== chosen.id &&
                    (n.parent === chosen.id ||
                      n.id === chosen.parent ||
                      (n.parent && n.parent === chosen.parent)),
                )
                .slice(0, 5)
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setSelected(n.id);
                    }}
                  >
                    <span className="nx-project-dot" style={{ background: n.colour }} />
                    {n.label}
                    <ChevronRight size={14} />
                  </button>
                ))}
            </div>
          </>
        ) : (
          <Empty
            title="Take a closer look."
            text="Choose any point in your constellation to see where it leads."
          />
        )}
        <p className="nx-fine-print">
          A map of your organisation and tags. Connections suggest where to look, not what to
          conclude.
        </p>
      </aside>
    </div>
  );
}

export function ProtocolLab({
  workspace: w,
  change,
  createNote,
  notify,
  timer,
}: StudioProps & { timer: StudioTimer }) {
  const steps = w.protocol.steps;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(w.protocol);
  const [selected, setSelected] = useState(
    steps.find((p) => !w.checkedSteps.includes(p.id))?.id ?? steps[0]?.id ?? '',
  );
  const [notes, setNotes] = useState(() => {
    try {
      return sessionStorage.getItem('benchwork-next-run-notes') ?? '';
    } catch {
      return '';
    }
  });
  const [saving, setSaving] = useState(false);
  const step = steps.find((p) => p.id === selected) ?? steps[0];
  const completed = steps.filter((p) => w.checkedSteps.includes(p.id)).length;
  if (!step) return null;
  function completeStep() {
    const index = steps.findIndex((p) => p.id === selected);
    change((s) =>
      logActivity(
        {
          ...s,
          checkedSteps: s.checkedSteps.includes(selected)
            ? s.checkedSteps
            : [...s.checkedSteps, selected],
        },
        'A step, recorded',
        step?.title ?? 'Protocol step',
      ),
    );
    const next = steps[index + 1];
    if (next) setSelected(next.id);
    timer.pause();
  }
  return (
    <>
      <div className="nx-protocol-banner">
        <span className="nx-protocol-emblem">
          <FlaskConical size={28} />
        </span>
        <div>
          <span className="nx-eyebrow">YOUR WORKFLOW / BENCH MODE</span>
          <h2>{w.protocol.title}</h2>
          <p>A guided workspace for the bench. Make room for your validated method.</p>
        </div>
        <button
          className="nx-text-button"
          onClick={() => {
            setDraft(structuredClone(w.protocol));
            setEditing(true);
          }}
        >
          <Sparkles size={15} />
          Edit workflow
        </button>
        <Badge colour="teal">
          {completed} / {steps.length} steps recorded
        </Badge>
      </div>
      <div className="nx-protocol-layout">
        <aside className="nx-protocol-steps">
          <SectionHead title="The run, step by step" />
          {steps.map((p, i) => (
            <button
              className={`nx-protocol-step ${selected === p.id ? 'selected' : ''} ${w.checkedSteps.includes(p.id) ? 'complete' : ''}`}
              key={p.id}
              onClick={() => {
                setSelected(p.id);
              }}
            >
              <span className="nx-step-number">
                {w.checkedSteps.includes(p.id) ? (
                  <Check size={16} />
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </span>
              <span>
                <strong>{p.title}</strong>
                <small>
                  {p.seconds ? `${String(p.seconds / 60)} minute reminder` : 'At your own pace'}
                </small>
              </span>
              {selected === p.id && <ChevronRight size={16} />}
            </button>
          ))}
          <div className="nx-protocol-progress">
            <div className="nx-progress-track">
              <span style={{ width: `${String((completed / steps.length) * 100)}%` }} />
            </div>
            <p>Careful work. One step at a time.</p>
          </div>
        </aside>
        <section className="nx-protocol-current">
          <span className="nx-eyebrow">
            STEP {String(steps.findIndex((p) => p.id === selected) + 1).padStart(2, '0')} / STAY
            WITH THE MOMENT
          </span>
          <h2>{step.title}</h2>
          <p>{step.detail}</p>
          <div className="nx-protocol-timer">
            <div>
              <Timer size={20} />
              <span>A LITTLE TIME, SET ASIDE</span>
            </div>
            <strong aria-live="off">{timerText(timer.seconds)}</strong>
            <div className="nx-timer-presets">
              {[60, 180, 300, 600].map((s) => (
                <button
                  key={s}
                  className={timer.duration === s ? 'selected' : ''}
                  onClick={() => {
                    timer.reset(s);
                  }}
                >
                  {s / 60} min
                </button>
              ))}
            </div>
            <div className="nx-timer-actions">
              <button className="nx-button" onClick={timer.running ? timer.pause : timer.start}>
                {timer.running ? <Pause size={16} /> : <Play size={16} />}{' '}
                {timer.running ? 'Pause timer' : 'Start timer'}
              </button>
              <IconButton
                icon={RotateCcw}
                label="Reset protocol timer"
                onClick={() => {
                  timer.reset(step.seconds || 180);
                }}
              />
            </div>
          </div>
          <label className="nx-run-notes">
            Keep the observation close
            <textarea
              aria-label="Protocol run notes"
              placeholder="What did you notice? What would you change next time?"
              rows={4}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                try {
                  sessionStorage.setItem('benchwork-next-run-notes', e.target.value);
                } catch {
                  /* Still retained in the open run. */
                }
              }}
            />
          </label>
          <div className="nx-protocol-actions">
            <button className="nx-button" onClick={completeStep}>
              <Check size={16} />
              {w.checkedSteps.includes(selected)
                ? 'Recorded · next step'
                : 'Record step & continue'}
            </button>
            {w.checkedSteps.includes(selected) && (
              <button
                className="nx-text-button"
                onClick={() => {
                  change((s) => ({
                    ...s,
                    checkedSteps: s.checkedSteps.filter((id) => id !== selected),
                  }));
                }}
              >
                Mark unfinished
              </button>
            )}
          </div>
        </section>
        <aside className="nx-run-summary">
          <span className="nx-eyebrow">LEAVE A USEFUL TRACE</span>
          <h3>
            The run becomes
            <br />
            part of the story.
          </h3>
          <p>
            Your checklist and observations can become a notebook page, with the time and completed
            steps kept together.
          </p>
          <div className="nx-run-summary-illustration">
            <FileText size={60} strokeWidth={1} />
            <span>
              <Check size={15} />
            </span>
          </div>
          <button
            className="nx-button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              const body = `## ${w.protocol.title}\n\nRun recorded: ${new Date().toLocaleString('en-GB')}\n\n${steps.map((p) => `- [${w.checkedSteps.includes(p.id) ? 'x' : ' '}] ${p.title}\n  ${p.detail}`).join('\n')}\n\n## Observations\n\n${notes || 'No observations recorded.'}\n\n*Run log. Follow your validated laboratory protocol.*`;
              void createNote(
                `Run: ${w.protocol.title} · ${new Date().toLocaleDateString('en-GB')}`,
                body,
                'signal',
              ).catch((err: unknown) => {
                setSaving(false);
                notify(String(err));
              });
            }}
          >
            <FileText size={15} />
            {saving ? 'Creating report…' : 'Save a run report'}
          </button>
          <p className="nx-fine-print">
            Timers are reminders only. They do not control or monitor laboratory equipment.
          </p>
        </aside>
      </div>
      {editing && (
        <Modal
          title="Your method. Your rhythm."
          subtitle="Keep your validated steps together. Timers are optional reminders."
          close={() => {
            setEditing(false);
          }}
          wide
        >
          <form
            className="nx-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.title.trim() || draft.steps.some((p) => !p.title.trim())) return;
              change((state) =>
                logActivity(
                  { ...state, protocol: draft, checkedSteps: [] },
                  'A workflow, made your own',
                  draft.title,
                ),
              );
              setSelected(draft.steps[0]?.id ?? '');
              timer.reset(draft.steps[0]?.seconds || 180);
              setEditing(false);
              notify('Your workflow is saved.');
            }}
          >
            <label>
              Workflow name
              <input
                value={draft.title}
                required
                onChange={(event) => {
                  setDraft((value) => ({ ...value, title: event.target.value }));
                }}
              />
            </label>
            <div className="nx-workflow-edit-steps">
              {draft.steps.map((p, index) => (
                <div key={p.id} className="nx-workflow-edit-step">
                  <span className="nx-eyebrow">STEP {String(index + 1).padStart(2, '0')}</span>
                  <label>
                    Step title
                    <input
                      aria-label={`Step ${String(index + 1)} title`}
                      value={p.title}
                      required
                      onChange={(event) => {
                        setDraft((value) => ({
                          ...value,
                          steps: value.steps.map((step) =>
                            step.id === p.id ? { ...step, title: event.target.value } : step,
                          ),
                        }));
                      }}
                    />
                  </label>
                  <label>
                    Instructions
                    <textarea
                      aria-label={`Step ${String(index + 1)} instructions`}
                      rows={2}
                      value={p.detail}
                      onChange={(event) => {
                        setDraft((value) => ({
                          ...value,
                          steps: value.steps.map((step) =>
                            step.id === p.id ? { ...step, detail: event.target.value } : step,
                          ),
                        }));
                      }}
                    />
                  </label>
                  <label>
                    Reminder, minutes
                    <input
                      aria-label={`Step ${String(index + 1)} minutes`}
                      type="number"
                      min="0"
                      max="1440"
                      value={p.seconds / 60}
                      onChange={(event) => {
                        setDraft((value) => ({
                          ...value,
                          steps: value.steps.map((step) =>
                            step.id === p.id
                              ? { ...step, seconds: Number(event.target.value) * 60 }
                              : step,
                          ),
                        }));
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="nx-text-button"
              disabled={draft.steps.length >= 50}
              onClick={() => {
                setDraft((value) => ({
                  ...value,
                  steps: [
                    ...value.steps,
                    { id: crypto.randomUUID(), title: '', detail: '', seconds: 0 },
                  ],
                }));
              }}
            >
              <Plus size={15} />
              Add a workflow step
            </button>
            <div className="nx-form-footer">
              <span>A fresh checklist. Your run notes stay open.</span>
              <button className="nx-button" type="submit">
                Save workflow
                <Check size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function FocusRoom({ workspace: w, timer, go }: StudioProps & { timer: StudioTimer }) {
  const [intention, setIntention] = useState(() => {
    try {
      return (
        sessionStorage.getItem('benchwork-next-intention') ??
        'Compare the early recovery time points'
      );
    } catch {
      return '';
    }
  });
  const [motion, setMotion] = useState(true);
  const progress = (1 - timer.seconds / timer.duration) * 100;
  return (
    <div className={`nx-focus-room ${motion ? '' : 'still'}`}>
      <div className="nx-focus-grain" />
      <div className="nx-focus-room-top">
        <span className="nx-focus-label">
          <Focus size={17} />A ROOM OF YOUR OWN
        </span>
        <button
          onClick={() => {
            setMotion((m) => !m);
          }}
          className="nx-text-button"
        >
          <Sparkles size={15} />
          {motion ? 'Still the room' : 'Let it breathe'}
        </button>
      </div>
      <div className="nx-focus-centre">
        <span className="nx-eyebrow">
          {timer.running
            ? 'YOU’RE RIGHT WHERE YOU NEED TO BE'
            : 'NOT EVERYTHING NEEDS YOUR ATTENTION'}
        </span>
        <label className="nx-intention">
          <span>For now, just this.</span>
          <input
            aria-label="Focus intention"
            value={intention}
            maxLength={120}
            onChange={(e) => {
              setIntention(e.target.value);
              try {
                sessionStorage.setItem('benchwork-next-intention', e.target.value);
              } catch {
                /* Optional timer preference. */
              }
            }}
            placeholder="One thing that matters…"
          />
        </label>
        <div
          className="nx-focus-dial"
          style={{ '--focus-progress': `${String(progress)}%` } as React.CSSProperties}
        >
          <div className="nx-focus-halo" />
          <div className="nx-focus-halo halo-two" />
          <div className="nx-focus-dial-track" />
          <div className="nx-focus-time">
            <strong>{timerText(timer.seconds)}</strong>
            <span>
              {timer.running
                ? 'A LITTLE UNINTERRUPTED TIME'
                : timer.seconds === 0
                  ? 'A LITTLE TIME, WELL SPENT'
                  : 'MAKE ROOM FOR DEEP WORK'}
            </span>
          </div>
        </div>
        <div className="nx-focus-presets">
          {[15, 25, 45, 60].map((min) => (
            <button
              className={timer.duration === min * 60 ? 'selected' : ''}
              key={min}
              onClick={() => {
                timer.reset(min * 60);
              }}
            >
              {min} min
            </button>
          ))}
        </div>
        <div className="nx-focus-start">
          <button className="nx-button" onClick={timer.running ? timer.pause : timer.start}>
            {timer.running ? <Pause size={17} /> : <Play size={17} />}{' '}
            {timer.running
              ? 'Take a pause'
              : timer.seconds === 0
                ? 'Begin again'
                : 'Begin this moment'}
          </button>
          <IconButton
            icon={RotateCcw}
            label="Reset focus timer"
            onClick={() => {
              timer.reset(timer.duration);
            }}
          />
        </div>
        <p className="nx-focus-quote">
          Give one good idea your undivided attention.<span>THE REST CAN WAIT A MOMENT</span>
        </p>
      </div>
      <div className="nx-focus-room-bottom">
        <span>
          <span className="nx-live-dot" />
          No sounds. No interruptions. Just a little space.
        </span>
        <div>
          <strong>{w.focusSessions}</strong> sessions <span>·</span>
          <strong>{w.focusMinutes}</strong> focused minutes
        </div>
        <button
          className="nx-text-button"
          onClick={() => {
            go('notebook');
          }}
        >
          Back to your thoughts
          <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function ModuleGallery({
  workspace: w,
  change,
  go,
  openEngine,
}: StudioProps & { openEngine: (id: string) => void }) {
  const icons: Record<string, LucideIcon> = { BookOpen, Orbit, FlaskConical, PanelsTopLeft, Focus };
  return (
    <>
      <div className="nx-modules-hero">
        <div>
          <span className="nx-eyebrow">A STUDIO, SHAPED AROUND YOU</span>
          <h2>
            More possibility.
            <br />
            <em>Only when you need it.</em>
          </h2>
          <p>
            Choose the tools that make room for your best work.
            <br />
            Switching one off keeps everything you’ve made.
          </p>
        </div>
        <div className="nx-modules-art">
          <span>
            <Orbit size={36} />
          </span>
          <span>
            <FlaskConical size={29} />
          </span>
          <span>
            <BookOpen size={25} />
          </span>
          <span>
            <Focus size={30} />
          </span>
          <span>
            <PanelsTopLeft size={25} />
          </span>
        </div>
      </div>
      <SectionHead eyebrow="THE NEXT COLLECTION" title="A few thoughtful additions" />
      <div className="nx-module-grid">
        {MODULES.map((m) => {
          const enabled = w.modules.includes(m.id);
          const Icon = icons[m.icon] ?? Layers3;
          return (
            <article key={m.id} className={`nx-module-card ${m.colour}`}>
              <div className="nx-module-card-head">
                <span className={`nx-module-icon ${m.colour}`}>
                  <Icon size={27} />
                </span>
                <button
                  className={`nx-toggle ${enabled ? 'on' : ''}`}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${m.name} module`}
                  onClick={() => {
                    change((s) => ({
                      ...s,
                      modules: enabled
                        ? s.modules.filter((id) => id !== m.id)
                        : [...s.modules, m.id],
                    }));
                  }}
                >
                  <span />
                </button>
              </div>
              <span className="nx-eyebrow">{m.kicker}</span>
              <h3>{m.name}</h3>
              <p>{m.description}</p>
              <div className="nx-module-card-footer">
                <Badge colour={enabled ? 'teal' : 'neutral'}>
                  {enabled ? 'In your workspace' : 'Ready when you are'}
                </Badge>
                <button
                  className="nx-text-button"
                  disabled={!enabled}
                  onClick={() => {
                    go(m.id);
                  }}
                >
                  Open
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <SectionHead eyebrow="THE BENCHWORK FOUNDATION" title="Familiar tools. More room to play." />
      <div className="nx-engine-tools">
        {[
          {
            title: 'Reading and writing',
            text: 'Collect papers, annotate figures and passages, and write with evidence organised by subject.',
            icon: BookOpen,
            id: 'references.reading',
          },
          {
            title: 'An endless whiteboard',
            text: 'Sketch, write and arrange thoughts with BenchWork’s native canvas.',
            icon: PanelsTopLeft,
            id: 'whiteboard.list',
          },
          {
            title: 'Canvases for connected thinking',
            text: 'The existing mind-map and canvas tools, inside your new studio.',
            icon: Network,
            id: 'mind-maps.canvases',
          },
          {
            title: 'Tools for the bench',
            text: 'BenchWork’s calculators and timers, ready for the practical details.',
            icon: FlaskConical,
            id: 'lab-tools.view',
          },
        ].map(({ title, text, icon: Icon, id }) => (
          <button
            key={id}
            onClick={() => {
              openEngine(id);
            }}
          >
            <span>
              <Icon size={25} />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
            <ArrowUpRight size={19} />
          </button>
        ))}
      </div>
      <div className="nx-local-promise">
        <ShieldCheck size={24} />
        <div>
          <strong>More capable. Still yours.</strong>
          <p>
            Your notes, sources and figures stay together. Export your workspace whenever you want a
            copy.
          </p>
        </div>
        <Badge>LOCAL BY DESIGN</Badge>
      </div>
    </>
  );
}
