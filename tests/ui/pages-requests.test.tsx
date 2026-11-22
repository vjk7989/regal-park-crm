// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import Requests from '../../client/pages/Requests';
import RequestDetail from '../../client/pages/RequestDetail';
import PropertyDetail from '../../client/pages/PropertyDetail';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';

type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';
type Routes_ = Record<string, unknown | ((body: any) => [number, unknown])>;

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
const deny = () => [403, { error: 'Forbidden' }] as [number, unknown];

let fetchMock: ReturnType<typeof vi.fn>;
let calls: { method: string; url: string; body: any }[];
function serve(role: Role, routes: Routes_) {
  calls = [];
  fetchMock = vi.fn(async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url === '/api/auth/me') return json(200, { user: { id: 'u1', name: `${role} user`, email: `${role}@x`, role, active: true, linkedId: role === 'client' ? 'cli-10' : undefined } });
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
/** Mirrors App's route guard: pages mount only once the session is restored. */
function Gate({ children }: { children: React.ReactNode }) { const { loading, user } = useAuth(); return !loading && user ? <>{children}</> : null; }
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; }
const toasts = (kind: string) => Array.from(document.querySelectorAll(`.toast-${kind}`)).map(e => e.textContent);

function renderAt(path: string) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <Ready />
        <Gate>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/buy-requests" element={<><Requests kind="buy" /><Where /></>} />
            <Route path="/rent-requests" element={<><Requests kind="rent" /><Where /></>} />
            <Route path="/requests/:id" element={<RequestDetail />} />
            <Route path="/properties/:id" element={<PropertyDetail />} />
          </Routes>
        </MemoryRouter>
        </Gate>
      </ToastProvider>
    </AuthProvider>,
  );
}

// Fixtures shaped like data/seed.json.
const prop = (id: string, code: string, name: string, transactionType: string, approval: string, price: number) =>
  ({ id, code, name, transactionType, approval, price, status: 'Active', style: 'Villa', listingType: 'Housing', beds: 3, city: 'Bengaluru', rooms: [], expenses: [], amenities: [] });
const PROPS = [
  prop('prp-001', 'SRP-0001', 'Riora Villa R-01', 'Sale', 'approved', 45400000),
  prop('prp-002', 'SRP-0002', 'Regal Flat A-12', 'Rent', 'approved', 45000),
  prop('prp-003', 'SRP-0003', 'Pending Villa V-03', 'Sale', 'pending', 30000000),
  prop('prp-004', 'SRP-0004', 'Rejected Flat F-04', 'Rent', 'rejected', 30000),
  prop('prp-005', 'SRP-0005', 'Corner Plot P-05', 'Sale', 'approved', 9000000),
];
const CLIENTS = [{ id: 'cli-10', code: 'CLI-0010', name: 'Anil Kumar' }, { id: 'cli-11', code: 'CLI-0011', name: 'Kavya Reddy' }];
const req = (o: Record<string, unknown>) => ({ createdAt: '2026-08-10T10:30:00.000Z', inspect: false, termMonths: 0, startDate: '2026-09-17', ...o });
const BUY = [
  req({ id: 'req-b01', number: 'BR-0001', kind: 'buy', propertyId: 'prp-001', clientId: 'cli-10', propertyPrice: 45400000, contractAmount: 45300000, status: 'Complete', contractId: 'con-001', invoiceId: 'inv-001' }),
  req({ id: 'req-b02', number: 'BR-0002', kind: 'buy', propertyId: 'prp-005', clientId: 'cli-11', propertyPrice: 9000000, contractAmount: 8800000, status: 'Submitted' }),
];
const RENT = [req({ id: 'req-r01', number: 'RR-0001', kind: 'rent', propertyId: 'prp-002', clientId: 'cli-10', propertyPrice: 45000, contractAmount: 495000, termMonths: 11, status: 'Approved' })];

