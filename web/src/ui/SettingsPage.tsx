import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  FolderOpen,
  HardDrive,
  Info,
  Keyboard,
  Layers,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { WrongPasswordError } from '../crypto/vault-crypto';
import { disableHello, HelloCancelledError, helloStatus, openBackupFolder, saveBackup } from '../storage/host-api';
import { exportVault, mergeProjects, readBackup } from '../vault/backup-io';
import { now, type VaultData } from '../vault/model';
import { useVault } from '../vault/vault-store';
import { useClipboard } from './clipboard';
import { AboutSection, GuideSection } from './GuideAbout';
import { Confirm, useFilePassword } from './Dialogs';
import { timeAgo } from './format';
import { PasswordInput, StrengthMeter } from './Gate';
import { BusyForm, FormNote } from './parts';
import { comboOf, comboProblem, Keys, SHORTCUT_IDS, SHORTCUTS, useShortcuts, type ShortcutId } from './shortcuts';

export type SettingsSection = 'environments' | 'backup' | 'security' | 'shortcuts' | 'reset' | 'guide' | 'about';

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: 'environments', label: 'Environments', icon: <Layers size={16} aria-hidden /> },
  { id: 'backup', label: 'Backup & restore', icon: <HardDrive size={16} aria-hidden /> },
  { id: 'security', label: 'Security', icon: <ShieldCheck size={16} aria-hidden /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} aria-hidden /> },
  { id: 'reset', label: 'Reset', icon: <RotateCcw size={16} aria-hidden /> },
  { id: 'guide', label: 'Guide', icon: <BookOpen size={16} aria-hidden /> },
  { id: 'about', label: 'About', icon: <Info size={16} aria-hidden /> },
];

export const BACKUP_STALE_DAYS = 7;
export const isBackupStale = (iso: string | null) => !iso || Date.now() - new Date(iso).getTime() > BACKUP_STALE_DAYS * 86_400_000;

type Msg = { ok: boolean; text: string } | null;
/** Errors stay next to the form; confirmations show as a toast. */
function Message({ msg }: { msg: Msg }) {
  const { notify } = useClipboard();
  useEffect(() => {
    if (msg?.ok) notify(msg.text);
  }, [msg, notify]);
  return msg && !msg.ok ? (
    <p className="error-text" role="alert">
      {msg.text}
    </p>
  ) : null;
}

