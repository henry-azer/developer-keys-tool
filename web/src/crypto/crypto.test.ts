import { createCipheriv, pbkdf2Sync, randomBytes as nodeRandom } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptBackup, detectBackup, encryptBackup, ONEPASS_SIGNATURE } from './backup';
import { changePassword, createVault, exportVaultKey, saveVault, unlockVault, unlockVaultWithKey, WrongPasswordError } from './vault-crypto';

// Low work factor keeps the suite fast; production uses 600k.
const FAST = 1_000;
const data = { projects: [{ name: 'Billing API', envs: { dev: { token: 'sk_test_123' } } }] };

describe('vault file', () => {
  it('round-trips data with the right password', async () => {
    const { file } = await createVault('correct horse', data, FAST);
    const { data: out } = await unlockVault(file, 'correct horse');
    expect(out).toEqual(data);
  });

  it('keeps secrets and titles out of the file', async () => {
    const { file } = await createVault('correct horse', data, FAST);
    const text = JSON.stringify(file);
    expect(text).not.toContain('sk_test_123');
    expect(text).not.toContain('Billing API');
  });

  it('rejects a wrong password', async () => {
    const { file } = await createVault('correct horse', data, FAST);
    await expect(unlockVault(file, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('rejects a tampered iteration count', async () => {
    const { file } = await createVault('correct horse', data, FAST);
    const tampered = { ...file, kdf: { ...file.kdf, iterations: FAST + 1 } };
    await expect(unlockVault(tampered, 'correct horse')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('opens with the exported vault key (Windows Hello), even after a password change', async () => {
    const { file, session } = await createVault('correct horse', data, FAST);
    const key = await exportVaultKey(session);
    const changed = await changePassword(session, 'new battery staple', FAST);
    const saved = await saveVault(changed, data);
    expect((await unlockVaultWithKey(file, key.slice())).data).toEqual(data);
    expect((await unlockVaultWithKey(saved, key.slice())).data).toEqual(data);
  });

  it('rejects a vault key from another vault', async () => {
    const { file } = await createVault('pw', data, FAST);
    const { session: other } = await createVault('pw', data, FAST);
    await expect(unlockVaultWithKey(file, await exportVaultKey(other))).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('uses a fresh nonce on every save', async () => {
    const { session } = await createVault('pw', data, FAST);
    const a = await saveVault(session, data);
    const b = await saveVault(session, data);
    expect(a.body.nonce).not.toBe(b.body.nonce);
  });

  it('changes the password without touching the body', async () => {
    const { file, session } = await createVault('old password', data, FAST);
    const next = await changePassword(session, 'new password', FAST);
    const updated = { ...file, kdf: next.kdf, key: next.key };
    expect((await unlockVault(updated, 'new password')).data).toEqual(data);
    await expect(unlockVault(updated, 'old password')).rejects.toBeInstanceOf(WrongPasswordError);
  });
});

describe('backup file', () => {
  it('round-trips and is detected as Developer Keys', async () => {
    const bytes = await encryptBackup('{"a":1}', 'backup-pass', FAST);
    expect(detectBackup(bytes)).toBe('devvault');
    expect(await decryptBackup(bytes, 'backup-pass')).toBe('{"a":1}');
  });

  it('rejects a wrong password', async () => {
    const bytes = await encryptBackup('{"a":1}', 'backup-pass', FAST);
    await expect(decryptBackup(bytes, 'other-pass')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('reads a One Pass v2 backup built by an independent implementation', async () => {
    // Mirrors BackupEncryption.encryptWithPassword in One Pass, using Node's crypto.
    const sig = Buffer.from(ONEPASS_SIGNATURE, 'utf8');
    const salt = nodeRandom(16);
    const u32 = (v: number) => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(v);
      return b;
    };
    const header = Buffer.concat([u32(sig.length), sig, Buffer.from([1]), salt, u32(FAST)]);
    const key = pbkdf2Sync('onepass-pw', salt, FAST, 32, 'sha256');
    const nonce = nodeRandom(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce).setAAD(header);
    const body = Buffer.concat([cipher.update('{"accounts":[]}', 'utf8'), cipher.final(), cipher.getAuthTag()]);
    const file = new Uint8Array(Buffer.concat([header, nonce, body]));

    expect(detectBackup(file)).toBe('onepass');
    expect(await decryptBackup(file, 'onepass-pw')).toBe('{"accounts":[]}');
  });
});
