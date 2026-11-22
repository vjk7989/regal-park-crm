// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import Approvals from '../../client/pages/Approvals';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';

type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';
type Routes_ = Record<string, unknown | ((body: any) => [number, unknown])>;

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });

let fetchMock: ReturnType<typeof vi.fn>;
let calls: { method: string; url: string; body: any }[];
function serve(role: Role, routes: Routes_) {
  calls = [];
  fetchMock = vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url === '/api/auth/me') return json(200, { user: { id: 'u1', name: `${role} user`, email: `${role}@x`, role, active: true } });
    if (url === '/api/permissions') return json(200, DEFAULT_PERMISSIONS);
    if (url === '/api/settings') return json(200, {});
    const key = `${method} ${url.replace(/^\/api/, '')}`;
    const r = routes[key];
    if (r === undefined) return json(404, { error: `No route ${key}` });
    const [s, b] = typeof r === 'function' ? (r as (b: any) => [number, unknown])(body) : [200, r];
    return json(s, b);
  });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('rp_token', 'tok');
}
const called = (method: string, path: string) => calls.filter(c => c.method === method && c.url === `/api${path}`);

function Ready() { const { loading, user } = useAuth(); return !loading && user ? <span data-testid="auth-ready" /> : null; }
const toasts = (kind: string) => Array.from(document.querySelectorAll(`.toast-${kind}`)).map(e => e.textContent);

const base = { state: 'Karnataka', listingPrivacy: 'public', rooms: [], expenses: [], amenities: [], listingType: 'Housing', style: 'Villa', status: 'Pending', transactionType: 'Sale', beds: 3, city: 'Bengaluru' };
const PEND = { ...base, id: 'prp-041', code: 'SRP-0041', name: 'Agent Villa V-41', price: 21000000, approval: 'pending', createdBy: 'usr-agent1', createdAt: '2026-11-01T10:00:00.000Z' };
const PEND2 = { ...base, id: 'prp-042', code: 'SRP-0042', name: 'Owner Flat F-42', price: 38000, transactionType: 'Rent', approval: 'pending', createdBy: 'usr-unknown', createdAt: '2026-11-02T10:00:00.000Z' };
const REJ = { ...base, id: 'prp-043', code: 'SRP-0043', name: 'Broker Plot P-43', price: 7000000, approval: 'rejected', rejectReason: 'Photos missing', createdBy: 'usr-broker1', createdAt: '2026-10-20T10:00:00.000Z' };
const APP = { ...base, id: 'prp-001', code: 'SRP-0001', name: 'Riora Villa R-01', price: 45400000, approval: 'approved', status: 'Active', createdAt: '2026-08-31T12:36:00.000Z' };
const ALL = [PEND, PEND2, REJ, APP];
const USERS = [{ id: 'usr-agent1', name: 'Priya Nair' }, { id: 'usr-broker1', name: 'Suresh Rao' }];

async function open(role: Role = 'admin', extra: Routes_ = {}) {
  serve(role, {
    'GET /properties': ALL, 'GET /users': USERS,
    'POST /properties/prp-041/approve': { ...PEND, approval: 'approved' },
    'POST /properties/prp-043/approve': { ...REJ, approval: 'approved' },
    'POST /properties/prp-041/reject': (b: any) => [200, { ...PEND, approval: 'rejected', rejectReason: b.reason }],
    'POST /properties/prp-001/reject': (b: any) => [200, { ...APP, approval: 'rejected', rejectReason: b.reason }],
    ...extra,
  });
  render(<AuthProvider><ToastProvider><Ready /><MemoryRouter initialEntries={['/approvals']}><Routes><Route path="/approvals" element={<Approvals />} /></Routes></MemoryRouter></ToastProvider></AuthProvider>);
  await screen.findByTestId('auth-ready');
  await screen.findByText('Agent Villa V-41');
}
const shown = () => ALL.map(p => p.name).filter(n => screen.queryByText(n));
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const row = (name: string) => screen.getByText(name).closest('tr')!;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Approvals tabs (PLAN §7)', () => {
  it('Pending tab is default and lists only pending properties', async () => {
    await open();
    expect(screen.getByRole('tab', { name: 'Pending' }).getAttribute('aria-selected')).toBe('true');
    expect(shown()).toEqual(['Agent Villa V-41', 'Owner Flat F-42']);
  });

  it('Rejected tab lists only rejected, with a Reason column', async () => {
    await open();
    expect(screen.queryByText('Reason')).toBeNull();
    tab('Rejected');
    expect(shown()).toEqual(['Broker Plot P-43']);
    expect(screen.getByText('Reason')).toBeTruthy();
    expect(screen.getByText('Photos missing')).toBeTruthy();
  });

  it('Approved tab lists only approved', async () => {
    await open();
    tab('Approved');
    expect(shown()).toEqual(['Riora Villa R-01']);
  });

  it('empty tab shows the empty state', async () => {
    serve('admin', { 'GET /properties': [APP], 'GET /users': USERS });
    render(<AuthProvider><ToastProvider><MemoryRouter><Approvals /></MemoryRouter></ToastProvider></AuthProvider>);
    expect(await screen.findByText('No records found.')).toBeTruthy();
  });

  it('Created by shows user name from /users, falls back to id', async () => {
    await open();
    expect(within(row('Agent Villa V-41')).getByText('Priya Nair')).toBeTruthy();
    expect(within(row('Owner Flat F-42')).getByText('usr-unknown')).toBeTruthy();
  });

  it('403 on /users still renders, showing createdBy ids (§8)', async () => {
    await open('admin', { 'GET /users': () => [403, { error: 'Forbidden' }] });
    expect(within(row('Agent Villa V-41')).getByText('usr-agent1')).toBeTruthy();
    expect(toasts('error')).toEqual([]);
  });

  it('missing createdBy shows "—"', async () => {
    await open();
    tab('Approved');
    expect(within(row('Riora Villa R-01')).getByText('—')).toBeTruthy();
  });

  it('list load failure shows an error toast', async () => {
    serve('admin', { 'GET /properties': () => [500, { error: 'Store unavailable' }], 'GET /users': USERS });
    render(<AuthProvider><ToastProvider><MemoryRouter><Approvals /></MemoryRouter></ToastProvider></AuthProvider>);
    await waitFor(() => expect(toasts('error')).toContain('Store unavailable'));
  });
});

