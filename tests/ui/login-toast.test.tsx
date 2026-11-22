// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from '../../client/pages/Login';
import { AuthProvider, useAuth } from '../../client/auth';
import { ConfirmDialog, StatusBadge, Tabs, ToastProvider, useToast } from '../../client/components/ui';

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Login page', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('location', { pathname: '/login', assign: vi.fn() });
    fetchMock = vi.fn(async (url: string, init: any) => {
      if (url === '/api/auth/login') {
        const b = JSON.parse(init.body);
        return b.password === 'demo123'
          ? json(200, { token: 'T1', user: { id: 'u', name: 'Admin', email: b.email, role: 'admin', active: true } })
          : json(401, { error: 'Invalid email or password' });
      }
      if (url === '/api/permissions') return json(200, {});
      return json(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  const Who = () => { const { user } = useAuth(); return <div data-testid="who">{user?.email ?? 'none'}</div>; };
  const renderLogin = () => render(<AuthProvider><Login /><Who /></AuthProvider>);

  it('shows branding, email/password fields and six Quick demo login role buttons', () => {
    renderLogin();
    expect(screen.getByText('REGAL PARK')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByText('Quick demo login')).toBeTruthy();
    for (const r of ['Admin', 'Staff', 'Agent', 'Broker', 'Owner', 'Client']) expect(screen.getByRole('button', { name: r })).toBeTruthy();
  });

  it('wrong password shows the server error inline and keeps the form usable', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@regalpark.demo' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid email or password')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false);
    expect(localStorage.getItem('rp_token')).toBeNull();
  });

  it('demo button logs in with demo123, stores token and sets user', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Broker' }));
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('broker@regalpark.demo'));
    const body = JSON.parse(fetchMock.mock.calls.find(c => c[0] === '/api/auth/login')![1].body);
    expect(body).toEqual({ email: 'broker@regalpark.demo', password: 'demo123' });
    expect(localStorage.getItem('rp_token')).toBe('T1');
  });

  it('error from a previous attempt is cleared on the next attempt', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Invalid email or password');
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }));
    await waitFor(() => expect(screen.queryByText('Invalid email or password')).toBeNull());
  });
});

describe('Toasts', () => {
  const Pusher = ({ msg, kind }: { msg: string; kind?: 'success' | 'error' | 'info' }) => {
    const toast = useToast();
    return <button onClick={() => toast(msg, kind)}>push</button>;
  };

  it('shows a success toast by default and auto-dismisses after 3.5s', () => {
    vi.useFakeTimers();
    render(<ToastProvider><Pusher msg="Saved" /></ToastProvider>);
    fireEvent.click(screen.getByText('push'));
    const t = screen.getByText('Saved');
    expect(t.className).toContain('toast-success');
    act(() => { vi.advanceTimersByTime(3499); });
    expect(screen.queryByText('Saved')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2); });
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('error kind uses toast-error and multiple toasts stack', () => {
    render(<ToastProvider><Pusher msg="Failed" kind="error" /></ToastProvider>);
    fireEvent.click(screen.getByText('push'));
    fireEvent.click(screen.getByText('push'));
    const items = screen.getAllByText('Failed');
    expect(items).toHaveLength(2);
    expect(items[0].className).toContain('toast-error');
    expect(document.querySelector('.toast-stack')!.getAttribute('aria-live')).toBe('polite');
  });

  it('useToast outside a provider is a no-op (does not throw)', () => {
    render(<Pusher msg="x" />);
    expect(() => fireEvent.click(screen.getByText('push'))).not.toThrow();
  });
});

describe('ui helpers', () => {
  it('StatusBadge maps colours and falls back to grey for unknown status', () => {
    render(<><StatusBadge status="Paid" /><StatusBadge status="Overdue" /><StatusBadge status="Pending" /><StatusBadge status="Weird" /></>);
    expect(screen.getByText('Paid').className).toContain('badge-green');
    expect(screen.getByText('Overdue').className).toContain('badge-red');
    expect(screen.getByText('Pending').className).toContain('badge-amber');
    expect(screen.getByText('Weird').className).toContain('badge-grey');
  });

  it('ConfirmDialog renders nothing when closed; confirm/cancel call handlers', () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn();
    const { rerender } = render(<ConfirmDialog open={false} message="Sure?" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.queryByText('Sure?')).toBeNull();
    rerender(<ConfirmDialog open message="Sure?" confirmLabel="Delete" danger onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('btn-danger');
  });

  it('Tabs marks the active tab and reports clicks', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} active="a" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'A' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
