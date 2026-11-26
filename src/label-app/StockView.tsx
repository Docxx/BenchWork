/**
 * A fly stock as the phone shows it, after scanning its vial. What a person
 * at the fly bench needs first is the genotype, chromosome by chromosome, so
 * that is the thing the card is built around; then whether the stock is well
 * and when it is next due a flip. Everything else sits quietly below.
 */

export interface CardChromosome {
  name: string;
  copies: string[];
  plain: boolean;
}

export interface StockCard {
  code: string;
  name: string;
  genotype: string;
  chromosomes?: CardChromosome[];
  source: string;
  number: string;
  flybase: string;
  centre: { centre: string; url: string } | null;
  status: string;
  location: string;
  flipEvery: number | null;
  lastFlipped: string;
  notes: string;
  reference: string;
  referenceUrl: string | null;
  sent: string;
}

/** `2026-11-26` as `26 Nov 2026`; anything else as it is. */
function day(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** How a flip stands: the words, and whether it needs attention. */
function flip(stock: StockCard): { text: string; late: boolean } | null {
  if (stock.flipEvery === null || stock.lastFlipped === '') return null;
  const due = new Date(`${stock.lastFlipped}T12:00:00`);
  due.setDate(due.getDate() + stock.flipEvery);
  const days = Math.round((due.getTime() - Date.now()) / 86400000);
  if (days < 0)
    return { text: `Flip ${String(-days)} ${days === -1 ? 'day' : 'days'} late`, late: true };
  if (days === 0) return { text: 'Flip due today', late: true };
  if (days === 1) return { text: 'Flip tomorrow', late: false };
  return { text: `Flip in ${String(days)} days`, late: false };
}

/** Healthy, quarantine, weak or dead, as a colour the card can use. */
function tone(status: string): 'well' | 'watch' | 'gone' {
  if (/quarantine|weak/i.test(status)) return 'watch';
  if (/dead|lost/i.test(status)) return 'gone';
  return 'well';
}

/** The genotype laid out per chromosome, falling back to the plain string. */
function Genotype({ stock }: { stock: StockCard }) {
  const chromosomes = stock.chromosomes ?? [];
  if (chromosomes.length === 0) {
    return <p className="stock-genotype-plain">{stock.genotype}</p>;
  }
  return (
    <div className="stock-genotype" aria-label={`Genotype ${stock.genotype}`}>
      {chromosomes.map((c) => (
        <div key={c.name} className={c.plain ? 'stock-arm plain' : 'stock-arm'}>
          <span className="stock-arm-name" aria-hidden>
            {c.name}
          </span>
          <span className="stock-arm-copies">
            {c.copies.map((copy, i) => (
              <span key={i}>{copy}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StockView({
  code,
  stock,
  problem,
  onClose,
  onConnect,
}: {
  code: string;
  stock: StockCard | null;
  problem: string | null;
  onClose: () => void;
  /** Offered when this phone has not been connected to BenchWork yet. */
  onConnect?: (() => void) | null;
}) {
  const rows: [string, React.ReactNode][] = [];
  const due = stock ? flip(stock) : null;
  if (stock) {
    const add = (label: string, value: React.ReactNode, filled: boolean) => {
      if (filled) rows.push([label, value]);
    };
    add('Source', stock.source, stock.source !== '');
    add('Where it is', stock.location, stock.location !== '');
    add('Last flipped', day(stock.lastFlipped), stock.lastFlipped !== '');
    add(
      'Every',
      stock.flipEvery === null ? '' : `${String(stock.flipEvery)} days`,
      stock.flipEvery !== null,
    );
    add(
      'Reference',
      stock.referenceUrl !== null ? (
        <a href={stock.referenceUrl} target="_blank" rel="noreferrer">
          {stock.reference}
        </a>
      ) : (
        stock.reference
      ),
      stock.reference !== '',
    );
  }

  return (
    <section className="phone-stock" aria-label="Fly stock">
      <button type="button" className="stock-back" onClick={onClose}>
        Back to labels
      </button>
      {stock === null ? (
        <div className="stock-waiting">
          <p
            className={problem === null ? 'hint' : 'notice'}
            role={problem === null ? 'status' : 'alert'}
          >
            {problem ?? `Looking up ${code}…`}
          </p>
          {onConnect && (
            <button type="button" onClick={onConnect}>
              Connect to BenchWork
            </button>
          )}
        </div>
      ) : (
        <article className={`stock-card ${tone(stock.status)}`}>
          <h1>{stock.name}</h1>
          <Genotype stock={stock} />
          <div className="stock-state">
            <span className="stock-status">{stock.status}</span>
            {due && <span className={due.late ? 'stock-flip late' : 'stock-flip'}>{due.text}</span>}
          </div>
          {(stock.centre !== null || stock.flybase !== '') && (
            <div className="stock-links">
              {stock.centre !== null && (
                <a href={stock.centre.url} target="_blank" rel="noreferrer">
                  {stock.centre.centre} {stock.number}
                </a>
              )}
              {stock.flybase !== '' && (
                <a
                  href={`https://flybase.org/reports/${stock.flybase}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {stock.flybase}
                </a>
              )}
            </div>
          )}
          {rows.length > 0 && (
            <dl>
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {stock.notes !== '' && <p className="stock-notes">{stock.notes}</p>}
          <p className="stock-foot">
            {stock.code} · from BenchWork {day(stock.sent)}
          </p>
        </article>
      )}
    </section>
  );
}
