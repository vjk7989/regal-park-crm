// @vitest-environment jsdom
// PLAN §9 / ADR-7: public /roles page + role switcher (real logout + login as the role's demo user).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

// Stub every page except Login/Roles so the shell + roles page are tested in isolation (no JSX in factories: hoisted).
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
import { AuthProvider } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';

type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';
const ROLE_ORDER: Role[] = ['admin', 'staff', 'agent', 'broker', 'owner', 'client'];
const LABEL: Record<Role, string> = {
  admin: 'Administrator', staff: 'Sales Staff', agent: 'Real Estate Agent', broker: 'Business Broker', owner: 'Property Owner', client: 'Client',
};
const EMAIL: Record<Role, string> = {
  admin: 'admin@regalpark.demo', staff: 'sales@regalpark.demo', agent: 'agent@regalpark.demo',
  broker: 'broker@regalpark.demo', owner: 'owner@regalpark.demo', client: 'client@regalpark.demo',
};
const ROLE_OF_EMAIL = Object.fromEntries(Object.entries(EMAIL).map(([r, e]) => [e, r])) as Record<string, Role>;
const MODULE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard', properties: 'Properties', approvals: 'Approvals', leads: 'Leads', owners: 'Owners', staff: 'Staff', agents: 'Agents',
  brokers: 'Brokers', clients: 'Clients', buyRequests: 'Buy Requests', rentRequests: 'Rental Requests', tenants: 'Tenants', invoices: 'Invoices',
  contracts: 'Contracts', reports: 'Reports', settings: 'Settings',
};
/** Chips expected for a role: modules carrying 'view' in the matrix, in matrix order. */
const viewChips = (matrix: any, role: Role) =>
  Object.entries(matrix[role] ?? {}).filter(([, a]) => (a as string[]).includes('view')).map(([m]) => MODULE_LABEL[m]);

const CLIENT_SIDEBAR = ['Dashboard', 'Properties', 'Buy Requests', 'Rental Requests', 'Tenants', 'Invoices', 'Contracts', 'All Roles'];

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });

interface Call { method: string; path: string; body: any; auth?: string }
interface ServerOpts {
  matrix?: unknown;
  settings?: Record<string, unknown>;
  logout?: () => ReturnType<typeof json>;
  login?: (email: string, password: string) => Promise<ReturnType<typeof json> | undefined> | ReturnType<typeof json> | undefined;
}

