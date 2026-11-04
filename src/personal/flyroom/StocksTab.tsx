import { useRef, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { CHROMOSOMES, formatPair, parseGenotype } from './genetics';
import { GenotypeView } from './GenotypeView';
import { STOCK_STATUSES, stocksFromCsv, type Stock } from './records';
import { addDays } from './schedule';
import { today, useFly, type FlyStore } from './store';

/** A date as people read it. */
export function dayLabel(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** When a stock is next due to be flipped; null if it is not flipped. */
export function nextFlip(stock: Stock): string | null {
  if (stock.flipEvery === null) return null;
  return stock.lastFlipped === '' ? today() : addDays(stock.lastFlipped, stock.flipEvery);
}

/** A text box that saves when it loses focus or Enter is pressed. */
function Saved({
  label,
  value,
  onSave,
  type = 'text',
  hint,
  long = false,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  type?: 'text' | 'date' | 'number';
  hint?: string;
  long?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // A new value from outside (another device, another field) replaces the draft.
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft.trim() !== value) onSave(draft.trim());
  };
  const props = {
    'aria-label': label,
    placeholder: hint,
    value: draft,
    onBlur: commit,
  };
  return (
    <label className="fly-field">
      <span className="label">{label}</span>
      {long ? (
        <textarea
          {...props}
          rows={3}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
      ) : (
        <input
          {...props}
          type={type}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      )}
    </label>
  );
}

/** Editing one stock: its genotype chromosome by chromosome, and the rest. */
export function StockEditor({
  ctx,
  store,
  stock,
  onPlan,
}: {
  ctx: ModuleContext;
  store: FlyStore;
  stock: Stock;
  onPlan: (stock: Stock, as: 'mother' | 'father') => void;
}) {
  const pairs = parseGenotype(stock.genotype);
  const save = (key: string, value: unknown) =>
    void store.update(stock.path, { [key]: value === '' ? null : value });
  const saveChromosome = (i: number, text: string) => {
    const parts = pairs.map(formatPair);
    parts[i] = text === '' ? '+' : text;
    save('genotype', parts.join(' ; '));
  };
  const next = nextFlip(stock);

  return (
    <section className="fly-editor" aria-label={`Stock ${stock.name}`}>
      <div className="fly-editor-head">
        <h3>{stock.name}</h3>
        <GenotypeView genotype={stock.genotype} />
        <span className="fly-spacer" />
        <button
          type="button"
          className="quiet"
          onClick={() => {
            onPlan(stock, 'mother');
          }}
        >
          Cross as virgins
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            onPlan(stock, 'father');
          }}
        >
          Cross as males
        </button>
        <button type="button" className="quiet" onClick={() => void ctx.app.open(stock.path)}>
          Open file
        </button>
      </div>
      <p className="hint">
        A slash separates a chromosome&apos;s two copies, as in Sco/CyO; one entry means both are
        the same.
      </p>
      <div className="fly-chromosomes">
        {CHROMOSOMES.map((c, i) => (
          <Saved
            key={c}
            label={c === 'X' ? 'X chromosome' : `Chromosome ${c}`}
            value={formatPair(pairs[i] ?? ['+', '+'])}
            onSave={(v) => {
              saveChromosome(i, v);
            }}
          />
        ))}
      </div>
      <div className="fly-fields">
        <Saved
          label="Source"
          value={stock.source}
          hint="Bloomington"
          onSave={(v) => {
            save('source', v);
          }}
        />
        <Saved
          label="Stock number"
          value={stock.number}
          hint="5905"
          onSave={(v) => {
            save('number', v);
          }}
        />
        <Saved
          label="Where it is"
          value={stock.location}
          hint="25 °C rack B"
          onSave={(v) => {
            save('location', v);
          }}
        />
        <label className="fly-field">
          <span className="label">Status</span>
          <select
            aria-label="Status"
            value={stock.status}
            onChange={(e) => {
              save('status', e.target.value);
            }}
          >
            {STOCK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <Saved
          label="Established"
          type="date"
          value={stock.established}
          onSave={(v) => {
            save('established', v);
          }}
        />
        <Saved
          label="Lethal in two copies"
          value={stock.lethal.join('; ')}
          hint="Myd88[KO]; l(2)x"
          onSave={(v) => {
            save(
              'lethal',
              v === ''
                ? ''
                : v
                    .split(/[;,]/)
                    .map((x) => x.trim())
                    .filter(Boolean),
            );
          }}
        />
        <Saved
          label="Flip every (days)"
          type="number"
          value={stock.flipEvery === null ? '' : String(stock.flipEvery)}
          hint="14"
          onSave={(v) => {
            save('flipEvery', v === '' ? '' : Number(v));
          }}
        />
        <Saved
          label="Last flipped"
          type="date"
          value={stock.lastFlipped}
          onSave={(v) => {
            save('lastFlipped', v);
          }}
        />
      </div>
      {next !== null && (
        <p className="flip-line">
          Next flip {dayLabel(next)}{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              save('lastFlipped', today());
            }}
          >
            Flipped today
          </button>
        </p>
      )}
      <Saved
        label="Notes"
        long
        value={stock.notes}
        onSave={(v) => {
          save('notes', v);
        }}
      />
    </section>
  );
}

