---
name: Developer Keys
description: A local, encrypted key-by-environment vault that lives in a Microsoft Teams personal tab.
colors:
  ink-rail: "#1b1a2e"
  ink-rail-raise: "#2a2944"
  rail-fg: "#e4e2f7"
  rail-muted: "#a3a0c9"
  rail-link: "#c4c0ff"
  rail-amber: "#f2b84b"
  rail-green: "#4fc48b"
  rail-error: "#ffb4ab"
  vault-indigo: "#5b53e8"
  vault-indigo-hover: "#4a42d6"
  vault-indigo-strong: "#3b34b8"
  vault-indigo-soft: "#e9e7fd"
  accent-ink: "#ffffff"
  cool-ground: "#f5f5f7"
  surface: "#ffffff"
  surface-2: "#ecebf3"
  line: "#e4e3ec"
  ink: "#1b1a2e"
  ink-2: "#57556e"
  ink-3: "#75738b"
  warn-bg: "#fff1d6"
  warn-ink: "#7a4d00"
  danger: "#b42318"
  danger-bg: "#fde8e6"
  ok: "#0f7b4a"
typography:
  display:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  title-sm:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  code:
    fontFamily: "'Cascadia Mono', Consolas, ui-monospace, monospace"
    fontSize: "13px"
    lineHeight: 1.5
  totp:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "0.08em"
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  full: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  cell: "14px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.vault-indigo}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.vault-indigo-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "32px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    size: "30px"
  copy-button-copied:
    textColor: "{colors.ok}"
    typography: "{typography.caption}"
    padding: "0 8px 0 6px"
    height: "30px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    height: "34px"
  pill:
    backgroundColor: "{colors.vault-indigo-soft}"
    textColor: "{colors.vault-indigo-strong}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0 8px"
    height: "20px"
  pill-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-ink}"
  pill-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger}"
  type-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "32px"
  rail:
    backgroundColor: "{colors.ink-rail}"
    textColor: "{colors.rail-fg}"
    padding: "18px 12px 12px"
    width: "248px"
  search-trigger:
    backgroundColor: "{colors.ink-rail-raise}"
    textColor: "{colors.rail-muted}"
    rounded: "{rounded.md}"
    height: "36px"
  project-link:
    backgroundColor: "transparent"
    textColor: "{colors.rail-fg}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  project-link-hover:
    backgroundColor: "{colors.ink-rail-raise}"
  project-link-active:
    backgroundColor: "{colors.vault-indigo}"
    textColor: "{colors.accent-ink}"
  rail-status:
    backgroundColor: "{colors.ink-rail-raise}"
    textColor: "{colors.rail-fg}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  matrix:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  matrix-header:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "10px 14px"
  matrix-header-prod:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.warn-ink}"
  matrix-cell:
    padding: "7px 6px 7px 14px"
  modal:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    width: "520px"
  sheet:
    backgroundColor: "{colors.surface}"
    width: "480px"
  dialog-foot:
    backgroundColor: "{colors.surface-2}"
    padding: "14px 20px"
  palette:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    width: "640px"
  palette-item-selected:
    backgroundColor: "{colors.vault-indigo-soft}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
---

# Design System: Developer Keys

## Overview

**Creative North Star: "The Config Table"**

Developer Keys looks like the thing a developer already keeps in their head: a table of keys down the side and environments across the top. Every value sits in a cell, every cell has a copy target, and secrets stay masked while they are copied. The shell is Fluent-native so it disappears inside Microsoft Teams: a deep ink rail on the left owns navigation and the vault's own status (clipboard countdown, last backup), and a cool neutral ground on the right holds white table surfaces.

Density is "working tool", not "dashboard": 14px body, 32px controls, 36px rail rows, one accent colour. The indigo `vault-indigo` does three jobs only: the selected project, the primary action and focus. Success green confirms a copy. Amber and red are reserved for production, expiry and danger. Depth comes from tone (rail vs ground vs surface vs surface-2), not shadows; only overlays float.

The system ships three complete themes from one token set: light (default), dark, and Teams high contrast (black, white, yellow, cyan). Every component is written against custom properties, so a new surface inherits all three themes by using the tokens and nothing else.

**Key Characteristics:**
- Two-zone shell: 248px ink rail plus a cool ground with white surfaces.
- The environment matrix is the signature: key column 220px, one column per environment, a copy target in every cell.
- Token, webhook and licence secrets render as a known prefix, a dotted run and the last 4 characters (`sk_live_••••77de`); connection strings show only scheme and host; everything else is dots only.
- Copy confirms in place for 1.2s; the rail then counts down to clearing the clipboard.
- Flat tonal layering; shadow only on dialogs, sheet and palette.
- Segoe UI throughout, tabular figures for every number, Cascadia Mono for code.

