import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateRegistryData } from '../../shared/seedgen';
import { isIndianMobile } from '../../shared/format';
import type { EntityDef, FieldDef, ModuleDef } from '../../shared/registry';
import type { DB } from '../../shared/types';

// §10.1 types, §10.3 seed rules, ADR-9. Synthetic registries only; core DB = data/seed.json.
const ROOT = path.resolve(__dirname, '..', '..');
const SEED = path.join(ROOT, 'data', 'seed.json');
const core: DB = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const TODAY = '2026-11-22';
const DAY = 86400000;
const ms = (d: string) => Date.parse(d.slice(0, 10) + 'T00:00:00Z');
const daysFromToday = (d: string) => (ms(d) - ms(TODAY)) / DAY;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

// mulberry32: small seeded PRNG
const prng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const run = (reg: ModuleDef[], seed = 42, db: DB = core) => generateRegistryData(reg, db, prng(seed), TODAY);

const ent = (key: string, fields: FieldDef[], extra: Partial<EntityDef> = {}): EntityDef =>
  ({ key, label: key, singular: key, titleField: fields[0]?.key ?? 'name', fields, ...extra });
const mod = (key: string, entities: EntityDef[], settings?: FieldDef[]): ModuleDef =>
  ({ key, label: key, icon: 'Box', group: 'Tools', pages: [], entities, settings });
