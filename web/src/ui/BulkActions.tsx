import { CopyPlus, FolderInput, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { planTransfers, type BulkTransfer, type Item, type Project, type Transfer } from '../vault/model';
import { Confirm } from './Dialogs';
import { Modal } from './parts';

const label = (i: { title: string; env: string | null }) => (i.env ? `${i.title} (${i.env})` : i.title);

/** Shown in place of the table's toolbar while keys are ticked. */
export function SelectionBar({
  count,
  canMove,
  onMove,
  onDuplicate,
  onDelete,
  onClear,
}: {
  count: number;
  canMove: boolean;
  onMove: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="table-tools selection-bar" role="toolbar" aria-label="Selected keys">
      <span className="selection-count num" aria-live="polite">
        {count} selected
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onMove}
        disabled={!canMove}
        title={canMove ? undefined : 'Create another project to move keys to'}
      >
        <FolderInput size={15} aria-hidden /> Move
      </button>
      <button type="button" className="btn btn-ghost" onClick={onDuplicate}>
        <CopyPlus size={15} aria-hidden /> Duplicate
      </button>
      <button type="button" className="btn btn-ghost btn-ghost-danger" onClick={onDelete}>
        <Trash2 size={15} aria-hidden /> Delete
      </button>
      <span className="tools-spacer" />
      <button type="button" className="btn btn-ghost" onClick={onClear}>
        <X size={15} aria-hidden /> Clear selection
      </button>
    </div>
  );
}

/** Moves or duplicates the ticked keys into one project, and says up front which ones get renamed. */
export function TransferManyDialog({
  mode,
  items,
  from,
  projects,
  envs,
  onDone,
  onClose,
}: {
  mode: Transfer['mode'];
  items: Item[];
  from: Project;
  projects: Project[];
  envs: string[];
  onDone: (plan: Transfer[]) => void;
  onClose: () => void;
}) {
  const targets = mode === 'move' ? projects.filter((p) => p.id !== from.id) : projects;
  const [toId, setToId] = useState(targets[0]?.id ?? '');
  const [env, setEnv] = useState<BulkTransfer['env']>('keep');
  const plan = planTransfers(projects, { mode, fromProjectId: from.id, itemIds: items.map((i) => i.id), toProjectId: toId, env });
  const renamed = plan.filter((t) => t.title !== items.find((i) => i.id === t.itemId)?.title);
  const verb = mode === 'move' ? 'Move' : 'Duplicate';
  const n = items.length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (plan.length) onDone(plan);
  }

  return (
    <Modal
      title={`${verb} ${n} key${n === 1 ? '' : 's'}`}
      description={
        mode === 'move'
          ? `From ${from.name}. They keep their values and history.`
          : `New keys with the same values. The ones in ${from.name} stay as they are.`
      }
      className="modal-sm"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="transfer-many-form" className="btn btn-primary" disabled={!plan.length}>
            {mode === 'move' ? <FolderInput size={15} aria-hidden /> : <CopyPlus size={15} aria-hidden />} {verb} {n}
          </button>
        </>
      }
    >
      <form id="transfer-many-form" onSubmit={submit} className="item-form">
        <div className="form-row">
          <label className="field-label" htmlFor="many-project">
            To project
          </label>
          <select id="many-project" className="select" value={toId} onChange={(e) => setToId(e.target.value)} data-autofocus>
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === from.id ? `${p.name} (this project)` : p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="field-label" htmlFor="many-env">
            Environment
          </label>
          <select
            id="many-env"
            className="select"
            value={env === 'keep' ? 'keep' : (env ?? '')}
            onChange={(e) => setEnv(e.target.value === 'keep' ? 'keep' : e.target.value || null)}
          >
            <option value="keep">Keep each key’s own</option>
            {envs.map((x) => (
              <option key={x} value={x}>
                All to {x}
              </option>
            ))}
            <option value="">All to No environment</option>
          </select>
        </div>
        {renamed.length > 0 && (
          <div className="rename-note" role="status">
            <p>
              {renamed.length === 1 ? 'One name is' : `${renamed.length} names are`} already used there, so{' '}
              {renamed.length === 1 ? 'it gets' : 'they get'} a new one:
            </p>
            <ul>
              {renamed.slice(0, 5).map((t) => (
                <li key={t.itemId}>
                  {items.find((i) => i.id === t.itemId)?.title} → <strong>{t.title}</strong>
                  {t.env ? ` (${t.env})` : ''}
                </li>
              ))}
              {renamed.length > 5 && <li>and {renamed.length - 5} more</li>}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  );
}

/** One confirmation for deleting the ticked keys, naming them. */
export function DeleteManyDialog({ items, onConfirm, onClose }: { items: Item[]; onConfirm: () => void; onClose: () => void }) {
  const n = items.length;
  const prod = items.filter((i) => !!i.env && /^(prod|production|live)$/i.test(i.env)).length;
  return (
    <Confirm
      title={`Delete ${n} key${n === 1 ? '' : 's'}?`}
      warning={prod ? `${prod === 1 ? 'One is a prod key' : `${prod} are prod keys`}.` : undefined}
      confirmLabel={`Delete ${n}`}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {items.slice(0, 5).map(label).join(', ')}
      {n > 5 ? ` and ${n - 5} more` : ''} will be removed from your vault. Backups you’ve already saved still contain them.
    </Confirm>
  );
}
