import fs from 'node:fs';
import path from 'node:path';
import * as lucide from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { isIndianMobile } from '../../shared/format';
import { REGISTRY, entityByKey, moduleByKey, moduleOfEntity } from '../../shared/registry';
import type { EntityDef, FieldDef, ModuleDef } from '../../shared/registry';
import type { DB } from '../../shared/types';
import { MODULES as sales1 } from '../../shared/modules/sales1';
import { MODULES as sales2 } from '../../shared/modules/sales2';
import { MODULES as ops1 } from '../../shared/modules/ops1';
import { MODULES as ops2 } from '../../shared/modules/ops2';
import { MODULES as people } from '../../shared/modules/people';
import { MODULES as marketing } from '../../shared/modules/marketing';
import { MODULES as tools } from '../../shared/modules/tools';

// AC: docs/AUTHORING.md rules 1–7, docs/PLAN.md §10.1–10.3, docs/MODULES.md catalogue, ADR-9.
// Runs over the REAL registry and the committed data/seed.json. Each check collects every
// violation as "<file> <module>/<entity>.<field>: <problem>" so one run lists them all.
const ROOT = path.resolve(__dirname, '..', '..');
const SEED = path.join(ROOT, 'data', 'seed.json');
const CATALOGUE = fs.readFileSync(path.join(ROOT, 'docs', 'MODULES.md'), 'utf8');
const db: DB = JSON.parse(fs.readFileSync(SEED, 'utf8'));

const FILES: Record<string, ModuleDef[]> = { sales1, sales2, ops1, ops2, people, marketing, tools };
const fileOf = new Map<string, string>();
for (const [f, mods] of Object.entries(FILES)) for (const m of mods) fileOf.set(m.key, f);
const where = (m: ModuleDef | string, rest = '') => {
  const key = typeof m === 'string' ? m : m.key;
  return `[${fileOf.get(key) ?? '?'}] ${key}${rest}`;
};

const GROUPS = ['Sales & CRM', 'Operations', 'Finance', 'People', 'Marketing', 'Tools'];
const SECTIONS = ['Sales & CRM', 'Operations', 'People', 'Marketing', 'Tools'];
const FINANCE = ['accounting', 'cost_management'];
const NOT_MODULES = ['customers'];
const EXCLUDED = ['zoho', 'xero', 'support', 'quickbooks', 'sage', 'freshbooks', 'setup'];
const FIELD_TYPES = ['text', 'textarea', 'number', 'money', 'percent', 'date', 'datetime', 'email', 'tel', 'url', 'select', 'multiselect', 'checkbox', 'ref'];
const GENS = ['person', 'company', 'phone', 'email', 'address', 'locality', 'city', 'sentence', 'paragraph', 'past', 'future', 'recent', 'vehicle', 'plate', 'material', 'product', 'serial', 'hash'];
const PAGE_KINDS = ['dashboard', 'table', 'report', 'settings', 'calendar', 'info'];
const CORE_REFS = ['clients', 'users', 'properties', 'staff', 'agents', 'brokers', 'owners', 'leads'];
const RESERVED = ['id', 'code', 'createdAt', 'createdBy'];
const NUMERIC = ['number', 'money', 'percent'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const SNAKE = /^[a-z][a-z0-9_]*$/;

// Accepted deviations (agreed with the lead; do not fail on these).
const CROSS_MODULE_REFS = new Set(['tasks_tasks.relatedProject->projects_projects']);
const LOOKUP_AS_TABLE = new Set<string>(['fixed_equipment_locations']);
const NO_SETTINGS_PAGE = new Set(['invoices_builder']);
const INFO_FOR_REPORTS = new Set(['reports_core']);
const NO_ENTITIES = new Set(['reports_core']);

const entities = REGISTRY.flatMap(m => m.entities.map(e => ({ m, e })));
const allFields = entities.flatMap(({ m, e }) => e.fields.map(f => ({ m, e, f })));
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const validDate = (s: string) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const validDateTime = (s: string) => ISO_DATETIME.test(s) && !Number.isNaN(Date.parse(s));
const refExists = (target: string) => CORE_REFS.includes(target) || !!entityByKey(target);

// ---- catalogue parsing (docs/MODULES.md) ----
interface CatMod { key: string; section: string; kinds: Set<string>; statusLists: string[][] }
function parseCatalogue(md: string): CatMod[] {
  const out: CatMod[] = [];
  let section = '';
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { section = h[1]; continue; }
    if (!SECTIONS.includes(section)) continue;
    const m = /^-\s+\*\*[^*]+\*\*\s+\(`([a-z0-9_]+)`\):\s*(.*)$/.exec(line);
    if (!m || NOT_MODULES.includes(m[1])) continue;
    let body = m[2].replace(/Flavour:[^.]*\./g, '');
    let prev = '';
    while (prev !== body) { prev = body; body = body.replace(/\([^()]*\)/g, ''); }
    const kinds = new Set([...body.matchAll(/(?:^|[\s,])([DTRSC])(?=[\s,.]|$)/g)].map(x => x[1]));
    const statusLists = [...m[2].matchAll(/\bstatus ([A-Z][^,()]*\/[^,()]*)/g)].map(x => x[1].trim().split('/').map(s => s.trim()));
    out.push({ key: m[1], section, kinds, statusLists });
  }
  return out;
}
const CAT = parseCatalogue(CATALOGUE);
const KIND_OF: Record<string, string> = { D: 'dashboard', T: 'table', R: 'report', S: 'settings', C: 'calendar' };

