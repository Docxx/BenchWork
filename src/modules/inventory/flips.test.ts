// @vitest-environment node
import { flipStock, flipsPage, nextFlip, tickedFlips } from './flips';
import { asText, linkLabel } from './kinds';

describe('flip reminders', () => {
  it('are due a set number of days after the last flip, or today if never flipped', () => {
    const today = '2026-10-28';
    expect(nextFlip(flipStock('w1118', { flipEvery: 14, lastFlipped: '2026-10-20' }), today)).toBe(
      '2026-11-03',
    );
    expect(nextFlip(flipStock('new', { flipEvery: '7' }), today)).toBe(today);
    expect(nextFlip(flipStock('kept', { lastFlipped: '2026-10-20' }), today)).toBeNull();
    // A date read from YAML as a date still counts.
    expect(flipStock('d', { flipEvery: 3, lastFlipped: new Date('2026-10-26') }).lastFlipped).toBe(
      '2026-10-26',
    );
  });

  it('are listed in one page, soonest first, as checklist lines', () => {
    const text = flipsPage(
      [
        flipStock('elav-GAL4', { flipEvery: 14, lastFlipped: '2026-10-20' }),
        flipStock('w1118', { flipEvery: 7, lastFlipped: '2026-10-22' }),
        flipStock('kept', {}),
      ],
      '2026-10-28',
    );
    expect(text).toContain(
      '- [ ] Flip [[w1118]] 📅 2026-10-29\n- [ ] Flip [[elav-GAL4]] 📅 2026-11-03\n',
    );
    expect(text).not.toContain('kept');
    expect(flipsPage([], '2026-10-28')).toContain('No stocks are set to be flipped');
  });

  it('know which flips were ticked', () => {
    expect(
      tickedFlips(
        '- [x] Flip [[w1118]] 📅 2026-10-29\n- [ ] Flip [[elav-GAL4]] 📅 2026-11-03\n- [X] Flip [[a|b]]',
      ),
    ).toEqual(['w1118', 'a']);
  });
});

describe('inventory values', () => {
  it('show dates as days, and links by their label', () => {
    expect(asText(new Date('2026-10-28T00:00:00Z'))).toBe('2026-10-28');
    expect(asText(14)).toBe('14');
    expect(asText(null)).toBe('');
    expect(linkLabel('[[w1118]] x [[elav-GAL4|elav]]')).toBe('w1118 x elav');
  });
});
