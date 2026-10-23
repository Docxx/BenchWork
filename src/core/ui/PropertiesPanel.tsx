import { useId, useMemo, useState } from 'react';
import {
  isPropertyKey,
  linkTargets,
  linkValue,
  listOf,
  parseList,
  propertyRows,
  textOf,
  valueFromText,
  type PropertyRow,
} from '../pages/propertyValues';
import { useApp } from './AppStoreContext';

/**
 * The open page's properties, above the text. Hidden until the page has
 * some: a page type's fields, or keys added with "/Property". Values are
 * saved to the frontmatter with the page.
 */
export function PropertiesPanel() {
  const properties = useApp((s) => s.pageProperties);
  const broken = useApp((s) => s.propertiesBroken);
  const adding = useApp((s) => s.addingProperty);
  const setAdding = useApp((s) => s.setAddingProperty);
  const pageTypes = useApp((s) => s.pageTypes);
  const setProperties = useApp((s) => s.setPageProperties);

  const type = typeof properties?.['type'] === 'string' ? properties['type'] : 'page';
  const spec = pageTypes.find((t) => t.type === type);
  const rows = useMemo(
    () => propertyRows(properties ?? {}, spec?.fields ?? []),
    [properties, spec],
  );

  if (broken) {
    return (
      <p className="hint properties-broken">
        This page’s properties could not be read, so they are left as they are.
      </p>
    );
  }
  if (rows.length === 0 && !adding) return null;

  return (
    <section className="properties" aria-label="Properties">
      {spec && <p className="properties-type">{spec.name}</p>}
      <div className="property-rows">
        {rows.map((row) => (
          <PropertyLine
            key={row.key}
            row={row}
            onChange={(value) => {
              setProperties({ [row.key]: value });
            }}
            onRemove={
              row.extra
                ? () => {
                    setProperties({ [row.key]: null });
                  }
                : undefined
            }
          />
        ))}
      </div>
      {adding ? (
        <NewProperty
          taken={rows.map((r) => r.key)}
          onDone={(key) => {
            setAdding(false);
            if (key !== null) setProperties({ [key]: '' });
          }}
        />
      ) : (
        <button
          type="button"
          className="quiet add-property"
          onClick={() => {
            setAdding(true);
          }}
        >
          Add property
        </button>
      )}
    </section>
  );
}

interface LineProps {
  row: PropertyRow;
  onChange: (value: unknown) => void;
  onRemove: (() => void) | undefined;
}

function PropertyLine({ row, onChange, onRemove }: LineProps) {
  const id = useId();
  return (
    <div className="property-row" data-key={row.key}>
      <label className="property-label" htmlFor={id}>
        {row.label}
      </label>
      <div className="property-value">
        <PropertyEditor id={id} row={row} onChange={onChange} />
        {onRemove && (
          <button
            type="button"
            className="quiet remove-property"
            aria-label={`Remove ${row.label}`}
            title="Remove"
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function PropertyEditor({
  id,
  row,
  onChange,
}: {
  id: string;
  row: PropertyRow;
  onChange: (value: unknown) => void;
}) {
  switch (row.kind) {
    case 'choice': {
      const current = textOf(row.value);
      const options = row.options ?? [];
      return (
        <select
          id={id}
          value={current}
          onChange={(e) => {
            onChange(e.target.value === '' ? null : e.target.value);
          }}
        >
          <option value="">–</option>
          {[...options, ...(current !== '' && !options.includes(current) ? [current] : [])].map(
            (o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ),
          )}
        </select>
      );
    }
    case 'date':
      return (
        <input
          id={id}
          type="date"
          value={textOf(row.value)}
          onChange={(e) => {
            onChange(e.target.value === '' ? null : e.target.value);
          }}
        />
      );
    case 'link':
    case 'links':
      return <LinkEditor id={id} row={row} onChange={onChange} />;
    case 'list':
      return (
        <TextField
          id={id}
          value={listOf(row.value).join(', ')}
          placeholder="Separate with commas"
          onCommit={(text) => {
            onChange(parseList(text));
          }}
        />
      );
    default:
      return (
        <TextField
          id={id}
          value={textOf(row.value)}
          onCommit={(text) => {
            onChange(valueFromText('text', text));
          }}
        />
      );
  }
}

/** A text box that saves when you leave it or press Enter. */
function TextField({
  id,
  value,
  placeholder,
  list,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder?: string;
  list?: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // A new value from outside (a reload, another field) replaces the draft.
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      id={id}
      value={draft}
      placeholder={placeholder}
      list={list}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(value);
        }
      }}
    />
  );
}

/** Links shown as chips that open what they point at, with a box to add one. */
function LinkEditor({
  id,
  row,
  onChange,
}: {
  id: string;
  row: PropertyRow;
  onChange: (value: unknown) => void;
}) {
  const followLink = useApp((s) => s.followLink);
  const linkResolves = useApp((s) => s.linkResolves);
  const pageRefs = useApp((s) => s.pageRefs);
  const linkTargetFor = useApp((s) => s.linkTargetFor);
  const listId = useId();
  const kind = row.kind === 'link' ? 'link' : 'links';
  const targets = linkTargets(row.value);
  const choices = useMemo(
    () => pageRefs.map((p) => ({ target: linkTargetFor(p.path), title: p.title })),
    [pageRefs, linkTargetFor],
  );

  const add = (text: string) => {
    const target = text.trim().replace(/^\[\[|\]\]$/g, '');
    if (target === '' || targets.includes(target)) return;
    onChange(linkValue(kind === 'link' ? [target] : [...targets, target], kind));
  };

  return (
    <div className="link-chips">
      {targets.map((t) => (
        <span key={t} className={linkResolves(t) ? 'link-chip' : 'link-chip missing'}>
          <button
            type="button"
            className="link-chip-open"
            title={`Open ${t}`}
            onClick={() => void followLink(t)}
          >
            {t}
          </button>
          <button
            type="button"
            className="link-chip-remove"
            aria-label={`Remove link to ${t}`}
            onClick={() => {
              onChange(
                linkValue(
                  targets.filter((x) => x !== t),
                  kind,
                ),
              );
            }}
          >
            ×
          </button>
        </span>
      ))}
      {(kind === 'links' || targets.length === 0) && (
        <>
          <TextField
            key={targets.join('\n')}
            id={id}
            value=""
            placeholder="Link to…"
            list={listId}
            onCommit={add}
          />
          <datalist id={listId}>
            {choices.map((c) => (
              <option key={c.target} value={c.target}>
                {c.title}
              </option>
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}

function NewProperty({
  taken,
  onDone,
}: {
  taken: readonly string[];
  /** The new key, or null if cancelled. */
  onDone: (key: string | null) => void;
}) {
  const [name, setName] = useState('');
  const key = name.trim();
  const usable = isPropertyKey(key) && !taken.includes(key);
  return (
    <form
      className="new-property"
      onSubmit={(e) => {
        e.preventDefault();
        if (usable) onDone(key);
      }}
    >
      <input
        // Asked for on purpose, so it takes focus.
        autoFocus
        aria-label="New property name"
        placeholder="Property name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone(null);
        }}
      />
      <button type="submit" disabled={!usable}>
        Add
      </button>
      <button
        type="button"
        className="quiet"
        onClick={() => {
          onDone(null);
        }}
      >
        Cancel
      </button>
    </form>
  );
}
