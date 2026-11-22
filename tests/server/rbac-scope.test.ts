import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, loginAll, ownPropertyIds, ROLES, seed, seedUser, startServer, type Role, type Server } from './helpers';

let s: Server;
let tok: Record<Role, string>;
beforeAll(async () => { s = await startServer(); tok = await loginAll(s.app); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

/** PLAN §4 permission matrix (independent copy, the spec under test). */
const MATRIX: Record<string, Partial<Record<Role, string>>> = {
  properties: { admin: 'VCED', staff: 'VCE', agent: 'VCE', broker: 'VCE', owner: 'VCE', client: 'V' },
  leads: { admin: 'VCED', staff: 'VCED', agent: 'VE', broker: 'VCE' },
  owners: { admin: 'VCED', staff: 'VCE', broker: 'VC' },
  staff: { admin: 'VCED' },
  agents: { admin: 'VCED', staff: 'V' },
  brokers: { admin: 'VCED', staff: 'V' },
  clients: { admin: 'VCED', staff: 'VCE', agent: 'V', broker: 'V' },
  buyRequests: { admin: 'VCED', staff: 'VCE', agent: 'V', broker: 'VCE', owner: 'V', client: 'VC' },
  rentRequests: { admin: 'VCED', staff: 'VCE', agent: 'V', owner: 'V', client: 'VC' },
  tenants: { admin: 'VCED', staff: 'V', owner: 'V', client: 'V' },
  invoices: { admin: 'VCED', staff: 'VCE', broker: 'V', owner: 'V', client: 'V' },
  contracts: { admin: 'VCED', staff: 'VCE', broker: 'V', owner: 'V', client: 'V' },
};
const ACTIONS = { view: 'V', create: 'C', edit: 'E', delete: 'D' } as const;

const target = (mod: string) => {
  if (mod === 'buyRequests') return { col: 'requests', kind: 'buy' as const };
  if (mod === 'rentRequests') return { col: 'requests', kind: 'rent' as const };
  return { col: mod, kind: undefined };
};
const listUrl = (col: string, kind?: string) => `/api/${col}${kind ? `?kind=${kind}` : ''}`;

async function propertyFor(role: Role, txn: 'Sale' | 'Rent'): Promise<string> {
  const res = await call(s.app, tok[role], 'get', '/api/properties');
  const list = res.status === 200 ? res.body : seed.properties;
  const p = list.find((x: any) => x.transactionType === txn && x.approval === 'approved') ?? seed.properties.find((x: any) => x.transactionType === txn);
  return p.id;
}

async function createBody(role: Role, mod: string): Promise<any> {
  switch (mod) {
    case 'properties': return { name: 'RBAC Property', price: 1000, transactionType: 'Sale' };
    case 'leads': return { name: 'RBAC Lead', phone: '9876543210' };
    case 'buyRequests': return { kind: 'buy', propertyId: await propertyFor(role, 'Sale'), clientId: seed.clients[0].id };
    case 'rentRequests': return { kind: 'rent', propertyId: await propertyFor(role, 'Rent'), clientId: seed.clients[0].id };
    case 'tenants': case 'invoices': case 'contracts':
      return { clientId: seed.clients[0].id, propertyId: seed.properties[0].id };
    default: return { name: `RBAC ${mod}` };
  }
}

/** A record of the module the role can see (first of its scoped list), else any seed record. */
async function recordFor(role: Role, mod: string, mustBeVisible: boolean): Promise<any> {
  const { col, kind } = target(mod);
  const res = await call(s.app, tok[role], 'get', listUrl(col, kind));
  if (res.status === 200 && res.body.length) return res.body[0];
  if (mustBeVisible) throw new Error(`${role} sees no ${mod} record (status ${res.status})`);
  return (seed[col] as any[]).find(r => !kind || r.kind === kind);
}

describe.each(Object.keys(MATRIX))('module %s', mod => {
  const { col, kind } = target(mod);
  describe.each(ROLES)('role %s', role => {
    const perms = MATRIX[mod][role] ?? '';
    const has = (a: keyof typeof ACTIONS) => perms.includes(ACTIONS[a]);

    it(`view list -> ${has('view') ? 200 : 403}`, async () => {
      const res = await call(s.app, tok[role], 'get', listUrl(col, kind));
      expect(res.status).toBe(has('view') ? 200 : 403);
      if (has('view')) {
        expect(Array.isArray(res.body)).toBe(true);
        if (kind) res.body.forEach((r: any) => expect(r.kind).toBe(kind));
      }
    });

    it(`view by id -> ${has('view') ? 200 : 403}`, async () => {
      const rec = await recordFor(role, mod, false);
      const res = await call(s.app, tok[role], 'get', `/api/${col}/${rec.id}`);
      if (has('view')) {
        // a role may have view but nothing in scope for this module (e.g. owner buy requests); then any record is 403
        const visible = (await call(s.app, tok[role], 'get', listUrl(col, kind))).body.some((r: any) => r.id === rec.id);
        expect(res.status).toBe(visible ? 200 : 403);
      } else expect(res.status).toBe(403);
    });

    it(`create -> ${has('create') ? 201 : 403}`, async () => {
      const res = await call(s.app, tok[role], 'post', `/api/${col}`, await createBody(role, mod));
      expect(res.status, JSON.stringify(res.body)).toBe(has('create') ? 201 : 403);
    });

    it(`edit -> ${has('edit') ? 200 : 403}`, async () => {
      const rec = await recordFor(role, mod, has('edit'));
      const res = await call(s.app, tok[role], 'put', `/api/${col}/${rec.id}`, { notes: 'rbac-edit' });
      expect(res.status, JSON.stringify(res.body)).toBe(has('edit') ? 200 : 403);
      if (has('edit')) expect(res.body.notes).toBe('rbac-edit');
    });

    it(`delete -> ${has('delete') ? 200 : 403}`, async () => {
      const rec = await recordFor(role, mod, has('delete'));
      const res = await call(s.app, tok[role], 'delete', `/api/${col}/${rec.id}`);
      expect(res.status).toBe(has('delete') ? 200 : 403);
      const after = await call(s.app, tok.admin, 'get', `/api/${col}/${rec.id}`);
      expect(after.status).toBe(has('delete') ? 404 : 200);
    });
  });
});

describe('non-collection modules', () => {
  it.each(ROLES)('dashboard view for %s -> 200', async role => {
    expect((await call(s.app, tok[role], 'get', '/api/dashboard')).status).toBe(200);
  });

  it.each(ROLES)('reports view for %s (admin/staff only)', async role => {
    const res = await call(s.app, tok[role], 'get', '/api/reports/rent-paid');
    expect(res.status).toBe(['admin', 'staff'].includes(role) ? 200 : 403);
  });

  it.each(ROLES)('approvals edit (approve/reject) for %s is admin-only', async role => {
    const pending = seed.properties.filter((p: any) => p.approval === 'pending');
    const a = await call(s.app, tok[role], 'post', `/api/properties/${pending[0].id}/approve`);
    expect(a.status).toBe(role === 'admin' ? 200 : 403);
    const r = await call(s.app, tok[role], 'post', `/api/properties/${pending[1].id}/reject`, { reason: 'Docs missing' });
    expect(r.status).toBe(role === 'admin' ? 200 : 403);
  });

  it.each(ROLES)('GET /plans, /settings, /permissions need login only (%s)', async role => {
    for (const url of ['/api/plans', '/api/settings', '/api/permissions', `/api/plans/${seed.plans[0].id}`]) {
      expect((await call(s.app, tok[role], 'get', url)).status, url).toBe(200);
      expect((await call(s.app, null, 'get', url)).status, url).toBe(401);
    }
  });

  it.each(ROLES)('PUT /settings, PUT /permissions, POST /plans, POST /admin/reset are admin-only (%s)', async role => {
    const ok = role === 'admin';
    expect((await call(s.app, tok[role], 'put', '/api/settings', { tagline: 'x' })).status).toBe(ok ? 200 : 403);
    expect((await call(s.app, tok[role], 'put', '/api/permissions', seed.permissions)).status).toBe(ok ? 200 : 403);
    expect((await call(s.app, tok[role], 'post', '/api/plans', { name: 'Bronze' })).status).toBe(ok ? 201 : 403);
    expect((await call(s.app, tok[role], 'post', '/api/admin/reset')).status).toBe(ok ? 200 : 403);
  });

  it('settings rights granted via the matrix let staff PUT /settings (server reads matrix from DB)', async () => {
    const m = structuredClone(seed.permissions);
    m.staff.settings = ['view', 'edit'];
    expect((await call(s.app, tok.admin, 'put', '/api/permissions', m)).status).toBe(200);
    expect((await call(s.app, tok.staff, 'put', '/api/settings', { tagline: 'by staff' })).status).toBe(200);
  });

  it('removing a right in the matrix takes effect immediately', async () => {
    const m = structuredClone(seed.permissions);
    m.staff.leads = [];
    expect((await call(s.app, tok.admin, 'put', '/api/permissions', m)).status).toBe(200);
    expect((await call(s.app, tok.staff, 'get', '/api/leads')).status).toBe(403);
  });

  it("admin's own settings rights cannot be removed", async () => {
    const m = structuredClone(seed.permissions);
    m.admin.settings = [];
    const res = await call(s.app, tok.admin, 'put', '/api/permissions', m);
    expect(res.status).toBe(200);
    expect(res.body.admin.settings).toEqual(expect.arrayContaining(['view', 'edit']));
    expect((await call(s.app, tok.admin, 'put', '/api/settings', { tagline: 'still admin' })).status).toBe(200);
  });

  it('invalid permission matrix -> 400 with field', async () => {
    const r1 = await call(s.app, tok.admin, 'put', '/api/permissions', { admin: {} });
    expect(r1.status).toBe(400);
    expect(r1.body.field).toBe('permissions');
    const m = structuredClone(seed.permissions);
    m.staff.bogusModule = ['view'];
    expect((await call(s.app, tok.admin, 'put', '/api/permissions', m)).status).toBe(400);
  });
});

describe('own scoping', () => {
  it('agent lists only own properties and cannot GET another agent\'s property (403)', async () => {
    const own = ownPropertyIds('agent');
    const res = await call(s.app, tok.agent, 'get', '/api/properties');
    expect(res.body.length).toBe(own.size);
    res.body.forEach((p: any) => expect(p.agentId).toBe(seedUser('agent').linkedId));
    const other = seed.properties.find((p: any) => p.agentId && p.agentId !== seedUser('agent').linkedId);
    expect((await call(s.app, tok.agent, 'get', `/api/properties/${other.id}`)).status).toBe(403);
    expect((await call(s.app, tok.agent, 'put', `/api/properties/${other.id}`, { name: 'hijack' })).status).toBe(403);
  });

  it('agent sees only leads assigned to their user id; other lead -> 403', async () => {
    const me = seedUser('agent');
    const res = await call(s.app, tok.agent, 'get', '/api/leads');
    expect(res.body.length).toBe(seed.leads.filter((l: any) => l.assignedTo === me.id).length);
    res.body.forEach((l: any) => expect(l.assignedTo).toBe(me.id));
    const other = seed.leads.find((l: any) => l.assignedTo !== me.id);
    expect((await call(s.app, tok.agent, 'get', `/api/leads/${other.id}`)).status).toBe(403);
  });

  it('client cannot GET another client\'s invoice (403) but can GET own', async () => {
    const me = seedUser('client');
    const mine = seed.invoices.find((i: any) => i.clientId === me.linkedId);
    const other = seed.invoices.find((i: any) => i.clientId !== me.linkedId);
    expect((await call(s.app, tok.client, 'get', `/api/invoices/${mine.id}`)).status).toBe(200);
    expect((await call(s.app, tok.client, 'get', `/api/invoices/${other.id}`)).status).toBe(403);
    const list = await call(s.app, tok.client, 'get', '/api/invoices');
    expect(list.body.length).toBe(seed.invoices.filter((i: any) => i.clientId === me.linkedId).length);
  });

  it.each(['requests', 'tenants', 'invoices', 'contracts'])('client %s list only has clientId = linkedId', async col => {
    const me = seedUser('client');
    const res = await call(s.app, tok.client, 'get', `/api/${col}`);
    expect(res.status).toBe(200);
    res.body.forEach((r: any) => expect(r.clientId).toBe(me.linkedId));
  });

  it('client sees only approved + public properties; pending one -> 403', async () => {
    const res = await call(s.app, tok.client, 'get', '/api/properties');
    const expected = seed.properties.filter((p: any) => p.approval === 'approved' && p.listingPrivacy === 'public');
    expect(res.body.length).toBe(expected.length);
    const pending = seed.properties.find((p: any) => p.approval === 'pending');
    const internal = seed.properties.find((p: any) => p.listingPrivacy === 'internal');
    expect((await call(s.app, tok.client, 'get', `/api/properties/${pending.id}`)).status).toBe(403);
    if (internal) expect((await call(s.app, tok.client, 'get', `/api/properties/${internal.id}`)).status).toBe(403);
  });

  it('owner sees only tenants on own properties', async () => {
    const own = ownPropertyIds('owner');
    const res = await call(s.app, tok.owner, 'get', '/api/tenants');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(seed.tenants.filter((t: any) => own.has(t.propertyId)).length);
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach((t: any) => expect(own.has(t.propertyId)).toBe(true));
    const other = seed.tenants.find((t: any) => !own.has(t.propertyId));
    expect((await call(s.app, tok.owner, 'get', `/api/tenants/${other.id}`)).status).toBe(403);
  });

  it('broker sees only buy requests on own properties; ?kind=rent -> 403', async () => {
    const own = ownPropertyIds('broker');
    const res = await call(s.app, tok.broker, 'get', '/api/requests');
    expect(res.status).toBe(200);
    res.body.forEach((r: any) => { expect(r.kind).toBe('buy'); expect(own.has(r.propertyId)).toBe(true); });
    expect((await call(s.app, tok.broker, 'get', '/api/requests?kind=rent')).status).toBe(403);
    const rent = seed.requests.find((r: any) => r.kind === 'rent');
    expect((await call(s.app, tok.broker, 'get', `/api/requests/${rent.id}`)).status).toBe(403);
  });

  it('broker cannot create a buy request on a property outside their scope', async () => {
    const own = ownPropertyIds('broker');
    const other = seed.properties.find((p: any) => !own.has(p.id) && p.transactionType === 'Sale');
    const res = await call(s.app, tok.broker, 'post', '/api/requests', { kind: 'buy', propertyId: other.id, clientId: seed.clients[0].id });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('propertyId');
  });

  it.each(['agent', 'broker', 'owner'] as Role[])('%s invoices/contracts/requests are tied to own properties', async role => {
    const own = ownPropertyIds(role);
    for (const col of ['invoices', 'contracts', 'requests']) {
      const res = await call(s.app, tok[role], 'get', `/api/${col}`);
      if (res.status !== 200) continue;
      res.body.forEach((r: any) => expect(own.has(r.propertyId), `${role} ${col}`).toBe(true));
    }
  });

  it('missing id is 404 even for scoped roles (not 403)', async () => {
    for (const role of ROLES) {
      expect((await call(s.app, tok[role], 'get', '/api/properties/does-not-exist')).status, role).toBe(404);
    }
  });
});

describe('auto-linking on create', () => {
  it.each([['agent', 'agentId'], ['broker', 'brokerId'], ['owner', 'ownerId']] as [Role, string][])(
    '%s-created property is linked to them, pending, status Pending, and visible to them', async (role, field) => {
      const res = await call(s.app, tok[role], 'post', '/api/properties', { name: `${role} listing`, price: 5000000, transactionType: 'Sale' });
      expect(res.status).toBe(201);
      expect(res.body[field]).toBe(seedUser(role).linkedId);
      expect(res.body.approval).toBe('pending');
      expect(res.body.status).toBe('Pending');
      expect((await call(s.app, tok[role], 'get', `/api/properties/${res.body.id}`)).status).toBe(200);
      expect((await call(s.app, tok.client, 'get', `/api/properties/${res.body.id}`)).status).toBe(403);
    });

  it('agent cannot attach a new property to a different agent (stays linked to creator)', async () => {
    const otherAgent = seed.agents.find((a: any) => a.id !== seedUser('agent').linkedId);
    const res = await call(s.app, tok.agent, 'post', '/api/properties', { name: 'Spoof', price: 1, transactionType: 'Sale', agentId: otherAgent.id });
    expect(res.status).toBe(201);
    expect(res.body.agentId).toBe(seedUser('agent').linkedId);
  });

  it('broker-created lead is assigned to the broker user and visible to them', async () => {
    const res = await call(s.app, tok.broker, 'post', '/api/leads', { name: 'Broker Lead', phone: '+91 98450 12345' });
    expect(res.status).toBe(201);
    expect(res.body.assignedTo).toBe(seedUser('broker').id);
    expect((await call(s.app, tok.broker, 'get', `/api/leads/${res.body.id}`)).status).toBe(200);
  });

  it('client creating a request gets clientId forced to its linkedId', async () => {
    const me = seedUser('client');
    const other = seed.clients.find((c: any) => c.id !== me.linkedId);
    const prop = seed.properties.find((p: any) => p.transactionType === 'Sale' && p.approval === 'approved' && p.listingPrivacy === 'public');
    const res = await call(s.app, tok.client, 'post', '/api/requests', { kind: 'buy', propertyId: prop.id, clientId: other.id });
    expect(res.status).toBe(201);
    expect(res.body.clientId).toBe(me.linkedId);
    // also without any clientId
    const res2 = await call(s.app, tok.client, 'post', '/api/requests', { kind: 'buy', propertyId: prop.id });
    expect(res2.status).toBe(201);
    expect(res2.body.clientId).toBe(me.linkedId);
  });

  it('client cannot request a property it cannot see (pending)', async () => {
    const pending = seed.properties.find((p: any) => p.approval === 'pending');
    const res = await call(s.app, tok.client, 'post', '/api/requests', { kind: 'rent', propertyId: pending.id });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('propertyId');
  });
});
