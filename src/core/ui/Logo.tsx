import artwork from './brand/open-record.json';

/** Open Record: one shared drawing for the UI and generated platform icons. */

export function Logo({
  size = 32,
  className,
  tile = true,
  monochrome = false,
}: {
  size?: number;
  className?: string;
  /** Drawn on its navy tile, or as a transparent mark. */
  tile?: boolean;
  /** Uses currentColor for documents or contexts with only one ink. */
  monochrome?: boolean;
}) {
  return (
    <svg
      className={['logo', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
      focusable="false"
      data-brand="open-record"
    >
      {tile && <rect width="128" height="128" rx="28" fill={artwork.background} />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d={artwork.cover}
          stroke={monochrome ? 'currentColor' : artwork.blue}
          strokeWidth="6"
        />
        <path
          d={artwork.pages}
          stroke={monochrome ? 'currentColor' : artwork.blue}
          strokeWidth="6"
        />
        <path
          className="logo-writing"
          d={artwork.lines}
          stroke={monochrome ? 'currentColor' : artwork.writing}
          strokeWidth="4"
          pathLength="1"
        />
        <path
          className="logo-trace"
          d={artwork.trace}
          stroke={monochrome ? 'currentColor' : artwork.magenta}
          strokeWidth="4.5"
          pathLength="1"
        />
      </g>
    </svg>
  );
}
