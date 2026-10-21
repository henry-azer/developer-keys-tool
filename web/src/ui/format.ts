const DAY = 86_400_000;

/** "just now", "5 minutes ago", "2 days ago". */
export function timeAgo(iso: string, at = Date.now()): string {
  const ms = at - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(ms / DAY);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export type ExpiryTone = 'ok' | 'warn' | 'expired';

/** Labels an expiry date, warning two weeks ahead. */
export function expiry(iso: string | null, at = Date.now()): { label: string; tone: ExpiryTone } | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - at) / DAY);
  if (days < 0) return { label: `Expired ${-days} day${days === -1 ? '' : 's'} ago`, tone: 'expired' };
  if (days === 0) return { label: 'Expires today', tone: 'expired' };
  if (days <= 14) return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, tone: 'warn' };
  return { label: `Expires ${new Date(iso).toLocaleDateString()}`, tone: 'ok' };
}

/** A random secret from a URL-safe alphabet, for the Generate button. */
export function generateSecret(length = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_';
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  let out = '';
  // Rejection sampling keeps every character equally likely.
  for (const b of bytes) {
    if (b < 256 - (256 % chars.length)) out += chars[b % chars.length];
    if (out.length === length) break;
  }
  return out.length === length ? out : generateSecret(length);
}

/** Rough strength for the master password meter: 0 (empty) to 4. */
export function strength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/\d/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  if (pw.length >= 16 || (pw.length >= 12 && classes >= 3)) return 4;
  if (pw.length >= 12 || (pw.length >= 10 && classes >= 3)) return 3;
  if (pw.length >= 8) return 2;
  return 1;
}
