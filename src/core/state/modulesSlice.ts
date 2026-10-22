import type { SidebarPanel } from '../modules/contributions';
import type { RegistryState } from '../modules/registry';
import { describeError, type StoreContext } from './context';

/** A module change that also switches other modules, waiting for the user to agree. */
export interface PendingModuleChange {
  id: string;
  enable: boolean;
  /** Every module that would change, in the order they would change. */
  ids: string[];
}

export interface ModulesSlice {
  /** Every module and whether it is on, mirrored from the registry. */
  modules: RegistryState;
  /** Sidebar panels added by modules that are on. */
  panels: SidebarPanel[];
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
  confirmModuleChange: () => Promise<void>;
  cancelModuleChange: () => void;
}

export function createModulesSlice(ctx: StoreContext): ModulesSlice {
  const { registry, set, get } = ctx;

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
      set({ pendingModuleChange: null, moduleNotice: null });
    },
  });

  return {
    modules: registry.store.getState(),
    panels: registry.contributions.getState().panels,
    pendingModuleChange: null,
    moduleNotice: null,
    moduleBusy: false,

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
