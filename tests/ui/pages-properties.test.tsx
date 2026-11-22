// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import Properties from '../../client/pages/Properties';
import PropertyForm from '../../client/pages/PropertyForm';
import PropertyDetail from '../../client/pages/PropertyDetail';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';

type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';
type Routes_ = Record<string, unknown | ((body: any) => [number, unknown])>;

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
const deny = () => [403, { error: 'Forbidden' }] as [number, unknown];

let fetchMock: ReturnType<typeof vi.fn>;
let calls: { method: string; url: string; body: any }[];
/** Fetch mock acting as the server; unknown routes 404 so wrong paths (e.g. /api/api/...) surface. */
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
function Where() { return <div>AT:{useLocation().pathname}</div>; }

function renderAt(path: string, { probeDetail = false } = {}) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <Ready />
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/properties" element={<><Properties /><Where /></>} />
            <Route path="/properties/new" element={<PropertyForm />} />
            <Route path="/properties/:id/edit" element={<PropertyForm />} />
            <Route path="/properties/:id" element={probeDetail ? <Where /> : <PropertyDetail />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  );
}
const authReady = () => screen.findByTestId('auth-ready');
const toasts = (kind: string) => Array.from(document.querySelectorAll(`.toast-${kind}`)).map(e => e.textContent);

// Fixtures shaped like data/seed.json properties.
const base = { state: 'Karnataka', listingPrivacy: 'public', rooms: [], expenses: [], project: 'Sterlitee Regal Park', listingType: 'Housing', baths: 2, areaSqft: 1200, furnished: 'Unfurnished', condition: 'Completed', newConstruction: false, amenities: [], createdAt: '2026-08-31T12:36:00.000Z' };
const P1 = { ...base, id: 'prp-001', code: 'SRP-0001', name: 'Riora Villa R-01', style: 'Villa', status: 'Active', transactionType: 'Sale', price: 45400000, beds: 4, city: 'Bengaluru', approval: 'approved',
  lat: 12.81864, lng: 77.65926, ownerId: 'own-01', agentId: 'agt-01', amenities: ['Clubhouse', 'Private Cinema'], rooms: [{ type: 'Living Room', level: 'Ground', widthFt: 17, lengthFt: 25 }],
  expenses: [{ label: 'Property tax', amount: 36300 }, { label: 'BBMP khata', amount: 25000 }], reservationAmount: 500000 };
