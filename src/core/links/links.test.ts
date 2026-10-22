// @vitest-environment node
import type { PageRef } from '../platform';
import { candidates, linkTargetFor, resolveLink, suffixKeys, suggestPages } from './resolve';
import { rewriteLinks } from './rewrite';

const ref = (path: string): PageRef => ({
  path,
  title: (path.split('/').pop() ?? path).replace(/\.md$/, ''),
  id: null,
});

const PAGES = [
  ref('Lab/Plan.md'),
  ref('Lab/Experiments/Dose.md'),
  ref('Home/Plan.md'),
  ref('Daily/2026-10-22.md'),
  ref('Climbing assay.md'),
];

describe('resolveLink', () => {
  it('finds a page by name, ignoring case and .md', () => {
    expect(resolveLink('Climbing Assay', 'Daily/2026-10-22.md', PAGES)?.path).toBe(
      'Climbing assay.md',
    );
    expect(resolveLink('Dose.md', null, PAGES)?.path).toBe('Lab/Experiments/Dose.md');
    expect(resolveLink('Dose#Methods', null, PAGES)?.path).toBe('Lab/Experiments/Dose.md');
  });

  it('finds a page by the end of its path', () => {
    expect(resolveLink('Experiments/Dose', null, PAGES)?.path).toBe('Lab/Experiments/Dose.md');
    expect(resolveLink('Home/Plan', 'Lab/Experiments/Dose.md', PAGES)?.path).toBe('Home/Plan.md');
    expect(resolveLink('ments/Dose', null, PAGES)).toBeNull();
  });

  it('picks the nearest page when names clash', () => {
    expect(resolveLink('Plan', 'Home/Other.md', PAGES)?.path).toBe('Home/Plan.md');
    expect(resolveLink('Plan', 'Lab/Experiments/Dose.md', PAGES)?.path).toBe('Lab/Plan.md');
    // Neither nearer: the shorter path, then alphabetical.
    expect(candidates('Plan', 'Daily/2026-10-22.md', PAGES).map((p) => p.path)).toEqual([
      'Lab/Plan.md',
      'Home/Plan.md',
    ]);
  });

  it('finds nothing for pages that do not exist yet', () => {
    expect(resolveLink('Western blot', null, PAGES)).toBeNull();
    expect(resolveLink('  ', null, PAGES)).toBeNull();
  });
});

describe('linkTargetFor', () => {
  it('uses the name when it is unique, else enough of the path', () => {
    expect(linkTargetFor('Lab/Experiments/Dose.md', PAGES)).toBe('Dose');
    expect(linkTargetFor('Lab/Plan.md', PAGES)).toBe('Lab/Plan');
    expect(linkTargetFor('Climbing assay.md', PAGES)).toBe('Climbing assay');
  });

  it('gives every ending of a path as a key', () => {
    expect(suffixKeys('Lab/Experiments/Dose.md')).toEqual([
      'lab/experiments/dose',
      'experiments/dose',
      'dose',
    ]);
  });
});

describe('suggestPages', () => {
  it('puts exact and starting matches first', () => {
    const pages = [ref('Plan B.md'), ref('Plan.md'), ref('My plan.md'), ref('Climbing.md')];
    expect(suggestPages('plan', pages).map((p) => p.title)).toEqual(['Plan', 'Plan B', 'My plan']);
    expect(suggestPages('my pl', pages).map((p) => p.title)).toEqual(['My plan']);
    expect(suggestPages('', pages, 2).map((p) => p.title)).toEqual(['Climbing', 'My plan']);
  });
});

describe('rewriteLinks', () => {
  const rename = (target: string) => (target === 'Plan' ? 'October plan' : null);

  it('changes only link targets, keeping embeds, headings and aliases', () => {
    const text =
      'See [[Plan]], ![[Plan]], [[Plan#Goals|goals]] and [[Plan^b1]].\r\nNot [[Other]].\r\n';
    expect(rewriteLinks(text, rename)).toEqual({
      text: 'See [[October plan]], ![[October plan]], [[October plan#Goals|goals]] and [[October plan^b1]].\r\nNot [[Other]].\r\n',
      count: 4,
    });
  });

  it('leaves links in code and escaped links alone', () => {
    const text = [
      '```',
      '[[Plan]]',
      '```',
      'Use `[[Plan]]` or \\[[Plan]] but [[Plan]].',
      '~~~~',
      '[[Plan]]',
      '~~~~',
      '',
    ].join('\n');
    const result = rewriteLinks(text, rename);
    expect(result.count).toBe(1);
    expect(result.text).toBe(text.replace('but [[Plan]]', 'but [[October plan]]'));
  });

  it('updates links in frontmatter too', () => {
    const text = "---\nprotocol: '[[Plan]]'\n---\nBody\n";
    expect(rewriteLinks(text, rename).text).toBe("---\nprotocol: '[[October plan]]'\n---\nBody\n");
  });

  it('returns the text unchanged when nothing matches', () => {
    const text = 'No links here.\n';
    expect(rewriteLinks(text, rename)).toEqual({ text, count: 0 });
  });
});
