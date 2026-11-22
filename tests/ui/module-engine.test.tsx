// @vitest-environment jsdom
// PLAN §10.4 / §10.2 / ADR-9: generic module engine pages (ModulePage, ModuleTable, ModuleDashboard, ModuleReport,
// ModuleSettings, CalendarPage) and the registry-driven sidebar. Uses a SMALL SYNTHETIC REGISTRY (vi.mock) so these
// tests do not depend on the real shared/modules/* files, plus a fetch-mock server (page-harness).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Boxes, Truck } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';

const REG = vi.hoisted(() => {
  const vehicles = {
    key: 'fleet_vehicles', label: 'Vehicles', singular: 'Vehicle', prefix: 'VH-', titleField: 'name', statusField: 'status',
    dateField: 'bought', amountField: 'cost', kanban: true, calendar: true,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['Car', 'Truck'] },
      { key: 'notes', label: 'Notes', type: 'textarea', list: false },
      { key: 'cost', label: 'Cost', type: 'money' },
      { key: 'bought', label: 'Bought', type: 'date' },
      { key: 'driver', label: 'Driver', type: 'ref', ref: 'clients' },
      { key: 'garage', label: 'Garage', type: 'ref', ref: 'fleet_garages' },
      { key: 'seats', label: 'Seats', type: 'number' },
      { key: 'tags', label: 'Tags', type: 'multiselect', options: ['A', 'B'] },
      { key: 'insured', label: 'Insured', type: 'checkbox', list: true },
      { key: 'nextService', label: 'Next service', type: 'datetime' },
      { key: 'manual', label: 'Manual', type: 'url', list: false },
      { key: 'color', label: 'Color', type: 'select', options: ['Red', 'Blue'], list: false },
      { key: 'size', label: 'Size', type: 'select', options: ['S', 'L'], list: false },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Repair', 'Retired'] },
    ],
  };
  const garages = { key: 'fleet_garages', label: 'Garages', singular: 'Garage', titleField: 'gname', lookup: true,
    fields: [{ key: 'gname', label: 'Garage name', type: 'text', required: true }, { key: 'city', label: 'City', type: 'text' }] };
  const trips = { key: 'fleet_trips', label: 'Trips', singular: 'Trip', titleField: 'route',
    fields: [{ key: 'route', label: 'Route', type: 'text' }, { key: 'km', label: 'Km', type: 'number' }] };
  const fleet = {
    key: 'fleet', label: 'Fleet', icon: 'Truck', group: 'Operations',
    pages: [
      { key: 'dash', label: 'Overview', kind: 'dashboard' },
      { key: 'vehicles', label: 'Vehicles', kind: 'table', entity: 'fleet_vehicles' },
      { key: 'garages', label: 'Garages', kind: 'table', entity: 'fleet_garages' },
      { key: 'report', label: 'Reports', kind: 'report' },
      { key: 'settings', label: 'Setup', kind: 'settings' },
      { key: 'cal', label: 'Calendar', kind: 'calendar' },
      { key: 'about', label: 'About', kind: 'info', text: 'Fleet help text' },
      { key: 'broken', label: 'Broken', kind: 'table', entity: 'no_such_entity' },
    ],
    entities: [garages, vehicles, trips],
    settings: [
      { key: 'currency', label: 'Currency', type: 'select', options: ['INR', 'USD'] },
      { key: 'maxAge', label: 'Max age', type: 'number' },
      { key: 'autoAssign', label: 'Auto assign', type: 'checkbox' },
    ],
  };
  const crm = {
    key: 'crm', label: 'CRM Desk', icon: 'NoSuchIcon', group: 'Sales & CRM',
    pages: [{ key: 'prospects', label: 'Prospects', kind: 'table', entity: 'crm_prospects' }, { key: 'setup', label: 'Setup', kind: 'settings' }],
    entities: [{ key: 'crm_prospects', label: 'Prospects', singular: 'Prospect', titleField: 'title',
      fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'stage', label: 'Stage', type: 'select', options: ['New', 'Won'] }] }],
  };
  const hr = {
    key: 'hr', label: 'HR Desk', icon: 'Users', group: 'People',
    pages: [{ key: 'people', label: 'Directory', kind: 'table', entity: 'hr_people' }],
    entities: [{ key: 'hr_people', label: 'People', singular: 'Person', titleField: 'pname', fields: [{ key: 'pname', label: 'Name', type: 'text' }] }],
  };
  return [fleet, crm, hr];
});

vi.mock('../../shared/registry', () => {
  const mods = new Map(REG.map((m: any) => [m.key, m]));
  const ents = new Map(REG.flatMap((m: any) => m.entities.map((e: any) => [e.key, e])));
  const owners = new Map(REG.flatMap((m: any) => m.entities.map((e: any) => [e.key, m])));
  return {
    REGISTRY: REG,
    moduleByKey: (k: string) => mods.get(k),
    entityByKey: (k: string) => ents.get(k),
    moduleOfEntity: (k: string) => owners.get(k),
  };
});

