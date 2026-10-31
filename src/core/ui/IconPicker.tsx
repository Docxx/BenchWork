import { useEffect, useRef, useState } from 'react';
import type { NotebookNode } from '../notebooks/notebookTree';
import { useApp } from './AppStoreContext';

/** Icons to pick from, for lab work and the rest of life. Any emoji can be typed too. */
export const ICONS =
  '📓 📔 📒 📕 📗 📘 📙 📚 🧪 🧫 🧬 🔬 🧠 🪰 🐭 🦠 🌱 🍄 💊 🩸 📊 📈 🗂️ 📁 📝 ✏️ 📌 🗓️ ⏰ 💡 ⭐ 🔥 ✅ ❗ 🎓 🏫 🏠 ✈️ 🎉 💰 🔧 ⚙️ 🖥️ 📷 🎨 🎵 ❤️ 🌍'.split(
    ' ',
  );

/**
 * Chooses an icon for a notebook or section: one from the grid, one typed
 * in, or none. It is kept in the folder's _section.yaml.
 */
export function IconPicker({
  node,
  x,
  y,
  onClose,
}: {
  node: NotebookNode;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const setFolderIcon = useApp((s) => s.setFolderIcon);
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [onClose]);

  const choose = (icon: string | null) => {
    onClose();
    void setFolderIcon(node.path, icon);
  };

  return (
    <div
      ref={ref}
      className="menu icon-picker"
      role="dialog"
      aria-label={`Icon for ${node.title}`}
      style={{
        left: Math.min(x, window.innerWidth - 280),
        top: Math.min(y, window.innerHeight - 300),
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="icon-grid">
        {ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            aria-label={`Icon ${icon}`}
            aria-pressed={node.icon === icon}
            onClick={() => {
              choose(icon);
            }}
          >
            {icon}
          </button>
        ))}
      </div>
      <form
        className="icon-own"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim() !== '') choose(typed.trim());
        }}
      >
        <input
          aria-label="Your own icon"
          placeholder="Or type an emoji"
          maxLength={8}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
          }}
        />
        <button type="submit" className="quiet" disabled={typed.trim() === ''}>
          Use
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            choose(null);
          }}
        >
          None
        </button>
      </form>
    </div>
  );
}
