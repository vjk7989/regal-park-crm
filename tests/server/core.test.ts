import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest, type CoreRequest, type Store } from '../../server/core';
import { call, emailOf, login as expressLogin, PASSWORD, REPO_SEED, seed, seedUser, startServer, type Role, type Server } from './helpers';

// ---- in-memory Store (no fs) ----
const SEED_JSON = fs.readFileSync(REPO_SEED, 'utf8');
const clone = () => structuredClone(JSON.parse(SEED_JSON));

interface MemStore extends Store { saves: number; sessionMap: Map<string, string> }
function memStore(): MemStore {
  let db = clone();
  const sessionMap = new Map<string, string>();
  const s: MemStore = {
    saves: 0,
    sessionMap,
    db: () => db,
    save: () => { s.saves++; },
    reset: () => { db = clone(); return db; },
    sessions: sessionMap,
  };
  return s;
}

let st: MemStore;
const req = (method: string, p: string, opts: Partial<CoreRequest> = {}): CoreRequest => ({ method, path: p, query: {}, body: undefined, ...opts });
const run = (method: string, p: string, opts: Partial<CoreRequest> = {}) => handleRequest(st, req(method, p, opts));
function coreLogin(role: Role): string {
  const r = run('POST', '/auth/login', { body: { email: emailOf(role), password: PASSWORD } });
  if (r.status !== 200) throw new Error(`core login ${role}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}
const as = (role: Role, method: string, p: string, body?: unknown, query: CoreRequest['query'] = {}) =>
  run(method, p, { token: coreLogin(role), body, query });

beforeEach(() => { st = memStore(); });

/** Assert the result is a well-formed response and never an exception. */
function safe(r: () => unknown) {
  let out: any;
  expect(() => { out = r(); }).not.toThrow();
  expect(out).toBeTypeOf('object');
  expect(out).not.toBeNull();
  expect(typeof out.status).toBe('number');
  expect('body' in out).toBe(true);
  return out as { status: number; body: any };
}

describe('core auth', () => {
  it('login stores token -> userId in sessions; response has no password', () => {
    const r = run('POST', '/auth/login', { body: { email: emailOf('admin'), password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
    expect(st.sessionMap.get(r.body.token)).toBe(seedUser('admin').id);
    expect(r.body.user).not.toHaveProperty('password');
    expect(JSON.stringify(r.body)).not.toContain(`"password"`);
  });

  it('login is case-insensitive on email', () => {
    const r = run('POST', '/auth/login', { body: { email: emailOf('agent').toUpperCase(), password: PASSWORD } });
    expect(r.status).toBe(200);
  });

  it('bad / missing credentials -> 401 and no session created; login never saves', () => {
    for (const body of [{ email: emailOf('admin'), password: 'nope' }, {}, null, undefined, 'x', [], { email: null, password: null }]) {
      const r = safe(() => run('POST', '/auth/login', { body }));
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'Invalid credentials' });
    }
    expect(st.sessionMap.size).toBe(0);
    expect(st.saves).toBe(0);
  });

  it('broker login with portal disabled -> 403, no session', () => {
    st.db().settings.showBrokerPortal = false;
    const r = run('POST', '/auth/login', { body: { email: emailOf('broker'), password: PASSWORD } });
    expect(r.status).toBe(403);
    expect(st.sessionMap.size).toBe(0);
  });

  it('GET /auth/me with token 200 (no password), without 401, garbage 401', () => {
    const t = coreLogin('agent');
    const me = run('GET', '/auth/me', { token: t });
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(seedUser('agent').id);
    expect(me.body.user).not.toHaveProperty('password');
    expect(run('GET', '/auth/me').status).toBe(401);
    expect(run('GET', '/auth/me').body).toEqual({ error: 'Unauthorized' });
    for (const token of ['garbage', '', ' ', '__proto__', 'constructor', 'x'.repeat(100_000)]) {
      expect(run('GET', '/auth/me', { token }).status).toBe(401);
    }
  });

  it('session for a user later deactivated -> 401', () => {
    const t = coreLogin('staff');
    st.db().users.find((u: any) => u.id === seedUser('staff').id)!.active = false;
    expect(run('GET', '/auth/me', { token: t }).status).toBe(401);
  });

  it('logout removes the session; token then 401; other sessions unaffected', () => {
    const t = coreLogin('admin');
    const other = coreLogin('client');
    const r = run('POST', '/auth/logout', { token: t });
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(st.sessionMap.has(t)).toBe(false);
    expect(run('GET', '/auth/me', { token: t }).status).toBe(401);
    expect(run('GET', '/auth/me', { token: other }).status).toBe(200);
    expect(st.saves).toBe(0);
  });

  it('logout without token -> 401', () => {
    expect(run('POST', '/auth/logout').status).toBe(401);
  });
});

describe('core routing', () => {
  it('unknown route -> 404 {error:"Not found"} when authenticated, 401 when not', () => {
    const t = coreLogin('admin');
    expect(run('GET', '/nope/a/b', { token: t })).toEqual({ status: 404, body: { error: 'Not found' } });
    expect(run('GET', '/nope/a/b').status).toBe(401);
  });

  it('unknown collection -> 404 Unknown collection', () => {
    expect(as('admin', 'GET', '/widgets')).toEqual({ status: 404, body: { error: 'Unknown collection' } });
  });

  it('trailing slash and doubled slashes are tolerated', () => {
    const t = coreLogin('admin');
    const a = run('GET', '/properties', { token: t });
    expect(run('GET', '/properties/', { token: t })).toEqual(a);
    expect(run('GET', '//properties//', { token: t })).toEqual(a);
    expect(run('GET', '/auth/me/', { token: t }).status).toBe(200);
    expect(run('POST', '/auth/login/', { body: { email: emailOf('admin'), password: PASSWORD } }).status).toBe(200);
  });

  it('method is case-insensitive', () => {
    expect(as('admin', 'get', '/properties').status).toBe(200);
  });

  it('method mismatch (PATCH /properties, DELETE /properties, PUT /properties) -> 404 Not found', () => {
    for (const m of ['PATCH', 'DELETE', 'PUT', 'OPTIONS', '']) {
      const r = safe(() => as('admin', m, '/properties', {}));
      expect(r).toEqual({ status: 404, body: { error: 'Not found' } });
    }
    expect(st.saves).toBe(0);
  });

  it('HttpError with field maps to {error, field}; without field to {error}', () => {
    const r = as('admin', 'POST', '/leads', { name: 'X', phone: '123' });
    expect(r).toEqual({ status: 400, body: { error: 'phone must be a 10-digit Indian mobile number', field: 'phone' } });
    const f = as('client', 'POST', '/owners', { name: 'X' });
    expect(f).toEqual({ status: 403, body: { error: 'Forbidden' } });
  });
});

describe('handleRequest never throws on hostile input', () => {
  const lead = () => seed.leads[0].id;
  const inv = () => seed.invoices[0].id;
  const rq = () => seed.requests[0].id;

  it('hostile paths -> 4xx', () => {
    const t = coreLogin('admin');
    const cases: [string, string, number][] = [
      ['GET', '', 404], ['GET', '/', 404], ['GET', '//', 404], ['GET', '///', 404],
      ['GET', '/properties/../users', 404], ['GET', '/../users', 404],
      ['GET', '/constructor', 404], ['GET', '/__proto__', 404], ['GET', '/toString', 404], ['GET', '/hasOwnProperty', 404],
      ['POST', '/__proto__', 404], ['POST', '/constructor', 404],
      ['GET', '/properties/__proto__', 404], ['GET', '/properties/constructor', 404],
      ['PUT', '/properties/__proto__', 404], ['DELETE', '/properties/__proto__', 404],
      ['GET', '/constructor/prototype', 404], ['GET', '/__proto__/x', 404],
      ['POST', '/properties/__proto__/approve', 404], ['POST', '/requests/constructor/status', 404],
      ['GET', '/reports/constructor', 404], ['GET', '/reports/__proto__', 404], ['GET', '/reports/toString', 404],
      ['GET', '/properties/%E0%A4%A', 404], ['GET', '/properties/%', 404],
      ['GET', '/' + 'x'.repeat(1_000_000), 404], ['GET', '/properties/' + 'y'.repeat(1_000_000), 404],
      ['GET', '/a/b/c/d/e/f/g/h', 404],
    ];
    for (const [m, p, status] of cases) {
      const r = safe(() => run(m, p, { token: t }));
      expect(r.status, `${m} ${p.slice(0, 40)}`).toBe(status);
    }
    expect(st.saves).toBe(0);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('hostile bodies on mutating routes -> 4xx and no save', () => {
    const t = coreLogin('admin');
    const bodies: unknown[] = [null, undefined, 'string', '', [], [1, 2], 42, true];
    const routes: [string, string][] = [
      ['POST', '/leads'], ['POST', '/properties'], ['POST', '/requests'], ['POST', '/invoices'],
      ['PUT', '/permissions'], [`POST`, `/requests/${rq()}/status`], ['POST', `/invoices/${inv()}/payments`],
      ['POST', `/properties/${seed.properties[0].id}/reject`],
    ];
    for (const [m, p] of routes) for (const body of bodies) {
      const r = safe(() => run(m, p, { token: t, body }));
      expect(r.status, `${m} ${p} ${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
      expect(r.status, `${m} ${p} ${JSON.stringify(body)}`).toBeLessThan(500);
    }
    expect(st.saves).toBe(0);
  });

  it('non-object body (string/array) on PUT does not inject index keys into the record/settings', () => {
    const t = coreLogin('admin');
    for (const [p, get] of [['/settings', () => st.db().settings], [`/leads/${lead()}`, () => st.db().leads.find((l: any) => l.id === lead())]] as const) {
      for (const body of ['abc', ['x', 'y']]) {
        const r = safe(() => run('PUT', p, { token: t, body }));
        expect(r.status).toBeLessThan(500);
        expect(Object.keys(get() as object), `PUT ${p} ${JSON.stringify(body)}`).not.toContain('0');
      }
    }
  });

  it('prototype keys in JSON body do not pollute Object.prototype', () => {
    const t = coreLogin('admin');
    const evil = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
    safe(() => run('PUT', '/settings', { token: t, body: evil }));
    safe(() => run('PUT', `/leads/${lead()}`, { token: t, body: evil }));
    safe(() => run('POST', '/leads', { token: t, body: { ...evil, name: 'n', phone: '9876543210' } }));
    expect(({} as any).polluted).toBeUndefined();
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('query arrays / odd query values do not throw', () => {
    const t = coreLogin('admin');
    const qs: CoreRequest['query'][] = [
      { kind: ['buy', 'rent'] }, { kind: '__proto__' }, { kind: 'constructor' }, { kind: undefined }, { period: ['month', 'year'] }, { period: 'x'.repeat(100_000) },
    ];
    for (const query of qs) {
      for (const p of ['/requests', '/dashboard', '/properties']) {
        const r = safe(() => run('GET', p, { token: t, query }));
        expect(r.status).toBeLessThan(500);
      }
    }
  });

  it('huge strings in body are handled (no throw, < 500)', () => {
    const t = coreLogin('admin');
    const big = 'z'.repeat(1_000_000);
    expect(safe(() => run('POST', '/auth/login', { body: { email: big, password: big } })).status).toBe(401);
    expect(safe(() => run('POST', '/leads', { token: t, body: { name: 'n', phone: big } })).status).toBe(400);
  });

  it('a non-HttpError thrown by the store -> 500 {error:"Internal server error"}, no throw', () => {
    const t = coreLogin('admin');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    st.save = () => { throw new Error('disk full'); };
    const r = safe(() => run('POST', '/leads', { token: t, body: { name: 'n', phone: '9876543210' } }));
    expect(r).toEqual({ status: 500, body: { error: 'Internal server error' } });
    // db() throwing too
    const st2 = memStore();
    st2.db = () => { throw new TypeError('boom'); };
    const r2 = safe(() => handleRequest(st2, req('POST', '/auth/login', { body: { email: 'a', password: 'b' } })));
    expect(r2).toEqual({ status: 500, body: { error: 'Internal server error' } });
    // sessions throwing
    const st3 = memStore();
    st3.sessions = { get: () => { throw new Error('x'); }, set: () => {}, delete: () => {} };
    expect(safe(() => handleRequest(st3, req('GET', '/auth/me', { token: 'a' }))).status).toBe(500);
    // error leaks no detail
    expect(JSON.stringify(r)).not.toContain('disk full');
    err.mockRestore();
  });
});

