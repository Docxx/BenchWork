import { useRef, useState } from 'react';
import { useApp } from './AppStoreContext';

export function NotebookResize() {
  const height = useApp((s) => s.settings.appearance.notebookHeight);
  const save = useApp((s) => s.setAppearance);
  const start = useRef<{ y: number; height: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const clamp = (n: number) => Math.round(Math.max(140, Math.min(900, n)));
  return (
    <div
      className="notebook-resize"
      role="separator"
      aria-label="Notebook area height"
      aria-orientation="horizontal"
      tabIndex={0}
      aria-valuenow={preview ?? height}
      aria-valuemin={140}
      aria-valuemax={900}
      title="Drag to resize notebooks. Double-click to reset."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const pane = e.currentTarget.previousElementSibling;
        start.current = { y: e.clientY, height: pane?.getBoundingClientRect().height ?? height };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const next = clamp(start.current.height + e.clientY - start.current.y);
        setPreview(next);
        const pane = e.currentTarget.previousElementSibling;
        if (pane instanceof HTMLElement) pane.style.flexBasis = `${String(next)}px`;
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const next = clamp(start.current.height + e.clientY - start.current.y);
        start.current = null;
        setPreview(null);
        void save({ notebookHeight: next });
      }}
      onPointerCancel={(e) => {
        start.current = null;
        setPreview(null);
        const pane = e.currentTarget.previousElementSibling;
        if (pane instanceof HTMLElement) pane.style.flexBasis = `${String(height)}px`;
      }}
      onDoubleClick={() => void save({ notebookHeight: 360 })}
      onKeyDown={(e) => {
        if (!['ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
        e.preventDefault();
        void save({
          notebookHeight:
            e.key === 'Home' ? 360 : clamp(height + (e.key === 'ArrowDown' ? 32 : -32)),
        });
      }}
    >
      <span />
    </div>
  );
}
