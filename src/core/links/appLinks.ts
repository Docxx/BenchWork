/**
 * `benchwork://` links, such as the QR code on a fly vial: `benchwork://s/K7M2Q9XA`.
 * The first part says what kind of thing it is; the second is its short code.
 */

/** Crockford base 32: no I, L, O or U, so codes read back without confusion. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const KIND = /^[a-z]{1,12}$/;

/** A new 8-character code; about a trillion possibilities, so clashes are negligible. */
export function newShortCode(
  random: (bytes: Uint8Array) => ArrayLike<number> = randomBytes,
): string {
  return Array.from(random(new Uint8Array(8)), (b) => ALPHABET[b % 32] ?? '0').join('');
}
function randomBytes(bytes: Uint8Array): ArrayLike<number> {
  const filled = new Uint8Array(bytes.length);
  crypto.getRandomValues(filled);
  return filled;
}

export function isShortCode(code: string): boolean {
  return CODE.test(code);
}

/** The link for a code, kept short so the QR code stays small: `benchwork://s/<code>`. */
export function appLink(kind: string, code: string): string {
  if (!KIND.test(kind) || !isShortCode(code)) throw new Error('This is not a BenchWork link.');
  return `benchwork://${kind}/${code}`;
}

/** The kind and code in a link, or null if it is not a BenchWork link. */
export function parseAppLink(url: string): { kind: string; code: string } | null {
  const match = /^benchwork:\/\/([a-z]{1,12})\/([0-9A-Za-z]{8})\/?$/.exec(url.trim());
  if (!match?.[1] || !match[2]) return null;
  // People may type a code in lower case, or with O and I for 0 and 1.
  const code = match[2].toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  return isShortCode(code) ? { kind: match[1], code } : null;
}

export interface AppLinkHandler {
  /** The first part of the link this opens, such as `s` for stocks. */
  kind: string;
  open(code: string): void;
}

/**
 * Sends each link to the handler for its kind. A link that arrives before its
 * handler is registered, such as when a scan starts the app, waits for it.
 */
export function createAppLinkRouter(handlers: () => readonly AppLinkHandler[]) {
  let pending: { kind: string; code: string } | null = null;
  const tryPending = () => {
    if (!pending) return;
    const kind = pending.kind;
    const handler = handlers().find((h) => h.kind === kind);
    if (!handler) return;
    const { code } = pending;
    pending = null;
    handler.open(code);
  };
  return {
    /** A link from outside the app. Anything that is not a BenchWork link is ignored. */
    receive(url: string): void {
      const link = parseAppLink(url);
      if (!link) return;
      pending = link;
      tryPending();
    },
    /** Call when handlers change. */
    handlersChanged: tryPending,
  };
}
