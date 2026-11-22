import { describe, expect, it } from 'vitest';
import { can, DEFAULT_PERMISSIONS } from '../../shared/permissions';
import {
  COLLECTION_MODULE, LEAD_SOURCES, LEAD_STATUSES, MODULES, moduleFor, PROPERTY_STATUSES, REQUEST_STATUSES, ROLE_LABELS, ROLES,
} from '../../shared/types';
import type { Action, Module, PermissionMatrix, Role } from '../../shared/types';

const ACTIONS: Action[] = ['view', 'create', 'edit', 'delete'];
const ALL_MODULES: Module[] = ['dashboard', 'properties', 'approvals', 'leads', 'owners', 'staff', 'agents', 'brokers', 'clients',
  'buyRequests', 'rentRequests', 'tenants', 'invoices', 'contracts', 'reports', 'settings'];
const ALL_ROLES: Role[] = ['admin', 'staff', 'agent', 'broker', 'owner', 'client'];

// PLAN §4 table transcribed verbatim. Column order: admin, staff, agent, broker, owner, client. '' = –
const TABLE: Record<Module, [string, string, string, string, string, string]> = {
  dashboard: ['V', 'V', 'V', 'V', 'V', 'V'],
  properties: ['VCED', 'VCE', 'VCE', 'VCE', 'VCE', 'V'],
  approvals: ['VCED', 'V', '', '', '', ''],
  leads: ['VCED', 'VCED', 'VE', 'VCE', '', ''],
  owners: ['VCED', 'VCE', '', 'VC', '', ''],
  staff: ['VCED', '', '', '', '', ''],
  agents: ['VCED', 'V', '', '', '', ''],
  brokers: ['VCED', 'V', '', '', '', ''],
  clients: ['VCED', 'VCE', 'V', 'V', '', ''],
  buyRequests: ['VCED', 'VCE', 'V', 'VCE', 'V', 'VC'],
  rentRequests: ['VCED', 'VCE', 'V', '', 'V', 'VC'],
  tenants: ['VCED', 'V', '', '', 'V', 'V'],
  invoices: ['VCED', 'VCE', '', 'V', 'V', 'V'],
  contracts: ['VCED', 'VCE', '', 'V', 'V', 'V'],
  reports: ['V', 'V', '', '', '', ''],
  settings: ['VCED', '', '', '', '', ''],
};
const LETTER: Record<Action, string> = { view: 'V', create: 'C', edit: 'E', delete: 'D' };
const expected = (role: Role, module: Module, action: Action) =>
  TABLE[module][ALL_ROLES.indexOf(role)].includes(LETTER[action]);

const cells: [Role, Module, Action, boolean][] = [];
for (const r of ALL_ROLES) for (const m of ALL_MODULES) for (const a of ACTIONS) cells.push([r, m, a, expected(r, m, a)]);

const clone = (): PermissionMatrix => JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));

describe('DEFAULT_PERMISSIONS matches PLAN §4 exactly', () => {
  it('covers 6 roles x 16 modules x 4 actions = 384 cells', () => {
    expect(cells).toHaveLength(384);
  });
  it.each(cells)('can(DEFAULT, %s, %s, %s) === %s', (role, module, action, want) => {
    expect(can(DEFAULT_PERMISSIONS, role, module, action)).toBe(want);
  });
  it.each(cells)('raw matrix cell %s.%s includes %s === %s', (role, module, action, want) => {
    expect(!!DEFAULT_PERMISSIONS[role][module]?.includes(action)).toBe(want);
  });
  it('has exactly the 6 roles and no extra keys', () => {
    expect(Object.keys(DEFAULT_PERMISSIONS).sort()).toEqual([...ALL_ROLES].sort());
  });
  it('has no unknown module keys, no empty arrays, no duplicate or unknown actions', () => {
    for (const r of ALL_ROLES) {
      for (const [m, acts] of Object.entries(DEFAULT_PERMISSIONS[r])) {
        expect(ALL_MODULES).toContain(m);
        expect(acts!.length).toBeGreaterThan(0);
        expect(new Set(acts).size).toBe(acts!.length);
        for (const a of acts!) expect(ACTIONS).toContain(a);
      }
    }
  });
  it('role entries do not share array references (mutating one role does not leak)', () => {
    expect(DEFAULT_PERMISSIONS.admin.properties).not.toBe(DEFAULT_PERMISSIONS.staff.properties);
    expect(DEFAULT_PERMISSIONS.staff.properties).not.toBe(DEFAULT_PERMISSIONS.agent.properties);
  });
});

