import { app, clipboard } from '@microsoft/teams-js';
import { Check, CircleAlert, ShieldAlert } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Copies values and clears the clipboard again after a delay. Inside Teams the
 * tab's iframe can't use navigator.clipboard, so the Teams SDK writes for us.
 * Clearing is best effort: browsers only allow it while the tab has focus.
 */
interface ClipboardApi {
  /** `env` is shown in the confirmation, so a prod copy never passes for a dev one. */
  copy(value: string, label: string, env?: string | null): Promise<boolean>;
  /** Shows a short confirmation at the bottom of the screen, like "Removed uat." */
  notify(text: string, ok?: boolean): void;
  /** What was last copied and how many seconds until it's cleared. */
  pending: { label: string; secondsLeft: number } | null;
  clearNow(): void;
}

const Ctx = createContext<ClipboardApi | null>(null);
export const useClipboard = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useClipboard outside ClipboardProvider');
  return c;
};

async function write(text: string): Promise<boolean> {
  try {
    if (app.isInitialized() && clipboard.isSupported()) {
      await clipboard.write(new Blob([text], { type: 'text/plain' }));
      return true;
    }
  } catch {
    /* fall through to the browser APIs */
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function ClipboardProvider({ clearAfter, children }: { clearAfter: number; children: ReactNode }) {
  const [pending, setPending] = useState<ClipboardApi['pending']>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string; env: string | null; n: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  const clearNow = useCallback(() => {
    window.clearInterval(timer.current);
    setPending(null);
    void write(' ');
  }, []);

  const show = useCallback((ok: boolean, text: string, env: string | null = null) => {
    setToast((t) => ({ ok, text, env, n: (t?.n ?? 0) + 1 }));
    window.clearTimeout(toastTimer.current);
    // Long messages stay up longer, so they can be read.
    toastTimer.current = window.setTimeout(() => setToast(null), Math.min(8000, (ok ? 2200 : 5000) + text.length * 25));
  }, []);
  const notify = useCallback((text: string, ok = true) => show(ok, text), [show]);

  const copy = useCallback(
    async (value: string, label: string, env: string | null = null) => {
      const ok = await write(value);
      show(ok, ok ? `Copied ${label}` : `Couldn’t copy ${label}. Click inside Developer Keys, then try again.`, env);
      if (!ok) return false;
      window.clearInterval(timer.current);
      if (clearAfter > 0) {
        const until = Date.now() + clearAfter * 1000;
        setPending({ label, secondsLeft: clearAfter });
        timer.current = window.setInterval(() => {
          const left = Math.ceil((until - Date.now()) / 1000);
          if (left <= 0) clearNow();
          else setPending({ label, secondsLeft: left });
        }, 250);
      }
      return true;
    },
    [clearAfter, clearNow, show],
  );

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      window.clearTimeout(toastTimer.current);
    },
    [],
  );

  return (
    <Ctx.Provider value={{ copy, notify, pending, clearNow }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.n} className="toast" data-ok={toast.ok}>
            {toast.ok ? <Check size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
            {toast.env && (
              <span className="toast-env" data-prod={/^(prod|production|live)$/i.test(toast.env) || undefined}>
                {/^(prod|production|live)$/i.test(toast.env) && <ShieldAlert size={12} aria-hidden />}
                {toast.env}
              </span>
            )}
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
