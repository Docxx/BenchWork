import type { CanvasDoc, CanvasItem } from './canvasFile';
export interface OutlineSection {
  id: string;
  title: string;
  evidence: string[];
}
export interface BranchOutline {
  title: string;
  sections: OutlineSection[];
}
const titleOf = (i: CanvasItem) =>
  (
    i.text?.split('\n').find((line) => line.trim()) ||
    i.path?.split('/').at(-1)?.replace(/\.md$/i, '') ||
    i.kind
  ).trim();
export function branchOutline(doc: CanvasDoc, root: CanvasItem): BranchOutline {
  const items = new Map(doc.items.map((i) => [i.id, i]));
  const outgoing = new Map<string, Set<string>>();
  for (const link of doc.links) {
    const next = outgoing.get(link.from) ?? new Set<string>();
    next.add(link.to);
    outgoing.set(link.from, next);
  }
  const children = [...(outgoing.get(root.id) ?? [])]
    .flatMap((id) => items.get(id) ?? [])
    .filter((i) => i.id !== root.id)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const branches = children.filter((i) => !i['evidence']);
  const roots = new Set(branches.map((i) => i.id));
  function section(item: CanvasItem): OutlineSection {
    const seen = new Set<string>();
    const evidence = new Set<string>();
    const queue = [item];
    while (queue.length) {
      const current = queue.pop();
      if (!current || seen.has(current.id)) continue;
      seen.add(current.id);
      if (typeof current['evidence'] === 'string') evidence.add(current['evidence']);
      for (const id of outgoing.get(current.id) ?? []) {
        const child = items.get(id);
        if (child && id !== root.id && !roots.has(id)) queue.push(child);
      }
    }
    return { id: item.id, title: titleOf(item), evidence: [...evidence] };
  }
  const sections = branches.map(section);
  const direct = section(root);
  if (!sections.length || direct.evidence.length) sections.unshift(direct);
  return { title: titleOf(root), sections };
}
