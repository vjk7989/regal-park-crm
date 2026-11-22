// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';

// Stub every page so the shell is tested in isolation (no JSX inside factories: they are hoisted).
vi.mock('../../client/pages/Dashboard', () => ({ default: () => 'DASHBOARD_PAGE' }));
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
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';

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

// Expected sidebar per PLAN §4 (V column), in sidebar order.
const EXPECTED: Record<Role, string[]> = {
  admin: ['Dashboard', 'Leads', 'Properties', 'Approvals', 'Buy Requests', 'Rental Requests', 'Tenants', 'Invoices', 'Contracts', 'Property Owners', 'My Staff', 'Real Estate Agents', 'Business Brokers', 'Clients', 'Reports', 'Settings'],
  staff: ['Dashboard', 'Leads', 'Properties', 'Approvals', 'Buy Requests', 'Rental Requests', 'Tenants', 'Invoices', 'Contracts', 'Property Owners', 'Real Estate Agents', 'Business Brokers', 'Clients', 'Reports'],
  agent: ['Dashboard', 'Leads', 'Properties', 'Buy Requests', 'Rental Requests', 'Clients'],
  broker: ['Dashboard', 'Leads', 'Properties', 'Buy Requests', 'Invoices', 'Contracts', 'Property Owners', 'Clients'],
  owner: ['Dashboard', 'Properties', 'Buy Requests', 'Rental Requests', 'Tenants', 'Invoices', 'Contracts'],
  client: ['Dashboard', 'Properties', 'Buy Requests', 'Rental Requests', 'Tenants', 'Invoices', 'Contracts'],
};

describe('Sidebar shows only modules the role can view (PLAN §4)', () => {
  for (const role of Object.keys(EXPECTED) as Role[]) {
    it(`${role}: sidebar links match PLAN §4`, async () => {
      serverAs(role);
      renderApp('/');
      await waitShell();
      expect(sidebarLabels()).toEqual(EXPECTED[role]);
    });
  }

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

  it('empty groups are not rendered (client has no People/Insights/Admin group titles)', async () => {
    serverAs('client');
    renderApp('/');
    await waitShell();
    const titles = Array.from(document.querySelectorAll('.nav-title')).map(e => e.textContent);
    expect(titles).toEqual(['Overview', 'Sales', 'Rentals & Billing']);
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
    expect(sidebarLabels()).toEqual(EXPECTED.broker);
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
