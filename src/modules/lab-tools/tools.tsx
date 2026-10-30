import { useState, type ReactNode } from 'react';
import {
  A260_FACTORS,
  cellsPerMl,
  copyNumber,
  doublingTime,
  ligationInsert,
  massForMolarity,
  masterMix,
  molarityOf,
  nucleicAcidConc,
  percentVolumeVolume,
  percentWeightVolume,
  primerTm,
  proteinConc,
  purity,
  rcf,
  rpmFor,
  seedingVolume,
  serialDilution,
  solveDilution,
  viability,
  volumeForMolarity,
  type MixPart,
  type NucleicAcid,
} from './calc';
import { Answer, ChoiceField, Note, NumberField, useNumber, useUnit, type Output } from './fields';
import { RECIPES, scaleRecipe } from './recipes';
import { TimersTool } from './TimersTool';
import type { TimerStore } from './timers';
import {
  formatNumber,
  formatQuantity,
  fromBase,
  parseNumber,
  toBase,
  UNITS,
  type Kind,
} from './units';

export type Group = 'Solutions' | 'Molecular biology' | 'Cells and spinning' | 'Units and timers';

export interface Tool {
  id: string;
  group: Group;
  name: string;
  render: (out: Output, timers: TimerStore) => ReactNode;
}

// ---- Solutions ----

function Molarity({ out }: { out: Output }) {
  const [find, setFind] = useState<'mass' | 'conc' | 'volume'>('mass');
  const [mw, setMw] = useNumber();
  const [conc, setConc, concValue] = useNumber();
  const concUnit = useUnit('molar', 'M');
  const [vol, setVol, volValue] = useNumber();
  const volUnit = useUnit('volume', 'mL');
  const [mass, setMass, massValue] = useNumber();
  const massUnit = useUnit('mass', 'g');
  const w = parseNumber(mw);

  const molar = concValue === null ? null : toBase(concValue, 'molar', concUnit[0]);
  const litres = volValue === null ? null : toBase(volValue, 'volume', volUnit[0]);
  const grams = massValue === null ? null : toBase(massValue, 'mass', massUnit[0]);

  let answer: string | null = null;
  let label = '';
  if (find === 'mass' && molar !== null && litres !== null && w !== null) {
    const g = massForMolarity(molar, litres, w);
    label = 'Weigh out';
    answer =
      g === null
        ? null
        : `${formatQuantity(g, 'mass')} for ${formatQuantity(litres, 'volume')} of ${formatQuantity(molar, 'molar')} (MW ${formatNumber(w)} g/mol)`;
  } else if (find === 'conc' && grams !== null && litres !== null && w !== null) {
    const m = molarityOf(grams, litres, w);
    label = 'Concentration';
    answer =
      m === null
        ? null
        : `${formatQuantity(m, 'molar')} from ${formatQuantity(grams, 'mass')} in ${formatQuantity(litres, 'volume')}`;
  } else if (find === 'volume' && grams !== null && molar !== null && w !== null) {
    const l = volumeForMolarity(grams, molar, w);
    label = 'Make up to';
    answer =
      l === null
        ? null
        : `${formatQuantity(l, 'volume')} for ${formatQuantity(molar, 'molar')} from ${formatQuantity(grams, 'mass')}`;
  }

  return (
    <>
      <ChoiceField
        label="Find"
        value={find}
        options={[
          { value: 'mass', label: 'Mass to weigh' },
          { value: 'conc', label: 'Concentration' },
          { value: 'volume', label: 'Volume' },
        ]}
        onChange={setFind}
      />
      <NumberField
        label="Molecular weight"
        value={mw}
        onChange={setMw}
        suffix="g/mol"
        placeholder="58.44"
      />
      {find !== 'conc' && (
        <NumberField label="Concentration" value={conc} onChange={setConc} unit={concUnit} />
      )}
      {find !== 'volume' && (
        <NumberField label="Volume" value={vol} onChange={setVol} unit={volUnit} />
      )}
      {find !== 'mass' && (
        <NumberField label="Mass" value={mass} onChange={setMass} unit={massUnit} />
      )}
      <Answer out={out} label={label || 'Answer'} text={answer} />
    </>
  );
}

