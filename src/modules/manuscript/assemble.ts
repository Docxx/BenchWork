/**
 * Turning a manuscript's parts into one Markdown file for Pandoc. Pages
 * stay as they are; only the copy given to Pandoc changes: properties go,
 * links become plain text, pictures become figures with numbered captions,
 * and `[@key]` citations are left for Pandoc to format.
 */

/** A part of the manuscript: one page. */
export interface Part {
  /** The page's name, used as its heading if it has none. */
  title: string;
  /** Vault path, so pictures beside the page can be found. */
  path: string;
  /** The page's whole text. */
  text: string;
}

export interface Assembled {
  markdown: string;
  figures: number;
  tables: number;
}

const IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;

/** `[[Target|shown]]` and `![[embed|300]]`. */
const WIKI = /(!?)\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;

/** `#tag`, as the core reads tags: not after a word character, not only digits. */
const TAG = /(?<![\p{L}\p{N}_&#/])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The links in a manuscript's text, in order: its parts. Embeds are not parts. */
export function partTargets(text: string): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const m of stripFrontmatter(text).matchAll(WIKI)) {
    if (m[1] === '!') continue;
    const target = (m[2] ?? '').split('#')[0]?.trim() ?? '';
    const key = target.toLowerCase();
    if (target === '' || seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }
  return targets;
}

export function stripFrontmatter(text: string): string {
  const m = /^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return (m ? text.slice(m[0].length) : text).replace(/\r\n/g, '\n');
}

/** A size such as `300` or `300x200` after an embed's last `|`. */
function splitSize(label: string | undefined): { caption: string; width: string | null } {
  const text = label ?? '';
  const bar = text.lastIndexOf('|');
  const tail = bar === -1 ? text : text.slice(bar + 1);
  const m = /^\s*(\d{1,5})(?:x\d{1,5})?\s*$/.exec(tail);
  if (!m) return { caption: text, width: null };
  return { caption: bar === -1 ? '' : text.slice(0, bar), width: m[1] ?? null };
}

/** Joins `rel` onto `folder`, resolving `.` and `..`; null if it leaves the vault. */
export function joinPath(folder: string, rel: string): string | null {
  const parts = folder === '' ? [] : folder.split('/');
  for (const piece of rel.split('/')) {
    if (piece === '' || piece === '.') continue;
    if (piece === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(piece);
    }
  }
  return parts.join('/');
}

function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Where an embedded picture is: a vault path, or a bare name in attachments/. */
function embedFile(target: string): string {
  return target.includes('/') ? target : `attachments/${target}`;
}

/** A path as a Markdown destination, in angle brackets if it has spaces. */
function destination(path: string): string {
  return /[\s()<>]/.test(path) ? `<${path}>` : path;
}

/** One line of a part, outside code: links, embeds, tags and pictures rewritten. */
function rewriteLine(line: string, partPath: string): string {
  let out = line.replace(WIKI, (_whole, bang: string, target: string, label?: string) => {
    const clean = target.trim();
    if (bang === '!') {
      if (!IMAGE.test(clean)) return '';
      const { caption, width } = splitSize(label);
      const size = width === null ? '' : `{width=${width}px}`;
      return `![${caption}](${destination(embedFile(clean))})${size}`;
    }
    return (label ?? clean.split('#')[0] ?? clean).trim();
  });
  // Pictures written as Markdown are found from the page's own folder.
  out = out.replace(/!\[([^\]]*)\]\((?!<)([^)\s]+)\)/g, (whole, alt: string, src: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')) return whole;
    const path = joinPath(folderOf(partPath), decodeURI(src));
    return path === null ? whole : `![${alt}](${destination(path)})`;
  });
  // Headings start with `# `, which is not a tag; tags elsewhere are dropped,
  // with the space they leave. Other lines keep their spacing, such as the
  // two spaces of a line break.
  if (!/^ {0,3}#{1,6}\s/.test(out) && new RegExp(TAG.source, 'u').test(out)) {
    out = out
      .replace(TAG, '')
      .replace(/(\S) {2,}(?=\S)/g, '$1 ')
      .replace(/[ \t]+$/, '');
  }
  return out;
}

/** Joins the parts under a title block, for Pandoc. */
export function assemble(title: string, author: string | null, parts: readonly Part[]): Assembled {
  let figures = 0;
  let tables = 0;
  const meta = [
    '---',
    `title: ${JSON.stringify(title)}`,
    ...(author ? [`author: ${JSON.stringify(author)}`] : []),
    `reference-section-title: "References"`,
    'link-citations: true',
    '---',
    '',
  ];
  const out: string[] = [...meta];

  for (const part of parts) {
    const body = stripFrontmatter(part.text).replace(/^\s+/, '');
    if (!/^#\s/.test(body)) out.push(`# ${part.title}`, '');
    let fence: string | null = null;
    for (const line of body.split('\n')) {
      const opener = FENCE.exec(line)?.[1];
      if (fence !== null) {
        if (opener !== undefined && opener[0] === fence[0] && opener.length >= fence.length) {
          fence = null;
        }
        out.push(line);
        continue;
      }
      if (opener !== undefined) {
        fence = opener;
        out.push(line);
        continue;
      }
      let next = rewriteLine(line, part.path);
      // A picture with a caption on its own line becomes a numbered figure.
      const figure = /^!\[(.+?)\]\((.+)\)(\{[^}]*\})?\s*$/.exec(next);
      if (figure) {
        figures += 1;
        next = `![Figure ${String(figures)}. ${figure[1] ?? ''}](${figure[2] ?? ''})${figure[3] ?? ''}`;
      }
      // Pandoc table captions: `Table: text` (or `: text`) beside a table.
      const caption = /^(?:Table)?:\s+(.+)$/.exec(next);
      if (caption) {
        tables += 1;
        next = `Table: Table ${String(tables)}. ${caption[1] ?? ''}`;
      }
      out.push(next);
    }
    out.push('');
  }
  return {
    markdown: `${out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`,
    figures,
    tables,
  };
}

/** Words in a part as a reader would count them: not citations, code, pictures or syntax. */
export function wordCount(text: string): number {
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of stripFrontmatter(text).split('\n')) {
    const opener = FENCE.exec(line)?.[1];
    if (fence !== null) {
      if (opener !== undefined && opener[0] === fence[0]) fence = null;
      continue;
    }
    if (opener !== undefined) {
      fence = opener;
      continue;
    }
    lines.push(line);
  }
  const plain = lines
    .join('\n')
    // Hidden comments (such as a free layout box's place) and tags such as <u>.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^[\]\n]*@[^[\]\n]*\]/g, ' ')
    .replace(/\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g, (_w, t: string, a?: string) => a ?? t)
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(TAG, ' ');
  return plain.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
