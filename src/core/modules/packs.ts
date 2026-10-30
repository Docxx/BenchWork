/**
 * Module packs: modules that suit a kind of work, switched on together,
 * such as when a new vault is set up. Each can still be switched off on its
 * own in Settings > Modules. Modules a device cannot run are left out there.
 */

export interface ModulePack {
  id: string;
  name: string;
  /** Who it is for, in a few words. */
  description: string;
  /** Module ids; modules they need come with them. */
  modules: readonly string[];
}

export const PACKS: readonly ModulePack[] = [
  {
    id: 'research',
    name: 'Research',
    description:
      'Lab notebooks, experiments and datasets, references from Zotero, inventory and fly flips, lab calculators and timers, tasks, plans and writing up.',
    modules: [
      'lab-notebook',
      'lab-tools',
      'research',
      'references',
      'data-viewer',
      'planner',
      'inventory',
      'tasks',
      'handwriting',
      'manuscript',
    ],
  },
  {
    id: 'notes',
    name: 'General notes',
    description: 'Notes and handwriting, tasks with a board, mind maps and a free canvas.',
    modules: ['tasks', 'handwriting', 'mind-maps'],
  },
];
