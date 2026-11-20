import { branchOutline } from './branchOutline';
import { parseCanvas } from './canvasFile';

it('keeps shared evidence in each relevant section and stops at cyclic arrows', () => {
  const doc = parseCanvas(
    JSON.stringify({
      items: [
        { id: 'root', kind: 'text', text: 'Discussion' },
        { id: 'a', kind: 'text', text: 'Mechanism', y: 150 },
        { id: 'b', kind: 'text', text: 'Alternatives', y: 0 },
        { id: 'e', kind: 'page', evidence: 'Research/Finding.md' },
      ],
      links: [
        ['root', 'a'],
        ['root', 'b'],
        ['a', 'e'],
        ['b', 'e'],
        ['e', 'root'],
        ['a', 'b'],
      ].map(([from, to]) => ({ from, to })),
    }),
  );
  const root = doc.items[0];
  if (!root) throw new Error('Missing root');
  expect(branchOutline(doc, root)).toEqual({
    title: 'Discussion',
    sections: [
      { id: 'b', title: 'Alternatives', evidence: ['Research/Finding.md'] },
      { id: 'a', title: 'Mechanism', evidence: ['Research/Finding.md'] },
    ],
  });
});
