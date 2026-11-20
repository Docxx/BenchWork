import { useRef, useState } from 'react';
import type { CanvasItem, CanvasLink } from './canvasFile';

export interface BoardMatch {
  id: string;
  nodes: string[];
  label: string;
  edge?: boolean;
}

export function CanvasSearch({
  items,
  links,
  locate,
  close,
}: {
  items: CanvasItem[];
  links: CanvasLink[];
  locate: (match: BoardMatch) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const term = query.trim().toLocaleLowerCase();
  const matches: BoardMatch[] = [];
  if (term) {
    for (const item of items) {
      const label = [item.text, item.path, item['link']]
        .filter((value) => typeof value === 'string')
        .join(' ');
      if (label.toLocaleLowerCase().includes(term))
        matches.push({ id: item.id, nodes: [item.id], label });
    }
    for (const link of links) {
      if (typeof link.label === 'string' && link.label.toLocaleLowerCase().includes(term)) {
        matches.push({ id: link.id, nodes: [link.from, link.to], label: link.label, edge: true });
      }
    }
  }
  const index = matches.findIndex((m) => (m.edge ? 'edge-' : 'card-') + m.id === current);
  function step(direction: number) {
    const offset = index < 0 && direction < 0 ? 0 : index;
    const match = matches[(offset + direction + matches.length) % matches.length];
    if (!match) return;
    setCurrent((match.edge ? 'edge-' : 'card-') + match.id);
    locate(match);
    input.current?.focus();
  }
  return (
    <form
      className="canvas-toolbar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        step(1);
      }}
    >
      <input
        ref={input}
        autoFocus
        type="search"
        aria-label="Search this canvas"
        placeholder="Search cards, paths and arrows"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCurrent('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
          if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault();
            step(-1);
          }
        }}
      />
      <span role="status">
        {term &&
          (index >= 0
            ? `${String(index + 1)} of ${String(matches.length)} · ${matches[index]?.label.slice(0, 80) ?? ''}`
            : `${String(matches.length)} matches`)}
      </span>
      <button
        type="button"
        disabled={!matches.length}
        onClick={() => {
          step(-1);
        }}
      >
        Previous
      </button>
      <button type="submit" disabled={!matches.length}>
        Next
      </button>
      <button type="button" onClick={close}>
        Close search
      </button>
    </form>
  );
}
