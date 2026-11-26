import { labelFolder, parseLabelDesign, type LabelDesign, type LabelRow } from './model';
export interface LabelWorkspace {
  list(): Promise<LabelDesign[]>;
  save(design: LabelDesign): Promise<void>;
  folders?(): Promise<string[]>;
  createFolder?(name: string): Promise<void>;
  saveMany?(designs: readonly LabelDesign[]): Promise<void>;
  records?(): Promise<LabelRow[]>;
  /**
   * Asks, then removes a saved label. Resolves to whether it went. Missing
   * where labels cannot be deleted.
   */
  remove?(design: LabelDesign): Promise<boolean>;
}
export function localLabelWorkspace(): LabelWorkspace {
  const key = 'benchwork.label-studio.templates';
  return {
    list: () => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Promise.resolve(Array.isArray(value) ? value.map(parseLabelDesign) : []);
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    },
    folders: () => {
      const stored: unknown = JSON.parse(localStorage.getItem(`${key}.folders`) ?? '[]');
      return Promise.resolve(
        Array.isArray(stored)
          ? stored
              .filter((s): s is string => typeof s === 'string')
              .map(labelFolder)
              .filter(Boolean)
          : [],
      );
    },
    createFolder: async (name) => {
      const folders = (await localLabelWorkspace().folders?.()) ?? [];
      localStorage.setItem(
        `${key}.folders`,
        JSON.stringify([...new Set([...folders, labelFolder(name)])].filter(Boolean)),
      );
    },
    saveMany: async (designs) => {
      const stored = await localLabelWorkspace().list();
      const ids = new Set(designs.map((d) => d.id));
      localStorage.setItem(
        key,
        JSON.stringify([...stored.filter((d) => !ids.has(d.id)), ...designs]),
      );
    },
    save: async (design) => {
      const stored = await localLabelWorkspace().list();
      const next = [...stored.filter((d) => d.id !== design.id), design];
      localStorage.setItem(key, JSON.stringify(next));
    },
    remove: async (design) => {
      if (!globalThis.confirm(`Delete the label "${design.name}"? This cannot be undone.`))
        return false;
      const stored = await localLabelWorkspace().list();
      localStorage.setItem(key, JSON.stringify(stored.filter((d) => d.id !== design.id)));
      return true;
    },
  };
}
