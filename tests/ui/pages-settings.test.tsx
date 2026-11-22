// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../client/App';
import { AuthProvider } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';
import { MODULES, ROLES } from '../../shared/types';
import { REGISTRY } from '../../shared/registry';

// Own fetch mock (page-harness short-circuits /settings and /permissions, which Settings must read AND write).
type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';
interface Call { method: string; path: string; body: any }
type Override = (method: string, path: string, body: any) => [number, unknown] | undefined;
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const SETTINGS = {
  companyName: 'Sterlitee', productName: 'Regal CRM', projectName: 'Sterlitee Regal Park', tagline: 'Live regal', rera: 'RERA-1',
  phone: '9800000000', email: 'info@x.in', address: 'Pune', currency: 'INR', showBrokerPortal: true, requirePropertyApproval: false,
  prefixes: { property: 'SRP-', owner: 'PO-', agent: 'AG-', broker: 'BB-', staff: 'ST-', client: 'CL-', buy: 'BR-', rent: 'RR-', invoice: 'INV-', contract: 'CON-', tenant: 'TN-' },
  nextNumbers: { property: 45, owner: 13, agent: 7, broker: 6, staff: 9, client: 31, buy: 17, rent: 13, invoice: 17, contract: 17, tenant: 10 },
};
const baseDb = () => ({
  plans: [{ id: 'plan-1', name: 'Silver', monthlyListings: 10, rate: 4999, paymentType: 'Monthly', description: 'Ten' }],
  users: [
    { id: 'usr-1', name: 'Admin One', email: 'admin@x', role: 'admin', linkedId: '', active: true },
    { id: 'usr-2', name: 'Owen User', email: 'owner@x', role: 'owner', linkedId: 'own-1', active: true },
  ],
  staff: [{ id: 'stf-1', name: 'Stella Staff' }],
  agents: [{ id: 'agt-1', name: 'Arjun Agent' }, { id: 'agt-2', name: 'Anita Agent' }],
  brokers: [{ id: 'brk-1', name: 'Bala Broker' }],
  owners: [{ id: 'own-1', name: 'Omkar Owner' }],
  clients: [{ id: 'cli-1', name: 'Chitra Client' }],
});

let calls: Call[];
let fetchMock: ReturnType<typeof vi.fn>;
function serve(role: Role = 'admin', override?: Override, matrix: any = DEFAULT_PERMISSIONS) {
  calls = [];
  const db: Record<string, any[]> = baseDb();
  let settings = clone(SETTINGS);
  let perms = clone(matrix);
  let seq = 0;
  fetchMock = vi.fn(async (url: string, init: { method?: string; body?: string }) => {
    const path = url.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if (path === '/auth/me') return json(200, { user: { id: 'u-me', name: `${role} user`, email: `${role}@x`, role, active: true } });
    calls.push({ method, path, body });
    const o = override?.(method, path, body);
    if (o) return json(o[0], o[1]);
    if (path === '/settings') { if (method === 'PUT') settings = { ...settings, ...body }; return json(200, settings); }
    if (path === '/permissions') { if (method === 'PUT') perms = body; return json(200, perms); }
    if (path === '/admin/reset') return json(200, { ok: true });
    const [, col, id] = path.split('/');
    const list = (db[col] ??= []);
    if (method === 'GET') return json(200, list);
    if (method === 'POST') { const r = { id: `new-${++seq}`, ...body }; list.push(r); return json(201, r); }
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return json(404, { error: 'Not found' });
    if (method === 'PUT') { list[i] = { ...list[i], ...body }; return json(200, list[i]); }
    list.splice(i, 1);
    return json(200, { ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('rp_token', 'tok');
  return db;
}
const writes = (method: string, path: string | RegExp) => calls.filter(c => c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path)));
const toastsOf = (kind: string) => Array.from(document.querySelectorAll(`.toast-${kind}`)).map(t => t.textContent ?? '');

async function open(tab?: string) {
  render(<AuthProvider><ToastProvider><MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter></ToastProvider></AuthProvider>);
  await screen.findByText('Logout');
  await screen.findByRole('heading', { name: 'Settings' });
  if (tab) fireEvent.click(screen.getByRole('tab', { name: tab }));
}
const modal = () => document.querySelector('form.modal') as HTMLFormElement;
const f = (name: string) => document.getElementById(`f-${name}`) as HTMLInputElement & HTMLSelectElement;
const rowWith = (text: string) => Array.from(document.querySelectorAll('table.table tbody tr')).find(tr => tr.textContent!.includes(text)) as HTMLElement;
const optionLabels = (sel: HTMLSelectElement) => Array.from(sel.options).map(o => o.textContent);
const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/settings', assign: vi.fn(), reload: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Settings tabs (PLAN §7)', () => {
  it('shows the 6 tabs, General first', async () => {
    serve();
    await open();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['General', 'Prefixes', 'Plans', 'Users', 'Permissions', 'Data']);
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
  });

  it.each([
    ['General', 'Company name'], ['Prefixes', 'Number prefixes'], ['Plans', 'Silver'],
    ['Users', 'Owen User'], ['Permissions', 'Save permissions'], ['Data', 'Reset demo data'],
  ])('%s tab renders (%s)', async (tab, marker) => {
    serve();
    await open(tab);
    expect(await screen.findByText(marker)).toBeTruthy();
  });

  it('GET /settings failure -> error toast, tabs still render', async () => {
    serve('admin', (m, p) => (m === 'GET' && p === '/settings' ? [500, { error: 'Settings down' }] : undefined));
    await open();
    await waitFor(() => expect(toastsOf('error').join()).toContain('Settings down'));
    expect(screen.getAllByRole('tab').length).toBe(6);
  });
});

