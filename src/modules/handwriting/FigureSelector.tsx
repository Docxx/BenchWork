import { useRef, useState } from 'react';
import { newStrokeId, type ModuleContext } from '@core/api';
import type { Box, PdfHighlight } from './pdfNotes';

export function FigureSelector({
  ctx,
  canvas,
  colour,
  onSelect,
}: {
  ctx: ModuleContext;
  canvas: React.RefObject<HTMLCanvasElement | null>;
  colour: string;
  onSelect: (highlight: PdfHighlight) => void;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Box | null>(null);
  const point = (e: React.PointerEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height)),
    };
  };
  function region(e: React.PointerEvent<HTMLDivElement>) {
    const start = origin.current;
    if (!start) return null;
    const end = point(e);
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
  }
  async function capture(area: Box) {
    const source = canvas.current;
    if (!source) return;
    const cut = document.createElement('canvas');
    cut.width = Math.round(source.width * area.w);
    cut.height = Math.round(source.height * area.h);
    if (cut.width < 4 || cut.height < 4) return;
    const pen = cut.getContext('2d');
    if (!pen) throw new Error('Could not capture this figure.');
    pen.drawImage(
      source,
      area.x * source.width,
      area.y * source.height,
      area.w * source.width,
      area.h * source.height,
      0,
      0,
      cut.width,
      cut.height,
    );
    const blob = await new Promise<Blob | null>((resolve) => {
      cut.toBlob(resolve);
    });
    if (!blob) throw new Error('Could not save this figure.');
    const id = newStrokeId();
    const folder = 'attachments/Figures';
    const path = folder + '/' + crypto.randomUUID() + '.png';
    await ctx.vault.ensureDir(folder);
    await ctx.vault.writeBytes(path, new Uint8Array(await blob.arrayBuffer()));
    onSelect({ id, rects: [area], colour, text: 'Figure selection', figure: path });
  }
  return (
    <div
      className="pdf-figure-selection"
      aria-label="Drag to select a figure"
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = point(e);
        setRect(null);
      }}
      onPointerMove={(e) => {
        if (origin.current) setRect(region(e));
      }}
      onPointerCancel={() => {
        origin.current = null;
        setRect(null);
      }}
      onPointerUp={(e) => {
        const area = region(e);
        origin.current = null;
        setRect(null);
        if (area)
          void capture(area).catch((err: unknown) => {
            ctx.app.notify(String(err));
          });
      }}
    >
      {rect && (
        <span
          style={{
            left: String(100 * rect.x) + '%',
            top: String(100 * rect.y) + '%',
            width: String(100 * rect.w) + '%',
            height: String(100 * rect.h) + '%',
          }}
        />
      )}
    </div>
  );
}
