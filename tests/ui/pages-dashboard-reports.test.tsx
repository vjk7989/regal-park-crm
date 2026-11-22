// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../client/App';
import { AuthProvider } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import { renderAt, startServer, toastsOf, type Override } from './page-harness';

/** Like renderAt, but only waits for the shell (the page itself may legitimately stay on its own "Loading..."). */
async function renderShell(path: string) {
  render(<AuthProvider><ToastProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ToastProvider></AuthProvider>);
  await screen.findByText('Logout');
}

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks. Stub it here (no source change).
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

const pts = (...xs: [string, number][]) => xs.map(([name, value]) => ({ name, value }));
const DASH = {
  saleIncome: 12500000, rentalIncome: 350000, forSale: 11, sold: 4, selling: 2, forLease: 7, rented: 5, available: 3,
  propertyByStatus: pts(['Active', 10], ['Sold', 4]), buyByStatus: pts(['New', 3]), rentByStatus: pts(['New', 2]),
  requestsByListingType: pts(['Apartment', 5]), topCities: pts(['Pune', 6]), leadsByStatus: pts(['New', 2], ['Lost', 1]),
  leadsBySource: pts(['Website', 3]),
  recentLeads: [{ id: 'l1', name: 'Recent Ravi', phone: '9876543210', source: 'Website', interest: 'Buy', status: 'New', createdAt: '2026-11-20T10:00:00.000Z' }],
  leadsThisMonth: 9, siteVisitsScheduled: 6,
};
const EMPTY_DASH = {
  saleIncome: 0, rentalIncome: 0, forSale: 0, sold: 0, selling: 0, forLease: 0, rented: 0, available: 0,
  propertyByStatus: [], buyByStatus: pts(['New', 0]), rentByStatus: [], requestsByListingType: [], topCities: [],
  leadsByStatus: pts(['New', 0], ['Lost', 0]), leadsBySource: [], recentLeads: [], leadsThisMonth: 0, siteVisitsScheduled: 0,
};
const STAT_LABELS = ['Sale income', 'For sale', 'Sold', 'Selling', 'Rental income', 'For lease', 'Rented', 'Available', 'Leads this month', 'Site visits scheduled'];

const dashServer = (body: unknown = DASH, status = 200) => startServer('admin', {}, (m, p) => (m === 'GET' && p.startsWith('/dashboard') ? [status, body] : undefined));
const statValue = (label: string) => {
  const card = Array.from(document.querySelectorAll('.stat-card')).find(c => c.querySelector('.stat-label')!.textContent === label);
  return card?.querySelector('.stat-value')!.textContent;
};

describe('Dashboard page (PLAN §7)', () => {
  it('renders the 10 stat cards in PLAN order', async () => {
    dashServer();
    await renderAt('/');
    await screen.findByText('Sale income');
    const labels = Array.from(document.querySelectorAll('.stat-card .stat-label')).map(e => e.textContent);
    expect(labels).toEqual(STAT_LABELS);
  });

  it('money cards use formatShort (Cr / L); count cards show raw numbers', async () => {
    dashServer();
    await renderAt('/');
    await screen.findByText('Sale income');
    expect(statValue('Sale income')).toBe('₹1.25 Cr');
    expect(statValue('Rental income')).toBe('₹3.5 L');
    expect(statValue('For sale')).toBe('11');
    expect(statValue('Leads this month')).toBe('9');
    expect(statValue('Site visits scheduled')).toBe('6');
  });

  it('shows the recent leads table', async () => {
    dashServer();
    await renderAt('/');
    expect(await screen.findByText('Recent Ravi')).toBeTruthy();
  });

  it('zero / empty aggregates do not crash and show empty states', async () => {
    dashServer(EMPTY_DASH);
    await renderAt('/');
    await screen.findByText('Sale income');
    expect(document.querySelectorAll('.stat-card').length).toBe(10);
    expect(statValue('Sale income')).toBe('₹0');
    expect(screen.getAllByText('No data for this period.').length).toBe(6);
    expect(screen.getByText('No leads in this period.')).toBeTruthy();
  });

  it('requests /dashboard?period=all by default', async () => {
    const srv = dashServer();
    await renderAt('/');
    await screen.findByText('Sale income');
    expect(srv.calls.some(c => c.path === '/dashboard?period=all')).toBe(true);
  });

  it.each(['month', '3m', 'year'])('selecting period %s calls /dashboard?period=%s', async p => {
    const srv = dashServer();
    await renderAt('/');
    await screen.findByText('Sale income');
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: p } });
    await waitFor(() => expect(srv.calls.some(c => c.path === `/dashboard?period=${p}`)).toBe(true));
    expect((screen.getByLabelText('Period') as HTMLSelectElement).value).toBe(p);
  });

  it('period comes from the URL query param', async () => {
    const srv = dashServer();
    await renderAt('/?period=3m');
    await screen.findByText('Sale income');
    expect(srv.calls.some(c => c.path === '/dashboard?period=3m')).toBe(true);
    expect((screen.getByLabelText('Period') as HTMLSelectElement).value).toBe('3m');
  });

  it('switching back to All time calls period=all', async () => {
    const srv = dashServer();
    await renderAt('/?period=month');
    await screen.findByText('Sale income');
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'all' } });
    await waitFor(() => expect(srv.calls.some(c => c.path === '/dashboard?period=all')).toBe(true));
  });

  it('server error shows an error toast, not a crash', async () => {
    dashServer({ error: 'Boom' }, 500);
    await renderShell('/');
    await waitFor(() => expect(toastsOf('error').join()).toContain('Boom'));
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  });
});

