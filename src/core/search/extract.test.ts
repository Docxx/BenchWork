// @vitest-environment node
import { extractFile, extractPage, inlineTags, linkKey, pageKeys } from './extract';

const FILE = { mtime: 1000, size: 10 };

const DOSE = [
  '---',
  'id: 8f3c',
  'type: experiment',
  'created: 2026-10-21T10:00:00+01:00',
  'tags: [lps, climbing]',
  '---',
  '# LPS dose',
  '',
  'Flies on **LPS** food, see [[Climbing assay|the assay]] and #todo.',
  '',
  '- Day 7 #Climbing',
  '',
  '```',
  'counts #notatag',
  '```',
  '',
  '![[attachments/plot.png]] ![graph](plot.png) `#alsonot`',
  '',
].join('\n');

describe('extractPage', () => {
  it('reads frontmatter, title and the page as plain text', () => {
    const page = extractPage('LPS model/Experiments/Dose.md', DOSE, FILE);
    expect(page).toMatchObject({
      path: 'LPS model/Experiments/Dose.md',
      id: '8f3c',
      title: 'Dose',
      type: 'experiment',
      created: '2026-10-21T10:00:00+01:00',
      modified: null,
      mtime: 1000,
      size: 10,
    });
    expect(page.body).toBe(
      [
        'LPS dose',
        'Flies on LPS food, see the assay and #todo.',
        'Day 7 #Climbing',
        'counts #notatag',
        'attachments/plot.png graph #alsonot',
      ].join('\n'),
    );
    expect(page.body).not.toContain('**');
  });

  it('collects links and embeds', () => {
    expect(extractPage('Dose.md', DOSE, FILE).links).toEqual([
      { target: 'Climbing assay', key: 'climbing assay', embed: false },
      { target: 'attachments/plot.png', key: 'attachments/plot.png', embed: true },
    ]);
  });

  it('collects frontmatter and inline tags, but not tags in code', () => {
    expect(extractPage('Dose.md', DOSE, FILE).tags).toEqual(['lps', 'climbing', 'todo']);
  });

  it('indexes pages whose frontmatter cannot be read', () => {
    const page = extractPage('Broken.md', '---\nid: [oops\n---\nStill here.\n', FILE);
    expect(page.id).toBeNull();
    expect(page.body).toBe('Still here.');
  });

  it('keeps Markdown it cannot show as raw text', () => {
    const page = extractPage('Raw.md', '<details>Hidden answer</details>\n', FILE);
    expect(page.body).toContain('Hidden answer');
  });
});

describe('tags', () => {
  it('follow Obsidian rules', () => {
    expect(inlineTags('#todo, #lab/flies and #2026-plan')).toEqual([
      'todo',
      'lab/flies',
      '2026-plan',
    ]);
    expect(inlineTags('#123 issue#12 a&#x27; https://x.org/#top')).toEqual([]);
    expect(inlineTags('(#café) #trailing/')).toEqual(['café', 'trailing']);
  });
});

describe('link keys', () => {
  it('ignore case, headings, blocks and .md', () => {
    expect(linkKey('Climbing Assay#Methods')).toBe('climbing assay');
    expect(linkKey('Lab/Plan.md')).toBe('lab/plan');
    expect(linkKey('Plan^abc')).toBe('plan');
    expect(linkKey('./Plan')).toBe('plan');
  });

  it('match a page by full path or by name', () => {
    expect(pageKeys('Lab/Plan.md')).toEqual(['lab/plan', 'plan']);
    expect(pageKeys('Plan.md')).toEqual(['plan']);
  });
});

describe('sized images', () => {
  it('leave their size out of the text', () => {
    const text = '![[plot.png|300]] ![[blot.png|Western blot|250]] ![graph|400](g.png)\n';
    const page = extractPage('A.md', text, FILE);
    expect(page.body).toBe('plot.png Western blot graph');
  });
});

describe('properties and records', () => {
  it('searches property values and counts links in them', () => {
    const page = extractPage(
      'Lab/Dose.md',
      [
        '---',
        'type: experiment',
        'genotypes: [w1118, elav>tau]',
        "datasets: ['[[climbing-day7]]']",
        '---',
        'Flies moved.',
      ].join('\n'),
      FILE,
    );
    expect(page.body).toBe('w1118, elav>tau\nclimbing-day7\nFlies moved.');
    expect(page.links).toEqual([{ target: 'climbing-day7', key: 'climbing-day7', embed: false }]);
  });

  it('reads records: their kind is the type and their name the title', () => {
    const record = extractFile(
      'Lab/Data/climbing-day7.dataset.yaml',
      [
        'id: 42ab',
        'experiment: "[[Dose]]"',
        'instrument: Camera 2',
        'tags: [climbing]',
        'files:',
        '  - path: Lab/Data/day7.csv',
      ].join('\n'),
      FILE,
    );
    expect(record).toMatchObject({
      id: '42ab',
      title: 'climbing-day7',
      type: 'dataset',
      tags: ['climbing'],
      links: [{ target: 'Dose', key: 'dose', embed: false }],
      body: 'Dose\nCamera 2\nLab/Data/day7.csv',
    });
  });

  it('indexes records it cannot read with no text', () => {
    expect(extractFile('a.dataset.yaml', 'a: [', FILE)).toMatchObject({
      title: 'a',
      type: 'dataset',
      body: '',
    });
  });

  it('links to records without their ending', () => {
    expect(linkKey('Data/climbing-day7.dataset.yaml')).toBe('data/climbing-day7');
    expect(pageKeys('Data/climbing-day7.dataset.yaml')).toEqual([
      'data/climbing-day7',
      'climbing-day7',
    ]);
  });
});
