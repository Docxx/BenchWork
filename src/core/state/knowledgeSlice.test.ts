// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { parsePage } from '../pages/frontmatter';
import { createAppStore } from './appStore';
import { cleanTags, FILE_TAGS } from './knowledgeSlice';

async function setup(extra: Record<string, string> = {}) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': '{"version":1}',
        'Lab/Plan.md':
          '---\ntags: [existing]\n---\n# Plan\n\n[[Report.pdf]] and [[Other]] #inline\n',
        'Lab/Other.md': '# Other\n',
        'Lab/Report.pdf': 'original binary content',
        ...extra,
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, state: () => store.getState() };
}
it('normalises nested tags, deduplicates and rejects invalid input', () => {
  expect(cleanTags(['#Lab/Flies', 'lab/flies', 'café', 'bad tag', '123', ''])).toEqual([
    'lab/flies',
    'café',
  ]);
});
it('stores document tags without changing documents, serialises writes and follows folder moves', async () => {
  const { platform, state } = await setup();
  await Promise.all([
    state().setItemTags('Lab/Report.pdf', ['lab/flies']),
    state().setItemTags('Lab/Other.docx', ['meeting']),
  ]);
  expect(await platform.readText('Lab/Report.pdf')).toBe('original binary content');
  expect(await state().itemTags('Lab/Report.pdf')).toEqual(['lab/flies']);
  expect(await state().documentTagHits('LAB')).toEqual([
    { path: 'Lab/Report.pdf', title: 'Report.pdf', snippet: '#lab/flies' },
  ]);
  expect(await state().renameItem('Lab', 'Bench')).toBe('Bench');
  expect(await state().itemTags('Bench/Report.pdf')).toEqual(['lab/flies']);
  expect(await state().itemTags('Lab/Report.pdf')).toEqual([]);
  expect(JSON.parse(await platform.readText(FILE_TAGS))).toHaveProperty('Bench/Other.docx');
  await state().closeVault();
});
it('changes note frontmatter through the editor and preserves content and other properties', async () => {
  const { platform, state } = await setup();
  await state().openPage('Lab/Plan.md');
  await state().setItemTags('Lab/Plan.md', ['existing', 'Protocol']);
  const saved = await platform.readText('Lab/Plan.md');
  expect(parsePage(saved).meta.tags).toEqual(['existing', 'protocol']);
  expect(saved).toContain('[[Report.pdf]] and [[Other]] #inline');
  expect(await platform.exists(FILE_TAGS)).toBe(false);
  await state().closeVault();
});
it('does not overwrite malformed metadata and allows retry after an atomic write fails', async () => {
  const { platform, state } = await setup({ [FILE_TAGS]: '{broken' });
  await expect(state().setItemTags('Lab/Report.pdf', ['new'])).rejects.toThrow();
  expect(await platform.readText(FILE_TAGS)).toBe('{broken');
  await platform.writeTextAtomic(FILE_TAGS, '{}');
  const write = platform.writeTextAtomic.bind(platform);
  platform.writeTextAtomic = () => Promise.reject(new Error('Disk full'));
  await expect(state().setItemTags('Lab/Report.pdf', ['new'])).rejects.toThrow('Disk full');
  expect(await platform.readText(FILE_TAGS)).toBe('{}');
  platform.writeTextAtomic = write;
  await state().setItemTags('Lab/Report.pdf', ['new']);
  expect(await state().itemTags('Lab/Report.pdf')).toEqual(['new']);
  await state().closeVault();
});
it('builds note and document links, includes inline tags and skips vault internals', async () => {
  const { state } = await setup({
    '.benchwork/hidden.md': 'secret',
    'Lab/Map.canvas.json': '{}',
    'Lab/Plan.md.ink.json': '{}',
  });
  await state().setItemTags('Lab/Report.pdf', ['evidence']);
  const graph = await state().vaultGraph();
  expect(graph.nodes.map((n) => n.path).sort()).toEqual([
    'Lab/Map.canvas.json',
    'Lab/Other.md',
    'Lab/Plan.md',
    'Lab/Report.pdf',
  ]);
  expect(graph.nodes.find((n) => n.path.endsWith('Plan.md'))?.tags).toEqual(['existing', 'inline']);
  expect(graph.nodes.find((n) => n.kind === 'document' && n.path.endsWith('.pdf'))?.tags).toEqual([
    'evidence',
  ]);
  expect(graph.edges).toEqual([
    { source: 'Lab/Plan.md', target: 'Lab/Report.pdf' },
    { source: 'Lab/Plan.md', target: 'Lab/Other.md' },
  ]);
  await state().closeVault();
});
