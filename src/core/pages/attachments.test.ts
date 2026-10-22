// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import {
  AttachmentError,
  attachmentName,
  embedPath,
  imagePath,
  isImage,
  saveAttachment,
  type IncomingFile,
} from './attachments';

const NOW = new Date(2026, 9, 22, 10, 30, 5);

function file(name: string, content = 'data', type = ''): IncomingFile {
  const bytes = new TextEncoder().encode(content);
  return { name, type, size: bytes.length, bytes: () => Promise.resolve(bytes) };
}

async function openVault(contents: Record<string, string | null> = {}): Promise<MemoryAdapter> {
  const adapter = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  await adapter.setVaultRoot('C:/Vault');
  return adapter;
}

describe('attachment names', () => {
  it('name pasted images by time, since the clipboard calls them all image.png', () => {
    expect(attachmentName(file('image.png', '', 'image/png'), 'paste', NOW)).toBe(
      'Pasted image 2026-10-22 103005.png',
    );
    expect(attachmentName(file('image.jpeg', '', 'image/jpeg'), 'paste', NOW)).toBe(
      'Pasted image 2026-10-22 103005.jpg',
    );
  });

  it('keep the names of dropped files, made safe for Windows', () => {
    expect(attachmentName(file('climbing day7.CSV'), 'drop', NOW)).toBe('climbing day7.csv');
    expect(attachmentName(file('a:b?.png'), 'drop', NOW)).toBe('a-b-.png');
    expect(attachmentName(file('CON.txt'), 'drop', NOW)).toBe('CON_.txt');
    expect(attachmentName(file('...'), 'drop', NOW)).toBe('File');
  });

  it('give a pasted file that is not an image its own name', () => {
    expect(attachmentName(file('notes.txt', '', 'text/plain'), 'paste', NOW)).toBe('notes.txt');
  });
});

describe('saveAttachment', () => {
  it('copies the file into attachments/ and returns its path', async () => {
    const platform = await openVault({ 'Notes/Page.md': '' });
    const path = await saveAttachment(platform, file('plot.png', 'PNG'), 'drop', 100, NOW);
    expect(path).toBe('attachments/plot.png');
    expect(await platform.readText(path)).toBe('PNG');
  });

  it('never overwrites: a clash gets the next free name', async () => {
    const platform = await openVault({ 'attachments/plot.png': 'old' });
    const path = await saveAttachment(platform, file('plot.png', 'new'), 'drop', 100, NOW);
    expect(path).toBe('attachments/plot 2.png');
    expect(await platform.readText('attachments/plot.png')).toBe('old');
  });

  it('refuses files over the limit without reading them', async () => {
    const platform = await openVault();
    let read = false;
    const big: IncomingFile = {
      name: 'stack.tif',
      type: '',
      size: 60 * 1024 * 1024,
      bytes: () => {
        read = true;
        return Promise.resolve(new Uint8Array());
      },
    };
    await expect(saveAttachment(platform, big, 'drop', 50 * 1024 * 1024)).rejects.toThrow(
      AttachmentError,
    );
    await expect(saveAttachment(platform, big, 'drop', 50 * 1024 * 1024)).rejects.toThrow(
      'stack.tif is over 50 MB',
    );
    expect(read).toBe(false);
    expect(await platform.exists('attachments')).toBe(false);
  });
});

describe('finding attached files', () => {
  it('knows images by extension', () => {
    expect(isImage('attachments/a.PNG')).toBe(true);
    expect(isImage('attachments/data.csv')).toBe(false);
    expect(isImage('png')).toBe(false);
  });

  it('reads embeds as vault paths, and bare names as files in attachments/', () => {
    expect(embedPath('attachments/Pasted image 2026-10-22 103005.png')).toBe(
      'attachments/Pasted image 2026-10-22 103005.png',
    );
    expect(embedPath('Figures/plot.png')).toBe('Figures/plot.png');
    expect(embedPath('plot.png')).toBe('attachments/plot.png');
    expect(embedPath('../outside.png')).toBeNull();
    expect(embedPath('#Heading')).toBeNull();
  });

  it('reads Markdown image paths from the page folder', () => {
    const page = 'LPS model/Experiments/Dose.md';
    expect(imagePath(page, 'plot.png')).toBe('LPS model/Experiments/plot.png');
    expect(imagePath(page, './img/plot.png')).toBe('LPS model/Experiments/img/plot.png');
    expect(imagePath(page, '../../attachments/My%20plot.png')).toBe('attachments/My plot.png');
    expect(imagePath(page, '/attachments/plot.png')).toBe('attachments/plot.png');
    expect(imagePath('Top.md', 'plot.png')).toBe('plot.png');
  });

  it('leaves web addresses and paths outside the vault alone', () => {
    expect(imagePath('Top.md', 'https://example.org/a.png')).toBeNull();
    expect(imagePath('Top.md', 'data:image/png;base64,AAAA')).toBeNull();
    expect(imagePath('Top.md', '//example.org/a.png')).toBeNull();
    expect(imagePath('Notes/Top.md', '../../a.png')).toBeNull();
    expect(imagePath('Top.md', '')).toBeNull();
  });
});
