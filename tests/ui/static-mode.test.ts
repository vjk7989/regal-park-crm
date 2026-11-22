// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../data/seed.json';

const seed = seedJson as any;
const BASE = '/regal-park-crm/';
const PW = 'demo123';
const ADMIN = 'admin@regalpark.demo';
const CLIENT = 'client@regalpark.demo';

type ApiMod = typeof import('../../client/api');
type LocalMod = typeof import('../../client/localApi');

let fetchMock: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

const setLocation = (pathname: string) => vi.stubGlobal('location', { pathname, assign });

/** Fresh module graph so localApi's module-level `current` / `memSessions` start empty. */
async function loadApi(staticMode = true): Promise<ApiMod> {
  vi.resetModules();
  vi.stubEnv('VITE_STATIC', staticMode ? '1' : '');
  vi.stubEnv('BASE_URL', BASE);
  return import('../../client/api');
}
async function loadLocal(): Promise<LocalMod> {
  vi.resetModules();
  return import('../../client/localApi');
}

async function loginAs(m: ApiMod, email = ADMIN) {
  const out = await m.api.post<{ token: string; user: any }>('/auth/login', { email, password: PW });
  m.setToken(out.token);
  return out;
}

const storedDb = () => JSON.parse(localStorage.getItem('rp_db')!);
const storedSessions = () => JSON.parse(localStorage.getItem('rp_sessions') ?? '{}');
const VALID_LEAD = { name: 'Static Lead', phone: '9876543210', source: 'Website' };

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  assign = vi.fn();
  setLocation('/regal-park-crm/leads');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('static mode: seeding and storage', () => {
  afterEach(() => expect(fetchMock).not.toHaveBeenCalled());

  it('first use seeds rp_db from data/seed.json with matching counts', async () => {
    expect(localStorage.getItem('rp_db')).toBeNull();
    const m = await loadApi();
    await loginAs(m);
    const db = storedDb();
    for (const k of ['users', 'properties', 'leads', 'requests', 'clients', 'invoices', 'contracts']) {
      expect(db[k].length, k).toBe(seed[k].length);
    }
    expect((await m.api.get<any[]>('/leads')).length).toBe(seed.leads.length);
  });

  it('corrupted rp_db (invalid JSON) falls back to the seed without throwing', async () => {
    localStorage.setItem('rp_db', '{not json');
    const m = await loadApi();
    await expect(loginAs(m)).resolves.toBeTruthy();
    expect(storedDb().leads.length).toBe(seed.leads.length);
    expect((await m.api.get<any[]>('/properties')).length).toBe(seed.properties.length);
  });

  it('corrupted rp_sessions (invalid JSON) does not throw; login still works', async () => {
    localStorage.setItem('rp_sessions', 'garbage{');
    const m = await loadApi();
    const out = await loginAs(m);
    expect(storedSessions()[out.token]).toBe(out.user.id);
  });

  it('localStorage throwing on get/set -> in-memory fallback still serves requests', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { localFetch } = await loadLocal();
    const login = await localFetch('POST', '/auth/login', { email: ADMIN, password: PW });
    expect(login.status).toBe(200);
    const token = login.body.token;
    const leads = await localFetch('GET', '/leads', undefined, token);
    expect(leads.status).toBe(200);
    expect(leads.body.length).toBe(seed.leads.length);
    const created = await localFetch('POST', '/leads', VALID_LEAD, token);
    expect(created.status).toBe(201);
    expect((await localFetch('GET', '/leads', undefined, token)).body.length).toBe(seed.leads.length + 1);
  });

  it('a write (POST /leads) persists to rp_db and survives a module reload', async () => {
    let m = await loadApi();
    await loginAs(m);
    const lead = await m.api.post<any>('/leads', VALID_LEAD);
    expect(storedDb().leads.some((l: any) => l.id === lead.id)).toBe(true);
    m = await loadApi();
    const leads = await m.api.get<any[]>('/leads');
    expect(leads.length).toBe(seed.leads.length + 1);
    expect(leads.some(l => l.id === lead.id)).toBe(true);
  });

  it('seed module object is not mutated by writes (fresh() clones)', async () => {
    const m = await loadApi();
    await loginAs(m);
    await m.api.post('/leads', VALID_LEAD);
    const { default: s2 } = await import('../../data/seed.json');
    expect((s2 as any).leads.length).toBe(seed.leads.length);
  });
});