describe('General tab', () => {
  it('loads values and PUTs /settings with toggles as booleans (no prefixes/nextNumbers/currency)', async () => {
    serve();
    await open();
    const company = (await screen.findByLabelText('Company name')) as HTMLInputElement;
    expect(company.value).toBe('Sterlitee');
    fireEvent.change(company, { target: { value: 'NewCo' } });
    fireEvent.click(screen.getByLabelText('Show broker portal'));
    fireEvent.click(screen.getByLabelText('Require property approval'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes('PUT', '/settings').length).toBe(1));
    const b = writes('PUT', '/settings')[0].body;
    expect(b.companyName).toBe('NewCo');
    expect(b.showBrokerPortal).toBe(false);
    expect(b.requirePropertyApproval).toBe(true);
    expect(typeof b.showBrokerPortal).toBe('boolean');
    expect(typeof b.requirePropertyApproval).toBe('boolean');
    expect(b).not.toHaveProperty('prefixes');
    expect(b).not.toHaveProperty('nextNumbers');
    expect(b).not.toHaveProperty('currency');
    expect(await screen.findByText('Settings saved')).toBeTruthy();
  });

  it('empty text field is sent as an empty string, not dropped or null', async () => {
    serve();
    await open();
    fireEvent.change(await screen.findByLabelText('Tagline'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes('PUT', '/settings').length).toBe(1));
    expect(writes('PUT', '/settings')[0].body.tagline).toBe('');
  });

  it('PUT 400 -> error toast, no crash', async () => {
    serve('admin', (m, p) => (m === 'PUT' && p === '/settings' ? [400, { error: 'Invalid email' }] : undefined));
    await open();
    await screen.findByLabelText('Company name');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toastsOf('error').join()).toContain('Invalid email'));
    expect(screen.getByLabelText('Company name')).toBeTruthy();
  });
});

