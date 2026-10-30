// @vitest-environment node
import {
  closeWidget,
  defaultDocks,
  dockContents,
  homeWidgets,
  parseDocks,
  placeWidget,
  SIDE_START,
} from './layout';

const widgets = [
  { id: 'core.outline' },
  { id: 'core.backlinks' },
  { id: 'core.calendar', starts: { home: true } },
  { id: 'tasks.due', starts: { home: true, side: true } },
  { id: 'lab.timers', starts: { home: true } },
];

describe('docks', () => {
  it('start with the outline and links beside pages, then widgets that start there', () => {
    expect(dockContents(defaultDocks(), widgets)).toEqual({
      left: [],
      rightTop: [...SIDE_START, 'tasks.due'],
      rightBottom: [],
    });
  });

  it('move a widget, keeping those that arrived by themselves where they are', () => {
    const docks = defaultDocks();
    const moved = placeWidget(docks, dockContents(docks, widgets), 'core.calendar', 'left');
    expect(dockContents(moved, widgets)).toEqual({
      left: ['core.calendar'],
      rightTop: ['core.outline', 'core.backlinks', 'tasks.due'],
      rightBottom: [],
    });
    const again = placeWidget(moved, dockContents(moved, widgets), 'tasks.due', 'rightBottom', 0);
    expect(dockContents(again, widgets)).toEqual({
      left: ['core.calendar'],
      rightTop: ['core.outline', 'core.backlinks'],
      rightBottom: ['tasks.due'],
    });
  });

  it('keep closed widgets away, until placed again', () => {
    const closed = closeWidget(defaultDocks(), 'tasks.due');
    expect(dockContents(closed, widgets).rightTop).toEqual(SIDE_START);
    const back = placeWidget(closed, dockContents(closed, widgets), 'tasks.due', 'left');
    expect(dockContents(back, widgets).left).toEqual(['tasks.due']);
    expect(back.closed).toEqual([]);
  });

  it('leave out widgets of modules that are off, but remember where they were', () => {
    const docks = { ...defaultDocks(), left: ['papers.latest', 'core.calendar'] };
    expect(dockContents(docks, widgets).left).toEqual(['core.calendar']);
    expect(docks.left).toContain('papers.latest');
  });

  it('are read back from settings, sizes kept in range', () => {
    expect(parseDocks({ left: ['a', 3], leftSize: 5000, rightSplit: 0.01 })).toMatchObject({
      left: ['a'],
      rightTop: [],
      leftSize: 900,
      rightSplit: 0.15,
    });
    expect(parseDocks('junk')).toEqual(defaultDocks());
  });

  it('put on Home what starts there and what was added', () => {
    expect(homeWidgets(widgets, ['core.outline'])).toEqual([
      'core.outline',
      'core.calendar',
      'tasks.due',
      'lab.timers',
    ]);
  });
});
