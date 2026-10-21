import { BookOpen, ExternalLink, Keyboard, Scale, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useVault } from '../vault/vault-store';
import { LogoMark } from './LogoMark';
import { Keys } from './shortcuts';

/** Kept in step with host/developer-keys.Host.csproj and teams/manifest.json. */
export const APP_VERSION = '0.1.0';

type Go = (section: 'guide' | 'shortcuts' | 'backup' | 'environments') => void;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="guide-step">
      <span className="guide-n num" aria-hidden>
        {n}
      </span>
      <div>
        <h4>{title}</h4>
        {children}
      </div>
    </li>
  );
}

/** How to use Developer Keys, in the order you'll need it. */
export function GuideSection({ onGo }: { onGo: Go }) {
  return (
    <div className="panel-card guide">
      <div>
        <h3>Guide</h3>
        <p className="hint">Everything Developer Keys does, in the order you’ll use it. About 3 minutes to read.</p>
      </div>
      <ol className="guide-steps">
        <Step n={1} title="Your vault and master password">
          <p>
            Everything is encrypted on this PC with your master password before it’s saved. Nobody can open the vault without it, and it can’t be
            recovered, so keep a copy somewhere safe. Developer Keys locks itself after a few idle minutes; press <Keys id="lock" /> to lock now.
          </p>
        </Step>
        <Step n={2} title="Projects and environments">
          <p>
            A project holds one app or service. Each key can belong to an environment such as dev, stg or prod, or to none. The environment list is
            shared by every project; manage it in{' '}
            <button type="button" className="link-btn" onClick={() => onGo('environments')}>
              Environments
            </button>
            . Drag projects in the left menu to reorder them; the one Developer Keys opens on stays first.
          </p>
        </Step>
        <Step n={3} title="Add keys">
          <p>
            Press <Keys id="addKey" /> or <strong>Add key</strong>, pick a type (login, API token, connection string…) and fill in the fields. New
            keys start with no environment unless the list is filtered to one.
          </p>
          <p>
            With Claude Code signed in on this PC, <Keys id="smartAdd" /> opens <strong>Smart add</strong>: paste any details and Claude fills in the
            fields for you to check before saving.
          </p>
        </Step>
        <Step n={4} title="Find and copy">
          <p>
            <Keys id="search" /> searches every project. Enter copies the key’s main value (a login’s password) and shows the key for 30 seconds;
            Ctrl+Enter only copies. In a project, click a row to view a key and its pencil to edit it; tick rows (or press X) to move, duplicate or delete several at once. Use the table’s search, Environment and
            Type filters, and Columns to choose what you see.
          </p>
          <p>
            Click any value to copy it. In the list, <Keys combo="Up" /> <Keys combo="Down" /> move between keys, <Keys combo="C" /> copies the value
            and <Keys combo="U" /> the username. Copied secrets are cleared from the clipboard after 30 seconds.
          </p>
        </Step>
        <Step n={5} title="Backups">
          <p>
            Automatic backup keeps <code>Documents\Developer Keys Backups\Developer Keys auto-backup.dkvault</code> up to date after every change; it opens with
            your master password. Put that folder in OneDrive to keep a copy off this PC. Restore it from{' '}
            <button type="button" className="link-btn" onClick={() => onGo('backup')}>
              Backup &amp; restore
            </button>
            .
          </p>
        </Step>
        <Step n={6} title="Share with a teammate">
          <p>
            <strong>Share</strong> on a project creates an encrypted file with the environments you pick and a password you choose. Send the file,
            tell them the password another way, and they add it with Import.
          </p>
        </Step>
        <Step n={7} title="Use it in Microsoft Teams">
          <p>
            The setup saves <code>Developer Keys for Teams.zip</code> to your Downloads. In Teams:{' '}
            <strong>Apps → Manage your apps → Upload an app → Upload a custom app</strong>, pick the file, then pin Developer Keys. It works in Teams on
            this PC while Developer Keys is running.
          </p>
        </Step>
      </ol>
      <p className="hint guide-foot">
        Every shortcut can be changed in{' '}
        <button type="button" className="link-btn" onClick={() => onGo('shortcuts')}>
          Shortcuts
        </button>
        .
      </p>
    </div>
  );
}

/** Who made Developer Keys, what it is, and where your data lives. */
export function AboutSection({ onGo }: { onGo: Go }) {
  const { data } = useVault();
  const autoOn = data?.settings.autoBackup !== false;
  return (
    <div className="about">
      <section className="panel-card about-hero">
        <span className="about-mark">
          <LogoMark size={44} />
        </span>
        <div className="about-id">
          <h3>
            Developer Keys <span className="about-version num">v{APP_VERSION}</span>
          </h3>
          <p>The values developers forget, encrypted on your own PC and one click away in Teams.</p>
          <p className="about-by">
            Developed by <strong>Henry Azer</strong>
          </p>
        </div>
      </section>

      <section className="panel-card">
        <h3>Your data</h3>
        <dl className="about-facts">
          <div>
            <dt>Vault</dt>
            <dd>
              <code>%LOCALAPPDATA%\Developer Keys\vault.json</code>, with the last 20 versions in the history folder beside it.
            </dd>
          </div>
          <div>
            <dt>Encryption</dt>
            <dd>
              AES-256-GCM. The key comes from your master password (PBKDF2-SHA256, 600,000 rounds), and encryption happens before anything is saved.
            </dd>
          </div>
          <div>
            <dt>Backup</dt>
            <dd>
              {autoOn ? (
                <>
                  Automatic, to <code>Documents\Developer Keys Backups</code>, after every change.
                </>
              ) : (
                'Automatic backup is off.'
              )}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>
              None by itself. Smart add, shown only when Claude Code is signed in on this PC, sends what you paste to Claude through that sign-in.
            </dd>
          </div>
        </dl>
      </section>

      <nav className="about-links" aria-label="More about Developer Keys">
        <button type="button" className="about-link" onClick={() => onGo('guide')}>
          <BookOpen size={16} aria-hidden /> Guide
        </button>
        <button type="button" className="about-link" onClick={() => onGo('shortcuts')}>
          <Keyboard size={16} aria-hidden /> Shortcuts
        </button>
        <a className="about-link" href="/privacy.html" target="_blank" rel="noreferrer">
          <ShieldCheck size={16} aria-hidden /> Privacy <ExternalLink size={12} aria-hidden />
        </a>
        <a className="about-link" href="/terms.html" target="_blank" rel="noreferrer">
          <Scale size={16} aria-hidden /> Terms <ExternalLink size={12} aria-hidden />
        </a>
      </nav>
      <p className="about-legal">© 2026 Henry Azer · Open source under the MIT licence</p>
    </div>
  );
}
