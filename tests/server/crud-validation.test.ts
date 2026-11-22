import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { call, loginAll, readDbFile, REPO_DATA, seed, startServer, type Role, type Server } from './helpers';

let s: Server;
let tok: Record<Role, string>;
beforeAll(async () => { s = await startServer(); tok = await loginAll(s.app); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const post = (url: string, body: unknown, role: Role = 'admin') => call(s.app, tok[role], 'post', url, body);
const put = (url: string, body: unknown, role: Role = 'admin') => call(s.app, tok[role], 'put', url, body);
const get = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'get', url);
const pad = (n: number) => String(n).padStart(4, '0');

describe('unknown collection / id', () => {
  it('unknown collection -> 404 for GET list, GET id, POST, PUT, DELETE', async () => {
    expect((await get('/api/widgets')).status).toBe(404);
    expect((await get('/api/widgets/x')).status).toBe(404);
    expect((await post('/api/widgets', { name: 'x' })).status).toBe(404);
    expect((await put('/api/widgets/x', { name: 'x' })).status).toBe(404);
    expect((await call(s.app, tok.admin, 'delete', '/api/widgets/x')).status).toBe(404);
  });

  it.each(['owners', 'staff', 'agents', 'brokers', 'clients', 'properties', 'leads', 'requests', 'tenants', 'contracts', 'invoices', 'plans', 'users'])(
    'unknown id in %s -> 404 for GET, PUT, DELETE', async col => {
      expect((await get(`/api/${col}/nope-123`)).status).toBe(404);
      expect((await put(`/api/${col}/nope-123`, { notes: 'x' })).status).toBe(404);
      expect((await call(s.app, tok.admin, 'delete', `/api/${col}/nope-123`)).status).toBe(404);
    });

  it('admin GET list of each collection returns the seed count', async () => {
    for (const col of ['owners', 'staff', 'agents', 'brokers', 'clients', 'properties', 'leads', 'requests', 'tenants', 'contracts', 'invoices', 'plans', 'users']) {
      const res = await get(`/api/${col}`);
      expect(res.status, col).toBe(200);
      expect(res.body.length, col).toBe(seed[col].length);
    }
  });

  it('?kind filter on requests', async () => {
    const buy = await get('/api/requests?kind=buy');
    const rent = await get('/api/requests?kind=rent');
    expect(buy.body.length).toBe(seed.requests.filter((r: any) => r.kind === 'buy').length);
    expect(rent.body.length).toBe(seed.requests.filter((r: any) => r.kind === 'rent').length);
  });

  it('invalid JSON body -> 400', async () => {
    const res = await request(s.app).post('/api/owners').set('Authorization', `Bearer ${tok.admin}`).set('Content-Type', 'application/json').send('{"name":');
    expect(res.status).toBe(400);
  });
});

describe('required fields -> 400 {error, field}', () => {
  it.each(['owners', 'staff', 'agents', 'brokers', 'clients', 'plans', 'users'])('%s requires name (missing, empty, blank)', async col => {
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: null }]) {
      const res = await post(`/api/${col}`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.field).toBe('name');
      expect(typeof res.body.error).toBe('string');
    }
  });

  it('properties require name, transactionType, price', async () => {
    const base = { name: 'P', price: 100, transactionType: 'Sale' };
    for (const f of ['name', 'transactionType', 'price']) {
      const b: any = { ...base }; delete b[f];
      const res = await post('/api/properties', b);
      expect(res.status, f).toBe(400);
      expect(res.body.field).toBe(f);
    }
  });

  it('property price: negative / non-numeric -> 400; 0 is accepted (boundary)', async () => {
    for (const price of [-1, -0.01, 'abc', '']) {
      const res = await post('/api/properties', { name: 'P', price, transactionType: 'Sale' });
      expect(res.status, String(price)).toBe(400);
      expect(res.body.field).toBe('price');
    }
    const zero = await post('/api/properties', { name: 'Free', price: 0, transactionType: 'Sale' });
    expect(zero.status).toBe(201);
    expect(zero.body.price).toBe(0);
  });

  it('PUT property with negative price -> 400, record unchanged', async () => {
    const p = seed.properties[0];
    const res = await put(`/api/properties/${p.id}`, { price: -5 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('price');
    expect((await get(`/api/properties/${p.id}`)).body.price).toBe(p.price);
  });

  it('leads require name and phone', async () => {
    const r1 = await post('/api/leads', { phone: '9876543210' });
    expect(r1.status).toBe(400); expect(r1.body.field).toBe('name');
    const r2 = await post('/api/leads', { name: 'L' });
    expect(r2.status).toBe(400); expect(r2.body.field).toBe('phone');
  });

  it.each(['9876543210', '+91 98765 43210', '+919876543210', '6000000000'])('lead phone %s accepted', async phone => {
    const res = await post('/api/leads', { name: 'L', phone });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('New');
  });

  it.each(['5876543210', '987654321', '98765432101', 'abcdefghij', '+92 98765 43210'])('lead phone %s rejected 400 field phone', async phone => {
    const res = await post('/api/leads', { name: 'L', phone });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('phone');
  });

  it('PUT lead with invalid phone -> 400', async () => {
    const res = await put(`/api/leads/${seed.leads[0].id}`, { phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('phone');
  });

  it('PUT with blank required field -> 400', async () => {
    const res = await put(`/api/owners/${seed.owners[0].id}`, { name: '' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('name');
  });

  it('requests require propertyId, clientId, kind', async () => {
    const sale = seed.properties.find((p: any) => p.transactionType === 'Sale');
    const base = { propertyId: sale.id, clientId: seed.clients[0].id, kind: 'buy' };
    for (const f of ['propertyId', 'clientId', 'kind']) {
      const b: any = { ...base }; delete b[f];
      const res = await post('/api/requests', b);
      expect(res.status, f).toBe(400);
      expect(res.body.field).toBe(f);
    }
  });

  it('request with unknown property, unknown client, or invalid kind -> 400', async () => {
    const sale = seed.properties.find((p: any) => p.transactionType === 'Sale');
    const r1 = await post('/api/requests', { propertyId: 'nope', clientId: seed.clients[0].id, kind: 'buy' });
    expect(r1.status).toBe(400); expect(r1.body.field).toBe('propertyId');
    const r2 = await post('/api/requests', { propertyId: sale.id, clientId: 'nope', kind: 'buy' });
    expect(r2.status).toBe(400); expect(r2.body.field).toBe('clientId');
    const r3 = await post('/api/requests', { propertyId: sale.id, clientId: seed.clients[0].id, kind: 'lease' });
    expect(r3.status).toBe(400); expect(r3.body.field).toBe('kind');
  });
});

describe('codes and server-set fields', () => {
  it('property codes increment from nextNumbers and are unique after several creates', async () => {
    const { prefixes, nextNumbers } = seed.settings;
    const codes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await post('/api/properties', { name: `P${i}`, price: 1, transactionType: 'Sale' });
      expect(res.status).toBe(201);
      codes.push(res.body.code);
    }
    expect(codes).toEqual([0, 1, 2, 3].map(i => prefixes.property + pad(nextNumbers.property + i)));
    const all = (await get('/api/properties')).body.map((p: any) => p.code);
    expect(new Set(all).size).toBe(all.length);
    expect((await get('/api/settings')).body.nextNumbers.property).toBe(nextNumbers.property + 4);
  });

  it.each([['owners', 'owner'], ['agents', 'agent'], ['brokers', 'broker'], ['staff', 'staff'], ['clients', 'client']])(
    '%s code uses prefix + nextNumbers', async (col, key) => {
      const a = await post(`/api/${col}`, { name: 'A' });
      const b = await post(`/api/${col}`, { name: 'B' });
      expect(a.body.code).toBe(seed.settings.prefixes[key] + pad(seed.settings.nextNumbers[key]));
      expect(b.body.code).toBe(seed.settings.prefixes[key] + pad(seed.settings.nextNumbers[key] + 1));
      expect(a.body.id).not.toBe(b.body.id);
    });

  it('request numbers use buy/rent prefixes independently', async () => {
    const sale = seed.properties.find((p: any) => p.transactionType === 'Sale');
    const rent = seed.properties.find((p: any) => p.transactionType === 'Rent');
    const b1 = await post('/api/requests', { kind: 'buy', propertyId: sale.id, clientId: seed.clients[0].id });
    const r1 = await post('/api/requests', { kind: 'rent', propertyId: rent.id, clientId: seed.clients[0].id });
    const b2 = await post('/api/requests', { kind: 'buy', propertyId: sale.id, clientId: seed.clients[0].id });
    const { prefixes, nextNumbers } = seed.settings;
    expect(b1.body.number).toBe(prefixes.buy + pad(nextNumbers.buy));
    expect(b2.body.number).toBe(prefixes.buy + pad(nextNumbers.buy + 1));
    expect(r1.body.number).toBe(prefixes.rent + pad(nextNumbers.rent));
    expect(b1.body.status).toBe('Submitted');
    expect(b1.body).not.toHaveProperty('contractId');
  });

  it('id, createdAt, createdBy set by server and cannot be spoofed on create or PUT', async () => {
    const res = await post('/api/owners', { name: 'O', id: 'own-01', createdAt: '2000-01-01', createdBy: 'hacker' });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe('own-01');
    expect(res.body.createdBy).toBe(seed.users.find((u: any) => u.role === 'admin').id);
    expect(res.body.createdAt).not.toBe('2000-01-01');
    const upd = await put(`/api/owners/${res.body.id}`, { id: 'zzz', createdAt: '1999-01-01', createdBy: 'x' });
    expect(upd.body.id).toBe(res.body.id);
    expect(upd.body.createdAt).toBe(res.body.createdAt);
    expect(upd.body.createdBy).toBe(res.body.createdBy);
  });
});

describe('PUT / DELETE', () => {
  it('PUT merges: unspecified fields are kept', async () => {
    const o = seed.owners[1];
    const res = await put(`/api/owners/${o.id}`, { city: 'Mysuru' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...o, city: 'Mysuru' });
    expect((await get(`/api/owners/${o.id}`)).body).toMatchObject({ name: o.name, phone: o.phone, city: 'Mysuru' });
  });

  it('DELETE then GET -> 404, list shrinks by one, second DELETE -> 404', async () => {
    const c = seed.clients[5];
    expect((await call(s.app, tok.admin, 'delete', `/api/clients/${c.id}`)).status).toBe(200);
    expect((await get(`/api/clients/${c.id}`)).status).toBe(404);
    expect((await get('/api/clients')).body.length).toBe(seed.clients.length - 1);
    expect((await call(s.app, tok.admin, 'delete', `/api/clients/${c.id}`)).status).toBe(404);
  });
});

describe('property approval on create / edit', () => {
  it('admin-created property is approved with status New', async () => {
    const res = await post('/api/properties', { name: 'Admin P', price: 10, transactionType: 'Rent' });
    expect(res.body.approval).toBe('approved');
    expect(res.body.status).toBe('New');
  });

  it('staff-created property is pending when requirePropertyApproval', async () => {
    const res = await post('/api/properties', { name: 'Staff P', price: 10, transactionType: 'Sale' }, 'staff');
    expect(res.status).toBe(201);
    expect(res.body.approval).toBe('pending');
    expect(res.body.status).toBe('Pending');
  });

  it('non-admin cannot self-approve via body on create when approval is required', async () => {
    const res = await post('/api/properties', { name: 'Sneaky', price: 10, transactionType: 'Sale', approval: 'approved' }, 'agent');
    expect(res.body.approval).toBe('pending');
  });

  it('requirePropertyApproval=false -> agent-created property is not pending', async () => {
    await put('/api/settings', { requirePropertyApproval: false });
    const res = await post('/api/properties', { name: 'No approval', price: 10, transactionType: 'Sale' }, 'agent');
    expect(res.status).toBe(201);
    expect(res.body.approval).not.toBe('pending');
    expect(res.body.status).not.toBe('Pending');
  });

  it('non-admin PUT cannot change approval (agent on own, staff on any)', async () => {
    const created = await post('/api/properties', { name: 'Mine', price: 10, transactionType: 'Sale' }, 'agent');
    const r1 = await put(`/api/properties/${created.body.id}`, { approval: 'approved', name: 'Mine 2' }, 'agent');
    expect(r1.status).toBe(200);
    expect(r1.body.approval).toBe('pending');
    expect(r1.body.name).toBe('Mine 2');
    const r2 = await put(`/api/properties/${created.body.id}`, { approval: 'approved' }, 'staff');
    expect(r2.body.approval).toBe('pending');
    const r3 = await put(`/api/properties/${created.body.id}`, { approval: 'approved' }, 'admin');
    expect(r3.body.approval).toBe('approved');
  });
});

describe('invoice created via generic POST', () => {
  it('admin POST /invoices without payments does not break GET /dashboard or payments', async () => {
    const res = await post('/api/invoices', { clientId: seed.clients[0].id, propertyId: seed.properties[0].id, kind: 'buy', amount: 1000 });
    expect(res.status).toBe(201);
    expect((await get('/api/dashboard')).status).toBe(200);
    expect((await call(s.app, tok.admin, 'post', `/api/invoices/${res.body.id}/payments`, { amount: 100, mode: 'UPI' })).status).toBe(200);
  });
});

describe('admin reset & persistence', () => {
  it('POST /admin/reset restores counts and nextNumbers', async () => {
    await call(s.app, tok.admin, 'delete', `/api/leads/${seed.leads[0].id}`);
    await post('/api/owners', { name: 'Extra' });
    expect((await get('/api/leads')).body.length).toBe(seed.leads.length - 1);
    const res = await post('/api/admin/reset', {});
    expect(res.status).toBe(200);
    expect((await get('/api/leads')).body.length).toBe(seed.leads.length);
    expect((await get('/api/owners')).body.length).toBe(seed.owners.length);
    expect((await get('/api/settings')).body.nextNumbers).toEqual(seed.settings.nextNumbers);
    // sessions survive reset
    expect((await get('/api/auth/me', 'staff')).status).toBe(200);
  });

  it('after a write, db.json in DATA_DIR contains the change; repo data/db.json is untouched', async () => {
    const repoDb = path.join(REPO_DATA, 'db.json');
    const before = fs.existsSync(repoDb) ? fs.statSync(repoDb).mtimeMs : null;
    const res = await post('/api/owners', { name: 'Persisted Owner XYZ' });
    const disk = readDbFile(s.dir);
    expect(disk.owners.some((o: any) => o.id === res.body.id && o.name === 'Persisted Owner XYZ')).toBe(true);
    await put(`/api/owners/${res.body.id}`, { city: 'Hubli' });
    expect(readDbFile(s.dir).owners.find((o: any) => o.id === res.body.id).city).toBe('Hubli');
    await call(s.app, tok.admin, 'delete', `/api/owners/${res.body.id}`);
    expect(readDbFile(s.dir).owners.some((o: any) => o.id === res.body.id)).toBe(false);
    expect(fs.existsSync(path.join(s.dir, 'db.json.tmp'))).toBe(false);
    if (before !== null) expect(fs.statSync(repoDb).mtimeMs).toBe(before);
  });

  it('settings change is persisted', async () => {
    await put('/api/settings', { tagline: 'Persist me' });
    expect(readDbFile(s.dir).settings.tagline).toBe('Persist me');
  });

  it('DATA_DIR without seed.json falls back to repo data/seed.json and writes db.json only into DATA_DIR', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'regal-empty-'));
    const prev = process.env.DATA_DIR;
    try {
      process.env.DATA_DIR = empty;
      const db: any = s.reset();
      expect(db.properties.length).toBe(seed.properties.length);
      expect(fs.existsSync(path.join(empty, 'db.json'))).toBe(true);
      expect(fs.existsSync(path.join(empty, 'seed.json'))).toBe(false);
    } finally {
      process.env.DATA_DIR = prev;
      s.reset();
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('DATA_DIR seed.json is preferred over repo seed', async () => {
    const custom = structuredClone(seed);
    custom.owners = custom.owners.slice(0, 2);
    fs.writeFileSync(path.join(s.dir, 'seed.json'), JSON.stringify(custom));
    try {
      s.reset();
      expect((await get('/api/owners')).body.length).toBe(2);
    } finally {
      fs.copyFileSync(path.join(REPO_DATA, 'seed.json'), path.join(s.dir, 'seed.json'));
      s.reset();
    }
  });
});