describe('save() semantics', () => {
  it('called exactly once after each successful mutating request', () => {
    const t = coreLogin('admin');
    const mut = (m: string, p: string, body?: unknown) => {
      const before = st.saves;
      const r = run(m, p, { token: t, body });
      expect(r.status, `${m} ${p} ${JSON.stringify(r.body)}`).toBeLessThan(300);
      expect(st.saves - before, `${m} ${p}`).toBe(1);
      return r;
    };
    const created = mut('POST', '/leads', { name: 'n', phone: '9876543210' });
    mut('PUT', `/leads/${created.body.id}`, { notes: 'x' });
    mut('DELETE', `/leads/${created.body.id}`);
    mut('PUT', '/settings', { companyName: 'Y' });
    mut('PUT', '/permissions', st.db().permissions);
    const pend = seed.properties.find((p: any) => p.approval === 'pending');
    mut('POST', `/properties/${pend.id}/approve`);
    mut('POST', `/properties/${pend.id}/reject`, { reason: 'r' });
    const prop = seed.properties.find((p: any) => p.transactionType === 'Rent' && p.approval === 'approved' && p.status === 'Active');
    const rq = mut('POST', '/requests', { kind: 'rent', propertyId: prop.id, clientId: seed.clients[0].id });
    mut('POST', `/requests/${rq.body.id}/status`, { status: 'Approved' });
    const ct = mut('POST', `/requests/${rq.body.id}/contract`);
    mut('POST', `/contracts/${ct.body.id}/sign`);
    const inv = mut('POST', `/requests/${rq.body.id}/invoice`);
    mut('POST', `/invoices/${inv.body.id}/payments`, { amount: 1, mode: 'UPI' });
  });

  it('not called after GETs, auth calls, or failed mutations', () => {
    const t = coreLogin('admin');
    for (const p of ['/auth/me', '/dashboard', '/settings', '/permissions', '/properties', `/properties/${seed.properties[0].id}`, '/reports/lead-funnel', '/plans', '/users']) {
      expect(run('GET', p, { token: t }).status, p).toBe(200);
    }
    run('POST', '/leads', { token: t, body: { name: 'n', phone: 'bad' } });
    run('PUT', '/leads/missing', { token: t, body: {} });
    run('DELETE', '/leads/missing', { token: t });
    as('client', 'POST', '/owners', { name: 'x' });
    run('POST', '/auth/logout', { token: t });
    expect(st.saves).toBe(0);
  });

  it('GET responses never include passwords for users', () => {
    const r = as('admin', 'GET', '/users');
    expect(r.status).toBe(200);
    expect(r.body.every((u: any) => !('password' in u))).toBe(true);
    const one = as('admin', 'GET', `/users/${seed.users[0].id}`);
    expect(one.body).not.toHaveProperty('password');
  });
});

