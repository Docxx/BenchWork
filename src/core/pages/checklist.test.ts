import { checklistItems } from './checklist';

it('reads real checklist labels without counting examples in code or frontmatter', () => {
  const source = `---\ntype: page\nexample: '- [ ] Not a task'\n---\n# Run\n\n- [ ] Compare **control** with [[Pilot|the pilot]]\n  - [x] Record *baseline*\n\n\`\`\`md\n- [ ] Example only\n\`\`\`\n\n    - [ ] Indented code\n`;
  expect(checklistItems(source)).toEqual([
    { text: 'Compare control with the pilot', checked: false },
    { text: 'Record baseline', checked: true },
  ]);
});
it('keeps multiline labels and excludes normal bullet points', () => {
  expect(checklistItems('- Normal bullet\n- [ ] First line\n  second line\n')).toEqual([
    { text: 'First line\nsecond line', checked: false },
  ]);
});
