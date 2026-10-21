import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  changePassword as rewrap,
  createVault,
  exportVaultKey,
  saveVault,
  unlockVault,
  unlockVaultWithKey,
  type VaultFile,
  type VaultSession,
} from '../crypto/vault-crypto';
import { enableHello, eraseVault, loadVault, saveAutoBackup, storeVault, unlockWithHello, VaultConflictError } from '../storage/host-api';
import { emptyVault, ensureDefaultProject, normalizeVault, type VaultData } from './model';

export type VaultStatus =
  | { kind: 'loading' }
  | { kind: 'no-host'; message: string }
  | { kind: 'new' }
  | { kind: 'locked'; file: VaultFile; etag: string }
  | { kind: 'unlocked' };

export type SaveState = 'saved' | 'saving' | 'conflict' | 'error';

/** The automatic backup: when it was last written, and why it failed if it did. */
export interface AutoBackupState {
  at: string | null;
  path: string | null;
  error: string | null;
}

interface VaultApi {
  status: VaultStatus;
  data: VaultData | null;
  saveState: SaveState;
  saveError: string | null;
  autoBackup: AutoBackupState;
  create(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  /** Unlocks with the Windows Hello gesture. */
  unlockWithHello(): Promise<void>;
  /** Seals the open vault's key with Windows Hello. */
  enableHello(): Promise<void>;
  lock(): void;
  /** Applies a change and saves it. Changes are queued so saves never overlap. */
  update(change: (draft: VaultData) => VaultData): void;
  changePassword(current: string, next: string): Promise<void>;
  reload(): void;
  /** Erases everything after checking the master password, then shows Create vault. */
  erase(password: string): Promise<void>;
}

const Ctx = createContext<VaultApi | null>(null);

export function useVault(): VaultApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVault outside VaultProvider');
  return v;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>({ kind: 'loading' });
  const [data, setData] = useState<VaultData | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoBackup, setAutoBackup] = useState<AutoBackupState>({ at: null, path: null, error: null });

  // Kept in refs so the save queue always uses the latest session and etag.
  const session = useRef<VaultSession | null>(null);
  const etag = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef<VaultData | null>(null);
  const dataRef = useRef<VaultData | null>(null);

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const stored = await loadVault();
      if (!stored) setStatus({ kind: 'new' });
      else setStatus({ kind: 'locked', file: stored.file, etag: stored.etag });
    } catch (e) {
      setStatus({ kind: 'no-host', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The vault file is already encrypted with the master password, so the backup is a plain copy of it.
  const backUp = useCallback((file: VaultFile, settings: VaultData['settings']) => {
    if (settings.autoBackup === false) return;
    saveAutoBackup(file)
      .then((path) => setAutoBackup({ at: new Date().toISOString(), path, error: null }))
      .catch((e: Error) => setAutoBackup((a) => ({ ...a, error: e.message })));
  }, []);

  const persist = useCallback(
    (next: VaultData) => {
      latest.current = next;
      setSaveState('saving');
      queue.current = queue.current.then(async () => {
        // Skip stale snapshots: only the newest data needs writing.
        if (latest.current !== next || !session.current) return;
        try {
          const file = await saveVault(session.current, next);
          etag.current = await storeVault(file, etag.current);
          backUp(file, next.settings);
          if (latest.current === next) setSaveState('saved');
          setSaveError(null);
        } catch (e) {
          if (e instanceof VaultConflictError) setSaveState('conflict');
          else {
            setSaveState('error');
            setSaveError((e as Error).message);
          }
        }
      });
    },
    [backUp],
  );

  const opened = useCallback(
    ({ data: raw, session: s }: { data: VaultData; session: VaultSession }) => {
      if (status.kind !== 'locked') return;
      const d = normalizeVault(raw);
      session.current = s;
      etag.current = status.etag;
      dataRef.current = d;
      setData(d);
      setSaveState('saved');
      setStatus({ kind: 'unlocked' });
      backUp(status.file, d.settings);
      // Save once if unlocking upgraded an older vault, so the upgrade sticks.
      if (JSON.stringify(d) !== JSON.stringify(raw)) persist(d);
    },
    [status, backUp, persist],
  );

  const api = useMemo<VaultApi>(
    () => ({
      status,
      data,
      saveState,
      saveError,
      autoBackup,
      async create(password) {
        const initial = emptyVault();
        const { file, session: s } = await createVault(password, initial);
        etag.current = await storeVault(file, null);
        backUp(file, initial.settings);
        session.current = s;
        dataRef.current = initial;
        setData(initial);
        setStatus({ kind: 'unlocked' });
      },
      async unlock(password) {
        if (status.kind !== 'locked') return;
        opened(await unlockVault<VaultData>(status.file, password));
      },
      async unlockWithHello() {
        if (status.kind !== 'locked') return;
        opened(await unlockVaultWithKey<VaultData>(status.file, await unlockWithHello()));
      },
      async enableHello() {
        if (!session.current) throw new Error('Unlock the vault first');
        const key = await exportVaultKey(session.current);
        try {
          await enableHello(key);
        } finally {
          key.fill(0);
        }
      },
      lock() {
        session.current = null;
        latest.current = null;
        dataRef.current = null;
        setData(null);
        load();
      },
      update(change) {
        if (!dataRef.current) return;
        const next = ensureDefaultProject(change(dataRef.current));
        dataRef.current = next;
        setData(next);
        persist(next);
      },
      async changePassword(current, next) {
        if (!session.current || !dataRef.current) return;
        // Re-open the stored file to prove the current password before re-wrapping.
        const stored = await loadVault();
        if (!stored) throw new Error('No vault to update');
        await unlockVault(stored.file, current);
        session.current = await rewrap(session.current, next);
        persist(dataRef.current);
      },
      async erase(password) {
        const stored = await loadVault();
        if (stored) await unlockVault(stored.file, password);
        await queue.current;
        await eraseVault();
        session.current = null;
        latest.current = null;
        dataRef.current = null;
        etag.current = null;
        setData(null);
        setStatus({ kind: 'new' });
      },
      reload() {
        session.current = null;
        dataRef.current = null;
        setData(null);
        load();
      },
    }),
    [status, data, saveState, saveError, autoBackup, load, persist, backUp, opened],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
