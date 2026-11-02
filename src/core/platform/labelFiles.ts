import { invoke, isTauri } from '@tauri-apps/api/core';

/** Desktop writes a unique file in Downloads; Android opens the system share sheet. */
export async function exportLabelFile(name: string, text: string): Promise<string> {
  if (window.BenchWorkAndroid?.shareLabelTemplate) {
    const result: unknown = JSON.parse(window.BenchWorkAndroid.shareLabelTemplate(name, text));
    if (result && typeof result === 'object' && 'error' in result)
      throw new Error(String(result.error));
    return 'Choose where to save or share the label pack.';
  }
  if (isTauri()) {
    const path = await invoke<string>('label_export_file', { name, text });
    return `Label pack saved: ${path}`;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10000);
  return 'Label pack downloaded. Transfer it to your phone, then choose Import labels in its Library.';
}
