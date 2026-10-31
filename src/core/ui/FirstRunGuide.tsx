import {
  BookOpen,
  FolderOpen,
  LayoutGrid,
  Palette,
  Puzzle,
  RefreshCw,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PACKS } from '../modules/packs';
import { GUIDE_STEPS, type GuideStep } from '../state/appStore';
import { PresetPicker } from './AppearanceSettings';
import { useApp } from './AppStoreContext';
import { Logo } from './Logo';
import { ConfirmChange } from './ModulesPanel';

const TITLES: Record<GuideStep, string> = {
  welcome: 'Welcome to BenchWork',
  how: 'How BenchWork works',
  vault: 'Your vault',
  modules: 'Choose your tools',
  theme: 'Pick a theme',
  tour: 'Finding your way round',
};

/**
 * The first-run guide: what BenchWork is, making or opening a vault,
 * choosing modules and a theme, and a look round Home. It shows by itself
 * once on each device; it can be skipped at any step and run again from
 * Settings. Before a vault is open it fills the window; after, it floats
 * over the app so theme changes show behind it.
 */
export function FirstRunGuide() {
  const step = useApp((s) => s.guide);
  const setStep = useApp((s) => s.setGuideStep);
  const endGuide = useApp((s) => s.endGuide);
  const open = useApp((s) => s.status.kind === 'open');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  if (step === null) return null;
  const index = GUIDE_STEPS.indexOf(step);
  const last = index === GUIDE_STEPS.length - 1;
  const go = (by: number) => {
    const next = GUIDE_STEPS[index + by];
    if (next) setStep(next);
  };
  // Past the vault step only once a vault is open: the rest happens inside it.
  const blocked = step === 'vault' && !open;

  const dialog = (
    <section
      className={`guide floating-dialog confirm guide-step-${step}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      <p
        className="guide-progress"
        aria-label={`Step ${String(index + 1)} of ${String(GUIDE_STEPS.length)}`}
      >
        {GUIDE_STEPS.map((s, i) => (
          <span key={s} className={i <= index ? 'done' : ''} aria-hidden="true" />
        ))}
      </p>
      <h2 id="guide-title" className="dialog-title" tabIndex={-1} ref={heading}>
        {TITLES[step]}
      </h2>

      <div className="guide-body">
        {step === 'welcome' && <Welcome />}
        {step === 'how' && <HowItWorks />}
        {step === 'vault' && <VaultStep />}
        {step === 'modules' && <ModulesStep />}
        {step === 'theme' && <ThemeStep />}
        {step === 'tour' && <Tour />}
      </div>

      <div className="guide-actions">
        {!last && (
          <button type="button" className="quiet" onClick={() => void endGuide()}>
            Skip the guide
          </button>
        )}
        <span className="guide-spacer" />
        {index > 0 && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              go(-1);
            }}
          >
            Back
          </button>
        )}
        {last ? (
          <button type="button" onClick={() => void endGuide()}>
            Start using BenchWork
          </button>
        ) : (
          !blocked && (
            <button
              type="button"
              onClick={() => {
                go(1);
              }}
            >
              {index === 0 ? 'Show me' : 'Next'}
            </button>
          )
        )}
      </div>
    </section>
  );

  return open ? (
    <div className="pack-backdrop guide-backdrop">{dialog}</div>
  ) : (
    <main className="app guide-screen">{dialog}</main>
  );
}

function Welcome() {
  return (
    <>
      <div className="guide-logo">
        <Logo />
      </div>
      <p>
        BenchWork is a notebook for research and everything round it: notes, handwriting,
        experiments, data and plans, kept together and easy to find.
      </p>
      <p>This guide takes about a minute. You can skip it now and run it again from Settings.</p>
    </>
  );
}

function HowItWorks() {
  return (
    <ul className="guide-points">
      <li>
        <FolderOpen aria-hidden />
        <span>
          <strong>A vault is a folder.</strong> Everything you make lives in one folder on your
          device, which you choose.
        </span>
      </li>
      <li>
        <BookOpen aria-hidden />
        <span>
          <strong>Notebooks, sections and pages.</strong> Notebooks hold sections, and sections hold
          pages, just as folders hold files.
        </span>
      </li>
      <li>
        <Sparkles aria-hidden />
        <span>
          <strong>Plain files you own.</strong> Each page is an ordinary text file, so other apps
          can open it and nothing is locked away.
        </span>
      </li>
      <li>
        <RefreshCw aria-hidden />
        <span>
          <strong>Your devices, kept in step.</strong> Sync the vault folder with Syncthing, or any
          folder sync, to have it on your computer and tablet.
        </span>
      </li>
    </ul>
  );
}

function VaultStep() {
  const open = useApp((s) => s.status.kind === 'open');
  const root = useApp((s) => (s.status.kind === 'open' ? s.status.vault.root : null));
  const chooseFolder = useApp((s) => s.chooseFolder);
  const busy = useApp((s) => s.busy);
  const notice = useApp((s) => s.notice);

  if (open) {
    return (
      <>
        <p>Your vault is ready:</p>
        <p className="path">{root}</p>
        <p className="hint">To use another one, go to Settings &gt; Vault &gt; Switch vault.</p>
      </>
    );
  }
  return (
    <>
      <p>
        Make a new vault in an empty folder, or open one you already have, such as one synced from
        another device.
      </p>
      {notice !== null && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      <div className="guide-choices">
        <button
          type="button"
          className="pack-card"
          disabled={busy}
          onClick={() => void chooseFolder('new')}
        >
          <strong>New vault</strong>
          <span>Start afresh, with a sample notebook to try things out.</span>
        </button>
        <button
          type="button"
          className="pack-card"
          disabled={busy}
          onClick={() => void chooseFolder('open')}
        >
          <strong>Open vault</strong>
          <span>Use a folder that is already a vault, or has notes in it.</span>
        </button>
      </div>
    </>
  );
}

function ModulesStep() {
  const { modules } = useApp((s) => s.modules);
  const enablePack = useApp((s) => s.enablePack);
  const setModuleEnabled = useApp((s) => s.setModuleEnabled);
  const pending = useApp((s) => s.pendingModuleChange);
  const busy = useApp((s) => s.moduleBusy);
  const [oneByOne, setOneByOne] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const nameOf = (id: string) => modules.find((m) => m.manifest.id === id)?.manifest.name ?? id;

  return (
    <>
      <p>
        Modules add tools to BenchWork. Switch on a pack that suits your work, or pick them one by
        one. Switching one off later never deletes anything.
      </p>
      <div className="guide-choices">
        {PACKS.map((pack) => (
          <button
            key={pack.id}
            type="button"
            className="pack-card"
            disabled={busy}
            onClick={() => {
              void enablePack(pack.modules).then((left) => {
                setNote(
                  left.length === 0
                    ? `${pack.name} switched on.`
                    : `${pack.name} switched on. Left off, as they do not run on this device: ${left.join(', ')}.`,
                );
              });
            }}
          >
            <strong>{pack.name}</strong>
            <span>{pack.description}</span>
          </button>
        ))}
      </div>
      {note !== null && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
      <button
        type="button"
        className="quiet guide-more"
        aria-expanded={oneByOne}
        onClick={() => {
          setOneByOne(!oneByOne);
        }}
      >
        <Puzzle size={15} aria-hidden /> {oneByOne ? 'Hide the list' : 'Choose one by one'}
      </button>
      {pending !== null && <ConfirmChange names={pending.ids.map(nameOf)} {...pending} />}
      {oneByOne && (
        <ul className="guide-modules" aria-label="Modules">
          {modules.map((info) => {
            const { id, name, description } = info.manifest;
            const on = info.status === 'on' || info.status === 'failed';
            return (
              <li key={id}>
                <span className="module-text">
                  <span className="module-name" id={`guide-module-${id}`}>
                    {name}
                  </span>
                  <span className="hint">
                    {info.status === 'unavailable' ? 'Not available on this device.' : description}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={on}
                  aria-labelledby={`guide-module-${id}`}
                  disabled={busy || info.status === 'unavailable' || pending !== null}
                  onClick={() => void setModuleEnabled(id, !on)}
                >
                  <span className="switch-knob" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ThemeStep() {
  return (
    <>
      <p>Choose a look. It changes straight away, and Settings &gt; Appearance has more.</p>
      <div className="appearance guide-themes">
        <PresetPicker />
      </div>
    </>
  );
}

function Tour() {
  return (
    <ul className="guide-points">
      <li>
        <LayoutGrid aria-hidden />
        <span>
          <strong>Home</strong> shows today, your calendar, tasks and pinned pages as cards. Press{' '}
          <em>Edit home</em> to add cards, drag them about and resize them by the corner.
        </span>
      </li>
      <li>
        <Wrench aria-hidden />
        <span>
          <strong>Tools</strong>, in the sidebar, lists what your modules add, such as the planner
          or lab calculators.
        </span>
      </li>
      <li>
        <Search aria-hidden />
        <span>
          <strong>Search</strong> everything with Ctrl E, and list every command with Ctrl K.
        </span>
      </li>
      <li>
        <Palette aria-hidden />
        <span>
          <strong>Settings</strong>, the cog beside your vault&apos;s name, has modules, themes and
          this guide again.
        </span>
      </li>
    </ul>
  );
}
