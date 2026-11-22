// @vitest-environment jsdom
// PLAN §10.4: Main Dashboard (Overview) at "/" for roles with m:sales or m:projects view; others get the Real Estate dashboard.
// Overview normalizes /overview (missing arrays -> [], totals -> 0; non-object / array -> error + Retry).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../client/pages/Dashboard', () => ({ default: () => 'RE_DASHBOARD_PAGE' }));

import { DEFAULT_PERMISSIONS } from '../../shared/permissions';
import { REGISTRY } from '../../shared/registry';
import { renderAt, startServer, type Role } from './page-harness';

if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const FULL = {
  bars: [{ label: 'Invoices awaiting payment', value: 3, total: 12 }, { label: 'Tasks not finished', value: 0, total: 0 }],
  invoiceOverview: [{ status: 'Paid', count: 4, percent: 33 }, { status: 'Overdue', count: 2, percent: 17 }],
  estimateOverview: [{ status: 'Sent', count: 5, percent: 50 }],
  proposalOverview: [],
  totals: { outstanding: 125000, pastDue: 40000, paid: 1250000 },
  leadsByStatus: [{ name: 'New', value: 3 }, { name: 'Won', value: 1 }],
  projectsByStatus: [{ name: 'Open', value: 0 }],
  myTasks: [{ id: 't1', name: 'Call vendor', status: 'In Progress', dueDate: '2026-11-25', mine: true }],
  upcoming: [
    { id: 'u1', title: 'Kickoff', date: '2026-11-28', module: 'projects', entity: 'projects_projects' },
    { id: 'u2', title: 'Orphan event', date: '2026-11-29', module: 'zz_none', entity: 'zz_none' },
  ],
};

let payload: () => [number, unknown];
function serve(role: Role = 'admin', matrix: unknown = DEFAULT_PERMISSIONS) {
  return startServer(role, {}, (m, p) => (m === 'GET' && p === '/overview' ? payload() : undefined), matrix);
}
const main = () => document.querySelector('.main') as HTMLElement;
const overviewGets = (srv: ReturnType<typeof serve>) => srv.calls.filter(c => c.path === '/overview').length;

