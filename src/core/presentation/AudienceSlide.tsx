import type { CSSProperties } from 'react';
import type { AudienceFrame } from '../platform/types';
import './slide.css';
/** Public content only. This component has no access to the app store or lesson notes. */
export function AudienceSlide({ frame }: { frame: AudienceFrame }) {
  const fontSize = frame.body.length > 1800 ? 16 : frame.body.length > 900 ? 22 : 30;
  return (
    <div
      className="audience-slide"
      aria-label="Audience slide"
      style={
        {
          background: frame.background,
          color: frame.foreground,
          '--slide-accent': frame.accent,
          '--slide-font-size': String(fontSize),
        } as CSSProperties
      }
    >
      {!frame.blank && (
        <>
          {frame.image ? (
            <img className="audience-image" src={frame.image} alt={frame.title} draggable={false} />
          ) : (
            <div className="audience-text">
              <div className="audience-rule" />
              <h1>{frame.title}</h1>
              <div className="audience-body">{frame.body}</div>
            </div>
          )}
          <svg className="audience-annotations" viewBox="0 0 1000 562.5" aria-hidden="true">
            {frame.strokes.map((s, i) => (
              <polyline
                key={i}
                points={s.points.map(([x, y]) => `${String(x)},${String(y)}`).join(' ')}
                stroke={s.colour}
                strokeWidth={s.width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </>
      )}
    </div>
  );
}
