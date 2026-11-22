// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getToken, setToken } from '../../client/api';

const res = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

let fetchMock: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  assign = vi.fn();
  vi.stubGlobal('location', { pathname: '/leads', assign });
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('token storage', () => {
  it('setToken/getToken use localStorage "rp_token"; setToken(null) removes it', () => {
    expect(getToken()).toBeNull();
    setToken('abc');
    expect(localStorage.getItem('rp_token')).toBe('abc');
    expect(getToken()).toBe('abc');
    setToken(null);
    expect(localStorage.getItem('rp_token')).toBeNull();
  });

  it('setToken("") removes rather than storing an empty token', () => {
    setToken('abc');
    setToken('');
    expect(localStorage.getItem('rp_token')).toBeNull();
  });
});

describe('request headers / body', () => {
  it('sends Bearer token from localStorage "rp_token"', async () => {
    localStorage.setItem('rp_token', 'tok-1');
    fetchMock.mockResolvedValue(res(200, '{"ok":true}'));
    await api.get('/leads');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/leads');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('sends no Authorization header when not logged in', async () => {
    fetchMock.mockResolvedValue(res(200, '[]'));
    await api.get('/x');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('post/put send JSON body with Content-Type; post without body sends {}', async () => {
    fetchMock.mockResolvedValue(res(200, '{}'));
    await api.post('/a', { x: 1 });
    await api.put('/b', { y: 'z' });
    await api.post('/c');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"x":1}', headers: { 'Content-Type': 'application/json' } });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: '{"y":"z"}' });
    expect(fetchMock.mock.calls[2][1].body).toBe('{}');
  });

  it('del uses DELETE with no body', async () => {
    fetchMock.mockResolvedValue(res(204, ''));
    await api.del('/leads/1');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE', body: undefined });
  });
});

describe('responses', () => {
  it('returns parsed JSON on 2xx', async () => {
    fetchMock.mockResolvedValue(res(200, '{"a":[1,2]}'));
    await expect(api.get('/x')).resolves.toEqual({ a: [1, 2] });
  });

  it('returns null on empty 2xx body (204)', async () => {
    fetchMock.mockResolvedValue(res(204, ''));
    await expect(api.del('/x')).resolves.toBeNull();
  });

  it('non-2xx throws Error with server {error} message, status and field', async () => {
    fetchMock.mockResolvedValue(res(400, '{"error":"Email is required","field":"email"}'));
    const err = await api.post('/leads', {}).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Email is required');
    expect(err.status).toBe(400);
    expect(err.field).toBe('email');
  });

  it('non-JSON error body falls back to "Request failed (status)"', async () => {
    fetchMock.mockResolvedValue(res(500, '<html>Internal Server Error</html>'));
    await expect(api.get('/x')).rejects.toThrow('Request failed (500)');
  });

  it('empty error body falls back to "Request failed (status)"', async () => {
    fetchMock.mockResolvedValue(res(404, ''));
    await expect(api.get('/x')).rejects.toThrow('Request failed (404)');
  });

  it('JSON error body without "error" key falls back to generic message', async () => {
    fetchMock.mockResolvedValue(res(422, '{"message":"x"}'));
    await expect(api.get('/x')).rejects.toThrow('Request failed (422)');
  });

  it('network failure (fetch rejects) propagates as rejection', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/x')).rejects.toThrow('Failed to fetch');
  });
});

describe('401 handling', () => {
  it('401 clears token and redirects to /login, still throws server message', async () => {
    localStorage.setItem('rp_token', 'expired');
    fetchMock.mockResolvedValue(res(401, '{"error":"Not authenticated"}'));
    await expect(api.get('/leads')).rejects.toThrow('Not authenticated');
    expect(localStorage.getItem('rp_token')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('401 while already on /login clears token but does not redirect again', async () => {
    vi.stubGlobal('location', { pathname: '/login', assign });
    localStorage.setItem('rp_token', 'expired');
    fetchMock.mockResolvedValue(res(401, ''));
    await expect(api.get('/auth/me')).rejects.toThrow('Request failed (401)');
    expect(localStorage.getItem('rp_token')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('401 from /auth/login (bad credentials) does not clear token or redirect', async () => {
    localStorage.setItem('rp_token', 'keep');
    fetchMock.mockResolvedValue(res(401, '{"error":"Invalid email or password"}'));
    await expect(api.post('/auth/login', { email: 'a', password: 'b' })).rejects.toThrow('Invalid email or password');
    expect(localStorage.getItem('rp_token')).toBe('keep');
    expect(assign).not.toHaveBeenCalled();
  });

  it('403 does not clear token', async () => {
    localStorage.setItem('rp_token', 'keep');
    fetchMock.mockResolvedValue(res(403, '{"error":"Forbidden"}'));
    await expect(api.get('/settings')).rejects.toThrow('Forbidden');
    expect(localStorage.getItem('rp_token')).toBe('keep');
    expect(assign).not.toHaveBeenCalled();
  });
});
