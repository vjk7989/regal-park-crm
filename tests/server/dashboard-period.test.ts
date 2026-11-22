import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, loginAll, ownPropertyIds, seed, startServer, type Role, type Server } from './helpers';

let s: Server;
let tok: Record<Role, string>;
beforeAll(async () => { s = await startServer(); tok = await loginAll(s.app); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const get = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'get', url);
const dash = async (period?: string, role: Role = 'admin') => {
  const res = await get(period === undefined ? '/api/dashboard' : `/api/dashboard?period=${period}`, role);
  expect(res.status).toBe(200);
  return res.body;
};
const sumValues = (xs: any[]) => xs.reduce((a, x) => a + x.value, 0);
const leadTotal = (d: any) => sumValues(d.leadsBySource);
const requestTotal = (d: any) => sumValues(d.requestsByListingType);
const PERIODS = ['all', 'month', '3m', 'year'];
const PROPERTY_KEYS = ['propertyByStatus', 'topCities', 'forSale', 'sold', 'selling', 'forLease', 'rented', 'available'];
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

/** Structural signature: keys + type of each value (array items reduced to their key set). */
const shapeOf = (d: any) => Object.fromEntries(Object.keys(d).sort().map(k => [k, Array.isArray(d[k]) ? 'array' : typeof d[k]]));

describe('GET /dashboard?period=', () => {
  it('every period returns the same keys and value types as no period', async () => {
    const base = shapeOf(await dash());
    for (const p of PERIODS) expect(shapeOf(await dash(p)), p).toEqual(base);
  });

  it('every period keeps [{name,value}] aggregate items', async () => {
    for (const p of PERIODS) {
      const d = await dash(p);
      for (const k of ['propertyByStatus', 'buyByStatus', 'rentByStatus', 'requestsByListingType', 'topCities', 'leadsByStatus', 'leadsBySource']) {
        d[k].forEach((x: any) => expect(Object.keys(x).sort(), `${p}:${k}`).toEqual(['name', 'value']));
      }
    }
  });

  it('period=all equals no period (whole seed)', async () => {
    const all = await dash('all');
    expect(all).toEqual(await dash());
    expect(leadTotal(all)).toBe(seed.leads.length);
    expect(requestTotal(all)).toBe(seed.requests.length);
  });

  it('lead and request totals are monotone: month <= 3m <= all and month <= year <= all', async () => {
    const [m, q, y, a] = await Promise.all(['month', '3m', 'year', 'all'].map(p => dash(p)));
    expect(leadTotal(m)).toBeLessThanOrEqual(leadTotal(q));
    expect(leadTotal(q)).toBeLessThanOrEqual(leadTotal(a));
    expect(leadTotal(m)).toBeLessThanOrEqual(leadTotal(y));
    expect(leadTotal(y)).toBeLessThanOrEqual(leadTotal(a));
    expect(requestTotal(m)).toBeLessThanOrEqual(requestTotal(q));
    expect(requestTotal(q)).toBeLessThanOrEqual(requestTotal(a));
    expect(requestTotal(y)).toBeLessThanOrEqual(requestTotal(a));
    expect(m.saleIncome + m.rentalIncome).toBeLessThanOrEqual(a.saleIncome + a.rentalIncome);
  });

  it('month lead total matches seed leads created since the 1st of this month (UTC)', async () => {
    const from = monthStart();
    const expected = seed.leads.filter((l: any) => l.createdAt.slice(0, 10) >= from).length;
    expect(leadTotal(await dash('month'))).toBe(expected);
    const reqExpected = seed.requests.filter((r: any) => r.createdAt.slice(0, 10) >= from).length;
    expect(requestTotal(await dash('month'))).toBe(reqExpected);
  });

  it('property counts are identical across periods', async () => {
    const all = await dash('all');
    for (const p of ['month', '3m', 'year']) {
      const d = await dash(p);
      for (const k of PROPERTY_KEYS) expect(d[k], `${p}:${k}`).toEqual(all[k]);
    }
  });

  it.each([
    ['unknown value', '/api/dashboard?period=decade'],
    ['empty value', '/api/dashboard?period='],
    ['array value', '/api/dashboard?period=month&period=year'],
    ['wrong case', '/api/dashboard?period=MONTH'],
  ])('%s falls back to all', async (_l, url) => {
    const all = await dash();
    const res = await get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(all);
  });

  it('a lead created now appears in month, 3m, year and all', async () => {
    const before = await Promise.all(PERIODS.map(p => dash(p)));
    const r = await call(s.app, tok.admin, 'post', '/api/leads', { name: 'Period Lead', phone: '9876543210' });
    expect(r.status).toBe(201);
    const after = await Promise.all(PERIODS.map(p => dash(p)));
    PERIODS.forEach((p, i) => expect(leadTotal(after[i]), p).toBe(leadTotal(before[i]) + 1));
    expect(after[1].recentLeads[0].name).toBe('Period Lead');
  });

  it('a payment dated today raises month income; an old-dated payment raises only all', async () => {
    const inv = seed.invoices.find((i: any) => i.kind === 'rent' && i.status !== 'Paid' && i.status !== 'Cancelled'
      && i.amount - i.payments.reduce((a: number, p: any) => a + p.amount, 0) >= 2000);
    expect(inv, 'seed has an open rent invoice').toBeTruthy();
    const m0 = (await dash('month')).rentalIncome, a0 = (await dash('all')).rentalIncome;

    const p1 = await call(s.app, tok.admin, 'post', `/api/invoices/${inv.id}/payments`, { amount: 1000, mode: 'UPI', date: today() });
    expect(p1.status).toBe(200);
    expect((await dash('month')).rentalIncome).toBe(m0 + 1000);
    expect((await dash('all')).rentalIncome).toBe(a0 + 1000);

    const p2 = await call(s.app, tok.admin, 'post', `/api/invoices/${inv.id}/payments`, { amount: 500, mode: 'UPI', date: '2020-01-15' });
    expect(p2.status).toBe(200);
    expect((await dash('month')).rentalIncome).toBe(m0 + 1000);
    expect((await dash('all')).rentalIncome).toBe(a0 + 1500);
  });

  it('a payment dated the 1st of this month counts in month (inclusive boundary)', async () => {
    const inv = seed.invoices.find((i: any) => i.kind === 'buy' && i.status !== 'Paid' && i.status !== 'Cancelled'
      && i.amount - i.payments.reduce((a: number, p: any) => a + p.amount, 0) >= 100)
      ?? seed.invoices.find((i: any) => i.status !== 'Paid' && i.status !== 'Cancelled');
    const key = inv.kind === 'buy' ? 'saleIncome' : 'rentalIncome';
    const m0 = (await dash('month'))[key];
    await call(s.app, tok.admin, 'post', `/api/invoices/${inv.id}/payments`, { amount: 1, mode: 'Cash', date: monthStart() });
    expect((await dash('month'))[key]).toBe(m0 + 1);
  });

  it('a payment dated the last day of the previous month is excluded from month', async () => {
    const inv = seed.invoices.find((i: any) => i.kind === 'rent' && i.status !== 'Paid' && i.status !== 'Cancelled');
    const d = new Date(); d.setUTCDate(0); // last day of previous month
    const m0 = (await dash('month')).rentalIncome, a0 = (await dash('all')).rentalIncome;
    await call(s.app, tok.admin, 'post', `/api/invoices/${inv.id}/payments`, { amount: 1, mode: 'Cash', date: d.toISOString().slice(0, 10) });
    expect((await dash('month')).rentalIncome).toBe(m0);
    expect((await dash('all')).rentalIncome).toBe(a0 + 1);
  });

  it('agent dashboard stays scoped for every period', async () => {
    const own = ownPropertyIds('agent');
    const all = await dash('all', 'agent');
    const adminAll = await dash('all');
    for (const p of PERIODS) {
      const d = await dash(p, 'agent');
      expect(sumValues(d.propertyByStatus), p).toBe(own.size);
      expect(leadTotal(d), p).toBeLessThanOrEqual(leadTotal(all));
    }
    expect(leadTotal(all)).toBeLessThanOrEqual(leadTotal(adminAll));
    expect(sumValues(all.propertyByStatus)).toBeLessThan(sumValues(adminAll.propertyByStatus));
  });

  it('unauthenticated request with a period is still 401', async () => {
    const res = await call(s.app, null, 'get', '/api/dashboard?period=month');
    expect(res.status).toBe(401);
  });
});
