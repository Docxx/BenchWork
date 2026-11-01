import type { ModuleContext } from '@core/api';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes, PhrasingContent } from 'mdast';
import { newSlide, type Slide } from './model';

/** Notes are audience text snapshots, with formatting syntax and frontmatter removed. */
export function noteText(markdown: string): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  function visit(node: Nodes | PhrasingContent): string {
    if (node.type === 'html' || node.type === 'definition') return '';
    if (node.type === 'image') return node.alt ?? '';
    if ('value' in node) return node.value;
    if ('children' in node)
      return node.children
        .map(visit)
        .join(['root', 'list', 'listItem', 'blockquote'].includes(node.type) ? '\n\n' : '');
    return '';
  }
  return visit(fromMarkdown(body))
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target: string, label: string | undefined) => label ?? target,
    )
    .slice(0, 100000);
}

export async function importSlides(ctx: ModuleContext, source: string): Promise<Slide[]> {
  const folder = `Teaching/Assets/${crypto.randomUUID()}`;
  if (/\.pptx$/i.test(source)) {
    const imported = await ctx.files.importPowerPoint(source, folder);
    return imported.slides.map((s) => ({
      ...newSlide(),
      title: s.title,
      notes: s.notes,
      image: s.image,
      source: imported.source,
    }));
  }
  if (!/\.(pdf|png|jpe?g|webp)$/i.test(source))
    throw new Error('Choose a PDF, PowerPoint (.pptx) or PNG, JPEG or WebP image.');
  const copied = await ctx.files.importFile(source, folder);
  const name = source.split(/[\\/]/).at(-1) ?? 'Imported material';
  if (/\.pdf$/i.test(copied)) {
    const pdf = await ctx.files.openPdf(await ctx.vault.readBytes(copied));
    try {
      if (pdf.pages > 1000) throw new Error('Import a PDF with no more than 1,000 pages.');
      return Array.from({ length: pdf.pages }, (_, n) => ({
        ...newSlide(),
        title: `${name} · ${String(n + 1)}`,
        source: copied,
        pdfPage: n + 1,
      }));
    } finally {
      pdf.destroy();
    }
  }
  return [{ ...newSlide(), title: name, image: copied, source: copied }];
}
/** Rasterise only the selected PDF page. No notes or other slides enter this image. */
export async function slideImage(
  ctx: ModuleContext,
  slide: Pick<Slide, 'image' | 'source' | 'pdfPage'>,
): Promise<string | null> {
  if (slide.pdfPage && slide.source) {
    const pdf = await ctx.files.openPdf(await ctx.vault.readBytes(slide.source));
    try {
      const canvas = document.createElement('canvas');
      if (!(await pdf.render(slide.pdfPage, canvas, 1280).done))
        throw new Error('The PDF page could not be drawn.');
      return canvas.toDataURL('image/png');
    } finally {
      pdf.destroy();
    }
  }
  if (!slide.image) return null;
  // Embed a local snapshot so both native and browser audience windows use the same image.
  const bytes = await ctx.vault.readBytes(slide.image);
  const mime = /\.jpe?g$/i.test(slide.image)
    ? 'image/jpeg'
    : /\.webp$/i.test(slide.image)
      ? 'image/webp'
      : 'image/png';
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Use a slide image smaller than 10 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The image could not be read.'));
    };
    reader.onerror = () => {
      reject(new Error('The image could not be read.'));
    };
    reader.readAsDataURL(new Blob([Uint8Array.from(bytes).buffer], { type: mime }));
  });
}
