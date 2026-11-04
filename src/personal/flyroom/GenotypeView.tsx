import { alleles, formatPair, markerOf, parseGenotype, type Genotype } from './genetics';
import { useLook } from './look';

/**
 * A genotype drawn as chosen in Fly room: as flies are written on paper,
 * each chromosome's two copies one over the other, or on one line; and
 * optionally each chromosome in its own colour, with balancers marked.
 */
export function GenotypeView({
  genotype,
  compact = false,
}: {
  genotype: Genotype | string;
  compact?: boolean;
}) {
  const { look, markers } = useLook();
  const g = typeof genotype === 'string' ? parseGenotype(genotype) : genotype;
  const isBalancer = (copy: string) =>
    alleles(copy).some((a) => markerOf(a, markers)?.balancer === true);
  const copy = (text: string) => (
    <span className={look.colour && isBalancer(text) ? 'genotype-copy balancer' : 'genotype-copy'}>
      {text}
    </span>
  );
  const classes = [
    'genotype',
    compact ? 'compact' : '',
    look.genotypes === 'line' ? 'line' : '',
    look.colour ? 'coloured' : '',
  ].filter((c) => c !== '');

  return (
    <span className={classes.join(' ')} aria-label={g.map(formatPair).join(' ; ')} role="img">
      {g.map((pair, i) => (
        <span key={i} className={`genotype-part chr-${String(i)}`}>
          {i > 0 && <span className="genotype-sep">;</span>}
          {pair[0] === pair[1] ? (
            <span className="genotype-one">{copy(pair[0])}</span>
          ) : look.genotypes === 'line' ? (
            <span className="genotype-one">
              {copy(pair[0])}/{copy(pair[1])}
            </span>
          ) : (
            <span className="genotype-pair">
              {copy(pair[0])}
              {copy(pair[1])}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
