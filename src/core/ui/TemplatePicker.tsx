import { useEffect, useState } from 'react';
import { useApp } from './AppStoreContext';

interface TemplatePickerProps {
  /** `new` also asks for the new page's name. */
  mode: 'new' | 'insert';
  onChoose: (template: string, title: string) => void;
  onClose: () => void;
}

/** A list of templates to start a page from, or to insert into one. */
export function TemplatePicker({ mode, onChoose, onClose }: TemplatePickerProps) {
  const templates = useApp((s) => s.templates);
  const loadTemplates = useApp((s) => s.loadTemplates);
  const [title, setTitle] = useState('');

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <div
      className="template-picker confirm"
      role="dialog"
      aria-label="Choose a template"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {mode === 'new' && (
        <label className="field">
          <span className="label">Page name</span>
          <input
            // The picker opens on purpose, so it takes focus.
            autoFocus
            value={title}
            placeholder="Untitled page"
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </label>
      )}
      {templates.length === 0 ? (
        <p className="hint">
          No templates yet. Choose Save as template from a page&apos;s menu to make one.
        </p>
      ) : (
        <ul className="template-list" aria-label="Templates">
          {templates.map((t, i) => (
            <li key={t.path}>
              <button
                type="button"
                // In insert mode there is no name field, so the first template takes focus.
                autoFocus={mode === 'insert' && i === 0}
                onClick={() => {
                  onChoose(t.path, title);
                }}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="button" className="quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