describe('registry: catalogue coverage (MODULES.md, AUTHORING rule 1)', () => {
  it('catalogue parse sanity: finds ~55 module keys and none of the non-modules', () => {
    expect(CAT.length).toBeGreaterThanOrEqual(50);
    expect(CAT.map(c => c.key)).not.toContain('customers');
    expect(CAT.find(c => c.key === 'fleet')?.kinds).toEqual(new Set(['D', 'T', 'R', 'S']));
  });

  it('every catalogue module key exists exactly once in the registry', () => {
    const problems: string[] = [];
    for (const c of CAT) {
      const n = REGISTRY.filter(m => m.key === c.key).length;
      if (n !== 1) problems.push(`${c.key}: found ${n} times (expected 1)`);
    }
    expect(problems).toEqual([]);
  });

  it('registry has no module outside the catalogue (Customers / Main Dashboard are not modules)', () => {
    const cat = new Set(CAT.map(c => c.key));
    expect(REGISTRY.map(m => m.key).filter(k => !cat.has(k))).toEqual([]);
  });

  it('no excluded integration (zoho, xero, support, quickbooks, sage, freshbooks, setup) is present', () => {
    const bad = REGISTRY.filter(m => EXCLUDED.includes(m.key) || EXCLUDED.some(x => new RegExp(`\\b${x}\\b`, 'i').test(m.label)));
    expect(bad.map(m => m.key)).toEqual([]);
  });

  it('group = catalogue section (Accounting & Cost Management = Finance) and ∈ the 6 groups', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) {
      if (!GROUPS.includes(m.group)) problems.push(`${where(m)}: group '${m.group}' not one of ${GROUPS.join(', ')}`);
      const c = CAT.find(x => x.key === m.key);
      const want = FINANCE.includes(m.key) ? 'Finance' : c?.section;
      if (want && m.group !== want) problems.push(`${where(m)}: group '${m.group}', expected '${want}'`);
    }
    expect(problems).toEqual([]);
  });

  it('icon is a non-empty string naming a real lucide-react export', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) {
      if (typeof m.icon !== 'string' || !m.icon.trim()) problems.push(`${where(m)}: empty icon`);
      else if (!(m.icon in lucide)) problems.push(`${where(m)}: icon '${m.icon}' is not a lucide-react export`);
    }
    expect(problems).toEqual([]);
  });

  it('catalogue page kinds are present: D→dashboard, T→table, R→report, S→settings, C→calendar', () => {
    const problems: string[] = [];
    for (const c of CAT) {
      const m = moduleByKey(c.key);
      if (!m) continue;
      const kinds = new Set(m.pages.map(p => p.kind));
      for (const k of c.kinds) {
        const want = KIND_OF[k];
        if (k === 'S' && NO_SETTINGS_PAGE.has(m.key)) continue;
        if (k === 'R' && INFO_FOR_REPORTS.has(m.key) && kinds.has('info')) continue;
        if (k === 'T' && NO_ENTITIES.has(m.key)) continue;
        if (!kinds.has(want as any)) problems.push(`${where(m)}: catalogue has ${k} but no '${want}' page`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('modules without D / R / S in the catalogue have no dashboard / report / settings page', () => {
    const problems: string[] = [];
    for (const c of CAT) {
      const m = moduleByKey(c.key);
      if (!m) continue;
      for (const [k, kind] of [['D', 'dashboard'], ['R', 'report'], ['S', 'settings']] as const)
        if (!c.kinds.has(k) && m.pages.some(p => p.kind === kind)) problems.push(`${where(m)}: has a '${kind}' page but catalogue has no ${k}`);
    }
    expect(problems).toEqual([]);
  });

  it('every catalogue status list appears as the options of a select field in that module', () => {
    const problems: string[] = [];
    for (const c of CAT) {
      const m = moduleByKey(c.key);
      if (!m) continue;
      const selects = m.entities.flatMap(e => e.fields.filter(f => f.type === 'select').map(f => ({ e, f })));
      for (const list of c.statusLists) {
        const hit = selects.find(({ f }) => list.every(v => f.options?.includes(v)));
        if (!hit) problems.push(`${where(m)}: no select field has catalogue status list [${list.join('/')}]`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('registry: keys and structure (§10.1, AUTHORING rules 2–3)', () => {
  it('module keys are unique snake_case', () => {
    const keys = REGISTRY.map(m => m.key);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    expect(keys.filter(k => !SNAKE.test(k))).toEqual([]);
  });

  it('entity keys are globally unique, snake_case and prefixed with their module key', () => {
    const problems: string[] = [];
    const seen = new Map<string, string>();
    for (const { m, e } of entities) {
      if (seen.has(e.key)) problems.push(`${where(m, '/' + e.key)}: duplicate entity key (also in ${seen.get(e.key)})`);
      seen.set(e.key, m.key);
      if (!SNAKE.test(e.key)) problems.push(`${where(m, '/' + e.key)}: not snake_case`);
      if (!e.key.startsWith(m.key + '_')) problems.push(`${where(m, '/' + e.key)}: not prefixed with '${m.key}_'`);
      if (moduleOfEntity(e.key)?.key !== m.key) problems.push(`${where(m, '/' + e.key)}: moduleOfEntity mismatch`);
    }
    expect(problems).toEqual([]);
  });

  it('page keys are unique within each module; labels non-empty', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) {
      const keys = m.pages.map(p => p.key);
      for (const k of keys.filter((k, i) => keys.indexOf(k) !== i)) problems.push(`${where(m)}: duplicate page key '${k}'`);
      for (const p of m.pages) if (!p.key || !p.label?.trim()) problems.push(`${where(m)}: page with empty key/label`);
    }
    expect(problems).toEqual([]);
  });

  it('every module has at least one page; only reports_core may have 0 entities', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) {
      if (!m.pages.length) problems.push(`${where(m)}: no pages`);
      if (!m.entities.length && !NO_ENTITIES.has(m.key)) problems.push(`${where(m)}: no entities`);
    }
    expect(problems).toEqual([]);
  });

  it('page kinds are valid; table pages reference a non-lookup entity of the same module', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) for (const p of m.pages) {
      const at = where(m, `#${p.key}`);
      if (!PAGE_KINDS.includes(p.kind)) { problems.push(`${at}: invalid kind '${p.kind}'`); continue; }
      if (p.kind === 'table') {
        if (!p.entity) { problems.push(`${at}: table page without entity`); continue; }
        const e = m.entities.find(x => x.key === p.entity);
        if (!e) problems.push(`${at}: table entity '${p.entity}' not in module ${m.key}`);
        else if (e.lookup && !LOOKUP_AS_TABLE.has(e.key)) problems.push(`${at}: table page on lookup entity '${e.key}'`);
      } else if (p.entity) problems.push(`${at}: ${p.kind} page must not set entity`);
      if (p.kind === 'info' && !p.text?.trim()) problems.push(`${at}: info page without text`);
      for (const k of p.entities ?? []) if (!m.entities.some(x => x.key === k)) problems.push(`${at}: entities[] '${k}' not in module`);
    }
    expect(problems).toEqual([]);
  });

  it('every table page has its own entity (no two table pages on one entity)', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) {
      const ents = m.pages.filter(p => p.kind === 'table').map(p => p.entity);
      for (const k of ents.filter((k, i) => ents.indexOf(k) !== i)) problems.push(`${where(m)}: entity '${k}' has two table pages`);
    }
    expect(problems).toEqual([]);
  });

  it('every non-lookup entity is reachable from a table page; lookups need a settings page', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) {
      const tabled = m.pages.some(p => p.kind === 'table' && p.entity === e.key);
      if (!e.lookup && !tabled) problems.push(`${where(m, '/' + e.key)}: non-lookup entity has no table page`);
      if (e.lookup && !m.pages.some(p => p.kind === 'settings')) problems.push(`${where(m, '/' + e.key)}: lookup entity but module has no settings page`);
    }
    expect(problems).toEqual([]);
  });

  it('modules with settings fields have a settings page (except invoices_builder)', () => {
    const bad = REGISTRY.filter(m => m.settings?.length && !NO_SETTINGS_PAGE.has(m.key) && !m.pages.some(p => p.kind === 'settings'));
    expect(bad.map(m => where(m))).toEqual([]);
  });

  it('entity prefixes are unique and shaped like "ABC-"', () => {
    const problems: string[] = [];
    const seen = new Map<string, string>();
    for (const { m, e } of entities) {
      if (e.prefix === undefined) continue;
      if (!/^[A-Z][A-Z0-9]{1,3}(-[A-Z0-9]{1,3})?-$/.test(e.prefix)) problems.push(`${where(m, '/' + e.key)}: prefix '${e.prefix}' malformed`);
      if (seen.has(e.prefix)) problems.push(`${where(m, '/' + e.key)}: prefix '${e.prefix}' also used by ${seen.get(e.prefix)}`);
      seen.set(e.prefix, e.key);
    }
    expect(problems).toEqual([]);
  });

  it('labels, singular and titleField are set; kanban ⇒ statusField; calendar ⇒ dateField', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) {
      const at = where(m, '/' + e.key);
      if (!e.label?.trim() || !e.singular?.trim()) problems.push(`${at}: empty label/singular`);
      if (!e.fields.length) problems.push(`${at}: no fields`);
      if (e.kanban && !e.statusField) problems.push(`${at}: kanban without statusField`);
      if (e.calendar && !e.dateField) problems.push(`${at}: calendar without dateField`);
      if (e.seedCount !== undefined && (!Number.isInteger(e.seedCount) || e.seedCount < 1)) problems.push(`${at}: seedCount ${e.seedCount} not a positive integer`);
      if (e.lookup && !e.fields.some(f => f.key === 'name' && f.pool?.length)) problems.push(`${at}: lookup without a 'name' field with a pool`);
    }
    expect(problems).toEqual([]);
  });

  it('modules with a calendar page have at least one calendar entity or are utilities/timesheets', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) {
      if (!m.pages.some(p => p.kind === 'calendar')) continue;
      if (m.key !== 'utilities' && !m.entities.some(e => e.calendar)) problems.push(`${where(m)}: calendar page but no calendar:true entity`);
    }
    expect(problems).toEqual([]);
  });
});