import { DEFAULT_PERMISSIONS } from '../../shared/permissions';
import { iconFor } from '../../client/moduleUtil';
import App from '../../client/App';
import { AuthProvider } from '../../client/auth';
import { ToastProvider } from '../../client/components/ui';
import { field, formModal, headers, renderAt, rowWith, startServer, toastsOf, type Override, type Role } from './page-harness';

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const VCED = ['view', 'create', 'edit', 'delete'];

/** staff: full on m:fleet, view-only m:crm, nothing on m:hr. */
function staffMatrix(fleet: string[] = VCED) {
  const m = clone(DEFAULT_PERMISSIONS) as any;
  m.staff['m:fleet'] = fleet;
  m.staff['m:crm'] = ['view'];
  delete m.staff['m:hr'];
  return m;
}

const seedX = () => ({
  fleet_vehicles: [
    { id: 'v1', code: 'VH-0001', name: 'Tata Ace', type: 'Truck', cost: 250000, bought: '2026-03-05', driver: 'c1', garage: 'g1', seats: 2,
      tags: ['A'], insured: true, nextService: '2026-12-01T10:00:00.000Z', color: 'Red', status: 'Active' },
    { id: 'v2', code: 'VH-0002', name: 'Maruti Swift', type: 'Car', cost: 650000, bought: '2026-01-15', driver: 'c-missing', garage: '', seats: 5,
      insured: false, status: 'Repair' },
  ],
  fleet_garages: [{ id: 'g1', gname: 'North Depot', city: 'Pune' }],
  fleet_trips: [],
  crm_prospects: [{ id: 'p1', title: 'Big deal', stage: 'New' }],
  hr_people: [],
});

interface Opts { role?: Role; matrix?: unknown; hook?: Override; dashboard?: unknown; report?: (q: URLSearchParams) => unknown; events?: unknown[] }

function serve(o: Opts = {}) {
  const x: Record<string, any[]> = seedX();
  let settings: Record<string, any> = { currency: 'INR', maxAge: 5, autoAssign: false };
  let seq = 0;
  const override: Override = (method, path, body) => {
    const hooked = o.hook?.(method, path, body);
    if (hooked) return hooked;
    const u = new URL(path, 'http://t');
    const parts = u.pathname.split('/');
    if (parts[1] === 'x') {
      const list = x[parts[2]];
      if (!list) return [404, { error: 'Unknown entity' }];
      const id = parts[3];
      if (method === 'GET' && !id) return [200, list];
      if (method === 'POST' && !id) { const r = { id: `n${++seq}`, ...body }; list.unshift(r); return [201, r]; }
      const i = list.findIndex(r => r.id === id);
      if (i < 0) return [404, { error: 'Not found' }];
      if (method === 'PUT') { list[i] = { ...list[i], ...body }; return [200, list[i]]; }
      if (method === 'DELETE') { list.splice(i, 1); return [200, { ok: true }]; }
    }
    if (parts[1] === 'm' && parts[3] === 'dashboard') return [200, o.dashboard ?? { cards: [], charts: [] }];
    if (parts[1] === 'm' && parts[3] === 'report') return [200, o.report?.(u.searchParams) ?? { columns: [], rows: [] }];
    if (parts[1] === 'm' && parts[3] === 'settings') {
      if (method === 'PUT') { settings = { ...settings, ...body }; return [200, settings]; }
      return [200, settings];
    }
    if (u.pathname === '/calendar') return [200, o.events ?? []];
    return undefined;
  };
  const srv = startServer(o.role ?? 'staff', { clients: [{ id: 'c1', name: 'Asha Rao' }] }, override, o.matrix ?? staffMatrix());
  return { ...srv, x, settingsNow: () => settings };
}

const main = () => document.querySelector('.main') as HTMLElement;
const h1 = () => main().querySelector('h1')?.textContent;
const navEl = () => document.querySelector('aside nav') as HTMLElement;
const navLinks = () => within(navEl()).queryAllByRole('link').map(a => a.textContent!.trim());
const branches = () => Array.from(navEl().querySelectorAll('button.nav-parent')).map(b => b.textContent!.trim());
const branch = (label: string) => Array.from(navEl().querySelectorAll('button.nav-parent')).find(b => b.textContent!.trim() === label) as HTMLButtonElement | undefined;
const calls = (srv: ReturnType<typeof serve>, method: string, prefix: string) => srv.calls.filter(c => c.method === method && c.path.startsWith(prefix));
const btnIn = (el: HTMLElement, name: string) => within(el).getByRole('button', { name });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

