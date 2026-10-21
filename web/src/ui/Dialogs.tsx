import { Check, CopyPlus, FolderInput, FolderOpen, ShieldAlert, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { openBackupFolder, saveBackup } from '../storage/host-api';
import { exportProject } from '../vault/backup-io';
import { newId, now, type Item, type Project, type Transfer } from '../vault/model';
import { useClipboard } from './clipboard';
import { PasswordInput } from './Gate';
import { BusyForm, FormNote, Modal } from './parts';

/** Asks before something is removed. Cancel has focus, so a stray Enter keeps it. */
export function Confirm({
  title,
  description,
  warning,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  warning?: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      description={description}
      className="modal-sm"
      labelledBy="confirm-h"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger-solid" onClick={onConfirm}>
            <Trash2 size={15} /> {confirmLabel}
          </button>
        </>
      }
    >
      {warning && (
        <p className="confirm-warn">
          <ShieldAlert size={16} aria-hidden /> {warning}
        </p>
      )}
      <p className="confirm-text">{children}</p>
    </Modal>
  );
}

export function ConfirmDelete({
  name,
  kind,
  env,
  onConfirm,
  onClose,
}: {
  name: string;
  kind: string;
  env: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const prod = !!env && /^(prod|production|live)$/i.test(env);
  return (
    <Confirm
      title={`Delete “${name}”?`}
      description={`${kind} · ${env ?? 'No environment'}`}
      warning={prod ? 'This is a production key.' : undefined}
      confirmLabel="Delete key"
      onConfirm={onConfirm}
      onClose={onClose}
    >
      It’s removed from your vault and can’t be undone here. Backups you’ve already saved still contain it.
    </Confirm>
  );
}

/** Create a project, or rename or delete it. Environments come from the shared list in Settings. */
export function ProjectDialog({
  project,
  isDefault,
  onSave,
  onDelete,
  onClose,
}: {
  project: Project | null;
  isDefault: boolean;
  onSave: (p: Project, makeDefault: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [nameTouched, setNameTouched] = useState(false);
  const [makeDefault, setMakeDefault] = useState(isDefault);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const empty = nameTouched && !name.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setNameTouched(true);
    setBusy(true);
    const stamp = now();
    onSave(
      project
        ? { ...project, name: name.trim(), updatedAt: stamp }
        : { id: newId(), name: name.trim(), items: [], createdAt: stamp, updatedAt: stamp },
      makeDefault,
    );
  }

  return (
    <Modal
      title={project ? 'Edit project' : 'New project'}
      description="One app or service, with its keys across your environments."
      className="modal-sm"
      onClose={onClose}
      footer={
        <>
          {project &&
            (confirmDelete ? (
              <button type="button" className="btn btn-danger" onClick={() => onDelete(project.id)}>
                <Trash2 size={15} /> Delete {project.items.length} value{project.items.length === 1 ? '' : 's'} for good
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-ghost-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> Delete
              </button>
            ))}
          <span className="spacer" />
          <button type="submit" form="project-form" className="btn btn-primary" disabled={busy || !name.trim()}>
            {project ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <BusyForm busy={busy} id="project-form" onSubmit={submit} className="project-form">
        <div>
          <label className="field-label" htmlFor="project-name">
            Project name
          </label>
          <input
            id="project-name"
            className="input input-lg"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            data-autofocus
            placeholder="e.g. Billing API"
            autoComplete="off"
            maxLength={80}
            aria-invalid={empty}
          />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={makeDefault} disabled={isDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          <span className="checkbox-box" aria-hidden>
            <Check size={10} strokeWidth={3.5} />
          </span>
          <span className="checkbox-title">Open Developer Keys on this project</span>
        </label>
      </BusyForm>
    </Modal>
  );
}

const taken = (p: Project | undefined, title: string, env: string | null, except?: string) =>
  !!p?.items.some((i) => i.id !== except && i.env === env && i.title.trim().toLowerCase() === title.trim().toLowerCase());

/**
 * Moves or duplicates one key into a project. The name and environment start as the key's own and
 * can be changed, so "duplicate dev into stg" is one step. A clash with a key already there blocks saving.
 */
export function TransferDialog({
  mode,
  item,
  from,
  projects,
  envs,
  onDone,
  onClose,
}: {
  mode: Transfer['mode'];
  item: Item;
  from: Project;
  projects: Project[];
  envs: string[];
  onDone: (t: Transfer) => void;
  onClose: () => void;
}) {
  const targets = mode === 'move' ? projects.filter((p) => p.id !== from.id) : projects;
  const [toId, setToId] = useState(targets[0]?.id ?? '');
  const [env, setEnv] = useState(item.env);
  // Duplicating into the same place needs a new name; suggest "… copy".
  const [title, setTitle] = useState(() => {
    const first = targets[0];
    if (!taken(first, item.title, item.env)) return item.title;
    let n = 1;
    const next = () => `${item.title} copy${n === 1 ? '' : ` ${n}`}`;
    while (taken(first, next(), item.env)) n++;
    return next();
  });
  const to = projects.find((p) => p.id === toId);
  const clash = taken(to, title, env, mode === 'move' ? item.id : undefined);
  const problem = !title.trim()
    ? 'Give it a name.'
    : clash
      ? `“${title.trim()}” already exists in ${to?.name ?? 'that project'} (${env ?? 'No environment'}).`
      : null;
  const verb = mode === 'move' ? 'Move' : 'Duplicate';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!to || problem) return;
    onDone({ mode, fromProjectId: from.id, itemId: item.id, toProjectId: to.id, title: title.trim(), env });
  }

  return (
    <Modal
      title={`${verb} “${item.title}”`}
      description={
        mode === 'move' ? `From ${from.name}. It keeps its values and history.` : `A new key with the same values. The one in ${from.name} stays as it is.`
      }
      className="modal-sm"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="transfer-form" className="btn btn-primary" disabled={!to || !!problem}>
            {mode === 'move' ? <FolderInput size={15} aria-hidden /> : <CopyPlus size={15} aria-hidden />} {verb}
          </button>
        </>
      }
    >
      <form id="transfer-form" onSubmit={submit} className="item-form">
        <div className="form-row">
          <label className="field-label" htmlFor="transfer-project">
            To project
          </label>
          <select id="transfer-project" className="select" value={toId} onChange={(e) => setToId(e.target.value)} data-autofocus>
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === from.id ? `${p.name} (this project)` : p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="transfer-env">
            Environment
          </label>
          <select id="transfer-env" className="select" value={env ?? ''} onChange={(e) => setEnv(e.target.value || null)}>
            {[...new Set([...envs, ...(item.env ? [item.env] : [])])].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
            <option value="">No environment</option>
          </select>
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="transfer-title">
            Name
          </label>
          <div>
            <input
              id="transfer-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
              aria-invalid={!!problem}
              aria-describedby={problem ? 'transfer-error' : undefined}
            />
            {problem && (
              <p id="transfer-error" className="error-text field-error" aria-live="polite">
                {problem}
              </p>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Asks for a file password twice. Shared by backup and share exports. */
export function useFilePassword() {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const problem = pw.length < 8 ? 'Use at least 8 characters.' : pw !== again ? 'The two passwords don’t match.' : null;
  const rule = pw.length < 8 ? 'The file password needs at least 8 characters.' : again && pw !== again ? 'The two passwords don’t match.' : null;
  const fields = (prefix: string) => (
    <>
      <FormNote
        rule={rule}
        touched={pw.length > 0}
        hint={
          prefix === 'backup'
            ? 'At least 8 characters. You’ll need it to restore this backup.'
            : 'At least 8 characters. Share it another way, not in the same chat.'
        }
      />
      <div className="row-2">
        <div>
          <label className="field-label" htmlFor={`${prefix}-pw`}>
            File password
          </label>
          <PasswordInput id={`${prefix}-pw`} value={pw} onChange={setPw} autoComplete="new-password" invalid={pw.length > 0 && pw.length < 8} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${prefix}-again`}>
            Type it again
          </label>
          <PasswordInput
            id={`${prefix}-again`}
            value={again}
            onChange={setAgain}
            autoComplete="new-password"
            invalid={again.length > 0 && again !== pw}
          />
        </div>
      </div>
    </>
  );
  return { pw, problem, fields, reset: () => (setPw(''), setAgain('')) };
}

/** Exports one project, or one of its environments, as an encrypted file for a teammate. */
/** One toggle in the share picker: an environment, or the keys with none. */
function ShareChip({
  on,
  onToggle,
  children,
  count,
  prod,
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  count: number;
  prod?: boolean;
}) {
  return (
    <button type="button" className="share-chip" aria-pressed={on} data-prod={prod || undefined} onClick={onToggle}>
      <span className="share-chip-mark" aria-hidden>
        {on ? <Check size={12} strokeWidth={3} /> : prod ? <ShieldAlert size={12} /> : null}
      </span>
      {children}
      <span className="share-chip-count num">{count}</span>
    </button>
  );
}

export function ShareDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const envs = [...new Set(project.items.map((i) => i.env).filter((e): e is string => !!e))];
  const count = (env: string | null) => project.items.filter((i) => i.env === env).length;
  const noEnvCount = count(null);
  const [picked, setPicked] = useState<string[]>(envs);
  const [withNoEnv, setWithNoEnv] = useState(noEnvCount > 0);
  const pass = useFilePassword();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { notify } = useClipboard();
  const keep: (string | null)[] = [...picked, ...(withNoEnv ? [null] : [])];
  const sharing = project.items.filter((i) => keep.includes(i.env)).length;
  const whole = sharing === project.items.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pass.problem) return setResult({ ok: false, text: pass.problem });
    setBusy(true);
    try {
      const bytes = await exportProject(project, pass.pw, whole ? undefined : keep);
      const suffix = whole ? '' : `-${[...picked, ...(withNoEnv ? ['no-env'] : [])].join('-')}`;
      const path = await saveBackup(bytes, `${project.name}${suffix}`);
      setResult({ ok: true, text: '' });
      notify(`Saved to ${path}. Send the file to your teammate, and tell them the password another way (a call, not the same chat).`);
      pass.reset();
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <Modal
      title={`Share ${project.name}`}
      description="Creates an encrypted file your teammate can import into their own Developer Keys."
      onClose={onClose}
      footer={
        <>
          {result?.ok && (
            <button type="button" className="btn btn-ghost" onClick={() => openBackupFolder()}>
              <FolderOpen size={15} /> Show file
            </button>
          )}
          <span className="spacer" />
          <button type="submit" form="share-form" className="btn btn-primary" disabled={busy || !!pass.problem || sharing === 0}>
            {busy ? 'Encrypting…' : 'Create share file'}
          </button>
        </>
      }
    >
      <BusyForm busy={busy} id="share-form" onSubmit={submit} style={{ display: 'grid', gap: 18 }}>
        {result && !result.ok && (
          <p className="error-text" role="alert">
            {result.text}
          </p>
        )}
        <div className="share-pick" role="group" aria-labelledby="share-pick-h">
          <div className="share-pick-head">
            <span id="share-pick-h" className="field-label">
              What to share
            </span>
            <span className={sharing === 0 ? 'error-text share-sum' : 'share-sum'} aria-live="polite">
              {sharing === 0 ? 'Pick at least one' : whole ? `All ${sharing} keys` : `${sharing} of ${project.items.length} keys`}
            </span>
          </div>
          <div className="share-chips">
            <ShareChip
              on={whole}
              onToggle={() => {
                setPicked(envs);
                setWithNoEnv(noEnvCount > 0);
              }}
              count={project.items.length}
            >
              Everything
            </ShareChip>
            <span className="share-chips-sep" aria-hidden />
            {envs.map((env) => (
              <ShareChip
                key={env}
                on={picked.includes(env)}
                prod={/^(prod|production|live)$/i.test(env)}
                onToggle={() =>
                  setPicked(picked.includes(env) ? picked.filter((x) => x !== env) : envs.filter((x) => x === env || picked.includes(x)))
                }
                count={count(env)}
              >
                {env}
              </ShareChip>
            ))}
            {noEnvCount > 0 && (
              <ShareChip on={withNoEnv} onToggle={() => setWithNoEnv(!withNoEnv)} count={noEnvCount}>
                No environment
              </ShareChip>
            )}
          </div>
        </div>
        {pass.fields('share')}
      </BusyForm>
    </Modal>
  );
}
