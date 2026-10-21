import { own, utf8 } from './bytes';

/** PBKDF2-HMAC-SHA256 work factor for new vaults (OWASP 2023 figure). */
export const VAULT_ITERATIONS = 600_000;

/** Reject files that ask for absurd work factors (DoS) or trivially weak ones. */
export const MIN_ITERATIONS = 1_000;
export const MAX_ITERATIONS = 10_000_000;

/** Derives a raw 256-bit key from a password with PBKDF2-HMAC-SHA256. */
export async function deriveKeyBytes(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error('Unsupported key-derivation work factor');
  }
  const base = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: own(salt), iterations },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export function importAesKey(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', own(raw), 'AES-GCM', extractable, ['encrypt', 'decrypt']);
}
