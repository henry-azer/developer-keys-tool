import { newId, type Field, type FieldKind, type ItemType } from './model';

interface FieldTemplate {
  label: string;
  kind: FieldKind;
  secret?: boolean;
}

export interface ItemTypeInfo {
  type: ItemType;
  label: string;
  /** The field copied by Enter in search and by the row's copy button. */
  primary: string;
  fields: FieldTemplate[];
  /** Whether the item usually differs per environment. */
  perEnvironment: boolean;
  canExpire?: boolean;
}

export const ITEM_TYPES: ItemTypeInfo[] = [
  {
    type: 'login',
    label: 'Login',
    primary: 'Password',
    perEnvironment: true,
    fields: [
      { label: 'Username', kind: 'text' },
      { label: 'Password', kind: 'text', secret: true },
      { label: 'URL', kind: 'url' },
      { label: '2FA secret', kind: 'totp', secret: true },
    ],
  },
  {
    type: 'token',
    label: 'API token',
    primary: 'Token',
    perEnvironment: true,
    canExpire: true,
    fields: [
      { label: 'Token', kind: 'text', secret: true },
      { label: 'Header', kind: 'text' },
      { label: 'Scopes', kind: 'text' },
    ],
  },
  {
    type: 'env',
    label: '.env block',
    primary: 'Contents',
    perEnvironment: true,
    fields: [{ label: 'Contents', kind: 'multiline', secret: true }],
  },
  {
    type: 'connection',
    label: 'Connection string',
    primary: 'Connection string',
    perEnvironment: true,
    fields: [{ label: 'Connection string', kind: 'text', secret: true }],
  },
  {
    type: 'database',
    label: 'Database',
    primary: 'Password',
    perEnvironment: true,
    fields: [
      { label: 'Engine', kind: 'text' },
      { label: 'Host', kind: 'text' },
      { label: 'Port', kind: 'number' },
      { label: 'Database', kind: 'text' },
      { label: 'Username', kind: 'text' },
      { label: 'Password', kind: 'text', secret: true },
    ],
  },
  {
    type: 'server',
    label: 'Server / SSH host',
    primary: 'Password',
    perEnvironment: true,
    fields: [
      { label: 'Host', kind: 'text' },
      { label: 'Port', kind: 'number' },
      { label: 'Username', kind: 'text' },
      { label: 'Password', kind: 'text', secret: true },
      { label: 'SSH command', kind: 'text' },
    ],
  },
  {
    type: 'ssh-key',
    label: 'SSH key',
    primary: 'Private key',
    perEnvironment: false,
    fields: [
      { label: 'Private key', kind: 'multiline', secret: true },
      { label: 'Public key', kind: 'multiline' },
      { label: 'Passphrase', kind: 'text', secret: true },
    ],
  },
  {
    type: 'certificate',
    label: 'Certificate',
    primary: 'Private key',
    perEnvironment: true,
    canExpire: true,
    fields: [
      { label: 'Certificate', kind: 'multiline' },
      { label: 'Private key', kind: 'multiline', secret: true },
      { label: 'Password', kind: 'text', secret: true },
    ],
  },
  {
    type: 'totp',
    label: '2FA code',
    primary: 'Secret',
    perEnvironment: false,
    fields: [
      { label: 'Secret', kind: 'totp', secret: true },
      { label: 'Account', kind: 'text' },
      { label: 'Recovery codes', kind: 'multiline', secret: true },
    ],
  },
  {
    type: 'webhook',
    label: 'Webhook / URL',
    primary: 'URL',
    perEnvironment: true,
    fields: [
      { label: 'URL', kind: 'url' },
      { label: 'Signing secret', kind: 'text', secret: true },
    ],
  },
  {
    type: 'license',
    label: 'Licence key',
    primary: 'Key',
    perEnvironment: false,
    canExpire: true,
    fields: [
      { label: 'Key', kind: 'text', secret: true },
      { label: 'Licensed to', kind: 'text' },
    ],
  },
  {
    type: 'note',
    label: 'Note',
    primary: 'Note',
    perEnvironment: false,
    fields: [{ label: 'Note', kind: 'multiline' }],
  },
  {
    type: 'custom',
    label: 'Custom',
    primary: 'Value',
    perEnvironment: true,
    fields: [{ label: 'Value', kind: 'text', secret: true }],
  },
];

export const typeInfo = (t: ItemType) => ITEM_TYPES.find((i) => i.type === t) ?? ITEM_TYPES[ITEM_TYPES.length - 1];

export function fieldsFor(t: ItemType): Field[] {
  return typeInfo(t).fields.map((f) => ({ id: newId(), label: f.label, kind: f.kind, secret: !!f.secret, value: '' }));
}

/** The field a quick copy takes: the type's primary field, or the first one with a value. */
export function primaryField(type: ItemType, fields: Field[]): Field | undefined {
  const name = typeInfo(type).primary;
  return fields.find((f) => f.label === name && f.value) ?? fields.find((f) => f.value);
}

/**
 * The whole key as plain text for "Copy all": a title line, then one "Label: value" line per
 * filled field in the type's order. Multi-line values (keys, .env blocks) sit on their own
 * lines under the label, with a blank line around them so they paste cleanly.
 */
export function itemAsText(item: { title: string; type: ItemType; env: string | null; fields: Field[] }): string {
  const out = [`${item.title.trim() || typeInfo(item.type).label}${item.env ? ` (${item.env})` : ''}`];
  for (const f of orderedFields(item.type, item.fields)) {
    const value = f.value.replace(/\s+$/, '');
    if (!f.label.trim() || !value) continue;
    if (value.includes('\n')) out.push('', `${f.label}:`, value, '');
    else out.push(`${f.label}: ${value}`);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** An item's fields in its type's order (so older items match new ones), custom fields last. */
export function orderedFields<T extends { label: string }>(type: ItemType, fields: T[]): T[] {
  const order = typeInfo(type).fields.map((f) => f.label);
  const rank = (f: T) => {
    const i = order.indexOf(f.label);
    return i < 0 ? order.length : i;
  };
  return [...fields].sort((a, b) => rank(a) - rank(b));
}

/**
 * The host or user inside a connection string, never the password: both the URL form
 * (postgres://user:pw@host:5432/db) and the key=value form (Server=host;User Id=user;Password=…).
 */
export function connectionPart(item: { type: ItemType; fields: Field[] }, part: 'host' | 'user'): string | null {
  if (item.type !== 'connection') return null;
  const v = item.fields.find((f) => f.label === 'Connection string')?.value.trim() ?? '';
  const url = v.match(/^[a-z][a-z0-9+.-]*:\/\/(?:([^:@/]*)(?::[^@/]*)?@)?([^/:?#,]+)/i);
  if (url) return (part === 'host' ? url[2] : url[1]) || null;
  const keys = part === 'host' ? 'Server|Host|Data Source|Address|Addr' : 'User Id|UserId|Username|User|UID';
  return v.match(new RegExp(`(?:^|;)\\s*(?:${keys})\\s*=\\s*([^;]+)`, 'i'))?.[1].trim() || null;
}
