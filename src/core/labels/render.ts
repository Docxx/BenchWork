import bwip from 'bwip-js/browser';
import { feedSize, labelText, type LabelDesign, type LabelRow } from './model';
export const LABEL_DPI = 203;
const dots = (mm: number) => Math.round((mm * LABEL_DPI) / 25.4);
function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = dots(width);
  c.height = dots(height);
  return c;
}
async function picture(source: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = source;
  await img.decode();
  return img;
}
export async function renderLabel(
  d: LabelDesign,
  row: LabelRow,
  sequence: number,
  offset = false,
): Promise<HTMLCanvasElement> {
  const c = canvas(d.width, d.height),
    ctx = c.getContext('2d');
  if (!ctx) throw new Error('Label drawing is unavailable.');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(LABEL_DPI / 25.4, LABEL_DPI / 25.4);
  if (offset) ctx.translate(d.offsetX, d.offsetY);
  for (const e of d.elements) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate((e.rotation * Math.PI) / 180);
    ctx.beginPath();
    ctx.rect(0, 0, e.width, e.height);
    ctx.clip();
    ctx.fillStyle = 'black';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 0.2;
    const text = labelText(e.text, row, sequence);
    if (['text', 'qr', 'barcode'].includes(e.kind) && /\{[^{}]+\}/.test(text))
      throw new Error('Fill the missing label data fields before printing.');
    if (e.kind === 'text') {
      ctx.font = `${e.italic ? 'italic ' : ''}${e.bold ? 'bold ' : ''}${String(e.size)}px ${e.font === 'mono' ? 'monospace' : e.font === 'serif' ? 'Georgia' : 'Arial'}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = e.align;
      const x = e.align === 'center' ? e.width / 2 : e.align === 'right' ? e.width : 0;
      text.split('\n').forEach((line, i) => {
        const y = i * e.size * (e.lineSpacing ?? 1.2);
        ctx.fillText(line, x, y, e.width);
        if (e.underline) {
          const width = Math.min(ctx.measureText(line).width, e.width);
          const left = e.align === 'center' ? x - width / 2 : e.align === 'right' ? x - width : x;
          ctx.lineWidth = Math.max(0.1, e.size / 18);
          ctx.beginPath();
          ctx.moveTo(left, y + e.size);
          ctx.lineTo(left + width, y + e.size);
          ctx.stroke();
        }
      });
    } else if (e.kind === 'box') {
      ctx.strokeRect(0.1, 0.1, e.width - 0.2, e.height - 0.2);
    } else if (e.kind === 'line') {
      ctx.beginPath();
      ctx.moveTo(0, 0.1);
      ctx.lineTo(e.width, 0.1);
      ctx.stroke();
    } else if (e.kind === 'image' && e.image) {
      const img = await picture(e.image);
      const scale = Math.min(e.width / img.width, e.height / img.height);
      ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
    } else if (e.kind === 'qr' || e.kind === 'barcode') {
      if (!text || /\{[^{}]+\}/.test(text))
        throw new Error(
          `Fill the data fields for ${e.kind === 'qr' ? 'the QR code' : 'the barcode'} before printing.`,
        );
      const code = document.createElement('canvas');
      bwip.toCanvas(code, {
        bcid: e.kind === 'qr' ? 'qrcode' : 'code128',
        text,
        scale: 3,
        paddingwidth: e.kind === 'qr' ? 4 : 10,
        paddingheight: e.kind === 'qr' ? 4 : 2,
      });
      ctx.imageSmoothingEnabled = false;
      const side = Math.min(e.width, e.height);
      ctx.drawImage(
        code,
        0,
        0,
        e.kind === 'qr' ? side : e.width,
        e.kind === 'qr' ? side : e.height,
      );
    }
    ctx.restore();
  }
  return c;
}
/** Each physical feed is one acknowledged print page. Blank spare labels stay white. */
export async function renderFeed(
  d: LabelDesign,
  rows: readonly LabelRow[],
  start: number,
): Promise<HTMLCanvasElement> {
  const size = feedSize(d),
    c = canvas(size.width, size.height),
    ctx = c.getContext('2d');
  if (!ctx) throw new Error('Label drawing is unavailable.');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const label = await renderLabel(d, row, start + i, true);
    ctx.drawImage(
      label,
      dots(d.layout === 'across' ? i * (d.width + d.gap) : 0),
      dots(d.layout === 'stacked' ? i * (d.height + d.gap) : 0),
    );
  }
  const data = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const gray =
      (data.data[i] ?? 255) * 0.299 +
      (data.data[i + 1] ?? 255) * 0.587 +
      (data.data[i + 2] ?? 255) * 0.114;
    const v = gray < d.threshold ? 0 : 255;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}
