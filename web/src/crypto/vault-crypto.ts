import { fromBase64, own, randomBytes, toBase64, utf8 } from './bytes';
import { VAULT_ITERATIONS, deriveKeyBytes, importAesKey } from './kdf';

/**
 * The on-disk vault file. Everything secret, including titles and tags, is in
 * `body`. The local host only ever sees this JSON and never holds a key.
 *
 *   password --PBKDF2--> KEK --AES-GCM--> vault key (DEK) --AES-GCM--> body
 *
 * Wrapping the DEK means a password change re-seals 32 bytes, not the vault.
 */
export interface VaultFile {
  format: 'devvault/1';
  kdf: { alg: 'PBKDF2-SHA256'; iterations: number; salt: string };
  key: Sealed;
  body: Sealed;
}

interface Sealed {
  nonce: string;
  data: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong master password, or the vault file was changed');
  }
}

/** An unlocked vault. Holds the DEK in memory until `lock()` drops it. */
export interface VaultSession {
  readonly dek: CryptoKey;
  readonly kdf: VaultFile['kdf'];
  readonly key: Sealed;
}

// Kept from the DevVault name so existing vault files still open.
const FORMAT = 'devvault/1';
const NONCE = 12;

// Associated data binds each ciphertext to its role and KDF parameters, so a
// tampered salt, iteration count or swapped block fails to decrypt.
const keyAad = (kdf: VaultFile['kdf']) =>
  utf8.encode(`${FORMAT}|key|${kdf.alg}|${kdf.iterations}|${kdf.salt}`);
const bodyAad = () => utf8.encode(`${FORMAT}|body`);

async function seal(key: CryptoKey, plain: Uint8Array, aad: Uint8Array): Promise<Sealed> {
  const nonce = randomBytes(NONCE);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: own(aad) },
    key,
    own(plain),
  );
  return { nonce: toBase64(nonce), data: toBase64(new Uint8Array(data)) };
}

async function open(key: CryptoKey, sealed: Sealed, aad: Uint8Array): Promise<Uint8Array> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.nonce), additionalData: own(aad) },
      key,
      fromBase64(sealed.data),
    );
    return new Uint8Array(plain);
  } catch {
    throw new WrongPasswordError();
  }
}

async function sealKey(password: string, dekRaw: Uint8Array, iterations: number) {
  const kdf: VaultFile['kdf'] = {
    alg: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(randomBytes(16)),
  };
  const kek = await importAesKey(await deriveKeyBytes(password, fromBase64(kdf.salt), iterations));
  return { kdf, key: await seal(kek, dekRaw, keyAad(kdf)) };
}

/** Creates a new vault holding `data` (any JSON value). */
export async function createVault<T>(
  password: string,
  data: T,
  iterations = VAULT_ITERATIONS,
): Promise<{ file: VaultFile; session: VaultSession }> {
  const dekRaw = randomBytes(32);
  const { kdf, key } = await sealKey(password, dekRaw, iterations);
  const dek = await importAesKey(dekRaw, true);
  dekRaw.fill(0);
  const session: VaultSession = { dek, kdf, key };
  return { file: await saveVault(session, data), session };
}

/** Opens a vault file. Throws `WrongPasswordError` on a bad password or tampering. */
export async function unlockVault<T>(
  file: VaultFile,
  password: string,
): Promise<{ data: T; session: VaultSession }> {
  if (file.format !== FORMAT || file.kdf.alg !== 'PBKDF2-SHA256') {
    throw new Error('Not a Developer Keys file');
  }
  const kek = await importAesKey(
    await deriveKeyBytes(password, fromBase64(file.kdf.salt), file.kdf.iterations),
  );
  const dekRaw = await open(kek, file.key, keyAad(file.kdf));
  const dek = await importAesKey(dekRaw, true);
  dekRaw.fill(0);
  const body = await open(dek, file.body, bodyAad());
  return { data: JSON.parse(utf8.decode(body)) as T, session: { dek, kdf: file.kdf, key: file.key } };
}

/** Opens a vault file with its raw vault key (from Windows Hello) instead of the password. */
export async function unlockVaultWithKey<T>(
  file: VaultFile,
  dekRaw: Uint8Array,
): Promise<{ data: T; session: VaultSession }> {
  if (file.format !== FORMAT) throw new Error('Not a Developer Keys file');
  const dek = await importAesKey(dekRaw, true);
  dekRaw.fill(0);
  const body = await open(dek, file.body, bodyAad());
  return { data: JSON.parse(utf8.decode(body)) as T, session: { dek, kdf: file.kdf, key: file.key } };
}

/** The raw vault key, for sealing with Windows Hello. Zero it after use. */
export async function exportVaultKey(session: VaultSession): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', session.dek));
}

/** Re-seals `data` under the session's vault key, with a fresh nonce. */
export async function saveVault<T>(session: VaultSession, data: T): Promise<VaultFile> {
  return {
    format: FORMAT,
    kdf: session.kdf,
    key: session.key,
    body: await seal(session.dek, utf8.encode(JSON.stringify(data)), bodyAad()),
  };
}

/** Re-wraps the vault key under a new password. The body is unchanged. */
export async function changePassword(
  session: VaultSession,
  newPassword: string,
  iterations = VAULT_ITERATIONS,
): Promise<VaultSession> {
  const dekRaw = new Uint8Array(await crypto.subtle.exportKey('raw', session.dek));
  const { kdf, key } = await sealKey(newPassword, dekRaw, iterations);
  dekRaw.fill(0);
  return { dek: session.dek, kdf, key };
}
