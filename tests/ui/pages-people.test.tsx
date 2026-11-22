// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ENTITIES, EntityKey } from '../../client/pages/entities';
import { field, formModal, headers, renderAt, rowWith, startServer, toasts, toastsOf } from './page-harness';

// Small fixtures shaped like data/seed.json records.
const fixtures = () => ({
  owners: [
    { id: 'own-01', createdAt: '2025-12-27T10:00:00.000Z', code: 'PO-0001', name: 'Sterlitee Developers', email: 'info@sterlitee.in', phone: '+91 90080 32626', city: 'Bengaluru', state: 'Karnataka', address: 'Neotown', pan: 'AABCS4821K', active: true },
    { id: 'own-02', createdAt: '2025-12-28T10:00:00.000Z', code: 'PO-0002', name: 'Kiran Rao', email: 'kiran@x.in', phone: '+91 98450 12345', city: 'Mysuru', state: 'Karnataka', active: false },
  ],
  staff: [
    { id: 'stf-01', createdAt: '2026-01-06T10:00:00.000Z', code: 'ST-0001', name: 'Deepa Iyer', email: 'sales@regalpark.demo', phone: '+91 68564 92968', designation: 'Sales Head', approvalManager: true, requireApproval: false, isPublic: true, active: true, lastLogin: '2026-11-20T18:53:00.000Z' },
  ],
  agents: [
    { id: 'agt-01', createdAt: '2026-02-15T10:00:00.000Z', code: 'AG-0001', name: 'Urban Nest Realty', email: 'agent@regalpark.demo', phone: '+91 67617 52913', city: 'Bengaluru', reraAgentNo: 'PRM/KA/RERA/1251/310/AG/000103', planId: 'plan-1', verified: true, isPublic: true, active: true },
  ],
  brokers: [
    { id: 'brk-01', createdAt: '2026-03-07T10:00:00.000Z', code: 'BB-0001', name: 'Anand Channel Partners', email: 'broker@regalpark.demo', phone: '+91 71228 67785', city: 'Hosur', reraAgentNo: 'PRM/KA/RERA/1251/310/AG/000309', planId: 'plan-2', active: true },
  ],
  clients: [
    { id: 'cli-01', createdAt: '2026-05-06T10:00:00.000Z', code: 'CL-0001', name: 'Revathi Bhat', email: 'client@regalpark.demo', phone: '+91 67508 97137', city: 'Bengaluru', type: 'Buyer' },
  ],
  plans: [
    { id: 'plan-1', createdAt: '2026-01-26T10:00:00.000Z', name: 'Silver', monthlyListings: 10, rate: 4999, paymentType: 'Monthly' },
    { id: 'plan-2', createdAt: '2026-01-26T10:00:00.000Z', name: 'Gold', monthlyListings: 25, rate: 9999, paymentType: 'Monthly' },
  ],
  properties: [
    { id: 'prp-001', code: 'RP-0001', name: 'Riora Villa 1', ownerId: 'own-01' },
    { id: 'prp-002', code: 'RP-0002', name: 'Riora Villa 2', ownerId: 'own-01' },
    { id: 'prp-003', code: 'RP-0003', name: 'Avira Villa 3', ownerId: 'own-02' },
    { id: 'prp-004', code: 'RP-0004', name: 'Unowned' },
  ],
});

const forbid = (...paths: string[]) => (m: string, p: string) => (m === 'GET' && paths.includes(p) ? [403, { error: 'Forbidden' }] as [number, unknown] : undefined);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const ROUTE: Record<EntityKey, string> = { owners: '/owners', staff: '/staff', agents: '/agents', brokers: '/brokers', clients: '/clients' };
const firstName: Record<EntityKey, string> = { owners: 'Sterlitee Developers', staff: 'Deepa Iyer', agents: 'Urban Nest Realty', brokers: 'Anand Channel Partners', clients: 'Revathi Bhat' };

