// @vitest-environment node
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseDelimited,
  readWorkbook,
  setCell,
  sortRows,
  writeDelimited,
  writeWorkbook,
} from './table';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('CSV and TSV', () => {
  it('read quoted fields, commas and line breaks inside them', () => {
    expect(parseDelimited('a,"b,c","say ""hi""\nthere"\r\n1,2,3', ',')).toEqual([
      ['a', 'b,c', 'say "hi"\nthere'],
      ['1', '2', '3'],
    ]);
    expect(parseDelimited('x\ty\n1\t2\n', '\t')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });

  it('write back only quoting what needs it', () => {
    expect(writeDelimited([['a', 'b,c', 'say "hi"', ' pad']], ',', '\n', true)).toBe(
      'a,"b,c","say ""hi"""," pad"\n',
    );
  });

  it('round-trip a file unchanged, keeping its line endings', () => {
    const source = 'fly,height\r\n1,4.2\r\n2,"3,9"\r\n';
    const book = readWorkbook('day7.csv', bytes(source));
    expect(book.eol).toBe('\r\n');
    expect(text(writeWorkbook(book))).toBe(source);
  });

  it('save the results of formulas, since CSV cannot hold formulas', () => {
    const book = readWorkbook('a.csv', bytes('x\n2\n3\n'));
    book.sheets[0] = { name: 'Sheet1', rows: [['x'], ['2'], ['3'], ['=SUM(A2:A3)']] };
    expect(text(writeWorkbook(book))).toBe('x\n2\n3\n5\n');
  });
});

describe('Excel files', () => {
  it('keep their sheets, values and formulas', () => {
    const source = readWorkbook('a.csv', bytes('x,y\n1,2\n'));
    const book = {
      ...source,
      format: 'xlsx' as const,
      sheets: [
        {
          name: 'Climbing',
          rows: [
            ['fly', 'height'],
            ['1', '4.2'],
            ['mean', '=AVERAGE(B2:B2)'],
          ],
        },
        { name: 'Notes', rows: [['w1118']] },
      ],
    };
    const again = readWorkbook('a.xlsx', writeWorkbook(book));
    expect(again.sheets.map((s) => s.name)).toEqual(['Climbing', 'Notes']);
    expect(again.sheets[0]?.rows).toEqual([
      ['fly', 'height'],
      ['1', '4.2'],
      ['mean', '=AVERAGE(B2:B2)'],
    ]);
  });

  it('old .xls files are not written', () => {
    const book = { format: 'xls' as const, sheets: [], eol: '\n' as const, finalNewline: true };
    expect(() => writeWorkbook(book)).toThrow('read-only');
  });
});

describe('changing a sheet', () => {
  const rows = [
    ['fly', 'height'],
    ['1', '4.2'],
    ['2', '3.9'],
  ];

  it('sets cells, growing the sheet as needed', () => {
    expect(setCell(rows, 3, 2, 'x')).toEqual([
      ['fly', 'height'],
      ['1', '4.2'],
      ['2', '3.9'],
      ['', '', 'x'],
    ]);
    expect(rows[1]).toEqual(['1', '4.2']);
  });

  it('adds and removes rows and columns', () => {
    expect(insertRow(rows, 1)[1]).toEqual(['', '']);
    expect(deleteRow(rows, 1)).toEqual([
      ['fly', 'height'],
      ['2', '3.9'],
    ]);
    expect(insertColumn(rows, 1)[0]).toEqual(['fly', '', 'height']);
    expect(deleteColumn(rows, 0)).toEqual([['height'], ['4.2'], ['3.9']]);
  });

  it('sorts by a column, numbers by size, keeping headings at the top', () => {
    const data = [['n'], ['10'], ['9'], ['b'], [''], ['A']];
    expect(sortRows(data, 0, 1, true).map((r) => r[0])).toEqual(['n', '9', '10', 'A', 'b', '']);
    expect(sortRows(data, 0, -1, true).map((r) => r[0])).toEqual(['n', 'b', 'A', '10', '9', '']);
  });
});
