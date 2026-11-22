import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, loginAll, ROLES, seed, startServer, type Role, type Server } from './helpers';
import { DEFAULT_PERMISSIONS, can } from '../../shared/permissions';

let s: Server;
let tok: Record<Role, string>;
let store: any;
beforeAll(async () => {
  s = await startServer();
  tok = await loginAll(s.app);
  store = await import('../../server/store'); // same module instance as the app (resetModules ran before it)
});
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const get = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'get', url);
const NO_LEADS: Role[] = ROLES.filter(r => !can(DEFAULT_PERMISSIONS, r, 'leads', 'view'));
const WITH_LEADS: Role[] = ROLES.filter(r => can(DEFAULT_PERMISSIONS, r, 'leads', 'view'));
const NEWEST_FIRST = ['leads', 'requests', 'invoices', 'contracts', 'tenants', 'clients'];
const KEEP_ORDER = ['properties', 'owners', 'staff', 'agents', 'brokers', 'plans', 'users'];
const isDesc = (xs: string[]) => xs.every((x, i) => i === 0 || String(xs[i - 1]).localeCompare(String(x)) >= 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('V1.a GET /dashboard hides lead data from roles without leads:view', () => {
  it('default matrix: client and owner have no leads view (sanity)', () => {
    expect(NO_LEADS).toEqual(expect.arrayContaining(['client', 'owner']));
    expect(WITH_LEADS).toEqual(expect.arrayContaining(['admin', 'staff']));
  });

  it.each(NO_LEADS)('%s: lead fields are zero/empty', async role => {
    const res = await get('/api/dashboard', role);
    expect(res.status).toBe(200);
    expect(res.body.leadsThisMonth).toBe(0);
    expect(res.body.siteVisitsScheduled).toBe(0);
    expect(res.body.leadsByStatus).toEqual([]);
    expect(res.body.leadsBySource).toEqual([]);
    expect(res.body.recentLeads).toEqual([]);
  });

  it.each(NO_LEADS)('%s: lead fields stay empty for every period', async role => {
    for (const period of ['all', 'month', 'week', 'year', 'bogus']) {
      const b = (await get(`/api/dashboard?period=${period}`, role)).body;
      expect(b.leadsByStatus, period).toEqual([]);
      expect(b.recentLeads, period).toEqual([]);
      expect(b.leadsThisMonth, period).toBe(0);
    }
  });

  it.each(NO_LEADS)('%s: non-lead aggregates still present', async role => {
    const b = (await get('/api/dashboard', role)).body;
    for (const k of ['propertyByStatus', 'buyByStatus', 'rentByStatus', 'topCities']) expect(Array.isArray(b[k]), k).toBe(true);
    for (const k of ['saleIncome', 'rentalIncome', 'forSale', 'sold', 'rented', 'available']) expect(typeof b[k], k).toBe('number');
  });

  it('admin: lead data unchanged (matches seed)', async () => {
    const b = (await get('/api/dashboard')).body;
    expect(b.leadsBySource.reduce((a: number, x: any) => a + x.value, 0)).toBe(seed.leads.length);
    expect(b.leadsByStatus.reduce((a: number, x: any) => a + x.value, 0)).toBe(seed.leads.length);
    expect(b.siteVisitsScheduled).toBe(seed.leads.filter((l: any) => l.status === 'Site Visit Scheduled').length);
    expect(b.recentLeads.length).toBeGreaterThan(0);
  });

  it('staff: lead data still present', async () => {
    const b = (await get('/api/dashboard', 'staff')).body;
    expect(b.leadsByStatus.length).toBeGreaterThan(0);
    expect(b.recentLeads.length).toBeGreaterThan(0);
  });

  it.each(WITH_LEADS)('%s: leadsByStatus keeps its funnel shape (non-empty array of statuses)', async role => {
    const b = (await get('/api/dashboard', role)).body;
    expect(b.leadsByStatus.length).toBeGreaterThan(0);
  });

  it('admin grants leads:view to client -> client sees lead data', async () => {
    const m = clone((await get('/api/permissions')).body);
    m.client.leads = ['view'];
    const put = await call(s.app, tok.admin, 'put', '/api/permissions', m);
    expect(put.status).toBe(200);
    const b = (await get('/api/dashboard', 'client')).body;
    expect(b.leadsByStatus.reduce((a: number, x: any) => a + x.value, 0)).toBe(seed.leads.length);
    expect(b.leadsBySource.length).toBeGreaterThan(0);
    expect(b.recentLeads.length).toBeGreaterThan(0);
    expect(b.siteVisitsScheduled).toBe(seed.leads.filter((l: any) => l.status === 'Site Visit Scheduled').length);
  });

  it('admin revokes leads:view from staff -> staff lead data is emptied', async () => {
    const m = clone((await get('/api/permissions')).body);
    delete m.staff.leads;
    expect((await call(s.app, tok.admin, 'put', '/api/permissions', m)).status).toBe(200);
    const b = (await get('/api/dashboard', 'staff')).body;
    expect(b.leadsByStatus).toEqual([]);
    expect(b.recentLeads).toEqual([]);
    expect(b.leadsThisMonth).toBe(0);
  });

  it('leads granted with edit but not view -> still hidden (view is the gate)', async () => {
    const m = clone((await get('/api/permissions')).body);
    m.client.leads = ['edit'];
    expect((await call(s.app, tok.admin, 'put', '/api/permissions', m)).status).toBe(200);
    const b = (await get('/api/dashboard', 'client')).body;
    expect(b.recentLeads).toEqual([]);
    expect(b.leadsBySource).toEqual([]);
  });
});

describe('V1.a GET /:col newest createdAt first', () => {
  it.each(NEWEST_FIRST)('%s: sorted by createdAt descending', async col => {
    const res = await get(`/api/${col}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(seed[col].length);
    expect(isDesc(res.body.map((r: any) => r.createdAt))).toBe(true);
  });

  it.each(KEEP_ORDER)('%s: keeps original (stored) order', async col => {
    const res = await get(`/api/${col}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual(seed[col].map((r: any) => r.id));
  });

  it('a newly created lead is first', async () => {
    const created = await call(s.app, tok.admin, 'post', '/api/leads', { name: 'Newest Lead', phone: '9876543210' });
    expect(created.status).toBe(201);
    const list = (await get('/api/leads')).body;
    expect(list[0].id).toBe(created.body.id);
  });

  it('a newly created property is NOT moved to the top (properties keep order)', async () => {
    const before = (await get('/api/properties')).body.map((r: any) => r.id);
    const db = store.getDb();
    db.properties.push({ ...clone(db.properties[0]), id: 'prp-zzz-new', code: 'ZZZ', createdAt: '2999-01-01T00:00:00.000Z' });
    const after = (await get('/api/properties')).body.map((r: any) => r.id);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after[after.length - 1]).toBe('prp-zzz-new');
  });

  it('sort does not mutate stored order', async () => {
    const ids = store.getDb().leads.map((r: any) => r.id);
    await get('/api/leads');
    expect(store.getDb().leads.map((r: any) => r.id)).toEqual(ids);
  });

  it('equal createdAt ties do not crash and keep all rows', async () => {
    const db = store.getDb();
    const t = '2030-01-01T00:00:00.000Z';
    db.leads = db.leads.map((l: any) => ({ ...l, createdAt: t }));
    const res = await get('/api/leads');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(seed.leads.length);
    expect(new Set(res.body.map((r: any) => r.id)).size).toBe(seed.leads.length);
  });

  it('missing createdAt on a row does not crash', async () => {
    const db = store.getDb();
    delete db.leads[0].createdAt;
    const res = await get('/api/leads');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(seed.leads.length);
  });

  it.each(NEWEST_FIRST)('%s: empty collection returns []', async col => {
    store.getDb()[col] = [];
    const res = await get(`/api/${col}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('single-element collection returns that element', async () => {
    const db = store.getDb();
    db.invoices = [db.invoices[0]];
    const res = await get('/api/invoices');
    expect(res.body.map((r: any) => r.id)).toEqual([seed.invoices[0].id]);
  });

  it('requests?kind=rent is filtered AND newest first', async () => {
    const res = await get('/api/requests?kind=rent');
    expect(res.status).toBe(200);
    expect(res.body.every((r: any) => r.kind === 'rent')).toBe(true);
    expect(isDesc(res.body.map((r: any) => r.createdAt))).toBe(true);
  });

  it('scoped role (client) list is newest first too', async () => {
    const res = await get('/api/invoices', 'client');
    expect(res.status).toBe(200);
    expect(isDesc(res.body.map((r: any) => r.createdAt))).toBe(true);
  });
});

describe('V1.d server/index.ts listens on API_PORT || 4000', () => {
  const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server/index.ts'), 'utf8');
  it('reads API_PORT', () => { expect(src).toMatch(/process\.env\.API_PORT/); });
  it('does not read PORT', () => { expect(src).not.toMatch(/process\.env\.PORT\b/); expect(src).not.toMatch(/process\.env\[['"]PORT['"]\]/); });
  it('falls back to 4000', () => { expect(src).toMatch(/\|\|\s*4000/); });
});
