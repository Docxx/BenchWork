import { AppWindow, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from './AppStoreContext';

/**
 * For Home: other programs on this computer, such as a graphing or imaging
 * program, each opened with a press. The list is this computer's own, as
 * programs live in different places on each. Not offered on the tablet.
 */
export function ProgramsWidget() {
  const programs = useApp((s) => s.settings.programs);
  const setPrograms = useApp((s) => s.setPrograms);
  const addProgram = useApp((s) => s.addProgram);
  const launch = useApp((s) => s.launchProgram);
  const able = useApp((s) => s.canLaunch());
  const error = useApp((s) => s.settingsError);
  const [editing, setEditing] = useState(false);

  if (!able) return <p className="hint">Programs open from Home on a computer.</p>;
  return (
    <div className="programs-card">
      {programs.length === 0 ? (
        <p className="hint">Add the programs you use, to open them from here.</p>
      ) : (
        <ul className="programs-list" aria-label="Programs">
          {programs.map((p, i) => (
            <li key={p.path}>
              {editing ? (
                <>
                  <input
                    aria-label={`Name of ${p.name}`}
                    defaultValue={p.name}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name !== '' && name !== p.name) {
                        void setPrograms(programs.map((x, j) => (j === i ? { ...x, name } : x)));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${p.name}`}
                    title="Remove"
                    onClick={() => void setPrograms(programs.filter((_x, j) => j !== i))}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="program-button"
                  title={p.path}
                  onClick={() => void launch(p)}
                >
                  <AppWindow size={18} strokeWidth={1.75} aria-hidden />
                  <span>{p.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error !== null && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="programs-actions">
        <button type="button" className="quiet" onClick={() => void addProgram()}>
          <Plus size={14} aria-hidden /> Add a program
        </button>
        {programs.length > 0 && (
          <button
            type="button"
            className="quiet"
            aria-pressed={editing}
            onClick={() => {
              setEditing(!editing);
            }}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
    </div>
  );
}
