import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { primaryField, typeInfo } from '../vault/item-types';
import { envLabel, type Item, type Project } from '../vault/model';
import { parseTotp, totp } from '../crypto/totp';
import { useClipboard } from './clipboard';

interface Hit {
  project: Project;
  item: Item;
  score: number;
}

/** Matches every word of the query against the item's name, place, type, tags and plain values. */
function search(projects: Project[], query: string): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: Hit[] = [];
  for (const project of projects) {
    for (const item of project.items) {
      const title = item.title.toLowerCase();
      const hay = [
        title,
        project.name,
        envLabel(item.env),
        typeInfo(item.type).label,
        ...item.tags,
        ...item.fields.filter((f) => !f.secret).map((f) => f.value),
      ]
        .join(' ')
        .toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      let score = 0;
      if (words.length && title.startsWith(words[0])) score += 3;
      if (words.some((w) => title.includes(w))) score += 2;
      if (item.favorite) score += 1;
      hits.push({ project, item, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).slice(0, 50);
}

/**
 * Ctrl+K. Type, arrow to a result: Enter (or a click) copies its main value and
 * previews it, Ctrl+Enter only copies, Shift+Enter edits it. No open/close animation: it's
 * used too often for motion.
 */
export function CommandPalette({
  initialQuery = '',
  projects,
  onClose,
  onOpenItem,
  onPreviewItem,
}: {
  initialQuery?: string;
  projects: Project[];
  onClose: () => void;
  onOpenItem: (projectId: string, itemId: string) => void;
  onPreviewItem: (projectId: string, itemId: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState('');
  const { copy } = useClipboard();
  const hits = useMemo(() => search(projects, query), [projects, query]);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  /** What a quick copy takes: the key's main value (a login's password), or a 2FA key's current code, never its secret. */
  async function quickValue(item: Item): Promise<{ value: string; what: string } | null> {
    const field = primaryField(item.type, item.fields);
    if (!field) return null;
    if (field.kind !== 'totp') return { value: field.value, what: field.label.toLowerCase() };
    try {
      return { value: await totp(parseTotp(field.value)), what: '2FA code' };
    } catch {
      return null;
    }
  }

  async function choose(hit: Hit, how: 'preview' | 'copy' | 'edit') {
    if (how === 'edit') return onOpenItem(hit.project.id, hit.item.id);
    const quick = await quickValue(hit.item);
    if (how === 'preview') {
      // Opening from search also copies the main value, so it's ready to paste.
      if (quick) await copy(quick.value, `${hit.item.title} ${quick.what}`, hit.item.env);
      return onPreviewItem(hit.project.id, hit.item.id);
    }
    if (!quick) return setStatus(`${hit.item.title} has no value to copy`);
    if (await copy(quick.value, `${hit.item.title} ${quick.what}`, hit.item.env)) onClose();
  }

  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Search the vault"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      <div className="palette-input">
        <Search size={18} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search anything: keys, URLs, projects, environments…"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={hits[active] ? `hit-${hits[active].item.id}` : undefined}
          aria-label="Search the vault"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && hits[active]) {
              e.preventDefault();
              choose(hits[active], e.ctrlKey || e.metaKey ? 'copy' : e.shiftKey ? 'edit' : 'preview');
            }
          }}
        />
      </div>
      {hits.length === 0 ? (
        <p className="palette-empty">
          {projects.length === 0 ? 'Your vault is empty. Create a project to add keys.' : `Nothing matches “${query}”.`}
        </p>
      ) : (
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef} aria-label="Results">
          {hits.map((hit, i) => (
            <li
              key={hit.item.id}
              id={`hit-${hit.item.id}`}
              role="option"
              aria-selected={i === active}
              className="palette-item"
              onMouseMove={() => setActive(i)}
              onClick={(e) => choose(hit, e.shiftKey ? 'edit' : 'preview')}
            >
              <span style={{ minWidth: 0 }}>
                <span className="title" style={{ display: 'block' }}>
                  {hit.item.title}
                </span>
                <span className="where">
                  {hit.project.name} · {envLabel(hit.item.env)} · {typeInfo(hit.item.type).label}
                </span>
              </span>
              {hit.item.env && <span className="pill">{hit.item.env}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="palette-foot" aria-live="polite">
        <span>
          <kbd>Enter</kbd> copy and open
        </span>
        <span>
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd> copy only
        </span>
        <span>
          <kbd>Shift</kbd> + <kbd>Enter</kbd> edit
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
        {status && <span>{status}</span>}
      </div>
    </dialog>
  );
}
