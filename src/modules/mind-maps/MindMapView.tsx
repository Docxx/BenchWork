import { useEffect, useRef, useState } from 'react';
import type { ModuleContext } from '@core/api';
import type { Markmap } from 'markmap-view';
import { countNodes, outlineOf, type OutlineNode } from './outline';

type MarkmapNode = NonNullable<Parameters<typeof Markmap.create>[2]>;

/** Branch colours, the same as the section colours. */
const COLOURS = ['#3a7bd5', '#2a9d8f', '#4c9a2a', '#e07a1f', '#d1495b', '#8a5cc2', '#d9a400'];

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

/** Markmap's tree, each node tagged with its place in `nodes`, for clicks. */
function toMarkmap(node: OutlineNode, nodes: OutlineNode[]): MarkmapNode {
  const index = nodes.push(node) - 1;
  return {
    content: `<span class="mind-node" data-node="${String(index)}">${escapeHtml(node.text)}</span>`,
    children: node.children.map((child) => toMarkmap(child, nodes)),
  };
}

/** The page's headings and bullet points as a mind map. Click a branch to go to it. */
export function MindMapView({ ctx, path }: { ctx: ModuleContext; path: string | null }) {
  const [outline, setOutline] = useState<OutlineNode | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (path === null) return;
    let current = true;
    const title = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    ctx.vault
      .readText(path)
      .then((text) => {
        if (current) setOutline(outlineOf(title, text));
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    return () => {
      current = false;
    };
  }, [ctx, path, reads]);

  // Drawn again when the page changes.
  useEffect(() => {
    if (path === null) return;
    const watching = ctx.vault.watch((change) => {
      if (change.paths.includes(path)) setReads((n) => n + 1);
    });
    return () => {
      watching.dispose();
    };
  }, [ctx, path]);

  useEffect(() => {
    const element = svg.current;
    if (!element || outline === null || path === null) return;
    let current = true;
    let map: Markmap | null = null;
    const nodes: OutlineNode[] = [];
    const data = toMarkmap(outline, nodes);

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[data-node]') : null;
      const node = nodes[Number(target?.getAttribute('data-node'))];
      if (!node) return;
      void ctx.app.open(path, node.heading === null ? undefined : { heading: node.heading });
    };
    element.addEventListener('click', onClick);

    import('markmap-view')
      .then(({ Markmap: View }) => {
        if (!current) return;
        element.replaceChildren();
        map = View.create(
          element,
          {
            autoFit: true,
            duration: 300,
            maxWidth: 280,
            initialExpandLevel: -1,
            // Each main branch keeps one colour.
            color: (node) =>
              COLOURS[Number(node.state.path.split('.')[1] ?? 0) % COLOURS.length] ?? '#3a7bd5',
          },
          data,
        );
      })
      .catch((err: unknown) => {
        if (current) setProblem(err instanceof Error ? err.message : String(err));
      });
    return () => {
      current = false;
      element.removeEventListener('click', onClick);
      map?.destroy();
    };
  }, [ctx, path, outline]);

  if (path === null) return <p className="page-empty">Open a page first.</p>;
  if (problem !== null)
    return <p className="notice">This mind map could not be drawn. {problem}</p>;
  if (outline === null) return <p className="hint">Reading the page…</p>;

  return (
    <div className="mind-map">
      {countNodes(outline) === 0 ? (
        <p className="page-empty">
          This page has no headings or bullet points yet. Add some to see them as a mind map.
        </p>
      ) : (
        <>
          <p className="hint">Click a branch to go to it in the page. Click a circle to fold it.</p>
          <svg ref={svg} className="mind-map-area" role="img" aria-label="Mind map" />
        </>
      )}
    </div>
  );
}