let calls: Call[];
let fetchMock: ReturnType<typeof vi.fn>;
/** Tiny stateful auth server: tokens are `T-<role>`; /auth/me answers for the bearer token's role. */
function server(role: Role | null, opts: ServerOpts = {}) {
  calls = [];
  const sessions = new Set<string>();
  if (role) sessions.add(`T-${role}`);
  fetchMock = vi.fn(async (url: string, init: { method: string; body?: string; headers?: Record<string, string> }) => {
    const path = url.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    const auth = init?.headers?.Authorization;
    calls.push({ method, path, body, auth });
    const tok = auth?.replace(/^Bearer /, '');
    if (path === '/auth/me') return tok && sessions.has(tok) ? json(200, { user: { id: `u-${tok}`, name: `${tok.slice(2)} user`, email: `${tok.slice(2)}@x`, role: tok.slice(2), active: true } }) : json(401, { error: 'Not authenticated' });
    if (path === '/permissions') return json(200, opts.matrix ?? DEFAULT_PERMISSIONS);
    if (path === '/settings') return json(200, { projectName: 'Sterlitee Regal Park', ...(opts.settings ?? {}) });
    if (path === '/auth/logout' && method === 'POST') {
      const r = opts.logout?.();
      if (r) return r;
      if (tok) sessions.delete(tok);
      return json(200, { ok: true });
    }
    if (path === '/auth/login' && method === 'POST') {
      const custom = await opts.login?.(body.email, body.password);
      if (custom) return custom;
      const r = ROLE_OF_EMAIL[body.email];
      if (!r || body.password !== 'demo123') return json(401, { error: 'Invalid email or password' });
      sessions.add(`T-${r}`);
      return json(200, { token: `T-${r}`, user: { id: `u-${r}`, name: `${r} user`, email: body.email, role: r, active: true } });
    }
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  if (role) localStorage.setItem('rp_token', `T-${role}`);
}

let currentPath = '';
const Probe = () => { currentPath = useLocation().pathname; return null; };
const renderApp = (path: string) => render(
  <AuthProvider><ToastProvider><MemoryRouter initialEntries={[path]}><App /><Probe /></MemoryRouter></ToastProvider></AuthProvider>,
);
const waitShell = async () => { await screen.findByText('Logout'); await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull()); };
const waitRoles = () => screen.findByRole('heading', { name: 'Choose a role to explore Regal Park CRM' });

const cards = () => Array.from(document.querySelectorAll('.role-card')) as HTMLElement[];
const card = (role: Role) => cards().find(c => c.querySelector('h3')?.textContent === LABEL[role])!;
const chipsOf = (role: Role) => Array.from(card(role).querySelectorAll('.chip')).map(c => c.textContent);
const viewBtn = (role: Role) => within(card(role)).getByRole('button') as HTMLButtonElement;
const sidebarLabels = () => within(document.querySelector('aside nav') as HTMLElement).getAllByRole('link').map(a => a.textContent!.trim());
const errorToasts = () => Array.from(document.querySelectorAll('.toast-error')).map(t => t.textContent ?? '');
const posts = (p: string) => calls.filter(c => c.method === 'POST' && c.path === p);

beforeEach(() => {
  localStorage.clear();
  currentPath = '';
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('/roles logged out (standalone public page)', () => {
  it('is reachable without a session: branded, no sidebar/topbar, six role cards in role order, no /auth/me call', async () => {
    server(null);
    renderApp('/roles');
    await waitRoles();
    expect(currentPath).toBe('/roles');
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    expect(document.querySelector('.roles-public')).toBeTruthy();
    expect(screen.getByText('REGAL PARK')).toBeTruthy();
    expect(screen.getByText('by Sterlitee')).toBeTruthy();
    expect(document.querySelector('aside')).toBeNull();
    expect(screen.queryByText('Logout')).toBeNull();
    expect(cards().map(c => c.querySelector('h3')!.textContent)).toEqual(ROLE_ORDER.map(r => LABEL[r]));
    expect(calls.filter(c => c.path === '/auth/me')).toHaveLength(0);
  });

  for (const role of ROLE_ORDER) {
    it(`${role} card shows label, demo email, "View as" button and chips = DEFAULT_PERMISSIONS view modules`, async () => {
      server(null);
      renderApp('/roles');
      await waitRoles();
      const c = card(role);
      expect(c).toBeTruthy();
      expect(within(c).getByText(EMAIL[role])).toBeTruthy();
      expect(viewBtn(role).textContent).toBe(`View as ${LABEL[role]}`);
      expect(chipsOf(role)).toEqual(viewChips(DEFAULT_PERMISSIONS, role));
      expect(chipsOf(role).length).toBeGreaterThan(0);
    });
  }

  it('no "Current" badge and no "Portal disabled" badge when logged out', async () => {
    server(null);
    renderApp('/roles');
    await waitRoles();
    expect(screen.queryByText('Current')).toBeNull();
    expect(screen.queryByText('Portal disabled')).toBeNull();
  });

  it('"View as Owner" while logged out logs in directly (no /auth/logout) and lands on "/"', async () => {
    server(null);
    renderApp('/roles');
    await waitRoles();
    fireEvent.click(viewBtn('owner'));
    await waitShell();
    expect(posts('/auth/logout')).toHaveLength(0);
    expect(posts('/auth/login').map(c => c.body)).toEqual([{ email: 'owner@regalpark.demo', password: 'demo123' }]);
    expect(localStorage.getItem('rp_token')).toBe('T-owner');
    await waitFor(() => expect(currentPath).toBe('/'));
    expect(screen.getByText('DASHBOARD_PAGE')).toBeTruthy();
  });

  it('Login page "See all roles" link navigates to /roles', async () => {
    server(null);
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    const link = screen.getByRole('link', { name: /See all roles/ });
    expect(link.getAttribute('href')).toBe('/roles');
    fireEvent.click(link);
    await waitRoles();
    expect(currentPath).toBe('/roles');
    expect(cards()).toHaveLength(6);
  });
});

describe('/roles logged in (inside Layout)', () => {
  it('renders inside the shell: sidebar + topbar present, not the public wrapper, "All Roles" link active', async () => {
    server('admin');
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    expect(document.querySelector('aside nav')).toBeTruthy();
    expect(document.querySelector('.roles-public')).toBeNull();
    expect(cards()).toHaveLength(6);
    const allRoles = within(document.querySelector('aside nav') as HTMLElement).getByRole('link', { name: 'All Roles' });
    expect(allRoles.className).toContain('active');
  });

  it('"Current" badge only on the logged-in role card', async () => {
    server('staff');
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    expect(screen.getAllByText('Current')).toHaveLength(1);
    expect(within(card('staff')).getByText('Current')).toBeTruthy();
    for (const r of ROLE_ORDER.filter(x => x !== 'staff')) expect(within(card(r)).queryByText('Current')).toBeNull();
  });

  it('chips come from the server matrix: granting client leads adds a Leads chip; action without view adds nothing', async () => {
    const custom = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    custom.client.leads = ['view'];
    custom.client.reports = ['create']; // no 'view' -> no chip
    delete custom.agent.dashboard;
    server('admin', { matrix: custom });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    await waitFor(() => expect(chipsOf('client')).toContain('Leads'));
    expect(chipsOf('client')).toEqual(viewChips(custom, 'client'));
    expect(chipsOf('client')).not.toContain('Reports');
    expect(chipsOf('agent')).not.toContain('Dashboard');
    expect(chipsOf('agent')).toEqual(viewChips(custom, 'agent'));
  });

  it('role missing from the server matrix renders a card with no chips (no crash)', async () => {
    const custom = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    delete custom.owner;
    server('admin', { matrix: custom });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    expect(cards()).toHaveLength(6);
    expect(chipsOf('owner')).toEqual([]);
  });

  it('broker card shows "Portal disabled" when settings.showBrokerPortal=false (only on broker)', async () => {
    server('admin', { settings: { showBrokerPortal: false } });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    expect(within(card('broker')).getByText('Portal disabled')).toBeTruthy();
    expect(screen.getAllByText('Portal disabled')).toHaveLength(1);
  });

  it('no "Portal disabled" badge when showBrokerPortal=true', async () => {
    server('admin', { settings: { showBrokerPortal: true } });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    expect(screen.queryByText('Portal disabled')).toBeNull();
  });
});

describe('Role switch ("View as <Role>")', () => {
  it('admin -> "View as Client": POST /auth/logout then /auth/login (client demo creds), new token stored, lands on "/" with client sidebar', async () => {
    server('admin');
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    fireEvent.click(viewBtn('client'));
    await waitFor(() => expect(currentPath).toBe('/'));
    await screen.findByText('DASHBOARD_PAGE');
    const mut = calls.filter(c => c.method === 'POST');
    expect(mut.map(c => c.path)).toEqual(['/auth/logout', '/auth/login']);
    expect(mut[0].auth).toBe('Bearer T-admin'); // the old session is the one logged out
    expect(mut[1].body).toEqual({ email: 'client@regalpark.demo', password: 'demo123' });
    expect(localStorage.getItem('rp_token')).toBe('T-client');
    expect(document.querySelector('.role-badge')!.textContent).toBe('client');
    await waitFor(() => expect(sidebarLabels()).toEqual(CLIENT_SIDEBAR));
  });

  it('permissions/settings are re-fetched after the switch with the new token', async () => {
    server('admin');
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    const before = calls.length;
    fireEvent.click(viewBtn('client'));
    await waitFor(() => expect(currentPath).toBe('/'));
    await waitFor(() => {
      const after = calls.slice(before);
      expect(after.some(c => c.path === '/permissions' && c.auth === 'Bearer T-client')).toBe(true);
      expect(after.some(c => c.path === '/settings' && c.auth === 'Bearer T-client')).toBe(true);
    });
  });

  it('logout failure (500) is ignored and login still happens', async () => {
    server('admin', { logout: () => json(500, { error: 'boom' }) });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    fireEvent.click(viewBtn('client'));
    await waitFor(() => expect(currentPath).toBe('/'));
    expect(posts('/auth/logout')).toHaveLength(1);
    expect(posts('/auth/login')).toHaveLength(1);
    expect(localStorage.getItem('rp_token')).toBe('T-client');
    expect(errorToasts()).toEqual([]);
  });

  it('logout network error (fetch rejects) is ignored and login still happens', async () => {
    server('admin');
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: any) => {
      if (url === '/api/auth/logout') { calls.push({ method: 'POST', path: '/auth/logout', body: undefined }); throw new TypeError('Failed to fetch'); }
      return base(url, init);
    });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    fireEvent.click(viewBtn('agent'));
    await waitFor(() => expect(currentPath).toBe('/'));
    expect(localStorage.getItem('rp_token')).toBe('T-agent');
  });

  it('login failure (403 Broker portal disabled) shows an error toast, stays on /roles, buttons re-enabled', async () => {
    server('admin', {
      settings: { showBrokerPortal: false },
      login: email => (email === 'broker@regalpark.demo' ? json(403, { error: 'Broker portal disabled' }) : undefined),
    });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    fireEvent.click(viewBtn('broker'));
    await waitFor(() => expect(errorToasts()).toEqual(['Broker portal disabled']));
    expect(currentPath).toBe('/roles');
    expect(screen.queryByText('DASHBOARD_PAGE')).toBeNull();
    expect(cards()).toHaveLength(6);
    for (const r of ROLE_ORDER) expect(viewBtn(r).disabled).toBe(false);
    expect(viewBtn('broker').textContent).toBe('View as Business Broker');
  });

  it('login failure while logged out also toasts and stays on /roles', async () => {
    server(null, { login: () => json(500, { error: 'Server down' }) });
    renderApp('/roles');
    await waitRoles();
    fireEvent.click(viewBtn('client'));
    await waitFor(() => expect(errorToasts()).toEqual(['Server down']));
    expect(currentPath).toBe('/roles');
    expect(localStorage.getItem('rp_token')).toBeNull();
  });

  it('while switching all buttons are disabled, the clicked one shows "Switching...", double click logs in once', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    server('admin', { login: async () => { await gate; return undefined; } });
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    fireEvent.click(viewBtn('client'));
    fireEvent.click(viewBtn('client'));
    fireEvent.click(viewBtn('owner'));
    await waitFor(() => expect(posts('/auth/login')).toHaveLength(1));
    expect(viewBtn('client').textContent).toBe('Switching...');
    for (const r of ROLE_ORDER) expect(viewBtn(r).disabled).toBe(true);
    release();
    await waitFor(() => expect(currentPath).toBe('/'));
    expect(posts('/auth/login')).toHaveLength(1);
    expect(posts('/auth/logout')).toHaveLength(1);
    expect(localStorage.getItem('rp_token')).toBe('T-client');
  });

  it('switching to the same role (Current) still re-logs in and lands on "/"', async () => {
    server('client');
    renderApp('/roles');
    await waitShell();
    await waitRoles();
    fireEvent.click(viewBtn('client'));
    await waitFor(() => expect(currentPath).toBe('/'));
    expect(posts('/auth/login').map(c => c.body.email)).toEqual(['client@regalpark.demo']);
    expect(localStorage.getItem('rp_token')).toBe('T-client');
  });
});

