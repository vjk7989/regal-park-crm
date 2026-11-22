// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';

// Stub every page so the shell is tested in isolation (no JSX inside factories: they are hoisted).
vi.mock('../../client/pages/Dashboard', () => ({ default: () => 'DASHBOARD_PAGE' }));
vi.mock('../../client/pages/Overview', () => ({ default: () => 'OVERVIEW_PAGE' }));
vi.mock('../../client/pages/Properties', () => ({ default: () => 'PROPERTIES_PAGE' }));
vi.mock('../../client/pages/PropertyForm', () => ({ default: () => 'PROPERTYFORM_PAGE' }));
vi.mock('../../client/pages/PropertyDetail', () => ({ default: () => 'PROPERTYDETAIL_PAGE' }));
vi.mock('../../client/pages/Approvals', () => ({ default: () => 'APPROVALS_PAGE' }));
vi.mock('../../client/pages/Leads', () => ({ default: () => 'LEADS_PAGE' }));
vi.mock('../../client/pages/EntityPage', () => ({ default: ({ entity }: { entity: string }) => `ENTITY_${entity}_PAGE` }));
vi.mock('../../client/pages/Requests', () => ({ default: ({ kind }: { kind: string }) => `REQUESTS_${kind}_PAGE` }));
vi.mock('../../client/pages/RequestDetail', () => ({ default: () => 'REQUESTDETAIL_PAGE' }));
vi.mock('../../client/pages/Tenants', () => ({ default: () => 'TENANTS_PAGE' }));
vi.mock('../../client/pages/Billing', () => ({ default: () => 'INVOICES_PAGE', Contracts: () => 'CONTRACTS_PAGE' }));
vi.mock('../../client/pages/Reports', () => ({ default: () => 'REPORTS_PAGE' }));
vi.mock('../../client/pages/Settings', () => ({ default: () => 'SETTINGS_PAGE' }));

import App from '../../client/App';
import Layout from '../../client/Layout';
import { AuthProvider } from '../../client/auth';
import DataTable from '../../client/components/DataTable';
import { DEFAULT_PERMISSIONS, can as canDo } from '../../shared/permissions';
import { REGISTRY } from '../../shared/registry';
import type { Module } from '../../shared/types';

type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });

