// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { field, formModal, headers, renderAt, rowWith, startServer, toasts, toastsOf } from './page-harness';

const fixtures = () => ({
  leads: [
    { id: 'led-001', createdAt: '2026-07-27T19:41:00.000Z', name: 'Anjali Nair', phone: '+91 87196 16593', source: 'Referral', interest: 'Selora 4BHK', budget: 57000000, status: 'Booked', assignedTo: 'usr-02', siteVisitDate: '2026-08-05' },
    { id: 'led-002', createdAt: '2026-09-01T10:00:00.000Z', name: 'Rohit Shetty', phone: '+91 98450 12345', email: 'rohit@x.in', source: 'Website', interest: 'Riora 4BHK', budget: 2500000, status: 'New', assignedTo: 'usr-03' },
    { id: 'led-003', createdAt: '2026-10-11T10:00:00.000Z', name: 'Kavya Rao', phone: '+91 70000 00001', source: '99acres', interest: 'Commercial', budget: 95000, status: 'Contacted' },
  ],
  users: [
    { id: 'usr-01', name: 'Regal Park Admin', role: 'admin' },
    { id: 'usr-02', name: 'Deepa Iyer', role: 'staff' },
    { id: 'usr-03', name: 'Urban Nest Realty', role: 'agent' },
    { id: 'usr-09', name: 'Revathi Bhat', role: 'client' },
  ],
  properties: [{ id: 'prp-021', code: 'RP-0021', name: 'Selora Villa 21' }],
  clients: [],
});
const forbid = (...paths: string[]) => (m: string, p: string) => (m === 'GET' && paths.includes(p) ? [403, { error: 'Forbidden' }] as [number, unknown] : undefined);
const cell = (rowText: string, col: string) => rowWith(rowText)!.querySelectorAll('td')[headers().indexOf(col)].textContent;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const open = async () => { await renderAt('/leads'); await screen.findByText('Rohit Shetty'); };

describe('Leads: table, formatting, empty', () => {
  it('lists leads with /api/leads, subtitle shows filtered of total', async () => {
    const s = startServer('admin', fixtures());
    await open();
    expect(s.fetchMock).toHaveBeenCalledWith('/api/leads', expect.anything());
    expect(screen.getByText('3 of 3 leads')).toBeTruthy();
  });

  it('empty list -> empty state, "0 of 0 leads"', async () => {
    startServer('admin', { ...fixtures(), leads: [] });
    await renderAt('/leads');
    expect(await screen.findByText('No records found.')).toBeTruthy();
    expect(screen.getByText('0 of 0 leads')).toBeTruthy();
  });

  it('budget formatting: crore, lakh, below 1 lakh, missing', async () => {
    const f = fixtures();
    f.leads.push({ id: 'led-004', createdAt: '2026-10-12T10:00:00.000Z', name: 'No Budget', phone: '+91 90000 00000', source: 'Walk-in', interest: '', status: 'New' } as any);
    startServer('admin', f);
    await open();
    expect(cell('Anjali Nair', 'Budget')).toBe('₹5.7 Cr');
    expect(cell('Rohit Shetty', 'Budget')).toBe('₹25 L');
    expect(cell('Kavya Rao', 'Budget')).toBe('₹95,000');
    expect(cell('No Budget', 'Budget')).toBe('—');
  });

  it('assignee column resolves user names from /users', async () => {
    startServer('admin', fixtures());
    await open();
    await waitFor(() => expect(cell('Anjali Nair', 'Assigned to')).toBe('Deepa Iyer'));
    expect(cell('Kavya Rao', 'Assigned to')).toBe('—');
  });
});

