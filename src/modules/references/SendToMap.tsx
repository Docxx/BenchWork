import { useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { findCanvases } from '../mind-maps/CanvasList';
import {
  emptyCanvas,
  newId,
  parseCanvas,
  serialiseCanvas,
  type CanvasItem,
} from '../mind-maps/canvasFile';
import { saveEvidence } from './evidence';
import type { Entry } from './EvidenceShelf';

export function SendToMap({ ctx, entry }: { ctx: ModuleContext; entry: Entry }) {
  const [maps, setMaps] = useState<string[]>([]);
  const [path, setPath] = useState('');
  const [branches, setBranches] = useState<CanvasItem[]>([]);
  const [branch, setBranch] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void findCanvases(ctx).then((rows) => {
      if (live) setMaps(rows.map((r) => r.path));
    });
    return () => {
      live = false;
    };
  }, [ctx]);
  useEffect(() => {
    let live = true;

    if (path)
      void ctx.vault
        .readText(path)
        .then((text) => {
          if (live) setBranches(parseCanvas(text).items);
        })
        .catch((err: unknown) => {
          if (live) setError(String(err));
        });
    return () => {
      live = false;
    };
  }, [ctx, path]);
  async function send() {
    setBusy(true);
    setError('');
    try {
      const dest =
        path ||
        (await ctx.vault.freeName(
          '',
          name
            .trim()
            .replace(/[<>:"/\\|?*]/g, '-')
            .slice(0, 120),
          '.canvas.json',
        ));
      const note = entry.capture
        ? await saveEvidence(
            ctx,
            entry.capture,
            entry.title,
            entry.comment,
            entry.citekey,
            [],
            entry.subjects,
            entry.reference,
            true,
          )
        : entry.path;
      if (!note) throw new Error('Could not create the evidence note.');
      if (path) await ctx.vault.keepSnapshot(dest);
      const doc = path ? parseCanvas(await ctx.vault.readText(dest)) : emptyCanvas();
      const parent = doc.items.find((i) => i.id === branch);
      if (branch && !parent) throw new Error('The branch was removed. Choose another branch.');
      const x = parent ? parent.x + parent.width + 70 : 0;
      const y = doc.items
        .filter((i) => i.x < x + 320 && i.x + i.width > x)
        .reduce((bottom, i) => Math.max(bottom, i.y + i.height + 32), parent?.y ?? 0);
      const id = newId();
      doc.items.push({
        id,
        kind: 'page',
        path: note,
        x,
        y,
        width: 320,
        height: entry.figure ? 340 : 210,
        evidence: note,
        source: entry.source,
        heading: entry.heading,
        figure: entry.figure,
        excerpt: entry.excerpt,
        comment: entry.comment,
        citation: entry.citekey || entry.reference,
      });
      if (parent) doc.links.push({ id: newId(), from: parent.id, to: id });
      if (path) {
        await ctx.vault.writeText(dest, serialiseCanvas(doc));
      } else await ctx.vault.createNew(dest, serialiseCanvas(doc));
      await ctx.app.open(dest);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }
  if (!ctx.views.hasPageView('mind-maps.canvases'))
    return <p>Enable Mind maps and canvas in Settings → Modules to use evidence cards.</p>;
  return (
    <fieldset disabled={busy}>
      <legend>Send evidence to mind map</legend>
      <label>
        Map{' '}
        <select
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setBranch('');
            setBranches([]);
          }}
        >
          <option value="">New map</option>
          {maps.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      {path ? (
        <label>
          Branch{' '}
          <select
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
            }}
          >
            <option value="">Place on board</option>
            {branches.map((i) => (
              <option value={i.id} key={i.id}>
                {i.text || i.path || i.kind}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Map name{' '}
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
      )}
      <button type="button" disabled={!path && !name.trim()} onClick={() => void send()}>
        Add evidence card
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
