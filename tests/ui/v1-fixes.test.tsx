// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import DataTable from '../../client/components/DataTable';
import PropertyDetail from '../../client/pages/PropertyDetail';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';
import { renderAt, startServer, type Role } from './page-harness';

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
beforeAll(() => {
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn(), reload: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const pts = (...xs: [string, number][]) => xs.map(([name, value]) => ({ name, value }));
const DASH = {
  saleIncome: 12500000, rentalIncome: 350000, forSale: 11, sold: 4, selling: 2, forLease: 7, rented: 5, available: 3,
  propertyByStatus: pts(['Active', 10]), buyByStatus: pts(['New', 3]), rentByStatus: pts(['New', 2]),
  requestsByListingType: pts(['Apartment', 5]), topCities: pts(['Pune', 6]), leadsByStatus: pts(['New', 2]),
  leadsBySource: pts(['Website', 3]),
  recentLeads: [{ id: 'l1', name: 'Recent Ravi', phone: '9876543210', source: 'Website', interest: 'Buy', status: 'New', createdAt: '2026-11-20T10:00:00.000Z' }],
  leadsThisMonth: 9, siteVisitsScheduled: 6,
};
const LEAD_STATS = ['Leads this month', 'Site visits scheduled'];
const statLabels = () => Array.from(document.querySelectorAll('.stat-card .stat-label')).map(e => e.textContent);
const dash = (role: Role, matrix: unknown = DEFAULT_PERMISSIONS) =>
  startServer(role, {}, (m, p) => (m === 'GET' && p.startsWith('/dashboard') ? [200, DASH] : undefined), matrix);

describe('V1.a Dashboard hides lead widgets without leads:view', () => {
  it.each(['client', 'owner'] as Role[])('%s (no leads view): lead stat cards, charts and recent table hidden', async role => {
    dash(role);
    await renderAt('/real-estate');
    await screen.findByText('Sale income');
    const labels = statLabels();
    for (const l of LEAD_STATS) expect(labels).not.toContain(l);
    expect(labels).toContain('Available');
    expect(screen.queryByText('Leads by source')).toBeNull();
    expect(screen.queryByText('Leads funnel')).toBeNull();
    expect(screen.queryByText('Recent leads')).toBeNull();
    expect(screen.queryByText('Recent Ravi')).toBeNull();
    // non-lead charts still render
    expect(screen.getByText('Property status')).toBeTruthy();
    expect(screen.getByText('Top cities')).toBeTruthy();
  });

  it.each(['admin', 'staff', 'agent', 'broker'] as Role[])('%s (leads view): all lead widgets visible', async role => {
    dash(role);
    await renderAt('/real-estate');
    await screen.findByText('Sale income');
    const labels = statLabels();
    for (const l of LEAD_STATS) expect(labels).toContain(l);
    expect(screen.getByText('Leads by source')).toBeTruthy();
    expect(screen.getByText('Leads funnel')).toBeTruthy();
    expect(screen.getByText('Recent leads')).toBeTruthy();
    expect(await screen.findByText('Recent Ravi')).toBeTruthy();
  });

  it('client granted leads:view in the matrix sees the lead widgets', async () => {
    const m = clone(DEFAULT_PERMISSIONS) as any;
    m.client.leads = ['view'];
    dash('client', m);
    await renderAt('/real-estate');
    await screen.findByText('Sale income');
    for (const l of LEAD_STATS) expect(statLabels()).toContain(l);
    expect(screen.getByText('Leads funnel')).toBeTruthy();
    expect(screen.getByText('Recent leads')).toBeTruthy();
  });

  it('staff with leads revoked in the matrix loses the lead widgets', async () => {
    const m = clone(DEFAULT_PERMISSIONS) as any;
    delete m.staff.leads;
    dash('staff', m);
    await renderAt('/real-estate');
    await screen.findByText('Sale income');
    for (const l of LEAD_STATS) expect(statLabels()).not.toContain(l);
    expect(screen.queryByText('Recent leads')).toBeNull();
  });
});

// ---- PropertyDetail ----
type Routes_ = Record<string, unknown | (() => [number, unknown])>;
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
const deny = () => [403, { error: 'Forbidden' }] as [number, unknown];

function serve(role: Role, routes: Routes_, linkedId?: string, name = `${role} user`) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    if (url === '/api/auth/me') return json(200, { user: { id: 'u1', name, email: `${role}@x`, role, active: true, linkedId } });
    if (url === '/api/permissions') return json(200, DEFAULT_PERMISSIONS);
    if (url === '/api/settings') return json(200, {});
    const r = routes[`${method} ${url.replace(/^\/api/, '')}`];
    if (r === undefined) return json(404, { error: `No route ${url}` });
    const [s, b] = typeof r === 'function' ? (r as () => [number, unknown])() : [200, r];
    return json(s, b);
  }));
  localStorage.setItem('rp_token', 'tok');
}
function Ready() { const { loading, user } = useAuth(); return !loading && user ? <span data-testid="auth-ready" /> : null; }