const CONC_LABELS = ['M', 'mM', 'µM', 'nM', 'mg/mL', 'µg/mL', 'ng/µL', '%', 'x'];

function Dilution({ out }: { out: Output }) {
  const [find, setFind] = useState<'v1' | 'c2' | 'v2' | 'c1'>('v1');
  const [concUnit, setConcUnit] = useState('mM');
  const [c1, setC1, c1v] = useNumber();
  const [v1, setV1, v1v] = useNumber();
  const v1Unit = useUnit('volume', 'µL');
  const [c2, setC2, c2v] = useNumber();
  const [v2, setV2, v2v] = useNumber();
  const v2Unit = useUnit('volume', 'mL');

  const solved = solveDilution({
    c1: find === 'c1' ? null : c1v,
    v1: find === 'v1' || v1v === null ? null : toBase(v1v, 'volume', v1Unit[0]),
    c2: find === 'c2' ? null : c2v,
    v2: find === 'v2' || v2v === null ? null : toBase(v2v, 'volume', v2Unit[0]),
  });
  const conc = (n: number) => `${formatNumber(n)} ${concUnit}`;
  let answer: string | null = null;
  if (solved !== null) {
    const stock = formatQuantity(solved.v1, 'volume');
    const diluent = formatQuantity(solved.v2 - solved.v1, 'volume');
    const total = formatQuantity(solved.v2, 'volume');
    answer =
      solved.v2 < solved.v1
        ? null
        : `${stock} of ${conc(solved.c1)} stock + ${diluent} diluent = ${total} at ${conc(solved.c2)}`;
  }

  return (
    <>
      <ChoiceField
        label="Find"
        value={find}
        options={[
          { value: 'v1', label: 'Volume of stock (V1)' },
          { value: 'c2', label: 'Final concentration (C2)' },
          { value: 'v2', label: 'Final volume (V2)' },
          { value: 'c1', label: 'Stock concentration (C1)' },
        ]}
        onChange={setFind}
      />
      <ChoiceField
        label="Concentration unit"
        value={concUnit}
        options={CONC_LABELS.map((l) => ({ value: l, label: l }))}
        onChange={setConcUnit}
      />
      {find !== 'c1' && (
        <NumberField label="Stock (C1)" value={c1} onChange={setC1} suffix={concUnit} />
      )}
      {find !== 'v1' && (
        <NumberField label="Stock volume (V1)" value={v1} onChange={setV1} unit={v1Unit} />
      )}
      {find !== 'c2' && (
        <NumberField label="Final (C2)" value={c2} onChange={setC2} suffix={concUnit} />
      )}
      {find !== 'v2' && (
        <NumberField label="Final volume (V2)" value={v2} onChange={setV2} unit={v2Unit} />
      )}
      <Answer out={out} label="Mix" text={answer} />
    </>
  );
}

function Serial({ out }: { out: Output }) {
  const [start, setStart, startV] = useNumber();
  const [concUnit, setConcUnit] = useState('µM');
  const [factor, setFactor, factorV] = useNumber('10');
  const [steps, setSteps, stepsV] = useNumber('6');
  const [vol, setVol, volV] = useNumber('1');
  const volUnit = useUnit('volume', 'mL');
  const result =
    startV !== null && factorV !== null && stepsV !== null && volV !== null
      ? serialDilution(startV, factorV, stepsV, toBase(volV, 'volume', volUnit[0]))
      : null;
  const lines =
    result === null
      ? null
      : [
          `Serial dilution 1:${formatNumber(factorV ?? 0)}: move ${formatQuantity(result.transfer, 'volume')} into ${formatQuantity(result.diluent, 'volume')} diluent each step.`,
          ...result.tubes.map(
            (t) => `Tube ${String(t.step)}: ${formatNumber(t.concentration)} ${concUnit}`,
          ),
        ];
  return (
    <>
      <NumberField label="Starting concentration" value={start} onChange={setStart} />
      <ChoiceField
        label="Unit"
        value={concUnit}
        options={CONC_LABELS.map((l) => ({ value: l, label: l }))}
        onChange={setConcUnit}
      />
      <NumberField label="Dilution factor" value={factor} onChange={setFactor} />
      <NumberField label="Number of tubes" value={steps} onChange={setSteps} />
      <NumberField label="Volume in each tube" value={vol} onChange={setVol} unit={volUnit} />
      <Answer out={out} label="Each step" text={lines?.join('\n') ?? null}>
        {result && (
          <>
            Move {formatQuantity(result.transfer, 'volume')} into{' '}
            {formatQuantity(result.diluent, 'volume')} diluent
            <ol className="lab-list">
              {result.tubes.map((t) => (
                <li key={t.step}>
                  {formatNumber(t.concentration)} {concUnit}
                </li>
              ))}
            </ol>
          </>
        )}
      </Answer>
    </>
  );
}

