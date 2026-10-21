import { describe, expect, it } from 'vitest';
import { comboOf, comboProblem, resolveShortcuts } from './shortcuts';

const press = (code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}, key = 'x') =>
  comboOf({ key, code, ctrlKey: !!mods.ctrl, metaKey: false, altKey: !!mods.alt, shiftKey: !!mods.shift });

describe('shortcuts', () => {
  it('names a key press', () => {
    expect(press('KeyN', { alt: true })).toBe('Alt+N');
    expect(press('KeyL', { ctrl: true, shift: true })).toBe('Ctrl+Shift+L');
    expect(press('Digit1', { alt: true })).toBe('Alt+1');
    expect(press('Comma', { ctrl: true })).toBe('Ctrl+,');
    expect(press('AltLeft', { alt: true }, 'Alt')).toBeNull();
  });

  it('applies custom keys over the defaults', () => {
    const keys = resolveShortcuts({ lock: 'Ctrl+Shift+L' });
    expect(keys.lock).toBe('Ctrl+Shift+L');
    expect(keys.addKey).toBe('Alt+N');
  });

  it('refuses combos that would clash', () => {
    const keys = resolveShortcuts(undefined);
    expect(comboProblem('Shift+K', 'lock', keys)).toMatch(/Ctrl or Alt/);
    expect(comboProblem('Ctrl+W', 'lock', keys)).toMatch(/browser/);
    expect(comboProblem('Alt+N', 'lock', keys)).toMatch(/Add a key/);
    expect(comboProblem('Ctrl+Shift+L', 'lock', keys)).toBeNull();
    expect(comboProblem('Alt+L', 'lock', keys)).toBeNull();
  });
});
