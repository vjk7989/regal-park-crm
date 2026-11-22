const TOKEN_KEY = 'rp_token';

let memToken: string | null = null; // fallback when localStorage is blocked

export const getToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return memToken; }
};
export const setToken = (t: string | null) => {
  memToken = t;
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* in-memory only */ }
};

const STATIC = import.meta.env.VITE_STATIC === '1';

async function send(method: string, path: string, body: unknown, token: string | null): Promise<{ ok: boolean; status: number; data: any }> {
  if (STATIC) {
    const { localFetch } = await import('./localApi');
    const r = await localFetch(method, path, body, token);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, data: r.body ?? null };
  }
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { ok, status, data } = await send(method, path, body, getToken());
  if (!ok) {
    if (status === 401 && path !== '/auth/login') {
      setToken(null);
      const login = `${import.meta.env.BASE_URL}login`;
      if (location.pathname !== login) location.assign(login);
    }
    const err = new Error(data?.error ?? `Request failed (${status})`) as Error & { status?: number; field?: string };
    err.status = status;
    err.field = data?.field;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T = any>(path: string) => request<T>('DELETE', path),
};
