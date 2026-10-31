import { useEffect, useId, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { cleanTags } from '../state/knowledgeSlice';
import { useApp } from './AppStoreContext';

/** Notes keep frontmatter tags; documents keep tags alongside other vault metadata. */
export function TagEditor({ path }: { path: string }) {
  const read = useApp((s) => s.itemTags);
  const write = useApp((s) => s.setItemTags);
  const search = useApp((s) => s.setSearchQuery);
  const properties = useApp((s) => s.pageProperties);
  const revision = useApp((s) => s.tagRevision);
  const broken = useApp((s) => s.propertiesBroken || s.pageConflict !== null);
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const inputId = useId();
  const note = /\.md$/i.test(path);
  useEffect(() => {
    let live = true;
    void read(path)
      .then((value) => {
        if (live) {
          setTags(value);
          setError('');
          setBusy(false);
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setError(String(e));
          setBusy(true);
        }
      });
    return () => {
      live = false;
    };
  }, [path, read, properties, revision]);
  async function save(next: string[]) {
    setBusy(true);
    try {
      await write(path, next);
      setTags(next);
      setDraft('');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="item-tags" aria-label="Tags">
      <Tag size={15} aria-hidden />
      {tags.map((tag) => (
        <span className="item-tag" key={tag}>
          <button
            type="button"
            className="quiet"
            onClick={() => {
              search(`#${tag}`);
            }}
          >
            #{tag}
          </button>
          <button
            type="button"
            className="quiet"
            aria-label={`Remove tag ${tag}`}
            disabled={busy || (note && broken)}
            onClick={() => void save(tags.filter((t) => t !== tag))}
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const added = cleanTags(draft.split(/[,\s]+/));
          if (!added.length) {
            setError('Use letters, numbers, hyphens or nested/tags.');
            return;
          }
          void save(cleanTags([...tags, ...added]));
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          Add tags
        </label>
        <input
          id={inputId}
          placeholder="Add tags…"
          value={draft}
          disabled={busy || (note && broken)}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
        />
        {draft && (
          <button type="submit" disabled={busy}>
            Add
          </button>
        )}
      </form>
      {error && (
        <span className="item-tag-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