describe('Prefixes tab', () => {
  it('PUTs prefixes and nextNumbers with every next number as a number', async () => {
    serve();
    await open('Prefixes');
    fireEvent.change(await screen.findByLabelText('property prefix'), { target: { value: 'PRP-' } });
    fireEvent.change(screen.getByLabelText('property next number'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save prefixes' }));
    await waitFor(() => expect(writes('PUT', '/settings').length).toBe(1));
    const b = writes('PUT', '/settings')[0].body;
    expect(Object.keys(b).sort()).toEqual(['nextNumbers', 'prefixes']);
    expect(b.prefixes.property).toBe('PRP-');
    expect(b.prefixes.owner).toBe('PO-');
    expect(b.nextNumbers.property).toBe(50);
    expect(Object.keys(b.nextNumbers).sort()).toEqual(Object.keys(SETTINGS.nextNumbers).sort());
    for (const [k, v] of Object.entries(b.nextNumbers)) expect(typeof v, k).toBe('number');
    expect(await screen.findByText('Prefixes saved')).toBeTruthy();
  });

  it('shows one row per prefix key', async () => {
    serve();
    await open('Prefixes');
    await screen.findByLabelText('tenant prefix');
    for (const k of Object.keys(SETTINGS.prefixes)) expect(screen.getByLabelText(`${k} next number`)).toBeTruthy();
  });

  it('PUT 403 -> error toast', async () => {
    serve('admin', (m, p) => (m === 'PUT' && p === '/settings' ? [403, { error: 'Forbidden' }] : undefined));
    await open('Prefixes');
    fireEvent.click(await screen.findByRole('button', { name: 'Save prefixes' }));
    await waitFor(() => expect(toastsOf('error').join()).toContain('Forbidden'));
  });
});

describe('Plans tab', () => {
  it('lists plans with INR rate', async () => {
    serve();
    await open('Plans');
    await screen.findByText('Silver');
    expect(rowWith('Silver').textContent).toContain('₹4,999');
  });

  it('Add plan POSTs /plans with numeric fields', async () => {
    serve();
    await open('Plans');
    await screen.findByText('Silver');
    fireEvent.click(screen.getByRole('button', { name: 'Add plan' }));
    fireEvent.change(f('name'), { target: { value: 'Gold' } });
    fireEvent.change(f('monthlyListings'), { target: { value: '25' } });
    fireEvent.change(f('rate'), { target: { value: '9999' } });
    fireEvent.submit(modal());
    await waitFor(() => expect(writes('POST', '/plans').length).toBe(1));
    expect(writes('POST', '/plans')[0].body).toMatchObject({ name: 'Gold', monthlyListings: 25, rate: 9999, paymentType: 'Monthly' });
    expect(await screen.findByText('Gold')).toBeTruthy();
  });

  it('Add plan with blank name is rejected client-side (no POST)', async () => {
    serve();
    await open('Plans');
    await screen.findByText('Silver');
    fireEvent.click(screen.getByRole('button', { name: 'Add plan' }));
    fireEvent.submit(modal());
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(writes('POST', '/plans').length).toBe(0);
  });

  it('Edit PUTs /plans/:id', async () => {
    serve();
    await open('Plans');
    await screen.findByText('Silver');
    fireEvent.click(within(rowWith('Silver')).getByRole('button', { name: 'Edit' }));
    expect(f('name').value).toBe('Silver');
    fireEvent.change(f('rate'), { target: { value: '5999' } });
    fireEvent.submit(modal());
    await waitFor(() => expect(writes('PUT', '/plans/plan-1').length).toBe(1));
    expect(writes('PUT', '/plans/plan-1')[0].body.rate).toBe(5999);
  });

  it('Delete asks for confirmation, Cancel sends nothing, Delete sends DELETE /plans/:id', async () => {
    serve();
    await open('Plans');
    await screen.findByText('Silver');
    fireEvent.click(within(rowWith('Silver')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(writes('DELETE', /plans/).length).toBe(0);
    fireEvent.click(within(rowWith('Silver')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(writes('DELETE', '/plans/plan-1').length).toBe(1));
    await waitFor(() => expect(screen.queryByText('Silver')).toBeNull());
  });

  it('Delete 400 -> error toast, plan stays', async () => {
    serve('admin', (m, p) => (m === 'DELETE' && p === '/plans/plan-1' ? [400, { error: 'Plan in use' }] : undefined));
    await open('Plans');
    await screen.findByText('Silver');
    fireEvent.click(within(rowWith('Silver')).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toastsOf('error').join()).toContain('Plan in use'));
    expect(screen.getByText('Silver')).toBeTruthy();
  });
});

describe('Users tab', () => {
  it('shows linked record names from the role collection', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    await waitFor(() => expect(rowWith('Owen User').textContent).toContain('Omkar Owner'));
  });

  it('create: POST /users with role and a linkedId from that role\'s collection', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    fireEvent.change(f('name'), { target: { value: 'New Agent' } });
    fireEvent.change(f('email'), { target: { value: 'na@x.in' } });
    fireEvent.change(f('role'), { target: { value: 'agent' } });
    await waitFor(() => expect(optionLabels(f('linkedId'))).toContain('Anita Agent'));
    fireEvent.change(f('password'), { target: { value: 'secret1' } });
    fireEvent.change(f('linkedId'), { target: { value: 'agt-2' } });
    fireEvent.submit(modal());
    await waitFor(() => expect(writes('POST', '/users').length).toBe(1));
    expect(writes('POST', '/users')[0].body).toMatchObject({ name: 'New Agent', email: 'na@x.in', role: 'agent', linkedId: 'agt-2', password: 'secret1', active: true });
    expect(await screen.findByText('User saved')).toBeTruthy();
  });

  it('create requires a password (no POST when blank)', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    fireEvent.change(f('name'), { target: { value: 'X' } });
    fireEvent.change(f('email'), { target: { value: 'x@x.in' } });
    fireEvent.submit(modal());
    expect(await screen.findByText(/Password is required/)).toBeTruthy();
    expect(writes('POST', '/users').length).toBe(0);
  });

  it('role change swaps the linked-record list', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    await waitFor(() => expect(optionLabels(f('linkedId'))).toEqual(['Select...', 'Stella Staff']));
    fireEvent.change(f('role'), { target: { value: 'client' } });
    await waitFor(() => expect(optionLabels(f('linkedId'))).toEqual(['Select...', 'Chitra Client']));
    fireEvent.change(f('role'), { target: { value: 'broker' } });
    await waitFor(() => expect(optionLabels(f('linkedId'))).toEqual(['Select...', 'Bala Broker']));
    fireEvent.change(f('role'), { target: { value: 'admin' } });
    await waitFor(() => expect(optionLabels(f('linkedId'))).toEqual(['Select...']));
  });

  it('a linkedId picked for one role is cleared if the role changes before save', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    fireEvent.change(f('name'), { target: { value: 'Switcher' } });
    fireEvent.change(f('email'), { target: { value: 's@x.in' } });
    fireEvent.change(f('password'), { target: { value: 'pw1234' } });
    fireEvent.change(f('role'), { target: { value: 'agent' } });
    await waitFor(() => expect(optionLabels(f('linkedId'))).toContain('Arjun Agent'));
    fireEvent.change(f('linkedId'), { target: { value: 'agt-1' } });
    fireEvent.change(f('role'), { target: { value: 'client' } });
    fireEvent.submit(modal());
    await waitFor(() => expect(writes('POST', '/users').length).toBe(1));
    const b = writes('POST', '/users')[0].body;
    expect(b.role).toBe('client');
    expect(b.linkedId).not.toBe('agt-1');
  });

  it('edit with blank password does not send a password', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(within(rowWith('Owen User')).getByRole('button', { name: 'Edit' }));
    expect(f('password').value).toBe('');
    expect(f('role').value).toBe('owner');
    await waitFor(() => expect(f('linkedId').value).toBe('own-1'));
    fireEvent.change(f('name'), { target: { value: 'Owen Renamed' } });
    fireEvent.submit(modal());
    await waitFor(() => expect(writes('PUT', '/users/usr-2').length).toBe(1));
    const b = writes('PUT', '/users/usr-2')[0].body;
    expect(b).not.toHaveProperty('password');
    expect(b).toMatchObject({ name: 'Owen Renamed', role: 'owner', linkedId: 'own-1' });
  });

  it('edit with a new password sends it', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(within(rowWith('Owen User')).getByRole('button', { name: 'Edit' }));
    fireEvent.change(f('password'), { target: { value: 'newpass' } });
    fireEvent.submit(modal());
    await waitFor(() => expect(writes('PUT', '/users/usr-2').length).toBe(1));
    expect(writes('PUT', '/users/usr-2')[0].body.password).toBe('newpass');
  });

  it('403 on a linked collection does not crash; other roles still list', async () => {
    serve('admin', (m, p) => (m === 'GET' && p === '/owners' ? [403, { error: 'Forbidden' }] : undefined));
    await open('Users');
    await screen.findByText('Owen User');
    expect(rowWith('Owen User').textContent).toContain('—');
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    fireEvent.change(f('role'), { target: { value: 'owner' } });
    await waitFor(() => expect(optionLabels(f('linkedId'))).toEqual(['Select...']));
    fireEvent.change(f('role'), { target: { value: 'agent' } });
    await waitFor(() => expect(optionLabels(f('linkedId'))).toContain('Arjun Agent'));
  });

  it('editing a user whose linked collection 403s keeps its existing linkedId', async () => {
    serve('admin', (m, p) => (m === 'GET' && p === '/owners' ? [403, { error: 'Forbidden' }] : undefined));
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(within(rowWith('Owen User')).getByRole('button', { name: 'Edit' }));
    fireEvent.change(f('name'), { target: { value: 'Owen Renamed' } });
    fireEvent.submit(modal());
    await waitFor(() => expect(writes('PUT', '/users/usr-2').length).toBe(1));
    expect(writes('PUT', '/users/usr-2')[0].body.linkedId).toBe('own-1');
  });

  it('POST 400 shows the error inside the form and keeps it open', async () => {
    serve('admin', (m, p) => (m === 'POST' && p === '/users' ? [400, { error: 'Email already used', field: 'email' }] : undefined));
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    fireEvent.change(f('name'), { target: { value: 'Dup' } });
    fireEvent.change(f('email'), { target: { value: 'admin@x' } });
    fireEvent.change(f('password'), { target: { value: 'pw' } });
    fireEvent.submit(modal());
    expect(await screen.findByText('Email already used')).toBeTruthy();
    expect(modal()).toBeTruthy();
  });

  it('Delete user confirms then DELETE /users/:id', async () => {
    serve();
    await open('Users');
    await screen.findByText('Owen User');
    fireEvent.click(within(rowWith('Owen User')).getByRole('button', { name: 'Delete' }));
    expect(writes('DELETE', /users/).length).toBe(0);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(writes('DELETE', '/users/usr-2').length).toBe(1));
  });
});