describe('db() identity and reset', () => {
  it('after POST /admin/reset subsequent requests see seed counts', () => {
    const t = coreLogin('admin');
    run('POST', '/leads', { token: t, body: { name: 'n', phone: '9876543210' } });
    run('DELETE', `/properties/${seed.properties[0].id}`, { token: t });
    expect(run('GET', '/leads', { token: t }).body).toHaveLength(seed.leads.length + 1);
    expect(run('POST', '/admin/reset', { token: t })).toEqual({ status: 200, body: { ok: true } });
    expect(run('GET', '/leads', { token: t }).body).toHaveLength(seed.leads.length);
    expect(run('GET', '/properties', { token: t }).body).toHaveLength(seed.properties.length);
  });

  it('after direct store.reset(), core reads the new db() (no cached reference)', () => {
    const t = coreLogin('admin');
    const old = st.db();
    run('POST', '/leads', { token: t, body: { name: 'n', phone: '9876543210' } });
    st.reset();
    expect(st.db()).not.toBe(old);
    expect(run('GET', '/leads', { token: t }).body).toHaveLength(seed.leads.length);
    expect(run('GET', '/settings', { token: t }).body).toEqual(seed.settings);
  });

  it('non-admin cannot reset -> 403, data untouched', () => {
    const t = coreLogin('staff');
    run('POST', '/leads', { token: t, body: { name: 'n', phone: '9876543210' } });
    expect(run('POST', '/admin/reset', { token: t }).status).toBe(403);
    expect(st.db().leads).toHaveLength(seed.leads.length + 1);
  });
});