function Percent({ out }: { out: Output }) {
  const [kind, setKind] = useState<'wv' | 'vv'>('wv');
  const [pct, setPct, pctV] = useNumber();
  const [vol, setVol, volV] = useNumber();
  const volUnit = useUnit('volume', 'mL');
  const litres = volV === null ? null : toBase(volV, 'volume', volUnit[0]);
  let answer: string | null = null;
  if (pctV !== null && litres !== null) {
    const amount =
      kind === 'wv' ? percentWeightVolume(pctV, litres) : percentVolumeVolume(pctV, litres);
    if (amount !== null) {
      answer = `${formatQuantity(amount, kind === 'wv' ? 'mass' : 'volume')} in ${formatQuantity(litres, 'volume')} for ${formatNumber(pctV)}% ${kind === 'wv' ? 'w/v' : 'v/v'}`;
    }
  }
  return (
    <>
      <ChoiceField
        label="Kind"
        value={kind}
        options={[
          { value: 'wv', label: 'Weight in volume (w/v)' },
          { value: 'vv', label: 'Volume in volume (v/v)' },
        ]}
        onChange={setKind}
      />
      <NumberField label="Percentage" value={pct} onChange={setPct} suffix="%" />
      <NumberField label="Final volume" value={vol} onChange={setVol} unit={volUnit} />
      <Answer out={out} label={kind === 'wv' ? 'Weigh out' : 'Measure'} text={answer} />
      <Note>1% w/v is 1 g in 100 mL.</Note>
    </>
  );
}

