import { useState, type KeyboardEvent } from 'react';
import type { Theme } from '../settings/appSettings';
import { LINK_THRESHOLD_RANGE } from '../state/appStore';
import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { ModulesPanel } from './ModulesPanel';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'vault', label: 'Vault' },
  { id: 'modules', label: 'Modules' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SettingsPage({ vault }: { vault: OpenVault }) {
  const showView = useApp((s) => s.showView);
  const settingsError = useApp((s) => s.settingsError);
  const [tab, setTab] = useState<TabId>('general');

  function onTabKey(event: KeyboardEvent<HTMLDivElement>): void {
    const index = TABS.findIndex((t) => t.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (!next) return;
    setTab(next.id);
    document.getElementById(`settings-tab-${next.id}`)?.focus();
    event.preventDefault();
  }

  return (
    <section className="settings" aria-labelledby="settings-title">
      <header className="settings-header">
        <h2 id="settings-title">Settings</h2>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            showView('files');
          }}
        >
          Close
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`settings-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="tab"
            onClick={() => {
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {settingsError !== null && (
        <p className="notice" role="alert">
          {settingsError}
        </p>
      )}

      <div
        className="tab-panel"
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
      >
        {tab === 'general' && (
          <>
            <GeneralSettings />
            <SidebarSettings />
          </>
        )}
        {tab === 'vault' && <VaultSettings vault={vault} />}
        {tab === 'modules' && <ModulesPanel />}
      </div>
    </section>
  );
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function GeneralSettings() {
  const theme = useApp((s) => s.settings.theme);
  const setTheme = useApp((s) => s.setTheme);

  return (
    <fieldset className="field">
      <legend>Theme</legend>
      {THEMES.map((t) => (
        <label key={t.value} className="choice">
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={theme === t.value}
            onChange={() => void setTheme(t.value)}
          />
          {t.label}
        </label>
      ))}
      <p className="hint">Saved on this device only.</p>
    </fieldset>
  );
}

function SidebarSettings() {
  const showAllFiles = useApp((s) => s.settings.showAllFiles);
  const setShowAllFiles = useApp((s) => s.setShowAllFiles);

  return (
    <fieldset className="field">
      <legend>Sidebar</legend>
      <label className="choice">
        <input
          type="checkbox"
          checked={showAllFiles}
          onChange={(e) => void setShowAllFiles(e.target.checked)}
        />
        Show all files, not just pages
      </label>
      <p className="hint">Saved on this device only.</p>
    </fieldset>
  );
}

function VaultSettings({ vault }: { vault: OpenVault }) {
  const setLinkThreshold = useApp((s) => s.setLinkThreshold);
  const closeVault = useApp((s) => s.closeVault);
  const saved = vault.config.attachments.linkThresholdMB;
  const [draft, setDraft] = useState(String(saved));

  function commit(): void {
    const value = Number(draft);
    if (value === saved && draft.trim() !== '') return;
    void setLinkThreshold(value);
  }

  return (
    <>
      <div className="field">
        <span className="label">Folder</span>
        <p className="path">{vault.root}</p>
        <button type="button" onClick={() => void closeVault()}>
          Switch vault
        </button>
      </div>

      <div className="field">
        <label className="label" htmlFor="link-threshold">
          Link files larger than
        </label>
        <div className="with-unit">
          <input
            id="link-threshold"
            type="number"
            inputMode="numeric"
            min={LINK_THRESHOLD_RANGE.min}
            max={LINK_THRESHOLD_RANGE.max}
            step={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <span>MB</span>
        </div>
        <p className="hint">
          Smaller files are copied into the vault. Larger ones stay where they are and are linked,
          with a checksum. Saved in this vault.
        </p>
      </div>

      <SearchIndexSettings />
    </>
  );
}

function SearchIndexSettings() {
  const rebuild = useApp((s) => s.rebuildIndex);
  const progress = useApp((s) => s.indexProgress);
  const busy = progress.state === 'indexing';

  return (
    <div className="field">
      <span className="label">Search</span>
      <button type="button" disabled={busy} onClick={() => void rebuild()}>
        {busy ? 'Indexing…' : 'Rebuild search index'}
      </button>
      <p className="hint">
        Reads every page again. Use this if search misses something. Your pages are not changed.
      </p>
    </div>
  );
}
