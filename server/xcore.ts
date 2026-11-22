import { can } from '../shared/permissions';
import { isIndianMobile } from '../shared/format';
import { entityByKey, moduleByKey, moduleOfEntity, REGISTRY } from '../shared/registry';
import type { EntityDef, FieldDef, ModuleDef } from '../shared/registry';
import type { Action, DB, User } from '../shared/types';
import { HttpError } from './auth';
import type { CoreRequest, CoreResponse, Store } from './core';
import { objBody } from './core';
import { newId } from './domain';

type Rec = Record<string, any>;
interface Ctx { store: Store; req: CoreRequest; params: Record<string, string>; user: User }
export type XRoute = [string, string, (c: Ctx) => CoreResponse];

const ok = (body: any, status = 200): CoreResponse => ({ status, body });
const bad = (field: string, msg: string) => new HttpError(400, msg, field);
const missing = (v: unknown) => v === undefined || v === null || String(v).trim() === '' || (Array.isArray(v) && v.length === 0);
const PROTECTED = ['id', 'code', 'createdAt', 'createdBy'];
const CORE_REFS = ['clients', 'users', 'properties', 'staff', 'agents', 'brokers', 'owners', 'leads'];

/** Old db.json files may lack the module-engine collections; create them lazily. */
function xdb(db: DB) {
  db.x ??= {};
  db.xNext ??= {};
  db.moduleSettings ??= {};
  return db;
}

function allow(c: Ctx, m: ModuleDef | undefined, action: Action): ModuleDef {
  if (!m) throw new HttpError(404, 'Unknown module');
  if (!can(c.store.db().permissions, c.user.role, `m:${m.key}`, action)) throw new HttpError(403, 'Forbidden');
  return m;
}

function entityOf(c: Ctx, action: Action): { ent: EntityDef; list: Rec[] } {
  const ent = entityByKey(c.params.entity);
  if (!ent) throw new HttpError(404, 'Unknown entity');
  allow(c, moduleOfEntity(ent.key), action);
  const db = xdb(c.store.db());
  return { ent, list: (db.x[ent.key] ??= []) };
}

function refExists(db: DB, ref: string, id: unknown): boolean {
  if (CORE_REFS.includes(ref)) return ((db as unknown as Rec)[ref] as Rec[]).some(r => r.id === id);
  return (db.x[ref] ?? []).some(r => r.id === id);
}

/** Validate one field value (already known to be present); returns the value to store. */
function checkField(db: DB, f: FieldDef, v: any): any {
  const need = (cond: boolean, msg: string) => { if (!cond) throw bad(f.key, msg); };
  switch (f.type) {
    case 'number': case 'money': case 'percent': {
      const n = Number(v);
      need(typeof v !== 'boolean' && Number.isFinite(n), `${f.label} must be a number`);
      need(n >= Math.min(0, f.min ?? 0), `${f.label} must be >= ${Math.min(0, f.min ?? 0)}`);
      return n;
    }
    case 'email': need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)), `${f.label} must be a valid email`); return String(v);
    case 'tel': need(isIndianMobile(v), `${f.label} must be a 10-digit Indian mobile number`); return String(v);
    case 'select': need((f.options ?? []).includes(v), `${f.label} must be one of: ${(f.options ?? []).join(', ')}`); return v;
    case 'multiselect':
      need(Array.isArray(v) && v.every(o => (f.options ?? []).includes(o)), `${f.label} has an invalid option`);
      return v;
    case 'checkbox': return v === true || v === 'true';
    case 'ref': need(refExists(db, f.ref ?? '', v), `${f.label} not found`); return v;
    default: return String(v);
  }
}

