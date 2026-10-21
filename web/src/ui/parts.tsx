import { Check, CircleAlert, Copy, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { parseTotp, secondsLeft, totp } from '../crypto/totp';
import { useClipboard } from './clipboard';

/** Copies without revealing. Confirms in place with a check for 1.2s. */
export function CopyButton({ value, label, env, disabled }: { value: string; label: string; env?: string | null; disabled?: boolean }) {
  const { copy } = useClipboard();
  const [state, setState] = useState<'idle' | 'true' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const text = state === 'true' ? `Copied ${label}` : state === 'failed' ? `Couldn’t copy ${label}. Click the tab and try again.` : `Copy ${label}`;

  return (
    <button
      type="button"
      className="icon-btn copy-btn"
      data-copied={state}
      disabled={disabled || !value}
      aria-label={text}
      title={text}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copy(value, label, env);
        setState(ok ? 'true' : 'failed');
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState('idle'), ok ? 1200 : 3000);
      }}
    >
      {state === 'true' ? (
        <>
          <Check size={16} aria-hidden /> Copied
        </>
      ) : state === 'failed' ? (
        <CircleAlert size={16} aria-hidden />
      ) : (
        <Copy size={16} aria-hidden />
      )}
    </button>
  );
}

export interface TotpState {
  code: string | null;
  left: number;
  period: number;
  invalid: boolean;
}

/** The current 2FA code for a secret, refreshed every second. */
export function useTotp(secret: string): TotpState {
  const [state, setState] = useState<TotpState>({ code: null, left: 30, period: 30, invalid: false });

  useEffect(() => {
    let alive = true;
    let params: ReturnType<typeof parseTotp>;
    try {
      params = parseTotp(secret);
    } catch {
      setState((s) => ({ ...s, code: null, invalid: true }));
      return;
    }
    const tick = async () => {
      try {
        const code = await totp(params);
        if (alive) setState({ code, left: secondsLeft(params.period), period: params.period, invalid: false });
      } catch {
        if (alive) setState((s) => ({ ...s, code: null, invalid: true }));
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [secret]);

  return state;
}

/** The code with a ring that empties as its time runs out. */
export function TotpDisplay({ state, label }: { state: TotpState; label: string }) {
  if (state.invalid) return <span className="error-text">Not a valid 2FA secret</span>;
  if (!state.code) return <span className="totp num">––– –––</span>;
  const r = 6;
  const c = 2 * Math.PI * r;
  const spaced = state.code.length === 6 ? `${state.code.slice(0, 3)} ${state.code.slice(3)}` : state.code;
  return (
    <span className="totp num" data-low={state.left <= 5}>
      <span aria-label={`${label} code ${state.code}, ${state.left} seconds left`}>{spaced}</span>
      <svg className="totp-ring" viewBox="0 0 16 16" aria-hidden>
        <circle className="track" cx="8" cy="8" r={r} />
        <circle className="left" cx="8" cy="8" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - state.left / state.period)} />
      </svg>
    </span>
  );
}

export function TotpCode({ secret, label }: { secret: string; label: string }) {
  const state = useTotp(secret);
  return (
    <span className="row-tools">
      <TotpDisplay state={state} label={label} />
      {state.code && <CopyButton value={state.code} label={`${label} code`} />}
    </span>
  );
}

/**
 * The line above a form's fields that says what's wrong or still missing.
 * `rule` shows only once the user has typed and it's broken; both show in red.
 */
export function FormNote({
  error,
  rule,
  touched,
  hint,
}: {
  error?: string | null;
  rule?: string | null;
  touched?: boolean;
  /** Grey guidance shown whenever there's no error. */
  hint?: string;
}) {
  // A broken rule only counts once the user has typed.
  const problem = error ?? (touched ? rule : null);
  const text = problem ?? hint ?? '';
  // The line always keeps its space, so the form never jumps. It stays in the
  // DOM as a live region, so screen readers hear each error as it appears.
  return (
    <p className={`form-note ${problem ? 'error-text' : 'hint'}`} data-show={!!text} aria-live={problem ? 'assertive' : 'off'}>
      {text}
    </p>
  );
}

/**
 * A form that locks while it works: Enter or Submit disables every field
 * (one <fieldset disabled>), so nothing more can be typed or sent twice.
 */
export function BusyForm({
  busy,
  onSubmit,
  children,
  id,
  className,
  style,
}: {
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  id?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <form
      id={id}
      noValidate
      aria-busy={busy}
      onSubmit={(e) => {
        if (busy) return e.preventDefault();
        onSubmit(e);
      }}
    >
      <fieldset disabled={busy} className={`form-set ${className ?? ''}`} style={style}>
        {children}
      </fieldset>
    </form>
  );
}

/** A button that shows a spinner in place of its label while `busy`, at the same size. */
export function BusyButton({
  busy,
  busyLabel,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean; busyLabel: string }) {
  return (
    <button {...rest} disabled={disabled || busy} aria-busy={busy}>
      <span className="btn-label">{children}</span>
      {busy && (
        <>
          <LoaderCircle size={18} className="spin btn-spinner" aria-hidden />
          <span className="sr-only" role="status">
            {busyLabel}
          </span>
        </>
      )}
    </button>
  );
}

/** A native <dialog> opened as a modal: focus trap, Escape and backdrop for free. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  variant = 'modal',
  labelledBy,
  description,
  className,
}: {
  title: ReactNode;
  /** One line under the title saying what the dialog is for. */
  description?: ReactNode;
  className?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'modal' | 'sheet';
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = labelledBy ?? `dlg-${variant}`;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // showModal focuses the first control (the close button); prefer the marked field.
    d?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className={className ? `${variant} ${className}` : variant}
      aria-labelledby={headingId}
      aria-describedby={description ? `${headingId}-desc` : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // A press on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <div className="dialog-title">
          <h2 id={headingId}>{title}</h2>
          {description && <p id={`${headingId}-desc`}>{description}</p>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-foot">{footer}</div>}
    </dialog>
  );
}
