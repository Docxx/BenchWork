import { useEffect } from 'react';
import { useApp } from './AppStoreContext';
import { Shell } from './Shell';
import { applyTheme } from './theme';
import { ConfirmFolder, ConfirmNested, VaultPicker } from './VaultPicker';

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

export function App() {
  const status = useApp((s) => s.status);
  const theme = useApp((s) => s.settings.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(blockStrayFileDrops, []);

  switch (status.kind) {
    case 'starting':
      return <main className="app" aria-busy="true" />;
    case 'no-vault':
      return <VaultPicker />;
    case 'confirm-folder':
      return <ConfirmFolder root={status.root} />;
    case 'confirm-nested':
      return <ConfirmNested folder={status.folder} owner={status.owner} />;
    case 'open':
      return <Shell vault={status.vault} />;
  }
}
