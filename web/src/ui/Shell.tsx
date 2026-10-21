import { ClipboardCheck, FolderPlus, Sparkles, GripVertical, HardDrive, House, Lock, LoaderCircle, Plus, Search, Settings } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyTransfers, moveProject, transferItem, type Item, type Project } from '../vault/model';
import { aiStatus } from '../storage/host-api';
import { useVault, type AutoBackupState } from '../vault/vault-store';
import { ClipboardProvider, useClipboard } from './clipboard';
import { CommandPalette } from './CommandPalette';
import { ProjectDialog, ShareDialog, TransferDialog } from './Dialogs';
import { timeAgo } from './format';
import { Wordmark } from './Gate';
import { ItemPreview } from './ItemPreview';
import { SmartAdd } from './SmartAdd';
import { ItemSheet, type SheetTarget } from './ItemSheet';
import { ProjectView } from './ProjectView';
import { isBackupStale, SettingsPage, type SettingsSection } from './SettingsPage';
import { comboOf, Keys, resolveShortcuts, SHORTCUT_IDS, type ShortcutId } from './shortcuts';
import { useIdleLock } from './use-idle-lock';

type Overlay =
  | { kind: 'none' }
  | { kind: 'palette'; initial?: string }
  | { kind: 'project'; projectId: string | null }
  | { kind: 'share'; projectId: string }
  | { kind: 'item'; target: SheetTarget }
  | { kind: 'preview'; projectId: string; itemId: string; fromSearch?: boolean }
  | { kind: 'transfer'; mode: 'move' | 'duplicate'; projectId: string; itemId: string }
  | { kind: 'smart' };

function ClipboardStatus() {
  const { pending, clearNow } = useClipboard();
  if (!pending) return null;
  return (
    <div className="rail-status" data-tone="ok" role="status">
      <ClipboardCheck size={16} aria-hidden />
      <span className="grow num">Clears in {pending.secondsLeft}s</span>
      <button onClick={clearNow}>Clear now</button>
    </div>
  );
}

function BackupStatus({
  lastBackupAt,
  auto,
  autoOn,
  onOpen,
}: {
  lastBackupAt: string | null;
  auto: AutoBackupState;
  autoOn: boolean;
  onOpen: () => void;
}) {
  if (autoOn) {
    const failed = !!auto.error;
    return (
      <button
        type="button"
        className="rail-status rail-status-link"
        data-tone={failed ? 'warn' : 'ok'}
        data-kind="backup"
        onClick={onOpen}
        title={failed ? (auto.error ?? undefined) : 'Open Backup & restore'}
      >
        <HardDrive size={16} aria-hidden />
        <span className="grow">{failed ? 'Auto-backup failed' : 'Auto-backup'}</span>
        <span className="rail-status-meta">{failed ? 'Check' : auto.at ? timeAgo(auto.at) : 'On'}</span>
      </button>
    );
  }
  const stale = isBackupStale(lastBackupAt);
  return (
    <div className="rail-status" data-tone={stale ? 'warn' : 'ok'} data-kind="backup">
      <HardDrive size={16} aria-hidden />
      <span className="grow">{lastBackupAt ? `Backed up ${timeAgo(lastBackupAt)}` : 'Not backed up yet'}</span>
      {stale && <button onClick={onOpen}>Back up</button>}
    </div>
  );
}