describe('EntityPage: columns per entity config (PLAN §7)', () => {
  for (const key of Object.keys(ENTITIES) as EntityKey[]) {
    it(`${key}: renders configured columns, title and first record`, async () => {
      startServer('admin', fixtures());
      await renderAt(ROUTE[key]);
      const cfg = ENTITIES[key];
      expect(await screen.findByText(firstName[key])).toBeTruthy();
      const labels = cfg.columns.map(c => cfg.fields.find(f => f.name === c)!.label);
      const expected = [...labels, ...(key === 'owners' ? ['Properties'] : []), 'Actions'];
      await waitFor(() => expect(headers()).toEqual(expected));
      expect(screen.getByRole('heading', { name: cfg.title })).toBeTruthy();
    });
  }

  it('fetches GET /:collection with the /api prefix added only by api.ts', async () => {
    const s = startServer('admin', fixtures());
    await renderAt('/brokers');
    await screen.findByText('Anand Channel Partners');
    expect(s.fetchMock).toHaveBeenCalledWith('/api/brokers', expect.objectContaining({ method: 'GET' }));
    expect(s.calls.every(c => !c.path.startsWith('/api/'))).toBe(true);
  });

  it('empty list: shows empty state and "0 records"', async () => {
    startServer('admin', { ...fixtures(), clients: [] });
    await renderAt('/clients');
    expect(await screen.findByText('No records found.')).toBeTruthy();
    expect(screen.getByText('0 records')).toBeTruthy();
  });

  it('agents/brokers: planId column shows plan name from /plans', async () => {
    startServer('admin', fixtures());
    await renderAt('/agents');
    await screen.findByText('Urban Nest Realty');
    await waitFor(() => expect(rowWith('Urban Nest Realty')!.textContent).toContain('Silver'));
  });

  it('staff: lastLogin rendered as a date, not the raw ISO string', async () => {
    startServer('admin', fixtures());
    await renderAt('/staff');
    const row = (await screen.findByText('Deepa Iyer')).closest('tr')!;
    expect(row.textContent).not.toContain('2026-11-20T18:53');
    expect(row.textContent).toMatch(/2026/);
  });

  it('owners: Properties column counts properties per owner', async () => {
    startServer('admin', fixtures());
    await renderAt('/owners');
    await screen.findByText('Sterlitee Developers');
    await waitFor(() => expect(headers()).toContain('Properties'));
    const cells = (name: string) => Array.from(rowWith(name)!.querySelectorAll('td')).map(td => td.textContent);
    const idx = headers().indexOf('Properties');
    expect(cells('Sterlitee Developers')[idx]).toBe('2');
    expect(cells('Kiran Rao')[idx]).toBe('1');
  });
});

describe('EntityPage: tolerates 403 on secondary lookups (PLAN §8)', () => {
  it('owners: 403 on /properties -> no Properties column, rows still render, no error toast', async () => {
    startServer('admin', fixtures(), forbid('/properties'));
    await renderAt('/owners');
    expect(await screen.findByText('Sterlitee Developers')).toBeTruthy();
    await new Promise(r => setTimeout(r, 20));
    expect(headers()).not.toContain('Properties');
    expect(toastsOf('error')).toEqual([]);
  });

  it('owners: role without properties view never requests /properties', async () => {
    const custom = JSON.parse(JSON.stringify((await import('../../shared/permissions')).DEFAULT_PERMISSIONS));
    delete custom.broker.properties;
    const s = startServer('broker', fixtures(), undefined, custom);
    await renderAt('/owners');
    await screen.findByText('Sterlitee Developers');
    expect(s.gets('/properties')).toBe(0);
    expect(headers()).not.toContain('Properties');
  });

  it('agents: 403 on /plans -> plan cell shows "—", page does not crash', async () => {
    startServer('admin', fixtures(), forbid('/plans'));
    await renderAt('/agents');
    const row = (await screen.findByText('Urban Nest Realty')).closest('tr')!;
    await new Promise(r => setTimeout(r, 20));
    const idx = headers().indexOf('Plan');
    expect(row.querySelectorAll('td')[idx].textContent).toBe('—');
    expect(toastsOf('error')).toEqual([]);
  });

  it('agents: 403 on /plans -> Add modal still opens with an empty Plan select', async () => {
    startServer('admin', fixtures(), forbid('/plans'));
    await renderAt('/agents');
    await screen.findByText('Urban Nest Realty');
    fireEvent.click(screen.getByRole('button', { name: 'Add Agent' }));
    const sel = field('planId') as HTMLSelectElement;
    expect(sel.options.length).toBe(1); // only the "Select..." placeholder
  });

  it('primary list 403 -> empty table + error toast (no crash)', async () => {
    startServer('admin', fixtures(), forbid('/clients'));
    await renderAt('/clients');
    expect(await screen.findByText('No records found.')).toBeTruthy();
    await waitFor(() => expect(toastsOf('error')).toContain('Forbidden'));
  });
});

