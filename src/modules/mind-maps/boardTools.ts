import { emptyCanvas, newId, type CanvasDoc, type CanvasItem } from './canvasFile';
import type { OutlineNode } from './outline';

type Topic = Pick<OutlineNode, 'text'> & { children: Topic[] };
const colours = ['blue', 'teal', 'orange', 'purple', 'green', 'pink'] as const;

/** Lay leaves on separate rows and centre each parent between its outer children. */
export function outlineCanvas(root: Topic): CanvasDoc {
  const doc = emptyCanvas();
  let row = 0;
  function place(topic: Topic, depth: number, branch: number): CanvasItem {
    const item: CanvasItem = {
      id: newId(),
      kind: 'text',
      text: topic.text,
      x: depth * 300,
      y: 0,
      width: 220,
      height: 90,
      shape: 'rounded',
      fill: colours[branch % colours.length],
      ...(depth === 0 ? { textSize: 'large' } : {}),
    };
    doc.items.push(item);
    const children = topic.children.map((child, index) => {
      const node = place(child, depth + 1, depth === 0 ? index : branch);
      doc.links.push({ id: newId(), from: item.id, to: node.id });
      return node;
    });
    const first = children.at(0);
    const last = children.at(-1);
    item.y = first && last ? (first.y + last.y) / 2 : row++ * 130;
    return item;
  }
  place(root, 0, 0);
  return doc;
}

export const starters = {
  'Mind map': ['First idea', 'Second idea', 'Third idea'],
  Retrospective: ['What went well?', 'What was difficult?', 'What will we try?'],
  'Project plan': ['Goals', 'Milestones', 'Resources', 'Risks'],
};

export function starterCanvas(title: string, template: keyof typeof starters | '') {
  if (!template) return emptyCanvas();
  return outlineCanvas({
    text: title,
    children: starters[template].map((text) => ({ text, children: [] })),
  });
}
