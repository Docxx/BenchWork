export type NextView =
  | 'overview'
  | 'projects'
  | 'notebook'
  | 'evidence'
  | 'constellation'
  | 'protocol'
  | 'figures'
  | 'focus'
  | 'modules'
  | 'engine';
export type Stage = 'Ideas' | 'In progress' | 'In review' | 'Complete';
export const STAGES: Stage[] = ['Ideas', 'In progress', 'In review', 'Complete'];
export interface Project {
  id: string;
  name: string;
  description: string;
  colour: string;
  code: string;
}
export interface Task {
  id: string;
  title: string;
  project: string;
  stage: Stage;
  priority: 'Normal' | 'High';
  tag: string;
}
export interface Note {
  id: string;
  path: string;
  title: string;
  project: string;
  kind: string;
}
export interface Evidence {
  id: string;
  title: string;
  author: string;
  year: string;
  kind: 'Paper' | 'Observation' | 'Dataset';
  project: string;
  summary: string;
  tags: string[];
  read: boolean;
  starred: boolean;
}
export interface Activity {
  id: string;
  text: string;
  detail: string;
  at: string;
}
export interface Workspace {
  version: 1;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  evidence: Evidence[];
  checkedSteps: string[];
  protocol: {
    title: string;
    steps: { id: string; title: string; detail: string; seconds: number }[];
  };
  modules: string[];
  activity: Activity[];
  focusSessions: number;
  focusMinutes: number;
  theme: 'light' | 'dark';
}
export const MODULES = [
  {
    id: 'evidence',
    name: 'Evidence library',
    kicker: 'Read with purpose',
    description:
      'Collect sources, keep your own summaries and see the evidence behind each project.',
    icon: 'BookOpen',
    colour: 'teal',
  },
  {
    id: 'constellation',
    name: 'Constellation',
    kicker: 'Connect the dots',
    description:
      'Explore how your notes, sources and projects relate. Follow a connection straight back to its origin.',
    icon: 'Orbit',
    colour: 'blue',
  },
  {
    id: 'protocol',
    name: 'Protocol lab',
    kicker: 'Stay in the experiment',
    description:
      'A guided bench mode with a persistent checklist, step timers and a run report for your notebook.',
    icon: 'FlaskConical',
    colour: 'orange',
  },
  {
    id: 'figures',
    name: 'Figure studio',
    kicker: 'Make the result clear',
    description:
      'The full BenchWork figure editor. Real-sized layouts, editable graphs and publication exports.',
    icon: 'PanelsTopLeft',
    colour: 'violet',
  },
  {
    id: 'focus',
    name: 'Focus room',
    kicker: 'Space to think',
    description:
      'An immersive timer, a single intention and a session log. No notifications competing for your attention.',
    icon: 'Focus',
    colour: 'pink',
  },
] as const;
export const PROTOCOL = [
  {
    id: 'prepare',
    title: 'Prepare the imaging workspace',
    detail:
      'Check the microscope booking, label the sample positions and record the acquisition settings.',
    seconds: 0,
  },
  {
    id: 'baseline',
    title: 'Capture a baseline',
    detail:
      'Acquire the control field. Record exposure, gain and the time of the first frame in your run notes.',
    seconds: 180,
  },
  {
    id: 'acquire',
    title: 'Acquire the time course',
    detail:
      'Follow your validated experimental protocol. Use this timer as a reminder, not an instrument controller.',
    seconds: 600,
  },
  {
    id: 'quality',
    title: 'Check the image quality',
    detail:
      'Inspect focus, saturation and drift. Flag exclusions before comparing experimental groups.',
    seconds: 0,
  },
  {
    id: 'archive',
    title: 'Archive and reflect',
    detail: 'Store the raw files, add a short observation and write down the next question.',
    seconds: 0,
  },
];
export function seedWorkspace(): Workspace {
  return {
    version: 1,
    projects: [
      {
        id: 'signal',
        name: 'The recovery window',
        description: 'Mapping how cells find their way back after stress.',
        colour: '#357b74',
        code: 'RW',
      },
      {
        id: 'atlas',
        name: 'A living cell atlas',
        description: 'From a field of cells to a story worth following.',
        colour: '#7582b4',
        code: 'CA',
      },
      {
        id: 'paper',
        name: 'The first manuscript',
        description: 'Bring the strongest evidence into one clear narrative.',
        colour: '#c0835a',
        code: 'M1',
      },
    ],
    tasks: [
      {
        id: 't1',
        title: 'Compare the early recovery time points',
        project: 'signal',
        stage: 'In progress',
        priority: 'High',
        tag: 'Analysis',
      },
      {
        id: 't2',
        title: 'Run the next live-imaging pilot',
        project: 'signal',
        stage: 'Ideas',
        priority: 'High',
        tag: 'Experiment',
      },
      {
        id: 't3',
        title: 'Review the segmentation quality',
        project: 'atlas',
        stage: 'In progress',
        priority: 'Normal',
        tag: 'Analysis',
      },
      {
        id: 't4',
        title: 'Draft the opening figure',
        project: 'paper',
        stage: 'In review',
        priority: 'Normal',
        tag: 'Writing',
      },
      {
        id: 't5',
        title: 'Capture the baseline fields',
        project: 'signal',
        stage: 'Complete',
        priority: 'Normal',
        tag: 'Experiment',
      },
      {
        id: 't6',
        title: 'Annotate the pilot observations',
        project: 'atlas',
        stage: 'Complete',
        priority: 'Normal',
        tag: 'Notebook',
      },
      {
        id: 't7',
        title: 'Collect the key background papers',
        project: 'paper',
        stage: 'Complete',
        priority: 'Normal',
        tag: 'Reading',
      },
      {
        id: 't8',
        title: 'Explore an alternative recovery model',
        project: 'signal',
        stage: 'Ideas',
        priority: 'Normal',
        tag: 'Idea',
      },
    ],
    notes: [
      {
        id: 'n1',
        path: 'Recovery/The recovery window.md',
        title: 'The recovery window',
        project: 'signal',
        kind: 'Research note',
      },
      {
        id: 'n2',
        path: 'Recovery/Live imaging pilot.md',
        title: 'Live imaging / pilot 03',
        project: 'signal',
        kind: 'Experiment',
      },
      {
        id: 'n3',
        path: 'Atlas/Patterns worth following.md',
        title: 'Patterns worth following',
        project: 'atlas',
        kind: 'Observation',
      },
      {
        id: 'n4',
        path: 'Manuscript/A story in four figures.md',
        title: 'A story in four figures',
        project: 'paper',
        kind: 'Writing',
      },
      {
        id: 'n5',
        path: 'Daily/Ideas for the next session.md',
        title: 'Ideas for the next session',
        project: 'signal',
        kind: 'Daily note',
      },
    ],
    evidence: [
      {
        id: 'e1',
        title: 'When does recovery begin?',
        author: 'Pilot 03 · own observation',
        year: 'Example',
        kind: 'Observation',
        project: 'signal',
        summary:
          'The example pilot suggests a transition after the early time points. Check the raw images and repeat the acquisition before drawing a conclusion.',
        tags: ['recovery', 'time course'],
        read: true,
        starred: true,
      },
      {
        id: 'e2',
        title: 'The shape of a cellular response',
        author: 'Reading note · sample source',
        year: 'Example',
        kind: 'Paper',
        project: 'signal',
        summary:
          'A placeholder reading note for comparing transient and sustained responses. Replace it with a real paper and your own interpretation.',
        tags: ['signalling', 'recovery'],
        read: false,
        starred: true,
      },
      {
        id: 'e3',
        title: 'Pilot imaging measurements',
        author: 'Synthetic data · 4 groups',
        year: 'Example',
        kind: 'Dataset',
        project: 'signal',
        summary:
          'Illustrative measurements used in the sample figure. These values demonstrate the workflow and are not experimental findings.',
        tags: ['time course', 'imaging'],
        read: true,
        starred: false,
      },
      {
        id: 'e4',
        title: 'Seeing beyond the average cell',
        author: 'Reading note · sample source',
        year: 'Example',
        kind: 'Paper',
        project: 'atlas',
        summary:
          'A space to compare single-cell distributions with population averages. Record the methods and limitations of your chosen source.',
        tags: ['single cell', 'imaging'],
        read: false,
        starred: false,
      },
      {
        id: 'e5',
        title: 'A field with two distinct populations',
        author: 'Atlas pilot · own observation',
        year: 'Example',
        kind: 'Observation',
        project: 'atlas',
        summary:
          'A fictional observation demonstrating how evidence can stay connected to its project and the notes it informs.',
        tags: ['single cell', 'quality control'],
        read: true,
        starred: false,
      },
      {
        id: 'e6',
        title: 'A clear figure tells one story',
        author: 'Writing note · sample source',
        year: 'Example',
        kind: 'Paper',
        project: 'paper',
        summary:
          'Start with a question, show the comparison and keep a record of what each panel can and cannot establish.',
        tags: ['figures', 'writing'],
        read: false,
        starred: true,
      },
    ],
    checkedSteps: [],
    protocol: { title: 'A closer look at recovery', steps: PROTOCOL.map((step) => ({ ...step })) },
    modules: MODULES.map((m) => m.id),
    activity: [
      {
        id: 'welcome',
        text: 'A new kind of workspace',
        detail: 'Your example research studio is ready to explore.',
        at: new Date().toISOString(),
      },
    ],
    focusSessions: 0,
    focusMinutes: 0,
    theme: 'light',
  };
}
export function projectProgress(workspace: Workspace, id: string): number {
  const tasks = workspace.tasks.filter((t) => t.project === id);
  return tasks.length
    ? Math.round((tasks.filter((t) => t.stage === 'Complete').length / tasks.length) * 100)
    : 0;
}
export function moveTask(workspace: Workspace, id: string, stage: Stage): Workspace {
  return { ...workspace, tasks: workspace.tasks.map((t) => (t.id === id ? { ...t, stage } : t)) };
}
export function relatedEvidence(workspace: Workspace, id: string): Evidence[] {
  const source = workspace.evidence.find((e) => e.id === id);
  return source
    ? workspace.evidence.filter(
        (e) =>
          e.id !== id &&
          (e.project === source.project || e.tags.some((tag) => source.tags.includes(tag))),
      )
    : [];
}
export function logActivity(workspace: Workspace, text: string, detail: string): Workspace {
  return {
    ...workspace,
    activity: [
      { id: crypto.randomUUID(), text, detail, at: new Date().toISOString() },
      ...workspace.activity,
    ].slice(0, 30),
  };
}
/** Imported metadata is validated before it can replace the current studio. */
export function parseWorkspace(text: string): Workspace {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('The studio file is invalid.');
  const w = value as Record<string, unknown>;
  if (
    w['version'] !== 1 ||
    !Array.isArray(w['projects']) ||
    !Array.isArray(w['tasks']) ||
    !Array.isArray(w['notes']) ||
    !Array.isArray(w['evidence']) ||
    !Array.isArray(w['modules']) ||
    !Array.isArray(w['activity']) ||
    !Array.isArray(w['checkedSteps'])
  )
    throw new Error('This studio format is not supported.');
  const seed = seedWorkspace();
  const string = (v: unknown): v is string => typeof v === 'string';
  const row = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object') throw new Error('A studio record is invalid.');
    return v as Record<string, unknown>;
  };
  const fields = (v: unknown, names: string[]) => {
    const r = row(v);
    if (!names.every((k) => string(r[k]))) throw new Error('A studio record is missing text.');
    return r;
  };
  w['projects'].forEach((p) => {
    fields(p, ['id', 'name', 'description', 'colour', 'code']);
  });
  w['tasks'].forEach((t) => {
    const r = fields(t, ['id', 'title', 'project', 'stage', 'priority', 'tag']);
    if (
      !STAGES.includes(r['stage'] as Stage) ||
      !['High', 'Normal'].includes(String(r['priority']))
    )
      throw new Error('A task has an invalid status.');
  });
  w['notes'].forEach((n) => {
    fields(n, ['id', 'path', 'title', 'project', 'kind']);
  });
  w['evidence'].forEach((e) => {
    const r = fields(e, ['id', 'title', 'author', 'year', 'kind', 'project', 'summary']);
    if (
      !['Paper', 'Observation', 'Dataset'].includes(String(r['kind'])) ||
      !Array.isArray(r['tags']) ||
      !r['tags'].every(string) ||
      typeof r['read'] !== 'boolean' ||
      typeof r['starred'] !== 'boolean'
    )
      throw new Error('An evidence record is invalid.');
  });
  w['activity'].forEach((a) => {
    fields(a, ['id', 'text', 'detail', 'at']);
  });
  const identifiers = new Set<string>();
  for (const list of [w['projects'], w['tasks'], w['notes'], w['evidence']]) {
    for (const item of list) {
      const r = row(item);
      const id = String(r['id']);
      if (!id || identifiers.has(id)) throw new Error('Studio records need distinct identifiers.');
      identifiers.add(id);
    }
  }
  if (w['projects'].length === 0) throw new Error('The studio needs at least one project.');
  const projectIds = new Set(w['projects'].map((p) => String(row(p)['id'])));
  for (const list of [w['tasks'], w['notes'], w['evidence']]) {
    for (const item of list)
      if (!projectIds.has(String(row(item)['project'])))
        throw new Error('A studio record points to a missing project.');
  }
  for (const item of w['notes']) {
    const path = String(row(item)['path']);
    if (
      !path ||
      !path.endsWith('.md') ||
      path.includes('\\') ||
      path.includes(':') ||
      path.split('/').some((part) => !part || part === '..' || part === '.')
    )
      throw new Error('A note has an unsafe path.');
  }
  for (const item of w['activity'])
    if (!Number.isFinite(Date.parse(String(row(item)['at']))))
      throw new Error('An activity date is invalid.');
  if (w['protocol'] !== undefined) {
    const protocol = fields(w['protocol'], ['title']);
    if (
      !Array.isArray(protocol['steps']) ||
      protocol['steps'].length === 0 ||
      protocol['steps'].length > 50
    )
      throw new Error('A workflow needs between one and fifty steps.');
    const steps = new Set<string>();
    for (const step of protocol['steps']) {
      const item = fields(step, ['id', 'title', 'detail']);
      if (
        !String(item['title']).trim() ||
        steps.has(String(item['id'])) ||
        typeof item['seconds'] !== 'number' ||
        !Number.isFinite(item['seconds']) ||
        item['seconds'] < 0 ||
        item['seconds'] > 86400
      )
        throw new Error('A workflow step is invalid.');
      steps.add(String(item['id']));
    }
  }
  if (!w['modules'].every(string) || !w['checkedSteps'].every(string))
    throw new Error('Studio preferences are invalid.');
  if (
    typeof w['focusSessions'] !== 'number' ||
    !Number.isFinite(w['focusSessions']) ||
    w['focusSessions'] < 0 ||
    typeof w['focusMinutes'] !== 'number' ||
    !Number.isFinite(w['focusMinutes']) ||
    w['focusMinutes'] < 0
  )
    throw new Error('Focus history is invalid.');
  return {
    ...seed,
    ...(w as unknown as Workspace),
    theme: w['theme'] === 'dark' ? 'dark' : 'light',
  };
}
