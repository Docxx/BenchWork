import type { TableData } from './csv';

/**
 * Reads Excel and OpenDocument spreadsheets for previews, with SheetJS.
 * It is loaded only when a spreadsheet is first opened. Read only: the
 * file is never written.
 */

export interface SheetData extends TableData {
  name: string;
}

export async function readSpreadsheet(bytes: Uint8Array, maxRows: number): Promise<SheetData[]> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(bytes, { type: 'array', sheetRows: maxRows, dense: true });
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    if (!sheet) return { name, rows: [], total: 0 };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    });
    // With sheetRows, the sheet's full size is kept in !fullref.
    const full = (sheet['!fullref'] as string | undefined) ?? sheet['!ref'];
    const total = full === undefined ? rows.length : XLSX.utils.decode_range(full).e.r + 1;
    return {
      name,
      rows: rows.map((r) => r.map((c) => (typeof c === 'string' ? c : String(c)))),
      total: Math.max(total, rows.length),
    };
  });
}