describe('Leads: filters', () => {
  it('filter by status', async () => {
    startServer('admin', fixtures());
    await open();
    fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: 'New' } });
    expect(screen.getByText('1 of 3 leads')).toBeTruthy();
    expect(rowWith('Rohit Shetty')).toBeTruthy();
    expect(rowWith('Anjali Nair')).toBeUndefined();
  });

  it('filter by source', async () => {
    startServer('admin', fixtures());
    await open();
    fireEvent.change(screen.getByLabelText('Filter source'), { target: { value: '99acres' } });
    expect(screen.getByText('1 of 3 leads')).toBeTruthy();
    expect(rowWith('Kavya Rao')).toBeTruthy();
    expect(rowWith('Rohit Shetty')).toBeUndefined();
  });

  it('status + source with no match -> empty, "0 of 3"; reset to All restores', async () => {
    startServer('admin', fixtures());
    await open();
    fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: 'Lost' } });
    fireEvent.change(screen.getByLabelText('Filter source'), { target: { value: 'Website' } });
    expect(screen.getByText('0 of 3 leads')).toBeTruthy();
    expect(screen.getByText('No records found.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter status'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter source'), { target: { value: '' } });
    expect(screen.getByText('3 of 3 leads')).toBeTruthy();
  });

  it('assignee filter lists only staff/agent/broker users and filters', async () => {
    startServer('admin', fixtures());
    await open();
    const sel = (await screen.findByLabelText('Filter assigned')) as HTMLSelectElement;
    const labels = Array.from(sel.options).map(o => o.textContent);
    expect(labels).toEqual(['All assignees', 'Deepa Iyer', 'Urban Nest Realty']);
    fireEvent.change(sel, { target: { value: 'usr-03' } });
    expect(screen.getByText('1 of 3 leads')).toBeTruthy();
    expect(rowWith('Rohit Shetty')).toBeTruthy();
  });
});

describe('Leads: 403 on /users hides assignee (PLAN §8)', () => {
  it('no assignee filter, no assignedTo field, column shows "—", no error toast', async () => {
    startServer('agent', fixtures(), forbid('/users'));
    await open();
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByLabelText('Filter assigned')).toBeNull();
    expect(cell('Anjali Nair', 'Assigned to')).toBe('—');
    expect(toastsOf('error')).toEqual([]);
    fireEvent.click(within(rowWith('Rohit Shetty')!).getByRole('button', { name: 'Edit' }));
    expect(formModal()).toBeTruthy();
    expect(document.getElementById('f-assignedTo')).toBeNull();
  });

  it('403 on /properties too -> page still works, property select empty', async () => {
    startServer('admin', fixtures(), forbid('/users', '/properties'));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }));
    expect((field('propertyId') as HTMLSelectElement).options.length).toBe(1);
  });
});

describe('Leads: add / edit / delete', () => {
  const save = () => fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));

  it('add with invalid phone 5xxxxxxxxx is blocked (no POST)', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }));
    fireEvent.change(field('name'), { target: { value: 'Test' } });
    fireEvent.change(field('phone'), { target: { value: '5876543210' } });
    fireEvent.change(field('source'), { target: { value: 'Website' } });
    save();
    expect(await screen.findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('add with invalid email is blocked (no POST)', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }));
    fireEvent.change(field('name'), { target: { value: 'Test' } });
    fireEvent.change(field('phone'), { target: { value: '9876543210' } });
    fireEvent.change(field('email'), { target: { value: 'a@b' } });
    fireEvent.change(field('source'), { target: { value: 'Website' } });
    save();
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('missing required source -> required error, no POST', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }));
    fireEvent.change(field('name'), { target: { value: 'Test' } });
    fireEvent.change(field('phone'), { target: { value: '9876543210' } });
    save();
    expect(await screen.findByText('Source is required')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('valid add POSTs /leads with status New and numeric budget, refetches, toasts', async () => {
    const s = startServer('admin', fixtures());
    await open();
    const before = s.gets('/leads');
    fireEvent.click(screen.getByRole('button', { name: 'Add Lead' }));
    fireEvent.change(field('name'), { target: { value: 'Sana Khan' } });
    fireEvent.change(field('phone'), { target: { value: '+91 99000 11223' } });
    fireEvent.change(field('source'), { target: { value: 'Google Ads' } });
    fireEvent.change(field('budget'), { target: { value: '4500000' } });
    fireEvent.change(field('status'), { target: { value: '' } });
    save();
    await waitFor(() => expect(s.writes().length).toBe(1));
    expect(s.writes()[0]).toMatchObject({ method: 'POST', path: '/leads', body: expect.objectContaining({ name: 'Sana Khan', source: 'Google Ads', budget: 4500000, status: 'New' }) });
    await waitFor(() => expect(s.gets('/leads')).toBe(before + 1));
    expect(await screen.findByText('Sana Khan')).toBeTruthy();
    expect(toasts()).toContain('Lead added');
  });

  it('edit PUTs /leads/:id (no POST) and toasts', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(within(rowWith('Kavya Rao')!).getByRole('button', { name: 'Edit' }));
    fireEvent.change(field('notes'), { target: { value: 'Call back' } });
    save();
    await waitFor(() => expect(s.writes().length).toBe(1));
    expect(s.writes()[0]).toMatchObject({ method: 'PUT', path: '/leads/led-003', body: expect.objectContaining({ notes: 'Call back', status: 'Contacted' }) });
    expect(await screen.findByText('Lead updated')).toBeTruthy();
  });

  it('delete needs confirm: cancel sends nothing; confirm DELETEs /leads/:id', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(within(rowWith('Kavya Rao')!).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete lead Kavya Rao?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(s.writes()).toEqual([]);
    fireEvent.click(within(rowWith('Kavya Rao')!).getByRole('button', { name: 'Delete' }));
    const dlg = screen.getByText('Delete lead Kavya Rao?').closest('.modal') as HTMLElement;
    fireEvent.click(within(dlg).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(s.writes()).toEqual([expect.objectContaining({ method: 'DELETE', path: '/leads/led-003' })]));
    await waitFor(() => expect(rowWith('Kavya Rao')).toBeUndefined());
    expect(toasts()).toContain('Lead deleted');
  });
});

