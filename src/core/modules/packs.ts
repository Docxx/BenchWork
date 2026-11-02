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
    id: 'teaching-creative',
    name: 'Teaching and Creative',
    description:
      'Reusable lessons, a private presenter desk, rehearsals, personal quizzes and custom appearance profiles.',
    modules: ['teaching', 'study-arcade', 'theme-studio'],
  },
  {
    id: 'research',
    name: 'Research',
    description:
      'Lab notebooks, experiments and datasets, references from Zotero, inventory and fly flips, lab calculators and timers, the latest papers, tasks, plans and writing up.',
    modules: [
      'knowledge-graph',
      'lab-notebook',
      'lab-tools',
      'labels',
      'research',
      'protocol-runner',
      'sample-tracker',
      'equipment-planner',
      'research-questions',
      'meeting-organiser',
      'references',
      'papers',
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
    modules: ['knowledge-graph', 'tasks', 'handwriting', 'mind-maps'],
  },
];