/** A setting with its explanation on the left and the control on the right. */
function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <label className="setting-label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function BackupSection() {
  const { data, update, autoBackup } = useVault();
  const pass = useFilePassword();
  const [backupMsg, setBackupMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPw, setImportPw] = useState('');
  const [importMsg, setImportMsg] = useState<Msg>(null);
  if (!data) return null;
  const last = data.settings.lastBackupAt;
  const autoOn = data.settings.autoBackup !== false;
  const stale = !autoOn && isBackupStale(last);
  const setAuto = (on: boolean) => update((d) => ({ ...d, settings: { ...d.settings, autoBackup: on } }));

  async function backup(e: FormEvent) {
    e.preventDefault();
    if (pass.problem) return setBackupMsg({ ok: false, text: pass.problem });
    setBusy('backup');
    try {
      const path = await saveBackup(await exportVault(data!, pass.pw), 'developer-keys');
      update((d) => ({ ...d, settings: { ...d.settings, lastBackupAt: now() } }));
      setBackupMsg({ ok: true, text: `Saved to ${path}` });
      pass.reset();
    } catch (err) {
      setBackupMsg({ ok: false, text: (err as Error).message });
    }
    setBusy(null);
  }

  async function importBackup(e: FormEvent) {
    e.preventDefault();
    if (!importFile) return setImportMsg({ ok: false, text: 'Choose a .dkbackup or .dkvault file first.' });
    setBusy('import');
    try {
      const { projects } = await readBackup(new Uint8Array(await importFile.arrayBuffer()), importPw);
      update((d) => mergeProjects(d, projects));
      setImportMsg({
        ok: true,
        text: `Imported ${projects.length} project${projects.length === 1 ? '' : 's'}: ${projects.map((p) => p.name).join(', ')}.`,
      });
      setImportPw('');
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof WrongPasswordError ? 'That password doesn’t open this file.' : (err as Error).message });
    }
    setBusy(null);
  }

  return (
    <>
      <section className="backup-hero" data-stale={stale || !!(autoOn && autoBackup.error)} aria-labelledby="backup-state">
        <HardDrive size={28} aria-hidden />
        <div className="grow">
          <h2 id="backup-state">
            {autoOn
              ? autoBackup.error
                ? 'Automatic backup failed'
                : 'Automatic backup is on'
              : last
                ? `Last backup ${timeAgo(last)}`
                : 'No backup yet'}
          </h2>
          <p className="hint">
            {autoOn
              ? autoBackup.error
                ? `${autoBackup.error}. Check that the Developer Keys host is running and that Documents is writable.`
                : `Updated ${autoBackup.at ? timeAgo(autoBackup.at) : 'after every change'}. It opens with your master password.`
              : stale
                ? 'Only on this PC. Back it up to stay safe.'
                : 'You’re covered. Keep a copy somewhere off this PC, like OneDrive or a USB drive.'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => openBackupFolder().catch((err) => setBackupMsg({ ok: false, text: (err as Error).message }))}
        >
          <FolderOpen size={15} /> Open backups folder
        </button>
      </section>

      <div className="panel-card">
        <label className="checkbox switch-row">
          <input type="checkbox" checked={autoOn} onChange={(e) => setAuto(e.target.checked)} />
          <span className="switch" aria-hidden />
          <span>
            <span className="checkbox-title">Automatic backup</span>
            <span className="checkbox-desc">
              Keeps <code>Documents\Developer Keys Backups\Developer Keys auto-backup.dkvault</code> up to date after every change. It’s encrypted and opens with
              your master password. Put that folder in OneDrive to keep a copy off this PC.
            </span>
          </span>
        </label>
      </div>

      <BusyForm busy={busy === 'import'} className="panel-card" onSubmit={importBackup}>
        <div>
          <h3>Import from a file</h3>
          <p className="hint">
            Adds the projects from a backup, the automatic backup (use your master password) or a teammate’s share file. Nothing already in your vault
            changes.
          </p>
        </div>
        <Message msg={importMsg} />
        <div className="row-2">
          <div>
            <label className="field-label" htmlFor="import-file">
              File
            </label>
            <input
              id="import-file"
              ref={fileRef}
              className="input"
              type="file"
              accept=".dkbackup,.dkvault,.dvbackup,.dvvault"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="import-pw">
              File password
            </label>
            <PasswordInput
              id="import-pw"
              value={importPw}
              onChange={(v) => (setImportPw(v), setImportMsg(null))}
              autoComplete="off"
              invalid={importMsg?.ok === false && !!importPw}
            />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" disabled={busy === 'import' || !importFile || !importPw}>
            <Upload size={15} /> {busy === 'import' ? 'Importing…' : 'Import'}
          </button>
        </div>
      </BusyForm>

      <BusyForm busy={busy === 'backup'} className="panel-card" onSubmit={backup}>
        <div>
          <h3>Save an extra copy</h3>
          <p className="hint">An encrypted copy of the whole vault, saved to Documents\Developer Keys Backups.</p>
        </div>
        <Message msg={backupMsg} />
        {pass.fields('backup')}
        <div className="actions">
          <button className="btn btn-primary" disabled={busy === 'backup' || !!pass.problem}>
            {busy === 'backup' ? 'Encrypting…' : 'Save backup'}
          </button>
        </div>
      </BusyForm>
    </>
  );
}

