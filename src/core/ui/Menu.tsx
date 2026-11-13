import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  /** Not needed for an item that only opens `children`. */
  onSelect?: () => void;
  danger?: boolean;
  /** A heading the item sits under; items in a row with the same one share it. */
  group?: string;
  /** Further items that fold out beneath this one when it is chosen. */
  children?: MenuItem[];
  /** Shows a tick, for a choice that is on. */
  checked?: boolean;
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
 * Enter chooses, Escape or a click elsewhere closes it. Items can sit under
 * headings, and an item with `children` folds them out in place, which
 * works the same with a finger as with a mouse.
 */
export function Menu({ label, x, y, items, footer, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);

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

  // Keep the menu on screen; it scrolls if it is taller than the window.
  const groups = new Set(items.map((i) => i.group).filter(Boolean)).size;
  const rows = items.length + (items.find((i) => i.label === open)?.children?.length ?? 0);
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - 40 - rows * 34 - groups * 26);

  const button = (item: MenuItem, nested: boolean) => {
    const folds = item.children !== undefined && item.children.length > 0;
    const expanded = open === item.label;
    return (
      <button
        key={item.label}
        type="button"
        role="menuitem"
        aria-expanded={folds ? expanded : undefined}
        className={['menu-item', item.danger ? 'danger' : '', nested ? 'nested' : '']
          .filter((c) => c !== '')
          .join(' ')}
        onClick={() => {
          if (folds) {
            setOpen(expanded ? null : item.label);
            return;
          }
          onClose();
          item.onSelect?.();
        }}
      >
        <span className="menu-label">{item.label}</span>
        {item.checked === true && <Check size={14} strokeWidth={2} aria-label="On" />}
        {folds &&
          (expanded ? (
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
          ))}
      </button>
    );
  };

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: Math.max(4, left), top: Math.max(4, top) }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => {
        const heading = item.group !== items[i - 1]?.group ? item.group : undefined;
        return (
          <div key={item.label} role="none">
            {heading !== undefined && (
              <div className={i === 0 ? 'menu-heading first' : 'menu-heading'} role="presentation">
                {heading}
              </div>
            )}
            {heading === undefined && i > 0 && item.group !== items[i - 1]?.group && (
              <div className="menu-divider" role="separator" />
            )}
            {button(item, false)}
            {open === item.label && item.children?.map((child) => button(child, true))}
          </div>
        );
      })}
      {footer}
    </div>
  );
}
