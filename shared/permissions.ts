import type { Action, Module, PermissionMatrix, Role } from './types';

const V: Action[] = ['view'];
const VC: Action[] = ['view', 'create'];
const VE: Action[] = ['view', 'edit'];
const VCE: Action[] = ['view', 'create', 'edit'];
const VCED: Action[] = ['view', 'create', 'edit', 'delete'];

export const DEFAULT_PERMISSIONS: PermissionMatrix = {
  admin: {
    dashboard: [...V], properties: [...VCED], approvals: [...VCED], leads: [...VCED], owners: [...VCED], staff: [...VCED],
    agents: [...VCED], brokers: [...VCED], clients: [...VCED], buyRequests: [...VCED], rentRequests: [...VCED], tenants: [...VCED],
    invoices: [...VCED], contracts: [...VCED], reports: [...V], settings: [...VCED],
  },
  staff: {
    dashboard: [...V], properties: [...VCE], approvals: [...V], leads: [...VCED], owners: [...VCE], agents: [...V], brokers: [...V],
    clients: [...VCE], buyRequests: [...VCE], rentRequests: [...VCE], tenants: [...V], invoices: [...VCE], contracts: [...VCE], reports: [...V],
  },
  agent: {
    dashboard: [...V], properties: [...VCE], leads: [...VE], clients: [...V], buyRequests: [...V], rentRequests: [...V],
  },
  broker: {
    dashboard: [...V], properties: [...VCE], leads: [...VCE], owners: [...VC], clients: [...V], buyRequests: [...VCE],
    invoices: [...V], contracts: [...V],
  },
  owner: {
    dashboard: [...V], properties: [...VCE], buyRequests: [...V], rentRequests: [...V], tenants: [...V], invoices: [...V], contracts: [...V],
  },
  client: {
    dashboard: [...V], properties: [...V], buyRequests: [...VC], rentRequests: [...VC], tenants: [...V], invoices: [...V], contracts: [...V],
  },
};

export function can(matrix: PermissionMatrix, role: Role, module: Module, action: Action): boolean {
  if (role === 'admin' && module === 'settings') return true;
  if (!Object.hasOwn(matrix, role)) return false;
  const mods = matrix[role];
  if (!Object.hasOwn(mods, module)) return false;
  const acts = mods[module];
  return Array.isArray(acts) && acts.includes(action);
}
