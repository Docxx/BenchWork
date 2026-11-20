import type { ModuleContext } from '@core/api';
import type { Reference } from './library';
import { useEvidence, FigureImage } from './EvidenceShelf';

export function PaperComparison({
  ctx,
  references,
}: {
  ctx: ModuleContext;
  references: Reference[];
}) {
  const { entries, error } = useEvidence(ctx);
  return (
    <section aria-label="Paper comparison" className="paper-comparison">
      {error && <p role="alert">{error}</p>}
      {references.map((ref) => {
        const rows = entries.filter((e) => e.citekey === ref.key);
        return (
          <article key={ref.key}>
            <h3>{ref.title || ref.key}</h3>
            {rows.length === 0 && <p>No findings or figures linked to this reference yet.</p>}
            {rows.map((e) => (
              <section key={e.path}>
                {e.finding && <strong>{e.finding}</strong>}
                {e.figure && <FigureImage ctx={ctx} path={e.figure} />}
                <blockquote>{e.excerpt}</blockquote>
                {e.comment && <p>{e.comment}</p>}
                <button onClick={() => void ctx.app.open(e.source, { heading: e.heading })}>
                  Open source · p. {e.heading.slice(5).split('&')[0]}
                </button>
              </section>
            ))}
          </article>
        );
      })}
    </section>
  );
}
