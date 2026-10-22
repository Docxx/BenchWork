// @vitest-environment node
import { ensureId, localTimestamp, parsePage, serialisePage, updateMeta } from './frontmatter';

const EXPERIMENT = [
  '---',
  'id: 8f3c2a1e-4b7d-4e2a-9c11-2d5f6a7b8c90',
  'type: experiment',
  'project: LPS-model',
  'date: 2026-10-21',
  '# dose in µg/ml',
  'genotypes: [w1118, elav>tau]',
  'tags: [lps, climbing]',
  '---',
  '',
  '## Notes',
  'Flies transferred 10:30.',
  '',
].join('\n');

const roundTrip = (text: string) => serialisePage(parsePage(text));

describe('parsePage', () => {
  it('reads the keys BenchWork uses and leaves the rest alone', () => {
    const page = parsePage(EXPERIMENT);
    expect(page.meta).toEqual({
      id: '8f3c2a1e-4b7d-4e2a-9c11-2d5f6a7b8c90',
      type: 'experiment',
      created: null,
      modified: null,
      tags: ['lps', 'climbing'],
    });
    expect(page.body).toBe('\n## Notes\nFlies transferred 10:30.\n');
    expect(page.error).toBeNull();
  });

  it.each([
    ['the SPEC example', EXPERIMENT],
    ['no frontmatter', '# Just a page\n\nText\n'],
    ['an empty block', '---\n---\nBody\n'],
    ['Windows line endings', '---\r\nid: abc\r\n---\r\nLine 1\r\nLine 2\r\n'],
    ['a byte order mark', '﻿---\nid: abc\n---\nBody'],
    ['no final newline', '---\nid: abc\n---\nBody'],
    ['a horizontal rule later on', 'Intro\n\n---\n\nMore\n'],
    ['an unclosed block', '---\nid: abc\nNo closing fence\n'],
    ['an empty file', ''],
  ])('saves a page with %s exactly as it was', (_name, text) => {
    expect(roundTrip(text)).toBe(text);
  });

  it('accepts tags as a comma-separated string, dropping # and duplicates', () => {
    expect(parsePage('---\ntags: "#lps, climbing, lps"\n---\n').meta.tags).toEqual([
      'lps',
      'climbing',
    ]);
  });

  it('keeps broken YAML exactly, reports it, and refuses to change it', () => {
    const text = '---\nid: [unclosed\n---\nBody\n';
    const page = parsePage(text);
    expect(page.error).not.toBeNull();
    expect(serialisePage(page)).toBe(text);
    expect(() => updateMeta(page, { modified: 'now' })).toThrow('left alone');
    expect(
      ensureId(
        page,
        () => 'new',
        () => 'now',
      ),
    ).toBe(page);
  });
});

describe('updateMeta', () => {
  it('changes one key and keeps comments, order and unknown keys', () => {
    const updated = serialisePage(updateMeta(parsePage(EXPERIMENT), { type: 'protocol' }));
    expect(updated).toBe(EXPERIMENT.replace('type: experiment', 'type: protocol'));
  });

  it('adds new keys at the end, except id, which goes first', () => {
    const page = updateMeta(parsePage('---\ntitle: Day 1\n---\nBody'), {
      modified: '2026-10-22T10:30:00+01:00',
      id: 'abc',
    });
    expect(serialisePage(page)).toBe(
      '---\nid: abc\ntitle: Day 1\nmodified: 2026-10-22T10:30:00+01:00\n---\nBody',
    );
    expect(page.meta.id).toBe('abc');
  });

  it('removes keys set to null or an empty tag list', () => {
    const page = updateMeta(parsePage('---\nid: abc\ntags: [a]\nother: 1\n---\n'), {
      tags: [],
      id: null,
    });
    expect(serialisePage(page)).toBe('---\nother: 1\n---\n');
  });

  it('keeps Windows line endings when changing the frontmatter', () => {
    const page = updateMeta(parsePage('---\r\nid: abc\r\n---\r\nBody\r\n'), { type: 'daily' });
    expect(serialisePage(page)).toBe('---\r\nid: abc\r\ntype: daily\r\n---\r\nBody\r\n');
  });

  it('replaces a block list in place, leaving the lines around it alone', () => {
    const text = '---\nproject: LPS\ntags:\n  - old\n  - older\n# keep this comment\nend: 1\n---\n';
    expect(serialisePage(updateMeta(parsePage(text), { tags: ['new', 'lps'] }))).toBe(
      '---\nproject: LPS\ntags: [new, lps]\n# keep this comment\nend: 1\n---\n',
    );
  });

  it('quotes values that would not read back as text', () => {
    const page = updateMeta(parsePage('---\na: 1\n---\n'), { type: 'yes: really' });
    expect(page.meta.type).toBe('yes: really');
    expect(page.yaml).toBe('a: 1\ntype: "yes: really"');
  });

  it('refuses frontmatter that is not a set of keys', () => {
    expect(() => updateMeta(parsePage('---\n- a\n- b\n---\n'), { id: 'x' })).toThrow('left alone');
  });
});

describe('ensureId', () => {
  const newId = () => '11111111-2222-4333-8444-555555555555';
  const now = () => '2026-10-22T10:30:00+01:00';

  it('adds an id and created time to a page without frontmatter', () => {
    const page = ensureId(parsePage('# Day 1\n'), newId, now);
    expect(serialisePage(page)).toBe(
      '---\nid: 11111111-2222-4333-8444-555555555555\ncreated: 2026-10-22T10:30:00+01:00\n---\n# Day 1\n',
    );
  });

  it('keeps an existing created time and leaves a page that has an id alone', () => {
    const withCreated = ensureId(parsePage('---\ncreated: 2020-01-01\n---\nx'), newId, now);
    expect(withCreated.meta.created).toBe('2020-01-01');
    const withId = parsePage('---\nid: keep-me\n---\nx');
    expect(ensureId(withId, newId, now)).toBe(withId);
  });
});

describe('localTimestamp', () => {
  it('formats with the local offset', () => {
    expect(localTimestamp(new Date(2026, 9, 22, 10, 30, 5))).toMatch(
      /^2026-10-22T10:30:05[+-]\d{2}:\d{2}$/,
    );
  });
});