## Colors

One cool indigo accent on near-neutral, faintly violet greys, with an ink-navy rail as the system's darkest and most recognisable surface.

### Primary
- **Vault Indigo** (`vault-indigo`): the brand accent from the Teams package. Selected project in the rail, primary buttons (Add key, Save), focus rings and outlines, input focus borders, the TOTP countdown ring, text selection. Hover deepens to `vault-indigo-hover`; `vault-indigo-strong` and `vault-indigo-soft` form the pill and selected-palette-row pair.

### Neutral
- **Ink Rail** (`ink-rail`): the navigation rail and the full-bleed unlock gate. Also the body text colour in light mode (`ink`), so the rail reads as "the ink, poured out".
- **Rail Raise** (`ink-rail-raise`): anything sitting on the rail: search trigger, status cards, hovered project rows, gate inputs, `kbd` keys.
- **Rail text trio** (`rail-fg`, `rail-muted`, `rail-link`): primary text, secondary text and inline actions ("Back up", "Clear now") on the rail.
- **Cool Ground** (`cool-ground`): the main canvas behind tables.
- **Surface / Surface 2** (`surface`, `surface-2`): white table and panel bodies; surface-2 is the matrix header row, dialog footers, palette footer and hover fills.
- **Line** (`line`): 1px row dividers and input strokes. No other borders in light/dark.
- **Ink 2 / Ink 3** (`ink-2`, `ink-3`): secondary text and masked dots; placeholders and the ghost "+ Add" in empty cells.

### Status
- **Warn** (`warn-bg`, `warn-ink`): production column headers (text plus shield), "Expires in N days" pills, sync/save banners.
- **Danger** (`danger`, `danger-bg`): expired pills, delete buttons, copy failure, TOTP ring under 5 seconds.
- **OK** (`ok`): the "Copied" check and success text.
- **Rail status lamps** (`rail-amber`, `rail-green`, `rail-error`): status icons, strength meter and gate errors on the dark rail and gate. These stay fixed across themes because they always sit on the dark rail.

### Themes

Dark and high-contrast reassign the same custom properties on `:root` (`data-theme='dark'` / `'contrast'`, or `prefers-color-scheme: dark` outside Teams). Values:

| Token | Dark | High contrast |
|---|---|---|
| `--rail` / `--rail-raise` | #121120 / #232238 | #000000 / #000000 |
| `--rail-fg` / `--rail-muted` / `--rail-link` | (light) / #9f9cc4 / (light) | #ffffff / #ffffff / #ffff00 |
| `--ground` / `--surface` / `--surface-2` | #1b1a28 / #242337 / #2c2b43 | #000000 / #000000 / #000000 |
| `--line` | #36354f | #ffffff |
| `--ink` / `--ink-2` / `--ink-3` | #f3f2fa / #b8b6cf / #9a98b3 | #ffffff / #ffffff / #ffffff |
| `--accent` / `--accent-hover` / `--accent-ink` | #918bf6 / #a7a2f8 / #121120 | #ffff00 / #ffff00 / #000000 |
| `--accent-soft` / `--accent-strong` | #33306a / #cdc9ff | #000000 / #ffff00 |
| `--warn-bg` / `--warn-ink` | #4a3612 / #ffd99a | #000000 / #ffff00 |
| `--danger` / `--danger-bg` | #ff8a80 / #4a1f1c | #ff6b6b / #000000 |
| `--ok` / `--focus` | #6fd3a2 / #b3aefa | #3ff23f / #00ffff |
| `--scrim` | rgb(0 0 0 / 0.55) | rgb(0 0 0 / 0.8) |

### Named Rules

**The Three Jobs Rule.** Vault Indigo marks selection, the primary action and focus. Nothing decorative is ever indigo; one filled indigo button per view.

**The Token-Only Rule.** Components use the custom properties, never literal colours, so light, dark and high contrast all work without per-theme code. The only literals allowed are the rail status lamps, which always sit on the dark rail.

**The Contrast Outline Rule.** High contrast flattens every surface to black, so any element that relied on a tonal fill to read as a container (matrix, panels, rail status, search trigger, secondary buttons, dialogs, the selected palette row) gains a 1-2px `--line` or accent border under `data-theme='contrast'`.

## Typography

**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui)
**Code Font:** Cascadia Mono (with Consolas, ui-monospace)

**Character:** The Windows/Teams native face, used plainly so the tab feels like part of Teams. Hierarchy comes from size and weight 600, not from a second family.