describe('registry: fields (§10.1, AUTHORING rules 3, 5, 6)', () => {
  it('field keys unique per entity, not reserved (id/code/createdAt/createdBy), type and gen valid', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) {
      const keys = e.fields.map(f => f.key);
      for (const k of keys.filter((k, i) => keys.indexOf(k) !== i)) problems.push(`${where(m, `/${e.key}.${k}`)}: duplicate field key`);
    }
    for (const { m, e, f } of allFields) {
      const at = where(m, `/${e.key}.${f.key}`);
      if (!f.key || !f.label?.trim()) problems.push(`${at}: empty key/label`);
      if (RESERVED.includes(f.key)) problems.push(`${at}: reserved field key`);
      if (!FIELD_TYPES.includes(f.type)) problems.push(`${at}: invalid type '${f.type}'`);
      if (f.gen !== undefined && !GENS.includes(f.gen)) problems.push(`${at}: invalid gen '${f.gen}'`);
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) problems.push(`${at}: min ${f.min} > max ${f.max}`);
    }
    expect(problems).toEqual([]);
  });

  it('select/multiselect have non-empty, unique options', () => {
    const problems: string[] = [];
    for (const { m, e, f } of allFields) {
      if (f.type !== 'select' && f.type !== 'multiselect') continue;
      const at = where(m, `/${e.key}.${f.key}`);
      if (!f.options?.length) problems.push(`${at}: ${f.type} without options`);
      else {
        const dup = f.options.filter((o, i) => f.options!.indexOf(o) !== i);
        if (dup.length) problems.push(`${at}: duplicate options ${JSON.stringify(dup)}`);
        if (f.options.some(o => typeof o !== 'string' || !o.trim())) problems.push(`${at}: empty option`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('titleField/statusField/dateField/amountField reference existing fields of the right kind', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) {
      const at = where(m, '/' + e.key);
      const get = (k?: string) => e.fields.find(f => f.key === k);
      if (!get(e.titleField) && e.titleField !== 'code') problems.push(`${at}: titleField '${e.titleField}' missing`);
      if (e.titleField === 'code' && !e.prefix) problems.push(`${at}: titleField 'code' without prefix`);
      if (e.statusField !== undefined) {
        const f = get(e.statusField);
        if (!f) problems.push(`${at}: statusField '${e.statusField}' missing`);
        else if (f.type !== 'select') problems.push(`${at}: statusField '${f.key}' is ${f.type}, expected select`);
      }
      if (e.dateField !== undefined) {
        const f = get(e.dateField);
        if (!f) problems.push(`${at}: dateField '${e.dateField}' missing`);
        else if (f.type !== 'date' && f.type !== 'datetime') problems.push(`${at}: dateField '${f.key}' is ${f.type}, expected date/datetime`);
      }
      if (e.amountField !== undefined) {
        const f = get(e.amountField);
        if (!f) problems.push(`${at}: amountField '${e.amountField}' missing`);
        else if (f.type !== 'money' && f.type !== 'number') problems.push(`${at}: amountField '${f.key}' is ${f.type}, expected money/number`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('ref fields: target exists (core or registry) and is same-module or core', () => {
    const problems: string[] = [];
    for (const { m, e, f } of allFields) {
      const at = where(m, `/${e.key}.${f.key}`);
      if (f.type !== 'ref') { if (f.ref) problems.push(`${at}: ref set on a ${f.type} field`); continue; }
      if (!f.ref) { problems.push(`${at}: ref field without target`); continue; }
      if (!refExists(f.ref)) { problems.push(`${at}: ref target '${f.ref}' does not exist`); continue; }
      if (CORE_REFS.includes(f.ref)) continue;
      const owner = moduleOfEntity(f.ref)!;
      if (owner.key !== m.key && !CROSS_MODULE_REFS.has(`${e.key}.${f.key}->${f.ref}`))
        problems.push(`${at}: cross-module ref to '${f.ref}' (module ${owner.key})`);
    }
    expect(problems).toEqual([]);
  });

  it('pools: select/multiselect pool ⊆ options; numeric pools parse within [min,max]; no empty pool', () => {
    const problems: string[] = [];
    const check = (at: string, f: FieldDef) => {
      if (f.pool === undefined) return;
      if (!f.pool.length) { problems.push(`${at}: empty pool${f.required ? ' on a required field' : ''}`); return; }
      if ((f.type === 'select' || f.type === 'multiselect') && f.options)
        for (const v of f.pool) if (!f.options.includes(v)) problems.push(`${at}: pool value '${v}' not in options`);
      if (NUMERIC.includes(f.type)) for (const v of f.pool) {
        const n = Number(v);
        if (typeof v !== 'string' || v.trim() === '' || !Number.isFinite(n)) problems.push(`${at}: numeric pool value '${v}' does not parse`);
        else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) problems.push(`${at}: pool value ${v} outside [${f.min ?? '-∞'},${f.max ?? '∞'}]`);
      }
      if (f.type === 'checkbox') for (const v of f.pool) if (v !== 'true' && v !== 'false') problems.push(`${at}: checkbox pool value '${v}'`);
      if (f.type === 'date') for (const v of f.pool) if (!validDate(v)) problems.push(`${at}: date pool value '${v}' not ISO`);
      if (f.type === 'tel') for (const v of f.pool) if (!isIndianMobile(v)) problems.push(`${at}: tel pool value '${v}' not an Indian mobile`);
      if (f.type === 'email') for (const v of f.pool) if (!EMAIL.test(v)) problems.push(`${at}: email pool value '${v}' invalid`);
      if (f.pool.some(v => typeof v !== 'string' || !v.trim())) problems.push(`${at}: blank pool value`);
    };
    for (const { m, e, f } of allFields) check(where(m, `/${e.key}.${f.key}`), f);
    for (const m of REGISTRY) for (const f of m.settings ?? []) check(where(m, `:settings.${f.key}`), f);
    expect(problems).toEqual([]);
  });

  it('required fields can always be generated (pool/options/gen/ref target/type default)', () => {
    const problems: string[] = [];
    for (const { m, e, f } of allFields) {
      if (!f.required) continue;
      const at = where(m, `/${e.key}.${f.key}`);
      if (f.pool && !f.pool.length) problems.push(`${at}: required with empty pool`);
      if ((f.type === 'select' || f.type === 'multiselect') && !f.options?.length && !f.pool?.length) problems.push(`${at}: required ${f.type} with nothing to pick`);
      if (f.type === 'ref' && f.ref && !CORE_REFS.includes(f.ref) && (entityByKey(f.ref)?.seedCount ?? 12) < 1) problems.push(`${at}: required ref to an empty entity`);
    }
    expect(problems).toEqual([]);
  });

  it('settings fields: valid types, select options, unique keys', () => {
    const problems: string[] = [];
    for (const m of REGISTRY) {
      const keys = (m.settings ?? []).map(f => f.key);
      for (const k of keys.filter((k, i) => keys.indexOf(k) !== i)) problems.push(`${where(m)}: duplicate settings key '${k}'`);
      for (const f of m.settings ?? []) {
        if (!FIELD_TYPES.includes(f.type)) problems.push(`${where(m, ':settings.' + f.key)}: invalid type '${f.type}'`);
        if ((f.type === 'select' || f.type === 'multiselect') && !f.options?.length) problems.push(`${where(m, ':settings.' + f.key)}: ${f.type} without options`);
        if (f.type === 'ref') problems.push(`${where(m, ':settings.' + f.key)}: ref in settings is not supported by seedgen`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('registry: team_passwords never seeds real-looking secrets (AUTHORING rule 6)', () => {
  const tp = moduleByKey('team_passwords');
  const MASK = /^[•*·●]{4,}$/;
  const SECRETISH = /secret|password|passwd|pwd|token|pin|api.?key|private/i;
  const looksLikeSecret = (v: string) => !/\s/.test(v) && v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v) && !MASK.test(v);

  it('module exists with a passwords entity', () => {
    expect(tp).toBeTruthy();
    expect(tp!.entities.some(e => e.key === 'team_passwords_passwords')).toBe(true);
  });

  it('secret-like fields only carry •••• masks and never use gen hash/serial', () => {
    const problems: string[] = [];
    for (const e of tp?.entities ?? []) for (const f of e.fields) {
      const at = where('team_passwords', `/${e.key}.${f.key}`);
      if (!SECRETISH.test(f.key) && !SECRETISH.test(f.label)) continue;
      if (f.gen) problems.push(`${at}: secret field uses gen '${f.gen}'`);
      if (f.type !== 'text' || !f.pool?.length) problems.push(`${at}: secret field must be text with a mask pool`);
      for (const v of f.pool ?? []) if (!MASK.test(v)) problems.push(`${at}: pool value '${v}' is not a mask`);
    }
    expect(problems).toEqual([]);
  });

  it('no pool/option/settings value anywhere in the module looks like a password', () => {
    const vals: string[] = [];
    for (const e of tp?.entities ?? []) for (const f of e.fields) vals.push(...(f.pool ?? []), ...(f.options ?? []));
    for (const f of tp?.settings ?? []) vals.push(...(f.pool ?? []), ...(f.options ?? []));
    expect(vals.filter(v => looksLikeSecret(v) && !/^\d+$/.test(v))).toEqual([]);
  });

  it('seeded team_passwords records hold only masks in secret fields and no hash/token-looking strings', () => {
    const problems: string[] = [];
    for (const e of tp?.entities ?? []) for (const r of db.x?.[e.key] ?? []) for (const f of e.fields) {
      const v = r[f.key];
      if (typeof v !== 'string') continue;
      if ((SECRETISH.test(f.key) || SECRETISH.test(f.label)) && !MASK.test(v)) problems.push(`${r.id}.${f.key}='${v}' not a mask`);
      if (f.type === 'text' && looksLikeSecret(v)) problems.push(`${r.id}.${f.key}='${v}' looks like a secret`);
    }
    expect(problems).toEqual([]);
  });
});

describe('seed.json: registry data (§10.2–10.3)', () => {
  const x = db.x ?? {};
  const xNext = db.xNext ?? {};
  const idSets = new Map<string, Set<string>>();
  const ids = (name: string) => {
    if (!idSets.has(name)) {
      const arr: any[] = CORE_REFS.includes(name) ? ((db as any)[name] ?? []) : (x[name] ?? []);
      idSets.set(name, new Set(arr.map(r => r.id)));
    }
    return idSets.get(name)!;
  };

  it('size guard: data/seed.json < 3 MB', () => {
    expect(fs.statSync(SEED).size).toBeLessThan(3 * 1024 * 1024);
  });

  it('has x, xNext and moduleSettings objects', () => {
    expect(db.x && typeof db.x).toBe('object');
    expect(db.xNext && typeof db.xNext).toBe('object');
    expect(db.moduleSettings && typeof db.moduleSettings).toBe('object');
  });

  it('x has an array for every registry entity and nothing else', () => {
    const missing = entities.filter(({ e }) => !Array.isArray(x[e.key])).map(({ m, e }) => where(m, '/' + e.key));
    const extra = Object.keys(x).filter(k => !entityByKey(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('record count == seedCount ?? 12', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) {
      const n = x[e.key]?.length;
      if (n !== (e.seedCount ?? 12)) problems.push(`${where(m, '/' + e.key)}: ${n} records, expected ${e.seedCount ?? 12}`);
    }
    expect(problems).toEqual([]);
  });

  it('ids unique; createdAt ISO; createdBy is an existing user', () => {
    const problems: string[] = [];
    const users = ids('users');
    const all = new Set<string>();
    for (const { m, e } of entities) for (const r of x[e.key] ?? []) {
      const at = where(m, `/${e.key}#${r.id}`);
      if (typeof r.id !== 'string' || !r.id) problems.push(`${at}: missing id`);
      else if (all.has(r.id)) problems.push(`${at}: duplicate id`);
      all.add(r.id);
      if (typeof r.createdAt !== 'string' || !validDateTime(r.createdAt)) problems.push(`${at}: createdAt '${r.createdAt}' not ISO`);
      if (!users.has(r.createdBy)) problems.push(`${at}: createdBy '${r.createdBy}' is not a user`);
    }
    expect(problems).toEqual([]);
  });

  it('prefixed entities: code = prefix + 4 digits, unique; xNext = count + 1', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) {
      const recs = x[e.key] ?? [];
      const at = where(m, '/' + e.key);
      if (xNext[e.key] !== recs.length + 1) problems.push(`${at}: xNext ${xNext[e.key]}, expected ${recs.length + 1}`);
      if (!e.prefix) {
        if (recs.some(r => r.code !== undefined)) problems.push(`${at}: records have code but entity has no prefix`);
        continue;
      }
      const re = new RegExp(`^${e.prefix.replace(/[-]/g, '\\-')}\\d{4}$`);
      const codes = recs.map(r => r.code);
      for (const c of codes) if (typeof c !== 'string' || !re.test(c)) problems.push(`${at}: code '${c}' not ${e.prefix}NNNN`);
      for (const c of codes.filter((c, i) => codes.indexOf(c) !== i)) problems.push(`${at}: duplicate code '${c}'`);
    }
    expect(problems).toEqual([]);
  });

  it('every field value matches its type, options, range and format', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) for (const r of x[e.key] ?? []) for (const f of e.fields) {
      const v = r[f.key];
      const at = where(m, `/${e.key}#${r.id}.${f.key}`);
      if (v === undefined || v === null) continue;
      switch (f.type) {
        case 'select':
          if (!f.options?.includes(v)) problems.push(`${at}: '${v}' not in options`); break;
        case 'multiselect':
          if (!Array.isArray(v)) problems.push(`${at}: multiselect not an array`);
          else for (const o of v) if (!f.options?.includes(o)) problems.push(`${at}: '${o}' not in options`);
          break;
        case 'money': case 'number': case 'percent':
          if (!isNum(v)) { problems.push(`${at}: ${JSON.stringify(v)} not numeric`); break; }
          if (f.min !== undefined && v < f.min) problems.push(`${at}: ${v} < min ${f.min}`);
          if (f.max !== undefined && v > f.max) problems.push(`${at}: ${v} > max ${f.max}`);
          if (f.min === undefined && v < 0) problems.push(`${at}: ${v} negative (API rejects < 0 unless min < 0)`);
          break;
        case 'tel':
          if (typeof v !== 'string' || !isIndianMobile(v)) problems.push(`${at}: '${v}' fails isIndianMobile`); break;
        case 'email':
          if (typeof v !== 'string' || !EMAIL.test(v)) problems.push(`${at}: '${v}' not an email`); break;
        case 'date':
          if (typeof v !== 'string' || !validDate(v)) problems.push(`${at}: '${v}' not an ISO date`); break;
        case 'datetime':
          if (typeof v !== 'string' || !validDateTime(v)) problems.push(`${at}: '${v}' not an ISO datetime`); break;
        case 'checkbox':
          if (typeof v !== 'boolean') problems.push(`${at}: ${JSON.stringify(v)} not boolean`); break;
        case 'url':
          if (typeof v !== 'string' || !/^https?:\/\/\S+$/.test(v)) problems.push(`${at}: '${v}' not a URL`); break;
        case 'ref':
          if (typeof v !== 'string') problems.push(`${at}: ref value not a string id`); break;
        default:
          if (typeof v !== 'string') problems.push(`${at}: ${JSON.stringify(v)} not a string`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every required field has a value in every record', () => {
    const problems: string[] = [];
    for (const { m, e } of entities) for (const r of x[e.key] ?? []) for (const f of e.fields) {
      if (!f.required) continue;
      const v = r[f.key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) problems.push(where(m, `/${e.key}#${r.id}.${f.key}`) + ': required but empty');
    }
    expect(problems).toEqual([]);
  });

  it('every ref resolves (core collections or x)', () => {
    const problems: string[] = [];
    for (const { m, e, f } of allFields) {
      if (f.type !== 'ref' || !f.ref) continue;
      const target = ids(f.ref);
      for (const r of x[e.key] ?? []) {
        const v = r[f.key];
        if (v === undefined) continue;
        if (!target.has(v)) problems.push(where(m, `/${e.key}#${r.id}.${f.key}`) + `: '${v}' not found in ${f.ref}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every ref field is populated in at least one record (no silently empty refs)', () => {
    const problems: string[] = [];
    for (const { m, e, f } of allFields) {
      if (f.type !== 'ref') continue;
      const recs = x[e.key] ?? [];
      if (recs.length && !recs.some(r => r[f.key] !== undefined)) problems.push(where(m, `/${e.key}.${f.key}`) + `: ref to '${f.ref}' never populated`);
    }
    expect(problems).toEqual([]);
  });

  it('moduleSettings present for every module with settings, values match field types', () => {
    const problems: string[] = [];
    const ms = db.moduleSettings ?? {};
    for (const m of REGISTRY) {
      if (!m.settings?.length) continue;
      const s = ms[m.key];
      if (!s || typeof s !== 'object') { problems.push(`${where(m)}: moduleSettings missing`); continue; }
      for (const f of m.settings) {
        const v = s[f.key];
        const at = where(m, `:settings.${f.key}`);
        if (v === undefined) { problems.push(`${at}: missing`); continue; }
        if (f.type === 'select' && !f.options?.includes(v)) problems.push(`${at}: '${v}' not in options`);
        else if (f.type === 'multiselect' && (!Array.isArray(v) || v.some((o: string) => !f.options?.includes(o)))) problems.push(`${at}: ${JSON.stringify(v)} not ⊆ options`);
        else if (NUMERIC.includes(f.type) && (!isNum(v) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) problems.push(`${at}: ${JSON.stringify(v)} not numeric within range`);
        else if (f.type === 'checkbox' && typeof v !== 'boolean') problems.push(`${at}: ${JSON.stringify(v)} not boolean`);
        else if (['text', 'textarea', 'email', 'tel', 'url', 'date', 'datetime'].includes(f.type) && typeof v !== 'string') problems.push(`${at}: ${JSON.stringify(v)} not a string`);
      }
      for (const k of Object.keys(s)) if (!m.settings.some(f => f.key === k)) problems.push(`${where(m)}: moduleSettings has unknown key '${k}'`);
    }
    for (const k of Object.keys(ms)) if (!moduleByKey(k)?.settings?.length) problems.push(`${k}: moduleSettings for a module without settings`);
    expect(problems).toEqual([]);
  });
});
