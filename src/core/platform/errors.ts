/** Matches `ErrorKind` in src-tauri/src/error.rs. */
export type PlatformErrorKind =
  | 'NoVault'
  | 'InvalidPath'
  | 'OutsideVault'
  | 'NotFound'
  | 'NotADirectory'
  | 'NotAFile'
  | 'AlreadyExists'
  | 'TooLarge'
  | 'Io';

const KINDS: ReadonlySet<string> = new Set<PlatformErrorKind>([
  'NoVault',
  'InvalidPath',
  'OutsideVault',
  'NotFound',
  'NotADirectory',
  'NotAFile',
  'AlreadyExists',
  'TooLarge',
  'Io',
]);

export class PlatformError extends Error {
  override readonly name = 'PlatformError';

  constructor(
    readonly kind: PlatformErrorKind,
    message: string,
  ) {
    super(message);
  }

  /** Converts anything thrown by a platform call into a PlatformError. */
  static from(err: unknown): PlatformError {
    if (err instanceof PlatformError) return err;
    if (typeof err === 'object' && err !== null && 'kind' in err && 'message' in err) {
      const { kind, message } = err;
      if (typeof kind === 'string' && KINDS.has(kind) && typeof message === 'string') {
        return new PlatformError(kind as PlatformErrorKind, message);
      }
    }
    return new PlatformError('Io', err instanceof Error ? err.message : String(err));
  }
}
