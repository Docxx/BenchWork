import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ModuleContext } from '@core/api';
import { datasetsWith, updateChecksums, type DatasetRef } from './datasets';
import { columnName, evaluateSheet, isError, showValue } from './formula';
import { PlotPanel } from './PlotPanel';
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  MAX_EDIT_COLUMNS,
  MAX_EDIT_ROWS,
  readWorkbook,
  setCell,
  sortRows,
  writeWorkbook,
  type Workbook,
} from './table';

/** Saves this long after the last change, like pages. */
export const SAVE_DELAY_MS = 1000;
/** Changes reported this soon after our own save are our own. */
const OWN_SAVE_MS = 2000;

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

interface Cell {
  r: number;
  c: number;
}

/** A CSV, TSV or Excel file as an editable sheet, with a formula bar and quick plots. */
export function DataGrid({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const [book, setBook] = useState<Workbook | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [selected, setSelected] = useState<Cell>({ r: 0, c: 0 });
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [excelEdit, setExcelEdit] = useState(false);
  const [datasets, setDatasets] = useState<DatasetRef[]>([]);
  const [checksumsStale, setChecksumsStale] = useState(false);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [headings, setHeadings] = useState(true);
  const [showPlot, setShowPlot] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotTaken = useRef(false);
  const lastSave = useRef(0);
  const latest = useRef<Workbook | null>(null);
  /** Edits not yet written to the file. */
  const dirty = useRef(false);
  /** Set when the file changed elsewhere while there were unsaved edits. */
  const blocked = useRef(false);
  const formulaBar = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLTableElement>(null);

  // Reading the file, and again when it changes elsewhere with nothing unsaved here.
  const [reads, setReads] = useState(0);
  useEffect(() => {
    let current = true;
    void ctx.vault
      .readBytes(path)
      .then((bytes) => {
        if (!current) return;
        const read = readWorkbook(path, bytes);
        latest.current = read;
        setBook(read);
        setProblem(null);
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    void datasetsWith(ctx, path).then((found) => {
      if (current) setDatasets(found);
    });
    return () => {
      current = false;
    };
  }, [ctx, path, reads]);

  const save = useCallback(async () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const toSave = latest.current;
    if (toSave === null || blocked.current) return;
    setSaveState('saving');
    try {
      // A recovery copy of the file as it was, once per visit, before the first change.
      if (!snapshotTaken.current) {
        await ctx.vault.keepSnapshot(path).catch(() => undefined);
        snapshotTaken.current = true;
      }
      lastSave.current = Date.now();
      await ctx.vault.writeBytes(path, writeWorkbook(toSave));
      dirty.current = latest.current !== toSave;
      setSaveState(dirty.current ? 'unsaved' : 'saved');
      setSaveError(null);
      setChecksumsStale(true);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [ctx, path]);

  useEffect(() => {
    const watching = ctx.vault.watch((change) => {
      if (!change.paths.includes(path) || Date.now() - lastSave.current < OWN_SAVE_MS) return;
      if (dirty.current) {
        // Never save over the other version: stop here and let the user choose.
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        blocked.current = true;
        setChangedElsewhere(true);
      } else setReads((n) => n + 1);
    });
    return () => {
      watching.dispose();
    };
  }, [ctx, path]);

  // Save before leaving the file.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(
    () => () => {
      if (timer.current !== null) void saveRef.current();
    },
    [],
  );

  const values = useMemo(
    () => evaluateSheet(book?.sheets[sheetIndex]?.rows ?? []),
    [book, sheetIndex],
  );

  if (problem !== null) return <p className="notice">This file could not be read. {problem}</p>;
  if (book === null) return <p className="hint">Reading the file…</p>;

  const sheet = book.sheets[sheetIndex] ?? { name: 'Sheet1', rows: [] };
  const rowCount = Math.max(sheet.rows.length, 1);
  const colCount = Math.max(1, ...sheet.rows.map((r) => r.length));
  const tooLarge = sheet.rows.length > MAX_EDIT_ROWS || colCount > MAX_EDIT_COLUMNS;
  const excel = book.format === 'xlsx' || book.format === 'xls';
  const readOnly = tooLarge || changedElsewhere || book.format === 'xls' || (excel && !excelEdit);
  const raw = sheet.rows[selected.r]?.[selected.c] ?? '';
  // An empty row and column past the data, to type into, as in a spreadsheet.
  const shownRows = rowCount + (readOnly ? 0 : 1);
  const shownCols = colCount + (readOnly ? 0 : 1);

  const change = (rows: string[][]) => {
    if (readOnly) return;
    const sheets = book.sheets.map((s, i) => (i === sheetIndex ? { ...s, rows } : s));
    const next = { ...book, sheets };
    latest.current = next;
    dirty.current = true;
    setBook(next);
    setSaveState('unsaved');
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const commit = (move: Cell | null) => {
    if (draft !== null && draft !== raw) change(setCell(sheet.rows, selected.r, selected.c, draft));
    setDraft(null);
    if (move) setSelected(move);
    grid.current?.focus();
  };

  const moveBy = (dr: number, dc: number) => {
    setSelected((s) => ({
      r: Math.max(0, Math.min(shownRows - 1, s.r + dr)),
      c: Math.max(0, Math.min(shownCols - 1, s.c + dc)),
    }));
  };

  const onGridKey = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [1, 0],
      Tab: [0, e.shiftKey ? -1 : 1],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      moveBy(move[0], move[1]);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    } else if (!readOnly && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      change(setCell(sheet.rows, selected.r, selected.c, ''));
    } else if (!readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing starts editing the cell in the formula bar.
      e.preventDefault();
      setDraft(e.key);
      formulaBar.current?.focus();
    }
  };

  const statusText: Record<SaveState, string> = {
    saved: 'Saved',
    unsaved: 'Edited',
    saving: 'Saving…',
    error: 'Not saved',
  };

  return (
    <div className="data-grid">
      {excel && !excelEdit && book.format === 'xlsx' && !tooLarge && (
        <div className="notice">
          <span>
            Editing here keeps values and formulas, but not Excel formatting such as colours and
            column widths.
          </span>
          <button
            type="button"
            onClick={() => {
              setExcelEdit(true);
            }}
          >
            Edit anyway
          </button>
        </div>
      )}
      {book.format === 'xls' && (
        <p className="notice">
          Old .xls files open read-only. Save a copy as .xlsx in Excel to edit it here.
        </p>
      )}
      {tooLarge && (
        <p className="notice">
          This sheet is too large to edit here, so it opens read-only. Open it in Excel to change
          it.
        </p>
      )}
      {changedElsewhere && (
        <div className="notice" role="alert">
          <span>
            This file was changed outside BenchWork while you were editing it, so your edits were
            not saved over it. A copy from before your edits is in BenchWork’s snapshots.
          </span>
          <button
            type="button"
            onClick={() => {
              if (timer.current !== null) clearTimeout(timer.current);
              timer.current = null;
              dirty.current = false;
              blocked.current = false;
              setChangedElsewhere(false);
              setSaveState('saved');
              setReads((n) => n + 1);
            }}
          >
            Load the other version
          </button>
        </div>
      )}
      {datasets.length > 0 && (
        <div className="notice">
          <span>
            Part of {datasets.map((d) => d.title).join(', ')}.{' '}
            {checksumsStale
              ? 'The file has changed, so its checksum there no longer matches.'
              : 'Saving changes the file, so its checksum there will no longer match.'}
          </span>
          {checksumsStale && (
            <button
              type="button"
              onClick={() => {
                void updateChecksums(ctx, datasets, path).then(() => {
                  setChecksumsStale(false);
                });
              }}
            >
              Update checksum
            </button>
          )}
        </div>
      )}

      <div className="data-toolbar">
        {book.sheets.length > 1 && (
          <select
            aria-label="Sheet"
            value={sheetIndex}
            onChange={(e) => {
              setSheetIndex(Number(e.target.value));
              setSelected({ r: 0, c: 0 });
            }}
          >
            {book.sheets.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            change(insertRow(sheet.rows, selected.r + 1));
          }}
        >
          Add row
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            change(insertColumn(sheet.rows, selected.c + 1));
          }}
        >
          Add column
        </button>
        <button
          type="button"
          disabled={readOnly || sheet.rows.length === 0}
          onClick={() => {
            change(deleteRow(sheet.rows, selected.r));
          }}
        >
          Delete row
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            change(deleteColumn(sheet.rows, selected.c));
          }}
        >
          Delete column
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            change(sortRows(sheet.rows, selected.c, 1, headings));
          }}
        >
          Sort A to Z
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            change(sortRows(sheet.rows, selected.c, -1, headings));
          }}
        >
          Sort Z to A
        </button>
        <label className="data-check">
          <input
            type="checkbox"
            checked={headings}
            onChange={(e) => {
              setHeadings(e.target.checked);
            }}
          />
          First row is headings
        </label>
        <button
          type="button"
          aria-pressed={showPlot}
          onClick={() => {
            setShowPlot((p) => !p);
          }}
        >
          Plot
        </button>
        <span className={`save-status ${saveState}`} role="status">
          {readOnly ? 'Read-only' : statusText[saveState]}
        </span>
      </div>
      {saveError !== null && <p className="notice">This file could not be saved. {saveError}</p>}
      {book.format === 'csv' || book.format === 'tsv' ? (
        <p className="hint">CSV and TSV files keep the results of formulas, not the formulas.</p>
      ) : null}

      <div className="formula-bar">
        <span className="cell-name">{`${columnName(selected.c)}${String(selected.r + 1)}`}</span>
        <input
          ref={formulaBar}
          aria-label="Cell contents"
          readOnly={readOnly}
          value={draft ?? raw}
          onFocus={() => {
            if (!readOnly) setDraft((d) => d ?? raw);
          }}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={() => {
            commit(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit({ r: selected.r + 1, c: selected.c });
            } else if (e.key === 'Tab') {
              e.preventDefault();
              commit({ r: selected.r, c: selected.c + 1 });
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(null);
              grid.current?.focus();
            }
          }}
        />
      </div>

      {showPlot && <PlotPanel values={values} headings={headings} columns={colCount} />}

      <div className="data-scroll">
        <table
          ref={grid}
          className="data-table"
          aria-label="Sheet"
          tabIndex={0}
          onKeyDown={onGridKey}
        >
          <thead>
            <tr>
              <th aria-hidden="true" />
              {Array.from({ length: shownCols }, (_, c) => (
                <th key={c} scope="col">
                  {columnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: shownRows }, (_, r) => (
              <tr key={r} className={headings && r === 0 ? 'heading-row' : undefined}>
                <th scope="row">{r + 1}</th>
                {Array.from({ length: shownCols }, (_, c) => {
                  const value = values[r]?.[c] ?? '';
                  const isSel = selected.r === r && selected.c === c;
                  return (
                    <td
                      key={c}
                      aria-selected={isSel}
                      className={
                        [
                          isSel ? 'selected' : '',
                          typeof value === 'number' ? 'number' : '',
                          isError(value) ? 'error' : '',
                        ]
                          .join(' ')
                          .trim() || undefined
                      }
                      onMouseDown={() => {
                        commit({ r, c });
                      }}
                      onDoubleClick={() => {
                        if (!readOnly) formulaBar.current?.focus();
                      }}
                    >
                      {showValue(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
