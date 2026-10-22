import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export interface MenuProps {
  label: string;
  /** Where to show it, in page coordinates. */
  x: number;
  y: number;
  items: MenuItem[];
  /** Extra content under the items, such as colour swatches. */
  footer?: ReactNode;
  onClose: () => void;
}

/**
 * A small pop-up menu. Opens with focus on the first item; arrow keys move,
 * Enter chooses, Escape or a click elsewhere closes it.
 */
export function Menu({ label, x, y, items, footer, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'ArrowDown') {
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Tab') {
      onClose();
      return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 40 - items.length * 34);

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: Math.max(4, left), top: Math.max(4, top) }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? 'menu-item danger' : 'menu-item'}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
      {footer}
    </div>
  );
}
