import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  FlaskConical,
  Focus,
  Layers3,
  LayoutDashboard,
  Menu,
  Moon,
  Orbit,
  PanelsTopLeft,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@core/ui/AppStoreContext';
import { PageEditor } from '@core/ui/PageEditor';
import { Ribbon } from '@core/ui/Ribbon';
import { FileView } from '@core/ui/FileView';
import { ModuleView } from '@core/ui/ModuleView';
import { TextPromptDialog } from '@core/ui/ModuleDialogs';
import { AttachDialog } from '@core/ui/AttachDialog';
import { MemoryAdapter } from '@core/platform/memory';
import { loadVaultConfig } from '@core/vault/vaultService';
import {
  parseWorkspace,
  projectProgress,
  logActivity,
  MODULES,
  type NextView,
  type Workspace,
  type Note,
} from './model';
import {
  archiveOf,
  validateArchive,
  restoreArchive,
  writeArchive,
  STUDIO_ROOT,
  WORKSPACE_FILE,
  type StudioArchive,
} from './storage';
import type { NextRuntime } from './runtime';
import {
  Badge,
  CheckCircle,
  Empty,
  IconButton,
  MiniChart,
  Modal,
  OrbitalArt,
  SectionHead,
  Shortcut,
} from './components';
import {
  Projects,
  EvidenceLibrary,
  Constellation,
  ProtocolLab,
  FocusRoom,
  ModuleGallery,
} from './ResearchViews';
import { timerText, useTimer } from './useTimer';
import { exportToFolder } from './nativeExport';

export interface StudioProps {
  workspace: Workspace;
  change: (update: (workspace: Workspace) => Workspace) => void;
  go: (view: NextView, id?: string) => void;
  notify: (message: string) => void;
  createNote: (title: string, body?: string, project?: string) => Promise<void>;
}
const NAV: { id: NextView; label: string; icon: LucideIcon; module?: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: Layers3 },
  { id: 'notebook', label: 'Notebook', icon: BookOpen },
  { id: 'evidence', label: 'Evidence', icon: FlaskConical, module: 'evidence' },
  { id: 'constellation', label: 'Constellation', icon: Orbit, module: 'constellation' },
  { id: 'protocol', label: 'Protocol lab', icon: FlaskConical, module: 'protocol' },
  { id: 'figures', label: 'Figure studio', icon: PanelsTopLeft, module: 'figures' },
  { id: 'focus', label: 'Focus room', icon: Focus, module: 'focus' },
];
const TITLES: Record<NextView, [string, string]> = {
  engine: ['Familiar tools. New possibilities.', 'A little more room for connected thinking.'],
  overview: ['A little more possibility.', 'Your research, brought together.'],
  projects: [
    'From a spark to something real.',
    'Small steps. Connected thinking. Meaningful progress.',
  ],
  notebook: [
    'Make space for the thought.',
    'Your ideas, observations and the questions in between.',
  ],
  evidence: ['Keep the why close.', 'A home for the sources that shape your thinking.'],
  constellation: ['Nothing interesting exists alone.', 'Follow the threads between your work.'],
  protocol: ['One step. Then the next.', 'A calmer way to stay with the experiment.'],
  figures: ['Let the work speak.', 'Bring a clear story out of complex data.'],
  focus: ['Less noise. More possibility.', 'One intention. A little uninterrupted time.'],
  modules: ['Build your kind of BenchWork.', 'A considered set of tools. Ready when you are.'],
};