const P2 = { ...base, id: 'prp-002', code: 'SRP-0002', name: 'Regal Flat A-12', style: 'Apartment', status: 'Rented', transactionType: 'Rent', price: 45000, beds: 2, city: 'Bengaluru', approval: 'pending' };
const P3 = { ...base, id: 'prp-003', code: 'SRP-0003', name: 'Corner Plot P-07', project: 'Neotown', style: 'Plot', status: 'Active', transactionType: 'Sale', price: 9000000, beds: 0, city: 'Mysuru', approval: 'rejected', rejectReason: 'Missing khata' };
const ALL = [P1, P2, P3];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Properties list (PLAN §7)', () => {
  const shown = () => ALL.map(p => p.name).filter(n => screen.queryByText(n));
  const load = async (role: Role = 'admin', rows: unknown[] = ALL) => {
    serve(role, { 'GET /properties': rows, 'DELETE /properties/prp-001': { ok: true } });
    renderAt('/properties');
    await authReady();
    if (rows.length) await screen.findByText((rows[0] as any).name);
  };

  it('lists every property with code, city, style, transaction and approval badge', async () => {
    await load();
    expect(shown()).toEqual(ALL.map(p => p.name));
    expect(screen.getByText('SRP-0002')).toBeTruthy();
    expect(screen.getByText('Mysuru')).toBeTruthy();
    expect(called('GET', '/properties')).toHaveLength(1);
  });

  it('empty list shows the empty state, not Loading', async () => {
    await load('admin', []);
    expect(await screen.findByText('No records found.')).toBeTruthy();
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('list load failure shows an error toast', async () => {
    serve('admin', { 'GET /properties': () => [500, { error: 'Disk on fire' }] });
    renderAt('/properties');
    await waitFor(() => expect(toasts('error')).toContain('Disk on fire'));
  });

  it('rent price shows per month, sale price does not', async () => {
    await load();
    expect(screen.getByText('₹45,000/mo')).toBeTruthy();
    const villaRow = screen.getByText('Riora Villa R-01').closest('tr')!;
    expect(villaRow.textContent).not.toContain('/mo');
  });

  it('keyword filter matches name, code, city and project (case-insensitive)', async () => {
    await load();
    const kw = screen.getByPlaceholderText('Keyword');
    fireEvent.change(kw, { target: { value: 'riora' } });
    expect(shown()).toEqual(['Riora Villa R-01']);
    fireEvent.change(kw, { target: { value: 'srp-0002' } });
    expect(shown()).toEqual(['Regal Flat A-12']);
    fireEvent.change(kw, { target: { value: 'MYSURU' } });
    expect(shown()).toEqual(['Corner Plot P-07']);
    fireEvent.change(kw, { target: { value: 'neotown' } });
    expect(shown()).toEqual(['Corner Plot P-07']);
    fireEvent.change(kw, { target: { value: 'zzz' } });
    expect(shown()).toEqual([]);
    expect(screen.getByText('No records found.')).toBeTruthy();
  });

  it('transaction type filter', async () => {
    await load();
    fireEvent.change(screen.getByDisplayValue('All transactions'), { target: { value: 'Rent' } });
    expect(shown()).toEqual(['Regal Flat A-12']);
    fireEvent.change(screen.getByDisplayValue('Rent'), { target: { value: 'Sale' } });
    expect(shown()).toEqual(['Riora Villa R-01', 'Corner Plot P-07']);
  });

  it('status filter', async () => {
    await load();
    fireEvent.change(screen.getByDisplayValue('All statuses'), { target: { value: 'Rented' } });
    expect(shown()).toEqual(['Regal Flat A-12']);
    fireEvent.change(screen.getByDisplayValue('Rented'), { target: { value: 'Sold' } });
    expect(shown()).toEqual([]);
  });

  it('min/max price filters are inclusive on both edges', async () => {
    await load();
    const min = screen.getByPlaceholderText('Min price');
    const max = screen.getByPlaceholderText('Max price');
    fireEvent.change(min, { target: { value: '9000000' } });
    expect(shown()).toEqual(['Riora Villa R-01', 'Corner Plot P-07']);
    fireEvent.change(min, { target: { value: '9000001' } });
    expect(shown()).toEqual(['Riora Villa R-01']);
    fireEvent.change(min, { target: { value: '' } });
    fireEvent.change(max, { target: { value: '9000000' } });
    expect(shown()).toEqual(['Regal Flat A-12', 'Corner Plot P-07']);
    fireEvent.change(max, { target: { value: '8999999' } });
    expect(shown()).toEqual(['Regal Flat A-12']);
  });

  it('min > max yields no rows (and no crash)', async () => {
    await load();
    fireEvent.change(screen.getByPlaceholderText('Min price'), { target: { value: '50000000' } });
    fireEvent.change(screen.getByPlaceholderText('Max price'), { target: { value: '1000000' } });
    expect(shown()).toEqual([]);
    expect(screen.getByText('No records found.')).toBeTruthy();
  });

  it('min beds filter is >= (boundary)', async () => {
    await load();
    const beds = screen.getByPlaceholderText('Min beds');
    fireEvent.change(beds, { target: { value: '2' } });
    expect(shown()).toEqual(['Riora Villa R-01', 'Regal Flat A-12']);
    fireEvent.change(beds, { target: { value: '5' } });
    expect(shown()).toEqual([]);
    fireEvent.change(beds, { target: { value: '0' } });
    expect(shown()).toEqual(ALL.map(p => p.name));
  });

  it('style filter', async () => {
    await load();
    fireEvent.change(screen.getByDisplayValue('All styles'), { target: { value: 'Plot' } });
    expect(shown()).toEqual(['Corner Plot P-07']);
  });

  it('filters combine (Sale + min beds 1)', async () => {
    await load();
    fireEvent.change(screen.getByDisplayValue('All transactions'), { target: { value: 'Sale' } });
    fireEvent.change(screen.getByPlaceholderText('Min beds'), { target: { value: '1' } });
    expect(shown()).toEqual(['Riora Villa R-01']);
  });

  it('admin sees Add New, View, Edit, Delete; Add New navigates to /properties/new', async () => {
    await load('admin');
    expect(screen.getAllByText('Edit')).toHaveLength(3);
    expect(screen.getAllByText('Delete')).toHaveLength(3);
    fireEvent.click(screen.getByText('Add New'));
    expect(await screen.findByText('New Property')).toBeTruthy();
  });

  it('client: Add New, Edit and Delete hidden; View still shown', async () => {
    await load('client');
    expect(screen.queryByText('Add New')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.getAllByText('View')).toHaveLength(3);
  });

  it('staff (V/C/E, no D): Add New and Edit shown, Delete hidden', async () => {
    await load('staff');
    expect(screen.getByText('Add New')).toBeTruthy();
    expect(screen.getAllByText('Edit')).toHaveLength(3);
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('row View / Edit navigate to detail / edit routes', async () => {
    await load('admin');
    fireEvent.click(within(screen.getByText('Riora Villa R-01').closest('tr')!).getByText('Edit'));
    expect(await screen.findByText('Edit Property')).toBeTruthy();
  });

  it('delete asks for confirmation, then DELETEs and reloads with a toast', async () => {
    await load('admin');
    fireEvent.click(within(screen.getByText('Riora Villa R-01').closest('tr')!).getByText('Delete'));
    const dlg = screen.getByRole('dialog');
    expect(dlg.textContent).toContain('Delete Riora Villa R-01? This cannot be undone.');
    expect(called('DELETE', '/properties/prp-001')).toHaveLength(0);
    fireEvent.click(within(dlg).getByText('Delete'));
    await waitFor(() => expect(called('DELETE', '/properties/prp-001')).toHaveLength(1));
    await waitFor(() => expect(called('GET', '/properties')).toHaveLength(2));
    expect(toasts('success')).toContain('Property deleted');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('delete cancel sends nothing', async () => {
    await load('admin');
    fireEvent.click(within(screen.getByText('Riora Villa R-01').closest('tr')!).getByText('Delete'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
  });

  it('delete failure (403) shows error toast and closes the dialog', async () => {
    serve('admin', { 'GET /properties': ALL, 'DELETE /properties/prp-002': deny });
    renderAt('/properties');
    await screen.findByText('Regal Flat A-12');
    await authReady();
    fireEvent.click(within(screen.getByText('Regal Flat A-12').closest('tr')!).getByText('Delete'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    await waitFor(() => expect(toasts('error')).toContain('Forbidden'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PropertyForm (PLAN §7, §5 required fields)', () => {
  const people = { 'GET /owners': [{ id: 'own-01', name: 'Ramesh Gowda', code: 'OWN-0001' }], 'GET /agents': [{ id: 'agt-01', name: 'Priya Nair' }], 'GET /brokers': [{ id: 'brk-01', name: 'Suresh Rao' }] };
  const newForm = async (role: Role = 'admin', extra: Routes_ = {}) => {
    serve(role, { ...people, 'POST /properties': (b: any) => [201, { ...b, id: 'prp-new' }], ...extra });
    renderAt('/properties/new', { probeDetail: true });
    await authReady();
    await screen.findByText('New Property');
  };
  const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const save = () => fireEvent.click(screen.getByText('Save'));
  const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
  const posted = () => called('POST', '/properties')[0]?.body;

  it('empty submit shows required errors for name and price and sends nothing', async () => {
    await newForm();
    save();
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(screen.getByText('Price must be 0 or more')).toBeTruthy();
    expect(called('POST', '/properties')).toHaveLength(0);
  });

  it('whitespace-only name is rejected', async () => {
    await newForm();
    fill('Name *', '   ');
    fill('Price *', '100');
    save();
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(called('POST', '/properties')).toHaveLength(0);
  });

  it('negative price is blocked (boundary -1)', async () => {
    await newForm();
    fill('Name *', 'Villa X');
    fill('Price *', '-1');
    save();
    expect(await screen.findByText('Price must be 0 or more')).toBeTruthy();
    expect(called('POST', '/properties')).toHaveLength(0);
  });

  it('price 0 is allowed (boundary)', async () => {
    await newForm();
    fill('Name *', 'Free Plot');
    fill('Price *', '0');
    save();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted().price).toBe(0);
  });

  it('validation errors jump back to the Property tab', async () => {
    await newForm();
    tab('Rooms');
    save();
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Property' }).getAttribute('aria-selected')).toBe('true');
  });

  it('transaction type defaults to Sale and offers only Sale/Rent', async () => {
    await newForm();
    const sel = screen.getByLabelText('Transaction type *') as HTMLSelectElement;
    expect(sel.value).toBe('Sale');
    expect(Array.from(sel.options).map(o => o.value)).toEqual(['Sale', 'Rent']);
  });

  it('valid submit POSTs /properties with numbers coerced, then navigates to the returned id', async () => {
    await newForm();
    fill('Name *', 'Regal Flat B-01');
    fill('Transaction type *', 'Rent');
    fill('Price *', '52000');
    fill('Beds', '3');
    save();
    expect(await screen.findByText('AT:/properties/prp-new')).toBeTruthy();
    const b = posted();
    expect(b).toMatchObject({ name: 'Regal Flat B-01', transactionType: 'Rent', price: 52000, beds: 3 });
    expect(b).not.toHaveProperty('ownerId');
    expect(b).not.toHaveProperty('agentId');
    expect(b).not.toHaveProperty('brokerId');
    expect(fetchMock.mock.calls.every(([u]) => !String(u).startsWith('/api/api'))).toBe(true);
    expect(toasts('success')).toContain('Property created');
  });

  it('server 400 {field} is shown under that field, toast shown, no navigation', async () => {
    await newForm('admin', { 'POST /properties': () => [400, { error: 'Name already used', field: 'name' }] });
    fill('Name *', 'Dup');
    fill('Price *', '10');
    save();
    expect(await screen.findAllByText('Name already used')).toHaveLength(2); // field error + toast
    expect(document.querySelector('.field-error')!.textContent).toBe('Name already used');
    expect(toasts('error')).toContain('Name already used');
    expect(screen.queryByText(/^AT:/)).toBeNull();
    expect(screen.getByText('Save')).toBeTruthy(); // not stuck on Saving...
  });

  it('server error without field: toast only, no field errors', async () => {
    await newForm('admin', { 'POST /properties': () => [500, { error: 'Boom' }] });
    fill('Name *', 'X');
    fill('Price *', '10');
    save();
    await waitFor(() => expect(toasts('error')).toContain('Boom'));
    expect(document.querySelector('.field-error')).toBeNull();
  });

  it('rooms: add two, edit, remove one, numbers coerced in body', async () => {
    await newForm();
    fill('Name *', 'V');
    fill('Price *', '1');
    tab('Rooms');
    fireEvent.click(screen.getByText('Add room'));
    fireEvent.click(screen.getByText('Add room'));
    expect(screen.getAllByLabelText('Room type')).toHaveLength(2);
    fireEvent.change(screen.getAllByLabelText('Room type')[0], { target: { value: 'Kitchen' } });
    fireEvent.change(screen.getAllByLabelText('Width (ft)')[0], { target: { value: '12' } });
    fireEvent.change(screen.getAllByLabelText('Room type')[1], { target: { value: 'Study' } });
    fireEvent.click(screen.getAllByText('Remove')[1]);
    expect(screen.getAllByLabelText('Room type')).toHaveLength(1);
    expect((screen.getByLabelText('Room type') as HTMLInputElement).value).toBe('Kitchen');
    save();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted().rooms).toEqual([{ type: 'Kitchen', level: 'Ground', widthFt: 12, lengthFt: 10 }]);
  });

  it('rooms: removing the first row keeps the second (index handling)', async () => {
    await newForm();
    tab('Rooms');
    fireEvent.click(screen.getByText('Add room'));
    fireEvent.click(screen.getByText('Add room'));
    fireEvent.change(screen.getAllByLabelText('Room type')[0], { target: { value: 'A' } });
    fireEvent.change(screen.getAllByLabelText('Room type')[1], { target: { value: 'B' } });
    fireEvent.click(screen.getAllByText('Remove')[0]);
    expect(screen.getAllByLabelText('Room type').map(e => (e as HTMLInputElement).value)).toEqual(['B']);
  });

  it('expenses: add + remove rows; amount coerced, blank amount becomes 0', async () => {
    await newForm();
    fill('Name *', 'V');
    fill('Price *', '1');
    tab('Expenses');
    fireEvent.click(screen.getByText('Add expense'));
    fireEvent.click(screen.getByText('Add expense'));
    fireEvent.click(screen.getByText('Add expense'));
    fireEvent.change(screen.getAllByLabelText('Label')[0], { target: { value: 'Property tax' } });
    fireEvent.change(screen.getAllByLabelText('Amount')[0], { target: { value: '36300' } });
    fireEvent.change(screen.getAllByLabelText('Label')[1], { target: { value: 'Khata' } });
    fireEvent.change(screen.getAllByLabelText('Amount')[1], { target: { value: '' } });
    fireEvent.click(screen.getAllByText('Remove')[2]);
    save();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted().expenses).toEqual([{ label: 'Property tax', amount: 36300 }, { label: 'Khata', amount: 0 }]);
  });

  it('amenities toggle on and off', async () => {
    await newForm();
    fill('Name *', 'V');
    fill('Price *', '1');
    tab('Amenities');
    fireEvent.click(screen.getByText('Gym'));
    fireEvent.click(screen.getByText('Clubhouse'));
    expect(screen.getByText('Gym').className).toContain('on');
    fireEvent.click(screen.getByText('Gym'));
    expect(screen.getByText('Gym').className).not.toContain('on');
    save();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted().amenities).toEqual(['Clubhouse']);
  });

  it('assignment selects list owners/agents/brokers; picked owner is sent', async () => {
    await newForm();
    fill('Name *', 'V');
    fill('Price *', '1');
    tab('Assignment');
    expect(await screen.findByText('Ramesh Gowda (OWN-0001)')).toBeTruthy();
    expect(screen.getByLabelText('Agent')).toBeTruthy();
    expect(screen.getByLabelText('Broker')).toBeTruthy();
    fill('Owner', 'own-01');
    save();
    await waitFor(() => expect(posted()).toBeTruthy());
    expect(posted().ownerId).toBe('own-01');
    expect(posted()).not.toHaveProperty('agentId');
  });

  it('403 on /owners, /agents, /brokers hides all assignment selects (§8) and still saves', async () => {
    await newForm('agent', { 'GET /owners': deny, 'GET /agents': deny, 'GET /brokers': deny });
    await waitFor(() => expect(called('GET', '/brokers')).toHaveLength(1));
    tab('Assignment');
    expect(await screen.findByText('Assignment is managed automatically for your account.')).toBeTruthy();
    expect(screen.queryByLabelText('Owner')).toBeNull();
    expect(screen.queryByLabelText('Agent')).toBeNull();
    expect(screen.queryByLabelText('Broker')).toBeNull();
    tab('Property');
    fill('Name *', 'Agent listing');
    fill('Price *', '5');
    save();
    expect(await screen.findByText('AT:/properties/prp-new')).toBeTruthy();
  });

  it('partial 403 (owners only) hides just the Owner select', async () => {
    await newForm('broker', { 'GET /owners': deny });
    tab('Assignment');
    expect(await screen.findByLabelText('Agent')).toBeTruthy();
    expect(screen.queryByLabelText('Owner')).toBeNull();
    expect(screen.queryByText('Assignment is managed automatically for your account.')).toBeNull();
  });

  it('Cancel on new form goes back to /properties', async () => {
    await newForm();
    fireEvent.click(screen.getByText('Cancel'));
    expect(await screen.findByText('AT:/properties')).toBeTruthy();
  });

  describe('edit', () => {
    const editForm = async (extra: Routes_ = {}) => {
      serve('admin', { ...people, 'GET /properties/prp-001': P1, 'PUT /properties/prp-001': (b: any) => [200, { ...P1, ...b }], ...extra });
      renderAt('/properties/prp-001/edit', { probeDetail: true });
      await authReady();
      await screen.findByText('Edit Property');
      await waitFor(() => expect((screen.getByLabelText('Name *') as HTMLInputElement).value).toBe('Riora Villa R-01'));
    };

    it('loads the record into the form (incl. amenities not in the default list)', async () => {
      await editForm();
      expect((screen.getByLabelText('Price *') as HTMLInputElement).value).toBe('45400000');
      tab('Amenities');
      expect(screen.getByText('Private Cinema').className).toContain('on');
      expect(screen.getByText('Clubhouse').className).toContain('on');
      tab('Rooms');
      expect((screen.getByLabelText('Room type') as HTMLInputElement).value).toBe('Living Room');
    });

    it('save PUTs /properties/:id (not POST) and navigates to detail', async () => {
      await editForm();
      fill('Price *', '46000000');
      save();
      expect(await screen.findByText('AT:/properties/prp-001')).toBeTruthy();
      expect(called('POST', '/properties')).toHaveLength(0);
      const b = called('PUT', '/properties/prp-001')[0].body;
      expect(b).toMatchObject({ name: 'Riora Villa R-01', price: 46000000, ownerId: 'own-01', agentId: 'agt-01' });
      expect(toasts('success')).toContain('Property updated');
    });

    it('edit: Cancel returns to the detail page', async () => {
      await editForm();
      fireEvent.click(screen.getByText('Cancel'));
      expect(await screen.findByText('AT:/properties/prp-001')).toBeTruthy();
    });

    it('edit of missing record shows an error toast', async () => {
      serve('admin', { ...people });
      renderAt('/properties/nope/edit', { probeDetail: true });
      await waitFor(() => expect(toasts('error')).toContain('No route GET /properties/nope'));
    });
  });
});

describe('PropertyDetail (PLAN §7, §8)', () => {
  const detail = async (role: Role, prop: any, extra: Routes_ = {}) => {
    serve(role, {
      [`GET /properties/${prop.id}`]: prop,
      'GET /owners/own-01': { id: 'own-01', name: 'Ramesh Gowda' },
      'GET /agents/agt-01': { id: 'agt-01', name: 'Priya Nair' },
      'GET /requests': [
        { id: 'req-b01', number: 'BR-0001', kind: 'buy', propertyId: 'prp-001', clientId: 'cli-10', propertyPrice: 45400000, contractAmount: 45300000, status: 'Complete' },
        { id: 'req-b02', number: 'BR-0002', kind: 'buy', propertyId: 'prp-009', clientId: 'cli-10', propertyPrice: 1, contractAmount: 1, status: 'Submitted' },
      ],
      ...extra,
    });
    renderAt(`/properties/${prop.id}`);
    await authReady();
    await screen.findByRole('heading', { name: prop.name });
  };
  const kv = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling!.textContent;

  it('renders key facts, amenities, rooms, expenses total and linked names', async () => {
    await detail('admin', P1);
    await waitFor(() => expect(kv('Owner')).toBe('Ramesh Gowda'));
    expect(kv('Agent')).toBe('Priya Nair');
    expect(kv('Broker')).toBe('—'); // no brokerId
    expect(screen.getByText('Private Cinema')).toBeTruthy();
    expect(screen.getByText('Living Room')).toBeTruthy();
    expect(screen.getByText('₹61,300')).toBeTruthy();
  });

  it('403 on owner/agent lookups shows "—" instead of crashing (§8)', async () => {
    await detail('agent', P1, { 'GET /owners/own-01': deny, 'GET /agents/agt-01': deny });
    await waitFor(() => expect(called('GET', '/agents/agt-01')).toHaveLength(1));
    expect(kv('Owner')).toBe('—');
    expect(kv('Agent')).toBe('—');
    expect(toasts('error')).toEqual([]);
  });

  it('related requests only for this property', async () => {
    await detail('admin', P1);
    expect(await screen.findByText('BR-0001')).toBeTruthy();
    expect(screen.queryByText('BR-0002')).toBeNull();
  });

  it('403 on /requests shows the empty related-requests message', async () => {
    await detail('owner', P1, { 'GET /requests': deny });
    expect(await screen.findByText('No requests for this property.')).toBeTruthy();
  });

  it('Google Maps link present with lat/lng', async () => {
    await detail('admin', P1);
    const a = screen.getByText('Open in Google Maps') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://www.google.com/maps?q=12.81864,77.65926');
    expect(a.getAttribute('target')).toBe('_blank');
  });

  it('Google Maps link absent when lat/lng missing', async () => {
    await detail('admin', P2);
    expect(screen.queryByText('Open in Google Maps')).toBeNull();
  });

  it('Google Maps link absent when only lat is set', async () => {
    await detail('admin', { ...P2, lat: 12.8 });
    expect(screen.queryByText('Open in Google Maps')).toBeNull();
  });

  it('Google Maps link present at lat/lng 0,0 (falsy boundary)', async () => {
    await detail('admin', { ...P2, lat: 0, lng: 0 });
    expect(screen.getByText('Open in Google Maps').getAttribute('href')).toBe('https://www.google.com/maps?q=0,0');
  });

  it('rent property shows price per month', async () => {
    await detail('admin', P2);
    expect(kv('Price')).toBe('₹45,000/mo');
    expect(screen.getByText('₹45,000/mo', { selector: 'strong' })).toBeTruthy();
  });

  it('missing optional numbers render "—"', async () => {
    await detail('admin', P2);
    expect(kv('Plot (sqft)')).toBe('—');
    expect(kv('Reservation amount')).toBe('—');
  });

  it('rejected property shows the reject reason', async () => {
    await detail('admin', P3);
    expect(screen.getByText('Rejected: Missing khata')).toBeTruthy();
  });

  it('admin: Edit + Create buy request on an approved sale property', async () => {
    await detail('admin', P1);
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Create buy request')).toBeTruthy();
  });

  it('client: no Edit; can create a buy request on approved sale', async () => {
    await detail('client', P1);
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.getByText('Create buy request')).toBeTruthy();
  });

  it('request button hidden when the property is not approved', async () => {
    await detail('admin', P2);
    expect(screen.queryByText('Create rental request')).toBeNull();
    expect(screen.queryByText('Create buy request')).toBeNull();
  });

  it('agent (buyRequests view only): no create-request button', async () => {
    await detail('agent', P1);
    expect(screen.queryByText('Create buy request')).toBeNull();
  });

  it('missing property (404) shows an error toast and stays on Loading', async () => {
    serve('admin', { 'GET /requests': [] });
    renderAt('/properties/ghost');
    await waitFor(() => expect(toasts('error')).toContain('No route GET /properties/ghost'));
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('Edit navigates to the edit form', async () => {
    await detail('admin', P1, { 'GET /owners': [], 'GET /agents': [], 'GET /brokers': [] });
    fireEvent.click(screen.getByText('Edit'));
    expect(await screen.findByText('Edit Property')).toBeTruthy();
  });
});
