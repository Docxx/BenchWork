import { useEffect, useMemo, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { nextFlip, flipStock } from './flips';
import { asText, FLY_STOCK, KINDS, linkLabel, type Field, type ItemKind } from './kinds';
import { kindOf, today, useItems, type InventoryStore, type Item } from './store';

/** A date as people read it. */
function dayLabel(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function cell(item: Item, field: Field | undefined): string {
  if (!field) return '';
  const text = asText(item.data[field.key]);
  if (field.kind === 'date') return text === '' ? '' : dayLabel(text.slice(0, 10));
  if (field.kind === 'link') return linkLabel(text);
  return text;
}

/** When a stock is next flipped, and whether that is today or past. */
function FlipDue({ item }: { item: Item }) {
  const day = today();
  const next = nextFlip(flipStock(item.name, item.data), day);
  if (next === null) return <span className="hint">Not flipped</span>;
  return <span className={next <= day ? 'flip-due late' : 'flip-due'}>{dayLabel(next)}</span>;
}

/** For Home: stocks due to be flipped by today, with a button to record each flip. */
export function FlipsDue({ ctx, store }: { ctx: ModuleContext; store: InventoryStore }) {
  const day = today();
  const due = useItems(store)
    .filter((i) => i.kind === FLY_STOCK)
    .map((item) => ({ item, next: nextFlip(flipStock(item.name, item.data), day) }))
    .filter((s): s is { item: Item; next: string } => s.next !== null && s.next <= day)
    .sort((a, b) => a.next.localeCompare(b.next));
  if (!store.loaded) return <p className="hint">Reading…</p>;
  return (
    <div className="flips-card">
      {due.length === 0 ? (
        <p className="hint">No flips due today.</p>
      ) : (
        <ul>
          {due.map(({ item, next }) => (
            <li key={item.path}>
              <button
                type="button"
                className="link-button"
                onClick={() => void ctx.app.open(item.path)}
              >
                {item.name}
              </button>
              <span className={next < day ? 'flip-due late' : 'flip-due'}>{dayLabel(next)}</span>
              <button type="button" className="quiet" onClick={() => void store.flipped(item)}>
                Flipped
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Table({
  ctx,
  store,
  kind,
}: {
  ctx: ModuleContext;
  store: InventoryStore;
  kind: ItemKind;
}) {
  const items = useItems(store).filter((i) => i.kind === kind);
  const [query, setQuery] = useState('');
  const columns = kind.columns.map((key) => kind.fields.find((f) => f.key === key));
  const q = query.trim().toLowerCase();
  const shown =
    q === ''
      ? items
      : items.filter((i) =>
          `${i.name} ${Object.values(i.data).map(asText).join(' ')}`.toLowerCase().includes(q),
        );
  const stocks = kind === FLY_STOCK;

  const create = async () => {
    const name = await ctx.app.askText({ title: `New ${kind.one}`, label: 'Name' });
    if (name !== null && name.trim() !== '') await store.create(kind, name.trim());
  };

  return (
    <section aria-label={kind.many}>
      <div className="inventory-bar">
        <input
          type="search"
          aria-label={`Find ${kind.many.toLowerCase()}`}
          placeholder={`Find ${kind.many.toLowerCase()}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <button type="button" onClick={() => void create()}>
          New {kind.one}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="hint">
          {items.length === 0 ? `No ${kind.many.toLowerCase()} yet.` : 'Nothing matches.'}
        </p>
      ) : (
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Name</th>
              {columns.map((c) => (
                <th key={c?.key}>{c?.label}</th>
              ))}
              {stocks && <th>Next flip</th>}
              {stocks && <th aria-label="Flip" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr key={item.path}>
                <td>
                  <button
                    type="button"
                    className="inventory-name"
                    onClick={() => void ctx.app.open(item.path)}
                  >
                    {item.name}
                  </button>
                </td>
                {columns.map((c) => (
                  <td key={c?.key}>{cell(item, c)}</td>
                ))}
                {stocks && (
                  <td>
                    <FlipDue item={item} />
                  </td>
                )}
                {stocks && (
                  <td>
                    {flipStock(item.name, item.data).flipEvery !== null && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => void store.flipped(item)}
                      >
                        Flipped today
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The Inventory view: a tab for each kind of item, each a table with search. */
export function InventoryView({ ctx, store }: { ctx: ModuleContext; store: InventoryStore }) {
  const [tab, setTab] = useState(KINDS[0]?.kind ?? '');
  const kind = KINDS.find((k) => k.kind === tab) ?? KINDS[0];
  return (
    <div className="inventory-view">
      <div className="ribbon-tabs inventory-tabs" role="tablist" aria-label="Inventory">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={k.kind === tab}
            onClick={() => {
              setTab(k.kind);
            }}
          >
            {k.many}
          </button>
        ))}
      </div>
      {kind && <Table ctx={ctx} store={store} kind={kind} />}
      <p className="hint">
        Each item is a small file in the Inventory notebook. Flips due are listed in the page Flips
        due, and with your other tasks.
      </p>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onSave,
}: {
  field: Field;
  value: string;
  onSave: (value: string) => void;
}) {
  // Keyed by its saved value, so a change from elsewhere starts it afresh.
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value) onSave(draft);
  };
  const id = `inventory-${field.key}`;
  const common = {
    id,
    value: draft,
    placeholder: field.hint,
    onBlur: commit,
  };
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {field.label}
      </label>
      {field.kind === 'long' ? (
        <textarea
          {...common}
          rows={4}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
      ) : field.kind === 'choice' ? (
        <select
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onSave(e.target.value);
          }}
        >
          <option value="" />
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
          inputMode={field.kind === 'number' ? 'numeric' : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      )}
    </div>
  );
}

/** An inventory item, opened: its values to read and change. */
export function ItemView({
  ctx,
  store,
  path,
}: {
  ctx: ModuleContext;
  store: InventoryStore;
  path: string;
}) {
  const item = useItems(store).find((i) => i.path === path);
  const kind = kindOf(path);
  useEffect(() => {
    if (!item) void store.refresh([path]);
  }, [item, path, store]);
  const fields = useMemo(() => kind?.fields ?? [], [kind]);
  if (!kind) return null;
  if (!item) return <p className="hint">Reading…</p>;

  const save = (field: Field, text: string) => {
    const trimmed = text.trim();
    const value =
      trimmed === ''
        ? null
        : field.kind === 'number' && Number.isFinite(Number(trimmed))
          ? Number(trimmed)
          : trimmed;
    void store.update(item, { [field.key]: value });
  };

  return (
    <div className="inventory-item">
      <p className="hint">
        {kind.one.charAt(0).toUpperCase() + kind.one.slice(1)}.{' '}
        <button
          type="button"
          className="quiet"
          onClick={() => void ctx.app.openView('inventory.view')}
        >
          All {kind.many.toLowerCase()}
        </button>
      </p>
      {kind === FLY_STOCK && (
        <p className="flip-line">
          Next flip: <FlipDue item={item} />{' '}
          <button type="button" onClick={() => void store.flipped(item)}>
            Flipped today
          </button>
        </p>
      )}
      {fields.map((f) => (
        <FieldInput
          key={`${f.key}:${asText(item.data[f.key])}`}
          field={f}
          value={asText(item.data[f.key]).slice(0, f.kind === 'date' ? 10 : undefined)}
          onSave={(text) => {
            save(f, text);
          }}
        />
      ))}
    </div>
  );
}
