/**
 * Word documents, drawn as Word lays them out: pages, fonts, tables,
 * headers and images, read only. docx-preview is loaded the first time a
 * document is opened, so it costs nothing until then.
 */

/** Draws a `.docx` file's pages into `body`, with its styles in `styles`. */
export async function renderDocx(
  bytes: Uint8Array,
  body: HTMLElement,
  styles: HTMLElement,
): Promise<void> {
  const { renderAsync } = await import('docx-preview');
  body.replaceChildren();
  styles.replaceChildren();
  await renderAsync(new Blob([bytes as BlobPart]), body, styles, {
    className: 'docx',
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    // Fonts and colours as the document has them, like Word.
    ignoreFonts: false,
    useBase64URL: true,
  });
}