### Hierarchy
- **Display** (600, 32px, 1.15, -0.02em): unlock/create gate heading only.
- **Headline** (600, 24px, 1.2, -0.01em): project title at the top of the main view.
- **Title** (600, 18px): dialog and sheet headings. **Title small** (600, 16px): section headings ("All environments"); 20px for empty-state headings; 15px for settings groups.
- **Body** (400, 14px, 1.45): everything else, including cell values. Gate copy is capped at 46ch, empty-state copy at 56ch.
- **Label** (600, 13px): field labels, matrix header cells, rail section heading, hints at 400.
- **Caption** (12px): key-type hints under key names, counts, pills (600), palette "where" lines, `kbd` (600, 11px).
- **Code** (13px, 1.5): textareas for .env blocks, keys and certificates; inline `code`.
- **TOTP** (600, 18px, 0.08em, tabular): live 2FA codes, split "142 693".

### Named Rules

**The Tabular Rule.** Every number that changes or lines up (counts, countdowns, TOTP codes) uses `font-variant-numeric: tabular-nums` via the `num` class.

**The Dotted Run Rule.** Masked secrets are a run of bullets in `ink-2` with 0.12em tracking: 4 dots between a known prefix and the last 4 characters, or 8 dots when no hint is safe to show.

## Layout

