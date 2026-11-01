import { useEffect, useMemo, useRef, useState } from 'react';
import { AudienceSlide, type AudienceFrame, type ModuleContext } from '@core/api';
import { slideImage } from './materials';
import { publicFrame, type Lesson, type Slide } from './model';

export function useFrame(
  ctx: ModuleContext,
  lesson: Lesson,
  slide: Slide | undefined,
  lines: number,
  blank: boolean,
) {
  const [asset, setAsset] = useState<{ key: string; image: string | null; error: string } | null>(
    null,
  );
  const key = `${slide?.id ?? ''}:${slide?.image ?? ''}:${slide?.source ?? ''}:${String(slide?.pdfPage)}`;
  const imagePath = slide?.image ?? null;
  const source = slide?.source ?? null;
  const pdfPage = slide?.pdfPage ?? null;
  useEffect(() => {
    let active = true;
    void slideImage(ctx, { image: imagePath, source, pdfPage })
      .then((image) => {
        if (active) setAsset({ key, image, error: '' });
      })
      .catch((e: unknown) => {
        if (active) setAsset({ key, image: null, error: String(e) });
      });
    return () => {
      active = false;
    };
  }, [ctx, key, imagePath, source, pdfPage]);
  const needsImage = !!(imagePath || pdfPage);
  const ready = !needsImage || (asset?.key === key && !asset.error);
  const image = asset?.key === key ? asset.image : null;
  const frame = useMemo(
    () => publicFrame(lesson, slide, image, lines, blank || !ready),
    [lesson, slide, image, lines, blank, ready],
  );
  return { frame, ready, error: asset?.key === key ? asset.error : '' };
}

export function Stage({
  frame,
  draw,
  onStrokes,
}: {
  frame: AudienceFrame;
  draw: boolean;
  onStrokes: (strokes: AudienceFrame['strokes']) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const active = useRef<{ pointer: number; points: [number, number][] } | null>(null);
  const [pending, setPending] = useState<[number, number][]>([]);
  function point(e: React.PointerEvent): [number, number] {
    const bounds = host.current?.getBoundingClientRect();
    if (!bounds) return [0, 0];
    return [
      ((e.clientX - bounds.left) / bounds.width) * 1000,
      ((e.clientY - bounds.top) / bounds.height) * 562.5,
    ];
  }
  return (
    <div
      ref={host}
      className={`teaching-stage ${draw ? 'is-drawing' : ''}`}
      onPointerDown={(e) => {
        if (!draw || frame.blank || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = { pointer: e.pointerId, points: [point(e)] };
        setPending(active.current.points);
      }}
      onPointerMove={(e) => {
        if (active.current?.pointer !== e.pointerId) return;
        active.current.points = [...active.current.points, point(e)].slice(-1000);
        setPending(active.current.points);
      }}
      onPointerUp={(e) => {
        if (active.current?.pointer !== e.pointerId) return;
        if (frame.strokes.length < 100)
          onStrokes([
            ...frame.strokes,
            { colour: '#ffce63', width: 3, points: active.current.points },
          ]);
        active.current = null;
        setPending([]);
      }}
      onPointerCancel={() => {
        active.current = null;
        setPending([]);
      }}
    >
      <AudienceSlide
        frame={
          pending.length
            ? {
                ...frame,
                strokes: [...frame.strokes, { colour: '#ffce63', width: 3, points: pending }],
              }
            : frame
        }
      />
    </div>
  );
}
