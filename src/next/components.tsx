import { ArrowUpRight, Check, ChevronRight, Command, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`nx-icon ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.7} />
    </button>
  );
}
export function Badge({ children, colour = 'neutral' }: { children: ReactNode; colour?: string }) {
  return <span className={`nx-badge ${colour}`}>{children}</span>;
}
export function SectionHead({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="nx-section-head">
      <div>
        {eyebrow && <span className="nx-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="nx-text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="nx-empty">
      <span className="nx-empty-orbit">✳</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="nx-button" onClick={onAction}>
          {action}
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`nx-modal ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="nx-modal-head">
        <div>
          <span className="nx-eyebrow">BENCHWORK NEXT</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <IconButton icon={X} label="Close dialog" onClick={close} />
      </div>
      {children}
    </dialog>
  );
}
export function MiniChart({
  colour = '#79b7a6',
  variant = 0,
}: {
  colour?: string;
  variant?: number;
}) {
  const paths = [
    'M0 62 C16 60 19 27 36 35 S60 66 80 44 S106 5 126 18 S151 49 175 28 S199 19 218 5',
    'M0 68 C20 63 15 47 36 45 S58 24 78 33 S106 42 124 27 S156 47 176 22 S200 10 218 16',
    'M0 60 C20 62 25 57 42 51 S65 59 87 40 S107 46 129 30 S158 39 177 18 S202 25 218 9',
  ];
  return (
    <svg className="nx-mini-chart" viewBox="0 0 220 82" fill="none" aria-hidden>
      <path
        d={`${paths[variant % 3] ?? paths[0] ?? ''} L218 82 L0 82Z`}
        fill={colour}
        opacity=".09"
      />
      <path d={paths[variant % 3]} stroke={colour} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M0 81H220" stroke="currentColor" opacity=".08" strokeDasharray="3 4" />
    </svg>
  );
}
export function OrbitalArt() {
  return (
    <div className="nx-orbital" aria-hidden>
      <div className="nx-orbit-ring ring-one" />
      <div className="nx-orbit-ring ring-two" />
      <div className="nx-orbit-ring ring-three" />
      <div className="nx-orbit-core">
        <svg viewBox="0 0 220 220">
          <defs>
            <radialGradient id="nx-cell">
              <stop stopColor="#d6e9b5" />
              <stop offset=".45" stopColor="#86b6a0" />
              <stop offset="1" stopColor="#305e57" />
            </radialGradient>
          </defs>
          {Array.from({ length: 37 }, (_, i) => {
            const angle = i * 2.39996;
            const r = Math.sqrt(i) * 14;
            const x = 110 + Math.cos(angle) * r;
            const y = 110 + Math.sin(angle) * r;
            return (
              <g
                key={i}
                transform={`translate(${String(x)},${String(y)}) rotate(${String(i * 47)})`}
              >
                <ellipse
                  rx={10 + (i % 5)}
                  ry={7 + (i % 4)}
                  fill="url(#nx-cell)"
                  opacity={0.45 + (i % 4) * 0.13}
                />
                <ellipse rx="3" ry="2.3" fill="#e1eac0" opacity=".75" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="nx-orbit-pin pin-one">
        <span />
        Every idea
      </div>
      <div className="nx-orbit-pin pin-two">
        <span />
        Every connection
      </div>
      <span className="nx-orbit-cross cross-one">+</span>
      <span className="nx-orbit-cross cross-two">+</span>
    </div>
  );
}
export function CheckCircle({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nx-check ${checked ? 'checked' : ''}`}
      aria-label={label}
      aria-pressed={checked}
      onClick={onClick}
    >
      {checked && <Check size={13} strokeWidth={2.5} />}
    </button>
  );
}
export function Shortcut() {
  return (
    <kbd>
      <Command size={11} /> K
    </kbd>
  );
}
