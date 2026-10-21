// Writes web/.developer-keys.json with synthetic demo data for `npm run dev`.
//   npx vite-node scripts/seed-demo.ts      (password: demo-password-123)
import { writeFileSync } from 'node:fs';
import { createVault } from '../src/crypto/vault-crypto';
import { fieldsFor } from '../src/vault/item-types';
import { emptyVault, newId, now, type Item, type ItemType, type Project } from '../src/vault/model';

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

function item(type: ItemType, title: string, env: string | null, values: Record<string, string>, extra: Partial<Item> = {}): Item {
  const fields = fieldsFor(type).map((f) => ({ ...f, value: values[f.label] ?? '' }));
  return { id: newId(), type, title, env, fields, tags: [], expiresAt: null, favorite: false, createdAt: now(), updatedAt: now(), ...extra };
}

function project(name: string, items: Item[]): Project {
  return { id: newId(), name, items, createdAt: now(), updatedAt: now() };
}

const billing = project('Billing API', [
  item('webhook', 'Base URL', 'dev', { URL: 'http://localhost:4000' }),
  item('webhook', 'Base URL', 'stg', { URL: 'https://stg.billing.example.com' }),
  item('webhook', 'Base URL', 'prod', { URL: 'https://billing.example.com' }),
  item('login', 'Admin login', 'dev', { URL: 'http://localhost:4000/admin', Username: 'admin@dev.local', Password: 'dev-admin-pass' }),
  item('login', 'Admin login', 'stg', { URL: 'https://stg.billing.example.com/admin', Username: 'qa-admin', Password: 'Stg!Qa-2026' }),
  item('login', 'Admin login', 'prod', { URL: 'https://billing.example.com/admin', Username: 'ops-admin', Password: 'P!rod-0ps-77' }),
  item('token', 'STRIPE_SECRET_KEY', 'dev', { Token: 'sk_test_51Hdev4f2a', Header: 'Authorization: Bearer' }),
  item('token', 'STRIPE_SECRET_KEY', 'stg', { Token: 'sk_test_51Hstg9c10', Header: 'Authorization: Bearer' }),
  item('token', 'STRIPE_SECRET_KEY', 'prod', { Token: 'sk_live_51Hprd77de', Header: 'Authorization: Bearer' }, { expiresAt: days(6) }),
  item('connection', 'DATABASE_URL', 'dev', { 'Connection string': 'postgres://billing:dev@localhost:5432/billing' }),
  item('connection', 'DATABASE_URL', 'stg', { 'Connection string': 'postgres://billing:s3cret@stg-db.internal:5432/billing' }),
  item('connection', 'DATABASE_URL', 'prod', { 'Connection string': 'postgres://billing:pr0d@prod-db.internal:5432/billing' }),
  item('token', 'Webhook signing secret', 'dev', { Token: 'whsec_devabc123' }),
  item('token', 'Webhook signing secret', 'stg', { Token: 'whsec_stgdef456' }),
  item('server', 'Bastion host', 'prod', {
    Host: 'bastion.billing.example.com',
    Port: '22',
    Username: 'deploy',
    'SSH command': 'ssh deploy@bastion.billing.example.com',
  }),
  item('ssh-key', 'Deploy SSH key', null, {
    'Private key': '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----',
    'Public key': 'ssh-ed25519 AAAAC3Nza deploy@billing',
  }),
  item('totp', 'AWS root account', null, { Secret: 'JBSWY3DPEHPK3PXP', Account: 'root@billing.example.com' }),
  item('note', 'Runbook', null, { Note: 'Rotate Stripe keys every 90 days. Staging resets every Sunday 02:00 UTC.' }),
]);

const portal = project('Customer portal', [
  item('webhook', 'App URL', 'dev', { URL: 'http://localhost:3000' }),
  item('webhook', 'App URL', 'stg', { URL: 'https://qa.portal.example.com' }),
  item('webhook', 'App URL', 'prod', { URL: 'https://portal.example.com' }),
  item('login', 'Test customer', 'stg', { Username: 'jane.tester@example.com', Password: 'Qa-Customer-1' }),
  item('env', '.env', 'dev', { Contents: 'NEXT_PUBLIC_API=http://localhost:4000\nAUTH_SECRET=local-only-secret' }),
  item('license', 'Charting library licence', null, { Key: 'CHART-8K2L-99QX-AB12', 'Licensed to': 'Portal team' }, { expiresAt: days(-3) }),
]);

const pipeline = project('Data pipeline', [
  item('database', 'Warehouse', 'dev', { Engine: 'Snowflake', Host: 'dev.warehouse.example.com', Database: 'ANALYTICS_DEV', Username: 'etl_dev', Password: 'etl-dev-pw' }),
  item('database', 'Warehouse', 'prod', { Engine: 'Snowflake', Host: 'warehouse.example.com', Database: 'ANALYTICS', Username: 'etl', Password: 'etl-prod-pw' }),
]);

const data = { ...emptyVault(), projects: [billing, portal, pipeline] };
data.settings.lastBackupAt = days(-9);
const { file } = await createVault('demo-password-123', data, 1000);
writeFileSync(process.env.DEVELOPER_KEYS_DEV_FILE ?? '.developer-keys.json', JSON.stringify(file));
console.log('Wrote .developer-keys.json (password: demo-password-123)');
