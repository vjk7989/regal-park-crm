import type { DB, User } from '../shared/types';

export class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string) { super(message); }
}

export const publicUser = ({ password: _p, ...rest }: User) => rest;

export function login(db: DB, email: string, password: string) {
  const user = db.users.find(u => u.email.toLowerCase() === String(email ?? '').toLowerCase() && u.password === password);
  if (!user || !user.active) throw new HttpError(401, 'Invalid credentials');
  if (user.role === 'broker' && !db.settings.showBrokerPortal) throw new HttpError(403, 'Broker portal disabled');
  return { token: globalThis.crypto.randomUUID(), user: publicUser(user) };
}
