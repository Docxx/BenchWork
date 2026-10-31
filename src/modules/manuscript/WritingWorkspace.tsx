import { useEffect, useState } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import { readManuscript, type ManuscriptInfo } from './manuscripts';
import {
  attachSection,
  createSection,
  createWriting,
  linkedPaths,
  saveSectionLinks,
  SECTION,
  STATUSES,
  WRITING,
} from './workspace';
import './writing.css';
const propertyText = (value: unknown, fallback = '') =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;

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
    void ctx.app
      .items()
      .then(setItems)
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, [ctx, revision]);
  useEffect(() => {
    let live = true;
    if (!manuscript) return;
    void readManuscript(ctx, manuscript)
      .then((value) => {
        if (live) setInfo(value);
      })
      .catch((err: unknown) => {
        if (live) setError(String(err));
      });
    return () => {
      live = false;
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

function SectionDesk({
  ctx,
  path,
  items,
}: {
  ctx: ModuleContext;
  path: string;
  items: VaultItem[];
}) {
  const [aim, setAim] = useState('');
  const [status, setStatus] = useState('planned');
  const [wordTarget, setWordTarget] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [analyses, setAnalyses] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    text: string;
    source: string;
    page: string;
    citekey: string;
  } | null>(null);
  useEffect(() => {
    void ctx.app
      .pageProperties(path)
      .then((props) => {
        if (!props) throw new Error('This section could not be read.');
        setAim(propertyText(props['aim'], ''));
        setStatus(propertyText(props['status'], 'planned'));
        setWordTarget(propertyText(props['wordTarget'], ''));
        setEvidence(linkedPaths(props['evidence']));
        setAnalyses(linkedPaths(props['analyses']));
        setLoaded(true);
      })
      .catch((err: unknown) => {
        setMessage(String(err));
      });
  }, [ctx, path]);
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveSectionLinks(ctx, path, { aim, status, wordTarget, evidence, analyses });
      setMessage('Section plan saved.');
      return true;
    } catch (err) {
      setMessage(String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const choose = (
    label: string,
    type: string,
    values: string[],
    set: (value: string[]) => void,
  ) => (
    <fieldset>
      <legend>{label}</legend>
      <div className="writing-choices">
        {items
          .filter((i) => i.type === type)
          .map((i) => (
            <label key={i.path}>
              <input
                type="checkbox"
                checked={values.includes(i.path)}
                onChange={(e) => {
                  set(e.target.checked ? [...values, i.path] : values.filter((p) => p !== i.path));
                }}
              />
              {i.title}
            </label>
          ))}
      </div>
      {items.every((i) => i.type !== type) && <p className="hint">No {label.toLowerCase()} yet.</p>}
    </fieldset>
  );
  return (
    <section className="writing-section-desk" aria-label="Section plan">
      <h2>{path.split('/').at(-1)?.replace(/\.md$/, '')}</h2>
      {message && <p role="status">{message}</p>}
      <label className="label">
        Section aim
        <textarea
          value={aim}
          onChange={(e) => {
            setAim(e.target.value);
          }}
        />
      </label>
      <div className="writing-new">
        <label className="label">
          Section status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Word target
          <input
            inputMode="numeric"
            value={wordTarget}
            onChange={(e) => {
              setWordTarget(e.target.value);
            }}
          />
        </label>
      </div>
      {choose('Evidence notes', 'evidence', evidence, setEvidence)}
      {choose('Analysis runs', 'analysis', analyses, setAnalyses)}
      <div className="actions">
        <button type="button" disabled={!loaded || busy} onClick={() => void save()}>
          Save section plan
        </button>
        <button
          type="button"
          disabled={!loaded || busy}
          onClick={() =>
            void save().then((saved) => {
              if (saved) return ctx.app.open(path);
            })
          }
        >
          Write section
        </button>
      </div>
      <h3>Sources beside your draft</h3>
      {evidence.map((p) => (
        <button
          key={p}
          type="button"
          className="writing-section quiet"
          onClick={() =>
            void ctx.app
              .pageProperties(p)
              .then((props) => {
                setPreview({
                  title: p.split('/').at(-1) ?? p,
                  text: propertyText(props?.['excerpt'], ''),
                  source: linkedPaths([props?.['source']])[0]?.split('#')[0] ?? '',
                  page: propertyText(props?.['page'], '1'),
                  citekey: propertyText(props?.['citekey'], ''),
                });
              })
              .catch((err: unknown) => {
                setMessage(String(err));
              })
          }
        >
          {items.find((i) => i.path === p)?.title ?? p}
        </button>
      ))}
      {analyses.map((p) => (
        <button
          type="button"
          className="writing-section quiet"
          key={p}
          onClick={() => void ctx.app.open(p)}
        >
          {items.find((i) => i.path === p)?.title ?? p}
        </button>
      ))}
      {preview && (
        <aside className="writing-evidence">
          <h3>{preview.title}</h3>
          <blockquote>{preview.text}</blockquote>
          <div className="actions">
            <button
              type="button"
              disabled={!preview.source}
              onClick={() => void ctx.app.open(preview.source, { heading: `page=${preview.page}` })}
            >
              Open source PDF
            </button>
            <button
              type="button"
              disabled={!preview.citekey}
              onClick={() =>
                void ctx.app
                  .appendToPage(path, `[@${preview.citekey}]`)
                  .then(() => {
                    setMessage('Citation added to section.');
                  })
                  .catch((err: unknown) => {
                    setMessage(String(err));
                  })
              }
            >
              Add citation to section
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