const listRoutes = (extra: Routes_ = {}): Routes_ => ({
  'GET /requests?kind=buy': BUY, 'GET /requests?kind=rent': RENT, 'GET /properties': PROPS, 'GET /clients': CLIENTS,
  'POST /requests': (b: any) => [201, { ...b, id: 'req-new', number: 'BR-0016', status: 'Submitted' }],
  ...extra,
});
async function list(kind: 'buy' | 'rent', role: Role = 'admin', extra: Routes_ = {}, query = '') {
  serve(role, listRoutes(extra));
  renderAt(`/${kind}-requests${query}`);
  await screen.findByTestId('auth-ready');
  await screen.findByText(kind === 'buy' ? 'BR-0001' : 'RR-0001');
}
const optionLabels = (sel: HTMLElement) => Array.from((sel as HTMLSelectElement).options).map(o => o.textContent).filter(t => t !== 'Select...');
const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Requests list (PLAN §7)', () => {
  it('buy: title, "Expected buy date" column, fetches /requests?kind=buy, no Term column', async () => {
    await list('buy');
    expect(screen.getByRole('heading', { name: 'Buy Requests' })).toBeTruthy();
    expect(screen.getByText('Expected buy date')).toBeTruthy();
    expect(screen.queryByText('Preferred lease start')).toBeNull();
    expect(screen.queryByText('Term (months)')).toBeNull();
    expect(called('GET', '/requests?kind=buy')).toHaveLength(1);
    expect(called('GET', '/requests?kind=rent')).toHaveLength(0);
  });

  it('rent: title, "Preferred lease start" and Term columns, fetches kind=rent', async () => {
    await list('rent');
    expect(screen.getByRole('heading', { name: 'Rental Requests' })).toBeTruthy();
    expect(screen.getByText('Preferred lease start')).toBeTruthy();
    expect(screen.queryByText('Expected buy date')).toBeNull();
    expect(screen.getByText('Term (months)')).toBeTruthy();
    expect(called('GET', '/requests?kind=rent')).toHaveLength(1);
  });

  it('shows property and client names and Contract / Invoice markers', async () => {
    await list('buy');
    const r1 = screen.getByText('BR-0001').closest('tr')!;
    await waitFor(() => expect(within(r1).getByText('Riora Villa R-01')).toBeTruthy());
    expect(within(r1).getByText('Anil Kumar')).toBeTruthy();
    expect(within(r1).getByText('Contract / Invoice')).toBeTruthy();
    expect(within(screen.getByText('BR-0002').closest('tr')!).getByText('- / -')).toBeTruthy();
  });

  it('status filter narrows rows; a status with no rows shows empty state', async () => {
    await list('buy');
    fireEvent.change(screen.getByDisplayValue('All statuses'), { target: { value: 'Complete' } });
    expect(screen.getByText('BR-0001')).toBeTruthy();
    expect(screen.queryByText('BR-0002')).toBeNull();
    fireEvent.change(screen.getByDisplayValue('Complete'), { target: { value: 'Expired' } });
    expect(screen.queryByText('BR-0001')).toBeNull();
    expect(screen.getByText('No records found.')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Expired'), { target: { value: '' } });
    expect(screen.getByText('BR-0002')).toBeTruthy();
  });

  it('customer filter narrows rows', async () => {
    await list('buy');
    const sel = await screen.findByDisplayValue('All customers');
    fireEvent.change(sel, { target: { value: 'cli-11' } });
    expect(screen.queryByText('BR-0001')).toBeNull();
    expect(screen.getByText('BR-0002')).toBeTruthy();
  });

  it('empty request list shows the empty state', async () => {
    serve('admin', listRoutes({ 'GET /requests?kind=buy': [] }));
    renderAt('/buy-requests');
    expect(await screen.findByText('No records found.')).toBeTruthy();
  });

  it('list error shows toast', async () => {
    serve('admin', listRoutes({ 'GET /requests?kind=buy': () => [500, { error: 'Nope' }] }));
    renderAt('/buy-requests');
    await waitFor(() => expect(toasts('error')).toContain('Nope'));
  });

  it('403 on /clients and /properties lookups shows "—" (§8)', async () => {
    await list('buy', 'agent', { 'GET /clients': deny, 'GET /properties': deny });
    await waitFor(() => expect(called('GET', '/clients')).toHaveLength(1));
    const r1 = screen.getByText('BR-0001').closest('tr')!;
    expect(within(r1).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByDisplayValue('All customers')).toBeNull();
  });

  it('client: does not fetch /clients; own requests show the user name', async () => {
    await list('buy', 'client');
    expect(called('GET', '/clients')).toHaveLength(0);
    expect(within(screen.getByText('BR-0001').closest('tr')!).getByText('client user')).toBeTruthy();
  });

  it('agent (buyRequests view only): New Request hidden', async () => {
    await list('buy', 'agent');
    expect(screen.queryByText('New Request')).toBeNull();
  });

  it('client (buyRequests V/C): New Request shown', async () => {
    await list('buy', 'client');
    expect(screen.getByText('New Request')).toBeTruthy();
  });
});

