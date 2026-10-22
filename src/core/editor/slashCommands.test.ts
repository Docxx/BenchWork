// @vitest-environment node
import { filterSlashItems, SLASH_ITEMS } from './slashCommands';

const labels = (query: string) => filterSlashItems(query).map((i) => i.label);

describe('the / menu', () => {
  it('lists everything before anything is typed', () => {
    expect(labels('')).toEqual(SLASH_ITEMS.map((i) => i.label));
  });

  it('finds items by name or keyword, ignoring case', () => {
    expect(labels('head')).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
    expect(labels('H2')).toEqual(['Heading 2']);
    expect(labels('todo')).toEqual(['Checklist']);
    expect(labels('list')).toEqual(['Bullet list', 'Numbered list']);
    expect(labels('hr')).toEqual(['Divider']);
  });

  it('finds nothing for words that match nothing', () => {
    expect(labels('zzz')).toEqual([]);
  });
});
