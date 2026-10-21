import { describe, expect, it } from 'vitest';
import { createVault, WrongPasswordError } from '../crypto/vault-crypto';
import { readBackup } from './backup-io';
import { emptyVault, newProject } from './model';

describe('automatic backup', () => {
  it('restores from a copy of the vault file with the master password', async () => {
    const data = emptyVault();
    data.projects = [newProject('Billing API')];
    const { file } = await createVault('correct horse battery', data);
    const bytes = new TextEncoder().encode(JSON.stringify(file));

    const { projects } = await readBackup(bytes, 'correct horse battery');
    expect(projects.map((p) => p.name)).toEqual(['Billing API']);
    expect(projects[0].id).not.toBe(data.projects[0].id);

    await expect(readBackup(bytes, 'wrong password!!')).rejects.toBeInstanceOf(WrongPasswordError);
  });
});
