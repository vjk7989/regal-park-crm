// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { field, formModal, headers, renderAt, rowWith, startServer, toasts, toastsOf } from './page-harness';

const NOW = new Date('2026-11-22T00:00:00.000Z');

const fixtures = () => ({
  clients: [
    { id: 'cli-01', code: 'CL-0001', name: 'Revathi Bhat', email: 'client@regalpark.demo', phone: '+91 67508 97137', type: 'Buyer' },
    { id: 'cli-10', code: 'CL-0010', name: 'Arjun Menon', email: 'arjun@x.in', phone: '+91 98450 00010', type: 'Tenant' },
  ],
  properties: [
    { id: 'prp-001', code: 'RP-0001', name: 'Riora Villa 1' },
    { id: 'prp-029', code: 'RP-0029', name: 'Rental 3BHK 29' },
  ],
  tenants: [
    // leaseEnd exactly 90 days after NOW -> highlighted
    { id: 'ten-01', createdAt: '2026-02-27T09:00:00.000Z', referenceNo: 'TN-0001', clientId: 'cli-01', propertyId: 'prp-029', requestId: 'req-r01', leaseStart: '2026-03-01', leaseEnd: '2027-02-20', monthlyRent: 95000, deposit: 285000, status: 'Active' },
    // 91 days -> not highlighted
    { id: 'ten-02', createdAt: '2026-02-27T09:00:00.000Z', referenceNo: 'TN-0002', clientId: 'cli-10', propertyId: 'prp-029', requestId: 'req-r02', leaseStart: '2026-03-01', leaseEnd: '2027-02-21', monthlyRent: 60000, deposit: 180000, status: 'Notice Period' },
    { id: 'ten-03', createdAt: '2025-02-27T09:00:00.000Z', referenceNo: 'TN-0003', clientId: 'cli-10', propertyId: 'prp-404', requestId: 'req-r03', leaseStart: '2025-03-01', leaseEnd: '2026-02-28', monthlyRent: 50000, deposit: 150000, status: 'Ended' },
  ],
  invoices: [
    { id: 'inv-001', createdAt: '2026-08-16T12:00:00.000Z', number: 'INV-0001', requestId: 'req-b01', kind: 'buy', clientId: 'cli-10', propertyId: 'prp-001', amount: 500000, dueDate: '2026-08-22', payments: [{ date: '2026-08-18', amount: 500000, mode: 'UPI', ref: 'UPI27270531' }], status: 'Paid' },
    { id: 'inv-002', createdAt: '2026-09-16T12:00:00.000Z', number: 'INV-0002', requestId: 'req-b02', kind: 'buy', clientId: 'cli-01', propertyId: 'prp-001', amount: 300000, dueDate: '2026-10-01', payments: [{ date: '2026-09-20', amount: 100000, mode: 'NEFT', ref: '' }], status: 'Partially Paid' },
    { id: 'inv-003', createdAt: '2026-09-16T12:00:00.000Z', number: 'INV-0003', requestId: 'req-r01', kind: 'rent', clientId: 'cli-01', propertyId: 'prp-029', amount: 95000, dueDate: '2026-10-05', payments: [], status: 'Overdue' },
    { id: 'inv-004', createdAt: '2026-09-16T12:00:00.000Z', number: 'INV-0004', requestId: 'req-r02', kind: 'rent', clientId: 'cli-10', propertyId: 'prp-029', amount: 60000, dueDate: '2026-10-05', payments: [], status: 'Cancelled' },
  ],
  contracts: [
    { id: 'con-001', createdAt: '2026-08-15T11:00:00.000Z', number: 'CON-0001', requestId: 'req-b01', kind: 'buy', clientId: 'cli-10', propertyId: 'prp-001', amount: 45300000, signed: true, signedAt: '2026-08-17T15:00:00.000Z' },
    { id: 'con-002', createdAt: '2026-09-15T11:00:00.000Z', number: 'CON-0002', requestId: 'req-b02', kind: 'buy', clientId: 'cli-01', propertyId: 'prp-001', amount: 30000000, signed: false },
  ],
});
const forbid = (...paths: string[]) => (m: string, p: string) => (m === 'GET' && paths.includes(p) ? [403, { error: 'Forbidden' }] as [number, unknown] : undefined);
const cell = (rowText: string, col: string) => rowWith(rowText)!.querySelectorAll('td')[headers().indexOf(col)] as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Tenants', () => {
  const open = async () => { await renderAt('/tenants'); await screen.findByText('TN-0001'); };

  it('renders rows with client name, property link, INR amounts', async () => {
    startServer('admin', fixtures());
    await open();
    await waitFor(() => expect(cell('TN-0001', 'Tenant').textContent).toBe('Revathi Bhat'));
    const link = cell('TN-0001', 'Property').querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/properties/prp-029');
    expect(cell('TN-0001', 'Monthly rent').textContent).toBe('₹95,000');
    expect(cell('TN-0001', 'Deposit').textContent).toBe('₹2,85,000');
    expect(cell('TN-0003', 'Property').textContent).toBe('—'); // unknown property id
  });

  it('empty list -> empty state', async () => {
    startServer('admin', { ...fixtures(), tenants: [] });
    await renderAt('/tenants');
    expect(await screen.findByText('No records found.')).toBeTruthy();
    expect(screen.getByText('0 tenancies')).toBeTruthy();
  });

  it('days left: exactly 90 is highlighted, 91 is not, Ended shows "—"', async () => {
    startServer('admin', fixtures());
    await open();
    const d90 = cell('TN-0001', 'Days left').querySelector('span')!;
    expect(d90.textContent).toBe('90');
    expect(d90.style.fontWeight).toBe('600');
    expect(d90.style.color).not.toBe('');
    const d91 = cell('TN-0002', 'Days left').querySelector('span')!;
    expect(d91.textContent).toBe('91');
    expect(d91.getAttribute('style')).toBeNull();
    expect(cell('TN-0003', 'Days left').textContent).toBe('—');
  });

  it('negative days (lease already past end, not Ended) are highlighted', async () => {
    const f = fixtures();
    f.tenants[0].leaseEnd = '2026-11-01';
    startServer('admin', f);
    await open();
    const s = cell('TN-0001', 'Days left').querySelector('span')!;
    expect(Number(s.textContent)).toBeLessThan(0);
    expect(s.style.fontWeight).toBe('600');
  });

  it('admin: Active row has Notice Period + Mark Ended; Notice row has Mark Ended only; Ended row none', async () => {
    startServer('admin', fixtures());
    await open();
    expect(within(rowWith('TN-0001')!).getByRole('button', { name: 'Notice Period' })).toBeTruthy();
    expect(within(rowWith('TN-0001')!).getByRole('button', { name: 'Mark Ended' })).toBeTruthy();
    expect(within(rowWith('TN-0002')!).queryByRole('button', { name: 'Notice Period' })).toBeNull();
    expect(within(rowWith('TN-0002')!).getByRole('button', { name: 'Mark Ended' })).toBeTruthy();
    expect(within(rowWith('TN-0003')!).queryAllByRole('button')).toEqual([]);
  });

  it('Notice Period PUTs /tenants/:id {status}, refreshes, toasts', async () => {
    const s = startServer('admin', fixtures());
    await open();
    fireEvent.click(within(rowWith('TN-0001')!).getByRole('button', { name: 'Notice Period' }));
    await waitFor(() => expect(s.writes()).toEqual([expect.objectContaining({ method: 'PUT', path: '/tenants/ten-01', body: { status: 'Notice Period' } })]));
    await waitFor(() => expect(within(rowWith('TN-0001')!).queryByRole('button', { name: 'Notice Period' })).toBeNull());
    expect(toasts()).toContain('TN-0001 marked Notice Period');
  });

  it('Mark Ended server error -> error toast', async () => {
    startServer('admin', fixtures(), (m) => (m === 'PUT' ? [400, { error: 'Cannot end' }] : undefined));
    await open();
    fireEvent.click(within(rowWith('TN-0002')!).getByRole('button', { name: 'Mark Ended' }));
    await waitFor(() => expect(toastsOf('error')).toContain('Cannot end'));
  });

  for (const role of ['staff', 'owner', 'client'] as const) {
    it(`${role} (tenants view only): no action buttons / no Actions column`, async () => {
      startServer(role, fixtures());
      await open();
      expect(headers()).not.toContain('Actions');
      expect(screen.queryByRole('button', { name: 'Mark Ended' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Notice Period' })).toBeNull();
    });
  }

  it('403 on /clients and /properties lookups -> "—" cells, no crash, no error toast', async () => {
    startServer('client', fixtures(), forbid('/clients', '/properties'));
    await open();
    await new Promise(r => setTimeout(r, 20));
    expect(cell('TN-0001', 'Tenant').textContent).toBe('—');
    expect(cell('TN-0001', 'Property').textContent).toBe('—');
    expect(toastsOf('error')).toEqual([]);
  });
});

describe('Invoices', () => {
  const open = async () => { await renderAt('/invoices'); await screen.findByText('INV-0002'); };
  const payOn = (num: string) => fireEvent.click(within(rowWith(num)!).getByRole('button', { name: 'Record payment' }));
  const setAmount = (v: string) => fireEvent.change(field('amount'), { target: { value: v } });
  const submit = () => fireEvent.click(within(formModal()!).getByRole('button', { name: 'Record' }));

  it('shows paid and balance; Overdue badge emphasised', async () => {
    startServer('admin', fixtures());
    await open();
    expect(cell('INV-0002', 'Paid').textContent).toBe('₹1,00,000');
    expect(cell('INV-0002', 'Balance').textContent).toBe('₹2,00,000');
    expect(cell('INV-0003', 'Status').querySelector('strong')).toBeTruthy();
    await waitFor(() => expect(cell('INV-0002', 'Client').textContent).toBe('Revathi Bhat'));
  });

  it('empty list -> empty state', async () => {
    startServer('admin', { ...fixtures(), invoices: [] });
    await renderAt('/invoices');
    expect(await screen.findByText('No records found.')).toBeTruthy();
  });

  it('Record payment hidden for Paid and Cancelled invoices', async () => {
    startServer('admin', fixtures());
    await open();
    expect(within(rowWith('INV-0001')!).queryByRole('button', { name: 'Record payment' })).toBeNull();
    expect(within(rowWith('INV-0004')!).queryByRole('button', { name: 'Record payment' })).toBeNull();
    expect(within(rowWith('INV-0002')!).getByRole('button', { name: 'Record payment' })).toBeTruthy();
    expect(within(rowWith('INV-0003')!).getByRole('button', { name: 'Record payment' })).toBeTruthy();
  });

  it('Record payment hidden without invoices edit (broker/owner/client)', async () => {
    for (const role of ['broker', 'owner', 'client'] as const) {
      startServer(role, fixtures());
      await open();
      expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
      expect(screen.getAllByRole('button', { name: 'View payments' }).length).toBe(4);
      cleanup();
      vi.unstubAllGlobals();
      vi.stubGlobal('location', { pathname: '/', assign: vi.fn() });
    }
  });

  it('modal pre-fills the balance', async () => {
    startServer('admin', fixtures());
    await open();
    payOn('INV-0002');
    expect((field('amount') as HTMLInputElement).value).toBe('200000');
    expect((field('mode') as HTMLSelectElement).value).toBe('UPI');
  });

  it('amount > balance (balance + 1) is blocked: inline error, no POST', async () => {
    const s = startServer('admin', fixtures());
    await open();
    payOn('INV-0002');
    setAmount('200001');
    submit();
    expect(await within(formModal()!).findByText(/Amount must be between 1 and ₹2,00,000/)).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('amount 0 is blocked, no POST', async () => {
    const s = startServer('admin', fixtures());
    await open();
    payOn('INV-0002');
    setAmount('0');
    submit();
    expect(await within(formModal()!).findByText(/Amount must be between 1/)).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('negative amount is blocked, no POST', async () => {
    const s = startServer('admin', fixtures());
    await open();
    payOn('INV-0002');
    setAmount('-5');
    submit();
    expect(await within(formModal()!).findByText(/Amount must be between 1/)).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('empty amount is blocked (required), no POST', async () => {
    const s = startServer('admin', fixtures());
    await open();
    payOn('INV-0002');
    setAmount('');
    submit();
    expect(await within(formModal()!).findByText(/is required/)).toBeTruthy();
    expect(s.writes()).toEqual([]);
  });

  it('amount 1 (lower boundary) is allowed', async () => {
    const s = startServer('admin', fixtures());
    await open();
    payOn('INV-0003');
    setAmount('1');
    submit();
    await waitFor(() => expect(s.writes().length).toBe(1));
    expect(s.writes()[0].body.amount).toBe(1);
  });

  it('exact balance POSTs /invoices/:id/payments with numeric amount, refreshes, toasts, closes', async () => {
    const s = startServer('admin', fixtures());
    await open();
    const before = s.gets('/invoices');
    payOn('INV-0002');
    setAmount('200000');
    fireEvent.change(field('ref'), { target: { value: 'NEFT123' } });
    submit();
    await waitFor(() => expect(s.writes().length).toBe(1));
    expect(s.writes()[0]).toMatchObject({ method: 'POST', path: '/invoices/inv-002/payments', body: { amount: 200000, mode: 'UPI', ref: 'NEFT123', date: '2026-11-22' } });
    expect(typeof s.writes()[0].body.amount).toBe('number');
    await waitFor(() => expect(s.gets('/invoices')).toBe(before + 1));
    await waitFor(() => expect(cell('INV-0002', 'Balance').textContent).toBe('₹0'));
    expect(within(rowWith('INV-0002')!).queryByRole('button', { name: 'Record payment' })).toBeNull();
    expect(formModal()).toBeNull();
    expect(toasts()).toContain('Payment recorded');
  });

  it('server 400 on payment is shown to the user and the modal stays open (no success toast)', async () => {
    const s = startServer('admin', fixtures(), (m, p) => (m === 'POST' && p.endsWith('/payments') ? [400, { error: 'Payment exceeds balance' }] : undefined));
    await open();
    payOn('INV-0002');
    submit();
    await waitFor(() => expect(s.writes().length).toBe(1));
    await waitFor(() => expect(document.body.textContent).toContain('Payment exceeds balance'));
    expect(formModal()).toBeTruthy();
    expect(toasts()).not.toContain('Payment recorded');
  });

  it('server 400 on payment is surfaced as a toast (AC wording)', async () => {
    startServer('admin', fixtures(), (m, p) => (m === 'POST' && p.endsWith('/payments') ? [400, { error: 'Payment exceeds balance' }] : undefined));
    await open();
    payOn('INV-0002');
    submit();
    await waitFor(() => expect(toastsOf('error')).toContain('Payment exceeds balance'));
  });

  it('View payments lists payments; empty invoice shows "No payments recorded."', async () => {
    startServer('admin', fixtures());
    await open();
    fireEvent.click(within(rowWith('INV-0002')!).getByRole('button', { name: 'View payments' }));
    const dlg = screen.getByText('Payments – INV-0002').closest('.modal') as HTMLElement;
    expect(dlg.textContent).toContain('₹1,00,000');
    expect(dlg.textContent).toContain('NEFT');
    fireEvent.click(within(dlg).getAllByRole('button', { name: 'Close' })[0]);
    fireEvent.click(within(rowWith('INV-0003')!).getByRole('button', { name: 'View payments' }));
    expect(screen.getByText('No payments recorded.')).toBeTruthy();
  });

  it('403 on lookups -> client "—", property "—", rows still render', async () => {
    startServer('owner', fixtures(), forbid('/clients', '/properties'));
    await open();
    await new Promise(r => setTimeout(r, 20));
    expect(cell('INV-0002', 'Client').textContent).toBe('—');
    expect(cell('INV-0002', 'Property').textContent).toBe('—');
    expect(toastsOf('error')).toEqual([]);
  });

  it('agent cannot reach /invoices', async () => {
    const s = startServer('agent', fixtures());
    await renderAt('/invoices');
    expect(await screen.findByText('Access denied')).toBeTruthy();
    expect(s.gets('/invoices')).toBe(0);
  });
});

describe('Contracts', () => {
  const open = async () => { await renderAt('/contracts'); await screen.findByText('CON-0002'); };

  it('signed badge + signedAt; Mark signed only on unsigned rows', async () => {
    startServer('admin', fixtures());
    await open();
    expect(cell('CON-0001', 'Signed').textContent).toBe('Signed');
    expect(cell('CON-0001', 'Signed at').textContent).toBe('17 Aug 2026');
    expect(cell('CON-0002', 'Signed').textContent).toBe('Unsigned');
    expect(cell('CON-0002', 'Signed at').textContent).toBe('—');
    expect(within(rowWith('CON-0001')!).queryByRole('button', { name: 'Mark signed' })).toBeNull();
    expect(within(rowWith('CON-0002')!).getByRole('button', { name: 'Mark signed' })).toBeTruthy();
  });

  it('empty list -> empty state', async () => {
    startServer('admin', { ...fixtures(), contracts: [] });
    await renderAt('/contracts');
    expect(await screen.findByText('No records found.')).toBeTruthy();
  });

  it('Mark signed POSTs /contracts/:id/sign, refreshes (button gone), toasts', async () => {
    const s = startServer('staff', fixtures());
    await open();
    fireEvent.click(within(rowWith('CON-0002')!).getByRole('button', { name: 'Mark signed' }));
    await waitFor(() => expect(s.writes()).toEqual([expect.objectContaining({ method: 'POST', path: '/contracts/con-002/sign' })]));
    await waitFor(() => expect(cell('CON-0002', 'Signed').textContent).toBe('Signed'));
    expect(within(rowWith('CON-0002')!).queryByRole('button', { name: 'Mark signed' })).toBeNull();
    expect(toasts()).toContain('CON-0002 signed');
  });

  it('Mark signed server 400 -> error toast, row stays unsigned', async () => {
    startServer('admin', fixtures(), (m) => (m === 'POST' ? [400, { error: 'Already signed' }] : undefined));
    await open();
    fireEvent.click(within(rowWith('CON-0002')!).getByRole('button', { name: 'Mark signed' }));
    await waitFor(() => expect(toastsOf('error')).toContain('Already signed'));
    expect(cell('CON-0002', 'Signed').textContent).toBe('Unsigned');
  });

  for (const role of ['broker', 'owner', 'client'] as const) {
    it(`${role} (contracts view only): no Mark signed, no Actions column`, async () => {
      startServer(role, fixtures());
      await open();
      expect(screen.queryByRole('button', { name: 'Mark signed' })).toBeNull();
      expect(headers()).not.toContain('Actions');
    });
  }
});