// ---------------- Reports ----------------
const REPORTS: [string, string][] = [
  ['rent-paid', 'Rent Paid'], ['vacant-rental', 'Vacant Rental Properties'], ['rental-units', 'Rental Units'],
  ['delinquent-tenants', 'Delinquent Tenants'], ['leases-ending', 'Leases Ending (90 days)'], ['vacant-sale', 'Vacant Sale Properties'],
  ['sold-units', 'Sold Units'], ['lead-funnel', 'Lead Funnel'],
];
type Rep = { columns: string[]; rows: any[][] };
function reportServer(table: Record<string, Rep | [number, unknown]>) {
  const o: Override = (m, p) => {
    if (m !== 'GET' || !p.startsWith('/reports/')) return undefined;
    const t = table[p.slice('/reports/'.length)] ?? { columns: ['A'], rows: [] };
    return Array.isArray(t) ? t : [200, t];
  };
  return startServer('admin', {}, o);
}
const card = () => document.querySelector('.card') as HTMLElement;
const bodyRows = () => document.querySelectorAll('table.table tbody tr');

describe('Reports page (PLAN §7, §5)', () => {
  it('loads rent-paid first and lists the 8 reports in the picker', async () => {
    const srv = reportServer({});
    await renderAt('/reports');
    await waitFor(() => expect(srv.gets('/reports/rent-paid')).toBe(1));
    const opts = Array.from((screen.getByLabelText('Report') as HTMLSelectElement).options).map(o => o.value);
    expect(opts).toEqual(REPORTS.map(r => r[0]));
  });

  it.each(REPORTS)('picking %s calls /reports/%s and shows its title', async (id, label) => {
    const srv = reportServer({ [id]: { columns: ['Name'], rows: [[`row-of-${id}`]] } });
    await renderAt('/reports');
    await waitFor(() => expect(srv.gets('/reports/rent-paid')).toBe(1));
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: id } });
    await waitFor(() => expect(srv.gets(`/reports/${id}`)).toBeGreaterThan(0));
    expect(await screen.findByText(`row-of-${id}`)).toBeTruthy();
    expect(within(card()).getByRole('heading', { name: label })).toBeTruthy();
  });

  it('empty rows show the empty state and "0 rows"', async () => {
    reportServer({ 'rent-paid': { columns: ['Tenant', 'Amount'], rows: [] } });
    await renderAt('/reports');
    expect(await screen.findByText('No rows for this report.')).toBeTruthy();
    expect(screen.getByText('0 rows')).toBeTruthy();
  });

  it('row count uses singular for 1 row and plural otherwise', async () => {
    reportServer({
      'rent-paid': { columns: ['Tenant'], rows: [['Only']] },
      'sold-units': { columns: ['Unit'], rows: [['U1'], ['U2'], ['U3']] },
    });
    await renderAt('/reports');
    expect(await screen.findByText('1 row')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'sold-units' } });
    expect(await screen.findByText('3 rows')).toBeTruthy();
    expect(bodyRows().length).toBe(3);
  });

  it('money columns are INR-formatted; non-money numbers and strings are not', async () => {
    reportServer({ 'rent-paid': { columns: ['Tenant', 'Amount', 'Months', 'Balance due', 'Rent'], rows: [['Asha', 1250000, 12, 0, 'n/a']] } });
    await renderAt('/reports');
    await screen.findByText('Asha');
    const cells = Array.from(bodyRows()[0].querySelectorAll('td')).map(td => td.textContent);
    expect(cells.slice(0, 5)).toEqual(['Asha', '₹12,50,000', '12', '₹0', 'n/a']);
  });

  it('null cells render blank, not "null"', async () => {
    reportServer({ 'rent-paid': { columns: ['Tenant', 'Amount'], rows: [['Asha', null]] } });
    await renderAt('/reports');
    await screen.findByText('Asha');
    expect(bodyRows()[0].textContent).not.toContain('null');
  });

  it('shows column headers from the server and an Export CSV button', async () => {
    reportServer({ 'rent-paid': { columns: ['Tenant', 'Amount'], rows: [['Asha', 10]] } });
    await renderAt('/reports');
    await screen.findByText('Asha');
    const ths = Array.from(document.querySelectorAll('table.table thead th')).map(th => th.textContent!.replace(/ [▲▼]$/, ''));
    expect(ths.slice(0, 2)).toEqual(['Tenant', 'Amount']);
    expect(screen.getByText('Export CSV')).toBeTruthy();
  });

  it.each([[403, 'Forbidden'], [500, 'Server exploded']])('server %s -> error toast, page still usable', async (status, error) => {
    reportServer({ 'rent-paid': [status, { error }], 'lead-funnel': { columns: ['Stage'], rows: [['New']] } });
    await renderShell('/reports');
    await waitFor(() => expect(toastsOf('error').join()).toContain(error));
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'lead-funnel' } });
    expect(await screen.findByText('1 row')).toBeTruthy();
  });

  it('a slow earlier report does not overwrite the later selection', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const srv = reportServer({ 'sold-units': { columns: ['Unit'], rows: [['LATER']] } });
    const base = srv.fetchMock.getMockImplementation()!;
    srv.fetchMock.mockImplementation(async (url: string, init: any) => {
      if (url === '/api/reports/rent-paid') { await gate; return { ok: true, status: 200, text: async () => JSON.stringify({ columns: ['Unit'], rows: [['EARLIER']] }) }; }
      return base(url, init);
    });
    await renderShell('/reports');
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'sold-units' } });
    expect(await screen.findByText('LATER')).toBeTruthy();
    release();
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText('EARLIER')).toBeNull();
    expect(screen.getByText('LATER')).toBeTruthy();
  });
});