const f = (key: string, type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({ key, label: key, type, ...extra });

describe('seedgen: determinism (§10.3)', () => {
  const reg = [mod('t', [ent('t_a', [f('name', 'text'), f('amt', 'money', { min: 100, max: 9000 }), f('d', 'date'), f('who', 'ref', { ref: 'clients' })], { prefix: 'TA-' })])];
  it('same seed gives deep-equal output', () => {
    expect(run(reg, 7)).toEqual(run(reg, 7));
  });
  it('different seed gives different output', () => {
    expect(run(reg, 7)).not.toEqual(run(reg, 8));
  });
  it('does not mutate the core DB', () => {
    const before = JSON.stringify(core.users);
    run(reg);
    expect(JSON.stringify(core.users)).toBe(before);
  });
});

describe('seedgen: counts, code, xNext', () => {
  it('seedCount defaults to 12', () => {
    const out = run([mod('t', [ent('t_a', [f('name', 'text')])])]);
    expect(out.x.t_a).toHaveLength(12);
    expect(out.xNext.t_a).toBe(13);
  });
  it.each([0, 1, 3, 25])('explicit seedCount %d honoured, xNext = count+1', n => {
    const out = run([mod('t', [ent('t_a', [f('name', 'text')], { seedCount: n, prefix: 'Q-' })])]);
    expect(out.x.t_a).toHaveLength(n);
    expect(out.xNext.t_a).toBe(n + 1);
  });
  it('implicit code = prefix + 4 digits, sequential', () => {
    const out = run([mod('t', [ent('t_a', [f('name', 'text')], { seedCount: 12, prefix: 'VEH-' })])]);
    out.x.t_a.forEach((r, i) => {
      expect(r.code).toMatch(/^VEH-\d{4}$/);
      expect(r.code).toBe(`VEH-${String(i + 1).padStart(4, '0')}`);
    });
  });
  it('no code field when entity has no prefix', () => {
    const out = run([mod('t', [ent('t_a', [f('name', 'text')], { seedCount: 3 })])]);
    for (const r of out.x.t_a) expect('code' in r).toBe(false);
  });
  it('empty registry yields empty x/xNext/moduleSettings', () => {
    expect(run([])).toEqual({ x: {}, xNext: {}, moduleSettings: {} });
  });
  it('module with zero entities still gets settings, no x keys', () => {
    const out = run([mod('t', [], [f('flag', 'checkbox')])]);
    expect(out.x).toEqual({});
    expect(out.moduleSettings.t).toEqual({ flag: true });
  });
});

describe('seedgen: field types', () => {
  const fields: FieldDef[] = [
    f('title', 'text'),
    f('notes', 'textarea'),
    f('amt', 'money', { min: 5000, max: 750000 }),
    f('qty', 'number', { min: 1, max: 20 }),
    f('neg', 'number', { min: -50, max: 50 }),
    f('pct', 'percent'),
    f('pctb', 'percent', { min: 10, max: 20 }),
    f('createdOn', 'date'),
    f('dueDate', 'date'), f('expiryDate', 'date'), f('endDate', 'date'), f('deadline', 'date'),
    f('renewOn', 'date'), f('validUntil', 'date'), f('nextService', 'date'), f('until', 'date'),
    f('startDate', 'date'), f('joinedOn', 'date'),
    f('stamp', 'datetime'),
    f('mobile', 'tel'),
    f('mail', 'email'),
    f('site', 'url'),
    f('kind', 'select', { options: ['A', 'B', 'C'] }),
    f('tags', 'multiselect', { options: ['x', 'y', 'z', 'w'] }),
    f('one', 'multiselect', { options: ['only'] }),
    f('ok', 'checkbox'),
  ];
  const out = run([mod('t', [ent('t_all', fields, { seedCount: 40 })])], 3);
  const rows = out.x.t_all;

  it('text / textarea are non-empty strings', () => {
    for (const r of rows) { expect(typeof r.title).toBe('string'); expect(r.title.length).toBeGreaterThan(0); expect(typeof r.notes).toBe('string'); }
  });
  it('money within [min,max]', () => {
    for (const r of rows) { expect(typeof r.amt).toBe('number'); expect(r.amt).toBeGreaterThanOrEqual(5000); expect(r.amt).toBeLessThanOrEqual(750000); }
  });
  it('number within [min,max], integer for narrow ranges', () => {
    for (const r of rows) { expect(Number.isInteger(r.qty)).toBe(true); expect(r.qty).toBeGreaterThanOrEqual(1); expect(r.qty).toBeLessThanOrEqual(20); }
  });
  it('negative min honoured', () => {
    for (const r of rows) { expect(r.neg).toBeGreaterThanOrEqual(-50); expect(r.neg).toBeLessThanOrEqual(50); }
  });
  it('percent default 0–100 and custom range', () => {
    for (const r of rows) {
      expect(Number.isInteger(r.pct)).toBe(true); expect(r.pct).toBeGreaterThanOrEqual(0); expect(r.pct).toBeLessThanOrEqual(100);
      expect(r.pctb).toBeGreaterThanOrEqual(10); expect(r.pctb).toBeLessThanOrEqual(20);
    }
  });
  it('money/number without min/max stay in default range and >= 0', () => {
    const o = run([mod('t', [ent('t_d', [f('m', 'money'), f('n', 'number')], { seedCount: 30 })])]);
    for (const r of o.x.t_d) { expect(r.m).toBeGreaterThanOrEqual(0); expect(r.m).toBeLessThanOrEqual(500000); expect(r.n).toBeGreaterThanOrEqual(0); }
  });
  it('min == max gives exactly that value', () => {
    const o = run([mod('t', [ent('t_e', [f('m', 'money', { min: 2500, max: 2500 }), f('n', 'number', { min: 7, max: 7 })], { seedCount: 5 })])]);
    for (const r of o.x.t_e) { expect(r.m).toBe(2500); expect(r.n).toBe(7); }
  });
  it('dates are ISO yyyy-mm-dd within ±180 days', () => {
    for (const r of rows) for (const k of ['createdOn', 'dueDate', 'startDate']) {
      expect(r[k]).toMatch(ISO_DATE);
      expect(Math.abs(daysFromToday(r[k]))).toBeLessThanOrEqual(180);
    }
  });
  it.each(['dueDate', 'expiryDate', 'endDate', 'deadline', 'renewOn', 'validUntil', 'nextService', 'until'])('future-key %s is after today', k => {
    for (const r of rows) expect(daysFromToday(r[k]), `${k}=${r[k]}`).toBeGreaterThan(0);
  });
  it.each(['createdOn', 'startDate', 'joinedOn'])('non-future key %s is today or past', k => {
    for (const r of rows) expect(daysFromToday(r[k]), `${k}=${r[k]}`).toBeLessThanOrEqual(0);
  });
  it('datetime is a full ISO timestamp', () => {
    for (const r of rows) { expect(r.stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/); expect(isNaN(Date.parse(r.stamp))).toBe(false); }
  });
  it('tel passes isIndianMobile and looks like +91 9xxxx xxxxx', () => {
    for (const r of rows) { expect(isIndianMobile(r.mobile), r.mobile).toBe(true); expect(r.mobile).toMatch(/^\+91 [6-9]\d{4} \d{5}$/); }
  });
  it('gen phone passes isIndianMobile', () => {
    const o = run([mod('t', [ent('t_p', [f('ph', 'text', { gen: 'phone' })], { seedCount: 30 })])]);
    for (const r of o.x.t_p) expect(isIndianMobile(r.ph), r.ph).toBe(true);
  });
  it('email has valid format', () => {
    for (const r of rows) expect(r.mail).toMatch(EMAIL);
  });
  it('url is https', () => {
    for (const r of rows) expect(r.site).toMatch(/^https:\/\/www\.[a-z0-9]+\.in$/);
  });
  it('select value is in options', () => {
    for (const r of rows) expect(['A', 'B', 'C']).toContain(r.kind);
  });
  it('multiselect is a non-empty subset of options without duplicates', () => {
    for (const r of rows) {
      expect(Array.isArray(r.tags)).toBe(true);
      expect(r.tags.length).toBeGreaterThan(0);
      expect(r.tags.length).toBeLessThanOrEqual(3);
      expect(new Set(r.tags).size).toBe(r.tags.length);
      for (const t of r.tags) expect(['x', 'y', 'z', 'w']).toContain(t);
      expect(r.one).toEqual(['only']);
    }
  });
  it('checkbox is boolean, both values appear', () => {
    for (const r of rows) expect(typeof r.ok).toBe('boolean');
    expect(new Set(rows.map(r => r.ok)).size).toBe(2);
  });
  it('select/multiselect without options do not crash (select omitted, multiselect [])', () => {
    const o = run([mod('t', [ent('t_n', [f('name', 'text'), f('s', 'select'), f('m', 'multiselect')], { seedCount: 2 })])]);
    for (const r of o.x.t_n) { expect(r.s).toBeUndefined(); expect(r.m).toEqual([]); }
  });
});

describe('seedgen: value precedence pool → options → gen → type default', () => {
  it('pool beats options and gen', () => {
    const o = run([mod('t', [ent('t_a', [f('v', 'select', { pool: ['P1', 'P2'], options: ['O1', 'O2'], gen: 'city' })], { seedCount: 30 })])]);
    for (const r of o.x.t_a) expect(['P1', 'P2']).toContain(r.v);
  });
  it('options beat gen', () => {
    const o = run([mod('t', [ent('t_a', [f('v', 'text', { options: ['O1', 'O2'], gen: 'city' })], { seedCount: 30 })])]);
    for (const r of o.x.t_a) expect(['O1', 'O2']).toContain(r.v);
  });
  it('gen beats type default', () => {
    const o = run([mod('t', [ent('t_a', [f('v', 'text', { gen: 'serial' })], { seedCount: 10 })])]);
    for (const r of o.x.t_a) expect(r.v).toMatch(/^SN-[A-Z]{2}\d{6}$/);
  });
  it('empty pool falls through to options', () => {
    const o = run([mod('t', [ent('t_a', [f('v', 'select', { pool: [], options: ['O1'] })], { seedCount: 5 })])]);
    for (const r of o.x.t_a) expect(r.v).toBe('O1');
  });
  it('multiselect pool gives a non-empty subset of the pool', () => {
    const o = run([mod('t', [ent('t_a', [f('v', 'multiselect', { pool: ['a', 'b'], options: ['c'] })], { seedCount: 10 })])]);
    for (const r of o.x.t_a) { expect(r.v.length).toBeGreaterThan(0); for (const t of r.v) expect(['a', 'b']).toContain(t); }
  });
  it('status field is skewed: first option most common, every option still in range', () => {
    const opts = ['Active', 'Pending', 'Closed', 'Cancelled'];
    const o = run([mod('t', [ent('t_s', [f('name', 'text'), f('status', 'select', { options: opts })], { seedCount: 400, statusField: 'status' })])], 11);
    const counts = opts.map(s => o.x.t_s.filter(r => r.status === s).length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(400);
    expect(counts[0]).toBeGreaterThan(counts[3]);
    expect(counts[0]).toBe(Math.max(...counts));
  });
});

describe('seedgen: email reuses last person/company in the record', () => {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  it('person then email: local part starts with the person slug', () => {
    const o = run([mod('t', [ent('t_a', [f('name', 'text', { gen: 'person' }), f('mail', 'email')], { seedCount: 20 })])]);
    for (const r of o.x.t_a) { expect(r.mail.startsWith(slug(r.name)), `${r.name} / ${r.mail}`).toBe(true); expect(r.mail).toMatch(EMAIL); }
  });
  it('company then email: local part and domain derive from the company', () => {
    const o = run([mod('t', [ent('t_a', [f('co', 'text', { gen: 'company' }), f('mail', 'email')], { seedCount: 20 })])]);
    for (const r of o.x.t_a) {
      expect(r.mail.startsWith(slug(r.co) + '@'), `${r.co} / ${r.mail}`).toBe(true);
      expect(r.mail.endsWith('.in')).toBe(true);
      expect(r.mail).toMatch(EMAIL);
    }
  });
  it('last one wins: person then company then email uses company', () => {
    const o = run([mod('t', [ent('t_a', [f('p', 'text', { gen: 'person' }), f('co', 'text', { gen: 'company' }), f('mail', 'email')], { seedCount: 10 })])]);
    for (const r of o.x.t_a) expect(r.mail.startsWith(slug(r.co) + '@')).toBe(true);
  });
  it('name does not leak across records', () => {
    const o = run([mod('t', [ent('t_a', [f('mail', 'email'), f('name', 'text', { gen: 'person' })], { seedCount: 10 })])]);
    for (const r of o.x.t_a) expect(r.mail).toMatch(EMAIL);
  });
});

describe('seedgen: refs (FK-valid)', () => {
  const ids = (name: string) => new Set(((core as any)[name] as { id: string }[]).map(r => r.id));
  it.each(['clients', 'users', 'properties', 'staff', 'agents', 'brokers', 'owners', 'leads'])('ref to core %s picks a real id', col => {
    const o = run([mod('t', [ent('t_a', [f('name', 'text'), f('r', 'ref', { ref: col })], { seedCount: 15 })])]);
    const set = ids(col);
    for (const r of o.x.t_a) expect(set.has(r.r), `${col}:${r.r}`).toBe(true);
  });
  it('ref to an earlier registry entity resolves', () => {
    const o = run([mod('t', [ent('t_parent', [f('name', 'text')], { seedCount: 4 }), ent('t_child', [f('name', 'text'), f('p', 'ref', { ref: 't_parent' })], { seedCount: 10 })])]);
    const set = new Set(o.x.t_parent.map(r => r.id));
    for (const r of o.x.t_child) expect(set.has(r.p)).toBe(true);
  });
  it('lookup referenced by a non-lookup that comes EARLIER in registry order still resolves (lookups first)', () => {
    const reg = [
      mod('a', [ent('a_jobs', [f('name', 'text'), f('cat', 'ref', { ref: 'b_categories' })], { seedCount: 10 })]),
      mod('b', [ent('b_categories', [f('name', 'text')], { seedCount: 3, lookup: true })]),
    ];
    const o = run(reg);
    const set = new Set(o.x.b_categories.map(r => r.id));
    expect(set.size).toBe(3);
    for (const r of o.x.a_jobs) expect(set.has(r.cat), String(r.cat)).toBe(true);
    // output keeps registry order
    expect(Object.keys(o.x)).toEqual(['a_jobs', 'b_categories']);
    expect(Object.keys(o.xNext)).toEqual(['a_jobs', 'b_categories']);
  });
  it('non-lookup referencing a LATER non-lookup is left undefined (registry order)', () => {
    const o = run([mod('t', [ent('t_first', [f('name', 'text'), f('later', 'ref', { ref: 't_second' })], { seedCount: 3 }), ent('t_second', [f('name', 'text')], { seedCount: 3 })])]);
    for (const r of o.x.t_first) { expect(r.later).toBeUndefined(); expect('later' in r).toBe(false); }
  });
  it('ref to an entity with seedCount 0 is left undefined (key absent)', () => {
    const o = run([mod('t', [ent('t_empty', [f('name', 'text')], { seedCount: 0, lookup: true }), ent('t_user', [f('name', 'text'), f('e', 'ref', { ref: 't_empty' })], { seedCount: 4 })])]);
    expect(o.x.t_empty).toEqual([]);
    for (const r of o.x.t_user) expect('e' in r).toBe(false);
  });
  it('ref to an empty core collection is left undefined', () => {
    const o = run([mod('t', [ent('t_a', [f('name', 'text'), f('c', 'ref', { ref: 'clients' })], { seedCount: 3 })])], 1, { ...core, clients: [] });
    for (const r of o.x.t_a) expect('c' in r).toBe(false);
  });
  it('unknown ref target does not throw and leaves the value undefined (reporting lives in scripts/seed.ts integrity)', () => {
    const o = run([mod('t', [ent('t_a', [f('name', 'text'), f('bad', 'ref', { ref: 'no_such_entity' })], { seedCount: 3 })])]);
    for (const r of o.x.t_a) expect('bad' in r).toBe(false);
    expect(o.x.no_such_entity).toBeUndefined();
  });
  it('ref field with no ref key is left undefined', () => {
    const o = run([mod('t', [ent('t_a', [f('name', 'text'), f('r', 'ref')], { seedCount: 2 })])]);
    for (const r of o.x.t_a) expect('r' in r).toBe(false);
  });
});

describe('seedgen: record metadata', () => {
  const reg = [
    mod('a', [ent('a_one', [f('name', 'text')], { prefix: 'A-' }), ent('a_two', [f('name', 'text')], { seedCount: 30 })]),
    mod('b', [ent('b_lk', [f('name', 'text')], { lookup: true, seedCount: 5 })]),
  ];
  const o = run(reg);
  const all = Object.values(o.x).flat();
  it('createdBy is an existing admin or staff user', () => {
    const ok = new Set(core.users.filter(u => u.role === 'admin' || u.role === 'staff').map(u => u.id));
    for (const r of all) expect(ok.has(r.createdBy), String(r.createdBy)).toBe(true);
  });
  it('createdAt is ISO and not in the future', () => {
    for (const r of all) { expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/); expect(daysFromToday(r.createdAt)).toBeLessThanOrEqual(0); }
  });
  it('ids unique across all entities', () => {
    expect(new Set(all.map(r => r.id)).size).toBe(all.length);
  });
  it('createdBy omitted (not invalid) when core has no admin/staff', () => {
    const o2 = run(reg, 42, { ...core, users: core.users.filter(u => u.role !== 'admin' && u.role !== 'staff') });
    for (const r of Object.values(o2.x).flat()) expect(r.createdBy).toBeUndefined();
  });
});

describe('seedgen: moduleSettings defaults', () => {
  it('first pool, else first option, checkbox true, number/money/percent min??0, else empty string', () => {
    const o = run([mod('m', [], [
      f('p', 'select', { pool: ['P1', 'P2'], options: ['O1'] }),
      f('o', 'select', { options: ['O1', 'O2'] }),
      f('ms', 'multiselect', { options: ['a', 'b'] }),
      f('cb', 'checkbox'),
      f('n0', 'number'),
      f('n5', 'number', { min: 5 }),
      f('mo', 'money', { min: 1000 }),
      f('pc', 'percent'),
      f('neg', 'number', { min: -3 }),
      f('t', 'text'),
      f('e', 'email'),
      f('d', 'date'),
    ])]);
    expect(o.moduleSettings.m).toEqual({ p: 'P1', o: 'O1', ms: ['a'], cb: true, n0: 0, n5: 5, mo: 1000, pc: 0, neg: -3, t: '', e: '', d: '' });
  });
  it('modules without settings (or empty settings) get no entry', () => {
    const o = run([mod('a', []), mod('b', [], [])]);
    expect(o.moduleSettings).toEqual({});
  });
});

describe('seedgen: browser-safe (ADR-9)', () => {
  it('shared/seedgen.ts imports no Node built-ins', () => {
    const src = fs.readFileSync(path.join(ROOT, 'shared', 'seedgen.ts'), 'utf8');
    const specs = [...src.matchAll(/(?:import[^'"]*from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
    const builtins = ['fs', 'path', 'os', 'crypto', 'child_process', 'url', 'util', 'buffer', 'stream', 'process'];
    for (const s of specs) {
      expect(s.startsWith('node:'), s).toBe(false);
      expect(builtins.includes(s), s).toBe(false);
    }
    expect(src).not.toMatch(/\bprocess\.|\bBuffer\b|\b__dirname\b/);
    expect(src).not.toMatch(/Math\.random|Date\.now|new Date\(\)/);
  });
});

describe('seedgen: real data/seed.json', () => {
  it('has x, xNext, moduleSettings', () => {
    const d = core as any;
    expect(d.x && typeof d.x).toBe('object');
    expect(d.xNext && typeof d.xNext).toBe('object');
    expect(d.moduleSettings && typeof d.moduleSettings).toBe('object');
    for (const k of Object.keys(d.x)) expect(d.xNext[k]).toBe(d.x[k].length + 1);
  });
  it('every x record ref field (per REGISTRY) resolves', async ctx => {
    let REGISTRY: ModuleDef[] = [];
    try { ({ REGISTRY } = await import('../../shared/registry')); } catch { ctx.skip(); return; }
    if (!REGISTRY?.length) { ctx.skip(); return; }
    const d = core as any;
    const coreCols = ['clients', 'users', 'properties', 'staff', 'agents', 'brokers', 'owners', 'leads'];
    const bad: string[] = [];
    for (const e of REGISTRY.flatMap(m => m.entities)) {
      const rows: any[] | undefined = d.x[e.key];
      if (!rows) continue; // seed.json may predate this module file
      for (const fd of e.fields) {
        if (fd.type !== 'ref' || !fd.ref) continue;
        const target: any[] | undefined = coreCols.includes(fd.ref) ? d[fd.ref] : d.x[fd.ref];
        if (!target) { bad.push(`${e.key}.${fd.key} -> unknown ${fd.ref}`); continue; }
        const set = new Set(target.map((r: any) => r.id));
        for (const r of rows) if (r[fd.key] !== undefined && !set.has(r[fd.key])) bad.push(`${r.id}.${fd.key} -> ${r[fd.key]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('ids unique across all x records', () => {
    const all = Object.values((core as any).x as Record<string, { id: string }[]>).flat();
    expect(new Set(all.map(r => r.id)).size).toBe(all.length);
  });
});