describe('can()', () => {
  it('unknown module -> false', () => {
    expect(can(DEFAULT_PERMISSIONS, 'admin', 'tickets' as Module, 'view')).toBe(false);
    expect(can(DEFAULT_PERMISSIONS, 'staff', '' as Module, 'view')).toBe(false);
  });
  it('unknown role -> false', () => {
    expect(can(DEFAULT_PERMISSIONS, 'superuser' as Role, 'dashboard', 'view')).toBe(false);
    expect(can(DEFAULT_PERMISSIONS, '' as Role, 'dashboard', 'view')).toBe(false);
  });
  it('unknown action -> false', () => {
    expect(can(DEFAULT_PERMISSIONS, 'admin', 'properties', 'export' as Action)).toBe(false);
  });
  it('prototype-named module (constructor/toString) -> false without throwing', () => {
    expect(() => can(DEFAULT_PERMISSIONS, 'staff', 'constructor' as Module, 'view')).not.toThrow();
    expect(can(DEFAULT_PERMISSIONS, 'staff', 'constructor' as Module, 'view')).toBe(false);
    expect(can(DEFAULT_PERMISSIONS, 'staff', 'toString' as Module, 'view')).toBe(false);
  });
  it('prototype-named role (__proto__/constructor) -> false', () => {
    expect(can(DEFAULT_PERMISSIONS, '__proto__' as Role, 'dashboard', 'view')).toBe(false);
    expect(can(DEFAULT_PERMISSIONS, 'constructor' as Role, 'dashboard', 'view')).toBe(false);
  });
  it('empty matrix -> false for everyone except admin settings', () => {
    const empty = {} as PermissionMatrix;
    expect(can(empty, 'staff', 'dashboard', 'view')).toBe(false);
    expect(can(empty, 'admin', 'dashboard', 'view')).toBe(false);
    for (const a of ACTIONS) expect(can(empty, 'admin', 'settings', a)).toBe(true);
  });
  it('custom matrix with admin settings removed still lets admin view (and manage) settings', () => {
    const m = clone();
    delete m.admin.settings;
    for (const a of ACTIONS) expect(can(m, 'admin', 'settings', a)).toBe(true);
    m.admin.settings = [];
    for (const a of ACTIONS) expect(can(m, 'admin', 'settings', a)).toBe(true);
  });
  it('admin override is limited to settings: other admin rights follow the matrix', () => {
    const m = clone();
    m.admin.properties = ['view'];
    expect(can(m, 'admin', 'properties', 'view')).toBe(true);
    expect(can(m, 'admin', 'properties', 'delete')).toBe(false);
  });
  it('custom matrix grants/revocations are honoured for non-admin roles', () => {
    const m = clone();
    m.client.settings = ['view'];
    m.staff.leads = [];
    expect(can(m, 'client', 'settings', 'view')).toBe(true);
    expect(can(m, 'client', 'settings', 'edit')).toBe(false);
    expect(can(m, 'staff', 'leads', 'view')).toBe(false);
  });
  it('non-admin roles do not get the settings override', () => {
    for (const r of ALL_ROLES.filter(x => x !== 'admin')) expect(can(DEFAULT_PERMISSIONS, r, 'settings', 'view')).toBe(false);
  });
});

