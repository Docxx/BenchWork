import { useState } from 'react';
import {
  cross,
  formatGenotype,
  parseGenotype,
  percent,
  CHROMOSOMES,
  type Progeny,
} from './genetics';
import { GenotypeView } from './GenotypeView';
import { useFly, today, type FlyStore } from './store';

/** One parent: a stock, or a genotype typed in. */
export interface Parent {
  /** The stock's name, or null when typed in. */
  stock: string | null;
  genotype: string;
}

export interface Plan {
  mother: Parent;
  father: Parent;
  /** The cross the mother or father came from, for a family tree. */
  parent: string | null;
}

export function emptyPlan(): Plan {
  return {
    mother: { stock: null, genotype: '' },
    father: { stock: null, genotype: '' },
    parent: null,
  };
}

function ParentPicker({
  store,
  label,
  value,
  onChange,
}: {
  store: FlyStore;
  label: string;
  value: Parent;
  onChange: (p: Parent) => void;
}) {
  const { stocks } = useFly(store);
  const id = label.toLowerCase().replace(/\W+/g, '-');
  return (
    <fieldset className="fly-parent">
      <legend>{label}</legend>
      <select
        aria-label={`${label} stock`}
        value={value.stock ?? ''}
        onChange={(e) => {
          const s = stocks.find((x) => x.name === e.target.value);
          onChange(
            s ? { stock: s.name, genotype: s.genotype } : { stock: null, genotype: value.genotype },
          );
        }}
      >
        <option value="">Typed in</option>
        {stocks.map((s) => (
          <option key={s.path} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        id={id}
        aria-label={`${label} genotype`}
        className="fly-genotype-input"
        placeholder="w ; Sco/CyO ; TM3/TM6 ; +"
        value={value.genotype}
        onChange={(e) => {
          onChange({ stock: null, genotype: e.target.value });
        }}
      />
      {value.genotype.trim() !== '' && <GenotypeView genotype={value.genotype} />}
    </fieldset>
  );
}

function sortBy(p: Progeny, all: readonly Progeny[]): string {
  // Markers this kind lacks but others show: what to sort away from.
  const others = new Set(all.flatMap((x) => x.markers));
  const lacks = [...others].filter((m) => !p.markers.includes(m));
  const shows = p.markers.length > 0 ? p.markers.join(', ') : 'no markers';
  return lacks.length > 0 ? `${shows}; not ${lacks.join(', ')}` : shows;
}

/**
 * The cross planner: two parents, and every kind of progeny they give,
 * with its share, the markers to sort it by, and whether it is free of
 * balancers. A kind can become the next cross's parent, or a new stock.
 */
export function PlannerTab({
  store,
  plan,
  onPlan,
  onTracked,
}: {
  store: FlyStore;
  plan: Plan;
  onPlan: (plan: Plan) => void;
  onTracked: (path: string) => void;
}) {
  const { stocks, settings } = useFly(store);
  const [view, setView] = useState<'flies' | 'chromosomes'>('flies');
  const [note, setNote] = useState<string | null>(null);
  const ready = plan.mother.genotype.trim() !== '' && plan.father.genotype.trim() !== '';
  const lethal = [plan.mother.stock, plan.father.stock].flatMap(
    (name) => stocks.find((s) => s.name === name)?.lethal ?? [],
  );
  const mother = parseGenotype(plan.mother.genotype);
  const father = parseGenotype(plan.father.genotype);
  const result = ready ? cross(mother, father, { markers: settings.markers, lethal }) : null;

  const track = async (wanted: Progeny | null) => {
    const name = `${plan.mother.stock ?? 'Virgins'} × ${plan.father.stock ?? 'males'}`;
    const path = await store.createCross(name, {
      mother: plan.mother.stock === null ? '' : `[[${plan.mother.stock}]]`,
      motherGenotype: formatGenotype(mother),
      father: plan.father.stock === null ? '' : `[[${plan.father.stock}]]`,
      fatherGenotype: formatGenotype(father),
      setUp: today(),
      temperature: 25,
      status: 'Set up',
      ...(plan.parent === null ? {} : { parent: `[[${plan.parent}]]` }),
      ...(wanted === null ? {} : { wanted: formatGenotype(wanted.genotype) }),
    });
    onTracked(path);
  };

  const makeStock = async (p: Progeny) => {
    const genotype = formatGenotype(p.genotype).replace(/\/Y(?= ;)/, '');
    const path = await store.createStock(genotype, {
      genotype,
      status: 'Healthy',
      established: today(),
    });
    setNote(
      `Saved as a new stock: ${
        path
          .split('/')
          .at(-1)
          ?.replace(/\.flystock\.yaml$/, '') ?? ''
      }.`,
    );
  };

  const nextCross = (p: Progeny) => {
    const genotype = formatGenotype(p.genotype).replace(/\/Y(?= ;)/, '');
    const as: Parent = { stock: null, genotype };
    onPlan(
      p.sex === 'female'
        ? { mother: as, father: { stock: null, genotype: '' }, parent: null }
        : { mother: { stock: null, genotype: '' }, father: as, parent: null },
    );
    setNote(`Now choose the other parent for these ${p.sex === 'female' ? 'virgins' : 'males'}.`);
  };

  return (
    <section aria-label="Cross planner" className="fly-planner">
      <div className="fly-parents">
        <ParentPicker
          store={store}
          label="Virgin females"
          value={plan.mother}
          onChange={(mother) => {
            onPlan({ ...plan, mother });
          }}
        />
        <button
          type="button"
          className="quiet fly-swap"
          aria-label="Swap parents"
          title="Swap parents"
          onClick={() => {
            onPlan({ ...plan, mother: plan.father, father: plan.mother });
          }}
        >
          ⇄
        </button>
        <ParentPicker
          store={store}
          label="Males"
          value={plan.father}
          onChange={(father) => {
            onPlan({ ...plan, father });
          }}
        />
      </div>
      <p className="hint">
        Write chromosomes in order, X ; 2 ; 3 ; 4, with a slash between the two copies. Alleles on
        the same copy go together, separated by spaces or commas.
      </p>
      {note !== null && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
      {result === null ? (
        <p className="hint">Choose both parents to see their progeny.</p>
      ) : (
        <>
          <div className="fly-bar">
            <div className="ribbon-tabs" role="tablist" aria-label="Show progeny as">
              {(
                [
                  ['flies', 'Flies'],
                  ['chromosomes', 'Chromosomes'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => {
                    setView(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="fly-spacer" />
            <button type="button" onClick={() => void track(null)}>
              Set up this cross
            </button>
          </div>
          {result.notes.map((n) => (
            <p key={n} className="notice">
              {n}
            </p>
          ))}
          {view === 'flies' ? (
            <div className="fly-scroll">
              <table className="fly-table" aria-label="Progeny">
                <thead>
                  <tr>
                    <th>Sex</th>
                    <th>Genotype</th>
                    <th>Share</th>
                    <th>Sort by</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {result.progeny.map((p) => (
                    <tr
                      key={`${p.sex} ${formatGenotype(p.genotype)}`}
                      className={p.balanced ? '' : 'fly-target'}
                    >
                      <td>{p.sex === 'female' ? '♀' : '♂'}</td>
                      <td>
                        <GenotypeView genotype={p.genotype} compact />
                        {!p.balanced && <span className="fly-tag">No balancer</span>}
                      </td>
                      <td>{percent(p.share)}</td>
                      <td>{sortBy(p, result.progeny)}</td>
                      <td className="fly-actions">
                        <button type="button" className="quiet" onClick={() => void track(p)}>
                          Track for these
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            nextCross(p);
                          }}
                        >
                          Cross on
                        </button>
                        <button type="button" className="quiet" onClick={() => void makeStock(p)}>
                          Make a stock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ChromosomeView mother={plan.mother.genotype} father={plan.father.genotype} />
          )}
          {result.dead.length > 0 && (
            <details className="fly-dead">
              <summary>
                {String(result.dead.length)} kinds do not survive (
                {percent(result.dead.reduce((s, d) => s + d.share, 0))} of eggs)
              </summary>
              <ul>
                {result.dead.map((d) => (
                  <li key={`${d.sex} ${formatGenotype(d.genotype)}`}>
                    {d.sex === 'female' ? '♀' : '♂'} <GenotypeView genotype={d.genotype} compact />{' '}
                    <span className="hint">{d.why}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** Each chromosome on its own: the four ways its copies can combine. */
function ChromosomeView({ mother, father }: { mother: string; father: string }) {
  const m = parseGenotype(mother);
  const f = parseGenotype(father);
  return (
    <div className="fly-chromosome-view">
      {CHROMOSOMES.map((c, i) => {
        const mp = m[i] ?? ['+', '+'];
        const fp = f[i] ?? ['+', '+'];
        const fatherCopies = i === 0 ? [fp[0], 'Y'] : [fp[0], fp[1]];
        return (
          <table key={c} className="fly-punnett" aria-label={`Chromosome ${c}`}>
            <caption>{c === 'X' ? 'X' : `Chromosome ${c}`}</caption>
            <thead>
              <tr>
                <th>♀ \ ♂</th>
                {fatherCopies.map((x, j) => (
                  <th key={j}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mp.map((a, j) => (
                <tr key={j}>
                  <th>{a}</th>
                  {fatherCopies.map((b, k) => (
                    <td key={k}>{a === b ? a : `${a}/${b}`}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
