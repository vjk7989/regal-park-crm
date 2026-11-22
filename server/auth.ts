import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '../shared/types';
import { getDb } from './store';

export class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string) { super(message); }
}

const tokens = new Map<string, string>(); // token -> user id

export const publicUser = ({ password: _p, ...rest }: User) => rest;

export function login(email: string, password: string) {
  const db = getDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(email ?? '').toLowerCase() && u.password === password);
  if (!user || !user.active) throw new HttpError(401, 'Invalid credentials');
  if (user.role === 'broker' && !db.settings.showBrokerPortal) throw new HttpError(403, 'Broker portal disabled');
  const token = randomUUID();
  tokens.set(token, user.id);
  return { token, user: publicUser(user) };
}

export const logout = (req: Request) => tokens.delete(tokenOf(req) ?? '');

const tokenOf = (req: Request) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];

/** Resolves the bearer token to a live user and stores it in res.locals.user. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const id = tokens.get(tokenOf(req) ?? '');
  const user = id && getDb().users.find(u => u.id === id && u.active);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.locals.user = user;
  next();
}

export const me = (res: Response) => res.locals.user as User;