// ---------------------------------------------------------------------------------------------------------------
describe('ModulePage routing (§10.4 routes /m/:module and /m/:module/:page)', () => {
  const cases: [string, string, string][] = [
    ['/m/fleet', 'first page (dashboard)', 'Fleet - Overview'],
    ['/m/fleet/dash', 'dashboard', 'Fleet - Overview'],
    ['/m/fleet/vehicles', 'table', 'Vehicles'],
    ['/m/fleet/report', 'report', 'Fleet - Reports'],
    ['/m/fleet/settings', 'settings', 'Fleet - Setup'],
    ['/m/fleet/cal', 'calendar', 'Fleet - Calendar'],
    ['/m/fleet/about', 'info', 'Fleet - About'],
  ];
  for (const [path, kind, title] of cases) {
    it(`${path} renders the ${kind} page`, async () => {
      serve();
      await renderAt(path);
      await waitFor(() => expect(h1()).toBe(title));
      expect(screen.queryByText('Not found')).toBeNull();
    });
  }

  it('info page shows the page text', async () => {
    serve();
    await renderAt('/m/fleet/about');
    expect(within(main()).getByText('Fleet help text')).toBeTruthy();
  });

  for (const path of ['/m/nope', '/m/nope/x', '/m/fleet/nope', '/m/fleet/broken']) {
    it(`${path} -> Not found`, async () => {
      const srv = serve();
      await renderAt(path);
      expect(within(main()).getByText('Not found')).toBeTruthy();
      expect(calls(srv, 'GET', '/x/')).toHaveLength(0);
    });
  }

  it('no m:<key> view -> Access denied (and no data request)', async () => {
    const srv = serve();
    await renderAt('/m/hr/people');
    expect(within(main()).getByText('Access denied')).toBeTruthy();
    expect(calls(srv, 'GET', '/x/hr_people')).toHaveLength(0);
  });

  it('client (no m:* in defaults) is denied on a registry module', async () => {
    serve({ role: 'client', matrix: DEFAULT_PERMISSIONS });
    await renderAt('/m/fleet/vehicles');
    expect(within(main()).getByText('Access denied')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ModuleTable', () => {
  const ready = async () => { await renderAt('/m/fleet/vehicles'); await screen.findByText('Asha Rao'); };

  it('columns: Code + first 8 list!==false fields + explicit list:true + statusField; list:false never shown', async () => {
    serve();
    await ready();
    // vis = fields with list!==false; first 8 = Name..Tags; Insured has list:true; Status (statusField, 11th visible) appended;
    // Next service (10th visible, no list flag) dropped; Notes/Manual/Color/Size are list:false.
    expect(headers()).toEqual(['Code', 'Name', 'Type', 'Cost', 'Bought', 'Driver', 'Garage', 'Seats', 'Tags', 'Insured', 'Status', 'Actions']);
  });

  it('money as short INR, dates formatted, checkbox Yes/No, empty -> dash', async () => {
    serve();
    await ready();
    const r1 = rowWith('Tata Ace')!;
    expect(r1.textContent).toContain('₹2.5 L');
    expect(r1.textContent).toContain('05 Mar 2026');
    expect(r1.textContent).toContain('Yes');
    const r2 = rowWith('Maruti Swift')!;
    expect(r2.textContent).toContain('₹6.5 L');
    expect(r2.textContent).toContain('15 Jan 2026');
    expect(r2.textContent).toContain('No');
    expect(within(r2).getAllByText('—').length).toBeGreaterThan(0); // empty garage
  });

  it('ref fields show target titles (core and registry entity), unknown id falls back to raw id', async () => {
    serve();
    await ready();
    const r1 = rowWith('Tata Ace')!;
    expect(r1.textContent).toContain('Asha Rao');
    expect(r1.textContent).toContain('North Depot');
    expect(rowWith('Maruti Swift')!.textContent).toContain('c-missing');
  });

  it('ref target 403 -> raw ids shown, page still renders', async () => {
    serve({ hook: (m, p) => (m === 'GET' && (p === '/clients' || p === '/x/fleet_garages') ? [403, { error: 'Forbidden' }] : undefined) });
    await renderAt('/m/fleet/vehicles');
    await screen.findByText('Tata Ace');
    await waitFor(() => expect(rowWith('Tata Ace')!.textContent).toContain('c1'));
    expect(rowWith('Tata Ace')!.textContent).toContain('g1');
    expect(screen.queryByText('Asha Rao')).toBeNull();
  });

  it('select filters: status first, at most 3, filter narrows rows; "All" resets', async () => {
    serve();
    await ready();
    const sel = Array.from(main().querySelectorAll('.filters select')).map(s => s.getAttribute('aria-label'));
    expect(sel).toEqual(['Status', 'Type', 'Color']);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Repair' } });
    expect(rowWith('Tata Ace')).toBeUndefined();
    expect(rowWith('Maruti Swift')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'Truck' } });
    expect(rowWith('Maruti Swift')).toBeUndefined();
    expect(screen.getByText('No vehicles found.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } });
    expect(rowWith('Tata Ace')).toBeTruthy();
  });

  it('form field types: datetime -> date input, url -> text input, money -> number', async () => {
    serve();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }));
    expect(formModal()).toBeTruthy();
    expect((field('nextService') as HTMLInputElement).type).toBe('date');
    expect((field('manual') as HTMLInputElement).type).toBe('text');
    expect((field('cost') as HTMLInputElement).type).toBe('number');
    expect(field('driver').tagName).toBe('SELECT');
    expect(Array.from((field('driver') as HTMLSelectElement).options).map(o => o.textContent)).toEqual(['Select...', 'Asha Rao']);
    expect(Array.from((field('garage') as HTMLSelectElement).options).map(o => o.textContent)).toEqual(['Select...', 'North Depot']);
  });

  it('add: POST drops empty values, numbers numeric, multiselect array, checkbox boolean', async () => {
    const srv = serve();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }));
    fireEvent.change(field('name'), { target: { value: 'Bolero' } });
    fireEvent.change(field('seats'), { target: { value: '7' } });
    fireEvent.change(field('status'), { target: { value: 'Active' } });
    fireEvent.change(field('driver'), { target: { value: 'c1' } });
    fireEvent.click(within(field('tags') as HTMLElement).getByText('B'));
    fireEvent.click(field('insured'));
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(srv, 'POST', '/x/fleet_vehicles')).toHaveLength(1));
    expect(calls(srv, 'POST', '/x/fleet_vehicles')[0].body).toEqual({ name: 'Bolero', seats: 7, status: 'Active', driver: 'c1', tags: ['B'], insured: true });
    await waitFor(() => expect(toastsOf('success')).toContain('Vehicle created'));
    expect(await screen.findByText('Bolero')).toBeTruthy();
  });

  it('add with required field empty -> validation error, no POST', async () => {
    const srv = serve();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }));
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(calls(srv, 'POST', '/x/')).toHaveLength(0);
  });

  it('add rejected by server (400) -> modal stays open with error, error toast', async () => {
    serve({ hook: (m, p) => (m === 'POST' && p === '/x/fleet_vehicles' ? [400, { error: 'Seats must be a number', field: 'seats' }] : undefined) });
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }));
    fireEvent.change(field('name'), { target: { value: 'X' } });
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toastsOf('error').join(' ')).toContain('Seats must be a number'));
    expect(formModal()).toBeTruthy();
  });

  it("edit: PUT sends '' for an emptied optional field (server clears it), keeps others", async () => {
    const srv = serve();
    await ready();
    fireEvent.click(within(rowWith('Tata Ace')!).getByRole('button', { name: 'Edit' }));
    expect((field('seats') as HTMLInputElement).value).toBe('2');
    fireEvent.change(field('seats'), { target: { value: '' } });
    fireEvent.change(field('cost'), { target: { value: '' } });
    fireEvent.click(within(formModal()!).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(srv, 'PUT', '/x/fleet_vehicles/v1')).toHaveLength(1));
    const body = calls(srv, 'PUT', '/x/fleet_vehicles/v1')[0].body;
    expect(body.seats).toBe('');
    expect(body.cost).toBe('');
    expect(body.manual).toBe(''); // never-set optional field is sent as ''
    expect(body).toMatchObject({ name: 'Tata Ace', status: 'Active', driver: 'c1', tags: ['A'], insured: true });
    expect(body.id).toBeUndefined();
    await waitFor(() => expect(toastsOf('success')).toContain('Vehicle updated'));
  });

  it('delete: confirm dialog -> DELETE; cancel -> nothing', async () => {
    const srv = serve();
    await ready();
    fireEvent.click(within(rowWith('Tata Ace')!).getByRole('button', { name: 'Delete' }));
    let dlg = screen.getByRole('dialog');
    expect(dlg.textContent).toContain('Delete "Tata Ace"?');
    fireEvent.click(btnIn(dlg, 'Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls(srv, 'DELETE', '/x/')).toHaveLength(0);
    fireEvent.click(within(rowWith('Tata Ace')!).getByRole('button', { name: 'Delete' }));
    dlg = screen.getByRole('dialog');
    fireEvent.click(btnIn(dlg, 'Delete'));
    await waitFor(() => expect(calls(srv, 'DELETE', '/x/fleet_vehicles/v1')).toHaveLength(1));
    await waitFor(() => expect(rowWith('Tata Ace')).toBeUndefined());
    expect(toastsOf('success')).toContain('Vehicle deleted');
  });

  it('View modal shows every field formatted (code, INR, ref title, multiselect, checkbox, empty dash)', async () => {
    serve();
    await ready();
    fireEvent.click(within(rowWith('Tata Ace')!).getByRole('button', { name: 'View' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Vehicle: Tata Ace')).toBeTruthy();
    const kv = Object.fromEntries(Array.from(dlg.querySelectorAll('dl.kv > div')).map(d => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]));
    expect(kv).toMatchObject({ Code: 'VH-0001', Cost: '₹2,50,000', Driver: 'Asha Rao', Garage: 'North Depot', Tags: 'A', Insured: 'Yes', Notes: '—', 'Next service': '01 Dec 2026' });
    fireEvent.click(within(dlg.querySelector('.modal-foot') as HTMLElement).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('kanban toggle: one column per status option, status select PUTs only the status', async () => {
    const srv = serve();
    await ready();
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }));
    const cols = Array.from(main().querySelectorAll('.kanban-col'));
    expect(cols).toHaveLength(3);
    expect(cols[2].textContent).toContain('Empty'); // Retired: no records
    expect(cols[0].textContent).toContain('₹2.5 L'); // amountField total
    fireEvent.change(screen.getByLabelText('Status for Tata Ace'), { target: { value: 'Retired' } });
    await waitFor(() => expect(calls(srv, 'PUT', '/x/fleet_vehicles/v1')).toHaveLength(1));
    expect(calls(srv, 'PUT', '/x/fleet_vehicles/v1')[0].body).toEqual({ status: 'Retired' });
    await waitFor(() => expect(main().querySelectorAll('.kanban-col')[2].textContent).toContain('Tata Ace'));
    fireEvent.click(screen.getByRole('tab', { name: 'Table' }));
    expect(main().querySelector('table.table')).toBeTruthy();
  });

  it('no Kanban tab for an entity without kanban', async () => {
    serve();
    await renderAt('/m/crm/prospects');
    await screen.findByText('Big deal');
    expect(screen.queryByRole('tab', { name: 'Kanban' })).toBeNull();
  });

  it('view-only permission: no Add / Edit / Delete, no kanban status select; View still present', async () => {
    serve({ matrix: staffMatrix(['view']) });
    await ready();
    expect(screen.queryByRole('button', { name: 'Add Vehicle' })).toBeNull();
    const r = rowWith('Tata Ace')!;
    expect(within(r).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(r).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(r).getByRole('button', { name: 'View' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban' }));
    expect(screen.queryByLabelText('Status for Tata Ace')).toBeNull();
  });

  it('create-only (no edit/delete) shows Add but not Edit/Delete', async () => {
    serve({ matrix: staffMatrix(['view', 'create']) });
    await ready();
    expect(screen.getByRole('button', { name: 'Add Vehicle' })).toBeTruthy();
    expect(within(rowWith('Tata Ace')!).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(rowWith('Tata Ace')!).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('list load error -> error toast and empty table', async () => {
    serve({ hook: (m, p) => (m === 'GET' && p === '/x/fleet_vehicles' ? [500, { error: 'Boom' }] : undefined) });
    await renderAt('/m/fleet/vehicles');
    await waitFor(() => expect(toastsOf('error').join(' ')).toContain('Boom'));
    expect(screen.getByText('No vehicles found.')).toBeTruthy();
  });

  it('CSV export: header from column labels, ref columns exported as titles', async () => {
    let csv = '';
    const Orig = Blob;
    vi.stubGlobal('Blob', class extends Orig { constructor(p: BlobPart[], o?: BlobPropertyBag) { super(p, o); csv = p.map(String).join(''); } });
    (URL as any).createObjectURL = vi.fn(() => 'blob:t');
    (URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    serve();
    await ready();
    fireEvent.click(screen.getByText('Export CSV'));
    const lines = csv.split('\n');
    expect(lines[0].startsWith('"Code","Name","Type","Cost","Bought","Driver","Garage","Seats"')).toBe(true);
    expect(csv).toContain('"Asha Rao"');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ModuleDashboard', () => {
  const DASH = {
    cards: [{ label: 'Vehicles count', value: 2 }, { label: 'Total cost', value: 900000, money: true }],
    charts: [
      { title: 'By status', type: 'pie', data: [{ name: 'Active', value: 1 }, { name: 'Repair', value: 1 }] },
      { title: 'By month', type: 'bar', data: [{ name: 'Jan', value: 1 }] },
      { title: 'All zero', type: 'pie', data: [{ name: 'Retired', value: 0 }] },
    ],
  };

  it('renders cards (money as short INR) and one card per chart; all-zero chart shows empty state', async () => {
    const srv = serve({ dashboard: DASH });
    await renderAt('/m/fleet');
    expect(await screen.findByText('Vehicles count')).toBeTruthy();
    const stat = (l: string) => Array.from(main().querySelectorAll('.stat-card')).find(c => c.textContent!.includes(l))!.querySelector('.stat-value')!.textContent;
    expect(stat('Vehicles count')).toBe('2');
    expect(stat('Total cost')).toBe('₹9 L');
    for (const t of ['By status', 'By month', 'All zero']) expect(within(main()).getByText(t)).toBeTruthy();
    expect(within(main()).getAllByText('No data for this period.')).toHaveLength(1);
    expect(calls(srv, 'GET', '/m/fleet/dashboard').map(c => c.path)).toEqual(['/m/fleet/dashboard?period=all']);
  });

  it('period picker re-requests with the chosen period', async () => {
    const srv = serve({ dashboard: DASH });
    await renderAt('/m/fleet');
    await screen.findByText('Vehicles count');
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'month' } });
    await waitFor(() => expect(calls(srv, 'GET', '/m/fleet/dashboard?period=month')).toHaveLength(1));
  });

  it('empty data -> "No data for this period."', async () => {
    serve({ dashboard: { cards: [], charts: [] } });
    await renderAt('/m/fleet');
    expect(await within(main()).findByText('No data for this period.')).toBeTruthy();
    expect(main().querySelectorAll('.stat-card')).toHaveLength(0);
  });

  it('error -> error card with Retry; Retry re-requests and recovers', async () => {
    let fail = true;
    const srv = serve({ dashboard: DASH, hook: (m, p) => (fail && p.startsWith('/m/fleet/dashboard') ? [500, { error: 'Dashboard down' }] : undefined) });
    await renderAt('/m/fleet');
    expect(await screen.findByText('Could not load dashboard')).toBeTruthy();
    expect(screen.getByText('Dashboard down')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Vehicles count')).toBeTruthy();
    expect(calls(srv, 'GET', '/m/fleet/dashboard')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ModuleReport', () => {
  const report = (q: URLSearchParams) => {
    const g = q.get('groupBy');
    if (g === 'status') return { columns: ['Status', 'Count', 'Amount'], rows: [{ Status: 'Active', Count: 1, Amount: 250000 }, { Status: 'Repair', Count: 1, Amount: 650000 }] };
    if (g === 'type') return { columns: ['Type', 'Count'], rows: [{ Type: 'Car', Count: 1 }] };
    return { columns: ['X', 'Count'], rows: [] };
  };
  const reportGets = (srv: ReturnType<typeof serve>) => calls(srv, 'GET', '/m/fleet/report').map(c => c.path);

  it('entity picker lists non-lookup entities; group-by lists select/ref/status fields; default request params', async () => {
    const srv = serve({ report });
    await renderAt('/m/fleet/report');
    const ent = screen.getByLabelText('Entity') as HTMLSelectElement;
    expect(Array.from(ent.options).map(o => o.textContent)).toEqual(['Vehicles', 'Trips']); // Garages is a lookup
    const gb = screen.getByLabelText('Group by') as HTMLSelectElement;
    expect(Array.from(gb.options).map(o => o.value)).toEqual(['type', 'driver', 'garage', 'color', 'size', 'status']);
    await waitFor(() => expect(reportGets(srv)).toContain('/m/fleet/report?entity=fleet_vehicles&groupBy=type'));
  });

  it('Count/Amount columns, Amount formatted as full INR; group-by change re-requests', async () => {
    const srv = serve({ report });
    await renderAt('/m/fleet/report');
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'status' } });
    await waitFor(() => expect(reportGets(srv)).toContain('/m/fleet/report?entity=fleet_vehicles&groupBy=status'));
    await waitFor(() => expect(headers()).toEqual(['Status', 'Count', 'Amount']));
    expect(rowWith('Active')!.textContent).toContain('₹2,50,000');
    expect(rowWith('Repair')!.textContent).toContain('₹6,50,000');
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'type' } });
    await waitFor(() => expect(headers()).toEqual(['Type', 'Count']));
  });

  it('CSV export header = report columns', async () => {
    let csv = '';
    const Orig = Blob;
    vi.stubGlobal('Blob', class extends Orig { constructor(p: BlobPart[], o?: BlobPropertyBag) { super(p, o); csv = p.map(String).join(''); } });
    (URL as any).createObjectURL = vi.fn(() => 'blob:t');
    (URL as any).revokeObjectURL = vi.fn();
    let download = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { download = this.download; });
    serve({ report });
    await renderAt('/m/fleet/report');
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'status' } });
    await waitFor(() => expect(headers()).toEqual(['Status', 'Count', 'Amount']));
    fireEvent.click(screen.getByText('Export CSV'));
    expect(csv.split('\n')[0]).toBe('"Status","Count","Amount"');
    expect(csv.split('\n')).toHaveLength(3);
    expect(download).toBe('fleet-fleet_vehicles-report.csv');
  });

  it('entity with nothing to group by -> empty state; never requests a stale groupBy for it', async () => {
    const srv = serve({ report });
    await renderAt('/m/fleet/report');
    await waitFor(() => expect(reportGets(srv).length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('Entity'), { target: { value: 'fleet_trips' } });
    expect(await screen.findByText('This entity has nothing to group by.')).toBeTruthy();
    expect(reportGets(srv).filter(p => p.includes('entity=fleet_trips'))).toEqual([]);
  });

  it('report request error -> error toast, no crash, table does not stay on "Loading..."', async () => {
    serve({ hook: (m, p) => (p.startsWith('/m/fleet/report') ? [400, { error: 'Bad groupBy' }] : undefined) });
    // renderAt() would wait for "Loading..." to vanish; wait for the shell only.
    render(<AuthProvider><ToastProvider><MemoryRouter initialEntries={['/m/fleet/report']}><App /></MemoryRouter></ToastProvider></AuthProvider>);
    await screen.findByText('Logout');
    await waitFor(() => expect(toastsOf('error').join(' ')).toContain('Bad groupBy'));
    expect(h1()).toBe('Fleet - Reports');
    expect(within(main()).queryByText('Loading...')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ModuleSettings', () => {
  it('one Settings tab + one tab per lookup entity', async () => {
    serve();
    await renderAt('/m/fleet/settings');
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Settings', 'Garages']);
  });

  it('settings form loads GET values and PUTs typed values (number numeric, checkbox boolean)', async () => {
    const srv = serve();
    await renderAt('/m/fleet/settings');
    const age = await screen.findByLabelText('Max age') as HTMLInputElement;
    expect(age.value).toBe('5');
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('INR');
    fireEvent.change(age, { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });
    fireEvent.click(screen.getByLabelText('Auto assign'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(calls(srv, 'PUT', '/m/fleet/settings')).toHaveLength(1));
    expect(calls(srv, 'PUT', '/m/fleet/settings')[0].body).toEqual({ currency: 'USD', maxAge: 7, autoAssign: true });
    await waitFor(() => expect(toastsOf('success')).toContain('Settings saved'));
  });

  it("emptied number setting is sent as '' (not 0 / NaN)", async () => {
    const srv = serve();
    await renderAt('/m/fleet/settings');
    fireEvent.change(await screen.findByLabelText('Max age'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(calls(srv, 'PUT', '/m/fleet/settings')).toHaveLength(1));
    expect(calls(srv, 'PUT', '/m/fleet/settings')[0].body.maxAge).toBe('');
  });

  it('lookup tab renders an embedded table of that entity with Add button', async () => {
    const srv = serve();
    await renderAt('/m/fleet/settings');
    fireEvent.click(screen.getByRole('tab', { name: 'Garages' }));
    expect(await screen.findByText('North Depot')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Garage' })).toBeTruthy();
    expect(calls(srv, 'GET', '/x/fleet_garages').length).toBeGreaterThan(0);
  });

  it('view-only: inputs disabled, no Save button', async () => {
    serve({ matrix: staffMatrix(['view']) });
    await renderAt('/m/fleet/settings');
    expect((await screen.findByLabelText('Max age') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
  });

  it('module without settings or lookups -> single Settings view with "no settings" message', async () => {
    serve();
    await renderAt('/m/crm/setup');
    expect(await screen.findByText('This module has no settings.')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('settings PUT error -> error toast', async () => {
    serve({ hook: (m, p) => (m === 'PUT' && p === '/m/fleet/settings' ? [403, { error: 'Forbidden' }] : undefined) });
    await renderAt('/m/fleet/settings');
    await screen.findByLabelText('Max age');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(toastsOf('error').join(' ')).toContain('Forbidden'));
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('CalendarPage', () => {
  const EVENTS = [
    { id: 'e1', title: 'Service Tata Ace', date: '2026-11-10', module: 'fleet', entity: 'fleet_vehicles' },
    { id: 'e2', title: 'CRM followup', date: '2026-11-10', module: 'crm', entity: 'crm_prospects' },
  ];
  const calGets = (srv: ReturnType<typeof serve>) => calls(srv, 'GET', '/calendar').map(c => c.path);
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 22, 12)); });

  it('requests the visible 6-week grid of the current month; prev/next re-request with new from/to', async () => {
    const srv = serve({ events: EVENTS });
    await renderAt('/m/fleet/cal');
    expect(screen.getByText('November 2026')).toBeTruthy();
    await waitFor(() => expect(calGets(srv)).toEqual(['/calendar?from=2026-11-01&to=2026-12-12']));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText('December 2026')).toBeTruthy();
    await waitFor(() => expect(calGets(srv)).toContain('/calendar?from=2026-11-29&to=2027-01-09'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('October 2026')).toBeTruthy();
    await waitFor(() => expect(calGets(srv)).toContain('/calendar?from=2026-09-27&to=2026-11-07'));
    expect(main().querySelectorAll('.cal-cell')).toHaveLength(42);
  });

  it('module calendar shows only that module\'s events', async () => {
    serve({ events: EVENTS });
    await renderAt('/m/fleet/cal');
    expect(await screen.findByText('Service Tata Ace')).toBeTruthy();
    expect(screen.queryByText('CRM followup')).toBeNull();
  });

  it('more than 3 events on a day -> 3 shown + "+N more"', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, title: `Ev ${i}`, date: '2026-11-12', module: 'fleet', entity: 'fleet_vehicles' }));
    serve({ events: many });
    await renderAt('/m/fleet/cal');
    expect(await screen.findByText('+2 more')).toBeTruthy();
    expect(main().querySelectorAll('.cal-event')).toHaveLength(3);
  });

  it('event click navigates to the module table page of its entity', async () => {
    serve({ events: EVENTS });
    await renderAt('/m/fleet/cal');
    fireEvent.click(await screen.findByText('Service Tata Ace'));
    await waitFor(() => expect(h1()).toBe('Vehicles'));
  });

  it('calendar error -> error toast, grid still rendered', async () => {
    serve({ hook: (m, p) => (p.startsWith('/calendar') ? [500, { error: 'Cal down' }] : undefined) });
    await renderAt('/m/fleet/cal');
    await waitFor(() => expect(toastsOf('error').join(' ')).toContain('Cal down'));
    expect(main().querySelectorAll('.cal-cell')).toHaveLength(42);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Sidebar (registry tree, ADR-9 / §10.4)', () => {
  it('groups -> modules for m:view only (m:hr hidden); groups in registry order; Admin hidden for staff', async () => {
    serve();
    await renderAt('/roles');
    expect(branches()).toEqual(['Real Estate', 'Fleet', 'CRM Desk']);
    expect(Array.from(navEl().querySelectorAll('.nav-title')).map(t => t.textContent)).toEqual(['Operations', 'Sales & CRM']);
    expect(navLinks()[0]).toBe('Dashboard');
    expect(navLinks()).toContain('Real Estate Dashboard');
    expect(within(navEl()).getByRole('link', { name: 'Real Estate Dashboard' }).getAttribute('href')).toBe('/real-estate');
    expect(within(navEl()).getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/');
    expect(navLinks()[navLinks().length - 1]).toBe('All Roles');
  });

  it('client (no m:* view) sees no module branches', async () => {
    serve({ role: 'client', matrix: DEFAULT_PERMISSIONS });
    await renderAt('/roles');
    expect(branches()).toEqual(['Real Estate']);
    expect(navEl().querySelectorAll('.nav-title')).toHaveLength(0);
  });

  it('expanding a module shows its non-lookup pages; lookup table pages are hidden', async () => {
    serve();
    await renderAt('/roles');
    expect(navLinks()).not.toContain('Vehicles');
    fireEvent.click(branch('Fleet')!);
    expect(branch('Fleet')!.getAttribute('aria-expanded')).toBe('true');
    const kids = within(branch('Fleet')!.parentElement!).getAllByRole('link');
    expect(kids.map(a => a.textContent!.trim())).toEqual(['Overview', 'Vehicles', 'Reports', 'Setup', 'Calendar', 'About', 'Broken']);
    expect(kids[1].getAttribute('href')).toBe('/m/fleet/vehicles');
  });

  it('expanded state persists in localStorage rp_nav_open and survives a remount', async () => {
    serve();
    await renderAt('/roles');
    fireEvent.click(branch('Fleet')!);
    expect(JSON.parse(localStorage.getItem('rp_nav_open')!)).toMatchObject({ fleet: true });
    cleanup();
    serve();
    await renderAt('/roles');
    expect(branch('Fleet')!.getAttribute('aria-expanded')).toBe('true');
    expect(navLinks()).toContain('Vehicles');
    fireEvent.click(branch('Fleet')!); // collapse persists too
    expect(JSON.parse(localStorage.getItem('rp_nav_open')!)).toMatchObject({ fleet: false });
  });

  it('collapsing Real Estate persists (default open)', async () => {
    serve();
    await renderAt('/m/crm/prospects');
    expect(branch('Real Estate')!.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(branch('Real Estate')!);
    expect(navLinks()).not.toContain('Real Estate Dashboard');
    cleanup();
    serve();
    await renderAt('/m/crm/prospects');
    expect(branch('Real Estate')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('localStorage throwing (getItem/setItem for rp_nav_open) does not break the sidebar', async () => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) { if (k === 'rp_nav_open') throw new Error('denied'); return get.call(this, k); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) { if (k === 'rp_nav_open') throw new Error('quota'); return set.call(this, k, v); });
    serve();
    await renderAt('/roles');
    expect(branch('Real Estate')!.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(branch('Fleet')!);
    expect(branch('Fleet')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('corrupt JSON in rp_nav_open falls back to defaults', async () => {
    serve();
    localStorage.setItem('rp_nav_open', '{not json');
    await renderAt('/roles');
    expect(branch('Real Estate')!.getAttribute('aria-expanded')).toBe('true');
    expect(branch('Fleet')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('current module auto-expands and its page link is active', async () => {
    serve();
    await renderAt('/m/fleet/vehicles');
    expect(branch('Fleet')!.getAttribute('aria-expanded')).toBe('true');
    expect(branch('CRM Desk')!.getAttribute('aria-expanded')).toBe('false');
    const link = within(navEl()).getByRole('link', { name: 'Vehicles' });
    expect(link.className).toContain('active');
  });

  it('filter by page label narrows to matching pages only; RE/Dashboard hidden; All Roles stays', async () => {
    serve();
    await renderAt('/roles');
    fireEvent.change(screen.getByLabelText('Filter menu'), { target: { value: 'veh' } });
    expect(branches()).toEqual(['Fleet']);
    expect(navLinks()).toEqual(['Vehicles', 'All Roles']);
  });

  it('filter by module label shows all its pages; by group label shows its modules', async () => {
    serve();
    await renderAt('/roles');
    const box = screen.getByLabelText('Filter menu');
    fireEvent.change(box, { target: { value: 'crm desk' } });
    expect(branches()).toEqual(['CRM Desk']);
    expect(navLinks()).toEqual(['Prospects', 'Setup', 'All Roles']);
    fireEvent.change(box, { target: { value: 'OPERATIONS' } });
    expect(branches()).toEqual(['Fleet']);
    expect(navLinks()).toContain('About');
  });

  it('filter is case-insensitive and trims; no match leaves only All Roles; clearing restores', async () => {
    serve();
    await renderAt('/roles');
    const box = screen.getByLabelText('Filter menu');
    fireEvent.change(box, { target: { value: '   zzzz  ' } });
    expect(branches()).toEqual([]);
    expect(navLinks()).toEqual(['All Roles']);
    fireEvent.change(box, { target: { value: '  ' } });
    expect(branches()).toEqual(['Real Estate', 'Fleet', 'CRM Desk']);
  });

  it('filter never reveals modules without m:view (hr)', async () => {
    serve();
    await renderAt('/roles');
    fireEvent.change(screen.getByLabelText('Filter menu'), { target: { value: 'directory' } });
    expect(branches()).toEqual([]);
  });
});

describe('moduleUtil.iconFor (explicit map, Boxes fallback)', () => {
  it('known name -> its icon; unknown / prototype keys -> Boxes', () => {
    expect(iconFor('Truck')).toBe(Truck);
    expect(iconFor('NoSuchIcon')).toBe(Boxes);
    expect(iconFor('')).toBe(Boxes);
    expect(iconFor('constructor')).toBe(Boxes);
    expect(iconFor('toString')).toBe(Boxes);
  });
});
