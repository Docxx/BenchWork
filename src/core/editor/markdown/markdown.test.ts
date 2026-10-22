// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPage, parseBody, savePage, serialiseBody } from './markdown';
import { RAW_BLOCK, SOURCE_ATTR, type PMNode } from './model';

const FIXTURES = join(__dirname, 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

/** The document with every block's remembered source removed, as if all were edited. */
function forgetSources(doc: PMNode): PMNode {
  return {
    ...doc,
    content: (doc.content ?? []).map((block) => {
      const attrs = { ...block.attrs };
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete attrs[SOURCE_ATTR];
      return { ...block, attrs };
    }),
  };
}

/** The document without source attributes anywhere, for comparing content. */
function contentOf(doc: PMNode): unknown {
  return JSON.parse(
    JSON.stringify(forgetSources(doc), (key, value: unknown) =>
      key === 'attrs' && value && Object.keys(value).length === 0 ? undefined : value,
    ),
  );
}

/** BenchWork's own style for a body: every block rewritten. */
function normalForm(body: string): string {
  const loaded = parseBody(body);
  return serialiseBody(forgetSources(loaded.doc), loaded.source);
}

describe.each(readdirSync(FIXTURES))('sample page %s', (name) => {
  const text = fixture(name);

  it('is saved byte for byte when nothing was edited', () => {
    const loaded = loadPage(text);
    expect(savePage(loaded.page, loaded.doc, loaded.source)).toBe(text);
  });

  it('keeps all its content when every block is rewritten', () => {
    const body = loadPage(text).page.body;
    const rewritten = parseBody(normalForm(body));
    expect(contentOf(rewritten.doc)).toEqual(contentOf(parseBody(body).doc));
  });

  it('settles: rewriting the rewritten page changes nothing', () => {
    const once = normalForm(loadPage(text).page.body);
    expect(normalForm(once)).toBe(once);
  });
});

describe('editing one block', () => {
  it('leaves every other block exactly as written', () => {
    const text = fixture('raw.md');
    const loaded = loadPage(text);
    const content = [...(loaded.doc.content ?? [])];
    const index = content.findIndex((b) => b.type === 'paragraph');
    content[index] = {
      ...content[index],
      type: 'paragraph',
      content: [{ type: 'text', text: 'A replaced paragraph.' }],
    };
    const saved = savePage(loaded.page, { ...loaded.doc, content }, loaded.source);
    const original = 'A footnote reference[^1] and inline <kbd>Ctrl</kbd> HTML.';
    expect(saved).toBe(text.replace(original, 'A replaced paragraph.'));
  });

  it('uses BenchWork style only for the block that changed', () => {
    const body = '* one\n* two\n\nSome __bold__ text.\n';
    const loaded = parseBody(body);
    const [list, paragraph] = loaded.doc.content ?? [];
    if (!list || !paragraph) throw new Error('expected two blocks');
    const edited = {
      ...paragraph,
      content: [...(paragraph.content ?? []), { type: 'text', text: ' More.' }],
    };
    expect(serialiseBody({ type: 'doc', content: [list, edited] }, loaded.source)).toBe(
      '* one\n* two\n\nSome **bold** text. More.\n',
    );
  });

  it('keeps unusual spacing between untouched blocks, and uses one blank line around new ones', () => {
    const loaded = parseBody('First\n\n\n\nSecond\n');
    const [first, second] = loaded.doc.content ?? [];
    if (!first || !second) throw new Error('expected two blocks');
    expect(serialiseBody(loaded.doc, loaded.source)).toBe('First\n\n\n\nSecond\n');
    const inserted: PMNode = { type: 'paragraph', content: [{ type: 'text', text: 'Middle' }] };
    expect(serialiseBody({ type: 'doc', content: [first, inserted, second] }, loaded.source)).toBe(
      'First\n\nMiddle\n\nSecond\n',
    );
  });

  it('keeps two lists apart when what separated them is deleted', () => {
    const loaded = parseBody('- a\n\nText\n\n- b\n');
    const [listA, , listB] = loaded.doc.content ?? [];
    if (!listA || !listB) throw new Error('expected lists');
    const changed: PMNode = {
      ...listB,
      content: [
        ...(listB.content ?? []),
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }],
        },
      ],
    };
    const saved = serialiseBody({ type: 'doc', content: [listA, changed] }, loaded.source);
    expect(saved).toBe('- a\n\n* b\n* c\n');
    expect(parseBody(saved).doc.content?.map((b) => b.type)).toEqual(['bulletList', 'bulletList']);
  });
});

