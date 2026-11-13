import * as Y from 'yjs';
import type { PlatformAdapter } from '../platform';
import { CHUNK, MAX_FILE, fromBase64, toBase64, seal, unseal, sha256 } from './relayCrypto';
import { RelayClient, type RelayConnection } from './relayClient';
import {
  allowed,
  copyPath,
  createFile,
  files,
  heads,
  markdown,
  revise,
  setMarkdown,
  validate,
  type Revision,
} from './relayModel';

const ROOT = '.benchwork/relay';
const CHECKPOINT = `${ROOT}/checkpoint.json`;
const enc = new TextEncoder();
interface Projection {
  object: string;
  hash: string;
  revision: string;
}
interface Pending {
  id: string;
  payload: string;
  kind: 'put' | 'append';
}
interface Inbox {
  count: number;
  parts: Record<string, string>;
}
interface Checkpoint {
  protocol: number;
  vault: string;
  state: string;
  checksum: string;
  cursor: number;
  projected: Record<string, Projection>;
  observed: Record<string, string | null>;
  pending: Pending[];
  inbox: Record<string, Inbox>;
  bootstrapped: boolean;
  projection: Record<string, string> | null;
  basis: string | null;
}
export interface RelayReport {
  uploaded: number;
  downloaded: number;
  conflicts: string[];
  skipped: string[];
}
interface Target {
  object: string;
  revision: string;
  text?: string;
  binary?: Revision;
}

/**
 * Network-independent file history. One atomic checkpoint contains the Yjs state,
 * exact encrypted outbox, received partial updates, cursor and file baselines.
 * Files are projections; the checkpoint is durable replication history.
 */
