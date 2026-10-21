import { Eye, EyeOff, PencilLine, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { orderedFields, typeInfo } from '../vault/item-types';
import type { Field, Item, Project } from '../vault/model';
import { expiry, timeAgo } from './format';
import { CopyButton, Modal, TotpCode } from './parts';

function PreviewField({ field, item }: { field: Field; item: Item }) {
  const [shown, setShown] = useState(false);
  const label = `${item.title} ${field.label.toLowerCase()}`;
  if (field.kind === 'totp') {
    return (
      <div className="preview-row">
        <dt>{field.label === 'Secret' ? '2FA code' : `${field.label} code`}</dt>
        <dd>
          <TotpCode secret={field.value} label={item.title} />
        </dd>
      </div>
    );
  }
  const masked = field.secret && !shown;
  return (
    <div className="preview-row" data-multiline={field.kind === 'multiline' || undefined}>
      <dt>{field.label}</dt>
      <dd>
        <span className="preview-value" data-masked={masked || undefined}>
          {masked ? '••••••••••••' : field.value}
        </span>
        <span className="row-tools">
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
          <CopyButton value={field.value} label={label} env={item.env} />
        </span>
      </dd>
    </div>
  );
}

/** Read-only view of one key, from search or a click on its row: every field with its own copy button. */
export function ItemPreview({
  project,
  item,
  closeAfter,
  onEdit,
  onClose,
}: {
  project: Project;
  item: Item;
  /** Seconds until the card closes itself (opened from search, with the value already copied). */
  closeAfter?: number;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(closeAfter ?? 0);
  useEffect(() => {
    if (!closeAfter) return;
    const until = Date.now() + closeAfter * 1000;
    const timer = window.setInterval(() => {
      const s = Math.ceil((until - Date.now()) / 1000);
      if (s <= 0) {
        window.clearInterval(timer);
        onClose();
      } else setLeft(s);
    }, 250);
    return () => window.clearInterval(timer);
  }, [closeAfter, onClose]);
  const fields = orderedFields(item.type, item.fields).filter((f) => f.value);
  const prod = !!item.env && /^(prod|production|live)$/i.test(item.env);
  const exp = expiry(item.expiresAt);
  return (
    <Modal
      className="modal-preview"
      title={item.title}
      description={`${project.name} · ${typeInfo(item.type).label} · Updated ${timeAgo(item.updatedAt)}`}
      onClose={onClose}
      footer={
        <>
          {closeAfter ? (
            <span className="foot-meta num" aria-live="off">
              Closes in {left}s
            </span>
          ) : null}
          <span className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={onEdit} data-autofocus>
            <PencilLine size={15} /> Edit
          </button>
        </>
      }
    >
      <div className="preview-tags">
        <span className="env-tag" data-prod={prod || undefined}>
          {prod && <ShieldAlert size={12} aria-hidden />}
          {item.env ?? 'No environment'}
        </span>
        {exp && <span className={`pill ${exp.tone === 'expired' ? 'pill-danger' : exp.tone === 'warn' ? 'pill-warn' : ''}`}>{exp.label}</span>}
        {item.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
      {fields.length ? (
        <dl className="preview-list">
          {fields.map((f) => (
            <PreviewField key={f.id} field={f} item={item} />
          ))}
        </dl>
      ) : (
        <p className="muted">This key has no values yet. Press Edit to add them.</p>
      )}
    </Modal>
  );
}
