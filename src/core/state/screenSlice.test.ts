// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from './appStore';

describe('compact screens', () => {
  it('slide one thing over the page at a time, and put it away when the screen changes', () => {
    const store = createAppStore(new MemoryAdapter());
    const s = () => store.getState();
    expect(s().compact).toBe(false);
    s().setCompact(true);
    s().setDrawer('sidebar');
    expect(s().drawer).toBe('sidebar');
    s().setDrawer('panel');
    expect(s().drawer).toBe('panel');
    // Turning the tablet sideways puts both back beside the page.
    s().setCompact(false);
    expect(s().drawer).toBeNull();
  });
});

describe('pen tools', () => {
  it('keep each tool to its own colours, and notice the pen once', () => {
    const store = createAppStore(new MemoryAdapter());
    const s = () => store.getState();
    s().setPen({ colour: '#c0392b' });
    s().setPen({ tool: 'highlighter' });
    expect(s().pen.colour).toBe('#ffd84d');
    s().setPen({ tool: 'pen' });
    expect(s().pen.colour).toBe('#1d2725');
    expect(s().penSeen).toBe(false);
    s().notePen();
    expect(s().penSeen).toBe(true);
  });
});
