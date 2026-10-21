import { decryptBackup, detectBackup, encryptBackup } from '../crypto/backup';
import { unlockVault, type VaultFile } from '../crypto/vault-crypto';
import { newId, now, type Project, type VaultData } from './model';

/** What's inside a Developer Keys backup file, before encryption. */
type BackupPayload =
  | { app: 'devvault'; kind: 'vault'; exportedAt: string; projects: Project[] }
  | { app: 'devvault'; kind: 'projects'; exportedAt: string; projects: Project[] };

export function exportVault(data: VaultData, password: string) {
  const payload: BackupPayload = { app: 'devvault', kind: 'vault', exportedAt: now(), projects: data.projects };
  return encryptBackup(JSON.stringify(payload), password);
}

/**
 * A share file: one project, optionally narrowed to some environments.
 * `envs` lists the environments to keep; null in it keeps keys with no environment.
 */
export function exportProject(project: Project, password: string, envs?: (string | null)[]) {
  const shared: Project = envs ? { ...project, items: project.items.filter((i) => envs.includes(i.env)) } : project;
  const payload: BackupPayload = { app: 'devvault', kind: 'projects', exportedAt: now(), projects: [shared] };
  return encryptBackup(JSON.stringify(payload), password);
}

export interface ImportResult {
  projects: Project[];
  source: 'devvault' | 'onepass';
}

/**
 * Reads a backup into fresh projects with new ids, so importing never
 * overwrites anything already in the vault.
 */
export async function readBackup(bytes: Uint8Array, password: string): Promise<ImportResult> {
  // The automatic backup is a copy of the vault file itself.
  if (bytes[0] === 0x7b) {
    let file: VaultFile | null = null;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as VaultFile;
      if (parsed.format === 'devvault/1') file = parsed;
    } catch {
      /* not JSON: fall through */
    }
    if (file) {
      const { data } = await unlockVault<VaultData>(file, password);
      return { projects: freshIds(data.projects), source: 'devvault' };
    }
  }
  const kind = detectBackup(bytes);
  if (kind === 'onepass') {
    throw new Error('One Pass backups open correctly, but importing their accounts isn’t built yet.');
  }
  const json = await decryptBackup(bytes, password);
  const payload = JSON.parse(json) as BackupPayload;
  if (payload.app !== 'devvault' || !Array.isArray(payload.projects)) throw new Error('Not a Developer Keys backup');
  return { projects: freshIds(payload.projects), source: 'devvault' };
}

/** New ids everywhere, so an import never overwrites what's already in the vault. */
function freshIds(projects: Project[]): Project[] {
  const stamp = now();
  return projects.map(({ environments: _legacy, ...p }: Project & { environments?: string[] }) => ({
    ...p,
    id: newId(),
    updatedAt: stamp,
    items: p.items.map((i) => ({ ...i, id: newId(), fields: i.fields.map((f) => ({ ...f, id: newId() })) })),
  }));
}

/** Adds imported projects, renaming any whose name is already taken, and adds their environments to the list. */
export function mergeProjects(data: VaultData, incoming: Project[]): VaultData {
  const envs = new Set(data.settings.environments);
  for (const p of incoming) for (const i of p.items) if (i.env) envs.add(i.env);
  const taken = new Set(data.projects.map((p) => p.name.toLowerCase()));
  const named = incoming.map((p) => {
    let name = p.name;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${p.name} (${n})`;
    taken.add(name.toLowerCase());
    return { ...p, name };
  });
  return { ...data, projects: [...data.projects, ...named], settings: { ...data.settings, environments: [...envs] } };
}