describe('Permissions tab (PLAN §4)', () => {
  const box = (r: string, m: string, a: string) => screen.getByLabelText(`${r} ${m} ${a}`) as HTMLInputElement;

  it('renders one checkbox per role x module x action reflecting the matrix', async () => {
    serve();
    await open('Permissions');
    await screen.findByText('Save permissions');
    // ADR-9 / PLAN §10.2: rows = core MODULES + one m:<key> row per registry module.
    expect(document.querySelectorAll('input[type=checkbox]').length).toBe(ROLES.length * (MODULES.length + REGISTRY.length) * 4);
    expect(box('client', 'leads', 'view').checked).toBe(false);
    expect(box('staff', 'leads', 'view').checked).toBe(true);
    if (REGISTRY.length) {
      const k = `m:${REGISTRY[0].key}`;
      expect(box('admin', k, 'delete').checked).toBe(true);
      expect(box('client', k, 'view').checked).toBe(false);
    }
  });

  it('toggling a checkbox and saving PUTs the matrix with exactly that change', async () => {
    serve();
    await open('Permissions');
    await screen.findByText('Save permissions');
    expect(box('client', 'leads', 'view').checked).toBe(false);
    fireEvent.click(box('client', 'leads', 'view'));
    expect(box('client', 'leads', 'view').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(writes('PUT', '/permissions').length).toBe(1));
    const sent = writes('PUT', '/permissions')[0].body;
    const expected = clone(DEFAULT_PERMISSIONS) as any;
    expected.client.leads = [...(expected.client.leads ?? []), 'view'];
    for (const r of ROLES) for (const m of [...MODULES, ...REGISTRY.map(x => `m:${x.key}` as const)]) {
      expect([...(sent[r][m] ?? [])].sort(), `${r}.${m}`).toEqual([...(expected[r][m] ?? [])].sort());
    }
    expect(await screen.findByText('Permissions saved')).toBeTruthy();
  });

  it('unchecking removes the action from the matrix', async () => {
    serve();
    await open('Permissions');
    await screen.findByText('Save permissions');
    fireEvent.click(box('staff', 'leads', 'view'));
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(writes('PUT', '/permissions').length).toBe(1));
    expect(writes('PUT', '/permissions')[0].body.staff.leads ?? []).not.toContain('view');
  });

  it('admin settings checkboxes are disabled and checked', async () => {
    serve();
    await open('Permissions');
    await screen.findByText('Save permissions');
    for (const a of ['view', 'create', 'edit', 'delete']) {
      expect(box('admin', 'settings', a).disabled, a).toBe(true);
      expect(box('admin', 'settings', a).checked, a).toBe(true);
    }
    expect(box('admin', 'leads', 'view').disabled).toBe(false);
    expect(box('staff', 'settings', 'view').disabled).toBe(false);
  });

  it('admin settings stays checked even if the stored matrix lacks it', async () => {
    const m = clone(DEFAULT_PERMISSIONS) as any;
    delete m.admin.settings;
    serve('admin', undefined, m);
    await open('Permissions');
    await screen.findByText('Save permissions');
    expect(box('admin', 'settings', 'edit').checked).toBe(true);
  });

  it('PUT 400 -> error toast, matrix still shown', async () => {
    serve('admin', (mth, p) => (mth === 'PUT' && p === '/permissions' ? [400, { error: 'Invalid permission matrix' }] : undefined));
    await open('Permissions');
    fireEvent.click(await screen.findByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(toastsOf('error').join()).toContain('Invalid permission matrix'));
    expect(box('staff', 'leads', 'view')).toBeTruthy();
  });
});

