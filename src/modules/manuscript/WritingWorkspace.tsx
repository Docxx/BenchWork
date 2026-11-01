import { useEffect, useState } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import { readManuscript, type ManuscriptInfo } from './manuscripts';
import { attachSection, createSection, createWriting, SECTION, WRITING } from './workspace';
import { SectionDesk } from './SectionDesk';
import './writing.css';

export function WritingWorkspace({ ctx, path }: { ctx: ModuleContext; path: string | null }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [manuscript, setManuscript] = useState(path ?? '');
  const [info, setInfo] = useState<ManuscriptInfo | null>(null);
  const [section, setSection] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('paper');
  const [sectionTitle, setSectionTitle] = useState('');
  const [existing, setExisting] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    let request = 0;
    const load = async () => {
      const token = ++request;
      try {
        // items() waits for reported file changes to finish indexing.
        const all = await ctx.app.items();
        const next = manuscript ? await readManuscript(ctx, manuscript) : null;
        if (live && token === request) {
          setItems(all);
          setInfo(next);
        }
      } catch (err) {
        if (live && token === request) setError(String(err));
      }
    };
    // File notifications can arrive after the first read of a newly created section.
    const watching = ctx.vault.watch(() => {
      void load();
    });
    void load();
    return () => {
      live = false;
      watching.dispose();
    };
  }, [ctx, manuscript, revision]);
  const act = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      setRevision((n) => n + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="writing-workspace">
      <p className="hint">
        Plan thesis and paper sections, then keep source evidence and analysis runs beside your
        writing. Linked research stays out of the exported prose.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <label className="label">
        Manuscript
        <select
          value={manuscript}
          onChange={(e) => {
            setManuscript(e.target.value);
            setSection('');
            setInfo(null);
          }}
        >
          <option value="">Choose a manuscript</option>
          {items
            .filter((i) => i.type === 'manuscript')
            .map((i) => (
              <option key={i.path} value={i.path}>
                {i.title}
              </option>
            ))}
        </select>
      </label>
      <details>
        <summary>New thesis or paper</summary>
        <div className="writing-new">
          <label className="label">
            Manuscript title
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </label>
          <label className="label">
            Writing type
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
              }}
            >
              <option value="paper">Research paper</option>
              <option value="thesis">Thesis</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() =>
              void act(async () => {
                const created = await createWriting(ctx, title, kind);
                if (created) await ctx.app.openView(WRITING, created);
              })
            }
          >
            Create manuscript
          </button>
        </div>
      </details>
      {info && (
        <>
          <div className="actions">
            <button type="button" className="quiet" onClick={() => void ctx.app.open(info.path)}>
              Open manuscript
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => void ctx.app.openView('manuscript.overview', info.path)}
            >
              Word counts and export
            </button>
          </div>
          <div className="writing-layout">
            <section aria-label="Writing sections">
              <h2>{info.title}</h2>
              {info.parts.length === 0 && <p className="hint">Add your first section below.</p>}
              {info.parts.map((part, n) => (
                <button
                  type="button"
                  className="writing-section quiet"
                  key={`${part.target}-${String(n)}`}
                  aria-pressed={section === part.path}
                  disabled={!part.path}
                  onClick={() => {
                    setSection(part.path ?? '');
                  }}
                >
                  <span>
                    {n + 1}. {part.title}
                  </span>
                  <small>
                    {part.path ? `${String(part.words)} words` : 'Page not created yet'}
                  </small>
                </button>
              ))}
              <label className="label">
                New section title
                <input
                  value={sectionTitle}
                  onChange={(e) => {
                    setSectionTitle(e.target.value);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={busy || !sectionTitle.trim()}
                onClick={() =>
                  void act(async () => {
                    await createSection(ctx, manuscript, sectionTitle);
                    await ctx.app.openView(WRITING, manuscript);
                  })
                }
              >
                Add section
              </button>
              <details>
                <summary>Add an existing section</summary>
                <label className="label">
                  Existing section
                  <select
                    value={existing}
                    onChange={(e) => {
                      setExisting(e.target.value);
                    }}
                  >
                    <option value="">Choose a section</option>
                    {items
                      .filter(
                        (i) => i.type === SECTION && !info.parts.some((p) => p.path === i.path),
                      )
                      .map((i) => (
                        <option key={i.path} value={i.path}>
                          {i.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !existing}
                  onClick={() => void act(() => attachSection(ctx, manuscript, existing))}
                >
                  Link section
                </button>
              </details>
            </section>
            {section ? (
              <SectionDesk key={section} ctx={ctx} path={section} items={items} />
            ) : (
              <p className="hint">Choose a section to plan its aim and attach evidence.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
