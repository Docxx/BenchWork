// @vitest-environment node
import * as XLSX from 'xlsx';
import { MemoryAdapter } from '../platform/memory';
import { guessDelimiter, parseCsv } from './csv';
import { fileKind, formatSize, kindLabel } from './fileKinds';
import { checkLinkedFile, linkFile, readLinkRecord } from './linkedFiles';
import { readSpreadsheet } from './spreadsheet';

describe('file kinds', () => {
  it('knows what each file is', () => {
    expect(
      [
        'a.md',
        'plot.PNG',
        'day7.csv',
        'day7.tsv',
        'book.xlsx',
        'paper.pdf',
        'scan.tif.link.yaml',
        'day7.dataset.yaml',
        'Ideas.canvas.json',
        'notes.txt',
      ].map(fileKind),
    ).toEqual([
      'page',
      'image',
      'table',
      'table',
      'spreadsheet',
      'pdf',
      'link',
      'record',
      'canvas',
      'other',
    ]);
    expect(kindLabel('Lab/Ideas.canvas.json')).toBe('Canvas');
    expect(kindLabel('Data/day7.csv')).toBe('CSV table');
    expect(kindLabel('Data/day7.dataset.yaml')).toBe('Dataset');
  });

  it('writes sizes people can read', () => {
    expect(formatSize(1)).toBe('1 byte');
    expect(formatSize(512)).toBe('512 bytes');
    expect(formatSize(2458)).toBe('2.4 KB');
    expect(formatSize(52 * 1024 * 1024)).toBe('52 MB');
    expect(formatSize(1.3 * 1024 ** 3)).toBe('1.3 GB');
  });
});

describe('CSV', () => {
  it('reads quoted fields with commas, quotes and line breaks', () => {
    const text = 'genotype,"note, long",n\r\nw1118,"said ""ok""\non two lines",12\r\n';
    expect(parseCsv(text, 100)).toEqual({
      rows: [
        ['genotype', 'note, long', 'n'],
        ['w1118', 'said "ok"\non two lines', '12'],
      ],
      total: 2,
    });
  });

  it('keeps blank cells and blank lines, but not a final line ending', () => {
    expect(parseCsv('a,,c\n\nd\n', 10).rows).toEqual([['a', '', 'c'], [''], ['d']]);
    expect(parseCsv('', 10)).toEqual({ rows: [], total: 0 });
  });

  it('keeps the rows asked for and counts the rest', () => {
    const text = [
      'x,y',
      ...Array.from({ length: 50 }, (_, i) => `${String(i)},"q""${String(i)}"`),
    ].join('\n');
    const table = parseCsv(text, 5);
    expect(table.rows).toHaveLength(5);
    expect(table.total).toBe(51);
  });

  it('works out the delimiter, and drops a byte order mark', () => {
    expect(guessDelimiter('a;b;c\n1,5;2;3')).toBe(';');
    expect(guessDelimiter('a\tb\n')).toBe('\t');
    expect(guessDelimiter('"a;b",c\n')).toBe(',');
    expect(parseCsv('\uFEFFa;b\n1;2', 10).rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('spreadsheets', () => {
  it('reads each sheet as rows of text, up to a limit', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Fly', 'Climb (cm)'],
        ['w1118', 12.5],
        ['elav>tau', 4],
      ]),
      'Day 7',
    );
    const long = XLSX.utils.aoa_to_sheet(Array.from({ length: 30 }, (_, i) => [i]));
    XLSX.utils.book_append_sheet(book, long, 'Long');
    const bytes = new Uint8Array(
      XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    );

    const sheets = await readSpreadsheet(bytes, 10);
    expect(sheets.map((s) => s.name)).toEqual(['Day 7', 'Long']);
    expect(sheets[0]?.rows).toEqual([
      ['Fly', 'Climb (cm)'],
      ['w1118', '12.5'],
      ['elav>tau', '4'],
    ]);
    expect(sheets[1]?.rows).toHaveLength(10);
    expect(sheets[1]?.total).toBe(30);
  });
});

describe('linked files', () => {
  async function vault() {
    const platform = new MemoryAdapter({ folders: { 'C:/Vault': { '.benchwork': null } } });
    await platform.setVaultRoot('C:/Vault');
    platform.addExternalFile('D:/Raw/scan 1.tif', 'big image data');
    return platform;
  }

  it('records where a file is, with its size and checksum', async () => {
    const platform = await vault();
    const path = await linkFile(platform, 'D:/Raw/scan 1.tif', new Date(2026, 9, 23), () => 'id1');
    expect(path).toBe('attachments/scan 1.tif.link.yaml');
    const record = readLinkRecord(platform.snapshot()[path] ?? '');
    expect(record).toMatchObject({ path: 'D:/Raw/scan 1.tif', size: 14 });
    expect(record?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record?.added?.startsWith('2026-10-23T00:00:00')).toBe(true);
    // Linking the same file again never overwrites the first record.
    expect(await linkFile(platform, 'D:/Raw/scan 1.tif')).toBe(
      'attachments/scan 1.tif 2.link.yaml',
    );
  });

  it('checks a linked file is still the same', async () => {
    const platform = await vault();
    const path = await linkFile(platform, 'D:/Raw/scan 1.tif');
    const record = readLinkRecord(platform.snapshot()[path] ?? '');
    if (!record) throw new Error('no record');
    expect(await checkLinkedFile(platform, record)).toEqual({ state: 'same' });
    platform.addExternalFile('D:/Raw/scan 1.tif', 'changed data!!');
    expect(await checkLinkedFile(platform, record)).toEqual({ state: 'changed', size: 14 });
    expect(await checkLinkedFile(platform, { ...record, path: 'D:/Raw/gone.tif' })).toEqual({
      state: 'missing',
    });
  });

  it('reads only records with a path', () => {
    expect(readLinkRecord('size: 3\n')).toBeNull();
    expect(readLinkRecord('path: [')).toBeNull();
  });
});