describe('parity with Express adapter (createApp + supertest)', () => {
  let s: Server;
  const etok = {} as Record<Role, string>;
  beforeAll(async () => { s = await startServer(); });
  afterAll(() => s.cleanup());
  beforeEach(async () => { s.reset(); for (const r of ['admin', 'staff', 'agent', 'client'] as Role[]) etok[r] = await expressLogin(s.app, r); });

  const VOLATILE = new Set(['id', 'createdAt', 'signedAt', 'requestId', 'contractId', 'invoiceId', 'token']);
  const norm = (v: any): any => Array.isArray(v) ? v.map(norm)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, VOLATILE.has(k) && typeof x === 'string' ? '<v>' : norm(x)]))
    : v;
  type M = 'get' | 'post' | 'put' | 'delete';
  async function both(role: Role, m: M, p: string, body?: unknown, ctok?: string) {
    const e = await call(s.app, etok[role], m, '/api' + p, body);
    const [path_, qs] = p.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs ?? ''));
    const c = run(m.toUpperCase(), path_, { token: ctok ?? coreLogin(role), body, query });
    return { e: { status: e.status, body: e.body }, c };
  }
  const same = (x: { e: any; c: any }) => { expect(x.c.status).toBe(x.e.status); expect(norm(x.c.body)).toEqual(norm(x.e.body)); };

  it('list properties as agent', async () => {
    const x = await both('agent', 'get', '/properties');
    expect(x.e.status).toBe(200);
    same(x);
  });

  it('create lead with invalid phone', async () => {
    const x = await both('staff', 'post', '/leads', { name: 'Ravi', phone: '12345' });
    expect(x.e.status).toBe(400);
    same(x);
  });

  it('rent approve creates tenant exactly once', async () => {
    const prop = seed.properties.find((p: any) => p.transactionType === 'Rent' && p.approval === 'approved' && p.status === 'Active');
    const ct = coreLogin('staff');
    const created = await both('staff', 'post', '/requests', { kind: 'rent', propertyId: prop.id, clientId: seed.clients[2].id }, ct);
    expect(created.e.status).toBe(201);
    same(created);
    const eId = created.e.body.id, cId = created.c.body.id;
    for (let i = 0; i < 2; i++) {
      const e = await call(s.app, etok.staff, 'post', `/api/requests/${eId}/status`, { status: 'Approved' });
      const c = run('POST', `/requests/${cId}/status`, { token: ct, body: { status: 'Approved' } });
      same({ e: { status: e.status, body: e.body }, c });
    }
    const et = (await call(s.app, etok.admin, 'get', '/api/tenants')).body.filter((t: any) => t.requestId === eId);
    const ctn = st.db().tenants.filter((t: any) => t.requestId === cId);
    expect(et).toHaveLength(1);
    expect(ctn).toHaveLength(1);
    expect(norm(ctn)).toEqual(norm(et));
  });

  it('payment over balance', async () => {
    const inv = seed.invoices.find((i: any) => i.status === 'Unpaid' && i.amount > 0) ?? seed.invoices.find((i: any) => i.status !== 'Paid' && i.status !== 'Cancelled');
    const paid = inv.payments.reduce((a: number, p: any) => a + p.amount, 0);
    const x = await both('admin', 'post', `/invoices/${inv.id}/payments`, { amount: inv.amount - paid + 1, mode: 'UPI' });
    expect(x.e.status).toBe(400);
    expect(x.e.body.field).toBe('amount');
    same(x);
  });

  it('dashboard?period=month as client', async () => {
    const x = await both('client', 'get', '/dashboard?period=month');
    expect(x.e.status).toBe(200);
    same(x);
  });

  it('method mismatch and unknown route behave identically', async () => {
    const t = coreLogin('admin');
    const e = await (await import('supertest')).default(s.app).patch('/api/properties').set('Authorization', `Bearer ${etok.admin}`).send({});
    expect(run('PATCH', '/properties', { token: t, body: {} })).toEqual({ status: e.status, body: e.body });
    const e2 = await call(s.app, etok.admin, 'get', '/api/nope/a/b');
    expect(run('GET', '/nope/a/b', { token: t })).toEqual({ status: e2.status, body: e2.body });
    const e3 = await call(s.app, null, 'get', '/api/auth/me');
    expect(run('GET', '/auth/me')).toEqual({ status: e3.status, body: e3.body });
  });
});

describe('framework-agnostic sources', () => {
  const ROOT = path.resolve(path.dirname(REPO_SEED), '..');
  const builtins = new Set(builtinModules.flatMap(m => [m, m.split('/')[0]]));
  const files = ['server/core.ts', 'server/auth.ts', 'server/domain.ts', 'server/scope.ts', 'shared/permissions.ts', 'shared/types.ts', 'shared/format.ts'];
  for (const f of files) {
    it(`${f} imports no Node built-ins, express, or fs/process APIs`, () => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const specs = [...src.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|^import\s+)['"]([^'"]+)['"]/gm)].map(m => m[1]);
      for (const sp of specs) {
        expect(sp.startsWith('node:'), `${f}: ${sp}`).toBe(false);
        expect(builtins.has(sp) || builtins.has(sp.split('/')[0]), `${f}: ${sp}`).toBe(false);
        expect(sp, `${f}`).not.toBe('express');
      }
      expect(src, f).not.toMatch(/\brequire\s*\(/);
      expect(src, f).not.toMatch(/\bprocess\.|\bBuffer\b|__dirname|__filename/);
    });
  }
});
