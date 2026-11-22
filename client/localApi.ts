import seed from '../data/seed.json';
import { handleRequest, type CoreRequest, type Sessions, type Store } from '../server/core';
import type { DB } from '../shared/types';

const DB_KEY = 'rp_db';
const SESSIONS_KEY = 'rp_sessions';

const fresh = (): DB => structuredClone(seed) as unknown as DB;
const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* in-memory fallback */ } };

let current: DB | null = null;
let memSessions: Record<string, string> | null = null;

function load(): DB {
  if (current) return current;
  const raw = read(DB_KEY);
  if (raw) {
    try { current = JSON.parse(raw) as DB; } catch { current = null; }
  }
  if (!current) {
    current = fresh();
    write(DB_KEY, JSON.stringify(current));
  }
  return current;
}

function sessionMap(): Record<string, string> {
  if (!memSessions) {
    try { memSessions = JSON.parse(read(SESSIONS_KEY) ?? '{}') ?? {}; } catch { memSessions = {}; }
  }
  return memSessions!;
}
const saveSessions = () => write(SESSIONS_KEY, JSON.stringify(sessionMap()));

const sessions: Sessions = {
  get: token => sessionMap()[token],
  set: (token, userId) => { sessionMap()[token] = userId; saveSessions(); },
  delete: token => { delete sessionMap()[token]; saveSessions(); },
};

const store: Store = {
  db: load,
  save: () => write(DB_KEY, JSON.stringify(load())),
  reset: () => {
    current = fresh();
    write(DB_KEY, JSON.stringify(current));
    return current;
  },
  sessions,
};

export async function localFetch(method: string, path: string, body: unknown, token?: string | null): Promise<{ status: number; body: any }> {
  const [p, qs = ''] = path.split('?');
  const query: CoreRequest['query'] = {};
  new URLSearchParams(qs).forEach((v, k) => {
    const prev = query[k];
    query[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  });
  return handleRequest(store, { method, path: p, query, body, token: token ?? undefined });
}
