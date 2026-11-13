/** Versioned opaque envelopes. The relay receives neither paths nor plaintext hashes. */
export const PROTOCOL = 1;
export const CHUNK = 512 * 1024;
export const MAX_FILE = 32 * 1024 * 1024;
const encoder = new TextEncoder();
export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export const randomKey = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function seal(
  key: string,
  vault: string,
  id: string,
  kind: string,
  bytes: Uint8Array,
): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const secret = await crypto.subtle.importKey('raw', fromBase64(key), 'AES-GCM', false, [
    'encrypt',
  ]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: encoder.encode(`benchwork:${String(PROTOCOL)}:${vault}:${kind}:${id}`),
      },
      secret,
      new Uint8Array(bytes),
    ),
  );
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return toBase64(result);
}
export async function unseal(
  key: string,
  vault: string,
  id: string,
  kind: string,
  payload: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = fromBase64(payload);
  if (bytes.length < 28 || bytes.length > CHUNK + 28)
    throw new Error('Invalid encrypted sync object.');
  const secret = await crypto.subtle.importKey('raw', fromBase64(key), 'AES-GCM', false, [
    'decrypt',
  ]);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes.slice(0, 12),
        additionalData: encoder.encode(`benchwork:${String(PROTOCOL)}:${vault}:${kind}:${id}`),
      },
      secret,
      bytes.slice(12),
    ),
  );
}
