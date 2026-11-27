// @vitest-environment node
import { evidenceContent, parseCapture, type Capture } from './evidence';
import { partTargets } from '../manuscript/assemble';

const capture: Capture = {
  path: 'Papers/Tau.pdf',
  page: 3,
  highlightId: 'h1',
  text: 'A useful finding.\nWith limitations.',
  mode: 'structured',
};
it('preserves a verbatim excerpt, PDF page, highlight identity, citation and research links', () => {
  const note = evidenceContent(
    capture,
    'My observation',
    'smith2024',
    ['Experiments/Trial.md'],
    'abc',
  );
  expect(note.properties).toMatchObject({
    source: '[[Papers/Tau.pdf#page=3&highlight=h1]]',
    page: '3',
    sourceSha256: 'abc',
    highlightId: 'h1',
    related: ['[[Experiments/Trial.md]]'],
  });
  expect(note.body).toContain('> A useful finding.\n> With limitations.');
  expect(note.body).toContain('[@smith2024]');
  expect(note.body).toContain('## Methods and limitations');
  expect(note.body).toContain('My observation');
});
it('rejects malformed captures without inventing a source', () => {
  expect(parseCapture('oops')).toBeNull();
  expect(parseCapture(JSON.stringify({ ...capture, page: -1 }))).toBeNull();
  expect(parseCapture(JSON.stringify(capture))).toEqual(capture);
});
it('keeps research context out of the manuscript export section order', () => {
  expect(
    partTargets(
      '---\nevidence: ["[[Evidence]]"]\nanalyses: ["[[Run.analysis.yaml]]"]\n---\n# Results\n\nDraft [@smith2024]\n',
    ),
  ).toEqual([]);
});

it('sorts evidence by paper and page, by title, or by subject', async () => {
  const { sortEvidence } = await import('./EvidenceShelf');
  const row = (title: string, source: string, heading: string, subjects: string[] = []) => ({
    title,
    source,
    heading,
    subjects,
  });
  const rows = [
    row('Beta', 'Papers/B.pdf', 'page=2'),
    row('Alpha', 'Papers/B.pdf', 'page=10', ['Tau']),
    row('Gamma', 'Papers/A.pdf', 'page=5', ['Ageing']),
  ];
  const titles = (sort: 'source' | 'title' | 'subject') =>
    sortEvidence(rows, sort).map((r) => r.title);
  expect(titles('source')).toEqual(['Gamma', 'Beta', 'Alpha']);
  expect(titles('title')).toEqual(['Alpha', 'Beta', 'Gamma']);
  expect(titles('subject')).toEqual(['Beta', 'Gamma', 'Alpha']);
  expect(rows[0]?.title).toBe('Beta');
});
