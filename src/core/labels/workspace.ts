import { parseLabelDesign, type LabelDesign, type LabelRow } from './model';
export interface LabelWorkspace {
  list(): Promise<LabelDesign[]>;
  save(design: LabelDesign): Promise<void>;
  records?(): Promise<LabelRow[]>;
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
    save: async (design) => {
      const stored = await localLabelWorkspace().list();
      const next = [...stored.filter((d) => d.id !== design.id), design];
      localStorage.setItem(key, JSON.stringify(next));
    },
  };
}
