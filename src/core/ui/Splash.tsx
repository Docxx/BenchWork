import { useEffect, useState } from 'react';
import { Logo } from './Logo';

/** How long the animation plays before fading, and the fade, in milliseconds. */
const PLAY_MS = 1100;
const FADE_MS = 300;

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type Phase = 'waiting' | 'playing' | 'leaving' | 'gone';

/**
 * A short animation over the app as it opens: the mark, then the name.
 * The app loads underneath meanwhile, and clicks pass through. Until the
 * saved settings are read it is only the background, so turning it off in
 * Settings means it never plays; it never plays where motion is reduced.
 */
export function Splash({
  settingsKnown,
  enabled,
  ready,
}: {
  /** Whether the saved settings have been read. */
  settingsKnown: boolean;
  enabled: boolean;
  /** Whether the app has finished starting. */
  ready: boolean;
}) {
  const [reduced] = useState(reducedMotion);
  const [played, setPlayed] = useState(false);
  const [faded, setFaded] = useState(false);
  const phase: Phase =
    reduced || faded || (settingsKnown && !enabled)
      ? 'gone'
      : !settingsKnown
        ? 'waiting'
        : played && ready
          ? 'leaving'
          : 'playing';

  useEffect(() => {
    const ms = phase === 'playing' ? PLAY_MS : phase === 'leaving' ? FADE_MS : null;
    if (ms === null) return;
    const timer = window.setTimeout(() => {
      if (phase === 'playing') setPlayed(true);
      else setFaded(true);
    }, ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase]);

  if (phase === 'gone') return null;
  return (
    <div className={`splash ${phase}`} aria-hidden="true">
      {phase !== 'waiting' && (
        <div className="splash-content">
          <Logo className="splash-mark" size={88} />
          <span className="splash-name">
            {Array.from('BenchWork').map((letter, i) => (
              <span key={i} style={{ animationDelay: `${String(250 + i * 35)}ms` }}>
                {letter}
              </span>
            ))}
          </span>
          <span className="splash-rule" />
        </div>
      )}
    </div>
  );
}
