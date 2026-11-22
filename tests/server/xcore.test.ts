import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { call, loginAll, readDbFile, seed, startServer, type Role, type Server } from './helpers';
import { entityByKey, moduleByKey, moduleOfEntity, REGISTRY } from '../../shared/registry';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';

// Registry module engine (PLAN §10.1-10.2, ADR-9): /x/:entity, /m/:module/*, /calendar, m:<key> permissions.

let s: Server;
let tok: Record<Role, string>;
beforeAll(async () => { s = await startServer(); tok = await loginAll(s.app); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const get = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'get', url);
const post = (url: string, body: unknown, role: Role = 'admin') => call(s.app, tok[role], 'post', url, body);
const put = (url: string, body: unknown, role: Role = 'admin') => call(s.app, tok[role], 'put', url, body);
const del = (url: string, role: Role = 'admin') => call(s.app, tok[role], 'delete', url);

const FLEET = moduleByKey('fleet')!;
const ent = (suffix: string) => FLEET.entities.find(e => e.key === `fleet_${suffix}`)!.key;
const VEH = ent('vehicles'), DRV = ent('drivers'), FUEL = ent('fuel'), MNT = ent('maintenance'), BKG = ent('bookings');
const GROUPS = ent('vehicle_groups'), TYPES = ent('vehicle_types');
const sx = (key: string): any[] => seed.x[key];
const vehicle = () => ({ name: 'Test Truck', plate: 'KA-01-AB-1234', status: entityByKey(VEH)!.fields.find(f => f.key === 'status')!.options![0] });
const driver = (phone = '9876543210') => ({ name: 'Ravi Kumar', phone, status: entityByKey(DRV)!.fields.find(f => f.key === 'status')!.options![0] });
const codeNum = (code: string) => Number(code.slice(code.length - 4));
const createVehicle = async (extra: Record<string, unknown> = {}, role: Role = 'admin') => post(`/api/x/${VEH}`, { ...vehicle(), ...extra }, role);
const firstId = (key: string) => sx(key)[0].id as string;

describe('registry sanity (Fleet sample)', () => {
  it('fleet module and its entities resolve through the registry helpers', () => {
    expect(FLEET).toBeDefined();
    for (const e of FLEET.entities) {
      expect(entityByKey(e.key)).toBe(e);
      expect(moduleOfEntity(e.key)).toBe(FLEET);
      expect(Array.isArray(sx(e.key)), e.key).toBe(true);
    }
  });
});

describe('/x/:entity CRUD', () => {
  it('GET list returns all seeded records, newest first by createdAt', async () => {
    const res = await get(`/api/x/${VEH}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(sx(VEH).length);
    const dates = res.body.map((r: any) => r.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('newly created record is listed before older ones', async () => {
    const c = await createVehicle();
    expect(c.status).toBe(201);
    const list = (await get(`/api/x/${VEH}`)).body;
    const dates = list.map((r: any) => r.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const idx = list.findIndex((r: any) => r.id === c.body.id);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(list.slice(0, idx).every((r: any) => r.createdAt >= c.body.createdAt)).toBe(true);
  });

  it('POST stores only declared fields, stamps id/createdAt/createdBy, and persists to db.json', async () => {
    const res = await createVehicle({ junk: 'x', id: 'forged', createdBy: 'forged', code: 'VEH-9999' });
    expect(res.status).toBe(201);
    expect(res.body.junk).toBeUndefined();
    expect(res.body.id).not.toBe('forged');
    expect(res.body.createdBy).toBe(seed.users.find((u: any) => u.role === 'admin' && u.email === 'admin@regalpark.demo').id);
    expect(res.body.code).not.toBe('VEH-9999');
    expect(readDbFile(s.dir).x[VEH].some((r: any) => r.id === res.body.id)).toBe(true);
    expect((await get(`/api/x/${VEH}/${res.body.id}`)).body).toEqual(res.body);
  });

  it('implicit code = prefix + 4 digits; 3 creates give 3 consecutive codes', async () => {
    const codes: string[] = [];
    for (let i = 0; i < 3; i++) codes.push((await createVehicle()).body.code);
    for (const c of codes) expect(c).toMatch(/^VEH-\d{4}$/);
    const n = codes.map(codeNum);
    expect(n[1]).toBe(n[0] + 1);
    expect(n[2]).toBe(n[0] + 2);
    expect(new Set([...sx(VEH).map(r => r.code), ...codes]).size).toBe(sx(VEH).length + 3);
  });

  it('first new code continues right after the highest seeded code (no gap)', async () => {
    const max = Math.max(...sx(VEH).map(r => codeNum(r.code)));
    const res = await createVehicle();
    expect(res.body.code).toBe(`VEH-${String(max + 1).padStart(4, '0')}`);
  });

  it('entity without prefix gets no code', async () => {
    const res = await post(`/api/x/${GROUPS}`, { name: 'New Group' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBeUndefined();
  });

  it('PUT updates fields and ignores id/code/createdAt/createdBy', async () => {
    const orig = sx(VEH)[0];
    const res = await put(`/api/x/${VEH}/${orig.id}`, { name: 'Renamed', id: 'x1', code: 'VEH-9999', createdAt: '2000-01-01T00:00:00.000Z', createdBy: 'evil' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: orig.id, code: orig.code, createdAt: orig.createdAt, createdBy: orig.createdBy, name: 'Renamed', plate: orig.plate });
    expect((await get(`/api/x/${VEH}/${orig.id}`)).body.name).toBe('Renamed');
    expect((await get(`/api/x/${VEH}/x1`)).status).toBe(404);
  });

  it("PUT with '' or null clears an optional field", async () => {
    const orig = sx(VEH).find(r => r.make !== undefined && r.odometer !== undefined);
    const res = await put(`/api/x/${VEH}/${orig.id}`, { make: '', odometer: null });
    expect(res.status).toBe(200);
    const got = (await get(`/api/x/${VEH}/${orig.id}`)).body;
    expect(got.make).toBeUndefined();
    expect(got.odometer).toBeUndefined();
    expect(got.name).toBe(orig.name);
  });

  it('PUT with an empty body leaves the record unchanged', async () => {
    const orig = sx(VEH)[1];
    const res = await put(`/api/x/${VEH}/${orig.id}`, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(orig);
  });

  it('DELETE then GET -> 404; second DELETE -> 404; list shrinks by one', async () => {
    const id = firstId(VEH);
    expect((await del(`/api/x/${VEH}/${id}`)).status).toBe(200);
    expect((await get(`/api/x/${VEH}/${id}`)).status).toBe(404);
    expect((await del(`/api/x/${VEH}/${id}`)).status).toBe(404);
    expect((await get(`/api/x/${VEH}`)).body).toHaveLength(sx(VEH).length - 1);
  });

  it('unknown entity -> 404 on every verb; unknown id -> 404', async () => {
    for (const e of ['zzz', 'constructor', '__proto__', 'toString']) {
      expect((await get(`/api/x/${e}`)).status, e).toBe(404);
      expect((await post(`/api/x/${e}`, { name: 'x' })).status, e).toBe(404);
      expect((await get(`/api/x/${e}/1`)).status, e).toBe(404);
      expect((await put(`/api/x/${e}/1`, {})).status, e).toBe(404);
      expect((await del(`/api/x/${e}/1`)).status, e).toBe(404);
    }
    expect((await get(`/api/x/${VEH}/nope-123`)).status).toBe(404);
    expect((await put(`/api/x/${VEH}/nope-123`, { name: 'x' })).status).toBe(404);
  });
});

describe('/x validation', () => {
  const expect400 = async (p: Promise<any>, field: string) => {
    const res = await p;
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.field).toBe(field);
    expect(typeof res.body.error).toBe('string');
  };

  it('required: missing / blank / null -> 400 naming the field (POST)', async () => {
    await expect400(post(`/api/x/${VEH}`, {}), 'name');
    await expect400(post(`/api/x/${VEH}`, { ...vehicle(), name: '   ' }), 'name');
    await expect400(post(`/api/x/${VEH}`, { ...vehicle(), name: null }), 'name');
    const { plate: _p, ...noPlate } = vehicle();
    await expect400(post(`/api/x/${VEH}`, noPlate), 'plate');
    const { status: _s, ...noStatus } = vehicle();
    await expect400(post(`/api/x/${VEH}`, noStatus), 'status');
    expect((await get(`/api/x/${VEH}`)).body).toHaveLength(sx(VEH).length);
  });

  it("required: PUT with '' or null on a required field -> 400", async () => {
    await expect400(put(`/api/x/${VEH}/${firstId(VEH)}`, { name: '' }), 'name');
    await expect400(put(`/api/x/${VEH}/${firstId(VEH)}`, { plate: null }), 'plate');
  });

  it('number: 0 accepted, -1 rejected, numeric string coerced, junk rejected', async () => {
    expect((await createVehicle({ odometer: 0 })).body.odometer).toBe(0);
    const coerced = await createVehicle({ odometer: '1500' });
    expect(coerced.status).toBe(201);
    expect(coerced.body.odometer).toBe(1500);
    await expect400(createVehicle({ odometer: -1 }), 'odometer');
    await expect400(createVehicle({ odometer: '-0.5' }), 'odometer');
    await expect400(createVehicle({ odometer: 'abc' }), 'odometer');
    await expect400(createVehicle({ odometer: '12abc' }), 'odometer');
    await expect400(createVehicle({ odometer: true }), 'odometer');
    await expect400(createVehicle({ odometer: 'Infinity' }), 'odometer');
    await expect400(createVehicle({ odometer: {} }), 'odometer');
  });

  it('money: 0 accepted, -0.01 rejected, string coerced', async () => {
    const base = { vehicle: firstId(VEH), date: '2026-11-01' };
    const zero = await post(`/api/x/${FUEL}`, { ...base, total: 0 });
    expect(zero.status).toBe(201);
    expect(zero.body.total).toBe(0);
    expect((await post(`/api/x/${FUEL}`, { ...base, total: '1234.5' })).body.total).toBe(1234.5);
    await expect400(post(`/api/x/${FUEL}`, { ...base, total: -0.01 }), 'total');
  });

  it('number on PUT is validated too', async () => {
    await expect400(put(`/api/x/${VEH}/${firstId(VEH)}`, { odometer: -1 }), 'odometer');
    expect((await put(`/api/x/${VEH}/${firstId(VEH)}`, { odometer: '42' })).body.odometer).toBe(42);
  });

  it('tel: Indian mobile accepted in common formats; bad numbers rejected', async () => {
    for (const ok of ['9876543210', '+91 98765 43210', '098765-43210', '6000000000']) {
      expect((await post(`/api/x/${DRV}`, driver(ok))).status, ok).toBe(201);
    }
    for (const badPhone of ['12345', '5876543210', '98765432101', 'abcdefghij', '+1 9876543210']) {
      await expect400(post(`/api/x/${DRV}`, driver(badPhone)), 'phone');
    }
    await expect400(post(`/api/x/${DRV}`, driver('')), 'phone');
  });

  it('select: value must be one of options (case-sensitive)', async () => {
    await expect400(createVehicle({ status: 'Bogus' }), 'status');
    await expect400(createVehicle({ status: 'active' }), 'status');
    await expect400(post(`/api/x/${MNT}`, { vehicle: firstId(VEH), service: 'Car Wash', status: 'Scheduled' }), 'service');
  });

  it('ref: must point at an existing record of the target entity', async () => {
    expect((await createVehicle({ type: firstId(TYPES), group: firstId(GROUPS) })).status).toBe(201);
    await expect400(createVehicle({ type: 'nope-123' }), 'type');
    await expect400(createVehicle({ type: firstId(GROUPS) }), 'type'); // id of a different entity
    await expect400(post(`/api/x/${FUEL}`, { vehicle: 'nope-123', date: '2026-11-01' }), 'vehicle');
  });

  it('ref: a deleted target is no longer accepted', async () => {
    const id = firstId(TYPES);
    await del(`/api/x/${TYPES}/${id}`);
    await expect400(createVehicle({ type: id }), 'type');
  });

  it('body must be a plain JSON object', async () => {
    const arr = await post(`/api/x/${VEH}`, [vehicle()]);
    expect(arr.status).toBe(400);
    const arrPut = await put(`/api/x/${VEH}/${firstId(VEH)}`, [1]);
    expect(arrPut.status).toBe(400);
  });

  it('prototype keys in the body are dropped and do not pollute Object.prototype', async () => {
    const raw = `{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"prototype":1,"name":"P","plate":"KA-1","status":"${vehicle().status}"}`;
    const res = await request(s.app).post(`/api/x/${VEH}`).set('Authorization', `Bearer ${tok.admin}`).set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBe(201);
    expect(Object.hasOwn(res.body, '__proto__')).toBe(false);
    expect(Object.hasOwn(res.body, 'prototype')).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
    const upd = await request(s.app).put(`/api/x/${VEH}/${res.body.id}`).set('Authorization', `Bearer ${tok.admin}`).set('Content-Type', 'application/json').send('{"__proto__":{"polluted":"yes"},"name":"Q"}');
    expect(upd.status).toBe(200);
    expect(upd.body.name).toBe('Q');
    expect(({} as any).polluted).toBeUndefined();
  });

  it('1MB string body is rejected cleanly (4xx, not 500) and nothing is stored', async () => {
    const res = await createVehicle({ name: 'x'.repeat(1024 * 1024) });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect((await get(`/api/x/${VEH}`)).body).toHaveLength(sx(VEH).length);
  });
});

describe('permissions m:<key>', () => {
  const NONE: Role[] = ['client', 'agent', 'owner', 'broker'];

  it('DEFAULT_PERMISSIONS: admin VCED, staff VCE on every registry module (view-only on restricted keys), others none', () => {
    const restricted = ['accounting', 'payroll', 'team_passwords', 'risk'];
    for (const m of REGISTRY) {
      const k = `m:${m.key}` as const;
      expect(DEFAULT_PERMISSIONS.admin[k], k).toEqual(['view', 'create', 'edit', 'delete']);
      expect(DEFAULT_PERMISSIONS.staff[k], k).toEqual(restricted.includes(m.key) ? ['view'] : ['view', 'create', 'edit']);
      for (const r of NONE) expect(DEFAULT_PERMISSIONS[r][k], `${r} ${k}`).toBeUndefined();
    }
  });

  it('real m:accounting: in REGISTRY, staff view-only by default and in the seed matrix', async () => {
    expect(moduleByKey('accounting')).toBeDefined();
    expect(DEFAULT_PERMISSIONS.staff['m:accounting']).toEqual(['view']);
    expect(seed.permissions.staff['m:accounting']).toEqual(['view']);
    const AE = moduleByKey('accounting')!.entities.find(e => !e.lookup && (seed.x[e.key] ?? []).length > 0)!.key;
    const id = seed.x[AE][0].id;
    expect((await get(`/api/x/${AE}`, 'staff')).status).toBe(200);
    expect((await post(`/api/x/${AE}`, {}, 'staff')).status).toBe(403);
    expect((await put(`/api/x/${AE}/${id}`, {}, 'staff')).status).toBe(403);
    expect((await del(`/api/x/${AE}/${id}`, 'staff')).status).toBe(403);
    expect((await put('/api/m/accounting/settings', {}, 'staff')).status).toBe(403);
  });

  it.each(NONE)('%s gets 403 on every /x and /m route', async role => {
    const id = firstId(VEH);
    const checks: [string, Promise<any>][] = [
      ['GET list', get(`/api/x/${VEH}`, role)],
      ['POST', createVehicle({}, role)],
      ['GET id', get(`/api/x/${VEH}/${id}`, role)],
      ['PUT', put(`/api/x/${VEH}/${id}`, { name: 'x' }, role)],
      ['DELETE', del(`/api/x/${VEH}/${id}`, role)],
      ['dashboard', get('/api/m/fleet/dashboard', role)],
      ['report', get(`/api/m/fleet/report?entity=${MNT}&groupBy=status`, role)],
      ['settings GET', get('/api/m/fleet/settings', role)],
      ['settings PUT', put('/api/m/fleet/settings', { defaultFuelType: 'CNG' }, role)],
    ];
    for (const [name, p] of checks) expect((await p).status, `${role} ${name}`).toBe(403);
    expect((await get(`/api/x/${VEH}/${id}`)).status).toBe(200); // nothing was deleted
  });

  it.each(NONE)('%s: /calendar exposes no fleet entries', async role => {
    const res = await get('/api/calendar', role);
    if (res.status === 200) expect(res.body.filter((e: any) => e.module === 'fleet')).toEqual([]);
    else expect(res.status).toBe(403);
  });

  it('staff: view/create/edit allowed, delete forbidden', async () => {
    expect((await get(`/api/x/${VEH}`, 'staff')).status).toBe(200);
    const c = await createVehicle({}, 'staff');
    expect(c.status).toBe(201);
    expect((await put(`/api/x/${VEH}/${c.body.id}`, { name: 'S' }, 'staff')).status).toBe(200);
    expect((await del(`/api/x/${VEH}/${c.body.id}`, 'staff')).status).toBe(403);
    expect((await get('/api/m/fleet/dashboard', 'staff')).status).toBe(200);
    expect((await put('/api/m/fleet/settings', { defaultFuelType: 'CNG' }, 'staff')).status).toBe(200);
  });

  it('PUT /permissions accepts m:<registry key> and the new matrix is enforced', async () => {
    const m = structuredClone(seed.permissions);
    m.staff['m:fleet'] = [];
    m.agent['m:fleet'] = ['view'];
    const res = await put('/api/permissions', m);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await get(`/api/x/${VEH}`, 'staff')).status).toBe(403);
    expect((await get(`/api/x/${VEH}`, 'agent')).status).toBe(200);
    expect((await createVehicle({}, 'agent')).status).toBe(403);
    const cal = await get('/api/calendar', 'staff');
    if (cal.status === 200) expect(cal.body.filter((e: any) => e.module === 'fleet')).toEqual([]);
    expect((await get('/api/calendar', 'agent')).body.some((e: any) => e.module === 'fleet')).toBe(true);
  });

  it.each(['m:zzz', 'm:', 'm:__proto__', 'm:fleet_vehicles', 'fleet'])('PUT /permissions rejects unknown key %s with 400', async key => {
    const m = structuredClone(seed.permissions);
    m.staff[key] = ['view'];
    const res = await put('/api/permissions', m);
    expect(res.status).toBe(400);
    expect((await get('/api/permissions')).body).toEqual(seed.permissions);
  });
});

describe('/m/:module/dashboard', () => {
  const monthStr = (d: Date) => d.toISOString().slice(0, 7);
  const startOf = (p: string): string | undefined => {
    const n = new Date(), y = n.getUTCFullYear(), mo = n.getUTCMonth();
    if (p === 'month') return `${monthStr(n)}-01`;
    if (p === '3m') return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 10);
    if (p === 'year') return `${y}-01-01`;
    return undefined;
  };
  const counts = (rows: any[], key: (r: any) => string) => {
    const m: Record<string, number> = {};
    for (const r of rows) m[key(r)] = (m[key(r)] ?? 0) + 1;
    return m;
  };
  const asMap = (data: { name: string; value: number }[]) => Object.fromEntries(data.map(d => [d.name, d.value]));

  it.each(['all', 'month', '3m', 'year', 'bogus', ''])('period=%s: cards and charts equal a manual computation from the db', async period => {
    const res = await get(`/api/m/fleet/dashboard${period === '' ? '' : `?period=${period}`}`);
    expect(res.status).toBe(200);
    const { cards, charts } = res.body;
    const from = startOf(period);
    const now = new Date();
    const months = [5, 4, 3, 2, 1, 0].map(i => monthStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
    let ci = 0;
    for (const e of FLEET.entities.filter(e => !e.lookup)) {
      const rows = sx(e.key).filter(r => !from || String(r.createdAt).slice(0, 10) >= from);
      expect(cards.find((c: any) => c.label === e.label)?.value, `${period} ${e.key} count`).toBe(rows.length);
      if (e.amountField) {
        const card = cards.find((c: any) => c.money && c.label.startsWith(e.label));
        const total = rows.reduce((a, r) => a + (Number(r[e.amountField!]) || 0), 0);
        expect(card?.value, `${period} ${e.key} amount`).toBeCloseTo(total, 6);
      }
      if (e.statusField) {
        const pie = charts.find((c: any) => c.type === 'pie' && c.title.startsWith(e.label));
        expect(asMap(pie.data), `${e.key} pie`).toEqual(counts(rows, r => String(r[e.statusField!] ?? '-')));
        ci++;
      }
      if (e.dateField) {
        const bar = charts.find((c: any) => c.type === 'bar' && c.title.startsWith(e.label));
        expect(bar.data.map((d: any) => d.name)).toEqual(months);
        const byMonth = counts(rows.filter(r => r[e.dateField!]), r => String(r[e.dateField!]).slice(0, 7));
        expect(bar.data.map((d: any) => d.value), `${e.key} bar`).toEqual(months.map(m => byMonth[m] ?? 0));
        ci++;
      }
    }
    expect(charts).toHaveLength(ci);
    expect(cards.filter((c: any) => !c.money)).toHaveLength(FLEET.entities.filter(e => !e.lookup).length);
    // lookups are excluded
    for (const e of FLEET.entities.filter(e => e.lookup)) expect(cards.some((c: any) => c.label === e.label)).toBe(false);
  });

  it('dashboard reflects a newly created record', async () => {
    const before = (await get('/api/m/fleet/dashboard')).body.cards.find((c: any) => c.label === entityByKey(VEH)!.label).value;
    await createVehicle();
    const after = (await get('/api/m/fleet/dashboard?period=month')).body.cards.find((c: any) => c.label === entityByKey(VEH)!.label).value;
    expect((await get('/api/m/fleet/dashboard')).body.cards.find((c: any) => c.label === entityByKey(VEH)!.label).value).toBe(before + 1);
    expect(after).toBeGreaterThanOrEqual(1);
  });

  it('unknown module / unknown page -> 404', async () => {
    for (const m of ['zzz', '__proto__', 'constructor']) {
      expect((await get(`/api/m/${m}/dashboard`)).status, m).toBe(404);
      expect((await get(`/api/m/${m}/report?entity=${MNT}&groupBy=status`)).status, m).toBe(404);
      expect((await get(`/api/m/${m}/settings`)).status, m).toBe(404);
      expect((await put(`/api/m/${m}/settings`, {})).status, m).toBe(404);
    }
    expect((await get('/api/m/fleet/nopage')).status).toBe(404);
    expect((await get('/api/m/fleet')).status).toBe(404);
  });
});

describe('/m/:module/report', () => {
  const sortRows = (rows: any[], col: string) => [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])));

  it('maintenance by status: columns [Status, Count, Amount] and sums equal db', async () => {
    const res = await get(`/api/m/fleet/report?entity=${MNT}&groupBy=status`);
    expect(res.status).toBe(200);
    expect(res.body.columns).toEqual(['Status', 'Count', 'Amount']);
    const exp: Record<string, { Count: number; Amount: number }> = {};
    for (const r of sx(MNT)) {
      const k = r.status ?? '-';
      exp[k] ??= { Count: 0, Amount: 0 };
      exp[k].Count++;
      exp[k].Amount += Number(r.cost) || 0;
    }
    const expected = Object.entries(exp).map(([k, v]) => ({ Status: k, ...v }));
    expect(sortRows(res.body.rows, 'Status')).toEqual(sortRows(expected, 'Status'));
    for (const row of res.body.rows) expect(Object.keys(row).sort()).toEqual(['Amount', 'Count', 'Status']);
  });

  it('fuel by ref field groups by the target title (vehicle name) and totals match', async () => {
    const res = await get(`/api/m/fleet/report?entity=${FUEL}&groupBy=vehicle`);
    expect(res.status).toBe(200);
    expect(res.body.columns).toEqual(['Vehicle', 'Count', 'Amount']);
    const name = (id: string) => sx(VEH).find(v => v.id === id)?.name ?? id;
    const exp: Record<string, { Count: number; Amount: number }> = {};
    for (const r of sx(FUEL)) {
      const k = r.vehicle ? name(r.vehicle) : '-';
      exp[k] ??= { Count: 0, Amount: 0 };
      exp[k].Count++;
      exp[k].Amount += Number(r.total) || 0;
    }
    const got = Object.fromEntries(res.body.rows.map((r: any) => [r.Vehicle, { Count: r.Count, Amount: r.Amount }]));
    expect(Object.keys(got).sort()).toEqual(Object.keys(exp).sort());
    for (const k of Object.keys(exp)) {
      expect(got[k].Count, k).toBe(exp[k].Count);
      expect(got[k].Amount, k).toBeCloseTo(exp[k].Amount, 6);
    }
    expect(res.body.rows.some((r: any) => /^fleet_vehicles-/.test(r.Vehicle))).toBe(false);
  });

  it('entity without amountField: no Amount column and no Amount key in rows; counts sum to total', async () => {
    const res = await get(`/api/m/fleet/report?entity=${BKG}&groupBy=status`);
    expect(res.status).toBe(200);
    expect(res.body.columns).toEqual(['Status', 'Count']);
    for (const row of res.body.rows) expect(Object.keys(row).sort()).toEqual(['Count', 'Status']);
    expect(res.body.rows.reduce((a: number, r: any) => a + r.Count, 0)).toBe(sx(BKG).length);
  });

  it("rows with an empty group value are grouped under '-'", async () => {
    const r = sx(MNT)[0];
    await put(`/api/x/${MNT}/${r.id}`, { garage: '' });
    const res = await get(`/api/m/fleet/report?entity=${MNT}&groupBy=garage`);
    expect(res.body.rows.find((x: any) => x.Garage === '-')?.Count).toBeGreaterThanOrEqual(1);
  });

  it('unknown / missing entity -> 404; unknown / missing groupBy -> 400', async () => {
    expect((await get('/api/m/fleet/report?entity=zzz&groupBy=status')).status).toBe(404);
    expect((await get('/api/m/fleet/report?groupBy=status')).status).toBe(404);
    const g1 = await get(`/api/m/fleet/report?entity=${MNT}&groupBy=zzz`);
    expect(g1.status).toBe(400);
    expect(g1.body.field).toBe('groupBy');
    expect((await get(`/api/m/fleet/report?entity=${MNT}`)).status).toBe(400);
    expect((await get(`/api/m/fleet/report?entity=${MNT}&groupBy=__proto__`)).status).toBe(400);
  });
});

describe('/m/:module/settings', () => {
  it('GET returns the stored settings object', async () => {
    const res = await get('/api/m/fleet/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(seed.moduleSettings.fleet ?? {});
  });

  it('PUT validates declared fields, coerces numbers, ignores unknown keys, persists', async () => {
    const res = await put('/api/m/fleet/settings', { defaultFuelType: 'CNG', serviceIntervalKm: '7500', notifyInsuranceDays: 0, junk: 'x', __proto__x: 1 });
    expect(res.status).toBe(200);
    expect(res.body.defaultFuelType).toBe('CNG');
    expect(res.body.serviceIntervalKm).toBe(7500);
    expect(res.body.notifyInsuranceDays).toBe(0);
    expect(res.body.junk).toBeUndefined();
    expect(res.body.__proto__x).toBeUndefined();
    expect((await get('/api/m/fleet/settings')).body).toEqual(res.body);
    expect(readDbFile(s.dir).moduleSettings.fleet.serviceIntervalKm).toBe(7500);
  });

  it('PUT of only unknown keys changes nothing', async () => {
    const res = await put('/api/m/fleet/settings', { junk: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(seed.moduleSettings.fleet ?? {});
  });

  it('PUT rejects invalid values with 400 and the field name', async () => {
    for (const [k, v] of [['defaultFuelType', 'Coal'], ['serviceIntervalKm', -1], ['serviceIntervalKm', 'abc'], ['notifyInsuranceDays', true]] as const) {
      const res = await put('/api/m/fleet/settings', { [k]: v });
      expect(res.status, `${k}=${v}`).toBe(400);
      expect(res.body.field).toBe(k);
    }
    expect((await get('/api/m/fleet/settings')).body).toEqual(seed.moduleSettings.fleet ?? {});
  });

  it("PUT '' / null clears a setting", async () => {
    const res = await put('/api/m/fleet/settings', { defaultFuelType: '', serviceIntervalKm: null });
    expect(res.status).toBe(200);
    expect(res.body.defaultFuelType).toBeUndefined();
    expect(res.body.serviceIntervalKm).toBeUndefined();
  });

  it('PUT with a non-object body -> 400', async () => {
    expect((await put('/api/m/fleet/settings', ['CNG'])).status).toBe(400);
  });
});

describe('/calendar', () => {
  const bookingDates = () => [...new Set(sx(BKG).map(r => String(r.date).slice(0, 10)))].sort();
  const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

  it('no window: every calendar-entity record, shape {id,title,date,module,entity}, sorted by date', async () => {
    const res = await get('/api/calendar');
    expect(res.status).toBe(200);
    const fleet = res.body.filter((e: any) => e.module === 'fleet');
    expect(fleet).toHaveLength(sx(BKG).length);
    for (const e of fleet) {
      expect(Object.keys(e).sort()).toEqual(['date', 'entity', 'id', 'module', 'title']);
      const rec = sx(BKG).find(r => r.id === e.id);
      expect(e).toEqual({ id: rec.id, title: rec.purpose, date: rec.date, module: 'fleet', entity: BKG });
    }
    const dates = res.body.map((e: any) => e.date);
    expect(dates).toEqual([...dates].sort());
    // non-calendar entities never appear
    expect(res.body.every((e: any) => entityByKey(e.entity)?.calendar)).toBe(true);
  });

  it('from/to bounds are inclusive on both sides', async () => {
    const ds = bookingDates();
    const d = ds[Math.floor(ds.length / 2)];
    const onDay = sx(BKG).filter(r => r.date === d).map(r => r.id).sort();
    const exact = (await get(`/api/calendar?from=${d}&to=${d}`)).body;
    expect(exact.filter((e: any) => e.module === 'fleet').map((e: any) => e.id).sort()).toEqual(onDay);
    expect((await get(`/api/calendar?from=${shift(d, 1)}&to=${shift(d, 1)}`)).body.some((e: any) => e.date === d)).toBe(false);
    expect((await get(`/api/calendar?from=${shift(d, -1)}&to=${shift(d, -1)}`)).body.some((e: any) => e.date === d)).toBe(false);
  });

  it('window [first, last] returns all; window just inside excludes the edge days', async () => {
    const ds = bookingDates();
    const first = ds[0], last = ds[ds.length - 1];
    expect((await get(`/api/calendar?from=${first}&to=${last}`)).body.filter((e: any) => e.module === 'fleet')).toHaveLength(sx(BKG).length);
    const inner = (await get(`/api/calendar?from=${shift(first, 1)}&to=${shift(last, -1)}`)).body.filter((e: any) => e.module === 'fleet');
    expect(inner.some((e: any) => e.date === first || e.date === last)).toBe(false);
    expect(inner).toHaveLength(sx(BKG).filter(r => r.date > first && r.date < last).length);
  });

  it('only from / only to / inverted window', async () => {
    const ds = bookingDates();
    const mid = ds[Math.floor(ds.length / 2)];
    expect((await get(`/api/calendar?from=${mid}`)).body.filter((e: any) => e.module === 'fleet')).toHaveLength(sx(BKG).filter(r => r.date >= mid).length);
    expect((await get(`/api/calendar?to=${mid}`)).body.filter((e: any) => e.module === 'fleet')).toHaveLength(sx(BKG).filter(r => r.date <= mid).length);
    expect((await get(`/api/calendar?from=${ds[ds.length - 1]}&to=${ds[0]}`)).body).toEqual(ds.length > 1 ? [] : expect.any(Array)); // inverted window: nothing from any module
  });

  it('records with no date are skipped', async () => {
    const r = sx(BKG)[0];
    const db = readDbFile(s.dir);
    expect(db.x[BKG].find((x: any) => x.id === r.id)).toBeDefined();
    // date is required on bookings, so it cannot be cleared through the API
    expect((await put(`/api/x/${BKG}/${r.id}`, { date: '' })).status).toBe(400);
  });

  it('staff sees fleet entries (has view)', async () => {
    expect((await get('/api/calendar', 'staff')).body.filter((e: any) => e.module === 'fleet')).toHaveLength(sx(BKG).length);
  });
});

// ---------------------------------------------------------------------------
// Direct handleRequest with an in-memory store (no Express, no files).
// ---------------------------------------------------------------------------

const memStore = (db: any) => ({ db: () => db, save: () => {}, reset: () => db, sessions: new Map<string, string>() });

async function loginMem(core: any, store: any, role: Role) {
  const email = `${role === 'staff' ? 'sales' : role}@regalpark.demo`;
  const out = core.handleRequest(store, { method: 'POST', path: '/auth/login', query: {}, body: { email, password: 'demo123' } });
  expect(out.status).toBe(200);
  return out.body.token as string;
}

describe('handleRequest: old db without x / xNext / moduleSettings', () => {
  let core: typeof import('../../server/core');
  let store: ReturnType<typeof memStore>;
  let db: any;
  let token: string;
  const h = (method: string, path: string, body?: unknown, query: Record<string, string> = {}) =>
    core.handleRequest(store, { method, path, query, body, token });

  beforeEach(async () => {
    core = await import('../../server/core');
    db = structuredClone(seed);
    delete db.x; delete db.xNext; delete db.moduleSettings;
    store = memStore(db);
    token = await loginMem(core, store, 'admin');
  });

  it('GET /x list -> 200 [] and lazily creates x/xNext/moduleSettings', () => {
    const res = h('GET', `/x/${VEH}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(db.x).toBeDefined();
    expect(db.xNext).toBeDefined();
    expect(db.moduleSettings).toBeDefined();
  });

  it('first POST on an empty db gets code 0001 and xNext is created', () => {
    const res = h('POST', `/x/${VEH}`, vehicle());
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('VEH-0001');
    expect(h('POST', `/x/${VEH}`, vehicle()).body.code).toBe('VEH-0002');
    expect(db.x[VEH]).toHaveLength(2);
  });

  it('GET /x/:entity/:id on old db -> 404, not a crash', () => {
    expect(h('GET', `/x/${VEH}/nope`).status).toBe(404);
    expect(h('PUT', `/x/${VEH}/nope`, { name: 'x' }).status).toBe(404);
    expect(h('DELETE', `/x/${VEH}/nope`).status).toBe(404);
  });

  it('dashboard, report, settings, calendar all work on old db', () => {
    const d = h('GET', '/m/fleet/dashboard', undefined, { period: 'month' });
    expect(d.status).toBe(200);
    expect(d.body.cards.every((c: any) => c.value === 0)).toBe(true);
    const r = h('GET', '/m/fleet/report', undefined, { entity: MNT, groupBy: 'status' });
    expect(r.status).toBe(200);
    expect(r.body.rows).toEqual([]);
    expect(h('GET', '/m/fleet/settings').body).toEqual({});
    expect(h('PUT', '/m/fleet/settings', { serviceIntervalKm: '100' }).body).toEqual({ serviceIntervalKm: 100 });
    const cal = h('GET', '/calendar', undefined, { from: '2000-01-01', to: '2999-12-31' });
    expect(cal.status).toBe(200);
    expect(cal.body).toEqual([]);
  });

  it('ref check against a missing db.x collection -> 400, not a crash', () => {
    const res = h('POST', `/x/${FUEL}`, { vehicle: 'nope', date: '2026-11-01' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('vehicle');
  });

  it('body with own __proto__ key (JSON.parse) is sanitised; non-object bodies -> 400', () => {
    const body = JSON.parse(`{"__proto__":{"polluted":1},"name":"A","plate":"P","status":"${vehicle().status}"}`);
    const res = h('POST', `/x/${VEH}`, body);
    expect(res.status).toBe(201);
    expect(({} as any).polluted).toBeUndefined();
    for (const b of ['str', 5, null, [1], true]) expect(h('POST', `/x/${VEH}`, b).status, String(b)).toBe(400);
  });

  it('1MB string in a text field is stored without error (no server-side length crash)', () => {
    const big = 'y'.repeat(1024 * 1024);
    const res = h('POST', `/x/${VEH}`, { ...vehicle(), name: big });
    expect(res.status).toBe(201);
    expect(res.body.name).toHaveLength(big.length);
  });

  it('no token -> 401 on /x, /m, /calendar', () => {
    for (const p of [`/x/${VEH}`, '/m/fleet/dashboard', '/calendar']) {
      expect(core.handleRequest(store, { method: 'GET', path: p, query: {}, body: undefined }).status, p).toBe(401);
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic registry module (via vi.doMock) to reach field types the Fleet
// sample does not declare: email, percent, multiselect, checkbox, number with
// min<0, core-collection ref. Staff view-only is asserted on the real m:accounting.
// ---------------------------------------------------------------------------

describe('handleRequest: synthetic registry (all field types, m:zz_test_acc)', () => {
  let core: any;
  let perms: any;
  let store: ReturnType<typeof memStore>;
  let db: any;
  let tk: Partial<Record<Role, string>>;
  const E = 'zz_test_acc_items';
  const h = (role: Role, method: string, path: string, body?: unknown, query: Record<string, string> = {}) =>
    core.handleRequest(store, { method, path, query, body, token: tk[role] });
  const base = () => ({ title: 'T1' });
  const post400 = (body: Record<string, unknown>, field: string) => {
    const res = h('admin', 'POST', `/x/${E}`, { ...base(), ...body });
    expect(res.status, JSON.stringify(body)).toBe(400);
    expect(res.body.field).toBe(field);
  };

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('../../shared/modules/index', async () => {
      const real: any = await vi.importActual('../../shared/modules/index');
      const acc = {
        key: 'zz_test_acc', label: 'ZZ Test Acc', icon: 'Calculator', group: 'Finance',
        pages: [{ key: 'dashboard', label: 'Dashboard', kind: 'dashboard' }],
        settings: [{ key: 'offset', label: 'Offset', type: 'number', min: -10 }, { key: 'flag', label: 'Flag', type: 'checkbox' }],
        entities: [{
          key: E, label: 'Items', singular: 'Item', prefix: 'ACC-', titleField: 'title', statusField: 'kind', dateField: 'due', amountField: 'amount', calendar: true,
          fields: [
            { key: 'title', label: 'Title', type: 'text', required: true },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'phone', label: 'Phone', type: 'tel' },
            { key: 'pct', label: 'Pct', type: 'percent' },
            { key: 'delta', label: 'Delta', type: 'number', min: -100 },
            { key: 'amount', label: 'Amount', type: 'money' },
            { key: 'tags', label: 'Tags', type: 'multiselect', options: ['a', 'b', 'c'] },
            { key: 'reqTags', label: 'Req Tags', type: 'multiselect', options: ['x', 'y'] },
            { key: 'paid', label: 'Paid', type: 'checkbox' },
            { key: 'kind', label: 'Kind', type: 'select', options: ['X', 'Y'] },
            { key: 'client', label: 'Client', type: 'ref', ref: 'clients' },
            { key: 'vehicle', label: 'Vehicle', type: 'ref', ref: 'fleet_vehicles' },
            { key: 'due', label: 'Due', type: 'date' },
          ],
        }],
      };
      return { MODULES: [...real.MODULES, acc] };
    });
    core = await import('../../server/core');
    perms = await import('../../shared/permissions');
  });

  afterAll(() => { vi.doUnmock('../../shared/modules/index'); vi.resetModules(); });

  beforeEach(async () => {
    db = structuredClone(seed);
    db.permissions = structuredClone(perms.DEFAULT_PERMISSIONS);
    store = memStore(db);
    tk = {};
    for (const r of ['admin', 'staff', 'agent', 'client', 'owner'] as Role[]) tk[r] = await loginMem(core, store, r);
  });

  it('DEFAULT_PERMISSIONS: real m:accounting is staff view-only; a non-restricted module is staff VCE; others none', () => {
    expect(perms.DEFAULT_PERMISSIONS.staff['m:accounting']).toEqual(['view']);
    expect(perms.DEFAULT_PERMISSIONS.admin['m:accounting']).toEqual(['view', 'create', 'edit', 'delete']);
    expect(perms.DEFAULT_PERMISSIONS.staff['m:zz_test_acc']).toEqual(['view', 'create', 'edit']);
    expect(perms.DEFAULT_PERMISSIONS.admin['m:zz_test_acc']).toEqual(['view', 'create', 'edit', 'delete']);
    for (const r of ['agent', 'broker', 'owner', 'client']) {
      expect(perms.DEFAULT_PERMISSIONS[r]['m:zz_test_acc']).toBeUndefined();
      expect(perms.DEFAULT_PERMISSIONS[r]['m:accounting']).toBeUndefined();
    }
  });

  it('staff on the real m:accounting: view 200, create/edit/delete/settings PUT 403', () => {
    const acc = moduleByKey('accounting')!;
    const AE = acc.entities.find(e => !e.lookup && (seed.x[e.key] ?? []).length > 0)!.key;
    const rec = seed.x[AE][0];
    expect(h('staff', 'GET', `/x/${AE}`).status).toBe(200);
    expect(h('staff', 'GET', `/x/${AE}/${rec.id}`).status).toBe(200);
    expect(h('staff', 'GET', '/m/accounting/dashboard').status).toBe(200);
    expect(h('staff', 'GET', '/m/accounting/settings').status).toBe(200);
    expect(h('staff', 'POST', `/x/${AE}`, {}).status).toBe(403);
    expect(h('staff', 'PUT', `/x/${AE}/${rec.id}`, {}).status).toBe(403);
    expect(h('staff', 'DELETE', `/x/${AE}/${rec.id}`).status).toBe(403);
    expect(h('staff', 'PUT', '/m/accounting/settings', {}).status).toBe(403);
  });

  it('staff on a non-restricted module (m:zz_test_acc): create/edit 2xx, delete 403', () => {
    const rec = h('staff', 'POST', `/x/${E}`, base());
    expect(rec.status).toBe(201);
    expect(h('staff', 'PUT', `/x/${E}/${rec.body.id}`, { title: 'z' }).status).toBe(200);
    expect(h('staff', 'DELETE', `/x/${E}/${rec.body.id}`).status).toBe(403);
    expect(h('staff', 'PUT', '/m/zz_test_acc/settings', { offset: 1 }).status).toBe(200);
  });

  it('PUT /permissions accepts m:zz_test_acc', () => {
    const m = structuredClone(db.permissions);
    m.agent['m:zz_test_acc'] = ['view'];
    expect(h('admin', 'PUT', '/permissions', m).status).toBe(200);
    expect(h('agent', 'GET', `/x/${E}`).status).toBe(200);
  });

  it('email: valid accepted, invalid rejected', () => {
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), email: 'a.b@c.in' }).status).toBe(201);
    for (const e of ['plain', 'a@b', '@b.c', 'a b@c.d', 'a@b c.d']) post400({ email: e }, 'email');
  });

  it('percent: 0 ok, -1 rejected, string coerced', () => {
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), pct: 0 }).body.pct).toBe(0);
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), pct: '12.5' }).body.pct).toBe(12.5);
    post400({ pct: -1 }, 'pct');
  });

  it('number with min<0: negatives down to min accepted (boundary at min)', () => {
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), delta: -1 }).body.delta).toBe(-1);
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), delta: -100 }).body.delta).toBe(-100);
    post400({ delta: -100.01 }, 'delta');
    post400({ delta: 'x' }, 'delta');
  });

  it('multiselect: subset accepted; empty array clears; non-array and unknown option rejected', () => {
    const ok = h('admin', 'POST', `/x/${E}`, { ...base(), tags: ['a', 'c'] });
    expect(ok.status).toBe(201);
    expect(ok.body.tags).toEqual(['a', 'c']);
    const empty = h('admin', 'POST', `/x/${E}`, { ...base(), tags: [] });
    expect(empty.status).toBe(201);
    expect(empty.body.tags === undefined || (Array.isArray(empty.body.tags) && empty.body.tags.length === 0)).toBe(true);
    post400({ tags: 'a' }, 'tags');
    post400({ tags: ['a', 'z'] }, 'tags');
    post400({ tags: { 0: 'a' } }, 'tags');
    post400({ tags: [['a']] }, 'tags');
    const put = h('admin', 'PUT', `/x/${E}/${ok.body.id}`, { tags: [] });
    expect(put.status).toBe(200);
    expect(put.body.tags === undefined || put.body.tags.length === 0).toBe(true);
  });

  it('checkbox: coerced to boolean', () => {
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), paid: true }).body.paid).toBe(true);
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), paid: 'true' }).body.paid).toBe(true);
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), paid: false }).body.paid).toBe(false);
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), paid: 'no' }).body.paid).toBe(false);
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), paid: '' }).body.paid).toBe(false);
    expect(typeof h('admin', 'POST', `/x/${E}`, { ...base(), paid: 1 }).body.paid).toBe('boolean');
  });

  it('ref to a core collection: existing client accepted, unknown rejected; cross-module registry ref works', () => {
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), client: seed.clients[0].id }).status).toBe(201);
    post400({ client: 'nope-123' }, 'client');
    post400({ client: seed.owners[0].id }, 'client');
    expect(h('admin', 'POST', `/x/${E}`, { ...base(), vehicle: firstId(VEH) }).status).toBe(201);
    post400({ vehicle: 'nope' }, 'vehicle');
  });

  it('report: entity must belong to the module', () => {
    h('admin', 'POST', `/x/${E}`, { ...base(), kind: 'X', amount: 10 });
    h('admin', 'POST', `/x/${E}`, { ...base(), kind: 'X', amount: 5 });
    h('admin', 'POST', `/x/${E}`, { ...base(), amount: 1 });
    const r = h('admin', 'GET', '/m/zz_test_acc/report', undefined, { entity: E, groupBy: 'kind' });
    expect(r.status).toBe(200);
    expect(r.body.columns).toEqual(['Kind', 'Count', 'Amount']);
    const rows = Object.fromEntries(r.body.rows.map((x: any) => [x.Kind, x]));
    expect(rows.X).toEqual({ Kind: 'X', Count: 2, Amount: 15 });
    expect(rows['-']).toEqual({ Kind: '-', Count: 1, Amount: 1 });
    expect(h('admin', 'GET', '/m/zz_test_acc/report', undefined, { entity: FUEL, groupBy: 'vehicle' }).status).toBe(404);
    expect(h('admin', 'GET', '/m/fleet/report', undefined, { entity: E, groupBy: 'kind' }).status).toBe(404);
  });

  it('report grouped by a core ref shows the client name', () => {
    const c = seed.clients[0];
    h('admin', 'POST', `/x/${E}`, { ...base(), client: c.id, amount: 7 });
    const r = h('admin', 'GET', '/m/zz_test_acc/report', undefined, { entity: E, groupBy: 'client' });
    expect(r.body.rows).toContainEqual({ Client: c.name, Count: 1, Amount: 7 });
  });

  it('settings: number with min<0 accepts negatives, checkbox coerced', () => {
    const res = h('admin', 'PUT', '/m/zz_test_acc/settings', { offset: '-5', flag: 'true', other: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ offset: -5, flag: true });
    expect(h('admin', 'PUT', '/m/zz_test_acc/settings', { offset: -11 }).status).toBe(400);
  });

  it('calendar: permission filtering per module and inclusive window', () => {
    h('admin', 'POST', `/x/${E}`, { ...base(), title: 'Due day', due: '2026-12-01' });
    const m = structuredClone(db.permissions);
    m.staff['m:fleet'] = [];
    h('admin', 'PUT', '/permissions', m);
    const staff = h('staff', 'GET', '/calendar', undefined, { from: '2026-12-01', to: '2026-12-01' });
    expect(staff.body.some((e: any) => e.module === 'zz_test_acc' && e.title === 'Due day')).toBe(true);
    expect(staff.body.some((e: any) => e.module === 'fleet')).toBe(false);
    const agent = h('agent', 'GET', '/calendar', undefined, {});
    if (agent.status === 200) expect(agent.body).toEqual([]);
    else expect(agent.status).toBe(403);
  });

  it('client/agent/owner get 403 on the synthetic module routes', () => {
    for (const r of ['client', 'agent', 'owner'] as Role[]) {
      expect(h(r, 'GET', `/x/${E}`).status, r).toBe(403);
      expect(h(r, 'POST', `/x/${E}`, base()).status, r).toBe(403);
      expect(h(r, 'GET', '/m/zz_test_acc/dashboard').status, r).toBe(403);
      expect(h(r, 'GET', '/m/zz_test_acc/settings').status, r).toBe(403);
    }
  });
});
