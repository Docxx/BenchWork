/**
 * The public module API. Modules in src/modules/<id>/ may import only from
 * here (enforced by ESLint), so the core can change behind it freely.
 *
 * Phase 0 offers sidebar panels, private storage and clean-up. Commands,
 * block renderers, file handlers, page types, settings panels and index
 * hooks are added in the phases that first need them.
 */
import type { ReactNode } from 'react';
import type { DeviceKind } from '../platform/types';
import type { ModuleManifest } from '../modules/manifest';

export type { DeviceKind, ModuleManifest };

/** What a module's `index.ts` exports as its default. */
export interface ModuleDefinition {
  /**
   * Called when the module is switched on, or when a vault opens with it on.
   * Register everything through `ctx`; it is all removed again on switch-off.
   * If this throws, the module is marked as failed and the core carries on.
   */
  activate(ctx: ModuleContext): void | Promise<void>;
  /** Optional extra clean-up, run before everything registered is removed. */
  deactivate?(): void | Promise<void>;
}

/** Identity helper that gives a module definition its type. */
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

export interface ModuleContext {
  readonly manifest: ModuleManifest;
  /** The device the app is running on. */
  readonly platform: DeviceKind;
  readonly views: ModuleViews;
  /** JSON files in `.benchwork/modules/<id>/`, the module's private folder. */
  readonly storage: ModuleStorage;
  readonly log: ModuleLogger;
  /** Runs `fn` when the module is switched off, for timers and listeners. */
  onDispose(fn: () => void): void;
}

export interface ModuleViews {
  registerSidebarPanel(spec: SidebarPanelSpec): Disposable;
}

export interface SidebarPanelSpec {
  /** Must start with the module id and a dot, such as `hello.panel`. */
  id: string;
  title: string;
  render: () => ReactNode;
}

export interface ModuleStorage {
  /** Reads `<name>` (a plain file name such as `state.json`); null if it does not exist. */
  read<T = unknown>(name: string): Promise<T | null>;
  write(name: string, data: unknown): Promise<void>;
}

export interface ModuleLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface Disposable {
  dispose(): void;
}
