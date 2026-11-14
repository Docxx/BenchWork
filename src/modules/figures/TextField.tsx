import { useState } from 'react';

/** A text box that saves when it loses focus or Enter is pressed. */
export function Text({
  label,
  value,
  onSave,
  hint,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onSave(draft);
  };
  return (
    <input
      aria-label={label}
      placeholder={hint}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
