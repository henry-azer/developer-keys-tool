import { Eye, EyeOff, Fingerprint, TriangleAlert } from 'lucide-react';
import { LogoMark } from './LogoMark';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BusyButton, BusyForm, FormNote } from './parts';
import { WrongPasswordError } from '../crypto/vault-crypto';
import { disableHello, HelloCancelledError, helloStatus } from '../storage/host-api';
import { useVault } from '../vault/vault-store';
import { strength } from './format';

export function Wordmark() {
  return (
    <div className="wordmark">
      <LogoMark size={24} />
      Developer Keys
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoFocus,
  autoComplete,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  autoComplete: string;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="input-group">
      <input
        id={id}
        className="input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={!!invalid}
      />
      <button
        type="button"
        className="icon-btn"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

const STRENGTH_LABEL = ['Password strength', 'Very weak', 'Weak', 'Good', 'Strong'];

/** Four bars and a word for how strong a password is. Advice only; it never blocks. */
export function StrengthMeter({ pw }: { pw: string }) {
  const level = strength(pw);
  return (
    <>
      <div className="strength" data-level={level} aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="strength-label" aria-live="polite">
        {STRENGTH_LABEL[level]}
      </div>
    </>
  );
}

function CreateVault() {
  const { create } = useVault();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rule =
    pw.length < 10 ? 'Use at least 10 characters. A short sentence works well.' : confirm && pw !== confirm ? 'The two passwords don’t match.' : null;
  const valid = pw.length >= 10 && pw === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await create(pw);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Create your vault</h1>
      <p>Choose a master password.</p>
      <BusyForm busy={busy} onSubmit={submit} className="gate-form">
        <div className="note">
          <TriangleAlert size={16} aria-hidden />
          <span>There’s no way to recover this password. If you forget it, the vault can’t be opened, so keep a copy somewhere safe.</span>
        </div>
        <FormNote error={error} rule={rule} touched={pw.length > 0} hint="Use at least 10 characters. A short sentence works well." />
        <div>
          <label className="field-label" htmlFor="new-pw">
            Master password
          </label>
          <PasswordInput id="new-pw" value={pw} onChange={setPw} autoFocus autoComplete="new-password" invalid={pw.length > 0 && pw.length < 10} />
          <StrengthMeter pw={pw} />
        </div>
        <div>
          <label className="field-label" htmlFor="confirm-pw">
            Type it again
          </label>
          <PasswordInput
            id="confirm-pw"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            invalid={confirm.length > 0 && confirm !== pw}
          />
        </div>
        <BusyButton className="btn btn-primary" busy={busy} busyLabel="Creating your vault" disabled={!valid}>
          Create vault
        </BusyButton>
      </BusyForm>
    </>
  );
}

function UnlockVault() {
  const { unlock, unlockWithHello } = useVault();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'hello' | null>(null);
  const [hello, setHello] = useState(false);
  // Only a wrong password marks the field; a Windows Hello problem doesn't.
  const [attempt, setAttempt] = useState<'password' | 'hello'>('password');
  const inputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    helloStatus().then((h) => setHello(h.available && h.enabled));
  }, []);
  // Typing anywhere outside a text field goes into the password field; Enter anywhere unlocks, as long as a password is typed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const inField = !!el?.closest('input, textarea, select, [contenteditable="true"]');
      if (!inField && !busy && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Focusing during keydown lets the browser deliver this keystroke to the input.
        inputRef.current?.querySelector('input')?.focus();
        return;
      }
      if (e.key !== 'Enter' || busy || !pw) return;
      if (el?.closest('input, textarea, button, select, a')) return;
      e.preventDefault();
      document.querySelector<HTMLFormElement>('#unlock-form')?.requestSubmit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pw, busy]);
  // Fields are disabled while unlocking; once a wrong password re-enables them, select it for retyping.
  useEffect(() => {
    if (error && !busy) inputRef.current?.querySelector('input')?.select();
  }, [error, busy]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setBusy('password');
    setAttempt('password');
    setError(null);
    try {
      await unlock(pw);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'That password didn’t open the vault. Check Caps Lock and try again.' : (err as Error).message);
      setBusy(null);
    }
  }

  async function helloUnlock() {
    setBusy('hello');
    setAttempt('hello');
    setError(null);
    try {
      await unlockWithHello();
    } catch (err) {
      setBusy(null);
      // Cancelling the Windows prompt is a choice, not an error.
      if (err instanceof HelloCancelledError) return;
      if (err instanceof WrongPasswordError) {
        // The sealed key belongs to an older vault; it can never open this one.
        await disableHello().catch(() => undefined);
        setError('Windows Hello no longer matches this vault. Unlock with your master password, then turn it on again in Settings.');
      } else setError((err as Error).message);
      const h = await helloStatus();
      setHello(h.available && h.enabled);
    }
  }

  return (
    <>
      <h1>Unlock your vault</h1>
      <p>{hello ? 'Use Windows Hello, or enter your master password.' : 'Enter your master password to open your vault.'}</p>
      <BusyForm busy={!!busy} onSubmit={submit} className="gate-form" id="unlock-form">
        <FormNote error={error} />
        <div>
          <label className="field-label" htmlFor="unlock-pw">
            Master password
          </label>
          <div ref={inputRef}>
            <PasswordInput
              id="unlock-pw"
              value={pw}
              onChange={(v) => (setPw(v), setError(null))}
              autoFocus
              autoComplete="current-password"
              invalid={!!error && attempt === 'password'}
            />
          </div>
        </div>
        {/* With Windows Hello on, the fingerprint leads and the password is the fallback; Enter still submits the password. */}
        <div className="gate-actions">
          {hello && (
            <BusyButton type="button" className="btn btn-primary" busy={busy === 'hello'} busyLabel="Waiting for Windows Hello" onClick={helloUnlock}>
              <Fingerprint size={18} aria-hidden />
              Unlock with Windows Hello
            </BusyButton>
          )}
          <BusyButton className={hello ? 'btn btn-secondary' : 'btn btn-primary'} busy={busy === 'password'} busyLabel="Unlocking" disabled={!pw}>
            Unlock
          </BusyButton>
        </div>
      </BusyForm>
    </>
  );
}

function NoHost({ message }: { message: string }) {
  const { reload } = useVault();
  return (
    <>
      <h1>Developer Keys isn’t running</h1>
      <p>This tab loads from the Developer Keys host on your PC, and it didn’t answer ({message}).</p>
      <ol className="steps">
        <li>
          Start it: run <code>developer-keys.Host</code>, or <code>dotnet run</code> in the <code>host</code> folder.
        </li>
        <li>
          To start it automatically when you sign in, run <code>developer-keys.Host install</code> once.
        </li>
      </ol>
      <button className="btn btn-primary" onClick={reload}>
        Try again
      </button>
    </>
  );
}

export function Gate() {
  const { status } = useVault();
  return (
    <main className="gate">
      <div className="gate-inner">
        <Wordmark />
        {status.kind === 'loading' && (
          <p style={{ marginTop: 40 }} role="status">
            Opening…
          </p>
        )}
        {status.kind === 'no-host' && <NoHost message={status.message} />}
        {status.kind === 'new' && <CreateVault />}
        {status.kind === 'locked' && <UnlockVault />}
        <div className="meta">Stored only on this PC, encrypted with AES-256. Nothing is sent anywhere.</div>
      </div>
    </main>
  );
}
