import type { CommandTarget } from '../api';
import type {
  CitationProvider,
  Command,
  FileHandler,
  PageType,
  PageView,
  Widget,
  CalendarSource,
  StrokeFilter,
  InkToolContribution,
  InkRecogniser,
  SettingsPanel,
  SidebarPanel,
} from '../modules/contributions';
import type { RegistryState } from '../modules/registry';
import { describeError, type StoreContext } from './context';

/** A module change that also switches other modules, waiting for the user to agree. */
export interface PendingModuleChange {
  id: string;
  enable: boolean;
  /** Every module that would change, in the order they would change. */
  ids: string[];
}

/** A question a module asked, waiting for the user's answer. */
export interface TextPrompt {
  title: string;
  label: string;
  initial: string;
}

export interface ModulesSlice {
  /** Every module and whether it is on, mirrored from the registry. */
  modules: RegistryState;
  /** Sidebar panels added by modules that are on. */
  panels: SidebarPanel[];
  /** Page types, commands and file handlers from modules that are on. */
  pageTypes: PageType[];
  commands: Command[];
  fileHandlers: FileHandler[];
  /** Settings panels of modules that are on. */
  settingsPanels: SettingsPanel[];
  /** Full-page views of modules that are on. */
  pageViews: PageView[];
  /** Widgets of modules that are on, for Home and the docks. */
  widgets: Widget[];
  /** Marks for the calendar from modules that are on. */
  calendarSources: CalendarSource[];
  /** Changes made to strokes as they are finished, by modules. */
  strokeFilters: StrokeFilter[];
  /** Pen tools from modules, beside the pen, highlighter and eraser. */
  inkTools: InkToolContribution[];
  /** Reads the text in drawings; the first is used. */
  inkRecognisers: InkRecogniser[];
  /** The module that names cited works, if one is on; at most one. */
  citationProviders: CitationProvider[];
  /** Goes up when citations should be redrawn. */
  citationVersion: number;
  /** The citation provider now, for the editor, which reads it when it needs it. */
  citationProvider: () => CitationProvider | null;
  textPrompt: TextPrompt | null;
  /** Shows a text prompt; resolves to the answer, or null if cancelled. */
  askText: (prompt: { title: string; label: string; initial?: string }) => Promise<string | null>;
  answerText: (answer: string | null) => void;
  /** Runs a module's command; a failure becomes a sidebar notice. */
  runCommand: (id: string, target: CommandTarget) => Promise<void>;
  pendingModuleChange: PendingModuleChange | null;
  /** Why the last module change could not be made. */
  moduleNotice: string | null;
  moduleBusy: boolean;

  /**
   * Switches a module on or off and saves that in the vault config. If other
   * modules would have to change too, sets pendingModuleChange instead and
   * waits for confirmModuleChange.
   */
  setModuleEnabled: (id: string, enable: boolean) => Promise<void>;
  /**
   * Switches on every module in a pack, with what they need, leaving out
   * any this device cannot run. Resolves to the names of those left out.
   */
  enablePack: (ids: readonly string[]) => Promise<string[]>;
  /** Whether to ask which pack suits a vault just set up. */
  choosingPack: boolean;
  setChoosingPack: (choosing: boolean) => void;
  confirmModuleChange: () => Promise<void>;
  cancelModuleChange: () => void;
}

