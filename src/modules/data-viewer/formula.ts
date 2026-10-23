/**
 * Simple spreadsheet formulas: `=A1*2`, `=(B2+B3)/2`, `=SUM(A1:A10)` and
 * the common statistics. Enough for quick sums and means on lab data; not
 * a full spreadsheet language. Errors show as `#VALUE!`, `#REF!`, `#DIV/0!`,
 * `#NAME?` or `#CYCLE!`, as in Excel.
 */

export type CellValue = number | string;

const ERRORS = ['#VALUE!', '#REF!', '#DIV/0!', '#NAME?', '#CYCLE!', '#ERROR!'] as const;
export type FormulaError = (typeof ERRORS)[number];

export function isError(value: CellValue): value is FormulaError {
  return typeof value === 'string' && (ERRORS as readonly string[]).includes(value);
}

/** `A` is 0, `Z` 25, `AA` 26. */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 0 is `A`, 26 is `AA`. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** A number as typed in a cell, or null if it is text. */
export function asNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  return Number(t);
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ref'; row: number; col: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string };

function isOp(t: Token | undefined, value: string): boolean {
  return t?.kind === 'op' && t.value === value;
}

class FormulaFail extends Error {
  constructor(readonly code: FormulaError) {
    super(code);
  }
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(rest);
    if (num) {
      tokens.push({ kind: 'num', value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const ref = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})(?![A-Za-z0-9_(])/.exec(rest);
    if (ref) {
      tokens.push({
        kind: 'ref',
        col: columnIndex(ref[1] ?? 'A'),
        row: Number(ref[2]) - 1,
      });
      i += ref[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (name) {
      tokens.push({ kind: 'name', value: name[0].toUpperCase() });
      i += name[0].length;
      continue;
    }
    const str = /^"((?:[^"]|"")*)"/.exec(rest);
    if (str) {
      tokens.push({ kind: 'str', value: (str[1] ?? '').replace(/""/g, '"') });
      i += str[0].length;
      continue;
    }
    const ch = rest[0] ?? '';
    if ('+-*/^(),:;'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch === ';' ? ',' : ch });
      i += 1;
      continue;
    }
    throw new FormulaFail('#ERROR!');
  }
  return tokens;
}

/** A value inside a formula: one value, or a range's values in order. */
type Operand = CellValue | CellValue[];

function stats(name: string, values: number[]): number {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  switch (name) {
    case 'SUM':
      return sum;
    case 'COUNT':
      return n;
    case 'AVERAGE':
    case 'MEAN':
      if (n === 0) throw new FormulaFail('#DIV/0!');
      return sum / n;
    case 'MIN':
      return n === 0 ? 0 : Math.min(...values);
    case 'MAX':
      return n === 0 ? 0 : Math.max(...values);
    case 'MEDIAN': {
      if (n === 0) throw new FormulaFail('#VALUE!');
      const s = [...values].sort((a, b) => a - b);
      const mid = Math.floor(n / 2);
      return n % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
    }
    case 'STDEV': {
      if (n < 2) throw new FormulaFail('#DIV/0!');
      const mean = sum / n;
      return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
    }
    default:
      throw new FormulaFail('#NAME?');
  }
}

const STATS = ['SUM', 'COUNT', 'AVERAGE', 'MEAN', 'MIN', 'MAX', 'MEDIAN', 'STDEV'];

