import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import { newQuestion, readyQuestions, score, type Question } from './model';
import type { StudySession } from './session';
import './study.css';

const timeLabel = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export function StudyView({ ctx, session }: { ctx: ModuleContext; session: StudySession }) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const { bank } = state;
  const [index, setIndex] = useState(0);
  const [queue, setQueue] = useState<Question[]>([]);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [roundMinutes, setRoundMinutes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [missed, setMissed] = useState<string[]>([]);
  const started = useRef(0);
  const [summary, setSummary] = useState('');
  const question = playing ? queue[index] : bank.questions[index];
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
  }, [session]);
  async function finish(complete: boolean) {
    if (!session.round) return;
    session.updateTime(Math.max(0, (performance.now() - started.current) / 1000));
    session.completeRound(complete);
    const result = score(session.round.results);
    setMissed(session.round.results.filter((r) => !r.correct).map((r) => r.question));
    setSummary(
      `${String(result.correct)} / ${String(result.total)} correct · ${String(result.points)} points${complete ? '' : ' · stopped early'}`,
    );
    setPlaying(false);
    setIndex(0);
    await session.saveRound();
  }
  const expireRound = useEffectEvent(() => {
    void run(() => finish(false));
  });
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const seconds = Math.max(0, (performance.now() - started.current) / 1000);
      setElapsed(seconds);
      session.updateTime(seconds);
      if (roundMinutes && seconds >= roundMinutes * 60) expireRound();
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [playing, roundMinutes, session]);
  useEffect(
    () => () => {
      if (session.round)
        session.updateTime(Math.max(0, (performance.now() - started.current) / 1000));
    },
    [session],
  );
  function edit(changes: Partial<Question>) {
    session.edit({
      ...bank,
      questions: bank.questions.map((q, i) => (i === index ? { ...q, ...changes } : q)),
    });
  }
  async function start(onlyMissed = false) {
    await session.save();
    await session.saveRound();
    const questions = readyQuestions(bank).filter((q) => !onlyMissed || missed.includes(q.id));
    if (!questions.length)
      throw new Error('Add a prompt and answer, or at least two choices, before practising.');
    setQueue(questions);
    setIndex(0);
    setRevealed(false);
    setChoice(null);
    setElapsed(0);
    setSummary('');
    started.current = performance.now();
    session.startRound();
    setPlaying(true);
  }
  async function answer(correct: boolean) {
    if (!question || !session.round) return;
    session.answer(question.id, correct);
    if (index + 1 >= queue.length) await finish(true);
    else {
      setIndex((i) => i + 1);
      setRevealed(false);
      setChoice(null);
    }
  }
  async function loadHistory() {
    if (!(await ctx.vault.exists('Teaching/Practice'))) return;
    const files = (await ctx.vault.listDir('Teaching/Practice')).filter((e) =>
      e.name.endsWith('.practice.yaml'),
    );
    const records = await Promise.all(
      files.map(async (e) => (await ctx.vault.readRecord(`Teaching/Practice/${e.name}`)).data),
    );
    setHistory(records.filter((r) => r.bank === state.path).reverse());
  }
  return (
    <div className="study-workspace">
      <header>
        <span className="study-eyebrow">PERSONAL PRACTICE</span>
        <h1>Study Arcade</h1>
        <p>Small questions. Stronger recall.</p>
      </header>
      {(error || state.error) && <p role="alert">{error || state.error}</p>}
      <div className="study-toolbar">
        <select
          aria-label="Choose study set"
          value={state.path}
          disabled={playing || busy}
          onChange={(e) => {
            const value = e.target.value;
            void run(async () => {
              await session.select(value);
              setIndex(0);
              setSummary('');
              setHistory([]);
              setMissed([]);
            });
          }}
        >
          <option value="" disabled>
            Choose a study set
          </option>
          {state.files.map((f) => (
            <option key={f} value={f}>
              {f.split('/').at(-1)?.replace('.quiz.yaml', '')}
            </option>
          ))}
        </select>
        <button
          disabled={playing || busy}
          onClick={() => {
            void run(async () => {
              await session.create();
              setIndex(0);
              setMissed([]);
            });
          }}
        >
          New study set
        </button>
        <button
          disabled={playing || busy}
          onClick={() => {
            void run(() => session.save());
          }}
        >
          {state.dirty ? 'Save study set' : 'Saved'}
        </button>
        {!playing && session.round && (
          <button
            onClick={() => {
              void run(() => session.saveRound());
            }}
          >
            Save unfinished round
          </button>
        )}
      </div>
      {summary && (
        <p className="study-score" role="status">
          {summary}
        </p>
      )}
      {playing && question ? (
        <section className="study-round">
          <div className="study-toolbar">
            <span>
              Question {index + 1} / {queue.length}
            </span>
            <strong>
              {timeLabel(roundMinutes ? Math.max(0, roundMinutes * 60 - elapsed) : elapsed)}
            </strong>
            <button
              disabled={busy}
              onClick={() => {
                void run(() => finish(false));
              }}
            >
              End round
            </button>
          </div>
          {question.image && (
            <img src={ctx.vault.fileUrl(question.image) ?? ''} alt="Question material" />
          )}
          <h2>{question.prompt}</h2>
          {question.options.length ? (
            <>
              <div className="study-choices">
                {question.options.map((o, i) => (
                  <button
                    key={i}
                    disabled={revealed || busy}
                    aria-pressed={choice === i}
                    onClick={() => {
                      setChoice(i);
                      setRevealed(true);
                    }}
                  >
                    {o}
                  </button>
                ))}
              </div>
              {revealed && (
                <>
                  <p role="status">
                    {choice === question.correct
                      ? 'Correct!'
                      : `Answer: ${question.options[question.correct] ?? ''}`}
                  </p>
                  <p>{question.answer}</p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void run(() => answer(choice === question.correct));
                    }}
                  >
                    Continue
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {revealed ? (
                <>
                  <div className="study-answer">{question.answer}</div>
                  <div className="study-toolbar">
                    <button
                      disabled={busy}
                      onClick={() => {
                        void run(() => answer(false));
                      }}
                    >
                      Practise again
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        void run(() => answer(true));
                      }}
                    >
                      I knew it
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => {
                    setRevealed(true);
                  }}
                >
                  Reveal answer
                </button>
              )}
            </>
          )}
          {question.source && <small>Source: {question.source}</small>}
        </section>
      ) : (
        <div className="study-layout">
          <aside>
            <h2>Questions</h2>
            {bank.questions.map((q, i) => (
              <button
                key={q.id}
                aria-pressed={index === i}
                onClick={() => {
                  setIndex(i);
                }}
              >
                {i + 1}. {q.prompt || 'New question'}
              </button>
            ))}
            <button
              onClick={() => {
                session.edit({ ...bank, questions: [...bank.questions, newQuestion()] });
                setIndex(bank.questions.length);
              }}
            >
              + Add question
            </button>
          </aside>
          <main>
            <section className="study-card">
              <label>
                Study set title
                <input
                  value={bank.title}
                  onChange={(e) => {
                    session.edit({ ...bank, title: e.target.value });
                  }}
                />
              </label>
              {question && (
                <>
                  <label>
                    Question
                    <textarea
                      aria-label="Question prompt"
                      value={question.prompt}
                      onChange={(e) => {
                        edit({ prompt: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Answer / explanation
                    <textarea
                      aria-label="Question answer"
                      value={question.answer}
                      onChange={(e) => {
                        edit({ answer: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Mode
                    <select
                      value={question.options.length ? 'quiz' : 'card'}
                      onChange={(e) => {
                        edit({
                          options: e.target.value === 'quiz' ? ['Choice 1', 'Choice 2'] : [],
                          correct: 0,
                        });
                      }}
                    >
                      <option value="card">Flashcard</option>
                      <option value="quiz">Multiple choice</option>
                    </select>
                  </label>
                  {question.options.length > 0 && (
                    <>
                      {question.options.map((o, i) => (
                        <label key={i}>
                          Choice {i + 1}
                          <input
                            value={o}
                            onChange={(e) => {
                              edit({
                                options: question.options.map((v, n) =>
                                  n === i ? e.target.value : v,
                                ),
                              });
                            }}
                          />
                        </label>
                      ))}
                      <label>
                        Correct choice
                        <select
                          value={question.correct}
                          onChange={(e) => {
                            edit({ correct: Number(e.target.value) });
                          }}
                        >
                          {question.options.map((_, i) => (
                            <option key={i} value={i}>
                              Choice {i + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        disabled={question.options.length >= 8}
                        onClick={() => {
                          edit({
                            options: [
                              ...question.options,
                              `Choice ${String(question.options.length + 1)}`,
                            ],
                          });
                        }}
                      >
                        Add choice
                      </button>
                    </>
                  )}
                  <label>
                    Source note or lesson path
                    <input
                      value={question.source}
                      onChange={(e) => {
                        edit({ source: e.target.value });
                      }}
                    />
                  </label>
                  <div className="study-toolbar">
                    <button
                      disabled={busy}
                      onClick={() => {
                        void run(async () => {
                          const [source] = await ctx.vault.pickFiles({
                            title: 'Choose a question image',
                            multiple: false,
                          });
                          if (!source) return;
                          if (!/\.(png|jpe?g|webp)$/i.test(source))
                            throw new Error('Choose a PNG, JPEG or WebP image.');
                          edit({
                            image: await ctx.files.importFile(
                              source,
                              `Teaching/Assets/${crypto.randomUUID()}`,
                            ),
                          });
                          await session.save();
                        });
                      }}
                    >
                      Add image
                    </button>
                    {question.image && (
                      <>
                        <img
                          className="study-thumbnail"
                          src={ctx.vault.fileUrl(question.image) ?? ''}
                          alt="Question material"
                        />
                        <button
                          onClick={() => {
                            edit({ image: null });
                          }}
                        >
                          Remove image
                        </button>
                      </>
                    )}
                    <button
                      disabled={bank.questions.length < 2}
                      onClick={() => {
                        session.edit({
                          ...bank,
                          questions: bank.questions.filter((_, i) => i !== index),
                        });
                        setIndex(Math.max(0, index - 1));
                      }}
                    >
                      Remove question
                    </button>
                  </div>
                </>
              )}
            </section>
            <section className="study-card">
              <h2>Play a round</h2>
              <label>
                Round timer
                <select
                  value={roundMinutes}
                  onChange={(e) => {
                    setRoundMinutes(Number(e.target.value));
                  }}
                >
                  <option value={0}>No time limit</option>
                  <option value={1}>1 minute</option>
                  <option value={3}>3 minutes</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                </select>
              </label>
              <div className="study-toolbar">
                <button
                  disabled={busy}
                  onClick={() => {
                    void run(() => start());
                  }}
                >
                  Start practice
                </button>
                <button
                  disabled={busy || !missed.length}
                  onClick={() => {
                    void run(() => start(true));
                  }}
                >
                  Review missed questions
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    void run(loadHistory);
                  }}
                >
                  Practice history
                </button>
              </div>
              {history.map((r, i) => (
                <p key={i}>
                  {String(r.started)} · {String(r.correct)} / {String(r.total)} · {String(r.points)}{' '}
                  points{r.complete ? '' : ' · unfinished'}
                </p>
              ))}
            </section>
          </main>
        </div>
      )}
    </div>
  );
}
