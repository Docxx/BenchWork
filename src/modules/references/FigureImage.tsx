import { useRef, useEffect } from 'react';
import type { ModuleContext } from '@core/api';
export function FigureImage({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const src = ctx.vault.fileUrl(path);
    if (src && image.current) image.current.src = src;
    return () => {
      if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
    };
  }, [ctx, path]);
  return <img ref={image} className="evidence-figure" alt="Selected figure" />;
}