let fetchMock: ReturnType<typeof vi.fn>;
function serverAs(role: Role | null, matrix: unknown = DEFAULT_PERMISSIONS) {
  fetchMock = vi.fn(async (url: string, init: { method: string }) => {
    if (url === '/api/auth/me') return role ? json(200, { user: { id: 'u1', name: `${role} user`, email: `${role}@x`, role, active: true } }) : json(401, { error: 'Not authenticated' });
    if (url === '/api/permissions') return json(200, matrix);
    if (url === '/api/settings') return json(200, { projectName: 'Sterlitee Regal Park' });
    if (url === '/api/auth/logout' && init.method === 'POST') return json(200, { ok: true });
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  if (role) localStorage.setItem('rp_token', 'tok');
}

const renderApp = (path: string) => render(<AuthProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></AuthProvider>);
const sidebarLabels = () => within(document.querySelector('aside nav') as HTMLElement).getAllByRole('link').map(a => a.textContent!.trim());
const waitShell = async () => { await screen.findByText('Logout'); await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull()); };

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

// Expected sidebar per PLAN §4 (V column) + §10.4 / ADR-9 tree, in sidebar order, computed from the permission matrix.
// Links visible by default: "Dashboard" (/), the Real Estate branch (open by default) children, Admin > Settings.
// Registry modules render as collapsed branch buttons (m:<key> view) whose page links appear only when expanded.
const RE_LINKS: [string, Module][] = [
  ['Real Estate Dashboard', 'dashboard'], ['Leads', 'leads'], ['Properties', 'properties'], ['Approvals', 'approvals'],
  ['Buy Requests', 'buyRequests'], ['Rental Requests', 'rentRequests'], ['Tenants', 'tenants'], ['Invoices', 'invoices'],
  ['Contracts', 'contracts'], ['Property Owners', 'owners'], ['My Staff', 'staff'], ['Real Estate Agents', 'agents'],
  ['Business Brokers', 'brokers'], ['Clients', 'clients'], ['Reports', 'reports'],
];
const expectedLinks = (role: Role, matrix: any = DEFAULT_PERMISSIONS) => [
  ...(canDo(matrix, role, 'dashboard', 'view') ? ['Dashboard'] : []),
  ...RE_LINKS.filter(([, m]) => canDo(matrix, role, m, 'view')).map(([l]) => l),
  ...(canDo(matrix, role, 'settings', 'view') ? ['Settings'] : []),
];
const navModules = (role: Role, matrix: any = DEFAULT_PERMISSIONS) => REGISTRY.filter(m => canDo(matrix, role, `m:${m.key}`, 'view')
  && m.pages.some(p => !(p.kind === 'table' && p.entity && m.entities.find(e => e.key === p.entity)?.lookup)));
const EXPECTED = Object.fromEntries((['admin', 'staff', 'agent', 'broker', 'owner', 'client'] as Role[]).map(r => [r, expectedLinks(r)])) as Record<Role, string[]>;
/** Labels of the collapsible module branches (excluding the Real Estate branch). */
const moduleBranches = () => Array.from(document.querySelectorAll('aside nav button.nav-parent')).map(b => b.textContent!.trim()).filter(l => l !== 'Real Estate');
// PLAN §9 / ADR-7: every logged-in sidebar ends with an always-present "All Roles" link (no permission check).
const withAllRoles = (labels: string[]) => [...labels, 'All Roles'];

describe('Sidebar shows only modules the role can view (PLAN §4)', () => {
  for (const role of Object.keys(EXPECTED) as Role[]) {
    it(`${role}: sidebar links match PLAN §4`, async () => {
      serverAs(role);
      renderApp('/');
      await waitShell();
      expect(sidebarLabels()).toEqual(withAllRoles(EXPECTED[role]));
      // Rendered group by group (groups in first-appearance order of REGISTRY), modules in registry order within a group.
      const mods = navModules(role);
      const groups = [...new Set(REGISTRY.map(m => m.group))];
      expect(moduleBranches()).toEqual(groups.flatMap(g => mods.filter(m => m.group === g).map(m => m.label)));
    });
  }

  it('sanity: §4/§10.2 rules -> admin/staff see every registry module branch, other roles none', () => {
    expect(navModules('admin').length).toBeGreaterThan(0);
    expect(navModules('staff').map(m => m.key)).toEqual(navModules('admin').map(m => m.key));
    for (const r of ['agent', 'broker', 'owner', 'client'] as Role[]) expect(navModules(r)).toEqual([]);
    expect(EXPECTED.client).toEqual(['Dashboard', 'Real Estate Dashboard', 'Properties', 'Buy Requests', 'Rental Requests', 'Tenants', 'Invoices', 'Contracts']);
  });

  it('admin sees Settings', async () => {
    serverAs('admin');
    renderApp('/');
    await waitShell();
    expect(sidebarLabels()).toContain('Settings');
  });

  it('client does not see Leads / Property Owners / Settings', async () => {
    serverAs('client');
    renderApp('/');
    await waitShell();
    const l = sidebarLabels();
    for (const hidden of ['Leads', 'Property Owners', 'Settings', 'My Staff', 'Approvals', 'Reports']) expect(l).not.toContain(hidden);
  });

  it('broker sees Property Owners but not My Staff', async () => {
    serverAs('broker');
    renderApp('/');
    await waitShell();
    expect(sidebarLabels()).toContain('Property Owners');
    expect(sidebarLabels()).not.toContain('My Staff');
  });

  it('empty groups are not rendered (client has no module-group/Admin titles; staff has module groups but no Admin)', async () => {
    serverAs('client');
    renderApp('/');
    await waitShell();
    const titles = () => Array.from(document.querySelectorAll('.nav-title')).map(e => e.textContent);
    expect(titles()).toEqual([]);
    cleanup();
    serverAs('staff');
    renderApp('/');
    await waitShell();
    const order = [...new Set(REGISTRY.map(m => m.group))];
    const groupsOf = (r: Role) => order.filter(g => navModules(r).some(m => m.group === g));
    expect(titles()).toEqual(groupsOf('staff'));
    cleanup();
    serverAs('admin');
    renderApp('/');
    await waitShell();
    expect(titles()).toEqual([...groupsOf('admin'), 'Admin']);
  });

  it('uses the server permission matrix (admin-edited) rather than defaults', async () => {
    const custom = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    delete custom.staff.leads;
    custom.staff.staff = ['view'];
    serverAs('staff', custom);
    renderApp('/');
    await waitShell();
    await waitFor(() => expect(sidebarLabels()).not.toContain('Leads'));
    expect(sidebarLabels()).toContain('My Staff');
  });

  it('admin keeps Settings even if the server matrix strips it', async () => {
    const custom = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    delete custom.admin.settings;
    serverAs('admin', custom);
    renderApp('/');
    await waitShell();
    expect(sidebarLabels()).toContain('Settings');
  });

  it('falls back to default matrix when /permissions fails', async () => {
    serverAs('broker');
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: any) => (url === '/api/permissions' ? json(500, { error: 'x' }) : base(url, init)));
    renderApp('/');
    await waitShell();
    expect(sidebarLabels()).toEqual(withAllRoles(EXPECTED.broker));
  });
});