describe('Approve / reject (PLAN §5)', () => {
  it('button set per tab: pending has both, rejected only Approve, approved only Reject', async () => {
    await open();
    expect(within(row('Agent Villa V-41')).getByText('Approve')).toBeTruthy();
    expect(within(row('Agent Villa V-41')).getByText('Reject')).toBeTruthy();
    tab('Rejected');
    expect(within(row('Broker Plot P-43')).getByText('Approve')).toBeTruthy();
    expect(within(row('Broker Plot P-43')).queryByText('Reject')).toBeNull();
    tab('Approved');
    expect(within(row('Riora Villa R-01')).queryByText('Approve')).toBeNull();
    expect(within(row('Riora Villa R-01')).getByText('Reject')).toBeTruthy();
  });

  it('Approve POSTs /properties/:id/approve, toasts and reloads', async () => {
    await open();
    fireEvent.click(within(row('Agent Villa V-41')).getByText('Approve'));
    await waitFor(() => expect(called('POST', '/properties/prp-041/approve')).toHaveLength(1));
    await waitFor(() => expect(called('GET', '/properties')).toHaveLength(2));
    expect(toasts('success')).toContain('Agent Villa V-41 approved');
  });

  it('re-approving a rejected property POSTs approve', async () => {
    await open();
    tab('Rejected');
    fireEvent.click(within(row('Broker Plot P-43')).getByText('Approve'));
    await waitFor(() => expect(called('POST', '/properties/prp-043/approve')).toHaveLength(1));
  });

  it('approve failure shows error toast and does not reload', async () => {
    await open('admin', { 'POST /properties/prp-041/approve': () => [403, { error: 'Forbidden' }] });
    fireEvent.click(within(row('Agent Villa V-41')).getByText('Approve'));
    await waitFor(() => expect(toasts('error')).toContain('Forbidden'));
    expect(called('GET', '/properties')).toHaveLength(1);
  });

  it('Reject opens a modal; empty reason is blocked', async () => {
    await open();
    fireEvent.click(within(row('Agent Villa V-41')).getByText('Reject'));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Reject Agent Villa V-41')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    expect(await within(dlg).findByText('Reason is required')).toBeTruthy();
    expect(calls.some(c => c.url.endsWith('/reject'))).toBe(false);
  });

  it('whitespace-only reason is blocked', async () => {
    await open();
    fireEvent.click(within(row('Agent Villa V-41')).getByText('Reject'));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: '   ' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    expect(await within(dlg).findByText('Reason is required')).toBeTruthy();
    expect(calls.some(c => c.url.endsWith('/reject'))).toBe(false);
  });

  it('reject with reason POSTs {reason}, closes modal, toasts and reloads', async () => {
    await open();
    fireEvent.click(within(row('Agent Villa V-41')).getByText('Reject'));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: 'RERA number missing' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(called('POST', '/properties/prp-041/reject')).toHaveLength(1));
    expect(called('POST', '/properties/prp-041/reject')[0].body).toEqual({ reason: 'RERA number missing' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(called('GET', '/properties')).toHaveLength(2));
    expect(toasts('success')).toContain('Property rejected');
  });

  it('rejecting an approved property also works (approved tab)', async () => {
    await open();
    tab('Approved');
    fireEvent.click(within(row('Riora Villa R-01')).getByText('Reject'));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: 'Sold offline' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(called('POST', '/properties/prp-001/reject')[0]?.body).toEqual({ reason: 'Sold offline' }));
  });

  it('reject server error is shown inside the modal, which stays open', async () => {
    await open('admin', { 'POST /properties/prp-041/reject': () => [400, { error: 'Reason too short' }] });
    fireEvent.click(within(row('Agent Villa V-41')).getByText('Reject'));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: 'x' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    expect(await within(dlg).findByText('Reason too short')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reject Cancel closes the modal without a request', async () => {
    await open();
    fireEvent.click(within(row('Agent Villa V-41')).getByText('Reject'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('staff (approvals view only): no Approve/Reject buttons, no Actions column', async () => {
    await open('staff');
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
    expect(screen.queryByText('Actions')).toBeNull();
    tab('Rejected');
    expect(screen.queryByText('Approve')).toBeNull();
  });

  it('api paths have no /api/api double prefix', async () => {
    await open();
    expect(fetchMock.mock.calls.every(([u]) => !String(u).startsWith('/api/api'))).toBe(true);
  });
});
