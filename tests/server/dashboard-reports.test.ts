import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, loginAll, ownPropertyIds, ROLES, seed, seedUser, startServer, type Role, type Server } from './helpers';

let s: Server;
let tok: Record<Role, string>;
beforeAll(async () => { s = await startServer(); tok = await loginAll(s.app); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const get = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'get', url);
const paid = (i: any) => i.payments.reduce((a: number, p: any) => a + p.amount, 0);
const ARRAYS = ['propertyByStatus', 'buyByStatus', 'rentByStatus', 'requestsByListingType', 'topCities', 'leadsByStatus', 'leadsBySource'];
const NUMBERS = ['saleIncome', 'rentalIncome', 'forSale', 'sold', 'selling', 'forLease', 'rented', 'available', 'leadsThisMonth', 'siteVisitsScheduled'];
const LEAD_STATUSES = ['New', 'Contacted', 'Site Visit Scheduled', 'Site Visit Done', 'Negotiation', 'Booked', 'Lost'];
const REPORTS = ['rent-paid', 'vacant-rental', 'rental-units', 'delinquent-tenants', 'leases-ending', 'vacant-sale', 'sold-units', 'lead-funnel'];
const sumValues = (xs: any[]) => xs.reduce((a, x) => a + x.value, 0);

describe('GET /dashboard', () => {
  it.each(ROLES)('%s: aggregates are [{name,value}] arrays and numeric counters', async role => {
    const res = await get('/api/dashboard', role);
    expect(res.status).toBe(200);
    for (const k of ARRAYS) {
      expect(Array.isArray(res.body[k]), k).toBe(true);
      res.body[k].forEach((x: any) => {
        expect(Object.keys(x).sort(), k).toEqual(['name', 'value']);
        expect(typeof x.value).toBe('number');
      });
    }
    for (const k of NUMBERS) expect(typeof res.body[k], k).toBe('number');
    expect(Array.isArray(res.body.recentLeads)).toBe(true);
    expect(res.body.recentLeads.length).toBeLessThanOrEqual(5);
    expect(res.body.topCities.length).toBeLessThanOrEqual(5);
  });

  it('admin totals match seed', async () => {
    const d = (await get('/api/dashboard')).body;
    expect(sumValues(d.propertyByStatus)).toBe(seed.properties.length);
    expect(sumValues(d.buyByStatus)).toBe(seed.requests.filter((r: any) => r.kind === 'buy').length);
    expect(sumValues(d.rentByStatus)).toBe(seed.requests.filter((r: any) => r.kind === 'rent').length);
    expect(sumValues(d.requestsByListingType)).toBe(seed.requests.length);
    expect(sumValues(d.leadsBySource)).toBe(seed.leads.length);
    expect(d.leadsByStatus.map((x: any) => x.name)).toEqual(LEAD_STATUSES);
    expect(sumValues(d.leadsByStatus)).toBe(seed.leads.length);
    expect(d.sold).toBe(seed.properties.filter((p: any) => p.status === 'Sold').length);
    expect(d.rented).toBe(seed.properties.filter((p: any) => p.status === 'Rented').length);
    expect(d.selling).toBe(seed.properties.filter((p: any) => p.status === 'Pending Sale').length);
    expect(d.saleIncome).toBe(seed.invoices.filter((i: any) => i.kind === 'buy').reduce((a: number, i: any) => a + paid(i), 0));
    expect(d.rentalIncome).toBe(seed.invoices.filter((i: any) => i.kind === 'rent').reduce((a: number, i: any) => a + paid(i), 0));
    expect(d.siteVisitsScheduled).toBe(seed.leads.filter((l: any) => l.status === 'Site Visit Scheduled').length);
    const month = new Date().toISOString().slice(0, 7);
    expect(d.leadsThisMonth).toBe(seed.leads.filter((l: any) => l.createdAt.startsWith(month)).length);
    const top = d.topCities.map((x: any) => x.value);
    expect([...top].sort((a, b) => b - a)).toEqual(top);
    const created = d.recentLeads.map((l: any) => l.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
  });

  it('leadsThisMonth counts a lead created now', async () => {
    const before = (await get('/api/dashboard')).body.leadsThisMonth;
    await call(s.app, tok.admin, 'post', '/api/leads', { name: 'Now', phone: '9876543210' });
    const after = (await get('/api/dashboard')).body;
    expect(after.leadsThisMonth).toBe(before + 1);
    expect(after.recentLeads[0].name).toBe('Now');
  });

  it('recording a payment raises rentalIncome by that amount', async () => {
    const inv = seed.invoices.find((i: any) => i.kind === 'rent' && i.status !== 'Paid');
    const before = (await get('/api/dashboard')).body.rentalIncome;
    await call(s.app, tok.admin, 'post', `/api/invoices/${inv.id}/payments`, { amount: 1000, mode: 'UPI' });
    expect((await get('/api/dashboard')).body.rentalIncome).toBe(before + 1000);
  });

  it.each(['agent', 'broker', 'owner'] as Role[])('%s dashboard is scoped to own properties', async role => {
    const own = ownPropertyIds(role);
    const d = (await get('/api/dashboard', role)).body;
    expect(sumValues(d.propertyByStatus)).toBe(own.size);
    const ownInv = seed.invoices.filter((i: any) => own.has(i.propertyId));
    const canSeeInvoices = (await get('/api/invoices', role)).status === 200;
    // income comes from the scoped invoice list
    const expected = (kind: string) => ownInv.filter((i: any) => i.kind === kind).reduce((a: number, i: any) => a + paid(i), 0);
    if (canSeeInvoices) {
      expect(d.saleIncome).toBe(expected('buy'));
      expect(d.rentalIncome).toBe(expected('rent'));
    }
  });

  it('agent dashboard leads are only those assigned to the agent', async () => {
    const d = (await get('/api/dashboard', 'agent')).body;
    expect(sumValues(d.leadsBySource)).toBe(seed.leads.filter((l: any) => l.assignedTo === seedUser('agent').id).length);
  });

  it('client dashboard income only from own invoices; no other clients leak', async () => {
    const me = seedUser('client').linkedId;
    const d = (await get('/api/dashboard', 'client')).body;
    const mine = seed.invoices.filter((i: any) => i.clientId === me);
    expect(d.saleIncome + d.rentalIncome).toBe(mine.reduce((a: number, i: any) => a + paid(i), 0));
    expect(sumValues(d.buyByStatus) + sumValues(d.rentByStatus)).toBe(seed.requests.filter((r: any) => r.clientId === me).length);
  });

  it('dashboard without token -> 401', async () => {
    expect((await call(s.app, null, 'get', '/api/dashboard')).status).toBe(401);
  });
});

describe('GET /reports/:type', () => {
  it.each(REPORTS)('%s returns {columns, rows} with every row as wide as columns', async type => {
    const res = await get(`/api/reports/${type}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.columns)).toBe(true);
    expect(res.body.columns.length).toBeGreaterThan(0);
    res.body.columns.forEach((c: unknown) => expect(typeof c).toBe('string'));
    expect(Array.isArray(res.body.rows)).toBe(true);
    res.body.rows.forEach((row: unknown[]) => expect(row).toHaveLength(res.body.columns.length));
  });

  it.each(REPORTS)('%s is also available to staff', async type => {
    expect((await get(`/api/reports/${type}`, 'staff')).status).toBe(200);
  });

  it('unknown report type -> 404', async () => {
    expect((await get('/api/reports/nope')).status).toBe(404);
    expect((await get('/api/reports/RENT-PAID')).status).toBe(404);
  });

  it.each(['agent', 'broker', 'owner', 'client'] as Role[])('%s -> 403 on reports', async role => {
    expect((await get('/api/reports/lead-funnel', role)).status).toBe(403);
  });

  it('leases-ending only includes leases ending within 90 days from today (inclusive)', async () => {
    const res = (await get('/api/reports/leases-ending')).body;
    const idx = res.columns.findIndex((c: string) => /lease end/i.test(c));
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    res.rows.forEach((r: any[]) => { expect(r[idx] >= today).toBe(true); expect(r[idx] <= limit).toBe(true); });
    const expected = seed.tenants.filter((t: any) => t.status !== 'Ended' && t.leaseEnd >= today && t.leaseEnd <= limit).length;
    expect(res.rows).toHaveLength(expected);
  });

  it('lead-funnel covers every lead status and sums to total leads', async () => {
    const res = (await get('/api/reports/lead-funnel')).body;
    expect(res.rows.map((r: any[]) => r[0])).toEqual(LEAD_STATUSES);
    expect(res.rows.reduce((a: number, r: any[]) => a + r[1], 0)).toBe(seed.leads.length);
  });

  it('sold-units lists Sold and Closed Sale properties', async () => {
    const res = (await get('/api/reports/sold-units')).body;
    expect(res.rows).toHaveLength(seed.properties.filter((p: any) => ['Sold', 'Closed Sale'].includes(p.status)).length);
  });

  it('vacant-sale excludes pending/rejected properties', async () => {
    const res = (await get('/api/reports/vacant-sale')).body;
    const codes = new Set(res.rows.map((r: any[]) => r[0]));
    seed.properties.filter((p: any) => p.approval !== 'approved').forEach((p: any) => expect(codes.has(p.code)).toBe(false));
  });

  it('rent-paid rows only for rent invoices with payments', async () => {
    const res = (await get('/api/reports/rent-paid')).body;
    expect(res.rows).toHaveLength(seed.invoices.filter((i: any) => i.kind === 'rent' && i.payments.length).length);
  });
});
