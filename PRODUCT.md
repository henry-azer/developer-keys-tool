# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One developer on their own Windows PC, working inside Microsoft Teams all day. Mid-task they need a value they don't remember: the staging URL, the test admin login, the API token for the sandbox, the DB connection string, the SSH key for a box. They want it in seconds, copied to the clipboard, without leaving Teams or opening a browser password manager. Occasionally they hand a project's environment to a teammate.

## Product Purpose

Developer Keys keeps every value a developer forgets, organised by project and environment, encrypted on their own machine. Success: finding and copying any value takes one shortcut and a few keystrokes, and nothing ever leaves the PC.

## Positioning

The only Teams vault that is 100% local: the app and the encrypted vault are both served from the user's own PC (`https://localhost:53917`), with no server, account or cloud storage, including Microsoft's. It's organised around developer concepts (project → environment → item), not websites.

## Operating Context

- Runs as a Teams personal tab (desktop and web on the same PC), or in a browser at `https://localhost:53917`.
- Used dozens of times a day in short bursts, between code, terminals and chats. Keyboard first.
- Follows the Teams theme: light, dark, high contrast.
- Sharing happens by encrypted file (export a project or environment, the teammate imports it). No live sync.

## Capabilities and Constraints

- Encryption in the page (WebCrypto): PBKDF2-SHA256 600k → AES-256-GCM. Titles, tags and URLs are encrypted too. The host only stores ciphertext.
- Master password unlock, auto-lock on idle. No password recovery: a forgotten master password means the vault is lost (backups use their own password).
- Item types: login, API token/secret (optional expiry), .env block, connection string, database, server/SSH host, SSH key, certificate/key file text, 2FA/TOTP secret (shows live codes), webhook/URL, licence key, note, custom fields. Every field is marked secret or not, and copyable.
- Export/import: encrypted `DEVVAULT_BACKUP_V1` files (whole vault, or one project/environment for sharing). Reads One Pass backups.
- Not available in Teams mobile. The host must be running.
- English only in v1.

## Brand Commitments

- Name: Developer Keys. Open source, MIT.
- Accent `#5B53E8` and the padlock icon already ship in the Teams package (`teams/package.mjs`).

## Evidence on Hand

No users, testimonials, benchmarks or press. Never invent them.

## Product Principles

1. Speed over browsing: search and copy beat navigating.
2. Nothing leaves the machine, and the UI never implies otherwise.
3. Secrets stay hidden until asked for, and copying never requires revealing.
4. Losing data is the worst failure: backups are always one click away and visibly current.
5. Feel native to Teams; don't fight the host.

## Accessibility & Inclusion

Must work fully by keyboard, follow the Teams high-contrast theme, and meet WCAG 2.2 AA.
