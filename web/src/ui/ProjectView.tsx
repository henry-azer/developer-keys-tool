import { ArrowDown, ArrowUp, ChevronDown, Columns3, CopyPlus, FolderInput, PencilLine, Plus, Search, Share2, ShieldAlert, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { connectionPart, ITEM_TYPES, typeInfo } from '../vault/item-types';
import type { Field, Item, ItemType, Project, Transfer } from '../vault/model';
import { expiry, timeAgo } from './format';
import type { SheetTarget } from './ItemSheet';
import { ConfirmDelete } from './Dialogs';
import { DeleteManyDialog, SelectionBar, TransferManyDialog } from './BulkActions';
import { CopyButton, TotpDisplay, useTotp } from './parts';
import { Keys, useShortcuts } from './shortcuts';

const TOKEN_PREFIX = /^[A-Za-z]{2,8}_(?:(?:test|live|prod|dev)_)?/;
const CONNECTION = /^([a-z][a-z0-9+.-]*:\/\/)(?:[^@/]*@)?([^/:?#]+)/i;

/**
 * A secret's tell without revealing it, so dev and prod differ at a glance.
 * Tokens and keys: known prefix + last 4 (sk_live_••••77de). Connection
 * strings: scheme + host, never the credentials. Everything else (.env
 * blocks, passwords, private keys, notes): dots only.
 */
function maskHint(type: ItemType, value: string): { head: string; tail: string } {
  if (type === 'connection') {
    const m = value.match(CONNECTION);
    return m ? { head: m[1], tail: `@${m[2]}` } : { head: '', tail: '' };
  }
  if ((type === 'token' || type === 'webhook' || type === 'license') && value.length >= 12) {
    return { head: value.match(TOKEN_PREFIX)?.[0] ?? '', tail: value.slice(-4) };
  }
  return { head: '', tail: '' };
}

/**
 * The field the Value column shows: the type's main field, even when it's empty (a server with
 * key login has no password), so Value never repeats what the Username or Host column shows.
 * Items without that field at all (renamed custom fields) fall back to their first value.
 */
function valueField(item: Item): Field | undefined {
  const name = typeInfo(item.type).primary;
  return item.fields.find((f) => f.label === name) ?? item.fields.find((f) => f.value);
}

/** The value column: plain values as-is, secrets masked. */
function Preview({ item }: { item: Item }) {
  const field = valueField(item);
  if (!field || !field.value) return <span className="muted">Empty</span>;
  if (!field.secret) return <>{field.value}</>;
  const { head, tail } = maskHint(item.type, field.value);
  return (
    <>
      {head}
      <span className="masked">{tail ? '••••' : '••••••••'}</span>
      {tail}
    </>
  );
}

const hostOf = (v: string) => {
  try {
    return new URL(v).host || v;
  } catch {
    return v;
  }
};

/** A plain (non-secret) field by any of its usual labels. Its own column shows it whatever the type's main field is. */
function plainField(item: Item, labels: string[]): string | null {
  return item.fields.find((f) => !f.secret && f.value && labels.includes(f.label))?.value ?? null;
}

const usernameOf = (item: Item) => plainField(item, ['Username', 'Account', 'Licensed to']) ?? connectionPart(item, 'user');
const hostValue = (item: Item) => plainField(item, ['Host', 'URL']) ?? connectionPart(item, 'host');
const hostOfItem = (item: Item) => {
  const v = hostValue(item);
  return v ? hostOf(v) : null;
};

const isProd = (env: string) => /^(prod|production|live)$/i.test(env);

function EnvTag({ env }: { env: string | null }) {
  if (!env) return <span className="muted">None</span>;
  return (
    <span className="env-tag" data-prod={isProd(env) || undefined}>
      {isProd(env) && <ShieldAlert size={12} aria-hidden />}
      {env}
    </span>
  );
}

function Expires({ item }: { item: Item }) {
  const e = expiry(item.expiresAt);
  if (!e) return <span className="muted">No expiry</span>;
  if (e.tone === 'ok') return <span>{e.label.replace(/^Expires /, '')}</span>;
  return <span className={`pill ${e.tone === 'expired' ? 'pill-danger' : 'pill-warn'}`}>{e.label}</span>;
}

const Dash = () => <span className="muted">—</span>;

/** A plain value with a copy button; `copy` is what lands on the clipboard when it differs from what's shown. */
function CopyCell({ item, shown, copy, what }: { item: Item; shown: string | null; copy?: string | null; what: string }) {
  if (!shown) return <Dash />;
  return (
    <div className="value-cell">
      <span className="plain-text" title={copy ?? shown}>
        {shown}
      </span>
      <CopyButton value={copy ?? shown} label={`${item.title} ${what}`} env={item.env} />
    </div>
  );
}

function ValueCell({ item }: { item: Item }) {
  const totp = item.fields.find((f) => f.kind === 'totp' && f.value);
  if (totp && item.type === 'totp') return <TotpValue secret={totp.value} label={item.title} env={item.env} />;
  const field = valueField(item);
  if (!field?.value) return <Dash />;
  return (
    <div className="value-cell">
      <span className="value-text">
        <Preview item={item} />
      </span>
      <CopyButton value={field?.value ?? ''} label={`${item.title} ${(field?.label ?? 'value').toLowerCase()}`} env={item.env} />
    </div>
  );
}

function TotpValue({ secret, label, env }: { secret: string; label: string; env: string | null }) {
  const state = useTotp(secret);
  return (
    <div className="value-cell">
      <span className="value-text">
        <TotpDisplay state={state} label={label} />
      </span>
      <CopyButton value={state.code ?? ''} label={`${label} code`} env={env} />
    </div>
  );
}

/** A toolbar button that opens a small panel; closes on Escape or a click outside. */
function Menu({
  label,
  icon,
  count,
  align = 'start',
  children,
}: {
  label: string;
  icon?: ReactNode;
  count?: number;
  align?: 'start' | 'end';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>('.tool-btn')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="tool-btn"
        aria-expanded={open}
        aria-haspopup="true"
        data-active={!!count || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
        {!!count && <span className="tool-count num">{count}</span>}
        <ChevronDown size={14} aria-hidden className="chev" />
      </button>
      {open && (
        <div className="menu-pop" data-align={align} role="group" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuCheck({ checked, onChange, children, aside }: { checked: boolean; onChange: () => void; children: ReactNode; aside?: ReactNode }) {
  return (
    <label className="checkbox menu-item">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="checkbox-box" aria-hidden>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="checkbox-title">{children}</span>
      {aside !== undefined && <span className="menu-aside num">{aside}</span>}
    </label>
  );
}

type ColId = 'type' | 'env' | 'username' | 'host' | 'value' | 'tags' | 'expires' | 'updated' | 'created';
type SortKey = 'name' | ColId;
type Sort = { col: SortKey; dir: 1 | -1 };
const NONE = '\u0000none';

interface Column {
  id: ColId;
  label: string;
  /** Visible until the person hides it. */
  initial: boolean;
  className: string;
  cell: (item: Item) => ReactNode;
  /** Present when the column can be sorted. */
  sortValue?: (item: Item, envRank: (env: string | null) => number) => string | number;
  /** Text the search box matches. */
  text?: (item: Item) => string;
}

const COLUMNS: Column[] = [
  {
    id: 'username',
    label: 'Username',
    initial: true,
    className: 'col-text col-username',
    cell: (i) => <CopyCell item={i} shown={usernameOf(i)} what="username" />,
    sortValue: (i) => usernameOf(i) ?? '\uffff',
    text: (i) => usernameOf(i) ?? '',
  },
  { id: 'value', label: 'Value', initial: true, className: 'col-value', cell: (i) => <ValueCell item={i} /> },
  {
    id: 'host',
    label: 'Host / URL',
    initial: true,
    className: 'col-text',
    cell: (i) => <CopyCell item={i} shown={hostOfItem(i)} copy={hostValue(i)} what="host" />,
    sortValue: (i) => hostOfItem(i) ?? '\uffff',
    text: (i) => hostOfItem(i) ?? '',
  },
  {
    id: 'type',
    label: 'Type',
    initial: true,
    className: 'col-type',
    cell: (i) => typeInfo(i.type).label,
    sortValue: (i) => typeInfo(i.type).label,
    text: (i) => typeInfo(i.type).label,
  },
  {
    id: 'env',
    label: 'Environment',
    initial: true,
    className: 'col-env',
    cell: (i) => <EnvTag env={i.env} />,
    sortValue: (i, rank) => rank(i.env),
    text: (i) => i.env ?? 'none',
  },
  {
    id: 'expires',
    label: 'Expires',
    initial: true,
    className: 'col-date',
    cell: (i) => <Expires item={i} />,
    sortValue: (i) => i.expiresAt ?? '\uffff',
  },
  {
    id: 'created',
    label: 'Created',
    initial: true,
    className: 'col-date',
    cell: (i) => <span className="muted">{timeAgo(i.createdAt)}</span>,
    sortValue: (i) => i.createdAt,
  },
  {
    id: 'updated',
    label: 'Updated',
    initial: false,
    className: 'col-date',
    cell: (i) => <span className="muted">{timeAgo(i.updatedAt)}</span>,
    sortValue: (i) => i.updatedAt,
  },
  {
    id: 'tags',
    label: 'Tags',
    initial: false,
    className: 'col-text',
    cell: (i) =>
      i.tags.length ? (
        <span className="tag-list">
          {i.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </span>
      ) : (
        <Dash />
      ),
    text: (i) => i.tags.join(' '),
  },
];
const INITIAL_COLUMNS = COLUMNS.filter((c) => c.initial).map((c) => c.id);

/** A tick box for choosing rows; `mixed` shows a dash when only some are ticked. */
function SelectBox({ checked, mixed, onChange, label }: { checked: boolean; mixed?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!mixed;
  }, [mixed]);
  return (
    <label className="checkbox select-box">
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
      <span className="checkbox-box" aria-hidden>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          {mixed ? <path d="M5 12h14" /> : <path d="M20 6 9 17l-5-5" />}
        </svg>
      </span>
    </label>
  );
}

/** Edit, move, duplicate and delete for one row. Delete asks once more before it removes anything. */
function RowActions({
  item,
  canMove,
  onEdit,
  onTransfer,
  onDelete,
}: {
  item: Item;
  /** Moving needs another project to move to. */
  canMove: boolean;
  onEdit: () => void;
  onTransfer: (mode: 'move' | 'duplicate') => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const name = item.env ? `${item.title} (${item.env})` : item.title;
  return (
    <div className="row-actions">
      <button type="button" className="icon-btn" onClick={onEdit} aria-label={`Edit ${name}`} title="Edit">
        <PencilLine size={15} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onTransfer('move')}
        disabled={!canMove}
        aria-label={`Move ${name} to another project`}
        title={canMove ? 'Move to another project' : 'Create another project to move keys to'}
      >
        <FolderInput size={15} />
      </button>
      <button type="button" className="icon-btn" onClick={() => onTransfer('duplicate')} aria-label={`Duplicate ${name}`} title="Duplicate">
        <CopyPlus size={15} />
      </button>
      <button type="button" className="icon-btn icon-btn-danger" onClick={() => setConfirming(true)} aria-label={`Delete ${name}`} title="Delete">
        <Trash2 size={15} />
      </button>
      {confirming && (
        <ConfirmDelete
          name={item.title}
          kind={typeInfo(item.type).label}
          env={item.env}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

// Column and sort choices are a per-browser convenience.
function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage blocked: keep it for this visit only */
    }
  };
  return [value, set];
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function ProjectView({
  project,
  envs,
  onOpen,
  onPreview,
  onEditProject,
  onShare,
  onDeleteItem,
  onTransferItem,
  canMove,
  projects,
  onApplyTransfers,
  onDeleteItems,
}: {
  project: Project;
  /** The shared environment list, plus any extra the items use. */
  envs: string[];
  onOpen: (t: SheetTarget) => void;
  /** Shows a key read-only; editing is the row's pencil button. */
  onPreview: (itemId: string) => void;
  onEditProject: () => void;
  onShare: () => void;
  onDeleteItem: (itemId: string) => void;
  /** Opens the move / duplicate popup for one key. */
  onTransferItem: (itemId: string, mode: 'move' | 'duplicate') => void;
  /** False when this is the only project, so there's nowhere to move to. */
  canMove: boolean;
  /** Every project, for moving or duplicating ticked keys. */
  projects: Project[];
  onApplyTransfers: (plan: Transfer[]) => void;
  onDeleteItems: (itemIds: string[]) => void;
}) {
  const keys = useShortcuts();
  const [query, setQuery] = useState('');
  const [envSel, setEnvSel] = useState<string[]>([]);
  const [typeSel, setTypeSel] = useState<ItemType[]>([]);
  const [visible, setVisible] = useStored<ColId[]>('devvault.columns.v2', INITIAL_COLUMNS);
  const [sort, setSort] = useStored<Sort>('devvault.sort', { col: 'name', dir: 1 });
  // Ticked rows, for acting on several keys at once.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<'move' | 'duplicate' | 'delete' | null>(null);
  useEffect(() => {
    setQuery('');
    setEnvSel([]);
    setTypeSel([]);
    setSelected(new Set());
  }, [project.id]);
  // Keys that were moved or deleted drop out of the selection by themselves.
  const picked = project.items.filter((i) => selected.has(i.id));
  const pick = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const finishBulk = () => {
    setBulk(null);
    setSelected(new Set());
  };
  const open = (t: SheetTarget) => onOpen({ ...t, projectId: project.id } as SheetTarget);
  const isEmpty = project.items.length === 0;
  const [order, setOrder] = useStored<ColId[]>(
    'devvault.columnOrder',
    COLUMNS.map((c) => c.id),
  );
  // Saved order first, then any column added since it was saved.
  const ordered = [...order.filter((id) => COLUMNS.some((c) => c.id === id)), ...COLUMNS.map((c) => c.id).filter((id) => !order.includes(id))].map(
    (id) => COLUMNS.find((c) => c.id === id)!,
  );
  const move = (id: ColId, by: -1 | 1) => {
    const ids = ordered.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
  };
  const cols = ordered.filter((c) => visible.includes(c.id));
  // The type sits under the name unless it has its own column.
  const typeUnderName = !visible.includes('type');

  const envCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of project.items) m.set(i.env ?? NONE, (m.get(i.env ?? NONE) ?? 0) + 1);
    return m;
  }, [project.items]);
  const typeCounts = useMemo(() => {
    const m = new Map<ItemType, number>();
    for (const i of project.items) m.set(i.type, (m.get(i.type) ?? 0) + 1);
    return m;
  }, [project.items]);

  const shown = useMemo(() => {
    const rank = (env: string | null) => (env === null ? envs.length : envs.indexOf(env));
    const byName = (a: Item, b: Item) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || rank(a.env) - rank(b.env);
    const q = query.trim().toLowerCase();
    const sortCol = COLUMNS.find((c) => c.id === sort.col);
    const compare = (a: Item, b: Item) => {
      if (!sortCol?.sortValue) return byName(a, b);
      const x = sortCol.sortValue(a, rank);
      const y = sortCol.sortValue(b, rank);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
      return d || byName(a, b);
    };
    return project.items
      .filter((i) => envSel.length === 0 || envSel.includes(i.env ?? NONE))
      .filter((i) => typeSel.length === 0 || typeSel.includes(i.type))
      .filter((i) => !q || [i.title, ...COLUMNS.map((c) => c.text?.(i) ?? '')].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => compare(a, b) * sort.dir);
  }, [project.items, envs, query, envSel, typeSel, sort]);

  const filtering = !!query.trim() || envSel.length > 0 || typeSel.length > 0;
  const clear = () => {
    setQuery('');
    setEnvSel([]);
    setTypeSel([]);
  };
  // New keys land in the one environment being shown; otherwise the form picks its usual default.
  const newEnv = envSel.length === 1 ? (envSel[0] === NONE ? null : envSel[0]) : undefined;

  const head = (key: SortKey, label: string, className: string, sortable: boolean) => {
    const active = sort.col === key;
    return (
      <th
        key={key}
        scope="col"
        className={className}
        aria-sort={sortable ? (active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none') : undefined}
      >
        {sortable ? (
          <button type="button" className="sort-btn" onClick={() => setSort({ col: key, dir: active ? (sort.dir === 1 ? -1 : 1) : 1 })}>
            {label}
            {active && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
          </button>
        ) : (
          label
        )}
      </th>
    );
  };

  return (
    <>
      <header className="project-head">
        <h1>{project.name}</h1>
        <div className="project-actions">
          <button
            className="btn btn-ghost"
            onClick={onShare}
            disabled={isEmpty}
            title={`Share this project (${keys.share})`}
            aria-keyshortcuts={keys.share}
          >
            <Share2 size={15} /> Share
          </button>
          <button
            className="btn btn-ghost"
            onClick={onEditProject}
            title={`Rename or delete this project (${keys.editProject})`}
            aria-keyshortcuts={keys.editProject}
          >
            <PencilLine size={15} /> Edit
          </button>
          <button
            className="btn btn-primary"
            onClick={() => open({ mode: 'new', projectId: project.id, env: newEnv })}
            aria-keyshortcuts={keys.addKey}
          >
            <Plus size={16} /> Add key
            <Keys id="addKey" />
          </button>
        </div>
      </header>

      <div className="list-wrap">
        {bulk === 'delete' && (
          <DeleteManyDialog
            items={picked}
            onClose={() => setBulk(null)}
            onConfirm={() => {
              onDeleteItems(picked.map((i) => i.id));
              finishBulk();
            }}
          />
        )}
        {(bulk === 'move' || bulk === 'duplicate') && (
          <TransferManyDialog
            mode={bulk}
            items={picked}
            from={project}
            projects={projects}
            envs={envs}
            onClose={() => setBulk(null)}
            onDone={(plan) => {
              onApplyTransfers(plan);
              finishBulk();
            }}
          />
        )}
        {picked.length > 0 ? (
          <SelectionBar
            count={picked.length}
            canMove={canMove}
            onMove={() => setBulk('move')}
            onDuplicate={() => setBulk('duplicate')}
            onDelete={() => setBulk('delete')}
            onClear={() => setSelected(new Set())}
          />
        ) : (
        <div className="table-tools">
          <label className="table-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label={`Search keys in ${project.name}`}
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Clear the search">
                <X size={14} />
              </button>
            )}
          </label>
          <Menu label="Environment" count={envSel.length}>
            {envs.map((env) => (
              <MenuCheck key={env} checked={envSel.includes(env)} onChange={() => setEnvSel(toggle(envSel, env))} aside={envCounts.get(env) ?? 0}>
                {env}
              </MenuCheck>
            ))}
            {envCounts.has(NONE) && (
              <MenuCheck checked={envSel.includes(NONE)} onChange={() => setEnvSel(toggle(envSel, NONE))} aside={envCounts.get(NONE)}>
                No environment
              </MenuCheck>
            )}
          </Menu>
          <Menu label="Type" count={typeSel.length}>
            {ITEM_TYPES.filter((t) => typeCounts.has(t.type)).map((t) => (
              <MenuCheck
                key={t.type}
                checked={typeSel.includes(t.type)}
                onChange={() => setTypeSel(toggle(typeSel, t.type))}
                aside={typeCounts.get(t.type)}
              >
                {t.label}
              </MenuCheck>
            ))}
          </Menu>
          {filtering && (
            <button type="button" className="tool-clear" onClick={clear}>
              Clear
            </button>
          )}
          <span className="tools-spacer" />
          <span className="tool-result num" aria-live="polite">
            {filtering ? `${shown.length} of ${project.items.length}` : `${project.items.length} key${project.items.length === 1 ? '' : 's'}`}
          </span>
          <Menu label="Columns" icon={<Columns3 size={14} aria-hidden />} align="end">
            {ordered.map((c, i) => (
              <div key={c.id} className="menu-row">
                <MenuCheck checked={visible.includes(c.id)} onChange={() => setVisible(toggle(visible, c.id))}>
                  {c.label}
                </MenuCheck>
                <span className="menu-order">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(c.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${c.label} left`}
                    title="Move left"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => move(c.id, 1)}
                    disabled={i === ordered.length - 1}
                    aria-label={`Move ${c.label} right`}
                    title="Move right"
                  >
                    <ArrowDown size={14} />
                  </button>
                </span>
              </div>
            ))}
            <button
              type="button"
              className="menu-reset"
              onClick={() => {
                setVisible(INITIAL_COLUMNS);
                setOrder(COLUMNS.map((c) => c.id));
              }}
            >
              Reset columns
            </button>
          </Menu>
        </div>
        )}
        <div className="table-scroll">
          <table className="key-list" style={{ ['--cols' as string]: cols.length }}>
            <thead>
              <tr>
                <th scope="col" className="col-select">
                  <SelectBox
                    checked={shown.length > 0 && shown.every((i) => selected.has(i.id))}
                    mixed={shown.some((i) => selected.has(i.id)) && !shown.every((i) => selected.has(i.id))}
                    label={shown.every((i) => selected.has(i.id)) ? 'Clear the selection' : `Select all ${shown.length} shown keys`}
                    onChange={() =>
                      setSelected((s) => {
                        const all = shown.every((i) => s.has(i.id));
                        const next = new Set(s);
                        for (const i of shown) {
                          if (all) next.delete(i.id);
                          else next.add(i.id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                {head('name', 'Name', 'col-name', true)}
                {cols.map((c) => head(c.id, c.label, c.className, !!c.sortValue))}
                <th scope="col" className="col-actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr
                  key={item.id}
                  className="row-open"
                  data-selected={selected.has(item.id) || undefined}
                  tabIndex={0}
                  aria-label={`${item.title}${item.env ? `, ${item.env}` : ''}. Enter opens, C copies the value, U copies the username, X selects.`}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
                    const row = e.currentTarget;
                    const step = (dir: 1 | -1) => {
                      const next = dir === 1 ? row.nextElementSibling : row.previousElementSibling;
                      if (next instanceof HTMLElement && next.classList.contains('row-open')) next.focus();
                    };
                    const press = (sel: string) => row.querySelector<HTMLButtonElement>(sel)?.click();
                    const k = e.key.toLowerCase();
                    if (k === 'arrowdown') step(1);
                    else if (k === 'arrowup') step(-1);
                    else if (k === 'enter') onPreview(item.id);
                    else if (k === 'c') press('.col-value .copy-btn');
                    else if (k === 'u') press('.col-username .copy-btn');
                    else if (k === 'x') pick(item.id);
                    else return;
                    // Handled here, so the key doesn't also start a search.
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    // Clicks inside a popup opened from this row (delete confirmation) stay there.
                    if ((e.target as Element).closest('dialog')) return;
                    // Clicking a value's text copies it, like its copy button.
                    const cell = (e.target as Element).closest('.value-cell');
                    if (cell && !(e.target as Element).closest('button') && !window.getSelection()?.toString()) {
                      cell.querySelector<HTMLButtonElement>('.copy-btn')?.click();
                      return;
                    }
                    // Buttons in the row (copy, edit, delete) do their own thing; so does selecting text.
                    if ((e.target as Element).closest('button, a, input, label') || window.getSelection()?.toString()) return;
                    onPreview(item.id);
                  }}
                >
                  <td className="col-select">
                    <SelectBox checked={selected.has(item.id)} onChange={() => pick(item.id)} label={`Select ${item.title}${item.env ? ` (${item.env})` : ''}`} />
                  </td>
                  <th scope="row" className="col-name">
                    <button type="button" className="name-btn" onClick={() => onPreview(item.id)}>
                      <span className="name">{item.title}</span>
                      {typeUnderName && <span className="type">{typeInfo(item.type).label}</span>}
                    </button>
                  </th>
                  {cols.map((c) => (
                    <td key={c.id} className={c.className}>
                      {c.cell(item)}
                    </td>
                  ))}
                  <td className="col-actions">
                    <RowActions
                      item={item}
                      canMove={canMove}
                      onEdit={() => open({ mode: 'edit', projectId: project.id, itemId: item.id })}
                      onTransfer={(mode) => onTransferItem(item.id, mode)}
                      onDelete={() => onDeleteItem(item.id)}
                    />
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr className="row-blank">
                  <td colSpan={cols.length + 3}>
                    {filtering ? (
                      <span className="muted">
                        No keys match.{' '}
                        <button type="button" className="link-btn" onClick={clear}>
                          Clear filters
                        </button>
                      </span>
                    ) : (
                      <span className="muted">No keys in this project yet.</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