function validate(db: DB, ent: EntityDef, b: Rec, creating: boolean): Rec {
  const out: Rec = {};
  for (const f of ent.fields) {
    if (PROTECTED.includes(f.key)) continue; // server-managed
    const has = f.key in b;
    if (!creating && !has) continue;
    if (missing(b[f.key])) {
      if (f.required) throw bad(f.key, `${f.label} is required`);
      if (has) out[f.key] = f.type === 'checkbox' ? false : undefined;
      continue;
    }
    out[f.key] = checkField(db, f, b[f.key]);
  }
  return out;
}

const byNewest = (a: Rec, b: Rec) => String(b.createdAt).localeCompare(String(a.createdAt));

function locate(list: Rec[], id: string): Rec {
  const rec = list.find(r => r.id === id);
  if (!rec) throw new HttpError(404, 'Not found');
  return rec;
}

/** Start date (YYYY-MM-DD) of a dashboard period; undefined = all time. */
function periodStart(period: string): string | undefined {
  const d = new Date();
  if (period === 'month') d.setUTCDate(1);
  else if (period === '3m') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 2); }
  else if (period === 'year') d.setUTCMonth(0, 1);
  else return undefined;
  return d.toISOString().slice(0, 10);
}

const tally = (rows: Rec[], key: (r: Rec) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m].map(([name, value]) => ({ name, value }));
};
const sum = (rows: Rec[], f: string) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);

function dashboard(db: DB, m: ModuleDef, period: string) {
  const from = periodStart(period);
  const cards: { label: string; value: number; money?: boolean }[] = [];
  const charts: { title: string; type: 'pie' | 'bar'; data: { name: string; value: number }[] }[] = [];
  const now = new Date();
  for (const e of m.entities.filter(e => !e.lookup)) {
    const all = db.x[e.key] ?? [];
    const rows = from ? all.filter(r => String(r.createdAt).slice(0, 10) >= from) : all;
    cards.push({ label: e.label, value: rows.length });
    if (e.amountField) cards.push({ label: `${e.label} - ${e.fields.find(f => f.key === e.amountField)?.label ?? 'Total'}`, value: sum(rows, e.amountField), money: true });
    if (e.statusField) charts.push({ title: `${e.label} by status`, type: 'pie', data: tally(rows, r => String(r[e.statusField!] ?? '-')) });
    if (e.dateField) {
      const months: string[] = [];
      for (let i = 5; i >= 0; i--) months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
      const counts = tally(rows.filter(r => r[e.dateField!]), r => String(r[e.dateField!]).slice(0, 7));
      charts.push({ title: `${e.label} per month`, type: 'bar', data: months.map(name => ({ name, value: counts.find(c => c.name === name)?.value ?? 0 })) });
    }
  }
  return { cards, charts };
}

function report(db: DB, m: ModuleDef, entityKey: string, groupBy: string) {
  const ent = m.entities.find(e => e.key === entityKey);
  if (!ent) throw new HttpError(404, 'Unknown entity');
  const gf = ent.fields.find(f => f.key === groupBy);
  if (!gf) throw bad('groupBy', 'Unknown field');
  const label = (v: any): string => {
    if (v === undefined || v === null || v === '') return '-';
    if (gf.type === 'ref') {
      const t = (gf.ref ? entityByKey(gf.ref) : undefined);
      const rec = t ? (db.x[t.key] ?? []).find(r => r.id === v) : ((db as unknown as Rec)[gf.ref ?? ''] as Rec[] | undefined)?.find(r => r.id === v);
      return String(rec?.[t?.titleField ?? 'name'] ?? rec?.code ?? v);
    }
    return Array.isArray(v) ? v.join(', ') : String(v);
  };
  const groups = new Map<string, { count: number; amount: number }>();
  for (const r of db.x[ent.key] ?? []) {
    const g = groups.get(label(r[groupBy])) ?? { count: 0, amount: 0 };
    g.count++;
    if (ent.amountField) g.amount += Number(r[ent.amountField]) || 0;
    groups.set(label(r[groupBy]), g);
  }
  const columns = [gf.label, 'Count', ...(ent.amountField ? ['Amount'] : [])];
  const rows = [...groups].map(([k, g]) => ({ [gf.label]: k, Count: g.count, ...(ent.amountField ? { Amount: g.amount } : {}) }));
  return { columns, rows };
}

