import { formatPair, parseGenotype, type Genotype } from './genetics';

/**
 * A genotype drawn as flies are written on paper: each chromosome's two
 * copies one over the other, with semicolons between chromosomes, and one
 * line for a chromosome whose copies are the same.
 */
export function GenotypeView({
  genotype,
  compact = false,
}: {
  genotype: Genotype | string;
  compact?: boolean;
}) {
  const g = typeof genotype === 'string' ? parseGenotype(genotype) : genotype;
  return (
    <span
      className={compact ? 'genotype compact' : 'genotype'}
      aria-label={g.map(formatPair).join(' ; ')}
      role="img"
    >
      {g.map((pair, i) => (
        <span key={i} className="genotype-part">
          {i > 0 && <span className="genotype-sep">;</span>}
          {pair[0] === pair[1] ? (
            <span className="genotype-one">{pair[0]}</span>
          ) : (
            <span className="genotype-pair">
              <span>{pair[0]}</span>
              <span>{pair[1]}</span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