/** Stocks from a CSV file, such as an export from another stock list. */
function ImportButton({ store }: { store: FlyStore }) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="quiet" onClick={() => input.current?.click()}>
        Import CSV
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        aria-label="CSV file of stocks"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void file.text().then(async (text) => {
            const found = stocksFromCsv(text);
            if (found.length === 0) {
              setNote('No stocks found in that file. It needs a Name or Genotype column.');
              return;
            }
            const { added, skipped } = await store.importStocks(found);
            setNote(
              `${String(added)} stocks added${skipped > 0 ? `, ${String(skipped)} already here and left as they were` : ''}.`,
            );
          });
        }}
      />
      {note !== null && (
        <p className="hint fly-note" role="status">
          {note}
        </p>
      )}
    </>
  );
}

/** The stock list: search, status filter, and one stock open for editing. */
export function StocksTab({
  ctx,
  store,
  onPlan,
}: {
  ctx: ModuleContext;
  store: FlyStore;
  onPlan: (stock: Stock, as: 'mother' | 'father') => void;
}) {
  const { stocks, loaded } = useFly(store);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const day = today();
  const shown = stocks.filter(
    (s) =>
      (status === 'All' || s.status === status) &&
      (q === '' ||
        `${s.name} ${s.genotype} ${s.source} ${s.number} ${s.location} ${s.notes}`
          .toLowerCase()
          .includes(q)),
  );
  const current = stocks.find((s) => s.path === open) ?? null;

  const create = async () => {
    const name = await ctx.app.askText({ title: 'New stock', label: 'Name' });
    if (name === null || name.trim() === '') return;
    const path = await store.createStock(name.trim(), {
      genotype: '+ ; + ; + ; +',
      status: 'Healthy',
      established: today(),
    });
    setOpen(path);
  };

  if (!loaded) return <p className="hint">Reading…</p>;
  return (
    <section aria-label="Stocks">
      <div className="fly-bar">
        <input
          type="search"
          aria-label="Find stocks"
          placeholder="Find stocks, genotypes, sources"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <select
          aria-label="Show"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
          }}
        >
          <option>All</option>
          {STOCK_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="button" onClick={() => void create()}>
          New stock
        </button>
        <ImportButton store={store} />
      </div>
      {current && <StockEditor ctx={ctx} store={store} stock={current} onPlan={onPlan} />}
      {shown.length === 0 ? (
        <p className="hint">
          {stocks.length === 0 ? 'No stocks yet. Add one, or import a CSV.' : 'Nothing matches.'}
        </p>
      ) : (
        <div className="fly-scroll">
          <table className="fly-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Genotype</th>
                <th>Source</th>
                <th>Where</th>
                <th>Status</th>
                <th>Next flip</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const next = nextFlip(s);
                return (
                  <tr key={s.path} aria-selected={s.path === open}>
                    <td>
                      <button
                        type="button"
                        className="fly-name"
                        aria-expanded={s.path === open}
                        onClick={() => {
                          setOpen(s.path === open ? null : s.path);
                        }}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td>
                      <GenotypeView genotype={s.genotype} compact />
                    </td>
                    <td>
                      {s.source}
                      {s.number !== '' && <span className="hint"> {s.number}</span>}
                    </td>
                    <td>{s.location}</td>
                    <td>
                      <span className={`fly-status ${s.status.toLowerCase()}`}>{s.status}</span>
                    </td>
                    <td>
                      {next === null ? (
                        ''
                      ) : (
                        <span className={next <= day ? 'flip-due late' : 'flip-due'}>
                          {dayLabel(next)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