describe('New Request modal (PLAN §7, §5)', () => {
  const openModal = async (kind: 'buy' | 'rent', role: Role = 'admin', extra: Routes_ = {}) => {
    await list(kind, role, extra);
    fireEvent.click(screen.getByText('New Request'));
    await screen.findByRole('dialog');
  };
  const set = (label: RegExp, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
  const submit = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));
  const posted = () => called('POST', '/requests')[0]?.body;

  it('buy: property select lists only approved Sale properties', async () => {
    await openModal('buy');
    expect(within(dialog()).getByText('New Buy Request')).toBeTruthy();
    expect(optionLabels(within(dialog()).getByLabelText(/Property/))).toEqual(['SRP-0001 - Riora Villa R-01', 'SRP-0005 - Corner Plot P-05']);
  });

  it('rent: property select lists only approved Rent properties; has Term and "Preferred lease start"', async () => {
    await openModal('rent');
    expect(within(dialog()).getByText('New Rental Request')).toBeTruthy();
    expect(optionLabels(within(dialog()).getByLabelText(/Property/))).toEqual(['SRP-0002 - Regal Flat A-12']);
    expect(within(dialog()).getByLabelText(/Preferred lease start/)).toBeTruthy();
    expect(within(dialog()).queryByLabelText(/Expected buy date/)).toBeNull();
    expect((within(dialog()).getByLabelText(/Term \(months\)/) as HTMLInputElement).value).toBe('11');
  });

  it('buy: "Expected buy date" label and no Term field', async () => {
    await openModal('buy');
    expect(within(dialog()).getByLabelText(/Expected buy date/)).toBeTruthy();
    expect(within(dialog()).queryByLabelText(/Term/)).toBeNull();
  });

  it('admin: Client select lists clients', async () => {
    await openModal('buy');
    expect(optionLabels(within(dialog()).getByLabelText(/Client$|Client \*/))).toEqual(['Anil Kumar (CLI-0010)', 'Kavya Reddy (CLI-0011)']);
  });

  it('client role: no Client select', async () => {
    await openModal('buy', 'client');
    expect(within(dialog()).queryByLabelText(/^Client \*$/)).toBeNull();
    expect(within(dialog()).getByLabelText(/Client note/)).toBeTruthy();
  });

  it('required fields (property, client, start date) block submit', async () => {
    await openModal('buy');
    submit();
    expect(await within(dialog()).findByText('Property is required')).toBeTruthy();
    expect(within(dialog()).getByText('Client is required')).toBeTruthy();
    expect(within(dialog()).getByText('Expected buy date is required')).toBeTruthy();
    expect(called('POST', '/requests')).toHaveLength(0);
  });

  it('buy submit: contract amount blank defaults to property price; propertyPrice + kind set; no termMonths', async () => {
    await openModal('buy');
    set(/Property/, 'prp-005');
    set(/Client \*/, 'cli-11');
    set(/Expected buy date/, '2026-12-15');
    submit();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted()).toMatchObject({ kind: 'buy', propertyId: 'prp-005', clientId: 'cli-11', propertyPrice: 9000000, contractAmount: 9000000, startDate: '2026-12-15' });
    expect(posted()).not.toHaveProperty('termMonths');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(called('GET', '/requests?kind=buy')).toHaveLength(2));
    expect(toasts('success')).toContain('Request created');
  });

  it('explicit contract amount is kept (incl. 0 boundary)', async () => {
    await openModal('buy');
    set(/Property/, 'prp-001');
    set(/Client \*/, 'cli-10');
    set(/Contract amount/, '0');
    set(/Expected buy date/, '2026-12-15');
    submit();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted().contractAmount).toBe(0);
  });

  it('rent submit sends termMonths (default 11)', async () => {
    await openModal('rent');
    set(/Property/, 'prp-002');
    set(/Client \*/, 'cli-10');
    set(/Preferred lease start/, '2027-01-01');
    submit();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted()).toMatchObject({ kind: 'rent', propertyId: 'prp-002', termMonths: 11, contractAmount: 45000, propertyPrice: 45000 });
  });

  it('client submit omits clientId (server forces own)', async () => {
    await openModal('buy', 'client');
    set(/Property/, 'prp-001');
    set(/Expected buy date/, '2026-12-15');
    submit();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted()).not.toHaveProperty('clientId');
  });

  it('server error stays in the modal', async () => {
    await openModal('buy', 'admin', { 'POST /requests': () => [400, { error: 'clientId is required', field: 'clientId' }] });
    set(/Property/, 'prp-001');
    set(/Client \*/, 'cli-10');
    set(/Expected buy date/, '2026-12-15');
    submit();
    expect(await within(dialog()).findByText('clientId is required')).toBeTruthy();
  });

  it('?propertyId= opens the modal preselected with contract amount = price', async () => {
    await list('buy', 'admin', {}, '?propertyId=prp-001');
    const dlg = await screen.findByRole('dialog');
    expect((within(dlg).getByLabelText(/Property/) as HTMLSelectElement).value).toBe('prp-001');
    expect((within(dlg).getByLabelText(/Contract amount/) as HTMLInputElement).value).toBe('45400000');
  });

  it('?propertyId= is cleared from the URL when the modal closes', async () => {
    await list('buy', 'admin', {}, '?propertyId=prp-001');
    await screen.findByRole('dialog');
    fireEvent.click(within(dialog()).getByText('Cancel'));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/buy-requests'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('?propertyId= of a non-approved / wrong-kind property is not preselectable', async () => {
    await list('buy', 'admin', {}, '?propertyId=prp-002');
    const dlg = await screen.findByRole('dialog');
    expect((within(dlg).getByLabelText(/Contract amount/) as HTMLInputElement).value).toBe('');
    expect(optionLabels(within(dlg).getByLabelText(/Property/))).not.toContain('SRP-0002 - Regal Flat A-12');
  });

  it('403 on /properties in the modal yields an empty property list, no crash', async () => {
    await openModal('buy', 'admin', { 'GET /properties': deny });
    expect(optionLabels(within(dialog()).getByLabelText(/Property/))).toEqual([]);
  });

  it('PropertyDetail "Create buy request" opens the modal preselected and creates', async () => {
    serve('client', { ...listRoutes(), 'GET /properties/prp-001': PROPS[0], 'GET /requests': [] });
    renderAt('/properties/prp-001');
    await screen.findByTestId('auth-ready');
    fireEvent.click(await screen.findByText('Create buy request'));
    const dlg = await screen.findByRole('dialog');
    expect((within(dlg).getByLabelText(/Contract amount/) as HTMLInputElement).value).toBe('45400000');
    fireEvent.change(within(dlg).getByLabelText(/Expected buy date/), { target: { value: '2026-12-01' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(called('POST', '/requests')[0]?.body).toMatchObject({ kind: 'buy', propertyId: 'prp-001', contractAmount: 45400000 }));
    await waitFor(() => expect(toasts('success')).toContain('Request created'));
  });
});

