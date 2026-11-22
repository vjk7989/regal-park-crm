import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { vi } from 'vitest';
import type { Express } from 'express';

export type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';
export const ROLES: Role[] = ['admin', 'staff', 'agent', 'broker', 'owner', 'client'];

export const REPO_DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
export const REPO_SEED = path.join(REPO_DATA, 'seed.json');
/** Pristine seed, used to look up ids (never hard-code them). */
export const seed: any = JSON.parse(fs.readFileSync(REPO_SEED, 'utf8'));

export const PASSWORD = 'demo123';
export const emailOf = (role: Role) => `${role === 'staff' ? 'sales' : role}@regalpark.demo`;
export const seedUser = (role: Role) => seed.users.find((u: any) => u.email === emailOf(role));

const OWN_FIELD: Partial<Record<Role, string>> = { agent: 'agentId', broker: 'brokerId', owner: 'ownerId' };
/** Seed property ids owned by an agent/broker/owner demo user. */
export function ownPropertyIds(role: Role): Set<string> {
  const f = OWN_FIELD[role]!;
  const linked = seedUser(role).linkedId;
  return new Set(seed.properties.filter((p: any) => p[f] === linked).map((p: any) => p.id));
}

export interface Server { app: Express; dir: string; reset: () => unknown; cleanup: () => void }

/** Fresh temp DATA_DIR with a copy of seed.json, then a fresh module graph of the server. */
export async function startServer(): Promise<Server> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regal-api-'));
  fs.copyFileSync(REPO_SEED, path.join(dir, 'seed.json'));
  process.env.DATA_DIR = dir;
  vi.resetModules();
  const routes = await import('../../server/routes');
  const store = await import('../../server/store');
  store.reset();
  const app = routes.createApp() as Express;
  return { app, dir, reset: store.reset, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

type Method = 'get' | 'post' | 'put' | 'delete';
export function call(app: Express, token: string | null, method: Method, url: string, body?: unknown) {
  let r = request(app)[method](url);
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  return body === undefined ? r : r.send(body as object);
}

export async function login(app: Express, role: Role): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email: emailOf(role), password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${role} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

export async function loginAll(app: Express): Promise<Record<Role, string>> {
  const out = {} as Record<Role, string>;
  for (const r of ROLES) out[r] = await login(app, r);
  return out;
}

export const readDbFile = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