/** Works out every cell of a sheet: formulas evaluated, numbers as numbers, text as text. */
export function evaluateSheet(rows: readonly (readonly string[])[]): CellValue[][] {
  const memo = new Map<string, CellValue>();
  const busy = new Set<string>();

  function cell(row: number, col: number): CellValue {
    const key = `${String(row)},${String(col)}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (busy.has(key)) throw new FormulaFail('#CYCLE!');
    const raw = rows[row]?.[col] ?? '';
    let value: CellValue;
    if (raw.startsWith('=')) {
      busy.add(key);
      try {
        value = formula(raw.slice(1));
      } catch (err) {
        value = err instanceof FormulaFail ? err.code : '#ERROR!';
      } finally {
        busy.delete(key);
      }
    } else {
      value = asNumber(raw) ?? raw;
    }
    memo.set(key, value);
    return value;
  }

  function numberOf(v: CellValue): number {
    if (isError(v)) throw new FormulaFail(v);
    if (typeof v === 'number') return v;
    if (v.trim() === '') return 0;
    const n = asNumber(v);
    if (n === null) throw new FormulaFail('#VALUE!');
    return n;
  }

  function formula(src: string): CellValue {
    const tokens = tokenize(src);
    let pos = 0;
    const peek = () => tokens[pos];
    const take = () => tokens[pos++];
    const expectOp = (value: string) => {
      const t = take();
      if (t?.kind !== 'op' || t.value !== value) throw new FormulaFail('#ERROR!');
    };

    function single(o: Operand): CellValue {
      if (!Array.isArray(o)) return o;
      throw new FormulaFail('#VALUE!');
    }

    function primary(): Operand {
      const t = take();
      if (!t) throw new FormulaFail('#ERROR!');
      if (t.kind === 'num' || t.kind === 'str') return t.value;
      if (t.kind === 'ref') {
        const next = peek();
        if (next?.kind === 'op' && next.value === ':') {
          take();
          const end = take();
          if (end?.kind !== 'ref') throw new FormulaFail('#REF!');
          const values: CellValue[] = [];
          for (let r = Math.min(t.row, end.row); r <= Math.max(t.row, end.row); r += 1) {
            for (let c = Math.min(t.col, end.col); c <= Math.max(t.col, end.col); c += 1) {
              values.push(cell(r, c));
            }
          }
          return values;
        }
        // An empty cell counts as 0, as in Excel.
        const value = cell(t.row, t.col);
        return value === '' ? 0 : value;
      }
      if (t.kind === 'name') {
        expectOp('(');
        const args: Operand[] = [];
        if (!isOp(peek(), ')')) {
          args.push(expression());
          while (isOp(peek(), ',')) {
            take();
            args.push(expression());
          }
        }
        expectOp(')');
        return call(t.value, args);
      }
      if (t.value === '(') {
        const inner = expression();
        expectOp(')');
        return inner;
      }
      if (t.value === '-') return -numberOf(single(primary()));
      if (t.value === '+') return numberOf(single(primary()));
      throw new FormulaFail('#ERROR!');
    }

    function call(name: string, args: Operand[]): CellValue {
      if (STATS.includes(name)) {
        const values: number[] = [];
        for (const arg of args) {
          if (Array.isArray(arg)) {
            // In ranges, text and empty cells are skipped, as in Excel.
            for (const v of arg) {
              if (isError(v)) throw new FormulaFail(v);
              if (typeof v === 'number') values.push(v);
            }
          } else {
            values.push(numberOf(arg));
          }
        }
        return stats(name, values);
      }
      const one = () => numberOf(single(args[0] ?? 0));
      switch (name) {
        case 'ABS':
          return Math.abs(one());
        case 'SQRT': {
          const x = one();
          if (x < 0) throw new FormulaFail('#VALUE!');
          return Math.sqrt(x);
        }
        case 'ROUND': {
          const digits = args.length > 1 ? numberOf(single(args[1] ?? 0)) : 0;
          const f = 10 ** Math.trunc(digits);
          return Math.round(one() * f) / f;
        }
        case 'LOG10':
          return Math.log10(one());
        case 'LN':
          return Math.log(one());
        default:
          throw new FormulaFail('#NAME?');
      }
    }

    function power(): Operand {
      const base = primary();
      if (isOp(peek(), '^')) {
        take();
        return numberOf(single(base)) ** numberOf(single(power()));
      }
      return base;
    }

    function term(): Operand {
      let left = power();
      for (let t = peek(); t?.kind === 'op' && (t.value === '*' || t.value === '/'); t = peek()) {
        take();
        const a = numberOf(single(left));
        const b = numberOf(single(power()));
        if (t.value === '/' && b === 0) throw new FormulaFail('#DIV/0!');
        left = t.value === '*' ? a * b : a / b;
      }
      return left;
    }

    function expression(): Operand {
      let left = term();
      for (let t = peek(); t?.kind === 'op' && (t.value === '+' || t.value === '-'); t = peek()) {
        take();
        const a = numberOf(single(left));
        const b = numberOf(single(term()));
        left = t.value === '+' ? a + b : a - b;
      }
      return left;
    }

    const result = expression();
    if (pos !== tokens.length) throw new FormulaFail('#ERROR!');
    return single(result);
  }

  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r, row) =>
    Array.from({ length: Math.max(width, r.length) }, (_, col) => cell(row, col)),
  );
}

/** A value for showing in a cell: numbers to 10 significant figures, without trailing zeros. */
export function showValue(value: CellValue): string {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '#VALUE!';
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  return String(Number(value.toPrecision(10)));
}