/** Two letters for a project's tile: "Billing API" → BA, "payments" → PA. */
const monogram = (name: string) => {
  const words = name
    .trim()
    .split(/[\s_\-./]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
};
function ShellInner() {
  const { data, update, lock, saveState, saveError, reload, autoBackup } = useVault();
  const [selected, setSelected] = useState<string | null>(() => data?.settings.defaultProjectId ?? data?.projects[0]?.id ?? null);
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  // Smart add shows only when the Claude Code CLI is installed and signed in on this PC.
  const [aiReady, setAiReady] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => aiStatus().then((ok) => live && setAiReady(ok));
    check();
    const t = window.setInterval(check, 5 * 60_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);
  // The top bar gets its bottom edge only once content scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  const [view, setView] = useState<{ kind: 'project' } | { kind: 'settings'; section: SettingsSection }>({ kind: 'project' });
  const openSettings = (section: SettingsSection) => setView({ kind: 'settings', section });
  const close = useCallback(() => setOverlay({ kind: 'none' }), []);
  const { clearNow, notify } = useClipboard();

  const lockNow = useCallback(() => {
    clearNow();
    lock();
  }, [clearNow, lock]);
  useIdleLock(data?.settings.autoLockMinutes ?? 10, lockNow);

  // Filled in on every render, so the shortcuts always act on the current project and current keys.
  const actions = useRef<Partial<Record<ShortcutId, () => void>>>({});
  const keys = resolveShortcuts(data?.settings.shortcuts);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Settings is recording a new shortcut: leave the keys to it.
      if (document.querySelector('[data-recording]')) return;
      const pressed = comboOf(e);
      const id = pressed ? SHORTCUT_IDS.find((k) => keysRef.current[k] === pressed) : undefined;
      if (id === 'search') {
        e.preventDefault();
        setOverlay((o) => (o.kind === 'palette' ? { kind: 'none' } : o.kind === 'none' ? { kind: 'palette' } : o));
        return;
      }
      if (id) {
        // Lock works everywhere; the rest wait until any open dialog is closed.
        const blocked = id !== 'lock' && !!document.querySelector('dialog[open]');
        const run = blocked ? undefined : actions.current[id];
        if (run) {
          e.preventDefault();
          run();
        }
        return;
      }
      // Search anything: start typing anywhere (outside a field) and the search opens with what you typed.
      const el = e.target instanceof Element ? e.target : null;
      const inField = !!el?.closest('input, textarea, select, [contenteditable="true"], dialog');
      if (inField || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ') return;
      e.preventDefault();
      const initial = e.key === '/' ? '' : e.key;
      setOverlay((o) => (o.kind === 'none' ? { kind: 'palette', initial } : o));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!data) return null;
  const projects = data.projects;
  const defaultId = data.settings.defaultProjectId;
  const project = projects.find((p) => p.id === selected) ?? projects.find((p) => p.id === defaultId) ?? projects[0] ?? null;
  const goHome = () => {
    setSelected(defaultId);
    setView({ kind: 'project' });
  };
  const envs = data.settings.environments;
  // Columns: the shared list, plus any environment a project's items still use.
  const projectEnvs = project ? [...new Set([...envs, ...project.items.map((i) => i.env).filter((e): e is string => !!e)])] : envs;

  const saveProject = (p: Project, makeDefault: boolean) => {
    update((d) => ({
      ...d,
      projects: d.projects.some((x) => x.id === p.id) ? d.projects.map((x) => (x.id === p.id ? p : x)) : [...d.projects, p],
      settings: makeDefault ? { ...d.settings, defaultProjectId: p.id } : d.settings,
    }));
    setSelected(p.id);
    close();
  };
  // Projects reorder by drag, or Alt+Up / Alt+Down. The default one stays first.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const endDrag = () => {
    setDragId(null);
    setDropAt(null);
  };
  const reorder = (id: string, before: number) => update((d) => moveProject(d, id, before));
  const deleteProject = (id: string) => {
    update((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) }));
    setSelected(null);
    close();
  };
  const saveItem = (projectId: string, item: Item) => {
    update((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              updatedAt: item.updatedAt,
              items: p.items.some((i) => i.id === item.id) ? p.items.map((i) => (i.id === item.id ? item : i)) : [...p.items, item],
            },
      ),
    }));
    close();
  };
  const deleteItem = (projectId: string, itemId: string) => {
    update((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id !== projectId ? p : { ...p, items: p.items.filter((i) => i.id !== itemId) })),
    }));
    close();
  };

  actions.current = {
    addKey: project ? () => setOverlay({ kind: 'item', target: { mode: 'new', projectId: project.id } }) : undefined,
    newProject: () => setOverlay({ kind: 'project', projectId: null }),
    editProject: project ? () => setOverlay({ kind: 'project', projectId: project.id }) : undefined,
    share: project && project.items.length > 0 ? () => setOverlay({ kind: 'share', projectId: project.id }) : undefined,
    home: goHome,
    settings: () => openSettings('environments'),
    backup: () => openSettings('backup'),
    lock: lockNow,
    smartAdd: aiReady && projects.length > 0 ? () => setOverlay({ kind: 'smart' }) : undefined,
  };

  const sheetProject = overlay.kind === 'item' ? projects.find((p) => p.id === overlay.target.projectId) : undefined;
  const editedProject = overlay.kind === 'project' && overlay.projectId ? (projects.find((p) => p.id === overlay.projectId) ?? null) : null;
  const sharedProject = overlay.kind === 'share' ? projects.find((p) => p.id === overlay.projectId) : undefined;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Vault">
        <button className="wordmark-btn" onClick={goHome} title={`Open your default project (${keys.home})`}>
          <Wordmark />
        </button>

        <div className="rail-heading">
          <span id="projects-h">Projects</span>
          <button
            className="rail-new"
            onClick={() => setOverlay({ kind: 'project', projectId: null })}
            aria-label="New project"
            title={`New project (${keys.newProject})`}
            aria-keyshortcuts={keys.newProject}
          >
            <Plus size={15} aria-hidden />
          </button>
        </div>
        <ul className="project-list" aria-labelledby="projects-h">
          {projects.length === 0 && <li className="rail-empty">No projects yet</li>}
          {projects.map((p, i) => {
            const pinned = p.id === defaultId;
            return (
              <li
                key={p.id}
                draggable={!pinned}
                data-dragging={dragId === p.id || undefined}
                data-drop={dropAt === i ? 'before' : dropAt === i + 1 && i === projects.length - 1 ? 'after' : undefined}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', p.id);
                  setDragId(p.id);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  const before = Math.max(1, e.clientY < r.top + r.height / 2 ? i : i + 1);
                  const from = projects.findIndex((x) => x.id === dragId);
                  setDropAt(before === from || before === from + 1 ? null : before);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dropAt !== null) reorder(dragId, dropAt);
                  endDrag();
                }}
                onDragEnd={endDrag}
              >
                {!pinned && <GripVertical size={14} className="grip" aria-hidden />}
                <button
                  className="project-link"
                  aria-current={view.kind === 'project' && p.id === project?.id}
                  title={pinned ? 'Default project. Developer Keys opens on it, and it stays first.' : 'Drag, or press Alt+Up / Alt+Down, to reorder'}
                  aria-keyshortcuts={pinned ? undefined : 'Alt+ArrowUp Alt+ArrowDown'}
                  onClick={() => {
                    setSelected(p.id);
                    setView({ kind: 'project' });
                  }}
                  onKeyDown={(e) => {
                    if (pinned || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                    e.preventDefault();
                    const target = e.currentTarget;
                    reorder(p.id, e.key === 'ArrowUp' ? Math.max(1, i - 1) : i + 2);
                    requestAnimationFrame(() => target.focus());
                  }}
                >
                  <span className="proj-mark" aria-hidden>
                    {monogram(p.name)}
                  </span>
                  <span className="proj-name">{p.name}</span>
                  {pinned && (
                    <>
                      <House size={13} className="proj-home" aria-hidden />
                      <span className="sr-only">, default project</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="rail-foot">
          <ClipboardStatus />
          <BackupStatus
            lastBackupAt={data.settings.lastBackupAt}
            auto={autoBackup}
            autoOn={data.settings.autoBackup !== false}
            onOpen={() => openSettings('backup')}
          />
          <button
            className="rail-settings"
            aria-current={view.kind === 'settings'}
            onClick={() => openSettings('environments')}
            aria-keyshortcuts={keys.settings}
          >
            <Settings size={16} aria-hidden /> <span className="grow">Settings</span>
            <Keys id="settings" />
          </button>
        </div>
      </nav>

      <main className="main" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
        <div className="topbar" data-scrolled={scrolled}>
          <button className="search-bar" onClick={() => setOverlay({ kind: 'palette' })} aria-keyshortcuts={keys.search}>
            <Search size={18} aria-hidden />
            <span className="grow">
              Search anything
              <span className="search-scope">: keys, URLs, projects, environments</span>
            </span>
            <Keys id="search" />
          </button>
          <div className="topbar-end">
            <span className="save-state" data-state={saveState} aria-live="polite">
              {saveState === 'saving' ? (
                <>
                  <LoaderCircle size={14} aria-hidden className="spin" /> Saving…
                </>
              ) : null}
            </span>
            <button className="btn btn-secondary lock-btn" onClick={lockNow} title={`Lock now (${keys.lock})`} aria-keyshortcuts={keys.lock}>
              <Lock size={15} aria-hidden /> Lock
              <Keys id="lock" />
            </button>
          </div>
        </div>
        {saveState === 'conflict' && (
          <div className="banner" role="alert">
            <span className="grow">
              This vault was changed in another window, so your last change wasn’t saved. Reload to get the latest version.
            </span>
            <button className="btn btn-secondary" onClick={reload}>
              Reload
            </button>
          </div>
        )}
        {saveState === 'error' && (
          <div className="banner" role="alert">
            <span className="grow">Couldn’t save: {saveError}. Check that the Developer Keys host is still running.</span>
          </div>
        )}
        {view.kind === 'settings' ? (
          <SettingsPage section={view.section} onSection={openSettings} />
        ) : project ? (
          <ProjectView
            project={project}
            onDeleteItem={(itemId) => deleteItem(project.id, itemId)}
            onTransferItem={(itemId, mode) => setOverlay({ kind: 'transfer', mode, projectId: project.id, itemId })}
            canMove={projects.length > 1}
            projects={projects}
            onApplyTransfers={(plan) => {
              update((d) => applyTransfers(d, plan));
              const where = projects.find((p) => p.id === plan[0]?.toProjectId)?.name ?? 'the project';
              notify(`${plan[0]?.mode === 'move' ? 'Moved' : 'Duplicated'} ${plan.length} key${plan.length === 1 ? '' : 's'} to ${where}.`);
            }}
            onDeleteItems={(ids) => {
              update((d) => ({
                ...d,
                projects: d.projects.map((p) => (p.id !== project.id ? p : { ...p, items: p.items.filter((i) => !ids.includes(i.id)) })),
              }));
              notify(`Deleted ${ids.length} key${ids.length === 1 ? '' : 's'}.`);
            }}
            envs={projectEnvs}
            onOpen={(target) => setOverlay({ kind: 'item', target })}
            onPreview={(itemId) => setOverlay({ kind: 'preview', projectId: project.id, itemId })}
            onEditProject={() => setOverlay({ kind: 'project', projectId: project.id })}
            onShare={() => setOverlay({ kind: 'share', projectId: project.id })}
          />
        ) : (
          <section className="empty">
            <h2>Start with a project</h2>
            <p>
              A project holds one app or service. Inside it, every key gets a column per environment, so the dev, staging and prod values sit side by
              side. You manage the environment list in Settings.
            </p>
            <button className="btn btn-primary" onClick={() => setOverlay({ kind: 'project', projectId: null })}>
              <FolderPlus size={16} /> Create a project
            </button>
          </section>
        )}
      </main>

      {overlay.kind === 'smart' && (
        <SmartAdd
          projects={projects}

          envs={envs}

          currentProjectId={project?.id ?? null}

          onClose={close}

          onSave={(projectId, items) => {
            for (const item of items) saveItem(projectId, item);

            setSelected(projectId);

            setView({ kind: 'project' });

            const where = projects.find((p) => p.id === projectId)?.name ?? 'the project';
            notify(items.length === 1 ? `Saved ${items[0].title} to ${where}.` : `Saved ${items.length} keys to ${where}.`);
          }}
        />
      )}

      {aiReady && projects.length > 0 && overlay.kind === 'none' && (
        <button
          type="button"

          className="fab"

          onClick={() => setOverlay({ kind: 'smart' })}

          title={`Smart add with Claude (${keys.smartAdd})`}

          aria-keyshortcuts={keys.smartAdd}
        >
          <Sparkles size={18} aria-hidden />

          <span>Smart add</span>
        </button>
      )}

      {overlay.kind === 'preview' &&
        (() => {
          const p = projects.find((x) => x.id === overlay.projectId);

          const it = p?.items.find((x) => x.id === overlay.itemId);

          return p && it ? (
            <ItemPreview
              project={p}

              item={it}

              closeAfter={overlay.fromSearch ? 30 : undefined}

              onClose={close}

              onEdit={() => {
                setSelected(p.id);

                setOverlay({ kind: 'item', target: { mode: 'edit', projectId: p.id, itemId: it.id } });
              }}
            />
          ) : null;
        })()}

      {overlay.kind === 'transfer' &&
        (() => {
          const from = projects.find((x) => x.id === overlay.projectId);
          const it = from?.items.find((x) => x.id === overlay.itemId);
          return from && it ? (
            <TransferDialog
              mode={overlay.mode}
              item={it}
              from={from}
              projects={projects}
              envs={envs}
              onClose={close}
              onDone={(t) => {
                update((d) => transferItem(d, t));
                close();
                const where = projects.find((p) => p.id === t.toProjectId)?.name ?? 'the project';
                notify(`${t.mode === 'move' ? 'Moved' : 'Duplicated'} ${t.title} to ${where}${t.env ? ` (${t.env})` : ''}.`);
              }}
            />
          ) : null;
        })()}

      {overlay.kind === 'palette' && (
        <CommandPalette
          initialQuery={overlay.initial ?? ''}
          projects={projects}
          onClose={close}
          onPreviewItem={(projectId, itemId) => setOverlay({ kind: 'preview', projectId, itemId, fromSearch: true })}
          onOpenItem={(projectId, itemId) => {
            setSelected(projectId);
            setOverlay({
              kind: 'item',
              target: { mode: 'edit', projectId, itemId },
            });
          }}
        />
      )}
      {overlay.kind === 'project' && (
        <ProjectDialog
          project={editedProject}
          isDefault={!!editedProject && editedProject.id === defaultId}
          onSave={saveProject}
          onDelete={deleteProject}
          onClose={close}
        />
      )}
      {sharedProject && <ShareDialog project={sharedProject} onClose={close} />}
      {overlay.kind === 'item' && sheetProject && (
        <ItemSheet
          key={overlay.target.mode === 'edit' ? overlay.target.itemId : 'new'}
          project={sheetProject}
          envs={envs}
          target={overlay.target}
          onSave={(item) => saveItem(sheetProject.id, item)}
          onDelete={(id) => deleteItem(sheetProject.id, id)}
          onClose={close}
        />
      )}
    </div>
  );
}

export function Shell() {
  const { data } = useVault();
  return (
    <ClipboardProvider clearAfter={data?.settings.clipboardClearSeconds ?? 30}>
      <ShellInner />
    </ClipboardProvider>
  );
}
