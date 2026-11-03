// @vitest-environment node
import { DEFAULT_CALENDAR, parseCalendar } from './calendar';
import { parseHomeLayout } from './appSettings';
it('keeps calendar customisation and validates old or corrupt settings', () => {
  expect(parseCalendar(null)).toEqual(DEFAULT_CALENDAR);
  expect(
    parseCalendar({
      view: 'week',
      density: 'comfortable',
      weekStart: 'sunday',
      colour: 'purple',
      agenda: false,
    }),
  ).toMatchObject({
    view: 'week',
    density: 'comfortable',
    weekStart: 'sunday',
    colour: 'purple',
    agenda: false,
  });
  expect(
    parseCalendar({ view: 'year', density: 50, colour: '<script>', dailyPages: 'yes' }),
  ).toEqual(DEFAULT_CALENDAR);
  expect(parseHomeLayout({ calendar: { view: 'agenda' } }).calendar?.view).toBe('agenda');
});