describe('Leads: kanban', () => {
  it('kanban groups by status with counts and totals; status select PUTs new status and refreshes', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }));
    const cols = Array.from(document.querySelectorAll('.kanban-col'));
    expect(cols.length).toBe(7);
    const newCol = cols.find(c => c.querySelector('.kanban-head')!.textContent!.startsWith('New'))!;
    expect(newCol.textContent).toContain('Rohit Shetty');
    expect(newCol.querySelector('.kanban-head')!.textContent).toContain('₹25 L');
    const sel = screen.getByLabelText('Status for Rohit Shetty') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'Negotiation' } });
    await waitFor(() => expect(s.writes()).toEqual([expect.objectContaining({ method: 'PUT', path: '/leads/led-002', body: { status: 'Negotiation' } })]));
    await waitFor(() => expect((screen.getByLabelText('Status for Rohit Shetty') as HTMLSelectElement).value).toBe('Negotiation'));
    expect(toasts()).toContain('Rohit Shetty moved to Negotiation');
  });

  it('kanban status PUT error -> error toast, card keeps old status', async () => {
    startServer('admin', fixtures(), (m) => (m === 'PUT' ? [400, { error: 'Invalid status' }] : undefined));
    await open();
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }));
    fireEvent.change(screen.getByLabelText('Status for Rohit Shetty'), { target: { value: 'Lost' } });
    await waitFor(() => expect(toastsOf('error')).toContain('Invalid status'));
    expect((screen.getByLabelText('Status for Rohit Shetty') as HTMLSelectElement).value).toBe('New');
  });

  it('kanban respects filters', async () => {
    startServer('admin', fixtures());
    await open();
    fireEvent.change(screen.getByLabelText('Filter source'), { target: { value: 'Referral' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }));
    expect(screen.queryByLabelText('Status for Rohit Shetty')).toBeNull();
    expect(screen.getByLabelText('Status for Anjali Nair')).toBeTruthy();
  });

  it('kanban status select hidden without leads edit', async () => {
    const custom = JSON.parse(JSON.stringify((await import('../../shared/permissions')).DEFAULT_PERMISSIONS));
    custom.broker.leads = ['view'];
    startServer('broker', fixtures(), undefined, custom);
    await open();
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }));
    expect(screen.queryByLabelText('Status for Rohit Shetty')).toBeNull();
  });
});

