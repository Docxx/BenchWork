import { Settings2 } from 'lucide-react';
import { useRef } from 'react';
import { dockContents } from '../settings/layout';
import { useApp } from './AppStoreContext';
import { Dock, DockSplitter } from './Dock';
import { useHomeLayout, useWidgets } from './widgets';

/**
 * The right side: two docks of widgets, one above the other, such as the
 * open page's outline and the pages linking to it at the top, and a
 * calendar or timer below. Hidden from Settings > Appearance or the top bar.
 */
export function SidePanel() {
  const openSettings = useApp((s) => s.openSettings);
  const setDockSize = useApp((s) => s.setDockSize);
  const widgets = useWidgets();
  const { docks } = useHomeLayout();
  const shown = dockContents(docks, widgets);
  const panel = useRef<HTMLElement>(null);
  const bottomUsed = shown.rightBottom.length > 0;

  /** The top dock's share after dragging the line between them by `dy`. */
  const splitAfter = (dy: number) => {
    const height = panel.current?.getBoundingClientRect().height ?? 1;
    return docks.rightSplit + dy / Math.max(height, 1);
  };

  return (
    <aside
      ref={panel}
      className="side-panel"
      aria-label="Side panel"
      style={bottomUsed ? { ['--dock-split' as string]: String(docks.rightSplit) } : undefined}
    >
      <Dock place="rightTop" ids={shown.rightTop} widgets={widgets} className="dock-top" />
      {bottomUsed && (
        <DockSplitter
          label="Size of the docks on the right"
          onMove={(dy) => {
            panel.current?.style.setProperty(
              '--dock-split',
              String(Math.min(0.85, Math.max(0.15, splitAfter(dy)))),
            );
          }}
          onDone={(dy) => void setDockSize({ rightSplit: splitAfter(dy) })}
        />
      )}
      <Dock place="rightBottom" ids={shown.rightBottom} widgets={widgets} className="dock-bottom" />
      <footer className="side-footer">
        <button
          type="button"
          className="quiet"
          onClick={() => {
            openSettings('modules');
          }}
        >
          <Settings2 size={15} strokeWidth={1.75} aria-hidden />
          Customise modules
        </button>
      </footer>
    </aside>
  );
}