/** The shared environment list: add, rename, reorder, remove. Renames carry every value with them. */
function EnvironmentsSection() {
  const { data, update } = useVault();
  const [adding, setAdding] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (!data) return null;
  const envs = data.settings.environments;
  const usage = (env: string) => data.projects.reduce((n, p) => n + p.items.filter((i) => i.env === env).length, 0);
  const setEnvs = (next: string[], items?: (env: string | null) => string | null) =>
    update((d) => ({
      ...d,
      settings: { ...d.settings, environments: next },
      projects: items ? d.projects.map((p) => ({ ...p, items: p.items.map((i) => ({ ...i, env: items(i.env) })) })) : d.projects,
    }));

  function add(e: FormEvent) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    if (envs.some((x) => x.toLowerCase() === name.toLowerCase())) return setMsg({ ok: false, text: `“${name}” is already in the list.` });
    setEnvs([...envs, name]);
    setAdding('');
    setMsg(null);
  }

  function rename(env: string) {
    const next = (drafts[env] ?? env).trim();
    setDrafts(({ [env]: _done, ...rest }) => rest);
    if (!next || next === env) return;
    if (envs.some((x) => x !== env && x.toLowerCase() === next.toLowerCase()))
      return setMsg({ ok: false, text: `“${next}” is already in the list.` });
    setEnvs(
      envs.map((x) => (x === env ? next : x)),
      (v) => (v === env ? next : v),
    );
    setMsg({ ok: true, text: `Renamed ${env} to ${next}${usage(env) ? `, with its ${usage(env)} value${usage(env) === 1 ? '' : 's'}` : ''}.` });
  }

  function move(env: string, by: -1 | 1) {
    const i = envs.indexOf(env);
    const j = i + by;
    if (j < 0 || j >= envs.length) return;
    const next = [...envs];
    [next[i], next[j]] = [next[j], next[i]];
    setEnvs(next);
  }

  function remove(env: string) {
    if (usage(env) > 0) return;
    setEnvs(envs.filter((x) => x !== env));
    setRemoving(null);
    setMsg({ ok: true, text: `Removed ${env}.` });
  }

  return (
    <div className="panel-card">
      <div>
        <h3>Environments</h3>
        <p className="hint">Every project uses this list for its columns, in this order.</p>
      </div>
      {envs.length === 0 ? (
        <p className="hint">No environments. Projects show their values as a single list.</p>
      ) : (
        <ul className="env-list">
          {envs.map((env, i) => {
            const n = usage(env);
            return (
              <li key={env} className="env-row">
                <input
                  className="input"
                  value={drafts[env] ?? env}
                  aria-label={`Rename ${env}`}
                  aria-invalid={(() => {
                    const d = (drafts[env] ?? env).trim();
                    return !d || envs.some((x) => x !== env && x.toLowerCase() === d.toLowerCase());
                  })()}
                  onChange={(e) => setDrafts((d) => ({ ...d, [env]: e.target.value }))}
                  onBlur={() => rename(env)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                />
                <span className="hint num">
                  {n} value{n === 1 ? '' : 's'}
                </span>
                <span className="row-tools">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(env, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${env} up`}
                    title="Move up"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(env, 1)}
                    disabled={i === envs.length - 1}
                    aria-label={`Move ${env} down`}
                    title="Move down"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    onClick={() => usage(env) === 0 && setRemoving(env)}
                    aria-disabled={usage(env) > 0}
                    aria-label={usage(env) > 0 ? `${env} can’t be removed while keys use it` : `Remove ${env}`}
                    title={
                      usage(env) > 0
                        ? `${usage(env)} key${usage(env) === 1 ? '' : 's'} use ${env}. Move or delete ${usage(env) === 1 ? 'it' : 'them'} first, or rename ${env}.`
                        : 'Remove'
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {removing && (
        <Confirm
          title={`Remove “${removing}”?`}
          description="Environment"
          confirmLabel="Remove environment"
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        >
          No keys use it, so nothing else changes. Its column disappears from every project.
        </Confirm>
      )}
      <form className="env-add" onSubmit={add} noValidate>
        <input
          className="input"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Add an environment, e.g. sandbox"
          aria-label="New environment name"
          aria-invalid={!!adding.trim() && envs.some((x) => x.toLowerCase() === adding.trim().toLowerCase())}
        />
        <button className="btn btn-secondary" disabled={!adding.trim() || envs.some((x) => x.toLowerCase() === adding.trim().toLowerCase())}>
          <Plus size={15} /> Add
        </button>
      </form>
      <Message msg={msg} />
    </div>
  );
}

/** Turns Windows Hello unlock on or off. The master password keeps working either way. */
function HelloCard() {
  const { enableHello } = useVault();
  const [state, setState] = useState<{ available: boolean; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    helloStatus().then(setState);
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      if (on) await enableHello();
      else await disableHello();
      setMsg({ ok: true, text: on ? 'Windows Hello is on. Use it next time you unlock.' : 'Windows Hello is off for this vault.' });
    } catch (err) {
      if (!(err instanceof HelloCancelledError)) setMsg({ ok: false, text: (err as Error).message });
    }
    setState(await helloStatus());
    setBusy(false);
  }

  const available = state?.available ?? false;
  return (
    <div className="panel-card" aria-busy={busy}>
      <label className="checkbox switch-row">
        <input type="checkbox" checked={state?.enabled ?? false} disabled={busy || !available} onChange={(e) => toggle(e.target.checked)} />
        <span className="switch" aria-hidden />
        <span>
          <span className="checkbox-title">Unlock with Windows Hello</span>
          <span className="checkbox-desc">
            {state && !available
              ? 'Windows Hello isn’t available on this PC.'
              : busy
                ? 'Follow the Windows Hello prompt to continue.'
                : 'Use your fingerprint, face or Windows Hello PIN instead of typing the master password. The master password still works. The unlock key stays sealed by Windows Hello on this PC.'}
          </span>
        </span>
      </label>
      <Message msg={msg} />
    </div>
  );
}

function SecuritySection() {
  const { data, update, changePassword } = useVault();
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const s = data.settings;
  const set = (patch: Partial<VaultData['settings']>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  // Any new password is accepted; the meter only advises. Typing it twice still guards against typos.
  const pwRule = again && newPw !== again ? 'The new passwords don’t match.' : null;
  const pwValid = !!curPw && !!newPw && newPw === again;

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (!pwValid) return;
    setBusy(true);
    try {
      await changePassword(curPw, newPw);
      setMsg({ ok: true, text: 'Master password changed. Use the new one next time you unlock.' });
      setCurPw('');
      setNewPw('');
      setAgain('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof WrongPasswordError ? 'Your current password is wrong.' : (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <>
      <div className="panel-card">
        <h3>Locking and clipboard</h3>
        <div className="setting-rows">
          <Row label="Lock after" hint="The vault locks itself when you step away." htmlFor="autolock">
            <select id="autolock" className="select" value={s.autoLockMinutes} onChange={(e) => set({ autoLockMinutes: Number(e.target.value) })}>
              {[1, 5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minute{m === 1 ? '' : 's'} idle
                </option>
              ))}
            </select>
          </Row>
          <Row label="Clear copied values" hint="Copied secrets are wiped from the clipboard after this long." htmlFor="clipclear">
            <select
              id="clipclear"
              className="select"
              value={s.clipboardClearSeconds}
              onChange={(e) => set({ clipboardClearSeconds: Number(e.target.value) })}
            >
              {[15, 30, 60, 120].map((n) => (
                <option key={n} value={n}>
                  After {n} seconds
                </option>
              ))}
              <option value={0}>Never</option>
            </select>
          </Row>
        </div>
      </div>

      <HelloCard />

      <BusyForm busy={busy} className="panel-card" onSubmit={savePassword}>
        <div>
          <h3>Master password</h3>
          <p className="hint">Changing it re-seals the vault key only; your items stay as they are.</p>
        </div>
        <Message msg={msg} />
        <FormNote rule={msg?.ok === false ? null : pwRule} touched={again.length > 0} hint="Type the new password twice." />
        <div>
          <label className="field-label" htmlFor="cur-pw">
            Current password
          </label>
          <PasswordInput
            id="cur-pw"
            value={curPw}
            onChange={(v) => (setCurPw(v), setMsg(null))}
            autoComplete="current-password"
            invalid={msg?.ok === false}
          />
        </div>
        <div className="row-2">
          <div>
            <label className="field-label" htmlFor="next-pw">
              New password
            </label>
            <PasswordInput
              id="next-pw"
              value={newPw}
              onChange={setNewPw}
              autoComplete="new-password"
            />
            <StrengthMeter pw={newPw} />
          </div>
          <div>
            <label className="field-label" htmlFor="next-again">
              Type it again
            </label>
            <PasswordInput
              id="next-again"
              value={again}
              onChange={setAgain}
              autoComplete="new-password"
              invalid={again.length > 0 && again !== newPw}
            />
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" disabled={busy || !pwValid}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </BusyForm>
    </>
  );
}

/** Erases the vault on this PC. Asks for the master password and an explicit tick. */
function ResetSection({ onBackup }: { onBackup: () => void }) {
  const { data, erase } = useVault();
  const [pw, setPw] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!data) return null;
  const items = data.projects.reduce((n, p) => n + p.items.length, 0);
  const last = data.settings.lastBackupAt;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pw || !sure) return;
    setBusy(true);
    setMsg(null);
    try {
      await erase(pw);
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof WrongPasswordError ? 'That isn’t your master password. Nothing was erased.' : (err as Error).message,
      });
      setBusy(false);
    }
  }

  return (
    <BusyForm busy={busy} className="panel-card danger-card" onSubmit={submit}>
      <div>
        <h3>Erase this vault</h3>
        <p className="hint">Removes everything Developer Keys stores on this PC and starts over with Create vault. This can’t be undone.</p>
      </div>
      <Message msg={msg} />
      <ul className="erase-list">
        <li>
          <b className="num">{data.projects.length}</b> project{data.projects.length === 1 ? '' : 's'} and <b className="num">{items}</b> value
          {items === 1 ? '' : 's'}
        </li>
        <li>Saved history (up to 20 earlier versions)</li>
        <li>Your environments and settings</li>
      </ul>
      <p className="hint">
        Kept: backup files in Documents\Developer Keys Backups. {last ? `Your last backup is from ${timeAgo(last)}.` : 'You have no backup yet.'}{' '}
        <button type="button" className="link-btn" onClick={onBackup}>
          Back up first
        </button>
      </p>
      <div>
        <label className="field-label" htmlFor="erase-pw">
          Master password
        </label>
        <PasswordInput
          id="erase-pw"
          value={pw}
          onChange={(v) => (setPw(v), setMsg(null))}
          autoComplete="current-password"
          invalid={msg?.ok === false}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />I understand everything above is deleted for good
      </label>
      <div className="actions">
        <button className="btn btn-danger-solid" disabled={!pw || !sure || busy}>
          <Trash2 size={15} /> {busy ? 'Erasing…' : 'Erase everything'}
        </button>
      </div>
    </BusyForm>
  );
}

/** Every shortcut, each one changeable: press Change, then the new keys. */
function ShortcutsSection() {
  const { data, update } = useVault();
  const current = useShortcuts();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [msg, setMsg] = useState<{ id: ShortcutId; text: string } | null>(null);
  if (!data) return null;
  const custom = data.settings.shortcuts ?? {};
  const changed = SHORTCUT_IDS.some((id) => current[id] !== SHORTCUTS[id].combo);

  const save = (next: Partial<Record<string, string>>) => update((d) => ({ ...d, settings: { ...d.settings, shortcuts: next } }));
  const setCombo = (id: ShortcutId, value: string) => {
    const next = { ...custom };
    if (value === SHORTCUTS[id].combo) delete next[id];
    else next[id] = value;
    save(next);
  };

  return (
    <div className="panel-card">
      <div className="section-head">
        <div>
          <h3>Keyboard shortcuts</h3>
          <p className="hint">Click a shortcut, then press the new keys. Use Ctrl or Alt with a key. Esc cancels.</p>
        </div>
        <button type="button" className="btn btn-ghost" disabled={!changed} onClick={() => (save({}), setMsg(null))}>
          <RotateCcw size={15} /> Reset all
        </button>
      </div>
      <p className="hint list-keys">
        In a project’s key list: <Keys combo="Up" /> <Keys combo="Down" /> move between keys, <Keys combo="Enter" /> opens one, <Keys combo="C" />{' '}
        copies its value and <Keys combo="U" /> its username.
      </p>
      <ul className="shortcut-list">
        {SHORTCUT_IDS.map((id) => {
          const isRec = recording === id;
          const error = msg?.id === id ? msg.text : null;
          return (
            <li key={id} data-error={!!error || undefined}>
              <div className="shortcut-label">
                <span>{SHORTCUTS[id].label}</span>
                {error && <span className="error-text">{error}</span>}
              </div>
              <button
                type="button"
                className="shortcut-recorder"
                data-recording={isRec || undefined}
                title={isRec ? 'Press the new keys. Esc cancels.' : 'Click to change'}
                aria-label={
                  isRec ? `Press the new keys for ${SHORTCUTS[id].label}` : `Change the shortcut for ${SHORTCUTS[id].label}, now ${current[id]}`
                }
                onClick={() => {
                  setMsg(null);
                  setRecording(isRec ? null : id);
                }}
                onBlur={() => isRec && setRecording(null)}
                onKeyDown={(e) => {
                  if (!isRec) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.key === 'Escape') return setRecording(null);
                  const pressed = comboOf(e.nativeEvent);
                  if (!pressed) return;
                  const problem = comboProblem(pressed, id, current);
                  if (problem) return setMsg({ id, text: problem });
                  setCombo(id, pressed);
                  setMsg(null);
                  setRecording(null);
                }}
              >
                {isRec ? <span className="recording">Press keys…</span> : <Keys combo={current[id]} />}
              </button>
              <button
                type="button"
                className="btn btn-ghost shortcut-reset"
                disabled={current[id] === SHORTCUTS[id].combo}
                onClick={() => setCombo(id, SHORTCUTS[id].combo)}
                title={`Back to ${SHORTCUTS[id].combo}`}
              >
                Reset
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SettingsPage({ section, onSection }: { section: SettingsSection; onSection: (s: SettingsSection) => void }) {
  return (
    <div className="settings-page">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="hint">Everything here stays on this PC.</p>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={s.id === section} onClick={() => onSection(s.id)}>
              {s.icon}
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === 'environments' && <EnvironmentsSection />}
          {section === 'backup' && <BackupSection />}
          {section === 'security' && <SecuritySection />}
          {section === 'shortcuts' && <ShortcutsSection />}
          {section === 'reset' && <ResetSection onBackup={() => onSection('backup')} />}
          {section === 'guide' && <GuideSection onGo={onSection} />}
          {section === 'about' && <AboutSection onGo={onSection} />}
        </div>
      </div>
    </div>
  );
}
