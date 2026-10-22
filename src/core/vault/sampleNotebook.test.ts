// @vitest-environment node
import { loadPage, savePage } from '../editor/markdown/markdown';
import { extractPage } from '../search/extract';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from '../state/appStore';
import { sampleFiles } from './sampleNotebook';

let n = 0;
const ids = () => `id-${String((n += 1))}`;

describe('the sample notebook', () => {
  it('is written when a vault is made in an empty folder', async () => {
    const platform = new MemoryAdapter({ folders: { 'C:/New': {} } });
    const store = createAppStore(platform);
    platform.queuePick('C:/New');
    await store.getState().chooseFolder('new');
    const files = platform.snapshot();
    expect(files['Getting started/Welcome.md']).toContain('# Welcome to BenchWork');
    expect(files['Getting started/Example lab notes/Example experiment.md']).toContain(
      'type: experiment',
    );
    expect(files['templates/Experiment.md']).toContain('{{title}}');

    await store.getState().indexIdle();
    const state = store.getState();
    state.setSearchQuery('assay');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(store.getState().searchResults?.map((r) => r.title)).toEqual(['Example experiment']);
  });

  it('is never added to a folder that already has files', async () => {
    const platform = new MemoryAdapter({ folders: { 'C:/Docs': { 'notes.txt': 'mine' } } });
    const store = createAppStore(platform);
    platform.queuePick('C:/Docs');
    await store.getState().chooseFolder('open');
    await store.getState().confirmFolder();
    expect(Object.keys(platform.snapshot()).filter((p) => !p.startsWith('.benchwork'))).toEqual([
      'notes.txt',
    ]);
  });

  it('pages read back exactly as written, with working links and tags', () => {
    const files = sampleFiles(new Date(2026, 9, 22, 10, 0), ids);
    for (const [path, text] of Object.entries(files)) {
      const loaded = loadPage(text);
      expect(savePage(loaded.page, loaded.doc, loaded.source), path).toBe(text);
    }
    const welcome = extractPage(
      'Getting started/Welcome.md',
      files['Getting started/Welcome.md'] ?? '',
      {
        mtime: null,
        size: 0,
      },
    );
    expect(welcome.links.map((l) => l.target)).toEqual(['Example experiment']);
    expect(welcome.tags).toEqual(['getting-started']);
    // No raw Markdown blocks: everything shows in the editor.
    const json = JSON.stringify(Object.values(files).map((t) => loadPage(t).doc));
    expect(json).not.toContain('rawBlock');
  });
});