const base = { state: 'Karnataka', listingPrivacy: 'public', rooms: [], expenses: [], project: 'Sterlitee Regal Park', listingType: 'Housing', baths: 2, areaSqft: 1200, furnished: 'Unfurnished', condition: 'Completed', newConstruction: false, amenities: [], createdAt: '2026-08-31T12:36:00.000Z' };
const SALE = { ...base, id: 'prp-001', code: 'SRP-0001', name: 'Riora Villa R-01', style: 'Villa', status: 'Active', transactionType: 'Sale', price: 45400000, beds: 4, city: 'Bengaluru', approval: 'approved', ownerId: 'own-01', agentId: 'agt-01', brokerId: 'brk-01' };
const RENT = { ...SALE, id: 'prp-002', code: 'SRP-0002', name: 'Regal Flat A-12', transactionType: 'Rent', price: 45000 };

async function detail(prop: any, { role = 'admin' as Role, extra = {} as Routes_, linkedId = undefined as string | undefined, name = undefined as string | undefined } = {}) {
  serve(role, {
    [`GET /properties/${prop.id}`]: prop,
    'GET /owners/own-01': { id: 'own-01', name: 'Ramesh Gowda' },
    'GET /agents/agt-01': { id: 'agt-01', name: 'Priya Nair' },
    'GET /brokers/brk-01': { id: 'brk-01', name: 'Bala Broker' },
    'GET /requests': [],
    ...extra,
  }, linkedId, name);
  render(
    <AuthProvider><ToastProvider><Ready />
      <MemoryRouter initialEntries={[`/properties/${prop.id}`]}>
        <Routes><Route path="/properties/:id" element={<PropertyDetail />} /></Routes>
      </MemoryRouter>
    </ToastProvider></AuthProvider>,
  );
  await screen.findByTestId('auth-ready');
  await screen.findByRole('heading', { name: prop.name });
}
const kv = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling!.textContent;

const ALLOWED = ['Active', 'New', 'Pending Sale', 'Backup'];
const BLOCKED = ['Sold', 'Closed Sale', 'Rented', 'Withdrawn', 'Cancelled', 'Expired', 'Temp off Market', 'Pending'];

describe('V1.b PropertyDetail request button gated on status', () => {
  it.each(ALLOWED)('approved + %s (sale): "Create buy request" shown', async status => {
    await detail({ ...SALE, status });
    expect(screen.getByText('Create buy request')).toBeTruthy();
  });

  it.each(ALLOWED)('approved + %s (rent): "Create rental request" shown', async status => {
    await detail({ ...RENT, status });
    expect(screen.getByText('Create rental request')).toBeTruthy();
  });

  it.each(BLOCKED)('approved + %s (sale): button hidden', async status => {
    await detail({ ...SALE, status });
    expect(screen.queryByText('Create buy request')).toBeNull();
  });

  it.each(BLOCKED)('approved + %s (rent): button hidden', async status => {
    await detail({ ...RENT, status });
    expect(screen.queryByText('Create rental request')).toBeNull();
  });

  it.each(['pending', 'rejected'])('allowed status Active but approval %s: hidden', async approval => {
    await detail({ ...SALE, approval });
    expect(screen.queryByText('Create buy request')).toBeNull();
  });

  it.each(['active', 'ACTIVE', 'Active ', 'pending sale', ''])('status near-miss %j: hidden (exact match only)', async status => {
    await detail({ ...SALE, status });
    expect(screen.queryByText('Create buy request')).toBeNull();
  });

  it('client (buyRequests create) sees button on approved Active', async () => {
    await detail(SALE, { role: 'client', linkedId: 'cli-10' });
    expect(screen.getByText('Create buy request')).toBeTruthy();
  });

  it('client does not see button on approved Sold', async () => {
    await detail({ ...SALE, status: 'Sold' }, { role: 'client', linkedId: 'cli-10' });
    expect(screen.queryByText('Create buy request')).toBeNull();
  });
});

