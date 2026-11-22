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
    // A db from an older seed (different seedVersion, or pre-module without `x`) is discarded together with its sessions.
    if (current && ((current as unknown as { seedVersion?: string }).seedVersion !== (seed as { seedVersion?: string }).seedVersion || !current.x)) {
      current = null;
      memSessions = {};
      try { localStorage.removeItem(SESSIONS_KEY); localStorage.removeItem('rp_token'); } catch { /* ignore */ }
    }
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
  load(); // version check first: stale sessions must be cleared before any session lookup
  const [p, qs = ''] = path.split('?');
  const query: CoreRequest['query'] = {};
  new URLSearchParams(qs).forEach((v, k) => {
    const prev = query[k];
    query[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  });
  return handleRequest(store, { method, path: p, query, body, token: token ?? undefined });
}
