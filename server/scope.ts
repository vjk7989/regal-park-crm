import { can } from '../shared/permissions';
import { moduleFor } from '../shared/types';
import type { DB, User } from '../shared/types';

type Rec = Record<string, any>;
const OWNER_FIELD = { agent: 'agentId', broker: 'brokerId', owner: 'ownerId' } as const;

/** Records of `col` this user may see (the per-role "own" rules from PLAN §4). */
export function scopedList(db: DB, user: User, col: string): Rec[] {
  const all = ((db as unknown as Rec)[col] ?? []) as Rec[];
  const role = user.role;
  if (col === 'requests') {
    // a role may only see the kinds it has the module for
    return scopedBy(db, user, col, all).filter(r => can(db.permissions, role, moduleFor('requests', r.kind)!, 'view'));
  }
  return scopedBy(db, user, col, all);
}

function scopedBy(db: DB, user: User, col: string, all: Rec[]): Rec[] {
  const role = user.role;
  if (role === 'admin' || role === 'staff') return all;
  if (role === 'client') {
    if (col === 'properties') return all.filter(p => p.approval === 'approved' && p.listingPrivacy === 'public');
    if (['requests', 'tenants', 'invoices', 'contracts'].includes(col)) return all.filter(r => r.clientId === user.linkedId);
    return all;
  }
  const field = OWNER_FIELD[role];
  const own = new Set(db.properties.filter(p => p[field] === user.linkedId).map(p => p.id));
  if (col === 'properties') return all.filter(p => own.has(p.id));
  if (col === 'leads') return all.filter(l => l.assignedTo === user.id);
  if (['requests', 'tenants', 'invoices', 'contracts'].includes(col)) return all.filter(r => own.has(r.propertyId));
  return all;
}

/** Field that ties a newly created record to its creator, so it stays inside their scope. */
export const ownerFieldFor = (role: User['role']) => OWNER_FIELD[role as keyof typeof OWNER_FIELD];