describe('static mode: auth/session', () => {
  afterEach(() => expect(fetchMock).not.toHaveBeenCalled());

  it('login returns {token,user} without password; rp_sessions holds the token', async () => {
    const m = await loadApi();
    const out = await m.api.post<any>('/auth/login', { email: ADMIN, password: PW });
    expect(typeof out.token).toBe('string');
    expect(out.token.length).toBeGreaterThan(0);
    expect(out.user.email).toBe(ADMIN);
    expect(out.user).not.toHaveProperty('password');
    expect(storedSessions()[out.token]).toBe(out.user.id);
  });

  it('session survives a module reload -> /auth/me works', async () => {
    let m = await loadApi();
    const out = await loginAs(m);
    m = await loadApi();
    const me = await m.api.get<any>('/auth/me');
    expect(me.user.id).toBe(out.user.id);
    expect(me.user).not.toHaveProperty('password');
  });

  it('logout deletes the session (storage and subsequent requests)', async () => {
    const m = await loadApi();
    const out = await loginAs(m);
    await m.api.post('/auth/logout');
    expect(storedSessions()[out.token]).toBeUndefined();
    await expect(m.api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
  });

  it('logout persists across reload (token no longer valid after re-import)', async () => {
    let m = await loadApi();
    const out = await loginAs(m);
    await m.api.post('/auth/logout');
    m = await loadApi();
    m.setToken(out.token);
    await expect(m.api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
  });

  it('wrong password -> 401 error, no redirect, existing token kept', async () => {
    const m = await loadApi();
    m.setToken('prev-token');
    await expect(m.api.post('/auth/login', { email: ADMIN, password: 'nope' })).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
    expect(m.getToken()).toBe('prev-token');
  });

  it('empty login body -> 401, no throw from core', async () => {
    const m = await loadApi();
    await expect(m.api.post('/auth/login')).rejects.toMatchObject({ status: 401 });
  });

  it('401 on other paths clears token and redirects to BASE_URL + "login"', async () => {
    const m = await loadApi();
    m.setToken('bogus');
    await expect(m.api.get('/leads')).rejects.toMatchObject({ status: 401 });
    expect(m.getToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith('/regal-park-crm/login');
  });

  it('401 while already on the login page clears token but does not redirect', async () => {
    setLocation('/regal-park-crm/login');
    const m = await loadApi();
    m.setToken('bogus');
    await expect(m.api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(m.getToken()).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('no token at all -> 401 and redirect', async () => {
    const m = await loadApi();
    await expect(m.api.get('/dashboard')).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith('/regal-park-crm/login');
  });
});

describe('static mode: admin reset', () => {
  afterEach(() => expect(fetchMock).not.toHaveBeenCalled());

  it('POST /admin/reset restores seed counts; later writes land in the new db and persist', async () => {
    let m = await loadApi();
    await loginAs(m);
    await m.api.post('/leads', VALID_LEAD);
    await m.api.post('/leads', { ...VALID_LEAD, name: 'Second' });
    expect(storedDb().leads.length).toBe(seed.leads.length + 2);

    await m.api.post('/admin/reset');
    expect(storedDb().leads.length).toBe(seed.leads.length);
    expect((await m.api.get<any[]>('/leads')).length).toBe(seed.leads.length);
    // session must survive reset (sessions are stored separately)
    expect((await m.api.get<any>('/auth/me')).user.email).toBe(ADMIN);

    const after = await m.api.post<any>('/leads', { ...VALID_LEAD, name: 'After reset' });
    expect((await m.api.get<any[]>('/leads')).length).toBe(seed.leads.length + 1);
    expect(storedDb().leads.length).toBe(seed.leads.length + 1);
    expect(storedDb().leads.some((l: any) => l.id === after.id)).toBe(true);

    m = await loadApi();
    expect((await m.api.get<any[]>('/leads')).length).toBe(seed.leads.length + 1);
  });

  it('reset after a reset still yields pristine seed (seed not mutated by prior writes)', async () => {
    const m = await loadApi();
    await loginAs(m);
    await m.api.post('/admin/reset');
    await m.api.post('/leads', VALID_LEAD);
    await m.api.post('/admin/reset');
    expect((await m.api.get<any[]>('/leads')).length).toBe(seed.leads.length);
  });

  it('non-admin reset -> 403 and data untouched', async () => {
    let m = await loadApi();
    await loginAs(m);
    await m.api.post('/leads', VALID_LEAD);
    m = await loadApi();
    await loginAs(m, 'sales@regalpark.demo');
    await expect(m.api.post('/admin/reset')).rejects.toMatchObject({ status: 403 });
    expect(storedDb().leads.length).toBe(seed.leads.length + 1);
  });
});

describe('static mode: query strings', () => {
  afterEach(() => expect(fetchMock).not.toHaveBeenCalled());

  it('/requests?kind=rent returns only rent requests', async () => {
    const m = await loadApi();
    await loginAs(m);
    const rows = await m.api.get<any[]>('/requests?kind=rent');
    const expected = seed.requests.filter((r: any) => r.kind === 'rent').length;
    expect(expected).toBeGreaterThan(0);
    expect(rows.length).toBe(expected);
    expect(rows.every(r => r.kind === 'rent')).toBe(true);
    const buy = await m.api.get<any[]>('/requests?kind=buy');
    expect(buy.every(r => r.kind === 'buy')).toBe(true);
    expect(buy.length + rows.length).toBe(seed.requests.length);
  });

  it('/requests with no query returns all', async () => {
    const m = await loadApi();
    await loginAs(m);
    expect((await m.api.get<any[]>('/requests')).length).toBe(seed.requests.length);
  });

  it('/dashboard?period=month filters leads to this month (differs from no period)', async () => {
    const m = await loadApi();
    await loginAs(m);
    const total = (d: any) => d.leadsBySource.reduce((a: number, x: any) => a + x.value, 0);
    const all = await m.api.get<any>('/dashboard');
    const month = await m.api.get<any>('/dashboard?period=month');
    const from = `${new Date().toISOString().slice(0, 7)}-01`;
    const expected = seed.leads.filter((l: any) => l.createdAt.slice(0, 10) >= from).length;
    expect(total(all)).toBe(seed.leads.length);
    expect(total(month)).toBe(expected);
  });

  it('empty query string ("/requests?") is tolerated', async () => {
    const m = await loadApi();
    await loginAs(m);
    expect((await m.api.get<any[]>('/requests?')).length).toBe(seed.requests.length);
  });
});

describe('static mode: RBAC and errors', () => {
  afterEach(() => expect(fetchMock).not.toHaveBeenCalled());

  it('client GET /leads -> Error with status 403', async () => {
    const m = await loadApi();
    await loginAs(m, CLIENT);
    const err = await m.api.get('/leads').catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(assign).not.toHaveBeenCalled();
    expect(m.getToken()).not.toBeNull();
  });

  it('client GET /properties -> only approved + public', async () => {
    const m = await loadApi();
    await loginAs(m, CLIENT);
    const rows = await m.api.get<any[]>('/properties');
    const expected = seed.properties.filter((p: any) => p.approval === 'approved' && p.listingPrivacy === 'public').length;
    expect(expected).toBeLessThan(seed.properties.length);
    expect(rows.length).toBe(expected);
    expect(rows.every(p => p.approval === 'approved' && p.listingPrivacy === 'public')).toBe(true);
  });

  it('lead with bad phone -> 400 Error carrying .status and .field "phone"', async () => {
    const m = await loadApi();
    await loginAs(m);
    const err = await m.api.post('/leads', { ...VALID_LEAD, phone: '123' }).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.field).toBe('phone');
    expect(err.message).toMatch(/phone/);
    expect(storedDb().leads.length).toBe(seed.leads.length);
  });

  it('lead missing name -> 400 field "name"', async () => {
    const m = await loadApi();
    await loginAs(m);
    await expect(m.api.post('/leads', { phone: '9876543210' })).rejects.toMatchObject({ status: 400, field: 'name' });
  });

  it('unknown collection -> 404 Error with status', async () => {
    const m = await loadApi();
    await loginAs(m);
    await expect(m.api.get('/nope')).rejects.toMatchObject({ status: 404 });
  });

  it('users list never exposes passwords in static mode', async () => {
    const m = await loadApi();
    await loginAs(m);
    const users = await m.api.get<any[]>('/users');
    expect(users.length).toBe(seed.users.length);
    expect(users.every(u => !('password' in u))).toBe(true);
  });
});

describe('non-static mode (regression)', () => {
  it('uses global fetch with /api prefix and does not touch rp_db', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '[]' });
    const m = await loadApi(false);
    m.setToken('tok');
    await m.api.get('/leads');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/leads');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(localStorage.getItem('rp_db')).toBeNull();
    expect(localStorage.getItem('rp_sessions')).toBeNull();
  });

  it('401 in non-static mode also redirects to BASE_URL + "login"', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"Unauthorized"}' });
    const m = await loadApi(false);
    m.setToken('tok');
    await expect(m.api.get('/leads')).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith('/regal-park-crm/login');
  });
});