export function createModulesSlice(ctx: StoreContext): ModulesSlice {
  const { registry, set, get } = ctx;
  let answer: ((value: string | null) => void) | null = null;

  async function applyModuleChange(enable: boolean, ids: readonly string[]): Promise<void> {
    set({ moduleBusy: true, moduleNotice: null, pendingModuleChange: null });
    try {
      await (enable ? registry.enable(ids) : registry.disable(ids));
      await ctx.updateConfig((c) => {
        const modules = { ...c.modules };
        for (const id of ids) modules[id] = { ...modules[id], enabled: enable };
        return { ...c, modules };
      });
    } catch (err) {
      set({ moduleNotice: `The change could not be saved. ${describeError(err)}` });
    } finally {
      set({ moduleBusy: false });
    }
  }

  ctx.onVault({
    opened: (config) => registry.activateFromConfig(config),
    // Modules finish with this vault before the platform can point at another.
    closing: () => registry.deactivateAll(),
    closed: () => {
      answer?.(null);
      answer = null;
      set({
        pendingModuleChange: null,
        moduleNotice: null,
        textPrompt: null,
        choosingPack: false,
      });
    },
  });

  return {
    modules: registry.store.getState(),
    panels: registry.contributions.getState().panels,
    pageTypes: registry.contributions.getState().pageTypes,
    commands: registry.contributions.getState().commands,
    fileHandlers: registry.contributions.getState().fileHandlers,
    settingsPanels: registry.contributions.getState().settingsPanels,
    pageViews: registry.contributions.getState().pageViews,
    widgets: registry.contributions.getState().widgets,
    calendarSources: registry.contributions.getState().calendarSources,
    strokeFilters: registry.contributions.getState().strokeFilters,
    inkTools: registry.contributions.getState().inkTools,
    inkRecognisers: registry.contributions.getState().inkRecognisers,
    citationProviders: registry.contributions.getState().citationProviders,
    citationVersion: registry.contributions.getState().citationVersion,
    citationProvider: () => get().citationProviders[0] ?? null,
    textPrompt: null,

    askText: (prompt) => {
      // Only one question at a time: a new one cancels the last.
      answer?.(null);
      set({
        textPrompt: { title: prompt.title, label: prompt.label, initial: prompt.initial ?? '' },
      });
      return new Promise((resolve) => {
        answer = resolve;
      });
    },

    answerText: (value) => {
      const resolve = answer;
      answer = null;
      set({ textPrompt: null });
      resolve?.(value === null || value.trim() === '' ? null : value.trim());
    },

    runCommand: async (id, target) => {
      const command = get().commands.find((c) => c.id === id);
      if (!command) return;
      try {
        await command.run(target);
      } catch (err) {
        console.error(`[${command.moduleId}] Command '${id}' failed:`, err);
        set({ sidebarNotice: `${command.title} could not be done. ${describeError(err)}` });
      }
    },
    pendingModuleChange: null,
    moduleNotice: null,
    moduleBusy: false,

    choosingPack: false,
    setChoosingPack: (choosingPack) => {
      set({ choosingPack });
    },

    enablePack: async (ids) => {
      if (get().status.kind !== 'open' || get().moduleBusy) return [];
      const order: string[] = [];
      const left: string[] = [];
      for (const id of ids) {
        const plan = registry.planEnable(id);
        if (!plan.ok) {
          left.push(
            registry.store.getState().modules.find((m) => m.manifest.id === id)?.manifest.name ??
              id,
          );
          continue;
        }
        for (const next of plan.ids) if (!order.includes(next)) order.push(next);
      }
      if (order.length > 0) await applyModuleChange(true, order);
      return left;
    },

    setModuleEnabled: async (id, enable) => {
      if (get().status.kind !== 'open' || get().moduleBusy) return;
      const plan = enable ? registry.planEnable(id) : registry.planDisable(id);
      if (!plan.ok) {
        set({ moduleNotice: plan.reason, pendingModuleChange: null });
        return;
      }
      if (plan.ids.length === 0) return;
      if (plan.ids.some((other) => other !== id)) {
        set({ pendingModuleChange: { id, enable, ids: plan.ids }, moduleNotice: null });
        return;
      }
      await applyModuleChange(enable, plan.ids);
    },

    confirmModuleChange: async () => {
      const pending = get().pendingModuleChange;
      if (!pending || get().moduleBusy) return;
      await applyModuleChange(pending.enable, pending.ids);
    },

    cancelModuleChange: () => {
      set({ pendingModuleChange: null });
    },
  };
}
