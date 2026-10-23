// @vitest-environment node
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { parsePage, pageProperties } from '@core/pages/frontmatter';
import { MemoryAdapter, type MemoryFolderContents } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import manifestJson from './manifest.json';
import { bodyOf, nextVersion } from './protocols';

// Tests may reach core internals to set the app up; the module itself may not.

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'lab-notebook');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

async function openVault(files: MemoryFolderContents = {}) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { 'lab-notebook': { enabled: true } },
        }),
        Lab: null,
        ...files,
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
  await store.getState().chooseFolder('open');
  const state = () => store.getState();
  const props = (path: string) => pageProperties(parsePage(platform.snapshot()[path] ?? ''));
  return { platform, state, props };
}

async function runWithName(
  state: Awaited<ReturnType<typeof openVault>>['state'],
  id: string,
  folder: string | null,
  name: string,
) {
  const running = state().runCommand(id, { folder });
  await vi.waitFor(() => {
    expect(state().textPrompt).not.toBeNull();
  });
  state().answerText(name);
  await running;
}

describe('protocol versions', () => {
  it('go up by one, keeping the name', () => {
    expect(nextVersion('LPS feeding v3', '3')).toEqual({ title: 'LPS feeding v4', version: '4' });
    expect(nextVersion('LPS feeding', 1)).toEqual({ title: 'LPS feeding v2', version: '2' });
    expect(nextVersion('Western blot', undefined)).toEqual({
      title: 'Western blot v2',
      version: '2',
    });
  });

  it('copy the text after the frontmatter', () => {
    expect(bodyOf('---\nid: a\ntype: protocol\n---\n## Steps\n')).toBe('## Steps\n');
    expect(bodyOf('No frontmatter.\n')).toBe('No frontmatter.\n');
  });
});

describe('Lab notebook module', () => {
  it('makes protocols with a version, a status and steps', async () => {
    const { state, props, platform } = await openVault();
    await runWithName(state, 'lab-notebook.newProtocol', 'Lab', 'LPS feeding');
    expect(state().page?.path).toBe('Lab/LPS feeding.md');
    expect(props('Lab/LPS feeding.md')).toMatchObject({
      type: 'protocol',
      version: '1',
      status: 'Draft',
    });
    expect(platform.snapshot()['Lab/LPS feeding.md']).toContain('## Steps');
  });

  it('makes a new version that supersedes the old one, which is kept and retired', async () => {
    const OLD = [
      '---',
      'id: p3',
      'type: protocol',
      'version: 3',
      'status: In use',
      'tags: [lps]',
      '---',
      '## Steps',
      '',
      '1. Mix 100 ug/mL LPS into food.',
      '',
    ].join('\n');
    const { state, props, platform } = await openVault({ 'Lab/LPS feeding v3.md': OLD });
    await state().openPage('Lab/LPS feeding v3.md');
    await state().runCommand('lab-notebook.newVersion', { folder: null });

    expect(state().page?.path).toBe('Lab/LPS feeding v4.md');
    expect(props('Lab/LPS feeding v4.md')).toMatchObject({
      type: 'protocol',
      version: '4',
      status: 'Draft',
      supersedes: '[[LPS feeding v3]]',
      tags: ['lps'],
    });
    expect(platform.snapshot()['Lab/LPS feeding v4.md']).toContain('1. Mix 100 ug/mL LPS');
    expect(platform.snapshot()['Lab/LPS feeding v3.md']).toBe(
      OLD.replace('status: In use', 'status: Retired'),
    );
    expect(state().sidebarNotice).toContain('LPS feeding v3 is marked Retired');
  });

  it('only makes new versions of protocols', async () => {
    const { state, platform } = await openVault({ 'Lab/Notes.md': 'Notes.\n' });
    await state().openPage('Lab/Notes.md');
    const before = platform.snapshot();
    await state().runCommand('lab-notebook.newVersion', { folder: null });
    expect(state().sidebarNotice).toContain('Open a protocol first');
    expect(platform.snapshot()).toEqual(before);
  });

  it('sets up a lab daily page, and never replaces a Daily template', async () => {
    const { state, platform } = await openVault();
    await state().runCommand('lab-notebook.setUpDaily', { folder: null });
    expect(platform.snapshot()['templates/Daily.md']).toContain('## Bench notes');
    await state().openToday(new Date(2026, 9, 23, 9, 0));
    expect(platform.snapshot()['Daily/2026-10/2026-10-23.md']).toContain(
      '# Friday 23 October 2026\n\n## Plan',
    );

    await platform.externalWrite('templates/Daily.md', 'Mine.\n');
    await state().runCommand('lab-notebook.setUpDaily', { folder: null });
    expect(platform.snapshot()['templates/Daily.md']).toBe('Mine.\n');
    expect(state().sidebarNotice).toContain('already a Daily template');
  });
});
