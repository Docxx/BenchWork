import { useEffect, useState } from 'react';
import type { PenMode } from '../settings/appSettings';
import { useApp } from './AppStoreContext';
import { Shell } from './Shell';
import { Splash } from './Splash';
import { WindowControls } from './WindowControls';
import { applyAppearance } from './theme';
import {
  ChooseFolder,
  ConfirmFolder,
  ConfirmNested,
  ConfirmSyncing,
  VaultPicker,
} from './VaultPicker';

/**
 * A file dropped anywhere but the page editor would otherwise make the
 * window open it in place of the app. Drags within the app are unaffected.
 */
function blockStrayFileDrops(): () => void {
  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') === true;
  const inEditor = (e: DragEvent) =>
    e.target instanceof Element && e.target.closest('.page-editor') !== null;
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e) || inEditor(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  };
  const onDrop = (e: DragEvent) => {
    if (hasFiles(e) && !e.defaultPrevented) e.preventDefault();
  };
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('drop', onDrop);
  };
}

/**
 * A tablet's keyboard may turn pen writing into typed text, but only in
 * text that has focus. While the pen draws, a page with focus lets go of
 * it as the pen comes near, so the pen draws every time.
 */
function letGoForPen(e: PointerEvent, penMode: PenMode): void {
  if (penMode !== 'draw') return;
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !focused.classList.contains('page-editor')) return;
  if (e.target instanceof Element && e.target.closest('.page-editor')) focused.blur();
}

function darkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

/** Whether the operating system is set to dark, following changes. */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => darkQuery()?.matches ?? false);
  useEffect(() => {
    const query = darkQuery();
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => {
      setDark(e.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);
  return dark;
}

export function App() {
  const status = useApp((s) => s.status);
  const theme = useApp((s) => s.settings.theme);
  const appearance = useApp((s) => s.settings.appearance);
  const systemDark = useSystemDark();
  // The settings change from the defaults once read from disk.
  const settings = useApp((s) => s.settings);
  const [firstSettings] = useState(settings);
  const settingsKnown = settings !== firstSettings;

  useEffect(() => {
    applyAppearance(appearance, theme, systemDark);
  }, [appearance, theme, systemDark]);

  useEffect(blockStrayFileDrops, []);

  // Whether the system turns pen writing into text, as chosen in the pen tools.
  const penMode = settings.penMode;
  const applyPenMode = useApp((s) => s.applyPenMode);
  useEffect(() => {
    applyPenMode();
  }, [penMode, applyPenMode]);

  // The pen tools show once a pen is seen anywhere, hovering or touching.
  const notePen = useApp((s) => s.notePen);
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      notePen();
      if (e.type === 'pointermove' && e.buttons === 0) letGoForPen(e, penMode);
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('pointermove', onPointer, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('pointermove', onPointer, true);
    };
  }, [notePen, penMode]);

  return (
    <>
      <Screen />
      {status.kind !== 'open' && (
        // Before a vault opens there is no sidebar to drag the window by.
        <>
          <div className="window-drag-strip" data-tauri-drag-region />
          <WindowControls />
        </>
      )}
      <Splash
        settingsKnown={settingsKnown || status.kind !== 'starting'}
        enabled={appearance.startupAnimation}
        ready={status.kind !== 'starting'}
      />
    </>
  );
}

/** What the app shows: the vault picker, or the open vault. */
function Screen() {
  const status = useApp((s) => s.status);
  switch (status.kind) {
    case 'starting':
      return <main className="app" aria-busy="true" />;
    case 'no-vault':
      return <VaultPicker />;
    case 'confirm-folder':
      return <ConfirmFolder root={status.root} />;
    case 'confirm-syncing':
      return <ConfirmSyncing root={status.root} />;
    case 'confirm-nested':
      return <ConfirmNested folder={status.folder} owner={status.owner} />;
    case 'browse':
      return <ChooseFolder mode={status.mode} />;
    case 'open':
      return <Shell vault={status.vault} />;
  }
}
