// @vitest-environment node
import { loadPage, savePage } from './markdown/markdown';
import {
  clampWidth,
  formatSize,
  joinLabel,
  MIN_WIDTH,
  parseSize,
  splitLabel,
  stepWidth,
} from './imageSize';

describe('image sizes', () => {
  it('read a width, or a width and height', () => {
    expect(parseSize('300')).toEqual({ width: 300, height: null });
    expect(parseSize(' 300x200 ')).toEqual({ width: 300, height: 200 });
    for (const bad of ['abc', '0', '300x0', '-3', '3.5', '', '300px', '123456']) {
      expect(parseSize(bad), bad).toBeNull();
    }
    expect(formatSize({ width: 300, height: 200 })).toBe('300x200');
  });

  it('split from a caption, and join back', () => {
    expect(splitLabel('300')).toEqual({ caption: '', size: { width: 300, height: null } });
    expect(splitLabel('Western blot|300')).toEqual({
      caption: 'Western blot',
      size: { width: 300, height: null },
    });
    expect(splitLabel('a|b')).toEqual({ caption: 'a|b', size: null });
    expect(splitLabel(null)).toEqual({ caption: '', size: null });
    expect(joinLabel('', { width: 250, height: null })).toBe('250');
    expect(joinLabel('graph', { width: 250, height: null })).toBe('graph|250');
    expect(joinLabel('graph', null)).toBe('graph');
    expect(joinLabel('', null)).toBeNull();
  });

  it('stay within limits and step in sensible amounts', () => {
    expect(clampWidth(10, 800)).toBe(MIN_WIDTH);
    expect(clampWidth(900, 800)).toBe(800);
    expect(clampWidth(333.4, 800)).toBe(333);
    expect(stepWidth(400, 1, 800)).toBe(500);
    expect(stepWidth(400, -1, 800)).toBe(320);
    expect(stepWidth(700, 1, 800)).toBe(800);
  });

  it('round-trip in Markdown exactly', () => {
    for (const text of [
      'Before ![[attachments/plot.png|300]] after.\n',
      '![[plot.png|Western blot|300x200]]\n',
      '![graph|300](plot.png)\n',
    ]) {
      const loaded = loadPage(text);
      expect(savePage(loaded.page, loaded.doc, loaded.source)).toBe(text);
    }
  });

  it('are written back when an image block is edited', () => {
    const loaded = loadPage('![graph|300](plot.png) and ![[plot.png|250]]\n');
    const [para] = loaded.doc.content ?? [];
    if (!para) throw new Error('no paragraph');
    // An edit elsewhere in the block makes it save in BenchWork's style.
    const edited = {
      ...para,
      attrs: {},
      content: [...(para.content ?? []), { type: 'text', text: '!' }],
    };
    expect(savePage(loaded.page, { type: 'doc', content: [edited] }, loaded.source)).toBe(
      '![graph|300](plot.png) and ![[plot.png|250]]!\n',
    );
  });
});
