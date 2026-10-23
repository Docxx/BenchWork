// @vitest-environment node
import { assemble, joinPath, partTargets, stripFrontmatter, wordCount } from './assemble';

describe('manuscript parts', () => {
  it('are the links in order, once each, not embeds', () => {
    const text = [
      '---',
      'type: manuscript',
      '---',
      '1. [[Introduction]]',
      '2. [[Methods#Flies|the methods]] and ![[attachments/cover.png]]',
      '3. [[introduction]] again',
      '4. [[Results]]',
    ].join('\n');
    expect(partTargets(text)).toEqual(['Introduction', 'Methods', 'Results']);
  });

  it('lose their frontmatter, and Windows line endings', () => {
    expect(stripFrontmatter('---\r\nid: a\r\n---\r\n# Hi\r\nThere\r\n')).toBe('# Hi\nThere\n');
  });
});

describe('assembling', () => {
  const parts = [
    {
      title: 'Introduction',
      path: 'Thesis/Introduction.md',
      text: [
        '---',
        'id: p1',
        '---',
        '# Introduction',
        '',
        'Tau spreads [@smith2024, p. 4]; see [[Methods|our methods]] and #todo later.',
        '',
        '![[attachments/Pasted image 2026.png|400]]',
        '',
        '![Climbing by day](figures/climb.png)',
        '',
      ].join('\n'),
    },
    {
      title: 'Methods',
      path: 'Thesis/Chapters/Methods.md',
      text: [
        'Flies were kept at 25 °C.',
        '',
        '```',
        '[[not a link]] #not-a-tag',
        '```',
        '',
        '| Group | n |',
        '| --- | --- |',
        '| Control | 24 |',
        '',
        'Table: Flies per group',
        '',
        '![Western blot](../figures/blot.png)',
      ].join('\n'),
    },
  ];

  const { markdown, figures, tables } = assemble('Tau and climbing', 'Ray Price', parts);

  it('starts with a title block for Pandoc', () => {
    expect(markdown.startsWith('---\ntitle: "Tau and climbing"\nauthor: "Ray Price"\n')).toBe(true);
    expect(markdown).toContain('reference-section-title: "References"');
  });

  it('keeps citations for Pandoc and turns links into text', () => {
    expect(markdown).toContain('Tau spreads [@smith2024, p. 4]; see our methods and later.');
    expect(markdown).not.toContain('id: p1');
  });

  it('gives a part without a heading its name as one', () => {
    expect(markdown).toContain('# Methods\n\nFlies were kept at 25 °C.');
  });

  it('turns pictures into numbered figures, found from the vault folder', () => {
    expect(markdown).toContain('![](<attachments/Pasted image 2026.png>){width=400px}');
    expect(markdown).toContain('![Figure 1. Climbing by day](Thesis/figures/climb.png)');
    expect(markdown).toContain('![Figure 2. Western blot](Thesis/figures/blot.png)');
    expect(figures).toBe(2);
  });

  it('numbers table captions', () => {
    expect(markdown).toContain('Table: Table 1. Flies per group');
    expect(tables).toBe(1);
  });

  it('keeps line breaks written as two spaces', () => {
    const broken = assemble('T', null, [
      { title: 'A', path: 'A.md', text: '# A\n\nLine one  \nLine two\n' },
    ]);
    expect(broken.markdown).toContain('Line one  \nLine two');
  });

  it('leaves code exactly as it is', () => {
    expect(markdown).toContain('```\n[[not a link]] #not-a-tag\n```');
  });
});

describe('word counts', () => {
  it('count words a reader sees, not citations, code, pictures or syntax', () => {
    const text = [
      '---',
      'title: Not counted',
      '---',
      '# Two words',
      '',
      '**Bold** text, a [[Page|link here]] and [@smith2024] cited. Don’t forget e-mail.',
      '',
      '![[plot.png]] ![alt words](x.png)',
      '',
      '```',
      'code is not counted',
      '```',
      '#tag https://example.org/a-b',
    ].join('\n');
    // Two words (2); Bold text a link here and cited (7); Don’t forget e-mail (3).
    expect(wordCount(text)).toBe(12);
  });

  it('are nought for an empty page', () => {
    expect(wordCount('')).toBe(0);
  });
});

describe('paths', () => {
  it('are joined onto a folder, and never leave the vault', () => {
    expect(joinPath('Thesis/Chapters', '../figures/a.png')).toBe('Thesis/figures/a.png');
    expect(joinPath('', './a.png')).toBe('a.png');
    expect(joinPath('', '../a.png')).toBeNull();
  });
});
