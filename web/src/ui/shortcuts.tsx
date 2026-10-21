import { useVault } from '../vault/vault-store';

/**
 * Keyboard shortcuts. The defaults are Alt + a letter, so they never clash with
 * typing to search, with browser shortcuts, or with Teams' own Ctrl shortcuts.
 * People can change them in Settings; their choices live in the vault settings.
 */
export const SHORTCUTS = {
  search: { combo: 'Ctrl+K', label: 'Search anything' },
  addKey: { combo: 'Alt+N', label: 'Add a key to this project' },
  newProject: { combo: 'Alt+P', label: 'New project' },
  editProject: { combo: 'Alt+E', label: 'Edit this project' },
  share: { combo: 'Alt+H', label: 'Share this project' },
  home: { combo: 'Alt+G', label: 'Go to your default project' },
  settings: { combo: 'Alt+S', label: 'Settings' },
  backup: { combo: 'Alt+B', label: 'Back up' },
  lock: { combo: 'Alt+L', label: 'Lock Developer Keys' },
  smartAdd: { combo: 'Alt+A', label: 'Smart add with Claude (when Claude Code is signed in)' },
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;
export type ShortcutMap = Record<ShortcutId, string>;
export const SHORTCUT_IDS = Object.keys(SHORTCUTS) as ShortcutId[];

/** The default combos with the person's own choices on top. */
export function resolveShortcuts(custom: Partial<Record<string, string>> | undefined): ShortcutMap {
  const map = {} as ShortcutMap;
  for (const id of SHORTCUT_IDS) map[id] = custom?.[id] || SHORTCUTS[id].combo;
  return map;
}

export function useShortcuts(): ShortcutMap {
  const { data } = useVault();
  return resolveShortcuts(data?.settings.shortcuts);
}

const MODIFIERS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock']);
const NAMED: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Enter: 'Enter',
  Space: 'Space',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** The combo a key press makes, like "Ctrl+Shift+K", or null for a lone modifier. */
export function comboOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (MODIFIERS.has(e.key)) return null;
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code;
  else key = NAMED[e.code];
  if (!key) return null;
  const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean);
  return [...mods, key].join('+');
}

// Browsers keep these for themselves, or they break copy, paste and undo.
const RESERVED = new Set([
  'Ctrl+N',
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+Shift+N',
  'Ctrl+Shift+T',
  'Ctrl+Shift+W',
  'Ctrl+Tab',
  'Ctrl+Shift+Tab',
  'Alt+F4',
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+X',
  'Ctrl+A',
  'Ctrl+Z',
  'Ctrl+Y',
  'Ctrl+Shift+Z',
  'Ctrl+F',
  'Ctrl+P',
  'Ctrl+R',
  'Ctrl+Shift+R',
  'Alt+Left',
  'Alt+Right',
  'Alt+Up',
  'Alt+Down',
]);

/** Why a combo can't be used for `id`, or null when it can. */
export function comboProblem(combo: string, id: ShortcutId, current: ShortcutMap): string | null {
  const parts = combo.split('+');
  if (!parts.includes('Ctrl') && !parts.includes('Alt') && !/^F\d+$/.test(parts[parts.length - 1]))
    return 'Include Ctrl or Alt, so it doesn’t clash with typing to search.';
  if (RESERVED.has(combo)) return `${combo} belongs to the browser or to editing text. Pick another.`;
  const taken = SHORTCUT_IDS.find((other) => other !== id && current[other] === combo);
  if (taken) return `${combo} already does “${SHORTCUTS[taken].label}”.`;
  return null;
}

/** The key caps shown on buttons, styled like the search bar's Ctrl K. */
export function Keys({ id, combo }: { id?: ShortcutId; combo?: string }) {
  const map = useShortcuts();
  const value = combo ?? (id ? map[id] : '');
  return (
    <span className="keys" aria-hidden>
      {value.split('+').map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  );
}
