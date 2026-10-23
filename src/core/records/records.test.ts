// @vitest-environment node
import {
  isRecord,
  parseRecord,
  propertyLinks,
  propertyText,
  recordFileName,
  recordKind,
  recordName,
  updateRecord,
  withoutRecordEnding,
} from './records';

describe('record names', () => {
  it('reads the kind and name from `<name>.<kind>.yaml`', () => {
    expect(recordKind('Data/climbing-day7.dataset.yaml')).toBe('dataset');
    expect(recordKind('scan.Link.YML')).toBe('link');
    expect(recordName('Data/climbing-day7.dataset.yaml')).toBe('climbing-day7');
    expect(recordName('big video.mp4.link.yaml')).toBe('big video.mp4');
    expect(recordFileName('climbing-day7', 'dataset')).toBe('climbing-day7.dataset.yaml');
  });

  it('leaves other files alone', () => {
    for (const name of ['config.yaml', 'notes.md', '.dataset.yaml', 'a.dataset.json']) {
      expect(isRecord(name)).toBe(false);
      expect(recordName(name)).toBe(name);
    }
  });

  it('drops the ending from a path, as links write it', () => {
    expect(withoutRecordEnding('Data/climbing-day7.dataset.yaml')).toBe('Data/climbing-day7');
    expect(withoutRecordEnding('Data/notes')).toBe('Data/notes');
  });
});

describe('reading and changing records', () => {
  const text = [
    '# Climbing assay, day 7',
    'id: 1111',
    'description: Flies at day 7',
    'files:',
    '  - path: Data/day7.csv',
    '    sha256: abc',
    '',
  ].join('\n');

  it('parses keys, and reports files it cannot read', () => {
    expect(parseRecord(text)).toEqual({
      data: {
        id: 1111,
        description: 'Flies at day 7',
        files: [{ path: 'Data/day7.csv', sha256: 'abc' }],
      },
      error: null,
    });
    expect(parseRecord('').error).toBeNull();
    expect(parseRecord('- a\n- b').error).not.toBeNull();
    expect(parseRecord('a: [').error).not.toBeNull();
  });

  it('changes keys and keeps comments and order', () => {
    const next = updateRecord(text, { description: 'Day 7 climbing', instrument: 'Camera 2' });
    expect(next.split('\n')[0]).toBe('# Climbing assay, day 7');
    expect(parseRecord(next).data).toMatchObject({
      id: 1111,
      description: 'Day 7 climbing',
      instrument: 'Camera 2',
    });
    expect(Object.keys(parseRecord(next).data)).toEqual([
      'id',
      'description',
      'files',
      'instrument',
    ]);
    expect(parseRecord(updateRecord(next, { instrument: null })).data).not.toHaveProperty(
      'instrument',
    );
  });

  it('refuses to write over a file it cannot read', () => {
    expect(() => updateRecord('a: [', { b: 1 })).toThrow();
  });
});

describe('property values', () => {
  const data = {
    id: 'x',
    type: 'experiment',
    tags: ['lps'],
    aim: 'Dose response of LPS',
    genotypes: ['w1118', 'elav>tau'],
    protocol: '[[LPS feeding v3]]',
    datasets: ['[[climbing-day7]]', '[[Data/scan|Scan]]'],
    files: [{ path: 'Data/day7.csv', size: 120 }],
  };

  it('gives values as text to search, without the quiet keys', () => {
    expect(propertyText(data)).toBe(
      [
        'Dose response of LPS',
        'w1118, elav>tau',
        'LPS feeding v3',
        'climbing-day7, Data/scan',
        'Data/day7.csv, 120',
      ].join('\n'),
    );
  });

  it('finds links in values', () => {
    expect(propertyLinks(data)).toEqual(['LPS feeding v3', 'climbing-day7', 'Data/scan']);
  });
});
