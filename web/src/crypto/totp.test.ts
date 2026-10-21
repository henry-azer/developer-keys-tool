import { describe, expect, it } from 'vitest';
import { base32Decode, parseTotp, totp } from './totp';

// RFC 6238 appendix B: ASCII "12345678901234567890", 8 digits, SHA-1.
const rfcSecret = new TextEncoder().encode('12345678901234567890');

describe('totp', () => {
  it('matches the RFC 6238 test vectors', async () => {
    const p = { secret: rfcSecret, digits: 8, period: 30, algorithm: 'SHA-1' as const };
    expect(await totp(p, 59_000)).toBe('94287082');
    expect(await totp(p, 1_111_111_109_000)).toBe('07081804');
    expect(await totp(p, 20_000_000_000_000)).toBe('65353130');
  });

  it('decodes base32 the way authenticator apps do', () => {
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toEqual(rfcSecret);
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toEqual(rfcSecret);
  });

  it('reads otpauth URIs', () => {
    const p = parseTotp('otpauth://totp/AWS:root?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8&period=60');
    expect(p.digits).toBe(8);
    expect(p.period).toBe(60);
    expect(p.secret).toEqual(rfcSecret);
  });

  it('rejects text that is not base32', () => {
    expect(() => base32Decode('not a secret!')).toThrow();
  });
});
