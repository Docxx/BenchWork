export interface CalendarPreferences {
  view: 'month' | 'week' | 'agenda';
  density: 'compact' | 'comfortable';
  weekStart: 'monday' | 'sunday';
  colour: 'theme' | 'blue' | 'teal' | 'purple' | 'orange';
  agenda: boolean;
  dailyPages: boolean;
}
export const DEFAULT_CALENDAR: CalendarPreferences = {
  view: 'month',
  density: 'compact',
  weekStart: 'monday',
  colour: 'theme',
  agenda: true,
  dailyPages: true,
};
export function parseCalendar(value: unknown): CalendarPreferences {
  const result = { ...DEFAULT_CALENDAR };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const data = value as Record<string, unknown>;
  if (['month', 'week', 'agenda'].includes(String(data['view'])))
    result.view = data['view'] as CalendarPreferences['view'];
  if (data['density'] === 'compact' || data['density'] === 'comfortable')
    result.density = data['density'];
  if (data['weekStart'] === 'monday' || data['weekStart'] === 'sunday')
    result.weekStart = data['weekStart'];
  if (['theme', 'blue', 'teal', 'purple', 'orange'].includes(String(data['colour'])))
    result.colour = data['colour'] as CalendarPreferences['colour'];
  for (const key of ['agenda', 'dailyPages'] as const)
    if (typeof data[key] === 'boolean') result[key] = data[key];
  return result;
}
