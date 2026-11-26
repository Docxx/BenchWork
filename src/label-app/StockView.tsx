/** A fly stock as the phone shows it, after scanning its vial. */

export interface StockCard {
  code: string;
  name: string;
  genotype: string;
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

function nextFlip(stock: StockCard): string | null {
  if (stock.flipEvery === null || stock.lastFlipped === '') return null;
  const due = new Date(`${stock.lastFlipped}T12:00:00`);
  due.setDate(due.getDate() + stock.flipEvery);
  const days = Math.round((due.getTime() - Date.now()) / 86400000);
  const when = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (days < 0) return `${when}, ${String(-days)} ${days === -1 ? 'day' : 'days'} late`;
  if (days === 0) return `${when}, today`;
  return `${when}, in ${String(days)} ${days === 1 ? 'day' : 'days'}`;
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
  if (stock) {
    const add = (label: string, value: React.ReactNode, filled: boolean) => {
      if (filled) rows.push([label, value]);
    };
    add('Source', stock.source, stock.source !== '');
    add(
      'Stock number',
      stock.centre ? (
        <a href={stock.centre.url} target="_blank" rel="noreferrer">
          {stock.centre.centre} {stock.number}
        </a>
      ) : (
        stock.number
      ),
      stock.number !== '',
    );
    add(
      'FlyBase',
      stock.flybase !== '' ? (
        <a href={`https://flybase.org/reports/${stock.flybase}`} target="_blank" rel="noreferrer">
          {stock.flybase}
        </a>
      ) : (
        ''
      ),
      stock.flybase !== '',
    );
    add('Status', stock.status, stock.status !== '');
    add('Where it is', stock.location, stock.location !== '');
    add('Next flip', nextFlip(stock), nextFlip(stock) !== null);
    add('Last flipped', day(stock.lastFlipped), stock.lastFlipped !== '');
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
      <header>
        <button type="button" onClick={onClose}>
          Back to labels
        </button>
      </header>
      {stock === null ? (
        <p
          className={problem === null ? 'hint' : 'notice'}
          role={problem === null ? 'status' : 'alert'}
        >
          {problem ?? `Looking up ${code}…`}
          {onConnect && (
            <button type="button" onClick={onConnect}>
              Connect to BenchWork
            </button>
          )}
        </p>
      ) : (
        <>
          <h1>{stock.name}</h1>
          <p className="phone-genotype">{stock.genotype}</p>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {stock.notes !== '' && <p className="phone-notes">{stock.notes}</p>}
          <p className="hint">
            Code {stock.code} · sent from BenchWork on {day(stock.sent)}
          </p>
        </>
      )}
    </section>
  );
}