describe('Data tab (reset)', () => {
  it('Reset requires confirmation; Cancel sends nothing', async () => {
    serve();
    await open('Data');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset demo data' }));
    expect(writes('POST', '/admin/reset').length).toBe(0);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes('POST', '/admin/reset').length).toBe(0);
  });

  it('confirming POSTs /admin/reset, toasts and reloads', async () => {
    serve();
    await open('Data');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset demo data' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(writes('POST', '/admin/reset').length).toBe(1));
    expect(await screen.findByText('Demo data reset')).toBeTruthy();
    await waitFor(() => expect((location as any).reload).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('reset 403 -> error toast, no reload', async () => {
    serve('admin', (m, p) => (m === 'POST' && p === '/admin/reset' ? [403, { error: 'Forbidden' }] : undefined));
    await open('Data');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset demo data' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(toastsOf('error').join()).toContain('Forbidden'));
    await new Promise(r => setTimeout(r, 700));
    expect((location as any).reload).not.toHaveBeenCalled();
  });
});

describe('Non-admin access (PLAN §4)', () => {
  it('staff with default matrix gets Access denied on /settings', async () => {
    serve('staff');
    render(<AuthProvider><ToastProvider><MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter></ToastProvider></AuthProvider>);
    expect(await screen.findByText('Access denied')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('staff granted settings view only: no Reset, no Add plan/user, permissions read-only', async () => {
    const m = clone(DEFAULT_PERMISSIONS) as any;
    m.staff.settings = ['view'];
    serve('staff', undefined, m);
    await open('Data');
    expect(await screen.findByText(/Restore all records/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset demo data' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Plans' }));
    await screen.findByText('Silver');
    expect(screen.queryByRole('button', { name: 'Add plan' })).toBeNull();
    expect(within(rowWith('Silver')).queryByRole('button', { name: 'Delete' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    await screen.findByLabelText('client leads view');
    expect(screen.queryByRole('button', { name: 'Save permissions' })).toBeNull();
    expect((screen.getByLabelText('client leads view') as HTMLInputElement).disabled).toBe(true);
  });
});
