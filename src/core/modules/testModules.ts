// Helpers for module tests. Not shipped: only *.test.ts files import this.
import type { ModuleContext, ModuleDefinition, ModuleLogger } from '../api';
import type { ModuleManifest } from './manifest';
import type { ModuleSource } from './registry';

export const quietLogger: ModuleLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function manifest(id: string, extra: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    version: '0.1.0',
    description: `The ${id} module`,
    dependsOn: [],
    platforms: ['desktop', 'tablet'],
    defaultEnabled: false,
    ...extra,
  };
}

/** A module that records what happens to it in `events`. */
export function fakeModule(
  id: string,
  events: string[],
  options: {
    manifest?: Partial<ModuleManifest>;
    activate?: (ctx: ModuleContext) => void | Promise<void>;
    deactivate?: () => void | Promise<void>;
  } = {},
): ModuleSource {
  const definition: ModuleDefinition = {
    async activate(ctx) {
      events.push(`activate ${id}`);
      ctx.onDispose(() => events.push(`dispose ${id}`));
      await options.activate?.(ctx);
    },
    async deactivate() {
      events.push(`deactivate ${id}`);
      await options.deactivate?.();
    },
  };
  return { manifest: manifest(id, options.manifest), load: () => Promise.resolve(definition) };
}
