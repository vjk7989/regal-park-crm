// Shared harness for page tests: real AuthProvider + ToastProvider + MemoryRouter + App,
// with a fetch mock acting as a tiny in-memory REST server. Not a test file (no .test suffix).
import React from 'react';
import { expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../client/App';
import { AuthProvider } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import { DEFAULT_PERMISSIONS } from '../../shared/permissions';

export type Role = 'admin' | 'staff' | 'agent' | 'broker' | 'owner' | 'client';
export interface Call { method: string; url: string; path: string; body: any }
/** Return a [status, body] tuple to short-circuit the default handler, or undefined to fall through. */
export type Override = (method: string, path: string, body: any) => [number, unknown] | undefined;

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
const CONTEXT = new Set(['/auth/me', '/permissions', '/settings', '/auth/logout']);

export function startServer(role: Role, db: Record<string, any[]>, override?: Override, matrix: unknown = DEFAULT_PERMISSIONS) {
  const calls: Call[] = [];
  let seq = 0;
  const fetchMock = vi.fn(async (url: string, init: { method: string; body?: string }) => {
    const path = url.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    if (path === '/auth/me') return json(200, { user: { id: 'u-me', name: `${role} user`, email: `${role}@x`, role, active: true } });
    if (path === '/permissions') return json(200, matrix);
    if (path === '/settings') return json(200, { projectName: 'Sterlitee Regal Park' });
    if (path === '/auth/logout') return json(200, { ok: true });
    calls.push({ method, url, path, body });
    const o = override?.(method, path, body);
    if (o) return json(o[0], o[1]);
    const [, col, id, sub] = path.split('/');
    const list = (db[col] ??= []);
    if (method === 'GET' && !id) return json(200, list);
    if (method === 'GET') { const r = list.find(x => x.id === id); return r ? json(200, r) : json(404, { error: 'Not found' }); }
    if (method === 'POST' && !id) {
      const rec = { id: `new-${++seq}`, code: `NEW-${seq}`, createdAt: '2026-11-22T00:00:00.000Z', ...body };
      list.push(rec);
      return json(201, rec);
    }
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return json(404, { error: 'Not found' });
    if (method === 'PUT') { list[idx] = { ...list[idx], ...body }; return json(200, list[idx]); }
    if (method === 'DELETE') { list.splice(idx, 1); return json(200, { ok: true }); }
    if (method === 'POST' && sub === 'payments') { list[idx].payments.push(body); return json(200, list[idx]); }
    if (method === 'POST' && sub === 'sign') { list[idx] = { ...list[idx], signed: true, signedAt: '2026-11-22T00:00:00.000Z' }; return json(200, list[idx]); }
    return json(400, { error: 'unhandled' });
  });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('rp_token', 'tok');
  return {
    calls,
    fetchMock,
    db,
    /** Non-GET calls only (mutations). */
    writes: () => calls.filter(c => c.method !== 'GET'),
    gets: (p: string) => calls.filter(c => c.method === 'GET' && c.path === p).length,
  };
}

export async function renderAt(path: string) {
  const r = render(
    <AuthProvider><ToastProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ToastProvider></AuthProvider>,
  );
  await screen.findByText('Logout');
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  return r;
}

/** Text of all toasts currently shown. */
export const toasts = () => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent ?? '');
export const toastsOf = (kind: 'success' | 'error' | 'info') => Array.from(document.querySelectorAll(`.toast-${kind}`)).map(t => t.textContent ?? '');
/** The open FormModal (<form class="modal">). */
export const formModal = () => document.querySelector('form.modal') as HTMLFormElement | null;
export const field = (name: string) => document.getElementById(`f-${name}`) as HTMLInputElement | HTMLSelectElement;
/** Header labels of the main data table (without sort arrows). */
export const headers = () => Array.from(document.querySelectorAll('table.table thead th')).map(th => th.textContent!.replace(/ [▲▼]$/, ''));
/** <tr> in the data table whose text contains `text`. */
export const rowWith = (text: string) => Array.from(document.querySelectorAll('table.table tbody tr')).find(tr => tr.textContent!.includes(text)) as HTMLElement | undefined;