function Recipes({ out }: { out: Output }) {
  const [id, setId] = useState(RECIPES[0]?.id ?? '');
  const recipe = RECIPES.find((r) => r.id === id) ?? RECIPES[0];
  const [vol, setVol, volV] = useNumber('1');
  const volUnit = useUnit('volume', 'L');
  const [strength, setStrength, strengthV] = useNumber(String(recipe?.strength ?? 1));
  if (!recipe) return null;
  const litres = volV === null ? null : toBase(volV, 'volume', volUnit[0]);
  const parts =
    litres !== null && strengthV !== null && strengthV > 0
      ? scaleRecipe(recipe, litres, strengthV)
      : null;
  const amount = (p: { amount: number; unit: 'g' | 'mL' }) =>
    p.unit === 'g' ? formatQuantity(p.amount, 'mass') : formatQuantity(p.amount / 1000, 'volume');
  const text =
    parts === null || litres === null
      ? null
      : [
          `${recipe.name} ${formatNumber(strengthV ?? 1)}x, ${formatQuantity(litres, 'volume')}:`,
          ...parts.map((p) => `- ${p.name}: ${amount(p)}`),
          `- Water to ${formatQuantity(litres, 'volume')}`,
        ].join('\n');
  return (
    <>
      <ChoiceField
        label="Recipe"
        value={recipe.id}
        options={RECIPES.map((r) => ({ value: r.id, label: `${r.name} (${String(r.strength)}x)` }))}
        onChange={(value) => {
          setId(value);
          setStrength(String(RECIPES.find((r) => r.id === value)?.strength ?? 1));
        }}
      />
      <NumberField label="Volume to make" value={vol} onChange={setVol} unit={volUnit} />
      <NumberField label="Strength" value={strength} onChange={setStrength} suffix="x" />
      <Answer out={out} label="Ingredients" text={text}>
        {parts && (
          <table className="lab-table">
            <tbody>
              {parts.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{amount(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Answer>
      <Note>{recipe.note}</Note>
    </>
  );
}

// ---- Molecular biology ----

const ACIDS: { value: NucleicAcid; label: string }[] = [
  { value: 'dsDNA', label: 'Double-stranded DNA' },
  { value: 'ssDNA', label: 'Single-stranded DNA' },
  { value: 'RNA', label: 'RNA' },
];

function NucleicConc({ out }: { out: Output }) {
  const [kind, setKind] = useState<NucleicAcid>('dsDNA');
  const [a260, setA260, a260V] = useNumber();
  const [dil, setDil, dilV] = useNumber('1');
  const [vol, setVol, volV] = useNumber();
  const conc = a260V !== null && dilV !== null ? nucleicAcidConc(a260V, kind, dilV) : null;
  const total = conc !== null && volV !== null ? conc * volV * 1e-9 : null;
  return (
    <>
      <ChoiceField label="Sample" value={kind} options={ACIDS} onChange={setKind} />
      <NumberField label="A260" value={a260} onChange={setA260} />
      <NumberField label="Dilution factor" value={dil} onChange={setDil} />
      <Answer
        out={out}
        label="Concentration"
        text={conc === null ? null : `${formatNumber(conc)} ng/µL ${kind}`}
      />
      <NumberField label="Volume (optional)" value={vol} onChange={setVol} suffix="µL" />
      {total !== null && volV !== null && (
        <Answer
          out={out}
          label="In all"
          text={`${formatQuantity(total, 'mass')} in ${formatNumber(volV)} µL`}
        />
      )}
      <Note>
        An A260 of 1 is {A260_FACTORS[kind]} ng/µL of {kind}, with a 1 cm path.
      </Note>
    </>
  );
}

function ProteinConc({ out }: { out: Output }) {
  const [a280, setA280, a280V] = useNumber();
  const [eps, setEps, epsV] = useNumber();
  const [mw, setMw, mwV] = useNumber();
  const [dil, setDil, dilV] = useNumber('1');
  const mgPerMl =
    a280V !== null && epsV !== null && mwV !== null && dilV !== null
      ? proteinConc(a280V, epsV, mwV, dilV)
      : null;
  const micromolar = mgPerMl !== null && mwV !== null ? (mgPerMl / mwV) * 1e6 : null;
  return (
    <>
      <NumberField label="A280" value={a280} onChange={setA280} />
      <NumberField
        label="Extinction coefficient"
        value={eps}
        onChange={setEps}
        suffix="M⁻¹ cm⁻¹"
        placeholder="43824"
      />
      <NumberField
        label="Molecular weight"
        value={mw}
        onChange={setMw}
        suffix="Da"
        placeholder="66430"
      />
      <NumberField label="Dilution factor" value={dil} onChange={setDil} />
      <Answer
        out={out}
        label="Concentration"
        text={
          mgPerMl === null || micromolar === null
            ? null
            : `${formatNumber(mgPerMl)} mg/mL (${formatNumber(micromolar)} µM)`
        }
      />
      <Note>Uses a 1 cm path. Without the coefficient, an A280 of 1 is roughly 1 mg/mL.</Note>
    </>
  );
}

const VERDICTS = {
  pure: 'Looks pure',
  protein: 'Low A260/A280: protein or phenol may be left',
  'salt or solvent': 'Low A260/A230: salt, guanidine or other solvent may be left',
  unusual: 'High A260/A280: check the blank, or RNA in a DNA sample',
} as const;

function Purity({ out }: { out: Output }) {
  const [kind, setKind] = useState<NucleicAcid>('dsDNA');
  const [a260, setA260, a260V] = useNumber();
  const [a280, setA280, a280V] = useNumber();
  const [a230, setA230, a230V] = useNumber();
  const result = a260V !== null && a280V !== null ? purity(a260V, a280V, a230V, kind) : null;
  const text =
    result === null || result.r280 === null
      ? null
      : [
          `A260/A280 ${formatNumber(result.r280, 3)}`,
          result.r230 === null ? null : `A260/A230 ${formatNumber(result.r230, 3)}`,
          result.verdicts.map((v) => VERDICTS[v]).join('; '),
        ]
          .filter((s) => s !== null)
          .join(', ');
  return (
    <>
      <ChoiceField label="Sample" value={kind} options={ACIDS} onChange={setKind} />
      <NumberField label="A260" value={a260} onChange={setA260} />
      <NumberField label="A280" value={a280} onChange={setA280} />
      <NumberField label="A230 (optional)" value={a230} onChange={setA230} />
      <Answer out={out} label="Ratios" text={text} />
      <Note>Pure DNA is about 1.8, pure RNA about 2.0; A260/A230 is about 2.0 to 2.2.</Note>
    </>
  );
}

function Ligation({ out }: { out: Output }) {
  const [vecNg, setVecNg, vecNgV] = useNumber('50');
  const [vecBp, setVecBp, vecBpV] = useNumber();
  const [insBp, setInsBp, insBpV] = useNumber();
  const [ratio, setRatio, ratioV] = useNumber('3');
  const ng =
    vecNgV !== null && vecBpV !== null && insBpV !== null && ratioV !== null
      ? ligationInsert(vecNgV, vecBpV, insBpV, ratioV)
      : null;
  return (
    <>
      <NumberField label="Vector" value={vecNg} onChange={setVecNg} suffix="ng" />
      <NumberField label="Vector length" value={vecBp} onChange={setVecBp} suffix="bp" />
      <NumberField label="Insert length" value={insBp} onChange={setInsBp} suffix="bp" />
      <NumberField label="Insert to vector ratio" value={ratio} onChange={setRatio} suffix=": 1" />
      <Answer
        out={out}
        label="Insert"
        text={
          ng === null || vecNgV === null || ratioV === null
            ? null
            : `${formatNumber(ng)} ng insert with ${formatNumber(vecNgV)} ng vector (${formatNumber(ratioV)}:1)`
        }
      />
    </>
  );
}

const PCR_PARTS: MixPart[] = [
  { name: '10x buffer', perReaction: 2.5 },
  { name: 'dNTPs (10 mM)', perReaction: 0.5 },
  { name: 'Forward primer (10 µM)', perReaction: 1.25 },
  { name: 'Reverse primer (10 µM)', perReaction: 1.25 },
  { name: 'Polymerase', perReaction: 0.25 },
  { name: 'Water', perReaction: 18.25 },
];

function Pcr({ out }: { out: Output }) {
  const [parts, setParts] = useState(PCR_PARTS.map((p) => ({ ...p, text: String(p.perReaction) })));
  const [reactions, setReactions, reactionsV] = useNumber('8');
  const [extra, setExtra, extraV] = useNumber('10');
  const valid = parts.map((p) => ({ name: p.name, perReaction: parseNumber(p.text) ?? 0 }));
  const mix = reactionsV === null ? null : masterMix(valid, reactionsV, (extraV ?? 0) / 100);
  const perReaction = valid.reduce((a, p) => a + p.perReaction, 0);
  const text =
    mix === null || reactionsV === null
      ? null
      : [
          `Master mix for ${formatNumber(reactionsV)} reactions (+${formatNumber(extraV ?? 0)}%):`,
          ...mix.map((m) => `- ${m.name}: ${formatNumber(m.total)} µL`),
          `Add ${formatNumber(perReaction, 3)} µL to each tube, then template.`,
        ].join('\n');
  return (
    <>
      <NumberField label="Reactions" value={reactions} onChange={setReactions} />
      <NumberField label="Extra for pipetting" value={extra} onChange={setExtra} suffix="%" />
      <table className="lab-table lab-mix">
        <thead>
          <tr>
            <th>Part</th>
            <th>µL each</th>
            <th>µL in mix</th>
            <th>
              <span className="visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p, i) => (
            <tr key={i}>
              <td>
                <input
                  aria-label={`Part ${String(i + 1)} name`}
                  value={p.name}
                  onChange={(e) => {
                    setParts(parts.map((q, j) => (j === i ? { ...q, name: e.target.value } : q)));
                  }}
                />
              </td>
              <td>
                <input
                  aria-label={`${p.name} µL each`}
                  inputMode="decimal"
                  value={p.text}
                  onChange={(e) => {
                    setParts(parts.map((q, j) => (j === i ? { ...q, text: e.target.value } : q)));
                  }}
                />
              </td>
              <td>{mix?.[i] ? formatNumber(mix[i].total) : '–'}</td>
              <td>
                <button
                  type="button"
                  className="quiet"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => {
                    setParts(parts.filter((_, j) => j !== i));
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          setParts([...parts, { name: 'Other', perReaction: 0, text: '' }]);
        }}
      >
        Add a part
      </button>
      <Answer out={out} label="Master mix" text={text}>
        {formatNumber(perReaction, 3)} µL in each tube
      </Answer>
    </>
  );
}

function Copies({ out }: { out: Output }) {
  const [kind, setKind] = useState<NucleicAcid>('dsDNA');
  const [ng, setNg, ngV] = useNumber();
  const [len, setLen, lenV] = useNumber();
  const copies = ngV !== null && lenV !== null ? copyNumber(ngV, lenV, kind) : null;
  return (
    <>
      <ChoiceField label="Molecule" value={kind} options={ACIDS} onChange={setKind} />
      <NumberField label="Amount" value={ng} onChange={setNg} suffix="ng" />
      <NumberField
        label="Length"
        value={len}
        onChange={setLen}
        suffix={kind === 'dsDNA' ? 'bp' : 'bases'}
      />
      <Answer
        out={out}
        label="Copies"
        text={copies === null ? null : `${formatNumber(copies, 3)} copies`}
      />
    </>
  );
}

function Tm({ out }: { out: Output }) {
  const [seq, setSeq] = useState('');
  const result = primerTm(seq);
  return (
    <>
      <div className="lab-field wide">
        <label htmlFor="lab-primer">Primer sequence</label>
        <input
          id="lab-primer"
          autoComplete="off"
          spellCheck={false}
          value={seq}
          placeholder="ATGCGTACGTTAGC"
          onChange={(e) => {
            setSeq(e.target.value);
          }}
        />
      </div>
      <Answer
        out={out}
        label="Primer"
        text={
          result === null
            ? null
            : `${String(result.length)} nt, GC ${formatNumber(result.gc * 100, 3)}%, Tm ${formatNumber(result.tm, 3)} °C`
        }
      />
      <Note>
        A rough guide: under 14 bases uses 2(A+T) + 4(G+C), longer uses 64.9 + 41(G+C − 16.4)/N.
        Check with your polymerase’s own calculator for annealing.
      </Note>
    </>
  );
}

// ---- Cells and spinning ----

function CellCount({ out }: { out: Output }) {
  const [counts, setCounts] = useState('');
  const [dil, setDil, dilV] = useNumber('2');
  const [dead, setDead, deadV] = useNumber();
  const [each, setEach, eachV] = useNumber();
  const [wells, setWells, wellsV] = useNumber('1');
  const numbers = counts
    .split(/[\s,;]+/)
    .map(parseNumber)
    .filter((n): n is number => n !== null);
  const perMl = dilV !== null ? cellsPerMl(numbers, dilV) : null;
  const live = numbers.reduce((a, b) => a + b, 0);
  const share = deadV !== null ? viability(live, deadV) : null;
  const ml =
    perMl !== null && eachV !== null && wellsV !== null
      ? seedingVolume(perMl, eachV, wellsV)
      : null;
  return (
    <>
      <div className="lab-field wide">
        <label htmlFor="lab-counts">Live cells in each large square</label>
        <input
          id="lab-counts"
          inputMode="decimal"
          autoComplete="off"
          value={counts}
          placeholder="52, 48, 61, 55"
          onChange={(e) => {
            setCounts(e.target.value);
          }}
        />
      </div>
      <NumberField label="Dilution factor" value={dil} onChange={setDil} />
      <NumberField label="Dead cells in all (optional)" value={dead} onChange={setDead} />
      <Answer
        out={out}
        label="Cells"
        text={
          perMl === null
            ? null
            : `${formatNumber(perMl, 3)} cells/mL` +
              (share === null ? '' : `, ${formatNumber(share * 100, 3)}% viable`)
        }
      />
      <h3 className="lab-subhead">Seeding</h3>
      <NumberField label="Cells in each well" value={each} onChange={setEach} />
      <NumberField label="Wells" value={wells} onChange={setWells} />
      <Answer
        out={out}
        label="Suspension"
        text={ml === null ? null : `${formatQuantity(ml / 1000, 'volume')} of cell suspension`}
      />
      <Note>Cells per mL = mean count per large square × dilution × 10⁴.</Note>
    </>
  );
}

function Spin({ out }: { out: Output }) {
  const [find, setFind] = useState<'g' | 'rpm'>('g');
  const [radius, setRadius, radiusV] = useNumber();
  const [speed, setSpeed, speedV] = useNumber();
  let text: string | null = null;
  if (radiusV !== null && speedV !== null) {
    const result = find === 'g' ? rcf(speedV, radiusV) : rpmFor(speedV, radiusV);
    if (result !== null) {
      text =
        find === 'g'
          ? `${formatNumber(speedV)} rpm = ${formatNumber(Math.round(result))} × g (radius ${formatNumber(radiusV)} cm)`
          : `${formatNumber(speedV)} × g = ${formatNumber(Math.round(result))} rpm (radius ${formatNumber(radiusV)} cm)`;
    }
  }
  return (
    <>
      <ChoiceField
        label="Find"
        value={find}
        options={[
          { value: 'g', label: 'g from rpm' },
          { value: 'rpm', label: 'rpm from g' },
        ]}
        onChange={setFind}
      />
      <NumberField label="Rotor radius" value={radius} onChange={setRadius} suffix="cm" />
      <NumberField
        label={find === 'g' ? 'Speed' : 'Force'}
        value={speed}
        onChange={setSpeed}
        suffix={find === 'g' ? 'rpm' : '× g'}
      />
      <Answer out={out} label="Speed" text={text} />
      <Note>
        g = 1.118 × 10⁻⁵ × radius (cm) × rpm². The radius is on the rotor or in its manual.
      </Note>
    </>
  );
}

function Doubling({ out }: { out: Output }) {
  const [n0, setN0, n0V] = useNumber();
  const [n, setN, nV] = useNumber();
  const [t, setT, tV] = useNumber();
  const tUnit = useUnit('time', 'h');
  const td = n0V !== null && nV !== null && tV !== null ? doublingTime(n0V, nV, tV) : null;
  return (
    <>
      <NumberField label="Count at the start" value={n0} onChange={setN0} />
      <NumberField label="Count at the end" value={n} onChange={setN} />
      <NumberField label="Time between" value={t} onChange={setT} unit={tUnit} />
      <Answer
        out={out}
        label="Doubling time"
        text={td === null ? null : `${formatNumber(td, 3)} ${tUnit[0]}`}
      />
    </>
  );
}

// ---- Units ----

const KINDS: { value: Kind | 'temp'; label: string }[] = [
  { value: 'mass', label: 'Mass' },
  { value: 'volume', label: 'Volume' },
  { value: 'molar', label: 'Molar concentration' },
  { value: 'massConc', label: 'Mass concentration' },
  { value: 'length', label: 'Length' },
  { value: 'time', label: 'Time' },
  { value: 'temp', label: 'Temperature' },
];

const TEMPS = ['°C', '°F', 'K'] as const;

export function convertTemperature(value: number, from: string, to: string): number {
  const c = from === '°F' ? ((value - 32) * 5) / 9 : from === 'K' ? value - 273.15 : value;
  return to === '°F' ? (c * 9) / 5 + 32 : to === 'K' ? c + 273.15 : c;
}

function Convert({ out }: { out: Output }) {
  const [kind, setKind] = useState<Kind | 'temp'>('volume');
  const labels: readonly string[] = kind === 'temp' ? TEMPS : UNITS[kind].map((u) => u.label);
  const [from, setFrom] = useState('mL');
  const [to, setTo] = useState('µL');
  const [value, setValue, valueV] = useNumber();
  const [mw, setMw, mwV] = useNumber();
  const fromLabel = labels.includes(from) ? from : (labels[0] ?? '');
  const toLabel = labels.includes(to) ? to : (labels[1] ?? labels[0] ?? '');
  const result =
    valueV === null
      ? null
      : kind === 'temp'
        ? convertTemperature(valueV, fromLabel, toLabel)
        : fromBase(toBase(valueV, kind, fromLabel), kind, toLabel);
  const molarFromMass =
    kind === 'massConc' && valueV !== null && mwV !== null && mwV > 0
      ? toBase(valueV, 'massConc', fromLabel) / mwV
      : null;
  const massFromMolar =
    kind === 'molar' && valueV !== null && mwV !== null
      ? toBase(valueV, 'molar', fromLabel) * mwV
      : null;
  return (
    <>
      <ChoiceField
        label="Quantity"
        value={kind}
        options={KINDS}
        onChange={(k) => {
          setKind(k);
          const next: readonly string[] = k === 'temp' ? TEMPS : UNITS[k].map((u) => u.label);
          setFrom(next[0] ?? '');
          setTo(next[1] ?? next[0] ?? '');
        }}
      />
      <NumberField label="Value" value={value} onChange={setValue} />
      <ChoiceField
        label="From"
        value={fromLabel}
        options={labels.map((l) => ({ value: l, label: l }))}
        onChange={setFrom}
      />
      <ChoiceField
        label="To"
        value={toLabel}
        options={labels.map((l) => ({ value: l, label: l }))}
        onChange={setTo}
      />
      <Answer
        out={out}
        label="Converted"
        text={
          result === null || valueV === null
            ? null
            : `${formatNumber(valueV)} ${fromLabel} = ${formatNumber(result)} ${toLabel}`
        }
      />
      {(kind === 'molar' || kind === 'massConc') && (
        <>
          <NumberField
            label="Molecular weight (to change between molar and mass)"
            value={mw}
            onChange={setMw}
            suffix="g/mol"
          />
          {molarFromMass !== null && (
            <Answer out={out} label="Molar" text={formatQuantity(molarFromMass, 'molar')} />
          )}
          {massFromMolar !== null && (
            <Answer
              out={out}
              label="Mass concentration"
              text={`${formatNumber(massFromMolar)} g/L (mg/mL)`}
            />
          )}
        </>
      )}
    </>
  );
}

export const TOOLS: readonly Tool[] = [
  {
    id: 'molarity',
    group: 'Solutions',
    name: 'Molarity and mass',
    render: (o) => <Molarity out={o} />,
  },
  {
    id: 'dilution',
    group: 'Solutions',
    name: 'Dilution (C1V1)',
    render: (o) => <Dilution out={o} />,
  },
  { id: 'serial', group: 'Solutions', name: 'Serial dilution', render: (o) => <Serial out={o} /> },
  {
    id: 'percent',
    group: 'Solutions',
    name: 'Percentage solutions',
    render: (o) => <Percent out={o} />,
  },
  {
    id: 'recipes',
    group: 'Solutions',
    name: 'Buffers and media',
    render: (o) => <Recipes out={o} />,
  },
  {
    id: 'nucleic',
    group: 'Molecular biology',
    name: 'DNA and RNA concentration',
    render: (o) => <NucleicConc out={o} />,
  },
  {
    id: 'protein',
    group: 'Molecular biology',
    name: 'Protein concentration',
    render: (o) => <ProteinConc out={o} />,
  },
  {
    id: 'purity',
    group: 'Molecular biology',
    name: 'Purity ratios',
    render: (o) => <Purity out={o} />,
  },
  {
    id: 'ligation',
    group: 'Molecular biology',
    name: 'Ligation',
    render: (o) => <Ligation out={o} />,
  },
  { id: 'pcr', group: 'Molecular biology', name: 'PCR master mix', render: (o) => <Pcr out={o} /> },
  {
    id: 'copies',
    group: 'Molecular biology',
    name: 'Copy number',
    render: (o) => <Copies out={o} />,
  },
  { id: 'tm', group: 'Molecular biology', name: 'Primer Tm', render: (o) => <Tm out={o} /> },
  {
    id: 'count',
    group: 'Cells and spinning',
    name: 'Cell count and seeding',
    render: (o) => <CellCount out={o} />,
  },
  { id: 'spin', group: 'Cells and spinning', name: 'rpm and g', render: (o) => <Spin out={o} /> },
  {
    id: 'doubling',
    group: 'Cells and spinning',
    name: 'Doubling time',
    render: (o) => <Doubling out={o} />,
  },
  {
    id: 'convert',
    group: 'Units and timers',
    name: 'Unit converter',
    render: (o) => <Convert out={o} />,
  },
  {
    id: 'timers',
    group: 'Units and timers',
    name: 'Timers and stopwatch',
    render: (_o, timers) => <TimersTool store={timers} />,
  },
];

export const GROUPS: readonly Group[] = [
  'Solutions',
  'Molecular biology',
  'Cells and spinning',
  'Units and timers',
];
