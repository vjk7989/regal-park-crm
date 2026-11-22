import { describe, expect, it } from 'vitest';
import { can, DEFAULT_PERMISSIONS } from '../../shared/permissions';
import { REGISTRY } from '../../shared/registry';
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

// PLAN §10.2 / ADR-9: registry modules map to permission ids `m:<moduleKey>`.
const REG_KEYS = REGISTRY.map(m => m.key);
const REG_IDS = REG_KEYS.map(k => `m:${k}` as Module);
const STAFF_VIEW_ONLY = ['accounting', 'payroll', 'team_passwords', 'risk'];

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
  it('has no unknown module keys (§4 modules ∪ m:<registry key>), no empty arrays, no duplicate or unknown actions', () => {
    const known = new Set<string>([...ALL_MODULES, ...REG_IDS]);
    for (const r of ALL_ROLES) {
      for (const [m, acts] of Object.entries(DEFAULT_PERMISSIONS[r])) {
        expect(known.has(m), `${r}.${m}`).toBe(true);
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

describe('DEFAULT_PERMISSIONS m:* registry entries (PLAN §10.2 / ADR-9)', () => {
  it('registry is non-empty, keys unique, and contains the four staff-restricted modules', () => {
    expect(REG_KEYS.length).toBeGreaterThan(0);
    expect(new Set(REG_KEYS).size).toBe(REG_KEYS.length);
    for (const k of STAFF_VIEW_ONLY) expect(REG_KEYS).toContain(k);
  });
  it('registry keys do not collide with §4 module names once prefixed', () => {
    for (const id of REG_IDS) expect(ALL_MODULES).not.toContain(id);
  });
  it.each(REG_IDS)('admin has VCED on %s', id => {
    expect(DEFAULT_PERMISSIONS.admin[id]).toEqual(['view', 'create', 'edit', 'delete']);
    for (const a of ACTIONS) expect(can(DEFAULT_PERMISSIONS, 'admin', id, a)).toBe(true);
  });
  it.each(REG_IDS)('staff rights on %s: view-only for the restricted four, else VCE', id => {
    const restricted = STAFF_VIEW_ONLY.includes(id.slice(2));
    expect(DEFAULT_PERMISSIONS.staff[id]).toEqual(restricted ? ['view'] : ['view', 'create', 'edit']);
    expect(can(DEFAULT_PERMISSIONS, 'staff', id, 'view')).toBe(true);
    expect(can(DEFAULT_PERMISSIONS, 'staff', id, 'create')).toBe(!restricted);
    expect(can(DEFAULT_PERMISSIONS, 'staff', id, 'edit')).toBe(!restricted);
    expect(can(DEFAULT_PERMISSIONS, 'staff', id, 'delete')).toBe(false);
  });
  it.each(['m:accounting', 'm:payroll', 'm:team_passwords', 'm:risk'] as Module[])('staff is view-only on %s', id => {
    expect(DEFAULT_PERMISSIONS.staff[id]).toEqual(['view']);
  });
  it('admin and staff have exactly the registry m:* keys (no extras, none missing)', () => {
    for (const r of ['admin', 'staff'] as Role[]) {
      const mk = Object.keys(DEFAULT_PERMISSIONS[r]).filter(k => k.startsWith('m:')).sort();
      expect(mk).toEqual([...REG_IDS].sort());
    }
  });
  it.each(['agent', 'broker', 'owner', 'client'] as Role[])('%s has no m:* entries and can() denies every m:* action', r => {
    expect(Object.keys(DEFAULT_PERMISSIONS[r]).filter(k => k.startsWith('m:'))).toEqual([]);
    for (const id of REG_IDS) for (const a of ACTIONS) expect(can(DEFAULT_PERMISSIONS, r, id, a)).toBe(false);
  });
  it('m:* arrays are not shared between admin and staff or across modules', () => {
    expect(DEFAULT_PERMISSIONS.admin[REG_IDS[0]]).not.toBe(DEFAULT_PERMISSIONS.staff[REG_IDS[0]]);
    if (REG_IDS.length > 1) expect(DEFAULT_PERMISSIONS.admin[REG_IDS[0]]).not.toBe(DEFAULT_PERMISSIONS.admin[REG_IDS[1]]);
  });
  it('unknown m:* module -> false for every role (including admin)', () => {
    for (const r of ALL_ROLES) expect(can(DEFAULT_PERMISSIONS, r, 'm:does_not_exist', 'view')).toBe(false);
    expect(can(DEFAULT_PERMISSIONS, 'admin', 'm:' as Module, 'view')).toBe(false);
    expect(can(DEFAULT_PERMISSIONS, 'admin', `m:${REG_KEYS[0].toUpperCase()}` as Module, 'view')).toBe(false);
  });
  it.each(['m:__proto__', 'm:constructor', 'm:toString', 'm:hasOwnProperty'] as Module[])('prototype-like %s -> false without throwing', id => {
    for (const r of ALL_ROLES) {
      expect(() => can(DEFAULT_PERMISSIONS, r, id, 'view')).not.toThrow();
      expect(can(DEFAULT_PERMISSIONS, r, id, 'view')).toBe(false);
    }
  });
  it('custom matrix: granting m:* to a non-admin role and revoking from staff is honoured', () => {
    const m = clone();
    const id = REG_IDS[0];
    m.client[id] = ['view'];
    delete m.staff[id];
    expect(can(m, 'client', id, 'view')).toBe(true);
    expect(can(m, 'client', id, 'edit')).toBe(false);
    expect(can(m, 'staff', id, 'view')).toBe(false);
  });
  it('custom matrix: admin m:* rights follow the matrix (only settings is forced)', () => {
    const m = clone();
    const id = REG_IDS[0];
    delete m.admin[id];
    expect(can(m, 'admin', id, 'view')).toBe(false);
  });
  it('non-array junk in a matrix cell -> false without throwing', () => {
    const m = clone();
    (m.staff as Record<string, unknown>)[REG_IDS[0]] = 'view';
    expect(() => can(m, 'staff', REG_IDS[0], 'view')).not.toThrow();
    expect(can(m, 'staff', REG_IDS[0], 'view')).toBe(false);
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