export class RelayEngine {
  beforeProject: () => Promise<void> = () => Promise.resolve();
  readonly doc = new Y.Doc();
  readonly client: RelayClient;
  private state!: Checkpoint;
  private updates: Uint8Array[] = [];
  private stopWatching: () => void = () => undefined;
  private scanHashes = new Map<
    string,
    { modified: number | null; size: number; hash: string; checked: number }
  >();
  private constructor(
    readonly platform: PlatformAdapter,
    readonly connection: RelayConnection,
  ) {
    this.client = new RelayClient(platform, connection);
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote') this.updates.push(update);
    });
  }
  static async open(
    platform: PlatformAdapter,
    connection: RelayConnection,
    initialise = false,
    rebuild = false,
  ): Promise<RelayEngine> {
    const engine = new RelayEngine(platform, connection);
    if (initialise && (await platform.exists(CHECKPOINT))) {
      let existing: { vault?: string } = {};
      try {
        existing = JSON.parse(await platform.readText(CHECKPOINT)) as { vault?: string };
      } catch {
        /* Explicit enrolment archives damaged history. */
      }
      if (rebuild || existing.vault !== connection.vault)
        await platform.rename(CHECKPOINT, `${ROOT}/history-${crypto.randomUUID()}.json`);
    }
    if (await platform.exists(CHECKPOINT)) {
      const state = JSON.parse(await platform.readText(CHECKPOINT)) as Partial<Checkpoint>;
      if (
        state.protocol !== 1 ||
        state.vault !== connection.vault ||
        !Number.isSafeInteger(state.cursor) ||
        (state.cursor ?? -1) < 0 ||
        typeof state.state !== 'string' ||
        typeof state.checksum !== 'string' ||
        !state.projected ||
        !state.observed ||
        !Array.isArray(state.pending) ||
        !state.inbox
      )
        throw new Error(
          'Sync history does not match this connection. Reconnect explicitly; files have been kept.',
        );
      const bytes = fromBase64(state.state);
      if ((await sha256(bytes)) !== state.checksum)
        throw new Error('Sync history is damaged. Restore its backup before reconnecting.');
      Y.applyUpdate(engine.doc, bytes, 'remote');
      validate(engine.doc);
      engine.state = state as Checkpoint;
    } else {
      if (!initialise)
        throw new Error(
          'Sync history is missing. Automatic reconnect is stopped to protect the other devices.',
        );
      engine.state = {
        protocol: 1,
        vault: connection.vault,
        state: '',
        checksum: '',
        cursor: 0,
        projected: {},
        observed: {},
        pending: [],
        inbox: {},
        bootstrapped: connection.owner && !rebuild,
        projection: null,
        basis: null,
      };
      await platform.ensureDir(ROOT);
      await engine.persist();
    }
    engine.stopWatching = platform.watch(({ paths }) => {
      for (const path of paths) engine.scanHashes.delete(path);
    });
    return engine;
  }
  destroy(): void {
    this.stopWatching();
    this.doc.destroy();
  }
  private async persist(): Promise<void> {
    const bytes = Y.encodeStateAsUpdate(this.doc);
    this.state.state = toBase64(bytes);
    this.state.checksum = await sha256(bytes);
    await this.platform.writeTextAtomic(CHECKPOINT, JSON.stringify(this.state));
  }
  /** Atomically record unsent edits and their exact envelope identities before networking. */
  private async journal(): Promise<void> {
    if (this.updates.length) {
      const batch = crypto.randomUUID();
      const update = Y.mergeUpdates(this.updates);
      const length = 256 * 1024,
        count = Math.ceil(update.length / length);
      const pending: Pending[] = [];
      for (let index = 0; index < count; index += 1) {
        const id = `${batch}_${String(index)}`;
        const bytes = enc.encode(
          JSON.stringify({
            batch,
            index,
            count,
            bytes: toBase64(update.slice(index * length, (index + 1) * length)),
          }),
        );
        pending.push({
          kind: 'append',
          id,
          payload: await seal(this.connection.key, this.connection.vault, id, 'update', bytes),
        });
      }
      this.state.pending.push(...pending);
      this.updates = [];
    }
    await this.persist();
  }
  private async upload(report: RelayReport): Promise<void> {
    // Each file's chunks are queued before the catalogue revision that references them.
    while (this.state.pending.length) {
      const item = this.state.pending[0];
      if (!item) break;
      await this.client.call(item.kind, { id: item.id, payload: item.payload });
      this.state.pending.shift();
      // A crash before this checkpoint resends the same envelope; the server deduplicates.
      await this.persist();
      report.uploaded += 1;
    }
  }
  private async pull(report: RelayReport): Promise<void> {
    for (;;) {
      const result = await this.client.call<{
        events: { seq: number; id: string; payload: string }[];
      }>('events', { after: this.state.cursor });
      if (!Array.isArray(result.events) || result.events.length > 32)
        throw new Error('Invalid relay event list.');
      if (!result.events.length) return;
      for (const event of result.events) {
        if (
          !Number.isSafeInteger(event.seq) ||
          event.seq <= this.state.cursor ||
          !/^[\da-f-]{36}_\d{1,3}$/i.test(event.id)
        )
          throw new Error('Invalid relay sequence.');
        const part = JSON.parse(
          new TextDecoder().decode(
            await unseal(
              this.connection.key,
              this.connection.vault,
              event.id,
              'update',
              event.payload,
            ),
          ),
        ) as { batch: string; index: number; count: number; bytes: string };
        if (
          event.id !== `${part.batch}_${String(part.index)}` ||
          !Number.isInteger(part.count) ||
          part.count < 1 ||
          part.count > 256 ||
          !Number.isInteger(part.index) ||
          part.index < 0 ||
          part.index >= part.count ||
          typeof part.bytes !== 'string' ||
          part.bytes.length > 350000
        )
          throw new Error('Invalid sync update fragment.');
        const inbox = this.state.inbox[part.batch] ?? { count: part.count, parts: {} };
        if (inbox.count !== part.count || Object.keys(this.state.inbox).length > 256)
          throw new Error('Too many incomplete sync updates.');
        inbox.parts[String(part.index)] = part.bytes;
        this.state.inbox[part.batch] = inbox;
        if (Object.keys(inbox.parts).length === inbox.count) {
          const parts = Array.from({ length: inbox.count }, (_, i) =>
            fromBase64(inbox.parts[String(i)] ?? ''),
          );
          const joined = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
          let offset = 0;
          for (const bytes of parts) {
            joined.set(bytes, offset);
            offset += bytes.length;
          }
          const candidate = new Y.Doc();
          try {
            Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc));
            Y.applyUpdate(candidate, joined);
            validate(candidate);
            Y.applyUpdate(this.doc, joined, 'remote');
          } finally {
            candidate.destroy();
          }
          this.state.inbox = Object.fromEntries(
            Object.entries(this.state.inbox).filter(([id]) => id !== part.batch),
          );
        }
        this.state.cursor = event.seq;
        await this.persist();
        report.downloaded += 1;
      }
    }
  }
  private async scan(report: RelayReport): Promise<Map<string, string>> {
    const found = new Map<string, string>(),
      names = new Set<string>();
    let entries = 0;
    const visit = async (folder: string) => {
      for (const entry of await this.platform.listDir(folder)) {
        if (++entries > 25000) throw new Error('This vault exceeds the cloud sync entry limit.');
        const path = entry.path;
        if (entry.isDir) {
          if (
            path === '.benchwork' ||
            path === '.benchwork/modules' ||
            path.startsWith('.benchwork/modules/') ||
            allowed(path)
          )
            await visit(path);
        } else if (allowed(path)) {
          if (names.has(path.toLowerCase()))
            throw new Error(`Resolve the file-name case collision: ${path}`);
          names.add(path.toLowerCase());
          if (entry.size > MAX_FILE) {
            report.skipped.push(path);
            continue;
          }
          const cached = this.scanHashes.get(path);
          const fresh =
            cached &&
            entry.modified !== null &&
            cached.modified === entry.modified &&
            cached.size === entry.size &&
            Date.now() - cached.checked < 60000;
          const hash = fresh ? cached.hash : await this.platform.hashFile(path);
          if (!fresh)
            this.scanHashes.set(path, {
              modified: entry.modified,
              size: entry.size,
              hash,
              checked: Date.now(),
            });
          found.set(path, hash);
        }
      }
    };
    await visit('');
    return found;
  }
  private targets(report: RelayReport): Map<string, Target> {
    const out = new Map<string, Target>(),
      names = new Map<string, string>();
    for (const [id, file] of [...files(this.doc)].sort(([a], [b]) => a.localeCompare(b))) {
      const path = String(file.get('path'));
      const versions = heads(file),
        alive = versions.filter(([, v]) => !v.deleted);
      if (!alive.length) continue;
      if (alive.length !== versions.length)
        report.conflicts.push(`${path}: deletion and edit both kept in history`);
      const text = file.get('kind') === 'text';
      const selected = text ? alive.slice(0, 1) : alive;
      for (const [index, [revision, value]] of selected.entries()) {
        let target =
          index === 0 && !names.has(path.toLowerCase())
            ? path
            : copyPath(path, index === 0 ? id : revision);
        if (names.has(target.toLowerCase())) target = copyPath(target, id);
        if (names.has(target.toLowerCase()))
          throw new Error(`Resolve the sync path collision: ${target}`);
        names.set(target.toLowerCase(), id);
        out.set(target, {
          object: id,
          revision: text ? versions.map(([r]) => r).join(',') : revision,
          ...(text ? { text: markdown(file) } : { binary: value }),
        });
        if (target !== path) report.conflicts.push(target);
      }
    }
    // A file must not become the parent folder of another file.
    const sorted = [...out.keys()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const all = new Set(sorted.map((p) => p.toLowerCase()));
    for (const path of sorted) {
      const parts = path.toLowerCase().split('/');
      parts.pop();
      while (parts.length) {
        if (all.has(parts.join('/')))
          throw new Error(`A file and folder have the same name: ${path}`);
        parts.pop();
      }
    }
    return out;
  }
  private async binary(bytes: Uint8Array): Promise<Revision> {
    const chunks: string[] = [];
    const pending: Pending[] = [];
    for (let index = 0; index < bytes.length; index += CHUNK) {
      const id = crypto.randomUUID();
      chunks.push(id);
      pending.push({
        kind: 'put',
        id,
        payload: await seal(
          this.connection.key,
          this.connection.vault,
          id,
          'blob',
          bytes.slice(index, index + CHUNK),
        ),
      });
    }
    this.state.pending.push(...pending);
    return { deleted: false, parents: [], chunks, hash: await sha256(bytes), size: bytes.length };
  }
  private async ingest(current: Map<string, string>, report: RelayReport): Promise<void> {
    const skipped = new Set(report.skipped);
    const targets = this.targets(report);
    // Match a moved file by its previous content, preserving its object/history.
    const missing = Object.entries(this.state.projected).filter(
      ([p]) => !current.has(p) && !skipped.has(p),
    );
    for (const [path, hash] of current) {
      if (this.state.observed[path] === hash) continue;
      const before = this.state.projected[path];
      // Conflict projections become their own file when changed, rather than editing the winner.
      const old = before && files(this.doc).get(before.object);
      const original = old?.get('path') === path ? old : undefined;
      const moved =
        !before &&
        missing.find(
          ([from, p]) => p.hash === hash && files(this.doc).get(p.object)?.get('path') === from,
        );
      let file = original;
      if (moved) {
        file = files(this.doc).get(moved[1].object);
        file?.set('path', path);
        missing.splice(missing.indexOf(moved), 1);
      }
      const bytes = await this.platform.readBytes(path, MAX_FILE);
      if ((await sha256(bytes)) !== hash)
        throw new Error(`File changed during sync; retrying: ${path}`);
      const textual = /\.md$/i.test(path) && bytes.length <= 4 * 1024 * 1024;
      if (!file) {
        // An unchanged received copy does not create another independently seeded document.
        const remote = targets.get(path);
        if (
          remote &&
          (remote.text !== undefined
            ? await sha256(enc.encode(remote.text))
            : remote.binary?.hash) === hash
        ) {
          this.state.projected[path] = { object: remote.object, revision: remote.revision, hash };
          this.state.observed[path] = hash;
          continue;
        }
        [, file] = createFile(this.doc, path, textual);
      }
      if (file.get('kind') === 'text' && textual)
        setMarkdown(file, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      else if (file.get('kind') === 'text')
        throw new Error(`Note exceeds the 4 MB text sync limit: ${path}`);
      else {
        const revision = await this.binary(bytes);
        revise(file, revision);
      }
      this.state.observed[path] = hash;
    }
    for (const [path, previous] of missing) {
      if (this.state.observed[path] === null) continue;
      const file = files(this.doc).get(previous.object);
      if (file?.get('path') === path && heads(file).some(([, v]) => !v.deleted))
        revise(file, { deleted: true });
      this.state.observed[path] = null;
    }
    await this.journal();
  }
  private async bytes(target: Target): Promise<Uint8Array> {
    if (target.text !== undefined) return enc.encode(target.text);
    const revision = target.binary;
    if (!revision) throw new Error('Missing sync file content.');
    const bytes = new Uint8Array(revision.size ?? 0);
    let offset = 0;
    for (const id of revision.chunks ?? []) {
      const result = await this.client.call<{ payload: string }>('get', { id });
      const chunk = await unseal(
        this.connection.key,
        this.connection.vault,
        id,
        'blob',
        result.payload,
      );
      if (offset + chunk.length > bytes.length) throw new Error('Attachment size mismatch.');
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (offset !== bytes.length || (await sha256(bytes)) !== revision.hash)
      throw new Error('Attachment verification failed. Local content was kept.');
    return bytes;
  }
  private async project(current: Map<string, string>, report: RelayReport): Promise<void> {
    await this.beforeProject();
    const targets = this.targets(report);
    for (const [path, target] of targets) {
      const expected = current.get(path) ?? null;
      const unchanged = this.state.projected[path];
      if (
        unchanged?.object === target.object &&
        unchanged.revision === target.revision &&
        unchanged.hash === expected
      )
        continue;
      const bytes = await this.bytes(target),
        hash = await sha256(bytes);
      if (hash !== expected) {
        if (!(await this.platform.relay?.apply(path, expected, toBase64(bytes)))) {
          this.scanHashes.delete(path);
          throw new Error(`New local edits were kept; sync will retry: ${path}`);
        }
      }
      this.state.projected[path] = { object: target.object, revision: target.revision, hash };
      this.state.observed[path] = hash;
      await this.persist();
    }
    for (const [path, previous] of Object.entries(this.state.projected)) {
      if (targets.has(path) || report.skipped.includes(path)) continue;
      const expected = current.get(path) ?? null;
      // Only delete our known projection; an unobserved external edit is never removed.
      if (expected !== null && expected !== previous.hash)
        throw new Error(`Local changes prevented deletion: ${path}`);
      if (expected !== null && !(await this.platform.relay?.apply(path, expected, null)))
        throw new Error(`Local changes prevented deletion: ${path}`);
      this.state.projected = Object.fromEntries(
        Object.entries(this.state.projected).filter(([name]) => name !== path),
      );
      this.state.observed[path] = null;
      await this.persist();
    }
  }
  async sync(): Promise<RelayReport> {
    const report: RelayReport = { uploaded: 0, downloaded: 0, conflicts: [], skipped: [] };
    if (this.state.projection) {
      // Finish a journalled export after a crash before importing file changes as
      // new edits. Otherwise an old file could undo a received update.
      const expected = new Map(Object.entries(this.state.projection));
      const disk = await this.scan(report);
      const branch = new Y.Doc();
      Y.applyUpdate(branch, fromBase64(this.state.basis ?? this.state.state));
      let changed = false;
      try {
        for (const path of new Set([...expected.keys(), ...this.targets(report).keys()])) {
          const actual = disk.get(path) ?? null,
            prior = expected.get(path) ?? null;
          const projected = this.state.projected[path];
          if (actual === prior || (projected && actual === projected.hash)) {
            if (actual !== null) expected.set(path, actual);
            continue;
          }
          if (actual === null && !projected && this.state.observed[path] === null) {
            expected.delete(path);
            continue;
          }
          let file = projected ? files(branch).get(projected.object) : undefined;
          if (!file) {
            const candidates = [...files(branch).values()].filter((f) => f.get('path') === path);
            file = candidates[0];
          }
          if (actual !== null) {
            const bytes = await this.platform.readBytes(path, MAX_FILE);
            if ((await sha256(bytes)) !== actual)
              throw new Error(`File is still changing: ${path}`);
            const textual = /\.md$/i.test(path) && bytes.length <= 4 * 1024 * 1024;
            if (!file) [, file] = createFile(branch, path, textual);
            if (file.get('kind') === 'text' && textual)
              setMarkdown(file, new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            else if (file.get('kind') === 'binary') revise(file, await this.binary(bytes));
            else throw new Error(`Note exceeds the text sync limit: ${path}`);
            expected.set(path, actual);
          } else {
            if (file) revise(file, { deleted: true });
            expected.delete(path);
          }
          changed = true;
        }
        if (changed) {
          Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(branch));
          await this.journal();
          await this.upload(report);
        }
      } finally {
        branch.destroy();
      }
      await this.project(expected, report);
      this.state.projection = null;
      this.state.basis = null;
      await this.persist();
    }
    // Enrolment downloads the one bootstrap history before importing local files.
    if (!this.state.bootstrapped) {
      await this.pull(report);
      // Divergent existing files are kept under a separate stable identity. Identical
      // existing notes adopt the received history rather than seeding it again.
      this.state.bootstrapped = true;
      await this.persist();
    }
    const current = await this.scan(report);
    await this.ingest(current, report);
    await this.upload(report);
    this.state.projection = Object.fromEntries(current);
    this.state.basis = toBase64(Y.encodeStateAsUpdate(this.doc));
    await this.persist();
    await this.pull(report);
    await this.project(current, report);
    this.state.projection = null;
    this.state.basis = null;
    await this.persist();
    return { ...report, conflicts: [...new Set(report.conflicts)] };
  }
}
