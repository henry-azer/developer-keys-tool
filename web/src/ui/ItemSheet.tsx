import { Check, Copy, Eye, EyeOff, Trash2, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { fieldsFor, itemAsText, ITEM_TYPES, orderedFields, typeInfo } from '../vault/item-types';
import { newId, now, type Field, type Item, type ItemType, type Project } from '../vault/model';
import { generateSecret, timeAgo } from './format';
import { ConfirmDelete } from './Dialogs';
import { useClipboard } from './clipboard';
import { BusyForm, CopyButton, Modal, TotpCode } from './parts';

/** What the sheet opens on: an existing item, or a new one with some fields prefilled. */
export type SheetTarget =
  { mode: 'edit'; projectId: string; itemId: string } | { mode: 'new'; projectId: string; type?: ItemType; title?: string; env?: string | null };

function FieldEditor({
  field,
  onChange,
  onRemove,
  custom,
  itemTitle,
}: {
  field: Field;
  onChange: (f: Field) => void;
  onRemove?: () => void;
  custom: boolean;
  itemTitle: string;
}) {
  const [shown, setShown] = useState(!field.secret);
  const id = `f-${field.id}`;
  const masked = field.secret && !shown;
  const canGenerate = field.secret && field.kind === 'text' && /password|token|secret|key|value/i.test(field.label);

  return (
    <div className="field form-row" data-multiline={field.kind === 'multiline' || undefined}>
      <div className="field-tools">
        {custom ? (
          <input
            className="field-label-input"
            value={field.label}
            onChange={(e) => onChange({ ...field, label: e.target.value })}
            aria-label="Field name"
            placeholder="Field name"
          />
        ) : (
          <label className="field-label" htmlFor={id}>
            {field.label}
          </label>
        )}
        <span className="row-tools">
          {custom && (
            <label className="check">
              <input type="checkbox" checked={field.secret} onChange={(e) => onChange({ ...field, secret: e.target.checked })} />
              Secret
            </label>
          )}
          {onRemove && (
            <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove ${field.label || 'field'}`}>
              <Trash2 size={15} />
            </button>
          )}
        </span>
      </div>
      <div className="input-group">
        {field.kind === 'multiline' ? (
          <textarea
            id={id}
            className="textarea"
            value={field.value}
            data-masked={masked}
            spellCheck={false}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
          />
        ) : (
          <input
            id={id}
            className="input"
            type={masked ? 'password' : field.kind === 'url' ? 'url' : 'text'}
            inputMode={field.kind === 'number' ? 'numeric' : undefined}
            value={field.value}
            autoComplete="off"
            spellCheck={false}
            placeholder={field.kind === 'totp' ? 'Base32 secret or otpauth:// link' : field.label === 'Username' ? 'e.g. henry-azer' : undefined}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
          />
        )}
        {field.secret && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? `Hide ${field.label}` : `Show ${field.label}`}
            aria-pressed={shown}
          >
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
        {canGenerate && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => onChange({ ...field, value: generateSecret() })}
            aria-label={`Generate a random ${field.label}`}
            title="Generate a random value"
          >
            <WandSparkles size={16} />
          </button>
        )}
        <CopyButton value={field.value} label={`${itemTitle} ${field.label}`} />
      </div>
      {field.kind === 'totp' && field.value && (
        <div style={{ marginTop: 8 }}>
          <TotpCode secret={field.value} label={itemTitle} />
        </div>
      )}
    </div>
  );
}

/** Copies the whole key (name, environment, every filled field) as labelled lines, exactly as it's shown in the sheet. */
function CopyAllButton({ item }: { item: Item }) {
  const { copy } = useClipboard();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={!item.fields.some((f) => f.value)}
      title="Copy the name and every field as text"
      onClick={async () => {
        if (!(await copy(itemAsText(item), `all of ${item.title.trim() || 'this key'}`, item.env))) return;
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function ItemSheet({
  project,
  envs,
  target,
  onSave,
  onDelete,
  onClose,
}: {
  project: Project;
  /** The shared environment list from Settings. */
  envs: string[];
  target: SheetTarget;
  onSave: (item: Item) => void;
  onDelete: (itemId: string) => void;
  onClose: () => void;
}) {
  const existing = target.mode === 'edit' ? project.items.find((i) => i.id === target.itemId) : undefined;
  const initialType: ItemType = existing?.type ?? (target.mode === 'new' ? target.type : undefined) ?? 'login';

  const [draft, setDraft] = useState<Item>(
    () =>
      (existing && { ...existing, fields: orderedFields(existing.type, existing.fields) }) ?? {
        id: newId(),
        type: initialType,
        title: target.mode === 'new' ? (target.title ?? '') : '',
        // No environment unless the list was filtered to one.
        env: target.mode === 'new' && target.env !== undefined ? target.env : null,
        fields: fieldsFor(initialType),
        tags: [],
        expiresAt: null,
        favorite: false,
        createdAt: now(),
        updatedAt: now(),
      },
  );
  const [titleTouched, setTitleTouched] = useState(false);
  const [tagText, setTagText] = useState(() => draft.tags.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const info = typeInfo(draft.type);
  const templateLabels = new Set(info.fields.map((f) => f.label));

  function setType(type: ItemType) {
    // Keep values the user already typed into fields that exist in both types.
    const typed = new Map(draft.fields.filter((f) => f.value).map((f) => [f.label, f.value]));
    const fields = fieldsFor(type).map((f) => ({ ...f, value: typed.get(f.label) ?? '' }));
    setDraft({ ...draft, type, fields, env: typeInfo(type).perEnvironment ? draft.env : null });
  }

  const trimmed = draft.title.trim();
  const clashLive = project.items.some((i) => i.id !== draft.id && i.env === draft.env && i.title.trim().toLowerCase() === trimmed.toLowerCase());
  const nameRule = !trimmed
    ? 'Give it a name, like “Admin login” or “STRIPE_SECRET_KEY”.'
    : clashLive
      ? `“${trimmed}” already exists in ${draft.env ?? 'No environment'}.`
      : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) return setError('Give it a name, like “Admin login” or “STRIPE_SECRET_KEY”.');
    const clash = project.items.find((i) => i.id !== draft.id && i.env === draft.env && i.title.trim().toLowerCase() === title.toLowerCase());
    if (clash) return setError(`“${title}” already exists in ${draft.env ?? 'No environment'}.`);
    setBusy(true);
    const tags = tagText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ ...draft, title, tags, fields: draft.fields.filter((f) => f.label.trim() || f.value), updatedAt: now() });
  }

  const formId = 'item-form';
  const nameProblem = error ?? (titleTouched || clashLive ? nameRule : null);
  return (
    <>
      <Modal
        className="modal-lg"
        title={existing ? existing.title : `New ${info.label.toLowerCase()}`}
        description={
          existing
            ? `${info.label} · ${existing.env ?? 'No environment'} · Updated ${timeAgo(existing.updatedAt)}`
            : 'Everything is encrypted on this PC before it’s saved.'
        }
        onClose={onClose}
        footer={
          <>
            {existing && (
              <button type="button" className="btn btn-ghost btn-ghost-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} /> Delete
              </button>
            )}
            <span className="spacer" />
            <CopyAllButton item={draft} />
            <button type="submit" form={formId} className="btn btn-primary" disabled={busy || !!nameRule}>
              {existing ? 'Save changes' : 'Save key'}
            </button>
          </>
        }
      >
        <BusyForm busy={busy} id={formId} onSubmit={submit} className="item-form">
          <div className="form-row">
            <label className="field-label" htmlFor="item-title">
              Name
            </label>
            <div>
              <input
                id="item-title"
                className="input"
                value={draft.title}
                data-autofocus
                autoComplete="off"
                placeholder={draft.type === 'token' || draft.type === 'custom' ? 'e.g. STRIPE_SECRET_KEY' : 'e.g. Admin login'}
                onChange={(e) => {
                  setDraft({ ...draft, title: e.target.value });
                  setTitleTouched(true);
                  setError(null);
                }}
                aria-invalid={clashLive || (titleTouched && !trimmed)}
                aria-describedby={nameProblem ? 'item-title-error' : undefined}
              />
              {nameProblem && (
                <p id="item-title-error" className="error-text field-error" aria-live="assertive">
                  {nameProblem}
                </p>
              )}
            </div>
          </div>
          <div className="form-row">
            <label className="field-label" htmlFor="item-type">
              Type
            </label>
            <select id="item-type" className="select" value={draft.type} onChange={(e) => setType(e.target.value as ItemType)}>
              {ITEM_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="field-label" htmlFor="item-env">
              Environment
            </label>
            <select id="item-env" className="select" value={draft.env ?? ''} onChange={(e) => setDraft({ ...draft, env: e.target.value || null })}>
              {[...new Set([...envs, ...(draft.env ? [draft.env] : [])])].map((env) => (
                <option key={env} value={env}>
                  {env}
                </option>
              ))}
              <option value="">No environment</option>
            </select>
          </div>

          <div className="form-divider" role="presentation" />

          {draft.fields.map((f, idx) => (
            <FieldEditor
              key={f.id}
              field={f}
              itemTitle={draft.title || info.label}
              custom={!templateLabels.has(f.label) || draft.type === 'custom'}
              onChange={(nf) => setDraft({ ...draft, fields: draft.fields.map((x, i) => (i === idx ? nf : x)) })}
              onRemove={
                !templateLabels.has(f.label) || draft.type === 'custom'
                  ? () => setDraft({ ...draft, fields: draft.fields.filter((_, i) => i !== idx) })
                  : undefined
              }
            />
          ))}

          <div className="form-divider" role="presentation" />

          <div className="form-row">
            <label className="field-label" htmlFor="item-tags">
              Tags
            </label>
            <input
              id="item-tags"
              className="input"
              value={tagText}
              placeholder="payments, ci (comma separated)"
              onChange={(e) => setTagText(e.target.value)}
            />
          </div>
          {info.canExpire && (
            <div className="form-row">
              <label className="field-label" htmlFor="item-exp">
                Expires
              </label>
              <input
                id="item-exp"
                className="input"
                type="date"
                value={draft.expiresAt?.slice(0, 10) ?? ''}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
          )}
        </BusyForm>
      </Modal>
      {existing && confirmDelete && (
        <ConfirmDelete
          name={existing.title}
          kind={info.label}
          env={existing.env}
          onConfirm={() => onDelete(existing.id)}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
