# Phase 7: sync design review

31 October 2026. Proposal for Ray, Claude and Codex to review before implementation.
This is a design review, not an implemented or approved protocol.

## Recommendation

Build durable local document history first, then private two-device sync, then
sharing and live co-editing. Keep the current Syncthing workflow available until
native sync passes its recovery and real-device checks. A vault must use only one
sync engine at a time.

The editor already uses TipTap's Yjs binding. The missing foundation is persistent
shared history, rather than another editor. Do not begin with accounts or a
production server.

## What exists today

- `src/core/editor/yjsDoc.ts` constructs a new Y.Doc from parsed Markdown.
- `src/core/state/pageSlice.ts` creates that document each time a page opens and
  writes Markdown on save. It does not persist Yjs updates or state vectors.
- The file watcher reloads clean pages and offers a conflict when edits are pending.
- `src/core/sync/conflicts.ts` handles Syncthing conflict files. It is not a native
  replication protocol.
- Ink is a JSON sidecar with stroke IDs. Frontmatter, file paths, canvases, datasets
  and PDF annotations are separate from the editor's shared text document.
- Backups omit the disposable index, local snapshots and trash. A sync-history
  backup and restore policy has not yet been defined.

## Decision 1: files and shared history

Retain Markdown, YAML and JSON as the portable content and supported external-edit
interface. Persist CRDT history separately so reopening does not invent a new
history for the same text. Yjs updates from one history can merge; independently
importing identical Markdown on two devices creates independent insertions.
Joining devices must load the same initial state, not each seed the page again.

Suggested layout:

```text
.benchwork/sync/
  vault.json                    # vault ID, protocol version and migration epoch
  documents/<object-id>/        # durable updates and compacted checkpoints
  catalogue/                    # object IDs, paths, deletion and blob references
  exports/                      # last exported content hashes and import baselines
```

This history is durable sync data, not a disposable cache like `index.sqlite`.
Losing it must never remove readable notes, but rebuilding it starts a new shared
history and requires explicit device re-enrolment. Do not silently regenerate it
and merge with old replicas. The same applies to restoring an old backup.

This distinction needs an amendment to SPEC.md before coding: files remain the
portable source of content, while replication history cannot be reconstructed
exactly from those files. Do not describe both as independently authoritative.

Use one Y.Doc per page, with the current editor fragment and a versioned metadata
map. Preserve unknown frontmatter and unsupported Markdown through the existing
round-trip model. Allocate document IDs once and detect copied pages with duplicate
UUIDs. Initial vault enrolment must designate a single bootstrap checkpoint; two
existing, divergent vaults require reconciliation before joining.

## Decision 2: local durability and external changes

1. Append an update to a local journal before treating it as durably saved or
   eligible for upload. Report journal failures and retain the editor session.
2. Export its content atomically to the normal file, recording which journal
   revision and content hash the export represents.
3. Recover by replaying a checkpoint and journal after a crash. A pending export
   may be retried; an externally changed file must be preserved before doing so.
4. On a watcher event, compare the file with the last export baseline. Suppress only
   verified own writes, not all events inside a time window.
5. Import an external edit as a change against that baseline when safe. If both
   the external file and shared document changed incompatibly, keep both versions
   and ask for resolution. Do not replace the whole document on each watcher event.

Journal and export writes are not one filesystem transaction. Use a recoverable
commit record and crash tests at each boundary. Persist update identity with the
outbox so reconnect and restart can resend safely. Compact only after a durable,
verified replacement checkpoint; never discard unsent updates.

## Decision 3: objects beyond page text

| Content                                    | Proposed behaviour                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Page body and frontmatter                  | Shared editor fragment and versioned metadata, exported to Markdown                                               |
| Rename and move                            | Stable object ID with a catalogue path; preserve and surface concurrent path collisions                           |
| Delete versus offline edit                 | Persistent deletion marker; retain concurrent edits as recoverable content rather than silently dropping them     |
| Ink and PDF marks                          | Shared objects keyed by stable IDs, with explicit deletion; merging only the union of strokes resurrects erasures |
| Stroke movement and shape edits            | Define whole-stroke replacement and deterministic concurrent-edit behaviour before adding lasso replication       |
| Canvas cards and edges                     | Stable IDs, versioned properties and explicit deletion                                                            |
| Ordinary JSON/YAML module files            | Initially preserve concurrent versions; add semantic merge adapters individually                                  |
| PDFs, images, spreadsheets and attachments | Immutable versioned blobs; concurrent binary replacements keep both versions                                      |
| Linked external datasets                   | Sync the record, not the external file; support device-specific path mappings                                     |
| Search index, device settings and secrets  | Stay local; rebuild derived search data after receiving content                                                   |

