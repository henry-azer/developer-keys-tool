import { describe, expect, it } from 'vitest';
import { connectionPart, itemAsText, primaryField } from './item-types';
import type { Field } from './model';

const field = (label: string, value: string, secret = false): Field => ({ id: label, label, kind: 'text', secret, value });
const conn = (value: string) => ({ type: 'connection' as const, fields: [field('Connection string', value, true)] });

describe('connection string columns', () => {
  it.each([
    ['postgres://app:s3cret@db.stg.local:5432/billing', 'app', 'db.stg.local'],
    ['mongodb+srv://ops:pw@cluster0.abc.mongodb.net/x', 'ops', 'cluster0.abc.mongodb.net'],
    ['redis://cache.local:6379', null, 'cache.local'],
    ['Server=sql01.corp;Database=Billing;User Id=svc_billing;Password=p@ss;', 'svc_billing', 'sql01.corp'],
    ['Host=pg.local; Port=5432; Username=api; Password=x', 'api', 'pg.local'],
    ['Data Source=tcp:srv.database.windows.net,1433;UID=admin;PWD=x', 'admin', 'tcp:srv.database.windows.net,1433'],
  ])('%s', (value, user, host) => {
    expect(connectionPart(conn(value), 'user')).toBe(user);
    expect(connectionPart(conn(value), 'host')).toBe(host);
  });

  it('never returns the password', () => {
    const parts = [connectionPart(conn('postgres://app:s3cret@h/db'), 'user'), connectionPart(conn('Server=h;Password=s3cret'), 'user')];
    expect(parts.join()).not.toContain('s3cret');
  });

  it('only reads connection strings', () => {
    expect(connectionPart({ type: 'database', fields: [field('Host', 'db')] }, 'host')).toBeNull();
  });
});

describe('server / SSH host', () => {
  it('copies the password first, and the host when there is no password', () => {
    expect(primaryField('server', [field('Host', 'bastion'), field('Password', 'pw', true)])?.label).toBe('Password');
    expect(primaryField('server', [field('Host', 'bastion'), field('Password', '', true)])?.label).toBe('Host');
  });
});

describe('copy all', () => {
  it('lists the name, environment and filled fields in order, with multi-line values on their own lines', () => {
    const text = itemAsText({
      title: 'Bastion',
      type: 'server',
      env: 'prod',
      fields: [
        field('Password', 'pw1', true),
        field('Host', 'bastion.local'),
        field('Port', ''),
        { ...field('Private key', '-----BEGIN KEY-----\nabc\n-----END KEY-----\n', true), kind: 'multiline' },
      ],
    });
    expect(text).toBe('Bastion (prod)\nHost: bastion.local\nPassword: pw1\n\nPrivate key:\n-----BEGIN KEY-----\nabc\n-----END KEY-----');
  });
});