describe('EntityPage: add with client-side validation', () => {
  const openAdd = async (route: string, label: string, waitFor: string) => {
    await renderAt(route);
    await screen.findByText(waitFor);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(formModal()).toBeTruthy();
  };
  const fill = (v: Record<string, string>) => { for (const [k, val] of Object.entries(v)) fireEvent.change(field(k), { target: { value: val } }); };
  const save = () => fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));

  it('invalid phone 5xxxxxxxxx is blocked: inline error, no POST', async () => {
    const s = startServer('admin', fixtures());
    await openAdd('/owners', 'Add Owner', 'Sterlitee Developers');
    fill({ name: 'New Owner', email: 'new@owner.in', phone: '5123456789' });
    save();
    expect(await within(formModal()!).findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('phone with 9 digits (boundary below 10) is blocked', async () => {
    const s = startServer('admin', fixtures());
    await openAdd('/clients', 'Add Client', 'Revathi Bhat');
    fill({ name: 'X', email: 'x@y.in', phone: '987654321' });
    save();
    expect(await within(formModal()!).findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('invalid email is blocked: inline error, no POST', async () => {
    const s = startServer('admin', fixtures());
    await openAdd('/clients', 'Add Client', 'Revathi Bhat');
    fill({ name: 'X', email: 'not-an-email@x', phone: '9876543210' });
    save();
    expect(await within(formModal()!).findByText('Enter a valid email address')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('required fields empty -> required errors, no POST', async () => {
    const s = startServer('admin', fixtures());
    await openAdd('/brokers', 'Add Broker', 'Anand Channel Partners');
    save();
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(screen.getByText('Email is required')).toBeTruthy();
    expect(screen.getByText('Phone is required')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('valid add (clients) POSTs /clients with the form body, then refetches, closes and toasts', async () => {
    const s = startServer('admin', fixtures());
    await openAdd('/clients', 'Add Client', 'Revathi Bhat');
    const getsBefore = s.gets('/clients');
    fill({ name: 'Meera Pillai', email: 'meera@x.in', phone: '+91 98450 11111', city: 'Pune' });
    save();
    await waitFor(() => expect(s.writes().length).toBe(1));
    const w = s.writes()[0];
    expect(w.method).toBe('POST');
    expect(w.path).toBe('/clients');
    expect(w.body).toMatchObject({ name: 'Meera Pillai', email: 'meera@x.in', phone: '+91 98450 11111', city: 'Pune', type: 'Buyer' });
    expect(w.body).not.toHaveProperty('code'); // readOnly field is not sent
    await waitFor(() => expect(s.gets('/clients')).toBe(getsBefore + 1));
    expect(await screen.findByText('Meera Pillai')).toBeTruthy();
    expect(formModal()).toBeNull();
    expect(toasts()).toContain('Client added');
    expect(screen.getByText('2 records')).toBeTruthy();
  });

  it('valid add (owners) defaults active=true and POSTs /owners', async () => {
    const s = startServer('admin', fixtures());
    await openAdd('/owners', 'Add Owner', 'Sterlitee Developers');
    expect((field('active') as HTMLInputElement).checked).toBe(true);
    fill({ name: 'Ravi', email: 'ravi@x.in', phone: '6000000000' });
    save();
    await waitFor(() => expect(s.writes().length).toBe(1));
    expect(s.writes()[0]).toMatchObject({ method: 'POST', path: '/owners', body: expect.objectContaining({ active: true, name: 'Ravi' }) });
  });

  it('server 400 on add is shown in the modal, modal stays open, no success toast', async () => {
    const s = startServer('admin', fixtures(), (m, p) => (m === 'POST' && p === '/clients' ? [400, { error: 'Email already exists', field: 'email' }] : undefined));
    await openAdd('/clients', 'Add Client', 'Revathi Bhat');
    fill({ name: 'Dup', email: 'client@regalpark.demo', phone: '9876543210' });
    save();
    expect(await within(formModal()!).findByText('Email already exists')).toBeTruthy();
    expect(toasts()).not.toContain('Client added');
    expect(s.writes().length).toBe(1);
  });
});

describe('EntityPage: edit, delete, toggles', () => {
  it('edit PUTs only to /:col/:id (no POST), body excludes id/code, then refreshes and toasts', async () => {
    const s = startServer('admin', fixtures());
    await renderAt('/owners');
    await screen.findByText('Kiran Rao');
    fireEvent.click(within(rowWith('Kiran Rao')!).getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Edit Owner')).toBeTruthy();
    expect((field('name') as HTMLInputElement).value).toBe('Kiran Rao');
    fireEvent.change(field('city'), { target: { value: 'Hubballi' } });
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(s.writes().length).toBe(1));
    const w = s.writes()[0];
    expect(w.method).toBe('PUT');
    expect(w.path).toBe('/owners/own-02');
    expect(w.body.city).toBe('Hubballi');
    expect(w.body).not.toHaveProperty('id');
    expect(w.body).not.toHaveProperty('code');
    await waitFor(() => expect(rowWith('Kiran Rao')!.textContent).toContain('Hubballi'));
    expect(toasts()).toContain('Owner updated');
  });

  it('edit with invalid email is blocked client-side (no PUT)', async () => {
    const s = startServer('admin', fixtures());
    await renderAt('/brokers');
    await screen.findByText('Anand Channel Partners');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(field('email'), { target: { value: 'broken' } });
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('delete requires confirm: cancel sends nothing; confirm DELETEs /:col/:id, refreshes and toasts', async () => {
    const s = startServer('admin', fixtures());
    await renderAt('/owners');
    await screen.findByText('Kiran Rao');
    fireEvent.click(within(rowWith('Kiran Rao')!).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete Kiran Rao? This cannot be undone.')).toBeTruthy();
    expect(s.writes()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/This cannot be undone/)).toBeNull();
    expect(s.writes()).toEqual([]);

    fireEvent.click(within(rowWith('Kiran Rao')!).getByRole('button', { name: 'Delete' }));
    const dlg = screen.getByText(/This cannot be undone/).closest('.modal') as HTMLElement;
    fireEvent.click(within(dlg).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(s.writes()).toEqual([expect.objectContaining({ method: 'DELETE', path: '/owners/own-02' })]));
    await waitFor(() => expect(screen.queryByText('Kiran Rao')).toBeNull());
    expect(toasts()).toContain('Owner deleted');
  });

  it('delete server error -> error toast, dialog closes, row stays', async () => {
    startServer('admin', fixtures(), (m, p) => (m === 'DELETE' ? [400, { error: 'Owner has properties' }] : undefined));
    await renderAt('/owners');
    await screen.findByText('Kiran Rao');
    fireEvent.click(within(rowWith('Kiran Rao')!).getByRole('button', { name: 'Delete' }));
    const dlg = screen.getByText(/This cannot be undone/).closest('.modal') as HTMLElement;
    fireEvent.click(within(dlg).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toastsOf('error')).toContain('Owner has properties'));
    expect(screen.queryByText(/This cannot be undone/)).toBeNull();
    expect(screen.getByText('Kiran Rao')).toBeTruthy();
  });

  it('active toggle PUTs boolean false for an active row, refreshes and toasts', async () => {
    const s = startServer('admin', fixtures());
    await renderAt('/owners');
    await screen.findByText('Sterlitee Developers');
    const cb = screen.getByLabelText('Active Sterlitee Developers') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    await waitFor(() => expect(s.writes()).toEqual([{ method: 'PUT', url: '/api/owners/own-01', path: '/owners/own-01', body: { active: false } }]));
    await waitFor(() => expect((screen.getByLabelText('Active Sterlitee Developers') as HTMLInputElement).checked).toBe(false));
    expect(toasts().some(t => t.includes('Sterlitee Developers'))).toBe(true);
  });

  it('active toggle on an inactive row PUTs boolean true (not a string)', async () => {
    const s = startServer('admin', fixtures());
    await renderAt('/owners');
    await screen.findByText('Kiran Rao');
    fireEvent.click(screen.getByLabelText('Active Kiran Rao'));
    await waitFor(() => expect(s.writes().length).toBe(1));
    expect(s.writes()[0].body).toEqual({ active: true });
    expect(typeof s.writes()[0].body.active).toBe('boolean');
  });

  it('agents: verified toggle PUTs { verified: false }', async () => {
    const s = startServer('admin', fixtures());
    await renderAt('/agents');
    await screen.findByText('Urban Nest Realty');
    fireEvent.click(screen.getByLabelText('Verified Urban Nest Realty'));
    await waitFor(() => expect(s.writes()).toEqual([expect.objectContaining({ method: 'PUT', path: '/agents/agt-01', body: { verified: false } })]));
  });

  it('toggle server error -> error toast, checkbox keeps server state', async () => {
    startServer('admin', fixtures(), (m) => (m === 'PUT' ? [403, { error: 'Forbidden' }] : undefined));
    await renderAt('/owners');
    await screen.findByText('Sterlitee Developers');
    fireEvent.click(screen.getByLabelText('Active Sterlitee Developers'));
    await waitFor(() => expect(toastsOf('error')).toContain('Forbidden'));
    expect((screen.getByLabelText('Active Sterlitee Developers') as HTMLInputElement).checked).toBe(true);
  });

  it('non-toggle checkbox columns (staff isPublic) render as badges, not toggles', async () => {
    startServer('admin', fixtures());
    await renderAt('/staff');
    await screen.findByText('Deepa Iyer');
    expect(screen.queryByLabelText('Public Deepa Iyer')).toBeNull();
    expect(screen.getByLabelText('Active Deepa Iyer')).toBeTruthy();
  });
});

describe('EntityPage: permissions hide controls (PLAN §4)', () => {
  it('staff on /agents (view only): no Add/Edit/Delete, toggles are read-only badges', async () => {
    startServer('staff', fixtures());
    await renderAt('/agents');
    await screen.findByText('Urban Nest Realty');
    expect(screen.queryByRole('button', { name: 'Add Agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByLabelText('Active Urban Nest Realty')).toBeNull();
    expect(screen.queryByLabelText('Verified Urban Nest Realty')).toBeNull();
    expect(rowWith('Urban Nest Realty')!.textContent).toContain('Yes');
  });

  it('staff on /owners (VCE): Add + Edit + toggle, but no Delete', async () => {
    startServer('staff', fixtures());
    await renderAt('/owners');
    await screen.findByText('Sterlitee Developers');
    expect(screen.getByRole('button', { name: 'Add Owner' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByLabelText('Active Sterlitee Developers')).toBeTruthy();
  });

  it('broker on /owners (VC): Add only, no Edit/Delete, no active toggle', async () => {
    startServer('broker', fixtures());
    await renderAt('/owners');
    await screen.findByText('Sterlitee Developers');
    expect(screen.getByRole('button', { name: 'Add Owner' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByLabelText('Active Sterlitee Developers')).toBeNull();
  });

  it('agent on /clients (view only): no Add/Edit/Delete', async () => {
    startServer('agent', fixtures());
    await renderAt('/clients');
    await screen.findByText('Revathi Bhat');
    expect(screen.queryByRole('button', { name: 'Add Client' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  for (const path of ['/owners', '/staff', '/agents', '/brokers', '/clients']) {
    it(`client role cannot reach ${path} (Access denied, no list fetch)`, async () => {
      const s = startServer('client', fixtures());
      await renderAt(path);
      expect(await screen.findByText('Access denied')).toBeTruthy();
      expect(s.gets(path)).toBe(0);
    });
  }
});
