import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { call, emailOf, login, PASSWORD, ROLES, seed, seedUser, startServer, type Server } from './helpers';

let s: Server;
beforeAll(async () => { s = await startServer(); });
beforeEach(() => { s.reset(); });
afterAll(() => s.cleanup());

const noPassword = (body: unknown) => expect(JSON.stringify(body)).not.toMatch(/"password"/);

describe('createApp', () => {
  it('is exported from server/routes and returns an app without listening', async () => {
    expect(typeof s.app).toBe('function');
    const res = await request(s.app).post('/api/auth/login').send({ email: emailOf('admin'), password: PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/login', () => {
  it.each(ROLES)('%s demo user logs in and gets {token,user} without password', async role => {
    const res = await request(s.app).post('/api/auth/login').send({ email: emailOf(role), password: PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(res.body.user.id).toBe(seedUser(role).id);
    expect(res.body.user.role).toBe(role);
    expect(res.body.user).not.toHaveProperty('password');
    noPassword(res.body);
  });

  it('wrong password -> 401', async () => {
    const res = await request(s.app).post('/api/auth/login').send({ email: emailOf('admin'), password: 'demo124' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('unknown email -> 401', async () => {
    const res = await request(s.app).post('/api/auth/login').send({ email: 'nobody@regalpark.demo', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('empty body / null fields -> 401 (not 500)', async () => {
    expect((await request(s.app).post('/api/auth/login').send({})).status).toBe(401);
    expect((await request(s.app).post('/api/auth/login').send({ email: null, password: null })).status).toBe(401);
    expect((await request(s.app).post('/api/auth/login').send({ email: emailOf('admin'), password: '' })).status).toBe(401);
  });

  it('inactive user -> 401, and an existing token of a deactivated user stops working', async () => {
    const admin = await login(s.app, 'admin');
    const agentToken = await login(s.app, 'agent');
    const agent = seedUser('agent');
    const put = await call(s.app, admin, 'put', `/api/users/${agent.id}`, { active: false });
    expect(put.status).toBe(200);
    const res = await request(s.app).post('/api/auth/login').send({ email: emailOf('agent'), password: PASSWORD });
    expect(res.status).toBe(401);
    expect((await call(s.app, agentToken, 'get', '/api/auth/me')).status).toBe(401);
  });

  it('broker login refused with 403 when settings.showBrokerPortal=false, allowed again when true', async () => {
    const admin = await login(s.app, 'admin');
    expect((await call(s.app, admin, 'put', '/api/settings', { showBrokerPortal: false })).status).toBe(200);
    const res = await request(s.app).post('/api/auth/login').send({ email: emailOf('broker'), password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/broker portal disabled/i);
    // other roles unaffected
    expect((await request(s.app).post('/api/auth/login').send({ email: emailOf('agent'), password: PASSWORD })).status).toBe(200);
    expect((await call(s.app, admin, 'put', '/api/settings', { showBrokerPortal: true })).status).toBe(200);
    expect((await request(s.app).post('/api/auth/login').send({ email: emailOf('broker'), password: PASSWORD })).status).toBe(200);
  });

  it('broker with wrong password while portal disabled still gets 401 (credentials checked first)', async () => {
    const admin = await login(s.app, 'admin');
    await call(s.app, admin, 'put', '/api/settings', { showBrokerPortal: false });
    const res = await request(s.app).post('/api/auth/login').send({ email: emailOf('broker'), password: 'nope' });
    expect(res.status).toBe(401);
  });
});

describe('bearer token handling', () => {
  it('GET /auth/me returns the current user without password', async () => {
    const t = await login(s.app, 'owner');
    const res = await call(s.app, t, 'get', '/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(seedUser('owner').id);
    noPassword(res.body);
  });

  it('missing Authorization header -> 401', async () => {
    expect((await request(s.app).get('/api/auth/me')).status).toBe(401);
    expect((await request(s.app).get('/api/properties')).status).toBe(401);
  });

  it('garbage / malformed Bearer token -> 401', async () => {
    for (const h of ['Bearer garbage-token', 'Bearer ', 'Bearer', 'Basic abc', 'garbage']) {
      const res = await request(s.app).get('/api/auth/me').set('Authorization', h);
      expect(res.status, h).toBe(401);
    }
  });

  it('logout invalidates the token but not other sessions', async () => {
    const t1 = await login(s.app, 'staff');
    const t2 = await login(s.app, 'staff');
    expect((await call(s.app, t1, 'post', '/api/auth/logout')).status).toBe(200);
    expect((await call(s.app, t1, 'get', '/api/auth/me')).status).toBe(401);
    expect((await call(s.app, t1, 'get', '/api/leads')).status).toBe(401);
    expect((await call(s.app, t2, 'get', '/api/auth/me')).status).toBe(200);
  });

  it('logout without a token -> 401', async () => {
    expect((await request(s.app).post('/api/auth/logout')).status).toBe(401);
  });
});

describe('passwords are never returned', () => {
  it('GET /users list and GET /users/:id', async () => {
    const admin = await login(s.app, 'admin');
    const list = await call(s.app, admin, 'get', '/api/users');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(seed.users.length);
    noPassword(list.body);
    const one = await call(s.app, admin, 'get', `/api/users/${seed.users[1].id}`);
    expect(one.status).toBe(200);
    noPassword(one.body);
  });

  it('POST /users (with password) returns no password, and the new user can log in with it', async () => {
    const admin = await login(s.app, 'admin');
    const res = await call(s.app, admin, 'post', '/api/users', { name: 'New Person', email: 'new.person@regalpark.demo', role: 'staff', password: 'Secret#1' });
    expect(res.status).toBe(201);
    noPassword(res.body);
    const lg = await request(s.app).post('/api/auth/login').send({ email: 'new.person@regalpark.demo', password: 'Secret#1' });
    expect(lg.status).toBe(200);
    noPassword(lg.body);
  });

  it('PUT /users/:id returns no password; blank password is ignored; non-blank password changes it', async () => {
    const admin = await login(s.app, 'admin');
    const u = seedUser('agent');
    const r1 = await call(s.app, admin, 'put', `/api/users/${u.id}`, { name: 'Renamed Agent', password: '' });
    expect(r1.status).toBe(200);
    noPassword(r1.body);
    expect(r1.body.name).toBe('Renamed Agent');
    expect((await request(s.app).post('/api/auth/login').send({ email: u.email, password: PASSWORD })).status).toBe(200);

    const r2 = await call(s.app, admin, 'put', `/api/users/${u.id}`, { password: '   ' });
    expect(r2.status).toBe(200);
    expect((await request(s.app).post('/api/auth/login').send({ email: u.email, password: PASSWORD })).status).toBe(200);

    const r3 = await call(s.app, admin, 'put', `/api/users/${u.id}`, { password: 'Changed1' });
    expect(r3.status).toBe(200);
    noPassword(r3.body);
    expect((await request(s.app).post('/api/auth/login').send({ email: u.email, password: PASSWORD })).status).toBe(401);
    expect((await request(s.app).post('/api/auth/login').send({ email: u.email, password: 'Changed1' })).status).toBe(200);
  });

  it('users collection is admin-only (settings module)', async () => {
    for (const role of ['staff', 'agent', 'broker', 'owner', 'client'] as const) {
      const t = await login(s.app, role);
      expect((await call(s.app, t, 'get', '/api/users')).status, role).toBe(403);
      expect((await call(s.app, t, 'get', `/api/users/${seed.users[0].id}`)).status, role).toBe(403);
    }
  });
});
