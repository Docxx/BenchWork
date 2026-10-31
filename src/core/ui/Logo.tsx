/**
 * BenchWork's mark: a bold B whose lower bowl is filled like a flask, with
 * bubbles rising. In the app it takes the theme's colours; the app icon
 * (src-tauri/icons, made from logo.svg) keeps one fixed set.
 */

/** The B's outline, in a 128 square. */
export const LOGO_B =
  'M38 24 L74 24 Q96 24 96 45 Q96 59 83 63 Q104 67 104 85 Q104 104 80 104 L38 104 Z M38 64 L77 64';
/** The liquid in the lower bowl, with a wave on top. */
export const LOGO_LIQUID = 'M41 80 Q51 74 61 78 T82 77 Q101 78 101 87 Q101 101 80 101 L41 101 Z';
/** Bubbles: x, y, radius. */
export const LOGO_BUBBLES: readonly (readonly [number, number, number])[] = [
  [60, 89, 4.5],
  [75, 85, 3.2],
  [67, 80, 2.2],
];

export function Logo({
  size = 32,
  className,
  tile = true,
}: {
  size?: number;
  className?: string;
  /** Drawn on its rounded tile, as an app icon; without it, just the B. */
  tile?: boolean;
}) {
  return (
    <svg
      className={['logo', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
    >
      {tile && <rect className="logo-tile" width="128" height="128" rx="30" />}
      <path className="logo-liquid" d={LOGO_LIQUID} />
      {LOGO_BUBBLES.map(([x, y, r]) => (
        <circle key={`${String(x)} ${String(y)}`} className="logo-bubble" cx={x} cy={y} r={r} />
      ))}
      <path className="logo-b" d={LOGO_B} />
    </svg>
  );
}
