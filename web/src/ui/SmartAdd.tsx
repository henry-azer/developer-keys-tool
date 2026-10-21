import { ArrowLeft, Check, Eye, EyeOff, Sparkles, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { aiAsk } from '../storage/host-api';
import { ITEM_TYPES } from '../vault/item-types';
import { newId, now, type Field, type Item, type ItemType, type Project } from '../vault/model';
import { buildPrompt, parseMappings } from '../vault/smart-add';
import { BusyForm, Modal } from './parts';

interface Draft {
  id: string;
  /** Unticked keys stay on screen but aren't saved. */
  include: boolean;
  title: string;
  type: ItemType;
  env: string | null;
  fields: Field[];
}

function ValueInput({ field, onChange }: { field: Field; onChange: (f: Field) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="input-group">
      <input
        className="input"
        type={field.secret && !shown ? 'password' : 'text'}
        value={field.value}
        onChange={(e) => onChange({ ...field, value: e.target.value })}
        aria-label={field.label}
        autoComplete="off"
        spellCheck={false}
      />
      {field.secret && (
        <button
          type="button"
          className="icon-btn"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${field.label}` : `Show ${field.label}`}
        >
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </div>
  );
}

const sameKey = (a: { title: string; env: string | null }, b: { title: string; env: string | null }) =>
  a.env === b.env && a.title.trim().toLowerCase() === b.title.trim().toLowerCase();

/** One suggested key: name, type, environment and its fields, all editable. */
function DraftCard({
  draft,
  index,
  many,
  envs,
  problem,
  onChange,
}: {
  draft: Draft;
  index: number;
  many: boolean;
  envs: string[];
  problem: string | null;
  onChange: (d: Draft) => void;
}) {
  const id = (part: string) => `smart-${part}-${draft.id}`;
  const setField = (i: number, f: Field) => onChange({ ...draft, fields: draft.fields.map((x, j) => (j === i ? f : x)) });
  return (
    <section className={many ? 'smart-key' : 'item-form'} data-off={!draft.include || undefined} aria-label={draft.title || `Key ${index + 1}`}>
      <div className="form-row">
        {many ? (
          <label className="checkbox smart-include">
            <input type="checkbox" checked={draft.include} onChange={(e) => onChange({ ...draft, include: e.target.checked })} />
            <span className="checkbox-box" aria-hidden>
              <Check size={10} strokeWidth={3.5} />
            </span>
            <span className="field-label">Name</span>
          </label>
        ) : (
          <label className="field-label" htmlFor={id('title')}>
            Name
          </label>
        )}
        <div>
          <input
            id={id('title')}
            className="input"
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            aria-label={many ? `Name of key ${index + 1}` : undefined}
            aria-invalid={draft.include && !!problem}
            data-autofocus={index === 0 || undefined}
          />
          {draft.include && problem && <p className="error-text field-error">{problem}</p>}
        </div>
      </div>
      <div className="form-row">
        <label className="field-label" htmlFor={id('type')}>
          Type
        </label>
        <select id={id('type')} className="select" value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value as ItemType })}>
          {ITEM_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label className="field-label" htmlFor={id('env')}>
          Environment
        </label>
        <select id={id('env')} className="select" value={draft.env ?? ''} onChange={(e) => onChange({ ...draft, env: e.target.value || null })}>
          {envs.map((env) => (
            <option key={env} value={env}>
              {env}
            </option>
          ))}
          <option value="">No environment</option>
        </select>
      </div>

      {draft.fields.map((f, i) => (
        <div key={f.id} className="form-row smart-field">
          <input
            className="field-label-input"
            value={f.label}
            onChange={(e) => setField(i, { ...f, label: e.target.value })}
            aria-label="Field name"
          />
          <div className="smart-value">
            <ValueInput field={f} onChange={(nf) => setField(i, nf)} />
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              onClick={() => onChange({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })}
              aria-label={`Remove ${f.label}`}
              title="Remove"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Smart add: paste anything, Claude (through the person's own Claude Code
 * sign-in) maps it to one key or a list of keys, and the person checks them before they're saved.
 */
export function SmartAdd({
  projects,
  envs,
  currentProjectId,
  onSave,
  onClose,
}: {
  projects: Project[];
  envs: string[];
  currentProjectId: string | null;
  onSave: (projectId: string, items: Item[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [projectId, setProjectId] = useState('');

  async function map(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const names = projects.map((p) => p.name);
      const keys = parseMappings(await aiAsk(buildPrompt(text.trim(), names, envs)), names, envs);
      const named = keys.find((k) => k.project)?.project;
      const project = projects.find((p) => p.name === named) ?? projects.find((p) => p.id === currentProjectId) ?? projects[0];
      setProjectId(project.id);
      setDrafts(keys.map((k) => ({ id: newId(), include: true, title: k.title, type: k.type, env: k.env, fields: k.fields })));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  const project = projects.find((p) => p.id === projectId);
  const chosen = drafts?.filter((d) => d.include) ?? [];
  // A key can't take a name already used in that environment, by the project or by another key in this list.
  const problemOf = (d: Draft): string | null => {
    if (!d.title.trim()) return 'Give it a name.';
    if (project?.items.some((i) => sameKey(i, d)))
      return `“${d.title.trim()}” already exists${d.env ? ` in ${d.env}` : ''}. Rename it or pick another environment.`;
    if (chosen.some((o) => o !== d && sameKey(o, d))) return `Another key here is also “${d.title.trim()}”${d.env ? ` in ${d.env}` : ''}.`;
    return null;
  };
  const blocked = chosen.length === 0 || chosen.some((d) => problemOf(d));

  function save(e: FormEvent) {
    e.preventDefault();
    if (!drafts || blocked) return;
    const stamp = now();
    onSave(
      projectId,
      chosen.map((d) => ({
        id: newId(),
        type: d.type,
        title: d.title.trim(),
        env: d.env,
        fields: d.fields.filter((f) => f.label.trim() && f.value),
        tags: [],
        expiresAt: null,
        favorite: false,
        createdAt: stamp,
        updatedAt: stamp,
      })),
    );
  }

  if (!drafts) {
    return (
      <Modal
        key="paste"
        className="modal-lg"
        title="Smart add"
        description="Paste the details of the account or key you want to save, or a list of them, like one database per environment."
        onClose={onClose}
        footer={
          <>
            <span className="foot-meta">Ctrl+Enter maps it. Nothing is saved until you press Save.</span>
            <span className="spacer" />
            <button type="submit" form="smart-form" className="btn btn-primary" disabled={busy || !text.trim()}>
              <Sparkles size={15} /> {busy ? 'Reading…' : 'Map with Claude'}
            </button>
          </>
        }
      >
        <BusyForm busy={busy} id="smart-form" onSubmit={map} className="smart-form">
          <textarea
            className="textarea smart-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) map();
            }}
            placeholder={'Staging admin portal\nhttps://admin.example.com\nhenry-azer\npassword\n\nor a list:\n\nBilling DB (user billing)\ndev  db-dev.local   pw1\nprod db-prod.local  pw2'}
            spellCheck={false}
            data-autofocus
            aria-label="Pasted text"
          />
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </BusyForm>
      </Modal>
    );
  }

  const many = drafts.length > 1;
  return (
    <Modal
      key="review"
      className="modal-lg"
      title={many ? `Check ${drafts.length} keys` : 'Check and save'}
      description={many ? 'Claude found several keys. Untick any you don’t want, and change anything before saving.' : 'Claude’s suggestion. Change anything before saving.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => setDrafts(null)}>
            <ArrowLeft size={15} /> Back
          </button>
          <span className="spacer" />
          <button type="submit" form="smart-save" className="btn btn-primary" disabled={blocked}>
            {chosen.length === 1 ? 'Save key' : `Save ${chosen.length} keys`}
          </button>
        </>
      }
    >
      <form id="smart-save" onSubmit={save} className="item-form">
        <div className="form-row">
          <label className="field-label" htmlFor="smart-project">
            Project
          </label>
          <select id="smart-project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-divider" role="presentation" />

        {drafts.map((d, i) => (
          <DraftCard
            key={d.id}
            draft={d}
            index={i}
            many={many}
            envs={envs}
            problem={problemOf(d)}
            onChange={(next) => setDrafts(drafts.map((x) => (x.id === next.id ? next : x)))}
          />
        ))}
      </form>
    </Modal>
  );
}