export function NextApp({ runtime }: { runtime: NextRuntime }) {
  const [workspace, setWorkspace] = useState(runtime.workspace);
  const current = useRef(workspace);
  const [view, setView] = useState<NextView>('overview');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState(workspace.notes[0]?.id ?? '');
  const [dialog, setDialog] = useState<'capture' | 'search' | 'about' | 'workspace' | null>(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [saveStatus, setSaveStatus] = useState(runtime.platform.status);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    archive: StudioArchive;
    workspace: Workspace;
  } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const pageSave = useApp((s) => s.saveState);
  const searchHits = useApp((s) => s.searchResults);
  useEffect(() => {
    if (dialog === 'search') runtime.store.getState().setSearchQuery(query);
    else runtime.store.getState().clearSearch();
  }, [dialog, query, runtime]);
  const pageNotice = useApp((s) => s.pageNotice);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);
  useEffect(
    () =>
      runtime.platform.subscribe(() => {
        setSaveStatus(runtime.platform.status);
        setSaveError(runtime.platform.error);
      }),
    [runtime],
  );
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => {
      if (runtime.platform.status !== 'saved' || runtime.store.getState().saveState !== 'saved')
        event.preventDefault();
    };
    window.addEventListener('beforeunload', close);
    return () => {
      window.removeEventListener('beforeunload', close);
    };
  }, [runtime]);

  const change = useCallback(
    (update: (w: Workspace) => Workspace) => {
      const next = update(current.current);
      current.current = next;
      setWorkspace(next);
      void runtime.platform
        .writeTextAtomic(WORKSPACE_FILE, JSON.stringify(next))
        .catch((err: unknown) => {
          setSaveError(err instanceof Error ? err.message : String(err));
        });
    },
    [runtime],
  );

  const navigate = useCallback(
    async (next: NextView, id?: string) => {
      if (MODULES.some((m) => m.id === next) && !current.current.modules.includes(next)) {
        setView('modules');
        notify('Switch this module on to open it.');
        return;
      }
      if (!(await runtime.store.getState().closePage())) {
        notify('Save your open work before leaving.');
        return;
      }
      runtime.store.setState({ openFile: null, moduleView: null });
      if (next === 'notebook') {
        const note =
          current.current.notes.find((n) => n.id === id) ??
          current.current.notes.find((n) => n.id === selectedNote) ??
          current.current.notes[0];
        if (note) {
          await runtime.store.getState().openPath(note.path);
          setSelectedNote(note.id);
        }
      }
      if (next === 'figures') {
        if (await runtime.platform.exists('Manuscript/Recovery trajectory.figure.json'))
          await runtime.store.getState().openPath('Manuscript/Recovery trajectory.figure.json');
        else await runtime.store.getState().openModuleView('figures.list');
      }
      if (next === 'projects' && id) setSelectedProject(id);
      if (next === 'evidence') setSelectedEvidence(id ?? null);
      setView(next);
      setMobileNav(false);
      setDialog(null);
      document.querySelector('.nx-content')?.scrollTo({ top: 0 });
    },
    [notify, runtime, selectedNote],
  );
  const go = useCallback(
    (next: NextView, id?: string) => {
      void navigate(next, id).catch((err: unknown) => {
        notify(err instanceof Error ? err.message : String(err));
      });
    },
    [navigate, notify],
  );

  const createNote = useCallback(
    async (title: string, body = '', project = 'signal') => {
      const id = crypto.randomUUID();
      const path = `Captured/${id}.md`;
      await runtime.platform.ensureDir('Captured');
      await runtime.platform.createNew(
        path,
        `---\nid: ${id}\ncreated: ${new Date().toISOString()}\n---\n# ${title.replace(/[\r\n]/g, ' ')}\n\n${body}\n`,
      );
      const parent = current.current.projects.some((p) => p.id === project)
        ? project
        : (current.current.projects[0]?.id ?? '');
      const note: Note = { id, title, path, project: parent, kind: 'Captured note' };
      change((w) => logActivity({ ...w, notes: [note, ...w.notes] }, 'A thought, captured', title));
      await navigate('notebook', id);
      notify('Your thought has a home.');
    },
    [change, navigate, notify, runtime],
  );

  const focus = useTimer('benchwork-next-focus', 25 * 60, (seconds) => {
    change((w) =>
      logActivity(
        {
          ...w,
          focusSessions: w.focusSessions + 1,
          focusMinutes: w.focusMinutes + Math.round(seconds / 60),
        },
        'A little time, well spent',
        `${String(Math.round(seconds / 60))} focused minutes.`,
      ),
    );
    notify('Session complete. Take a breath.');
  });
  const protocolTimer = useTimer('benchwork-next-protocol', 180, () => {
    notify('Your protocol timer is complete. Check the current step before continuing.');
  });

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setDialog((d) => (d === 'search' ? null : 'search'));
        setQuery('');
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setDialog('capture');
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
    };
  }, []);

  async function exportWorkspace() {
    await runtime.store.getState().savePageNow();
    if (
      runtime.store.getState().saveState !== 'saved' ||
      !(await runtime.store.getState().saveEditors())
    ) {
      notify('Save the open editor before exporting.');
      return;
    }
    await runtime.platform.checkpoint();
    const archive = archiveOf(runtime.platform);
    const exported = await exportToFolder(archive);
    if (exported === null) return;
    if (exported !== false) {
      notify(`Workspace exported to ${exported}`);
      return;
    }
    const data = JSON.stringify(archive, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `BenchWork-Next-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);
    notify('Workspace exported, including notes, figures and attachments.');
  }
  async function importWorkspace(file: File) {
    if (file.size > 256 * 1024 * 1024) throw new Error('Choose an export smaller than 256 MB.');
    const archive = validateArchive(JSON.parse(await file.text()) as unknown);
    const check = new MemoryAdapter({ folders: { [STUDIO_ROOT]: {} } });
    await check.setVaultRoot(STUDIO_ROOT);
    await restoreArchive(check, archive);
    const imported = parseWorkspace(await check.readText(WORKSPACE_FILE));
    await loadVaultConfig(check);
    for (const note of imported.notes) {
      if (!(await check.exists(note.path)))
        throw new Error(`The export is missing the note: ${note.title}`);
    }
    setPendingImport({ archive, workspace: imported });
  }
  async function confirmImport() {
    if (!pendingImport) return;
    if (!(await runtime.store.getState().closePage()))
      throw new Error('Save the open editor before importing.');
    await runtime.platform.settled();
    await writeArchive(pendingImport.archive);
    location.reload();
  }

  const props: StudioProps = { workspace, change, go, notify, createNote };
  const visibleNav = NAV.filter((n) => !n.module || workspace.modules.includes(n.module));
  return (
    <div className={`nx-app ${workspace.theme === 'dark' ? 'nx-dark' : ''}`}>
      {mobileNav && (
        <button
          className="nx-nav-scrim"
          aria-label="Close navigation"
          onClick={() => {
            setMobileNav(false);
          }}
        />
      )}
      <aside className={`nx-sidebar ${mobileNav ? 'open' : ''}`} aria-label="Studio navigation">
        <a
          className="nx-brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            go('overview');
          }}
        >
          <span className="nx-mark">
            <Layers3 size={23} />
          </span>
          <span>
            benchwork
            <span className="nx-next-word">
              NEXT <span>✳</span>
            </span>
          </span>
        </a>
        <button
          className="nx-workspace-switch"
          onClick={() => {
            setDialog('workspace');
          }}
        >
          <span className="nx-workspace-avatar">
            R<span />
          </span>
          <span>
            <strong>Ray’s research studio</strong>
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className="nx-sidebar-search"
          onClick={() => {
            setDialog('search');
            setQuery('');
          }}
        >
          <Search size={16} />
          <span>Find anything</span>
          <Shortcut />
        </button>
        <div className="nx-nav-label">YOUR WORKSPACE</div>
        <nav aria-label="Main">
          {visibleNav
            .filter((n) =>
              ['overview', 'projects', 'notebook', 'evidence', 'constellation'].includes(n.id),
            )
            .map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={`nx-nav-item ${view === id ? 'selected' : ''}`}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => {
                  go(id);
                }}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{label}</span>
                {id === 'notebook' && <small>{workspace.notes.length}</small>}
                {id === 'constellation' && <span className="nx-new-dot" />}
              </button>
            ))}
        </nav>
        <div className="nx-nav-label nx-tools-label">
          MAKE ROOM FOR MORE <span>✧</span>
        </div>
        <nav aria-label="Tools">
          {visibleNav
            .filter((n) => ['protocol', 'figures', 'focus'].includes(n.id))
            .map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={`nx-nav-item ${view === id ? 'selected' : ''}`}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => {
                  go(id);
                }}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{label}</span>
                {id === 'focus' && focus.running && <span className="nx-live-dot" />}
              </button>
            ))}
        </nav>
        <div className="nx-sidebar-projects">
          <div className="nx-nav-label">
            PROJECTS{' '}
            <button
              aria-label="Add project"
              onClick={() => {
                go('projects');
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          {workspace.projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                go('projects', p.id);
              }}
            >
              <span className="nx-project-dot" style={{ background: p.colour }} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="nx-sidebar-bottom">
          <button
            className="nx-module-link"
            onClick={() => {
              go('modules');
            }}
          >
            <Sparkles size={18} />
            <span>
              Make it yours<small>Explore your modules</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <div className="nx-sidebar-footer">
            <button
              onClick={() => {
                setDialog('about');
              }}
            >
              <span className="nx-profile">RP</span>
              <span>
                Ray Price<small>A little more curious.</small>
              </span>
            </button>
            <IconButton
              icon={CircleHelp}
              label="About BenchWork Next"
              onClick={() => {
                setDialog('about');
              }}
            />
          </div>
        </div>
      </aside>
      <div className="nx-main">
        <header className="nx-topbar">
          <div className="nx-breadcrumb">
            <button
              className="nx-mobile-menu nx-icon"
              aria-label="Open navigation"
              onClick={() => {
                setMobileNav(true);
              }}
            >
              <Menu size={20} />
            </button>
            <span className="nx-breadcrumb-symbol">✳</span>
            <span>Personal workspace</span>
            <span className="nx-slash">/</span>
            <strong>
              {view === 'modules' ? 'Modules' : NAV.find((n) => n.id === view)?.label}
            </strong>
          </div>
          <div className="nx-topbar-actions">
            <span
              className={`nx-save-state ${saveStatus === 'error' || pageSave === 'error' ? 'error' : ''}`}
            >
              <span />
              {saveStatus === 'error' || pageSave === 'error'
                ? 'Needs attention'
                : saveStatus === 'saving' || pageSave !== 'saved'
                  ? 'Saving your work'
                  : 'Saved on this device'}
            </span>
            <IconButton
              icon={workspace.theme === 'light' ? Moon : Sun}
              label={workspace.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              onClick={() => {
                change((w) => ({ ...w, theme: w.theme === 'light' ? 'dark' : 'light' }));
              }}
            />
            <button
              className="nx-button nx-capture-top"
              onClick={() => {
                setDialog('capture');
              }}
            >
              <Plus size={16} />
              Quick capture
            </button>
          </div>
        </header>
        <main
          className={`nx-content ${view === 'focus' ? 'nx-focus-content' : ''}`}
          id="studio-main"
        >
          <div className="nx-page-heading">
            <div>
              <div className="nx-eyebrow">
                {view === 'overview'
                  ? new Intl.DateTimeFormat('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }).format(new Date())
                  : `THE ${view === 'modules' ? 'TOOLBOX' : 'STUDIO'} / ${NAV.find((n) => n.id === view)?.label.toUpperCase() ?? 'MODULES'}`}
              </div>
              <h1>{TITLES[view][0]}</h1>
              <p>{TITLES[view][1]}</p>
            </div>
            <div className="nx-heading-side">
              {view === 'overview' ? (
                <Badge colour="teal">
                  <span className="nx-small-dot" />A good day to be curious
                </Badge>
              ) : (
                <Badge>EXPERIMENTAL EDITION</Badge>
              )}
            </div>
          </div>
          {(saveError || pageNotice) && (
            <div className="nx-save-error" role="alert">
              <ShieldCheck size={18} />
              <span>{saveError ?? pageNotice} Your changes are still open.</span>
              <button
                onClick={() => {
                  void runtime.store
                    .getState()
                    .savePageNow()
                    .then(() => runtime.platform.checkpoint())
                    .then(
                      () => {
                        setSaveError(null);
                      },
                      (err: unknown) => {
                        notify(String(err));
                      },
                    );
                }}
              >
                Retry save
              </button>
            </div>
          )}
          {view === 'overview' && (
            <Overview
              {...props}
              capture={() => {
                setDialog('capture');
              }}
            />
          )}
          {view === 'projects' && (
            <Projects {...props} selected={selectedProject} select={setSelectedProject} />
          )}
          {view === 'notebook' && (
            <Notebook
              {...props}
              runtime={runtime}
              selected={selectedNote}
              select={(id) => {
                go('notebook', id);
              }}
              capture={() => {
                setDialog('capture');
              }}
            />
          )}
          {view === 'evidence' && (
            <EvidenceLibrary {...props} selected={selectedEvidence} select={setSelectedEvidence} />
          )}
          {view === 'constellation' && <Constellation {...props} />}
          {view === 'protocol' && <ProtocolLab {...props} timer={protocolTimer} />}
          {view === 'figures' && (
            <div className="nx-figure-studio">
              <div className="nx-surface-toolbar">
                <span>
                  <span className="nx-project-dot" style={{ background: '#c0835a' }} />
                  Recovery trajectory <Badge>Example data</Badge>
                </span>
                <button
                  className="nx-text-button"
                  onClick={() => {
                    void runtime.store.getState().openModuleView('figures.list');
                  }}
                >
                  All figures
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <CoreSurface />
            </div>
          )}
          {view === 'engine' && (
            <div className="nx-figure-studio">
              <div className="nx-surface-toolbar">
                <span>
                  <Layers3 size={16} />
                  BenchWork tools
                </span>
                <button
                  className="nx-text-button"
                  onClick={() => {
                    go('modules');
                  }}
                >
                  Back to the collection
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <CoreSurface />
            </div>
          )}
          {view === 'focus' && <FocusRoom {...props} timer={focus} />}
          {view === 'modules' && (
            <ModuleGallery
              {...props}
              openEngine={(id) => {
                void (async () => {
                  if (!(await runtime.store.getState().closePage())) return;
                  await runtime.store.getState().openModuleView(id);
                  setView('engine');
                })().catch((err: unknown) => {
                  notify(String(err));
                });
              }}
            />
          )}
          <footer className="nx-page-footer">
            <span>
              <Layers3 size={13} /> Built for the way your mind works.
            </span>
            <span>
              BENCHWORK NEXT <span className="nx-footer-star">✳</span> EXPERIMENTAL EDITION
            </span>
          </footer>
        </main>
      </div>
      {focus.running && view !== 'focus' && (
        <button
          className="nx-focus-floating"
          onClick={() => {
            go('focus');
          }}
        >
          <span className="nx-live-dot" />
          <Focus size={16} />
          <span>In your element</span>
          <strong>{timerText(focus.seconds)}</strong>
          <ArrowUpRight size={15} />
        </button>
      )}
      {toast && (
        <div className="nx-toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setToast(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog === 'capture' && (
        <CaptureModal
          close={() => {
            setDialog(null);
          }}
          projects={workspace.projects}
          onSave={createNote}
          notify={notify}
        />
      )}
      {dialog === 'search' && (
        <Modal
          title="A thought away."
          subtitle="Find a note, a project, a source or your next tool."
          close={() => {
            setDialog(null);
          }}
          wide
        >
          <div className="nx-command-input">
            <Search size={21} />
            <input
              autoFocus
              aria-label="Search workspace"
              placeholder="Search your whole workspace…"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                  e.preventDefault();
                  const first = document.querySelector<HTMLButtonElement>(
                    '.nx-command-results > button',
                  );
                  if (e.key === 'Enter') first?.click();
                  else first?.focus();
                }
              }}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
            <kbd>ESC</kbd>
          </div>
          <div
            className="nx-command-results"
            onKeyDown={(e) => {
              if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
              e.preventDefault();
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button'),
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[
                (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              ]?.focus();
            }}
          >
            {[
              ...NAV.filter((n) => !n.module || workspace.modules.includes(n.module)).map((n) => ({
                id: n.id,
                type: 'Go to',
                title: n.label,
                icon: n.icon,
                run: () => {
                  go(n.id);
                },
              })),
              ...workspace.notes.map((n) => ({
                id: n.id,
                type: 'Note',
                matched: searchHits?.some((hit) => hit.path === n.path) ?? false,
                title: n.title,
                icon: FileText,
                run: () => {
                  go('notebook', n.id);
                },
              })),
              ...workspace.projects.map((p) => ({
                id: p.id,
                type: 'Project',
                title: p.name,
                icon: Layers3,
                run: () => {
                  go('projects', p.id);
                },
              })),
              ...workspace.evidence.map((e) => ({
                id: e.id,
                type: e.kind,
                title: e.title,
                icon: BookOpen,
                run: () => {
                  go('evidence', e.id);
                },
              })),
            ]
              .filter(
                (r) =>
                  `${r.title} ${r.type}`.toLowerCase().includes(query.toLowerCase()) ||
                  ('matched' in r && r.matched),
              )
              .slice(0, 12)
              .map(({ id, icon: Icon, title, type, run }) => (
                <button key={id} onClick={run}>
                  <span className="nx-command-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    {title}
                    <small>{type}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            {query &&
              !searchHits?.length &&
              ![
                ...workspace.notes.map((n) => n.title),
                ...workspace.projects.map((p) => p.name),
                ...workspace.evidence.map((e) => e.title),
                ...NAV.map((n) => n.label),
              ].some((t) => t.toLowerCase().includes(query.toLowerCase())) && (
                <Empty
                  title="A new connection, perhaps?"
                  text="No matching item. Capture it as the beginning of something."
                  action="Capture this thought"
                  onAction={() => {
                    setDialog('capture');
                  }}
                />
              )}
          </div>
          <div className="nx-command-footer">
            <Shortcut />
            <span>to open from anywhere</span>
            <span>
              Search stays on this device <ShieldCheck size={13} />
            </span>
          </div>
        </Modal>
      )}
      {dialog === 'about' && (
        <Modal
          title="Meet your next BenchWork."
          subtitle="A separate, experimental research studio. Built on the BenchWork you know."
          close={() => {
            setDialog(null);
          }}
        >
          <OrbitalArt />
          <p className="nx-modal-copy">
            A place for the question before the answer. Bring your projects, observations, sources
            and figures into one connected space.
          </p>
          <div className="nx-about-grid">
            <div>
              <ShieldCheck size={21} />
              <strong>Yours, by design</strong>
              <p>Saved in this app’s device storage. Export a portable copy at any time.</p>
            </div>
            <div>
              <Layers3 size={21} />
              <strong>A real foundation</strong>
              <p>BenchWork’s editor, figures, whiteboards and modules, with a new point of view.</p>
            </div>
          </div>
          <p className="nx-fine-print">
            The example research is fictional. No cloud connection or AI service is running. Your
            current BenchWork installation and vault are separate.
          </p>
          <button
            className="nx-button"
            onClick={() => {
              setDialog(null);
            }}
          >
            Let’s explore
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {dialog === 'workspace' && (
        <Modal
          title="Your own little universe."
          subtitle="This experimental workspace is separate from your everyday BenchWork."
          close={() => {
            setDialog(null);
          }}
        >
          <div className="nx-workspace-info">
            <span className="nx-workspace-avatar large">R</span>
            <div>
              <h3>Ray’s research studio</h3>
              <p>
                {workspace.projects.length} projects · {workspace.notes.length} notes ·{' '}
                {workspace.evidence.length} sources
              </p>
              <Badge colour="teal">Saved on this device</Badge>
            </div>
          </div>
          <p className="nx-modal-copy">
            Export includes the actual notebook files, figures, attachments and studio settings.
            Keep a backup before importing a different workspace.
          </p>
          <div className="nx-workspace-options">
            <button
              onClick={() => {
                void exportWorkspace().catch((err: unknown) => {
                  notify(String(err));
                });
              }}
            >
              <Download size={20} />
              <span>
                Export workspace<small>A portable copy of everything in this studio</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <button
              onClick={() => {
                importInput.current?.click();
              }}
            >
              <ArrowDownToLine size={20} />
              <span>
                Import an exported workspace
                <small>Replaces this example studio after validation</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <p className="nx-fine-print">
            Import replaces the studio in this edition only. Your original BenchWork app and its
            vault are never opened by this preview.
          </p>
          {pendingImport && (
            <div className="nx-import-review">
              <Badge colour="teal">EXPORT VALIDATED</Badge>
              <h3>A different little universe.</h3>
              <p>
                {pendingImport.workspace.projects.length} projects ·{' '}
                {pendingImport.workspace.notes.length} notes ·{' '}
                {pendingImport.workspace.evidence.length} sources
              </p>
              <p>
                This will replace the studio currently open in Next. Export the current workspace
                first if you want to keep it.
              </p>
              <div>
                <button
                  className="nx-text-button"
                  onClick={() => {
                    setPendingImport(null);
                  }}
                >
                  Keep this workspace
                </button>
                <button
                  className="nx-button"
                  onClick={() => {
                    void confirmImport().catch((err: unknown) => {
                      notify(String(err));
                    });
                  }}
                >
                  Import this workspace
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
          <input
            ref={importInput}
            type="file"
            accept=".json"
            aria-label="Import workspace file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void importWorkspace(f).catch((err: unknown) => {
                  notify(err instanceof Error ? err.message : String(err));
                });
              e.target.value = '';
            }}
          />
        </Modal>
      )}
      <TextPromptDialog />
      <AttachDialog />
    </div>
  );
}

function Overview(props: StudioProps & { capture: () => void }) {
  const { workspace: w, go, change, capture } = props;
  const complete = w.tasks.filter((t) => t.stage === 'Complete').length;
  const nextTasks = w.tasks.filter((t) => t.stage !== 'Complete').slice(0, 3);
  return (
    <>
      <div className="nx-overview-grid">
        <div className="nx-overview-main">
          <section className="nx-hero">
            <div className="nx-hero-copy">
              <span className="nx-hero-kicker">
                <span />
                YOUR NEXT BREAKTHROUGH STARTS HERE
              </span>
              <h2>
                Good work starts
                <br />
                with a little <em>space.</em>
              </h2>
              <p>
                For the idea that won’t leave you alone.
                <br />
                For the connections you haven’t made yet.
              </p>
              <button
                className="nx-button nx-hero-button"
                onClick={() => {
                  go('notebook', w.notes[0]?.id);
                }}
              >
                Pick up your thread
                <ArrowUpRight size={17} />
              </button>
              <span className="nx-hero-footnote">
                <span className="nx-tiny-stack">
                  <i>01</i>
                  <i>02</i>
                  <i>03</i>
                </span>
                Your work. A little more connected.
              </span>
            </div>
            <OrbitalArt />
            <div className="nx-hero-coordinate">
              IDEAS IN MOTION <span>↗</span>
            </div>
          </section>
          <div className="nx-metrics">
            {[
              {
                label: 'Active projects',
                value: w.projects.length,
                detail: 'Room to explore',
                icon: Layers3,
              },
              {
                label: 'Connected notes',
                value: w.notes.length,
                detail: 'Thoughts with a home',
                icon: FileText,
              },
              {
                label: 'Sources collected',
                value: w.evidence.length,
                detail: `${String(w.evidence.filter((e) => !e.read).length)} waiting to be read`,
                icon: BookOpen,
              },
              {
                label: 'Steps forward',
                value: complete,
                detail: `${String(w.tasks.length - complete)} next moves ahead`,
                icon: Check,
              },
            ].map(({ label, value, detail, icon: Icon }) => (
              <div key={label}>
                <div>
                  <span>{label}</span>
                  <Icon size={15} />
                </div>
                <strong>{String(value).padStart(2, '0')}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          <SectionHead
            eyebrow="THE BIGGER PICTURE"
            title="Your work, in motion"
            action="All projects"
            onAction={() => {
              go('projects');
            }}
          />
          <div className="nx-project-cards">
            {w.projects.map((p, i) => (
              <button
                key={p.id}
                className="nx-project-card"
                onClick={() => {
                  go('projects', p.id);
                }}
              >
                <div className="nx-project-card-top">
                  <span
                    className="nx-project-emblem"
                    style={{ color: p.colour, background: `${p.colour}15` }}
                  >
                    {i === 0 ? (
                      <Orbit size={23} />
                    ) : i === 1 ? (
                      <FlaskConical size={23} />
                    ) : (
                      <FileText size={23} />
                    )}
                  </span>
                  <ArrowUpRight size={17} />
                </div>
                <span className="nx-project-card-code">PROJECT {p.code}</span>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <MiniChart colour={p.colour} variant={i} />
                <div className="nx-project-card-progress">
                  <span>
                    {w.tasks.filter((t) => t.project === p.id && t.stage === 'Complete').length} /{' '}
                    {w.tasks.filter((t) => t.project === p.id).length} steps
                  </span>
                  <strong>{projectProgress(w, p.id)}%</strong>
                </div>
                <div className="nx-progress-track">
                  <span
                    style={{ width: `${String(projectProgress(w, p.id))}%`, background: p.colour }}
                  />
                </div>
              </button>
            ))}
          </div>
          <SectionHead
            eyebrow="WHERE YOU LEFT OFF"
            title="A thought worth returning to"
            action="Open notebook"
            onAction={() => {
              go('notebook');
            }}
          />
          <div className="nx-recent-notes">
            {w.notes.slice(0, 3).map((n, i) => (
              <button
                key={n.id}
                onClick={() => {
                  go('notebook', n.id);
                }}
              >
                <span className={`nx-note-icon tone-${String(i)}`}>
                  <FileText size={21} />
                </span>
                <span>
                  <strong>{n.title}</strong>
                  <small>
                    {n.kind} <span>·</span> {w.projects.find((p) => p.id === n.project)?.name}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </div>
        <aside className="nx-overview-rail" aria-label="Your next moves">
          <div className="nx-today-card">
            <div className="nx-rail-card-head">
              <span className="nx-eyebrow">A LITTLE DIRECTION</span>
              <span className="nx-day-circle">{new Date().getDate()}</span>
            </div>
            <h2>Your next moves.</h2>
            <p className="nx-muted">
              You don’t have to do it all.
              <br />
              Start with what matters.
            </p>
            <div className="nx-next-tasks">
              {nextTasks.map((t) => (
                <div key={t.id}>
                  <CheckCircle
                    checked={false}
                    label={`Complete ${t.title}`}
                    onClick={() => {
                      change((s) =>
                        logActivity(
                          {
                            ...s,
                            tasks: s.tasks.map((task) =>
                              task.id === t.id ? { ...task, stage: 'Complete' } : task,
                            ),
                          },
                          'One step forward',
                          t.title,
                        ),
                      );
                    }}
                  />
                  <button
                    onClick={() => {
                      go('projects', t.project);
                    }}
                  >
                    <strong>{t.title}</strong>
                    <small>
                      <span
                        className="nx-project-dot"
                        style={{ background: w.projects.find((p) => p.id === t.project)?.colour }}
                      />
                      {w.projects.find((p) => p.id === t.project)?.name}
                    </small>
                  </button>
                </div>
              ))}
            </div>
            <button
              className="nx-text-button"
              onClick={() => {
                go('projects');
              }}
            >
              See the whole picture
              <ArrowRight size={15} />
            </button>
          </div>
          <button
            className="nx-focus-card"
            onClick={() => {
              go('focus');
            }}
          >
            <span className="nx-focus-card-symbol">
              <Focus size={25} />
            </span>
            <span className="nx-eyebrow">FIND YOUR FLOW</span>
            <h3>One thing at a time.</h3>
            <p>
              Make 25 minutes
              <br />
              feel like your own.
            </p>
            <span className="nx-text-button">
              Enter focus room
              <ArrowUpRight size={15} />
            </span>
            <div className="nx-focus-lines" />
          </button>
          <div className="nx-activity-card">
            <SectionHead title="Small things, adding up" />
            <div className="nx-activity-list">
              {w.activity.slice(0, 3).map((a) => (
                <div key={a.id}>
                  <span className="nx-activity-dot" />
                  <span>
                    <strong>{a.text}</strong>
                    <p>{a.detail}</p>
                    <small>
                      {new Intl.DateTimeFormat('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(a.at))}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button className="nx-quick-note" onClick={capture}>
            <Plus size={18} />
            <span>
              Catch a little spark<small>Quick capture · Ctrl ⇧ N</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        </aside>
      </div>
    </>
  );
}

function Notebook({
  runtime,
  workspace,
  selected,
  select,
  capture,
}: StudioProps & {
  runtime: NextRuntime;
  selected: string;
  select: (id: string) => void;
  capture: () => void;
}) {
  const [filter, setFilter] = useState('');
  const note = workspace.notes.find((n) => n.id === selected);
  return (
    <div className="nx-notebook">
      <aside className="nx-note-list">
        <div className="nx-note-list-head">
          <strong>
            All notes <span>{workspace.notes.length}</span>
          </strong>
          <IconButton icon={Plus} label="New note" onClick={capture} />
        </div>
        <label className="nx-filter-input">
          <Search size={15} />
          <input
            aria-label="Filter notes"
            placeholder="Find a thought…"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          />
        </label>
        {workspace.notes
          .filter((n) => `${n.title} ${n.kind}`.toLowerCase().includes(filter.toLowerCase()))
          .map((n) => (
            <button
              className={`nx-note-list-item ${n.id === selected ? 'selected' : ''}`}
              key={n.id}
              onClick={() => {
                select(n.id);
              }}
            >
              <span>
                <span
                  className="nx-project-dot"
                  style={{ background: workspace.projects.find((p) => p.id === n.project)?.colour }}
                />
                {n.kind}
              </span>
              <strong>{n.title}</strong>
              <small>
                {workspace.projects.find((p) => p.id === n.project)?.name}
                <ArrowUpRight size={13} />
              </small>
            </button>
          ))}
        <div className="nx-note-list-foot">
          <ShieldCheck size={15} />
          Plain files. Lasting ideas.
        </div>
      </aside>
      <div className="nx-note-paper">
        <div className="nx-surface-toolbar">
          <span>
            <BookOpen size={15} />
            {note?.kind ?? 'Notebook'}
          </span>
          <button
            className="nx-text-button"
            onClick={() => {
              void runtime.store.getState().savePageNow();
            }}
          >
            <ShieldCheck size={14} />
            Save now
          </button>
        </div>
        <CoreSurface />
      </div>
    </div>
  );
}
function CoreSurface() {
  const page = useApp((s) => s.page);
  const file = useApp((s) => s.openFile);
  const module = useApp((s) => s.moduleView);
  const handle = useApp((s) => s.pageEditor);
  const [format, setFormat] = useState(false);
  return (
    <div className="nx-core-surface">
      {page ? (
        <>
          <div className="nx-editor-mini-toolbar">
            <span>WRITE / THINK / CONNECT</span>
            <button
              onClick={() => {
                setFormat((v) => !v);
              }}
              className={format ? 'active' : ''}
            >
              <Settings2 size={15} />
              Formatting
              <ChevronDown size={13} />
            </button>
          </div>
          {format && handle && <Ribbon handle={handle} free={false} />}
          <div className="nx-editor-page">
            <PageEditor key={page.path} page={page} />
          </div>
          <div className="nx-editor-hint">
            Type / for blocks <span>·</span> [[ to connect a thought <span>·</span> Your words save
            as you go
          </div>
        </>
      ) : file ? (
        <FileView path={file} />
      ) : module ? (
        <ModuleView open={module} />
      ) : (
        <Empty title="A fresh page awaits." text="Choose a note or a figure to begin." />
      )}
    </div>
  );
}
function CaptureModal({
  close,
  projects,
  onSave,
  notify,
}: {
  close: () => void;
  projects: Workspace['projects'];
  onSave: (title: string, body?: string, project?: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [project, setProject] = useState(projects[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Catch a little spark."
      subtitle="It doesn’t need to be polished. Just get it down."
      close={close}
    >
      <form
        className="nx-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setBusy(true);
          void onSave(title.trim(), body, project).then(close, (err: unknown) => {
            setBusy(false);
            notify(err instanceof Error ? err.message : String(err));
          });
        }}
      >
        <label>
          Give the thought a name
          <input
            autoFocus
            maxLength={180}
            placeholder="What’s on your mind?"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            required
          />
        </label>
        <label>
          A little more, if you like
          <textarea
            placeholder="An observation. A question. A possible next step…"
            rows={5}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
            }}
          />
        </label>
        <label>
          Keep it with
          <select
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="nx-form-footer">
          <span>
            <ShieldCheck size={14} />
            Stays in your workspace
          </span>
          <button className="nx-button" type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Finding a home…' : 'Save this thought'}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