describe('Route guards (App)', () => {
  it('not logged in -> any protected route redirects to /login', async () => {
    serverAs(null);
    renderApp('/leads');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('LEADS_PAGE')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('expired token (/auth/me 401) clears token and shows login', async () => {
    serverAs(null);
    localStorage.setItem('rp_token', 'expired');
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(localStorage.getItem('rp_token')).toBeNull();
  });

  it('shows Loading... while the session is being restored', () => {
    serverAs('admin');
    renderApp('/');
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('logged-in user visiting /login is redirected to /', async () => {
    serverAs('client');
    renderApp('/login');
    expect(await screen.findByText('DASHBOARD_PAGE')).toBeTruthy();
  });

  const denied: [Role, string][] = [
    ['client', '/leads'], ['client', '/settings'], ['client', '/owners'], ['client', '/approvals'], ['client', '/reports'],
    ['broker', '/staff'], ['broker', '/rent-requests'], ['broker', '/tenants'],
    ['agent', '/invoices'], ['agent', '/owners'], ['owner', '/clients'], ['staff', '/settings'], ['staff', '/staff'],
  ];
  for (const [role, path] of denied) {
    it(`${role} on ${path} sees "Access denied"`, async () => {
      serverAs(role);
      renderApp(path);
      expect(await screen.findByText('Access denied')).toBeTruthy();
      expect(screen.queryByText(/_PAGE$/)).toBeNull();
    });
  }

  const allowed: [Role, string, string][] = [
    ['admin', '/settings', 'SETTINGS_PAGE'], ['admin', '/staff', 'ENTITY_staff_PAGE'],
    ['broker', '/owners', 'ENTITY_owners_PAGE'], ['client', '/rent-requests', 'REQUESTS_rent_PAGE'],
    ['owner', '/contracts', 'CONTRACTS_PAGE'], ['staff', '/properties/new', 'PROPERTYFORM_PAGE'],
  ];
  for (const [role, path, page] of allowed) {
    it(`${role} on ${path} sees the page`, async () => {
      serverAs(role);
      renderApp(path);
      expect(await screen.findByText(page)).toBeTruthy();
      expect(screen.queryByText('Access denied')).toBeNull();
    });
  }

  it('/properties/:id/edit is guarded by properties view', async () => {
    const custom = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    delete custom.client.properties;
    serverAs('client', custom);
    renderApp('/properties/p1/edit');
    expect(await screen.findByText('Access denied')).toBeTruthy();
  });

  it('/requests/:id is denied for a role that can view neither buy nor rent requests', async () => {
    const custom = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    delete custom.agent.buyRequests;
    delete custom.agent.rentRequests;
    serverAs('agent', custom);
    renderApp('/requests/r1');
    expect(await screen.findByText('Access denied')).toBeTruthy();
  });

  it('unknown route inside the shell shows Not found', async () => {
    serverAs('admin');
    renderApp('/nope');
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});

describe('Layout topbar', () => {
  const rows = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }];
  const renderLayout = () => render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/a']}>
        <Routes>
          <Route path="/login" element={<div>LOGIN_ROUTE</div>} />
          <Route element={<Layout />}>
            <Route path="/a" element={<><DataTable columns={[{ key: 'name', label: 'Name' }]} rows={rows} /><Link to="/b">go-b</Link></>} />
            <Route path="/b" element={<><DataTable columns={[{ key: 'name', label: 'Name' }]} rows={rows} /></>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  it('shows user name and role badge', async () => {
    serverAs('broker');
    renderLayout();
    expect(await screen.findByText('broker user')).toBeTruthy();
    expect(document.querySelector('.role-badge')!.textContent).toBe('broker');
  });

  it('topbar search filters the current table and is cleared on route change', async () => {
    serverAs('admin');
    renderLayout();
    await screen.findByText('admin user');
    const box = screen.getByPlaceholderText('Search current table...') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'beta' } });
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Beta')).toBeTruthy();
    fireEvent.click(screen.getByText('go-b'));
    await waitFor(() => expect(box.value).toBe(''));
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('Logout clears the token, posts /auth/logout and returns to login', async () => {
    serverAs('admin');
    renderApp('/');
    await waitShell();
    fireEvent.click(screen.getByText('Logout'));
    expect(localStorage.getItem('rp_token')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
});
