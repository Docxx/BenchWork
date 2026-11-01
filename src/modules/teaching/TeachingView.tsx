import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import { clock, moveSlide, newSlide, type Slide } from './model';
import { importSlides, noteText } from './materials';
import { Stage, useFrame } from './Stage';
import { PresenterTimer } from './PresenterTimer';
import type { TeachingSession } from './session';
import './teaching.css';

export function TeachingView({
  ctx,
  session,
  mode,
}: {
  ctx: ModuleContext;
  session: TeachingSession;
  mode: 'studio' | 'presenter' | 'rehearsal';
}) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const { lesson } = state;
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState({ slide: '', count: 1 });
  const [blank, setBlank] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [projecting, setProjecting] = useState(false);
  const [monitors, setMonitors] = useState<{ index: number; name: string }[]>([]);
  const [monitor, setMonitor] = useState(0);
  const [notes, setNotes] = useState<VaultItem[]>([]);
  const [notePath, setNotePath] = useState('');
  const [bookmark, setBookmark] = useState('');
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [, tick] = useState(0);
  const slide = lesson.slides[index];
  const lines = reveal.slide === slide?.id ? reveal.count : 1;
  function setLines(value: number | ((n: number) => number)) {
    setReveal({ slide: slide?.id ?? '', count: typeof value === 'number' ? value : value(lines) });
  }
  const {
    frame,
    ready,
    error: imageError,
  } = useFrame(ctx, lesson, slide, mode !== 'studio' && slide?.reveal ? lines : Infinity, blank);
  const next = useFrame(ctx, lesson, lesson.slides[index + 1], Infinity, false);
  const practice = session.rehearsal;
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await session.perform(task);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void session.refresh().catch((e: unknown) => {
      setError(String(e));
    });
    void ctx.app
      .items()
      .then(setNotes)
      .catch((e: unknown) => {
        setError(String(e));
      });
    void ctx.audience
      ?.monitors()
      .then(setMonitors)
      .catch((e: unknown) => {
        setError(String(e));
      });
    return () => {
      practice.pause();
      void ctx.audience?.close().catch(() => {
        /* Native shutdown also destroys the child window. */
      });
    };
  }, [ctx, session, practice]);
  useEffect(() => {
    const timer = setInterval(() => {
      practice.sample();
      tick((n) => n + 1);
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [practice]);
  useEffect(() => {
    practice.change(slide?.id ?? '');
  }, [slide?.id, practice]);
  useEffect(() => {
    if (projecting)
      void ctx.audience?.update(frame).catch((e: unknown) => {
        setError(String(e));
      });
  }, [projecting, frame, ctx]);
  function editSlide(changes: Partial<Slide>) {
    session.edit({
      ...lesson,
      slides: lesson.slides.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    });
  }
  function step(by: number) {
    setIndex((i) => Math.max(0, Math.min(lesson.slides.length - 1, i + by)));
    setBlank(false);
  }
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable]')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      if (slide?.reveal && lines < slide.body.split('\n').length) setLines((n) => n + 1);
      else step(1);
    }
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key.toLowerCase() === 'b') setBlank((v) => !v);
  });
  useEffect(() => {
    if (mode === 'studio') return;
    const key = (e: KeyboardEvent) => {
      onKey(e);
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
    };
  }, [mode]);
  async function loadHistory() {
    if (!(await ctx.vault.exists('Teaching/Rehearsals'))) {
      setHistory([]);
      return;
    }
    const entries = (await ctx.vault.listDir('Teaching/Rehearsals')).filter((e) =>
      e.name.endsWith('.rehearsal.yaml'),
    );
    const all = await Promise.all(
      entries.map(async (e) => (await ctx.vault.readRecord(`Teaching/Rehearsals/${e.name}`)).data),
    );
    setHistory(all.filter((r) => r.lesson === state.path).reverse());
  }
  return (
    <div className="teaching-workspace">
      <header className="teaching-heading">
        <div>
          <span className="teaching-eyebrow">TEACHING STUDIO</span>
          <h1>
            {mode === 'studio'
              ? 'Lesson Studio'
              : mode === 'presenter'
                ? 'Presenter Desk'
                : 'Rehearsal Room'}
          </h1>
        </div>
        <nav aria-label="Teaching tools">
          {(['studio', 'presenter', 'rehearsal'] as const).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => {
                void ctx.app.openView(`teaching.${m}`);
              }}
            >
              {m === 'studio' ? 'Build' : m === 'presenter' ? 'Present' : 'Rehearse'}
            </button>
          ))}
        </nav>
      </header>
      <div className="teaching-toolbar">
        <label>
          Lesson
          <select
            aria-label="Choose lesson"
            value={state.path ?? ''}
            disabled={busy || state.busy}
            onChange={(e) => {
              const value = e.target.value;
              void run(async () => {
                await session.select(value);
                setIndex(0);
                setHistory([]);
              });
            }}
          >
            <option value="" disabled>
              Choose or create a lesson
            </option>
            {state.files.map((p) => (
              <option key={p} value={p}>
                {p.split('/').at(-1)?.replace('.lesson.yaml', '')}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || state.busy}
          onClick={() => {
            void run(async () => {
              await session.create();
              setIndex(0);
            });
          }}
        >
          New lesson
        </button>
        <button
          disabled={busy || state.busy}
          onClick={() => {
            void run(() => session.save());
          }}
        >
          {state.busy ? 'Saving…' : state.dirty ? 'Save changes' : 'Saved'}
        </button>
        <span className="teaching-muted">
          {lesson.slides.length} slides ·{' '}
          {lesson.slides.reduce((n, s) => n + s.minutes, 0).toFixed(1)} min planned
        </span>
      </div>
      {(error || state.error || imageError) && (
        <p role="alert">{error || state.error || imageError}</p>
      )}
      <div className="teaching-layout">
        <aside className="teaching-sequence">
          <h2>Sequence</h2>
          {lesson.slides.map((s, i) => (
            <button
              key={s.id}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => {
                setIndex(i);
                setBlank(false);
              }}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              <div>
                {s.title || 'Untitled slide'}
                <small>
                  {s.minutes} min · {s.pdfPage ? 'PDF' : s.image ? 'Image' : 'Card'}
                </small>
              </div>
            </button>
          ))}
          {mode === 'studio' && (
            <button
              onClick={() => {
                session.edit({ ...lesson, slides: [...lesson.slides, newSlide()] });
                setIndex(lesson.slides.length);
              }}
            >
              + Add slide
            </button>
          )}
        </aside>
        <main className="teaching-main">
          {mode === 'studio' && (
            <section className="teaching-card teaching-fields">
              <label>
                Lesson title
                <input
                  aria-label="Lesson title"
                  value={lesson.title}
                  onChange={(e) => {
                    session.edit({ ...lesson, title: e.target.value });
                  }}
                />
              </label>
              <label>
                Use
                <select
                  value={lesson.purpose}
                  onChange={(e) => {
                    session.edit({ ...lesson, purpose: e.target.value as typeof lesson.purpose });
                  }}
                >
                  <option value="lecture">Lecture</option>
                  <option value="seminar">Research seminar</option>
                  <option value="tutorial">Tutorial</option>
                </select>
              </label>
              {(['background', 'foreground', 'accent'] as const).map((c) => (
                <label key={c}>
                  {c}
                  <input
                    aria-label={`Slide ${c}`}
                    type="color"
                    value={lesson[c]}
                    onChange={(e) => {
                      session.edit({ ...lesson, [c]: e.target.value });
                    }}
                  />
                </label>
              ))}
            </section>
          )}
          <Stage
            frame={frame}
            draw={drawing}
            onStrokes={(strokes) => {
              editSlide({ strokes });
            }}
          />
          {!ready && !imageError && <p role="status">Loading slide…</p>}
          <div className="teaching-toolbar">
            <button
              disabled={index <= 0}
              onClick={() => {
                step(-1);
              }}
            >
              Previous
            </button>
            <span>
              {index + 1} / {lesson.slides.length}
            </span>
            <button
              disabled={index >= lesson.slides.length - 1}
              onClick={() => {
                step(1);
              }}
            >
              Next
            </button>
            {slide?.reveal && mode !== 'studio' && (
              <button
                onClick={() => {
                  setLines((n) => n + 1);
                }}
              >
                Reveal next line
              </button>
            )}
            <button
              aria-pressed={drawing}
              onClick={() => {
                setDrawing((v) => !v);
              }}
            >
              Pen
            </button>
            <button
              disabled={!slide?.strokes.length}
              onClick={() => {
                editSlide({ strokes: slide?.strokes.slice(0, -1) ?? [] });
              }}
            >
              Undo ink
            </button>
          </div>
          {mode === 'studio' && slide && (
            <section className="teaching-card teaching-editor">
              <div className="teaching-toolbar">
                <button
                  disabled={index === 0}
                  onClick={() => {
                    session.edit({ ...lesson, slides: moveSlide(lesson.slides, index, -1) });
                    setIndex(index - 1);
                  }}
                >
                  Move up
                </button>
                <button
                  disabled={index === lesson.slides.length - 1}
                  onClick={() => {
                    session.edit({ ...lesson, slides: moveSlide(lesson.slides, index, 1) });
                    setIndex(index + 1);
                  }}
                >
                  Move down
                </button>
                <button
                  onClick={() => {
                    session.edit({
                      ...lesson,
                      slides: [
                        ...lesson.slides.slice(0, index + 1),
                        { ...slide, id: crypto.randomUUID() },
                        ...lesson.slides.slice(index + 1),
                      ],
                    });
                    setIndex(index + 1);
                  }}
                >
                  Duplicate
                </button>
                <button
                  disabled={lesson.slides.length === 1}
                  onClick={() => {
                    session.edit({
                      ...lesson,
                      slides: lesson.slides.filter((_, i) => i !== index),
                    });
                    setIndex(Math.max(0, index - 1));
                  }}
                >
                  Remove from lesson
                </button>
              </div>
              <label>
                Slide title
                <input
                  value={slide.title}
                  onChange={(e) => {
                    editSlide({ title: e.target.value });
                  }}
                />
              </label>
              {!slide.image && !slide.pdfPage && (
                <label>
                  Audience text
                  <textarea
                    rows={6}
                    value={slide.body}
                    onChange={(e) => {
                      editSlide({ body: e.target.value });
                    }}
                  />
                </label>
              )}
              <div className="teaching-fields">
                <label>
                  Planned minutes
                  <input
                    type="number"
                    min="0.1"
                    max="180"
                    step="0.5"
                    value={slide.minutes}
                    onChange={(e) => {
                      const n = e.target.valueAsNumber;
                      if (Number.isFinite(n))
                        editSlide({ minutes: Math.max(0.1, Math.min(180, n)) });
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={slide.reveal}
                    onChange={(e) => {
                      editSlide({ reveal: e.target.checked });
                    }}
                  />{' '}
                  Reveal text one line at a time
                </label>
              </div>
              {slide.source && <small>Source: {slide.source}</small>}
            </section>
          )}
          {mode === 'studio' && (
            <section className="teaching-card">
              <h2>Add material</h2>
              <p className="teaching-muted">
                PDFs, images and static PowerPoint slides. Originals stay unchanged. PowerPoint
                import needs the Windows desktop app and installed PowerPoint.
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await session.save();
                    const [source] = await ctx.vault.pickFiles({
                      title: 'Choose teaching material',
                      multiple: false,
                    });
                    if (!source) return;
                    const slides = await importSlides(ctx, source);
                    session.edit({
                      ...session.state.lesson,
                      slides: [...session.state.lesson.slides, ...slides],
                    });
                    await session.save();
                  });
                }}
              >
                Import PDF, PowerPoint or image
              </button>
              <div className="teaching-fields">
                <label>
                  BenchWork note
                  <select
                    value={notePath}
                    onChange={(e) => {
                      setNotePath(e.target.value);
                    }}
                  >
                    <option value="">Choose a note</option>
                    {notes
                      .filter((n) => n.path.endsWith('.md'))
                      .map((n) => (
                        <option key={n.path} value={n.path}>
                          {n.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  disabled={!notePath || busy}
                  onClick={() => {
                    void run(async () => {
                      const text = (await ctx.vault.readText(notePath)).replace(
                        /^---\r?\n[\s\S]*?\r?\n---\r?\n/,
                        '',
                      );
                      const added = {
                        ...newSlide(),
                        title: notes.find((n) => n.path === notePath)?.title ?? 'Note',
                        body: noteText(text),
                        source: notePath,
                      };
                      session.edit({ ...lesson, slides: [...lesson.slides, added] });
                      await session.save();
                      setIndex(lesson.slides.length);
                    });
                  }}
                >
                  Add note as slide
                </button>
              </div>
            </section>
          )}
          {mode === 'rehearsal' && (
            <section className="teaching-card">
              <h2>Practice session</h2>
              <div className="teaching-toolbar">
                <strong className="teaching-clock">{clock(practice.practice?.seconds ?? 0)}</strong>
                {!practice.practice ? (
                  <button
                    disabled={!state.path}
                    onClick={() => {
                      practice.start(state.path ?? '', slide?.id ?? '');
                      tick((n) => n + 1);
                    }}
                  >
                    Start rehearsal
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (practice.running) practice.pause();
                        else practice.resume();
                        tick((n) => n + 1);
                      }}
                    >
                      {practice.running ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => {
                        void run(async () => {
                          await practice.save(ctx);
                          await loadHistory();
                          tick((n) => n + 1);
                        });
                      }}
                    >
                      Finish and save
                    </button>
                  </>
                )}
              </div>
              {practice.practice && (
                <>
                  <label>
                    Practice notes
                    <textarea
                      value={practice.practice.notes}
                      onChange={(e) => {
                        practice.setNotes(e.target.value);
                        tick((n) => n + 1);
                      }}
                    />
                  </label>
                  <div className="teaching-fields">
                    <input
                      aria-label="Practice bookmark"
                      placeholder="What should you revise?"
                      value={bookmark}
                      onChange={(e) => {
                        setBookmark(e.target.value);
                      }}
                    />
                    <button
                      onClick={() => {
                        practice.bookmark(bookmark || 'Review this slide');
                        setBookmark('');
                        tick((n) => n + 1);
                      }}
                    >
                      Mark this moment
                    </button>
                  </div>
                  <ul>
                    {practice.practice.bookmarks.map((b, i) => (
                      <li key={i}>
                        {clock(b.seconds)} · {lesson.slides.find((s) => s.id === b.slide)?.title} ·{' '}
                        {b.note}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                onClick={() => {
                  void run(loadHistory);
                }}
              >
                Show past rehearsals
              </button>
              {history.map((r, i) => (
                <details key={i}>
                  <summary>
                    {String(r.started)} · {clock(Number(r.seconds))}
                  </summary>
                  <p>{typeof r.notes === 'string' ? r.notes : ''}</p>
                  <ul>
                    {lesson.slides.map((s) => (
                      <li key={s.id}>
                        {s.title}:{' '}
                        {clock((r.timings as Record<string, number> | undefined)?.[s.id] ?? 0)} /{' '}
                        {s.minutes} min planned
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </section>
          )}
        </main>
        <aside className="teaching-private">
          {mode === 'presenter' && (
            <PresenterTimer minutes={lesson.slides.reduce((n, s) => n + s.minutes, 0)} />
          )}
          <section className="teaching-card">
            <h2>Speaker notes</h2>
            <p className="teaching-muted">Private. Never sent to the audience display.</p>
            <textarea
              aria-label="Private speaker notes"
              rows={10}
              value={slide?.notes ?? ''}
              disabled={!slide}
              onChange={(e) => {
                editSlide({ notes: e.target.value });
              }}
            />
            <p>{slide?.minutes ?? 0} min planned for this slide</p>
          </section>
          {mode !== 'studio' && (
            <>
              <section className="teaching-card">
                <h2>Up next</h2>
                {lesson.slides[index + 1] ? (
                  <>
                    <Stage
                      frame={next.frame}
                      draw={false}
                      onStrokes={() => {
                        /* Preview only. */
                      }}
                    />
                    <p>{lesson.slides[index + 1]?.title}</p>
                  </>
                ) : (
                  <p>End of lesson</p>
                )}
              </section>
              <section className="teaching-card">
                <h2>Audience display</h2>
                {ctx.audience ? (
                  <>
                    <label>
                      Screen
                      <select
                        value={monitor}
                        onChange={(e) => {
                          setMonitor(Number(e.target.value));
                        }}
                      >
                        {monitors.map((m) => (
                          <option key={m.index} value={m.index}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={busy || !ready}
                      onClick={() => {
                        void run(async () => {
                          await session.save();
                          await ctx.audience?.open(frame, monitor);
                          setProjecting(true);
                        });
                      }}
                    >
                      Open audience screen
                    </button>
                    <button
                      aria-pressed={blank}
                      onClick={() => {
                        setBlank((v) => !v);
                      }}
                    >
                      {blank ? 'Show slide' : 'Blackout'}
                    </button>
                    <button
                      disabled={!projecting}
                      onClick={() => {
                        void run(async () => {
                          await ctx.audience?.close();
                          setProjecting(false);
                        });
                      }}
                    >
                      Close audience screen
                    </button>
                    <small>
                      Use a second display for private notes. Arrow keys navigate, Space reveals, B
                      blanks the screen.
                    </small>
                  </>
                ) : (
                  <p>Open the desktop app to use a projector. You can still practise here.</p>
                )}
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