describe('shared/types constant exports', () => {
  it('MODULES lists the 16 §3 modules in order', () => {
    expect(MODULES).toEqual(ALL_MODULES);
  });
  it('ROLES lists the 6 §3 roles in order', () => {
    expect(ROLES).toEqual(ALL_ROLES);
  });
  it('ROLE_LABELS has a non-empty label for exactly every role', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ALL_ROLES].sort());
    for (const r of ALL_ROLES) expect(ROLE_LABELS[r].trim().length).toBeGreaterThan(0);
  });
  it('PROPERTY_STATUSES matches §3', () => {
    expect(PROPERTY_STATUSES).toEqual(['Pending', 'New', 'Active', 'Pending Sale', 'Closed Sale', 'Sold', 'Rented', 'Temp off Market', 'Withdrawn', 'Cancelled', 'Backup', 'Expired']);
  });
  it('REQUEST_STATUSES matches §3', () => {
    expect(REQUEST_STATUSES).toEqual(['Draft', 'Submitted', 'Sent', 'Waiting for approval', 'Approved', 'Cancelled', 'Complete', 'Expired']);
  });
  it('LEAD_STATUSES matches §3', () => {
    expect(LEAD_STATUSES).toEqual(['New', 'Contacted', 'Site Visit Scheduled', 'Site Visit Done', 'Negotiation', 'Booked', 'Lost']);
  });
  it('LEAD_SOURCES has the 9 §3 sources, unique', () => {
    expect([...LEAD_SOURCES].sort()).toEqual(['99acres', 'Channel Partner', 'Facebook Ads', 'Google Ads', 'Housing.com', 'MagicBricks', 'Referral', 'Walk-in', 'Website'].sort());
    expect(new Set(LEAD_SOURCES).size).toBe(LEAD_SOURCES.length);
  });
  it('COLLECTION_MODULE covers exactly the 13 §5 collections', () => {
    expect(Object.keys(COLLECTION_MODULE).sort()).toEqual(
      ['owners', 'staff', 'agents', 'brokers', 'clients', 'properties', 'leads', 'requests', 'tenants', 'contracts', 'invoices', 'plans', 'users'].sort());
  });
});

describe('moduleFor(collection, kind?)', () => {
  it.each([
    ['owners', 'owners'], ['staff', 'staff'], ['agents', 'agents'], ['brokers', 'brokers'], ['clients', 'clients'],
    ['properties', 'properties'], ['leads', 'leads'], ['tenants', 'tenants'], ['contracts', 'contracts'], ['invoices', 'invoices'],
    ['plans', 'settings'], ['users', 'settings'],
  ])('%s -> %s (§3 map)', (col, mod) => {
    expect(moduleFor(col)).toBe(mod);
  });
  it('requests + rent -> rentRequests', () => {
    expect(moduleFor('requests', 'rent')).toBe('rentRequests');
  });
  it('requests + buy -> buyRequests', () => {
    expect(moduleFor('requests', 'buy')).toBe('buyRequests');
  });
  it('requests without kind -> buyRequests', () => {
    expect(moduleFor('requests')).toBe('buyRequests');
  });
  it('kind is ignored for non-request collections', () => {
    expect(moduleFor('owners', 'rent')).toBe('owners');
  });
  it('every resolved module is a real Module', () => {
    for (const c of Object.keys(COLLECTION_MODULE)) {
      for (const k of [undefined, 'buy', 'rent'] as const) expect(ALL_MODULES).toContain(moduleFor(c, k));
    }
  });
  it.each(['', 'tickets', 'Owners', 'settings', 'dashboard', 'buyRequests'])('unknown collection "%s" -> undefined', c => {
    expect(moduleFor(c)).toBeUndefined();
  });
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])('prototype key %s -> undefined', c => {
    expect(moduleFor(c)).toBeUndefined();
  });
});
