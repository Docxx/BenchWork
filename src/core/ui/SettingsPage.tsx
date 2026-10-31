import { useEffect, useState, type KeyboardEvent } from 'react';
import { LINK_THRESHOLD_RANGE } from '../state/appStore';
import type { PageLayout } from '../vault/vaultConfig';
import type { OpenVault } from '../vault/vaultService';
import { AppearanceSettings } from './AppearanceSettings';
import { BackupSettings } from './BackupSettings';
import { useApp } from './AppStoreContext';
import { ModulesPanel } from './ModulesPanel';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'vault', label: 'Vault' },
  { id: 'modules', label: 'Modules' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SettingsPage({ vault }: { vault: OpenVault }) {
  const showView = useApp((s) => s.showView);
  const settingsError = useApp((s) => s.settingsError);
  const requested = useApp((s) => s.settingsTab);
  const [tab, setTab] = useState<TabId>(
    () => TABS.find((t) => t.id === requested)?.id ?? 'general',
  );

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
      <header className="settings-header" data-window-drag>
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
        {tab === 'general' && <SidebarSettings />}
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'vault' && <VaultSettings vault={vault} />}
        {tab === 'modules' && <ModulesPanel />}
      </div>
    </section>
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
          Smaller files are copied into the vault. For larger ones, BenchWork asks: link to them
          where they are, with a checksum, or copy them in. Saved in this vault.
        </p>
      </div>

      <NewPageSettings layout={vault.config.pages.layout} />
      <BackupSettings root={vault.root} />
      <TemplateSettings />
      <SearchIndexSettings />
    </>
  );
}

function NewPageSettings({ layout }: { layout: PageLayout }) {
  const setNewPageLayout = useApp((s) => s.setNewPageLayout);
  const options: { value: PageLayout; label: string; hint: string }[] = [
    { value: 'document', label: 'Document', hint: 'Text flows down the page.' },
    {
      value: 'free',
      label: 'Free layout',
      hint: 'Click anywhere to write; boxes can be moved and resized.',
    },
  ];
  return (
    <fieldset className="field">
      <legend>New pages start as</legend>
      {options.map((o) => (
        <label key={o.value} className="choice">
          <input
            type="radio"
            name="new-page-layout"
            value={o.value}
            checked={layout === o.value}
            onChange={() => void setNewPageLayout(o.value)}
          />
          {o.label}
          <span className="hint">{o.hint}</span>
        </label>
      ))}
      <p className="hint">
        Each page can be switched from its top bar at any time. Saved in this vault.
      </p>
    </fieldset>
  );
}

function TemplateSettings() {
  const templates = useApp((s) => s.templates);
  const loadTemplates = useApp((s) => s.loadTemplates);
  const openPage = useApp((s) => s.openPage);
  const showView = useApp((s) => s.showView);
  const recycleItem = useApp((s) => s.recycleItem);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <div className="field">
      <span className="label">Templates</span>
      {templates.length === 0 ? (
        <p className="hint">
          None yet. Choose Save as template from a page&apos;s menu to make one.
        </p>
      ) : (
        <ul className="template-settings" aria-label="Templates">
          {templates.map((t) => (
            <li key={t.path}>
              <span>{t.title}</span>
              <button
                type="button"
                onClick={() => {
                  showView('files');
                  void openPage(t.path);
                }}
              >
                Open
              </button>
              {confirming === t.path ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(null);
                    void recycleItem(t.path).then(() => loadTemplates());
                  }}
                >
                  Confirm
                </button>
              ) : (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setConfirming(t.path);
                  }}
                >
                  Move to Recycle Bin
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Templates are pages in the templates folder. A template called Daily is used for new daily
        pages. Placeholders: {'{{title}}'}, {'{{date}}'}, {'{{time}}'}, {'{{weekday}}'}.
      </p>
    </div>
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
