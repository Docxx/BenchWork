import { useEffect, useState } from 'react';
import type { TextPrompt } from '../state/appStore';
import { useApp } from './AppStoreContext';

/** A module's question, such as the name for a new project. */
export function TextPromptDialog() {
  const prompt = useApp((s) => s.textPrompt);
  if (prompt === null) return null;
  // Keyed so each question starts with its own text.
  return <PromptForm key={`${prompt.title}\n${prompt.initial}`} prompt={prompt} />;
}

function PromptForm({ prompt }: { prompt: TextPrompt }) {
  const answerText = useApp((s) => s.answerText);
  const [value, setValue] = useState(prompt.initial);

  return (
    <form
      className="floating-dialog confirm"
      role="dialog"
      aria-label={prompt.title}
      onSubmit={(e) => {
        e.preventDefault();
        answerText(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          answerText(null);
        }
      }}
    >
      <h2 className="dialog-title">{prompt.title}</h2>
      <label className="field">
        <span className="label">{prompt.label}</span>
        <input
          // The question was asked on purpose, so it takes focus.
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      </label>
      <div className="actions">
        <button type="submit" disabled={value.trim() === ''}>
          OK
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            answerText(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Every module command, to run by name. Opened with Ctrl+K. */
export function CommandList({ onClose }: { onClose: () => void }) {
  const commands = useApp((s) => s.commands);
  const runCommand = useApp((s) => s.runCommand);
  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = commands.filter((c) => words.every((w) => c.title.toLowerCase().includes(w)));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const run = (id: string) => {
    onClose();
    void runCommand(id, { folder: null });
  };

  return (
    <div className="floating-dialog confirm command-list" role="dialog" aria-label="Commands">
      <input
        // Opened on purpose with Ctrl+K, so it takes focus.
        autoFocus
        aria-label="Find a command"
        placeholder="Find a command"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && shown[0]) run(shown[0].id);
        }}
      />
      {shown.length === 0 ? (
        <p className="hint">
          {commands.length === 0 ? 'Modules that are on have no commands.' : 'No matching command.'}
        </p>
      ) : (
        <ul className="template-list" aria-label="Commands found">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  run(c.id);
                }}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
