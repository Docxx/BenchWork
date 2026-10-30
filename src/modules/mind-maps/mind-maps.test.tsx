import { act, fireEvent, render, screen } from '@testing-library/react';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { PageView } from '@core/ui/PageView';
import manifestJson from './manifest.json';
import { facingSides } from './CanvasEditor';
import { kindForPath, parseCanvas, serialiseCanvas } from './canvasFile';
import { countNodes, outlineOf, plainText, type OutlineNode } from './outline';

// Tests may reach core internals to set the app up; the module itself may not.

// jsdom cannot lay out SVG, so Markmap is a stand-in that draws the node labels.
interface PureNode {
  content: string;
  children: PureNode[];
}
const drawn: PureNode[] = [];
vi.mock('markmap-view', () => ({
  Markmap: {
    create: (svg: SVGSVGElement, _options: unknown, data: PureNode) => {
      drawn.push(data);
      const add = (node: PureNode) => {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        label.innerHTML = node.content;
        svg.appendChild(label);
        node.children.forEach(add);
      };
      add(data);
      return { destroy: () => undefined };
    },
  },
}));

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'mind-maps');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

const settle = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const PAGE = [
  '---',
  'id: 1',
  '---',
  '# Fly climbing',
  '',
  '## Aims',
  '',
  '- Measure climbing after **LPS**',
  '  - Day 7',
  '\t- Day 14',
  '- [ ] Compare [[Genotypes|genotypes]]',
  '',
  '## Methods',
  '',
  'Some text.',
  '',
  '1. Negative geotaxis',
  '',
  '```',
  '# not a heading',
  '- not a bullet',
  '```',
  '',
  '### Analysis',
  '',
  '- Mixed model',
].join('\n');

/** An outline as indented text, for comparing. */
function shape(node: OutlineNode, depth = 0): string[] {
  return [
    `${'  '.repeat(depth)}${node.text}${node.heading !== null ? ` [${node.heading}]` : ''}`,
    ...node.children.flatMap((c) => shape(c, depth + 1)),
  ];
}

describe('Mind maps: a page as an outline', () => {
  it('turns headings and bullet points into branches', () => {
    expect(shape(outlineOf('Fly climbing', PAGE))).toEqual([
      'Fly climbing [Fly climbing]',
      '  Aims [Aims]',
      '    Measure climbing after LPS [Aims]',
      '      Day 7 [Aims]',
      // A tab reaches past the two spaces above, so it nests, as in Markdown.
      '        Day 14 [Aims]',
      '    Compare genotypes [Aims]',
      '  Methods [Methods]',
      '    Negative geotaxis [Methods]',
      '    Analysis [Analysis]',
      '      Mixed model [Analysis]',
    ]);
  });

  it('keeps a first heading that differs from the title as a branch', () => {
    const outline = outlineOf('Notes', '# Monday\n\n- Order food\n# Tuesday\n');
    expect(shape(outline)).toEqual([
      'Notes',
      '  Monday [Monday]',
      '    Order food [Monday]',
      '  Tuesday [Tuesday]',
    ]);
    expect(countNodes(outline)).toBe(3);
  });

  it('starts a new list after a paragraph', () => {
    const outline = outlineOf('List', '- One\n  - Two\n\nText.\n\n  - Three\n');
    expect(shape(outline)).toEqual(['List', '  One', '    Two', '  Three']);
  });

  it('shows Markdown as plain words', () => {
    expect(plainText('**Bold** _it_ `code` [[A|B]] [[Page#Part]] [site](http://x)')).toBe(
      'Bold it code B Page site',
    );
  });
});

describe('Mind maps: canvas files', () => {
  it('reads a canvas, keeping items and keys it does not know', () => {
    const doc = parseCanvas(
      JSON.stringify({
        version: 1,
        owner: 'Ray',
        items: [
          {
            id: 'a',
            kind: 'text',
            x: 10,
            y: 20,
            width: 200,
            height: 100,
            text: 'Hi',
            colour: 'red',
          },
          { id: 'b', kind: 'ink', x: 0, y: 0, width: 50, height: 50, strokes: [[1, 2, 0.5]] },
          { id: 'a', kind: 'text', x: 'left' },
          'junk',
        ],
        links: [{ id: 'l', from: 'a', to: 'b', label: 'see' }, { from: 'a' }],
      }),
    );
    expect(doc.owner).toBe('Ray');
    expect(doc.items.map((i) => i.kind)).toEqual(['text', 'ink', 'text']);
    expect(doc.items[0]).toMatchObject({ colour: 'red', text: 'Hi' });
    expect(doc.items[1]?.['strokes']).toEqual([[1, 2, 0.5]]);
    // A repeated id gets a new one; a bad position becomes 0.
    expect(doc.items[2]?.id).not.toBe('a');
    expect(doc.items[2]?.x).toBe(0);
    expect(doc.links).toHaveLength(1);

    const saved = JSON.parse(serialiseCanvas(doc)) as typeof doc;
    expect(saved.items[1]?.['strokes']).toEqual([[1, 2, 0.5]]);
    expect(saved.owner).toBe('Ray');
  });

  it('drops arrows to items that are gone when saving', () => {
    const doc = parseCanvas(
      '{"items":[{"id":"a","kind":"text"}],"links":[{"id":"l","from":"a","to":"gone"}]}',
    );
    expect(JSON.parse(serialiseCanvas(doc))).toMatchObject({ version: 1, links: [] });
  });

  it('says plainly when a file is not a canvas', () => {
    expect(() => parseCanvas('{oops')).toThrow('The file is not valid JSON.');
    expect(() => parseCanvas('[1]')).toThrow('The file is not a canvas.');
    expect(parseCanvas('').items).toEqual([]);
  });

  it('knows which card a file makes', () => {
    expect(['Lab/Plan.md', 'attachments/gel.PNG', 'Data/day7.csv'].map(kindForPath)).toEqual([
      'page',
      'image',
      'file',
    ]);
  });

  it('joins arrows to the sides of cards that face each other', () => {
    const box = (x: number, y: number) => ({ x, y, width: 100, height: 50 });
    expect(facingSides(box(0, 0), box(300, 20))).toEqual({ source: 'right', target: 'left' });
    expect(facingSides(box(300, 0), box(0, 20))).toEqual({ source: 'left', target: 'right' });
    expect(facingSides(box(0, 0), box(20, 300))).toEqual({ source: 'bottom', target: 'top' });
    expect(facingSides(box(0, 300), box(20, 0))).toEqual({ source: 'top', target: 'bottom' });
  });
});

