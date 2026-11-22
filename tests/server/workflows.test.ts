import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, loginAll, readDbFile, seed, seedUser, startServer, type Role, type Server } from './helpers';

let s: Server;
let tok: Record<Role, string>;
beforeAll(async () => { s = await startServer(); tok = await loginAll(s.app); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const post = (url: string, body: unknown = {}, role: Role = 'admin') => call(s.app, tok[role], 'post', url, body);
const get = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'get', url);
const paid = (inv: any) => inv.payments.reduce((a: number, p: any) => a + p.amount, 0);

const vacantRent = () => seed.properties.find((p: any) => p.transactionType === 'Rent' && p.approval === 'approved' && p.status === 'Active');
const vacantSale = () => seed.properties.find((p: any) => p.transactionType === 'Sale' && p.approval === 'approved' && p.status === 'Active');

async function newRequest(kind: 'buy' | 'rent', extra: Record<string, unknown> = {}) {
  const prop = kind === 'rent' ? vacantRent() : vacantSale();
  const res = await post('/api/requests', { kind, propertyId: prop.id, clientId: seed.clients[2].id, ...extra }, 'staff');
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { req: res.body, prop };
}

describe('property approve / reject', () => {
  it('approve sets approval approved and status Active; client can now see it', async () => {
    const p = seed.properties.find((x: any) => x.approval === 'pending' && x.status === 'Pending');
    const res = await post(`/api/properties/${p.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.approval).toBe('approved');
    expect(res.body.status).toBe('Active');
    if (p.listingPrivacy === 'public') expect((await get(`/api/properties/${p.id}`, 'client')).status).toBe(200);
  });

  it('double approve is idempotent (200, still approved + Active)', async () => {
    const p = seed.properties.find((x: any) => x.approval === 'pending');
    await post(`/api/properties/${p.id}/approve`);
    const again = await post(`/api/properties/${p.id}/approve`);
    expect(again.status).toBe(200);
    expect(again.body.approval).toBe('approved');
    expect(again.body.status).toBe('Active');
  });

  it('approving a newly created pending property sets Active', async () => {
    const created = await post('/api/properties', { name: 'Agent new', price: 1, transactionType: 'Sale' }, 'agent');
    const res = await post(`/api/properties/${created.body.id}/approve`);
    expect(res.body.status).toBe('Active');
  });

  it('reject requires reason (400 field reason), then stores rejectReason', async () => {
    const p = seed.properties.find((x: any) => x.approval === 'pending');
    for (const body of [{}, { reason: '' }, { reason: '  ' }]) {
      const r = await post(`/api/properties/${p.id}/reject`, body);
      expect(r.status).toBe(400);
      expect(r.body.field).toBe('reason');
    }
    const ok = await post(`/api/properties/${p.id}/reject`, { reason: 'Khata missing' });
    expect(ok.status).toBe(200);
    expect(ok.body.approval).toBe('rejected');
    expect(ok.body.rejectReason).toBe('Khata missing');
  });

  it('approve after reject clears rejectReason', async () => {
    const p = seed.properties.find((x: any) => x.approval === 'rejected');
    const res = await post(`/api/properties/${p.id}/approve`);
    expect(res.body.approval).toBe('approved');
    expect(res.body.rejectReason).toBeUndefined();
  });

  it('approve / reject unknown property -> 404', async () => {
    expect((await post('/api/properties/nope/approve')).status).toBe(404);
    expect((await post('/api/properties/nope/reject', { reason: 'x' })).status).toBe(404);
  });
});

describe('request status', () => {
  it('invalid / missing status -> 400 field status', async () => {
    const r = seed.requests.find((x: any) => x.status === 'Submitted');
    for (const body of [{ status: 'Done' }, { status: 'approved' }, {}, { status: null }]) {
      const res = await post(`/api/requests/${r.id}/status`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.field).toBe('status');
    }
    expect((await get(`/api/requests/${r.id}`)).body.status).toBe('Submitted');
  });

  it('every valid RequestStatus is accepted', async () => {
    const r = seed.requests.find((x: any) => x.kind === 'buy' && x.status === 'Submitted');
    for (const st of ['Draft', 'Submitted', 'Sent', 'Waiting for approval', 'Approved', 'Cancelled', 'Expired']) {
      const res = await post(`/api/requests/${r.id}/status`, { status: st });
      expect(res.status, st).toBe(200);
      expect(res.body.status).toBe(st);
    }
  });

  it('unknown request -> 404; view-only roles -> 403', async () => {
    expect((await post('/api/requests/nope/status', { status: 'Approved' })).status).toBe(404);
    const agentOwn = (await get('/api/requests', 'agent')).body[0];
    expect((await post(`/api/requests/${agentOwn.id}/status`, { status: 'Approved' }, 'agent')).status).toBe(403);
    const clientOwn = (await get('/api/requests', 'client')).body[0];
    expect((await post(`/api/requests/${clientOwn.id}/status`, { status: 'Cancelled' }, 'client')).status).toBe(403);
  });

  it('rent approve creates exactly one Tenant (deposit = 2x monthly rent) and sets property Rented', async () => {
    const { req, prop } = await newRequest('rent', { termMonths: 11 });
    const res = await post(`/api/requests/${req.id}/status`, { status: 'Approved' });
    expect(res.status).toBe(200);
    const tenants = (await get('/api/tenants')).body.filter((t: any) => t.requestId === req.id);
    expect(tenants).toHaveLength(1);
    const t = tenants[0];
    const monthly = Math.round(req.contractAmount / req.termMonths);
    expect(t.monthlyRent).toBe(monthly);
    expect(t.deposit).toBe(monthly * 2);
    expect(t.clientId).toBe(req.clientId);
    expect(t.propertyId).toBe(prop.id);
    expect(t.referenceNo).toBe(seed.settings.prefixes.tenant + String(seed.settings.nextNumbers.tenant).padStart(4, '0'));
    expect((await get(`/api/properties/${prop.id}`)).body.status).toBe('Rented');
  });

  it('double approve of a rent request still yields exactly one Tenant', async () => {
    const { req } = await newRequest('rent');
    await post(`/api/requests/${req.id}/status`, { status: 'Approved' });
    await post(`/api/requests/${req.id}/status`, { status: 'Waiting for approval' });
    await post(`/api/requests/${req.id}/status`, { status: 'Approved' });
    const tenants = (await get('/api/tenants')).body;
    expect(tenants.filter((t: any) => t.requestId === req.id)).toHaveLength(1);
    expect(tenants).toHaveLength(seed.tenants.length + 1);
  });

  it('re-approving a seeded approved rent request with a tenant adds no tenant', async () => {
    const r = seed.requests.find((x: any) => x.kind === 'rent' && x.status === 'Approved' && seed.tenants.some((t: any) => t.requestId === x.id));
    await post(`/api/requests/${r.id}/status`, { status: 'Approved' });
    expect((await get('/api/tenants')).body).toHaveLength(seed.tenants.length);
  });

  it('buy approve does not create a tenant; buy Complete sets property Sold', async () => {
    const { req, prop } = await newRequest('buy');
    await post(`/api/requests/${req.id}/status`, { status: 'Approved' });
    expect((await get('/api/tenants')).body).toHaveLength(seed.tenants.length);
    const res = await post(`/api/requests/${req.id}/status`, { status: 'Complete' });
    expect(res.status).toBe(200);
    expect((await get(`/api/properties/${prop.id}`)).body.status).toBe('Sold');
  });

  it('rent Complete does not mark property Sold', async () => {
    const { req, prop } = await newRequest('rent');
    await post(`/api/requests/${req.id}/status`, { status: 'Complete' });
    expect((await get(`/api/properties/${prop.id}`)).body.status).not.toBe('Sold');
  });

  it('cancelled rent request moved to Approved: either rejected (400) or consistent (one tenant)', async () => {
    const { req } = await newRequest('rent');
    await post(`/api/requests/${req.id}/status`, { status: 'Cancelled' });
    const res = await post(`/api/requests/${req.id}/status`, { status: 'Approved' });
    const tenants = (await get('/api/tenants')).body.filter((t: any) => t.requestId === req.id);
    if (res.status === 400) expect(tenants).toHaveLength(0);
    else { expect(res.status).toBe(200); expect(tenants).toHaveLength(1); }
  });

  it('status change is persisted to db.json', async () => {
    const r = seed.requests.find((x: any) => x.status === 'Submitted');
    await post(`/api/requests/${r.id}/status`, { status: 'Sent' });
    expect(readDbFile(s.dir).requests.find((x: any) => x.id === r.id).status).toBe('Sent');
  });
});

describe('contracts', () => {
  it('contract is created once; second call returns the same contract and links contractId', async () => {
    const { req } = await newRequest('buy');
    const c1 = await post(`/api/requests/${req.id}/contract`);
    expect(c1.status).toBeLessThan(300);
    expect(c1.body.requestId).toBe(req.id);
    expect(c1.body.amount).toBe(req.contractAmount);
    expect(c1.body.signed).toBe(false);
    expect(c1.body.number).toBe(seed.settings.prefixes.contract + String(seed.settings.nextNumbers.contract).padStart(4, '0'));
    const c2 = await post(`/api/requests/${req.id}/contract`);
    expect(c2.body.id).toBe(c1.body.id);
    expect((await get('/api/contracts')).body).toHaveLength(seed.contracts.length + 1);
    expect((await get(`/api/requests/${req.id}`)).body.contractId).toBe(c1.body.id);
  });

  it('seeded request with contract returns the existing one', async () => {
    const r = seed.requests.find((x: any) => x.contractId);
    const res = await post(`/api/requests/${r.id}/contract`);
    expect(res.body.id).toBe(r.contractId);
    expect((await get('/api/contracts')).body).toHaveLength(seed.contracts.length);
  });

  it('broker (contracts view only) cannot generate a contract; client cannot either', async () => {
    const own = (await get('/api/requests', 'broker')).body[0];
    expect((await post(`/api/requests/${own.id}/contract`, {}, 'broker')).status).toBe(403);
    const mine = (await get('/api/requests', 'client')).body[0];
    expect((await post(`/api/requests/${mine.id}/contract`, {}, 'client')).status).toBe(403);
  });

  it('sign marks signed with signedAt; idempotent; view-only roles 403', async () => {
    const c = seed.contracts.find((x: any) => !x.signed) ?? seed.contracts[0];
    const r1 = await post(`/api/contracts/${c.id}/sign`);
    expect(r1.status).toBe(200);
    expect(r1.body.signed).toBe(true);
    expect(r1.body.signedAt).toBeTruthy();
    const r2 = await post(`/api/contracts/${c.id}/sign`);
    expect(r2.body.signedAt).toBe(r1.body.signedAt);
    expect((await post('/api/contracts/nope/sign')).status).toBe(404);
    const ownerContract = (await get('/api/contracts', 'owner')).body[0];
    expect((await post(`/api/contracts/${ownerContract.id}/sign`, {}, 'owner')).status).toBe(403);
  });
});

describe('invoices & payments', () => {
  it('buy invoice amount = reservationAmount or 10% of contractAmount; links invoiceId', async () => {
    const { req, prop } = await newRequest('buy');
    const res = await post(`/api/requests/${req.id}/invoice`);
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(prop.reservationAmount || Math.round(req.contractAmount * 0.1));
    expect(res.body.status).toBe('Unpaid');
    expect(res.body.payments).toEqual([]);
    expect(res.body.number).toBe(seed.settings.prefixes.invoice + String(seed.settings.nextNumbers.invoice).padStart(4, '0'));
    expect((await get(`/api/requests/${req.id}`)).body.invoiceId).toBe(res.body.id);
  });

  it('rent invoice amount = round(contractAmount / termMonths)', async () => {
    const { req } = await newRequest('rent', { termMonths: 7, contractAmount: 100000 });
    const res = await post(`/api/requests/${req.id}/invoice`);
    expect(res.body.amount).toBe(Math.round(100000 / 7));
  });

  async function freshInvoice() {
    const { req } = await newRequest('rent', { termMonths: 10, contractAmount: 100000 });
    return (await post(`/api/requests/${req.id}/invoice`)).body; // amount 10000
  }
  const pay = (id: string, body: unknown, role: Role = 'admin') => post(`/api/invoices/${id}/payments`, body, role);

  it('amount 0, negative, non-numeric, missing -> 400 field amount', async () => {
    const inv = await freshInvoice();
    for (const amount of [0, -1, -0.5, 'abc', undefined, null]) {
      const res = await pay(inv.id, { amount, mode: 'UPI', date: '2026-11-01' });
      expect(res.status, String(amount)).toBe(400);
      expect(res.body.field).toBe('amount');
    }
    expect((await get(`/api/invoices/${inv.id}`)).body.payments).toHaveLength(0);
  });

  it('over balance -> 400; partial -> Partially Paid; exactly balance -> Paid; then any payment -> 400', async () => {
    const inv = await freshInvoice();
    const over = await pay(inv.id, { amount: inv.amount + 1, mode: 'UPI' });
    expect(over.status).toBe(400);
    expect(over.body.field).toBe('amount');

    const p1 = await pay(inv.id, { amount: 4000, mode: 'NEFT', ref: 'N1', date: '2026-11-02' });
    expect(p1.status).toBe(200);
    expect(p1.body.status).toBe('Partially Paid');
    expect(p1.body.payments).toHaveLength(1);

    const over2 = await pay(inv.id, { amount: inv.amount - 4000 + 1, mode: 'UPI' });
    expect(over2.status).toBe(400);

    const p2 = await pay(inv.id, { amount: inv.amount - 4000, mode: 'RTGS', ref: 'R1' });
    expect(p2.status).toBe(200);
    expect(p2.body.status).toBe('Paid');
    expect(paid(p2.body)).toBe(inv.amount);

    const p3 = await pay(inv.id, { amount: 1, mode: 'UPI' });
    expect(p3.status).toBe(400);
    expect(readDbFile(s.dir).invoices.find((i: any) => i.id === inv.id).status).toBe('Paid');
  });

  it('single payment of exactly the full amount -> Paid', async () => {
    const inv = await freshInvoice();
    const res = await pay(inv.id, { amount: inv.amount, mode: 'UPI' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Paid');
  });

  it('payment on a seeded Paid invoice -> 400', async () => {
    const inv = seed.invoices.find((i: any) => i.status === 'Paid');
    expect((await pay(inv.id, { amount: 1, mode: 'UPI' })).status).toBe(400);
  });

  it('seeded Overdue invoice paid in part becomes Partially Paid', async () => {
    const inv = seed.invoices.find((i: any) => i.status === 'Overdue');
    const res = await pay(inv.id, { amount: 1, mode: 'Cash' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Partially Paid');
  });

  it('invalid payment mode -> 400', async () => {
    const inv = await freshInvoice();
    expect((await pay(inv.id, { amount: 10, mode: 'Bitcoin' })).status).toBe(400);
  });

  it('unknown invoice -> 404; view-only roles (client, owner, broker) -> 403', async () => {
    expect((await pay('nope', { amount: 1, mode: 'UPI' })).status).toBe(404);
    const mine = seed.invoices.find((i: any) => i.clientId === seedUser('client').linkedId && i.status !== 'Paid')
      ?? seed.invoices.find((i: any) => i.clientId === seedUser('client').linkedId);
    expect((await pay(mine.id, { amount: 1, mode: 'UPI' }, 'client')).status).toBe(403);
    const ownerInv = (await get('/api/invoices', 'owner')).body[0];
    expect((await pay(ownerInv.id, { amount: 1, mode: 'UPI' }, 'owner')).status).toBe(403);
  });

  it('staff (invoices edit) can record a payment', async () => {
    const inv = await freshInvoice();
    expect((await pay(inv.id, { amount: 10, mode: 'UPI' }, 'staff')).status).toBe(200);
  });
});
