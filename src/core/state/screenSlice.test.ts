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
  it('remember each tool’s own colour, and notice the pen once', () => {
    const store = createAppStore(new MemoryAdapter());
    const s = () => store.getState();
    s().setPen({ colour: '#c0392b' });
    s().setPen({ tool: 'highlighter' });
    expect(s().pen.colour).toBe('#ffd84d');
    s().setPen({ tool: 'pen' });
    expect(s().pen.colour).toBe('#c0392b');
    expect(s().penSeen).toBe(false);
    s().notePen();
    expect(s().penSeen).toBe(true);
  });
});

describe('favourite pens', () => {
  it('keeps the pen in use once, on this device, and removes it', async () => {
    const platform = new MemoryAdapter();
    const store = createAppStore(platform);
    const s = () => store.getState();
    s().setPen({ colour: '#2f5fb3', width: 6 });
    await s().savePen();
    await s().savePen();
    expect(s().settings.pens).toEqual([{ tool: 'pen', colour: '#2f5fb3', width: 6 }]);
    expect(await platform.loadAppSettings()).toMatchObject({
      pens: [{ tool: 'pen', colour: '#2f5fb3', width: 6 }],
    });
    s().setPen({ tool: 'eraser' });
    await s().savePen();
    expect(s().settings.pens).toHaveLength(1);
    await s().removePen(0);
    expect(s().settings.pens).toEqual([]);
  });
});

describe('what the pen does', () => {
  it('draws by default, and turns handwriting into text only when chosen, saved per device', async () => {
    const platform = new MemoryAdapter();
    const store = createAppStore(platform);
    const s = () => store.getState();
    s().applyPenMode();
    expect(platform.stylusHandwriting).toBe(false);
    await s().setPenMode('text');
    expect(platform.stylusHandwriting).toBe(true);
    expect(await platform.loadAppSettings()).toMatchObject({ penMode: 'text' });
  });
});
