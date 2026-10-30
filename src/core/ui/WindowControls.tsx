import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from './AppStoreContext';

const ICON = { size: 15, strokeWidth: 1.5, 'aria-hidden': true } as const;

/**
 * Minimise, maximise and close, in the top right, where the system's title
 * bar is hidden. The window is moved by dragging the sidebar's header or
 * a view's top row, which carry `data-tauri-drag-region`.
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
