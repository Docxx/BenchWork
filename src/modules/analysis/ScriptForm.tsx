import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import { DEFAULT_ARGS, type Script } from './scripts';

export function ScriptForm({
  ctx,
  script,
  onSave,
  onRemove,
}: {
  ctx: ModuleContext;
  script: Script;
  onSave: (script: Script) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(script);
  const set = (changes: Partial<Script>) => {
    setDraft({ ...draft, ...changes });
  };
  const pick = async () => {
    const [file] = await ctx.vault.pickFiles({ title: 'Choose the script', multiple: false });
    if (file) set({ script: ctx.vault.vaultPathOf(file) ?? file });
  };
  return (
    <fieldset className="analysis-script" aria-label={script.name || 'New script'}>
      <label className="label">
        Name
        <input
          value={draft.name}
          placeholder="Buzzz"
          onChange={(e) => {
            set({ name: e.target.value });
          }}
        />
      </label>
      <label className="label">
        Run with
        <select
          aria-label="Runtime preset"
          value={['python', 'Rscript'].includes(draft.program) ? draft.program : 'custom'}
          onChange={(e) => {
            if (e.target.value !== 'custom') set({ program: e.target.value });
          }}
        >
          <option value="python">Python</option>
          <option value="Rscript">R</option>
          <option value="custom">Custom executable</option>
        </select>
        <input
          value={draft.program}
          placeholder="python"
          onChange={(e) => {
            set({ program: e.target.value });
          }}
        />
      </label>
      <div className="label">
        Script
        <div className="analysis-pick">
          <input
            aria-label="Script file"
            value={draft.script}
            onChange={(e) => {
              set({ script: e.target.value });
            }}
          />
          <button type="button" className="quiet" onClick={() => void pick()}>
            Choose…
          </button>
        </div>
      </div>
      <label className="label">
        Arguments
        <input
          value={draft.args}
          placeholder={DEFAULT_ARGS}
          onChange={(e) => {
            set({ args: e.target.value });
          }}
        />
      </label>
      <p className="hint">
        {'{script}'} the script, {'{files}'} the dataset’s files, {'{output}'} a new folder for the
        results, {'{folder}'} the dataset’s folder, {'{name}'} its name.
      </p>
      <fieldset>
        <legend>Parameter defaults</legend>
        <p className="hint">
          Add a name and value, then use {'{param:name}'} in Arguments. Values are passed as single
          arguments.
        </p>
        {Object.entries(draft.parameters ?? {}).map(([key, value]) => (
          <div className="analysis-pick" key={key}>
            <label className="label">
              {key}
              <input
                value={value}
                onChange={(e) => {
                  set({ parameters: { ...draft.parameters, [key]: e.target.value } });
                }}
              />
            </label>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                set({
                  parameters: Object.fromEntries(
                    Object.entries(draft.parameters ?? {}).filter(([k]) => k !== key),
                  ),
                });
              }}
            >
              Remove {key}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="quiet"
          onClick={() =>
            void ctx.app
              .askText({ title: 'Add parameter', label: 'Parameter name' })
              .then((name) => {
                if (name && /^[a-zA-Z][\w-]*$/.test(name))
                  set({ parameters: { ...draft.parameters, [name]: '' } });
                else if (name)
                  ctx.app.notify(
                    'Use a letter followed by letters, numbers, underscores or hyphens.',
                  );
              })
          }
        >
          Add parameter
        </button>
      </fieldset>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            onSave(draft);
          }}
        >
          Save script
        </button>
        <button type="button" className="quiet" onClick={onRemove}>
          Remove
        </button>
      </div>
    </fieldset>
  );
}