Use collision-resistant IDs for new shared objects. Define migration of existing
short ink IDs without rewriting unchanged user content unnecessarily. Handwriting
recognition should record the stroke revision it describes so stale recognition
cannot replace newer text unnoticed.

## Decision 4: encrypted transport

Start with a private vault shared between Ray's own PC and tablet. An encrypted
relay can store opaque update envelopes and blobs, acknowledge durable receipt,
and relay them to authorised devices. Clients merge the decrypted Yjs updates.
Keep local save, server receipt and acknowledgement by another device distinct.

Do not assume the standard y-websocket server can merge end-to-end encrypted Yjs
updates: it would need plaintext to interpret them. Evaluate providers against
the encryption requirement before choosing one.

Specify the threat model and select an established, reviewed cryptographic
protocol/library before implementation. The design must cover authenticated
encryption, unique nonces, device identity, authenticated enrolment, replay handling,
key recovery, device removal and rotation. Bind envelopes to the vault, object,
protocol version, key epoch and update identity. Bound payload sizes and reject
malformed or unauthorised messages before applying them.

Keep device secrets in platform secure storage outside the vault. Do not put raw
keys in synced config, logs or a normal vault backup. A recovery mechanism must be
tested before enabling encryption. A removed device can retain already decrypted
content; removal must prevent access to future key epochs, not promise erasure.

Encryption still exposes some timing, size and routing metadata. Document what
the relay learns. Avoid publishing plaintext content hashes as blob identifiers;
choose vault-scoped opaque references as part of the protocol review.

## Proposed code boundaries

Names below describe responsibilities, not new public APIs committed by this review.

- `src/core/sync/documents.ts`: shared document identity, lifecycle and migration.
- `src/core/sync/journal.ts`: durable updates, outbox, replay and checkpoints.
- `src/core/sync/projection.ts`: file exports, baselines and external edit imports.
- `src/core/sync/catalogue.ts`: paths, deletion markers and blob references.
- `src/core/sync/transport.ts`: reconnect, retries and opaque envelope delivery.
- `src/core/platform/`: adapters for journal storage, secure keys and transport.
- `src/core/api/`: module merge hooks only when a concrete module needs them.

Keep document persistence independent of network availability. Do not put socket
ownership in React components or turn the disposable search database into the
only copy of replication history.

## Delivery gates

### 7a: durable local history

Restore the same shared state after closing and reopening. Prove crash recovery,
disk-full handling, checkpoint replacement, external file edits and backup restore.
Keep Markdown-only vaults usable without enrolment or a network connection.

### 7b: private two-device sync

Use a local test relay before choosing hosting. Validate shared bootstrap, offline
edits, delayed and duplicate delivery, interrupted uploads, rename collisions,
delete/edit conflicts, ink erasure, attachments and schema mismatches. Avoid silent
loss even when an operation requires a visible conflict.

Add encryption and authenticated device enrolment before any remote deployment.
Test wrong keys, tampering, replay, lost-device removal and recovery. Enable native
sync per vault only after confirming Syncthing has stopped for that vault.

### 7c: sharing and live co-editing

Add account lifecycle, invitations, permissions and encrypted presence after private
sync is reliable. Whole-vault sharing is the proposed first scope; page-specific
permissions need separate document and key boundaries. Presence is transient and
must not enter saved notes or recovery journals.

### Exit check

On the real Windows PC and Galaxy tablet, edit the same page offline, restart both
apps, reconnect, and verify both sets of edits. Repeat with ink addition and
erasure, rename, delete/edit and an attachment. Restore a backup into a separate
vault and verify it cannot overwrite the live vault through automatic reconnect.

Choose server hosting only after measuring storage, transfer, reconnect behaviour
and recovery with this prototype. Keep the earlier week-of-lab-work acceptance
check on ROADMAP.md outstanding until it has actually been completed.

## Primary references

- [Yjs document updates](https://docs.yjs.dev/api/document-updates): binary updates,
  state vectors, and idempotent merging within shared document history.
- [Yjs offline persistence](https://docs.yjs.dev/getting-started/allowing-offline-editing):
  retaining local shared state between sessions.
- [Yjs FAQ](https://docs.yjs.dev/api/faq): client identity and document boundaries
  for permissions.
- [y-websocket](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket):
  provider behaviour to evaluate against the encrypted relay proposal.