describe('V1.b PropertyDetail hero badges', () => {
  it('hero shows code, status badge and approval badge', async () => {
    await detail({ ...SALE, status: 'Pending Sale' });
    const hero = document.querySelector('.hero')!;
    expect(hero).toBeTruthy();
    const badges = Array.from(hero.querySelectorAll('.badge')).map(b => b.textContent);
    expect(badges).toEqual(expect.arrayContaining(['SRP-0001', 'Pending Sale', 'approved']));
    expect(hero.querySelector('.hero-pill')).toBeTruthy();
  });
});

describe('V1.b PropertyDetail own-name fallback on 403', () => {
  const denyAll = { 'GET /owners/own-01': deny, 'GET /agents/agt-01': deny, 'GET /brokers/brk-01': deny };

  it('agent: 403 on own agent id shows own name; other ids "—"', async () => {
    await detail(SALE, { role: 'agent', linkedId: 'agt-01', name: 'Agent Self', extra: denyAll });
    await waitFor(() => expect(kv('Agent')).toBe('Agent Self'));
    expect(kv('Owner')).toBe('—');
    expect(kv('Broker')).toBe('—');
  });

  it('owner: 403 on own owner id shows own name', async () => {
    await detail(SALE, { role: 'owner', linkedId: 'own-01', name: 'Owner Self', extra: denyAll });
    await waitFor(() => expect(kv('Owner')).toBe('Owner Self'));
    expect(kv('Agent')).toBe('—');
  });

  it('broker: 403 on own broker id shows own name', async () => {
    await detail(SALE, { role: 'broker', linkedId: 'brk-01', name: 'Broker Self', extra: denyAll });
    await waitFor(() => expect(kv('Broker')).toBe('Broker Self'));
    expect(kv('Owner')).toBe('—');
  });

  it('403 with linkedId that matches no field: all "—"', async () => {
    await detail(SALE, { role: 'agent', linkedId: 'agt-99', name: 'Agent Other', extra: denyAll });
    await new Promise(r => setTimeout(r, 20));
    expect(kv('Owner')).toBe('—');
    expect(kv('Agent')).toBe('—');
    expect(kv('Broker')).toBe('—');
  });

  it('403 with no linkedId: "—" (undefined never matches)', async () => {
    await detail(SALE, { role: 'agent', linkedId: undefined, extra: denyAll });
    await new Promise(r => setTimeout(r, 20));
    expect(kv('Agent')).toBe('—');
  });

  it('property without agentId and user without linkedId: "—" (undefined === undefined not treated as match)', async () => {
    const { agentId, ...noAgent } = SALE;
    await detail(noAgent, { role: 'agent', linkedId: undefined, extra: denyAll });
    await new Promise(r => setTimeout(r, 20));
    expect(kv('Agent')).toBe('—');
  });

  it('successful lookup wins over own-name fallback', async () => {
    await detail(SALE, { role: 'agent', linkedId: 'agt-01', name: 'Agent Self' });
    await waitFor(() => expect(kv('Agent')).toBe('Priya Nair'));
  });

  it('404 (not 403) on own id also falls back to own name (any lookup failure)', async () => {
    await detail(SALE, { role: 'agent', linkedId: 'agt-01', name: 'Agent Self', extra: { 'GET /agents/agt-01': () => [404, { error: 'Not found' }] } });
    await waitFor(() => expect(kv('Agent')).toBe('Agent Self'));
  });
});

describe('V1.c DataTable horizontal scroll wrapper', () => {
  it('wraps the table in .table-scroll', () => {
    render(<DataTable columns={[{ key: 'name', label: 'Name' }]} rows={[{ id: '1', name: 'A' }]} />);
    const table = document.querySelector('table.table')!;
    expect(table.parentElement!.classList.contains('table-scroll')).toBe(true);
  });

  it('wraps the table in .table-scroll even with no rows', () => {
    render(<DataTable columns={[{ key: 'name', label: 'Name' }]} rows={[]} />);
    expect(document.querySelectorAll('.table-scroll')).toHaveLength(1);
    expect(document.querySelector('.table-scroll > table.table')).toBeTruthy();
    expect(document.querySelector('.table-wrap > .table-scroll')).toBeTruthy();
  });
});