- **Shell:** CSS grid, `248px | minmax(0, 1fr)`, full height. Rail padding 18px 12px 12px; main padding `28px clamp(16px, 3vw, 40px) 64px`, scrolls independently.
- **Rail order:** wordmark, Ctrl K search trigger, "Projects" heading with a + button, scrolling project list, then a foot with clipboard countdown, backup status and Settings / Lock.
- **Main order:** project head (title + one-line status left; Share, project settings, Add key right), the matrix, then "All environments" 40px below.
- **Matrix:** fixed table layout, key column `--key-w` (220px) sticky on horizontal scroll, minimum 200px per environment column (`--envs` set inline). Cells pad 7px 6px 7px 14px; key cells 12px 14px.
- **Shared list alignment:** environment-independent rows use a grid whose first column is `--key-w - 14px`, so their values line up under the first environment column.
- **Breakpoints:** ≤1200px (Teams' usual tab width): rail 216px, key column 176px, env columns 168px min. ≤760px: the rail collapses into a top bar with a horizontally scrolling project strip, rail statuses hide, Settings/Lock become icon-only top right, key column 150px, shared-row previews wrap under the title, two-up form rows stack.
- **Rhythm:** 4px base. Common steps 4, 8, 14 (cell inset), 16, 24, 40. Gaps inside controls 2-10px.

## Elevation & Depth

Flat by default. Depth is tonal: rail (darkest) > ground > surface > surface-2. Tables and panels have no border and no shadow in light and dark; they separate from the ground by fill alone.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 32px rgb(20 19 34 / 0.18), 0 2px 6px rgb(20 19 34 / 0.12)`): dialogs, the item sheet and the command palette only, always over the scrim (`rgb(20 19 34 / 0.45)` in light).

### Named Rules

**The Only-Overlays-Float Rule.** A shadow means "this is on top of the app and Escape closes it". Nothing in-page casts one.

## Shapes

Gently rounded, never pill-shaped except where the element is a tag. Controls and rows: 6px (`--radius`). Tables, panels and empty states: 8px. Modals and the palette: 10px. Small inline things (file button, `kbd`, ghost Add, inline code): 4px. Pills and type chips: fully round. The sheet is square-edged and full-height on the right. Icons are Lucide line icons at 14-18px; the wordmark is the padlock/key mark in `rail-link`.

## Components

### Buttons
Quiet and compact; weight 600 carries them.
- **Shape:** 6px radius, 32px tall, 0 14px padding, 6px icon gap (40px tall on the gate).
- **Primary:** Vault Indigo fill, white text; hover deepens. One per view.
- **Secondary:** surface fill with a `line` stroke; hover fills surface-2.
- **Ghost:** no fill, `ink-2` text (Share, Delete in the sheet foot); hover fills surface-2.
- **Danger:** `danger-bg` fill, `danger` text.
- **Press:** `scale(0.97)` over 160ms `--ease-out`. Hover styles apply only under `(hover: hover) and (pointer: fine)`. Disabled is 50% opacity.

### Icon button and copy target
- 30px square, 6px radius, `ink-2` icon; hover fills surface-2. Press `scale(0.94)`.
- **Copied state:** the copy icon becomes a check and the word "Copied" in `ok`, 12px/600, the button widens to fit, the check scales to 1.1. Lasts 1.2s, then returns. Failure shows an alert icon in `danger` for 3s with a "Click the tab and try again" label. A polite live region announces both.

### Inputs / Fields
- **Style:** surface fill, 1px `line` stroke, 6px radius, 34px min height, 6px 10px padding. Labels 13px/600 above with 6px gap; hints 13px `ink-2` below.
- **Input group:** the stroke wraps the input plus trailing icon buttons (reveal, generate, copy).
- **Focus:** border becomes Vault Indigo plus a 1px indigo ring (`box-shadow: 0 0 0 1px`); no outline. Everything else uses the global 2px `--focus` outline at 2px offset.
- **Masked textareas** use `-webkit-text-security: disc` and the code font.
- **Error:** 13px `danger` text under the field.

### Pills and chips
- **Pill:** 20px tall, fully round, 12px/600. Default indigo-soft on indigo-strong (environment tags in the palette); warn and danger variants for expiry.
- **Type chip:** 32px outlined round chip in empty states; hover turns the stroke indigo.

### Navigation rail
- Ink Rail fill. Project rows 36px, 6px radius, name truncates with an ellipsis, item count right in `rail-muted` tabular.
- Hover: Rail Raise fill. Selected: Vault Indigo fill, white 600 text (`aria-current`).
- **Rail status cards:** Rail Raise fill, 8px 10px padding, a lamp icon (green ok, amber stale), text, and an inline `rail-link` action. Two kinds: "Clears in Ns · Clear now" while something is on the clipboard, and "Backed up N ago · Back up" always.

### Environment matrix (signature)
- White surface, 8px radius, overflow-x scroll inside its wrapper. Header row surface-2, 13px/600, 10px 14px.
- **Production columns** (`prod`, `production`, `live`): header text in `warn-ink` with a 14px shield icon and a hidden "(production)" label.
- Rows divided by 1px `line`; hovered row tints 45% surface-2.
- Each cell: the value (clickable, opens the sheet) truncated to one line, plus a copy target. Empty cells show a ghost "+ Add" in `ink-3` that turns indigo on hover.
- **Masked-secret hints:** logins show `user · ••••••••`; connection strings show `scheme://••••@host`; tokens, webhooks and licence keys of 12+ characters show their known prefix (`sk_live_`, `whsec_`) and last 4. Test and live keys differ at a glance without being revealed.
- Expiry pills sit under the value.

### All-environments list
- One surface panel, rows divided by `line`, title (600) with a 12px type hint, preview aligned under the first environment column, tools right. TOTP rows show the live code with a 16px ring that empties over the period and turns `danger` at ≤5s.

### Item sheet
- Native `<dialog>` docked right, full height, `min(480px, 100vw)`, slides in over 240ms `cubic-bezier(0.32, 0.72, 0, 1)`. Head 18px title with a close X; body is a 18px-gap grid of fields (two-up for type/environment); foot on surface-2 with Delete left, Cancel + Save right.

### Modal
- Native `<dialog>`, `min(520px, 100vw - 32px)`, 10px radius, Float shadow, scales in from 0.97 over 180ms `--ease-out`. Same head/body/foot as the sheet. Reduced motion swaps both for a 150ms fade.

### Command palette
- Opened by Ctrl K or the rail's search trigger. Dialog at 12vh from the top, `min(640px, 100vw - 32px)`, 10px radius. 52px input row with a search icon, 16px text. Results: 600 title, 12px "project · environment · type" line, environment pill right; the selected row fills indigo-soft. Footer on surface-2 lists Enter copy, Shift+Enter open, Esc close as `kbd` keys.

### Unlock gate
- Full-bleed Ink Rail with the wordmark, a 32px display heading, `rail-muted` copy, Rail Raise inputs that focus to `rail-link`, a four-segment strength meter (amber at 1-2, green at 3-4) and an amber-icon note card.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the custom properties so light, dark and high contrast work with no extra code.
- **Do** give every value a copy target that works without revealing it, and confirm the copy in place for 1.2s.
- **Do** show masked secrets as prefix + dotted run + last 4 when the type allows it.
- **Do** add a `--line` border under `data-theme='contrast'` to anything that depended on a tonal fill to read as a container.
- **Do** mark production environments with `warn-ink` and the shield icon.
- **Do** use native `<dialog>` for modal, sheet and palette so focus trap and Escape come free.
- **Do** gate hover styles behind `(hover: hover) and (pointer: fine)` and provide a reduced-motion fade.

### Don't:
- **Don't** use Vault Indigo for decoration, illustration or more than one filled button per view.
- **Don't** add shadows to in-page cards, tables or panels; only overlays float.
- **Don't** reveal a secret to copy it or show a full secret in the matrix.
- **Don't** introduce a second typeface or a display face; Segoe UI and Cascadia Mono only.
- **Don't** hardcode hex colours in components; the rail lamps are the only exception.
