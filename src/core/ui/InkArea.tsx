import { useEffect, useRef } from 'react';
import type { InkStroke } from '../ink/inkFile';
import { InkSurface } from '../ink/surface';
import { useAppStore } from './AppStoreContext';

/** Whether the app is showing dark colours now. */
function pageIsDark(): boolean {
  return document.documentElement.style.colorScheme === 'dark';
}

/**
 * An area of the page to write and draw on with the pen, or the mouse.
 * Writes with the pen tools chosen in the toolbar; fingers scroll.
 */
export function InkArea({
  strokes,
  width,
  height,
  editable,
  onChange,
  label = 'Ink',
}: {
  strokes: readonly InkStroke[];
  width: number | string;
  height: number | string;
  editable: boolean;
  onChange: (strokes: InkStroke[]) => void;
  label?: string;
}) {
  const store = useAppStore();
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<InkSurface | null>(null);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = new InkSurface(el, [], {
      settings: () => store.getState().pen,
      onChange: (next) => {
        change.current(next);
      },
      onPen: () => {
        store.getState().notePen();
      },
      dark: pageIsDark,
    });
    surface.current = s;
    // Light or dark changes the colour black ink shows in.
    const theme = new MutationObserver(() => {
      s.redraw();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      theme.disconnect();
      s.destroy();
      surface.current = null;
    };
  }, [store]);

  useEffect(() => {
    surface.current?.setStrokes(strokes);
  }, [strokes]);

  useEffect(() => {
    surface.current?.setEditable(editable);
  }, [editable]);

  return (
    <div
      ref={host}
      className={editable ? 'ink-area editable' : 'ink-area'}
      role="img"
      aria-label={label}
      style={{ width, height }}
    />
  );
}
