export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

/**
 * The decrypted vault, as it lives in memory after unlock. The whole object is
 * sealed into VaultFile.body on every save.
 */
export interface VaultData {
  version: 1;
  projects: Project[];
  settings: Settings;
}

export interface Settings {
  /** The shared environment list (dev, staging, prod…), in column order. */
  environments: string[];
  /** Minutes of inactivity before the vault locks. */
  autoLockMinutes: number;
  /** Seconds before a copied secret is cleared from the clipboard. */
  clipboardClearSeconds: number;
  /** ISO time of the last exported backup, for the reminder. */
  lastBackupAt: string | null;
  /** The project Developer Keys opens on, and the one the wordmark goes back to. */
  defaultProjectId: string | null;
  /** Keep the automatic backup in Documents\Developer Keys Backups up to date. On unless turned off. */
  autoBackup?: boolean;
  /** Shortcuts the person changed, by action id, like { lock: 'Ctrl+Shift+L' }. */
  shortcuts?: Partial<Record<string, string>>;
}

export interface Project {
  id: string;
  name: string;
  items: Item[];
  createdAt: string;
  updatedAt: string;
}

/** `env: null` means the item belongs to no environment (SSH keys, 2FA, notes). */
export interface Item {
  id: string;
  type: ItemType;
  title: string;
  env: string | null;
  fields: Field[];
  tags: string[];
  /** Tokens, certificates and licences can expire. */
  expiresAt: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Field {
  id: string;
  label: string;
  value: string;
  kind: FieldKind;
  /** Hidden until revealed; never shown in lists. */
  secret: boolean;
}

export type FieldKind = 'text' | 'multiline' | 'url' | 'email' | 'totp' | 'number';

export type ItemType =
  | 'login'
  | 'token'
  | 'env'
  | 'connection'
  | 'database'
  | 'server'
  | 'ssh-key'
  | 'certificate'
  | 'totp'
  | 'webhook'
  | 'license'
  | 'note'
  | 'custom';

export const DEFAULT_ENVIRONMENTS = ['dev', 'stg', 'prod', 'perf', 'qa', 'uat', 'qmg'];
/** The default list before stg, perf and qa; vaults still on it are upgraded on unlock. */
const OLD_DEFAULT_ENVIRONMENTS = ['dev', 'staging', 'prod'];

export const DEFAULT_PROJECT_NAME = 'General';

export function newProject(name: string): Project {
  const stamp = now();
  return { id: newId(), name, items: [], createdAt: stamp, updatedAt: stamp };
}

/** A new vault starts with one project, so there's always somewhere to put a value. */
export function emptyVault(): VaultData {
  const first = newProject(DEFAULT_PROJECT_NAME);
  return {
    version: 1,
    projects: [first],
    settings: {
      environments: [...DEFAULT_ENVIRONMENTS],
      autoLockMinutes: 10,
      clipboardClearSeconds: 30,
      lastBackupAt: null,
      defaultProjectId: first.id,
    },
  };
}

/** Keeps the "always one project, always a default" promise after any change. */
export function ensureDefaultProject(data: VaultData): VaultData {
  let projects = data.projects;
  if (projects.length === 0) projects = [newProject(DEFAULT_PROJECT_NAME)];
  const id = data.settings.defaultProjectId;
  const defaultProjectId = projects.some((p) => p.id === id) ? id! : projects[0].id;
  // The default project is always first in the list.
  if (projects[0].id !== defaultProjectId) {
    const pinned = projects.find((p) => p.id === defaultProjectId)!;
    projects = [pinned, ...projects.filter((p) => p !== pinned)];
  }
  if (projects === data.projects && defaultProjectId === id) return data;
  return { ...data, projects, settings: { ...data.settings, defaultProjectId } };
}

/** Moves a project so it lands before the project now at `before` (projects.length = the end). */
export function moveProject(data: VaultData, id: string, before: number): VaultData {
  const from = data.projects.findIndex((p) => p.id === id);
  if (from < 0) return data;
  const to = Math.max(0, Math.min(data.projects.length - 1, from < before ? before - 1 : before));
  if (to === from) return data;
  const projects = [...data.projects];
  const [moved] = projects.splice(from, 1);
  projects.splice(to, 0, moved);
  return ensureDefaultProject({ ...data, projects });
}

/** Label for an item's environment, including "No environment". */
export const envLabel = (env: string | null) => env ?? 'No environment';

/**
 * Brings older vaults up to date: environments used to live on each project,
 * now they're one shared list in settings.
 */
export function normalizeVault(raw: VaultData): VaultData {
  const legacy = raw.projects.flatMap((p) => (p as Project & { environments?: string[] }).environments ?? []);
  const used = raw.projects.flatMap((p) => p.items.map((i) => i.env)).filter((e): e is string => !!e);
  let environments = [...new Set([...(raw.settings.environments ?? (legacy.length ? [] : DEFAULT_ENVIRONMENTS)), ...legacy, ...used])];
  let projects = raw.projects.map(({ environments: _drop, ...p }: Project & { environments?: string[] }) => p);
  const base = emptyVault().settings;

  // One-time upgrade: a vault still on the old default list (dev, staging, prod)
  // moves to the new one, and values stored under staging move to stg.
  if (environments.join('|') === OLD_DEFAULT_ENVIRONMENTS.join('|')) {
    environments = [...DEFAULT_ENVIRONMENTS];
    projects = projects.map((p) => ({ ...p, items: p.items.map((i) => (i.env === 'staging' ? { ...i, env: 'stg' } : i)) }));
  }
  return ensureDefaultProject({ ...raw, projects, settings: { ...base, ...raw.settings, defaultProjectId: raw.settings.defaultProjectId ?? null, environments } });
}


/** Where a key goes when it's moved or duplicated, and what it's called there. */
export interface Transfer {
  mode: 'move' | 'duplicate';
  fromProjectId: string;
  itemId: string;
  toProjectId: string;
  title: string;
  env: string | null;
}

/**
 * Moves a key to another project (same id, history kept) or duplicates it (a new key with new ids).
 * Either way it lands with the chosen name and environment.
 */
export function transferItem(data: VaultData, t: Transfer): VaultData {
  const item = data.projects.find((p) => p.id === t.fromProjectId)?.items.find((i) => i.id === t.itemId);
  if (!item || !data.projects.some((p) => p.id === t.toProjectId)) return data;
  const stamp = now();
  const placed: Item =
    t.mode === 'move'
      ? { ...item, title: t.title, env: t.env, updatedAt: stamp }
      : {
          ...item,
          id: newId(),
          title: t.title,
          env: t.env,
          fields: item.fields.map((f) => ({ ...f, id: newId() })),
          tags: [...item.tags],
          createdAt: stamp,
          updatedAt: stamp,
        };
  return {
    ...data,
    projects: data.projects.map((p) => {
      let items = p.items;
      if (t.mode === 'move' && p.id === t.fromProjectId) items = items.filter((i) => i.id !== item.id);
      if (p.id === t.toProjectId) items = [...items, placed];
      return items === p.items ? p : { ...p, items, updatedAt: stamp };
    }),
  };
}

/** Several keys going to one project: each keeps its own environment, or all take the same one. */
export interface BulkTransfer {
  mode: Transfer['mode'];
  fromProjectId: string;
  itemIds: string[];
  toProjectId: string;
  /** 'keep' leaves each key in its own environment. */
  env: 'keep' | string | null;
}

/**
 * Works out where each key lands. A name already used in that environment of the target
 * (by a key there, or by an earlier key in this batch) gets " copy", then " copy 2", and so on.
 */
export function planTransfers(projects: Project[], b: BulkTransfer): Transfer[] {
  const from = projects.find((p) => p.id === b.fromProjectId);
  const to = projects.find((p) => p.id === b.toProjectId);
  if (!from || !to) return [];
  const moving = new Set(b.mode === 'move' ? b.itemIds : []);
  const keyOf = (title: string, env: string | null) => `${env ?? ''}\u0000${title.trim().toLowerCase()}`;
  const used = new Set(to.items.filter((i) => !moving.has(i.id)).map((i) => keyOf(i.title, i.env)));
  const plan: Transfer[] = [];
  for (const item of from.items.filter((i) => b.itemIds.includes(i.id))) {
    const env = b.env === 'keep' ? item.env : b.env;
    let title = item.title;
    for (let n = 1; used.has(keyOf(title, env)); n++) title = `${item.title} copy${n === 1 ? '' : ` ${n}`}`;
    used.add(keyOf(title, env));
    plan.push({ mode: b.mode, fromProjectId: from.id, itemId: item.id, toProjectId: to.id, title, env });
  }
  return plan;
}

export const applyTransfers = (data: VaultData, plan: Transfer[]): VaultData => plan.reduce(transferItem, data);