describe('page model', () => {
  const types = (body: string) => parseBody(body).doc.content?.map((b) => b.type);

  it('reads wiki links and embeds, but not escaped brackets', () => {
    const [p] =
      parseBody('See [[LPS v3|the protocol]], ![[sketch.ink]] and \\[\\[plain]].\n').doc.content ??
      [];
    expect(p?.content).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'wikiLink', attrs: { target: 'LPS v3', alias: 'the protocol', embed: false } },
      { type: 'text', text: ', ' },
      { type: 'wikiLink', attrs: { target: 'sketch.ink', alias: null, embed: true } },
      { type: 'text', text: ' and [[plain]].' },
    ]);
  });

  it('writes wiki links back as wiki links', () => {
    expect(normalForm('A [[Page]] and [[Other|label]] and ![[pic.png]]\n')).toBe(
      'A [[Page]] and [[Other|label]] and ![[pic.png]]\n',
    );
  });

  it('nests marks the same way every time', () => {
    // Bold and italic together is written **_like this_**, to avoid ***ambiguity***.
    const once = normalForm('***both*** and **bold *both* bold** and [**link**](x)\n');
    expect(once).toBe('**_both_** and **bold *both* bold** and [**link**](x)\n');
    expect(normalForm(once)).toBe(once);
  });

  it('keeps tags as plain text, without escaping', () => {
    expect(normalForm('#todo and #lps-2026\n')).toBe('#todo and #lps-2026\n');
  });

  it('turns task lists into checklists and keeps mixed lists raw', () => {
    expect(types('- [ ] a\n- [x] b\n')).toEqual(['taskList']);
    expect(types('- [ ] a\n- b\n')).toEqual([RAW_BLOCK]);
  });

  it('keeps HTML, definitions, footnotes and callouts raw', () => {
    expect(types('<div>x</div>\n\n[a]: http://x\n\n[^1]: note\n\n> [!TIP]\n> Hi\n')).toEqual([
      RAW_BLOCK,
      RAW_BLOCK,
      RAW_BLOCK,
      RAW_BLOCK,
    ]);
  });

  it('keeps a whole list raw if something inside it cannot be shown', () => {
    const body = '- item\n\n  <div>html in a list</div>\n';
    const doc = parseBody(body).doc;
    expect(doc.content?.map((b) => b.type)).toEqual([RAW_BLOCK]);
    expect(normalForm(body)).toBe(body);
  });

  it('drops empty paragraphs and ends with a newline', () => {
    const doc: PMNode = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] },
        { type: 'paragraph' },
      ],
    };
    expect(serialiseBody(doc, { leading: '', trailing: '' })).toBe('Hi\n');
    expect(serialiseBody({ type: 'doc', content: [] }, { leading: '', trailing: '' })).toBe('');
  });

  it('writes table line breaks as <br>', () => {
    const doc = parseBody('| a |\n| - |\n| b |\n').doc;
    const table = doc.content?.[0];
    const cell = table?.content?.[1]?.content?.[0]?.content?.[0];
    if (!cell) throw new Error('no cell');
    cell.content = [
      { type: 'text', text: 'one' },
      { type: 'hardBreak' },
      { type: 'text', text: 'two' },
    ];
    expect(serialiseBody(forgetSources(doc), { leading: '', trailing: '\n' })).toBe(
      '| a |\n| - |\n| one<br>two |\n',
    );
  });
});

describe('Windows line endings', () => {
  it('are kept on save, including for edited blocks', () => {
    const text = fixture('windows.md');
    const loaded = loadPage(text);
    const content = [...(loaded.doc.content ?? [])];
    content.push({ type: 'paragraph', content: [{ type: 'text', text: 'Added' }] });
    const saved = savePage(loaded.page, { ...loaded.doc, content }, loaded.source);
    expect(saved).toBe(text.replace(/\r\n$/, '\r\n\r\nAdded\r\n'));
    expect(saved.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
