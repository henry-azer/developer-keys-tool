import type { VaultFile } from '../crypto/vault-crypto';

/**
 * Talks to the Developer Keys host on this machine. Same origin, so the page never
 * needs to reach anything else (the CSP enforces connect-src 'self').
 */
const headers = { 'X-Developer-Keys': '1' };

export class VaultConflictError extends Error {
  constructor() {
    super('The vault changed in another window. Reload to get the latest version.');
  }
}

export interface StoredVault {
  file: VaultFile;
  etag: string;
}

export async function health(): Promise<{ app: string; version: string }> {
  const res = await fetch('/api/health', { headers });
  if (!res.ok) throw new Error(`Host answered ${res.status}`);
  return res.json();
}

/** Returns null when no vault has been created yet. */
export async function loadVault(): Promise<StoredVault | null> {
  const res = await fetch('/api/vault', { headers, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't read the vault (${res.status})`);
  return { file: await res.json(), etag: res.headers.get('ETag') ?? '' };
}

/** Writes an encrypted backup to Documents\Developer Keys Backups and returns its path. */
export async function saveBackup(bytes: Uint8Array, name: string): Promise<string> {
  const res = await fetch(`/api/backups?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`Couldn't save the backup (${res.status})`);
  return (await res.json()).path;
}

/** Replaces the automatic backup with this copy of the (encrypted) vault file. */
export async function saveAutoBackup(file: VaultFile): Promise<string> {
  const res = await fetch('/api/backups/auto', {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(file),
  });
  if (!res.ok) throw new Error(`Couldn't update the automatic backup (${res.status})`);
  return (await res.json()).path;
}

/** Whether Smart add can run: the Claude Code CLI is installed and signed in on this PC. */
export async function aiStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/ai/status', { headers });
    return res.ok && (await res.json()).available === true;
  } catch {
    return false;
  }
}

/** Sends one prompt through the local Claude Code CLI and returns its answer. */
export async function aiAsk(prompt: string): Promise<string> {
  const res = await fetch('/api/ai/ask', { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: prompt });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => j.detail as string | undefined)
      .catch(() => undefined);
    throw new Error(detail || (res.status === 503 ? 'Claude Code isn’t signed in on this PC.' : `Claude couldn’t read that (${res.status}).`));
  }
  return (await res.json()).text as string;
}

export class HelloCancelledError extends Error {
  constructor() {
    super('Windows Hello was cancelled.');
  }
}

async function helloError(res: Response): Promise<Error> {
  if (res.status === 409) return new HelloCancelledError();
  const detail = await res
    .json()
    .then((j) => j.detail as string | undefined)
    .catch(() => undefined);
  return new Error(detail || `Windows Hello didn’t answer (${res.status}).`);
}

/** Whether this PC has Windows Hello, and whether it's turned on for the vault. */
export async function helloStatus(): Promise<{ available: boolean; enabled: boolean }> {
  try {
    const res = await fetch('/api/hello', { headers });
    if (res.ok) return await res.json();
  } catch {
    /* host unreachable: treat as unavailable */
  }
  return { available: false, enabled: false };
}

/** Seals the vault key with Windows Hello. Windows asks for the gesture. */
export async function enableHello(vaultKey: Uint8Array): Promise<void> {
  const res = await fetch('/api/hello', {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(vaultKey),
  });
  if (!res.ok) throw await helloError(res);
}

/** Asks for the Windows Hello gesture and returns the vault key. */
export async function unlockWithHello(): Promise<Uint8Array> {
  const res = await fetch('/api/hello/unlock', { method: 'POST', headers });
  if (!res.ok) throw await helloError(res);
  return new Uint8Array(await res.arrayBuffer());
}

export async function disableHello(): Promise<void> {
  const res = await fetch('/api/hello', { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Couldn’t turn off Windows Hello (${res.status})`);
}

export async function openBackupFolder(): Promise<void> {
  const res = await fetch('/api/backups/open-folder', { method: 'POST', headers });
  if (!res.ok) throw new Error(`Couldn't open the backups folder (${res.status})`);
}

/** Erases the vault and its history on this PC. Backup files are kept. */
export async function eraseVault(): Promise<void> {
  const res = await fetch('/api/vault', { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Couldn't erase the vault (${res.status})`);
}

/** Saves the vault. Pass the etag you loaded, or null to create the first one. */
export async function storeVault(file: VaultFile, etag: string | null): Promise<string> {
  const res = await fetch('/api/vault', {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      ...(etag === null ? { 'If-None-Match': '*' } : { 'If-Match': etag }),
    },
    body: JSON.stringify(file),
  });
  if (res.status === 412) throw new VaultConflictError();
  if (!res.ok) throw new Error(`Couldn't save the vault (${res.status})`);
  return res.headers.get('ETag') ?? '';
}
