import { describe, expect, it } from 'vitest';
import { DEFAULT_ENVIRONMENTS, emptyVault, ensureDefaultProject, moveProject, newId, newProject, normalizeVault, now, applyTransfers, planTransfers, transferItem, type Item, type VaultData } from './model';

function vaultWith(environments: string[], itemEnv: string): VaultData {
  const v = emptyVault();
  v.settings.environments = environments;
  v.projects[0].items.push({
    id: newId(),
    type: 'token',
    title: 'API_KEY',
    env: itemEnv,
    fields: [],
    tags: [],
    expiresAt: null,
    favorite: false,
    createdAt: now(),
    updatedAt: now(),
  });
  return v;
}

describe('normalizeVault', () => {
  it('upgrades the old default list and moves staging values to stg', () => {
    const out = normalizeVault(vaultWith(['dev', 'staging', 'prod'], 'staging'));
    expect(out.settings.environments).toEqual(DEFAULT_ENVIRONMENTS);
    expect(out.projects[0].items[0].env).toBe('stg');
  });

  it('leaves a customised list alone', () => {
    const out = normalizeVault(vaultWith(['dev', 'staging', 'prod', 'uat'], 'staging'));
    expect(out.settings.environments).toEqual(['dev', 'staging', 'prod', 'uat']);
    expect(out.projects[0].items[0].env).toBe('staging');
  });

  it('always keeps a default project', () => {
    const v = emptyVault();
    v.projects = [];
    const out = normalizeVault(v);
    expect(out.projects).toHaveLength(1);
    expect(out.settings.defaultProjectId).toBe(out.projects[0].id);
  });
});

describe('project order', () => {
  function threeProjects(): VaultData {
    const v = emptyVault();
    v.projects = [newProject('A'), newProject('B'), newProject('C')];
    v.settings.defaultProjectId = v.projects[0].id;
    return v;
  }
  const names = (v: VaultData) => v.projects.map((p) => p.name).join('');

  it('keeps the default project first', () => {
    const v = threeProjects();
    v.settings.defaultProjectId = v.projects[2].id;
    expect(names(ensureDefaultProject(v))).toBe('CAB');
  });

  it('moves a project down and up', () => {
    const v = threeProjects();
    expect(names(moveProject(v, v.projects[1].id, 3))).toBe('ACB');
    expect(names(moveProject(v, v.projects[2].id, 1))).toBe('ACB');
  });

  it('never moves a project above the default one', () => {
    const v = threeProjects();
    expect(names(moveProject(v, v.projects[2].id, 0))).toBe('ACB');
    expect(names(moveProject(v, v.projects[0].id, 3))).toBe('ABC');
  });
});

describe('moving and duplicating keys', () => {
  const key: Item = {
    id: 'k1',
    type: 'login',
    title: 'Admin login',
    env: 'dev',
    fields: [{ id: 'f1', label: 'Password', kind: 'text', secret: true, value: 'pw' }],
    tags: ['ops'],
    expiresAt: null,
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const data = (): VaultData => ({
    ...emptyVault(),
    projects: [
      { id: 'a', name: 'A', items: [key], createdAt: key.createdAt, updatedAt: key.createdAt },
      { id: 'b', name: 'B', items: [], createdAt: key.createdAt, updatedAt: key.createdAt },
    ],
  });

  it('moves a key with its id and history, under the chosen name and environment', () => {
    const out = transferItem(data(), { mode: 'move', fromProjectId: 'a', itemId: 'k1', toProjectId: 'b', title: 'Admin', env: 'stg' });
    expect(out.projects[0].items).toEqual([]);
    expect(out.projects[1].items).toHaveLength(1);
    expect(out.projects[1].items[0]).toMatchObject({ id: 'k1', title: 'Admin', env: 'stg', createdAt: key.createdAt });
  });

  it('duplicates a key as a new one and leaves the original alone', () => {
    const out = transferItem(data(), { mode: 'duplicate', fromProjectId: 'a', itemId: 'k1', toProjectId: 'a', title: 'Admin login copy', env: 'dev' });
    const [orig, copy] = out.projects[0].items;
    expect(orig).toEqual(key);
    expect(copy.id).not.toBe('k1');
    expect(copy.fields[0].id).not.toBe('f1');
    expect(copy).toMatchObject({ title: 'Admin login copy', env: 'dev', tags: ['ops'] });
    expect(copy.fields[0].value).toBe('pw');
  });

  it('does nothing for a missing key or project', () => {
    const d = data();
    expect(transferItem(d, { mode: 'move', fromProjectId: 'a', itemId: 'nope', toProjectId: 'b', title: 'x', env: null })).toBe(d);
    expect(transferItem(d, { mode: 'move', fromProjectId: 'a', itemId: 'k1', toProjectId: 'nope', title: 'x', env: null })).toBe(d);
  });
});

describe('moving and duplicating several keys', () => {
  const item = (id: string, title: string, env: string | null): Item => ({
    id,
    type: 'token',
    title,
    env,
    fields: [{ id: `${id}-f`, label: 'Token', kind: 'text', secret: true, value: id }],
    tags: [],
    expiresAt: null,
    favorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const projects = () => [
    { id: 'a', name: 'A', items: [item('1', 'API_KEY', 'dev'), item('2', 'API_KEY', 'stg'), item('3', 'Other', 'dev')], createdAt: '', updatedAt: '' },
    { id: 'b', name: 'B', items: [item('9', 'API_KEY', 'dev')], createdAt: '', updatedAt: '' },
  ];

  it('keeps each environment and renames only what clashes', () => {
    const plan = planTransfers(projects(), { mode: 'move', fromProjectId: 'a', itemIds: ['1', '2'], toProjectId: 'b', env: 'keep' });
    expect(plan.map((t) => [t.title, t.env])).toEqual([
      ['API_KEY copy', 'dev'],
      ['API_KEY', 'stg'],
    ]);
  });

  it('numbers the copies when one environment is set for all', () => {
    const plan = planTransfers(projects(), { mode: 'duplicate', fromProjectId: 'a', itemIds: ['1', '2'], toProjectId: 'a', env: 'dev' });
    expect(plan.map((t) => t.title)).toEqual(['API_KEY copy', 'API_KEY copy 2']);
  });

  it('applies the whole plan', () => {
    const data: VaultData = { ...emptyVault(), projects: projects() };
    const plan = planTransfers(data.projects, { mode: 'move', fromProjectId: 'a', itemIds: ['1', '3'], toProjectId: 'b', env: 'keep' });
    const out = applyTransfers(data, plan);
    expect(out.projects[0].items.map((i) => i.id)).toEqual(['2']);
    expect(out.projects[1].items.map((i) => i.title)).toEqual(['API_KEY', 'API_KEY copy', 'Other']);
  });
});
