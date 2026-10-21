import { own } from './bytes';

/** RFC 6238 time-based one-time codes (the 6-digit 2FA codes), via WebCrypto. */

export interface TotpParams {
  secret: Uint8Array;
  digits: number;
  period: number;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error('Not a valid 2FA secret');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Accepts a bare base32 secret or an otpauth:// URI from a QR code. */
export function parseTotp(input: string): TotpParams {
  const text = input.trim();
  if (text.startsWith('otpauth://')) {
    const url = new URL(text);
    const alg = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase();
    return {
      secret: base32Decode(url.searchParams.get('secret') ?? ''),
      digits: Number(url.searchParams.get('digits') ?? 6),
      period: Number(url.searchParams.get('period') ?? 30),
      algorithm: alg === 'SHA256' ? 'SHA-256' : alg === 'SHA512' ? 'SHA-512' : 'SHA-1',
    };
  }
  return { secret: base32Decode(text), digits: 6, period: 30, algorithm: 'SHA-1' };
}

export async function totp(p: TotpParams, at = Date.now()): Promise<string> {
  if (p.secret.length === 0) throw new Error('Not a valid 2FA secret');
  const counter = Math.floor(at / 1000 / p.period);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  new DataView(msg.buffer).setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', own(p.secret), { name: 'HMAC', hash: p.algorithm }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[mac.length - 1] & 0xf;
  const bin =
    ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** p.digits).padStart(p.digits, '0');
}

/** Seconds left before the current code changes. */
export const secondsLeft = (period: number, at = Date.now()) => period - (Math.floor(at / 1000) % period);