describe('Navigation to /roles from the shell (every role)', () => {
  for (const role of ROLE_ORDER) {
    it(`${role}: topbar "Switch role" navigates to /roles`, async () => {
      server(role);
      renderApp('/');
      await waitShell();
      const link = screen.getByRole('link', { name: /Switch role/ });
      expect(link.getAttribute('href')).toBe('/roles');
      fireEvent.click(link);
      await waitRoles();
      expect(currentPath).toBe('/roles');
      expect(within(card(role)).getByText('Current')).toBeTruthy();
    });

    it(`${role}: sidebar "All Roles" is the last link and navigates to /roles`, async () => {
      server(role);
      renderApp('/');
      await waitShell();
      const labels = sidebarLabels();
      expect(labels[labels.length - 1]).toBe('All Roles');
      expect(labels.filter(l => l === 'All Roles')).toHaveLength(1);
      fireEvent.click(within(document.querySelector('aside nav') as HTMLElement).getByRole('link', { name: 'All Roles' }));
      await waitRoles();
      expect(currentPath).toBe('/roles');
    });
  }

  it('"All Roles" is shown even when the server matrix grants the role nothing', async () => {
    const custom = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    custom.client = {};
    server('client', { matrix: custom });
    renderApp('/');
    await waitShell();
    await waitFor(() => expect(sidebarLabels()).toEqual(['All Roles']));
  });
});