beforeEach(() => { localStorage.clear(); payload = () => [200, FULL]; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Overview (Main Dashboard at /)', () => {
  it('full payload: tiles, status overviews, totals (INR), donuts, tasks and upcoming lists', async () => {
    serve();
    await renderAt('/');
    const m = within(main());
    expect(await m.findByText('Invoices awaiting payment')).toBeTruthy();
    expect(m.getByText('3 / 12')).toBeTruthy();
    expect(m.getByText('25%')).toBeTruthy();
    expect(m.getByText('0 / 0')).toBeTruthy(); // total 0 -> no divide-by-zero
    expect(m.getByText('0%')).toBeTruthy();
    for (const t of ['Invoice overview', 'Estimate overview', 'Proposal overview']) expect(m.getByText(t)).toBeTruthy();
    expect(m.getByText('4 (33%)')).toBeTruthy();
    expect(m.getByText('No data.')).toBeTruthy(); // empty proposal overview
    expect(m.getByText('₹1,25,000')).toBeTruthy();
    expect(m.getByText('₹40,000')).toBeTruthy();
    expect(m.getByText('₹12,50,000')).toBeTruthy();
    expect(m.getByText('Leads overview')).toBeTruthy();
    expect(m.getByText('Projects')).toBeTruthy();
    expect(m.getByText('No data yet.')).toBeTruthy(); // projects donut with only zero values
    expect(m.getByText('Call vendor')).toBeTruthy();
    expect(m.getByText('25 Nov 2026')).toBeTruthy();
    const proj = REGISTRY.find(x => x.key === 'projects')?.pages.find(p => p.entity === 'projects_projects');
    expect(m.getByRole('link', { name: 'Kickoff' }).getAttribute('href')).toBe(proj ? `/m/projects/${proj.key}` : '/m/projects');
    expect(m.getByRole('link', { name: 'Orphan event' }).getAttribute('href')).toBe('/m/zz_none');
    expect(m.getByRole('link', { name: 'Real Estate dashboard' }).getAttribute('href')).toBe('/real-estate');
    expect(screen.queryByText('RE_DASHBOARD_PAGE')).toBeNull();
  });

  it('empty object payload renders every section with empty states and zero totals (no crash)', async () => {
    payload = () => [200, {}];
    serve();
    await renderAt('/');
    const m = within(main());
    expect(await m.findByText('Sales overview')).toBeTruthy();
    expect(m.getAllByText('No data.')).toHaveLength(3);
    expect(m.getAllByText('₹0')).toHaveLength(3);
    expect(m.getAllByText('No data yet.')).toHaveLength(2);
    expect(m.getByText('No open tasks.')).toBeTruthy();
    expect(m.getByText('Nothing upcoming.')).toBeTruthy();
    expect(main().querySelectorAll('.stat-grid .stat-card')).toHaveLength(0);
  });

  it('partial payload (missing keys, wrong types, partial totals) renders without crashing', async () => {
    payload = () => [200, { bars: [{ label: 'Only tile', value: 1, total: 2 }], myTasks: 'nope', leadsByStatus: null, totals: { paid: 500 } }];
    serve();
    await renderAt('/');
    const m = within(main());
    expect(await m.findByText('Only tile')).toBeTruthy();
    expect(m.getByText('₹500')).toBeTruthy();
    expect(m.getAllByText('₹0')).toHaveLength(2);
    expect(m.getByText('No open tasks.')).toBeTruthy();
    expect(screen.queryByText(/Could not load data/)).toBeNull();
  });

  for (const [name, resp] of [['array response []', [200, []]], ['server 500', [500, { error: 'down' }]], ['null body', [200, null]]] as [string, [number, unknown]][]) {
    it(`${name} -> error with Retry; Retry re-requests and recovers`, async () => {
      payload = () => resp;
      const srv = serve();
      await renderAt('/');
      expect(await screen.findByText(/Could not load data/)).toBeTruthy();
      expect(within(main()).queryByText('Sales overview')).toBeNull();
      payload = () => [200, FULL];
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await within(main()).findByText('Invoices awaiting payment')).toBeTruthy();
      expect(screen.queryByText(/Could not load data/)).toBeNull();
      expect(overviewGets(srv)).toBe(2);
    });
  }
});

describe('"/" picks Overview vs Real Estate dashboard by permission', () => {
  it.each(['client', 'owner', 'agent', 'broker'] as Role[])('%s (no m:sales / m:projects) sees the Real Estate dashboard, no /overview call', async role => {
    const srv = serve(role);
    await renderAt('/');
    expect(await screen.findByText('RE_DASHBOARD_PAGE')).toBeTruthy();
    expect(overviewGets(srv)).toBe(0);
  });

  it('staff (default m:sales view) sees Overview', async () => {
    serve('staff');
    await renderAt('/');
    expect(await within(main()).findByText('Sales overview')).toBeTruthy();
  });

  it('staff with only m:projects view still sees Overview', async () => {
    const m = clone(DEFAULT_PERMISSIONS) as any;
    delete m.staff['m:sales'];
    m.staff['m:projects'] = ['view'];
    serve('staff', m);
    await renderAt('/');
    expect(await within(main()).findByText('Sales overview')).toBeTruthy();
  });

  it('staff with m:sales and m:projects revoked falls back to the Real Estate dashboard', async () => {
    const m = clone(DEFAULT_PERMISSIONS) as any;
    delete m.staff['m:sales'];
    delete m.staff['m:projects'];
    const srv = serve('staff', m);
    await renderAt('/');
    expect(await screen.findByText('RE_DASHBOARD_PAGE')).toBeTruthy();
    expect(overviewGets(srv)).toBe(0);
  });

  it('no m:sales/m:projects and no dashboard view -> Access denied', async () => {
    const m = clone(DEFAULT_PERMISSIONS) as any;
    delete m.client.dashboard;
    serve('client', m);
    await renderAt('/');
    expect(await screen.findByText('Access denied')).toBeTruthy();
  });

  it('/real-estate always shows the Real Estate dashboard for a role with dashboard view', async () => {
    serve('admin');
    await renderAt('/real-estate');
    expect(await screen.findByText('RE_DASHBOARD_PAGE')).toBeTruthy();
  });
});
