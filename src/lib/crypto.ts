/**
 * AES-GCM encryption helpers for on-disk secret backup.
 * Master key lives in OS keyring; we derive an app key from it using PBKDF2
 * and use that key to encrypt/decrypt the admin secret.
 *
 * All heavy lifting is done via the Web Crypto API (available in Tauri's
 * Chromium-based WebView as well as modern browsers).
 */

const PBKDF2_ITERATIONS = 200_000;
const KEY_USAGE: KeyUsage[] = ['encrypt', 'decrypt'];

/** Encode string → Uint8Array */
const enc = (s: string) => new TextEncoder().encode(s);
/** Decode Uint8Array → string */
const dec = (b: BufferSource) => new TextDecoder().decode(b);
/** ArrayBuffer → base64 string */
const toB64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
/** base64 string → Uint8Array */
const fromB64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Derive a 256-bit AES-GCM CryptoKey from a master password string.
 * `salt` should be a stable, app-unique value (we use the app identifier).
 */
async function deriveKey(master: string, salt: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc(master),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    KEY_USAGE
  );
}

const APP_SALT = 'holmgard-lore-editor-v1';

/**
 * Encrypt `plaintext` using the master key.
 * Returns `{ ciphertext: string, iv: string }` — both base64-encoded.
 */
export async function encryptSecret(
  plaintext: string,
  master: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey(master, APP_SALT);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc(plaintext)
  );
  return { ciphertext: toB64(encrypted), iv: toB64(iv.buffer) };
}

/**
 * Decrypt a previously encrypted secret.
 */
export async function decryptSecret(
  ciphertext: string,
  iv: string,
  master: string
): Promise<string> {
  const key = await deriveKey(master, APP_SALT);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    key,
    fromB64(ciphertext)
  );
  return dec(decrypted);
}