describe('Leads: schedule site visit', () => {
  it('PUTs status "Site Visit Scheduled" + siteVisitDate, refreshes, toasts', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(within(rowWith('Rohit Shetty')!).getByRole('button', { name: 'Schedule site visit' }));
    fireEvent.change(field('siteVisitDate'), { target: { value: '2026-12-05' } });
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Schedule' }));
    await waitFor(() => expect(s.writes()).toEqual([expect.objectContaining({ method: 'PUT', path: '/leads/led-002', body: { status: 'Site Visit Scheduled', siteVisitDate: '2026-12-05' } })]));
    await waitFor(() => expect(cell('Rohit Shetty', 'Status')).toBe('Site Visit Scheduled'));
    expect(cell('Rohit Shetty', 'Site visit')).toBe('05 Dec 2026');
    expect(toasts()).toContain('Site visit scheduled');
  });

  it('empty date is blocked (required), no PUT', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(within(rowWith('Rohit Shetty')!).getByRole('button', { name: 'Schedule site visit' }));
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Schedule' }));
    expect(await screen.findByText('Visit date is required')).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });
});

describe('Leads: convert to client', () => {
  it('POSTs /clients then PUTs lead Booked, refreshes, toasts; button gone afterwards', async () => {
    const s = startServer('admin', fixtures());
    await open();
    expect(within(rowWith('Anjali Nair')!).queryByRole('button', { name: 'Convert to client' })).toBeNull(); // already Booked
    fireEvent.click(within(rowWith('Rohit Shetty')!).getByRole('button', { name: 'Convert to client' }));
    await waitFor(() => expect(s.writes().length).toBe(2));
    const [post, put] = s.writes();
    expect(post).toMatchObject({ method: 'POST', path: '/clients', body: { name: 'Rohit Shetty', phone: '+91 98450 12345', email: 'rohit@x.in', type: 'Buyer' } });
    expect(put).toMatchObject({ method: 'PUT', path: '/leads/led-002', body: { status: 'Booked' } });
    await waitFor(() => expect(cell('Rohit Shetty', 'Status')).toBe('Booked'));
    expect(within(rowWith('Rohit Shetty')!).queryByRole('button', { name: 'Convert to client' })).toBeNull();
    expect(toasts().some(t => t.startsWith('Converted to client'))).toBe(true);
  });

  it('lead without email converts with email ""', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(within(rowWith('Kavya Rao')!).getByRole('button', { name: 'Convert to client' }));
    await waitFor(() => expect(s.writes().length).toBe(2));
    expect(s.writes()[0].body.email).toBe('');
  });

  it('POST /clients failure -> no PUT to lead, error toast', async () => {
    const s = startServer('admin', fixtures(), (m, p) => (m === 'POST' && p === '/clients' ? [400, { error: 'Phone already exists' }] : undefined));
    await open();
    fireEvent.click(within(rowWith('Rohit Shetty')!).getByRole('button', { name: 'Convert to client' }));
    await waitFor(() => expect(toastsOf('error')).toContain('Phone already exists'));
    expect(s.writes().filter(w => w.method === 'PUT')).toEqual([]);
  });

  it('hidden when role lacks clients create (agent)', async () => {
    startServer('agent', fixtures());
    await open();
    expect(screen.queryByRole('button', { name: 'Convert to client' })).toBeNull();
  });
});

describe('Leads: permissions (PLAN §4)', () => {
  it('agent (leads VE): Edit + Schedule visible; no Add Lead, no Delete', async () => {
    startServer('agent', fixtures());
    await open();
    expect(screen.queryByRole('button', { name: 'Add Lead' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(rowWith('Rohit Shetty')!).getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(within(rowWith('Rohit Shetty')!).getByRole('button', { name: 'Schedule site visit' })).toBeTruthy();
  });

  it('broker (leads VCE): Add Lead, no Delete, no Convert (clients view only)', async () => {
    startServer('broker', fixtures());
    await open();
    expect(screen.getByRole('button', { name: 'Add Lead' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Convert to client' })).toBeNull();
  });

  it('view-only leads: no Edit / Schedule / Delete', async () => {
    const custom = JSON.parse(JSON.stringify((await import('../../shared/permissions')).DEFAULT_PERMISSIONS));
    custom.broker.leads = ['view'];
    startServer('broker', fixtures(), undefined, custom);
    await open();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule site visit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Lead' })).toBeNull();
  });

  it('client role cannot reach /leads', async () => {
    const s = startServer('client', fixtures());
    await renderAt('/leads');
    expect(await screen.findByText('Access denied')).toBeTruthy();
    expect(s.gets('/leads')).toBe(0);
  });
});
