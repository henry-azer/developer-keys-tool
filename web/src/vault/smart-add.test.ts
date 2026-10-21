import { describe, expect, it } from 'vitest';
import { buildPrompt, parseMappings } from './smart-add';

const parseMapping = (answer: string, p: string[], e: string[]) => parseMappings(answer, p, e)[0];

const projects = ['General', 'Billing API'];
const envs = ['dev', 'stg', 'prod'];

describe('smart add', () => {
  it('puts the pasted text and the vault’s names into the prompt', () => {
    const p = buildPrompt('Jira: abc', projects, envs);
    expect(p).toContain('Jira: abc');
    expect(p).toContain('"Billing API"');
    expect(p).toContain('- login (Login): Username, Password, URL, 2FA secret');
  });

  it('maps a login and keeps values exactly', () => {
    const m = parseMapping(
      'Here you go: {"title":"Easy connect","type":"login","project":null,"env":null,"fields":[{"label":"url","value":"https://5.195.74.6:4430","secret":false},{"label":"Username","value":"Henry.emaratech","secret":false},{"label":"Password","value":"Z@##12345n12","secret":true}]}',
      projects,
      envs,
    );
    expect(m).toMatchObject({ title: 'Easy connect', type: 'login', project: null, env: null });
    expect(m.fields.map((f) => [f.label, f.value, f.secret])).toEqual([
      ['Username', 'Henry.emaratech', false],
      ['Password', 'Z@##12345n12', true],
      ['URL', 'https://5.195.74.6:4430', false],
    ]);
  });

  it('drops projects and environments that don’t exist, and unknown types', () => {
    const m = parseMapping(
      '{"title":"Jira","type":"magic","project":"Nope","env":"PROD","fields":[{"label":"Token","value":"ODUx","secret":true}]}',
      projects,
      envs,
    );
    expect(m.type).toBe('custom');
    expect(m.project).toBeNull();
    expect(m.env).toBe('prod');
  });

  it('splits a list into one key per environment', () => {
    const keys = parseMappings(
      JSON.stringify({
        keys: ['dev', 'stg', 'PROD'].map((env) => ({
          title: 'Billing DB',
          type: 'database',
          project: 'Billing API',
          env,
          fields: [
            { label: 'Host', value: `db-${env.toLowerCase()}.local`, secret: false },
            { label: 'Username', value: 'billing', secret: false },
            { label: 'Password', value: `pw-${env}`, secret: true },
          ],
        })),
      }),
      projects,
      envs,
    );
    expect(keys.map((k) => [k.title, k.env, k.project])).toEqual([
      ['Billing DB', 'dev', 'Billing API'],
      ['Billing DB', 'stg', 'Billing API'],
      ['Billing DB', 'prod', 'Billing API'],
    ]);
    expect(keys[2].fields.find((f) => f.label === 'Password')).toMatchObject({ value: 'pw-PROD', secret: true });
  });

  it('accepts a bare list and skips entries with no values', () => {
    const keys = parseMappings(
      'Sure: [{"title":"A","type":"token","fields":[{"label":"Token","value":"x1"}]},{"title":"B","type":"token","fields":[]}]',
      projects,
      envs,
    );
    expect(keys.map((k) => k.title)).toEqual(['A']);
  });

  it('explains when nothing usable comes back', () => {
    expect(() => parseMapping('sorry', projects, envs)).toThrow(/didn’t return/);
    expect(() => parseMapping('{"title":"x","type":"login","fields":[]}', projects, envs)).toThrow(/didn’t find/);
    expect(() => parseMappings('{"keys":[]}', projects, envs)).toThrow(/didn’t find/);
  });
});
