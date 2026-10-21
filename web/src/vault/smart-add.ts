import { ITEM_TYPES, orderedFields, typeInfo } from './item-types';
import { newId, type Field, type ItemType } from './model';

/** What Claude suggests for one pasted block, after it's been checked against the vault. */
export interface Mapping {
  title: string;
  type: ItemType;
  /** A project name that exists in the vault, or null to use the one the person picks. */
  project: string | null;
  /** An environment from the shared list, or null for "No environment". */
  env: string | null;
  fields: Field[];
}

/** The instructions sent with the pasted text. Values must come back exactly as pasted. */
export function buildPrompt(text: string, projects: string[], envs: string[]): string {
  const types = ITEM_TYPES.map((t) => `- ${t.type} (${t.label}): ${t.fields.map((f) => f.label).join(', ')}`).join('\n');
  return `You turn pasted text into Developer Keys keys (saved credentials). Reply with ONE JSON object and nothing else: no prose, no code fences.

Shape:
{"keys": [{"title": string, "type": string, "project": string | null, "env": string | null, "fields": [{"label": string, "value": string, "secret": boolean}]}]}

"type" is one of these ids, each with the field labels to use:
${types}

Rules:
- The text may hold one key or several. Return one entry per separate credential: a database listed for dev, stg and prod is three keys, one per environment; two different accounts are two keys. The parts of one credential (host, port, username, password) stay together in one key.
- A value given once for a whole list (a shared username, port or engine) is copied into every key it applies to.
- Keys for the same thing in different environments get the same title, so they line up as one row per environment.
- Copy every value exactly, character for character. Never invent, fix or shorten a value.
- Put each value under the type's field label when it fits; otherwise add a field with a short label.
- "title": the name given in the text (a heading or first line that isn't a value, or the part before ":"). If there is none, a short name from the service or host. Leave the environment out of the title.
- A line like "Name: value" with one long random-looking value is an API token: title = Name, type = token, field Token = value.
- "project": only if the text clearly names one of: ${JSON.stringify(projects)}. Otherwise null.
- "env": only if the text clearly names one of: ${JSON.stringify(envs)} (or an obvious spelling of one, like "staging" for "stg"). Otherwise null.
- "secret": true for passwords, tokens, keys and secrets; false for names, usernames and URLs.

Pasted text:
<<<
${text}
>>>`;
}

/**
 * Reads Claude's answer and keeps only what fits the vault: known types, projects and environments.
 * Accepts {"keys": [...]}, a bare list, or a single key.
 */
export function parseMappings(answer: string, projects: string[], envs: string[]): Mapping[] {
  const obj = answer.indexOf('{');
  const arr = answer.indexOf('[');
  const isList = arr >= 0 && (obj < 0 || arr < obj);
  const start = isList ? arr : obj;
  const end = answer.lastIndexOf(isList ? ']' : '}');
  if (start < 0 || end < start) throw new Error('Claude didn’t return any fields. Try pasting a little more context.');
  let raw: unknown;
  try {
    raw = JSON.parse(answer.slice(start, end + 1));
  } catch {
    throw new Error('Claude’s answer wasn’t valid. Try again.');
  }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { keys?: unknown }).keys) ? (raw as { keys: unknown[] }).keys : [raw];
  const keys = list.map((k) => toMapping(k as Record<string, unknown>, projects, envs)).filter((m): m is Mapping => m !== null);
  if (keys.length === 0) throw new Error('Claude didn’t find any values in that text.');
  return keys;
}

function toMapping(raw: Record<string, unknown>, projects: string[], envs: string[]): Mapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const type = (ITEM_TYPES.some((t) => t.type === raw.type) ? raw.type : 'custom') as ItemType;
  const template = typeInfo(type).fields;
  const fields: Field[] = (Array.isArray(raw.fields) ? raw.fields : [])
    .map((f: Record<string, unknown>) => {
      const label = str(f?.label).trim();
      const value = str(f?.value);
      // Use the template's spelling and kind when the label matches one.
      const known = template.find((t) => t.label.toLowerCase() === label.toLowerCase());
      return {
        id: newId(),
        label: known?.label ?? label,
        value,
        kind: known?.kind ?? (/^https?:\/\//i.test(value) ? 'url' : 'text'),
        secret: known?.secret ?? f?.secret === true,
      } satisfies Field;
    })
    .filter((f) => f.label && f.value);
  if (fields.length === 0) return null;
  const pick = (v: unknown, list: string[]) => list.find((x) => x.toLowerCase() === str(v).toLowerCase()) ?? null;
  return {
    title: str(raw.title).trim() || typeInfo(type).label,
    type,
    project: pick(raw.project, projects),
    env: pick(raw.env, envs),
    fields: orderedFields(type, fields),
  };
}
