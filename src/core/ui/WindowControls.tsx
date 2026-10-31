import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from './AppStoreContext';

const ICON = { size: 15, strokeWidth: 1.5, 'aria-hidden': true } as const;

/** What a press in a top bar uses itself, rather than moving the window. */
const INTERACTIVE =
  'button, a, input, select, textarea, label, [role="tab"], [role="button"], [contenteditable="true"]';

/**
 * Minimise, maximise and close, in the top right, where the system's title
 * bar is hidden. The window is moved by pressing anywhere on the sidebar's
 * header or a view's top row, which carry `data-window-drag`, except on a
 * button or field there; a double press maximises it or puts it back.
 */
export function WindowControls() {
  const frame = useApp((s) => s.windowFrame);
  const [maximised, setMaximised] = useState(false);

  useEffect(() => {
    if (frame === null) return;
    let current = true;
    const check = () => {
      void frame.isMaximised().then((m) => {
        if (current) setMaximised(m);
      });
    };
    check();
    const stop = frame.onResized(check);
    return () => {
      current = false;
      stop();
    };
  }, [frame]);

  useEffect(() => {
    if (frame === null) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element)) return;
      const bar = e.target.closest('[data-window-drag]');
      if (!bar) return;
      // Buttons, fields and links in the bar work as usual.
      const control = e.target.closest(INTERACTIVE);
      if (control && bar.contains(control)) return;
      e.preventDefault();
      if (e.detail === 2) void frame.toggleMaximise();
      else void frame.startDragging();
    };
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
    };
  }, [frame]);

  if (frame === null) return null;
  return (
    <div className="window-controls" role="group" aria-label="Window">
      <button
        type="button"
        title="Minimise"
        aria-label="Minimise"
        onClick={() => void frame.minimise()}
      >
        <Minus {...ICON} />
      </button>
      <button
        type="button"
        title={maximised ? 'Restore' : 'Maximise'}
        aria-label={maximised ? 'Restore' : 'Maximise'}
        onClick={() => void frame.toggleMaximise()}
      >
        {maximised ? <Copy {...ICON} /> : <Square {...ICON} />}
      </button>
      <button
        type="button"
        className="close"
        title="Close"
        aria-label="Close"
        onClick={() => void frame.close()}
      >
        <X {...ICON} />
      </button>
    </div>
  );
}