export const xRoutes: XRoute[] = [
  ['GET', '/x/:entity', c => {
    const { list } = entityOf(c, 'view');
    return ok([...list].sort(byNewest));
  }],
  ['POST', '/x/:entity', c => {
    const { ent, list } = entityOf(c, 'create');
    const b = objBody(c), db = c.store.db();
    const rec: Rec = { ...validate(db, ent, b, true), id: newId(), createdAt: new Date().toISOString(), createdBy: c.user.id };
    if (ent.prefix) {
      const n = db.xNext[ent.key] ?? 1; // xNext = next number to use
      db.xNext[ent.key] = n + 1;
      rec.code = ent.prefix + String(n).padStart(4, '0');
    }
    list.push(rec);
    c.store.save();
    return ok(rec, 201);
  }],
  ['GET', '/x/:entity/:id', c => ok(locate(entityOf(c, 'view').list, c.params.id))],
  ['PUT', '/x/:entity/:id', c => {
    const { ent, list } = entityOf(c, 'edit');
    const rec = locate(list, c.params.id);
    const b = objBody(c);
    PROTECTED.forEach(k => delete b[k]);
    Object.assign(rec, validate(c.store.db(), ent, b, false));
    c.store.save();
    return ok(rec);
  }],
  ['DELETE', '/x/:entity/:id', c => {
    const { list } = entityOf(c, 'delete');
    list.splice(list.indexOf(locate(list, c.params.id)), 1);
    c.store.save();
    return ok({ ok: true });
  }],

  ['GET', '/m/:module/dashboard', c => {
    const m = allow(c, moduleByKey(c.params.module), 'view');
    return ok(dashboard(xdb(c.store.db()), m, String(c.req.query.period ?? 'all')));
  }],
  ['GET', '/m/:module/report', c => {
    const m = allow(c, moduleByKey(c.params.module), 'view');
    return ok(report(xdb(c.store.db()), m, String(c.req.query.entity ?? ''), String(c.req.query.groupBy ?? '')));
  }],
  ['GET', '/m/:module/settings', c => {
    const m = allow(c, moduleByKey(c.params.module), 'view');
    return ok(xdb(c.store.db()).moduleSettings[m.key] ?? {});
  }],
  ['PUT', '/m/:module/settings', c => {
    const m = allow(c, moduleByKey(c.params.module), 'edit');
    const db = xdb(c.store.db()), b = objBody(c);
    const cur = (db.moduleSettings[m.key] ??= {});
    for (const f of m.settings ?? []) {
      if (!(f.key in b)) continue;
      if (missing(b[f.key])) delete cur[f.key];
      else cur[f.key] = checkField(db, f, b[f.key]);
    }
    c.store.save();
    return ok(cur);
  }],

  ['GET', '/calendar', c => ok(calendarItems(xdb(c.store.db()), c.user.role, String(c.req.query.from ?? ''), String(c.req.query.to ?? '')))],
];

export interface CalendarItem { id: string; title: string; date: string; module: string; entity: string }
/** Items of every calendar entity the role can view, within [from, to] (either may be ''), oldest first. */
export function calendarItems(db: DB, role: User['role'], from: string, to: string): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const m of REGISTRY) {
    if (!can(db.permissions, role, `m:${m.key}`, 'view')) continue;
    for (const e of m.entities.filter(e => e.calendar && e.dateField)) {
      for (const r of db.x?.[e.key] ?? []) {
        const date = String(r[e.dateField!] ?? '').slice(0, 10);
        if (!date || (from && date < from) || (to && date > to)) continue;
        out.push({ id: r.id, title: String(r[e.titleField] ?? r.code ?? r.id), date, module: m.key, entity: e.key });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
