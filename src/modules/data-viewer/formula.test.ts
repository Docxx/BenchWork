// @vitest-environment node
import { columnIndex, columnName, evaluateSheet, showValue } from './formula';

const evaluate = (rows: string[][]) => evaluateSheet(rows).map((r) => r.map(showValue));

describe('columns', () => {
  it('are named A to Z, then AA', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(['A', 'z', 'AA', 'ZZ'].map(columnIndex)).toEqual([0, 25, 26, 701]);
  });
});

describe('formulas', () => {
  it('do arithmetic with cell references', () => {
    expect(evaluate([['2', '3', '=A1*B1+1', '=(A1+B1)/2', '=-A1^2', '=$A$1+B1']])[0]).toEqual([
      '2',
      '3',
      '7',
      '2.5',
      '4', // as in Excel, the minus applies before the power
      '5',
    ]);
  });

  it('work out statistics over ranges, skipping text and empty cells', () => {
    const rows = [
      ['height', ''],
      ['4.2', ''],
      ['3.9', ''],
      ['', ''],
      ['5.1', ''],
      ['x', ''],
      ['=SUM(A2:A6)', '=AVERAGE(A2:A6)'],
      ['=MEDIAN(A2:A5)', '=STDEV(A2:A5)'],
      ['=COUNT(A1:A6)', '=MIN(A2:A5)+MAX(A2:A5)'],
      ['=ROUND(B7, 2)', '=SQRT(16)+ABS(-1)'],
    ];
    expect(evaluate(rows).slice(6)).toEqual([
      ['13.2', '4.4'],
      ['4.2', '0.6244997998'],
      ['3', '9'],
      ['4.4', '5'],
    ]);
  });

  it('follow formulas that use other formulas', () => {
    expect(evaluate([['1', '=A1+1', '=B1*10']])[0]).toEqual(['1', '2', '20']);
  });

  it('show Excel’s errors', () => {
    // A2 and B2 refer to themselves; C2 leads through A3 to the empty B3, so is 0.
    expect(
      evaluate([
        ['=1/0', '=A1+1', '="a"*2', '=NOPE(1)', '=C2', '=1+'],
        ['=A2', '=B2', '=A3'],
        ['=B3', ''],
      ]),
    ).toEqual([
      ['#DIV/0!', '#DIV/0!', '#VALUE!', '#NAME?', '0', '#ERROR!'],
      ['#CYCLE!', '#CYCLE!', '0', '', '', ''],
      ['0', '', '', '', '', ''],
    ]);
  });

  it('keep text and numbers that are not formulas as they are', () => {
    expect(evaluate([['w1118', '007', '1e3', ' 12 ']])[0]).toEqual(['w1118', '7', '1000', '12']);
  });
});