describe('static mode: stale stored db is discarded (seedVersion / x)', () => {
  afterEach(() => expect(fetchMock).not.toHaveBeenCalled());

  const OLD_TOKEN = 'old-tok';
  /** A stored db that differs from the seed (1 lead only) so a reseed is observable by counts. */
  const plant = (mutate: (db: any) => void) => {
    const db = structuredClone(seed);
    db.leads = db.leads.slice(0, 1);
    mutate(db);
    localStorage.setItem('rp_db', JSON.stringify(db));
    localStorage.setItem('rp_sessions', JSON.stringify({ [OLD_TOKEN]: seed.users[0].id }));
    localStorage.setItem('rp_token', OLD_TOKEN);
  };
  const expectReseeded = () => {
    const db = storedDb();
    expect(db.seedVersion).toBe(seed.seedVersion);
    expect(db.x).toBeTruthy();
    expect(db.leads.length).toBe(seed.leads.length);
    expect(db.users.length).toBe(seed.users.length);
  };

  it('old seedVersion -> reseeded and token/sessions cleared; first /auth/me with the old token is 401', async () => {
    plant(db => { db.seedVersion = 'deadbeef0000'; });
    const m = await loadApi();
    await expect(m.api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expectReseeded();
    expect(storedSessions()[OLD_TOKEN]).toBeUndefined();
    expect(m.getToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith('/regal-park-crm/login');
  });

  it('old seedVersion -> login gives a fresh session; old token stays dead and is not re-persisted', async () => {
    plant(db => { db.seedVersion = 'deadbeef0000'; });
    const m = await loadApi();
    const out = await m.api.post<any>('/auth/login', { email: ADMIN, password: PW });
    expectReseeded();
    expect(storedSessions()).toEqual({ [out.token]: out.user.id });
    m.setToken(OLD_TOKEN);
    await expect(m.api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
  });

  it('matching seedVersion -> stored db kept; a user write survives a module reload', async () => {
    plant(() => {});
    let m = await loadApi();
    m.setToken(null);
    await loginAs(m);
    expect((await m.api.get<any[]>('/leads')).length).toBe(1); // planted db kept, not reseeded
    const lead = await m.api.post<any>('/leads', VALID_LEAD);
    m = await loadApi();
    const leads = await m.api.get<any[]>('/leads');
    expect(leads.length).toBe(2);
    expect(leads.some(l => l.id === lead.id)).toBe(true);
    expect(storedDb().seedVersion).toBe(seed.seedVersion);
  });

  it('matching seedVersion -> existing session is kept across reload', async () => {
    plant(() => {});
    const m = await loadApi();
    expect((await m.api.get<any>('/auth/me')).user.id).toBe(seed.users[0].id);
    expect(m.getToken()).toBe(OLD_TOKEN);
  });

  it('stored db without x (pre-module) -> reseeded, sessions cleared', async () => {
    plant(db => { delete db.x; });
    const m = await loadApi();
    await expect(m.api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expectReseeded();
    expect(storedSessions()[OLD_TOKEN]).toBeUndefined();
  });

  it('stored db without seedVersion -> reseeded, sessions cleared', async () => {
    plant(db => { delete db.seedVersion; });
    const m = await loadApi();
    await expect(m.api.get('/auth/me')).rejects.toMatchObject({ status: 401 });
    expectReseeded();
    expect(storedSessions()[OLD_TOKEN]).toBeUndefined();
  });

  it('corrupted rp_db still falls back to the seed (with seedVersion and x)', async () => {
    localStorage.setItem('rp_db', '{"seedVersion":');
    const m = await loadApi();
    await loginAs(m);
    expectReseeded();
  });

  it('reset still works after a stale-db reseed and keeps seedVersion', async () => {
    plant(db => { db.seedVersion = 'deadbeef0000'; });
    const m = await loadApi();
    m.setToken(null);
    await loginAs(m);
    await m.api.post('/leads', VALID_LEAD);
    expect(storedDb().leads.length).toBe(seed.leads.length + 1);
    await m.api.post('/admin/reset');
    expectReseeded();
    expect((await m.api.get<any[]>('/leads')).length).toBe(seed.leads.length);
  });
});
