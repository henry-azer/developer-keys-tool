import { concat, own, randomBytes, readU32, u32, utf8 } from './bytes';
import { deriveKeyBytes, importAesKey } from './kdf';
import { WrongPasswordError } from './vault-crypto';

/**
 * Password-protected export files, in One Pass's v2 byte layout:
 *
 *   [sig length: u32 BE][signature][mode: u8 = 1]
 *   [salt: 16][PBKDF2 iterations: u32 BE][nonce: 12][ciphertext + 16-byte tag]
 *
 * Everything before the nonce is the AES-GCM associated data. Using the same
 * layout lets Developer Keys read One Pass backups (signature PASSCARD_BACKUP_V2).
 */
// Kept from the DevVault name: backups already in the wild carry this signature.
export const DEVVAULT_SIGNATURE = 'DEVVAULT_BACKUP_V1';
export const ONEPASS_SIGNATURE = 'PASSCARD_BACKUP_V2';
export const BACKUP_ITERATIONS = 600_000;
export const MIN_BACKUP_PASSWORD = 8;

const MODE_PASSWORD = 1;
const SALT = 16;
const NONCE = 12;
const TAG = 16;

export type BackupKind = 'devvault' | 'onepass' | 'unknown';

function readSignature(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  const len = readU32(bytes, 0);
  if (len <= 0 || len > 64 || bytes.length < 4 + len) return null;
  try {
    return utf8.decode(bytes.subarray(4, 4 + len));
  } catch {
    return null;
  }
}

export function detectBackup(bytes: Uint8Array): BackupKind {
  const sig = readSignature(bytes);
  const modeAt = 4 + (sig ? utf8.encode(sig).length : 0);
  if (!sig || bytes[modeAt] !== MODE_PASSWORD) return 'unknown';
  if (sig === DEVVAULT_SIGNATURE) return 'devvault';
  if (sig === ONEPASS_SIGNATURE) return 'onepass';
  return 'unknown';
}

export async function encryptBackup(
  json: string,
  password: string,
  iterations = BACKUP_ITERATIONS,
): Promise<Uint8Array> {
  if (password.length < MIN_BACKUP_PASSWORD) {
    throw new Error(`Backup password must be at least ${MIN_BACKUP_PASSWORD} characters`);
  }
  const sig = utf8.encode(DEVVAULT_SIGNATURE);
  const salt = randomBytes(SALT);
  const header = concat(u32(sig.length), sig, new Uint8Array([MODE_PASSWORD]), salt, u32(iterations));
  const key = await importAesKey(await deriveKeyBytes(password, salt, iterations));
  const nonce = randomBytes(NONCE);
  const body = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: header },
    key,
    utf8.encode(json),
  );
  return concat(header, nonce, new Uint8Array(body));
}

/** Decrypts a Developer Keys or One Pass password backup and returns its JSON text. */
export async function decryptBackup(bytes: Uint8Array, password: string): Promise<string> {
  const kind = detectBackup(bytes);
  if (kind === 'unknown') throw new Error('Not a Developer Keys or One Pass backup');
  const sig = utf8.encode(kind === 'devvault' ? DEVVAULT_SIGNATURE : ONEPASS_SIGNATURE);
  const at = 4 + sig.length + 1;
  if (bytes.length < at + SALT + 4 + NONCE + TAG) throw new Error('Backup file is truncated');
  const salt = bytes.subarray(at, at + SALT);
  const iterations = readU32(bytes, at + SALT);
  const nonceAt = at + SALT + 4;
  const key = await importAesKey(await deriveKeyBytes(password, salt, iterations));
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: own(bytes.subarray(nonceAt, nonceAt + NONCE)),
        additionalData: own(bytes.subarray(0, nonceAt)),
      },
      key,
      own(bytes.subarray(nonceAt + NONCE)),
    );
    return utf8.decode(new Uint8Array(plain));
  } catch {
    throw new WrongPasswordError();
  }
}