describe('RequestDetail (PLAN §5, §8)', () => {
  const OPEN = BUY[1];
  const detail = async (role: Role, r: any, extra: Routes_ = {}) => {
    serve(role, {
      [`GET /requests/${r.id}`]: r,
      [`GET /properties/${r.propertyId}`]: PROPS.find(p => p.id === r.propertyId),
      [`GET /clients/${r.clientId}`]: CLIENTS.find(c => c.id === r.clientId),
      [`POST /requests/${r.id}/status`]: (b: any) => [200, { ...r, status: b.status }],
      [`POST /requests/${r.id}/contract`]: [201, { id: 'con-9' }],
      [`POST /requests/${r.id}/invoice`]: [201, { id: 'inv-9' }],
      ...extra,
    });
    renderAt(`/requests/${r.id}`);
    await screen.findByTestId('auth-ready');
    await screen.findByText(new RegExp(`Request ${r.number}$`));
  };
  const moveButtons = () => screen.queryAllByRole('button').filter(b => b.textContent!.startsWith('Move to '));
  const kv = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling!.textContent;

  it('buy summary: title, property/client names, "Expected buy date"', async () => {
    await detail('admin', OPEN);
    expect(screen.getByRole('heading', { name: 'Buy Request BR-0002' })).toBeTruthy();
    await waitFor(() => expect(kv('Client')).toBe('Kavya Reddy'));
    expect(kv('Property')).toBe('Corner Plot P-05');
    expect(screen.getByText('Expected buy date', { selector: 'dt' })).toBeTruthy();
    expect(screen.queryByText('Term', { selector: 'dt' })).toBeNull();
  });

  it('rent summary: "Preferred lease start" and term', async () => {
    await detail('admin', RENT[0]);
    expect(screen.getByRole('heading', { name: 'Rental Request RR-0001' })).toBeTruthy();
    expect(screen.getByText('Preferred lease start', { selector: 'dt' })).toBeTruthy();
    expect(kv('Term')).toBe('11 months');
  });

  it('403 on property/client lookups shows id / "—" (§8)', async () => {
    await detail('agent', OPEN, { 'GET /properties/prp-005': deny, 'GET /clients/cli-11': deny });
    await waitFor(() => expect(called('GET', '/clients/cli-11')).toHaveLength(1));
    expect(kv('Property')).toBe('prp-005');
    expect(kv('Client')).toBe('—');
    expect(toasts('error')).toEqual([]);
  });

  it('open request with edit: one Move-to button per other status', async () => {
    await detail('admin', OPEN);
    const labels = moveButtons().map(b => b.textContent);
    expect(labels).toHaveLength(7);
    expect(labels).not.toContain('Move to Submitted');
    expect(labels).toContain('Move to Approved');
  });

  it('Move to X POSTs /requests/:id/status {status}, toasts and reloads', async () => {
    await detail('admin', OPEN);
    fireEvent.click(screen.getByText('Move to Approved'));
    await waitFor(() => expect(called('POST', '/requests/req-b02/status')).toHaveLength(1));
    expect(called('POST', '/requests/req-b02/status')[0].body).toEqual({ status: 'Approved' });
    await waitFor(() => expect(called('GET', '/requests/req-b02')).toHaveLength(2));
    expect(toasts('success')).toContain('Status set to Approved');
  });

  for (const status of ['Cancelled', 'Complete', 'Expired']) {
    it(`closed request (${status}): no Move-to buttons`, async () => {
      await detail('admin', { ...OPEN, status });
      expect(moveButtons()).toHaveLength(0);
    });
  }

  it('Approved (not closed, boundary) still shows Move-to buttons', async () => {
    await detail('admin', { ...OPEN, status: 'Approved' });
    expect(moveButtons()).toHaveLength(7);
  });

  it('status change server 400 → error toast, buttons re-enabled', async () => {
    await detail('admin', OPEN, { 'POST /requests/req-b02/status': () => [400, { error: 'Request is closed' }] });
    fireEvent.click(screen.getByText('Move to Complete'));
    await waitFor(() => expect(toasts('error')).toContain('Request is closed'));
    expect((screen.getByText('Move to Complete') as HTMLButtonElement).disabled).toBe(false);
  });

  it('without edit (client): no Move-to, no Generate buttons, shows placeholder', async () => {
    await detail('client', OPEN);
    expect(moveButtons()).toHaveLength(0);
    expect(screen.queryByText('Generate contract')).toBeNull();
    expect(screen.queryByText('Generate invoice')).toBeNull();
    expect(screen.getByText('No contract or invoice yet.')).toBeTruthy();
  });

  it('without edit but with documents: links shown, no buttons', async () => {
    await detail('client', BUY[0]);
    expect(screen.getByText('View contracts')).toBeTruthy();
    expect(screen.getByText('View invoices')).toBeTruthy();
    expect(screen.queryByText('Generate invoice')).toBeNull();
  });

  it('Generate contract POSTs /requests/:id/contract and refreshes (links appear)', async () => {
    let r: any = { ...OPEN };
    await detail('admin', OPEN, {
      'GET /requests/req-b02': () => [200, r],
      'POST /requests/req-b02/contract': () => { r = { ...r, contractId: 'con-9' }; return [201, { id: 'con-9' }]; },
    });
    expect(screen.queryByText('View contracts')).toBeNull();
    fireEvent.click(screen.getByText('Generate contract'));
    await waitFor(() => expect(called('POST', '/requests/req-b02/contract')).toHaveLength(1));
    expect(await screen.findByText('View contracts')).toBeTruthy();
    expect(screen.getByText('Open contract record')).toBeTruthy();
    expect(toasts('success')).toContain('Contract ready');
  });

  it('Generate invoice POSTs /requests/:id/invoice and refreshes', async () => {
    let r: any = { ...OPEN };
    await detail('admin', OPEN, {
      'GET /requests/req-b02': () => [200, r],
      'POST /requests/req-b02/invoice': () => { r = { ...r, invoiceId: 'inv-9' }; return [201, { id: 'inv-9' }]; },
    });
    fireEvent.click(screen.getByText('Generate invoice'));
    await waitFor(() => expect(called('POST', '/requests/req-b02/invoice')).toHaveLength(1));
    expect(await screen.findByText('View invoices')).toBeTruthy();
    expect(toasts('success')).toContain('Invoice generated');
  });

  it('existing contract: button reads "Open contract record" and POST returns existing (once)', async () => {
    await detail('admin', { ...OPEN, contractId: 'con-1' });
    fireEvent.click(screen.getByText('Open contract record'));
    await waitFor(() => expect(called('POST', '/requests/req-b02/contract')).toHaveLength(1));
  });

  it('Generate invoice server error → error toast', async () => {
    await detail('admin', OPEN, { 'POST /requests/req-b02/invoice': () => [400, { error: 'Contract amount missing' }] });
    fireEvent.click(screen.getByText('Generate invoice'));
    await waitFor(() => expect(toasts('error')).toContain('Contract amount missing'));
  });

  it('missing request (404) → error toast, stays Loading', async () => {
    serve('admin', {});
    renderAt('/requests/ghost');
    await waitFor(() => expect(toasts('error')).toContain('No route GET /requests/ghost'));
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('notes fall back to "—"', async () => {
    await detail('admin', OPEN);
    expect(kv('Client note')).toBe('—');
    expect(kv('Admin note')).toBe('—');
  });

  it('api paths have no /api/api double prefix', async () => {
    await detail('admin', OPEN);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).startsWith('/api/api'))).toBe(true);
  });
});