async function openVault(enabled = true) {
  drawn.length = 0;
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { 'mind-maps': { enabled } },
        }),
        'Lab/Fly climbing.md': PAGE,
        'Lab/Board.canvas.json': '{"version":1,"items":[],"links":[]}\n',
      },
    },
  });
  const registry = new ModuleRegistry([source()], [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
  });
  return { platform, store, state: () => store.getState() };
}

function renderView(store: Awaited<ReturnType<typeof openVault>>['store']) {
  render(
    <AppStoreProvider store={store}>
      <PageView />
    </AppStoreProvider>,
  );
}

describe('Mind maps: the view', () => {
  it('draws the open page, and a click opens the page at that part', async () => {
    const { store, state } = await openVault();
    renderView(store);
    await act(() => state().openPage('Lab/Fly climbing.md'));
    await act(() => state().runCommand('mind-maps.mindMap', { folder: null }));
    await settle();

    expect(state().moduleView).toEqual({ id: 'mind-maps.mindMap', param: 'Lab/Fly climbing.md' });
    expect(drawn.length).toBeGreaterThan(0);
    const map = screen.getByRole('img', { name: 'Mind map' });
    expect(map.textContent).toContain('Measure climbing after LPS');

    fireEvent.click(screen.getByText('Mixed model'));
    await settle(80);
    expect(state().moduleView).toBeNull();
    expect(state().page?.path).toBe('Lab/Fly climbing.md');
    expect(screen.getByRole('heading', { name: 'Analysis' })).toBeTruthy();
  });

  it('asks for a page first when none is open', async () => {
    const { state } = await openVault();
    await act(() => state().runCommand('mind-maps.mindMap', { folder: null }));
    expect(state().sidebarNotice).toBe('Open a page first.');
  });
});

describe('Mind maps: canvases', () => {
  it('makes a new canvas in a section and opens it', async () => {
    const { platform, state } = await openVault();
    const running = state().runCommand('mind-maps.newCanvas', { folder: 'Lab' });
    await vi.waitFor(() => {
      expect(state().textPrompt).not.toBeNull();
    });
    state().answerText('Ideas');
    await act(() => running);
    expect(JSON.parse(platform.snapshot()['Lab/Ideas.canvas.json'] ?? '')).toEqual({
      version: 1,
      items: [],
      links: [],
    });
    expect(state().openFile).toBe('Lab/Ideas.canvas.json');
  });

  it('are listed in one place, where a new one can be made', async () => {
    const { platform, store, state } = await openVault();
    renderView(store);
    await act(() => state().openModuleView('mind-maps.canvases'));
    await settle();
    expect(screen.getByRole('button', { name: /Board/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Plans' } });
    fireEvent.click(screen.getByRole('button', { name: 'New canvas' }));
    await settle();
    expect(platform.snapshot()['Lab/Plans.canvas.json']).toBeDefined();
    expect(state().openFile).toBe('Lab/Plans.canvas.json');
  });

  it('a page has a button for its mind map', async () => {
    const { store, state } = await openVault();
    renderView(store);
    await act(() => state().openPage('Lab/Fly climbing.md'));
    fireEvent.click(screen.getByRole('button', { name: 'Mind map' }));
    await settle();
    expect(state().moduleView).toEqual({ id: 'mind-maps.mindMap', param: 'Lab/Fly climbing.md' });
  });
});

describe('Mind maps: switched off', () => {
  it('leaves canvases alone, and says which module draws them', async () => {
    const { platform, store, state } = await openVault(false);
    renderView(store);
    await act(() => state().openPath('Lab/Board.canvas.json'));
    await settle();
    expect(screen.getByText(/Canvases are drawn by the Mind maps and canvas module/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Board' })).toBeTruthy();
    expect(platform.snapshot()['Lab/Board.canvas.json']).toBe(
      '{"version":1,"items":[],"links":[]}\n',
    );
  });
});
