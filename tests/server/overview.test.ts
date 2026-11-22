import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, loginAll, seed, seedUser, startServer, type Role, type Server } from './helpers';
import { entityByKey } from '../../shared/registry';

// Task XB6: GET /overview (server/overview.ts) + calendarItems (server/xcore.ts).

let s: Server;
let tok: Record<Role, string>;
beforeAll(async () => { s = await startServer(); tok = await loginAll(s.app); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const get = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'get', url);
const put = (url: string, body: unknown, role: Role = 'admin') => call(s.app, tok[role], 'put', url, body);
const today = () => new Date().toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
const OPEN = ['Unpaid', 'Partially Paid', 'Overdue'];
const xs = (k: string): any[] => seed.x?.[k] ?? [];
const amt = (rows: any[]) => rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
const statusOptions = (k: string) => { const e = entityByKey(k)!; return e.fields.find(f => f.key === e.statusField)!.options!; };
const tallyMap = (rows: any[], key: string) => { const m: Record<string, number> = {}; for (const r of rows) { const k = String(r[key] ?? '-'); m[k] = (m[k] ?? 0) + 1; } return m; };
const asMap = (d: { name: string; value: number }[]) => Object.fromEntries(d.map(x => [x.name, x.value]));
const overview = async (role: Role = 'admin') => { const r = await get('/api/overview', role); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body; };
const expectedOverview = (rows: any[], k: string) => statusOptions(k).map(status => {
  const count = rows.filter(r => r.status === status).length;
  return { status, count, percent: rows.length ? Math.round((count / rows.length) * 100) : 0 };
});

describe('GET /overview: access', () => {
  it.each(['admin', 'staff'] as Role[])('%s (has m:sales / m:projects view) -> 200', async role => {
    expect((await get('/api/overview', role)).status).toBe(200);
  });

  it.each(['agent', 'broker', 'owner', 'client'] as Role[])('%s -> 403', async role => {
    expect((await get('/api/overview', role)).status).toBe(403);
  });

  it('no token -> 401', async () => {
    expect((await call(s.app, null, 'get', '/api/overview')).status).toBe(401);
  });

  it('either m:sales or m:projects view is enough; neither -> 403', async () => {
    const m = structuredClone(seed.permissions);
    m.staff['m:sales'] = []; m.staff['m:projects'] = ['view'];
    m.agent['m:sales'] = ['view'];
    expect((await put('/api/permissions', m)).status).toBe(200);
    expect((await get('/api/overview', 'staff')).status).toBe(200);
    expect((await get('/api/overview', 'agent')).status).toBe(200);
    m.staff['m:projects'] = [];
    m.agent['m:sales'] = ['create']; // no view
    expect((await put('/api/permissions', m)).status).toBe(200);
    expect((await get('/api/overview', 'staff')).status).toBe(403);
    expect((await get('/api/overview', 'agent')).status).toBe(403);
  });
});

describe('GET /overview: numbers equal a manual computation from the seed', () => {
  it('bars', async () => {
    const o = await overview();
    const inv = xs('sales_invoices'), proj = xs('projects_projects'), tasks = xs('tasks_tasks');
    const bar = (label: string) => o.bars.find((b: any) => b.label === label);
    expect(bar('Invoices Awaiting Payment')).toMatchObject({ value: inv.filter(i => OPEN.includes(i.status)).length, total: inv.length });
    expect(bar('Converted Leads')).toMatchObject({ value: seed.leads.filter((l: any) => l.status === 'Booked').length, total: seed.leads.length });
    expect(bar('Projects In Progress')).toMatchObject({ value: proj.filter(p => p.status === 'In Progress').length, total: proj.length });
    expect(bar('Tasks Not Finished')).toMatchObject({ value: tasks.filter(t => t.status !== 'Complete').length, total: tasks.length });
    for (const b of o.bars) { expect(b.value).toBeGreaterThanOrEqual(0); expect(b.value).toBeLessThanOrEqual(b.total); }
  });

  it.each([['invoiceOverview', 'sales_invoices'], ['estimateOverview', 'sales_estimates'], ['proposalOverview', 'sales_proposals']])(
    '%s: every status in registry option order, counts and rounded percents', async (field, key) => {
      const o = await overview();
      expect(o[field]).toEqual(expectedOverview(xs(key), key));
      expect(o[field].map((r: any) => r.status)).toEqual(statusOptions(key));
      expect(o[field].reduce((a: number, r: any) => a + r.count, 0)).toBe(xs(key).filter(r => statusOptions(key).includes(r.status)).length);
      if (xs(key).length) expect(Math.abs(o[field].reduce((a: number, r: any) => a + r.percent, 0) - 100)).toBeLessThanOrEqual(statusOptions(key).length / 2);
    });

  it('totals: outstanding / pastDue / paid from sales_invoices', async () => {
    const o = await overview();
    const inv = xs('sales_invoices'), t = today();
    expect(o.totals.outstanding).toBeCloseTo(amt(inv.filter(i => OPEN.includes(i.status))), 6);
    expect(o.totals.pastDue).toBeCloseTo(amt(inv.filter(i => OPEN.includes(i.status) && (i.status === 'Overdue' || (i.dueDate && i.dueDate < t)))), 6);
    expect(o.totals.paid).toBeCloseTo(amt(inv.filter(i => i.status === 'Paid')), 6);
    expect(o.totals.pastDue).toBeLessThanOrEqual(o.totals.outstanding);
  });

  it('leadsByStatus and projectsByStatus', async () => {
    const o = await overview();
    expect(asMap(o.leadsByStatus)).toEqual(tallyMap(seed.leads, 'status'));
    expect(asMap(o.projectsByStatus)).toEqual(tallyMap(xs('projects_projects'), 'status'));
  });

  it.each(['admin', 'staff'] as Role[])('myTasks for %s: <=8 open tasks, own first, in seed order', async role => {
    const o = await overview(role);
    const me = seedUser(role).id;
    const open = xs('tasks_tasks').filter(t => t.status !== 'Complete');
    const expected = [...open.filter(t => t.assignedTo === me), ...open.filter(t => t.assignedTo !== me)].slice(0, 8);
    expect(o.myTasks.map((t: any) => t.id)).toEqual(expected.map(t => t.id));
    expect(o.myTasks.length).toBeLessThanOrEqual(8);
    const flags = o.myTasks.map((t: any) => t.mine);
    expect(flags).toEqual([...flags].sort((a: boolean, b: boolean) => Number(b) - Number(a)));
    for (const t of o.myTasks) {
      expect(t.status).not.toBe('Complete');
      expect(Object.keys(t).sort()).toEqual(expect.arrayContaining(['id', 'mine', 'name', 'status']));
    }
  });

  it.each(['admin', 'staff'] as Role[])('upcoming for %s: <=8 items, date >= today, equals first 8 of /calendar?from=today', async role => {
    const o = await overview(role);
    expect(o.upcoming.length).toBeLessThanOrEqual(8);
    for (const u of o.upcoming) expect(u.date >= today()).toBe(true);
    const cal = (await get(`/api/calendar?from=${today()}`, role)).body;
    expect(o.upcoming).toEqual(cal.slice(0, 8));
    const dates = o.upcoming.map((u: any) => u.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('upcoming respects module permissions (staff without m:tasks sees no tasks)', async () => {
    const m = structuredClone(seed.permissions);
    m.staff['m:tasks'] = [];
    await put('/api/permissions', m);
    const o = await overview('staff');
    expect(o.upcoming.some((u: any) => u.module === 'tasks')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Direct handleRequest with an in-memory db: missing/empty x and edge records.
// ---------------------------------------------------------------------------

const memStore = (db: any) => ({ db: () => db, save: () => {}, reset: () => db, sessions: new Map<string, string>() });

describe('handleRequest: /overview on controlled data', () => {
  let core: typeof import('../../server/core');
  let db: any;
  let store: ReturnType<typeof memStore>;
  let token: string;
  const ov = () => core.handleRequest(store, { method: 'GET', path: '/overview', query: {}, body: undefined, token });
  const admin = () => seedUser('admin').id;

  beforeEach(async () => {
    core = await import('../../server/core');
    db = structuredClone(seed);
    store = memStore(db);
    const out = core.handleRequest(store, { method: 'POST', path: '/auth/login', query: {}, body: { email: 'admin@regalpark.demo', password: 'demo123' } });
    token = out.body.token;
  });

  const expectZeros = (body: any) => {
    expect(body.totals).toEqual({ outstanding: 0, pastDue: 0, paid: 0 });
    for (const f of ['invoiceOverview', 'estimateOverview', 'proposalOverview']) for (const r of body[f]) expect(r).toMatchObject({ count: 0, percent: 0 });
    expect(body.projectsByStatus).toEqual([]);
    expect(body.myTasks).toEqual([]);
    expect(body.upcoming).toEqual([]);
    for (const b of body.bars.filter((b: any) => b.label !== 'Converted Leads')) expect(b).toMatchObject({ value: 0, total: 0 });
  };

  it('db without x -> 200 with zeros, not 500', () => {
    delete db.x; delete db.xNext; delete db.moduleSettings;
    const res = ov();
    expect(res.status).toBe(200);
    expectZeros(res.body);
  });

  it('db with x = {} -> 200 with zeros', () => {
    db.x = {};
    const res = ov();
    expect(res.status).toBe(200);
    expectZeros(res.body);
  });

  it('db without leads -> 200, Converted Leads 0/0', () => {
    delete db.leads;
    const res = ov();
    expect(res.status).toBe(200);
    expect(res.body.bars.find((b: any) => b.label === 'Converted Leads')).toMatchObject({ value: 0, total: 0 });
    expect(res.body.leadsByStatus).toEqual([]);
  });

  it('totals: pastDue boundary (dueDate < today strict), Overdue without dueDate, paid / draft / cancelled excluded', () => {
    const t = today();
    const inv = (id: string, status: string, amount: number, dueDate?: string) => ({ id, status, amount, ...(dueDate ? { dueDate } : {}) });
    db.x.sales_invoices = [
      inv('a', 'Unpaid', 100, shift(t, -1)),        // outstanding + pastDue
      inv('b', 'Unpaid', 200, t),                   // outstanding, due today -> not past due
      inv('c', 'Partially Paid', 400, shift(t, 1)), // outstanding
      inv('d', 'Overdue', 800),                     // outstanding + pastDue (no dueDate)
      inv('e', 'Paid', 1600, shift(t, -30)),        // paid only
      inv('f', 'Draft', 3200, shift(t, -30)),       // nothing
      inv('g', 'Cancelled', 6400, shift(t, -30)),   // nothing
      inv('h', 'Partially Paid', '50' as any),      // string amount coerced
    ];
    const res = ov();
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ outstanding: 100 + 200 + 400 + 800 + 50, pastDue: 100 + 800, paid: 1600 });
    const bar = res.body.bars.find((b: any) => b.label === 'Invoices Awaiting Payment');
    expect(bar).toMatchObject({ value: 5, total: 8 });
  });

  it('percents: 3 equal statuses round to 33 each (sum 99, within rounding of 100); unknown status ignored in overview', () => {
    db.x.sales_invoices = [{ id: '1', status: 'Paid' }, { id: '2', status: 'Unpaid' }, { id: '3', status: 'Draft' }];
    const io = ov().body.invoiceOverview;
    expect(io.filter((r: any) => r.count === 1).map((r: any) => r.percent)).toEqual([33, 33, 33]);
    expect(io.map((r: any) => r.status)).toEqual(statusOptions('sales_invoices'));
    db.x.sales_invoices.push({ id: '4', status: 'Weird' });
    const io2 = ov().body.invoiceOverview;
    expect(io2.some((r: any) => r.status === 'Weird')).toBe(false);
    expect(io2.find((r: any) => r.status === 'Paid').percent).toBe(25);
  });

  it('myTasks: max 8, own open tasks first, Complete excluded, mine flag set', () => {
    const me = admin();
    const other = seedUser('staff').id;
    const due = shift(today(), 3);
    db.x.tasks_tasks = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, name: `other ${i}`, status: 'Not Started', assignedTo: other, dueDate: due })),
      { id: 'mDone', name: 'mine done', status: 'Complete', assignedTo: me, dueDate: due },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `mine ${i}`, status: 'In Progress', assignedTo: me, dueDate: due })),
      { id: 'u', name: 'unassigned', status: 'Testing', dueDate: due },
    ];
    const t = ov().body.myTasks;
    expect(t).toHaveLength(8);
    expect(t.map((x: any) => x.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'o0', 'o1']);
    expect(t.slice(0, 6).every((x: any) => x.mine === true)).toBe(true);
    expect(t.slice(6).every((x: any) => x.mine === false)).toBe(true);
    expect(t.some((x: any) => x.id === 'mDone')).toBe(false);
  });

  it('myTasks: fewer than 8 open -> all of them; all Complete -> []', () => {
    db.x.tasks_tasks = [{ id: 'a', name: 'a', status: 'Testing' }, { id: 'b', name: 'b', status: 'Complete' }];
    expect(ov().body.myTasks.map((x: any) => x.id)).toEqual(['a']);
    db.x.tasks_tasks = [{ id: 'b', name: 'b', status: 'Complete' }];
    expect(ov().body.myTasks).toEqual([]);
  });

  it('upcoming: today included, yesterday excluded, capped at 8, sorted', () => {
    const t = today();
    for (const e of Object.keys(db.x)) if (entityByKey(e)?.calendar) db.x[e] = [];
    db.x.tasks_tasks = [
      { id: 'y', name: 'yesterday', status: 'Not Started', dueDate: shift(t, -1) },
      { id: 't', name: 'today', status: 'Not Started', dueDate: t },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: `f${i}`, status: 'Not Started', dueDate: shift(t, 10 - i) })),
    ];
    const up = ov().body.upcoming;
    expect(up).toHaveLength(8);
    expect(up[0]).toMatchObject({ id: 't', date: t, module: 'tasks', entity: 'tasks_tasks', title: 'today' });
    expect(up.some((u: any) => u.id === 'y')).toBe(false);
    const dates = up.map((u: any) => u.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d: string) => d >= t)).toBe(true);
  });

  it('agent (no m:sales / m:projects) -> 403 on the in-memory store too', () => {
    const out = core.handleRequest(store, { method: 'POST', path: '/auth/login', query: {}, body: { email: 'agent@regalpark.demo', password: 'demo123' } });
    expect(core.handleRequest(store, { method: 'GET', path: '/overview', query: {}, body: undefined, token: out.body.token }).status).toBe(403);
  });
});
